/*
 * Google Sheets 角色卡同步模組
 * 檔名：googleSheets.js
 *
 * 使用方式：
 * 1. 將本檔案放在 index.html 同一資料夾。
 * 2. 在 index.html 的 app.js script 標籤後面加入：
 *    <script src="googleSheets.js"></script>
 * 3. 將 Google 試算表一般共用連結貼到原本的「外部連結」欄位。
 *
 * 本模組不修改 app.js / zip.js。
 * 讀取 Google Sheets 時使用跨來源 script JSONP，不使用 fetch CORS。
 * 預設尋找「人物卡」分頁中的 CCFOLIA 角色 JSON。
 */
(function () {
  'use strict';

  const SHEET_NAME = '人物卡';
  const POLL_INTERVAL_MS = 30 * 1000; // 每 30 秒檢查一次，讓試算表更新更快被發現。
  const REQUEST_TIMEOUT_MS = 15000;
  const INPUT_DEBOUNCE_MS = 900;

  let debounceTimer = null;
  let pollTimer = null;
  let currentRequestId = 0;
  let lastDeclinedFingerprint = '';
  let lastAppliedFingerprint = '';
  let importRefreshPending = false;
  let importRefreshTimer = null;
  let importWatchdogTimer = null;
  const inFlightUrls = new Set();

  function getElement(id) {
    return document.getElementById(id);
  }

  function notify(message) {
    if (typeof window.toast === 'function') {
      window.toast(message);
      return;
    }

    const toastElement = getElement('toast');
    if (toastElement) {
      toastElement.textContent = message;
      toastElement.classList.add('show');
      window.setTimeout(() => toastElement.classList.remove('show'), 3000);
      return;
    }

    console.info('[Google Sheets 同步]', message);
  }

  function extractSpreadsheetInfo(rawUrl) {
    let url;

    try {
      url = new URL(String(rawUrl || '').trim());
    } catch (_) {
      return null;
    }

    if (!/(^|\.)docs\.google\.com$/i.test(url.hostname)) {
      return null;
    }

    const match = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (!match) return null;

    return {
      id: match[1],
      gid: url.searchParams.get('gid') || '',
      originalUrl: String(rawUrl).trim()
    };
  }

  function jsonpGoogleSheet(url) {
    return new Promise((resolve, reject) => {
      const oldGoogle = window.google;
      const createdGoogle = !oldGoogle;

      if (!window.google) window.google = {};
      if (!window.google.visualization) window.google.visualization = {};
      if (!window.google.visualization.Query) window.google.visualization.Query = {};

      const queryObject = window.google.visualization.Query;
      const oldHandler = queryObject.setResponse;
      let finished = false;
      let script = null;
      let timeoutId = null;

      function cleanup() {
        if (finished) return;
        finished = true;

        if (timeoutId) window.clearTimeout(timeoutId);
        if (script && script.parentNode) script.parentNode.removeChild(script);

        if (oldHandler === undefined) {
          try {
            delete queryObject.setResponse;
          } catch (_) {
            queryObject.setResponse = undefined;
          }
        } else {
          queryObject.setResponse = oldHandler;
        }

        if (createdGoogle && window.google &&
            window.google.visualization &&
            Object.keys(window.google.visualization).length === 0) {
          delete window.google.visualization;
        }
        if (createdGoogle && window.google &&
            Object.keys(window.google).length === 0) {
          delete window.google;
        }
      }

      queryObject.setResponse = function (response) {
        cleanup();

        if (!response || response.status === 'error') {
          const reason = response && response.errors && response.errors[0]
            ? (response.errors[0].detailed_message ||
               response.errors[0].message ||
               response.errors[0].reason)
            : '';
          reject(new Error(reason || 'Google 試算表沒有回傳可讀取的資料。'));
          return;
        }

        if (!response.table || !Array.isArray(response.table.rows)) {
          reject(new Error('Google 試算表回傳格式不完整。'));
          return;
        }

        resolve(response);
      };

      script = document.createElement('script');
      script.async = true;
      script.src = url;
      script.onerror = function () {
        cleanup();
        reject(new Error('無法載入 Google 試算表。請確認共用權限與網路連線。'));
      };

      timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('讀取 Google 試算表逾時。'));
      }, REQUEST_TIMEOUT_MS);

      document.head.appendChild(script);
    });
  }

  function makeQueryUrls(info) {
    const base = 'https://docs.google.com/spreadsheets/d/' +
      encodeURIComponent(info.id) + '/gviz/tq?tqx=out:json';

    const urls = [];
    // 每次讀取加上不同參數，降低瀏覽器／中介快取回傳舊試算表內容的機率。
    const cacheBust = '&_gs_sync=' + Date.now();
    if (info.gid) {
      urls.push(base + '&gid=' + encodeURIComponent(info.gid) + cacheBust);
    }
    urls.push(base + '&sheet=' + encodeURIComponent(SHEET_NAME) + cacheBust);

    return [...new Set(urls)];
  }

  function parseCharacterCandidate(value) {
    if (value == null) return null;

    let text = typeof value === 'string' ? value.trim() : '';
    let parsed = null;

    if (typeof value === 'object') {
      parsed = value;
    } else if (text) {
      const attempts = [text];

      // 支援試算表儲存成字串或 CSV/試算表雙引號格式的 JSON。
      if (text.startsWith('"') && text.endsWith('"')) {
        attempts.push(text.slice(1, -1).replace(/""/g, '"'));
      }
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        attempts.push(text.slice(firstBrace, lastBrace + 1));
      }

      for (const candidate of attempts) {
        try {
          parsed = JSON.parse(candidate);
          if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (_) {}
          }
          if (parsed && typeof parsed === 'object') break;
        } catch (_) {
          parsed = null;
        }
      }
    }

    if (!parsed || typeof parsed !== 'object') return null;

    // 優先接受 CCFOLIA 標準包裝格式，也兼容直接角色物件。
    const data = parsed.kind === 'character' && parsed.data
      ? parsed.data
      : (parsed.data && typeof parsed.data === 'object'
          ? parsed.data
          : parsed);

    if (!data || typeof data !== 'object') return null;
    if (parsed.kind === 'character' || typeof data.name === 'string' ||
        Array.isArray(data.status) || Array.isArray(data.params)) {
      return parsed.kind === 'character'
        ? parsed
        : { kind: 'character', data: data };
    }

    return null;
  }

  function findCharacterJSON(response) {
    const rows = response && response.table && Array.isArray(response.table.rows)
      ? response.table.rows
      : [];

    for (const row of rows) {
      const cells = row && Array.isArray(row.c) ? row.c : [];

      // 先維持原本行為：若整份角色 JSON 已在單一儲存格，直接讀取。
      for (const cell of cells) {
        if (!cell) continue;
        for (const candidate of [cell.v, cell.f]) {
          const character = parseCharacterCandidate(candidate);
          if (character) return character;
        }
      }

      // 此試算表會把角色 JSON 拆成相鄰多個儲存格（例如 name、initiative、status、commands、memo）。
      // 將從 JSON 開頭開始的連續片段逐格串接，直到形成完整角色 JSON，避免完全讀不到或讀到舊資料。
      for (let start = 0; start < cells.length; start++) {
        const firstCell = cells[start];
        if (!firstCell) continue;
        const firstValue = firstCell.v !== undefined && firstCell.v !== null
          ? firstCell.v : firstCell.f;
        const firstText = typeof firstValue === 'string' ? firstValue.trim() : '';
        if (!firstText.startsWith('{') || !firstText.includes('"kind":"character"')) continue;

        let combined = '';
        for (let end = start; end < Math.min(cells.length, start + 16); end++) {
          const cell = cells[end];
          const value = cell && cell.v !== undefined && cell.v !== null ? cell.v : (cell ? cell.f : '');
          if (value !== undefined && value !== null) combined += String(value);
          const character = parseCharacterCandidate(combined);
          if (character) return character;

          // 試算表的 JSON 模板偶爾會把空白行動順序輸出成 "initiative":,，補成 null 後再解析。
          // 只修復這個已知空欄位，不改動其他 JSON 內容。
          const repaired = combined.replace(/("initiative"\s*:\s*),(?=\s*")/g, '$1null,');
          const repairedCharacter = parseCharacterCandidate(repaired);
          if (repairedCharacter) return repairedCharacter;
        }
      }
    }

    return null;
  }

  let lastCharacterSheetResponse = null;

  // 基礎數值標籤；幸運更新 Status，智力以試算表「靈感」數值為準。
  const BASE_ATTRIBUTE_LABELS = ['力量', '敏捷', '意志', '體質', '外貌', '教育', '體型', '智力', '幸運', '靈感'];

  function sheetCellValue(cell) {
    if (!cell) return '';
    const value = cell.v !== undefined && cell.v !== null ? cell.v : cell.f;
    return value === undefined || value === null ? '' : value;
  }

  function sheetNumericValue(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
    const text = String(value == null ? '' : value).trim().replace(/[,，]/g, '');
    if (!/^\d+(?:\.\d+)?$/.test(text)) return null;
    const number = Number(text);
    return Number.isFinite(number) ? Math.floor(number) : null;
  }

  function readBaseAttributes(response) {
    const values = {};
    const rows = response && response.table && Array.isArray(response.table.rows)
      ? response.table.rows : [];

    // 依照這份試算表的實際座標讀取，避免在同名標籤／初始值附近抓錯欄位。
    // Google Visualization 會把第 5 列的欄名當成表頭排除，因此 response.table.rows[0] 對應試算表第 6 列。
    // S6:S13 對應回傳資料列索引 0–7，欄 S = 索引 18。
    const fixedCells = {
      '力量': { row: 0, col: 18 },
      '敏捷': { row: 1, col: 18 },
      '意志': { row: 2, col: 18 },
      '體質': { row: 3, col: 18 },
      '外貌': { row: 4, col: 18 },
      '教育': { row: 5, col: 18 }, // 後續由「知識」的 YZ10 最終值覆蓋
      '體型': { row: 6, col: 18 },
      '智力': { row: 7, col: 18 },
      '幸運': { row: 8, col: 16 } // Q14；幸運欄沒有 S 欄的最終值格式
    };

    function valueAt(rowIndex, colIndex) {
      const row = rows[rowIndex];
      const cells = row && Array.isArray(row.c) ? row.c : [];
      return sheetNumericValue(sheetCellValue(cells[colIndex]));
    }

    for (const [label, cell] of Object.entries(fixedCells)) {
      const number = valueAt(cell.row, cell.col);
      if (number !== null) values[label] = number;
    }

    // 「靈感」與「知識」位於 YZ 合併儲存格：合併值實際由 Y 欄提供。
    // YZ9 = 靈感（比先前讀取位置往上一列）；YZ10 = 知識，作為「教育」檢定值。
    let inspiration = valueAt(3, 24); // Y9；回傳資料列索引 3
    if (inspiration === null) inspiration = valueAt(3, 25); // 若合併值在 Z9，回退讀取 Z9
    if (inspiration !== null) {
      values['靈感'] = inspiration;
      // CCFOLIA 常用對話表的「智力」檢定值對應試算表 Y9「靈感」，
      // 因此必須覆蓋上方 S13 的智力值，讓智力指令實際更新。
      values['智力'] = inspiration;
    }

    let knowledge = valueAt(4, 24); // Y10；回傳資料列索引 4
    if (knowledge === null) knowledge = valueAt(4, 25); // 若資料源將合併值放在 Z10，則回退讀取 Z10
    if (knowledge !== null) values['教育'] = knowledge;

    return values;
  }

  // 將試算表的基礎檢定值套回最終合併結果。
  // 只替換對應的檢定行，保留本機常用對話表的其他指令，避免整段 commands 被後續 JSON 合併覆蓋。
  function syncBaseCommandLines(targetData, sourceData, response) {
    if (!targetData || !sourceData || typeof targetData.commands !== 'string' ||
        typeof sourceData.commands !== 'string') return;

    const labels = BASE_ATTRIBUTE_LABELS.filter(label => label !== '幸運');
    const fixedValues = response ? readBaseAttributes(response) : {};
    let targetCommands = targetData.commands;
    for (const label of labels) {
      if (fixedValues[label] !== undefined) {
        const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const fixedPattern = new RegExp('^CC<=[^\r\n]*\\s+' + escapedLabel + '\\s*$', 'm');
        if (fixedPattern.test(targetCommands)) {
          targetCommands = targetCommands.replace(fixedPattern, 'CC<=' + fixedValues[label] + ' ' + label);
          continue;
        }
      }
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linePattern = new RegExp('^CC<=[^\r\n]*\\s+' + escaped + '\\s*$', 'm');
      const sourceLine = sourceData.commands.split(/\r?\n/).find(line => linePattern.test(line));
      if (!sourceLine) continue;
      const targetPattern = new RegExp('^CC<=[^\r\n]*\\s+' + escaped + '\\s*$', 'm');
      if (targetPattern.test(targetCommands)) {
        targetCommands = targetCommands.replace(targetPattern, sourceLine);
      }
    }
    targetData.commands = targetCommands;
  }

  // 智力檢定固定以試算表 Y9「靈感」為準；即使其他欄位沒有差異，仍確保本機智力指令同步。
  function syncIntelligenceFromInspiration(targetCharacter, response) {
    const data = targetCharacter && targetCharacter.kind === 'character' && targetCharacter.data
      ? targetCharacter.data
      : (targetCharacter && targetCharacter.data && typeof targetCharacter.data === 'object' ? targetCharacter.data : targetCharacter);
    if (!data || typeof data.commands !== 'string' || !response) return false;

    const values = readBaseAttributes(response);
    const inspiration = values['靈感'];
    if (inspiration === undefined) return false;

    const pattern = /^\s*CC\s*<=\s*[^\r\n]*?\s+智力\s*$/m;
    if (!pattern.test(data.commands)) return false;
    const updatedCommands = data.commands.replace(pattern, 'CC<=' + inspiration + ' 智力');
    const changed = updatedCommands !== data.commands;
    data.commands = updatedCommands;
    return changed;
  }

  function syncBaseAttributesOnly(character, response) {
    const data = character && character.kind === 'character' && character.data
      ? character.data
      : (character && character.data && typeof character.data === 'object' ? character.data : character);
    if (!data || typeof data !== 'object') return character;

    const values = readBaseAttributes(response);
    if (typeof data.commands === 'string') {
      let commands = data.commands;
      for (const label of BASE_ATTRIBUTE_LABELS) {
        if (label === '幸運' || values[label] === undefined) continue;
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp('^CC<=.*?\\s+' + escaped + '\\s*$', 'm');
        commands = commands.replace(pattern, 'CC<=' + values[label] + ' ' + label);
      }
      data.commands = commands;
    }

    if (values['幸運'] !== undefined && Array.isArray(data.status)) {
      const luck = data.status.find(item => item && String(item.label || '').trim() === '幸運');
      if (luck) {
        luck.value = values['幸運'];
        luck.max = values['幸運'];
      }
    }

    return character;
  }

  async function readCharacterFromSheet(info) {
    let lastError = null;

    for (const queryUrl of makeQueryUrls(info)) {
      try {
        const response = await jsonpGoogleSheet(queryUrl);
        const character = findCharacterJSON(response);
        if (character) {
          lastCharacterSheetResponse = response;
          return syncBaseAttributesOnly(character, response);
        }
        lastError = new Error(
          '已連線到試算表，但在「' + SHEET_NAME +
          '」分頁找不到完整的 CCFOLIA 角色 JSON。'
        );
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('找不到可匯入的角色 JSON。');
  }

  function unwrapCharacter(obj) {
    if (!obj || typeof obj !== 'object') {
      throw new Error('讀取到的內容不是有效的角色 JSON。');
    }

    const data = obj.kind === 'character' && obj.data
      ? obj.data
      : (obj.data && typeof obj.data === 'object' ? obj.data : obj);

    if (!data || typeof data !== 'object' ||
        (!data.name && !Array.isArray(data.status) && !Array.isArray(data.params))) {
      throw new Error('JSON 格式不像 CCFOLIA 角色卡。');
    }

    return data;
  }

  function stableStringify(value) {
    if (Array.isArray(value)) {
      return '[' + value.map(stableStringify).join(',') + ']';
    }

    if (value && typeof value === 'object') {
      const keys = Object.keys(value)
        .filter(key => key !== 'externalUrl')
        .sort();

      return '{' + keys.map(key =>
        JSON.stringify(key) + ':' + stableStringify(value[key])
      ).join(',') + '}';
    }

    return JSON.stringify(value);
  }

  function fingerprint(obj) {
    return stableStringify(unwrapCharacter(obj));
  }

  function getCurrentCharacter() {
    if (typeof window.generate === 'function') {
      window.generate();
    }

    const output = getElement('output');
    if (!output || !output.value.trim()) {
      throw new Error('找不到目前的角色 JSON 輸出欄位。');
    }

    return JSON.parse(output.value);
  }

  // 這些欄位以目前本機檔案／表單為準，不接受試算表覆蓋。
  // 注意：status（數值狀態列）與 params（固定屬性）可同步；
  // active/secret/invisible/hideStatus 才是底部的勾選框設定。
  const LOCAL_ONLY_FIELDS = new Set([
    'iconUrl',       // 主圖片
    'faces',         // 差分名稱與差分圖片關聯
    'color',         // 角色顏色
    'active',        // 底部勾選框：啟用
    'secret',        // 底部勾選框：不公開角色狀態
    'invisible',     // 底部勾選框：發言時不顯示立繪
    'hideStatus'     // 底部勾選框：不在角色清單顯示
  ]);

  const FIELD_LABELS = {
    name: '角色名稱',
    initiative: '行動順序',
    status: '變動屬性（Status）',
    params: '固定屬性（Params）',
    commands: '常用對話表',
    label: '屬性名稱',
    value: '數值／內容',
    max: '最大值',
    command: '指令內容',
    text: '文字內容',
    title: '標題'
  };

  function displayValue(value) {
    if (value === undefined) return '（未設定）';
    if (value === null) return 'null';
    let text;
    try {
      text = typeof value === 'string' ? value : JSON.stringify(value);
    } catch (_) {
      text = String(value);
    }
    if (text.length > 180) text = text.slice(0, 177) + '...';
    return text.replace(/\n/g, ' ↵ ');
  }

  function comparisonText(value) {
    if (value === undefined) return '（未設定）';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value); } catch (_) { return String(value); }
  }

  // 僅供「常用對話表以外」的欄位使用：空值不顯示佔位文字，物件不直接輸出 JSON 原型。
  function isBlankOtherFieldValue(value) {
    return value === undefined || value === null ||
      (typeof value === 'string' && value.trim() === '');
  }

  function readableOtherFieldValue(value) {
    if (isBlankOtherFieldValue(value)) return '';
    if (Array.isArray(value)) {
      return value.map(readableOtherFieldValue).filter(Boolean).join('、');
    }
    if (typeof value !== 'object') return String(value);

    const nameKey = ['label', 'name', 'title', 'text', 'command', 'key', 'id']
      .find(key => !isBlankOtherFieldValue(value[key]));
    const hasValue = Object.prototype.hasOwnProperty.call(value, 'value') &&
      !isBlankOtherFieldValue(value.value);
    const hasMax = Object.prototype.hasOwnProperty.call(value, 'max') &&
      !isBlankOtherFieldValue(value.max);

    if (nameKey && (hasValue || hasMax)) {
      const name = readableOtherFieldValue(value[nameKey]);
      const current = hasValue ? readableOtherFieldValue(value.value) : '';
      const max = hasMax ? readableOtherFieldValue(value.max) : '';
      const amount = current && max ? current + ' / ' + max : current || max;
      return name ? name + '：' + amount : amount;
    }
    if (nameKey) return readableOtherFieldValue(value[nameKey]);
    if (hasValue) return readableOtherFieldValue(value.value);
    if (hasMax) return readableOtherFieldValue(value.max);

    // 只顯示實際內容，不顯示 JSON 的變數名稱或大括號。
    return Object.values(value).map(readableOtherFieldValue).filter(Boolean).join('、');
  }

  function appendOtherFieldDiff(container, change, side) {
    const target = side === 'before' ? change.before : change.incoming;
    if (isBlankOtherFieldValue(target)) return;

    const status = getChangeStatus(change);
    const changeType = status.label === '新增' ? 'add' : status.label === '刪除' ? 'delete' : 'edit';
    const other = side === 'before' ? change.incoming : change.before;

    if (changeType !== 'edit' || (typeof target === 'object' && target !== null) ||
        (typeof other === 'object' && other !== null)) {
      const span = document.createElement('span');
      span.className = 'gs-diff-changed gs-diff-text-' + changeType;
      span.textContent = readableOtherFieldValue(target);
      container.appendChild(span);
      return;
    }

    // 同一欄位的內容／名稱修改以橘色標示；共用的字元仍維持一般文字顏色。
    appendInlineDiff(container, change.before, change.incoming, side, 'gs-diff-text-edit');
  }

  // 以字元差異標紅真正不同的片段；相同文字維持一般文字顏色。
  // 超長內容改用整段標示，避免差異演算法拖慢頁面。
  // 以 LCS 對齊相同字元，只把目標文字中未匹配的字元標紅。
  // 特別注意：略過另一側的字元時不可重複輸出目標字元，避免 60→70 顯示成 600／700。
  function appendInlineDiff(container, leftValue, rightValue, side, changedClass) {
    const left = comparisonText(leftValue);
    const right = comparisonText(rightValue);
    const target = side === 'before' ? left : right;
    const other = side === 'before' ? right : left;

    const addText = (text, changed) => {
      if (!text) return;
      if (changed) {
        const span = document.createElement('span');
        span.className = 'gs-diff-changed' + (changedClass ? ' ' + changedClass : '');
        span.textContent = text;
        container.appendChild(span);
      } else {
        container.appendChild(document.createTextNode(text));
      }
    };

    if (target === other) {
      addText(target, false);
      return;
    }
    if (target.length * other.length > 90000 || Math.max(target.length, other.length) > 900) {
      addText(target, true);
      return;
    }

    const rows = target.length + 1;
    const cols = other.length + 1;
    const dp = Array.from({ length: rows }, () => new Uint16Array(cols));
    for (let i = target.length - 1; i >= 0; i--) {
      for (let j = other.length - 1; j >= 0; j--) {
        dp[i][j] = target[i] === other[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    let i = 0, j = 0, run = '', runChanged = null;
    const flush = () => {
      if (run) addText(run, runChanged);
      run = '';
    };
    const push = (char, changed) => {
      if (runChanged !== changed) {
        flush();
        runChanged = changed;
      }
      run += char;
    };

    while (i < target.length) {
      if (j < other.length && target[i] === other[j]) {
        push(target[i], false);
        i++;
        j++;
      } else if (j < other.length && dp[i][j + 1] > dp[i + 1][j]) {
        // 這是另一側新增的字元；不輸出 target[i]，避免產生重複字元。
        j++;
      } else {
        push(target[i], true);
        i++;
      }
    }
    flush();
  }

  function valuesEqual(a, b) {
    return stableStringify(a) === stableStringify(b);
  }

  // 常用對話表通常是多行文字：先以整行對齊，再對被替換的行做字元級比對。
  // 這樣只改一行時，其他完全相同的行不會一起變紅。
  function appendCommandsDiff(container, beforeValue, incomingValue, side) {
    const beforeText = comparisonText(beforeValue);
    const incomingText = comparisonText(incomingValue);
    const targetText = side === 'before' ? beforeText : incomingText;
    const otherText = side === 'before' ? incomingText : beforeText;
    const targetLines = targetText.split('\n');
    const otherLines = otherText.split('\n');

    if (targetText === otherText) {
      container.appendChild(document.createTextNode(targetText));
      return;
    }

    // 技能指令以「技能名稱」作為唯一比對依據，不依行號或數值配對。
    // 同名但數值不同：兩側都標橘色；原本有、更新後沒有：原本側紅色；
    // 更新後有、原本沒有：更新側綠色。英文大小寫不同視為不同名稱。
    const normalizeSkillName = value => String(value || '')
      .normalize('NFKC')
      .replace(/\s+/g, ' ')
      .trim();
    const parseSkillCommand = line => {
      const match = String(line || '').match(/^\s*CC\s*<=\s*([-+]?\d+(?:\.\d+)?)\s+(.+?)\s*$/i);
      return match ? { number: match[1], name: normalizeSkillName(match[2]) } : null;
    };
    const beforeSkillRows = beforeText.split('\n').map(line => ({ line, skill: parseSkillCommand(line) }));
    const incomingSkillRows = incomingText.split('\n').map(line => ({ line, skill: parseSkillCommand(line) }));
    const beforeSkills = beforeSkillRows.filter(row => row.skill);
    const incomingSkills = incomingSkillRows.filter(row => row.skill);

    // 只要兩側都有技能指令，就逐行以名稱比對技能；即使對話表混有普通文字，
    // 也不會因為一行非技能文字令整份技能清單退回「按位置」比對。
    if (beforeSkills.length > 0 && incomingSkills.length > 0) {
      const buildSkillMap = rows => {
        const map = new Map();
        rows.forEach(row => {
          const name = row.skill.name; // 刻意保留大小寫：History 與 history 是不同名稱。
          if (!map.has(name)) map.set(name, []);
          map.get(name).push(row.line.trim());
        });
        return map;
      };
      const beforeByName = buildSkillMap(beforeSkills);
      const incomingByName = buildSkillMap(incomingSkills);
      const targetRows = side === 'before' ? beforeSkillRows : incomingSkillRows;
      const targetByName = side === 'before' ? beforeByName : incomingByName;
      const otherByName = side === 'before' ? incomingByName : beforeByName;
      const otherExactLines = new Set((side === 'before' ? incomingText : beforeText).split('\n').map(line => line.trim()));
      const emittedNameCounts = new Map();

      targetRows.forEach((row, index) => {
        if (index > 0) container.appendChild(document.createTextNode('\n'));
        const line = row.line;
        if (!line.trim()) return;

        let changeType = 'same';
        if (row.skill) {
          const name = row.skill.name;
          const count = emittedNameCounts.get(name) || 0;
          emittedNameCounts.set(name, count + 1);
          const otherLines = otherByName.get(name) || [];
          if (count >= otherLines.length) {
            changeType = side === 'before' ? 'delete' : 'add';
          } else {
            const otherLine = otherLines[count];
            if (otherLine !== line.trim()) changeType = 'edit';
          }
        } else if (!otherExactLines.has(line.trim())) {
          // 非技能文字不套用技能名稱規則；原樣相同才視為未變動。
          changeType = side === 'before' ? 'delete' : 'add';
        }

        if (changeType === 'same') {
          container.appendChild(document.createTextNode(line));
        } else {
          const span = document.createElement('span');
          span.className = 'gs-diff-line-changed gs-diff-text-' + changeType;
          span.textContent = line;
          container.appendChild(span);
        }
      });
      return;
    }

    if (targetLines.length * otherLines.length > 40000) {
      appendInlineDiff(container, beforeValue, incomingValue, side);
      return;
    }

    const rows = targetLines.length + 1;
    const cols = otherLines.length + 1;
    const dp = Array.from({ length: rows }, () => new Uint32Array(cols));
    for (let i = targetLines.length - 1; i >= 0; i--) {
      for (let j = otherLines.length - 1; j >= 0; j--) {
        dp[i][j] = targetLines[i] === otherLines[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    // 找出完全相同的行作為錨點；兩個錨點之間的行視為修改區塊，逐行比字。
    const anchors = [];
    let i = 0, j = 0;
    while (i < targetLines.length && j < otherLines.length) {
      if (targetLines[i] === otherLines[j]) {
        anchors.push([i, j]); i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        i++;
      } else {
        j++;
      }
    }

    const addLine = (line, otherLine, changeType) => {
      // 常用對話表整行標示，但只改文字顏色、不加背景色。
      if (changeType === 'same' || (changeType === 'paired' && line === otherLine)) {
        container.appendChild(document.createTextNode(line));
        return;
      }

      const span = document.createElement('span');
      span.className = 'gs-diff-line-changed gs-diff-text-' + changeType;
      span.textContent = line;
      container.appendChild(span);
    };
    const addBlock = (tStart, tEnd, oStart, oEnd) => {
      const tCount = tEnd - tStart;
      const oCount = oEnd - oStart;

      // 區塊行數不同代表其中有整行新增／刪除；不要把不相干的行硬配對做字元比較。
      // 這樣像「CC<=生物學」這種整行被刪除時，會整行標紅，而不是只紅到另一行碰巧相同的字元。
      if (tCount !== oCount) {
        for (let k = 0; k < tCount; k++) {
          const targetIndex = tStart + k;
          addLine(targetLines[targetIndex], '', side === 'before' ? 'delete' : 'add');
          if (targetIndex < targetLines.length - 1) {
            container.appendChild(document.createTextNode('\n'));
          }
        }
        return;
      }

      const paired = Math.min(tCount, oCount);
      for (let k = 0; k < paired; k++) {
        const targetIndex = tStart + k;
        addLine(targetLines[targetIndex], otherLines[oStart + k], targetLines[targetIndex] === otherLines[oStart + k] ? 'same' : 'edit');
        if (targetIndex < targetLines.length - 1) {
          container.appendChild(document.createTextNode('\n'));
        }
      }
      for (let k = paired; k < tCount; k++) {
        const targetIndex = tStart + k;
        addLine(targetLines[targetIndex], '', side === 'before' ? 'delete' : 'add');
        if (targetIndex < targetLines.length - 1) {
          container.appendChild(document.createTextNode('\n'));
        }
      }
    };

    let tPos = 0, oPos = 0;
    for (const [tAnchor, oAnchor] of anchors) {
      addBlock(tPos, tAnchor, oPos, oAnchor);
      container.appendChild(document.createTextNode(targetLines[tAnchor]));
      if (tAnchor < targetLines.length - 1) {
        container.appendChild(document.createTextNode('\n'));
      }
      tPos = tAnchor + 1;
      oPos = oAnchor + 1;
    }
    addBlock(tPos, targetLines.length, oPos, otherLines.length);
    // 若原始內容結尾有換行，split 產生的最後一個空行會由上面的區塊保留。
  }


  function pathLabel(path, currentRoot, remoteRoot, change) {
    if (!path.length) return '角色資料';
    const first = String(path[0]);
    let label = FIELD_LABELS[first] || first;

    // Status、固定屬性、常用對話等清單，優先顯示該列自己的名稱，
    // 避免只看到「#1、#2」而不知道是哪個狀態或指令。
    for (let i = 1; i < path.length; i++) {
      const part = path[i];
      if (typeof part === 'number') {
        const parentPath = path.slice(0, i);
        const beforeList = getAtPath(currentRoot, parentPath);
        const incomingList = getAtPath(remoteRoot, parentPath);
        const beforeItem = Array.isArray(beforeList) ? beforeList[part] : undefined;
        const incomingItem = Array.isArray(incomingList) ? incomingList[part] : undefined;
        const rowName = item => {
          if (typeof item === 'string') return item.trim();
          if (!item || typeof item !== 'object') return '';
          for (const key of ['label', 'name', 'title', 'key', 'id', 'text', 'command']) {
            if (item[key] !== undefined && item[key] !== null && String(item[key]).trim()) {
              return String(item[key]).trim();
            }
          }
          return '';
        };
        const name = change && change.arrayAction === 'delete'
          ? rowName(change.before)
          : change && change.arrayAction === 'insert'
            ? rowName(change.incoming)
            : rowName(beforeItem) || rowName(incomingItem);
        label += name ? ' ›「' + name + '」' : ' › 第 ' + (part + 1) + ' 項';
      } else {
        label += ' › ' + (FIELD_LABELS[part] || part);
      }
    }
    return label;
  }

  function cloneJSON(value) {
    return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  }

  function getNamedRowKey(item) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    for (const key of ['label', 'name', 'title', 'key', 'id']) {
      if (item[key] !== undefined && item[key] !== null && String(item[key]).trim()) {
        return String(item[key]).trim();
      }
    }
    return null;
  }

  // 只供「其他欄位」的具名列比對使用：英文大小寫不影響配對，
  // 但原始名稱仍保留在資料中，遞迴比較時會把大小寫差異標示為「修改」。
  // 常用對話表 commands 的比對邏輯完全不使用此函式，也不做任何變更。
  function getNamedRowMatchKey(item) {
    const key = getNamedRowKey(item);
    return key === null ? null : key.replace(/[A-Z]/g, letter => letter.toLowerCase());
  }

  function isNamedRowArray(before, incoming) {
    const rows = [...before, ...incoming];
    return rows.length > 0 && rows.every(item => getNamedRowKey(item) !== null);
  }

  function collectLeafChanges(before, incoming, path, changes) {
    if (valuesEqual(before, incoming)) return;
    // 其他欄位的「未設定」與空字串視為相同空值；常用對話表完全維持原判斷。
    if (path[0] !== 'commands' && isBlankOtherFieldValue(before) && isBlankOtherFieldValue(incoming)) return;

    const beforeIsArray = Array.isArray(before);
    const incomingIsArray = Array.isArray(incoming);
    if (beforeIsArray && incomingIsArray) {
      // Status／Params 這類有名稱的屬性列，必須依名稱配對，而不是依位置配對。
      // 同名列只比較內容；舊名稱消失視為刪除，新名稱出現視為新增。
      if (isNamedRowArray(before, incoming)) {
        const incomingIndexesByKey = new Map();
        incoming.forEach((item, index) => {
          const key = getNamedRowMatchKey(item);
          if (!incomingIndexesByKey.has(key)) incomingIndexesByKey.set(key, []);
          incomingIndexesByKey.get(key).push(index);
        });
        const matchedIncomingIndexes = new Set();

        before.forEach((beforeItem, beforeIndex) => {
          const key = getNamedRowMatchKey(beforeItem);
          const candidates = incomingIndexesByKey.get(key);
          const incomingIndex = candidates && candidates.find(index => !matchedIncomingIndexes.has(index));
          if (incomingIndex !== undefined) {
            matchedIncomingIndexes.add(incomingIndex);
            collectLeafChanges(beforeItem, incoming[incomingIndex], path.concat(beforeIndex), changes);
          } else {
            changes.push({
              path: path.concat(beforeIndex),
              before: beforeItem,
              incoming: undefined,
              hasBefore: true,
              hasIncoming: false,
              arrayAction: 'delete'
            });
          }
        });

        incoming.forEach((incomingItem, incomingIndex) => {
          if (matchedIncomingIndexes.has(incomingIndex)) return;
          changes.push({
            path: path.concat(incomingIndex),
            before: undefined,
            incoming: incomingItem,
            hasBefore: false,
            hasIncoming: true,
            arrayAction: 'insert'
          });
        });
        return;
      }

      // 沒有名稱可供配對的陣列維持原本逐位置比對方式。
      const length = Math.max(before.length, incoming.length);
      for (let i = 0; i < length; i++) {
        const hasBefore = i < before.length;
        const hasIncoming = i < incoming.length;
        if (hasBefore && hasIncoming) {
          collectLeafChanges(before[i], incoming[i], path.concat(i), changes);
        } else {
          changes.push({
            path: path.concat(i),
            before: before[i],
            incoming: incoming[i],
            hasBefore,
            hasIncoming
          });
        }
      }
      return;
    }

    const beforeIsObject = before !== null && typeof before === 'object' && !beforeIsArray;
    const incomingIsObject = incoming !== null && typeof incoming === 'object' && !incomingIsArray;
    if (beforeIsObject && incomingIsObject) {
      // 區塊內優先依試算表傳入資料的原始屬性順序；舊資料才有的欄位放後面。
      const keys = [...new Set([...Object.keys(incoming), ...Object.keys(before)])];
      for (const key of keys) {
        const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
        const hasIncoming = Object.prototype.hasOwnProperty.call(incoming, key);
        if (hasBefore && hasIncoming) {
          collectLeafChanges(before[key], incoming[key], path.concat(key), changes);
        } else {
          changes.push({
            path: path.concat(key),
            before: before[key],
            incoming: incoming[key],
            hasBefore,
            hasIncoming
          });
        }
      }
      return;
    }

    changes.push({
      path: path.slice(),
      before,
      incoming,
      hasBefore: before !== undefined,
      hasIncoming: incoming !== undefined
    });
  }

  function compareCharacters(currentCharacter, remoteCharacter) {
    const current = unwrapCharacter(currentCharacter);
    const remote = unwrapCharacter(remoteCharacter);
    // 只比對名稱、變動屬性、固定屬性、常用對話表與行動順序。
    // X/Y、角度、寬高、memo、圖片、顏色、勾選框等一律不列入差異。
    // 固定依照角色卡原本的區塊順序顯示差異。
    const keys = ['name', 'initiative', 'status', 'params', 'commands']
      .filter(key => Object.prototype.hasOwnProperty.call(current, key) ||
                     Object.prototype.hasOwnProperty.call(remote, key));
    const changes = [];
    const preserved = [];

    for (const key of keys) {
      if (valuesEqual(current[key], remote[key])) continue;
      const label = FIELD_LABELS[key] || key;
      if (LOCAL_ONLY_FIELDS.has(key)) {
        preserved.push({ key, label, before: current[key], incoming: remote[key] });
        continue;
      }
      collectLeafChanges(current[key], remote[key], [key], changes);
    }

    return { changes, preserved, current, remote };
  }

  function getAtPath(root, path) {
    let value = root;
    for (const part of path) {
      if (value == null) return undefined;
      value = value[part];
    }
    return value;
  }

  function applyPath(root, path, value, shouldExist) {
    if (!path.length) return;
    let parent = root;
    for (let i = 0; i < path.length - 1; i++) {
      const part = path[i];
      if (parent[part] == null || typeof parent[part] !== 'object') {
        parent[part] = typeof path[i + 1] === 'number' ? [] : {};
      }
      parent = parent[part];
    }
    const finalKey = path[path.length - 1];
    if (shouldExist) parent[finalKey] = cloneJSON(value);
    else if (Array.isArray(parent) && typeof finalKey === 'number') {
      // 陣列長度不同時會以整個陣列作為一筆差異；正常不會走到此處。
      parent.splice(finalKey, 1);
    } else {
      delete parent[finalKey];
    }
  }


  function applyArrayChange(root, change) {
    if (!change.arrayAction) {
      applyPath(root, change.path, change.incoming, change.hasIncoming);
      return;
    }
    const parentPath = change.path.slice(0, -1);
    const index = change.path[change.path.length - 1];
    const list = getAtPath(root, parentPath);
    if (!Array.isArray(list) || typeof index !== 'number') return;
    if (change.arrayAction === 'delete') list.splice(index, 1);
    else if (change.arrayAction === 'insert') list.splice(Math.max(0, Math.min(index, list.length)), 0, cloneJSON(change.incoming));
  }

  function getChangeStatus(change) {
    // 常用對話表維持原本已確認的判斷，不套用其他欄位的空值規則。
    if (change.path && change.path[0] === 'commands') {
      if (!change.hasBefore && change.hasIncoming) return { label: '新增', className: 'gs-diff-status gs-diff-status-add' };
      if (change.hasBefore && !change.hasIncoming) return { label: '刪除', className: 'gs-diff-status gs-diff-status-delete' };
      return { label: '修改', className: 'gs-diff-status gs-diff-status-edit' };
    }

    const beforeExists = change.hasBefore && !isBlankOtherFieldValue(change.before);
    const incomingExists = change.hasIncoming && !isBlankOtherFieldValue(change.incoming);
    if (!beforeExists && incomingExists) return { label: '新增', className: 'gs-diff-status gs-diff-status-add' };
    if (beforeExists && !incomingExists) return { label: '刪除', className: 'gs-diff-status gs-diff-status-delete' };
    return { label: '修改', className: 'gs-diff-status gs-diff-status-edit' };
  }

  function chooseDifferences(characterName, comparison) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'gs-diff-overlay';
      overlay.setAttribute('role', 'presentation');

      const dialog = document.createElement('section');
      dialog.className = 'gs-diff-dialog';
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('aria-modal', 'true');
      dialog.setAttribute('aria-label', 'Google 試算表差異比對');

      const head = document.createElement('div');
      head.className = 'gs-diff-head';
      const title = document.createElement('h3');
      title.textContent = 'Google 試算表差異比對';
      const subtitle = document.createElement('div');
      subtitle.className = 'gs-diff-sub';
      subtitle.textContent = '角色：' + characterName + '。勾選要套用的項目；未勾選的項目會維持目前內容。';
      const legend = document.createElement('div');
      legend.className = 'gs-diff-legend';
      legend.innerHTML = '<span class="gs-diff-text-add">新增</span><span class="gs-diff-text-delete">刪除</span><span class="gs-diff-text-edit">修改</span>';
      head.append(title, subtitle, legend);

      const tools = document.createElement('div');
      tools.className = 'gs-diff-tools';
      const selectAll = document.createElement('button');
      selectAll.type = 'button'; selectAll.textContent = '全選可更新項目';
      const selectNone = document.createElement('button');
      selectNone.type = 'button'; selectNone.textContent = '全部取消';
      tools.append(selectAll, selectNone);

      const list = document.createElement('div');
      list.className = 'gs-diff-list';
      const checkboxes = [];
      comparison.changes.forEach((change, index) => {
        const label = document.createElement('label');
        label.className = 'gs-diff-item';
        const top = document.createElement('div');
        top.className = 'gs-diff-item-top';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.checked = true;
        checkbox.dataset.index = String(index);
        checkboxes.push(checkbox);
        const name = document.createElement('span');
        name.className = 'gs-diff-item-name';
        name.textContent = pathLabel(change.path, comparison.current, comparison.remote, change);
        const status = getChangeStatus(change);
        const statusBadge = document.createElement('span');
        statusBadge.className = status.className;
        statusBadge.textContent = status.label;
        top.append(checkbox, name, statusBadge);

        const values = document.createElement('div');
        values.className = 'gs-diff-values';
        const before = document.createElement('div');
        before.className = 'gs-diff-before';
        before.appendChild(document.createTextNode('目前：'));
        if (change.path.length === 1 && change.path[0] === 'commands') {
          // 常用對話表的顯示與差異邏輯維持原樣。
          if (change.hasBefore) {
            if (change.arrayAction === 'delete') {
              const deletedRow = document.createElement('span');
              deletedRow.className = 'gs-diff-changed gs-diff-text-delete';
              deletedRow.textContent = comparisonText(change.before);
              before.appendChild(deletedRow);
            } else {
              appendCommandsDiff(before, change.before, change.incoming, 'before');
            }
          } else {
            const missingBefore = document.createElement('span');
            missingBefore.className = 'gs-diff-changed gs-diff-text-add';
            missingBefore.textContent = '（不存在）';
            before.appendChild(missingBefore);
          }
        } else if (change.hasBefore) {
          appendOtherFieldDiff(before, change, 'before');
        }
        const after = document.createElement('div');
        after.className = 'gs-diff-after';
        after.appendChild(document.createTextNode('試算表：'));
        if (change.path.length === 1 && change.path[0] === 'commands') {
          // 常用對話表的顯示與差異邏輯維持原樣。
          if (change.hasIncoming) {
            if (change.arrayAction === 'insert') {
              const addedRow = document.createElement('span');
              addedRow.className = 'gs-diff-changed gs-diff-text-add';
              addedRow.textContent = comparisonText(change.incoming);
              after.appendChild(addedRow);
            } else {
              appendCommandsDiff(after, change.before, change.incoming, 'after');
            }
          } else {
            const deleted = document.createElement('span');
            deleted.className = 'gs-diff-changed gs-diff-text-delete';
            deleted.textContent = '（刪除此項）';
            after.appendChild(deleted);
          }
        } else if (change.hasIncoming) {
          appendOtherFieldDiff(after, change, 'after');
        }
        values.append(before, after);
        label.append(top, values);
        list.appendChild(label);
      });
      if (!comparison.changes.length) {
        const empty = document.createElement('p');
        empty.textContent = '沒有可更新的差異項目。';
        list.appendChild(empty);
      }

      selectAll.addEventListener('click', () => checkboxes.forEach(box => { box.checked = true; }));
      selectNone.addEventListener('click', () => checkboxes.forEach(box => { box.checked = false; }));

      let preservedBox = null;
      if (comparison.preserved.length) {
        preservedBox = document.createElement('div');
        preservedBox.className = 'gs-diff-preserved';
        preservedBox.textContent = '以下項目會保留目前檔案，不會更新：' +
          comparison.preserved.map(item => item.label).join('、') +
          '。底部的角色設定勾選框也會保留原本勾選狀態。';
      }

      const actions = document.createElement('div');
      actions.className = 'gs-diff-actions';
      const cancel = document.createElement('button');
      cancel.type = 'button'; cancel.textContent = '取消，不更新';
      const apply = document.createElement('button');
      apply.type = 'button'; apply.className = 'primary'; apply.textContent = '套用勾選項目';
      actions.append(cancel, apply);
      dialog.append(head, tools, list);
      if (preservedBox) dialog.appendChild(preservedBox);
      dialog.appendChild(actions);
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);

      let finished = false;
      function finish(result) {
        if (finished) return;
        finished = true;
        overlay.remove();
        resolve(result);
      }
      cancel.addEventListener('click', () => finish(null));
      apply.addEventListener('click', () => {
        if (apply.disabled || finished) return;
        apply.disabled = true;
        apply.textContent = '正在套用…';
        finish(checkboxes.filter(box => box.checked).map(box => Number(box.dataset.index)));
      });
      overlay.addEventListener('click', event => {
        if (event.target === overlay) finish(null);
      });
      const escapeHandler = event => {
        if (event.key === 'Escape' && document.body.contains(overlay)) {
          document.removeEventListener('keydown', escapeHandler);
          finish(null);
        }
      };
      document.addEventListener('keydown', escapeHandler);
    });
  }

  function applyCharacter(character, sourceUrl) {
    const importInput = getElement('importInput');
    if (!importInput || typeof window.importCharacterJSON !== 'function') {
      throw new Error('找不到原本的 JSON 匯入功能，請確認 app.js 已先載入。');
    }

    // 保留差分列的原始 DOM 節點。這很重要：圖片檔案資料存放在原本的列上，
    // 只重建 JSON 裡的 faces 文字會讓已選取的本機圖片失去關聯。
    const facesList = getElement('facesList');
    const originalFaceNodes = facesList
      ? Array.from(facesList.children)
      : null;

    importInput.value = JSON.stringify(character);
    window.importCharacterJSON();

    if (facesList && originalFaceNodes) {
      facesList.replaceChildren(...originalFaceNodes);
      // 更新差分編號（如果原工具提供了對應函式）。
      if (typeof window.renumber === 'function') {
        try { window.renumber('face'); } catch (_) {}
      }
    }

    const externalUrl = getElement('externalUrl');
    if (externalUrl) externalUrl.value = sourceUrl;
    if (typeof window.generate === 'function') window.generate();
  }

  async function checkSheet(url, showFailure, forceCheck) {
    const info = extractSpreadsheetInfo(url);
    if (!info || inFlightUrls.has(url)) return;
    inFlightUrls.add(url);

    const requestId = ++currentRequestId;

    try {
      const remoteCharacter = await readCharacterFromSheet(info);
      if (requestId !== currentRequestId) return;

      const remoteData = unwrapCharacter(remoteCharacter);
      const remoteFingerprint = fingerprint(remoteCharacter);

      let currentCharacter;
      try {
        currentCharacter = getCurrentCharacter();
      } catch (error) {
        if (showFailure) notify('無法比較目前資料：' + error.message);
        return;
      }

      const comparison = compareCharacters(currentCharacter, remoteCharacter);

      if (!comparison.changes.length) {
        // 若一般差異比較沒有列出智力指令，仍以 Y9「靈感」強制核對並同步智力。
        const currentForIntelligence = cloneJSON(comparison.current);
        if (syncIntelligenceFromInspiration(currentForIntelligence, lastCharacterSheetResponse)) {
          if (Object.prototype.hasOwnProperty.call(comparison.current, 'externalUrl')) {
            currentForIntelligence.externalUrl = comparison.current.externalUrl;
          }
          applyCharacter({ kind: 'character', data: currentForIntelligence }, url);
          if (showFailure) notify('已依試算表 Y9「靈感」同步智力。');
        } else if (showFailure) {
          const protectedNote = comparison.preserved.length
            ? '；以下項目保留目前檔案：' + comparison.preserved.map(item => item.label).join('、')
            : '';
          notify('沒有需要更新的可同步欄位' + protectedNote + '。');
        }
        lastAppliedFingerprint = remoteFingerprint;
        lastDeclinedFingerprint = '';
        return;
      }

      // 同一份試算表版本已處理過（套用或拒絕），定時檢查時不重複打擾。
      if (!forceCheck && (remoteFingerprint === lastDeclinedFingerprint ||
          remoteFingerprint === lastAppliedFingerprint)) {
        return;
      }

      const characterName = String(remoteData.name || '未命名角色');
      const selectedIndexes = await chooseDifferences(characterName, comparison);
      if (requestId !== currentRequestId) return;

      if (selectedIndexes === null) {
        lastDeclinedFingerprint = remoteFingerprint;
        notify('已取消更新，所有資料維持目前內容。');
        return;
      }

      if (!selectedIndexes.length) {
        lastDeclinedFingerprint = remoteFingerprint;
        notify('沒有勾選要更新的項目，已保留目前資料。');
        return;
      }

      const mergedData = cloneJSON(comparison.current);
      const selectedChanges = selectedIndexes.map(index => comparison.changes[index]);
      // 先套用同名列的數值修改，再由後往前刪除／插入整列，避免索引位移影響其他選取項目。
      selectedChanges.sort((a, b) => {
        const priority = change => change.arrayAction === 'delete' ? 1 : change.arrayAction === 'insert' ? 2 : 0;
        const priorityDiff = priority(a) - priority(b);
        if (priorityDiff) return priorityDiff;
        if (a.arrayAction && b.arrayAction) {
          const aParent = JSON.stringify(a.path.slice(0, -1));
          const bParent = JSON.stringify(b.path.slice(0, -1));
          if (aParent === bParent) return b.path[b.path.length - 1] - a.path[a.path.length - 1];
        }
        return 0;
      });
      selectedChanges.forEach(change => applyArrayChange(mergedData, change));
      // 這些欄位無論試算表內容如何，都以本機目前版本為準。
      for (const key of LOCAL_ONLY_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(comparison.current, key)) {
          mergedData[key] = cloneJSON(comparison.current[key]);
        } else {
          delete mergedData[key];
        }
      }
      // 最後才同步基礎檢定行，確保不會被 JSON 合併或其他欄位更新覆蓋。
      // 只更新八項基礎數值，其他常用對話表指令仍依原本的差異選取邏輯保留。
      syncBaseCommandLines(mergedData, remoteData, lastCharacterSheetResponse);
      // 智力不採用 S13；最後再次明確以 Y9「靈感」覆寫，避免其他合併步驟蓋回舊值。
      syncIntelligenceFromInspiration(mergedData, lastCharacterSheetResponse);
      if (Object.prototype.hasOwnProperty.call(comparison.current, 'externalUrl')) {
        mergedData.externalUrl = comparison.current.externalUrl;
      }

      applyCharacter({ kind: 'character', data: mergedData }, url);
      lastAppliedFingerprint = remoteFingerprint;
      lastDeclinedFingerprint = '';
      const skipped = comparison.changes.length - selectedIndexes.length;
      notify('已套用 ' + selectedIndexes.length + ' 個選取項目' +
        (skipped ? '，保留 ' + skipped + ' 個未勾選項目' : '') +
        '。圖片、差分、顏色及底部勾選框狀態均已保留。');
    } catch (error) {
      console.error('[Google Sheets 角色同步]', error);
      if (showFailure) {
        notify('Google 試算表讀取失敗：' + error.message);
      }
    } finally {
      inFlightUrls.delete(url);
    }
  }

  function stopPolling() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling(url) {
    stopPolling();
    if (!extractSpreadsheetInfo(url)) return;

    pollTimer = window.setInterval(() => {
      const field = getElement('externalUrl');
      if (!field || field.value.trim() !== url) {
        stopPolling();
        return;
      }
      checkSheet(url, false);
    }, POLL_INTERVAL_MS);
  }

  function scheduleCheck(forceCheck = true) {
    const field = getElement('externalUrl');
    if (!field) return;

    const url = field.value.trim();
    window.clearTimeout(debounceTimer);
    currentRequestId++;

    if (!extractSpreadsheetInfo(url)) {
      stopPolling();
      return;
    }

    debounceTimer = window.setTimeout(async () => {
      await checkSheet(url, true, forceCheck);
      startPolling(url);
    }, INPUT_DEBOUNCE_MS);
  }

  function markImportPending() {
    importRefreshPending = true;
    window.clearTimeout(importWatchdogTimer);
    // ZIP 匯入可能還要載入圖片；保留觀察狀態，直到匯入後的 generate() 完成。
    importWatchdogTimer = window.setTimeout(() => {
      importRefreshPending = false;
    }, 120000);
  }

  function scheduleImportedDataCheck() {
    if (!importRefreshPending) return;
    window.clearTimeout(importRefreshTimer);
    // 等匯入流程最後一次 generate() 完成，避免拿到 ZIP 匯入中的半成品。
    importRefreshTimer = window.setTimeout(() => {
      importRefreshPending = false;
      window.clearTimeout(importWatchdogTimer);
      const field = getElement('externalUrl');
      const url = field ? field.value.trim() : '';
      if (extractSpreadsheetInfo(url)) {
        checkSheet(url, true, true);
      }
    }, 1200);
  }

  function wrapImportFunction(name) {
    const original = window[name];
    if (typeof original !== 'function' || original.__googleSheetsImportWatchWrapped) return;

    const wrapped = function (...args) {
      markImportPending();
      return original.apply(this, args);
    };
    wrapped.__googleSheetsImportWatchWrapped = true;
    window[name] = wrapped;
  }

  function watchImportedData() {
    // 一般 JSON 匯入與 Room ZIP 匯入會經過其中一個資料載入函式。
    wrapImportFunction('importCharacterJSON');
    wrapImportFunction('loadJSON');

    // ZIP 匯入完成時會呼叫 generate()；只在已偵測到匯入流程時觸發同步，
    // 不會把一般逐字編輯的每一次 generate() 都當成新匯入。
    const originalGenerate = window.generate;
    if (typeof originalGenerate === 'function' &&
        !originalGenerate.__googleSheetsImportWatchWrapped) {
      const wrappedGenerate = function (...args) {
        const result = originalGenerate.apply(this, args);
        scheduleImportedDataCheck();
        return result;
      };
      wrappedGenerate.__googleSheetsImportWatchWrapped = true;
      window.generate = wrappedGenerate;
    }
  }

  function init() {
    const field = getElement('externalUrl');
    if (!field) return;

    watchImportedData();

    // 貼上或輸入試算表連結後，立即排程檢查；同一連結再次貼上也會強制比對。
    // 只監聽 input，避免 change 事件在失焦時重複開啟比對視窗。
    field.addEventListener('input', () => scheduleCheck(true));

    // 若表單原本已保存試算表連結，開啟時也嘗試讀取一次。
    if (extractSpreadsheetInfo(field.value)) {
      scheduleCheck(true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

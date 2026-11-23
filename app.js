/* =========================================================
       基本工具
    ========================================================= */

    const $ = id => document.getElementById(id);

    /* =========================================================
       右上角設定：使用 localStorage 記住勾選狀態
    ========================================================= */
    (function initPersistentAppSettings() {
      const settings = [
        ['mainImageFromFaces', 'ccfolia-main-image-from-faces'],
        ['autoFaceLabel', 'ccfolia-auto-face-label']
      ];

      settings.forEach(([elementId, storageKey]) => {
        const checkbox = $(elementId);
        if (!checkbox) return;

        try {
          const savedValue = localStorage.getItem(storageKey);
          if (savedValue !== null) {
            checkbox.checked = savedValue === 'true';
          }
        } catch (error) {
          console.warn('讀取設定失敗：', storageKey, error);
        }

        checkbox.addEventListener('change', () => {
          try {
            localStorage.setItem(storageKey, String(checkbox.checked));
          } catch (error) {
            console.warn('儲存設定失敗：', storageKey, error);
          }
        });
      });
    })();
    /* =========================================================
       主圖片：本機 PNG
    ========================================================= */

    let selectedImageFile = null;
    let selectedImageBytes = null;
    let selectedImageHash = null;
    let selectedImageObjectURL = null;

    const faceImageData = new WeakMap();



    // 明確掛到 window，確保 HTML inline onclick 可以呼叫
    window.toggleAppSettings = function toggleAppSettings() {
      const panel = document.getElementById('appSettingsPopover');
      if (panel) panel.classList.toggle('show');
    };

    function closeFacePicker() {
      $('facePickerModal').classList.remove('show');
    }

    function closeFacePickerOutside(event) {
      if (event.target === $('facePickerModal')) closeFacePicker();
    }

    function openMainImagePicker() {
      const useFaces = $('mainImageFromFaces') && $('mainImageFromFaces').checked;
      const rows = [...$('facesList').children];
      const availableRows = rows.filter(row => {
        const data = faceImageData.get(row);
        return data && data.file;
      });
      if (!useFaces || availableRows.length === 0) {
        $('imageFile').click();
        return;
      }

      const grid = $('facePickerGrid');
      grid.innerHTML = '';
      availableRows.forEach((row) => {
        const imageData = faceImageData.get(row);
        const preview = row.querySelector('.face-preview');
        const label = (row.querySelector('.f-label')?.value || '').trim() || '未命名差分';
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'face-picker-item';
        item.disabled = !imageData || !imageData.file;
        if (preview && preview.src) {
          const img = document.createElement('img');
          img.src = preview.src;
          img.alt = label;
          item.appendChild(img);
        } else {
          const placeholder = document.createElement('div');
          placeholder.style.cssText = 'width:100%;aspect-ratio:1/1;display:grid;place-items:center;color:var(--muted);font-size:12px;';
          placeholder.textContent = '圖片尚未載入';
          item.appendChild(placeholder);
        }
        const name = document.createElement('span');
        name.textContent = label;
        item.appendChild(name);
        item.addEventListener('click', async () => {
          if (!imageData || !imageData.file) return;
          closeFacePicker();
          await handleImageFile({ target: { files: [imageData.file] } });
        });
        grid.appendChild(item);
      });
      $('facePickerModal').classList.add('show');
    }

    /*
      選擇主圖片
    */
    async function handleImageFile(event) {

      const file =
        event.target.files &&
        event.target.files[0];


      selectedImageFile = null;
      selectedImageBytes = null;
      selectedImageHash = null;


      if (selectedImageObjectURL) {

        URL.revokeObjectURL(
          selectedImageObjectURL
        );

        selectedImageObjectURL = null;

      }


      $('iconUrl').value = '';

      $('imageFileInfo').style.display =
        'none';

      $('imageFileInfo').innerHTML =
        '';

      $('imagePreview').classList.remove(
        'show'
      );

      $('imagePreview').removeAttribute(
        'src'
      );


      if (!file) {

        $('originalImageName').textContent =
          '尚未選擇圖片';

        generate();

        return;
      }


      /*
        目前只接受 PNG。
        SHA-256 是對原始 PNG bytes 計算。
      */

      const isPNG =
        file.type === 'image/png' ||
        file.name.toLowerCase().endsWith('.png');


      if (!isPNG) {

        $('originalImageName').innerHTML =
          '<span class="warn">❌ 請選擇 PNG 圖片。</span>';

        // 第一次選到非 PNG 時，也要立即顯示警告區域。
        $('originalImageName').style.display = 'block';
        $('imageFile').value = '';

        return;
      }


      try {

        const arrayBuffer =
          await file.arrayBuffer();

        const bytes =
          new Uint8Array(arrayBuffer);


        const hash =
          await sha256Hex(bytes);


        selectedImageFile =
          file;

        selectedImageBytes =
          bytes;

        selectedImageHash =
          hash;


        /*
          ZIP 裡的實際檔名
        */
        const imageFilename =
          hash + '.png';


        /*
          iconUrl 使用 ZIP 裡真正的檔名
        */
        $('iconUrl').value =
          imageFilename;


        /*
          顯示本機原始檔名
        */
        $('originalImageName').innerHTML =
          '<strong>原始檔名：</strong> ' +
          escapeHTML(file.name);

        $('originalImageName').style.display =
          'block';


        /*
          圖片預覽
        */
        selectedImageObjectURL =
          URL.createObjectURL(file);

        $('imagePreview').src =
          selectedImageObjectURL;

        $('imagePreview').classList.add(
          'show'
        );


        generate();


      } catch (error) {

        console.error(error);

        $('originalImageName').innerHTML =
          '<span class="warn">' +
          '❌ 讀取圖片失敗：' +
          escapeHTML(error.message) +
          '</span>';

      }

    }

    async function handleFaceImageFile(event, row) {

      const files = Array.from(event.target.files || []);
      if (!files.length) {
        return;
      }

      // 同一個差分選擇器可一次選取多張圖片；每張圖片各自建立一筆差分。
      // 第一張沿用目前列，其餘圖片新增獨立列，原有單張選取流程不變。
      const input = event.target;
      input.value = '';

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let targetRow = row;
        if (i > 0) {
          addFace();
          targetRow = $('facesList').lastElementChild;
        }

        await processFaceImageFile(file, targetRow);
      }

      renumber('face');
      generate();
    }

    // 自動帶入差分名稱：大成功／大失敗不加 @，其他名稱維持原規則。
    function makeAutoFaceLabel(name) {
      const label = String(name || '').trim();
      return (label === '大成功' || label === '大失敗' ? '' : '@') + label;
    }

    async function processFaceImageFile(file, row) {

      if (!file) {
        return;
      }

      const isPNG =
        file.type === 'image/png' ||
        file.name.toLowerCase().endsWith('.png');

      if (!isPNG) {
        alert('差分圖片只能使用 PNG：' + file.name);
        return;
      }

      try {

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const hash = await sha256Hex(bytes);
        const filename = hash + '.png';

        faceImageData.set(
          row,
          {
            file,
            bytes,
            hash,
            filename
          }
        );

        const urlInput = row.querySelector('.f-url');
        urlInput.value = filename;

        // 自動帶入圖片名稱時，使用原始檔名並移除副檔名。
        const autoLabel = $('autoFaceLabel');
        const labelInput = row.querySelector('.f-label');
        if (autoLabel && autoLabel.checked && labelInput) {
          const imageName = file.name.replace(/\.[^.]+$/, '');
          labelInput.value = makeAutoFaceLabel(imageName);
        }

        const originalName = row.querySelector('.face-original-name');
        originalName.textContent = '原始檔名：' + file.name;

        const hashName = row.querySelector('.face-hash-name');
        hashName.textContent = 'ZIP 檔名：' + filename;

        const preview = row.querySelector('.face-preview');
        if (row._faceObjectURL) {
          URL.revokeObjectURL(row._faceObjectURL);
        }

        const objectURL = URL.createObjectURL(file);
        row._faceObjectURL = objectURL;
        preview.src = objectURL;
        preview.style.display = 'block';

        generate();

      } catch (error) {

        console.error('差分圖片處理失敗：', error);
        alert('差分圖片處理失敗，請確認圖片是否為有效 PNG：' + file.name);

      }
    }

    function num(id) {
      return Number($(id).value) || 0;
    }

    function bool(id) {
      return $(id).checked;
    }

    function updateColorPreview() {

      const text =
        $('color').value.trim();

      if (
        /^#[0-9A-Fa-f]{6}$/.test(text)
      ) {

        $('colorPreview').value =
          text;

      }

      generate();

    }


    function updateColorFromPicker() {

      $('color').value =
        $('colorPreview').value;

      generate();

    }
    /* =========================================================
       重複欄位
    ========================================================= */

    function isSanMaxModeEnabled() {
      const setting = $('matchSanMaxToCurrent');
      if (setting) return setting.checked;
      try {
        return localStorage.getItem('ccfolia-setting-match-san-max-to-current') !== 'false';
      } catch (_) {
        return true;
      }
    }

    function isSanStatusLabel(label) {
      return String(label || '').trim().toLowerCase() === 'san';
    }

    // 每列保留來源最大值；啟用模式只改顯示／輸出值，不覆蓋原始最大值。
    window.setSanMaxMode = function (enabled) {
      const rows = $('statusList') ? [...$('statusList').children] : [];
      rows.forEach(row => {
        const label = row.querySelector('.s-label')?.value;
        if (!isSanStatusLabel(label)) return;
        const valueInput = row.querySelector('.s-value');
        const maxInput = row.querySelector('.s-max');
        if (!valueInput || !maxInput) return;

        if (enabled) {
          // 關閉→開啟時，先保存目前表單中的原始最大值。
          row.dataset.sanOriginalMax = maxInput.value;
          maxInput.value = valueInput.value;
        } else {
          maxInput.value = row.dataset.sanOriginalMax ?? '';
        }
      });
      if (typeof window.generate === 'function') window.generate();
    };

    // 試算表輪詢時即使 SAN 最大值沒有形成可見差異，也更新「關閉模式時要還原」的來源值。
    window.updateSanOriginalMaxFromCharacter = function (character) {
      const data = character && character.kind === 'character' && character.data
        ? character.data
        : (character && character.data && typeof character.data === 'object' ? character.data : character);
      if (!data || !Array.isArray(data.status)) return;
      const source = data.status.find(item => item && isSanStatusLabel(item.label));
      if (!source || source.max === undefined) return;
      const row = $('statusList') && [...$('statusList').children].find(item =>
        isSanStatusLabel(item.querySelector('.s-label')?.value));
      if (row) row.dataset.sanOriginalMax = source.max === null ? '' : String(source.max);
    };

    function makeRow(type, index, data = {}) {

      const div = document.createElement('div');

      div.className = 'repeat';

      div.dataset.type = type;


      if (type === 'status') {

        div.innerHTML = `
      <div class="repeat-head">

        <span class="repeat-title">
          Status #${index + 1}
        </span>

        <button
          class="danger mini"
          onclick="
            this.closest('.repeat').remove();
            renumber('status');
            generate()
          "
        >
          刪除
        </button>

      </div>

      <div class="row">

        <input
          class="s-label"
          placeholder="HP"
          value="${esc(data.label || '')}"
        >

        <input
          class="s-value"
          type="number"
          placeholder="目前值"
          value="${data.value ?? ''}"
        >

        <input
          class="s-max"
          type="number"
          placeholder="上限"
          value="${data.max ?? ''}"
        >

      </div>
    `;
      }


      if (type === 'status') {
        const label = String(data.label || '').trim();
        const valueInput = div.querySelector('.s-value');
        const maxInput = div.querySelector('.s-max');
        if (isSanStatusLabel(label)) {
          div.dataset.sanOriginalMax = data.max == null ? '' : String(data.max);
          if (isSanMaxModeEnabled()) maxInput.value = valueInput.value;
        }
      }

      if (type === 'param') {

        div.innerHTML = `
      <div class="repeat-head">

        <span class="repeat-title">
          Param #${index + 1}
        </span>

        <button
          class="danger mini"
          onclick="
            this.closest('.repeat').remove();
            renumber('param');
            generate()
          "
        >
          刪除
        </button>

      </div>

      <div class="row">

        <input
          class="p-label"
          placeholder="DB"
          value="${esc(data.label || '')}"
        >

        <input
          class="p-value"
          placeholder="＋1D6"
          value="${esc(data.value ?? '')}"
        >

      </div>
    `;
      }


      if (type === 'face') {

        div.innerHTML = `
    <div class="repeat-head">

      <span class="repeat-title">
        差分 #${index + 1}
      </span>

      <button
        class="danger mini"
        onclick="
          this.closest('.repeat').remove();
          renumber('face');
          generate()
        "
      >
        刪除
      </button>

    </div>

    <div class="row">

      <input
        class="f-label"
        placeholder="@差分"
        value="${esc(data.label || '')}"
      >

<label class="file-select-btn" for="faceFile_${index}">
  選擇圖片
</label>

<input
  id="faceFile_${index}"
  class="f-file file-select-input"
  type="file"
  accept="image/png,.png"
  multiple
>

    </div>

    <div class="face-image-info">

      <div class="face-original-name">
      </div>

      <div class="face-hash-name">
      </div>

      <img
        class="face-preview"
        style="display:none"
      >

    </div>

    <input
      class="f-url"
      type="hidden"
      value="${esc(data.iconUrl || '')}"
    >
  `;

        const fileInput =
          div.querySelector('.f-file');

        const labelInput =
          div.querySelector('.f-label');

        fileInput.addEventListener(
          'change',
          event => {
            handleFaceImageFile(
              event,
              div
            );
          }
        );

        labelInput.addEventListener(
          'input',
          generate
        );

      }


      div.querySelectorAll('input')
        .forEach(x => x.addEventListener('input', generate));

      if (type === 'status') {
        const valueInput = div.querySelector('.s-value');
        const maxInput = div.querySelector('.s-max');
        valueInput.addEventListener('input', () => {
          if (isSanStatusLabel(div.querySelector('.s-label').value) && isSanMaxModeEnabled()) {
            maxInput.value = valueInput.value;
          }
        });
      }

      return div;
    }


    function esc(s) {

      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');

    }


    /* =========================================================
       新增 Status / Param / Face
    ========================================================= */

    function addStatus(data = {}) {

      $('statusList').appendChild(
        makeRow(
          'status',
          $('statusList').children.length,
          data
        )
      );

      generate();
    }


    function addParam(data = {}) {

      $('paramsList').appendChild(
        makeRow(
          'param',
          $('paramsList').children.length,
          data
        )
      );

      generate();
    }


    function addFace(data = {}) {

      $('facesList').appendChild(
        makeRow(
          'face',
          $('facesList').children.length,
          data
        )
      );

      generate();
    }


    function renumber(type) {

      const root =
        $(
          type === 'status'
            ? 'statusList'
            : type === 'param'
              ? 'paramsList'
              : 'facesList'
        );


      [...root.children].forEach((el, i) => {

        el.querySelector('.repeat-title').textContent =
          type === 'face'
            ? '差分 #' + (i + 1)
            : (type === 'status' ? 'Status #' : 'Param #') + (i + 1);

      });

    }

    /* =========================================================
       深色 / 亮色 / 我已經完全學會設計模式
    ========================================================= */

    let themeSwitchCount = 0;

    function applyTheme(theme) {

      document.body.classList.remove(
        'light',
        'expert'
      );

      if (theme === 'light') {

        document.body.classList.add('light');

        $('themeToggle').textContent =
          '🌙 深色';

      } else if (theme === 'expert') {

        document.body.classList.add('expert');

        // 彩虹模式啟用時，按鈕顯示模式名稱；點擊後仍可返回深色模式。
        $('themeToggle').textContent =
          '🌈 我已經完全學會設計了';

      } else {

        $('themeToggle').textContent =
          '☀️ 亮色';

      }

      localStorage.setItem(
        'ccfolia-theme',
        theme
      );

    }


    /* 主題按鈕 */

    function toggleTheme() {

      /* 如果已經進入彩虹地獄 */

      if (document.body.classList.contains('expert')) {

        themeSwitchCount = 0;

        applyTheme('dark');

        return;
      }


      themeSwitchCount++;


      /* 連續切換 5 次 */

      if (themeSwitchCount >= 5) {

        applyTheme('expert');

        return;
      }


      const isLight =
        document.body.classList.contains('light');


      applyTheme(
        isLight
          ? 'dark'
          : 'light'
      );

    }


    /* 載入時讀取上次設定 */

    (function () {

      const savedTheme =
        localStorage.getItem('ccfolia-theme') ||
        'dark';

      applyTheme(savedTheme);

    })();

    /* =========================================================
       位置與外觀的展開按鈕
    ========================================================= */
    function togglePositionSettings() {
      const settings = document.getElementById('positionSettings');
      const button = document.querySelector(
  '.position-header button[onclick="togglePositionSettings()"]'
);

      if (!settings || !button) return;

      if (settings.style.display === 'none' || settings.style.display === '') {
        settings.style.display = 'block';
        button.textContent = '收起';
      } else {
        settings.style.display = 'none';
        button.textContent = '展開';
      }
    }
    
    /* =========================================================
   角色圖片與差分的展開按鈕
========================================================= */
function toggleFaceSettings() {
  const settings = document.getElementById('faceSettings');

  const button = document.querySelector(
    '.position-header button[onclick="toggleFaceSettings()"]'
  );

  if (!settings || !button) return;

  if (
    settings.style.display === 'none' ||
    settings.style.display === ''
  ) {
    settings.style.display = 'block';
    button.textContent = '收起';
  } else {
    settings.style.display = 'none';
    button.textContent = '展開';
  }
}

    /* =========================================================
       產生 JSON
    ========================================================= */

    function generate() {

      const status =
        [...$('statusList').children].map(r => ({

          label:
            r.querySelector('.s-label').value,

          value:
            Number(
              r.querySelector('.s-value').value
            ) || 0,

          max:
            isSanStatusLabel(r.querySelector('.s-label').value) && isSanMaxModeEnabled()
              ? (Number(r.querySelector('.s-value').value) || 0)
              : (r.querySelector('.s-max').value === ''
                  ? null
                  : Number(r.querySelector('.s-max').value))

        }));


      const params =
        [...$('paramsList').children].map(r => ({

          label:
            r.querySelector('.p-label').value,

          value:
            r.querySelector('.p-value').value

        }));


      const faces =
        [...$('facesList').children].map(r => ({

          iconUrl:
            r.querySelector('.f-url').value || null,

          label:
            r.querySelector('.f-label').value

        }));


      const data = {

        name:
          $('name').value,

        memo:
          $('memo').value,

        initiative:
          num('initiative'),

        externalUrl:
          $('externalUrl').value,

        status,

        params,

        iconUrl:
          $('iconUrl').value || null,

        faces,

        x:
          num('x'),

        y:
          num('y'),

        angle:
          num('angle'),

        width:
          num('width'),

        height:
          num('height'),

        active:
          bool('active'),

        secret:
          bool('secret'),

        invisible:
          bool('invisible'),

        hideStatus:
          bool('hideStatus'),

        color:
          $('color').value,

        commands:
          $('commands').value,

        owner:
          $('owner').value || null

      };


      $('output').value =
        JSON.stringify(
          {
            kind: 'character',
            data
          },
          null,
          2
        );
    }


    async function copyAllFaceLabels() {

      const labels = [
        ...$('facesList').querySelectorAll('.f-label')
      ]
        .map(input => input.value.trim())
        .filter(label => label !== '');

      const text = labels.join('\n');

      if (!text) {
        return;
      }

      try {

        await navigator.clipboard.writeText(text);

      } catch (error) {

        const textarea = document.createElement('textarea');

        textarea.value = text;

        document.body.appendChild(textarea);

        textarea.select();

        document.execCommand('copy');

        textarea.remove();

      }
    }

    /* =========================================================
       複製 / 下載
    ========================================================= */

    async function copyJSON() {

      generate();

      try {

        await navigator.clipboard.writeText(
          $('output').value
        );

        toast(
          'JSON 已複製，可以貼到 CCFOLIA。'
        );

      } catch (e) {

        $('output').select();

        document.execCommand('copy');

        toast('JSON 已複製。');

      }
    }


    function downloadJSON() {

      generate();

      const blob =
        new Blob(
          [$('output').value],
          {type: 'application/json'}
        );

      const a =
        document.createElement('a');

      a.href =
        URL.createObjectURL(blob);

      a.download =
        'ccfolia-character.json';

      a.click();

      URL.revokeObjectURL(a.href);
    }


    /* =========================================================
       JSON 匯入 Modal
    ========================================================= */

    function openImportModal() {

      $('importModal').classList.add('show');

      $('importInput').focus();

    }


    function closeImportModal() {

      $('importModal').classList.remove('show');

    }


    function closeImportModalOutside(event) {

      if (event.target === $('importModal')) {

        closeImportModal();

      }

    }


    function clearImportInput() {

      $('importInput').value = '';

      $('importMessage').innerHTML = '';

    }


    /* =========================================================
       JSON 正規化 / 解析
    ========================================================= */

    /*
      這裡是這次最重要的部分。
    
      支援：
    
      ① 正常 JSON
         {"kind":"character","data":{...}}
    
      ② JSON 字串
         "{\"kind\":\"character\",\"data\":{...}}"
    
      ③ Excel / CSV 常見雙引號格式
         "{""kind"":""character"",""data"":{...}}"
    */


    function normalizeImportedJSON(raw) {

      let text = String(raw || '').trim();

      if (!text) {

        throw new Error(
          '沒有輸入任何 JSON。'
        );

      }


      /*
        第一層：直接解析
      */

      try {

        const direct =
          JSON.parse(text);

        /*
          如果解析結果本身是一個字串，
          代表 JSON 又被包了一層。
        */

        if (typeof direct === 'string') {

          return normalizeImportedJSON(direct);

        }

        return direct;

      } catch (e) {

        /*
          繼續嘗試特殊格式
        */


        let candidate = text;


        /*
          Excel / CSV 雙引號：
    
          "{""kind"":""character""}"
    
          先把最外層的 " 去掉
        */

        if (
          candidate.startsWith('"') &&
          candidate.endsWith('"')
        ) {

          candidate =
            candidate.slice(
              1,
              -1
            );

        }


        /*
          將 "" 還原成 "
        */

        candidate =
          candidate.replace(/""/g, '"');


        /*
          再解析
        */

        try {

          const result =
            JSON.parse(candidate);

          if (typeof result === 'string') {

            return normalizeImportedJSON(result);

          }

          return result;

        } catch (e2) {

          throw new Error(
            'JSON 格式無法解析。\n\n' +
            '請確認你貼上的內容是完整 JSON。\n\n' +
            '目前系統已嘗試：\n' +
            '・一般 JSON\n' +
            '・被字串包住的 JSON\n' +
            '・Excel / CSV 雙引號格式'
          );

        }

      }

    }


    /* =========================================================
       教育／智力指令名稱：依設定即時切換
    ========================================================= */

    function applyEducationIntelligenceCommandNameSetting(commands, enabled) {
      if (typeof commands !== 'string') return commands;

      return commands.replace(
        /^(\s*CC\s*<=\s*[^\r\n]*?)\s+(教育|教育／知識|智力|智力／靈感)\s*$/gm,
        (_, prefix, label) => {
          const isEducation = label === '教育' || label === '教育／知識';
          const outputLabel = enabled
            ? (isEducation ? '教育／知識' : '智力／靈感')
            : (isEducation ? '教育' : '智力');
          return prefix + ' ' + outputLabel;
        }
      );
    }

    // 讓設定選單可以在不重新匯入角色的情況下，直接切換目前指令名稱。
    window.applyEducationIntelligenceCommandNameSetting = applyEducationIntelligenceCommandNameSetting;

    /* =========================================================
       匯入角色
    ========================================================= */

    function importCharacterJSON() {

      const raw =
        $('importInput').value;


      let obj;


      /*
        嘗試解析
      */

      try {

        obj =
          normalizeImportedJSON(raw);

      } catch (error) {

        $('importMessage').innerHTML =
          `<div class="import-error">
        ❌ ${escapeHTML(error.message)}
      </div>`;

        return;

      }


      /*
        支援：
    
        {
          kind:"character",
          data:{...}
        }
    
        或直接：
    
        {
          name:"...",
          status:[...]
        }
      */

      const d =
        obj.data || obj;


      /*
        基本確認
      */

      if (
        !d ||
        typeof d !== 'object' ||
        Array.isArray(d)
      ) {

        $('importMessage').innerHTML =
          `<div class="import-error">
        ❌ 找不到有效的角色資料。
      </div>`;

        return;

      }


      /*
        先確認至少有角色相關欄位
      */

      const hasCharacterData =
        d.name !== undefined ||
        d.status !== undefined ||
        d.params !== undefined ||
        d.commands !== undefined ||
        d.initiative !== undefined;


      if (!hasCharacterData) {

        $('importMessage').innerHTML =
          `<div class="import-error">
        ❌ 這份 JSON 看起來不是 CCFOLIA Character JSON。
      </div>`;

        return;

      }


      /*
        填入基本資料
      */

      setValueIfExists(
        'name',
        d.name,
        ''
      );

      setValueIfExists(
        'memo',
        d.memo,
        ''
      );

      setNumberIfExists(
        'initiative',
        d.initiative
      );

      setValueIfExists(
        'externalUrl',
        d.externalUrl,
        ''
      );

      setValueIfExists(
        'iconUrl',
        d.iconUrl,
        ''
      );


      /*
        位置
      */

      setNumberIfExists('x', d.x);
      setNumberIfExists('y', d.y);
      setNumberIfExists('angle', d.angle);
      setNumberIfExists('width', d.width);
      setNumberIfExists('height', d.height);


      /*
        外觀
      */

      setValueIfExists(
        'color',
        d.color,
        '#E0E0E0'
      );

      // 匯入角色 JSON 後，立即同步右側顏色選擇器預覽。
      updateColorPreview();


      /*
        boolean
      */

      setBooleanIfExists(
        'active',
        d.active,
        true
      );

      setBooleanIfExists(
        'secret',
        d.secret,
        false
      );

      setBooleanIfExists(
        'invisible',
        d.invisible,
        false
      );

      setBooleanIfExists(
        'hideStatus',
        d.hideStatus,
        false
      );


      /*
        指令
      */

      // JSON 匯入與 Google 試算表連線匯入，都依目前開關狀態統一套用名稱。
      const autoFixCommandNames = $('autoFixEducationCommand');
      const importedCommands = applyEducationIntelligenceCommandNameSetting(
        d.commands,
        !!(autoFixCommandNames && autoFixCommandNames.checked)
      );

      setValueIfExists(
        'commands',
        importedCommands,
        ''
      );


      /*
        owner
      */

      setValueIfExists(
        'owner',
        d.owner,
        ''
      );


      /*
        Status
      */

      $('statusList').innerHTML = '';


      if (Array.isArray(d.status)) {

        d.status.forEach(status => {

          addStatus({

            label:
              status?.label ?? '',

            value:
              status?.value ?? 0,

            max:
              status?.max ?? ''

          });

        });

      }


      /*
        Params
      */

      $('paramsList').innerHTML = '';


      if (Array.isArray(d.params)) {

        d.params.forEach(param => {

          addParam({

            label:
              param?.label ?? '',

            value:
              param?.value ?? ''

          });

        });

      }


      /*
        Faces
        只有匯入 JSON 明確包含 faces 陣列時，才更新差分清單。
        若 JSON 沒有 faces 欄位，保留表單中既有的差分，避免匯入其他角色資料時被清空。
      */

      if (Array.isArray(d.faces)) {

        $('facesList').innerHTML = '';

        d.faces.forEach(face => {

          addFace({

            label:
              face?.label ?? '',

            iconUrl:
              face?.iconUrl ?? ''

          });

        });

      }


      /*
        最後重新產生 JSON
      */

      generate();


      /*
        統計匯入內容
      */

      const statusCount =
        Array.isArray(d.status)
          ? d.status.length
          : 0;

      const paramCount =
        Array.isArray(d.params)
          ? d.params.length
          : 0;

      const faceCount =
        Array.isArray(d.faces)
          ? d.faces.length
          : 0;


      $('importMessage').innerHTML =
        `<div class="import-success">
      ✓ 匯入成功！

      <br>
      角色：${escapeHTML(String(d.name ?? '未命名'))}

      <br>
      Status：${statusCount} 個

      固定變數：${paramCount} 個

      差分：${faceCount} 個

      指令：${d.commands ? '已匯入' : '無'}

    </div>`;


      /*
        稍微延遲後關閉視窗
      */

      setTimeout(() => {

        closeImportModal();

      }, 700);

    }



    /* =========================================================
       匯入資料的輔助函式
    ========================================================= */

/*把匯入的文字填入指定欄位；如果欄位不存在，就跳過，避免出錯。*/
    function setValueIfExists(id, value, fallback = '') {

      if ($(id)) {

        $(id).value =
          value == null
            ? fallback
            : String(value);

      }

    }

/*把匯入的資料轉成數字，再填入欄位。*/
    function setNumberIfExists(id, value) {

      if ($(id) && value !== undefined && value !== null) {

        const n =
          Number(value);

        if (!Number.isNaN(n)) {

          $(id).value = n;

        }

      }

    }

/*處理布林值，例如 true、false，並填入欄位。*/
    function setBooleanIfExists(
      id,
      value,
      fallback
    ) {

      if (!$(id)) return;


      if (value === undefined || value === null) {

        $(id).value =
          String(fallback);

      } else {

        $(id).value =
          String(Boolean(value));

      }

    }

/*將特殊 HTML 字元轉換成安全文字，避免匯入內容被當成 HTML 程式碼執行。*/
    function escapeHTML(text) {

      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    }


    /* =========================================================
       舊版 loadJSON
    ========================================================= */

    function loadJSON(obj) {

      const d =
        obj.data || obj;


      [
        'name',
        'memo',
        'externalUrl',
        'iconUrl',
        'color',
        'commands',
        'owner'
      ].forEach(k => {

        if ($(k) && d[k] != null) {

          $(k).value =
            d[k] ?? '';

        }

      });

      // ZIP 匯入會經過 loadJSON；顏色文字欄位更新後立即同步色彩預覽。
      updateColorPreview();


      [
        'initiative',
        'x',
        'y',
        'angle',
        'width',
        'height'
      ].forEach(k => {

        if ($(k) && d[k] != null) {

          $(k).value =
            d[k];

        }

      });


      [
        'active',
        'secret',
        'invisible',
        'hideStatus'
      ].forEach(k => {

        if ($(k) && d[k] != null) {

          $(k).value =
            String(d[k]);

        }

      });


      $('statusList').innerHTML = '';

      $('paramsList').innerHTML = '';

      $('facesList').innerHTML = '';


      (d.status || [])
        .forEach(addStatus);


      (d.params || [])
        .forEach(addParam);


      (d.faces || [])
        .forEach(addFace);


      generate();

    }


    /* =========================================================
       清空
    ========================================================= */

    function resetAll() {

      if (
        !confirm(
          '確定要清空全部欄位嗎？'
        )
      ) return;
      /*
        清除主圖片狀態
      */
      selectedImageFile = null;
      selectedImageBytes = null;
      selectedImageHash = null;

      if (selectedImageObjectURL) {

        URL.revokeObjectURL(
          selectedImageObjectURL
        );

        selectedImageObjectURL = null;
      }

      if ($('imageFile')) {
        $('imageFile').value = '';
      }

      if ($('iconUrl')) {
        $('iconUrl').value = '';
      }

      if ($('originalImageName')) {
        $('originalImageName').textContent =
          '尚未選擇圖片';
      }

      if ($('imageFileInfo')) {
        $('imageFileInfo').style.display =
          'none';

        $('imageFileInfo').innerHTML =
          '';
      }

      if ($('imagePreview')) {

        $('imagePreview').removeAttribute(
          'src'
        );

        $('imagePreview')
          .classList
          .remove('show');

      }

      window.roomCharacterId = null;

      document
        .querySelectorAll('input,textarea')
        .forEach(x => {

          if (x.type === 'number') {

            x.value = 0;

          } else {

            x.value = '';

          }

        });


      $('active').value = 'true';

      $('secret').value = 'false';

      $('invisible').value = 'false';

      $('hideStatus').value = 'false';

      $('color').value = '#E0E0E0';

      // 全部清空後，立即同步文字色碼與旁邊的顏色預覽。
      updateColorPreview();

      $('statusList').innerHTML = '';

      $('paramsList').innerHTML = '';

      $('facesList').innerHTML = '';


      defaultStatuses.forEach(
        s => addStatus({
          label: s.label,
          value: 0,
          max: s.max
        })
      );


      addParam({
        label: '',
        value: ''
      });


      generate();

    }




    /* =========================================================
       Toast
    ========================================================= */

    function toast(msg) {

      const t =
        $('toast');

      t.textContent =
        msg;

      t.classList.add('show');


      setTimeout(
        () => t.classList.remove('show'),
        1800
      );

    }


    /* =========================================================
       預設資料
    ========================================================= */

    const defaultStatuses = [

      {
        label: 'HP',
        value: '',
        max: ''
      },

      {
        label: 'MP',
        value: '',
        max: ''
      },

      {
        label: 'San',
        value: '',
        max: ''
      }

    ];


    defaultStatuses.forEach(addStatus);

    addParam({
      label: '',
      value: ''
    });

    addFace({
      iconUrl: '',
      label: '@通常'
    });


    generate();

    /* =========================================================
       CCFOLIA Room ZIP
    ========================================================= */


    /*
      產生一個 Room Character ID
    */
    function makeRoomCharacterId() {

      const bytes =
        new Uint8Array(20);

      crypto.getRandomValues(bytes);

      return Array.from(bytes)
        .map(
          b => b.toString(16).padStart(2, '0')
        )
        .join('');
    }


    /*
      從目前表單取得 Status
    */
    function getCurrentStatuses() {

      return [
        ...$('statusList').children
      ].map(row => ({

        label:
          row.querySelector('.s-label').value,

        value:
          Number(
            row.querySelector('.s-value').value
          ) || 0,

        max:
          isSanStatusLabel(row.querySelector('.s-label').value) && isSanMaxModeEnabled()
            ? (Number(row.querySelector('.s-value').value) || 0)
            : (row.querySelector('.s-max').value === ''
                ? 0
                : Number(row.querySelector('.s-max').value) || 0)

      }));
    }


    /*
      從目前表單取得 Params
    */
    function getCurrentParams() {

      return [
        ...$('paramsList').children
      ].map(row => ({

        label:
          row.querySelector('.p-label').value,

        value:
          row.querySelector('.p-value').value

      }));
    }


    /*
      從目前表單取得「差分」
      
      注意：
      這裡完全保留原本的手動 URL。
      不會把差分改成檔案。
    */
    function getCurrentFaces() {

      return [
        ...$('facesList').children
      ].map(row => ({

        iconUrl:
          row.querySelector('.f-url').value ||
          null,

        label:
          row.querySelector('.f-label').value

      }));

    }


    /*
      建立 Room 裡面的 Character
    */
    function buildRoomCharacter() {

      const characterId =
        window.roomCharacterId ||
        (
          window.roomCharacterId =
          makeRoomCharacterId()
        );


      return {

        name:
          $('name').value,

        playerName:
          '',

        memo:
          $('memo').value,

        initiative:
          num('initiative'),

        externalUrl:
          $('externalUrl').value,

        status:
          getCurrentStatuses(),

        params:
          getCurrentParams(),

        /*
          這裡就是主圖片的 SHA-256.png
        */
        iconUrl:
          $('iconUrl').value || '',

        /*
          差分完全照原本表單保留
        */
        faces:
          getCurrentFaces(),

        x:
          num('x'),

        y:
          num('y'),

        z:
          0,

        angle:
          num('angle'),

        width:
          num('width'),

        height:
          num('height'),

        active:
          bool('active'),

        secret:
          bool('secret'),

        invisible:
          bool('invisible'),

        hideStatus:
          bool('hideStatus'),

        color:
          $('color').value,

        roomId:
          null,

        commands:
          $('commands').value,

        speaking:
          false,

        diceSkin:
          {}

      };

    }


    /* =========================================================
       ZIP 基礎工具
    ========================================================= */

    /*
      檔名清理
    */
    function sanitizeFilename(name) {

      return String(name || 'character')

        .replace(
          /[\\/:*?"<>|]/g,
          '_'
        )

        .trim() ||

        'character';

    }



    /* =========================================================
       導覽側欄：圖片預先載入，關閉時先切換下一張。
       因此開啟側欄時只需顯示已準備好的圖片，不必等待圖片載入。
       圖片放在 HTML 同一層的 guide-images 資料夾中，命名 1.png～5.png。
    ========================================================= */
    const GUIDE_IMAGE_IDS = [1, 2, 3, 4, 5];
    const guideImagePreloads = new Map();
    let currentGuideImageId = null;
    let pendingGuideImageId = null;
    let guideCloseTimer = null;
    let guideCloseToken = 0;
    let guideCloseTransitionHandler = null;

    function setGuideSidebarImage(imageId) {
      const image = $('navGuideImage');
      if (!image) return;
      image.onerror = function () {
        this.onerror = null;
        this.alt = '找不到導覽圖片，請確認 guide-images 資料夾內有 1.png 至 5.png';
        this.removeAttribute('src');
      };
      image.src = './guide-images/' + imageId + '.png';
      image.alt = '導覽人員 ' + imageId;
      currentGuideImageId = imageId;
    }

    function preloadGuideSidebarImages() {
      GUIDE_IMAGE_IDS.forEach(imageId => {
        const preload = new Image();
        guideImagePreloads.set(imageId, preload);
        preload.onload = () => {
          // 圖片在側欄關閉期間載入完成，就先更新畫面中的圖片。
          if (pendingGuideImageId === imageId) {
            const sidebar = $('navSidebar');
            if (!sidebar || !sidebar.classList.contains('show')) {
              setGuideSidebarImage(imageId);
              pendingGuideImageId = null;
            }
          }
        };
        preload.src = './guide-images/' + imageId + '.png';
      });
    }

    function prepareNextGuideSidebarImage() {
      const candidates = GUIDE_IMAGE_IDS.filter(id => id !== currentGuideImageId);
      if (!candidates.length) return;
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      pendingGuideImageId = chosen;
      const preloaded = guideImagePreloads.get(chosen);

      // 已經預載完成就立即在側欄關閉時換好；尚未完成則由 onload 接手。
      if (preloaded && preloaded.complete && preloaded.naturalWidth > 0) {
        setGuideSidebarImage(chosen);
        pendingGuideImageId = null;
      }
    }

    function toggleGuideSidebar() {
      const sidebar = $('navSidebar');
      if (sidebar && sidebar.classList.contains('show')) {
        closeGuideSidebar();
      } else {
        openGuideSidebar();
      }
    }

    function openGuideSidebar() {
      const sidebar = $('navSidebar');
      const backdrop = $('navBackdrop');
      const toggle = $('navMenuToggle');
      const image = $('navGuideImage');
      if (!sidebar || !backdrop || !toggle || !image) return;

      // 若側欄尚在關閉動畫中就再次開啟，取消尚未執行的換圖。
      // 這樣連續快速開關時，只有真正完整關閉後才會準備下一張。
      guideCloseToken++;
      if (guideCloseTimer) {
        window.clearTimeout(guideCloseTimer);
        guideCloseTimer = null;
      }
      if (guideCloseTransitionHandler) {
        sidebar.removeEventListener('transitionend', guideCloseTransitionHandler);
        guideCloseTransitionHandler = null;
      }
      pendingGuideImageId = null;
      sidebar.classList.add('show');
      backdrop.classList.add('show');
      sidebar.setAttribute('aria-hidden', 'false');
      backdrop.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', '關閉導覽側欄');
      document.body.style.overflow = 'hidden';
    }

    function closeGuideSidebar() {
      const sidebar = $('navSidebar');
      const backdrop = $('navBackdrop');
      const toggle = $('navMenuToggle');
      if (!sidebar || !backdrop || !toggle) return;
      sidebar.classList.remove('show');
      backdrop.classList.remove('show');
      sidebar.setAttribute('aria-hidden', 'true');
      backdrop.setAttribute('aria-hidden', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', '開啟導覽側欄');
      document.body.style.overflow = '';

      // 等側欄的收合動畫完全結束後才換圖，避免關閉過程中看到下一張。
      // 若使用者在動畫結束前重新開啟，openGuideSidebar() 會取消這次換圖。
      const closeToken = ++guideCloseToken;
      const finishClose = () => {
        if (closeToken !== guideCloseToken || sidebar.classList.contains('show')) return;
        if (guideCloseTimer) {
          window.clearTimeout(guideCloseTimer);
          guideCloseTimer = null;
        }
        if (guideCloseTransitionHandler) {
          sidebar.removeEventListener('transitionend', guideCloseTransitionHandler);
          guideCloseTransitionHandler = null;
        }
        prepareNextGuideSidebarImage();
      };

      guideCloseTransitionHandler = event => {
        if (event.target === sidebar && event.propertyName === 'transform') finishClose();
      };
      sidebar.addEventListener('transitionend', guideCloseTransitionHandler);
      // transitionend 在動畫被中斷或瀏覽器未觸發時，以略長於 CSS 動畫的時間兜底。
      guideCloseTimer = window.setTimeout(finishClose, 350);
    }

    // 頁面載入時先設定第一張並在背景預載全部導覽圖片。
    (function initGuideSidebarImages() {
      const firstImage = GUIDE_IMAGE_IDS[Math.floor(Math.random() * GUIDE_IMAGE_IDS.length)];
      setGuideSidebarImage(firstImage);
      preloadGuideSidebarImages();
    })();

/* =========================================================
   差分 ZIP 匯入（讀取 sprite-namer.json；不依賴 JSZip）
========================================================= */
async function readZipEntries(zipFile) {
  const bytes = new Uint8Array(await zipFile.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = p => view.getUint32(p, true);
  const u16 = p => view.getUint16(p, true);
  let eocd = -1;
  const min = Math.max(0, bytes.length - 22 - 0xffff);
  for (let p = bytes.length - 22; p >= min; p--) {
    if (u32(p) === 0x06054b50) { eocd = p; break; }
  }
  if (eocd < 0) throw new Error('無法辨識 ZIP 壓縮檔結構。');
  const entryCount = u16(eocd + 10);
  let cursor = u32(eocd + 16);
  const decoder = new TextDecoder('utf-8');
  const entries = new Map();
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > bytes.length || u32(cursor) !== 0x02014b50) throw new Error('ZIP 檔案目錄資料不完整。');
    const flags = u16(cursor + 8);
    const method = u16(cursor + 10);
    const compressedSize = u32(cursor + 20);
    const uncompressedSize = u32(cursor + 24);
    const nameLength = u16(cursor + 28);
    const extraLength = u16(cursor + 30);
    const commentLength = u16(cursor + 32);
    const localOffset = u32(cursor + 42);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (flags & 1) throw new Error('ZIP 內含加密檔案，無法匯入：' + name);
    if (localOffset + 30 > bytes.length || u32(localOffset) !== 0x04034b50) throw new Error('ZIP 內的檔案資料損毀：' + name);
    const dataStart = localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28);
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = compressed.slice();
    else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('目前瀏覽器不支援 ZIP 解壓縮，請使用最新版 Chrome 或 Edge。');
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      data = new Uint8Array(await new Response(stream).arrayBuffer());
    } else throw new Error('ZIP 使用不支援的壓縮方式（' + method + '）：' + name);
    if (data.length !== uncompressedSize) throw new Error('ZIP 內的檔案大小不符：' + name);
    entries.set(name, data);
  }
  return entries;
}

async function importFaceZIP(event) {
  const input = event && event.target;
  const zipFile = input && input.files && input.files[0];
  if (!zipFile) return;
  try {
    if (!/\.zip$/i.test(zipFile.name)) throw new Error('請選擇副檔名為 .zip 的壓縮檔。');
    const entries = await readZipEntries(zipFile);
    const manifestBytes = entries.get('sprite-namer.json');
    if (!manifestBytes) throw new Error('這個 ZIP 根目錄缺少 sprite-namer.json，無法讀取差分名稱與圖片對應。');
    const manifest = JSON.parse(new TextDecoder('utf-8').decode(manifestBytes));
    if (!manifest || manifest.app !== 'sprite-namer' || !Array.isArray(manifest.groups)) throw new Error('sprite-namer.json 格式不正確。');
    const files = [];
    for (const group of manifest.groups) {
      if (!group || !Array.isArray(group.items)) continue;
      for (const item of group.items) {
        if (!item || !item.path) continue;
        const imageBytes = entries.get(item.path);
        if (!imageBytes) throw new Error('找不到 ZIP 內的圖片：' + item.path);
        const ext = String(item.ext || item.path.split('.').pop()).toLowerCase();
        if (ext !== 'png') throw new Error('目前差分圖片只支援 PNG：' + item.path);
        const filename = item.path.split('/').pop();
        const variant = String(group.variant || '').trim();
        const desc = String(item.desc == null ? '' : item.desc).trim();
        const faceLabel = (variant ? variant + '-' : '') + desc;
        files.push({
          file: new File([imageBytes], filename, { type: 'image/png' }),
          label: makeAutoFaceLabel(faceLabel)
        });
      }
    }
    if (!files.length) throw new Error('ZIP 中沒有可匯入的差分圖片。');
    const facesList = $('facesList');
    const autoLabel = $('autoFaceLabel');
    const wasAutoLabel = autoLabel ? autoLabel.checked : false;
    facesList.innerHTML = '';
    if (autoLabel) autoLabel.checked = false;
    try {
      for (const item of files) {
        addFace({ label: item.label, iconUrl: '' });
        const row = facesList.lastElementChild;
        await processFaceImageFile(item.file, row);
        row.querySelector('.f-label').value = item.label;
      }
    } finally {
      if (autoLabel) autoLabel.checked = wasAutoLabel;
    }
    renumber('face');
    generate();
    toast('已匯入 ' + files.length + ' 張差分圖片。');
  } catch (error) {
    console.error('差分 ZIP 匯入失敗：', error);
    alert('差分 ZIP 匯入失敗：\n' + (error && error.message ? error.message : String(error)));
  } finally {
    if (input) input.value = '';
  }
}

    /* =========================================================
       ESC 關閉匯入視窗
    ========================================================= */

    document.addEventListener(
      'keydown',
      event => {

        if (event.key === 'Escape') {
          if ($('importModal').classList.contains('show')) closeImportModal();
          if ($('facePickerModal').classList.contains('show')) closeFacePicker();
          if ($('navSidebar').classList.contains('show')) closeGuideSidebar();
          if ($('appSettingsPopover')) $('appSettingsPopover').classList.remove('show');
        }

      }
    );

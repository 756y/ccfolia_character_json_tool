/* =========================================================
       基本工具
    ========================================================= */

    const $ = id => document.getElementById(id);
    /* =========================================================
       主圖片：本機 PNG
    ========================================================= */

    let selectedImageFile = null;
    let selectedImageBytes = null;
    let selectedImageHash = null;
    let selectedImageObjectURL = null;

    const faceImageData = new WeakMap();


    /*
      將 ArrayBuffer / Uint8Array
      轉成 SHA-256 小寫十六進位字串
    */



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
          labelInput.value = '@' + imageName;
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
      const button = document.querySelector('.position-toggle');

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
            r.querySelector('.s-max').value === ''
              ? null
              : Number(
                r.querySelector('.s-max').value
              )

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

      setValueIfExists(
        'commands',
        d.commands,
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
       ZIP 解析
    ========================================================= */

    /*
      解析本工具建立的 Store ZIP。
    
      ZIP 內容：
    
        __data.json
        .token
        <sha256>.png
        <sha256>.png
        ...
    
      目前工具產生的 ZIP 使用：
        Store / 不壓縮
    */



    /*
      讀取 ZIP Little Endian 16-bit
    */



    /*
      讀取 ZIP Little Endian 32-bit
    */



    /* =========================================================
       ZIP 匯入
    ========================================================= */

    /* =========================================================
       匯入輔助函式
    ========================================================= */

    function setValueIfExists(id, value, fallback = '') {

      if ($(id)) {

        $(id).value =
          value == null
            ? fallback
            : String(value);

      }

    }


    function setNumberIfExists(id, value) {

      if ($(id) && value !== undefined && value !== null) {

        const n =
          Number(value);

        if (!Number.isNaN(n)) {

          $(id).value = n;

        }

      }

    }


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

      $('color').value = '#ff0000';


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
          row.querySelector('.s-max').value === ''
            ? 0
            : Number(
              row.querySelector('.s-max').value
            ) || 0

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
      CRC-32
    */



    /*
      Little Endian 16-bit
    */



    /*
      Little Endian 32-bit
    */



    /*
      合併 Uint8Array
    */



    /*
      建立最簡單的 ZIP：
      Store / 不壓縮
    
      ZIP 根目錄直接放：
        __data.json
        .token
        <hash>.png
    */



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
       下載 CCFOLIA Room ZIP
    ========================================================= */


    /* =========================================================
       導覽側欄：每次展開隨機顯示一張導覽人員圖片
       圖片放在 HTML 同一層的 guide-images 資料夾中，命名 1.png～5.png。
    ========================================================= */
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

      const guideImages = [1, 2, 3, 4, 5];
      const chosen = guideImages[Math.floor(Math.random() * guideImages.length)];
      image.onerror = function () {
        this.onerror = null;
        this.alt = '找不到導覽圖片，請確認 guide-images 資料夾內有 1.png 至 5.png';
        this.removeAttribute('src');
      };
      image.src = './guide-images/' + chosen + '.png';
      image.alt = '導覽人員 ' + chosen;

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
    }

    /* =========================================================
       ESC 關閉匯入視窗
    ========================================================= */

    document.addEventListener(
      'keydown',
      event => {

        if (event.key === 'Escape') {
          if ($('importModal').classList.contains('show')) closeImportModal();
          if ($('navSidebar').classList.contains('show')) closeGuideSidebar();
        }

      }
    );

/* =========================================================
       基本工具
    ========================================================= */

    const $ = id => document.getElementById(id);

    // SHA-256 格式的檔名不顯示；一般原始檔名照常顯示。
    function isEncodedImageFilename(filename) {
      return /^[a-f0-9]{64}\.(?:png|jpe?g|gif|webp)$/i.test(String(filename || '').trim());
    }

    /* =========================================================
       主圖片：本機 PNG
    ========================================================= */

    let selectedImageFile = null;
    let selectedImageBytes = null;
    let selectedImageHash = null;
    let selectedImageExtension = 'png';
    let selectedImageObjectURL = null;

    const faceImageData = new WeakMap();




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

    // 圖片檔案大小上限：5 MB（以 5 × 1024 × 1024 bytes 計算）。
    const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

    // 僅允許 PNG、JPEG、GIF、WebP；副檔名以實際檔案名稱為準。
    function getSupportedImageExtension(file) {
      const ext = String(file?.name || '').toLowerCase().split('.').pop();
      return ({ png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp' })[ext] || null;
    }

    function getImageMimeType(extension) {
      return ({ png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' })[extension] || 'application/octet-stream';
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
      selectedImageExtension = 'png';

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


      // 檢查圖片大小，超過 5 MB 就拒絕載入。
      if (file.size > MAX_IMAGE_SIZE) {
        $('originalImageName').innerHTML = '<span class="warn">❌ 圖片不能超過 5 MB（目前 ' + (file.size / 1024 / 1024).toFixed(2) + ' MB）。</span>';
        $('originalImageName').style.display = 'block';
        $('imageFile').value = '';
        return;
      }

      // SHA-256 對原始圖片 bytes 計算，副檔名保留在 ZIP 檔名中。
      const extension = getSupportedImageExtension(file);

      if (!extension) {

        $('originalImageName').innerHTML =
          '<span class="warn">❌ 僅支援 PNG、JPEG、GIF、WebP 圖片。</span>';

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
        selectedImageExtension = extension;


        /*
          ZIP 裡的實際檔名
        */
        const imageFilename =
          hash + '.' + extension;


        /*
          iconUrl 使用 ZIP 裡真正的檔名
        */
        $('iconUrl').value =
          imageFilename;


        // 不顯示 SHA-256 格式檔名；一般檔名直接顯示，不加「原始檔名：」標籤。
        if (isEncodedImageFilename(file.name)) {
          $('originalImageName').textContent = '';
          $('originalImageName').style.display = 'none';
        } else {
          $('originalImageName').textContent = file.name;
          $('originalImageName').style.display = 'block';
        }

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
        if (file.size > MAX_IMAGE_SIZE) {
          alert('差分圖片不能超過 5 MB：' + file.name + '（' + (file.size / 1024 / 1024).toFixed(2) + ' MB）');
          continue;
        }
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

      if (file.size > MAX_IMAGE_SIZE) {
        alert('差分圖片不能超過 5 MB：' + file.name + '（' + (file.size / 1024 / 1024).toFixed(2) + ' MB）');
        return;
      }

      const extension = getSupportedImageExtension(file);

      if (!extension) {
        alert('差分圖片僅支援 PNG、JPEG、GIF、WebP：' + file.name);
        return;
      }

      try {

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const hash = await sha256Hex(bytes);
        const filename = hash + '.' + extension;

        faceImageData.set(
          row,
          {
            file,
            bytes,
            hash,
            filename,
            extension
          }
        );

        const urlInput = row.querySelector('.f-url');
        urlInput.value = filename;

        // 自動帶入圖片名稱時，使用所選圖片的檔名並移除副檔名。
        const autoLabel = $('autoFaceLabel');
        const labelInput = row.querySelector('.f-label');
        if (autoLabel && autoLabel.checked && labelInput) {
          const imageName = file.name.replace(/\.[^.]+$/, '');
          labelInput.value = makeAutoFaceLabel(imageName);
        }

        const originalName = row.querySelector('.face-original-name');
        if (originalName) {
          if (isEncodedImageFilename(file.name)) {
            originalName.textContent = '';
            originalName.style.display = 'none';
          } else {
            originalName.textContent = file.name;
            originalName.style.display = '';
          }
        }

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
        alert('差分圖片處理失敗，請確認圖片是否有效且格式為 PNG、JPEG、GIF 或 WebP：' + file.name);

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

    </div>

    <div class="face-image-info">
      <button type="button" class="face-upload-tile" aria-label="點擊選擇差分圖片">
        <span class="face-upload-placeholder" aria-hidden="true">
          <span class="face-upload-plus">＋</span>
          <span>新增圖片</span>
        </span>
        <img class="face-preview" alt="差分圖片預覽" draggable="false" style="display:none">
      </button>
      <input
        id="faceFile_${index}"
        class="f-file file-select-input"
        type="file"
        accept="image/png,.png,image/jpeg,.jpg,.jpeg,image/gif,.gif,image/webp,.webp"
        multiple
      >
      <div class="face-original-name"></div>
      <div class="face-hash-name"></div>
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

        const uploadTile = div.querySelector('.face-upload-tile');
        uploadTile.addEventListener('click', () => fileInput.click());

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

      if (typeof window.syncCharacterPreviewName === 'function') {
        window.syncCharacterPreviewName();
      }
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
      selectedImageExtension = 'png';

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

      // 將一般表單欄位還原成 HTML 預設值，而不是一律清成 0 或空字串。
      // checkbox / radio 則還原原本的勾選狀態；檔案欄位另外由上方清除。
      document
        .querySelectorAll('input,textarea,select')
        .forEach(x => {
          if (x.type === 'file' || x.type === 'button' || x.type === 'submit') return;

          if (x.type === 'checkbox' || x.type === 'radio') {
            x.checked = x.defaultChecked;
          } else if (x.tagName === 'SELECT') {
            Array.from(x.options).forEach(option => {
              option.selected = option.defaultSelected;
            });
          } else {
            x.value = x.defaultValue;
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

      // 差分也恢復初始預設值，避免清空後整個差分區域變成空白。
      addFace({
        iconUrl: '',
        label: '@通常'
      });


      // 使用與頁面初次載入完全相同的預設資料（HP／MP／San 數值皆維持空白）。
      defaultStatuses.forEach(s => addStatus({
        label: s.label,
        value: s.value,
        max: s.max
      }));


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
        if (imageBytes.length > MAX_IMAGE_SIZE) throw new Error('差分圖片不能超過 5 MB：' + item.path);
        const ext = String(item.ext || item.path.split('.').pop()).toLowerCase();
        if (!['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) throw new Error('差分圖片僅支援 PNG、JPEG、GIF、WebP：' + item.path);
        const filename = item.path.split('/').pop();
        const variant = String(group.variant || '').trim();
        const desc = String(item.desc == null ? '' : item.desc).trim();
        const faceLabel = (variant ? variant + '-' : '') + desc;
        files.push({
          file: new File([imageBytes], filename, { type: getImageMimeType(ext === 'jpg' ? 'jpeg' : ext) }),
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

/* =========================================================
   全頁面拖放匯入：自動辨識 Room ZIP／差分 ZIP／圖片
   不變更原有兩個匯入按鈕與其匯入流程。
========================================================= */
(function initGlobalFileDropImport() {
  let dropImportBusy = false;

  function isSupportedDroppedImage(file) {
    return !!(file && getSupportedImageExtension(file));
  }

  function showDropImportError(message) {
    // 拖曳匯入錯誤使用與選擇圖片時相同的阻斷式錯誤視窗，
    // 避免提示被成功匯入的 Toast 覆蓋或一閃而過。
    alert(message);
  }

  async function importDroppedImages(files) {
    const supportedFiles = files.filter(isSupportedDroppedImage);
    if (!supportedFiles.length) return false;

    // 拖放匯入時先檢查大小，超過 5 MB 的檔案不列入匯入數量，
    // 也不建立差分列，避免最後仍顯示「已匯入」但實際沒有匯入的誤導訊息。
    const oversizedFiles = supportedFiles.filter(file => file.size > MAX_IMAGE_SIZE);
    const validFiles = supportedFiles.filter(file => file.size <= MAX_IMAGE_SIZE);

    if (oversizedFiles.length) {
      const names = oversizedFiles.map(file => file.name).join('、');
      showDropImportError('拖曳匯入失敗：圖片不能超過 5 MB。\n' + names);
    }
    if (!validFiles.length) return false;

    // 拖入圖片時，移除最初預設的空白差分列，避免它被留在匯入圖片前面。
    // 只移除第一列且尚未載入圖片的空列；其他既有差分資料不受影響。
    const firstRow = $('facesList').firstElementChild;
    if (firstRow) {
      const firstRowImage = faceImageData.get(firstRow);
      const firstRowUrl = firstRow.querySelector('.f-url')?.value || '';
      const firstRowPreview = firstRow.querySelector('.face-preview');
      if (!firstRowImage && !firstRowUrl && !(firstRowPreview && firstRowPreview.getAttribute('src'))) {
        firstRow.remove();
      }
    }

    let importedCount = 0;
    for (const file of validFiles) {
      addFace({ label: '', iconUrl: '' });
      const row = $('facesList').lastElementChild;
      await processFaceImageFile(file, row);
      importedCount++;
    }
    renumber('face');
    generate();
    if (importedCount > 0) {
      toast('已自動匯入 ' + importedCount + ' 張差分圖片。');
    }
    return importedCount > 0;
  }

  async function importDroppedZip(file) {
    // 先讀取 ZIP 目錄判斷種類，避免把差分 ZIP 交給 Room ZIP 匯入器。
    const entries = await readZipEntries(file);
    if (entries.has('sprite-namer.json')) {
      await importFaceZIP({ target: { files: [file], value: '' } });
      return;
    }

    // CCFOLIA Room ZIP 必須包含 __data.json；沿用原本 Room ZIP 匯入函式。
    if (entries.has('__data.json')) {
      if (typeof window.handleZIPImport !== 'function') {
        throw new Error('找不到原本的 Room ZIP 匯入功能，請確認 zip.js 已正常載入。');
      }
      await window.handleZIPImport({ target: { files: [file], value: '' } });
      return;
    }

    throw new Error('無法辨識這個 ZIP。請拖入 CCFOLIA Room ZIP，或包含 sprite-namer.json 的差分 ZIP。');
  }

  async function handleDroppedFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || dropImportBusy) return;

    const zipFiles = files.filter(file => /\.zip$/i.test(file.name || ''));
    const imageFiles = files.filter(isSupportedDroppedImage);
    const unsupported = files.filter(file => !zipFiles.includes(file) && !imageFiles.includes(file));

    if (zipFiles.length && imageFiles.length) {
      showDropImportError('請一次拖入 ZIP 壓縮檔或圖片，不要混合拖入。');
      return;
    }
    if (zipFiles.length > 1) {
      showDropImportError('一次請拖入一個 ZIP 壓縮檔。');
      return;
    }
    if (unsupported.length || (!zipFiles.length && !imageFiles.length)) {
      showDropImportError('目前僅支援 CCFOLIA Room ZIP、差分 ZIP，以及 PNG／JPEG／GIF／WebP 圖片。');
      return;
    }

    dropImportBusy = true;
    document.body.classList.add('file-drop-importing');
    try {
      if (zipFiles.length) await importDroppedZip(zipFiles[0]);
      else await importDroppedImages(imageFiles);
    } catch (error) {
      console.error('拖放匯入失敗：', error);
      showDropImportError('拖放匯入失敗：' + (error && error.message ? error.message : String(error)));
    } finally {
      dropImportBusy = false;
      document.body.classList.remove('file-drop-importing');
    }
  }

  // 拖曳經過網頁任意位置時，阻止瀏覽器直接開啟檔案。
  window.addEventListener('dragover', event => {
    if (event.dataTransfer && Array.from(event.dataTransfer.types || []).includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  });

  window.addEventListener('drop', event => {
    if (!event.dataTransfer || !event.dataTransfer.files || !event.dataTransfer.files.length) return;
    event.preventDefault();
    event.stopPropagation();
    handleDroppedFiles(event.dataTransfer.files);
  });
})();



/* =========================================================
   差分長按拖曳設為主圖片
   - 長按差分預覽後拖到側邊 LIVE PREVIEW，即可設為主圖片。
========================================================= */
(function initFaceNameAndMainImageDrag() {
  const facesList = document.getElementById('facesList');
  if (!facesList) return;

  // 手機瀏覽器有時會把手指落在 img 上的操作當成圖片拖曳，
  // 即使 draggable=false 仍可能吃掉頁面捲動手勢。
  // 手機版讓觸控事件穿透圖片交給外層卡片，並明確恢復原生垂直捲動；
  // 桌面版不套用這些規則，因此差分拖曳換主圖功能不受影響。
  const mobileFaceTouchStyle = document.createElement('style');
  mobileFaceTouchStyle.textContent = `
    @media (max-width: 768px), (pointer: coarse) {
      #facesList,
      #facesList .repeat,
      #facesList .face-upload-tile,
      #facesList .face-preview {
        touch-action: pan-y pinch-zoom !important;
      }

      #facesList .face-preview {
        pointer-events: none !important;
        -webkit-user-drag: none !important;
        user-select: none !important;
        -webkit-user-select: none !important;
      }
    }
  `;
  document.head.appendChild(mobileFaceTouchStyle);

  // 主圖片預覽只能點擊開啟選圖，不提供原生拖曳；差分圖片也關閉瀏覽器原生拖曳，
  // 保留下方自訂的「長按差分 → 拖到 LIVE PREVIEW」手勢。
  const disableInternalImageDrag = () => {
    document.querySelectorAll('#imagePreview, .quick-preview-image, #facesList .face-preview')
      .forEach(image => image.setAttribute('draggable', 'false'));
  };
  disableInternalImageDrag();
  new MutationObserver(disableInternalImageDrag).observe(document.body, {
    childList: true, subtree: true
  });
  document.addEventListener('dragstart', event => {
    if (event.target.closest('#imagePreview, .quick-preview-image, #facesList .face-preview')) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  const encodedHashPattern = /[a-f0-9]{64}\.(?:png|jpe?g|gif|webp)(?:$|[\s"'<>])/i;

  function hideEncodedOriginalNames(root) {
    const scope = root && root.querySelectorAll ? root : facesList;
    const selector = '.face-original-name, #originalImageName';
    const candidates = [];
    if (scope.matches && scope.matches(selector)) candidates.push(scope);
    candidates.push(...scope.querySelectorAll(selector));
    candidates.forEach(element => {
      const text = element.textContent || '';
      if (encodedHashPattern.test(text.trim())) {
        element.textContent = '';
        element.style.display = 'none';
      }
    });
  }

  hideEncodedOriginalNames(facesList);
  const nameObserver = new MutationObserver(records => {
    records.forEach(record => {
      if (record.type === 'characterData' || record.type === 'childList') {
        const target = record.target.nodeType === Node.ELEMENT_NODE
          ? record.target
          : record.target.parentElement;
        if (target) hideEncodedOriginalNames(target.closest?.('.face-original-name, #originalImageName') || target.closest?.('.repeat') || target);
      }
    });
  });
  nameObserver.observe(facesList, { subtree: true, childList: true, characterData: true });
  const mainOriginalName = document.getElementById('originalImageName');
  if (mainOriginalName) {
    hideEncodedOriginalNames(mainOriginalName);
    nameObserver.observe(mainOriginalName, { subtree: true, childList: true, characterData: true });
  }


  let activeRow = null;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let dragging = false;
  let previewTarget = null;
  let suppressFaceTileClickUntil = 0;
  let suppressQuickPreviewClickUntil = 0;

  // 拖曳差分圖片完成後，阻止瀏覽器把放開動作當成點擊，避免誤開圖片選擇器。
  document.addEventListener('click', event => {
    if (Date.now() > suppressFaceTileClickUntil && Date.now() > suppressQuickPreviewClickUntil) return;
    if (event.target.closest('.face-upload-tile, .quick-preview')) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, true);

  function clearDrag() {
    dragging = false;
    activeRow = null;
    activePointerId = null;
    if (previewTarget) previewTarget.classList.remove('face-drop-target');
    previewTarget = null;
    document.body.classList.remove('face-image-dragging');
  }

  function getPreviewTarget() {
    return document.querySelector('.quick-preview');
  }

  facesList.addEventListener('pointerdown', event => {
    // 手機版差分僅保留點擊選圖，不啟用拖曳換主圖；桌面版維持原本操作。
    if (window.matchMedia('(max-width: 768px)').matches) return;
    // 唯一允許的拖曳來源是差分卡片內已載入的圖片；主圖不是拖曳來源。
    const image = event.target.closest('#facesList .face-preview');
    if (!image || !image.getAttribute('src') || !image.closest('.face-upload-tile')) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    clearDrag();
    activeRow = image.closest('.repeat');
    activePointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
  });

  document.addEventListener('pointermove', event => {
    if (activePointerId !== event.pointerId) return;
    // 不再等待長按計時：按住差分圖片後，只要開始拖動便立即進入拖曳模式。
    // 沒有移動的單擊則不介入，保留原本點擊卡片選擇／更換圖片的行為。
    if (!dragging) {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) <= 8) return;
      dragging = true;
      previewTarget = getPreviewTarget();
      if (previewTarget) previewTarget.classList.add('face-drop-target');
      document.body.classList.add('face-image-dragging');
      if (navigator.vibrate && event.pointerType !== 'mouse') navigator.vibrate(25);
    }
    event.preventDefault();
    // 手機版預覽位於表單下方；拖曳時靠近螢幕邊緣會自動捲動頁面。
    if (event.clientY > window.innerHeight - 64) window.scrollBy(0, 14);
    else if (event.clientY < 64) window.scrollBy(0, -14);
    const target = getPreviewTarget();
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const over = event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom;
    target.classList.toggle('face-drop-target', over);
  }, { passive: false });

  document.addEventListener('pointerup', async event => {
    if (activePointerId !== event.pointerId) return;
    const shouldApply = dragging && activeRow;
    const row = activeRow;
    if (shouldApply) {
      suppressFaceTileClickUntil = Date.now() + 650;
      suppressQuickPreviewClickUntil = Date.now() + 650;
    }
    const target = getPreviewTarget();
    const rect = target?.getBoundingClientRect();
    const droppedOnPreview = !!(shouldApply && rect &&
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom);
    clearDrag();
    if (!droppedOnPreview) return;
    const imageData = faceImageData.get(row);
    let file = imageData && imageData.file;
    // Room ZIP 匯入的圖片也可能只有預覽 Object URL，必要時從預覽取回 Blob。
    if (!file) {
      const preview = row.querySelector('.face-preview');
      if (!preview || !preview.src) return;
      try {
        const response = await fetch(preview.src);
        const blob = await response.blob();
        const suggestedName = (row.querySelector('.f-url')?.value || 'face-image.png').split('/').pop();
        file = new File([blob], suggestedName, { type: blob.type || 'image/png' });
      } catch (error) {
        console.error('無法讀取差分預覽圖片：', error);
        return;
      }
    }
    await handleImageFile({ target: { files: [file] } });
  });

  document.addEventListener('pointercancel', event => {
    if (activePointerId === event.pointerId) clearDrag();
  });
})();

/* =========================================================
   下載 Room ZIP 時骰 1d100 的彩蛋
   - 點擊「Room ZIP」下載按鈕時骰一次 1d100。
   - 骰到 1   → 大成功：五彩炫彩畫面＋巨大「你是今天的幸運兒」。
   - 骰到 100 → 大失敗：畫面故障、漸紅漸黑、血從頂端流到底部。
   - 其他點數：不顯示點數，也沒有任何效果。
   - 效果約 10 秒後自動消失；樣式全由本段程式動態插入，不需修改 HTML／CSS。
========================================================= */
(function initRoomZipDiceEasterEgg() {
  const EFFECT_MS = 10000;   // 效果總長度
  const FADE_MS = 700;       // 結束前的淡出時間
  const Z = 2147483000;      // 疊在所有介面之上
  let running = false;

  function rand(a, b) { return a + Math.random() * (b - a); }
  function rollD100() { return Math.floor(Math.random() * 100) + 1; }

  const css = document.createElement('style');
  css.textContent = `
    .dice-fx { position: fixed; inset: 0; pointer-events: none; }
    .dice-fx-blocker { z-index: ${Z + 9}; pointer-events: auto; cursor: progress; }
    .dice-fx-fade { opacity: 0 !important; transition: opacity ${FADE_MS}ms ease-out; }

    /* ---------- 巨大文字 ---------- */
    .dice-text { z-index: ${Z + 6}; display: flex; align-items: center; justify-content: center;
      text-align: center; padding: 0 2vw; box-sizing: border-box; }
    .dice-text-inner { font-family: "Noto Sans TC","PingFang TC","Microsoft JhengHei","Heiti TC",sans-serif;
      font-weight: 900; font-size: clamp(44px, 11vw, 260px); line-height: 1.15; letter-spacing: .02em; white-space: nowrap; }
    .dice-text-inner > span { display: inline-block; }
    @media (max-width: 760px) {
      .dice-text-inner { font-size: 17vw; }
      .dice-text-inner > span { display: block; }
    }

    /* ---------- 大成功 ---------- */
    .dice-win-a { z-index: ${Z + 1}; mix-blend-mode: color; overflow: hidden; opacity: .92; }
    .dice-win-a i { position: absolute; left: 50%; top: 50%; width: 240vmax; height: 240vmax; margin: -120vmax 0 0 -120vmax;
      background: conic-gradient(#ff0040, #ff8800, #ffee00, #22ff66, #00e5ff, #3a5bff, #c400ff, #ff0040);
      animation: diceSpin 5s linear infinite; }
    .dice-win-b { z-index: ${Z + 2}; mix-blend-mode: overlay; opacity: .75;
      background: linear-gradient(105deg, #ff0080, #ff8c00, #fff200, #00e676, #00b0ff, #7c4dff, #ff0080);
      background-size: 300% 100%; animation: diceSlide 2.2s linear infinite; }
    .dice-win-shine { z-index: ${Z + 3};
      background: linear-gradient(115deg, transparent 38%, rgba(255,255,255,.4) 50%, transparent 62%);
      background-size: 250% 100%; animation: diceShine 1.8s ease-in-out infinite; }
    .dice-confetti { z-index: ${Z + 4}; }
    .dice-text-win .dice-text-inner {
      background: linear-gradient(90deg, #ff1744, #ff9100, #ffea00, #00e676, #00e5ff, #2979ff, #d500f9, #ff1744);
      background-size: 300% 100%;
      -webkit-background-clip: text; background-clip: text;
      color: transparent; -webkit-text-fill-color: transparent;
      -webkit-text-stroke: .03em #fff;
      filter: drop-shadow(0 0 .12em rgba(255,255,255,.95)) drop-shadow(0 .05em .08em rgba(0,0,0,.45));
      animation: dicePop .9s cubic-bezier(.2,1.5,.4,1) both,
                 diceSlide 2s linear infinite,
                 diceWobble 1.4s ease-in-out .9s infinite alternate;
    }
    @keyframes diceSpin { to { transform: rotate(360deg); } }
    @keyframes diceSlide { to { background-position: 300% 0; } }
    @keyframes diceShine { from { background-position: 125% 0; } to { background-position: -125% 0; } }
    @keyframes dicePop {
      0% { transform: scale(0) rotate(-12deg); opacity: 0; }
      60% { transform: scale(1.18) rotate(3deg); opacity: 1; }
      100% { transform: scale(1) rotate(0); opacity: 1; }
    }
    @keyframes diceWobble {
      from { transform: scale(1) rotate(-1.8deg); }
      to { transform: scale(1.07) rotate(1.8deg); }
    }

    /* ---------- 大失敗 ---------- */
    .dice-lose-dark { z-index: ${Z + 1}; background: rgba(0,0,0,0); animation: diceDarken 8s linear forwards; }
    .dice-lose-scan { z-index: ${Z + 2};
      background:
        repeating-linear-gradient(0deg, rgba(0,0,0,.35) 0 1px, transparent 1px 3px),
        radial-gradient(ellipse at center, transparent 40%, rgba(90,0,0,.55) 100%);
      animation: diceScan .18s steps(3) infinite; }
    .dice-fx.dice-bar { z-index: ${Z + 3}; inset: auto; left: 0; right: 0; height: 10px; display: none; }
    .dice-blood { z-index: ${Z + 4}; }
    .dice-text-lose { animation: diceCreep 8.4s linear 1.6s both; }
    .dice-text-lose .dice-text-inner {
      position: relative; filter: url(#diceDistort);
      color: #d80c0c;
      text-shadow: 0 0 .1em rgba(255,0,0,.8), 0 .05em .1em #000;
      animation: diceLoseIn 1.4s ease-out 1.6s both, diceLoseGlitch .8s steps(1) 1.6s infinite;
    }
    @keyframes diceDarken {
      0%   { background: rgba(60,0,0,0); }
      25%  { background: rgba(110,0,0,.35); }
      50%  { background: rgba(70,0,0,.65); }
      75%  { background: rgba(25,0,0,.9); }
      100% { background: rgb(0,0,0); }
    }
    @keyframes diceScan { to { background-position: 0 3px, 0 0; } }
    @keyframes diceLoseIn {
      0% { opacity: 0; } 8% { opacity: .9; } 12% { opacity: 0; } 22% { opacity: .6; } 26% { opacity: 0; }
      40% { opacity: 1; } 46% { opacity: .15; } 52% { opacity: 1; } 100% { opacity: 1; }
    }
    @keyframes diceLoseGlitch {
      0%   { transform: none; clip-path: none; text-shadow: .03em 0 #ff0033, -.03em 0 #00e5ff, 0 .05em .1em #000; }
      12%  { transform: translate(-.03em,.01em) skewX(-6deg); clip-path: inset(0 0 55% 0); }
      14%  { transform: translate(.04em,0) skewX(5deg); clip-path: inset(48% 0 0 0); }
      16%  { transform: none; clip-path: none; }
      40%  { transform: translate(.02em,-.01em); text-shadow: -.04em 0 #ff0033, .04em 0 #00e5ff, 0 .05em .1em #000; }
      42%  { transform: translate(-.05em,0) skewX(8deg); clip-path: inset(20% 0 45% 0); }
      44%  { transform: none; clip-path: none; }
      70%  { transform: translate(.03em,.02em); text-shadow: .05em 0 #ff0033, -.05em 0 #00e5ff, 0 .05em .1em #000; }
      73%  { transform: translate(.06em,-.01em) skewX(-7deg); clip-path: inset(60% 0 0 0); }
      76%  { transform: none; clip-path: none; }
    }

    /* 大失敗文字：參考 CSS 文字故障做法（偽元素複製文字＋切片），再加上破形與撕裂 */
    .dice-text-lose .dc { display: inline-block; font-weight: inherit; transform-origin: 50% 60%; }
    .dice-text-lose .dice-text-inner > span { position: relative; }
    .dice-text-lose .dice-text-inner > span::before,
    .dice-text-lose .dice-text-inner > span::after {
      content: attr(data-t); position: absolute; inset: 0; text-align: inherit; pointer-events: none;
      clip-path: inset(0 0 100% 0);
    }
    /* 白熱切片：偏移、帶紅邊、高對比 */
    .dice-text-lose .dice-text-inner > span::before {
      color: rgba(255,255,255,.92); text-shadow: .03em 0 #ff0000; filter: contrast(200%); z-index: 2;
      animation: diceSliceA 1.1s steps(1) 1.6s infinite;
    }
    /* 黑色缺口：整段切片被挖成黑底，只剩偏移的青邊字形，文字看起來被撕破 */
    .dice-text-lose .dice-text-inner > span::after {
      color: rgba(255,255,255,.8); background: rgba(0,0,0,.92); text-shadow: -.03em 0 #00e5ff;
      filter: contrast(200%); mix-blend-mode: darken; z-index: 3;
      animation: diceSliceB 1.7s steps(1) 1.8s infinite;
    }
    .dice-text-lose .dice-text-inner > span:nth-child(2)::before { animation-duration: 1.3s; animation-delay: 1.9s; }
    .dice-text-lose .dice-text-inner > span:nth-child(2)::after { animation-duration: 2.1s; animation-delay: 2.2s; }
    /* 上下游走的黑色撕裂橫條 */
    .dice-cut { position: absolute; left: -2%; width: 104%; height: .05em; top: -10%; background: #000; z-index: 4; opacity: 0;
      animation: diceCutA 2.3s ease-out 1.8s infinite; }
    .dice-cut2 { height: .028em; animation: diceCutB 1.7s ease-out 2.4s infinite; }
    @keyframes diceSliceA {
      0%, 100% { clip-path: inset(0 0 100% 0); transform: none; }
      14% { clip-path: inset(12% 0 62% 0); transform: translateX(-.05em); }
      18% { clip-path: inset(0 0 100% 0); transform: none; }
      46% { clip-path: inset(58% 0 18% 0); transform: translateX(.06em); }
      50% { clip-path: inset(0 0 100% 0); transform: none; }
      73% { clip-path: inset(30% 0 48% 0); transform: translateX(-.08em); }
      76% { clip-path: inset(0 0 100% 0); transform: none; }
      90% { clip-path: inset(70% 0 8% 0); transform: translateX(.04em); }
      93% { clip-path: inset(0 0 100% 0); transform: none; }
    }
    @keyframes diceSliceB {
      0%, 100% { clip-path: inset(0 0 100% 0); transform: none; }
      10% { clip-path: inset(0 0 66% 0); transform: translateX(.05em); }
      13% { clip-path: inset(40% 0 20% 0); transform: translateX(-.07em); }
      16% { clip-path: inset(0 0 100% 0); transform: none; }
      52% { clip-path: inset(20% 0 40% 0); transform: translateX(.09em); }
      55% { clip-path: inset(62% 0 6% 0); transform: translateX(-.05em); }
      58% { clip-path: inset(0 0 100% 0); transform: none; }
      81% { clip-path: inset(5% 0 74% 0); transform: translateX(.06em); }
      84% { clip-path: inset(48% 0 24% 0); transform: translateX(-.1em); }
      88% { clip-path: inset(0 0 100% 0); transform: none; }
    }
    @keyframes diceCutA {
      0%, 100% { top: -10%; opacity: 0; } 8% { top: 38%; opacity: 1; } 12% { top: 10%; } 18% { top: 72%; }
      24% { top: 30%; } 30% { opacity: 0; }
    }
    @keyframes diceCutB {
      0%, 100% { top: 110%; opacity: 0; } 10% { top: 62%; opacity: 1; } 16% { top: 24%; } 22% { top: 85%; } 28% { opacity: 0; }
    }
    @keyframes diceCreep { from { transform: scale(1); } to { transform: scale(1.07); } }

    /* 大失敗期間：整個頁面（含文字與面板）持續故障抖動、色差 */
    body.dice-lose-active .wrap { animation: diceShake .26s steps(1) infinite; }
    body.dice-lose-active .top-nav { animation: diceShadow .2s steps(1) infinite; }
    @keyframes diceShake {
      0%   { transform: translate(0,0); filter: none; text-shadow: 2px 0 rgba(255,0,60,.9), -2px 0 rgba(0,229,255,.9); }
      25%  { transform: translate(-5px,1px) skewX(-.6deg); text-shadow: -3px 0 rgba(255,0,60,.9), 3px 0 rgba(0,229,255,.9); }
      50%  { transform: translate(4px,-2px); filter: contrast(1.35) saturate(1.6); text-shadow: 4px 1px rgba(255,0,60,.9), -4px -1px rgba(0,229,255,.9); }
      75%  { transform: translate(-2px,2px) skewX(.8deg); filter: hue-rotate(-25deg) saturate(2); text-shadow: -2px 0 rgba(255,0,60,.9), 2px 0 rgba(0,229,255,.9); }
    }
    @keyframes diceShadow {
      0%   { text-shadow: 2px 0 rgba(255,0,60,.9), -2px 0 rgba(0,229,255,.9); }
      50%  { text-shadow: -3px 0 rgba(255,0,60,.9), 3px 0 rgba(0,229,255,.9); }
    }
  `;
  document.head.appendChild(css);

  /* ---------- 大成功：彩紙 ---------- */
  function startConfetti(cv) {
    const c = cv.getContext('2d');
    const colors = ['#ff1744', '#ff9100', '#ffea00', '#00e676', '#00e5ff', '#2979ff', '#d500f9', '#ff4081', '#ffffff'];
    const ps = [];
    let W = 0, H = 0, raf = 0, alive = true, last = performance.now(), spawn = 0;
    const t0 = last;

    function fit() {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * d); cv.height = Math.round(H * d);
      c.setTransform(d, 0, 0, d, 0, 0);
    }
    function piece(x, y, vx, vy) {
      ps.push({ x, y, vx, vy, rot: rand(0, 6.28), vr: rand(-8, 8), w: rand(6, 14), h: rand(10, 22),
        col: colors[Math.floor(Math.random() * colors.length)], tilt: rand(0, 6.28), tv: rand(4, 10),
        round: Math.random() < .25 });
    }
    fit();
    window.addEventListener('resize', fit);

    // 兩側下方各發射一批彩紙
    const power = Math.max(.6, Math.min(H, 900) / 900);
    for (let i = 0; i < 110; i++) {
      const a = rand(.35, 1.3), s = rand(650, 1350) * power;
      piece(0, H, Math.cos(a) * s, -Math.sin(a) * s);
      piece(W, H, -Math.cos(a) * s, -Math.sin(a) * s);
    }

    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(.05, (now - last) / 1000); last = now;
      if (now - t0 < 8500) {
        spawn += dt * 45;
        while (spawn >= 1) { spawn--; piece(rand(0, W), -20, rand(-40, 40), rand(40, 140)); }
      }
      c.clearRect(0, 0, W, H);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.vy += 700 * dt;
        p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.rot += p.vr * dt; p.tilt += p.tv * dt;
        if (p.y > H + 30 || p.x < -60 || p.x > W + 60) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
        c.save();
        c.translate(p.x, p.y); c.rotate(p.rot); c.scale(1, Math.cos(p.tilt));
        c.fillStyle = p.col;
        if (p.round) { c.beginPath(); c.arc(0, 0, p.w / 2, 0, 6.2832); c.fill(); }
        else c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        c.restore();
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }

  /* ---------- 大失敗：從螢幕頂端流下的血 ---------- */
  function startBlood(cv) {
    const c = cv.getContext('2d');
    let W = 0, H = 0, raf = 0, alive = true;
    const t0 = performance.now();

    function fit() {
      const d = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * d); cv.height = Math.round(H * d);
      c.setTransform(d, 0, 0, d, 0, 0);
    }
    fit();
    window.addEventListener('resize', fit);

    const count = Math.max(10, Math.round(W / 46));
    const drips = [];
    for (let i = 0; i < count; i++) {
      drips.push({
        xr: (i + rand(.1, .9)) / count,
        w: 5 + Math.pow(Math.random(), 2.5) * 22, // 多數偏細，少數較粗
        delay: rand(0, 2400),
        dur: rand(3600, 5800),                      // 最晚約 8.2 秒前全部流到底
        ph: rand(0, 6.28)
      });
    }

    function frame(now) {
      if (!alive) return;
      raf = requestAnimationFrame(frame);
      const t = now - t0;
      c.clearRect(0, 0, W, H);

      const grad = c.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#a30000'); grad.addColorStop(1, '#5c0000');

      // 頂端的血帶：先從螢幕最上方漫開，邊緣呈波浪狀
      const band = Math.min(1, t / 1800) * Math.max(46, H * .07);
      const top = new Path2D();
      top.moveTo(0, 0);
      for (let x = 0; x <= W + 12; x += 12) {
        const y = band * (.75 + .25 * Math.sin(x * .018 + t * .0015) + .12 * Math.sin(x * .05 - t * .002));
        top.lineTo(x, y);
      }
      top.lineTo(W, 0); top.closePath();

      // 每一條血流：流速逐漸加快，尖端帶一顆較大的血滴
      const body = new Path2D(), hl = new Path2D();
      for (const d of drips) {
        const p = Math.max(0, Math.min(1, (t - d.delay) / d.dur));
        if (p <= 0) continue;
        const grow = 1 + .1 * p;
        const sw = d.w * .6 * grow, r = d.w * .55 * grow;
        const x = d.xr * W + Math.sin(t * .002 + d.ph) * .6;
        const y = (H + r * 2) * (.3 * p + .7 * p * p);
        body.rect(x - sw / 2, -2, sw, y + 2);
        body.moveTo(x + r, y); body.arc(x, y, r, 0, Math.PI * 2);
        hl.rect(x - sw * .28, 0, Math.max(1, sw * .16), Math.max(0, y - r * .5));
      }

      c.save();
      c.shadowColor = 'rgba(255,20,20,.55)'; c.shadowBlur = 14;
      c.fillStyle = grad;
      c.fill(top); c.fill(body);
      c.restore();
      c.fillStyle = 'rgba(255,120,120,.22)';
      c.fill(hl);
    }
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }

  /* ---------- 執行效果 ---------- */
  function run(kind) {
    running = true;
    const fx = { nodes: [], timers: [], undo: [] };
    const add = (cls, tag) => {
      const el = document.createElement(tag || 'div');
      el.className = 'dice-fx ' + cls;
      document.body.appendChild(el);
      fx.nodes.push(el);
      return el;
    };
    const later = (fn, ms) => { fx.timers.push(setTimeout(fn, ms)); };
    const finish = () => {
      fx.timers.forEach(clearTimeout);
      fx.undo.reverse().forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
      fx.nodes.forEach(n => n.remove());
      running = false;
    };

    // 效果期間擋住誤觸；並避免頁面抖動時出現橫向捲軸。
    add('dice-fx-blocker');
    const prevOverflowX = document.documentElement.style.overflowX;
    document.documentElement.style.overflowX = 'hidden';
    fx.undo.push(() => { document.documentElement.style.overflowX = prevOverflowX; });

    let stopGlitch = () => {};

    if (kind === 'win') {
      add('dice-win-a').innerHTML = '<i></i>';
      add('dice-win-b');
      add('dice-win-shine');
      fx.undo.push(startConfetti(add('dice-confetti', 'canvas')));
      add('dice-text dice-text-win').innerHTML =
        '<div class="dice-text-inner"><span>你是今天的</span><span>幸運兒</span></div>';
    } else {
      document.body.classList.add('dice-lose-active');
      fx.undo.push(() => document.body.classList.remove('dice-lose-active'));
      add('dice-lose-dark');
      add('dice-lose-scan');
      const bars = Array.from({ length: 7 }, () => add('dice-bar'));
      fx.undo.push(startBlood(add('dice-blood', 'canvas')));
      const textEl = add('dice-text dice-text-lose');
      const split = str => Array.from(str).map(ch => '<b class="dc">' + ch + '</b>').join('');
      textEl.innerHTML =
        '<svg style="position:absolute;width:0;height:0" aria-hidden="true"><filter id="diceDistort" x="-5%" y="-15%" width="110%" height="130%">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.012 0.2" numOctaves="2" seed="3" result="n"/>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G"/></filter></svg>' +
        '<div class="dice-text-inner">' +
        '<span data-t="你是今天的">' + split('你是今天的') + '</span>' +
        '<span data-t="幸運兒">' + split('幸運兒') + '</span>' +
        '<i class="dice-cut"></i><i class="dice-cut dice-cut2"></i></div>';

      // 破形：不定時爆發——濾鏡把字形撕裂扭曲，並讓個別字歪斜、拉長、被切掉或閃白，隨時間越來越頻繁
      let stopText = () => {};
      {
        const turb = textEl.querySelector('feTurbulence');
        const disp = textEl.querySelector('feDisplacementMap');
        const chars = Array.from(textEl.querySelectorAll('.dc'));
        const t0 = performance.now();
        let timer = 0, calm = 0, off = false;
        const calmDown = () => {
          disp.setAttribute('scale', '0');
          chars.forEach(c => { c.style.transform = ''; c.style.clipPath = ''; c.style.opacity = ''; c.style.color = ''; });
          textEl.style.opacity = '';
        };
        const burst = () => {
          if (off) return;
          const p = Math.min(1, (performance.now() - t0) / EFFECT_MS);
          turb.setAttribute('seed', String(Math.floor(rand(1, 999))));
          disp.setAttribute('scale', String(Math.round(rand(12, 26 + p * 26))));
          const n = 1 + Math.floor(Math.random() * (2 + p * 2));
          for (let i = 0; i < n; i++) {
            const c = chars[Math.floor(Math.random() * chars.length)];
            c.style.transform = `translate(${rand(-.1, .1)}em, ${rand(-.08, .08)}em) rotate(${rand(-14, 14)}deg) scale(${rand(.85, 1.15)}, ${rand(.7, 1.6)})`;
            const r = Math.random();
            if (r < .3) c.style.clipPath = `inset(${rand(0, 50)}% 0 ${rand(0, 40)}% 0)`;
            else if (r < .45) c.style.opacity = '.15';
            else if (r < .6) c.style.color = '#fff';
          }
          if (Math.random() < .18) textEl.style.opacity = '.35';
          calm = setTimeout(calmDown, rand(70, 150));
          timer = setTimeout(burst, rand(200, 650) * (1.15 - p * .5));
        };
        timer = setTimeout(burst, 1900);
        stopText = () => { off = true; clearTimeout(timer); clearTimeout(calm); calmDown(); };
      }

      // 面板與文字的故障：隨時間越來越頻繁、越來越劇烈
      const targets = Array.from(document.querySelectorAll('.top-nav, .section, .sub, .actions, .zip-status, .site-footer'));
      const saved = new Map(targets.map(el => [el, {
        transform: el.style.transform, filter: el.style.filter, clipPath: el.style.clipPath, opacity: el.style.opacity
      }]));
      let touched = [];
      const restore = () => {
        touched.forEach(el => Object.assign(el.style, saved.get(el)));
        touched = [];
      };
      const start = performance.now();
      let timer = 0, stopped = false;
      const tick = () => {
        if (stopped) return;
        const p = Math.min(1, (performance.now() - start) / EFFECT_MS);
        const inten = Math.min(1, .25 + p * 1.2);
        restore();

        const n = Math.min(targets.length, Math.round(1 + inten * 6));
        for (let i = 0; i < n; i++) {
          const el = targets[Math.floor(Math.random() * targets.length)];
          const dx = rand(-1, 1) * (6 + inten * 26);
          el.style.transform = `translate(${dx}px, ${rand(-1, 1) * 4}px) skewX(${rand(-1, 1) * inten * 14}deg)`;
          const r = Math.random();
          if (r < .25) el.style.filter = `hue-rotate(${rand(0, 360)}deg) saturate(3) contrast(1.4)`;
          else if (r < .4) el.style.filter = 'invert(1)';
          else if (r < .55) el.style.filter = 'blur(1.5px) contrast(2)';
          if (Math.random() < .3) el.style.clipPath = `inset(${rand(0, 60)}% 0 ${rand(0, 40)}% 0)`;
          if (Math.random() < .2) el.style.opacity = String(rand(.3, .8));
          touched.push(el);
        }

        // 橫向色帶：反相／紅／青，後半段改以紅青為主
        bars.forEach(bar => {
          if (Math.random() > inten * .6) { bar.style.display = 'none'; return; }
          bar.style.display = 'block';
          bar.style.top = rand(0, 100) + 'vh';
          bar.style.height = rand(3, 40 + inten * 60) + 'px';
          bar.style.background = 'none';
          bar.style.mixBlendMode = 'normal';
          bar.style.backdropFilter = bar.style.webkitBackdropFilter = 'none';
          const type = p > .7 ? 1 + Math.floor(Math.random() * 2) : Math.floor(Math.random() * 4);
          if (type === 0) bar.style.backdropFilter = bar.style.webkitBackdropFilter = 'invert(1)';
          else if (type === 1) { bar.style.background = 'rgba(255,0,50,.45)'; bar.style.mixBlendMode = 'screen'; }
          else if (type === 2) { bar.style.background = 'rgba(0,229,255,.35)'; bar.style.mixBlendMode = 'screen'; }
          else bar.style.backdropFilter = bar.style.webkitBackdropFilter = 'hue-rotate(180deg) saturate(4)';
        });

        timer = setTimeout(tick, rand(60, 200) * (1.2 - inten * .5));
      };
      tick();
      stopGlitch = () => {
        stopped = true; clearTimeout(timer); restore(); stopText();
        bars.forEach(b => { b.style.display = 'none'; });
        document.body.classList.remove('dice-lose-active');
      };
      fx.undo.push(stopGlitch);
    }

    // 最後 0.7 秒：停止頁面故障並淡出；滿 10 秒後全部移除。
    later(() => { stopGlitch(); fx.nodes.forEach(n => n.classList.add('dice-fx-fade')); }, EFFECT_MS - FADE_MS);
    later(finish, EFFECT_MS);
  }

  // 用事件代理監聽，不改動原本按鈕與 downloadRoomZIP() 的行為。
  document.addEventListener('click', event => {
    const button = event.target && event.target.closest &&
      event.target.closest('button[onclick="downloadRoomZIP()"]');
    if (!button || running) return;
    const roll = rollD100();
    if (roll === 1) run('win');
    else if (roll === 100) run('lose');
  });
})();

/* =========================================================
   頁面互動功能（由 index.html 移入 app.js 統一管理）
   index.html 僅保留對應的 HTML 結構與控制項。
========================================================= */

/* ④ 角色圖片與差分：差分數量顯示 + 手機版分頁切換 + 手機版主圖片框點擊選圖 */
        (function () {
            var sec = document.getElementById('faceSection');
            var list = document.getElementById('facesList');
            var tabs = document.getElementById('faceTabs');
            if (!sec || !list) return;
            function updateFaceCount() {
                var n = 0;
                for (var i = 0; i < list.children.length; i++) {
                    if (list.children[i].classList.contains('repeat')) n++;
                }
                ['faceCountBadge', 'faceTabCount'].forEach(function (id) {
                    var el = document.getElementById(id);
                    if (el) el.textContent = n;
                });
            }
            new MutationObserver(updateFaceCount).observe(list, { childList: true });
            updateFaceCount();
            if (tabs) tabs.addEventListener('click', function (e) {
                var b = e.target.closest('[data-face-tab]');
                if (!b) return;
                var isMain = b.getAttribute('data-face-tab') === 'main';
                sec.classList.toggle('tab-main', isMain);
                sec.classList.toggle('tab-diff', !isMain);
                tabs.querySelectorAll('[data-face-tab]').forEach(function (x) {
                    x.classList.toggle('on', x === b);
                });
            });
            var box = sec.querySelector('.main-image-box');
            if (box) box.addEventListener('click', function (e) {
                if (!window.matchMedia('(max-width: 760px)').matches) return;
                if (e.target.closest('input, button, a')) return;
                if (typeof openMainImagePicker === 'function') openMainImagePicker();
            });
        })();

/* 設定選單：保留各項設定，重新整理或重開瀏覽器後仍會沿用。 */
        (function () {
            const STORAGE_KEYS = {
                mainImageFromFaces: 'ccfolia-setting-main-image-from-faces',
                autoFaceLabel: 'ccfolia-setting-auto-face-label',
                autoFixEducationCommand: 'ccfolia-setting-auto-fix-education-command',
                pollSeconds: 'ccfolia-setting-google-sheets-poll-seconds',
                matchSanMaxToCurrent: 'ccfolia-setting-match-san-max-to-current'
            };

            function readBoolean(key, fallback) {
                try {
                    const value = localStorage.getItem(key);
                    return value === null ? fallback : value === 'true';
                } catch (_) {
                    return fallback;
                }
            }

            function saveSetting(key, value) {
                try { localStorage.setItem(key, String(value)); } catch (_) {}
            }

            window.toggleAppSettings = function () {
                const popover = document.getElementById('appSettingsPopover');
                if (popover) popover.classList.toggle('show');
            };

            function initSettings() {
                const checkboxSettings = [
                    ['mainImageFromFaces', STORAGE_KEYS.mainImageFromFaces, true],
                    ['autoFaceLabel', STORAGE_KEYS.autoFaceLabel, true],
                    ['autoFixEducationCommand', STORAGE_KEYS.autoFixEducationCommand, true],
                    ['matchSanMaxToCurrent', STORAGE_KEYS.matchSanMaxToCurrent, true]
                ];

                checkboxSettings.forEach(([id, key, fallback]) => {
                    const input = document.getElementById(id);
                    if (!input) return;
                    input.checked = readBoolean(key, fallback);
                    input.addEventListener('change', () => {
                        saveSetting(key, input.checked);
                        if (id === 'matchSanMaxToCurrent' &&
                            typeof window.setSanMaxMode === 'function') {
                            window.setSanMaxMode(input.checked);
                        }
                        if (id === 'autoFixEducationCommand') {
                            const commandsInput = document.getElementById('commands');
                            if (commandsInput && typeof window.applyEducationIntelligenceCommandNameSetting === 'function') {
                                const updatedCommands = window.applyEducationIntelligenceCommandNameSetting(
                                    commandsInput.value,
                                    input.checked
                                );
                                if (updatedCommands !== commandsInput.value) {
                                    commandsInput.value = updatedCommands;
                                    if (typeof window.generate === 'function') window.generate();
                                }
                            }
                        }
                    });
                });

                // 若上次保存的是關閉狀態，將頁面初始列從預設勾選狀態還原為原始最大值。
                const sanMaxSetting = document.getElementById('matchSanMaxToCurrent');
                if (sanMaxSetting && !sanMaxSetting.checked &&
                    typeof window.setSanMaxMode === 'function') {
                    window.setSanMaxMode(false);
                }

                const secondsInput = document.getElementById('googleSheetsPollSeconds');
                if (secondsInput) {
                    let savedSeconds = 30;
                    try {
                        const stored = Number(localStorage.getItem(STORAGE_KEYS.pollSeconds));
                        if (Number.isFinite(stored) && stored >= 1) savedSeconds = Math.floor(stored);
                    } catch (_) {}
                    secondsInput.value = savedSeconds;
                    secondsInput.addEventListener('change', () => {
                        const seconds = Math.max(1, Math.floor(Number(secondsInput.value) || 30));
                        secondsInput.value = seconds;
                        saveSetting(STORAGE_KEYS.pollSeconds, seconds);
                        if (typeof window.refreshGoogleSheetsPollingInterval === 'function') {
                            window.refreshGoogleSheetsPollingInterval();
                        }
                    });
                }

                document.addEventListener('click', event => {
                    const popover = document.getElementById('appSettingsPopover');
                    const toggle = document.getElementById('settingsToggle');
                    if (popover && popover.classList.contains('show') &&
                        !popover.contains(event.target) && toggle && !toggle.contains(event.target)) {
                        popover.classList.remove('show');
                    }
                });
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', initSettings, { once: true });
            } else {
                initSettings();
            }


        })();

(function buildResponsiveWorkspace() {
      function init() {
        const wrap = document.querySelector('.wrap');
        if (!wrap || wrap.querySelector('.workspace-layout')) return;
        const children = Array.from(wrap.children);
        const exportActions = children.filter(el => el.classList && el.classList.contains('actions')).slice(-1)[0];
        const zipStatus = document.getElementById('zipStatus');
        const jsonBox = wrap.querySelector('.jsonbox');
        const layout = document.createElement('div'); layout.className = 'workspace-layout';
        const main = document.createElement('main'); main.className = 'workspace-main';
        const aside = document.createElement('aside'); aside.className = 'workspace-aside';
        const preview = document.createElement('section'); preview.className = 'section quick-preview';
        preview.innerHTML = '<div class="quick-kicker">LIVE PREVIEW</div><img class="quick-preview-image" alt="角色圖片預覽"><div class="quick-preview-name">尚未命名</div><div class="quick-preview-caption">CCFOLIA CHARACTER</div>';
        preview.classList.add('quick-preview-clickable');
        preview.setAttribute('role', 'button');
        preview.setAttribute('tabindex', '0');
        preview.setAttribute('aria-label', '選擇角色主圖片');
        const openMainImagePickerFromPreview = () => {
          if (typeof window.openMainImagePicker === 'function') window.openMainImagePicker();
        };
        preview.addEventListener('click', openMainImagePickerFromPreview);
        preview.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openMainImagePickerFromPreview();
          }
        });
        aside.appendChild(preview);
        children.forEach(el => {
          if (el === exportActions || el === zipStatus || el === jsonBox) return;
          main.appendChild(el);
        });
        if (exportActions) aside.appendChild(exportActions);
        if (zipStatus) aside.appendChild(zipStatus);
        if (jsonBox) aside.appendChild(jsonBox);
        layout.append(main, aside); wrap.appendChild(layout);

        const sourceImage = document.getElementById('imagePreview');
        const targetImage = preview.querySelector('.quick-preview-image');
        const syncImage = () => {
          if (!sourceImage) return;
          targetImage.src = sourceImage.src || '';
          targetImage.style.display = sourceImage.classList.contains('show') && sourceImage.src ? 'block' : 'none';
        };
        if (sourceImage) {
          new MutationObserver(syncImage).observe(sourceImage, {attributes:true, attributeFilter:['src','class','style']});
          syncImage();
        } else targetImage.style.display = 'none';
        const nameInput = document.getElementById('name');
        const nameOutput = preview.querySelector('.quick-preview-name');
        // 統一提供同步函式，讓手動輸入、匯入 JSON／ZIP、清空資料都能更新預覽名稱。
        window.syncCharacterPreviewName = () => {
          const characterName = (nameInput?.value || '').trim();
          nameOutput.textContent = characterName || '尚未命名';
        };
        if (nameInput) {
          nameInput.addEventListener('input', window.syncCharacterPreviewName);
          nameInput.addEventListener('change', window.syncCharacterPreviewName);
          nameInput.addEventListener('keyup', window.syncCharacterPreviewName);
        }
        document.addEventListener('input', event => {
          if (event.target === nameInput) window.syncCharacterPreviewName();
        }, true);
        window.syncCharacterPreviewName();
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
      else init();
    })();


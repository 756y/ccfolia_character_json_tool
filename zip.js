/* CCFOLIA Room ZIP 功能 */

async function sha256Hex(bytes) {

      const buffer =
        bytes instanceof ArrayBuffer
          ? bytes
          : bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          );

      const hashBuffer =
        await crypto.subtle.digest(
          'SHA-256',
          buffer
        );

      const hashArray =
        Array.from(
          new Uint8Array(hashBuffer)
        );

      return hashArray
        .map(
          b => b.toString(16).padStart(2, '0')
        )
        .join('');
    }

async function readStoredZIP(file) {

      const buffer =
        await file.arrayBuffer();

      const bytes =
        new Uint8Array(buffer);

      const decoder =
        new TextDecoder('utf-8');

      const entries = {};

      let offset = 0;


      while (
        offset + 30 <= bytes.length
      ) {

        const signature =
          readU32LE(
            bytes,
            offset
          );


        /*
          Local File Header
        */
        if (
          signature !== 0x04034b50
        ) {

          break;

        }


        const flags =
          readU16LE(
            bytes,
            offset + 6
          );


        const method =
          readU16LE(
            bytes,
            offset + 8
          );


        const compressedSize =
          readU32LE(
            bytes,
            offset +18
          );


        const uncompressedSize =
          readU32LE(
            bytes,
            offset + 22
          );


        const nameLength =
          readU16LE(
            bytes,
            offset + 26
          );


        const extraLength =
          readU16LE(
            bytes,
            offset + 28
          );


        /*
          本工具建立的 ZIP 使用 Store，
          不使用壓縮。
        */
        if (method !== 0) {

          throw new Error(
            '這個 ZIP 使用壓縮格式。\\n' +
            '目前只支援本工具建立的 ZIP。'
          );

        }


        /*
          不支援 Data Descriptor。
          本工具建立的 ZIP 不會使用。
        */
        if (flags & 0x0008) {

          throw new Error(
            '這個 ZIP 使用 Data Descriptor，' +
            '不是本工具建立的 ZIP。'
          );

        }


        const nameStart =
          offset + 30;


        const nameEnd =
          nameStart + nameLength;


        const dataStart =
          nameEnd + extraLength;


        const dataEnd =
          dataStart + compressedSize;


        if (
          dataEnd > bytes.length
        ) {

          throw new Error(
            'ZIP 檔案內容不完整。'
          );

        }


        const name =
          decoder.decode(
            bytes.slice(
              nameStart,
              nameEnd
            )
          );


        const data =
          bytes.slice(
            dataStart,
            dataEnd
          );


        /*
          Store ZIP：
          壓縮大小 = 原始大小
        */
        if (
          compressedSize !==
          uncompressedSize
        ) {

          throw new Error(
            'ZIP 資料大小驗證失敗。'
          );

        }


        entries[name] =
          data;


        offset =
          dataEnd;

      }


      /*
        必須存在 __data.json
      */
      if (
        !entries['__data.json']
      ) {

        throw new Error(
          'ZIP 裡找不到 __data.json。\\n' +
          '請確認這是本工具建立的 CCFOLIA Room ZIP。'
        );

      }


      return entries;

    }

function readU16LE(
      bytes,
      offset
    ) {

      return (
        bytes[offset] |
        (
          bytes[offset + 1]
          << 8
        )
      );

    }

function readU32LE(
      bytes,
      offset
    ) {

      return (
        bytes[offset] |
        (
          bytes[offset + 1]
          << 8
        ) |
        (
          bytes[offset + 2]
          << 16
        ) |
        (
          bytes[offset + 3]
          << 24
        )
      ) >>> 0;

    }

async function handleZIPImport(event) {

      const file =
        event.target.files &&
        event.target.files[0];


      /*
        清空 input。
        這樣之後重新選同一個 ZIP，
        也可以再次觸發 change。
      */
      event.target.value = '';


      if (!file) {

        return;

      }


      try {

        /*
          讀取 ZIP
        */
        const entries =
          await readStoredZIP(file);


        /*
          讀取 __data.json
        */
        const jsonText =
          new TextDecoder('utf-8').decode(
            entries['__data.json']
          );


        const roomData =
          JSON.parse(jsonText);


        /*
          找角色
        */
        const characters =
          roomData
            ?.entities
            ?.characters;


        if (
          !characters ||
          typeof characters !== 'object'
        ) {

          throw new Error(
            '找不到 entities.characters。\\n' +
            '這不是有效的 CCFOLIA Room ZIP。'
          );

        }


        const characterList =
          Object.values(
            characters
          );


        if (
          characterList.length === 0
        ) {

          throw new Error(
            'ZIP 裡沒有角色。'
          );

        }


        /*
          本工具預期一個 ZIP 只有一個角色。
          如果有多個，使用第一個。
        */
        const character =
          characterList[0];


        /*
          =====================================================
          角色資料
          =====================================================
        */

        loadJSON(
          character
        );


        /*
          =====================================================
          主圖片
          =====================================================
        */

        const mainFilename =
          character.iconUrl;


        if (
          !mainFilename ||
          !entries[mainFilename]
        ) {

          throw new Error(
            '找不到角色主圖片：' +
            String(
              mainFilename ||
              '未指定'
            )
          );

        }


        const mainBytes =
          entries[mainFilename];


        /*
          計算主圖片 SHA-256
        */
        const mainHash =
          await sha256Hex(
            mainBytes
          );


        /*
          清除舊主圖片 Object URL
        */
        if (
          selectedImageObjectURL
        ) {

          URL.revokeObjectURL(
            selectedImageObjectURL
          );

          selectedImageObjectURL =
            null;

        }


        /*
          建立新的 File
        */
        selectedImageFile =
          new File(
            [mainBytes],
            mainFilename,
            {
              type: 'image/png'
            }
          );


        selectedImageBytes =
          mainBytes;


        selectedImageHash =
          mainHash;


        /*
          iconUrl 使用 ZIP 裡實際檔名
        */
        $('iconUrl').value =
          mainFilename;


        /*
          主圖片預覽
        */
        selectedImageObjectURL =
          URL.createObjectURL(
            new Blob(
              [mainBytes],
              {
                type: 'image/png'
              }
            )
          );


        $('imagePreview').src =
          selectedImageObjectURL;


        $('imagePreview')
          .classList
          .add('show');


        /*
          主圖片資訊
        */
        if (
          $('originalImageName')
        ) {

          $('originalImageName')
            .innerHTML =
            '<strong>原始檔名：</strong> ' + escapeHTML(mainFilename);
          $('originalImageName').style.display = 'block';

        }


        if (
          $('imageFileInfo')
        ) {

          $('imageFileInfo').style.display = 'none';
          $('imageFileInfo').textContent = '';

        }


        /*
          =====================================================
          差分圖片
          =====================================================
        */

        const faceRows =
          [
            ...$('facesList').children
          ];


        const importedFaces =
          Array.isArray(
            character.faces
          )
            ? character.faces
            : [];


        importedFaces.forEach(
          (face, index) => {

            const row =
              faceRows[index];


            if (!row) {

              return;

            }


            const filename =
              face.iconUrl;


            /*
              ZIP 裡找不到這張差分
            */
            if (
              !filename ||
              !entries[filename]
            ) {

              return;

            }


            const faceBytes =
              entries[filename];


            /*
              檢查 PNG Header
            */
            const isPNG =
              faceBytes.length >= 8 &&

              faceBytes[0] === 0x89 &&
              faceBytes[1] === 0x50 &&
              faceBytes[2] === 0x4e &&
              faceBytes[3] === 0x47 &&
              faceBytes[4] === 0x0d &&
              faceBytes[5] === 0x0a &&
              faceBytes[6] === 0x1a &&
              faceBytes[7] === 0x0a;


            if (!isPNG) {

              console.warn(
                '差分圖片不是有效 PNG：',
                filename
              );

              return;

            }


            /*
              儲存差分圖片資料
            */
            faceImageData.set(
              row,
              {
                file:
                  new File(
                    [faceBytes],
                    filename,
                    {
                      type: 'image/png'
                    }
                  ),

                bytes:
                  faceBytes,

                hash:
                  null,

                filename:
                  filename
              }
            );


            /*
              hidden iconUrl
            */
            row.querySelector(
              '.f-url'
            ).value =
              filename;


            /*
              顯示檔名
            */
            row.querySelector(
              '.face-original-name'
            ).textContent = '原始檔名：' + filename;


            /*
              顯示 SHA-256
            */
            row.querySelector(
              '.face-hash-name'
            ).textContent = '';
            row.querySelector('.face-hash-name').style.display = 'none';


            /*
              差分圖片預覽
            */
            if (
              row._faceObjectURL
            ) {

              URL.revokeObjectURL(
                row._faceObjectURL
              );

            }


            row._faceObjectURL =
              URL.createObjectURL(
                new Blob(
                  [faceBytes],
                  {
                    type: 'image/png'
                  }
                )
              );


            const preview =
              row.querySelector(
                '.face-preview'
              );


            preview.src =
              row._faceObjectURL;


            preview.style.display =
              'block';


            /*
              計算 SHA-256
            */
            sha256Hex(
              faceBytes
            ).then(hash => {

              const image =
                faceImageData.get(
                  row
                );


              if (image) {

                image.hash =
                  hash;

              }


              // 匯入後不顯示內部雜湊值，只保留圖片檔名。
              row.querySelector('.face-hash-name').textContent = '';

            });

          }
        );


        /*
          重新產生 JSON
        */
        generate();


        /*
          完成
        */
        toast(
          '✓ ZIP 匯入成功！'
        );


      } catch (error) {

        console.error(
          'ZIP 匯入失敗：',
          error
        );


        alert(
          'ZIP 匯入失敗：\\n\\n' +
          error.message
        );

      }

    }

function buildRoomData() {

      const imageFilename =
        selectedImageHash + '.png';

      const character =
        buildRoomCharacter();

      character.iconUrl =
        imageFilename;

      const resources = {};

      // 主圖片
      resources[imageFilename] = {
        type: 'image/png'
      };

      // 所有差分圖片
      for (
        const row of
        [...$('facesList').children]
      ) {

        const image =
          faceImageData.get(row);

        if (!image) {
          continue;
        }

        resources[image.filename] = {
          type: 'image/png'
        };
      }

      return {

        meta: {
          version: '1.1.0'
        },

        entities: {
          room: {},
          items: {},
          decks: {},
          notes: {},

          characters: {
            [window.roomCharacterId]:
              character
          }
        },

        effects: {},
        scenes: {},
        savedatas: {},
        snapshots: {},

        resources:
          resources
      };
    }

function crc32(bytes) {

      let crc = 0xffffffff;

      for (let i = 0; i < bytes.length; i++) {

        crc ^= bytes[i];

        for (let j = 0; j < 8; j++) {

          crc =
            (crc >>> 1) ^
            (
              0xedb88320 &
              -(crc & 1)
            );

        }

      }

      return (
        (crc ^ 0xffffffff) >>> 0
      );
    }

function u16(n) {

      return new Uint8Array([

        n & 0xff,

        (n >>> 8) & 0xff

      ]);

    }

function u32(n) {

      return new Uint8Array([

        n & 0xff,

        (n >>> 8) & 0xff,

        (n >>> 16) & 0xff,

        (n >>> 24) & 0xff

      ]);

    }

function concatBytes(...arrays) {

      let total = 0;

      arrays.forEach(
        a => total += a.length
      );


      const result =
        new Uint8Array(total);


      let offset = 0;


      arrays.forEach(a => {

        result.set(
          a,
          offset
        );

        offset += a.length;

      });


      return result;

    }

function createStoredZip(entries) {

      const encoder =
        new TextEncoder();

      const localParts = [];

      const centralParts = [];

      let offset = 0;


      for (const entry of entries) {

        const nameBytes =
          encoder.encode(entry.name);

        const data =
          entry.data instanceof Uint8Array
            ? entry.data
            : new Uint8Array(entry.data);

        const crc =
          crc32(data);


        /*
          Local File Header
        */
        const localHeader =
          concatBytes(

            u32(0x04034b50),

            u16(20),

            u16(0x0800),

            u16(0),

            u16(0),

            u16(0),

            u32(crc),

            u32(data.length),

            u32(data.length),

            u16(nameBytes.length),

            u16(0),

            nameBytes

          );


        localParts.push(
          localHeader,
          data
        );


        /*
          Central Directory Header
        */
        const centralHeader =
          concatBytes(

            u32(0x02014b50),

            u16(20),

            u16(20),

            u16(0x0800),

            u16(0),

            u16(0),

            u16(0),

            u32(crc),

            u32(data.length),

            u32(data.length),

            u16(nameBytes.length),

            u16(0),

            u16(0),

            u16(0),

            u16(0),

            u32(0),

            u32(offset),

            nameBytes

          );


        centralParts.push(
          centralHeader
        );


        offset +=
          localHeader.length +
          data.length;

      }


      const localData =
        concatBytes(...localParts);

      const centralData =
        concatBytes(...centralParts);


      /*
        End Of Central Directory
      */
      const endRecord =
        concatBytes(

          u32(0x06054b50),

          u16(0),

          u16(0),

          u16(entries.length),

          u16(entries.length),

          u32(centralData.length),

          u32(localData.length),

          u16(0)

        );


      return concatBytes(

        localData,

        centralData,

        endRecord

      );

    }

async function downloadRoomZIP() {

      const status =
        $('zipStatus');


      /*
        尚未選主圖片
      */
      if (
        !selectedImageFile ||
        !selectedImageBytes ||
        !selectedImageHash
      ) {

        status.className =
          'zip-status error';

        status.textContent =
          '❌ 請先選擇主圖片 PNG。';

        return;

      }


      try {

        status.className =
          'zip-status';

        status.textContent =
          '正在建立 CCFOLIA Room ZIP…';


        /*
          重新計算主圖片 SHA-256
        */
        const actualImageHash =
          await sha256Hex(
            selectedImageBytes
          );


        if (
          actualImageHash !==
          selectedImageHash
        ) {

          throw new Error(
            '主圖片 SHA-256 驗證失敗。'
          );

        }


        const imageFilename =
          selectedImageHash +
          '.png';


        /*
          每次匯出 ZIP 都建立新的 Room Character ID，
          避免同一個頁面連續匯出不同角色時重複使用舊 ID。
        */
        window.roomCharacterId =
          makeRoomCharacterId();


        /*
          建立最終 __data.json
        */
        const roomData =
          buildRoomData();


        /*
          固定 JSON bytes
        */
        const dataJSON =
          JSON.stringify(
            roomData,
            null,
            2
          ) + '\n';


        const dataBytes =
          new TextEncoder().encode(
            dataJSON
          );


        /*
          計算 __data.json SHA-256
        */
        const dataHash =
          await sha256Hex(
            dataBytes
          );


        /*
          .token
        */
        const tokenText =
          '0.' + dataHash;


        const tokenBytes =
          new TextEncoder().encode(
            tokenText
          );


        /*
          驗證角色
        */
        const characters =
          roomData
            .entities
            .characters;


        const character =
          characters[
          window.roomCharacterId
          ];


        if (!character) {

          throw new Error(
            'Room JSON 驗證失敗：找不到角色。'
          );

        }


        /*
          驗證主圖片
        */
        if (
          character.iconUrl !==
          imageFilename
        ) {

          throw new Error(
            'Room JSON 驗證失敗：iconUrl 不等於圖片檔名。'
          );

        }


        /*
          驗證主圖片 resources
        */
        if (
          !roomData.resources[
          imageFilename
          ]
        ) {

          throw new Error(
            'Room JSON 驗證失敗：resources 找不到主圖片。'
          );

        }


        /*
          建立 ZIP entries
        */
        const zipEntries = [

          {
            name:
              '__data.json',

            data:
              dataBytes

          },

          {
            name:
              '.token',

            data:
              tokenBytes

          },

          {
            name:
              imageFilename,

            data:
              selectedImageBytes

          }

        ];


        /*
          加入差分圖片
        */
        const addedFaceFiles =
          new Set();


        for (
          const row of
          [...$('facesList').children]
        ) {

          const image =
            faceImageData.get(row);


          if (!image) {
            continue;
          }


          /*
            同一張圖片如果 SHA-256 一樣，
            ZIP 只放一次。
          */
          if (
            addedFaceFiles.has(
              image.filename
            )
          ) {

            continue;

          }


          addedFaceFiles.add(
            image.filename
          );


          zipEntries.push({

            name:
              image.filename,

            data:
              image.bytes

          });

        }


        /*
          建立 ZIP
        */
        const zipBytes =
          createStoredZip(
            zipEntries
          );


        const blob =
          new Blob(
            [zipBytes],
            {
              type:
                'application/zip'
            }
          );


        /*
          ZIP 檔名
        */
        const characterName =
          sanitizeFilename(
            $('name').value ||
            'character'
          );


        const downloadName =
          characterName +
          '-ccfolia-room.zip';


        const url =
          URL.createObjectURL(blob);


        const a =
          document.createElement('a');


        a.href =
          url;

        a.download =
          downloadName;


        document.body.appendChild(a);

        a.click();

        a.remove();


        setTimeout(
          () =>
            URL.revokeObjectURL(url),
          1000
        );


        status.className =
          'zip-status success';

        status.textContent =
          '✓ CCFOLIA Room ZIP 已建立。';


      } catch (error) {

        console.error(
          'Room ZIP 建立失敗：',
          error
        );


        status.className =
          'zip-status error';

        status.textContent =
          '❌ 建立 Room ZIP 失敗：' +
          error.message;

      }

    }

# CCFOLIA Character JSON Tool

CCFOLIA 角色資料工具。

可以用表單建立 CCFOLIA Character JSON，也可以匯入既有角色 JSON，並支援使用 PNG 圖片建立符合 CCFOLIA Room 結構的 ZIP。

---

## 功能

### 角色資料建立

可以透過表單建立 CCFOLIA 角色資料。

| 變數名稱 | 對應名稱 |
|---|---|
| `name` | 角色名稱 |
| `memo` | 備註 |
| `initiative` | 行動值 |
| `externalUrl` | 外部連結 |
| `status` | 變動屬性 |
| `params` | 固定屬性 |
| `iconUrl` | 角色主圖片 |
| `faces` | 差分圖片 |
| `x` | X 座標 |
| `y` | Y 座標 |
| `angle` | 旋轉角度 |
| `width` | 寬度 |
| `height` | 高度 |
| `color` | 顏色 |
| `active` | Active |
| `secret` | 不公開角色狀態 |
| `invisible` | 發言時不顯示角色立繪 |
| `hideStatus` | 不要在盤面的角色清單中顯示 |
| `commands` | 常用指令 |
| `owner` | Owner |

工具會產生：

```json
{
  "kind": "character",
  "data": {}
}
```

JSON 會隨表單內容自動更新。

---

## JSON 匯出

建立角色後可以：

- 複製 CCFOLIA JSON
- 下載 `.json` 檔案

---

## JSON 匯入

支援將既有的角色 JSON 匯入工具。

### 一般 JSON

```json
{
  "kind": "character",
  "data": {
    "name": "角色名稱"
  }
}
```

### 被包成字串的 JSON

```text
"{\"kind\":\"character\",\"data\":{...}}"
```

### Excel / CSV 常見的雙引號格式

```text
"{""kind"":""character"",""data"":{...}}"
```

匯入後會自動填入角色資料，包括：

- 名稱
- 行動值
- Status
- 固定變數
- 指令
- 備註
- 圖片資料
- 位置
- 顯示設定
- 差分資料

---

## PNG 圖片處理

主圖片與差分圖片使用 PNG。

選擇圖片後，工具會：

1. 讀取 PNG
2. 計算圖片的 SHA-256
3. 使用 SHA-256 作為 ZIP 中的圖片檔名
4. 建立圖片預覽
5. 將圖片檔名寫入角色資料

例如：

```text
原始檔案：
character.png

ZIP 檔名：
<sha256>.png
```

主圖片的 SHA-256 直接針對原始 PNG bytes 計算。

差分圖片也會使用相同的 SHA-256 命名方式。

如果多個差分使用完全相同的圖片，建立 ZIP 時只會加入一次相同的圖片檔案。

---

## 顏色預覽

角色顏色可以直接輸入 HEX，例如：

```text
#E0E0E0
```

旁邊提供 HTML 顏色選擇器，可以直接選擇顏色，也會同步更新 HEX 值。

---

## CCFOLIA Room ZIP

除了 Character JSON，也可以直接建立：

```text
<角色名稱>-ccfolia-room.zip
```

ZIP 會包含：

```text
__data.json
.token
<sha256>.png
<sha256>.png
...
```

其中：

- `__data.json`：Room 資料
- `.token`：依據 `__data.json` 的 SHA-256 建立
- `<sha256>.png`：角色主圖片與差分圖片

### Room JSON 結構

```text
entities
├── room
├── items
├── decks
├── notes
└── characters

effects
scenes
savedatas
snapshots
resources
```

角色資料會包含：

| 變數名稱 | 對應名稱 |
|---|---|
| `name` | 角色名稱 |
| `playerName` | 玩家名稱 |
| `memo` | 備註 |
| `initiative` | 行動值 |
| `externalUrl` | 外部連結 |
| `status` | 變動屬性 |
| `params` | 固定屬性 |
| `iconUrl` | 主圖片 |
| `faces` | 差分圖片 |
| `x` | X 座標 |
| `y` | Y 座標 |
| `z` | Z 座標 |
| `angle` | 旋轉角度 |
| `width` | 寬度 |
| `height` | 高度 |
| `active` | Active |
| `secret` | 不公開角色狀態 |
| `invisible` | 發言時不顯示角色立繪 |
| `hideStatus` | 不要在盤面的角色清單中顯示 |
| `color` | 顏色 |
| `roomId` | Room ID |
| `commands` | 常用指令 |
| `speaking` | Speaking |
| `diceSkin` | Dice Skin |

---

## ZIP 驗證

建立 Room ZIP 前，工具會進行資料驗證，包括：

- 主圖片 SHA-256
- `iconUrl` 與主圖片檔名
- `resources` 與主圖片
- Room JSON 中的角色資料

`.token` 使用以下形式建立：

```text
0.<SHA-256 of __data.json>
```

---

## CCFOLIA Room ZIP 匯入

可以重新匯入 Room ZIP。

工具會解析 ZIP 中的：

```text
__data.json
.token
圖片檔案
```

並從：

```text
entities.characters
```

取得角色。

匯入後會重新載入：

- 角色資料
- 主圖片
- 差分圖片
- 圖片預覽

---

## 使用方式

### 1. 下載

下載專案中的 HTML：

```text
ccfolia_character_json_tool_v1.5.html
```

### 2. 開啟

直接使用瀏覽器開啟 HTML。

### 3. 建立角色

依照畫面中的區域填寫：

1. 基本資料
2. Status
3. 固定變數
4. 角色圖片與差分
5. 位置與外觀
6. 顯示設定
7. 指令與擁有者

### 4. 選擇圖片

選擇 PNG 圖片後，工具會自動：

- 計算 SHA-256
- 建立圖片預覽
- 更新角色資料

### 5. 匯出

可以選擇：

**複製 CCFOLIA JSON**

或：

**下載 JSON**

也可以建立：

**📦 下載 CCFOLIA Room ZIP**

---

## 檔案結構

目前專案的核心工具為單一 HTML：

```text
.
└── ccfolia_character_json_tool_v1.5.html
```

HTML 內包含：

```text
HTML
├── UI
├── CSS
└── JavaScript
    ├── Character JSON Generator
    ├── JSON Import
    ├── PNG Handler
    ├── SHA-256
    ├── Room JSON Generator
    ├── ZIP Generator
    └── ZIP Parser
```

---

## License

請依照此 Repository 實際設定的 License 修改本區域。

---

## Disclaimer

本工具為非官方的第三方工具。

CCFOLIA、相關服務及其資料格式的所有權利歸其原作者 / 官方所有。

本工具提供角色資料建立、轉換、圖片處理及 Room ZIP 相關功能。

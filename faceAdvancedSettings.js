/* 差分名稱批次修改：獨立功能，不修改既有差分資料處理邏輯。 */
(() => {
    const $ = id => document.getElementById(id);
    let pendingChanges = [];

    function openModal() {
        const modal = $('faceAdvancedModal');
        if (!modal) return;
        pendingChanges = [];
        $('faceAdvancedSearch').value = '';
        $('faceAdvancedReplace').value = '';
        $('faceAdvancedCaseSensitive').checked = false;
        $('faceAdvancedWholeWord').checked = false;
        $('faceAdvancedRegex').checked = false;
        $('faceAdvancedRegexTools').style.display = 'none';
        $('faceAdvancedEditor').style.display = 'block';
        $('faceAdvancedPreview').style.display = 'none';
        $('faceAdvancedBack').style.display = 'none';
        $('faceAdvancedSave').style.display = 'none';
        $('faceAdvancedConfirm').style.display = '';
        modal.style.display = 'flex';
        $('faceAdvancedSearch').focus();
    }

    function closeModal() { $('faceAdvancedModal').style.display = 'none'; }

    function buildPreview() {
        const search = $('faceAdvancedSearch').value;
        const replacement = $('faceAdvancedReplace').value;
        if (!search) { alert('請輸入搜尋內容。'); return; }
        let pattern;
        try {
            const useRegex = $('faceAdvancedRegex').checked;
            let source = useRegex ? expandRegexTokens(normalizeRegexInput(search)) : search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if ($('faceAdvancedWholeWord').checked) source = `(?<![\\w])(?:${source})(?![\\w])`;
            pattern = new RegExp(source, $('faceAdvancedCaseSensitive').checked ? 'gu' : 'giu');
        } catch (error) {
            alert('正規表示式格式錯誤：' + error.message);
            return;
        }
        // 直接抓取差分清單中的每一個名稱欄位，不依賴外層 .repeat 容器結構。
        const nameInputs = [...document.querySelectorAll('#facesList .f-label')];
        const finalReplacement = $('faceAdvancedRegex').checked ? expandReplacementTokens(replacement) : replacement;
        pendingChanges = nameInputs.map(input => {
            const original = input.value ?? '';
            pattern.lastIndex = 0;
            const updated = original.replace(pattern, finalReplacement);
            return { input, original, updated };
        }).filter(item => item.original !== item.updated);

        const list = $('faceAdvancedPreviewList');
        list.replaceChildren();
        if (!pendingChanges.length) {
            const empty = document.createElement('p');
            empty.textContent = '沒有符合條件且需要修改的差分名稱。';
            list.appendChild(empty);
        } else {
            pendingChanges.forEach(item => {
                const line = document.createElement('div');
                line.style.cssText = 'display:grid;grid-template-columns:minmax(0,1fr) 24px minmax(0,1fr);gap:8px;align-items:center;padding:8px 4px;border-bottom:1px solid var(--line);';
                const before = document.createElement('div'); before.textContent = item.original; before.style.cssText = 'overflow-wrap:anywhere;';
                const arrow = document.createElement('div'); arrow.textContent = '→'; arrow.style.textAlign = 'center';
                const after = document.createElement('div'); after.textContent = item.updated; after.style.cssText = 'overflow-wrap:anywhere;';
                line.append(before, arrow, after); list.appendChild(line);
            });
        }
        $('faceAdvancedEditor').style.display = 'none';
        $('faceAdvancedPreview').style.display = 'block';
        $('faceAdvancedBack').style.display = '';
        $('faceAdvancedConfirm').style.display = 'none';
        $('faceAdvancedSave').style.display = '';
    }

    // 修正常見的「\(文字)」寫法：左括號已明確表示字面括號時，配對右括號也視為字面符號。
    // 例如：角色 \({N}) 會自動修正為 角色 \({N}\)，避免出現未配對右括號錯誤。
    function normalizeRegexInput(value) {
        return value.replace(/\\\(([^()]*)\)/g, (_, inside) => '\\(' + inside + '\\)');
    }

    // 將較好記的 {a}/{D} 等快捷符號轉成 JavaScript 正規表示式語法。
    function expandRegexTokens(value) {
        const tokens = {
            '{a}': '[A-Za-z]',
            '{A}': '[A-Za-z]+',
            '{d}': '\\d',
            '{D}': '\\d+',
            '{N}': '\\d*',
            '{(N)}': '\\(\\d+\\)',
            '{N_}': '\\d+_',
            '{w}': '[A-Za-z0-9_]',
            '{W}': '[A-Za-z0-9_]+',
            '{s}': '\\s',
            '{S}': '\\s+',
            '{.}': '.'
        };
        return value.replace(/\{(?:\(N\)|N_|a|A|d|D|N|w|W|s|S|\.)\}/g, token => tokens[token]);
    }

    // 替換欄用 {0} 表示整段符合文字，{1}、{2} 表示捕獲組。
    function expandReplacementTokens(value) {
        return value.replace(/\{(\d+)\}/g, (_, number) => Number(number) === 0 ? '$&' : '$' + number);
    }

    function insertToken(target, token) {
        const input = target === 'search' ? $('faceAdvancedSearch') : $('faceAdvancedReplace');
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, start) + token + input.value.slice(end);
        input.focus();
        const cursor = start + token.length;
        input.setSelectionRange(cursor, cursor);
    }

    function escapeRegexLiteral(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // 依差分名稱推測可批次替換的共同前綴，優先辨識括號數字、數字底線與一般底線。
    // 只在智慧偵測時容許少數名稱格式不同；原有規則與優先順序保留。
    function autoDetectPrefix() {
        const names = [...document.querySelectorAll('#facesList .f-label')]
            .map(input => (input.value ?? '').trim())
            .filter(Boolean);
        if (names.length < 2) {
            alert('目前至少需要兩個差分名稱，才能比較共同前綴。');
            return;
        }

        let searchRule = '';
        const escape = escapeRegexLiteral;

        // 例如「角色 (1)微笑」「角色 (2)生氣」→ 角色 {(N)}。
        // 只比較有括號數字的名稱，並採用其中數量最多的共同前綴，忽略少數異格式名稱。
        const parenGroups = new Map();
        names.forEach(name => {
            const match = name.match(/^(.*?)(\(\d+\))/);
            if (!match) return;
            if (!parenGroups.has(match[1])) parenGroups.set(match[1], []);
            parenGroups.get(match[1]).push(match[2]);
        });
        const bestParen = [...parenGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
        if (bestParen && new Set(bestParen[1]).size > 1) {
            searchRule = escape(bestParen[0]) + '{(N)}';
        }

        // 例如「角色1_微笑」「角色2_生氣」→ 角色{N_}
        // 同樣只比較符合此格式且共同前綴最多的名稱。
        if (!searchRule) {
            const numericGroups = new Map();
            names.forEach(name => {
                const match = name.match(/^(.*?)(\d+)_/);
                if (!match) return;
                if (!numericGroups.has(match[1])) numericGroups.set(match[1], []);
                numericGroups.get(match[1]).push(match[2]);
            });
            const bestNumeric = [...numericGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
            if (bestNumeric && new Set(bestNumeric[1]).size > 1) {
                searchRule = escape(bestNumeric[0]) + '{N_}';
            }
        }

        // 例如「角色_微笑」「角色_生氣」或「角色1_微笑」等。
        // 在符合底線格式的名稱中，沿用原本的相同前綴／數字前綴規則，忽略不符合格式的少數名稱。
        if (!searchRule) {
            const underscoreGroups = new Map();
            names.forEach(name => {
                const index = name.indexOf('_');
                if (index <= 0) return;
                const stem = name.slice(0, index);
                const base = stem.replace(/\d+$/, '');
                const key = base;
                if (!underscoreGroups.has(key)) underscoreGroups.set(key, []);
                underscoreGroups.get(key).push({ stem, prefix: name.slice(0, index + 1), hasDigits: stem !== base, number: (stem.match(/(\d+)$/) || [])[1] || '' });
            });
            const bestUnderscore = [...underscoreGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
            if (bestUnderscore) {
                const entries = bestUnderscore[1];
                const stems = entries.map(entry => entry.stem);
                const withoutTrailingDigits = stems.map(stem => stem.replace(/\d+$/, ''));
                const sameBase = withoutTrailingDigits.every(stem => stem === withoutTrailingDigits[0]);
                const exactSame = stems.every(stem => stem === stems[0]);
                if (exactSame) {
                    searchRule = escape(entries[0].prefix);
                } else if (sameBase && entries.some(entry => entry.hasDigits) && new Set(entries.map(entry => entry.number)).size > 1) {
                    searchRule = escape(withoutTrailingDigits[0]) + '{N_}';
                }
            }
        }

        if (!searchRule) {
            // 備援：維持原本找所有名稱最長共同開頭的方式。
            let common = names[0];
            for (const name of names.slice(1)) {
                let i = 0;
                while (i < common.length && i < name.length && common[i] === name[i]) i++;
                common = common.slice(0, i);
                if (!common) break;
            }
            if (common.length < 2) {
                alert('目前找不到足夠明確的共同前綴。請確認差分名稱格式一致，或手動輸入搜尋規則。');
                return;
            }
            searchRule = escape(common);
        }

        $('faceAdvancedSearch').value = searchRule;
        $('faceAdvancedReplace').value = '@';
        $('faceAdvancedRegex').checked = true;
        $('faceAdvancedRegexTools').style.display = 'block';
        $('faceAdvancedSearch').focus();
        let count = 0;
        try {
            const pattern = new RegExp(expandRegexTokens(normalizeRegexInput(searchRule)), 'u');
            count = names.filter(name => pattern.test(name)).length;
        } catch (_) { /* 搜尋欄仍會預填，使用者可再調整 */ }
        alert(`已填入建議規則！\n搜尋：${searchRule}\n取代：@\n\n目前約有 ${count} 個名稱會符合。這只是預填建議，請按「預覽」檢查後再儲存。`);
    }

    function saveChanges() {
        pendingChanges.forEach(item => { item.input.value = item.updated; });
        if (pendingChanges.length && typeof window.generate === 'function') window.generate();
        closeModal();
    }

    document.addEventListener('DOMContentLoaded', () => {
        $('faceAdvancedSettingsButton')?.addEventListener('click', openModal);
        $('faceAdvancedCancel')?.addEventListener('click', closeModal);
        $('faceAdvancedConfirm')?.addEventListener('click', buildPreview);
        $('faceAdvancedAutoDetect')?.addEventListener('click', autoDetectPrefix);
        $('faceAdvancedRegex')?.addEventListener('change', () => {
            $('faceAdvancedRegexTools').style.display = $('faceAdvancedRegex').checked ? 'block' : 'none';
        });
        document.querySelectorAll('.face-regex-token').forEach(button => {
            button.addEventListener('click', () => insertToken(button.dataset.target, button.dataset.token));
        });
        document.querySelectorAll('.face-regex-example').forEach(button => {
            button.addEventListener('click', () => {
                $('faceAdvancedSearch').value = button.dataset.search || '';
                $('faceAdvancedReplace').value = button.dataset.replace || '@';
                $('faceAdvancedRegex').checked = true;
                $('faceAdvancedRegexTools').style.display = 'block';
                $('faceAdvancedSearch').focus();
            });
        });
        $('faceAdvancedSave')?.addEventListener('click', saveChanges);
        $('faceAdvancedBack')?.addEventListener('click', () => {
            $('faceAdvancedEditor').style.display = 'block';
            $('faceAdvancedPreview').style.display = 'none';
            $('faceAdvancedBack').style.display = 'none';
            $('faceAdvancedSave').style.display = 'none';
            $('faceAdvancedConfirm').style.display = '';
        });
        $('faceAdvancedModal')?.addEventListener('click', event => {
            if (event.target === $('faceAdvancedModal')) closeModal();
        });
    });
})();

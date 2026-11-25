/* 主題相關功能集中於此檔：亮暗色／設計模式、20 組配色、透明度與背景粒子。 */

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
        'light';

      applyTheme(savedTheme);

    })();

/* =========================================================
   20 組主題配色、透明度與背景粒子效果（獨立於 index.html）
========================================================= */
/* 主題：20 組配色 + 面板透明度 + 背景粒子（可點擊消除）。設定會存在 localStorage。 */
    (function () {
        var KEY = { idxD: 'ccfolia-setting-theme-index-dark', idxL: 'ccfolia-setting-theme-index-light', alpha: 'ccfolia-setting-theme-alpha', fx: 'ccfolia-setting-theme-fx' };

        /* ---------- 粒子引擎 ---------- */
        function startFx(cv, cfg) {
            var ctx = cv.getContext('2d'), W = 0, H = 0, ps = [], pops = [], raf = 0, last = 0, T = 0, TAU = Math.PI * 2, alive = true;
            var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
            function rnd(a, b) { return a + Math.random() * (b - a); }
            function mk() {
                var k = cfg.kind, fall = (k === 'petal' || k === 'leaf' || k === 'snow'), rise = (k === 'bubble');
                return {
                    x: rnd(0, W), y: rnd(0, H), r: rnd(cfg.rMin, cfg.rMax),
                    c: cfg.colors[Math.floor(Math.random() * cfg.colors.length)], a: rnd(.45, 1),
                    p1: rnd(0, TAU), p2: rnd(0, TAU), p3: rnd(0, TAU), f1: rnd(.12, .5), f2: rnd(.08, .35), tw: rnd(.5, 1.8),
                    vx: fall ? rnd(-5, 8) : rnd(-3, 3), vy: fall ? rnd(12, 30) : (rise ? -rnd(8, 22) : rnd(-3, 3)),
                    sw: (fall || rise) ? rnd(8, 22) : rnd(4, 10), rot: rnd(0, TAU), vr: rnd(-.9, .9)
                };
            }
            function fit() {
                var d = Math.min(window.devicePixelRatio || 1, 2);
                W = cv.clientWidth; H = cv.clientHeight; cv.width = Math.round(W * d); cv.height = Math.round(H * d); ctx.setTransform(d, 0, 0, d, 0, 0);
            }
            function fill() {
                var n = Math.max(12, Math.round(cfg.count * Math.max(.35, Math.min(1.2, W * H / 1024000))));
                ps = []; for (var i = 0; i < n; i++) ps.push(mk());
            }
            function draw(p) {
                var k = cfg.kind; ctx.globalAlpha = 1;
                if (k === 'star' || k === 'mote') {
                    var tw = .5 + .5 * Math.sin(T * p.tw + p.p3), al = p.a * (.25 + .75 * tw);
                    ctx.fillStyle = p.c;
                    if (k === 'mote' || p.r > 1.1) { ctx.globalAlpha = al * .16; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 3.2, 0, TAU); ctx.fill(); }
                    ctx.globalAlpha = al; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
                    if (k === 'star' && p.r > 1.25) {
                        var L = p.r * 4 * tw + 2; ctx.globalAlpha = al * .55; ctx.strokeStyle = p.c; ctx.lineWidth = .6; ctx.beginPath();
                        ctx.moveTo(p.x - L, p.y); ctx.lineTo(p.x + L, p.y); ctx.moveTo(p.x, p.y - L); ctx.lineTo(p.x, p.y + L); ctx.stroke();
                    }
                    return;
                }
                ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = p.a * .85;
                if (k === 'petal') {
                    ctx.scale(1, .55 + .45 * Math.abs(Math.sin(T * p.tw + p.p3))); ctx.fillStyle = p.c;
                    ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.5, p.r * .9, 0, 0, TAU); ctx.fill();
                } else if (k === 'leaf') {
                    ctx.scale(1, .6 + .4 * Math.abs(Math.sin(T * p.tw + p.p3))); ctx.fillStyle = p.c;
                    ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.7, p.r * .8, 0, 0, TAU); ctx.fill();
                    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = .6; ctx.beginPath(); ctx.moveTo(-p.r * 1.7, 0); ctx.lineTo(p.r * 1.7, 0); ctx.stroke();
                } else if (k === 'snow') {
                    ctx.beginPath(); ctx.arc(0, 0, p.r * .7, 0, TAU); ctx.fillStyle = p.c; ctx.fill();
                    ctx.strokeStyle = cfg.stroke || 'rgba(120,150,190,.45)'; ctx.lineWidth = .8; ctx.stroke();
                } else if (k === 'bubble') {
                    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fillStyle = p.c; ctx.globalAlpha = p.a * .12; ctx.fill();
                    ctx.globalAlpha = p.a * .7; ctx.strokeStyle = p.c; ctx.lineWidth = 1; ctx.stroke();
                    ctx.beginPath(); ctx.arc(-p.r * .35, -p.r * .35, p.r * .22, 0, TAU); ctx.fillStyle = '#fff'; ctx.globalAlpha = .7; ctx.fill();
                }
                ctx.restore();
            }
            /* 被點掉的粒子：一圈擴散的光環 + 6 顆小火花 */
            function drawPop(q) {
                var k = Math.min(1, q.t / .45), e = 1 - Math.pow(1 - k, 3);
                ctx.save(); ctx.translate(q.x, q.y); ctx.strokeStyle = q.ring; ctx.fillStyle = q.ring;
                ctx.globalAlpha = (1 - k) * .9; ctx.lineWidth = 1.4 * (1 - k) + .4;
                ctx.beginPath(); ctx.arc(0, 0, 3 + e * 16, 0, TAU); ctx.stroke();
                for (var i = 0; i < 6; i++) {
                    var a = i * TAU / 6 + q.rot, d = 2 + e * 22;
                    ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d, Math.max(.3, 1.6 * (1 - k)), 0, TAU); ctx.fill();
                }
                ctx.restore();
            }
            function paint() {
                ctx.clearRect(0, 0, W, H);
                for (var i = 0; i < ps.length; i++) draw(ps[i]);
                for (var j = 0; j < pops.length; j++) drawPop(pops[j]);
            }
            function frame(now) {
                if (!alive) return; raf = requestAnimationFrame(frame);
                var dt = Math.min(.05, ((now - last) / 1000) || 0), s = cfg.speed || 1; last = now; T += dt;
                for (var i = 0; i < ps.length; i++) {
                    var p = ps[i];
                    p.x += (p.vx * s + Math.sin(T * p.f1 + p.p1) * p.sw) * dt;
                    p.y += (p.vy * s + Math.cos(T * p.f2 + p.p2) * p.sw * .6) * dt;
                    p.rot += p.vr * dt;
                    if (p.x < -12) p.x = W + 12; else if (p.x > W + 12) p.x = -12;
                    if (p.y < -12) p.y = H + 12; else if (p.y > H + 12) p.y = -12;
                }
                for (var j = pops.length - 1; j >= 0; j--) { pops[j].t += dt; if (pops[j].t >= .45) pops.splice(j, 1); }
                paint();
            }
            /* 點擊位置附近最近的一顆粒子消失；回傳是否有命中 */
            function pop(x, y) {
                var best = -1, bd = 1e9;
                for (var i = 0; i < ps.length; i++) {
                    var p = ps[i], dx = p.x - x, dy = p.y - y, d = Math.sqrt(dx * dx + dy * dy), tol = Math.max(16, p.r * 3 + 10);
                    if (d < tol && d < bd) { bd = d; best = i; }
                }
                if (best < 0) return false;
                var q = ps.splice(best, 1)[0];
                if (!still) {
                    var ring = cfg.kind === 'snow' ? (cfg.stroke || 'rgba(120,150,190,.45)').replace(/[\d.]+\)$/, '.95)') : q.c;
                    pops.push({ x: q.x, y: q.y, ring: ring, rot: rnd(0, TAU), t: 0 });
                } else paint();
                return true;
            }
            function onResize() { var w = cv.clientWidth; fit(); if (w !== W || !ps.length) fill(); if (still) paint(); }
            fit(); fill();
            window.addEventListener('resize', onResize);
            if (still) paint(); else raf = requestAnimationFrame(frame);
            var stop = function () { alive = false; cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); ctx.clearRect(0, 0, W, H); };
            stop.pop = pop;
            return stop;
        }

        /* ---------- 20 組主題 ----------
           c = [bg, panel, panel2, line, text, muted, accent, accent2, input, danger, ok, warn] */
        var THEMES = [
            { n: '拿鐵星夜', t: '紫墨夜色，蜂蜜金燈', m: 'd',
              c: ['#17131d','#221c2b','#2c2437','#3f344d','#f6eddc','#baabbd','#f4bf5a','#e7a63a','#1a1522','#ff8a80','#9be0a8','#ffd36b'],
              g: ['rgba(244,191,90,.17)','rgba(165,110,210,.15)'],
              fx: { kind: 'star', colors: ['#fff3cf','#ffd98a','#ffe9b8','#f2d2ff'], count: 90, rMin: .4, rMax: 1.5, speed: 1 } },
            { n: '焦糖布蕾', t: '石墨灰，焦糖與玫瑰銅', m: 'd',
              c: ['#18181b','#232327','#2e2d33','#423f49','#f5efe3','#b4aea4','#f0b24a','#de9a2c','#1c1c20','#ff8f7a','#a3dc98','#ffd166'],
              g: ['rgba(240,178,74,.15)','rgba(226,120,110,.11)'],
              fx: { kind: 'star', colors: ['#fff1c9','#ffd27a','#ffffff','#ffc6a8'], count: 90, rMin: .4, rMax: 1.5, speed: 1 } },
            { n: '午夜藍莓', t: '深靛夜空，冰藍星光', m: 'd',
              c: ['#10131f','#181c2e','#212640','#333a5c','#e8ecfb','#9aa4c8','#8fb0ff','#6f95ee','#0d1018','#ff8f9a','#8fe3b5','#ffd27a'],
              g: ['rgba(111,149,238,.18)','rgba(170,120,230,.14)'],
              fx: { kind: 'star', colors: ['#dfe8ff','#a9c1ff','#ffffff','#d9c6ff'], count: 90, rMin: .4, rMax: 1.5, speed: 1 } },
            { n: '螢火森林', t: '墨綠林夜，螢火蟲光', m: 'd',
              c: ['#0c1510','#131f18','#1a2a21','#2b4235','#e9f3df','#9db5a0','#b6e35a','#9acb3f','#09100c','#ff8f7d','#86e3a4','#ffd866'],
              g: ['rgba(182,227,90,.13)','rgba(60,160,110,.14)'],
              fx: { kind: 'mote', colors: ['#d8f58a','#b6e35a','#f3ffb8'], count: 46, rMin: 1.2, rMax: 2.8, speed: .7 } },
            { n: '暮光玫瑰', t: '梅紫黑夜，玫瑰粉花瓣', m: 'd',
              c: ['#1a1118','#261a24','#32222f','#4b3347','#fbeaf0','#c5a6b6','#f48fb1','#e5739b','#150d13','#ff8a8a','#9de0b0','#ffd37a'],
              g: ['rgba(244,143,177,.16)','rgba(150,100,220,.13)'],
              fx: { kind: 'petal', colors: ['#f8b6c8','#f48fb1','#ffd0de','#e0a0ff'], count: 20, rMin: 2.4, rMax: 4.6, speed: .9 } },
            { n: '極光夜', t: '深青夜幕，極光綠與紫', m: 'd',
              c: ['#0b1419','#121f27','#192a35','#2a4250','#e6f6f3','#9bb8bd','#5ee0b4','#3fc99c','#080f13','#ff8f8f','#7fe3a8','#ffd36b'],
              g: ['rgba(94,224,180,.15)','rgba(140,110,240,.17)'],
              fx: { kind: 'star', colors: ['#c8fff0','#a6b8ff','#ffffff','#d4b8ff'], count: 90, rMin: .4, rMax: 1.5, speed: 1 } },
            { n: '墨海潮汐', t: '深海墨藍，青藍氣泡', m: 'd',
              c: ['#0a1220','#111d30','#182840','#284060','#e4f1fb','#94b1cc','#4fc3e8','#2fa9d2','#070d18','#ff8f94','#86e3b0','#ffd36b'],
              g: ['rgba(79,195,232,.15)','rgba(60,110,230,.15)'],
              fx: { kind: 'bubble', colors: ['#4fc3e8','#7fd8f0','#3b8fe0'], count: 24, rMin: 3, rMax: 8, speed: 1 } },
            { n: '可可櫻桃', t: '可可棕底，櫻桃紅光', m: 'd',
              c: ['#1b1210','#271a17','#33231f','#4d352f','#fbeee6','#c4a99f','#ff7a8a','#ec5f72','#150d0b','#ff9588','#9fdc9a','#ffd36b'],
              g: ['rgba(255,122,138,.14)','rgba(200,120,60,.12)'],
              fx: { kind: 'mote', colors: ['#ffb0a8','#ff8a98','#ffd0b8'], count: 36, rMin: 1.2, rMax: 2.6, speed: 1 } },
            { n: '銀河雪夜', t: '石墨冷灰，銀藍細雪', m: 'd',
              c: ['#12141a','#1a1d26','#232733','#363c4d','#eef1f8','#a2a9bb','#c3cdf0','#a9b6e2','#0e1015','#ff9090','#98e0b0','#ffd77a'],
              g: ['rgba(180,195,240,.12)','rgba(255,255,255,.05)'],
              fx: { kind: 'snow', colors: ['#ffffff'], stroke: 'rgba(190,205,245,.45)', count: 46, rMin: 2, rMax: 4.2, speed: .9 } },
            { n: '橙霞暮色', t: '靛紫黃昏，珊瑚橘光', m: 'd',
              c: ['#161226','#211a36','#2c2347','#43375f','#fdeee6','#bfaed0','#ff9a5c','#f2803c','#110d1e','#ff8f8f','#9be0b0','#ffd36b'],
              g: ['rgba(255,154,92,.17)','rgba(220,80,160,.14)'],
              fx: { kind: 'star', colors: ['#ffd9b8','#ffb38a','#ffffff','#ffc6e6'], count: 90, rMin: .4, rMax: 1.5, speed: 1 } },
            { n: '春・櫻吹雪', t: '粉櫻花瓣，嫩葉綠點綴', m: 'l',
              c: ['#fdf2f5','#ffffff','#fbe3ea','#f0c8d4','#3b2530','#79596a','#d6537b','#c53f68','#fffafb','#c9393f','#3d8d58','#b8770c'],
              g: ['rgba(247,160,190,.30)','rgba(160,215,150,.22)'],
              fx: { kind: 'petal', colors: ['#f8b6c8','#fbd0dc','#f49bb4','#ffdfe8'], count: 26, rMin: 2.6, rMax: 5.2, speed: 1 } },
            { n: '春・新芽', t: '嫩芽黃綠，晨光暖黃', m: 'l',
              c: ['#f3f8e6','#fdfff7','#e4efc9','#ccdca9','#27331c','#586c47','#5c9d2e','#4a8723','#ffffff','#c2453a','#2f8a47','#a8700b'],
              g: ['rgba(170,215,90,.30)','rgba(255,225,120,.22)'],
              fx: { kind: 'leaf', colors: ['#9ccf5a','#c6e48b','#7fb83c','#b5dc7a'], count: 22, rMin: 2.4, rMax: 4.6, speed: 1 } },
            { n: '夏・西瓜汽水', t: '西瓜紅配瓜皮綠，氣泡', m: 'l',
              c: ['#fff2f0','#fffdfc','#ffe1dc','#f5c4bc','#3a2220','#85605c','#e24a5f','#cf3a50','#ffffff','#c2303a','#2f9650','#b97a0a'],
              g: ['rgba(255,120,140,.28)','rgba(110,215,150,.22)'],
              fx: { kind: 'bubble', colors: ['#ff8a9c','#7fd69b','#ffb3bd'], count: 24, rMin: 3, rMax: 9, speed: 1 } },
            { n: '夏・向日葵', t: '向日葵黃，花粉飄浮', m: 'l',
              c: ['#fff9e0','#fffef6','#fdecaa','#efd88c','#36300f','#6f6733','#d99a00','#c48800','#ffffff','#c4402f','#3d8f3a','#a86a00'],
              g: ['rgba(255,205,60,.34)','rgba(150,205,90,.20)'],
              fx: { kind: 'mote', colors: ['#f0c230','#ffd95a','#e8a600'], count: 40, rMin: 1.2, rMax: 2.6, speed: 1 } },
            { n: '秋・楓紅', t: '楓紅與銀杏金，落葉', m: 'l',
              c: ['#fff3e8','#fffdfa','#fde2cb','#f2c9a8','#3d2417','#7f5c47','#d2512a','#bf421d','#ffffff','#b9332f','#55832e','#b0710a'],
              g: ['rgba(255,150,70,.28)','rgba(220,80,60,.16)'],
              fx: { kind: 'leaf', colors: ['#e0612f','#f0a030','#c23b22','#d98a2b'], count: 24, rMin: 2.8, rMax: 5, speed: 1 } },
            { n: '冬・初雪', t: '冰藍白，細雪輕落', m: 'l',
              c: ['#f0f5fa','#ffffff','#e0eaf4','#c6d5e5','#1f2b3a','#5d7288','#4f7fb6','#3e6ca3','#ffffff','#c2434a','#2f8a6a','#a46d10'],
              g: ['rgba(150,190,240,.30)','rgba(255,255,255,.7)'],
              fx: { kind: 'snow', colors: ['#ffffff'], stroke: 'rgba(110,145,190,.5)', count: 50, rMin: 2, rMax: 4.5, speed: 1 } },
            { n: '花園・薰衣草', t: '薰衣草紫，花粉微光', m: 'l',
              c: ['#f5f1fb','#ffffff','#e8def6','#d3c5ea','#2b2140','#74678d','#8559c9','#7248b8','#ffffff','#c2394f','#3d8f66','#a56d0e'],
              g: ['rgba(180,140,235,.30)','rgba(245,170,210,.22)'],
              fx: { kind: 'mote', colors: ['#b799ec','#e0aef0','#a98be0'], count: 36, rMin: 1.4, rMax: 2.8, speed: 1 } },
            { n: '森林・晨霧', t: '霧綠林間，落葉點點', m: 'l',
              c: ['#eef3ee','#fcfefc','#dbe8dd','#c0d4c5','#1f3328','#5c7665','#35785a','#286648','#ffffff','#bd4538','#2d8a4e','#a3700f'],
              g: ['rgba(120,180,140,.30)','rgba(255,240,170,.28)'],
              fx: { kind: 'leaf', colors: ['#7fb08c','#a9cfae','#5e9a71','#c3dcb0'], count: 18, rMin: 2.4, rMax: 4.4, speed: 1 } },
            { n: '海洋・潮汐', t: '淺海青碧，珊瑚橘點綴', m: 'l',
              c: ['#eaf7f8','#fcffff','#d3ecee','#b3d9dd','#12353a','#4f777c','#138d9c','#0e7a89','#ffffff','#c2414a','#2a8f6a','#a56f0f'],
              g: ['rgba(70,190,205,.30)','rgba(255,160,140,.16)'],
              fx: { kind: 'bubble', colors: ['#4fb6c2','#7fd0d8','#2f9fae'], count: 26, rMin: 3, rMax: 9, speed: 1 } },
            { n: '冰雪・極光', t: '冰川薄荷配極光紫', m: 'l',
              c: ['#eff7f6','#fcffff','#dcefee','#bddbd8','#1d3036','#56767a','#6a5fd0','#5a4fc0','#ffffff','#c2414f','#2d8f72','#a46d10'],
              g: ['rgba(140,120,235,.26)','rgba(110,215,180,.28)'],
              fx: { kind: 'snow', colors: ['#ffffff','#f1eaff'], stroke: 'rgba(120,130,200,.45)', count: 46, rMin: 2, rMax: 4.2, speed: 1 } }
        ];

        /* ---------- 顏色工具 ---------- */
        function byId(id) { return document.getElementById(id); }
        function store(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
        function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
        function h2r(h) { h = h.replace('#', ''); return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
        function r2h(a) { return '#' + a.map(function (v) { return Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'); }).join(''); }
        function mix(a, b, t) { var A = h2r(a), B = h2r(b); return r2h(A.map(function (v, i) { return v + (B[i] - v) * t; })); }
        function rgba(h, a) { var r = h2r(h); return 'rgba(' + r[0] + ',' + r[1] + ',' + r[2] + ',' + a + ')'; }
        function lum(h) { var r = h2r(h).map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r[0] + .7152 * r[1] + .0722 * r[2]; }
        function onColor(h) { var L = lum(h); return 1.05 / (L + .05) > (L + .05) / .06 ? '#ffffff' : '#1f1606'; }

        var body = document.body, sel = { d: -1, l: -1 }, cur = -1, alphaV = 70, stopFn = null, applied = [], lastState = '';
        /* 亮／暗以 body.light 判斷（右上角切換鈕控制）；各模式各自記住選的主題 */
        function mode() { return body.classList.contains('light') ? 'l' : 'd'; }

        /* 透明度 alphaV 是「面板的透明程度」：0 = 不透明，100 = 全透明 */
        function vars(th) {
            var c = th.c, d = th.m === 'd', bg = c[0], panel = c[1], panel2 = c[2], line = c[3], text = c[4], muted = c[5],
                ac = c[6], ac2 = c[7], inp = c[8], A = Math.round((1 - alphaV / 100) * 100) / 100;
            return {
                '--bg': bg, '--panel': rgba(panel, A), '--panel2': rgba(panel2, A), '--panel-solid': panel, '--line': line,
                '--text': text, '--muted': muted, '--accent': ac, '--accent2': ac2,
                '--danger': c[9], '--ok': c[10], '--warn': c[11],
                '--input-bg': rgba(inp, A * .8),
                '--file-bg': rgba(panel2, A), '--file-text': text, '--file-border': line,
                '--file-hover': rgba(mix(panel2, text, .07), Math.min(1, A + .15)), '--file-hover-border': mix(line, text, .3),
                '--button-text': onColor(ac2),
                '--secondary-bg': d ? mix(panel2, text, .14) : line,
                '--danger-bg': mix(c[9], '#000000', d ? .45 : .3),
                '--success-bg': mix(c[10], '#000000', d ? .45 : .3),
                '--preview-bg': rgba(inp, A * .6),
                '--toast-bg': rgba(d ? panel2 : panel, Math.max(A, .85)),
                '--checkbox-bg': d ? mix(line, text, .18) : mix(line, muted, .4),
                '--checkbox-knob': d ? '#fff8e6' : '#ffffff',
                '--modal-overlay': d ? rgba(mix(bg, '#000000', .6), .74) : rgba(mix(text, '#000000', .3), .35),
                '--shadow': d ? 'rgba(0,0,0,.5)' : rgba(mix(text, '#000000', .2), .16),
                '--modal-shadow': d ? 'rgba(0,0,0,.7)' : rgba(mix(text, '#000000', .2), .24),
                '--glow': 'radial-gradient(900px 520px at 88% -8%,' + th.g[0] + ',transparent 62%),radial-gradient(760px 520px at 4% 108%,' + th.g[1] + ',transparent 62%)'
            };
        }
        function clearVars() {
            applied.forEach(function (k) { body.style.removeProperty(k); });
            applied = []; body.style.removeProperty('color-scheme');
        }
        function paintVars() {
            clearVars();
            if (cur < 0 || body.classList.contains('expert')) return false;
            var th = THEMES[cur], v = vars(th);
            for (var k in v) { body.style.setProperty(k, v[k]); applied.push(k); }
            body.style.setProperty('color-scheme', th.m === 'd' ? 'dark' : 'light');
            return true;
        }

        /* ---------- 粒子開關 ---------- */
        function stopFx() {
            if (stopFn) { stopFn(); stopFn = null; }
            var cv = byId('themeFx'); if (cv) cv.style.display = 'none';
        }
        function startFor(th) {
            stopFx();
            var cv = byId('themeFx'), sw = byId('themeFxToggle');
            if (!cv || !sw || !sw.checked) return;
            cv.style.display = 'block';
            stopFn = startFx(cv, th.fx);
        }
        function applyTheme() {
            var md = mode(); cur = sel[md];
            var bd = byId('themeBoxDark'), bl = byId('themeBoxLight');
            if (bd) bd.style.display = md === 'd' ? '' : 'none';
            if (bl) bl.style.display = md === 'l' ? '' : 'none';
            lastState = md + body.classList.contains('expert');
            if (paintVars()) startFor(THEMES[cur]); else stopFx();
            var cards = document.querySelectorAll('.theme-card');
            for (var j = 0; j < cards.length; j++) cards[j].setAttribute('aria-pressed', String(+cards[j].getAttribute('data-i') === cur));
        }
        function setCur(i) { var md = mode(); sel[md] = i; store(md === 'd' ? KEY.idxD : KEY.idxL, i); applyTheme(); }

        /* ---------- 介面 ---------- */
        function cardHtml(th, i) {
            var c = th.c;
            return '<button type="button" class="theme-card" data-i="' + i + '" aria-pressed="false" title="' + th.t + '" style="--cb:' + c[0] + ';--ct:' + c[4] + ';--cl:' + c[3] + ';--ca:' + c[6] + '">' +
                '<span class="theme-swatch"><i style="background:' + c[6] + '"></i><i style="background:' + c[7] + '"></i><i style="background:' + c[3] + '"></i></span>' +
                '<span class="theme-name">' + th.n + '</span></button>';
        }
        function init() {
            var gd = byId('themeGridDark'), gl = byId('themeGridLight'), slider = byId('themeAlpha'), sw = byId('themeFxToggle');
            if (!gd || !gl || !slider || !sw) return;
            var hd = '', hl = '';
            THEMES.forEach(function (th, i) { if (th.m === 'd') hd += cardHtml(th, i); else hl += cardHtml(th, i); });
            gd.innerHTML = hd; gl.innerHTML = hl;

            var sa = parseInt(load(KEY.alpha), 10);
            alphaV = isNaN(sa) ? 70 : Math.max(0, Math.min(100, sa));
            slider.value = alphaV; byId('themeAlphaVal').textContent = alphaV;
            sw.checked = load(KEY.fx) !== 'false';

            function pick(e) {
                var b = e.target.closest ? e.target.closest('.theme-card') : null;
                if (!b) return;
                var i = +b.getAttribute('data-i');
                setCur(i === cur ? -1 : i);   // 再點一次已選的主題 = 回到預設外觀
            }
            gd.addEventListener('click', pick); gl.addEventListener('click', pick);

            slider.addEventListener('input', function () {
                alphaV = +slider.value; byId('themeAlphaVal').textContent = alphaV; store(KEY.alpha, alphaV);
                paintVars();
            });
            sw.addEventListener('change', function () {
                store(KEY.fx, sw.checked);
                if (cur >= 0 && !body.classList.contains('expert')) startFor(THEMES[cur]); else stopFx();
            });

            /* 亮／暗切換或「設計模式」(body.expert) 啟動時：換顯示對應的主題；設計模式期間讓出配色，結束後套回 */
            new MutationObserver(function () {
                if (mode() + body.classList.contains('expert') !== lastState) applyTheme();
            }).observe(body, { attributes: true, attributeFilter: ['class'] });

            /* 點擊背景粒子 → 該粒子消失（鍵盤觸發的 click 座標無效，略過） */
            document.addEventListener('click', function (e) {
                if (stopFn && stopFn.pop && e.detail > 0) stopFn.pop(e.clientX, e.clientY);
            }, true);

            function rd(k) { var v = parseInt(load(k), 10); return (!isNaN(v) && v >= 0 && v < THEMES.length) ? v : -1; }
            var d = rd(KEY.idxD), l = rd(KEY.idxL);
            sel.d = (d >= 0 && THEMES[d].m === 'd') ? d : -1;
            sel.l = (l >= 0 && THEMES[l].m === 'l') ? l : -1;
            applyTheme();
        }
        init();
    })();

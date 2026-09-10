/* ============================================================
 * 末日模拟器 · UI 逻辑（手机优先，兼容电脑）
 * 异能觉醒 · 自动逐年修炼 · 本地排行榜 · 音效 · 暂停
 * ============================================================ */
(function () {
  /* ---------- 工具 ---------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
    return String(n);
  }
  function pad2(x) { return (x < 10 ? '0' : '') + x; }
  function fmtTime(ts) {
    var d = new Date(ts), now = new Date();
    var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    if (d.getFullYear() === now.getFullYear()) return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + hm;
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + hm;
  }

  /* ---------- 音效（WebAudio） ---------- */
  var SOUND = true;
  var KEY_SOUND = 'dm_sound';
  var KEY_SPEED = 'dm_speed';
  var audioCtx = null;
  function ensureAudio() {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
    } catch (e) {}
  }
  function blip(freq, dur, type, vol) {
    if (!SOUND) return;
    try {
      ensureAudio();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(vol || 0.1, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) {}
  }
  function loadSound() { try { SOUND = localStorage.getItem(KEY_SOUND) !== '0'; } catch (e) {} }
  function saveSound() { try { localStorage.setItem(KEY_SOUND, SOUND ? '1' : '0'); } catch (e) {} }
  function syncSoundUI() {
    var hs = $('home-sound'); if (hs) hs.checked = SOUND;
  }

  /* ---------- 手动模式：不自动修炼，点击日志区手动加一年（默认关闭） ---------- */
  var MANUAL = false;
  var KEY_MANUAL = 'dm_manual';
  function loadManual() { try { MANUAL = localStorage.getItem(KEY_MANUAL) === '1'; } catch (e) { MANUAL = false; } }
  function saveManual() { try { localStorage.setItem(KEY_MANUAL, MANUAL ? '1' : '0'); } catch (e) {} }
  function syncManualUI() {
    var m = $('home-manual'); if (m) m.checked = MANUAL;
    var mt = $('manual-tip'); if (mt) mt.hidden = !MANUAL;
  }

  /* ---------- 本地统计（纯本地：游玩局数 / 进化总次数） ---------- */
  var KEY_PLAYS = 'dm_plays';
  function loadPlays() { try { return parseInt(localStorage.getItem(KEY_PLAYS) || '0', 10) || 0; } catch (e) { return 0; } }
  function addPlay() {
    var n = loadPlays() + 1;
    try { localStorage.setItem(KEY_PLAYS, n); } catch (e) {}
    renderHomeCount();
    return n;
  }
  function renderHomeCount() {
    var el = $('home-count'); if (el) el.textContent = loadPlays();
  }
  function loadAscendTotal() { try { return parseInt(localStorage.getItem('dm_ascend_total') || '0', 10) || 0; } catch (e) { return 0; } }
  function saveAscendTotal(n) { try { localStorage.setItem('dm_ascend_total', n); } catch (e) {} }

  /* ---------- 玩家等级（经验升级 + K-V 云同步，等级/经验高者胜） ---------- */
  var PLAYER_KEY = 'dm_player';
  var player = { lv: 0, exp: 0 };
  function loadPlayer() {
    try {
      var o = JSON.parse(localStorage.getItem(PLAYER_KEY) || '{"lv":0,"exp":0}');
      player = (o && typeof o.lv === 'number') ? o : { lv: 0, exp: 0 };
    } catch (e) { player = { lv: 0, exp: 0 }; }
  }
  function savePlayer() { try { localStorage.setItem(PLAYER_KEY, JSON.stringify(player)); } catch (e) {} }
  function needExp() { return DATA.PLAYER_LV_BASE * (player.lv + 1); }
  function addExp(amount) {
    player.exp += amount;
    var need = needExp();
    while (player.exp >= need) { player.exp -= need; player.lv++; need = needExp(); }
    savePlayer();
    renderPlayerUI();
  }
  function renderPlayerUI() {
    if (!$('home-lv')) return;
    var need = needExp();
    $('home-lv').textContent = '[Lv.' + player.lv + ']';
    /* 保底标签拼在「抽到高阶异能概率」同一行后，只显示当前档（默认无保底 / ≥25 天赋 E 起 / ≥75 天赋 D 起） */
    var gtag = DATA.guardInfo(player.lv).min;
    var guardTag = gtag >= 3 ? '[保底天赋 D 起（≥75级）]' : (gtag >= 2 ? '[保底天赋 E 起（≥25级）]' : '[无保底]');
    $('home-lv-bonus').textContent = '[抽到高阶异能概率+' + (player.lv * 0.1).toFixed(1) + '%] ' + guardTag;
    $('home-lv-exp').textContent = player.exp + '/' + need;
    $('home-lv-fill').style.width = Math.min(100, (player.exp / need) * 100) + '%';
    renderGuardUI();
  }
  /* ---------- 本地排行榜（战力/寿命/等级 top100） ---------- */
  var LOCAL_BOARDS = {
    combat: { key: 'dm_local_combat', name: '战力' },
    age:    { key: 'dm_local_life',   name: '寿命' },
    lvl:    { key: 'dm_local_lvl',    name: '等级' }
  };
  function loadLocalList(key) {
    try { var a = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function saveLocalList(key, list) { try { localStorage.setItem(key, JSON.stringify(list.slice(0, 100))); } catch (e) {} }
  function insertLocal(key, score) {
    var list = loadLocalList(key);
    var ts = Date.now();
    list.push({ score: score, ts: ts });
    list.sort(function (a, b) { return b.score - a.score || a.ts - b.ts; });
    if (list.length > 100) list = list.slice(0, 100);
    saveLocalList(key, list);
    var rank = list.length + 1;
    for (var i = 0; i < list.length; i++) { if (list[i].score === score && list[i].ts === ts) { rank = i + 1; break; } }
    return { rank: rank, total: list.length };
  }
  /* 读取本地某榜历史第一名分数；空榜返回 -1，保证任何真实战力（≥0）都视为破纪录 */
  function localBest(key) {
    var list = loadLocalList(key), best = -1, i;
    for (i = 0; i < list.length; i++) if (list[i].score > best) best = list[i].score;
    return best;
  }

  /* ============ 高光时刻（记录完整对局：近5 / top5战力 / 全部进化；localStorage） ============ */
  var HL_KEYS = { near: 'dm_hlv3_near', top: 'dm_hlv3_top', god: 'dm_hlv3_god' };
  var hlTab = 'near';        /* 当前 tab：near | top | god */
  var hlCurrent = null;      /* 正在高光回看的记录 */
  function hlLoad(key) {
    try { var a = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  }
  function hlSave(key, list) { try { localStorage.setItem(key, JSON.stringify(list)); } catch (e) {} }

  /* 桶逻辑（纯函数，挂 window.HL 供测试）：
   * near = 最近 N 完整局（时间倒序，新在前）；top = 战力降序前 N；
   * god = 进化记录，按战力降序、保留战力最高的 N（默认 20）条 */
  function hlAddNear(list, rec, n) { return [rec].concat(list || []).slice(0, n || 5); }
  function hlAddTop(list, rec, n) {
    var l = (list || []).concat(rec);
    l.sort(function (a, b) { return b.combat - a.combat || a.ts - b.ts; });
    return l.slice(0, n || 5);
  }
  function hlAddGod(list, rec, n) {
    var l = (list || []).concat(rec);
    l.sort(function (a, b) { return b.combat - a.combat || (b.ts - a.ts) || ((b.guid || '') < (a.guid || '') ? 1 : -1); });
    return l.slice(0, n || 20);
  }
  /* 高光行过滤：导出只含突破/连破/觉醒技能/随机事件/源质/结局等高光，去掉每年普通修炼行（cls=year） */
  function hlHighlights(log) {
    var out = [], i;
    for (i = 0; i < log.length; i++) if (log[i].cls !== 'year') out.push(log[i]);
    return out;
  }
  /* 结局文案（记录/核心数据共用） */
  function hlEndText(rec) {
    if (rec.ascended) return hlAscendKind(rec);
    if (rec.ascendMode === 'fail') return '进化失败';
    return '寿终';
  }
  /* 核心数据文本：导出/分享只含核心字段 */
  function hlCoreText(rec) {
    if (!rec) return '';
    var lines = ['末日模拟器'];
    lines.push('异能：' + (rec.ability || '') + ' · 异能天赋：' + (rec.innate != null ? DATA.tierName(rec.innate) : ''));
    lines.push('结局：' + (rec.end || hlEndText(rec)));
    lines.push('最终等级：' + (rec.lvl != null ? rec.lvl : '') + '级');
    lines.push('战力：' + fmt(rec.combat != null ? rec.combat : 0));
    lines.push((rec.ascended ? '进化用时' : '存活年数') + '：' + rec.age + '岁');
    var skill = (rec.skill && rec.skill.length) ? rec.skill : null;
    if (skill) {
      var hs = [];
      for (var hi = 0; hi < skill.length; hi++) { var it = SKILL_DISP[skill[hi]]; hs.push(it ? it.d : skill[hi]); }
      lines.push('技能：' + hs.join('·'));
    }
    if (rec.essenceName) lines.push('基因源质：' + rec.essenceName);
    return lines.join('\n');
  }
  function hlClipText(rec) {   /* 生涯详情文本：首行末日模拟器 → 高光履历逐行（不带链接） */
    var lines = ['末日模拟器'], log = hlHighlights(rec && rec.log), i;
    for (i = 0; i < log.length; i++) lines.push(log[i].text);
    return lines.join('\n');
  }
  /* 记录 → 核心小对象（剔除 log，用于云端分块/跨端） */
  function hlCoreOf(rec) {
    var c = {}, k;
    var keys = ['guid', 'ts', 'ability', 'innate', 'lvl', 'title', 'combat', 'age', 'lifespan', 'ascended', 'ascendMode', 'skill', 'essenceName', 'end'];
    for (k = 0; k < keys.length; k++) if (rec[keys[k]] !== undefined) c[keys[k]] = rec[keys[k]];
    return c;
  }
  /* 真实超生命体进化方式：炼化晋升/强行进化/进化本源（旧记录 ascendMode='god' 无细分 → 统一显示「超生命体」） */
  function hlAscendKind(rec) {
    var m = rec && rec.ascendMode;
    if (m === 'refine') return '炼化晋升';
    if (m === 'forced') return '强行进化';
    if (m === 'origin') return '进化本源';
    return '超生命体';
  }
  function hlResultLabel(rec) {
    if (rec.ascended) return hlAscendKind(rec);
    if (rec.ascendMode === 'fail') return '进化失败';
    return '寿终';
  }
  function hlBadgeCls(rec) {
    if (rec.ascended) return 'asc-' + (rec.ascendMode && rec.ascendMode !== 'god' ? rec.ascendMode : 'god');
    if (rec.ascendMode === 'fail') return 'fail';
    return 'dead';
  }

  /* 结算时记录（仅完整局：death / god；提前结算 pause 不记） */
  function recordHighlight(reason) {
    if (reason !== 'dead' && reason !== 'god') return;
    var log = [];
    try { log = JSON.parse(JSON.stringify(fullLog)); } catch (e) {}
    var rec = {
      guid: Date.now() + '_' + Math.floor(Math.random() * 1e6),   /* 跨端/云端合并唯一键 */
      ts: Date.now(), ability: G.ability, innate: G.innate,
      lvl: G.lvl, title: DATA.titleOf(G.lvl), combat: G.combat,
      age: G.age, lifespan: G.lifespan, ascended: G.ascended,
      ascendMode: G.ascended ? (G.ascendMode === 'refine' || G.ascendMode === 'forced' || G.ascendMode === 'origin' ? G.ascendMode : 'god') : (G.ascendMode === 'fail' ? 'fail' : 'dead'),
      end: G.ascended ? (G.ascendMode === 'refine' ? '炼化晋升' : G.ascendMode === 'forced' ? '强行进化' : G.ascendMode === 'origin' ? '进化本源' : '超生命体') : (G.ascendMode === 'fail' ? '进化失败' : '寿终'),
      skill: (G.skillSeq || []).slice(),
      essenceName: G.essence && G.essence.length ? G.essence[0].name : null,
      log: log
    };
    hlSave(HL_KEYS.near, hlAddNear(hlLoad(HL_KEYS.near), rec));
    hlSave(HL_KEYS.top, hlAddTop(hlLoad(HL_KEYS.top), rec));
    if (rec.ascended) hlSave(HL_KEYS.god, hlAddGod(hlLoad(HL_KEYS.god), rec));
  }

  /* ---------- 高光视图 ---------- */
  function openHL() {
    hlTab = 'near';
    hlRenderTabs();
    hlRender();
    show('highlight');
  }
  function hlRenderTabs() {
    var box = $('hl-tabs'); if (!box) return;
    box.innerHTML = '';
    var tabs = [['near', '近 5 局'], ['top', 'Top5 战力'], ['god', '进化局']];
    for (var i = 0; i < tabs.length; i++) {
      (function (id, label) {
        makeTab(box, hlTab === id, label, function () {
          hlTab = id; hlRenderTabs(); hlRender(); blip(500, 0.06, 'triangle', 0.08);
        });
      })(tabs[i][0], tabs[i][1]);
    }
  }
  function hlPick() {
    var key = hlTab === 'god' ? HL_KEYS.god : (hlTab === 'top' ? HL_KEYS.top : HL_KEYS.near);
    var list = hlLoad(key);
    if (hlTab === 'god') return list;   /* god 已按战力降序（最高在前） */
    return list;
  }
  function hlRow(rec) {
    var row = document.createElement('div');
    row.className = 'hl-row';
    var top = document.createElement('div'); top.className = 'hl-top';
    var t = document.createElement('span'); t.className = 'hl-time'; t.textContent = fmtTime(rec.ts);
    var tt = document.createElement('span'); tt.className = 'hl-title';
    tt.textContent = (rec.ability || '') + ' · 天赋 ' + DATA.tierName(rec.innate);
    var b = document.createElement('span'); b.className = 'hl-badge ' + hlBadgeCls(rec); b.textContent = hlResultLabel(rec);
    top.appendChild(t); top.appendChild(tt); top.appendChild(b);
    row.appendChild(top);
    var subLine = document.createElement('div'); subLine.className = 'hl-sub-line';
    var sub = document.createElement('div'); sub.className = 'hl-sub';
    sub.innerHTML = '最后战力 <b>' + fmt(rec.combat) + '</b> · 等级 ' + rec.lvl + ' 级 · ' +
      (rec.ascended ? '进化用时' : '存活年数') + ' ' + rec.age + ' 岁';   /* 去职称 */
    subLine.appendChild(sub);
    row.appendChild(subLine);
    /* 行下双按钮：导出详情 = 现有回顾（完整履历+复制+存图）；导出成就图 = 核心数据结算卡 */
    var acts = document.createElement('div'); acts.className = 'hl-row-actions';
    var bD = document.createElement('button'); bD.type = 'button'; bD.className = 'hl-act-btn'; bD.textContent = '📋 导出详情';
    bD.addEventListener('click', function (ev) { ev.stopPropagation(); blip(520, 0.06, 'triangle', 0.08); openHLReview(rec); });
    var bC = document.createElement('button'); bC.type = 'button'; bC.className = 'hl-act-btn primary'; bC.textContent = '🖼 导出成就图';
    bC.addEventListener('click', function (ev) { ev.stopPropagation(); blip(560, 0.06, 'triangle', 0.08); hlExportCard(rec); });
    acts.appendChild(bD); acts.appendChild(bC);
    row.appendChild(acts);
    row.addEventListener('click', function () { blip(500, 0.06, 'triangle', 0.08); openHLReview(rec); });
    return row;
  }
  function hlRender() {
    var box = $('hl-list'); if (!box) return;
    box.innerHTML = '';
    var list = hlPick();
    if (!list.length) {
      var e = document.createElement('div');
      e.className = 'hl-empty';
      e.textContent = '还没有记录～\n完整走完一局（寿终或进化）后，会自动收录到这里。';
      box.appendChild(e);
      return;
    }
    for (var i = 0; i < list.length; i++) box.appendChild(hlRow(list[i]));
  }

  /* ---------- 高光履历回看 + 导出 ---------- */
  function openHLReview(rec) {
    hlCurrent = rec;
    var box = $('hl-review-log'); box.innerHTML = '';
    var frag = document.createDocumentFragment();
    var log = rec && rec.log && rec.log.length ? rec.log : null;
    if (log) {
      for (var i = 0; i < log.length; i++) {
        var d = document.createElement('div');
        d.className = 'rv-' + (log[i].cls || 'year');
        d.textContent = log[i].text;
        frag.appendChild(d);
      }
    } else {
      /* core-only（云端拉回无履历）：展示核心数据文本 */
      var hint = document.createElement('div'); hint.className = 'rv-year'; hint.textContent = '（云端记录 · 仅核心数据，无逐行履历）';
      frag.appendChild(hint);
      var ct = hlCoreText(rec).split('\n');
      for (var j = 0; j < ct.length; j++) {
        var d2 = document.createElement('div'); d2.className = 'rv-year'; d2.textContent = ct[j];
        frag.appendChild(d2);
      }
    }
    box.appendChild(frag);
    $('hl-mask').hidden = false;
  }
  function closeHLReview() { $('hl-mask').hidden = true; }

  /* top5 战力榜内容是否变化（有新纪录进榜 / 挤掉旧记录都算） */
  function hlTopChanged(before, after) {
    var seen = {}, i;
    for (i = 0; i < (before || []).length; i++) seen[(before[i] || {}).guid || ''] = 1;
    for (i = 0; i < (after || []).length; i++) if (!seen[(after[i] || {}).guid || '']) return true;
    return false;
  }
  function hlTrimKind(list, kind) {
    var l = (list || []).slice();
    if (kind === 'near') { l.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); }); return l.slice(0, 5); }
    l.sort(function (a, b) { return b.combat - a.combat || ((b.ts || 0) - (a.ts || 0)); });
    return l.slice(0, kind === 'god' ? 20 : 5);
  }

  function hlToast(msg, ms) {
    var el = $('hl-toast'); if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(hlToast._t);
    hlToast._t = setTimeout(function () { el.hidden = true; }, ms || 2000);
  }
  function copyHl() {
    if (!hlCurrent) return;
    var txt = hlClipText(hlCurrent);
    function ok() { hlToast('✅ 已复制到剪贴板，去分享吧'); blip(700, 0.1, 'triangle', 0.1); }
    function fallback() {
      try {
        var ta = document.createElement('textarea');
        ta.value = txt;
        ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        var ok2 = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok2) ok(); else hlToast('❌ 复制失败（浏览器限制）');
      } catch (e) { hlToast('❌ 复制失败'); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok).catch(fallback);
    else fallback();
  }

  /* ---------- 存为图片：生成海报全屏展示，点「下载图片」按钮保存 ---------- */
  var hlCurDataUrl = null;   /* 当前展示的海报 dataURL */
  function hlErrMsg(e) {
    if (!e) return '未知错误';
    if (typeof e === 'string') return e;
    return (e.message || e.type || e.code || JSON.stringify(e)) || '未知错误';
  }
  /* 下载按钮：标准浏览器 <a download> 保存 */
  function hlDownload(dataUrl) {
    var data = dataUrl || hlCurDataUrl;
    if (!data) { hlToast('❌ 没有可保存的图片'); return; }
    try {
      var a = document.createElement('a');
      a.href = data; a.download = '末日模拟器-履历.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      hlToast('✅ 已开始下载');
    } catch (e) { hlToast('❌ 下载失败（' + hlErrMsg(e) + '）'); }
  }
  function hlShowImg(dataUrl) {
    var img = $('hl-img'); if (!img) return;
    hlCurDataUrl = dataUrl;
    img.src = dataUrl;
    $('hl-img-mask').hidden = false;
  }
  function hlCloseImg() {
    $('hl-img-mask').hidden = true;
    try { $('hl-img').src = ''; } catch (e) {}
    hlCurDataUrl = null;
  }
  function hlImgExport() {
    if (!hlCurrent) return;
    if (!hlCurrent.log || !hlCurrent.log.length) { hlToast('❌ 该记录来自云端，仅核心数据（可点「导出成就图」）', 3000); return; }
    hlToast('⏳ 正在生成履历图片…', 2500);
    hlBuildCanvas(hlCurrent, function (canvas) {
      if (!canvas) { hlToast('❌ 图片生成失败'); return; }
      var dataUrl = null;
      try { dataUrl = canvas.toDataURL('image/png'); } catch (e) { hlToast('❌ 图片生成失败（' + hlErrMsg(e) + '）'); return; }
      if (!dataUrl || dataUrl.length < 100) { hlToast('❌ 图片生成失败：画布为空'); return; }
      hlShowImg(dataUrl);
    });
  }
  function hlWrapText(ctx, s, maxW) {
    var out = [], cur = '';
    for (var i = 0; i < s.length; i++) {
      var test = cur + s[i];
      if (cur && ctx.measureText(test).width > maxW) { out.push(cur); cur = s[i]; }
      else cur = test;
    }
    if (cur) out.push(cur);
    return out;
  }
  /* 导出图片按日志 cls 保留分类颜色：白底上用可读的深色调，与 .rv-* 语义一致 */
  function hlStyle(cls) {
    switch (cls) {
      case 'brk':    return { fg: '#1e6f3c', bg: 'rgba(30,111,60,.10)',  bold: true };
      case 'ev1':    return { fg: '#1f5fae', bg: 'rgba(31,95,174,.10)' };
      case 'ev2':    return { fg: '#7b3fa0', bg: 'rgba(123,63,160,.10)' };
      case 'ev3':    return { fg: '#a87c00', bg: 'rgba(168,124,0,.12)' };
      case 'ev4':    return { fg: '#c0392b', bg: 'rgba(192,57,43,.10)' };
      case 'skill':   return { fg: '#c2185b', bg: 'rgba(194,24,91,.10)' };
      case 'god':    return { fg: '#8a6d00', bg: 'rgba(138,109,0,.12)', bold: true };
      case 'dead':   return { fg: '#b71c1c', bg: 'rgba(183,28,28,.08)' };
      case 'rare':   return { fg: '#e65100', bg: 'rgba(230,81,0,.10)' };
      case 'red':    return { fg: '#b71c1c', bg: 'rgba(183,28,28,.10)', bold: true };
      case 'rainbow': return { fg: '#b8860b', bg: 'rgba(184,134,11,.10)', bold: true };
      default:       return { fg: '#44566b', bg: 'rgba(68,86,107,.06)' };   /* year 等 */
    }
  }

  /* ---------- 导出成就图：结算卡式核心数据图 ---------- */
  function hlExportCard(rec) {
    if (!rec) return;
    hlToast('⏳ 正在生成成就图…', 2500);
    buildCoreCard(rec, function (dataUrl) {
      if (!dataUrl) { hlToast('❌ 图片生成失败'); return; }
      hlShowImg(dataUrl);
    });
  }
  function hlCardRound(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }
  function hlCardChip(name) {
    var it = SKILL_DISP[name] || { d: name, c: 'ten' };
    var col = { ten: ['#ffffff', '#333333'], bai: ['#f4c542', '#3a2c0a'], qian: ['#9b6bff', '#ffffff'],
                wan: ['#17171e', '#ffffff'], shiwan: ['#e03a3a', '#ffffff'] }[it.c] || ['#ffffff', '#333333'];
    return { bg: col[0], fg: col[1], d: it.d };
  }
  function buildCoreCard(rec, cb) {
    var W = 760, pad = 44, F = '"PingFang SC","Microsoft YaHei",sans-serif';
    var cv = document.createElement('canvas'); cv.width = W;
    var ctx = cv.getContext('2d');
    if (!ctx) { cb(null); return; }
    var chips = [], i;
    (rec.skill || []).forEach(function (h) { chips.push(hlCardChip(h)); });
    var godN = essenceShortName(rec);
    if (godN) chips.push({ bg: null, fg: '#3a2c0a', d: godN, rainbow: true });
    ctx.font = 'bold 22px ' + F;
    var maxW = W - pad * 2, cw = 0, cur = [], lines = [];
    function wch(c) { return c.rainbow ? 78 : ctx.measureText(c.d).width + 36; }
    for (i = 0; i < chips.length; i++) {
      var w = wch(chips[i]);
      if (cur.length && cw + w + 14 > maxW) { lines.push(cur); cur = []; cw = 0; }
      cur.push(chips[i]); cw += w + 14;
    }
    if (cur.length) lines.push(cur);
    var rows = 6, chipArea = lines.length * 58;
    var H = pad + 190 + rows * 56 + 70 + chipArea + 150 + pad;
    cv.height = H;
    ctx = cv.getContext('2d');
    var g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#1a2233'); g.addColorStop(1, '#0f1420');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#c9a13b'; ctx.lineWidth = 3; ctx.strokeRect(4, 4, W - 8, H - 8);
    ctx.textBaseline = 'top';
    var y = pad;
    ctx.textAlign = 'center'; ctx.fillStyle = '#c9a13b'; ctx.font = 'bold 30px ' + F;
    ctx.fillText('末日模拟器 · 高光时刻', W / 2, y); y += 48;
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 44px ' + F;
    ctx.fillText((rec.ability || '') + '【异能天赋：' + (rec.innate != null ? DATA.tierName(rec.innate) : '') + '】', W / 2, y); y += 70;
    ctx.fillStyle = rec.ascended ? '#ffd98a' : (rec.ascendMode === 'fail' ? '#ff9a9a' : '#c9cdd6');
    ctx.font = 'bold 30px ' + F;
    ctx.fillText(rec.end || hlEndText(rec), W / 2, y); y += 46;
    ctx.strokeStyle = 'rgba(201,161,59,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    y += 26;
    ctx.textAlign = 'left';
    var fields = [
      ['异能', rec.ability || ''],
      ['异能天赋', (rec.innate != null ? DATA.tierName(rec.innate) : '')],
      ['最终等级', (rec.lvl != null ? rec.lvl : '') + ' 级'],
      ['战力', fmt(rec.combat != null ? rec.combat : 0)],
      [rec.ascended ? '进化用时' : '存活年数', (rec.age != null ? rec.age : '') + ' 岁'],
      ['基因源质', rec.essenceName ? rec.essenceName : '—']
    ];
    ctx.font = '23px ' + F;
    fields.forEach(function (f) {
      ctx.fillStyle = '#7f8ba0'; ctx.fillText(f[0], pad, y);
      ctx.fillStyle = '#e8e4d8'; ctx.textAlign = 'right'; ctx.fillText(f[1], W - pad, y); ctx.textAlign = 'left';
      y += 56;
    });
    y += 30;
    ctx.textAlign = 'center'; ctx.fillStyle = '#8b96ab'; ctx.font = '20px ' + F;
    ctx.fillText('—— 技能 ——', W / 2, y); y += 40;
    ctx.font = 'bold 22px ' + F;
    lines.forEach(function (ln) {
      var total = 0, j;
      for (j = 0; j < ln.length; j++) total += wch(ln[j]);
      total += (ln.length - 1) * 14;
      var x = (W - total) / 2;
      for (j = 0; j < ln.length; j++) {
        var w2 = wch(ln[j]);
        if (ln[j].rainbow) {
          var gg = ctx.createLinearGradient(x, 0, x + w2, 0);
          ['#ff4d4f', '#ff9800', '#ffeb3b', '#4caf50', '#00bcd4', '#3f51b5', '#9c27b0'].forEach(function (col, idx) { gg.addColorStop(idx / 6, col); });
          ctx.fillStyle = gg;
        } else ctx.fillStyle = ln[j].bg;
        hlCardRound(ctx, x, y, w2, 44, 22); ctx.fill();
        ctx.fillStyle = ln[j].fg; ctx.textAlign = 'center';
        ctx.fillText(ln[j].d, x + w2 / 2, y + 11);
        x += w2 + 14;
      }
      y += 58;
    });
    y += 8;
    ctx.fillStyle = '#ffe9a8'; ctx.font = 'bold 24px ' + F; ctx.textAlign = 'center';
    ctx.fillText('末日模拟器 —— 看看你能成为进化的那个幸运儿吗？', W / 2, y);
    y += 44;
    try { cb(cv.toDataURL('image/png')); } catch (e) { cb(null); }
  }

  function hlBuildCanvas(rec, done) {
    var W = 720, pad = 26, lineH = 28, headH = 100, bottomPad = 26;
    var MAXH = 3500;                                   /* 画布高度上限（留 iOS/部分安卓 4096 余量，防 toDataURL 空/报错） */
    var raw = hlHighlights(rec && rec.log), i, j;   /* 导出只含高光，日常修炼行不画入图 */
    var cv = document.createElement('canvas');
    cv.width = W;
    var ctx = cv.getContext('2d');
    if (!ctx) { done(null); return; }
    ctx.font = '15px "PingFang SC","Microsoft YaHei",sans-serif';
    var maxTextW = W - pad * 2;
    /* 预留行数：超过则截断为 头N + 省略 + 尾M，避免画布超高 */
    var maxBodyPx = MAXH - headH - bottomPad;
    var maxLines = Math.floor(maxBodyPx / lineH);
    var wrapped = [];                                    /* { t: 文本, cls: 日志类型 } */
    for (i = 0; i < raw.length; i++) {
      var cls = raw[i].cls || 'year';
      var ws = hlWrapText(ctx, raw[i].text, maxTextW);
      for (j = 0; j < ws.length; j++) wrapped.push({ t: ws[j], cls: cls });
    }
    if (wrapped.length > maxLines) {
      var tailN = Math.min(40, Math.floor(maxLines / 2));
      var headN = maxLines - tailN - 1;
      var omitted = wrapped.length - (headN + tailN);
      wrapped = wrapped.slice(0, headN)
        .concat([{ t: '……（中间省略 ' + omitted + ' 行）……', cls: 'red' }])
        .concat(wrapped.slice(wrapped.length - tailN));
    }
    var logH = wrapped.length * lineH;
    var totalH = headH + logH + bottomPad;
    cv.height = totalH;
    /* 白底 */
    ctx = cv.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, totalH);
    ctx.textBaseline = 'top';
    /* 标题区：首行「末日模拟器」大字，再接副标题 */
    var y = pad;
    ctx.font = 'bold 22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#222';
    ctx.fillText('末日模拟器', pad, y); y += 32;
    ctx.font = '14px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#666';
    ctx.fillText('异能 ' + (rec.ability || '') + ' · 天赋 ' + DATA.tierName(rec.innate) + ' · ' + fmtTime(rec.ts) + ' · 最后战力 ' + fmt(rec.combat) + ' · ' + hlResultLabel(rec), pad, y);
    y += 26;
    ctx.strokeStyle = '#e0e0e0'; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    y += 16;
    /* 履历正文：按 cls 着色（保留游戏内突破绿/事件金/红/粉技能等分类色）+ 浅色行底 */
    for (i = 0; i < wrapped.length; i++) {
      var st = hlStyle(wrapped[i].cls);
      ctx.fillStyle = st.bg;
      ctx.fillRect(pad, y, maxTextW, lineH);
      ctx.font = (st.bold ? 'bold ' : '') + '15px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillStyle = st.fg;
      ctx.fillText(wrapped[i].t, pad, y);
      y += lineH;
    }
    done(cv);
  }

  /* ---------- 全局状态 ---------- */
  var G = null;
  var timer = null;
  var TICK_MS = 300;   /* 一年时长（默认 0.3s，可由首页滑块 0.1~1s 调整） */
  var FAST_MS = 60;    /* 连破升级行之间的快速间隔：连续弹出、无停顿 */
  var settleReason = '';
  var fullLog = [];    /* 本局全部日志（回顾人生用） */
  var pendingLogs = [];  /* 逐年逐条弹出的日志队列 */

  /* ---------- 视图切换 ---------- */
  function show(v) {
    var views = document.querySelectorAll('.view'), i;
    for (i = 0; i < views.length; i++) views[i].hidden = views[i].id !== 'view-' + v;
    if (v === 'home') { renderHomeCount(); }   /* 每次回首页刷新本机游玩局数 */
  }
  /* ---------- 设置页（可从首页/暂停进入，关闭返回来源） ---------- */
  var settingsReturn = 'home';
  function openSettings(from) {
    settingsReturn = from;
    $('pause-mask').hidden = true;
    show('settings');
  }
  function closeSettings() {
    if (settingsReturn === 'pause') { show('game'); $('pause-mask').hidden = false; }
    else show('home');
  }
  function hideMask() { $('pause-mask').hidden = true; }

  /* ---------- 首页 ---------- */
  /* 首页三入口文字自适应：容器放不下则逐档缩小字号，绝不换行 */
  /* 首页三入口文字自适应：默认用 CSS 字号（与其它按钮一致）；仅当真实文本宽度
   * 超出按钮可用宽时才逐档缩小。测量用离屏 span，不依赖易误判的 scrollWidth */
  function fitHomeBtns() {
    var confs = [['btn-rank', 8], ['btn-ach', 12], ['btn-guard', 8]];   /* 各按钮左右 padding 合计 */
    if (!document.body || typeof window.getComputedStyle !== 'function') return;
    var tmp = document.createElement('span');
    tmp.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:nowrap;visibility:hidden;pointer-events:none;';
    document.body.appendChild(tmp);
    for (var k = 0; k < confs.length; k++) {
      var b = $(confs[k][0]); if (!b) continue;
      var cw = b.clientWidth || b.offsetWidth;
      if (!cw || cw <= 0) continue;   /* 布局未就绪/隐藏时跳过 */
      var el = confs[k][0] === 'btn-rank' ? b : (b.firstElementChild || b);
      if (!el) continue;
      el.style.fontSize = '';   /* 复位到 CSS 默认（17px） */
      var cs = window.getComputedStyle(el);
      var text = el.textContent || '';
      if (!text) continue;
      tmp.style.fontFamily = cs.fontFamily;
      tmp.style.fontSize = cs.fontSize;
      tmp.style.fontWeight = cs.fontWeight;
      tmp.textContent = text;
      var avail = cw - confs[k][1];
      if (tmp.offsetWidth <= avail) continue;   /* 放得下 → 完全不动 */
      var fs = parseFloat(cs.fontSize);
      while (fs > 11) {
        fs -= 0.5;
        tmp.style.fontSize = fs + 'px';
        if (tmp.offsetWidth <= avail) { el.style.fontSize = fs + 'px'; break; }
      }
      if (tmp.offsetWidth > avail) el.style.fontSize = '11px';   /* 兜底 */
    }
    try { document.body.removeChild(tmp); } catch (e) {}
  }
  function refreshHome() {
    renderHomeCount();
    renderPlayerUI();
    syncSoundUI();
    setTimeout(fitHomeBtns, 30);   /* 等布局稳定后再做自适应收缩 */
  }

  /* ---------- 开始游戏：抽异能 → 直接进入游戏页（第6岁异能觉醒） ---------- */
  function startGame() {
    ensureAudio(); blip(660, 0.08, 'triangle', 0.1);
    var guardHit = guard.pts >= 100;
    if (guardHit) {
      guardClear();
      hlToast('🔥 保底触发：本次必定觉醒 EX 天赋！', 2800);
    }
    G = Sim.createGame(player.lv, guardHit ? { force10: true } : undefined);
    $('game-title').textContent = G.ability + '【异能天赋：' + DATA.tierName(G.innate) + '】';
    renderAttrs();
    pendingLogs = [];   /* 清空上一局残留的连破日志，避免新局弹出旧局日志（旧年份/旧事件混入、天赋档不生效） */
    $('log-box').innerHTML = '';
    var first = [];
    if (G.innate >= 8) first.push({ cls: 'rare', text: '第6岁，天生天才！天赋 ' + DATA.tierName(G.innate) + ' ' });
    first.push({ cls: 'brk', text: '第6岁，异能觉醒，' + G.ability + '！天赋 ' + DATA.tierName(G.innate) + ' ，战力 ' + G.combat });
    fullLog = [];
    for (var fi = 0; fi < first.length; fi++) fullLog.push(first[fi]);
    renderLog(first);
    show('game');
    syncManualUI();
    startPlay();
    addPlay();   /* 每开一局本机游玩局数 +1 */
  }
  function startPlay() { stopPlay(); if (MANUAL) return; playTick(); }   /* 手动模式不自动修炼 */
  function stopPlay() { if (timer) { clearTimeout(timer); timer = null; } }
  /* 自调度主循环：有待弹的连破日志时用 FAST_MS 连续弹出（无停顿），否则按一年 TICK_MS */
  function playTick() {
    var gap = pendingLogs.length ? FAST_MS : TICK_MS;
    timer = setTimeout(function () {
      if (!timer) return;
      tick();
      if (timer) playTick();
    }, gap);
  }
  function setSpeed() {
    var r = $('speed-range'); if (!r) return;
    var v = parseFloat(r.value);
    $('speed-val').textContent = v.toFixed(1) + 's';
    TICK_MS = Math.round(v * 1000);
    try { localStorage.setItem(KEY_SPEED, String(v)); } catch (e) {}   /* 速度持久化 */
    if (timer) { stopPlay(); startPlay(); }   /* 播放中调整速度即时生效 */
  }
  function loadSpeed() {
    try {
      var v = parseFloat(localStorage.getItem(KEY_SPEED));
      if (isFinite(v) && v >= 0.1 && v <= 1) {
        TICK_MS = Math.round(v * 1000);
        var r = $('speed-range'); if (r) r.value = v;
        var s = $('speed-val'); if (s) s.textContent = v.toFixed(1) + 's';
      }
    } catch (e) {}
  }

  function tick() {
    if (pendingLogs.length) {
      /* 还有本年的日志没弹完：逐条追加显示 */
      renderLog([pendingLogs.shift()]);
      renderAttrs();
      if (!pendingLogs.length && (G.dead || G.ascended)) { stopPlay(); finishGame(G.dead ? 'dead' : 'god'); }
      return;
    }
    var log = Sim.rollYear(G);
    for (var i = 0; i < log.length; i++) fullLog.push(log[i]);
    renderAttrs();
    /* 死亡/进化那年：日志整批显示并立即结算（避免寿元最后一年「突破连破+事件+死亡」多条日志
     * 进 pendingLogs 逐条弹、弹完才结算，手动模式会卡住不结算） */
    if (G.dead || G.ascended) {
      renderLog(log);
    } else {
      /* 只有连破（多条突破升级）才逐条弹出；普通日志（含单次升级/事件）立即显示 */
      var brkCount = 0, j;
      for (j = 0; j < log.length; j++) if (log[j].cls === 'brk') brkCount++;
      if (brkCount > 1) {
        /* 连破逐条弹出「后弹在最上面」：机缘行（ev）在 log 中靠前先弹 → 显示在下面（下面=先发生），
         * 升级行后弹 → 在上面，正符合「先机缘、后升级」 */
        pendingLogs = log.slice();
        if (pendingLogs.length) renderLog([pendingLogs.shift()]);
      } else {
        renderLog(log);
      }
    }
    if (!pendingLogs.length && (G.dead || G.ascended)) { stopPlay(); finishGame(G.dead ? 'dead' : 'god'); }
  }

  /* ---------- 渲染 ---------- */
  function renderAttrs() {
    var lvEl = $('attr-lvl');
    if (lvEl) lvEl.textContent = DATA.titleOf(G.lvl) + '（' + G.lvl + '）';
    $('attr-apt').textContent = DATA.tierName(G.aptitude) + '/' + G.aptitude;
    $('attr-life').textContent = G.age + '/' + G.lifespan;
    $('attr-combat').textContent = fmt(G.combat);
    /* 同步异能+异能天赋（双生异能觉醒等事件会替换 ability/innate） */
    var gt = $('game-title'); if (gt) gt.textContent = G.ability + '【异能天赋：' + DATA.tierName(G.innate) + '】';
    var ahc = $('attr-skill-chips');
    if (ahc) ahc.innerHTML = skillChipsHtml(G && G.skillSeq, essenceShortName(G));
    ['attr-lvl', 'attr-apt', 'attr-life', 'attr-combat'].forEach(function (id) { fitAttrVal($(id)); });
  }
  /* 属性卡值逐档缩小字号至一行放下（宁可缩小不换行）；先复位到 CSS 默认字号再测量 */
  function fitAttrVal(el) {
    if (!el || !document.body || typeof window.getComputedStyle !== 'function') return;
    var card = el.parentElement;
    var avail = card ? (card.clientWidth || card.offsetWidth) : (el.clientWidth || el.offsetWidth);
    if (card) { var cs0 = window.getComputedStyle(card); avail -= parseFloat(cs0.paddingLeft || 0) + parseFloat(cs0.paddingRight || 0); }
    if (!avail || avail <= 0) return;
    var tmp = document.createElement('span');
    tmp.style.cssText = 'position:fixed;left:-9999px;top:0;white-space:nowrap;visibility:hidden;pointer-events:none;';
    var cs = window.getComputedStyle(el);
    tmp.style.fontFamily = cs.fontFamily;
    tmp.style.fontWeight = cs.fontWeight;
    tmp.textContent = el.textContent || '';
    document.body.appendChild(tmp);
    var fs = 26;                              /* 从 CSS 基准字号开始测量（不读行内残留） */
    tmp.style.fontSize = fs + 'px';
    while (tmp.offsetWidth > avail && fs > 11) { fs -= 0.5; tmp.style.fontSize = fs + 'px'; }
    try { document.body.removeChild(tmp); } catch (e) {}
    el.style.fontSize = fs + 'px';
  }
  /* 技能档级 → 展示文案/色块 class */
  /* 技能档级显示：D/C/B/A/S（兼容旧记录的中文年限名，同样映射到新档级与配色） */
  var SKILL_DISP = {
    'D': { d: 'D', c: 'ten' }, 'C': { d: 'C', c: 'bai' }, 'B': { d: 'B', c: 'qian' },
    'A': { d: 'A', c: 'wan' }, 'S': { d: 'S', c: 'combat100k' },
    '十年': { d: 'D', c: 'ten' }, '百年': { d: 'C', c: 'bai' }, '千年': { d: 'B', c: 'qian' },
    '万年': { d: 'A', c: 'wan' }, '十万年': { d: 'S', c: 'combat100k' }
  };
  /* 从基因源质名取展示短名（如 基因源质·赤情之心 → 赤情之心；旧版 ESSENCE 名含「信物」时取前段兼容） */
  function essenceShortName(rec) {
    var n = rec && (rec.essenceName || (rec.essence && rec.essence.length && rec.essence[0].name));
    if (!n) return null;
    var s = String(n);
    if (s.indexOf('·') >= 0) { s = s.split('·').pop(); }
    else if (s.indexOf('信物') >= 0) { s = s.split('信物')[0]; }
    return s || null;
  }
  function skillChipsHtml(seq, essenceShort) {
    var s = '';
    if (seq && seq.length) {
      for (var i = 0; i < seq.length; i++) {
        var it = SKILL_DISP[seq[i]] || { d: seq[i] || '?', c: 'ten' };
        s += '<span class="skill-chip hc-' + it.c + '">' + it.d + '</span>';
      }
    }
    if (essenceShort) s += '<span class="skill-chip hc-essence">' + esc(essenceShort) + '</span>';   /* 源质：七彩胶囊内显短名 */
    return s;
  }
  function renderLog(logs) {
    var box = $('log-box');
    var frag = document.createDocumentFragment();
    for (var i = 0; i < logs.length; i++) {
      var d = document.createElement('div');
      d.className = 'log-item' + (logs[i].cls ? ' ' + logs[i].cls : '');
      d.textContent = logs[i].text;
      frag.appendChild(d);
    }
    box.insertBefore(frag, box.firstChild);   /* 最新在上：新日志插到顶部（保留全部，供读者查看与回顾） */
  }

  /* ---------- 暂停 ---------- */
  function pauseGame() {
    if (!G || G.dead || G.ascended) return;   /* 无对局或已结束不暂停（手动模式 timer 恒 null，不能按 timer 判断） */
    stopPlay();
    $('pause-info').textContent = '异能 ' + G.ability + ' · ' + G.age + ' 岁 · 等级 ' + G.lvl + ' 级';
    $('pause-mask').hidden = false;
  }
  function resumeGame() {
    if (!G) return;
    hideMask();
    ensureAudio();
    startPlay();
  }
  function exitGame() {
    stopPlay();
    hideMask();
    G = null;
    show('home');
  }

  /* ---------- 结算 ---------- */
  function finishGame(reason) {
    if (!G) return;
    stopPlay(); hideMask();
    pendingLogs = [];   /* 结算时清空未弹完的连破日志，防残留到下一局 */
    settleReason = reason;

    /* 本机游玩局数已改为每开一局计一次（startGame），结算不再计 */

    /* 本地三榜 */
    var rC = insertLocal('dm_local_combat', G.combat);
    var rA = insertLocal('dm_local_life', G.lifespan);
    var rL = insertLocal('dm_local_lvl', G.lvl);

    /* 本地进化总次数（成就用，纯本地） */
    if (G.ascended) saveAscendTotal(loadAscendTotal() + 1);

    /* 结算经验：进化 +1000；正常结算 = 等级×0.5；提前结算 = 等级×0.1 */
    var expGain = G.ascended ? DATA.ASCEND_EXP : Math.round(G.lvl * (reason === 'pause' ? DATA.EXP_PER_LVL_EARLY : DATA.EXP_PER_LVL));
    addExp(expGain);

    /* 保底积分：正常结算 +1（提前结算 pause 不加）；91+ +3、99 +5、进化 +20（取最高档不叠加） */
    if (reason !== 'pause') guardAdd(guardGainFor(reason, G));

    /* 渲染 */
    var t = $('settle-title');
    if (reason === 'god') { t.textContent = '✨ 超生命体进化 ✨'; t.className = 'settle-title god'; blip(880, 0.4, 'triangle', 0.14); }
    else if (reason === 'dead') {
      if (G.ascendMode === 'fail') { t.textContent = '⚡ 进化失败 · 崩解'; blip(120, 0.4, 'sawtooth', 0.14); }
      else { t.textContent = '💀 与世长辞'; blip(160, 0.4, 'sawtooth', 0.12); }
      t.className = 'settle-title';
    }
    else { t.textContent = '⏸ 提前结算'; t.className = 'settle-title'; blip(400, 0.2, 'triangle', 0.1); }

    $('settle-ability').innerHTML = '异能 <b>' + esc(G.ability) + '</b> · 异能天赋 ' + DATA.tierName(G.innate) + ' ';
    $('settle-lvl').textContent = G.lvl;   /* 只显示等级，去职称 */
    $('settle-combat').textContent = fmt(G.combat);
    $('settle-age').textContent = G.age + ' 岁';
    var ageLb = $('settle-age-label'); if (ageLb) ageLb.textContent = G.ascended ? '进化用时' : '存活年数';   /* 进化用「进化用时」，未进化用「存活年数」 */

    /* 超生命体特殊展示 */
    var gd = $('settle-god');
    if (G.ascended) { gd.textContent = '✨ 进化完成，蜕变为超生命体 ✨'; gd.hidden = false; }
    else gd.hidden = true;

    $('settle-exp').textContent = '+' + expGain;
    /* 结算页「获得积分」：正常结算显示本局积分，提前结算隐藏该行 */
    var shc = $('settle-skill-chips');
    if (shc) shc.innerHTML = skillChipsHtml(G && G.skillSeq, essenceShortName(G));
    var sgRow = $('settle-guard-row'), sgp = $('settle-guard');
    if (sgRow) sgRow.hidden = reason === 'pause';
    if (sgp) sgp.textContent = reason === 'pause' ? '--' : '+' + guardGainFor(reason, G);
    checkAch();   /* 结算后检测成就（71/81/91/95/99/战力/源质/百万/超生命体/强行进化/进化本源/次数） */

    var es = $('settle-essence');
    if (G.essence && G.essence.length) {
      var names = [];
      for (var i = 0; i < G.essence.length; i++) names.push('『' + G.essence[i].name + '』');
      es.textContent = '基因源质：' + names.join(' ');
      /* 曾尝试炼化源质但战力未达门槛：结算页明示（不暴露具体门槛数值，保持神秘感） */
      if (G.refineFail) {
        es.textContent += G.ascended ? ' —— 炼化失败，改由强行进化' : ' —— 炼化失败（基因不足），转入强行进化，惜败';
        es.className = 'settle-essence warn';
      }
      es.hidden = false;
    } else { es.hidden = true; }

    recordHighlight(reason);   /* 高光记录：仅完整局（death/god）写入近5/top5/进化桶 */
    show('settle');
  }

  /* ---------- 排行榜（本地三榜：战力 / 寿命 / 等级） ---------- */
  var curBoard = 'combat';
  var BILI_BOARDS = { ascend: 1, combat: 2 };
  function openRank() {
    curBoard = 'combat';
    setRankUI();
    show('rank');
    loadRank();
  }
  function makeTab(parent, active, label, cb) {
    var b = document.createElement('button');
    b.className = 'tab' + (active ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', function () { cb(); });
    parent.appendChild(b);
  }
  function setRankUI() {
    var board = $('rank-board'); board.innerHTML = '';
    [['combat', '战力'], ['age', '寿命'], ['lvl', '等级']].forEach(function (p) {
      makeTab(board, curBoard === p[0], p[1], function () { curBoard = p[0]; setRankUI(); loadRank(); blip(500, 0.06, 'triangle', 0.08); });
    });
  }
  function loadRank() { loadLocalRank(); }
  function loadLocalRank() {
    var note = $('rank-note'), body = $('rank-body');
    var b = LOCAL_BOARDS[curBoard];
    var list = loadLocalList(b.key);
    if (!list.length) { note.textContent = '暂无成绩 · 快去玩一局吧'; body.innerHTML = '<div class="lb-tip">暂无成绩</div>'; return; }
    var best = 0, bi = 0, i;
    for (i = 0; i < list.length; i++) if (list[i].score > best) { best = list[i].score; bi = i; }
    note.textContent = '我的最佳：' + fmt(best) + ' · 第 ' + (bi + 1) + ' 名';
    var h = '';
    for (i = 0; i < list.length; i++) {
      var it = list[i], rk = i + 1;
      var cls = 'lb-rank' + (rk <= 3 ? ' top r' + rk : '');
      var scoreTxt = fmt(it.score);
      if (curBoard === 'lvl') scoreTxt = it.score + '级';   /* 等级榜只显示等级 */
      h += '<div class="lb-row' + (i === bi ? ' me' : '') + '"><span class="' + cls + '">' + rk + '</span>' +
        '<span class="lb-user"><span class="lb-name">我的成绩</span></span>' +
        '<span class="lb-time">' + fmtTime(it.ts) + '</span>' +
        '<span class="lb-score">' + scoreTxt + '</span></div>';
    }
    body.innerHTML = h;
  }


  /* ---------- 成就系统（K-V 云同步：任一端达成全端算，与等级无关） ---------- */
  /* ============ 保底积分：结算获得；满 100 下次抽取必定EX 天赋（本地 + 云同步） ============ */
  var KEY_GUARD = 'dm_guard';
  var guard = { pts: 0, ts: 0 };
  /* 单局保底积分 = 低天赋保底 + 等级保底（可叠加）；提前结算 0。
   * 低天赋保底（正常结算，按异能天赋）：1级+5、2级+4、3级+3、4级+2、5级及以上+1；
   * 等级保底（内部取最高）：81级+3、91级+5、95级+8、99级+10、进化+30 */
  function guardGainFor(reason, g) {
    if (reason === 'pause') return 0;
    var innate = g.innate || 10;
    var low = innate <= 1 ? 5 : (innate === 2 ? 4 : (innate === 3 ? 3 : (innate === 4 ? 2 : 1)));
    var tier = g.ascended ? 30 : (g.lvl >= 99 ? 10 : (g.lvl >= 95 ? 8 : (g.lvl >= 91 ? 5 : (g.lvl >= 81 ? 3 : 0))));
    return low + tier;
  }
  function loadGuard() {
    try {
      var o = JSON.parse(localStorage.getItem(KEY_GUARD) || 'null');
      if (o && typeof o === 'object' && typeof o.pts === 'number') {
        guard = { pts: Math.max(0, Math.min(100, Math.floor(o.pts) || 0)), ts: o.ts || 0 };
      }
    } catch (e) {}
  }
  function saveGuard() { try { localStorage.setItem(KEY_GUARD, JSON.stringify(guard)); } catch (e) {} }
  function renderGuardUI() {
    var btn = $('btn-guard'); if (btn) btn.classList.toggle('on', guard.pts >= 100);
    var tip = $('guard-tip');
    if (tip) tip.textContent = guard.pts >= 100 ? '下一次必定觉醒 EX 天赋' : '保底积分 ' + guard.pts + '/100';
    var mp = $('guard-mask-pts'); if (mp) mp.textContent = guard.pts;
  }
  function guardAdd(gain) {
    if (!gain || gain <= 0) return;
    var np = Math.min(100, guard.pts + gain);
    if (np === guard.pts) return;
    guard.pts = np; guard.ts = Date.now();
    saveGuard(); renderGuardUI();
  }
  function guardClear() {   /* 保底触发抽取后清零 */
    guard.pts = 0; guard.ts = Date.now();
    saveGuard(); renderGuardUI();
  }
  function openGuardMask() {
    blip(500, 0.06, 'triangle', 0.08);
    var mp = $('guard-mask-pts'); if (mp) mp.textContent = guard.pts;
    $('guard-mask').hidden = false;
  }
  function closeGuardMask() { $('guard-mask').hidden = true; }

  var KEY_ACH = 'dm_ach';
  var ach = {};            /* 已达成成就 id 集合（内存） */

  function achBonus() {
    var sum = 0, i;
    for (i = 0; i < DATA.ACHIEVEMENTS.length; i++) if (ach[DATA.ACHIEVEMENTS[i].id]) sum += DATA.ACHIEVEMENTS[i].bonus;
    return Math.round(sum * 100) / 100;   /* 归一化：避免 0.30000000000000004 浮点尾差 */
  }
  function loadAchLocal() {
    try { var o = JSON.parse(localStorage.getItem(KEY_ACH) || '{}'); ach = (o && typeof o === 'object') ? o : {}; } catch (e) { ach = {}; }
  }
  function saveAchLocal() { try { localStorage.setItem(KEY_ACH, JSON.stringify(ach)); } catch (e) {} }
  function markAch(id) {
    if (ach[id]) return;
    ach[id] = true; saveAchLocal();
    var nm = id;
    for (var i = 0; i < DATA.ACHIEVEMENTS.length; i++) if (DATA.ACHIEVEMENTS[i].id === id) { nm = DATA.ACHIEVEMENTS[i].name; break; }
    showAchToast(nm);
    applyAch();
  }
  /* 成就达成面包屑提示（顶部滑入，队列依次展示，避免多个重叠） */
  var achToastQueue = [], achToastBusy = false;
  function showAchToast(name) {
    achToastQueue.push(name);
    if (!achToastBusy) achToastNext();
  }
  function achToastNext() {
    if (!achToastQueue.length) { achToastBusy = false; return; }
    achToastBusy = true;
    var name = achToastQueue.shift();
    var el = $('ach-toast');
    if (el) {
      el.textContent = '⭐ 成就达成：' + name;
      el.hidden = false;
      el.classList.remove('show');
      void el.offsetWidth;   /* 强制重排触发动画 */
      el.classList.add('show');
    }
    setTimeout(function () {
      var el2 = $('ach-toast');
      if (el2) { el2.classList.remove('show'); setTimeout(function () { el2.hidden = true; }, 300); }
      achToastBusy = false;
      achToastNext();
    }, 2200);
  }
  /* 成就并集（本地合并用，也供测试） */
  function achMerge(localAch, remoteAch) {
    if (!remoteAch || typeof remoteAch !== 'object') return localAch;
    for (var k in remoteAch) if (remoteAch[k] && !localAch[k]) localAch[k] = true;
    return localAch;
  }
  function applyAch() {
    Sim.setAchBonus(achBonus());
    var tip = $('ach-tip'); if (tip) tip.textContent = '成就加成：' + achBonus() + '%';
    var total = $('ach-total'); if (total) total.textContent = '成就加成：+' + achBonus() + '%';
    renderAchList();
  }
  /* 结算时检测本局可触发的成就 */
  function checkAch() {
    if (!G) return;
    if (G.innate === 10) markAch('innate10');
    if (G.lvl >= 71) markAch('lvl71');
    if (G.lvl >= 81) markAch('lvl81');
    if (G.lvl >= 91) markAch('feng91');
    if (G.lvl >= 95) markAch('lvl95');
    if (G.lvl >= 99) markAch('lvl99');
    if (G.combat >= 100000) markAch('combat100k');
    if (G.combat >= 300000) markAch('combat300k');
    if (G.combat >= 1000000) markAch('million');
    if (G.essence && G.essence.length) markAch('essence');
    if (G.ascended) {
      markAch('god');
      if (G.ascendMode === 'forced') markAch('forced');
      if (G.ascendMode === 'origin') markAch('origin');
    }
    if (G.gotMutation) markAch('mutation');    /* 系统传人：获得神秘系统 */
    if (G.gotTwin) markAch('twin');    /* 双生异能：触发双生异能觉醒 */
    checkAchFromRank();
  }
  /* 进化次数类成就（3/10/30/50/100 次）：优先读进化榜（board1），本地（dm_ascend_total）兜底 */
  function markGodCount(n) {
    if (n >= 3) markAch('god3');
    if (n >= 10) markAch('god10');
    if (n >= 30) markAch('god30');
    if (n >= 50) markAch('god50');
    if (n >= 100) markAch('god100');
  }
  function checkAchFromRank() {
    /* 进化次数成就：按本地累计进化次数点亮（3/10/30/50/100 档） */
    markGodCount(loadAscendTotal());
  }
  function renderAchList() {
    var box = $('ach-list'); if (!box) return;
    box.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < DATA.ACHIEVEMENTS.length; i++) {
      var a = DATA.ACHIEVEMENTS[i], done = !!ach[a.id];
      var d = document.createElement('div');
      d.className = 'ach-item ' + (done ? 'done' : 'todo');
      var nm = document.createElement('span'); nm.className = 'ach-name'; nm.textContent = a.name;
      var b = document.createElement('span'); b.className = 'ach-bonus'; b.textContent = (done ? '✓ 已达成' : '未达成') + ' +' + a.bonus + '%';
      d.appendChild(nm); d.appendChild(b);
      frag.appendChild(d);
    }
    box.appendChild(frag);
  }
  function openAch() {
    blip(500, 0.06, 'triangle', 0.08);
    applyAch();
    show('ach');
  }
  function closeAch() { show('home'); }

  /* ---------- 回顾人生 ---------- */
  function openReview() {
    var box = $('review-log'); box.innerHTML = '';
    var frag = document.createDocumentFragment();
    for (var i = 0; i < fullLog.length; i++) {
      var d = document.createElement('div');
      d.className = 'rv-' + (fullLog[i].cls || 'year');
      d.textContent = fullLog[i].text;
      frag.appendChild(d);
    }
    box.appendChild(frag);
    $('review-mask').hidden = false;
  }
  function closeReview() { $('review-mask').hidden = true; }

  /* ---------- 事件绑定 ---------- */
  function bindEvents() {
    $('btn-start').addEventListener('click', startGame);
    $('btn-rank').addEventListener('click', function () { blip(500, 0.06, 'triangle', 0.08); openRank(); });
    $('btn-close-rank').addEventListener('click', function () { show('home'); });
    $('btn-ach').addEventListener('click', openAch);
    $('btn-close-ach').addEventListener('click', function () { blip(400, 0.06, 'triangle', 0.08); closeAch(); });
    $('btn-guard').addEventListener('click', openGuardMask);
    $('btn-guard-close').addEventListener('click', function () { blip(400, 0.06, 'triangle', 0.08); closeGuardMask(); });
    $('btn-pause').addEventListener('click', function () { blip(400, 0.06, 'triangle', 0.08); pauseGame(); });
    $('btn-pause-resume').addEventListener('click', function () { blip(600, 0.06, 'triangle', 0.08); resumeGame(); });
    $('btn-pause-settle').addEventListener('click', function () { blip(500, 0.08, 'triangle', 0.1); finishGame('pause'); });
    $('btn-pause-exit').addEventListener('click', function () { exitGame(); });
    $('btn-settle-again').addEventListener('click', startGame);
    $('btn-settle-review').addEventListener('click', function () { blip(500, 0.06, 'triangle', 0.08); openReview(); });
    $('btn-review-close').addEventListener('click', function () { blip(400, 0.06, 'triangle', 0.08); closeReview(); });
    $('btn-settle-home').addEventListener('click', function () { show('home'); });
    $('home-sound').addEventListener('change', function () { SOUND = this.checked; saveSound(); syncSoundUI(); });
    $('home-manual').addEventListener('change', function () { MANUAL = this.checked; saveManual(); syncManualUI(); });
    $('log-box').addEventListener('click', function () {
      if (!MANUAL || !G || G.dead || G.ascended || timer) return;
      blip(400, 0.04, 'triangle', 0.06);
      if (pendingLogs.length) {
        /* 手动模式：先弹完上一年的剩余连破日志（整批），本次点击仍修炼一年，
         * 避免点击被 pendingLogs 拦截只弹日志不修炼（天赋档/年龄不变） */
        renderLog(pendingLogs);
        pendingLogs = [];
        renderAttrs();
      }
      tick();   /* 点一下修炼一年 */
    });
    $('speed-range').addEventListener('input', setSpeed);
    $('speed-range').addEventListener('change', setSpeed);
    $('btn-settings').addEventListener('click', function () { blip(500, 0.06, 'triangle', 0.08); openSettings('home'); });
    $('btn-about').addEventListener('click', function () { blip(500, 0.06, 'triangle', 0.08); show('about'); });
    $('btn-close-settings').addEventListener('click', function () { blip(400, 0.06, 'triangle', 0.08); closeSettings(); });
    $('btn-close-about').addEventListener('click', function () { blip(400, 0.06, 'triangle', 0.08); show('home'); });
    $('btn-pause-settings').addEventListener('click', function () { blip(500, 0.06, 'triangle', 0.08); openSettings('pause'); });
    $('btn-highlight').addEventListener('click', function () { blip(500, 0.06, 'triangle', 0.08); openHL(); });
    $('btn-close-highlight').addEventListener('click', function () { blip(400, 0.06, 'triangle', 0.08); show('home'); });
    $('btn-hl-close').addEventListener('click', function () { blip(400, 0.06, 'triangle', 0.08); closeHLReview(); });
    $('btn-hl-copy').addEventListener('click', function () { blip(500, 0.06, 'triangle', 0.08); copyHl(); });
    $('btn-hl-img').addEventListener('click', function () { blip(500, 0.06, 'triangle', 0.08); hlImgExport(); });
    $('btn-hl-img-close').addEventListener('click', function () { blip(400, 0.06, 'triangle', 0.08); hlCloseImg(); });
    $('btn-hl-img-dl').addEventListener('click', function () { blip(500, 0.06, 'triangle', 0.08); hlDownload(hlCurDataUrl); });
    $('hl-img').addEventListener('dblclick', function () { blip(500, 0.06, 'triangle', 0.08); hlDownload(hlCurDataUrl); });
  }

  /* ---------- 启动 ---------- */
  loadSound();
  loadSpeed();
  loadManual();
  loadPlayer();
  /* 高光记录 key 升级（记录结构重构）：清掉旧版 key，老玩家记录从零开始 */
  ['dm_hl_near', 'dm_hl_top', 'dm_hl_god', 'dm_hlv2_near', 'dm_hlv2_top', 'dm_hlv2_god'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
  loadAchLocal();
  loadGuard();
  refreshHome();
  bindEvents();
  syncManualUI();
  show('home');   /* 初始化视图：只显示首页，隐藏其余（否则往下滑会看到所有页面） */
  renderHomeCount();
  try {
    window.addEventListener('resize', function () { fitHomeBtns(); });   /* 旋转/改尺寸时按钮文字自适应 */
  } catch (e) {}

  /* 暴露高光纯函数，供 Node/DOM 测试与调试（生产无副作用） */
  var HLAPI = {
    listAddNear: hlAddNear, listAddTop: hlAddTop, listAddGod: hlAddGod,
    buildClipText: hlClipText,
    badgeCls: hlBadgeCls, resultLabel: hlResultLabel,
    achMerge: achMerge,
    guardGain: guardGainFor,
    highlights: hlHighlights,
    coreText: hlCoreText, coreOf: hlCoreOf, trimKind: hlTrimKind
  };
  try { window.HL = HLAPI; } catch (e) {}
})();

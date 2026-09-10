/* ============================================================
 * 末日模拟器 · 模拟引擎（纯逻辑，浏览器 + Node 通用，UMD）
 * 逐年修炼 · 突破概率表（连破规则）· 随机事件 · 基因源质/强行进化超生命体
 * 异能：ability.js  随机事件：events.js（创作者可扩展）
 * ============================================================ */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports)
    module.exports = factory(require('./data.js'), require('./ability.js'), require('./events.js'));
  else root.Sim = factory(root.DATA, root.ABILITY, root.EVENTS);
})(typeof self !== 'undefined' ? self : this, function (D, W, E) {

  function rand(a, b) { return a + Math.random() * (b - a); }
  function irand(a, b) { return Math.floor(rand(a, b + 1)); }
  function round(x) { return Math.round(x); }

  /* ---------- 抽取异能：先按权重抽异能天赋，再从对应组抽 1 个 ----------
   * 玩家等级 lv 奖励：天赋 5-10 级整体概率 +lv×0.1 个百分点（如 lv1：20%→20.1%），
   * 增量按各级原比例分配，其余等级仍按原比例 */
  /* 成就加成（百分点）：各达成成就 bonus 累加，叠加到高阶异能抽取概率 */
  var _achBonus = 0;
  function setAchBonus(pct) { _achBonus = pct || 0; }

  /* 抽取异能：高阶 = 天赋 6-10。玩家等级 lv 奖励：高阶异能整体概率 +lv×0.1 个百分点 */
  function drawAbility(playerLv, forceInnate10) {
    var lv = Math.max(0, playerLv || 0);
    if (forceInnate10) {   /* 保底触发：必定 EX 天赋（天赋10，在其组内随机异能） */
      var g10 = W.ABILITY_POOL[10];
      return { innate: 10, ability: g10[Math.floor(Math.random() * g10.length)] };
    }
    var base = W.INNATE_WEIGHTS;
    var s15 = 0, s610 = 0, i;
    for (i = 1; i <= 5; i++) s15 += base[i];
    for (i = 6; i <= 10; i++) s610 += base[i];
    var pOld = s610 / (s15 + s610);
    var pNew = pOld + lv * 0.001 + _achBonus / 100;   /* +玩家等级 与 成就增益 */
    var x610 = (s15 * pNew) / (1 - pNew);       /* 高阶（6-10）新权重合计 */
    var w = base.slice();
    for (i = 6; i <= 10; i++) w[i] = base[i] * (x610 / s610);
    var total = 0; for (i = 1; i <= 10; i++) total += w[i];
    /* 保底档：玩家达到 ≥25/≥75 级时，抽到低于保底档的天赋（如 1/2 档）重抽，给玩家减负 */
    var minInnate = (D.guardInfo && D.guardInfo(lv).min) || 1;
    var innate = 1, tries;
    for (tries = 0; tries < 60; tries++) {
      var r2 = Math.random() * total, acc2 = 0, cand = 1;
      for (i = 1; i <= 10; i++) { acc2 += w[i]; if (r2 < acc2) { cand = i; break; } }
      if (cand >= minInnate) { innate = cand; break; }
      innate = cand;   /* 抽到低于保底档：记录后下一轮重抽 */
    }
    if (innate < minInnate) innate = minInnate;   /* 兜底：极端随机也强制至少到保底档 */
    var group = W.ABILITY_POOL[innate];
    return { innate: innate, ability: group[Math.floor(Math.random() * group.length)] };
  }

  /* ---------- 突破概率表：查 data.js 的 BREAK_CHANCE 二维数组（百分比，可 >100%） ----------
   * 段：1-10 / 11-20 / 21-30 / 31-40 / 41-50 / 51-60 / 61-70 / 71-80 / 81-90 / 91-95 / 96-98 / 99 */
  function breakChance(aptitude, lvl) {
    var seg;
    if (lvl >= 99) seg = 11;
    else if (lvl >= 96) seg = 10;
    else if (lvl >= 91) seg = 9;
    else if (lvl >= 81) seg = 8;
    else if (lvl >= 71) seg = 7;
    else if (lvl >= 61) seg = 6;
    else if (lvl >= 51) seg = 5;
    else if (lvl >= 41) seg = 4;
    else if (lvl >= 31) seg = 3;
    else if (lvl >= 21) seg = 2;
    else if (lvl >= 11) seg = 1;
    else seg = 0;
    return D.BREAK_CHANCE[aptitude - 1][seg] / 100;
  }

  /* 某年突破判定：若概率 >30% 允许连破（每次概率 /2，直到 ≤30% 停止）
   * 连破每次重新取「该级所在阶级」的基础概率再递减：
   * 例 天赋10(EX) 从10级起：第一次 90%，成功后按新阶级(10-20级)基础90% 再 /2 → 45%，再 → 22.5%<30% 停 */
  /* 突破年龄系数：6-12岁×1.2；12-18岁×1.1；18~0.9×寿命×1.0；>0.9×寿命×0.95 */
  function breakAgeCoef(g) {
    if (g.age <= 12) return 1.2;
    if (g.age <= 18) return 1.1;
    if (g.age > g.lifespan * 0.9) return 0.95;
    return 1.0;
  }
  /* 觉醒技能：达到 10/20/..90 级触发，按当前战力取 data.js SKILL_TIER 档位
   * （D~S，各自战力区间 + 加成上下限），战力加成后直接突破到下一阶（+1 级） */
  function awakenSkill(g, log) {
    var tier = D.selectSkill(g.combat, g.lvl / 10);   /* 档位表 data.js SKILL_TIER；第 1/2 次觉醒最高 C */
    var peak = g.lvl;
    var add = irand(tier.addLo, tier.addHi);
    g.combat += add;
    if (log) log.push({ cls: 'skill', text: '修为达到' + peak + '级，觉醒' + tier.name + '级技能，战力+' + add });
    if (!g.skillSeq) g.skillSeq = [];
    g.skillSeq.push(tier.name);   /* 记录本局觉醒的技能档级（D/C/B/A/S，UI 展示） */
    var r = levelUp(g);   /* 觉醒技能后直接突破到下一阶 */
    if (log && r) log.push({ cls: 'brk', text: r.text });
  }
  function attemptBreak(g) {
    if (g.lvl >= 99) return 0;
    if (g.lvl % 10 === 0) return 0;   /* 10/20/..90 级：由觉醒技能升级，不走正常突破 */
    var coef = breakAgeCoef(g);
    var th = (g.lvl % 10 === 9) ? 0.5 : 1;   /* 关口（9/19/..89）突破概率暂时性 /2 */
    var base = breakChance(g.aptitude, g.lvl) * coef * th;
    if (base <= 0.25 + 1e-9) {
      /* 基础概率 ≤25%：单次判定，不连破 */
      return Math.random() < base ? 1 : 0;
    }
    /* 基础概率 >25%：连破。每次按「该级所属阶级」的基础概率 ×0.6^(step) 递减（折损40%），≤25% 停 */
    var gained = 0, step = 0;
    while (true) {
      var lvl = g.lvl + gained;
      if (lvl >= 99) break;
      if (lvl % 10 === 0) break;              /* 升到 10/20/..90 级：连破停止，由觉醒技能升级 */
      var b = breakChance(g.aptitude, lvl) * coef * ((lvl % 10 === 9) ? 0.5 : 1);
      if (b <= 0.25 + 1e-9) break;              /* 连破跨入基础 ≤25% 的阶级，停止 */
      var p = b * Math.pow(0.6, step);           /* 第 step 次连破判定（step 从 0 起，折损 40%） */
      if (p <= 0.25 + 1e-9) break;               /* 递减后 ≤25% 停止 */
      if (Math.random() < p) { gained++; step++; }
      else break;
    }
    return gained;
  }

  /* ---------- 突破收益：等级越高、天赋档越高加得越多，且每级随机波动明显（±40%） ---------- */
  function combatGain(aptitude, newLvl) {
    var c = D.COMBAT_COEF[aptitude];
    if (newLvl >= 90 && newLvl <= 98) return round(c * (newLvl * 0.6 + rand(-newLvl * 0.4, newLvl * 0.4) + 20));
    if (newLvl >= 99) return round(c * (newLvl * 1.2 + rand(-200, 200) + 200));
    return round(c * (newLvl * 0.6 + rand(-newLvl * 0.4, newLvl * 0.4) + 6));
  }
  /* 突破后寿命奖励（用户表：55-65+1 65-75+2 75-85+3 85-90+4 90-95+5 95-98+8 98-99+100） */
  function lifespanGain(newLvl) {
    if (newLvl === 99) return 100;
    if (newLvl >= 96 && newLvl <= 98) return 8;
    if (newLvl >= 91 && newLvl <= 95) return 5;
    if (newLvl >= 86 && newLvl <= 90) return 4;
    if (newLvl >= 76 && newLvl <= 85) return 3;
    if (newLvl >= 66 && newLvl <= 75) return 2;
    if (newLvl >= 55 && newLvl <= 65) return 1;
    return 0;
  }

  /* ---------- 随机事件战力增益 helper（按当前战力比例，后期事件才有效果） ----------
   * evCombat(g, minPct, maxPct, floor)：加战力 = 当前战力 × (minPct~maxPct)，保底 floor */
  function evCombat(g, minPct, maxPct, floor) {
    var v = g.combat * rand(minPct, maxPct);
    if (v < (floor || 0)) v = floor || 0;
    return round(v);
  }


  /* 升级方法：升 1 级自动判定战力/寿命增益（combatGain + lifespanGain）；
   * 已满级（99）后不再升等级，改为「等级抵达巅峰后有所领悟，战力 +10000（1级=1w战力）」。
   * 返回 { text, combat, life, peak } */
  function levelUp(g) {
    if (g.lvl >= 99) {
      g.combat += 10000;
      return { text: '等级抵达巅峰后，有所领悟，战力+10000！', combat: 10000, life: 0, peak: true };
    }
    var nl = g.lvl + 1;
    var cg = combatGain(g.aptitude, nl);
    var lg = lifespanGain(nl);
    g.lvl = nl; g.combat += cg; g.lifespan += lg;
    return { text: '等级' + (nl - 1) + '→' + nl + '级，战力+' + cg + (lg ? '，寿命+' + lg : '') + '！', combat: cg, life: lg };
  }

  /* 事件连续升级：每升 1 级单独输出一行（与突破连破一致，日志不省略、不合并）；
   * 机缘升到大境界顶（10/20/..90）时同样触发领悟技能直升（与修炼突破一致，不因走机缘而跳过）；
   * 99 级后每级 +10000 战力单独一行。返回累计 { up, combat, life } */
  function gainLevels(g, n, log) {
    var up = 0, ct = 0, life = 0;
    for (var k = 0; k < n; k++) {
      var r = levelUp(g);
      up++; ct += r.combat; life += r.life;
      if (log) log.push({ cls: 'brk', text: r.text });
      if (g.lvl % 10 === 0 && g.lvl < 99) awakenSkill(g, log);
    }
    return { up: up, combat: ct, life: life };
  }

  /* 事件打印：事件内部直接调用 U.printlog('结果文本') 打印「第X岁，遇到事件名，结果文本」，
   * 让事件自行控制打印与升级的相对顺序（先打印机缘，再升级） */
  var _curEv = null;
  function printlog(text) {
    if (!_curEv) return;
    _curEv.printed = true;
    if (_curEv.log) _curEv.log.push({ cls: 'ev' + _curEv.ev.tier, text: '第' + _curEv.g.age + '岁，遇到' + _curEv.ev.name + '，结果' + text });
  }

  /* 双生异能觉醒：按天赋 7-10 档异能权重（INNATE_WEIGHTS：7=4 / 8=3 / 9=2 / 10=1）抽取，
   * 替换异能/天赋档，返回新异能信息 */
  function drawHighAbility(g) {
    var wsum = 0, i;
    for (i = 7; i <= 10; i++) wsum += W.INNATE_WEIGHTS[i];
    var r = Math.random() * wsum, acc = 0, ni = 7;
    for (i = 7; i <= 10; i++) { acc += W.INNATE_WEIGHTS[i]; if (r < acc) { ni = i; break; } }
    var grp = W.ABILITY_POOL[ni];
    var nw = grp[Math.floor(Math.random() * grp.length)];
    g.ability = nw; g.innate = ni; g.aptitude = ni;
    g.gotTwin = true;   /* 成就：双生异能 */
    return { innate: ni, ability: nw };
  }

  /* 注入给事件文件（events.js）的工具对象，供创作者扩展事件时使用 */
  var U = {
    rand: rand, irand: irand, round: round,
    combatGain: combatGain, lifespanGain: lifespanGain,
    gainLevels: gainLevels, levelUp: levelUp, evCombat: evCombat, breakChance: breakChance,
    drawHighAbility: drawHighAbility,
    printlog: printlog,
    testLv: testLv, testCombat: testCombat,
    DATA: D
  };

  /* testLv/testCombat 模拟中置 true，跳过会递归调用测试的死疫禁区（deadzone） */
  var _testMode = false;

  /* ---------- 抽 1 个随机事件执行 ----------
   * 先按事件年龄上下限（minAge/maxAge，默认 0/10000）过滤可选池，再从池内按 weight 抽取 */
  function rollEvent(g, log) {
    var pool = [], i, mc = g.maxCount || (g.maxCount = {});
    for (i = 0; i < E.length; i++) {
      var evi = E[i];
      if (_testMode && evi.id === 'deadzone') continue;   /* 测试模拟中跳过死决之地（避免 test 递归） */
      var maxN = evi.maxCount != null ? evi.maxCount : 100;
      var left = mc[evi.id] != null ? mc[evi.id] : maxN;
      if (left <= 0) continue;                          /* 次数耗尽，不加入候选池 */
      var minA = evi.minAge != null ? evi.minAge : 0;
      var maxA = evi.maxAge != null ? evi.maxAge : 10000;
      if (g.age >= minA && g.age <= maxA) pool.push(evi);
    }
    if (!pool.length) return;
    var total = 0;
    for (i = 0; i < pool.length; i++) total += (pool[i].weight != null ? pool[i].weight : 1);
    var r = Math.random() * total, acc = 0, ev = pool[0];
    for (i = 0; i < pool.length; i++) { acc += (pool[i].weight != null ? pool[i].weight : 1); if (r < acc) { ev = pool[i]; break; } }
    /* 被抽中：剩余次数 -1 */
    var maxN2 = ev.maxCount != null ? ev.maxCount : 100;
    mc[ev.id] = (mc[ev.id] != null ? mc[ev.id] : maxN2) - 1;
    var text = null;
    var prevCur = _curEv;
    _curEv = { ev: ev, g: g, log: log, printed: false };
    if (!ev.cond || ev.cond(g, U)) {
      if (ev.ok) text = ev.ok(g, U, log);
    } else {
      if (ev.fail) text = ev.fail(g, U, log);
    }
    /* 事件内部用 U.printlog 打印「遇到事件」；未改用 printlog 的旧事件仍可用 return 文本兜底 */
    if (text && !_curEv.printed) printlog(text);
    _curEv = prevCur;   /* 恢复外层 _curEv：cond 里的 testCombat 模拟局会覆盖/清空 _curEv，不恢复则本事件的 printlog 失效 */
  }

  /* ---------- 工具：模拟某天赋档修炼到指定岁数的 top X% 分位数值 ----------
   * testLv(innate, age, n, X) 返回等级；testCombat 返回战力。
   * 模拟 n 次，取排序后第 (100-X)% 分位（X=10 → 前 10% 的数值）。可在事件表中使用。 */
  function testPercentile(innate, age, n, X, key) {
    var vals = [];
    _testMode = true;
    for (var i = 0; i < n; i++) {
      var g = createGame(0);
      g.innate = innate; g.aptitude = innate;
      var g0 = 0;
      while (!g.dead && !g.ascended && g.age < age && g0 < 10000) { g0++; rollYear(g); }
      vals.push(g[key]);
    }
    _testMode = false;
    vals.sort(function (a, b) { return a - b; });
    var p = 1 - X / 100;
    var idx = Math.min(vals.length - 1, Math.max(0, Math.floor(vals.length * p)));
    return vals[idx];
  }
  function testLv(innate, age, n, X) { return testPercentile(innate, age, n, X, 'lvl'); }
  function testCombat(innate, age, n, X) { return testPercentile(innate, age, n, X, 'combat'); }

  /* ---------- 强行进化成功率：看战力，越高越容易，范围 1/10000 ~ 1/100，平均约 1/1000 ----------
   * 强行进化与寿命无关（不扣寿命），仅由战力决定单次成功率 */
  /* 强行进化成功率：看战力，越高越容易，范围 1/10000 ~ 1/100（战力最高也只有 1/100）
   * 强行进化与寿命无关（不扣寿命），仅由战力决定单次成功率；强行进化失败即陨落。
   * 用户规则 2026-09-02（技能加战力后上调传承、强行进化）：<10w=1/10000；10w=1/1000；
   * 40w=1%；40w→75w 线性 1%→10%（749999≈10%）；≥75w 必过（强行进化成功率随战力放开） */
  function forcedChance(combat) {
    if (combat >= 750000) return 1.0;               /* 75w+ 战力强行进化必过 */
    if (combat < 100000) return 1e-4;               /* <10w：1/10000 */
    if (combat < 400000) {                          /* 10w→40w：1/1000 → 1% 线性 */
      var t = (combat - 100000) / 300000;
      return 1e-3 + t * (0.01 - 1e-3);
    }
    var t2 = (combat - 400000) / 350000;            /* 40w→75w：1% → 10% 线性 */
    return 0.01 + t2 * (0.10 - 0.01);
  }

  /* 超生命体战力 = (100w 进化奖励 + 原基础战力) × 战力增幅倍率 rate；
   * rate 为基因源质的战力增幅倍率；无源质（强行进化/进化本源）rate 恒为 1 */
  function godCombat(combat, rate) {
    if (rate == null) rate = 1;
    return round((1000000 + combat) * rate);
  }

  /* ---------- 超生命体判定（99 级且剩余寿命≤10 年时尝试） ----------
   * 有源质先炼化（战力达标成功晋升为超生命体，享受源质 rate 战力倍率；失败则再尝试强行进化）。
   * 强行进化不享受源质 rate，统一随机 1.15~1.45 倍加持；强行进化失败即陨落死亡（无宽限、无反复尝试）。 */
  /* 炼化失败时的战力增幅：战力 × 源质倍率 × 达标比例 × 0.1 */
  function refineBoost(combat, rate, needCombat) {
    return round(combat * rate * (combat / needCombat) * 0.1);
  }
  function tryAscend(g, log) {
    var es = g.essence.length > 0 ? g.essence[0] : null;   /* 基因源质最多 1 种 */
    var rate = es ? es.rate : 1;                       /* 炼化成功才用源质 rate */
    if (es) {
      if (g.combat >= es.needCombat) {
        g.ascendMode = 'refine';
        log.push({ cls: 'god', text: '第' + g.age + '岁，寿命将尽，成功炼化基因源质，晋升为超生命体！' });
        g.ascended = true; g.lvl = 100;
        g.combat = godCombat(g.combat, rate); g.lifespan = 99999;
        return true;
      }
      g.refineFail = true;   /* 结算页据此提示「炼化失败」；不暴露具体门槛数值 */
      /* 炼化失败：仍以战力×源质倍率×达标比例×0.1 增幅基因（例：36w 战力对 40w 门槛、rate1.69 → +54756） */
      var essenceBoost = refineBoost(g.combat, es.rate, es.needCombat);
      g.combat += essenceBoost;
      log.push({ cls: 'ev3', text: '第' + g.age + '岁，炼化失败，但基因有所提升，战力+' + essenceBoost });
    }
    if (Math.random() < forcedChance(g.combat)) {
      g.ascendMode = 'forced';
      log.push({ cls: 'god', text: '第' + g.age + '岁，寿命将尽，强行进化，成为超生命体！' });
      g.ascended = true; g.lvl = 100;
      var dRate = D.FORCED_BONUS_MIN + Math.random() * (D.FORCED_BONUS_MAX - D.FORCED_BONUS_MIN);   /* 强行进化：随机 1.15~1.45 */
      g.combat = godCombat(g.combat, dRate); g.lifespan = 99999;
      return true;
    }
    g.dead = true;
    g.ascendMode = 'fail';
    log.push({ cls: 'dead', text: '第' + g.age + '岁，强行进化失败，崩解陨落' });
    return true;
  }

  /* 初始战力：觉醒基础（天赋档×1~10）+ 从1级修炼到天赋档级逐级突破累计战力，
   * 使「天赋N档开局=已修炼至N级」战力与等级匹配（天赋10≈1900，而非 10~100） */
  function initialCombat(innate) {
    var c = irand(innate, innate * 10);
    for (var L = 2; L <= innate; L++) c += combatGain(innate, L);   /* 突破到第 L 级的战力 */
    return c;
  }

  /* ---------- 初始化一局 ---------- */
  function createGame(playerLv, opts) {
    var w = drawAbility(playerLv, !!(opts && opts.force10));   /* 保底积分满 100 → 必定 EX 天赋 */
    return {
      innate: w.innate,        /* 天赋档 1-10（F→EX）：固定，不增加 */
      aptitude: w.innate,      /* 天赋档数值：初始 = 天赋档，可被机缘事件提升，上限 10 */
      ability: w.ability,
      lvl: w.innate,            /* 初始等级 = 天赋档（天赋 N 档开局即 N 级） */
      combat: initialCombat(w.innate),
      lifespan: irand(D.LIFE_MIN + w.innate, D.LIFE_MAX + w.innate),   /* 天赋 N → 寿命 (70+N)~(110+N) */
      age: 6,
      year: 0,
      essence: [],
      maxCount: {},   /* 各事件本局剩余触发次数（maxCount 上限，每次被抽中 -1，耗尽后不再出现） */
      skillSeq: [],    /* 本局领悟的技能档级序列（D/C/B/A/S） */
      ascended: false,
      dead: false
    };
  }

  /* ---------- 过一年，返回今年日志条目 ----------
   * 每年固定一条「第X岁，修炼」；突破则替换该行；事件/奇遇/超生命体进化/死亡单独成行 */
  function rollYear(g) {
    var log = [];
    g.year++;
    g.age++;
    log.push({ cls: 'year', text: '第' + g.age + '岁，修炼' });

    /* 特殊事件：进化本源（亿分之一）无视条件直接进化为超生命体 */
    if (Math.random() < D.ORIGIN_CHANCE) {
      log.push({ cls: 'rainbow', text: '第' + g.age + '岁，获得进化本源，直接进化为超生命体！' });
      g.ascendMode = 'origin';
      g.ascended = true; g.lvl = 100;
      g.combat = godCombat(g.combat, D.ORIGIN_BONUS);
      g.lifespan = 99999;
      return log;
    }
    /* 特殊事件：基因突变（千万分之一）天赋提升到满 + 寿命+50 */
    if (Math.random() < D.XIJING_CHANCE) {
      g.aptitude = 10;
      g.lifespan += 50;
      g.gotMutation = true;   /* 成就：基因突变 */
      log.push({ cls: 'red', text: '第' + g.age + '岁，基因突变！天赋跃升至极阶 EX，寿命+50' });
    }

    /* 达到 90 级后每年概率获得基因源质：最多获得 1 种，获得后不再获得第二种；
     * 获得源质时战力同步增加 rand(5000, 该源质 needCombat×5%)，并升 rand(1,3) 级（不超过 99 级）；
     * 达到 99 级后获得概率 ×1.25 */
    if (g.lvl >= 90 && g.essence.length < 1 && Math.random() < (g.lvl >= 99 ? D.ESSENCE_CHANCE * 1.25 : D.ESSENCE_CHANCE)) {
      var got = D.ESSENCE[Math.floor(Math.random() * D.ESSENCE.length)];
      g.essence.push(got);
      var essenceGain = irand(5000, Math.round(got.needCombat * 0.05));
      g.combat += essenceGain;
      log.push({ cls: 'red', text: '第' + g.age + '岁，获得基因源质『' + got.name + '』，战力+' + essenceGain });
      var ups = Math.min(irand(1, 3), 99 - g.lvl);
      for (var upi = 0; upi < ups; upi++) {
        var ur = levelUp(g);
        if (ur && ur.text) log.push({ cls: 'brk', text: ur.text });
      }
    }

    /* 修炼突破：第一级「成功突破！」头行，每升 1 级输出升级行，跨级前补「连破！」头行；
     * 未突破年份随机提升战力（U.evCombat 0.05%~0.1%，保底 1~5）；
     * 关口（9/19/..89）突破概率已 /2；达到 10/20/..90 级（大境界顶）后领悟技能升下一阶 */
    if (g.lvl < 99) {
      var gained = attemptBreak(g);
      if (gained > 0) {
        log[0] = { cls: 'brk', text: '第' + g.age + '岁，修炼，成功突破！' };
        for (var k = 0; k < gained; k++) {
          var r = levelUp(g);
          log.push({ cls: 'brk', text: r.text });
          if (k + 1 < gained && g.lvl < 99) log.push({ cls: 'brk', text: '第' + g.age + '岁，修炼，连破！' });
          if (g.lvl >= 99) break;
        }
      } else if (g.lvl % 10 !== 0) {
        /* 未突破且不在大境界顶：普通修炼战力微增（10/20/..90 由领悟技能处理） */
        var gcv = evCombat(g, 0.0005, 0.001, irand(1, 5));
        g.combat += gcv;
        log[0] = { cls: 'year', text: '第' + g.age + '岁，修炼，战力+' + gcv };
      }
      /* 达到 10/20/..90（大境界顶，含初始/突破后）：领悟技能，直接突破到下一阶（+1级） */
      if (g.lvl % 10 === 0 && g.lvl < 99) awakenSkill(g, log);
    }

    /* 99 级 每年修炼连击：100%→50%→25%→25%… 每中一次 +99，
     * 任一次判定失败即停止，只累加并展示最终总战力 */
    if (g.lvl >= 99 && !g.ascended && (g.lifespan - g.age) > 10) {
      var limGain = 0, limStep = 0;
      while (true) {
        var lp = limStep === 0 ? 1 : (limStep === 1 ? 0.5 : 0.25);
        if (Math.random() < lp) { limGain += 99; limStep++; }
        else break;
        if (limStep >= 500) break;   /* 极端兜底防死循环 */
      }
      g.combat += limGain;
      log[0] = { cls: 'year', text: '第' + g.age + '岁，修炼，战力+' + limGain };
    }

    /* 99 级 剩余寿命 <=10 年时尝试进化为超生命体；强行进化失败即崩解陨落 */
    if (g.lvl >= 99 && !g.ascended && (g.lifespan - g.age) <= 10) {
      if (tryAscend(g, log)) return log;
    }

    /* 寿命判定放在突破/进化之后：先结算突破（突破会加寿命），寿命将尽那年仍可突破/进化 */
    if (g.age > g.lifespan) {
      g.dead = true;
      log.push({ cls: 'dead', text: '第' + g.age + '岁，寿命耗尽，与世长辞' });
      return log;
    }

    /* 普通随机事件 */
    if (!g.ascended && Math.random() < D.EVENT_CHANCE) rollEvent(g, log);

    if (g.age > g.lifespan) {
      g.dead = true;
      log.push({ cls: 'dead', text: '第' + g.age + '岁，寿命将尽时遭遇变故，不幸暴毙' });
    }
    return log;
  }

  return {
    drawAbility: drawAbility,
    setAchBonus: setAchBonus,
    breakChance: breakChance,
    attemptBreak: attemptBreak,
    combatGain: combatGain,
    lifespanGain: lifespanGain,
    forcedChance: forcedChance,
    refineBoost: refineBoost,
    godCombat: godCombat,
    gainLevels: gainLevels,
    testLv: testLv, testCombat: testCombat,
    initialCombat: initialCombat,
    createGame: createGame,
    rollYear: rollYear,
    tryAscend: tryAscend,
    EVENTS: E
  };
});

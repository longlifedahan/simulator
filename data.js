/* ============================================================
 * 末日模拟器 · 数据文件（纯数据，逻辑在 sim.js）
 * 异能见 ability.js · 随机事件见 events.js · 基因源质 · 常量
 * ============================================================ */
(function (root) {
  /* 天赋档系数：下标 = 异能天赋档。档位越高每级加战力越多 */
  var COMBAT_COEF = [0, 1.0, 1.5, 2.2, 3.2, 4.5, 6.3, 8.8, 12, 16, 22];

  /* 突破概率表（百分比，可 >100%：如 120% 表示一年可突破概率 >1）
   * 行 = 异能天赋 1-10；列 = 等级段：1-10 / 11-20 / 21-30 / 31-40 / 41-50 / 51-60 / 61-70 / 71-80 / 81-90 / 91-95 / 96-98 / 99 */
  var BREAK_CHANCE = [
    [20, 10, 5, 2, 1, 1, 1, 1, 1, 1, 1, 1],   /* 天赋1(F) */
    [40, 20, 10, 5, 2, 1, 1, 1, 1, 1, 1, 1],  /* 天赋2(E) */
    [60, 40, 20, 10, 5, 2, 1, 1, 1, 1, 1, 1], /* 天赋3(D) */
    [80, 60, 40, 20, 10, 5, 2, 1, 1, 1, 1, 1],/* 天赋4(C) */
    [100, 80, 60, 40, 20, 10, 5, 2, 1, 1, 1, 1],/* 天赋5(B) */
    [120, 100, 80, 60, 40, 20, 10, 5, 2, 1, 1, 1],/* 天赋6(A) */
    [150, 120, 100, 80, 60, 40, 20, 10, 5, 1.5, 1, 1],/* 天赋7(S) */
    [200, 160, 133, 113, 80, 53, 27, 13, 6.5, 2, 1.25, 1],/* 天赋8(SS) */
    [250, 180, 166, 136, 100, 66, 34, 16, 8, 3.5, 2.25, 1.25],/* 天赋9(SSS) */
    [300, 240, 200, 160, 120, 80, 40, 22, 14, 7, 2.5, 1.75] /* 天赋10(EX) */
  ];

  /* 基因源质（10 种）：达到 90 级后每年按 ESSENCE_CHANCE 获得，最多 1 种
   * 战力需求设到约 P95（≈28w-45w），让约 5% 有源质玩家炼化达标；不达标可强行进化。
   * rate 战力增幅倍率：炼化晋升战力 = (100w 进化奖励 + 原基础战力) × rate；
   * 无源质（强行进化/进化本源）rate 恒为 1 */
  var ESSENCE = [
    { id: 'essence1',   name: '基因源质·赤情之心', needCombat: 350000, rate: 1.24 },
    { id: 'essence2',  name: '基因源质·锋锐之金',   needCombat: 360000, rate: 1.33 },
    { id: 'essence3',  name: '基因源质·生机之木', needCombat: 370000, rate: 1.42 },
    { id: 'essence4',   name: '基因源质·无垠之渊',   needCombat: 380000, rate: 1.51 },
    { id: 'essence5',  name: '基因源质·不灭之焰',   needCombat: 390000, rate: 1.6 },
    { id: 'essence6',  name: '基因源质·厚土之核', needCombat: 400000, rate: 1.69 },
    { id: 'essence7',   name: '基因源质·双生之涡', needCombat: 410000, rate: 1.78 },
    { id: 'essence8',   name: '基因源质·星渊之枢', needCombat: 420000, rate: 1.87 },
    { id: 'essence9',  name: '基因源质·命轮之弦', needCombat: 435000, rate: 1.96 },
    { id: 'essence10',   name: '基因源质·太初之光', needCombat: 450000, rate: 2.05 }
  ];

  /* 技能档位：每 10 级（10/20/..90级）觉醒一个技能，按当前战力觉醒对应档级技能。
   * 字段说明：name = 技能档级（D/C/B/A/S）；combatLo-combatHi = 该档战力区间（闭区间）；
   * addLo-addHi = 觉醒该档技能的战力加成区间（含两端，随机整数）；minRing = 该档至少第几次觉醒才解锁
   * （第 1/2 次觉醒最高 C 级：B=第3次起、A=第4次起、S=第5次起，未填视为 1）。
   * ⚠ 请按战力从小到大排列且各档区间连续（上一档 combatHi+1 = 下一档 combatLo） */
  var SKILL_TIER = [
    { name: 'D',   combatLo: 0,        combatHi: 299,       addLo: 10,     addHi: 20 },
    { name: 'C',   combatLo: 300,      combatHi: 2499,      addLo: 30,    addHi: 60 },
    { name: 'B',   combatLo: 2500,     combatHi: 9999,      addLo: 100,   addHi: 300,   minRing: 3 },
    { name: 'A',   combatLo: 10000,    combatHi: 72499,     addLo: 500,   addHi: 1500,  minRing: 4 },
    { name: 'S',   combatLo: 72500,    combatHi: Infinity,  addLo: 3000,  addHi: 10000,  minRing: 5 }
  ];

  /* 按战力选技能档位：ring = 第几次觉醒（1 起，缺省不限制觉醒序）。依次取满足「战力 ≤ combatHi
   * 且 觉醒序 ≥ minRing」的最高档；若战力已超过当前可解锁档的上限，则取可解锁的最高档 */
  function selectSkill(combat, ring) {
    var i, best = null;
    for (i = 0; i < SKILL_TIER.length; i++) {
      var t = SKILL_TIER[i];
      if (ring != null && (t.minRing || 1) > ring) continue;   /* 觉醒序未达解锁条件，跳过 */
      if (combat <= t.combatHi) return t;
      best = t;   /* 记录当前可解锁最高档，供战力超上限时兜底 */
    }
    return best || SKILL_TIER[SKILL_TIER.length - 1];
  }

  /* 异能者等级称号：1-100 每 10 级一阶（一阶…十阶），如 92→十阶异能者；100=十阶异能者（超生命体） */
  var CN_ORD = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  function titleOf(lvl) {
    lvl = Math.max(1, Math.min(100, Math.floor(lvl) || 1));
    var jie = Math.min(10, Math.ceil(lvl / 10));
    return CN_ORD[jie] + '阶异能者';
  }
  /* 异能天赋档 1-10 → F/E/D/C/B/A/S/SS/SSS/EX（UI 展示用） */
  var TIER_NAME = ['', 'F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'EX'];
  function tierName(n) {
    n = Math.max(1, Math.min(10, Math.floor(n) || 1));
    return TIER_NAME[n];
  }

  /* 成就系统（19 个）：达成后按 bonus 累加高阶异能（天赋6-10）抽取概率。
   * id 唯一标识（原有 id 保留，K-V 状态不丢）；name 成就名；bonus 高阶异能加成（百分点）。
   * 判定依赖 game.js：innate10 抽异能时 / 等级·战力·源质·进化·强行进化·进化本源·基因突变 结算时 /
   * god3·god10·god30·god50·god100 读进化排行榜（含本地兜底） */
  var ACHIEVEMENTS = [
    { id: 'innate10', name: 'EX 天赋',    bonus: 0.1 },
    { id: 'twin',   name: '双生异能',   bonus: 0.1 },
    { id: 'lvl71', name: '达到71级',  bonus: 0.1 },
    { id: 'lvl81',   name: '达到81级',  bonus: 0.1 },
    { id: 'feng91',   name: '达到91级',  bonus: 0.1 },
    { id: 'lvl95',   name: '达到95级',  bonus: 0.1 },
    { id: 'lvl99',    name: '达到99级',  bonus: 0.2 },
    { id: 'combat100k',   name: '十万战力',   bonus: 0.1 },
    { id: 'combat300k', name: '三十万战力', bonus: 0.2 },
    { id: 'million',  name: '百万战力',   bonus: 0.3 },
    { id: 'essence',    name: '基因源质',   bonus: 0.1 },
    { id: 'god',      name: '成就超生命体', bonus: 0.2 },
    { id: 'forced',    name: '超生命体',   bonus: 0.3 },
    { id: 'god3',     name: '三次进化',   bonus: 0.3 },
    { id: 'god10',    name: '十次进化',   bonus: 0.4 },
    { id: 'god30',    name: '三十次进化', bonus: 0.5 },
    { id: 'god50',    name: '五十次进化', bonus: 0.8 },
    { id: 'god100',   name: '百次进化',   bonus: 1 },
    { id: 'mutation',   name: '基因突变',   bonus: 1 },
    { id: 'origin', name: '进化本源',   bonus: 1.5 }
  ];

  /* 抽异能保底档：玩家达到某等级后，抽到低于该档的异能天赋会重抽（给玩家减负）。
   * 1级=默认无保底（可能出天赋 F）；2级（≥25级）起不出天赋 F；3级（≥75级）起不出天赋 F/E */
  var GUARD = [
    { lv: 25, min: 2, label: '2级（≥25级）' },
    { lv: 75, min: 3, label: '3级（≥75级）' }
  ];
  function guardInfo(lv) {
    var min = 1, label = '1级（默认）', i;
    for (i = 0; i < GUARD.length; i++) {
      if ((lv || 0) >= GUARD[i].lv) { min = GUARD[i].min; label = GUARD[i].label; }
    }
    return { min: min, label: label };
  }

  /* ---------- 常量 ---------- */
  var DATA = {
    COMBAT_COEF: COMBAT_COEF,
    BREAK_CHANCE: BREAK_CHANCE,
    ESSENCE: ESSENCE,
    SKILL_TIER: SKILL_TIER,
    ACHIEVEMENTS: ACHIEVEMENTS,
    titleOf: titleOf,
    tierName: tierName,
    TIER_NAME: TIER_NAME,
    selectSkill: selectSkill,
    GUARD: GUARD,
    guardInfo: guardInfo,
    /* 初始寿命：以异能天赋 X 计，实际寿命区间 = (LIFE_MIN+X, LIFE_MAX+X)，默认 70+X ~ 110+X */
    LIFE_MIN: 70, LIFE_MAX: 110,
    /* 事件：整体每年触发概率（用户要求 20%，具体事件按 tier 权重分配） */
    EVENT_CHANCE: 0.20,
    /* 基因源质：达到 90 级后每年概率（校准：有源质玩家炼化晋升率≈5%、综合晋升率≈1%）
     * 到99级玩家中约两成获得过 1 种源质；源质最多 1 种 */
    ESSENCE_CHANCE: 0.0012,
    /* 强行进化成功率（无源质 / 战力不足时） */
    FORCED_CHANCE: 1 / 1000,
    /* 强行进化超生命体战力倍率（无源质时）：随机 1.15~1.45 倍加持（基因源质才享受 rate） */
    FORCED_BONUS_MIN: 1.15,
    FORCED_BONUS_MAX: 1.45,
    /* 特殊事件概率 */
    XIJING_CHANCE: 1e-7,     /* 基因突变：千万分之一（天赋满级 + 寿命+50） */
    ORIGIN_CHANCE: 1e-8,   /* 进化本源：亿分之一 */
    ORIGIN_BONUS: 2,       /* 进化本源·超生命体战力倍率：2 倍 */
    /* 玩家等级经验：升到第 n 级需 50×n 经验（累计 = 25×n×(n+1)） */
    PLAYER_LV_BASE: 50,
    /* 进化直接获得经验 / 普通结算 = 等级×0.5 / 提前结算 = 等级×0.1 */
    ASCEND_EXP: 1000,
    EXP_PER_LVL: 0.5,
    EXP_PER_LVL_EARLY: 0.1
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  root.DATA = DATA;
})(typeof self !== 'undefined' ? self : this);

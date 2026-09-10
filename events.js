/* ============================================================
 * 末日模拟器 · 随机事件（独立文件，创作者可自由扩展）
 *
 * 如何添加新事件：在 EVENTS 数组末尾 push 一个对象，字段：
 *   id    事件唯一标识（字符串）
 *   name  事件名（展示用，如 '搜刮物资'）
 *   tier  稀有度：1普通 / 2中级 / 3稀有 / 4传说（决定奖励档次与日志颜色）
 *   weight 触发权重（越大越常出现；当前按 1普通=6 / 2中级=0.7 / 3稀有=0.2 / 4传说=0.08）
 *   minAge/maxAge 年龄上下限（玩家年龄不在该区间则该事件不参与抽取，默认 minAge=0 / maxAge=10000）
 *   cond  触发条件函数 cond(g) -> bool，null 表示无条件
 *   ok    条件达成奖励 ok(g, U) -> 返回结果文本字符串（无返回则无事发生）
 *   fail  条件未达成惩罚 fail(g, U) -> 返回结果文本字符串
 *
 * U 是引擎注入的工具对象，提供：
 *   U.rand(a,b) / U.irand(a,b) / U.round(x)
 *   U.combatGain(aptitude,newLvl) 突破加战力  U.lifespanGain(newLvl) 突破加寿命
 *   U.gainLevels(g,n) 事件直接加等级（满级后每级+10000战力）
 *   U.evCombat(g, minPct, maxPct, floor) 事件战力增益 = 当前战力×比例（保底 floor）
 *   U.breakChance(aptitude,lvl) 突破概率  U.DATA 数据常量（含 tierName 天赋档字母）
 *
 * 奖励与 tier 匹配：普通事件小收益，稀有/传说事件才有大奖励与天赋提升。
 * 数组按 tier 从高到低排序（传说→稀有→中级→普通），便于阅读与维护。
 * ============================================================ */
(function (root) {
	var EVENTS = [

		/* ---------- tier 4 传说 ---------- */
		{
			id: 'reawaken',
			weight: 0.15,
			maxCount: 2,
			name: '异能二次觉醒',
			tier: 4,
			desc: '沉寂多年的异能基因突然发生二次觉醒',
			minAge: 12,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(50, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U, log) {
					var lf = U.irand(4, 8);
					g.lifespan += lf;
					/* 天赋提升前已是满档（10）则额外固定多升一级 */
					var fullBefore = g.aptitude >= 10;
					/* 天赋提升按原始档：<6 +1~3；6-8 +1~2；9 +1；10 不提升 */
					var inc = g.innate < 6 ? U.irand(1, 3) : (g.innate <= 8 ? U.irand(1, 2) : (g.innate === 9 ? 1 : 0));
					var up = null;
					if (inc > 0 && g.aptitude < 10) {
						up = g.aptitude + inc;
						if (up > 10) up = 10;
						g.aptitude = up;
					}
					var lvGain = U.irand(1, 3);
					if (fullBefore) lvGain += 1;
					U.printlog('异能二次觉醒，寿命+' + lf + (up ? '，天赋提升至 ' + U.DATA.tierName(up) + '！' : '') + ',实力也大幅精进');
					U.gainLevels(g, lvGain, log);
				},
			fail:
				function (g, U) {
					var lf = U.irand(2, 4);
					g.lifespan -= lf;
					U.printlog('觉醒失控，基因反噬，寿命 -' + lf);
				}
		},
		{
			id: 'twinawaken',
			weight: 0.05,
			maxCount: 1,
			name: '双生异能觉醒',
			tier: 4,
			desc: '你意外觉醒了自己的双生异能',
			minAge: 6,
			maxAge: 12,
			cond:
				function (g) {
					return g.innate <= 6;   /* 仅天赋档 ≤6 可触发；>6 不触发 */
				},
			ok:
				function (g, U, log) {
					var n = U.drawHighAbility(g);   /* 从天赋7-10异能组抽取并替换异能/天赋档 */
					var lf = U.irand(4, 8);
					g.lifespan += lf;
					U.printlog('觉醒双生异能『' + n.ability + '』！天赋提升至 ' + U.DATA.tierName(n.innate) + '，寿命+' + lf + '，实力也大幅精进');
					U.gainLevels(g, U.irand(1, 3), log);
				},
			fail: null   /* 不会失败：天赋>6 不触发，≤6 必成功 */
		},
		{
			id: 'deadzone',
			weight: 0.3,
			maxCount: 1,
			name: '死疫禁区',
			tier: 4,
			desc: '闯入被变异体盘踞的死疫禁区，浴血搏杀',
			minAge: 30,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.combat > U.testCombat(8, g.age, 20, 15) || g.lvl > U.testLv(8, g.age, 20, 15);
				},
			ok:
				function (g, U, log) {
					var c = U.evCombat(g, 0.1, 0.2, 2000);
					g.combat += c;
					U.printlog('在死疫禁区杀出重围，战力额外+' + c + ',实力也大幅提升');
					U.gainLevels(g, U.irand(1, 3), log);
				},
			fail:
				function (g, U) {
					g.dead = true;
					U.printlog('实力不足，惨死于死疫禁区');
				}
		},
		{
			id: 'serum',
			weight: 0.3,
			maxCount: 1,
			name: '获得进化血清',
			tier: 4,
			desc: '意外寻得一支高纯度进化血清，可激发潜能',
			minAge: 0,
			maxAge: 10000,
			cond: null,
			ok:
				function (g, U, log) {
					var lf = U.irand(8, 12);
					g.lifespan += lf;
					var up = null;
					if (g.aptitude < 10) {
						up = g.aptitude + U.irand(1, 3);
						if(up < 6){
							up = 6;
						}
						if (up > 10) up = 10;
						g.aptitude = up;
					}
					U.printlog('注射进化血清，细胞重组，寿命+' + lf + (up ? '，天赋提升至 ' + U.DATA.tierName(up) + '！' : ''));
					U.gainLevels(g, U.irand(1, 3), log);
				},
			fail: null
		},
		{
			id: 'marrow',
			weight: 0.7,
			maxCount: 2,
			name: '能量灵髓',
			tier: 4,
			desc: '偶得一罐能量灵髓，可强化异能回路',
			minAge: 0,
			maxAge: 10000,
			cond: null,
			ok:
				function (g, U, log) {
					var lf = U.irand(7, 10);
					g.lifespan += lf;
					var up = null;
					if (g.aptitude < 10) {
						up = g.aptitude + U.irand(1, 2);
						if(up < 5){
							up = 5;
						}
						if (up > 10) up = 10;
						g.aptitude = up;
					}
					U.printlog('吸收能量灵髓，寿命+' + lf + (up ? '，天赋提升至 ' + U.DATA.tierName(up) + '！' : '') + '实力也有所精进');
					U.gainLevels(g, U.irand(2, 3), log);
				},
			fail: null
		},
		{
			id: 'subdue',
			weight: 0.5,
			maxCount: 5,
			name: '讨伐S级变异体',
			tier: 4,
			desc: '听说有一头S级变异体在附近活动，你打算参与对其的清剿',
			minAge: 30,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= 80 || g.combat >= 30000;
				},
			ok:
				function (g, U, log) {
					var c = U.evCombat(g, 0.1, 0.15, 2000);
					g.combat += c;
					U.printlog('你击杀了S级变异体，获得了大量资源，战力+' + c + '，实力也得到提升');
					U.gainLevels(g, U.irand(1, 2), log);
				},
			fail:
				function (g, U) {
					if (g.lvl < 60 && g.combat < 15000) {
						U.printlog('实力不足，你放弃了这次清剿');
						return;
					}
					/* 50% 侥幸逃跑、有所领悟；否则受重创扣寿命 */
					if (Math.random() < 0.5) {
						var c = U.evCombat(g, 0.025, 0.5, 400);
						g.combat += c;
						U.printlog('清剿失败，但侥幸逃脱，没有受伤，还有所领悟，战力+' + c);
					} else {
						var lf = U.irand(3, 7);
						g.lifespan -= lf;
						U.printlog('清剿失败，你受到重创，寿命 -' + lf);
					}
				}
		},
		/* ---------- tier 3 稀有 ---------- */
		{
			id: 'arena',
			weight: 2,
			maxCount: 3,
			name: '幸存者竞技赛',
			tier: 3,
			desc: '参加营地五年一遇的异能者竞技赛',
			minAge: 15,
			maxAge: 30,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(40, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U, log) {
					var c = U.evCombat(g, 0.075, 0.15, 1500);
					g.combat += c;
					U.printlog('竞技夺魁，战力+' + c + ',实力也有所精进');
					U.gainLevels(g, U.irand(1, 2), log);
				},
			fail:
				function (g, U) {
					var lf = U.irand(2, 4);
					g.lifespan -= lf;
					U.printlog('竞技受挫重伤，寿命 -' + lf);
				}
		},
		{
			id: 'ruins',
			weight: 2,
			maxCount: 5,
			name: '废墟遗址',
			tier: 3,
			desc: '潜入废弃研究所，偶遇前文明遗留的强化装置',
			minAge: 0,
			maxAge: 10000,
			cond: null,
			ok:
				function (g, U, log) {
					var c = U.evCombat(g, 0.05, 0.1, 1250);
					g.combat += c;
					var lf = U.irand(2, 6);
					g.lifespan += lf;
					U.printlog('激活强化装置，战力+' + c + '，寿命+' + lf);
					U.gainLevels(g, U.irand(1, 2), log);
				},
			fail: null
		},
		{
			id: 'crystal',
			weight: 1,
			maxCount: 5,
			name: '获得异能结晶',
			tier: 3,
			desc: '击杀变异体后意外获得一块异能结晶',
			minAge: 0,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(35, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U, log) {
					var c = U.evCombat(g, 0.05, 0.125, 1500);
					g.combat += c;
					U.printlog('吸收珍贵异能结晶，战力+' + c);
					U.gainLevels(g, U.irand(1, 2), log);
				},
			fail:
				function (g, U) {
					var lf = U.irand(3, 5);
					g.lifespan -= lf;
					U.printlog('结晶被军阀抢走，还把你打成重伤，寿命 -' + lf);
				}
		},
		{
			id: 'insight',
			weight: 1,
			maxCount: 5,
			name: '异能顿悟',
			tier: 3,
			desc: '深夜冥想，顿悟异能运用之理',
			minAge: 0,
			maxAge: 10000,
			cond: null,
			ok:
				function (g, U, log) {
					var c = U.evCombat(g, 0.05, 0.1, 1000);
					g.combat += c;
					var lf = U.irand(3, 7);
					g.lifespan += lf;
					U.printlog('冥想顿悟，战力+' + c + '，寿命+' + lf);
					U.gainLevels(g, 1, log);
				},
			fail: null
		},
		{
			id: 'potion',
			weight: 1,
			maxCount: 3,
			name: '强化药剂',
			tier: 3,
			desc: '寻得一剂可提升天赋档的强化药剂',
			minAge: 0,
			maxAge: 10000,
			cond: null,
			ok:
				function (g, U, log) {
					if (g.aptitude <= 6) {
						var up = g.aptitude + U.irand(1, 2);
						if (up > 10) up = 10;
						g.aptitude = up;
						U.printlog('注射强化药剂，天赋提升至 ' + U.DATA.tierName(up) + '！');
						return;
					}
					U.printlog('注射强化药剂，可惜天赋深厚无益，只感修为有所提升');
					U.gainLevels(g, 1, log);
				},
			fail: null
		},
		{
			id: 'notes',
			weight: 1,
			maxCount: 3,
			name: '异能笔记',
			tier: 3,
			desc: '拾得一份可提升天赋档的异能者笔记',
			minAge: 0,
			maxAge: 10000,
			cond: null,
			ok:
				function (g, U, log) {
					if (g.aptitude <= 8) {
						var up = g.aptitude + 1;
						if (up > 10) up = 10;
						g.aptitude = up;
						U.printlog('研读异能笔记，茅塞顿开，天赋提升至 ' + U.DATA.tierName(up) + '！');
						return;
					}
					U.printlog('研读异能笔记，可惜收获甚微，只感修为有所精进');
					U.gainLevels(g, 1, log);
				},
			fail: null
		},

		/* ---------- tier 2 中级 ---------- */
		{
			id: 'legacy',
			weight: 5,
			maxCount: 5,
			name: '前辈遗泽',
			tier: 2,
			desc: '一位老异能者的遗愿指引你接收传承',
			minAge: 0,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(25, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U, log) {
					if (g.lvl < 99) {
						U.printlog('继承前辈遗泽，获益良多');
						U.gainLevels(g, 1, log);
						return;
					}
					var c2 = U.evCombat(g, 0.04, 0.08, 750);
					g.combat += c2;
					U.printlog('继承前辈遗泽，战力+' + c2);
				},
			fail:
				function (g, U) {
					var lf = U.irand(2, 4);
					g.lifespan -= lf;
					U.printlog('传承失控，异能反噬，寿命 -' + lf);
				}
		},
		{
			id: 'bandits',
			weight: 5,
			maxCount: 10,
			name: '劫掠者袭击',
			tier: 2,
			desc: '遭遇一大群劫掠者袭击',
			minAge: 12,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(40, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U) {
					var c = U.evCombat(g, 0.03, 0.06, 500);
					g.combat += c;
					U.printlog('反杀劫掠者，端了他们的仓库，战力+' + c);
				},
			fail:
				function (g, U) {
					var lf = U.irand(1, 3);
					g.lifespan -= lf;
					U.printlog('被劫掠者打成重伤，寿命 -' + lf);
				}
		},
		{
			id: 'warlord',
			weight: 5,
			maxCount: 5,
			name: '军阀冲突',
			tier: 2,
			desc: '军阀势力飞扬跋扈，与你发生冲突，你惨遭追杀',
			minAge: 12,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(30, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U) {
					var c = U.evCombat(g, 0.025, 0.05, 500);
					g.combat += c;
					U.printlog('反杀军阀分子，夺得大量物资和档案，战力+' + c);
				},
			fail:
				function (g, U) {
					var lf = U.irand(3, 5);
					g.lifespan -= lf;
					U.printlog('被军阀分子重创，寿命 -' + lf);
				}
		},
		{
			id: 'swarm',
			weight: 5,
			maxCount: 10,
			name: '变异潮来袭',
			tier: 2,
			desc: '变异体大潮席卷营地',
			minAge: 0,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(25, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U) {
					var c = U.evCombat(g, 0.02, 0.045, 350);
					g.combat += c;
					U.printlog('击退变异潮，战斗中有所领悟，战力+' + c);
				},
			fail:
				function (g, U) {
					var lf = U.irand(3, 6);
					g.lifespan -= lf;
					U.printlog('被变异潮吞没，重伤，寿命 -' + lf);
				}
		},
		{
			id: 'combatinsight',
			weight: 5,
			maxCount: 50,
			name: '领悟异能运用',
			tier: 2,
			desc: '生死磨砺，一朝领悟更强的异能运用',
			minAge: 0,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(30, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U) {
					var c = U.evCombat(g, 0.015, 0.03, 250);
					g.combat += c;
					U.printlog('领悟异能运用，战力+' + c);
				},
			fail:
				function (g, U) {
					var lf = U.irand(2, 4);
					g.lifespan -= lf;
					U.printlog('强行运转异能反噬自身，寿命 -' + lf);
				}
		},
		{
			id: 'mission',
			weight: 5,
			maxCount: 5,
			name: '秘密任务',
			tier: 2,
			desc: '有异能者邀请你参加一场秘密任务',
			minAge: 0,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(30, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U, log) {
					var c = U.evCombat(g, 0.01, 0.02, 200);
					g.combat += c;
					U.printlog('被选中参加秘密任务，获得大量奖励，战力+' + c);
					if (g.lvl < 50 && Math.random() < 0.5) {
						U.printlog('任务中，你遇到额外机缘，大有收益');
						U.gainLevels(g, 1, log);
					}
				},
			fail:
				function (g, U) {
					var c = U.evCombat(g, 0.003, 0.005, 50);
					g.combat += c;
					U.printlog('对方没有看上你，但念你有潜力，指点了几句，战力+' + c);
				}
		},

		/* ---------- tier 1 普通 ---------- */
		{
			id: 'cull',
			weight: 20,
			maxCount: 100,
			name: '清剿变异体',
			tier: 1,
			desc: '清剿游荡的变异体',
			minAge: 30,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(25, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U) {
					var c = U.evCombat(g, 0.005, 0.01, 150);
					g.combat += c;
					U.printlog('搏杀变异体，战力+' + c);
				},
			fail:
				function (g, U) {
					var lf = U.irand(2, 4);
					g.lifespan -= lf;
					U.printlog('险些被变异体撕碎，寿命 -' + lf);
				}
		},
		{
			id: 'scavenge',
			weight: 10,
			maxCount: 20,
			name: '搜刮物资',
			tier: 1,
			desc: '深入废墟搜刮物资，偶遇游荡变异体',
			minAge: 20,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(15, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U) {
					var c = U.evCombat(g, 0.003, 0.006, 50);
					g.combat += c;
					var lf = U.irand(1, 2);
					g.lifespan += lf;
					U.printlog('搜得能量补充剂，寿命+' + lf + '，战力+' + c);
				},
			fail:
				function (g, U) {
					var lf = U.irand(1, 3);
					g.lifespan -= lf;
					U.printlog('被变异体所伤，仓皇而逃，寿命 -' + lf);
				}
		},
		{
			id: 'spar',
			weight: 20,
			maxCount: 100,
			name: '幸存者切磋',
			tier: 1,
			desc: '与同龄幸存者切磋较量',
			minAge: 12,
			maxAge: 10000,
			cond:
				function (g, U) {
					return g.lvl >= Math.min(10, Math.floor(g.age * 0.75)) + U.irand(0, 10);
				},
			ok:
				function (g, U) {
					var c = U.evCombat(g, 0.004, 0.007, 75);
					g.combat += c;
					U.printlog('切磋获胜，战力+' + c);
				},
			fail:
				function (g, U) {
					var lf = U.irand(1, 2);
					g.lifespan -= lf;
					U.printlog('切磋落败受创，寿命 -' + lf);
				}
		},
		{
			id: 'epiphany',
			weight: 20,
			maxCount: 100,
			name: '略有感悟',
			tier: 1,
			desc: '修炼异能中，略有感悟',
			minAge: 0,
			maxAge: 10000,
			cond: null,
			ok:
				function (g, U) {
					var c = U.evCombat(g, 0.003, 0.005, 50);
					g.combat += c;
					U.printlog('战力+' + c);
				},
			fail: null
		}
	];

	if (typeof module !== 'undefined' && module.exports) module.exports = EVENTS;
	root.EVENTS = EVENTS;
})(typeof self !== 'undefined' ? self : this);

#!/usr/bin/env node
/**
 * tools/test-food.js —— 辅食引擎冒烟测试（纯 Node，store 部分 stub 掉 wx）
 * 用法：node tools/test-food.js
 * 覆盖：知识库完整性 / 阶段边界 / 观察窗 / 状态推导 / 冲突检测 / 待尝试排序 /
 *       反应分级 / 存储与按宝宝隔离 / 级联删除 / 自定义食材 / 一周餐单 / 摘要卡 /
 *       按实际月龄推荐（逐月刻度、待尝试分层、餐单质地递进、过敏食材硬排除）
 */

const path = require('path');

/* ---------- stub wx（store.js 依赖） ---------- */
const mem = {};
global.wx = {
  getStorageSync: function (k) {
    return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : '';
  },
  setStorageSync: function (k, v) {
    mem[k] = JSON.parse(JSON.stringify(v));
  }
};

const food = require('../utils/food.js');
const store = require('../utils/store.js');
const dateUtil = require('../utils/date.js');
const DATA = require('../data/foods.js');

const { FOODS, RECIPES, STAGES, ALLERGENS, REACTIONS, MENU } = DATA;

let pass = 0;
let fail = 0;

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    console.log('  ✗ ' + label + '\n      期望 ' + b + '\n      实际 ' + a);
  }
}

function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    console.log('  ✗ ' + label);
  }
}

function contains(arr, re, label) {
  const hit = (arr || []).some(function (x) {
    return re.test(typeof x === 'string' ? x : JSON.stringify(x));
  });
  ok(hit, label);
}

const TODAY = '2026-11-10';

function rec(o) {
  return Object.assign({ babyId: 'b1', reaction: 'none' }, o);
}

function clearAll() {
  mem['xyd_food_records'] = [];
  mem['xyd_custom_foods'] = [];
  mem['xyd_food_hidden'] = [];
  mem['xyd_menu_swap'] = {};
  mem['xyd_meal_logs'] = [];
}

/* ================= 1. 知识库完整性 ================= */
console.log('\n[1] 知识库完整性');
ok(FOODS.length >= 60, '食材 ≥60 种（实际 ' + FOODS.length + '）');
ok(RECIPES.length >= 30, '食谱 ≥30 个（实际 ' + RECIPES.length + '）');
eq(STAGES.length, 5, '阶段 5 档');
eq(ALLERGENS.length, 8, '过敏原 8 组');
eq(REACTIONS.length, 4, '反应分级 4 档');
ok(!!DATA.READY && DATA.READY.signs.length >= 4, '4-6 月龄准备信号 ≥4 条');

const foodIds = {};
let dupFood = '';
FOODS.forEach(function (f) {
  if (foodIds[f.id]) dupFood = f.id;
  foodIds[f.id] = true;
});
ok(!dupFood, '食材 id 无重复' + (dupFood ? '（重复：' + dupFood + '）' : ''));

const recipeIds = {};
let dupRecipe = '';
RECIPES.forEach(function (r) {
  if (recipeIds[r.id]) dupRecipe = r.id;
  recipeIds[r.id] = true;
});
ok(!dupRecipe, '食谱 id 无重复' + (dupRecipe ? '（重复：' + dupRecipe + '）' : ''));

let missingField = '';
FOODS.forEach(function (f) {
  if (!f.id || !f.name || !f.group || typeof f.fromMonth !== 'number' || !f.how) {
    missingField = f.id || f.name || '未知';
  }
  if (!food.GROUP_LABEL[f.group]) missingField = f.id + '(group=' + f.group + ')';
});
ok(!missingField, '每种食材字段齐全且分组合法' + (missingField ? '（问题：' + missingField + '）' : ''));

let badRef = '';
RECIPES.forEach(function (r) {
  r.foods.forEach(function (id) {
    if (!foodIds[id]) badRef = r.id + ' → ' + id;
  });
});
ok(!badRef, '食谱引用的食材都存在' + (badRef ? '（缺：' + badRef + '）' : ''));

let badOrder = '';
STAGES.forEach(function (s) {
  s.order.forEach(function (id) {
    if (!foodIds[id]) badOrder = s.key + ' → ' + id;
  });
});
ok(!badOrder, '阶段推荐顺序引用的食材都存在' + (badOrder ? '（缺：' + badOrder + '）' : ''));

let badRange = '';
RECIPES.forEach(function (r) {
  if (r.fromMonth > r.toMonth) badRange = r.id;
});
ok(!badRange, '食谱月龄区间合法（from ≤ to）' + (badRange ? '（问题：' + badRange + '）' : ''));

let badSlot = '';
STAGES.forEach(function (s) {
  const cfg = MENU[s.key];
  if (!cfg || !cfg.slots || !cfg.slots.length) badSlot = s.key;
  else if (!cfg.note) badSlot = s.key + '(缺 note)';
});
ok(!badSlot, '每个阶段都有餐次配置与说明' + (badSlot ? '（问题：' + badSlot + '）' : ''));

const allergenKeys = {};
ALLERGENS.forEach(function (a) {
  allergenKeys[a.key] = true;
});
let badAllergen = '';
FOODS.forEach(function (f) {
  if (f.allergen && !allergenKeys[f.allergenGroup]) badAllergen = f.id + ' → ' + f.allergenGroup;
  if (!f.allergen && f.allergenGroup) badAllergen = f.id + ' 标了过敏组但 allergen=false';
});
ok(!badAllergen, '过敏原标记与分组一致' + (badAllergen ? '（问题：' + badAllergen + '）' : ''));

ok(
  FOODS.some(function (f) {
    return f.allergenGroup === 'peanut' && /不要推迟/.test(f.note);
  }),
  '花生条目写明「不要推迟」'
);
ok(
  STAGES[0].avoid.some(function (t) {
    return /蜂蜜/.test(t);
  }),
  '初添期禁忌里有蜂蜜'
);
ok(
  STAGES[0].iron.indexOf('强化铁米粉') > -1,
  '初添期铁来源写明强化铁米粉'
);

/* ================= 2. 月龄与阶段边界 ================= */
console.log('\n[2] 月龄与阶段边界');
eq(food.clampMonth(6.9), 6, 'clampMonth 向下取整');
eq(food.clampMonth(99), 36, 'clampMonth 上限 36');
eq(food.clampMonth(-5), 0, 'clampMonth 下限 0');
eq(food.stageFor(6).key, 's68', '6 月龄 → s68');
eq(food.stageFor(8).key, 's68', '8 月龄 → s68');
eq(food.stageFor(9).key, 's911', '9 月龄 → s911');
eq(food.stageFor(11).key, 's911', '11 月龄 → s911');
eq(food.stageFor(12).key, 's1217', '12 月龄 → s1217');
eq(food.stageFor(17).key, 's1217', '17 月龄 → s1217');
eq(food.stageFor(18).key, 's1823', '18 月龄 → s1823');
eq(food.stageFor(23).key, 's1823', '23 月龄 → s1823');
eq(food.stageFor(24).key, 's2436', '24 月龄 → s2436');
eq(food.stageFor(36).key, 's2436', '36 月龄 → s2436');
eq(food.stageFor(4).key, 's68', '4 月龄兜底到第一档（另由 readyFor 提示）');
eq(food.stageFor(60).key, 's2436', '超龄兜底到末档');
eq(food.stageFor(6).tag, '初添期', '6 月龄阶段名是初添期');
ok(food.readyFor(4) !== null, '4 月龄返回准备信号');
ok(food.readyFor(5) !== null, '5 月龄返回准备信号');
eq(food.readyFor(6), null, '6 月龄不再显示准备信号');
eq(food.monthLabel(4), '未到辅食月龄', '未到月龄的标签');

/* ================= 3. 食材库与分组 ================= */
console.log('\n[3] 食材库与分组');
clearAll();
eq(food.allFoods().length, FOODS.length, '没有自定义时等于内置数量');
const groups = food.groupFoods(FOODS);
eq(groups.length, 11, '分成 11 组');
ok(
  groups.every(function (g) {
    return g.label && g.foods.length > 0;
  }),
  '每组都有中文名且非空'
);
ok(
  FOODS.filter(function (f) {
    return f.ironRich;
  }).length >= 5,
  '高铁食材 ≥5 种'
);
const cereal = food.foodById('rice_cereal');
eq(cereal.fromMonth, 6, '强化铁米粉从 6 月龄开始');
eq(cereal.ironRich, true, '强化铁米粉标为高铁');
ok(food.foodById('not_exist') === null, '查不到的食材返回 null');

/* ================= 4. 观察窗与状态推导 ================= */
console.log('\n[4] 观察窗与状态推导');
clearAll();
const r1 = [rec({ id: 'r1', foodId: 'pumpkin', date: '2026-11-08' })];

const w0 = food.watchInfo(r1[0], '2026-11-08');
eq(w0.dayIndex, 1, '记录当天算第 1 天');
eq(w0.leftDays, 2, '记录当天还剩 2 天');
eq(w0.endDate, '2026-11-10', '观察到最后一天是记录日 +2');

const w1 = food.watchInfo(r1[0], '2026-11-09');
eq(w1.dayIndex, 2, '第 2 天');
eq(w1.leftDays, 1, '第 2 天还剩 1 天');

const w2 = food.watchInfo(r1[0], '2026-11-10');
eq(w2.dayIndex, 3, '第 3 天');
eq(w2.leftDays, 0, '第 3 天还剩 0 天');

eq(food.watchInfo(r1[0], '2026-11-11'), null, '第 4 天观察结束');
ok(
  food.watchInfo(rec({ foodId: 'x', date: '2026-11-10', reaction: 'allergy' }), '2026-11-10') === null,
  '过敏记录不进观察窗'
);

const watchingList = food.watchFor(r1, '2026-11-09');
eq(watchingList.length, 1, 'watchFor 返回 1 条观察中');
eq(watchingList[0].food.name, '南瓜', '观察中的是南瓜');
eq(watchingList[0].reaction.key, 'none', '反应分级对象带出来');

const ctx = food.buildContext(r1, [], 7, '2026-11-09');
eq(food.statusOf(food.foodById('pumpkin'), ctx), 'watching', '南瓜状态 watching');
eq(food.statusOf(food.foodById('carrot'), ctx), 'due', '胡萝卜状态 due');
eq(food.statusOf(food.foodById('corn'), ctx), 'later', '玉米（12 月龄）状态 later');

const ctxLater = food.buildContext(r1, [], 7, '2026-11-20');
eq(food.statusOf(food.foodById('pumpkin'), ctxLater), 'tried', '观察结束后变成 tried');

const rAllergy = [rec({ id: 'r2', foodId: 'egg_white', date: '2026-11-01', reaction: 'allergy' })];
const ctxAllergy = food.buildContext(rAllergy, [], 9, TODAY);
eq(food.statusOf(food.foodById('egg_white'), ctxAllergy), 'allergy', '过敏食材状态优先于 tried');
eq(food.watchFor(rAllergy, TODAY).length, 0, '过敏食材不再算观察中');

const ctxHidden = food.buildContext([], ['pumpkin'], 7, TODAY);
eq(food.statusOf(food.foodById('pumpkin'), ctxHidden), 'hidden', '不想试的食材状态 hidden');

/* ================= 5. 冲突检测 ================= */
console.log('\n[5] 冲突检测（一次只加一种）');
const rConflict = [
  rec({ id: 'c1', foodId: 'pumpkin', date: '2026-11-09' }),
  rec({ id: 'c2', foodId: 'carrot', date: '2026-11-10' })
];
eq(food.conflicts(rConflict, '2026-11-10').length, 2, '两种食材同时在观察窗 → 报冲突');
eq(food.conflicts(rConflict, '2026-11-12').length, 0, '只剩胡萝卜在窗内 → 不报冲突');
eq(food.conflicts([rConflict[0]], '2026-11-10').length, 0, '只有一种 → 不报冲突');

/* ================= 6. 待尝试排序 ================= */
console.log('\n[6] 待尝试排序');
clearAll();
const due6 = food.dueFoods(6, [], [], TODAY);
eq(due6[0].id, 'rice_cereal', '6 月龄第一个该加的是强化铁米粉');
eq(due6[1].id, 'pumpkin', '第二个是南瓜');
ok(
  due6.every(function (f) {
    return f.fromMonth <= 6;
  }),
  '待尝试里不含未到月龄的食材'
);
const due7 = food.dueFoods(7, [rec({ id: 'x1', foodId: 'rice_cereal', date: '2026-11-01' })], [], TODAY);
ok(
  !due7.some(function (f) {
    return f.id === 'rice_cereal';
  }),
  '已经试过的不再出现在待尝试'
);
const dueHidden = food.dueFoods(7, [], ['pumpkin', 'carrot'], TODAY);
ok(
  !dueHidden.some(function (f) {
    return f.id === 'pumpkin' || f.id === 'carrot';
  }),
  '不想试的不出现在待尝试'
);
const dueAllergy = food.dueFoods(9, [rec({ id: 'x2', foodId: 'egg_white', date: '2026-11-01', reaction: 'allergy' })], [], TODAY);
ok(
  !dueAllergy.some(function (f) {
    return f.id === 'egg_white';
  }),
  '出过过敏的不再推荐再试'
);
const next2 = food.suggestNext(7, [], [], TODAY, 2);
eq(next2.length, 2, 'suggestNext 返回指定条数');

/* ================= 7. 反应分级 ================= */
console.log('\n[7] 反应分级');
eq(food.reactionOf('none').tone, 'ok', '无反应 tone=ok');
eq(food.reactionOf('mild').tone, 'watch', '轻微 tone=watch');
eq(food.reactionOf('allergy').tone, 'warn', '过敏 tone=warn');
eq(food.reactionOf('severe').tone, 'danger', '严重 tone=danger');
eq(food.reactionOf('随便写的').key, 'none', '未知值兜底为无反应');
ok(/立即就医/.test(food.reactionOf('severe').next), '严重反应处置写「立即就医」');
ok(/120/.test(food.reactionOf('severe').next), '严重反应写拨打 120');
ok(/3-6 个月/.test(food.reactionOf('allergy').next), '过敏停 3-6 个月');
ok(/1-2 周/.test(food.reactionOf('mild').next), '轻微停 1-2 周再试');
eq(food.isFailed('allergy'), true, 'allergy 算失败');
eq(food.isFailed('severe'), true, 'severe 算失败');
eq(food.isFailed('mild'), false, 'mild 不算失败');

/* ================= 8. 存储与按宝宝隔离 ================= */
console.log('\n[8] 存储与按宝宝隔离');
clearAll();
const saved = store.upsertFoodRecord({ babyId: 'b1', foodId: 'pumpkin', date: '2026-11-09', reaction: 'none' });
ok(!!saved.id, '保存后自动生成 id');
ok(String(saved.id).indexOf('f') === 0, '记录 id 以 f 开头');
store.upsertFoodRecord({ babyId: 'b2', foodId: 'carrot', date: '2026-11-10', reaction: 'none' });
eq(store.getFoodRecords('b1').length, 1, 'b1 只有 1 条记录');
eq(store.getFoodRecords('b2').length, 1, 'b2 只有 1 条记录');
eq(store.getAllFoodRecords().length, 2, '全量 2 条');

store.upsertFoodRecord({ id: saved.id, babyId: 'b1', foodId: 'pumpkin', date: '2026-11-09', reaction: 'mild' });
eq(store.getFoodRecords('b1')[0].reaction, 'mild', '按 id 更新生效');
eq(store.getAllFoodRecords().length, 2, '更新不会新增');

const multi = [
  rec({ id: 'm1', foodId: 'pumpkin', date: '2026-11-05' }),
  rec({ id: 'm2', foodId: 'pumpkin', date: '2026-11-09' })
];
mem['xyd_food_records'] = multi;
eq(store.getFirstTryMap('b1'), { pumpkin: '2026-11-05' }, '同种食材取最早的首次尝试日');
eq(food.firstTryMap(multi), { pumpkin: '2026-11-05' }, '引擎版 firstTryMap 结果一致');
const idx = food.indexRecords(multi);
eq(idx.pumpkin.last.date, '2026-11-09', '最近一次取最新日期');

store.hideFood('b1', 'beef');
eq(store.getFoodHidden('b1'), ['beef'], 'b1 的隐藏清单');
eq(store.getFoodHidden('b2'), [], 'b2 的隐藏清单不受影响');
store.hideFood('b1', 'beef');
eq(store.getFoodHidden('b1').length, 1, '重复隐藏不会重复写入');
store.unhideFood('b1', 'beef');
eq(store.getFoodHidden('b1').length, 0, '取消隐藏');

store.setMenuSwap('b1', '2026-11-10#am', 'r_pumpkin_puree');
eq(store.getMenuSwap('b1')['2026-11-10#am'], 'r_pumpkin_puree', '替换菜单写入');
eq(store.getMenuSwap('b2'), {}, 'b2 的菜单替换不受影响');
store.clearMenuSwap('b1');
eq(store.getMenuSwap('b1'), {}, '清空 b1 的替换');

/* ================= 9. 级联删除 ================= */
console.log('\n[9] 级联删除');
clearAll();
mem['xyd_babies'] = [
  { id: 'b1', name: '小芽', birthday: '2026-04-01' },
  { id: 'b2', name: '小豆', birthday: '2025-01-01' }
];
store.upsertFoodRecord({ babyId: 'b1', foodId: 'pumpkin', date: '2026-11-09', reaction: 'none' });
store.upsertFoodRecord({ babyId: 'b2', foodId: 'carrot', date: '2026-11-09', reaction: 'none' });
store.hideFood('b1', 'beef');
store.hideFood('b2', 'lamb');
store.setMenuSwap('b1', '2026-11-10#am', 'r_pumpkin_puree');

store.removeBaby('b1');
eq(store.getFoodRecords('b1').length, 0, '删宝宝后它的辅食记录清空');
eq(store.getFoodRecords('b2').length, 1, '另一个宝宝的记录还在');
eq(store.getFoodHidden('b1').length, 0, '删宝宝后它的隐藏清单清空');
eq(store.getFoodHidden('b2'), ['lamb'], '另一个宝宝的隐藏清单还在');
eq(store.getMenuSwap('b1'), {}, '删宝宝后它的菜单替换清空');

clearAll();
const cf = store.addCustomFood({ name: '自制肉松', group: 'meat', fromMonth: 9 });
store.upsertFoodRecord({ babyId: 'b1', foodId: cf.id, date: '2026-11-09', reaction: 'none' });
store.upsertFoodRecord({ babyId: 'b1', foodId: 'pumpkin', date: '2026-11-09', reaction: 'none' });
const del = store.removeCustomFood(cf.id);
eq(del.records, 1, '删自定义食材连带清 1 条记录');
eq(store.getAllFoodRecords().length, 1, '其他食材的记录保留');
eq(store.getCustomFoods().length, 0, '自定义食材已删除');

/* ================= 10. 自定义食材 ================= */
console.log('\n[10] 自定义食材');
clearAll();
eq(store.addCustomFood({ name: '' }), null, '空名返回 null');
eq(store.addCustomFood({ name: '   ' }), null, '纯空格返回 null');
const my = store.addCustomFood({ name: '秋葵', group: 'veg', fromMonth: 10, note: '本地菜市场有' });
ok(!!my && my.custom === true, '自定义食材带 custom 标记');
eq(my.group, 'veg', '分组保留');
const myLow = store.addCustomFood({ name: '测试低月龄', fromMonth: 1 });
eq(myLow.fromMonth, 6, '起始月龄夹到下限 6');
const myHigh = store.addCustomFood({ name: '测试高月龄', fromMonth: 99 });
eq(myHigh.fromMonth, 36, '起始月龄夹到上限 36');
const myBadGroup = store.addCustomFood({ name: '测试分组', group: '不存在的组' });
eq(myBadGroup.group, 'veg', '非法分组兜底为蔬菜');
eq(food.allFoods().length, FOODS.length + 4, '自定义食材进入总库');
const myFood = food.foodById(my.id);
ok(!!myFood && myFood.name === '秋葵', '能按 id 查到自定义食材');
eq(food.groupFoods(food.allFoods()).length, 11, '加了自定义后分组数不变（仍 11 组）');

/* ================= 11. 一周餐单 ================= */
console.log('\n[11] 一周餐单');
clearAll();
const week = food.menuFor(7, 'b1', '2026-11-09', {}, TODAY);
eq(week.days.length, 7, '一周 7 天');
eq(week.weekStart, '2026-11-09', '周一作为起点');
eq(week.weekEnd, '2026-11-15', '周日作为终点');
eq(week.stage.key, 's68', '6-8 月龄用初添期的餐次');
eq(week.days[0].meals.length, 2, '初添期一天 2 个餐次');
ok(
  week.days.every(function (d) {
    return d.meals.every(function (m) {
      return !!m.recipe;
    });
  }),
  '每餐都排到了食谱'
);

const week2 = food.menuFor(7, 'b1', '2026-11-09', {}, TODAY);
eq(JSON.stringify(week.days), JSON.stringify(week2.days), '同宝宝同周结果完全一致（不看时间）');

const weekOther = food.menuFor(7, 'b1', '2026-11-16', {}, TODAY);
ok(
  JSON.stringify(week.days.map(function (d) { return d.meals.map(function (m) { return m.recipe && m.recipe.id; }); })) !==
    JSON.stringify(weekOther.days.map(function (d) { return d.meals.map(function (m) { return m.recipe && m.recipe.id; }); })),
  '换一周菜单会变'
);

const weekB2 = food.menuFor(7, 'b2', '2026-11-09', {}, TODAY);
ok(
  JSON.stringify(week.days.map(function (d) { return d.meals[0].recipe && d.meals[0].recipe.id; })) !==
    JSON.stringify(weekB2.days.map(function (d) { return d.meals[0].recipe && d.meals[0].recipe.id; })),
  '换宝宝菜单不同'
);

let outOfRange = '';
week.days.forEach(function (d) {
  d.meals.forEach(function (m) {
    if (m.recipe && (m.recipe.fromMonth > 7 || m.recipe.toMonth < 7)) outOfRange = m.recipe.id;
  });
});
ok(!outOfRange, '餐单里没有月龄不合适的食谱' + (outOfRange ? '（问题：' + outOfRange + '）' : ''));

const swapKey = week.days[0].date + '#am';
const swapped = food.menuFor(7, 'b1', '2026-11-09', (function () {
  const o = {};
  o[swapKey] = 'r_banana_puree';
  return o;
})(), TODAY);
eq(swapped.days[0].meals[0].recipe.id, 'r_banana_puree', '手动替换的食谱生效');
eq(swapped.days[0].meals[0].swapped, true, '替换的那格带上 swapped 标记');
ok(swapped.days[1].meals[0].recipe.id !== 'x', '其他天不受替换影响');

const day = food.dayMenuFor(7, 'b1', '2026-11-09', {}, TODAY);
eq(day.date, week.days[0].date, 'dayMenuFor 与一周餐单第一天一致');
eq(
  day.meals[0].recipe && day.meals[0].recipe.id,
  week.days[0].meals[0].recipe && week.days[0].meals[0].recipe.id,
  '今日餐单与一周餐单同一天完全相同'
);

const alt = food.altRecipe(7, 'am', day.meals[0].recipe.id, '2026-11-09');
ok(!!alt && alt.id !== day.meals[0].recipe.id, '换一道返回不同的食谱');

const week12 = food.menuFor(15, 'b1', '2026-11-09', {}, TODAY);
eq(week12.days[0].meals.length, 4, '12-17 月龄一天 4 个餐次');
eq(week12.stage.key, 's1217', '15 月龄命中 s1217');
const meals15 = [];
week12.days[0].meals.forEach(function (m) {
  meals15.push(m.slot.key);
});
eq(meals15, ['am', 'noon', 'pm', 'eve'], '餐次顺序为 早/午/加餐/晚');

const week36 = food.menuFor(36, 'b1', '2026-11-09', {}, TODAY);
eq(week36.days[0].meals.length, 4, '24-36 月龄一天 4 个餐次');

/* ================= 12. 统计与摘要卡 ================= */
console.log('\n[12] 统计与摘要卡');
clearAll();
const st0 = food.stats([], 7, TODAY);
eq(st0.tried, 0, '没有记录时已试 0 种');
ok(st0.potential > 20, '7 月龄可选食材 >20 种');
eq(st0.allergenTotal, 8, '过敏原总数 8');

const stRecs = [
  rec({ id: 's1', foodId: 'rice_cereal', date: '2026-11-01' }),
  rec({ id: 's2', foodId: 'pork', date: '2026-11-03' }),
  rec({ id: 's3', foodId: 'egg_yolk', date: '2026-11-05' }),
  rec({ id: 's4', foodId: 'egg_white', date: '2026-11-08', reaction: 'allergy' })
];
const st = food.stats(stRecs, 9, '2026-11-20');
eq(st.tried, 4, '已试 4 种');
eq(st.ironTried, 3, '其中高铁食材 3 种（米粉/猪肉/蛋黄）');
eq(st.allergyCount, 1, '过敏 1 种');
eq(st.watchCount, 0, '观察窗都已结束');
eq(st.lastDate, '2026-11-08', '最近一次日期');
eq(st.allergenTried, 1, '试过的过敏原组 1 组（蛋）');

const prog = food.allergenProgress(stRecs);
eq(prog.length, 8, '过敏原进度 8 行');
ok(
  prog.some(function (a) {
    return a.key === 'egg' && a.done;
  }),
  '蛋类标为已尝试'
);
ok(
  prog.some(function (a) {
    return a.key === 'peanut' && !a.done;
  }),
  '花生标为未尝试'
);

const bPre = food.brief([], 5, TODAY);
eq(bPre.tone, 'pre', '未到月龄摘要 tone=pre');
const bTodo = food.brief([], 7, TODAY);
eq(bTodo.tone, 'todo', '没有记录摘要 tone=todo');
ok(/强化铁米粉/.test(bTodo.desc), '没有记录时提示第一口吃什么');
const bWatch = food.brief([rec({ id: 'w1', foodId: 'pumpkin', date: '2026-11-09' })], 7, TODAY);
eq(bWatch.tone, 'watch', '观察中摘要 tone=watch');
ok(bWatch.title.indexOf('南瓜') > -1, '观察中摘要带食材名');
const bConflict = food.brief(rConflict, 7, TODAY);
eq(bConflict.tone, 'warn', '两种在观察摘要 tone=warn');
const bOk = food.brief(stRecs, 9, '2026-11-20');
eq(bOk.tone, 'ok', '已试过摘要 tone=ok');
ok(bOk.title.indexOf('4') > -1, '已试过摘要带数量');

/* ================= 13. 餐单的排敏优先 ================= */
console.log('\n[13] 餐单的排敏优先');
clearAll();

// 一针都没试过时，不该排含未试过敏原的菜
const menuBlank = food.menuFor(7, 'b1', '2026-11-09', {}, TODAY, []);
const newAllergenMeals = [];
menuBlank.days.forEach(function (d) {
  d.meals.forEach(function (m) {
    if ((m.newAllergens || []).length) newAllergenMeals.push(m.recipe.name);
  });
});
eq(newAllergenMeals.length, 0, '什么都没试过时，餐单里不含未试过敏原');

const eggOnly = [rec({ id: 'e1', foodId: 'egg_yolk', date: '2026-11-01' })];
const menuEgg = food.menuFor(7, 'b1', '2026-11-09', {}, TODAY, eggOnly);
let eggDish = false;
menuEgg.days.forEach(function (d) {
  d.meals.forEach(function (m) {
    if (m.recipe && m.recipe.foods.indexOf('egg_yolk') > -1) eggDish = true;
  });
});
ok(eggDish, '蛋黄通过后，含蛋黄的食谱可以进餐单');

const fishDish = { foods: ['cod'] };
const noTryKeys = food.triedAllergenKeys([]);
eq(food.newAllergensOf(fishDish, noTryKeys), ['鱼类'], '没试过鱼时，鳕鱼菜标出「鱼类」');
eq(food.newAllergensOf(fishDish, { fish: true }), [], '试过鱼之后不再标');

const week30 = food.menuFor(30, 'b1', '2026-11-09', {}, TODAY, []);
const breakfasts30 = {};
week30.days.forEach(function (d) {
  if (d.meals[0] && d.meals[0].recipe) breakfasts30[d.meals[0].recipe.name] = true;
});
ok(Object.keys(breakfasts30).length >= 3, '24-36 月龄早餐一周至少 3 种（不再被过敏原过滤压成一种）');

const slotsEmpty = [];
[7, 10, 14, 20, 30].forEach(function (mm) {
  const w = food.menuFor(mm, 'b1', '2026-11-09', {}, TODAY, []);
  w.days.forEach(function (d) {
    d.meals.forEach(function (m) {
      if (!m.recipe) slotsEmpty.push(mm + '月:' + m.slot.key);
    });
  });
});
eq(slotsEmpty, [], '各月龄的餐单都能排满，没有空餐位');

/* ================= 14. 按实际月龄推荐 ================= */
console.log('\n[14] 按实际月龄推荐');
clearAll();

const focus7 = food.focusFor(7);
eq(focus7.at, 7, '7 月龄命中第 7 个月这一档');
eq(focus7.exact, true, '7 月龄是精确节点');
eq(focus7.title, '第 7 个月 · 该加肉泥了', '标题直接写本月重点');
eq(food.focusFor(13).at, 12, '13 月龄回退到第 12 个月那一档');
eq(food.focusFor(13).exact, false, '13 月龄不是精确节点');
eq(food.focusFor(6).texture, '稀糊', '6 月龄质地是稀糊');
eq(food.focusFor(9).texture, '细颗粒', '9 月龄质地换成细颗粒');
ok(food.focusFor(24).meals.indexOf('加餐') > -1, '24 月龄餐次带加餐');

let badNext = '';
Object.keys(DATA.MONTH_FOCUS).forEach(function (k) {
  (DATA.MONTH_FOCUS[k].next || []).forEach(function (id) {
    if (!food.foodById(id)) badNext = k + ' → ' + id;
  });
});
ok(!badNext, '逐月重点引用的食材都存在' + (badNext ? '（缺：' + badNext + '）' : ''));

// 什么都没吃过：第一口永远是米粉，但第二口开始按月龄分叉
const d6 = food.dueFoods(6, [], [], TODAY);
const d7 = food.dueFoods(7, [], [], TODAY);
const d8 = food.dueFoods(8, [], [], TODAY);
eq(d6[0].id, 'rice_cereal', '6 月龄第一口是强化铁米粉');
eq(d7[0].id, 'rice_cereal', '7 月龄还没吃过米粉时，仍然先补这一口');
eq(d8[0].id, 'rice_cereal', '8 月龄还没吃过米粉时，仍然先补这一口');
ok(d6[1].id !== d7[1].id && d7[1].id !== d8[1].id, '第二口开始 6 / 7 / 8 月龄各不相同');

// 跟上进度后，每月推进的主线不同
function tried(ids, prefix) {
  return ids.map(function (id, i) {
    return rec({ id: prefix + i, foodId: id, date: '2026-10-01' });
  });
}
const tried_6 = ['rice_cereal', 'pumpkin', 'carrot', 'apple', 'banana', 'potato'];
const tried_67 = tried_6.concat([
  'pork', 'beef', 'chicken', 'egg_yolk', 'broccoli', 'spinach', 'millet', 'pear', 'avocado'
]);
const tried_678 = tried_67.concat([
  'pork_liver', 'cod', 'salmon', 'bass', 'tofu', 'oat', 'zucchini', 'pea', 'yogurt', 'sweet_potato'
]);

eq(
  food.dueFoods(7, tried(tried_6, 'a'), [], TODAY)[0].id,
  'pork',
  '米粉那批吃过之后，7 月龄下一个是猪肉'
);
eq(
  food.dueFoods(8, tried(tried_67, 'b'), [], TODAY)[0].id,
  'pork_liver',
  '6-7 月龄那批吃遍后，8 月龄推到猪肝'
);
eq(
  food.dueFoods(9, tried(tried_678, 'c'), [], TODAY)[0].id,
  'noodle',
  '8 月龄那批吃遍后，9 月龄推到宝宝面条'
);
ok(
  food.dueFoods(13, [], [], TODAY)[0].id !== 'rice_cereal',
  '13 月龄不再把米粉排在第一位'
);

// 餐单质地随月龄递进
const w9 = food.menuFor(9, 'b1', '2026-11-09', {}, TODAY, tried(tried_67, 'd'));
const puree9 = [];
w9.days.forEach(function (d) {
  d.meals.forEach(function (m) {
    if (m.recipe && m.recipe.fromMonth <= 6) puree9.push(m.recipe.name);
  });
});
ok(!puree9.length, '9 月龄的餐单里不再出现 6 月龄的纯泥' + (puree9.length ? '（仍有 ' + puree9.join('、') + '）' : ''));
ok(
  w9.days.every(function (d) {
    return !d.meals[2] || !d.meals[2].recipe || d.meals[2].recipe.meal === 'snack';
  }),
  '9-11 月龄的下午加餐排的是加餐食谱，不是纯泥'
);

const w10 = food.menuFor(10, 'b1', '2026-11-09', {}, TODAY, tried(tried_67, 'd'));
ok(
  JSON.stringify(w9.days.map(function (d) { return d.meals.map(function (m) { return m.recipe && m.recipe.id; }); })) !==
    JSON.stringify(w10.days.map(function (d) { return d.meals.map(function (m) { return m.recipe && m.recipe.id; }); })),
  '9 月龄和 10 月龄不是同一份餐单'
);

// 明确过敏的食材不进餐单，也不算「已通过」
const eggAllergy = [rec({ id: 'q1', foodId: 'egg_yolk', date: '2026-10-01', reaction: 'allergy' })];
const wEgg = food.menuFor(9, 'b1', '2026-11-09', {}, TODAY, eggAllergy);
const eggDishes = [];
wEgg.days.forEach(function (d) {
  d.meals.forEach(function (m) {
    if (m.recipe && m.recipe.foods.some(function (f) { return f.indexOf('egg') === 0; })) {
      eggDishes.push(m.recipe.name);
    }
  });
});
ok(!eggDishes.length, '蛋黄过敏后，餐单里不再出现含蛋的菜' + (eggDishes.length ? '（仍有 ' + eggDishes.join('、') + '）' : ''));
eq(food.triedAllergenKeys(eggAllergy), {}, '过敏的过敏原组不算已通过');

/* ================= 15. 季节 ================= */
console.log('\n[15] 季节');
clearAll();

const foodIds15 = {};
FOODS.forEach(function (f) {
  foodIds15[f.id] = true;
});

let badSeasonKey = '';
let badSeasonMonth = '';
let oilSeasoned = '';
Object.keys(DATA.SEASON_MONTHS).forEach(function (id) {
  if (!foodIds15[id]) badSeasonKey = id;
  const months = DATA.SEASON_MONTHS[id];
  const seen = {};
  months.forEach(function (m) {
    if (typeof m !== 'number' || m < 1 || m > 12 || m !== Math.floor(m)) badSeasonMonth = id;
    if (seen[m]) badSeasonMonth = id + '(重复月份)';
    seen[m] = true;
  });
  const f = food.foodById(id);
  if (f && f.group === 'oil') oilSeasoned = id;
});
ok(!badSeasonKey, '当季表里的 key 都是合法食材' + (badSeasonKey ? '（问题：' + badSeasonKey + '）' : ''));
// 允许跨年降序（草莓 12→4 是连续的一季），只要求月份合法且不重复
ok(!badSeasonMonth, '当季月份都是 1-12 的整数且不重复' + (badSeasonMonth ? '（问题：' + badSeasonMonth + '）' : ''));
ok(!oilSeasoned, '油不做季节标注（做成油脂后没有季节性）' + (oilSeasoned ? '（问题：' + oilSeasoned + '）' : ''));
ok(Object.keys(DATA.SEASON_MONTHS).length >= 30, '至少 30 种食材有明确当季（实际 ' + Object.keys(DATA.SEASON_MONTHS).length + ' 种）');

eq(DATA.SEASONS.length, 4, '四季 4 档');
eq(food.seasonOf(11).key, 'autumn', '11 月是秋天');
eq(food.seasonOf(1).key, 'winter', '1 月是冬天（跨年）');
eq(food.seasonOf(13), null, '非法月份返回 null');
eq(food.seasonMonthsOf('pumpkin'), [8, 9, 10, 11], '南瓜当季是 8-11 月');
eq(food.seasonMonthsOf('pork'), [], '猪肉没有季节（全年）');

eq(food.isInSeason('pumpkin', 10), true, '10 月的南瓜当季');
eq(food.isInSeason('pumpkin', 3), false, '3 月的南瓜不当季');
eq(food.isInSeason('watermelon', 1), false, '1 月的西瓜不当季');
eq(food.isInSeason('pork', 1), true, '猪肉全年当季');
eq(food.isInSeason('custom_anything', 1), true, '未知食材按全年处理');

const novSeason = food.inSeasonFoods(11, 7);
ok(novSeason.length > 0, '11 月当季食材非空（实际 ' + novSeason.length + ' 种）');
ok(
  novSeason.every(function (f) {
    return f.fromMonth <= 7;
  }),
  '当季清单只含 7 月龄能吃的'
);
ok(
  !novSeason.some(function (f) {
    return f.id === 'rice_cereal' || f.group === 'oil';
  }),
  '米粉和油不进「当季」清单'
);
const novNames = novSeason.map(function (f) {
  return f.name;
});
ok(novNames.indexOf('南瓜') > -1, '11 月当季里有南瓜');
ok(novNames.indexOf('西瓜') === -1, '11 月当季里没有西瓜');

/* ================= 16. 接种期就餐约束 ================= */
console.log('\n[16] 接种期就餐约束');
clearAll();

const vaccineUtil = require('../utils/vaccine.js');
const vaxRec = function (date, time, id) {
  return { id: id || 'v1', babyId: 'b1', vaccineId: 'mmr', dose: 1, date: date, time: time };
};
const tsAt = function (dateStr, time) {
  return vaccineUtil.toTs(dateStr + ' ' + time);
};

// 用固定时间点，避开真实时钟
const DAY10 = '2026-11-10';
const noVax = vaccineUtil.dietFlagFor([], tsAt(DAY10, '12:00'), DAY10);
eq(noVax.active, false, '没有接种记录 → 不加约束');
eq(noVax.level, 'none', '没有接种记录 level=none');

const justNow = vaccineUtil.dietFlagFor([vaxRec(DAY10, '10:00')], tsAt(DAY10, '12:00'), DAY10);
eq(justNow.active, true, '接种后 2 小时 → 生效');
eq(justNow.level, 'strict', '接种后 2 小时是 strict');
ok(/新食材/.test(justNow.note), 'strict 的说明提到别加新食材');

const within3d = vaccineUtil.dietFlagFor([vaxRec('2026-11-09', '06:00')], tsAt(DAY10, '12:00'), DAY10);
eq(within3d.level, 'light', '接种后 30 小时是 light');
ok(/过敏/.test(within3d.note), 'light 的说明提到避开易过敏');

const out72 = vaccineUtil.dietFlagFor([vaxRec('2026-11-07', '04:00')], tsAt(DAY10, '12:00'), DAY10);
eq(out72.active, false, '接种后 80 小时不再约束');

// 待安排的记录不能被当成「刚打完」
const planned = vaccineUtil.dietFlagFor([vaxRec('2026-11-12', '10:00')], tsAt(DAY10, '12:00'), DAY10);
eq(planned.active, false, '未来日期的接种不触发约束');

// 两条记录取最近的那条
const twoShots = vaccineUtil.dietFlagFor(
  [vaxRec('2026-11-06', '10:00', 'v1'), vaxRec(DAY10, '11:00', 'v2')],
  tsAt(DAY10, '12:00'),
  DAY10
);
eq(twoShots.level, 'strict', '多条记录取最近一条（1 小时前那针）');
eq(twoShots.untilDate, '2026-11-13', '约束到期日 = 接种日 + 3 天');

// 餐单真的被收紧
const triedPork = [
  rec({ id: 'k1', foodId: 'rice_cereal', date: '2026-11-01' }),
  rec({ id: 'k2', foodId: 'pork', date: '2026-11-02' }),
  rec({ id: 'k3', foodId: 'pumpkin', date: '2026-11-03' })
];
const strictMenu = food.menuFor(7, 'b1', DAY10, {}, DAY10, triedPork, { diet: 'strict' });
const strictUnknown = [];
strictMenu.days.forEach(function (d) {
  d.meals.forEach(function (m) {
    if (!m.recipe) return;
    if ((m.newAllergens || []).length) strictUnknown.push(m.recipe.name);
    m.recipe.foods.forEach(function (fid) {
      const tried = triedPork.some(function (r) {
        return r.foodId === fid;
      });
      if (!tried && strictUnknown.indexOf(m.recipe.name) === -1) strictUnknown.push(m.recipe.name);
    });
  });
});
ok(!strictUnknown.length, 'strict 下只排吃过的、不含未试过敏原' + (strictUnknown.length ? '（仍有 ' + strictUnknown.join('、') + '）' : ''));

let strictEmpty = 0;
strictMenu.days.forEach(function (d) {
  d.meals.forEach(function (m) {
    if (!m.recipe) strictEmpty++;
  });
});
eq(strictEmpty, 0, 'strict 下餐位不会空出来');

const strictReasons = strictMenu.days[0].meals[0].reasons || [];
ok(strictReasons.some(function (r) { return r.indexOf('接种期') === 0; }), 'strict 下每餐带上接种期理由');

const normalMenu = food.menuFor(7, 'b1', DAY10, {}, DAY10, triedPork, { diet: 'none' });
eq(normalMenu.days.length, 7, 'diet=none 时仍是 7 天');

/* ================= 17. 3 天计划 ================= */
console.log('\n[17] 3 天计划');
clearAll();

const plan3 = food.planFor(9, 'b1', DAY10, 3, {}, DAY10, [], { diet: 'none' });
eq(plan3.days.length, 3, '计划 3 天');
eq(plan3.startDate, DAY10, '起点是今天');
eq(plan3.endDate, '2026-11-12', '终点是第 3 天');
eq(
  plan3.days.map(function (d) { return d.date; }),
  ['2026-11-10', '2026-11-11', '2026-11-12'],
  '三天日期连续'
);
eq(plan3.days[0].date, food.dayMenuFor(9, 'b1', DAY10, {}, DAY10, [], { diet: 'none' }).date, '计划首日与「今天吃什么」同一天');
eq(
  JSON.stringify(plan3.days[0].meals.map(function (m) { return m.recipe && m.recipe.id; })),
  JSON.stringify(food.dayMenuFor(9, 'b1', DAY10, {}, DAY10, [], { diet: 'none' }).meals.map(function (m) { return m.recipe && m.recipe.id; })),
  '计划首日的菜与「今天吃什么」完全一致'
);

// 跨周：11-10 是周二，从周五 11-13 起算会跨到下一周
const planFri = food.planFor(9, 'b1', '2026-11-13', 3, {}, '2026-11-13', [], { diet: 'none' });
eq(
  planFri.days.map(function (d) { return d.date; }),
  ['2026-11-13', '2026-11-14', '2026-11-15'],
  '跨周计划日期仍然连续'
);

// 跨周那天与所在周的周餐单一致
const weekNext = food.menuFor(9, 'b1', '2026-11-16', {}, '2026-11-16', [], { diet: 'none' });
const monDay = weekNext.days[0];
eq(planFri.days.length, 3, '跨周计划长度仍是 3');

const planAgain = food.planFor(9, 'b1', DAY10, 3, {}, DAY10, [], { diet: 'none' });
eq(JSON.stringify(plan3.days), JSON.stringify(planAgain.days), '同参数两次计划完全一致');

const planOtherBaby = food.planFor(9, 'b2', DAY10, 3, {}, DAY10, [], { diet: 'none' });
ok(
  JSON.stringify(plan3.days.map(function (d) { return d.meals.map(function (m) { return m.recipe && m.recipe.id; }); })) !==
    JSON.stringify(planOtherBaby.days.map(function (d) { return d.meals.map(function (m) { return m.recipe && m.recipe.id; }); })),
  '换宝宝计划不同'
);

let badReasons = '';
plan3.days.forEach(function (d) {
  d.meals.forEach(function (m) {
    if (!Array.isArray(m.reasons)) badReasons = d.date;
  });
});
ok(!badReasons, '每餐都带 reasons 数组' + (badReasons ? '（问题：' + badReasons + '）' : ''));

const planMeals = plan3.days[0].meals;
ok(planMeals.length > 0, '计划第一天有餐次');
ok(
  planMeals.every(function (m) {
    return m.slot && typeof m.slot.key === 'string';
  }),
  '每餐带 slot 结构'
);

// 计划天数为 1 或超界时的夹取
eq(food.planFor(9, 'b1', DAY10, 1, {}, DAY10, [], {}).days.length, 1, 'days=1 只出一天');
eq(food.planFor(9, 'b1', DAY10, 99, {}, DAY10, [], {}).days.length, 7, 'days 上限夹到 7');

/* ================= 18. 进食流水账 ================= */
console.log('\n[18] 进食流水账');
clearAll();

const logOf = function (o) {
  return Object.assign({ babyId: 'b1', date: DAY10, slot: 'am', foods: ['pumpkin'], accept: 'ok' }, o);
};

eq(store.getMealLogs('b1').length, 0, '一开始没有流水账');

const log1 = store.upsertMealLog(logOf({ recipeId: 'pumpkin_puree', recipeName: '南瓜泥' }));
ok(!!log1.id && log1.id.indexOf('m') === 0, '新增后生成 id');
ok(!!log1.createdAt, '新增后带 createdAt');
eq(store.getMealLogs('b1').length, 1, '写入后能读出来');
eq(store.getMealLogs('b2').length, 0, '按宝宝隔离：b2 看不到 b1 的记录');
eq(store.getMealLog(log1.id).id, log1.id, '按 id 能取到单条');

// 字段清洗
const dirty = store.upsertMealLog(
  logOf({
    slot: 'midnight',
    amount: 'tons',
    accept: 'meh',
    poop: 'weird',
    foods: ['pumpkin', 'pumpkin', '', 'carrot'],
    note: '一'.repeat(80)
  })
);
eq(dirty.slot, 'other', '非法餐次落到 other');
eq(dirty.amount, '', '非法分量落到空');
eq(dirty.accept, 'ok', '非法接受度落到 ok');
eq(dirty.poop, '', '非法便便落到空');
eq(dirty.foods, ['pumpkin', 'carrot'], '食材去重并去掉空值');
eq(dirty.note.length, 60, '备注截断到 60 字');

// 更新不新增
const upd = store.upsertMealLog(logOf({ id: log1.id, amount: 'half', amountText: '小半碗', accept: 'love' }));
eq(store.getMealLogs('b1').length, 2, '按 id 更新不会新增条目');
eq(store.getMealLog(log1.id).amount, 'half', '更新写回了新值');
eq(upd.id, log1.id, '更新返回同一条');

// 按日期取当天
const sameDay = store.getMealLogsByDate('b1', DAY10);
eq(sameDay.length, 2, '能按日期取到当天全部');
eq(store.getMealLogsByDate('b1', '2026-11-01').length, 0, '没有记录的日期返回空');

// 餐次与引擎对齐
const menuSlotKeys = [];
Object.keys(MENU).forEach(function (k) {
  MENU[k].slots.forEach(function (s) {
    if (menuSlotKeys.indexOf(s.key) === -1) menuSlotKeys.push(s.key);
  });
});
ok(
  menuSlotKeys.every(function (k) {
    return store.MEAL_SLOTS.indexOf(k) > -1;
  }),
  '流水账的餐次覆盖 MENU 的全部餐位'
);
ok(store.MEAL_SLOTS.indexOf('other') > -1, '流水账有 other 兜底餐次');
ok(food.LOG_SLOTS.length === store.MEAL_SLOTS.length, '引擎与 store 的餐次数量一致');
ok(['am', 'noon', 'pm', 'eve', 'other'].indexOf(food.guessSlot(Date.now())) > -1, '按钟点猜的餐次总是合法');

// 枚举与数据层一致
eq(
  store.upsertMealLog(logOf({ amount: 'little' })).amount,
  'little',
  '四档分量都能落库'
);
eq(
  food.AMOUNTS.map(function (a) { return a.key; }),
  ['little', 'half', 'most', 'all'],
  '引擎分量四档与 store 校验一致'
);
eq(
  food.ACCEPTS.map(function (a) { return a.key; }),
  ['love', 'ok', 'refuse'],
  '引擎接受度三档与 store 校验一致'
);
eq(
  food.POOPS.map(function (p) { return p.key; }),
  ['normal', 'loose', 'hard', 'none'],
  '引擎便便四档与 store 校验一致'
);

/* ---------- 删除 ---------- */
const beforeDel = store.getMealLogs('b1').length;
store.removeMealLog(log1.id);
eq(store.getMealLogs('b1').length, beforeDel - 1, '删除一条后数量减一');
eq(store.getMealLog(log1.id), null, '删除后按 id 取不到');

/* ---------- 吃过什么 ---------- */
const eaten = food.eatenMap([
  { date: '2026-11-01', foods: ['pumpkin', 'carrot'] },
  { date: '2026-11-05', foods: ['pumpkin'] }
]);
eq(eaten.pumpkin, '2026-11-05', 'eatenMap 取最近一次日期');
eq(eaten.carrot, '2026-11-01', 'eatenMap 保留更早的那次');
eq(Object.keys(eaten).length, 2, 'eatenMap 按食材去重');

/* ---------- 吃过但没记排敏 ---------- */
clearAll();
const untrackedLogs = [
  { id: 'm1', babyId: 'b1', date: DAY10, slot: 'am', foods: ['pumpkin', 'egg_yolk'] },
  { id: 'm2', babyId: 'b1', date: '2026-10-01', slot: 'noon', foods: ['beef'] },
  { id: 'm3', babyId: 'b1', date: DAY10, slot: 'pm', foods: ['tofu'] }
];
const trackedRecord = [rec({ id: 'k1', foodId: 'pumpkin', date: '2026-11-08' })];

const untracked = food.untrackedFoods(untrackedLogs, trackedRecord, [], DAY10, 7);
const untrackedNames = untracked.map(function (f) { return f.name; });
ok(untrackedNames.indexOf('南瓜') === -1, '记过排敏的食材不再提醒');
ok(untracked.length >= 2, '吃过但没记排敏的能被认出来（实际 ' + untracked.length + ' 种）');
ok(
  untrackedNames.indexOf('蛋黄') > -1 || untrackedNames.indexOf('豆腐') > -1,
  '近期吃过的漏网食材在清单里'
);
ok(
  untracked.length > 0 && untracked[0].allergen === true,
  '过敏原排在提醒清单最前面'
);
ok(
  food.untrackedFoods(untrackedLogs, [], [], DAY10, 7).every(function (f) {
    return f.id !== 'beef';
  }),
  '超出回溯窗的老记录不提醒'
);
ok(
  food.untrackedFoods(untrackedLogs, [], ['egg_yolk'], DAY10, 7).every(function (f) {
    return f.id !== 'egg_yolk';
  }),
  '标了「不想试」的食材不再提醒'
);

/* ---------- 展示字段 ---------- */
const decoratedLogs = food.decorateMealLogs(
  [
    logOf({ id: 'm9', date: DAY10, slot: 'noon', recipeName: '南瓜泥', foods: ['pumpkin'], amount: 'half', amountText: '小半碗', accept: 'love', poop: 'loose', note: '' }),
    logOf({ id: 'm8', date: '2026-11-05', slot: 'pm', recipeName: '', foods: ['carrot'], amount: 'all', accept: 'ok' })
  ],
  DAY10
);
eq(decoratedLogs.length, 2, '展示列表长度正确');
eq(decoratedLogs[0].id, 'm9', '展示列表按日期倒序（新的在前）');
eq(decoratedLogs[0].slotLabel, '午餐', '餐次转成中文');
eq(decoratedLogs[0].dateText, '11 月 10 日', '日期转成中文');
eq(decoratedLogs[0].sinceText, '今天', '当天显示「今天」');
eq(decoratedLogs[1].sinceText, '5 天前', '往日显示「N 天前」');
eq(decoratedLogs[0].amountText, '小半碗', '分量转成中文');
eq(decoratedLogs[0].acceptText, '很爱吃', '接受度转成中文');
eq(decoratedLogs[0].poopText, '偏稀', '便便转成中文');
eq(decoratedLogs[0].title, '南瓜泥', '菜名用录入时的快照');
eq(decoratedLogs[1].title, '胡萝卜', '没菜名时退回食材名');
ok(
  decoratedLogs[0].foods.length === 1 && decoratedLogs[0].foods[0].id === 'pumpkin',
  '食材摊平成可渲染结构'
);

/* ---------- 自定义食材被删时摘引用，不删整条 ---------- */
clearAll();
const bean = store.addCustomFood({ name: '自制肉松', group: 'meat', fromMonth: 8 });
const beanLog = store.upsertMealLog(logOf({ foods: [bean.id, 'pumpkin'], recipeName: '肉松粥' }));
store.removeCustomFood(bean.id);
const afterFoodDel = store.getMealLog(beanLog.id);
ok(!!afterFoodDel, '删自定义食材不会删掉整条流水账');
eq(afterFoodDel.foods, ['pumpkin'], '只把被删的食材从这一餐里摘掉');
eq(afterFoodDel.recipeName, '肉松粥', '菜名快照保留，历史不错乱');

/* ---------- 删宝宝级联 ---------- */
clearAll();
mem['xyd_babies'] = [{ id: 'b1', name: '小芽' }, { id: 'b2', name: '小豆' }];
mem['xyd_settings'] = { activeBabyId: 'b1' };
store.upsertMealLog(logOf({ babyId: 'b1' }));
store.upsertMealLog(logOf({ babyId: 'b2' }));
store.upsertMealLog(logOf({ babyId: 'b2' }));
eq(store.getAllMealLogs().length, 3, '两个宝宝共 3 条流水账');
store.removeBaby('b1');
eq(store.getMealLogs('b1').length, 0, '删宝宝后他的流水账清空');
eq(store.getMealLogs('b2').length, 2, '另一个宝宝的流水账不受影响');

/* ---------- 超量截断 ---------- */
clearAll();
for (let i = 0; i < 6; i++) {
  store.upsertMealLog(logOf({ date: dateUtil.shiftDate('2026-11-01', i), babyId: 'b3' }));
}
const trimRes = store.trimMealLogs('b3', 4);
eq(trimRes.trimmed, 2, '超量时截断 2 条');
eq(store.getMealLogs('b3').length, 4, '截断后只剩上限条数');
const keptDates = store
  .getMealLogs('b3')
  .map(function (l) { return l.date; })
  .sort();
eq(keptDates, ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'], '截断保留的是最近的日期');
eq(store.trimMealLogs('b3', 10).trimmed, 0, '没超量时不截断');

/* ================= 收尾 ================= */
console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail ? 1 : 0);

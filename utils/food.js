// utils/food.js —— 辅食引擎
// 四件事：① 现在该加什么（月龄刻度 + 阶段 + 顺序）② 正在排敏什么（观察窗）
//         ③ 今天吃什么（餐单，随月龄/季节/接种期变化）④ 吃过的（流水账汇总）
//
// 「该加什么」按**实际月龄**给：5 个阶段档太粗，6/7/8 月龄要做的事完全不同，
// 所以待尝试的排序以 MONTH_FOCUS 的逐月节点为主线（见 focusFor / dueFoods）。
// 餐单同理，优先排「本月或上个月才解锁」的食谱，避免 9 月龄还在吃 6 月龄的纯泥。
//
// 季节与接种期只**影响餐单的权重与候选**，不影响「该加什么」的排序——
// 该加什么由月龄和铁决定，不该被时令左右。
//
// 设计取向和 utils/vaccine.js 一致：不在存储里放派生状态，
// 「试过 / 观察中 / 该加了 / 之后再说 / 不想试」全部按记录现算。

const dateUtil = require('./date.js');
const store = require('./store.js');
const data = require('../data/foods.js');

const STAGES = data.STAGES;
const MONTH_FOCUS = data.MONTH_FOCUS;
const FOODS = data.FOODS;
const RECIPES = data.RECIPES;
const ALLERGENS = data.ALLERGENS;
const MENU = data.MENU;
const REACTIONS = data.REACTIONS;
const READY = data.READY;
const SEASON_MONTHS = data.SEASON_MONTHS;
const SEASONS = data.SEASONS;
const AMOUNTS = data.AMOUNTS;
const ACCEPTS = data.ACCEPTS;
const POOPS = data.POOPS;

/** 月龄刻度的节点，升序，只算一次 */
const FOCUS_MONTHS = Object.keys(MONTH_FOCUS)
  .map(Number)
  .sort(function (a, b) {
    return a - b;
  });

/** 新食材观察窗：记录当天 + 之后 2 天，共 3 个日历日 */
const WATCH_DAYS = 3;

/** 排敏过滤只在 18 月龄以内生效：再大基本都吃过了，不必把菜谱压得只剩几道 */
const ALLERGEN_FILTER_MAX_MONTH = 18;

/** 第一口永远是强化铁米粉；月份往后走了也不能把这一口漏过去 */
const FIRST_FOOD = 'rice_cereal';
const FIRST_FOOD_MAX_MONTH = 12;

const GROUP_LABEL = {
  grain: '谷薯',
  veg: '蔬菜',
  fruit: '水果',
  meat: '肉',
  liver: '肝',
  fish: '鱼虾',
  egg: '蛋',
  dairy: '奶',
  bean: '豆',
  nut: '坚果',
  oil: '油'
};

const REACTION_MAP = {};
REACTIONS.forEach(function (r) {
  REACTION_MAP[r.key] = r;
});

/* ---------------- 月龄与阶段 ---------------- */

function clampMonth(month) {
  const m = Number(month);
  if (isNaN(m)) return 6;
  return Math.max(0, Math.min(36, Math.floor(m)));
}

/** 阶段；未满 6 月龄按第一档返回（配 readyFor 一起判断） */
function stageFor(month) {
  const m = Math.max(6, clampMonth(month));
  for (let i = 0; i < STAGES.length; i++) {
    if (m >= STAGES[i].min && m <= STAGES[i].max) return STAGES[i];
  }
  return STAGES[STAGES.length - 1];
}

function listStages() {
  return STAGES;
}

/** 未满 6 月龄时返回「准备好没」的信号，否则返回 null */
function readyFor(month) {
  return clampMonth(month) < 6 ? READY : null;
}

function monthLabel(month) {
  const m = clampMonth(month);
  if (m < 6) return '未到辅食月龄';
  return stageFor(m).label;
}

/**
 * 逐月重点：取「不晚于当前月龄」的最近一个节点
 * 例如 13、14 月龄都取 12 月龄那一档
 * @returns {Object} { at, exact, title, focus, texture, meals, key, next }
 */
function focusFor(month) {
  const m = clampMonth(month);
  let at = FOCUS_MONTHS[0];
  for (let i = 0; i < FOCUS_MONTHS.length; i++) {
    if (FOCUS_MONTHS[i] <= m) at = FOCUS_MONTHS[i];
  }
  const src = MONTH_FOCUS[at] || {};
  const stage = stageFor(m);
  const next = (src.next || []).slice();
  return {
    at: at,
    exact: at === m,
    title: src.title || '',
    focus: src.focus || '',
    // 节点没写就退回所属阶段的值，页面永远有内容可显示
    texture: src.texture || stage.texture,
    meals: src.meals || stage.meals,
    key: src.key || '',
    next: next
  };
}

/* ---------------- 食材库 ---------------- */

function customFoods() {
  try {
    return store.getCustomFoods().map(normalizeCustom);
  } catch (e) {
    return [];
  }
}

/** 把用户自己加的结构补齐成内置食材的形状 */
function normalizeCustom(f) {
  const src = f || {};
  return {
    id: src.id,
    name: src.name || '自定义食材',
    emoji: src.emoji || '🍽',
    group: GROUP_LABEL[src.group] ? src.group : 'veg',
    fromMonth: Math.max(6, Math.min(36, Number(src.fromMonth) || 6)),
    allergen: false,
    allergenGroup: '',
    ironRich: false,
    how: src.how || '',
    note: src.note || '',
    custom: true
  };
}

function allFoods() {
  return FOODS.concat(customFoods());
}

/** 按 id 找一个食材（含自定义）；找不到返回 null */
function findFood(id) {
  const key = String(id || '');
  if (!key) return null;
  const list = allFoods();
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === key) return list[i];
  }
  return null;
}

function groupLabel(g) {
  return GROUP_LABEL[g] || '其他';
}

/** 按分组归类，供食材库展示 */
const GROUP_ORDER = ['grain', 'veg', 'fruit', 'meat', 'liver', 'fish', 'egg', 'dairy', 'bean', 'nut', 'oil'];

function groupFoods(foods) {
  const map = {};
  (foods || []).forEach(function (f) {
    if (!map[f.group]) map[f.group] = [];
    map[f.group].push(f);
  });
  const out = [];
  GROUP_ORDER.forEach(function (g) {
    if (!map[g] || !map[g].length) return;
    out.push({
      key: g,
      label: groupLabel(g),
      foods: map[g].slice().sort(function (a, b) {
        return a.fromMonth - b.fromMonth;
      })
    });
  });
  return out;
}

/* ---------------- 季节 ---------------- */

/** 1-12 月 → 季节对象；非法输入返回 null */
function seasonOf(monthNum) {
  const m = Number(monthNum);
  if (!m || m < 1 || m > 12) return null;
  for (let i = 0; i < SEASONS.length; i++) {
    if (SEASONS[i].months.indexOf(m) > -1) return SEASONS[i];
  }
  return null;
}

/** 食材的当季月份；空数组表示全年都有 */
function seasonMonthsOf(foodOrId) {
  const id = foodOrId && typeof foodOrId === 'object' ? foodOrId.id : foodOrId;
  if (!id) return [];
  const list = SEASON_MONTHS[id];
  return Array.isArray(list) ? list : [];
}

/** 这个月是否当季；没配置的食材恒为 true（全年） */
function isInSeason(foodOrId, monthNum) {
  const m = Number(monthNum);
  if (!m || m < 1 || m > 12) return true;
  const months = seasonMonthsOf(foodOrId);
  if (!months.length) return true;
  return months.indexOf(m) > -1;
}

/**
 * 当前月份的当季食材（已按可吃月龄过滤）
 * 只返回**确实有季节**的食材：全年供应的（肉蛋奶鱼、米粉、油）不进这个列表，
 * 否则「11 月当季：强化铁米粉」会像个笑话。自定义食材同样天然全年，排除。
 */
function inSeasonFoods(monthNum, upToMonth) {
  const m = Number(monthNum);
  if (!m || m < 1 || m > 12) return [];
  const mm = upToMonth === undefined ? 36 : clampMonth(upToMonth);
  return allFoods().filter(function (f) {
    if (f.custom) return false;
    if (f.fromMonth > mm) return false;
    const months = seasonMonthsOf(f);
    if (!months.length) return false;
    return months.indexOf(m) > -1;
  });
}

/* ---------------- 反应分级 ---------------- */

function reactionOf(key) {
  return REACTION_MAP[key] || REACTION_MAP.none;
}

function allergyLevel(key) {
  return reactionOf(key);
}

/** 这条记录是否算出过问题（明确过敏或严重），出过就不再建议尝试 */
function isFailed(reaction) {
  return reaction === 'allergy' || reaction === 'severe';
}

/* ---------------- 记录整理 ---------------- */

function sortDesc(records) {
  return (records || []).slice().sort(function (a, b) {
    const da = String(a.date || '');
    const db = String(b.date || '');
    if (da !== db) return db < da ? -1 : 1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

/** 每种食材的「首次尝试」和「最近一次」，一次遍历搞定 */
function indexRecords(records) {
  const map = {};
  (records || []).forEach(function (r) {
    if (!r.foodId || !r.date) return;
    const cur = map[r.foodId];
    if (!cur) {
      map[r.foodId] = { first: r, last: r, tried: true };
      return;
    }
    if (r.date < cur.first.date) cur.first = r;
    if (r.date > cur.last.date || (r.date === cur.last.date && (r.createdAt || 0) > (cur.last.createdAt || 0))) {
      cur.last = r;
    }
  });
  return map;
}

function firstTryMap(records) {
  const idx = indexRecords(records);
  const out = {};
  Object.keys(idx).forEach(function (id) {
    out[id] = idx[id].first.date;
  });
  return out;
}

/* ---------------- 上下文 ---------------- */

/**
 * 一次性把判断需要的材料备齐，避免对每个食材重复读存储/重复遍历
 * @param {Array} records 该宝宝的辅食记录
 * @param {Array} hidden  该宝宝不想试的 foodId 数组
 * @param {Number} month  月龄
 * @param {String} today  'YYYY-MM-DD'
 */
function buildContext(records, hidden, month, today) {
  const t = today || dateUtil.todayStr();
  const hiddenSet = {};
  (hidden || []).forEach(function (id) {
    hiddenSet[id] = true;
  });
  const foods = allFoods();
  const byId = {};
  foods.forEach(function (f) {
    byId[f.id] = f;
  });

  return {
    today: t,
    month: clampMonth(month),
    stage: stageFor(month),
    foods: foods,
    byId: byId,
    idx: indexRecords(records),
    hidden: hiddenSet,
    records: records || []
  };
}

/** 观察窗信息；不在窗内返回 null */
function watchInfo(record, today) {
  if (!record || !record.date) return null;
  if (isFailed(record.reaction)) return null;
  const diff = dateUtil.diffDays(record.date, today);
  if (diff < 0 || diff >= WATCH_DAYS) return null;
  const endDate = dateUtil.shiftDate(record.date, WATCH_DAYS - 1);
  return {
    dayIndex: diff + 1,
    leftDays: Math.max(0, dateUtil.diffDays(today, endDate)),
    endDate: endDate,
    diff: diff
  };
}

/** 单个食材的状态：allergy | watching | tried | hidden | due | later */
function statusOf(food, ctx) {
  if (!food) return 'later';
  const rec = ctx.idx[food.id];

  if (rec && isFailed(rec.last.reaction)) return 'allergy';

  if (rec) {
    const w = watchInfo(rec.last, ctx.today);
    if (w) return 'watching';
    return 'tried';
  }

  if (ctx.hidden[food.id]) return 'hidden';

  if (food.fromMonth <= ctx.month) return 'due';
  return 'later';
}

/** 带状态的完整清单（食材库、统计都用它） */
function analyze(records, hidden, month, today) {
  const ctx = buildContext(records, hidden, month, today);
  const list = ctx.foods.map(function (f) {
    return { food: f, status: statusOf(f, ctx), last: ctx.idx[f.id] ? ctx.idx[f.id].last : null };
  });
  return { ctx: ctx, list: list };
}

/* ---------------- 正在排敏 ---------------- */

/**
 * 当前处于观察窗的食材，按记录时间倒序
 * 正常情况下最多 1 条；出现 2 条说明家长同时加了两种新食材
 */
function watchFor(records, today, foods) {
  const t = today || dateUtil.todayStr();
  const byId = {};
  (foods || allFoods()).forEach(function (f) {
    byId[f.id] = f;
  });

  const idx = indexRecords(records);
  const out = [];
  Object.keys(idx).forEach(function (id) {
    const rec = idx[id].last;
    const w = watchInfo(rec, t);
    if (!w) return;
    const food = byId[id];
    if (!food) return;
    out.push({
      record: rec,
      food: food,
      dayIndex: w.dayIndex,
      leftDays: w.leftDays,
      endDate: w.endDate,
      reaction: reactionOf(rec.reaction)
    });
  });

  return out.sort(function (a, b) {
    return String(b.record.date) < String(a.record.date) ? -1 : 1;
  });
}

/**
 * 冲突检测：观察窗内出现了两种以上不同的新食材
 * 这时万一有反应，分不清是哪个引起的
 */
function conflicts(records, today) {
  const list = watchFor(records, today);
  if (list.length < 2) return [];
  return list;
}

/* ---------------- 该加什么 ---------------- */

/**
 * 待尝试清单：按月龄细化排序
 *
 * 同一批都没试过的食材，6 / 7 / 8 月龄该先试的东西并不一样，
 * 所以排序分四层：
 *   -1 还没吃过强化铁米粉（12 月龄以内）—— 「第一口」的口径不因为月龄往后推而失效
 *   0 本月重点（MONTH_FOCUS[at].next）—— 逐月推进的主线
 *   1 刚到月龄（fromMonth === 本月）—— 同月的新食材兜底
 *   2 补课（fromMonth < 本月）—— 之前漏掉的，离现在近的先补、铁优先
 *   3 其余（按阶段顺序）
 * 已试过 / 观察中 / 不想试 / 出过过敏 / 未到月龄 的都不进
 */
function dueFoods(month, records, hidden, today) {
  const ctx = buildContext(records, hidden, month, today);
  const order = {};
  (ctx.stage.order || []).forEach(function (id, i) {
    order[id] = i;
  });

  const focus = focusFor(ctx.month);
  const nextIdx = {};
  focus.next.forEach(function (id, i) {
    nextIdx[id] = i;
  });

  function layer(f) {
    if (f.id === FIRST_FOOD && ctx.month <= FIRST_FOOD_MAX_MONTH) return -1;
    if (nextIdx[f.id] !== undefined) return 0;
    if (f.fromMonth === ctx.month) return 1;
    if (f.fromMonth < ctx.month) return 2;
    return 3;
  }

  function stageRank(f) {
    return order[f.id] === undefined ? 999 : order[f.id];
  }

  const due = ctx.foods.filter(function (f) {
    return statusOf(f, ctx) === 'due';
  });

  due.sort(function (a, b) {
    const la = layer(a);
    const lb = layer(b);
    if (la !== lb) return la - lb;

    // 第一口只有一个，不会有两项同时命中
    if (la === -1) return 0;

    // 本月重点：严格按数据里排好的顺序
    if (la === 0) return nextIdx[a.id] - nextIdx[b.id];

    // 刚到月龄：先铁，再按阶段顺序
    if (la === 1) {
      if (!!b.ironRich !== !!a.ironRich) return b.ironRich ? 1 : -1;
      const sa = stageRank(a);
      const sb = stageRank(b);
      if (sa !== sb) return sa - sb;
      return a.name < b.name ? -1 : 1;
    }

    // 补课：先补离现在最近的欠账（2 岁还没试过米粉没有意义，
    // 但 12 月龄该上的全蛋没试就很值得提），同距离的铁优先
    if (la === 2) {
      const da = ctx.month - a.fromMonth;
      const db = ctx.month - b.fromMonth;
      if (da !== db) return da - db;
      if (!!b.ironRich !== !!a.ironRich) return b.ironRich ? 1 : -1;
      const ta = stageRank(a);
      const tb = stageRank(b);
      if (ta !== tb) return ta - tb;
      return a.name < b.name ? -1 : 1;
    }

    const oa = stageRank(a);
    const ob = stageRank(b);
    if (oa !== ob) return oa - ob;
    if (a.fromMonth !== b.fromMonth) return a.fromMonth - b.fromMonth;
    return a.name < b.name ? -1 : 1;
  });

  return due;
}

/** 接下来最该试的 N 种（首页/摘要卡用） */
function suggestNext(month, records, hidden, today, n) {
  return dueFoods(month, records, hidden, today).slice(0, n || 3);
}

/* ---------------- 统计 ---------------- */

function stats(records, month, today) {
  const m = clampMonth(month);
  const t = today || dateUtil.todayStr();
  const idx = indexRecords(records);
  const ids = Object.keys(idx);
  const foods = allFoods();
  const byId = {};
  foods.forEach(function (f) {
    byId[f.id] = f;
  });

  let tried = 0;
  let ironTried = 0;
  let allergyCount = 0;
  let watchCount = 0;
  const allergenTried = {};

  ids.forEach(function (id) {
    const f = byId[id];
    const last = idx[id].last;
    if (!f) return;
    tried++;
    if (f.ironRich) ironTried++;
    if (isFailed(last.reaction)) allergyCount++;
    if (watchInfo(last, t)) watchCount++;
    if (f.allergenGroup) allergenTried[f.allergenGroup] = true;
  });

  const potential = foods.filter(function (f) {
    return f.fromMonth <= m;
  }).length;

  return {
    tried: tried,
    potential: potential,
    total: foods.length,
    ironTried: ironTried,
    allergenTried: Object.keys(allergenTried).length,
    allergenTotal: ALLERGENS.length,
    allergyCount: allergyCount,
    watchCount: watchCount,
    lastDate: sortDesc(records).length ? sortDesc(records)[0].date : ''
  };
}

/** 8 组过敏原的尝试进度 */
function allergenProgress(records) {
  const idx = indexRecords(records);
  const foods = allFoods();
  const tried = {};
  foods.forEach(function (f) {
    if (!f.allergenGroup) return;
    if (!idx[f.id]) return;
    tried[f.allergenGroup] = tried[f.allergenGroup] || [];
    tried[f.allergenGroup].push(f.name);
  });
  return ALLERGENS.map(function (a) {
    return {
      key: a.key,
      name: a.name,
      emoji: a.emoji,
      tip: a.tip,
      firstMonth: a.firstMonth,
      done: !!tried[a.key],
      foods: tried[a.key] || []
    };
  });
}

/* ---------------- 一周餐单 ---------------- */

function hashSeed(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rngOf(seedNum) {
  let a = seedNum >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 出过过敏 / 严重反应的食材 id，餐单里一律不排 */
function failedFoodIds(records) {
  const idx = indexRecords(records);
  const out = {};
  Object.keys(idx).forEach(function (id) {
    if (isFailed(idx[id].last.reaction)) out[id] = true;
  });
  return out;
}

/** 这道菜里有没有不能碰的食材 */
function hitsFoods(recipe, banned) {
  const foods = recipe.foods || [];
  for (let i = 0; i < foods.length; i++) {
    if (banned[foods[i]]) return true;
  }
  return false;
}

function slotOf(stage, key) {
  const cfg = MENU[stage.key];
  if (!cfg) return null;
  for (let i = 0; i < cfg.slots.length; i++) {
    if (cfg.slots[i].key === key) return cfg.slots[i];
  }
  return null;
}

/** 某个餐次可用的食谱 */
function recipesFor(slot, month) {
  const m = clampMonth(month);
  const accept = slot.accept || ['any'];
  return RECIPES.filter(function (r) {
    if (m < r.fromMonth || m > r.toMonth) return false;
    return accept.indexOf(r.meal) > -1;
  });
}

/**
 * 质地递进：优先用「本月或上个月才解锁」的食谱
 * 6 月龄的食谱不会一路排到 9 月龄去，否则一直吃泥糊。
 * 但候选少于 2 道时就不筛了 —— 宁可重复，也不能只剩一道菜天天见。
 */
function recentPool(pool, month) {
  if (pool.length <= 2) return pool;
  const m = clampMonth(month);
  const fresh = pool.filter(function (r) {
    return r.fromMonth >= m - 1;
  });
  return fresh.length >= 2 ? fresh : pool;
}

function recipeById(id) {
  for (let i = 0; i < RECIPES.length; i++) {
    if (RECIPES[i].id === id) return RECIPES[i];
  }
  return null;
}

/**
 * 已通过的过敏原组：{ egg: true, ... }
 * 明确过敏（allergy / severe）的那组不算通过，否则餐单还会把它排进来
 */
function triedAllergenKeys(records) {
  const idx = indexRecords(records);
  const out = {};
  allFoods().forEach(function (f) {
    if (!f.allergenGroup) return;
    if (!idx[f.id]) return;
    if (isFailed(idx[f.id].last.reaction)) return;
    out[f.allergenGroup] = true;
  });
  return out;
}

/** 这个食谱里还没试过的过敏原（返回中文组名） */
function newAllergensOf(recipe, triedKeys) {
  const hit = {};
  allFoods().forEach(function (f) {
    if ((recipe.foods || []).indexOf(f.id) === -1) return;
    if (!f.allergenGroup) return;
    if (triedKeys[f.allergenGroup]) return;
    hit[f.allergenGroup] = true;
  });
  return ALLERGENS.filter(function (a) {
    return hit[a.key];
  }).map(function (a) {
    return a.name;
  });
}

/* ---------------- 生成参数 ---------------- */

/**
 * 归一化外部传入的生成参数。
 * diet 由疫苗模块算好后注入 —— 辅食引擎不认识「百白破第 2 剂」，
 * 只认识「这三天只能排吃过的」，这样引擎本身保持零外部依赖。
 */
function normalizeOpts(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  return {
    diet: o.diet === 'strict' || o.diet === 'light' ? o.diet : 'none',
    season: o.season === undefined ? true : !!o.season
  };
}

/** 台账里出现过的食材集合（不看反应），用于判断「这道菜的食材都吃过吗」 */
function triedFoodSet(records) {
  const idx = indexRecords(records);
  const out = {};
  Object.keys(idx).forEach(function (id) {
    out[id] = true;
  });
  return out;
}

function recipeAllTried(recipe, triedSet) {
  const foods = recipe.foods || [];
  if (!foods.length) return false;
  for (let i = 0; i < foods.length; i++) {
    if (!triedSet[foods[i]]) return false;
  }
  return true;
}

/**
 * 接种期收窄候选
 *   light  → 只排不含未试过敏原的（不论月龄）
 *   strict → 再进一步，只排全部食材都吃过的
 * 每层都是「有才收窄」：宁可放宽，也不能把餐位空出来
 */
function applyDiet(pool, diet, triedKeys, triedSet) {
  if (diet === 'none' || !triedKeys) return pool;
  let out = pool;
  const safe = out.filter(function (r) {
    return newAllergensOf(r, triedKeys).length === 0;
  });
  if (safe.length) out = safe;
  if (diet === 'strict') {
    const all = out.filter(function (r) {
      return recipeAllTried(r, triedSet);
    });
    if (all.length) out = all;
  }
  return out;
}

/**
 * 选菜权重：只做正向加分，不做反季惩罚
 * 11 月的暖棚番茄仍然是番茄，负权重只会把候选池压窄、伤多样性
 */
function weightOf(recipe, wctx) {
  let w = 10;
  const foods = recipe.foods || [];
  if (wctx.seasonOn && wctx.monthNum) {
    for (let i = 0; i < foods.length; i++) {
      const f = wctx.byId[foods[i]];
      if (f && seasonMonthsOf(f).length && isInSeason(f, wctx.monthNum)) {
        w += 6;
        break;
      }
    }
  }
  const next = wctx.focusNext || [];
  for (let j = 0; j < foods.length; j++) {
    if (next.indexOf(foods[j]) > -1) {
      w += 4;
      break;
    }
  }
  return w;
}

/** 加权随机；候选只有一个也固定消耗一次 rand()，保持 rng 序列同构 */
function pickWeighted(list, rand, wctx) {
  const r = rand();
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  let total = 0;
  const weights = new Array(list.length);
  for (let i = 0; i < list.length; i++) {
    weights[i] = wctx ? weightOf(list[i], wctx) : 10;
    total += weights[i];
  }
  if (!total) return list[Math.floor(r * list.length) % list.length];
  let acc = r * total;
  for (let i = 0; i < list.length; i++) {
    acc -= weights[i];
    if (acc < 0) return list[i];
  }
  return list[list.length - 1];
}

/** 这一餐「为什么排它」，纯派生、不消耗 rng */
function reasonsOf(recipe, rctx) {
  if (!recipe) return [];
  const out = [];
  const diet = rctx && rctx.diet;
  if (diet === 'strict') out.push('接种期·只吃吃过的');
  else if (diet === 'light') out.push('接种期·避新');

  const foods = recipe.foods || [];
  const byId = (rctx && rctx.byId) || {};
  const monthNum = rctx && rctx.monthNum;

  if (monthNum) {
    for (let i = 0; i < foods.length; i++) {
      const f = byId[foods[i]];
      if (f && seasonMonthsOf(f).length && isInSeason(f, monthNum)) {
        out.push('当季');
        break;
      }
    }
  }

  const next = (rctx && rctx.focusNext) || [];
  for (let j = 0; j < foods.length; j++) {
    if (next.indexOf(foods[j]) > -1) {
      out.push('本月重点');
      break;
    }
  }

  for (let k = 0; k < foods.length; k++) {
    const f2 = byId[foods[k]];
    if (f2 && f2.ironRich) {
      out.push('补铁');
      break;
    }
  }

  return out.slice(0, 3);
}

/**
 * 生成某一周的餐单
 * 用 babyId + 周一日期 + 月龄 + 日序做种子：
 * 同一周任何时候打开结果完全一致，跨周自动换新
 * 排敏优先：先只排「不含未试过过敏原」的食谱，凑不够才放宽并标记
 * @param {Number} month 月龄
 * @param {String} babyId
 * @param {String} weekStart 'YYYY-MM-DD'，传任意日期会自动折算到那周的周一
 * @param {Object} swaps { 'YYYY-MM-DD#slot': recipeId }
 * @param {String} today
 * @param {Array} records 该宝宝的辅食记录（传了才会做排敏过滤）
 * @param {Object} opts { diet:'none'|'light'|'strict', season:Boolean }
 */
function menuFor(month, babyId, weekStart, swaps, today, records, opts) {
  const stage = stageFor(month);
  const cfg = MENU[stage.key] || MENU.s68;
  const ws = dateUtil.weekStartStr(weekStart || dateUtil.todayStr());
  const swap = swaps && typeof swaps === 'object' ? swaps : {};
  const t = today || dateUtil.todayStr();
  const m = clampMonth(month);
  const o = normalizeOpts(opts);
  const triedKeys = Array.isArray(records) ? triedAllergenKeys(records) : null;
  // 明确过敏过的食材，无论月龄都不排进餐单
  const banned = Array.isArray(records) ? failedFoodIds(records) : {};
  const triedSet = Array.isArray(records) ? triedFoodSet(records) : {};
  const byId = {};
  allFoods().forEach(function (f) {
    byId[f.id] = f;
  });
  const focus = focusFor(m);

  const days = [];
  const usedInWeek = {};

  for (let i = 0; i < 7; i++) {
    const date = dateUtil.shiftDate(ws, i);
    // 月龄也进种子：9 月龄和 10 月龄不是同一份餐单
    const daySeed = hashSeed(String(babyId || 'baby') + '|' + ws + '|' + m + '|' + i);
    const rand = rngOf(daySeed);
    const usedToday = {};
    const meals = [];
    const monthNum = dateUtil.monthNumber(date);
    const wctx = {
      monthNum: monthNum,
      seasonOn: o.season,
      focusNext: focus.next,
      byId: byId
    };

    cfg.slots.forEach(function (slot) {
      const dateSlot = date + '#' + slot.key;
      let recipe = null;
      let swapped = false;

      if (swap[dateSlot]) {
        const picked = recipeById(swap[dateSlot]);
        if (picked) {
          recipe = picked;
          swapped = true;
        }
      }

      if (!recipe) {
        let pool = recipesFor(slot, m);

        // 过敏过的食材先剔掉
        if (Array.isArray(records)) {
          const clean = pool.filter(function (r) {
            return !hitsFoods(r, banned);
          });
          if (clean.length) pool = clean;
        }

        // 接种期收紧：只吃吃过的、避开新过敏原
        pool = applyDiet(pool, o.diet, triedKeys, triedSet);

        // 排敏优先：18 月龄以内先只留「没有未试过敏原」的
        if (triedKeys && m <= ALLERGEN_FILTER_MAX_MONTH) {
          const safe = pool.filter(function (r) {
            return newAllergensOf(r, triedKeys).length === 0;
          });
          if (safe.length) pool = safe;
        }
        // 质地递进：别在 9 月龄还排 6 月龄的纯泥
        pool = recentPool(pool, m);

        // 当天不重复
        let narrowed = pool.filter(function (r) {
          return !usedToday[r.id];
        });
        if (!narrowed.length) narrowed = pool;
        // 本周尽量不重复，实在没得选再放宽
        const fresh = narrowed.filter(function (r) {
          return !usedInWeek[r.id];
        });
        if (fresh.length) narrowed = fresh;
        if (!narrowed.length) {
          meals.push({ slot: slot, recipe: null, swapped: false, newAllergens: [], reasons: [] });
          return;
        }
        recipe = pickWeighted(narrowed, rand, wctx);
      }

      usedToday[recipe.id] = true;
      usedInWeek[recipe.id] = true;
      meals.push({
        slot: slot,
        recipe: recipe,
        swapped: swapped,
        newAllergens: triedKeys ? newAllergensOf(recipe, triedKeys) : [],
        reasons: reasonsOf(recipe, {
          diet: o.diet,
          monthNum: monthNum,
          focusNext: focus.next,
          byId: byId
        })
      });
    });

    days.push({
      date: date,
      weekday: dateUtil.weekdayCN(dateUtil.parseDate(date)),
      dayOfMonth: Number(date.slice(8, 10)),
      isToday: date === t,
      isPast: date < t,
      meals: meals
    });
  }

  return {
    weekStart: ws,
    weekEnd: dateUtil.shiftDate(ws, 6),
    stage: stage,
    note: cfg.note || '',
    days: days
  };
}

/** 某一天的餐单（与一周餐单里的那一天完全一致） */
function dayMenuFor(month, babyId, dateStr, swaps, today, records, opts) {
  const date = dateStr || dateUtil.todayStr();
  const week = menuFor(month, babyId, date, swaps, today, records, opts);
  for (let i = 0; i < week.days.length; i++) {
    if (week.days[i].date === date) return week.days[i];
  }
  return week.days[0];
}

/** 在一周的 days 里按日期取那一天 */
function findDayInWeek(week, date) {
  if (!week || !week.days) return null;
  for (let i = 0; i < week.days.length; i++) {
    if (week.days[i].date === date) return week.days[i];
  }
  return null;
}

/**
 * 从 weeks 索引里切出 N 天
 * @param {Object} weeks { '周一日期': menuFor 的返回值 }
 */
function slicePlan(weeks, startDate, days) {
  const n = Math.max(1, Math.min(7, Number(days) || 3));
  const start = startDate || dateUtil.todayStr();
  const out = [];
  const map = weeks || {};
  for (let i = 0; i < n; i++) {
    const d = dateUtil.shiftDate(start, i);
    const ws = dateUtil.weekStartStr(d);
    const day = findDayInWeek(map[ws], d);
    if (day) out.push(day);
  }
  return {
    startDate: start,
    endDate: dateUtil.shiftDate(start, n - 1),
    days: out
  };
}

/**
 * 今天起 N 天的计划
 * 本质是「按周复用 + 切片」：一个日期只属于一个 ISO 周，
 * 所以不管从今天看还是从本周看，同一天的菜必然相同，跨天滚动也稳定。
 * 不需要改种子，也不需要为窗口单独掷骰子。
 */
function planFor(month, babyId, startDate, days, swaps, today, records, opts) {
  const n = Math.max(1, Math.min(7, Number(days) || 3));
  const start = startDate || dateUtil.todayStr();
  const weeks = {};
  for (let i = 0; i < n; i++) {
    const d = dateUtil.shiftDate(start, i);
    const ws = dateUtil.weekStartStr(d);
    if (!weeks[ws]) weeks[ws] = menuFor(month, babyId, ws, swaps, today, records, opts);
  }
  const plan = slicePlan(weeks, start, n);
  plan.stage = stageFor(month);
  return plan;
}

/** 「换一道」：返回同餐次里与当前不同的另一个候选，优先不含未试过敏原的 */
function altRecipe(month, slotKey, currentId, seedExtra, records, opts) {
  const stage = stageFor(month);
  const slot = slotOf(stage, slotKey);
  if (!slot) return null;

  let pool = recipesFor(slot, month).filter(function (r) {
    return r.id !== currentId;
  });
  if (!pool.length) return null;

  if (Array.isArray(records)) {
    const banned = failedFoodIds(records);
    const clean = pool.filter(function (r) {
      return !hitsFoods(r, banned);
    });
    if (clean.length) pool = clean;
  }

  if (Array.isArray(records) && clampMonth(month) <= ALLERGEN_FILTER_MAX_MONTH) {
    const tried = triedAllergenKeys(records);
    const safe = pool.filter(function (r) {
      return newAllergensOf(r, tried).length === 0;
    });
    if (safe.length) pool = safe;
  }

  // 换一道同样要守接种期约束，否则「换一道」就成了绕过通道
  if (Array.isArray(records)) {
    const o = normalizeOpts(opts);
    pool = applyDiet(pool, o.diet, triedAllergenKeys(records), triedFoodSet(records));
  }

  pool = recentPool(pool, month);

  const idx = Math.abs(hashSeed(String(slotKey) + '|' + (seedExtra || '') + '|' + (currentId || ''))) % pool.length;
  return pool[idx];
}

/* ---------------- 记录展示 ---------------- */

function dateText(dateStr) {
  const d = dateUtil.parseDate(dateStr);
  if (!d) return dateStr || '';
  return d.getMonth() + 1 + ' 月 ' + d.getDate() + ' 日';
}

/** 把记录铺成页面能直接渲染的字段 */
function decorate(records, today) {
  const t = today || dateUtil.todayStr();
  const byId = {};
  allFoods().forEach(function (f) {
    byId[f.id] = f;
  });

  return sortDesc(records).map(function (r) {
    const food = byId[r.foodId] || { name: '已删除的食材', emoji: '🍽', group: 'veg' };
    const lvl = reactionOf(r.reaction);
    const diff = dateUtil.diffDays(r.date, t);
    const w = watchInfo(r, t);

    let sinceText = '';
    if (w) sinceText = '第 ' + w.dayIndex + ' 天观察中';
    else if (diff === 0) sinceText = '今天';
    else if (diff === 1) sinceText = '昨天';
    else if (diff > 1) sinceText = diff + ' 天前';
    else sinceText = '未来日期';

    return {
      id: r.id,
      foodId: r.foodId,
      name: food.name,
      emoji: food.emoji,
      group: food.group,
      groupLabel: groupLabel(food.group),
      date: r.date,
      dateText: dateText(r.date),
      sinceText: sinceText,
      reaction: r.reaction || 'none',
      reactionLabel: lvl.label,
      reactionShort: lvl.short,
      reactionTone: lvl.tone,
      reactionNote: r.reactionNote || '',
      note: r.note || '',
      watching: !!w,
      failed: isFailed(r.reaction)
    };
  });
}

/* ---------------- 进食流水账 ---------------- */

/** 流水账的餐次。前四个与 MENU 的餐位 key 对齐，other 兜住「记不清哪一餐」 */
const LOG_SLOTS = [
  { key: 'am', label: '早餐' },
  { key: 'noon', label: '午餐' },
  { key: 'pm', label: '加餐' },
  { key: 'eve', label: '晚餐' },
  { key: 'other', label: '其他' }
];

function slotLabelOf(key) {
  for (let i = 0; i < LOG_SLOTS.length; i++) {
    if (LOG_SLOTS[i].key === key) return LOG_SLOTS[i].label;
  }
  return '其他';
}

/** 按当前钟点猜餐次，省得家长每次都要点一下 */
function guessSlot(now) {
  const d = now ? new Date(now) : new Date();
  const h = d.getHours();
  if (h < 10) return 'am';
  if (h < 14) return 'noon';
  if (h < 17) return 'pm';
  if (h < 21) return 'eve';
  return 'other';
}

function labelOf(list, key) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].key === key) return list[i].label;
  }
  return '';
}

/**
 * 流水账 → { foodId: 最近一次吃的日期 }
 * 只回答「吃过没有、最后一次是什么时候」，不参与排敏状态判断
 */
function eatenMap(mealLogs) {
  const map = {};
  (mealLogs || []).forEach(function (log) {
    if (!log || !log.date) return;
    const foods = Array.isArray(log.foods) ? log.foods : [];
    foods.forEach(function (id) {
      if (!id) return;
      const cur = map[id];
      if (!cur || log.date > cur) map[id] = log.date;
    });
  });
  return map;
}

/**
 * 吃过但没记过排敏的食材（近 N 天）
 *
 * 方向必须是「流水账提醒去补台账」，不能反过用流水账当台账：
 * 一旦让流水账把食材标成「已尝试」，那些真正没做排敏的食材会被静默沉掉，
 * 家长可能永远不按「一次一种、观察 2 天」的规矩来。所以这里只做提醒，不改状态。
 *
 * @param {Array} mealLogs 流水账
 * @param {Array} records 排敏记录
 * @param {Array} hidden 不想试的 foodId
 * @param {String} today
 * @param {Number} days 回溯天数，默认 7
 */
function untrackedFoods(mealLogs, records, hidden, today, days) {
  const t = today || dateUtil.todayStr();
  const span = Math.max(1, Math.min(30, Number(days) || 7));
  const from = dateUtil.shiftDate(t, -(span - 1));

  const tracked = {};
  (records || []).forEach(function (r) {
    if (r && r.foodId) tracked[r.foodId] = true;
  });
  const hide = {};
  (hidden || []).forEach(function (id) {
    hide[id] = true;
  });

  const seen = {};
  const out = [];
  (mealLogs || []).forEach(function (log) {
    if (!log || !log.date || log.date < from || log.date > t) return;
    const foods = Array.isArray(log.foods) ? log.foods : [];
    foods.forEach(function (id) {
      if (!id || tracked[id] || hide[id] || seen[id]) return;
      seen[id] = true;
      const f = findFood(id);
      // 食材已被家长删掉，就没有「补记」的意义了
      if (!f) return;
      out.push({
        id: f.id,
        name: f.name,
        emoji: f.emoji,
        group: f.group,
        groupLabel: groupLabel(f.group),
        allergen: !!f.allergen
      });
    });
  });

  // 过敏原排前面：这几类最值得补一条正式记录
  out.sort(function (a, b) {
    if (a.allergen !== b.allergen) return a.allergen ? -1 : 1;
    return a.name < b.name ? -1 : 1;
  });
  return out;
}

/** 把一条流水账铺成页面能直接渲染的字段 */
function decorateMealLogs(mealLogs, today) {
  const t = today || dateUtil.todayStr();
  const list = (mealLogs || []).slice().sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return list.map(function (log) {
    const foods = (Array.isArray(log.foods) ? log.foods : [])
      .map(function (id) {
        return findFood(id);
      })
      .filter(function (f) {
        return !!f;
      });

    const names = foods.map(function (f) {
      return f.name;
    });
    const diff = dateUtil.diffDays(log.date, t);

    let sinceText = '';
    if (diff === 0) sinceText = '今天';
    else if (diff === 1) sinceText = '昨天';
    else if (diff > 1) sinceText = diff + ' 天前';
    else sinceText = '未来日期';

    // 菜名优先用录入时的快照：食谱后来改了名，历史也不该跟着变
    const title = log.recipeName || names.slice(0, 3).join('、') || '这一餐';

    return {
      id: log.id,
      date: log.date,
      dateText: dateText(log.date),
      sinceText: sinceText,
      slot: log.slot || 'other',
      slotLabel: slotLabelOf(log.slot),
      recipeId: log.recipeId || '',
      recipeName: log.recipeName || '',
      title: title,
      foods: foods.map(function (f) {
        return { id: f.id, name: f.name, emoji: f.emoji, allergen: !!f.allergen };
      }),
      foodNames: names.join('、'),
      amount: log.amount || '',
      amountText: labelOf(AMOUNTS, log.amount),
      amountFree: log.amountText || '',
      accept: log.accept || 'ok',
      acceptText: labelOf(ACCEPTS, log.accept),
      poop: log.poop || '',
      poopText: labelOf(POOPS, log.poop),
      note: log.note || ''
    };
  });
}

/* ---------------- 摘要卡 ---------------- */

/**
 * 给 guide 的「吃」tab 用的一句结论
 * @returns {Object} { tone, title, desc }
 */
function brief(records, month, today, hidden) {
  const t = today || dateUtil.todayStr();
  const m = clampMonth(month);
  const stage = stageFor(m);
  const s = stats(records, m, t);
  const hide = hidden || [];

  if (m < 6) {
    return {
      tone: 'pre',
      title: '还没到辅食月龄',
      desc: '一般满 6 月龄开始，先对照「准备好的信号」看看'
    };
  }

  const watching = watchFor(records, t);
  if (watching.length > 1) {
    return {
      tone: 'warn',
      title: '同时有两种新食材在观察',
      desc: watching[0].food.name + '、' + watching[1].food.name + ' —— 万一有反应会分不清是哪个'
    };
  }
  if (watching.length === 1) {
    const w = watching[0];
    return {
      tone: 'watch',
      title: '正在排敏：' + w.food.name,
      desc: '第 ' + w.dayIndex + ' 天，' + (w.leftDays > 0 ? '还要看 ' + w.leftDays + ' 天' : '今天就观察完了') + '，先别加新的'
    };
  }

  const next = suggestNext(m, records, hide, t, 2);
  if (!s.tried) {
    return {
      tone: 'todo',
      title: '还没开始加辅食',
      desc:
        m <= 8
          ? '第一口从强化铁米粉开始，一次只加一种，观察 2-3 天'
          : '可以从' + (next[0] ? next[0].name : '强化铁米粉') + '开始，一次只加一种'
    };
  }

  if (next.length) {
    return {
      tone: 'ok',
      title: '已试过 ' + s.tried + ' 种食材',
      desc: '接下来可以试' + next.map(function (f) {
        return f.name;
      }).join('、')
    };
  }

  return {
    tone: 'ok',
    title: '已试过 ' + s.tried + ' 种食材',
    desc: stage.label + '该加的差不多都试过了，按餐单搭配着吃就行'
  };
}

module.exports = {
  WATCH_DAYS: WATCH_DAYS,
  GROUP_LABEL: GROUP_LABEL,
  GROUP_ORDER: GROUP_ORDER,
  READY: READY,
  STAGES: STAGES,
  ALLERGENS: ALLERGENS,
  REACTIONS: REACTIONS,
  SEASONS: SEASONS,
  AMOUNTS: AMOUNTS,
  ACCEPTS: ACCEPTS,
  POOPS: POOPS,
  clampMonth: clampMonth,
  stageFor: stageFor,
  stageForMonth: stageFor,
  listStages: listStages,
  readyFor: readyFor,
  monthLabel: monthLabel,
  focusFor: focusFor,
  groupLabel: groupLabel,
  groupFoods: groupFoods,
  allFoods: allFoods,
  seasonOf: seasonOf,
  seasonMonthsOf: seasonMonthsOf,
  isInSeason: isInSeason,
  inSeasonFoods: inSeasonFoods,
  normalizeCustom: normalizeCustom,
  foodById: findFood,
  reactionOf: reactionOf,
  allergyLevel: allergyLevel,
  isFailed: isFailed,
  indexRecords: indexRecords,
  firstTryMap: firstTryMap,
  buildContext: buildContext,
  watchInfo: watchInfo,
  statusOf: statusOf,
  analyze: analyze,
  watchFor: watchFor,
  conflicts: conflicts,
  dueFoods: dueFoods,
  suggestNext: suggestNext,
  stats: stats,
  allergenProgress: allergenProgress,
  menuFor: menuFor,
  dayMenuFor: dayMenuFor,
  planFor: planFor,
  slicePlan: slicePlan,
  findDayInWeek: findDayInWeek,
  normalizeOpts: normalizeOpts,
  reasonsOf: reasonsOf,
  altRecipe: altRecipe,
  recipeById: recipeById,
  recipesFor: recipesFor,
  slotOf: slotOf,
  triedAllergenKeys: triedAllergenKeys,
  failedFoodIds: failedFoodIds,
  newAllergensOf: newAllergensOf,
  decorate: decorate,
  dateText: dateText,
  sortDesc: sortDesc,
  brief: brief,
  LOG_SLOTS: LOG_SLOTS,
  slotLabelOf: slotLabelOf,
  guessSlot: guessSlot,
  eatenMap: eatenMap,
  untrackedFoods: untrackedFoods,
  decorateMealLogs: decorateMealLogs,
  findFood: findFood
};

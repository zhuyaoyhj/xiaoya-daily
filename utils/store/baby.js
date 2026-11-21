// utils/store/baby.js —— 宝宝档案（删除宝宝时连带清理各类记录）
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');

/* ---------------- 宝宝档案 ---------------- */

function getBabies() {
  const list = ctx.read(ctx.KEYS.babies, []);
  return Array.isArray(list) ? list : [];
}

function saveBabies(list) {
  return ctx.write(ctx.KEYS.babies, list || []);
}

function getBaby(id) {
  const list = getBabies();
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function upsertBaby(input) {
  const baby = Object.assign({}, input);
  baby.updatedAt = Date.now();
  if (!baby.createdAt && !getBaby(baby.id)) baby.createdAt = baby.updatedAt;
  const list = getBabies();
  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === baby.id) {
      list[i] = Object.assign({}, list[i], baby);
      found = true;
      break;
    }
  }
  if (!found) list.push(baby);
  saveBabies(list);
  return baby;
}

function removeBaby(id) {
  const list = getBabies().filter(function (b) {
    return b.id !== id;
  });
  saveBabies(list);

  // 宝宝删了，他的接种记录也一起清掉，避免留下孤儿数据
  const rest = ctx.getAllVaccineRecords().filter(function (r) {
    return r.babyId !== id;
  });
  ctx.write(ctx.KEYS.vaccineRecords, rest);

  // 辅食记录与「不想试」清单同样按宝宝隔离，一并清掉
  const foodRest = ctx.getAllFoodRecords().filter(function (r) {
    return r.babyId !== id;
  });
  ctx.write(ctx.KEYS.foodRecords, foodRest);

  const hiddenRest = ctx.getRawFoodHidden().filter(function (k) {
    return String(k).indexOf(id + '#') !== 0;
  });
  ctx.write(ctx.KEYS.foodHidden, hiddenRest);

  // 进食流水账同理，一个宝宝一条都不能留
  const logRest = ctx.getAllMealLogs().filter(function (l) {
    return l.babyId !== id;
  });
  ctx.write(ctx.KEYS.mealLogs, logRest);

  const swap = ctx.read(ctx.KEYS.menuSwap, {});
  if (swap && typeof swap === 'object' && swap[id]) {
    delete swap[id];
    ctx.write(ctx.KEYS.menuSwap, swap);
  }

  // 照护记录：每个月的分片都要过一遍，计时也一并停掉
  ctx.removeCareOfBaby(id);

  ctx.write(
    ctx.KEYS.growth,
    ctx.getAllGrowth().filter(function (g) {
      return g.babyId !== id;
    })
  );

  const s = ctx.getSettings();
  if (s.activeBabyId === id) {
    ctx.updateSettings({ activeBabyId: list.length ? list[0].id : '' });
  }
  return list;
}

function newBabyId() {
  return ctx.uid('b');
}

/** 当前选中的宝宝；没有选中则取第一个 */
function getActiveBaby() {
  const s = ctx.getSettings();
  const list = getBabies();
  if (!list.length) return null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === s.activeBabyId) return list[i];
  }
  return list[0];
}

function setActiveBabyId(id) {
  return ctx.updateSettings({ activeBabyId: id });
}

Object.assign(ctx, {
  getBabies: getBabies,
  saveBabies: saveBabies,
  getBaby: getBaby,
  upsertBaby: upsertBaby,
  removeBaby: removeBaby,
  newBabyId: newBabyId,
  getActiveBaby: getActiveBaby,
  setActiveBabyId: setActiveBabyId
});

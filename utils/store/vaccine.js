// utils/store/vaccine.js —— 疫苗：接种记录、自定义疫苗、免疫规划里移除的项
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');

/* ---------------- 疫苗接种记录 ---------------- */
// 记录结构：{ id, babyId, vaccineId, dose, date, time, place, note, createdAt }
// 一个宝宝一份记录集，按 babyId 过滤，删宝宝时一起清掉

function getAllVaccineRecords() {
  const list = ctx.read(ctx.KEYS.vaccineRecords, []);
  return Array.isArray(list) ? list : [];
}

/** 取某个宝宝的接种记录（不传 babyId 则返回全部） */
function getVaccineRecords(babyId) {
  const list = getAllVaccineRecords();
  if (!babyId) return list;
  return list.filter(function (r) {
    return r.babyId === babyId;
  });
}

function newVaccineRecordId() {
  return ctx.uid('v');
}

/** 新增或更新一条记录（有 id 且命中则更新） */
function upsertVaccineRecord(record) {
  const list = getAllVaccineRecords();
  const rec = ctx.stamp(Object.assign({}, record), newVaccineRecordId);

  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === rec.id) {
      list[i] = Object.assign({}, list[i], rec);
      found = true;
      break;
    }
  }
  if (!found) list.push(rec);

  ctx.write(ctx.KEYS.vaccineRecords, list);
  return rec;
}

function removeVaccineRecord(id) {
  const list = getAllVaccineRecords().filter(function (r) {
    return r.id !== id;
  });
  ctx.write(ctx.KEYS.vaccineRecords, list);
  return list;
}

/** 同一种疫苗已记录的剂次，用于编辑页标记「已打」 */
function getDoseMap(babyId) {
  const map = {};
  getVaccineRecords(babyId).forEach(function (r) {
    map[r.vaccineId + '#' + r.dose] = r;
  });
  return map;
}

/* ---------------- 自定义疫苗（二类自费，本地添加） ---------------- */
// 结构：{ id, name, short, category: 'paid', doses: 剂次数, note, custom: true, createdAt }

function getCustomVaccines() {
  const list = ctx.read(ctx.KEYS.customVaccines, []);
  return Array.isArray(list) ? list : [];
}

function saveCustomVaccines(list) {
  return ctx.write(ctx.KEYS.customVaccines, list || []);
}

function getCustomVaccine(id) {
  const list = getCustomVaccines();
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

/**
 * 新增自定义疫苗
 * @param {Object} input { name, short, doses, note }
 */
function addCustomVaccine(input) {
  const d = input || {};
  const name = String(d.name || '').trim();
  if (!name) return null;

  const total = Math.max(1, Math.min(6, Number(d.doses) || 1));
  const item = {
    id: ctx.uid('cv'),
    name: name,
    short: String(d.short || '').trim() || name.slice(0, 6),
    category: 'paid',
    doses: total,
    note: String(d.note || '').trim(),
    custom: true,
    createdAt: Date.now()
  };

  const list = getCustomVaccines();
  list.push(item);
  saveCustomVaccines(list);
  return item;
}

/** 删除自定义疫苗，连带清掉用它的接种记录；返回 { removed, records } */
function removeCustomVaccine(id) {
  const list = getCustomVaccines().filter(function (v) {
    return v.id !== id;
  });
  saveCustomVaccines(list);

  const kept = getAllVaccineRecords().filter(function (r) {
    return r.vaccineId !== id;
  });
  const records = getAllVaccineRecords().length - kept.length;
  if (records) ctx.write(ctx.KEYS.vaccineRecords, kept);

  return { removed: true, records: records };
}

/* ---------------- 免疫规划表里被移除的项 ---------------- */
// 存 key 数组，key 形如 'polio#2'。用于「已打过五联 / 医生说不打 / 外地打过了」这类情况

function getPlanHidden() {
  const list = ctx.read(ctx.KEYS.planHidden, []);
  return Array.isArray(list) ? list : [];
}

function setPlanHidden(list) {
  return ctx.write(ctx.KEYS.planHidden, list || []);
}

function hidePlanItem(key) {
  const list = getPlanHidden();
  if (list.indexOf(key) === -1) {
    list.push(key);
    setPlanHidden(list);
  }
  return list;
}

function unhidePlanItem(key) {
  const list = getPlanHidden().filter(function (k) {
    return k !== key;
  });
  setPlanHidden(list);
  return list;
}

function clearPlanHidden() {
  setPlanHidden([]);
  return [];
}

Object.assign(ctx, {
  getAllVaccineRecords: getAllVaccineRecords,
  getVaccineRecords: getVaccineRecords,
  newVaccineRecordId: newVaccineRecordId,
  upsertVaccineRecord: upsertVaccineRecord,
  removeVaccineRecord: removeVaccineRecord,
  getDoseMap: getDoseMap,
  getCustomVaccines: getCustomVaccines,
  saveCustomVaccines: saveCustomVaccines,
  getCustomVaccine: getCustomVaccine,
  addCustomVaccine: addCustomVaccine,
  removeCustomVaccine: removeCustomVaccine,
  getPlanHidden: getPlanHidden,
  setPlanHidden: setPlanHidden,
  hidePlanItem: hidePlanItem,
  unhidePlanItem: unhidePlanItem,
  clearPlanHidden: clearPlanHidden
});

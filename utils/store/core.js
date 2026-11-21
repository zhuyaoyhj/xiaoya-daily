// utils/store/core.js —— 基础：存储键、读写（写入时记墓碑 / 改动计数 / 写满提示）、全局唯一 id
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');

const KEYS = {
  babies: 'xyd_babies',
  settings: 'xyd_settings',
  weatherCache: 'xyd_weather_cache',
  vaccineRecords: 'xyd_vaccine_records',
  customVaccines: 'xyd_custom_vaccines',
  planHidden: 'xyd_plan_hidden',
  foodRecords: 'xyd_food_records',
  customFoods: 'xyd_custom_foods',
  foodHidden: 'xyd_food_hidden',
  menuSwap: 'xyd_menu_swap',
  mealLogs: 'xyd_meal_logs',
  // 照护记录（喂奶/睡眠/尿布）按月分片存：xyd_care_YYYYMM；这里只放索引和进行中的计时
  careIndex: 'xyd_care_index',
  careActive: 'xyd_care_active',
  // 身高体重的每次测量 [{ id, babyId, date, weight, height, by, createdAt, updatedAt }]
  growth: 'xyd_growth',
  // 删除墓碑 { 记录 id: 删除时间 }：合并导入 / 云同步时用来区分「别人删了」和「我这边新加的」
  tombstones: 'xyd_tombstones',
  // 云同步状态 { familyId, code, rev, lastSyncAt }
  sync: 'xyd_sync'
};

const CARE_PREFIX = 'xyd_care_';

const DEFAULT_SETTINGS = {
  activeBabyId: '',
  place: null, // 当前生效地点 { city, district, community, lat, lon, source }
  places: [], // 常用地点 [{ id, label, ...place }]
  activePlaceId: '',
  family: [],
  pushTargets: [],
  subscribeEnabled: false,
  lastPushAt: 0,
  manualTemp: null, // 手动温度 { temp, date }：取不到天气时由用户自己填，只在当天有效
  lastBackupAt: 0, // 上次导出备份的时间
  lastChangeAt: 0, // 记录类数据最后一次变动的时间
  changeSeq: 0, // 记录类数据的改动计数（比时间戳可靠：同一毫秒里备份又记一笔也分得清）
  backupSeq: 0, // 备份那一刻的 changeSeq
  backupNudgeAt: 0, // 上次在首页提醒备份的时间（同一条提醒一周最多出现一次）
  me: '', // 这台手机是谁在记（家人名单里的 id），记录会带上
  onboarded: false, // 是否走完首次引导
  weeklySeen: '' // 看过的那一周小结（周一日期），看过就不再标「新」
};

function read(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || v === undefined) return fallback;
    return v;
  } catch (e) {
    return fallback;
  }
}

/**
 * 写入失败（多半是手机给小程序的 10MB 存储满了）：一定要让用户知道，
 * 否则点了保存、实际没存上，用户毫无察觉。一分钟内只提示一次
 */
let lastFailTip = 0;
function notifyWriteFail(e) {
  const now = Date.now();
  if (now - lastFailTip < 60000) return;
  lastFailTip = now;
  const full = /exceed|limit|full|空间|storage/i.test(String((e && (e.errMsg || e.message)) || ''));
  try {
    wx.showModal({
      title: '没有存上',
      content: full
        ? '手机给小程序的存储空间满了。可以先在「我的」导出备份文件，再删掉不需要的宝宝或旧记录。'
        : '这次没有保存成功，请稍后再试一次。',
      showCancel: false,
      confirmText: '知道了'
    });
  } catch (err) {
    // 连弹窗都弹不出来就算了
  }
}

/** 这些 key 变了，说明有「值得备份」的新数据 */
function isRecordKey(key) {
  return (
    key === KEYS.babies ||
    key === KEYS.vaccineRecords ||
    key === KEYS.foodRecords ||
    key === KEYS.mealLogs ||
    key === KEYS.growth ||
    String(key).indexOf(CARE_PREFIX) === 0 && key !== KEYS.careActive && key !== KEYS.careIndex
  );
}

/** 列表类 key：写入时对比前后，消失的 id 记一条墓碑 */
function isListKey(key) {
  return (
    key === KEYS.babies ||
    key === KEYS.vaccineRecords ||
    key === KEYS.foodRecords ||
    key === KEYS.mealLogs ||
    key === KEYS.growth ||
    key === KEYS.customVaccines ||
    key === KEYS.customFoods ||
    (String(key).indexOf(CARE_PREFIX) === 0 && key !== KEYS.careActive && key !== KEYS.careIndex)
  );
}

function idsOf(list) {
  const out = {};
  (Array.isArray(list) ? list : []).forEach(function (r) {
    if (r && r.id) out[r.id] = true;
  });
  return out;
}

function write(key, value) {
  try {
    if (isListKey(key) && !write._silent) {
      const before = idsOf(read(key, []));
      const after = idsOf(value);
      const gone = Object.keys(before).filter(function (id) {
        return !after[id];
      });
      // 跨月改时间会先从旧分片删、再写进新分片：这种「搬家」由 upsertCare 自己清掉墓碑
      if (gone.length) ctx.addTombstones(gone);
    }
    wx.setStorageSync(key, value);
    if (isRecordKey(key) && !write._silent) ctx.markChanged();
    return true;
  } catch (e) {
    console.warn('[store] 写入失败', key, e && e.message);
    notifyWriteFail(e);
    return false;
  }
}

/**
 * 全局唯一 id：时间（36 进制）+ 本机序号 + 8 位随机。
 * 以前是「时间戳 + 0~99 随机数」，单机够用；有了合并导入和家庭同步后，
 * 两台手机同一毫秒各建一条（比如同时添加家人）会撞 id，合并时一条吞掉另一条。
 */
let uidSeq = 0;
function uid(prefix) {
  uidSeq = (uidSeq + 1) % 1296;
  let r = '';
  for (let i = 0; i < 8; i++) r += Math.floor(Math.random() * 36).toString(36);
  return prefix + Date.now().toString(36) + uidSeq.toString(36) + r;
}

Object.assign(ctx, {
  KEYS: KEYS,
  CARE_PREFIX: CARE_PREFIX,
  DEFAULT_SETTINGS: DEFAULT_SETTINGS,
  read: read,
  lastFailTip: lastFailTip,
  notifyWriteFail: notifyWriteFail,
  isRecordKey: isRecordKey,
  isListKey: isListKey,
  idsOf: idsOf,
  write: write,
  uidSeq: uidSeq,
  uid: uid
});

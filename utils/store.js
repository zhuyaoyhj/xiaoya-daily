// utils/store.js —— 本地存储的唯一入口（门面）
//
// 实现按领域拆在 utils/store/ 下：
//   core 基础读写 · track 变更追踪 · settings 设置/地点/家人 · baby 宝宝档案 · manual-temp 手动温度
//   vaccine 疫苗 · food 辅食 · meal 进食 · growth 身高体重 · care 喂睡尿 · backup 备份与合并
// 页面和 utils 只 require 这个文件，对外接口和拆分前完全一样。
// 加载顺序：core 必须最先（其他模块加载时会读 ctx.KEYS 等常量）。

const ctx = require('./store/ctx.js');
require('./store/core.js');
require('./store/track.js');
require('./store/settings.js');
require('./store/baby.js');
require('./store/manual-temp.js');
require('./store/vaccine.js');
require('./store/food.js');
require('./store/meal.js');
require('./store/growth.js');
require('./store/care.js');
require('./store/backup.js');

const read = ctx.read;
const write = ctx.write;

module.exports = {
  KEYS: ctx.KEYS,
  RELATIONS: ctx.RELATIONS,
  getBabies: ctx.getBabies,
  saveBabies: ctx.saveBabies,
  getBaby: ctx.getBaby,
  upsertBaby: ctx.upsertBaby,
  removeBaby: ctx.removeBaby,
  newBabyId: ctx.newBabyId,
  getActiveBaby: ctx.getActiveBaby,
  setActiveBabyId: ctx.setActiveBabyId,
  getSettings: ctx.getSettings,
  updateSettings: ctx.updateSettings,
  getManualTemp: ctx.getManualTemp,
  setManualTemp: ctx.setManualTemp,
  clearManualTemp: ctx.clearManualTemp,
  exportBackup: ctx.exportBackup,
  parseBackup: ctx.parseBackup,
  importBackup: ctx.importBackup,
  localStats: ctx.localStats,
  snapshot: ctx.snapshot,
  applySnapshot: ctx.applySnapshot,
  markBackedUp: ctx.markBackedUp,
  backupReminder: ctx.backupReminder,
  dismissBackupReminder: ctx.dismissBackupReminder,
  getTombstones: ctx.getTombstones,
  uid: ctx.uid,
  changedSinceBackup: ctx.changedSinceBackup,
  getMe: ctx.getMe,
  setMe: ctx.setMe,
  getAllGrowth: ctx.getAllGrowth,
  getGrowth: ctx.getGrowth,
  upsertGrowth: ctx.upsertGrowth,
  removeGrowth: ctx.removeGrowth,
  migrateGrowth: ctx.migrateGrowth,
  getSync: function () {
    const v = ctx.read(ctx.KEYS.sync, null);
    return v && typeof v === 'object' ? v : null;
  },
  setSync: function (v) {
    return ctx.write(ctx.KEYS.sync, v || '');
  },
  getPlace: ctx.getPlace,
  savePlace: ctx.savePlace,
  getPlaces: ctx.getPlaces,
  addPlace: ctx.addPlace,
  activatePlace: ctx.activatePlace,
  removePlace: ctx.removePlace,
  getFamily: ctx.getFamily,
  saveFamily: ctx.saveFamily,
  addFamilyMember: ctx.addFamilyMember,
  removeFamilyMember: ctx.removeFamilyMember,
  getPushTargets: ctx.getPushTargets,
  togglePushTarget: ctx.togglePushTarget,
  getWeatherCache: ctx.getWeatherCache,
  setWeatherCache: ctx.setWeatherCache,
  getAllVaccineRecords: ctx.getAllVaccineRecords,
  getVaccineRecords: ctx.getVaccineRecords,
  newVaccineRecordId: ctx.newVaccineRecordId,
  upsertVaccineRecord: ctx.upsertVaccineRecord,
  removeVaccineRecord: ctx.removeVaccineRecord,
  getDoseMap: ctx.getDoseMap,
  getCustomVaccines: ctx.getCustomVaccines,
  saveCustomVaccines: ctx.saveCustomVaccines,
  getCustomVaccine: ctx.getCustomVaccine,
  addCustomVaccine: ctx.addCustomVaccine,
  removeCustomVaccine: ctx.removeCustomVaccine,
  getPlanHidden: ctx.getPlanHidden,
  setPlanHidden: ctx.setPlanHidden,
  hidePlanItem: ctx.hidePlanItem,
  unhidePlanItem: ctx.unhidePlanItem,
  clearPlanHidden: ctx.clearPlanHidden,
  // 辅食
  FOOD_GROUPS: ctx.FOOD_GROUPS,
  getAllFoodRecords: ctx.getAllFoodRecords,
  getFoodRecords: ctx.getFoodRecords,
  newFoodRecordId: ctx.newFoodRecordId,
  upsertFoodRecord: ctx.upsertFoodRecord,
  removeFoodRecord: ctx.removeFoodRecord,
  getFirstTryMap: ctx.getFirstTryMap,
  getCustomFoods: ctx.getCustomFoods,
  saveCustomFoods: ctx.saveCustomFoods,
  getCustomFood: ctx.getCustomFood,
  addCustomFood: ctx.addCustomFood,
  removeCustomFood: ctx.removeCustomFood,
  getRawFoodHidden: ctx.getRawFoodHidden,
  getFoodHidden: ctx.getFoodHidden,
  hideFood: ctx.hideFood,
  unhideFood: ctx.unhideFood,
  clearFoodHidden: ctx.clearFoodHidden,
  getAllMenuSwap: ctx.getAllMenuSwap,
  getMenuSwap: ctx.getMenuSwap,
  setMenuSwap: ctx.setMenuSwap,
  clearMenuSwap: ctx.clearMenuSwap,
  // 进食流水账
  MEAL_SLOTS: ctx.MEAL_SLOTS,
  LOG_LIMIT_PER_BABY: ctx.LOG_LIMIT_PER_BABY,
  getAllMealLogs: ctx.getAllMealLogs,
  getMealLogs: ctx.getMealLogs,
  getMealLogsByDate: ctx.getMealLogsByDate,
  getMealLog: ctx.getMealLog,
  newMealLogId: ctx.newMealLogId,
  normalizeMealLog: ctx.normalizeMealLog,
  upsertMealLog: ctx.upsertMealLog,
  removeMealLog: ctx.removeMealLog,
  trimMealLogs: ctx.trimMealLogs,
  // 照护记录
  CARE_PREFIX: ctx.CARE_PREFIX,
  monthKeyOf: ctx.monthKeyOf,
  getCareIndex: ctx.getCareIndex,
  getCareShard: ctx.getCareShard,
  getCareEntry: ctx.getCareEntry,
  upsertCare: ctx.upsertCare,
  removeCare: ctx.removeCare,
  getCareRange: ctx.getCareRange,
  getLatestCare: ctx.getLatestCare,
  getCareActive: ctx.getCareActive,
  setCareActive: ctx.setCareActive,
  removeCareOfBaby: ctx.removeCareOfBaby
};
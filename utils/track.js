// utils/track.js —— 关键动作埋点
// 只上报「做了什么动作」，不上报记录内容（名字、时间、食材、便便颜色等一律不带）。
// 底层用微信自带的 wx.reportEvent（需在小程序后台「数据分析 → 自定义分析」里建同名事件）；
// 没有该接口（开发者工具旧版、测试环境）时静默。
//
// 事件名统一 xyd_ 前缀，参数只允许下面白名单里的字段。

const EVENTS = {
  baby_add: ['preterm'],
  care_log: ['type', 'via'], // type: feed/sleep/diaper，via: timer/quick/backfill
  meal_log: ['via'], // via: suggest/manual/copy
  food_try: [],
  vax_log: ['via'], // via: remind/plan/manual
  backup_export: ['method'], // file/clipboard
  backup_import: ['method', 'mode'], // mode: merge/replace
  share_card: ['from'],
  remind_tap: ['kind'], // vax/backup
  onboard_step: ['step'],
  sync_join: [],
  weekly_open: []
};

const sent = [];

function track(name, params) {
  const allow = EVENTS[name];
  if (!allow) {
    console.warn('[track] 未登记的事件：' + name);
    return false;
  }
  const clean = {};
  allow.forEach(function (k) {
    if (params && params[k] !== undefined && params[k] !== null) {
      const v = params[k];
      clean[k] = typeof v === 'number' || typeof v === 'boolean' ? v : String(v).slice(0, 20);
    }
  });
  sent.push({ name: name, params: clean });
  if (sent.length > 50) sent.shift();
  try {
    if (typeof wx !== 'undefined' && typeof wx.reportEvent === 'function') {
      wx.reportEvent('xyd_' + name, clean);
    }
  } catch (e) {
    // 埋点失败不能影响业务
  }
  return true;
}

module.exports = {
  EVENTS: EVENTS,
  track: track,
  /** 测试用：最近上报过的事件 */
  _sent: sent
};

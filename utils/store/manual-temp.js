// utils/store/manual-temp.js —— 手动温度（天气取不到时的兜底，只在当天有效）
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');

/* ---------------- 手动温度（天气兜底） ---------------- */

function todayStr() {
  const d = new Date();
  const p = function (n) {
    return n < 10 ? '0' + n : '' + n;
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** 今天手动填过的温度；跨天自动失效，返回 null */
function getManualTemp() {
  const m = ctx.getSettings().manualTemp;
  if (!m || typeof m.temp !== 'number' || !isFinite(m.temp)) return null;
  if (m.date !== todayStr()) return null;
  return m.temp;
}

function setManualTemp(temp) {
  const t = Number(temp);
  if (!isFinite(t)) return ctx.updateSettings({ manualTemp: null });
  return ctx.updateSettings({ manualTemp: { temp: Math.round(t), date: todayStr() } });
}

function clearManualTemp() {
  return ctx.updateSettings({ manualTemp: null });
}

Object.assign(ctx, {
  todayStr: todayStr,
  getManualTemp: getManualTemp,
  setManualTemp: setManualTemp,
  clearManualTemp: clearManualTemp
});

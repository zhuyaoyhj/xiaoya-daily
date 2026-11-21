#!/usr/bin/env node
/**
 * tools/test-p0.js —— P0 体验改造的冒烟测试
 * 用法：node tools/test-p0.js
 * 覆盖：手动温度（跨天失效 / 兜底穿衣）、备份导出导入、首页「记一笔」与最近记录、
 *       天气页无地点 / 失败时的手动兜底、真下拉刷新、伪按钮修复、开发者文案清理、体重身高校验
 */

const path = require('path');
const fs = require('fs');

/* ---------- stub 运行时 ---------- */
const mem = {};
let lastToast = '';
let lastNav = '';
let lastModal = '';
let clipboard = '';
let stopCount = 0;
const globalData = { tmplIds: [], openManualTemp: false };

global.getApp = function () {
  return { globalData: globalData };
};
global.getCurrentPages = function () {
  return [{}, {}];
};
global.wx = {
  getStorageSync: function (k) {
    return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : '';
  },
  setStorageSync: function (k, v) {
    mem[k] = v === '' ? '' : JSON.parse(JSON.stringify(v));
  },
  navigateTo: function (o) {
    lastNav = o.url;
  },
  navigateBack: function () {
    lastNav = 'back';
  },
  switchTab: function (o) {
    lastNav = 'tab:' + o.url;
  },
  redirectTo: function (o) {
    lastNav = o.url;
  },
  showToast: function (o) {
    lastToast = o.title;
  },
  showModal: function (o) {
    lastModal = (o.title || '') + '|' + (o.content || '');
    if (o.success) o.success({ confirm: true });
  },
  setClipboardData: function (o) {
    clipboard = o.data;
    if (o.success) o.success();
  },
  getClipboardData: function (o) {
    if (o.success) o.success({ data: clipboard });
  },
  setNavigationBarTitle: function () {},
  stopPullDownRefresh: function () {
    stopCount++;
  },
  // 天气请求一律失败：模拟「云函数没部署 + 域名没配」的真实首装环境
  request: function (o) {
    if (o.fail) o.fail(new Error('NET_FAIL'));
  },
  cloud: undefined
};

let captured = null;
global.Page = function (cfg) {
  captured = cfg;
};

const ROOT = path.resolve(__dirname, '..');

function mount(rel) {
  captured = null;
  const full = path.join(ROOT, rel);
  delete require.cache[require.resolve(full)];
  require(full);
  return captured;
}

function instance(cfg) {
  const inst = Object.assign({}, cfg);
  inst.data = JSON.parse(JSON.stringify(cfg.data || {}));
  inst.setData = function (patch) {
    const self = this;
    Object.keys(patch).forEach(function (k) {
      if (k.indexOf('.') > -1) {
        const parts = k.split('.');
        let t = self.data;
        for (let i = 0; i < parts.length - 1; i++) t = t[parts[i]];
        t[parts[parts.length - 1]] = patch[k];
      } else {
        self.data[k] = patch[k];
      }
    });
  };
  return inst;
}

const store = require(path.join(ROOT, 'utils/store.js'));
const timeline = require(path.join(ROOT, 'utils/timeline.js'));
const weatherApi = require(path.join(ROOT, 'utils/weather.js'));

let pass = 0;
let fail = 0;
function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    console.log('  ✗ ' + label);
  }
}
function eq(a, b, label) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  ok(x === y, label + (x === y ? '' : '\n      期望 ' + y + '\n      实际 ' + x));
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
const now = new Date();
const TODAY = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
// 日期一律相对今天：原来写死 2025-12-08 出生，月龄每个月都在变
const fixtures = require('./fixtures.js');
const BIRTH11 = fixtures.birthdayForAge(11, 11);
const shiftDate = require(path.join(ROOT, 'utils/date.js')).shiftDate;

function tick() {
  return new Promise(function (r) {
    setTimeout(r, 0);
  });
}

(async function main() {
  /* ================= 1. 手动温度 ================= */
  console.log('\n[1] 手动温度');
  eq(store.getManualTemp(), null, '默认没有手动温度');
  store.setManualTemp(12.4);
  eq(store.getManualTemp(), 12, '写入后取回（四舍五入）');
  store.updateSettings({ manualTemp: { temp: 5, date: '2000-01-01' } });
  eq(store.getManualTemp(), null, '不是今天的手动温度自动失效');
  store.setManualTemp('abc');
  eq(store.getManualTemp(), null, '非数字不会写入');
  store.clearManualTemp();
  eq(store.getManualTemp(), null, '清除后为空');

  const m = weatherApi.buildManual(18, null);
  ok(m.manual === true && m.source === 'manual', 'buildManual 标记为手动');
  eq(m.feelsLike, 18, '体感温度 = 填写温度');
  eq(m.place, null, '没地点时 place 为空');
  eq(weatherApi.QUICK_TEMPS.length, 5, '提供 5 个温度快捷档');

  /* ================= 2. 天气页：无地点也能出建议 ================= */
  console.log('\n[2] 天气页 · 没设地点');
  store.saveBabies([{ id: 'b1', name: '小芽', birthday: BIRTH11, gender: 'girl' }]);
  store.updateSettings({ activeBabyId: 'b1' });

  let wp = instance(mount('pages/weather/weather.js'));
  wp.onShow();
  await tick();
  eq(wp.data.state, 'no-place', '没地点没手动温度 → no-place');

  wp.openManual();
  ok(wp.data.showManual, '打开手动温度浮层');
  wp.setData({ manualInput: '' });
  wp.submitManual();
  ok(/数字/.test(lastToast), '空输入提示填数字');
  wp.setData({ manualInput: '80' });
  wp.submitManual();
  ok(/-30 ~ 45/.test(lastToast), '超范围温度被拦下');
  wp.setData({ manualInput: '6' });
  wp.submitManual();
  eq(wp.data.state, 'ok', '填温度后直接出建议');
  ok(wp.data.manual, '标记为手动结果');
  ok(!!wp.data.care && !!wp.data.care.headline, '穿衣建议有内容');
  ok(!!wp.data.care.sleep && !!wp.data.care.sleep.tog, '睡袋 TOG 有结果');
  ok(!wp.data.showManual, '提交后浮层关闭');
  eq(store.getManualTemp(), 6, '手动温度已持久化');

  wp = instance(mount('pages/weather/weather.js'));
  wp.onShow();
  await tick();
  eq(wp.data.state, 'ok', '再次进入天气页沿用今天的手动温度');

  wp.pickQuick({ currentTarget: { dataset: { temp: 26 } } });
  eq(store.getManualTemp(), 26, '快捷档可以直接选');

  /* ================= 3. 天气页：取数失败兜底 ================= */
  console.log('\n[3] 天气页 · 有地点但取不到');
  store.clearManualTemp();
  store.savePlace({ city: '北京市', district: '朝阳区', lat: 39.92, lon: 116.48, source: 'district' });
  wp = instance(mount('pages/weather/weather.js'));
  wp.onShow();
  await tick();
  await tick();
  eq(wp.data.state, 'error', '网络失败 → error 态');

  stopCount = 0;
  await wp.onPullDownRefresh();
  await tick();
  eq(stopCount, 1, '下拉刷新在请求结束后才收起（只调用一次）');

  store.setManualTemp(10);
  wp.onShow();
  await tick();
  eq(wp.data.state, 'ok', '有手动温度时优先使用，不再卡在 error');
  ok(wp.data.manual, '结果来自手动温度');

  /* 首页跳转时自动打开浮层（天气已不是 tab，用 url 参数） */
  wp = instance(mount('pages/weather/weather.js'));
  wp.onLoad({ manual: '1' });
  wp.onShow();
  ok(wp.data.showManual, '从首页「填温度」进入时自动弹出浮层');
  wp.closeManual();
  wp.onShow();
  ok(!wp.data.showManual, '只弹一次，再次 onShow 不重复弹');

  /* ================= 4. 首页：记一笔 + 最近记录 + 手动天气 ================= */
  console.log('\n[4] 首页');
  store.upsertMealLog({ babyId: 'b1', date: TODAY, slot: 'noon', foods: ['rice_cereal'], accept: 'love' });
  store.upsertFoodRecord({ babyId: 'b1', foodId: 'rice_cereal', date: TODAY, reaction: 'none' });
  store.upsertVaccineRecord({ babyId: 'b1', vaccineId: 'hepb', dose: 2, date: shiftDate(BIRTH11, 31) });

  let ip = instance(mount('pages/index/index.js'));
  ip.onShow();
  await tick();
  eq(ip.data.recent.length, 2, '首页最近记录只留 2 条（更多在「记录」tab）');
  eq(timeline.recent('b1', 3)[2].kind, 'vax', '三类合并，日期最早的接种排最后');
  eq(ip.data.recent[0].when, '今天', '今天的记录显示「今天」');
  ok(/午餐/.test(ip.data.recent.map(function (r) { return r.title; }).join()), '进食记录带餐次');
  ok(/强化铁米粉/.test(JSON.stringify(ip.data.recent)), '记录里带出食材名');
  eq(ip.data.weatherState, 'ok', '首页天气用手动温度兜底');
  ok(ip.data.manualTemp, '首页标出手动温度');

  ip.goMealLog();
  eq(lastNav, '/pages/meal-log/meal-log', '记一餐直达 meal-log');
  ip.goFoodEdit();
  eq(lastNav, '/pages/food-edit/food-edit', '试新食材直达 food-edit');
  ip.goVaccineEdit();
  eq(lastNav, '/pages/vaccine-edit/vaccine-edit', '记接种直达 vaccine-edit');
  ip.goFood();
  eq(lastNav, '/pages/food/food', '辅食本是普通页，navigateTo');
  ip.goRecord();
  eq(lastNav, 'tab:/pages/record/record', '全部记录是 tab，switchTab');
  ip.openRecord({ currentTarget: { dataset: { open: '/pages/meal-log/meal-log?id=x1' } } });
  eq(lastNav, '/pages/meal-log/meal-log?id=x1', '点记录进入编辑（地址由时间线给出）');
  ip.goManualTemp();
  eq(lastNav, '/pages/weather/weather?manual=1', '填温度：navigateTo 天气页并带 manual 参数');
  ip.goWeather();
  eq(lastNav, '/pages/weather/weather', '天气详情 navigateTo');
  ip.goFamily();
  eq(lastNav, '/pages/family/family', '家人页 navigateTo');

  stopCount = 0;
  ip.onPullDownRefresh();
  await tick();
  await tick();
  eq(stopCount, 1, '首页下拉刷新在加载完成后收起');

  /* ================= 5. 备份导出 / 导入 ================= */
  console.log('\n[5] 备份');
  const stats = store.localStats();
  eq(stats, { babies: 1, vaccine: 1, food: 1, meals: 1, growth: 0, care: 0 }, '本机统计正确');

  const text = store.exportBackup();
  ok(text.indexOf('XYD1:') === 0, '备份带格式前缀');
  ok(text.indexOf('xyd_weather_cache') === -1 && text.indexOf('weatherCache') === -1, '天气缓存不进备份');

  // 模拟换手机：清空
  Object.keys(mem).forEach(function (k) {
    delete mem[k];
  });
  eq(store.getBabies().length, 0, '清空后没有宝宝');

  let threw = false;
  try {
    store.parseBackup('随便一段文字');
  } catch (e) {
    threw = true;
  }
  ok(threw, '非备份文本被拒绝');
  eq(store.getBabies().length, 0, '解析失败不写任何数据');

  const parsed = store.importBackup(text);
  eq(parsed.stats.meals, 1, '导入返回统计');
  eq(store.getBabies()[0].name, '小芽', '宝宝恢复');
  eq(store.getMealLogs('b1').length, 1, '进食记录恢复');
  eq(store.getFoodRecords('b1').length, 1, '辅食记录恢复');
  eq(store.getVaccineRecords('b1').length, 1, '接种记录恢复');
  eq(store.getSettings().activeBabyId, 'b1', '设置恢复');

  /* 「我的」页的备份按钮 */
  const mp = instance(mount('pages/mine/mine.js'));
  mp.onShow();
  ok(mp.data.hasData, '我的页识别到有数据');
  clipboard = '';
  mp.exportData();
  ok(clipboard.indexOf('XYD1:') === 0, '导出写入剪贴板');
  Object.keys(mem).forEach(function (k) {
    delete mem[k];
  });
  mp.importData();
  ok(/已合并/.test(lastModal) && /新加了/.test(lastModal), '本机是空的：直接合并并告诉用户加了几条');
  eq(store.getBabies().length, 1, '确认后完成恢复');
  clipboard = 'hello';
  mp.importData();
  ok(/没找到备份/.test(lastModal), '剪贴板不是备份时友好提示');

  const fp = instance(mount('pages/family/family.js'));
  fp.onShow();
  ok(typeof fp.exportData === 'undefined', '备份已从家人页移走，只保留在「我的」');

  /* 未配置模板时不再出现开发者术语 */
  fp.enableSubscribe();
  ok(!/app\.js|模板 ?ID|公众平台/.test(lastModal), '订阅兜底弹窗没有开发者术语');

  /* ================= 6. 宝宝档案校验 ================= */
  console.log('\n[6] 宝宝档案');
  const bp = instance(mount('pages/baby-edit/baby-edit.js'));
  bp.onLoad({ id: 'b1' });
  bp.setData({ 'baby.weight': '85' });
  bp.save();
  ok(/体重/.test(lastToast), '体重超范围被拦下');
  bp.setData({ 'baby.weight': '8.5', 'baby.height': '7' });
  bp.save();
  ok(/身高/.test(lastToast), '身高超范围被拦下');
  bp.setData({ 'baby.height': '70' });
  bp.save();
  eq(store.getBaby('b1').weight, '8.5', '合法值保存成功');

  /* ================= 6.5 分享卡片 ================= */
  console.log('\n[6.5] 分享卡片');
  const shareCfg = mount('pages/share/share.js');
  const sp = instance(shareCfg);
  sp.months = 11;
  sp.renderCard = function () {};
  sp.data.cardData = { babyName: '小芽', dateText: '', ageText: '', tips: [] };
  store.setManualTemp(3);
  sp.loadWeather();
  await tick();
  ok(!!sp.data.cardData.clothing && !!sp.data.cardData.clothing.headline, '有手动温度时卡片带穿衣建议');
  eq(sp.data.cardData.weather.city, '今日气温', '手动温度不冒充地点');
  store.clearManualTemp();
  const sp2 = instance(shareCfg);
  sp2.months = 11;
  sp2.renderCard = function () {};
  sp2.data.cardData = { babyName: '小芽' };
  sp2.loadWeather();
  await tick();
  await tick();
  ok(/取不到/.test(sp2.data.weatherNote), '网络失败不再误报「没设置地点」');

  /* ================= 7. 静态：开发者文案 & 伪按钮 ================= */
  console.log('\n[7] 文案与按钮');
  const DEV_WORDS = /云函数|合法域名|地图 ?Key|模板 ?ID|app\.js|开发者工具|公众平台/;
  ['index', 'weather', 'place', 'family', 'share', 'baby-edit'].forEach(function (p) {
    const wxml = fs.readFileSync(path.join(ROOT, 'pages', p, p + '.wxml'), 'utf8');
    ok(!DEV_WORDS.test(wxml), p + '.wxml 没有面向开发者的文案');
  });
  const fe = fs.readFileSync(path.join(ROOT, 'pages/food-edit/food-edit.wxml'), 'utf8');
  ok(/class="pick-name" bindtap="openSheet"/.test(fe), 'food-edit「可以自己加」可点击');
  const ve = fs.readFileSync(path.join(ROOT, 'pages/vaccine-edit/vaccine-edit.wxml'), 'utf8');
  ok(/class="pick-name"[^>]*bindtap="openSheet"/.test(ve), 'vaccine-edit「可以自己加」可点击');
  ['index', 'weather'].forEach(function (p) {
    const js = fs.readFileSync(path.join(ROOT, 'pages', p, p + '.js'), 'utf8');
    ok(!/setTimeout\(function \(\) \{\s*wx\.stopPullDownRefresh/.test(js), p + ' 不再用定时器假装刷新');
  });

  console.log('\n========================================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log('========================================\n');
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});

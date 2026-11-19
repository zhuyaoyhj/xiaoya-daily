#!/usr/bin/env node
/**
 * tools/test-nav.js —— 导航结构测试
 * 用法：node tools/test-nav.js
 * 覆盖：
 *   1. app.json：tab = 今日/记录/疫苗/我的，图标文件存在且为 81×81 PNG
 *   2. 跳转方式正确：到 tab 页必须 switchTab，到非 tab 页必须 navigateTo/redirectTo（扫描全部页面 js）
 *   3. 每个页面距 tab ≤ 1 层（按跳转关系做 BFS）
 *   4. 「我的」页：集中设置入口
 *   5. 首页一键记一餐 + meal-log「同上一餐」
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

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

const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
const tabs = app.tabBar.list.map(function (t) {
  return t.pagePath;
});

/* ================= 1. tabBar ================= */
console.log('\n[1] tabBar');
eq(
  app.tabBar.list.map(function (t) {
    return t.text;
  }),
  ['今日', '记录', '疫苗', '我的'],
  'tab 文案按任务划分'
);
eq(tabs, ['pages/index/index', 'pages/record/record', 'pages/vaccine/vaccine', 'pages/mine/mine'], 'tab 页面');
ok(tabs.indexOf('pages/food/food') === -1, '辅食退到记录页下一层，不占 tab');
ok(tabs.indexOf('pages/weather/weather') === -1, '天气穿衣不再占 tab');
ok(tabs.indexOf('pages/family/family') === -1, '带娃人不再占 tab');
eq(app.pages[0], 'pages/index/index', '首页仍是启动页');

app.tabBar.list.forEach(function (t) {
  [t.iconPath, t.selectedIconPath].forEach(function (p) {
    const full = path.join(ROOT, p || '');
    const exists = !!p && fs.existsSync(full);
    ok(exists, t.text + ' 图标存在：' + p);
    if (!exists) return;
    const buf = fs.readFileSync(full);
    const isPng = buf.slice(1, 4).toString() === 'PNG';
    const w = buf.readUInt32BE(16);
    const h = buf.readUInt32BE(20);
    ok(isPng && w === 81 && h === 81, '  ' + p + ' 为 81×81 PNG');
    ok(buf.length <= 40 * 1024, '  ' + p + ' 小于 40KB（微信限制）');
  });
});

/* ================= 2. 跳转方式 ================= */
console.log('\n[2] 跳转方式');
const pageDirs = app.pages.map(function (p) {
  return p;
});
const edges = {}; // from -> [to]
const wrong = [];
/** 页面源码 + 通过 xxx.methods 混入的共享模块源码（混入里的跳转也算这个页面的） */
function pageSource(p) {
  const file = path.join(ROOT, p + '.js');
  let js = fs.readFileSync(file, 'utf8');
  const mixRe = /const\s+(\w+)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let mx;
  while ((mx = mixRe.exec(js))) {
    if (!new RegExp('\\b' + mx[1] + '\\.methods\\b').test(js)) continue;
    const mod = path.resolve(path.dirname(file), /\.js$/.test(mx[2]) ? mx[2] : mx[2] + '.js');
    if (fs.existsSync(mod)) js += '\n' + fs.readFileSync(mod, 'utf8');
  }
  return js;
}

pageDirs.forEach(function (p) {
  const js = pageSource(p);
  edges[p] = [];
  const re = /wx\.(navigateTo|switchTab|redirectTo|reLaunch)\(\{\s*url:\s*['"]\/([a-z\-]+\/[a-z\-]+\/[a-z\-]+)/g;
  let m;
  while ((m = re.exec(js))) {
    const api = m[1];
    const target = m[2];
    edges[p].push(target);
    const isTab = tabs.indexOf(target) > -1;
    if (isTab && (api === 'navigateTo' || api === 'redirectTo')) wrong.push(p + ' → ' + target + '（tab 页不能 ' + api + '）');
    if (!isTab && api === 'switchTab') wrong.push(p + ' → ' + target + '（非 tab 页不能 switchTab）');
  }
  // 拼接 url 的 navigateTo（如 '/pages/meal-log/meal-log?...' + x）也算边
  const re2 = /url:\s*\n?\s*['"]\/([a-z\-]+\/[a-z\-]+\/[a-z\-]+)\?/g;
  while ((m = re2.exec(js))) edges[p].push(m[1]);
  // 先拼到变量再跳转：let url = '/pages/x/x' ... wx.navigateTo({ url: url })
  const re3 = /(?:let|const|var)\s+url\s*=\s*['"]\/([a-z\-]+\/[a-z\-]+\/[a-z\-]+)/g;
  while ((m = re3.exec(js))) edges[p].push(m[1]);
});
eq(wrong, [], '所有跳转 API 与目标页类型匹配');

/* ================= 3. 深度 ================= */
console.log('\n[3] 入口深度');
const depth = {};
const queue = [];
tabs.forEach(function (t) {
  depth[t] = 0;
  queue.push(t);
});
while (queue.length) {
  const cur = queue.shift();
  (edges[cur] || []).forEach(function (to) {
    if (depth[to] === undefined) {
      depth[to] = depth[cur] + 1;
      queue.push(to);
    }
  });
}
pageDirs.forEach(function (p) {
  ok(depth[p] !== undefined && depth[p] <= 1, p + ' 距 tab ' + (depth[p] === undefined ? '不可达' : depth[p] + ' 层'));
});
[
  'pages/meal-log/meal-log',
  'pages/food-edit/food-edit',
  'pages/vaccine-edit/vaccine-edit',
  'pages/weather/weather',
  'pages/baby-edit/baby-edit',
  'pages/place/place',
  'pages/family/family'
].forEach(function (p) {
  ok((edges['pages/index/index'] || []).indexOf(p) > -1 || (edges['pages/mine/mine'] || []).indexOf(p) > -1, p + ' 可从「今日」或「我的」直达');
});

/* ================= 4/5. 运行时 ================= */
const mem = {};
let lastNav = '';
global.getApp = function () {
  return { globalData: { tmplIds: [] } };
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
  switchTab: function (o) {
    lastNav = 'tab:' + o.url;
  },
  navigateBack: function () {
    lastNav = 'back';
  },
  showToast: function () {},
  showModal: function () {},
  setNavigationBarTitle: function () {},
  stopPullDownRefresh: function () {},
  request: function (o) {
    if (o.fail) o.fail(new Error('NET'));
  }
};
let captured = null;
global.Page = function (cfg) {
  captured = cfg;
};
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
const dateUtil = require(path.join(ROOT, 'utils/date.js'));
const TODAY = dateUtil.todayStr();

const fixtures = require('./fixtures.js');
// 相对今天构造生日（月末安全，口径同 calcAge）。不要写死生日：今天在走，月龄会跟着变
function birthdayMonthsAgo(n, days) {
  return fixtures.birthdayForAge(n, days || 0);
}

(async function () {
  console.log('\n[4] 我的');
  let mp = instance(mount('pages/mine/mine.js'));
  mp.onShow();
  eq(mp.data.baby, null, '没宝宝时显示添加引导');
  mp.goBaby();
  eq(lastNav, '/pages/baby-edit/baby-edit', '没宝宝时点卡片去添加');
  eq(mp.data.placeText, '还没设置', '没地点时提示');
  eq(mp.data.familyText, '还没添加', '没家人时提示');

  store.saveBabies([{ id: 'b1', name: '小芽', birthday: birthdayMonthsAgo(10), gender: 'girl' }]);
  store.updateSettings({ activeBabyId: 'b1' });
  store.savePlace({ city: '北京市', district: '朝阳区', lat: 39.92, lon: 116.48, source: 'district' });
  const m1 = store.addFamilyMember('奶奶', '奶奶');
  store.togglePushTarget(m1.id);
  store.setManualTemp(15);

  mp = instance(mount('pages/mine/mine.js'));
  mp.onShow();
  eq(mp.data.baby.name, '小芽', '显示当前宝宝');
  ok(/10 ?个月/.test(mp.data.baby.ageText), '显示月龄');
  ok(/朝阳区/.test(mp.data.placeText), '显示地点');
  ok(/1 人/.test(mp.data.familyText) && /接收/.test(mp.data.familyText), '显示带娃人与接收人数');
  ok(/15℃/.test(mp.data.manualTempText), '天气入口显示今天的手动温度');
  mp.goBaby();
  eq(lastNav, '/pages/baby-edit/baby-edit?id=b1', '编辑当前宝宝');
  mp.goBabies();
  eq(lastNav, '/pages/baby-edit/baby-edit?mode=list', '宝宝列表');
  mp.goPlace();
  eq(lastNav, '/pages/place/place', '宝宝在哪');
  mp.goWeather();
  eq(lastNav, '/pages/weather/weather', '天气穿衣');
  mp.goFamily();
  eq(lastNav, '/pages/family/family', '带娃人');
  mp.goShare();
  eq(lastNav, '/pages/share/share', '今日卡片');

  const mineWxml = fs.readFileSync(path.join(ROOT, 'pages/mine/mine.wxml'), 'utf8');
  ['goBabies', 'goPlace', 'goWeather', 'goFamily', 'exportData', 'importData'].forEach(function (fn) {
    ok(mineWxml.indexOf('bindtap="' + fn + '"') > -1, 'mine.wxml 绑定了 ' + fn);
  });

  console.log('\n[5] 一键记一餐');
  let ip = instance(mount('pages/index/index.js'));
  ip.onShow();
  await new Promise(function (r) {
    setTimeout(r, 0);
  });
  ok(!!ip.data.suggest, '10 月龄宝宝有当前餐次推荐');
  if (ip.data.suggest) {
    ok(!!ip.data.suggest.name && !!ip.data.suggest.slotLabel, '推荐带菜名与餐次');
    eq(ip.data.suggest.date, TODAY, '推荐是今天的');
    ip.quickMeal();
    ok(
      lastNav.indexOf('/pages/meal-log/meal-log?date=' + TODAY + '&slot=' + ip.data.suggest.slot) === 0 &&
        lastNav.indexOf('recipeId=' + ip.data.suggest.recipeId) > -1,
      '一键进入预填好的记一餐（首页 → 保存，2 次点击）'
    );

    // 推荐的那道菜和辅食页「今天吃什么」是同一道
    const fpg = instance(mount('pages/food/food.js'));
    fpg.load();
    const same = (fpg.data.todayMenu || []).some(function (m) {
      return m.slotKey === ip.data.suggest.slot && m.recipeId === ip.data.suggest.recipeId;
    });
    ok(same, '首页推荐与「记录」页今天的餐单一致');

    // 记过之后不再提示
    store.upsertMealLog({ babyId: 'b1', date: TODAY, slot: ip.data.suggest.slot, foods: ['rice_cereal'] });
    ip.onShow();
    ok(ip.data.suggest && ip.data.suggest.logged, '这一餐记过后标记 logged，首页不再催');
  }

  // 5 月龄还没开始辅食，不出推荐
  store.saveBabies([{ id: 'b2', name: '小苗', birthday: birthdayMonthsAgo(4), gender: 'boy' }]);
  store.updateSettings({ activeBabyId: 'b2' });
  ip = instance(mount('pages/index/index.js'));
  ip.onShow();
  eq(ip.data.suggest, null, '未满 6 月龄不显示记餐推荐');
  ip.quickMeal();
  eq(lastNav, '/pages/meal-log/meal-log', '没有推荐时回退到普通记一餐');

  console.log('\n[6] 同上一餐');
  store.saveBabies([{ id: 'b1', name: '小芽', birthday: birthdayMonthsAgo(10), gender: 'girl' }]);
  store.updateSettings({ activeBabyId: 'b1' });
  store.upsertMealLog({
    babyId: 'b1',
    date: TODAY,
    slot: 'eve',
    recipeId: '',
    recipeName: '南瓜小米粥',
    foods: ['rice_cereal', 'pumpkin'],
    amount: 'all'
  });
  let ml = instance(mount('pages/meal-log/meal-log.js'));
  ml.onLoad({});
  ok(!!ml.data.lastMeal, '新记一餐时给出「同上一餐」');
  ok(/南瓜小米粥/.test(ml.data.lastMeal && ml.data.lastMeal.text), '显示上一餐名称');
  ml.copyLast();
  eq(
    ml.data.foods.map(function (f) {
      return f.id;
    }),
    ['rice_cereal', 'pumpkin'],
    '一键带出上一餐食材'
  );
  ok(ml.data.canSave, '带出后可以直接保存');
  eq(ml.data.amount, '', '份量不复制（每顿不同）');
  eq(ml.data.lastMeal, null, '用过之后收起提示');

  ml = instance(mount('pages/meal-log/meal-log.js'));
  ml.onLoad({ recipeId: 'r_pumpkin_puree' });
  ok(ml.data.recipeName.length > 0, '推荐食谱已带出');
  eq(ml.data.lastMeal, null, '带推荐食谱进来时不显示「同上一餐」');

  console.log('\n========================================');
  console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  console.log('========================================\n');
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});

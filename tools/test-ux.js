#!/usr/bin/env node
/**
 * tools/test-ux.js —— 体验优化（2026-11-19）测试
 * 用法：node tools/test-ux.js
 * 覆盖：
 *   1. 早产矫正月龄：37 周线、2 岁线、预产期未到、非法数据
 *   2. 宝宝档案：早产开关、预产期范围、保存校验
 *   3. 各页面用矫正月龄，疫苗仍用实际月龄
 *   4. 首页：按月龄换宫格、入口不重复、疫苗到期提醒、推送卡收起
 *   5. 疫苗 dueReminder 文案与挑选规则
 *   6. 备份文件：导出 → 选文件 → 恢复往返；不支持时退回剪贴板；取消不打扰
 *   7. 设计 token：页面样式无写死颜色、token 都有定义、字号 ≥ 22rpx
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const mem = {};
const files = {};
let lastToast = '';
let lastModal = '';
const modalLog = [];
let modalConfirm = true;
let lastNav = '';
let clipboard = '';
let shared = null;
let shareFail = null;
let pickResult = null;
let actionTap = -1;
let fileApi = true;
const globalData = { tmplIds: [] };

global.getApp = function () {
  return { globalData: globalData };
};
global.getCurrentPages = function () {
  return [{}, {}];
};
global.wx = {
  env: { USER_DATA_PATH: 'wxfile://usr' },
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
  showToast: function (o) {
    lastToast = o.title;
  },
  showModal: function (o) {
    lastModal = (o.title || '') + '|' + (o.content || '');
    modalLog.push(lastModal);
    if (o.success) o.success({ confirm: modalConfirm });
  },
  showActionSheet: function (o) {
    if (actionTap >= 0 && o.success) o.success({ tapIndex: actionTap });
  },
  setClipboardData: function (o) {
    clipboard = o.data;
    if (o.success) o.success();
  },
  getClipboardData: function (o) {
    if (o.success) o.success({ data: clipboard });
  },
  getFileSystemManager: function () {
    return {
      writeFileSync: function (p, data) {
        files[p] = data;
      },
      readFileSync: function (p) {
        if (!(p in files)) throw new Error('ENOENT');
        return files[p];
      }
    };
  },
  shareFileMessage: function (o) {
    if (shareFail) {
      o.fail && o.fail({ errMsg: shareFail });
      return;
    }
    shared = { path: o.filePath, name: o.fileName };
    o.success && o.success();
  },
  chooseMessageFile: function (o) {
    if (!pickResult) {
      o.fail && o.fail({ errMsg: 'chooseMessageFile:fail cancel' });
      return;
    }
    o.success && o.success({ tempFiles: [pickResult] });
  },
  setNavigationBarTitle: function () {},
  stopPullDownRefresh: function () {},
  request: function (o) {
    if (o.fail) o.fail(new Error('NET'));
  }
};
// 「不支持文件接口」的场景：临时把三个接口拿掉
const FILE_APIS = ['getFileSystemManager', 'shareFileMessage', 'chooseMessageFile'];
const saved = {};
function setFileApi(on) {
  FILE_APIS.forEach(function (k) {
    if (on) {
      if (saved[k]) wx[k] = saved[k];
    } else {
      saved[k] = saved[k] || wx[k];
      delete wx[k];
    }
  });
  fileApi = on;
}

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
      } else self.data[k] = patch[k];
    });
  };
  return inst;
}
function ev(d, detail) {
  return { currentTarget: { dataset: d || {} }, detail: detail || {} };
}
function clear() {
  Object.keys(mem).forEach(function (k) {
    delete mem[k];
  });
}
const tick = function () {
  return new Promise(function (r) {
    setTimeout(r, 0);
  });
};

const store = require(path.join(ROOT, 'utils/store.js'));
const dateUtil = require(path.join(ROOT, 'utils/date.js'));
const vaccine = require(path.join(ROOT, 'utils/vaccine.js'));

let pass = 0;
let fail = 0;
function ok(c, l) {
  if (c) {
    pass++;
    console.log('  ✓ ' + l);
  } else {
    fail++;
    console.log('  ✗ ' + l);
  }
}
function eq(a, b, l) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  ok(x === y, l + (x === y ? '' : '\n      期望 ' + y + '\n      实际 ' + x));
}

const TODAY = dateUtil.todayStr();
const fixtures = require('./fixtures.js');
// 相对今天构造生日（月末安全，口径同 calcAge）
function monthsAgo(n, days) {
  return fixtures.birthdayForAge(n, days || 0);
}

async function main() {
  /* ================= 1. 矫正月龄 ================= */
  console.log('\n[1] 早产矫正月龄');
  const NOW = new Date(2026, 10, 19, 12);
  // 2026-06-01 出生，预产期 2026-08-01（早 61 天，约 31 周出生）
  let a = dateUtil.babyAge({ birthday: '2026-06-01', dueDate: '2026-08-01' }, NOW);
  eq(a.actual.months, 5, '实际 5 个月');
  eq(a.months, 3, '矫正 3 个月（有效月龄）');
  ok(a.isCorrected, '标记为矫正');
  eq(a.pretermWeeks, 9, '早产约 9 周');
  eq(dateUtil.babyAgeText(a), '5 个月 18 天 · 矫正 3 个月', '文案同时给实际和矫正');

  a = dateUtil.babyAge({ birthday: '2026-06-01', dueDate: '2026-06-20' }, NOW);
  ok(!a.isCorrected && a.months === 5, '只早 19 天（≥37 周）不算早产，不矫正');
  a = dateUtil.babyAge({ birthday: '2026-06-01', dueDate: '2026-06-22' }, NOW);
  ok(a.isCorrected, '早 21 天（<37 周）开始矫正');
  a = dateUtil.babyAge({ birthday: '2026-06-01', dueDate: '2026-12-01' }, NOW);
  ok(!a.isCorrected, '预产期离谱（晚半年）视为无效，不矫正');
  a = dateUtil.babyAge({ birthday: '2026-06-01', dueDate: '2026-05-01' }, NOW);
  ok(!a.isCorrected, '预产期早于生日视为无效');
  a = dateUtil.babyAge({ birthday: '2026-06-01' }, NOW);
  ok(!a.isCorrected && a.months === 5, '没填预产期按实际月龄');

  a = dateUtil.babyAge({ birthday: '2024-10-01', dueDate: '2024-12-01' }, NOW);
  ok(a.actual.months >= 24 && !a.isCorrected, '满 2 岁后不再矫正');
  a = dateUtil.babyAge({ birthday: '2024-12-01', dueDate: '2025-02-01' }, NOW);
  ok(a.actual.months === 23 && a.isCorrected && a.months === 21, '23 个月时仍矫正（21 个月）');

  a = dateUtil.babyAge({ birthday: '2026-11-01', dueDate: '2026-12-20' }, NOW);
  ok(a.isCorrected && a.months === 0 && a.totalDays === 0, '还没到预产期：矫正按 0 天算');
  eq(dateUtil.babyAgeText(a), '18 天 · 矫正 0 天', '预产期前的文案');
  eq(dateUtil.babyAgeText(dateUtil.babyAge({ birthday: '2026-06-01' }, NOW)), '5 个月 18 天', '未矫正时文案不变');

  /* ================= 2. 宝宝档案 ================= */
  console.log('\n[2] 宝宝档案：早产');
  clear();
  let be = instance(mount('pages/baby-edit/baby-edit.js'));
  be.onLoad({});
  be.setData({ 'baby.name': '小豆' });
  be.onBirthday(ev({}, { value: '2026-06-01' }));
  eq(be.data.dueStart, '2026-06-22', '预产期最早 = 生日 + 3 周');
  eq(be.data.dueEnd, '2026-09-28', '预产期最晚 = 生日 + 17 周');
  be.togglePreterm(ev({}, { value: true }));
  ok(be.data.preterm, '打开早产开关');
  be.save();
  ok(/预产期/.test(lastToast) && store.getBabies().length === 0, '开了早产没选预产期，不让保存');
  be.onDueDate(ev({}, { value: '2026-08-01' }));
  ok(/矫正/.test(be.data.agePreview), '预览里出现矫正月龄：' + be.data.agePreview);
  be.save();
  const saved1 = store.getBabies()[0];
  eq(saved1 && saved1.dueDate, '2026-08-01', '预产期已保存');

  be = instance(mount('pages/baby-edit/baby-edit.js'));
  be.onLoad({ id: saved1.id });
  ok(be.data.preterm && be.data.baby.dueDate === '2026-08-01', '再次编辑时回显早产信息');
  be.onBirthday(ev({}, { value: '2026-09-01' }));
  eq(be.data.baby.dueDate, '', '生日改到预产期之后：原预产期失效被清空');
  be.onDueDate(ev({}, { value: '2026-10-15' }));
  be.togglePreterm(ev({}, { value: false }));
  eq(be.data.baby.dueDate, '', '关掉早产开关清空预产期');
  be.save();
  eq(store.getBabies()[0].dueDate, '', '保存后不再是早产');

  /* ================= 3. 页面用矫正月龄 ================= */
  console.log('\n[3] 各页面用矫正月龄，疫苗用实际月龄');
  clear();
  // 实际 7 个月、矫正 5 个月：两个日期各自从「今天」反推（都取月中，避开月末进位），
  // 不用「生日 + 62 天」——那样在月末附近矫正月龄会落到 4 或 6
  const bday = monthsAgo(7, 15);
  const due = monthsAgo(5, 15);
  ok(dateUtil.pretermDays({ birthday: bday, dueDate: due }) > 0, '数据准备：预产期落在早产范围内');
  store.saveBabies([{ id: 'p1', name: '早早', birthday: bday, dueDate: due }]);
  store.updateSettings({ activeBabyId: 'p1' });
  const age = dateUtil.babyAge(store.getActiveBaby());
  ok(age.isCorrected && age.actual.months === 7 && age.months === 5, '数据准备：实际 7 / 矫正 5');

  let ip = instance(mount('pages/index/index.js'));
  await ip.refresh();
  eq(ip.data.ageMonths, 5, '首页月龄建议按矫正 5 个月');
  ok(/矫正 5 个月/.test(ip.data.baby.ageText), '首页显示矫正：' + ip.data.baby.ageText);
  ok(ip.data.suggest === null, '矫正未满 6 个月：不推荐记辅食餐');

  const gp = instance(mount('pages/guide/guide.js'));
  gp.onLoad({});
  ok(gp.data.label && gp.data.month === 5, '月龄建议页定位到矫正月龄');

  const rp = instance(mount('pages/record/record.js'));
  rp.onShow && rp.onShow();
  eq(rp.data.months, 5, '记录页参考区间按矫正月龄');

  const mp0 = instance(mount('pages/mine/mine.js'));
  mp0.onShow();
  ok(/矫正/.test(mp0.data.baby.ageText), '我的页显示矫正月龄');

  // 疫苗：实际 7 个月 → 不受矫正影响
  const vb = vaccine.brief([], 7);
  const vbCorr = vaccine.brief([], 5);
  const vp = instance(mount('pages/vaccine/vaccine.js'));
  vp.load();
  ok(vp.data.planAll && vp.data.planAll.length > 0, '疫苗页正常加载');
  const src = fs.readFileSync(path.join(ROOT, 'pages/vaccine/vaccine.js'), 'utf8');
  ok(src.indexOf('babyAge') === -1, '疫苗页仍用实际月龄（未接入矫正）');
  ok(vb.title !== undefined && vbCorr.title !== undefined, '疫苗 brief 按月龄可算');

  /* ================= 4. 首页 ================= */
  console.log('\n[4] 首页按月龄排布');
  clear();
  globalData.tmplIds = [];
  store.saveBabies([{ id: 'h1', name: '小一', birthday: monthsAgo(2, 3) }]);
  store.updateSettings({ activeBabyId: 'h1' });
  ip = instance(mount('pages/index/index.js'));
  await ip.refresh();
  const keys2 = ip.data.quickItems.map(function (q) {
    return q.key;
  });
  eq(keys2, ['vaxEdit', 'weather', 'guide'], '2 个月：宫格只有记接种 / 穿衣 / 月龄建议');
  ok(ip.data.suggest === null, '2 个月：不出现一键记餐');
  ok(!ip.data.tmplConfigured, '没配模板：推送卡收成一行');

  ip.onQuick(ev({ key: 'guide' }));
  ok(/^\/pages\/guide\/guide\?month=2/.test(lastNav), '宫格「月龄建议」跳到当前月龄');
  ip.onQuick(ev({ key: 'weather' }));
  eq(lastNav, '/pages/weather/weather', '宫格「穿衣」');
  ip.onQuick(ev({ key: 'vaxEdit' }));
  eq(lastNav, '/pages/vaccine-edit/vaccine-edit', '宫格「记接种」');

  store.saveBabies([{ id: 'h1', name: '小一', birthday: monthsAgo(5, 3) }]);
  await ip.refresh();
  ok(
    ip.data.quickItems.some(function (q) {
      return q.key === 'food' && q.text === '辅食准备';
    }),
    '5 个月：出现「辅食准备」'
  );

  store.saveBabies([{ id: 'h1', name: '小一', birthday: monthsAgo(8, 3) }]);
  await ip.refresh();
  eq(
    ip.data.quickItems.map(function (q) {
      return q.key;
    }),
    ['foodEdit', 'food', 'vaxEdit', 'weather'],
    '8 个月：试新食材 / 辅食本 / 记接种 / 穿衣'
  );
  ok(
    !ip.data.quickItems.some(function (q) {
      return q.text === '记一餐';
    }),
    '宫格不再重复「记一餐」（推荐条承担）'
  );
  ip.onQuick(ev({ key: 'food' }));
  eq(lastNav, '/pages/food/food', '宫格「辅食本」');
  ip.onQuick(ev({ key: 'foodEdit' }));
  eq(lastNav, '/pages/food-edit/food-edit', '宫格「试新食材」');

  globalData.tmplIds = ['tmpl-1'];
  await ip.refresh();
  ok(ip.data.tmplConfigured, '配好模板 ID 后推送卡自动展开');
  globalData.tmplIds = [];

  const wxml = fs.readFileSync(path.join(ROOT, 'pages/index/index.wxml'), 'utf8');
  eq((wxml.match(/goRecord/g) || []).length, 4, '去「记录」的入口：照护卡里的提醒条和状态行，加记一笔卡里一个「全部记录」（有记录 / 没记录二选一）');
  eq((wxml.match(/全部记录/g) || []).length, 2, '「全部记录」文字只在记一笔卡里（两种状态各一处，同时只显示一个）');
  // 首页收敛：一级区块不超过 7 个（提醒位 / 照护 / 记一笔 / 今日重点 / 今天 / 发给家人 / 免责）
  const body = wxml.slice(wxml.indexOf('<block wx:if="{{baby}}">'), wxml.indexOf('<block wx:else>'));
  const sections = (body.match(/<!-- [①-⑨]/g) || []).length;
  ok(sections <= 6, '首页（有宝宝时）收敛为 ' + sections + ' 个区块');
  ok(/wx:elif="\{\{vaxRemind\}\}"/.test(body) && /wx:elif="\{\{backupRemind\}\}"/.test(body), '引导 / 疫苗 / 备份共用一个提醒位，同时只出一条');
  ok(wxml.indexOf('wx:if="{{!vaxRemind}}"') > -1, '有到期提醒时疫苗区不重复展示');
  ok(/push-line[\s\S]*wx:if="\{\{!tmplConfigured\}\}"/.test(wxml), '未配模板只显示一行入口');

  /* ================= 5. 疫苗到期提醒 ================= */
  console.log('\n[5] 疫苗到期提醒');
  // 2 月龄的针：生日 + 2 个月
  const T = '2026-11-19';
  // 只看 2 月龄那一针：更早的针都标为已移除，免得逾期的抢了优先级
  const early = vaccine
    .planFor(0, [], [], T)
    .filter(function (p) {
      return p.month < 2;
    })
    .map(function (p) {
      return p.key;
    });
  let r = vaccine.dueReminder('2026-09-22', [], T, early);
  ok(r && r.days === 3 && /^3 天后该打 /.test(r.text), '3 天后到期：' + (r && r.text));
  r = vaccine.dueReminder('2026-09-19', [], T, early);
  ok(r && r.days === 0 && /^今天该打 /.test(r.text), '今天到期：' + (r && r.text));
  r = vaccine.dueReminder('2026-09-14', [], T, early);
  ok(r && r.overdue && /已过建议日期 5 天/.test(r.text), '逾期 5 天：' + (r && r.text));
  r = vaccine.dueReminder('2026-09-30', [], T, early);
  ok(r === null, '11 天后才到期：不提醒');
  const only2 = vaccine
    .planFor(0, [], [], T)
    .filter(function (p) {
      return p.month !== 2;
    })
    .map(function (p) {
      return p.key;
    });
  r = vaccine.dueReminder('2026-08-01', [], T, only2);
  ok(r === null, '逾期一个多月（多半是没回填）：首页不再天天提醒');
  // 出生当天要打的乙肝/卡介苗：新生儿首页就该提醒
  r = vaccine.dueReminder('2026-11-17', [], T, []);
  ok(r && r.overdue && r.days === -2, '出生时就该打的针，2 天没记就提醒');
  // 记过了就不再提醒
  const all0 = vaccine.planFor(0, [], [], T).filter(function (p) {
    return p.month === 0;
  });
  const recs = all0.map(function (p) {
    return { babyId: 'x', vaccineId: p.vaccineId, dose: p.dose, date: '2026-11-17' };
  });
  r = vaccine.dueReminder('2026-11-17', recs, T, []);
  ok(r === null, '出生针都记了之后不再提醒');
  // 手动移除的不提醒
  r = vaccine.dueReminder(
    '2026-11-17',
    [],
    T,
    all0.map(function (p) {
      return p.key;
    })
  );
  ok(r === null, '手动移除的计划不提醒');
  ok(vaccine.dueReminder('', [], T, []) === null, '没有生日不提醒');

  // 首页接上提醒
  clear();
  store.saveBabies([{ id: 'n1', name: '新新', birthday: dateUtil.shiftDate(TODAY, -2) }]);
  store.updateSettings({ activeBabyId: 'n1' });
  ip = instance(mount('pages/index/index.js'));
  await ip.refresh();
  ok(ip.data.vaxRemind && ip.data.vaxRemind.overdue, '新生儿首页出现疫苗提醒：' + (ip.data.vaxRemind && ip.data.vaxRemind.text));
  ip.goVaxRemind();
  ok(/vaccine-edit\?vaccineId=[a-z]+&dose=\d/.test(lastNav), '点提醒直接进预选好的记接种：' + lastNav);

  /* ================= 6. 备份文件 ================= */
  console.log('\n[6] 备份文件');
  clear();
  store.saveBabies([{ id: 'k1', name: '小备', birthday: monthsAgo(6) }]);
  store.updateSettings({ activeBabyId: 'k1' });
  store.upsertCare({ babyId: 'k1', type: 'diaper', start: Date.now() - 3600000, kind: 'wet' });
  store.upsertVaccineRecord({ babyId: 'k1', vaccineId: 'hepb', dose: 1, date: monthsAgo(5) });

  const backupFile = require(path.join(ROOT, 'utils/backup-file.js'));
  eq(backupFile.fileName(new Date(2026, 10, 19, 9, 5)), '小芽日常备份-20261119-0905.txt', '文件名带日期时间');
  setFileApi(true);
  ok(backupFile.supported(), '有文件接口时走文件方式');

  let mp = instance(mount('pages/mine/mine.js'));
  mp.onShow();
  shared = null;
  mp.exportData();
  await tick();
  ok(shared && /^小芽日常备份-\d{8}-\d{4}\.txt$/.test(shared.name), '导出生成备份文件并唤起转发：' + (shared && shared.name));
  ok(shared && files[shared.path].indexOf('XYD1:') === 0, '文件内容是标准备份格式');
  eq(lastToast, '已发出备份文件', '导出成功提示');

  // 换一台手机：清空后从文件恢复
  const backupPath = shared.path;
  clear();
  mp = instance(mount('pages/mine/mine.js'));
  mp.onShow();
  ok(!mp.data.hasData, '新手机上没有数据');
  pickResult = { path: backupPath, name: shared.name };
  modalConfirm = true;
  mp.importData();
  await tick();
  ok(/已合并/.test(lastModal) && /新加了 3 条/.test(lastModal), '新手机（本机为空）直接合并，并说清加了几条：' + lastModal.slice(0, 30));
  eq(store.getBabies().length, 1, '恢复了宝宝');
  eq(store.getVaccineRecords('k1').length, 1, '恢复了接种记录');
  eq(store.getCareRange('k1', 0, Date.now() + 1).length, 1, '恢复了照护记录');

  // 选错文件
  files['wxfile://tmp/other.txt'] = '随便一段文字';
  pickResult = { path: 'wxfile://tmp/other.txt', name: 'other.txt' };
  mp.importData();
  await tick();
  ok(/没找到备份/.test(lastModal) && /文件名以/.test(lastModal), '不是备份文件：友好提示且提到文件名规则');
  eq(store.getBabies().length, 1, '选错文件不改动数据');

  // 取消选择 / 取消转发：什么都不说
  lastToast = '';
  lastModal = '';
  pickResult = null;
  mp.importData();
  await tick();
  ok(lastToast === '' && lastModal === '', '取消选文件不打扰');
  shareFail = 'shareFileMessage:fail cancel';
  mp.onShow();
  mp.exportData();
  await tick();
  ok(lastToast === '' && lastModal === '', '取消转发不打扰');
  // 转发失败 → 提示改用复制
  shareFail = 'shareFileMessage:fail system error';
  modalConfirm = true;
  clipboard = '';
  modalLog.length = 0;
  mp.exportData();
  await tick();
  ok(
    /没能生成备份文件/.test(modalLog[0] || '') && clipboard.indexOf('XYD1:') === 0,
    '转发失败时引导改用复制，并已复制'
  );
  shareFail = null;

  // 不支持文件接口（PC 端 / 旧版本）：退回剪贴板
  setFileApi(false);
  ok(!backupFile.supported(), '没有文件接口时识别为不支持');
  clipboard = '';
  mp.exportData();
  ok(clipboard.indexOf('XYD1:') === 0, '不支持时导出走剪贴板');
  const text = clipboard;
  clear();
  mp.importData();
  ok(/已合并/.test(lastModal) && store.getBabies().length === 1, '不支持时恢复走剪贴板');
  setFileApi(true);

  // 次级入口：复制文字
  mp.onShow();
  clipboard = '';
  actionTap = 0;
  mp.moreBackup();
  ok(clipboard === store.exportBackup() || clipboard.indexOf('XYD1:') === 0, '「用复制文字的方式备份」→ 复制');
  clipboard = text;
  clear();
  actionTap = 1;
  mp.moreBackup();
  eq(store.getBabies().length, 1, '「从复制的文字恢复」');
  actionTap = -1;

  /* ================= 7. 设计 token ================= */
  console.log('\n[7] 设计 token');
  const appWxss = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
  // 只读浅色那一块（深色模式在 @media 里覆盖同名变量）；值可以是 #hex 也可以是 rgba
  const tokenBlock = appWxss.match(/\/\* ==== design tokens[\s\S]*?\/\* ==== \/design tokens ==== \*\//)[0];
  const lightBlock = tokenBlock.split('@media')[0];
  const defined = {};
  lightBlock.replace(/--([a-z0-9-]+)\s*:\s*([^;]+);/g, function (_, n, v) {
    defined[n] = v.trim();
  });
  const names = Object.keys(defined);
  ok(names.length >= 30 && names.length <= 60, '语义色 ' + names.length + ' 个（原来 245 个零散色值）');
  ok(/--brand:/.test(tokenBlock.split('@media')[1] || ''), '深色模式在 @media 里覆盖同名 token');
  ['brand', 'text', 'text-3', 'bg', 'card', 'line', 'danger', 'warn', 'ok', 'info', 'sleep'].forEach(function (n) {
    ok(!!defined[n], '核心 token --' + n + ' 已定义');
  });
  eq(defined.brand, '#F0876B', '主色不变');
  eq(defined.bg, '#FFF8F0', '底色不变');
  eq(defined.text, '#3A2E26', '正文色不变');

  const wxssFiles = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      if (e.isDirectory()) {
        if (['node_modules', 'tools', 'analysis', '.git', '.workbuddy', 'cloudfunctions'].indexOf(e.name) === -1)
          walk(path.join(d, e.name));
      } else if (/\.wxss$/.test(e.name)) wxssFiles.push(path.join(d, e.name));
    });
  })(ROOT);
  let hex = 0;
  let undef = 0;
  let small = 0;
  const usedSet = {};
  wxssFiles.forEach(function (f) {
    let s = fs.readFileSync(f, 'utf8');
    if (path.basename(f) === 'app.wxss' && path.dirname(f) === ROOT) {
      s = s.replace(/\/\* ==== design tokens[\s\S]*?\/\* ==== \/design tokens ==== \*\//, '');
    }
    hex += (s.match(/#[0-9A-Fa-f]{3,8}\b/g) || []).length;
    s.replace(/var\(--([a-z0-9-]+)\)/g, function (_, n) {
      usedSet[n] = true;
      if (!defined[n]) undef++;
    });
    s.split('\n').forEach(function (line) {
      const m = line.match(/font-size:\s*(\d+)rpx/);
      if (m && Number(m[1]) < 22 && line.indexOf('豁免最小字号') === -1) small++;
    });
  });
  eq(hex, 0, '页面样式里没有写死的颜色');
  eq(undef, 0, '用到的 token 都有定义');
  eq(small, 0, '正文字号都 ≥ 22rpx');
  ok(
    names.every(function (n) {
      return usedSet[n];
    }),
    '每个 token 都被用到（没有死 token）'
  );

  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});

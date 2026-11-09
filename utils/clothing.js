// utils/clothing.js —— 穿衣推荐引擎（温度档 × 月龄阶段 双维匹配）
// 输入：天气数据 + 月龄；输出：今天穿什么（贴合该月龄的款式）、睡觉怎么盖（完整 TOG 表）、注意事项

const {
  WMO,
  RAIN_CODES,
  SNOW_CODES,
  BANDS,
  AGE_STAGES,
  SLEEP_BANDS
} = require('../data/clothing.js');

function weatherMeta(code) {
  return WMO[code] || { text: '未知', icon: '🌡' };
}

/** 月龄修正：越小的宝宝体温调节越弱，按温度偏移而不是整档跳，避免「21℃ 判成短袖」这种跳档 */
function ageTempOffset(months) {
  const m = typeof months === 'number' ? months : 12;
  if (m < 3) return -3;
  if (m < 12) return -2;
  if (m < 24) return 0;
  return 1; // 会走会跑，活动量大，可以比成人少一层
}

/** 月龄 → 穿着阶段（0-2 / 3-5 / 6-11 / 12-23 / 24-36） */
function getStage(months) {
  const m = typeof months === 'number' && isFinite(months) ? Math.floor(months) : 12;
  const safe = Math.max(0, Math.min(36, m));
  for (let i = 0; i < AGE_STAGES.length; i++) {
    if (safe >= AGE_STAGES[i].min && safe <= AGE_STAGES[i].max) return AGE_STAGES[i];
  }
  return AGE_STAGES[AGE_STAGES.length - 1];
}

function pickBand(temp, months) {
  const offset = ageTempOffset(months);
  const adjusted = temp + offset;

  let idx = -1;
  for (let i = 0; i < BANDS.length; i++) {
    if (adjusted <= BANDS[i].maxTemp) {
      idx = i;
      break;
    }
  }
  if (idx < 0) idx = BANDS.length - 1;

  return { band: BANDS[idx], index: idx, offset: offset, adjusted: adjusted };
}

/**
 * 室内温度估算：只跟室外温度有关，与月龄无关
 * 关键约束——冬天室外 -5℃ 时室内有暖气，仍应是 21℃ 上下；
 * 不能简单写「室外 + 4」，否则会在暖气房里推荐 3.5 TOG 睡袋，捂热比受凉更危险。
 */
function estimateIndoor(feelsLike) {
  const t = typeof feelsLike === 'number' && isFinite(feelsLike) ? feelsLike : 22;
  let indoor;
  if (t <= 8) {
    indoor = 21; // 供暖季，室温基本被暖气锚定
  } else if (t <= 23) {
    indoor = 21 + ((t - 8) * 2) / 15; // 停暖过渡季，开窗后逐渐接近室外
  } else {
    indoor = 23 + (t - 23) * 0.8; // 夏天开窗 / 空调，室内略低于室外
  }
  return Math.max(10, Math.min(33, Math.round(indoor)));
}

/**
 * 睡袋方案：返回当前档 + 完整温度区间表（供热的时候照着挑）
 * @param {Number} indoorTemp 估算的室内温度
 * @param {Object} stage      月龄阶段（提供睡袋款式）
 */
function buildSleep(indoorTemp, stage) {
  // 放宽到 10-33℃：两端都要能命中表格的首尾行，否则「＜15℃」永远不会被高亮
  const indoor = Math.max(10, Math.min(33, Math.round(indoorTemp)));

  const rows = SLEEP_BANDS.map(function (b) {
    return {
      label: b.label,
      tog: b.tog,
      text: b.text,
      note: b.note || '',
      active: indoor >= b.min && indoor <= b.max
    };
  });

  let current = rows[rows.length - 1];
  if (indoor >= SLEEP_BANDS[0].min) current = rows[0];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].active) {
      current = rows[i];
      break;
    }
  }

  return {
    indoor: indoor,
    tog: current.tog,
    text: current.text,
    label: current.label,
    rows: rows,
    style: stage.sack,
    styleNote: stage.sackNote,
    tip: '摸后颈判断：温热无汗刚好，出汗说明穿多了，发凉再加一层'
  };
}

/**
 * @param {Object} weather { temp, feelsLike, code, wind, humidity, tempMax, tempMin, uv }
 * @param {Object} opts    { ageMonths, mountain, mountainOffset }
 */
function recommend(weather, opts) {
  const w = weather || {};
  const options = opts || {};
  const months = typeof options.ageMonths === 'number' ? options.ageMonths : 12;

  const rawTemp = typeof w.feelsLike === 'number' ? w.feelsLike : typeof w.temp === 'number' ? w.temp : 22;

  // 山区修正：门头沟、房山、怀柔、平谷、密云、延庆等区域，山里普遍比城区低 2-3℃
  const mountainOffset = options.mountain
    ? typeof options.mountainOffset === 'number'
      ? options.mountainOffset
      : -2
    : 0;
  const temp = rawTemp + mountainOffset;

  const meta = weatherMeta(w.code);
  const picked = pickBand(temp, months);
  const band = picked.band;
  const stage = getStage(months);

  // 同温度档下，不同月龄的款式完全不同（和尚服 / 连体衣 / 分体）
  const stageBand = (stage.bands && stage.bands[band.key]) || {};
  const inner = stageBand.inner || band.inner;
  const outerRaw = stageBand.outer || band.outer;
  const noOuter = !outerRaw || outerRaw.indexOf('不需要') > -1;

  const items = [
    { part: '内层', text: inner, tip: '纯棉、无骨缝，贴身穿吸汗' },
    {
      part: '外层',
      text: noOuter ? '不需要' : outerRaw,
      tip: noOuter ? '天热以少穿为准，别怕穿少' : '方便穿脱，进出空调房随时加减'
    },
    { part: '头部', text: band.hat, tip: '大风、强日晒时必备' }
  ];

  const alerts = [];
  const tempMax = typeof w.tempMax === 'number' ? w.tempMax : null;
  const tempMin = typeof w.tempMin === 'number' ? w.tempMin : null;
  const wind = typeof w.wind === 'number' ? w.wind : 0;
  const humidity = typeof w.humidity === 'number' ? w.humidity : 60;
  const uv = typeof w.uv === 'number' ? w.uv : 0;
  const code = Number(w.code) || 0;

  if (tempMax !== null && tempMin !== null && tempMax - tempMin >= 8) {
    alerts.push('今天早晚温差约 ' + Math.round(tempMax - tempMin) + '℃，外套一定要方便穿脱');
  }
  if (wind >= 39) {
    alerts.push('风力较大（6 级以上），建议改成室内活动');
  } else if (wind >= 24) {
    alerts.push('风比较明显，加一件防风外层比单纯加厚更管用');
  }
  if (RAIN_CODES.indexOf(code) > -1) {
    alerts.push('有降水，出门带伞和防水外层，多备一双干袜子');
  }
  if (SNOW_CODES.indexOf(code) > -1) {
    alerts.push('有雪，注意鞋底防滑，缩短户外停留时间');
  }
  if (uv >= 6) {
    alerts.push('紫外线较强，遮阳帽 + 婴儿专用防晒（6 个月以下以物理遮挡为主）');
  }
  if (humidity >= 80 && temp >= 26) {
    alerts.push('闷热潮湿，选透气棉麻、勤换干爽衣物，注意颈部褶皱处保持干爽');
  }
  if (temp <= 5) {
    alerts.push('气温很低，户外停留控制在 20-30 分钟，回室内再喂奶');
  }
  if (temp >= 32) {
    alerts.push('高温天 10:00-16:00 避免外出，奶量和水分的补充要跟上');
  }
  if (months < 6) {
    alerts.push('6 个月内体温调节能力弱，比大人多薄薄一层就够，捂热比受凉更危险');
  }
  if (mountainOffset < 0) {
    alerts.push('这个区域含山区，山里通常比城区低 2-3℃，上面建议已把这段温差算进去，早晚再多带一件');
  }

  // 室内温度估算只跟天气有关，用原始体感温度，不参与月龄修正（否则同一天气下不同月龄会得到不同室温）
  const indoor = estimateIndoor(rawTemp);
  const sleep = buildSleep(indoor, stage);

  const headline = noOuter ? inner : inner + '，外加' + outerRaw;

  const basisParts = ['按体感 ' + Math.round(rawTemp) + '℃'];
  if (mountainOffset) basisParts.push('山区 ' + mountainOffset + '℃');
  if (picked.offset) basisParts.push(months + ' 月龄 ' + picked.offset + '℃');

  return {
    headline: headline,
    level: band.label,
    comfort: band.comfort,
    bandTip: band.tip,
    icon: meta.icon,
    weatherText: meta.text,
    items: items,
    alerts: alerts,
    mountain: mountainOffset < 0,
    stageKey: stage.key,
    stageLabel: stage.label,
    stageTip: stage.tip,
    sleep: sleep,
    basis:
      basisParts.join('，') + ' 修正为 ' + Math.round(picked.adjusted) + '℃，匹配「' + band.label + '」档',
    judgeTip: '宝宝穿衣没有标准答案，后颈温热、手脚微凉就是合适的状态'
  };
}

module.exports = {
  recommend: recommend,
  weatherMeta: weatherMeta,
  ageTempOffset: ageTempOffset,
  getStage: getStage,
  estimateIndoor: estimateIndoor,
  buildSleep: buildSleep
};

// data/care.js —— 日常照护记录（喂奶 / 睡眠 / 尿布）的参考区间与选项
// 说明：区间为通用参考，个体差异很大；只做「对照」提示，不做诊断。

/** 按月龄的每日参考：喂奶次数、睡眠总时长（小时）、湿尿布片数 */
const DAILY_REF = [
  { min: 0, max: 0, feeds: [8, 12], sleepH: [14, 17], wet: [6, 99] },
  { min: 1, max: 2, feeds: [7, 10], sleepH: [14, 17], wet: [6, 99] },
  { min: 3, max: 5, feeds: [5, 8], sleepH: [12, 16], wet: [5, 99] },
  { min: 6, max: 8, feeds: [4, 6], sleepH: [12, 15], wet: [5, 99] },
  { min: 9, max: 11, feeds: [3, 5], sleepH: [12, 15], wet: [4, 99] },
  { min: 12, max: 23, feeds: [2, 4], sleepH: [11, 14], wet: [4, 99] },
  { min: 24, max: 36, feeds: [0, 3], sleepH: [10, 13], wet: [0, 99] }
];

const FEED_KINDS = [
  { key: 'left', label: '左侧', short: '左' },
  { key: 'right', label: '右侧', short: '右' },
  { key: 'bottle', label: '瓶喂', short: '瓶' }
];

/** 瓶喂快捷量（ml） */
const BOTTLE_ML = [60, 90, 120, 150, 180];

/** 瓶里装的是什么 */
const BOTTLE_TYPES = [
  { key: 'formula', label: '配方奶' },
  { key: 'breast', label: '母乳' }
];

const DIAPER_KINDS = [
  { key: 'wet', label: '尿', emoji: '💧' },
  { key: 'dirty', label: '便', emoji: '💩' },
  { key: 'both', label: '都有', emoji: '💧💩' }
];

/**
 * 便便颜色卡
 * level: ok 正常 / watch 留意 / doctor 建议就医
 * 陶土色、灰白色是胆道闭锁的早期信号，越早就诊越好，所以单独强提示
 */
const POOP_COLORS = [
  { key: 'yellow', label: '金黄', hex: '#E7B53C', level: 'ok', tip: '母乳宝宝最常见的颜色' },
  { key: 'mustard', label: '芥末黄', hex: '#C9A227', level: 'ok', tip: '常见颜色' },
  { key: 'green', label: '绿色', hex: '#6E9A3E', level: 'ok', tip: '多见于配方奶或吃到较多前奶，精神好就不用担心' },
  { key: 'brown', label: '棕色', hex: '#8A5A32', level: 'ok', tip: '加辅食后常见' },
  { key: 'black', label: '黑色', hex: '#2B2522', level: 'doctor', tip: '出生头几天的胎便是黑色属正常；之后仍是黑色、或吃了铁剂以外出现，建议就医' },
  { key: 'red', label: '带红', hex: '#B8433A', level: 'doctor', tip: '有血丝或红色，建议就医并带上照片或尿布' },
  { key: 'pale', label: '灰白/陶土', hex: '#D9D2C3', level: 'doctor', tip: '灰白、陶土色可能是胆道问题的信号，请尽快就医，越早越好' }
];

/** 便便性状 */
const POOP_TEXTURES = [
  { key: 'normal', label: '糊状' },
  { key: 'watery', label: '稀水样' },
  { key: 'hard', label: '干硬' }
];

/** 计时过长视为「可能忘了点结束」（分钟） */
const STALE_MIN = { feed: 90, sleep: 8 * 60 };

/** 忘了点结束时，建议的默认时长（分钟） */
const STALE_DEFAULT_MIN = { feed: 20, sleep: 90 };

module.exports = {
  DAILY_REF,
  FEED_KINDS,
  BOTTLE_ML,
  BOTTLE_TYPES,
  DIAPER_KINDS,
  POOP_COLORS,
  POOP_TEXTURES,
  STALE_MIN,
  STALE_DEFAULT_MIN
};

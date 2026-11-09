// data/clothing.js —— 穿衣推荐规则表
// 两维匹配：温度档（9 档）× 月龄阶段（5 段）→ 具体到款式与厚度的衣物
// 之前只有温度一个维度，会出现「8 个月宝宝穿开衫」这种不像婴儿装的建议。

// WMO 天气代码 → 中文描述 + 图标
const WMO = {
  0: { text: '晴', icon: '☀️' },
  1: { text: '晴间多云', icon: '🌤' },
  2: { text: '多云', icon: '⛅' },
  3: { text: '阴', icon: '☁️' },
  45: { text: '有雾', icon: '🌫' },
  48: { text: '雾凇', icon: '🌫' },
  51: { text: '小毛毛雨', icon: '🌦' },
  53: { text: '毛毛雨', icon: '🌦' },
  55: { text: '大毛毛雨', icon: '🌦' },
  56: { text: '冻毛毛雨', icon: '🌧' },
  57: { text: '冻毛毛雨', icon: '🌧' },
  61: { text: '小雨', icon: '🌧' },
  63: { text: '中雨', icon: '🌧' },
  65: { text: '大雨', icon: '🌧' },
  66: { text: '冻雨', icon: '🌧' },
  67: { text: '冻雨', icon: '🌧' },
  71: { text: '小雪', icon: '🌨' },
  73: { text: '中雪', icon: '🌨' },
  75: { text: '大雪', icon: '❄️' },
  77: { text: '米雪', icon: '🌨' },
  80: { text: '阵雨', icon: '🌦' },
  81: { text: '强阵雨', icon: '🌧' },
  82: { text: '暴雨', icon: '⛈' },
  85: { text: '阵雪', icon: '🌨' },
  86: { text: '强阵雪', icon: '❄️' },
  95: { text: '雷阵雨', icon: '⛈' },
  96: { text: '雷阵雨伴冰雹', icon: '⛈' },
  99: { text: '雷阵雨伴冰雹', icon: '⛈' }
};

const RAIN_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
const SNOW_CODES = [71, 73, 75, 77, 85, 86];

// 温度分档（按 maxTemp 升序匹配）。inner/outer 只作为兜底，
// 实际文案由下方的 AGE_STAGES 按宝宝月龄给出。
const BANDS = [
  {
    key: 'extreme',
    maxTemp: -0.1,
    label: '极冷',
    comfort: '严寒',
    inner: '保暖内衣 + 加绒内搭',
    outer: '厚羽绒服，尽量待在室内',
    hat: '厚毛线帽 + 手套 + 围脖',
    tip: '这个温度不建议长时间户外，出门控制在 20 分钟内'
  },
  {
    key: 'severe',
    maxTemp: 5.9,
    label: '严寒',
    comfort: '很冷',
    inner: '保暖内衣 + 抓绒长袖',
    outer: '厚羽绒服或加厚棉服',
    hat: '厚毛线帽 + 手套 + 厚袜',
    tip: '重点护住头、手、脚三个散热口，回室内及时减衣'
  },
  {
    key: 'verycold',
    maxTemp: 10.9,
    label: '较冷',
    comfort: '冷',
    inner: '保暖内衣 + 长袖棉毛衫',
    outer: '加厚棉服或羽绒服',
    hat: '毛线帽 + 手套',
    tip: '室内有暖气时，进屋先脱外套，避免捂出汗再受凉'
  },
  {
    key: 'cold',
    maxTemp: 14.9,
    label: '冷',
    comfort: '偏冷',
    inner: '保暖内衣 + 夹棉连体衣',
    outer: '夹棉外套或薄羽绒马甲',
    hat: '薄毛线帽',
    tip: '分层穿最实用：冷了加马甲，热了脱外套'
  },
  {
    key: 'chilly',
    maxTemp: 17.9,
    label: '凉',
    comfort: '凉爽',
    inner: '春秋连体衣 + 薄棉内衣',
    outer: '薄夹棉马甲或薄棉服',
    hat: '薄棉帽',
    tip: '风大时加一件防风外层，比单纯加厚更有效'
  },
  {
    key: 'cool',
    maxTemp: 20.9,
    label: '微凉',
    comfort: '舒适偏凉',
    inner: '春秋连体衣（薄棉长袖）',
    outer: '薄针织开衫或薄马甲',
    hat: '薄棉帽',
    tip: '典型的「早晚凉中午热」，靠一件可脱的外套解决'
  },
  {
    key: 'mild',
    maxTemp: 23.9,
    label: '舒适',
    comfort: '最舒服',
    inner: '薄棉长袖连体衣',
    outer: '早晚加一件薄马甲即可',
    hat: '薄棉帽（防晒用）',
    tip: '21-24℃ 是宝宝最舒服的区间，按「比大人多薄薄一层」就好'
  },
  {
    key: 'warm',
    maxTemp: 27.9,
    label: '偏热',
    comfort: '偏热',
    inner: '短袖连体衣',
    outer: '随身备一件薄开衫应对空调房',
    hat: '薄遮阳帽',
    tip: '出汗后及时换干衣服，比少穿更重要'
  },
  {
    key: 'hot',
    maxTemp: 99,
    label: '炎热',
    comfort: '热',
    inner: '纯棉短袖包屁衣',
    outer: '不需要外套',
    hat: '遮阳帽 + 防晒',
    tip: '选宽松透气的棉麻纱布，一天可以换 2-3 次'
  }
];

// 月龄阶段 × 温度档 → 具体衣物
// crawler（6-11 月）就是 8 个月宝宝所在的阶段：以连体衣、夹棉连体衣为主
const AGE_STAGES = [
  {
    key: 'newborn',
    min: 0,
    max: 2,
    label: '新生儿 0-3 月',
    tip: '以和尚服、包屁衣为主，前开襟换尿布不折腾脖子',
    sack: '一体式睡袋 / 襁褓（0.5-2.5 TOG）',
    sackNote: '会翻身之前可用襁褓，一旦会翻身必须停用，改用一体式睡袋',
    bands: {
      hot: { inner: '纯棉短袖和尚服 / 纱布包屁衣', outer: '不需要' },
      warm: { inner: '短袖包屁衣', outer: '薄纱布抱被（睡觉、外出时裹）' },
      mild: { inner: '长袖薄棉和尚服', outer: '薄棉抱被' },
      cool: { inner: '长袖和尚服 + 薄棉连体衣', outer: '夹棉抱被' },
      chilly: { inner: '夹棉和尚服', outer: '夹棉抱被 + 薄棉帽' },
      cold: { inner: '薄棉内衣 + 夹棉和尚服', outer: '厚抱被 / 夹棉连体外出服' },
      verycold: { inner: '保暖内衣 + 夹棉和尚服', outer: '连体棉服 + 厚包被 + 帽子' },
      severe: { inner: '保暖内衣 + 加厚夹棉和尚服', outer: '连体羽绒服 + 厚包被' },
      extreme: { inner: '保暖内衣 + 加厚夹棉', outer: '不建议外出，必须出门用抱被 + 车用挡风' }
    }
  },
  {
    key: 'young',
    min: 3,
    max: 5,
    label: '小婴儿 3-6 月',
    tip: '还不会独坐，优先连体衣，护住肚子不着凉',
    sack: '一体式睡袋（0.5-2.5 TOG）',
    sackNote: '这个阶段多数还不会翻身，睡袋比被子安全',
    bands: {
      hot: { inner: '纯棉短袖包屁衣', outer: '不需要' },
      warm: { inner: '短袖连体衣', outer: '薄棉抱被备用（空调房）' },
      mild: { inner: '薄棉长袖连体衣', outer: '薄棉马甲' },
      cool: { inner: '春秋连体衣（纯棉长袖）', outer: '薄针织开衫' },
      chilly: { inner: '春秋连体衣 + 薄棉内衣', outer: '夹棉马甲' },
      cold: { inner: '夹棉连体衣', outer: '棉外套（外出时加）' },
      verycold: { inner: '保暖内衣 + 夹棉连体衣', outer: '加厚夹棉连体 / 连体棉服' },
      severe: { inner: '保暖内衣 + 加厚夹棉连体衣', outer: '连体羽绒服 + 毛线帽' },
      extreme: { inner: '保暖内衣 + 加厚夹棉连体衣', outer: '尽量室内，短时外出用抱被加挡风' }
    }
  },
  {
    key: 'crawler',
    min: 6,
    max: 11,
    label: '爬行期 6-12 月',
    tip: '爬得多、容易出汗，连体衣最省心；别穿长袍式，容易绊住腿',
    sack: '分腿睡袋（0.5-3.0 TOG）',
    sackNote: '会爬会站了，分腿款不影响动作，也不会被踢开',
    bands: {
      hot: { inner: '纯棉短袖包屁衣 / 纱布连体衣', outer: '不需要' },
      warm: { inner: '短袖连体衣', outer: '薄棉开衫（空调房备用）' },
      mild: { inner: '薄棉长袖连体衣（春秋款）', outer: '早晚加薄棉马甲' },
      cool: { inner: '春秋连体衣 + 薄棉内衣', outer: '薄针织开衫或薄马甲' },
      chilly: { inner: '春秋连体衣（毛圈 / 加厚纯棉）', outer: '薄夹棉马甲' },
      cold: { inner: '夹棉连体衣', outer: '夹棉外出服或薄棉服' },
      verycold: { inner: '保暖内衣 + 夹棉连体衣', outer: '加厚夹棉连体 / 连体棉服' },
      severe: { inner: '保暖内衣 + 加厚夹棉连体衣', outer: '连体羽绒服 + 毛线帽 + 手套' },
      extreme: { inner: '保暖内衣 + 加厚夹棉连体衣', outer: '尽量室内，短时外出用抱被加挡风' }
    }
  },
  {
    key: 'toddler',
    min: 12,
    max: 23,
    label: '学步期 12-24 月',
    tip: '会走之后换分体更方便，但裤腰别太紧，纸尿裤要留空间',
    sack: '分腿睡袋（0.5-3.5 TOG）',
    sackNote: '踢被子最厉害的阶段，睡袋比盖被子靠谱',
    bands: {
      hot: { inner: '纯棉短袖 + 短裤', outer: '不需要' },
      warm: { inner: '短袖 T 恤 + 薄长裤', outer: '薄防晒外套' },
      mild: { inner: '长袖 T 恤 + 长裤', outer: '薄开衫' },
      cool: { inner: '长袖 T 恤 + 卫衣 + 长裤', outer: '薄外套' },
      chilly: { inner: '卫衣 + 长裤', outer: '薄夹棉外套' },
      cold: { inner: '加绒卫衣 + 加绒长裤', outer: '夹棉外套' },
      verycold: { inner: '保暖内衣 + 加绒卫衣 + 加绒裤', outer: '加厚棉服 / 羽绒服' },
      severe: { inner: '保暖内衣 + 抓绒上衣 + 加绒裤', outer: '羽绒服 + 毛线帽 + 手套' },
      extreme: { inner: '保暖内衣 + 抓绒上衣 + 加绒裤', outer: '厚羽绒，减少户外时间' }
    }
  },
  {
    key: 'kid',
    min: 24,
    max: 36,
    label: '幼儿期 24-36 月',
    tip: '活动量大，宁可少穿一件；选好穿脱的，让他自己来',
    sack: '分腿睡袋（0.5-3.5 TOG）',
    sackNote: '满 3 岁后可逐步过渡到薄被，但要等他不踢被子再说',
    bands: {
      hot: { inner: '纯棉短袖 + 短裤 / 连衣裙', outer: '不需要' },
      warm: { inner: '短袖 + 薄长裤', outer: '薄防晒衣' },
      mild: { inner: '长袖 T 恤 + 长裤', outer: '薄开衫' },
      cool: { inner: '长袖 T 恤 + 卫衣 + 长裤', outer: '薄外套' },
      chilly: { inner: '卫衣 + 长裤', outer: '夹棉马甲 / 薄棉服' },
      cold: { inner: '加绒卫衣 + 加绒长裤', outer: '夹棉外套' },
      verycold: { inner: '保暖内衣 + 毛衣 + 加绒裤', outer: '棉服 / 羽绒服' },
      severe: { inner: '保暖内衣 + 毛衣 + 加绒裤', outer: '羽绒服 + 帽子手套围巾' },
      extreme: { inner: '保暖内衣 + 毛衣 + 加绒裤', outer: '厚羽绒，减少户外时间' }
    }
  }
];

// 睡袋推荐表：按室内温度分段，全部展示，当前所在一行高亮
const SLEEP_BANDS = [
  {
    min: 28,
    max: 99,
    label: '≥28℃',
    tog: '0.2-0.5 TOG',
    text: '无袖睡袋，或只穿短袖包屁衣',
    note: '先想办法降温，别靠「少盖」硬扛'
  },
  {
    min: 26,
    max: 27.9,
    label: '26-27℃',
    tog: '0.5 TOG',
    text: '短袖包屁衣 + 0.5 TOG 睡袋',
    note: ''
  },
  {
    min: 24,
    max: 25.9,
    label: '24-25℃',
    tog: '1.0 TOG',
    text: '短袖 / 薄长袖连体衣 + 1.0 TOG 睡袋',
    note: '空调房最常见的一档'
  },
  {
    min: 21,
    max: 23.9,
    label: '21-23℃',
    tog: '1.5 TOG',
    text: '长袖连体衣 + 1.5 TOG 睡袋',
    note: '最舒服的室温区间'
  },
  {
    min: 18,
    max: 20.9,
    label: '18-20℃',
    tog: '2.5 TOG',
    text: '长袖连体衣 + 2.5 TOG 睡袋',
    note: ''
  },
  {
    min: 15,
    max: 17.9,
    label: '15-17℃',
    tog: '3.0 TOG',
    text: '加厚长袖连体衣 + 3.0 TOG 睡袋',
    note: '或用 2.5 TOG 睡袋 + 内搭加一件'
  },
  {
    min: -99,
    max: 14.9,
    label: '＜15℃',
    tog: '3.5 TOG',
    text: '3.5 TOG 睡袋 + 长袖保暖内衣',
    note: '婴儿房建议 20-24℃，先检查室温是否过低'
  }
];

module.exports = { WMO, RAIN_CODES, SNOW_CODES, BANDS, AGE_STAGES, SLEEP_BANDS };

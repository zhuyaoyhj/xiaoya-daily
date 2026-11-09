// data/vaccines.js —— 疫苗知识库（国家免疫规划 + 常见自费疫苗）
// 说明：接种程序与护理要点为通用科普，实际以接种门诊告知和疫苗说明书为准
// 结构：VACCINES 疫苗条目 / PHASES 接种后阶段护理 / COMMON 通用提醒 / PLAN 免疫规划程序表

/* ---------------- 接种后阶段（按经过小时数划分） ---------------- */

const PHASES = [
  {
    key: 'observe',
    from: 0,
    to: 0.5,
    label: '留观中',
    tone: 'urgent',
    tip: '现在还不能走，留观满 30 分钟再离开',
    items: [
      { when: '现在', t: '在接种门诊留观满 30 分钟，别提前离开', tag: '必做' },
      { when: '现在', t: '看脸色：苍白、出冷汗、嘴唇发紫、呼吸急，立刻叫护士', tag: '警惕' }
    ]
  },
  {
    key: 'day0',
    from: 0.5,
    to: 24,
    label: '接种当天',
    tone: 'care',
    tip: '重点是测体温和别碰针眼',
    items: [
      { when: '今天', t: '每 4 小时测一次体温，37.5℃ 以下多喂奶多休息就行', tag: '必做' },
      { when: '今天', t: '针眼别揉别抓，24 小时内不泡澡，淋浴避开针眼', tag: '护理' },
      { when: '今天', t: '比平时多喂一次奶或水，别加新辅食', tag: '饮食' },
      { when: '今天', t: '少去人多的地方，避免和正在生病的人接触', tag: '活动' },
      { when: '今晚', t: '睡觉比平时少盖一层，发热时捂着更危险', tag: '护理' }
    ]
  },
  {
    key: 'day3',
    from: 24,
    to: 72,
    label: '接种后 1-3 天',
    tone: 'care',
    tip: '反应大多集中在这两天，继续测体温',
    items: [
      { when: '这三天', t: '每天早晚各测一次体温，低热一般 48 小时内退', tag: '必做' },
      { when: '这三天', t: '针眼周围轻微红肿、有硬结是常见反应，别热敷别挤压', tag: '护理' },
      { when: '这三天', t: '辅食清淡、奶量正常，少吃容易过敏的新食物', tag: '饮食' },
      { when: '这三天', t: '精神好就可以正常活动，别做剧烈运动', tag: '活动' }
    ]
  },
  {
    key: 'week2',
    from: 72,
    to: 336,
    label: '接种后 3-14 天',
    tone: 'watch',
    tip: '减毒活疫苗的迟发反应多在这一周出现',
    items: [
      { when: '这一周', t: '麻腮风、乙脑、水痘这类活疫苗，可能在第 5-12 天才发热或出疹', tag: '观察' },
      { when: '这一周', t: '出现散在小红疹但精神好，通常 1-2 天自己退，不用涂药', tag: '观察' },
      { when: '这一周', t: '每天摸一次针眼，硬结在慢慢变小就不用管', tag: '护理' }
    ]
  },
  {
    key: 'later',
    from: 336,
    to: 1e9,
    label: '观察期已过',
    tone: 'done',
    tip: '这次接种的观察期结束了，正常照护即可',
    items: [
      { when: '现在', t: '针眼硬结可能还要几周才吸收完，不痛不红就不用处理', tag: '护理' },
      { when: '下次', t: '对照免疫规划表看下一针什么时候，提前一周安排时间', tag: '计划' }
    ]
  }
];

/* ---------------- 通用提醒（所有疫苗都带） ---------------- */

const COMMON = {
  before: [
    '接种前 30 分钟喂一次奶，别空腹也别吃太饱',
    '宝宝正在发热、腹泻或急性病期间，先和门诊确认要不要推迟',
    '带上预防接种证，穿前开襟、好脱的衣服'
  ],
  redFlags: [
    '体温 ≥38.5℃ 且退烧药后不退，或反复超过 24 小时',
    '精神差、嗜睡叫不醒、持续尖叫哭闹超过 3 小时',
    '呼吸急促、嘴唇发紫、全身荨麻疹、眼皮或嘴唇肿',
    '抽搐、肢体无力、脖子发硬',
    '针眼红肿范围持续扩大、化脓、流脓超过 3 天'
  ],
  emergency: '出现上面任何一条，直接去医院急诊，并告诉医生「今天接种了什么疫苗」。'
};

/* ---------------- 疫苗库 ---------------- */

const VACCINES = [
  /* ========== 一类疫苗（免费） ========== */
  {
    id: 'hepb',
    name: '乙肝疫苗',
    short: '乙肝',
    category: 'free',
    emoji: '🟡',
    route: '肌注',
    site: '新生儿大腿前外侧，大一点打上臂三角肌',
    doses: [
      { n: 1, month: 0, label: '出生 24 小时内' },
      { n: 2, month: 1, label: '1 月龄' },
      { n: 3, month: 6, label: '6 月龄' }
    ],
    before: ['母亲乙肝表面抗原阳性时，宝宝要在出生 12 小时内同时打疫苗和免疫球蛋白，务必提前告诉产科'],
    special: [
      { phase: 'day0', text: '第 1 剂是出生 24 小时内打的，这针不能拖——乙肝母婴阻断就靠这个时间窗' }
    ],
    reactions: [
      { name: '针眼轻微酸痛', window: [2, 48], tip: '不用处理，别揉' },
      { name: '低热 37.5℃ 左右', window: [6, 24], tip: '多喂奶，一般一天内退' }
    ],
    redFlags: ['出生 24 小时内没打上第 1 剂，尽快补种并告知医生']
  },
  {
    id: 'bcg',
    name: '卡介苗',
    short: '卡介苗',
    category: 'free',
    emoji: '⭕',
    route: '皮内注射',
    site: '左上臂三角肌中部',
    doses: [{ n: 1, month: 0, label: '出生时' }],
    before: ['出生体重 ≥2500g、没有严重黄疸或感染才能接种；早产或低体重儿等体重达标后补种'],
    special: [
      { phase: 'week2', text: '接种后 2-3 周针眼会红肿、化脓形成小溃疡，2-3 个月结痂留下卡疤——这是卡介苗的正常过程，不是感染' },
      { phase: 'week2', text: '局部化脓时别挤压、别涂药、别包扎，穿宽松衣服让它自然结痂' },
      { phase: 'week2', text: '洗澡时避开针眼，擦干保持干燥就行' },
      { phase: 'later', text: '卡疤是接种成功的标志，约九成宝宝会留下；满 3 个月还没有卡疤，回接种门诊复查是否接种成功' }
    ],
    reactions: [
      { name: '局部红肿 → 脓疱 → 结痂（约 2-3 个月）', window: [240, 4320], tip: '正常免疫反应，保持清洁干燥，别挤别涂药' },
      { name: '同侧腋下淋巴结轻度肿大（1cm 以内）', window: [336, 4320], tip: '多数会自行消退，别去按摩' }
    ],
    redFlags: [
      '腋下淋巴结肿大超过 1cm、变软或化脓',
      '局部溃疡超过 3 个月不愈合',
      '接种后 3 个月没有留下卡疤（需复查是否接种成功）'
    ]
  },
  {
    id: 'polio',
    name: '脊灰疫苗',
    short: '脊灰',
    category: 'free',
    emoji: '💧',
    route: '前两剂注射，后两剂口服',
    site: '上臂三角肌注射 / 口服滴剂',
    doses: [
      { n: 1, month: 2, label: '2 月龄（IPV 注射）' },
      { n: 2, month: 3, label: '3 月龄（IPV 注射）' },
      { n: 3, month: 4, label: '4 月龄（bOPV 口服）' },
      { n: 4, month: 48, label: '4 岁（bOPV 口服）' }
    ],
    before: ['口服减毒活疫苗（bOPV）前后 30 分钟不吃热食、不喝热水，热会杀死疫苗病毒', '免疫缺陷、正在用激素或免疫抑制剂的宝宝不能服减毒活疫苗，要改打 IPV'],
    special: [
      { phase: 'day0', text: '这剂是口服滴剂：服完 30 分钟内别喂热水、别喂热奶，吐出来要告诉医生补服' },
      { phase: 'day3', text: '口服疫苗后 1-2 天大便可能偏稀，注意换尿布后洗手' }
    ],
    reactions: [
      { name: '口服后轻微腹泻', window: [6, 72], tip: '多数 1-2 天自愈，注意补液和臀部护理' }
    ],
    redFlags: ['服苗后出现持续呕吐、明显乏力或肢体活动不对称，立即就医']
  },
  {
    id: 'dtap',
    name: '百白破疫苗',
    short: '百白破',
    category: 'free',
    emoji: '🛡',
    route: '肌注',
    site: '上臂三角肌或大腿前外侧',
    doses: [
      { n: 1, month: 3, label: '3 月龄' },
      { n: 2, month: 4, label: '4 月龄' },
      { n: 3, month: 5, label: '5 月龄' },
      { n: 4, month: 18, label: '18 月龄加强' }
    ],
    before: ['既往接种后出现过高热、抽搐或严重过敏，要先告诉医生评估'],
    special: [
      { phase: 'day0', text: '这针反应相对明显：不少宝宝在 4-6 小时后开始低热，今天别安排出门和洗澡' },
      { phase: 'day3', text: '低热一般 48 小时内退；针眼硬结可能要 1-2 个月才吸收完，不红不痛就别管它，别用力揉' }
    ],
    reactions: [
      { name: '发热 37.5-38.5℃', window: [4, 48], tip: '多喂奶、少盖一层，必要时按体重用退烧药' },
      { name: '针眼红肿、硬结', window: [2, 72], tip: '别揉别挤压，红肿明显可隔衣冷敷 10 分钟' },
      { name: '烦躁、食欲下降、嗜睡', window: [4, 48], tip: '多在 1-2 天内缓解，精神差要就医' }
    ],
    redFlags: ['高热 ≥39℃', '持续尖叫哭闹超过 3 小时', '抽搐', '针眼红肿直径超过 5cm 并持续扩大']
  },
  {
    id: 'dt',
    name: '白破疫苗',
    short: '白破',
    category: 'free',
    emoji: '🛡',
    route: '肌注',
    site: '上臂三角肌',
    doses: [{ n: 1, month: 72, label: '6 岁' }],
    before: ['6 岁加强针，接种前确认近一个月没有接种过其他减毒活疫苗'],
    special: [],
    reactions: [
      { name: '针眼红肿疼痛', window: [2, 48], tip: '别揉，避免提重物' },
      { name: '低热、乏力', window: [6, 48], tip: '多喝水，两天内缓解' }
    ],
    redFlags: ['高热 ≥39℃', '局部红肿范围持续扩大']
  },
  {
    id: 'mmr',
    name: '麻腮风疫苗',
    short: '麻腮风',
    category: 'free',
    emoji: '🔴',
    route: '皮下注射',
    site: '上臂外侧三角肌下缘',
    doses: [
      { n: 1, month: 8, label: '8 月龄' },
      { n: 2, month: 18, label: '18 月龄' }
    ],
    before: ['对鸡蛋严重过敏、正在用免疫球蛋白的宝宝要提前告知医生'],
    special: [
      { phase: 'week2', text: '这是减毒活疫苗：发热和皮疹常在第 5-12 天才出现，不是「打了马上有反应」' },
      { phase: 'week2', text: '出疹是疫苗株病毒引起的，不是得了麻疹，精神好、疹子散在就不用处理，1-2 天自退' },
      { phase: 'week2', text: '这期间如果发热，按普通发热护理，别因为「刚打过疫苗」就不敢用退烧药' }
    ],
    reactions: [
      { name: '一过性发热（多在 5-12 天）', window: [120, 288], tip: '多为低热，1-2 天退，多喂奶多休息' },
      { name: '散在淡红皮疹（多在 5-12 天）', window: [120, 288], tip: '不痒不痛，1-2 天自行消退，不用涂药' },
      { name: '轻微腮腺肿大', window: [168, 336], tip: '少见，1-3 天自退，别按揉' }
    ],
    redFlags: ['高热 ≥39℃ 持续超过 3 天', '皮疹密集融合、伴精神差', '抽搐']
  },
  {
    id: 'je',
    name: '乙脑减毒活疫苗',
    short: '乙脑',
    category: 'free',
    emoji: '🦟',
    route: '皮下注射',
    site: '上臂外侧三角肌下缘',
    doses: [
      { n: 1, month: 8, label: '8 月龄' },
      { n: 2, month: 24, label: '2 岁' }
    ],
    before: ['乙脑流行季（7-9 月）前完成接种效果最好'],
    special: [
      { phase: 'week2', text: '也是减毒活疫苗，少数宝宝在接种后 1-2 周出现低热，通常 1-2 天退' }
    ],
    reactions: [
      { name: '低热（多在 1-2 周内）', window: [168, 336], tip: '多喝水，物理降温即可' },
      { name: '针眼轻微红肿', window: [2, 48], tip: '别揉，保持干燥' }
    ],
    redFlags: ['高热不退', '精神差、嗜睡、呕吐频繁']
  },
  {
    id: 'mena',
    name: 'A 群流脑多糖疫苗',
    short: 'A 群流脑',
    category: 'free',
    emoji: '🧫',
    route: '皮下注射',
    site: '上臂外侧三角肌附着处',
    doses: [
      { n: 1, month: 6, label: '6 月龄' },
      { n: 2, month: 9, label: '9 月龄' }
    ],
    before: ['两剂间隔不少于 3 个月'],
    special: [],
    reactions: [
      { name: '针眼红肿、轻微疼痛', window: [2, 48], tip: '别揉，1-2 天消退' },
      { name: '低热', window: [6, 48], tip: '多喂奶，一般不超过 38.5℃' }
    ],
    redFlags: ['高热 ≥39℃', '全身皮疹、呼吸急促']
  },
  {
    id: 'menac',
    name: 'A+C 群流脑多糖疫苗',
    short: 'A+C 流脑',
    category: 'free',
    emoji: '🧫',
    route: '皮下注射',
    site: '上臂外侧三角肌附着处',
    doses: [
      { n: 1, month: 36, label: '3 岁' },
      { n: 2, month: 72, label: '6 岁' }
    ],
    before: ['与 A 群流脑最后一剂间隔不少于 1 年'],
    special: [],
    reactions: [
      { name: '针眼红肿', window: [2, 48], tip: '别揉，保持清洁' },
      { name: '低热、乏力', window: [6, 48], tip: '多喝水，两天内缓解' }
    ],
    redFlags: ['高热 ≥39℃', '全身荨麻疹']
  },
  {
    id: 'hepa',
    name: '甲肝减毒活疫苗',
    short: '甲肝',
    category: 'free',
    emoji: '🟠',
    route: '皮下注射',
    site: '上臂外侧三角肌下缘',
    doses: [{ n: 1, month: 18, label: '18 月龄' }],
    before: ['选减毒活疫苗还是灭活疫苗，按当地门诊供应和医生建议定'],
    special: [
      { phase: 'week2', text: '减毒活疫苗少数宝宝在 1-2 周内有低热，1-2 天自退' }
    ],
    reactions: [
      { name: '低热（多在 1-2 周内）', window: [168, 336], tip: '多喝水，观察精神' },
      { name: '针眼红肿', window: [2, 48], tip: '别揉，保持干燥' }
    ],
    redFlags: ['高热不退', '黄疸、尿色加深、精神差']
  },

  /* ========== 二类疫苗（自费，按需选择） ========== */
  {
    id: 'pcv13',
    name: '13 价肺炎球菌结合疫苗',
    short: '13 价肺炎',
    category: 'paid',
    emoji: '🫁',
    route: '肌注',
    site: '大腿前外侧（婴儿）或上臂三角肌',
    doses: [
      { n: 1, month: 2, label: '2 月龄（或 3 月龄起）' },
      { n: 2, month: 4, label: '4 月龄' },
      { n: 3, month: 6, label: '6 月龄' },
      { n: 4, month: 12, label: '12-15 月龄加强' }
    ],
    before: ['不同厂家程序不同（2/4/6/12 或 3/4/5/12），按门诊给的方案走'],
    special: [
      { phase: 'day3', text: '这针发热比例相对高，接种后 48 小时内最需要盯体温' },
      { phase: 'day3', text: '针眼红肿可能比较明显，别包扎，穿宽松衣服' }
    ],
    reactions: [
      { name: '发热（可到 38.5℃）', window: [4, 48], tip: '按体重用退烧药，多喂奶，48 小时内多能退' },
      { name: '针眼红肿、触痛', window: [2, 72], tip: '别揉，可隔衣冷敷' },
      { name: '烦躁、嗜睡、食欲下降', window: [4, 48], tip: '1-2 天缓解，精神差要就医' }
    ],
    redFlags: ['高热 ≥39℃ 或发热超过 48 小时', '针眼红肿直径 >5cm', '精神差、拒奶']
  },
  {
    id: 'penta',
    name: '五联疫苗（百白破 + 脊灰 + Hib）',
    short: '五联',
    category: 'paid',
    emoji: '🖐',
    route: '肌注',
    site: '大腿前外侧',
    doses: [
      { n: 1, month: 2, label: '2 月龄' },
      { n: 2, month: 3, label: '3 月龄' },
      { n: 3, month: 4, label: '4 月龄' },
      { n: 4, month: 18, label: '18 月龄加强' }
    ],
    before: ['打了五联就不用再单独打百白破、脊灰和 Hib，别重复接种', '和免费方案转换时按门诊给出的替换方案执行'],
    special: [
      { phase: 'day3', text: '一针顶三针，反应也比单针多一些：发热和局部红肿都属常见' }
    ],
    reactions: [
      { name: '发热 37.5-38.5℃', window: [4, 48], tip: '多喂奶，必要时用退烧药' },
      { name: '针眼红肿硬结', window: [2, 72], tip: '别揉，硬结可能数周才吸收' },
      { name: '烦躁、嗜睡', window: [4, 48], tip: '多在 1-2 天缓解' }
    ],
    redFlags: ['高热 ≥39℃', '持续尖叫哭闹超过 3 小时', '抽搐']
  },
  {
    id: 'hib',
    name: 'Hib 疫苗（b 型流感嗜血杆菌）',
    short: 'Hib',
    category: 'paid',
    emoji: '🧬',
    route: '肌注',
    site: '大腿前外侧或上臂三角肌',
    doses: [
      { n: 1, month: 2, label: '2 月龄' },
      { n: 2, month: 3, label: '3 月龄' },
      { n: 3, month: 4, label: '4 月龄' },
      { n: 4, month: 18, label: '18 月龄加强' }
    ],
    before: ['已经在打五联的宝宝不需要再单独打 Hib'],
    special: [],
    reactions: [
      { name: '针眼红肿', window: [2, 48], tip: '别揉，1-2 天消退' },
      { name: '低热', window: [6, 48], tip: '多喂奶，观察精神' }
    ],
    redFlags: ['高热 ≥39℃', '全身皮疹']
  },
  {
    id: 'rota',
    name: '轮状病毒疫苗',
    short: '轮状',
    category: 'paid',
    emoji: '💧',
    route: '口服',
    site: '口服，不注射',
    doses: [
      { n: 1, month: 2, label: '6-12 周龄' },
      { n: 2, month: 3, label: '间隔 4-10 周' },
      { n: 3, month: 4, label: '32 周龄内完成' }
    ],
    before: ['口服疫苗，服苗前 30 分钟别喂奶喂水，避免吐出来', '有肠套叠病史、消化道畸形、免疫缺陷的宝宝不能接种'],
    special: [
      { phase: 'day0', text: '口服的，吐出来要补服；服完 30 分钟内别喂热水热奶' },
      { phase: 'day3', text: '疫苗病毒会随大便排出，换尿布后一定洗手' }
    ],
    reactions: [
      { name: '轻微腹泻、呕吐', window: [6, 72], tip: '1-2 天自愈，注意补液防脱水' },
      { name: '烦躁、食欲下降', window: [6, 48], tip: '少量多次喂，观察尿量' }
    ],
    redFlags: [
      '阵发性剧烈哭闹（蜷腿、面色发白）、呕吐、果酱样大便——警惕肠套叠，立刻急诊',
      '尿量明显减少、口干、哭时无泪（脱水表现）'
    ]
  },
  {
    id: 'ev71',
    name: '手足口病疫苗（EV71）',
    short: '手足口',
    category: 'paid',
    emoji: '🖐',
    route: '肌注',
    site: '上臂三角肌',
    doses: [
      { n: 1, month: 6, label: '6 月龄起' },
      { n: 2, month: 7, label: '间隔 1 个月' }
    ],
    before: ['建议 12 月龄前完成两剂，5 岁以上一般不接种'],
    special: [
      { phase: 'day0', text: '只预防 EV71 型引起的手足口病（重症主要来自这一型），其他型别仍可能感染' }
    ],
    reactions: [
      { name: '针眼红肿疼痛', window: [2, 72], tip: '别揉，保持清洁干燥' },
      { name: '发热、腹泻', window: [6, 48], tip: '多在 1-2 天缓解，多喂水' }
    ],
    redFlags: ['高热 ≥39℃', '高热伴手足口疱疹（那是感染不是疫苗反应）']
  },
  {
    id: 'var',
    name: '水痘疫苗',
    short: '水痘',
    category: 'paid',
    emoji: '🔵',
    route: '皮下注射',
    site: '上臂外侧三角肌下缘',
    doses: [
      { n: 1, month: 12, label: '12 月龄' },
      { n: 2, month: 48, label: '4 岁' }
    ],
    before: ['正在用激素或免疫抑制剂的宝宝要延期接种'],
    special: [
      { phase: 'week2', text: '接种后 2-3 周可能出现几个水痘样小疹子，是疫苗株引起的，比自然感染轻得多，1 周内自退' },
      { phase: 'week2', text: '疹子破了保持清洁干燥，别涂激素类药膏' },
      { phase: 'later', text: '接种后 2-3 周才出现的少量水痘样疹子仍属疫苗反应；如果疹子密集、伴高热，按感染就医' }
    ],
    reactions: [
      { name: '少量水痘样皮疹（2-3 周）', window: [336, 504], tip: '数量少、症状轻，保持清洁，别抓破' },
      { name: '低热', window: [6, 336], tip: '多喝水，观察精神' }
    ],
    redFlags: ['皮疹密集、伴高热', '疹子化脓或红肿扩大']
  },
  {
    id: 'flu',
    name: '流感疫苗',
    short: '流感',
    category: 'paid',
    emoji: '❄️',
    route: '肌注（部分鼻喷为鼻内）',
    site: '上臂三角肌',
    doses: [
      { n: 1, month: 6, label: '6 月龄起，每年一次' },
      { n: 2, month: 7, label: '首次接种需 2 剂，间隔 4 周' }
    ],
    before: [
      '每年都要打，最好在 10 月底前完成，抗体要 2-4 周才起效',
      '6 月龄以下不能接种，靠家里人接种形成保护圈'
    ],
    special: [
      { phase: 'day3', text: '这针和普通疫苗一样，但流感的「接种后乏力酸痛」比别的疫苗明显一点，多休息' },
      { phase: 'day3', text: '接种后仍可能得流感（疫苗覆盖毒株有限），但重症风险低很多，不是白打' }
    ],
    reactions: [
      { name: '针眼酸痛、轻微红肿', window: [2, 48], tip: '别揉，1-2 天消退' },
      { name: '低热、乏力、肌肉酸痛', window: [6, 48], tip: '多喝水多休息，多在 1-2 天缓解' }
    ],
    redFlags: ['高热 ≥39℃', '呼吸困难、喘']
  },
  {
    id: 'hepai',
    name: '甲肝灭活疫苗',
    short: '甲肝灭活',
    category: 'paid',
    emoji: '🟠',
    route: '肌注',
    site: '上臂三角肌',
    doses: [
      { n: 1, month: 18, label: '18 月龄' },
      { n: 2, month: 24, label: '间隔 6 个月' }
    ],
    before: ['灭活疫苗需打 2 剂，保护期比减毒活疫苗长；和减毒活疫苗二选一，别混着打'],
    special: [],
    reactions: [
      { name: '针眼红肿、疼痛', window: [2, 48], tip: '别揉，1-2 天消退' },
      { name: '低热、头痛', window: [6, 48], tip: '多喝水，观察精神' }
    ],
    redFlags: ['高热 ≥39℃', '全身荨麻疹']
  }
];

/* ---------------- 免疫规划程序表（按接种月龄排序） ---------------- */
// 只用一类疫苗排程；二类疫苗由家长自行选择，不进「该打了」提醒

const PLAN = [
  { vaccine: 'hepb', dose: 1, month: 0, label: '出生 24 小时内' },
  { vaccine: 'bcg', dose: 1, month: 0, label: '出生时' },
  { vaccine: 'hepb', dose: 2, month: 1, label: '1 月龄' },
  { vaccine: 'polio', dose: 1, month: 2, label: '2 月龄' },
  { vaccine: 'dtap', dose: 1, month: 3, label: '3 月龄' },
  { vaccine: 'polio', dose: 2, month: 3, label: '3 月龄' },
  { vaccine: 'dtap', dose: 2, month: 4, label: '4 月龄' },
  { vaccine: 'polio', dose: 3, month: 4, label: '4 月龄' },
  { vaccine: 'dtap', dose: 3, month: 5, label: '5 月龄' },
  { vaccine: 'hepb', dose: 3, month: 6, label: '6 月龄' },
  { vaccine: 'mena', dose: 1, month: 6, label: '6 月龄' },
  { vaccine: 'mmr', dose: 1, month: 8, label: '8 月龄' },
  { vaccine: 'je', dose: 1, month: 8, label: '8 月龄' },
  { vaccine: 'mena', dose: 2, month: 9, label: '9 月龄' },
  { vaccine: 'hepa', dose: 1, month: 18, label: '18 月龄' },
  { vaccine: 'dtap', dose: 4, month: 18, label: '18 月龄加强' },
  { vaccine: 'mmr', dose: 2, month: 18, label: '18 月龄' },
  { vaccine: 'je', dose: 2, month: 24, label: '2 岁' },
  { vaccine: 'menac', dose: 1, month: 36, label: '3 岁' },
  { vaccine: 'polio', dose: 4, month: 48, label: '4 岁' },
  { vaccine: 'dt', dose: 1, month: 72, label: '6 岁' },
  { vaccine: 'menac', dose: 2, month: 72, label: '6 岁' }
];

module.exports = {
  VACCINES,
  PHASES,
  COMMON,
  PLAN
};

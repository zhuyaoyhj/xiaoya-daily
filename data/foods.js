// data/foods.js —— 辅食知识库
// 结构对齐 data/vaccines.js：静态数据 + 规则表，零网络、零函数
//
// 内容依据：中国居民膳食指南（婴幼儿喂养）、WHO 辅食添加建议、
// 以及 LEAP 研究后关于高致敏食材「早引入而非推迟」的主流共识。
// 全部为通用科普，具体以儿科医生与儿保门诊的个体化建议为准。

/* ---------------- 4-6 月龄：先判断「准备好没」 ---------------- */

const READY = {
  title: '还没到辅食月龄，先看这几个信号',
  signs: [
    '挺舌反射消失：勺子放进嘴里不会用舌头顶出来',
    '能靠坐、头部稳定：扶着能坐住，脖子不晃',
    '对大人的饭感兴趣：盯着看、伸手抓、嘴巴跟着动',
    '体重达到出生时的 2 倍左右，且不少于 6kg',
    '吃完奶仍显饿，夜醒增多（只是参考，不是唯一标准）'
  ],
  note: '一般满 6 月龄（180 天）开始最稳妥，不早于 4 月龄。早产宝宝按矫正月龄算。什么时候开始，最终以儿保医生的评估为准。'
};

/* ---------------- 5 个阶段 ---------------- */

const STAGES = [
  {
    key: 's68',
    min: 6,
    max: 8,
    label: '6-8 个月',
    tag: '初添期',
    texture: '稀糊 → 稠糊 → 带小颗粒的泥',
    meals: '1-2 餐/天',
    milk: '奶仍是主食，每天 600-800ml',
    portion: '第一口 1-2 小勺，逐步到每餐半碗（约 100-150g）',
    iron: '6 月龄后从母体获得的铁基本用完，第一口必须是强化铁米粉，之后尽快加红肉泥、肝泥',
    order: [
      'rice_cereal', 'pumpkin', 'carrot', 'apple', 'banana', 'potato',
      'broccoli', 'egg_yolk', 'pork', 'spinach', 'avocado', 'beef',
      'pork_liver', 'cod', 'pear', 'millet', 'tofu', 'chicken',
      'sweet_potato', 'oat', 'zucchini', 'pea', 'yogurt', 'salmon'
    ],
    avoid: [
      '盐、糖、酱油等任何调味料',
      '蜂蜜（1 岁前有肉毒杆菌中毒风险）',
      '整颗坚果、果冻、整粒葡萄（窒息风险）',
      '用果汁代替水果',
      '鲜牛奶当主要奶源'
    ],
    tips: [
      '一次只加一种新食材，观察 2-3 天没问题再加下一种',
      '新食材安排在上午或中午，出现反应还有时间去医院',
      '从稀到稠、从少到多、从单一到混合，每一步都别跳',
      '刚开始吃进去的没有吐出来的多，正常，别硬喂'
    ]
  },
  {
    key: 's911',
    min: 9,
    max: 11,
    label: '9-11 个月',
    tag: '颗粒期',
    texture: '细颗粒 → 软烂小丁，开始练咀嚼',
    meals: '2-3 餐/天，可加 1 次点心',
    milk: '每天 600-700ml',
    portion: '每餐约 150-200g，主食与菜各占一半',
    iron: '红肉、肝、强化铁米粉继续每天有，别断',
    order: [
      'noodle', 'tomato', 'chicken', 'beef', 'bass', 'shrimp',
      'mushroom', 'chinese_cabbage', 'peach', 'blueberry', 'cheese',
      'red_bean', 'sesame_paste', 'egg_white', 'peanut_butter',
      'winter_melon', 'eggplant', 'cucumber', 'yam', 'lamb'
    ],
    avoid: [
      '盐、糖、蜂蜜（蜂蜜满 1 岁后才能吃）',
      '整颗坚果、果冻、爆米花、整粒葡萄',
      '含汞高的大型鱼（金枪鱼、剑鱼、鲨鱼）',
      '腌制品、蜜饯、含糖饮料'
    ],
    tips: [
      '手指食物可以上了：蒸软的胡萝卜条、南瓜条，让宝宝自己抓着吃',
      '开始练杯子喝水，别一直用奶瓶',
      '这一阶段最容易出现「只吃白饭不吃菜」，别追着喂，下顿再试',
      '便便里看到没消化的菜叶是正常的，咀嚼能力还没跟上'
    ]
  },
  {
    key: 's1217',
    min: 12,
    max: 17,
    label: '12-17 个月',
    tag: '自主进食期',
    texture: '软烂家常菜，切成小块',
    meals: '3 餐 + 1-2 次加餐',
    milk: '每天 400-500ml，可引入鲜牛奶',
    portion: '每餐约 200-250g，跟大人碗的七八分满',
    iron: '铁需求仍高，每周至少 2 次动物肝或红肉',
    order: [
      'whole_egg', 'orange', 'strawberry', 'kiwi', 'mango', 'crab',
      'corn', 'tofu', 'shiitake', 'kelp', 'lotus', 'onion',
      'yogurt', 'walnut', 'edamame', 'soy_milk', 'milk'
    ],
    avoid: [
      '蜂蜜（满 1 岁后才解禁，仍要少量）',
      '整颗坚果、果冻、整粒葡萄（窒息风险到 4 岁）',
      '高盐加工食品（火腿、香肠、咸菜）',
      '含糖饮料、茶、咖啡'
    ],
    tips: [
      '开始自己拿勺子，弄得到处都是是必经过程，铺张报纸就好',
      '和大人同桌吃饭，但菜要单独盛、单独切',
      '1 岁后可以吃少量盐，但越少越好，一天不超过 1.5g',
      '奶量别超过 500ml，喝太多奶会挤掉吃饭的胃口'
    ]
  },
  {
    key: 's1823',
    min: 18,
    max: 23,
    label: '18-23 个月',
    tag: '家庭餐过渡',
    texture: '接近家常菜，仍需切小、煮软',
    meals: '3 餐 + 2 次加餐',
    milk: '每天 350-500ml',
    portion: '每餐约 250g，可参考成人食量的 1/3-1/2',
    iron: '每周 1-2 次肝，红肉每周 3-4 次',
    order: [
      'bass', 'corn', 'tomato', 'beef', 'shrimp', 'spinach',
      'broccoli', 'almond', 'peanut_butter', 'cheese', 'red_bean',
      'shiitake', 'kelp'
    ],
    avoid: [
      '整颗坚果、果冻、整粒葡萄、QQ 糖（4 岁前都是窒息高危）',
      '腌制品、蜜饯、高盐零食',
      '含糖饮料、茶、咖啡',
      '生鱼片、半熟蛋（沙门氏菌与寄生虫风险）'
    ],
    tips: [
      '挑食高峰在这一年，一种食材可能要试 10 次以上才接受，别放弃也别强迫',
      '让他参与摆碗筷、挑菜，参与感能明显提升接受度',
      '三餐时间固定，加餐和正餐间隔至少 1.5 小时',
      '果汁不如整个水果，一天水果 100-150g 就够'
    ]
  },
  {
    key: 's2436',
    min: 24,
    max: 36,
    label: '24-36 个月',
    tag: '同桌同食',
    texture: '家常饭菜，注意去骨去刺、切成适口大小',
    meals: '3 餐 + 2 次加餐',
    milk: '每天 300-500ml',
    portion: '每餐约 250-300g，接近成人一半',
    iron: '保持每周 1-2 次肝、经常吃红肉',
    order: [
      'bass', 'shrimp', 'beef', 'spinach', 'carrot', 'broccoli',
      'tofu', 'egg_yolk', 'millet', 'oat', 'apple', 'banana'
    ],
    avoid: [
      '整颗坚果、果冻、整粒葡萄（4 岁前）',
      '高盐高糖零食、含糖饮料',
      '茶、咖啡（影响铁吸收）',
      '酒酿、含酒精的菜'
    ],
    tips: [
      '可以和大人吃一样的菜了，但味道要淡、块要小',
      '每天保证一个蛋、一份肉、一份奶、一份蔬果、一份主食',
      '喝奶用杯子，睡前奶喝完要刷牙',
      '生长速度比第一年慢很多，别拿「吃得少」当病'
    ]
  }
];

/* ---------------- 8 组常见致敏食材 ---------------- */

const ALLERGENS = [
  {
    key: 'egg', name: '蛋类', emoji: '🥚', firstMonth: 6,
    tip: '蛋黄 6 月龄就能试，从 1/4 个开始；蛋白 8 月龄后加。不要因为怕过敏就推迟——推迟反而更容易过敏。'
  },
  {
    key: 'milk', name: '奶制品', emoji: '🥛', firstMonth: 8,
    tip: '1 岁前不能拿鲜牛奶当主奶源，但无糖酸奶、奶酪 8 月龄后可以少量当辅食。牛奶蛋白过敏的宝宝遵医嘱。'
  },
  {
    key: 'wheat', name: '小麦', emoji: '🌾', firstMonth: 8,
    tip: '面条、馒头 8 月龄后试。小麦过敏多表现为湿疹加重或腹泻，不是每次都起疹子。'
  },
  {
    key: 'soy', name: '大豆', emoji: '🫘', firstMonth: 7,
    tip: '从豆腐开始，比整颗黄豆安全得多。豆浆要满 1 岁、且不作为主奶。'
  },
  {
    key: 'fish', name: '鱼类', emoji: '🐟', firstMonth: 7,
    tip: '选低汞鱼：鳕鱼、鲈鱼、三文鱼、龙利鱼。金枪鱼、剑鱼这类大型鱼含汞高，3 岁前不吃。'
  },
  {
    key: 'shellfish', name: '甲壳类', emoji: '🦐', firstMonth: 12,
    tip: '虾蟹过敏风险相对高，建议满 1 岁后少量试，第一次安排在上午，吃完 2 小时内别出门。'
  },
  {
    key: 'peanut', name: '花生', emoji: '🥜', firstMonth: 6,
    tip: '花生酱用温水或奶稀释后，6-11 月龄之间引入，不要推迟——这是目前证据最明确的一条。整颗花生 4 岁前绝对不行。'
  },
  {
    key: 'treenut', name: '坚果', emoji: '🌰', firstMonth: 10,
    tip: '核桃、杏仁磨成粉或做成酱少量试。整颗、碎粒都不行，4 岁前窒息风险高。'
  }
];

/* ---------------- 食材库（约 70 种） ---------------- */
// group: grain 谷薯 | veg 蔬菜 | fruit 水果 | meat 肉 | liver 肝 | fish 鱼虾
//        egg 蛋 | dairy 奶 | bean 豆 | nut 坚果 | oil 油

const FOODS = [
  // ---- 谷薯 grain ----
  { id: 'rice_cereal', name: '强化铁米粉', emoji: '🥣', group: 'grain', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: true, how: '40-50℃ 温水或母乳冲调，调成能挂住勺子的稀糊，不加糖盐', note: '第一口辅食首选，铁含量是自制米糊比不了的' },
  { id: 'rice', name: '大米软饭', emoji: '🍚', group: 'grain', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: false, how: '米水 1:5 煮到软烂，8 月龄后过渡到 1:3', note: '' },
  { id: 'millet', name: '小米', emoji: '🌾', group: 'grain', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: false, how: '小米粥取上层米油，或与大米同煮', note: '好消化，适合刚加辅食的肠胃' },
  { id: 'oat', name: '燕麦', emoji: '🥣', group: 'grain', fromMonth: 8, allergen: false, allergenGroup: '', ironRich: false, how: '即食燕麦煮软，或用配方奶泡软', note: '膳食纤维高，别一次吃太多' },
  { id: 'noodle', name: '宝宝面条', emoji: '🍜', group: 'grain', fromMonth: 8, allergen: true, allergenGroup: 'wheat', ironRich: false, how: '煮到用勺背一压就断，剪成 2cm 小段', note: '小麦制品，第一次少量试' },
  { id: 'steamed_bun', name: '馒头', emoji: '🍞', group: 'grain', fromMonth: 10, allergen: true, allergenGroup: 'wheat', ironRich: false, how: '撕成小块，配汤或奶吃，别干噎', note: '' },
  { id: 'potato', name: '土豆', emoji: '🥔', group: 'grain', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '蒸熟压泥，用奶调稀', note: '发芽、发绿的土豆不能吃' },
  { id: 'sweet_potato', name: '红薯', emoji: '🍠', group: 'grain', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '蒸熟压泥，可拌米粉', note: '容易胀气，一次别多' },
  { id: 'yam', name: '山药', emoji: '🍥', group: 'grain', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: false, how: '蒸熟压泥，或切段蒸软做手指食物', note: '削皮时黏液可能刺手，戴手套' },
  { id: 'corn', name: '玉米', emoji: '🌽', group: 'grain', fromMonth: 12, allergen: false, allergenGroup: '', ironRich: false, how: '玉米粒去皮打泥，或整段煮熟啃', note: '整粒玉米难消化，1 岁后再试' },

  // ---- 蔬菜 veg ----
  { id: 'pumpkin', name: '南瓜', emoji: '🎃', group: 'veg', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '去皮切块蒸 12 分钟，压泥', note: '天然带甜味，接受度高，适合当第一种蔬菜' },
  { id: 'carrot', name: '胡萝卜', emoji: '🥕', group: 'veg', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '蒸软压泥，或切条蒸到能捏碎做手指食物', note: '生胡萝卜条太硬，会噎' },
  { id: 'broccoli', name: '西兰花', emoji: '🥦', group: 'veg', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: false, how: '只取花球，蒸 8 分钟压泥，或整朵蒸软给手抓', note: '梗纤维粗，先别给' },
  { id: 'spinach', name: '菠菜', emoji: '🥬', group: 'veg', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: true, how: '焯水 1 分钟去草酸，切碎拌粥或压泥', note: '菠菜的铁吸收率低，不能当补铁主力' },
  { id: 'chinese_cabbage', name: '白菜', emoji: '🥬', group: 'veg', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: false, how: '取嫩叶切碎煮软', note: '' },
  { id: 'zucchini', name: '西葫芦', emoji: '🥒', group: 'veg', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: false, how: '去皮去籽蒸软压泥', note: '水分多，好压泥' },
  { id: 'winter_melon', name: '冬瓜', emoji: '🥒', group: 'veg', fromMonth: 8, allergen: false, allergenGroup: '', ironRich: false, how: '去皮去瓤煮软压泥', note: '' },
  { id: 'tomato', name: '番茄', emoji: '🍅', group: 'veg', fromMonth: 8, allergen: false, allergenGroup: '', ironRich: false, how: '开水烫去皮，去籽切碎炒软', note: '酸度高，口周可能发红，不是过敏' },
  { id: 'pea', name: '豌豆', emoji: '🫛', group: 'veg', fromMonth: 8, allergen: false, allergenGroup: '', ironRich: false, how: '煮软去皮压泥，或买现成豌豆泥', note: '整粒圆豆易呛，1 岁前一定压碎' },
  { id: 'eggplant', name: '茄子', emoji: '🍆', group: 'veg', fromMonth: 9, allergen: false, allergenGroup: '', ironRich: false, how: '去皮蒸软压泥', note: '吸油，别炒' },
  { id: 'cucumber', name: '黄瓜', emoji: '🥒', group: 'veg', fromMonth: 9, allergen: false, allergenGroup: '', ironRich: false, how: '去皮去籽，擦丝或切条生吃（1 岁后）', note: '' },
  { id: 'mushroom', name: '口蘑', emoji: '🍄', group: 'veg', fromMonth: 10, allergen: false, allergenGroup: '', ironRich: false, how: '切碎炒软或煮汤', note: '别给野生菌' },
  { id: 'shiitake', name: '香菇', emoji: '🍄', group: 'veg', fromMonth: 10, allergen: false, allergenGroup: '', ironRich: false, how: '泡发后切碎，煮进粥或面', note: '干香菇香味更浓，宝宝更容易接受' },
  { id: 'kelp', name: '海带', emoji: '🌿', group: 'veg', fromMonth: 12, allergen: false, allergenGroup: '', ironRich: false, how: '泡淡后切碎煮汤', note: '含碘高，一周 1-2 次即可，别天天吃' },
  { id: 'lotus', name: '莲藕', emoji: '🪷', group: 'veg', fromMonth: 12, allergen: false, allergenGroup: '', ironRich: false, how: '切薄片煮到软烂', note: '生藕脆，容易咬断呛到' },
  { id: 'onion', name: '洋葱', emoji: '🧅', group: 'veg', fromMonth: 12, allergen: false, allergenGroup: '', ironRich: false, how: '切碎炒到透明发甜', note: '生洋葱刺激，要炒透' },

  // ---- 水果 fruit ----
  { id: 'apple', name: '苹果', emoji: '🍎', group: 'fruit', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '蒸熟刮泥，或直接刮生苹果泥', note: '蒸过的更好消化，也更不容易呛' },
  { id: 'banana', name: '香蕉', emoji: '🍌', group: 'fruit', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '选熟透带麻点的，直接压泥', note: '生香蕉含鞣酸，会加重便秘' },
  { id: 'pear', name: '梨', emoji: '🍐', group: 'fruit', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '蒸熟压泥，汁水多可拌米粉', note: '润肠，便秘时可以多吃一点' },
  { id: 'avocado', name: '牛油果', emoji: '🥑', group: 'fruit', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '选按压微软的，直接压泥，可拌香蕉', note: '脂肪含量高，是很好的能量来源，但一次 1/4 个就够' },
  { id: 'watermelon', name: '西瓜', emoji: '🍉', group: 'fruit', fromMonth: 8, allergen: false, allergenGroup: '', ironRich: false, how: '去籽压汁或切小块', note: '一定要去净籽' },
  { id: 'peach', name: '桃', emoji: '🍑', group: 'fruit', fromMonth: 8, allergen: false, allergenGroup: '', ironRich: false, how: '去皮去核蒸软或压泥', note: '桃毛可能刺激皮肤，要削皮' },
  { id: 'grape', name: '葡萄', emoji: '🍇', group: 'fruit', fromMonth: 10, allergen: false, allergenGroup: '', ironRich: false, how: '必须纵向切成 4 瓣去籽，不能整颗给', note: '整颗葡萄是典型窒息物，4 岁前都要切开' },
  { id: 'blueberry', name: '蓝莓', emoji: '🫐', group: 'fruit', fromMonth: 10, allergen: false, allergenGroup: '', ironRich: false, how: '压扁或对半切开，别整颗', note: '圆、滑、大小刚好卡住气道' },
  { id: 'orange', name: '橙子', emoji: '🍊', group: 'fruit', fromMonth: 10, allergen: false, allergenGroup: '', ironRich: false, how: '剥净白络，去膜取果肉', note: '酸，口周红不代表过敏' },
  { id: 'strawberry', name: '草莓', emoji: '🍓', group: 'fruit', fromMonth: 12, allergen: false, allergenGroup: '', ironRich: false, how: '去蒂切小块', note: '不属于八大类过敏原，但表面农残多要充分冲洗；少数宝宝会口周发红，那是接触刺激' },
  { id: 'kiwi', name: '猕猴桃', emoji: '🥝', group: 'fruit', fromMonth: 12, allergen: false, allergenGroup: '', ironRich: false, how: '选熟软的，去芯压泥', note: '蛋白酶会刺激口周，第一次少量；不算八大类过敏原' },
  { id: 'mango', name: '芒果', emoji: '🥭', group: 'fruit', fromMonth: 12, allergen: false, allergenGroup: '', ironRich: false, how: '切小块，避免汁水沾到口周皮肤', note: '芒果皮炎很常见，是接触刺激不是真过敏；吃完擦干净嘴周' },

  // ---- 肉 meat ----
  { id: 'pork', name: '猪肉', emoji: '🥩', group: 'meat', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: true, how: '选里脊，剁泥加少量水打散，蒸或煮进粥', note: '血红素铁吸收率最高，6 月龄后要尽快加' },
  { id: 'beef', name: '牛肉', emoji: '🥩', group: 'meat', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: true, how: '选牛里脊，逆纹切剁泥，煮到全熟', note: '纤维粗，一定要剁细' },
  { id: 'chicken', name: '鸡肉', emoji: '🍗', group: 'meat', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: false, how: '鸡胸或鸡腿去皮剁泥，蒸成肉饼或拌粥', note: '好消化，适合作为第一种肉' },
  { id: 'lamb', name: '羊肉', emoji: '🍖', group: 'meat', fromMonth: 9, allergen: false, allergenGroup: '', ironRich: true, how: '选羊里脊剁泥，配萝卜去膻', note: '膻味重，可先用洋葱一起煮' },
  { id: 'duck', name: '鸭肉', emoji: '🦆', group: 'meat', fromMonth: 10, allergen: false, allergenGroup: '', ironRich: true, how: '取胸肉去皮剁泥', note: '脂肪偏多，去皮再煮' },

  // ---- 肝 liver ----
  { id: 'pork_liver', name: '猪肝', emoji: '🫀', group: 'liver', fromMonth: 7, allergen: false, allergenGroup: '', ironRich: true, how: '切片泡水 30 分钟去血水，煮透后剁成肝泥，一周 1-2 次，每次 10-20g', note: '补铁补维 A 效率最高，但维 A 是脂溶性，过量会蓄积，别天天吃' },
  { id: 'chicken_liver', name: '鸡肝', emoji: '🫀', group: 'liver', fromMonth: 8, allergen: false, allergenGroup: '', ironRich: true, how: '同猪肝，煮透压泥', note: '比猪肝细腻，腥味也轻些' },

  // ---- 鱼虾 fish ----
  { id: 'cod', name: '鳕鱼', emoji: '🐟', group: 'fish', fromMonth: 7, allergen: true, allergenGroup: 'fish', ironRich: false, how: '蒸 8 分钟，去皮去刺后压碎，仔细摸一遍有没有刺', note: '低汞、刺少，最适合作为第一种鱼' },
  { id: 'salmon', name: '三文鱼', emoji: '🐟', group: 'fish', fromMonth: 7, allergen: true, allergenGroup: 'fish', ironRich: false, how: '蒸熟压碎，或做成小饼', note: 'DHA 含量高，一周 2 次就够' },
  { id: 'bass', name: '鲈鱼', emoji: '🐟', group: 'fish', fromMonth: 8, allergen: true, allergenGroup: 'fish', ironRich: false, how: '清蒸后取背肉，反复确认无刺', note: '刺少肉嫩，适合清蒸' },
  { id: 'shrimp', name: '虾', emoji: '🦐', group: 'fish', fromMonth: 8, allergen: true, allergenGroup: 'shellfish', ironRich: false, how: '去壳去虾线，剁泥做成虾丸或蒸蛋', note: '第一次少量，安排在上午' },
  { id: 'crab', name: '蟹', emoji: '🦀', group: 'fish', fromMonth: 12, allergen: true, allergenGroup: 'shellfish', ironRich: false, how: '取蟹肉，确认无壳', note: '过敏风险较高，满 1 岁后再试' },

  // ---- 蛋 egg ----
  { id: 'egg_yolk', name: '蛋黄', emoji: '🥚', group: 'egg', fromMonth: 6, allergen: true, allergenGroup: 'egg', ironRich: true, how: '煮全熟，取 1/4 个压碎，用奶或水调开拌米粉', note: '含铁但吸收率低，不能代替红肉；从 1/4 个开始，慢慢加到 1 个' },
  { id: 'egg_white', name: '蛋白', emoji: '🥚', group: 'egg', fromMonth: 8, allergen: true, allergenGroup: 'egg', ironRich: false, how: '煮全熟后切碎，或做蒸蛋', note: '蛋白是蛋类过敏的主要来源，第一次单独少量试' },
  { id: 'whole_egg', name: '全蛋', emoji: '🍳', group: 'egg', fromMonth: 12, allergen: true, allergenGroup: 'egg', ironRich: false, how: '蒸蛋羹、蛋饼，必须全熟', note: '蛋黄蛋白都通过后就可以吃整蛋了' },

  // ---- 奶 dairy ----
  { id: 'yogurt', name: '无糖酸奶', emoji: '🥛', group: 'dairy', fromMonth: 8, allergen: true, allergenGroup: 'milk', ironRich: false, how: '选配料表只有生牛乳和菌种的，室温放 10 分钟再吃', note: '别选带果粒、带糖的' },
  { id: 'cheese', name: '奶酪', emoji: '🧀', group: 'dairy', fromMonth: 9, allergen: true, allergenGroup: 'milk', ironRich: false, how: '选低钠原制奶酪，刨丝拌进粥或面', note: '再制奶酪钠高，看配料表' },
  { id: 'milk', name: '鲜牛奶', emoji: '🥛', group: 'dairy', fromMonth: 12, allergen: true, allergenGroup: 'milk', ironRich: false, how: '满 1 岁后可作为奶源之一，每天不超过 500ml', note: '1 岁前不能当主奶源：铁含量低、蛋白和矿物负荷高' },

  // ---- 豆 bean ----
  { id: 'tofu', name: '豆腐', emoji: '🧊', group: 'bean', fromMonth: 7, allergen: true, allergenGroup: 'soy', ironRich: false, how: '选嫩豆腐，蒸或煮后压碎', note: '比整颗黄豆安全，是第一口豆制品的好选择' },
  { id: 'red_bean', name: '红豆', emoji: '🫘', group: 'bean', fromMonth: 10, allergen: false, allergenGroup: '', ironRich: false, how: '煮到开花压泥，去皮更好消化', note: '' },
  { id: 'edamame', name: '毛豆', emoji: '🫛', group: 'bean', fromMonth: 12, allergen: true, allergenGroup: 'soy', ironRich: false, how: '煮软去壳压碎', note: '整颗毛豆又圆又滑，容易呛' },
  { id: 'soy_milk', name: '豆浆', emoji: '🥛', group: 'bean', fromMonth: 12, allergen: true, allergenGroup: 'soy', ironRich: false, how: '煮透，不加糖，不作为主奶', note: '必须彻底煮沸，生豆浆有毒' },

  // ---- 坚果 nut ----
  { id: 'peanut_butter', name: '花生酱', emoji: '🥜', group: 'nut', fromMonth: 6, allergen: true, allergenGroup: 'peanut', ironRich: false, how: '取无糖无盐纯花生酱，用温水或奶稀释成流质，拌进米粉，从 1/4 小勺起', note: '不要推迟到 1 岁后——早引入能显著降低花生过敏风险。绝不能给整颗或大块花生酱（糊住气道）' },
  { id: 'sesame_paste', name: '芝麻酱', emoji: '🫙', group: 'nut', fromMonth: 8, allergen: true, allergenGroup: 'treenut', ironRich: false, how: '纯芝麻酱用温水调稀，拌粥或抹馒头', note: '钙含量很高' },
  { id: 'walnut', name: '核桃', emoji: '🌰', group: 'nut', fromMonth: 10, allergen: true, allergenGroup: 'treenut', ironRich: false, how: '磨成粉拌进粥，或做成核桃酱', note: '整颗、碎粒都不行' },
  { id: 'almond', name: '杏仁', emoji: '🌰', group: 'nut', fromMonth: 12, allergen: true, allergenGroup: 'treenut', ironRich: false, how: '磨粉少量拌食', note: '苦杏仁含氰苷，不能吃' },

  // ---- 油 oil ----
  { id: 'walnut_oil', name: '核桃油', emoji: '🫗', group: 'oil', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '每餐滴 2-3 滴在菜泥里，不加热', note: '辅食需要脂肪，别一点油都不给' },
  { id: 'olive_oil', name: '橄榄油', emoji: '🫒', group: 'oil', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '低温拌食或小火炒', note: '' },
  { id: 'flaxseed_oil', name: '亚麻籽油', emoji: '🫗', group: 'oil', fromMonth: 6, allergen: false, allergenGroup: '', ironRich: false, how: '凉拌，不加热', note: '含亚麻酸，但易氧化，开瓶后冷藏' }
];

/* ---------------- 食谱库 ---------------- */
// kind: main 主食型 | dish 菜 | snack 加餐
// meal: breakfast | lunch | dinner | snack | any（any 表示各餐都能排）

const RECIPES = [
  // ---- 6-8 月：泥糊 ----
  { id: 'r_rice_cereal', name: '强化铁米粉糊', emoji: '🥣', fromMonth: 6, toMonth: 12, meal: 'any', kind: 'main', minutes: 5, texture: '稀糊', foods: ['rice_cereal'], steps: ['碗里放 2 勺米粉', '倒 40-50℃ 温水，边倒边同一方向搅', '调到能挂住勺子、倾斜会缓慢流动的程度', '静置 1 分钟让粉充分吸水'], tips: '第一口就吃这个。别用开水冲，会结块；别加糖。' },
  { id: 'r_pumpkin_puree', name: '南瓜泥', emoji: '🎃', fromMonth: 6, toMonth: 9, meal: 'any', kind: 'main', minutes: 15, texture: '泥糊', foods: ['pumpkin'], steps: ['南瓜去皮去籽切 2cm 块', '上锅蒸 12 分钟，筷子能轻松插透', '压成泥，太干加母乳/配方奶或温水调稀', '滴 2 滴核桃油'], tips: '天然甜，接受度高。一次做一顿的量，别存。' },
  { id: 'r_carrot_puree', name: '胡萝卜泥', emoji: '🥕', fromMonth: 6, toMonth: 9, meal: 'any', kind: 'main', minutes: 18, texture: '泥糊', foods: ['carrot'], steps: ['胡萝卜去皮切薄片', '蒸 15 分钟到软透', '加少量温水打成泥，过筛更细', '滴几滴橄榄油帮助吸收胡萝卜素'], tips: '加油这一步别省，胡萝卜素是脂溶性的。' },
  { id: 'r_apple_puree', name: '苹果泥', emoji: '🍎', fromMonth: 6, toMonth: 8, meal: 'snack', kind: 'snack', minutes: 12, texture: '泥糊', foods: ['apple'], steps: ['苹果去皮去核切块', '蒸 8 分钟（小月龄蒸，大一点可生吃）', '压泥或料理机打细'], tips: '蒸过的苹果更好消化，也不容易呛。' },
  { id: 'r_banana_puree', name: '香蕉泥', emoji: '🍌', fromMonth: 6, toMonth: 8, meal: 'snack', kind: 'snack', minutes: 2, texture: '泥糊', foods: ['banana'], steps: ['选带麻点的熟香蕉', '用叉子直接压成泥', '太稠可加一点奶或温水'], tips: '不用加热。生香蕉含鞣酸，会加重便秘，别用青的。' },
  { id: 'r_avocado_puree', name: '牛油果泥', emoji: '🥑', fromMonth: 6, toMonth: 9, meal: 'any', kind: 'snack', minutes: 3, texture: '泥糊', foods: ['avocado'], steps: ['选按压微软的牛油果，对半切开去核', '挖出果肉压泥', '第一次可拌一小段香蕉提味'], tips: '一次 1/4 个就够，脂肪含量高。硬的牛油果别吃。' },
  { id: 'r_broccoli_puree', name: '西兰花泥', emoji: '🥦', fromMonth: 7, toMonth: 11, meal: 'any', kind: 'main', minutes: 15, texture: '泥糊', foods: ['broccoli'], steps: ['只取花球，撕成小朵', '蒸 8 分钟', '压泥，纤维粗的话过一遍筛'], tips: '梗的纤维太粗，1 岁前别给。' },
  { id: 'r_liver_paste', name: '猪肝泥', emoji: '🫀', fromMonth: 7, toMonth: 11, meal: 'lunch', kind: 'dish', minutes: 40, texture: '细泥', foods: ['pork_liver'], steps: ['猪肝切薄片，清水泡 30 分钟，中间换两次水', '冷水下锅煮 10 分钟至完全变色', '剁成细泥或用料理机打碎', '拌进米粉或粥里'], tips: '一周 1-2 次，每次 10-20g。维 A 会蓄积，别天天吃。' },
  { id: 'r_pork_paste', name: '猪肉泥', emoji: '🥩', fromMonth: 7, toMonth: 11, meal: 'lunch', kind: 'dish', minutes: 20, texture: '细泥', foods: ['pork'], steps: ['里脊逆纹切片，剁成泥', '加一小勺水同方向搅上劲', '水开后下锅煮 5 分钟，或上锅蒸 10 分钟', '压碎拌进米糊'], tips: '血红素铁吸收率最高，6 月龄后尽快加上。' },
  { id: 'r_yolk_cereal', name: '蛋黄米糊', emoji: '🥚', fromMonth: 6, toMonth: 11, meal: 'breakfast', kind: 'main', minutes: 12, texture: '稠糊', foods: ['egg_yolk', 'rice_cereal'], steps: ['鸡蛋冷水下锅，水开后再煮 10 分钟', '取 1/4 个蛋黄压碎', '冲好米粉，把蛋黄拌进去搅匀', '第一次吃观察 2-3 天'], tips: '蛋黄含铁但吸收率低，补铁还得靠红肉和肝。' },
  { id: 'r_sweet_potato_puree', name: '红薯泥', emoji: '🍠', fromMonth: 6, toMonth: 9, meal: 'any', kind: 'main', minutes: 18, texture: '泥糊', foods: ['sweet_potato'], steps: ['红薯去皮切块', '蒸 15 分钟到软透', '压泥，太干用奶调稀'], tips: '容易胀气，一次别超过半个。' },
  { id: 'r_cod_puree', name: '鳕鱼泥', emoji: '🐟', fromMonth: 7, toMonth: 11, meal: 'lunch', kind: 'dish', minutes: 15, texture: '细泥', foods: ['cod'], steps: ['鳕鱼解冻，用厨房纸吸干水', '铺两片姜蒸 8 分钟', '去皮去刺，用手指再摸一遍确认没有刺', '压碎拌进粥或米粉'], tips: '摸刺这一步一定要做，大人手指比眼睛靠谱。' },
  { id: 'r_spinach_potato', name: '菠菜土豆泥', emoji: '🥬', fromMonth: 7, toMonth: 11, meal: 'lunch', kind: 'main', minutes: 20, texture: '泥糊', foods: ['spinach', 'potato'], steps: ['菠菜焯水 1 分钟，挤干切碎', '土豆蒸熟压泥', '两者混合，加少量奶调稠度', '滴两滴橄榄油'], tips: '菠菜先焯水去草酸，不然会影响钙吸收。' },
  { id: 'r_millet_pumpkin', name: '南瓜小米糊', emoji: '🎃', fromMonth: 7, toMonth: 11, meal: 'breakfast', kind: 'main', minutes: 25, texture: '稠糊', foods: ['millet', 'pumpkin'], steps: ['小米洗净，米水 1:8 煮 20 分钟', '南瓜蒸熟压泥', '两者混合，料理机打细', '取上层细腻的部分'], tips: '小米好消化，适合刚加辅食的肠胃。' },

  // ---- 9-11 月：细颗粒 ----
  { id: 'r_chicken_congee', name: '鸡肉蔬菜粥', emoji: '🍲', fromMonth: 9, toMonth: 17, meal: 'lunch', kind: 'main', minutes: 35, texture: '细颗粒', foods: ['rice', 'chicken', 'carrot', 'broccoli'], steps: ['大米提前泡 30 分钟，米水 1:6', '鸡胸去皮剁成末，用一点水澥开', '胡萝卜切碎丁，和米一起煮 20 分钟', '粥稠后下鸡肉末搅散，煮 5 分钟', '最后加西兰花碎，煮 2 分钟'], tips: '肉末一定要先用冷水澥开再下锅，不然会结成硬块。' },
  { id: 'r_tomato_beef_noodle', name: '番茄牛肉面', emoji: '🍜', fromMonth: 9, toMonth: 23, meal: 'lunch', kind: 'main', minutes: 30, texture: '细颗粒', foods: ['noodle', 'tomato', 'beef'], steps: ['牛肉剁末，番茄烫去皮切碎', '少油炒番茄出汁，下牛肉末炒散', '加水煮开，下面条煮到软烂', '剪成小段再盛出来'], tips: '番茄的维 C 能促进牛肉里的铁吸收，这个搭配很好。' },
  { id: 'r_salmon_patty', name: '三文鱼土豆饼', emoji: '🐟', fromMonth: 9, toMonth: 23, meal: 'dinner', kind: 'main', minutes: 30, texture: '软饼', foods: ['salmon', 'potato'], steps: ['三文鱼蒸熟压碎，确认无刺', '土豆蒸熟压泥', '两者混合，加一小勺淀粉拌匀', '手上抹油，搓成小饼', '平底锅小火两面各煎 2 分钟'], tips: '做成小饼最适合练手抓，9 月龄的手指食物首选。' },
  { id: 'r_tofu_steam_egg', name: '豆腐蒸蛋羹', emoji: '🥚', fromMonth: 9, toMonth: 23, meal: 'dinner', kind: 'dish', minutes: 18, texture: '嫩滑', foods: ['egg_white', 'tofu'], steps: ['鸡蛋打散，加 1.5 倍温水搅匀', '过筛去掉泡沫（这步决定嫩不嫩）', '嫩豆腐切小丁放进去', '盖保鲜膜扎孔，中火蒸 10 分钟'], tips: '过筛和盖膜两步别省，蒸出来才没有蜂窝。' },
  { id: 'r_liver_spinach_congee', name: '猪肝菠菜粥', emoji: '🥬', fromMonth: 9, toMonth: 17, meal: 'lunch', kind: 'main', minutes: 45, texture: '细颗粒', foods: ['pork_liver', 'spinach', 'rice'], steps: ['猪肝泡水 30 分钟，煮透剁泥', '大米煮成稠粥', '菠菜焯水切碎', '粥里下肝泥和菠菜，煮 3 分钟'], tips: '补铁效果最直接的一碗，一周 1-2 次。' },
  { id: 'r_yam_chicken', name: '山药鸡肉泥', emoji: '🍥', fromMonth: 9, toMonth: 17, meal: 'dinner', kind: 'main', minutes: 25, texture: '软泥', foods: ['yam', 'chicken'], steps: ['山药去皮切段蒸 15 分钟（戴手套削皮）', '鸡肉剁泥蒸熟', '两者一起压匀，太干加一点汤'], tips: '山药黏液会让手发痒，削皮一定戴手套。' },
  { id: 'r_carrot_pork_rice', name: '胡萝卜肉末软饭', emoji: '🍚', fromMonth: 9, toMonth: 17, meal: 'lunch', kind: 'main', minutes: 30, texture: '软饭', foods: ['rice', 'pork', 'carrot'], steps: ['米水 1:4 煮成软饭', '猪肉末用一点水澥开', '胡萝卜切碎丁炒软', '肉末下锅炒散，和胡萝卜一起拌进饭里'], tips: '9 月龄开始从粥过渡到软饭，锻炼咀嚼。' },
  { id: 'r_apple_oat', name: '苹果燕麦粥', emoji: '🥣', fromMonth: 9, toMonth: 23, meal: 'breakfast', kind: 'main', minutes: 15, texture: '稠粥', foods: ['oat', 'apple'], steps: ['燕麦加 4 倍水煮 8 分钟', '苹果去皮擦成细丝', '苹果丝下锅再煮 3 分钟', '焖 2 分钟更稠'], tips: '膳食纤维高，便秘时很管用。' },
  { id: 'r_shrimp_ball', name: '虾仁蔬菜丸', emoji: '🦐', fromMonth: 10, toMonth: 23, meal: 'dinner', kind: 'dish', minutes: 25, texture: '软丸', foods: ['shrimp', 'carrot'], steps: ['虾去壳去虾线，剁成泥', '胡萝卜擦细丝剁碎', '加一小勺淀粉，同方向搅上劲', '水微开时挤成小丸子下锅，浮起再煮 2 分钟'], tips: '水别大滚，会把丸子冲散。第一次吃虾要少量、上午吃。' },
  { id: 'r_pumpkin_millet_congee', name: '南瓜小米粥', emoji: '🎃', fromMonth: 9, toMonth: 23, meal: 'breakfast', kind: 'main', minutes: 30, texture: '稠粥', foods: ['millet', 'pumpkin'], steps: ['小米洗净，米水 1:6 煮 20 分钟', '南瓜蒸熟压泥', '拌进粥里再煮 5 分钟'], tips: '（与 6-8 月的糊不同，这一版保留米粒，练咀嚼）' },
  { id: 'r_banana_oat_congee', name: '香蕉燕麦粥', emoji: '🍌', fromMonth: 10, toMonth: 23, meal: 'breakfast', kind: 'main', minutes: 12, texture: '稠粥', foods: ['banana', 'oat'], steps: ['燕麦片加水小火煮 5 分钟到软', '香蕉压成泥拌进去', '再煮 1 分钟，晾到温热'], tips: '不用加糖，香蕉本身够甜。燕麦选原味即食片，别选加了糖和果干的。' },

  // ---- 12-17 月：自主进食 ----
  { id: 'r_veg_egg_pancake', name: '蔬菜鸡蛋饼', emoji: '🥞', fromMonth: 12, toMonth: 36, meal: 'breakfast', kind: 'main', minutes: 15, texture: '软饼', foods: ['whole_egg', 'carrot', 'chinese_cabbage'], steps: ['鸡蛋打散，加两勺面粉调成流动的面糊', '胡萝卜擦丝、白菜切碎拌进去', '平底锅刷薄油，小火倒一勺摊开', '两面各 1 分钟，切条给手抓'], tips: '切成手指宽的长条，比小块更好抓。' },
  { id: 'r_tomato_pasta', name: '番茄肉末意面', emoji: '🍝', fromMonth: 12, toMonth: 36, meal: 'lunch', kind: 'main', minutes: 25, texture: '软烂', foods: ['noodle', 'tomato', 'beef'], steps: ['意面煮到比包装时间多 3 分钟', '番茄去皮切碎，牛肉剁末', '炒番茄出汁，下牛肉末炒散', '把面和酱拌匀，剪短'], tips: '不要用现成意面酱，钠含量太高。' },
  { id: 'r_chicken_mushroom_rice', name: '香菇鸡肉焖饭', emoji: '🍚', fromMonth: 12, toMonth: 36, meal: 'dinner', kind: 'main', minutes: 40, texture: '软饭', foods: ['rice', 'chicken', 'shiitake', 'carrot'], steps: ['香菇泡发切丁，鸡肉切小丁', '锅里少油炒香香菇和鸡肉', '和米一起放进电饭锅，水比平时多 10%', '按煮饭键，跳起后焖 10 分钟'], tips: '一锅出，适合没时间单独做的时候。' },
  { id: 'r_salmon_veg_ball', name: '三文鱼蔬菜丸', emoji: '🐟', fromMonth: 12, toMonth: 36, meal: 'dinner', kind: 'dish', minutes: 30, texture: '软丸', foods: ['salmon', 'broccoli', 'potato'], steps: ['三文鱼蒸熟压碎', '西兰花焯水切碎，土豆蒸熟压泥', '三样混合，搓成小球', '上锅蒸 6 分钟'], tips: '蒸比煎更软，适合刚学咀嚼的宝宝。' },
  { id: 'r_pumpkin_bun', name: '南瓜小馒头', emoji: '🍞', fromMonth: 12, toMonth: 36, meal: 'breakfast', kind: 'main', minutes: 90, texture: '软', foods: ['steamed_bun', 'pumpkin'], steps: ['南瓜蒸熟压泥，晾到温', '和面粉、酵母揉成团，发酵到 2 倍大', '排气后搓成长条切小段', '二发 15 分钟后蒸 15 分钟'], tips: '一次多做点冷冻，吃前蒸 5 分钟。' },
  { id: 'r_shrimp_wonton', name: '虾仁蔬菜馄饨', emoji: '🥟', fromMonth: 14, toMonth: 36, meal: 'lunch', kind: 'main', minutes: 35, texture: '软', foods: ['shrimp', 'chinese_cabbage', 'steamed_bun'], steps: ['虾仁剁泥，白菜切碎挤干水', '拌成馅，包进馄饨皮', '水开下锅，浮起后再煮 2 分钟', '盛出来剪成两半'], tips: '整只馄饨对 1 岁多的宝宝偏大，一定要剪开。' },
  { id: 'r_beef_potato_patty', name: '牛肉土豆饼', emoji: '🥩', fromMonth: 12, toMonth: 36, meal: 'dinner', kind: 'main', minutes: 30, texture: '软饼', foods: ['beef', 'potato'], steps: ['牛肉剁泥，土豆蒸熟压泥', '两者混合，加一点淀粉拌匀', '搓圆压成 1cm 厚的饼', '小火两面各煎 3 分钟'], tips: '牛肉纤维粗，混土豆泥能明显变嫩。' },
  { id: 'r_tofu_veg_soup', name: '蔬菜豆腐汤', emoji: '🍲', fromMonth: 12, toMonth: 36, meal: 'dinner', kind: 'dish', minutes: 20, texture: '软', foods: ['tofu', 'tomato', 'chinese_cabbage'], steps: ['番茄去皮切块炒出汁', '加水煮开，下豆腐块', '白菜切碎下锅煮 5 分钟', '不放盐，盛出来剪小块'], tips: '配软饭或面条一起吃。' },

  // ---- 18-23 月 ----
  { id: 'r_tomato_egg_noodle', name: '番茄鸡蛋面', emoji: '🍜', fromMonth: 18, toMonth: 36, meal: 'lunch', kind: 'main', minutes: 20, texture: '家常', foods: ['noodle', 'tomato', 'whole_egg'], steps: ['番茄去皮切块炒出汁', '加水煮开下面条', '面快熟时淋打散的蛋液', '剪短盛出'], tips: '可以放极少量盐（一天总量不超 1.5g）。' },
  { id: 'r_carrot_beef_patty', name: '胡萝卜牛肉饼', emoji: '🥩', fromMonth: 18, toMonth: 36, meal: 'dinner', kind: 'main', minutes: 30, texture: '家常', foods: ['beef', 'carrot'], steps: ['牛肉剁泥，胡萝卜擦丝剁碎', '混合加少许淀粉搅上劲', '压成小饼，小火煎至两面金黄', '切条给手抓'], tips: '一次多做一些冷冻，早上煎一块很方便。' },
  { id: 'r_shrimp_fried_rice', name: '虾仁蛋炒饭', emoji: '🍤', fromMonth: 18, toMonth: 36, meal: 'lunch', kind: 'main', minutes: 20, texture: '家常', foods: ['rice', 'shrimp', 'whole_egg', 'pea'], steps: ['虾仁去线切小丁，鸡蛋打散', '先炒蛋盛出，再炒虾仁和豌豆', '下米饭炒散，把蛋倒回去', '不放酱油，盛出剪小'], tips: '豌豆对半压开再下锅，整粒容易呛。' },
  { id: 'r_ribs_corn_soup', name: '排骨玉米汤', emoji: '🌽', fromMonth: 18, toMonth: 36, meal: 'dinner', kind: 'dish', minutes: 70, texture: '家常', foods: ['pork', 'corn', 'carrot'], steps: ['排骨冷水下锅焯去血沫', '加姜片和足量水，小火炖 50 分钟', '下玉米段和胡萝卜块，再炖 20 分钟', '给宝宝盛的那份不放盐，肉撕小'], tips: '汤里的营养其实很少，重点吃肉和菜。' },

  // ---- 24-36 月 ----
  { id: 'r_tri_color_rice_ball', name: '三色蔬菜饭团', emoji: '🍙', fromMonth: 24, toMonth: 36, meal: 'lunch', kind: 'main', minutes: 25, texture: '家常', foods: ['rice', 'carrot', 'broccoli', 'egg_yolk'], steps: ['米饭煮好晾到温热', '胡萝卜、西兰花焯水切碎，蛋黄压碎', '三样分别拌进三份米饭', '手上蘸水，捏成小球'], tips: '捏小一点，一口一个，宝宝会很有成就感。' },
  { id: 'r_egg_veg_roll', name: '鸡蛋蔬菜卷', emoji: '🍳', fromMonth: 24, toMonth: 36, meal: 'breakfast', kind: 'main', minutes: 15, texture: '家常', foods: ['whole_egg', 'carrot', 'chinese_cabbage'], steps: ['鸡蛋打散摊成薄蛋皮', '胡萝卜丝、白菜丝炒软', '铺在蛋皮上卷起来', '切成 2cm 小段'], tips: '卷紧一点，切的时候不容易散。' },
  { id: 'r_steamed_bass', name: '清蒸鲈鱼配饭', emoji: '🐟', fromMonth: 24, toMonth: 36, meal: 'dinner', kind: 'main', minutes: 25, texture: '家常', foods: ['bass', 'rice'], steps: ['鲈鱼洗净，铺姜片葱段', '水开后蒸 8-10 分钟', '取背肉，反复确认无刺后撕成小块', '配软饭一起吃'], tips: '给小朋友吃鱼一定要在自然光下检查刺，不要凭手感。' },
  { id: 'r_millet_pumpkin_porridge', name: '南瓜小米粥（大童版）', emoji: '🥣', fromMonth: 18, toMonth: 36, meal: 'breakfast', kind: 'main', minutes: 30, texture: '家常', foods: ['millet', 'pumpkin', 'red_bean'], steps: ['小米和红豆提前泡 2 小时', '加水煮 30 分钟到红豆开花', '南瓜切小块下锅再煮 10 分钟', '可加少量奶增加香味'], tips: '红豆要煮到一压就烂，否则容易噎。' },

  // ---- 9-11 月的加餐 / 手指食物 ----
  { id: 'r_pumpkin_stick', name: '蒸南瓜条', emoji: '🎃', fromMonth: 9, toMonth: 18, meal: 'snack', kind: 'snack', minutes: 15, texture: '软条', foods: ['pumpkin'], steps: ['南瓜去皮，切成人手指粗的长条', '上锅蒸 10 分钟，蒸到能用手捏碎', '晾到不烫手再给他，太软一抓就烂、太硬咬不动'], tips: '长度比宝宝拳头长一点，抓得住又不会整个塞进嘴。' },
  { id: 'r_apple_steam', name: '蒸苹果片', emoji: '🍎', fromMonth: 9, toMonth: 18, meal: 'snack', kind: 'snack', minutes: 12, texture: '软', foods: ['apple'], steps: ['苹果去皮去核，切成 3mm 的薄片', '上锅蒸 8 分钟，蒸到透明发软', '放凉到温热，一片一片给'], tips: '蒸过的苹果不酸，也不容易引起嘴边发红。' },
  { id: 'r_yogurt_banana', name: '酸奶香蕉糊', emoji: '🥛', fromMonth: 9, toMonth: 18, meal: 'snack', kind: 'snack', minutes: 5, texture: '泥糊', foods: ['yogurt', 'banana'], steps: ['无糖酸奶舀两勺到小碗里', '香蕉压成泥拌进去', '现拌现吃，别提前拌好放着'], tips: '第一次吃酸奶要少量、上午吃，之后观察 3 天。' },

  // ---- 12 月龄以上的加餐 ----
  { id: 'r_yogurt_cup', name: '酸奶水果杯', emoji: '🥛', fromMonth: 12, toMonth: 36, meal: 'snack', kind: 'snack', minutes: 5, texture: '软', foods: ['yogurt', 'banana', 'blueberry'], steps: ['无糖酸奶倒进碗里', '香蕉切片、蓝莓对半切开铺上去', '现做现吃，别放'], tips: '酸奶从冰箱拿出来放 10 分钟再吃，别太凉。蓝莓一定切开。' },
  { id: 'r_banana_oat_cookie', name: '香蕉燕麦软饼', emoji: '🍪', fromMonth: 12, toMonth: 36, meal: 'snack', kind: 'snack', minutes: 15, texture: '软饼', foods: ['banana', 'oat', 'whole_egg'], steps: ['熟香蕉压泥，加燕麦和一个鸡蛋拌匀', '静置 5 分钟让燕麦吸水', '平底锅小火，舀一勺摊成小饼', '两面各 2 分钟，软软的就好'], tips: '不加糖也有甜味。一次多做的冷冻，吃前蒸热。' },
  { id: 'r_carrot_cheese_stick', name: '奶酪胡萝卜条', emoji: '🧀', fromMonth: 12, toMonth: 36, meal: 'snack', kind: 'snack', minutes: 15, texture: '软条', foods: ['cheese', 'carrot'], steps: ['胡萝卜切手指粗的条，蒸到能捏碎', '低钠奶酪切成同样粗细的条', '两样摆一盘让宝宝自己抓着吃'], tips: '奶酪选原制的，看配料表钠含量。' }
];

/* ---------------- 一周餐单的餐次结构 ---------------- */
// slots 决定「一天吃几顿、每顿排什么类型的食谱」
// accept 列出该餐次接受的 recipe.meal 值（'any' 的食谱哪一餐都能排）

const MENU = {
  s68: {
    note: '刚开始一天 1 餐就够，8 月龄前后再添第二餐',
    slots: [
      { key: 'am', label: '上午', accept: ['breakfast', 'any'] },
      { key: 'pm', label: '下午', accept: ['lunch', 'snack', 'any'] }
    ]
  },
  s911: {
    note: '2-3 餐，上下午各安排一次，睡前一小时不加新食材',
    slots: [
      { key: 'am', label: '上午', accept: ['breakfast', 'any'] },
      { key: 'noon', label: '中午', accept: ['lunch', 'any'] },
      // 加餐只排真正的加餐食谱，不再退回到 6 月龄的纯泥
      { key: 'pm', label: '下午', accept: ['snack'] }
    ]
  },
  s1217: {
    note: '3 餐 + 1-2 次加餐，和大人同桌吃',
    slots: [
      { key: 'am', label: '早餐', accept: ['breakfast', 'any'] },
      { key: 'noon', label: '午餐', accept: ['lunch', 'any'] },
      { key: 'pm', label: '加餐', accept: ['snack', 'any'] },
      { key: 'eve', label: '晚餐', accept: ['dinner', 'any'] }
    ]
  },
  s1823: {
    note: '3 餐 + 2 次加餐，正餐和加餐间隔 1.5 小时以上',
    slots: [
      { key: 'am', label: '早餐', accept: ['breakfast', 'any'] },
      { key: 'noon', label: '午餐', accept: ['lunch', 'any'] },
      { key: 'pm', label: '加餐', accept: ['snack', 'any'] },
      { key: 'eve', label: '晚餐', accept: ['dinner', 'any'] }
    ]
  },
  s2436: {
    note: '和大人吃一样的菜，味道更淡、块更小',
    slots: [
      { key: 'am', label: '早餐', accept: ['breakfast', 'any'] },
      { key: 'noon', label: '午餐', accept: ['lunch', 'any'] },
      { key: 'pm', label: '加餐', accept: ['snack', 'any'] },
      { key: 'eve', label: '晚餐', accept: ['dinner', 'any'] }
    ]
  }
};

/* ---------------- 月龄刻度 ----------------
 * 5 个阶段档太粗：6 / 7 / 8 月龄家长的下一步动作完全不同。
 * 这里按「逐月」给每月重点，节点之外的月龄取最近的上一档。
 * texture / meals 不填就沿用所属阶段的设定。
 *
 * next = 本月该上的食材，按顺序。它决定「待尝试」列表的头部：
 * 同样没试过，7 月龄先看到猪肉牛肉，8 月龄先看到猪肝鳕鱼，
 * 而不是三个月都在推米粉。已经试过的自动从列表里掉出去。
 */

const MONTH_FOCUS = {
  6: {
    title: '第 6 个月 · 第一口',
    focus: '从强化铁米粉开始，一次只加一种，观察满 3 天再加下一种。吃几口就算成功。',
    texture: '稀糊',
    meals: '1 餐/天',
    key: '奶仍是主食，别急着加量',
    next: ['rice_cereal', 'pumpkin', 'carrot', 'apple', 'banana', 'potato']
  },
  7: {
    title: '第 7 个月 · 该加肉泥了',
    focus: '红肉泥要进来了——6 月龄后从母体获得的铁基本用完，只靠米粉不够。',
    texture: '稠糊',
    meals: '1-2 餐/天',
    key: '猪肉、牛肉、鸡肉，从一小勺开始',
    next: ['pork', 'beef', 'chicken', 'egg_yolk', 'broccoli', 'spinach', 'millet', 'pear', 'avocado']
  },
  8: {
    title: '第 8 个月 · 加肝和鱼',
    focus: '肝泥一周 1-2 次、鱼泥跟上；泥可以调稠一点，开始让他用舌头碾。',
    texture: '稠糊 → 带小颗粒',
    meals: '2 餐/天',
    key: '蒸软的蔬菜条可以给他自己抓着玩',
    next: ['pork_liver', 'cod', 'salmon', 'bass', 'tofu', 'oat', 'zucchini', 'pea', 'yogurt', 'sweet_potato']
  },
  9: {
    title: '第 9 个月 · 从泥到颗粒',
    focus: '把泥换成细颗粒：粥、软面、碎菜。咀嚼是练出来的，不是等出来的。',
    texture: '细颗粒',
    meals: '2-3 餐/天',
    key: '别再全部打泥了，留一点颗粒感',
    next: ['noodle', 'tomato', 'chinese_cabbage', 'rice', 'cheese', 'peach', 'watermelon', 'winter_melon']
  },
  10: {
    title: '第 10 个月 · 手指食物',
    focus: '蒸软的胡萝卜条、南瓜条、小饼，让他自己抓着吃，弄得到处都是很正常。',
    texture: '细颗粒 → 软烂小丁',
    meals: '3 餐/天',
    key: '开始练杯子喝水，别一直用奶瓶',
    next: ['mushroom', 'shiitake', 'red_bean', 'orange', 'blueberry', 'steamed_bun', 'walnut']
  },
  11: {
    title: '第 11 个月 · 向三餐靠',
    focus: '把餐次稳到 3 餐，为满 1 岁后的家庭餐做准备。',
    texture: '软烂小丁',
    meals: '3 餐 + 1 次点心',
    key: '让他自己拿勺子，别怕脏',
    next: ['lamb', 'eggplant', 'cucumber', 'duck', 'grape', 'sesame_paste', 'yam']
  },
  12: {
    title: '第 12 个月 · 满一岁了',
    focus: '全蛋可以吃了，奶量降到 400-500ml，鲜牛奶可以少量引入。',
    texture: '软烂家常菜',
    meals: '3 餐 + 1-2 次加餐',
    key: '蜂蜜解禁但仍要少；盐一天不超过 1.5g',
    next: ['whole_egg', 'strawberry', 'kiwi', 'mango', 'crab', 'corn', 'milk', 'kelp', 'onion', 'lotus', 'edamame', 'almond', 'soy_milk']
  },
  15: {
    title: '第 15 个月 · 自己吃饭',
    focus: '开始自己用勺子。和大人同桌吃，但菜要单独盛、单独切。',
    texture: '切成小块的家常菜',
    meals: '3 餐 + 2 次加餐',
    key: '奶别超过 500ml，喝太多会挤掉吃饭的胃口',
    next: []
  },
  18: {
    title: '第 18 个月 · 挑食开始',
    focus: '一种菜可能要试 10 次以上才被接受，别强迫，也别放弃。',
    texture: '家常菜，切小煮软',
    meals: '3 餐 + 2 次加餐',
    key: '让他参与摆碗筷、挑菜，接受度会明显变好',
    next: []
  },
  24: {
    title: '第 24 个月 · 同桌同食',
    focus: '可以和大人吃一样的菜了，但味道要淡、块要小、骨刺要去净。',
    texture: '家常饭菜',
    meals: '3 餐 + 2 次加餐',
    key: '每天保证一个蛋、一份肉、一份奶、一份蔬果',
    next: []
  },
  30: {
    title: '第 30 个月 · 三餐规律',
    focus: '三餐时间固定，加餐和正餐间隔至少 1.5 小时，零食不顶饭。',
    texture: '家常，切成适口大小',
    meals: '3 餐 + 2 次加餐',
    key: '果汁不如整个水果',
    next: []
  },
  36: {
    title: '第 36 个月 · 三岁',
    focus: '饮食结构基本接近成人，重点变成控盐、控糖、按时吃饭。',
    texture: '家常',
    meals: '3 餐 + 2 次加餐',
    key: '整颗坚果、果冻、整粒葡萄仍然不能给',
    next: []
  }
};

/* ---------------- 反应分级 ---------------- */

const REACTIONS = [
  {
    key: 'none',
    label: '没问题',
    short: '通过',
    tone: 'ok',
    desc: '吃完 3 天内没有异常',
    next: '这种食材可以留下，之后能和其他已通过的食材搭配'
  },
  {
    key: 'mild',
    label: '轻微反应',
    short: '轻微',
    tone: 'watch',
    desc: '口周发红、少量湿疹、放屁多、便便变稀',
    next: '先停 1-2 周，再用更少的量试一次。多数是暂时的，不用过度紧张'
  },
  {
    key: 'allergy',
    label: '明确过敏',
    short: '过敏',
    tone: 'warn',
    desc: '皮疹扩散到全身、呕吐、腹泻、明显哭闹不安',
    next: '停 3-6 个月，就诊时告诉医生具体是哪种食材、吃完多久出现的'
  },
  {
    key: 'severe',
    label: '严重反应',
    short: '严重',
    tone: 'danger',
    desc: '呼吸急促或费力、嘴唇/眼睑肿、声音嘶哑、精神差、血便',
    next: '立即就医或拨 120，路上保持坐位、不要喂水。以后这类食材一律不再尝试'
  }
];

/* ---------------- 季节（当季月份） ----------------
 * 只做「正向提示」，不做任何硬过滤：11 月的暖棚番茄仍然是番茄，
 * 肉蛋奶鱼更没有「反季」一说。所以这里的表只回答「这个月哪几样最新鲜」。
 *
 * 表里没有的 = 全年都有。按 group 的填法规则：
 *   grain  加工主食（米粉/大米/面条/馒头）全年；杂粮与薯类按收获季
 *   veg    按露地自然成熟期；工厂化栽培（口蘑）与干货（海带）全年
 *   fruit  按自然成熟期；周年供应的热带水果（香蕉/牛油果）全年
 *   meat / liver / egg / dairy / fish  全部全年，仅蟹例外（秋蟹）
 *   bean   加工品（豆腐/豆浆）全年；鲜豆与干豆按收获季
 *   nut    生坚果按收获季；酱类（花生酱/芝麻酱）全年
 *   oil    全部全年 —— 做成油脂后不存在季节性，标了反而误导
 */

const SEASON_MONTHS = {
  // 谷薯
  millet: [9, 10, 11], // 秋收新米
  oat: [7, 8, 9],
  potato: [5, 6, 10, 11], // 春薯 + 秋薯
  sweet_potato: [9, 10, 11, 12], // 霜降后最甜
  yam: [10, 11, 12],
  corn: [6, 7, 8, 9],

  // 蔬菜
  pumpkin: [8, 9, 10, 11],
  carrot: [10, 11, 12], // 秋冬采收的最甜
  broccoli: [11, 12, 1, 2, 3], // 冬春
  spinach: [3, 4, 5, 9, 10, 11], // 春秋两茬
  chinese_cabbage: [11, 12, 1, 2],
  zucchini: [5, 6, 7, 8],
  winter_melon: [7, 8, 9],
  tomato: [6, 7, 8, 9],
  pea: [3, 4, 5],
  eggplant: [6, 7, 8, 9],
  cucumber: [5, 6, 7, 8],
  shiitake: [10, 11, 12, 1, 2, 3], // 冬菇
  lotus: [9, 10, 11],
  onion: [5, 6, 7], // 新洋葱上市

  // 水果
  apple: [9, 10, 11],
  pear: [8, 9, 10],
  watermelon: [6, 7, 8],
  peach: [6, 7, 8],
  grape: [7, 8, 9],
  blueberry: [5, 6, 7, 8],
  orange: [11, 12, 1, 2],
  strawberry: [12, 1, 2, 3, 4],
  kiwi: [9, 10, 11],
  mango: [5, 6, 7, 8],

  // 鱼虾
  crab: [9, 10, 11], // 秋蟹

  // 豆与坚果
  red_bean: [10, 11, 12],
  edamame: [6, 7, 8],
  walnut: [9, 10, 11],
  almond: [6, 7]
};

const SEASONS = [
  { key: 'spring', label: '春', months: [3, 4, 5] },
  { key: 'summer', label: '夏', months: [6, 7, 8] },
  { key: 'autumn', label: '秋', months: [9, 10, 11] },
  { key: 'winter', label: '冬', months: [12, 1, 2] }
];

/* ---------------- 进食流水账的枚举 ----------------
 * 「吃了多少」刻意不称「喂养量」，也不出现 g / ml：
 * 给 6 月龄称克数没有意义，反而让记录变成负担。
 */

const AMOUNTS = [
  { key: 'little', label: '几口' },
  { key: 'half', label: '小半碗' },
  { key: 'most', label: '大半碗' },
  { key: 'all', label: '吃完了' }
];

const ACCEPTS = [
  { key: 'love', label: '很爱吃', tone: 'ok' },
  { key: 'ok', label: '还行', tone: 'watch' },
  { key: 'refuse', label: '不肯吃', tone: 'mute' }
];

// 便便只是记录，不参与任何判断（是否过敏由排敏台账负责）
const POOPS = [
  { key: 'normal', label: '正常' },
  { key: 'loose', label: '偏稀' },
  { key: 'hard', label: '偏干' },
  { key: 'none', label: '没拉' }
];

module.exports = {
  READY,
  STAGES,
  MONTH_FOCUS,
  ALLERGENS,
  FOODS,
  RECIPES,
  MENU,
  REACTIONS,
  SEASON_MONTHS,
  SEASONS,
  AMOUNTS,
  ACCEPTS,
  POOPS
};

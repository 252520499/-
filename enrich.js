/**
 * enrich.js —— 红狐原始数据 → 萌宠赛道可用榜单
 *
 * 三个职责：
 *   1) 过滤：剔除与「萌宠/宠物」无关的野生动物、动物园、异宠内容
 *   2) 重排：按「综合爆款指数」排序（点赞 + 评论×5 + 转发×10 + 收藏×3，
 *            转发/评论是更稀缺、更强意愿的信号，权重更高）
 *   3) 打标：根据标题/话题词，给视频打上细分标签
 *          萌宠（基础） / AI萌宠 / 治愈 / 养猫人 / 猫咪冷知识 / 猫咪日常
 *
 * 被 server.js（实时接口）与 refresh.js（离线烘焙）共用，保证两端逻辑一致。
 */
var PET_KEYWORDS = [
  '猫', '狗', '喵', '汪', '宠物', '萌宠', '撸猫', '养猫', '铲屎', '吸猫',
  '小奶', '干饭猫', '成精', '戏精', '橘猫', '布偶', '英短', '暹罗', '狸花',
  '奶牛猫', '缅因', '德文', '蓝猫', '小狗', '仓鼠', '兔子', '鹦鹉', '鱼缸'
];

// 细分标签命中规则：标题/内容出现任一关键词即打该标签
var TAG_RULES = {
  'AI萌宠': ['ai', '人工智能', '赛博', '虚拟', '数字人', 'midjourney', 'stable diffusion', '机器人', '虚拟猫', 'aigc', '科技猫'],
  '治愈': ['治愈', '解压', '放松', '陪伴', '安稳', '温暖', '陪你', '助眠', '暖心', '舒心', '慵懒', '温馨', '安心'],
  '养猫人': ['养猫', '铲屎', '猫奴', '吸猫', '新手养猫', '养猫日常', '猫主人', '把脉猫', '橘猫', '布偶', '英短', '暹罗', '狸花', '奶牛猫', '缅因', '德文', '蓝猫', '干饭猫'],
  '猫咪冷知识': ['冷知识', '科普', '为什么', '揭秘', '知识', '真相', '你不知道', '干货', '涨知识'],
  '猫咪日常': ['日常', '一天', 'vlog', '记录', '生活', '今天', '宅家', '时光', '陪伴']
};

function rawText(it) {
  return ((it.title || '') + ' ' + (it.content || '')).toLowerCase();
}

// 是否萌宠/宠物相关内容（命中任一正向关键词即视为相关）
function isPetRelevant(it) {
  var t = rawText(it);
  for (var i = 0; i < PET_KEYWORDS.length; i++) {
    if (t.indexOf(PET_KEYWORDS[i].toLowerCase()) >= 0) return true;
  }
  return false;
}

// 根据内容打细分标签（萌宠 为基础标签，宠物相关默认带）
function detectTags(it) {
  var t = rawText(it);
  var tags = ['萌宠'];
  for (var tag in TAG_RULES) {
    if (!TAG_RULES.hasOwnProperty(tag)) continue;
    var kws = TAG_RULES[tag];
    for (var i = 0; i < kws.length; i++) {
      if (t.indexOf(kws[i].toLowerCase()) >= 0) { tags.push(tag); break; }
    }
  }
  return tags;
}

// 综合爆款指数
function computeHot(it) {
  var like = Number(it.likeCount) || 0;
  var comment = Number(it.commentCount) || 0;
  var share = Number(it.shareCount) || 0;
  var collect = Number(it.collectCount) || 0;
  return like + comment * 5 + share * 10 + collect * 3;
}

/**
 * 把红狐原始数组转成「萌宠赛道可用榜单」
 * @param {Array} raw 红狐返回的 data 数组
 * @returns {Array} 平面化后的视频对象（保留全部原始字段 + tags / hot / rank）
 */
function enrichItems(raw) {
  if (!Array.isArray(raw)) return [];
  var out = [];
  raw.forEach(function (it, i) {
    if (!isPetRelevant(it)) return; // 过滤非萌宠内容
    var item = Object.assign({}, it);
    item.tags = detectTags(it);
    item.hot = computeHot(it);
    out.push(item);
  });
  out.sort(function (a, b) { return b.hot - a.hot; }); // 综合爆款指数降序
  out.forEach(function (it, i) { it.rank = i + 1; });
  return out;
}

module.exports = {
  enrichItems: enrichItems,
  computeHot: computeHot,
  detectTags: detectTags,
  isPetRelevant: isPetRelevant,
  PET_KEYWORDS: PET_KEYWORDS,
  TAG_RULES: TAG_RULES
};

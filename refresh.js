/**
 * refresh.js —— 离线烘焙真实榜单
 * 用途：当你不想常驻运行后端时，用本脚本拉一次真实榜单，
 *       写入 hot-videos.json，前端静态站会自动读取它作为「本地榜单」。
 *
 * 运行：
 *   cp .env.example .env   # 填入 REDFOX_API_KEY
 *   npm install
 *   npm run refresh        # 或 node refresh.js
 *
 * 生成的 hot-videos.json 会被前端 fallback 读取（无需后端也能显示真实数据）。
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const REDFOX_KEY = process.env.REDFOX_API_KEY || '';
const REDFOX_URL = process.env.REDFOX_URL || 'https://redfox.hk/story/api/dy/search/likesRank';
const SOURCE = 'workbuddy';
const TYPE = process.env.DY_TYPE || '动物';
const OUT = path.join(__dirname, 'hot-videos.json');

function fmtFans(n) {
  n = Number(n) || 0;
  if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
  if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
  return String(n);
}

function parseCount(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  const s = String(v).replace(/,/g, '').replace(/\s/g, '');
  const m = s.match(/([\d.]+)\s*(亿|万)?/);
  if (!m) return 0;
  let n = parseFloat(m[1]);
  if (m[2] === '亿') n *= 1e8; else if (m[2] === '万') n *= 1e4;
  return Math.round(n);
}

function mapItem(it, i) {
  const tags = ['萌宠'];
  if (it.category && it.category !== '萌宠' && tags.indexOf(it.category) === -1) tags.push(it.category);
  const fans = Number(it.followerCount) || 0;
  const author = (it.accountName || '') + (fans ? '（' + fmtFans(fans) + '）' : '');
  return {
    id: 'dy_' + (it.workId || ('idx' + i)),
    title: it.title || it.content || '未命名视频',
    author: author,
    tags: tags,
    like: parseCount(it.likeCount),
    comment: parseCount(it.commentCount),
    share: parseCount(it.shareCount),
    collect: parseCount(it.collectCount),
    url: it.workUrl || '#',
    date: new Date().toISOString().slice(0, 10),
    note: '',
    sample: false,
    source: 'douyin',
    category: it.category || '',
    rank: i + 1,
    cover: it.coverUrl || ''
  };
}

async function main() {
  if (!REDFOX_KEY) {
    console.error('❌ 未配置 REDFOX_API_KEY，请在 .env 中填入后重试。');
    process.exit(1);
  }
  const body = { source: SOURCE, type: TYPE };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(REDFOX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': REDFOX_KEY },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const j = await r.json().catch(() => ({}));
    if (!j || (j.code !== 0 && j.code !== 2000) || !Array.isArray(j.data)) {
      console.error('❌ 红狐接口返回异常：', j && j.msg ? j.msg : ('HTTP ' + r.status));
      process.exit(1);
    }
    const items = j.data.map(mapItem);
    const out = { updatedAt: Date.now(), date: new Date().toISOString().slice(0, 10), source: 'douyin', type: TYPE, items: items };
    fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf-8');
    console.log('✅ 已写入', items.length, '条真实爆款到 hot-videos.json');
  } catch (e) {
    console.error('❌ 请求失败：', (e && e.message) || e);
    process.exit(1);
  } finally {
    clearTimeout(timer);
  }
}

main();

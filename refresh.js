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
const enrich = require('./enrich'); // 萌宠过滤 + 综合爆款指数 + 打标

const REDFOX_KEY = process.env.REDFOX_API_KEY || '';
const REDFOX_URL = process.env.REDFOX_URL || 'https://redfox.hk/story/api/dy/search/likesRank';
const SOURCE = 'workbuddy';
const TYPE = process.env.DY_TYPE || '动物';
const OUT = path.join(__dirname, 'hot-videos.json');

function ymd(d) {
  var z = function (n) { return String(n).padStart(2, '0'); };
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

async function main() {
  if (!REDFOX_KEY) {
    console.error('❌ 未配置 REDFOX_API_KEY，请在 .env 中填入后重试。');
    process.exit(1);
  }
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  const body = { source: SOURCE, type: TYPE, startTime: ymd(start), endTime: ymd(end) };
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
    const items = enrich.enrichItems(j.data);
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

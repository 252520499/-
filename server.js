/**
 * 自媒体创作工作台 —— Node 后端
 * 职责：
 *   1. 托管前端静态文件（index.html / app.js / styles.css ...）
 *   2. 提供 /api/douyin 代理红狐(REDFOX)抖音每日热门榜接口
 *      —— 密钥在服务端（REDFOX_API_KEY），浏览器端永不接触，规避 CORS 与泄密
 *
 * 运行：
 *   cp .env.example .env   # 填入你的 REDFOX_API_KEY
 *   npm install
 *   npm start              # 默认 http://localhost:3000
 *
 * 部署到 Render / 任意 Node 主机：设置环境变量 REDFOX_API_KEY 与 PORT 即可。
 */
const path = require('path');
const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const REDFOX_KEY = process.env.REDFOX_API_KEY || '';
// 可用 REDFOX_URL 覆盖（测试时指向本地 mock）
const REDFOX_URL = process.env.REDFOX_URL || 'https://redfox.hk/story/api/dy/search/likesRank';
const SOURCE = 'workbuddy';

// 简单内存缓存，避免频繁打红狐接口（10 分钟）
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
const UPSTREAM_TIMEOUT = 15000;

// 静态托管：禁用 dotfiles，避免 .env 等被下载
app.use(express.static(__dirname, {
  dotfiles: 'deny',
  index: ['index.html']
}));

app.get('/api/health', function (req, res) {
  res.json({ ok: true, hasKey: !!REDFOX_KEY, ts: Date.now() });
});

app.get('/api/douyin', async function (req, res) {
  const type = (req.query.type || '动物').toString();
  const date = req.query.date ? req.query.date.toString() : '';
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'no-store');

  if (!REDFOX_KEY) {
    return res.json({
      code: 40100,
      msg: '服务端未配置 REDFOX_API_KEY，请在环境变量（或 .env）中设置后重启服务',
      data: null
    });
  }

  const cacheKey = type + '|' + date;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return res.json({ code: 0, msg: 'ok (cached)', data: hit.payload, count: hit.payload.length, cached: true });
  }

  const body = { source: SOURCE, type: type };
  if (date) { body.startTime = date; body.endTime = date; }

  const ctrl = new AbortController();
  const timer = setTimeout(function () { ctrl.abort(); }, UPSTREAM_TIMEOUT);
  try {
    const r = await fetch(REDFOX_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-KEY': REDFOX_KEY },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    const j = await r.json().catch(function () { return {}; });
    if (!j || (j.code !== 0 && j.code !== 2000) || !Array.isArray(j.data)) {
      return res.json({
        code: (j && j.code) || 502,
        msg: (j && j.msg) || ('红狐接口返回异常（HTTP ' + r.status + '）'),
        data: null
      });
    }
    cache.set(cacheKey, { ts: Date.now(), payload: j.data });
    return res.json({ code: 0, msg: 'ok', data: j.data, count: j.data.length });
  } catch (e) {
    const msg = (e && e.name === 'AbortError') ? '请求红狐接口超时' : ('请求红狐接口失败：' + ((e && e.message) || '网络错误'));
    return res.json({ code: 502, msg: msg, data: null });
  } finally {
    clearTimeout(timer);
  }
});

app.listen(PORT, function () {
  console.log('🐾 自媒体创作工作台已启动: http://localhost:' + PORT);
  if (!REDFOX_KEY) {
    console.log('⚠️  未检测到 REDFOX_API_KEY，实时榜单将返回 40100。请配置 .env 后重启。');
  }
});

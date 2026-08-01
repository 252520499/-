(function () {
  'use strict';

  // ============ 常量 ============
  var STORE_KEY = 'smwb_v1';
  var TAGS = ['萌宠', 'AI萌宠', '治愈', '养猫人', '猫咪冷知识', '猫咪日常'];
  var PLATFORMS = ['抖音', '微信视频号', '小红书', 'B站', '快手', '微博', '其他'];
  var STATUSES = [
    { v: '待拍', label: '待拍', cls: 'badge-wait' },
    { v: '拍摄中', label: '拍摄中', cls: 'badge-doing' },
    { v: '已发布', label: '已发布', cls: 'badge-done' }
  ];
  var VIEW_META = {
    viral:   { title: '今日爆款视频', sub: '选题灵感来源 · 萌宠/猫咪赛道' },
    topic:   { title: '今日视频选题', sub: '记录每天确定的视频原题' },
    make:    { title: '今日视频制作', sub: '记录制作耗时与视频时长' },
    publish: { title: '今日视频发布', sub: '记录每天发布视频的时间' },
    stats:   { title: '今日数据盘点', sub: '引用 抖音视频统计.xlsx 对账' }
  };

  // ============ 状态 ============
  function defaultState() {
    return {
      viral: (window.SEED_VIRAL || []).slice(),
      topics: [],
      makes: [],
      publishes: [],
      stats: { imported: false, headers: [], rows: [], at: null, sample: false },
      settings: { tags: TAGS.slice() }
    };
  }
  function loadState() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (!s || typeof s !== 'object') return defaultState();
      // 兼容缺字段
      var d = defaultState();
      for (var k in d) if (!(k in s)) s[k] = d[k];
      if (!Array.isArray(s.viral) || s.viral.length === 0) s.viral = (window.SEED_VIRAL || []).slice();
      return s;
    } catch (e) { return defaultState(); }
  }
  var state = loadState();
  function save() { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }

  // ============ 工具 ============
  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function p2(n) { return n < 10 ? '0' + n : '' + n; }
  function nowTime() { var d = new Date(); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function fmtNum(n) {
    n = Number(n) || 0;
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
    return String(n);
  }
  function parseCount(v) {
    if (typeof v === 'number') return v;
    if (!v) return 0;
    var s = String(v).replace(/,/g, '').replace(/\s/g, '');
    var m = s.match(/([\d.]+)\s*(亿|万)?/);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    if (m[2] === '亿') n *= 1e8; else if (m[2] === '万') n *= 1e4;
    return Math.round(n);
  }
  function parseRate(v) {
    if (typeof v === 'number') return v <= 1 ? +(v * 100).toFixed(1) : v;
    if (!v) return null;
    var s = String(v).replace(/[%,\s]/g, '');
    var n = parseFloat(s);
    if (isNaN(n)) return null;
    return n <= 1 ? +(n * 100).toFixed(1) : n;
  }
  function parseDuration(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    str = String(str).trim();
    if (str.indexOf(':') >= 0) {
      var p = str.split(':'); var m = parseInt(p[0], 10) || 0; var s = parseInt(p[1], 10) || 0;
      return m * 60 + s;
    }
    return parseInt(str, 10) || 0;
  }
  function fmtDuration(sec) {
    sec = parseInt(sec, 10) || 0;
    var m = Math.floor(sec / 60); var s = sec % 60;
    return m + ':' + p2(s);
  }
  function fmtDateTime(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 1800);
  }

  // ============ 路由 ============
  function showView(name) {
    $all('.nav-item').forEach(function (n) { n.classList.toggle('active', n.dataset.view === name); });
    $all('.view').forEach(function (v) { v.classList.toggle('active', v.id === 'view-' + name); });
    var meta = VIEW_META[name];
    $('#viewTitle').textContent = meta.title;
    $('#viewSub').textContent = meta.sub;
    if (name === 'viral') { renderViral(); autoLoadViral(); }
    else if (name === 'topic') renderTopic();
    else if (name === 'make') renderMake();
    else if (name === 'publish') renderPublish();
    else if (name === 'stats') renderStats();
    try { localStorage.setItem('smwb_lastview', name); } catch (e) {}
  }

  // ============ 模态 ============
  function openModal(title, bodyHtml, onMount) {
    var root = $('#modalRoot'), card = $('#modalCard');
    card.innerHTML = '<div class="modal-head"><h3>' + esc(title) + '</h3>' +
      '<button class="modal-close" id="mClose">×</button></div>' + bodyHtml;
    root.hidden = false;
    $('#mClose').addEventListener('click', closeModal);
    $('#modalMask').onclick = closeModal;
    if (onMount) onMount(card);
  }
  function closeModal() {
    $('#modalRoot').hidden = true;
    $('#modalCard').innerHTML = '';
  }

  // ============ 视图：今日爆款视频 ============
  var viralFilter = { tag: '全部', sort: 'default', q: '' };
  function renderViral() {
    var box = $('#view-viral');
    var chips = '<div class="chips" id="tagChips">' +
      chipHtml('全部', viralFilter.tag === '全部');
    state.settings.tags.forEach(function (t) { chips += chipHtml(t, viralFilter.tag === t); });
    chips += '</div>';

    var bar = '<div class="toolbar">' +
      '<div class="search"><span>🔍</span><input id="vSearch" placeholder="搜索标题/作者" value="' + esc(viralFilter.q) + '"></div>' +
      '<select class="select" id="vSort">' +
        opt('default', '综合排序', viralFilter.sort) +
        opt('like', '点赞最高', viralFilter.sort) +
        opt('comment', '评论最高', viralFilter.sort) +
        opt('share', '转发最高', viralFilter.sort) +
        opt('collect', '收藏最高', viralFilter.sort) +
      '</select>' +
      '<button class="btn btn-primary btn-sm" id="vRefresh">🔄 刷新真实榜单</button>' +
      '<button class="btn btn-primary btn-sm" id="vAdd">＋添加</button>' +
      '<button class="btn btn-sm" id="vBulk">批量</button>' +
      '</div>';

    var list = filteredViral();
    var grid = '<div class="viral-grid" id="vGrid"></div>';
    var hint = '<div class="vstatus" id="vStatus">示例数据占位 · 点「🔄 刷新真实榜单」拉取抖音热门榜（需后端代理）</div>' +
      '<div class="muted" style="margin:8px 2px 0">共 ' + list.length + ' 个 · 可在「＋添加 / 批量」补充，或接红狐抖音热门榜拉取真实数据。</div>';

    box.innerHTML = chips + bar + grid + hint;
    paintViralGrid(list);

    // 事件
    $all('#tagChips .chip').forEach(function (c) {
      c.onclick = function () { viralFilter.tag = c.dataset.tag; renderViral(); };
    });
    $('#vSearch').addEventListener('input', function (e) { viralFilter.q = e.target.value.trim(); paintViralGrid(filteredViral()); });
    $('#vSort').onchange = function (e) { viralFilter.sort = e.target.value; paintViralGrid(filteredViral()); };
    $('#vAdd').onclick = openViralAdd;
    $('#vBulk').onclick = openViralBulk;
    $('#vRefresh').onclick = refreshViral;
  }
  function chipHtml(t, active) { return '<span class="chip' + (active ? ' active' : '') + '" data-tag="' + esc(t) + '">' + esc(t) + '</span>'; }
  function opt(v, label, cur) { return '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + label + '</option>'; }
  function filteredViral() {
    var arr = state.viral.slice();
    if (viralFilter.tag !== '全部') arr = arr.filter(function (v) { return (v.tags || []).indexOf(viralFilter.tag) >= 0; });
    if (viralFilter.q) {
      var q = viralFilter.q.toLowerCase();
      arr = arr.filter(function (v) { return (v.title + ' ' + (v.author || '')).toLowerCase().indexOf(q) >= 0; });
    }
    var s = viralFilter.sort;
    if (s !== 'default') arr.sort(function (a, b) { return (b[s] || 0) - (a[s] || 0); });
    return arr;
  }
  function paintViralGrid(list) {
    var grid = $('#vGrid'); if (!grid) return;
    if (!list.length) { grid.innerHTML = '<div class="empty"><div class="big">🐱</div>没有匹配的爆款视频</div>'; return; }
    grid.innerHTML = list.map(function (v, i) {
      var rank = (viralFilter.sort !== 'default') ? '<span class="vcard-rank">#' + (i + 1) + '</span>' : '<span class="vcard-rank">TOP</span>';
      var tags = (v.tags || []).map(function (t) { return '<span class="vtag">' + esc(t) + '</span>'; }).join('');
      return '<div class="card vcard">' +
        (v.cover ? '<div class="vcard-cover"><img loading="lazy" src="' + esc(v.cover) + '" alt=""></div>' : '') +
        '<div class="vcard-head">' + rank + '<span class="muted">' + esc(v.author || '') + '</span></div>' +
        '<div class="vcard-title">' + esc(v.title) + '</div>' +
        '<div class="vtags">' + tags + '</div>' +
        '<div class="vmetrics">' +
          metric('❤️', '点赞', v.like) + metric('💬', '评论', v.comment) +
          metric('🔁', '转发', v.share) + metric('⭐', '收藏', v.collect) +
        '</div>' +
        '<div class="vcard-actions">' +
          '<a class="btn btn-sm" href="' + esc(v.url || '#') + '" target="_blank" rel="noopener">打开</a>' +
          '<button class="btn btn-sm btn-primary" data-act="totopic" data-id="' + v.id + '">转选题</button>' +
          '<button class="btn btn-sm btn-danger" data-act="del" data-id="' + v.id + '">删</button>' +
        '</div>' +
      '</div>';
    }).join('');
    $all('#vGrid [data-act]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.id;
        if (b.dataset.act === 'del') {
          if (confirm('确定删除该视频？')) { state.viral = state.viral.filter(function (x) { return x.id !== id; }); save(); renderViral(); toast('已删除'); }
        } else if (b.dataset.act === 'totopic') {
          var v = state.viral.find(function (x) { return x.id === id; });
          if (v) {
            state.topics.unshift({ id: uid(), date: today(), content: v.title, status: '待拍', note: '来自爆款：' + (v.author || ''), created: Date.now() });
            save(); toast('已加入今日选题');
          }
        }
      };
    });
  }
  function metric(ico, label, val) {
    return '<div class="vmetric"><div class="v">' + fmtNum(val) + '</div><div class="l">' + ico + ' ' + label + '</div></div>';
  }
  function openViralAdd() {
    var tagChecks = state.settings.tags.map(function (t) {
      return '<label style="display:inline-flex;gap:5px;align-items:center;margin:4px 10px 4px 0;font-weight:600">' +
        '<input type="checkbox" name="vtag" value="' + esc(t) + '"> ' + esc(t) + '</label>';
    }).join('');
    var html = '<div class="field"><label>视频标题</label><input id="f_title" placeholder="例如：橘猫的一天"></div>' +
      '<div class="row2"><div class="field"><label>作者</label><input id="f_author" placeholder="账号名"></div>' +
      '<div class="field"><label>链接</label><input id="f_url" placeholder="https://..."></div></div>' +
      '<div class="field"><label>标签（可多选）</label><div>' + tagChecks + '</div></div>' +
      '<div class="row2"><div class="field"><label>点赞</label><input id="f_like" type="number" inputmode="numeric" placeholder="0"></div>' +
      '<div class="field"><label>评论</label><input id="f_comment" type="number" inputmode="numeric" placeholder="0"></div></div>' +
      '<div class="row2"><div class="field"><label>转发</label><input id="f_share" type="number" inputmode="numeric" placeholder="0"></div>' +
      '<div class="field"><label>收藏</label><input id="f_collect" type="number" inputmode="numeric" placeholder="0"></div></div>' +
      '<div class="field"><label>备注</label><input id="f_note" placeholder="选填"></div>' +
      '<button class="btn btn-primary btn-block" id="f_save">保存</button>';
    openModal('添加爆款视频', html, function (card) {
      $('#f_save', card).onclick = function () {
        var tags = $all('input[name=vtag]', card).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
        state.viral.unshift({
          id: uid(), title: $('#f_title', card).value.trim() || '未命名',
          author: $('#f_author', card).value.trim(), url: $('#f_url', card).value.trim(),
          tags: tags.length ? tags : ['萌宠'], like: parseCount($('#f_like', card).value),
          comment: parseCount($('#f_comment', card).value), share: parseCount($('#f_share', card).value),
          collect: parseCount($('#f_collect', card).value), note: $('#f_note', card).value.trim(),
          date: today(), sample: false
        });
        save(); closeModal(); renderViral(); toast('已添加');
      };
    });
  }
  function openViralBulk() {
    var html = '<p class="muted" style="margin-top:0">每行一条，用 <b>|</b> 分隔：<br>标题 | 作者 | 标签(逗号) | 点赞 | 评论 | 转发 | 收藏 | 链接</p>' +
      '<div class="field"><textarea id="f_bulk" rows="7" placeholder="橘猫的一天|猫猫研究所|萌宠,猫咪日常|120000|3000|2000|8000|https://..."></textarea></div>' +
      '<button class="btn btn-primary btn-block" id="f_bulksave">导入</button>';
    openModal('批量导入爆款视频', html, function (card) {
      $('#f_bulksave', card).onclick = function () {
        var lines = $('#f_bulk', card).value.split('\n'); var n = 0;
        lines.forEach(function (ln) {
          ln = ln.trim(); if (!ln) return;
          var p = ln.split('|').map(function (x) { return x.trim(); });
          if (!p[0]) return;
          state.viral.unshift({
            id: uid(), title: p[0], author: p[1] || '', url: p[6] || '',
            tags: (p[2] ? p[2].split(',') : ['萌宠']).map(function (x) { return x.trim(); }).filter(Boolean),
            like: parseCount(p[3]), comment: parseCount(p[4]), share: parseCount(p[5]),
            collect: parseCount(p[7]), note: '', date: today(), sample: false
          });
          n++;
        });
        save(); closeModal(); renderViral(); toast('已导入 ' + n + ' 条');
      };
    });
  }

  // ============ 今日爆款视频 · 真实榜单接入 ============
  var viralAutoLoaded = false;
  function fmtFans(n) {
    n = Number(n) || 0;
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '亿';
    if (n >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '万';
    return String(n);
  }
  function mapDouyinItem(it, i) {
    var tags = ['萌宠'];
    if (it.category && it.category !== '萌宠' && tags.indexOf(it.category) === -1) tags.push(it.category);
    var fans = Number(it.followerCount) || 0;
    var author = (it.accountName || '') + (fans ? '（' + fmtFans(fans) + '）' : '');
    return {
      id: 'dy_' + (it.workId || ('idx' + i)),
      title: it.title || it.content || '未命名视频',
      author: author,
      tags: tags,
      like: parseCount(it.likeCount), comment: parseCount(it.commentCount),
      share: parseCount(it.shareCount), collect: parseCount(it.collectCount),
      url: it.workUrl || '#', date: today(), note: '',
      sample: false, source: 'douyin', category: it.category || '', rank: i + 1,
      cover: it.coverUrl || ''
    };
  }
  function applyDouyinItems(items) {
    // 替换旧的示例/真实数据，保留用户手动添加的条目
    var manual = state.viral.filter(function (v) { return !(v.source === 'douyin' || v.sample === true); });
    state.viral = items.concat(manual);
    save();
  }
  function loadRealViral(opts) {
    opts = opts || {};
    return fetch('/api/douyin?type=' + encodeURIComponent('动物'))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) {
        if (!j || (j.code !== 0 && j.code !== 2000) || !Array.isArray(j.data)) throw new Error((j && j.msg) ? j.msg : '返回格式异常');
        return j.data.map(mapDouyinItem);
      })
      .then(function (mapped) { applyDouyinItems(mapped); return { ok: true, count: mapped.length, live: true }; })
      .catch(function (e1) {
        if (!opts.fallback) throw e1;
        // 降级：读取本地烘焙的 hot-videos.json
        return fetch('hot-videos.json?t=' + Date.now())
          .then(function (r) { if (!r.ok) throw new Error('无本地榜单'); return r.json(); })
          .then(function (j) {
            if (!j || !Array.isArray(j.items) || !j.items.length) throw new Error('本地榜单为空');
            applyDouyinItems(j.items);
            return { ok: true, count: j.items.length, live: false, updatedAt: j.updatedAt };
          });
      });
  }
  function refreshViral() {
    var st = $('#vStatus'); if (st) st.textContent = '刷新中…';
    loadRealViral({ fallback: true }).then(function (r) {
      if (st) st.textContent = (r.live ? '✅ 实时榜单 · ' : '📦 本地榜单 · ') + '更新于 ' + nowTime() + ' · 共 ' + r.count + ' 条';
      renderViral();
      toast('已更新 ' + r.count + ' 条真实爆款');
    }).catch(function (err) {
      if (st) st.textContent = '⚠️ 实时榜单不可用：' + (err && err.message ? err.message : err) + '（显示示例数据）';
    });
  }
  function autoLoadViral() {
    if (viralAutoLoaded) return;
    viralAutoLoaded = true;
    loadRealViral({ fallback: true }).then(function (r) {
      var st = $('#vStatus'); if (st) st.textContent = (r.live ? '✅ 实时榜单 · ' : '📦 本地榜单 · ') + '更新于 ' + nowTime() + ' · 共 ' + r.count + ' 条';
      renderViral();
    }).catch(function () {
      var st = $('#vStatus'); if (st) st.textContent = '示例数据 · 未连接实时榜单服务（运行后端或执行 refresh.js 后可拉取真实数据）';
    });
  }

  // ============ 视图：今日视频选题 ============
  function renderTopic() {
    var box = $('#view-topic');
    var html = '<div class="toolbar">' +
      '<button class="btn btn-primary btn-sm" id="tAdd">＋新增选题</button>' +
      '<span class="muted" id="tCount"></span></div>' +
      '<div class="list" id="tList"></div>';
    box.innerHTML = html;
    paintTopicList();
    $('#tAdd').onclick = openTopicAdd;
  }
  function paintTopicList() {
    var list = $('#tList'); if (!list) return;
    var arr = state.topics.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || '') || (b.created || 0) - (a.created || 0); });
    $('#tCount').textContent = '共 ' + arr.length + ' 条 · 待拍 ' + state.topics.filter(function (t) { return t.status === '待拍'; }).length + ' 条';
    if (!arr.length) { list.innerHTML = '<div class="empty"><div class="big">💡</div>还没有选题，点「＋新增选题」记录今天的视频原题</div>'; return; }
    list.innerHTML = arr.map(function (t) {
      var st = STATUSES.find(function (s) { return s.v === t.status; }) || STATUSES[0];
      return '<div class="card item">' +
        '<div class="item-top"><span class="item-date">' + esc(t.date) + '</span><span class="badge ' + st.cls + '">' + st.label + '</span></div>' +
        '<div class="item-body">' + esc(t.content) + '</div>' +
        (t.note ? '<div class="item-meta"><span>📝 ' + esc(t.note) + '</span></div>' : '') +
        '<div class="item-actions">' +
          '<button class="btn btn-sm" data-act="edit" data-id="' + t.id + '">编辑</button>' +
          '<button class="btn btn-sm btn-danger" data-act="del" data-id="' + t.id + '">删除</button>' +
        '</div></div>';
    }).join('');
    $all('#tList [data-act]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.id, t = state.topics.find(function (x) { return x.id === id; });
        if (!t) return;
        if (b.dataset.act === 'del') { if (confirm('删除该选题？')) { state.topics = state.topics.filter(function (x) { return x.id !== id; }); save(); paintTopicList(); toast('已删除'); } }
        else openTopicAdd(t);
      };
    });
  }
  function openTopicAdd(existing) {
    var e = existing || {};
    var opts = STATUSES.map(function (s) { return '<option value="' + s.v + '"' + (s.v === (e.status || '待拍') ? ' selected' : '') + '>' + s.label + '</option>'; }).join('');
    var html = '<div class="field"><label>日期</label><input id="f_date" type="date" value="' + (e.date || today()) + '"></div>' +
      '<div class="field"><label>选题内容（视频原题）</label><textarea id="f_content" placeholder="今天要拍的短视频主题…">' + esc(e.content || '') + '</textarea></div>' +
      '<div class="field"><label>状态</label><select id="f_status">' + opts + '</select></div>' +
      '<div class="field"><label>备注</label><input id="f_note" value="' + esc(e.note || '') + '" placeholder="选填"></div>' +
      '<button class="btn btn-primary btn-block" id="f_save">保存</button>';
    openModal(existing ? '编辑选题' : '新增选题', html, function (card) {
      $('#f_save', card).onclick = function () {
        var data = { date: $('#f_date', card).value || today(), content: $('#f_content', card).value.trim(), status: $('#f_status', card).value, note: $('#f_note', card).value.trim() };
        if (!data.content) { toast('请填写选题内容'); return; }
        if (existing) { Object.assign(existing, data); } else { state.topics.unshift(Object.assign({ id: uid(), created: Date.now() }, data)); }
        save(); closeModal(); renderTopic(); toast('已保存');
      };
    });
  }

  // ============ 视图：今日视频制作 ============
  function renderMake() {
    var box = $('#view-make');
    box.innerHTML = '<div class="toolbar"><button class="btn btn-primary btn-sm" id="mAdd">＋记录制作</button>' +
      '<span class="muted" id="mSum"></span></div><div class="list" id="mList"></div>';
    paintMakeList();
    $('#mAdd').onclick = openMakeAdd;
  }
  function paintMakeList() {
    var list = $('#mList'); if (!list) return;
    var arr = state.makes.slice().sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
    var totMin = arr.reduce(function (s, x) { return s + (Number(x.minutes) || 0); }, 0);
    var totSec = arr.reduce(function (s, x) { return s + (Number(x.duration) || 0); }, 0);
    $('#mSum').textContent = '累计制作 ' + totMin + ' 分钟 · 视频总时长 ' + fmtDuration(totSec);
    if (!arr.length) { list.innerHTML = '<div class="empty"><div class="big">⏱️</div>还没有制作记录，点「＋记录制作」</div>'; return; }
    list.innerHTML = arr.map(function (m) {
      var topic = (state.topics.find(function (t) { return t.id === m.topicId; }) || {}).content || '';
      var ratio = (Number(m.minutes) > 0) ? (Number(m.duration) / 60 / Number(m.minutes)).toFixed(1) : '—';
      return '<div class="card item">' +
        '<div class="item-top"><span class="item-date">' + esc(m.date) + '</span>' +
        '<span class="muted">产出比 ' + ratio + ' 秒/分</span></div>' +
        (topic ? '<div class="item-body">🎬 ' + esc(topic) + '</div>' : '') +
        '<div class="item-meta"><span>⏱️ 制作耗时 ' + (Number(m.minutes) || 0) + ' 分钟</span>' +
        '<span>🎞️ 视频时长 ' + fmtDuration(m.duration) + '</span></div>' +
        (m.note ? '<div class="item-meta"><span>📝 ' + esc(m.note) + '</span></div>' : '') +
        '<div class="item-actions"><button class="btn btn-sm" data-act="edit" data-id="' + m.id + '">编辑</button>' +
        '<button class="btn btn-sm btn-danger" data-act="del" data-id="' + m.id + '">删除</button></div></div>';
    }).join('');
    $all('#mList [data-act]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.id, m = state.makes.find(function (x) { return x.id === id; });
        if (!m) return;
        if (b.dataset.act === 'del') { if (confirm('删除该记录？')) { state.makes = state.makes.filter(function (x) { return x.id !== id; }); save(); paintMakeList(); toast('已删除'); } }
        else openMakeAdd(m);
      };
    });
  }
  function openMakeAdd(existing) {
    var e = existing || {};
    var opts = '<option value="">（不关联）</option>' + state.topics.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === e.topicId ? ' selected' : '') + '>' + esc(t.date + ' · ' + t.content.slice(0, 12)) + '</option>';
    }).join('');
    var html = '<div class="field"><label>日期</label><input id="f_date" type="date" value="' + (e.date || today()) + '"></div>' +
      '<div class="field"><label>关联选题</label><select id="f_topic">' + opts + '</select></div>' +
      '<div class="row2"><div class="field"><label>制作耗时（分钟）</label><input id="f_min" type="number" inputmode="numeric" value="' + (e.minutes || '') + '" placeholder="如 90"></div>' +
      '<div class="field"><label>视频时长（mm:ss）</label><input id="f_dur" value="' + (e.duration ? fmtDuration(e.duration) : '') + '" placeholder="0:45"></div></div>' +
      '<div class="field"><label>备注</label><input id="f_note" value="' + esc(e.note || '') + '" placeholder="选填"></div>' +
      '<button class="btn btn-primary btn-block" id="f_save">保存</button>';
    openModal(existing ? '编辑制作记录' : '记录视频制作', html, function (card) {
      $('#f_save', card).onclick = function () {
        var data = { date: $('#f_date', card).value || today(), topicId: $('#f_topic', card).value, minutes: parseCount($('#f_min', card).value), duration: parseDuration($('#f_dur', card).value), note: $('#f_note', card).value.trim() };
        if (existing) Object.assign(existing, data); else state.makes.unshift(Object.assign({ id: uid() }, data));
        save(); closeModal(); renderMake(); toast('已保存');
      };
    });
  }

  // ============ 视图：今日视频发布 ============
  function renderPublish() {
    var box = $('#view-publish');
    box.innerHTML = '<div class="toolbar"><button class="btn btn-primary btn-sm" id="pAdd">＋记录发布</button>' +
      '<span class="muted" id="pSum"></span></div><div class="list" id="pList"></div>';
    paintPublishList();
    $('#pAdd').onclick = openPublishAdd;
  }
  function paintPublishList() {
    var list = $('#pList'); if (!list) return;
    var arr = state.publishes.slice().sort(function (a, b) {
      if ((b.date || '') !== (a.date || '')) return (b.date || '').localeCompare(a.date || '');
      return (b.time || '').localeCompare(a.time || '');
    });
    $('#pSum').textContent = '共发布 ' + arr.length + ' 次';
    if (!arr.length) { list.innerHTML = '<div class="empty"><div class="big">🚀</div>还没有发布记录，点「＋记录发布」</div>'; return; }
    list.innerHTML = arr.map(function (p) {
      var topic = (state.topics.find(function (t) { return t.id === p.topicId; }) || {}).content || '';
      return '<div class="card item">' +
        '<div class="item-top"><span class="item-date">' + esc(p.date) + ' ' + esc(p.time) + '</span>' +
        '<span class="badge badge-doing">' + esc(p.platform) + '</span></div>' +
        (topic ? '<div class="item-body">🎬 ' + esc(topic) + '</div>' : '') +
        (p.note ? '<div class="item-meta"><span>📝 ' + esc(p.note) + '</span></div>' : '') +
        '<div class="item-actions"><button class="btn btn-sm" data-act="edit" data-id="' + p.id + '">编辑</button>' +
        '<button class="btn btn-sm btn-danger" data-act="del" data-id="' + p.id + '">删除</button></div></div>';
    }).join('');
    $all('#pList [data-act]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.id, p = state.publishes.find(function (x) { return x.id === id; });
        if (!p) return;
        if (b.dataset.act === 'del') { if (confirm('删除该记录？')) { state.publishes = state.publishes.filter(function (x) { return x.id !== id; }); save(); paintPublishList(); toast('已删除'); } }
        else openPublishAdd(p);
      };
    });
  }
  function openPublishAdd(existing) {
    var e = existing || {};
    var opts = state.topics.map(function (t) {
      return '<option value="' + t.id + '"' + (t.id === e.topicId ? ' selected' : '') + '>' + esc(t.date + ' · ' + t.content.slice(0, 12)) + '</option>';
    }).join('');
    var popts = PLATFORMS.map(function (p) { return '<option value="' + p + '"' + (p === (e.platform || '抖音') ? ' selected' : '') + '>' + p + '</option>'; }).join('');
    var html = '<div class="field"><label>日期</label><input id="f_date" type="date" value="' + (e.date || today()) + '"></div>' +
      '<div class="row2"><div class="field"><label>发布时间</label><input id="f_time" type="time" value="' + (e.time || nowTime()) + '"></div>' +
      '<div class="field"><label>平台</label><select id="f_platform">' + popts + '</select></div></div>' +
      '<div class="field"><label>关联选题</label><select id="f_topic"><option value="">（不关联）</option>' + opts + '</select></div>' +
      '<div class="field"><label>备注</label><input id="f_note" value="' + esc(e.note || '') + '" placeholder="选填"></div>' +
      '<button class="btn btn-primary btn-block" id="f_save">保存</button>';
    openModal(existing ? '编辑发布记录' : '记录视频发布', html, function (card) {
      $('#f_save', card).onclick = function () {
        var data = { date: $('#f_date', card).value || today(), time: $('#f_time', card).value || nowTime(), platform: $('#f_platform', card).value, topicId: $('#f_topic', card).value, note: $('#f_note', card).value.trim() };
        if (existing) Object.assign(existing, data); else state.publishes.unshift(Object.assign({ id: uid() }, data));
        save(); closeModal(); renderPublish(); toast('已保存');
      };
    });
  }

  // ============ 视图：今日数据盘点 ============
  function renderStats() {
    var box = $('#view-stats');
    var has = state.stats && state.stats.rows && state.stats.rows.length;
    var head = '<div class="toolbar">' +
      '<button class="btn btn-primary btn-sm" id="sImport">📥 上传Excel</button>' +
      (has ? '' : '<button class="btn btn-sm" id="sSample">加载示例</button>') +
      (has ? '<button class="btn btn-sm btn-danger" id="sClear">清空</button>' : '') +
      '<input type="file" id="sFile" accept=".xlsx,.xls" hidden>' +
      '</div>';
    if (!has) {
      box.innerHTML = head + '<div class="empty"><div class="big">📊</div>' +
        '上传 <b>抖音视频统计.xlsx</b> 即可自动盘点。<br>文件在你本机解析，不会上传到服务器。</div>';
      bindStatsFile();
      $('#sSample').onclick = loadStatsSample;
      return;
    }
    var sum = statsSummary(state.stats.rows);
    var statCards =
      '<div class="stat-cards">' +
      sc(sum.count, '视频总数') + sc(fmtNum(sum.like), '总点赞') + sc(fmtNum(sum.comment), '总评论') +
      sc(fmtNum(sum.share), '总转发') + sc(fmtNum(sum.collect), '总收藏') + sc(fmtNum(sum.follow), '总关注') +
      sc(sum.avgFinish != null ? sum.avgFinish + '%' : '—', '平均完播率') +
      sc(sum.avgBounce != null ? sum.avgBounce + '%' : '—', '平均2秒跳出') +
      '</div>';

    var trend = buildTrend(state.stats.rows);
    var chart1 = '<div class="card chart-box"><div class="chart-title">📈 每日点赞趋势</div>' + lineChart(trend.like) + '</div>';
    var chart2 = '<div class="card chart-box"><div class="chart-title">🎯 每日完播率(%)</div>' + lineChart(trend.finish) + '</div>';
    var totals = sum.like + sum.comment + sum.share + sum.collect + sum.follow;
    var chart3 = '<div class="card chart-box"><div class="chart-title">💡 互动总量对比</div>' +
      barChart([['点赞', sum.like], ['评论', sum.comment], ['转发', sum.share], ['收藏', sum.collect], ['关注', sum.follow]], totals) + '</div>';

    var tableHtml = '<div class="section-title"><span>明细（共 ' + state.stats.rows.length + ' 条）</span>' +
      '<span class="muted">' + (state.stats.sample ? '示例数据' : '导入于 ' + (state.stats.at ? fmtDateTime(state.stats.at) : '')) + '</span></div>' +
      '<div class="table-wrap"><table class="dt"><thead><tr>' +
      state.stats.headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') + '<th>操作</th></tr></thead><tbody>' +
      state.stats.rows.map(function (r, i) {
        return '<tr>' + state.stats.headers.map(function (h) { return '<td>' + esc(r[h]) + '</td>'; }).join('') +
          '<td><button class="btn btn-sm btn-danger" data-del="' + i + '">删</button></td></tr>';
      }).join('') + '</tbody></table></div>';

    box.innerHTML = head + statCards + chart1 + chart2 + chart3 + tableHtml;
    bindStatsFile();
    $all('#view-stats [data-del]').forEach(function (b) {
      b.onclick = function () { var i = +b.dataset.del; state.stats.rows.splice(i, 1); if (!state.stats.rows.length) state.stats = defaultState().stats; save(); renderStats(); toast('已删除该行'); };
    });
  }
  function bindStatsFile() {
    var btn = $('#sImport'), file = $('#sFile');
    if (!btn || !file) return;
    btn.onclick = function () { file.click(); };
    file.onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var wb = XLSX.read(ev.target.result, { type: 'array' });
          var ws = wb.Sheets[wb.SheetNames[0]];
          var arr = XLSX.utils.sheet_to_json(ws, { header: 1 });
          var parsed = parseStatsSheet(arr);
          if (!parsed.rows.length) { toast('未识别到数据行'); return; }
          state.stats = { imported: true, headers: parsed.headers, rows: parsed.rows, at: Date.now(), sample: false };
          save(); renderStats(); toast('已导入 ' + parsed.rows.length + ' 条');
        } catch (err) { toast('解析失败：' + err.message); }
      };
      reader.readAsArrayBuffer(f);
    };
    var clr = $('#sClear');
    if (clr) clr.onclick = function () { if (confirm('清空已导入的盘点数据？')) { state.stats = defaultState().stats; save(); renderStats(); toast('已清空'); } };
  }
  function parseStatsSheet(arr) {
    // 找到表头行：包含“日期”与“点赞”
    var hIdx = -1;
    for (var i = 0; i < arr.length; i++) {
      var row = arr[i] || [];
      var joined = row.map(function (c) { return String(c || '').trim(); }).join(',');
      if (joined.indexOf('日期') >= 0 && joined.indexOf('点赞') >= 0) { hIdx = i; break; }
    }
    if (hIdx < 0) hIdx = 1;
    var headers = (arr[hIdx] || []).map(function (c, idx) { return String(c || '').trim() || ('列' + (idx + 1)); });
    var rows = [];
    for (var r = hIdx + 1; r < arr.length; r++) {
      var line = arr[r] || [];
      if (!line.length || line.every(function (c) { return !c && c !== 0; })) continue;
      var obj = {};
      headers.forEach(function (h, ci) { obj[h] = line[ci] !== undefined ? line[ci] : ''; });
      // 数值字段清洗
      ['点赞', '评论', '转发', '收藏', '关注'].forEach(function (k) { if (k in obj) obj[k] = parseCount(obj[k]); });
      ['2秒跳出率', '6秒完播率', '完播率', '平均时长'].forEach(function (k) { if (k in obj) { var v = parseRate(obj[k]); obj[k] = (v == null ? obj[k] : v); } });
      rows.push(obj);
    }
    return { headers: headers, rows: rows };
  }
  function statsSummary(rows) {
    var s = { count: rows.length, like: 0, comment: 0, share: 0, collect: 0, follow: 0, fins: [], bounces: [] };
    rows.forEach(function (r) {
      s.like += Number(r['点赞']) || 0; s.comment += Number(r['评论']) || 0; s.share += Number(r['转发']) || 0;
      s.collect += Number(r['收藏']) || 0; s.follow += Number(r['关注']) || 0;
      if (r['完播率'] != null && r['完播率'] !== '') { var f = parseRate(r['完播率']); if (f != null) s.fins.push(f); }
      if (r['2秒跳出率'] != null && r['2秒跳出率'] !== '') { var b = parseRate(r['2秒跳出率']); if (b != null) s.bounces.push(b); }
    });
    s.avgFinish = s.fins.length ? (s.fins.reduce(function (a, b) { return a + b; }, 0) / s.fins.length).toFixed(1) : null;
    s.avgBounce = s.bounces.length ? (s.bounces.reduce(function (a, b) { return a + b; }, 0) / s.bounces.length).toFixed(1) : null;
    return s;
  }
  function buildTrend(rows) {
    var map = {};
    rows.forEach(function (r) {
      var d = r['日期']; if (!d) return; d = String(d).slice(0, 10);
      if (!map[d]) map[d] = { like: 0, finish: [] };
      map[d].like += Number(r['点赞']) || 0;
      var f = parseRate(r['完播率']); if (f != null) map[d].finish.push(f);
    });
    var dates = Object.keys(map).sort();
    return {
      like: dates.map(function (d) { return { label: d.slice(5), value: map[d].like }; }),
      finish: dates.map(function (d) { var a = map[d].finish; return { label: d.slice(5), value: a.length ? +(a.reduce(function (x, y) { return x + y; }, 0) / a.length).toFixed(1) : 0 }; })
    };
  }
  function loadStatsSample() {
    var rows = [], base = new Date(2026, 6, 20);
    var themes = ['橘猫的一天', '布偶猫撒娇', '猫咪冷知识', '治愈撸猫', 'AI萌宠合集', '养猫省钱', '狸花猫捕猎', '三花猫迷惑行为', '雨天文撸猫', '德文卷毛', '英短胖橘', '暹罗话痩'];
    for (var i = 0; i < themes.length; i++) {
      var d = new Date(base.getTime() + i * 86400000 * 2);
      var ds = d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
      var like = 80000 + Math.round(Math.random() * 800000);
      rows.push({
        '日期': ds, '发布时间': p2(8 + (i % 10)) + ':30', '主题': themes[i], '格式': '竖屏', '视频时长': (20 + (i % 40)) + 's',
        '视频文案': '今日份猫片已送达～', '视频所带标签': '萌宠,猫咪日常', '2秒跳出率': (30 + Math.round(Math.random() * 20)),
        '6秒完播率': (40 + Math.round(Math.random() * 25)), '完播率': (25 + Math.round(Math.random() * 30)),
        '平均时长': (8 + Math.round(Math.random() * 12)) + 's', '点赞': like, '评论': Math.round(like * 0.06),
        '转发': Math.round(like * 0.04), '收藏': Math.round(like * 0.12), '关注': Math.round(like * 0.02)
      });
    }
    state.stats = { imported: false, headers: Object.keys(rows[0]), rows: rows, at: null, sample: true };
    save(); renderStats(); toast('已加载示例数据');
  }
  function sc(v, l) { return '<div class="card stat-card"><div class="v">' + esc(v) + '</div><div class="l">' + esc(l) + '</div></div>'; }

  // ============ 图表（SVG） ============
  function lineChart(data) {
    if (!data.length) return '<div class="muted">暂无数据</div>';
    var W = 320, H = 150, pad = 26;
    var max = Math.max.apply(null, data.map(function (d) { return d.value; }).concat([1]));
    var step = data.length > 1 ? (W - pad * 2) / (data.length - 1) : 0;
    var pts = data.map(function (d, i) {
      var x = pad + (data.length > 1 ? step * i : (W - pad * 2) / 2);
      var y = H - pad - (d.value / max) * (H - pad * 2);
      return [x, y];
    });
    var line = pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    var area = 'M' + pts[0][0].toFixed(1) + ',' + (H - pad) + ' L' + line.replace(/ /g, ' L') + ' L' + pts[pts.length - 1][0].toFixed(1) + ',' + (H - pad) + ' Z';
    var dots = pts.map(function (p, i) { return '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="2.6" fill="#ff7e63"/>' + (i % Math.ceil(data.length / 6 || 1) === 0 ? '<text x="' + p[0].toFixed(1) + '" y="' + (H - 6) + '" font-size="8" fill="#9a8f83" text-anchor="middle">' + esc(data[i].label) + '</text>' : ''); }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="none" style="display:block">' +
      '<path d="' + area + '" fill="rgba(255,138,101,0.12)"/>' +
      '<polyline points="' + line + '" fill="none" stroke="#ff7e63" stroke-width="2" stroke-linejoin="round"/>' +
      dots + '</svg>';
  }
  function barChart(data, total) {
    if (!total) return '<div class="muted">暂无数据</div>';
    var W = 320, H = 170, pad = 24, n = data.length;
    var max = Math.max.apply(null, data.map(function (d) { return d[1]; }).concat([1]));
    var bw = (W - pad * 2) / n * 0.62, gap = (W - pad * 2) / n;
    var colors = ['#ff7e63', '#4db6ac', '#ffb74d', '#9575cd', '#4fc3f7'];
    var bars = data.map(function (d, i) {
      var h = (d[1] / max) * (H - pad * 2);
      var x = pad + gap * i + (gap - bw) / 2;
      var y = H - pad - h;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="5" fill="' + colors[i % colors.length] + '"/>' +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" font-size="9" fill="#2f2a25" text-anchor="middle" font-weight="700">' + fmtNum(d[1]) + '</text>' +
        '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 7) + '" font-size="9" fill="#9a8f83" text-anchor="middle">' + esc(d[0]) + '</text>';
    }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" preserveAspectRatio="none" style="display:block">' + bars + '</svg>';
  }

  // ============ 云端备份/恢复 ============
  function openBackup() {
    var cloud = window.location.host && window.location.host.indexOf('cloudstudio') >= 0;
    var html = '<div class="muted" style="margin-top:0">数据默认保存在手机浏览器本地（localStorage），关闭页面不丢失。' +
      '点「导出备份」下载 JSON，存入腾讯文档/网盘即等于云端保存；换手机或清缓存后用「导入恢复」还原。</div>' +
      '<div class="field" style="margin-top:14px"><button class="btn btn-primary btn-block" id="bExport">⬇️ 导出备份（存到云盘）</button></div>' +
      '<div class="field"><button class="btn btn-block" id="bImport">⬆️ 导入恢复</button>' +
      '<input type="file" id="bFile" accept=".json" hidden></div>' +
      '<div class="field"><button class="btn btn-block btn-danger" id="bReset">🗑️ 清空全部数据</button></div>';
    openModal('云端备份 / 恢复', html, function (card) {
      $('#bExport', card).onclick = function () {
        var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = '创作工作台备份_' + today() + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
        toast('已导出，请保存到云盘');
      };
      var file = $('#bFile', card);
      $('#bImport', card).onclick = function () { file.click(); };
      file.onchange = function (e) {
        var f = e.target.files[0]; if (!f) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
          try {
            var data = JSON.parse(ev.target.result);
            if (!data || typeof data !== 'object') throw new Error('格式错误');
            state = Object.assign(defaultState(), data);
            save(); closeModal(); var cur = ($('.nav-item.active') || {}).dataset;
            showView((cur && cur.view) || 'viral'); toast('已恢复备份');
          } catch (err) { toast('恢复失败：' + err.message); }
        };
        reader.readAsText(f);
      };
      $('#bReset', card).onclick = function () {
        if (confirm('确定清空全部数据？此操作不可恢复！')) { state = defaultState(); save(); closeModal(); showView('viral'); toast('已清空'); }
      };
    });
  }

  // ============ 初始化 ============
  function init() {
    $all('.nav-item').forEach(function (n) { n.onclick = function () { showView(n.dataset.view); }; });
    $('#btnBackup').onclick = openBackup;
    var last = 'viral';
    try { last = localStorage.getItem('smwb_lastview') || 'viral'; } catch (e) {}
    showView(last);
    // PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

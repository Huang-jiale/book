/* 知行笔记 · 静态渲染 (Starlight 风格外壳) */
(function () {
  'use strict';

  var contentEl = document.getElementById('content');
  var tocEl = document.getElementById('toc-list');
  var pagEl = document.getElementById('pagination');
  var sidebarEl = document.getElementById('sidebar-list');
  var mdCache = {};
  var manifest = null;
  var DOCS = {};        // id -> {id,title,file,group,prev,next}
  var GROUPS = [];      // [{name, ids:[...]}]
  var searchIdx = null; // [{id,title,text}]
  var pendingScroll = null;
  var spy = null;
  /* 子模块英文标签（首页卡片与顶栏下拉共用） */
  var EN = { ops: 'Operations', pd: 'Product Dev', gk: 'National', gd: 'Guangdong', syb: 'Institution', ai: 'Artificial Intelligence' };

  /* ---------- 主题 ---------- */
  function applyTheme(t) {
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }
  var saved = localStorage.getItem('theme');
  if (!saved) saved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  applyTheme(saved);
  document.getElementById('theme-toggle').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
    localStorage.setItem('theme', cur === 'dark' ? 'light' : 'dark');
  });

  /* ---------- 工具 ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function slugify(text) {
    return String(text).trim().toLowerCase()
      .replace(/[^\w一-龥]+/g, '-').replace(/^-+|-+$/g, '');
  }

  /* ---------- markdown 渲染 ---------- */
  function renderMarkdown(md, currentId) {
    contentEl.innerHTML = window.marked.parse(md);
    var hs = contentEl.querySelectorAll('h1, h2, h3');
    hs.forEach(function (h, i) { if (!h.id) h.id = slugify(h.textContent) + '-' + i; });
    fixInternalLinks(currentId);
    buildTOC(hs);
  }

  /* 把 MD 里的相对 .md 链接（./02-基期量.md、../01-xxx.md、10-xxx.md）改写成站内路由 #/doc/<id> */
  function fixInternalLinks(currentId) {
    if (!currentId) return;
    var prefix = currentId.indexOf('-') >= 0 ? currentId.split('-')[0] : currentId;
    contentEl.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!/\.md($|\?|#)/i.test(href)) return;            // 只处理指向 .md 的链接
      // 清理 ./ 与 ../ 前缀，去掉 .md 后缀；保留原文件名里的数字（含前导零）
      var base = href.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '').split('#')[0].replace(/\.md$/i, '');
      var target = null;
      var m = base.match(/^(\d+)/);
      if (m) {
        var n = m[1];                                     // 原样保留，例如 "02"，不再 parseInt 丢前导零
        var cands = [prefix + '-' + n];
        if (n.length === 1) cands.push(prefix + '-0' + n); // 兼容无前导零（如 "2"）
        for (var k = 0; k < cands.length; k++) {
          if (DOCS[cands[k]]) { target = cands[k]; break; }
        }
      } else if (/附录/.test(base)) {
        var cand2 = prefix + '-appendix';
        if (DOCS[cand2]) target = cand2;
      }
      if (!target && /前言|概述/.test(base)) {
        var cand3 = prefix + '-01';
        if (DOCS[cand3]) target = cand3;
      }
      if (target) {
        a.setAttribute('href', '#/doc/' + target);
        a.classList.add('doc-link');
      } else {
        a.setAttribute('href', 'javascript:void(0)');
        a.style.opacity = '.5';
        a.title = '该章节暂未收录';
      }
    });
  }

  /* ---------- 右侧目录（保持原有逻辑） ---------- */
  function buildTOC(hs) {
    tocEl.innerHTML = '';
    if (!hs.length) return;
    var links = [];
    hs.forEach(function (h, i) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = 'javascript:void(0)';
      a.textContent = h.textContent;
      a.dataset.target = h.id;
      a.addEventListener('click', function () {
        var t = document.getElementById(a.dataset.target);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      li.appendChild(a);
      if (h.tagName === 'H3') li.style.paddingLeft = '1rem';
      tocEl.appendChild(li);
      links.push(a);
    });
    if (spy) spy.disconnect();
    spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (l) { l.classList.remove('active'); });
          links.forEach(function (l) {
            if (l.dataset.target === e.target.id) l.classList.add('active');
          });
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    hs.forEach(function (h) { spy.observe(h); });
  }

  /* ---------- 导航构建（来自 manifest） ---------- */
  function buildNav() {
    manifest.groups.forEach(function (g) {
      var ids = [];
      g.items.forEach(function (it) {
        DOCS[it.id] = { id: it.id, title: it.title, file: it.file, group: g.name, prev: null, next: null };
        ids.push(it.id);
      });
      GROUPS.push({ name: g.name, ids: ids });
    });
    GROUPS.forEach(function (g) {
      g.ids.forEach(function (id, idx) {
        DOCS[id].prev = idx > 0 ? g.ids[idx - 1] : null;
        DOCS[id].next = idx < g.ids.length - 1 ? g.ids[idx + 1] : null;
      });
    });
    renderSidebar();
  }

  function renderSidebar() {
    sidebarEl.innerHTML = '';
    var liHome = document.createElement('li');
    liHome.innerHTML = '<a href="#/" data-route="__home">首页</a>';
    sidebarEl.appendChild(liHome);
    var homeA = liHome.querySelector('a');
    homeA.addEventListener('click', function (e) { e.preventDefault(); location.hash = '#/'; });

    GROUPS.forEach(function (g) {
      var li = document.createElement('li');
      var det = document.createElement('details');
      det.open = true;
      var sum = document.createElement('summary');
      sum.innerHTML = '<span class="group-label"><span class="large">' + g.name + '</span></span>';
      det.appendChild(sum);
      var ul = document.createElement('ul');
      g.ids.forEach(function (id) {
        var cli = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#/doc/' + id;
        a.dataset.route = id;
        a.textContent = DOCS[id].title;
        cli.appendChild(a);
        ul.appendChild(cli);
      });
      det.appendChild(ul);
      li.appendChild(det);
      sidebarEl.appendChild(li);
    });
  }

  function setActive(route) {
    document.querySelectorAll('.sidebar a[data-route]').forEach(function (a) {
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* 顶部导航高亮：根据当前路由点亮 首页 / 工作 / 学习（含其子模块页） */
  function updateTopNav(route) {
    document.querySelectorAll('.dt-navlink').forEach(function (a) { a.classList.remove('active'); });
    document.querySelectorAll('.dt-dropdown-menu a').forEach(function (a) { a.classList.remove('active'); });
    function on(sel) { var a = document.querySelector(sel); if (a) a.classList.add('active'); }
    if (route === '' || route === '__home') { on('.dt-navlink[href="#/"]'); return; }
    /* 推算当前路由归属的模块（work / study） */
    var pillarKey = null;
    if (route.indexOf('cat/work') === 0) pillarKey = 'work';
    else if (route.indexOf('cat/study') === 0) pillarKey = 'study';
    else if (route.indexOf('cat/') === 0) {
      var ckey = route.slice(4);
      if (manifest && manifest.home) {
        manifest.home.forEach(function (p) {
          if (p.key === ckey) { pillarKey = p.key; }
          (p.items || []).forEach(function (it) { if (it.key === ckey) { pillarKey = p.key; } });
        });
      }
    } else if (route.indexOf('doc/') === 0) {
      pillarKey = 'study'; /* 文档均为考公学习资料 */
    }
    if (pillarKey === 'work') on('.dt-navlink[href="#/cat/work"]');
    else if (pillarKey === 'study') on('.dt-navlink[href="#/cat/study"]');
    /* 高亮顶栏下拉里与当前路由匹配的模块项 */
    var cur = document.querySelector('.dt-dropdown-menu a[href="#/' + route + '"]');
    if (cur) cur.classList.add('active');
  }

  /* 顶栏下拉：由 manifest.home 动态生成 工作 / 学习 的子模块菜单 */
  function buildTopNav() {
    if (!manifest || !manifest.home) return;
    function fill(containerId, pillarKey) {
      var container = document.getElementById(containerId);
      if (!container) return;
      var p = null;
      manifest.home.forEach(function (pp) { if (pp.key === pillarKey) p = pp; });
      if (!p) return;
      var items = ['<a class="dd-all" href="#/cat/' + p.key + '"><span>查看全部</span></a>'];
      (p.items || []).forEach(function (it) {
        var en = EN[it.key] || '';
        items.push('<a href="#/cat/' + it.key + '"><span>' + escapeHtml(it.label) + '</span><span class="dd-en">' + escapeHtml(en) + '</span></a>');
      });
      container.innerHTML = items.join('');
    }
    fill('dd-work', 'work');
    fill('dd-study', 'study');
  }

  /* 下拉开合控制 */
  function closeDropdowns(except) {
    document.querySelectorAll('.dt-dropdown.open').forEach(function (d) {
      if (d !== except) d.classList.remove('open');
    });
  }
  function initDropdowns() {
    document.querySelectorAll('.dt-dropdown-toggle').forEach(function (toggle) {
      toggle.addEventListener('click', function (e) {
        e.preventDefault();
        var dd = toggle.closest('.dt-dropdown');
        var isOpen = dd.classList.contains('open');
        closeDropdowns();
        if (!isOpen) dd.classList.add('open');
      });
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.dt-dropdown')) closeDropdowns();
    });
  }

  /* ---------- 分页（同模块内上一篇/下一篇） ---------- */
  function renderPagination(id) {
    pagEl.innerHTML = '';
    var d = DOCS[id];
    if (!d) return;
    if (d.prev) pagEl.appendChild(makePage(DOCS[d.prev], 'prev'));
    if (d.next) pagEl.appendChild(makePage(DOCS[d.next], 'next'));
  }
  function makePage(doc, dir) {
    var a = document.createElement('a');
    a.href = '#/doc/' + doc.id;
    a.innerHTML = '<span class="link-title">' + (dir === 'prev' ? '← ' : '') + doc.title + (dir === 'next' ? ' →' : '') + '</span>';
    a.addEventListener('click', function (e) { e.preventDefault(); location.hash = '#/doc/' + doc.id; });
    return a;
  }

  /* ---------- 首页：书房 (Study Room) ---------- */
  function renderHome() {
    tocEl.innerHTML = '';
    document.body.classList.add('on-home');
    var home = (manifest && manifest.home) ? manifest.home : [];
    var html = '<div class="home-v2">';
    html += '<div class="home-v2-inner">';
    html += '<section class="hv-hero">';
    html += '<div class="hv-seal"><span>心</span></div>';
    html += '<h1 class="hv-title">书房</h1>';
    html += '<p class="hv-sub">INNER STUDY — WORK &amp; LEARN</p>';
    html += '</section>';
    html += '<div class="hv-label"><span class="hv-label-line"></span><span class="hv-label-text">双轨</span><span class="hv-label-line"></span></div>';
    html += '<div class="hv-grid">';
    home.forEach(function (p) {
      var dm = p.key;
      html += '<article class="hv-card" data-module="' + dm + '">';
      html += '<h2 class="hv-card-title">' + escapeHtml(p.title) + '</h2>';
      html += '<p class="hv-card-en">' + (dm === 'work' ? 'Workstream' : 'Examination &amp; AI') + '</p>';
      html += '<div class="hv-divider"></div>';
      html += '<ul class="hv-items">';
      (p.items || []).forEach(function (it) {
        var en = EN[it.key] || '';
        html += '<li><a class="hv-item" href="#/cat/' + it.key + '">';
        html += '<span class="hv-item-dot"></span>';
        html += '<span>' + escapeHtml(it.label) + '</span>';
        html += '<span class="hv-item-tag">' + escapeHtml(en) + '</span>';
        html += '</a></li>';
      });
      html += '</ul></article>';
    });
    html += '</div>';
    html += '</div>';
    html += '</div>';
    contentEl.innerHTML = html;
    contentEl.querySelectorAll('.hv-item').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); location.hash = a.getAttribute('href').replace(/^#/, ''); });
    });
  }

  /* ---------- 模块分类页（首页子标签着陆，亦支持 工作/学习 总览） ---------- */
  function renderCat(key) {
    if (!manifest || !manifest.home) { contentEl.innerHTML = '<h1>页面不存在</h1><p>返回 <a href="#/">首页</a></p>'; return; }
    var pillar = null, item = null;
    manifest.home.forEach(function (p) {
      if (p.key === key) { pillar = p; return; }
      (p.items || []).forEach(function (it) { if (it.key === key) { pillar = p; item = it; } });
    });
    if (!pillar) { contentEl.innerHTML = '<h1>页面不存在</h1><p>返回 <a href="#/">首页</a></p>'; return; }
    tocEl.innerHTML = '';
    document.body.classList.add('on-home');
    var html = '';
    if (!item) {
      /* 模块总览页（如 工作 / 学习）：列出其下所有子模块 */
      html += '<div class="cat-back"><a href="#/">← 首页</a></div>';
      html += '<div class="cat-title">' + escapeHtml(pillar.title) + '</div>';
      html += '<ul class="cat-list">';
      (pillar.items || []).forEach(function (it) {
        html += '<li><a class="cat-list-link" href="#/cat/' + it.key + '">' + escapeHtml(it.label) + '</a></li>';
      });
      html += '</ul>';
      document.title = pillar.title + ' · 书房';
    } else {
      /* 子模块页：列出该模块下的笔记文档 */
      var ids = (manifest.catPages && manifest.catPages[key]) ? manifest.catPages[key] : [];
      html += '<div class="cat-back"><a href="#/">← 首页</a> · <a href="#/cat/' + pillar.key + '">' + escapeHtml(pillar.title) + '</a></div>';
      html += '<div class="cat-title">' + escapeHtml(pillar.title) + ' · ' + escapeHtml(item.label) + '</div>';
      if (!ids.length) {
        html += '<div class="cat-empty">该模块笔记整理中，敬请期待 📝</div>';
      } else {
        if (key === 'gk' || key === 'gd' || key === 'syb') {
          html += '<div class="cat-note">以下为考公通用素材（行测 / 申论），适用于' + escapeHtml(item.label) + '等考试。</div>';
        }
        html += '<ul class="cat-list">';
        ids.forEach(function (id) {
          if (DOCS[id]) html += '<li><a class="cat-list-link" href="#/doc/' + id + '">' + escapeHtml(DOCS[id].title) + '</a></li>';
        });
        html += '</ul>';
      }
      document.title = pillar.title + ' · ' + item.label + ' · 书房';
    }
    contentEl.innerHTML = html;
    contentEl.querySelectorAll('a[href^="#/doc/"], a[href^="#/cat/"]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); location.hash = a.getAttribute('href').replace(/^#/, ''); });
    });
    setActive('__home');
    renderPagination(null);
    window.scrollTo(0, 0);
  }

  /* ---------- 路由 ---------- */
  function currentRoute() {
    var h = location.hash.replace(/^#\/?/, '');
    return h;
  }

  function loadDoc(id) {
    var d = DOCS[id];
    if (!d) return;
    if (mdCache[d.file]) {
      renderMarkdown(mdCache[d.file], id);
      afterRender(id);
      return;
    }
    fetch(d.file).then(function (r) { return r.text(); }).then(function (md) {
      mdCache[d.file] = md;
      renderMarkdown(md, id);
      afterRender(id);
    }).catch(function () {
      contentEl.innerHTML = '<h1>加载失败</h1><p>' + escapeHtml(d.file) + '</p>';
    });
  }

  function scrollToMatch(q) {
    var low = q.toLowerCase();
    var hs = contentEl.querySelectorAll('h1, h2, h3');
    for (var i = 0; i < hs.length; i++) {
      if (hs[i].textContent.toLowerCase().indexOf(low) >= 0) {
        hs[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    var walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT);
    var n;
    while ((n = walker.nextNode())) {
      if (n.nodeValue && n.nodeValue.toLowerCase().indexOf(low) >= 0) {
        var el = n.parentElement;
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
  }

  function afterRender(id) {
    setActive(id);
    renderPagination(id);
    document.body.classList.remove('on-home');
    if (pendingScroll) {
      scrollToMatch(pendingScroll);
      pendingScroll = null;
    } else {
      window.scrollTo(0, 0);
      var mp = document.querySelector('.main-pane');
      if (mp && mp.scrollTo) mp.scrollTo(0, 0);
    }
    document.title = DOCS[id] ? DOCS[id].title + ' · 书房' : '书房';
  }

  function router() {
    var route = currentRoute();
    updateTopNav(route);
    closeDropdowns();
    if (route === '' || route === '__home') {
      renderHome();
      setActive('__home');
      renderPagination(null);
      document.title = '书房';
      return;
    }
    if (route.indexOf('cat/') === 0) {
      var ckey = route.slice(4);
      if (manifest && manifest.home) { renderCat(ckey); return; }
    }
    if (route.indexOf('doc/') === 0) {
      var id = route.slice(4);
      if (DOCS[id]) { loadDoc(id); return; }
    }
    contentEl.innerHTML = '<h1>页面不存在</h1><p>返回 <a href="#/">首页</a></p>';
  }

  /* ---------- 搜索（全文索引） ---------- */
  function buildSearchIndex() {
    var entries = Object.keys(DOCS).map(function (id) { return { id: id, file: DOCS[id].file }; });
    Promise.all(entries.map(function (o) {
      return fetch(o.file).then(function (r) { return r.text(); }).then(function (md) {
        var text = stripMarkdown(md);
        return { id: o.id, title: DOCS[o.id].title, text: text };
      });
    })).then(function (res) {
      searchIdx = res;
    }).catch(function () { searchIdx = []; });
  }

  function stripMarkdown(md) {
    return md
      .replace(/^#{1,6}\s+/gm, '')        // 标题符号
      .replace(/`{1,3}[^`]*`{1,3}/g, ' ')  // 行内/块代码
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // 图片
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // 链接文字
      .replace(/[*_~>#-]/g, ' ')          // 其它符号
      .replace(/\s+/g, ' ')
      .trim();
  }

  function initSearch() {
    var sin = document.getElementById('search-input');
    var sres = document.getElementById('search-results');

    sin.addEventListener('input', function () {
      var q = sin.value.trim();
      if (!q) { sres.hidden = true; sres.innerHTML = ''; return; }
      if (!searchIdx) {
        sres.hidden = false;
        sres.innerHTML = '<div class="dt-sr-empty">索引构建中…</div>';
        return;
      }
      var low = q.toLowerCase();
      var hits = [];
      searchIdx.forEach(function (doc) {
        var idx = doc.text.toLowerCase().indexOf(low);
        if (idx >= 0) {
          var start = Math.max(0, idx - 24);
          var end = Math.min(doc.text.length, idx + 80);
          var snip = doc.text.slice(start, end).replace(/\n/g, ' ');
          if (start > 0) snip = '…' + snip;
          if (end < doc.text.length) snip = snip + '…';
          hits.push({ id: doc.id, title: doc.title, snip: snip });
        }
      });
      if (!hits.length) {
        sres.hidden = false;
        sres.innerHTML = '<div class="dt-sr-empty">未找到 “' + escapeHtml(q) + '”</div>';
        return;
      }
      sres.hidden = false;
      sres.innerHTML = hits.slice(0, 12).map(function (h) {
        return '<a class="dt-sr-item" href="#/doc/' + h.id + '" data-q="' + escapeHtml(q) + '">' +
          '<span class="dt-sr-head">' + escapeHtml(h.title) + '</span>' +
          '<span class="dt-sr-text">' + escapeHtml(h.snip) + '</span></a>';
      }).join('');
      sres.querySelectorAll('a').forEach(function (a) {
        a.addEventListener('click', function () {
          pendingScroll = a.dataset.q;
          sres.hidden = true;
          sin.value = '';
        });
      });
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.dt-search')) sres.hidden = true;
    });
  }

  /* ---------- 启动 ---------- */
  fetch('content/manifest.json')
    .then(function (r) { return r.json(); })
    .then(function (m) {
      manifest = m;
      buildNav();
      buildTopNav();
      initDropdowns();
      buildSearchIndex();
      initSearch();
      window.addEventListener('hashchange', router);
      router();
    })
    .catch(function () {
      contentEl.innerHTML = '<h1>加载失败</h1><p>无法读取 content/manifest.json</p>';
    });
})();

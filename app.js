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

  /* 把 MD 里的相对 .md 链接（./02-基期量.md、./附录-xxx.md）改写成站内路由 #/doc/<id> */
  function fixInternalLinks(currentId) {
    if (!currentId) return;
    var prefix = currentId.indexOf('-') >= 0 ? currentId.split('-')[0] : currentId;
    contentEl.querySelectorAll('a[href]').forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!/\.md($|\?|#)/i.test(href)) return;            // 只处理指向 .md 的链接
      var base = href.replace(/^\.?\//, '').split('#')[0].replace(/\.md$/i, '');
      var target = null;
      var m = base.match(/^(\d+)/);
      if (m) {
        var cand = prefix + '-' + parseInt(m[1], 10);
        if (DOCS[cand]) target = cand;
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

  /* ---------- 首页手风琴 ---------- */
  function renderHome() {
    tocEl.innerHTML = '';
    document.body.classList.add('on-home');
    var html = '<div class="home-accordion">';
    GROUPS.forEach(function (g) {
      var label = g.name === '资料分析' ? '资料分析备考手册' : '判断推理备考手册';
      html += '<section class="acc-module">';
      html += '<button class="acc-head" type="button" aria-expanded="false">';
      html += '<span class="acc-title">' + escapeHtml(label) + '</span>';
      html += '<svg class="acc-chevron" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>';
      html += '</button>';
      html += '<div class="acc-body" hidden><ul class="acc-list">';
      g.ids.forEach(function (id) {
        html += '<li><a href="#/doc/' + id + '">' + escapeHtml(DOCS[id].title) + '</a></li>';
      });
      html += '</ul></div></section>';
    });
    html += '</div>';
    contentEl.innerHTML = html;

    contentEl.querySelectorAll('.acc-head').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var body = btn.nextElementSibling;
        var open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        body.hidden = open;
      });
    });
    contentEl.querySelectorAll('.acc-list a').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); location.hash = a.getAttribute('href').replace(/^#/, ''); });
    });
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
    document.title = DOCS[id] ? DOCS[id].title + ' · 知行笔记' : '知行笔记';
  }

  function router() {
    var route = currentRoute();
    if (route === '' || route === '__home') {
      renderHome();
      setActive('__home');
      renderPagination(null);
      document.title = '知行笔记';
      return;
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
      buildSearchIndex();
      initSearch();
      window.addEventListener('hashchange', router);
      router();
    })
    .catch(function () {
      contentEl.innerHTML = '<h1>加载失败</h1><p>无法读取 content/manifest.json</p>';
    });
})();

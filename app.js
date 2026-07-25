/* 知行笔记 · 静态渲染 (Starlight 风格外壳) */
(function () {
  'use strict';

  var DOCS = {
    zilaio:  { title: '资料分析备考手册', file: 'content/zilaio.md', next: 'panduan', prev: null },
    panduan: { title: '判断推理备考手册', file: 'content/panduan.md', next: null, prev: 'zilaio' }
  };
  var TITLES = { zilaio: '资料分析备考手册', panduan: '判断推理备考手册', '': '知行笔记' };

  var contentEl = document.getElementById('content');
  var tocEl = document.getElementById('toc-list');
  var pagEl = document.getElementById('pagination');
  var mdCache = {};

  /* ---------- 主题 ---------- */
  function applyTheme(t) {
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
  }
  var saved = localStorage.getItem('theme');
  if (!saved) saved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved);
  document.getElementById('theme-toggle').addEventListener('click', function () {
    var cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('theme', next);
  });

  /* ---------- markdown ---------- */
  function slugify(text, i) {
    return 'h-' + i + '-' + text.replace(/\s+/g, '-').slice(0, 24);
  }

  function renderMarkdown(md) {
    var html = window.marked.parse(md);
    contentEl.innerHTML = html;
    // 给 h2/h3 加 id
    var hs = contentEl.querySelectorAll('h2, h3');
    hs.forEach(function (h, i) { if (!h.id) h.id = slugify(h.textContent, i); });
    buildTOC(hs);
  }

  /* ---------- 右侧目录 ---------- */
  var spy = null;
  function buildTOC(hs) {
    tocEl.innerHTML = '';
    if (!hs.length) return;
    var links = [];
    hs.forEach(function (h) {
      var li = document.createElement('li');
      li.className = 'astro-gnoq344e';
      var a = document.createElement('a');
      a.className = 'astro-gnoq344e';
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
    // scroll-spy
    if (spy) spy.disconnect();
    spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          links.forEach(function (l) { l.classList.remove('active'); });
          var act = links.find(function (l) { return l.dataset.target === e.target.id; });
          if (act) act.classList.add('active');
        }
      });
    }, { rootMargin: '-80px 0px -70% 0px' });
    hs.forEach(function (h) { spy.observe(h); });
  }

  /* ---------- 分页 ---------- */
  function renderPagination(route) {
    pagEl.innerHTML = '';
    var d = DOCS[route];
    if (!d) return;
    if (d.prev) {
      var p = DOCS[d.prev];
      pagEl.appendChild(makePage(p, '上一篇', 'prev'));
    }
    if (d.next) {
      var n = DOCS[d.next];
      pagEl.appendChild(makePage(n, '下一篇', 'next'));
    }
  }
  function makePage(doc, label, dir) {
    var a = document.createElement('a');
    a.className = 'astro-u2l5gyhi';
    a.href = '#/' + (doc === DOCS.zilaio ? 'zilaio' : 'panduan');
    a.innerHTML = '<span class="link-title astro-u2l5gyhi">' + (dir === 'prev' ? '← ' : '') + doc.title + (dir === 'next' ? ' →' : '') + '</span>';
    return a;
  }

  /* ---------- 侧栏高亮 ---------- */
  function setActive(route) {
    document.querySelectorAll('.sidebar a[data-route]').forEach(function (a) {
      if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* ---------- 路由 ---------- */
  function currentRoute() {
    var h = location.hash.replace(/^#\/?/, '');
    if (!h || h === '' ) return '__home';
    return h;
  }

  function loadDoc(route, d) {
    if (mdCache[d.file]) {
      renderMarkdown(mdCache[d.file]);
      afterRender(route);
      return;
    }
    fetch(d.file).then(function (r) { return r.text(); }).then(function (md) {
      mdCache[d.file] = md;
      renderMarkdown(md);
      afterRender(route);
    }).catch(function () {
      contentEl.innerHTML = '<p>加载失败：' + d.file + '</p>';
    });
  }

  function afterRender(route) {
    setActive(route);
    renderPagination(route);
    document.querySelector('.main-pane').scrollTo && document.querySelector('.main-pane').scrollTo(0, 0);
    window.scrollTo(0, 0);
    document.title = TITLES[route] || '知行笔记';
  }

  function router() {
    var route = currentRoute();
    if (route === '__home') {
      loadDoc('__home', { file: 'content/home.md' });
      setActive('__home');
      renderPagination(null);
      document.title = '知行笔记';
      return;
    }
    if (DOCS[route]) {
      loadDoc(route, DOCS[route]);
    } else {
      contentEl.innerHTML = '<h1>页面不存在</h1><p>返回 <a href="#/">首页</a></p>';
    }
  }

  window.addEventListener('hashchange', router);
  router();

  /* ---------- 搜索 ---------- */
  var searchIdx = null;
  function buildSearchIndex() {
    var files = ['content/资料分析知识库-备考手册.md', 'content/判断推理知识库-备考手册.md'];
    Promise.all(files.map(function (f) {
      return fetch(f).then(function (r) { return r.text(); }).then(function (md) { return { f: f, md: md }; });
    })).then(function (res) {
      searchIdx = [];
      res.forEach(function (o) {
        var route = o.f.indexOf('资料分析') >= 0 ? 'zilaio' : 'panduan';
        var blocks = o.md.split(/\n#{1,3} /);
        blocks.forEach(function (b) {
          var firstLine = b.split('\n')[0];
          if (b.trim().length < 6) return;
          searchIdx.push({ route: route, head: firstLine.slice(0, 40), text: b.replace(/\n/g, ' ').slice(0, 120) });
        });
      });
    });
  }
  buildSearchIndex();

  var sin = document.getElementById('search-input');
  var sres = document.getElementById('search-results');
  sin.addEventListener('input', function () {
    var q = sin.value.trim();
    if (!q) { sres.hidden = true; sres.innerHTML = ''; return; }
    if (!searchIdx) return;
    var hits = searchIdx.filter(function (x) { return x.text.indexOf(q) >= 0 || x.head.indexOf(q) >= 0; }).slice(0, 8);
    if (!hits.length) { sres.hidden = false; sres.innerHTML = '<div class="dt-sr-empty">无结果</div>'; return; }
    sres.hidden = false;
    sres.innerHTML = hits.map(function (h) {
      return '<a class="dt-sr-item" href="#/' + h.route + '"><span class="dt-sr-head">' + h.head + '</span><span class="dt-sr-text">' + h.text + '</span></a>';
    }).join('');
    Array.prototype.forEach.call(sres.querySelectorAll('a'), function (a) {
      a.addEventListener('click', function () { sres.hidden = true; sin.value = ''; });
    });
  });
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.dt-search')) { sres.hidden = true; }
  });
})();

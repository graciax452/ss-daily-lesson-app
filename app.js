(function() {
  // === CONFIGURATION ===
  const SUPABASE_URL = 'https://zmuhinskhofhvyclkrbr.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptdWhpbnNraG9maHZ5Y2xrcmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MjA3NzEsImV4cCI6MjA5OTE5Njc3MX0.eRmLcHn2ywawr2AC_J4mPz3TrDxJVt0qnEMVc9mVSnI'; // <-- Replace with your key
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Verified identity (mazwi LAUNCH.md C3). The WordPress snippet prints a signed token for the
  // logged-in member as window.MAZWI_MEMBER_TOKEN; mazwi's member-signin function turns it into
  // a real Supabase login (the same account mazwi uses). Rows are then owned by user_id, and the
  // database rules (docs/c3-rls.sql) only let signed-in members read or write.
  const MEMBER_SIGNIN_URL = 'https://mazwi.app/.netlify/functions/member-signin';
  let _authP = null;
  let _uid = null;

  function emailFromToken(token) {
    try {
      const payload = String(token || '').split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      return String(JSON.parse(atob(payload)).e || '').toLowerCase() || null;
    } catch (e) { return null; }
  }

  // Resolves to the signed-in user's id, or null (not a member / not signed in). Every database
  // call awaits this first. A failed attempt is retried on the next call.
  function ensureAuth() {
    if (!_authP) {
      _authP = (async () => {
        try {
          const auth = supabase.auth;
          if (!auth) return null;
          const token = window.MAZWI_MEMBER_TOKEN;
          const tokenEmail = emailFromToken(token);
          const { data } = await auth.getSession();
          const sess = data && data.session;
          if (sess && sess.user && (!tokenEmail || String(sess.user.email).toLowerCase() === tokenEmail)) {
            _uid = sess.user.id;
            return _uid;
          }
          if (!token) return null;
          const res = await fetch(MEMBER_SIGNIN_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
          });
          if (!res.ok) return null;
          const r = await res.json();
          const { data: v, error } = await auth.verifyOtp({ token_hash: r.token_hash, type: r.type });
          if (error || !v || !v.user) return null;
          _uid = v.user.id;
          return _uid;
        } catch (e) { return null; }
      })().then((id) => { if (!id) _authP = null; return id; });
    }
    return _authP;
  }

  // Everything members type (names, memos, replies) and every URL from the database is
  // untrusted: escape before it goes into innerHTML so one member can't inject markup or
  // scripts into everyone else's lesson page.
  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function safeUrl(u) {
    const s = String(u == null ? '' : u).trim();
    return /^https?:\/\//i.test(s) ? escHtml(s) : '';
  }

  // Lesson list published by mazwi (built from its data/lessons.csv) — the single source of
  // truth for Zuva numbers, weeks and titles. Matched to the page by its FluentCommunity URL.
  const MAZWI_LESSONS_URL = 'https://mazwi.app/lessons.json';
  let _lessonsManifest = null;
  async function loadLessonsManifest() {
    if (_lessonsManifest) return _lessonsManifest;
    try {
      // Node test runs (module defined) never hit the network.
      if (typeof fetch !== 'function' || typeof module !== 'undefined') return [];
      const res = await fetch(MAZWI_LESSONS_URL, { cache: 'no-cache' });
      const json = await res.json();
      _lessonsManifest = Array.isArray(json.lessons) ? json.lessons : [];
    } catch (e) {
      _lessonsManifest = [];
    }
    return _lessonsManifest;
  }

  // Test hook: lets tests inject a manifest without a network fetch.
  function _setLessonsManifest(m) { _lessonsManifest = m; }

  // "Zuva 3 · Five clean vowels" or the older "Day 3" stub titles → 3.
  function zuvaFromTitle(title) {
    const m = /\b(?:zuva|day)\s*(\d+)/i.exec(String(title || ''));
    return m ? parseInt(m[1], 10) : null;
  }

  function getLessonTitle() {
    const h = document.querySelector('.fcom_lesson_title h1');
    return h ? h.textContent.trim() : '';
  }

  // Which Zuva a lesson page is: its FluentCommunity URL (if listed), else the Zuva/Day
  // number in its title, else an exact title match.
  function findLessonEntry(lessons, { href, title } = {}) {
    const list = lessons || [];
    const byUrl = href ? findZuvaForUrl(list, href) : null;
    if (byUrl) return byUrl;
    const n = zuvaFromTitle(title);
    if (n !== null) {
      const byNum = list.find((l) => l.zuva === n);
      if (byNum) return byNum;
    }
    const t = String(title || '').trim().toLowerCase();
    return (t && list.find((l) => String(l.title || '').trim().toLowerCase() === t)) || null;
  }

  // Onboarding (Zuva 0) is setup, not a lesson — it never counts towards progress.
  function isOnboardingLesson(lesson) {
    return zuvaFromTitle(lesson && lesson.title) === 0 || /onboarding/i.test((lesson && lesson.section) || '');
  }

  // Progress over real lessons only. justCompletedId covers the lesson being completed right
  // now, which FluentCommunity's cached course data doesn't know about yet.
  function lessonProgress(course, justCompletedId) {
    const lessons = ((course && course.lessons) || []).filter((l) => !isOnboardingLesson(l));
    const done = new Set((course && course.completedIds) || []);
    if (justCompletedId) done.add(String(justCompletedId));
    const completed = lessons.filter((l) => done.has(l.id)).length;
    const total = lessons.length;
    return { completed, total, pct: total ? Math.round((completed / total) * 100) : 0 };
  }

  // Rotating encouragement under the progress ring. Add Shona lines here any time.
  const AFFIRMATIONS = [
    'One step closer to speaking Shona with confidence.',
    'Every day stacks. You\'re closer than yesterday.',
    'Little by little, Shona is becoming yours.',
    'Ten minutes a day beats two hours on a Sunday.',
    'Your future self will thank you for today.',
    'Showing up is the whole secret. You showed up.',
  ];
  function pickAffirmation(seed) {
    const i = Number.isInteger(seed) ? seed : Math.floor(Math.random() * AFFIRMATIONS.length);
    return AFFIRMATIONS[((i % AFFIRMATIONS.length) + AFFIRMATIONS.length) % AFFIRMATIONS.length];
  }

  // Plain-editor formatting: a paragraph starting "🎯 Basa ranhasi" turns itself and everything
  // after it into the mission card; paragraphs starting with 💡 get the tip style. Classes only —
  // nodes are never moved, so FluentCommunity's editor/Vue keep full control of the content.
  function styleLessonContent(lessonBody) {
    const kids = Array.from(lessonBody.children).filter((el) =>
      el.id !== 'sv-phrasebank' && el.id !== 'sv-lesson-mission' && el.id !== 'shonaverse-lesson-actions');
    const headIdx = kids.findIndex((el) => /^\s*🎯\s*basa\s*ranhasi/i.test(el.textContent || ''));
    kids.forEach((el, i) => {
      const inMission = headIdx !== -1 && i >= headIdx && el.tagName !== 'HR';
      el.classList.toggle('sv-ml', inMission);
      el.classList.toggle('sv-ml-head', inMission && i === headIdx);
      el.classList.toggle('sv-ml-last', inMission && (i === kids.length - 1 || (kids[i + 1] && kids[i + 1].tagName === 'HR')));
      el.classList.toggle('sv-tip-line', !inMission && /^\s*💡/.test(el.textContent || ''));
    });
  }

  // Stacked-cards icon for mazwi links (explicit closing tags — see check-self-closing-svg).
  const SV_ICON_MAZWI = '<svg class="sv-ic" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="7" width="13" height="14" rx="2.5" stroke="currentColor" stroke-width="1.8"></rect><path d="M8 3.5h10.5A2.5 2.5 0 0 1 21 6v11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg>';

  // mazwi deck link for a Zuva, carrying this lesson page's address so mazwi's
  // '← back to zuva N' returns to the exact lesson (mazwi only accepts speakshona.com).
  function mazwiDeckUrl(slug) {
    const here = String(window.location.href || '').split('#')[0];
    return 'https://mazwi.app/deck/' + encodeURIComponent(slug) + (here ? '?back=' + encodeURIComponent(here) : '');
  }

  // Zuva numbers of lessons this member has completed (course data + the lessons manifest).
  function completedZuvas(course, manifest) {
    if (!course || !Array.isArray(course.lessons)) return [];
    const done = new Set((course.completedIds || []).map(String));
    const zs = course.lessons.filter((l) => done.has(String(l.id)))
      .map((l) => findLessonEntry(manifest || [], { href: l.url, title: l.title }))
      .filter((e) => e && e.zuva > 0)
      .map((e) => e.zuva);
    return [...new Set(zs)].sort((a, b) => a - b);
  }

  // Adds &done=<completed Zuvas> to a mazwi deck link so mazwi shows those lessons' words
  // as already met (gold). Leaves the link alone when there's nothing to add.
  function withDoneZuvas(href, zuvas) {
    if (!zuvas || !zuvas.length || !String(href).startsWith('https://mazwi.app/deck/')) return href;
    const hashAt = href.indexOf('#');
    const hash = hashAt === -1 ? '' : href.slice(hashAt);
    const clean = (hashAt === -1 ? href : href.slice(0, hashAt)).replace(/[?&]done=[^&#]*/, '');
    return clean + (clean.includes('?') ? '&' : '?') + 'done=' + zuvas.join(',') + hash;
  }

  // Member sign-in for mazwi (mazwi LAUNCH.md C1): a WordPress snippet prints a signed
  // token for the logged-in member as window.MAZWI_MEMBER_TOKEN. It rides after '#', so it
  // never reaches a server or a referrer, and mazwi wipes it from the address on arrival.
  function withMemberToken(href, token) {
    if (!String(href).startsWith('https://mazwi.app/deck/')) return href;
    const base = String(href).split('#')[0];
    return token && /^[A-Za-z0-9_\-.]+$/.test(token) ? base + '#m=' + token : base;
  }

  // The link as it should leave this page: completed Zuvas + this member's sign-in token.
  function finalMazwiHref(href) {
    const withDone = _courseData ? withDoneZuvas(href, completedZuvas(_courseData, _lessonsManifest)) : href;
    return withMemberToken(withDone, window.MAZWI_MEMBER_TOKEN);
  }

  // Course data arrives after the links render, so the done list is added at click time.
  let _courseData = null;
  document.addEventListener('click', (ev) => {
    const a = ev.target && ev.target.closest && ev.target.closest('a[href^="https://mazwi.app/deck/"]');
    if (a) a.href = finalMazwiHref(a.href);
  }, true);

  // iPad: the page's own scripts can turn the first tap on a link into a "hover", so mazwi
  // needed two taps. A clean tap (no scroll) on a mazwi link opens it straight away.
  let _mazwiTouch = null;
  document.addEventListener('touchstart', (ev) => {
    const a = ev.target && ev.target.closest && ev.target.closest('a[href^="https://mazwi.app/deck/"]');
    const t = ev.touches && ev.touches[0];
    _mazwiTouch = a && t && ev.touches.length === 1 ? { a, x: t.clientX, y: t.clientY } : null;
  }, { capture: true, passive: true });
  document.addEventListener('touchend', (ev) => {
    const start = _mazwiTouch;
    _mazwiTouch = null;
    const t = ev.changedTouches && ev.changedTouches[0];
    if (!start || !t || Math.abs(t.clientX - start.x) > 10 || Math.abs(t.clientY - start.y) > 10) return;
    ev.preventDefault();
    window.open(finalMazwiHref(start.a.href), '_blank', 'noopener');
  }, { capture: true, passive: false });

  const MAZWI_ICON_URL = 'https://mazwi.app/icons/icon-192.png';
  function mazwiCardHtml(slug) {
    return `<a class="sv-mazwi-card" href="${escHtml(mazwiDeckUrl(slug))}" target="_blank" rel="noopener">`
      + `<img class="sv-mazwi-card-icon" src="${MAZWI_ICON_URL}" alt="" width="40" height="40">`
      + '<span class="sv-mazwi-card-text"><strong>Practise these words in mazwi</strong>'
      + '<span>Flashcards that help the words stick</span></span>'
      + '<span class="sv-mazwi-card-arrow" aria-hidden="true">→</span></a>';
  }

  // Shona section names get their English meaning in Week 1, while learners are new to them.
  // (Week 1 only) small English eyebrow above the Shona section title.
  function eyebrow(entry, english) {
    return entry && entry.week <= 1 ? `<div class="sv-eyebrow">${english}</div>` : '';
  }

  // Basa ranhasi card from lessons.json (Table A). '' when the lesson has no mission text.
  function renderMissionHtml(entry) {
    if (!entry || !entry.mission) return '';
    const bonus = entry.bonus ? `<p class="sv-lm-bonus"><em>Bonus:</em> ${escHtml(entry.bonus)}</p>` : '';
    return `${eyebrow(entry, "today's mission")}<div class="sv-mission-title">🎯 Basa ranhasi</div><p>${escHtml(entry.mission)}</p>${bonus}`;
  }

  // Phrase bank + mazwi button for one lesson, built from mazwi's lessons.json so the page and
  // the app can never disagree. Returns '' when the lesson has nothing to show (e.g. onboarding).
  function renderPhraseBankHtml(entry) {
    if (!entry) return '';
    const slug = entry.slug || 'zuva-' + String(entry.zuva).padStart(2, '0');
    // Tip text may use **bold** (escaped first, so only that one bit of markup is allowed).
    const rich = (t) => escHtml(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const items = (entry.new || []).map((w) =>
      `<li><strong class="sv-pb-shona">${escHtml(w.shona)}</strong> <span class="sv-pb-eng">${escHtml(w.english)}</span></li>`).join('');
    const newList = items ? `${eyebrow(entry, "today's words")}<div class="sv-pb-title">Mazwi anhasi</div><ul class="sv-pb-list">${items}</ul>` : '';
    const tip = entry.tip
      ? `<div class="sv-pb-section sv-pb-pattern"><div class="sv-pb-label">💡 ${entry.type === 'sound' ? 'Sound pattern' : 'Grammar pattern'}</div><div class="sv-pb-tip">${rich(entry.tip)}</div></div>`
      : '';
    const previous = (entry.recycled || []).length
      ? `<div class="sv-pb-section"><div class="sv-pb-label">Words from previous lessons</div><div class="sv-pb-recycled">${entry.recycled.map(escHtml).join(' · ')}</div></div>`
      : '';
    if (!newList && !tip && !previous) return '';
    const btn = items ? mazwiCardHtml(slug) : '';
    return `${newList}${tip}${previous}${btn}`;
  }

  // Inserts the phrase bank right under the lesson video (or at the top of the lesson content
  // when there's no video). Idempotent: keyed on the Zuva number, so re-mounts don't re-render.
  // "Zuva 2 — Hesi, Mhoro, Mhoroi" → "Hesi, Mhoro, Mhoroi" (drops the Zuva/Day prefix and any
  // leading emoji such as 🔊, since the eyebrow above the title already says those things).
  function cleanLessonTitle(title) {
    return String(title || '')
      .replace(/^\s*(?:zuva|day)\s*\d+\s*[—–:·-]*\s*/i, '')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .trim();
  }

  function lessonEyebrow(entry) {
    if (!entry) return '';
    if (entry.type === 'onboarding' || entry.zuva === 0) return 'Start here';
    const week = entry.week > 0 ? ` · Week ${entry.week}` : '';
    if (entry.type === 'special') return `Zuva ${entry.zuva}${week} · 🌟 Special Mission`;
    if (entry.type === 'sound') return `Zuva ${entry.zuva}${week} · 🔊 Sounds`;
    return `Zuva ${entry.zuva}${week}`;
  }

  // Replaces FluentCommunity's "Lesson 3 of 15" + raw title with an eyebrow, the clean lesson
  // name and the week's theme. Native elements are hidden with a class (never removed), and the
  // Edit Lesson link stays for admins.
  function mountLessonHeader() {
    const titleWrap = document.querySelector('.fcom_lesson_title');
    const h1 = titleWrap && titleWrap.querySelector('h1');
    if (!titleWrap || !h1) return;
    const entry = findLessonEntry(_lessonsManifest || [], { href: window.location.href, title: h1.textContent });
    let header = document.getElementById('sv-lesson-header');
    if (!entry) {
      if (header) header.remove();
      titleWrap.classList.remove('sv-has-header');
      return;
    }
    const key = entry.zuva + '|' + h1.textContent.trim();
    if (header && header.getAttribute('data-key') === key && titleWrap.contains(header)) return;
    if (header) header.remove();
    header = document.createElement('div');
    header.id = 'sv-lesson-header';
    header.className = 'sv-lesson-header';
    header.setAttribute('data-key', key);
    const theme = entry.chapter && entry.type !== 'onboarding' ? `<div class="sv-lh-theme">${escHtml(entry.chapter)}</div>` : '';
    header.innerHTML = `<div class="sv-eyebrow">${escHtml(lessonEyebrow(entry))}</div>`
      + `<h2 class="sv-lh-title">${escHtml(cleanLessonTitle(h1.textContent) || entry.title)}</h2>${theme}`;
    titleWrap.insertBefore(header, h1);
    titleWrap.classList.add('sv-has-header');
  }

  // Zuva 0 (onboarding) is one fixed page, so its text lives here rather than in Table A.
  // Edit copy here; the FluentCommunity lesson only needs the video.
  function renderOnboardingHtml() {
    return `
      <div class="sv-ob-title">Mauya! Welcome to Shonaverse</div>
      <p>The best way to learn Shona? Move to Zimbabwe and hear it every day. The next best thing? A short lesson from me, every day, wherever you are. That's what this is: 10–15 minutes a day, with words that keep coming back until they stick. Mistakes are welcome; they mean it's working.</p>
      <p class="sv-ob-muted">Want to practise live too? Join the Friday live classes (included with Shonaverse + Live Classes).</p>

      <div class="sv-pb-label sv-ob-section">How every Zuva works</div>
      <ol class="sv-ob-steps">
        <li><strong>Watch the lesson</strong> (5–7 mins). When Korikori pops up saying <em>Taurai!</em>, answer out loud!</li>
        <li><strong>Check Mazwi anhasi</strong> <em class="sv-gloss">(today's words)</em>. Today's words, a 💡 pattern, and words from previous lessons.</li>
        <li><strong>Write it in your notebook.</strong> Say each line out loud as you write. (No PDFs here, just you and a pen.)</li>
        <li><strong>Post your Basa ranhasi</strong> <em class="sv-gloss">(today's mission)</em>. Tap <strong>Submit Mission</strong> under the lesson and add a photo of your page (or a voice note). Cheer on a classmate while you're there!</li>
      </ol>

      <div class="sv-ob-info"><span>⚡</span><div><strong>Optional booster:</strong> tap <strong>Practise these words in mazwi</strong> under the words to send them to your flashcards. It works on your phone or laptop.</div></div>
      <div class="sv-ob-info"><span>🌟</span><div><strong>Every 7th Zuva is a Special Mission:</strong> a short speaking video putting the whole week together. Camera on you or on your notebook, your choice.</div></div>
      <div class="sv-ob-info"><span>🧭</span><div><strong>Already know some Shona?</strong> Start at Zuva 1 anyway. Move quickly through what you know, but do the missions; that's where the speaking clicks.</div></div>
    `;
  }
  function renderOnboardingMissionHtml() {
    return `
      <div class="sv-mission-title">🎯 Your first mission, before Zuva 1</div>
      <ol class="sv-ob-steps sv-ob-steps-mission">
        <li>Go to <strong>Intros</strong>.</li>
        <li>Say hello: who are you, and why are you learning Shona? (English is totally fine!)</li>
        <li>Tap <strong>Mark Lesson Complete</strong> below and jump into <strong>Zuva 1</strong>!</li>
      </ol>
    `;
  }

  function mountPhraseBank(lessonBody) {
    if (!_courseData) getCourse().then((c) => { if (c) _courseData = c; });
    const entry = findLessonEntry(_lessonsManifest || [], { href: window.location.href, title: getLessonTitle() });
    const isOnboarding = !!(entry && entry.type === 'onboarding');
    const html = isOnboarding ? renderOnboardingHtml() : renderPhraseBankHtml(entry);
    let block = document.getElementById('sv-phrasebank');
    if (!html) {
      if (block) block.remove();
      const m = document.getElementById('sv-lesson-mission');
      if (m) m.remove();
      return;
    }
    if (block && block.getAttribute('data-zuva') === String(entry.zuva) && lessonBody.contains(block)) { mountMissionCard(block, entry); return; }
    if (block) block.remove();
    block = document.createElement('div');
    block.id = 'sv-phrasebank';
    block.className = isOnboarding ? 'sv-phrasebank sv-onboarding' : 'sv-phrasebank';
    block.setAttribute('data-zuva', String(entry.zuva));
    block.innerHTML = html;
    let anchor = lessonBody.querySelector('iframe, video, .wp-block-embed, figure');
    while (anchor && anchor.parentElement !== lessonBody) anchor = anchor.parentElement;
    if (anchor) anchor.after(block);
    else lessonBody.insertBefore(block, lessonBody.firstChild);
    mountMissionCard(block, entry);
  }

  function mountMissionCard(afterEl, entry) {
    const html = entry && entry.type === 'onboarding' ? renderOnboardingMissionHtml() : renderMissionHtml(entry);
    let card = document.getElementById('sv-lesson-mission');
    if (!html) { if (card) card.remove(); return; }
    if (card && card.getAttribute('data-zuva') === String(entry.zuva) && card.previousElementSibling === afterEl) return;
    if (card) card.remove();
    card = document.createElement('div');
    card.id = 'sv-lesson-mission';
    card.className = 'sv-lesson-mission';
    card.setAttribute('data-zuva', String(entry.zuva));
    card.innerHTML = html;
    afterEl.after(card);
  }

  function normalizePath(u) {
    // FluentCommunity serves a lesson at both /lessons/day-1 and /lessons/day-1/view
    try { return new URL(u, 'https://speakshona.com').pathname.replace(/\/+$/, '').replace(/\/view$/i, '').toLowerCase(); }
    catch (e) { return ''; }
  }
  // The manifest entry whose fc_url is this page, or null.
  function findZuvaForUrl(lessons, href) {
    const here = normalizePath(href);
    if (!here) return null;
    return (lessons || []).find((l) => l.fc_url && normalizePath(l.fc_url) === here) || null;
  }

  // Bulletproof Lesson ID extraction (Strictly Numeric)
  function getLessonId() {
    if (window.fluentComAdmin?.current_lesson?.id) {
      return String(window.fluentComAdmin.current_lesson.id);
    }
    const box = document.querySelector('[id^="feed_comment_form_"]');
    if (box) return String(box.id.replace('feed_comment_form_', ''));

    const urlMatch = window.location.href.match(/\/lessons\/(\d+)/i) || window.location.search.match(/lesson_id=(\d+)/i);
    if (urlMatch && urlMatch[1]) return String(urlMatch[1]);

    return '75'; 
  }

  // Clean user info extraction
  function getUserInfo() {
    let name = '';
    let avatar = '';
    let isAdmin = false;

    // window.fluentComAdmin has no .current_user/.me - the real logged-in
    // user object lives at window.fluentComAdmin.auth (confirmed via live
    // console inspection). Admin status isn't a simple top-level flag either:
    // it shows up as super_admin/community_admin inside each space's own
    // permissions object.
    const u = window.fluentComAdmin?.auth || window.fcom_user;
    if (u) {
      name = u.display_name || u.name || u.first_name || '';
      avatar = u.avatar || u.avatar_url || '';
      const roles = u.roles || u.community_roles || [];
      const spacePermissions = Object.values(u.spaces || {}).map((s) => s.permissions || {});
      isAdmin = roles.includes('administrator')
        || u.is_admin === true
        || spacePermissions.some((p) => p.super_admin === true || p.community_admin === true);
    }

    if (!isAdmin) {
      isAdmin = document.body.classList.contains('admin-bar') || !!document.getElementById('wpadminbar');
    }

    name = name.replace(/[()[\]{}<>]/g, '').trim();

    return {
      name: name || 'Tsitsi C',
      avatar: avatar || '',
      isAdmin: isAdmin
    };
  }

  // Load and render mission cards strictly isolated to this lesson ID
  async function loadMissionsFeed(lessonId) {
    const list = document.getElementById('sv-submissions-feed-list');
    if (!list) return;

    list.innerHTML = '<div style="text-align:center; padding:20px; color:#A8A29E;">Loading submissions...</div>';

    const currentUser = getUserInfo();
    const uid = await ensureAuth();

    const { data: missions, error } = await supabase
      .from('lesson_missions')
      .select(`
        *,
        lesson_mission_replies (
          id,
          user_id,
          user_name,
          user_avatar,
          reply_text,
          created_at
        )
      `)
      .eq('lesson_id', lessonId)
      .order('created_at', { ascending: false });

    if (error) {
      list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--sv-red); font-size:0.85rem;">Error loading submissions: ${escHtml(error.message)}</div>`;
      return;
    }

    if (!missions || missions.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:30px 10px; color:#A8A29E; font-size:0.9rem;">No submissions for this lesson yet. Be the first! ✍️</div>';
      return;
    }

    list.innerHTML = missions.map(m => {
      const replies = m.lesson_mission_replies || [];
      const cleanAuthor = (m.user_name || 'Learner').replace(/[()[\]{}<>]/g, '').trim();
      const initial = cleanAuthor ? cleanAuthor.charAt(0).toUpperCase() : 'S';
      
      const canDelete = currentUser.isAdmin || (!!uid && m.user_id === uid);

      return `
        <div class="sv-mission-card" style="background:#ffffff; border:1px solid var(--sv-border); border-radius:14px; padding:14px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
          <!-- Card Header -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:10px;">
              ${safeUrl(m.user_avatar) ? `<img src="${safeUrl(m.user_avatar)}" style="width:34px; height:34px; border-radius:50%; object-fit:cover;">` : `<div style="width:34px; height:34px; border-radius:50%; background:var(--sv-cream); color:var(--sv-orange); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">${initial}</div>`}
              <div>
                <div style="font-weight:700; font-size:0.9rem; color:#1C1917;">${escHtml(cleanAuthor)}</div>
                <div style="font-size:0.75rem; color:#A8A29E;">${new Date(m.created_at).toLocaleDateString()}</div>
              </div>
            </div>
            
            ${canDelete ? `
              <button type="button" class="sv-delete-mission-btn" data-mission-id="${escHtml(m.id)}" title="Delete Submission" style="background:rgba(235,85,85,0.12); border:none; color:var(--sv-red); border-radius:6px; padding:4px 8px; font-size:0.78rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
                🗑️ Delete
              </button>
            ` : ''}
          </div>

          <!-- Memo -->
          ${m.memo ? `<p style="margin:0 0 10px 0; font-size:0.88rem; color:#44403C; line-height:1.4;">${escHtml(m.memo)}</p>` : ''}

          <!-- Media Display -->
          ${safeUrl(m.media_url) ? (m.media_type === 'video'
            ? `<video src="${safeUrl(m.media_url)}" controls playsinline style="width:100%; border-radius:10px; max-height:360px; background:#000; margin-bottom:10px;"></video>`
            : `<a href="${safeUrl(m.media_url)}" target="_blank" rel="noopener"><img src="${safeUrl(m.media_url)}" style="width:100%; border-radius:10px; object-fit:cover; max-height:420px; cursor:zoom-in; margin-bottom:10px;"></a>`)
            : ''
          }

          <!-- Reply Bar -->
          <div style="display:flex; align-items:center; gap:12px; margin-top:8px; padding-top:8px; border-top:1px solid #F5F5F4;">
            <button type="button" class="sv-toggle-reply-btn" data-mission-id="${escHtml(m.id)}" style="background:none; border:none; color:#78716C; font-size:0.82rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:5px; padding:0;">
              💬 Reply ${replies.length > 0 ? `(${replies.length})` : ''}
            </button>
          </div>

          <!-- Replies Section -->
          <div id="sv-replies-${escHtml(m.id)}" style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--sv-border); display:${replies.length > 0 ? 'block' : 'none'};">
            <div class="sv-replies-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:10px;">
              ${replies.map(r => {
                const cleanReplyAuthor = (r.user_name || 'Learner').replace(/[()[\]{}<>]/g, '').trim();
                const canDeleteReply = currentUser.isAdmin || (!!uid && r.user_id === uid);
                return `
                  <div style="background:#F8FAFC; border-radius:8px; padding:8px 10px; font-size:0.83rem; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <span style="font-weight:700; color:#1C1917;">${escHtml(cleanReplyAuthor)}:</span> 
                      <span style="color:#44403C;">${escHtml(r.reply_text)}</span>
                    </div>
                    ${canDeleteReply ? `
                      <button type="button" class="sv-delete-reply-btn" data-reply-id="${escHtml(r.id)}" title="Delete Reply" style="background:none; border:none; color:var(--sv-red); opacity:0.7; cursor:pointer; font-size:0.85rem; padding:2px 6px; line-height:1;">
                        ✕
                      </button>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>

            <!-- Inline Reply Composer -->
            <div style="display:flex; gap:6px;">
              <input type="text" class="sv-reply-input" placeholder="Write a reply..." style="flex:1; border:1px solid #E2E8F0; border-radius:8px; padding:6px 10px; font-size:0.82rem; outline:none; background:#ffffff;">
              <button type="button" class="sv-send-reply-btn" data-mission-id="${escHtml(m.id)}" style="background:var(--sv-amber); color:#ffffff; border:none; border-radius:8px; padding:6px 12px; font-size:0.82rem; font-weight:600; cursor:pointer;">Send</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Toggle Reply Composer
    document.querySelectorAll('.sv-toggle-reply-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-mission-id');
        const box = document.getElementById(`sv-replies-${id}`);
        if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
      };
    });

    // Send Reply Event
    document.querySelectorAll('.sv-send-reply-btn').forEach(btn => {
      btn.onclick = async () => {
        const missionId = btn.getAttribute('data-mission-id');
        const parent = btn.closest(`#sv-replies-${missionId}`);
        const input = parent.querySelector('.sv-reply-input');
        const text = input.value.trim();
        if (!text) return;

        btn.disabled = true;
        btn.textContent = '...';

        const user = getUserInfo();
        await ensureAuth();
        const { error } = await supabase.from('lesson_mission_replies').insert([{
          mission_id: missionId,
          user_name: user.name,
          user_avatar: user.avatar,
          reply_text: text
        }]);

        if (!error) {
          input.value = '';
          loadMissionsFeed(getLessonId());
        } else {
          alert('Could not post reply: ' + error.message);
          btn.disabled = false;
          btn.textContent = 'Send';
        }
      };
    });

    // Delete Mission Event
    document.querySelectorAll('.sv-delete-mission-btn').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Are you sure you want to delete this mission submission?')) return;
        const missionId = btn.getAttribute('data-mission-id');
        btn.disabled = true;

        await ensureAuth();
        const { error } = await supabase
          .from('lesson_missions')
          .delete()
          .eq('id', missionId);

        if (!error) {
          loadMissionsFeed(getLessonId());
        } else {
          alert('Could not delete: ' + error.message);
          btn.disabled = false;
        }
      };
    });

    // Delete Reply Event
    document.querySelectorAll('.sv-delete-reply-btn').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this reply?')) return;
        const replyId = btn.getAttribute('data-reply-id');
        btn.disabled = true;

        await ensureAuth();
        const { error } = await supabase
          .from('lesson_mission_replies')
          .delete()
          .eq('id', replyId);

        if (!error) {
          loadMissionsFeed(getLessonId());
        } else {
          alert('Could not delete reply: ' + error.message);
          btn.disabled = false;
        }
      };
    });
  }

  // Extract "Lesson X of Y" -> X, from FluentCommunity's own lesson header text
  function getLessonNumber() {
    const el = document.querySelector('.fcom_lesson_number');
    const match = el && el.textContent.match(/Lesson\s+(\d+)\s+of\s+(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  // Read course completion % directly from FluentCommunity's own progress bar
  function getCourseProgress() {
    const el = document.querySelector('.fcom_course_progress_footer .el-progress');
    const val = el && el.getAttribute('aria-valuenow');
    return val !== null ? parseInt(val, 10) : null;
  }

  // Total lessons in the course, counted from the Lessons sidebar drawer
  // (present in the DOM regardless of whether the drawer is open). Each
  // .fcom_section_item is one lesson; .fcom_section_primary_item is a
  // section header, not a lesson, so it's excluded automatically since it
  // doesn't carry that class.
  function getTotalLessonCount() {
    const count = document.querySelectorAll('.fcom_section_items .fcom_section_item').length;
    return count > 0 ? count : null;
  }

  // Which of the 7 days in the Monday-Sunday week containing referenceDate
  // had at least one completion. Returns [Mon, Tue, Wed, Thu, Fri, Sat, Sun].
  function getWeekCompletionMap(completedAtList, referenceDate = new Date()) {
    const daySet = new Set(completedAtList.map((d) => new Date(d).toISOString().slice(0, 10)));
    const ref = new Date(referenceDate);
    const daysSinceMonday = (ref.getDay() + 6) % 7;
    const monday = new Date(ref);
    monday.setDate(monday.getDate() - daysSinceMonday);

    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      week.push(daySet.has(d.toISOString().slice(0, 10)));
    }
    return week;
  }

  // Full calendar grid for the month containing referenceDate: leading nulls
  // for padding before the 1st (aligned to Sunday-start, matching the S M T
  // W T F S header the Home dashboard renders), then one entry per real day
  // with its done/isToday status.
  function getMonthCompletionMap(completedAtList, referenceDate = new Date()) {
    const daySet = new Set(completedAtList.map((d) => new Date(d).toISOString().slice(0, 10)));

    // Everything below derives from the same UTC calendar day, rather than
    // mixing local-time getFullYear()/getMonth() with UTC-based date-key
    // comparisons - that mix breaks right at UTC-midnight referenceDates,
    // where the local calendar day and the UTC calendar day disagree.
    const todayKey = new Date(referenceDate).toISOString().slice(0, 10);
    const [year, month] = todayKey.split('-').map(Number);
    const monthIndex = month - 1; // 0-indexed, to match Date's own convention

    const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const startWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();

    const days = [];
    for (let i = 0; i < startWeekday; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = new Date(Date.UTC(year, monthIndex, d)).toISOString().slice(0, 10);
      days.push({ day: d, done: daySet.has(key), isToday: key === todayKey });
    }

    return { year, month: monthIndex, days };
  }

  // Count consecutive calendar days, ending at referenceDate, with at least
  // one completion. referenceDate defaults to now in production; tests pass
  // a fixed date so results are deterministic.
  function calculateStreak(completedAtList, referenceDate = new Date()) {
    const daySet = new Set(completedAtList.map((d) => new Date(d).toISOString().slice(0, 10)));
    let streak = 0;
    const cursor = new Date(referenceDate);
    while (daySet.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  async function celebrateLessonCompletion(lessonId) {
    console.log('[SV celebrate] celebrateLessonCompletion() running for lesson', lessonId);
    const user = getUserInfo();
    console.log('[SV celebrate] user:', user);
    const uid = await ensureAuth();

    const { error: upsertErr } = await supabase
      .from('lesson_completions')
      .upsert([{ user_id: uid, user_name: user.name, lesson_id: lessonId }], { onConflict: 'user_id,lesson_id' });

    if (upsertErr) {
      console.error('[SV celebrate] upsert into lesson_completions failed:', upsertErr.message, upsertErr);
      return;
    }
    console.log('[SV celebrate] upsert into lesson_completions succeeded');

    const { data: completions, error: selectErr } = await supabase
      .from('lesson_completions')
      .select('completed_at')
      .eq('user_id', uid);

    if (selectErr) {
      console.error('[SV celebrate] could not read back completions for streak calc:', selectErr.message, selectErr);
    }

    const completedDates = (completions || []).map((c) => c.completed_at);
    const streak = calculateStreak(completedDates);
    const weekMap = getWeekCompletionMap(completedDates);
    const lessonNumber = getLessonNumber();
    const course = await getCourse();
    const prog = course ? lessonProgress(course, lessonId) : null;
    const progress = prog ? prog.pct : getCourseProgress();
    const totalLessons = prog ? prog.total : getTotalLessonCount();
    const completedCount = prog ? prog.completed : null;
    // Manifest is prefetched on mount; never block the celebration on the network.
    const zuva = findLessonEntry(_lessonsManifest || [], { href: window.location.href, title: getLessonTitle() });
    console.log('[SV celebrate] streak:', streak, 'progress:', progress, 'lessonNumber:', lessonNumber, 'totalLessons:', totalLessons);

    const { data: existingMissions, error: missionsErr } = await supabase
      .from('lesson_missions')
      .select('id')
      .eq('lesson_id', lessonId)
      .eq('user_id', uid);

    if (missionsErr) {
      console.error('[SV celebrate] could not check for existing mission:', missionsErr.message, missionsErr);
    }

    const hasSubmittedMission = existingMissions && existingMissions.length > 0;
    console.log('[SV celebrate] hasSubmittedMission:', hasSubmittedMission, '- showing modal now');

    showCelebrationModal({ lessonNumber, streak, weekMap, progress, totalLessons, completedCount, hasSubmittedMission, zuva });
  }

  function showCelebrationModal({ lessonNumber, streak, weekMap, progress, totalLessons, completedCount = null, hasSubmittedMission, zuva = null }) {
    let wrap = document.getElementById('sv-celebration-modal-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'sv-celebration-modal-wrap';
      wrap.className = 'sv-modal-overlay';
      document.body.appendChild(wrap);
      wrap.onclick = (e) => { if (e.target === wrap) wrap.classList.remove('is-active'); };
    }

    const svIconCheckSmall = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
    const svIconCamera = `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="12" cy="13" r="3.5" stroke="currentColor" stroke-width="1.6"></circle></svg>`;

    // Zuva numbering comes from mazwi's lessons.json when this page is in it; FluentCommunity's
    // own 'Lesson X of Y' is only a fallback (it counts onboarding as lesson 1).
    const dayLabel = zuva
      ? (zuva.zuva > 0 ? `Zuva ${zuva.zuva} complete!` : 'You\'re all set up!')
      : (lessonNumber ? `Lesson ${lessonNumber} complete!` : 'Lesson complete!');

    const dayLetters = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const calendarHtml = dayLetters.map((letter, i) => {
      const done = weekMap && weekMap[i];
      const circleBg = done ? 'var(--sv-orange-light)' : 'var(--sv-track-light)';
      const circleColor = done ? 'var(--sv-ink)' : 'var(--sv-text-muted)';
      return `
        <div style="display:flex; flex-direction:column; align-items:center; gap:6px;">
          <div style="width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; background:${circleBg}; color:${circleColor};">
            ${done ? svIconCheckSmall : ''}
          </div>
          <div style="font-size:0.7rem; color:var(--sv-text-muted); font-weight:600;">${letter}</div>
        </div>
      `;
    }).join('');

    const progressForRing = progress !== null ? progress : 0;
    const ringRadius = 54;
    const ringCircumference = 2 * Math.PI * ringRadius;
    const ringDashOffset = ringCircumference * (1 - progressForRing / 100);
    const progressLabel = progress !== null ? `${progress}%` : '—';

    const lessonsCompleted = completedCount !== null ? completedCount
      : ((totalLessons !== null && progress !== null) ? Math.round((progress / 100) * totalLessons) : null);
    const lessonsCountLabel = (lessonsCompleted !== null && totalLessons !== null)
      ? `<p style="margin:0 0 2px; font-size:0.85rem; color:var(--sv-text-muted);">${lessonsCompleted} of ${totalLessons} lessons</p>`
      : '';

    const currentWeek = zuva ? (zuva.week > 0 ? zuva.week : null) : (lessonNumber ? Math.ceil(lessonNumber / 7) : null);
    const dayInWeek = zuva ? (zuva.zuva > 0 ? ((zuva.zuva - 1) % 7) + 1 : null) : (lessonNumber ? ((lessonNumber - 1) % 7) + 1 : null);
    const weekSegments = Array.from({ length: 7 }, (_, i) => {
      const filled = dayInWeek !== null && i < dayInWeek;
      return `<div style="flex:1; height:6px; border-radius:3px; background:${filled ? 'var(--sv-orange-light)' : 'var(--sv-track-light)'};"></div>`;
    }).join('');

    const nextBtn = document.querySelector('.fcom_lesson_header .fcom_lesson_nav button[aria-label="Next lesson"]');
    const hasNext = !!(nextBtn && nextBtn.getAttribute('aria-disabled') !== 'true');
    const nextZuva = zuva && (_lessonsManifest || []).find((l) => l.zuva === zuva.zuva + 1);
    const nextLabel = !hasNext ? 'Done for today' : (nextZuva ? `Next: Zuva ${nextZuva.zuva} →` : 'Next lesson →');

    wrap.innerHTML = `
      <div class="sv-modal-card sv-celebration-card">
        <button type="button" id="sv-celebration-close" style="position:absolute; top:16px; right:16px; background:none; border:none; font-size:1.5rem; line-height:1; color:#94A3B8; cursor:pointer;">&times;</button>

        <div style="text-align:center; margin-bottom:16px;">
          <div style="font-size:2.5rem; margin-bottom:8px;">🎉</div>
          <h2 style="margin:0; font-size:1.4rem; font-weight:800; color:var(--sv-ink);">${dayLabel}</h2>
        </div>

        <div style="display:flex; justify-content:center; gap:10px; margin-bottom:12px;">
          ${calendarHtml}
        </div>
        <p style="text-align:center; margin:0 0 20px; color:var(--sv-text-muted); font-size:0.9rem;">${streak} day${streak === 1 ? '' : 's'} in a row. Toonana mangwana!</p>

        <div style="height:1px; background:var(--sv-border); margin:0 0 20px;"></div>

        <div style="text-align:center; margin-bottom:20px;">
          <div style="position:relative; width:140px; height:140px; margin:0 auto 12px;">
            <svg width="140" height="140" viewBox="0 0 140 140" style="transform:rotate(-90deg);">
              <circle cx="70" cy="70" r="${ringRadius}" fill="none" stroke="var(--sv-track-light)" stroke-width="12"></circle>
              <circle cx="70" cy="70" r="${ringRadius}" fill="none" stroke="var(--sv-orange-light)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${ringCircumference}" stroke-dashoffset="${ringDashOffset}"></circle>
            </svg>
            <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
              <div style="font-size:1.7rem; font-weight:800; color:var(--sv-ink);">${progressLabel}</div>
            </div>
          </div>
          ${lessonsCountLabel}
          <p class="sv-affirmation" style="margin:0 0 16px; color:var(--sv-text-muted); font-size:0.85rem;">${escHtml(pickAffirmation())}</p>
          ${currentWeek !== null ? `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:0.8rem; font-weight:700; color:var(--sv-ink);">Week ${currentWeek}</span>
              <span style="font-size:0.8rem; color:var(--sv-text-muted);">${dayInWeek} of 7</span>
            </div>
            <div style="display:flex; gap:4px;">${weekSegments}</div>
          ` : ''}
        </div>

        ${!hasSubmittedMission ? `
          <div style="height:1px; background:var(--sv-border); margin:0 0 20px;"></div>
          <div style="text-align:left; margin-bottom:10px;">
            <div style="font-size:0.72rem; font-weight:700; color:var(--sv-orange); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:2px;">Basa ranhasi</div>
            <div style="font-size:1.05rem; font-weight:800; color:var(--sv-ink);">Not done yet. Do it before you go</div>
          </div>
          <button type="button" id="sv-celebration-submit-mission" style="width:100%; background:none; border:1.5px dashed var(--sv-border); border-radius:16px; padding:22px 16px; cursor:pointer; text-align:center; margin-bottom:16px;">
            <div style="width:44px; height:44px; border-radius:50%; background:var(--sv-cream); color:var(--sv-orange); display:flex; align-items:center; justify-content:center; margin:0 auto 10px;">${svIconCamera}</div>
            <div style="font-weight:700; color:var(--sv-ink); font-size:0.92rem; margin-bottom:2px;">Post your Basa ranhasi</div>
            <div style="color:var(--sv-text-muted); font-size:0.8rem; margin-bottom:8px;">A photo of your notebook or a voice note. It takes one minute, and it's where the speaking sticks.</div>
            <div style="color:var(--sv-orange); font-weight:700; font-size:0.86rem;">Do it now ›</div>
          </button>
        ` : ''}

        ${zuva && zuva.new && zuva.new.length ? `
          <a class="sv-celebration-mazwi" href="${escHtml(mazwiDeckUrl(zuva.slug || 'zuva-' + String(zuva.zuva).padStart(2, '0')))}" target="_blank" rel="noopener"><img class="sv-mazwi-mini-icon" src="${MAZWI_ICON_URL}" alt="" width="22" height="22"><span>Practise today's words in mazwi</span></a>
        ` : ''}

        <button type="button" id="sv-celebration-continue" style="width:100%; background:var(--sv-terracotta); color:#ffffff; border:none; padding:13px; border-radius:12px; font-weight:700; font-size:0.98rem; cursor:pointer;">
          ${escHtml(nextLabel)}
        </button>
      </div>
    `;

    wrap.classList.add('is-active');

    document.getElementById('sv-celebration-close')?.addEventListener('click', () => {
      wrap.classList.remove('is-active');
    });

    document.getElementById('sv-celebration-continue')?.addEventListener('click', () => {
      wrap.classList.remove('is-active');
      if (hasNext) nextBtn.click();
    });

    document.getElementById('sv-celebration-submit-mission')?.addEventListener('click', () => {
      wrap.classList.remove('is-active');
      document.getElementById('sv-mission-modal-wrap')?.classList.add('is-active');
    });
  }

  function mountUI() {
    const route = document.body.getAttribute('data-route');
    if (route === 'view_lesson') {
      mountLessonUI();
    } else if (route === 'all_feeds') {
      mountFeedDashboard();
    } else if (route === 'space_feeds') {
      mountSpaceTabs();
    }
  }

  // The community spaces as one row of tabs, so the sidebar only needs a single "Community" link.
  // Edit this list to add, remove or reorder tabs (slug = the /space/<slug>/ part of the address).
  const SPACE_TABS = [
    { slug: 'say-hello', label: 'Ndeipi! Intros' },
    { slug: 'general', label: 'Lounge' },
    { slug: 'rules', label: 'Rules' },
  ];

  function getSpaceSlug() {
    const m = /\/space\/([^/?#]+)/.exec(window.location.pathname || '');
    return m ? m[1] : '';
  }

  // Inserts the tab row above a space's title bar. Idempotent: re-running it
  // (the MutationObserver does, often) leaves an up-to-date bar alone, and puts it back if Vue
  // re-rendered the page around it.
  function mountSpaceTabs() {
    const slug = getSpaceSlug();
    if (!slug || !SPACE_TABS.some((t) => t.slug === slug)) return;
    const layout = document.querySelector('.fhr_content_layout');
    const header = layout && layout.querySelector('.fhr_content_layout_header');
    if (!layout || !header) return;

    let bar = document.getElementById('sv-space-tabs');
    if (!bar) {
      bar = document.createElement('nav');
      bar.id = 'sv-space-tabs';
      bar.setAttribute('aria-label', 'Community spaces');
    }
    if (bar.getAttribute('data-slug') !== slug) {
      const a = window.fluentComAdmin;
      const portal = String((a && a.portal_url) || 'https://speakshona.com/shonaverse').replace(/\/+$/, '');
      bar.setAttribute('data-slug', slug);
      bar.innerHTML = SPACE_TABS.map((t) =>
        `<a class="sv-space-tab${t.slug === slug ? ' sv-space-tab-active' : ''}" href="${safeUrl(portal + '/space/' + t.slug + '/home')}"${t.slug === slug ? ' aria-current="page"' : ''}>${escHtml(t.label)}</a>`
      ).join('');
    }
    if (bar.nextElementSibling !== header || bar.parentNode !== layout) layout.insertBefore(bar, header);
  }

  function mountLessonUI() {
    if (!_lessonsManifest) loadLessonsManifest().then((m) => { if (m && m.length) scheduleMountUI(); });
    const lessonBody = document.querySelector('.fcom_lesson_details .fcom_lesson_content');
    const commentsWrap = document.querySelector('.fcom_lesson_comments');
    const lessonId = getLessonId();

    if (commentsWrap) {
      let feedWrap = document.getElementById('sv-submissions-feed-wrap');
      
      if (!feedWrap || feedWrap.getAttribute('data-lesson-id') !== lessonId) {
        Array.from(commentsWrap.children).forEach(child => {
          if (child.id !== 'sv-submissions-feed-wrap') child.style.display = 'none';
        });

        if (!feedWrap) {
          feedWrap = document.createElement('div');
          feedWrap.id = 'sv-submissions-feed-wrap';
          commentsWrap.appendChild(feedWrap);
        }

        feedWrap.setAttribute('data-lesson-id', lessonId);
        feedWrap.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0; font-size:1.15rem; font-weight:700; color:#1C1917;">Class Submissions ✨</h3>
          </div>
          <div id="sv-submissions-feed-list">
            <div style="text-align:center; padding:20px; color:#A8A29E;">Loading submissions...</div>
          </div>
        `;
        loadMissionsFeed(lessonId);
      }
    }

    mountLessonHeader();
    if (lessonBody) {
      mountPhraseBank(lessonBody);
      styleLessonContent(lessonBody);
      let buttonStack = document.getElementById('shonaverse-lesson-actions');
      if (!buttonStack) {
        buttonStack = document.createElement('div');
        buttonStack.id = 'shonaverse-lesson-actions';
        buttonStack.className = 'sv-action-buttons-row';
        lessonBody.appendChild(buttonStack);
      }

      const nativeComplete = document.querySelector('.fcom_back_space .fcom_lesson_nav .el-button--info');
      const nativeNextBtn = document.querySelector('.fcom_lesson_header .fcom_lesson_nav button[aria-label="Next lesson"]');
      const nativeNext = (nativeNextBtn && nativeNextBtn.getAttribute('aria-disabled') !== 'true') ? nativeNextBtn : null;

      let isCompleted = false;
      if (nativeComplete && nativeComplete.textContent.trim().toLowerCase() === 'completed') {
          isCompleted = true;
      }

      const svIconCircle = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"></circle></svg>`;
      const svIconCheck = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
      const svIconArrow = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
      const svIconPencil = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
      const svIconPin = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="12" cy="9" r="2.5" stroke="currentColor" stroke-width="2"></circle></svg>`;

      // Tag the Lessons sidebar's actual outer wrapper (unknown class name) so CSS can turn it into a drawer
      const tocTitle = document.querySelector('.fcom_section_sidebar_title');
      const tocScrollbarRoot = tocTitle ? tocTitle.closest('.el-scrollbar') : null;
      const tocOuterWrapper = tocScrollbarRoot ? tocScrollbarRoot.parentElement : null;
      if (tocOuterWrapper && !tocOuterWrapper.classList.contains('sv-toc-drawer')) {
        tocOuterWrapper.classList.add('sv-toc-drawer');
      }

      // Backdrop for the drawer, click to close
      if (!document.getElementById('sv-toc-backdrop')) {
        const backdrop = document.createElement('div');
        backdrop.id = 'sv-toc-backdrop';
        backdrop.className = 'sv-toc-backdrop';
        backdrop.addEventListener('click', () => {
          document.body.classList.remove('sv-toc-open');
        });
        document.body.appendChild(backdrop);
      }

      // Toggle icon in the native top bar, just before Complete/Completed
      if (nativeComplete && !document.getElementById('sv-toc-toggle-btn')) {
        const tocBtn = document.createElement('button');
        tocBtn.type = 'button';
        tocBtn.id = 'sv-toc-toggle-btn';
        tocBtn.className = 'sv-icon-btn-topnav';
        tocBtn.setAttribute('aria-label', 'Toggle lessons list');
        tocBtn.innerHTML = svIconPin;
        tocBtn.addEventListener('click', () => {
          document.body.classList.toggle('sv-toc-open');
        });
        nativeComplete.parentElement.insertBefore(tocBtn, nativeComplete);
      }

      let rightBtnHtml = '';
      if (isCompleted && nativeNext) {
          rightBtnHtml = `<button type="button" class="sv-btn sv-btn-next" id="sv-trigger-next-btn">${svIconCheck} Complete ${svIconArrow}</button>`;
      } else if (isCompleted && !nativeNext) {
          rightBtnHtml = `<button type="button" class="sv-btn sv-btn-done" disabled>${svIconCheck} Lesson Completed</button>`;
      } else if (!isCompleted && nativeComplete) {
          rightBtnHtml = `<button type="button" class="sv-btn sv-btn-complete" id="sv-trigger-complete-btn">${svIconCircle} Mark Lesson Complete</button>`;
      }

      const desiredHtml = `
        <button type="button" class="sv-btn sv-btn-submit" id="sv-open-modal-btn">
          ${svIconPencil} Submit Mission
        </button>
        ${rightBtnHtml}
      `;

      if (buttonStack.innerHTML !== desiredHtml) {
        buttonStack.innerHTML = desiredHtml;

        document.getElementById('sv-open-modal-btn')?.addEventListener('click', () => {
          document.getElementById('sv-mission-modal-wrap').classList.add('is-active');
        });

        document.getElementById('sv-trigger-complete-btn')?.addEventListener('click', () => {
          if (nativeComplete) nativeComplete.click();
          // Always fires (no waiting for/polling FluentCommunity's own state
          // to confirm anything - we're recording our own completion record
          // independently, so there's nothing to conditionally wait for; that
          // approach broke when lessons get manually marked done/undone).
          // A short FIXED delay (not a condition to wait on, so it can't get
          // stuck) gives FluentCommunity's own course-progress bar time to
          // recalculate after its native completion AJAX call, since reading
          // it at the instant of the click was grabbing the stale value.
          const targetLessonId = getLessonId();
          setTimeout(() => celebrateLessonCompletion(targetLessonId), 1500);
        });

        document.getElementById('sv-trigger-next-btn')?.addEventListener('click', () => {
          if (nativeNext) nativeNext.click();
        });
      }
    }

    if (!document.getElementById('sv-mission-modal-wrap')) {
      const modalWrap = document.createElement('div');
      modalWrap.id = 'sv-mission-modal-wrap';
      modalWrap.className = 'sv-modal-overlay';
      modalWrap.innerHTML = `
        <div class="sv-modal-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <h3 style="margin:0; font-size:1.15rem; font-weight:700; color:#1C1917; display:flex; align-items:center; gap:8px;">
              <span>✍️</span> Submit Mission
            </h3>
            <button type="button" id="sv-close-modal-x" style="background:none; border:none; font-size:1.5rem; line-height:1; color:#94A3B8; cursor:pointer;">&times;</button>
          </div>

          <p style="font-size:0.9rem; font-weight:600; color:#334155; margin:0 0 10px 0;">Photo or video of your practice</p>

          <div style="border:1.5px dashed #CBD5E1; border-radius:14px; background:#F8FAFC; padding:18px 14px; text-align:center; margin-bottom:16px;">
            <input type="file" id="sv-modal-file-input" accept="image/*,video/*,audio/*" style="display:none;" />
            <button type="button" onclick="document.getElementById('sv-modal-file-input').click()" style="background:#ffffff; border:1px solid #E2E8F0; color:#334155; padding:10px 20px; border-radius:10px; font-weight:600; font-size:0.9rem; cursor:pointer;">
              📁 Choose Photo / Video / Audio
            </button>
            <p id="sv-file-status" style="margin:8px 0 0; font-size:0.82rem; font-weight:600; color:#D97706; word-break:break-all;"></p>
          </div>

          <p style="font-size:0.9rem; font-weight:600; color:#334155; margin:0 0 8px 0;">Memo for today's mission</p>
          <textarea id="sv-modal-memo" placeholder="Share your thoughts..." rows="3" style="width:100%; border:1.5px solid #E2E8F0; border-radius:12px; padding:12px; font-family:inherit; font-size:0.92rem; outline:none; box-sizing:border-box; margin-bottom:18px; background:#F8FAFC;"></textarea>

          <button type="button" id="sv-modal-submit-btn" style="width:100%; background:var(--sv-terracotta); color:#ffffff; border:none; padding:13px; border-radius:12px; font-weight:700; font-size:0.98rem; cursor:pointer;">
            Submit Mission ✨
          </button>
        </div>
      `;
      document.body.appendChild(modalWrap);

      let stagedFile = null;
      document.getElementById('sv-modal-file-input').addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) {
          stagedFile = e.target.files[0];
          document.getElementById('sv-file-status').textContent = `✓ Ready: ${stagedFile.name}`;
        }
      });

      const closeModal = () => {
        modalWrap.classList.remove('is-active');
        stagedFile = null;
        document.getElementById('sv-modal-memo').value = '';
        document.getElementById('sv-file-status').textContent = '';
        document.getElementById('sv-modal-submit-btn').textContent = 'Submit Mission ✨';
        document.getElementById('sv-modal-submit-btn').disabled = false;
      };

      document.getElementById('sv-close-modal-x').onclick = closeModal;
      modalWrap.onclick = (e) => { if (e.target === modalWrap) closeModal(); };

      document.getElementById('sv-modal-submit-btn').addEventListener('click', async () => {
        const btn = document.getElementById('sv-modal-submit-btn');
        const memo = document.getElementById('sv-modal-memo').value.trim();

        if (!stagedFile && !memo) {
          alert('Please upload a photo/video or add a comment.');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Uploading...';

        try {
          await ensureAuth();
          let mediaUrl = '';
          const isVideo = stagedFile?.type.startsWith('video/');

          if (stagedFile) {
            const fileExt = stagedFile.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            const { data: uploadData, error: uploadErr } = await supabase.storage
              .from('missions')
              .upload(fileName, stagedFile);

            if (uploadErr) throw uploadErr;

            const { data: urlData } = supabase.storage
              .from('missions')
              .getPublicUrl(fileName);

            mediaUrl = urlData.publicUrl;
          }

          const user = getUserInfo();
          const targetLessonId = getLessonId();

          const { error: insertErr } = await supabase
            .from('lesson_missions')
            .insert([{
              lesson_id: targetLessonId,
              user_name: user.name,
              user_avatar: user.avatar,
              memo: memo,
              media_url: mediaUrl,
              media_type: isVideo ? 'video' : 'image'
            }]);

          if (insertErr) throw insertErr;

          closeModal();
          loadMissionsFeed(targetLessonId);
        } catch (err) {
          console.error(err);
          alert('Upload failed: ' + (err.message || 'Please check your connection.'));
          btn.disabled = false;
          btn.textContent = 'Submit Mission ✨';
        }
      });
    }
  }

  // Manual lessons manifest for the Feed dashboard banner - FluentCommunity's
  // lesson list only exists in the DOM on lesson-related pages, not on the
  // Feed page, and there's no confirmed lessons API to pull this from
  // instead. Keep this in sync by hand for now; revisit with a live API
  // investigation if the course grows large enough that this becomes a
  // chore. Starts empty since "Daily Shona Lessons" is still a draft with 0
  // published lessons as of this writing.
  const FEED_DASHBOARD_LESSONS = [];
  const FEED_DASHBOARD_COURSE_URL = 'https://speakshona.com/shonaverse/course/shona-lessons/lessons';

  const COURSE_SLUG = 'shona-lessons';

  // Flattens FluentCommunity's courses/{slug}/by-slug response into lessons in course order.
  function flattenCourseLessons(resp, portalUrl) {
    const course = (resp && resp.course) || {};
    const portal = String(portalUrl || 'https://speakshona.com/shonaverse').replace(/\/+$/, '');
    return ((resp && resp.sections) || []).flatMap((sec) => (sec.lessons || []).map((l) => ({
      id: String(l.id),
      title: l.title || '',
      slug: l.slug || '',
      section: sec.title || '',
      status: l.status || '',
      url: `${portal}/course/${course.slug || COURSE_SLUG}/lessons/${l.slug}`,
    })));
  }

  // Enrollment, lesson order and the member's own completed lessons, straight from
  // FluentCommunity (same data its "Course progress" box uses). Null when unavailable.
  let _coursePromise = null;
  function getCourse() {
    if (_coursePromise) return _coursePromise;
    _coursePromise = (async () => {
      const a = window.fluentComAdmin;
      const rest = a && a.rest;
      if (!rest || !rest.url || typeof fetch !== 'function') return null;
      try {
        const res = await fetch(`${rest.url}/courses/${COURSE_SLUG}/by-slug`, {
          headers: rest.nonce ? { 'X-WP-Nonce': rest.nonce } : {},
          credentials: 'include',
        });
        if (!res.ok) return null;
        const json = await res.json();
        const track = json.track || {};
        return {
          isEnrolled: !!(track.isEnrolled !== undefined ? track.isEnrolled : json.course && json.course.isEnrolled),
          completedIds: (track.completed_lessons || []).map(String),
          lessons: flattenCourseLessons(json, a.portal_url),
          url: `${String(a.portal_url || 'https://speakshona.com/shonaverse').replace(/\/+$/, '')}/course/${COURSE_SLUG}`,
        };
      } catch (e) {
        return null;
      }
    })();
    return _coursePromise;
  }

  // Distinct lessons completed, deduped by id so a stray duplicate
  // lesson_completions row can't inflate the count.
  function getTotalCompletedCount(completedLessonIds) {
    return new Set(completedLessonIds.map(String)).size;
  }

  function localDay(d = new Date()) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // A lesson is open to learners once FluentCommunity has published it (when it says so) and its
  // publish date in mazwi's lesson list has arrived. Onboarding has no date and is always open.
  function isLessonPublished(lesson, manifest) {
    if (lesson.status && lesson.status !== 'published') return false;
    const e = findLessonEntry(manifest || [], { href: lesson.url, title: lesson.title });
    if (e && e.type !== 'onboarding' && e.publish_date && e.publish_date > localDay()) return false;
    return true;
  }

  // "Your next lesson arrives tomorrow." / on a date / "New lessons are coming soon."
  function nextArrivalText(manifest) {
    const today = localDay();
    const dates = (manifest || []).filter((l) => l.type !== 'onboarding' && l.publish_date && l.publish_date > today).map((l) => l.publish_date).sort();
    if (!dates.length) return 'New lessons are coming soon.';
    const t = new Date(); t.setDate(t.getDate() + 1);
    if (dates[0] === localDay(t)) return 'Your next lesson arrives tomorrow.';
    const when = new Date(dates[0] + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    return 'Your next lesson arrives ' + when + '.';
  }

  // First manifest entry the learner hasn't completed yet, in manifest order.
  // Returns null once every listed lesson is done.
  function getCurrentLesson(lessons, completedLessonIds) {
    const completedSet = new Set(completedLessonIds.map(String));
    return lessons.find((l) => !completedSet.has(String(l.id))) || null;
  }

  // lesson_completions holds rows from every course a user has ever
  // completed a lesson in, not just one - narrows to only the rows whose
  // lesson_id belongs to this course's manifest, so stats for one course's
  // dashboard can't be inflated by completions from a different course.
  function filterCompletionsForCourse(rows, courseLessons) {
    const courseLessonIds = new Set(courseLessons.map((l) => String(l.id)));
    return rows.filter((r) => courseLessonIds.has(String(r.lesson_id)));
  }

  // Inserts a stats/current-lesson banner at the top of the real Feed page's
  // post list, inside FluentCommunity's own portal shell. Only creates the
  // banner element once (idempotent, same create-if-missing pattern as
  // #shonaverse-lesson-actions above) - scheduleMountUI() re-runs mountUI()
  // on many DOM mutations, and repeatedly re-querying Supabase for a banner
  // that's already showing correct data would be wasteful.
  // "Latest missions" card, above FluentCommunity's Recent Activities in the right sidebar.
  function renderLatestMissionsHtml(missions, lessonsById) {
    if (!missions || !missions.length) {
      return '<div class="sv-lm-empty">No missions yet. Be the first! ✍️</div>';
    }
    return missions.map((m) => {
      const name = String(m.user_name || 'Learner').replace(/[()[\]{}<>]/g, '').trim();
      const lesson = lessonsById[String(m.lesson_id)];
      const e = lesson && findLessonEntry(_lessonsManifest || [], { href: lesson.url, title: lesson.title });
      const where = e && e.zuva > 0 ? 'Zuva ' + e.zuva : (lesson ? lesson.title : '');
      const memo = String(m.memo || '').slice(0, 90);
      const thumb = safeUrl(m.media_url) && m.media_type !== 'video'
        ? `<img class="sv-lm-thumb" src="${safeUrl(m.media_url)}" alt="">`
        : (safeUrl(m.media_url) ? '<span class="sv-lm-thumb sv-lm-thumb-video">🎥</span>' : '');
      const inner = `
        <div class="sv-lm-avatar">${safeUrl(m.user_avatar) ? `<img src="${safeUrl(m.user_avatar)}" alt="">` : escHtml(name.charAt(0).toUpperCase() || 'S')}</div>
        <div class="sv-lm-body">
          <div class="sv-lm-name">${escHtml(name)}${where ? ` <span class="sv-lm-where">· ${escHtml(where)}</span>` : ''}</div>
          ${memo ? `<div class="sv-lm-memo">${escHtml(memo)}</div>` : ''}
        </div>
        ${thumb}`;
      return lesson && safeUrl(lesson.url)
        ? `<a class="sv-lm-item" href="${safeUrl(lesson.url)}">${inner}</a>`
        : `<div class="sv-lm-item">${inner}</div>`;
    }).join('');
  }

  function mountLatestMissions() {
    const side = document.querySelector('.fcom_side_box');
    if (!side || document.getElementById('sv-latest-missions')) return;
    const box = document.createElement('div');
    box.id = 'sv-latest-missions';
    box.className = 'app_side_widget sv-latest-missions';
    box.innerHTML = '<div class="widget_header"><h3>Latest missions</h3></div><div class="sv-lm-list"><div class="sv-lm-empty">Loading…</div></div>';
    const recent = side.querySelector('.widget_recent_activities');
    side.insertBefore(box, recent || side.firstChild);
    renderLatestMissions(box);
  }

  async function renderLatestMissions(box) {
    await ensureAuth();
    const [course, , res] = await Promise.all([
      getCourse(),
      loadLessonsManifest(),
      supabase.from('lesson_missions').select('*').order('created_at', { ascending: false }).limit(6),
    ]);
    const list = box.querySelector('.sv-lm-list');
    if (!list) return;
    if (res.error) { list.innerHTML = '<div class="sv-lm-empty">Could not load missions.</div>'; return; }
    const lessonsById = {};
    (course ? course.lessons : []).forEach((l) => { lessonsById[l.id] = l; });
    list.innerHTML = renderLatestMissionsHtml(res.data || [], lessonsById);
  }

  function mountFeedDashboard() {
    mountLatestMissions();
    const feedBox = document.querySelector('.fcom_feed_box');
    if (!feedBox) return;

    let banner = document.getElementById('sv-feed-dashboard');

    // Home is dashboard-only: hide every native sibling (welcome banner, post composer, post list)
    // every time this runs, so it stays hidden even if Vue re-shows something. Hidden via
    // display:none, never removed, so Vue can keep managing those elements.
    Array.from(feedBox.children).forEach((child) => {
      if (child !== banner) child.style.display = 'none';
    });

    if (banner) return; // content already rendered this session

    banner = document.createElement('div');
    banner.id = 'sv-feed-dashboard';
    feedBox.insertBefore(banner, feedBox.firstChild);

    renderFeedDashboardContent(banner);
  }

  async function renderFeedDashboardContent(banner) {
    banner.innerHTML = '<div style="text-align:center; padding:20px 0; color:var(--sv-text-muted);">Loading your progress...</div>';

    const uid = await ensureAuth();
    const [course, , completionsRes] = await Promise.all([
      getCourse(),
      loadLessonsManifest(),
      supabase.from('lesson_completions').select('lesson_id, completed_at').eq('user_id', uid),
    ]);
    const { data: completions, error } = completionsRes;

    if (error) {
      banner.innerHTML = `<div style="text-align:center; padding:20px 0; color:var(--sv-red);">Could not load your progress: ${escHtml(error.message)}</div>`;
      return;
    }

    const rows = completions || [];
    // Real lesson list + completion ticks from FluentCommunity when available; the hand-kept
    // manifest (empty) is only the fallback when the REST API can't be reached.
    const courseLessons = course ? course.lessons : FEED_DASHBOARD_LESSONS;
    const courseRows = filterCompletionsForCourse(rows, courseLessons);
    const onboardingIds = new Set(courseLessons.filter(isOnboardingLesson).map((l) => String(l.id)));
    const completedIds = course ? course.completedIds : courseRows.map((r) => r.lesson_id);
    // Onboarding still counts as 'done' when finding the next lesson, but not in the ✓ total.
    const countedIds = completedIds.filter((id) => !onboardingIds.has(String(id)));
    const completedDates = courseRows.map((r) => r.completed_at);

    const streak = calculateStreak(completedDates);
    const completedCount = getTotalCompletedCount(countedIds);
    const openLessons = courseLessons.filter((l) => isLessonPublished(l, _lessonsManifest));
    const currentLesson = getCurrentLesson(openLessons, completedIds);
    const courseUrl = course ? course.url : FEED_DASHBOARD_COURSE_URL;
    const svIconCheck = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
    const svIconFlame = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1 1 2 2.5 2 4.5A5.5 5.5 0 0 1 6 14c0-5 4-6 6-12z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path></svg>`;
    const svIconMap = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><path d="M9 3v16M15 5v16" stroke="currentColor" stroke-width="1.8"></path></svg>`;

    let lessonCard;
    if (course && !course.isEnrolled) {
      lessonCard = `
        <div class="sv-dash-lesson-card">
          <div class="sv-dash-lesson-eyebrow">Start here</div>
          <div class="sv-dash-lesson-title">Daily Shona Lessons</div>
          <p class="sv-dash-lesson-sub">Ten minutes a day. Join the course to get your first lesson.</p>
          <a class="sv-dash-lesson-btn" href="${safeUrl(courseUrl)}">Start the course</a>
        </div>
      `;
    } else if (courseLessons.length === 0) {
      lessonCard = `
        <div class="sv-dash-lesson-card">
          <div class="sv-dash-lesson-eyebrow">Coming soon</div>
          <div class="sv-dash-lesson-title">New daily lessons are on their way</div>
          <a class="sv-dash-lesson-btn" href="${FEED_DASHBOARD_COURSE_URL}">View course</a>
        </div>
      `;
    } else if (currentLesson) {
      // The lesson's YouTube thumbnail (video id comes from mazwi's lessons.json), when we have one.
      // maxres is sharp; not every video has one, so it falls back to hq.
      const entry = findLessonEntry(_lessonsManifest || [], { href: currentLesson.url, title: currentLesson.title });
      const videoId = entry && /^[A-Za-z0-9_-]{11}$/.test(entry.video || '') ? entry.video : '';
      const thumb = videoId
        ? `<img class="sv-dash-lesson-thumb" src="https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${videoId}/hqdefault.jpg'">`
        : '';
      const zuvaNo = entry && entry.zuva > 0 ? entry.zuva : zuvaFromTitle(currentLesson.title);
      const lessonName = cleanLessonTitle(currentLesson.title) || currentLesson.title;
      lessonCard = `
        <a class="sv-dash-lesson-card sv-dash-lesson-link" href="${safeUrl(currentLesson.url)}">
          ${thumb}
          <div class="sv-dash-lesson-eyebrow">${completedCount > 0 ? "Today's lesson" : 'Your first lesson'}${zuvaNo > 0 ? ' · Zuva ' + zuvaNo : ''}</div>
          <div class="sv-dash-lesson-title">${escHtml(lessonName)}</div>
          <span class="sv-dash-lesson-go">Start lesson →</span>
        </a>
      `;
    } else {
      lessonCard = `
        <div class="sv-dash-lesson-card">
          <div class="sv-dash-lesson-eyebrow">All caught up</div>
          <div class="sv-dash-lesson-title">You've completed every published lesson</div>
          <p class="sv-dash-lesson-sub">${escHtml(nextArrivalText(_lessonsManifest))}</p>
          <a class="sv-dash-lesson-btn" href="${safeUrl(courseUrl)}">Browse lessons</a>
        </div>
      `;
    }

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const monthMap = getMonthCompletionMap(completedDates);

    // Small GitHub-style squares for the month (the lesson-complete modal already shows the week).
    // Brand-new learners have nothing to show yet, so they get none.
    const monthHtml = completedDates.length === 0 && completedCount === 0 ? '' : `
      <div class="sv-dash-month" aria-label="${monthNames[monthMap.month]} ${monthMap.year}">
        <div class="sv-dash-month-title">${monthNames[monthMap.month]}</div>
        <div class="sv-dash-month-grid">
          ${monthMap.days.filter(Boolean).map((d) => `<span class="sv-dash-sq${d.done ? ' sv-dash-sq-done' : (d.isToday ? ' sv-dash-sq-today' : '')}" title="${d.day}"></span>`).join('')}
        </div>
      </div>`;

    banner.innerHTML = `
      <div class="sv-dash-stats">
        <div class="sv-dash-stat">
          <span class="sv-dash-stat-icon sv-dash-stat-icon-check">${svIconCheck}</span>
          <span class="sv-dash-stat-value">${completedCount}</span>
        </div>
        <div class="sv-dash-stat">
          <span class="sv-dash-stat-icon sv-dash-stat-icon-flame">${svIconFlame}</span>
          <span class="sv-dash-stat-value">${streak}</span>
        </div>
        <a class="sv-dash-curriculum-btn" href="${FEED_DASHBOARD_COURSE_URL}" aria-label="View curriculum">${svIconMap}</a>
      </div>
      ${lessonCard}
      ${monthHtml}
    `;
  }

  // Debounce mountUI(): a single lesson navigation can fire many DOM mutations
  // in quick succession (FluentCommunity tearing down/rebuilding content), and
  // without this, each one would trigger a full, unconditional re-render.
  let mountUIScheduled = false;
  function scheduleMountUI() {
    if (mountUIScheduled) return;
    mountUIScheduled = true;
    setTimeout(() => {
      mountUIScheduled = false;
      mountUI();
    }, 150);
  }

  let lastSeenLessonId = getLessonId();
  setInterval(() => {
    const currentLessonId = getLessonId();
    const wrap = document.getElementById('sv-submissions-feed-wrap');
    if (currentLessonId !== lastSeenLessonId || (document.querySelector('.fcom_lesson_comments') && !wrap)) {
      lastSeenLessonId = currentLessonId;
      scheduleMountUI();
    }
  }, 250);

  window.addEventListener('popstate', () => {
    setTimeout(scheduleMountUI, 50);
  });

  const observer = new MutationObserver(scheduleMountUI);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', mountUI);

  // Test-only hook: never runs in a browser (typeof module is undefined there).
  // Lets the test suite require() the real functions instead of duplicating them.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ensureAuth, emailFromToken, completedZuvas, withDoneZuvas, withMemberToken, cleanLessonTitle, lessonEyebrow, mountLessonHeader, renderOnboardingHtml, renderMissionHtml, isOnboardingLesson, isLessonPublished, nextArrivalText, lessonProgress, pickAffirmation, AFFIRMATIONS, styleLessonContent, showCelebrationModal, escHtml, safeUrl, findZuvaForUrl, zuvaFromTitle, findLessonEntry, renderPhraseBankHtml, mountPhraseBank, _setLessonsManifest, flattenCourseLessons, getCourse, renderLatestMissionsHtml, getLessonId, getUserInfo, mountUI, mountSpaceTabs, getSpaceSlug, SPACE_TABS, scheduleMountUI, getLessonNumber, getCourseProgress, calculateStreak, getTotalLessonCount, getWeekCompletionMap, getMonthCompletionMap, getTotalCompletedCount, getCurrentLesson, filterCompletionsForCourse, FEED_DASHBOARD_LESSONS };
  }
})();

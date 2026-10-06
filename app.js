(function() {
  // === CONFIGURATION ===
  const SUPABASE_URL = 'https://zmuhinskhofhvyclkrbr.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptdWhpbnNraG9maHZ5Y2xrcmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MjA3NzEsImV4cCI6MjA5OTE5Njc3MX0.eRmLcHn2ywawr2AC_J4mPz3TrDxJVt0qnEMVc9mVSnI'; // <-- Replace with your key
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Verified identity (mazwi LAUNCH.md C3). The WordPress snippet prints a signed token for the
  // logged-in member as window.MAZWI_MEMBER_TOKEN; mazwi's member-signin function turns it into
  // a real Supabase login (the same account mazwi uses). Rows are then owned by user_id, and the
  // database rules (Supabase row-level security, set up 2026-10-05) only let signed-in members read or write.
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
  function lessonProgress(course, justCompletedId, extraDoneIds = []) {
    const lessons = ((course && course.lessons) || []).filter((l) => !isOnboardingLesson(l));
    // FluentCommunity's own ticks plus the ones we hold ourselves (free members have none there)
    const done = new Set(((course && course.completedIds) || []).concat(extraDoneIds).map(String));
    if (justCompletedId) done.add(String(justCompletedId));
    const completed = lessons.filter((l) => done.has(String(l.id))).length;
    const total = lessons.length;
    return { completed, total, pct: total ? Math.round((completed / total) * 100) : 0 };
  }

  // Zuva number of a lesson page: the number in its address (day-3) or title (Zuva 3 — ...), never
  // FluentCommunity's own "Lesson X of Y", which counts onboarding and so runs a day ahead.
  function zuvaNumberForPage(slug, title) {
    const m = /^(?:day|zuva)-(d+)$/i.exec(String(slug || ''));
    if (m) return parseInt(m[1], 10);
    return zuvaFromTitle(title);
  }

  // What the celebration's Next button does. Completing a lesson can already have moved the page on
  // (FluentCommunity advances by itself), so only go forward if the page is still on the lesson that
  // was just completed; otherwise just close, or a lesson gets skipped.
  function celebrationNextStep({ completedId, currentId, course }) {
    const lessons = (course && course.lessons) || [];
    const i = lessons.findIndex((l) => String(l.id) === String(completedId));
    const next = i >= 0 ? lessons[i + 1] : null;
    if (!next || String(currentId) !== String(completedId)) return { action: 'stay' };
    return { action: 'advance', url: next.url };
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
    // LOCAL days: a UTC day would light tomorrow's dot for an evening lesson.
    const daySet = new Set(completedAtList.map((d) => localDay(new Date(d))));
    const ref = new Date(referenceDate);
    const daysSinceMonday = (ref.getDay() + 6) % 7;
    const monday = new Date(ref);
    monday.setDate(monday.getDate() - daysSinceMonday);

    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      week.push(daySet.has(localDay(d)));
    }
    return week;
  }

  // Full calendar grid for the month containing referenceDate: leading nulls
  // for padding before the 1st (aligned to Sunday-start, matching the S M T
  // W T F S header the Home dashboard renders), then one entry per real day
  // with its done/isToday status.
  function getMonthCompletionMap(completedAtList, referenceDate = new Date()) {
    const daySet = new Set(completedAtList.map((d) => localDay(new Date(d))));

    // Everything derives from the learner's LOCAL calendar day (a UTC day is a day early or late
    // for anyone west or east of Greenwich).
    const ref = new Date(referenceDate);
    const todayKey = localDay(ref);
    const year = ref.getFullYear();
    const monthIndex = ref.getMonth(); // 0-indexed, to match Date's own convention

    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const startWeekday = new Date(year, monthIndex, 1).getDay();

    const days = [];
    for (let i = 0; i < startWeekday; i++) {
      days.push(null);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const key = localDay(new Date(year, monthIndex, d));
      days.push({ day: d, done: daySet.has(key), isToday: key === todayKey });
    }

    return { year, month: monthIndex, days };
  }

  // Count consecutive calendar days, ending at referenceDate, with at least
  // one completion. referenceDate defaults to now in production; tests pass
  // a fixed date so results are deterministic.
  function calculateStreak(completedAtList, referenceDate = new Date()) {
    const daySet = new Set(completedAtList.map((d) => localDay(new Date(d))));
    let streak = 0;
    const cursor = new Date(referenceDate);
    while (daySet.has(localDay(cursor))) {
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

    // 23505 = a row for this lesson already exists (e.g. an old name-keyed one): the lesson IS done,
    // so carry on with the celebration instead of leaving the learner with nothing.
    if (upsertErr && upsertErr.code !== '23505') {
      console.error('[SV celebrate] upsert into lesson_completions failed:', upsertErr.message, upsertErr);
      return;
    }
    console.log('[SV celebrate] lesson_completions saved' + (upsertErr ? ' (already existed)' : ''));

    const { data: completions, error: selectErr } = await supabase
      .from('lesson_completions')
      .select('lesson_id, completed_at')
      .eq('user_id', uid);

    if (selectErr) {
      console.error('[SV celebrate] could not read back completions for streak calc:', selectErr.message, selectErr);
    }

    const completedDates = (completions || []).map((c) => c.completed_at);
    const streak = calculateStreak(completedDates);
    const weekMap = getWeekCompletionMap(completedDates);
    const lessonNumber = getLessonNumber();
    const course = await getCourse();
    const doneLesson = course && course.lessons.find((l) => String(l.id) === String(lessonId));

    // Zuva 0 (onboarding) is saved but never celebrated: it is not a lesson and does not count.
    if (isOnboardingLesson(doneLesson || { title: getLessonTitle() })) {
      console.log('[SV celebrate] onboarding lesson saved, no celebration');
      return 'onboarding';
    }

    const prog = course ? lessonProgress(course, lessonId, (completions || []).map((c) => c.lesson_id)) : null;
    const progress = prog ? prog.pct : getCourseProgress();
    const totalLessons = prog ? prog.total : getTotalLessonCount();
    const completedCount = prog ? prog.completed : null;
    // Manifest is prefetched on mount; never block the celebration on the network.
    // Always the lesson that was just completed (the page may already have moved on to the next one).
    const doneSlug = doneLesson ? (/\/lessons\/([^/?#]+)/.exec(doneLesson.url) || [])[1] : lessonSlugFromUrl();
    const doneTitle = doneLesson ? doneLesson.title : getLessonTitle();
    const doneNo = zuvaNumberForPage(doneSlug, doneTitle);
    const zuva = findLessonEntry(_lessonsManifest || [], { href: doneLesson ? doneLesson.url : window.location.href, title: doneTitle })
      || (doneNo !== null ? { zuva: doneNo } : null);
    const currentSlug = lessonSlugFromUrl();
    const currentId = currentSlug ? await resolveLessonIdBySlug(currentSlug) : getLessonId();
    const nextStep = celebrationNextStep({ completedId: lessonId, currentId, course });
    const doneIdx = course ? course.lessons.findIndex((l) => String(l.id) === String(lessonId)) : -1;
    const moreAfter = !!(course && doneIdx >= 0 && doneIdx < course.lessons.length - 1);
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

    showCelebrationModal({ lessonNumber: zuva ? null : lessonNumber, streak, weekMap, progress, totalLessons, completedCount, hasSubmittedMission, zuva, nextStep, moreAfter });
    return 'celebrated';
  }

  function showCelebrationModal({ lessonNumber, streak, weekMap, progress, totalLessons, completedCount = null, hasSubmittedMission, zuva = null, nextStep = null, moreAfter = null }) {
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
    const hasNext = nextStep
      ? nextStep.action === 'advance'
      : !!(nextBtn && nextBtn.getAttribute('aria-disabled') !== 'true');
    const nextZuva = zuva && (_lessonsManifest || []).find((l) => l.zuva === zuva.zuva + 1);
    // 'stay' with more lessons ahead means the page already moved on by itself: just carry on.
    const nextLabel = nextStep && !hasNext && moreAfter
      ? 'Keep going →'
      : (!hasNext ? 'Done for today' : (nextZuva ? `Next: Zuva ${nextZuva.zuva} →` : 'Next lesson →'));

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
      if (!hasNext) return;
      if (nextStep && nextStep.url) navigateTo(nextStep.url);
      else if (nextBtn) nextBtn.click();
    });

    document.getElementById('sv-celebration-submit-mission')?.addEventListener('click', () => {
      wrap.classList.remove('is-active');
      document.getElementById('sv-mission-modal-wrap')?.classList.add('is-active');
    });
  }

  function mountUI() {
    mountSidebar();
    const route = document.body.getAttribute('data-route');
    if (route === 'view_lesson') {
      mountLockedLesson();
      mountLessonUI();
    } else if (route === 'all_feeds') {
      mountFeedDashboard();
    } else if (route === 'space_feeds') {
      mountSpaceTabs();
      mountLiveClasses();
    } else if (route === 'view_course') {
      mountPaywall();
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

  // ── Left sidebar: Home · Community · Live Classes · courses, no group headers; Shop + the website
  // become small icons at the bottom. FluentCommunity can't hide individual spaces, so this hides
  // the community spaces (Intros, Lounge, Rules — they live behind one "Community" link, and the
  // tabs on those pages switch between them). Native nodes are only hidden, never removed, and
  // our own items are re-added on every mount in case Vue re-rendered the list.
  function portalBase() {
    const a = window.fluentComAdmin;
    return String((a && a.portal_url) || 'https://speakshona.com/shonaverse').replace(/\/+$/, '');
  }

  const LIVE_BUY_URL = 'https://speakshona.com/item/daily-lessons-zuva-nezuva/'; // product page: pick Daily Lessons + Live

  const SIDE_ICON_HOME = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"></path><path d="M5.5 10v9.5h13V10"></path></svg>';
  const SIDE_ICON_COMMUNITY = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"></path></svg>';

  function sideItem(id, label, href, icon, active, before) {
    let li = document.getElementById(id);
    if (!li) {
      li = document.createElement('li');
      li.id = id;
      li.className = 'space_menu_item';
    }
    const state = (active ? '1' : '0') + '|' + href;
    if (li.getAttribute('data-state') !== state) {
      li.setAttribute('data-state', state);
      li.innerHTML = '<a class="fcom_menu_link space_menu_item route_url fcom_compt_link' + (active ? ' router-link-active router-link-exact-active' : '') + '" href="' + safeUrl(href) + '"'
        + (active ? ' aria-current="page"' : '') + '><div class="community_avatar"><span class="fcom_shape"><i class="el-icon">' + icon + '</i></span></div>'
        + '<span class="community_name" title="' + escHtml(label) + '">' + escHtml(label) + '</span></a>';
    }
    return li;
  }

  // Courses that only the people enrolled in them (and admins) should see in the sidebar — the camp and
  // cohort replays hold other families' recordings. Add a slug (the /course/<slug>/ part) to hide more.
  const ENROLLED_ONLY_NAME = /^replays/i; // every course whose name starts with "Replays"
  const _enrolledState = {};   // slug -> true | false once known
  const _enrolledAsked = {};   // slug -> true once the check has started

  // Asks FluentCommunity whether this person is enrolled in a course. false when it cannot tell.
  async function isEnrolledIn(slug) {
    const a = window.fluentComAdmin;
    const rest = a && a.rest;
    if (!rest || !rest.url || typeof fetch !== 'function') return false;
    try {
      const res = await fetch(rest.url + '/courses/' + encodeURIComponent(slug) + '/by-slug', {
        headers: rest.nonce ? { 'X-WP-Nonce': rest.nonce } : {},
        credentials: 'include',
      });
      if (!res.ok) return false;
      const json = await res.json();
      const track = json.track || {};
      return !!(track.isEnrolled !== undefined ? track.isEnrolled : json.course && json.course.isEnrolled);
    } catch (e) { return false; }
  }

  function mountSidebar() {
    const wrap = document.getElementById('fcom_sidebar_wrap');
    if (!wrap) return;

    // the community spaces are replaced by one Community link
    SPACE_TABS.forEach((t) => {
      const a = wrap.querySelector('a.fcom_space_' + t.slug);
      const li = a && a.closest('li');
      if (li) li.classList.add('sv-side-hidden');
    });

    // Home + Community on top of the first group
    const firstList = wrap.querySelector('.fcom_communities_menu nav ul');
    if (firstList) {
      const base = portalBase();
      const onCommunity = SPACE_TABS.some((t) => t.slug === getSpaceSlug());
      const onHome = document.body.getAttribute('data-route') === 'all_feeds';
      const home = sideItem('sv-side-home', 'Home', base + '/', SIDE_ICON_HOME, onHome);
      const community = sideItem('sv-side-community', 'Community', base + '/space/' + SPACE_TABS[0].slug + '/home', SIDE_ICON_COMMUNITY, onCommunity);
      if (firstList.firstElementChild !== home) firstList.insertBefore(home, firstList.firstChild);
      if (home.nextElementSibling !== community) firstList.insertBefore(community, home.nextSibling);
    }

    // enrolled-only courses (camp / cohort replays): hidden until we know this person is enrolled
    wrap.querySelectorAll('a[href*="/course/"]').forEach((a) => {
      const name = a.getAttribute('data-fcom-hint') || (a.textContent || '').trim();
      const m = /\/course\/([^/?#]+)/.exec(a.getAttribute('href') || '');
      const li = a.closest('li');
      if (!li || !m || !ENROLLED_ONLY_NAME.test(name)) return;
      const slug = m[1];
      const show = _enrolledState[slug] === true || getUserInfo().isAdmin;
      li.classList.toggle('sv-side-hidden', !show);
      if (!show && !_enrolledAsked[slug]) {
        _enrolledAsked[slug] = true;
        isEnrolledIn(slug).then((ok) => { _enrolledState[slug] = ok; if (ok) scheduleMountUI(); });
      }
    });

    // Live Classes goes last, after the courses
    const lists = wrap.querySelectorAll('.fcom_communities_menu nav ul');
    const lastList = lists[lists.length - 1];
    const liveA = wrap.querySelector('a.fcom_space_liveclass');
    const liveLi = liveA && liveA.closest('li');
    if (lastList && liveLi && lastList.lastElementChild !== liveLi) lastList.appendChild(liveLi);

    // Shop + the website: small icons at the bottom instead of a menu block at the top
    const site = document.querySelector('.fcom_menu_item_fcom_custom_speak_shona_website a');
    const shop = document.querySelector('.fcom_menu_item_fcom_custom_shop a');
    const nativeNav = (shop || site) && (shop || site).closest('nav');
    if (nativeNav) nativeNav.classList.add('sv-side-hidden');
    let links = document.getElementById('sv-side-links');
    if (!links && (site || shop)) {
      links = document.createElement('div');
      links.id = 'sv-side-links';
      [site, shop].filter(Boolean).forEach((src) => {
        const a = document.createElement('a');
        const label = src.getAttribute('data-fcom-hint') || '';
        a.href = src.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.title = label;
        a.setAttribute('aria-label', label);
        const img = src.querySelector('img');
        if (img) { const i = document.createElement('img'); i.src = img.src; i.alt = ''; a.appendChild(i); }
        links.appendChild(a);
      });
      const footer = document.querySelector('.fcom_side_footer');
      if (footer) footer.insertBefore(links, footer.firstChild); else wrap.appendChild(links);
    }

    // The Live Classes space is secret: people without the Live tag never see it, so offer it to them
    links = document.getElementById('sv-side-links');
    let buy = document.getElementById('sv-side-live-buy');
    if (!liveA && links && !buy) {
      buy = document.createElement('a');
      buy.id = 'sv-side-live-buy';
      buy.href = LIVE_BUY_URL;
      buy.target = '_blank';
      buy.rel = 'noopener noreferrer';
      buy.textContent = 'Get live classes';
      links.appendChild(buy);
    } else if (liveA && buy) {
      buy.remove();
    }
  }

  // ── Live Classes page: two class cards (kids / adults) with a countdown that turns into a Join
  // button, plus recordings buttons. Times are fixed in the teacher's time zone (Vancouver, so they
  // follow daylight saving) and shown in a time zone the learner can pick. The schedule below is only a
  // fallback: the live_classes table (members-only, Supabase row-level security) holds the Meet links and
  // recordings links, so they are never written into this public file.
  const LIVE_JOIN_LEAD_MS = 10 * 60 * 1000; // Join opens 10 minutes before the start
  const LIVE_TZ_KEY = 'sv_live_tz';
  const LIVE_FALLBACK_TZ = 'America/Vancouver';
  const LIVE_CLASSES_DEFAULT = [
    { id: 'kids', icon: '🌈', title: 'Kids class', blurb: 'Ages 7+', dow: 5, start: '11:45', end: '12:30', tz: 'America/Vancouver', first: '2026-10-09', meet_url: '', recordings_url: '' },
    { id: 'adults', icon: '🌍', title: 'Adults class', blurb: 'Every level welcome', dow: 5, start: '12:45', end: '13:30', tz: 'America/Vancouver', first: '2026-10-09', meet_url: '', recordings_url: '' },
  ];
  const LIVE_ZONES = [
    ['America/Vancouver', 'Pacific — Vancouver, Los Angeles'],
    ['America/Denver', 'Mountain — Calgary, Denver'],
    ['America/Chicago', 'Central — Chicago, Winnipeg'],
    ['America/New_York', 'Eastern — Toronto, New York'],
    ['America/Halifax', 'Atlantic — Halifax'],
    ['Europe/London', 'United Kingdom — London'],
    ['Europe/Paris', 'Central Europe — Paris, Berlin'],
    ['Africa/Harare', 'Zimbabwe — Harare'],
    ['Africa/Johannesburg', 'South Africa — Johannesburg'],
    ['Asia/Dubai', 'Dubai'],
    ['Australia/Sydney', 'Australia — Sydney'],
    ['Pacific/Auckland', 'New Zealand — Auckland'],
    ['UTC', 'UTC'],
  ];

  function validZone(tz) {
    if (!tz) return false;
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
  }

  // Some browsers can't tell their own time zone (it comes back undefined, and dates then print as
  // a fixed GMT offset that is wrong half the year), so the zone is never taken for granted.
  function detectedZone() {
    try {
      const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
      return validZone(tz) ? tz : '';
    } catch (e) { return ''; }
  }

  function liveZone() {
    let saved = '';
    try { saved = localStorage.getItem(LIVE_TZ_KEY) || ''; } catch (e) { /* private mode */ }
    return validZone(saved) ? saved : (detectedZone() || LIVE_FALLBACK_TZ);
  }

  // How far ahead of UTC a time zone is at a given moment (handles daylight saving)
  function tzOffsetMs(ms, tz) {
    const p = {};
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return asUtc - Math.floor(ms / 1000) * 1000;
  }

  // The real moment (ms since 1970) of "2026-10-09 11:45" on the wall clock of time zone tz
  function zonedInstant(dateStr, hhmm, tz) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, min] = hhmm.split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, h, min);
    let t = wall - tzOffsetMs(wall, tz);
    t = wall - tzOffsetMs(t, tz); // re-check once, right around a daylight-saving change
    return t;
  }

  // The next session of a class that has not finished yet: { start, end } in ms, or null
  function nextLiveSession(cls, now) {
    const day = new Date(Math.max(now - 86400000, Date.parse(cls.first + 'T00:00:00Z')));
    for (let i = 0; i < 400; i++) {
      const key = day.toISOString().slice(0, 10);
      if (day.getUTCDay() === cls.dow && key >= cls.first) {
        const start = zonedInstant(key, cls.start, cls.tz);
        const end = zonedInstant(key, cls.end, cls.tz);
        if (end > now) return { start, end };
      }
      day.setUTCDate(day.getUTCDate() + 1);
    }
    return null;
  }

  function formatCountdown(ms) {
    const mins = Math.max(0, Math.floor(ms / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    return (d ? d + 'd ' : '') + (d || h ? h + 'h ' : '') + m + 'm';
  }

  // "Every Friday · 11:45 AM – 12:30 PM PDT" in the chosen time zone (weekday included: in
  // Australia the Friday class is on Saturday morning)
  function liveLocalLabel(s, zone) {
    const tz = validZone(zone) ? zone : LIVE_FALLBACK_TZ;
    const t = (ms) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
    const name = (new Intl.DateTimeFormat('en-US', { timeZoneName: 'short', timeZone: tz }).formatToParts(new Date(s.start)).find((x) => x.type === 'timeZoneName') || {}).value || '';
    const weekday = new Date(s.start).toLocaleDateString('en-US', { weekday: 'long', timeZone: tz });
    return 'Every ' + weekday + ' · ' + t(s.start) + ' – ' + t(s.end) + (name ? ' ' + name : '');
  }

  function renderLiveCard(cls, now, zone) {
    const s = nextLiveSession(cls, now);
    let action;
    if (!s) {
      action = '<span class="sv-live-btn sv-live-btn-off">No upcoming class</span>';
    } else if (now >= s.start - LIVE_JOIN_LEAD_MS) {
      action = safeUrl(cls.meet_url)
        ? '<a class="sv-live-btn sv-live-btn-go" href="' + safeUrl(cls.meet_url) + '" target="_blank" rel="noopener noreferrer">Join class</a>'
        : '<span class="sv-live-btn sv-live-btn-off">Join link coming</span>';
    } else {
      action = '<span class="sv-live-btn sv-live-btn-off">Starts in ' + formatCountdown(s.start - now) + '</span>';
    }
    return '<div class="sv-live-card sv-live-card-' + escHtml(cls.id) + '" data-class="' + escHtml(cls.id) + '">'
      + '<div class="sv-live-icon" aria-hidden="true">' + (cls.icon || '') + '</div>'
      + '<div class="sv-live-title">' + escHtml(cls.title) + '</div>'
      + (s ? '<div class="sv-live-when">' + escHtml(liveLocalLabel(s, zone || liveZone())) + '</div>' : '')
      + (cls.blurb ? '<div class="sv-live-blurb">' + escHtml(cls.blurb) + '</div>' : '')
      + action + '</div>';
  }

  function renderLiveRecordings(rows) {
    const btn = (cls, label) => safeUrl(cls && cls.recordings_url)
      ? '<a class="sv-live-rec-btn" href="' + safeUrl(cls.recordings_url) + '">' + label + '</a>'
      : '<span class="sv-live-rec-btn sv-live-btn-off">' + label + ' · coming soon</span>';
    const kids = rows.find((r) => r.id === 'kids');
    const adults = rows.find((r) => r.id === 'adults');
    return '<div class="sv-live-rec"><div><div class="sv-live-rec-title">Recordings</div>'
      + '<div class="sv-live-blurb">Watch any class you missed, as often as you like.</div></div>'
      + '<div class="sv-live-rec-btns">' + btn(kids, 'Kids recordings') + btn(adults, 'Adults recordings') + '</div></div>';
  }

  // The "Times shown in" picker is built once and left alone, so the 30-second refresh of the cards
  // never closes an open dropdown.
  function liveZonePickerHtml() {
    const current = liveZone();
    const list = LIVE_ZONES.some((z) => z[0] === current) ? LIVE_ZONES : [[current, current.replace(/_/g, ' ') + ' (your device)']].concat(LIVE_ZONES);
    return '<label class="sv-live-tz"><span>Times shown in</span><select id="sv-live-tz-select">'
      + list.map((z) => '<option value="' + escHtml(z[0]) + '"' + (z[0] === current ? ' selected' : '') + '>' + escHtml(z[1]) + '</option>').join('')
      + '</select></label>';
  }

  function renderLivePage(page) {
    const body = page.querySelector('.sv-live-body');
    if (!body) return;
    const rows = page._rows || LIVE_CLASSES_DEFAULT;
    const now = Date.now();
    const zone = liveZone();
    body.innerHTML = '<div class="sv-live-intro"><div class="sv-live-intro-title">Live with Tsitsi, every Friday</div>'
      + '<div class="sv-live-blurb">Speak, listen and practise Shona together. Pick your class below.</div></div>'
      + '<div class="sv-live-grid">' + rows.map((r) => renderLiveCard(r, now, zone)).join('') + '</div>'
      + '<div class="sv-live-tips"><div class="sv-live-tips-title">Before you join</div><ul>'
      + '<li>The Join button opens 10 minutes before the class</li>'
      + '<li>It opens in Google Meet — use headphones if you can</li>'
      + '<li>Keep a notebook handy to write new words</li></ul></div>'
      + renderLiveRecordings(rows);
  }

  async function loadLiveClasses(page) {
    let rows = LIVE_CLASSES_DEFAULT.map((r) => Object.assign({}, r));
    try {
      await ensureAuth();
      const res = await supabase.from('live_classes').select('*');
      if (!res.error && Array.isArray(res.data)) {
        res.data.forEach((row) => {
          const base = rows.find((r) => r.id === row.id);
          if (!base) return;
          Object.assign(base, {
            title: row.title || base.title,
            blurb: row.blurb != null ? row.blurb : base.blurb,
            dow: row.day_of_week != null ? row.day_of_week : base.dow,
            start: row.start_time || base.start,
            end: row.end_time || base.end,
            tz: row.tz || base.tz,
            first: row.first_date || base.first,
            meet_url: row.meet_url || '',
            recordings_url: row.recordings_url || '',
          });
        });
      }
    } catch (e) { /* table missing or not a member: the schedule still shows, without links */ }
    page._rows = rows;
    renderLivePage(page);
    if (!page._timer && typeof setInterval === 'function') {
      page._timer = setInterval(() => {
        if (!document.body.contains(page)) { clearInterval(page._timer); return; }
        renderLivePage(page);
      }, 30000);
    }
  }

  // The Live Classes space is a static page: our cards replace its posts area (hidden, not removed).
  function mountLiveClasses() {
    if (getSpaceSlug() !== 'liveclass') return;
    const layout = document.querySelector('.fhr_content_layout');
    const body = layout && layout.querySelector('.fhr_content_layout_body');
    if (!layout || !body) return;
    body.style.display = 'none';
    let page = document.getElementById('sv-live');
    if (!page) {
      page = document.createElement('div');
      page.id = 'sv-live';
      page._rows = LIVE_CLASSES_DEFAULT;
      page.innerHTML = '<div class="sv-live-body"></div>' + liveZonePickerHtml();
      page.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'sv-live-tz-select') {
          try { localStorage.setItem(LIVE_TZ_KEY, e.target.value); } catch (err) { /* private mode: lasts until reload */ }
          renderLivePage(page);
        }
      });
      layout.insertBefore(page, body);
      renderLivePage(page);
      loadLiveClasses(page);
    } else if (page.nextElementSibling !== body) {
      layout.insertBefore(page, body);
    }
  }

  // ── Daily Lessons sales page (the lock screen shown to visitors who do not have the course) ──
  // FluentCommunity prints four equal plan cards. We hide them (never remove) and show two plans —
  // Daily Lessons and Daily Lessons + Live — with a Monthly / Yearly switch, built from the real
  // prices and checkout links in those native cards, so nothing is hard-coded here.
  const PLAN_BULLETS_BASE = ['Self-led online course: a short new lesson every day', 'Every lesson word in the mazwi flashcard app', 'Missions and the community'];
  const PLAN_BULLETS_LIVE = ['Everything in Daily Lessons', 'Live online class every Friday — kids and adults', 'Recordings of every class'];

  function readPaywallPlans(root) {
    const out = [];
    root.querySelectorAll('.fcom_paywall').forEach((card) => {
      const titleEl = card.querySelector('.paywall_header span:last-child');
      const title = titleEl ? titleEl.textContent : '';
      const priceEl = card.querySelector('.paywall_body span');
      const priceText = priceEl ? priceEl.textContent.trim() : '';
      const subEl = card.querySelector('.paywall_body .subscription');
      const per = subEl ? subEl.textContent.toLowerCase() : '';
      const link = card.querySelector('.paywall_footer a');
      const amount = parseFloat(priceText.replace(/[^0-9.]/g, ''));
      if (!link || !isFinite(amount) || !link.getAttribute('href')) return;
      out.push({ live: /live/i.test(title), yearly: /year|annual/i.test(per + ' ' + title), amount, priceText, href: link.getAttribute('href') });
    });
    return out;
  }

  function planGroups(plans) {
    const pick = (live, yearly) => plans.find((p) => p.live === live && p.yearly === yearly) || null;
    return [
      { id: 'base', name: 'Daily Lessons', cta: 'Join Daily Lessons', bullets: PLAN_BULLETS_BASE, month: pick(false, false), year: pick(false, true) },
      { id: 'live', name: 'Daily Lessons + Live Classes', cta: 'Join Daily Lessons + Live Classes', bullets: PLAN_BULLETS_LIVE, month: pick(true, false), year: pick(true, true) },
    ].filter((g) => g.month || g.year);
  }

  function planSavePct(g) {
    return g.month && g.year ? Math.round((1 - g.year.amount / (g.month.amount * 12)) * 100) : 0;
  }

  function renderPlanCards(groups, period) {
    return groups.map((g) => {
      const p = period === 'year' ? (g.year || g.month) : (g.month || g.year);
      const yearly = p === g.year;
      const symbol = ((/^[^\d.,\s]+/.exec(p.priceText)) || [''])[0];
      const price = p.priceText.replace(/\.00$/, '');
      const perMonth = yearly ? '<div class="sv-plan-sub">≈ ' + escHtml(symbol + (p.amount / 12).toFixed(2)) + ' a month</div>' : '<div class="sv-plan-sub">billed monthly</div>';
      return '<div class="sv-plan' + (g.id === 'live' ? ' sv-plan-live' : '') + '" data-plan="' + g.id + '">'
        + '<div class="sv-plan-name">' + escHtml(g.name) + '</div>'
        + '<div class="sv-plan-price">' + escHtml(price) + '<span> / ' + (yearly ? 'year' : 'month') + '</span></div>' + perMonth
        + '<ul class="sv-plan-list">' + g.bullets.map((b) => '<li>' + escHtml(b) + '</li>').join('') + '</ul>'
        + '<a class="sv-plan-btn" href="' + safeUrl(p.href) + '">' + escHtml(g.cta) + '</a></div>';
    }).join('');
  }

  // A lesson the person does not have yet: FluentCommunity prints "This lesson is currently locked".
  // Swap that for one calm line and a single button; the plans stay a click away, never in the way.
  // One place that leaves the page, so tests can watch where a button goes.
  let _navigate = (url) => window.location.assign(url);
  function navigateTo(url) { _navigate(url); }
  function _setNavigate(fn) { _navigate = fn; }

  const _ownDone = new Set();    // lessons a free member has marked complete (kept in our own table)
  const _ownChecked = new Set(); // lesson slugs already looked up this page load
  const _ownIdBySlug = {};
  const _ownResolved = new Set(); // lesson slugs whose "already done?" check has finished

  // Someone who did lessons as a free member and then joined: FluentCommunity has no ticks for them,
  // so tick those lessons there too (its own PUT, the same call its Complete button makes). Nothing
  // is deleted or redone by hand. Runs once per page load and never throws.
  let _syncedOwn = false;
  async function syncOwnCompletions(course, courseRows) {
    if (_syncedOwn || !course || !course.isEnrolled || !course.id) return;
    const a = window.fluentComAdmin;
    const rest = a && a.rest;
    if (!rest || !rest.url) return;
    const have = new Set(course.completedIds.map(String));
    const inCourse = new Set(course.lessons.map((l) => String(l.id)));
    const missing = courseRows.map((r) => String(r.lesson_id)).filter((id) => inCourse.has(id) && !have.has(id));
    console.log('[SV sync] free-member lessons to tick in FluentCommunity:', missing);
    if (!missing.length) return;
    _syncedOwn = true;
    for (const id of Array.from(new Set(missing))) {
      try {
        const res = await fetch(rest.url + '/courses/' + course.id + '/lessons/' + id + '/completion', {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, rest.nonce ? { 'X-WP-Nonce': rest.nonce } : {}),
          credentials: 'include',
          body: JSON.stringify({ state: 'completed' }),
        });
        console.log('[SV sync] lesson', id, '->', res && res.status);
      } catch (e) { console.warn('[SV sync] lesson', id, 'failed:', e && e.message); }
    }
  }

  function lessonSlugFromUrl() {
    const m = /\/lessons\/([^/?#]+)/.exec(window.location.pathname || '');
    return m ? m[1].toLowerCase() : '';
  }

  // FluentCommunity's numeric lesson id for an address slug like "day-1", from the course list.
  async function resolveLessonIdBySlug(slug) {
    if (_ownIdBySlug[slug]) return _ownIdBySlug[slug];
    const course = await getCourse();
    const hit = course && course.lessons.find((l) => String(l.url || '').toLowerCase().indexOf('/lessons/' + slug) !== -1);
    if (hit) _ownIdBySlug[slug] = String(hit.id);
    return _ownIdBySlug[slug] || '';
  }

  function mountLockedLesson() {
    const locker = document.querySelector('.fcom_locked_container .fcom_locker');
    if (!locker) return;
    Array.from(locker.children).forEach((child) => { if (child.id !== 'sv-locker') child.style.display = 'none'; });
    if (document.getElementById('sv-locker')) return;
    const login = document.querySelector('.fcom_login_btn');
    const loginHref = login ? login.getAttribute('href') : '';
    const box = document.createElement('div');
    box.id = 'sv-locker';
    box.innerHTML = '<div class="sv-locker-title">Ready for the next lesson?</div>'
      + '<div class="sv-locker-sub">The rest of Daily Shona Lessons is for members.</div>'
      + '<a class="sv-locker-btn" href="' + FEED_DASHBOARD_COURSE_URL + '?plans=1">See membership plans</a>'
      + (safeUrl(loginHref) ? '<div class="sv-locker-login">Already a member? <a href="' + safeUrl(loginHref) + '">Log in</a></div>' : '');
    locker.appendChild(box);
  }

  function mountPaywall() {
    const lock = document.querySelector('.fcom_single_layout[course_slug="shona-lessons"] .space_default_lockscreen');
    if (!lock) return;
    const native = lock.querySelector('.fcom_paywall_cards');
    const groups = native ? planGroups(readPaywallPlans(native)) : [];
    if (!groups.length) return;

    const loginEl = lock.querySelector('.space_lock_box a.fcom_btn');
    const loginHref = loginEl ? loginEl.getAttribute('href') : '';

    // native lock box + cards: hidden, not removed (Vue keeps managing them)
    Array.from(lock.children).forEach((child) => { if (child.id !== 'sv-plans') child.style.display = 'none'; });

    let box = document.getElementById('sv-plans');
    if (!box) {
      const save = Math.max.apply(null, groups.map(planSavePct));
      box = document.createElement('div');
      box.id = 'sv-plans';
      box.setAttribute('data-period', 'year');
      const plansWanted = /[?&]plans=1/.test(window.location.search || ''); // arrived from a locked lesson
      const freeStart = safeUrl(loginHref)
        ? '<div class="sv-free"><div class="sv-free-title">Start learning Shona</div>'
          + '<div class="sv-free-sub">Make a free account and begin with your first lesson.</div>'
          + '<a class="sv-free-btn" href="' + safeUrl(loginHref) + '">Start your first lesson</a></div>'
          + '<button type="button" class="sv-plans-toggle" aria-expanded="' + (plansWanted ? 'true' : 'false') + '">Membership plans</button>'
        : '';
      box.innerHTML = freeStart
        + '<div class="sv-plans-more"' + (freeStart && !plansWanted ? ' hidden' : '') + '>'
        + '<div class="sv-plans-head"><div class="sv-plans-title">Join Daily Lessons</div>'
        + '<div class="sv-plans-sub">A short Shona lesson every day. Pick a plan.</div></div>'
        + '<div class="sv-plans-bill">Choose how you pay</div>'
        + '<div class="sv-plans-switch" role="group" aria-label="Billing period">'
        + '<button type="button" data-period="month">Monthly</button>'
        + '<button type="button" data-period="year">Yearly' + (save > 0 ? ' <span class="sv-plans-save">Save ' + save + '%</span>' : '') + '</button></div>'
        + '<div class="sv-plans-grid"></div>'
        + '</div>'
        + (safeUrl(loginHref) ? '<div class="sv-plans-login">Already have an account? <a href="' + safeUrl(loginHref) + '">Log in</a></div>' : '');
      const setPeriod = (period) => {
        box.setAttribute('data-period', period);
        box.querySelector('.sv-plans-grid').innerHTML = renderPlanCards(groups, period);
        Array.from(box.querySelectorAll('.sv-plans-switch button')).forEach((b) => {
          const on = b.getAttribute('data-period') === period;
          b.classList.toggle('sv-plans-on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      };
      box.addEventListener('click', (e) => {
        const t = e.target.closest && e.target.closest('.sv-plans-toggle');
        if (t) {
          const more = box.querySelector('.sv-plans-more');
          more.hidden = !more.hidden;
          t.setAttribute('aria-expanded', more.hidden ? 'false' : 'true');
          return;
        }
        const b = e.target.closest && e.target.closest('.sv-plans-switch button');
        if (b) setPeriod(b.getAttribute('data-period'));
      });
      lock.insertBefore(box, lock.firstChild);
      setPeriod('year');
    } else if (box.parentNode !== lock || lock.firstChild !== box) {
      lock.insertBefore(box, lock.firstChild);
    }
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

      // A free member (not enrolled) has no native Complete button, so completion is kept in our own
      // table. Signed-out visitors get none: ticking a lesson needs an account.
      const ownMode = !nativeComplete && !isSignedOutPage();
      // The lesson's real id comes from the course list by its address (the page itself does not
      // expose it to a free member), so every lesson keeps its own tick.
      const ownSlug = lessonSlugFromUrl();
      if (ownMode && ownSlug) {
        const ownId = _ownIdBySlug[ownSlug];
        if (ownId && _ownDone.has(ownId)) isCompleted = true;
        else if (!_ownChecked.has(ownSlug)) {
          _ownChecked.add(ownSlug);
          resolveLessonIdBySlug(ownSlug).then(async (id) => {
            const uid = await ensureAuth();
            if (!id || !uid) return;
            const r = await supabase.from('lesson_completions').select('lesson_id').eq('user_id', uid).eq('lesson_id', id);
            if (r && r.data && r.data.length) _ownDone.add(id);
          }).catch(() => {}).then(() => { _ownResolved.add(ownSlug); scheduleMountUI(); });
        }
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
      } else if (!isCompleted && (nativeComplete || (ownMode && (!ownSlug || _ownResolved.has(ownSlug))))) {
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
          if (ownMode) {
            resolveLessonIdBySlug(ownSlug).then((id) => {
              if (!id) return; // never guess an id: a wrong one would tick another lesson
              _ownDone.add(id);
              scheduleMountUI();
              celebrateLessonCompletion(id).then(async (r) => {
                if (r !== 'onboarding') return;
                const step = celebrationNextStep({ completedId: id, currentId: id, course: await getCourse() });
                if (step.action === 'advance') navigateTo(step.url);
              });
            });
            return;
          }
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

  // Free first: people get into the lessons with a free account and only meet the paywall
  // at the first lesson they have not been given. No lesson count is ever printed in the copy.
  const SIGNUP_URL = 'https://speakshona.com/pinda';
  const isSignedOutPage = () => !!document.querySelector('.fcom_login_btn');
  const dashCacheKey = () => 'sv_dash_' + (isSignedOutPage() ? 'out' : 'in');

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
      url: `${portal}/course/${course.slug || COURSE_SLUG}/lessons/${l.slug}/view`,
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
          id: json.course && json.course.id,
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

    // Lesson pages open slowly: answer the click straight away so it never looks like it did nothing.
    banner.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = e.target.closest && e.target.closest('a.sv-dash-lesson-card, a.sv-dash-lesson-btn');
      if (!a || a.classList.contains('sv-dash-opening')) return;
      a.classList.add('sv-dash-opening');
      const label = a.classList.contains('sv-dash-lesson-card') ? a.querySelector('.sv-dash-lesson-go') : a;
      if (label) label.textContent = 'Opening…';
    });

    renderFeedDashboardContent(banner);
  }

  async function renderFeedDashboardContent(banner) {
    // Slow connection: show what this browser showed last time straight away, then refresh it.
    let cached = '';
    try { cached = localStorage.getItem(dashCacheKey()) || ''; } catch (e) { cached = ''; }
    banner.innerHTML = cached || '<div style="text-align:center; padding:20px 0; color:var(--sv-text-muted);">Loading your progress...</div>';

    const uid = await ensureAuth();
    const [course, , completionsRes] = await Promise.all([
      getCourse(),
      loadLessonsManifest(),
      // Signed out: nothing to look up (user_id is a uuid, so querying with null is an error)
      uid ? supabase.from('lesson_completions').select('lesson_id, completed_at').eq('user_id', uid) : { data: [], error: null },
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
    syncOwnCompletions(course, courseRows);
    const onboardingIds = new Set(courseLessons.filter(isOnboardingLesson).map((l) => String(l.id)));
    const completedIds = course ? Array.from(new Set(course.completedIds.concat(courseRows.map((r) => String(r.lesson_id))))) : courseRows.map((r) => r.lesson_id);
    // Onboarding still counts as 'done' when finding the next lesson, but not in the ✓ total.
    const countedIds = completedIds.filter((id) => !onboardingIds.has(String(id)));
    const completedDates = courseRows.map((r) => r.completed_at);

    const streak = calculateStreak(completedDates);
    const completedCount = getTotalCompletedCount(countedIds);
    const openLessons = courseLessons.filter((l) => isLessonPublished(l, _lessonsManifest));
    const currentLesson = getCurrentLesson(openLessons, completedIds);
    // always the /lessons page: the bare course address renders blank for visitors who are signed out
    const courseUrl = FEED_DASHBOARD_COURSE_URL;
    const svIconCheck = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
    const svIconFlame = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1 1 2 2.5 2 4.5A5.5 5.5 0 0 1 6 14c0-5 4-6 6-12z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path></svg>`;
    const svIconMap = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><path d="M9 3v16M15 5v16" stroke="currentColor" stroke-width="1.8"></path></svg>`;

    let lessonCard;
    if (isSignedOutPage()) {
      // Signed out: straight to a free account, then on to the first lesson (no paywall yet)
      const first = currentLesson || openLessons[0] || courseLessons[0];
      const startUrl = SIGNUP_URL + '?redirect_to=' + encodeURIComponent(first ? first.url : FEED_DASHBOARD_COURSE_URL);
      lessonCard = `
        <div class="sv-dash-lesson-card">
          <div class="sv-dash-lesson-eyebrow">Start here</div>
          <div class="sv-dash-lesson-title">Daily Shona Lessons</div>
          <p class="sv-dash-lesson-sub">Ten minutes a day. Make a free account to begin.</p>
          <a class="sv-dash-lesson-btn" href="${safeUrl(startUrl)}">Start your first lesson</a>
        </div>
      `;
    } else if (course && !course.isEnrolled && !(uid && courseLessons.length)) {
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

    // Signed out there is nothing to count yet: no ticks, flame or map, just the start card.
    const statsHtml = isSignedOutPage() ? '' : `
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
      </div>`;

    banner.innerHTML = `
      ${statsHtml}
      ${lessonCard}
      ${monthHtml}
    `;
    try { localStorage.setItem(dashCacheKey(), banner.innerHTML); } catch (e) { /* private window etc. */ }
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
    module.exports = { _setNavigate, celebrationNextStep, zuvaNumberForPage, lessonProgress, celebrateLessonCompletion, syncOwnCompletions, resolveLessonIdBySlug, ensureAuth, emailFromToken, completedZuvas, withDoneZuvas, withMemberToken, cleanLessonTitle, lessonEyebrow, mountLessonHeader, renderOnboardingHtml, renderMissionHtml, isOnboardingLesson, isLessonPublished, nextArrivalText, lessonProgress, pickAffirmation, AFFIRMATIONS, styleLessonContent, showCelebrationModal, escHtml, safeUrl, findZuvaForUrl, zuvaFromTitle, findLessonEntry, renderPhraseBankHtml, mountPhraseBank, _setLessonsManifest, flattenCourseLessons, getCourse, renderLatestMissionsHtml, getLessonId, getUserInfo, mountUI, mountPaywall, readPaywallPlans, planGroups, mountLiveClasses, zonedInstant, nextLiveSession, renderLiveCard, renderLiveRecordings, formatCountdown, LIVE_CLASSES_DEFAULT, isEnrolledIn, ENROLLED_ONLY_NAME, liveLocalLabel, liveZone, detectedZone, LIVE_ZONES, mountSidebar, mountSpaceTabs, getSpaceSlug, SPACE_TABS, scheduleMountUI, getLessonNumber, getCourseProgress, calculateStreak, getTotalLessonCount, getWeekCompletionMap, getMonthCompletionMap, getTotalCompletedCount, getCurrentLesson, filterCompletionsForCourse, FEED_DASHBOARD_LESSONS };
  }
})();

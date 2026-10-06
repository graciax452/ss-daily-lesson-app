import { describe, it, expect, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

// Lesson pages get their phrase bank + mazwi button from mazwi.app/lessons.json; Home gets the
// current lesson from FluentCommunity's own REST API (courses/shona-lessons/by-slug).

const MANIFEST = [
  { zuva: 0, week: 0, type: 'onboarding', title: 'Mauya! Start Here', slug: 'zuva-00', recycled: [], tip: '', new: [] },
  { zuva: 1, week: 1, type: 'lesson', title: 'Ehe, kwete, handei!', slug: 'zuva-01', recycled: [], tip: 'Shona loves doubling up', mission: "Write today's words in your notebook.", bonus: 'Answer someone in Shona today.',
    new: [{ shona: 'ehe', english: 'yes' }, { shona: 'kwete', english: 'no' }] },
  { zuva: 2, week: 1, type: 'lesson', title: 'Hesi, mhoro, mhoroi', slug: 'zuva-02', recycled: ['ehe', 'kwete'], tip: '',
    new: [{ shona: 'hesi', english: 'hi (peer register)' }] },
];

const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 6; i++) await tick(); }

afterEach(() => {
  delete window.fluentComAdmin;
  delete globalThis.fetch;
});

describe('which Zuva a lesson page is', () => {
  it('reads the number from "Zuva N" and from the older "Day N" stub titles', () => {
    const { zuvaFromTitle } = loadApp();
    expect(zuvaFromTitle('Zuva 2 · Hesi, mhoro, mhoroi')).toBe(2);
    expect(zuvaFromTitle('Day 1')).toBe(1);
    expect(zuvaFromTitle('Day 2 (Copy)')).toBe(2);
    expect(zuvaFromTitle('How to learn Shona')).toBeNull();
  });

  it('falls back to an exact title match', () => {
    const { findLessonEntry } = loadApp();
    expect(findLessonEntry(MANIFEST, { title: 'hesi, mhoro, mhoroi' }).zuva).toBe(2);
    expect(findLessonEntry(MANIFEST, { title: 'Something else' })).toBeNull();
  });
});

describe('lesson header', () => {
  it('turns "Zuva 3 — 🔊 Five Clean Vowels" into a clean title', () => {
    const { cleanLessonTitle } = loadApp();
    expect(cleanLessonTitle('Zuva 3 — 🔊 Five Clean Vowels')).toBe('Five Clean Vowels');
    expect(cleanLessonTitle('Day 2')).toBe('');
    expect(cleanLessonTitle('Zuva 2 - Hesi, Mhoro, Mhoroi')).toBe('Hesi, Mhoro, Mhoroi');
  });

  it('labels lessons by type', () => {
    const { lessonEyebrow } = loadApp();
    expect(lessonEyebrow({ zuva: 2, week: 1, type: 'lesson' })).toBe('Zuva 2 · Week 1');
    expect(lessonEyebrow({ zuva: 3, week: 1, type: 'sound' })).toContain('Sounds');
    expect(lessonEyebrow({ zuva: 7, week: 1, type: 'special' })).toContain('Special Mission');
    expect(lessonEyebrow({ zuva: 0, week: 0, type: 'onboarding' })).toBe('Start here');
  });

  it('mounts once and hides the native title, keeping the Edit Lesson link', () => {
    const { mountLessonHeader, _setLessonsManifest } = loadApp({ fixture: 'full-lesson-page' });
    _setLessonsManifest(MANIFEST.map((l) => ({ ...l, chapter: l.week ? 'presence & respect' : '' })));
    document.querySelector('.fcom_lesson_title h1').textContent = 'Zuva 2 — Hesi, Mhoro, Mhoroi';
    mountLessonHeader();
    mountLessonHeader();
    expect(document.querySelectorAll('#sv-lesson-header').length).toBe(1);
    const header = document.getElementById('sv-lesson-header');
    expect(header.textContent).toContain('Hesi, Mhoro, Mhoroi');
    expect(header.textContent).toContain('presence & respect');
    expect(document.querySelector('.fcom_lesson_title').classList.contains('sv-has-header')).toBe(true);
    expect(document.querySelector('.fcom_lesson_number a')).not.toBeNull();
  });
});

describe('phrase bank', () => {
  it('lists recycled, today\'s new and the tip, and links the mazwi button to the Zuva deck', () => {
    const { renderPhraseBankHtml } = loadApp();
    const html = renderPhraseBankHtml(MANIFEST[2]);
    expect(html).toContain('Words from previous lessons');
    expect(html).toContain('hesi');
    expect(html).toContain('https://mazwi.app/deck/zuva-02');
  });

  it('labels the tip Grammar or Sound pattern and allows **bold** only', () => {
    const { renderPhraseBankHtml } = loadApp();
    expect(renderPhraseBankHtml({ zuva: 2, type: 'lesson', tip: '**Register.** add -i', new: [] })).toContain('Grammar pattern');
    const sound = renderPhraseBankHtml({ zuva: 3, type: 'sound', tip: 'five <b>vowels</b>', new: [] });
    expect(sound).toContain('Sound pattern');
    expect(sound).not.toContain('<b>');
    expect(renderPhraseBankHtml({ zuva: 2, tip: '**Register.** x', new: [] })).toContain('<strong>Register.</strong>');
  });

  it('renders nothing for a lesson with no words or tip (onboarding)', () => {
    const { renderPhraseBankHtml } = loadApp();
    expect(renderPhraseBankHtml(MANIFEST[0])).toBe('');
  });

  it('escapes data from the manifest', () => {
    const { renderPhraseBankHtml } = loadApp();
    const html = renderPhraseBankHtml({ zuva: 9, new: [{ shona: '<img src=x onerror=alert(1)>', english: 'x' }] });
    expect(html).not.toContain('<img src=x'); // the member-supplied markup, not our own icon
  });

  it('mounts right under the lesson video, once, on a "Day N" page', () => {
    const { mountPhraseBank, _setLessonsManifest } = loadApp({ fixture: 'full-lesson-page' });
    _setLessonsManifest(MANIFEST);
    document.querySelector('.fcom_lesson_title h1').textContent = 'Day 1';
    const body = document.querySelector('.fcom_lesson_content');
    const video = document.createElement('figure');
    video.innerHTML = '<iframe src="https://www.youtube.com/embed/x"></iframe>';
    body.insertBefore(video, body.firstChild);

    mountPhraseBank(body);
    const block = document.getElementById('sv-phrasebank');
    expect(block).not.toBeNull();
    expect(video.nextElementSibling).toBe(block);
    expect(block.textContent).toContain('kwete');

    mountPhraseBank(body); // re-mount (MutationObserver) must not re-render
    expect(document.getElementById('sv-phrasebank')).toBe(block);
    expect(document.querySelectorAll('#sv-phrasebank').length).toBe(1);
  });

  it('adds the Basa ranhasi card from the lesson data right after the phrase bank, once', () => {
    const { mountPhraseBank, _setLessonsManifest } = loadApp({ fixture: 'full-lesson-page' });
    _setLessonsManifest(MANIFEST);
    document.querySelector('.fcom_lesson_title h1').textContent = 'Zuva 1 — Ehe, Kwete, Handei!';
    const body = document.querySelector('.fcom_lesson_content');
    mountPhraseBank(body);
    mountPhraseBank(body);
    const cards = document.querySelectorAll('#sv-lesson-mission');
    expect(cards.length).toBe(1);
    expect(cards[0].previousElementSibling.id).toBe('sv-phrasebank');
    expect(cards[0].textContent).toContain('Basa ranhasi');
    expect(cards[0].textContent).toContain('Bonus:');
  });

  it('escapes mission text', () => {
    const { renderMissionHtml } = loadApp();
    expect(renderMissionHtml({ zuva: 1, mission: '<script>x</script>' })).not.toContain('<script>');
    expect(renderMissionHtml({ zuva: 1, mission: '' })).toBe('');
  });

  it('builds the Zuva 0 onboarding page (steps + first mission), once', () => {
    const { mountPhraseBank, _setLessonsManifest } = loadApp({ fixture: 'full-lesson-page' });
    _setLessonsManifest(MANIFEST);
    document.querySelector('.fcom_lesson_title h1').textContent = 'Zuva 0 — Mauya! Zuva nezuva (Onboarding)';
    const body = document.querySelector('.fcom_lesson_content');
    mountPhraseBank(body);
    mountPhraseBank(body);
    expect(document.querySelectorAll('.sv-onboarding').length).toBe(1);
    expect(document.querySelector('.sv-onboarding').textContent).toContain('How every Zuva works');
    expect(document.querySelectorAll('#sv-lesson-mission').length).toBe(1);
    expect(document.getElementById('sv-lesson-mission').textContent).toContain('Your first mission');
  });

  it('shows nothing on a page that is not a Zuva lesson', () => {
    const { mountPhraseBank, _setLessonsManifest } = loadApp({ fixture: 'full-lesson-page' });
    _setLessonsManifest(MANIFEST);
    mountPhraseBank(document.querySelector('.fcom_lesson_content')); // title: "How to learn Shona"
    expect(document.getElementById('sv-phrasebank')).toBeNull();
  });
});

function mockCourse({ enrolled = true, completed = [] } = {}) {
  window.fluentComAdmin = {
    rest: { url: 'https://speakshona.com/wp-json/fluent-community/v2', nonce: 'n' },
    portal_url: 'https://speakshona.com/shonaverse',
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      course: { slug: 'shona-lessons' },
      sections: [
        { title: 'Onboarding', lessons: [{ id: 10, title: 'Mauya! Start Here', slug: 'mauya' }] },
        { title: 'Week 1', lessons: [{ id: 11, title: 'Day 1', slug: 'day-1' }, { id: 12, title: 'Day 2', slug: 'day-2' }] },
      ],
      track: { completed_lessons: completed, isEnrolled: enrolled, progress: 0 },
    }),
  });
}

describe('Home: current lesson from FluentCommunity', () => {
  it('shows the first lesson not yet completed, linked to its page; onboarding does not count in the ✓ total', async () => {
    mockCourse({ completed: ['10', '11'] });
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await settle();
    const banner = document.getElementById('sv-feed-dashboard');
    expect(banner.textContent).toContain("Today's lesson");
    expect(banner.textContent).toContain('Day 2');
    // the whole card is the link — no separate button
    expect(banner.querySelector('a.sv-dash-lesson-card').getAttribute('href'))
      .toBe('https://speakshona.com/shonaverse/course/shona-lessons/lessons/day-2/view');
    const stats = Array.from(document.querySelectorAll('.sv-dash-stat-value')).map((el) => el.textContent);
    expect(stats[0]).toBe('1'); // lesson 11 only — onboarding (10) is excluded
  });

  it('once a learner has a completion, shows one small square per day of the month (no big calendar)', async () => {
    mockCourse({ completed: ['11'] });
    const { mountUI } = loadApp({
      fixture: 'feed-page',
      bodyAttrs: { 'data-route': 'all_feeds' },
      supabaseOverrides: { selectResult: { data: [{ lesson_id: '11', completed_at: new Date().toISOString() }], error: null } },
    });
    mountUI();
    await settle();
    const banner = document.getElementById('sv-feed-dashboard');
    const now = new Date();
    const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
    expect(banner.querySelectorAll('.sv-dash-sq').length).toBe(daysInMonth);
    expect(banner.querySelector('.sv-dash-cal')).toBeNull();
  });

  it('shows a start card instead when the member is not enrolled', async () => {
    mockCourse({ enrolled: false });
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await settle();
    const banner = document.getElementById('sv-feed-dashboard');
    expect(banner.textContent).toContain('Start the course');
    expect(banner.textContent).not.toContain("Today's lesson");
  });

  it('regression: the Start the course button opens the /lessons page (the bare course address is blank for signed-out visitors)', async () => {
    mockCourse({ enrolled: false });
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await settle();
    const btn = Array.from(document.querySelectorAll('#sv-feed-dashboard a')).find((a) => a.textContent.trim() === 'Start the course');
    expect(btn.getAttribute('href')).toMatch(/\/course\/shona-lessons\/lessons$/);
  });

  it('shows "all caught up" once every lesson is completed', async () => {
    mockCourse({ completed: ['10', '11', '12'] });
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await settle();
    expect(document.getElementById('sv-feed-dashboard').textContent).toContain('All caught up');
  });
});

describe('Home: latest missions', () => {
  it('escapes member text, labels the lesson, and links to it', () => {
    const { renderLatestMissionsHtml } = loadApp();
    const html = renderLatestMissionsHtml(
      [{ user_name: 'Rudo', lesson_id: '12', memo: '<b>hi</b>', media_url: 'javascript:alert(1)', media_type: 'image' }],
      { 12: { id: '12', title: 'Day 2', url: 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/day-2' } },
    );
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Day 2');
    expect(html).toContain('href="https://speakshona.com/shonaverse/course/shona-lessons/lessons/day-2"');
  });

  it('mounts once, above Recent Activities', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    const side = document.createElement('div');
    side.className = 'fcom_side_box';
    side.innerHTML = '<div class="app_side_widget widget_recent_activities"><div class="widget_header"><h3>Recent Activities</h3></div></div>';
    document.body.appendChild(side);
    mountUI();
    mountUI();
    await settle();
    const boxes = document.querySelectorAll('#sv-latest-missions');
    expect(boxes.length).toBe(1);
    expect(boxes[0].nextElementSibling.classList.contains('widget_recent_activities')).toBe(true);
  });
});

describe('Home: lesson card thumbnail (D1)', () => {
  it("shows the lesson's YouTube thumbnail when mazwi's lessons.json has a video id, and none when it doesn't", async () => {
    mockCourse({ completed: ['10', '11'] });
    const { mountUI, _setLessonsManifest } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    _setLessonsManifest([{ zuva: 2, title: 'Day 2', fc_url: 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/day-2', video: 'wNPpqto7CYc' }]);
    mountUI();
    await settle();
    const img = document.querySelector('#sv-feed-dashboard .sv-dash-lesson-thumb');
    expect(img.getAttribute('src')).toBe('https://i.ytimg.com/vi/wNPpqto7CYc/maxresdefault.jpg'); // sharp one first
    expect(img.getAttribute('onerror')).toContain('hqdefault.jpg'); // hq if a video has no maxres
  });

  it('shows no thumbnail without a video id (and rejects a malformed one)', async () => {
    mockCourse({ completed: ['10', '11'] });
    const { mountUI, _setLessonsManifest } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    _setLessonsManifest([{ zuva: 2, title: 'Day 2', fc_url: 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/day-2', video: '"><script>' }]);
    mountUI();
    await settle();
    expect(document.querySelector('#sv-feed-dashboard .sv-dash-lesson-thumb')).toBeNull();
  });
});

describe('Home: only published lessons, clean title (D1)', () => {
  const day2 = 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/day-2';

  it('never sends a learner to a lesson FluentCommunity has not published (draft)', async () => {
    mockCourse({ completed: ['10', '11'] });
    // mark lesson 12 (Day 2) as a draft in the course response
    const orig = globalThis.fetch;
    globalThis.fetch = async (...a) => {
      const res = await orig(...a);
      const json = await res.json();
      json.sections.forEach((sec) => sec.lessons.forEach((l) => { if (l.id === 12) l.status = 'draft'; }));
      return { ok: true, json: async () => json };
    };
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await settle();
    const banner = document.getElementById('sv-feed-dashboard');
    expect(banner.textContent).toContain('All caught up');
    expect(banner.textContent).toContain('completed every published lesson');
    expect(banner.textContent).toContain('New lessons are coming soon');
    expect(banner.querySelector('a.sv-dash-lesson-card')).toBeNull();
  });

  it("says when the next lesson arrives (tomorrow) once every open lesson is done", async () => {
    mockCourse({ completed: ['10', '11'] });
    const t = new Date(); t.setDate(t.getDate() + 1);
    const tomorrow = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    const { mountUI, _setLessonsManifest } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    _setLessonsManifest([{ zuva: 2, type: 'lesson', title: 'Day 2', fc_url: day2, publish_date: tomorrow }]);
    mountUI();
    await settle();
    const banner = document.getElementById('sv-feed-dashboard');
    expect(banner.textContent).toContain('Your next lesson arrives tomorrow');
    expect(banner.querySelector('a.sv-dash-lesson-card')).toBeNull();
  });

  it('shows the clean lesson name with Zuva in the eyebrow (no "Zuva 3 — 🔊" in the title)', async () => {
    const { cleanLessonTitle } = loadApp();
    expect(cleanLessonTitle('Zuva 3 — 🔊 Five Clean Vowels')).toBe('Five Clean Vowels');
  });

  it('shows the month squares once a lesson is completed, even when the completion is only in FluentCommunity', async () => {
    mockCourse({ completed: ['11'] });
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } }); // no supabase rows
    mountUI();
    await settle();
    expect(document.querySelectorAll('#sv-feed-dashboard .sv-dash-sq').length).toBeGreaterThan(27);
  });
});

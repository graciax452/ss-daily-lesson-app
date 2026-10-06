import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

// A free member = signed in, NOT enrolled in the course. FluentCommunity shows them no Complete
// button, so we supply our own and keep the record in our own table. These tests drive the whole
// flow: mark, celebrate, move on, refresh, and the Home numbers. The database is a small in-memory
// store, so "refresh" really means loading the app again against what was saved.

const LESSONS = [
  { id: 126, slug: 'day-0', title: 'Zuva 0 — Mauya! Zuva nezuva (Onboarding)', section: 'Onboarding' },
  { id: 128, slug: 'day-1', title: 'Zuva 1 — Ehe, Kwete, Handei!', section: 'Week 1' },
  { id: 130, slug: 'day-2', title: 'Zuva 2 — Hesi, Mhoro, Mhoroi', section: 'Week 1' },
  { id: 131, slug: 'day-3', title: 'Zuva 3 — Five Clean Vowels', section: 'Week 1' },
];
const BASE = 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/';
const SIGNED_IN = { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'free@example.com' } } } }) };

// scheduleMountUI re-renders after a 150 ms debounce, so wait a little longer than that
const settle = async () => { await new Promise((r) => setTimeout(r, 220)); };

function mockCourse({ enrolled = false } = {}) {
  window.fluentComAdmin = {
    rest: { url: 'https://speakshona.com/wp-json/fluent-community/v2', nonce: 'n' },
    portal_url: 'https://speakshona.com/shonaverse',
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      course: { id: 24, slug: 'shona-lessons' },
      sections: [
        { title: 'Onboarding', lessons: [LESSONS[0]] },
        { title: 'Week 1', lessons: LESSONS.slice(1) },
      ],
      track: { completed_lessons: [], isEnrolled: enrolled, progress: 0 },
    }),
  });
}

// Opens a lesson page as a free member against a shared store.
function openLesson(slug, store, { signedIn = true } = {}) {
  history.pushState({}, '', '/shonaverse/course/shona-lessons/lessons/' + slug + '/view');
  mockCourse();
  const app = loadApp({
    fixture: 'full-lesson-page',
    supabaseOverrides: { store, auth: signedIn ? SIGNED_IN : undefined },
  });
  document.querySelector('.fcom_back_space .fcom_lesson_nav .el-button--info')?.remove(); // no native Complete
  const lesson = LESSONS.find((l) => l.slug === slug);
  document.querySelector('.fcom_lesson_title h1').textContent = lesson.title;
  if (!signedIn) document.body.insertAdjacentHTML('beforeend', '<a class="fcom_login_btn" href="https://speakshona.com/pinda"></a>');
  app.mountUI();
  document.querySelector('button[aria-label="Next lesson"]')?.addEventListener('click', () => { nextClicks += 1; });
  return app;
}

const markBtn = () => document.getElementById('sv-trigger-complete-btn');
// a finished lesson shows "Lesson Completed", or "Complete →" (go on) when a next lesson exists
const doneBtn = () => document.querySelector('#shonaverse-lesson-actions .sv-btn-done, #shonaverse-lesson-actions .sv-btn-next');
const modal = () => document.getElementById('sv-celebration-modal-wrap');
const savedIds = (store) => (store.lesson_completions || []).map((r) => String(r.lesson_id)).sort();

// Each loadApp() starts timers and observers that would keep running against the next test's page
// (production has one app instance; tests make many). Track them and stop them after every test.
let gone;
let nextClicks = 0; // times FluentCommunity's own "Next lesson" button was pressed (the page moving on without a reload)
let stops = [];
beforeEach(() => {
  gone = [];
  nextClicks = 0;
  const realInterval = globalThis.setInterval;
  const realTimeout = globalThis.setTimeout;
  const RealMO = globalThis.MutationObserver;
  globalThis.setInterval = (...args) => { const id = realInterval(...args); stops.push(() => clearInterval(id)); return id; };
  globalThis.setTimeout = (...args) => { const id = realTimeout(...args); stops.push(() => clearTimeout(id)); return id; };
  globalThis.MutationObserver = class extends RealMO {
    constructor(cb) { super(cb); stops.push(() => this.disconnect()); }
  };
  stops.push(() => { globalThis.setInterval = realInterval; globalThis.setTimeout = realTimeout; globalThis.MutationObserver = RealMO; });
});
afterEach(() => {
  stops.reverse().forEach((stop) => stop());
  stops = [];
  localStorage.clear();
});

describe('free member marks a lesson complete', () => {
  it('offers Mark Lesson Complete on a fresh lesson (after the quick "already done?" check)', async () => {
    const store = {};
    openLesson('day-1', store);
    await settle();
    expect(markBtn()).not.toBeNull();
    expect(doneBtn()).toBeNull();
  });

  it('saves exactly that lesson (its real id) and nothing else, then celebrates it as its own Zuva', async () => {
    const store = {};
    const app = openLesson('day-1', store);
    app._setNavigate((u) => gone.push(u));
    await settle();
    markBtn().click();
    await settle();

    expect(savedIds(store)).toEqual(['128']);
    expect(modal().classList.contains('is-active')).toBe(true);
    expect(modal().textContent).toContain('Zuva 1 complete!');
  });

  it("completing moves the page on by itself (no reload) and the celebration's button only closes", async () => {
    const store = {};
    const app = openLesson('day-1', store);
    app._setNavigate((u) => gone.push(u));
    await settle();
    markBtn().click();
    await settle();
    expect(nextClicks).toBe(1); // moved on once, through the page's own Next button
    document.getElementById('sv-celebration-continue').click();
    expect(nextClicks).toBe(1); // closing the celebration does not move on again (that skipped a lesson)
    expect(gone).toEqual([]);   // and never reloads the page
    expect(modal().classList.contains('is-active')).toBe(false);
  });

  it('after a refresh the lesson stays "Lesson Completed" and "Mark Lesson Complete" never flashes', async () => {
    const store = {};
    openLesson('day-1', store);
    await settle();
    markBtn().click();
    await settle();

    const seen = [];
    openLesson('day-1', store); // the refresh
    const watch = new MutationObserver(() => seen.push(!!markBtn()));
    watch.observe(document.body, { childList: true, subtree: true });
    seen.push(!!markBtn());
    await settle();
    watch.disconnect();

    expect(seen.every((flashed) => flashed === false)).toBe(true);
    expect(doneBtn()).not.toBeNull();
    expect(markBtn()).toBeNull();
  });

  it('marking one lesson does not tick any other (regression: Zuva 0 once ticked everything)', async () => {
    const store = {};
    openLesson('day-1', store);
    await settle();
    markBtn().click();
    await settle();

    openLesson('day-2', store);
    await settle();
    expect(markBtn()).not.toBeNull();
    expect(doneBtn()).toBeNull();
    openLesson('day-0', store);
    await settle();
    expect(markBtn()).not.toBeNull();
  });
});

describe('Zuva 0 (onboarding)', () => {
  it('is saved but not celebrated, and moves straight on to Zuva 1', async () => {
    const store = {};
    const app = openLesson('day-0', store);
    app._setNavigate((u) => gone.push(u));
    await settle();
    markBtn().click();
    await settle();

    expect(savedIds(store)).toEqual(['126']);
    expect(modal()).toBeNull();
    expect(nextClicks).toBe(1);
    expect(gone).toEqual([]);
  });
});

describe('when the page has already moved on', () => {
  it('Next only closes the celebration (it must not skip a lesson)', async () => {
    const store = {};
    const app = openLesson('day-1', store);
    app._setNavigate((u) => gone.push(u));
    await settle();
    // FluentCommunity advanced to Zuva 2 by itself before the celebration appeared
    history.pushState({}, '', '/shonaverse/course/shona-lessons/lessons/day-2/view');
    await app.celebrateLessonCompletion('128');
    expect(modal().textContent).toContain('Zuva 1 complete!');
    const btn = document.getElementById('sv-celebration-continue');
    expect(btn.textContent).toContain('Keep going');
    btn.click();
    expect(gone).toEqual([]);
    expect(modal().classList.contains('is-active')).toBe(false);
  });
});

describe('signed out', () => {
  it('gets no complete button (ticking a lesson needs an account)', async () => {
    openLesson('day-1', {}, { signedIn: false });
    await settle();
    expect(markBtn()).toBeNull();
  });
});

describe('Home for a free member', () => {
  it('counts their completed lessons (onboarding excluded) and offers the next lesson', async () => {
    const store = {
      lesson_completions: [
        { user_id: 'u1', lesson_id: '126', completed_at: new Date().toISOString() },
        { user_id: 'u1', lesson_id: '128', completed_at: new Date().toISOString() },
      ],
    };
    mockCourse();
    const app = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' }, supabaseOverrides: { store, auth: SIGNED_IN } });
    app.mountUI();
    await settle();
    const stats = Array.from(document.querySelectorAll('.sv-dash-stat-value')).map((e) => e.textContent);
    expect(stats[0]).toBe('1');
    const card = document.querySelector('#sv-feed-dashboard a.sv-dash-lesson-card');
    expect(card.getAttribute('href')).toBe(BASE + 'day-2/view');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

// Step 2 of the free-member work: the person joins (gets enrolled). What they did as a free member
// must still count, and FluentCommunity (which has no ticks for them) must be told. Written before
// the code; the database is the same in-memory store as free-member-flow.test.js.

const LESSONS = [
  { id: 126, slug: 'day-0', title: 'Zuva 0 — Mauya! Zuva nezuva (Onboarding)', section: 'Onboarding' },
  { id: 128, slug: 'day-1', title: 'Zuva 1 — Ehe, Kwete, Handei!', section: 'Week 1' },
  { id: 130, slug: 'day-2', title: 'Zuva 2 — Hesi, Mhoro, Mhoroi', section: 'Week 1' },
  { id: 131, slug: 'day-3', title: 'Zuva 3 — Five Clean Vowels', section: 'Week 1' },
];
const REST = 'https://speakshona.com/wp-json/fluent-community/v2';
const SIGNED_IN = { getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'member@example.com' } } } }) };
const row = (id) => ({ user_id: 'u1', lesson_id: String(id), completed_at: new Date().toISOString() });

// scheduleMountUI re-renders after a 150 ms debounce, so wait a little longer than that
const settle = async () => { await new Promise((r) => setTimeout(r, 220)); };

let puts;
let nextClicks;
let stops = [];
beforeEach(() => {
  puts = [];
  nextClicks = 0;
  const realInterval = globalThis.setInterval;
  const realTimeout = globalThis.setTimeout;
  const RealMO = globalThis.MutationObserver;
  globalThis.setInterval = (...a) => { const id = realInterval(...a); stops.push(() => clearInterval(id)); return id; };
  globalThis.setTimeout = (...a) => { const id = realTimeout(...a); stops.push(() => clearTimeout(id)); return id; };
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

// FluentCommunity as an ENROLLED student sees it: it already ticked `fcDone`, and records every PUT.
function mockCourse({ enrolled = true, fcDone = [], putStatus = 200 } = {}) {
  window.fluentComAdmin = { rest: { url: REST, nonce: 'n' }, portal_url: 'https://speakshona.com/shonaverse' };
  globalThis.fetch = async (url, opts) => {
    if (opts && opts.method === 'PUT') {
      puts.push(url.replace(REST, ''));
      return { ok: putStatus < 400, status: putStatus, json: async () => ({}) };
    }
    return {
      ok: true,
      json: async () => ({
        course: { id: 24, slug: 'shona-lessons' },
        sections: [{ title: 'Onboarding', lessons: [LESSONS[0]] }, { title: 'Week 1', lessons: LESSONS.slice(1) }],
        track: { completed_lessons: fcDone.map(String), isEnrolled: enrolled, progress: 0 },
      }),
    };
  };
}

function openHome(store, opts) {
  mockCourse(opts);
  const app = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' }, supabaseOverrides: { store, auth: SIGNED_IN } });
  app.mountUI();
  return app;
}

// An enrolled student's lesson page: FluentCommunity's own Complete button IS there.
function openLesson(slug, store, opts) {
  history.pushState({}, '', '/shonaverse/course/shona-lessons/lessons/' + slug + '/view');
  mockCourse(opts);
  const app = loadApp({ fixture: 'full-lesson-page', supabaseOverrides: { store, auth: SIGNED_IN } });
  document.querySelector('.fcom_lesson_title h1').textContent = LESSONS.find((l) => l.slug === slug).title;
  app.mountUI();
  document.querySelector('button[aria-label="Next lesson"]')?.addEventListener('click', () => { nextClicks += 1; });
  return app;
}

describe('joining: lessons done as a free member are ticked in FluentCommunity', () => {
  it('on Home, ticks only the lessons FluentCommunity does not know about (once each)', async () => {
    const store = { lesson_completions: [row(126), row(128), row(130), row(999)] }; // 999 = another course
    openHome(store, { fcDone: [128] });
    await settle();
    expect(puts.sort()).toEqual(['/courses/24/lessons/126/completion', '/courses/24/lessons/130/completion']);
    // coming back to Home again in the same visit must not repeat them
    const before = puts.length;
    await settle();
    expect(puts.length).toBe(before);
  });

  it('also ticks them when the first page they open is a lesson, not Home', async () => {
    const store = { lesson_completions: [row(130)] };
    openLesson('day-2', store, { fcDone: [] });
    await settle();
    expect(puts).toEqual(['/courses/24/lessons/130/completion']);
  });

  it('a lesson done as a free member shows as done on its page (no "Mark Lesson Complete")', async () => {
    const store = { lesson_completions: [row(130)] };
    openLesson('day-2', store, { fcDone: [] });
    await settle();
    expect(document.getElementById('sv-trigger-complete-btn')).toBeNull();
  });

  it('Home still works when FluentCommunity refuses the tick (nothing breaks, nothing is lost)', async () => {
    const store = { lesson_completions: [row(130)] };
    openHome(store, { fcDone: [], putStatus: 403 });
    await settle();
    expect(document.querySelector('#sv-feed-dashboard .sv-dash-lesson-card')).not.toBeNull();
    expect(store.lesson_completions.length).toBe(1); // our own record is never deleted
  });

  it('never ticks anything for someone who is not enrolled', async () => {
    const store = { lesson_completions: [row(128), row(130)] };
    openHome(store, { enrolled: false });
    await settle();
    expect(puts).toEqual([]);
  });
});

describe('an enrolled student marks a lesson complete', () => {
  it("uses FluentCommunity's own Complete button, saves once, and does not move the page on a second time", async () => {
    const store = {};
    openLesson('day-1', store, { fcDone: [] });
    let nativeClicks = 0;
    document.querySelector('.fcom_back_space .fcom_lesson_nav .el-button--info').addEventListener('click', () => { nativeClicks += 1; });
    await settle();
    document.getElementById('sv-trigger-complete-btn').click();
    await new Promise((r) => setTimeout(r, 1800)); // the celebration waits 1.5 s for FluentCommunity's own progress
    expect(nativeClicks).toBe(1);
    expect(nextClicks).toBe(0); // FluentCommunity advances by itself; we must not press Next as well
    expect((store.lesson_completions || []).map((r) => String(r.lesson_id))).toEqual(['128']);
    expect(document.getElementById('sv-celebration-modal-wrap')).not.toBeNull();
  });
});

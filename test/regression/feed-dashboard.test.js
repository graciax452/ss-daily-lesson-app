import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

// Real markup captured live from the actual Feed page (data-route="all_feeds"),
// see test/fixtures/feed-page.html. .fcom_feed_box is the real container we
// insert our banner into, as the first child, ahead of FluentCommunity's own
// welcome box / post composer / post list.

// The sign-in step (ensureAuth) adds a few async hops before the dashboard renders, so flush a
// whole macrotask rather than counting microtask ticks.
async function waitForMicrotasks() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('Feed page dashboard banner (mounts into the real portal shell, not a separate page)', () => {
  it('puts the Home | Feed switch first, then the banner, ahead of the native feed content', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();

    const feedBox = document.querySelector('.fcom_feed_box');
    expect(feedBox.firstElementChild.id).toBe('sv-home-switch');
    expect(feedBox.children[1].id).toBe('sv-feed-dashboard');
  });

  it('Home view shows only the dashboard (native feed hidden, not removed); the Feed view shows the original feed', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();

    const welcomeBox = document.querySelector('.fcom_welcome_box');
    const composer = document.querySelector('.create_status_holder');
    const timeline = document.querySelector('.all_feeds_holder').closest('.fcom_feed_style_timeline');
    const banner = document.getElementById('sv-feed-dashboard');

    // Home view: native content still in the DOM (Vue keeps managing it) but hidden
    expect(welcomeBox).not.toBeNull();
    expect(welcomeBox.style.display).toBe('none');
    expect(composer.style.display).toBe('none');
    expect(timeline.style.display).toBe('none');
    expect(banner.style.display).not.toBe('none');

    // Feed view: the original feed as it was before, dashboard hidden
    document.querySelector('#sv-home-switch [data-view="feed"]').click();
    expect(welcomeBox.style.display).not.toBe('none');
    expect(composer.style.display).not.toBe('none');
    expect(timeline.style.display).not.toBe('none');
    expect(banner.style.display).toBe('none');

    // ...and back
    document.querySelector('#sv-home-switch [data-view="home"]').click();
    expect(composer.style.display).toBe('none');
    expect(banner.style.display).not.toBe('none');
  });

  it('opens straight on the Feed view when the Feed tab on a space page just set the flag', async () => {
    sessionStorage.setItem('sv_open_feed', String(Date.now()));
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();
    expect(document.querySelector('.fcom_feed_box').getAttribute('data-sv-view')).toBe('feed');
    expect(document.querySelector('.create_status_holder').style.display).not.toBe('none');
    expect(sessionStorage.getItem('sv_open_feed')).toBeNull(); // used once
  });

  it('ignores an old flag (a stale click must not hijack a later visit to Home)', async () => {
    sessionStorage.setItem('sv_open_feed', String(Date.now() - 60000));
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();
    expect(document.querySelector('.fcom_feed_box').getAttribute('data-sv-view')).toBe('home');
  });

  it('keeps native content hidden across repeated mountUI() calls, even if something reappears in the DOM', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();

    // Simulate Vue reactively un-hiding or re-adding native content.
    const welcomeBox = document.querySelector('.fcom_welcome_box');
    welcomeBox.style.display = '';

    mountUI();
    await waitForMicrotasks();

    expect(welcomeBox.style.display).toBe('none');
  });

  it('shows a "coming soon" card since the real lessons manifest is empty', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();

    const banner = document.getElementById('sv-feed-dashboard');
    expect(banner.textContent).toContain('Coming soon');
  });

  it('shows 0 completed and a streak of 0 with no completion history', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();

    const statValues = Array.from(document.querySelectorAll('.sv-dash-stat-value')).map((el) => el.textContent);
    expect(statValues).toEqual(['0', '0']);
  });

  it('regression: does not count completions from other courses (FEED_DASHBOARD_LESSONS is empty today, so nothing should count)', async () => {
    // Reproduces the real bug found live: lesson_completions held rows from
    // "YouTube Lessons in Order" testing earlier this session, which leaked
    // into the "Daily Shona Lessons" dashboard's completed count (showed 4
    // instead of 0).
    const { mountUI } = loadApp({
      fixture: 'feed-page',
      bodyAttrs: { 'data-route': 'all_feeds' },
      supabaseOverrides: {
        selectResult: {
          data: [
            { lesson_id: '75', completed_at: new Date().toISOString() },
            { lesson_id: '76', completed_at: new Date().toISOString() },
          ],
          error: null,
        },
      },
    });
    mountUI();
    await waitForMicrotasks();

    const statValues = Array.from(document.querySelectorAll('.sv-dash-stat-value')).map((el) => el.textContent);
    expect(statValues).toEqual(['0', '0']);
  });

  it('brand-new learners get no month squares (nothing to show yet)', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();

    const banner = document.getElementById('sv-feed-dashboard');
    expect(banner.querySelector('.sv-dash-month')).toBeNull();
    expect(banner.querySelector('.sv-dash-cal')).toBeNull();
  });

  it('is idempotent: repeated mountUI() calls (as scheduleMountUI triggers on feed mutations) do not duplicate the banner', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();
    mountUI();
    mountUI();
    await waitForMicrotasks();

    expect(document.querySelectorAll('#sv-feed-dashboard').length).toBe(1);
  });

  it('does not mount on the lesson page route', async () => {
    const { mountUI } = loadApp({ fixture: 'lesson-not-completed', bodyAttrs: { 'data-route': 'view_lesson' } });
    mountUI();
    await waitForMicrotasks();

    expect(document.getElementById('sv-feed-dashboard')).toBeNull();
  });

  it('does nothing if .fcom_feed_box is missing (e.g. still loading)', async () => {
    const { mountUI } = loadApp({ bodyAttrs: { 'data-route': 'all_feeds' } });
    expect(() => mountUI()).not.toThrow();
    expect(document.getElementById('sv-feed-dashboard')).toBeNull();
  });
});

describe('getTotalCompletedCount() / getCurrentLesson() (feed dashboard helpers)', () => {
  it('getTotalCompletedCount dedupes by lesson id', () => {
    const { getTotalCompletedCount } = loadApp();
    expect(getTotalCompletedCount(['75', '75', '76'])).toBe(2);
  });

  it('getCurrentLesson returns the first not-yet-completed lesson', () => {
    const { getCurrentLesson } = loadApp();
    const lessons = [
      { id: '75', title: 'Lesson 1', url: 'https://example.com/75' },
      { id: '76', title: 'Lesson 2', url: 'https://example.com/76' },
    ];
    expect(getCurrentLesson(lessons, ['75'])).toEqual(lessons[1]);
  });

  it('FEED_DASHBOARD_LESSONS starts empty (Daily Shona Lessons has no published lessons yet)', () => {
    const { FEED_DASHBOARD_LESSONS } = loadApp();
    expect(FEED_DASHBOARD_LESSONS).toEqual([]);
  });
});

describe('filterCompletionsForCourse()', () => {
  const courseLessons = [
    { id: '75', title: 'Lesson 1', url: 'https://example.com/75' },
    { id: '76', title: 'Lesson 2', url: 'https://example.com/76' },
  ];

  it('keeps only rows whose lesson_id belongs to this course', () => {
    const { filterCompletionsForCourse } = loadApp();
    const rows = [
      { lesson_id: '75', completed_at: '2026-01-01' },
      { lesson_id: '999', completed_at: '2026-01-02' }, // a different course's lesson
      { lesson_id: '76', completed_at: '2026-01-03' },
    ];
    expect(filterCompletionsForCourse(rows, courseLessons)).toEqual([
      { lesson_id: '75', completed_at: '2026-01-01' },
      { lesson_id: '76', completed_at: '2026-01-03' },
    ]);
  });

  it('returns an empty array when the course has no lessons in its manifest', () => {
    const { filterCompletionsForCourse } = loadApp();
    const rows = [{ lesson_id: '75', completed_at: '2026-01-01' }];
    expect(filterCompletionsForCourse(rows, [])).toEqual([]);
  });

  it('matches ids regardless of string/number type mismatch', () => {
    const { filterCompletionsForCourse } = loadApp();
    const rows = [{ lesson_id: 75, completed_at: '2026-01-01' }];
    expect(filterCompletionsForCourse(rows, courseLessons)).toEqual(rows);
  });
});

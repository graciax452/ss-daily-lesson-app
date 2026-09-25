import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

// Real markup captured live from the actual Feed page (data-route="all_feeds"),
// see test/fixtures/feed-page.html. .fcom_feed_box is the real container we
// insert our banner into, as the first child, ahead of FluentCommunity's own
// welcome box / post composer / post list.

async function waitForMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('Feed page dashboard banner (mounts into the real portal shell, not a separate page)', () => {
  it('inserts the banner as the first child of .fcom_feed_box', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();

    const feedBox = document.querySelector('.fcom_feed_box');
    expect(feedBox.firstElementChild.id).toBe('sv-feed-dashboard');
  });

  it('hides but does not remove the native welcome box / post composer / post list (Home is dashboard-only)', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();

    const welcomeBox = document.querySelector('.fcom_welcome_box');
    const composer = document.querySelector('.create_status_holder');
    const postList = document.querySelector('.all_feeds_holder');

    // Still present in the DOM - never removed, so Vue can keep managing them...
    expect(welcomeBox).not.toBeNull();
    expect(composer).not.toBeNull();
    expect(postList).not.toBeNull();

    // ...just hidden, since Home shouldn't show feed content at all.
    expect(welcomeBox.style.display).toBe('none');
    expect(composer.style.display).toBe('none');
    expect(postList.closest('.fcom_feed_style_timeline').style.display).toBe('none');
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

  it('renders a full month calendar grid', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();

    const banner = document.getElementById('sv-feed-dashboard');
    const cells = banner.querySelectorAll('.sv-dash-cal-cell:not(.sv-dash-cal-empty)');
    const now = new Date();
    const realDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    expect(cells.length).toBe(realDaysInMonth);
    expect(banner.querySelectorAll('.sv-dash-cal-weekday').length).toBe(7);
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

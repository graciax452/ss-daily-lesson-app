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

  it('does not touch or remove the native welcome box / post composer / post list', async () => {
    const { mountUI } = loadApp({ fixture: 'feed-page', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    await waitForMicrotasks();

    expect(document.querySelector('.fcom_welcome_box')).not.toBeNull();
    expect(document.querySelector('.create_status_holder')).not.toBeNull();
    expect(document.querySelector('.all_feeds_holder')).not.toBeNull();
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

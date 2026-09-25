import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

// Superseded designs, for context:
// 1. Tried to detect a genuine not-completed -> completed transition via
//    mountUI()'s own state tracking. Broke because lessons were being
//    manually marked done/undone repeatedly during testing, and the tracked
//    state didn't survive page reloads between toggles.
// 2. Fired celebrateLessonCompletion() immediately on click, no delay at
//    all. Broke because FluentCommunity's own course-progress bar hadn't
//    recalculated yet at that instant, so the modal showed a stale %.
//
// Current design: fires on click, after a short FIXED delay (not a
// condition to wait on, so unlike the very first poll-based version it
// can't get stuck waiting for something that never arrives).

async function waitForMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
}

describe('celebration modal trigger (fires on click after a fixed settle delay)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the celebration modal after the settle delay following a click', async () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });
    mountUI();

    expect(document.getElementById('sv-celebration-modal-wrap')).toBeNull();

    document.getElementById('sv-trigger-complete-btn').click();

    // Nothing yet - still inside the fixed settle delay.
    await waitForMicrotasks();
    expect(document.getElementById('sv-celebration-modal-wrap')).toBeNull();

    await vi.advanceTimersByTimeAsync(1500);
    await waitForMicrotasks();

    const wrap = document.getElementById('sv-celebration-modal-wrap');
    expect(wrap).not.toBeNull();
    expect(wrap.classList.contains('is-active')).toBe(true);
  });

  it('does not show anything on page load alone, without a click', async () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });
    mountUI();

    await vi.advanceTimersByTimeAsync(2000);
    await waitForMicrotasks();

    expect(document.getElementById('sv-celebration-modal-wrap')).toBeNull();
  });

  it('fires again on a second click (e.g. after manually toggling a lesson back to incomplete and re-completing it)', async () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });
    mountUI();

    document.getElementById('sv-trigger-complete-btn').click();
    await vi.advanceTimersByTimeAsync(1500);
    await waitForMicrotasks();

    const wrap = document.getElementById('sv-celebration-modal-wrap');
    wrap.classList.remove('is-active'); // simulate closing it

    document.getElementById('sv-trigger-complete-btn').click();
    await vi.advanceTimersByTimeAsync(1500);
    await waitForMicrotasks();

    expect(wrap.classList.contains('is-active')).toBe(true);
  });
});

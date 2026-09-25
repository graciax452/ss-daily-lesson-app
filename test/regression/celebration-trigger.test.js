import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

// Superseded design: an earlier version tried to detect a genuine
// not-completed -> completed transition via mountUI()'s own state tracking,
// to avoid a time-boxed poll that could give up before FluentCommunity's
// native state actually flipped. That broke for a different real reason:
// lessons were being manually marked done/undone repeatedly during testing,
// and the tracked state didn't survive page reloads between toggles.
//
// Current design is simpler and doesn't depend on native state at all:
// clicking "Mark Lesson Complete" fires celebrateLessonCompletion()
// immediately, alongside the native click - we're recording our own
// completion independently, so there's nothing to wait for or detect.

function waitForMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 10));
}

describe('celebration modal trigger (fires on click, not on detected state)', () => {
  it('shows the celebration modal immediately when Mark Lesson Complete is clicked', async () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });
    mountUI();

    expect(document.getElementById('sv-celebration-modal-wrap')).toBeNull();

    document.getElementById('sv-trigger-complete-btn').click();
    await waitForMicrotasks();

    const wrap = document.getElementById('sv-celebration-modal-wrap');
    expect(wrap).not.toBeNull();
    expect(wrap.classList.contains('is-active')).toBe(true);
  });

  it('does not show anything on page load alone, without a click', async () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });
    mountUI();
    await waitForMicrotasks();

    expect(document.getElementById('sv-celebration-modal-wrap')).toBeNull();
  });

  it('fires again on a second click (e.g. after manually toggling a lesson back to incomplete and re-completing it)', async () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });
    mountUI();

    document.getElementById('sv-trigger-complete-btn').click();
    await waitForMicrotasks();

    const wrap = document.getElementById('sv-celebration-modal-wrap');
    wrap.classList.remove('is-active'); // simulate closing it

    document.getElementById('sv-trigger-complete-btn').click();
    await waitForMicrotasks();

    expect(wrap.classList.contains('is-active')).toBe(true);
  });
});

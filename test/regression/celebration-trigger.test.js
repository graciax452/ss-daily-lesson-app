import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

// Guards against the exact bug found live: a separately time-boxed poll
// duplicating mountUI()'s own isCompleted detection could time out before
// the native "Completed" state actually appeared, silently never showing the
// celebration modal. The fix ties the trigger directly to mountUI()'s own
// (already reliable) detection via a false->true transition check, which
// these tests exercise directly instead of racing a real timer.
//
// Uses the full-lesson-page fixture specifically: mountUI() only reaches the
// transition-check code when it finds .fcom_lesson_details .fcom_lesson_content,
// which the header-only fixtures (lesson-completed/lesson-not-completed) don't
// include.

function waitForMicrotasks() {
  // celebrateLessonCompletion() makes several sequential awaited Supabase
  // calls; the mock resolves each one immediately, but each await schedules
  // a fresh microtask only once the previous one settles, so a single tick
  // isn't always enough to flush the whole chain.
  return new Promise((resolve) => setTimeout(resolve, 10));
}

function markNativeCompleted() {
  const btn = document.querySelector('.fcom_back_space .fcom_lesson_nav .el-button--info');
  btn.textContent = 'Completed';
  btn.classList.remove('fcom_primary_button');
}

describe('celebration modal trigger (mountUI transition detection)', () => {
  it('does NOT show the celebration modal on first load of an already-completed lesson', async () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });
    markNativeCompleted();

    mountUI();
    await waitForMicrotasks();

    const wrap = document.getElementById('sv-celebration-modal-wrap');
    expect(wrap === null || !wrap.classList.contains('is-active')).toBe(true);
  });

  it('shows the celebration modal on a genuine not-completed -> completed transition', async () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });

    mountUI();
    await waitForMicrotasks();
    expect(document.getElementById('sv-celebration-modal-wrap')).toBeNull();

    markNativeCompleted();
    mountUI();
    await waitForMicrotasks();

    const wrap = document.getElementById('sv-celebration-modal-wrap');
    expect(wrap).not.toBeNull();
    expect(wrap.classList.contains('is-active')).toBe(true);
  });

  it('does not re-show the modal on a further mountUI() call once already completed', async () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });

    mountUI();
    await waitForMicrotasks();

    markNativeCompleted();
    mountUI();
    await waitForMicrotasks();

    const wrap = document.getElementById('sv-celebration-modal-wrap');
    expect(wrap).not.toBeNull();
    wrap.classList.remove('is-active'); // simulate the user closing it

    mountUI();
    await waitForMicrotasks();

    expect(wrap.classList.contains('is-active')).toBe(false);
  });
});

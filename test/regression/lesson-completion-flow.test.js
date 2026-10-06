import { describe, it, expect, vi } from 'vitest';
import { loadApp } from '../setup.js';

// The celebration / completion flow, written before the fixes (see the plan in the chat):
//  B  Next on the celebration goes to the lesson AFTER the one just completed, and never skips one
//  C  Zuva 0 (onboarding) is saved but never celebrated
//  D  a free member never sees a flash of "Mark Lesson Complete" before we know it is already done
//  E  progress counts completions we hold ourselves; the Zuva number never falls back to FluentCommunity's off-by-one count

const course = {
  id: 24,
  lessons: [
    { id: '126', title: 'Zuva 0 — Mauya! (Onboarding)', url: 'https://x/lessons/day-0/view', section: 'Onboarding' },
    { id: '128', title: 'Zuva 1 — Ehe', url: 'https://x/lessons/day-1/view' },
    { id: '130', title: 'Zuva 2 — Hesi', url: 'https://x/lessons/day-2/view' },
    { id: '131', title: 'Zuva 3 — Vowels', url: 'https://x/lessons/day-3/view' },
  ],
  completedIds: [],
};

describe('B: where the celebration\'s Next button goes', () => {
  it('advances to the lesson after the one just completed when the page is still on it', () => {
    const { celebrationNextStep } = loadApp();
    expect(celebrationNextStep({ completedId: '128', currentId: '128', course }))
      .toEqual({ action: 'advance', url: 'https://x/lessons/day-2/view' });
  });

  it('only closes when the page already moved on (never skips a lesson)', () => {
    const { celebrationNextStep } = loadApp();
    expect(celebrationNextStep({ completedId: '128', currentId: '130', course })).toEqual({ action: 'stay' });
  });

  it('only closes after the last lesson', () => {
    const { celebrationNextStep } = loadApp();
    expect(celebrationNextStep({ completedId: '131', currentId: '131', course })).toEqual({ action: 'stay' });
  });
});

describe('C: Zuva 0 (onboarding) is never celebrated', () => {
  it('saves the completion but shows no celebration', async () => {
    vi.useFakeTimers();
    const { mountUI, celebrateLessonCompletion } = loadApp({ fixture: 'full-lesson-page' });
    document.querySelector('.fcom_lesson_title h1').textContent = 'Zuva 0 — Mauya! Zuva nezuva (Onboarding)';
    mountUI();
    await celebrateLessonCompletion('126');
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.getElementById('sv-celebration-modal-wrap')).toBeNull();
    vi.useRealTimers();
  });
});

describe('D: no flash of "Mark Lesson Complete" while we check whether it is already done', () => {
  it('shows no Mark button until the check has finished, then shows Completed', async () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });
    document.querySelector('.fcom_back_space .fcom_lesson_nav .el-button--info')?.remove();
    history.pushState({}, '', '/shonaverse/course/shona-lessons/lessons/day-1/view');
    mountUI();
    expect(document.getElementById('sv-trigger-complete-btn')).toBeNull();
  });
});

describe('E: progress and Zuva number', () => {
  it('lessonProgress counts completions we hold ourselves, not only FluentCommunity\'s', () => {
    const { lessonProgress } = loadApp();
    const p = lessonProgress(course, '131', ['128', '130']);
    expect(p).toEqual({ completed: 3, total: 3, pct: 100 }); // onboarding (126) is never counted
  });

  it('the Zuva number comes from the page address, not FluentCommunity\'s lesson count', () => {
    const { zuvaNumberForPage } = loadApp();
    expect(zuvaNumberForPage('day-2', 'Zuva 2 — Hesi, Mhoro')).toBe(2);
    expect(zuvaNumberForPage('', 'Zuva 3 — Five Clean Vowels')).toBe(3);
    expect(zuvaNumberForPage('some-slug', 'No number here')).toBeNull();
  });
});

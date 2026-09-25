import { describe, it, expect } from 'vitest';
import { loadDashboard } from '../setup.js';

describe('getTotalCompletedCount()', () => {
  it('counts each distinct lesson id once', () => {
    const { getTotalCompletedCount } = loadDashboard();
    expect(getTotalCompletedCount(['75', '76'])).toBe(2);
  });

  it('dedupes a repeated lesson id from a duplicate row', () => {
    const { getTotalCompletedCount } = loadDashboard();
    expect(getTotalCompletedCount(['75', '75', '76'])).toBe(2);
  });

  it('dedupes across string/number id mismatches', () => {
    const { getTotalCompletedCount } = loadDashboard();
    expect(getTotalCompletedCount(['75', 75])).toBe(1);
  });

  it('returns 0 for an empty list', () => {
    const { getTotalCompletedCount } = loadDashboard();
    expect(getTotalCompletedCount([])).toBe(0);
  });
});

describe('getCurrentLesson()', () => {
  const LESSONS = [
    { id: '75', title: 'Lesson 1', url: 'https://example.com/lesson-75' },
    { id: '76', title: 'Lesson 2', url: 'https://example.com/lesson-76' },
  ];

  it('returns the first lesson when nothing is completed', () => {
    const { getCurrentLesson } = loadDashboard();
    expect(getCurrentLesson(LESSONS, [])).toEqual(LESSONS[0]);
  });

  it('returns the first not-yet-completed lesson', () => {
    const { getCurrentLesson } = loadDashboard();
    expect(getCurrentLesson(LESSONS, ['75'])).toEqual(LESSONS[1]);
  });

  it('returns null once every lesson is completed', () => {
    const { getCurrentLesson } = loadDashboard();
    expect(getCurrentLesson(LESSONS, ['75', '76'])).toBeNull();
  });

  it('matches ids regardless of string/number type', () => {
    const { getCurrentLesson } = loadDashboard();
    expect(getCurrentLesson(LESSONS, [75])).toEqual(LESSONS[1]);
  });
});

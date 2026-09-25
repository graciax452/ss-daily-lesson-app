import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

describe('getWeekCompletionMap()', () => {
  it('returns all false for an empty completion list', () => {
    const { getWeekCompletionMap } = loadApp();
    const week = getWeekCompletionMap([], new Date('2026-06-17')); // a Wednesday
    expect(week).toEqual([false, false, false, false, false, false, false]);
  });

  it('marks Monday through Wednesday true when reference date is that Wednesday', () => {
    const { getWeekCompletionMap } = loadApp();
    // 2026-06-15 Mon, 06-16 Tue, 06-17 Wed
    const completions = ['2026-06-15T09:00:00Z', '2026-06-16T09:00:00Z', '2026-06-17T09:00:00Z'];
    const week = getWeekCompletionMap(completions, new Date('2026-06-17T20:00:00Z'));
    expect(week).toEqual([true, true, true, false, false, false, false]);
  });

  it('places a Sunday completion at the last index of its own Mon-Sun week', () => {
    const { getWeekCompletionMap } = loadApp();
    // 2026-06-21 is a Sunday
    const week = getWeekCompletionMap(['2026-06-21T09:00:00Z'], new Date('2026-06-21T20:00:00Z'));
    expect(week).toEqual([false, false, false, false, false, false, true]);
  });

  it('does not carry a completion into the following week', () => {
    const { getWeekCompletionMap } = loadApp();
    // Completed Sunday 2026-06-21, but reference date is the NEXT Monday 2026-06-22
    const week = getWeekCompletionMap(['2026-06-21T09:00:00Z'], new Date('2026-06-22T09:00:00Z'));
    expect(week).toEqual([false, false, false, false, false, false, false]);
  });
});

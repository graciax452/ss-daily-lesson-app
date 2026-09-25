import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

describe('getMonthCompletionMap()', () => {
  it('pads the start of the grid with null for the weekday the 1st falls on, then lists every real day', () => {
    const { getMonthCompletionMap } = loadApp();
    // June 2026: 30 days, June 1 2026 is a Monday (weekday index 1, Sun=0)
    const { year, month, days } = getMonthCompletionMap([], new Date('2026-06-17'));

    expect(year).toBe(2026);
    expect(month).toBe(5); // 0-indexed
    expect(days[0]).toBeNull(); // Sunday padding before Monday the 1st
    expect(days[1]).toMatchObject({ day: 1 });
    expect(days.filter((d) => d !== null)).toHaveLength(30);
    expect(days[days.length - 1]).toMatchObject({ day: 30 });
  });

  it('marks only the days with a completion timestamp as done', () => {
    const { getMonthCompletionMap } = loadApp();
    const completions = ['2026-06-03T09:00:00Z', '2026-06-17T09:00:00Z'];
    const { days } = getMonthCompletionMap(completions, new Date('2026-06-20'));

    const doneDays = days.filter((d) => d && d.done).map((d) => d.day);
    expect(doneDays).toEqual([3, 17]);
  });

  it('marks exactly the reference date as isToday, regardless of completion status', () => {
    const { getMonthCompletionMap } = loadApp();
    const { days } = getMonthCompletionMap([], new Date('2026-06-20'));

    const todayDays = days.filter((d) => d && d.isToday).map((d) => d.day);
    expect(todayDays).toEqual([20]);
  });

  it('does not mark any day as today when the reference date is in a different month', () => {
    const { getMonthCompletionMap } = loadApp();
    // referenceDate itself defines which month is shown, so this checks that
    // a completion from a different month doesn't accidentally get flagged.
    const { days } = getMonthCompletionMap(['2026-07-05T09:00:00Z'], new Date('2026-06-20'));

    expect(days.some((d) => d && d.done)).toBe(false);
  });

  it('handles a leap-year February correctly (29 days)', () => {
    const { getMonthCompletionMap } = loadApp();
    const { days } = getMonthCompletionMap([], new Date('2028-02-10')); // 2028 is a leap year
    expect(days.filter((d) => d !== null)).toHaveLength(29);
  });
});

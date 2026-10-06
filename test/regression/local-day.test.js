import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { loadApp } from '../setup.js';

// Regression: celebrations were "off by a day". Completions were bucketed by their UTC date, so an
// evening lesson in Vancouver (UTC-7) counted for tomorrow. Everything must bucket by the learner's
// LOCAL day. Forced to a western and an eastern zone so it fails the same way on any machine.

const ZONES = ['America/Vancouver', 'Pacific/Auckland'];

describe.each(ZONES)('local-day bucketing in %s', (zone) => {
  let prev;
  beforeAll(() => { prev = process.env.TZ; process.env.TZ = zone; });
  afterAll(() => { if (prev === undefined) delete process.env.TZ; else process.env.TZ = prev; });

  // 21:30 local on Tue 6 Oct 2026 and 00:30 local on Wed 7 Oct 2026 — each straddles the UTC date line
  const lateTue = () => new Date(2026, 9, 6, 21, 30).toISOString();
  const earlyWed = () => new Date(2026, 9, 7, 0, 30).toISOString();
  const ref = () => new Date(2026, 9, 7, 12, 0); // Wed 7 Oct, midday local

  it('week dots: an evening completion lights its own day, not the next one', () => {
    const { getWeekCompletionMap } = loadApp();
    // Mon..Sun: Tue is index 1, Wed index 2
    expect(getWeekCompletionMap([lateTue()], ref())).toEqual([false, true, false, false, false, false, false]);
    expect(getWeekCompletionMap([earlyWed()], ref())).toEqual([false, false, true, false, false, false, false]);
  });

  it('streak: two local days in a row count as 2', () => {
    const { calculateStreak } = loadApp();
    expect(calculateStreak([lateTue(), earlyWed()], ref())).toBe(2);
  });

  it('month squares: the done square is the local day', () => {
    const { getMonthCompletionMap } = loadApp();
    const m = getMonthCompletionMap([lateTue()], ref());
    expect(m.days.filter((d) => d && d.done).map((d) => d.day)).toEqual([6]);
    expect(m.days.find((d) => d && d.isToday).day).toBe(7);
  });
});

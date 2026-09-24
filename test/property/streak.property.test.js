import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { loadApp } from '../setup.js';

// calculateStreak(completedAtList, referenceDate) counts consecutive calendar
// days, ending at referenceDate, that have at least one completion timestamp.
// referenceDate defaults to `new Date()` in production but is always passed
// explicitly here so results are deterministic and reproducible.

function isoDaysAgo(referenceDate, daysAgo) {
  const d = new Date(referenceDate);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

describe('calculateStreak() (property-based)', () => {
  it('is always 0 for an empty completion list', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }), (referenceDate) => {
        const { calculateStreak } = loadApp();
        return calculateStreak([], referenceDate) === 0;
      })
    );
  });

  it('equals N for exactly N consecutive days ending at the reference date', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        fc.integer({ min: 1, max: 60 }),
        (referenceDate, n) => {
          const { calculateStreak } = loadApp();
          const completions = Array.from({ length: n }, (_, i) => isoDaysAgo(referenceDate, i));
          return calculateStreak(completions, referenceDate) === n;
        }
      )
    );
  });

  it('never counts past a gap, regardless of how much data exists further back', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        fc.integer({ min: 1, max: 20 }), // days present immediately before the gap
        fc.integer({ min: 1, max: 5 }), // size of the gap (days with no completion)
        fc.integer({ min: 0, max: 20 }), // days present further back, beyond the gap
        (referenceDate, streakLength, gapSize, extraDaysBeyondGap) => {
          const { calculateStreak } = loadApp();
          const recentCompletions = Array.from({ length: streakLength }, (_, i) => isoDaysAgo(referenceDate, i));
          const farCompletions = Array.from(
            { length: extraDaysBeyondGap },
            (_, i) => isoDaysAgo(referenceDate, streakLength + gapSize + i)
          );
          const completions = [...recentCompletions, ...farCompletions];
          return calculateStreak(completions, referenceDate) === streakLength;
        }
      )
    );
  });

  it('is unaffected by duplicate timestamps on the same day', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        fc.integer({ min: 1, max: 30 }),
        fc.integer({ min: 1, max: 5 }),
        (referenceDate, n, duplicatesPerDay) => {
          const { calculateStreak } = loadApp();
          const completions = [];
          for (let i = 0; i < n; i++) {
            for (let d = 0; d < duplicatesPerDay; d++) {
              completions.push(isoDaysAgo(referenceDate, i));
            }
          }
          return calculateStreak(completions, referenceDate) === n;
        }
      )
    );
  });

  it('never returns more than the number of unique completion days', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        fc.array(fc.integer({ min: 0, max: 90 }), { minLength: 0, maxLength: 50 }),
        (referenceDate, daysAgoList) => {
          const { calculateStreak } = loadApp();
          const completions = daysAgoList.map((d) => isoDaysAgo(referenceDate, d));
          const uniqueDays = new Set(completions.map((c) => new Date(c).toISOString().slice(0, 10))).size;
          return calculateStreak(completions, referenceDate) <= uniqueDays;
        }
      )
    );
  });
});

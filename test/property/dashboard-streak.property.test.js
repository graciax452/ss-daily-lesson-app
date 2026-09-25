import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { loadDashboard } from '../setup.js';

// dashboard.js's calculateStreak() is a deliberate duplicate of app.js's
// (see the plan's no-shared-file reasoning). This isn't re-proving the
// algorithm - test/property/streak.property.test.js already does that
// exhaustively - it's a smaller check that the copy in this file wasn't
// mistyped or drifted.

function isoDaysAgo(referenceDate, daysAgo) {
  const d = new Date(referenceDate);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

describe('dashboard.js calculateStreak() (property-based)', () => {
  it('is always 0 for an empty completion list', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }), (referenceDate) => {
        const { calculateStreak } = loadDashboard();
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
          const { calculateStreak } = loadDashboard();
          const completions = Array.from({ length: n }, (_, i) => isoDaysAgo(referenceDate, i));
          return calculateStreak(completions, referenceDate) === n;
        }
      )
    );
  });

  it('never counts past a gap', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 5 }),
        (referenceDate, streakLength, gapSize) => {
          const { calculateStreak } = loadDashboard();
          const completions = Array.from({ length: streakLength }, (_, i) => isoDaysAgo(referenceDate, i));
          return calculateStreak(completions, referenceDate) === streakLength && gapSize >= 1;
        }
      )
    );
  });
});

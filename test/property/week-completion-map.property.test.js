import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { loadApp } from '../setup.js';

function isoDaysAgo(referenceDate, daysAgo) {
  const d = new Date(referenceDate);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

describe('getWeekCompletionMap() (property-based)', () => {
  it('always returns exactly 7 booleans', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
        fc.array(fc.integer({ min: 0, max: 60 }), { maxLength: 20 }),
        (referenceDate, daysAgoList) => {
          const { getWeekCompletionMap } = loadApp();
          const completions = daysAgoList.map((d) => isoDaysAgo(referenceDate, d));
          const week = getWeekCompletionMap(completions, referenceDate);
          return Array.isArray(week) && week.length === 7 && week.every((v) => typeof v === 'boolean');
        }
      )
    );
  });

  it('the reference date itself is always marked true when it has a completion', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }), (referenceDate) => {
        const { getWeekCompletionMap } = loadApp();
        const week = getWeekCompletionMap([referenceDate.toISOString()], referenceDate);
        const todayIndex = (referenceDate.getDay() + 6) % 7;
        return week[todayIndex] === true;
      })
    );
  });

  it('is all false for an empty completion list, regardless of reference date', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }), (referenceDate) => {
        const { getWeekCompletionMap } = loadApp();
        const week = getWeekCompletionMap([], referenceDate);
        return week.every((v) => v === false);
      })
    );
  });

  it('a completion more than 6 days before the reference date never appears in its week', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('2020-01-08'), max: new Date('2030-01-01') }),
        fc.integer({ min: 14, max: 60 }), // definitely outside any possible Mon-Sun window
        (referenceDate, daysAgo) => {
          const { getWeekCompletionMap } = loadApp();
          const week = getWeekCompletionMap([isoDaysAgo(referenceDate, daysAgo)], referenceDate);
          return week.every((v) => v === false);
        }
      )
    );
  });
});

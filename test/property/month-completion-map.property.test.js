import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { loadApp } from '../setup.js';

describe('getMonthCompletionMap() (property-based)', () => {
  it('the number of non-null days always equals the real number of days in that month', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2035-12-31') }), (referenceDate) => {
        const { getMonthCompletionMap } = loadApp();
        const { year, month, days } = getMonthCompletionMap([], referenceDate);
        const realDaysInMonth = new Date(year, month + 1, 0).getDate();
        return days.filter((d) => d !== null).length === realDaysInMonth;
      })
    );
  });

  it('the number of leading nulls always equals the weekday of the 1st of that month', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2035-12-31') }), (referenceDate) => {
        const { getMonthCompletionMap } = loadApp();
        const { year, month, days } = getMonthCompletionMap([], referenceDate);
        const expectedLeadingNulls = new Date(year, month, 1).getDay();
        let actualLeadingNulls = 0;
        while (days[actualLeadingNulls] === null) actualLeadingNulls++;
        return actualLeadingNulls === expectedLeadingNulls;
      })
    );
  });

  it('exactly one day is ever marked isToday', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2035-12-31') }), (referenceDate) => {
        const { getMonthCompletionMap } = loadApp();
        const { days } = getMonthCompletionMap([], referenceDate);
        return days.filter((d) => d && d.isToday).length === 1;
      })
    );
  });

  it('the day values, in order, are always 1..N with no gaps', () => {
    fc.assert(
      fc.property(fc.date({ min: new Date('2020-01-01'), max: new Date('2035-12-31') }), (referenceDate) => {
        const { getMonthCompletionMap } = loadApp();
        const { days } = getMonthCompletionMap([], referenceDate);
        const dayNumbers = days.filter((d) => d !== null).map((d) => d.day);
        const expected = Array.from({ length: dayNumbers.length }, (_, i) => i + 1);
        return JSON.stringify(dayNumbers) === JSON.stringify(expected);
      })
    );
  });
});

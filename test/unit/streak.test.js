import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

describe('calculateStreak()', () => {
  it('is 0 for an empty completion list', () => {
    const { calculateStreak } = loadApp();
    expect(calculateStreak([], new Date('2026-06-15'))).toBe(0);
  });

  it('is 1 for a single completion on the reference date', () => {
    const { calculateStreak } = loadApp();
    expect(calculateStreak(['2026-06-15T10:00:00Z'], new Date('2026-06-15T22:00:00Z'))).toBe(1);
  });

  it('is 0 if the only completion was yesterday, not on the reference date', () => {
    const { calculateStreak } = loadApp();
    expect(calculateStreak(['2026-06-14T10:00:00Z'], new Date('2026-06-15T10:00:00Z'))).toBe(0);
  });

  it('counts 3 consecutive days correctly', () => {
    const { calculateStreak } = loadApp();
    const completions = ['2026-06-13T09:00:00Z', '2026-06-14T09:00:00Z', '2026-06-15T09:00:00Z'];
    expect(calculateStreak(completions, new Date('2026-06-15T20:00:00Z'))).toBe(3);
  });

  it('stops at a gap even with more completions further back', () => {
    const { calculateStreak } = loadApp();
    // completed today and yesterday, then a gap, then completed 5 and 6 days ago
    const completions = [
      '2026-06-15T09:00:00Z',
      '2026-06-14T09:00:00Z',
      '2026-06-10T09:00:00Z',
      '2026-06-09T09:00:00Z',
    ];
    expect(calculateStreak(completions, new Date('2026-06-15T20:00:00Z'))).toBe(2);
  });
});

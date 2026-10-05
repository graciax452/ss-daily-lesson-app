// mazwi links carry the Zuvas a member completed (&done=), so mazwi shows those words as met.
import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

const { completedZuvas, withDoneZuvas, withMemberToken } = loadApp();

const manifest = [
  { zuva: 0, type: 'onboarding', title: 'Start here', fc_url: 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/start' },
  { zuva: 1, title: 'Mhoro', fc_url: 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/zuva-1' },
  { zuva: 2, title: 'Hesi', fc_url: 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/zuva-2' },
];
const lesson = (id, slug, title) => ({ id: String(id), slug, title, url: `https://speakshona.com/shonaverse/course/shona-lessons/lessons/${slug}` });
const course = {
  completedIds: ['10', '11', '12'],
  lessons: [lesson(10, 'start', 'Start here'), lesson(11, 'zuva-2', 'Zuva 2 — Hesi'), lesson(12, 'zuva-1', 'Zuva 1 — Mhoro'), lesson(13, 'zuva-3', 'Zuva 3')],
};

describe('completedZuvas', () => {
  it('maps completed lessons to sorted Zuva numbers, leaving out onboarding', () => {
    expect(completedZuvas(course, manifest)).toEqual([1, 2]);
  });
  it('is empty without course data', () => {
    expect(completedZuvas(null, manifest)).toEqual([]);
  });
});

describe('withDoneZuvas', () => {
  const base = 'https://mazwi.app/deck/zuva-03?back=https%3A%2F%2Fspeakshona.com%2Fx';
  it('appends the done list to mazwi deck links', () => {
    expect(withDoneZuvas(base, [1, 2])).toBe(base + '&done=1,2');
  });
  it('replaces an earlier done list instead of stacking them', () => {
    expect(withDoneZuvas(base + '&done=1', [1, 2])).toBe(base + '&done=1,2');
  });
  it('leaves other links and empty lists alone', () => {
    expect(withDoneZuvas('https://evil.com/deck/zuva-03', [1])).toBe('https://evil.com/deck/zuva-03');
    expect(withDoneZuvas(base, [])).toBe(base);
  });
});

// mazwi LAUNCH.md C1 — the member's signed token rides after '#', never in the query
describe('withMemberToken', () => {
  const base = 'https://mazwi.app/deck/zuva-03?back=https%3A%2F%2Fspeakshona.com%2Fx';
  it('adds the token after # and replaces an older one', () => {
    expect(withMemberToken(base, 'abc.DEF-_1')).toBe(base + '#m=abc.DEF-_1');
    expect(withMemberToken(base + '#m=old.tok', 'new.tok')).toBe(base + '#m=new.tok');
  });
  it('leaves non-mazwi links alone and drops odd-looking tokens', () => {
    expect(withMemberToken('https://evil.com/deck/zuva-03', 'a.b')).toBe('https://evil.com/deck/zuva-03');
    expect(withMemberToken(base, '"><script>')).toBe(base);
    expect(withMemberToken(base, undefined)).toBe(base);
  });
  it('the done list still goes in the query when a token is already there', () => {
    expect(withDoneZuvas(base + '#m=a.b', [1, 2])).toBe(base + '&done=1,2#m=a.b');
  });
});

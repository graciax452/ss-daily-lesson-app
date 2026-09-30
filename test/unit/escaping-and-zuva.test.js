import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

// Member-typed text (names, memos, replies) is rendered into everyone's lesson page via
// innerHTML — it must never be able to inject markup or scripts.
describe('escHtml()', () => {
  it('neutralises script and attribute injection', () => {
    const { escHtml } = loadApp();
    const out = escHtml('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('<');
    expect(out).not.toContain('"');
    expect(out).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  });

  it('keeps ordinary Shona text intact', () => {
    const { escHtml } = loadApp();
    expect(escHtml("Mhoroi, Gogo! E'e")).toBe('Mhoroi, Gogo! E&#39;e');
  });

  it('treats null/undefined as empty', () => {
    const { escHtml } = loadApp();
    expect(escHtml(null)).toBe('');
    expect(escHtml(undefined)).toBe('');
  });
});

describe('safeUrl()', () => {
  it('allows http(s) URLs', () => {
    const { safeUrl } = loadApp();
    expect(safeUrl('https://x.supabase.co/storage/v1/object/public/missions/a.jpg'))
      .toBe('https://x.supabase.co/storage/v1/object/public/missions/a.jpg');
  });

  it('rejects javascript: and other schemes', () => {
    const { safeUrl } = loadApp();
    expect(safeUrl('javascript:alert(1)')).toBe('');
    expect(safeUrl('data:text/html,<script>')).toBe('');
  });

  it('cannot break out of an attribute', () => {
    const { safeUrl } = loadApp();
    expect(safeUrl('https://a.com/"onerror="alert(1)')).not.toContain('"');
  });
});

describe('findZuvaForUrl()', () => {
  const LESSONS = [
    { zuva: 0, week: 0, fc_url: 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/mauya' },
    { zuva: 3, week: 1, fc_url: 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/five-clean-vowels/' },
    { zuva: 4, week: 1, fc_url: '' },
  ];

  it('matches the page by its path, ignoring trailing slashes, query and case', () => {
    const { findZuvaForUrl } = loadApp();
    const hit = findZuvaForUrl(LESSONS, 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/Five-Clean-Vowels?x=1');
    expect(hit && hit.zuva).toBe(3);
  });

  it('returns null for pages not in the manifest, and never matches lessons without a link', () => {
    const { findZuvaForUrl } = loadApp();
    expect(findZuvaForUrl(LESSONS, 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/other')).toBeNull();
    expect(findZuvaForUrl(LESSONS, 'https://speakshona.com/')).toBeNull();
  });

  it('copes with a missing manifest', () => {
    const { findZuvaForUrl } = loadApp();
    expect(findZuvaForUrl(null, 'https://speakshona.com/x')).toBeNull();
  });
});

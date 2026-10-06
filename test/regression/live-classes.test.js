import { describe, it, expect, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

// Live Classes space: a static page of two class cards (kids / adults) with a countdown that turns into
// a Join button, plus recordings buttons. Times are fixed in Vancouver time and shown in the viewer's.

function visit(path) { window.history.pushState({}, '', path); }
afterEach(() => { visit('/'); });
const tick = () => new Promise((r) => setTimeout(r, 0));
async function settle() { for (let i = 0; i < 6; i++) await tick(); }

describe('Live class schedule maths (Vancouver time, daylight saving aware)', () => {
  it('kids 11:45am and adults 12:45pm Pacific on Fri 9 Oct 2026 are 18:45 and 19:45 UTC (PDT = UTC-7)', () => {
    const { zonedInstant } = loadApp();
    expect(zonedInstant('2026-10-09', '11:45', 'America/Vancouver')).toBe(Date.UTC(2026, 9, 9, 18, 45));
    expect(zonedInstant('2026-10-09', '12:45', 'America/Vancouver')).toBe(Date.UTC(2026, 9, 9, 19, 45));
  });

  it('after the clocks go back (Nov 1) the same wall-clock time is an hour later in UTC (PST = UTC-8)', () => {
    const { zonedInstant } = loadApp();
    expect(zonedInstant('2026-11-06', '11:45', 'America/Vancouver')).toBe(Date.UTC(2026, 10, 6, 19, 45));
  });

  it('the next session is the first Friday class that has not finished yet', () => {
    const { nextLiveSession, LIVE_CLASSES_DEFAULT } = loadApp();
    const kids = LIVE_CLASSES_DEFAULT.find((c) => c.id === 'kids');
    // before the first class
    expect(nextLiveSession(kids, Date.UTC(2026, 9, 6)).start).toBe(Date.UTC(2026, 9, 9, 18, 45));
    // while the class is on, it is still "the next" one
    expect(nextLiveSession(kids, Date.UTC(2026, 9, 9, 19, 0)).start).toBe(Date.UTC(2026, 9, 9, 18, 45));
    // after it ends, the following Friday
    expect(nextLiveSession(kids, Date.UTC(2026, 9, 9, 19, 31)).start).toBe(Date.UTC(2026, 9, 16, 18, 45));
  });

  it('never starts before the first class date', () => {
    const { nextLiveSession, LIVE_CLASSES_DEFAULT } = loadApp();
    const kids = LIVE_CLASSES_DEFAULT.find((c) => c.id === 'kids');
    expect(nextLiveSession(kids, Date.UTC(2026, 8, 1)).start).toBe(Date.UTC(2026, 9, 9, 18, 45));
  });

  it('formats the countdown as days, hours and minutes', () => {
    const { formatCountdown } = loadApp();
    expect(formatCountdown((3 * 1440 + 4 * 60 + 12) * 60000)).toBe('3d 4h 12m');
    expect(formatCountdown((5 * 60 + 3) * 60000)).toBe('5h 3m');
    expect(formatCountdown(7 * 60000)).toBe('7m');
  });
});

describe('Live class cards', () => {
  const kidsWith = (LIVE_CLASSES_DEFAULT, meet) => Object.assign({}, LIVE_CLASSES_DEFAULT[0], { meet_url: meet });

  it('shows a greyed countdown before the class and no Join link', () => {
    const { renderLiveCard, LIVE_CLASSES_DEFAULT } = loadApp();
    const html = renderLiveCard(kidsWith(LIVE_CLASSES_DEFAULT, 'https://meet.google.com/abc-defg-hij'), Date.UTC(2026, 9, 6, 18, 45));
    expect(html).toContain('Starts in 3d');
    expect(html).not.toContain('meet.google.com');
  });

  it('turns into a Join button 10 minutes before the start and until it ends', () => {
    const { renderLiveCard, LIVE_CLASSES_DEFAULT } = loadApp();
    const kids = kidsWith(LIVE_CLASSES_DEFAULT, 'https://meet.google.com/abc-defg-hij');
    const start = Date.UTC(2026, 9, 9, 18, 45);
    expect(renderLiveCard(kids, start - 11 * 60000)).not.toContain('Join class');
    expect(renderLiveCard(kids, start - 9 * 60000)).toContain('href="https://meet.google.com/abc-defg-hij"');
    expect(renderLiveCard(kids, start + 20 * 60000)).toContain('Join class');
  });

  it('says "Join link coming" rather than a dead button when there is no Meet link yet', () => {
    const { renderLiveCard, LIVE_CLASSES_DEFAULT } = loadApp();
    const html = renderLiveCard(LIVE_CLASSES_DEFAULT[0], Date.UTC(2026, 9, 9, 18, 45));
    expect(html).toContain('Join link coming');
    expect(html).not.toContain('<a ');
  });

  it('refuses a non-http link (a bad value in the table cannot become a javascript: link)', () => {
    const { renderLiveCard, LIVE_CLASSES_DEFAULT } = loadApp();
    const html = renderLiveCard(kidsWith(LIVE_CLASSES_DEFAULT, 'javascript:alert(1)'), Date.UTC(2026, 9, 9, 18, 45));
    expect(html).not.toContain('javascript:');
  });

  it('recordings buttons are links once set, and "coming soon" until then', () => {
    const { renderLiveRecordings, LIVE_CLASSES_DEFAULT } = loadApp();
    const rows = LIVE_CLASSES_DEFAULT.map((r) => Object.assign({}, r));
    expect(renderLiveRecordings(rows)).toContain('Kids recordings · coming soon');
    rows[0].recordings_url = 'https://speakshona.com/shonaverse/course/live-recordings/lessons';
    const html = renderLiveRecordings(rows);
    expect(html).toContain('href="https://speakshona.com/shonaverse/course/live-recordings/lessons"');
    expect(html).toContain('Adults recordings · coming soon');
  });
});

describe('Live Classes space page', () => {
  it('replaces the posts area with the class cards and hides (not removes) the native content', async () => {
    visit('/shonaverse/space/liveclass/home');
    const { mountUI } = loadApp({ fixture: 'space-page', bodyAttrs: { 'data-route': 'space_feeds' } });
    mountUI();
    await settle();
    const page = document.getElementById('sv-live');
    expect(page).not.toBeNull();
    expect(page.querySelectorAll('.sv-live-card').length).toBe(2);
    expect(page.textContent).toContain('Kids class');
    expect(page.textContent).toContain('Adults class');
    const body = document.querySelector('.fhr_content_layout_body');
    expect(body).not.toBeNull();
    expect(body.style.display).toBe('none');
    expect(page.nextElementSibling).toBe(body);
  });

  it('uses the Meet and recordings links from the live_classes table, merged onto the schedule', async () => {
    visit('/shonaverse/space/liveclass/home');
    const { mountUI } = loadApp({
      fixture: 'space-page',
      bodyAttrs: { 'data-route': 'space_feeds' },
      supabaseOverrides: { selectResultByTable: { live_classes: { data: [{ id: 'kids', meet_url: 'https://meet.google.com/zzz-zzzz-zzz', recordings_url: 'https://speakshona.com/rec/kids' }], error: null } } },
    });
    mountUI();
    await settle();
    expect(document.getElementById('sv-live').textContent).toContain('Kids recordings');
    expect(document.querySelector('#sv-live a[href="https://speakshona.com/rec/kids"]')).not.toBeNull();
  });

  it('is idempotent', async () => {
    visit('/shonaverse/space/liveclass/home');
    const { mountUI } = loadApp({ fixture: 'space-page', bodyAttrs: { 'data-route': 'space_feeds' } });
    mountUI(); mountUI();
    await settle();
    expect(document.querySelectorAll('#sv-live').length).toBe(1);
  });

  it('does not touch other spaces', async () => {
    visit('/shonaverse/space/general/home');
    const { mountUI } = loadApp({ fixture: 'space-page', bodyAttrs: { 'data-route': 'space_feeds' } });
    mountUI();
    await settle();
    expect(document.getElementById('sv-live')).toBeNull();
    expect(document.querySelector('.fhr_content_layout_body').style.display).not.toBe('none');
  });
});

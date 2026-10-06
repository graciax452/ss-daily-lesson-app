import { describe, it, expect, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

// Real markup captured from a live space page (data-route="space_feeds"), see
// test/fixtures/space-page.html. The tab row goes between the title bar and the posts.

function visit(path) { window.history.pushState({}, '', path); }
afterEach(() => { visit('/'); delete window.fluentComAdmin; });

describe('Community space tabs', () => {
  it('shows Feed / Lounge / Ndeipi! Intros / Rules above the space title, with Lounge active', () => {
    visit('/shonaverse/space/general/home');
    const { mountUI } = loadApp({ fixture: 'space-page', bodyAttrs: { 'data-route': 'space_feeds' } });
    mountUI();
    const bar = document.getElementById('sv-space-tabs');
    expect(bar).not.toBeNull();
    expect(bar.nextElementSibling.className).toContain('fhr_content_layout_header'); // above the title row
    const tabs = Array.from(bar.querySelectorAll('.sv-space-tab'));
    expect(tabs.map((t) => t.textContent)).toEqual(['Feed', 'Lounge', 'Ndeipi! Intros', 'Rules']);
    expect(tabs.map((t) => t.getAttribute('href'))).toEqual([
      'https://speakshona.com/shonaverse/feed',
      'https://speakshona.com/shonaverse/space/general/home',
      'https://speakshona.com/shonaverse/space/say-hello/home',
      'https://speakshona.com/shonaverse/space/rules/home',
    ]);
    expect(bar.querySelector('.sv-space-tab-active').textContent).toBe('Lounge');
  });

  it('marks the tab of the space you are on', () => {
    visit('/shonaverse/space/rules/home');
    const { mountUI } = loadApp({ fixture: 'space-page', bodyAttrs: { 'data-route': 'space_feeds' } });
    mountUI();
    expect(document.querySelector('#sv-space-tabs .sv-space-tab-active').textContent).toBe('Rules');
  });

  it('is idempotent and puts the bar back if the page re-rendered around it', () => {
    visit('/shonaverse/space/general/home');
    const { mountUI } = loadApp({ fixture: 'space-page', bodyAttrs: { 'data-route': 'space_feeds' } });
    mountUI(); mountUI();
    expect(document.querySelectorAll('#sv-space-tabs').length).toBe(1);
    const bar = document.getElementById('sv-space-tabs');
    bar.remove();
    mountUI();
    expect(document.querySelectorAll('#sv-space-tabs').length).toBe(1);
  });

  it('adds nothing on a space that is not in the tab list (e.g. live classes)', () => {
    visit('/shonaverse/space/liveclass/home');
    const { mountUI } = loadApp({ fixture: 'space-page', bodyAttrs: { 'data-route': 'space_feeds' } });
    mountUI();
    expect(document.getElementById('sv-space-tabs')).toBeNull();
  });

  it('adds nothing on other pages', () => {
    visit('/shonaverse/space/general/home');
    const { mountUI } = loadApp({ fixture: 'space-page', bodyAttrs: { 'data-route': 'view_lesson' } });
    mountUI();
    expect(document.getElementById('sv-space-tabs')).toBeNull();
  });
});

describe('Feed tab opens the original feed view on Home', () => {
  it('clicking the Feed tab sets the short-lived flag Home reads', () => {
    visit('/shonaverse/space/general/home');
    const { mountUI } = loadApp({ fixture: 'space-page', bodyAttrs: { 'data-route': 'space_feeds' } });
    mountUI();
    sessionStorage.removeItem('sv_open_feed');
    const feedTab = document.querySelector('#sv-space-tabs [data-open-feed]');
    expect(feedTab.textContent).toBe('Feed');
    feedTab.addEventListener('click', (e) => e.preventDefault()); // jsdom can't navigate
    feedTab.click();
    expect(Number(sessionStorage.getItem('sv_open_feed'))).toBeGreaterThan(0);
    sessionStorage.removeItem('sv_open_feed');
  });
});

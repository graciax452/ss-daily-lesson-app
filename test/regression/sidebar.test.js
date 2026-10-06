import { describe, it, expect, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

// Real sidebar markup captured from the live portal (see test/fixtures/sidebar.html).
// Wanted: Home · Community · Live Classes · the courses, no group headers, community spaces
// hidden behind one Community link, Shop + the website as small icons at the bottom.

function visit(path) { window.history.pushState({}, '', path); }
afterEach(() => { visit('/'); delete window.fluentComAdmin; });

const labels = () => Array.from(document.querySelectorAll('#fcom_sidebar_wrap .space_menu_item'))
  .filter((li) => !li.classList.contains('sv-side-hidden') && li.tagName === 'LI')
  .map((li) => li.querySelector('.community_name').textContent);

describe('Left sidebar', () => {
  it('shows Home, Community, the courses, then Live Classes last — the community spaces are hidden', () => {
    const { mountUI } = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    expect(labels()).toEqual(['Home', 'Community', 'Daily Shona Lessons', 'Replays (camps and cohorts)', 'YouTube Lessons in Order', 'Live Classes']);
    // hidden, not removed (Vue keeps managing them)
    ['say-hello', 'rules', 'general'].forEach((slug) => {
      const li = document.querySelector('a.fcom_space_' + slug).closest('li');
      expect(li).not.toBeNull();
      expect(li.classList.contains('sv-side-hidden')).toBe(true);
    });
  });

  it('Home goes to the portal home and Community opens Ndeipi! Intros (the first tab)', () => {
    const { mountUI } = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    expect(document.querySelector('#sv-side-home a').getAttribute('href')).toBe('https://speakshona.com/shonaverse/');
    expect(document.querySelector('#sv-side-community a').getAttribute('href')).toBe('https://speakshona.com/shonaverse/space/say-hello/home');
  });

  it('highlights Home on Home and Community on any of its spaces, never both', () => {
    visit('/shonaverse/space/rules/home');
    let app = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'space_feeds' } });
    app.mountUI();
    expect(document.querySelector('#sv-side-community a').className).toContain('router-link-exact-active');
    expect(document.querySelector('#sv-side-home a').className).not.toContain('router-link-exact-active');

    visit('/shonaverse/');
    app = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'all_feeds' } });
    app.mountUI();
    expect(document.querySelector('#sv-side-home a').className).toContain('router-link-exact-active');
    expect(document.querySelector('#sv-side-community a').className).not.toContain('router-link-exact-active');
  });

  it('moves Shop and the website into small icons in the footer and hides the old menu block', () => {
    const { mountUI } = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    const links = document.querySelector('.fcom_side_footer #sv-side-links');
    expect(links).not.toBeNull();
    const anchors = Array.from(links.querySelectorAll('a'));
    expect(anchors.map((a) => a.getAttribute('aria-label'))).toEqual(['Speak Shona Website', 'Shop']);
    expect(anchors.map((a) => a.getAttribute('href'))).toEqual(['https://speakshona.com/', 'https://speakshona.com/shop/']);
    anchors.forEach((a) => expect(a.getAttribute('rel')).toContain('noopener'));
    expect(document.querySelector('.fcom_menu_item_fcom_custom_shop').closest('nav').classList.contains('sv-side-hidden')).toBe(true);
  });

  it('is idempotent, and puts Home/Community back if Vue re-rendered the list', () => {
    const { mountUI } = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI(); mountUI();
    expect(document.querySelectorAll('#sv-side-home').length).toBe(1);
    expect(document.querySelectorAll('#sv-side-community').length).toBe(1);
    expect(document.querySelectorAll('#sv-side-links').length).toBe(1);
    document.getElementById('sv-side-home').remove();
    document.getElementById('sv-side-community').remove();
    mountUI();
    expect(labels().slice(0, 2)).toEqual(['Home', 'Community']);
  });

  it('offers "Get live classes" to people who do not have Live (the secret space is missing from their sidebar), and not to those who do', () => {
    // without Live: no Live Classes item
    let app = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'all_feeds' } });
    document.querySelector('a.fcom_space_liveclass').closest('li').remove();
    app.mountUI();
    const buy = document.getElementById('sv-side-live-buy');
    expect(buy).not.toBeNull();
    expect(buy.getAttribute('href')).toBe('https://speakshona.com/item/daily-lessons-zuva-nezuva/');
    expect(buy.parentElement.id).toBe('sv-side-links');
    app.mountUI();
    expect(document.querySelectorAll('#sv-side-live-buy').length).toBe(1);
    // with Live: no buy button
    app = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'all_feeds' } });
    app.mountUI();
    expect(document.getElementById('sv-side-live-buy')).toBeNull();
  });

  it('does nothing on pages without the sidebar', () => {
    const { mountUI } = loadApp({ bodyAttrs: { 'data-route': 'all_feeds' } });
    expect(() => mountUI()).not.toThrow();
    expect(document.getElementById('sv-side-home')).toBeNull();
  });
});

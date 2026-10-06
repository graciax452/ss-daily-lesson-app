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
  it('shows Home, Community, the open courses, then Live Classes last — community spaces and the enrolled-only Replays are hidden', () => {
    const { mountUI } = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    expect(labels()).toEqual(['Home', 'Community', 'Daily Shona Lessons', 'YouTube Lessons in Order', 'Live Classes']);
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

  it('shows the Replays course to someone enrolled in it, once FluentCommunity says so', async () => {
    window.fluentComAdmin = { rest: { url: 'https://speakshona.com/wp-json/fluent-community/v2', nonce: 'n' } };
    let asked = '';
    globalThis.fetch = async (url) => { asked = url; return { ok: true, json: async () => ({ track: { isEnrolled: true }, sections: [] }) }; };
    const { mountUI, isEnrolledIn } = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'all_feeds' } });
    mountUI();
    expect(document.querySelector('a.fcom_space_replays').closest('li').classList.contains('sv-side-hidden')).toBe(true); // hidden until known
    await new Promise((r) => setTimeout(r, 300));
    mountUI();
    expect(asked).toContain('/courses/replays/by-slug');
    expect(document.querySelector('a.fcom_space_replays').closest('li').classList.contains('sv-side-hidden')).toBe(false);
    delete globalThis.fetch; delete window.fluentComAdmin;
  });

  it('hides every course called "Replays ..." (camps, cohorts) unless enrolled in that very course', async () => {
    window.fluentComAdmin = { rest: { url: 'https://speakshona.com/wp-json/fluent-community/v2' } };
    globalThis.fetch = async (url) => ({ ok: true, json: async () => ({ track: { isEnrolled: /replays-summer/.test(url) }, sections: [] }) });
    const { mountUI } = loadApp({ fixture: 'sidebar', bodyAttrs: { 'data-route': 'all_feeds' } });
    const orig = document.querySelector('a.fcom_space_replays').closest('li');
    orig.querySelector('a').setAttribute('href', 'https://speakshona.com/shonaverse/course/replays-jumpstart/lessons');
    orig.querySelector('a').setAttribute('data-fcom-hint', 'Replays Jumpstart Cohort');
    const camps = orig.cloneNode(true);
    camps.querySelector('a').setAttribute('href', 'https://speakshona.com/shonaverse/course/replays-summer/lessons');
    camps.querySelector('a').setAttribute('data-fcom-hint', 'Replays Summer Camps');
    orig.parentNode.appendChild(camps);
    mountUI();
    expect(orig.classList.contains('sv-side-hidden')).toBe(true);
    expect(camps.classList.contains('sv-side-hidden')).toBe(true);
    await new Promise((r) => setTimeout(r, 300));
    mountUI();
    expect(camps.classList.contains('sv-side-hidden')).toBe(false); // enrolled in the camps course only
    expect(orig.classList.contains('sv-side-hidden')).toBe(true);
    delete globalThis.fetch; delete window.fluentComAdmin;
  });

  it('keeps Replays hidden when not enrolled, when the lookup fails, or when logged out', async () => {
    const { isEnrolledIn } = loadApp();
    window.fluentComAdmin = { rest: { url: 'https://x/v2' } };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ track: { isEnrolled: false } }) });
    expect(await isEnrolledIn('replays')).toBe(false);
    globalThis.fetch = async () => ({ ok: false });
    expect(await isEnrolledIn('replays')).toBe(false);
    globalThis.fetch = async () => { throw new Error('offline'); };
    expect(await isEnrolledIn('replays')).toBe(false);
    delete window.fluentComAdmin; // logged out: no REST info at all
    expect(await isEnrolledIn('replays')).toBe(false);
    delete globalThis.fetch;
  });

  it('does nothing on pages without the sidebar', () => {
    const { mountUI } = loadApp({ bodyAttrs: { 'data-route': 'all_feeds' } });
    expect(() => mountUI()).not.toThrow();
    expect(document.getElementById('sv-side-home')).toBeNull();
  });
});

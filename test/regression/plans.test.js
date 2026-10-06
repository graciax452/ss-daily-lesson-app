import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

// The lock screen visitors see on the Daily Shona Lessons course (real markup captured from the live
// portal, see test/fixtures/paywall-page.html). Four native plan cards become two plans with a
// Monthly / Yearly switch, built from the native cards' real prices and checkout links.

const mount = () => {
  const app = loadApp({ fixture: 'paywall-page', bodyAttrs: { 'data-route': 'view_course' } });
  app.mountUI();
  return app;
};
const card = (id) => document.querySelector('#sv-plans .sv-plan[data-plan="' + id + '"]');

describe('Daily Lessons sales page', () => {
  it('shows two plans, Daily Lessons and Daily Lessons + Live — never the long FluentCart product names', () => {
    mount();
    const names = Array.from(document.querySelectorAll('#sv-plans .sv-plan-name')).map((n) => n.textContent);
    expect(names).toEqual(['Daily Lessons', 'Daily Lessons + Live Classes']);
    expect(document.getElementById('sv-plans').textContent).not.toContain('Weekly Live Lessons');
  });

  it('opens on Yearly with the real prices and the real annual checkout links', () => {
    mount();
    expect(card('base').querySelector('.sv-plan-price').textContent).toContain('$199');
    expect(card('live').querySelector('.sv-plan-price').textContent).toContain('$690');
    expect(card('base').querySelector('.sv-plan-btn').getAttribute('href')).toContain('item_id=13');
    expect(card('live').querySelector('.sv-plan-btn').getAttribute('href')).toContain('item_id=15');
    expect(card('base').querySelector('.sv-plan-sub').textContent).toContain('16.58');
  });

  it('switching to Monthly shows $22 / $69 and the monthly checkout links', () => {
    mount();
    document.querySelector('#sv-plans [data-period="month"]').click();
    expect(card('base').querySelector('.sv-plan-price').textContent).toContain('$22');
    expect(card('live').querySelector('.sv-plan-price').textContent).toContain('$69');
    expect(card('base').querySelector('.sv-plan-btn').getAttribute('href')).toContain('item_id=12');
    expect(card('live').querySelector('.sv-plan-btn').getAttribute('href')).toContain('item_id=14');
    expect(document.querySelector('#sv-plans [data-period="month"]').getAttribute('aria-pressed')).toBe('true');
  });

  it('the buttons say exactly which plan you are joining (not "with Live")', () => {
    mount();
    expect(card('base').querySelector('.sv-plan-btn').textContent).toBe('Join Daily Lessons');
    expect(card('live').querySelector('.sv-plan-btn').textContent).toBe('Join Daily Lessons + Live Classes');
    expect(document.querySelector('#sv-plans .sv-plans-bill').textContent).toBe('Choose how you pay');
  });

  it('shows the biggest saving on the Yearly switch, worked out from the prices (25% for Daily Lessons)', () => {
    mount();
    expect(document.querySelector('#sv-plans .sv-plans-save').textContent).toBe('Save 25%');
  });

  it('keeps the native lock box and cards in the page, hidden (Vue keeps managing them)', () => {
    mount();
    const lockBox = document.querySelector('.space_lock_box');
    const cards = document.querySelector('.fcom_paywall_cards');
    expect(lockBox).not.toBeNull();
    expect(cards).not.toBeNull();
    expect(lockBox.style.display).toBe('none');
    expect(cards.style.display).toBe('none');
    expect(cards.querySelectorAll('.fcom_paywall').length).toBe(4);
  });

  it('offers a log-in link for people who already have an account', () => {
    mount();
    const a = document.querySelector('#sv-plans .sv-plans-login a');
    expect(a.getAttribute('href')).toContain('/pinda');
  });

  it('free first: a signed-out visitor sees a quiet start button (a free account) and the plans tucked behind "Membership plans", with no lesson count in the copy', () => {
    mount();
    const free = document.querySelector('#sv-plans .sv-free .sv-free-btn');
    expect(free.getAttribute('href')).toContain('/pinda');
    expect(document.getElementById('sv-plans').firstElementChild.className).toBe('sv-free');
    expect(document.querySelector('#sv-plans .sv-plans-more').hidden).toBe(true);
    document.querySelector('#sv-plans .sv-plans-toggle').click();
    expect(document.querySelector('#sv-plans .sv-plans-more').hidden).toBe(false);
    expect(document.getElementById('sv-plans').textContent).not.toMatch(/d+ lessons/);
  });

  it('is idempotent and puts the plans back on top if Vue re-rendered the lock screen', () => {
    const { mountUI } = mount();
    mountUI();
    expect(document.querySelectorAll('#sv-plans').length).toBe(1);
    document.getElementById('sv-plans').remove();
    mountUI();
    expect(document.querySelectorAll('#sv-plans').length).toBe(1);
    expect(document.querySelector('.space_default_lockscreen').firstElementChild.id).toBe('sv-plans');
  });

  it('leaves other courses alone, and does nothing when there are no plans (already a member)', () => {
    let app = loadApp({ fixture: 'paywall-page', bodyAttrs: { 'data-route': 'view_course' } });
    document.querySelector('.fcom_single_layout').setAttribute('course_slug', 'replays');
    app.mountUI();
    expect(document.getElementById('sv-plans')).toBeNull();

    app = loadApp({ fixture: 'paywall-page', bodyAttrs: { 'data-route': 'view_course' } });
    document.querySelector('.fcom_paywall_cards').innerHTML = '';
    app.mountUI();
    expect(document.getElementById('sv-plans')).toBeNull();
  });
});

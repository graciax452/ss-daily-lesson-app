import { describe, it, expect, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

describe('getUserInfo()', () => {
  afterEach(() => {
    delete window.fluentComAdmin;
    delete window.fcom_user;
    document.body.classList.remove('admin-bar');
    const bar = document.getElementById('wpadminbar');
    if (bar) bar.remove();
  });

  it('returns the computed isAdmin value, not a hardcoded true (regression test)', () => {
    const { getUserInfo } = loadApp();
    window.fluentComAdmin = { current_user: { display_name: 'Regular Student', roles: ['subscriber'] } };
    const info = getUserInfo();
    expect(info.isAdmin).toBe(false);
  });

  it('reports isAdmin true for a user with the administrator role', () => {
    const { getUserInfo } = loadApp();
    window.fluentComAdmin = { current_user: { display_name: 'Site Admin', roles: ['administrator'] } };
    const info = getUserInfo();
    expect(info.isAdmin).toBe(true);
  });

  it('reports isAdmin true when the WordPress admin bar is present, even without a matching role', () => {
    const { getUserInfo } = loadApp();
    window.fluentComAdmin = { current_user: { display_name: 'Someone', roles: [] } };
    const bar = document.createElement('div');
    bar.id = 'wpadminbar';
    document.body.appendChild(bar);
    const info = getUserInfo();
    expect(info.isAdmin).toBe(true);
  });

  it('strips bracket/brace/angle characters from the display name', () => {
    const { getUserInfo } = loadApp();
    window.fluentComAdmin = { current_user: { display_name: 'Tsitsi (Admin) [Test] <b>' } };
    const info = getUserInfo();
    expect(info.name).toBe('Tsitsi Admin Test b');
  });

  it('falls back to a default name when no user data is available', () => {
    const { getUserInfo } = loadApp();
    const info = getUserInfo();
    expect(info.name).toBe('Tsitsi C');
  });
});

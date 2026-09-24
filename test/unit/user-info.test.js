import { describe, it, expect, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

// Real (trimmed) shapes captured live via DevTools from window.fluentComAdmin.auth
// on speakshona.com - window.fluentComAdmin has no .current_user/.me at all,
// which was the actual cause of every mission showing "Tsitsi C" as the
// author regardless of who was logged in (see project_debugging_lessons).
const REAL_NON_ADMIN_AUTH = {
  id: 539,
  user_id: 539,
  username: 'didi',
  display_name: 'Di Chig',
  first_name: 'Di',
  avatar: 'https://pub-58d8a633a1684d84890c11f46f1c4163.r2.dev/fake-avatar.webp',
  community_roles: [],
  spaces: {
    'say-hello': { permissions: { is_member: true, can_view_posts: true } },
    rules: { permissions: { is_member: true, can_view_posts: true } },
  },
};

const REAL_ADMIN_AUTH = {
  id: 460,
  user_id: 460,
  username: 'tsitsi',
  display_name: 'Tsitsi C',
  first_name: 'Tsitsi',
  avatar: 'https://www.gravatar.com/avatar/fake',
  community_roles: [],
  spaces: {
    liveclass: {
      permissions: {
        community_admin: true,
        community_moderator: true,
        super_admin: true,
        is_member: true,
      },
    },
  },
};

describe('getUserInfo()', () => {
  afterEach(() => {
    delete window.fluentComAdmin;
    delete window.fcom_user;
    document.body.classList.remove('admin-bar');
    const bar = document.getElementById('wpadminbar');
    if (bar) bar.remove();
  });

  it('reads the real display name from fluentComAdmin.auth, not current_user/.me (regression test)', () => {
    const { getUserInfo } = loadApp();
    window.fluentComAdmin = { auth: REAL_NON_ADMIN_AUTH };
    const info = getUserInfo();
    expect(info.name).toBe('Di Chig');
  });

  it('reads the real avatar URL from fluentComAdmin.auth', () => {
    const { getUserInfo } = loadApp();
    window.fluentComAdmin = { auth: REAL_NON_ADMIN_AUTH };
    const info = getUserInfo();
    expect(info.avatar).toBe(REAL_NON_ADMIN_AUTH.avatar);
  });

  it('reports isAdmin false for a real non-admin account (regression test for the isAdmin: true bug)', () => {
    const { getUserInfo } = loadApp();
    window.fluentComAdmin = { auth: REAL_NON_ADMIN_AUTH };
    const info = getUserInfo();
    expect(info.isAdmin).toBe(false);
  });

  it('reports isAdmin true when any space permission set has super_admin/community_admin', () => {
    const { getUserInfo } = loadApp();
    window.fluentComAdmin = { auth: REAL_ADMIN_AUTH };
    const info = getUserInfo();
    expect(info.isAdmin).toBe(true);
  });

  it('reports isAdmin true when the WordPress admin bar is present, even without matching space permissions', () => {
    const { getUserInfo } = loadApp();
    window.fluentComAdmin = { auth: REAL_NON_ADMIN_AUTH };
    const bar = document.createElement('div');
    bar.id = 'wpadminbar';
    document.body.appendChild(bar);
    const info = getUserInfo();
    expect(info.isAdmin).toBe(true);
  });

  it('strips bracket/brace/angle characters from the display name', () => {
    const { getUserInfo } = loadApp();
    window.fluentComAdmin = { auth: { ...REAL_NON_ADMIN_AUTH, display_name: 'Tsitsi (Admin) [Test] <b>' } };
    const info = getUserInfo();
    expect(info.name).toBe('Tsitsi Admin Test b');
  });

  it('falls back to a default name when no user data is available', () => {
    const { getUserInfo } = loadApp();
    const info = getUserInfo();
    expect(info.name).toBe('Tsitsi C');
  });
});

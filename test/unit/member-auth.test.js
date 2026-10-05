import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadApp } from '../setup.js';

const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const TOKEN = b64url({ e: 'Rudo@Example.com', t: 'member', x: 9999999999 }) + '.sig';

describe('ensureAuth() - verified identity for the tracker (C3)', () => {
  afterEach(() => { delete window.MAZWI_MEMBER_TOKEN; vi.unstubAllGlobals(); });

  it('reads the email out of the signed token', () => {
    const { emailFromToken } = loadApp({});
    expect(emailFromToken(TOKEN)).toBe('rudo@example.com');
    expect(emailFromToken('garbage')).toBeNull();
  });

  it('reuses an existing session for the same email without calling the sign-in function', async () => {
    window.MAZWI_MEMBER_TOKEN = TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { ensureAuth } = loadApp({ supabaseOverrides: { auth: {
      getSession: async () => ({ data: { session: { user: { id: 'u1', email: 'rudo@example.com' } } } }),
    } } });
    expect(await ensureAuth()).toBe('u1');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in with the token when there is no session', async () => {
    window.MAZWI_MEMBER_TOKEN = TOKEN;
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ token_hash: 'h', type: 'magiclink' }) }));
    vi.stubGlobal('fetch', fetchMock);
    const verifyOtp = vi.fn(async () => ({ data: { user: { id: 'u2' } }, error: null }));
    const { ensureAuth } = loadApp({ supabaseOverrides: { auth: {
      getSession: async () => ({ data: { session: null } }), verifyOtp,
    } } });
    expect(await ensureAuth()).toBe('u2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'h', type: 'magiclink' });
  });

  it('is null with no session and no token (not a member), and never calls the function', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { ensureAuth } = loadApp({ supabaseOverrides: { auth: {
      getSession: async () => ({ data: { session: null } }),
    } } });
    expect(await ensureAuth()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is null (no crash) when the sign-in function refuses the token', async () => {
    window.MAZWI_MEMBER_TOKEN = TOKEN;
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    const { ensureAuth } = loadApp({ supabaseOverrides: { auth: {
      getSession: async () => ({ data: { session: null } }),
    } } });
    expect(await ensureAuth()).toBeNull();
  });
});

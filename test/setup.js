import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS_PATH = path.join(__dirname, '..', 'app.js');

// app.js itself stays a plain CommonJS-style script (module.exports inside an
// IIFE) since it's deployed as-is via <script src>, unchanged - createRequire
// is how an ESM test file reaches into it.
const require = createRequire(import.meta.url);

// Minimal Supabase client stub. Enough for app.js's top-level
// `window.supabase.createClient(...)` call to succeed, and for
// loadMissionsFeed()'s query chain to resolve to an empty result by default.
function createSupabaseMock(overrides = {}) {
  const selectResult = overrides.selectResult || { data: [], error: null };
  // Real Supabase query builders are thenable at every step, not just after a
  // final .order()/.single() - awaiting the chain at any point (e.g. right
  // after the last .eq()) must resolve, or a test can silently destructure
  // {data, error} off the builder object itself instead of the real result.
  const selectChain = {
    select: () => selectChain,
    eq: () => selectChain,
    order: () => Promise.resolve(selectResult),
    then: (resolve, reject) => Promise.resolve(selectResult).then(resolve, reject),
  };

  return {
    from: () => ({
      select: () => selectChain,
      insert: () => Promise.resolve(overrides.insertResult || { data: [], error: null }),
      upsert: () => Promise.resolve(overrides.upsertResult || { data: [], error: null }),
      delete: () => ({ eq: () => Promise.resolve(overrides.deleteResult || { data: [], error: null }) }),
    }),
    storage: {
      from: () => ({
        upload: () => Promise.resolve({ data: {}, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/fake.png' } }),
      }),
    },
  };
}

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.html`), 'utf8');
}

// Resets the jsdom document to a given fixture, mocks window.supabase, and
// requires app.js fresh (its module-cache entry is cleared first since it has
// load-time side effects - timers, observers, the supabase client - that must
// re-run against the new DOM each time).
function loadApp({ fixture, bodyAttrs = { 'data-route': 'view_lesson' }, supabaseOverrides } = {}) {
  document.body.innerHTML = '';
  Array.from(document.body.attributes).forEach((attr) => document.body.removeAttribute(attr.name));
  Object.entries(bodyAttrs).forEach(([key, value]) => document.body.setAttribute(key, value));

  if (fixture) {
    const wrap = document.createElement('div');
    wrap.className = 'fcom_lesson_wrap';
    wrap.innerHTML = readFixture(fixture);
    document.body.appendChild(wrap);
  }

  window.supabase = { createClient: () => createSupabaseMock(supabaseOverrides) };

  delete require.cache[require.resolve(APP_JS_PATH)];
  return require(APP_JS_PATH);
}

export { loadApp, readFixture, createSupabaseMock };

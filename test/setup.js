import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS_PATH = path.join(__dirname, '..', 'app.js');
const DASHBOARD_JS_PATH = path.join(__dirname, '..', 'dashboard.js');

// app.js itself stays a plain CommonJS-style script (module.exports inside an
// IIFE) since it's deployed as-is via <script src>, unchanged - createRequire
// is how an ESM test file reaches into it.
const require = createRequire(import.meta.url);

// Minimal Supabase client stub. Enough for app.js's top-level
// `window.supabase.createClient(...)` call to succeed, and for
// loadMissionsFeed()'s query chain to resolve to an empty result by default.
//
// selectResultByTable lets a test give a DIFFERENT result per table name
// (e.g. lesson_missions vs lesson_completions), since app.js queries both
// in the same celebration flow and a single shared result would corrupt
// whichever one isn't the one the test actually cares about.
// Stateful variant: overrides.store = { table: [rows] } behaves like a tiny database (select + eq
// filters, upsert on user_id+lesson_id, insert, delete), so a test can mark a lesson, "refresh" (load the
// app again against the same store) and see what survived. overrides.auth supplies the session.
function createStoreMock(overrides) {
  const store = overrides.store;
  const rowsOf = (t) => (store[t] = store[t] || []);
  const query = (table) => {
    const filters = [];
    const run = () => Promise.resolve({ data: rowsOf(table).filter((r) => filters.every(([k, v]) => String(r[k]) === String(v))), error: null });
    const q = {
      select: () => q,
      eq: (k, v) => { filters.push([k, v]); return q; },
      order: () => q,
      limit: () => run(),
      then: (resolve, reject) => run().then(resolve, reject),
    };
    return q;
  };
  return {
    auth: overrides.auth,
    from: (table) => ({
      select: () => query(table),
      insert: (rows) => { rowsOf(table).push(...[].concat(rows)); return Promise.resolve({ data: [], error: null }); },
      upsert: (rows) => {
        [].concat(rows).forEach((row) => {
          const i = rowsOf(table).findIndex((r) => r.user_id === row.user_id && String(r.lesson_id) === String(row.lesson_id));
          if (i >= 0) rowsOf(table)[i] = Object.assign({}, rowsOf(table)[i], row);
          else rowsOf(table).push(Object.assign({ completed_at: new Date().toISOString() }, row));
        });
        return Promise.resolve({ data: [], error: null });
      },
      delete: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
    }),
    storage: { from: () => ({ upload: () => Promise.resolve({ data: {}, error: null }), getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/fake.png' } }) }) },
  };
}

function createSupabaseMock(overrides = {}) {
  if (overrides.store) return createStoreMock(overrides);
  const defaultSelectResult = overrides.selectResult || { data: [], error: null };
  const selectResultByTable = overrides.selectResultByTable || {};

  return {
    auth: overrides.auth,
    from: (table) => {
      const selectResult = selectResultByTable[table] || defaultSelectResult;
      // Real Supabase query builders are thenable at every step, not just
      // after a final .order()/.single() - awaiting the chain at any point
      // (e.g. right after the last .eq()) must resolve, or a test can
      // silently destructure {data, error} off the builder object itself
      // instead of the real result.
      const selectChain = {
        select: () => selectChain,
        eq: () => selectChain,
        order: () => selectChain,
        limit: () => Promise.resolve(selectResult),
        then: (resolve, reject) => Promise.resolve(selectResult).then(resolve, reject),
      };

      return {
        select: () => selectChain,
        insert: () => Promise.resolve(overrides.insertResult || { data: [], error: null }),
        upsert: () => Promise.resolve(overrides.upsertResult || { data: [], error: null }),
        delete: () => ({ eq: () => Promise.resolve(overrides.deleteResult || { data: [], error: null }) }),
      };
    },
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

// Same idea as loadApp(), but for the standalone dashboard page: a plain
// #sv-dashboard-root div instead of a lesson-page fixture, since dashboard.js
// doesn't touch any FluentCommunity DOM at all.
function loadDashboard({ supabaseOverrides } = {}) {
  document.body.innerHTML = '<div id="sv-dashboard-root"></div>';

  window.supabase = { createClient: () => createSupabaseMock(supabaseOverrides) };

  delete require.cache[require.resolve(DASHBOARD_JS_PATH)];
  return require(DASHBOARD_JS_PATH);
}

export { loadApp, loadDashboard, readFixture, createSupabaseMock };

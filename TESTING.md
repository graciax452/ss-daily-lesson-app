# Testing

`app.js` and `style.css` are deployed exactly as-is, raw, via jsDelivr into WordPress's Custom Snippets panel - there is no build step, and this test suite doesn't add one. `package.json` exists only to drive local/CI testing; it has no effect on what's deployed.

## Running tests

```
npm install
npm test
```

`npm test` runs `node --check app.js`, the self-closing-SVG-tag scan (`scripts/check-self-closing-svg.js`), and the full Vitest suite (unit, property-based, and regression tests). `npm run test:watch` runs Vitest in watch mode for TDD.

A `pre-push` git hook (via husky) runs `npm test` automatically before every `git push`, and `.github/workflows/test.yml` runs it again in CI on every push/PR - so a regression has two chances to get caught before it ever reaches jsDelivr.

## Two confirmed bug classes these tests guard against

Found the hard way during a long live-debugging session (2026-09-23/24) - see the `project_debugging_lessons` memory for the full account. Both are covered by dedicated tests so they can't silently reappear:

1. **Self-closing SVG tags compared via `innerHTML`.** `circle`/`path`/`svg` aren't HTML void elements - a browser always re-serializes them with an explicit closing tag on readback, even if the source used `/>`. Any `if (el.innerHTML !== template) el.innerHTML = template` pattern using self-closed SVG markup is permanently "different," causing an endless re-render loop that froze the live page. Guarded by `scripts/check-self-closing-svg.js` (also run as `test/regression/svg-markup.test.js`).
2. **An unthrottled `MutationObserver`** calling the render function directly on every DOM mutation, including unrelated background activity from FluentCommunity itself. Fine with little data, but thrashed once the missions feed had real accumulated submissions - looked exactly like a frozen page on any click, including lesson navigation. Fixed by debouncing (`scheduleMountUI()`); guarded by `test/regression/render-stability.test.js`, which calls `mountUI()` twice against unchanged state and asserts the second call produces byte-identical output.

## How `app.js` is made testable without changing what's deployed

`app.js` stays one plain script, no exports, no build step - `<script src>` loads it exactly as it sits on disk. The only addition is one small block at the very end of its IIFE:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getLessonId, getUserInfo, mountUI, scheduleMountUI };
}
```

`typeof module !== 'undefined'` is `false` in every browser, so this never runs in production. In Node, it lets `test/setup.js` `require()` the real functions fresh for each test (clearing the require cache each time, since the script has load-time side effects: timers, a `MutationObserver`, the Supabase client).

## Regression fixtures - what they catch, and what they can't

`test/fixtures/*.html` are real markup captured from the live FluentCommunity DOM during the debugging session (top bar before/after lesson completion, the Lessons sidebar). `test/regression/selectors.test.js` loads each into jsdom and re-runs `app.js`'s actual selector strings against them - this is what would have caught the `.fcom_primary_button` selector silently matching the wrong element after completion, and the `nativeNext` selector matching nothing at all because it was written for classes that don't exist in this site's real markup.

**These fixtures are a snapshot, not a live connection.** They catch *our own* code breaking against known-real markup - they cannot catch FluentCommunity changing their own markup in the future. If a selector starts failing in production despite all tests passing, the fixture is stale: re-capture it from the live DOM (right-click the element in question → Inspect → copy outerHTML, same process used throughout the original debugging session) and update the corresponding `test/fixtures/*.html` file.

## Deployment / live-testing workflow

Automated tests catch regressions in the script's own logic; they can't fully replace checking the actual WordPress site, since a lot of this script's real risk lives in its interaction with a live, changing third-party SPA (FluentCommunity/Vue) and jsDelivr's CDN caching.

**jsDelivr caching, in short:** `@main` URLs are edge-cached and can serve stale content for a while after a push, and jsDelivr's purge API silently throttles repeated purges of the same file (it returns `"status": "finished"` either way, so check the response for `"throttled": true` before trusting a purge worked).

**The reliable way to test a specific change:** push it, then reference the exact commit hash instead of `@main` in the WordPress snippet while testing:

```
https://cdn.jsdelivr.net/gh/graciax452/ss-daily-lesson-app@<commit-sha>/app.js
https://cdn.jsdelivr.net/gh/graciax452/ss-daily-lesson-app@<commit-sha>/style.css
```

A commit-hash URL has never been cached before, so every jsDelivr edge fetches it fresh on first request - no propagation delay, no throttling ambiguity. Once confirmed working, switch back to `@main` and run:

```
scripts/verify-cdn.sh <commit-sha>
```

which purges `@main` and confirms it now actually matches what was pushed, instead of guessing from a manual curl.

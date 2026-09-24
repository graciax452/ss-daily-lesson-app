import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { loadApp } from '../setup.js';

// getUserInfo()'s name-cleaning isn't exported on its own, so these properties
// are checked through getUserInfo() end-to-end, driving window.fluentComAdmin
// with fast-check-generated display names.
describe('getUserInfo() name cleaning (property-based)', () => {
  const FORBIDDEN_CHARS = /[()[\]{}<>]/;

  it('never leaves a forbidden bracket/brace/angle character in the cleaned name', () => {
    fc.assert(
      fc.property(fc.string(), (rawName) => {
        const { getUserInfo } = loadApp();
        window.fluentComAdmin = { auth: { display_name: rawName } };
        const { name } = getUserInfo();
        return !FORBIDDEN_CHARS.test(name);
      })
    );
  });

  it('cleaning an already-clean name is idempotent', () => {
    fc.assert(
      fc.property(
        fc.string().filter((s) => !FORBIDDEN_CHARS.test(s) && s.trim().length > 0),
        (cleanName) => {
          const { getUserInfo } = loadApp();
          window.fluentComAdmin = { auth: { display_name: cleanName } };
          const first = getUserInfo().name;

          window.fluentComAdmin = { auth: { display_name: first } };
          const second = getUserInfo().name;

          return first === second;
        }
      )
    );
  });
});

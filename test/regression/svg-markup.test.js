import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = path.join(__dirname, '..', '..', 'scripts', 'check-self-closing-svg.js');

// Thin wrapper so `npm test` reports this alongside everything else, not just
// `npm run lint:svg`/pretest. The script itself is also runnable standalone
// (see TESTING.md), which matters for CI steps that want a fast fail before
// paying for the full Vitest startup.
describe('SVG markup in app.js', () => {
  it('contains no self-closing tags on non-void SVG elements', () => {
    expect(() => {
      execFileSync('node', [SCRIPT_PATH], { stdio: 'pipe' });
    }).not.toThrow();
  });
});

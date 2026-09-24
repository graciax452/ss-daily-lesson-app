import { describe, it, expect } from 'vitest';
import { loadApp } from '../setup.js';

// Targets the second real production incident from this project's history:
// mountUI() re-rendering the button row on every call even when nothing
// about the underlying state changed, which combined with an unthrottled
// MutationObserver caused a thrashing loop that looked like a frozen page.
//
// Calling mountUI() twice against unchanged DOM should produce byte-identical
// output the second time - if it doesn't, something in the render is
// non-deterministic (the exact class of bug the self-closing SVG tags caused:
// the same template string never matched what the browser had actually
// stored, so the "did anything change?" check was permanently true).
describe('mountUI() render stability', () => {
  it('produces identical button-row markup on a second call with no state change', () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });

    mountUI();
    const buttonStack = document.getElementById('shonaverse-lesson-actions');
    expect(buttonStack).not.toBeNull();
    const firstRenderHtml = buttonStack.innerHTML;

    mountUI();
    const secondRenderHtml = document.getElementById('shonaverse-lesson-actions').innerHTML;

    expect(secondRenderHtml).toBe(firstRenderHtml);
  });

  it('does not duplicate the lessons-toggle icon in the top bar across repeated calls', () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });

    mountUI();
    mountUI();
    mountUI();

    expect(document.querySelectorAll('#sv-toc-toggle-btn').length).toBe(1);
  });

  it('does not create more than one mission-submission modal across repeated calls', () => {
    const { mountUI } = loadApp({ fixture: 'full-lesson-page' });

    mountUI();
    mountUI();

    expect(document.querySelectorAll('#sv-mission-modal-wrap').length).toBe(1);
  });
});

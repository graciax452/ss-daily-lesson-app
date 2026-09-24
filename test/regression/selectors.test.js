import { describe, it, expect, beforeEach } from 'vitest';
import { readFixture } from '../setup.js';

// These tests load real markup captured from the live FluentCommunity DOM
// (see test/fixtures/*.html and TESTING.md for how/when to re-capture it) and
// re-run app.js's exact selector strings against it directly - not through
// mountUI(), so a broken selector fails here with a clear message instead of
// silently returning null and surfacing as a confusing production bug.
//
// This is the test that would have caught two real incidents from this
// project's history: the nativeComplete selector matching the wrong element
// after a lesson was marked complete (because .fcom_primary_button is
// removed from the button on completion), and the nativeNext selector never
// matching anything because it was written for classes that don't exist in
// this site's actual markup.

function mount(fixtureName) {
  document.body.innerHTML = `<div class="fcom_lesson_wrap">${readFixture(fixtureName)}</div>`;
}

describe('nativeComplete selector (.fcom_back_space .fcom_lesson_nav .el-button--info)', () => {
  const SELECTOR = '.fcom_back_space .fcom_lesson_nav .el-button--info';

  it('matches the button and reads "Complete Lesson" before completion', () => {
    mount('lesson-not-completed');
    const el = document.querySelector(SELECTOR);
    expect(el).not.toBeNull();
    expect(el.textContent.trim().toLowerCase()).not.toBe('completed');
  });

  it('still matches the same button and reads "Completed" after completion, despite fcom_primary_button being removed', () => {
    mount('lesson-completed');
    const el = document.querySelector(SELECTOR);
    expect(el).not.toBeNull();
    expect(el.textContent.trim().toLowerCase()).toBe('completed');
  });
});

describe('nativeNext selector (.fcom_lesson_header .fcom_lesson_nav button[aria-label="Next lesson"])', () => {
  const SELECTOR = '.fcom_lesson_header .fcom_lesson_nav button[aria-label="Next lesson"]';

  it('matches and is enabled when a next lesson exists', () => {
    mount('lesson-completed');
    const el = document.querySelector(SELECTOR);
    expect(el).not.toBeNull();
    expect(el.getAttribute('aria-disabled')).not.toBe('true');
  });

  it('matches but is marked aria-disabled on the last lesson of a course', () => {
    mount('lesson-completed-last');
    const el = document.querySelector(SELECTOR);
    expect(el).not.toBeNull();
    expect(el.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('lesson number parsing source (.fcom_lesson_number)', () => {
  it('contains a "Lesson X of Y" pattern app.js can parse', () => {
    mount('lesson-not-completed');
    const el = document.querySelector('.fcom_lesson_number');
    expect(el).not.toBeNull();
    expect(el.textContent).toMatch(/Lesson\s+\d+\s+of\s+\d+/i);
  });
});

describe('Lessons sidebar drawer targeting', () => {
  beforeEach(() => {
    document.body.innerHTML = readFixture('lessons-sidebar');
  });

  it('finds the sidebar title, its el-scrollbar ancestor, and that ancestor\'s parent (the drawer target)', () => {
    // Mirrors the exact traversal used in app.js to tag the sidebar's outer
    // wrapper for the slide-in/out drawer, since that wrapper's real class
    // name was never identified - see project_debugging_lessons memory.
    const tocTitle = document.querySelector('.fcom_section_sidebar_title');
    expect(tocTitle).not.toBeNull();

    const scrollbarRoot = tocTitle.closest('.el-scrollbar');
    expect(scrollbarRoot).not.toBeNull();

    const tocOuterWrapper = scrollbarRoot.parentElement;
    expect(tocOuterWrapper).not.toBeNull();
  });

  it('reads the course progress percentage from the native progress bar', () => {
    const el = document.querySelector('.fcom_course_progress_footer .el-progress');
    expect(el).not.toBeNull();
    expect(el.getAttribute('aria-valuenow')).toBe('50');
  });
});

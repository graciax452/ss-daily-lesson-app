import { describe, it, expect, afterEach } from 'vitest';
import { loadApp } from '../setup.js';

describe('getLessonId()', () => {
  afterEach(() => {
    delete window.fluentComAdmin;
    window.history.pushState({}, '', '/');
  });

  it('uses window.fluentComAdmin.current_lesson.id when present', () => {
    const { getLessonId } = loadApp();
    window.fluentComAdmin = { current_lesson: { id: 42 } };
    expect(getLessonId()).toBe('42');
  });

  it('falls back to the feed_comment_form_<id> element when fluentComAdmin is absent', () => {
    const { getLessonId } = loadApp();
    const box = document.createElement('div');
    box.id = 'feed_comment_form_123';
    document.body.appendChild(box);
    expect(getLessonId()).toBe('123');
  });

  it('falls back to a /lessons/<id> URL match when nothing else is available', () => {
    const { getLessonId } = loadApp();
    window.history.pushState({}, '', '/lessons/456');
    expect(getLessonId()).toBe('456');
  });

  it('falls back to a ?lesson_id=<id> query match', () => {
    const { getLessonId } = loadApp();
    window.history.pushState({}, '', '/?lesson_id=789');
    expect(getLessonId()).toBe('789');
  });

  it('falls back to the hardcoded default when nothing matches', () => {
    const { getLessonId } = loadApp();
    expect(getLessonId()).toBe('75');
  });
});

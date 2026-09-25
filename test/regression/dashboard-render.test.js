import { describe, it, expect } from 'vitest';
import { loadDashboard } from '../setup.js';

const LESSONS = [
  { id: '75', title: 'Lesson 1', url: 'https://example.com/lesson-75' },
  { id: '76', title: 'Lesson 2', url: 'https://example.com/lesson-76' },
];

describe('renderDashboard()', () => {
  it('shows a "coming soon" card when the real manifest is empty (no lessons published yet)', async () => {
    const { renderDashboard, LESSONS: realLessons } = loadDashboard();
    expect(realLessons).toEqual([]); // Daily Shona Lessons is still a draft as of this writing

    await renderDashboard();

    const root = document.getElementById('sv-dashboard-root');
    expect(root.textContent).toContain('Coming soon');
  });

  it('shows 0 completed and a streak of 0 with no completion history, and points at the first lesson', async () => {
    const { renderDashboard } = loadDashboard();
    await renderDashboard(LESSONS);

    const root = document.getElementById('sv-dashboard-root');
    expect(root.textContent).toContain('0');
    expect(root.querySelector('.sv-dash-lesson-title').textContent).toBe(LESSONS[0].title);
    expect(root.querySelector('.sv-dash-lesson-btn').getAttribute('href')).toBe(LESSONS[0].url);
  });

  it('counts completed lessons and points at the next not-yet-completed one', async () => {
    const { renderDashboard } = loadDashboard({
      supabaseOverrides: {
        selectResult: {
          data: [{ lesson_id: LESSONS[0].id, completed_at: new Date().toISOString() }],
          error: null,
        },
      },
    });
    await renderDashboard(LESSONS);

    const root = document.getElementById('sv-dashboard-root');
    const statValues = Array.from(root.querySelectorAll('.sv-dash-stat-value')).map((el) => el.textContent);
    expect(statValues).toContain('1');
    expect(root.querySelector('.sv-dash-lesson-title').textContent).toBe(LESSONS[1].title);
  });

  it('shows an "all caught up" message once every lesson is completed', async () => {
    const { renderDashboard } = loadDashboard({
      supabaseOverrides: {
        selectResult: {
          data: LESSONS.map((l) => ({ lesson_id: l.id, completed_at: new Date().toISOString() })),
          error: null,
        },
      },
    });
    await renderDashboard(LESSONS);

    const root = document.getElementById('sv-dashboard-root');
    expect(root.querySelector('.sv-dash-lesson-btn')).not.toBeNull();
    expect(root.textContent).toContain('All caught up');
  });

  it('does nothing if #sv-dashboard-root is missing from the page', async () => {
    const { renderDashboard } = loadDashboard();
    document.body.innerHTML = '';
    await expect(renderDashboard(LESSONS)).resolves.not.toThrow();
  });
});

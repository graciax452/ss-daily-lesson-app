(function() {
  // === CONFIGURATION ===
  const SUPABASE_URL = 'https://zmuhinskhofhvyclkrbr.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptdWhpbnNraG9maHZ5Y2xrcmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MjA3NzEsImV4cCI6MjA5OTE5Njc3MX0.eRmLcHn2ywawr2AC_J4mPz3TrDxJVt0qnEMVc9mVSnI';
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Manual lessons manifest - FluentCommunity's lesson list only exists in the
  // DOM on lesson-related pages, not here, and there's no confirmed lessons
  // API to pull this from instead. Keep this in sync by hand for now (see the
  // plan's "known limitation" note); revisit with a live API investigation if
  // the course grows large enough that this becomes a chore.
  //
  // Starts empty on purpose: "Daily Shona Lessons" (the course this dashboard
  // is for) is still a draft with 0 published lessons as of this writing.
  // Add an entry here for each lesson as it goes live, e.g.:
  // { id: '123', title: 'Lesson 1', url: 'https://speakshona.com/shonaverse/course/shona-lessons/lessons/123' }
  const LESSONS = [];

  const COURSE_URL = 'https://speakshona.com/shonaverse/course/shona-lessons/lessons';

  // Same extraction logic as app.js's getUserInfo() - duplicated rather than
  // shared since this file loads on a page where app.js isn't present, and
  // this project deliberately has no build step to share code between them.
  function getUserInfo() {
    let name = '';
    let avatar = '';

    const u = window.fluentComAdmin?.auth || window.fcom_user;
    if (u) {
      name = u.display_name || u.name || u.first_name || '';
      avatar = u.avatar || u.avatar_url || '';
    }

    name = name.replace(/[()[\]{}<>]/g, '').trim();

    return {
      name: name || 'Tsitsi C',
      avatar: avatar || '',
    };
  }

  // Same algorithm as app.js's calculateStreak() - see that file for the
  // property-based tests proving its behavior; duplicated here for the same
  // no-shared-file reason as getUserInfo() above.
  function calculateStreak(completedAtList, referenceDate = new Date()) {
    const daySet = new Set(completedAtList.map((d) => new Date(d).toISOString().slice(0, 10)));
    let streak = 0;
    const cursor = new Date(referenceDate);
    while (daySet.has(cursor.toISOString().slice(0, 10))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  // Distinct lessons completed, deduped by id so a stray duplicate
  // lesson_completions row (e.g. from a failed upsert retry) can't inflate
  // the count.
  function getTotalCompletedCount(completedLessonIds) {
    return new Set(completedLessonIds.map(String)).size;
  }

  // First manifest entry the learner hasn't completed yet, in manifest order.
  // Returns null once every listed lesson is done.
  function getCurrentLesson(lessons, completedLessonIds) {
    const completedSet = new Set(completedLessonIds.map(String));
    return lessons.find((l) => !completedSet.has(String(l.id))) || null;
  }

  // `lessons` defaults to the real manifest above; accepting it as a param
  // keeps tests independent of that manifest's real (currently empty, later
  // growing) content, without changing production behavior.
  async function renderDashboard(lessons = LESSONS) {
    const root = document.getElementById('sv-dashboard-root');
    if (!root) return;

    root.innerHTML = '<div style="text-align:center; padding:40px 0; color:var(--sv-text-muted, #78716C);">Loading your progress...</div>';

    const user = getUserInfo();
    const { data: completions, error } = await supabase
      .from('lesson_completions')
      .select('lesson_id, completed_at')
      .eq('user_name', user.name);

    if (error) {
      root.innerHTML = `<div style="text-align:center; padding:40px 0; color:var(--sv-red, #EB5555);">Could not load your progress: ${error.message}</div>`;
      return;
    }

    const rows = completions || [];
    const completedIds = rows.map((r) => r.lesson_id);
    const completedDates = rows.map((r) => r.completed_at);

    const streak = calculateStreak(completedDates);
    const completedCount = getTotalCompletedCount(completedIds);
    const currentLesson = getCurrentLesson(lessons, completedIds);

    const svIconCheck = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
    const svIconFlame = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1 1 2 2.5 2 4.5A5.5 5.5 0 0 1 6 14c0-5 4-6 6-12z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path></svg>`;
    const svIconMap = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path><path d="M9 3v16M15 5v16" stroke="currentColor" stroke-width="1.8"></path></svg>`;

    let lessonCard;
    if (lessons.length === 0) {
      lessonCard = `
        <div class="sv-dash-lesson-card">
          <div class="sv-dash-lesson-eyebrow">Coming soon</div>
          <div class="sv-dash-lesson-title">New daily lessons are on their way</div>
          <a class="sv-dash-lesson-btn" href="${COURSE_URL}">View course</a>
        </div>
      `;
    } else if (currentLesson) {
      lessonCard = `
        <div class="sv-dash-lesson-card">
          <div class="sv-dash-lesson-eyebrow">Continue learning</div>
          <div class="sv-dash-lesson-title">${currentLesson.title}</div>
          <a class="sv-dash-lesson-btn" href="${currentLesson.url}">Start lesson</a>
        </div>
      `;
    } else {
      lessonCard = `
        <div class="sv-dash-lesson-card">
          <div class="sv-dash-lesson-eyebrow">All caught up</div>
          <div class="sv-dash-lesson-title">You've completed every lesson so far</div>
          <a class="sv-dash-lesson-btn" href="${COURSE_URL}">Browse courses</a>
        </div>
      `;
    }

    root.innerHTML = `
      <div class="sv-dash-stats">
        <div class="sv-dash-stat">
          <span class="sv-dash-stat-icon sv-dash-stat-icon-check">${svIconCheck}</span>
          <span class="sv-dash-stat-value">${completedCount}</span>
        </div>
        <div class="sv-dash-stat">
          <span class="sv-dash-stat-icon sv-dash-stat-icon-flame">${svIconFlame}</span>
          <span class="sv-dash-stat-value">${streak}</span>
        </div>
        <a class="sv-dash-curriculum-btn" href="${COURSE_URL}" aria-label="View curriculum">${svIconMap}</a>
      </div>
      ${lessonCard}
    `;
  }

  document.addEventListener('DOMContentLoaded', renderDashboard);

  // Test-only hook: never runs in a browser (typeof module is undefined there).
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getUserInfo, calculateStreak, getTotalCompletedCount, getCurrentLesson, renderDashboard, LESSONS };
  }
})();

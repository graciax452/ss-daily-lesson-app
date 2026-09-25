(function() {
  // === CONFIGURATION ===
  const SUPABASE_URL = 'https://zmuhinskhofhvyclkrbr.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InptdWhpbnNraG9maHZ5Y2xrcmJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2MjA3NzEsImV4cCI6MjA5OTE5Njc3MX0.eRmLcHn2ywawr2AC_J4mPz3TrDxJVt0qnEMVc9mVSnI'; // <-- Replace with your key
  const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Bulletproof Lesson ID extraction (Strictly Numeric)
  function getLessonId() {
    if (window.fluentComAdmin?.current_lesson?.id) {
      return String(window.fluentComAdmin.current_lesson.id);
    }
    const box = document.querySelector('[id^="feed_comment_form_"]');
    if (box) return String(box.id.replace('feed_comment_form_', ''));

    const urlMatch = window.location.href.match(/\/lessons\/(\d+)/i) || window.location.search.match(/lesson_id=(\d+)/i);
    if (urlMatch && urlMatch[1]) return String(urlMatch[1]);

    return '75'; 
  }

  // Clean user info extraction
  function getUserInfo() {
    let name = '';
    let avatar = '';
    let isAdmin = false;

    // window.fluentComAdmin has no .current_user/.me - the real logged-in
    // user object lives at window.fluentComAdmin.auth (confirmed via live
    // console inspection). Admin status isn't a simple top-level flag either:
    // it shows up as super_admin/community_admin inside each space's own
    // permissions object.
    const u = window.fluentComAdmin?.auth || window.fcom_user;
    if (u) {
      name = u.display_name || u.name || u.first_name || '';
      avatar = u.avatar || u.avatar_url || '';
      const roles = u.roles || u.community_roles || [];
      const spacePermissions = Object.values(u.spaces || {}).map((s) => s.permissions || {});
      isAdmin = roles.includes('administrator')
        || u.is_admin === true
        || spacePermissions.some((p) => p.super_admin === true || p.community_admin === true);
    }

    if (!isAdmin) {
      isAdmin = document.body.classList.contains('admin-bar') || !!document.getElementById('wpadminbar');
    }

    name = name.replace(/[()[\]{}<>]/g, '').trim();

    return {
      name: name || 'Tsitsi C',
      avatar: avatar || '',
      isAdmin: isAdmin
    };
  }

  // Load and render mission cards strictly isolated to this lesson ID
  async function loadMissionsFeed(lessonId) {
    const list = document.getElementById('sv-submissions-feed-list');
    if (!list) return;

    list.innerHTML = '<div style="text-align:center; padding:20px; color:#A8A29E;">Loading submissions...</div>';

    const currentUser = getUserInfo();

    const { data: missions, error } = await supabase
      .from('lesson_missions')
      .select(`
        *,
        lesson_mission_replies (
          id,
          user_name,
          user_avatar,
          reply_text,
          created_at
        )
      `)
      .eq('lesson_id', lessonId)
      .order('created_at', { ascending: false });

    if (error) {
      list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--sv-red); font-size:0.85rem;">Error loading submissions: ${error.message}</div>`;
      return;
    }

    if (!missions || missions.length === 0) {
      list.innerHTML = '<div style="text-align:center; padding:30px 10px; color:#A8A29E; font-size:0.9rem;">No submissions for this lesson yet. Be the first! ✍️</div>';
      return;
    }

    list.innerHTML = missions.map(m => {
      const replies = m.lesson_mission_replies || [];
      const cleanAuthor = (m.user_name || 'Learner').replace(/[()[\]{}<>]/g, '').trim();
      const initial = cleanAuthor ? cleanAuthor.charAt(0).toUpperCase() : 'S';
      
      const canDelete = currentUser.isAdmin || (currentUser.name && currentUser.name === cleanAuthor);

      return `
        <div class="sv-mission-card" style="background:#ffffff; border:1px solid var(--sv-border); border-radius:14px; padding:14px; margin-bottom:16px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
          <!-- Card Header -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
            <div style="display:flex; align-items:center; gap:10px;">
              ${m.user_avatar ? `<img src="${m.user_avatar}" style="width:34px; height:34px; border-radius:50%; object-fit:cover;">` : `<div style="width:34px; height:34px; border-radius:50%; background:var(--sv-cream); color:var(--sv-orange); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem;">${initial}</div>`}
              <div>
                <div style="font-weight:700; font-size:0.9rem; color:#1C1917;">${cleanAuthor}</div>
                <div style="font-size:0.75rem; color:#A8A29E;">${new Date(m.created_at).toLocaleDateString()}</div>
              </div>
            </div>
            
            ${canDelete ? `
              <button type="button" class="sv-delete-mission-btn" data-mission-id="${m.id}" title="Delete Submission" style="background:rgba(235,85,85,0.12); border:none; color:var(--sv-red); border-radius:6px; padding:4px 8px; font-size:0.78rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
                🗑️ Delete
              </button>
            ` : ''}
          </div>

          <!-- Memo -->
          ${m.memo ? `<p style="margin:0 0 10px 0; font-size:0.88rem; color:#44403C; line-height:1.4;">${m.memo}</p>` : ''}

          <!-- Media Display -->
          ${m.media_url ? (m.media_type === 'video'
            ? `<video src="${m.media_url}" controls playsinline style="width:100%; border-radius:10px; max-height:360px; background:#000; margin-bottom:10px;"></video>`
            : `<img src="${m.media_url}" style="width:100\%; border-radius:10px; object-fit:cover; max-height:420px; cursor:zoom-in; margin-bottom:10px;" onclick="window.open('${m.media_url}', '_blank')">`)
            : ''
          }

          <!-- Reply Bar -->
          <div style="display:flex; align-items:center; gap:12px; margin-top:8px; padding-top:8px; border-top:1px solid #F5F5F4;">
            <button type="button" class="sv-toggle-reply-btn" data-mission-id="${m.id}" style="background:none; border:none; color:#78716C; font-size:0.82rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:5px; padding:0;">
              💬 Reply ${replies.length > 0 ? `(${replies.length})` : ''}
            </button>
          </div>

          <!-- Replies Section -->
          <div id="sv-replies-${m.id}" style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--sv-border); display:${replies.length > 0 ? 'block' : 'none'};">
            <div class="sv-replies-list" style="display:flex; flex-direction:column; gap:8px; margin-bottom:10px;">
              ${replies.map(r => {
                const cleanReplyAuthor = (r.user_name || 'Learner').replace(/[()[\]{}<>]/g, '').trim();
                const canDeleteReply = currentUser.isAdmin || (currentUser.name && currentUser.name === cleanReplyAuthor);
                return `
                  <div style="background:#F8FAFC; border-radius:8px; padding:8px 10px; font-size:0.83rem; display:flex; justify-content:space-between; align-items:center;">
                    <div>
                      <span style="font-weight:700; color:#1C1917;">${cleanReplyAuthor}:</span> 
                      <span style="color:#44403C;">${r.reply_text}</span>
                    </div>
                    ${canDeleteReply ? `
                      <button type="button" class="sv-delete-reply-btn" data-reply-id="${r.id}" title="Delete Reply" style="background:none; border:none; color:var(--sv-red); opacity:0.7; cursor:pointer; font-size:0.85rem; padding:2px 6px; line-height:1;">
                        ✕
                      </button>
                    ` : ''}
                  </div>
                `;
              }).join('')}
            </div>

            <!-- Inline Reply Composer -->
            <div style="display:flex; gap:6px;">
              <input type="text" class="sv-reply-input" placeholder="Write a reply..." style="flex:1; border:1px solid #E2E8F0; border-radius:8px; padding:6px 10px; font-size:0.82rem; outline:none; background:#ffffff;">
              <button type="button" class="sv-send-reply-btn" data-mission-id="${m.id}" style="background:var(--sv-amber); color:#ffffff; border:none; border-radius:8px; padding:6px 12px; font-size:0.82rem; font-weight:600; cursor:pointer;">Send</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Toggle Reply Composer
    document.querySelectorAll('.sv-toggle-reply-btn').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-mission-id');
        const box = document.getElementById(`sv-replies-${id}`);
        if (box) box.style.display = box.style.display === 'none' ? 'block' : 'none';
      };
    });

    // Send Reply Event
    document.querySelectorAll('.sv-send-reply-btn').forEach(btn => {
      btn.onclick = async () => {
        const missionId = btn.getAttribute('data-mission-id');
        const parent = btn.closest(`#sv-replies-${missionId}`);
        const input = parent.querySelector('.sv-reply-input');
        const text = input.value.trim();
        if (!text) return;

        btn.disabled = true;
        btn.textContent = '...';

        const user = getUserInfo();
        const { error } = await supabase.from('lesson_mission_replies').insert([{
          mission_id: missionId,
          user_name: user.name,
          user_avatar: user.avatar,
          reply_text: text
        }]);

        if (!error) {
          input.value = '';
          loadMissionsFeed(getLessonId());
        } else {
          alert('Could not post reply: ' + error.message);
          btn.disabled = false;
          btn.textContent = 'Send';
        }
      };
    });

    // Delete Mission Event
    document.querySelectorAll('.sv-delete-mission-btn').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Are you sure you want to delete this mission submission?')) return;
        const missionId = btn.getAttribute('data-mission-id');
        btn.disabled = true;

        const { error } = await supabase
          .from('lesson_missions')
          .delete()
          .eq('id', missionId);

        if (!error) {
          loadMissionsFeed(getLessonId());
        } else {
          alert('Could not delete: ' + error.message);
          btn.disabled = false;
        }
      };
    });

    // Delete Reply Event
    document.querySelectorAll('.sv-delete-reply-btn').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this reply?')) return;
        const replyId = btn.getAttribute('data-reply-id');
        btn.disabled = true;

        const { error } = await supabase
          .from('lesson_mission_replies')
          .delete()
          .eq('id', replyId);

        if (!error) {
          loadMissionsFeed(getLessonId());
        } else {
          alert('Could not delete reply: ' + error.message);
          btn.disabled = false;
        }
      };
    });
  }

  // Extract "Lesson X of Y" -> X, from FluentCommunity's own lesson header text
  function getLessonNumber() {
    const el = document.querySelector('.fcom_lesson_number');
    const match = el && el.textContent.match(/Lesson\s+(\d+)\s+of\s+(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  // Read course completion % directly from FluentCommunity's own progress bar
  function getCourseProgress() {
    const el = document.querySelector('.fcom_course_progress_footer .el-progress');
    const val = el && el.getAttribute('aria-valuenow');
    return val !== null ? parseInt(val, 10) : null;
  }

  // Count consecutive calendar days, ending at referenceDate, with at least
  // one completion. referenceDate defaults to now in production; tests pass
  // a fixed date so results are deterministic.
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

  async function celebrateLessonCompletion(lessonId) {
    console.log('[SV celebrate] celebrateLessonCompletion() running for lesson', lessonId);
    const user = getUserInfo();
    console.log('[SV celebrate] user:', user);

    const { error: upsertErr } = await supabase
      .from('lesson_completions')
      .upsert([{ user_name: user.name, lesson_id: lessonId }], { onConflict: 'user_name,lesson_id' });

    if (upsertErr) {
      console.error('[SV celebrate] upsert into lesson_completions failed:', upsertErr.message, upsertErr);
      return;
    }
    console.log('[SV celebrate] upsert into lesson_completions succeeded');

    const { data: completions, error: selectErr } = await supabase
      .from('lesson_completions')
      .select('completed_at')
      .eq('user_name', user.name);

    if (selectErr) {
      console.error('[SV celebrate] could not read back completions for streak calc:', selectErr.message, selectErr);
    }

    const streak = calculateStreak((completions || []).map((c) => c.completed_at));
    const progress = getCourseProgress();
    const lessonNumber = getLessonNumber();
    console.log('[SV celebrate] streak:', streak, 'progress:', progress, 'lessonNumber:', lessonNumber);

    const { data: existingMissions, error: missionsErr } = await supabase
      .from('lesson_missions')
      .select('id')
      .eq('lesson_id', lessonId)
      .eq('user_name', user.name);

    if (missionsErr) {
      console.error('[SV celebrate] could not check for existing mission:', missionsErr.message, missionsErr);
    }

    const hasSubmittedMission = existingMissions && existingMissions.length > 0;
    console.log('[SV celebrate] hasSubmittedMission:', hasSubmittedMission, '- showing modal now');

    showCelebrationModal({ lessonNumber, streak, progress, hasSubmittedMission });
  }

  function showCelebrationModal({ lessonNumber, streak, progress, hasSubmittedMission }) {
    let wrap = document.getElementById('sv-celebration-modal-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'sv-celebration-modal-wrap';
      wrap.className = 'sv-modal-overlay';
      document.body.appendChild(wrap);
      wrap.onclick = (e) => { if (e.target === wrap) wrap.classList.remove('is-active'); };
    }

    const dayLabel = lessonNumber ? `Lesson ${lessonNumber} Complete!` : 'Lesson Complete!';
    const progressLabel = progress !== null ? `${progress}%` : '—';

    wrap.innerHTML = `
      <div class="sv-modal-card sv-celebration-card">
        <button type="button" id="sv-celebration-close" style="position:absolute; top:16px; right:16px; background:none; border:none; font-size:1.5rem; line-height:1; color:#94A3B8; cursor:pointer;">&times;</button>
        <div style="text-align:center;">
          <div style="font-size:2.5rem; margin-bottom:8px;">🎉</div>
          <h2 style="margin:0 0 4px; font-size:1.4rem; font-weight:800; color:var(--sv-ink);">${dayLabel}</h2>
          <p style="margin:0 0 20px; color:var(--sv-text-muted); font-size:0.95rem;">You did it! Keep the momentum going.</p>
        </div>
        <div style="display:flex; gap:12px; margin-bottom:20px;">
          <div style="flex:1; background:var(--sv-cream); border-radius:14px; padding:16px; text-align:center;">
            <div style="font-size:1.6rem; font-weight:800; color:var(--sv-orange);">🔥 ${streak}</div>
            <div style="font-size:0.8rem; color:var(--sv-text-muted); margin-top:4px;">Day Streak</div>
          </div>
          <div style="flex:1; background:var(--sv-cream); border-radius:14px; padding:16px; text-align:center;">
            <div style="font-size:1.6rem; font-weight:800; color:var(--sv-lime);">📊 ${progressLabel}</div>
            <div style="font-size:0.8rem; color:var(--sv-text-muted); margin-top:4px;">Course Progress</div>
          </div>
        </div>
        ${!hasSubmittedMission ? `
          <button type="button" id="sv-celebration-submit-mission" style="width:100%; background:var(--sv-terracotta); color:#ffffff; border:none; padding:13px; border-radius:12px; font-weight:700; font-size:0.98rem; cursor:pointer; margin-bottom:10px;">
            ✍️ Submit Today's Mission
          </button>
        ` : ''}
        <button type="button" id="sv-celebration-continue" style="width:100%; background:${hasSubmittedMission ? 'var(--sv-terracotta)' : 'transparent'}; color:${hasSubmittedMission ? '#ffffff' : 'var(--sv-text-muted)'}; border:${hasSubmittedMission ? 'none' : '1.5px solid var(--sv-border)'}; padding:13px; border-radius:12px; font-weight:700; font-size:0.98rem; cursor:pointer;">
          Continue
        </button>
      </div>
    `;

    wrap.classList.add('is-active');

    document.getElementById('sv-celebration-close')?.addEventListener('click', () => {
      wrap.classList.remove('is-active');
    });

    document.getElementById('sv-celebration-continue')?.addEventListener('click', () => {
      wrap.classList.remove('is-active');
    });

    document.getElementById('sv-celebration-submit-mission')?.addEventListener('click', () => {
      wrap.classList.remove('is-active');
      document.getElementById('sv-mission-modal-wrap')?.classList.add('is-active');
    });
  }

  function mountUI() {
    if (document.body.getAttribute('data-route') !== 'view_lesson') return;

    const lessonBody = document.querySelector('.fcom_lesson_details .fcom_lesson_content');
    const commentsWrap = document.querySelector('.fcom_lesson_comments');
    const lessonId = getLessonId();

    if (commentsWrap) {
      let feedWrap = document.getElementById('sv-submissions-feed-wrap');
      
      if (!feedWrap || feedWrap.getAttribute('data-lesson-id') !== lessonId) {
        Array.from(commentsWrap.children).forEach(child => {
          if (child.id !== 'sv-submissions-feed-wrap') child.style.display = 'none';
        });

        if (!feedWrap) {
          feedWrap = document.createElement('div');
          feedWrap.id = 'sv-submissions-feed-wrap';
          commentsWrap.appendChild(feedWrap);
        }

        feedWrap.setAttribute('data-lesson-id', lessonId);
        feedWrap.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h3 style="margin:0; font-size:1.15rem; font-weight:700; color:#1C1917;">Class Submissions ✨</h3>
          </div>
          <div id="sv-submissions-feed-list">
            <div style="text-align:center; padding:20px; color:#A8A29E;">Loading submissions...</div>
          </div>
        `;
        loadMissionsFeed(lessonId);
      }
    }

    if (lessonBody) {
      let buttonStack = document.getElementById('shonaverse-lesson-actions');
      if (!buttonStack) {
        buttonStack = document.createElement('div');
        buttonStack.id = 'shonaverse-lesson-actions';
        buttonStack.className = 'sv-action-buttons-row';
        lessonBody.appendChild(buttonStack);
      }

      const nativeComplete = document.querySelector('.fcom_back_space .fcom_lesson_nav .el-button--info');
      const nativeNextBtn = document.querySelector('.fcom_lesson_header .fcom_lesson_nav button[aria-label="Next lesson"]');
      const nativeNext = (nativeNextBtn && nativeNextBtn.getAttribute('aria-disabled') !== 'true') ? nativeNextBtn : null;

      let isCompleted = false;
      if (nativeComplete && nativeComplete.textContent.trim().toLowerCase() === 'completed') {
          isCompleted = true;
      }

      const svIconCircle = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"></circle></svg>`;
      const svIconCheck = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
      const svIconArrow = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
      const svIconPencil = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 20h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
      const svIconPin = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 22s7-7.58 7-13a7 7 0 1 0-14 0c0 5.42 7 13 7 13z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path><circle cx="12" cy="9" r="2.5" stroke="currentColor" stroke-width="2"></circle></svg>`;

      // Tag the Lessons sidebar's actual outer wrapper (unknown class name) so CSS can turn it into a drawer
      const tocTitle = document.querySelector('.fcom_section_sidebar_title');
      const tocScrollbarRoot = tocTitle ? tocTitle.closest('.el-scrollbar') : null;
      const tocOuterWrapper = tocScrollbarRoot ? tocScrollbarRoot.parentElement : null;
      if (tocOuterWrapper && !tocOuterWrapper.classList.contains('sv-toc-drawer')) {
        tocOuterWrapper.classList.add('sv-toc-drawer');
      }

      // Backdrop for the drawer, click to close
      if (!document.getElementById('sv-toc-backdrop')) {
        const backdrop = document.createElement('div');
        backdrop.id = 'sv-toc-backdrop';
        backdrop.className = 'sv-toc-backdrop';
        backdrop.addEventListener('click', () => {
          document.body.classList.remove('sv-toc-open');
        });
        document.body.appendChild(backdrop);
      }

      // Toggle icon in the native top bar, just before Complete/Completed
      if (nativeComplete && !document.getElementById('sv-toc-toggle-btn')) {
        const tocBtn = document.createElement('button');
        tocBtn.type = 'button';
        tocBtn.id = 'sv-toc-toggle-btn';
        tocBtn.className = 'sv-icon-btn-topnav';
        tocBtn.setAttribute('aria-label', 'Toggle lessons list');
        tocBtn.innerHTML = svIconPin;
        tocBtn.addEventListener('click', () => {
          document.body.classList.toggle('sv-toc-open');
        });
        nativeComplete.parentElement.insertBefore(tocBtn, nativeComplete);
      }

      let rightBtnHtml = '';
      if (isCompleted && nativeNext) {
          rightBtnHtml = `<button type="button" class="sv-btn sv-btn-next" id="sv-trigger-next-btn">${svIconCheck} Complete ${svIconArrow}</button>`;
      } else if (isCompleted && !nativeNext) {
          rightBtnHtml = `<button type="button" class="sv-btn sv-btn-done" disabled>${svIconCheck} Lesson Completed</button>`;
      } else if (!isCompleted && nativeComplete) {
          rightBtnHtml = `<button type="button" class="sv-btn sv-btn-complete" id="sv-trigger-complete-btn">${svIconCircle} Mark Lesson Complete</button>`;
      }

      const desiredHtml = `
        <button type="button" class="sv-btn sv-btn-submit" id="sv-open-modal-btn">
          ${svIconPencil} Submit Mission
        </button>
        ${rightBtnHtml}
      `;

      if (buttonStack.innerHTML !== desiredHtml) {
        buttonStack.innerHTML = desiredHtml;

        document.getElementById('sv-open-modal-btn')?.addEventListener('click', () => {
          document.getElementById('sv-mission-modal-wrap').classList.add('is-active');
        });

        document.getElementById('sv-trigger-complete-btn')?.addEventListener('click', () => {
          if (nativeComplete) nativeComplete.click();
          // Always fires (no waiting for/polling FluentCommunity's own state
          // to confirm anything - we're recording our own completion record
          // independently, so there's nothing to conditionally wait for; that
          // approach broke when lessons get manually marked done/undone).
          // A short FIXED delay (not a condition to wait on, so it can't get
          // stuck) gives FluentCommunity's own course-progress bar time to
          // recalculate after its native completion AJAX call, since reading
          // it at the instant of the click was grabbing the stale value.
          const targetLessonId = getLessonId();
          setTimeout(() => celebrateLessonCompletion(targetLessonId), 1500);
        });

        document.getElementById('sv-trigger-next-btn')?.addEventListener('click', () => {
          if (nativeNext) nativeNext.click();
        });
      }
    }

    if (!document.getElementById('sv-mission-modal-wrap')) {
      const modalWrap = document.createElement('div');
      modalWrap.id = 'sv-mission-modal-wrap';
      modalWrap.className = 'sv-modal-overlay';
      modalWrap.innerHTML = `
        <div class="sv-modal-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px;">
            <h3 style="margin:0; font-size:1.15rem; font-weight:700; color:#1C1917; display:flex; align-items:center; gap:8px;">
              <span>✍️</span> Submit Mission
            </h3>
            <button type="button" id="sv-close-modal-x" style="background:none; border:none; font-size:1.5rem; line-height:1; color:#94A3B8; cursor:pointer;">&times;</button>
          </div>

          <p style="font-size:0.9rem; font-weight:600; color:#334155; margin:0 0 10px 0;">Photo or video of your practice</p>

          <div style="border:1.5px dashed #CBD5E1; border-radius:14px; background:#F8FAFC; padding:18px 14px; text-align:center; margin-bottom:16px;">
            <input type="file" id="sv-modal-file-input" accept="image/*,video/*,audio/*" style="display:none;" />
            <button type="button" onclick="document.getElementById('sv-modal-file-input').click()" style="background:#ffffff; border:1px solid #E2E8F0; color:#334155; padding:10px 20px; border-radius:10px; font-weight:600; font-size:0.9rem; cursor:pointer;">
              📁 Choose Photo / Video / Audio
            </button>
            <p id="sv-file-status" style="margin:8px 0 0; font-size:0.82rem; font-weight:600; color:#D97706; word-break:break-all;"></p>
          </div>

          <p style="font-size:0.9rem; font-weight:600; color:#334155; margin:0 0 8px 0;">Memo for today's mission</p>
          <textarea id="sv-modal-memo" placeholder="Share your thoughts..." rows="3" style="width:100%; border:1.5px solid #E2E8F0; border-radius:12px; padding:12px; font-family:inherit; font-size:0.92rem; outline:none; box-sizing:border-box; margin-bottom:18px; background:#F8FAFC;"></textarea>

          <button type="button" id="sv-modal-submit-btn" style="width:100%; background:var(--sv-terracotta); color:#ffffff; border:none; padding:13px; border-radius:12px; font-weight:700; font-size:0.98rem; cursor:pointer;">
            Submit Mission ✨
          </button>
        </div>
      `;
      document.body.appendChild(modalWrap);

      let stagedFile = null;
      document.getElementById('sv-modal-file-input').addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) {
          stagedFile = e.target.files[0];
          document.getElementById('sv-file-status').textContent = `✓ Ready: ${stagedFile.name}`;
        }
      });

      const closeModal = () => {
        modalWrap.classList.remove('is-active');
        stagedFile = null;
        document.getElementById('sv-modal-memo').value = '';
        document.getElementById('sv-file-status').textContent = '';
        document.getElementById('sv-modal-submit-btn').textContent = 'Submit Mission ✨';
        document.getElementById('sv-modal-submit-btn').disabled = false;
      };

      document.getElementById('sv-close-modal-x').onclick = closeModal;
      modalWrap.onclick = (e) => { if (e.target === modalWrap) closeModal(); };

      document.getElementById('sv-modal-submit-btn').addEventListener('click', async () => {
        const btn = document.getElementById('sv-modal-submit-btn');
        const memo = document.getElementById('sv-modal-memo').value.trim();

        if (!stagedFile && !memo) {
          alert('Please upload a photo/video or add a comment.');
          return;
        }

        btn.disabled = true;
        btn.textContent = 'Uploading...';

        try {
          let mediaUrl = '';
          const isVideo = stagedFile?.type.startsWith('video/');

          if (stagedFile) {
            const fileExt = stagedFile.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

            const { data: uploadData, error: uploadErr } = await supabase.storage
              .from('missions')
              .upload(fileName, stagedFile);

            if (uploadErr) throw uploadErr;

            const { data: urlData } = supabase.storage
              .from('missions')
              .getPublicUrl(fileName);

            mediaUrl = urlData.publicUrl;
          }

          const user = getUserInfo();
          const targetLessonId = getLessonId();

          const { error: insertErr } = await supabase
            .from('lesson_missions')
            .insert([{
              lesson_id: targetLessonId,
              user_name: user.name,
              user_avatar: user.avatar,
              memo: memo,
              media_url: mediaUrl,
              media_type: isVideo ? 'video' : 'image'
            }]);

          if (insertErr) throw insertErr;

          closeModal();
          loadMissionsFeed(targetLessonId);
        } catch (err) {
          console.error(err);
          alert('Upload failed: ' + (err.message || 'Please check your connection.'));
          btn.disabled = false;
          btn.textContent = 'Submit Mission ✨';
        }
      });
    }
  }

  // Debounce mountUI(): a single lesson navigation can fire many DOM mutations
  // in quick succession (FluentCommunity tearing down/rebuilding content), and
  // without this, each one would trigger a full, unconditional re-render.
  let mountUIScheduled = false;
  function scheduleMountUI() {
    if (mountUIScheduled) return;
    mountUIScheduled = true;
    setTimeout(() => {
      mountUIScheduled = false;
      mountUI();
    }, 150);
  }

  let lastSeenLessonId = getLessonId();
  setInterval(() => {
    const currentLessonId = getLessonId();
    const wrap = document.getElementById('sv-submissions-feed-wrap');
    if (currentLessonId !== lastSeenLessonId || (document.querySelector('.fcom_lesson_comments') && !wrap)) {
      lastSeenLessonId = currentLessonId;
      scheduleMountUI();
    }
  }, 250);

  window.addEventListener('popstate', () => {
    setTimeout(scheduleMountUI, 50);
  });

  const observer = new MutationObserver(scheduleMountUI);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', mountUI);

  // Test-only hook: never runs in a browser (typeof module is undefined there).
  // Lets the test suite require() the real functions instead of duplicating them.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getLessonId, getUserInfo, mountUI, scheduleMountUI, getLessonNumber, getCourseProgress, calculateStreak };
  }
})();

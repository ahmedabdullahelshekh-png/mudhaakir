/* ============================================
   مُذاكِر — Core App Logic
   Spaced Repetition System
   ============================================ */

const COLORS = ['#6c8eff','#a78bfa','#34d399','#fbbf24','#f87171','#38bdf8','#fb923c','#e879f9'];

// Spaced repetition intervals in hours
const INTERVALS = [0, 1.5, 24, 96, 264]; // session 1,2,3,4,5

const QUESTIONS_BANK = {
  1: [ // Session 1 — definitions & components
    (topic) => `ما هو تعريف "${topic}"؟`,
    (topic) => `ما هي المكونات الرئيسية لـ "${topic}"؟`,
    (topic) => `اذكر ثلاثة أشياء تعرفها الآن عن "${topic}"`,
    (topic) => `ما الوظيفة الأساسية التي تعلمتها في "${topic}"؟`,
  ],
  2: [ // Session 2 — different phrasing
    (topic) => `بكلماتك أنت، ما معنى "${topic}"؟`,
    (topic) => `كيف تشرح "${topic}" لشخص لا يعرفه؟`,
    (topic) => `ما الذي تتذكره الآن عن "${topic}" بدون الرجوع للمصدر؟`,
    (topic) => `ما هو الجزء الأصعب الذي تعلمته في "${topic}"؟`,
  ],
  3: [ // Session 3 — application & linking
    (topic) => `كيف يرتبط "${topic}" بما درسته سابقاً؟`,
    (topic) => `أعطِ مثالاً تطبيقياً على "${topic}"`,
    (topic) => `ما الفرق بين "${topic}" وما كنت تعتقده قبل الدراسة؟`,
    (topic) => `في أي حالة عملية يُستخدم "${topic}"؟`,
  ],
  4: [ // Session 4 — analytical
    (topic) => `حلّل لماذا "${topic}" مهم في تخصصك`,
    (topic) => `ما الذي يمكن أن يحدث إذا أُهمل "${topic}"؟`,
    (topic) => `قارن بين جانبين مختلفين في "${topic}"`,
    (topic) => `ما القواعد الأساسية التي تحكم "${topic}"؟`,
  ],
  5: [ // Session 5 — full recall
    (topic) => `اسرد كل ما تعرفه عن "${topic}" من البداية`,
    (topic) => `إذا كنت تشرح "${topic}" في اختبار، ماذا ستكتب؟`,
    (topic) => `ما الذي تبقّى في ذاكرتك عن "${topic}" بعد كل هذا الوقت؟`,
  ],
};

const App = (() => {

  // ── State ──────────────────────────────────
  let state = {
    topics: [],    // { id, name, subjectId, studyTime, notes, sessions: [], cardIds: [] }
    subjects: [],  // { id, name, color }
    cards: [],     // { id, topicId, question, answer, created }
    streak: 0,
    lastStudyDate: null,
    completedToday: 0,
    heatmap: {},   // { 'YYYY-MM-DD': count }
  };

  let currentFlashcardIndex = 0;
  let currentFlashcards = [];
  let currentFlashcardRevealed = false;
  let selectedSubjectColor = COLORS[0];
  let currentFilterSubject = null;

  // ── Persistence ────────────────────────────
  function save() {
    localStorage.setItem('mudhaakir_state', JSON.stringify(state));
  }

  function load() {
    const raw = localStorage.getItem('mudhaakir_state');
    if (raw) {
      state = { ...state, ...JSON.parse(raw) };
    }
  }

  // ── Init ───────────────────────────────────
  function init() {
    load();
    checkStreak();

    const seen = localStorage.getItem('mudhaakir_seen');
    if (seen) {
      document.getElementById('splash').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      renderDashboard();
      renderSubjects();
      renderFlashcards();
      renderStats();
    }

    // Check notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      setTimeout(() => {
        document.getElementById('notif-banner').classList.remove('hidden');
      }, 3000);
    }
  }

  function startOnboarding() {
    localStorage.setItem('mudhaakir_seen', '1');
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    renderDashboard();
    renderSubjects();
    renderFlashcards();
    renderStats();
  }

  // ── Navigation ─────────────────────────────
  function navigate(view) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`view-${view}`).classList.add('active');
    document.querySelector(`[data-view="${view}"]`).classList.add('active');

    if (view === 'dashboard') renderDashboard();
    if (view === 'subjects')  renderSubjects();
    if (view === 'flashcards') renderFlashcards();
    if (view === 'stats')     renderStats();
  }

  // ── Streak ─────────────────────────────────
  function checkStreak() {
    const today = todayStr();
    if (state.lastStudyDate === today) return;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().split('T')[0];
    if (state.lastStudyDate === yStr) {
      // streak continues
    } else if (state.lastStudyDate && state.lastStudyDate !== today) {
      state.streak = 0;
    }
  }

  function todayStr() {
    return new Date().toISOString().split('T')[0];
  }

  // ── Sessions Logic ─────────────────────────
  function getNextSession(topic) {
    const done = topic.sessions.filter(s => s.completed).length;
    return done + 1; // next session number (1-5)
  }

  function getNextSessionTime(topic) {
    const done = topic.sessions.filter(s => s.completed);
    if (done.length === 0) {
      // First session: use study time
      return new Date(topic.studyTime).getTime() + INTERVALS[0] * 3600000;
    }
    const lastCompleted = done[done.length - 1];
    const sessionNum = done.length; // index into INTERVALS
    const hoursToAdd = INTERVALS[Math.min(sessionNum, INTERVALS.length - 1)];
    return new Date(lastCompleted.time).getTime() + hoursToAdd * 3600000;
  }

  function isDueNow(topic) {
    if (allDone(topic)) return false;
    return getNextSessionTime(topic) <= Date.now();
  }

  function allDone(topic) {
    return topic.sessions.filter(s => s.completed).length >= 5;
  }

  function sessionLabel(num) {
    const labels = ['', 'جلسة ١', 'جلسة ٢', 'جلسة ٣', 'جلسة ٤', 'جلسة ٥'];
    return labels[num] || `جلسة ${num}`;
  }

  function formatRelTime(ts) {
    const diff = ts - Date.now();
    const abs = Math.abs(diff);
    if (abs < 60000) return 'الآن';
    if (abs < 3600000) return `${Math.round(abs/60000)} دقيقة`;
    if (abs < 86400000) return `${Math.round(abs/3600000)} ساعة`;
    return `${Math.round(abs/86400000)} يوم`;
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' });
  }

  // ── Dashboard ──────────────────────────────
  function renderDashboard() {
    document.getElementById('streak-count').textContent = state.streak;

    const now = Date.now();
    const todaySessions = state.topics.filter(t => isDueNow(t) && !allDone(t));
    const urgent = state.topics.filter(t => {
      if (allDone(t)) return false;
      const due = getNextSessionTime(t);
      return due < now - 3600000; // overdue by > 1 hour
    });

    const container = document.getElementById('today-sessions');

    if (todaySessions.length === 0 && urgent.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">◎</span>
          <p>لا توجد جلسات الآن</p>
          <button class="btn-ghost" onclick="App.openAddModal()">أضف موضوعاً جديداً</button>
        </div>`;
    } else {
      const all = [...new Set([...urgent, ...todaySessions])];
      container.innerHTML = all.map(topic => {
        const sub = state.subjects.find(s => s.id === topic.subjectId);
        const num = getNextSession(topic);
        const isUrgent = urgent.includes(topic);
        return `
          <div class="session-card" onclick="App.openSession('${topic.id}')">
            <div class="session-dot ${isUrgent ? 'urgent' : 'today'}"></div>
            <div class="session-info">
              <div class="session-topic">${topic.name}</div>
              <div class="session-meta">${sub ? sub.name : ''} · ${sessionLabel(num)}</div>
            </div>
            <span class="session-badge ${isUrgent ? 'badge-urgent' : 'badge-today'}">
              ${isUrgent ? 'متأخرة' : 'الآن'}
            </span>
          </div>`;
      }).join('');
    }

    // Upcoming
    const upcoming = state.topics
      .filter(t => !allDone(t) && !isDueNow(t))
      .map(t => ({ topic: t, due: getNextSessionTime(t) }))
      .sort((a, b) => a.due - b.due)
      .slice(0, 5);

    const upEl = document.getElementById('upcoming-sessions');
    if (upcoming.length === 0) {
      upEl.innerHTML = '<p style="color:var(--text-3);font-size:0.82rem;padding:0.5rem 0">لا توجد جلسات قادمة</p>';
    } else {
      upEl.innerHTML = upcoming.map(({ topic, due }) => {
        const sub = state.subjects.find(s => s.id === topic.subjectId);
        const num = getNextSession(topic);
        return `
          <div class="upcoming-item">
            <div class="upcoming-date">${formatDate(due)}</div>
            <div class="upcoming-info">
              <div class="upcoming-topic">${topic.name}</div>
              <div class="upcoming-sub">${sub ? sub.name : ''}</div>
            </div>
            <span class="upcoming-num">${sessionLabel(num)}</span>
          </div>`;
      }).join('');
    }
  }

  // ── Add Modal ──────────────────────────────
  function openAddModal() {
    const modal = document.getElementById('modal-add');
    modal.classList.remove('hidden');

    // Set default datetime to now
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('input-study-time').value = now.toISOString().slice(0,16);

    // Populate subjects
    const sel = document.getElementById('input-subject');
    sel.innerHTML = `<option value="">— اختر مادة أو أضف جديدة —</option>
      <option value="__new__">+ مادة جديدة</option>` +
      state.subjects.map(s => `<option value="${s.id}">${s.name}</option>`).join('');

    sel.onchange = () => {
      const ng = document.getElementById('new-subject-group');
      ng.style.display = sel.value === '__new__' ? 'block' : 'none';
    };

    // Color picker
    const picker = document.getElementById('subject-color-picker');
    picker.innerHTML = COLORS.map(c =>
      `<div class="color-swatch ${c === selectedSubjectColor ? 'selected' : ''}"
        style="background:${c}" onclick="App.selectColor('${c}')"></div>`
    ).join('');
  }

  function selectColor(c) {
    selectedSubjectColor = c;
    document.querySelectorAll('.color-swatch').forEach(el => {
      el.classList.toggle('selected', el.style.background === c || el.style.backgroundColor === c);
    });
  }

  function closeModal(e) {
    if (e.target === e.currentTarget) {
      document.getElementById('modal-add').classList.add('hidden');
    }
  }

  function saveNewTopic() {
    const name = document.getElementById('input-topic').value.trim();
    const studyTime = document.getElementById('input-study-time').value;
    const notes = document.getElementById('input-notes').value.trim();
    const subjectVal = document.getElementById('input-subject').value;

    if (!name || !studyTime) {
      alert('يرجى إدخال اسم الموضوع ووقت الدراسة');
      return;
    }

    let subjectId = subjectVal;

    if (subjectVal === '__new__') {
      const newName = document.getElementById('input-new-subject').value.trim();
      if (!newName) { alert('يرجى إدخال اسم المادة'); return; }
      const newSub = { id: uid(), name: newName, color: selectedSubjectColor };
      state.subjects.push(newSub);
      subjectId = newSub.id;
    }

    const topic = {
      id: uid(),
      name,
      subjectId: subjectId || null,
      studyTime: new Date(studyTime).toISOString(),
      notes,
      sessions: [],
      cardIds: [],
      created: Date.now(),
    };

    state.topics.push(topic);
    save();

    // Schedule notifications for all 5 sessions
    scheduleTopicNotifications(topic);

    document.getElementById('modal-add').classList.add('hidden');
    document.getElementById('input-topic').value = '';
    document.getElementById('input-notes').value = '';

    renderDashboard();
    renderSubjects();
    renderStats();

    // Show confirmation
    showToast(`✓ تمت إضافة "${name}" وضُبط جدول الاسترجاع`);
  }

  // ── Session Modal ──────────────────────────
  let sessionState = { topicId: null, qIndex: 0, answered: [], revealed: false };

  function openSession(topicId) {
    const topic = state.topics.find(t => t.id === topicId);
    if (!topic) return;

    const num = getNextSession(topic);
    const questions = (QUESTIONS_BANK[num] || QUESTIONS_BANK[1])
      .map(fn => fn(topic.name));

    sessionState = { topicId, qIndex: 0, answered: [], revealed: false, questions, num, topic };

    renderSessionQuestion();
    document.getElementById('modal-session').classList.remove('hidden');
  }

  function renderSessionQuestion() {
    const { questions, qIndex, num, topic } = sessionState;
    const content = document.getElementById('session-content');

    if (qIndex >= questions.length) {
      // Complete the session
      completeSession();
      return;
    }

    const q = questions[qIndex];
    const progress = Math.round((qIndex / questions.length) * 100);

    content.innerHTML = `
      <div class="session-review">
        <div class="session-review-header">
          <div class="session-num">${sessionLabel(num)} · ${qIndex + 1} من ${questions.length}</div>
          <div class="session-topic-name">${topic.name}</div>
          <div style="margin-top:8px; background:var(--surface); border-radius:3px; height:4px; overflow:hidden;">
            <div style="height:100%; width:${progress}%; background:var(--accent); transition:width 0.3s;"></div>
          </div>
        </div>

        <div class="session-q">
          <div class="session-q-label">السؤال</div>
          ${q}
        </div>

        <div id="answer-area" style="display:none" class="session-answer-area">
          <div class="session-q-label" style="color:var(--green)">الإجابة الصحيحة</div>
          <div id="correct-answer">استرجع المعلومة من ذاكرتك — لا توجد إجابة واحدة. قيّم نفسك بصدق.</div>
        </div>

        <div id="btn-reveal-wrap">
          <button class="btn-reveal" onclick="App.revealAnswer()">اضغط للتحقق من إجابتك</button>
        </div>

        <div id="session-actions" class="session-actions" style="display:none">
          <button class="btn-fail" onclick="App.answerSession(false)">✗ لم أتذكر</button>
          <button class="btn-success" onclick="App.answerSession(true)">✓ تذكرت</button>
        </div>

        <button class="btn-ghost" style="margin-top:0.5rem" onclick="App.closeSession()">إغلاق</button>
      </div>`;
  }

  function revealAnswer() {
    document.getElementById('answer-area').style.display = 'block';
    document.getElementById('btn-reveal-wrap').style.display = 'none';
    document.getElementById('session-actions').style.display = 'flex';
  }

  function answerSession(remembered) {
    sessionState.answered.push(remembered);
    sessionState.qIndex++;
    renderSessionQuestion();
  }

  function completeSession() {
    const { topicId, answered, num } = sessionState;
    const topic = state.topics.find(t => t.id === topicId);
    if (!topic) return;

    const score = answered.filter(Boolean).length;
    const total = answered.length;
    const pct = Math.round((score / total) * 100);

    topic.sessions.push({ num, completed: true, time: new Date().toISOString(), score: pct });

    // Update streak
    const today = todayStr();
    if (state.lastStudyDate !== today) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      state.streak = state.lastStudyDate === yStr ? state.streak + 1 : 1;
      state.lastStudyDate = today;
    }

    // Heatmap
    state.heatmap[today] = (state.heatmap[today] || 0) + 1;

    save();

    // Schedule next notification
    if (num < 5) {
      const nextDue = getNextSessionTime(topic);
      Notif.schedule(topic.name, num + 1, nextDue);
    }

    const nextInfo = num < 5
      ? `الجلسة التالية بعد ${formatRelTime(getNextSessionTime(topic))}`
      : 'اكتملت جميع الجلسات! 🎓';

    const content = document.getElementById('session-content');
    content.innerHTML = `
      <div class="session-done">
        <div class="done-icon">${pct >= 70 ? '🎯' : '📚'}</div>
        <div class="done-title">${pct >= 70 ? 'ممتاز!' : 'استمر في المحاولة'}</div>
        <div class="done-sub">تذكرت ${score} من ${total} أسئلة (${pct}%)</div>
        <div class="done-next">${nextInfo}</div>
        <button class="btn-primary" onclick="App.closeSession()">إغلاق</button>
      </div>`;

    renderDashboard();
    renderStats();
    document.getElementById('streak-count').textContent = state.streak;
  }

  function closeSession() {
    document.getElementById('modal-session').classList.add('hidden');
  }

  // ── Subjects View ──────────────────────────
  function renderSubjects() {
    const container = document.getElementById('subjects-list');

    if (state.subjects.length === 0 && state.topics.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">≡</span>
          <p>لم تضف أي مادة بعد</p>
          <button class="btn-ghost" onclick="App.openAddModal()">أضف موضوعاً</button>
        </div>`;
      return;
    }

    // Topics without subject
    const noSub = state.topics.filter(t => !t.subjectId);

    let html = state.subjects.map(sub => {
      const topics = state.topics.filter(t => t.subjectId === sub.id);
      return `
        <div class="subject-card">
          <div class="subject-header">
            <div class="subject-color" style="background:${sub.color}"></div>
            <div style="flex:1">
              <div class="subject-name">${sub.name}</div>
              <div class="subject-count">${topics.length} موضوع</div>
            </div>
          </div>
          <div class="topic-list">
            ${topics.map(t => topicRow(t)).join('')}
            ${topics.length === 0 ? '<p style="color:var(--text-3);font-size:0.8rem">لا توجد مواضيع بعد</p>' : ''}
          </div>
        </div>`;
    }).join('');

    if (noSub.length > 0) {
      html += `
        <div class="subject-card">
          <div class="subject-header">
            <div class="subject-color" style="background:var(--text-3)"></div>
            <div style="flex:1">
              <div class="subject-name">بدون مادة</div>
              <div class="subject-count">${noSub.length} موضوع</div>
            </div>
          </div>
          <div class="topic-list">
            ${noSub.map(t => topicRow(t)).join('')}
          </div>
        </div>`;
    }

    container.innerHTML = html || `<div class="empty-state"><span class="empty-icon">≡</span><p>أضف موضوعاً للبدء</p></div>`;
  }

  function topicRow(t) {
    const done = t.sessions.filter(s => s.completed).length;
    const nextDue = allDone(t) ? null : getNextSessionTime(t);
    const status = allDone(t) ? '✓ مكتمل' : isDueNow(t) ? '⬤ الآن' : `الجلسة ${done + 1} · ${formatDate(nextDue)}`;
    return `
      <div class="topic-item">
        <div class="topic-name">${t.name}</div>
        <div class="topic-next">${status}</div>
        <button class="topic-del" onclick="App.deleteTopic('${t.id}', event)" title="حذف">×</button>
      </div>`;
  }

  function deleteTopic(id, e) {
    e.stopPropagation();
    if (!confirm('هل تريد حذف هذا الموضوع؟')) return;
    state.topics = state.topics.filter(t => t.id !== id);
    state.cards = state.cards.filter(c => c.topicId !== id);
    save();
    renderSubjects();
    renderDashboard();
    renderFlashcards();
    renderStats();
  }

  // ── Flashcards ─────────────────────────────
  function openAddCardModal() {
    document.getElementById('modal-add-card').classList.remove('hidden');
    const sel = document.getElementById('card-topic-select');
    sel.innerHTML = `<option value="">— اختر موضوعاً —</option>` +
      state.topics.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
  }

  function closeCardModal(e) {
    if (e.target === e.currentTarget) {
      document.getElementById('modal-add-card').classList.add('hidden');
    }
  }

  function saveNewCard() {
    const topicId = document.getElementById('card-topic-select').value;
    const question = document.getElementById('card-question').value.trim();
    const answer = document.getElementById('card-answer').value.trim();
    if (!topicId || !question || !answer) { alert('يرجى ملء جميع الحقول'); return; }

    const card = { id: uid(), topicId, question, answer, created: Date.now() };
    state.cards.push(card);
    const topic = state.topics.find(t => t.id === topicId);
    if (topic) topic.cardIds = (topic.cardIds || []);
    topic.cardIds.push(card.id);
    save();

    document.getElementById('modal-add-card').classList.add('hidden');
    document.getElementById('card-question').value = '';
    document.getElementById('card-answer').value = '';
    renderFlashcards();
    showToast('✓ تمت إضافة البطاقة');
  }

  function renderFlashcards() {
    const filterEl = document.getElementById('flashcard-subject-filter');
    const area = document.getElementById('flashcard-session');

    const subjects = state.subjects.filter(s =>
      state.cards.some(c => {
        const t = state.topics.find(t => t.id === c.topicId);
        return t && t.subjectId === s.id;
      })
    );

    filterEl.innerHTML = `
      <div class="pill ${currentFilterSubject === null ? 'active' : ''}" onclick="App.filterCards(null)">الكل</div>` +
      subjects.map(s => `
        <div class="pill ${currentFilterSubject === s.id ? 'active' : ''}" onclick="App.filterCards('${s.id}')">${s.name}</div>
      `).join('') +
      state.topics.filter(t => !t.subjectId && state.cards.some(c => c.topicId === t.id)).map(t => `
        <div class="pill ${currentFilterSubject === t.id ? 'active' : ''}" onclick="App.filterCards('${t.id}')">${t.name}</div>
      `).join('');

    let filtered = state.cards;
    if (currentFilterSubject) {
      filtered = state.cards.filter(c => {
        const t = state.topics.find(t => t.id === c.topicId);
        return t && (t.subjectId === currentFilterSubject || t.id === currentFilterSubject);
      });
    }

    currentFlashcards = filtered;
    currentFlashcardIndex = 0;
    currentFlashcardRevealed = false;

    if (filtered.length === 0) {
      area.innerHTML = `
        <div class="no-cards">
          <div style="font-size:2rem;margin-bottom:0.75rem">⬡</div>
          <p style="color:var(--text-2)">لا توجد بطاقات بعد</p>
          <button class="btn-ghost" style="margin-top:1rem" onclick="App.openAddCardModal()">أضف بطاقة</button>
        </div>`;
      return;
    }

    renderFlashcard();
  }

  function renderFlashcard() {
    const area = document.getElementById('flashcard-session');
    if (currentFlashcards.length === 0) return;

    const card = currentFlashcards[currentFlashcardIndex];
    const topic = state.topics.find(t => t.id === card.topicId);

    area.innerHTML = `
      <div style="text-align:center;margin-bottom:0.5rem;font-size:0.75rem;color:var(--text-3)">
        ${currentFlashcardIndex + 1} / ${currentFlashcards.length} · ${topic ? topic.name : ''}
      </div>
      <div class="flashcard" onclick="App.revealCard()">
        <div>
          ${!currentFlashcardRevealed
            ? `<div class="flashcard-face">${card.question}</div>
               <div class="flashcard-hint">اضغط لرؤية الإجابة</div>`
            : `<div class="flashcard-answer">${card.answer}</div>`
          }
        </div>
      </div>
      ${currentFlashcardRevealed
        ? `<div class="card-actions">
            <button class="btn-fail" onclick="App.nextCard(false)">✗ لم أتذكر</button>
            <button class="btn-success" onclick="App.nextCard(true)">✓ تذكرت</button>
           </div>`
        : `<button class="btn-reveal" onclick="App.revealCard()">اكشف الإجابة</button>`
      }`;
  }

  function revealCard() {
    currentFlashcardRevealed = true;
    renderFlashcard();
  }

  function nextCard(remembered) {
    currentFlashcardIndex = (currentFlashcardIndex + 1) % currentFlashcards.length;
    currentFlashcardRevealed = false;
    renderFlashcard();
  }

  function filterCards(subjectId) {
    currentFilterSubject = subjectId;
    renderFlashcards();
  }

  // ── Stats ──────────────────────────────────
  function renderStats() {
    const container = document.getElementById('stats-content');
    const totalTopics = state.topics.length;
    const completed = state.topics.filter(t => allDone(t)).length;
    const totalSessions = state.topics.reduce((acc, t) => acc + t.sessions.filter(s => s.completed).length, 0);
    const totalCards = state.cards.length;
    const due = state.topics.filter(t => isDueNow(t)).length;

    const heatDays = Object.keys(state.heatmap).sort().slice(-28);
    const maxHeat = Math.max(1, ...Object.values(state.heatmap));

    const heatCells = Array.from({ length: 28 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (27 - i));
      const key = d.toISOString().split('T')[0];
      const val = state.heatmap[key] || 0;
      const level = val === 0 ? 0 : Math.ceil((val / maxHeat) * 4);
      return `<div class="heat-cell heat-${level}" title="${key}: ${val}"></div>`;
    }).join('');

    const pct = totalTopics > 0 ? Math.round((completed / totalTopics) * 100) : 0;

    container.innerHTML = `
      <div class="stat-row">
        <div class="stat-card">
          <div class="stat-label">الإجمالي</div>
          <div class="stat-value">${totalTopics}</div>
          <div class="stat-sub">موضوع</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">مكتمل</div>
          <div class="stat-value" style="color:var(--green)">${completed}</div>
          <div class="stat-sub">موضوع</div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-card">
          <div class="stat-label">الجلسات</div>
          <div class="stat-value" style="color:var(--accent)">${totalSessions}</div>
          <div class="stat-sub">جلسة مكتملة</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">السلسلة</div>
          <div class="stat-value" style="color:var(--amber)">${state.streak}</div>
          <div class="stat-sub">🔥 يوم</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-label">التقدم الكلي</div>
        <div class="progress-bar-wrap">
          <div class="progress-label">
            <span>${completed} مكتمل</span>
            <span>${pct}%</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat-card">
          <div class="stat-label">البطاقات</div>
          <div class="stat-value">${totalCards}</div>
          <div class="stat-sub">بطاقة</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">مستحقة</div>
          <div class="stat-value" style="color:${due > 0 ? 'var(--red)' : 'var(--green)'}">${due}</div>
          <div class="stat-sub">جلسة الآن</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-label">نشاط ٢٨ يوم الأخيرة</div>
        <div class="heatmap" style="margin-top:0.75rem">${heatCells}</div>
        <div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-3);margin-top:5px">
          <span>قبل ٤ أسابيع</span><span>اليوم</span>
        </div>
      </div>`;
  }

  // ── Notifications ──────────────────────────
  function scheduleTopicNotifications(topic) {
    const studyTime = new Date(topic.studyTime).getTime();
    INTERVALS.forEach((hrs, i) => {
      const dueAt = studyTime + hrs * 3600000;
      if (dueAt > Date.now()) {
        Notif.schedule(topic.name, i + 1, dueAt);
      }
    });
  }

  function requestNotifications() {
    Notif.requestPermission().then(() => {
      document.getElementById('notif-banner').classList.add('hidden');
      showToast('✓ تم تفعيل الإشعارات');
    });
  }

  // ── Utilities ──────────────────────────────
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = `
      position:fixed; bottom:calc(var(--nav-h) + 12px); left:50%;
      transform:translateX(-50%);
      background:var(--surface); border:1px solid var(--border);
      color:var(--text); padding:10px 20px; border-radius:40px;
      font-size:0.85rem; z-index:999;
      animation:fadeIn 0.2s ease;
      white-space:nowrap;
      box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }

  // ── Public API ─────────────────────────────
  return {
    init, startOnboarding, navigate,
    openAddModal, closeModal, saveNewTopic, selectColor,
    openSession, revealAnswer, answerSession, closeSession,
    openAddCardModal, closeCardModal, saveNewCard,
    revealCard, nextCard, filterCards,
    renderDashboard, renderSubjects, renderFlashcards, renderStats,
    deleteTopic,
    requestNotifications,
  };

})();

document.addEventListener('DOMContentLoaded', () => App.init());

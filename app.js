/* ── Overworld — Phase 1 ── */

const XP = {
  task:  { common: 5,  rare: 15, epic: 30,  legendary: 75  },
  quest: { common: 25, rare: 75, epic: 150, legendary: 500 }
};

function xpForLevel(level) {
  let total = 0;
  for (let l = 1; l < level; l++) total += l * 100 + l * l * 10;
  return total;
}

function xpToNextLevel(level) {
  return level * 100 + level * level * 10;
}

function getArmLabels() {
  const a = (state.character && state.character.arms) || {};
  return {
    creative: a.creative || 'Area 1',
    writing:  a.writing  || 'Area 2',
    apps:     a.apps     || 'Area 3',
    life:     a.life     || 'Area 4'
  };
}
const TIER_ICONS  = { common: '◦', rare: '◈', epic: '⬡', legendary: '★' };

// ── Achievement definitions
const ACHIEVEMENTS = [
  // First actions
  { id: 'first_task',      icon: '◦', tier: 'common',    title: 'The Work Begins',   desc: 'Complete your first task.' },
  { id: 'first_quest',     icon: '◦', tier: 'common',    title: 'First Steps',       desc: 'Complete your first quest.' },
  // Quest count
  { id: 'quests_3',        icon: '◦', tier: 'common',    title: 'Wayfarer',          desc: 'Complete 3 quests.' },
  { id: 'quests_10',       icon: '◈', tier: 'rare',      title: 'Veteran',           desc: 'Complete 10 quests.' },
  { id: 'quests_25',       icon: '⬡', tier: 'epic',      title: 'Champion',          desc: 'Complete 25 quests.' },
  // Task count
  { id: 'tasks_10',        icon: '◦', tier: 'common',    title: 'Industrious',       desc: 'Complete 10 tasks.' },
  { id: 'tasks_50',        icon: '◈', tier: 'rare',      title: 'Relentless',        desc: 'Complete 50 tasks.' },
  { id: 'tasks_100',       icon: '⬡', tier: 'epic',      title: 'Iron Will',         desc: 'Complete 100 tasks.' },
  // Level milestones
  { id: 'level_5',         icon: '◈', tier: 'rare',      title: 'Apprentice',        desc: 'Reach level 5.' },
  { id: 'level_10',        icon: '⬡', tier: 'epic',      title: 'Adept',             desc: 'Reach level 10.' },
  { id: 'level_20',        icon: '★', tier: 'legendary', title: 'Master',            desc: 'Reach level 20.' },
  // Tier completions
  { id: 'rare_quest',      icon: '◈', tier: 'rare',      title: 'Rare Find',         desc: 'Complete a rare quest.' },
  { id: 'epic_quest',      icon: '⬡', tier: 'epic',      title: 'Epic Deed',         desc: 'Complete an epic quest.' },
  { id: 'legendary_quest', icon: '★', tier: 'legendary', title: 'Legendary',         desc: 'Complete a legendary quest.' },
  // Variety
  { id: 'all_arms',        icon: '★', tier: 'legendary', title: 'Renaissance',       desc: 'Complete a quest in every area.' },
  // XP milestones
  { id: 'xp_500',          icon: '◦', tier: 'common',    title: 'Gaining Ground',    desc: 'Earn 500 total XP.' },
  { id: 'xp_2000',         icon: '◈', tier: 'rare',      title: 'Power Surge',       desc: 'Earn 2000 total XP.' },
  { id: 'xp_5000',         icon: '⬡', tier: 'epic',      title: 'Ascendant',         desc: 'Earn 5000 total XP.' },
];
const ARM_VARS    = {
  creative: 'var(--arm-creative)',
  writing:  'var(--arm-writing)',
  apps:     'var(--arm-apps)',
  life:     'var(--arm-life)'
};
const CLASS_GLYPH = { Chronicler: '✦', Architect: '⬡', Artificer: '◈', Wanderer: '◎' };

// ── State
let state = JSON.parse(localStorage.getItem('overworld_state') || 'null') || deepClone(DEMO_DATA);
// Migration: mark as created if name already set (existing saves)
if (state.character.name && !state.characterCreated) state.characterCreated = true;
let activeFilter = 'all';
let activeStatusFilter = 'all';
let openQuestId = null;

// Create-sheet form state
let cqSelectedArm  = 'creative';
let cqSelectedTier = 'common';
let cqSelectedPrereqs = new Set();
let editingQuestId = null; // null = create mode, string id = edit mode

// Drag state
let dragState = null; // { questId, node, offsetX, offsetY, moved }

// Search state
let searchQuery = '';
let csVariation = 0; // portrait variation counter for char-sheet regen

function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
function saveState()   { localStorage.setItem('overworld_state', JSON.stringify(state)); }
function genId()       { return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2,5); }

// ── Quest helpers
function questStatus(quest) {
  if (quest.completedAt) return 'complete';
  if (!quest.requires.length) return 'available';
  return quest.requires.every(id => state.quests.find(q => q.id === id)?.completedAt)
    ? 'available' : 'locked';
}

function questProgress(quest) {
  const done = quest.tasksDone.filter(Boolean).length;
  return { done, total: quest.tasks.length, pct: quest.tasks.length ? done / quest.tasks.length : 0 };
}

// ── Render map
function renderMap() {
  const container = document.getElementById('quest-nodes');
  container.innerHTML = '';

  // Empty-state overlay
  const emptyEl    = document.getElementById('map-empty-state');
  const emptyTitle = document.getElementById('map-empty-title');
  const emptySub   = document.getElementById('map-empty-sub');
  if (emptyEl) {
    const visible = state.quests.filter(q => {
      if (activeFilter !== 'all' && q.arm !== activeFilter) return false;
      if (activeStatusFilter !== 'all' && questStatus(q) !== activeStatusFilter) return false;
      return true;
    });
    if (!visible.length) {
      emptyEl.classList.remove('hidden');
      if (!state.quests.length) {
        emptyTitle.textContent = 'Your world awaits.';
        emptySub.textContent   = 'Tap + to create your first quest.';
      } else {
        emptyTitle.textContent = 'No quests match this filter.';
        emptySub.textContent   = '';
      }
    } else {
      emptyEl.classList.add('hidden');
    }
  }

  // Nodes
  state.quests.forEach(quest => {
    if (activeFilter !== 'all' && quest.arm !== activeFilter) return;
    const status = questStatus(quest);
    if (activeStatusFilter !== 'all' && status !== activeStatusFilter) return;
    if (searchQuery && !quest.title.toLowerCase().includes(searchQuery.toLowerCase())) return;

    const node = document.createElement('div');
    node.className  = `quest-node ${status}`;
    node.dataset.arm = quest.arm;
    node.dataset.id  = quest.id;
    node.style.left  = quest.x + '%';
    node.style.top   = quest.y + '%';
    node.innerHTML = `
      <div class="node-marker">
        <span class="node-icon">${TIER_ICONS[quest.tier] || '◦'}</span>
        <div class="node-pulse"></div>
      </div>
      <span class="node-label">${quest.title}</span>
    `;
    // ── Long-press drag
    let pressTimer = null;
    let pressStartX = 0, pressStartY = 0;
    let didDrag = false;

    node.addEventListener('touchstart', e => {
      const touch = e.touches[0];
      pressStartX = touch.clientX;
      pressStartY = touch.clientY;
      didDrag = false;

      pressTimer = setTimeout(() => {
        pressTimer = null;
        didDrag = true; // suppress click
        if (navigator.vibrate) navigator.vibrate(50);
        dragState = { questId: quest.id, node };
        node.classList.add('dragging');
        document.querySelectorAll('.quest-node').forEach(n => n.classList.remove('selected'));
      }, 420);
    }, { passive: true });

    node.addEventListener('touchmove', e => {
      const touch = e.touches[0];
      const dx = touch.clientX - pressStartX;
      const dy = touch.clientY - pressStartY;

      // Cancel long-press if finger moved more than 8px before timer fires
      if (pressTimer && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }

      if (!dragState || dragState.questId !== quest.id) return;
      e.preventDefault();

      const rect = container.getBoundingClientRect();
      const x = ((touch.clientX - rect.left) / rect.width)  * 100;
      const y = ((touch.clientY - rect.top)  / rect.height) * 100;
      const clamped_x = Math.min(Math.max(x, 2), 98);
      const clamped_y = Math.min(Math.max(y, 2), 98);

      node.style.left = clamped_x + '%';
      node.style.top  = clamped_y + '%';
    }, { passive: false });

    node.addEventListener('touchend', () => {
      clearTimeout(pressTimer);
      pressTimer = null;

      if (dragState && dragState.questId === quest.id) {
        // Save final position from node's inline style
        const x = parseFloat(node.style.left);
        const y = parseFloat(node.style.top);
        if (!isNaN(x) && !isNaN(y)) {
          quest.x = Math.round(x * 10) / 10;
          quest.y = Math.round(y * 10) / 10;
          saveState();
        }
        node.classList.remove('dragging');
        dragState = null;
      }
    });

    // ── Tap to open (suppress if dragged)
    node.addEventListener('click', () => {
      if (didDrag) { didDrag = false; return; }
      document.querySelectorAll('.quest-node').forEach(n => n.classList.remove('selected'));
      node.classList.add('selected');
      openQuest(quest.id);
    });
    container.appendChild(node);
  });
}

// ── Render character sheet
function renderCharacter() {
  const c = state.character;
  const glyph = CLASS_GLYPH[c.class] || '✦';

  // Header portrait
  document.getElementById('portrait-level').textContent = c.level;
  const headerPortrait = document.getElementById('header-portrait-wrap');
  const glyphEl = document.getElementById('char-glyph');
  if (c.portrait) {
    glyphEl.style.display = 'none';
    headerPortrait.innerHTML = `<img src="${c.portrait}" alt="${c.name}" />`;
  } else {
    glyphEl.style.display = '';
    headerPortrait.innerHTML = '';
  }

  // Sheet portrait
  const portraitFrame = document.getElementById('cs-portrait-frame');
  if (c.portrait) {
    portraitFrame.innerHTML = `<img src="${c.portrait}" alt="${c.name}" />`;
  } else {
    portraitFrame.innerHTML = `<span class="cs-portrait-glyph">${glyph}</span>`;
  }

  document.getElementById('cs-char-class').textContent  = c.class;
  document.getElementById('cs-char-name').textContent   = c.name;
  document.getElementById('cs-char-level').textContent  = c.level;

  const levelStart = xpForLevel(c.level);
  const levelEnd   = xpForLevel(c.level + 1);
  const xpInLevel  = c.xp - levelStart;
  const xpNeeded   = levelEnd - levelStart;
  const pct        = Math.min((xpInLevel / xpNeeded) * 100, 100);

  document.getElementById('xp-bar-fill').style.width = pct + '%';
  document.getElementById('xp-current').textContent  = xpInLevel + ' XP';
  document.getElementById('xp-next').textContent     = '/ ' + xpNeeded;

  // Stats
  const completed = state.quests.filter(q => q.completedAt).length;
  document.getElementById('stat-quests').textContent = `${completed}/${state.quests.length}`;
  const tasksDone = state.quests.reduce((s, q) => s + q.tasksDone.filter(Boolean).length, 0);
  document.getElementById('stat-tasks').textContent  = tasksDone;
  const arms = [...new Set(state.quests.filter(q => !q.completedAt && questStatus(q) === 'available').map(q => q.arm))];
  document.getElementById('stat-arm').textContent = arms.length ? arms.map(a => getArmLabels()[a]).join(', ') : '—';

  // Active quests
  const activeList   = document.getElementById('active-quest-list');
  const activeQuests = state.quests.filter(q => !q.completedAt && questStatus(q) === 'available');
  if (!activeQuests.length) {
    activeList.innerHTML = '<li class="no-quests">No quests active</li>';
  } else {
    activeList.innerHTML = activeQuests.map(q => {
      const prog = questProgress(q);
      return `
        <li class="active-quest-item" data-id="${q.id}">
          <span class="aqi-title">${q.title}</span>
          <div class="aqi-progress">
            <div class="aqi-progress-fill" style="width:${prog.pct*100}%;background:${ARM_VARS[q.arm]}"></div>
          </div>
        </li>
      `;
    }).join('');
    activeList.querySelectorAll('.active-quest-item').forEach(item => {
      item.addEventListener('click', () => {
        closeCharSheet();
        setTimeout(() => openQuest(item.dataset.id), 200);
      });
    });
  }

  // Achievements
  const achList = document.getElementById('cs-achievements');
  // Summary line above the list
  const totalAch = ACHIEVEMENTS.length;
  const earnedAch = state.achievements.length;
  document.getElementById('cs-ach-count').textContent = `${earnedAch} / ${totalAch}`;

  if (!earnedAch) {
    achList.innerHTML = '<li class="no-quests">No achievements yet — complete tasks and quests to unlock them.</li>';
  } else {
    // Show earned first, then locked stubs
    const earnedIds = new Set(state.achievements.map(a => a.id));
    const earnedItems = state.achievements.slice().reverse().map(a => {
      const date = a.unlockedAt ? new Date(a.unlockedAt).toLocaleDateString('en-AU', { day:'numeric', month:'short', year:'numeric' }) : '';
      return `
        <li class="achievement-item earned">
          <span class="achievement-icon tier-${a.tier || 'common'}">${a.icon || '◦'}</span>
          <div class="achievement-text">
            <div class="achievement-title">${a.title}</div>
            <div class="achievement-desc">${a.desc}</div>
            ${date ? `<div class="achievement-date">${date}</div>` : ''}
          </div>
        </li>
      `;
    });
    const lockedItems = ACHIEVEMENTS.filter(def => !earnedIds.has(def.id)).map(def => `
      <li class="achievement-item locked">
        <span class="achievement-icon locked-icon">?</span>
        <div class="achievement-text">
          <div class="achievement-title">${def.title}</div>
          <div class="achievement-desc">${def.desc}</div>
        </div>
      </li>
    `);
    achList.innerHTML = [...earnedItems, ...lockedItems].join('');
  }
}

// ── Character sheet open/close
function openCharSheet() {
  const sheet = document.getElementById('char-sheet');
  renderCharacter();
  sheet.classList.remove('hidden');
  // Double rAF: first frame paints display:flex, second triggers the transition
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
}

function closeCharSheet() {
  const sheet = document.getElementById('char-sheet');
  sheet.classList.remove('open');
  setTimeout(() => sheet.classList.add('hidden'), 350);
}

// ── Quest panel open/close
function openQuest(id) {
  const quest = state.quests.find(q => q.id === id);
  if (!quest) return;
  openQuestId = id;

  const status  = questStatus(quest);
  const taskXP  = XP.task[quest.tier];
  const bonusXP = XP.quest[quest.tier];

  document.getElementById('qp-tier').textContent  = quest.tier;
  document.getElementById('qp-tier').className    = `qp-tier-badge ${quest.tier}`;
  document.getElementById('qp-arm').textContent   = getArmLabels()[quest.arm] || quest.arm;
  document.getElementById('qp-title').textContent = quest.title;
  document.getElementById('qp-desc').textContent  = quest.description;
  document.getElementById('qp-xp-note').textContent = `${taskXP} XP per task · ${bonusXP} XP on completion`;

  // Tasks
  const tasksEl = document.getElementById('qp-tasks');
  tasksEl.innerHTML = quest.tasks.map((task, i) => `
    <div class="task-item ${quest.tasksDone[i] ? 'done' : ''}" data-idx="${i}">
      <div class="task-check"></div>
      <span class="task-label">${task}</span>
    </div>
  `).join('');
  tasksEl.querySelectorAll('.task-item').forEach(item => {
    item.addEventListener('click', () => toggleTask(id, parseInt(item.dataset.idx)));
  });

  // Status
  const statusEl = document.getElementById('qp-status');
  statusEl.className   = `qp-status ${status}`;
  statusEl.textContent = status === 'available' ? 'Available'
                       : status === 'locked'    ? 'Locked — complete prerequisites first'
                       :                          'Complete';

  // Requires
  const reqEl = document.getElementById('qp-requires');
  if (quest.requires.length) {
    const names = quest.requires.map(rid => state.quests.find(q => q.id === rid)?.title || rid);
    reqEl.innerHTML = `<strong>Requires:</strong> ${names.join(', ')}`;
  } else {
    reqEl.innerHTML = '';
  }

  // Action buttons
  const actionsEl = document.getElementById('qp-actions');
  actionsEl.innerHTML = '';

  if (status === 'complete') {
    const reopenBtn = document.createElement('button');
    reopenBtn.className = 'qp-action-btn qp-reopen-btn';
    reopenBtn.textContent = 'Reopen Quest';
    reopenBtn.addEventListener('click', () => reopenQuest(id));
    actionsEl.appendChild(reopenBtn);
  } else {
    const editBtn = document.createElement('button');
    editBtn.className = 'qp-action-btn qp-edit-btn';
    editBtn.textContent = 'Edit Quest';
    editBtn.addEventListener('click', () => {
      closeQuest();
      setTimeout(() => openCreateSheet(quest), 380);
    });
    actionsEl.appendChild(editBtn);
  }

  // Delete button — double-tap to confirm
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'qp-action-btn qp-delete-btn';
  deleteBtn.textContent = 'Delete';
  let deleteArmed = false, deleteTimer = null;
  deleteBtn.addEventListener('click', () => {
    if (deleteArmed) {
      clearTimeout(deleteTimer);
      deleteQuestConfirmed(id);
    } else {
      deleteArmed = true;
      deleteBtn.textContent = 'Tap again to confirm';
      deleteBtn.classList.add('armed');
      deleteTimer = setTimeout(() => {
        deleteArmed = false;
        deleteBtn.textContent = 'Delete';
        deleteBtn.classList.remove('armed');
      }, 2600);
    }
  });
  actionsEl.appendChild(deleteBtn);

  // Journal note — only for completed quests
  const noteEl = document.getElementById('qp-note-section');
  if (status === 'complete') {
    const entry    = state.chronicle.find(e => e.questId === id);
    const existing = entry ? (entry.note || '') : '';
    noteEl.classList.remove('hidden');
    noteEl.innerHTML = `
      <div class="qp-note-label">
        <span class="qp-note-icon">✦</span> Chronicle note
      </div>
      <textarea class="qp-note-textarea" id="qp-note-input"
        placeholder="Write a retrospective note about this quest…"
        maxlength="600" rows="4">${existing}</textarea>
      <div class="qp-note-footer">
        <span class="qp-note-saved" id="qp-note-saved"></span>
        <span class="qp-note-count" id="qp-note-count">${existing.length} / 600</span>
      </div>
    `;
    const textarea  = document.getElementById('qp-note-input');
    const savedEl   = document.getElementById('qp-note-saved');
    const countEl   = document.getElementById('qp-note-count');
    let saveTimer   = null;

    textarea.addEventListener('input', () => {
      countEl.textContent = `${textarea.value.length} / 600`;
      savedEl.textContent = '';
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        if (entry) {
          entry.note = textarea.value.trim() || null;
          saveState();
          savedEl.textContent = 'Saved';
          setTimeout(() => { savedEl.textContent = ''; }, 1800);
        }
      }, 800);
    });
  } else {
    noteEl.classList.add('hidden');
    noteEl.innerHTML = '';
  }

  const panel = document.getElementById('quest-panel');
  panel.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('open')));
}

function closeQuest() {
  const panel = document.getElementById('quest-panel');
  panel.classList.remove('open');
  setTimeout(() => {
    panel.classList.add('hidden');
    openQuestId = null;
    document.querySelectorAll('.quest-node').forEach(n => n.classList.remove('selected'));
  }, 350);
}

// ── Toggle task
function toggleTask(questId, idx) {
  const quest = state.quests.find(q => q.id === questId);
  if (!quest || quest.completedAt || questStatus(quest) === 'locked') return;

  const wasDone = quest.tasksDone[idx];
  quest.tasksDone[idx] = !wasDone;

  if (!wasDone) {
    awardXP(XP.task[quest.tier]);
    if (quest.tasksDone.every(Boolean) && !quest.completedAt) completeQuest(quest);
  } else {
    state.character.xp = Math.max(0, state.character.xp - XP.task[quest.tier]);
    recalcLevel();
  }

  saveState();
  checkAchievements();
  renderMap();
  renderCharacter();
  if (openQuestId === questId) openQuest(questId);
}

// ── XP
function awardXP(amount) {
  showXPToast('+' + amount + ' XP');
  state.character.xp += amount;
  const prev = state.character.level;
  recalcLevel();
  if (state.character.level > prev) {
    setTimeout(() => showLevelUp(state.character.level), 600);
    checkAchievements(3800); // wait for level-up overlay to clear first
  } else {
    checkAchievements();
    animateXPBar();
  }
}

function recalcLevel() {
  let level = 1;
  while (state.character.xp >= xpForLevel(level + 1)) level++;
  state.character.level    = level;
  state.character.xpToNext = xpToNextLevel(level);
}

function animateXPBar() {
  const shimmer = document.getElementById('xp-bar-shimmer');
  shimmer.classList.remove('animate');
  void shimmer.offsetWidth;
  shimmer.classList.add('animate');
  renderCharacter();
}

// ── Complete quest
function completeQuest(quest) {
  quest.completedAt = new Date().toISOString();
  const bonus = XP.quest[quest.tier];
  state.chronicle.push({
    questId: quest.id, title: quest.title, arm: quest.arm,
    tier: quest.tier,  completedAt: quest.completedAt, note: null
  });
  setTimeout(() => {
    awardXP(bonus);
    showXPToast(`Quest complete! +${bonus} XP`);
    shimmerNode(quest.id);
  }, 300);
}

// ── Reopen a completed quest (undoes completion + XP)
function reopenQuest(questId) {
  const quest = state.quests.find(q => q.id === questId);
  if (!quest || !quest.completedAt) return;

  const bonus   = XP.quest[quest.tier];
  const taskXP  = XP.task[quest.tier] * quest.tasks.length;
  state.character.xp = Math.max(0, state.character.xp - bonus - taskXP);
  recalcLevel();

  quest.completedAt = null;
  quest.tasksDone   = quest.tasks.map(() => false);

  // Remove most-recent chronicle entry for this quest
  const idx = state.chronicle.map(e => e.questId).lastIndexOf(questId);
  if (idx >= 0) state.chronicle.splice(idx, 1);

  saveState();
  renderMap();
  renderCharacter();
  openQuest(questId);
}

// ── Permanently delete a quest (called after double-tap confirm)
function deleteQuestConfirmed(questId) {
  const quest = state.quests.find(q => q.id === questId);
  if (!quest) return;

  // Deduct any XP already earned from this quest
  if (quest.completedAt) {
    const xp = XP.quest[quest.tier] + XP.task[quest.tier] * quest.tasks.length;
    state.character.xp = Math.max(0, state.character.xp - xp);
    state.chronicle = state.chronicle.filter(e => e.questId !== questId);
  } else {
    const taskXP = XP.task[quest.tier] * quest.tasksDone.filter(Boolean).length;
    state.character.xp = Math.max(0, state.character.xp - taskXP);
  }
  recalcLevel();

  // Remove quest, and drop it from any other quest's requires list
  state.quests = state.quests.filter(q => q.id !== questId);
  state.quests.forEach(q => { q.requires = q.requires.filter(id => id !== questId); });

  saveState();
  closeQuest();
  renderMap();
  renderCharacter();
}

function shimmerNode(questId) {
  const node = document.querySelector(`.quest-node[data-id="${questId}"]`);
  if (!node) return;
  node.style.transition = 'filter 0.1s';
  node.style.filter     = 'brightness(2.5)';
  setTimeout(() => { node.style.filter = ''; }, 450);
}

// ── Toast
function showXPToast(text) {
  const toast = document.getElementById('xp-toast');
  document.getElementById('xp-toast-text').textContent = text;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 200);
  }, 1800);
}

function getLevelFlavour(level) {
  if (level === 2)  return 'The first step beyond the beginning.';
  if (level === 3)  return 'Something stirs in the distance.';
  if (level <= 5)   return 'You are finding your stride.';
  if (level <= 8)   return 'The world bends to your will.';
  if (level === 10) return 'A name spoken in whispers.';
  if (level <= 13)  return 'The path grows steep — and worth it.';
  if (level <= 15)  return 'Legends are forged in moments like this.';
  if (level <= 18)  return 'Few have walked this far.';
  if (level === 20) return 'The summit. And beyond it, more.';
  return 'Beyond legend. Beyond measure.';
}

// ── Level-up
function showLevelUp(level) {
  const overlay = document.getElementById('levelup-overlay');
  document.getElementById('levelup-num').textContent   = level;
  document.getElementById('levelup-title').textContent = state.character.class;
  document.getElementById('levelup-sub').textContent   = getLevelFlavour(level);
  overlay.classList.remove('hidden');
  requestAnimationFrame(() => overlay.classList.add('show'));
  animateXPBar();

  function dismiss() {
    overlay.classList.remove('show');
    overlay.removeEventListener('click', dismiss);
    setTimeout(() => overlay.classList.add('hidden'), 400);
  }
  overlay.addEventListener('click', dismiss);
  clearTimeout(overlay._timer);
  overlay._timer = setTimeout(dismiss, 3000);
}

// ── Drag hint (shown once after first map load with quests)
function showDragHint() {
  if (state.dragHintSeen || !state.quests.length) return;
  const hint = document.getElementById('drag-hint');
  if (!hint) return;
  hint.classList.remove('hidden');
  requestAnimationFrame(() => hint.classList.add('show'));
  setTimeout(() => {
    hint.classList.remove('show');
    setTimeout(() => hint.classList.add('hidden'), 400);
  }, 3800);
  state.dragHintSeen = true;
  saveState();
}

// ── Achievement notification queue
let achQueue = [];
let achShowing = false;

function showAchievementToast(ach) {
  achQueue.push(ach);
  if (!achShowing) drainAchQueue();
}

function drainAchQueue() {
  if (!achQueue.length) { achShowing = false; return; }
  achShowing = true;
  const ach  = achQueue.shift();
  const notif = document.getElementById('ach-notification');
  document.getElementById('ach-notif-icon').textContent  = ach.icon;
  document.getElementById('ach-notif-icon').className    = `ach-notif-icon tier-${ach.tier}`;
  document.getElementById('ach-notif-title').textContent = ach.title;
  document.getElementById('ach-notif-desc').textContent  = ach.desc;
  notif.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => notif.classList.add('show')));
  clearTimeout(notif._timer);
  notif._timer = setTimeout(() => {
    notif.classList.remove('show');
    setTimeout(() => {
      notif.classList.add('hidden');
      drainAchQueue();
    }, 280);
  }, 3400);
}

// ── Check and unlock achievements
// baseDelay: ms to wait before showing first notification (e.g. after level-up overlay)
function checkAchievements(baseDelay = 0) {
  const c        = state.character;
  const completed = state.quests.filter(q => q.completedAt);
  const cCount   = completed.length;
  const tDone    = state.quests.reduce((s, q) => s + q.tasksDone.filter(Boolean).length, 0);
  const arms     = Object.keys(state.character.arms || { creative:1, writing:1, apps:1, life:1 });

  const checks = {
    first_task:       tDone >= 1,
    first_quest:      cCount >= 1,
    quests_3:         cCount >= 3,
    quests_10:        cCount >= 10,
    quests_25:        cCount >= 25,
    tasks_10:         tDone >= 10,
    tasks_50:         tDone >= 50,
    tasks_100:        tDone >= 100,
    level_5:          c.level >= 5,
    level_10:         c.level >= 10,
    level_20:         c.level >= 20,
    rare_quest:       completed.some(q => q.tier === 'rare'),
    epic_quest:       completed.some(q => q.tier === 'epic'),
    legendary_quest:  completed.some(q => q.tier === 'legendary'),
    all_arms:         arms.every(arm => completed.some(q => q.arm === arm)),
    xp_500:           c.xp >= 500,
    xp_2000:          c.xp >= 2000,
    xp_5000:          c.xp >= 5000,
  };

  const earned = new Set(state.achievements.map(a => a.id));
  const newOnes = [];
  ACHIEVEMENTS.forEach(def => {
    if (!earned.has(def.id) && checks[def.id]) {
      state.achievements.push({
        id: def.id, icon: def.icon, tier: def.tier,
        title: def.title, desc: def.desc,
        unlockedAt: new Date().toISOString()
      });
      newOnes.push(def);
    }
  });

  if (newOnes.length) {
    saveState();
    newOnes.forEach((ach, i) => setTimeout(() => showAchievementToast(ach), baseDelay + i * 3800));
  }
}

// ── Portrait handling

// Build a DiceBear lorelei URL from character data + variation index
function buildPortraitUrl(character, variation) {
  // Include gender in seed so Man/Woman/Non-binary hash differently.
  // Multiply variation by a large prime so adjacent seeds look totally different.
  const genderTag = { Man: 'M', Woman: 'W', 'Non-binary': 'N' }[character.gender] || 'X';
  const varSuffix = variation ? String(variation * 7411) : '';
  const seed = (character.name || 'adventurer') + genderTag + varSuffix;
  const h    = seed.split('').reduce((a, c) => ((a * 31) + c.charCodeAt(0)) & 0xffffff, 7);

  // Class → two-tone gradient background (dark plum base + class accent)
  const bgPairs = {
    Chronicler: ['160820', 'b89038'],
    Architect:  ['081820', '28a8a8'],
    Artificer:  ['180828', '8058c0'],
    Wanderer:   ['200810', 'c05848']
  };
  const [bg1, bg2] = bgPairs[character.class] || ['160820', '8058c0'];

  // Skin tone — diverse, deterministic from name
  const skins = ['f2d3b1','ecad80','e58c61','cf7049','b55338','8c4020','5c2810'];
  const skin  = skins[h % skins.length];

  // Hair colour — deterministic
  const hairs = ['0a0400','3d1f0a','6b3a1f','8b5a2b','c49a4a','d0ccc8','888888'];
  const hair  = hairs[(h >> 3) % hairs.length];

  const p = new URLSearchParams({
    seed,
    primaryBackgroundColor:   bg1,
    secondaryBackgroundColor: bg2,
    backgroundType:           'gradientLinear',
    backgroundRotation:       '150',
    skinColor:                skin,
    hairColor:                hair,
    radius:                   '50'
  });
  return `https://api.dicebear.com/8.x/lorelei/svg?${p}`;
}

// Fetch the portrait SVG from DiceBear and return as a data URL
async function fetchPortrait(character, variation) {
  const url = buildPortraitUrl(character, variation);
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('fetch failed');
    const svg  = await res.text();
    const b64  = btoa(unescape(encodeURIComponent(svg)));
    return 'data:image/svg+xml;base64,' + b64;
  } catch {
    return null;
  }
}

// Resize an uploaded image file to a square JPEG data URL
function resizePortrait(file, size) {
  size = size || 300;
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      const min = Math.min(img.width, img.height);
      const sx  = (img.width  - min) / 2;
      const sy  = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function applyPortrait(dataUrl) {
  state.character.portrait = dataUrl;
  saveState();
  renderCharacter();
}

// ── Portrait generator (SVG fallback — kept but not primary)
function generatePortraitSVG(character, uid) {
  const cls    = character.class  || 'Chronicler';
  const race   = character.race   || 'Human';
  const gender = character.gender || 'Non-binary';
  const name   = character.name   || '';
  const id     = uid || 'p';

  const classColor = { Chronicler:'#d4a43a', Architect:'#4ab8b8', Artificer:'#9b72cf', Wanderer:'#d4706a' }[cls] || '#d4a43a';

  // Deterministic skin + hair from name
  const hash = name.split('').reduce((a, c) => ((a * 31) + c.charCodeAt(0)) & 0xffffff, 7);
  const SKINS = ['#fde8c8','#f5cfa0','#e8b87a','#d4956a','#c07848','#8d5524','#5c3317','#3d1f0a'];
  const HAIRS = ['#1a0a00','#3d1f0a','#5c2e10','#8b5a2b','#b4843a','#d4b86a','#c8c8c8','#707070'];
  const skin  = SKINS[hash % SKINS.length];
  const hair  = HAIRS[(hash >> 3) % HAIRS.length];
  const glyph = CLASS_GLYPH[cls] || '✦';

  const isWoman = gender === 'Woman';
  const isMan   = gender === 'Man';

  // Head geometry
  const hcx = 50, hcy = 44;
  const hrx = isMan ? 21 : isWoman ? 19 : 20;
  const hry = isMan ? 24 : isWoman ? 26 : 25;

  // Shoulder width
  const sw = isMan ? 42 : isWoman ? 32 : 36;

  // ── Hair
  const hairTop = hcy - hry;
  let hairSVG = '';
  if (isWoman) {
    hairSVG = `
      <path d="M${hcx-hrx-4},${hcy+4} Q${hcx-hrx-10},${hairTop+6} ${hcx},${hairTop-4}
               Q${hcx+hrx+10},${hairTop+6} ${hcx+hrx+4},${hcy+4}
               Q${hcx+hrx+8},${hcy+20} ${hcx+hrx+2},${hcy+34}" fill="${hair}"/>
      <path d="M${hcx-hrx-4},${hcy+4} Q${hcx-hrx-8},${hcy+20} ${hcx-hrx-2},${hcy+34}" fill="${hair}"/>
    `;
  } else if (isMan) {
    hairSVG = `
      <ellipse cx="${hcx}" cy="${hairTop+5}" rx="${hrx+2}" ry="10" fill="${hair}"/>
      <path d="M${hcx-hrx-2},${hcy-4} Q${hcx-hrx-6},${hairTop+2} ${hcx-8},${hairTop-1}
               Q${hcx+8},${hairTop-1} ${hcx+hrx+6},${hairTop+2} L${hcx+hrx+2},${hcy-4}" fill="${hair}"/>
    `;
  } else {
    // Medium, swept
    hairSVG = `
      <path d="M${hcx-hrx-3},${hcy} Q${hcx-hrx-8},${hairTop+4} ${hcx},${hairTop-5}
               Q${hcx+hrx+8},${hairTop+4} ${hcx+hrx+3},${hcy}
               Q${hcx+hrx+6},${hcy+14} ${hcx+hrx},${hcy+26}" fill="${hair}"/>
    `;
  }

  // ── Ears (race-specific)
  let earsSVG = '';
  const earY = hcy - 2;
  if (race === 'Elf' || race === 'Tiefling') {
    earsSVG = `
      <path d="M${hcx-hrx+1},${earY-5} L${hcx-hrx-9},${earY-16} L${hcx-hrx-3},${earY+3} Z" fill="${skin}"/>
      <path d="M${hcx+hrx-1},${earY-5} L${hcx+hrx+9},${earY-16} L${hcx+hrx+3},${earY+3} Z" fill="${skin}"/>
    `;
  } else if (race === 'Halfling') {
    earsSVG = `
      <ellipse cx="${hcx-hrx-5}" cy="${earY}" rx="7" ry="9" fill="${skin}"/>
      <ellipse cx="${hcx+hrx+5}" cy="${earY}" rx="7" ry="9" fill="${skin}"/>
    `;
  } else {
    earsSVG = `
      <ellipse cx="${hcx-hrx-3}" cy="${earY}" rx="4" ry="5" fill="${skin}"/>
      <ellipse cx="${hcx+hrx+3}" cy="${earY}" rx="4" ry="5" fill="${skin}"/>
    `;
  }

  // ── Special racial features
  let specialSVG = '';
  if (race === 'Tiefling') {
    specialSVG = `
      <path d="M${hcx-10},${hairTop+3} Q${hcx-16},${hairTop-6} ${hcx-9},${hairTop-15}"
            stroke="${hair}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
      <path d="M${hcx+10},${hairTop+3} Q${hcx+16},${hairTop-6} ${hcx+9},${hairTop-15}"
            stroke="${hair}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    `;
  } else if (race === 'Orc') {
    // Subtle lower tusks
    specialSVG = `
      <path d="M${hcx-6},${hcy+hry-8} L${hcx-8},${hcy+hry}" stroke="${skin}" stroke-width="3" stroke-linecap="round" opacity="0.75"/>
      <path d="M${hcx+6},${hcy+hry-8} L${hcx+8},${hcy+hry}" stroke="${skin}" stroke-width="3" stroke-linecap="round" opacity="0.75"/>
    `;
  } else if (race === 'Dwarf') {
    const beardTop = hcy + hry - 6;
    specialSVG = `
      <path d="M${hcx-hrx+4},${beardTop}
               Q${hcx-hrx+2},${beardTop+14} ${hcx},${beardTop+20}
               Q${hcx+hrx-2},${beardTop+14} ${hcx+hrx-4},${beardTop} Z"
            fill="${hair}" opacity="0.88"/>
    `;
  }

  // ── Eyes
  const eyeY  = hcy - 3;
  const eyeLX = hcx - 7, eyeRX = hcx + 7;
  const eyesSVG = `
    <ellipse cx="${eyeLX}" cy="${eyeY}" rx="3.2" ry="3.8" fill="#0a0614"/>
    <ellipse cx="${eyeRX}" cy="${eyeY}" rx="3.2" ry="3.8" fill="#0a0614"/>
    <ellipse cx="${eyeLX}" cy="${eyeY}" rx="1.6" ry="2.0" fill="${classColor}" opacity="0.85"/>
    <ellipse cx="${eyeRX}" cy="${eyeY}" rx="1.6" ry="2.0" fill="${classColor}" opacity="0.85"/>
    <circle  cx="${eyeLX-0.8}" cy="${eyeY-0.8}" r="0.7" fill="rgba(255,255,255,0.5)"/>
    <circle  cx="${eyeRX-0.8}" cy="${eyeY-0.8}" r="0.7" fill="rgba(255,255,255,0.5)"/>
  `;

  // ── Subtle nose
  const noseSVG = `
    <path d="M${hcx-2},${hcy+5} Q${hcx},${hcy+9} ${hcx+2},${hcy+5}"
          stroke="${skin}" stroke-width="1.8" fill="none"
          stroke-linecap="round" opacity="0.45"/>
  `;

  // ── Lips (subtle)
  const lipSVG = `
    <path d="M${hcx-5},${hcy+12} Q${hcx},${hcy+15} ${hcx+5},${hcy+12}"
          stroke="${skin}" stroke-width="1.5" fill="none"
          stroke-linecap="round" opacity="0.35"/>
  `;

  // ── Decorative corner ornaments on the ring
  const orn = `
    <circle cx="50" cy="3"  r="1.5" fill="${classColor}" opacity="0.7"/>
    <circle cx="50" cy="97" r="1.5" fill="${classColor}" opacity="0.7"/>
    <circle cx="3"  cy="50" r="1.5" fill="${classColor}" opacity="0.7"/>
    <circle cx="97" cy="50" r="1.5" fill="${classColor}" opacity="0.7"/>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <clipPath id="pc-${id}"><circle cx="50" cy="50" r="49"/></clipPath>
    <radialGradient id="pbg-${id}" cx="50%" cy="35%" r="65%">
      <stop offset="0%"   stop-color="#2a1840"/>
      <stop offset="100%" stop-color="#0a0614"/>
    </radialGradient>
  </defs>

  <circle cx="50" cy="50" r="49" fill="url(#pbg-${id})"/>

  <g clip-path="url(#pc-${id})">
    <!-- Shoulders -->
    <path d="M${50-sw},100 Q${50-sw+8},76 ${hcx-14},${hcy+hry+16}
             L${hcx+14},${hcy+hry+16} Q${50+sw-8},76 ${50+sw},100 Z"
          fill="${skin}" opacity="0.9"/>

    <!-- Neck -->
    <rect x="${hcx-7}" y="${hcy+hry-5}" width="14" height="20" rx="5" fill="${skin}"/>

    <!-- Hair (behind head) -->
    ${hairSVG}

    <!-- Ears -->
    ${earsSVG}

    <!-- Head -->
    <ellipse cx="${hcx}" cy="${hcy}" rx="${hrx}" ry="${hry}" fill="${skin}"/>

    <!-- Racial special features -->
    ${specialSVG}

    <!-- Eyes -->
    ${eyesSVG}

    <!-- Nose -->
    ${noseSVG}

    <!-- Lips -->
    ${lipSVG}

    <!-- Class badge -->
    <circle cx="50" cy="89" r="8" fill="#0a0614" stroke="${classColor}" stroke-width="1.5" opacity="0.95"/>
    <text x="50" y="93" text-anchor="middle" fill="${classColor}"
          font-size="9" font-family="Georgia, serif">${glyph}</text>
  </g>

  <!-- Rings -->
  <circle cx="50" cy="50" r="48" fill="none" stroke="${classColor}" stroke-width="2"   opacity="0.55"/>
  <circle cx="50" cy="50" r="44" fill="none" stroke="${classColor}" stroke-width="0.5" opacity="0.25"/>
  ${orn}
</svg>`;
}

// ── Character creation
const CLASS_GLYPHS_MAP = {
  Chronicler: '✦', Architect: '⬡', Artificer: '◈', Wanderer: '◎'
};

let ccSelectedClass  = 'Chronicler';
let ccSelectedRace   = 'Human';
let ccSelectedGender = 'Man';

let ccVariation    = 0;
let ccPreviewTimer = null;
let ccPreviewData  = null; // last fetched data URL

async function updateCcPreview(immediate) {
  clearTimeout(ccPreviewTimer);
  const run = async () => {
    const circle = document.getElementById('cc-portrait-circle');
    if (!circle) return;
    // Clear old image so the user sees the shimmer while fetching
    circle.innerHTML = `<span class="cc-portrait-placeholder">✦</span>`;
    circle.classList.add('loading');

    const char = {
      name:   document.getElementById('cc-name').value.trim() || 'Adventurer',
      class:  ccSelectedClass,
      race:   ccSelectedRace,
      gender: ccSelectedGender
    };

    const dataUrl = await fetchPortrait(char, ccVariation);
    circle.classList.remove('loading');
    if (dataUrl) {
      ccPreviewData = dataUrl;
      circle.innerHTML = `<img src="${dataUrl}" alt="Portrait preview" />`;
    }
  };

  if (immediate) {
    run();
  } else {
    ccPreviewTimer = setTimeout(run, 500);
  }
}

function initCharCreate() {
  const screen = document.getElementById('char-create');

  // Race cards
  document.querySelectorAll('.cc-race-card').forEach(card => {
    card.addEventListener('click', () => {
      ccSelectedRace = card.dataset.race;
      document.querySelectorAll('.cc-race-card').forEach(c => c.classList.toggle('active', c === card));
      updateCcPreview(true);
    });
  });

  // Gender pills
  document.querySelectorAll('.cc-gender-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      ccSelectedGender = pill.dataset.gender;
      document.querySelectorAll('.cc-gender-pill').forEach(p => p.classList.toggle('active', p === pill));
      updateCcPreview(true);
    });
  });

  // Class cards
  document.querySelectorAll('.cc-class-card').forEach(card => {
    card.addEventListener('click', () => {
      ccSelectedClass = card.dataset.class;
      document.querySelectorAll('.cc-class-card').forEach(c => c.classList.toggle('active', c === card));
      updateCcPreview(true);
    });
  });

  // "New look" button — increment variation and regenerate
  document.getElementById('cc-regen-btn').addEventListener('click', () => {
    ccVariation++;
    ccPreviewData = null;
    updateCcPreview(true);
  });

  // Own image upload overrides generated portrait
  document.getElementById('cc-portrait-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizePortrait(file, 300);
      ccPreviewData = dataUrl;
      document.getElementById('cc-portrait-circle').innerHTML =
        `<img src="${dataUrl}" alt="Portrait preview" />`;
    } catch { /* ignore */ }
    e.target.value = '';
  });

  // Name input → debounced portrait refresh
  document.getElementById('cc-name').addEventListener('input', () => updateCcPreview(false));

  // Initial portrait render
  ccVariation   = 0;
  ccPreviewData = null;
  updateCcPreview(true);

  // Begin button
  document.getElementById('cc-begin').addEventListener('click', () => {
    const nameInput = document.getElementById('cc-name');
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      nameInput.style.borderColor = 'var(--arm-life)';
      setTimeout(() => nameInput.style.borderColor = '', 1200);
      return;
    }

    // Collect arm labels
    const armInputs = document.querySelectorAll('.cc-arm-input');
    const slots = ['creative','writing','apps','life'];
    const arms = {};
    armInputs.forEach((inp, i) => {
      const val = inp.value.trim();
      if (val) arms[slots[i]] = val;
    });

    state.character.name     = name;
    state.character.class    = ccSelectedClass;
    state.character.race     = ccSelectedRace;
    state.character.gender   = ccSelectedGender;
    state.character.arms     = arms;
    state.character.portrait = ccPreviewData || state.character.portrait || null;
    state.character.level    = 1;
    state.character.xp       = 0;
    state.characterCreated   = true;
    // Clear demo quests — player starts with a blank world they fill themselves
    state.quests        = [];
    state.chronicle     = [];
    state.achievements  = [];
    state.dragHintSeen  = false;
    saveState();

    // Fade out, then remove
    screen.classList.add('fade-out');
    setTimeout(() => {
      screen.classList.add('hidden');
      renderFilters();
      renderMap();
      renderCharacter();
      setTimeout(showDragHint, 800);
    }, 600);
  });
}

// ── Create / edit quest sheet
// Pass a quest object to pre-fill for editing; omit for create mode.
function openCreateSheet(prefillQuest) {
  editingQuestId    = prefillQuest ? prefillQuest.id : null;
  cqSelectedArm     = prefillQuest ? prefillQuest.arm  : 'creative';
  cqSelectedTier    = prefillQuest ? prefillQuest.tier : 'common';
  cqSelectedPrereqs = new Set(prefillQuest ? prefillQuest.requires : []);

  document.getElementById('cq-title').value = prefillQuest ? prefillQuest.title : '';
  document.getElementById('cq-desc').value  = prefillQuest ? (prefillQuest.description || '') : '';

  // Heading & save button
  document.querySelector('.cq-heading').textContent      = prefillQuest ? 'Edit Quest'    : 'New Quest';
  document.getElementById('cq-save').textContent         = prefillQuest ? 'Save Changes'  : 'Create Quest';

  // Arm pills
  const armLabels = getArmLabels();
  document.querySelectorAll('.cq-arm-pill').forEach(p => {
    p.textContent = armLabels[p.dataset.arm] || p.dataset.arm;
    p.classList.toggle('active', p.dataset.arm === cqSelectedArm);
  });

  // Tier cards
  document.querySelectorAll('.cq-tier-card').forEach(c => {
    c.classList.toggle('active', c.dataset.tier === cqSelectedTier);
  });

  // Task rows — seed with existing tasks or one blank row
  const taskList = document.getElementById('cq-task-list');
  taskList.innerHTML = '';
  if (prefillQuest && prefillQuest.tasks.length) {
    prefillQuest.tasks.forEach(t => addCqTaskRow(taskList, t));
  } else {
    addCqTaskRow(taskList);
  }

  // Prerequisites — exclude the quest being edited from its own prereq list
  const prereqList = document.getElementById('cq-prereq-list');
  prereqList.innerHTML = '';
  const available = state.quests.filter(q => q.id !== editingQuestId);
  if (!available.length) {
    prereqList.innerHTML = '<div class="cq-prereq-empty">No other quests yet</div>';
  } else {
    available.forEach(q => {
      const item = document.createElement('div');
      item.className = 'cq-prereq-item';
      item.dataset.id = q.id;
      if (cqSelectedPrereqs.has(q.id)) item.classList.add('selected');
      item.innerHTML = `
        <div class="cq-prereq-check"></div>
        <span class="cq-prereq-name">${q.title}</span>
        <span class="cq-prereq-arm">${armLabels[q.arm] || q.arm}</span>
      `;
      item.addEventListener('click', () => {
        if (cqSelectedPrereqs.has(q.id)) {
          cqSelectedPrereqs.delete(q.id);
          item.classList.remove('selected');
        } else {
          cqSelectedPrereqs.add(q.id);
          item.classList.add('selected');
        }
      });
      prereqList.appendChild(item);
    });
  }

  // Collapse prereq section
  prereqList.classList.add('hidden');
  const toggle = document.getElementById('cq-link-toggle');
  toggle.classList.remove('open');
  toggle.querySelector('.cq-link-toggle-icon').textContent = '+';

  const sheet = document.getElementById('create-sheet');
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
}

function closeCreateSheet() {
  editingQuestId = null;
  const sheet = document.getElementById('create-sheet');
  sheet.classList.remove('open');
  setTimeout(() => sheet.classList.add('hidden'), 350);
}

function addCqTaskRow(list, value) {
  const row = document.createElement('div');
  row.className = 'cq-task-row';
  row.innerHTML = `
    <input class="cq-task-input" type="text" placeholder="Describe this task…" maxlength="120" />
    <button class="cq-task-remove" aria-label="Remove task">×</button>
  `;
  if (value) row.querySelector('.cq-task-input').value = value;
  row.querySelector('.cq-task-remove').addEventListener('click', () => row.remove());
  list.appendChild(row);
  // Only auto-focus on new blank rows, not prefilled ones
  if (!value) setTimeout(() => row.querySelector('.cq-task-input').focus(), 50);
}

function saveNewQuest() {
  const title = document.getElementById('cq-title').value.trim();
  if (!title) {
    document.getElementById('cq-title').focus();
    document.getElementById('cq-title').style.borderColor = 'var(--arm-life)';
    setTimeout(() => document.getElementById('cq-title').style.borderColor = '', 1200);
    return;
  }

  const desc  = document.getElementById('cq-desc').value.trim();
  const tasks = [...document.querySelectorAll('.cq-task-input')]
    .map(i => i.value.trim()).filter(Boolean);

  if (editingQuestId) {
    // ── Edit existing quest
    const quest = state.quests.find(q => q.id === editingQuestId);
    const savedId = editingQuestId;
    if (quest) {
      quest.title       = title;
      quest.description = desc || 'No description yet.';
      quest.arm         = cqSelectedArm;
      quest.tier        = cqSelectedTier;
      quest.requires    = [...cqSelectedPrereqs];
      // Preserve tasksDone state at matching indices
      const newTasks    = tasks.length ? tasks : ['Complete this quest'];
      quest.tasksDone   = newTasks.map((_, i) => quest.tasksDone[i] || false);
      quest.tasks       = newTasks;
      // Sync chronicle entry title/arm/tier if it exists
      const entry = state.chronicle.find(e => e.questId === savedId);
      if (entry) { entry.title = title; entry.arm = cqSelectedArm; entry.tier = cqSelectedTier; }
    }
    saveState();
    renderMap();
    renderCharacter();
    closeCreateSheet();
    setTimeout(() => openQuest(savedId), 400);

  } else {
    // ── Create new quest
    const x = 20 + Math.random() * 55;
    const y = 25 + Math.random() * 55;
    const newQuest = {
      id:          genId(),
      title,
      description: desc || 'No description yet.',
      arm:         cqSelectedArm,
      tier:        cqSelectedTier,
      x:           Math.round(x * 10) / 10,
      y:           Math.round(y * 10) / 10,
      tasks:       tasks.length ? tasks : ['Complete this quest'],
      tasksDone:   (tasks.length ? tasks : ['Complete this quest']).map(() => false),
      requires:    [...cqSelectedPrereqs],
      completedAt: null,
      createdAt:   new Date().toISOString()
    };
    state.quests.push(newQuest);
    saveState();
    renderMap();
    renderCharacter();
    closeCreateSheet();
    setTimeout(() => {
      const node = document.querySelector(`.quest-node[data-id="${newQuest.id}"]`);
      if (node) {
        node.classList.add('selected');
        setTimeout(() => openQuest(newQuest.id), 100);
      }
    }, 400);
  }
}

// ── Chronicle
function renderChronicle() {
  const entries  = state.chronicle.slice().reverse(); // newest first
  const countEl  = document.getElementById('chronicle-count');
  const emptyEl  = document.getElementById('chronicle-empty');
  const timeline = document.getElementById('chronicle-timeline');

  countEl.textContent = entries.length === 1 ? '1 entry' : `${entries.length} entries`;
  emptyEl.style.display  = entries.length ? 'none' : '';
  timeline.style.display = entries.length ? '' : 'none';

  if (!entries.length) return;

  const armLabels = getArmLabels();

  // Group by month
  const groups = {};
  entries.forEach(e => {
    const d   = new Date(e.completedAt);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const lbl = d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = { label: lbl, items: [] };
    groups[key].items.push(e);
  });

  // Flatten to know the absolute last entry (no spine line below it)
  const allItems = Object.values(groups).flatMap(g => g.items);
  const lastEntry = allItems[allItems.length - 1];

  let html = '';
  Object.values(groups).forEach(group => {
    html += `<div class="chronicle-month-label">${group.label}</div>`;
    group.items.forEach((e, i) => {
      const quest    = state.quests.find(q => q.id === e.questId);
      const date     = new Date(e.completedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
      const tier     = e.tier || 'common';
      const icon     = TIER_ICONS[tier] || '◦';
      const arm      = e.arm || 'creative';
      const armLabel = armLabels[arm] || arm;
      const taskCount = quest ? quest.tasks.length : '?';
      const xpEarned  = quest
        ? (XP.task[tier] * quest.tasks.length) + XP.quest[tier]
        : XP.quest[tier];
      const isLast    = e === lastEntry;
      const noteHtml  = e.note
        ? `<div class="chronicle-entry-note">${e.note}</div>`
        : '';

      html += `
        <div class="chronicle-entry">
          <div class="chronicle-spine">
            <div class="chronicle-tier-dot ${tier}">${icon}</div>
            ${!isLast ? '<div class="chronicle-spine-line"></div>' : ''}
          </div>
          <div class="chronicle-entry-body">
            <div class="chronicle-entry-meta">
              <span class="chronicle-arm-tag ${arm}">${armLabel}</span>
              <span class="chronicle-entry-date">${date}</span>
            </div>
            <div class="chronicle-entry-title">${e.title}</div>
            <div class="chronicle-entry-stats">
              <span class="chronicle-entry-stat">
                <span class="chronicle-entry-stat-icon">◦</span>${taskCount} task${taskCount !== 1 ? 's' : ''}
              </span>
              <span class="chronicle-entry-stat">
                <span class="chronicle-entry-stat-icon">✦</span>${xpEarned} XP
              </span>
            </div>
            ${noteHtml}
          </div>
        </div>
      `;
    });
  });

  timeline.innerHTML = html;
}

function showChronicle() {
  document.getElementById('map-section').classList.add('hidden');
  document.getElementById('stats-section').classList.add('hidden');
  document.getElementById('chronicle-section').classList.remove('hidden');
  document.getElementById('fab-create').style.display = 'none';
  renderChronicle();
}

function showStats() {
  document.getElementById('map-section').classList.add('hidden');
  document.getElementById('chronicle-section').classList.add('hidden');
  document.getElementById('stats-section').classList.remove('hidden');
  document.getElementById('fab-create').style.display = 'none';
  renderStats();
}

function showMap() {
  document.getElementById('chronicle-section').classList.add('hidden');
  document.getElementById('stats-section').classList.add('hidden');
  document.getElementById('map-section').classList.remove('hidden');
  document.getElementById('fab-create').style.display = '';
}

// ── Stats
function renderStats() {
  const c         = state.character;
  const quests    = state.quests;
  const completed = quests.filter(q => q.completedAt);
  const totalTasks = quests.reduce((s, q) => s + q.tasks.length, 0);
  const doneTasks  = quests.reduce((s, q) => s + q.tasksDone.filter(Boolean).length, 0);

  // Top cards
  document.getElementById('st-level').textContent  = c.level;
  document.getElementById('st-xp').textContent     = c.xp.toLocaleString();
  document.getElementById('st-quests').textContent = `${completed.length}/${quests.length}`;
  document.getElementById('st-tasks').textContent  = `${doneTasks}/${totalTasks}`;

  // By Area
  const armLabels = getArmLabels();
  const arms      = state.characterCreated
    ? Object.entries(state.character.arms || {}).filter(([, v]) => v && v.trim()).map(([k]) => k)
    : ['creative', 'writing', 'apps', 'life'];

  document.getElementById('st-arms').innerHTML = arms.length ? arms.map(arm => {
    const total = quests.filter(q => q.arm === arm).length;
    const done  = completed.filter(q => q.arm === arm).length;
    const pct   = total ? (done / total) * 100 : 0;
    return `
      <div class="st-arm-row">
        <div class="st-arm-meta">
          <span class="st-arm-label">${armLabels[arm]}</span>
          <span class="st-arm-count">${done} / ${total || 0}</span>
        </div>
        <div class="st-bar-track">
          <div class="st-bar-fill arm-${arm}" style="width:${pct}%"></div>
        </div>
      </div>`;
  }).join('') : '<div class="st-empty">No areas defined.</div>';

  // By Tier
  const tiers  = ['common', 'rare', 'epic', 'legendary'];
  const tierMax = Math.max(...tiers.map(t => quests.filter(q => q.tier === t).length), 1);
  document.getElementById('st-tiers').innerHTML = tiers.map(tier => {
    const total = quests.filter(q => q.tier === tier).length;
    const done  = completed.filter(q => q.tier === tier).length;
    const pct   = (total / tierMax) * 100;
    return `
      <div class="st-tier-row">
        <span class="st-tier-icon tier-${tier}">${TIER_ICONS[tier]}</span>
        <span class="st-tier-name">${tier[0].toUpperCase() + tier.slice(1)}</span>
        <div class="st-bar-track">
          <div class="st-bar-fill tier-fill-${tier}" style="width:${pct}%"></div>
        </div>
        <span class="st-tier-count">${done}<span class="st-tier-total">/${total}</span></span>
      </div>`;
  }).join('');

  // XP by Month (bar chart from chronicle)
  const timelineEl = document.getElementById('st-timeline');
  if (!state.chronicle.length) {
    timelineEl.innerHTML = '<div class="st-empty">Complete quests to see your timeline.</div>';
    return;
  }
  const monthMap = {};
  state.chronicle.forEach(e => {
    const d   = new Date(e.completedAt);
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const lbl = d.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' });
    const q   = quests.find(qq => qq.id === e.questId);
    const xp  = (q ? XP.task[e.tier] * q.tasks.length : 0) + XP.quest[e.tier];
    if (!monthMap[key]) monthMap[key] = { label: lbl, xp: 0, count: 0 };
    monthMap[key].xp    += xp;
    monthMap[key].count += 1;
  });
  const months = Object.values(monthMap);
  const maxXP  = Math.max(...months.map(m => m.xp), 1);
  timelineEl.innerHTML = `
    <div class="st-chart">
      ${months.map(m => `
        <div class="st-chart-col">
          <div class="st-chart-bar-wrap">
            <div class="st-chart-bar" style="height:${Math.max((m.xp / maxXP) * 100, 4)}%">
              <span class="st-chart-tip">${m.xp} XP</span>
            </div>
          </div>
          <div class="st-chart-label">${m.label}</div>
        </div>`).join('')}
    </div>
    <div class="st-chart-legend">
      ${months.map(m => `<span>${m.count} quest${m.count !== 1 ? 's' : ''}</span>`).join('<span class="st-chart-sep">·</span>')}
    </div>`;
}

// ── Export / Import
function exportState() {
  const payload = {
    _version:   1,
    _exportedAt: new Date().toISOString(),
    _app:       'overworld',
    ...deepClone(state)
  };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `overworld-backup-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showXPToast('World exported ✓');
}

let pendingImportData = null;

function handleImportFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      // Basic validation
      if (!data.character || !Array.isArray(data.quests)) {
        showXPToast('Invalid backup file');
        return;
      }
      pendingImportData = data;
      // Show confirmation
      document.getElementById('cs-import-confirm').classList.remove('hidden');
    } catch {
      showXPToast('Could not read file');
    }
  };
  reader.readAsText(file);
}

function confirmImport() {
  if (!pendingImportData) return;
  // Strip the export metadata and load the world data
  const { _version, _exportedAt, _app, ...worldData } = pendingImportData;
  state = worldData;
  saveState();
  pendingImportData = null;
  document.getElementById('cs-import-confirm').classList.add('hidden');
  document.getElementById('cs-import-file').value = '';
  recalcLevel();
  renderFilters();
  renderMap();
  renderCharacter();
  showXPToast('World restored ✓');
}

function cancelImport() {
  pendingImportData = null;
  document.getElementById('cs-import-confirm').classList.add('hidden');
  document.getElementById('cs-import-file').value = '';
}

// ── Map image export
async function exportMapImage() {
  const mapImg = document.getElementById('map-img');
  const SIZE   = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');

  // Background + map image
  ctx.fillStyle = '#160d20';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(mapImg, 0, 0, SIZE, SIZE);

  const armColor = { creative:'#c9a84c', writing:'#a882e0', apps:'#4ac8c0', life:'#d4706a' };

  state.quests.forEach(quest => {
    const px  = (quest.x / 100) * SIZE;
    const py  = (quest.y / 100) * SIZE;
    const col = armColor[quest.arm] || '#c8c2d8';
    const r   = 18;

    // Glow + background circle
    ctx.beginPath(); ctx.arc(px, py, r + 5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(22,13,32,0.5)'; ctx.fill();
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(22,13,32,0.9)'; ctx.fill();

    // Border
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth   = quest.completedAt ? 3 : 2;
    ctx.stroke();

    // Tier icon
    ctx.font = '15px serif';
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(TIER_ICONS[quest.tier] || '◦', px, py);

    // Label
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(200,194,216,0.85)';
    ctx.textBaseline = 'top';
    const label = quest.title.length > 24 ? quest.title.slice(0, 23) + '…' : quest.title;
    ctx.fillText(label, px, py + r + 4);
  });

  // Branding watermark
  ctx.font = 'italic 14px Georgia, serif';
  ctx.fillStyle = 'rgba(200,194,216,0.4)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`Overworld ◈ ${state.character.name}`, SIZE - 14, SIZE - 14);

  canvas.toBlob(async blob => {
    const fname = `overworld-map-${new Date().toISOString().slice(0,10)}.png`;
    const file  = new File([blob], fname, { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ title: 'My Overworld', files: [file] }); return; }
      catch { /* fall through */ }
    }
    const url = URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: fname });
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
    showXPToast('Map saved ✓');
  }, 'image/png');
}

// ── Portrait regen from character sheet
async function regenSheetPortrait() {
  const btn = document.getElementById('cs-regen-portrait');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  csVariation++;
  const dataUrl = await fetchPortrait(state.character, csVariation + 50);
  if (dataUrl) { state.character.portrait = dataUrl; saveState(); renderCharacter(); }
  if (btn) { btn.disabled = false; btn.textContent = '↻'; }
}

// ── Arms rename (character sheet edit panel)
function initArmsEdit() {
  const toggleBtn = document.getElementById('cs-arms-toggle');
  const panel     = document.getElementById('cs-arms-edit');
  const inputs    = document.querySelectorAll('.cs-arm-edit-input');

  // Populate inputs with current values
  inputs.forEach(inp => {
    const slot = inp.dataset.slot;
    inp.value  = (state.character.arms || {})[slot] || '';
    inp.addEventListener('input', () => {
      if (!state.character.arms) state.character.arms = {};
      const val = inp.value.trim();
      if (val) state.character.arms[slot] = val;
      else delete state.character.arms[slot];
      saveState();
      renderFilters();
    });
  });

  toggleBtn.addEventListener('click', () => {
    const isHidden = panel.classList.toggle('hidden');
    toggleBtn.textContent = isHidden ? 'Edit' : 'Done';
  });
}

// ── Reset world
function resetWorld() {
  localStorage.removeItem('overworld_state');
  location.reload();
}

// ── Search bar toggle
function toggleSearch() {
  const bar   = document.getElementById('search-bar');
  const input = document.getElementById('search-input');
  const open  = bar.classList.toggle('hidden');
  if (!open) {           // just opened (hidden was removed)
    input.focus();
  } else {               // just closed
    searchQuery = '';
    input.value = '';
    renderMap();
  }
}

// ── Filters
function renderFilters() {
  const labels = getArmLabels();
  const arms   = state.character.arms || {};
  ['creative','writing','apps','life'].forEach(slot => {
    const btn = document.querySelector(`.arm-filter[data-arm="${slot}"]`);
    if (!btn) return;
    btn.textContent = labels[slot];
    // Hide filter pills for arms the user left blank at character creation
    const defined = !state.characterCreated || (arms[slot] && arms[slot].trim());
    btn.style.display = defined ? '' : 'none';
    if (!defined && activeFilter === slot) {
      activeFilter = 'all';
      document.querySelectorAll('.arm-filter').forEach(b =>
        b.classList.toggle('active', b.dataset.arm === 'all'));
    }
  });
}

function setArmFilter(arm) {
  activeFilter = arm;
  document.querySelectorAll('.arm-filter').forEach(b => b.classList.toggle('active', b.dataset.arm === arm));
  renderMap();
}

function setStatusFilter(status) {
  activeStatusFilter = status;
  document.querySelectorAll('.status-filter').forEach(b => b.classList.toggle('active', b.dataset.status === status));
  renderMap();
}

// ── Resize
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderMap, 80);
});

// ── Init
function init() {
  recalcLevel();
  renderFilters();
  renderMap();
  renderCharacter();

  // Character creation — show on first run, hide immediately if already done
  initCharCreate();
  if (state.characterCreated) {
    // Show drag hint once for returning users who haven't seen it
    if (!state.dragHintSeen) setTimeout(showDragHint, 1200);
    document.getElementById('char-create').classList.add('hidden');
  }

  // Character sheet
  document.getElementById('char-portrait-btn').addEventListener('click', openCharSheet);
  document.getElementById('char-sheet-close').addEventListener('click', closeCharSheet);
  document.getElementById('char-sheet-backdrop').addEventListener('click', closeCharSheet);

  // Quest panel
  document.getElementById('quest-panel-close').addEventListener('click', closeQuest);
  document.getElementById('quest-backdrop').addEventListener('click', closeQuest);

  // Filters
  document.querySelectorAll('.arm-filter').forEach(b => b.addEventListener('click', () => setArmFilter(b.dataset.arm)));
  document.querySelectorAll('.status-filter').forEach(b => b.addEventListener('click', () => setStatusFilter(b.dataset.status)));

  // Nav
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      if (b.dataset.view === 'chronicle') showChronicle();
      else if (b.dataset.view === 'stats') showStats();
      else showMap();
    });
  });

  // Character sheet — change portrait
  document.getElementById('cs-portrait-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dataUrl = await resizePortrait(file, 300);
      applyPortrait(dataUrl);
    } catch (err) { /* silently ignore */ }
    e.target.value = '';
  });

  // FAB — create quest
  document.getElementById('fab-create').addEventListener('click', () => openCreateSheet());

  // Create sheet
  document.getElementById('create-sheet-close').addEventListener('click', closeCreateSheet);
  document.getElementById('create-backdrop').addEventListener('click', closeCreateSheet);

  document.querySelectorAll('.cq-arm-pill').forEach(p => {
    p.addEventListener('click', () => {
      cqSelectedArm = p.dataset.arm;
      document.querySelectorAll('.cq-arm-pill').forEach(x => x.classList.toggle('active', x === p));
    });
  });

  document.querySelectorAll('.cq-tier-card').forEach(c => {
    c.addEventListener('click', () => {
      cqSelectedTier = c.dataset.tier;
      document.querySelectorAll('.cq-tier-card').forEach(x => x.classList.toggle('active', x === c));
    });
  });

  document.getElementById('cq-link-toggle').addEventListener('click', () => {
    const toggle   = document.getElementById('cq-link-toggle');
    const list     = document.getElementById('cq-prereq-list');
    const isOpen   = toggle.classList.toggle('open');
    list.classList.toggle('hidden', !isOpen);
    toggle.querySelector('.cq-link-toggle-icon').textContent = isOpen ? '×' : '+';
  });

  document.getElementById('cq-add-task').addEventListener('click', () => {
    addCqTaskRow(document.getElementById('cq-task-list'));
  });

  document.getElementById('cq-save').addEventListener('click', saveNewQuest);

  // Export / Import
  document.getElementById('cs-export-btn').addEventListener('click', exportState);
  document.getElementById('cs-import-file').addEventListener('change', e => {
    handleImportFile(e.target.files[0]);
  });
  document.getElementById('cs-import-yes').addEventListener('click', confirmImport);
  document.getElementById('cs-import-no').addEventListener('click',  cancelImport);

  // Map image export (filter bar button + character sheet button)
  document.getElementById('map-export-btn').addEventListener('click', exportMapImage);
  document.getElementById('cs-map-export-btn').addEventListener('click', exportMapImage);

  // Portrait regen from character sheet
  document.getElementById('cs-regen-portrait').addEventListener('click', regenSheetPortrait);

  // Arms rename panel
  initArmsEdit();

  // Reset world
  document.getElementById('cs-reset-btn').addEventListener('click', () => {
    document.getElementById('cs-reset-confirm').classList.remove('hidden');
  });
  document.getElementById('cs-reset-yes').addEventListener('click', resetWorld);
  document.getElementById('cs-reset-no').addEventListener('click', () => {
    document.getElementById('cs-reset-confirm').classList.add('hidden');
  });

  // Search
  document.getElementById('search-toggle').addEventListener('click', toggleSearch);
  document.getElementById('search-clear').addEventListener('click', toggleSearch);
  document.getElementById('search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderMap();
  });
}

document.addEventListener('DOMContentLoaded', init);

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

const ARM_LABELS  = { creative: 'Creative', writing: 'Writing', apps: 'Apps', life: 'Life' };
const TIER_ICONS  = { common: '◦', rare: '◈', epic: '⬡', legendary: '★' };
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

// Drag state
let dragState = null; // { questId, node, offsetX, offsetY, moved }

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
  const roadsSvg  = document.getElementById('roads-svg');
  container.innerHTML = '';
  roadsSvg.innerHTML  = '';

  const w = container.offsetWidth;
  const h = container.offsetHeight;

  // Roads
  state.quests.forEach(quest => {
    quest.requires.forEach(reqId => {
      const from = state.quests.find(q => q.id === reqId);
      if (!from) return;
      const x1 = (from.x / 100) * w, y1 = (from.y / 100) * h;
      const x2 = (quest.x / 100) * w, y2 = (quest.y / 100) * h;
      const mx = (x1 + x2) / 2 + (y2 - y1) * 0.15;
      const my = (y1 + y2) / 2 - (x2 - x1) * 0.08;

      const fromDone = !!state.quests.find(q => q.id === reqId)?.completedAt;
      const toDone   = !!quest.completedAt;
      const cls = fromDone && toDone ? 'complete'
                : fromDone           ? 'available'
                :                      'locked';

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);
      path.setAttribute('class', `road-line ${cls}`);
      roadsSvg.appendChild(path);
    });
  });

  // Nodes
  state.quests.forEach(quest => {
    if (activeFilter !== 'all' && quest.arm !== activeFilter) return;
    const status = questStatus(quest);
    if (activeStatusFilter !== 'all' && status !== activeStatusFilter) return;

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

  // Header portrait button
  document.getElementById('char-glyph').textContent    = glyph;
  document.getElementById('portrait-level').textContent = c.level;

  // Sheet
  document.getElementById('cs-char-glyph').textContent  = glyph;
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
  document.getElementById('stat-arm').textContent = arms.length ? arms.map(a => ARM_LABELS[a]).join(', ') : '—';

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
  if (!state.achievements.length) {
    achList.innerHTML = '<li class="no-quests">No achievements yet</li>';
  } else {
    achList.innerHTML = state.achievements.map(a => `
      <li class="achievement-item">
        <span class="achievement-icon">★</span>
        <div>
          <div class="achievement-title">${a.title}</div>
          <div class="achievement-desc">${a.desc}</div>
        </div>
      </li>
    `).join('');
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
  document.getElementById('qp-arm').textContent   = ARM_LABELS[quest.arm] || quest.arm;
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
    reqEl.innerHTML = `<strong>Requires</strong>${names.join(', ')}`;
  } else {
    reqEl.innerHTML = '';
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
  if (!quest || questStatus(quest) === 'locked') return;

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
  } else {
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

// ── Level-up
function showLevelUp(level) {
  const overlay = document.getElementById('levelup-overlay');
  document.getElementById('levelup-num').textContent   = level;
  document.getElementById('levelup-title').textContent = state.character.class;
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

// ── Character creation
const CLASS_GLYPHS_MAP = {
  Chronicler: '✦', Architect: '⬡', Artificer: '◈', Wanderer: '◎'
};

let ccSelectedClass = 'Chronicler';

function initCharCreate() {
  const screen = document.getElementById('char-create');

  // Class card selection
  document.querySelectorAll('.cc-class-card').forEach(card => {
    card.addEventListener('click', () => {
      ccSelectedClass = card.dataset.class;
      document.querySelectorAll('.cc-class-card').forEach(c => c.classList.toggle('active', c === card));
    });
  });

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

    state.character.name  = name;
    state.character.class = ccSelectedClass;
    state.character.level = 1;
    state.character.xp    = 0;
    state.characterCreated = true;
    saveState();

    // Fade out, then remove
    screen.classList.add('fade-out');
    setTimeout(() => {
      screen.classList.add('hidden');
      renderCharacter();
    }, 600);
  });
}

// ── Create quest sheet
function openCreateSheet() {
  // Reset form state
  cqSelectedArm    = 'creative';
  cqSelectedTier   = 'common';
  cqSelectedPrereqs = new Set();

  document.getElementById('cq-title').value = '';
  document.getElementById('cq-desc').value  = '';

  // Arm pills
  document.querySelectorAll('.cq-arm-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.arm === cqSelectedArm);
  });

  // Tier cards
  document.querySelectorAll('.cq-tier-card').forEach(c => {
    c.classList.toggle('active', c.dataset.tier === cqSelectedTier);
  });

  // Seed one task row
  const taskList = document.getElementById('cq-task-list');
  taskList.innerHTML = '';
  addCqTaskRow(taskList);

  // Prerequisites
  const prereqList = document.getElementById('cq-prereq-list');
  prereqList.innerHTML = '';
  const available = state.quests;
  if (!available.length) {
    prereqList.innerHTML = '<div class="cq-prereq-empty">No quests yet</div>';
  } else {
    available.forEach(q => {
      const item = document.createElement('div');
      item.className = 'cq-prereq-item';
      item.dataset.id = q.id;
      item.innerHTML = `
        <div class="cq-prereq-check"></div>
        <span class="cq-prereq-name">${q.title}</span>
        <span class="cq-prereq-arm">${ARM_LABELS[q.arm] || q.arm}</span>
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

  // Collapse the prereq list and reset toggle
  const prereqList2 = document.getElementById('cq-prereq-list');
  const toggle = document.getElementById('cq-link-toggle');
  prereqList2.classList.add('hidden');
  toggle.classList.remove('open');
  toggle.querySelector('.cq-link-toggle-icon').textContent = '+';

  const sheet = document.getElementById('create-sheet');
  sheet.classList.remove('hidden');
  requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
}

function closeCreateSheet() {
  const sheet = document.getElementById('create-sheet');
  sheet.classList.remove('open');
  setTimeout(() => sheet.classList.add('hidden'), 350);
}

function addCqTaskRow(list) {
  const row = document.createElement('div');
  row.className = 'cq-task-row';
  row.innerHTML = `
    <input class="cq-task-input" type="text" placeholder="Describe this task…" maxlength="120" />
    <button class="cq-task-remove" aria-label="Remove task">×</button>
  `;
  row.querySelector('.cq-task-remove').addEventListener('click', () => {
    row.remove();
  });
  list.appendChild(row);
  // Focus new input
  setTimeout(() => row.querySelector('.cq-task-input').focus(), 50);
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

  // Pick a spawn position: slightly random, away from the centre
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
  // Brief highlight after sheet closes
  setTimeout(() => {
    const node = document.querySelector(`.quest-node[data-id="${newQuest.id}"]`);
    if (node) {
      node.classList.add('selected');
      setTimeout(() => openQuest(newQuest.id), 100);
    }
  }, 400);
}

// ── Filters
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
  renderMap();
  renderCharacter();

  // Character creation — show on first run, hide immediately if already done
  initCharCreate();
  if (state.characterCreated) {
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
    });
  });

  // FAB — create quest
  document.getElementById('fab-create').addEventListener('click', openCreateSheet);

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
}

document.addEventListener('DOMContentLoaded', init);

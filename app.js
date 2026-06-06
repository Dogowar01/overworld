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

  // Header portrait
  document.getElementById('portrait-level').textContent = c.level;
  const headerPortrait = document.getElementById('header-portrait-wrap');
  if (state.characterCreated && c.race) {
    document.getElementById('char-glyph').style.display = 'none';
    headerPortrait.innerHTML = generatePortraitSVG(c, 'hdr');
  } else {
    document.getElementById('char-glyph').style.display = '';
    headerPortrait.innerHTML = '';
  }

  // Sheet portrait
  const portraitFrame = document.getElementById('cs-portrait-frame');
  if (state.characterCreated && c.race) {
    portraitFrame.innerHTML = generatePortraitSVG(c, 'sheet');
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

// ── Portrait generator
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
    <ellipse cx="${eyeLX}" cy="${eyeY}" rx="3.2" ry="3.8" fill="#0f0c08"/>
    <ellipse cx="${eyeRX}" cy="${eyeY}" rx="3.2" ry="3.8" fill="#0f0c08"/>
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
      <stop offset="0%"   stop-color="#302418"/>
      <stop offset="100%" stop-color="#0d0a06"/>
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
    <circle cx="50" cy="89" r="8" fill="#0d0a06" stroke="${classColor}" stroke-width="1.5" opacity="0.95"/>
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

function updateCcPreview() {
  const preview = document.getElementById('cc-portrait-preview');
  if (!preview) return;
  const name = document.getElementById('cc-name').value.trim() || 'Adventurer';
  preview.innerHTML = generatePortraitSVG(
    { name, class: ccSelectedClass, race: ccSelectedRace, gender: ccSelectedGender },
    'cc'
  );
  const label = document.getElementById('cc-preview-name-label');
  if (label) label.textContent = name;
}

function initCharCreate() {
  const screen = document.getElementById('char-create');

  // Race cards
  document.querySelectorAll('.cc-race-card').forEach(card => {
    card.addEventListener('click', () => {
      ccSelectedRace = card.dataset.race;
      document.querySelectorAll('.cc-race-card').forEach(c => c.classList.toggle('active', c === card));
      updateCcPreview();
    });
  });

  // Gender pills
  document.querySelectorAll('.cc-gender-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      ccSelectedGender = pill.dataset.gender;
      document.querySelectorAll('.cc-gender-pill').forEach(p => p.classList.toggle('active', p === pill));
      updateCcPreview();
    });
  });

  // Class cards
  document.querySelectorAll('.cc-class-card').forEach(card => {
    card.addEventListener('click', () => {
      ccSelectedClass = card.dataset.class;
      document.querySelectorAll('.cc-class-card').forEach(c => c.classList.toggle('active', c === card));
      updateCcPreview();
    });
  });

  // Name input → live preview
  document.getElementById('cc-name').addEventListener('input', updateCcPreview);

  // Initial preview render
  updateCcPreview();

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

    state.character.name   = name;
    state.character.class  = ccSelectedClass;
    state.character.race   = ccSelectedRace;
    state.character.gender = ccSelectedGender;
    state.character.level  = 1;
    state.character.xp     = 0;
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

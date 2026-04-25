/* ══════════════════════════════════════════════
   app.js — Main Application
   Password lock, UI rendering, game flow,
   Claude API analysis, stats
══════════════════════════════════════════════ */

// ── Config ────────────────────────────────────
const PASSWORD     = 'phili';           // 改這裡換密碼
const CLAUDE_MODEL = 'claude-haiku-4-5-20251001'; // fast + cheap for real-time coaching

// API Key 存在 localStorage（首次設定時輸入，不寫入原始碼）
function getClaudeKey() {
  return localStorage.getItem('gto_claude_key') || '';
}
function saveClaudeKey(key) {
  localStorage.setItem('gto_claude_key', key);
}

// ── State ─────────────────────────────────────
let engine       = null;
let gameState    = null;
let aiThinking   = false;
let handDone     = false;
let raiseSizing  = 0.75;     // default bet sizing fraction of pot
let sessionStats = new SessionStats();

let settings = {
  tableSize:  6,
  aiStyle:    'mixed',
  startStack: 100,
  speed:      1500,
};

// ── Password Lock ─────────────────────────────
function unlock() {
  const val = document.getElementById('lock-input').value;
  const err = document.getElementById('lock-error');
  if (val === PASSWORD) {
    document.getElementById('lock-screen').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
    initGame();
    renderRangeGrid();
    loadApiKeyToInput();
  } else {
    err.textContent = '密碼錯誤，再試一次';
    document.getElementById('lock-input').value = '';
    document.getElementById('lock-input').focus();
  }
}

// ── Settings ──────────────────────────────────
function toggleSettings() {
  document.getElementById('settings-overlay').classList.toggle('hidden');
}

function applySettings() {
  settings.tableSize  = parseInt(document.querySelector('[name="table-size"]:checked')?.value || 6);
  settings.aiStyle    = document.getElementById('set-ai-style').value;
  settings.startStack = parseInt(document.getElementById('set-stack').value);
  settings.speed      = parseInt(document.getElementById('set-speed').value);

  const keyInput = document.getElementById('set-api-key').value.trim();
  if (keyInput) saveClaudeKey(keyInput);

  toggleSettings();
  initGame();
}

function loadApiKeyToInput() {
  const el = document.getElementById('set-api-key');
  if (el && getClaudeKey()) el.value = '（已設定）';
}

// ── Game Init ─────────────────────────────────
function initGame() {
  const numPlayers = settings.tableSize;
  engine = new GameEngine(numPlayers, settings.startStack, 1);

  // Human player (seat 0 = hero)
  engine.addPlayer(new GamePlayer('hero', '你', settings.startStack, 'tag', true));

  // AI opponents
  const styles = pickStyles(numPlayers - 1, settings.aiStyle);
  const aiNames = ['Alex','Bob','Carol','Dan','Eve','Frank','Grace','Hank'];
  for (let i = 0; i < numPlayers - 1; i++) {
    const style = styles[i];
    const label = STYLES[style]?.label || style;
    engine.addPlayer(new GamePlayer(`ai${i}`, `${aiNames[i]}\n${label}`, settings.startStack, style));
  }

  document.getElementById('session-badge').textContent =
    `${numPlayers}-max · ${settings.startStack}BB`;

  renderTableSeats();
  showDealButton();
  updateStats();
}

// ── Seat Layout ───────────────────────────────
// Positions around an oval table (CSS % based)
const SEAT_POS_6 = [
  { bottom:'6%',  left:'42%',  transform:'translateX(-50%)' },  // 0 = hero (bottom)
  { bottom:'22%', left:'4%'  },   // 1
  { top:'18%',    left:'4%'  },   // 2
  { top:'4%',     left:'42%',  transform:'translateX(-50%)' },  // 3
  { top:'18%',    right:'4%' },   // 4
  { bottom:'22%', right:'4%' },   // 5
];
const SEAT_POS_9 = [
  { bottom:'4%',  left:'50%',  transform:'translateX(-50%)' },
  { bottom:'20%', left:'8%'  },
  { top:'38%',    left:'2%'  },
  { top:'12%',    left:'15%' },
  { top:'4%',     left:'50%', transform:'translateX(-50%)' },
  { top:'12%',    right:'15%'},
  { top:'38%',    right:'2%' },
  { bottom:'20%', right:'8%' },
  { bottom:'4%',  right:'15%'},
];

function renderTableSeats() {
  const table    = document.getElementById('poker-table');
  const existing = table.querySelectorAll('.seat');
  existing.forEach(s => s.remove());

  const positions = settings.tableSize <= 6 ? SEAT_POS_6 : SEAT_POS_9;

  engine.players.forEach((player, idx) => {
    const pos = positions[idx] || {};
    const seat = document.createElement('div');
    seat.className = `seat ${player.isHuman ? 'seat-hero' : ''}`;
    seat.id        = `seat-${player.id}`;

    // Apply position styles
    Object.entries(pos).forEach(([k, v]) => seat.style[k] = v);
    seat.style.position = 'absolute';

    const nameLine = player.name.replace('\n', '<br>');
    seat.innerHTML = `
      <div class="seat-cards" id="cards-${player.id}"></div>
      <div class="seat-info">
        <div class="seat-name">${nameLine}</div>
        <div class="seat-stack" id="stack-${player.id}">${player.stack} BB</div>
        <div class="seat-bet"   id="bet-${player.id}"></div>
        <div class="seat-badge" id="badge-${player.id}"></div>
      </div>`;
    table.appendChild(seat);
  });
}

// ── Start New Hand ────────────────────────────
function startNewHand() {
  if (aiThinking) return;
  document.getElementById('deal-area').classList.add('hidden');
  document.getElementById('action-area').classList.add('hidden');

  gameState = engine.newHand();
  handDone  = false;

  renderBoard();
  updateAllSeats();
  markDealer();
  updateStreetBadge();

  // Check if hero needs to act first (e.g., hero is UTG or SB)
  scheduleNextAction();
}

// ── Schedule next action ──────────────────────
function scheduleNextAction() {
  if (gameState.street === 'showdown') { endHand(); return; }

  const current = engine.getCurrentPlayer();
  if (!current) { endHand(); return; }

  if (current.isHuman) {
    showActionButtons();
  } else {
    aiThinking = true;
    hideActionButtons();
    const delay = settings.speed * (0.4 + Math.random() * 0.6);
    setTimeout(() => executeAIAction(current), delay);
  }
}

function executeAIAction(player) {
  // Safety: always reset aiThinking even if something crashes
  try {
    if (gameState.street === 'showdown') { aiThinking = false; endHand(); return; }

    // Skip if player already folded/all-in (state may have changed)
    if (player.folded || player.allIn) {
      aiThinking = false;
      const next = engine.getCurrentPlayer();
      if (next && !next.isHuman) {
        aiThinking = true;
        setTimeout(() => executeAIAction(next), settings.speed * 0.4);
      } else if (next?.isHuman) {
        showActionButtons();
      }
      return;
    }

    const decision = getAIDecision(player, { ...gameState, bbSize: engine.bbSize });
    let action = decision.action;
    let amount = decision.amount || 0;

    // Validate action against what's actually legal
    const valid = engine.getValidActions(player);
    const hasCheck  = valid.includes('check');
    const callEntry = valid.find(v => v?.action === 'call');

    if (action === 'check' && !hasCheck && callEntry) { action = 'call'; amount = callEntry.amount; }
    if (action === 'call'  && !callEntry) action = 'fold';
    if ((action === 'raise' || action === 'bet') && player.stack <= 0) action = 'fold';

    // Show action badge
    showActionBadge(player.id, action, amount);

    engine.handleAction(player.id, action, amount);
    gameState = engine.getState();

    renderBoard();
    updateAllSeats();
    updateStreetBadge();

    aiThinking = false;

    if (gameState.street === 'showdown') {
      endHand();
    } else {
      const next = engine.getCurrentPlayer();
      if (!next) { endHand(); return; }
      if (next.isHuman) {
        showActionButtons();
      } else {
        aiThinking = true;
        const delay = settings.speed * (0.4 + Math.random() * 0.6);
        setTimeout(() => executeAIAction(next), delay);
      }
    }
  } catch (err) {
    // Prevent game from getting stuck if AI decision throws
    console.error('AI action error:', err);
    aiThinking = false;
    // Try to continue by folding the crashed player
    try {
      engine.handleAction(player.id, 'fold', 0);
      gameState = engine.getState();
      renderBoard();
      updateAllSeats();
      if (gameState.street === 'showdown') {
        endHand();
      } else {
        scheduleNextAction();
      }
    } catch (e2) {
      showDealButton(); // last resort
    }
  }
}

// ── Player Action ─────────────────────────────
function playerAction(action, amount = 0) {
  if (aiThinking || handDone) return;
  const hero = engine.players.find(p => p.isHuman);
  if (!hero || engine.getCurrentPlayer()?.id !== hero.id) return;

  hideActionButtons();
  showActionBadge(hero.id, action, amount);

  engine.handleAction(hero.id, action, amount);
  gameState = engine.getState();

  renderBoard();
  updateAllSeats();
  updateStreetBadge();

  if (gameState.street === 'showdown') {
    endHand();
  } else {
    scheduleNextAction();
  }
}

function doCheckCall() {
  const hero   = engine.players.find(p => p.isHuman);
  const toCall = engine.currentBet - hero.streetBet;
  if (toCall <= 0) {
    playerAction('check');
  } else {
    playerAction('call', toCall);
  }
}

function doRaise() {
  const amount = getRaiseAmount();
  const hero   = engine.players.find(p => p.isHuman);
  const toCall = engine.currentBet - hero.streetBet;
  const action = engine.currentBet <= hero.streetBet ? 'bet' : 'raise';
  playerAction(action, amount);
}

function getRaiseAmount() {
  const custom = parseFloat(document.getElementById('raise-input').value);
  if (custom > 0) return custom;
  if (raiseSizing >= 999) {
    const hero = engine.players.find(p => p.isHuman);
    return hero.stack + hero.streetBet;
  }
  const betAmt = Math.round((engine.pot * raiseSizing + engine.currentBet) * 2) / 2;
  return Math.max(betAmt, engine.currentBet * 2);
}

function setSizing(frac) {
  raiseSizing = frac;
  document.querySelectorAll('.sz-btn').forEach(b => b.classList.remove('active'));
  event?.target?.classList?.add('active');
  updateRaiseLabel();
}

function updateRaiseLabel() {
  const amt = getRaiseAmount();
  document.getElementById('raise-amount-label').textContent =
    amt >= (engine.players.find(p=>p.isHuman)?.stack || 999) + (engine.players.find(p=>p.isHuman)?.streetBet || 0)
      ? 'All-in'
      : `${amt.toFixed(1)} BB`;
}

// ── Action Buttons ────────────────────────────
function showActionButtons() {
  const hero   = engine.players.find(p => p.isHuman);
  if (!hero) return;
  const toCall = engine.currentBet - hero.streetBet;

  const areaEl   = document.getElementById('action-area');
  const ccBtn    = document.getElementById('check-call-btn');
  const ccLabel  = document.getElementById('check-call-label');
  const ccEn     = document.getElementById('check-call-en');
  const raiseBtn = document.getElementById('raise-btn');
  const raiseL   = document.getElementById('raise-label');

  if (toCall <= 0) {
    ccLabel.textContent = '過牌';
    ccEn.textContent    = 'Check';
  } else {
    ccLabel.textContent = `跟注`;
    ccEn.textContent    = `Call ${toCall.toFixed(1)} BB`;
  }

  const canRaise = hero.stack > toCall;
  raiseBtn.style.display = canRaise ? '' : 'none';
  raiseL.textContent = engine.currentBet > 0 ? '加注' : '下注';

  // Context
  const ctx = document.getElementById('action-context');
  ctx.textContent = `底池 ${engine.pot.toFixed(1)} BB · 你的位置：${hero.position}`;

  areaEl.classList.remove('hidden');
  document.getElementById('deal-area').classList.add('hidden');
  updateRaiseLabel();
}

function hideActionButtons() {
  document.getElementById('action-area').classList.add('hidden');
}

function showDealButton() {
  document.getElementById('deal-area').classList.remove('hidden');
  document.getElementById('action-area').classList.add('hidden');
}

// ── Render Board (community cards + pot) ──────
function renderBoard() {
  const cc     = document.getElementById('community-cards');
  const potEl  = document.getElementById('pot-label');

  cc.innerHTML = gameState.communityCards.map(c => c.html()).join('');

  // Pad with face-down placeholders for remaining streets
  const needed = { preflop:0, flop:3, turn:4, river:5, showdown:5 }[gameState.street] || 0;
  const shown  = gameState.communityCards.length;
  for (let i = shown; i < needed; i++) {
    cc.innerHTML += `<div class="card card-placeholder"></div>`;
  }

  potEl.textContent = `Pot：${gameState.pot.toFixed(1)} BB`;
}

// ── Render Seats ──────────────────────────────
function updateAllSeats() {
  for (const p of engine.players) {
    const stackEl = document.getElementById(`stack-${p.id}`);
    const cardsEl = document.getElementById(`cards-${p.id}`);
    const betEl   = document.getElementById(`bet-${p.id}`);
    const seatEl  = document.getElementById(`seat-${p.id}`);
    if (!stackEl) continue;

    stackEl.textContent = `${p.stack.toFixed(1)} BB`;

    // Hole cards
    if (cardsEl) {
      if (p.folded) {
        cardsEl.innerHTML = `<div class="card card-folded"></div><div class="card card-folded"></div>`;
      } else if (p.isHuman && p.holeCards.length) {
        cardsEl.innerHTML = p.holeCards.map(c => c.html()).join('');
      } else if (p.holeCards.length) {
        // AI cards: face-down during hand, face-up at showdown
        if (gameState.street === 'showdown') {
          cardsEl.innerHTML = p.holeCards.map(c => c.html()).join('');
        } else {
          cardsEl.innerHTML = `<div class="card card-back"></div><div class="card card-back"></div>`;
        }
      } else {
        cardsEl.innerHTML = '';
      }
    }

    // Bet chip
    if (betEl) {
      betEl.textContent = p.streetBet > 0 ? `${p.streetBet.toFixed(1)} BB` : '';
    }

    // Seat state
    if (seatEl) {
      seatEl.classList.toggle('folded', p.folded);
      seatEl.classList.toggle('allin',  p.allIn);
      seatEl.classList.toggle('active', !p.folded && engine.getCurrentPlayer()?.id === p.id);
    }
  }
}

function markDealer() {
  engine.players.forEach((p, i) => {
    const badge = document.getElementById(`badge-${p.id}`);
    if (!badge) return;
    badge.textContent = '';
    if (i === engine.dealerIdx) badge.textContent = '🎯';
    else if (p.position === 'SB') badge.textContent = 'SB';
    else if (p.position === 'BB') badge.textContent = 'BB';
  });
}

function showActionBadge(playerId, action, amount) {
  const badge = document.getElementById(`badge-${playerId}`);
  if (!badge) return;
  const labels = {
    fold:'FOLD', check:'CHECK', call:`CALL ${amount?.toFixed?.(1)||amount}`,
    bet:`BET ${amount?.toFixed?.(1)||amount}`, raise:`RAISE ${amount?.toFixed?.(1)||amount}`
  };
  badge.textContent = labels[action] || action.toUpperCase();
  badge.className   = `seat-badge action-${action}`;
  setTimeout(() => { badge.className = 'seat-badge'; }, 1800);
}

function updateStreetBadge() {
  const el = document.getElementById('street-badge');
  const labels = { preflop:'翻前', flop:'翻牌', turn:'轉牌', river:'河牌', showdown:'攤牌' };
  el.textContent = labels[gameState.street] || gameState.street;
  el.classList.toggle('hidden', gameState.street === 'preflop');
}

// ── End Hand ──────────────────────────────────
function endHand() {
  handDone = true;
  hideActionButtons();

  // Reveal all cards at showdown
  for (const p of engine.players) {
    const cardsEl = document.getElementById(`cards-${p.id}`);
    if (cardsEl && !p.folded && p.holeCards.length && !p.isHuman) {
      cardsEl.innerHTML = p.holeCards.map(c => c.html()).join('');
    }
  }

  // Show winners
  const winners = gameState.winners || [];
  winners.forEach(w => {
    const seatEl = document.getElementById(`seat-${w.player.id}`);
    if (seatEl) seatEl.classList.add('winner');
    const badge = document.getElementById(`badge-${w.player.id}`);
    if (badge) {
      badge.textContent = `🏆 +${w.amount.toFixed(1)}`;
      badge.className   = 'seat-badge winner-badge';
    }
  });

  // Show winner info in pot area
  const potEl = document.getElementById('pot-label');
  if (winners.length) {
    const w = winners[0];
    potEl.textContent = `🏆 ${w.player.name.split('\n')[0]} 贏得 ${w.amount.toFixed(1)} BB${w.handName ? ` · ${w.handName}` : ''}`;
  }

  // Record to stats
  if (engine.lastHand) {
    sessionStats.recordHand(engine.lastHand);
    updateStats();
    addHandHistory(engine.lastHand);
    autoAnalyze(engine.lastHand);
  }

  // Show deal button after delay
  setTimeout(() => {
    winners.forEach(w => {
      const seatEl = document.getElementById(`seat-${w.player.id}`);
      if (seatEl) seatEl.classList.remove('winner');
    });
    showDealButton();
  }, 2500);
}

// ── Stats UI ──────────────────────────────────
function updateStats() {
  document.getElementById('st-hands').textContent = sessionStats.hands;
  const profit = sessionStats.totalProfit;
  const profitEl = document.getElementById('st-profit');
  profitEl.textContent = (profit >= 0 ? '+' : '') + profit.toFixed(1);
  profitEl.className = 'stat-num ' + (profit >= 0 ? 'profit-pos' : 'profit-neg');
  document.getElementById('st-bb100').textContent = sessionStats.bb100;
  document.getElementById('st-vpip').textContent  = sessionStats.vpip;
  document.getElementById('st-pfr').textContent   = sessionStats.pfr;
  document.getElementById('st-af').textContent    = sessionStats.af;

  const tip = document.getElementById('stats-tip');
  if (tip) tip.textContent = statsTip(sessionStats);
}

// ── Hand History UI ───────────────────────────
function addHandHistory(hand) {
  const list  = document.getElementById('hand-history');
  const empty = list.querySelector('.empty-panel-msg');
  if (empty) empty.remove();

  const hero    = hand.players.find(p => p.isHuman);
  const profit  = hero?.profit || 0;
  const winner  = hand.winners?.[0];
  const heroCards = hero?.holeCards?.map(c => c.display()).join(' ') || '';

  const el = document.createElement('div');
  el.className = `history-item ${profit > 0 ? 'win' : profit < 0 ? 'lose' : ''}`;
  el.innerHTML = `
    <div class="hi-top">
      <span class="hi-hand">Hand #${hand.handNumber}</span>
      <span class="hi-profit ${profit>=0?'pos':'neg'}">${profit>=0?'+':''}${profit.toFixed(1)} BB</span>
    </div>
    <div class="hi-cards">${heroCards}</div>
    <div class="hi-board">${hand.communityCards.map(c=>c.display()).join(' ') || '（無公牌）'}</div>
    <div class="hi-result">${winner ? `🏆 ${winner.name.split('\n')[0]}${winner.handName ? ' · ' + winner.handName : ''}` : ''}</div>
  `;
  el.onclick = () => showHandDetail(hand);
  list.insertBefore(el, list.firstChild);
}

function showHandDetail(hand) {
  showPanel('history');
  const hero  = hand.players.find(p => p.isHuman);
  const cards = hero?.holeCards?.map(c => c.display()).join(' ') || '?? ??';
  const board = hand.communityCards.map(c => c.display()).join(' ') || '（無公牌）';
  const log   = hand.actionLog.filter(e => e.street !== 'blind')
    .map(e => `[${e.street}] ${e.player}(${e.position}): ${e.action}${e.amount?' '+e.amount.toFixed(1)+' BB':''}`)
    .join('\n');

  const msg = `**Hand #${hand.handNumber}**\n你的手牌：${cards}\n公牌：${board}\n\n\`\`\`\n${log}\n\`\`\``;
  addChatMsg('system', msg);
  showPanel('analysis');
}

// ── Panel switching ───────────────────────────
function showPanel(name) {
  document.querySelectorAll('.s-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
  const panel = document.getElementById(`panel-${name}`);
  const tab   = document.querySelector(`.stab[data-panel="${name}"]`);
  if (panel) panel.classList.remove('hidden');
  if (tab)   tab.classList.add('active');
}

// ── Analysis Chat (Claude API) ────────────────
const SYSTEM_PROMPT = `你是一位德州撲克 GTO 教練，熟悉現代 6-max 現金桌的 GTO 策略。
用繁體中文回答，語氣像跟朋友聊天。分析時請聚焦：
1. 翻前選牌與位置合理性
2. 翻後下注頻率、sizing、詐唬選擇
3. 指出 GTO 偏差點並給出具體改善建議
4. 適時提供 EV 概念（不需精確數字）
回答要簡潔，重點用列點。`;

let chatContext = []; // 對話記憶

async function sendChat() {
  const input = document.getElementById('chat-input');
  const text  = input.value.trim();
  if (!text) return;
  input.value = '';

  addChatMsg('user', text);

  // Include current hand context
  const handCtx = buildHandContext();
  const messages = [
    ...chatContext.slice(-6), // keep last 3 exchanges
    { role:'user', content: handCtx ? `[當前牌局]\n${handCtx}\n\n${text}` : text }
  ];

  const reply = await callClaude(messages);
  addChatMsg('assistant', reply);
  chatContext.push({ role:'user', content: text }, { role:'assistant', content: reply });
}

async function autoAnalyze(hand) {
  if (!hand) return;
  showPanel('analysis');

  const hero  = hand.players.find(p => p.isHuman);
  if (!hero) return;

  const cards = hero.holeCards.map(c => c.display()).join(' ');
  const board = hand.communityCards.map(c => c.display()).join(' ') || '（未到翻牌）';
  const log   = hand.actionLog
    .filter(e => e.street !== 'blind')
    .map(e => `[${e.street}] ${e.player}(${e.position}): ${e.action}${e.amount?' '+e.amount.toFixed(1)+' BB':''}`)
    .join('\n');
  const result = hand.winners?.[0];

  const prompt = `請分析這手牌（我是 "你"，人類玩家）：

手牌：${cards}
位置：${hero.position}
公牌：${board}
底池：${hand.pot.toFixed(1)} BB
結果：${result ? `${result.name.split('\n')[0]} 贏 ${result.amount.toFixed(1)} BB${result.handName ? ' · ' + result.handName : ''}` : '未知'}
對手風格：${hand.players.filter(p=>!p.isHuman).map(p=>p.style).join(', ')}

行動記錄：
${log}

請分析我的決策，哪裡好、哪裡可以改進、有沒有 GTO 偏差。`;

  addChatMsg('thinking', '⏳ 分析中…');
  const reply = await callClaude([{ role:'user', content: prompt }]);
  removeThinking();
  addChatMsg('assistant', reply);
  chatContext = [{ role:'user', content: prompt }, { role:'assistant', content: reply }];
}

async function callClaude(messages) {
  if (!getClaudeKey()) {
    return '⚠️ 尚未設定 Anthropic API Key。請點右上角 ⚙️ 設定，輸入你的 API Key 後儲存。';
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         getClaudeKey(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 800,
        system:     SYSTEM_PROMPT,
        messages,
      }),
    });
    if (!res.ok) throw new Error(`API ${res.status}`);
    const data = await res.json();
    return data.content?.[0]?.text || '（無回應）';
  } catch (e) {
    return `⚠️ 無法連接 Claude API：${e.message}`;
  }
}

function buildHandContext() {
  if (!engine?.lastHand) return '';
  const hand  = engine.lastHand;
  const hero  = hand.players.find(p => p.isHuman);
  if (!hero) return '';
  return `Hand #${hand.handNumber} · ${hero.position} · 手牌：${hero.holeCards.map(c=>c.display()).join(' ')} · 公牌：${hand.communityCards.map(c=>c.display()).join(' ')} · 底池：${hand.pot.toFixed(1)} BB`;
}

function addChatMsg(role, text) {
  const box = document.getElementById('analysis-messages');
  const el  = document.createElement('div');
  el.className  = `chat-msg chat-${role}`;
  el.id         = role === 'thinking' ? 'thinking-msg' : '';
  // Simple markdown: **bold**, newlines, ```code```
  el.innerHTML  = formatChatText(text);
  box.appendChild(el);
  box.scrollTop = box.scrollHeight;
}

function removeThinking() {
  const el = document.getElementById('thinking-msg');
  if (el) el.remove();
}

function formatChatText(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```[\s\S]*?```/g, m => `<pre>${m.slice(3,-3).trim()}</pre>`)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// ── Range Grid Rendering ──────────────────────
function renderRangeGrid() {
  const pos    = document.getElementById('range-pos')?.value    || 'BTN';
  const action = document.getElementById('range-action')?.value || 'open';
  const grid   = buildRangeGrid(pos, action);
  const pct    = rangePercent(pos, action);

  const container = document.getElementById('range-grid');
  if (!container) return;

  let html = '<div class="rg-header-row"><div class="rg-corner"></div>';
  for (const r of GRID_RANKS) html += `<div class="rg-header">${r}</div>`;
  html += '</div>';

  for (let i = 0; i < 13; i++) {
    html += '<div class="rg-row">';
    html += `<div class="rg-header">${GRID_RANKS[i]}</div>`;
    for (let j = 0; j < 13; j++) {
      const cell = grid[i][j];
      const cls  = `rg-cell rg-${cell.type}`;
      html += `<div class="${cls}" title="${cell.hand}">${cell.hand.replace(/[so]/,'')}</div>`;
    }
    html += '</div>';
  }

  container.innerHTML = html;
  const pctEl = document.getElementById('range-pct');
  if (pctEl) pctEl.textContent = `範圍：${pct}% 的手牌 (${pos} · ${action})`;
}

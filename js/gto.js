/* ══════════════════════════════════════════════
   gto.js — GTO Pre-flop Range Charts & Stats
   Based on public 6-max GTO approximations
══════════════════════════════════════════════ */

// Ranks in standard grid order (A top-left → 2 bottom-right)
const GRID_RANKS = ['A','K','Q','J','T','9','8','7','6','5','4','3','2'];
const GRID_RANK_VAL = {'A':14,'K':13,'Q':12,'J':11,'T':10,'9':9,'8':8,'7':7,'6':6,'5':5,'4':4,'3':3,'2':2};

// ── Range definitions ────────────────────────
// Format: Set of hand strings like "AKs", "AKo", "AA"
// 's' = suited, 'o' = offsuit, no suffix = pair

const RANGES = {

  // ── Open Raise ranges (6-max, ~2.5x) ────────

  BTN_open: new Set([
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'AKo','AQo','AJo','ATo','A9o','A8o',
    'KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s','K4s',
    'KQo','KJo','KTo','K9o',
    'QJs','QTs','Q9s','Q8s','Q7s','Q6s',
    'QJo','QTo','Q9o',
    'JTs','J9s','J8s','J7s','J6s',
    'JTo','J9o',
    'T9s','T8s','T7s','T6s',
    'T9o','T8o',
    '98s','97s','96s','95s',
    '87s','86s','85s',
    '76s','75s','74s',
    '65s','64s','63s',
    '54s','53s','43s',
  ]),

  CO_open: new Set([
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'AKo','AQo','AJo','ATo','A9o',
    'KQs','KJs','KTs','K9s','K8s','K7s','K6s',
    'KQo','KJo','KTo','K9o',
    'QJs','QTs','Q9s','Q8s','Q7s',
    'QJo','QTo','Q9o',
    'JTs','J9s','J8s','J7s',
    'JTo','J9o',
    'T9s','T8s','T7s',
    'T9o',
    '98s','97s','96s',
    '87s','86s',
    '76s','75s',
    '65s','64s',
    '54s','53s',
  ]),

  HJ_open: new Set([
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s',
    'AKo','AQo','AJo','ATo','A9o',
    'KQs','KJs','KTs','K9s','K8s','K7s',
    'KQo','KJo','KTo',
    'QJs','QTs','Q9s','Q8s',
    'QJo','QTo',
    'JTs','J9s','J8s',
    'JTo',
    'T9s','T8s',
    '98s','97s',
    '87s','86s',
    '76s','75s',
    '65s','64s',
    '54s',
  ]),

  MP_open: new Set([
    'AA','KK','QQ','JJ','TT','99','88','77','66','55',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s',
    'AKo','AQo','AJo','ATo',
    'KQs','KJs','KTs','K9s','K8s',
    'KQo','KJo','KTo',
    'QJs','QTs','Q9s',
    'QJo',
    'JTs','J9s',
    'T9s','T8s',
    '98s','97s',
    '87s',
    '76s',
    '65s',
    '54s',
  ]),

  UTG_open: new Set([
    'AA','KK','QQ','JJ','TT','99','88','77',
    'AKs','AQs','AJs','ATs','A9s','A8s','A5s',
    'AKo','AQo','AJo',
    'KQs','KJs','KTs',
    'KQo','KJo',
    'QJs','QTs',
    'QJo',
    'JTs',
    'T9s',
    '98s',
    '87s',
    '76s',
    '65s',
  ]),

  SB_open: new Set([
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'AKo','AQo','AJo','ATo','A9o','A8o','A7o',
    'KQs','KJs','KTs','K9s','K8s','K7s','K6s','K5s',
    'KQo','KJo','KTo','K9o',
    'QJs','QTs','Q9s','Q8s','Q7s',
    'QJo','QTo',
    'JTs','J9s','J8s',
    'JTo',
    'T9s','T8s',
    '98s','97s',
    '87s','86s',
    '76s','75s',
    '65s','64s',
    '54s',
  ]),

  // ── 3-Bet ranges ──────────────────────────

  BTN_3bet: new Set([
    'AA','KK','QQ','JJ',
    'AKs','AQs','AJs',
    'AKo','AQo',
    'KQs',
    // Bluff 3bets (blockers)
    'A5s','A4s','A3s','A2s',
    'K5s',
    'Q9s','J9s','T8s',
    '76s','65s',
  ]),

  CO_3bet: new Set([
    'AA','KK','QQ','JJ',
    'AKs','AQs',
    'AKo',
    // Bluffs
    'A5s','A4s',
    'K5s','Q9s',
    'J9s','T8s',
  ]),

  HJ_3bet: new Set([
    'AA','KK','QQ',
    'AKs','AQs',
    'AKo',
    'A5s','A4s',
  ]),

  UTG_3bet: new Set([
    'AA','KK','QQ',
    'AKs','AKo',
  ]),

  SB_3bet: new Set([
    'AA','KK','QQ','JJ','TT',
    'AKs','AQs','AJs',
    'AKo','AQo',
    'A5s','A4s','A3s',
    'K5s','Q9s','J8s','T7s','96s','85s','74s','64s',
  ]),

  // ── Call open (BB defense) ────────────────

  BB_call: new Set([
    'AA','KK','QQ','JJ','TT','99','88','77','66','55','44','33','22',
    'AKs','AQs','AJs','ATs','A9s','A8s','A7s','A6s','A5s','A4s','A3s','A2s',
    'AKo','AQo','AJo','ATo','A9o','A8o','A7o','A6o',
    'KQs','KJs','KTs','K9s','K8s','K7s','K6s',
    'KQo','KJo','KTo','K9o','K8o',
    'QJs','QTs','Q9s','Q8s','Q7s','Q6s',
    'QJo','QTo','Q9o',
    'JTs','J9s','J8s','J7s','J6s',
    'JTo','J9o',
    'T9s','T8s','T7s','T6s',
    'T9o','T8o',
    '98s','97s','96s','95s',
    '87s','86s','85s','84s',
    '76s','75s','74s',
    '65s','64s','63s',
    '54s','53s','52s',
    '43s','42s',
  ]),
};

// ── Resolve range key ─────────────────────────
function getRangeKey(position, action) {
  const keyMap = {
    'BTN-open':'BTN_open', 'CO-open':'CO_open', 'HJ-open':'HJ_open',
    'MP-open':'MP_open',   'UTG-open':'UTG_open', 'SB-open':'SB_open',
    'BTN-3bet':'BTN_3bet', 'CO-3bet':'CO_3bet',  'HJ-3bet':'HJ_3bet',
    'UTG-3bet':'UTG_3bet', 'SB-3bet':'SB_3bet',
    'SB-call':'BB_call',   'BB-call':'BB_call',
  };
  const key = keyMap[`${position}-${action}`];
  return RANGES[key] || RANGES.CO_open;
}

// ── Check if hand is in range ─────────────────
function handInRange(c1, c2, rangeSet) {
  const hi = c1.value >= c2.value ? c1 : c2;
  const lo = c1.value >= c2.value ? c2 : c1;
  const hR = hi.rank, lR = lo.rank;
  if (hR === lR) return rangeSet.has(hR + hR.slice(0,1)); // pair
  const suited = hi.suit === lo.suit;
  const key = hR + lR + (suited ? 's' : 'o');
  return rangeSet.has(key);
}

// ── Build 13×13 grid data ─────────────────────
// Returns array of { hand, type } where type = 'open'|'mixed'|'fold'
function buildRangeGrid(position, action) {
  const rangeSet = getRangeKey(position, action);
  const grid = [];

  for (let i = 0; i < 13; i++) {
    const row = [];
    for (let j = 0; j < 13; j++) {
      const r1 = GRID_RANKS[i];
      const r2 = GRID_RANKS[j];
      const v1 = GRID_RANK_VAL[r1];
      const v2 = GRID_RANK_VAL[r2];

      let hand, type;

      if (i === j) {
        // Pairs (diagonal)
        hand = r1 + r2;
        type = rangeSet.has(r1 + r2) || rangeSet.has(r1 + r1.slice(0,1)) || rangeSet.has(r1) ? 'open' : 'fold';
        // Fix: pairs stored as 'AA', 'KK' etc.
        type = rangeSet.has(r1 + r1) ? 'open' : 'fold';
      } else if (i < j) {
        // Suited (above diagonal) — row rank > col rank in GRID_RANKS order means higher value
        const hiR = v1 > v2 ? r1 : r2;
        const loR = v1 > v2 ? r2 : r1;
        hand = hiR + loR + 's';
        type = rangeSet.has(hand) ? 'open' : 'fold';
      } else {
        // Offsuit (below diagonal)
        const hiR = v1 > v2 ? r1 : r2;
        const loR = v1 > v2 ? r2 : r1;
        hand = hiR + loR + 'o';
        type = rangeSet.has(hand) ? 'open' : 'fold';
      }

      // Mixed for borderline hands (simplified)
      if (type === 'open') {
        const borderHands = ['22','33','55','66','A2s','A3s','K4s','K5s','Q6s','Q7s','J7s','T6s','96s','85s','75s','64s','53s'];
        if (borderHands.includes(hand.replace('AA','').replace('KK','') === '' ? hand : hand)) {
          // keep as is — this is simplified
        }
      }

      row.push({ hand, type });
    }
    grid.push(row);
  }
  return grid;
}

// ── Count range combos ────────────────────────
function countCombos(rangeSet) {
  let count = 0;
  for (const h of rangeSet) {
    if (h.length === 2) count += 6;          // pair: C(4,2)=6
    else if (h.endsWith('s')) count += 4;    // suited: 4 combos
    else count += 12;                         // offsuit: 12 combos
  }
  return count;
}

function rangePercent(position, action) {
  const rs     = getRangeKey(position, action);
  const combos = countCombos(rs);
  return ((combos / 1326) * 100).toFixed(1);
}

// ── Session Stats ─────────────────────────────
class SessionStats {
  constructor() { this.reset(); }

  reset() {
    this.hands       = 0;
    this.vpipHands   = 0;
    this.pfrHands    = 0;
    this.totalProfit = 0;  // in BB
    this.bets        = 0;
    this.raises      = 0;
    this.calls       = 0;
    this.wentToSD    = 0;
    this.wonAtSD     = 0;
  }

  recordHand(handRecord) {
    const human = handRecord.players.find(p => p.isHuman);
    if (!human) return;

    this.hands++;
    this.totalProfit += human.profit;

    const humanActions = handRecord.actionLog.filter(
      e => e.isHuman && e.street === 'preflop'
    );
    const voluntaryAct = humanActions.some(e =>
      e.action === 'call' || e.action === 'raise' || e.action === 'bet'
    );
    const raised = humanActions.some(e => e.action === 'raise' || e.action === 'bet');

    if (voluntaryAct) this.vpipHands++;
    if (raised)       this.pfrHands++;

    // AF tracking
    const allHumanActs = handRecord.actionLog.filter(e => e.isHuman);
    for (const e of allHumanActs) {
      if (e.action === 'bet')   this.bets++;
      if (e.action === 'raise') this.raises++;
      if (e.action === 'call')  this.calls++;
    }

    // WTSD
    if (handRecord.showdownResults?.some(r => r.name === human.name)) {
      this.wentToSD++;
      const winner = handRecord.winners?.some(w => w.name === human.name);
      if (winner) this.wonAtSD++;
    }
  }

  get vpip()  { return this.hands ? (this.vpipHands / this.hands * 100).toFixed(0) + '%' : '–'; }
  get pfr()   { return this.hands ? (this.pfrHands  / this.hands * 100).toFixed(0) + '%' : '–'; }
  get af()    { return this.calls ? ((this.bets + this.raises) / this.calls).toFixed(1) : '–'; }
  get bb100() { return this.hands ? (this.totalProfit / this.hands * 100).toFixed(1) : '0'; }
  get wtsd()  { return this.wentToSD ? (this.wonAtSD / this.wentToSD * 100).toFixed(0) + '%' : '–'; }
}

// ── GTO coaching tip from stats ──────────────
function statsTip(stats) {
  if (stats.hands < 10) return '再打幾手，統計才有參考價值。';
  const v = stats.vpipHands / stats.hands;
  const p = stats.pfrHands  / stats.hands;
  const tips = [];

  if (v > 0.30) tips.push('⚠️ VPIP 偏高（>' + Math.round(v*100) + '%），你進入底池的範圍太寬，注意選牌。');
  if (v < 0.14) tips.push('⚠️ VPIP 偏低（<' + Math.round(v*100) + '%），打得太緊，6-max 應約 20–25%。');
  if (p < v * 0.5) tips.push('⚠️ PFR/VPIP 比率低（' + (p/v*100).toFixed(0) + '%），你 call 太多、raise 太少，主動性不足。');
  if (stats.calls > 0 && (stats.bets + stats.raises) / stats.calls < 1.5)
    tips.push('⚠️ AF 偏低，翻後過於被動。嘗試更多 c-bet 與價值下注。');

  return tips.length ? tips.join('\n') : '✅ 統計數據看起來合理，繼續保持！';
}

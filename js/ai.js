/* ══════════════════════════════════════════════
   ai.js — AI Player Decision Making
   5 styles: fish, nit, tag, lag, station
══════════════════════════════════════════════ */

const STYLES = {
  fish: {
    label:         '🐟 魚',
    vpip:          0.48,
    pfrRatio:      0.22,   // pfr / vpip
    aggFactor:     1.2,
    foldToCbet:    0.28,
    foldTo3bet:    0.50,
    bluffFreq:     0.12,
    callDownFreq:  0.78,
    betSizingMult: 0.85,
  },
  nit: {
    label:         '🐌 Nit',
    vpip:          0.11,
    pfrRatio:      0.85,
    aggFactor:     2.6,
    foldToCbet:    0.68,
    foldTo3bet:    0.80,
    bluffFreq:     0.06,
    callDownFreq:  0.28,
    betSizingMult: 1.0,
  },
  tag: {
    label:         '🎯 TAG',
    vpip:          0.22,
    pfrRatio:      0.78,
    aggFactor:     2.9,
    foldToCbet:    0.52,
    foldTo3bet:    0.62,
    bluffFreq:     0.26,
    callDownFreq:  0.45,
    betSizingMult: 0.75,
  },
  lag: {
    label:         '🔥 LAG',
    vpip:          0.36,
    pfrRatio:      0.80,
    aggFactor:     3.6,
    foldToCbet:    0.32,
    foldTo3bet:    0.40,
    bluffFreq:     0.42,
    callDownFreq:  0.58,
    betSizingMult: 0.65,
  },
  station: {
    label:         '🤑 Station',
    vpip:          0.52,
    pfrRatio:      0.15,
    aggFactor:     1.0,
    foldToCbet:    0.18,
    foldTo3bet:    0.55,
    bluffFreq:     0.05,
    callDownFreq:  0.88,
    betSizingMult: 1.0,
  },
};

// ── Pre-flop hand strength (0..1) ────────────
function preflopStrength(c1, c2) {
  const hi  = Math.max(c1.value, c2.value);
  const lo  = Math.min(c1.value, c2.value);
  const suited = c1.suit === c2.suit;
  const isPair = hi === lo;
  const gap    = hi - lo;

  if (isPair) {
    // 22 → 0.36, AA → 1.00
    return 0.36 + (hi - 2) / 12 * 0.64;
  }

  // Base from high card
  let score = (hi / 14) * 0.42 + (lo / 14) * 0.25;
  if (suited)  score += 0.07;
  if (gap <= 1) score += 0.07;
  else if (gap === 2) score += 0.04;
  else if (gap === 3) score += 0.02;

  return Math.min(score, 0.93);
}

// Position bonus — wider ranges in late position
const POS_BONUS = { BTN:0.09, CO:0.05, HJ:0.02, MP:0, 'MP+1':0, 'UTG+1':-0.01, UTG:-0.03, SB:0.04 };

// ── Pre-flop Decision ─────────────────────────
function preflopDecision(player, gameState) {
  const st    = STYLES[player.style] || STYLES.tag;
  const [c1, c2] = player.holeCards;
  const base  = preflopStrength(c1, c2);
  const pos   = POS_BONUS[player.position] || 0;
  const str   = base + pos;

  // Count raises before this player
  const raisesBefore = gameState.actionLog.filter(
    e => e.street === 'preflop' && (e.action === 'raise' || e.action === 'bet')
  ).length;

  const toCall = gameState.currentBet - player.streetBet;

  // ── Facing 3-bet+ ──────────────────────────
  if (raisesBefore >= 2) {
    if (str > 0.85) {
      const amt = gameState.currentBet * 3;
      return { action:'raise', amount: Math.min(amt, player.stack + player.streetBet) };
    }
    if (str > 0.68 && Math.random() > st.foldTo3bet) {
      return { action:'call', amount: Math.min(toCall, player.stack) };
    }
    return { action:'fold' };
  }

  // ── Facing single open ─────────────────────
  if (toCall > 0) {
    const threshold = 0.42 + raisesBefore * 0.05;
    if (str < threshold * (1 - (1 - st.foldTo3bet) * 0.5)) {
      return { action:'fold' };
    }
    // 3-bet
    if (str > 0.78 && Math.random() < st.pfrRatio * 0.6) {
      const rAmt = gameState.currentBet * (2.5 + Math.random());
      return { action:'raise', amount: Math.min(rAmt, player.stack + player.streetBet) };
    }
    return { action:'call', amount: Math.min(toCall, player.stack) };
  }

  // ── First in / LP steal ────────────────────
  const vpipThreshold = 1 - st.vpip;
  if (str >= vpipThreshold) {
    if (Math.random() < st.pfrRatio) {
      const rAmt = gameState.bbSize * (2 + Math.random() * 1.5);
      return { action:'raise', amount: Math.min(rAmt, player.stack + player.streetBet) };
    }
    return { action:'call', amount: Math.min(gameState.bbSize, player.stack) };
  }

  // BB option
  if (player.position === 'BB' && toCall === 0) {
    return { action:'check' };
  }
  return { action:'fold' };
}

// ── Post-flop Decision ────────────────────────
function postflopDecision(player, gameState) {
  const st = STYLES[player.style] || STYLES.tag;
  const all = [...player.holeCards, ...gameState.communityCards];

  let eq = 0.20; // default equity for incomplete boards
  if (all.length >= 5) {
    const result = bestHand(all);
    eq = roughEquity(result.score);
  } else if (all.length === 4) {
    // Turn board not yet complete — estimate
    const result = bestHand([...all, new Card('2','s')]); // dummy
    eq = roughEquity(result.score) * 0.85;
  }

  const toCall = gameState.currentBet - player.streetBet;
  const pot    = gameState.pot;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;

  // ── Facing a bet ────────────────────────────
  if (toCall > 0) {
    // Fold weak hands
    if (eq < potOdds * 0.75 && Math.random() < st.foldToCbet) {
      return { action:'fold' };
    }
    // Raise / re-raise with strong hands
    if (eq > 0.72 && Math.random() < st.aggFactor * 0.12) {
      const rAmt = Math.round(gameState.currentBet * 2.2 * st.betSizingMult);
      return { action:'raise', amount: Math.min(rAmt, player.stack + player.streetBet) };
    }
    // Call
    if (eq > potOdds * (1 + (st.callDownFreq - 0.5))) {
      return { action:'call', amount: Math.min(toCall, player.stack) };
    }
    // Borderline — style decides
    return Math.random() < st.callDownFreq * 0.4
      ? { action:'call', amount: Math.min(toCall, player.stack) }
      : { action:'fold' };
  }

  // ── No bet facing — bet or check ───────────
  if (eq > 0.60) {
    const betPct = 0.45 + Math.random() * 0.4;
    const betAmt = Math.round(pot * betPct * st.betSizingMult);
    if (betAmt > 0 && betAmt <= player.stack) {
      return { action:'bet', amount: betAmt };
    }
  }

  // Bluff
  if (Math.random() < st.bluffFreq) {
    const bluffAmt = Math.round(pot * 0.55 * st.betSizingMult);
    if (bluffAmt > 0 && bluffAmt <= player.stack) {
      return { action:'bet', amount: bluffAmt };
    }
  }

  return { action:'check' };
}

// ── Main export ──────────────────────────────
function getAIDecision(player, gameState) {
  if (gameState.street === 'preflop') {
    return preflopDecision(player, gameState);
  }
  return postflopDecision(player, gameState);
}

// ── Pick a mix of styles ──────────────────────
function pickStyles(count, mode) {
  if (mode === 'mixed') {
    const pool = ['fish','fish','nit','tag','tag','lag','station'];
    const arr  = [];
    for (let i = 0; i < count; i++) {
      arr.push(pool[Math.floor(Math.random() * pool.length)]);
    }
    return arr;
  }
  return Array(count).fill(mode);
}

/* ══════════════════════════════════════════════
   engine.js — Poker Game Engine
   Card, Deck, HandEvaluator, GameEngine
══════════════════════════════════════════════ */

// ── Constants ────────────────────────────────
const RANKS  = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS  = ['s','h','d','c'];
const SUIT_SYM   = { s:'♠', h:'♥', d:'♦', c:'♣' };
const SUIT_COLOR = { s:'black', h:'red', d:'red', c:'black' };
const RANK_VAL   = {
  '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,
  'T':10,'J':11,'Q':12,'K':13,'A':14
};
const RANK_DISPLAY = { 'T':'10','J':'J','Q':'Q','K':'K','A':'A' };
const HAND_NAMES   = ['高牌','一對','兩對','三條','順子','同花','葫蘆','四條','同花順'];

// ── Card ─────────────────────────────────────
class Card {
  constructor(rank, suit) {
    this.rank  = rank;
    this.suit  = suit;
    this.value = RANK_VAL[rank];
  }
  toString() { return this.rank + this.suit; }
  display()  { return (RANK_DISPLAY[this.rank] || this.rank) + SUIT_SYM[this.suit]; }
  color()    { return SUIT_COLOR[this.suit]; }
  html() {
    const r = RANK_DISPLAY[this.rank] || this.rank;
    const s = SUIT_SYM[this.suit];
    const c = SUIT_COLOR[this.suit];
    return `<div class="card ${c}" data-suit="${this.suit}">
              <span class="card-rank">${r}</span>
              <span class="card-suit">${s}</span>
            </div>`;
  }
}

// ── Deck ─────────────────────────────────────
class Deck {
  constructor() {
    this.cards = [];
    for (const r of RANKS)
      for (const s of SUITS)
        this.cards.push(new Card(r, s));
    this.shuffle();
  }
  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  deal() { return this.cards.pop(); }
}

// ── Hand Evaluator ───────────────────────────
// Returns score array: [handRank, ...kickers] — higher = better
// 8=StraightFlush 7=Quads 6=FullHouse 5=Flush 4=Straight 3=Trips 2=TwoPair 1=Pair 0=HighCard
function evaluate5(cards) {
  const vals  = cards.map(c => c.value).sort((a,b) => b - a);
  const suits = cards.map(c => c.suit);

  const isFlush = suits.every(s => s === suits[0]);

  // Straight check (including wheel A-2-3-4-5)
  let isStraight = false, straightHigh = 0;
  const uv = [...new Set(vals)].sort((a,b) => b - a);
  if (uv.length === 5) {
    if (uv[0] - uv[4] === 4) { isStraight = true; straightHigh = uv[0]; }
    // Wheel
    if (uv[0] === 14 && uv[1] === 5 && uv[2] === 4 && uv[3] === 3 && uv[4] === 2) {
      isStraight = true; straightHigh = 5;
    }
  }

  // Frequency map
  const freq = {};
  for (const v of vals) freq[v] = (freq[v] || 0) + 1;
  // Sort by count desc, then value desc
  const groups = Object.entries(freq)
    .map(([v, c]) => [+v, c])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const g = groups.map(x => x[1]);

  if (isFlush && isStraight) return [8, straightHigh];
  if (g[0] === 4) return [7, groups[0][0], groups[1][0]];
  if (g[0] === 3 && g[1] === 2) return [6, groups[0][0], groups[1][0]];
  if (isFlush) return [5, ...vals];
  if (isStraight) return [4, straightHigh];
  if (g[0] === 3) return [3, groups[0][0], groups[1][0], groups[2][0]];
  if (g[0] === 2 && g[1] === 2) return [2, groups[0][0], groups[1][0], groups[2][0]];
  if (g[0] === 2) return [1, groups[0][0], ...groups.slice(1).map(x => x[0])];
  return [0, ...vals];
}

function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] || 0) - (b[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

// Best 5 from 7 cards — C(7,5) = 21 combinations
function bestHand(sevenCards) {
  let best = null;
  for (let i = 0; i < 7; i++) {
    for (let j = i + 1; j < 7; j++) {
      const five  = sevenCards.filter((_, k) => k !== i && k !== j);
      const score = evaluate5(five);
      if (!best || compareScores(score, best.score) > 0) {
        best = { score, cards: five };
      }
    }
  }
  return best;
}

function handName(score) { return HAND_NAMES[score[0]] || '高牌'; }

// Rough equity estimate 0..1 from hand rank (for AI post-flop)
function roughEquity(score) {
  return [0.18, 0.42, 0.62, 0.76, 0.82, 0.87, 0.93, 0.97, 0.99][score[0]] ?? 0.18;
}

// ── Position Labels ──────────────────────────
const POS_6 = ['BTN','SB','BB','UTG','HJ','CO'];
const POS_9 = ['BTN','SB','BB','UTG','UTG+1','MP','MP+1','HJ','CO'];

// ── GamePlayer ───────────────────────────────
class GamePlayer {
  constructor(id, name, stack, style, isHuman = false) {
    this.id      = id;
    this.name    = name;
    this.stack   = stack;
    this.style   = style;  // 'fish'|'nit'|'tag'|'lag'|'station'
    this.isHuman = isHuman;
    this.reset();
  }
  reset() {
    this.holeCards = [];
    this.streetBet = 0;    // bet in current street
    this.totalBet  = 0;    // total chips committed this hand
    this.folded    = false;
    this.allIn     = false;
    this.acted     = false;
    this.position  = '';
  }
}

// ── GameEngine ───────────────────────────────
class GameEngine {
  constructor(numPlayers = 6, startStack = 100, bbSize = 1) {
    this.numPlayers = numPlayers;
    this.startStack = startStack;
    this.bbSize     = bbSize;
    this.sbSize     = bbSize / 2;
    this.players    = [];
    this.dealerIdx  = 0;
    this.handNumber = 0;
    this.lastHand   = null;
    this.handHistory = [];
  }

  // ── Setup ──────────────────────────────────
  addPlayer(p) { this.players.push(p); }

  resetStacks() {
    for (const p of this.players) p.stack = this.startStack;
  }

  // ── New Hand ───────────────────────────────
  newHand() {
    this.handNumber++;
    this.deck           = new Deck();
    this.communityCards = [];
    this.pot            = 0;
    this.currentBet     = 0;
    this.street         = 'preflop';
    this.actionLog      = [];
    this.lastAggressor  = null;
    this.winners        = null;
    this.showdownResults = null;
    this.startStacks    = {};

    for (const p of this.players) {
      p.reset();
      this.startStacks[p.id] = p.stack;
    }

    // Assign positions
    const posNames = this.numPlayers <= 6 ? POS_6 : POS_9;
    for (let i = 0; i < this.players.length; i++) {
      const idx = (i + this.dealerIdx) % this.players.length;
      this.players[idx].position = posNames[i] || `Seat${i+1}`;
    }

    // Blinds
    this.sbIdx = (this.dealerIdx + 1) % this.players.length;
    this.bbIdx = (this.dealerIdx + 2) % this.players.length;
    this._postBlind(this.sbIdx, this.sbSize);
    this._postBlind(this.bbIdx, this.bbSize);
    this.currentBet = this.bbSize;

    // Deal hole cards
    for (let round = 0; round < 2; round++)
      for (const p of this.players)
        p.holeCards.push(this.deck.deal());

    // UTG acts first preflop
    this.actionIdx = (this.bbIdx + 1) % this.players.length;
    // Reset acted flags — BB has option if no raise
    for (const p of this.players) p.acted = false;
    this.players[this.sbIdx].acted = true;  // SB posted, acts later
    this.players[this.bbIdx].acted = false; // BB has option

    return this.getState();
  }

  _postBlind(idx, amount) {
    const p    = this.players[idx];
    const paid = Math.min(amount, p.stack);
    p.stack    -= paid;
    p.streetBet = paid;
    p.totalBet += paid;
    this.pot   += paid;
    this.actionLog.push({ street:'blind', player:p.name, position:p.position, action:'blind', amount:paid });
    if (p.stack === 0) p.allIn = true;
  }

  // ── Action Handling ────────────────────────
  getValidActions(player) {
    const toCall = this.currentBet - player.streetBet;
    const actions = ['fold'];
    if (toCall <= 0) {
      actions.push('check');
    } else {
      actions.push({ action:'call', amount: Math.min(toCall, player.stack) });
    }
    const minRaise = this.currentBet + Math.max(this.bbSize, this.currentBet - (this.lastAggressorBet || 0));
    if (player.stack > toCall) {
      actions.push({ action:'raise', min: minRaise, max: player.stack + player.streetBet });
    }
    return actions;
  }

  handleAction(playerId, action, amount = 0) {
    const p = this.players.find(x => x.id === playerId);
    if (!p || p.folded || p.allIn) return false;

    const entry = {
      street:   this.street,
      player:   p.name,
      position: p.position,
      isHuman:  p.isHuman,
      action,
      amount:   0,
      potBefore: this.pot,
    };

    if (action === 'fold') {
      p.folded = true;

    } else if (action === 'check') {
      // no change

    } else if (action === 'call') {
      const toCall   = Math.min(this.currentBet - p.streetBet, p.stack);
      p.stack       -= toCall;
      p.streetBet   += toCall;
      p.totalBet    += toCall;
      this.pot      += toCall;
      entry.amount   = toCall;
      if (p.stack === 0) p.allIn = true;

    } else if (action === 'raise' || action === 'bet') {
      const totalStreetBet = Math.min(amount, p.stack + p.streetBet);
      const added          = totalStreetBet - p.streetBet;
      p.stack             -= added;
      p.totalBet          += added;
      this.pot            += added;
      this.lastAggressorBet = this.currentBet;
      this.currentBet      = totalStreetBet;
      p.streetBet          = totalStreetBet;
      this.lastAggressor   = p;
      entry.amount         = totalStreetBet;
      entry.action         = action;
      if (p.stack === 0) p.allIn = true;
      // Others need to act again
      for (const other of this.players)
        if (other.id !== p.id && !other.folded && !other.allIn)
          other.acted = false;
    }

    p.acted = true;
    this.actionLog.push(entry);

    // Advance action
    this._advanceAction();
    return true;
  }

  _advanceAction() {
    const activePlayers = this.players.filter(p => !p.folded && !p.allIn);

    // Check if betting round is over
    const pending = activePlayers.filter(p => !p.acted || p.streetBet < this.currentBet);
    if (pending.length === 0) {
      this._endStreet();
      return;
    }

    // Find next player
    let tries = 0;
    do {
      this.actionIdx = (this.actionIdx + 1) % this.players.length;
      tries++;
      if (tries > this.players.length * 2) { this._endStreet(); return; }
    } while (
      this.players[this.actionIdx].folded ||
      this.players[this.actionIdx].allIn  ||
      (this.players[this.actionIdx].acted &&
       this.players[this.actionIdx].streetBet >= this.currentBet)
    );
  }

  _endStreet() {
    // Reset street bets
    for (const p of this.players) {
      p.streetBet = 0;
      p.acted     = false;
    }
    this.currentBet     = 0;
    this.lastAggressor  = null;
    this.lastAggressorBet = 0;

    const alive = this.players.filter(p => !p.folded);
    if (alive.length <= 1) { this._endHand(); return; }

    const transitions = { preflop:'flop', flop:'turn', turn:'river', river:'showdown' };
    this.street = transitions[this.street] || 'showdown';

    if (this.street === 'flop') {
      this.communityCards.push(this.deck.deal(), this.deck.deal(), this.deck.deal());
    } else if (this.street === 'turn' || this.street === 'river') {
      this.communityCards.push(this.deck.deal());
    } else if (this.street === 'showdown') {
      this._endHand(); return;
    }

    // Post-flop: first active player left of dealer
    this._setPostflopAction();
  }

  _setPostflopAction() {
    for (let i = 1; i <= this.players.length; i++) {
      const idx = (this.dealerIdx + i) % this.players.length;
      const p   = this.players[idx];
      if (!p.folded && !p.allIn) { this.actionIdx = idx; return; }
    }
    // All remaining are all-in — run out board
    this._endStreet();
  }

  _endHand() {
    this.street = 'showdown';
    const alive = this.players.filter(p => !p.folded);

    if (alive.length === 1) {
      alive[0].stack += this.pot;
      this.winners = [{ player: alive[0], amount: this.pot, hand: null, handName: '' }];
    } else {
      // Evaluate all hands
      const results = alive.map(p => {
        const all  = [...p.holeCards, ...this.communityCards];
        const hand = all.length >= 5 ? bestHand(all) : { score:[0,0], cards:[] };
        return { player:p, hand };
      }).sort((a, b) => compareScores(b.hand.score, a.hand.score));

      // Award pot to winner(s) — ties split pot
      const topScore = results[0].hand.score;
      const winners  = results.filter(r => compareScores(r.hand.score, topScore) === 0);
      const share    = Math.floor(this.pot / winners.length);

      this.winners = winners.map(w => {
        w.player.stack += share;
        return { player: w.player, amount: share, hand: w.hand, handName: handName(w.hand.score) };
      });
      this.showdownResults = results;
    }

    // Rotate dealer
    this.dealerIdx = (this.dealerIdx + 1) % this.players.length;

    // Record
    this.lastHand = {
      handNumber:     this.handNumber,
      players:        this.players.map(p => ({
        id:         p.id,
        name:       p.name,
        position:   p.position,
        isHuman:    p.isHuman,
        style:      p.style,
        holeCards:  [...p.holeCards],
        startStack: this.startStacks[p.id],
        endStack:   p.stack,
        profit:     p.stack - this.startStacks[p.id],
        folded:     p.folded,
      })),
      communityCards: [...this.communityCards],
      pot:            this.pot,
      winners:        this.winners?.map(w => ({
        name:     w.player.name,
        amount:   w.amount,
        handName: w.handName,
      })),
      showdownResults: this.showdownResults?.map(r => ({
        name:     r.player.name,
        holeCards: [...r.player.holeCards],
        handName: handName(r.hand.score),
        score:    r.hand.score,
      })),
      actionLog: [...this.actionLog],
    };
    this.handHistory.unshift(this.lastHand);
  }

  getCurrentPlayer() { return this.players[this.actionIdx]; }

  getState() {
    return {
      players:         this.players,
      communityCards:  this.communityCards,
      pot:             this.pot,
      currentBet:      this.currentBet,
      street:          this.street,
      actionIdx:       this.actionIdx,
      handNumber:      this.handNumber,
      winners:         this.winners,
      showdownResults: this.showdownResults,
      bbSize:          this.bbSize,
    };
  }
}

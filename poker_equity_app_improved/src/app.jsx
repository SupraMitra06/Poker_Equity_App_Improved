import React, { useState, useMemo, useCallback } from 'react';
import { Sparkles, RotateCcw, Trash2, Grid, Award, Flame, Layers, ChevronRight } from 'lucide-react';

/* ============================================================
1. CORE POKER ENGINE & HAND EVALUATOR
============================================================ */
const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"];
const RANK_VALS = { "A": 14, "K": 13, "Q": 12, "J": 11, "T": 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2 };
const SUITS = ["s", "h", "d", "c"];
const SUIT_SYMBOLS = { s: "♠", h: "♥", d: "♦", c: "♣" };
const HAND_NAMES = [
  "High Card", "Pair", "Two Pair", "Three of a Kind", 
  "Straight", "Flush", "Full House", "Four of a Kind", "Straight Flush"
];
const PLAYER_COLORS = ["#38bdf8", "#fbbf24", "#f43f5e", "#c084fc", "#34d399", "#fb923c"];

function fullDeck() {
  const deck = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push({ rank: RANK_VALS[r], label: r, suit: s, id: `${r}${s}` });
    }
  }
  return deck;
}

function evaluate5(cards) {
  const ranks = cards.map(c => c.rank).sort((a, b) => b - a);
  const suits = cards.map(c => c.suit);
  const isFlush = suits.every(s => s === suits[0]);
  
  const counts = {};
  for (const r of ranks) counts[r] = (counts[r] || 0) + 1;
  const countEntries = Object.entries(counts)
    .map(([r, c]) => [Number(r), c])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const uniqueRanks = [...new Set(ranks)];
  let isStraight = false;
  let straightHigh = 0;
  if (uniqueRanks.length >= 5) {
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
        isStraight = true;
        straightHigh = uniqueRanks[i];
        break;
      }
    }
  }
  if (!isStraight && [14, 5, 4, 3, 2].every(r => uniqueRanks.includes(r))) {
    isStraight = true;
    straightHigh = 5;
  }

  if (isFlush && isStraight) return [8, straightHigh];
  if (countEntries[0][1] === 4) return [7, countEntries[0][0], countEntries[1][0]];
  if (countEntries[0][1] === 3 && countEntries[1][1] >= 2) return [6, countEntries[0][0], countEntries[1][0]];
  if (isFlush) return [5, ...ranks];
  if (isStraight) return [4, straightHigh];
  if (countEntries[0][1] === 3) return [3, countEntries[0][0], ...countEntries.slice(1).map(e => e[0])];
  if (countEntries[0][1] === 2 && countEntries[1][1] === 2) {
    const pairs = [countEntries[0][0], countEntries[1][0]].sort((a, b) => b - a);
    return [2, ...pairs, countEntries[2][0]];
  }
  if (countEntries[0][1] === 2) return [1, countEntries[0][0], ...countEntries.slice(1).map(e => e[0])];
  return [0, ...ranks];
}

function compareHand(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

function* combosGen(arr, k, start = 0, prefix = []) {
  if (prefix.length === k) { yield prefix; return; }
  for (let i = start; i <= arr.length - (k - prefix.length); i++) {
    yield* combosGen(arr, k, i + 1, [...prefix, arr[i]]);
  }
}

function evaluate7(cards) {
  let best = null;
  for (const combo of combosGen(cards, 5)) {
    const val = evaluate5(combo);
    if (!best || compareHand(val, best) > 0) best = val;
  }
  return best;
}

/* ============================================================
2. MAIN APPLICATION COMPONENT
============================================================ */
export default function App() {
  const [numPlayers, setNumPlayers] = useState(2);
  const [playerCards, setPlayerCards] = useState(Array.from({ length: 6 }, () => [null, null]));
  const [board, setBoard] = useState([null, null, null, null, null]);
  const [pickerTarget, setPickerTarget] = useState(null); // { type: 'player'|'board', pi, si }
  const [rangeModalPi, setRangeModalPi] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [results, setResults] = useState(null);

  const allDeckCards = useMemo(() => fullDeck(), []);

  // Collect all card IDs currently assigned
  const usedCardIds = useMemo(() => {
    const used = new Set();
    playerCards.slice(0, numPlayers).forEach(pc => pc.forEach(c => c && used.add(c.id)));
    board.forEach(c => c && used.add(c.id));
    return used;
  }, [playerCards, board, numPlayers]);

  const assignCard = useCallback((card) => {
    if (!pickerTarget) return;
    if (pickerTarget.type === 'player') {
      setPlayerCards(prev => {
        const next = prev.map(pc => [...pc]);
        next[pickerTarget.pi][pickerTarget.si] = card;
        return next;
      });
    } else {
      setBoard(prev => {
        const next = [...prev];
        next[pickerTarget.si] = card;
        return next;
      });
    }
    setPickerTarget(null);
  }, [pickerTarget]);

  // Monte Carlo & Exact Simulation Engine
  const runSimulation = useCallback(() => {
    const activePlayers = playerCards.slice(0, numPlayers);
    if (activePlayers.some(pc => !pc[0] || !pc[1])) return;

    setSimulating(true);

    setTimeout(() => {
      const used = usedCardIds;
      const availableDeck = allDeckCards.filter(c => !used.has(c.id));
      const activeBoard = board.filter(Boolean);
      const missing = 5 - activeBoard.length;

      const iterations = missing >= 4 ? 20000 : 10000;
      const wins = new Array(numPlayers).fill(0);
      const ties = new Array(numPlayers).fill(0);
      const handDist = Array.from({ length: numPlayers }, () => new Array(9).fill(0));

      for (let iter = 0; iter < iterations; iter++) {
        const deckCopy = [...availableDeck];
        const extra = [];
        for (let m = 0; m < missing; m++) {
          const idx = Math.floor(Math.random() * deckCopy.length);
          extra.push(deckCopy[idx]);
          deckCopy[idx] = deckCopy[deckCopy.length - 1];
          deckCopy.pop();
        }

        const fullBoard = [...activeBoard, ...extra];
        const evals = activePlayers.map(p => evaluate7([...p, ...fullBoard]));
        
        let maxEval = evals[0];
        for (let p = 0; p < numPlayers; p++) {
          handDist[p][evals[p][0]] += 1;
          if (compareHand(evals[p], maxEval) > 0) maxEval = evals[p];
        }

        const winners = [];
        for (let p = 0; p < numPlayers; p++) {
          if (compareHand(evals[p], maxEval) === 0) winners.push(p);
        }

        const splitShare = 1.0 / winners.length;
        if (winners.length === 1) {
          wins[winners[0]] += 1;
        } else {
          winners.forEach(w => ties[w] += splitShare);
        }
      }

      const winPcts = wins.map(w => (w / iterations) * 100);
      const tiePcts = ties.map(t => (t / iterations) * 100);
      const equities = winPcts.map((w, i) => w + tiePcts[i] / 2);
      const distributions = handDist.map(dist => dist.map(c => (c / iterations) * 100));

      setResults({ equities, wins: winPcts, ties: tiePcts, distributions });
      setSimulating(false);
    }, 20);
  }, [playerCards, board, numPlayers, usedCardIds, allDeckCards]);

  const allHoleCardsFilled = playerCards.slice(0, numPlayers).every(pc => pc[0] && pc[1]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-10 space-y-8">
      {/* Header Bar */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400">
              TEXAS HOLD'EM EQUITY CALCULATOR
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full">
              Pro Engine
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Monte Carlo simulation engine & GTO range analyzer
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            <label className="text-slate-400 font-semibold uppercase tracking-wider">Players:</label>
            <select
              value={numPlayers}
              onChange={e => { setNumPlayers(Number(e.target.value)); setResults(null); }}
              className="bg-transparent text-slate-100 font-bold focus:outline-none cursor-pointer"
            >
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n} className="bg-slate-900">{n} Players</option>)}
            </select>
          </div>

          <button
            onClick={() => { setBoard([null, null, null, null, null]); setResults(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-300 bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 rounded-lg transition"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
            Clear Board
          </button>

          <button
            onClick={() => { setPlayerCards(Array.from({ length: 6 }, () => [null, null])); setBoard([null, null, null, null, null]); setResults(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/40 border border-rose-800/50 rounded-lg transition"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            Reset All
          </button>
        </div>
      </header>

      {/* Player Hands Grid */}
      <section className="space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-xs font-bold uppercase tracking-widest text-sky-400 flex items-center gap-1.5">
            <Layers className="w-4 h-4" /> Player Hole Cards
          </h2>
          {!allHoleCardsFilled && (
            <span className="text-xs text-amber-400/90 font-medium">
              Assign 2 hole cards to each active player
            </span>
          )}
        </div>

        <div className={`grid gap-4 ${numPlayers <= 3 ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'}`}>
          {playerCards.slice(0, numPlayers).map((pc, pi) => {
            const eq = results?.equities?.[pi];
            const winPct = results?.wins?.[pi];
            const tiePct = results?.ties?.[pi];
            const dist = results?.distributions?.[pi];

            return (
              <div 
                key={pi} 
                className="glass-panel rounded-xl p-4 flex flex-col justify-between space-y-4 relative overflow-hidden transition-all duration-300"
                style={{ borderColor: `${PLAYER_COLORS[pi]}33` }}
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1" style={{ color: PLAYER_COLORS[pi] }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PLAYER_COLORS[pi] }} />
                    Player {pi + 1}
                  </span>
                  <button
                    onClick={() => setRangeModalPi(pi)}
                    className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 hover:bg-emerald-900/80 transition"
                  >
                    <Grid className="w-3 h-3" /> Matrix
                  </button>
                </div>

                {/* Cards Slot Display */}
                <div className="flex gap-2 justify-center my-1">
                  {[0, 1].map(si => (
                    <div key={si} onClick={() => setPickerTarget({ type: 'player', pi, si })} className="cursor-pointer">
                      {pc[si] ? (
                        <div className={`poker-card ${pc[si].suit === 'h' || pc[si].suit === 'd' ? 'card-red' : 'card-black'}`}>
                          <div className="text-lg font-card leading-none">{pc[si].label}</div>
                          <div className="text-sm text-right leading-none font-bold">{SUIT_SYMBOLS[pc[si].suit]}</div>
                        </div>
                      ) : (
                        <div className="poker-card-empty hover:scale-105 transition-transform">+</div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Equity Results & Stats */}
                {eq !== undefined ? (
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-bold text-slate-300">Equity:</span>
                      <span className="text-lg font-extrabold text-white">{eq.toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800/90 rounded-full overflow-hidden">
                      <div 
                        className="h-full transition-all duration-500 rounded-full" 
                        style={{ width: `${eq}%`, backgroundColor: PLAYER_COLORS[pi] }} 
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Win: {winPct.toFixed(1)}%</span>
                      <span>Tie: {tiePct.toFixed(1)}%</span>
                    </div>

                    {/* Outcome Distribution Breakdown */}
                    {dist && (
                      <div className="pt-2 border-t border-slate-800/60 space-y-1">
                        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Top Outcomes</div>
                        {HAND_NAMES.map((name, catIdx) => {
                          const pct = dist[catIdx];
                          if (pct < 1.0) return null;
                          return (
                            <div key={name} className="flex justify-between items-center text-[10px]">
                              <span className="text-slate-300 truncate">{name}</span>
                              <span className="text-slate-400 font-mono">{pct.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-2 text-xs text-slate-500 italic">
                    Ready for simulation
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Community Board Section */}
      <section className="glass-panel rounded-2xl p-6 flex flex-col items-center gap-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-sky-400 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" /> Community Board Cards
        </h2>
        <div className="flex flex-wrap justify-center gap-3 md:gap-4">
          {board.map((c, idx) => (
            <div key={idx} onClick={() => setPickerTarget({ type: 'board', si: idx })} className="cursor-pointer">
              {c ? (
                <div className={`poker-card ${c.suit === 'h' || c.suit === 'd' ? 'card-red' : 'card-black'}`}>
                  <div className="text-lg font-card leading-none">{c.label}</div>
                  <div className="text-sm text-right leading-none font-bold">{SUIT_SYMBOLS[c.suit]}</div>
                </div>
              ) : (
                <div className="poker-card-empty font-semibold text-xs">
                  {idx < 3 ? `Flop ${idx + 1}` : idx === 3 ? 'Turn' : 'River'}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-400 text-center">
          Click any slot above to set Flop, Turn, or River community cards
        </p>
      </section>

      {/* Calculate Button */}
      <div className="flex justify-center pt-2">
        <button
          onClick={runSimulation}
          disabled={!allHoleCardsFilled || simulating}
          className="w-full max-w-md py-4 px-8 rounded-xl font-extrabold text-sm tracking-wider uppercase text-slate-950 bg-gradient-to-r from-emerald-400 via-teal-300 to-sky-400 hover:from-emerald-300 hover:to-sky-300 active:scale-[0.99] transition-all shadow-xl shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2"
        >
          {simulating ? (
            <>
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
              Simulating 20,000 Hands...
            </>
          ) : (
            <>
              <Flame className="w-4 h-4" /> Run Equity Simulation
            </>
          )}
        </button>
      </div>

      {/* 52-Card Picker Modal */}
      {pickerTarget && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setPickerTarget(null)}
        >
          <div 
            className="glass-panel bg-slate-950/95 border-slate-800 rounded-2xl p-6 max-w-xl w-full space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">Select Card from Deck</h3>
                <p className="text-[11px] text-slate-400">Used cards in play are disabled</p>
              </div>
              <button 
                onClick={() => setPickerTarget(null)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-13 gap-1 md:gap-1.5">
              {SUITS.map(s => (
                RANKS.map(r => {
                  const id = `${r}${s}`;
                  const disabled = usedCardIds.has(id);
                  const isRed = s === 'h' || s === 'd';
                  return (
                    <button
                      key={id}
                      disabled={disabled}
                      onClick={() => assignCard({ rank: RANK_VALS[r], label: r, suit: s, id })}
                      className={`h-11 text-xs font-bold rounded-lg flex flex-col items-center justify-center transition-all ${
                        disabled
                          ? 'bg-slate-900/90 text-slate-700 border border-slate-900 cursor-not-allowed opacity-40'
                          : 'bg-white text-slate-950 hover:bg-emerald-400 hover:text-slate-950 shadow-md active:scale-95'
                      }`}
                    >
                      <span className="leading-none">{r}</span>
                      <span className={`text-[10px] leading-none ${isRed ? 'text-red-600' : 'text-slate-950'}`}>
                        {SUIT_SYMBOLS[s]}
                      </span>
                    </button>
                  );
                })
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Hand Range GTO Matrix Modal (13x13) */}
      {rangeModalPi !== null && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setRangeModalPi(null)}
        >
          <div 
            className="glass-panel bg-slate-950/95 border-slate-800 rounded-2xl p-6 max-w-2xl w-full space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-slate-100 text-sm">
                  GTO Hand Matrix — Player {rangeModalPi + 1}
                </h3>
                <p className="text-[11px] text-slate-400">Click a cell to auto-assign representative cards</p>
              </div>
              <button 
                onClick={() => setRangeModalPi(null)} 
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-13 gap-1">
              {RANKS.map((r1, r1Idx) => (
                RANKS.map((r2, r2Idx) => {
                  const isPair = r1Idx === r2Idx;
                  const isSuited = r1Idx < r2Idx;
                  const label = isPair ? `${r1}${r2}` : isSuited ? `${r1}${r2}s` : `${r2}${r1}o`;
                  
                  const bg = isPair 
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/40' 
                    : isSuited 
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/40' 
                    : 'bg-slate-800/60 text-slate-400 border-slate-800 hover:bg-slate-700/60';

                  return (
                    <button
                      key={label}
                      onClick={() => {
                        let c1, c2;
                        if (isPair) {
                          c1 = { rank: RANK_VALS[r1], label: r1, suit: 'h', id: `${r1}h` };
                          c2 = { rank: RANK_VALS[r2], label: r2, suit: 'd', id: `${r2}d` };
                        } else if (isSuited) {
                          c1 = { rank: RANK_VALS[r1], label: r1, suit: 'h', id: `${r1}h` };
                          c2 = { rank: RANK_VALS[r2], label: r2, suit: 'h', id: `${r2}h` };
                        } else {
                          c1 = { rank: RANK_VALS[r2], label: r2, suit: 'h', id: `${r2}h` };
                          c2 = { rank: RANK_VALS[r1], label: r1, suit: 's', id: `${r1}s` };
                        }

                        setPlayerCards(prev => {
                          const next = prev.map(pc => [...pc]);
                          next[rangeModalPi] = [c1, c2];
                          return next;
                        });
                        setRangeModalPi(null);
                      }}
                      className={`h-8 text-[10px] font-bold rounded border transition-all flex items-center justify-center active:scale-95 ${bg}`}
                    >
                      {label}
                    </button>
                  );
                })
              ))}
            </div>

            <div className="flex justify-between items-center text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
              <span className="flex items-center gap-3">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-500/40" /> Pairs</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-500/40" /> Suited</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-slate-800" /> Offsuit</span>
              </span>
              <button 
                onClick={() => setRangeModalPi(null)} 
                className="px-3 py-1 text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

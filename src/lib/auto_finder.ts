/**
 * auto_finder.ts — Auto-finder engine for the Raid Counter Calculator
 *
 * Scans all Pokémon (including custom/fan-made) and scores each as a counter
 * against the configured boss. Results are ranked by estimated raiders needed.
 *
 * Exports:
 *  - analyticalRaiders:  closed-form raiders estimate (additive) / loop (multiplicative)
 *  - computeCandidate:   score a single Pokémon against the boss
 *  - runAutoFinder:      async chunked full-dex scan with progress callback
 */

import {
  lookupPokeWithCustom, getAllPokemonNamesWithCustom, getAllLearnableMoveNamesWithCustom,
  getLevelUpMoves, runCalc, calcStat, getNat, typeEff,
  RAID_TIERS, DEFAULT_EVS, DEFAULT_IVS,
} from './engine_pokemon';

import type { BossConfig } from './raid_types';
import type { CandidateMetrics } from './raid_types';
import type { MoveData } from './engine_pokemon';

const RAID_DEF_MULT: Record<string, number> = {
  'Normal (×1 HP)': 1,
  '3★ Raid (×2 HP)': 1.2,
  '4★ Raid (×3 HP)': 1.45,
  '5★ Raid (×6.8 HP)': 1.85,
  '6★ Raid (×10 HP)': 2.2,
  '7★ Raid (×22 HP)': 2.6,
};

// ── Raider estimation formulas ────────────────────────────────────────────────

/**
 * Estimate the minimum number of raiders needed, given:
 *  d    = avgTotalPct / 100  (fraction of base HP one Pokémon deals before fainting)
 *  inc  = hpIncreasePerRaider / 100
 *  mode = 'additive' | 'multiplicative'
 *  k    = Pokémon per raider (default 6)
 *
 * Additive:       R(6d - p) > (1 - p)  →  R > (1-p)/(6d-p)
 * Multiplicative: find smallest R where R·6d ≥ (1+p)^(R-1)  (loop ≤100)
 */
export function analyticalRaiders(
  d: number, inc: number, mode: 'additive' | 'multiplicative', k = 6
): number {
  if (d <= 0) return 999;
  if (inc === 0) return Math.ceil(1 / (k * d));
  if (mode === 'additive') {
    const denom = k * d - inc;
    if (denom <= 0) return 999;
    return Math.ceil((1 - inc) / denom);
  }
  // multiplicative: boss HP = (1+inc)^(R-1), total damage = R·k·d
  for (let r = 1; r <= 100; r++) {
    if (r * k * d >= Math.pow(1 + inc, r - 1)) return r;
  }
  return 999;
}

// ── Single-Pokémon scorer ─────────────────────────────────────────────────────

/**
 * Compute analytical metrics for one Pokémon vs the configured boss.
 * Returns null if the Pokémon is unsuitable (BST < 330, no moves, immune, etc.).
 *
 * @param name       Pokémon display name (looked up via custom + Showdown dex)
 * @param boss       Boss configuration (data must be non-null)
 * @param bossBaseHP Boss HP before raider scaling
 * @param inc        hpIncreasePerRaider / 100
 * @param mode       Scaling mode
 * @param sortMetric Which metric drives the final sort ('raiders'|'damage'|'ohko'|'turns')
 */
export function computeCandidate(
  name: string,
  boss: BossConfig,
  bossBaseHP: number,
  inc: number,
  mode: 'additive' | 'multiplicative',
  preferredCat?: 'Physical' | 'Special' | null
): CandidateMetrics | null {
  const data = lookupPokeWithCustom(name);
  if (!data || !boss.data) return null;

  // BST filter — skip weak Pokémon early
  const bst = data.stats.hp + data.stats.atk + data.stats.def + data.stats.spa + data.stats.spd + data.stats.spe;
  if (bst < 330) return null;

  const raidMult = RAID_TIERS[boss.raidTier] ?? 1;
  const defMult = RAID_DEF_MULT[boss.raidTier] ?? 1;
  const bossTypes = boss.teraType ? [boss.teraType] : boss.data.types;
  const bossFake = {
    ...boss.data,
    stats: {
      ...boss.data.stats,
      hp: Math.round(boss.data.stats.hp * raidMult),
      def: Math.round(boss.data.stats.def * defMult),
      spd: Math.round(boss.data.stats.spd * defMult),
    },
  };

  // Pick the best damaging move (highest eff × BP × STAB score)
  const moves: MoveData[] = getAllLearnableMoveNamesWithCustom(name);
  if (!moves.length) return null;
  let bestMove: MoveData | null = null;
  let bestScore = -1;
  for (const mv of moves) {
    const eff = typeEff(mv.type, bossTypes);
    if (eff === 0) continue;
    const stab  = data.types.includes(mv.type) ? 1.5 : 1;
    const catBonus = preferredCat ? (mv.cat === preferredCat ? 1.0 : 0.5) : 1.0;
    const score = eff * mv.bp * stab * catBonus;
    if (score > bestScore) { bestScore = score; bestMove = mv; }
  }
  if (!bestMove) return null;

  // Compute damage output (attacker → boss)
  const eff    = typeEff(bestMove.type, bossTypes);
  const atkRes = runCalc({
    atkPoke: data, defPoke: bossFake, bp: bestMove.bp, cat: bestMove.cat, mtyp: bestMove.type,
    atkEvs: DEFAULT_EVS, defEvs: boss.evs, atkIvs: DEFAULT_IVS, defIvs: boss.ivs,
    atkNat: 'Hardy', defNat: boss.nature, atkTera: '', defTera: boss.teraType,
    atkItem: '(none)', atkStatus: 'Healthy', weather: boss.weather, doubles: boss.doubles,
    atkScreen: false, defScreen: boss.defScreen, isCrit: false, zmove: false,
    atkLv: 100, defLv: boss.level || 100,
  });
  if (!atkRes || atkRes.immune) return null;
  const avgDmg    = ((atkRes.minD ?? 0) + (atkRes.maxD ?? 0)) / 2;
  const avgDmgPct = bossBaseHP > 0 ? avgDmg / bossBaseHP * 100 : 0;
  if (avgDmgPct < 0.1) return null;

  // Compute survivability against ALL boss moves (weighted by BP)
  const bossMoves = (boss.customMoves?.length) ? boss.customMoves : getLevelUpMoves(boss.name);
  const atkHP     = calcStat(data.stats.hp, 0, 31, true, 1, 100);
  let ohkoRisk = 0, turnsSurvived = 99;
  let worstOhkoRisk = 0; // worst-case move
  if (bossMoves.length) {
    let totalBP = 0, weightedOhko = 0, weightedTurns = 0;
    for (const bm of bossMoves) {
      const defRes = runCalc({
        atkPoke: bossFake, defPoke: data,
        bp: bm.bp, cat: bm.cat, mtyp: bm.type,
        atkEvs: boss.evs, defEvs: DEFAULT_EVS, atkIvs: boss.ivs, defIvs: DEFAULT_IVS,
        atkNat: boss.nature, defNat: 'Hardy', atkTera: boss.teraType, defTera: '',
        atkItem: '(none)', atkStatus: 'Healthy', weather: boss.weather, doubles: boss.doubles,
        atkScreen: false, defScreen: false, isCrit: false, zmove: false,
        atkLv: boss.level || 100, defLv: 100,
      });
      if (defRes && !defRes.immune) {
        const avgBossDmg = ((defRes.minD ?? 0) + (defRes.maxD ?? 0)) / 2;
        const thisOhko = Math.min(1, (defRes.maxD ?? 0) / Math.max(1, atkHP));
        const thisTurns = avgBossDmg > 0 ? Math.max(0, Math.floor(atkHP / avgBossDmg)) : 99;
        weightedOhko += thisOhko * bm.bp;
        weightedTurns += thisTurns * bm.bp;
        totalBP += bm.bp;
        if (thisOhko > worstOhkoRisk) worstOhkoRisk = thisOhko;
      } else {
        // Immune to this move — counts as 0 damage
        weightedTurns += 99 * bm.bp;
        totalBP += bm.bp;
      }
    }
    if (totalBP > 0) {
      ohkoRisk      = weightedOhko / totalBP;
      turnsSurvived = Math.max(0, Math.round(weightedTurns / totalBP));
    }
  }

  // Discard counters that get OHKOd by the boss's worst move with high probability —
  // they're too fragile to be reliable even if their damage output looks good.
  if (worstOhkoRisk >= 0.98) return null;

  // Speed — faster Pokémon get an extra hit in
  const atkSpe  = calcStat(data.stats.spe, 0, 31, false, 1, 100);
  const bossSpe = calcStat(boss.data.stats.spe, boss.evs.spe, boss.ivs.spe, false, getNat(boss.nature, 'spe'), boss.level || 100);
  const extraHit   = atkSpe >= bossSpe ? 1 : 0;
  const totalHits  = Math.min(Math.max(1, turnsSurvived) + extraHit, 30);
  const avgTotalPct = avgDmgPct * totalHits;

  // Survival penalty: Pokémon frequently OHKOd are less reliable in practice
  // A high ohkoRisk means the attacker often faints before delivering its hits
  const survivalPenalty =
    worstOhkoRisk >= 0.85 ? 3.0 :   // almost certain OHKO — strongly penalise
    worstOhkoRisk >= 0.65 ? 2.0 :   // likely OHKO
    worstOhkoRisk >= 0.45 ? 1.5 :   // risky
    1.0;

  const baseRaiders  = Math.max(1, analyticalRaiders(avgTotalPct / 100, inc, mode));
  const estRaiders   = Math.max(1, Math.ceil(baseRaiders * survivalPenalty));

  return { name, data, bestMove, eff, avgDmgPct, avgTotalPct, ohkoRisk, turnsSurvived, estRaiders };
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

export type SortMetric = 'raiders' | 'damage' | 'ohko' | 'turns';

export function sortCandidates(results: CandidateMetrics[], metric: SortMetric): CandidateMetrics[] {
  const copy = [...results];
  switch (metric) {
    case 'damage':  return copy.sort((a, b) => b.avgTotalPct - a.avgTotalPct || a.estRaiders - b.estRaiders);
    case 'ohko':    return copy.sort((a, b) => a.ohkoRisk - b.ohkoRisk       || a.estRaiders - b.estRaiders);
    case 'turns':   return copy.sort((a, b) => b.turnsSurvived - a.turnsSurvived || a.estRaiders - b.estRaiders);
    default:        return copy.sort((a, b) => a.estRaiders - b.estRaiders   || b.avgTotalPct - a.avgTotalPct);
  }
}

// ── Full-dex scanner ──────────────────────────────────────────────────────────

/**
 * Async chunked scan of all Pokémon (Showdown + custom).
 * Yields to the browser every 40 Pokémon to keep the UI responsive.
 *
 * @param boss          Boss configuration
 * @param bossBaseHP    HP before raider scaling
 * @param inc           hpIncreasePerRaider / 100
 * @param mode          Scaling mode
 * @param maxResults    Maximum number of candidates to return (default 40)
 * @param onProgress    Callback receiving 0–100 progress percentage
 * @param sortMetric    How to rank results
 */
export async function runAutoFinder(
  boss: BossConfig,
  bossBaseHP: number,
  inc: number,
  mode: 'additive' | 'multiplicative',
  maxResults: number,
  onProgress: (pct: number) => void,
  sortMetric: SortMetric = 'raiders',
  preferredCat?: 'Physical' | 'Special' | null,
  shouldCancel?: () => boolean
): Promise<CandidateMetrics[]> {
  const names = getAllPokemonNamesWithCustom();
  const results: CandidateMetrics[] = [];
  const CHUNK = 40;

  for (let i = 0; i < names.length; i += CHUNK) {
    if (shouldCancel && shouldCancel()) break;
    // Yield to browser event loop
    await new Promise<void>(r => setTimeout(r, 0));
    onProgress(Math.round(i / names.length * 100));
    for (let j = i; j < Math.min(i + CHUNK, names.length); j++) {
      if (shouldCancel && shouldCancel()) break;
      const cand = computeCandidate(names[j], boss, bossBaseHP, inc, mode, preferredCat);
      if (cand && cand.estRaiders < 500) results.push(cand);
    }
  }

  return sortCandidates(results, sortMetric).slice(0, maxResults);
}

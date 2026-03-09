/**
 * raid_types.ts — Shared interfaces for the Raid Counter Calculator
 *
 * Imported by: CounterCalcTool.tsx, mc_engine.ts, auto_finder.ts, CustomPokemonPanel.tsx
 */

import type { MoveData, PokeData, PokeStat } from './engine_pokemon';

// ── Core slot types ───────────────────────────────────────────────────────────

/** Full move-damage result from runCalc, with added convenience fields. */
export interface CalcResult {
  minD: number; maxD: number;
  defHp: number;
  minP: number; maxP: number;
  ohko: boolean; possibleOhko: boolean; twoHko: boolean;
  hitsToKo: [number, number];
  rolls: number[];
  immune: boolean;
}

/** One attacker slot in the counter list. */
export interface CounterSlot {
  id: number;
  name: string;
  data: PokeData | null;
  level: number;
  nature: string;
  item: string;
  evs: PokeStat;
  ivs: PokeStat;
  teraType: string;
  moveName: string;
  moveData: MoveData | null;
  zmove: boolean;
  isCrit: boolean;
  /** How many copies of this Pokémon to include in the team (default 1). */
  count: number;
  /** raiderId: which raider this slot belongs to (1-based, 0 = unassigned) */
  raiderId: number;
  result: CalcResult | null;
  error: string;
}

/** Full boss configuration. */
export interface BossConfig {
  name: string;
  data: PokeData | null;
  level: number;
  nature: string;
  evs: PokeStat;
  ivs: PokeStat;
  teraType: string;
  raidTier: string;
  weather: string;
  doubles: boolean;
  defScreen: boolean;
  // Raider scaling
  numRaiders: number;
  hpIncreasePerRaider: number;
  hpScalingMode: 'additive' | 'multiplicative';
  // Custom movepool override (replaces level-up moves in sim when non-empty)
  customMoves: MoveData[];
  // Slots per raider team (default 6)
  teamSize: number;
}

/** Per-slot stats from one Monte Carlo run. */
export interface PerSlotStats {
  name: string;
  avgHd: number;   // average hits dealt to boss
  avgHs: number;   // average hits suffered from boss
  ohko: number;    // fraction of trials where this slot was one-shot
  avgDd: number;   // average raw damage dealt to boss (HP units)
  avgDt: number;   // average raw damage taken from boss (HP units)
}

/** Full simulation result returned by runMC / runMCViaWorker. */
export interface SimResult {
  trials: number;
  mean: number;
  median: number;
  p90: number;
  pWin: number;
  hist: Record<number, number>;
  policy: string;
  perSlot: PerSlotStats[];
  perRaider?: PerRaiderStats[];
}

/** Aggregated stats for one raider's full team. */
export interface PerRaiderStats {
  raiderIdx: number;       // 0-based
  totalDmgPct: number;     // % of boss HP dealt by this team
  avgOhkoRisk: number;
  slotsUsed: number;
  teamNames: string[];
}

/** One candidate entry from the Auto-Finder. */
export interface CandidateMetrics {
  name: string;
  data: PokeData;
  bestMove: MoveData;
  eff: number;
  avgDmgPct: number;
  avgTotalPct: number;
  ohkoRisk: number;
  turnsSurvived: number;
  estRaiders: number;
}

/** Raider team — used for per-raider template management. */
export interface RaiderTeam {
  id: number;
  label: string;
  slots: CounterSlot[];
}

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
  // ── Simple mode (min-raiders calc) ─────────────────────────────────────────
  /** Total damage this Pokémon deals over the full raid fight (simple mode). */
  avgDamagePerFight: number;
  /** If true, apply shadowMultiplierOnDualType when boss has two types. */
  isShadow: boolean;
  /** Whether this slot is active in the simple-mode calculation. */
  activeInSimple: boolean;
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
  // Simple mode / min-raiders
  /** Multiplier applied to shadow moves when boss has two types (default 4). */
  shadowMultiplierOnDualType: number;
  /** Base HP override for simple-mode min-raiders calc (bypasses stat formula). */
  simpleBaseHp: number;
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

/** One candidate entry from the Auto-Finder. */
// (already defined above)

// ── Min-Raiders Calculator types ──────────────────────────────────────────────

export type MinRaidersStatus = "solved" | "impossible" | "needs_more_data";

/** Per-slot damage breakdown for the min-raiders simple mode. */
export interface SlotDamageBreakdown {
  slotId: number;
  name: string;
  count: number;
  baseDmg: number;       // avgDamagePerFight before shadow mult
  effectiveDmg: number;  // after shadow multiplier
  isShadow: boolean;
  multiplierApplied: number;
  subtotal: number;      // count × effectiveDmg
}

/** Full result returned by the min-raiders solver. */
export interface MinRaidersResult {
  status: MinRaidersStatus;
  n: number | null;
  bossHpAtN: number | null;
  perRaiderDamage: number;
  totalDamageAtN: number | null;
  denominator?: number;    // d - b*p  (linear mode)
  numerator?: number;      // b*(1-p)  (linear mode)
  formula: string;
  warning?: string;
  breakdown: SlotDamageBreakdown[];
}

/** Monte Carlo result for simple-mode min-raiders. */
export interface SimpleMonteCarloResult {
  trials: number;
  meanN: number;
  medianN: number;
  p5: number;
  p95: number;
  pSuccess: number;   // fraction where same n or fewer needed
  histogram: Record<number, number>;
}


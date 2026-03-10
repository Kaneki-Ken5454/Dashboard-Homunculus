/**
 * CounterCalcTool.tsx - Raid Counter Calculator (Complete Rewrite)
 *
 * Core concept:
 *   - One shared team, all raiders use the same team.
 *   - Full EV/IV/Nature/Item customization per slot.
 *   - Boss HP scales with number of raiders.
 *   - Monte Carlo simulation for realistic win probabilities.
 *   - Improved auto-finder based on type matchups and boss defense.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  lookupPoke,
  lookupMove,
  lookupPokeWithCustom,
  lookupMoveWithCustom,
  searchPokemonWithCustom,
  searchMovesWithCustom,
  getLevelUpMoves,
  runCalc,
  calcStat,
  typeEff,
  weaknessChart,
  useShowdownData,
  injectCustomPokemon,
  removeCustomPokemon,
  getCustomPokemonNames,
  RAID_TIERS,
  DEFAULT_EVS,
  DEFAULT_IVS,
  ALL_TYPES,
  TC_COLORS,
  type PokeData,
  type MoveData,
  type PokeStat,
} from '../lib/engine_pokemon';
import { runAutoFinder } from '../lib/auto_finder';
import type { CandidateMetrics, BossConfig } from '../lib/raid_types';
import { TypeBadge, AutoInput } from '../lib/pokemon_components';

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

interface TeamSlot {
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
  error: string;
  result: SlotResult | null;
}

interface SlotResult {
  minD: number;
  maxD: number;
  avgD: number;
  minP: number;
  maxP: number;
  avgP: number;
  eff: number;
  stab: boolean;
  immune: boolean;
  cat: string;
  mtyp: string;
  defHp: number;
  hitsToKo: [number, number]; // [min hits, max hits]
  ohko: boolean;
  possibleOhko: boolean;
  twoHko: boolean;
}

interface BossState {
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
  defScreen: boolean; // Reflect/Light Screen on boss side
  customHp: number; // 0 = use formula
  numRaiders: number;
  hpPerRaider: number; // % HP increase per extra raider
}

type AutoCandidate = CandidateMetrics;

// ----------------------------------------------------------------------
// Constants & Helpers
// ----------------------------------------------------------------------

let _slotId = 1;
const mkSlot = (): TeamSlot => ({
  id: _slotId++,
  name: '',
  data: null,
  level: 100,
  nature: 'Hardy',
  item: '(none)',
  evs: { ...DEFAULT_EVS },
  ivs: { ...DEFAULT_IVS },
  teraType: '',
  moveName: '',
  moveData: null,
  zmove: false,
  isCrit: false,
  error: '',
  result: null,
});

const mkBoss = (): BossState => ({
  name: '',
  data: null,
  level: 100,
  nature: 'Hardy',
  evs: { ...DEFAULT_EVS },
  ivs: { ...DEFAULT_IVS },
  teraType: '',
  raidTier: '5-star Raid (x6.8 HP)',
  weather: 'None',
  doubles: false,
  defScreen: false,
  customHp: 0,
  numRaiders: 6,
  hpPerRaider: 30,
});

const NATURES: Record<string, Partial<PokeStat>> = {
  Hardy: {}, Docile: {}, Serious: {}, Bashful: {}, Quirky: {},
  Lonely: { atk: 1.1, def: 0.9 }, Brave: { atk: 1.1, spe: 0.9 },
  Adamant: { atk: 1.1, spa: 0.9 }, Naughty: { atk: 1.1, spd: 0.9 },
  Bold: { def: 1.1, atk: 0.9 }, Relaxed: { def: 1.1, spe: 0.9 },
  Impish: { def: 1.1, spa: 0.9 }, Lax: { def: 1.1, spd: 0.9 },
  Timid: { spe: 1.1, atk: 0.9 }, Hasty: { spe: 1.1, def: 0.9 },
  Jolly: { spe: 1.1, spa: 0.9 }, Naive: { spe: 1.1, spd: 0.9 },
  Modest: { spa: 1.1, atk: 0.9 }, Mild: { spa: 1.1, def: 0.9 },
  Quiet: { spa: 1.1, spe: 0.9 }, Rash: { spa: 1.1, spd: 0.9 },
  Calm: { spd: 1.1, atk: 0.9 }, Gentle: { spd: 1.1, def: 0.9 },
  Sassy: { spd: 1.1, spe: 0.9 }, Careful: { spd: 1.1, spa: 0.9 },
};

const getNat = (name: string, stat: keyof PokeStat) => (NATURES[name] as any)?.[stat] ?? 1;

const ITEMS = ['(none)', 'Life Orb', 'Choice Band', 'Choice Specs', 'Choice Scarf', 'Expert Belt',
  'Muscle Band', 'Wise Glasses', 'Assault Vest', 'Eviolite', 'Black Belt', 'Charcoal', 'Mystic Water',
  'Miracle Seed', 'Magnet', 'Never-Melt Ice', 'Poison Barb', 'Soft Sand', 'Hard Stone', 'Sharp Beak',
  'TwistedSpoon', 'Spell Tag', 'Dragon Fang', 'Black Glasses', 'Metal Coat', 'Silk Scarf', 'Silver Powder',
  'Rocky Helmet', 'Leftovers'];

const ITEM_BOOST: Record<string, string> = {
  Charcoal: 'Fire', 'Mystic Water': 'Water', 'Miracle Seed': 'Grass', Magnet: 'Electric',
  'Never-Melt Ice': 'Ice', 'Black Belt': 'Fighting', 'Poison Barb': 'Poison', 'Soft Sand': 'Ground',
  'Sharp Beak': 'Flying', TwistedSpoon: 'Psychic', 'Silver Powder': 'Bug', 'Hard Stone': 'Rock',
  'Spell Tag': 'Ghost', 'Dragon Fang': 'Dragon', 'Black Glasses': 'Dark', 'Metal Coat': 'Steel',
  'Silk Scarf': 'Normal',
};

const WEATHERS = ['None', 'Sun', 'Rain', 'Sand', 'Snow', 'Harsh Sunshine', 'Heavy Rain'];

const STAT_ORDER: [keyof PokeStat, string][] = [
  ['hp', 'HP'], ['atk', 'Atk'], ['def', 'Def'], ['spa', 'SpA'], ['spd', 'SpD'], ['spe', 'Spe'],
];

const Z_TABLE: [number, number][] = [
  [55, 100], [65, 120], [75, 140], [85, 160], [95, 175], [100, 180], [110, 185], [125, 190], [9999, 195],
];
const zPower = (bp: number) => {
  for (const [t, p] of Z_TABLE) if (bp <= t) return p;
  return 195;
};

function getBossHp(boss: BossState): number {
  if (boss.customHp > 0) return boss.customHp;
  if (!boss.data) return 0;
  const baseHp = calcStat(boss.data.stats.hp, boss.evs.hp, boss.ivs.hp, true, 1, boss.level);
  const raidMult = RAID_TIERS[boss.raidTier] ?? 1;
  return Math.round(baseHp * raidMult);
}

function getTotalHp(boss: BossState): number {
  const base = getBossHp(boss);
  if (base === 0) return 0;
  const n = Math.max(1, boss.numRaiders);
  const inc = boss.hpPerRaider / 100;
  return Math.round(base * (1 + inc * (n - 1)));
}

function calcSlotResult(slot: TeamSlot, boss: BossState): SlotResult | null {
  if (!slot.data || !slot.moveData || !boss.data) return null;
  const bp = slot.zmove ? zPower(slot.moveData.bp) : slot.moveData.bp;
  if (!bp) return null;

  const bossTypes = boss.teraType ? [boss.teraType] : boss.data.types;
  const eff = typeEff(slot.moveData.type, bossTypes);
  if (eff === 0) {
    return {
      minD: 0, maxD: 0, avgD: 0, minP: 0, maxP: 0, avgP: 0,
      eff: 0, stab: false, immune: true, cat: slot.moveData.cat, mtyp: slot.moveData.type,
      defHp: 0, hitsToKo: [999, 999], ohko: false, possibleOhko: false, twoHko: false,
    };
  }

  const bossFake: PokeData = {
    ...boss.data,
    stats: { ...boss.data.stats, hp: Math.round(boss.data.stats.hp * (RAID_TIERS[boss.raidTier] ?? 1)) },
  };

  const res = runCalc({
    atkPoke: slot.data,
    defPoke: bossFake,
    bp,
    cat: slot.moveData.cat,
    mtyp: slot.moveData.type,
    atkEvs: slot.evs,
    defEvs: boss.evs,
    atkIvs: slot.ivs,
    defIvs: boss.ivs,
    atkNat: slot.nature,
    defNat: boss.nature,
    atkTera: slot.teraType,
    defTera: boss.teraType,
    atkItem: slot.item,
    atkStatus: 'Healthy',
    weather: boss.weather,
    doubles: boss.doubles,
    atkScreen: false,
    defScreen: boss.defScreen,
    isCrit: slot.isCrit,
    zmove: false, // bp already adjusted
    atkLv: slot.level,
    defLv: boss.level,
  });

  if (!res || res.immune) {
    return {
      minD: 0, maxD: 0, avgD: 0, minP: 0, maxP: 0, avgP: 0,
      eff: 0, stab: false, immune: true, cat: slot.moveData.cat, mtyp: slot.moveData.type,
      defHp: 0, hitsToKo: [999, 999], ohko: false, possibleOhko: false, twoHko: false,
    };
  }

  const totalHp = getTotalHp(boss);
  const defHp = res.defHp || 1;
  const minP = (res.minD / totalHp) * 100;
  const maxP = (res.maxD / totalHp) * 100;
  const avgP = (minP + maxP) / 2;
  const hitsMin = Math.ceil(totalHp / res.maxD);
  const hitsMax = Math.ceil(totalHp / res.minD);
  const stab = slot.data.types.includes(slot.moveData.type);

  return {
    minD: res.minD,
    maxD: res.maxD,
    avgD: (res.minD + res.maxD) / 2,
    minP,
    maxP,
    avgP,
    eff,
    stab,
    immune: false,
    cat: slot.moveData.cat,
    mtyp: slot.moveData.type,
    defHp,
    hitsToKo: [hitsMin, hitsMax],
    ohko: minP >= 100,
    possibleOhko: maxP >= 100,
    twoHko: minP >= 50,
  };
}

// ----------------------------------------------------------------------
// Styling utilities
// ----------------------------------------------------------------------

const CARD: React.CSSProperties = {
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: 16,
};

const INP: React.CSSProperties = {
  padding: '6px 10px',
  background: 'rgba(0,0,0,0.35)',
  border: '1px solid var(--border)',
  borderRadius: 7,
  color: 'var(--text)',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
  outline: 'none',
};

const BTN = (variant: 'primary' | 'ghost' | 'danger' | 'warn' = 'ghost'): React.CSSProperties => ({
  padding: '7px 14px',
  borderRadius: 8,
  border: variant === 'ghost' ? '1px solid rgba(255,255,255,.12)' : 'none',
  background: variant === 'primary' ? 'var(--primary)' : variant === 'danger' ? 'rgba(220,38,38,.2)' : variant === 'warn' ? 'rgba(251,191,36,.15)' : 'rgba(255,255,255,.05)',
  color: variant === 'danger' ? '#f87171' : variant === 'warn' ? '#fbbf24' : 'var(--text)',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  whiteSpace: 'nowrap' as const,
});

const LBL: React.CSSProperties = {
  display: 'block',
  fontSize: 10,
  color: 'var(--text-muted)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 3,
};

const NUM: React.CSSProperties = {
  ...INP,
  width: 56,
  textAlign: 'center',
  padding: '7px 6px',
  fontSize: 13,
};

const SEL: React.CSSProperties = {
  ...INP,
  cursor: 'pointer',
};

const effColor = (eff: number) =>
  eff >= 4 ? '#f87171' : eff >= 2 ? '#fbbf24' : eff === 1 ? 'var(--text-muted)' : '#6ee7b7';

const effLabel = (eff: number) =>
  eff >= 4 ? '4x' : eff >= 2 ? '2x' : eff === 1 ? '1x' : eff > 0 ? '0.5x' : '0x';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Monte Carlo Engine
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makePRNG(seed: number): () => number {
  let s = (seed >>> 0) || 0xcafe1234;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Welford { n: number; mean: number; M2: number; }
const wfNew = (): Welford => ({ n: 0, mean: 0, M2: 0 });
function wfPush(w: Welford, x: number) { w.n++; const d = x - w.mean; w.mean += d / w.n; w.M2 += d * (x - w.mean); }
const wfVar = (w: Welford) => w.n < 2 ? 0 : w.M2 / (w.n - 1);
const wfSE  = (w: Welford) => w.n < 2 ? 0 : Math.sqrt(wfVar(w) / w.n);

function exactHitsToKoPmf(rolls: number[], hp: number): number[] {
  if (!rolls.length || !hp) return [];
  const N = rolls.length, pRoll = 1 / N;
  const maxHits = Math.ceil(hp / rolls[0]) + 2;
  let pmf: Record<number, number> = { 0: 1 };
  const koAtK: number[] = [];
  for (let k = 1; k <= maxHits; k++) {
    const next: Record<number, number> = {};
    for (const [d, p] of Object.entries(pmf)) {
      const dNum = Number(d);
      for (let i = 0; i < N; i++) {
        const nd = dNum + rolls[i];
        if (nd >= hp) koAtK[k] = (koAtK[k] ?? 0) + p * pRoll;
        else next[nd] = (next[nd] ?? 0) + p * pRoll;
      }
    }
    pmf = next;
    if (Object.keys(pmf).length === 0) break;
  }
  const total = koAtK.reduce((a, b) => a + (b ?? 0), 0);
  if (total > 0) for (let k = 1; k < koAtK.length; k++) if (koAtK[k]) koAtK[k] /= total;
  return koAtK;
}

interface MCRollTable { rolls: number[]; immune: boolean; minD: number; maxD: number; avgD: number; }
interface MCConvergencePt { trial: number; mean: number; ciLo: number; ciHi: number; se: number; }
interface PerSlotMC { name: string; used: number; avgHitsDealt: number; avgDmgDealt: number; avgDmgTaken: number; pctBossHp: number; ohkoChance: number; survivalPct: number; exactKoPmf: number[]; }
interface PerMoveMC { name: string; type: string; bp: number; cat: string; uses: number; avgDmg: number; totalDmg: number; maxDmg: number; pctDmg: number; }

interface MCResult {
  trials: number; mean: number; se: number; stdDev: number;
  ci95: [number, number]; ciWidth: number; metMargin: boolean;
  median: number; mode: number; p5: number; p25: number; p75: number; p90: number; p95: number;
  pWin: number;
  histogram: Record<number, number>; cdf: Record<number, number>;
  pAtMostK: Array<{ k: number; p: number }>;
  perSlot: PerSlotMC[]; perMove: PerMoveMC[];
  convergence: MCConvergencePt[];
  pilotStdDev: number; trialsRequired: number;
  seed: number; policy: string; exactKoPmfs: number[][];
  numSlots: number; numRaiders: number;
}

interface MCOptions {
  maxTrials: number; targetMargin: number;
  policy: 'uniform' | 'bpweighted' | 'maxdmg';
  antithetic: boolean; stratified: boolean;
  seed: number; exactMode: boolean;
}

function toMCRollTable(res: ReturnType<typeof runCalc>): MCRollTable | null {
  if (!res) return null;
  if (res.immune) return { rolls: [], immune: true, minD: 0, maxD: 0, avgD: 0 };
  if (!Array.isArray(res.rolls) || !res.rolls.length) return null;
  const rolls = res.rolls as number[];
  return { rolls, immune: false, minD: res.minD ?? 0, maxD: res.maxD ?? 0, avgD: rolls.reduce((a: number, b: number) => a + b, 0) / rolls.length };
}

function runMonteCarlo(boss: BossState, slots: TeamSlot[], bossHP: number, opts: MCOptions): MCResult | null {
  if (!boss.data) return null;
  const bossMoves = getLevelUpMoves(boss.name);
  if (!bossMoves.length) return null;

  const numRaiders = Math.max(1, boss.numRaiders);
  // All raiders use the same team - expand slots x raiders
  const counters: TeamSlot[] = [];
  for (let r = 0; r < numRaiders; r++) for (const s of slots) counters.push(s);
  const K = counters.length;
  const M = bossMoves.length;
  const raidMult = RAID_TIERS[boss.raidTier] ?? 1;
  const bossFake: PokeData = { ...boss.data, stats: { ...boss.data.stats, hp: Math.round(boss.data.stats.hp * raidMult) } };

  // Precompute roll tables
  const atkToB: (MCRollTable | null)[] = counters.map(slot => {
    const ad = slot.data || lookupPokeWithCustom(slot.name);
    const mv = slot.moveData || lookupMoveWithCustom(slot.moveName);
    if (!ad || !mv || !mv.bp) return null;
    const bp = slot.zmove ? zPower(mv.bp) : mv.bp;
    const res = runCalc({ atkPoke: ad, defPoke: bossFake, bp, cat: mv.cat, mtyp: mv.type, atkEvs: slot.evs, defEvs: boss.evs, atkIvs: slot.ivs, defIvs: boss.ivs, atkNat: slot.nature, defNat: boss.nature, atkTera: slot.teraType, defTera: boss.teraType, atkItem: slot.item, atkStatus: 'Healthy', weather: boss.weather, doubles: boss.doubles, atkScreen: false, defScreen: boss.defScreen, isCrit: slot.isCrit, zmove: false, atkLv: slot.level || 100, defLv: boss.level || 100 });
    return toMCRollTable(res);
  });

  const bToAtk: (MCRollTable | null)[][] = bossMoves.map(mv =>
    counters.map(slot => {
      const ad = slot.data || lookupPokeWithCustom(slot.name);
      if (!ad) return null;
      const res = runCalc({ atkPoke: bossFake, defPoke: ad, bp: mv.bp, cat: mv.cat, mtyp: mv.type, atkEvs: boss.evs, defEvs: slot.evs, atkIvs: boss.ivs, defIvs: slot.ivs, atkNat: boss.nature, defNat: slot.nature, atkTera: boss.teraType, defTera: slot.teraType, atkItem: '(none)', atkStatus: 'Healthy', weather: boss.weather, doubles: boss.doubles, atkScreen: boss.defScreen, defScreen: false, isCrit: false, zmove: false, atkLv: boss.level || 100, defLv: slot.level || 100 });
      return toMCRollTable(res);
    })
  );

  const atkHPs  = counters.map(s => { const d = s.data || lookupPokeWithCustom(s.name); return d ? calcStat(d.stats.hp, s.evs.hp, s.ivs.hp, true, 1, s.level || 100) : 0; });
  const atkSpes = counters.map(s => { const d = s.data || lookupPokeWithCustom(s.name); return d ? calcStat(d.stats.spe, s.evs.spe, s.ivs.spe, false, getNat(s.nature, 'spe'), s.level || 100) : 0; });
  const bossSpe  = calcStat(boss.data.stats.spe, boss.evs.spe, boss.ivs.spe, false, getNat(boss.nature, 'spe'), boss.level || 100);

  const exactKoPmfs: number[][] = atkToB.map(rt => (rt && !rt.immune && rt.rolls.length) ? exactHitsToKoPmf(rt.rolls, bossHP) : []);

  // Boss move weights
  const rawW = bossMoves.map((mv, i) => {
    if (opts.policy === 'uniform') return 1;
    if (opts.policy === 'bpweighted') return mv.bp || 1;
    return counters.reduce((s, _, si) => { const r = bToAtk[i]?.[si]; return s + (r && !r.immune ? r.avgD : 0); }, 0) / K || 1;
  });
  const totalW = rawW.reduce((a, b) => a + b, 0);
  const normW = rawW.map(w => w / totalW);
  const mvCum = normW.map((_, i) => normW.slice(0, i + 1).reduce((a, b) => a + b, 0));

  const effectiveSeed = opts.seed || ((Math.random() * 0xffffffff) >>> 0);
  const rng = makePRNG(effectiveSeed);
  const AV_BUF = new Float64Array(1024);
  let avPos = 0, inAV = false;
  const fillBuf = () => { for (let i = 0; i < 1024; i++) AV_BUF[i] = rng(); };
  const nextU = () => { const u = avPos < 1024 ? (inAV ? 1 - AV_BUF[avPos] : AV_BUF[avPos]) : rng(); avPos++; return u; };
  const pickMv = () => { const u = nextU(); return Math.max(0, mvCum.findIndex(c => u <= c)); };
  const sampDmg = (rolls: number[]) => rolls[Math.min(15, Math.floor(nextU() * 16))];
  const buildStrata = (n: number): number[] => { const c = normW.map(w => Math.round(w * n)); c[0] = Math.max(0, c[0] + n - c.reduce((a, b) => a + b, 0)); return c; };

  interface SAcc { hd: number; dd: number; dt: number; ok: number; ot: number; used: number; survived: number; }
  const sAcc: SAcc[] = counters.map(() => ({ hd: 0, dd: 0, dt: 0, ok: 0, ot: 0, used: 0, survived: 0 }));
  const mAcc: { count: number; totalDmg: number; maxDmg: number }[] = bossMoves.map(() => ({ count: 0, totalDmg: 0, maxDmg: 0 }));
  const wf = wfNew();
  const hist: Record<number, number> = {};
  const convergence: MCConvergencePt[] = [];
  let totalTrials = 0;

  function runTrial(isAV: boolean): number {
    avPos = 0; inAV = isAV;
    if (!isAV) fillBuf();
    let bhp = bossHP, used = 0;
    for (let si = 0; si < K && bhp > 0; si++) {
      const ac = atkToB[si];
      if (!ac || ac.immune || !atkHPs[si] || !ac.rolls.length) continue;
      used++; sAcc[si].used++;
      let ahp = atkHPs[si], hd = 0, dd = 0, dt = 0, firstHit = true;
      const faster = atkSpes[si] >= bossSpe;
      while (bhp > 0 && ahp > 0) {
        if (faster) { const d = sampDmg(ac.rolls); bhp -= d; hd++; dd += d; if (bhp <= 0) break; }
        const mi = pickMv();
        const bc = bToAtk[mi]?.[si];
        const bd = (bc && !bc.immune && bc.rolls.length) ? sampDmg(bc.rolls) : 0;
        if (bd > 0) { mAcc[mi].count++; mAcc[mi].totalDmg += bd; if (bd > mAcc[mi].maxDmg) mAcc[mi].maxDmg = bd; if (firstHit) { sAcc[si].ot++; if (bd >= ahp) sAcc[si].ok++; firstHit = false; } ahp -= bd; dt += bd; }
        if (!faster && ahp > 0) { const d = sampDmg(ac.rolls); bhp -= d; hd++; dd += d; if (bhp <= 0) break; }
      }
      sAcc[si].hd += hd; sAcc[si].dd += dd; sAcc[si].dt += dt;
      if (ahp > 0) sAcc[si].survived++;
      if (bhp <= 0) break;
    }
    return bhp <= 0 ? used : K + 1;
  }

  const PILOT = Math.min(1000, opts.maxTrials);
  const pStrata = opts.stratified ? buildStrata(PILOT) : null;
  let pStr = 0, pStrN = 0;
  for (let t = 0; t < PILOT; t++) {
    if (pStrata) { while (pStr < M && pStrN >= pStrata[pStr]) { pStr++; pStrN = 0; } if (pStr < M) pStrN++; }
    const v = runTrial(false); wfPush(wf, v); hist[v] = (hist[v] || 0) + 1; totalTrials++;
  }
  const pilotStdDev = Math.sqrt(wfVar(wf));
  const Z = 1.96;
  const trialsRequired = pilotStdDev > 0 ? Math.ceil(Math.pow(Z * pilotStdDev / opts.targetMargin, 2)) : PILOT;
  const remaining = Math.max(0, Math.min(opts.maxTrials - PILOT, trialsRequired - PILOT));

  const SNAP = Math.max(100, Math.floor(remaining / 20) || 100);
  const fStrata = opts.stratified ? buildStrata(remaining) : null;
  let fStr = 0, fStrN = 0, done = 0;
  while (done < remaining) {
    const batch = Math.min(500, remaining - done);
    for (let b = 0; b < batch; b++) {
      if (fStrata) { while (fStr < M && fStrN >= fStrata[fStr]) { fStr++; fStrN = 0; } if (fStr < M) fStrN++; }
      if (opts.antithetic) {
        const v1 = runTrial(false), v2 = runTrial(true);
        wfPush(wf, (v1 + v2) / 2); hist[v1] = (hist[v1] || 0) + 1; hist[v2] = (hist[v2] || 0) + 1; totalTrials += 2; done += 2;
      } else { const v = runTrial(false); wfPush(wf, v); hist[v] = (hist[v] || 0) + 1; totalTrials++; done++; }
    }
    if (done % SNAP < 500) { const se = wfSE(wf); convergence.push({ trial: totalTrials, mean: wf.mean, ciLo: wf.mean - Z * se, ciHi: wf.mean + Z * se, se }); }
    if (wfSE(wf) > 0 && 2 * Z * wfSE(wf) <= opts.targetMargin) break;
  }
  const finalSE = wfSE(wf);
  convergence.push({ trial: totalTrials, mean: wf.mean, ciLo: wf.mean - Z * finalSE, ciHi: wf.mean + Z * finalSE, se: finalSE });

  const sortedKeys = Object.keys(hist).map(Number).sort((a, b) => a - b);
  let cumul = 0; const cdf: Record<number, number> = {};
  for (const k of sortedKeys) { cumul += hist[k]; cdf[k] = cumul / totalTrials; }
  const expanded: number[] = [];
  for (const k of sortedKeys) for (let i = 0; i < hist[k]; i++) expanded.push(k);
  const N = expanded.length;
  const pctAt = (p: number) => expanded[Math.min(N - 1, Math.floor(p * N))];
  const mode = sortedKeys.reduce((b, k) => (hist[k] > (hist[b] || 0) ? k : b), sortedKeys[0]);
  const pWin = expanded.filter(v => v <= K).length / N;
  const pAtMostK = Array.from({ length: K + 1 }, (_, i) => ({ k: i + 1, p: cdf[i + 1] ?? (i + 1 >= (sortedKeys[sortedKeys.length - 1] ?? 0) ? 1 : 0) }));

  const perSlot: PerSlotMC[] = counters.map((slot, si) => {
    const a = sAcc[si], u = Math.max(1, a.used);
    return { name: slot.name || '-', used: a.used, avgHitsDealt: a.hd / u, avgDmgDealt: a.dd / u, avgDmgTaken: a.dt / u, pctBossHp: (a.dd / u) / (bossHP || 1), ohkoChance: a.ot > 0 ? a.ok / a.ot : 0, survivalPct: a.used > 0 ? a.survived / a.used : 0, exactKoPmf: exactKoPmfs[si] || [] };
  });

  const totalMoveDmg = mAcc.reduce((s, m) => s + m.totalDmg, 0);
  const perMove: PerMoveMC[] = bossMoves.map((mv, i) => ({ name: mv.name, type: mv.type, bp: mv.bp, cat: mv.cat, uses: mAcc[i].count, avgDmg: mAcc[i].count > 0 ? mAcc[i].totalDmg / mAcc[i].count : 0, totalDmg: mAcc[i].totalDmg, maxDmg: mAcc[i].maxDmg, pctDmg: totalMoveDmg > 0 ? mAcc[i].totalDmg / totalMoveDmg : 0 })).sort((a, b) => b.totalDmg - a.totalDmg);

  const finalVar = wfVar(wf), finalStdDev = Math.sqrt(finalVar);
  const finalSE2 = finalVar > 0 ? Math.sqrt(finalVar / N) : finalSE;
  const ciW = 2 * Z * finalSE2;

  return {
    trials: totalTrials, mean: wf.mean, se: finalSE2, stdDev: finalStdDev,
    ci95: [wf.mean - Z * finalSE2, wf.mean + Z * finalSE2], ciWidth: ciW, metMargin: ciW <= opts.targetMargin * 2,
    median: pctAt(0.5), mode, p5: pctAt(0.05), p25: pctAt(0.25), p75: pctAt(0.75), p90: pctAt(0.90), p95: pctAt(0.95),
    pWin, histogram: hist, cdf, pAtMostK, perSlot, perMove, convergence,
    pilotStdDev, trialsRequired, seed: effectiveSeed, policy: opts.policy, exactKoPmfs,
    numSlots: slots.length, numRaiders,
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Custom Pokemon registry sync (read-only in Counter Calc)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CustomPokeEntry {
  name: string;
  types: [string, string?];
  stats: PokeStat;
  moves: Array<{ name: string; type: string; cat: string; bp: number }>;
}

const CUSTOM_LS_KEY = 'pktool_custom_pokemon_v1';

function loadCustomLS(): CustomPokeEntry[] {
  try { const r = localStorage.getItem(CUSTOM_LS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
function syncCustom(entries: CustomPokeEntry[]) {
  for (const n of getCustomPokemonNames()) removeCustomPokemon(n);
  for (const e of entries) {
    const data: PokeData = { name: e.name, types: e.types.filter(Boolean) as string[], stats: e.stats, bst: Object.values(e.stats).reduce((a, b) => a + b, 0), abilities: [], weaknesses: {} };
    injectCustomPokemon(data, e.moves.map(m => ({ name: m.name, bp: m.bp, cat: m.cat, type: m.type })));
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Advanced Slot Row (with EVs, nature, item, etc.)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function SlotRow({ slot, bossHp, rank, onChange, onRemove, onDuplicate }: {
  slot: TeamSlot;
  bossHp: number;
  rank: number | null;
  onChange: (p: Partial<TeamSlot>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const r = slot.result;
  const [showEvIv, setShowEvIv] = React.useState(false);

  const handlePokeChange = (name: string) => {
    const data = lookupPokeWithCustom(name);
    onChange({ name, data, result: null, error: data ? '' : name.length > 1 ? `"${name}" not found` : '' });
  };

  const handleMoveChange = (moveName: string) => {
    const moveData = lookupMoveWithCustom(moveName);
    onChange({ moveName, moveData, result: null, error: moveData ? '' : moveName.length > 1 ? `"${moveName}" not found` : '' });
  };

  const setEv = (stat: keyof PokeStat, val: number) =>
    onChange({ evs: { ...slot.evs, [stat]: Math.max(0, Math.min(252, val || 0)) }, result: null });
  const setIv = (stat: keyof PokeStat, val: number) =>
    onChange({ ivs: { ...slot.ivs, [stat]: Math.max(0, Math.min(31, val || 0)) }, result: null });

  const evTotal = Object.values(slot.evs).reduce((a, b) => a + b, 0);

  return (
    <div style={{ ...CARD, padding: '14px', position: 'relative' }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Rank badge */}
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: rank !== null ? 'var(--primary)' : 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, marginTop: 18 }}>
          {rank !== null ? rank + 1 : '-'}
        </div>

        {/* Pokemon */}
        <div style={{ flex: '1 1 160px', minWidth: 140 }}>
          <label style={LBL}>Pokemon</label>
          <AutoInput value={slot.name} onChange={handlePokeChange} searchFn={searchPokemonWithCustom} placeholder="e.g. Garchomp" />
          {slot.data && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {slot.data.types.map(t => <TypeBadge key={t} t={t} />)}
            </div>
          )}
        </div>

        {/* Move */}
        <div style={{ flex: '1 1 160px', minWidth: 140 }}>
          <label style={LBL}>Move</label>
          <AutoInput
            value={slot.moveName}
            onChange={handleMoveChange}
            searchFn={(q) => {
              if (slot.data) {
                const lv = getLevelUpMoves(slot.name).map(m => m.name);
                const all = searchMovesWithCustom(q, 20);
                const lvMatch = lv.filter(n => n.toLowerCase().includes(q.toLowerCase()));
                return [...lvMatch, ...all.filter(n => !lvMatch.includes(n))].slice(0, 20);
              }
              return searchMovesWithCustom(q, 20);
            }}
            placeholder="e.g. Earthquake"
          />
          {slot.moveData && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
              <TypeBadge t={slot.moveData.type} />
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {slot.moveData.cat} · {slot.zmove ? zPower(slot.moveData.bp) : slot.moveData.bp}BP
                {slot.zmove ? ' (Z)' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Level */}
        <div style={{ width: 60 }}>
          <label style={LBL}>Lv</label>
          <input style={{ ...INP, textAlign: 'center' }}
            type="number" min={1} max={100} value={slot.level}
            onChange={e => onChange({ level: Math.max(1, Math.min(100, parseInt(e.target.value) || 100)), result: null })} />
        </div>

        {/* Nature */}
        <div style={{ width: 90 }}>
          <label style={LBL}>Nature</label>
          <select style={SEL} value={slot.nature} onChange={e => onChange({ nature: e.target.value, result: null })}>
            {Object.keys(NATURES).map(n => <option key={n}>{n}</option>)}
          </select>
        </div>

        {/* Item */}
        <div style={{ width: 110 }}>
          <label style={LBL}>Item</label>
          <select style={SEL} value={slot.item} onChange={e => onChange({ item: e.target.value, result: null })}>
            {ITEMS.map(i => <option key={i}>{i}</option>)}
          </select>
        </div>

        {/* Tera Type */}
        <div style={{ width: 90 }}>
          <label style={LBL}>Tera</label>
          <select style={SEL} value={slot.teraType} onChange={e => onChange({ teraType: e.target.value, result: null })}>
            <option value="">None</option>
            {ALL_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* Z & Crit toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 14 }}>
          <label style={{ ...LBL, marginBottom: 0 }}>Z</label>
          <input type="checkbox" checked={slot.zmove}
            onChange={e => onChange({ zmove: e.target.checked, result: null })}
            style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 14 }}>
          <label style={{ ...LBL, marginBottom: 0 }}>Crit</label>
          <input type="checkbox" checked={slot.isCrit}
            onChange={e => onChange({ isCrit: e.target.checked, result: null })}
            style={{ width: 16, height: 16, accentColor: 'var(--primary)' }} />
        </div>

        {/* EV toggle */}
        <button onClick={() => setShowEvIv(v => !v)} style={{ ...BTN('ghost'), padding: '5px 7px', marginTop: 18, fontSize: 10 }} title="Show/hide EVs & IVs">
          {showEvIv ? 'Hide EV/IV' : 'Show EV/IV'}
        </button>

        {/* Action buttons */}
        <button onClick={onDuplicate} style={{ ...BTN('ghost'), padding: '5px 8px', marginTop: 18 }} title="Duplicate slot">Duplicate</button>
        <button onClick={onRemove} style={{ ...BTN('danger'), padding: '5px 8px', marginTop: 18 }} title="Remove">Remove</button>
      </div>

      {/* EV/IV grid - collapsible */}
      {showEvIv && (
        <div style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(0,0,0,.2)', borderRadius: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '8px 16px', alignItems: 'center' }}>
            {STAT_ORDER.map(([stat, label]) => {
              const base = slot.data?.stats[stat] ?? 0;
              const finalStat = slot.data ? calcStat(base, slot.evs[stat], slot.ivs[stat], stat === 'hp', getNat(slot.nature, stat), slot.level) : null;
              return (
                <div key={stat} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, minWidth: 30 }}>{label}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>EV</span>
                  <input style={{ ...NUM, width: 52 }} type="number" min={0} max={252} value={slot.evs[stat]}
                    onChange={e => setEv(stat, parseInt(e.target.value))} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>IV</span>
                  <input style={{ ...NUM, width: 48 }} type="number" min={0} max={31} value={slot.ivs[stat]}
                    onChange={e => setIv(stat, parseInt(e.target.value))} />
                  {finalStat !== null && (
                    <span style={{ fontSize: 12, color: '#818cf8', fontWeight: 700, minWidth: 34, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>= {finalStat}</span>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: evTotal > 510 ? '#f87171' : 'var(--text-muted)', marginTop: 8 }}>
            Total EVs: {evTotal}/510{evTotal > 510 ? ' Warning: Exceeds limit' : ''}
          </div>
        </div>
      )}

      {slot.error && <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>Warning: {slot.error}</div>}

      {/* Result display */}
      {r && !r.immune && (
        <div style={{ marginTop: 10, background: 'rgba(0,0,0,.25)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>
                {r.minP.toFixed(1)}%-{r.maxP.toFixed(1)}%
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {r.minD}-{r.maxD} / {bossHp.toLocaleString()} HP
              </span>
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {r.stab && <span style={{ fontSize: 10, fontWeight: 800, color: '#818cf8', background: 'rgba(129,140,248,.15)', padding: '2px 6px', borderRadius: 4 }}>STAB</span>}
              <span style={{ fontSize: 12, fontWeight: 800, color: effColor(r.eff) }}>{effLabel(r.eff)}</span>
              {r.ohko && <span style={{ fontSize: 10, fontWeight: 800, color: '#f87171', background: 'rgba(248,113,113,.15)', padding: '2px 6px', borderRadius: 4 }}>OHKO</span>}
              {!r.ohko && r.possibleOhko && <span style={{ fontSize: 10, fontWeight: 800, color: '#fbbf24', background: 'rgba(251,191,36,.12)', padding: '2px 6px', borderRadius: 4 }}>Poss.OHKO</span>}
            </div>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${Math.min(100, r.maxP)}%`, background: r.maxP >= 100 ? '#ef4444' : r.maxP >= 50 ? '#f59e0b' : 'var(--primary)', borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
            KO in {r.hitsToKo[0]}-{r.hitsToKo[1]} hits
          </div>
        </div>
      )}
      {r?.immune && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Immune - {slot.data?.name} deals 0 damage with {slot.moveName}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Boss Configuration Panel
// ----------------------------------------------------------------------

function BossPanel({ boss, onChange }: { boss: BossState; onChange: (p: Partial<BossState>) => void }) {
  const handleNameChange = (name: string) => {
    const data = lookupPokeWithCustom(name);
    onChange({ name, data });
  };

  const baseHp = getBossHp(boss);
  const totalHp = getTotalHp(boss);

  const setEv = (stat: keyof PokeStat, val: number) =>
    onChange({ evs: { ...boss.evs, [stat]: Math.max(0, Math.min(252, val || 0)) } });
  const setIv = (stat: keyof PokeStat, val: number) =>
    onChange({ ivs: { ...boss.ivs, [stat]: Math.max(0, Math.min(31, val || 0)) } });

  const evTotal = Object.values(boss.evs).reduce((a, b) => a + b, 0);

  return (
    <div style={{ ...CARD, border: '1px solid rgba(220,38,38,.2)', background: 'rgba(220,38,38,.03)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#f87171', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
        Raid Boss
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {/* Name */}
        <div style={{ gridColumn: 'span 2' }}>
          <label style={LBL}>Boss Pokemon</label>
          <AutoInput value={boss.name} onChange={handleNameChange} searchFn={searchPokemonWithCustom} placeholder="e.g. Nihilego" />
          {boss.data && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {boss.data.types.map(t => <TypeBadge key={t} t={t} />)}
            </div>
          )}
        </div>

        {/* Level */}
        <div>
          <label style={LBL}>Level</label>
          <input style={INP} type="number" min={1} max={200} value={boss.level}
            onChange={e => onChange({ level: Math.max(1, parseInt(e.target.value) || 100) })} />
        </div>

        {/* Nature */}
        <div>
          <label style={LBL}>Nature</label>
          <select style={SEL} value={boss.nature} onChange={e => onChange({ nature: e.target.value })}>
            {Object.keys(NATURES).map(n => <option key={n}>{n}</option>)}
          </select>
        </div>

        {/* Tera Type */}
        <div>
          <label style={LBL}>Tera Type</label>
          <select style={SEL} value={boss.teraType} onChange={e => onChange({ teraType: e.target.value })}>
            <option value="">- None -</option>
            {ALL_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* Raid tier */}
        <div>
          <label style={LBL}>Raid Tier</label>
          <select style={SEL} value={boss.raidTier} onChange={e => onChange({ raidTier: e.target.value })}>
            {Object.keys(RAID_TIERS).map(k => <option key={k}>{k}</option>)}
          </select>
        </div>

        {/* Weather */}
        <div>
          <label style={LBL}>Weather</label>
          <select style={SEL} value={boss.weather} onChange={e => onChange({ weather: e.target.value })}>
            {WEATHERS.map(w => <option key={w}>{w}</option>)}
          </select>
        </div>

        {/* Doubles toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={boss.doubles} onChange={e => onChange({ doubles: e.target.checked })} />
            {' '}Doubles
          </label>
          <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            <input type="checkbox" checked={boss.defScreen} onChange={e => onChange({ defScreen: e.target.checked })} />
            {' '}Reflect/Light Screen
          </label>
        </div>

        {/* Custom HP */}
        <div>
          <label style={LBL}>Custom HP Override</label>
          <input style={INP} type="number" min={0} value={boss.customHp}
            onChange={e => onChange({ customHp: Math.max(0, parseInt(e.target.value) || 0) })} />
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>0 = calculate from stats</div>
        </div>

        {/* Num raiders */}
        <div>
          <label style={LBL}>Number of Raiders</label>
          <input style={INP} type="number" min={1} max={30} value={boss.numRaiders}
            onChange={e => onChange({ numRaiders: Math.max(1, parseInt(e.target.value) || 1) })} />
        </div>

        {/* HP per raider */}
        <div>
          <label style={LBL}>HP % per Extra Raider</label>
          <input style={INP} type="number" min={0} max={200} value={boss.hpPerRaider}
            onChange={e => onChange({ hpPerRaider: Math.max(0, parseFloat(e.target.value) || 0) })} />
        </div>
      </div>

      {/* Boss EVs/IVs */}
      <div style={{ marginTop: 12 }}>
        <label style={LBL}>Boss EVs</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {STAT_ORDER.map(([stat, lbl]) => (
            <div key={stat} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, minWidth: 22, textAlign: 'right' }}>{lbl}</span>
              <input style={{ ...NUM, width: 38 }} type="number" min={0} max={252} value={boss.evs[stat]}
                onChange={e => setEv(stat, parseInt(e.target.value))} />
            </div>
          ))}
          <span style={{ fontSize: 9, color: evTotal > 510 ? '#f87171' : 'var(--text-muted)' }}>({evTotal}/510)</span>
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <label style={LBL}>Boss IVs</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {STAT_ORDER.map(([stat, lbl]) => (
            <div key={stat} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontWeight: 700, minWidth: 22, textAlign: 'right' }}>{lbl}</span>
              <input style={{ ...NUM, width: 34 }} type="number" min={0} max={31} value={boss.ivs[stat]}
                onChange={e => setIv(stat, parseInt(e.target.value))} />
            </div>
          ))}
        </div>
      </div>

      {/* HP summary */}
      {boss.data && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(0,0,0,.25)', borderRadius: 8, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
          <span>Base HP (1 raider): <strong style={{ color: '#f87171' }}>{baseHp.toLocaleString()}</strong></span>
          {boss.numRaiders > 1 && (
            <span>Total HP ({boss.numRaiders} raiders): <strong style={{ color: '#f87171', fontSize: 14 }}>{totalHp.toLocaleString()}</strong></span>
          )}
          {boss.customHp > 0 && <span style={{ color: '#fbbf24', fontSize: 11 }}>Warning: Custom HP active</span>}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------
// Results Panel (simple average summary)
// ----------------------------------------------------------------------

function ResultsPanel({ slots, boss, totalHp }: { slots: TeamSlot[]; boss: BossState; totalHp: number }) {
  const valid = slots.filter(s => s.result && !s.result.immune);
  if (!valid.length) return null;

  const teamDmgPerPass = valid.reduce((acc, s) => acc + s.result!.avgD, 0);
  const teamPctPerPass = totalHp > 0 ? (teamDmgPerPass / totalHp) * 100 : 0;
  const allRaidersPctPerPass = teamPctPerPass * boss.numRaiders;
  const passesNeeded = allRaidersPctPerPass > 0 ? Math.ceil(100 / allRaidersPctPerPass) : 999;

  const winLikely = passesNeeded <= 1;
  const winPossible = passesNeeded <= 2;

  return (
    <div style={{ ...CARD, border: `1px solid ${winLikely ? 'rgba(52,211,153,.3)' : winPossible ? 'rgba(251,191,36,.3)' : 'rgba(248,113,113,.3)'}`, background: winLikely ? 'rgba(52,211,153,.04)' : winPossible ? 'rgba(251,191,36,.04)' : 'rgba(248,113,113,.04)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: winLikely ? '#34d399' : winPossible ? '#fbbf24' : '#f87171', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
        {winLikely ? 'Team can win' : winPossible ? 'Marginal - might need more raids' : 'Not enough damage'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Stat label="Boss Total HP" value={totalHp.toLocaleString()} />
        <Stat label="Team DMG / Pass" value={`${teamPctPerPass.toFixed(1)}%`} sub={`${Math.round(teamDmgPerPass).toLocaleString()} dmg`} />
        <Stat label="All Raiders / Pass" value={`${allRaidersPctPerPass.toFixed(1)}%`} sub={`${boss.numRaiders} raiders x team`} />
        <Stat label="Passes to KO" value={passesNeeded >= 999 ? 'inf' : String(passesNeeded)} color={passesNeeded <= 1 ? '#34d399' : passesNeeded <= 2 ? '#fbbf24' : '#f87171'} />
      </div>

      {/* Per-slot summary */}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Damage contribution</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[...valid].sort((a, b) => b.result!.avgP - a.result!.avgP).map(s => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text)', minWidth: 120, fontWeight: 600 }}>{s.data?.name ?? s.name}</span>
            <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,.07)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${Math.min(100, s.result!.avgP)}%`, background: effColor(s.result!.eff), borderRadius: 3 }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 48, textAlign: 'right', fontFamily: "'JetBrains Mono',monospace" }}>
              {s.result!.avgP.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'rgba(0,0,0,.2)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color: color || '#fff', fontFamily: "'JetBrains Mono',monospace", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ----------------------------------------------------------------------
// Autoâ€‘Find Panel (improved)
// ----------------------------------------------------------------------

function AutoFindPanel({ boss, onLoadSlots }: { boss: BossState; onLoadSlots: (slots: Partial<TeamSlot>[]) => void }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AutoCandidate[]>([]);
  const [prefCat, setPrefCat] = useState<'auto' | 'Physical' | 'Special'>('auto');
  const cancelRef = useRef(false);

  if (!boss.data) return (
    <div style={{ ...CARD, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Configure a boss first to find counters.
    </div>
  );

  const bossTypes = boss.teraType ? [boss.teraType] : boss.data.types;
  const weaknesses = weaknessChart(bossTypes);
  const superEffTypes = [...weaknesses.quad, ...weaknesses.double];

  // Determine preferred attack category from boss stats
  const autoCat: 'Physical' | 'Special' = (() => {
    if (!boss.data) return 'Physical';
    const bDef = calcStat(boss.data.stats.def, boss.evs.def, boss.ivs.def, false, getNat(boss.nature, 'def'), boss.level);
    const bSpd = calcStat(boss.data.stats.spd, boss.evs.spd, boss.ivs.spd, false, getNat(boss.nature, 'spd'), boss.level);
    return bDef > bSpd ? 'Special' : 'Physical';
  })();

  const effectiveCat = prefCat === 'auto' ? autoCat : prefCat;

  const run = useCallback(async () => {
    if (!boss.data) return;
    cancelRef.current = false;
    setRunning(true);
    setProgress(0);
    setResults([]);
    const bossConfig: BossConfig = {
      name: boss.name,
      data: boss.data,
      level: boss.level,
      nature: boss.nature,
      evs: boss.evs,
      ivs: boss.ivs,
      teraType: boss.teraType,
      raidTier: boss.raidTier,
      weather: boss.weather,
      doubles: boss.doubles,
      defScreen: boss.defScreen,
      numRaiders: boss.numRaiders,
      hpIncreasePerRaider: boss.hpPerRaider,
      hpScalingMode: 'additive',
      customMoves: [],
      teamSize: 6,
      shadowMultiplierOnDualType: 4,
      simpleBaseHp: 0,
    };

    const baseHp = getBossHp(boss);

    try {
      const found = await runAutoFinder(
        bossConfig,
        baseHp,
        boss.hpPerRaider / 100,
        'additive',
        20,
        (pct) => setProgress(pct),
        'damage',
        effectiveCat,
        () => cancelRef.current
      );
      if (!cancelRef.current) {
        setResults(found);
        setProgress(100);
      }
    } finally {
      setRunning(false);
    }
  }, [boss, effectiveCat]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Boss weakness summary */}
      <div style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Boss Type Weaknesses</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {weaknesses.quad.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#f87171', fontWeight: 800, width: 28 }}>4x</span>
              {weaknesses.quad.map(t => <TypeBadge key={t} t={t} />)}
            </div>
          )}
          {weaknesses.double.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 800, width: 28 }}>2x</span>
              {weaknesses.double.map(t => <TypeBadge key={t} t={t} />)}
            </div>
          )}
          {weaknesses.half.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#6ee7b7', fontWeight: 700, width: 28 }}>0.5x</span>
              {weaknesses.half.map(t => <TypeBadge key={t} t={t} />)}
            </div>
          )}
          {weaknesses.immune.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, width: 28 }}>0x</span>
              {weaknesses.immune.map(t => <TypeBadge key={t} t={t} />)}
            </div>
          )}
        </div>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>Def: <strong>{boss.data.stats.def}</strong></span>
          <span>SpD: <strong>{boss.data.stats.spd}</strong></span>
          <span style={{ color: '#818cf8', fontWeight: 700 }}>Use {autoCat} moves (weaker defense)</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>Category:</span>
          {(['auto', 'Physical', 'Special'] as const).map(c => (
            <button key={c} onClick={() => setPrefCat(c)}
              style={{
                padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, fontWeight: 700,
                background: prefCat === c ? 'var(--primary)' : 'rgba(255,255,255,.05)', color: 'var(--text)'
              }}>
              {c === 'auto' ? `Auto (${autoCat})` : c}
            </button>
          ))}
        </div>
        <button onClick={run} disabled={running} style={{ ...BTN('primary'), marginLeft: 'auto' }}>
          {running ? `Scanning... ${progress}%` : 'Find Best Counters'}
        </button>
        {running && <button onClick={() => { cancelRef.current = true; setRunning(false); }} style={BTN('danger')}>Stop</button>}
      </div>

      {/* Results table */}
      {results.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
            Top Counters - sorted by total damage output and survivability
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map((c, i) => {
              const move = c.bestMove;
              const stab = c.data.types.includes(move.type);
              const ohkoPct = Math.round(c.ohkoRisk * 100);
              return (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(0,0,0,.2)', borderRadius: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 18, fontWeight: 800 }}>#{i + 1}</span>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {c.data.types.map(t => <TypeBadge key={t} t={t} />)}
                  </div>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#fff', minWidth: 100 }}>{c.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    <TypeBadge t={move.type} /> {move.name} ({move.cat[0]}) · {move.bp}BP · avg hit {c.avgDmgPct.toFixed(1)}%
                  </span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: effColor(c.eff) }}>{effLabel(c.eff)}</span>
                    {stab && <span style={{ fontSize: 10, fontWeight: 800, color: '#818cf8' }}>STAB</span>}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', fontFamily: "'JetBrains Mono',monospace", minWidth: 70, textAlign: 'right' }}>
                    {c.avgTotalPct.toFixed(1)}%
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 70 }}>
                    {c.turnsSurvived} turns
                  </span>
                  <span style={{ fontSize: 10, color: ohkoPct >= 80 ? '#f87171' : ohkoPct >= 50 ? '#fb923c' : '#4ade80', minWidth: 70 }}>
                    {ohkoPct}% OHKO
                  </span>
                  <button
                    onClick={() => onLoadSlots([{ name: c.name, data: c.data, moveName: move.name, moveData: move, level: 100, zmove: false }])}
                    style={{ ...BTN('ghost'), padding: '3px 8px', fontSize: 11 }}>
                    + Add
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function CounterCalcTool({ isAdmin = false }: {
  isAdmin?: boolean;
  sdState?: 'loading' | 'ready' | 'error';
  user?: { username: string; discord_id: string; avatar_url: string | null };
  guildId?: string;
}) {
  const sdState = useShowdownData();
  const [boss, setBoss] = useState<BossState>(mkBoss);
  const [slots, setSlots] = useState<TeamSlot[]>([mkSlot(), mkSlot(), mkSlot()]);
  const [calculated, setCalculated] = useState(false);
  const [activeTab, setActiveTab] = useState<'team' | 'finder'>('team');

  useEffect(() => {
    syncCustom(loadCustomLS());
  }, []);

  const updateBoss = (p: Partial<BossState>) => {
    setBoss(b => ({ ...b, ...p }));
    setCalculated(false);
  };

  const updateSlot = (id: number, p: Partial<TeamSlot>) => {
    setSlots(ss => ss.map(s => s.id === id ? { ...s, ...p } : s));
    setCalculated(false);
  };

  const addSlot = () => {
    if (slots.length >= 6) return;
    setSlots(ss => [...ss, mkSlot()]);
    setCalculated(false);
  };

  const duplicateSlot = (id: number) => {
    const slot = slots.find(s => s.id === id);
    if (!slot || slots.length >= 6) return;
    const newSlot = { ...mkSlot(), ...slot, id: _slotId++ };
    setSlots(ss => [...ss, newSlot]);
    setCalculated(false);
  };

  const removeSlot = (id: number) => {
    setSlots(ss => ss.filter(s => s.id !== id));
    setCalculated(false);
  };

  const loadSlots = (partials: Partial<TeamSlot>[]) => {
    const extras: TeamSlot[] = partials.map(p => ({ ...mkSlot(), ...p }));
    setSlots(ss => {
      const updated = [...ss];
      for (const ex of extras) {
        const emptyIdx = updated.findIndex(s => !s.name);
        if (emptyIdx >= 0) {
          updated[emptyIdx] = { ...updated[emptyIdx], ...ex };
        } else if (updated.length < 6) {
          updated.push(ex);
        }
      }
      return updated;
    });
    setActiveTab('team');
    setCalculated(false);
  };

  const calculate = () => {
    if (!boss.data) return;
    setSlots(ss => ss.map(slot => {
      if (!slot.name || !slot.moveName) return { ...slot, result: null, error: '' };
      if (!slot.data) return { ...slot, result: null, error: `"${slot.name}" not found` };
      if (!slot.moveData) return { ...slot, result: null, error: `"${slot.moveName}" not found` };
      const result = calcSlotResult(slot, boss);
      return { ...slot, result, error: '' };
    }));
    setCalculated(true);
  };

  const totalHp = getTotalHp(boss);
  const calculatedSlots = slots.filter(s => s.result && !s.result.immune);

  if (sdState === 'loading') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12, color: 'var(--text-muted)' }}>
      <div style={{ width: 20, height: 20, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading Pokemon data...
    </div>
  );
  if (sdState === 'error') return (
    <div style={{ padding: 24, color: '#f87171', textAlign: 'center' }}>
      Failed to load Pokemon data. Check your connection and refresh.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>Raid Counter Calculator</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Build one team - all raiders use the same team
        </span>
      </div>

      {/* Boss Config */}
      <BossPanel boss={boss} onChange={updateBoss} />

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {([['team', 'Team Builder'], ['finder', 'Auto-Find Counters']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab as any)} style={{
            padding: '8px 16px', borderRadius: '8px 8px 0 0',
            border: '1px solid var(--border)', borderBottom: activeTab === tab ? '2px solid var(--primary)' : '1px solid transparent',
            background: activeTab === tab ? 'rgba(88,101,242,.12)' : 'transparent',
            color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
            cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: -1,
          }}>
            {label}
          </button>
        ))}
      </div>

      {/* Team Builder Tab */}
      {activeTab === 'team' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {slots.map((slot, i) => {
              const rank = calculated && slot.result && !slot.result.immune
                ? calculatedSlots.indexOf(slot)
                : null;
              return (
                <SlotRow
                  key={slot.id}
                  slot={slot}
                  bossHp={totalHp}
                  rank={rank}
                  onChange={p => updateSlot(slot.id, p)}
                  onRemove={() => removeSlot(slot.id)}
                  onDuplicate={() => duplicateSlot(slot.id)}
                />
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {slots.length < 6 && (
              <button onClick={addSlot} style={BTN('ghost')}>
                + Add Pokemon {slots.length}/6
              </button>
            )}
            <button
              onClick={calculate}
              disabled={!boss.data || slots.every(s => !s.name || !s.moveName)}
              style={{ ...BTN('primary'), opacity: (!boss.data || slots.every(s => !s.name || !s.moveName)) ? 0.5 : 1 }}
            >
              Calculate Damage
            </button>
            <button onClick={() => { setSlots([mkSlot(), mkSlot(), mkSlot()]); setCalculated(false); }} style={BTN('danger')}>
              Clear Team
            </button>
          </div>

          {/* Results */}
          {calculated && calculatedSlots.length > 0 && (
            <ResultsPanel slots={slots} boss={boss} totalHp={totalHp} />
          )}

          {/* Tips */}
          <div style={{ ...CARD, background: 'rgba(88,101,242,.04)', border: '1px solid rgba(88,101,242,.15)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
              Raid Tips
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <div>1) Use the <strong>Auto-Find</strong> tab to see which Pokemon hit hardest against this boss.</div>
              <div>2) If boss <strong>Def &lt; SpD</strong>, prefer Physical moves. If <strong>SpD &lt; Def</strong>, prefer Special.</div>
              <div>3) <strong>STAB + Super Effective</strong> = 3x damage. Always try to match both.</div>
              <div>4) Raids have <strong>no items, no abilities, no status</strong> - raw stats and type matchups only.</div>
              <div>5) Boss HP <strong>scales up</strong> per raider. The more people join, the tankier the boss gets.</div>
              <div>6) Z-Moves deal <strong>massive burst damage</strong> - enable the Z toggle for relevant slots.</div>
            </div>
          </div>
        </>
      )}

      {/* Auto-Find Tab */}
      {activeTab === 'finder' && (
        <AutoFindPanel boss={boss} onLoadSlots={loadSlots} />
      )}

      {/* Monte Carlo Panel */}
      {calculated && boss.data && (
        <MonteCarloPanel boss={boss} slots={slots.filter(s => s.result && !s.result.immune)} totalHp={totalHp} />
      )}

    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Monte Carlo Panel
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function MonteCarloPanel({ boss, slots, totalHp }: { boss: BossState; slots: TeamSlot[]; totalHp: number }) {
  const [open, setOpen] = React.useState(false);
  const [result, setResult] = React.useState<MCResult | null>(null);
  const [running, setRunning] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [activeTab, setTab] = React.useState<'hist' | 'patk' | 'moves' | 'slots' | 'exact'>('hist');
  const [showDiag, setDiag] = React.useState(false);
  const [saved, setSaved] = React.useState<MCResult | null>(null);
  const [maxTrials, setMaxTrials] = React.useState(2000);
  const [margin, setMargin] = React.useState(0.05);
  const [policy, setPolicy] = React.useState<'uniform' | 'bpweighted' | 'maxdmg'>('uniform');
  const [antithetic, setAV] = React.useState(true);
  const [stratified, setStrat] = React.useState(true);
  const [exactMode, setExact] = React.useState(false);
  const [confK, setConfK] = React.useState<number | null>(null);

  if (!boss.data || !slots.length) return null;
  const bossMoves = getLevelUpMoves(boss.name);
  const K = slots.length * Math.max(1, boss.numRaiders);

  const run = (overrideMax?: number) => {
    if (!slots.length) { setErr('Add at least one complete counter slot first.'); return; }
    if (!bossMoves.length) { setErr(`No level-up moves found for ${boss.data!.name}.`); return; }
    setErr(''); setRunning(true); setResult(null);
    setTimeout(() => {
      try {
        const r = runMonteCarlo(boss, slots, totalHp, { maxTrials: overrideMax ?? maxTrials, targetMargin: margin, policy, antithetic, stratified, seed: 0, exactMode });
        if (r) setResult(r); else setErr('Simulation returned null - check boss/counter config.');
      } catch (e: any) { setErr(e.message || 'Unknown error'); }
      setRunning(false);
    }, 20);
  };

  const R = result;
  const histKeys = R ? Object.keys(R.histogram).map(Number).sort((a, b) => a - b) : [];
  const maxHistCnt = R ? Math.max(...Object.values(R.histogram)) : 1;
  const ciColor = !R ? '#6b7280' : R.ciWidth <= margin * 2 ? '#4ade80' : R.ciWidth <= margin * 4 ? '#fb923c' : '#f87171';

  const cpts = R?.convergence ?? [];
  const SP_W = 220, SP_H = 44;
  const spMin = cpts.length ? Math.min(...cpts.map(p => p.ciLo)) - 0.1 : 0;
  const spMax = cpts.length ? Math.max(...cpts.map(p => p.ciHi)) + 0.1 : 4;
  const spR = Math.max(0.01, spMax - spMin);
  const sy = (v: number) => SP_H - ((v - spMin) / spR) * SP_H;
  const sx = (i: number) => cpts.length < 2 ? 0 : (i / (cpts.length - 1)) * SP_W;

  const PILL = (label: string, val: string | number, col = '#a5b4fc', sub?: string) => (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '10px 12px', textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'monospace', color: col, lineHeight: 1 }}>{val}</div>
      {sub && <div style={{ fontSize: 9, color: '#4b5563', marginTop: 3 }}>{sub}</div>}
    </div>
  );
  const TABL = (id: typeof activeTab, label: string) => (
    <button onClick={() => setTab(id)} style={{ padding: '6px 12px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', color: activeTab === id ? '#e4e6ef' : '#4b5563', fontSize: 11, fontWeight: activeTab === id ? 700 : 400, borderBottom: activeTab === id ? '2px solid #6366f1' : '2px solid transparent' }}>
      {label}
    </button>
  );

  return (
    <div style={{ border: '1px solid rgba(99,102,241,0.35)', borderRadius: 12, overflow: 'hidden', background: 'rgba(10,11,24,0.4)' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', padding: '12px 16px', background: 'rgba(99,102,241,0.08)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'inherit' }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.09em', display: 'flex', alignItems: 'center', gap: 8 }}>
          Monte-Carlo Battle Simulation
          {R && <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'none', color: R.pWin >= 0.8 ? '#4ade80' : R.pWin >= 0.5 ? '#fb923c' : '#f87171' }}>
            · {(R.pWin * 100).toFixed(0)}% win · mean {R.mean.toFixed(2)} atk
          </span>}
        </span>
        <span style={{ color: '#374151' }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Options */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={LBL}>Max Trials</label>
              <div style={{ display: 'flex', gap: 3 }}>
                {[1000, 2000, 5000, 10000].map(n => (
                  <button key={n} onClick={() => setMaxTrials(n)} style={{ padding: '4px 9px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.09)', background: maxTrials === n ? 'rgba(99,102,241,0.3)' : 'transparent', color: maxTrials === n ? '#a5b4fc' : '#4b5563', cursor: 'pointer', fontSize: 11, fontWeight: maxTrials === n ? 700 : 400, fontFamily: 'inherit' }}>
                    {n >= 1000 ? `${n / 1000}k` : n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={LBL}>Target Margin (+/- attackers)</label>
              <div style={{ display: 'flex', gap: 3 }}>
                {[0.10, 0.05, 0.02].map(m => (
                  <button key={m} onClick={() => setMargin(m)} style={{ padding: '4px 9px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.09)', background: margin === m ? 'rgba(99,102,241,0.3)' : 'transparent', color: margin === m ? '#a5b4fc' : '#4b5563', cursor: 'pointer', fontSize: 11, fontWeight: margin === m ? 700 : 400, fontFamily: 'inherit' }}>
                    +/-{m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={LBL}>Boss Move Policy</label>
              <div style={{ display: 'flex', gap: 3 }}>
                {(['uniform', 'bpweighted', 'maxdmg'] as const).map(p => (
                  <button key={p} onClick={() => setPolicy(p)} style={{ padding: '4px 9px', borderRadius: 5, border: '1px solid rgba(255,255,255,0.09)', background: policy === p ? 'rgba(99,102,241,0.3)' : 'transparent', color: policy === p ? '#a5b4fc' : '#4b5563', cursor: 'pointer', fontSize: 11, fontWeight: policy === p ? 700 : 400, fontFamily: 'inherit' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 2 }}>
              <label style={{ fontSize: 11, color: '#4b5563', display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={antithetic} onChange={e => setAV(e.target.checked)} /> Antithetic</label>
              <label style={{ fontSize: 11, color: '#4b5563', display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={stratified} onChange={e => setStrat(e.target.checked)} /> Stratified</label>
              <label style={{ fontSize: 11, color: '#4b5563', display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={exactMode} onChange={e => setExact(e.target.checked)} /> Exact PMF</label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => run()} disabled={running} style={{ ...BTN('primary'), opacity: running ? 0.6 : 1 }}>
              {running ? <><div style={{ width: 12, height: 12, border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Running...</> : 'Run Simulation'}
            </button>
            {R && <>
              <button onClick={() => run(10000)} style={{ padding: '7px 14px', background: 'rgba(251,146,60,0.08)', border: '1px solid rgba(251,146,60,0.2)', borderRadius: 7, color: '#fb923c', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>Run 10k (accurate)</button>
              <button onClick={() => setSaved(R)} style={{ padding: '7px 14px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 7, color: '#4ade80', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit' }}>Save snapshot</button>
              {saved && <span style={{ fontSize: 10, color: '#4b5563' }}>Saved: {saved.trials.toLocaleString()} trials · mean {saved.mean.toFixed(2)}</span>}
            </>}
          </div>

          {err && <div style={{ color: '#f87171', fontSize: 12, padding: '6px 10px', background: 'rgba(248,113,113,0.08)', borderRadius: 6 }}>{err}</div>}

          {!R && !running && (
            <div style={{ fontSize: 11, color: '#374151', lineHeight: 1.65, padding: '10px 12px', background: 'rgba(0,0,0,0.18)', borderRadius: 8 }}>
              <strong style={{ color: '#6b7280' }}>How it works:</strong> Pilot run of 1,000 trials; estimate sigma; compute N = (1.96sigma/margin)^2; continue until CI width is within target or max trials.
              Each of the {boss.numRaiders} raiders sends the same team sequentially vs {totalHp.toLocaleString()} total boss HP.
              Boss retaliates with level-up moves each turn. Faster Pokemon attack first.
              {antithetic ? ' Antithetic variates pairs complement trials to halve variance.' : ''}
              {stratified ? ' Stratified sampling proportionally distributes boss move trials.' : ''}
            </div>
          )}

          {R && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }}>
                {PILL('Win Rate', `${(R.pWin * 100).toFixed(1)}%`, R.pWin >= 0.8 ? '#4ade80' : R.pWin >= 0.5 ? '#fb923c' : '#f87171')}
                {PILL('Mean', R.mean.toFixed(2), '#e4e6ef', `+/-${R.se.toFixed(3)} SE`)}
                {PILL('Median', R.median.toString(), '#a5b4fc')}
                {PILL('Mode', R.mode.toString(), '#818cf8')}
                {PILL('Std Dev', R.stdDev.toFixed(3), '#9ca3af')}
                {PILL('P90', R.p90 > K ? `>${K}` : R.p90.toString(), '#fb923c')}
                {PILL('P95', R.p95 > K ? `>${K}` : R.p95.toString(), '#f87171')}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 13px', background: 'rgba(0,0,0,0.22)', borderRadius: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.07em' }}>95% CI</span>
                <span style={{ fontFamily: 'monospace', fontSize: 14, color: '#e4e6ef', fontWeight: 700 }}>[{R.ci95[0].toFixed(3)},&thinsp;{R.ci95[1].toFixed(3)}]</span>
                <span style={{ fontSize: 11, color: ciColor, fontWeight: 700, padding: '2px 8px', background: `${ciColor}18`, borderRadius: 5, border: `1px solid ${ciColor}44` }}>
                  {R.metMargin ? 'Margin met' : `Width ${R.ciWidth.toFixed(3)}`}
                </span>
                <span style={{ fontSize: 10, color: '#374151', marginLeft: 'auto' }}>{R.trials.toLocaleString()} trials · {R.numRaiders}x{R.numSlots} slots · seed {R.seed}</span>
                <button onClick={() => setDiag(d => !d)} style={{ fontSize: 10, color: '#4b5563', background: 'none', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 5, padding: '3px 8px', cursor: 'pointer', fontFamily: 'inherit' }}>
                  {showDiag ? 'Hide' : 'Show'} diagnostics
                </button>
              </div>

              {showDiag && (
                <div style={{ background: 'rgba(0,0,0,0.18)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 9, padding: '13px 15px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
                    {[['Pilot sigma', R.pilotStdDev.toFixed(4)], ['Required N', R.trialsRequired.toLocaleString()], ['Actual N', R.trials.toLocaleString()], ['CI Width', R.ciWidth.toFixed(4)]].map(([l, v]) => (
                      <div key={l} style={{ textAlign: 'center', padding: '7px 8px', background: 'rgba(255,255,255,0.02)', borderRadius: 6 }}>
                        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#374151', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#9ca3af', fontWeight: 700 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 10, color: '#374151', lineHeight: 1.5 }}>
                    P5={R.p5} P25={R.p25} P50={R.median} P75={R.p75} P95={R.p95} · Policy: {R.policy}
                  </div>
                  {cpts.length >= 3 && (
                    <div>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#374151', marginBottom: 4 }}>Running mean + 95% CI</div>
                      <svg width={SP_W} height={SP_H + 12} style={{ overflow: 'visible' }}>
                        <polygon points={[...cpts.map((p, i) => `${sx(i)},${sy(p.ciLo)}`), ...[...cpts].reverse().map((p, i) => `${sx(cpts.length - 1 - i)},${sy(p.ciHi)}`)].join(' ')} fill="rgba(99,102,241,0.15)" />
                        <polyline points={cpts.map((p, i) => `${sx(i)},${sy(p.mean)}`).join(' ')} fill="none" stroke="#818cf8" strokeWidth={1.5} />
                        <line x1={0} y1={sy(R.mean)} x2={SP_W} y2={sy(R.mean)} stroke="#4ade80" strokeWidth={0.8} strokeDasharray="3,3" />
                        <text x={0} y={SP_H + 10} fontSize={8} fill="#374151">{cpts[0].trial}</text>
                        <text x={SP_W} y={SP_H + 10} fontSize={8} fill="#374151" textAnchor="end">{cpts[cpts.length - 1].trial}</text>
                        <text x={SP_W + 4} y={sy(R.mean) + 3} fontSize={8} fill="#4ade80">{R.mean.toFixed(2)}</text>
                      </svg>
                    </div>
                  )}
                </div>
              )}

              {/* Sub-tabs */}
              <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {TABL('hist', 'Distribution')}
                {TABL('patk', 'P(<=k) Table')}
                {TABL('moves', 'Boss Moves')}
                {TABL('slots', 'Per Attacker')}
                {exactMode && TABL('exact', 'Exact PMF')}
              </div>

              {activeTab === 'hist' && (
                <div style={{ background: 'rgba(0,0,0,0.22)', borderRadius: 9, padding: '14px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Attackers Needed - {R.trials.toLocaleString()} trials</span>
                    <span style={{ fontSize: 10, color: '#374151' }}>sigma={R.stdDev.toFixed(3)} IQR=[{R.p25},{R.p75}]</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 90, position: 'relative' }}>
                    {histKeys.map(k => {
                      const cnt = R.histogram[k] || 0, pct = cnt / R.trials;
                      const barH = Math.max(4, Math.round((cnt / maxHistCnt) * 78));
                      const isOver = k > K, isMed = k === R.median;
                      const colBar = isOver ? 'rgba(248,113,113,0.5)' : k === R.mode ? 'rgba(129,140,248,0.85)' : isMed ? 'rgba(74,222,128,0.6)' : 'rgba(99,102,241,0.55)';
                      return (
                        <div key={k} title={`${k} atk: ${(pct * 100).toFixed(1)}% | CDF ${((R.cdf[k] ?? 0) * 100).toFixed(1)}%`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0, cursor: 'default' }}>
                          <div style={{ fontSize: 9, color: '#374151', fontFamily: 'monospace' }}>{(pct * 100).toFixed(0)}%</div>
                          <div style={{ width: '100%', height: barH, background: colBar, borderRadius: '3px 3px 0 0', minHeight: 4 }} />
                          <div style={{ width: '100%', height: 3, background: `rgba(251,191,36,${(R.cdf[k] ?? 0) * 0.7})`, borderRadius: '0 0 2px 2px' }} />
                          <div style={{ fontSize: 10, color: isOver ? '#f87171' : k === R.mode ? '#818cf8' : isMed ? '#4ade80' : '#a5b4fc', fontWeight: 700, fontFamily: 'monospace' }}>
                            {isOver ? `>${K}` : k}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 9, color: '#374151', flexWrap: 'wrap' }}>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(129,140,248,0.85)', marginRight: 3, borderRadius: 1 }} />mode={R.mode}</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 8, background: 'rgba(74,222,128,0.6)', marginRight: 3, borderRadius: 1 }} />median={R.median}</span>
                    <span><span style={{ display: 'inline-block', width: 8, height: 3, background: 'rgba(251,191,36,0.7)', marginRight: 3 }} />CDF strip</span>
                    <span style={{ color: '#818cf8' }}>K={K} ({R.numRaiders}rx{R.numSlots}s)</span>
                  </div>
                </div>
              )}

              {activeTab === 'patk' && (
                <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: 9, padding: '14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>P(defeat boss with at most k attacker slots)</div>
                  {confK && <div style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 700, marginBottom: 8 }}>at most {confK} slots at {((R.pAtMostK.find(x => x.k === confK)?.p ?? 0) * 100).toFixed(1)}%</div>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 5 }}>
                    {R.pAtMostK.map(({ k, p }) => {
                      const col = p >= 0.9 ? '#4ade80' : p >= 0.7 ? '#a3e635' : p >= 0.5 ? '#fb923c' : '#f87171';
                      return (
                        <div key={k} onClick={() => setConfK(confK === k ? null : k)} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', cursor: 'pointer', background: confK === k ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.02)', borderRadius: 6, border: `1px solid ${confK === k ? 'rgba(99,102,241,0.5)' : 'rgba(255,255,255,0.05)'}` }}>
                          <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 24, fontWeight: 700 }}>at most {k}</span>
                          <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${p * 100}%`, height: '100%', background: col, borderRadius: 3 }} /></div>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: col, fontWeight: 700, minWidth: 38, textAlign: 'right' }}>{(p * 100).toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeTab === 'moves' && (
                <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: 9, padding: '14px', overflowX: 'auto' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Boss Move Usage & Damage</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        {['Move', 'Type', 'BP', 'Uses', 'Avg Dmg', 'Max Dmg', 'Share'].map(h => (
                          <th key={h} style={{ padding: '5px 8px', textAlign: 'center', color: '#374151', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {R.perMove.map((m, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i === 0 ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                          <td style={{ padding: '6px 8px', fontWeight: 700, color: '#e4e6ef' }}>{m.name}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}><span style={{ background: TC_COLORS[m.type] || '#555', color: '#fff', borderRadius: 3, padding: '1px 5px', fontSize: 9, fontWeight: 700 }}>{m.type}</span></td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#9ca3af' }}>{m.bp}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#a5b4fc' }}>{m.uses.toLocaleString()}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#fb923c' }}>{m.avgDmg.toFixed(1)}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#f87171' }}>{m.maxDmg}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', minWidth: 80 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${m.pctDmg * 100}%`, height: '100%', background: '#f87171', borderRadius: 3 }} /></div>
                              <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#f87171', minWidth: 34 }}>{(m.pctDmg * 100).toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'slots' && (
                <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: 9, padding: '14px', overflowX: 'auto' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Per-Attacker Combat Statistics (each raider's copy)</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                        {['Attacker', 'Used', 'Avg Hits', 'Boss HP %', 'Survived', 'OHKO Risk', 'Avg Dmg Taken'].map(h => (
                          <th key={h} style={{ padding: '5px 8px', textAlign: 'center', color: '#374151', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {R.perSlot.slice(0, slots.length).map((s, i) => {
                        const pctHP = s.pctBossHp * 100;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 700, color: '#e4e6ef' }}>{s.name}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#9ca3af' }}>{s.used.toLocaleString()}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#4ade80' }}>{s.avgHitsDealt.toFixed(2)}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'center', minWidth: 80 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, pctHP)}%`, height: '100%', background: pctHP >= 50 ? '#f87171' : '#4ade80', borderRadius: 3 }} /></div>
                                <span style={{ fontSize: 10, fontFamily: 'monospace', color: '#9ca3af', minWidth: 38 }}>{pctHP.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: s.survivalPct >= 0.5 ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', color: s.survivalPct >= 0.5 ? '#4ade80' : '#f87171' }}>
                                {(s.survivalPct * 100).toFixed(0)}%
                              </span>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: s.ohkoChance >= 0.5 ? 'rgba(248,113,113,0.15)' : s.ohkoChance >= 0.2 ? 'rgba(251,146,60,0.15)' : 'rgba(74,222,128,0.1)', color: s.ohkoChance >= 0.5 ? '#f87171' : s.ohkoChance >= 0.2 ? '#fb923c' : '#4ade80' }}>
                                {(s.ohkoChance * 100).toFixed(1)}%
                              </span>
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'center', fontFamily: 'monospace', color: '#f87171' }}>{s.avgDmgTaken.toFixed(1)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {exactMode && activeTab === 'exact' && (
                <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: 9, padding: '14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Exact Hits-to-KO PMF (convolution, no boss retaliation)</div>
                  <div style={{ fontSize: 11, color: '#374151', marginBottom: 10, lineHeight: 1.5 }}>Exact probabilities assuming uninterrupted attacks. Monte Carlo accounts for boss HP reduction via retaliation.</div>
                  {R.exactKoPmfs.slice(0, slots.length).map((pmf, si) => {
                    const slot = slots[si];
                    const nonZero = pmf.map((p, k) => ({ k, p })).filter(x => x.p > 0.001);
                    if (!nonZero.length) return <div key={si} style={{ padding: '8px 10px', color: '#374151', fontSize: 11 }}>{slot.name || '-'}: immune or no valid move</div>;
                    const maxP = Math.max(...nonZero.map(x => x.p));
                    return (
                      <div key={si} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc', marginBottom: 5 }}>{slot.name || '-'}</div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 52 }}>
                          {nonZero.map(({ k, p }) => (
                            <div key={k} title={`P(KO in ${k} hits) = ${(p * 100).toFixed(2)}%`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 0, maxWidth: 40 }}>
                              <div style={{ fontSize: 9, color: '#374151' }}>{(p * 100).toFixed(0)}%</div>
                              <div style={{ width: '100%', height: Math.max(4, Math.round((p / maxP) * 46)), background: 'rgba(99,102,241,0.6)', borderRadius: '2px 2px 0 0' }} />
                              <div style={{ fontSize: 9, color: '#818cf8', fontFamily: 'monospace' }}>{k}h</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

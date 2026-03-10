/**
 * CounterCalcTool.tsx — Raid Counter Calculator (main component)
 *
 * Architecture:
 *   - Shared types:       ../lib/raid_types.ts
 *   - MC simulation:      ../lib/mc_engine.ts
 *   - Auto-finder:        ../lib/auto_finder.ts
 *   - Pokémon engine:     ../lib/engine_pokemon.ts
 *   - Custom Pokémon:     managed by admins in BossInfo → ✨ Custom Pokémon tab
 *
 * Admin vs client:
 *   isAdmin=true  →  can create/edit/delete custom Pokémon (stored server-side)
 *   isAdmin=false →  can view/use custom Pokémon created by admins
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import React from 'react';
import {
  lookupPoke,
  lookupMove,
  searchMoves,
  searchMovesWithCustom,
  getLevelUpMoves,
  runCalc,
  calcStat,
  getNat,
  _zPower,
  NATURES,
  ITEMS,
  ALL_TYPES,
  WEATHERS,
  RAID_TIERS,
  STAT_ORDER,
  DEFAULT_EVS,
  DEFAULT_IVS,
  INP,
  NUM,
  SEL,
  LBL,
  injectCustomPokemon,
  removeCustomPokemon,
  getCustomPokemonNames,
  lookupPokeWithCustom,
  searchPokemonWithCustom,
  getAllPokemonNamesWithCustom,
  getAllLearnableMoveNamesWithCustom,
  lookupMoveWithCustom,
  type PokeStat,
  type PokeData,
  type MoveData,
} from '../lib/engine_pokemon';
import { TypeBadge, AutoInput } from '../lib/pokemon_components';

// Extracted engine modules
import { runMCViaWorker } from '../lib/mc_engine';
import { runAutoFinder, type SortMetric } from '../lib/auto_finder';
import type {
  CounterSlot, BossConfig, SimResult, CandidateMetrics, CalcResult, CalcResultDamage,
  MinRaidersResult, SlotDamageBreakdown, SimpleMonteCarloResult, MinRaidersStatus,
} from '../lib/raid_types';

// ── Slot/Boss factories ───────────────────────────────────────────────────────
let _slotId = 1;
const mkSlot = (): CounterSlot => ({
  id: _slotId++, name: '', data: null, level: 100, nature: 'Hardy', item: '(none)',
  evs: { ...DEFAULT_EVS }, ivs: { ...DEFAULT_IVS }, teraType: '',
  moveName: '', moveData: null, zmove: false, isCrit: false,
  count: 1, raiderId: 0, result: null, error: '',
  avgDamagePerFight: 0, isShadow: false, activeInSimple: true,
});

const mkBoss = (): BossConfig => ({
  name: '', data: null, level: 100, nature: 'Hardy',
  evs: { ...DEFAULT_EVS }, ivs: { ...DEFAULT_IVS }, teraType: '',
  raidTier: 'Normal (×1 HP)', weather: 'None', doubles: false, defScreen: false,
  numRaiders: 1, hpIncreasePerRaider: 0, hpScalingMode: 'additive',
  customMoves: [], teamSize: 6,
  shadowMultiplierOnDualType: 4, simpleBaseHp: 0,
});

// ── Min-Raiders Solver ────────────────────────────────────────────────────────

/** Compute per-raider damage d from slots, applying shadow multiplier for dual-type bosses. */
function calcPerRaiderDamage(
  slots: CounterSlot[],
  isDualType: boolean,
  shadowMult: number
): { d: number; breakdown: SlotDamageBreakdown[] } {
  let d = 0;
  const breakdown: SlotDamageBreakdown[] = [];
  for (const slot of slots) {
    if (!slot.activeInSimple) continue;
    const base = slot.avgDamagePerFight;
    const mult = slot.isShadow && isDualType ? shadowMult : 1;
    const effective = base * mult;
    const subtotal = (slot.count ?? 1) * effective;
    breakdown.push({
      slotId: slot.id,
      name: slot.name || '(unnamed)',
      count: slot.count ?? 1,
      baseDmg: base,
      effectiveDmg: effective,
      isShadow: slot.isShadow,
      multiplierApplied: mult,
      subtotal,
    });
    d += subtotal;
  }
  return { d, breakdown };
}

/** Solve for minimum n — linear (additive) scaling mode. */
function solveLinear(b: number, p: number, d: number): MinRaidersResult {
  const breakdown: SlotDamageBreakdown[] = [];
  if (d <= 0) {
    return { status: 'needs_more_data', n: null, bossHpAtN: null, perRaiderDamage: d, totalDamageAtN: null,
      formula: 'n = ⌈b(1−p) / (d − b·p)⌉', warning: 'Per-raider damage is 0 — fill in avgDamagePerFight for each slot.', breakdown };
  }
  if (p === 0) {
    const n = Math.ceil(b / d);
    const hp = b;
    return { status: 'solved', n, bossHpAtN: hp, perRaiderDamage: d, totalDamageAtN: n * d,
      numerator: b, denominator: d,
      formula: `p=0 → n = ⌈${b.toLocaleString()} / ${d.toLocaleString()}⌉ = ${n}`, breakdown };
  }
  const denom = d - b * p;
  const numer = b * (1 - p);
  if (denom <= 0) {
    return { status: 'impossible', n: null, bossHpAtN: null, perRaiderDamage: d, totalDamageAtN: null,
      numerator: numer, denominator: denom,
      formula: `n = ⌈${numer.toLocaleString()} / (${d.toLocaleString()} − ${(b*p).toLocaleString()})⌉`,
      warning: `Denominator = d − b·p = ${denom.toFixed(2)} ≤ 0 — boss scales faster than each raider's contribution. Increase damage or reduce scaling%.`, breakdown };
  }
  const nRaw = numer / denom;
  const n = Math.ceil(nRaw);
  const hp = b * (1 + p * (n - 1));
  return { status: 'solved', n, bossHpAtN: Math.round(hp), perRaiderDamage: d, totalDamageAtN: n * d,
    numerator: numer, denominator: denom,
    formula: `n = ⌈${numer.toLocaleString()} / ${denom.toLocaleString()}⌉ = ⌈${nRaw.toFixed(4)}⌉ = ${n}`,
    breakdown };
}

/** Solve for minimum n — multiplicative scaling mode (exponential + binary search). */
function solveMultiplicative(b: number, p: number, d: number, maxIter = 10000): MinRaidersResult {
  const breakdown: SlotDamageBreakdown[] = [];
  if (d <= 0) {
    return { status: 'needs_more_data', n: null, bossHpAtN: null, perRaiderDamage: d, totalDamageAtN: null,
      formula: 'n·d ≥ b·(1+p)^(n−1)', warning: 'Per-raider damage is 0.', breakdown };
  }
  const feasible = (n: number) => n * d >= b * Math.pow(1 + p, n - 1);
  // Exponential search for upper bound
  let hi = Math.max(1, Math.ceil(b / d));
  while (!feasible(hi) && hi <= maxIter) hi *= 2;
  if (hi > maxIter && !feasible(hi)) {
    return { status: 'impossible', n: null, bossHpAtN: null, perRaiderDamage: d, totalDamageAtN: null,
      formula: 'n·d ≥ b·(1+p)^(n−1)', warning: `No solution found up to n=${maxIter.toLocaleString()} — boss diverges.`, breakdown };
  }
  // Binary search between lo=1 and hi
  let lo = 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (feasible(mid)) hi = mid; else lo = mid + 1;
  }
  const n = lo;
  const hp = b * Math.pow(1 + p, n - 1);
  return { status: 'solved', n, bossHpAtN: Math.round(hp), perRaiderDamage: d, totalDamageAtN: n * d,
    formula: `n = ${n} (numerical — exponential/binary search, max ${maxIter.toLocaleString()})`, breakdown };
}

/** Run full min-raiders calculation. */
function runMinRaiders(boss: BossConfig, slots: CounterSlot[], baseHp: number): MinRaidersResult {
  const bossTypes = boss.teraType ? [boss.teraType] : (boss.data?.types ?? []);
  const isDualType = bossTypes.length >= 2;
  const shadowMult = boss.shadowMultiplierOnDualType ?? 4;
  const { d, breakdown } = calcPerRaiderDamage(slots, isDualType, shadowMult);
  const b = baseHp;
  const p = (boss.hpIncreasePerRaider ?? 0) / 100;
  const mode = boss.hpScalingMode;
  const result = mode === 'multiplicative'
    ? solveMultiplicative(b, p, d)
    : solveLinear(b, p, d);
  result.breakdown = breakdown;
  return result;
}

/** Simple Monte Carlo for min-raiders: samples variance and crits. */
function runSimpleMC(
  boss: BossConfig, slots: CounterSlot[], baseHp: number,
  trials = 1000, varianceRange = 0.1, critChance = 0.0625
): SimpleMonteCarloResult {
  const bossTypes = boss.teraType ? [boss.teraType] : (boss.data?.types ?? []);
  const isDualType = bossTypes.length >= 2;
  const shadowMult = boss.shadowMultiplierOnDualType ?? 4;
  const p = (boss.hpIncreasePerRaider ?? 0) / 100;
  const mode = boss.hpScalingMode;
  const ns: number[] = [];
  const histogram: Record<number, number> = {};
  const activeSlots = slots.filter(s => s.activeInSimple && (s.count ?? 1) > 0);

  for (let t = 0; t < trials; t++) {
    // Sample d with variance per slot
    let sampledD = 0;
    for (const slot of activeSlots) {
      const base = slot.avgDamagePerFight;
      const mult = slot.isShadow && isDualType ? shadowMult : 1;
      const isCrit = Math.random() < critChance;
      const variance = (Math.random() * 2 - 1) * varianceRange;
      const effective = base * mult * (1 + variance) * (isCrit ? 1.5 : 1);
      sampledD += (slot.count ?? 1) * Math.max(0, effective);
    }
    if (sampledD <= 0) { ns.push(9999); histogram[9999] = (histogram[9999] ?? 0) + 1; continue; }
    // Solve for this d
    const r = mode === 'multiplicative'
      ? solveMultiplicative(baseHp, p, sampledD, 500)
      : solveLinear(baseHp, p, sampledD);
    const n = r.status === 'solved' ? (r.n ?? 9999) : 9999;
    ns.push(n);
    histogram[n] = (histogram[n] ?? 0) + 1;
  }
  ns.sort((a, b) => a - b);
  const meanN = ns.reduce((a, b) => a + b, 0) / trials;
  const medianN = ns[Math.floor(trials / 2)];
  const p5 = ns[Math.floor(trials * 0.05)];
  const p95 = ns[Math.floor(trials * 0.95)];
  // Compute the deterministic n from unsampled d to define "success"
  const { d: deterministicD } = calcPerRaiderDamage(slots, isDualType, shadowMult);
  const baseResult = mode === 'multiplicative'
    ? solveMultiplicative(baseHp, p, deterministicD, 500)
    : solveLinear(baseHp, p, deterministicD);
  const baseN = baseResult.status === 'solved' ? (baseResult.n ?? 9999) : 9999;
  const pSuccess = ns.filter(n => n <= baseN).length / trials;
  return { trials, meanN, medianN, p5, p95, pSuccess, histogram };
}

// ── Shared colour helpers ─────────────────────────────────────────────────────

/** Green→Yellow→Red by win-probability (0–1). */
const winRateColor  = (p: number) => p >= .8 ? 'var(--success)' : p >= .5 ? 'var(--warning)' : 'var(--danger)';
const winRateBg     = (p: number) => p >= .8 ? 'rgba(59,165,93,.12)' : p >= .5 ? 'rgba(250,168,26,.12)' : 'rgba(237,66,69,.12)';
const winRateBorder = (p: number) => p >= .8 ? 'rgba(59,165,93,.4)'  : p >= .5 ? 'rgba(250,168,26,.4)'  : 'rgba(237,66,69,.4)';
/** Red→Yellow→Green by damage-dealt percentage. */
const damagePctColor = (p: number) => p >= 100 ? 'var(--danger)' : p >= 50 ? 'var(--warning)' : p >= 20 ? '#fbbf24' : 'var(--success)';
/** OHKO-risk colour (0–1 probability). */
const ohkoRiskColor  = (p: number) => p >= .5 ? 'var(--danger)' : p >= .2 ? 'var(--warning)' : 'var(--success)';

// ── What-If Slider ────────────────────────────────────────────────────────────

function WhatIfSlider({ boss, slots, baseHp }: { boss: BossConfig; slots: CounterSlot[]; baseHp: number }) {
  const [pct, setPct] = React.useState(boss.hpIncreasePerRaider ?? 0);
  // Local mode lets the user explore a different scaling curve without changing boss config
  const [mode, setMode] = React.useState<'additive' | 'multiplicative'>(boss.hpScalingMode);

  const fakeBoss: BossConfig = { ...boss, hpIncreasePerRaider: pct, hpScalingMode: mode };
  const result = runMinRaiders(fakeBoss, slots, baseHp);

  // Build SVG curve: plot HP(n) and n*d for n=1..max
  const maxN = Math.min(20, (result.n ?? 5) + 5);
  const p = pct / 100;
  const bossTypes = boss.teraType ? [boss.teraType] : (boss.data?.types ?? []);
  const isDualType = bossTypes.length >= 2;
  const { d } = calcPerRaiderDamage(slots, isDualType, boss.shadowMultiplierOnDualType ?? 4);
  const hpPoints: number[] = [];
  const dmgPoints: number[] = [];
  for (let n = 1; n <= maxN; n++) {
    const hp = mode === 'multiplicative'
      ? baseHp * Math.pow(1 + p, n - 1)
      : baseHp * (1 + p * (n - 1));
    hpPoints.push(hp);
    dmgPoints.push(n * d);
  }
  const allVals = [...hpPoints, ...dmgPoints].filter(v => isFinite(v) && v > 0);
  const yMax = allVals.length ? Math.max(...allVals) * 1.1 : 1;
  const yMin = 0;
  const W = 280, H = 80;
  const toX = (i: number) => (i / (maxN - 1)) * (W - 20) + 10;
  const toY = (v: number) => H - 8 - ((v - yMin) / (yMax - yMin)) * (H - 16);
  const pathD = (pts: number[]) => pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ');

  const nColor = result.status === 'solved'
    ? (result.n! <= 3 ? '#22c55e' : result.n! <= 8 ? '#f59e0b' : '#ef4444')
    : '#6b7280';

  return (
    <div style={{ background: 'rgba(99,102,241,.06)', border: '1px solid rgba(99,102,241,.2)', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        📈 What-If Scaling Slider
        <span style={{ fontSize: 10, fontWeight: 400, textTransform: 'none', color: 'var(--text-faint)' }}>— drag to see how scaling % changes min raiders</span>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['additive', 'multiplicative'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11,
                background: mode === m ? 'rgba(99,102,241,.3)' : 'transparent',
                color: mode === m ? '#a5b4fc' : 'var(--text-muted)', cursor: 'pointer',
                fontWeight: mode === m ? 700 : 400, fontFamily: "'Lexend',sans-serif" }}>
              {m === 'additive' ? 'Linear' : 'Multiplicative'}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <input type="range" min={0} max={50} step={0.5} value={pct}
            onChange={e => setPct(Number(e.target.value))}
            style={{ width: '100%', accentColor: '#818cf8' }} />
        </div>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 700, color: '#a5b4fc', minWidth: 46 }}>{pct.toFixed(1)}%</span>
        <span style={{ fontSize: 22, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", color: nColor, minWidth: 28 }}>
          n={result.status === 'solved' ? result.n : '∞'}
        </span>
      </div>
      {/* SVG chart */}
      {d > 0 && (
        <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
          {/* Grid lines */}
          {[0.25, 0.5, 0.75, 1].map(f => (
            <line key={f} x1={10} x2={W - 10} y1={toY(yMax * f)} y2={toY(yMax * f)}
              stroke="rgba(255,255,255,.05)" strokeWidth={1} />
          ))}
          {/* Boss HP curve (red) */}
          <path d={pathD(hpPoints)} fill="none" stroke="#f87171" strokeWidth={2} strokeLinejoin="round" />
          <text x={W - 8} y={toY(hpPoints[hpPoints.length - 1]) - 4} fontSize={8} fill="#f87171" textAnchor="end">Boss HP</text>
          {/* Total damage curve (green) */}
          <path d={pathD(dmgPoints)} fill="none" stroke="#4ade80" strokeWidth={2} strokeLinejoin="round" />
          <text x={W - 8} y={toY(dmgPoints[dmgPoints.length - 1]) + 10} fontSize={8} fill="#4ade80" textAnchor="end">n×d</text>
          {/* Crossover dot */}
          {result.status === 'solved' && result.n != null && result.n <= maxN && (() => {
            const ni = result.n - 1;
            return <circle cx={toX(ni)} cy={toY(dmgPoints[ni])} r={4} fill="#fbbf24" stroke="#000" strokeWidth={1.5} />;
          })()}
        </svg>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6, display: 'flex', gap: 16 }}>
        <span style={{ color: '#f87171' }}>━ Boss HP(n)</span>
        <span style={{ color: '#4ade80' }}>━ Total damage n×d</span>
        <span style={{ color: '#fbbf24' }}>● Crossover point</span>
      </div>
    </div>
  );
}

// ── Min-Raiders Panel ─────────────────────────────────────────────────────────

function MinRaidersPanel({ boss, slots, baseHp, onBossChange }: {
  boss: BossConfig;
  slots: CounterSlot[];
  baseHp: number;
  onBossChange: (p: Partial<BossConfig>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [mcOpen, setMcOpen] = React.useState(false);
  const [mcTrials, setMcTrials] = React.useState(1000);
  const [mcVariance, setMcVariance] = React.useState(10);
  const [mcCritChance, setMcCritChance] = React.useState(6.25);
  const [mcResult, setMcResult] = React.useState<SimpleMonteCarloResult | null>(null);
  const [mcRunning, setMcRunning] = React.useState(false);
  const [showWhatIf, setShowWhatIf] = React.useState(false);

  const bossTypes = boss.teraType ? [boss.teraType] : (boss.data?.types ?? []);
  const isDualType = bossTypes.length >= 2;
  const shadowMult = boss.shadowMultiplierOnDualType ?? 4;
  const { d, breakdown } = calcPerRaiderDamage(slots, isDualType, shadowMult);
  const b = baseHp;

  const result = b > 0 ? runMinRaiders(boss, slots, b) : null;

  const runMC = () => {
    if (!result || result.status === 'needs_more_data') return;
    setMcRunning(true);
    setMcResult(null);
    setTimeout(() => {
      const r = runSimpleMC(boss, slots, b, mcTrials, mcVariance / 100, mcCritChance / 100);
      setMcResult(r);
      setMcRunning(false);
    }, 10);
  };

  const statusColor = !result ? '#6b7280'
    : result.status === 'solved' ? '#22c55e'
    : result.status === 'impossible' ? '#ef4444' : '#f59e0b';
  const statusIcon = !result ? '—'
    : result.status === 'solved' ? '✅'
    : result.status === 'impossible' ? '❌' : '⚠️';

  const nColor = result?.status === 'solved'
    ? ((result.n ?? 0) <= 3 ? '#22c55e' : (result.n ?? 0) <= 8 ? '#f59e0b' : '#ef4444')
    : '#6b7280';

  const activeSlots = slots.filter(s => s.activeInSimple);
  const hasData = activeSlots.some(s => s.avgDamagePerFight > 0);

  return (
    <div style={{ border: '1px solid rgba(251,191,36,.3)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '11px 16px', background: 'rgba(251,191,36,.07)', border: 'none',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Lexend',sans-serif" }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '.09em', display: 'flex', alignItems: 'center', gap: 8 }}>
          ⚡ Min-Raiders Calculator
          {result?.status === 'solved' && (
            <span style={{ fontSize: 12, color: nColor, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace",
              textTransform: 'none', background: 'rgba(0,0,0,.2)', padding: '1px 8px', borderRadius: 5 }}>
              n = {result.n}
            </span>
          )}
          {!hasData && <span style={{ fontSize: 10, color: 'var(--text-faint)', fontWeight: 400, textTransform: 'none' }}>— fill in Avg Dmg/Fight per slot below</span>}
        </span>
        <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Min-Raiders-specific overrides
              Note: Scaling Mode lives in Boss Config (it also drives effectiveHp for the main calc).
          */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, padding: '10px 12px',
            background: 'rgba(251,191,36,.04)', borderRadius: 8, border: '1px solid rgba(251,191,36,.12)' }}>
            <div>
              <label style={LBL}>Shadow Multiplier (dual-type boss)</label>
              <input style={INP} type="number" min={1} max={10} step={0.5}
                value={boss.shadowMultiplierOnDualType ?? 4}
                onChange={e => onBossChange({ shadowMultiplierOnDualType: Math.max(1, Number(e.target.value)) })} />
              <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 3 }}>
                Applied to shadow slots when boss has ≥2 types — {isDualType ? '✓ active (dual-type)' : 'inactive (single-type)'}
              </div>
            </div>
            <div>
              <label style={LBL}>Base HP override <span style={{ fontWeight: 400 }}>(0 = auto)</span></label>
              <input style={INP} type="number" min={0} value={boss.simpleBaseHp ?? 0}
                placeholder={b > 0 ? `auto (${b.toLocaleString()})` : 'enter HP'}
                onChange={e => onBossChange({ simpleBaseHp: Math.max(0, Number(e.target.value)) })} />
              <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 3 }}>
                Scaling mode: <strong style={{ color: '#a5b4fc' }}>{boss.hpScalingMode === 'additive' ? 'Linear' : 'Multiplicative'}</strong>
                {' — '}{boss.hpScalingMode === 'additive' ? 'HP(n) = b×(1+p×(n−1))' : 'HP(n) = b×(1+p)^(n−1)'}
              </div>
            </div>
          </div>

          {/* Per-raider damage summary */}
          {breakdown.length > 0 && (
            <div style={{ background: 'rgba(0,0,0,.2)', borderRadius: 9, padding: '10px 14px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>
                Per-Raider Damage Breakdown
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {breakdown.map(bd => (
                  <div key={bd.slotId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                    <span style={{ minWidth: 110, color: 'var(--text)', fontWeight: 600 }}>{bd.name}</span>
                    <span style={{ color: 'var(--text-faint)', fontSize: 10 }}>×{bd.count}</span>
                    {bd.isShadow && isDualType && (
                      <span style={{ fontSize: 9, background: 'rgba(34,211,238,.12)', color: '#22d3ee',
                        border: '1px solid rgba(34,211,238,.25)', borderRadius: 4, padding: '1px 5px' }}>
                        Shadow ×{bd.multiplierApplied}
                      </span>
                    )}
                    <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.07)', borderRadius: 2, overflow: 'hidden', minWidth: 40 }}>
                      <div style={{ width: `${d > 0 ? Math.min(100, (bd.subtotal / d) * 100) : 0}%`,
                        height: '100%', background: bd.isShadow ? '#22d3ee' : '#818cf8', borderRadius: 2 }} />
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--text-muted)', minWidth: 80, textAlign: 'right' }}>
                      {bd.subtotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,.07)', paddingTop: 6, marginTop: 2,
                  display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Total d per raider</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: '#fbbf24' }}>
                    {d.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Results */}
          {result && b > 0 && (
            <div style={{ background: result.status === 'solved' ? 'rgba(34,197,94,.07)' : result.status === 'impossible' ? 'rgba(239,68,68,.07)' : 'rgba(245,158,11,.07)',
              border: `1px solid ${result.status === 'solved' ? 'rgba(34,197,94,.3)' : result.status === 'impossible' ? 'rgba(239,68,68,.3)' : 'rgba(245,158,11,.3)'}`,
              borderRadius: 10, padding: '14px 16px' }}>

              {/* Status banner */}
              <div style={{ fontSize: 12, fontWeight: 700, color: statusColor, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{statusIcon}</span>
                <span>{result.status === 'solved' ? 'Solved — minimum raiders found'
                  : result.status === 'impossible' ? 'No finite solution — boss scales too fast'
                  : 'Needs more data — fill in avg damage per fight'}</span>
              </div>

              {result.warning && (
                <div style={{ fontSize: 11, color: '#fbbf24', background: 'rgba(251,191,36,.08)', borderRadius: 6,
                  padding: '6px 10px', marginBottom: 10 }}>
                  ⚠️ {result.warning}
                </div>
              )}

              {result.status === 'solved' && (
                <>
                  {/* Hero n */}
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12 }}>
                    <div style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Min Raiders</div>
                      <div style={{ fontSize: 48, fontWeight: 900, fontFamily: "'JetBrains Mono',monospace", color: nColor, lineHeight: 1 }}>{result.n}</div>
                    </div>
                    <div style={{ flex: 3, display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                      {[
                        { l: 'Boss HP at n', v: result.bossHpAtN?.toLocaleString() ?? '—', c: '#f87171' },
                        { l: 'Per-raider damage d', v: result.perRaiderDamage.toLocaleString(undefined, { maximumFractionDigits: 0 }), c: '#a5b4fc' },
                        { l: `Total damage (${result.n}×d)`, v: result.totalDamageAtN?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? '—', c: '#4ade80' },
                        { l: 'Surplus', v: ((result.totalDamageAtN ?? 0) - (result.bossHpAtN ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 }), c: '#fbbf24' },
                      ].map(({ l, v, c }) => (
                        <div key={l} style={{ background: 'rgba(0,0,0,.2)', borderRadius: 7, padding: '8px 10px', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{l}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: c }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Damage vs HP bar */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 4 }}>
                      Total damage vs boss HP — surplus margin
                    </div>
                    <div style={{ height: 10, background: '#1e2030', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0,
                        width: `${result.totalDamageAtN && result.bossHpAtN ? Math.min(100, (result.bossHpAtN / result.totalDamageAtN) * 100) : 0}%`,
                        background: 'linear-gradient(90deg,#f87171,#fb923c)', borderRadius: 5 }} />
                      <div style={{ position: 'absolute', top: 0, bottom: 0,
                        left: `${result.totalDamageAtN && result.bossHpAtN ? Math.min(100, (result.bossHpAtN / result.totalDamageAtN) * 100) : 0}%`,
                        width: `${result.totalDamageAtN && result.bossHpAtN ? Math.min(100, ((result.totalDamageAtN - result.bossHpAtN) / result.totalDamageAtN) * 100) : 0}%`,
                        background: 'linear-gradient(90deg,#4ade80,#22c55e)', borderRadius: '0 5px 5px 0' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-faint)', marginTop: 2 }}>
                      <span style={{ color: '#f87171' }}>Boss HP: {result.bossHpAtN?.toLocaleString()}</span>
                      <span style={{ color: '#4ade80' }}>Surplus: {((result.totalDamageAtN ?? 0) - (result.bossHpAtN ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                  </div>

                  {/* HP scaling table */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ fontSize: 11, borderCollapse: 'collapse', width: '100%' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                          {['n', 'Boss HP(n)', 'n×d', 'Δ (damage − HP)', 'Status'].map(h => (
                            <th key={h} style={{ padding: '4px 8px', textAlign: 'center', color: 'var(--text-faint)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: Math.min((result.n ?? 1) + 2, 12) }, (_, i) => i + 1).map(n => {
                          const p = (boss.hpIncreasePerRaider ?? 0) / 100;
                          const hp = boss.hpScalingMode === 'multiplicative'
                            ? b * Math.pow(1 + p, n - 1)
                            : b * (1 + p * (n - 1));
                          const dmg = n * d;
                          const delta = dmg - hp;
                          const wins = delta >= 0;
                          const isTarget = n === result.n;
                          return (
                            <tr key={n} style={{ background: isTarget ? 'rgba(251,191,36,.07)' : n % 2 === 0 ? 'rgba(255,255,255,.015)' : 'transparent',
                              border: isTarget ? '1px solid rgba(251,191,36,.25)' : '1px solid transparent' }}>
                              <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: isTarget ? 900 : 400,
                                fontFamily: "'JetBrains Mono',monospace", color: isTarget ? '#fbbf24' : 'var(--text-muted)' }}>{n}{isTarget ? ' ★' : ''}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", color: '#f87171' }}>{Math.round(hp).toLocaleString()}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", color: '#a5b4fc' }}>{Math.round(dmg).toLocaleString()}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'center', fontFamily: "'JetBrains Mono',monospace", color: wins ? '#4ade80' : '#f87171' }}>
                                {delta >= 0 ? '+' : ''}{Math.round(delta).toLocaleString()}
                              </td>
                              <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                                  background: wins ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)',
                                  color: wins ? '#4ade80' : '#f87171' }}>{wins ? '✓ Win' : '✗ Fail'}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Formula annotation */}
                  <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(0,0,0,.2)', borderRadius: 6,
                    fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: 'var(--text-faint)', wordBreak: 'break-all' }}>
                    {result.formula}
                  </div>
                </>
              )}
            </div>
          )}

          {!b && (
            <div style={{ fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: '12px 0' }}>
              Set a boss Pokémon (or set Base HP Override in the boss panel) to enable the solver.
            </div>
          )}

          {/* What-If Slider */}
          {b > 0 && (
            <div>
              <button onClick={() => setShowWhatIf(w => !w)}
                style={{ padding: '5px 12px', background: 'transparent', border: '1px solid rgba(99,102,241,.3)', borderRadius: 6,
                  color: '#a5b4fc', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Lexend',sans-serif", marginBottom: showWhatIf ? 8 : 0 }}>
                {showWhatIf ? '▲ Hide' : '▼ Show'} What-If Slider
              </button>
              {showWhatIf && <WhatIfSlider boss={boss} slots={slots} baseHp={b} />}
            </div>
          )}

          {/* Monte Carlo */}
          {result?.status === 'solved' && (
            <div style={{ border: '1px solid rgba(99,102,241,.2)', borderRadius: 9, overflow: 'hidden' }}>
              <button onClick={() => setMcOpen(o => !o)}
                style={{ width: '100%', padding: '9px 14px', background: 'rgba(99,102,241,.06)', border: 'none',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Lexend',sans-serif" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: 6 }}>
                  🎲 Monte Carlo (Variance & Crits)
                  {mcResult && <span style={{ fontSize: 10, fontWeight: 600, color: mcResult.pSuccess >= .8 ? '#4ade80' : '#f59e0b' }}>
                    · {(mcResult.pSuccess * 100).toFixed(0)}% success · p5–p95: {mcResult.p5}–{mcResult.p95}
                  </span>}
                </span>
                <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>{mcOpen ? '▲' : '▼'}</span>
              </button>
              {mcOpen && (
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div>
                      <label style={LBL}>Trials</label>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {[500, 1000, 5000, 10000].map(n => (
                          <button key={n} onClick={() => setMcTrials(n)}
                            style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)',
                              background: mcTrials === n ? 'rgba(99,102,241,.3)' : 'transparent',
                              color: mcTrials === n ? '#a5b4fc' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11,
                              fontWeight: mcTrials === n ? 700 : 400, fontFamily: "'Lexend',sans-serif" }}>
                            {n >= 1000 ? n / 1000 + 'k' : n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label style={LBL}>Variance ±%</label>
                      <input style={{ ...INP, width: 60 }} type="number" min={0} max={50} value={mcVariance}
                        onChange={e => setMcVariance(Math.max(0, Math.min(50, Number(e.target.value))))} />
                    </div>
                    <div>
                      <label style={LBL}>Crit Chance %</label>
                      <input style={{ ...INP, width: 60 }} type="number" min={0} max={100} step={0.5} value={mcCritChance}
                        onChange={e => setMcCritChance(Math.max(0, Math.min(100, Number(e.target.value))))} />
                    </div>
                    <button onClick={runMC} disabled={mcRunning}
                      style={{ padding: '7px 16px', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', border: 'none',
                        borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 700,
                        fontFamily: "'Lexend',sans-serif", opacity: mcRunning ? .5 : 1 }}>
                      {mcRunning ? '⚙️ Running…' : '▶ Run MC'}
                    </button>
                  </div>
                  {mcResult && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {/* Stat cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                        {[
                          { l: 'Success Rate', v: `${(mcResult.pSuccess * 100).toFixed(1)}%`, c: mcResult.pSuccess >= .8 ? '#4ade80' : '#f59e0b' },
                          { l: 'Mean n', v: mcResult.meanN.toFixed(2), c: 'var(--text)' },
                          { l: 'Median n', v: String(mcResult.medianN), c: '#a5b4fc' },
                          { l: 'P5–P95', v: `${mcResult.p5}–${mcResult.p95}`, c: '#fbbf24' },
                        ].map(({ l, v, c }) => (
                          <div key={l} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                            <div style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{l}</div>
                            <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace", color: c }}>{v}</div>
                          </div>
                        ))}
                      </div>
                      {/* Histogram */}
                      {(() => {
                        const keys = Object.keys(mcResult.histogram).map(Number).sort((a, b) => a - b);
                        const maxH = Math.max(...keys.map(k => mcResult.histogram[k]));
                        const baseN = result.status === 'solved' ? result.n! : 0;
                        return (
                          <div style={{ background: 'rgba(0,0,0,.15)', borderRadius: 8, padding: '10px 12px' }}>
                            <div style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
                              Distribution of n across {mcResult.trials.toLocaleString()} trials
                            </div>
                            <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 64 }}>
                              {keys.map(k => {
                                const cnt = mcResult.histogram[k];
                                const bh = Math.max(4, Math.round((cnt / maxH) * 56));
                                const isMedian = k === mcResult.medianN;
                                return (
                                  <div key={k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, minWidth: 18 }}
                                    title={`n=${k}: ${(cnt / mcResult.trials * 100).toFixed(1)}% (${cnt} trials)`}>
                                    <div style={{ width: '100%', height: bh,
                                      background: isMedian ? '#fbbf24' : k <= baseN ? 'rgba(99,102,241,.8)' : 'rgba(239,68,68,.6)',
                                      borderRadius: '3px 3px 0 0', minHeight: 4 }} />
                                    <div style={{ fontSize: 9, fontFamily: "'JetBrains Mono',monospace",
                                      color: isMedian ? '#fbbf24' : k <= baseN ? '#a5b4fc' : '#f87171', fontWeight: isMedian ? 900 : 400 }}>
                                      {k >= 9999 ? '∞' : k}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 9, color: 'var(--text-faint)', marginTop: 6 }}>
                              <span style={{ color: '#a5b4fc' }}>■ n ≤ deterministic</span>
                              <span style={{ color: '#f87171' }}>■ n &gt; deterministic (harder roll)</span>
                              <span style={{ color: '#fbbf24' }}>■ median</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Custom Pokémon Panel ─────────────────────────────────────────────────────
interface CustomPokeEntry {
  name: string;
  types: [string, string?];
  stats: PokeStat;
  moves: Array<{ name: string; type: string; cat: string; bp: number }>;
}

/** Register all custom entries with the engine so lookupPoke/search picks them up. */
function syncCustomPokemon(entries: CustomPokeEntry[]) {
  // Clear previous custom entries
  for (const n of getCustomPokemonNames()) removeCustomPokemon(n);
  for (const e of entries) {
    const data: PokeData = {
      name: e.name,
      types: e.types.filter(Boolean) as string[],
      stats: e.stats,
      bst: Object.values(e.stats).reduce((a,b)=>a+b,0),
      abilities: [],
      weaknesses: {},
    };
    const moves: MoveData[] = e.moves.map(m => ({ name:m.name, bp:m.bp, cat:m.cat, type:m.type }));
    injectCustomPokemon(data, moves);
  }
}

// ── Auto-Finder Panel ─────────────────────────────────────────────────────────
function AutoFinderPanel({ boss, bossBaseHP, onLoadCounters, sdState }: {
  boss: BossConfig;
  bossBaseHP: number;
  onLoadCounters: (slots: Partial<CounterSlot>[]) => void;
  sdState: string;
}) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<CandidateMetrics[]>([]);
  const [maxResults, setMaxResults] = useState(40);
  const [sortMetric, setSortMetric] = useState<SortMetric>('raiders');
  const [err, setErr] = useState('');
  const [loadN, setLoadN] = useState(6);
  const [mcRunning, setMcRunning] = useState(false);
  const [mcResult, setMcResult] = useState<SimResult|null>(null);

  if (!boss.data) return null;
  const inc = boss.hpIncreasePerRaider / 100;

  const runFind = async () => {
    if (!boss.data) return;
    setErr(''); setRunning(true); setResults([]); setProgress(0); setMcResult(null);
    try {
      const found = await runAutoFinder(boss, bossBaseHP, inc, boss.hpScalingMode, maxResults, setProgress, sortMetric);
      if (!found.length) setErr('No viable counters found — ensure boss Pokémon is set and data is loaded.');
      setResults(found);
    } catch(e: any) { setErr(String(e)); }
    finally { setRunning(false); setProgress(100); }
  };

  const doLoad = () => {
    const top = results.slice(0, loadN);
    onLoadCounters(top.map(r => ({ name:r.name, data:r.data, moveName:r.bestMove.name, moveData:r.bestMove })));
  };

  const runMCForTop = () => {
    if (!results.length || !boss.data) return;
    const slots: CounterSlot[] = results.slice(0, loadN).map(r => ({
      ...mkSlot(), name:r.name, data:r.data, moveName:r.bestMove.name, moveData:r.bestMove,
    }));
    setMcRunning(true); setMcResult(null);
    runMCViaWorker(boss, slots, bossBaseHP, 1000, 'uniform').then(res => {
      setMcResult(res); setMcRunning(false);
    });
  };

  const effColor = (e: number) => e >= 2 ? '#ef4444' : e >= 1 ? '#f59e0b' : '#6b7280';
  const rColor   = (r: number) => r <= 2 ? 'var(--success)' : r <= 5 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div style={{border:'1px solid rgba(139,92,246,.3)',borderRadius:12,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:'100%',padding:'11px 16px',background:'rgba(139,92,246,.07)',border:'none',
          cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:"'Lexend',sans-serif"}}>
        <span style={{fontSize:11,fontWeight:800,color:'#c4b5fd',textTransform:'uppercase',letterSpacing:'.09em',display:'flex',alignItems:'center',gap:8}}>
          🔍 Auto-Find Best Counters
          {results.length>0&&<span style={{fontSize:10,color:'var(--success)',fontWeight:600,textTransform:'none'}}>
            {' · '}{results.length} found — best needs {results[0]?.estRaiders} raider{results[0]?.estRaiders!==1?'s':''}
          </span>}
        </span>
        <span style={{color:'var(--text-faint)',fontSize:12}}>{open?'▲':'▼'}</span>
      </button>

      {open&&(
        <div style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div>
              <label style={LBL}>Max Results</label>
              <div style={{display:'flex',gap:4}}>
                {[20,40,80].map(n=>(
                  <button key={n} onClick={()=>setMaxResults(n)}
                    style={{padding:'5px 10px',borderRadius:6,border:'1px solid var(--border)',
                      background:maxResults===n?'rgba(139,92,246,.28)':'transparent',
                      color:maxResults===n?'#c4b5fd':'var(--text-muted)',cursor:'pointer',fontSize:12,
                      fontWeight:maxResults===n?700:400,fontFamily:"'Lexend',sans-serif"}}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={LBL}>Sort by</label>
              <select style={{...SEL,fontSize:11}} value={sortMetric} onChange={e=>setSortMetric(e.target.value as SortMetric)}>
                <option value="raiders">Min Raiders</option>
                <option value="damage">Max Damage</option>
                <option value="ohko">Lowest OHKO Risk</option>
                <option value="turns">Most Turns Survived</option>
              </select>
            </div>
            <button onClick={runFind} disabled={running||sdState!=='ready'}
              style={{padding:'8px 20px',background:'linear-gradient(135deg,#7c3aed,#4f46e5)',border:'none',
                borderRadius:8,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,
                fontFamily:"'Lexend',sans-serif",opacity:(running||sdState!=='ready')?.5:1}}>
              {running ? ('Scanning… ' + progress + '%') : '🔍 Find Counters'}
            </button>
          </div>

          {running&&(
            <div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
              <div style={{height:'100%',width:progress+'%',background:'linear-gradient(90deg,#7c3aed,#4f46e5)',
                transition:'width .1s',borderRadius:2}}/>
            </div>
          )}

          {err&&<div style={{color:'var(--danger)',fontSize:12,padding:'6px 10px',background:'var(--danger-subtle)',borderRadius:6}}>{err}</div>}

          {results.length>0&&(<>
            <div style={{background:'rgba(0,0,0,.18)',borderRadius:9,overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid var(--border)'}}>
                      {(['#','Pokémon','Best Move','Eff','Hit%','Total%','OHKO Risk','Turns','Est. Raiders'] as const).map(h=>(
                        <th key={h} style={{padding:'6px 8px',textAlign:'center',color:'var(--text-faint)',
                          fontWeight:700,fontSize:10,textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r,i)=>(
                      <tr key={r.name} style={{borderBottom:'1px solid rgba(255,255,255,.04)',
                        background:i<loadN?'rgba(139,92,246,.05)':'transparent'}}>
                        <td style={{padding:'5px 8px',textAlign:'center',color:'var(--text-faint)',fontSize:10}}>{i+1}</td>
                        <td style={{padding:'5px 8px',fontWeight:700,color:'var(--text)',whiteSpace:'nowrap'}}>
                          <div style={{display:'flex',alignItems:'center',gap:5}}>
                            {i<loadN&&<span style={{fontSize:8,color:'#c4b5fd',fontWeight:900}}>✓</span>}
                            {r.name}
                          </div>
                          <div style={{display:'flex',gap:3,marginTop:2}}>
                            {r.data.types.map(t=><TypeBadge key={t} t={t}/>)}
                          </div>
                        </td>
                        <td style={{padding:'5px 8px',whiteSpace:'nowrap'}}>
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <TypeBadge t={r.bestMove.type}/>
                            <span style={{color:'var(--text-muted)'}}>{r.bestMove.name}</span>
                            <span style={{color:'var(--text-faint)',fontSize:10}}>BP{r.bestMove.bp}</span>
                          </div>
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center'}}>
                          <span style={{fontWeight:800,color:effColor(r.eff),fontSize:12}}>{r.eff}×</span>
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",
                          color:r.avgDmgPct>=10?'var(--success)':r.avgDmgPct>=3?'var(--warning)':'var(--danger)'}}>
                          {r.avgDmgPct.toFixed(1)}%
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center'}}>
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <div style={{flex:1,height:4,background:'rgba(255,255,255,.07)',borderRadius:2,overflow:'hidden',minWidth:36}}>
                              <div style={{width:Math.min(100,r.avgTotalPct)+'%',height:'100%',borderRadius:2,
                                background:r.avgTotalPct>=50?'var(--success)':r.avgTotalPct>=20?'var(--warning)':'var(--danger)'}}/>
                            </div>
                            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'var(--text-muted)',minWidth:36}}>
                              {r.avgTotalPct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center'}}>
                          <span style={{padding:'2px 7px',borderRadius:4,fontSize:10,fontWeight:700,
                            background:r.ohkoRisk>=.5?'var(--danger-subtle)':r.ohkoRisk>=.2?'var(--warning-subtle)':'var(--success-subtle)',
                            color:r.ohkoRisk>=.5?'var(--danger)':r.ohkoRisk>=.2?'var(--warning)':'var(--success)'}}>
                            {(r.ohkoRisk*100).toFixed(0)}%
                          </span>
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'#a5b4fc'}}>
                          {r.turnsSurvived >= 99 ? '∞' : r.turnsSurvived}
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center'}}>
                          <span style={{fontSize:14,fontWeight:900,fontFamily:"'JetBrains Mono',monospace",color:rColor(r.estRaiders)}}>
                            {r.estRaiders >= 99 ? '99+' : r.estRaiders}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',padding:'10px 12px',
              background:'rgba(139,92,246,.06)',borderRadius:9,border:'1px solid rgba(139,92,246,.15)'}}>
              <div>
                <label style={LBL}>Load top N as counter slots</label>
                <div style={{display:'flex',gap:4}}>
                  {[3,6,10,18].map(n=>(
                    <button key={n} onClick={()=>setLoadN(n)}
                      style={{padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',
                        background:loadN===n?'rgba(139,92,246,.3)':'transparent',
                        color:loadN===n?'#c4b5fd':'var(--text-muted)',cursor:'pointer',
                        fontSize:12,fontWeight:loadN===n?700:400,fontFamily:"'Lexend',sans-serif"}}>{n}</button>
                  ))}
                </div>
              </div>
              <button onClick={doLoad}
                style={{padding:'8px 18px',background:'rgba(139,92,246,.9)',border:'none',borderRadius:8,
                  color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:"'Lexend',sans-serif"}}>
                📥 Load Top {loadN}
              </button>
              <button onClick={runMCForTop} disabled={mcRunning}
                style={{padding:'8px 18px',background:'rgba(99,102,241,.18)',border:'1px solid rgba(99,102,241,.35)',
                  borderRadius:8,color:'#a5b4fc',cursor:'pointer',fontSize:13,fontWeight:700,
                  fontFamily:"'Lexend',sans-serif",opacity:mcRunning?.5:1}}>
                {mcRunning ? 'Running MC…' : ('🎲 MC-Validate Top ' + loadN)}
              </button>
            </div>

            {mcResult&&(
              <div style={{padding:'12px 16px',borderRadius:10,
                background:winRateBg(mcResult.pWin),
                border:`1px solid ${winRateBorder(mcResult.pWin)}`}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:5,color:winRateColor(mcResult.pWin)}}>
                  {mcResult.pWin>=.8?'✅ Strong team — recommended!'
                    :'⚠️ '+(mcResult.pWin>=.5?'Borderline — try more raiders or a different set'
                      :'High risk — increase raiders or pick stronger counters')}
                </div>
                <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.7}}>
                  Win rate: <strong style={{color:'var(--text)'}}>{(mcResult.pWin*100).toFixed(1)}%</strong> over 1,000 MC trials.{' '}
                  Avg counters needed: <strong style={{color:'var(--text)'}}>{mcResult.mean.toFixed(1)}</strong>.{' '}
                  Analytical estimate: <strong style={{color:'#c4b5fd'}}>{results[0]?.estRaiders} raider{results[0]?.estRaiders!==1?'s':''}</strong>.
                </div>
              </div>
            )}

            <div style={{fontSize:10,color:'var(--text-faint)'}}>
              Evaluated at Lv 100, default EVs/IVs, Hardy nature. Searches full learnset (all generations).
              Sorted by estimated min raiders ↑ then total damage ↓. ✓ rows = will be loaded.
            </div>
          </>)}
        </div>
      )}
    </div>
  );
}

// ── Counter Row ───────────────────────────────────────────────────────────────
function CounterRow({ slot, onChange, onRemove, rank }: {
  slot:CounterSlot; onChange:(id:number,p:Partial<CounterSlot>)=>void; onRemove:(id:number)=>void; rank:number|null;
}) {
  const r = slot.result;
  const upd = (p:Partial<CounterSlot>) => onChange(slot.id, p);
  const evTotal = Object.values(slot.evs).reduce((a,b)=>a+b,0);
  const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':null;
  const borderColor = !r ? 'var(--border)'
    : r.immune ? 'rgba(107,114,128,.4)'
    : r.ohko||r.possibleOhko ? 'rgba(237,66,69,.5)'
    : r.twoHko||r.maxP>=50    ? 'rgba(250,168,26,.45)'
    : 'rgba(59,165,93,.35)';

  return (
    <div style={{border:`1px solid ${borderColor}`,borderRadius:11,padding:13,display:'flex',flexDirection:'column',gap:9,background:'rgba(255,255,255,.015)',transition:'border-color .2s'}}>
      {/* Row 1: poke + move + nature + tera + flags */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:14,minWidth:22,textAlign:'center',flexShrink:0}}>
          {medal || <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:700}}>#{slot.id}</span>}
        </span>
        <div style={{flex:'1 1 140px'}}><AutoInput label="" value={slot.name} searchFn={searchPokemonWithCustom} onChange={v=>{const d=lookupPokeWithCustom(v);upd({name:v,data:d,result:null,error:''});}} placeholder="Attacker Pokémon…"/></div>
        <div style={{flex:'1 1 140px'}}><AutoInput label="" value={slot.moveName} searchFn={searchMovesWithCustom} onChange={v=>{const mv=lookupMoveWithCustom(v);upd({moveName:v,moveData:mv,result:null,error:''});}} placeholder="Move…"/></div>
        <select style={{...SEL,width:'auto',minWidth:100,fontSize:11}} value={slot.nature} onChange={e=>upd({nature:e.target.value,result:null})}>{Object.keys(NATURES).map(n=><option key={n}>{n}</option>)}</select>
        <select style={{...SEL,width:'auto',minWidth:90,fontSize:11}} value={slot.teraType} onChange={e=>upd({teraType:e.target.value,result:null})}><option value="">No Tera</option>{ALL_TYPES.map(t=><option key={t}>{t}</option>)}</select>
        <label style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'var(--text-muted)',cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={slot.isCrit} onChange={e=>upd({isCrit:e.target.checked,result:null})}/> Crit</label>
        <label style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'var(--text-muted)',cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={slot.zmove} onChange={e=>upd({zmove:e.target.checked,result:null})}/> Z</label>
        <div style={{display:'flex',alignItems:'center',gap:3,flexShrink:0}} title="Number of copies of this Pokémon in the team">
          <span style={{fontSize:10,color:'var(--text-faint)',fontWeight:700}}>×</span>
          <input type="number" min={1} max={30} value={slot.count ?? 1}
            onChange={e=>upd({count:Math.max(1,Math.min(30,parseInt(e.target.value)||1)),result:null})}
            style={{...NUM,width:42,fontSize:12}}/>
        </div>
        <button onClick={()=>onRemove(slot.id)} style={{background:'rgba(237,66,69,.12)',border:'1px solid rgba(237,66,69,.25)',color:'var(--danger)',borderRadius:5,padding:'3px 8px',cursor:'pointer',fontSize:11,fontWeight:700}}>✕</button>
      </div>
      {/* Row 2: level + EVs */}
      <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:700}}>LV</span>
        <input style={{...NUM,width:48,fontSize:12}} type="number" min={1} max={100} value={slot.level} onChange={e=>upd({level:parseInt(e.target.value)||100,result:null})}/>
        {STAT_ORDER.map(([k,l])=>(
          <div key={k} style={{display:'flex',alignItems:'center',gap:2}}>
            <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:700,minWidth:22,textAlign:'right'}}>{l}</span>
            <input style={{...NUM,width:44,fontSize:12}} type="number" min={0} max={252} value={slot.evs[k]} onChange={e=>upd({evs:{...slot.evs,[k]:Math.max(0,Math.min(252,parseInt(e.target.value)||0))},result:null})}/>
          </div>
        ))}
        <span style={{fontSize:9,color:evTotal>510?'var(--danger)':'var(--text-faint)'}}>({evTotal}/510)</span>
      </div>
      {/* Simple mode: avg damage per fight + shadow */}
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',padding:'6px 10px',
        background:'rgba(251,191,36,.04)',borderRadius:7,border:'1px solid rgba(251,191,36,.1)'}}>
        <span style={{fontSize:9,fontWeight:700,color:'#fbbf24',textTransform:'uppercase',letterSpacing:'.06em',whiteSpace:'nowrap'}}>⚡ Min-Raiders</span>
        <div style={{display:'flex',alignItems:'center',gap:3}}>
          <label style={{...LBL,marginBottom:0,fontSize:9}}>Avg Dmg/Fight</label>
          <input type="number" min={0} style={{...NUM,width:90,fontSize:12}}
            placeholder="0" value={slot.avgDamagePerFight || ''}
            onChange={e=>upd({avgDamagePerFight:Math.max(0,Number(e.target.value))})}/>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'#22d3ee',cursor:'pointer',whiteSpace:'nowrap'}}>
          <input type="checkbox" checked={slot.isShadow||false} onChange={e=>upd({isShadow:e.target.checked})}/>
          <span style={{fontWeight:slot.isShadow?700:400}}>Shadow ×mult</span>
        </label>
        <label style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'var(--text-muted)',cursor:'pointer',whiteSpace:'nowrap'}}>
          <input type="checkbox" checked={slot.activeInSimple!==false} onChange={e=>upd({activeInSimple:e.target.checked})}/>
          Active
        </label>
      </div>
      {/* Move info */}
      {slot.moveData && (
        <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
          <TypeBadge t={slot.moveData.type}/>
          <span style={{fontSize:10,color:'var(--text-muted)'}}>{slot.moveData.cat}</span>
          <span style={{fontSize:10,color:'var(--text-muted)'}}>BP {slot.moveData.bp}{slot.zmove?` → Z:${_zPower(slot.moveData.bp)}`:''}</span>
        </div>
      )}
      {slot.error && <div style={{fontSize:11,color:'var(--danger)',background:'var(--danger-subtle)',borderRadius:5,padding:'4px 8px'}}>{slot.error}</div>}
      {/* Result */}
      {r&&!r.immune&&(
        <div style={{background:'rgba(0,0,0,.28)',borderRadius:9,padding:'10px 13px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
            <span style={{fontSize:22,fontWeight:900,color:'#fff',fontFamily:"'JetBrains Mono',monospace",letterSpacing:'-.02em'}}>{r.minP.toFixed(1)}%–{r.maxP.toFixed(1)}%</span>
            <span style={{fontSize:14,fontWeight:800,color:r.ohko||r.possibleOhko?'var(--danger)':r.twoHko||r.maxP>=50?'var(--warning)':'var(--success)'}}>
              {r.ohko?'OHKO':r.possibleOhko?'Poss. OHKO':r.twoHko?'2HKO':r.maxP>=50?'Poss. 2HKO':`${r.hitsToKo[0]}HKO`}
            </span>
          </div>
          <div style={{height:9,background:'rgba(255,255,255,.07)',borderRadius:5,overflow:'hidden',position:'relative',marginBottom:5}}>
            <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,r.minP)}%`,background:r.maxP>=100?'var(--danger)':r.maxP>=50?'var(--warning)':'var(--primary)',opacity:.4,borderRadius:5}}/>
            <div style={{position:'absolute',left:`${Math.min(100,r.minP)}%`,top:0,bottom:0,width:`${Math.max(0,Math.min(100,r.maxP)-Math.min(100,r.minP))}%`,background:r.maxP>=100?'var(--danger)':r.maxP>=50?'var(--warning)':'var(--primary)',borderRadius:5}}/>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',fontSize:11,color:'var(--text-muted)'}}>
            <span><strong style={{color:'var(--text)'}}>{r.minD}–{r.maxD}</strong> / <strong style={{color:'var(--text)'}}>{r.defHp}</strong> HP</span>
            {r.eff!=null&&r.eff!==1&&<span style={{color:r.eff>1?'var(--warning)':'var(--success)',fontWeight:700}}>{r.eff}× type</span>}
            {r.stab&&<span style={{color:'#818cf8',fontWeight:700}}>STAB</span>}
          </div>
        </div>
      )}
      {r?.immune&&<div style={{fontSize:11,color:'var(--text-muted)',fontStyle:'italic'}}>🛡 Immune to {slot.moveData?.type}</div>}
    </div>
  );
}

// ── Boss Sim Table ────────────────────────────────────────────────────────────
function BossSimPanel({ boss, counters }: { boss:BossConfig; counters:CounterSlot[] }) {
  const [open, setOpen] = useState(false);
  const bossData = boss.data; if (!bossData) return null;
  const bossMoves = (boss.customMoves?.length ? boss.customMoves : getLevelUpMoves(boss.name)); if (!bossMoves.length) return null;
  const raidMult = RAID_TIERS[boss.raidTier]??1;
  const bossFake: PokeData = {...bossData, stats:{...bossData.stats, hp:Math.round(bossData.stats.hp*raidMult)}};
  const bossTypes = boss.teraType ? [boss.teraType] : bossData.types;
  const validCounters = counters.filter(c=>c.data||lookupPoke(c.name));

  const simRows = !open ? [] : bossMoves.map(mv => ({
    mv,
    cols: validCounters.map(slot => {
      const cData=slot.data||lookupPokeWithCustom(slot.name); if (!cData) return null;
      const res=runCalc({atkPoke:bossFake,defPoke:cData,bp:mv.bp,cat:mv.cat,mtyp:mv.type,
        atkEvs:boss.evs,defEvs:slot.evs,atkIvs:boss.ivs,defIvs:slot.ivs,
        atkNat:boss.nature,defNat:slot.nature,atkTera:boss.teraType,defTera:slot.teraType,
        atkItem:'(none)',atkStatus:'Healthy',weather:boss.weather,doubles:boss.doubles,
        atkScreen:boss.defScreen,defScreen:false,isCrit:false,zmove:false,
        atkLv:boss.level||100,defLv:slot.level||100});
      if (!res||res.immune) return {immune:true,minP:0,maxP:0,hitsToKo:[0,0] as [number,number]};
      const dh=res.defHp||1;
      const minP=Math.floor((res.minD??0)/dh*1000)/10;
      const maxP=Math.floor((res.maxD??0)/dh*1000)/10;
      return {...res,minP,maxP,hitsToKo:[(res.maxD??0)?Math.ceil(dh/(res.maxD??1)):99,(res.minD??0)?Math.ceil(dh/(res.minD??1)):99] as [number,number]};
    }),
  }));

  return (
    <div style={{border:'1px solid rgba(124,58,237,.28)',borderRadius:12,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',padding:'11px 16px',background:'rgba(124,58,237,.07)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:"'Lexend',sans-serif"}}>
        <span style={{fontSize:11,fontWeight:800,color:'#c4b5fd',textTransform:'uppercase',letterSpacing:'.09em',display:'flex',alignItems:'center',gap:8}}>
          🎯 Boss Simulation
          <span style={{fontSize:10,color:'var(--text-muted)',fontWeight:400,textTransform:'none'}}>— {bossData.name}'s moves vs your counters</span>
        </span>
        <span style={{color:'var(--text-faint)',fontSize:12}}>{open?'▲':'▼'}</span>
      </button>
      {open && (
        <div style={{padding:'0 14px 14px'}}>
          {!validCounters.length ? (
            <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:12,padding:16}}>Add at least one counter Pokémon above.</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead>
                  <tr>
                    <th style={{textAlign:'left',padding:'5px 8px',color:'var(--text-muted)',fontWeight:700,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',minWidth:160}}>Boss Move</th>
                    {validCounters.map(s=>(
                      <th key={s.id} style={{textAlign:'center',padding:'5px 8px',color:'var(--text)',fontWeight:700,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',minWidth:100}}>
                        {s.name||'?'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simRows.map(({mv,cols},ri)=>(
                    <tr key={ri} style={{background:ri%2===0?'rgba(255,255,255,.015)':'transparent'}}>
                      <td style={{padding:'6px 8px',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                        <div style={{display:'flex',alignItems:'center',gap:5}}>
                          <TypeBadge t={mv.type}/>
                          <span style={{color:'var(--text)',fontWeight:600}}>{mv.name}</span>
                          {bossTypes.includes(mv.type)&&<span style={{fontSize:9,color:'#818cf8',fontWeight:700,background:'rgba(129,140,248,.15)',border:'1px solid rgba(129,140,248,.25)',borderRadius:3,padding:'1px 4px'}}>STAB</span>}
                          <span style={{fontSize:10,color:'var(--text-faint)'}}>BP {mv.bp}</span>
                        </div>
                      </td>
                      {cols.map((c:any,ci:number)=>(
                        <td key={ci} style={{padding:'6px 8px',textAlign:'center',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                          {c===null?<span style={{color:'var(--text-faint)'}}>—</span>
                          :c.immune?<span style={{fontSize:10,color:'var(--text-muted)'}}>🛡 Immune</span>:(
                            <div>
                              <div style={{fontSize:13,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",
                                color:c.maxP>=100?'var(--danger)':c.maxP>=50?'var(--warning)':c.maxP>=25?'#fbbf24':'var(--success)'}}>
                                {c.minP.toFixed(0)}–{c.maxP.toFixed(0)}%
                              </div>
                              <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700}}>
                                {c.maxP>=100?'OHKO':c.maxP>=50?'2HKO':`${c.hitsToKo[0]}HKO`}
                              </div>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Monte-Carlo Panel ─────────────────────────────────────────────────────────
function MCPanel({ boss, counters, bossHP, sdState }: {
  boss:BossConfig; counters:CounterSlot[]; bossHP:number; sdState:string;
}) {
  const [open, setOpen]     = useState(false);
  const [trials, setTrials] = useState(2000);
  const [policy, setPolicy] = useState<'uniform'|'bpweighted'|'cyclic'|'custom'>('bpweighted');
  const [result, setResult] = useState<SimResult|null>(null);
  const [running, setRun]   = useState(false);
  const [err, setErr]       = useState('');
  const [moveWeights, setMoveWeights] = useState<Record<string,number>>({});
  const [viewMode, setViewMode] = useState<'raiders'|'pokemon'|'chart'>('raiders');
  if (!boss.data) return null;

  const valid = counters.filter(c=>c.name&&c.moveName);
  const bm = boss.customMoves?.length ? boss.customMoves : getLevelUpMoves(boss.name);
  const teamSz = Math.max(1, boss.teamSize ?? 6);
  const numRaiders = Math.max(1, boss.numRaiders ?? 1);

  const getWeightsArray = () => bm.map(mv => {
    const w = moveWeights[mv.name];
    return (w !== undefined && w >= 0) ? w : mv.bp;
  });

  const run = async () => {
    if (!valid.length) { setErr('Add at least one complete counter slot.'); return; }
    if (!bm.length)    { setErr(`No moves found for ${boss.data!.name}. Add custom moves above.`); return; }
    setErr(''); setRun(true); setResult(null);
    const wts = (policy==='custom') ? getWeightsArray() : undefined;
    const res = await runMCViaWorker(boss, counters, bossHP, trials, policy, wts);
    setResult(res);
    setRun(false);
    // Auto-switch to best view
    if (numRaiders > 1) setViewMode('raiders');
  };

  const maxH = result ? Math.max(...(Object.values(result.hist) as number[])) : 1;
  const hkeys = result ? Object.keys(result.hist).map(Number).sort((a,b)=>a-b) : [];

  // Build per-raider data from perSlot
  const raiderData = result ? Array.from({length:numRaiders},(_,r)=>{
    const slots = result.perSlot.slice(r*teamSz, (r+1)*teamSz);
    const totalDmgPct = slots.reduce((a,s)=>a+s.avgDd/bossHP*100,0);
    const avgOhko = slots.length ? slots.reduce((a,s)=>a+s.ohko,0)/slots.length : 0;
    const totalHits = slots.reduce((a,s)=>a+s.avgHd,0);
    return {r, slots, totalDmgPct, avgOhko, totalHits};
  }) : [];

  const winColor = winRateColor;
  const winBg    = winRateBg;
  const winBdr   = winRateBorder;
  const dmgColor = (p:number) => p>=40?'var(--danger)':p>=15?'var(--warning)':'var(--success)';
  const ohkoColor = ohkoRiskColor;

  return (
    <div style={{border:'1px solid rgba(99,102,241,.3)',borderRadius:12,overflow:'hidden'}}>
      {/* Header */}
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',padding:'11px 16px',background:'rgba(99,102,241,.07)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:"'Lexend',sans-serif"}}>
        <span style={{fontSize:11,fontWeight:800,color:'#a5b4fc',textTransform:'uppercase',letterSpacing:'.09em',display:'flex',alignItems:'center',gap:8}}>
          🎲 Monte-Carlo Simulation
          {result&&<span style={{fontWeight:600,textTransform:'none',fontSize:11,
            color:winColor(result.pWin),background:winBg(result.pWin),padding:'2px 8px',borderRadius:6,border:`1px solid ${winBdr(result.pWin)}`}}>
            {(result.pWin*100).toFixed(0)}% win · avg {result.mean.toFixed(1)} Pokémon used
          </span>}
        </span>
        <span style={{color:'var(--text-faint)',fontSize:12}}>{open?'▲':'▼'}</span>
      </button>

      {open&&(
        <div style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>

          {/* ── Controls ─────────────────────────────────────────────── */}
          <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'flex-start',
            padding:'12px 14px',background:'rgba(255,255,255,.03)',borderRadius:9,border:'1px solid rgba(255,255,255,.06)'}}>

            {/* Trials */}
            <div>
              <label style={LBL}>Simulation Trials</label>
              <div style={{display:'flex',gap:4}}>
                {[500,2000,5000,10000].map(n=>(
                  <button key={n} onClick={()=>setTrials(n)} style={{padding:'5px 10px',borderRadius:6,
                    border:'1px solid var(--border)',
                    background:trials===n?'rgba(99,102,241,.3)':'transparent',
                    color:trials===n?'#a5b4fc':'var(--text-muted)',cursor:'pointer',fontSize:11,
                    fontWeight:trials===n?700:400,fontFamily:"'Lexend',sans-serif"}}>
                    {n >= 1000 ? (n/1000)+'k' : n}
                  </button>
                ))}
              </div>
            </div>

            {/* Policy */}
            <div style={{flex:1,minWidth:220}}>
              <label style={LBL}>Boss Move Selection Policy</label>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {([
                  {id:'uniform',    label:'Uniform',    tip:'All moves equally likely each turn'},
                  {id:'bpweighted', label:'BP-Weighted', tip:'Higher BP moves used more often'},
                  {id:'cyclic',     label:'Cyclic',      tip:'Boss rotates through moves in fixed order'},
                  {id:'custom',     label:'Custom',      tip:'You set the probability weight for each move'},
                ] as const).map(p=>(
                  <button key={p.id} onClick={()=>setPolicy(p.id)} title={p.tip}
                    style={{padding:'5px 11px',borderRadius:6,border:'1px solid var(--border)',
                      background:policy===p.id?'rgba(99,102,241,.3)':'transparent',
                      color:policy===p.id?'#a5b4fc':'var(--text-muted)',cursor:'pointer',fontSize:11,
                      fontWeight:policy===p.id?700:400,fontFamily:"'Lexend',sans-serif"}}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div style={{fontSize:10,color:'var(--text-faint)',marginTop:4}}>
                {policy==='uniform'    && '⚖️ Each of the boss\'s moves has an equal chance of being used each turn.'}
                {policy==='bpweighted' && '💪 Moves with higher base power are selected more often — simulates aggressive boss AI.'}
                {policy==='cyclic'     && '🔄 Boss uses its moves in strict rotation — ideal for scripted or raid-style bosses.'}
                {policy==='custom'     && '🎛️ Set individual weights below. Higher weight = selected more often.'}
              </div>
              {policy==='custom'&&bm.length>0&&(
                <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:4,
                  background:'rgba(0,0,0,.2)',borderRadius:8,padding:'8px 10px'}}>
                  {bm.map(mv=>(
                    <div key={mv.name} style={{display:'flex',alignItems:'center',gap:8}}>
                      <TypeBadge t={mv.type}/>
                      <span style={{fontSize:11,color:'var(--text-muted)',flex:1}}>{mv.name} <span style={{color:'var(--text-faint)'}}>BP{mv.bp}</span></span>
                      <input type="number" min={0} max={100} style={{...INP,width:60,padding:'3px 6px'}}
                        value={moveWeights[mv.name]??mv.bp}
                        onChange={e=>setMoveWeights(prev=>({...prev,[mv.name]:Math.max(0,Number(e.target.value))}))}/>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{display:'flex',flexDirection:'column',gap:6,justifyContent:'flex-end'}}>
              <button className="btn btn-primary" onClick={run} disabled={running||sdState!=='ready'}
                style={{opacity:(running||sdState!=='ready')?.5:1,padding:'9px 22px',fontSize:13}}>
                {running ? '⚙️ Running…' : '▶ Run Simulation'}
              </button>
              {result&&(
                <div style={{fontSize:10,color:'var(--text-faint)',textAlign:'center'}}>
                  {result.trials.toLocaleString()} trials · {bm.length} boss move{bm.length!==1?'s':''}
                </div>
              )}
            </div>
          </div>

          {err&&<div style={{color:'var(--danger)',fontSize:12,padding:'7px 12px',background:'var(--danger-subtle)',borderRadius:7}}>{err}</div>}

          {result&&(
            <div style={{display:'flex',flexDirection:'column',gap:12}}>

              {/* ── Verdict banner ─────────────────────────────────────── */}
              <div style={{background:winBg(result.pWin),border:`1px solid ${winBdr(result.pWin)}`,borderRadius:10,padding:'13px 16px'}}>
                <div style={{fontSize:13,fontWeight:700,color:winColor(result.pWin),marginBottom:5}}>
                  {result.pWin>=.8 ? '✅ Strong team composition'
                    : result.pWin>=.5 ? '⚠️ Borderline — may need adjustments'
                    : '❌ High risk — team likely insufficient'}
                </div>
                <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.8}}>
                  <strong style={{color:'var(--text)'}}>{(result.pWin*100).toFixed(1)}%</strong> win rate over{' '}
                  <strong style={{color:'var(--text)'}}>{result.trials.toLocaleString()}</strong> simulated raids.
                  {numRaiders>1 && <> Across <strong style={{color:'#c4b5fd'}}>{numRaiders} raider teams</strong> of up to <strong style={{color:'#c4b5fd'}}>{teamSz} Pokémon</strong> each.</>}
                  {' '}Average Pokémon used per raid: <strong style={{color:'var(--text)'}}>{result.mean.toFixed(1)}</strong>.
                  {result.p90<=counters.length
                    ? <> Even in the worst 10% of runs, only <strong style={{color:'var(--text)'}}>{result.p90}</strong> Pokémon needed.</>
                    : <span style={{color:'var(--warning)'}}> Warning: worst 10% may exceed your {counters.length} available slots.</span>
                  }
                </div>
              </div>

              {/* ── Stat cards ─────────────────────────────────────────── */}
              {(()=>{
                const n=result.trials,p=result.pWin,z=1.96;
                const centre=(p+z*z/(2*n))/(1+z*z/n);
                const margin=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n);
                const lo=Math.max(0,centre-margin),hi=Math.min(1,centre+margin);
                return(
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
                    {[
                      {l:'Win Rate',     v:`${(result.pWin*100).toFixed(1)}%`, sub:`±${((hi-lo)/2*100).toFixed(1)}%`, c:winColor(result.pWin), tip:`95% CI: ${(lo*100).toFixed(1)}%–${(hi*100).toFixed(1)}%`},
                      {l:'Avg Pokémon',  v:result.mean.toFixed(2),             sub:null, c:'var(--text)',  tip:'Avg Pokémon slots consumed'},
                      {l:'Median',       v:result.median.toString(),            sub:null, c:'#a5b4fc',     tip:'Most common count needed'},
                      {l:'Worst 10%',    v:result.p90>counters.length?`>${counters.length}`:result.p90.toString(), sub:null, c:'var(--warning)', tip:'P90 — count needed in unlucky runs'},
                    ].map(({l,v,sub,c,tip})=>(
                      <div key={l} title={tip} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 12px',textAlign:'center',cursor:'help'}}>
                        <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>{l}</div>
                        <div style={{fontSize:22,fontWeight:900,fontFamily:"'JetBrains Mono',monospace",color:c}}>{v}</div>
                        {sub&&<div style={{fontSize:9,color:'var(--text-faint)',fontFamily:"'JetBrains Mono',monospace",marginTop:1}}>{sub} 95% CI</div>}
                        <div style={{fontSize:9,color:'var(--text-faint)',marginTop:sub?1:4,lineHeight:1.3}}>{tip}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* ── View mode tabs ─────────────────────────────────────── */}
              <div style={{display:'flex',gap:4,borderBottom:'1px solid rgba(255,255,255,.07)',paddingBottom:8}}>
                {(numRaiders>1?[
                  {id:'raiders',label:`👥 Raider Teams (${numRaiders})`},
                  {id:'pokemon',label:'🐾 Per-Pokémon'},
                  {id:'chart',  label:'📊 Distribution Chart'},
                ]:[
                  {id:'pokemon',label:'🐾 Per-Pokémon'},
                  {id:'chart',  label:'📊 Distribution Chart'},
                ] as const).map((v:any)=>(
                  <button key={v.id} onClick={()=>setViewMode(v.id as any)}
                    style={{padding:'6px 14px',borderRadius:'6px 6px 0 0',border:'1px solid var(--border)',
                      borderBottom:viewMode===v.id?'2px solid #818cf8':'1px solid transparent',
                      background:viewMode===v.id?'rgba(99,102,241,.12)':'transparent',
                      color:viewMode===v.id?'#a5b4fc':'var(--text-muted)',cursor:'pointer',
                      fontSize:11,fontWeight:viewMode===v.id?700:400,fontFamily:"'Lexend',sans-serif"}}>
                    {v.label}
                  </button>
                ))}
              </div>

              {/* ── Raiders view ───────────────────────────────────────── */}
              {viewMode==='raiders'&&numRaiders>1&&(
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  {raiderData.map(({r,slots,totalDmgPct,avgOhko,totalHits})=>{
                    const canSolo = totalDmgPct >= 100;
                    const likelySolo = totalDmgPct >= 60;
                    const bdrColor = canSolo?'rgba(59,165,93,.4)':likelySolo?'rgba(250,168,26,.3)':'rgba(237,66,69,.25)';
                    return(
                      <div key={r} style={{background:'rgba(0,0,0,.18)',borderRadius:10,
                        border:`1px solid ${bdrColor}`,overflow:'hidden'}}>
                        {/* Raider header */}
                        <div style={{padding:'10px 14px',background:'rgba(255,255,255,.03)',
                          borderBottom:'1px solid rgba(255,255,255,.06)',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                          <span style={{fontSize:13,fontWeight:800,color:'#c4b5fd'}}>
                            {r===0?'🥇':r===1?'🥈':r===2?'🥉':'👤'} Raider {r+1}
                          </span>
                          <span style={{fontSize:10,color:'var(--text-faint)'}}>{slots.length} Pokémon</span>
                          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                            <span style={{fontSize:11,fontWeight:700,padding:'3px 9px',borderRadius:6,
                              background:canSolo?'rgba(59,165,93,.15)':likelySolo?'rgba(250,168,26,.15)':'rgba(237,66,69,.12)',
                              color:canSolo?'var(--success)':likelySolo?'var(--warning)':'var(--danger)'}}>
                              {canSolo?'✅ Can solo':likelySolo?'⚠️ Needs support':'❌ Insufficient'}
                            </span>
                            <span style={{fontSize:13,fontWeight:900,fontFamily:"'JetBrains Mono',monospace",
                              color:dmgColor(totalDmgPct)}}>
                              {totalDmgPct.toFixed(1)}% dealt
                            </span>
                          </div>
                        </div>

                        {/* Damage bar for this team */}
                        <div style={{padding:'8px 14px',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                          <div style={{height:8,background:'rgba(255,255,255,.07)',borderRadius:4,overflow:'hidden',position:'relative'}}>
                            <div style={{position:'absolute',left:0,top:0,bottom:0,
                              width:`${Math.min(100,totalDmgPct)}%`,
                              background:`linear-gradient(90deg,${canSolo?'#22c55e,#4ade80':likelySolo?'#f59e0b,#fbbf24':'#ef4444,#f87171'})`,
                              borderRadius:4,transition:'width .4s'}}/>
                            <div style={{position:'absolute',right:0,top:0,bottom:0,width:2,
                              background:'rgba(255,255,255,.25)',borderRadius:2}}
                              title="100% boss HP"/>
                          </div>
                        </div>

                        {/* Slot table */}
                        <div style={{padding:'8px 14px'}}>
                          <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                            <thead>
                              <tr style={{borderBottom:'1px solid rgba(255,255,255,.05)'}}>
                                {['#','Pokémon','Move','Hits Dealt','Dmg %','OHKO Risk','Hits Taken'].map(h=>(
                                  <th key={h} style={{padding:'3px 6px',textAlign:'center',color:'var(--text-faint)',
                                    fontSize:9,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {slots.map((s,si)=>{
                                const pct=s.avgDd/bossHP*100;
                                const cSlot=counters[r*teamSz+si];
                                return(
                                  <tr key={si} style={{borderBottom:'1px solid rgba(255,255,255,.03)',
                                    opacity:s.avgHd===0&&s.avgDd===0?.45:1}}>
                                    <td style={{padding:'5px 6px',textAlign:'center',color:'var(--text-faint)',fontSize:10}}>{si+1}</td>
                                    <td style={{padding:'5px 6px',fontWeight:700,color:'var(--text)'}}>
                                      <div style={{display:'flex',alignItems:'center',gap:5}}>
                                        {s.name}
                                        {cSlot&&cSlot.moveData&&<TypeBadge t={cSlot.moveData.type}/>}
                                      </div>
                                    </td>
                                    <td style={{padding:'5px 6px',textAlign:'center',color:'var(--text-muted)',whiteSpace:'nowrap'}}>{cSlot?.moveName||'—'}</td>
                                    <td style={{padding:'5px 6px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'var(--success)',fontWeight:700}}>{s.avgHd.toFixed(1)}</td>
                                    <td style={{padding:'5px 6px',textAlign:'center'}}>
                                      <div style={{display:'flex',alignItems:'center',gap:4,justifyContent:'center'}}>
                                        <div style={{width:44,height:4,background:'rgba(255,255,255,.07)',borderRadius:2,overflow:'hidden'}}>
                                          <div style={{width:`${Math.min(100,pct*4)}%`,height:'100%',
                                            background:pct>=25?'var(--danger)':pct>=10?'var(--warning)':'var(--success)',borderRadius:2}}/>
                                        </div>
                                        <span style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:'var(--text-muted)',minWidth:36}}>{pct.toFixed(1)}%</span>
                                      </div>
                                    </td>
                                    <td style={{padding:'5px 6px',textAlign:'center'}}>
                                      <span style={{padding:'2px 7px',borderRadius:4,fontSize:10,fontWeight:700,
                                        background:s.ohko>=.5?'var(--danger-subtle)':s.ohko>=.2?'var(--warning-subtle)':'var(--success-subtle)',
                                        color:ohkoColor(s.ohko)}}>
                                        {(s.ohko*100).toFixed(0)}%
                                      </span>
                                    </td>
                                    <td style={{padding:'5px 6px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'#818cf8'}}>{s.avgHs.toFixed(1)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Team summary row */}
                        <div style={{padding:'7px 14px',background:'rgba(255,255,255,.025)',borderTop:'1px solid rgba(255,255,255,.05)',
                          display:'flex',gap:16,fontSize:10,color:'var(--text-muted)',flexWrap:'wrap'}}>
                          <span>Total Damage: <strong style={{color:dmgColor(totalDmgPct),fontFamily:"'JetBrains Mono',monospace"}}>{totalDmgPct.toFixed(1)}%</strong></span>
                          <span>Total Hits: <strong style={{color:'var(--success)',fontFamily:"'JetBrains Mono',monospace"}}>{totalHits.toFixed(1)}</strong></span>
                          <span>Avg OHKO Risk: <strong style={{color:ohkoColor(avgOhko),fontFamily:"'JetBrains Mono',monospace"}}>{(avgOhko*100).toFixed(0)}%</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Per-Pokémon view ───────────────────────────────────── */}
              {viewMode==='pokemon'&&(
                <div style={{background:'rgba(0,0,0,.15)',borderRadius:9,padding:'12px 14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>
                    Individual Pokémon Performance
                    <span style={{fontWeight:400,textTransform:'none',marginLeft:6,color:'var(--text-faint)'}}>
                      averaged across {result.trials.toLocaleString()} simulations
                    </span>
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:460}}>
                      <thead>
                        <tr style={{borderBottom:'1px solid var(--border)'}}>
                          {numRaiders>1&&<th style={{padding:'4px 8px',textAlign:'center',color:'var(--text-faint)',fontSize:9,fontWeight:700,textTransform:'uppercase'}}>Raider</th>}
                          {['Pokémon','Move','Hits Dealt','Dmg to Boss','Hits Taken','OHKO Risk'].map(h=>(
                            <th key={h} style={{padding:'4px 8px',textAlign:'center',color:'var(--text-faint)',
                              fontSize:9,fontWeight:700,textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {result.perSlot.map((s,i)=>{
                          const pct=s.avgDd/bossHP*100;
                          const rIdx=numRaiders>1?Math.floor(i/teamSz):null;
                          const cSlot=counters[i];
                          return(
                            <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.04)',
                              background:i%2===0?'rgba(255,255,255,.015)':'transparent'}}>
                              {numRaiders>1&&<td style={{padding:'5px 8px',textAlign:'center',
                                fontWeight:700,color:'#818cf8',fontSize:10,whiteSpace:'nowrap'}}>R{(rIdx||0)+1}</td>}
                              <td style={{padding:'5px 8px',fontWeight:700,color:'var(--text)'}}>
                                <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                                  {s.name}
                                  {cSlot&&lookupPokeWithCustom(s.name)?.types.map(t=><TypeBadge key={t} t={t}/>)}
                                </div>
                              </td>
                              <td style={{padding:'5px 8px',textAlign:'center',color:'var(--text-muted)',whiteSpace:'nowrap'}}>
                                {cSlot?.moveName&&cSlot.moveData?<span style={{display:'flex',alignItems:'center',gap:4,justifyContent:'center'}}><TypeBadge t={cSlot.moveData.type}/>{cSlot.moveName}</span>:'—'}
                              </td>
                              <td style={{padding:'5px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'var(--success)',fontWeight:700}}>{s.avgHd.toFixed(1)}</td>
                              <td style={{padding:'5px 8px',textAlign:'center'}}>
                                <div style={{display:'flex',alignItems:'center',gap:4,justifyContent:'center'}}>
                                  <div style={{flex:1,height:5,background:'rgba(255,255,255,.07)',borderRadius:3,overflow:'hidden',minWidth:50}}>
                                    <div style={{width:`${Math.min(100,pct*3)}%`,height:'100%',
                                      background:pct>=25?'var(--danger)':pct>=8?'var(--warning)':'var(--success)',borderRadius:3}}/>
                                  </div>
                                  <span style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:'var(--text-muted)',minWidth:40}}>{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                              <td style={{padding:'5px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'#a5b4fc'}}>{s.avgHs.toFixed(1)}</td>
                              <td style={{padding:'5px 8px',textAlign:'center'}}>
                                <span style={{padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:700,
                                  background:s.ohko>=.5?'var(--danger-subtle)':s.ohko>=.2?'var(--warning-subtle)':'var(--success-subtle)',
                                  color:ohkoColor(s.ohko)}}>
                                  {(s.ohko*100).toFixed(0)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div style={{fontSize:10,color:'var(--text-faint)',marginTop:8,display:'flex',gap:12,flexWrap:'wrap'}}>
                    <span>Policy: <strong style={{color:'var(--text-muted)'}}>{
                      policy==='uniform'?'Uniform':policy==='bpweighted'?'BP-Weighted':policy==='cyclic'?'Cyclic':'Custom'
                    }</strong></span>
                    <span>Boss HP: <strong style={{color:'var(--text-muted)'}}>{bossHP.toLocaleString()}</strong></span>
                    {boss.numRaiders>1&&<span>Raiders: <strong style={{color:'var(--text-muted)'}}>{boss.numRaiders} × {teamSz} slots</strong></span>}
                  </div>
                </div>
              )}

              {/* ── Distribution chart ─────────────────────────────────── */}
              {viewMode==='chart'&&(
                <div style={{background:'rgba(0,0,0,.2)',borderRadius:9,padding:'14px 16px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>
                    Raid Outcome Distribution
                  </div>
                  <div style={{fontSize:11,color:'var(--text-faint)',marginBottom:12}}>
                    How many Pokémon slots were needed to defeat the boss.
                    <span style={{color:'var(--danger)',marginLeft:4}}>Red bars = raid failed</span>
                    {' '}(ran out of Pokémon).
                  </div>
                  <div style={{display:'flex',gap:5,alignItems:'flex-end',height:100}}>
                    {hkeys.map(k=>{
                      const cnt=result.hist[k]||0; const pct=cnt/result.trials;
                      const bh=Math.max(4,Math.round((cnt/maxH)*90));
                      const over=k>counters.length;
                      return(
                        <div key={k} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3,minWidth:20}}
                          title={`${k} Pokémon: ${(pct*100).toFixed(1)}% of raids (${cnt.toLocaleString()} times)`}>
                          <div style={{fontSize:9,color:'var(--text-muted)',fontFamily:"'JetBrains Mono',monospace"}}>{(pct*100).toFixed(0)}%</div>
                          <div style={{width:'100%',height:bh,
                            background:over?'linear-gradient(180deg,rgba(237,66,69,.6),rgba(237,66,69,.35))':'linear-gradient(180deg,rgba(99,102,241,.8),rgba(88,101,242,.5))',
                            borderRadius:'4px 4px 0 0',minHeight:4,transition:'height .3s'}}/>
                          <div style={{fontSize:10,color:over?'var(--danger)':'#a5b4fc',fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>
                            {over?'fail':k}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Legend */}
                  <div style={{marginTop:12,display:'flex',gap:16,fontSize:10,color:'var(--text-faint)',flexWrap:'wrap'}}>
                    <span style={{display:'flex',alignItems:'center',gap:4}}>
                      <div style={{width:10,height:10,background:'rgba(99,102,241,.7)',borderRadius:2}}/> Success
                    </span>
                    <span style={{display:'flex',alignItems:'center',gap:4}}>
                      <div style={{width:10,height:10,background:'rgba(237,66,69,.55)',borderRadius:2}}/> Raid failed
                    </span>
                    <span>Hover bars for exact percentages</span>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function CounterCalc({ sdState, user, isAdmin = false, guildId: guildIdProp }: { sdState: string; user?: { discord_id: string; username: string; avatar_url?: string | null } | null; isAdmin?: boolean; guildId?: string }) {
  const [boss, setBossRaw]    = useState<BossConfig>(mkBoss());
  const [counters, setCounters] = useState<CounterSlot[]>([mkSlot(), mkSlot()]);
  const [calculated, setCalc] = useState(false);
  const [globalErr, setGlErr] = useState('');
  const [sortBy, setSortBy]   = useState<'max'|'min'>('max');
  const [hpOverride, setHpOvr] = useState('');
  const [teamTemplate, setTeamTemplate] = useState<CounterSlot[]|null>(null);

  // Raid boss presets from admin server
  const [raidPresets, setRaidPresets] = useState<Array<{pokemon_key:string;display_name:string;types:string[];notes:string}>>([]);
  const [showPresets,  setShowPresets] = useState(false);

  // Resolve API URL and guild ID
  const apiUrl = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
  const guildId = guildIdProp || (import.meta.env.VITE_GUILD_ID as string | undefined) || 'global';

  // All users: silently load custom Pokémon from server so they appear in all searches
  useEffect(() => {
    if (!apiUrl) return;
    fetch(`${apiUrl}/api/custompokemon?guild_id=${encodeURIComponent(guildId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.entries) {
          const mapped = data.entries.map((e: any) => ({
            name: e.name, types: (e.types || ['Normal']) as [string, string?],
            stats: e.stats || { hp:80, atk:80, def:80, spa:80, spd:80, spe:80 },
            moves: e.moves || [],
          }));
          syncCustomPokemon(mapped);
        }
      })
      .catch(() => {});
  }, [apiUrl, guildId]);

  useEffect(() => {
    if (!apiUrl) return;
    fetch(`${apiUrl}/api/bossinfo/raidbosses?guild_id=${encodeURIComponent(guildId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.bosses) setRaidPresets(data.bosses); })
      .catch(() => {});
  }, [apiUrl, guildId]);

  const setBoss = (p:Partial<BossConfig>) => { setBossRaw(prev=>({...prev,...p})); setCalc(false); };
  const addSlot = () => setCounters(cs=>[...cs,mkSlot()]);
  const loadAutoFinderSlots = (partials: Partial<CounterSlot>[]) => {
    const newSlots = partials.map(p => ({ ...mkSlot(), ...p, result:null, error:'', raiderId:1 }));
    setCounters(newSlots); setCalc(false);
    setTeamTemplate(newSlots.slice(0, 6));
  };
  const removeSlot = (id:number) => setCounters(cs=>cs.filter(c=>c.id!==id));
  const updateSlot = (id:number, p:Partial<CounterSlot>) => setCounters(cs=>cs.map(c=>c.id===id?{...c,...p}:c));

  const raidMult = RAID_TIERS[boss.raidTier]??1;
  const bossHpBase = () => boss.data ? calcStat(boss.data.stats.hp,boss.evs.hp,boss.ivs.hp,true,1,boss.level||100) : 0;
  const effectiveHp = () => {
    const ov = parseInt(hpOverride);
    const base = (!isNaN(ov) && ov > 0)
      ? ov
      : Math.round(bossHpBase() * raidMult);
    if (boss.numRaiders <= 1) return base;
    const inc = boss.hpIncreasePerRaider / 100;
    const mult = boss.hpScalingMode === 'additive'
      ? 1 + inc * (boss.numRaiders - 1)
      : Math.pow(1 + inc, boss.numRaiders - 1);
    return Math.round(base * mult);
  };
  // Base HP before raider scaling — used by AutoFinder analytical formula
  const bossBaseHP1R = () => {
    const ov = parseInt(hpOverride);
    return (!isNaN(ov) && ov > 0) ? ov : Math.round(bossHpBase() * raidMult);
  };

  const calculateAll = () => {
    if (!boss.data) { setGlErr('Set a valid Boss Pokémon first.'); return; }
    setGlErr('');
    const bHP = effectiveHp();
    const bossFake: PokeData = {...boss.data, stats:{...boss.data.stats, hp:Math.round(boss.data.stats.hp*raidMult)}};
    // Expand slots by their count before calculating
    const expanded: CounterSlot[] = [];
    for (const slot of counters) {
      const n = Math.max(1, slot.count ?? 1);
      for (let i = 0; i < n; i++) {
        expanded.push(i === 0 ? slot : { ...slot, id: _slotId++, result: null, error: '' });
      }
    }
    const updated = expanded.map(slot => {
      if (!slot.name||!slot.moveName) return {...slot,error:'',result:null};
      const ad=slot.data||lookupPokeWithCustom(slot.name), mv=slot.moveData||lookupMoveWithCustom(slot.moveName);
      if (!ad) return {...slot,error:`"${slot.name}" not found`,result:null};
      if (!mv||!mv.bp) return {...slot,error:`"${slot.moveName}" not found/status`,result:null};
      const res = runCalc({atkPoke:ad,defPoke:bossFake,bp:mv.bp,cat:mv.cat,mtyp:mv.type,
        atkEvs:slot.evs,defEvs:boss.evs,atkIvs:slot.ivs,defIvs:boss.ivs,
        atkNat:slot.nature,defNat:boss.nature,atkTera:slot.teraType,defTera:boss.teraType,
        atkItem:slot.item,atkStatus:'Healthy',weather:boss.weather,doubles:boss.doubles,
        atkScreen:false,defScreen:boss.defScreen,isCrit:slot.isCrit,zmove:slot.zmove,
        atkLv:slot.level||100,defLv:boss.level||100});
      if (res&&!res.immune) {
        const minD=res.minD??0, maxD=res.maxD??0;
        const minP=bHP?Math.floor(minD/bHP*1000)/10:0, maxP=bHP?Math.floor(maxD/bHP*1000)/10:0;
        return {...slot,error:'',result:{...res,immune:false as const,minD,maxD,defHp:bHP,minP,maxP,ohko:minP>=100,possibleOhko:maxP>=100,twoHko:minP>=50,hitsToKo:[maxD?Math.ceil(bHP/maxD):99,minD?Math.ceil(bHP/minD):99] as [number,number]}};
      }
      return {...slot,error:'',result:res};
    });
    // Merge results back — original slots keep their result; count>1 slots are expanded in display
    // We update counters to the expanded set so all copies appear
    setCounters(updated); setCalc(true);
  };

  const ranked = [...counters].map((c,i)=>({c,i})).sort((a,b)=>{
    const va=a.c.result?.immune?-999:sortBy==='max'?(a.c.result?.maxP??-1):(a.c.result?.minP??-1);
    const vb=b.c.result?.immune?-999:sortBy==='max'?(b.c.result?.maxP??-1):(b.c.result?.minP??-1);
    return vb-va;
  });
  const rankedIds = ranked.filter(x=>x.c.result&&!x.c.result.immune).map(x=>x.c.id);
  const bossEvTotal = Object.values(boss.evs).reduce((a,b)=>a+b,0);
  const displayCounters = calculated ? ranked.map(x=>x.c) : counters;

  return (
    <div className="animate-fade" style={{display:'flex',flexDirection:'column',gap:14,maxWidth:960}}>

      {/* Boss config card */}
      <div style={{background:'linear-gradient(135deg,rgba(220,38,38,.07),rgba(124,58,237,.07))',border:'1px solid rgba(220,38,38,.24)',borderRadius:12,padding:16}}>
        <div style={{fontSize:11,fontWeight:800,color:'#f87171',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:12,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span>👹</span> Boss Configuration
          {boss.data&&<span style={{fontSize:10,color:'var(--success)',fontWeight:600}}>✓ {boss.data.name}</span>}
          {raidPresets.length>0&&(
            <div style={{marginLeft:'auto',position:'relative'}}>
              <button onClick={()=>setShowPresets(p=>!p)} style={{padding:'3px 10px',background:'rgba(88,101,242,.15)',border:'1px solid rgba(88,101,242,.3)',borderRadius:6,color:'#818cf8',cursor:'pointer',fontSize:11,fontWeight:700}}>
                📋 Boss Presets ({raidPresets.length})
              </button>
              {showPresets&&(
                <div style={{position:'absolute',top:'calc(100% + 4px)',right:0,zIndex:50,background:'#181a28',border:'1px solid rgba(255,255,255,.13)',borderRadius:9,padding:6,minWidth:200,maxHeight:220,overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,.7)'}}>
                  <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',padding:'4px 8px 6px'}}>Configured Raid Bosses</div>
                  {raidPresets.map(preset=>(
                    <div key={preset.pokemon_key} onMouseDown={()=>{
                      const d=lookupPoke(preset.display_name);
                      setBoss({name:preset.display_name,data:d});
                      setShowPresets(false);
                    }} style={{padding:'7px 10px',cursor:'pointer',borderRadius:6,fontSize:12,color:'#d4d8f0',display:'flex',alignItems:'center',gap:8}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(88,101,242,.18)'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=''}>
                      <span style={{fontWeight:600}}>{preset.display_name}</span>
                      {(preset.types||[]).slice(0,2).map((t:string)=><span key={t} style={{fontSize:9,background:'rgba(255,255,255,.1)',borderRadius:3,padding:'1px 5px',color:'#9ca3af'}}>{t}</span>)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <div>
            <AutoInput label="Boss Pokémon" value={boss.name} searchFn={searchPokemonWithCustom}
              onChange={v=>{const d=lookupPokeWithCustom(v);setBoss({name:v,data:d});}} placeholder="e.g. Charizard"/>
            {boss.data&&<div style={{display:'flex',gap:4,marginTop:5,flexWrap:'wrap'}}>
              {(boss.teraType?[boss.teraType]:boss.data.types).map(t=><TypeBadge key={t} t={t}/>)}
            </div>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            <div>
              <label style={LBL}>Tera Type</label>
              <select style={SEL} value={boss.teraType} onChange={e=>setBoss({teraType:e.target.value})}>
                <option value="">None</option>{ALL_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Raid Tier / HP Multiplier</label>
              <select style={SEL} value={boss.raidTier} onChange={e=>setBoss({raidTier:e.target.value})}>
                {Object.keys(RAID_TIERS).map(k=><option key={k}>{k}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'70px 1fr 1fr 1fr',gap:8,marginBottom:8}}>
          <div><label style={LBL}>Level</label><input style={INP} type="number" min={1} max={100} value={boss.level} onChange={e=>setBoss({level:parseInt(e.target.value)||100})}/></div>
          <div><label style={LBL}>Nature</label><select style={SEL} value={boss.nature} onChange={e=>setBoss({nature:e.target.value})}>{Object.keys(NATURES).map(n=><option key={n}>{n}</option>)}</select></div>
          <div><label style={LBL}>Weather</label><select style={SEL} value={boss.weather} onChange={e=>setBoss({weather:e.target.value})}>{WEATHERS.map(w=><option key={w}>{w}</option>)}</select></div>
          <div><label style={LBL}>HP Override</label><input style={INP} type="number" value={hpOverride} onChange={e=>{setHpOvr(e.target.value);setCalc(false);}} placeholder="auto"/></div>
        </div>

        {/* Raider scaling row — 4 columns, no duplicate min-raiders-specific overrides */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:10,padding:'10px 12px',background:'rgba(255,255,255,.03)',borderRadius:8,border:'1px solid rgba(255,255,255,.07)'}}> 
          <div>
            <label style={LBL}>👥 # Raiders</label>
            <input style={INP} type="number" min={1} max={30} value={boss.numRaiders}
              onChange={e=>setBoss({numRaiders:Math.max(1,parseInt(e.target.value)||1)})}/>
          </div>
          <div>
            <label style={LBL}>🐾 Team Size (per raider)</label>
            <input style={INP} type="number" min={1} max={12} value={boss.teamSize ?? 6}
              title="Number of Pokémon in each raider's team"
              onChange={e=>setBoss({teamSize:Math.max(1,Math.min(12,parseInt(e.target.value)||6))})}/>
          </div>
          <div>
            <label style={LBL}>HP Increase / Raider (%)</label>
            <input style={INP} type="number" min={0} step={0.1} value={boss.hpIncreasePerRaider}
              onChange={e=>setBoss({hpIncreasePerRaider:Math.max(0,parseFloat(e.target.value)||0)})}/>
          </div>
          <div>
            <label style={LBL}>Scaling Mode</label>
            <select style={SEL} value={boss.hpScalingMode}
              onChange={e=>setBoss({hpScalingMode:e.target.value as 'additive'|'multiplicative'})}>
              <option value="additive">Linear (additive)</option>
              <option value="multiplicative">Multiplicative</option>
            </select>
          </div>
        </div>

        <div style={{marginBottom:10}}>
          <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
            <label style={{...LBL,marginBottom:0,marginRight:6}}>Boss EVs</label>
            {STAT_ORDER.map(([k,l])=>(
              <div key={k} style={{display:'flex',alignItems:'center',gap:3}}>
                <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:700,minWidth:22,textAlign:'right'}}>{l}</span>
                <input style={{...NUM,width:38}} type="number" min={0} max={252} value={boss.evs[k]}
                  onChange={e=>setBoss({evs:{...boss.evs,[k]:Math.max(0,Math.min(252,parseInt(e.target.value)||0))}})}/>
              </div>
            ))}
            <span style={{fontSize:9,color:bossEvTotal>510?'var(--danger)':'var(--text-faint)'}}>({bossEvTotal}/510)</span>
          </div>
        </div>

        <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap',fontSize:11,color:'var(--text-muted)'}}>
          <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}><input type="checkbox" checked={boss.doubles} onChange={e=>setBoss({doubles:e.target.checked})}/> Doubles</label>
          <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}><input type="checkbox" checked={boss.defScreen} onChange={e=>setBoss({defScreen:e.target.checked})}/> Reflect / Light Screen</label>
          {boss.data&&(
            <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-muted)'}}>
              Base HP: <strong style={{color:'var(--text)'}}>{bossHpBase()}</strong>
              {raidMult>1&&<> → Raid: <strong style={{color:'var(--danger)'}}>{Math.round(bossHpBase()*raidMult)}</strong> <span style={{color:'var(--text-faint)'}}>×{raidMult}</span></>}
              {hpOverride&&parseInt(hpOverride)>0&&<> → Override: <strong style={{color:'var(--warning)'}}>{hpOverride}</strong></>}
              {boss.numRaiders>1&&boss.hpIncreasePerRaider>0&&<> → Scaled: <strong style={{color:'#f97316'}}>{effectiveHp().toLocaleString()}</strong> <span style={{color:'var(--text-faint)'}}>({boss.numRaiders}×)</span></>}
              {boss.numRaiders>1&&boss.hpIncreasePerRaider===0&&<> <span style={{color:'var(--text-faint)'}}>({boss.numRaiders} raiders, no HP scale)</span></>}
            </span>
          )}
        </div>

        {/* ── Custom Boss Movepool ──────────────────────────────── */}
        <div style={{marginTop:10,padding:'10px 12px',background:'rgba(239,68,68,.04)',borderRadius:8,border:'1px solid rgba(239,68,68,.15)'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#f87171',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            ⚔️ Boss Movepool
            {boss.customMoves.length===0&&<span style={{fontSize:10,color:'var(--text-faint)',fontWeight:400,textTransform:'none'}}>— using level-up moves</span>}
            {boss.customMoves.length>0&&<span style={{fontSize:10,color:'#fca5a5',fontWeight:600,textTransform:'none'}}>— {boss.customMoves.length} custom move{boss.customMoves.length!==1?'s':''} (overrides level-up)</span>}
            <button onClick={()=>setBoss({customMoves:[...boss.customMoves,{name:'',type:'Normal',cat:'Physical',bp:80}]})}
              style={{marginLeft:'auto',padding:'2px 8px',background:'rgba(239,68,68,.12)',border:'1px solid rgba(239,68,68,.3)',borderRadius:5,color:'#fca5a5',cursor:'pointer',fontSize:11,fontWeight:700}}>
              + Add Move
            </button>
            {boss.customMoves.length>0&&(
              <button onClick={()=>setBoss({customMoves:[]})}
                style={{padding:'2px 8px',background:'transparent',border:'1px solid rgba(255,255,255,.1)',borderRadius:5,color:'var(--text-faint)',cursor:'pointer',fontSize:11}}>
                Clear
              </button>
            )}
          </div>
          {boss.customMoves.length===0&&boss.data&&(()=>{
            const lum = getLevelUpMoves(boss.name);
            return lum.length ? (
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {lum.map(mv=>(
                  <span key={mv.name} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 8px',background:'rgba(255,255,255,.04)',borderRadius:5,border:'1px solid var(--border)',fontSize:11,color:'var(--text-muted)'}}>
                    <TypeBadge t={mv.type}/>{mv.name} <span style={{color:'var(--text-faint)',fontSize:9}}>BP{mv.bp}</span>
                  </span>
                ))}
              </div>
            ) : <div style={{fontSize:11,color:'var(--text-faint)'}}>No level-up moves found — add custom moves above.</div>;
          })()}
          {boss.customMoves.map((mv,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 60px auto',gap:6,alignItems:'center',marginBottom:4}}>
              <AutoInput label="" value={mv.name} searchFn={searchMovesWithCustom}
                onChange={v=>{const found=lookupMoveWithCustom(v);const nm=[...boss.customMoves];nm[i]={...nm[i],name:v,type:found?.type||nm[i].type,cat:found?.cat||nm[i].cat,bp:found?.bp||nm[i].bp};setBoss({customMoves:nm});}}
                placeholder="Move name"/>
              <select style={SEL} value={mv.type} onChange={e=>{const nm=[...boss.customMoves];nm[i]={...nm[i],type:e.target.value};setBoss({customMoves:nm});}}>
                {ALL_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
              <select style={SEL} value={mv.cat} onChange={e=>{const nm=[...boss.customMoves];nm[i]={...nm[i],cat:e.target.value};setBoss({customMoves:nm});}}>
                <option value="Physical">Physical</option><option value="Special">Special</option>
              </select>
              <input type="number" style={{...INP,padding:'4px 6px'}} min={1} max={300} value={mv.bp}
                onChange={e=>{const nm=[...boss.customMoves];nm[i]={...nm[i],bp:Math.max(1,Number(e.target.value))};setBoss({customMoves:nm});}}/>
              <button onClick={()=>setBoss({customMoves:boss.customMoves.filter((_,j)=>j!==i)})}
                style={{padding:'4px 8px',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',borderRadius:5,color:'#ef4444',cursor:'pointer',fontSize:12}}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Pokémon panel — admin only (clients load custom Pokémon silently) */}
      {/* Custom Pokémon panel is managed by admins in BossInfo → ✨ Custom Pokémon tab */}

      {/* Auto-Finder panel */}
      {boss.data&&<AutoFinderPanel
        boss={boss}
        bossBaseHP={bossBaseHP1R()}
        onLoadCounters={loadAutoFinderSlots}
        sdState={sdState}
      />}

      {/* Min-Raiders panel */}
      <MinRaidersPanel
        boss={boss}
        slots={counters}
        baseHp={(() => {
          const sb = boss.simpleBaseHp ?? 0;
          if (sb > 0) return sb;
          return bossBaseHP1R();
        })()}
        onBossChange={setBoss}
      />

      {/* Counter list header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div style={{fontSize:11,fontWeight:800,color:'#818cf8',textTransform:'uppercase',letterSpacing:'.09em'}}>
          ⚔️ Counter Pokémon <span style={{color:'var(--text-faint)'}}>({counters.length})</span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {calculated&&counters.some(c=>c.result&&!c.result.immune)&&(
            <div style={{display:'flex',gap:4,fontSize:11,color:'var(--text-muted)'}}>
              Sort:
              {(['max','min'] as const).map(s=>(
                <button key={s} onClick={()=>setSortBy(s)}
                  style={{padding:'3px 9px',borderRadius:5,border:'1px solid var(--border)',
                    background:sortBy===s?'rgba(88,101,242,.28)':'transparent',
                    color:sortBy===s?'#818cf8':'var(--text-muted)',cursor:'pointer',fontSize:11,
                    fontWeight:sortBy===s?700:400,fontFamily:"'Lexend',sans-serif"}}>
                  {s==='max'?'Max Dmg':'Min Dmg'}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={addSlot}>+ Add Counter</button>
          {counters.length>0&&(
            <button className="btn btn-ghost btn-sm" title="Save current team (first 6 slots) as a reusable template"
              onClick={()=>setTeamTemplate(counters.slice(0,6))}>
              💾 Save Template
            </button>
          )}
          {teamTemplate&&teamTemplate.length>0&&(
            <button className="btn btn-ghost btn-sm"
              title={"Replicate template across all " + boss.numRaiders + " raiders"}
              onClick={()=>{
                if (counters.length > 0 && !window.confirm(`This will overwrite all ${counters.length} current counter slots. Continue?`)) return;
                const tpl = teamTemplate.slice(0,6);
                const newCounters: CounterSlot[] = [];
                for (let r=0; r<boss.numRaiders; r++) {
                  tpl.forEach(slot => newCounters.push({...slot, id:_slotId++, result:null, error:'', raiderId:r+1}));
                }
                setCounters(newCounters); setCalc(false);
              }}>
              🔁 Apply to {boss.numRaiders} Raider{boss.numRaiders!==1?'s':''}
            </button>
          )}
          {boss.numRaiders>1&&counters.length>0&&(
            <button className="btn btn-ghost btn-sm" title="Append copies of ALL current counters for each additional raider"
              onClick={()=>{
                const extras: CounterSlot[] = [];
                for (let i=1; i<boss.numRaiders; i++) {
                  counters.forEach(c => extras.push({...c, id:_slotId++, result:null, error:''}));
                }
                setCounters(cs=>[...cs,...extras]);
              }}>
              ➕ Duplicate Raw
            </button>
          )}
        </div>
      </div>

      {/* Counter rows — with raider group labels when numRaiders > 1 */}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {displayCounters.map((slot,idx)=>{
          const rpos = calculated ? rankedIds.indexOf(slot.id)+1 : null;
          const slotsPerRaider = boss.numRaiders > 1 ? Math.ceil(counters.length / boss.numRaiders) : 0;
          const showLabel = boss.numRaiders > 1 && slotsPerRaider > 0 && idx % slotsPerRaider === 0;
          const raiderNum  = boss.numRaiders > 1 ? Math.floor(idx / slotsPerRaider) + 1 : 0;
          return (
            <React.Fragment key={slot.id}>
              {showLabel&&(
                <div style={{marginTop:idx>0?8:0,fontSize:11,fontWeight:700,color:'#c4b5fd',
                  display:'flex',alignItems:'center',gap:6,letterSpacing:'.04em'}}>
                  <span style={{fontSize:13}}>👤</span> Raider {raiderNum}
                  <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:400}}>
                    (slots {idx+1}–{Math.min(idx+slotsPerRaider, counters.length)})
                  </span>
                </div>
              )}
              <CounterRow key={slot.id} slot={slot} onChange={updateSlot} onRemove={removeSlot} rank={rpos&&rpos<=3?rpos:null}/>
            </React.Fragment>
          );
        })}
      </div>

      {globalErr&&<div style={{color:'var(--danger)',fontSize:13,padding:'9px 14px',background:'var(--danger-subtle)',borderRadius:8}}>{globalErr}</div>}

      <div style={{textAlign:'center'}}>
        <button className="btn btn-danger" onClick={calculateAll} disabled={sdState!=='ready'}
          style={{padding:'11px 52px',fontSize:14,fontWeight:700,letterSpacing:'.02em',
            background:'linear-gradient(135deg,#dc2626,#7c3aed)',border:'none',color:'#fff',
            boxShadow:'0 4px 20px rgba(220,38,38,.3)',opacity:sdState!=='ready'?.5:1}}>
          {sdState!=='ready' ? '⏳ Loading data…' : '👹 Calculate All Counters'}
        </button>
      </div>

      {/* Boss sim + MC (post-calculate) */}
      {calculated&&boss.data&&<BossSimPanel boss={boss} counters={counters}/>}
      {calculated&&boss.data&&<MCPanel boss={boss} counters={counters} bossHP={effectiveHp()} sdState={sdState}/>}

      {/* Per-Raider Team Analysis */}
      {calculated&&counters.some(c=>c.result&&!c.result.immune&&c.name)&&(()=>{
        const teamSz = Math.max(1, boss.teamSize ?? 6);
        const bHP = effectiveHp();
        const numR = Math.max(1, boss.numRaiders ?? 1);

        // Group counters by raiderId if set, otherwise by equal split
        const hasRaiderIds = counters.some(c => (c.raiderId ?? 0) > 0);
        const raiderTeams: Array<{raiderIdx:number; slots:CounterSlot[]}> = Array.from({length:numR},(_,r)=>({
          raiderIdx: r,
          slots: hasRaiderIds
            ? counters.filter(c => (c.raiderId ?? 1) === r+1)
            : counters.slice(r * teamSz, (r+1) * teamSz),
        }));

        const dcColor = damagePctColor;
        const hkoColor = (r:any) => r.ohko||r.possibleOhko ? 'var(--danger)' : r.twoHko||r.maxP>=50 ? 'var(--warning)' : 'var(--success)';

        return (
          <div style={{background:'rgba(255,255,255,.025)',border:'1px solid rgba(255,255,255,.09)',borderRadius:10,padding:14}}>
            <div style={{fontSize:10,fontWeight:800,color:'#5865f2',textTransform:'uppercase',letterSpacing:'.09em',marginBottom:12,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              📊 Team Analysis vs {boss.data?.name||'Boss'}{raidMult>1?` — Raid HP ×${raidMult}`:''}
              {numR>1&&<span style={{fontWeight:600,color:'#f97316',textTransform:'none',fontSize:10}}>
                {numR} Raiders · {teamSz} Pokémon/team · {bHP.toLocaleString()} HP
              </span>}
            </div>

            {/* Per-Raider Team Cards — always render when numRaiders > 1 */}
            {numR > 1 && (
              <div style={{display:'flex',flexDirection:'column',gap:12,marginBottom:16}}>
                {raiderTeams.map(({raiderIdx, slots})=>{
                  const validSlots = slots.filter(c=>c.result&&!c.result.immune&&c.name);
                  const teamTotalMinPct = validSlots.reduce((s,c)=>s + (c.result as CalcResultDamage).minP, 0);
                  const teamTotalMaxPct = validSlots.reduce((s,c)=>s + (c.result as CalcResultDamage).maxP, 0);
                  const teamAvgPct = (teamTotalMinPct + teamTotalMaxPct) / 2;
                  const canWin = teamTotalMinPct >= 100;
                  const likelyWin = teamTotalMaxPct >= 100;
                  const isEmpty = slots.filter(c=>c.name).length === 0;
                  return (
                    <div key={raiderIdx} style={{background:'rgba(0,0,0,.2)',borderRadius:10,padding:'10px 12px',
                      border:`1px solid ${isEmpty?'rgba(255,255,255,.05)':canWin?'rgba(59,165,93,.35)':likelyWin?'rgba(250,168,26,.3)':'rgba(255,255,255,.07)'}`,
                      opacity:isEmpty?.55:1}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:isEmpty?0:8,flexWrap:'wrap'}}>
                        <span style={{fontSize:12,fontWeight:800,color:isEmpty?'var(--text-faint)':'#c4b5fd'}}>
                          {raiderIdx===0?'🥇':raiderIdx===1?'🥈':raiderIdx===2?'🥉':'👤'} Raider {raiderIdx+1}
                        </span>
                        <span style={{fontSize:10,color:'var(--text-faint)'}}>
                          {isEmpty ? 'No Pokémon assigned' : `${slots.filter(c=>c.name).length} Pokémon`}
                        </span>
                        {!isEmpty&&<div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
                          <span style={{fontSize:11,fontWeight:700,color:canWin?'var(--success)':likelyWin?'var(--warning)':'var(--danger)'}}>
                            {canWin?'✅ Can solo':'⚠️ '+(likelyWin?'Likely beats boss':'Needs support')}
                          </span>
                          <span style={{fontSize:14,fontWeight:900,fontFamily:"'JetBrains Mono',monospace",color:dcColor(teamAvgPct)}}>
                            {teamTotalMinPct.toFixed(0)}–{teamTotalMaxPct.toFixed(0)}% total dmg
                          </span>
                        </div>}
                      </div>
                      {isEmpty && (
                        <div style={{fontSize:11,color:'var(--text-faint)',fontStyle:'italic',padding:'4px 0'}}>
                          Assign Pokémon to this raider using the counter slots above, or use "Apply to {numR} Raiders".
                        </div>
                      )}
                      {!isEmpty&&(<>
                        {/* Team damage bar */}
                        <div style={{height:6,background:'rgba(255,255,255,.07)',borderRadius:3,overflow:'hidden',marginBottom:8,position:'relative'}}>
                          <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,teamTotalMinPct)}%`,background:dcColor(teamAvgPct),opacity:.4,borderRadius:3}}/>
                          <div style={{position:'absolute',left:`${Math.min(100,teamTotalMinPct)}%`,top:0,bottom:0,width:`${Math.max(0,Math.min(100,teamTotalMaxPct)-Math.min(100,teamTotalMinPct))}%`,background:dcColor(teamAvgPct),borderRadius:3}}/>
                          <div style={{position:'absolute',left:'100%',top:0,bottom:0,width:2,background:'rgba(255,255,255,.4)',borderRadius:2,transform:'translateX(-50%)'}}/>
                        </div>
                        {/* Per-slot rows */}
                        <div style={{display:'flex',flexDirection:'column',gap:3}}>
                          {slots.map((c,si)=>{
                            if (!c.name) return null;
                            if (!c.result||c.result.immune) return (
                              <div key={c.id} style={{fontSize:11,color:'var(--text-faint)',padding:'3px 6px'}}>
                                — {c.name} <span style={{fontSize:10}}>(no result / immune)</span>
                              </div>
                            );
                            const r=c.result;
                            const hitStr=r.hitsToKo[0]===r.hitsToKo[1]?`${r.hitsToKo[0]}HKO`:`${r.hitsToKo[0]}–${r.hitsToKo[1]}HKO`;
                            return(
                              <div key={c.id} style={{display:'flex',alignItems:'center',gap:6,padding:'4px 6px',background:'rgba(255,255,255,.03)',borderRadius:6}}>
                                <span style={{fontSize:10,color:'var(--text-faint)',width:16,textAlign:'center',flexShrink:0}}>{si+1}</span>
                                <span style={{fontSize:12,fontWeight:600,color:'var(--text)',minWidth:90,flexShrink:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.name}</span>
                                {c.moveData&&<TypeBadge t={c.moveData.type}/>}
                                <span style={{fontSize:10,color:'var(--text-muted)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.moveName}</span>
                                <div style={{display:'flex',alignItems:'center',gap:4,flexShrink:0}}>
                                  <div style={{width:50,height:4,background:'rgba(255,255,255,.07)',borderRadius:2,overflow:'hidden',position:'relative'}}>
                                    <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,r.minP)}%`,background:dcColor(r.maxP),opacity:.4,borderRadius:2}}/>
                                    <div style={{position:'absolute',left:`${Math.min(100,r.minP)}%`,top:0,bottom:0,width:`${Math.max(0,Math.min(100,r.maxP)-Math.min(100,r.minP))}%`,background:dcColor(r.maxP),borderRadius:2}}/>
                                  </div>
                                  <span style={{fontSize:11,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color:'#fff',minWidth:85,textAlign:'right'}}>{r.minP.toFixed(1)}%–{r.maxP.toFixed(1)}%</span>
                                  <span style={{fontSize:10,fontWeight:700,minWidth:55,textAlign:'right',color:hkoColor(r)}}>{hitStr}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>)}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Individual rankings */}
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>
              {numR > 1 ? 'All Slots (Individual)' : 'Individual Rankings'}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {ranked.map(({c},i)=>{
                if (!c.result||c.result.immune||!c.name) return null;
                const r=c.result;
                const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
                const hitStr=r.hitsToKo[0]===r.hitsToKo[1]?`${r.hitsToKo[0]}HKO`:`${r.hitsToKo[0]}–${r.hitsToKo[1]}HKO`;
                return(
                  <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 8px',background:i===0?'rgba(251,191,36,.05)':'rgba(255,255,255,.02)',borderRadius:6,border:'1px solid rgba(255,255,255,.04)'}}>
                    <span style={{fontSize:13,width:22,textAlign:'center',flexShrink:0}}>{medal||<span style={{fontSize:10,color:'var(--text-faint)'}}>{i+1}</span>}</span>
                    {numR>1&&<span style={{fontSize:9,color:'#818cf8',fontWeight:700,minWidth:18,textAlign:'center',flexShrink:0}}>R{c.raiderId||1}</span>}
                    <span style={{fontSize:12,fontWeight:700,color:'var(--text)',minWidth:100,flexShrink:0}}>{c.name}</span>
                    {c.moveData&&<TypeBadge t={c.moveData.type}/>}
                    <span style={{fontSize:11,color:'var(--text-muted)',minWidth:80,flexShrink:0}}>{c.moveName}</span>
                    <div style={{flex:1,height:5,background:'rgba(255,255,255,.07)',borderRadius:3,overflow:'hidden',position:'relative',minWidth:60}}>
                      <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,r.minP)}%`,background:r.maxP>=100?'var(--danger)':r.maxP>=50?'var(--warning)':'var(--primary)',opacity:.4,borderRadius:3}}/>
                      <div style={{position:'absolute',left:`${Math.min(100,r.minP)}%`,top:0,bottom:0,width:`${Math.max(0,Math.min(100,r.maxP)-Math.min(100,r.minP))}%`,background:r.maxP>=100?'var(--danger)':r.maxP>=50?'var(--warning)':'var(--primary)',borderRadius:3}}/>
                    </div>
                    <span style={{fontSize:12,fontWeight:800,color:'#fff',fontFamily:"'JetBrains Mono',monospace",minWidth:105,textAlign:'right',flexShrink:0}}>{r.minP.toFixed(1)}%–{r.maxP.toFixed(1)}%</span>
                    <span style={{fontSize:11,fontWeight:700,minWidth:65,textAlign:'right',flexShrink:0,color:hkoColor(r)}}>{hitStr}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
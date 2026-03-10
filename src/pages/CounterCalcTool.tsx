/**
 * CounterCalcTool.tsx — Raid Counter Calculator (Rebuilt)
 *
 * Core change: single shared team, all raiders use the same team.
 * Raid mechanics: no items/abilities/status — pure damage + type math.
 * Auto-find: based on type weaknesses + boss lower-defense-stat heuristic.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import React from 'react';
import {
  lookupPokeWithCustom,
  lookupMoveWithCustom,
  searchPokemonWithCustom,
  searchMovesWithCustom,
  getAllPokemonNamesWithCustom,
  getAllLearnableMoveNamesWithCustom,
  getLevelUpMoves,
  runCalc,
  calcStat,
  typeEff,
  weaknessChart,
  useShowdownData,
  RAID_TIERS,
  DEFAULT_EVS,
  DEFAULT_IVS,
  ALL_TYPES,
  TC_COLORS,
  type PokeData,
  type MoveData,
  type PokeStat,
} from '../lib/engine_pokemon';
import { TypeBadge, AutoInput } from '../lib/pokemon_components';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TeamSlot {
  id: number;
  name: string;
  data: PokeData | null;
  moveName: string;
  moveData: MoveData | null;
  level: number;
  zmove: boolean;
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
}

interface BossState {
  name: string;
  data: PokeData | null;
  level: number;
  raidTier: string;
  teraType: string;
  customHp: number; // 0 = use formula
  numRaiders: number;
  hpPerRaider: number; // % HP increase per extra raider
}

interface AutoCandidate {
  name: string;
  data: PokeData;
  move: MoveData;
  eff: number;
  stab: boolean;
  cat: string;
  dmgPct: number; // % of boss HP per hit
  score: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

let _slotId = 1;
const mkSlot = (): TeamSlot => ({
  id: _slotId++, name: '', data: null,
  moveName: '', moveData: null,
  level: 100, zmove: false,
  error: '', result: null,
});

const mkBoss = (): BossState => ({
  name: '', data: null, level: 100,
  raidTier: '5★ Raid (×6.8 HP)',
  teraType: '', customHp: 0,
  numRaiders: 6, hpPerRaider: 30,
});

const Z_TABLE: [number, number][] = [
  [55,100],[65,120],[75,140],[85,160],[95,175],[100,180],[110,185],[125,190],[9999,195]
];
const zPower = (bp: number) => { for (const [t,p] of Z_TABLE) if (bp <= t) return p; return 195; };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getBossHp(boss: BossState): number {
  if (boss.customHp > 0) return boss.customHp;
  if (!boss.data) return 0;
  const baseHp = calcStat(boss.data.stats.hp, 0, 31, true, 1, boss.level);
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
  if (eff === 0) return { minD:0, maxD:0, avgD:0, minP:0, maxP:0, avgP:0, eff:0, stab:false, immune:true, cat:slot.moveData.cat, mtyp:slot.moveData.type };

  const bossFakeHp = getBossHp(boss);
  const bossFake: PokeData = { ...boss.data, stats: { ...boss.data.stats, hp: Math.round(boss.data.stats.hp * (RAID_TIERS[boss.raidTier] ?? 1)) } };

  const res = runCalc({
    atkPoke: slot.data, defPoke: bossFake,
    bp, cat: slot.moveData.cat, mtyp: slot.moveData.type,
    atkEvs: DEFAULT_EVS, defEvs: DEFAULT_EVS,
    atkIvs: DEFAULT_IVS, defIvs: DEFAULT_IVS,
    atkNat: 'Hardy', defNat: 'Hardy',
    atkTera: '', defTera: boss.teraType,
    atkItem: '(none)', atkStatus: 'Healthy',
    weather: 'None', doubles: false,
    atkScreen: false, defScreen: false,
    isCrit: false, zmove: false, // bp already computed above
    atkLv: slot.level, defLv: boss.level,
  });

  if (!res || res.immune) return { minD:0, maxD:0, avgD:0, minP:0, maxP:0, avgP:0, eff:0, stab:false, immune:true, cat:slot.moveData.cat, mtyp:slot.moveData.type };

  const totalHp = getTotalHp(boss);
  const hp = totalHp > 0 ? totalHp : bossFakeHp;
  const minP = hp > 0 ? Math.floor(res.minD / hp * 1000) / 10 : 0;
  const maxP = hp > 0 ? Math.floor(res.maxD / hp * 1000) / 10 : 0;
  const avgD = (res.minD + res.maxD) / 2;
  const avgP = (minP + maxP) / 2;
  const stab = slot.data.types.includes(slot.moveData.type);

  return { minD: res.minD, maxD: res.maxD, avgD, minP, maxP, avgP, eff, stab, immune: false, cat: slot.moveData.cat, mtyp: slot.moveData.type };
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────────────────────────────

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

const BTN = (variant: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
  padding: '7px 14px',
  borderRadius: 8,
  border: variant === 'ghost' ? '1px solid rgba(255,255,255,.12)' : 'none',
  background: variant === 'primary' ? 'var(--primary)' : variant === 'danger' ? 'rgba(220,38,38,.2)' : 'rgba(255,255,255,.05)',
  color: variant === 'danger' ? '#f87171' : 'var(--text)',
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

const effColor = (eff: number) =>
  eff >= 4 ? '#f87171' : eff >= 2 ? '#fbbf24' : eff === 1 ? 'var(--text-muted)' : '#6ee7b7';

const effLabel = (eff: number) =>
  eff >= 4 ? '4×' : eff >= 2 ? '2×' : eff === 1 ? '1×' : eff > 0 ? '½×' : '0×';

// ─────────────────────────────────────────────────────────────────────────────
// Team Slot Row
// ─────────────────────────────────────────────────────────────────────────────

function SlotRow({ slot, bossHp, rank, onChange, onRemove }: {
  slot: TeamSlot;
  bossHp: number;
  rank: number | null;
  onChange: (p: Partial<TeamSlot>) => void;
  onRemove: () => void;
}) {
  const r = slot.result;

  const handlePokeChange = (name: string) => {
    const data = lookupPokeWithCustom(name);
    onChange({ name, data, result: null, error: data ? '' : name.length > 1 ? `"${name}" not found` : '' });
  };

  const handleMoveChange = (moveName: string) => {
    const moveData = lookupMoveWithCustom(moveName);
    onChange({ moveName, moveData, result: null, error: moveData ? '' : moveName.length > 1 ? `"${moveName}" not found` : '' });
  };

  return (
    <div style={{ ...CARD, position: 'relative', padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Rank badge */}
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: rank !== null ? 'var(--primary)' : 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0, marginTop: 18 }}>
          {rank !== null ? rank + 1 : '—'}
        </div>

        {/* Pokémon */}
        <div style={{ flex: '1 1 160px', minWidth: 140 }}>
          <label style={LBL}>Pokémon</label>
          <AutoInput
            value={slot.name}
            onChange={handlePokeChange}
            searchFn={searchPokemonWithCustom}
            placeholder="e.g. Garchomp"
          />
          {slot.data && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {slot.data.types.map(t => <TypeBadge key={t} t={t} />)}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>
                {slot.data.stats.atk > slot.data.stats.spa ? `Atk:${slot.data.stats.atk}` : `SpA:${slot.data.stats.spa}`}
              </span>
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
          <label style={LBL}>Lvl</label>
          <input style={{ ...INP, textAlign: 'center', padding: '6px 4px' }}
            type="number" min={1} max={100} value={slot.level}
            onChange={e => onChange({ level: Math.max(1, Math.min(100, parseInt(e.target.value) || 100)), result: null })} />
        </div>

        {/* Z-Move toggle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginTop: 14 }}>
          <label style={{ ...LBL, marginBottom: 0 }}>Z</label>
          <input type="checkbox" checked={slot.zmove}
            onChange={e => onChange({ zmove: e.target.checked, result: null })}
            style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--primary)' }} />
        </div>

        {/* Remove */}
        <button onClick={onRemove} style={{ ...BTN('danger'), padding: '5px 8px', marginTop: 18, fontSize: 16 }} title="Remove slot">×</button>
      </div>

      {/* Error */}
      {slot.error && <div style={{ fontSize: 11, color: '#f87171', marginTop: 6 }}>⚠ {slot.error}</div>}

      {/* Result bar */}
      {r && !r.immune && (
        <div style={{ marginTop: 10, background: 'rgba(0,0,0,.25)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: "'JetBrains Mono',monospace" }}>
                {r.minP.toFixed(1)}%–{r.maxP.toFixed(1)}%
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {r.minD}–{r.maxD} / {bossHp} HP
              </span>
            </div>
            <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
              {r.stab && <span style={{ fontSize: 10, fontWeight: 800, color: '#818cf8', background: 'rgba(129,140,248,.15)', padding: '2px 6px', borderRadius: 4 }}>STAB</span>}
              <span style={{ fontSize: 12, fontWeight: 800, color: effColor(r.eff) }}>{effLabel(r.eff)}</span>
              {r.maxP >= 100 && <span style={{ fontSize: 10, fontWeight: 800, color: '#f87171', background: 'rgba(248,113,113,.15)', padding: '2px 6px', borderRadius: 4 }}>OHKO</span>}
            </div>
          </div>
          {/* Damage bar */}
          <div style={{ height: 6, background: 'rgba(255,255,255,.07)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, r.maxP)}%`,
              background: r.maxP >= 100 ? '#ef4444' : r.maxP >= 50 ? '#f59e0b' : 'var(--primary)',
              borderRadius: 3,
              transition: 'width .4s ease',
            }} />
          </div>
        </div>
      )}
      {r?.immune && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
          🛡 Immune — {slot.data?.name} deals 0 damage with {slot.moveName}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Results Panel
// ─────────────────────────────────────────────────────────────────────────────

function ResultsPanel({ slots, boss, totalHp }: { slots: TeamSlot[]; boss: BossState; totalHp: number }) {
  const valid = slots.filter(s => s.result && !s.result.immune);
  if (!valid.length) return null;

  const teamDmgPerPass = valid.reduce((acc, s) => acc + (s.result!.avgD), 0);
  const teamPctPerPass = totalHp > 0 ? teamDmgPerPass / totalHp * 100 : 0;
  const allRaidersPctPerPass = teamPctPerPass * boss.numRaiders;
  const passesNeeded = allRaidersPctPerPass > 0 ? Math.ceil(100 / allRaidersPctPerPass) : 999;

  const winLikely = passesNeeded <= 1;
  const winPossible = passesNeeded <= 2;

  return (
    <div style={{ ...CARD, border: `1px solid ${winLikely ? 'rgba(52,211,153,.3)' : winPossible ? 'rgba(251,191,36,.3)' : 'rgba(248,113,113,.3)'}`, background: winLikely ? 'rgba(52,211,153,.04)' : winPossible ? 'rgba(251,191,36,.04)' : 'rgba(248,113,113,.04)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: winLikely ? '#34d399' : winPossible ? '#fbbf24' : '#f87171', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
        {winLikely ? '✅ Team can win' : winPossible ? '⚠️ Marginal — might need more raids' : '❌ Not enough damage'}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
        <Stat label="Boss Total HP" value={totalHp.toLocaleString()} />
        <Stat label="Team DMG / Pass" value={`${teamPctPerPass.toFixed(1)}%`} sub={`${Math.round(teamDmgPerPass).toLocaleString()} dmg`} />
        <Stat label="All Raiders / Pass" value={`${allRaidersPctPerPass.toFixed(1)}%`} sub={`${boss.numRaiders} raiders × team`} />
        <Stat label="Passes to KO" value={passesNeeded >= 999 ? '∞' : String(passesNeeded)} color={passesNeeded <= 1 ? '#34d399' : passesNeeded <= 2 ? '#fbbf24' : '#f87171'} />
      </div>

      {/* Per-slot summary */}
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>Damage contribution</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {[...valid].sort((a, b) => (b.result!.avgP) - (a.result!.avgP)).map(s => (
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

// ─────────────────────────────────────────────────────────────────────────────
// Auto-Find Panel
// ─────────────────────────────────────────────────────────────────────────────

function AutoFindPanel({ boss, onLoadSlots }: { boss: BossState; onLoadSlots: (slots: Partial<TeamSlot>[]) => void }) {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<AutoCandidate[]>([]);
  const [prefCat, setPrefCat] = useState<'auto' | 'Physical' | 'Special'>('auto');
  const cancelRef = useRef(false);

  const bossTypes = boss.data ? (boss.teraType ? [boss.teraType] : boss.data.types) : [];
  const weaknesses = boss.data ? weaknessChart(bossTypes) : { quad: [], double: [], half: [], quarter: [], immune: [] };
  const superEffTypes = [...weaknesses.quad, ...weaknesses.double];

  // Determine preferred attack category from boss stats
  const autoCat: 'Physical' | 'Special' = (() => {
    if (!boss.data) return 'Physical';
    const bDef = calcStat(boss.data.stats.def, 0, 31, false, 1, boss.level);
    const bSpd = calcStat(boss.data.stats.spd, 0, 31, false, 1, boss.level);
    return bDef > bSpd ? 'Special' : 'Physical';
  })();

  const effectiveCat = prefCat === 'auto' ? autoCat : prefCat;

  const run = useCallback(async () => {
    if (!boss.data) return;
    cancelRef.current = false;
    setRunning(true);
    setProgress(0);
    setResults([]);

    const totalHp = getTotalHp(boss);
    const bossHp = getBossHp(boss);
    const bossTypes = boss.teraType ? [boss.teraType] : boss.data.types;
    const bossFake: PokeData = { ...boss.data, stats: { ...boss.data.stats, hp: Math.round(boss.data.stats.hp * (RAID_TIERS[boss.raidTier] ?? 1)) } };
    const allNames = getAllPokemonNamesWithCustom();
    const CHUNK = 50;
    const candidates: AutoCandidate[] = [];

    for (let i = 0; i < allNames.length; i += CHUNK) {
      if (cancelRef.current) break;
      await new Promise<void>(r => setTimeout(r, 0));
      setProgress(Math.round(i / allNames.length * 100));

      for (let j = i; j < Math.min(i + CHUNK, allNames.length); j++) {
        const name = allNames[j];
        const data = lookupPokeWithCustom(name);
        if (!data) continue;
        // BST filter
        const bst = Object.values(data.stats).reduce((a, b) => a + b, 0);
        if (bst < 340) continue;

        const moves = getAllLearnableMoveNamesWithCustom(name);
        if (!moves.length) continue;

        // Find best move: prefer super-effective type + preferred category
        let bestMove: MoveData | null = null;
        let bestScore = -1;

        for (const mv of moves) {
          const eff = typeEff(mv.type, bossTypes);
          if (eff === 0) continue;
          const stab = data.types.includes(mv.type) ? 1.5 : 1;
          // Category bonus: strongly prefer matching category
          const catBonus = mv.cat === effectiveCat ? 1.0 : 0.5;
          const score = eff * mv.bp * stab * catBonus;
          if (score > bestScore) { bestScore = score; bestMove = mv; }
        }

        if (!bestMove) continue;

        const finalEff = typeEff(bestMove.type, bossTypes);
        if (finalEff < 1) continue; // only super-effective or neutral — skip resisted

        const bp = bestMove.bp;
        const res = runCalc({
          atkPoke: data, defPoke: bossFake,
          bp, cat: bestMove.cat, mtyp: bestMove.type,
          atkEvs: DEFAULT_EVS, defEvs: DEFAULT_EVS,
          atkIvs: DEFAULT_IVS, defIvs: DEFAULT_IVS,
          atkNat: 'Hardy', defNat: 'Hardy',
          atkTera: '', defTera: boss.teraType,
          atkItem: '(none)', atkStatus: 'Healthy',
          weather: 'None', doubles: false,
          atkScreen: false, defScreen: false,
          isCrit: false, zmove: false,
          atkLv: 100, defLv: boss.level,
        });

        if (!res || res.immune) continue;
        const avgD = (res.minD + res.maxD) / 2;
        const dmgPct = totalHp > 0 ? avgD / totalHp * 100 : (bossHp > 0 ? avgD / bossHp * 100 : 0);
        if (dmgPct < 0.05) continue;

        candidates.push({
          name: data.name, data, move: bestMove,
          eff: finalEff,
          stab: data.types.includes(bestMove.type),
          cat: bestMove.cat,
          dmgPct,
          score: dmgPct * finalEff,
        });
      }
    }

    // Sort by damage % (highest first)
    candidates.sort((a, b) => b.dmgPct - a.dmgPct);
    setResults(candidates.slice(0, 20));
    setProgress(100);
    setRunning(false);
  }, [boss, effectiveCat]);

  if (!boss.data) return (
    <div style={{ ...CARD, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
      Configure a boss first to find counters.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Boss weakness summary */}
      <div style={CARD}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Boss Type Weaknesses</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {weaknesses.quad.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#f87171', fontWeight: 800, width: 28 }}>4×</span>
              {weaknesses.quad.map(t => <TypeBadge key={t} t={t} />)}
            </div>
          )}
          {weaknesses.double.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#fbbf24', fontWeight: 800, width: 28 }}>2×</span>
              {weaknesses.double.map(t => <TypeBadge key={t} t={t} />)}
            </div>
          )}
          {weaknesses.half.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: '#6ee7b7', fontWeight: 700, width: 28 }}>½×</span>
              {weaknesses.half.map(t => <TypeBadge key={t} t={t} />)}
            </div>
          )}
          {weaknesses.immune.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, width: 28 }}>0×</span>
              {weaknesses.immune.map(t => <TypeBadge key={t} t={t} />)}
            </div>
          )}
        </div>
        {boss.data && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>Def: <strong style={{ color: autoCat === 'Special' ? '#f87171' : 'var(--text)' }}>{boss.data.stats.def}</strong></span>
            <span>SpD: <strong style={{ color: autoCat === 'Physical' ? '#f87171' : 'var(--text)' }}>{boss.data.stats.spd}</strong></span>
            <span style={{ color: '#818cf8', fontWeight: 700 }}>→ Use {autoCat} moves (weaker defense)</span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700 }}>Category:</span>
          {(['auto', 'Physical', 'Special'] as const).map(c => (
            <button key={c} onClick={() => setPrefCat(c)}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                background: prefCat === c ? 'var(--primary)' : 'rgba(255,255,255,.05)', color: 'var(--text)' }}>
              {c === 'auto' ? `Auto (${autoCat})` : c}
            </button>
          ))}
        </div>
        <button onClick={run} disabled={running} style={{ ...BTN('primary'), marginLeft: 'auto' }}>
          {running ? `🔍 Scanning… ${progress}%` : '🔍 Find Best Counters'}
        </button>
        {running && <button onClick={() => { cancelRef.current = true; setRunning(false); }} style={BTN('danger')}>Stop</button>}
      </div>

      {/* Results table */}
      {results.length > 0 && (
        <div style={CARD}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
            Top Counters — sorted by damage output vs this boss
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map((c, i) => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', background: 'rgba(0,0,0,.2)', borderRadius: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 18, fontWeight: 800 }}>#{i + 1}</span>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {c.data.types.map(t => <TypeBadge key={t} t={t} />)}
                </div>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#fff', minWidth: 100 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  <TypeBadge t={c.move.type} /> {c.move.name} ({c.move.cat[0]}) ·{c.move.bp}BP
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: effColor(c.eff) }}>{effLabel(c.eff)}</span>
                  {c.stab && <span style={{ fontSize: 10, fontWeight: 800, color: '#818cf8' }}>STAB</span>}
                </div>
                <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', fontFamily: "'JetBrains Mono',monospace", minWidth: 50, textAlign: 'right' }}>
                  {c.dmgPct.toFixed(1)}%
                </span>
                <button
                  onClick={() => onLoadSlots([{ name: c.name, data: c.data, moveName: c.move.name, moveData: c.move, level: 100, zmove: false }])}
                  style={{ ...BTN('ghost'), padding: '3px 8px', fontSize: 11 }}>
                  + Add
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-muted)' }}>
            % shown is average damage per hit vs <strong>total boss HP</strong> ({getTotalHp(boss).toLocaleString()} HP with {boss.numRaiders} raiders).
            Sorted by raw damage output. Items/abilities excluded (raid mechanics).
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Boss Config Panel
// ─────────────────────────────────────────────────────────────────────────────

function BossPanel({ boss, onChange }: { boss: BossState; onChange: (p: Partial<BossState>) => void }) {
  const handleNameChange = (name: string) => {
    const data = lookupPokeWithCustom(name);
    onChange({ name, data });
  };

  const baseHp = getBossHp(boss);
  const totalHp = getTotalHp(boss);

  return (
    <div style={{ ...CARD, border: '1px solid rgba(220,38,38,.2)', background: 'rgba(220,38,38,.03)' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#f87171', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
        👹 Raid Boss
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
        {/* Boss name */}
        <div style={{ gridColumn: 'span 2' }}>
          <label style={LBL}>Boss Pokémon</label>
          <AutoInput value={boss.name} onChange={handleNameChange} searchFn={searchPokemonWithCustom} placeholder="e.g. Nihilego" />
          {boss.data && (
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              {boss.data.types.map(t => <TypeBadge key={t} t={t} />)}
              <span style={{ fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center' }}>
                HP:{boss.data.stats.hp} Def:{boss.data.stats.def} SpD:{boss.data.stats.spd}
              </span>
            </div>
          )}
        </div>

        {/* Level */}
        <div>
          <label style={LBL}>Boss Level</label>
          <input style={INP} type="number" min={1} max={200} value={boss.level}
            onChange={e => onChange({ level: Math.max(1, parseInt(e.target.value) || 100) })} />
        </div>

        {/* Tera type */}
        <div>
          <label style={LBL}>Tera Type</label>
          <select style={INP} value={boss.teraType} onChange={e => onChange({ teraType: e.target.value })}>
            <option value="">— None —</option>
            {ALL_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {/* Raid tier */}
        <div style={{ gridColumn: 'span 2' }}>
          <label style={LBL}>Raid Tier</label>
          <select style={INP} value={boss.raidTier} onChange={e => onChange({ raidTier: e.target.value })}>
            {Object.keys(RAID_TIERS).map(k => <option key={k}>{k}</option>)}
          </select>
        </div>

        {/* Custom HP */}
        <div>
          <label style={LBL}>Custom HP Override</label>
          <input style={INP} type="number" min={0} value={boss.customHp}
            onChange={e => onChange({ customHp: Math.max(0, parseInt(e.target.value) || 0) })}
            placeholder="0 = use formula" />
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

      {/* HP summary */}
      {boss.data && (
        <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(0,0,0,.25)', borderRadius: 8, display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
          <span>Base HP (1 raider): <strong style={{ color: '#f87171' }}>{baseHp.toLocaleString()}</strong></span>
          {boss.numRaiders > 1 && (
            <span>Total HP ({boss.numRaiders} raiders): <strong style={{ color: '#f87171', fontSize: 14 }}>{totalHp.toLocaleString()}</strong></span>
          )}
          {boss.customHp > 0 && <span style={{ color: '#fbbf24', fontSize: 11 }}>⚠ Custom HP active</span>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

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

  const updateBoss = (p: Partial<BossState>) => {
    setBoss(b => ({ ...b, ...p }));
    setCalculated(false);
  };

  const updateSlot = (id: number, p: Partial<TeamSlot>) => {
    setSlots(ss => ss.map(s => s.id === id ? { ...s, ...p } : s));
    if (p.result === null || p.result === undefined) setCalculated(false);
  };

  const addSlot = () => {
    if (slots.length >= 6) return;
    setSlots(ss => [...ss, mkSlot()]);
    setCalculated(false);
  };

  const removeSlot = (id: number) => {
    setSlots(ss => ss.filter(s => s.id !== id));
    setCalculated(false);
  };

  const loadSlots = (partials: Partial<TeamSlot>[]) => {
    const extras: TeamSlot[] = partials.map(p => ({ ...mkSlot(), ...p }));
    setSlots(ss => {
      // Fill empty slots first, then append up to 6
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
  const calculatedSlots = slots.filter(s => s.result);

  if (sdState === 'loading') return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, gap: 12, color: 'var(--text-muted)' }}>
      <div style={{ width: 20, height: 20, border: '2px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      Loading Pokémon data…
    </div>
  );
  if (sdState === 'error') return (
    <div style={{ padding: 24, color: '#f87171', textAlign: 'center' }}>
      ❌ Failed to load Pokémon data. Check your connection and refresh.
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 960 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>⚔️ Raid Counter Calculator</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Build one team — all raiders use the same team
        </span>
      </div>

      {/* Boss Config */}
      <BossPanel boss={boss} onChange={updateBoss} />

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {([['team', '👥 Team Builder'], ['finder', '🔍 Auto-Find Counters']] as const).map(([tab, label]) => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
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
            {slots.map((slot, i) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                bossHp={totalHp}
                rank={calculated && slot.result && !slot.result.immune ? calculatedSlots.filter(s => !s.result?.immune).indexOf(slot) : null}
                onChange={p => updateSlot(slot.id, p)}
                onRemove={() => removeSlot(slot.id)}
              />
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {slots.length < 6 && (
              <button onClick={addSlot} style={BTN('ghost')}>
                + Add Pokémon {slots.length}/6
              </button>
            )}
            <button
              onClick={calculate}
              disabled={!boss.data || slots.every(s => !s.name || !s.moveName)}
              style={{ ...BTN('primary'), opacity: (!boss.data || slots.every(s => !s.name || !s.moveName)) ? 0.5 : 1 }}
            >
              ⚡ Calculate Damage
            </button>
            <button onClick={() => { setSlots([mkSlot(), mkSlot(), mkSlot()]); setCalculated(false); }} style={BTN('danger')}>
              🗑 Clear Team
            </button>
          </div>

          {/* Results */}
          {calculated && calculatedSlots.length > 0 && (
            <ResultsPanel slots={slots} boss={boss} totalHp={totalHp} />
          )}

          {/* Tips */}
          <div style={{ ...CARD, background: 'rgba(88,101,242,.04)', border: '1px solid rgba(88,101,242,.15)' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>
              💡 Raid Tips
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <div>1️⃣ Use the <strong>Auto-Find</strong> tab to see which Pokémon hit hardest against this boss.</div>
              <div>2️⃣ If boss <strong>Def &lt; SpD</strong>, prefer Physical moves. If <strong>SpD &lt; Def</strong>, prefer Special.</div>
              <div>3️⃣ <strong>STAB + Super Effective</strong> = 3× damage. Always try to match both.</div>
              <div>4️⃣ Raids have <strong>no items, no abilities, no status</strong> — raw stats and type matchups only.</div>
              <div>5️⃣ Boss HP <strong>scales up</strong> per raider. The more people join, the tankier the boss gets.</div>
              <div>6️⃣ Z-Moves deal <strong>massive burst damage</strong> — enable the Z toggle for relevant slots.</div>
            </div>
          </div>
        </>
      )}

      {/* Auto-Find Tab */}
      {activeTab === 'finder' && (
        <AutoFindPanel boss={boss} onLoadSlots={loadSlots} />
      )}
    </div>
  );
}
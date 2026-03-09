/**
 * mc_engine.ts — Monte Carlo raid simulation engine
 *
 * Responsibilities:
 *  - runMC:            synchronous single-threaded simulation (fallback / testing)
 *  - MC_WORKER_SRC:    inline blob worker code (pure arithmetic, no imports)
 *  - precomputeMCData: resolves Pokémon data into flat roll-arrays for the worker
 *  - runMCViaWorker:   dispatches a precomputed payload to the blob worker
 *
 * Worker message shape: { ...PrecomputedMCData, trials: number }
 * Worker response shape: SimResult
 */

import {
  lookupPoke, lookupMove, lookupPokeWithCustom, getLevelUpMoves,
  runCalc, calcStat, getNat, RAID_TIERS,
  type PokeData, type MoveData,
} from './engine_pokemon';

import type { BossConfig, CounterSlot, SimResult } from './raid_types';

// ── Synchronous runMC (kept for non-worker fallback / unit tests) ─────────────
export function runMC(
  boss: BossConfig, counters: CounterSlot[], bossHP: number,
  trials: number, policy: string, moveWeights?: number[]
): SimResult | null {
  if (!boss.data) return null;
  const raidMult = RAID_TIERS[boss.raidTier] ?? 1;
  const bossFake: PokeData = { ...boss.data, stats: { ...boss.data.stats, hp: Math.round(boss.data.stats.hp * raidMult) } };
  // Use custom movepool if set, otherwise fall back to level-up moves
  const bossMoves: MoveData[] = (boss.customMoves?.length) ? boss.customMoves : getLevelUpMoves(boss.name);
  if (!bossMoves.length) return null;

  const atkToBoss = counters.map(slot => {
    const ad = slot.data || lookupPokeWithCustom(slot.name);
    const mv = slot.moveData || lookupMove(slot.moveName);
    if (!ad || !mv || !mv.bp) return null;
    const res = runCalc({
      atkPoke: ad, defPoke: bossFake, bp: mv.bp, cat: mv.cat, mtyp: mv.type,
      atkEvs: slot.evs, defEvs: boss.evs, atkIvs: slot.ivs, defIvs: boss.ivs,
      atkNat: slot.nature, defNat: boss.nature, atkTera: slot.teraType, defTera: boss.teraType,
      atkItem: slot.item, atkStatus: 'Healthy', weather: boss.weather, doubles: boss.doubles,
      atkScreen: false, defScreen: boss.defScreen, isCrit: slot.isCrit, zmove: slot.zmove,
      atkLv: slot.level || 100, defLv: boss.level || 100,
    });
    return res && !res.immune ? { rolls: res.rolls, immune: false } : { rolls: [], immune: true };
  });

  const bossToAtk = bossMoves.map(mv =>
    counters.map(slot => {
      const ad = slot.data || lookupPokeWithCustom(slot.name);
      if (!ad) return null;
      const res = runCalc({
        atkPoke: bossFake, defPoke: ad, bp: mv.bp, cat: mv.cat, mtyp: mv.type,
        atkEvs: boss.evs, defEvs: slot.evs, atkIvs: boss.ivs, defIvs: slot.ivs,
        atkNat: boss.nature, defNat: slot.nature, atkTera: boss.teraType, defTera: slot.teraType,
        atkItem: '(none)', atkStatus: 'Healthy', weather: boss.weather, doubles: boss.doubles,
        atkScreen: boss.defScreen, defScreen: false, isCrit: false, zmove: false,
        atkLv: boss.level || 100, defLv: slot.level || 100,
      });
      return res && !res.immune ? { rolls: res.rolls, immune: false } : { rolls: [], immune: true };
    })
  );

  const atkHPs  = counters.map(s => { const d = s.data || lookupPoke(s.name); return d ? calcStat(d.stats.hp,  s.evs.hp,  s.ivs.hp,  true,  1,                       s.level || 100) : 0; });
  const atkSpes = counters.map(s => { const d = s.data || lookupPoke(s.name); return d ? calcStat(d.stats.spe, s.evs.spe, s.ivs.spe, false, getNat(s.nature, 'spe'), s.level || 100) : 0; });
  const bossSpe = calcStat(boss.data.stats.spe, boss.evs.spe, boss.ivs.spe, false, getNat(boss.nature, 'spe'), boss.level || 100);
  const totalBP = bossMoves.reduce((s, m) => s + m.bp, 0);
  const cumBP   = bossMoves.map((_, i) => bossMoves.slice(0, i + 1).reduce((s, m) => s + m.bp, 0));

  // Build normalised cumulative weight array for custom policy
  const rawW   = (policy === 'custom' && moveWeights?.length === bossMoves.length) ? moveWeights : bossMoves.map(() => 1);
  const totalW = rawW.reduce((a, b) => a + b, 0) || 1;
  const cumW   = rawW.map((_, i) => rawW.slice(0, i + 1).reduce((a, b) => a + b, 0) / totalW);

  const shieldHP  = boss.shieldActivatesAt  > 0 ? bossHP * boss.shieldActivatesAt / 100 : -1;
  const shieldRed = (boss.shieldDamageReduction > 0 && boss.shieldDamageReduction < 1) ? (1 - boss.shieldDamageReduction) : 1;

  const pickMv = (cyclicRef: { v: number }) => {
    if (policy === 'uniform')   return Math.floor(Math.random() * bossMoves.length);
    if (policy === 'cyclic')    { const idx = cyclicRef.v % bossMoves.length; cyclicRef.v++; return idx; }
    if (policy === 'custom')    { const r = Math.random(); const i = cumW.findIndex(w => r <= w); return i < 0 ? 0 : i; }
    // bpweighted
    const r = Math.random() * totalBP;
    const i = cumBP.findIndex(cp => r <= cp);
    return i < 0 ? 0 : i;
  };

  const sr  = (rolls: number[]) => rolls[Math.floor(Math.random() * 16)];
  const acc = counters.map(() => ({ hd: 0, hs: 0, dd: 0, dt: 0, ok: 0, ot: 0, used: 0 }));
  const needed: number[] = [];

  for (let t = 0; t < trials; t++) {
    let bhp = bossHP, used = 0, won = false;
    const cyclicRef = { v: 0 };
    for (let si = 0; si < counters.length && bhp > 0; si++) {
      const ac = atkToBoss[si];
      if (!ac || ac.immune || !atkHPs[si]) continue;
      used++; acc[si].used++;
      let ahp = atkHPs[si], hd = 0, hs = 0, dd = 0, dt = 0, first = true;
      while (bhp > 0 && ahp > 0) {
        const shielded = shieldHP > 0 && bhp <= shieldHP;
        const af = atkSpes[si] >= bossSpe;
        if (af) {
          let d = sr(ac.rolls);
          if (shielded) d = Math.max(1, Math.floor(d * shieldRed));
          bhp -= d; hd++; dd += d;
          if (bhp <= 0) { won = true; break; }
        }
        const mi = pickMv(cyclicRef);
        const bc = bossToAtk[mi]?.[si];
        if (bc && !bc.immune && bc.rolls.length) {
          const d = sr(bc.rolls);
          if (first) { acc[si].ot++; if (d >= ahp) acc[si].ok++; first = false; }
          ahp -= d; hs++; dt += d;
        }
        if (!af && ahp > 0) {
          let d = sr(ac.rolls);
          if (shielded) d = Math.max(1, Math.floor(d * shieldRed));
          bhp -= d; hd++; dd += d;
          if (bhp <= 0) { won = true; break; }
        }
      }
      acc[si].hd += hd; acc[si].hs += hs; acc[si].dd += dd; acc[si].dt += dt;
      if (won) break;
    }
    needed.push(won ? used : counters.length + 1);
  }

  const s    = [...needed].sort((a, b) => a - b);
  const hist: Record<number, number> = {};
  for (const n of needed) hist[n] = (hist[n] || 0) + 1;
  return {
    trials,
    mean:   needed.reduce((a, b) => a + b, 0) / trials,
    median: s[Math.floor(trials / 2)],
    p90:    s[Math.floor(trials * 0.9)],
    pWin:   needed.filter(n => n <= counters.length).length / trials,
    hist, policy,
    perSlot: counters.map((slot, i) => {
      const a = acc[i], u = a.used || 1;
      return { name: slot.name || '—', avgHd: a.hd / u, avgHs: a.hs / u, ohko: a.ot ? a.ok / a.ot : 0, avgDd: a.dd / u, avgDt: a.dt / u };
    }),
  };
}

// ── Inline Blob Worker ────────────────────────────────────────────────────────
/**
 * The worker receives a precomputed payload (plain arrays/numbers) and runs
 * the MC inner loop. No Pokémon data imports needed — pure arithmetic.
 *
 * Payload shape (PrecomputedMCData + trials):
 *   atkToBoss:    Array<{immune,rolls}|null>     — attacker damage arrays
 *   bossToAtk:    Array<Array<{immune,rolls}>>   — boss move × attacker arrays
 *   atkHPs:       number[]
 *   atkSpes:      number[]
 *   bossSpe:      number
 *   totalBP:      number
 *   cumBP:        number[]
 *   rawW:         number[]
 *   cumW:         number[]
 *   policy:       string
 *   trials:       number
 *   bossHP:       number
 *   counterNames: string[]
 *   shieldActivatesAt:    number   (0 = off)
 *   shieldDamageReduction: number  (fraction, e.g. 0.5)
 */
export const MC_WORKER_SRC = `
self.onmessage = function(e) {
  try {
    const results = runMCInner(e.data);
    self.postMessage(results);
  } catch(err) {
    self.postMessage({ __error: String(err) });
  }
};

function runMCInner(p) {
  const { atkToBoss, bossToAtk, atkHPs, atkSpes, bossSpe,
          totalBP, cumBP, rawW, cumW, policy, trials, bossHP, counterNames,
          shieldActivatesAt, shieldDamageReduction } = p;

  // Validate rawW length matches bossToAtk length (guard against custom policy misconfiguration)
  const safeRawW = (rawW && rawW.length === bossToAtk.length) ? rawW : bossToAtk.map(() => 1);
  const safeTotW = safeRawW.reduce((a,b)=>a+b,0) || 1;
  const safeCumW = safeRawW.map((_,i)=>safeRawW.slice(0,i+1).reduce((a,b)=>a+b,0)/safeTotW);

  const shieldHP  = shieldActivatesAt > 0 ? bossHP * shieldActivatesAt / 100 : -1;
  const shieldRed = (shieldDamageReduction > 0 && shieldDamageReduction < 1) ? (1 - shieldDamageReduction) : 1;
  const sr  = (rolls) => rolls[Math.floor(Math.random()*16)];
  const acc = counterNames.map(() => ({hd:0,hs:0,dd:0,dt:0,ok:0,ot:0,used:0}));
  const needed = [];

  for (let t = 0; t < trials; t++) {
    let bhp = bossHP, used = 0, won = false;
    const cyclicRef = {v:0};
    for (let si = 0; si < atkToBoss.length && bhp > 0; si++) {
      const ac = atkToBoss[si];
      if (!ac || ac.immune || !atkHPs[si]) continue;
      used++; acc[si].used++;
      let ahp = atkHPs[si], hd=0, hs=0, dd=0, dt=0, first=true;
      while (bhp > 0 && ahp > 0) {
        const shielded = shieldHP > 0 && bhp <= shieldHP;
        const af = atkSpes[si] >= bossSpe;
        if (af) {
          let d = sr(ac.rolls);
          if (shielded) d = Math.max(1, Math.floor(d * shieldRed));
          bhp -= d; hd++; dd += d;
          if (bhp <= 0) { won = true; break; }
        }
        let mi;
        if (policy==='uniform')   mi = Math.floor(Math.random()*bossToAtk.length);
        else if (policy==='cyclic') { mi = cyclicRef.v % bossToAtk.length; cyclicRef.v++; }
        else if (policy==='custom') { const r=Math.random(); mi=safeCumW.findIndex(w=>r<=w); if(mi<0)mi=0; }
        else { const r=Math.random()*totalBP; mi=cumBP.findIndex(cp=>r<=cp); if(mi<0)mi=0; }
        const bc = bossToAtk[mi] && bossToAtk[mi][si];
        if (bc && !bc.immune && bc.rolls.length) {
          const d = sr(bc.rolls);
          if (first) { acc[si].ot++; if(d>=ahp) acc[si].ok++; first=false; }
          ahp -= d; hs++; dt += d;
        }
        if (!af && ahp > 0) {
          let d = sr(ac.rolls);
          if (shielded) d = Math.max(1, Math.floor(d * shieldRed));
          bhp -= d; hd++; dd += d;
          if (bhp <= 0) { won = true; break; }
        }
      }
      acc[si].hd+=hd; acc[si].hs+=hs; acc[si].dd+=dd; acc[si].dt+=dt;
      if (won) break;
    }
    needed.push(won ? used : atkToBoss.length + 1);
  }

  const s    = [...needed].sort((a,b)=>a-b);
  const hist = {};
  for (const n of needed) hist[n] = (hist[n]||0)+1;
  return {
    trials, hist, policy,
    mean:   needed.reduce((a,b)=>a+b,0)/trials,
    median: s[Math.floor(trials/2)],
    p90:    s[Math.floor(trials*.9)],
    pWin:   needed.filter(n=>n<=atkToBoss.length).length/trials,
    perSlot: counterNames.map((name,i) => {
      const a=acc[i], u=a.used||1;
      return {name, avgHd:a.hd/u, avgHs:a.hs/u, ohko:a.ot?a.ok/a.ot:0, avgDd:a.dd/u, avgDt:a.dt/u};
    }),
  };
}
`;

// Lazily created blob URL — reused across all simulation runs
let _mcWorkerURL: string | null = null;
export function getMCWorkerURL(): string {
  if (!_mcWorkerURL) {
    const blob = new Blob([MC_WORKER_SRC], { type: 'application/javascript' });
    _mcWorkerURL = URL.createObjectURL(blob);
  }
  return _mcWorkerURL;
}

// ── precomputeMCData ──────────────────────────────────────────────────────────
/**
 * Resolves all BossConfig + CounterSlot data into plain roll arrays that can
 * be JSON-serialised and sent to the Web Worker.
 *
 * @param boss         Full boss configuration (data must be non-null)
 * @param counters     Counter slots (data/name must resolve)
 * @param bossHP       Effective boss HP (already scaled for raiders)
 * @param policy       Move selection policy: 'uniform'|'bpweighted'|'cyclic'|'custom'
 * @param moveWeights  Optional per-move weights for 'custom' policy (same order as bossMoves)
 */
export function precomputeMCData(
  boss: BossConfig, counters: CounterSlot[], bossHP: number,
  policy: string, moveWeights?: number[]
) {
  if (!boss.data) return null;
  const raidMult = RAID_TIERS[boss.raidTier] ?? 1;
  const bossFake: PokeData = { ...boss.data, stats: { ...boss.data.stats, hp: Math.round(boss.data.stats.hp * raidMult) } };
  const bossMoves: MoveData[] = (boss.customMoves?.length) ? boss.customMoves : getLevelUpMoves(boss.name);
  if (!bossMoves.length) return null;

  const atkToBoss = counters.map(slot => {
    const ad = slot.data || lookupPokeWithCustom(slot.name);
    const mv = slot.moveData || lookupMove(slot.moveName);
    if (!ad || !mv || !mv.bp) return { immune: true, rolls: [] };
    const res = runCalc({
      atkPoke: ad, defPoke: bossFake, bp: mv.bp, cat: mv.cat, mtyp: mv.type,
      atkEvs: slot.evs, defEvs: boss.evs, atkIvs: slot.ivs, defIvs: boss.ivs,
      atkNat: slot.nature, defNat: boss.nature, atkTera: slot.teraType, defTera: boss.teraType,
      atkItem: slot.item, atkStatus: 'Healthy', weather: boss.weather, doubles: boss.doubles,
      atkScreen: false, defScreen: boss.defScreen, isCrit: slot.isCrit, zmove: slot.zmove,
      atkLv: slot.level || 100, defLv: boss.level || 100,
    });
    return res && !res.immune ? { immune: false, rolls: res.rolls } : { immune: true, rolls: [] };
  });

  const bossToAtk = bossMoves.map(mv =>
    counters.map(slot => {
      const ad = slot.data || lookupPokeWithCustom(slot.name);
      if (!ad) return { immune: true, rolls: [] };
      const res = runCalc({
        atkPoke: bossFake, defPoke: ad, bp: mv.bp, cat: mv.cat, mtyp: mv.type,
        atkEvs: boss.evs, defEvs: slot.evs, atkIvs: boss.ivs, defIvs: slot.ivs,
        atkNat: boss.nature, defNat: slot.nature, atkTera: boss.teraType, defTera: slot.teraType,
        atkItem: '(none)', atkStatus: 'Healthy', weather: boss.weather, doubles: boss.doubles,
        atkScreen: boss.defScreen, defScreen: false, isCrit: false, zmove: false,
        atkLv: boss.level || 100, defLv: slot.level || 100,
      });
      return res && !res.immune ? { immune: false, rolls: res.rolls } : { immune: true, rolls: [] };
    })
  );

  const atkHPs  = counters.map(s => { const d = s.data || lookupPokeWithCustom(s.name); return d ? calcStat(d.stats.hp,  s.evs.hp,  s.ivs.hp,  true,  1,                       s.level || 100) : 0; });
  const atkSpes = counters.map(s => { const d = s.data || lookupPokeWithCustom(s.name); return d ? calcStat(d.stats.spe, s.evs.spe, s.ivs.spe, false, getNat(s.nature, 'spe'), s.level || 100) : 0; });
  const bossSpe = calcStat(boss.data.stats.spe, boss.evs.spe, boss.ivs.spe, false, getNat(boss.nature, 'spe'), boss.level || 100);
  const totalBP = bossMoves.reduce((s, m) => s + m.bp, 0);
  const cumBP   = bossMoves.map((_, i) => bossMoves.slice(0, i + 1).reduce((s, m) => s + m.bp, 0));

  // Build cumulative weight array (custom policy uses provided weights; others ignored by worker)
  const rawW   = (policy === 'custom' && moveWeights?.length === bossMoves.length) ? moveWeights : bossMoves.map(() => 1);
  const totW   = rawW.reduce((a, b) => a + b, 0) || 1;
  const cumW   = rawW.map((_, i) => rawW.slice(0, i + 1).reduce((a, b) => a + b, 0) / totW);

  return {
    atkToBoss, bossToAtk, atkHPs, atkSpes, bossSpe, totalBP, cumBP, rawW, cumW,
    counterNames: counters.map(s => s.name || '—'), bossHP, policy,
    shieldActivatesAt:     boss.shieldActivatesAt     || 0,
    shieldDamageReduction: boss.shieldDamageReduction || 0,
  };
}

// ── runMCViaWorker ────────────────────────────────────────────────────────────
/**
 * Dispatches a simulation to the Blob Worker and returns a promise.
 * Falls back to null on any worker error (UI handles display).
 */
export function runMCViaWorker(
  boss: BossConfig, counters: CounterSlot[], bossHP: number,
  trials: number, policy: string, moveWeights?: number[]
): Promise<SimResult | null> {
  return new Promise(resolve => {
    const pre = precomputeMCData(boss, counters, bossHP, policy, moveWeights);
    if (!pre) { resolve(null); return; }
    try {
      const worker = new Worker(getMCWorkerURL());
      worker.onmessage = (e) => {
        // Worker sends { __error } on caught exceptions
        if (e.data?.__error) { console.error('[MC Worker]', e.data.__error); resolve(null); }
        else resolve(e.data as SimResult);
        worker.terminate();
      };
      worker.onerror = (err) => { console.error('[MC Worker onerror]', err); resolve(null); worker.terminate(); };
      worker.postMessage({ ...pre, trials });
    } catch (err) { console.error('[MC Worker spawn]', err); resolve(null); }
  });
}

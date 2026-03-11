// ─────────────────────────────────────────────────────────────────────────────
// engine.ts  –  Pokémon data loader + damage calc + shared UI components
// No server dependencies. Loads from Showdown CDN, caches in localStorage.
// ─────────────────────────────────────────────────────────────────────────────
import type React from 'react';
import { useState, useEffect } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PokeStat { hp:number; atk:number; def:number; spa:number; spd:number; spe:number }
export interface PokeData  { name:string; types:string[]; stats:PokeStat; bst:number; abilities:string[]; weaknesses:Record<string,string[]> }
export interface MoveData  { name:string; bp:number; cat:string; type:string }

// ── Gen 9 type chart (fully inline — no network needed) ───────────────────────
const TYPECHART: Record<string,Record<string,number>> = (() => {
  const se: Record<string,string[]> = {
    Fire:['Grass','Ice','Bug','Steel'],Water:['Fire','Ground','Rock'],
    Grass:['Water','Ground','Rock'],Electric:['Water','Flying'],
    Ice:['Grass','Ground','Flying','Dragon'],Fighting:['Normal','Ice','Rock','Dark','Steel'],
    Poison:['Grass','Fairy'],Ground:['Fire','Electric','Poison','Rock','Steel'],
    Flying:['Grass','Fighting','Bug'],Psychic:['Fighting','Poison'],
    Bug:['Grass','Psychic','Dark'],Rock:['Fire','Ice','Flying','Bug'],
    Ghost:['Psychic','Ghost'],Dragon:['Dragon'],Dark:['Psychic','Ghost'],
    Steel:['Ice','Rock','Fairy'],Fairy:['Fighting','Dragon','Dark'],Normal:[],
  };
  const nve: Record<string,string[]> = {
    Fire:['Fire','Water','Rock','Dragon'],Water:['Water','Grass','Dragon'],
    Grass:['Fire','Grass','Poison','Flying','Bug','Dragon','Steel'],
    Electric:['Electric','Grass','Dragon'],Ice:['Water','Ice'],
    Fighting:['Poison','Bug','Psychic','Flying','Fairy'],Poison:['Poison','Ground','Rock','Ghost'],
    Ground:['Grass','Bug'],Flying:['Electric','Rock','Steel'],Psychic:['Psychic','Steel'],
    Bug:['Fire','Fighting','Flying','Ghost','Steel','Fairy'],Rock:['Fighting','Ground','Steel'],
    Ghost:['Dark'],Dragon:['Steel'],Dark:['Fighting','Dark','Fairy'],
    Steel:['Fire','Water','Electric','Steel'],Fairy:['Fire','Poison','Steel'],Normal:['Rock','Steel'],
  };
  const imm: Record<string,string[]> = {
    Normal:['Ghost'],Electric:['Ground'],Fighting:['Ghost'],Poison:['Steel'],
    Ground:['Flying'],Ghost:['Normal','Fighting'],Dragon:['Fairy'],Dark:['Psychic'],Steel:['Poison'],Psychic:[],
  };
  const ALL = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
  const tc: Record<string,Record<string,number>> = {};
  for (const dt of ALL) tc[dt] = {};
  for (const at of ALL) {
    for (const dt of (se[at]||[]))  tc[dt][at] = 2;
    for (const dt of (nve[at]||[])) tc[dt][at] = 0.5;
    for (const dt of (imm[at]||[])) tc[dt][at] = 0;
  }
  // Shadow: always super-effective vs every type.
  // Per-type multiplier = 2×, so single-type defender = 2×, dual-type defender = 2×2 = 4×.
  const allDef = [...ALL, 'Shadow'];
  tc['Shadow'] = Object.fromEntries(allDef.map(d => [d, 2])); // defending AS Shadow: 2× per type
  for (const at of allDef) {
    if (!tc[at]) tc[at] = {};
    tc[at]['Shadow'] = 2; // Shadow attacking: 2× per defending type (2× single-type, 4× dual-type)
  }
  return tc;
})();

export const ALL_TYPES = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy','Shadow'];
export const TC_COLORS: Record<string,string> = {
  Fire:'#FF4422',Water:'#3399FF',Grass:'#33CC44',Electric:'#FFCC00',Ice:'#66CCFF',
  Fighting:'#CC3300',Poison:'#993399',Ground:'#CCAA55',Flying:'#88AAFF',Psychic:'#FF5599',
  Bug:'#AABB22',Rock:'#BBAA66',Ghost:'#664477',Dragon:'#7744FF',Dark:'#554433',
  Steel:'#AAAABB',Fairy:'#FFAACC',Normal:'#AAAA88',Shadow:'#5A0099',
};

export function typeEff(atkType: string, defTypes: string[]): number {
  let m = 1;
  for (const dt of defTypes) {
    const v = TYPECHART[dt]?.[atkType];
    if (v === 0) return 0;
    if (v !== undefined) m *= v;
  }
  return m;
}

export function weaknessChart(defTypes: string[], ability = '') {
  const out: Record<string,string[]> = { quad:[],double:[],half:[],quarter:[],immune:[] };
  const levitate = ability.toLowerCase().includes('levitate');
  for (const at of ALL_TYPES) {
    if (levitate && at === 'Ground') { out.immune.push(at); continue; }
    const m = typeEff(at, defTypes);
    if (m === 0)    out.immune.push(at);
    else if (m <= 0.26) out.quarter.push(at);
    else if (m <= 0.51) out.half.push(at);
    else if (m >= 3.9)  out.quad.push(at);
    else if (m >= 1.9)  out.double.push(at);
  }
  return out;
}

// ── CDN Loader ────────────────────────────────────────────────────────────────
const CDN = 'https://play.pokemonshowdown.com/data';
const TTL = 24 * 3600 * 1000;

let _dex: Record<string,any> | null = null;
let _mvs: Record<string,any> | null = null;
let _lrn: Record<string,any> | null = null;
let _loading = false;
let _waiters: Array<(ok:boolean)=>void> = [];

function _rc(k: string): Record<string,any>|null {
  try {
    const r = localStorage.getItem('pkt_' + k);
    if (!r) return null;
    const { ts, data } = JSON.parse(r);
    if (Date.now() - ts > TTL) { localStorage.removeItem('pkt_' + k); return null; }
    return data;
  } catch { return null; }
}
function _wc(k: string, d: Record<string,any>) {
  try { localStorage.setItem('pkt_' + k, JSON.stringify({ ts: Date.now(), data: d })); } catch {}
}

export async function loadSdData(): Promise<boolean> {
  if (_dex && _mvs) return true;
  if (_loading) return new Promise(r => _waiters.push(r));
  _loading = true;
  _dex = _rc('pokedex'); _mvs = _rc('moves'); _lrn = _rc('learnsets');
  const jobs: Promise<void>[] = [];
  if (!_dex) jobs.push(fetch(`${CDN}/pokedex.json`).then(r=>r.json()).then(d=>{_dex=d;_wc('pokedex',d);}).catch(()=>{_dex={};}));
  if (!_mvs) jobs.push(fetch(`${CDN}/moves.json`).then(r=>r.json()).then(d=>{_mvs=d;_wc('moves',d);}).catch(()=>{_mvs={};}));
  if (!_lrn) jobs.push(fetch(`${CDN}/learnsets.json`).then(r=>r.json()).then(d=>{_lrn=d;_wc('learnsets',d);}).catch(()=>{_lrn={};}));
  await Promise.all(jobs);
  _loading = false;
  const ok = Object.keys(_dex||{}).length > 0;
  _waiters.forEach(fn => fn(ok)); _waiters = [];
  return ok;
}

export function useShowdownData() {
  const [state, setState] = useState<'loading'|'ready'|'error'>((_dex&&_mvs)?'ready':'loading');
  useEffect(() => {
    if (_dex && _mvs) { setState('ready'); return; }
    loadSdData().then(ok => setState(ok ? 'ready' : 'error'));
  }, []);
  return state;
}

// ── Lookup helpers ────────────────────────────────────────────────────────────
export const _key = (n: string) => (n||'').toLowerCase().replace(/[\s\-'.]/g,'');

export function lookupPoke(name: string): PokeData|null {
  if (!_dex) return null;
  const e = _dex[_key(name)]; if (!e) return null;
  const s = e.baseStats || {};
  const abilities = Object.values(e.abilities||{}) as string[];
  const types = e.types || [];
  return { name:e.name||name, types, stats:{hp:s.hp||0,atk:s.atk||0,def:s.def||0,spa:s.spa||0,spd:s.spd||0,spe:s.spe||0},
    bst: Object.values(s as Record<string,number>).reduce((a,b)=>a+b,0), abilities,
    weaknesses: weaknessChart(types, abilities[0]||'') };
}

export function lookupMove(name: string): MoveData|null {
  if (!_mvs) return null;
  const e = _mvs[_key(name)] as any; if (!e) return null;
  return { name:e.name||name, bp:e.basePower||0, cat:e.category||'Physical', type:e.type||'Normal' };
}

export function searchPokemon(q: string, limit = 25): string[] {
  if (!q || !_dex) return [];
  const k = _key(q); const results: string[] = [];
  for (const [key, val] of Object.entries(_dex)) {
    if (key.includes(k) || _key(val.name||'').includes(k)) {
      results.push(val.name||key);
      if (results.length >= limit) break;
    }
  }
  return results;
}

export function searchMoves(q: string, limit = 25): string[] {
  if (!q || !_mvs) return [];
  const k = _key(q); const results: string[] = [];
  for (const [key, val] of Object.entries(_mvs)) {
    const mv = val as any;
    if (!mv.basePower) continue;
    if (key.includes(k) || _key(mv.name||'').includes(k)) {
      results.push(mv.name||key);
      if (results.length >= limit) break;
    }
  }
  return results;
}

/** Search moves including custom Pokémon learnsets (so custom moves like Shadow Storm appear). */
export function searchMovesWithCustom(q: string, limit = 25): string[] {
  const base = searchMoves(q, limit);
  if (!q) return base;
  const k = _key(q);
  const customMoveNames: string[] = [];
  const seen = new Set(base.map(_key));
  for (const moves of Object.values(_customLearnsets)) {
    for (const mv of moves) {
      const mk = _key(mv.name);
      if (!seen.has(mk) && mk.includes(k)) {
        customMoveNames.push(mv.name);
        seen.add(mk);
      }
    }
  }
  return [...customMoveNames, ...base].slice(0, limit);
}

function _learnsetEntry(pokeName: string): any {
  if (!_lrn) return {};
  const k = _key(pokeName);
  let entry = (_lrn as any)[k] || (_lrn as any)[k + 'base'];
  if (entry) return entry;
  if (_dex) {
    const dexEntry = (_dex as any)[k];
    const baseSpecies = dexEntry?.baseSpecies;
    if (typeof baseSpecies === 'string') {
      const bk = _key(baseSpecies);
      entry = (_lrn as any)[bk] || (_lrn as any)[bk + 'base'];
      if (entry) return entry;
    }
  }
  return {};
}

export function getLevelUpMoves(pokeName: string): Array<{level:number;name:string;type:string;cat:string;bp:number}> {
  if (!_lrn || !_mvs) return [];
  const entry = _learnsetEntry(pokeName);
  const learnset = (entry.learnset || {}) as Record<string,string[]>;
  const result: Record<string,{level:number;name:string;type:string;cat:string;bp:number}> = {};
  for (const [moveKey, sources] of Object.entries(learnset)) {
    let level: number|null = null;
    for (const src of sources) {
      const m = src.match(/^(\d)L(\d+)$/);
      if (m) { level = parseInt(m[2]); break; }
    }
    if (level === null) continue;
    const mv = (_mvs as any)[moveKey];
    if (!mv || !mv.basePower || mv.category === 'Status') continue;
    result[`${level}_${moveKey}`] = { level, name:mv.name||moveKey, type:mv.type||'Normal', cat:mv.category||'Physical', bp:mv.basePower };
  }
  return Object.values(result).sort((a,b) => b.bp - a.bp || a.level - b.level).slice(0,12);
}

// ── Dex iterators (used by auto-finder) ──────────────────────────────────────
export function getAllPokemonNames(): string[] {
  if (!_dex) return [];
  return Object.values(_dex as Record<string,any>)
    .map((e: any) => e.name || '')
    .filter(Boolean);
}

/** All damaging moves a Pokémon can learn (any generation, any method). */
export function getAllLearnableMoveNames(pokeName: string): MoveData[] {
  if (!_lrn || !_mvs) return [];
  const entry = _learnsetEntry(pokeName);
  const learnset = (entry.learnset || {}) as Record<string, string[]>;
  const moves: MoveData[] = [];
  const seen = new Set<string>();
  for (const moveKey of Object.keys(learnset)) {
    if (seen.has(moveKey)) continue;
    seen.add(moveKey);
    const mv = (_mvs as any)[moveKey] as any;
    if (!mv || !mv.basePower || mv.category === 'Status') continue;
    moves.push({ name: mv.name || moveKey, bp: mv.basePower, cat: mv.category || 'Physical', type: mv.type || 'Normal' });
  }
  return moves;
}

// ── Custom Pokémon registry ───────────────────────────────────────────────────
/** In-memory registry for fan-made / custom Pokémon and their learnsets. */
const _customDex: Record<string, PokeData> = {};
const _customLearnsets: Record<string, MoveData[]> = {};

export function injectCustomPokemon(data: PokeData, moves: MoveData[]): void {
  const k = _key(data.name);
  _customDex[k]       = data;
  _customLearnsets[k] = moves;
}

export function removeCustomPokemon(name: string): void {
  const k = _key(name);
  delete _customDex[k];
  delete _customLearnsets[k];
}

export function getCustomPokemonNames(): string[] {
  return Object.values(_customDex).map(d => d.name);
}

// Patch lookupPoke so custom entries are returned transparently
const _origLookupPoke = lookupPoke;
export function lookupPokeWithCustom(name: string): PokeData | null {
  const k = _key(name);
  if (_customDex[k]) return _customDex[k];
  return _origLookupPoke(name);
}

// Patch getAllLearnableMoveNames to include custom learnsets
const _origGetAllLearnable = getAllLearnableMoveNames;
export function getAllLearnableMoveNamesWithCustom(pokeName: string): MoveData[] {
  const k = _key(pokeName);
  if (_customLearnsets[k]) return _customLearnsets[k];
  return _origGetAllLearnable(pokeName);
}

/** Look up a move by name, falling back to custom Pokémon learnsets. */
export function lookupMoveWithCustom(name: string): MoveData | null {
  const regular = lookupMove(name);
  if (regular) return regular;
  // Scan custom learnsets for a matching move
  const k = _key(name);
  for (const moves of Object.values(_customLearnsets)) {
    const found = moves.find(m => _key(m.name) === k);
    if (found) return found;
  }
  return null;
}

// Patch getAllPokemonNames to include custom entries
const _origGetAllPokemonNames = getAllPokemonNames;
export function getAllPokemonNamesWithCustom(): string[] {
  return [..._origGetAllPokemonNames(), ...getCustomPokemonNames()];
}

// Patch searchPokemon to include custom entries
export function searchPokemonWithCustom(q: string, limit = 25): string[] {
  const base = searchPokemon(q, limit);
  if (!q) return [...base, ...getCustomPokemonNames()].slice(0, limit);
  const k = _key(q);
  const custom = getCustomPokemonNames().filter(n => _key(n).includes(k));
  const merged = [...custom, ...base.filter(n => !custom.includes(n))];
  return merged.slice(0, limit);
}

// ── Natures / Stat calc ───────────────────────────────────────────────────────
export const NATURES: Record<string,Partial<PokeStat>> = {
  Hardy:{},Docile:{},Serious:{},Bashful:{},Quirky:{},
  Lonely:{atk:1.1,def:0.9},Brave:{atk:1.1,spe:0.9},Adamant:{atk:1.1,spa:0.9},Naughty:{atk:1.1,spd:0.9},
  Bold:{def:1.1,atk:0.9},Relaxed:{def:1.1,spe:0.9},Impish:{def:1.1,spa:0.9},Lax:{def:1.1,spd:0.9},
  Timid:{spe:1.1,atk:0.9},Hasty:{spe:1.1,def:0.9},Jolly:{spe:1.1,spa:0.9},Naive:{spe:1.1,spd:0.9},
  Modest:{spa:1.1,atk:0.9},Mild:{spa:1.1,def:0.9},Quiet:{spa:1.1,spe:0.9},Rash:{spa:1.1,spd:0.9},
  Calm:{spd:1.1,atk:0.9},Gentle:{spd:1.1,def:0.9},Sassy:{spd:1.1,spe:0.9},Careful:{spd:1.1,spa:0.9},
};
export const getNat = (name: string, stat: keyof PokeStat): number => (NATURES[name] as any)?.[stat] ?? 1;

export function calcStat(base:number, ev=0, iv=31, isHp=false, nature=1, lv=100): number {
  if (!base) return 0;
  if (isHp) return Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+lv+10;
  return Math.floor((Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+5)*nature);
}

export const ITEMS = ['(none)','Life Orb','Choice Band','Choice Specs','Choice Scarf','Expert Belt',
  'Muscle Band','Wise Glasses','Assault Vest','Eviolite','Black Belt','Charcoal','Mystic Water',
  'Miracle Seed','Magnet','Never-Melt Ice','Poison Barb','Soft Sand','Hard Stone','Sharp Beak',
  'TwistedSpoon','Spell Tag','Dragon Fang','Black Glasses','Metal Coat','Silk Scarf','Silver Powder',
  'Rocky Helmet','Leftovers'];
export const ITEM_BOOST: Record<string,string> = {
  Charcoal:'Fire','Mystic Water':'Water','Miracle Seed':'Grass',Magnet:'Electric',
  'Never-Melt Ice':'Ice','Black Belt':'Fighting','Poison Barb':'Poison','Soft Sand':'Ground',
  'Sharp Beak':'Flying',TwistedSpoon:'Psychic','Silver Powder':'Bug','Hard Stone':'Rock',
  'Spell Tag':'Ghost','Dragon Fang':'Dragon','Black Glasses':'Dark','Metal Coat':'Steel','Silk Scarf':'Normal',
};
export const WEATHERS = ['None','Sun','Rain','Sand','Snow','Harsh Sunshine','Heavy Rain'];
export const TERRAINS = ['None','Electric','Grassy','Misty','Psychic'];
export const RAID_TIERS: Record<string,number> = {
  'Normal (×1 HP)':1,'3★ Raid (×2 HP)':2,'4★ Raid (×3 HP)':3,
  '5★ Raid (×6.8 HP)':6.8,'6★ Raid (×10 HP)':10,'7★ Raid (×22 HP)':22,
};
const Z_TABLE:[number,number][] = [[55,100],[65,120],[75,140],[85,160],[95,175],[100,180],[110,185],[125,190],[9999,195]];
export const _zPower = (bp:number) => { for (const [t,p] of Z_TABLE) if (bp<=t) return p; return 195; };

export const STAT_ORDER: [keyof PokeStat, string][] = [['hp','HP'],['atk','Atk'],['def','Def'],['spa','SpA'],['spd','SpD'],['spe','Spe']];
export const DEFAULT_EVS: PokeStat = {hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
export const DEFAULT_IVS: PokeStat = {hp:31,atk:31,def:31,spa:31,spd:31,spe:31};

// ── Damage calc ───────────────────────────────────────────────────────────────
export interface CalcOpts {
  atkPoke:PokeData; defPoke:PokeData; bp:number; cat:string; mtyp:string;
  atkEvs:PokeStat; defEvs:PokeStat; atkIvs:PokeStat; defIvs:PokeStat;
  atkNat:string; defNat:string; atkTera:string; defTera:string;
  atkItem:string; atkStatus:string; weather:string; doubles:boolean;
  atkScreen:boolean; defScreen:boolean; isCrit:boolean; zmove:boolean;
  atkLv:number; defLv:number;
}

export function runCalc(o: CalcOpts) {
  const as = o.atkPoke.stats, ds = o.defPoke.stats;
  const atkTypes = o.atkTera ? [o.atkTera] : o.atkPoke.types;
  const defTypes = o.defTera ? [o.defTera] : o.defPoke.types;
  const bp = o.zmove ? _zPower(o.bp) : o.bp;
  if (!bp) return null;
  const eff = typeEff(o.mtyp, defTypes);
  if (eff === 0) return { immune:true as const, mtyp:o.mtyp, cat:o.cat };

  const atkV = o.cat==='Physical'
    ? calcStat(as.atk,o.atkEvs.atk,o.atkIvs.atk,false,getNat(o.atkNat,'atk'),o.atkLv)
    : calcStat(as.spa,o.atkEvs.spa,o.atkIvs.spa,false,getNat(o.atkNat,'spa'),o.atkLv);
  const defV = o.cat==='Physical'
    ? calcStat(ds.def,o.defEvs.def,o.defIvs.def,false,getNat(o.defNat,'def'),o.defLv)
    : calcStat(ds.spd,o.defEvs.spd,o.defIvs.spd,false,getNat(o.defNat,'spd'),o.defLv);
  const defHp = calcStat(ds.hp,o.defEvs.hp,o.defIvs.hp,true,1,o.defLv);
  const base = Math.floor(Math.floor(Math.floor(2*o.atkLv/5+2)*bp*atkV/defV)/50)+2;

  let stab = atkTypes.includes(o.mtyp) ? ((o.atkTera && o.atkPoke.types.includes(o.mtyp)) ? 2 : 1.5) : 1;
  let itemMod = 1;
  if (o.atkItem==='Life Orb') itemMod=5324/4096;
  else if (o.atkItem==='Choice Band' && o.cat==='Physical') itemMod=1.5;
  else if (o.atkItem==='Choice Specs' && o.cat==='Special') itemMod=1.5;
  else if (o.atkItem==='Muscle Band' && o.cat==='Physical') itemMod=1.1;
  else if (o.atkItem==='Wise Glasses' && o.cat==='Special') itemMod=1.1;
  else if (ITEM_BOOST[o.atkItem]===o.mtyp) itemMod=1.2;
  const beltMod = (o.atkItem==='Expert Belt' && eff>1) ? 1.2 : 1;

  const sun = o.weather==='Sun'||o.weather==='Harsh Sunshine';
  const rain = o.weather==='Rain'||o.weather==='Heavy Rain';
  let wxMod = 1;
  if (sun && o.mtyp==='Fire') wxMod = 1.5;
  if (sun && o.mtyp==='Water') wxMod = o.weather==='Harsh Sunshine' ? 0 : 0.5;
  if (rain && o.mtyp==='Water') wxMod = 1.5;
  if (rain && o.mtyp==='Fire') wxMod = o.weather==='Heavy Rain' ? 0 : 0.5;

  const spread = o.doubles ? 0.75 : 1;
  const crit = o.isCrit ? 1.5 : 1;
  const screen = ((o.cat==='Physical'&&o.defScreen)||(o.cat==='Special'&&o.atkScreen)) ? 0.5 : 1;

  const apply = (d: number) => {
    d=Math.floor(d*spread); d=Math.floor(d*wxMod); d=Math.floor(d*crit);
    if (stab>1) d=Math.floor(d*stab); d=Math.floor(d*eff);
    d=Math.floor(d*screen); d=Math.floor(d*itemMod); d=Math.floor(d*beltMod);
    return Math.max(1,d);
  };

  const rolls = Array.from({length:16},(_,i) => apply(Math.floor(base*(85+i)/100)));
  const [minD,maxD] = [rolls[0],rolls[15]];
  const minP = defHp ? Math.floor(minD/defHp*1000)/10 : 0;
  const maxP = defHp ? Math.floor(maxD/defHp*1000)/10 : 0;
  const atkSpe=calcStat(as.spe,o.atkEvs.spe,o.atkIvs.spe,false,getNat(o.atkNat,'spe'),o.atkLv);
  const defSpe=calcStat(ds.spe,o.defEvs.spe,o.defIvs.spe,false,getNat(o.defNat,'spe'),o.defLv);

  return {
    immune:false as const, rolls, minD, maxD, minP, maxP, defHp, eff, stab:stab>1,
    mtyp:o.mtyp, cat:o.cat, atkSpe, defSpe,
    ohko:minP>=100, twoHko:minP>=50, possibleOhko:maxP>=100,
    hitsToKo:[maxD?Math.ceil(defHp/maxD):99, minD?Math.ceil(defHp/minD):99] as [number,number],
  };
}

// ── Shared styles ─────────────────────────────────────────────────────────────
export const INP: React.CSSProperties = {
  padding:'6px 10px',background:'rgba(0,0,0,0.35)',border:'1px solid var(--border)',
  borderRadius:7,color:'var(--text)',fontSize:12,width:'100%',boxSizing:'border-box',outline:'none',
  fontFamily:"'Lexend',sans-serif",transition:'border-color .15s',
};
export const NUM: React.CSSProperties = { ...INP, width:50, textAlign:'center', padding:'5px 4px' };
export const SEL: React.CSSProperties = { ...INP, cursor:'pointer' };
export const LBL: React.CSSProperties = {
  display:'block',fontSize:10,color:'var(--text-muted)',fontWeight:700,
  textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3,
};

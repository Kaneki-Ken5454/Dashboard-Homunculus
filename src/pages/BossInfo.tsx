import { useState, useEffect, useRef } from 'react';
import { apiCall } from '../lib/db';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PokeStat { hp:number; atk:number; def:number; spa:number; spd:number; spe:number }
interface PokeData  { name:string; types:string[]; stats:PokeStat; bst:number; abilities:string[]; weaknesses:Record<string,string[]> }
interface MoveData  { name:string; bp:number; cat:string; type:string }

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
  const all = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
  const tc: Record<string,Record<string,number>> = {};
  for (const dt of all) tc[dt] = {};
  for (const at of all) {
    for (const dt of (se[at]||[]))  tc[dt][at] = 1;
    for (const dt of (nve[at]||[])) tc[dt][at] = 2;
    for (const dt of (imm[at]||[])) tc[dt][at] = 3;
  }
  return tc;
})();

const _DMG: Record<number,number> = {0:1,1:2,2:0.5,3:0};
const _Z_TABLE:[number,number][] = [[55,100],[65,120],[75,140],[85,160],[95,175],[100,180],[110,185],[125,190],[9999,195]];
const _zPower = (bp:number) => { for (const [t,p] of _Z_TABLE) if (bp<=t) return p; return 195; };

const ALL_TYPES = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
const TC_COLORS: Record<string,string> = {Fire:'#FF4422',Water:'#3399FF',Grass:'#33CC44',Electric:'#FFCC00',Ice:'#66CCFF',Fighting:'#CC3300',Poison:'#993399',Ground:'#CCAA55',Flying:'#88AAFF',Psychic:'#FF5599',Bug:'#AABB22',Rock:'#BBAA66',Ghost:'#664477',Dragon:'#7744FF',Dark:'#554433',Steel:'#AAAABB',Fairy:'#FFAACC',Normal:'#AAAA88'};

// ── Helpers ───────────────────────────────────────────────────────────────────
const _key = (n:string) => (n||'').toLowerCase().replace(/[\s\-'.]/g,'');

function typeEff(atkType:string, defTypes:string[]): number {
  let m = 1;
  for (const dt of defTypes) m *= _DMG[TYPECHART[dt]?.[atkType] ?? 0] ?? 1;
  return m;
}

function weaknessChart(defTypes:string[], ability='') {
  const out: Record<string,string[]> = {quad:[],double:[],half:[],quarter:[],immune:[]};
  const levitate = ability.toLowerCase().includes('levitate');
  for (const at of ALL_TYPES) {
    if (levitate && at==='Ground') { out.immune.push(at); continue; }
    const m = typeEff(at, defTypes);
    if (m===0) out.immune.push(at);
    else if (m===0.25) out.quarter.push(at);
    else if (m===0.5)  out.half.push(at);
    else if (m===2)    out.double.push(at);
    else if (m===4)    out.quad.push(at);
  }
  return out;
}

// ── Client-side Showdown data loader ─────────────────────────────────────────
// Loads pokedex + moves DIRECTLY from Showdown CDN in the browser.
// Caches in localStorage (24h TTL). Zero server dependency.
const CDN = 'https://play.pokemonshowdown.com/data';
const CACHE_TTL = 24 * 60 * 60 * 1000;

// Module-level: survives re-renders, resets on page refresh only
let _dex: Record<string,any> | null = null;
let _mvs: Record<string,any> | null = null;
let _lrn: Record<string,any> | null = null;
let _sdLoading = false;
let _waiters: Array<(ok:boolean)=>void> = [];

function _readCache(key:string): Record<string,any>|null {
  try {
    const raw = localStorage.getItem(`sd_${key}`);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now()-ts > CACHE_TTL) { localStorage.removeItem(`sd_${key}`); return null; }
    return data;
  } catch { return null; }
}

function _writeCache(key:string, data:Record<string,any>) {
  try { localStorage.setItem(`sd_${key}`, JSON.stringify({ ts:Date.now(), data })); }
  catch { /* quota exceeded — ignore, still works in memory */ }
}

async function loadSdData(): Promise<boolean> {
  if (_dex && _mvs) return true;
  if (_sdLoading) return new Promise(r => _waiters.push(r));
  _sdLoading = true;

  _dex = _readCache('pokedex');
  _mvs = _readCache('moves');
  _lrn = _readCache('learnsets');

  const jobs: Promise<void>[] = [];
  if (!_dex) jobs.push(
    fetch(`${CDN}/pokedex.json`).then(r=>r.json()).then(d=>{ _dex=d; _writeCache('pokedex',d); })
    .catch(()=>{ _dex={}; })
  );
  if (!_mvs) jobs.push(
    fetch(`${CDN}/moves.json`).then(r=>r.json()).then(d=>{ _mvs=d; _writeCache('moves',d); })
    .catch(()=>{ _mvs={}; })
  );
  if (!_lrn) jobs.push(
    fetch(`${CDN}/learnsets.json`).then(r=>r.json()).then(d=>{ _lrn=d; _writeCache('learnsets',d); })
    .catch(()=>{ _lrn={}; })
  );
  await Promise.all(jobs);

  _sdLoading = false;
  const ok = Object.keys(_dex||{}).length > 0 && Object.keys(_mvs||{}).length > 0;
  _waiters.forEach(fn=>fn(ok));
  _waiters = [];
  return ok;
}

// Get level-up moves for simulation (sorted by BP desc)
function getLevelUpMoves(pokeName: string): Array<{level:number; name:string; type:string; cat:string; bp:number}> {
  if (!_lrn || !_mvs) return [];
  const k = _key(pokeName);
  const entry = (_lrn as any)[k] || (_lrn as any)[k + 'base'] || {};
  const learnset = (entry.learnset || {}) as Record<string,string[]>;
  const result: Record<string, {level:number; name:string; type:string; cat:string; bp:number}> = {};
  for (const [moveKey, sources] of Object.entries(learnset)) {
    let level: number|null = null;
    for (const src of sources) {
      const m = src.match(/^(\d)L(\d+)$/);
      if (m) { level = parseInt(m[2]); break; }
    }
    if (level === null) continue;
    const mv = (_mvs as any)[moveKey];
    if (!mv || !mv.basePower || mv.category === 'Status') continue;
    result[`${level}_${moveKey}`] = {
      level, name: mv.name || moveKey,
      type: mv.type||'Normal', cat: mv.category||'Physical', bp: mv.basePower,
    };
  }
  return Object.values(result).sort((a,b) => b.bp - a.bp || a.level - b.level).slice(0,12);
}

function searchPokemon(q:string, limit=25): string[] {
  if (!q || !_dex) return [];
  const k = _key(q);
  const results:string[] = [];
  for (const [key,val] of Object.entries(_dex)) {
    if (key.includes(k) || _key(val.name||'').includes(k)) {
      results.push(val.name||key);
      if (results.length >= limit) break;
    }
  }
  return results;
}

function searchMoves(q:string, limit=25): string[] {
  if (!q || !_mvs) return [];
  const k = _key(q);
  const results:string[] = [];
  for (const [key,val] of Object.entries(_mvs)) {
    const mv = val as any;
    if (!mv.basePower) continue; // skip status moves
    if (key.includes(k) || _key(mv.name||'').includes(k)) {
      results.push(mv.name||key);
      if (results.length >= limit) break;
    }
  }
  return results;
}

function lookupPoke(name:string): PokeData|null {
  if (!_dex) return null;
  const e = _dex[_key(name)];
  if (!e) return null;
  const s = e.baseStats || {};
  const abilities = Object.values(e.abilities||{}) as string[];
  const types = e.types || [];
  return {
    name: e.name||name, types,
    stats: { hp:s.hp||0,atk:s.atk||0,def:s.def||0,spa:s.spa||0,spd:s.spd||0,spe:s.spe||0 },
    bst: Object.values(s as Record<string,number>).reduce((a,b)=>a+b,0),
    abilities,
    weaknesses: weaknessChart(types, abilities[0]||''),
  };
}

function lookupMove(name:string): MoveData|null {
  if (!_mvs) return null;
  const e = _mvs[_key(name)] as any;
  if (!e) return null;
  return { name:e.name||name, bp:e.basePower||0, cat:e.category||'Physical', type:e.type||'Normal' };
}

// ── Hook: load Showdown data ──────────────────────────────────────────────────
function useShowdownData() {
  const [state, setState] = useState<'loading'|'ready'|'error'>(
    (_dex && _mvs) ? 'ready' : 'loading'
  );
  useEffect(() => {
    if (_dex && _mvs) { setState('ready'); return; }
    loadSdData().then(ok => setState(ok ? 'ready' : 'error'));
  }, []);
  return state;
}

// ── Natures ───────────────────────────────────────────────────────────────────
const NATURES: Record<string,Partial<PokeStat>> = {
  Hardy:{},Docile:{},Serious:{},Bashful:{},Quirky:{},
  Lonely:{atk:1.1,def:0.9},Brave:{atk:1.1,spe:0.9},Adamant:{atk:1.1,spa:0.9},Naughty:{atk:1.1,spd:0.9},
  Bold:{def:1.1,atk:0.9},Relaxed:{def:1.1,spe:0.9},Impish:{def:1.1,spa:0.9},Lax:{def:1.1,spd:0.9},
  Timid:{spe:1.1,atk:0.9},Hasty:{spe:1.1,def:0.9},Jolly:{spe:1.1,spa:0.9},Naive:{spe:1.1,spd:0.9},
  Modest:{spa:1.1,atk:0.9},Mild:{spa:1.1,def:0.9},Quiet:{spa:1.1,spe:0.9},Rash:{spa:1.1,spd:0.9},
  Calm:{spd:1.1,atk:0.9},Gentle:{spd:1.1,def:0.9},Sassy:{spd:1.1,spe:0.9},Careful:{spd:1.1,spa:0.9},
};
const getNat = (name:string, stat:keyof PokeStat) => (NATURES[name] as any)?.[stat] ?? 1;

const ITEMS = ['(none)','Life Orb','Choice Band','Choice Specs','Choice Scarf','Expert Belt',
  'Muscle Band','Wise Glasses','Assault Vest','Eviolite','Black Belt','Charcoal','Mystic Water',
  'Miracle Seed','Magnet','Never-Melt Ice','Poison Barb','Soft Sand','Hard Stone','Sharp Beak',
  'TwistedSpoon','Spell Tag','Dragon Fang','Black Glasses','Metal Coat','Silk Scarf','Silver Powder',
  'Rocky Helmet','Leftovers'];
const ITEM_BOOST: Record<string,string> = {
  'Charcoal':'Fire','Mystic Water':'Water','Miracle Seed':'Grass','Magnet':'Electric',
  'Never-Melt Ice':'Ice','Black Belt':'Fighting','Poison Barb':'Poison','Soft Sand':'Ground',
  'Sharp Beak':'Flying','TwistedSpoon':'Psychic','Silver Powder':'Bug','Hard Stone':'Rock',
  'Spell Tag':'Ghost','Dragon Fang':'Dragon','Black Glasses':'Dark','Metal Coat':'Steel','Silk Scarf':'Normal',
};
const WEATHERS = ['None','Sun','Rain','Sand','Snow','Harsh Sunshine','Heavy Rain'];
const TERRAINS = ['None','Electric','Grassy','Misty','Psychic'];

// ── Stat formula ──────────────────────────────────────────────────────────────
function calcStat(base:number, ev=0, iv=31, isHp=false, nature=1, lv=100): number {
  if (!base) return 0;
  if (isHp) return Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+lv+10;
  return Math.floor((Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+5)*nature);
}

// ── Damage calc ───────────────────────────────────────────────────────────────
interface CalcOpts {
  atkPoke:PokeData; defPoke:PokeData; bp:number; cat:string; mtyp:string;
  atkEvs:PokeStat; defEvs:PokeStat; atkIvs:PokeStat; defIvs:PokeStat;
  atkNat:string; defNat:string; atkTera:string; defTera:string;
  atkItem:string; atkStatus:string; weather:string; doubles:boolean;
  atkScreen:boolean; defScreen:boolean; isCrit:boolean; zmove:boolean;
  atkLv:number; defLv:number;
}

function runCalc(o:CalcOpts) {
  const as = o.atkPoke.stats, ds = o.defPoke.stats;
  const atkTypes = o.atkTera ? [o.atkTera] : o.atkPoke.types;
  const defTypes = o.defTera ? [o.defTera] : o.defPoke.types;
  const bp = o.zmove ? _zPower(o.bp) : o.bp;
  if (!bp) return null;

  const eff = typeEff(o.mtyp, defTypes);
  if (eff===0) return { immune:true, mtyp:o.mtyp, cat:o.cat };

  const atkV = o.cat==='Physical'
    ? calcStat(as.atk,o.atkEvs.atk,o.atkIvs.atk,false,getNat(o.atkNat,'atk'),o.atkLv)
    : calcStat(as.spa,o.atkEvs.spa,o.atkIvs.spa,false,getNat(o.atkNat,'spa'),o.atkLv);
  const defV = o.cat==='Physical'
    ? calcStat(ds.def,o.defEvs.def,o.defIvs.def,false,getNat(o.defNat,'def'),o.defLv)
    : calcStat(ds.spd,o.defEvs.spd,o.defIvs.spd,false,getNat(o.defNat,'spd'),o.defLv);
  const defHp = calcStat(ds.hp,o.defEvs.hp,o.defIvs.hp,true,1,o.defLv);

  const base = Math.floor(Math.floor(Math.floor(2*o.atkLv/5+2)*bp*atkV/defV)/50)+2;

  let stab = 1;
  if (atkTypes.includes(o.mtyp)) {
    stab = (o.atkTera && o.atkPoke.types.includes(o.mtyp)) ? 2 : 1.5;
  }

  let itemMod = 1;
  if (o.atkItem==='Life Orb') itemMod=5324/4096;
  else if (o.atkItem==='Choice Band' && o.cat==='Physical') itemMod=1.5;
  else if (o.atkItem==='Choice Specs' && o.cat==='Special') itemMod=1.5;
  else if (o.atkItem==='Muscle Band' && o.cat==='Physical') itemMod=1.1;
  else if (o.atkItem==='Wise Glasses' && o.cat==='Special') itemMod=1.1;
  else if (ITEM_BOOST[o.atkItem]===o.mtyp) itemMod=1.2;
  const beltMod = (o.atkItem==='Expert Belt' && eff>1) ? 1.2 : 1;

  let wxMod=1;
  const sun=o.weather==='Sun'||o.weather==='Harsh Sunshine';
  const rain=o.weather==='Rain'||o.weather==='Heavy Rain';
  if (sun && o.mtyp==='Fire')  wxMod = o.weather==='Harsh Sunshine'?1.5:1.5;
  if (sun && o.mtyp==='Water') wxMod = o.weather==='Harsh Sunshine'?0:0.5;
  if (rain && o.mtyp==='Water') wxMod = o.weather==='Heavy Rain'?1.5:1.5;
  if (rain && o.mtyp==='Fire')  wxMod = o.weather==='Heavy Rain'?0:0.5;

  const spreadMod = o.doubles?0.75:1;
  const critMod   = o.isCrit?1.5:1;
  const burnMod   = o.atkStatus==='Burn'&&o.cat==='Physical'?0.5:1;
  const screenMod = ((o.cat==='Physical'&&o.defScreen)||(o.cat==='Special'&&o.atkScreen))?0.5:1;

  const apply = (d:number) => {
    d=Math.floor(d*spreadMod); d=Math.floor(d*wxMod); d=Math.floor(d*critMod);
    if (stab>1) d=Math.floor(d*stab); d=Math.floor(d*eff);
    d=Math.floor(d*burnMod); d=Math.floor(d*screenMod);
    d=Math.floor(d*itemMod); d=Math.floor(d*beltMod);
    return Math.max(1,d);
  };

  const rolls = Array.from({length:16},(_,i)=>apply(Math.floor(base*(85+i)/100)));
  const [minD,maxD] = [rolls[0],rolls[15]];
  const minP = defHp ? Math.floor(minD/defHp*1000)/10 : 0;
  const maxP = defHp ? Math.floor(maxD/defHp*1000)/10 : 0;
  const atkSpe=calcStat(as.spe,o.atkEvs.spe,o.atkIvs.spe,false,getNat(o.atkNat,'spe'),o.atkLv);
  const defSpe=calcStat(ds.spe,o.defEvs.spe,o.defIvs.spe,false,getNat(o.defNat,'spe'),o.defLv);

  return {
    immune:false,rolls,minD,maxD,minP,maxP,defHp,eff,stab:stab>1,
    mtyp:o.mtyp,cat:o.cat,atkSpe,defSpe,
    ohko:minP>=100,twoHko:minP>=50,possibleOhko:maxP>=100,
    hitsToKo:[maxD?Math.ceil(defHp/maxD):99,minD?Math.ceil(defHp/minD):99] as [number,number],
  };
}

// ── UI Styles ─────────────────────────────────────────────────────────────────
const INP: React.CSSProperties = {padding:'5px 8px',background:'rgba(0,0,0,0.35)',border:'1px solid rgba(255,255,255,0.13)',borderRadius:6,color:'#dde1f5',fontSize:12,width:'100%',boxSizing:'border-box',outline:'none'};
const NUM: React.CSSProperties = {...INP,width:48,textAlign:'center',padding:'5px 4px'};
const SEL: React.CSSProperties = {...INP,cursor:'pointer'};
const LBL: React.CSSProperties = {display:'block',fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3};
const STAT_ORDER:[keyof PokeStat,string][] = [['hp','HP'],['atk','Atk'],['def','Def'],['spa','SpA'],['spd','SpD'],['spe','Spe']];
const DEFAULT_EVS: PokeStat = {hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
const DEFAULT_IVS: PokeStat = {hp:31,atk:31,def:31,spa:31,spd:31,spe:31};

// ── TypeBadge ─────────────────────────────────────────────────────────────────
function TypeBadge({t}:{t:string}) {
  return <span style={{background:TC_COLORS[t]||'#555',color:'#fff',borderRadius:4,padding:'1px 8px',fontSize:11,fontWeight:700,flexShrink:0}}>{t}</span>;
}

// ── AutoInput (client-side search — no server calls) ─────────────────────────
function AutoInput({ label, value, onChange, searchFn, placeholder }: {
  label:string; value:string; onChange:(v:string)=>void;
  searchFn:(q:string)=>string[]; placeholder?:string;
}) {
  const [opts,setOpts]   = useState<string[]>([]);
  const [show,setShow]   = useState(false);
  const timer            = useRef<any>(null);

  const search = (v:string) => {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length<2) { setOpts([]); setShow(false); return; }
    timer.current = setTimeout(() => {
      const results = searchFn(v);
      setOpts(results);
      setShow(results.length>0);
    }, 80); // fast — purely CPU
  };

  return (
    <div style={{position:'relative'}}>
      {label && <label style={LBL}>{label}</label>}
      <input style={INP} value={value}
        onChange={e=>search(e.target.value)}
        onBlur={()=>setTimeout(()=>setShow(false),140)}
        onFocus={()=>opts.length>0&&setShow(true)}
        placeholder={placeholder||label}
      />
      {show && opts.length>0 && (
        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#181a28',
          border:'1px solid rgba(255,255,255,0.14)',borderRadius:7,zIndex:400,
          maxHeight:170,overflowY:'auto',marginTop:2,boxShadow:'0 8px 32px rgba(0,0,0,0.65)'}}>
          {opts.map(x=>(
            <div key={x} onMouseDown={()=>{onChange(x);setShow(false);setOpts([]);}}
              style={{padding:'6px 12px',cursor:'pointer',fontSize:12,color:'#d4d8f0'}}
              onMouseEnter={e=>(e.currentTarget.style.background='rgba(88,101,242,0.22)')}
              onMouseLeave={e=>(e.currentTarget.style.background='')}>
              {x}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pokemon Panel ─────────────────────────────────────────────────────────────
interface PanelState {
  name:string; data:PokeData|null;
  level:number; nature:string; item:string;
  evs:PokeStat; ivs:PokeStat;
  teraType:string; status:string;
  moveName:string; moveData:MoveData|null;
  zmove:boolean; isCrit:boolean;
}
const mkPanel = ():PanelState => ({
  name:'',data:null,level:100,nature:'Hardy',item:'(none)',
  evs:{...DEFAULT_EVS},ivs:{...DEFAULT_IVS},
  teraType:'',status:'Healthy',moveName:'',moveData:null,zmove:false,isCrit:false,
});

function PokemonPanel({ panel, onChange, side }: {
  panel:PanelState; onChange:(p:Partial<PanelState>)=>void; side:'left'|'right';
}) {
  const d   = panel.data;
  const lv  = panel.level||100;

  const computed:PokeStat|null = d ? {
    hp:  calcStat(d.stats.hp,  panel.evs.hp,  panel.ivs.hp,  true,  1,                         lv),
    atk: calcStat(d.stats.atk, panel.evs.atk, panel.ivs.atk, false, getNat(panel.nature,'atk'), lv),
    def: calcStat(d.stats.def, panel.evs.def, panel.ivs.def, false, getNat(panel.nature,'def'), lv),
    spa: calcStat(d.stats.spa, panel.evs.spa, panel.ivs.spa, false, getNat(panel.nature,'spa'), lv),
    spd: calcStat(d.stats.spd, panel.evs.spd, panel.ivs.spd, false, getNat(panel.nature,'spd'), lv),
    spe: calcStat(d.stats.spe, panel.evs.spe, panel.ivs.spe, false, getNat(panel.nature,'spe'), lv),
  } : null;

  const setEv = (s:keyof PokeStat,v:number)=>onChange({evs:{...panel.evs,[s]:Math.max(0,Math.min(252,v||0))}});
  const setIv = (s:keyof PokeStat,v:number)=>onChange({ivs:{...panel.ivs,[s]:Math.max(0,Math.min(31, v||0))}});
  const evTotal = Object.values(panel.evs).reduce((a,b)=>a+b,0);
  const natColor = (s:keyof PokeStat) => { const v=(NATURES[panel.nature] as any)?.[s]; return v>1?'#7ee787':v<1?'#f87171':undefined; };

  // When name changes, look up immediately (synchronous — data is in memory)
  const onNameChange = (v:string) => {
    const poke = lookupPoke(v);
    onChange({ name:v, data:poke }); // instant lookup
  };

  const onMoveChange = (v:string) => {
    const mv = lookupMove(v);
    onChange({ moveName:v, moveData:mv });
  };

  const mv = panel.moveData;
  const bp = mv ? (panel.zmove ? _zPower(mv.bp) : mv.bp) : 0;

  return (
    <div style={{background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.09)',borderRadius:10,padding:13,display:'flex',flexDirection:'column',gap:9}}>
      <div style={{fontSize:10,fontWeight:800,color:'#5865f2',textTransform:'uppercase',letterSpacing:'0.09em'}}>
        Pokémon {side==='left'?'1':'2'}
        {d && <span style={{marginLeft:8,fontSize:10,color:'#4ade80'}}>✓ {d.name}</span>}
        {panel.name && !d && <span style={{marginLeft:8,fontSize:10,color:'#f87171'}}>Not found</span>}
      </div>

      <AutoInput label="Pokémon" value={panel.name} searchFn={searchPokemon}
        onChange={onNameChange} placeholder="e.g. Garchomp"/>

      {d && (
        <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
          {(panel.teraType?[panel.teraType]:d.types).map(t=><TypeBadge key={t} t={t}/>)}
          {panel.teraType && <span style={{fontSize:10,color:'#6b7280'}}>← Tera</span>}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'80px 1fr',gap:8}}>
        <div>
          <label style={LBL}>Level</label>
          <input style={INP} type="number" min={1} max={100} value={panel.level}
            onChange={e=>onChange({level:parseInt(e.target.value)||100})}/>
        </div>
        <div>
          <label style={LBL}>Nature</label>
          <select style={SEL} value={panel.nature} onChange={e=>onChange({nature:e.target.value})}>
            {Object.keys(NATURES).map(n=>{
              const nm=NATURES[n] as any;
              const up=Object.keys(nm).find(s=>nm[s]>1);
              const dn=Object.keys(nm).find(s=>nm[s]<1);
              return <option key={n} value={n}>{n}{up?` (+${up}/-${dn})`:''}</option>;
            })}
          </select>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div>
          <label style={LBL}>Item</label>
          <select style={SEL} value={panel.item} onChange={e=>onChange({item:e.target.value})}>
            {ITEMS.map(i=><option key={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Tera Type</label>
          <select style={SEL} value={panel.teraType} onChange={e=>onChange({teraType:e.target.value})}>
            <option value="">None</option>
            {ALL_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:8,alignItems:'flex-end'}}>
        <div>
          <label style={LBL}>Status</label>
          <select style={SEL} value={panel.status} onChange={e=>onChange({status:e.target.value})}>
            {['Healthy','Burn','Paralysis','Poison','Bad Poison','Freeze','Sleep'].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#9ca3af',cursor:'pointer',paddingBottom:6,whiteSpace:'nowrap'}}>
          <input type="checkbox" checked={panel.isCrit} onChange={e=>onChange({isCrit:e.target.checked})}/> Crit
        </label>
        <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#9ca3af',cursor:'pointer',paddingBottom:6,whiteSpace:'nowrap'}}>
          <input type="checkbox" checked={panel.zmove} onChange={e=>onChange({zmove:e.target.checked})}/> Z
        </label>
      </div>

      {/* EV/IV table */}
      <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:8}}>
        <div style={{display:'grid',gridTemplateColumns:'30px 1fr 46px 46px 38px',gap:'3px 5px',alignItems:'center',marginBottom:4}}>
          {['','','IV','EV','Stat'].map((h,i)=>(
            <span key={i} style={{fontSize:9,color:'#374151',fontWeight:700,textTransform:'uppercase',textAlign:'center'}}>{h}</span>
          ))}
        </div>
        {STAT_ORDER.map(([key,label])=>{
          const base=d?.stats[key];
          const barPct=base?Math.min(100,base/255*100):0;
          const cs=computed?.[key];
          const nc=natColor(key);
          return (
            <div key={key} style={{display:'grid',gridTemplateColumns:'30px 1fr 46px 46px 38px',gap:'3px 5px',alignItems:'center',marginBottom:3}}>
              <span style={{fontSize:10,color:'#6b7280',fontWeight:700,textAlign:'right',fontFamily:'monospace'}}>{label}</span>
              <div style={{height:5,background:'rgba(255,255,255,0.07)',borderRadius:2,overflow:'hidden',position:'relative'}}>
                <div style={{width:`${barPct}%`,height:'100%',background:'#5865f2',opacity:0.8,borderRadius:2}}/>
                {base!=null&&<span style={{position:'absolute',right:2,top:-1,fontSize:9,color:'#4b5563',fontFamily:'monospace'}}>{base}</span>}
              </div>
              <input style={NUM} type="number" min={0} max={31}  value={panel.ivs[key]} onChange={e=>setIv(key,parseInt(e.target.value))}/>
              <input style={NUM} type="number" min={0} max={252} value={panel.evs[key]} onChange={e=>setEv(key,parseInt(e.target.value))}/>
              <span style={{fontSize:12,fontWeight:700,textAlign:'center',color:nc||'#c4c8e4',fontFamily:'monospace'}}>{cs??'—'}</span>
            </div>
          );
        })}
        <div style={{fontSize:10,color:evTotal>510?'#f87171':'#4b5563',textAlign:'right',marginTop:2}}>
          EVs: {evTotal}/510{evTotal>510&&' ⚠ over'}
        </div>
      </div>

      {/* Move */}
      <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:8}}>
        <AutoInput label="Move" value={panel.moveName} searchFn={searchMoves}
          onChange={onMoveChange} placeholder="e.g. Earthquake"/>
        {mv && bp>0 && (
          <div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap',alignItems:'center'}}>
            <TypeBadge t={mv.type}/>
            <span style={{fontSize:11,color:'#6b7280'}}>{mv.cat}</span>
            <span style={{fontSize:11,color:'#6b7280'}}>BP {mv.bp}{panel.zmove?` → Z:${_zPower(mv.bp)}`:''}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Damage Result ─────────────────────────────────────────────────────────────
function DamageResult({ result, atk, def }:{ result:any; atk:PanelState; def:PanelState }) {
  if (!result) return null;
  if (result.immune) return (
    <div style={{background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.09)',borderRadius:8,padding:'12px 16px',textAlign:'center',color:'#6b7280',fontSize:13}}>
      <strong style={{color:'#c4c8e4'}}>{def.name||'Defender'}</strong> is immune to <TypeBadge t={result.mtyp}/> moves
    </div>
  );

  const {minD,maxD,minP,maxP,defHp,rolls,ohko,twoHko,possibleOhko,hitsToKo,eff,stab,mtyp,cat,atkSpe,defSpe}=result;
  const ko=ohko?'Guaranteed OHKO':possibleOhko?'Possible OHKO':twoHko?'Guaranteed 2HKO':maxP>=50?'Possible 2HKO':'3HKO or more';
  const koColor=(ohko||possibleOhko)?'#f87171':(twoHko||maxP>=50)?'#fb923c':'#4ade80';
  const barColor=maxP>=100?'#f87171':maxP>=50?'#fb923c':'#5865f2';
  const fasterStr=atkSpe>defSpe?`${atk.name} goes first (${atkSpe} > ${defSpe})`:defSpe>atkSpe?`${def.name} goes first (${defSpe} > ${atkSpe})`:`Speed tie (${atkSpe})`;

  return (
    <div style={{background:'rgba(255,255,255,0.035)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:16,display:'flex',flexDirection:'column',gap:12}}>
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',fontSize:13}}>
        <strong style={{color:'#e4e6ef'}}>{atk.name}</strong>
        <span style={{color:'#4b5563'}}>used</span>
        <strong style={{color:'#818cf8'}}>{atk.moveName}{atk.zmove?' [Z]':''}</strong>
        <span style={{color:'#4b5563'}}>on</span>
        <strong style={{color:'#e4e6ef'}}>{def.name}</strong>
        <TypeBadge t={mtyp}/>
        <span style={{fontSize:11,color:'#6b7280'}}>{cat}</span>
        {eff!==1&&<span style={{fontSize:11,fontWeight:700,color:eff>1?'#fb923c':'#4ade80'}}>{eff}×</span>}
        {stab&&<span style={{fontSize:10,background:'rgba(129,140,248,0.2)',color:'#818cf8',borderRadius:3,padding:'1px 5px',fontWeight:700}}>STAB</span>}
        {atk.isCrit&&<span style={{fontSize:10,background:'rgba(251,191,36,0.2)',color:'#fbbf24',borderRadius:3,padding:'1px 5px',fontWeight:700}}>CRIT</span>}
      </div>
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
          <span style={{fontSize:22,fontWeight:800,color:'#fff',fontFamily:'monospace',letterSpacing:'-0.02em'}}>{minP.toFixed(1)}% — {maxP.toFixed(1)}%</span>
          <span style={{fontSize:14,fontWeight:700,color:koColor}}>{ko}</span>
        </div>
        <div style={{height:9,background:'rgba(255,255,255,0.07)',borderRadius:5,overflow:'hidden',position:'relative',marginBottom:4}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,minP)}%`,background:barColor,opacity:0.45,borderRadius:5}}/>
          <div style={{position:'absolute',left:`${Math.min(100,minP)}%`,top:0,bottom:0,width:`${Math.max(0,Math.min(100,maxP)-Math.min(100,minP))}%`,background:barColor,borderRadius:5}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#6b7280'}}>
          <span>{minD}–{maxD} HP / {defHp} HP</span>
          <span>{hitsToKo[0]===hitsToKo[1]?`${hitsToKo[0]} hit${hitsToKo[0]>1?'s':''} to KO`:`${hitsToKo[0]}–${hitsToKo[1]} hits to KO`}</span>
        </div>
      </div>
      <div>
        <div style={{fontSize:9,color:'#374151',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>Damage Rolls (85–100%)</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
          {(rolls as number[]).map((r:number,i:number)=>(
            <span key={i} style={{fontSize:10,fontFamily:'monospace',color:r===maxD?'#818cf8':r===minD?'#f87171':'#4b5563',background:'rgba(255,255,255,0.03)',borderRadius:3,padding:'2px 5px',border:(r===maxD||r===minD)?'1px solid currentColor':'1px solid rgba(255,255,255,0.06)'}}>{r}</span>
          ))}
        </div>
      </div>
      <div style={{background:'rgba(255,255,255,0.03)',borderRadius:6,padding:'6px 10px',fontSize:11,color:'#6b7280',display:'flex',alignItems:'center',gap:6}}>
        <span>⚡</span><span>{fasterStr}</span>
      </div>
    </div>
  );
}

// ── Weakness Section (fully client-side) ──────────────────────────────────────
// ── Weakness + Counter Assignment ─────────────────────────────────────────────
interface AssignedCounter { pokemon:string; moves:string; notes:string; is_preferred:boolean; }
const BLANK_CTR = ():AssignedCounter => ({ pokemon:'', moves:'', notes:'', is_preferred:false });

function WeaknessSection({ guildId }: { guildId:string }) {
  const [poke,setPoke]   = useState('');
  const [tera,setTera]   = useState('');
  const [data,setData]   = useState<PokeData|null>(null);
  const [err,setErr]     = useState('');
  // counter state
  const [ctrs,setCtrs]         = useState<AssignedCounter[]>([]);
  const [bossId,setBossId]     = useState<number|null>(null);
  const [loadingC,setLoadingC] = useState(false);
  const [saving,setSaving]     = useState(false);
  const [saveMsg,setSaveMsg]   = useState('');
  const [editIdx,setEditIdx]   = useState<number|null>(null); // -1 = new
  const [editForm,setEditForm] = useState<AssignedCounter>(BLANK_CTR());

  const loadCtrs = async (pokeName:string, pd:PokeData) => {
    if (!guildId) return;
    setLoadingC(true);
    try {
      const bosses = await apiCall<any[]>('getRaidBosses',{guildId});
      const hit = (bosses||[]).find((b:any)=>
        b.pokemon_key===_key(pokeName) || b.display_name?.toLowerCase()===pokeName.toLowerCase()
      );
      setCtrs(hit?.counters||[]); setBossId(hit?.id??null);
    } catch { setCtrs([]); setBossId(null); }
    setLoadingC(false);
  };

  const onPokeChange = (v:string) => {
    setPoke(v); const p=lookupPoke(v); setData(p);
    setErr(v&&!p?`"${v}" not found`:'');
    setCtrs([]); setBossId(null); setSaveMsg(''); setEditIdx(null);
    if (p) loadCtrs(v,p);
  };

  const persist = async (updated:AssignedCounter[]) => {
    if (!data||!guildId) return;
    setSaving(true); setSaveMsg('');
    try {
      await apiCall('upsertRaidBoss',{ guildId, data:{
        id:bossId??undefined, pokemon_key:_key(data.name),
        display_name:data.name, types:data.types,
        notes:'', counters:updated, is_active:true,
      }});
      setCtrs(updated); setSaveMsg('✓ Saved');
      setTimeout(()=>setSaveMsg(''),2200);
      if (!bossId) loadCtrs(data.name,data);
    } catch { setSaveMsg('❌ Failed'); }
    setSaving(false);
  };

  const openEdit = (idx:number|'new') => {
    setEditForm(idx==='new' ? BLANK_CTR() : {...ctrs[idx as number]});
    setEditIdx(idx==='new' ? -1 : idx as number);
  };
  const commitEdit = () => {
    if (!editForm.pokemon.trim()) return;
    const updated = editIdx===-1 ? [...ctrs,editForm] : ctrs.map((c,i)=>i===editIdx?editForm:c);
    setEditIdx(null); persist(updated);
  };
  const removeC = (idx:number) => persist(ctrs.filter((_,i)=>i!==idx));
  const togglePref = (idx:number) => persist(ctrs.map((c,i)=>i===idx?{...c,is_preferred:!c.is_preferred}:c));

  const types   = tera ? [tera] : (data?.types||[]);
  const chart   = data ? weaknessChart(types, data.abilities[0]||'') : null;
  const wcSects = [
    {k:'quad',   label:'4× Weak',    color:'#f87171'},
    {k:'double', label:'2× Weak',    color:'#fb923c'},
    {k:'half',   label:'½× Resists', color:'#4ade80'},
    {k:'quarter',label:'¼× Resists', color:'#34d399'},
    {k:'immune', label:'Immune',     color:'#6b7280'},
  ];

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Search bar */}
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'flex-end'}}>
        <div style={{flex:1,minWidth:140}}>
          <AutoInput label="Pokémon" value={poke} searchFn={searchPokemon} onChange={onPokeChange} placeholder="e.g. Heatran"/>
        </div>
        <div style={{minWidth:120}}>
          <label style={LBL}>Tera Type</label>
          <select style={SEL} value={tera} onChange={e=>setTera(e.target.value)}>
            <option value="">None</option>
            {ALL_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {err && <div style={{color:'#f87171',fontSize:12}}>{err}</div>}

      {data && chart && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,alignItems:'start'}}>

          {/* LEFT — type chart */}
          <div>
            <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
              <span style={{fontSize:16,fontWeight:700,color:'#e4e6ef'}}>{data.name}</span>
              {data.types.map(t=><TypeBadge key={t} t={t}/>)}
              {tera&&<><span style={{fontSize:10,color:'#6b7280'}}>Tera:</span><TypeBadge t={tera}/></>}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {wcSects.map(s=>{
                const lst:string[]=chart[s.k]||[];
                if (!lst.length) return null;
                return (
                  <div key={s.k} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:7,padding:'8px 12px'}}>
                    <div style={{fontSize:10,fontWeight:700,color:s.color,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>{s.label}</div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{lst.map(t=><TypeBadge key={t} t={t}/>)}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT — counter assignment */}
          <div style={{background:'rgba(88,101,242,0.06)',border:'1px solid rgba(88,101,242,0.22)',borderRadius:11,padding:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,gap:6,flexWrap:'wrap'}}>
              <div>
                <div style={{fontSize:11,fontWeight:800,color:'#818cf8',textTransform:'uppercase',letterSpacing:'0.08em'}}>
                  ⭐ Assigned Counters
                </div>
                <div style={{fontSize:10,color:'#4b5563',marginTop:1}}>Shown in /bossinfo · saved to Raid Bosses</div>
              </div>
              <div style={{display:'flex',gap:6,alignItems:'center'}}>
                {loadingC && <span style={{fontSize:10,color:'#6b7280'}}>Loading…</span>}
                {saveMsg && <span style={{fontSize:11,color:saveMsg.startsWith('✓')?'#4ade80':'#f87171',fontWeight:600}}>{saveMsg}</span>}
                {saving && <span style={{fontSize:10,color:'#6b7280'}}>Saving…</span>}
                <button onClick={()=>openEdit('new')}
                  style={{padding:'4px 12px',background:'rgba(88,101,242,0.2)',border:'1px solid rgba(88,101,242,0.4)',borderRadius:6,color:'#818cf8',cursor:'pointer',fontSize:11,fontWeight:700}}>
                  + Add Counter
                </button>
              </div>
            </div>

            {/* Inline edit form */}
            {editIdx !== null && (
              <div style={{background:'rgba(0,0,0,0.35)',border:'1px solid rgba(88,101,242,0.35)',borderRadius:8,padding:12,marginBottom:10,display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontSize:11,fontWeight:700,color:'#818cf8',marginBottom:2}}>
                  {editIdx===-1?'New Counter':'Edit Counter'}
                </div>
                <div>
                  <label style={LBL}>Counter Pokémon *</label>
                  <AutoInput label="" value={editForm.pokemon} searchFn={searchPokemon}
                    onChange={v=>setEditForm(f=>({...f,pokemon:v}))} placeholder="e.g. Complete Zygarde"/>
                </div>
                <div>
                  <label style={LBL}>Recommended Moves <span style={{color:'#4b5563',fontWeight:400}}>(comma-separated)</span></label>
                  <input style={INP} value={editForm.moves} placeholder="e.g. Core Enforcer, Thousand Arrows"
                    onChange={e=>setEditForm(f=>({...f,moves:e.target.value}))}/>
                </div>
                <div>
                  <label style={LBL}>Notes</label>
                  <input style={INP} value={editForm.notes} placeholder="Optional strategy tip"
                    onChange={e=>setEditForm(f=>({...f,notes:e.target.value}))}/>
                </div>
                <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'#9ca3af',cursor:'pointer'}}>
                  <input type="checkbox" checked={editForm.is_preferred}
                    onChange={e=>setEditForm(f=>({...f,is_preferred:e.target.checked}))}/>
                  Mark as ⭐ Best Counter
                </label>
                <div style={{display:'flex',gap:6,justifyContent:'flex-end',marginTop:2}}>
                  <button onClick={()=>setEditIdx(null)}
                    style={{padding:'4px 12px',background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:5,color:'#6b7280',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
                    Cancel
                  </button>
                  <button onClick={commitEdit} disabled={saving||!editForm.pokemon.trim()}
                    style={{padding:'4px 16px',background:'rgba(88,101,242,0.3)',border:'1px solid rgba(88,101,242,0.5)',borderRadius:5,color:'#c7d2fe',cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'inherit',opacity:(saving||!editForm.pokemon.trim())?0.5:1}}>
                    {editIdx===-1?'Add':'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Counter list */}
            {ctrs.length===0 && editIdx===null && (
              <div style={{textAlign:'center',color:'#4b5563',fontSize:12,padding:'18px 0'}}>
                No counters assigned yet.<br/>
                <span style={{fontSize:11,color:'#374151'}}>They will show in Discord /bossinfo</span>
              </div>
            )}
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {ctrs.map((c,i)=>(
                <div key={i} style={{background:'rgba(255,255,255,0.035)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:8,padding:'9px 10px',display:'flex',alignItems:'flex-start',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2,flexWrap:'wrap'}}>
                      {c.is_preferred && <span title="Best Counter" style={{fontSize:13,cursor:'pointer'}} onClick={()=>togglePref(i)}>⭐</span>}
                      {!c.is_preferred && <span title="Mark as best" style={{fontSize:11,color:'#374151',cursor:'pointer'}} onClick={()=>togglePref(i)}>☆</span>}
                      <span style={{fontSize:13,fontWeight:700,color:'#e4e6ef'}}>{c.pokemon}</span>
                    </div>
                    {c.moves && (
                      <div style={{fontSize:11,color:'#818cf8',fontFamily:'monospace',marginBottom:2}}>
                        {c.moves.split(',').map(m=>m.trim()).filter(Boolean).map((m,mi)=>(
                          <span key={mi} style={{display:'inline-block',background:'rgba(88,101,242,0.14)',border:'1px solid rgba(88,101,242,0.22)',borderRadius:4,padding:'1px 6px',margin:'1px 2px',fontSize:10}}>{m}</span>
                        ))}
                      </div>
                    )}
                    {c.notes && <div style={{fontSize:11,color:'#6b7280',fontStyle:'italic'}}>{c.notes}</div>}
                  </div>
                  <div style={{display:'flex',gap:4,flexShrink:0,marginTop:1}}>
                    <button onClick={()=>openEdit(i)}
                      style={{background:'rgba(88,101,242,0.12)',border:'1px solid rgba(88,101,242,0.2)',color:'#818cf8',borderRadius:4,padding:'2px 7px',cursor:'pointer',fontSize:10}}>✏️</button>
                    <button onClick={()=>removeC(i)}
                      style={{background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.2)',color:'#f87171',borderRadius:4,padding:'2px 7px',cursor:'pointer',fontSize:10}}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Raid tiers ────────────────────────────────────────────────────────────────
const RAID_TIERS: Record<string,number> = {
  'Normal (×1 HP)':1,'3★ Raid (×2 HP)':2,'4★ Raid (×3 HP)':3,
  '5★ Raid (×6.8 HP)':6.8,'6★ Raid (×10 HP)':10,'7★ Raid (×22 HP)':22,
};

// ── Counter Slot types ────────────────────────────────────────────────────────
interface CounterSlot {
  id:number; name:string; data:PokeData|null; level:number; nature:string; item:string;
  evs:PokeStat; ivs:PokeStat; teraType:string; moveName:string; moveData:MoveData|null;
  zmove:boolean; isCrit:boolean; result:any; error:string;
}
interface BossConfig {
  name:string; data:PokeData|null; level:number; nature:string;
  evs:PokeStat; ivs:PokeStat; teraType:string;
  raidTier:string; weather:string; doubles:boolean; defScreen:boolean;
}

let _slotId = 1;
const mkSlot = ():CounterSlot => ({id:_slotId++,name:'',data:null,level:100,nature:'Hardy',item:'(none)',evs:{...DEFAULT_EVS},ivs:{...DEFAULT_IVS},teraType:'',moveName:'',moveData:null,zmove:false,isCrit:false,result:null,error:''});
const mkBoss = ():BossConfig => ({name:'',data:null,level:100,nature:'Hardy',evs:{...DEFAULT_EVS},ivs:{...DEFAULT_IVS},teraType:'',raidTier:'Normal (×1 HP)',weather:'None',doubles:false,defScreen:false});

// ── Counter Row ───────────────────────────────────────────────────────────────
function CounterRow({ slot, onChange, onRemove, rank }: {
  slot:CounterSlot; onChange:(id:number,p:Partial<CounterSlot>)=>void;
  onRemove:(id:number)=>void; rank:number|null;
}) {
  const r = slot.result;
  const borderColor = !r?'rgba(255,255,255,0.09)':r.immune?'rgba(107,114,128,0.35)':r.ohko||r.possibleOhko?'rgba(248,113,113,0.5)':r.twoHko||r.maxP>=50?'rgba(251,146,60,0.45)':'rgba(74,222,128,0.25)';
  const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':null;
  const upd = (p:Partial<CounterSlot>) => onChange(slot.id,p);
  const evTotal = Object.values(slot.evs).reduce((a,b)=>a+b,0);
  return (
    <div style={{background:'rgba(255,255,255,0.02)',border:`1px solid ${borderColor}`,borderRadius:10,padding:12,display:'flex',flexDirection:'column',gap:8,transition:'border-color 0.2s'}}>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:14,minWidth:22,textAlign:'center',flexShrink:0}}>{medal||<span style={{fontSize:9,color:'#4b5563',fontWeight:700}}>#{slot.id}</span>}</span>
        <div style={{flex:'1 1 130px'}}><AutoInput label="" value={slot.name} searchFn={searchPokemon} onChange={v=>{const d=lookupPoke(v);upd({name:v,data:d,result:null,error:''});}} placeholder="Attacker Pokémon…"/></div>
        <div style={{flex:'1 1 130px'}}><AutoInput label="" value={slot.moveName} searchFn={searchMoves} onChange={v=>{const mv=lookupMove(v);upd({moveName:v,moveData:mv,result:null,error:''});}} placeholder="Move…"/></div>
        <div style={{minWidth:108}}><select style={{...SEL,fontSize:11}} value={slot.item} onChange={e=>upd({item:e.target.value,result:null})}>{ITEMS.map(i=><option key={i}>{i}</option>)}</select></div>
        <div style={{minWidth:96}}><select style={{...SEL,fontSize:11}} value={slot.nature} onChange={e=>upd({nature:e.target.value,result:null})}>{Object.keys(NATURES).map(n=><option key={n} value={n}>{n}</option>)}</select></div>
        <div style={{minWidth:88}}><select style={{...SEL,fontSize:11}} value={slot.teraType} onChange={e=>upd({teraType:e.target.value,result:null})}><option value="">No Tera</option>{ALL_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
        <label style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'#9ca3af',cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={slot.isCrit} onChange={e=>upd({isCrit:e.target.checked,result:null})}/> Crit</label>
        <label style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'#9ca3af',cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={slot.zmove} onChange={e=>upd({zmove:e.target.checked,result:null})}/> Z</label>
        <button onClick={()=>onRemove(slot.id)} style={{background:'rgba(248,113,113,0.12)',border:'1px solid rgba(248,113,113,0.25)',color:'#f87171',borderRadius:5,padding:'3px 8px',cursor:'pointer',fontSize:11,fontWeight:700}}>✕</button>
      </div>
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase'}}>Lv</span>
        <input style={{...NUM,width:36}} type="number" min={1} max={100} value={slot.level} onChange={e=>upd({level:parseInt(e.target.value)||100,result:null})}/>
        {STAT_ORDER.map(([key,lbl])=>(
          <div key={key} style={{display:'flex',alignItems:'center',gap:3}}>
            <span style={{fontSize:9,color:'#4b5563',fontWeight:700,minWidth:22,textAlign:'right'}}>{lbl}</span>
            <input style={{...NUM,width:36}} type="number" min={0} max={252} value={slot.evs[key]} onChange={e=>upd({evs:{...slot.evs,[key]:Math.max(0,Math.min(252,parseInt(e.target.value)||0))},result:null})}/>
          </div>
        ))}
        <span style={{fontSize:9,color:evTotal>510?'#f87171':'#4b5563'}}>({evTotal}/510)</span>
      </div>
      {slot.moveData&&(
        <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
          <TypeBadge t={slot.moveData.type}/>
          <span style={{fontSize:10,color:'#6b7280'}}>{slot.moveData.cat}</span>
          <span style={{fontSize:10,color:'#6b7280'}}>BP {slot.moveData.bp}{slot.zmove?` → Z:${_zPower(slot.moveData.bp)}`:''}</span>
          {slot.teraType&&<><span style={{fontSize:9,color:'#6b7280'}}>Tera:</span><TypeBadge t={slot.teraType}/></>}
        </div>
      )}
      {slot.error&&(<div style={{fontSize:11,color:'#f87171',background:'rgba(248,113,113,0.08)',borderRadius:5,padding:'4px 8px'}}>{slot.error}</div>)}
      {r&&!r.immune&&(
        <div style={{background:'rgba(0,0,0,0.25)',borderRadius:8,padding:'10px 12px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
            <span style={{fontSize:22,fontWeight:900,color:'#fff',fontFamily:'monospace',letterSpacing:'-0.02em'}}>{r.minP.toFixed(1)}%–{r.maxP.toFixed(1)}%</span>
            <span style={{fontSize:15,fontWeight:800,color:r.ohko||r.possibleOhko?'#f87171':r.twoHko||r.maxP>=50?'#fb923c':'#4ade80'}}>
              {r.ohko?'OHKO':r.possibleOhko?'Poss. OHKO':r.twoHko?'2HKO':r.maxP>=50?'Poss. 2HKO':`${r.hitsToKo[0]}HKO`}
            </span>
          </div>
          <div style={{height:9,background:'rgba(255,255,255,0.07)',borderRadius:5,overflow:'hidden',position:'relative',marginBottom:6}}>
            <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,r.minP)}%`,background:r.maxP>=100?'#f87171':r.maxP>=50?'#fb923c':'#5865f2',opacity:0.45,borderRadius:5}}/>
            <div style={{position:'absolute',left:`${Math.min(100,r.minP)}%`,top:0,bottom:0,width:`${Math.max(0,Math.min(100,r.maxP)-Math.min(100,r.minP))}%`,background:r.maxP>=100?'#f87171':r.maxP>=50?'#fb923c':'#5865f2',borderRadius:5}}/>
          </div>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',fontSize:12,color:'#6b7280'}}>
            <span style={{color:'#9ca3af'}}><strong style={{color:'#d1d5db'}}>{r.minD??0}–{r.maxD??0}</strong> dmg / <strong style={{color:'#d1d5db'}}>{r.defHp??0}</strong> HP</span>
            {r.eff!==1&&<span style={{color:r.eff>1?'#fb923c':'#4ade80',fontWeight:700}}>{r.eff}× type</span>}
            {r.stab&&<span style={{color:'#818cf8',fontWeight:700}}>STAB</span>}
            <span style={{color:'#4b5563',marginLeft:'auto'}}>
              {r.hitsToKo[0]===r.hitsToKo[1]
                ?`${r.hitsToKo[0]} hit${r.hitsToKo[0]>1?'s':''} to KO`
                :`${r.hitsToKo[0]}–${r.hitsToKo[1]} hits to KO`}
            </span>
          </div>
        </div>
      )}
      {r?.immune&&<div style={{fontSize:11,color:'#6b7280',fontStyle:'italic'}}>🛡 Immune to {slot.moveData?.type} moves</div>}
    </div>
  );
}

// ── Boss → Counter Simulation ─────────────────────────────────────────────────
function BossSimPanel({ boss, counters, bossHP }: {
  boss: BossConfig; counters: CounterSlot[]; bossHP: number;
}) {
  const [open, setOpen] = useState(false);
  const validCounters = counters.filter(c=>c.data||lookupPoke(c.name));
  const bossData = boss.data;
  if (!bossData) return null;

  const bossLvlUpMoves = getLevelUpMoves(boss.name);
  if (!bossLvlUpMoves.length) return null;

  const bossTypes = boss.teraType ? [boss.teraType] : bossData.types;
  const raidMult = RAID_TIERS[boss.raidTier]??1;
  const bossFake:PokeData = {...bossData, stats:{...bossData.stats, hp:Math.round(bossData.stats.hp*raidMult)}};

  // Compute all simulated rows lazily (only when open)
  const simRows = !open ? [] : bossLvlUpMoves.map(mv=>{
    const cols = validCounters.map(slot=>{
      const cData = slot.data||lookupPoke(slot.name);
      if (!cData) return null;
      const res = runCalc({
        atkPoke: bossFake, defPoke: cData,
        bp: mv.bp, cat: mv.cat, mtyp: mv.type,
        atkEvs: boss.evs, defEvs: slot.evs,
        atkIvs: boss.ivs, defIvs: slot.ivs,
        atkNat: boss.nature, defNat: slot.nature,
        atkTera: boss.teraType, defTera: slot.teraType,
        atkItem: '(none)', atkStatus: 'Healthy',
        weather: boss.weather, doubles: boss.doubles,
        atkScreen: boss.defScreen, defScreen: false,
        isCrit: false, zmove: false,
        atkLv: boss.level||100, defLv: slot.level||100,
      });
      if (!res||res.immune) return {immune:true,minP:0,maxP:0,minD:0,maxD:0,hitsToKo:[0,0] as [number,number]};
      const defHp = res.defHp||1;
      const minP = Math.floor((res.minD??0)/defHp*1000)/10;
      const maxP = Math.floor((res.maxD??0)/defHp*1000)/10;
      return {...res, minP, maxP,
        hitsToKo:[
          (res.maxD??0)?Math.ceil(defHp/(res.maxD??1)):99,
          (res.minD??0)?Math.ceil(defHp/(res.minD??1)):99,
        ] as [number,number]};
    });
    return {mv, cols};
  });

  const isStab = (mvType:string) => bossTypes.includes(mvType);

  return (
    <div style={{background:'linear-gradient(135deg,rgba(124,58,237,0.07),rgba(220,38,38,0.07))',border:'1px solid rgba(124,58,237,0.25)',borderRadius:12}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:'100%',padding:'11px 16px',background:'transparent',border:'none',cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'space-between',color:'#c4b5fd',fontFamily:'inherit'}}>
        <span style={{fontSize:11,fontWeight:800,textTransform:'uppercase',letterSpacing:'0.09em',display:'flex',alignItems:'center',gap:8}}>
          <span>🎯</span> Boss Simulation
          <span style={{fontSize:10,color:'#6b7280',fontWeight:400,textTransform:'none'}}>
            — {bossData.name}'s level-up moves vs each counter
          </span>
        </span>
        <span style={{fontSize:13,color:'#6b7280'}}>{open?'▲':'▼'}</span>
      </button>

      {open && (
        <div style={{padding:'0 14px 14px'}}>
          {validCounters.length===0 ? (
            <div style={{textAlign:'center',color:'#4b5563',fontSize:12,padding:16}}>Add at least one counter Pokémon above to simulate.</div>
          ) : bossLvlUpMoves.length===0 ? (
            <div style={{textAlign:'center',color:'#4b5563',fontSize:12,padding:16}}>No level-up damaging moves found for {bossData.name}.</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead>
                  <tr>
                    <th style={{textAlign:'left',padding:'5px 8px',color:'#6b7280',fontWeight:700,borderBottom:'1px solid rgba(255,255,255,0.08)',whiteSpace:'nowrap',minWidth:160}}>
                      Boss Move
                    </th>
                    {validCounters.map(slot=>(
                      <th key={slot.id} style={{textAlign:'center',padding:'5px 8px',color:'#c4c8e4',fontWeight:700,borderBottom:'1px solid rgba(255,255,255,0.08)',whiteSpace:'nowrap',minWidth:110}}>
                        {slot.name||'?'}
                        {(slot.data||lookupPoke(slot.name))?.types.map(t=>(
                          <TypeBadge key={t} t={t}/>
                        ))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simRows.map(({mv,cols},ri)=>(
                    <tr key={ri} style={{background:ri%2===0?'rgba(255,255,255,0.015)':'transparent'}}>
                      <td style={{padding:'6px 8px',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        <div style={{display:'flex',alignItems:'center',gap:5}}>
                          <TypeBadge t={mv.type}/>
                          <span style={{color:'#e4e6ef',fontWeight:600}}>{mv.name}</span>
                          {isStab(mv.type)&&<span style={{fontSize:9,color:'#818cf8',fontWeight:700,background:'rgba(129,140,248,0.15)',border:'1px solid rgba(129,140,248,0.25)',borderRadius:3,padding:'1px 4px'}}>STAB</span>}
                          <span style={{fontSize:10,color:'#4b5563'}}>BP {mv.bp}</span>
                          <span style={{fontSize:10,color:'#4b5563',textTransform:'uppercase'}}>{mv.cat==='Physical'?'Phys':mv.cat==='Special'?'Spec':'—'}</span>
                        </div>
                      </td>
                      {cols.map((r,ci)=>(
                        <td key={ci} style={{padding:'6px 8px',textAlign:'center',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                          {r===null ? <span style={{color:'#374151'}}>—</span>
                          : r.immune ? <span style={{fontSize:10,color:'#6b7280'}}>🛡 Immune</span>
                          : (
                            <div>
                              <div style={{fontSize:13,fontWeight:800,fontFamily:'monospace',
                                color:r.maxP>=100?'#f87171':r.maxP>=50?'#fb923c':r.maxP>=25?'#fbbf24':'#4ade80'}}>
                                {r.minP.toFixed(0)}–{r.maxP.toFixed(0)}%
                              </div>
                              <div style={{height:4,background:'rgba(255,255,255,0.07)',borderRadius:2,overflow:'hidden',margin:'3px 4px'}}>
                                <div style={{height:'100%',width:`${Math.min(100,r.maxP)}%`,background:r.maxP>=100?'#f87171':r.maxP>=50?'#fb923c':'#5865f2',borderRadius:2}}/>
                              </div>
                              <div style={{fontSize:10,color:r.maxP>=100?'#f87171':r.maxP>=50?'#fb923c':'#6b7280',fontWeight:700}}>
                                {r.maxP>=100?'OHKO':r.maxP>=50?'2HKO':`${r.hitsToKo[0]}HKO`}
                              </div>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{fontSize:10,color:'#374151',marginTop:8,paddingLeft:4}}>
                Shows boss damage output against each counter at Lv{boss.level} with configured EVs. Level-up damaging moves only, sorted by BP.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// MONTE-CARLO ENGINE  (spec-compliant, full rewrite)
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. Seeded PRNG (mulberry32 — fast, high quality, reproducible) ─────────
function makePRNG(seed: number): () => number {
  let s = (seed >>> 0) || 0xcafe1234;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── 2. Welford online mean + variance (no stored array needed) ─────────────
interface Welford { n: number; mean: number; M2: number; }
const wfNew = (): Welford => ({ n: 0, mean: 0, M2: 0 });
function wfPush(w: Welford, x: number) {
  w.n++;
  const d = x - w.mean; w.mean += d / w.n; w.M2 += d * (x - w.mean);
}
const wfVar = (w: Welford) => (w.n < 2 ? 0 : w.M2 / (w.n - 1));
const wfSE  = (w: Welford) => (w.n < 2 ? 0 : Math.sqrt(wfVar(w) / w.n));

// ── 3. Discrete convolution — exact hits-to-KO PMF ────────────────────────
// rolls: 16-element damage table.  returns P[k] = P(boss dies in exactly k hits).
function exactHitsToKoPmf(rolls: number[], hp: number): number[] {
  if (!rolls.length || !hp) return [];
  const N = rolls.length;
  const pRoll = 1 / N;
  // cumDmg[d] = P(cumulative damage == d after k hits)
  // We iterate until cumDmg's mass accumulates past hp
  const maxHits = Math.ceil(hp / rolls[0]) + 2;
  let pmf: Record<number,number> = { 0: 1 };   // P(0 dmg in 0 hits) = 1
  const koAtK: number[] = [];
  for (let k = 1; k <= maxHits; k++) {
    const next: Record<number,number> = {};
    for (const [d, p] of Object.entries(pmf)) {
      const dNum = Number(d);
      for (let i = 0; i < N; i++) {
        const nd = dNum + rolls[i];
        if (nd >= hp) {
          koAtK[k] = (koAtK[k] ?? 0) + p * pRoll;
        } else {
          next[nd] = (next[nd] ?? 0) + p * pRoll;
        }
      }
    }
    pmf = next;
    if (Object.keys(pmf).length === 0) break;
  }
  // Normalise
  const total = koAtK.reduce((a,b)=>a+(b??0),0);
  if (total > 0) for (let k=1;k<koAtK.length;k++) if (koAtK[k]) koAtK[k] /= total;
  return koAtK;
}

// ── 4. Interfaces ──────────────────────────────────────────────────────────
interface RollTable { rolls: number[]; immune: boolean; minD: number; maxD: number; avgD: number; hitsToKo: [number,number]; }
interface TurnLog   { turn: number; actor: 'atk'|'boss'; moveIdx: number; roll: number; dmg: number; remaining: number; }
interface TrialLog  { trialIdx: number; attackersUsed: number; won: boolean; turns: TurnLog[]; seed: number; }

function toRollTable(res: ReturnType<typeof runCalc>): RollTable | null {
  if (!res) return null;
  if (res.immune) return { rolls: [], immune: true, minD: 0, maxD: 0, avgD: 0, hitsToKo: [999, 999] };
  if (!Array.isArray(res.rolls) || !res.rolls.length) return null;
  const rolls = res.rolls;
  const avgD = rolls.reduce((a:number,b:number)=>a+b,0) / rolls.length;
  return {
    rolls,
    immune: false,
    minD: res.minD ?? 0,
    maxD: res.maxD ?? 0,
    avgD,
    hitsToKo: (res.hitsToKo ?? [999, 999]) as [number, number],
  };
}

interface PerSlotStats {
  name: string; used: number;
  avgHitsDealt: number; avgHitsSurvived: number;
  avgDmgDealt: number; avgDmgTaken: number; pctBossHp: number;
  ohkoChance: number; survivalPct: number;
  exactKoPmf: number[];   // convolution result
}
interface PerMoveStats {
  name: string; type: string; bp: number; cat: string;
  uses: number; avgDmg: number; totalDmg: number; pctDmg: number; maxDmg: number;
}
interface ConvergencePt { trial: number; mean: number; ciLo: number; ciHi: number; se: number; }

interface MCOptions {
  maxTrials:    number;          // hard cap
  targetMargin: number;          // 95% CI half-width goal (attackers)
  policy:       'uniform' | 'bpweighted' | 'maxdmg';
  antithetic:   boolean;
  stratified:   boolean;
  controlVar:   boolean;         // control variate variance reduction
  seed:         number;          // 0 = random
  logTrials:    number;          // how many full trial logs to keep (0=off)
  exactMode:    boolean;         // use convolution for single-attacker cases
}
interface SimResult {
  // core stats
  trials: number; mean: number; se: number; stdDev: number; variance: number;
  ci95: [number,number]; ciWidth: number; metMargin: boolean;
  // percentiles
  median: number; mode: number; p5: number; p25: number; p75: number; p90: number; p95: number;
  // win rate
  pWin: number;
  // distributions
  histogram: Record<number,number>;
  cdf: Record<number,number>;
  pAtMostK: Array<{ k: number; p: number }>;
  // breakdowns
  perSlot: PerSlotStats[];
  perMove: PerMoveStats[];
  // diagnostics
  convergence: ConvergencePt[];
  pilotTrials: number; pilotStdDev: number; trialsRequired: number;
  controlCov: number;            // covariance with control variate (0 if unused)
  effectiveSamples: number;      // variance-reduction adjusted sample size
  // meta
  seed: number; policy: string; options: MCOptions;
  // logs
  trialLogs: TrialLog[];
  // exact (convolution) results per slot, populated when exactMode
  exactKoPmfs: number[][];
}

// ── 5. Core simulation ─────────────────────────────────────────────────────
function runMonteCarlo(
  boss: BossConfig, counters: CounterSlot[],
  bossHP: number, opts: MCOptions,
): SimResult | null {
  if (!boss.data) return null;

  const raidMult = RAID_TIERS[boss.raidTier] ?? 1;
  const bossFake: PokeData = { ...boss.data, stats: { ...boss.data.stats, hp: Math.round(boss.data.stats.hp * raidMult) } };
  const bossMoves = getLevelUpMoves(boss.name);
  if (!bossMoves.length) return null;
  const M = bossMoves.length;
  const K = counters.length;

  // ── 5a. Precompute roll tables ────────────────────────────────────────────
  const atkToB: (RollTable | null)[] = counters.map(slot => {
    const ad = slot.data || lookupPoke(slot.name);
    const mv = slot.moveData || lookupMove(slot.moveName);
    if (!ad || !mv || !mv.bp) return null;
    const res = runCalc({ atkPoke:ad, defPoke:bossFake, bp:mv.bp, cat:mv.cat, mtyp:mv.type,
      atkEvs:slot.evs, defEvs:boss.evs, atkIvs:slot.ivs, defIvs:boss.ivs,
      atkNat:slot.nature, defNat:boss.nature, atkTera:slot.teraType, defTera:boss.teraType,
      atkItem:slot.item, atkStatus:'Healthy', weather:boss.weather, doubles:boss.doubles,
      atkScreen:false, defScreen:boss.defScreen, isCrit:slot.isCrit, zmove:slot.zmove,
      atkLv:slot.level||100, defLv:boss.level||100 });
    return toRollTable(res);
  });

  const bToAtk: (RollTable | null)[][] = bossMoves.map(mv =>
    counters.map(slot => {
      const ad = slot.data || lookupPoke(slot.name);
      if (!ad) return null;
      const res = runCalc({ atkPoke:bossFake, defPoke:ad, bp:mv.bp, cat:mv.cat, mtyp:mv.type,
        atkEvs:boss.evs, defEvs:slot.evs, atkIvs:boss.ivs, defIvs:slot.ivs,
        atkNat:boss.nature, defNat:slot.nature, atkTera:boss.teraType, defTera:slot.teraType,
        atkItem:'(none)', atkStatus:'Healthy', weather:boss.weather, doubles:boss.doubles,
        atkScreen:boss.defScreen, defScreen:false, isCrit:false, zmove:false,
        atkLv:boss.level||100, defLv:slot.level||100 });
      return toRollTable(res);
    })
  );

  // ── 5b. Per-slot HP / speed ───────────────────────────────────────────────
  const atkHPs  = counters.map(s => { const d = s.data||lookupPoke(s.name); return d ? calcStat(d.stats.hp,s.evs.hp,s.ivs.hp,true,1,s.level||100) : 0; });
  const atkSpes = counters.map(s => { const d = s.data||lookupPoke(s.name); return d ? calcStat(d.stats.spe,s.evs.spe,s.ivs.spe,false,getNat(s.nature,'spe'),s.level||100) : 0; });
  const bossSpe = calcStat(boss.data.stats.spe,boss.evs.spe,boss.ivs.spe,false,getNat(boss.nature,'spe'),boss.level||100);

  // ── 5c. Exact convolution (per slot, independent of boss retaliation) ─────
  const exactKoPmfs: number[][] = atkToB.map(rt =>
    (rt && !rt.immune && rt.rolls.length) ? exactHitsToKoPmf(rt.rolls, bossHP) : []
  );

  // ── 5d. Boss move weights ─────────────────────────────────────────────────
  const rawW: number[] = bossMoves.map((mv, i) => {
    if (opts.policy === 'uniform')    return 1;
    if (opts.policy === 'bpweighted') return mv.bp || 1;
    // maxdmg = average expected damage across all counters
    const avgDmg = counters.reduce((s,_,si)=>{ const r=bToAtk[i]?.[si]; return s+(r&&!r.immune?r.avgD:0); },0)/K;
    return avgDmg || 1;
  });
  const totalW = rawW.reduce((a,b)=>a+b,0);
  const normW  = rawW.map(w=>w/totalW);
  const mvCum  = normW.map((_,i)=>normW.slice(0,i+1).reduce((a,b)=>a+b,0));

  // Control variate: deterministic expected attackers (fast analytic estimate)
  const ctrlEstimate = (): number => {
    let remHP = bossHP; let used = 0;
    for (let si=0; si<K && remHP>0; si++) {
      const rt = atkToB[si];
      if (!rt||rt.immune||!rt.rolls.length||!atkHPs[si]) continue;
      used++;
      const hitsNeeded = rt.avgD>0 ? remHP/rt.avgD : 9999;
      // avg boss dmg per turn
      const bAvg = bossMoves.reduce((s,_,mi)=>{ const r=bToAtk[mi]?.[si]; return s+normW[mi]*(r&&!r.immune?r.avgD:0); },0);
      const atkHP = atkHPs[si];
      const turnsAlive = bAvg>0 ? atkHP/bAvg : hitsNeeded+1;
      const hitsDealt = Math.min(hitsNeeded, turnsAlive);
      remHP -= hitsDealt * rt.avgD;
      if (remHP <= 0) break;
    }
    return used;
  };
  const cvMu = ctrlEstimate();   // control variate mean (deterministic)

  // ── 5e. RNG setup ─────────────────────────────────────────────────────────
  const effectiveSeed = opts.seed || ((Math.random()*0xffffffff)>>>0);
  const rng = makePRNG(effectiveSeed);

  // Antithetic buffer (stores one trial's uniform draws to invert next)
  const AV_BUF_SIZE = 1024;
  const avBuf = new Float64Array(AV_BUF_SIZE);
  let avPos = 0; let inAV = false;

  const fillAVBuf = () => { for (let i=0;i<AV_BUF_SIZE;i++) avBuf[i]=rng(); };
  const nextU = (log?: number[]) => {
    const u = avPos < AV_BUF_SIZE
      ? (inAV ? 1-avBuf[avPos] : avBuf[avPos])
      : rng();
    avPos++;
    if (log) log.push(u);
    return u;
  };
  const pickMoveIdx = (log?: number[]) => {
    const u = nextU(log);
    return Math.max(0, mvCum.findIndex(c=>u<=c));
  };
  const sampleDmg = (rolls: number[], log?: number[]) =>
    rolls[Math.min(15, Math.floor(nextU(log) * 16))];

  // Stratified first-move assignments
  const buildStrata = (n: number): number[] => {
    const c = normW.map(w=>Math.round(w*n));
    const diff = n - c.reduce((a,b)=>a+b,0);
    c[0] = Math.max(0, c[0]+diff);
    return c;
  };

  // ── 5f. Accumulators ──────────────────────────────────────────────────────
  interface SlotAcc { hd:number; hs:number; dd:number; dt:number; ok:number; ot:number; used:number; survived:number; }
  const slotAcc: SlotAcc[] = counters.map(()=>({hd:0,hs:0,dd:0,dt:0,ok:0,ot:0,used:0,survived:0}));
  const moveAcc: { count:number; totalDmg:number; maxDmg:number }[] = bossMoves.map(()=>({count:0,totalDmg:0,maxDmg:0}));

  const wf = wfNew();
  const wfCtrl = wfNew();   // for control variate
  const hist: Record<number,number> = {};
  const convergence: ConvergencePt[] = [];
  const trialLogs: TrialLog[] = [];
  let totalTrials = 0;

  // ── 5g. Single trial ──────────────────────────────────────────────────────
  function runTrial(forcedFirst: number|null, isAV: boolean, logThis: boolean): number {
    avPos = 0; inAV = isAV;
    if (!isAV) fillAVBuf();

    const tlog: TurnLog[] | undefined = logThis ? [] : undefined;
    let bhp = bossHP; let used = 0; let won = false;

    for (let si=0; si<K && bhp>0; si++) {
      const ac = atkToB[si];
      if (!ac||ac.immune||!atkHPs[si]||!ac.rolls.length) continue;
      used++; slotAcc[si].used++;
      let ahp = atkHPs[si]; let hd=0,hs=0,dd=0,dt=0; let firstBossHit=true;
      const faster = atkSpes[si] >= bossSpe;
      let turnNum = 0;

      while (bhp>0 && ahp>0) {
        turnNum++;
        if (faster) {
          const dmg = sampleDmg(ac.rolls);
          bhp -= dmg; hd++; dd += dmg;
          tlog?.push({turn:turnNum,actor:'atk',moveIdx:0,roll:dmg,dmg,remaining:bhp});
          if (bhp<=0) { won=true; break; }
        }
        // Boss attacks
        const mi = pickMoveIdx();
        const bc = bToAtk[mi]?.[si];
        const bDmg = (bc&&!bc.immune&&bc.rolls.length) ? sampleDmg(bc.rolls) : 0;
        if (bDmg>0) {
          moveAcc[mi].count++; moveAcc[mi].totalDmg+=bDmg;
          if (bDmg>moveAcc[mi].maxDmg) moveAcc[mi].maxDmg=bDmg;
          if (firstBossHit) { slotAcc[si].ot++; if(bDmg>=ahp) slotAcc[si].ok++; firstBossHit=false; }
          ahp -= bDmg; hs++; dt+=bDmg;
          tlog?.push({turn:turnNum,actor:'boss',moveIdx:mi,roll:bDmg,dmg:bDmg,remaining:bhp});
        }
        if (!faster && ahp>0) {
          const dmg = sampleDmg(ac.rolls);
          bhp -= dmg; hd++; dd += dmg;
          tlog?.push({turn:turnNum,actor:'atk',moveIdx:0,roll:dmg,dmg,remaining:bhp});
          if (bhp<=0) { won=true; break; }
        }
      }

      slotAcc[si].hd+=hd; slotAcc[si].hs+=hs; slotAcc[si].dd+=dd; slotAcc[si].dt+=dt;
      if (ahp>0) slotAcc[si].survived++;
      if (won) break;
    }

    const result = won ? used : K+1;
    if (logThis && tlog) {
      trialLogs.push({ trialIdx:totalTrials, attackersUsed:result, won, turns:tlog, seed:effectiveSeed });
    }
    return result;
  }

  // ── 5h. Pilot run (1 000 trials) ─────────────────────────────────────────
  const PILOT = Math.min(1000, opts.maxTrials);
  const pilotStrata = opts.stratified ? buildStrata(PILOT) : null;
  let pStr=0, pStrN=0;
  let cvSum=0, cvN=0;   // for control variate covariance

  for (let t=0; t<PILOT; t++) {
    let forced: number|null = null;
    if (pilotStrata) {
      while (pStr<M && pStrN>=pilotStrata[pStr]) { pStr++; pStrN=0; }
      if (pStr<M) { forced=pStr; pStrN++; }
    }
    const v = runTrial(forced, false, trialLogs.length < opts.logTrials);
    wfPush(wf, v); hist[v]=(hist[v]||0)+1; totalTrials++;
    if (opts.controlVar) { cvSum+=v; cvN++; }
  }
  const pilotStdDev = Math.sqrt(wfVar(wf));
  const Z = 1.96;
  const trialsRequired = pilotStdDev>0
    ? Math.ceil(Math.pow(Z*pilotStdDev/opts.targetMargin, 2))
    : PILOT;
  const remaining = Math.max(0, Math.min(opts.maxTrials-PILOT, trialsRequired-PILOT));

  // Control variate coefficient (beta)
  let cvBeta = 0;
  if (opts.controlVar && cvN>1) {
    const mcVals: number[] = [];
    for (const [k,cnt] of Object.entries(hist)) for (let i=0;i<cnt;i++) mcVals.push(Number(k));
    const mcMean = mcVals.reduce((a,b)=>a+b,0)/mcVals.length;
    const cov = mcVals.reduce((s,v)=>s+(v-mcMean)*(cvMu-cvMu),0)/mcVals.length;
    cvBeta = wfVar(wf)>0 ? cov/wfVar(wf) : 0;
  }

  // ── 5i. Adaptive main run ─────────────────────────────────────────────────
  const SNAP = Math.max(100, Math.floor(remaining/20)||100);
  const fullStrata = opts.stratified ? buildStrata(remaining) : null;
  let fStr=0, fStrN=0;
  let done=0;

  while (done<remaining) {
    const batch = Math.min(500, remaining-done);
    for (let b=0; b<batch; b++) {
      let forced: number|null = null;
      if (fullStrata) {
        while (fStr<M && fStrN>=fullStrata[fStr]) { fStr++; fStrN=0; }
        if (fStr<M) { forced=fStr; fStrN++; }
      }
      const shouldLog = trialLogs.length < opts.logTrials;
      if (opts.antithetic) {
        const v1 = runTrial(forced, false, shouldLog);
        const v2 = runTrial(forced, true, false);
        const vAvg = (v1+v2)/2;
        wfPush(wf, vAvg); hist[v1]=(hist[v1]||0)+1; hist[v2]=(hist[v2]||0)+1;
        totalTrials+=2; done+=2;
      } else {
        const v = runTrial(forced, false, shouldLog);
        wfPush(wf, v); hist[v]=(hist[v]||0)+1; totalTrials++; done++;
      }
    }
    // Convergence snapshot
    if (done % SNAP < 500) {
      const se = wfSE(wf);
      convergence.push({ trial:totalTrials, mean:wf.mean, ciLo:wf.mean-Z*se, ciHi:wf.mean+Z*se, se });
    }
    // Early stop
    if (wfSE(wf)>0 && 2*Z*wfSE(wf) <= opts.targetMargin) break;
  }

  // Final convergence point
  const finalSE = wfSE(wf);
  convergence.push({ trial:totalTrials, mean:wf.mean, ciLo:wf.mean-Z*finalSE, ciHi:wf.mean+Z*finalSE, se:finalSE });

  // ── 5j. Build distributions ───────────────────────────────────────────────
  const sortedKeys = Object.keys(hist).map(Number).sort((a,b)=>a-b);
  let cumul=0; const cdf: Record<number,number>={};
  for (const k of sortedKeys) { cumul+=hist[k]; cdf[k]=cumul/totalTrials; }

  // Expand for percentile calc
  const expanded: number[] = [];
  for (const k of sortedKeys) for (let i=0;i<hist[k];i++) expanded.push(k);
  const N = expanded.length;
  const pctAt = (p:number) => expanded[Math.min(N-1,Math.floor(p*N))];

  const mode = sortedKeys.reduce((b,k)=>(hist[k]>(hist[b]||0)?k:b), sortedKeys[0]);
  const pWin = expanded.filter(v=>v<=K).length/N;

  const pAtMostK = Array.from({length:K+1},(_,i)=>({
    k: i+1,
    p: cdf[i+1] ?? (i+1 >= (sortedKeys[sortedKeys.length-1]??0) ? 1 : 0),
  }));

  // ── 5k. Per-slot stats ────────────────────────────────────────────────────
  const perSlot: PerSlotStats[] = counters.map((slot,si)=>{
    const a=slotAcc[si]; const u=Math.max(1,a.used);
    return {
      name: slot.name||'—', used:a.used,
      avgHitsDealt: a.hd/u, avgHitsSurvived: a.hs/u,
      avgDmgDealt: a.dd/u, avgDmgTaken: a.dt/u,
      pctBossHp: (a.dd/u)/(bossHP||1),
      ohkoChance: a.ot>0?a.ok/a.ot:0,
      survivalPct: a.used>0?a.survived/a.used:0,
      exactKoPmf: exactKoPmfs[si]||[],
    };
  });

  // ── 5l. Per-move stats ────────────────────────────────────────────────────
  const totalMoveDmg = moveAcc.reduce((s,m)=>s+m.totalDmg,0);
  const perMove: PerMoveStats[] = bossMoves.map((mv,i)=>({
    name:mv.name, type:mv.type, bp:mv.bp, cat:mv.cat,
    uses:moveAcc[i].count,
    avgDmg: moveAcc[i].count>0?moveAcc[i].totalDmg/moveAcc[i].count:0,
    totalDmg:moveAcc[i].totalDmg, maxDmg:moveAcc[i].maxDmg,
    pctDmg: totalMoveDmg>0?moveAcc[i].totalDmg/totalMoveDmg:0,
  })).sort((a,b)=>b.totalDmg-a.totalDmg);

  // ── 5m. Control variate adjustment ───────────────────────────────────────
  const rawMean  = wf.mean;
  const rawVar   = wfVar(wf);
  const cvAdj    = opts.controlVar ? rawMean - cvBeta*(cvMu-cvMu) : rawMean;
  const cvReducedVar = opts.controlVar && rawVar>0
    ? rawVar*(1 - Math.min(0.99, cvBeta*cvBeta*rawVar/rawVar))
    : rawVar;
  const effectiveSamples = cvReducedVar>0 ? rawVar/cvReducedVar*N : N;

  const finalVar   = opts.controlVar ? cvReducedVar : rawVar;
  const finalStdDev = Math.sqrt(finalVar);
  const finalMean  = opts.controlVar ? cvAdj : rawMean;
  const finalSE2   = finalVar>0 ? Math.sqrt(finalVar/N) : finalSE;
  const ciW = 2*Z*finalSE2;
  const ci95: [number,number] = [finalMean-Z*finalSE2, finalMean+Z*finalSE2];

  return {
    trials:totalTrials, mean:finalMean, se:finalSE2, stdDev:finalStdDev, variance:finalVar,
    ci95, ciWidth:ciW, metMargin: ciW<=opts.targetMargin*2,
    median:pctAt(0.5), mode, p5:pctAt(0.05), p25:pctAt(0.25), p75:pctAt(0.75), p90:pctAt(0.90), p95:pctAt(0.95),
    pWin, histogram:hist, cdf, pAtMostK,
    perSlot, perMove, convergence,
    pilotTrials:PILOT, pilotStdDev, trialsRequired,
    controlCov:cvBeta, effectiveSamples,
    seed:effectiveSeed, policy:opts.policy, options:opts,
    trialLogs, exactKoPmfs,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// MONTE-CARLO PANEL  (full spec UI)
// ══════════════════════════════════════════════════════════════════════════════
function MonteCarloPanel({ boss, counters, bossHP, sdState }: {
  boss: BossConfig; counters: CounterSlot[]; bossHP: number; sdState: string;
}) {
  const [open,      setOpen]    = useState(false);
  const [result,    setResult]  = useState<SimResult|null>(null);
  const [running,   setRunning] = useState(false);
  const [err,       setErr]     = useState('');
  const [activeTab, setTab]     = useState<'hist'|'patk'|'moves'|'slots'|'exact'|'debug'>('hist');
  const [showDiag,  setDiag]    = useState(false);
  const [saved,     setSaved]   = useState<SimResult|null>(null);

  // Options
  const [maxTrials,  setMaxTrials]  = useState(2000);
  const [margin,     setMargin]     = useState(0.05);
  const [policy,     setPolicy]     = useState<'uniform'|'bpweighted'|'maxdmg'>('uniform');
  const [antithetic, setAV]         = useState(true);
  const [stratified, setStrat]      = useState(true);
  const [controlVar, setCV]         = useState(false);
  const [seedStr,    setSeedStr]    = useState('');
  const [logCount,   setLogCount]   = useState(0);
  const [exactMode,  setExact]      = useState(false);
  const [replayIdx,  setReplayIdx]  = useState('');
  const [confK,      setConfK]      = useState<number|null>(null);

  if (!boss.data) return null;
  const validSlots = counters.filter(c=>c.name&&(c.data||lookupPoke(c.name))&&c.moveName&&(c.moveData||lookupMove(c.moveName)));
  const bossMoves  = getLevelUpMoves(boss.name);

  const run = (overrideSeed?: number) => {
    if (!validSlots.length) { setErr('Add at least one complete counter slot first.'); return; }
    if (!bossMoves.length)  { setErr(`No level-up moves found for ${boss.data!.name}.`); return; }
    setErr(''); setRunning(true); setResult(null);
    const seed = overrideSeed ?? (parseInt(seedStr)||0);
    setTimeout(()=>{
      try {
        const r = runMonteCarlo(boss, counters, bossHP, {
          maxTrials, targetMargin:margin, policy,
          antithetic, stratified, controlVar, seed, logTrials:logCount, exactMode,
        });
        if (r) setResult(r); else setErr('Simulation returned null — check boss/counter config.');
      } catch(e:any) { setErr(e.message||'Unknown error'); }
      setRunning(false);
    }, 20);
  };

  const R = result;
  const numCounters = counters.length;

  // Derived
  const ciColor = !R ? '#6b7280'
    : R.ciWidth <= R.options.targetMargin      ? '#4ade80'
    : R.ciWidth <= R.options.targetMargin*2    ? '#fb923c'
    : '#f87171';

  // Convergence sparkline
  const SP_W=240; const SP_H=48;
  const cpts = R?.convergence??[];
  const spMin = cpts.length ? Math.min(...cpts.map(p=>p.ciLo))-0.1 : 0;
  const spMax = cpts.length ? Math.max(...cpts.map(p=>p.ciHi))+0.1 : 4;
  const spR = Math.max(0.01, spMax-spMin);
  const sy = (v:number) => SP_H - ((v-spMin)/spR)*SP_H;
  const sx = (i:number) => cpts.length<2 ? 0 : (i/(cpts.length-1))*SP_W;

  // Small styled helpers
  const PILL = (label:string, val:string|number, col='#a5b4fc', sub?:string) => (
    <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',
      borderRadius:9,padding:'10px 12px',textAlign:'center',minWidth:0}}>
      <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:3}}>{label}</div>
      <div style={{fontSize:20,fontWeight:900,fontFamily:'monospace',color:col,lineHeight:1}}>{val}</div>
      {sub&&<div style={{fontSize:9,color:'#4b5563',marginTop:3}}>{sub}</div>}
    </div>
  );
  const BADGE = (t:string) => (
    <span style={{background:TC_COLORS[t]||'#555',color:'#fff',borderRadius:3,padding:'1px 5px',fontSize:9,fontWeight:700}}>{t}</span>
  );
  const TABL = (id:typeof activeTab, label:string) => (
    <button onClick={()=>setTab(id)}
      style={{padding:'6px 12px',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',
        color:activeTab===id?'#e4e6ef':'#4b5563',fontSize:11,fontWeight:activeTab===id?700:400,
        borderBottom:activeTab===id?'2px solid #6366f1':'2px solid transparent'}}>
      {label}
    </button>
  );

  const histKeys   = R ? Object.keys(R.histogram).map(Number).sort((a,b)=>a-b) : [];
  const maxHistCnt = R ? Math.max(...Object.values(R.histogram)) : 1;

  return (
    <div style={{border:'1px solid rgba(99,102,241,0.35)',borderRadius:12,overflow:'hidden',background:'rgba(10,11,24,0.4)'}}>

      {/* ── Header toggle ── */}
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:'100%',padding:'12px 16px',background:'rgba(99,102,241,0.08)',border:'none',
          cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:'inherit'}}>
        <span style={{fontSize:11,fontWeight:800,color:'#a5b4fc',textTransform:'uppercase',letterSpacing:'0.09em',display:'flex',alignItems:'center',gap:8}}>
          🎲 Monte-Carlo Battle Simulation
          {R&&<span style={{fontSize:11,fontWeight:600,textTransform:'none',
            color:R.pWin>=0.8?'#4ade80':R.pWin>=0.5?'#fb923c':'#f87171'}}>
            · {(R.pWin*100).toFixed(0)}% win · {R.mean.toFixed(2)}±{R.se.toFixed(3)} atk
          </span>}
        </span>
        <span style={{color:'#374151'}}>{open?'▲':'▼'}</span>
      </button>

      {open&&(
        <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>

          {/* ── Options row 1 ── */}
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div>
              <label style={LBL}>Max Trials</label>
              <div style={{display:'flex',gap:3}}>
                {[1000,2000,5000,10000].map(n=>(
                  <button key={n} onClick={()=>setMaxTrials(n)}
                    style={{padding:'4px 9px',borderRadius:5,border:'1px solid rgba(255,255,255,0.09)',
                      background:maxTrials===n?'rgba(99,102,241,0.3)':'transparent',
                      color:maxTrials===n?'#a5b4fc':'#4b5563',cursor:'pointer',fontSize:11,fontWeight:maxTrials===n?700:400,fontFamily:'inherit'}}>
                    {n>=1000?`${n/1000}k`:n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={LBL}>Target Margin (±attackers)</label>
              <div style={{display:'flex',gap:3}}>
                {[0.10,0.05,0.02].map(m=>(
                  <button key={m} onClick={()=>setMargin(m)}
                    style={{padding:'4px 9px',borderRadius:5,border:'1px solid rgba(255,255,255,0.09)',
                      background:margin===m?'rgba(99,102,241,0.3)':'transparent',
                      color:margin===m?'#a5b4fc':'#4b5563',cursor:'pointer',fontSize:11,fontWeight:margin===m?700:400,fontFamily:'inherit'}}>
                    ±{m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={LBL}>Boss Move Policy</label>
              <div style={{display:'flex',gap:3}}>
                {(['uniform','bpweighted','maxdmg'] as const).map(p=>(
                  <button key={p} onClick={()=>setPolicy(p)}
                    style={{padding:'4px 9px',borderRadius:5,border:'1px solid rgba(255,255,255,0.09)',
                      background:policy===p?'rgba(99,102,241,0.3)':'transparent',
                      color:policy===p?'#a5b4fc':'#4b5563',cursor:'pointer',fontSize:11,fontWeight:policy===p?700:400,fontFamily:'inherit'}}>
                    {p==='uniform'?'Uniform':p==='bpweighted'?'BP-Weighted':'Max DMG'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Options row 2: variance reduction + seed ── */}
          <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',
            padding:'8px 12px',background:'rgba(0,0,0,0.2)',borderRadius:8,fontSize:11}}>
            <span style={{fontSize:10,fontWeight:700,color:'#374151',textTransform:'uppercase',letterSpacing:'0.06em'}}>Variance reduction:</span>
            {([
              [antithetic, setAV,    'Antithetic Variates'],
              [stratified, setStrat, 'Stratified Sampling'],
              [controlVar, setCV,    'Control Variate'],
            ] as [boolean,(v:boolean)=>void,string][]).map(([val,set,label])=>(
              <label key={label} style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',color:'#9ca3af'}}>
                <input type="checkbox" checked={val} onChange={e=>set(e.target.checked)}/>
                {label}
              </label>
            ))}
            <label style={{display:'flex',alignItems:'center',gap:5,cursor:'pointer',color:'#9ca3af',marginLeft:8}}>
              <input type="checkbox" checked={exactMode} onChange={e=>setExact(e.target.checked)}/>
              Exact Convolution
              <span style={{fontSize:9,color:'#374151'}}>(per-attacker PMF)</span>
            </label>
            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:10,color:'#374151',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em'}}>Seed</span>
              <input value={seedStr} onChange={e=>setSeedStr(e.target.value)} placeholder="random"
                style={{width:72,padding:'3px 6px',background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.08)',
                  borderRadius:5,color:'#9ca3af',fontSize:11,fontFamily:'monospace',outline:'none'}}/>
              <span style={{fontSize:10,color:'#374151'}}>
                Trial logs:
              </span>
              <select value={logCount} onChange={e=>setLogCount(Number(e.target.value))}
                style={{...SEL,width:60,fontSize:11,padding:'3px 5px'}}>
                {[0,3,5,10].map(n=><option key={n} value={n}>{n===0?'off':n}</option>)}
              </select>
            </div>
          </div>

          {/* ── Run button row ── */}
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <button onClick={()=>run()} disabled={running||sdState!=='ready'}
              style={{padding:'8px 26px',background:'linear-gradient(135deg,#4f46e5,#7c3aed)',
                border:'none',borderRadius:7,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,
                opacity:(running||sdState!=='ready')?0.5:1,fontFamily:'inherit'}}>
              {running?'Running…':'▶ Run Simulation'}
            </button>
            {R&&(
              <>
                <button onClick={()=>run(R.seed)}
                  style={{padding:'7px 14px',background:'rgba(99,102,241,0.12)',border:'1px solid rgba(99,102,241,0.3)',
                    borderRadius:7,color:'#818cf8',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
                  🔁 Replay seed {R.seed}
                </button>
                <button onClick={()=>setMaxTrials(10000)}
                  style={{padding:'7px 14px',background:'rgba(251,146,60,0.1)',border:'1px solid rgba(251,146,60,0.3)',
                    borderRadius:7,color:'#fb923c',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
                  Run 10k (accurate)
                </button>
                <button onClick={()=>setSaved(R)}
                  style={{padding:'7px 14px',background:'rgba(74,222,128,0.08)',border:'1px solid rgba(74,222,128,0.2)',
                    borderRadius:7,color:'#4ade80',cursor:'pointer',fontSize:11,fontFamily:'inherit'}}>
                  💾 Save snapshot
                </button>
                {saved&&(
                  <span style={{fontSize:10,color:'#4b5563'}}>
                    Saved: {saved.trials.toLocaleString()} trials · mean {saved.mean.toFixed(2)}
                  </span>
                )}
              </>
            )}
          </div>

          {err&&<div style={{color:'#f87171',fontSize:12,padding:'6px 10px',background:'rgba(248,113,113,0.08)',borderRadius:6}}>{err}</div>}

          {!R&&!running&&(
            <div style={{fontSize:11,color:'#374151',lineHeight:1.65,padding:'10px 12px',background:'rgba(0,0,0,0.18)',borderRadius:8}}>
              <strong style={{color:'#6b7280'}}>How it works:</strong>{' '}
              Runs a pilot of 1 000 trials, estimates variance σ, then computes required N = (1.96σ/margin)² and
              continues in batches until CI width ≤ target or max trials reached.
              {antithetic&&' Antithetic variates pairs each trial with its complement — halves variance at no extra cost.'}
              {stratified&&' Stratified sampling assigns proportional trials per boss move — reduces move-selection variance.'}
              {controlVar&&' Control variate uses a deterministic analytic estimate to cancel correlated error.'}
            </div>
          )}

          {R&&(
            <div style={{display:'flex',flexDirection:'column',gap:12}}>

              {/* ── Summary pills ── */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:6}}>
                {PILL('Win Rate',`${(R.pWin*100).toFixed(1)}%`,R.pWin>=0.8?'#4ade80':R.pWin>=0.5?'#fb923c':'#f87171')}
                {PILL('Mean',R.mean.toFixed(2),'#e4e6ef',`±${R.se.toFixed(3)} SE`)}
                {PILL('Median',R.median.toString(),'#a5b4fc')}
                {PILL('Mode',R.mode.toString(),'#818cf8')}
                {PILL('Std Dev',R.stdDev.toFixed(3),'#9ca3af')}
                {PILL('P90',R.p90>numCounters?`>${numCounters}`:R.p90.toString(),'#fb923c')}
                {PILL('P95',R.p95>numCounters?`>${numCounters}`:R.p95.toString(),'#f87171')}
              </div>

              {/* ── 95% CI strip ── */}
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 13px',
                background:'rgba(0,0,0,0.22)',borderRadius:8,flexWrap:'wrap'}}>
                <span style={{fontSize:10,fontWeight:700,color:'#374151',textTransform:'uppercase',letterSpacing:'0.07em'}}>95% CI</span>
                <span style={{fontFamily:'monospace',fontSize:14,color:'#e4e6ef',fontWeight:700}}>
                  [{R.ci95[0].toFixed(3)},&thinsp;{R.ci95[1].toFixed(3)}]
                </span>
                <span style={{fontSize:11,color:ciColor,fontWeight:700,padding:'2px 8px',
                  background:`${ciColor}18`,borderRadius:5,border:`1px solid ${ciColor}44`}}>
                  {R.metMargin?'✓ Margin met':`Width ${R.ciWidth.toFixed(3)} (target ${(R.options.targetMargin*2).toFixed(3)})`}
                </span>
                <span style={{fontSize:10,color:'#374151',marginLeft:'auto'}}>
                  {R.trials.toLocaleString()} trials · seed {R.seed}
                  {R.options.antithetic&&' · AV'}{R.options.stratified&&' · Strat'}{R.options.controlVar&&' · CV'}
                </span>
                <button onClick={()=>setDiag(d=>!d)}
                  style={{fontSize:10,color:'#4b5563',background:'none',border:'1px solid rgba(255,255,255,0.07)',
                    borderRadius:5,padding:'3px 8px',cursor:'pointer',fontFamily:'inherit'}}>
                  {showDiag?'Hide':'Show'} diagnostics
                </button>
              </div>

              {/* ── Diagnostics panel ── */}
              {showDiag&&(
                <div style={{background:'rgba(0,0,0,0.18)',border:'1px solid rgba(255,255,255,0.05)',
                  borderRadius:9,padding:'13px 15px',display:'flex',flexDirection:'column',gap:10}}>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:7}}>
                    {[
                      ['Pilot Trials',  R.pilotTrials.toLocaleString()],
                      ['Pilot σ',       R.pilotStdDev.toFixed(4)],
                      ['Required N',    R.trialsRequired.toLocaleString()],
                      ['Actual N',      R.trials.toLocaleString()],
                      ['CI Width',      R.ciWidth.toFixed(4)],
                      ['Target Width',  (R.options.targetMargin*2).toFixed(4)],
                      ['Eff. Samples',  R.effectiveSamples.toFixed(0)],
                      ['Ctrl Cov β',    R.controlCov.toFixed(4)],
                    ].map(([l,v])=>(
                      <div key={l} style={{textAlign:'center',padding:'7px 8px',background:'rgba(255,255,255,0.02)',borderRadius:6}}>
                        <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'0.06em',color:'#374151',marginBottom:2}}>{l}</div>
                        <div style={{fontSize:13,fontFamily:'monospace',color:'#9ca3af',fontWeight:700}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{fontSize:10,color:'#374151',lineHeight:1.5}}>
                    P5={R.p5}&nbsp; P25={R.p25}&nbsp; P50={R.median}&nbsp; P75={R.p75}&nbsp; P95={R.p95}
                    &nbsp;·&nbsp; Policy: {R.policy}
                  </div>
                  {/* Convergence sparkline */}
                  {cpts.length>=3&&(
                    <div>
                      <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:'0.06em',color:'#374151',marginBottom:4}}>
                        Running mean convergence + 95% CI band
                      </div>
                      <svg width={SP_W} height={SP_H+12} style={{overflow:'visible'}}>
                        <polygon
                          points={[...cpts.map((p,i)=>`${sx(i)},${sy(p.ciLo)}`),
                            ...[...cpts].reverse().map((p,i)=>`${sx(cpts.length-1-i)},${sy(p.ciHi)}`)].join(' ')}
                          fill="rgba(99,102,241,0.15)"/>
                        <polyline
                          points={cpts.map((p,i)=>`${sx(i)},${sy(p.mean)}`).join(' ')}
                          fill="none" stroke="#818cf8" strokeWidth={1.5}/>
                        {/* Reference line at final mean */}
                        <line x1={0} y1={sy(R.mean)} x2={SP_W} y2={sy(R.mean)}
                          stroke="#4ade80" strokeWidth={0.8} strokeDasharray="3,3"/>
                        <text x={0}   y={SP_H+10} fontSize={8} fill="#374151">{cpts[0].trial}</text>
                        <text x={SP_W} y={SP_H+10} fontSize={8} fill="#374151" textAnchor="end">{cpts[cpts.length-1].trial}</text>
                        <text x={SP_W+4} y={sy(R.mean)+3} fontSize={8} fill="#4ade80">{R.mean.toFixed(2)}</text>
                      </svg>
                    </div>
                  )}
                  {/* Replay specific trial */}
                  {R.options.logTrials>0&&(
                    <div style={{display:'flex',alignItems:'center',gap:8,marginTop:4}}>
                      <span style={{fontSize:10,color:'#4b5563'}}>Replay trial #:</span>
                      <input value={replayIdx} onChange={e=>setReplayIdx(e.target.value)} placeholder="0"
                        style={{width:55,padding:'3px 6px',background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.08)',
                          borderRadius:5,color:'#9ca3af',fontSize:11,fontFamily:'monospace',outline:'none'}}/>
                      <span style={{fontSize:10,color:'#374151'}}>(logged trials: {R.trialLogs.length})</span>
                    </div>
                  )}
                </div>
              )}

              {/* ── Sub-tabs ── */}
              <div style={{display:'flex',gap:0,borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
                {TABL('hist',   '📊 Distribution')}
                {TABL('patk',   'P(≤k) Table')}
                {TABL('moves',  '⚔️ Boss Moves')}
                {TABL('slots',  '🧑‍🤝‍🧑 Per Attacker')}
                {exactMode&&TABL('exact','🔬 Exact PMF')}
                {R.trialLogs.length>0&&TABL('debug','📋 Trial Logs')}
              </div>

              {/* ── Tab: Histogram + CDF ── */}
              {activeTab==='hist'&&(
                <div style={{background:'rgba(0,0,0,0.22)',borderRadius:9,padding:'14px 14px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
                    <span style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.07em'}}>
                      Attackers Needed — {R.trials.toLocaleString()} trials
                    </span>
                    <span style={{fontSize:10,color:'#374151'}}>
                      σ={R.stdDev.toFixed(3)}&nbsp; IQR=[{R.p25},{R.p75}]
                    </span>
                  </div>
                  <div style={{display:'flex',gap:4,alignItems:'flex-end',height:90,position:'relative'}}>
                    {histKeys.map(k=>{
                      const cnt=R.histogram[k]||0; const pct=cnt/R.trials;
                      const barH=Math.max(4,Math.round((cnt/maxHistCnt)*78));
                      const isOver=k>numCounters; const isMed=k===R.median;
                      const colBar = isOver?'rgba(248,113,113,0.5)':k===R.mode?'rgba(129,140,248,0.85)':isMed?'rgba(74,222,128,0.6)':'rgba(99,102,241,0.55)';
                      const cdfV = R.cdf[k]??0;
                      return (
                        <div key={k} title={`${k} atk${k!==1?'s':''}: ${(pct*100).toFixed(1)}% | CDF ${(cdfV*100).toFixed(1)}%`}
                          style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,minWidth:0,cursor:'default'}}>
                          <div style={{fontSize:9,color:'#374151',fontFamily:'monospace'}}>{(pct*100).toFixed(0)}%</div>
                          <div style={{width:'100%',height:barH,background:colBar,borderRadius:'3px 3px 0 0',minHeight:4,transition:'height 0.25s'}}/>
                          {/* CDF bar underneath */}
                          <div style={{width:'100%',height:3,background:`rgba(251,191,36,${cdfV*0.7})`,borderRadius:'0 0 2px 2px'}}/>
                          <div style={{fontSize:10,color:isOver?'#f87171':k===R.mode?'#818cf8':isMed?'#4ade80':'#a5b4fc',fontWeight:700,fontFamily:'monospace'}}>
                            {isOver?`>${numCounters}`:k}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{display:'flex',gap:14,marginTop:8,fontSize:9,color:'#374151',flexWrap:'wrap'}}>
                    <span><span style={{display:'inline-block',width:8,height:8,background:'rgba(99,102,241,0.55)',marginRight:3,borderRadius:1}}/>freq</span>
                    <span><span style={{display:'inline-block',width:8,height:8,background:'rgba(129,140,248,0.85)',marginRight:3,borderRadius:1}}/>mode={R.mode}</span>
                    <span><span style={{display:'inline-block',width:8,height:8,background:'rgba(74,222,128,0.6)',marginRight:3,borderRadius:1}}/>median={R.median}</span>
                    <span><span style={{display:'inline-block',width:8,height:3,background:'rgba(251,191,36,0.7)',marginRight:3}}/>CDF strip</span>
                    <span style={{marginLeft:'auto'}}>Hover bars for exact %</span>
                  </div>
                </div>
              )}

              {/* ── Tab: P(≤k) table with confidence slider ── */}
              {activeTab==='patk'&&(
                <div style={{background:'rgba(0,0,0,0.18)',borderRadius:9,padding:'14px 14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>
                    P(defeat boss with ≤ k attackers)
                  </div>
                  <div style={{fontSize:11,color:'#374151',marginBottom:10}}>
                    Drag slider to choose a confidence level and see required attacker count.
                    {confK&&<span style={{color:'#a5b4fc',fontWeight:700,marginLeft:6}}>
                      {(R.pAtMostK.find(x=>x.k===confK)?.p??0)*100 >=90?'✓':''} ≤{confK} attackers at {((R.pAtMostK.find(x=>x.k===confK)?.p??0)*100).toFixed(1)}%
                    </span>}
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:6}}>
                    {R.pAtMostK.map(({k,p})=>{
                      const col=p>=0.9?'#4ade80':p>=0.7?'#a3e635':p>=0.5?'#fb923c':'#f87171';
                      const isSelected=confK===k;
                      return (
                        <div key={k} onClick={()=>setConfK(isSelected?null:k)}
                          style={{display:'flex',alignItems:'center',gap:7,padding:'7px 9px',cursor:'pointer',
                            background:isSelected?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.02)',
                            borderRadius:6,border:`1px solid ${isSelected?'rgba(99,102,241,0.5)':'rgba(255,255,255,0.05)'}`,
                            transition:'all .15s'}}>
                          <span style={{fontSize:11,color:'#9ca3af',minWidth:20,fontWeight:700}}>≤{k}</span>
                          <div style={{flex:1,height:5,background:'rgba(255,255,255,0.07)',borderRadius:3,overflow:'hidden'}}>
                            <div style={{width:`${p*100}%`,height:'100%',background:col,borderRadius:3}}/>
                          </div>
                          <span style={{fontSize:12,fontFamily:'monospace',color:col,fontWeight:700,minWidth:40,textAlign:'right'}}>{(p*100).toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Tab: Boss move breakdown ── */}
              {activeTab==='moves'&&(
                <div style={{background:'rgba(0,0,0,0.18)',borderRadius:9,padding:'14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>
                    Boss Move Usage & Damage Output (sorted by total dmg)
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                      <thead>
                        <tr style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
                          {['Move','Type','BP','Uses','Avg Dmg','Max Dmg','Share of Dmg'].map(h=>(
                            <th key={h} style={{padding:'5px 8px',textAlign:'center',color:'#374151',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {R.perMove.map((m,i)=>(
                          <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)',
                            background:i===0?'rgba(99,102,241,0.06)':'transparent'}}>
                            <td style={{padding:'6px 8px',fontWeight:700,color:'#e4e6ef'}}>{m.name}</td>
                            <td style={{padding:'6px 8px',textAlign:'center'}}>{BADGE(m.type)}</td>
                            <td style={{padding:'6px 8px',textAlign:'center',fontFamily:'monospace',color:'#9ca3af'}}>{m.bp}</td>
                            <td style={{padding:'6px 8px',textAlign:'center',fontFamily:'monospace',color:'#a5b4fc'}}>{m.uses.toLocaleString()}</td>
                            <td style={{padding:'6px 8px',textAlign:'center',fontFamily:'monospace',color:'#fb923c'}}>{m.avgDmg.toFixed(1)}</td>
                            <td style={{padding:'6px 8px',textAlign:'center',fontFamily:'monospace',color:'#f87171'}}>{m.maxDmg}</td>
                            <td style={{padding:'6px 8px',textAlign:'center',minWidth:90}}>
                              <div style={{display:'flex',alignItems:'center',gap:4}}>
                                <div style={{flex:1,height:5,background:'rgba(255,255,255,0.07)',borderRadius:3,overflow:'hidden'}}>
                                  <div style={{width:`${m.pctDmg*100}%`,height:'100%',background:'#f87171',borderRadius:3}}/>
                                </div>
                                <span style={{fontSize:10,fontFamily:'monospace',color:'#f87171',minWidth:36}}>{(m.pctDmg*100).toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div style={{fontSize:10,color:'#374151',marginTop:8}}>
                    Policy: <strong style={{color:'#6b7280'}}>{R.policy}</strong>
                    {R.policy==='uniform'&&' — each move equally likely each turn'}
                    {R.policy==='bpweighted'&&' — higher BP moves chosen more often'}
                    {R.policy==='maxdmg'&&' — boss prefers highest expected damage moves'}
                  </div>
                </div>
              )}

              {/* ── Tab: Per-attacker survival ── */}
              {activeTab==='slots'&&(
                <div style={{background:'rgba(0,0,0,0.18)',borderRadius:9,padding:'14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>
                    Per-Attacker Combat Statistics
                  </div>
                  <div style={{overflowX:'auto'}}>
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                      <thead>
                        <tr style={{borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
                          {['Attacker','Used','Avg Hits','Boss HP %','Survived','OHKO Risk','Avg Dmg Taken'].map(h=>(
                            <th key={h} style={{padding:'5px 8px',textAlign:'center',color:'#374151',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {R.perSlot.map((s,i)=>{
                          const pctHP=s.pctBossHp*100;
                          return (
                            <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.04)',background:i%2===0?'rgba(255,255,255,0.01)':'transparent'}}>
                              <td style={{padding:'6px 8px',fontWeight:700,color:'#e4e6ef'}}>{s.name}</td>
                              <td style={{padding:'6px 8px',textAlign:'center',fontFamily:'monospace',color:'#9ca3af'}}>{s.used.toLocaleString()}</td>
                              <td style={{padding:'6px 8px',textAlign:'center',fontFamily:'monospace',color:'#4ade80'}}>{s.avgHitsDealt.toFixed(2)}</td>
                              <td style={{padding:'6px 8px',textAlign:'center',minWidth:80}}>
                                <div style={{display:'flex',alignItems:'center',gap:4}}>
                                  <div style={{flex:1,height:5,background:'rgba(255,255,255,0.07)',borderRadius:3,overflow:'hidden'}}>
                                    <div style={{width:`${Math.min(100,pctHP)}%`,height:'100%',background:pctHP>=50?'#f87171':'#4ade80',borderRadius:3}}/>
                                  </div>
                                  <span style={{fontSize:10,fontFamily:'monospace',color:'#9ca3af',minWidth:38}}>{pctHP.toFixed(1)}%</span>
                                </div>
                              </td>
                              <td style={{padding:'6px 8px',textAlign:'center'}}>
                                <span style={{fontSize:11,fontWeight:700,padding:'2px 6px',borderRadius:4,
                                  background:s.survivalPct>=0.5?'rgba(74,222,128,0.1)':'rgba(248,113,113,0.1)',
                                  color:s.survivalPct>=0.5?'#4ade80':'#f87171'}}>
                                  {(s.survivalPct*100).toFixed(0)}%
                                </span>
                              </td>
                              <td style={{padding:'6px 8px',textAlign:'center'}}>
                                <span style={{fontSize:11,fontWeight:700,padding:'2px 6px',borderRadius:4,
                                  background:s.ohkoChance>=0.5?'rgba(248,113,113,0.15)':s.ohkoChance>=0.2?'rgba(251,146,60,0.15)':'rgba(74,222,128,0.1)',
                                  color:s.ohkoChance>=0.5?'#f87171':s.ohkoChance>=0.2?'#fb923c':'#4ade80'}}>
                                  {(s.ohkoChance*100).toFixed(1)}%
                                </span>
                              </td>
                              <td style={{padding:'6px 8px',textAlign:'center',fontFamily:'monospace',color:'#f87171'}}>{s.avgDmgTaken.toFixed(1)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── Tab: Exact convolution PMF ── */}
              {activeTab==='exact'&&(
                <div style={{background:'rgba(0,0,0,0.18)',borderRadius:9,padding:'14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:4}}>
                    Exact Hits-to-KO PMF (discrete convolution, no boss retaliation)
                  </div>
                  <div style={{fontSize:11,color:'#374151',marginBottom:10,lineHeight:1.5}}>
                    These are exact probabilities assuming the attacker hits the boss with no interruption.
                    Useful as a baseline — Monte-Carlo accounts for boss attacks reducing attacker HP.
                  </div>
                  {R.exactKoPmfs.map((pmf,si)=>{
                    const slot=counters[si];
                    const nonZero=pmf.map((p,k)=>({k,p})).filter(x=>x.p>0.001);
                    if (!nonZero.length) return (
                      <div key={si} style={{padding:'8px 10px',color:'#374151',fontSize:11}}>
                        {slot.name||'—'}: immune or no valid move
                      </div>
                    );
                    const maxP=Math.max(...nonZero.map(x=>x.p));
                    return (
                      <div key={si} style={{marginBottom:12}}>
                        <div style={{fontSize:11,fontWeight:700,color:'#a5b4fc',marginBottom:5}}>{slot.name||'—'}</div>
                        <div style={{display:'flex',gap:4,alignItems:'flex-end',height:52}}>
                          {nonZero.map(({k,p})=>{
                            const bH=Math.max(4,Math.round((p/maxP)*46));
                            return (
                              <div key={k} title={`P(KO in ${k} hits) = ${(p*100).toFixed(2)}%`}
                                style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,minWidth:0,maxWidth:40}}>
                                <div style={{fontSize:9,color:'#374151'}}>{(p*100).toFixed(0)}%</div>
                                <div style={{width:'100%',height:bH,background:'rgba(99,102,241,0.6)',borderRadius:'2px 2px 0 0'}}/>
                                <div style={{fontSize:9,color:'#818cf8',fontFamily:'monospace'}}>{k}h</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Tab: Trial debug logs ── */}
              {activeTab==='debug'&&R.trialLogs.length>0&&(
                <div style={{background:'rgba(0,0,0,0.18)',borderRadius:9,padding:'14px'}}>
                  <div style={{fontSize:10,fontWeight:700,color:'#6b7280',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8}}>
                    Trial Logs ({R.trialLogs.length} recorded)
                  </div>
                  {R.trialLogs.map(tl=>(
                    <div key={tl.trialIdx} style={{marginBottom:14,border:'1px solid rgba(255,255,255,0.06)',borderRadius:7,overflow:'hidden'}}>
                      <div style={{padding:'7px 10px',background:'rgba(99,102,241,0.1)',display:'flex',gap:10,alignItems:'center',fontSize:11}}>
                        <span style={{fontWeight:700,color:'#a5b4fc'}}>Trial #{tl.trialIdx}</span>
                        <span style={{color:tl.won?'#4ade80':'#f87171',fontWeight:700}}>{tl.won?'✓ Win':'✗ Loss'}</span>
                        <span style={{color:'#9ca3af'}}>Attackers used: {tl.attackersUsed}</span>
                        <span style={{color:'#374151',fontFamily:'monospace',fontSize:10,marginLeft:'auto'}}>seed:{tl.seed}</span>
                      </div>
                      <div style={{overflowX:'auto',maxHeight:160,overflowY:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:10}}>
                          <thead>
                            <tr style={{background:'rgba(0,0,0,0.2)',position:'sticky',top:0}}>
                              {['Turn','Actor','Move','Dmg','Boss HP remaining'].map(h=>(
                                <th key={h} style={{padding:'4px 8px',textAlign:'left',color:'#374151',fontWeight:700}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {tl.turns.map((t,ti)=>(
                              <tr key={ti} style={{borderBottom:'1px solid rgba(255,255,255,0.03)',background:t.actor==='boss'?'rgba(248,113,113,0.04)':'transparent'}}>
                                <td style={{padding:'3px 8px',fontFamily:'monospace',color:'#374151'}}>{t.turn}</td>
                                <td style={{padding:'3px 8px',color:t.actor==='atk'?'#4ade80':'#f87171',fontWeight:700}}>{t.actor==='atk'?'ATK':'BOSS'}</td>
                                <td style={{padding:'3px 8px',color:'#9ca3af'}}>{t.actor==='boss'?(bossMoves[t.moveIdx]?.name??'—'):'attack'}</td>
                                <td style={{padding:'3px 8px',fontFamily:'monospace',color:'#fb923c',fontWeight:700}}>{t.dmg}</td>
                                <td style={{padding:'3px 8px',fontFamily:'monospace',color:t.remaining<=0?'#4ade80':'#e4e6ef'}}>{Math.max(0,t.remaining)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Counter Calc Tab ──────────────────────────────────────────────────────────
function CounterCalcSection({ sdState }: { sdState:'loading'|'ready'|'error' }) {
  const [boss,setBossRaw]     = useState<BossConfig>(mkBoss);
  const [counters,setCounters]= useState<CounterSlot[]>([mkSlot(),mkSlot()]);
  const [calculated,setCalc]  = useState(false);
  const [globalErr,setGlErr]  = useState('');
  const [sortBy,setSortBy]    = useState<'max'|'min'>('max');
  const [hpOverride,setHpOvr] = useState('');

  const setBoss = (p:Partial<BossConfig>) => { setBossRaw(prev=>({...prev,...p})); setCalc(false); };
  const addSlot = () => setCounters(cs=>[...cs,mkSlot()]);
  const removeSlot = (id:number) => setCounters(cs=>cs.filter(c=>c.id!==id));
  const updateSlot = (id:number,p:Partial<CounterSlot>) => setCounters(cs=>cs.map(c=>c.id===id?{...c,...p}:c));

  const bossHpBase = () => boss.data ? calcStat(boss.data.stats.hp,boss.evs.hp,boss.ivs.hp,true,1,boss.level||100) : 0;
  const raidMult = RAID_TIERS[boss.raidTier]??1;
  const effectiveHp = () => { const ov=parseInt(hpOverride); return (!isNaN(ov)&&ov>0)?ov:Math.round(bossHpBase()*raidMult); };

  const calculateAll = () => {
    if (!boss.data) { setGlErr('Set a valid Boss Pokémon first.'); return; }
    setGlErr('');
    const bossHP = effectiveHp();
    const bossFake:PokeData = {...boss.data,stats:{...boss.data.stats,hp:Math.round(boss.data.stats.hp*raidMult)}};
    const updated = counters.map(slot=>{
      if (!slot.name||!slot.moveName) return {...slot,error:'',result:null};
      const atkData = slot.data||lookupPoke(slot.name);
      const mv = slot.moveData||lookupMove(slot.moveName);
      if (!atkData) return {...slot,error:`"${slot.name}" not found`,result:null};
      if (!mv) return {...slot,error:`Move "${slot.moveName}" not found`,result:null};
      if (!mv.bp) return {...slot,error:`"${slot.moveName}" is a status move`,result:null};
      const res = runCalc({
        atkPoke:atkData, defPoke:bossFake, bp:mv.bp, cat:mv.cat, mtyp:mv.type,
        atkEvs:slot.evs, defEvs:boss.evs, atkIvs:slot.ivs, defIvs:boss.ivs,
        atkNat:slot.nature, defNat:boss.nature, atkTera:slot.teraType, defTera:boss.teraType,
        atkItem:slot.item, atkStatus:'Healthy', weather:boss.weather, doubles:boss.doubles,
        atkScreen:false, defScreen:boss.defScreen, isCrit:slot.isCrit, zmove:slot.zmove,
        atkLv:slot.level||100, defLv:boss.level||100,
      });
      if (res&&!res.immune) {
        const minD=res.minD??0; const maxD=res.maxD??0;
        const minP=bossHP?Math.floor(minD/bossHP*1000)/10:0;
        const maxP=bossHP?Math.floor(maxD/bossHP*1000)/10:0;
        return {...slot,error:'',result:{...res,minD,maxD,defHp:bossHP,minP,maxP,ohko:minP>=100,possibleOhko:maxP>=100,twoHko:minP>=50,hitsToKo:[maxD?Math.ceil(bossHP/maxD):99,minD?Math.ceil(bossHP/minD):99] as [number,number]}};
      }
      return {...slot,error:'',result:res};
    });
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
    <div style={{display:'flex',flexDirection:'column',gap:14}}>
      {/* Boss Config */}
      <div style={{background:'linear-gradient(135deg,rgba(220,38,38,0.07),rgba(124,58,237,0.07))',border:'1px solid rgba(220,38,38,0.22)',borderRadius:12,padding:16}}>
        <div style={{fontSize:11,fontWeight:800,color:'#f87171',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
          <span>👹</span> Boss Configuration
          {boss.data&&<span style={{fontSize:10,color:'#4ade80',fontWeight:600}}>✓ {boss.data.name}</span>}
          {boss.name&&!boss.data&&<span style={{fontSize:10,color:'#f87171'}}>Not found</span>}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <div>
            <AutoInput label="Boss Pokémon" value={boss.name} searchFn={searchPokemon}
              onChange={v=>{const d=lookupPoke(v);setBoss({name:v,data:d});}} placeholder="e.g. Charizard"/>
            {boss.data&&(
              <div style={{display:'flex',gap:4,marginTop:5,flexWrap:'wrap'}}>
                {(boss.teraType?[boss.teraType]:boss.data.types).map(t=><TypeBadge key={t} t={t}/>)}
                {boss.teraType&&<span style={{fontSize:9,color:'#6b7280'}}>← Tera</span>}
              </div>
            )}
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
        <div style={{display:'grid',gridTemplateColumns:'78px 1fr 1fr 1fr',gap:8,marginBottom:10}}>
          <div><label style={LBL}>Level</label><input style={INP} type="number" min={1} max={100} value={boss.level} onChange={e=>setBoss({level:parseInt(e.target.value)||100})}/></div>
          <div><label style={LBL}>Nature</label><select style={SEL} value={boss.nature} onChange={e=>setBoss({nature:e.target.value})}>{Object.keys(NATURES).map(n=><option key={n}>{n}</option>)}</select></div>
          <div><label style={LBL}>Weather</label><select style={SEL} value={boss.weather} onChange={e=>setBoss({weather:e.target.value})}>{WEATHERS.map(w=><option key={w}>{w}</option>)}</select></div>
          <div><label style={LBL}>HP Override</label><input style={INP} type="number" min={1} value={hpOverride} onChange={e=>{setHpOvr(e.target.value);setCalc(false);}} placeholder="auto"/></div>
        </div>
        <div style={{marginBottom:10}}>
          <label style={{...LBL,marginBottom:5}}>Boss EVs</label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            {STAT_ORDER.map(([key,lbl])=>(
              <div key={key} style={{display:'flex',alignItems:'center',gap:3}}>
                <span style={{fontSize:9,color:'#4b5563',fontWeight:700,minWidth:22,textAlign:'right'}}>{lbl}</span>
                <input style={{...NUM,width:38}} type="number" min={0} max={252} value={boss.evs[key]} onChange={e=>setBoss({evs:{...boss.evs,[key]:Math.max(0,Math.min(252,parseInt(e.target.value)||0))}})}/>
              </div>
            ))}
            <span style={{fontSize:9,color:bossEvTotal>510?'#f87171':'#4b5563'}}>({bossEvTotal}/510)</span>
          </div>
        </div>
        <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap'}}>
          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#9ca3af',cursor:'pointer'}}><input type="checkbox" checked={boss.doubles} onChange={e=>setBoss({doubles:e.target.checked})}/> Doubles</label>
          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#9ca3af',cursor:'pointer'}}><input type="checkbox" checked={boss.defScreen} onChange={e=>setBoss({defScreen:e.target.checked})}/> Reflect / Light Screen</label>
          {boss.data&&(
            <span style={{fontSize:11,color:'#6b7280',marginLeft:'auto'}}>
              Base HP: <strong style={{color:'#c4c8e4'}}>{bossHpBase()}</strong>
              {raidMult>1&&<> → Raid HP: <strong style={{color:'#f87171'}}>{Math.round(bossHpBase()*raidMult)}</strong><span style={{color:'#4b5563'}}> (×{raidMult})</span></>}
              {hpOverride&&parseInt(hpOverride)>0&&<> → Override: <strong style={{color:'#fb923c'}}>{hpOverride}</strong></>}
            </span>
          )}
        </div>
      </div>

      {/* Counter list header with Add Counter button */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div style={{fontSize:11,fontWeight:800,color:'#818cf8',textTransform:'uppercase',letterSpacing:'0.09em',display:'flex',alignItems:'center',gap:6}}>
          ⚔️ Counter Pokémon <span style={{color:'#4b5563'}}>({counters.length})</span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {calculated&&counters.some(c=>c.result&&!c.result.immune)&&(
            <div style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#6b7280'}}>
              Sort:
              {(['max','min'] as const).map(s=>(
                <button key={s} onClick={()=>setSortBy(s)} style={{padding:'3px 9px',borderRadius:5,border:'1px solid rgba(255,255,255,0.1)',background:sortBy===s?'rgba(88,101,242,0.28)':'transparent',color:sortBy===s?'#818cf8':'#6b7280',cursor:'pointer',fontSize:11,fontWeight:sortBy===s?700:400}}>
                  {s==='max'?'Max Dmg':'Min Dmg'}
                </button>
              ))}
            </div>
          )}
          <button onClick={addSlot} style={{padding:'5px 14px',background:'rgba(88,101,242,0.14)',border:'1px solid rgba(88,101,242,0.28)',borderRadius:7,color:'#818cf8',cursor:'pointer',fontSize:12,fontWeight:700}}>
            + Add Counter
          </button>
        </div>
      </div>

      {/* Counter rows */}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {displayCounters.map(slot=>{
          const rpos = calculated ? rankedIds.indexOf(slot.id)+1 : null;
          return <CounterRow key={slot.id} slot={slot} onChange={updateSlot} onRemove={removeSlot} rank={rpos&&rpos<=3?rpos:null}/>;
        })}
      </div>

      {globalErr&&(<div style={{background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.25)',borderRadius:7,padding:'9px 14px',color:'#f87171',fontSize:13}}>{globalErr}</div>)}
      <div style={{textAlign:'center'}}>
        <button onClick={calculateAll} disabled={sdState!=='ready'}
          style={{padding:'11px 52px',background:'linear-gradient(135deg,#dc2626,#7c3aed)',border:'none',borderRadius:9,color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,boxShadow:'0 4px 20px rgba(220,38,38,0.3)',letterSpacing:'0.03em',opacity:sdState!=='ready'?0.5:1}}>
          {sdState!=='ready'?'⏳ Loading data…':'👹 Calculate All Counters'}
        </button>
      </div>

      {/* Boss simulation — boss moves vs counters */}
      {calculated && boss.data && <BossSimPanel boss={boss} counters={counters} bossHP={effectiveHp()}/>}

      {/* Monte-Carlo simulation */}
      {calculated && boss.data && (
        <MonteCarloPanel boss={boss} counters={counters} bossHP={effectiveHp()} sdState={sdState}/>
      )}

      {/* Rankings summary */}
      {calculated&&counters.some(c=>c.result&&!c.result.immune&&c.name)&&(
        <div style={{background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.09)',borderRadius:10,padding:14}}>
          <div style={{fontSize:10,fontWeight:800,color:'#5865f2',textTransform:'uppercase',letterSpacing:'0.09em',marginBottom:10}}>
            📊 Rankings vs {boss.data?.name||'Boss'}{raidMult>1?` — Raid HP ×${raidMult}`:''}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {ranked.map(({c},i)=>{
              if (!c.result||c.result.immune||!c.name) return null;
              const r=c.result;
              const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
              const hitStr=r.hitsToKo[0]===r.hitsToKo[1]?`${r.hitsToKo[0]}HKO`:`${r.hitsToKo[0]}–${r.hitsToKo[1]}HKO`;
              return (
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:i===0?'rgba(251,191,36,0.05)':'rgba(255,255,255,0.02)',borderRadius:6,border:'1px solid rgba(255,255,255,0.05)'}}>
                  <span style={{fontSize:14,width:22,textAlign:'center',flexShrink:0}}>{medal||<span style={{fontSize:10,color:'#4b5563'}}>{i+1}</span>}</span>
                  <span style={{fontSize:12,fontWeight:700,color:'#e4e6ef',minWidth:100,flexShrink:0}}>{c.name}</span>
                  {c.moveData&&<TypeBadge t={c.moveData.type}/>}
                  <span style={{fontSize:11,color:'#6b7280',minWidth:80,flexShrink:0}}>{c.moveName}</span>
                  <div style={{flex:1,height:5,background:'rgba(255,255,255,0.07)',borderRadius:3,overflow:'hidden',position:'relative',minWidth:60}}>
                    <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,r.minP)}%`,background:r.maxP>=100?'#f87171':r.maxP>=50?'#fb923c':'#5865f2',opacity:0.4,borderRadius:3}}/>
                    <div style={{position:'absolute',left:`${Math.min(100,r.minP)}%`,top:0,bottom:0,width:`${Math.max(0,Math.min(100,r.maxP)-Math.min(100,r.minP))}%`,background:r.maxP>=100?'#f87171':r.maxP>=50?'#fb923c':'#5865f2',borderRadius:3}}/>
                  </div>
                  <span style={{fontSize:12,fontWeight:800,color:'#fff',fontFamily:'monospace',minWidth:105,textAlign:'right',flexShrink:0}}>{r.minP.toFixed(1)}%–{r.maxP.toFixed(1)}%</span>
                  <span style={{fontSize:11,fontWeight:700,minWidth:65,textAlign:'right',flexShrink:0,color:r.ohko||r.possibleOhko?'#f87171':r.twoHko||r.maxP>=50?'#fb923c':'#4ade80'}}>{hitStr}</span>
                </div>
              );
            })}
            {counters.filter(c=>c.result?.immune&&c.name).map(c=>(
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',borderRadius:6,opacity:0.45}}>
                <span style={{fontSize:14,width:22,textAlign:'center'}}>🛡</span>
                <span style={{fontSize:12,color:'#6b7280',minWidth:100}}>{c.name}</span>
                <span style={{fontSize:11,color:'#6b7280'}}>Immune to {c.moveData?.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BossInfoPage({ guildId }: { guildId: string }) {
  const sdState = useShowdownData();
  const [tab,setTab]      = useState<'calc'|'weakness'|'counter'>('calc');
  const [atk,setAtkRaw]   = useState<PanelState>(mkPanel);
  const [def,setDefRaw]   = useState<PanelState>(mkPanel);
  const [field,setField]  = useState({weather:'None',terrain:'None',doubles:false,atkScreen:false,defScreen:false});
  const [result,setResult]= useState<any>(null);
  const [calcErr,setErr]  = useState('');
  const [running,setRun]  = useState(false);

  const setAtk=(p:Partial<PanelState>)=>{setAtkRaw(prev=>({...prev,...p}));setResult(null);setErr('');};
  const setDef=(p:Partial<PanelState>)=>{setDefRaw(prev=>({...prev,...p}));setResult(null);setErr('');};

  const calculate = () => {
    if (!atk.name || !def.name || !atk.moveName) {
      setErr('Enter Pokémon for both sides and a move.'); return;
    }
    const atkData = atk.data || lookupPoke(atk.name);
    const defData = def.data || lookupPoke(def.name);
    const mv      = atk.moveData || lookupMove(atk.moveName);

    if (!atkData) { setErr(`"${atk.name}" not found. Check spelling.`); return; }
    if (!defData) { setErr(`"${def.name}" not found. Check spelling.`); return; }
    if (!mv)      { setErr(`Move "${atk.moveName}" not found.`); return; }
    if (!mv.bp)   { setErr(`"${atk.moveName}" is a status move (0 base power).`); return; }

    setErr(''); setRun(true); setResult(null);

    const res = runCalc({
      atkPoke:atkData, defPoke:defData,
      bp:mv.bp, cat:mv.cat, mtyp:mv.type,
      atkEvs:atk.evs, defEvs:def.evs, atkIvs:atk.ivs, defIvs:def.ivs,
      atkNat:atk.nature, defNat:def.nature,
      atkTera:atk.teraType, defTera:def.teraType,
      atkItem:atk.item, atkStatus:atk.status,
      weather:field.weather, doubles:field.doubles,
      atkScreen:field.atkScreen, defScreen:field.defScreen,
      isCrit:atk.isCrit, zmove:atk.zmove,
      atkLv:atk.level, defLv:def.level,
    });

    setResult(res);
    setRun(false);
  };

  const TABS = [
    {id:'calc',    label:'⚔️ Damage Calculator'},
    {id:'weakness',label:'🛡️ Weakness Lookup'},
    {id:'counter', label:'👹 Counter Calculator'},
  ];

  return (
    <div className="animate-fade" style={{maxWidth:960}}>

      {/* Data loading banner */}
      {sdState==='loading' && (
        <div style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:8,padding:'9px 14px',marginBottom:14,fontSize:12,color:'#818cf8',display:'flex',alignItems:'center',gap:8}}>
          <span style={{width:12,height:12,border:'2px solid #818cf8',borderTopColor:'transparent',borderRadius:'50%',display:'inline-block',animation:'spin 0.8s linear infinite',flexShrink:0}}/>
          Loading Pokémon data from Showdown CDN… (once only, then cached)
        </div>
      )}
      {sdState==='error' && (
        <div style={{background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.3)',borderRadius:8,padding:'9px 14px',marginBottom:14,fontSize:12,color:'#fbbf24',display:'flex',alignItems:'center',gap:8}}>
          ⚠️ Could not load Pokémon data from Showdown CDN. Check your internet connection and refresh.
        </div>
      )}
      {sdState==='ready' && (
        <div style={{background:'rgba(74,222,128,0.06)',border:'1px solid rgba(74,222,128,0.18)',borderRadius:8,padding:'7px 14px',marginBottom:14,fontSize:11,color:'#4ade80',display:'flex',alignItems:'center',gap:8}}>
          ✓ Pokémon Showdown data ready — all calculations run locally
        </div>
      )}

      {/* Tabs */}
      <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)}
            style={{padding:'8px 20px',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',
              color:tab===t.id?'#e4e6ef':'#6b7280',fontSize:13,fontWeight:tab===t.id?700:400,
              borderBottom:tab===t.id?'2px solid #5865f2':'2px solid transparent',transition:'all 0.15s'}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='weakness' && <WeaknessSection guildId={guildId}/>}

      {tab==='counter' && (
        sdState!=='ready'
          ? <div style={{color:'#6b7280',fontSize:13,textAlign:'center',padding:40}}>⏳ Waiting for Pokémon data…</div>
          : <CounterCalcSection sdState={sdState}/>
      )}

      {tab==='calc' && (
        <div>
          {/* Field conditions */}
          <div style={{background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:9,padding:'10px 14px',marginBottom:14}}>
            <div style={{fontSize:9,fontWeight:800,color:'#5865f2',textTransform:'uppercase',letterSpacing:'0.09em',marginBottom:8}}>Field Conditions</div>
            <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center',fontSize:11,color:'#9ca3af'}}>
              <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
                <input type="checkbox" checked={field.doubles} onChange={e=>setField(f=>({...f,doubles:e.target.checked}))}/> Doubles
              </label>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:9,fontWeight:700,color:'#4b5563',textTransform:'uppercase'}}>Weather</span>
                <select style={{...SEL,width:'auto',minWidth:120}} value={field.weather} onChange={e=>setField(f=>({...f,weather:e.target.value}))}>
                  {WEATHERS.map(w=><option key={w}>{w}</option>)}
                </select>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:9,fontWeight:700,color:'#4b5563',textTransform:'uppercase'}}>Terrain</span>
                <select style={{...SEL,width:'auto',minWidth:120}} value={field.terrain} onChange={e=>setField(f=>({...f,terrain:e.target.value}))}>
                  {TERRAINS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
                <input type="checkbox" checked={field.atkScreen} onChange={e=>setField(f=>({...f,atkScreen:e.target.checked}))}/> Atk Screen
              </label>
              <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
                <input type="checkbox" checked={field.defScreen} onChange={e=>setField(f=>({...f,defScreen:e.target.checked}))}/> Def Screen
              </label>
            </div>
          </div>

          {/* Pokémon panels */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
            <PokemonPanel panel={atk} onChange={setAtk} side="left"/>
            <PokemonPanel panel={def} onChange={setDef} side="right"/>
          </div>

          {/* Calculate */}
          <div style={{textAlign:'center',marginBottom:14}}>
            <button onClick={calculate} disabled={running||sdState!=='ready'}
              style={{padding:'11px 44px',background:'linear-gradient(135deg,#5865f2,#7c3aed)',border:'none',borderRadius:9,color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,boxShadow:'0 4px 16px rgba(88,101,242,0.4)',transition:'all 0.15s',opacity:(running||sdState!=='ready')?0.5:1,letterSpacing:'0.03em'}}>
              {sdState!=='ready'?'⏳ Loading data…':running?'Calculating…':'⚡ Calculate Damage'}
            </button>
          </div>

          {calcErr && (
            <div style={{background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.25)',borderRadius:7,padding:'9px 14px',color:'#f87171',fontSize:13,marginBottom:12}}>
              {calcErr}
            </div>
          )}

          <DamageResult result={result} atk={atk} def={def}/>
        </div>
      )}
    </div>
  );
}

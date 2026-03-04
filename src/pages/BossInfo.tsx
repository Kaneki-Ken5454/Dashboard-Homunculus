import { useState, useEffect, useRef } from 'react';

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

  // Try localStorage first (instant)
  _dex = _readCache('pokedex');
  _mvs = _readCache('moves');

  // Fetch missing from CDN in parallel
  const jobs: Promise<void>[] = [];
  if (!_dex) jobs.push(
    fetch(`${CDN}/pokedex.json`).then(r=>r.json()).then(d=>{ _dex=d; _writeCache('pokedex',d); })
    .catch(()=>{ _dex={}; })
  );
  if (!_mvs) jobs.push(
    fetch(`${CDN}/moves.json`).then(r=>r.json()).then(d=>{ _mvs=d; _writeCache('moves',d); })
    .catch(()=>{ _mvs={}; })
  );
  await Promise.all(jobs);

  _sdLoading = false;
  const ok = Object.keys(_dex||{}).length > 0 && Object.keys(_mvs||{}).length > 0;
  _waiters.forEach(fn=>fn(ok));
  _waiters = [];
  return ok;
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
function WeaknessSection() {
  const [poke,setPoke]    = useState('');
  const [tera,setTera]    = useState('');
  const [data,setData]    = useState<PokeData|null>(null);
  const [err,setErr]      = useState('');

  const onPokeChange = (v:string) => {
    setPoke(v);
    const p = lookupPoke(v);
    setData(p);
    setErr(v && !p ? `"${v}" not found` : '');
  };

  // Compute weakness chart (live, instant)
  const types  = tera ? [tera] : (data?.types||[]);
  const chart  = data ? weaknessChart(types, data.abilities[0]||'') : null;
  const sections = [
    {k:'quad',   label:'4× Weak',    color:'#f87171'},
    {k:'double', label:'2× Weak',    color:'#fb923c'},
    {k:'half',   label:'½× Resists', color:'#4ade80'},
    {k:'quarter',label:'¼× Resists', color:'#34d399'},
    {k:'immune', label:'Immune',     color:'#6b7280'},
  ];

  return (
    <div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14,alignItems:'flex-end'}}>
        <div style={{flex:1,minWidth:140}}>
          <AutoInput label="Pokémon" value={poke} searchFn={searchPokemon} onChange={onPokeChange} placeholder="e.g. Garchomp"/>
        </div>
        <div style={{minWidth:120}}>
          <label style={LBL}>Tera Type</label>
          <select style={SEL} value={tera} onChange={e=>setTera(e.target.value)}>
            <option value="">None</option>
            {ALL_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {err && <div style={{color:'#f87171',fontSize:12,marginBottom:8}}>{err}</div>}
      {data && chart && (
        <div>
          <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
            <span style={{fontSize:16,fontWeight:700,color:'#e4e6ef'}}>{data.name}</span>
            {data.types.map(t=><TypeBadge key={t} t={t}/>)}
            {tera&&<><span style={{fontSize:10,color:'#6b7280'}}>Tera:</span><TypeBadge t={tera}/></>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {sections.map(s=>{
              const lst:string[] = chart[s.k]||[];
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
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BossInfoPage({ guildId }: { guildId: string }) {
  const sdState = useShowdownData();
  const [tab,setTab]      = useState<'calc'|'weakness'>('calc');
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

  const TABS = [{id:'calc',label:'⚔️ Damage Calculator'},{id:'weakness',label:'🛡️ Weakness Lookup'}];

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

      {tab==='weakness' && <WeaknessSection/>}

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

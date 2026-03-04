import { useState, useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PokeStat { hp:number; atk:number; def:number; spa:number; spd:number; spe:number }
interface PokeData  { name:string; types:string[]; stats:PokeStat; bst:number; abilities:string[]; weaknesses:Record<string,string[]> }
interface MoveData  { name:string; bp:number; cat:string; type:string }

// ── Gen 9 type chart ──────────────────────────────────────────────────────────
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
const TC_COLORS: Record<string,string> = {
  Fire:'#FF4422',Water:'#3399FF',Grass:'#33CC44',Electric:'#FFCC00',Ice:'#66CCFF',
  Fighting:'#CC3300',Poison:'#993399',Ground:'#CCAA55',Flying:'#88AAFF',Psychic:'#FF5599',
  Bug:'#AABB22',Rock:'#BBAA66',Ghost:'#664477',Dragon:'#7744FF',Dark:'#554433',
  Steel:'#AAAABB',Fairy:'#FFAACC',Normal:'#AAAA88',
};

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

// ── Showdown CDN loader (scoped to this file) ─────────────────────────────────
const BC_CDN = 'https://play.pokemonshowdown.com/data';
const BC_TTL = 24 * 60 * 60 * 1000;
let bc_dex: Record<string,any> | null = null;
let bc_mvs: Record<string,any> | null = null;
let bc_loading = false;
let bc_waiters: Array<(ok:boolean)=>void> = [];

function bc_readCache(key:string): Record<string,any>|null {
  try {
    const raw = localStorage.getItem(`bc_${key}`);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now()-ts > BC_TTL) { localStorage.removeItem(`bc_${key}`); return null; }
    return data;
  } catch { return null; }
}
function bc_writeCache(key:string, data:Record<string,any>) {
  try { localStorage.setItem(`bc_${key}`, JSON.stringify({ ts:Date.now(), data })); } catch {}
}

async function bc_loadData(): Promise<boolean> {
  if (bc_dex && bc_mvs) return true;
  if (bc_loading) return new Promise(r => bc_waiters.push(r));
  bc_loading = true;
  bc_dex = bc_readCache('pokedex');
  bc_mvs = bc_readCache('moves');
  const jobs: Promise<void>[] = [];
  if (!bc_dex) jobs.push(fetch(`${BC_CDN}/pokedex.json`).then(r=>r.json()).then(d=>{ bc_dex=d; bc_writeCache('pokedex',d); }).catch(()=>{ bc_dex={}; }));
  if (!bc_mvs) jobs.push(fetch(`${BC_CDN}/moves.json`).then(r=>r.json()).then(d=>{ bc_mvs=d; bc_writeCache('moves',d); }).catch(()=>{ bc_mvs={}; }));
  await Promise.all(jobs);
  bc_loading = false;
  const ok = Object.keys(bc_dex||{}).length > 0 && Object.keys(bc_mvs||{}).length > 0;
  bc_waiters.forEach(fn=>fn(ok)); bc_waiters = [];
  return ok;
}

function bc_searchPoke(q:string, limit=25): string[] {
  if (!q || !bc_dex) return [];
  const k=_key(q); const r:string[]=[];
  for (const [key,val] of Object.entries(bc_dex)) {
    if (key.includes(k) || _key(val.name||'').includes(k)) { r.push(val.name||key); if (r.length>=limit) break; }
  }
  return r;
}
function bc_searchMove(q:string, limit=25): string[] {
  if (!q || !bc_mvs) return [];
  const k=_key(q); const r:string[]=[];
  for (const [key,val] of Object.entries(bc_mvs)) {
    const mv=val as any; if (!mv.basePower) continue;
    if (key.includes(k) || _key(mv.name||'').includes(k)) { r.push(mv.name||key); if (r.length>=limit) break; }
  }
  return r;
}
function bc_lookupPoke(name:string): PokeData|null {
  if (!bc_dex) return null;
  const e=bc_dex[_key(name)]; if (!e) return null;
  const s=e.baseStats||{}; const abilities=Object.values(e.abilities||{}) as string[]; const types=e.types||[];
  return { name:e.name||name, types, stats:{hp:s.hp||0,atk:s.atk||0,def:s.def||0,spa:s.spa||0,spd:s.spd||0,spe:s.spe||0}, bst:Object.values(s as Record<string,number>).reduce((a,b)=>a+b,0), abilities, weaknesses:weaknessChart(types,abilities[0]||'') };
}
function bc_lookupMove(name:string): MoveData|null {
  if (!bc_mvs) return null;
  const e=bc_mvs[_key(name)] as any; if (!e) return null;
  return { name:e.name||name, bp:e.basePower||0, cat:e.category||'Physical', type:e.type||'Normal' };
}

function useBcData() {
  const [state, setState] = useState<'loading'|'ready'|'error'>((bc_dex&&bc_mvs)?'ready':'loading');
  useEffect(()=>{ if(bc_dex&&bc_mvs){setState('ready');return;} bc_loadData().then(ok=>setState(ok?'ready':'error')); },[]);
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

const ITEMS = ['(none)','Life Orb','Choice Band','Choice Specs','Choice Scarf','Expert Belt','Muscle Band','Wise Glasses','Assault Vest','Eviolite','Black Belt','Charcoal','Mystic Water','Miracle Seed','Magnet','Never-Melt Ice','Poison Barb','Soft Sand','Hard Stone','Sharp Beak','TwistedSpoon','Spell Tag','Dragon Fang','Black Glasses','Metal Coat','Silk Scarf','Silver Powder','Rocky Helmet','Leftovers'];
const ITEM_BOOST: Record<string,string> = { 'Charcoal':'Fire','Mystic Water':'Water','Miracle Seed':'Grass','Magnet':'Electric','Never-Melt Ice':'Ice','Black Belt':'Fighting','Poison Barb':'Poison','Soft Sand':'Ground','Sharp Beak':'Flying','TwistedSpoon':'Psychic','Silver Powder':'Bug','Hard Stone':'Rock','Spell Tag':'Ghost','Dragon Fang':'Dragon','Black Glasses':'Dark','Metal Coat':'Steel','Silk Scarf':'Normal' };
const WEATHERS = ['None','Sun','Rain','Sand','Snow','Harsh Sunshine','Heavy Rain'];

const RAID_TIERS: Record<string,number> = {
  'Normal (×1 HP)':1,'3★ Raid (×2 HP)':2,'4★ Raid (×3 HP)':3,
  '5★ Raid (×6.8 HP)':6.8,'6★ Raid (×10 HP)':10,'7★ Raid (×22 HP)':22,
};

// ── UI primitives ─────────────────────────────────────────────────────────────
const INP: React.CSSProperties = {padding:'5px 8px',background:'rgba(0,0,0,0.35)',border:'1px solid rgba(255,255,255,0.13)',borderRadius:6,color:'#dde1f5',fontSize:12,width:'100%',boxSizing:'border-box',outline:'none'};
const NUM: React.CSSProperties = {...INP,width:46,textAlign:'center',padding:'5px 4px'};
const SEL: React.CSSProperties = {...INP,cursor:'pointer'};
const LBL: React.CSSProperties = {display:'block',fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3};
const STAT_ORDER:[keyof PokeStat,string][] = [['hp','HP'],['atk','Atk'],['def','Def'],['spa','SpA'],['spd','SpD'],['spe','Spe']];
const DEFAULT_EVS: PokeStat = {hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
const DEFAULT_IVS: PokeStat = {hp:31,atk:31,def:31,spa:31,spd:31,spe:31};

function TypeBadge({t}:{t:string}) {
  return <span style={{background:TC_COLORS[t]||'#555',color:'#fff',borderRadius:4,padding:'1px 7px',fontSize:11,fontWeight:700,flexShrink:0}}>{t}</span>;
}

function AutoInput({ label, value, onChange, searchFn, placeholder }:{
  label:string; value:string; onChange:(v:string)=>void; searchFn:(q:string)=>string[]; placeholder?:string;
}) {
  const [opts,setOpts]=useState<string[]>([]); const [show,setShow]=useState(false); const timer=useRef<any>(null);
  const search=(v:string)=>{ onChange(v); clearTimeout(timer.current); if(v.length<2){setOpts([]);setShow(false);return;} timer.current=setTimeout(()=>{ const r=searchFn(v); setOpts(r); setShow(r.length>0); },80); };
  return (
    <div style={{position:'relative'}}>
      {label&&<label style={LBL}>{label}</label>}
      <input style={INP} value={value} onChange={e=>search(e.target.value)} onBlur={()=>setTimeout(()=>setShow(false),140)} onFocus={()=>opts.length>0&&setShow(true)} placeholder={placeholder}/>
      {show&&opts.length>0&&(
        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#181a28',border:'1px solid rgba(255,255,255,0.14)',borderRadius:7,zIndex:400,maxHeight:170,overflowY:'auto',marginTop:2,boxShadow:'0 8px 32px rgba(0,0,0,0.65)'}}>
          {opts.map(x=>(<div key={x} onMouseDown={()=>{onChange(x);setShow(false);setOpts([]);}} style={{padding:'6px 12px',cursor:'pointer',fontSize:12,color:'#d4d8f0'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(88,101,242,0.22)'} onMouseLeave={e=>e.currentTarget.style.background=''}>{x}</div>))}
        </div>
      )}
    </div>
  );
}

// ── Stat + damage formulas ────────────────────────────────────────────────────
function calcStat(base:number,ev=0,iv=31,isHp=false,nature=1,lv=100):number {
  if (!base) return 0;
  if (isHp) return Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+lv+10;
  return Math.floor((Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+5)*nature);
}

interface CalcOpts {
  atkPoke:PokeData; defPoke:PokeData; bp:number; cat:string; mtyp:string;
  atkEvs:PokeStat; defEvs:PokeStat; atkIvs:PokeStat; defIvs:PokeStat;
  atkNat:string; defNat:string; atkTera:string; defTera:string;
  atkItem:string; weather:string; doubles:boolean; defScreen:boolean;
  isCrit:boolean; zmove:boolean; atkLv:number; defLv:number;
}

function runCalc(o:CalcOpts) {
  const as=o.atkPoke.stats, ds=o.defPoke.stats;
  const atkTypes=o.atkTera?[o.atkTera]:o.atkPoke.types;
  const defTypes=o.defTera?[o.defTera]:o.defPoke.types;
  const bp=o.zmove?_zPower(o.bp):o.bp;
  if (!bp) return null;
  const eff=typeEff(o.mtyp,defTypes);
  if (eff===0) return {immune:true,mtyp:o.mtyp};
  const atkV=o.cat==='Physical'?calcStat(as.atk,o.atkEvs.atk,o.atkIvs.atk,false,getNat(o.atkNat,'atk'),o.atkLv):calcStat(as.spa,o.atkEvs.spa,o.atkIvs.spa,false,getNat(o.atkNat,'spa'),o.atkLv);
  const defV=o.cat==='Physical'?calcStat(ds.def,o.defEvs.def,o.defIvs.def,false,getNat(o.defNat,'def'),o.defLv):calcStat(ds.spd,o.defEvs.spd,o.defIvs.spd,false,getNat(o.defNat,'spd'),o.defLv);
  const defHp=calcStat(ds.hp,o.defEvs.hp,o.defIvs.hp,true,1,o.defLv);
  const base=Math.floor(Math.floor(Math.floor(2*o.atkLv/5+2)*bp*atkV/defV)/50)+2;
  let stab=1;
  if (atkTypes.includes(o.mtyp)) stab=(o.atkTera&&o.atkPoke.types.includes(o.mtyp))?2:1.5;
  let itemMod=1;
  if (o.atkItem==='Life Orb') itemMod=5324/4096;
  else if (o.atkItem==='Choice Band'&&o.cat==='Physical') itemMod=1.5;
  else if (o.atkItem==='Choice Specs'&&o.cat==='Special') itemMod=1.5;
  else if (o.atkItem==='Muscle Band'&&o.cat==='Physical') itemMod=1.1;
  else if (o.atkItem==='Wise Glasses'&&o.cat==='Special') itemMod=1.1;
  else if (ITEM_BOOST[o.atkItem]===o.mtyp) itemMod=1.2;
  const beltMod=(o.atkItem==='Expert Belt'&&eff>1)?1.2:1;
  let wxMod=1;
  const sun=o.weather==='Sun'||o.weather==='Harsh Sunshine';
  const rain=o.weather==='Rain'||o.weather==='Heavy Rain';
  if (sun&&o.mtyp==='Fire') wxMod=1.5; if (sun&&o.mtyp==='Water') wxMod=o.weather==='Harsh Sunshine'?0:0.5;
  if (rain&&o.mtyp==='Water') wxMod=1.5; if (rain&&o.mtyp==='Fire') wxMod=o.weather==='Heavy Rain'?0:0.5;
  const spreadMod=o.doubles?0.75:1;
  const critMod=o.isCrit?1.5:1;
  const screenMod=(o.cat==='Physical'&&o.defScreen)||(o.cat==='Special'&&o.defScreen)?0.5:1;
  const apply=(d:number)=>{ d=Math.floor(d*spreadMod);d=Math.floor(d*wxMod);d=Math.floor(d*critMod); if(stab>1)d=Math.floor(d*stab);d=Math.floor(d*eff);d=Math.floor(d*screenMod);d=Math.floor(d*itemMod);d=Math.floor(d*beltMod);return Math.max(1,d); };
  const rolls=Array.from({length:16},(_,i)=>apply(Math.floor(base*(85+i)/100)));
  const [minD,maxD]=[rolls[0],rolls[15]];
  const minP=defHp?Math.floor(minD/defHp*1000)/10:0;
  const maxP=defHp?Math.floor(maxD/defHp*1000)/10:0;
  return { immune:false,rolls,minD,maxD,minP,maxP,defHp,eff,stab:stab>1,mtyp:o.mtyp,cat:o.cat,
    ohko:minP>=100,twoHko:minP>=50,possibleOhko:maxP>=100,
    hitsToKo:[maxD?Math.ceil(defHp/maxD):99,minD?Math.ceil(defHp/minD):99] as [number,number] };
}

// ── State shapes ──────────────────────────────────────────────────────────────
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

let _bcSlotId=1;
const mkSlot=():CounterSlot=>({id:_bcSlotId++,name:'',data:null,level:100,nature:'Hardy',item:'(none)',evs:{...DEFAULT_EVS},ivs:{...DEFAULT_IVS},teraType:'',moveName:'',moveData:null,zmove:false,isCrit:false,result:null,error:''});
const mkBoss=():BossConfig=>({name:'',data:null,level:100,nature:'Hardy',evs:{...DEFAULT_EVS},ivs:{...DEFAULT_IVS},teraType:'',raidTier:'Normal (×1 HP)',weather:'None',doubles:false,defScreen:false});

// ── Counter Row ───────────────────────────────────────────────────────────────
function CounterRow({ slot, onChange, onRemove, rank }:{
  slot:CounterSlot; onChange:(id:number,p:Partial<CounterSlot>)=>void;
  onRemove:(id:number)=>void; rank:number|null;
}) {
  const r=slot.result;
  const borderColor=!r?'rgba(255,255,255,0.09)':r.immune?'rgba(107,114,128,0.35)':r.ohko||r.possibleOhko?'rgba(248,113,113,0.5)':r.twoHko||r.maxP>=50?'rgba(251,146,60,0.45)':'rgba(74,222,128,0.25)';
  const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':null;
  const upd=(p:Partial<CounterSlot>)=>onChange(slot.id,p);
  const evTotal=Object.values(slot.evs).reduce((a,b)=>a+b,0);
  return (
    <div style={{background:'rgba(255,255,255,0.02)',border:`1px solid ${borderColor}`,borderRadius:10,padding:12,display:'flex',flexDirection:'column',gap:8,transition:'border-color 0.2s'}}>
      {/* top row */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:14,minWidth:22,textAlign:'center',flexShrink:0}}>{medal||<span style={{fontSize:9,color:'#4b5563',fontWeight:700}}>#{slot.id}</span>}</span>
        <div style={{flex:'1 1 130px'}}><AutoInput label="" value={slot.name} searchFn={bc_searchPoke} onChange={v=>{const d=bc_lookupPoke(v);upd({name:v,data:d,result:null,error:''}); }} placeholder="Attacker Pokémon…"/></div>
        <div style={{flex:'1 1 130px'}}><AutoInput label="" value={slot.moveName} searchFn={bc_searchMove} onChange={v=>{const mv=bc_lookupMove(v);upd({moveName:v,moveData:mv,result:null,error:''}); }} placeholder="Move…"/></div>
        <div style={{minWidth:108}}><select style={{...SEL,fontSize:11}} value={slot.item} onChange={e=>upd({item:e.target.value,result:null})}>{ITEMS.map(i=><option key={i}>{i}</option>)}</select></div>
        <div style={{minWidth:96}}><select style={{...SEL,fontSize:11}} value={slot.nature} onChange={e=>upd({nature:e.target.value,result:null})}>{Object.keys(NATURES).map(n=><option key={n} value={n}>{n}</option>)}</select></div>
        <div style={{minWidth:88}}><select style={{...SEL,fontSize:11}} value={slot.teraType} onChange={e=>upd({teraType:e.target.value,result:null})}><option value="">No Tera</option>{ALL_TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
        <label style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'#9ca3af',cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={slot.isCrit} onChange={e=>upd({isCrit:e.target.checked,result:null})}/> Crit</label>
        <label style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'#9ca3af',cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={slot.zmove} onChange={e=>upd({zmove:e.target.checked,result:null})}/> Z</label>
        <button onClick={()=>onRemove(slot.id)} style={{background:'rgba(248,113,113,0.12)',border:'1px solid rgba(248,113,113,0.25)',color:'#f87171',borderRadius:5,padding:'3px 8px',cursor:'pointer',fontSize:11,fontWeight:700}}>✕</button>
      </div>
      {/* EVs */}
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
      {/* move badge */}
      {slot.moveData&&(
        <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
          <TypeBadge t={slot.moveData.type}/>
          <span style={{fontSize:10,color:'#6b7280'}}>{slot.moveData.cat}</span>
          <span style={{fontSize:10,color:'#6b7280'}}>BP {slot.moveData.bp}{slot.zmove?` → Z:${_zPower(slot.moveData.bp)}`:''}</span>
          {slot.teraType&&<><span style={{fontSize:9,color:'#6b7280'}}>Tera:</span><TypeBadge t={slot.teraType}/></>}
        </div>
      )}
      {/* error */}
      {slot.error&&(<div style={{fontSize:11,color:'#f87171',background:'rgba(248,113,113,0.08)',borderRadius:5,padding:'4px 8px'}}>{slot.error}</div>)}
      {/* result */}
      {r&&!r.immune&&(
        <div>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
            <span style={{fontSize:14,fontWeight:800,color:'#fff',fontFamily:'monospace'}}>{r.minP.toFixed(1)}%–{r.maxP.toFixed(1)}%</span>
            <span style={{fontSize:12,fontWeight:700,color:r.ohko||r.possibleOhko?'#f87171':r.twoHko||r.maxP>=50?'#fb923c':'#4ade80'}}>
              {r.ohko?'OHKO':r.possibleOhko?'Poss. OHKO':r.twoHko?'2HKO':r.maxP>=50?'Poss. 2HKO':`${r.hitsToKo[0]}HKO`}
            </span>
          </div>
          <div style={{height:7,background:'rgba(255,255,255,0.07)',borderRadius:4,overflow:'hidden',position:'relative',marginBottom:3}}>
            <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,r.minP)}%`,background:r.maxP>=100?'#f87171':r.maxP>=50?'#fb923c':'#5865f2',opacity:0.4,borderRadius:4}}/>
            <div style={{position:'absolute',left:`${Math.min(100,r.minP)}%`,top:0,bottom:0,width:`${Math.max(0,Math.min(100,r.maxP)-Math.min(100,r.minP))}%`,background:r.maxP>=100?'#f87171':r.maxP>=50?'#fb923c':'#5865f2',borderRadius:4}}/>
          </div>
          <div style={{fontSize:10,color:'#4b5563'}}>
                                {r.minD ?? 0}–{r.maxD ?? 0} dmg / {r.defHp ?? 0} HP
            {r.eff!==1&&<span style={{marginLeft:6,color:r.eff>1?'#fb923c':'#4ade80'}}>{r.eff}×</span>}
            {r.stab&&<span style={{marginLeft:6,color:'#818cf8'}}>STAB</span>}
            <span style={{marginLeft:8,color:'#374151'}}>{r.hitsToKo[0]===r.hitsToKo[1]?`${r.hitsToKo[0]} hit${r.hitsToKo[0]>1?'s':''} to KO`:`${r.hitsToKo[0]}–${r.hitsToKo[1]} hits to KO`}</span>
          </div>
        </div>
      )}
      {r?.immune&&<div style={{fontSize:11,color:'#6b7280',fontStyle:'italic'}}>🛡 Immune to {slot.moveData?.type} moves</div>}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function BossCounter({ guildId }: { guildId?: string }) {
  const sdState = useBcData();
  const [boss,setBossRaw] = useState<BossConfig>(mkBoss);
  const [counters,setCounters] = useState<CounterSlot[]>([mkSlot(),mkSlot()]);
  const [calculated,setCalculated] = useState(false);
  const [globalErr,setGlobalErr] = useState('');
  const [sortBy,setSortBy] = useState<'max'|'min'>('max');
  const [hpOverride,setHpOverride] = useState('');

  const setBoss=(p:Partial<BossConfig>)=>{ setBossRaw(prev=>({...prev,...p})); setCalculated(false); };
  const addSlot=()=>setCounters(cs=>[...cs,mkSlot()]);
  const removeSlot=(id:number)=>setCounters(cs=>cs.filter(c=>c.id!==id));
  const updateSlot=(id:number,p:Partial<CounterSlot>)=>setCounters(cs=>cs.map(c=>c.id===id?{...c,...p}:c));

  const bossHpBase=()=>boss.data?calcStat(boss.data.stats.hp,boss.evs.hp,boss.ivs.hp,true,1,boss.level||100):0;
  const raidMult=RAID_TIERS[boss.raidTier]??1;
  const effectiveHp=()=>{ const ov=parseInt(hpOverride); return (!isNaN(ov)&&ov>0)?ov:Math.round(bossHpBase()*raidMult); };

  const calculateAll=()=>{
    if (!boss.data){setGlobalErr('Set a valid Boss Pokémon first.');return;}
    setGlobalErr('');
    const bossHP=effectiveHp();
    const bossFake:PokeData={...boss.data,stats:{...boss.data.stats,hp:Math.round(boss.data.stats.hp*raidMult)}};
    const updated=counters.map(slot=>{
      if (!slot.name||!slot.moveName) return {...slot,error:'',result:null};
      const atkData=slot.data||bc_lookupPoke(slot.name);
      const mv=slot.moveData||bc_lookupMove(slot.moveName);
      if (!atkData) return {...slot,error:`"${slot.name}" not found`,result:null};
      if (!mv) return {...slot,error:`Move "${slot.moveName}" not found`,result:null};
      if (!mv.bp) return {...slot,error:`"${slot.moveName}" is a status move`,result:null};
      const res=runCalc({atkPoke:atkData,defPoke:bossFake,bp:mv.bp,cat:mv.cat,mtyp:mv.type,atkEvs:slot.evs,defEvs:boss.evs,atkIvs:slot.ivs,defIvs:boss.ivs,atkNat:slot.nature,defNat:boss.nature,atkTera:slot.teraType,defTera:boss.teraType,atkItem:slot.item,weather:boss.weather,doubles:boss.doubles,defScreen:boss.defScreen,isCrit:slot.isCrit,zmove:slot.zmove,atkLv:slot.level||100,defLv:boss.level||100});
      if (res&&!res.immune){
        const minD = res.minD ?? 0;
        const maxD = res.maxD ?? 0;
        const minP=bossHP?Math.floor(minD/bossHP*1000)/10:0;
        const maxP=bossHP?Math.floor(maxD/bossHP*1000)/10:0;
        return {...slot,error:'',result:{...res,minD,maxD,defHp:bossHP,minP,maxP,ohko:minP>=100,possibleOhko:maxP>=100,twoHko:minP>=50,hitsToKo:[maxD?Math.ceil(bossHP/maxD):99,minD?Math.ceil(bossHP/minD):99] as [number,number]}};
      }
      return {...slot,error:'',result:res};
    });
    setCounters(updated); setCalculated(true);
  };

  const ranked=[...counters].map((c,i)=>({c,i})).sort((a,b)=>{
    const va=a.c.result?.immune?-999:sortBy==='max'?(a.c.result?.maxP??-1):(a.c.result?.minP??-1);
    const vb=b.c.result?.immune?-999:sortBy==='max'?(b.c.result?.maxP??-1):(b.c.result?.minP??-1);
    return vb-va;
  });
  const rankedIds=ranked.filter(x=>x.c.result&&!x.c.result.immune).map(x=>x.c.id);
  const bossEvTotal=Object.values(boss.evs).reduce((a,b)=>a+b,0);
  const displayCounters=calculated?ranked.map(x=>x.c):counters;

  return (
    <div className="animate-fade" style={{maxWidth:960,display:'flex',flexDirection:'column',gap:14}}>

      {/* ── Status banner ─────────────────────────────────────────────────────── */}
      {sdState==='loading'&&(
        <div style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:8,padding:'9px 14px',fontSize:12,color:'#818cf8',display:'flex',alignItems:'center',gap:8}}>
          <span style={{width:12,height:12,border:'2px solid #818cf8',borderTopColor:'transparent',borderRadius:'50%',display:'inline-block',animation:'spin 0.8s linear infinite',flexShrink:0}}/>
          Loading Pokémon data from Showdown CDN… (cached after first load)
        </div>
      )}
      {sdState==='error'&&(
        <div style={{background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.3)',borderRadius:8,padding:'9px 14px',fontSize:12,color:'#fbbf24'}}>
          ⚠️ Could not load Pokémon data. Check your connection and refresh.
        </div>
      )}
      {sdState==='ready'&&(
        <div style={{background:'rgba(74,222,128,0.06)',border:'1px solid rgba(74,222,128,0.18)',borderRadius:8,padding:'7px 14px',fontSize:11,color:'#4ade80'}}>
          ✓ Pokémon Showdown data ready — all calculations run locally
        </div>
      )}

      {sdState!=='ready' ? (
        <div style={{color:'#6b7280',fontSize:13,textAlign:'center',padding:40}}>⏳ Waiting for Pokémon data…</div>
      ) : (
        <>
          {/* ── Boss Config ────────────────────────────────────────────────────── */}
          <div style={{background:'linear-gradient(135deg,rgba(220,38,38,0.07),rgba(124,58,237,0.07))',border:'1px solid rgba(220,38,38,0.22)',borderRadius:12,padding:16}}>
            <div style={{fontSize:11,fontWeight:800,color:'#f87171',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
              <span>👹</span> Boss Configuration
              {boss.data&&<span style={{fontSize:10,color:'#4ade80',fontWeight:600}}>✓ {boss.data.name}</span>}
              {boss.name&&!boss.data&&<span style={{fontSize:10,color:'#f87171'}}>Not found</span>}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
              <div>
                <AutoInput label="Boss Pokémon" value={boss.name} searchFn={bc_searchPoke}
                  onChange={v=>{const d=bc_lookupPoke(v);setBoss({name:v,data:d});}} placeholder="e.g. Charizard"/>
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
              <div><label style={LBL}>HP Override</label><input style={INP} type="number" min={1} value={hpOverride} onChange={e=>{setHpOverride(e.target.value);setCalculated(false);}} placeholder="auto"/></div>
            </div>

            {/* Boss EVs */}
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

          {/* ── Counter list header ────────────────────────────────────────────── */}
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

          {/* ── Counter rows ───────────────────────────────────────────────────── */}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {displayCounters.map(slot=>{
              const rpos=calculated?rankedIds.indexOf(slot.id)+1:null;
              return <CounterRow key={slot.id} slot={slot} onChange={updateSlot} onRemove={removeSlot} rank={rpos&&rpos<=3?rpos:null}/>;
            })}
          </div>

          {/* ── Error + Calculate ──────────────────────────────────────────────── */}
          {globalErr&&(<div style={{background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.25)',borderRadius:7,padding:'9px 14px',color:'#f87171',fontSize:13}}>{globalErr}</div>)}
          <div style={{textAlign:'center'}}>
            <button onClick={calculateAll}
              style={{padding:'11px 52px',background:'linear-gradient(135deg,#dc2626,#7c3aed)',border:'none',borderRadius:9,color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,boxShadow:'0 4px 20px rgba(220,38,38,0.3)',letterSpacing:'0.03em'}}>
              👹 Calculate All Counters
            </button>
          </div>

          {/* ── Rankings summary ───────────────────────────────────────────────── */}
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
        </>
      )}
    </div>
  );
}

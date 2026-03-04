import { useState, useEffect, useRef } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT-SIDE SHOWDOWN DATA (same loader as BossInfo — fetches CDN in browser)
// ─────────────────────────────────────────────────────────────────────────────
const CDN   = 'https://play.pokemonshowdown.com/data';
const TTL   = 24 * 60 * 60 * 1000;
let _dex: Record<string,any>|null = null;
let _mvs: Record<string,any>|null = null;
let _loading = false;
let _waiters: Array<(ok:boolean)=>void> = [];

const _key = (n:string) => (n||'').toLowerCase().replace(/[\s\-'.]/g,'');
const _rd  = (k:string) => { try { const r=localStorage.getItem(`sd_${k}`); if(!r)return null; const{ts,data}=JSON.parse(r); if(Date.now()-ts>TTL){localStorage.removeItem(`sd_${k}`);return null;} return data; } catch{return null;} };
const _wr  = (k:string, d:any) => { try{localStorage.setItem(`sd_${k}`,JSON.stringify({ts:Date.now(),data:d}));}catch{} };

async function loadSD(): Promise<boolean> {
  if (_dex && _mvs) return true;
  if (_loading) return new Promise(r=>_waiters.push(r));
  _loading = true;
  _dex = _rd('pokedex'); _mvs = _rd('moves');
  const jobs:Promise<void>[] = [];
  if (!_dex) jobs.push(fetch(`${CDN}/pokedex.json`).then(r=>r.json()).then(d=>{_dex=d;_wr('pokedex',d);}).catch(()=>{_dex={};}));
  if (!_mvs) jobs.push(fetch(`${CDN}/moves.json`).then(r=>r.json()).then(d=>{_mvs=d;_wr('moves',d);}).catch(()=>{_mvs={};}));
  await Promise.all(jobs);
  _loading = false;
  const ok = Object.keys(_dex||{}).length>0 && Object.keys(_mvs||{}).length>0;
  _waiters.forEach(fn=>fn(ok)); _waiters=[];
  return ok;
}
function useSD() {
  const [state,setState] = useState<'loading'|'ready'|'error'>((_dex&&_mvs)?'ready':'loading');
  useEffect(()=>{ if(_dex&&_mvs){setState('ready');return;} loadSD().then(ok=>setState(ok?'ready':'error')); },[]);
  return state;
}

// ─────────────────────────────────────────────────────────────────────────────
// INLINE TYPE CHART
// ─────────────────────────────────────────────────────────────────────────────
const TC: Record<string,Record<string,number>> = (() => {
  const se: Record<string,string[]> = {Fire:['Grass','Ice','Bug','Steel'],Water:['Fire','Ground','Rock'],Grass:['Water','Ground','Rock'],Electric:['Water','Flying'],Ice:['Grass','Ground','Flying','Dragon'],Fighting:['Normal','Ice','Rock','Dark','Steel'],Poison:['Grass','Fairy'],Ground:['Fire','Electric','Poison','Rock','Steel'],Flying:['Grass','Fighting','Bug'],Psychic:['Fighting','Poison'],Bug:['Grass','Psychic','Dark'],Rock:['Fire','Ice','Flying','Bug'],Ghost:['Psychic','Ghost'],Dragon:['Dragon'],Dark:['Psychic','Ghost'],Steel:['Ice','Rock','Fairy'],Fairy:['Fighting','Dragon','Dark'],Normal:[]};
  const nv: Record<string,string[]> = {Fire:['Fire','Water','Rock','Dragon'],Water:['Water','Grass','Dragon'],Grass:['Fire','Grass','Poison','Flying','Bug','Dragon','Steel'],Electric:['Electric','Grass','Dragon'],Ice:['Water','Ice'],Fighting:['Poison','Bug','Psychic','Flying','Fairy'],Poison:['Poison','Ground','Rock','Ghost'],Ground:['Grass','Bug'],Flying:['Electric','Rock','Steel'],Psychic:['Psychic','Steel'],Bug:['Fire','Fighting','Flying','Ghost','Steel','Fairy'],Rock:['Fighting','Ground','Steel'],Ghost:['Dark'],Dragon:['Steel'],Dark:['Fighting','Dark','Fairy'],Steel:['Fire','Water','Electric','Steel'],Fairy:['Fire','Poison','Steel'],Normal:['Rock','Steel']};
  const im: Record<string,string[]> = {Normal:['Ghost'],Electric:['Ground'],Fighting:['Ghost'],Poison:['Steel'],Ground:['Flying'],Ghost:['Normal','Fighting'],Dragon:['Fairy'],Dark:['Psychic'],Steel:['Poison'],Psychic:[]};
  const all = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
  const tc: Record<string,Record<string,number>> = {};
  for (const dt of all) tc[dt]={};
  for (const at of all) { for(const dt of se[at]||[]) tc[dt][at]=1; for(const dt of nv[at]||[]) tc[dt][at]=2; for(const dt of im[at]||[]) tc[dt][at]=3; }
  return tc;
})();
const _DMG: Record<number,number> = {0:1,1:2,2:0.5,3:0};
const ALL_TYPES = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
const TC_COL: Record<string,string> = {Fire:'#FF4422',Water:'#3399FF',Grass:'#33CC44',Electric:'#FFCC00',Ice:'#66CCFF',Fighting:'#CC3300',Poison:'#993399',Ground:'#CCAA55',Flying:'#88AAFF',Psychic:'#FF5599',Bug:'#AABB22',Rock:'#BBAA66',Ghost:'#664477',Dragon:'#7744FF',Dark:'#554433',Steel:'#AAAABB',Fairy:'#FFAACC',Normal:'#AAAA88'};
const _Z: [number,number][] = [[55,100],[65,120],[75,140],[85,160],[95,175],[100,180],[110,185],[125,190],[9999,195]];
const zPow = (bp:number)=>{ for(const[t,p] of _Z) if(bp<=t) return p; return 195; };

function tEff(atk:string, defs:string[]): number { let m=1; for(const dt of defs) m*=_DMG[TC[dt]?.[atk]??0]??1; return m; }
function wChart(defs:string[], ab='') {
  const out:Record<string,string[]>={quad:[],double:[],half:[],quarter:[],immune:[]};
  const lev=ab.toLowerCase().includes('levitate');
  for(const at of ALL_TYPES){ if(lev&&at==='Ground'){out.immune.push(at);continue;} const m=tEff(at,defs); if(m===0)out.immune.push(at); else if(m===0.25)out.quarter.push(at); else if(m===0.5)out.half.push(at); else if(m===2)out.double.push(at); else if(m===4)out.quad.push(at); }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// NATURES + ITEMS
// ─────────────────────────────────────────────────────────────────────────────
const NATS: Record<string,Partial<Record<string,number>>> = {
  Hardy:{},Docile:{},Serious:{},Bashful:{},Quirky:{},
  Lonely:{atk:1.1,def:0.9},Brave:{atk:1.1,spe:0.9},Adamant:{atk:1.1,spa:0.9},Naughty:{atk:1.1,spd:0.9},
  Bold:{def:1.1,atk:0.9},Relaxed:{def:1.1,spe:0.9},Impish:{def:1.1,spa:0.9},Lax:{def:1.1,spd:0.9},
  Timid:{spe:1.1,atk:0.9},Hasty:{spe:1.1,def:0.9},Jolly:{spe:1.1,spa:0.9},Naive:{spe:1.1,spd:0.9},
  Modest:{spa:1.1,atk:0.9},Mild:{spa:1.1,def:0.9},Quiet:{spa:1.1,spe:0.9},Rash:{spa:1.1,spd:0.9},
  Calm:{spd:1.1,atk:0.9},Gentle:{spd:1.1,def:0.9},Sassy:{spd:1.1,spe:0.9},Careful:{spd:1.1,spa:0.9},
};
const nat = (n:string,s:string)=>(NATS[n] as any)?.[s]??1;
const ITEMS = ['(none)','Life Orb','Choice Band','Choice Specs','Expert Belt','Muscle Band','Wise Glasses','Assault Vest','Charcoal','Mystic Water','Miracle Seed','Magnet','Never-Melt Ice','Black Belt','Poison Barb','Soft Sand','Sharp Beak','TwistedSpoon','Silver Powder','Hard Stone','Spell Tag','Dragon Fang','Black Glasses','Metal Coat','Silk Scarf'];
const ITEM_BOOST:Record<string,string>={Charcoal:'Fire','Mystic Water':'Water','Miracle Seed':'Grass',Magnet:'Electric','Never-Melt Ice':'Ice','Black Belt':'Fighting','Poison Barb':'Poison','Soft Sand':'Ground','Sharp Beak':'Flying',TwistedSpoon:'Psychic','Silver Powder':'Bug','Hard Stone':'Rock','Spell Tag':'Ghost','Dragon Fang':'Dragon','Black Glasses':'Dark','Metal Coat':'Steel','Silk Scarf':'Normal'};

// ─────────────────────────────────────────────────────────────────────────────
// STAT CALC + DAMAGE ENGINE
// ─────────────────────────────────────────────────────────────────────────────
function cStat(base:number,ev=0,iv=31,hp=false,natMod=1,lv=100):number {
  if(!base) return 0;
  if(hp) return Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+lv+10;
  return Math.floor((Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+5)*natMod);
}

interface DmgResult { rolls:number[]; min:number; max:number; avg:number; minP:number; maxP:number; avgP:number; defHp:number; immune:boolean; eff:number; stab:boolean; cat:string; mtype:string; hitsToKo:[number,number]; }

function calcDmg(
  atkBase:{atk:number;spa:number;spe:number}, atkNat:string, atkEvAtk:number, atkEvSpa:number, atkItem:string, atkTypes:string[], atkLv:number,
  defBase:{hp:number;def:number;spd:number}, defNat:string, defEvHp:number, defEvDef:number, defEvSpd:number, defTypes:string[], defLv:number,
  bp:number, cat:string, mtype:string, zmove:boolean, customDefHp?:number
): DmgResult {
  const defHp = customDefHp ?? cStat(defBase.hp, defEvHp, 31, true, 1, defLv);
  const usedBp = zmove ? zPow(bp) : bp;
  const eff = tEff(mtype, defTypes);
  if (eff===0) return { rolls:[], min:0, max:0, avg:0, minP:0, maxP:0, avgP:0, defHp, immune:true, eff:0, stab:false, cat, mtype, hitsToKo:[0,0] };

  const atkV = cat==='Physical'
    ? cStat(atkBase.atk, atkEvAtk, 31, false, nat(atkNat,'atk'), atkLv)
    : cStat(atkBase.spa, atkEvSpa, 31, false, nat(atkNat,'spa'), atkLv);
  const defV = cat==='Physical'
    ? cStat(defBase.def, defEvDef, 31, false, nat(defNat,'def'), defLv)
    : cStat(defBase.spd, defEvSpd, 31, false, nat(defNat,'spd'), defLv);

  const base = Math.floor(Math.floor(Math.floor(2*atkLv/5+2)*usedBp*atkV/defV)/50)+2;
  let stab = atkTypes.includes(mtype) ? 1.5 : 1;

  let itemMod = 1;
  if (atkItem==='Life Orb') itemMod=5324/4096;
  else if (atkItem==='Choice Band' && cat==='Physical') itemMod=1.5;
  else if (atkItem==='Choice Specs' && cat==='Special') itemMod=1.5;
  else if (atkItem==='Muscle Band' && cat==='Physical') itemMod=1.1;
  else if (atkItem==='Wise Glasses' && cat==='Special') itemMod=1.1;
  else if (ITEM_BOOST[atkItem]===mtype) itemMod=1.2;
  const beltMod = (atkItem==='Expert Belt' && eff>1) ? 1.2 : 1;

  const apply=(d:number)=>{
    if(stab>1) d=Math.floor(d*stab);
    d=Math.floor(d*eff); d=Math.floor(d*itemMod); d=Math.floor(d*beltMod);
    return Math.max(1,d);
  };
  const rolls = Array.from({length:16},(_,i)=>apply(Math.floor(base*(85+i)/100)));
  const [min,max] = [rolls[0],rolls[15]];
  const avg = Math.round(rolls.reduce((a,b)=>a+b,0)/16);
  const pct=(v:number)=>defHp?Math.floor(v/defHp*1000)/10:0;
  return {
    rolls, min, max, avg,
    minP:pct(min), maxP:pct(max), avgP:pct(avg),
    defHp, immune:false, eff, stab:stab>1, cat, mtype,
    hitsToKo:[max?Math.ceil(defHp/max):99, min?Math.ceil(defHp/min):99],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LOOKUP HELPERS
// ─────────────────────────────────────────────────────────────────────────────
interface PokeInfo { name:string; types:string[]; atk:number; def:number; spa:number; spd:number; hp:number; spe:number; abilities:string[]; }
interface MvInfo   { name:string; bp:number; cat:string; type:string; }

function getPoke(n:string):PokeInfo|null {
  if(!_dex) return null; const e=_dex[_key(n)]; if(!e) return null;
  const s=e.baseStats||{};
  return { name:e.name||n, types:e.types||[], atk:s.atk||0, def:s.def||0, spa:s.spa||0, spd:s.spd||0, hp:s.hp||0, spe:s.spe||0, abilities:Object.values(e.abilities||{}) as string[] };
}
function getMv(n:string):MvInfo|null {
  if(!_mvs) return null; const e=(_mvs[_key(n)] as any); if(!e||!e.basePower) return null;
  return { name:e.name||n, bp:e.basePower, cat:e.category||'Physical', type:e.type||'Normal' };
}
function srchPoke(q:string,limit=20):string[] {
  if(!q||!_dex) return []; const k=_key(q); const r:string[]=[]; for(const[ky,v] of Object.entries(_dex)){ if(ky.includes(k)||_key((v as any).name||'').includes(k)){r.push((v as any).name||ky); if(r.length>=limit)break;} } return r;
}
function srchMv(q:string,limit=20):string[] {
  if(!q||!_mvs) return []; const k=_key(q); const r:string[]=[]; for(const[ky,v] of Object.entries(_mvs)){ const mv=v as any; if(!mv.basePower)continue; if(ky.includes(k)||_key(mv.name||'').includes(k)){r.push(mv.name||ky); if(r.length>=limit)break;} } return r;
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────
const INP:React.CSSProperties={padding:'5px 8px',background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:6,color:'#dde1f5',fontSize:12,width:'100%',boxSizing:'border-box',outline:'none'};
const SEL:React.CSSProperties={...INP,cursor:'pointer'};
const LBL:React.CSSProperties={display:'block',fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3};
const CARD:React.CSSProperties={background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,padding:14};

// ─────────────────────────────────────────────────────────────────────────────
// AUTOCOMPLETE
// ─────────────────────────────────────────────────────────────────────────────
function AC({label,value,onChange,search,placeholder,compact}:{label?:string;value:string;onChange:(v:string)=>void;search:(q:string)=>string[];placeholder?:string;compact?:boolean}) {
  const [opts,setOpts]=useState<string[]>([]); const [show,setShow]=useState(false); const tmr=useRef<any>(null);
  const onCh=(v:string)=>{ onChange(v); if(tmr.current)clearTimeout(tmr.current); if(v.length<2){setOpts([]);setShow(false);return;} tmr.current=setTimeout(()=>{ const r=search(v); setOpts(r); setShow(r.length>0); },80); };
  return (
    <div style={{position:'relative'}}>
      {label&&<label style={LBL}>{label}</label>}
      <input style={compact?{...INP,padding:'4px 7px'}:INP} value={value} onChange={e=>onCh(e.target.value)} onBlur={()=>setTimeout(()=>setShow(false),140)} onFocus={()=>opts.length>0&&setShow(true)} placeholder={placeholder}/>
      {show&&opts.length>0&&(
        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#181a28',border:'1px solid rgba(255,255,255,0.13)',borderRadius:7,zIndex:500,maxHeight:160,overflowY:'auto',marginTop:2,boxShadow:'0 8px 24px rgba(0,0,0,0.7)'}}>
          {opts.map(x=>(<div key={x} onMouseDown={()=>{onChange(x);setShow(false);setOpts([]);}} style={{padding:'5px 10px',cursor:'pointer',fontSize:12,color:'#d4d8f0'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(88,101,242,0.2)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>{x}</div>))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPE BADGE
// ─────────────────────────────────────────────────────────────────────────────
const TB=({t}:{t:string})=><span style={{background:TC_COL[t]||'#555',color:'#fff',borderRadius:4,padding:'1px 7px',fontSize:10,fontWeight:700,flexShrink:0}}>{t}</span>;

// ─────────────────────────────────────────────────────────────────────────────
// DAMAGE BAR
// ─────────────────────────────────────────────────────────────────────────────
function DmgBar({pct,color='#5865f2'}:{pct:number;color?:string}) {
  const w=Math.min(100,pct);
  return (
    <div style={{height:6,background:'rgba(255,255,255,0.07)',borderRadius:3,overflow:'hidden',flexShrink:0,minWidth:80}}>
      <div style={{width:`${w}%`,height:'100%',background:color,borderRadius:3,transition:'width 0.3s'}}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ATTACKER GROUP TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface AtkGroup {
  id: string;
  pokeName: string; pokeInfo: PokeInfo|null;
  count: number;
  level: number; nature: string;
  atkEv: number; spaEv: number;
  moveName: string; mvInfo: MvInfo|null;
  item: string; zmove: boolean;
  label: string;
}

const mkAtk=():AtkGroup=>({
  id: Math.random().toString(36).slice(2), pokeName:'', pokeInfo:null,
  count:6, level:100, nature:'Adamant', atkEv:252, spaEv:0,
  moveName:'', mvInfo:null, item:'(none)', zmove:false, label:'',
});

// ─────────────────────────────────────────────────────────────────────────────
// ATTACKER GROUP CARD
// ─────────────────────────────────────────────────────────────────────────────
function AtkCard({g,idx,onChange,onRemove,total}:{g:AtkGroup;idx:number;onChange:(p:Partial<AtkGroup>)=>void;onRemove:()=>void;total:number}) {
  const pi=g.pokeInfo; const mv=g.mvInfo;
  const onPoke=(v:string)=>{ const p=getPoke(v); onChange({pokeName:v,pokeInfo:p}); };
  const onMv=(v:string)=>{ const m=getMv(v); onChange({moveName:v,mvInfo:m}); };
  const cat=mv?.cat||'Physical';
  const relevantEv=cat==='Physical'?g.atkEv:g.spaEv;

  return (
    <div style={{...CARD,position:'relative',borderLeft:`3px solid ${['#5865f2','#f59e0b','#10b981','#f43f5e','#8b5cf6','#06b6d4'][idx%6]}`}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
        <span style={{fontSize:10,fontWeight:800,color:'#5865f2',textTransform:'uppercase',letterSpacing:'0.07em'}}>Attacker {idx+1}</span>
        {pi&&<><span style={{fontSize:12,fontWeight:700,color:'#e4e6ef'}}>{pi.name}</span>{pi.types.map(t=><TB key={t} t={t}/>)}</>}
        {total>1&&<button onClick={onRemove} style={{marginLeft:'auto',background:'none',border:'none',color:'#4b5563',cursor:'pointer',fontSize:14,padding:'0 4px'}}>✕</button>}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 60px',gap:8,marginBottom:8}}>
        <AC label="Pokémon" value={g.pokeName} onChange={onPoke} search={srchPoke} placeholder="e.g. Garchomp"/>
        <div>
          <label style={LBL}>Count</label>
          <input style={INP} type="number" min={1} max={999} value={g.count} onChange={e=>onChange({count:Math.max(1,parseInt(e.target.value)||1)})}/>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
        <AC label="Move" value={g.moveName} onChange={onMv} search={srchMv} placeholder="e.g. Earthquake"/>
        <div>
          <label style={LBL}>Item</label>
          <select style={SEL} value={g.item} onChange={e=>onChange({item:e.target.value})}>
            {ITEMS.map(i=><option key={i}>{i}</option>)}
          </select>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'50px 1fr 80px 80px',gap:8,alignItems:'flex-end',marginBottom:8}}>
        <div>
          <label style={LBL}>Lv</label>
          <input style={INP} type="number" min={1} max={100} value={g.level} onChange={e=>onChange({level:parseInt(e.target.value)||100})}/>
        </div>
        <div>
          <label style={LBL}>Nature</label>
          <select style={SEL} value={g.nature} onChange={e=>onChange({nature:e.target.value})}>
            {Object.keys(NATS).map(n=><option key={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Atk EVs</label>
          <input style={INP} type="number" min={0} max={252} value={g.atkEv} onChange={e=>onChange({atkEv:Math.min(252,Math.max(0,parseInt(e.target.value)||0))})}/>
        </div>
        <div>
          <label style={LBL}>SpA EVs</label>
          <input style={INP} type="number" min={0} max={252} value={g.spaEv} onChange={e=>onChange({spaEv:Math.min(252,Math.max(0,parseInt(e.target.value)||0))})}/>
        </div>
      </div>

      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        <div>
          <label style={LBL}>Group Label (optional)</label>
          <input style={{...INP,width:140}} value={g.label} onChange={e=>onChange({label:e.target.value})} placeholder="e.g. 'Normal' or 'IV'"/>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#9ca3af',cursor:'pointer',marginTop:16}}>
          <input type="checkbox" checked={g.zmove} onChange={e=>onChange({zmove:e.target.checked})}/> Z-Move
        </label>
      </div>

      {/* Status indicators */}
      <div style={{display:'flex',gap:10,marginTop:8,flexWrap:'wrap'}}>
        {pi&&<span style={{fontSize:11,color:'#4ade80'}}>✓ {pi.name} loaded</span>}
        {mv&&<span style={{fontSize:11,color:'#818cf8'}}>Move: {mv.name} ({mv.cat}, BP {g.zmove?zPow(mv.bp):mv.bp})</span>}
        {pi&&!mv&&g.moveName&&<span style={{fontSize:11,color:'#f87171'}}>Move not found</span>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFENDER CARD
// ─────────────────────────────────────────────────────────────────────────────
interface DefState {
  pokeName:string; pokeInfo:PokeInfo|null;
  count:number; level:number; nature:string;
  hpEv:number; defEv:number; spdEv:number;
  customHp:boolean; customHpVal:number;
  moves:[string,string,string,string];
  mvInfos:[MvInfo|null,MvInfo|null,MvInfo|null,MvInfo|null];
  item:string;
}
const mkDef=():DefState=>({
  pokeName:'',pokeInfo:null,count:1,level:100,nature:'Bold',
  hpEv:252,defEv:252,spdEv:0,customHp:false,customHpVal:0,
  moves:['','','',''],mvInfos:[null,null,null,null],item:'(none)',
});

function DefCard({def,onChange}:{def:DefState;onChange:(p:Partial<DefState>)=>void}) {
  const pi=def.pokeInfo;
  const onPoke=(v:string)=>{const p=getPoke(v);onChange({pokeName:v,pokeInfo:p});};
  const setMv=(i:number,v:string)=>{
    const m=getMv(v);
    const mvs=[...def.moves] as [string,string,string,string];
    const mis=[...def.mvInfos] as [MvInfo|null,MvInfo|null,MvInfo|null,MvInfo|null];
    mvs[i]=v; mis[i]=m; onChange({moves:mvs,mvInfos:mis});
  };

  const baseHp=pi?cStat(pi.hp,def.hpEv,31,true,1,def.level):0;
  const displayHp=def.customHp?def.customHpVal:baseHp;

  return (
    <div style={{...CARD,borderLeft:'3px solid #ef4444'}}>
      <div style={{fontSize:10,fontWeight:800,color:'#ef4444',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:10}}>
        🎯 Raid Boss / Defender
        {pi&&<span style={{marginLeft:8,fontSize:12,fontWeight:700,color:'#e4e6ef',textTransform:'none'}}>{pi.name} {pi.types.map(t=><TB key={t} t={t}/>)}</span>}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 60px',gap:8,marginBottom:10}}>
        <AC label="Pokémon" value={def.pokeName} onChange={onPoke} search={srchPoke} placeholder="e.g. Heatran"/>
        <div>
          <label style={LBL}>Count</label>
          <input style={INP} type="number" min={1} max={10} value={def.count} onChange={e=>onChange({count:Math.max(1,parseInt(e.target.value)||1)})}/>
        </div>
      </div>

      {/* HP section */}
      <div style={{background:'rgba(239,68,68,0.07)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:7,padding:'10px 12px',marginBottom:10}}>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
          <label style={{...LBL,margin:0}}>HP Configuration</label>
          <label style={{display:'flex',alignItems:'center',gap:5,fontSize:11,color:'#9ca3af',cursor:'pointer',marginLeft:'auto'}}>
            <input type="checkbox" checked={def.customHp} onChange={e=>onChange({customHp:e.target.checked})}/>
            Use custom HP
          </label>
        </div>
        {def.customHp ? (
          <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:8,alignItems:'flex-end'}}>
            <div>
              <label style={LBL}>Custom HP value (per Pokémon)</label>
              <input style={INP} type="number" min={1} max={999999} value={def.customHpVal||''}
                onChange={e=>onChange({customHpVal:parseInt(e.target.value)||0})}
                placeholder="e.g. 20000 for raid boss HP"/>
            </div>
            <span style={{fontSize:12,color:'#6b7280',paddingBottom:6}}>Total: {(def.customHpVal*def.count).toLocaleString()}</span>
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'60px 80px 80px',gap:8,alignItems:'flex-end'}}>
            <div>
              <label style={LBL}>HP EVs</label>
              <input style={INP} type="number" min={0} max={252} value={def.hpEv} onChange={e=>onChange({hpEv:Math.min(252,Math.max(0,parseInt(e.target.value)||0))})}/>
            </div>
            <div style={{paddingBottom:6,fontSize:11,color:'#4ade80'}}>
              Base HP: {baseHp}
            </div>
            <div style={{paddingBottom:6,fontSize:11,color:'#6b7280'}}>
              Total: {(baseHp*def.count).toLocaleString()}
            </div>
          </div>
        )}
      </div>

      <div style={{display:'grid',gridTemplateColumns:'50px 1fr 80px 80px',gap:8,marginBottom:10,alignItems:'flex-end'}}>
        <div>
          <label style={LBL}>Lv</label>
          <input style={INP} type="number" min={1} max={100} value={def.level} onChange={e=>onChange({level:parseInt(e.target.value)||100})}/>
        </div>
        <div>
          <label style={LBL}>Nature</label>
          <select style={SEL} value={def.nature} onChange={e=>onChange({nature:e.target.value})}>
            {Object.keys(NATS).map(n=><option key={n}>{n}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Def EVs</label>
          <input style={INP} type="number" min={0} max={252} value={def.defEv} onChange={e=>onChange({defEv:Math.min(252,Math.max(0,parseInt(e.target.value)||0))})}/>
        </div>
        <div>
          <label style={LBL}>SpD EVs</label>
          <input style={INP} type="number" min={0} max={252} value={def.spdEv} onChange={e=>onChange({spdEv:Math.min(252,Math.max(0,parseInt(e.target.value)||0))})}/>
        </div>
      </div>

      {/* Defender moves */}
      <div>
        <label style={{...LBL,marginBottom:6}}>Defender Moves (used against attackers)</label>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {([0,1,2,3] as const).map(i=>(
            <div key={i} style={{display:'flex',gap:4,alignItems:'center'}}>
              <span style={{fontSize:10,color:'#4b5563',fontWeight:700,width:12,flexShrink:0}}>{i+1}</span>
              <div style={{flex:1}}>
                <AC value={def.moves[i]} onChange={v=>setMv(i,v)} search={srchMv} placeholder={`Move ${i+1}`}/>
              </div>
              {def.mvInfos[i]&&<TB t={def.mvInfos[i]!.type}/>}
            </div>
          ))}
        </div>
      </div>

      <div style={{marginTop:8}}>
        <label style={LBL}>Item</label>
        <select style={{...SEL,maxWidth:180}} value={def.item} onChange={e=>onChange({item:e.target.value})}>
          {ITEMS.map(i=><option key={i}>{i}</option>)}
        </select>
      </div>

      {pi&&<div style={{marginTop:8,fontSize:11,color:'#4ade80'}}>✓ {pi.name} • Total HP: {(displayHp*def.count).toLocaleString()}{def.count>1?` (${def.count} × ${displayHp.toLocaleString()})`:''}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESULT CARD — one attacker group vs defender
// ─────────────────────────────────────────────────────────────────────────────
function AtkResultCard({g,def,idx}:{g:AtkGroup;def:DefState;idx:number}) {
  const pi=g.pokeInfo; const mv=g.mvInfo; const dp=def.pokeInfo;
  if(!pi||!mv||!dp) return (
    <div style={{...CARD,opacity:0.4}}>
      <span style={{fontSize:12,color:'#6b7280'}}>Attacker {idx+1} — incomplete setup</span>
    </div>
  );

  const defHp=def.customHp?def.customHpVal:cStat(dp.hp,def.hpEv,31,true,1,def.level);
  const totalDefHp=defHp*def.count;

  const res=calcDmg(
    {atk:pi.atk,spa:pi.spa,spe:pi.spe}, g.nature, g.atkEv, g.spaEv, g.item, pi.types, g.level,
    {hp:dp.hp,def:dp.def,spd:dp.spd}, def.nature, def.hpEv, def.defEv, def.spdEv, dp.types, def.level,
    mv.bp, mv.cat, mv.type, g.zmove, def.customHp?defHp:undefined
  );

  const accent=['#5865f2','#f59e0b','#10b981','#f43f5e','#8b5cf6','#06b6d4'][idx%6];
  const label=g.label||`${g.count}× ${pi.name}`;

  if(res.immune) return (
    <div style={{...CARD,borderLeft:`3px solid ${accent}`}}>
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4}}>
        <span style={{fontSize:13,fontWeight:700,color:accent}}>{label}</span>
        <TB t={mv.type}/>
      </div>
      <span style={{color:'#6b7280',fontSize:12}}>{dp.name} is <strong style={{color:'#f87171'}}>immune</strong> to {mv.type}-type moves</span>
    </div>
  );

  const totalGroupAvg=res.avg*g.count;
  const totalGroupAvgP=totalDefHp?Math.floor(totalGroupAvg/totalDefHp*1000)/10:0;
  const hitsNeededSolo=res.avg?Math.ceil(defHp/res.avg):999;
  const totalPokemonNeeded=res.avg?Math.ceil(totalDefHp/res.avg):999;
  const barColor=res.maxP>=100?'#f87171':res.maxP>=50?'#fb923c':accent;

  return (
    <div style={{...CARD,borderLeft:`3px solid ${accent}`}}>
      {/* Header */}
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <span style={{fontSize:13,fontWeight:800,color:accent}}>{label}</span>
        <TB t={mv.type}/>
        <span style={{fontSize:11,color:'#6b7280'}}>{mv.cat} • BP {g.zmove?zPow(mv.bp):mv.bp}{g.zmove?' [Z]':''}</span>
        {res.stab&&<span style={{fontSize:10,background:'rgba(129,140,248,0.15)',color:'#818cf8',borderRadius:3,padding:'1px 6px',fontWeight:700}}>STAB</span>}
        {res.eff!==1&&<span style={{fontSize:11,fontWeight:700,color:res.eff>1?'#fb923c':'#4ade80'}}>{res.eff}×</span>}
      </div>

      {/* Per-attacker damage */}
      <div style={{background:'rgba(255,255,255,0.03)',borderRadius:7,padding:'10px 12px',marginBottom:10}}>
        <div style={{fontSize:9,fontWeight:800,color:'#4b5563',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Per Individual Pokémon</div>
        <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:6}}>
          <span style={{fontSize:20,fontWeight:800,color:'#fff',fontFamily:'monospace'}}>{res.avgP.toFixed(1)}%</span>
          <span style={{fontSize:12,color:'#6b7280'}}>avg</span>
          <span style={{fontSize:12,color:'#4b5563'}}>({res.minP.toFixed(1)}% – {res.maxP.toFixed(1)}%)</span>
        </div>
        <DmgBar pct={res.avgP} color={barColor}/>
        <div style={{fontSize:11,color:'#4b5563',marginTop:4}}>{res.min}–{res.max} HP / {defHp.toLocaleString()} HP</div>
        <div style={{fontSize:11,color:'#6b7280',marginTop:2}}>
          Hits to KO (1v1): <strong style={{color:'#e4e6ef'}}>{res.hitsToKo[0]===res.hitsToKo[1]?res.hitsToKo[0]:`${res.hitsToKo[0]}–${res.hitsToKo[1]}`}</strong>
        </div>
      </div>

      {/* Group damage */}
      <div style={{background:'rgba(255,255,255,0.03)',borderRadius:7,padding:'10px 12px',marginBottom:10}}>
        <div style={{fontSize:9,fontWeight:800,color:'#4b5563',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Whole Group ({g.count}× hits total)</div>
        <div style={{display:'flex',alignItems:'baseline',gap:8,marginBottom:6}}>
          <span style={{fontSize:18,fontWeight:800,color:totalGroupAvgP>=100?'#f87171':totalGroupAvgP>=50?'#fb923c':'#e4e6ef',fontFamily:'monospace'}}>{totalGroupAvgP.toFixed(1)}%</span>
          <span style={{fontSize:11,color:'#6b7280'}}>of total HP</span>
        </div>
        <DmgBar pct={totalGroupAvgP} color={barColor}/>
        <div style={{fontSize:11,color:'#4b5563',marginTop:4}}>{totalGroupAvg.toLocaleString()} avg damage / {totalDefHp.toLocaleString()} HP</div>
      </div>

      {/* KO stats */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div style={{background:'rgba(255,255,255,0.03)',borderRadius:6,padding:'8px 10px'}}>
          <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Solo KO needs</div>
          <span style={{fontSize:16,fontWeight:800,color:accent,fontFamily:'monospace'}}>{totalPokemonNeeded}</span>
          <span style={{fontSize:11,color:'#6b7280'}}> × {pi.name}</span>
        </div>
        <div style={{background:'rgba(255,255,255,0.03)',borderRadius:6,padding:'8px 10px'}}>
          <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Group covers</div>
          <span style={{fontSize:16,fontWeight:800,color:totalGroupAvgP>=100?'#4ade80':accent,fontFamily:'monospace'}}>{Math.min(100,totalGroupAvgP).toFixed(0)}%</span>
          <span style={{fontSize:11,color:'#6b7280'}}> of boss HP</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFENDER COUNTERATTACK RESULTS
// ─────────────────────────────────────────────────────────────────────────────
function DefResultSection({def,attackers}:{def:DefState;attackers:AtkGroup[]}) {
  const dp=def.pokeInfo;
  if(!dp) return null;
  const activeMoves=def.moves.map((m,i)=>m?{name:m,mv:def.mvInfos[i]}:null).filter(Boolean) as {name:string;mv:MvInfo|null}[];
  if(activeMoves.length===0) return (
    <div style={{...CARD,opacity:0.5}}>
      <span style={{fontSize:12,color:'#6b7280'}}>Add defender moves above to see counterattack damage.</span>
    </div>
  );
  const validGroups=attackers.filter(g=>g.pokeInfo);

  return (
    <div style={CARD}>
      <div style={{fontSize:11,fontWeight:800,color:'#ef4444',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:14}}>
        🎯 {dp.name} Counterattack
      </div>

      <div style={{display:'flex',flexDirection:'column',gap:10}}>
        {activeMoves.map(({name,mv},mi)=>{
          if(!mv) return <div key={mi} style={{fontSize:11,color:'#f87171'}}>Move "{name}" not found</div>;
          const isBest=mi===0; // we'll compute properly below

          return (
            <div key={mi} style={{background:'rgba(239,68,68,0.06)',border:'1px solid rgba(239,68,68,0.15)',borderRadius:8,padding:'10px 12px'}}>
              <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
                <span style={{fontSize:13,fontWeight:700,color:'#f87171'}}>{mv.name}</span>
                <TB t={mv.type}/>
                <span style={{fontSize:11,color:'#6b7280'}}>{mv.cat} • BP {mv.bp}</span>
              </div>

              {validGroups.length===0 ? (
                <span style={{fontSize:11,color:'#6b7280'}}>Add attacker Pokémon to see damage</span>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {validGroups.map((g,gi)=>{
                    const gp=g.pokeInfo!;
                    const atkHp=cStat(gp.hp,0,31,true,1,g.level);
                    const res=calcDmg(
                      {atk:dp.atk,spa:dp.spa,spe:dp.spe}, def.nature, def.defEv, def.spdEv, def.item, dp.types, def.level,
                      {hp:gp.hp,def:gp.def,spd:gp.spd}, g.nature, 0, g.atkEv, g.spaEv, gp.types, g.level,
                      mv.bp, mv.cat, mv.type, false
                    );
                    const accent=['#5865f2','#f59e0b','#10b981','#f43f5e','#8b5cf6','#06b6d4'][gi%6];
                    const lbl=g.label||`${g.count}× ${gp.name}`;

                    if(res.immune) return (
                      <div key={gi} style={{display:'flex',gap:8,alignItems:'center',fontSize:12}}>
                        <span style={{color:accent,fontWeight:700,minWidth:120}}>{lbl}</span>
                        <span style={{color:'#6b7280'}}>Immune</span>
                      </div>
                    );

                    const barColor=res.maxP>=100?'#f87171':res.maxP>=50?'#fb923c':'#ef4444';
                    return (
                      <div key={gi}>
                        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:3,flexWrap:'wrap'}}>
                          <span style={{color:accent,fontWeight:700,fontSize:12,minWidth:120}}>{lbl}</span>
                          <span style={{fontFamily:'monospace',fontSize:13,fontWeight:700,color:res.avgP>=100?'#f87171':res.avgP>=50?'#fb923c':'#e4e6ef'}}>{res.avgP.toFixed(1)}%</span>
                          <span style={{fontSize:11,color:'#4b5563'}}>({res.minP.toFixed(1)}–{res.maxP.toFixed(1)}%) • {res.min}–{res.max}/{atkHp} HP</span>
                          {res.stab&&<span style={{fontSize:10,background:'rgba(239,68,68,0.15)',color:'#f87171',borderRadius:3,padding:'1px 5px',fontWeight:700}}>STAB</span>}
                          {res.eff!==1&&<span style={{fontSize:10,fontWeight:700,color:res.eff>1?'#fb923c':'#4ade80'}}>{res.eff}×</span>}
                          {res.avgP>=100&&<span style={{fontSize:10,background:'rgba(248,113,113,0.15)',color:'#f87171',borderRadius:3,padding:'1px 5px',fontWeight:700}}>OHKO</span>}
                        </div>
                        <DmgBar pct={res.avgP} color={barColor}/>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMBINED KO SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
function KoSummary({attackers,def}:{attackers:AtkGroup[];def:DefState}) {
  const dp=def.pokeInfo;
  if(!dp) return null;

  const defHpEach=def.customHp?def.customHpVal:cStat(dp.hp,def.hpEv,31,true,1,def.level);
  const totalDefHp=defHpEach*def.count;

  const groups=attackers.map(g=>{
    if(!g.pokeInfo||!g.mvInfo) return null;
    const res=calcDmg(
      {atk:g.pokeInfo.atk,spa:g.pokeInfo.spa,spe:g.pokeInfo.spe}, g.nature, g.atkEv, g.spaEv, g.item, g.pokeInfo.types, g.level,
      {hp:dp.hp,def:dp.def,spd:dp.spd}, def.nature, def.hpEv, def.defEv, def.spdEv, dp.types, def.level,
      g.mvInfo.bp, g.mvInfo.cat, g.mvInfo.type, g.zmove, def.customHp?defHpEach:undefined
    );
    if(res.immune) return null;
    return { g, avg:res.avg, groupTotal:res.avg*g.count };
  }).filter(Boolean) as {g:AtkGroup;avg:number;groupTotal:number}[];

  if(groups.length===0) return null;

  const totalPerRound=groups.reduce((s,x)=>s+x.groupTotal,0);
  const totalPerRoundP=totalDefHp?Math.floor(totalPerRound/totalDefHp*1000)/10:0;
  const roundsToKo=totalPerRound?Math.ceil(totalDefHp/totalPerRound):999;

  // Speed: defender spe
  const defSpe=cStat(dp.spe,0,31,false,nat(def.nature,'spe'),def.level);

  return (
    <div style={{background:'linear-gradient(135deg,rgba(88,101,242,0.12),rgba(124,58,237,0.08))',border:'1px solid rgba(88,101,242,0.3)',borderRadius:12,padding:18}}>
      <div style={{fontSize:12,fontWeight:800,color:'#818cf8',textTransform:'uppercase',letterSpacing:'0.09em',marginBottom:16}}>⚡ Combined KO Analysis</div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:12,marginBottom:16}}>
        <div style={{background:'rgba(0,0,0,0.25)',borderRadius:8,padding:'10px 14px'}}>
          <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Boss Total HP</div>
          <div style={{fontSize:20,fontWeight:800,color:'#e4e6ef',fontFamily:'monospace'}}>{totalDefHp.toLocaleString()}</div>
          {def.count>1&&<div style={{fontSize:10,color:'#6b7280'}}>{def.count} × {defHpEach.toLocaleString()}</div>}
        </div>
        <div style={{background:'rgba(0,0,0,0.25)',borderRadius:8,padding:'10px 14px'}}>
          <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Dmg per Salvo</div>
          <div style={{fontSize:20,fontWeight:800,color:'#e4e6ef',fontFamily:'monospace'}}>{totalPerRound.toLocaleString()}</div>
          <div style={{fontSize:10,color:'#6b7280'}}>{totalPerRoundP.toFixed(1)}% of HP</div>
        </div>
        <div style={{background:'rgba(0,0,0,0.25)',borderRadius:8,padding:'10px 14px'}}>
          <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Rounds to KO</div>
          <div style={{fontSize:20,fontWeight:800,color:roundsToKo<=1?'#4ade80':roundsToKo<=3?'#fb923c':'#f87171',fontFamily:'monospace'}}>{roundsToKo}</div>
          <div style={{fontSize:10,color:'#6b7280'}}>{roundsToKo===1?'OHKO!':roundsToKo===2?'2HKO':`${roundsToKo} rounds`}</div>
        </div>
        <div style={{background:'rgba(0,0,0,0.25)',borderRadius:8,padding:'10px 14px'}}>
          <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Defender Speed</div>
          <div style={{fontSize:20,fontWeight:800,color:'#e4e6ef',fontFamily:'monospace'}}>{defSpe}</div>
          <div style={{fontSize:10,color:'#6b7280'}}>Spe stat</div>
        </div>
      </div>

      {/* Per-group contribution */}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',marginBottom:8}}>Group Contributions (per salvo)</div>
        <div style={{display:'flex',flexDirection:'column',gap:5}}>
          {groups.map((x,i)=>{
            const pct=totalDefHp?Math.floor(x.groupTotal/totalDefHp*1000)/10:0;
            const accent=['#5865f2','#f59e0b','#10b981','#f43f5e','#8b5cf6','#06b6d4'][i%6];
            const lbl=x.g.label||`${x.g.count}× ${x.g.pokeInfo!.name}`;
            return (
              <div key={x.g.id}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                  <span style={{fontSize:11,color:accent,fontWeight:700}}>{lbl}</span>
                  <span style={{fontSize:11,color:'#e4e6ef',fontFamily:'monospace'}}>{x.groupTotal.toLocaleString()} dmg ({pct.toFixed(1)}%)</span>
                </div>
                <div style={{height:5,background:'rgba(255,255,255,0.06)',borderRadius:3,overflow:'hidden'}}>
                  <div style={{width:`${Math.min(100,pct)}%`,height:'100%',background:accent,borderRadius:3}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Minimum attackers needed */}
      <div style={{background:'rgba(0,0,0,0.2)',borderRadius:8,padding:'10px 14px'}}>
        <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',marginBottom:8}}>Minimum Attackers Needed to KO (each hits once)</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:10}}>
          {groups.map((x,i)=>{
            const needed=x.avg?Math.ceil(totalDefHp/x.avg):999;
            const accent=['#5865f2','#f59e0b','#10b981','#f43f5e','#8b5cf6','#06b6d4'][i%6];
            const lbl=x.g.label||x.g.pokeInfo!.name;
            return (
              <div key={x.g.id} style={{background:'rgba(255,255,255,0.04)',borderRadius:7,padding:'7px 12px',border:`1px solid ${accent}33`}}>
                <div style={{fontSize:10,color:accent,fontWeight:700}}>{lbl}</div>
                <div style={{fontSize:18,fontWeight:800,color:'#e4e6ef',fontFamily:'monospace'}}>{needed}</div>
                <div style={{fontSize:10,color:'#4b5563'}}>Pokémon solo</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function RaidCalcPage() {
  const sd=useSD();
  const [groups,setGroups]=useState<AtkGroup[]>([mkAtk()]);
  const [def,setDef]=useState<DefState>(mkDef());
  const [calculated,setCalc]=useState(false);
  const [showResults,setShow]=useState(false);

  const updGroup=(id:string,p:Partial<AtkGroup>)=>setGroups(gs=>gs.map(g=>g.id===id?{...g,...p}:g));
  const addGroup=()=>{ if(groups.length<6) setGroups(gs=>[...gs,mkAtk()]); };
  const remGroup=(id:string)=>setGroups(gs=>gs.filter(g=>g.id!==id));
  const updDef=(p:Partial<DefState>)=>setDef(d=>({...d,...p}));

  const canCalc=sd==='ready' && def.pokeInfo && groups.some(g=>g.pokeInfo&&g.mvInfo);

  const hasResults=def.pokeInfo&&groups.some(g=>g.pokeInfo&&g.mvInfo);

  return (
    <div style={{maxWidth:1100}}>
      {/* Header */}
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:22,fontWeight:800,color:'#e4e6ef',margin:0,letterSpacing:'-0.02em'}}>🏟️ Raid Damage Calculator</h1>
        <p style={{fontSize:13,color:'#6b7280',margin:'4px 0 0'}}>Calculate damage from both sides — multiple attacker groups, custom HP, full counterattack analysis</p>
      </div>

      {/* Data status */}
      {sd==='loading'&&(
        <div style={{background:'rgba(99,102,241,0.08)',border:'1px solid rgba(99,102,241,0.2)',borderRadius:8,padding:'9px 14px',marginBottom:16,fontSize:12,color:'#818cf8',display:'flex',alignItems:'center',gap:8}}>
          <span style={{width:12,height:12,border:'2px solid #818cf8',borderTopColor:'transparent',borderRadius:'50%',display:'inline-block',flexShrink:0}}/>
          Loading Pokémon Showdown data…
        </div>
      )}
      {sd==='error'&&<div style={{background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.3)',borderRadius:8,padding:'9px 14px',marginBottom:16,fontSize:12,color:'#fbbf24'}}>⚠️ Could not load Showdown data. Check your connection.</div>}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
        {/* Left: Attackers */}
        <div>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}>
            <h2 style={{fontSize:14,fontWeight:800,color:'#818cf8',margin:0,textTransform:'uppercase',letterSpacing:'0.06em'}}>⚔️ Attackers</h2>
            <span style={{fontSize:11,color:'#4b5563'}}>{groups.length}/6 groups</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {groups.map((g,i)=>(
              <AtkCard key={g.id} g={g} idx={i} onChange={p=>updGroup(g.id,p)} onRemove={()=>remGroup(g.id)} total={groups.length}/>
            ))}
            {groups.length<6&&(
              <button onClick={addGroup}
                style={{padding:'9px',background:'rgba(88,101,242,0.08)',border:'1px dashed rgba(88,101,242,0.3)',borderRadius:10,color:'#818cf8',cursor:'pointer',fontSize:13,fontWeight:600,transition:'all 0.15s'}}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(88,101,242,0.15)')}
                onMouseLeave={e=>(e.currentTarget.style.background='rgba(88,101,242,0.08)')}>
                + Add Attacker Group
              </button>
            )}
          </div>
        </div>

        {/* Right: Defender */}
        <div>
          <h2 style={{fontSize:14,fontWeight:800,color:'#ef4444',margin:'0 0 12px',textTransform:'uppercase',letterSpacing:'0.06em'}}>🎯 Defender</h2>
          <DefCard def={def} onChange={updDef}/>
        </div>
      </div>

      {/* Calculate Button */}
      <div style={{textAlign:'center',marginBottom:28}}>
        <button onClick={()=>setShow(true)} disabled={!canCalc}
          style={{padding:'12px 48px',background:canCalc?'linear-gradient(135deg,#5865f2,#7c3aed)':'rgba(88,101,242,0.2)',border:'none',borderRadius:10,color:canCalc?'#fff':'#6b7280',cursor:canCalc?'pointer':'not-allowed',fontSize:15,fontWeight:800,boxShadow:canCalc?'0 4px 20px rgba(88,101,242,0.45)':'none',transition:'all 0.2s',letterSpacing:'0.03em'}}>
          {sd!=='ready'?'⏳ Loading Pokémon data…':'⚡ Calculate Raid Damage'}
        </button>
        {!def.pokeInfo&&sd==='ready'&&<div style={{marginTop:8,fontSize:11,color:'#4b5563'}}>Enter a defender Pokémon to calculate</div>}
      </div>

      {/* Results */}
      {showResults&&hasResults&&(
        <div style={{display:'flex',flexDirection:'column',gap:20}}>
          {/* Combined Summary first */}
          <KoSummary attackers={groups} def={def}/>

          {/* Per-group attacker results */}
          <div>
            <h2 style={{fontSize:13,fontWeight:800,color:'#818cf8',textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 12px'}}>⚔️ Attacker Damage Breakdown</h2>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:14}}>
              {groups.map((g,i)=><AtkResultCard key={g.id} g={g} def={def} idx={i}/>)}
            </div>
          </div>

          {/* Defender counterattack */}
          <div>
            <h2 style={{fontSize:13,fontWeight:800,color:'#ef4444',textTransform:'uppercase',letterSpacing:'0.08em',margin:'0 0 12px'}}>🎯 Defender Counterattack</h2>
            <DefResultSection def={def} attackers={groups}/>
          </div>
        </div>
      )}
    </div>
  );
}

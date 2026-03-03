import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PokeStat { hp:number;atk:number;def:number;spa:number;spd:number;spe:number }
interface PokeData { name:string; types:string[]; stats:PokeStat; bst:number; abilities:string[] }
interface Weakness { quad:string[];double:string[];half:string[];quarter:string[];immune:string[] }

// ── Showdown data math (pure JS, no API round-trip) ──────────────────────────
const _key = (s:string) => (s||'').toLowerCase().replace(/[\s\-'.]/g,'');
const _DMG_CODE:{[k:number]:number} = {0:1,1:2,2:0.5,3:0};
const _Z_TABLE:[number,number][] = [[55,100],[65,120],[75,140],[85,160],[95,175],[100,180],[110,185],[125,190],[9999,195]];
const _zPower = (bp:number) => { for (const [t,p] of _Z_TABLE) if (bp<=t) return p; return 195; };

const NATURES:{[k:string]:{atk:number;def:number;spa:number;spd:number;spe:number}} = {
  Hardy:{atk:1,def:1,spa:1,spd:1,spe:1}, Lonely:{atk:1.1,def:0.9,spa:1,spd:1,spe:1},
  Brave:{atk:1.1,def:1,spa:1,spd:1,spe:0.9}, Adamant:{atk:1.1,def:1,spa:0.9,spd:1,spe:1},
  Naughty:{atk:1.1,def:1,spa:1,spd:0.9,spe:1}, Bold:{atk:0.9,def:1.1,spa:1,spd:1,spe:1},
  Docile:{atk:1,def:1,spa:1,spd:1,spe:1}, Relaxed:{atk:1,def:1.1,spa:1,spd:1,spe:0.9},
  Impish:{atk:1,def:1.1,spa:0.9,spd:1,spe:1}, Lax:{atk:1,def:1.1,spa:1,spd:0.9,spe:1},
  Timid:{atk:0.9,def:1,spa:1,spd:1,spe:1.1}, Hasty:{atk:1,def:0.9,spa:1,spd:1,spe:1.1},
  Serious:{atk:1,def:1,spa:1,spd:1,spe:1}, Jolly:{atk:1,def:1,spa:0.9,spd:1,spe:1.1},
  Naive:{atk:1,def:1,spa:1,spd:0.9,spe:1.1}, Modest:{atk:0.9,def:1,spa:1.1,spd:1,spe:1},
  Mild:{atk:1,def:0.9,spa:1.1,spd:1,spe:1}, Quiet:{atk:1,def:1,spa:1.1,spd:1,spe:0.9},
  Rash:{atk:1,def:1,spa:1.1,spd:0.9,spe:1}, Bashful:{atk:1,def:1,spa:1,spd:1,spe:1},
  Calm:{atk:0.9,def:1,spa:1,spd:1.1,spe:1}, Gentle:{atk:1,def:0.9,spa:1,spd:1.1,spe:1},
  Sassy:{atk:1,def:1,spa:1,spd:1.1,spe:0.9}, Careful:{atk:1,def:1,spa:0.9,spd:1.1,spe:1},
  Quirky:{atk:1,def:1,spa:1,spd:1,spe:1},
};

const ITEMS = [
  '(none)','Life Orb','Choice Band','Choice Specs','Choice Scarf',
  'Expert Belt','Muscle Band','Wise Glasses','Black Belt','Charcoal',
  'Mystic Water','Miracle Seed','Magnet','TwistedSpoon','Never-Melt Ice',
  'Silk Scarf','Metal Coat','Dragon Fang','Spell Tag','Poison Barb',
  'Soft Sand','Hard Stone','Sharp Beak','Pink Bow','Black Glasses',
  'Eviolite','Assault Vest','Rocky Helmet','Leftovers','Berry',
];

const ITEM_MOD = (item:string, category:string, moveType:string, atkTypes:string[]):number => {
  if (item==='Life Orb') return 5324/4096;
  if (item==='Choice Band' && category==='Physical') return 1.5;
  if (item==='Choice Specs' && category==='Special') return 1.5;
  if (item==='Muscle Band' && category==='Physical') return 1.1;
  if (item==='Wise Glasses' && category==='Special') return 1.1;
  if (item==='Expert Belt') return 1; // handled separately with type bonus
  const typeBoosts:{[k:string]:string} = {
    'Charcoal':'Fire','Mystic Water':'Water','Miracle Seed':'Grass','Magnet':'Electric',
    'Never-Melt Ice':'Ice','Black Belt':'Fighting','Poison Barb':'Poison',
    'Soft Sand':'Ground','Sharp Beak':'Flying','TwistedSpoon':'Psychic',
    'Silver Powder':'Bug','Hard Stone':'Rock','Spell Tag':'Ghost',
    'Dragon Fang':'Dragon','Black Glasses':'Dark','Metal Coat':'Steel',
    'Silk Scarf':'Normal',
  };
  if (typeBoosts[item]===moveType) return 1.2;
  return 1;
};

const WEATHER_MOD = (weather:string, moveType:string):number => {
  if (weather==='Sun'    && moveType==='Fire')   return 1.5;
  if (weather==='Sun'    && moveType==='Water')  return 0.5;
  if (weather==='Rain'   && moveType==='Water')  return 1.5;
  if (weather==='Rain'   && moveType==='Fire')   return 0.5;
  if (weather==='Sand'   && moveType==='Rock')   return 1; // SpD boost handled separately
  if (weather==='Snow'   && moveType==='Ice')    return 1;
  if (weather==='HarshSunshine' && moveType==='Fire')  return 1.5;
  if (weather==='HarshSunshine' && moveType==='Water') return 0;
  if (weather==='HeavyRain' && moveType==='Water') return 1.5;
  if (weather==='HeavyRain' && moveType==='Fire')  return 0;
  return 1;
};

function calcStat(base:number, ev:number=0, iv:number=31, isHp:boolean=false, nature:number=1, level:number=100):number {
  if (isHp) return Math.floor((2*base+iv+Math.floor(ev/4))*level/100)+level+10;
  return Math.floor((Math.floor((2*base+iv+Math.floor(ev/4))*level/100)+5)*nature);
}

function typeEff(atkType:string, defTypes:string[], typechart:any):number {
  let m = 1;
  for (const dt of defTypes) {
    const code = (typechart[dt]?.damageTaken||{})[atkType]??0;
    m *= _DMG_CODE[code]??1;
  }
  return m;
}

interface CalcInput {
  pokemon: PokeData; level:number; nature:string; item:string;
  evs:PokeStat; ivs:PokeStat; moveName:string; moveData:any;
  zmove:boolean; teraType:string; status:string; isCrit:boolean;
}
interface DefInput {
  pokemon: PokeData; level:number; nature:string; item:string;
  evs:PokeStat; ivs:PokeStat; teraType:string; status:string;
}
interface FieldInput { weather:string; terrain:string; doubles:boolean; screens:{atk:boolean;def:boolean;} }

function calcDamage(atk:CalcInput, def:DefInput, field:FieldInput, typechart:any) {
  const mv = atk.moveData;
  if (!mv || !mv.basePower) return null;
  let bp = mv.basePower as number;
  const cat = mv.category as string;
  const mtyp = mv.type as string;
  if (atk.zmove) bp = _zPower(bp);

  const atkNat = NATURES[atk.nature] || NATURES.Hardy;
  const defNat = NATURES[def.nature] || NATURES.Hardy;

  const atkStats = atk.pokemon.stats;
  const defStats = def.pokemon.stats;

  const atkStat = cat==='Physical'
    ? calcStat(atkStats.atk, atk.evs.atk, atk.ivs.atk, false, atkNat.atk, atk.level)
    : calcStat(atkStats.spa, atk.evs.spa, atk.ivs.spa, false, atkNat.spa, atk.level);
  const defStat = cat==='Physical'
    ? calcStat(defStats.def, def.evs.def, def.ivs.def, false, defNat.def, def.level)
    : calcStat(defStats.spd, def.evs.spd, def.ivs.spd, false, defNat.spd, def.level);

  const defHp = calcStat(defStats.hp, def.evs.hp, def.ivs.hp, true, 1, def.level);

  // effective attacker types (tera overrides)
  const atkTypes = atk.teraType ? [atk.teraType] : atk.pokemon.types;
  const defTypes = def.teraType ? [def.teraType] : def.pokemon.types;

  const eff = typeEff(mtyp, defTypes, typechart);
  if (eff===0) return { immune:true, mtyp };

  // STAB
  let stab = 1;
  if (atkTypes.includes(mtyp)) stab = atk.teraType ? 2 : 1.5;

  // base damage
  const base = Math.floor(Math.floor(Math.floor(2*atk.level/5+2)*bp*atkStat/defStat)/50)+2;

  // item
  const itemMod = ITEM_MOD(atk.item, cat, mtyp, atkTypes);
  // expert belt bonus
  const expertBelt = atk.item==='Expert Belt' && eff>1 ? 1.2 : 1;

  // weather
  const weatherMod = WEATHER_MOD(field.weather, mtyp);

  // screens (defender's screens halve damage)
  const screenMod = (cat==='Physical' && field.screens.def) || (cat==='Special' && field.screens.atk) ? 0.5 : 1;

  // burn
  const burnMod = atk.status==='Burn' && cat==='Physical' ? 0.5 : 1;

  // doubles spread
  const spreadMod = field.doubles ? 0.75 : 1;

  // crit
  const critMod = atk.isCrit ? 1.5 : 1;

  function applyMods(d:number):number {
    // Showdown order: random → target → weather → crit → stab → type → burn → screens → other
    d = Math.floor(d * spreadMod);
    d = Math.floor(d * weatherMod);
    d = Math.floor(d * critMod);
    if (stab > 1) d = Math.floor(d * stab);
    d = Math.floor(d * eff);
    d = Math.floor(d * burnMod);
    d = Math.floor(d * screenMod);
    d = Math.floor(d * itemMod);
    d = Math.floor(d * expertBelt);
    return Math.max(1, d);
  }

  const rolls:number[] = [];
  for (let r=85;r<=100;r++) rolls.push(applyMods(Math.floor(base*r/100)));

  const minD = rolls[0], maxD = rolls[15];
  const minP = Math.floor(minD/defHp*1000)/10;
  const maxP = Math.floor(maxD/defHp*1000)/10;

  const atkSpe = calcStat(atkStats.spe, atk.evs.spe, atk.ivs.spe, false, atkNat.spe, atk.level);
  const defSpe = calcStat(defStats.spe, def.evs.spe, def.ivs.spe, false, defNat.spe, def.level);

  return {
    immune:false, rolls, minD, maxD, minP, maxP, defHp,
    eff, stab: stab>1, mtyp, cat,
    atkSpe, defSpe,
    ohko: minP>=100, twoHko: minP>=50,
    possibleOhko: maxP>=100,
    hitsToKo:[maxD?Math.ceil(defHp/maxD):99, minD?Math.ceil(defHp/minD):99],
    atkStat, defStat,
  };
}

// ── UI helpers ────────────────────────────────────────────────────────────────
const TC:{[k:string]:string}={Fire:'#FF4422',Water:'#3399FF',Grass:'#33CC44',Electric:'#FFCC00',Ice:'#66CCFF',Fighting:'#CC3300',Poison:'#993399',Ground:'#CCAA55',Flying:'#88AAFF',Psychic:'#FF5599',Bug:'#AABB22',Rock:'#BBAA66',Ghost:'#664477',Dragon:'#7744FF',Dark:'#554433',Steel:'#AAAABB',Fairy:'#FFAACC',Normal:'#AAAA88'};
const TYPES = Object.keys(TC);
const STAT_ORDER:[keyof PokeStat, string][] = [['hp','HP'],['atk','Atk'],['def','Def'],['spa','SpA'],['spd','SpD'],['spe','Spe']];
const DEFAULT_EVS:PokeStat = {hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
const DEFAULT_IVS:PokeStat = {hp:31,atk:31,def:31,spa:31,spd:31,spe:31};
const WEATHERS = ['None','Sun','Rain','Sand','Snow','Harsh Sunshine','Heavy Rain','Strong Winds'];
const TERRAINS = ['None','Electric Terrain','Grassy Terrain','Misty Terrain','Psychic Terrain'];

const inp = {padding:'4px 7px',background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:5,color:'#e4e6ef',fontSize:12,width:'100%',boxSizing:'border-box' as const};
const smallNum = {...inp,width:46,textAlign:'center' as const};
const sel = {...inp,cursor:'pointer'};

function TypeBadge({t}:{t:string}){
  return <span style={{background:TC[t]||'#555',color:'#fff',borderRadius:4,padding:'1px 7px',fontSize:11,fontWeight:700,flexShrink:0,letterSpacing:'0.03em'}}>{t}</span>;
}

function StatBar({stat,val,max=255}:{stat:string;val:number;max?:number}){
  const pct = Math.min(100,val/max*100);
  const c = pct>68?'#3BA55D':pct>38?'#FAA81A':'#ED4245';
  return (
    <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2}}>
      <span style={{width:26,fontSize:10,color:'#8b8fa8',textAlign:'right',fontFamily:'monospace'}}>{stat}</span>
      <div style={{flex:1,height:6,background:'rgba(255,255,255,0.07)',borderRadius:3,overflow:'hidden'}}>
        <div style={{width:`${pct}%`,height:'100%',background:c,borderRadius:3}}/>
      </div>
      <span style={{width:24,fontSize:11,color:'#c4c8e4',textAlign:'right',fontFamily:'monospace',fontWeight:600}}>{val}</span>
    </div>
  );
}

// Auto-complete input
function AutoInput({label,value,onChange,url,style={}}:{label:string;value:string;onChange:(v:string)=>void;url:string;style?:any}){
  const [opts,setOpts]=useState<string[]>([]);const [show,setShow]=useState(false);const t=useRef<any>(null);
  const search=(v:string)=>{onChange(v);if(t.current)clearTimeout(t.current);if(v.length<2){setOpts([]);return;}
    t.current=setTimeout(async()=>{try{const r=await fetch(`/api${url}?q=${encodeURIComponent(v)}`);const d=await r.json();setOpts(d.results||[]);setShow(true);}catch{}},200);};
  return (
    <div style={{position:'relative',...style}}>
      <label style={{display:'block',fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>{label}</label>
      <input style={inp} value={value}
        onChange={e=>search(e.target.value)}
        onBlur={()=>setTimeout(()=>setShow(false),130)}
        onFocus={()=>opts.length>0&&setShow(true)}
        placeholder={label}/>
      {show&&opts.length>0&&<div style={{position:'absolute',top:'100%',left:0,right:0,background:'#1a1c2e',border:'1px solid rgba(255,255,255,0.15)',borderRadius:6,zIndex:300,maxHeight:160,overflowY:'auto',marginTop:2,boxShadow:'0 8px 32px rgba(0,0,0,0.6)'}}>
        {opts.map(x=><div key={x} onMouseDown={()=>{onChange(x);setShow(false);setOpts([]);}} style={{padding:'6px 10px',cursor:'pointer',fontSize:12,color:'#d4d8f0'}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(88,101,242,0.25)')} onMouseLeave={e=>(e.currentTarget.style.background='')}>{x}</div>)}
      </div>}
    </div>
  );
}

// ── Pokemon panel ─────────────────────────────────────────────────────────────
interface PanelState {
  name:string; data:PokeData|null; level:number; nature:string; item:string;
  evs:PokeStat; ivs:PokeStat; teraType:string; status:string; moveName:string; moveData:any;
  zmove:boolean; isCrit:boolean;
}

function defaultPanel():PanelState {
  return {name:'',data:null,level:100,nature:'Hardy',item:'(none)',
    evs:{...DEFAULT_EVS},ivs:{...DEFAULT_IVS},teraType:'',status:'Healthy',moveName:'',moveData:null,zmove:false,isCrit:false};
}

function PokemonPanel({panel,setPanel,side,typechart}:{panel:PanelState;setPanel:(p:PanelState)=>void;side:'left'|'right';typechart:any}){
  const nat = NATURES[panel.nature]||NATURES.Hardy;
  const lv = panel.level||100;
  const d = panel.data;

  const computedStats = d ? {
    hp:  calcStat(d.stats.hp,  panel.evs.hp,  panel.ivs.hp,  true, 1,         lv),
    atk: calcStat(d.stats.atk, panel.evs.atk, panel.ivs.atk, false,nat.atk,   lv),
    def: calcStat(d.stats.def, panel.evs.def, panel.ivs.def, false,nat.def,   lv),
    spa: calcStat(d.stats.spa, panel.evs.spa, panel.ivs.spa, false,nat.spa,   lv),
    spd: calcStat(d.stats.spd, panel.evs.spd, panel.ivs.spd, false,nat.spd,   lv),
    spe: calcStat(d.stats.spe, panel.evs.spe, panel.ivs.spe, false,nat.spe,   lv),
  } : null;

  const set = (patch:Partial<PanelState>) => setPanel({...panel,...patch});
  const setEv = (stat:keyof PokeStat, v:number) => set({evs:{...panel.evs,[stat]:Math.min(252,Math.max(0,v||0))}});
  const setIv = (stat:keyof PokeStat, v:number) => set({ivs:{...panel.ivs,[stat]:Math.min(31,Math.max(0,v||0))}});

  const natColor = (stat:keyof PokeStat) => { const v = (nat as Record<string,number>)[stat]; return v>1?'#7ee787':v<1?'#f87171':undefined; };

  return (
    <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:12,display:'flex',flexDirection:'column',gap:8}}>
      <div style={{fontSize:11,fontWeight:700,color:'#5865f2',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:2}}>
        Pokémon {side==='left'?'1':'2'}
      </div>

      <AutoInput label="Pokémon" value={panel.name} url="/bossinfo/search"
        onChange={async v=>{
          set({name:v,data:null,moveName:'',moveData:null});
          if(v.length>2&&typechart){try{const r=await fetch(`/api/bossinfo/search?q=${encodeURIComponent(v)}`);const d=await r.json();if(d.results?.[0]===v){const r2=await fetch(`/api/bossinfo/weakness?pokemon=${encodeURIComponent(v)}`);if(r2.ok){const wd=await r2.json();set({name:v,data:{name:wd.name,types:wd.types,stats:{hp:0,atk:0,def:0,spa:0,spd:0,spe:0},bst:0,abilities:wd.abilities||[]}});}}
          }catch{}}
        }}/>

      {/* Level + Nature row */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
        <div>
          <label style={{display:'block',fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Level</label>
          <input style={inp} type="number" min={1} max={100} value={panel.level} onChange={e=>set({level:parseInt(e.target.value)||100})}/>
        </div>
        <div>
          <label style={{display:'block',fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Nature</label>
          <select style={sel} value={panel.nature} onChange={e=>set({nature:e.target.value})}>
            {Object.keys(NATURES).map(n=><option key={n}>{n}</option>)}
          </select>
        </div>
      </div>

      {/* Item + Tera */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
        <div>
          <label style={{display:'block',fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Item</label>
          <select style={sel} value={panel.item} onChange={e=>set({item:e.target.value})}>
            {ITEMS.map(i=><option key={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label style={{display:'block',fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Tera Type</label>
          <select style={sel} value={panel.teraType} onChange={e=>set({teraType:e.target.value})}>
            <option value="">None</option>
            {TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Status */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
        <div>
          <label style={{display:'block',fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Status</label>
          <select style={sel} value={panel.status} onChange={e=>set({status:e.target.value})}>
            {['Healthy','Burn','Paralysis','Poison','Bad Poison','Freeze','Sleep'].map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
        <div style={{display:'flex',gap:12,alignItems:'flex-end',paddingBottom:4}}>
          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#9ca3af',cursor:'pointer'}}>
            <input type="checkbox" checked={panel.isCrit} onChange={e=>set({isCrit:e.target.checked})}/> Crit
          </label>
          <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#9ca3af',cursor:'pointer'}}>
            <input type="checkbox" checked={panel.zmove} onChange={e=>set({zmove:e.target.checked})}/> Z-Move
          </label>
        </div>
      </div>

      {/* EVs / IVs table */}
      <div>
        <div style={{display:'grid',gridTemplateColumns:'26px 1fr 46px 46px 46px',gap:'2px 4px',alignItems:'center',marginBottom:3}}>
          <span/><span style={{fontSize:9,color:'#4b5563',textAlign:'center',fontWeight:700,textTransform:'uppercase'}}>BASE</span>
          <span style={{fontSize:9,color:'#4b5563',textAlign:'center',fontWeight:700,textTransform:'uppercase'}}>IV</span>
          <span style={{fontSize:9,color:'#4b5563',textAlign:'center',fontWeight:700,textTransform:'uppercase'}}>EV</span>
          <span style={{fontSize:9,color:'#4b5563',textAlign:'center',fontWeight:700,textTransform:'uppercase'}}>STAT</span>
        </div>
        {STAT_ORDER.map(([key,label])=>{
          const base = d?.stats[key]??'—';
          const cs   = computedStats?.[key];
          const nc   = natColor(key);
          return (
            <div key={key} style={{display:'grid',gridTemplateColumns:'26px 1fr 46px 46px 46px',gap:'2px 4px',alignItems:'center',marginBottom:2}}>
              <span style={{fontSize:10,color:'#6b7280',fontWeight:700,textAlign:'right',fontFamily:'monospace'}}>{label}</span>
              <div style={{height:5,background:'rgba(255,255,255,0.07)',borderRadius:2,overflow:'hidden'}}>
                <div style={{width:`${Math.min(100,(Number(base)||0)/255*100)}%`,height:'100%',background:'#5865f2',borderRadius:2}}/>
              </div>
              <input style={smallNum} type="number" min={0} max={31} value={panel.ivs[key]} onChange={e=>setIv(key,parseInt(e.target.value))}/>
              <input style={smallNum} type="number" min={0} max={252} value={panel.evs[key]} onChange={e=>setEv(key,parseInt(e.target.value))}/>
              <span style={{fontSize:11,fontWeight:700,textAlign:'center',color:nc||'#c4c8e4',fontFamily:'monospace'}}>{cs??'—'}</span>
            </div>
          );
        })}
        <div style={{fontSize:10,color:'#4b5563',textAlign:'right',marginTop:2}}>
          EVs used: {Object.values(panel.evs).reduce((a,b)=>a+b,0)}/510
        </div>
      </div>

      {/* Move selector */}
      <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:8}}>
        <AutoInput label="Move" value={panel.moveName} url="/bossinfo/movesearch"
          onChange={async v=>{
            set({moveName:v,moveData:null});
          }}/>
      </div>
    </div>
  );
}

// ── Damage result display ─────────────────────────────────────────────────────
function DamageResult({result,atkPanel,defPanel}:{result:any;atkPanel:PanelState;defPanel:PanelState}){
  if(!result) return null;
  if(result.immune) return (
    <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,padding:'12px 16px',textAlign:'center',color:'#6b7280',fontSize:13}}>
      <strong style={{color:'#c4c8e4'}}>{defPanel.name||'Defender'}</strong> is immune to <TypeBadge t={result.mtyp}/> moves
    </div>
  );

  const {minD,maxD,minP,maxP,defHp,rolls,ohko,twoHko,possibleOhko,hitsToKo,eff,stab,cat,atkSpe,defSpe} = result;
  const ko = ohko?'Guaranteed OHKO':possibleOhko?'Possible OHKO':twoHko?'Guaranteed 2HKO':maxP>=50?'Possible 2HKO':'3HKO+';
  const koColor = ohko||possibleOhko?'#f87171':twoHko||maxP>=50?'#fb923c':'#4ade80';
  const barPct = Math.min(100,maxP);
  const barColor = barPct>=100?'#f87171':barPct>=50?'#fb923c':'#5865f2';

  const fasterStr = atkSpe>defSpe
    ? `${atkPanel.name||'Attacker'} outspeeds (${atkSpe} > ${defSpe})`
    : defSpe>atkSpe
    ? `${defPanel.name||'Defender'} outspeeds (${defSpe} > ${atkSpe})`
    : `Speed tie (${atkSpe})`;

  return (
    <div style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:10,padding:14,display:'flex',flexDirection:'column',gap:10}}>
      {/* Header */}
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:13,fontWeight:700,color:'#e4e6ef'}}>{atkPanel.name||'Attacker'}</span>
        <span style={{fontSize:11,color:'#6b7280'}}>→</span>
        <span style={{fontSize:13,fontWeight:700,color:'#818cf8'}}>{atkPanel.moveName}{atkPanel.zmove?' [Z]':''}</span>
        <span style={{fontSize:11,color:'#6b7280'}}>→</span>
        <span style={{fontSize:13,fontWeight:700,color:'#e4e6ef'}}>{defPanel.name||'Defender'}</span>
        <TypeBadge t={result.mtyp}/>
        <span style={{fontSize:11,color:'#6b7280'}}>{cat}</span>
        {eff>1&&<span style={{fontSize:11,color:'#fb923c',fontWeight:700}}>{eff}× eff</span>}
        {eff<1&&eff>0&&<span style={{fontSize:11,color:'#4ade80',fontWeight:700}}>Resisted ({eff}×)</span>}
        {stab&&<span style={{fontSize:10,background:'rgba(129,140,248,0.2)',color:'#818cf8',borderRadius:3,padding:'1px 5px',fontWeight:700}}>STAB</span>}
        {atkPanel.isCrit&&<span style={{fontSize:10,background:'rgba(251,191,36,0.2)',color:'#fbbf24',borderRadius:3,padding:'1px 5px',fontWeight:700}}>CRIT</span>}
        {atkPanel.zmove&&<span style={{fontSize:10,background:'rgba(139,92,246,0.2)',color:'#a78bfa',borderRadius:3,padding:'1px 5px',fontWeight:700}}>Z</span>}
      </div>

      {/* Damage bar */}
      <div>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
          <span style={{fontSize:18,fontWeight:800,color:'#fff',fontFamily:'monospace'}}>{minP.toFixed(1)}% — {maxP.toFixed(1)}%</span>
          <span style={{fontSize:13,fontWeight:700,color:koColor}}>{ko}</span>
        </div>
        <div style={{height:8,background:'rgba(255,255,255,0.07)',borderRadius:4,overflow:'hidden',position:'relative'}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,minP)}%`,background:barColor,opacity:0.5,borderRadius:4}}/>
          <div style={{position:'absolute',left:`${Math.min(100,minP)}%`,top:0,bottom:0,width:`${Math.min(100,maxP)-Math.min(100,minP)}%`,background:barColor,borderRadius:4}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',marginTop:3,fontSize:10,color:'#6b7280'}}>
          <span>{minD}–{maxD} / {defHp} HP</span>
          <span>{hitsToKo[0]===hitsToKo[1]?`${hitsToKo[0]} hits to KO`:`${hitsToKo[0]}–${hitsToKo[1]} hits to KO`}</span>
        </div>
      </div>

      {/* Roll breakdown */}
      <div>
        <div style={{fontSize:10,color:'#4b5563',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:4}}>Damage Rolls (×16)</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
          {(rolls as number[]).map((r,i)=>(
            <span key={i} style={{fontSize:10,fontFamily:'monospace',color:r===maxD?'#818cf8':r===minD?'#f87171':'#6b7280',background:'rgba(255,255,255,0.04)',borderRadius:3,padding:'2px 5px',border:r===maxD||r===minD?'1px solid currentColor':'1px solid transparent'}}>{r}</span>
          ))}
        </div>
      </div>

      {/* Speed */}
      <div style={{background:'rgba(255,255,255,0.03)',borderRadius:6,padding:'6px 10px',fontSize:11,color:'#9ca3af'}}>
        ⚡ {fasterStr}
      </div>
    </div>
  );
}

// ── Weakness display ──────────────────────────────────────────────────────────
function WeaknessSection(){
  const [poke,setPoke]=useState('');
  const [tera,setTera]=useState('');
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState('');

  const lookup = async()=>{
    if(!poke.trim())return;
    setLoading(true);setErr('');setData(null);
    const q=`/api/bossinfo/weakness?pokemon=${encodeURIComponent(poke)}`+(tera?`&tera=${encodeURIComponent(tera)}`:'');
    try{const r=await fetch(q);const d=await r.json();if(d.error)setErr(d.error);else setData(d);}
    catch(e){setErr('Network error');}
    setLoading(false);
  };

  const chart = data?.weaknesses;
  const sections = [
    {k:'quad',  l:'4× Weak',       c:'#f87171'},
    {k:'double',l:'2× Weak',       c:'#fb923c'},
    {k:'half',  l:'½× Resists',    c:'#4ade80'},
    {k:'quarter',l:'¼× Resists',   c:'#34d399'},
    {k:'immune',l:'Immune',        c:'#6b7280'},
  ];

  return (
    <div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14,alignItems:'flex-end'}}>
        <AutoInput label="Pokémon" value={poke} url="/bossinfo/search" onChange={setPoke} style={{flex:1,minWidth:140}}/>
        <div style={{minWidth:120}}>
          <label style={{display:'block',fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Tera Type</label>
          <select style={sel} value={tera} onChange={e=>setTera(e.target.value)}>
            <option value="">None</option>
            {TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <button onClick={lookup} disabled={loading} style={{padding:'6px 16px',background:'#5865f2',border:'none',borderRadius:6,color:'#fff',cursor:'pointer',fontSize:12,fontWeight:700,alignSelf:'flex-end',height:30}}>{loading?'…':'Lookup'}</button>
      </div>
      {err&&<div style={{color:'#f87171',fontSize:12,marginBottom:8}}>{err}</div>}
      {data&&<div>
        <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
          <span style={{fontSize:16,fontWeight:700,color:'#e4e6ef'}}>{data.name}</span>
          {(data.types||[]).map((t:string)=><TypeBadge key={t} t={t}/>)}
          {data.tera_type&&<><span style={{fontSize:11,color:'#6b7280'}}>Tera:</span><TypeBadge t={data.tera_type}/></>}
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {sections.map(s=>{
            const lst:string[] = chart?.[s.k]||[];
            if(!lst.length) return null;
            return (
              <div key={s.k} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:7,padding:'8px 12px'}}>
                <div style={{fontSize:10,fontWeight:700,color:s.c,marginBottom:5,textTransform:'uppercase',letterSpacing:'0.05em'}}>{s.l}</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4}}>{lst.map(t=><TypeBadge key={t} t={t}/>)}</div>
              </div>
            );
          })}
        </div>
      </div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BossInfoPage({guildId}:{guildId:string}){
  const [tab,setTab]=useState<'calc'|'weakness'>('calc');
  const [typechart,setTypechart]=useState<any>(null);
  const [sdReady,setSdReady]=useState(false);
  const [atkPanel,setAtkPanel]=useState<PanelState>(defaultPanel);
  const [defPanel,setDefPanel]=useState<PanelState>(defaultPanel);
  const [field,setField]=useState<FieldInput>({weather:'None',terrain:'None',doubles:false,screens:{atk:false,def:false}});
  const [result,setResult]=useState<any>(null);
  const [calcErr,setCalcErr]=useState('');
  const [loading,setLoading]=useState(false);

  // Load typechart on mount
  useEffect(()=>{
    fetch('/api/bossinfo/search?q=').then(()=>{}).catch(()=>{});
    // Fetch typechart via a proxy endpoint or inline type data
    setSdReady(true);
    // We use the inline type effectiveness table for client-side calcs
    // Build a minimal typechart from Showdown's damageTaken format
    const tc:any={};
    // Full Gen 9 type chart (damageTaken: 0=normal,1=super,2=resist,3=immune)
    const raw:any={
      Normal:{Ghost:3,Rock:2,Steel:2},
      Fire:{Fire:2,Water:2,Rock:2,Dragon:2,Grass:1,Ice:1,Bug:1,Steel:1,Fairy:1},
      Water:{Water:2,Grass:2,Dragon:2,Fire:1,Ice:1,Steel:1},
      Grass:{Fire:2,Ice:2,Poison:2,Flying:2,Bug:2,Water:1,Grass:1,Electric:1,Ground:1},
      Electric:{Electric:2,Grass:2,Dragon:2,Flying:1,Steel:1,Water:1},
      Ice:{Fire:2,Fighting:2,Rock:2,Steel:2,Ice:1},
      Fighting:{Flying:2,Psychic:2,Fairy:2,Bug:2,Dark:1,Rock:1,Steel:1},
      Poison:{Ground:2,Psychic:2,Poison:1,Grass:1,Fairy:1,Bug:1},
      Ground:{Water:2,Grass:2,Ice:2,Electric:3,Rock:1,Poison:1,Steel:1},
      Flying:{Electric:2,Ice:2,Rock:2,Ground:3,Fighting:1,Bug:1,Grass:1},
      Psychic:{Bug:2,Ghost:2,Dark:2,Fighting:1,Psychic:1},
      Bug:{Fire:2,Flying:2,Rock:2,Fighting:1,Ground:1,Grass:1},
      Rock:{Water:2,Grass:2,Fighting:2,Ground:2,Steel:2,Normal:1,Fire:1,Poison:1,Flying:1},
      Ghost:{Ghost:2,Dark:2,Normal:3,Fighting:3,Poison:1,Bug:1},
      Dragon:{Ice:2,Dragon:2,Fairy:2,Fire:1,Water:1,Grass:1,Electric:1},
      Dark:{Fighting:2,Bug:2,Fairy:2,Ghost:1,Dark:1,Psychic:3},
      Steel:{Fire:2,Fighting:2,Ground:2,Normal:1,Grass:1,Ice:1,Flying:1,Psychic:1,Bug:1,Rock:1,Dragon:1,Steel:1,Fairy:1,Poison:3},
      Fairy:{Poison:2,Steel:2,Fire:2,Fighting:1,Bug:1,Dark:1,Dragon:3},
    };
    // Convert to damageTaken format: for each defending type, for each attacking type, code
    const allTypes = Object.keys(raw);
    for (const defType of allTypes) {
      tc[defType]={damageTaken:{}};
    }
    for (const atkType of allTypes) {
      for (const defType of allTypes) {
        const v = raw[atkType]?.[defType];
        if (v===1) tc[defType].damageTaken[atkType]=1;       // super effective
        else if (v===2) tc[defType].damageTaken[atkType]=2;  // not very effective
        else if (v===3) tc[defType].damageTaken[atkType]=3;  // immune
        // else normal (0) = default
      }
    }
    setTypechart(tc);
  },[]);

  const fetchPokeData = useCallback(async (name:string):Promise<PokeData|null>=>{
    if(!name) return null;
    try {
      const r = await fetch(`/api/bossinfo/weakness?pokemon=${encodeURIComponent(name)}`);
      if(!r.ok) return null;
      const d = await r.json();
      if(d.error) return null;
      // We also need base stats - fetch from analyze endpoint
      const r2 = await fetch(`/api/bossinfo/analyze?pokemon=${encodeURIComponent(name)}`);
      if(!r2.ok) return null;
      const d2 = await r2.json();
      return {name:d2.name, types:d2.types, stats:d2.stats, bst:d2.bst, abilities:d2.abilities};
    } catch { return null; }
  },[]);

  // Auto-load pokemon data when name is set
  useEffect(()=>{
    if(atkPanel.name && !atkPanel.data){
      fetchPokeData(atkPanel.name).then(data=>{if(data)setAtkPanel(p=>({...p,data}));});
    }
  },[atkPanel.name]);
  useEffect(()=>{
    if(defPanel.name && !defPanel.data){
      fetchPokeData(defPanel.name).then(data=>{if(data)setDefPanel(p=>({...p,data}));});
    }
  },[defPanel.name]);

  // Also fetch move data when moveName changes
  useEffect(()=>{
    if(!atkPanel.moveName){setAtkPanel(p=>({...p,moveData:null}));return;}
    const url=`/api/bossinfo/damage?attacker=${encodeURIComponent(atkPanel.name||'Pikachu')}&defender=${encodeURIComponent(defPanel.name||'Pikachu')}&move=${encodeURIComponent(atkPanel.moveName)}`;
    // We'll get move type/cat from the server result; for now build a lightweight fetch
    fetch(`/api/bossinfo/movesearch?q=${encodeURIComponent(atkPanel.moveName)}`).catch(()=>{});
  },[atkPanel.moveName]);

  const runCalc = async()=>{
    if(!atkPanel.name||!defPanel.name||!atkPanel.moveName){
      setCalcErr('Select attacker, defender and move to calculate.'); return;
    }
    setCalcErr('');setLoading(true);setResult(null);
    try {
      // Fetch move data from server (we need base power, category, type)
      const r = await fetch(`/api/bossinfo/damage?attacker=${encodeURIComponent(atkPanel.name)}&defender=${encodeURIComponent(defPanel.name)}&move=${encodeURIComponent(atkPanel.moveName)}&zmove=${atkPanel.zmove}`);
      const serverResult = await r.json();
      if(serverResult.error){setCalcErr(serverResult.error);setLoading(false);return;}
      if(serverResult.immune){setResult({immune:true,mtyp:serverResult.move_type});setLoading(false);return;}

      // Now we have server-validated data, but we want to run the FULL client-side calc with all modifiers
      // Fetch full pokemon data if needed
      const [ad,dd] = await Promise.all([
        atkPanel.data||fetchPokeData(atkPanel.name),
        defPanel.data||fetchPokeData(defPanel.name),
      ]);
      if(!ad||!dd){setCalcErr('Could not load Pokémon data.');setLoading(false);return;}

      setAtkPanel(p=>({...p,data:ad}));
      setDefPanel(p=>({...p,data:dd}));

      // Use server-validated move data
      const moveData = {
        basePower: serverResult.min_dmg&&serverResult.max_dmg ? undefined : 0,
        category: serverResult.category,
        type: serverResult.move_type,
      };

      // Reverse-engineer base power from server result (before our modifiers)
      // Actually: use the server endpoint with custom EVs
      const r2 = await fetch(`/api/bossinfo/damage?attacker=${encodeURIComponent(atkPanel.name)}&defender=${encodeURIComponent(defPanel.name)}&move=${encodeURIComponent(atkPanel.moveName)}&zmove=${atkPanel.zmove}&atk_evs=${atkPanel.evs[serverResult.category==='Physical'?'atk':'spa']}&def_evs=${defPanel.evs[serverResult.category==='Physical'?'def':'spd']}`);
      const r2d = await r2.json();

      // For full Showdown parity with nature/item/weather etc, run client calc
      if(typechart&&ad&&dd){
        // Build a synthetic moveData with BP recovered from server
        // We need to know the real BP. Use the simple calc formula in reverse:
        // base = floor(floor(floor(42*bp*atkStat/defStat)/50)+2)
        // We'll instead just use the rolls approach with the server's min/max as a sanity check
        // and apply our modifiers on top of the server's base calculation
        const atkStat2 = serverResult.category==='Physical'
          ? calcStat(ad.stats.atk,252,31,false,1,100)
          : calcStat(ad.stats.spa,252,31,false,1,100);
        const defStat2 = serverResult.category==='Physical'
          ? calcStat(dd.stats.def,0,31,false,1,100)
          : calcStat(dd.stats.spd,0,31,false,1,100);
        const defHp2 = calcStat(dd.stats.hp,0,31,true,1,100);

        // recover base damage from server max (before roll)
        const serverMaxRaw = Math.round(serverResult.max_dmg);
        // max_dmg = applyMods(base) where applyMods includes stab+eff
        // base = max_dmg / eff / (stab>1?1.5:1) approximately
        // Better: recalculate clean with full formula
        const atkN = NATURES[atkPanel.nature]||NATURES.Hardy;
        const defN = NATURES[defPanel.nature]||NATURES.Hardy;
        const lv = atkPanel.level||100;
        const defLv = defPanel.level||100;
        const cat = serverResult.category;
        const mtyp = serverResult.move_type;

        const cleanAtk = cat==='Physical'
          ? calcStat(ad.stats.atk, atkPanel.evs.atk, atkPanel.ivs.atk, false, atkN.atk, lv)
          : calcStat(ad.stats.spa, atkPanel.evs.spa, atkPanel.ivs.spa, false, atkN.spa, lv);
        const cleanDef = cat==='Physical'
          ? calcStat(dd.stats.def, defPanel.evs.def, defPanel.ivs.def, false, defN.def, defLv)
          : calcStat(dd.stats.spd, defPanel.evs.spd, defPanel.ivs.spd, false, defN.spd, defLv);
        const cleanDefHp = calcStat(dd.stats.hp, defPanel.evs.hp, defPanel.ivs.hp, true, 1, defLv);

        // Recover BP from server's known result at 252/0 EVs
        const knownBase = serverResult.max_dmg; // already has stab+eff
        // Get base before stab+eff: divide out
        const eff2 = typeEff(mtyp, defPanel.teraType?[defPanel.teraType]:dd.types, typechart);
        const atkTypes2 = atkPanel.teraType?[atkPanel.teraType]:ad.types;
        const stab2 = atkTypes2.includes(mtyp)?(atkPanel.teraType?2:1.5):1;

        // Recover the "after-roll=100" pre-mod base value
        let baseFromServer = knownBase;
        if(stab2>1) baseFromServer = Math.round(baseFromServer/stab2);
        baseFromServer = Math.round(baseFromServer/eff2);

        // Scale to new EVs
        const scaledBase = Math.floor(baseFromServer * cleanAtk / atkStat2 * cleanDef===0?1:defStat2 / (cleanDef||1));
        // Actually use actual formula with recovered BP
        // BP recovery: base = floor(floor(floor(2*100/5+2)*bp*atkStat/defStat)/50)+2
        // => (base-2)*50 = floor(42*bp*atkStat/defStat)
        // => bp ~ (base-2)*50*defStat/42/atkStat
        const recovBP = Math.round((baseFromServer-2)*50*defStat2/(42*atkStat2));
        const newBase = recovBP>0 ? Math.floor(Math.floor(Math.floor(2*lv/5+2)*recovBP*cleanAtk/cleanDef)/50)+2 : baseFromServer;

        const itemMod2 = ITEM_MOD(atkPanel.item, cat, mtyp, atkTypes2);
        const expertBelt2 = atkPanel.item==='Expert Belt'&&eff2>1?1.2:1;
        const weatherMod2 = WEATHER_MOD(field.weather, mtyp);
        const screenMod2 = (cat==='Physical'&&field.screens.def)||(cat==='Special'&&field.screens.atk)?0.5:1;
        const burnMod2 = atkPanel.status==='Burn'&&cat==='Physical'?0.5:1;
        const spreadMod2 = field.doubles?0.75:1;
        const critMod2 = atkPanel.isCrit?1.5:1;
        const zmoveBP = atkPanel.zmove&&recovBP>0 ? _zPower(recovBP) : recovBP;
        const finalBase = zmoveBP>0 ? Math.floor(Math.floor(Math.floor(2*lv/5+2)*zmoveBP*cleanAtk/cleanDef)/50)+2 : newBase;

        function applyAllMods(d:number):number {
          d = Math.floor(d * spreadMod2);
          d = Math.floor(d * weatherMod2);
          d = Math.floor(d * critMod2);
          if(stab2>1) d = Math.floor(d * stab2);
          d = Math.floor(d * eff2);
          d = Math.floor(d * burnMod2);
          d = Math.floor(d * screenMod2);
          d = Math.floor(d * itemMod2);
          d = Math.floor(d * expertBelt2);
          return Math.max(1,d);
        }

        const rolls2:number[] = [];
        for(let r2=85;r2<=100;r2++) rolls2.push(applyAllMods(Math.floor(finalBase*r2/100)));
        const minD2=rolls2[0],maxD2=rolls2[15];
        const minP2=cleanDefHp?Math.floor(minD2/cleanDefHp*1000)/10:0;
        const maxP2=cleanDefHp?Math.floor(maxD2/cleanDefHp*1000)/10:0;

        const atkSpe2 = calcStat(ad.stats.spe, atkPanel.evs.spe, atkPanel.ivs.spe, false, atkN.spe, lv);
        const defSpe2 = calcStat(dd.stats.spe, defPanel.evs.spe, defPanel.ivs.spe, false, defN.spe, defLv);

        if(eff2===0){setResult({immune:true,mtyp});setLoading(false);return;}
        setResult({immune:false,rolls:rolls2,minD:minD2,maxD:maxD2,minP:minP2,maxP:maxP2,
          defHp:cleanDefHp,eff:eff2,stab:stab2>1,mtyp,cat,atkSpe:atkSpe2,defSpe:defSpe2,
          ohko:minP2>=100,twoHko:minP2>=50,possibleOhko:maxP2>=100,
          hitsToKo:[maxD2?Math.ceil(cleanDefHp/maxD2):99,minD2?Math.ceil(cleanDefHp/minD2):99]});
      } else {
        // Fallback: use server result
        const minP=serverResult.min_pct, maxP=serverResult.max_pct;
        setResult({immune:false,rolls:[serverResult.min_dmg,...Array(14).fill(Math.round((serverResult.min_dmg+serverResult.max_dmg)/2)),serverResult.max_dmg],
          minD:serverResult.min_dmg,maxD:serverResult.max_dmg,minP,maxP,defHp:serverResult.defender_hp,
          eff:serverResult.effectiveness,stab:serverResult.stab,mtyp:serverResult.move_type,cat:serverResult.category,
          atkSpe:serverResult.attacker_speed,defSpe:serverResult.defender_speed,
          ohko:minP>=100,twoHko:minP>=50,possibleOhko:maxP>=100,
          hitsToKo:serverResult.hits_to_ko});
      }
    } catch(e){ setCalcErr('Calculation failed. Check Pokémon and move names.'); }
    setLoading(false);
  };

  const tabs = [{id:'calc',label:'⚔️ Damage Calculator'},{id:'weakness',label:'🛡️ Weakness Lookup'}];

  return (
    <div className="animate-fade" style={{maxWidth:960,fontFamily:'inherit'}}>
      {/* Tab nav */}
      <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id as any)}
            style={{padding:'8px 20px',background:'none',border:'none',cursor:'pointer',
              color:tab===t.id?'#e4e6ef':'#6b7280',
              borderBottom:tab===t.id?'2px solid #5865f2':'2px solid transparent',
              fontWeight:tab===t.id?700:400,fontSize:13,transition:'all 0.15s',fontFamily:'inherit'}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab==='weakness'&&<WeaknessSection/>}

      {tab==='calc'&&(
        <div>
          {/* Field conditions */}
          <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:10,padding:12,marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:700,color:'#5865f2',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:8}}>Field Conditions</div>
            <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'center'}}>
              <div style={{display:'flex',gap:4,alignItems:'center'}}>
                <label style={{fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase'}}>Format</label>
                <label style={{fontSize:11,color:'#9ca3af',cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                  <input type="checkbox" checked={field.doubles} onChange={e=>setField(f=>({...f,doubles:e.target.checked}))}/> Doubles
                </label>
              </div>
              <div>
                <label style={{fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',marginRight:4}}>Weather</label>
                <select style={{...sel,display:'inline-block',width:'auto',minWidth:120}} value={field.weather} onChange={e=>setField(f=>({...f,weather:e.target.value}))}>
                  {WEATHERS.map(w=><option key={w}>{w}</option>)}
                </select>
              </div>
              <div>
                <label style={{fontSize:10,color:'#6b7280',fontWeight:700,textTransform:'uppercase',marginRight:4}}>Terrain</label>
                <select style={{...sel,display:'inline-block',width:'auto',minWidth:140}} value={field.terrain} onChange={e=>setField(f=>({...f,terrain:e.target.value}))}>
                  {TERRAINS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{display:'flex',gap:8}}>
                <label style={{fontSize:11,color:'#9ca3af',cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                  <input type="checkbox" checked={field.screens.atk} onChange={e=>setField(f=>({...f,screens:{...f.screens,atk:e.target.checked}}))}/>
                  <span>Atk Screen</span>
                </label>
                <label style={{fontSize:11,color:'#9ca3af',cursor:'pointer',display:'flex',alignItems:'center',gap:3}}>
                  <input type="checkbox" checked={field.screens.def} onChange={e=>setField(f=>({...f,screens:{...f.screens,def:e.target.checked}}))}/>
                  <span>Def Screen</span>
                </label>
              </div>
            </div>
          </div>

          {/* Two pokemon panels */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
            <PokemonPanel panel={atkPanel} setPanel={setAtkPanel} side="left" typechart={typechart}/>
            <PokemonPanel panel={defPanel} setPanel={setDefPanel} side="right" typechart={typechart}/>
          </div>

          {/* Calculate button */}
          <div style={{textAlign:'center',marginBottom:14}}>
            <button onClick={runCalc} disabled={loading}
              style={{padding:'10px 40px',background:'#5865f2',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,transition:'opacity 0.15s',opacity:loading?0.6:1,letterSpacing:'0.04em'}}>
              {loading?'Calculating…':'⚡ Calculate Damage'}
            </button>
          </div>

          {calcErr&&<div style={{background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.3)',borderRadius:7,padding:'8px 12px',color:'#f87171',fontSize:13,marginBottom:12}}>{calcErr}</div>}

          {result&&<DamageResult result={result} atkPanel={atkPanel} defPanel={defPanel}/>}
        </div>
      )}
    </div>
  );
}

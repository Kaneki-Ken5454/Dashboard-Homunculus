import { useState, useEffect, useRef, useCallback } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PokeStat { hp:number; atk:number; def:number; spa:number; spd:number; spe:number }
interface PokeData  { name:string; types:string[]; stats:PokeStat; bst:number; abilities:string[]; weaknesses?:any }

// ── Gen 9 type chart (inline — no extra API call) ────────────────────────────
// Format: for each attacking type, which defending types it hits super/resist/immune
// Stored as damageTaken per defending type: 1=2x, 2=0.5x, 3=immune
const TYPECHART: Record<string,Record<string,number>> = (() => {
  const se: Record<string,string[]> = {
    Fire:['Grass','Ice','Bug','Steel'],Water:['Fire','Ground','Rock'],
    Grass:['Water','Ground','Rock'],Electric:['Water','Flying'],
    Ice:['Grass','Ground','Flying','Dragon'],Fighting:['Normal','Ice','Rock','Dark','Steel'],
    Poison:['Grass','Fairy'],Ground:['Fire','Electric','Poison','Rock','Steel'],
    Flying:['Grass','Fighting','Bug'],Psychic:['Fighting','Poison'],
    Bug:['Grass','Psychic','Dark'],Rock:['Fire','Ice','Flying','Bug'],
    Ghost:['Psychic','Ghost'],Dragon:['Dragon'],Dark:['Psychic','Ghost'],
    Steel:['Ice','Rock','Fairy'],Fairy:['Fighting','Dragon','Dark'],
    Normal:[],
  };
  const nve: Record<string,string[]> = {
    Fire:['Fire','Water','Rock','Dragon'],Water:['Water','Grass','Dragon'],
    Grass:['Fire','Grass','Poison','Flying','Bug','Dragon','Steel'],
    Electric:['Electric','Grass','Dragon'],Ice:['Water','Ice'],
    Fighting:['Poison','Bug','Psychic','Flying','Fairy'],Poison:['Poison','Ground','Rock','Ghost'],
    Ground:['Grass','Bug'],Flying:['Electric','Rock','Steel'],
    Psychic:['Psychic','Steel'],Bug:['Fire','Fighting','Flying','Ghost','Steel','Fairy'],
    Rock:['Fighting','Ground','Steel'],Ghost:['Dark'],Dragon:['Steel'],
    Dark:['Fighting','Dark','Fairy'],Steel:['Fire','Water','Electric','Steel'],
    Fairy:['Fire','Poison','Steel'],Normal:['Rock','Steel'],
  };
  const imm: Record<string,string[]> = {
    Normal:['Ghost'],Electric:['Ground'],Fighting:['Ghost'],Poison:['Steel'],
    Ground:['Flying'],Ghost:['Normal','Fighting'],Dragon:['Fairy'],Dark:['Psychic'],
    Steel:['Poison'],Psychic:[],
  };
  const allTypes = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
  const tc: Record<string,Record<string,number>> = {};
  for (const dt of allTypes) tc[dt] = {};
  for (const at of allTypes) {
    for (const dt of (se[at]||[]))  tc[dt][at] = 1;   // super effective
    for (const dt of (nve[at]||[])) tc[dt][at] = 2;   // not very effective
    for (const dt of (imm[at]||[])) tc[dt][at] = 3;   // immune
  }
  return tc;
})();

const _DMG: Record<number,number> = {0:1,1:2,2:0.5,3:0};
const _Z_TABLE:[number,number][] = [[55,100],[65,120],[75,140],[85,160],[95,175],[100,180],[110,185],[125,190],[9999,195]];
const _zPower = (bp:number) => { for (const [t,p] of _Z_TABLE) if (bp<=t) return p; return 195; };

const NATURES: Record<string, Partial<PokeStat>> = {
  Hardy:{},Docile:{},Serious:{},Bashful:{},Quirky:{},
  Lonely:{atk:1.1,def:0.9},Brave:{atk:1.1,spe:0.9},Adamant:{atk:1.1,spa:0.9},Naughty:{atk:1.1,spd:0.9},
  Bold:{def:1.1,atk:0.9},Relaxed:{def:1.1,spe:0.9},Impish:{def:1.1,spa:0.9},Lax:{def:1.1,spd:0.9},
  Timid:{spe:1.1,atk:0.9},Hasty:{spe:1.1,def:0.9},Jolly:{spe:1.1,spa:0.9},Naive:{spe:1.1,spd:0.9},
  Modest:{spa:1.1,atk:0.9},Mild:{spa:1.1,def:0.9},Quiet:{spa:1.1,spe:0.9},Rash:{spa:1.1,spd:0.9},
  Calm:{spd:1.1,atk:0.9},Gentle:{spd:1.1,def:0.9},Sassy:{spd:1.1,spe:0.9},Careful:{spd:1.1,spa:0.9},
};

function getNat(name:string, stat:keyof PokeStat): number {
  return (NATURES[name] as any)?.[stat] ?? 1;
}

const ITEMS: string[] = [
  '(none)','Life Orb','Choice Band','Choice Specs','Choice Scarf',
  'Expert Belt','Muscle Band','Wise Glasses','Assault Vest','Eviolite',
  'Black Belt','Charcoal','Mystic Water','Miracle Seed','Magnet',
  'Never-Melt Ice','Poison Barb','Soft Sand','Hard Stone','Sharp Beak',
  'TwistedSpoon','Spell Tag','Dragon Fang','Black Glasses','Metal Coat',
  'Silk Scarf','Silver Powder','Rocky Helmet','Leftovers',
];
const ITEM_TYPE_BOOST: Record<string,string> = {
  'Charcoal':'Fire','Mystic Water':'Water','Miracle Seed':'Grass','Magnet':'Electric',
  'Never-Melt Ice':'Ice','Black Belt':'Fighting','Poison Barb':'Poison',
  'Soft Sand':'Ground','Sharp Beak':'Flying','TwistedSpoon':'Psychic',
  'Silver Powder':'Bug','Hard Stone':'Rock','Spell Tag':'Ghost',
  'Dragon Fang':'Dragon','Black Glasses':'Dark','Metal Coat':'Steel',
  'Silk Scarf':'Normal',
};

const WEATHERS = ['None','Sun','Rain','Sand','Snow','Harsh Sunshine','Heavy Rain'];
const TERRAINS = ['None','Electric','Grassy','Misty','Psychic'];
const ALL_TYPES = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison','Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
const TC_COLORS: Record<string,string> = {Fire:'#FF4422',Water:'#3399FF',Grass:'#33CC44',Electric:'#FFCC00',Ice:'#66CCFF',Fighting:'#CC3300',Poison:'#993399',Ground:'#CCAA55',Flying:'#88AAFF',Psychic:'#FF5599',Bug:'#AABB22',Rock:'#BBAA66',Ghost:'#664477',Dragon:'#7744FF',Dark:'#554433',Steel:'#AAAABB',Fairy:'#FFAACC',Normal:'#AAAA88'};

// ── Stat formula ──────────────────────────────────────────────────────────────
function calcStat(base:number, ev=0, iv=31, isHp=false, nature=1, lv=100): number {
  if (!base) return 0;
  if (isHp) return Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+lv+10;
  return Math.floor((Math.floor((2*base+iv+Math.floor(ev/4))*lv/100)+5)*nature);
}

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
    else if (m===0.5) out.half.push(at);
    else if (m===2) out.double.push(at);
    else if (m===4) out.quad.push(at);
  }
  return out;
}

// ── Full damage calc (client-side) ───────────────────────────────────────────
interface CalcOptions {
  atkPoke: PokeData; defPoke: PokeData;
  moveName: string; bp: number; category: string; moveType: string;
  atkEvs: PokeStat; defEvs: PokeStat; atkIvs: PokeStat; defIvs: PokeStat;
  atkNature: string; defNature: string;
  atkTera: string; defTera: string;
  atkItem: string; atkStatus: string;
  weather: string; doubles: boolean; atkScreen: boolean; defScreen: boolean;
  isCrit: boolean; zmove: boolean;
  atkLevel: number; defLevel: number;
}

function runCalc(o: CalcOptions) {
  const as = o.atkPoke.stats, ds = o.defPoke.stats;
  const atkTypes = o.atkTera ? [o.atkTera] : o.atkPoke.types;
  const defTypes = o.defTera ? [o.defTera] : o.defPoke.types;
  let bp = o.zmove ? _zPower(o.bp) : o.bp;
  if (!bp) return null;
  const cat = o.category;
  const mtyp = o.moveType;

  const eff = typeEff(mtyp, defTypes);
  if (eff === 0) return { immune:true, mtyp, cat };

  const atkStatVal = cat==='Physical'
    ? calcStat(as.atk, o.atkEvs.atk, o.atkIvs.atk, false, getNat(o.atkNature,'atk'), o.atkLevel)
    : calcStat(as.spa, o.atkEvs.spa, o.atkIvs.spa, false, getNat(o.atkNature,'spa'), o.atkLevel);
  const defStatVal = cat==='Physical'
    ? calcStat(ds.def, o.defEvs.def, o.defIvs.def, false, getNat(o.defNature,'def'), o.defLevel)
    : calcStat(ds.spd, o.defEvs.spd, o.defIvs.spd, false, getNat(o.defNature,'spd'), o.defLevel);
  const defHp = calcStat(ds.hp, o.defEvs.hp, o.defIvs.hp, true, 1, o.defLevel);

  // Showdown base damage
  const base = Math.floor(Math.floor(Math.floor(2*o.atkLevel/5+2)*bp*atkStatVal/defStatVal)/50)+2;

  // STAB (tera doubles stab if same type, grants stab if new type)
  let stab = 1;
  if (atkTypes.includes(mtyp)) {
    if (o.atkTera && o.atkPoke.types.includes(mtyp)) stab = 2; // adaptability-like tera + original type
    else stab = 1.5;
  }

  // Item modifier
  let itemMod = 1;
  if (o.atkItem==='Life Orb') itemMod = 5324/4096;
  else if (o.atkItem==='Choice Band' && cat==='Physical') itemMod = 1.5;
  else if (o.atkItem==='Choice Specs' && cat==='Special') itemMod = 1.5;
  else if (o.atkItem==='Muscle Band' && cat==='Physical') itemMod = 1.1;
  else if (o.atkItem==='Wise Glasses' && cat==='Special') itemMod = 1.1;
  else if (ITEM_TYPE_BOOST[o.atkItem]===mtyp) itemMod = 1.2;
  const expertBelt = o.atkItem==='Expert Belt' && eff>1 ? 1.2 : 1;

  // Weather
  let weatherMod = 1;
  if ((o.weather==='Sun'||o.weather==='Harsh Sunshine') && mtyp==='Fire')  weatherMod = 1.5;
  if ((o.weather==='Sun'||o.weather==='Harsh Sunshine') && mtyp==='Water') weatherMod = o.weather==='Harsh Sunshine' ? 0 : 0.5;
  if ((o.weather==='Rain'||o.weather==='Heavy Rain') && mtyp==='Water') weatherMod = 1.5;
  if ((o.weather==='Rain'||o.weather==='Heavy Rain') && mtyp==='Fire')  weatherMod = o.weather==='Heavy Rain' ? 0 : 0.5;

  // Other mods
  const spreadMod = o.doubles ? 0.75 : 1;
  const critMod   = o.isCrit  ? 1.5  : 1;
  const burnMod   = o.atkStatus==='Burn' && cat==='Physical' ? 0.5 : 1;
  const screenMod = ((cat==='Physical' && o.defScreen)||(cat==='Special' && o.atkScreen)) ? 0.5 : 1;

  function applyMods(d: number): number {
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

  const rolls: number[] = [];
  for (let r=85; r<=100; r++) rolls.push(applyMods(Math.floor(base*r/100)));

  const minD = rolls[0], maxD = rolls[15];
  const minP  = defHp ? Math.floor(minD/defHp*1000)/10 : 0;
  const maxP  = defHp ? Math.floor(maxD/defHp*1000)/10 : 0;
  const atkSpe = calcStat(as.spe, o.atkEvs.spe, o.atkIvs.spe, false, getNat(o.atkNature,'spe'), o.atkLevel);
  const defSpe = calcStat(ds.spe, o.defEvs.spe, o.defIvs.spe, false, getNat(o.defNature,'spe'), o.defLevel);

  return {
    immune:false, rolls, minD, maxD, minP, maxP, defHp,
    eff, stab:stab>1, mtyp, cat, base,
    atkSpe, defSpe, atkStatVal, defStatVal,
    ohko: minP>=100, twoHko: minP>=50, possibleOhko: maxP>=100,
    hitsToKo: [maxD?Math.ceil(defHp/maxD):99, minD?Math.ceil(defHp/minD):99] as [number,number],
  };
}

// ── UI Styles ─────────────────────────────────────────────────────────────────
const INP: React.CSSProperties = {
  padding:'5px 8px',background:'rgba(0,0,0,0.35)',border:'1px solid rgba(255,255,255,0.13)',
  borderRadius:6,color:'#dde1f5',fontSize:12,width:'100%',boxSizing:'border-box',
  outline:'none',
};
const NUM: React.CSSProperties = {...INP, width:48, textAlign:'center', padding:'5px 4px'};
const SEL: React.CSSProperties = {...INP, cursor:'pointer'};
const LBL: React.CSSProperties = {display:'block',fontSize:10,color:'#6b7280',fontWeight:700,
  textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3};

const STAT_ORDER: [keyof PokeStat, string][] = [
  ['hp','HP'],['atk','Atk'],['def','Def'],['spa','SpA'],['spd','SpD'],['spe','Spe']
];
const DEFAULT_EVS: PokeStat = {hp:0,atk:0,def:0,spa:0,spd:0,spe:0};
const DEFAULT_IVS: PokeStat = {hp:31,atk:31,def:31,spa:31,spd:31,spe:31};

// ── Components ────────────────────────────────────────────────────────────────
function TypeBadge({t}:{t:string}) {
  return <span style={{background:TC_COLORS[t]||'#555',color:'#fff',borderRadius:4,padding:'1px 8px',
    fontSize:11,fontWeight:700,flexShrink:0}}>{t}</span>;
}

function AutoInput({label,value,onChange,url,placeholder}:{
  label:string; value:string; onChange:(v:string)=>void; url:string; placeholder?:string;
}) {
  const [opts,setOpts] = useState<string[]>([]);
  const [show,setShow] = useState(false);
  const timer = useRef<any>(null);
  const search = (v:string) => {
    onChange(v);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < 2) { setOpts([]); setShow(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api${url}?q=${encodeURIComponent(v)}`);
        const d = await r.json();
        setOpts(d.results||[]);
        setShow(true);
      } catch {}
    }, 200);
  };
  return (
    <div style={{position:'relative'}}>
      {label && <label style={LBL}>{label}</label>}
      <input style={INP} value={value}
        onChange={e => search(e.target.value)}
        onBlur={() => setTimeout(() => setShow(false), 140)}
        onFocus={() => opts.length>0 && setShow(true)}
        placeholder={placeholder||label}
      />
      {show && opts.length>0 && (
        <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#181a28',
          border:'1px solid rgba(255,255,255,0.14)',borderRadius:7,zIndex:400,
          maxHeight:170,overflowY:'auto',marginTop:2,boxShadow:'0 8px 32px rgba(0,0,0,0.65)'}}>
          {opts.map(x => (
            <div key={x}
              onMouseDown={() => { onChange(x); setShow(false); setOpts([]); }}
              style={{padding:'6px 12px',cursor:'pointer',fontSize:12,color:'#d4d8f0'}}
              onMouseEnter={e => (e.currentTarget.style.background='rgba(88,101,242,0.22)')}
              onMouseLeave={e => (e.currentTarget.style.background='')}>
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
  name: string; data: PokeData|null; loading: boolean;
  level: number; nature: string; item: string;
  evs: PokeStat; ivs: PokeStat;
  teraType: string; status: string;
  moveName: string; moveBp: number; moveCat: string; moveType: string;
  zmove: boolean; isCrit: boolean;
}

function mkPanel(): PanelState {
  return {
    name:'', data:null, loading:false, level:100, nature:'Hardy', item:'(none)',
    evs:{...DEFAULT_EVS}, ivs:{...DEFAULT_IVS},
    teraType:'', status:'Healthy',
    moveName:'', moveBp:0, moveCat:'Physical', moveType:'Normal',
    zmove:false, isCrit:false,
  };
}

async function fetchFullPoke(name:string): Promise<PokeData|null> {
  if (!name.trim()) return null;
  try {
    const r = await fetch(`/api/bossinfo/analyze?pokemon=${encodeURIComponent(name)}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.error || !d.stats) return null;
    return { name:d.name, types:d.types, stats:d.stats as PokeStat, bst:d.bst, abilities:d.abilities, weaknesses:d.weaknesses };
  } catch { return null; }
}

async function fetchMoveData(moveName:string): Promise<{bp:number;cat:string;type:string}|null> {
  if (!moveName.trim()) return null;
  try {
    // Use the damage endpoint to get move metadata (attacker/defender don't matter for move info)
    const r = await fetch(`/api/bossinfo/damage?attacker=Pikachu&defender=Pikachu&move=${encodeURIComponent(moveName)}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.error) return null;
    // Recover BP from damage result: rearrange formula
    // base = floor(floor(42*bp*atkStat/defStat)/50)+2
    // For Pikachu vs Pikachu (252 atk): atkStat ~171(Phys) or ~175(Spec)
    // We just store what the server confirms
    return { bp:0, cat:d.category, type:d.move_type };
  } catch { return null; }
}

function PokemonPanel({ panel, onChange, side }: {
  panel: PanelState;
  onChange: (patch: Partial<PanelState>) => void;
  side: 'left'|'right';
}) {
  const d = panel.data;
  const lv = panel.level||100;
  const nat = NATURES[panel.nature] || {};

  // Computed live stats
  const computed: PokeStat|null = d ? {
    hp:  calcStat(d.stats.hp,  panel.evs.hp,  panel.ivs.hp,  true,  1,                        lv),
    atk: calcStat(d.stats.atk, panel.evs.atk, panel.ivs.atk, false, getNat(panel.nature,'atk'), lv),
    def: calcStat(d.stats.def, panel.evs.def, panel.ivs.def, false, getNat(panel.nature,'def'), lv),
    spa: calcStat(d.stats.spa, panel.evs.spa, panel.ivs.spa, false, getNat(panel.nature,'spa'), lv),
    spd: calcStat(d.stats.spd, panel.evs.spd, panel.ivs.spd, false, getNat(panel.nature,'spd'), lv),
    spe: calcStat(d.stats.spe, panel.evs.spe, panel.ivs.spe, false, getNat(panel.nature,'spe'), lv),
  } : null;

  const setEv = (stat:keyof PokeStat, v:number) =>
    onChange({ evs:{...panel.evs,[stat]:Math.max(0,Math.min(252,v||0))} });
  const setIv = (stat:keyof PokeStat, v:number) =>
    onChange({ ivs:{...panel.ivs,[stat]:Math.max(0,Math.min(31,v||0))} });
  const evTotal = Object.values(panel.evs).reduce((a,b)=>a+b,0);

  const natColor = (stat:keyof PokeStat) => {
    const v = (NATURES[panel.nature] as any)?.[stat];
    return v > 1 ? '#7ee787' : v < 1 ? '#f87171' : undefined;
  };

  return (
    <div style={{background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.09)',
      borderRadius:10,padding:13,display:'flex',flexDirection:'column',gap:9}}>

      <div style={{fontSize:10,fontWeight:800,color:'#5865f2',textTransform:'uppercase',letterSpacing:'0.09em'}}>
        Pokémon {side==='left'?'1':'2'}
        {panel.loading && <span style={{marginLeft:8,fontSize:10,color:'#6b7280'}}>loading…</span>}
        {d && <span style={{marginLeft:8,fontSize:10,color:'#4ade80'}}>✓ {d.name}</span>}
      </div>

      {/* Pokemon name autocomplete */}
      <AutoInput label="Pokémon" value={panel.name} url="/bossinfo/search" placeholder="e.g. Garchomp"
        onChange={async v => {
          // Set name only; useEffect in parent will load data
          onChange({ name:v, data:null });
        }}
      />

      {/* Types display */}
      {d && (
        <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
          {(panel.teraType ? [panel.teraType] : d.types).map(t => <TypeBadge key={t} t={t}/>)}
          {panel.teraType && <span style={{fontSize:10,color:'#6b7280'}}>← Tera</span>}
        </div>
      )}

      {/* Level + Nature */}
      <div style={{display:'grid',gridTemplateColumns:'80px 1fr',gap:8}}>
        <div>
          <label style={LBL}>Level</label>
          <input style={INP} type="number" min={1} max={100} value={panel.level}
            onChange={e => onChange({level:parseInt(e.target.value)||100})}/>
        </div>
        <div>
          <label style={LBL}>Nature</label>
          <select style={SEL} value={panel.nature} onChange={e => onChange({nature:e.target.value})}>
            {Object.keys(NATURES).map(n => {
              const nm = NATURES[n] as any;
              const up = Object.keys(nm).find(s => nm[s]>1);
              const dn = Object.keys(nm).find(s => nm[s]<1);
              const tag = up ? ` (+${up}/-${dn})` : '';
              return <option key={n} value={n}>{n}{tag}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Item + Tera */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div>
          <label style={LBL}>Item</label>
          <select style={SEL} value={panel.item} onChange={e => onChange({item:e.target.value})}>
            {ITEMS.map(i => <option key={i}>{i}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Tera Type</label>
          <select style={SEL} value={panel.teraType} onChange={e => onChange({teraType:e.target.value})}>
            <option value="">None</option>
            {ALL_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Status + flags */}
      <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:8,alignItems:'flex-end'}}>
        <div>
          <label style={LBL}>Status</label>
          <select style={SEL} value={panel.status} onChange={e => onChange({status:e.target.value})}>
            {['Healthy','Burn','Paralysis','Poison','Bad Poison','Freeze','Sleep'].map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#9ca3af',cursor:'pointer',paddingBottom:6,whiteSpace:'nowrap'}}>
          <input type="checkbox" checked={panel.isCrit} onChange={e => onChange({isCrit:e.target.checked})}/> Crit
        </label>
        <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'#9ca3af',cursor:'pointer',paddingBottom:6,whiteSpace:'nowrap'}}>
          <input type="checkbox" checked={panel.zmove} onChange={e => onChange({zmove:e.target.checked})}/> Z
        </label>
      </div>

      {/* EV / IV table */}
      <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:8}}>
        <div style={{display:'grid',gridTemplateColumns:'30px 1fr 46px 46px 38px',gap:'3px 5px',alignItems:'center',marginBottom:4}}>
          {['','','IV','EV','Stat'].map((h,i) => (
            <span key={i} style={{fontSize:9,color:'#374151',fontWeight:700,textTransform:'uppercase',textAlign:'center'}}>{h}</span>
          ))}
        </div>
        {STAT_ORDER.map(([key, label]) => {
          const base = d?.stats[key];
          const barPct = base ? Math.min(100, base/255*100) : 0;
          const cs = computed?.[key];
          const nc = natColor(key);
          return (
            <div key={key} style={{display:'grid',gridTemplateColumns:'30px 1fr 46px 46px 38px',gap:'3px 5px',alignItems:'center',marginBottom:3}}>
              <span style={{fontSize:10,color:'#6b7280',fontWeight:700,textAlign:'right',fontFamily:'monospace'}}>{label}</span>
              <div style={{height:5,background:'rgba(255,255,255,0.07)',borderRadius:2,overflow:'hidden',position:'relative'}}>
                <div style={{width:`${barPct}%`,height:'100%',background:'#5865f2',opacity:0.8,borderRadius:2}}/>
                {base != null && (
                  <span style={{position:'absolute',right:2,top:-1,fontSize:9,color:'#4b5563',fontFamily:'monospace'}}>{base}</span>
                )}
              </div>
              <input style={NUM} type="number" min={0} max={31}  value={panel.ivs[key]} onChange={e => setIv(key, parseInt(e.target.value))}/>
              <input style={NUM} type="number" min={0} max={252} value={panel.evs[key]} onChange={e => setEv(key, parseInt(e.target.value))}/>
              <span style={{fontSize:12,fontWeight:700,textAlign:'center',color:nc||'#c4c8e4',fontFamily:'monospace'}}>
                {cs ?? '—'}
              </span>
            </div>
          );
        })}
        <div style={{fontSize:10,color:evTotal>510?'#f87171':'#4b5563',textAlign:'right',marginTop:2}}>
          EVs: {evTotal}/510{evTotal>510&&' ⚠ over'}
        </div>
      </div>

      {/* Move */}
      <div style={{borderTop:'1px solid rgba(255,255,255,0.07)',paddingTop:8}}>
        <AutoInput label="Move" value={panel.moveName} url="/bossinfo/movesearch" placeholder="e.g. Earthquake"
          onChange={v => onChange({moveName:v})}
        />
        {panel.moveBp > 0 && (
          <div style={{display:'flex',gap:6,marginTop:5,flexWrap:'wrap',alignItems:'center'}}>
            <TypeBadge t={panel.moveType}/>
            <span style={{fontSize:11,color:'#6b7280'}}>{panel.moveCat}</span>
            <span style={{fontSize:11,color:'#6b7280'}}>BP {panel.zmove?_zPower(panel.moveBp):panel.moveBp}{panel.zmove?` → Z:${_zPower(panel.moveBp)}`:''}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Damage Result ─────────────────────────────────────────────────────────────
function DamageResult({ result, atk, def }: { result:any; atk:PanelState; def:PanelState }) {
  if (!result) return null;
  if (result.immune) return (
    <div style={{background:'rgba(0,0,0,0.3)',border:'1px solid rgba(255,255,255,0.09)',borderRadius:8,
      padding:'12px 16px',textAlign:'center',color:'#6b7280',fontSize:13}}>
      <strong style={{color:'#c4c8e4'}}>{def.name||'Defender'}</strong> is immune to <TypeBadge t={result.mtyp}/> moves
    </div>
  );

  const { minD,maxD,minP,maxP,defHp,rolls,ohko,twoHko,possibleOhko,hitsToKo,eff,stab,mtyp,cat,atkSpe,defSpe } = result;
  const ko = ohko?'Guaranteed OHKO':possibleOhko?'Possible OHKO':twoHko?'Guaranteed 2HKO':maxP>=50?'Possible 2HKO':'3HKO or more';
  const koColor = (ohko||possibleOhko)?'#f87171':(twoHko||maxP>=50)?'#fb923c':'#4ade80';
  const barColor = maxP>=100?'#f87171':maxP>=50?'#fb923c':'#5865f2';
  const fasterStr = atkSpe>defSpe
    ? `${atk.name||'Attacker'} goes first (${atkSpe} > ${defSpe})`
    : defSpe>atkSpe
    ? `${def.name||'Defender'} goes first (${defSpe} > ${atkSpe})`
    : `Speed tie (${atkSpe})`;

  return (
    <div style={{background:'rgba(255,255,255,0.035)',border:'1px solid rgba(255,255,255,0.1)',
      borderRadius:10,padding:16,display:'flex',flexDirection:'column',gap:12}}>

      {/* Header line */}
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap',fontSize:13}}>
        <strong style={{color:'#e4e6ef'}}>{atk.name}</strong>
        <span style={{color:'#4b5563'}}>used</span>
        <strong style={{color:'#818cf8'}}>{atk.moveName}{atk.zmove?' [Z]':''}</strong>
        <span style={{color:'#4b5563'}}>on</span>
        <strong style={{color:'#e4e6ef'}}>{def.name}</strong>
        <TypeBadge t={mtyp}/>
        <span style={{fontSize:11,color:'#6b7280'}}>{cat}</span>
        {eff!==1 && <span style={{fontSize:11,fontWeight:700,color:eff>1?'#fb923c':'#4ade80'}}>{eff}×</span>}
        {stab && <span style={{fontSize:10,background:'rgba(129,140,248,0.2)',color:'#818cf8',borderRadius:3,padding:'1px 5px',fontWeight:700}}>STAB</span>}
        {atk.isCrit && <span style={{fontSize:10,background:'rgba(251,191,36,0.2)',color:'#fbbf24',borderRadius:3,padding:'1px 5px',fontWeight:700}}>CRIT</span>}
      </div>

      {/* Main result */}
      <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
          <span style={{fontSize:22,fontWeight:800,color:'#fff',fontFamily:'monospace',letterSpacing:'-0.02em'}}>
            {minP.toFixed(1)}% — {maxP.toFixed(1)}%
          </span>
          <span style={{fontSize:14,fontWeight:700,color:koColor}}>{ko}</span>
        </div>
        <div style={{height:9,background:'rgba(255,255,255,0.07)',borderRadius:5,overflow:'hidden',position:'relative',marginBottom:4}}>
          <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,minP)}%`,background:barColor,opacity:0.45,borderRadius:5}}/>
          <div style={{position:'absolute',left:`${Math.min(100,minP)}%`,top:0,bottom:0,
            width:`${Math.max(0,Math.min(100,maxP)-Math.min(100,minP))}%`,background:barColor,borderRadius:5}}/>
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#6b7280'}}>
          <span>{minD}–{maxD} HP / {defHp} HP</span>
          <span>
            {hitsToKo[0]===hitsToKo[1]
              ? `${hitsToKo[0]} hit${hitsToKo[0]>1?'s':''} to KO`
              : `${hitsToKo[0]}–${hitsToKo[1]} hits to KO`}
          </span>
        </div>
      </div>

      {/* Rolls */}
      <div>
        <div style={{fontSize:9,color:'#374151',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:5}}>
          Damage Rolls (85–100%)
        </div>
        <div style={{display:'flex',flexWrap:'wrap',gap:3}}>
          {(rolls as number[]).map((r,i) => (
            <span key={i} style={{
              fontSize:10,fontFamily:'monospace',
              color: r===maxD?'#818cf8': r===minD?'#f87171':'#4b5563',
              background:'rgba(255,255,255,0.03)',borderRadius:3,padding:'2px 5px',
              border: (r===maxD||r===minD)?'1px solid currentColor':'1px solid rgba(255,255,255,0.06)',
            }}>{r}</span>
          ))}
        </div>
      </div>

      {/* Speed */}
      <div style={{background:'rgba(255,255,255,0.03)',borderRadius:6,padding:'6px 10px',
        fontSize:11,color:'#6b7280',display:'flex',alignItems:'center',gap:6}}>
        <span>⚡</span><span>{fasterStr}</span>
      </div>
    </div>
  );
}

// ── Weakness Section ──────────────────────────────────────────────────────────
function WeaknessSection() {
  const [poke,setPoke]    = useState('');
  const [tera,setTera]    = useState('');
  const [data,setData]    = useState<any>(null);
  const [loading,setLoad] = useState(false);
  const [err,setErr]      = useState('');

  const lookup = async () => {
    if (!poke.trim()) return;
    setLoad(true); setErr(''); setData(null);
    try {
      const r  = await fetch(`/api/bossinfo/weakness?pokemon=${encodeURIComponent(poke)}${tera?`&tera=${encodeURIComponent(tera)}`:''}`);
      const d  = await r.json();
      if (d.error) setErr(d.error); else setData(d);
    } catch { setErr('Network error'); }
    setLoad(false);
  };

  const sections = [
    {k:'quad',   label:'4× Weak',      color:'#f87171'},
    {k:'double', label:'2× Weak',      color:'#fb923c'},
    {k:'half',   label:'½× Resists',   color:'#4ade80'},
    {k:'quarter',label:'¼× Resists',   color:'#34d399'},
    {k:'immune', label:'Immune',       color:'#6b7280'},
  ];

  return (
    <div>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14,alignItems:'flex-end'}}>
        <div style={{flex:1,minWidth:140}}>
          <AutoInput label="Pokémon" value={poke} url="/bossinfo/search" onChange={setPoke} placeholder="e.g. Garchomp"/>
        </div>
        <div style={{minWidth:120}}>
          <label style={LBL}>Tera Type</label>
          <select style={SEL} value={tera} onChange={e=>setTera(e.target.value)}>
            <option value="">None</option>
            {ALL_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
        <button onClick={lookup} disabled={loading}
          style={{padding:'6px 18px',background:'#5865f2',border:'none',borderRadius:7,color:'#fff',
            cursor:'pointer',fontSize:12,fontWeight:700,alignSelf:'flex-end',height:31,
            opacity:loading?0.6:1}}>
          {loading?'…':'Lookup'}
        </button>
      </div>
      {err && <div style={{color:'#f87171',fontSize:12,marginBottom:8}}>{err}</div>}
      {data && (
        <div>
          <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
            <span style={{fontSize:16,fontWeight:700,color:'#e4e6ef'}}>{data.name}</span>
            {(data.types||[]).map((t:string) => <TypeBadge key={t} t={t}/>)}
            {data.tera_type && <><span style={{fontSize:10,color:'#6b7280'}}>Tera:</span><TypeBadge t={data.tera_type}/></>}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:6}}>
            {sections.map(s => {
              const lst:string[] = data.weaknesses?.[s.k]||[];
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
  const [tab, setTab]       = useState<'calc'|'weakness'>('calc');
  const [atk, setAtkRaw]    = useState<PanelState>(mkPanel);
  const [def, setDefRaw]    = useState<PanelState>(mkPanel);
  const [field, setField]   = useState({ weather:'None', terrain:'None', doubles:false, atkScreen:false, defScreen:false });
  const [result, setResult] = useState<any>(null);
  const [calcErr, setErr]   = useState('');
  const [running, setRun]   = useState(false);

  // Patch helpers with auto-clear result on meaningful change
  const setAtk = (p: Partial<PanelState>) => { setAtkRaw(prev => ({...prev,...p})); setResult(null); setErr(''); };
  const setDef = (p: Partial<PanelState>) => { setDefRaw(prev => ({...prev,...p})); setResult(null); setErr(''); };

  // Auto-load pokemon data — use refs so we only fetch when the NAME itself changes,
  // not on every render triggered by other state (EVs, natures, etc.)
  const loadedAtkName = useRef('');
  const loadedDefName = useRef('');

  useEffect(() => {
    if (!atk.name || atk.name === loadedAtkName.current) return;
    loadedAtkName.current = atk.name;
    setAtkRaw(p => ({...p, loading:true, data:null}));
    fetchFullPoke(atk.name).then(data => {
      setAtkRaw(p => ({...p, data, loading:false}));
    });
  }, [atk.name]);

  useEffect(() => {
    if (!def.name || def.name === loadedDefName.current) return;
    loadedDefName.current = def.name;
    setDefRaw(p => ({...p, loading:true, data:null}));
    fetchFullPoke(def.name).then(data => {
      setDefRaw(p => ({...p, data, loading:false}));
    });
  }, [def.name]);

  // Fetch move data when move name changes
  useEffect(() => {
    if (!atk.moveName) { setAtkRaw(p=>({...p,moveBp:0,moveCat:'Physical',moveType:'Normal'})); return; }
    // Get move metadata from server damage endpoint
    fetch(`/api/bossinfo/damage?attacker=${encodeURIComponent(atk.name||'Pikachu')}&defender=${encodeURIComponent(def.name||'Pikachu')}&move=${encodeURIComponent(atk.moveName)}`)
      .then(r => r.json())
      .then(d => {
        if (!d.error) {
          // Reconstruct BP from the result using known stat values
          // We'll just store category and type; BP recovery happens in runCalc via server
          setAtkRaw(p => ({...p, moveCat:d.category||'Physical', moveType:d.move_type||'Normal'}));
        }
      }).catch(()=>{});
  }, [atk.moveName]);

  const calculate = async () => {
    if (!atk.name || !def.name || !atk.moveName) {
      setErr('Enter Pokémon for both sides and a move to calculate.'); return;
    }
    setErr(''); setRun(true); setResult(null);
    // Fetch on-demand in case data wasn't auto-loaded yet
    const atkData = atk.data ?? await fetchFullPoke(atk.name);
    const defData = def.data ?? await fetchFullPoke(def.name);
    if (atkData) setAtkRaw(p => ({...p, data:atkData, loading:false}));
    if (defData) setDefRaw(p => ({...p, data:defData, loading:false}));
    if (!atkData || !defData) {
      setErr(`Could not load data for "${!atkData ? atk.name : def.name}". Check the spelling.`);
      setRun(false); return;
    }

    try {
      // Get server-validated move BP and metadata
      const r = await fetch(`/api/bossinfo/damage?attacker=${encodeURIComponent(atk.name)}&defender=${encodeURIComponent(def.name)}&move=${encodeURIComponent(atk.moveName)}&zmove=${atk.zmove}`);
      const srv = await r.json();
      if (srv.error) { setErr(srv.error); setRun(false); return; }
      if (srv.immune) { setResult({immune:true, mtyp:srv.move_type}); setRun(false); return; }

      // Recover real base power from server's default calc (252 atk, 0 def)
      // Server uses 252 EVs atk, 0 EVs def — we know the formula:
      // base = floor(floor(floor(2*100/5+2) * bp * atkStat / defStat) / 50) + 2 = floor(42*bp*atk/def/50)+2
      // server maxD = applyMods(base) for roll=100/100
      // Work backwards to get bp, then run our own calc with custom EVs
      const cat = srv.category as string;
      const mtyp = srv.move_type as string;
      const atkStatDefault = cat==='Physical' ? calcStat(atkData.stats.atk,252) : calcStat(atkData.stats.spa,252);
      const defStatDefault = cat==='Physical' ? calcStat(defData.stats.def,0)   : calcStat(defData.stats.spd,0);
      const srvEff = typeEff(mtyp, defData.types);
      const srvStab = atkData.types.includes(mtyp) ? 1.5 : 1;
      // Unwrap mods from server's maxD: maxD has stab+eff applied
      let baseNoMods = srv.max_dmg;
      if (srvStab > 1) baseNoMods = Math.round(baseNoMods / srvStab);
      if (srvEff  > 0) baseNoMods = Math.round(baseNoMods / srvEff);
      // baseNoMods ≈ floor(42*bp*atkStat/defStat/50)+2
      // => bp ≈ (baseNoMods-2)*50*defStat / (42*atkStat)
      const recoveredBP = Math.max(1, Math.round((baseNoMods - 2) * 50 * defStatDefault / (42 * atkStatDefault)));

      const res = runCalc({
        atkPoke: atkData, defPoke: defData,
        moveName: atk.moveName, bp: recoveredBP, category: cat, moveType: mtyp,
        atkEvs: atk.evs, defEvs: def.evs, atkIvs: atk.ivs, defIvs: def.ivs,
        atkNature: atk.nature, defNature: def.nature,
        atkTera: atk.teraType, defTera: def.teraType,
        atkItem: atk.item, atkStatus: atk.status,
        weather: field.weather, doubles: field.doubles,
        atkScreen: field.atkScreen, defScreen: field.defScreen,
        isCrit: atk.isCrit, zmove: atk.zmove,
        atkLevel: atk.level, defLevel: def.level,
      });

      // Update move display
      setAtkRaw(p => ({...p, moveBp:recoveredBP, moveCat:cat, moveType:mtyp}));
      setResult(res);
    } catch (e) {
      setErr('Calculation failed. Verify Pokémon and move names.');
    }
    setRun(false);
  };

  const TABS = [{id:'calc',label:'⚔️ Damage Calculator'},{id:'weakness',label:'🛡️ Weakness Lookup'}];

  return (
    <div className="animate-fade" style={{maxWidth:960}}>
      {/* Tabs */}
      <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            style={{padding:'8px 20px',background:'none',border:'none',cursor:'pointer',fontFamily:'inherit',
              color:tab===t.id?'#e4e6ef':'#6b7280',fontSize:13,fontWeight:tab===t.id?700:400,
              borderBottom:tab===t.id?'2px solid #5865f2':'2px solid transparent',transition:'all 0.15s'}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'weakness' && <WeaknessSection/>}

      {tab === 'calc' && (
        <div>
          {/* Field conditions */}
          <div style={{background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.08)',
            borderRadius:9,padding:'10px 14px',marginBottom:14}}>
            <div style={{fontSize:9,fontWeight:800,color:'#5865f2',textTransform:'uppercase',letterSpacing:'0.09em',marginBottom:8}}>
              Field Conditions
            </div>
            <div style={{display:'flex',gap:16,flexWrap:'wrap',alignItems:'center',fontSize:11,color:'#9ca3af'}}>
              <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
                <input type="checkbox" checked={field.doubles}
                  onChange={e => setField(f=>({...f,doubles:e.target.checked}))}/> Doubles
              </label>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:9,fontWeight:700,color:'#4b5563',textTransform:'uppercase'}}>Weather</span>
                <select style={{...SEL,width:'auto',minWidth:120}} value={field.weather}
                  onChange={e => setField(f=>({...f,weather:e.target.value}))}>
                  {WEATHERS.map(w=><option key={w}>{w}</option>)}
                </select>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:9,fontWeight:700,color:'#4b5563',textTransform:'uppercase'}}>Terrain</span>
                <select style={{...SEL,width:'auto',minWidth:120}} value={field.terrain}
                  onChange={e => setField(f=>({...f,terrain:e.target.value}))}>
                  {TERRAINS.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
                <input type="checkbox" checked={field.atkScreen}
                  onChange={e => setField(f=>({...f,atkScreen:e.target.checked}))}/> Attacker Screen
              </label>
              <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
                <input type="checkbox" checked={field.defScreen}
                  onChange={e => setField(f=>({...f,defScreen:e.target.checked}))}/> Defender Screen
              </label>
            </div>
          </div>

          {/* Pokemon panels */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,marginBottom:14}}>
            <PokemonPanel panel={atk} onChange={setAtk} side="left"/>
            <PokemonPanel panel={def} onChange={setDef} side="right"/>
          </div>

          {/* Calculate button */}
          <div style={{textAlign:'center',marginBottom:14}}>
            <button onClick={calculate} disabled={running}
              style={{padding:'11px 44px',background:'linear-gradient(135deg,#5865f2,#7c3aed)',
                border:'none',borderRadius:9,color:'#fff',cursor:'pointer',fontSize:14,fontWeight:700,
                boxShadow:'0 4px 16px rgba(88,101,242,0.4)',transition:'all 0.15s',opacity:running?0.6:1,
                letterSpacing:'0.03em'}}>
              {running ? 'Calculating…' : '⚡ Calculate Damage'}
            </button>
          </div>

          {calcErr && (
            <div style={{background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.25)',
              borderRadius:7,padding:'9px 14px',color:'#f87171',fontSize:13,marginBottom:12}}>
              {calcErr}
            </div>
          )}

          <DamageResult result={result} atk={atk} def={def}/>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Stats { hp:number;atk:number;def:number;spa:number;spd:number;spe:number }
interface Weakness { quad:string[];double:string[];half:string[];quarter:string[];immune:string[] }
interface BossMove { level?:number;name:string;type:string;category:string;base_power:number;accuracy:string|number;stab?:boolean;z_power?:number;score?:number }
interface Analysis { name:string;types:string[];stats:Stats;bst:number;abilities:string[];tier:string;role:string;weaknesses:Weakness;tera_weaknesses?:Weakness;tera_type?:string;level_moves:BossMove[];top_moves:BossMove[];atk_stat:number;spa_stat:number }
interface DmgResult { error?:string|null;immune?:boolean;min_pct:number;max_pct:number;min_dmg:number;max_dmg:number;defender_hp:number;effectiveness:number;stab:boolean;ohko:boolean;two_hko:boolean;hits_to_ko:[number,number];category:string;move_type:string;attacker_speed:number;defender_speed:number }
interface CtrResult { error?:string|null;verdict:string;verdict_desc:string;faster:string;attacker_speed:number;defender_speed:number;atk_move:string;atk_min_pct:number;atk_max_pct:number;def_move:string;def_min_pct:number;def_max_pct:number;def_survives_1:boolean;def_survives_2:boolean;attacker:string;defender:string }
interface BestCtr extends CtrResult { candidate:string;score:number }
interface SavedCalc { id:number;calc_type:string;label:string;data:any;created_by:string;created_at:string }
interface Popular { pokemon_key:string;cnt:number }

// ── Constants ──────────────────────────────────────────────────────────────────
const TC:Record<string,string>={Fire:'#FF4422',Water:'#3399FF',Grass:'#33CC44',Electric:'#FFCC00',Ice:'#66CCFF',Fighting:'#CC3300',Poison:'#993399',Ground:'#CCAA55',Flying:'#88AAFF',Psychic:'#FF5599',Bug:'#AABB22',Rock:'#BBAA66',Ghost:'#664477',Dragon:'#7744FF',Dark:'#554433',Steel:'#AAAABB',Fairy:'#FFAACC',Normal:'#AAAA88'};
const TYPES=Object.keys(TC);
const TABS=['Stats','Weaknesses','Moves'] as const;
type Tab=typeof TABS[number];
type Sec='analyze'|'damage'|'counter'|'history';

async function api(path:string){
  const r=await fetch(`/api${path}`);
  if(!r.ok&&r.status!==404&&r.status!==400){
    const t=await r.text();
    try{return JSON.parse(t);}catch{return{error:t};}
  }
  return r.json();
}

// ── Mini components ────────────────────────────────────────────────────────────
const TB=({t}:{t:string})=><span style={{background:TC[t]||'#555',color:'#fff',borderRadius:4,padding:'2px 9px',fontSize:12,fontWeight:700,flexShrink:0}}>{t}</span>;
const Bar=({n,v,max=255}:{n:string;v:number;max?:number})=>{const p=Math.min(100,(v/max)*100);const c=p>68?'#3BA55D':p>38?'#FAA81A':'#ED4245';return <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}><span style={{width:28,fontSize:11,color:'var(--text-muted)',textAlign:'right'}}>{n}</span><div style={{flex:1,height:8,background:'var(--elevated)',borderRadius:4,overflow:'hidden'}}><div style={{width:`${p}%`,height:'100%',background:c,borderRadius:4}}/></div><span style={{width:26,fontSize:11,color:'var(--text)',textAlign:'right',fontWeight:600}}>{v}</span></div>;};
const Prog=({p}:{p:number})=>{const c=p>=100?'#ED4245':p>=50?'#FAA81A':'#5865F2';return <div style={{height:6,background:'var(--elevated)',borderRadius:3,marginTop:3,overflow:'hidden'}}><div style={{width:`${Math.min(100,p)}%`,height:'100%',background:c}}/></div>;};
const Chip=({v,color}:{v:string;color:string})=><span style={{background:color,color:'#fff',borderRadius:4,padding:'2px 8px',fontWeight:700,fontSize:12}}>{v}</span>;
const VC:Record<string,string>={'Strong Counter':'#3BA55D','Soft Check':'#FAA81A','Speed Check':'#5865F2','Bad Matchup':'#ED4245'};

function AutoInput({label,value,onChange,placeholder,searchUrl}:{label:string;value:string;onChange:(v:string)=>void;placeholder?:string;searchUrl?:string}){
  const [s,setS]=useState<string[]>([]);const [show,setShow]=useState(false);const t=useRef<any>(null);
  const endpoint=searchUrl||'/bossinfo/search';
  const h=(v:string)=>{onChange(v);if(t.current)clearTimeout(t.current);if(v.length<2){setS([]);return;}t.current=setTimeout(async()=>{const d=await api(`${endpoint}?q=${encodeURIComponent(v)}`);setS(d.results||[]);setShow(true);},250);};
  return <div style={{position:'relative',flex:1,minWidth:140}}>
    <label style={{display:'block',fontSize:11,color:'var(--text-muted)',marginBottom:4,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</label>
    <input className="inp" value={value} onChange={e=>h(e.target.value)} onBlur={()=>setTimeout(()=>setShow(false),150)} onFocus={()=>s.length>0&&setShow(true)} placeholder={placeholder}/>
    {show&&s.length>0&&<div style={{position:'absolute',top:'100%',left:0,right:0,background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:8,zIndex:200,maxHeight:180,overflowY:'auto',marginTop:2,boxShadow:'0 8px 24px rgba(0,0,0,0.5)'}}>
      {s.map(x=><div key={x} onMouseDown={()=>{onChange(x);setShow(false);setS([]);}} style={{padding:'7px 12px',cursor:'pointer',fontSize:13}} onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.06)')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>{x}</div>)}
    </div>}
  </div>;
}

// ── Tabs ───────────────────────────────────────────────────────────────────────
function StatsTab({d}:{d:Analysis}){
  const col=TC[d.types[0]]||'#5865F2';
  return <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
    <div style={{flex:'1 1 200px',background:'var(--surface)',border:'1px solid var(--border)',borderLeft:`3px solid ${col}`,borderRadius:8,padding:14}}>
      <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:8,fontWeight:600}}>BASE STATS · BST {d.bst}</div>
      <Bar n="HP"  v={d.stats.hp}/><Bar n="Atk" v={d.stats.atk}/><Bar n="Def" v={d.stats.def}/>
      <Bar n="SpA" v={d.stats.spa}/><Bar n="SpD" v={d.stats.spd}/><Bar n="Spe" v={d.stats.spe}/>
    </div>
    <div style={{flex:'1 1 180px',display:'flex',flexDirection:'column',gap:10}}>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:12}}>
        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Type</div>
        <div style={{display:'flex',gap:5}}>{d.types.map(t=><TB key={t} t={t}/>)}</div>
      </div>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:12}}>
        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Tier · Role</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}><span style={{fontSize:12,fontWeight:700,color:'var(--text)'}}>{d.tier}</span><span style={{fontSize:12,color:'var(--text-muted)'}}>·</span><span style={{fontSize:12,color:'var(--text-muted)'}}>{d.role}</span></div>
      </div>
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:12}}>
        <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Abilities</div>
        {d.abilities.map(a=><div key={a} style={{fontSize:12,color:'var(--text)',marginBottom:2}}>{a}</div>)}
      </div>
    </div>
  </div>;
}

function WeakTab({d,tera}:{d:Analysis;tera?:string}){
  const chart=tera&&d.tera_weaknesses?d.tera_weaknesses:d.weaknesses;
  const sections=[{k:'quad' as keyof Weakness,l:'4× Weak',c:'#ED4245'},{k:'double' as keyof Weakness,l:'2× Weak',c:'#FAA81A'},{k:'half' as keyof Weakness,l:'½× Resists',c:'#3BA55D'},{k:'quarter' as keyof Weakness,l:'¼× Resists',c:'#23a55a'},{k:'immune' as keyof Weakness,l:'Immune',c:'#4f545c'}];
  return <div style={{display:'flex',flexDirection:'column',gap:8}}>
    {tera&&<div style={{background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:6,padding:'6px 10px',fontSize:12,display:'flex',gap:6,alignItems:'center'}}>Tera type active: <TB t={tera}/></div>}
    {sections.map(s=>(chart[s.k] as string[]).length>0&&<div key={s.k} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px'}}>
      <div style={{fontSize:11,fontWeight:700,color:s.c,marginBottom:6,textTransform:'uppercase',letterSpacing:'0.04em'}}>{s.l}</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:5}}>{(chart[s.k] as string[]).map(t=><TB key={t} t={t}/>)}</div>
    </div>)}
  </div>;
}

function MovesTab({d}:{d:Analysis}){
  const [view,setView]=useState<'top'|'level'>('top');
  return <div>
    <div style={{display:'flex',gap:4,marginBottom:12}}>
      {(['top','level'] as const).map(v=><button key={v} onClick={()=>setView(v)} style={{padding:'4px 12px',background:view===v?'var(--primary-subtle)':'var(--elevated)',border:view===v?'1px solid #818cf8':'1px solid var(--border)',borderRadius:6,cursor:'pointer',fontSize:12,color:view===v?'#818cf8':'var(--text-muted)',fontWeight:view===v?700:400}}>{v==='top'?'Top Competitive':'Level-Up'}</button>)}
    </div>
    {view==='top'&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:4}}>Atk@252: {d.atk_stat} · SpA@252: {d.spa_stat}</div>
      {d.top_moves.map((m,i)=><div key={i} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'10px 12px',display:'flex',gap:10,alignItems:'center'}}>
        <span style={{fontSize:16,color:'var(--primary)',fontWeight:800,width:22}}>#{i+1}</span>
        <div style={{flex:1}}>
          <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:3}}><span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{m.name}</span>{m.stab&&<span style={{fontSize:10,background:'var(--primary-subtle)',color:'#818cf8',borderRadius:3,padding:'1px 5px',fontWeight:700}}>STAB</span>}</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',fontSize:11,color:'var(--text-muted)'}}><TB t={m.type}/><span>{m.category}</span><span>BP {m.base_power}</span><span>Z {m.z_power}</span><span>Acc {m.accuracy==='always'?'—':`${m.accuracy}%`}</span></div>
        </div>
        <div style={{textAlign:'right'}}><div style={{fontSize:10,color:'var(--text-faint)'}}>Score</div><div style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>{m.score?.toFixed(0)}</div></div>
      </div>)}
    </div>}
    {view==='level'&&(d.level_moves?.length?<div style={{overflowX:'auto'}}><table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
      <thead><tr style={{background:'var(--elevated)'}}>{['Lv','Move','Type','Cat','BP','Acc'].map(h=><th key={h} style={{padding:'6px 10px',textAlign:'left',color:'var(--text-muted)',fontWeight:600,fontSize:11,textTransform:'uppercase',letterSpacing:'0.04em'}}>{h}</th>)}</tr></thead>
      <tbody>{d.level_moves.map((m,i)=><tr key={i} style={{borderBottom:'1px solid var(--border)',background:i%2?'transparent':'rgba(255,255,255,0.01)'}}>
        <td style={{padding:'5px 10px',color:'var(--text-faint)'}}>{m.level}</td>
        <td style={{padding:'5px 10px',fontWeight:600,color:'var(--text)'}}>{m.name}</td>
        <td style={{padding:'5px 10px'}}><TB t={m.type}/></td>
        <td style={{padding:'5px 10px',color:'var(--text-muted)'}}>{m.category}</td>
        <td style={{padding:'5px 10px',color:'var(--text)'}}>{m.base_power||'—'}</td>
        <td style={{padding:'5px 10px',color:'var(--text-muted)'}}>{m.accuracy==='always'?'—':`${m.accuracy}%`}</td>
      </tr>)}</tbody>
    </table></div>:<div style={{color:'var(--text-muted)',fontSize:13,padding:12}}>No level-up moves found.</div>)}
  </div>;
}

// ── Sections ───────────────────────────────────────────────────────────────────
function AnalyzeSection({guildId}:{guildId:string}){
  const [poke,setPoke]=useState('');const [tera,setTera]=useState('');const [data,setData]=useState<Analysis|null>(null);const [loading,setLoading]=useState(false);const [err,setErr]=useState('');const [tab,setTab]=useState<Tab>('Stats');
  const run=async()=>{if(!poke.trim())return;setLoading(true);setErr('');setData(null);
    const q=`/bossinfo/analyze?pokemon=${encodeURIComponent(poke)}`+(tera?`&tera=${encodeURIComponent(tera)}`:'')+(guildId?`&guild_id=${guildId}`:'');
    const d=await api(q);setLoading(false);
    if(d.error)setErr(d.error);
    else{setData(d);setTab('Stats');
      // Log pokemon lookup to server DB
      if(guildId) api(`/bossinfo/db/popular?guild_id=${guildId}&pokemon_key=${encodeURIComponent(poke.toLowerCase())}`).catch(()=>{});
    }};
  return <div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16,alignItems:'flex-end'}}>
      <AutoInput label="Pokemon" value={poke} onChange={setPoke} placeholder="e.g. Garchomp"/>
      <div style={{minWidth:130}}>
        <label style={{display:'block',fontSize:11,color:'var(--text-muted)',marginBottom:4,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Tera Type</label>
        <select className="inp" value={tera} onChange={e=>setTera(e.target.value)} style={{fontSize:13}}>
          <option value="">None</option>{TYPES.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <button className="btn btn-primary" onClick={run} disabled={loading} style={{alignSelf:'flex-end',height:38}}>{loading?'…':'Analyze'}</button>
    </div>
    {err&&<div style={{color:'var(--danger)',fontSize:13,marginBottom:12,background:'var(--danger-subtle)',padding:'8px 12px',borderRadius:6}}>{err}</div>}
    {data&&<div>
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12,flexWrap:'wrap'}}>
        <span style={{fontSize:18,fontWeight:700,color:'var(--text)'}}>{data.name}</span>
        {data.types.map(t=><TB key={t} t={t}/>)}
        {data.tera_type&&<><span style={{color:'var(--text-faint)',fontSize:12}}>Tera:</span><TB t={data.tera_type}/></>}
        <span style={{marginLeft:'auto',display:'flex',gap:6}}>
          <Chip v={data.tier} color="#383a40"/><Chip v={data.role} color="#2a2c34"/>
        </span>
      </div>
      <div style={{display:'flex',gap:2,marginBottom:14,background:'var(--elevated)',borderRadius:8,padding:3}}>
        {TABS.map(t=><button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:'6px 4px',background:tab===t?'var(--primary)':'none',border:'none',borderRadius:6,cursor:'pointer',color:tab===t?'#fff':'var(--text-muted)',fontWeight:tab===t?700:400,fontSize:12,transition:'all 0.15s'}}>{t}</button>)}
      </div>
      {tab==='Stats'&&<StatsTab d={data}/>}
      {tab==='Weaknesses'&&<WeakTab d={data} tera={data.tera_type}/>}
      {tab==='Moves'&&<MovesTab d={data}/>}
    </div>}
  </div>;
}

function DamageSection({guildId}:{guildId:string}){
  const [atk,setAtk]=useState('');const [def,setDef]=useState('');const [mv,setMv]=useState('');const [z,setZ]=useState(false);const [res,setRes]=useState<DmgResult|null>(null);const [loading,setL]=useState(false);const [err,setErr]=useState('');
  const run=async()=>{if(!atk||!def||!mv)return setErr('All three fields required');setL(true);setErr('');setRes(null);
    const q=`/bossinfo/damage?attacker=${encodeURIComponent(atk)}&defender=${encodeURIComponent(def)}&move=${encodeURIComponent(mv)}&zmove=${z}`+(guildId?`&guild_id=${guildId}`:'');
    const d=await api(q);setL(false);if(d.error)setErr(d.error);else setRes(d);};
  const ko=res?(res.min_pct>=100?'Guaranteed OHKO':res.max_pct>=100?'Possible OHKO':res.min_pct>=50?'Guaranteed 2HKO':res.max_pct>=50?'Possible 2HKO':'3HKO+'):'';
  return <div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16,alignItems:'flex-end'}}>
      <AutoInput label="Attacker" value={atk} onChange={setAtk} placeholder="e.g. Garchomp"/>
      <AutoInput label="Defender" value={def} onChange={setDef} placeholder="e.g. Blissey"/>
      <AutoInput label="Move" value={mv} onChange={setMv} placeholder="e.g. Earthquake" searchUrl="/bossinfo/movesearch"/>
      <label style={{display:'flex',alignItems:'center',gap:5,fontSize:12,color:'var(--text-muted)',cursor:'pointer',paddingTop:16}}><input type="checkbox" checked={z} onChange={e=>setZ(e.target.checked)}/>Z-Move</label>
      <button className="btn btn-primary" onClick={run} disabled={loading} style={{alignSelf:'flex-end',height:38}}>{loading?'…':'Calculate'}</button>
    </div>
    {err&&<div style={{color:'var(--danger)',fontSize:13,marginBottom:12,background:'var(--danger-subtle)',padding:'8px 12px',borderRadius:6}}>{err}</div>}
    {res&&!res.immune&&<div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:16}}>
      <div style={{display:'flex',gap:14,flexWrap:'wrap'}}>
        <div style={{flex:'1 1 150px'}}>
          <div style={{fontSize:11,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>Damage</div>
          <div style={{fontSize:18,fontWeight:800,color:'var(--text)'}}>{res.min_pct.toFixed(1)}% – {res.max_pct.toFixed(1)}%</div>
          <Prog p={res.max_pct}/>
          <div style={{fontSize:11,color:'var(--text-faint)',marginTop:3}}>{res.min_dmg}–{res.max_dmg} / {res.defender_hp} HP</div>
        </div>
        <div style={{flex:'1 1 130px'}}>
          <div style={{fontSize:11,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>KO</div>
          <div style={{fontWeight:700,fontSize:13,color:res.ohko?'#ED4245':res.two_hko?'#FAA81A':'#3BA55D'}}>{ko}</div>
          <div style={{fontSize:11,color:'var(--text-faint)',marginTop:2}}>Hits: {res.hits_to_ko[0]}–{res.hits_to_ko[1]}</div>
        </div>
        <div style={{flex:'1 1 130px'}}>
          <div style={{fontSize:11,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>Move</div>
          <div style={{display:'flex',gap:5,marginBottom:2}}><TB t={res.move_type}/><span style={{fontSize:11,color:'var(--text-muted)'}}>{res.category}</span></div>
          <div style={{fontSize:11,color:'var(--text-muted)'}}>{res.effectiveness}× eff · {res.stab?'STAB':'no STAB'}</div>
        </div>
        <div style={{flex:'1 1 130px'}}>
          <div style={{fontSize:11,color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:4}}>Speed</div>
          <div style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{res.attacker_speed>res.defender_speed?'Attacker first':res.defender_speed>res.attacker_speed?'Defender first':'Speed tie'}</div>
          <div style={{fontSize:11,color:'var(--text-faint)'}}>{res.attacker_speed} vs {res.defender_speed}</div>
        </div>
      </div>
    </div>}
    {res?.immune&&<div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:14,color:'var(--text-muted)',fontSize:13}}>{def} is <strong style={{color:'var(--text)'}}>immune</strong> to {res.move_type}-type moves.</div>}
  </div>;
}

function CounterSection({guildId}:{guildId:string}){
  const [atk,setAtk]=useState('');const [def,setDef]=useState('');const [res,setRes]=useState<CtrResult|null>(null);const [best,setBest]=useState<BestCtr[]|null>(null);const [lM,setLM]=useState(false);const [lB,setLB]=useState(false);const [err,setErr]=useState('');
  const runM=async()=>{if(!atk||!def)return setErr('Both fields required');setLM(true);setErr('');setRes(null);
    const d=await api(`/bossinfo/counter?attacker=${encodeURIComponent(atk)}&defender=${encodeURIComponent(def)}`+(guildId?`&guild_id=${guildId}`:''));
    setLM(false);if(d.error)setErr(d.error);else setRes(d);};
  const runB=async()=>{if(!atk)return setErr('Enter attacker first');setLB(true);setErr('');setBest(null);
    const d=await api(`/bossinfo/bestcounters?pokemon=${encodeURIComponent(atk)}`);
    setLB(false);if(d.error)setErr(d.error);else setBest(d.counters||[]);};
  return <div>
    <div style={{display:'flex',gap:10,flexWrap:'wrap',marginBottom:16,alignItems:'flex-end'}}>
      <AutoInput label="Attacker" value={atk} onChange={setAtk} placeholder="e.g. Garchomp"/>
      <AutoInput label="Potential Counter" value={def} onChange={setDef} placeholder="e.g. Skarmory"/>
      <button className="btn btn-primary" onClick={runM} disabled={lM} style={{alignSelf:'flex-end',height:38}}>{lM?'…':'Check Matchup'}</button>
      <button className="btn btn-ghost" onClick={runB} disabled={lB} style={{alignSelf:'flex-end',height:38}}>{lB?'Searching (may take 10s)…':'Find Best Counters'}</button>
    </div>
    {err&&<div style={{color:'var(--danger)',fontSize:13,marginBottom:12,background:'var(--danger-subtle)',padding:'8px 12px',borderRadius:6}}>{err}</div>}
    {res&&!res.error&&<div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:14,marginBottom:14}}>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:10,flexWrap:'wrap'}}>
        <span style={{fontWeight:700,fontSize:14}}>{res.attacker} vs {res.defender}</span>
        <span style={{background:VC[res.verdict]||'#555',color:'#fff',borderRadius:4,padding:'3px 10px',fontWeight:700,fontSize:12}}>{res.verdict}</span>
      </div>
      <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:10}}>{res.verdict_desc}</div>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        <div style={{flex:'1 1 160px',background:'var(--elevated)',borderRadius:6,padding:10}}>
          <div style={{fontSize:11,color:'var(--text-faint)',marginBottom:3}}>{res.attacker} → {res.atk_move}</div>
          <div style={{fontWeight:700,color:'var(--text)'}}>{res.atk_min_pct.toFixed(1)}–{res.atk_max_pct.toFixed(1)}%</div>
          <Prog p={res.atk_max_pct}/>
        </div>
        <div style={{flex:'1 1 160px',background:'var(--elevated)',borderRadius:6,padding:10}}>
          <div style={{fontSize:11,color:'var(--text-faint)',marginBottom:3}}>{res.defender} → {res.def_move}</div>
          <div style={{fontWeight:700,color:'var(--text)'}}>{res.def_min_pct.toFixed(1)}–{res.def_max_pct.toFixed(1)}%</div>
          <Prog p={res.def_max_pct}/>
        </div>
        <div style={{flex:'0 1 120px',background:'var(--elevated)',borderRadius:6,padding:10}}>
          <div style={{fontSize:11,color:'var(--text-faint)',marginBottom:3}}>Speed</div>
          <div style={{fontSize:12,fontWeight:600}}>{res.faster==='attacker'?`${res.attacker} first`:res.faster==='defender'?`${res.defender} first`:'Tie'}</div>
          <div style={{fontSize:11,color:'var(--text-faint)'}}>{res.attacker_speed} vs {res.defender_speed}</div>
        </div>
      </div>
    </div>}
    {best&&<div>
      <div style={{fontSize:13,fontWeight:600,marginBottom:10,color:'var(--text)'}}>Best Counters vs {atk}</div>
      {best.length===0&&<div style={{color:'var(--text-muted)',fontSize:13}}>No strong counters found in the OU/UU meta pool.</div>}
      {best.map((c,i)=><div key={i} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:12,marginBottom:8}}>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
          <span style={{fontSize:15,color:'var(--primary)',fontWeight:800}}>#{i+1}</span>
          <span style={{fontWeight:700,fontSize:13}}>{c.candidate}</span>
          <span style={{background:VC[c.verdict]||'#555',color:'#fff',borderRadius:4,padding:'2px 8px',fontWeight:700,fontSize:11}}>{c.verdict}</span>
          <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-faint)'}}>Score {c.score.toFixed(1)}</span>
        </div>
        <div style={{display:'flex',gap:10,fontSize:11,color:'var(--text-muted)',flexWrap:'wrap'}}>
          <span>Survives: <strong style={{color:'var(--text)'}}>{c.def_survives_2?'2 hits':c.def_survives_1?'1 hit':'unlikely'}</strong></span>
          <span>Deals: <strong style={{color:'var(--text)'}}>{c.def_min_pct.toFixed(1)}–{c.def_max_pct.toFixed(1)}%</strong></span>
          <span>Speed: <strong style={{color:'var(--text)'}}>{c.defender_speed}</strong> vs {c.attacker_speed}</span>
        </div>
        <Prog p={c.def_max_pct}/>
      </div>)}
    </div>}
  </div>;
}

function HistorySection({guildId}:{guildId:string}){
  const [calcs,setCalcs]=useState<SavedCalc[]>([]);const [pop,setPop]=useState<Popular[]>([]);const [tab,setTab]=useState<'calcs'|'pop'>('calcs');const [filter,setFilter]=useState('');const [loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);const[a,b]=await Promise.all([fetch(`/api/bossinfo/db/calcs?guild_id=${guildId}`).then(r=>r.json()).catch(()=>({calcs:[]})),fetch(`/api/bossinfo/db/popular?guild_id=${guildId}`).then(r=>r.json()).catch(()=>({popular:[]}))]);setCalcs(a.calcs||[]);setPop(b.popular||[]);setLoading(false);};
  useEffect(()=>{if(guildId)load();},[guildId]);
  const del=async(id:number)=>{await fetch(`/api/bossinfo/db/calcs/${id}?guild_id=${guildId}`,{method:'DELETE'});setCalcs(p=>p.filter(c=>c.id!==id));};
  const fil=calcs.filter(c=>!filter||(c.label||'').toLowerCase().includes(filter.toLowerCase())||c.calc_type.includes(filter));
  if(loading)return <div style={{padding:24,color:'var(--text-muted)',fontSize:13}}>Loading…</div>;
  return <div>
    <div style={{display:'flex',gap:6,marginBottom:14,alignItems:'center'}}>
      {([['calcs',`Saved Calcs (${calcs.length})`],['pop','Popular Pokémon']] as const).map(([v,l])=><button key={v} onClick={()=>setTab(v as any)} style={{padding:'5px 14px',background:tab===v?'var(--primary-subtle)':'var(--elevated)',border:tab===v?'1px solid #818cf8':'1px solid var(--border)',borderRadius:6,cursor:'pointer',color:tab===v?'#818cf8':'var(--text-muted)',fontWeight:tab===v?700:400,fontSize:12}}>{l}</button>)}
      <button className="btn btn-ghost btn-sm" onClick={load} style={{marginLeft:'auto'}}>Refresh</button>
    </div>
    {tab==='calcs'&&<>
      <input className="inp" value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Filter…" style={{marginBottom:10,fontSize:12}}/>
      {fil.length===0&&<div style={{color:'var(--text-muted)',fontSize:13,padding:'12px 0'}}>No saved calculations yet. Use Damage Calc or Counter Finder to auto-save results here.</div>}
      {fil.map(c=><div key={c.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:12,marginBottom:8,display:'flex',gap:10,alignItems:'flex-start'}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:4}}>
            <span style={{background:c.calc_type==='damage'?'#5865F2':'#3BA55D',color:'#fff',borderRadius:4,padding:'1px 7px',fontSize:10,fontWeight:700}}>{c.calc_type}</span>
            <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{c.label||'Untitled'}</span>
          </div>
          {c.calc_type==='damage'&&c.data?.result&&!c.data.result.immune&&<div style={{fontSize:11,color:'var(--text-muted)'}}>Damage: <strong style={{color:'var(--text)'}}>{c.data.result.min_pct?.toFixed(1)}–{c.data.result.max_pct?.toFixed(1)}%</strong></div>}
          {c.calc_type==='counter'&&<div style={{fontSize:11,color:'var(--text-muted)'}}>Verdict: <strong style={{color:VC[c.data?.verdict]||'var(--text)'}}>{c.data?.verdict}</strong></div>}
          <div style={{fontSize:10,color:'var(--text-faint)',marginTop:3}}>{new Date(c.created_at).toLocaleString()}</div>
        </div>
        <button className="btn btn-danger btn-sm" onClick={()=>del(c.id)}>Delete</button>
      </div>)}
    </>}
    {tab==='pop'&&<>
      {pop.length===0&&<div style={{color:'var(--text-muted)',fontSize:13,padding:'12px 0'}}>No data yet. Use /analyze in Discord to build history.</div>}
      {pop.map((p,i)=><div key={p.pokemon_key} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,padding:'9px 14px',marginBottom:6,display:'flex',alignItems:'center',gap:10}}>
        <span style={{fontWeight:800,color:'var(--primary)',width:22}}>{i+1}</span>
        <span style={{fontWeight:600,flex:1,textTransform:'capitalize',color:'var(--text)'}}>{p.pokemon_key}</span>
        <span style={{fontSize:11,color:'var(--text-faint)'}}>{p.cnt} analyses</span>
      </div>)}
    </>}
  </div>;
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function BossInfoPage({guildId}:{guildId:string}){
  const [sec,setSec]=useState<Sec>('analyze');
  const sections:{id:Sec;label:string}[]=[{id:'analyze',label:'Analyze'},{id:'damage',label:'Damage Calc'},{id:'counter',label:'Counter Finder'},{id:'history',label:'History'}];
  return <div className="animate-fade" style={{maxWidth:860}}>
    <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid var(--border)'}}>
      {sections.map(s=><button key={s.id} onClick={()=>setSec(s.id)} style={{padding:'8px 18px',background:'none',border:'none',cursor:'pointer',color:sec===s.id?'var(--text)':'var(--text-muted)',borderBottom:sec===s.id?'2px solid var(--primary)':'2px solid transparent',fontWeight:sec===s.id?700:400,fontSize:13,fontFamily:'Lexend,sans-serif',transition:'all 0.15s'}}>{s.label}</button>)}
    </div>
    {sec==='analyze'&&<AnalyzeSection guildId={guildId}/>}
    {sec==='damage'&&<DamageSection guildId={guildId}/>}
    {sec==='counter'&&<CounterSection guildId={guildId}/>}
    {sec==='history'&&<HistorySection guildId={guildId}/>}
  </div>;
}

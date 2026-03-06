import { useState } from 'react';
import {
  lookupPoke,
  lookupMove,
  searchPokemon,
  searchMoves,
  runCalc,
  calcStat,
  getNat,
  _zPower,
  NATURES,
  ITEMS,
  WEATHERS,
  TERRAINS,
  ALL_TYPES,
  STAT_ORDER,
  DEFAULT_EVS,
  DEFAULT_IVS,
  INP,
  NUM,
  SEL,
  LBL,
  type PokeStat,
  type PokeData,
  type MoveData,
} from '../lib/engine_pokemon';
import { TypeBadge, AutoInput } from '../lib/pokemon_components';

interface PanelState {
  name:string; data:PokeData|null;
  level:number; nature:string; item:string;
  evs:PokeStat; ivs:PokeStat;
  teraType:string; status:string;
  moveName:string; moveData:MoveData|null;
  zmove:boolean; isCrit:boolean;
}
const mkPanel = (): PanelState => ({
  name:'',data:null,level:100,nature:'Hardy',item:'(none)',
  evs:{...DEFAULT_EVS},ivs:{...DEFAULT_IVS},
  teraType:'',status:'Healthy',moveName:'',moveData:null,zmove:false,isCrit:false,
});

function PokemonPanel({ panel, onChange, side }: {
  panel: PanelState; onChange: (p:Partial<PanelState>)=>void; side:'left'|'right';
}) {
  const d = panel.data;
  const lv = panel.level || 100;

  const computed: PokeStat|null = d ? {
    hp:  calcStat(d.stats.hp,  panel.evs.hp,  panel.ivs.hp,  true,  1,                          lv),
    atk: calcStat(d.stats.atk, panel.evs.atk, panel.ivs.atk, false, getNat(panel.nature,'atk'),  lv),
    def: calcStat(d.stats.def, panel.evs.def, panel.ivs.def, false, getNat(panel.nature,'def'),  lv),
    spa: calcStat(d.stats.spa, panel.evs.spa, panel.ivs.spa, false, getNat(panel.nature,'spa'),  lv),
    spd: calcStat(d.stats.spd, panel.evs.spd, panel.ivs.spd, false, getNat(panel.nature,'spd'),  lv),
    spe: calcStat(d.stats.spe, panel.evs.spe, panel.ivs.spe, false, getNat(panel.nature,'spe'),  lv),
  } : null;

  const evTotal = Object.values(panel.evs).reduce((a,b)=>a+b,0);

  return (
    <div style={{background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:12,padding:16}}>
      <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>
        {side==='left' ? '⚔️ Attacker' : '🛡 Defender'}
      </div>
      <AutoInput label="Pokémon" value={panel.name} searchFn={searchPokemon}
        onChange={v => { const pd=lookupPoke(v); onChange({name:v,data:pd}); }}
        placeholder="e.g. Garchomp"/>
      {d && (
        <div style={{display:'flex',gap:4,marginTop:6,flexWrap:'wrap',alignItems:'center'}}>
          {d.types.map(t=><TypeBadge key={t} t={t}/>)}
          {panel.teraType && <><span style={{fontSize:9,color:'var(--text-muted)'}}>Tera→</span><TypeBadge t={panel.teraType}/></>}
        </div>
      )}

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
        <div>
          <label style={LBL}>Level</label>
          <input style={INP} type="number" min={1} max={100} value={panel.level}
            onChange={e=>onChange({level:parseInt(e.target.value)||100})}/>
        </div>
        <div>
          <label style={LBL}>Nature</label>
          <select style={SEL} value={panel.nature} onChange={e=>onChange({nature:e.target.value})}>
            {Object.keys(NATURES).map(n=><option key={n}>{n}</option>)}
          </select>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
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

      {side==='left' && (
        <>
          <div style={{marginTop:8}}>
            <AutoInput label="Move" value={panel.moveName} searchFn={searchMoves}
              onChange={v=>{const mv=lookupMove(v);onChange({moveName:v,moveData:mv});}}
              placeholder="e.g. Earthquake"/>
          </div>
          {panel.moveData && (
            <div style={{display:'flex',gap:6,alignItems:'center',marginTop:5,flexWrap:'wrap'}}>
              <TypeBadge t={panel.moveData.type}/>
              <span style={{fontSize:11,color:'var(--text-muted)'}}>{panel.moveData.cat}</span>
              <span style={{fontSize:11,color:'var(--text-muted)'}}>
                BP {panel.moveData.bp}{panel.zmove?` → Z:${_zPower(panel.moveData.bp)}`:''}
              </span>
            </div>
          )}
          <div style={{display:'flex',gap:12,marginTop:8,fontSize:12,color:'var(--text-muted)',flexWrap:'wrap',alignItems:'center'}}>
            <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
              <input type="checkbox" checked={panel.isCrit} onChange={e=>onChange({isCrit:e.target.checked})}/> Critical Hit
            </label>
            <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
              <input type="checkbox" checked={panel.zmove} onChange={e=>onChange({zmove:e.target.checked})}/> Z-Move
            </label>
            <div style={{display:'flex',alignItems:'center',gap:5}}>
              <label style={{...LBL,marginBottom:0}}>Status</label>
              <select style={{...SEL,width:'auto'}} value={panel.status} onChange={e=>onChange({status:e.target.value})}>
                {['Healthy','Burn','Paralysis','Poison'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      <div style={{marginTop:10}}>
        <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}>
          <label style={{...LBL,marginBottom:0}}>EVs</label>
          <span style={{fontSize:10,color:evTotal>510?'var(--danger)':'var(--text-faint)'}}>{evTotal}/510</span>
        </div>
        <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
          {STAT_ORDER.map(([k,l])=>(
            <div key={k} style={{display:'flex',alignItems:'center',gap:3}}>
              <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:700,minWidth:24,textAlign:'right'}}>{l}</span>
              <input style={NUM} type="number" min={0} max={252} value={panel.evs[k]}
                onChange={e=>onChange({evs:{...panel.evs,[k]:Math.max(0,Math.min(252,parseInt(e.target.value)||0))}})}/>
              {computed && <span style={{fontSize:9,color:'var(--text-faint)',minWidth:26}}>=<b style={{color:'var(--text-muted)'}}>{computed[k]}</b></span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DamageResult({ result, atk, def }: { result:any; atk:PanelState; def:PanelState }) {
  if (!result) return null;

  if (result.immune) return (
    <div style={{textAlign:'center',padding:'18px',color:'var(--text-muted)',fontSize:14,
      background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:12}}>
      🛡 {def.data?.name||'Defender'} is <strong>immune</strong> to {atk.moveData?.type}-type moves
    </div>
  );

  const r = result;
  const dmgColor = r.maxP>=100?'var(--danger)':r.maxP>=50?'var(--warning)':'var(--success)';
  const verdict = r.ohko?'OHKO':r.possibleOhko?'Poss. OHKO':r.twoHko?'2HKO':r.maxP>=50?'Poss. 2HKO':`${r.hitsToKo[0]}HKO`;
  const hitsStr = r.hitsToKo[0]===r.hitsToKo[1]
    ? `${r.hitsToKo[0]} hit${r.hitsToKo[0]>1?'s':''} to KO`
    : `${r.hitsToKo[0]}–${r.hitsToKo[1]} hits to KO`;
  const maxRoll = r.defHp ? Math.max(...r.rolls) / r.defHp * 100 : 1;

  return (
    <div style={{background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:12,padding:16}}>
      {/* Main result */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8}}>
        <span style={{fontSize:28,fontWeight:800,color:'#fff',fontFamily:"'JetBrains Mono',monospace",letterSpacing:'-0.02em'}}>
          {r.minP.toFixed(1)}%–{r.maxP.toFixed(1)}%
        </span>
        <span style={{fontSize:17,fontWeight:800,color:dmgColor}}>{verdict}</span>
      </div>

      {/* Damage bar */}
      <div style={{height:10,background:'rgba(255,255,255,0.07)',borderRadius:5,overflow:'hidden',position:'relative',marginBottom:8}}>
        <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,r.minP)}%`,background:dmgColor,opacity:.4,borderRadius:5}}/>
        <div style={{position:'absolute',left:`${Math.min(100,r.minP)}%`,top:0,bottom:0,
          width:`${Math.max(0,Math.min(100,r.maxP)-Math.min(100,r.minP))}%`,background:dmgColor,borderRadius:5}}/>
      </div>

      {/* Detail row */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',fontSize:12,color:'var(--text-muted)',marginBottom:12}}>
        <span>
          <strong style={{color:'var(--text)'}}>{r.minD}–{r.maxD}</strong> dmg /
          <strong style={{color:'var(--text)'}}> {r.defHp}</strong> HP
        </span>
        {r.eff!==1 && <span style={{color:r.eff>1?'var(--warning)':'var(--success)',fontWeight:700}}>{r.eff}× type</span>}
        {r.stab && <span style={{color:'#818cf8',fontWeight:700}}>STAB</span>}
        <span style={{marginLeft:'auto',color:'var(--text-faint)'}}>{hitsStr}</span>
      </div>

      {/* Roll distribution */}
      <div>
        <div style={{fontSize:10,fontWeight:700,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>
          Roll Distribution (16 outcomes)
        </div>
        <div style={{display:'flex',gap:2,alignItems:'flex-end',height:44}}>
          {r.rolls.map((d:number,i:number) => {
            const p = r.defHp ? d/r.defHp*100 : 0;
            const h = Math.max(4,Math.round(p/maxRoll*40));
            const col = p>=100?'var(--danger)':p>=50?'var(--warning)':'var(--primary)';
            return (
              <div key={i} title={`${d} dmg · ${p.toFixed(1)}%`}
                style={{flex:1,height:h,background:col,borderRadius:'2px 2px 0 0',opacity:.85,cursor:'default'}}/>
            );
          })}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--text-faint)',fontFamily:"'JetBrains Mono',monospace",marginTop:3}}>
          <span>min: {r.rolls[0]}</span><span>max: {r.rolls[15]}</span>
        </div>
      </div>
    </div>
  );
}

export default function DamageCalc({ sdState }: { sdState: string }) {
  const [atk, setAtkRaw] = useState<PanelState>(mkPanel());
  const [def, setDefRaw] = useState<PanelState>(mkPanel());
  const [field, setField] = useState({weather:'None',terrain:'None',doubles:false,atkScreen:false,defScreen:false});
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState('');

  const setAtk = (p:Partial<PanelState>) => { setAtkRaw(prev=>({...prev,...p})); setResult(null); setErr(''); };
  const setDef = (p:Partial<PanelState>) => { setDefRaw(prev=>({...prev,...p})); setResult(null); setErr(''); };

  const calculate = () => {
    if (!atk.name||!def.name||!atk.moveName) { setErr('Fill in both Pokémon and a move.'); return; }
    const ad=atk.data||lookupPoke(atk.name), dd=def.data||lookupPoke(def.name), mv=atk.moveData||lookupMove(atk.moveName);
    if (!ad) { setErr(`"${atk.name}" not found`); return; }
    if (!dd) { setErr(`"${def.name}" not found`); return; }
    if (!mv) { setErr(`Move "${atk.moveName}" not found`); return; }
    if (!mv.bp) { setErr(`"${atk.moveName}" is a status move (no base power)`); return; }
    setErr('');
    setResult(runCalc({
      atkPoke:ad,defPoke:dd,bp:mv.bp,cat:mv.cat,mtyp:mv.type,
      atkEvs:atk.evs,defEvs:def.evs,atkIvs:atk.ivs,defIvs:def.ivs,
      atkNat:atk.nature,defNat:def.nature,atkTera:atk.teraType,defTera:def.teraType,
      atkItem:atk.item,atkStatus:atk.status,weather:field.weather,doubles:field.doubles,
      atkScreen:field.atkScreen,defScreen:field.defScreen,isCrit:atk.isCrit,zmove:atk.zmove,
      atkLv:atk.level,defLv:def.level,
    }));
  };

  return (
    <div className="animate-fade" style={{display:'flex',flexDirection:'column',gap:14,maxWidth:960}}>
      {/* Field conditions */}
      <div style={{background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px'}}>
        <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>Field Conditions</div>
        <div style={{display:'flex',gap:14,flexWrap:'wrap',alignItems:'center',fontSize:12,color:'var(--text-muted)'}}>
          <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}>
            <input type="checkbox" checked={field.doubles} onChange={e=>setField(f=>({...f,doubles:e.target.checked}))}/> Doubles
          </label>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:10,fontWeight:700,color:'var(--text-faint)',textTransform:'uppercase'}}>Weather</span>
            <select style={{...SEL,width:'auto',minWidth:120}} value={field.weather} onChange={e=>setField(f=>({...f,weather:e.target.value}))}>
              {WEATHERS.map(w=><option key={w}>{w}</option>)}
            </select>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:10,fontWeight:700,color:'var(--text-faint)',textTransform:'uppercase'}}>Terrain</span>
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

      {/* Panels */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>
        <PokemonPanel panel={atk} onChange={setAtk} side="left"/>
        <PokemonPanel panel={def} onChange={setDef} side="right"/>
      </div>

      {err && <div style={{color:'var(--danger)',fontSize:13,padding:'9px 14px',background:'var(--danger-subtle)',borderRadius:8,border:'1px solid var(--danger)'}}>{err}</div>}

      <div style={{textAlign:'center'}}>
        <button className="btn btn-primary" onClick={calculate} disabled={sdState!=='ready'}
          style={{padding:'11px 52px',fontSize:14,fontWeight:700,letterSpacing:'.02em',
            boxShadow:'0 4px 16px rgba(88,101,242,.4)',opacity:sdState!=='ready'?.5:1}}>
          {sdState!=='ready' ? '⏳ Loading data…' : '⚡ Calculate Damage'}
        </button>
      </div>

      <DamageResult result={result} atk={atk} def={def}/>
    </div>
  );
}

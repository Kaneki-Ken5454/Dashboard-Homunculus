import { useState, useEffect } from 'react';
import {
  lookupPoke,
  lookupMove,
  searchPokemon,
  searchMoves,
  getLevelUpMoves,
  runCalc,
  calcStat,
  getNat,
  _zPower,
  NATURES,
  ITEMS,
  ALL_TYPES,
  WEATHERS,
  RAID_TIERS,
  STAT_ORDER,
  DEFAULT_EVS,
  DEFAULT_IVS,
  INP,
  NUM,
  SEL,
  LBL,
  type PokeStat,
  type PokeData,
} from '../lib/engine_pokemon';
import { TypeBadge, AutoInput } from '../lib/pokemon_components';

// ── Types ─────────────────────────────────────────────────────────────────────
interface CounterSlot {
  id: number; name: string; data: PokeData|null;
  level: number; nature: string; item: string;
  evs: PokeStat; ivs: PokeStat; teraType: string;
  moveName: string; moveData: any; zmove: boolean; isCrit: boolean;
  result: any; error: string;
}
interface BossConfig {
  name: string; data: PokeData|null;
  level: number; nature: string;
  evs: PokeStat; ivs: PokeStat; teraType: string;
  raidTier: string; weather: string; doubles: boolean; defScreen: boolean;
}

let _slotId = 1;
const mkSlot = (): CounterSlot => ({
  id: _slotId++, name:'', data:null, level:100, nature:'Hardy', item:'(none)',
  evs:{...DEFAULT_EVS}, ivs:{...DEFAULT_IVS}, teraType:'', moveName:'', moveData:null,
  zmove:false, isCrit:false, result:null, error:'',
});
const mkBoss = (): BossConfig => ({
  name:'', data:null, level:100, nature:'Hardy',
  evs:{...DEFAULT_EVS}, ivs:{...DEFAULT_IVS}, teraType:'',
  raidTier:'Normal (×1 HP)', weather:'None', doubles:false, defScreen:false,
});

// ── Monte-Carlo engine ────────────────────────────────────────────────────────
interface SimResult {
  trials: number; mean: number; median: number; p90: number;
  pWin: number; hist: Record<number,number>; policy: string;
  perSlot: Array<{name:string;avgHd:number;avgHs:number;ohko:number;avgDd:number;avgDt:number}>;
}

function runMC(boss:BossConfig, counters:CounterSlot[], bossHP:number, trials:number, policy:string): SimResult|null {
  if (!boss.data) return null;
  const raidMult = RAID_TIERS[boss.raidTier]??1;
  const bossFake: PokeData = {...boss.data, stats:{...boss.data.stats, hp:Math.round(boss.data.stats.hp*raidMult)}};
  const bossMoves = getLevelUpMoves(boss.name);
  if (!bossMoves.length) return null;

  const mkBase = (o:any) => runCalc(o);

  const atkToBoss = counters.map(slot => {
    const ad=slot.data||lookupPoke(slot.name), mv=slot.moveData||lookupMove(slot.moveName);
    if (!ad||!mv||!mv.bp) return null;
    const res = mkBase({atkPoke:ad,defPoke:bossFake,bp:mv.bp,cat:mv.cat,mtyp:mv.type,
      atkEvs:slot.evs,defEvs:boss.evs,atkIvs:slot.ivs,defIvs:boss.ivs,
      atkNat:slot.nature,defNat:boss.nature,atkTera:slot.teraType,defTera:boss.teraType,
      atkItem:slot.item,atkStatus:'Healthy',weather:boss.weather,doubles:boss.doubles,
      atkScreen:false,defScreen:boss.defScreen,isCrit:slot.isCrit,zmove:slot.zmove,
      atkLv:slot.level||100,defLv:boss.level||100});
    return res&&!res.immune ? {rolls:res.rolls,immune:false} : {rolls:[],immune:true};
  });

  const bossToAtk = bossMoves.map(mv =>
    counters.map(slot => {
      const ad=slot.data||lookupPoke(slot.name); if (!ad) return null;
      const res = mkBase({atkPoke:bossFake,defPoke:ad,bp:mv.bp,cat:mv.cat,mtyp:mv.type,
        atkEvs:boss.evs,defEvs:slot.evs,atkIvs:boss.ivs,defIvs:slot.ivs,
        atkNat:boss.nature,defNat:slot.nature,atkTera:boss.teraType,defTera:slot.teraType,
        atkItem:'(none)',atkStatus:'Healthy',weather:boss.weather,doubles:boss.doubles,
        atkScreen:boss.defScreen,defScreen:false,isCrit:false,zmove:false,
        atkLv:boss.level||100,defLv:slot.level||100});
      return res&&!res.immune ? {rolls:res.rolls,immune:false} : {rolls:[],immune:true};
    })
  );

  const atkHPs = counters.map(s=>{const d=s.data||lookupPoke(s.name);if(!d)return 0;return calcStat(d.stats.hp,s.evs.hp,s.ivs.hp,true,1,s.level||100);});
  const atkSpes = counters.map(s=>{const d=s.data||lookupPoke(s.name);if(!d)return 0;return calcStat(d.stats.spe,s.evs.spe,s.ivs.spe,false,getNat(s.nature,'spe'),s.level||100);});
  const bossSpe = calcStat(boss.data.stats.spe,boss.evs.spe,boss.ivs.spe,false,getNat(boss.nature,'spe'),boss.level||100);
  const totalBP = bossMoves.reduce((s,m)=>s+m.bp,0);
  const cumBP = bossMoves.map((_,i)=>bossMoves.slice(0,i+1).reduce((s,m)=>s+m.bp,0));
  const pickMv = () => {
    if (policy==='uniform') return Math.floor(Math.random()*bossMoves.length);
    const r=Math.random()*totalBP; return cumBP.findIndex(c=>r<=c);
  };
  const sr = (rolls:number[]) => rolls[Math.floor(Math.random()*16)];
  const acc = counters.map(()=>({hd:0,hs:0,dd:0,dt:0,ok:0,ot:0,used:0}));
  const needed: number[] = [];

  for (let t=0; t<trials; t++) {
    let bhp=bossHP; let used=0; let won=false;
    for (let si=0; si<counters.length&&bhp>0; si++) {
      const ac=atkToBoss[si]; if (!ac||ac.immune||!atkHPs[si]) continue;
      used++; acc[si].used++; let ahp=atkHPs[si]; let hd=0,hs=0,dd=0,dt=0; let first=true;
      while (bhp>0&&ahp>0) {
        const af=atkSpes[si]>=bossSpe;
        if (af) { const d=sr(ac.rolls); bhp-=d; hd++; dd+=d; if(bhp<=0){won=true;break;} }
        const mi=pickMv(); const bc=bossToAtk[mi]?.[si];
        if (bc&&!bc.immune&&bc.rolls.length) {
          const d=sr(bc.rolls);
          if (first){acc[si].ot++;if(d>=ahp)acc[si].ok++;first=false;}
          ahp-=d; hs++; dt+=d;
        }
        if (!af&&ahp>0) { const d=sr(ac.rolls); bhp-=d; hd++; dd+=d; if(bhp<=0){won=true;break;} }
      }
      acc[si].hd+=hd; acc[si].hs+=hs; acc[si].dd+=dd; acc[si].dt+=dt;
      if (won) break;
    }
    needed.push(won ? used : counters.length+1);
  }

  const s=[...needed].sort((a,b)=>a-b);
  const hist: Record<number,number>={};
  for (const n of needed) hist[n]=(hist[n]||0)+1;
  return {
    trials, mean:needed.reduce((a,b)=>a+b,0)/trials,
    median:s[Math.floor(trials/2)], p90:s[Math.floor(trials*.9)],
    pWin:needed.filter(n=>n<=counters.length).length/trials,
    hist, policy,
    perSlot:counters.map((slot,i)=>{const a=acc[i];const u=a.used||1;
      return{name:slot.name||'—',avgHd:a.hd/u,avgHs:a.hs/u,ohko:a.ot?a.ok/a.ot:0,avgDd:a.dd/u,avgDt:a.dt/u};
    }),
  };
}

// ── Counter Row ───────────────────────────────────────────────────────────────
function CounterRow({ slot, onChange, onRemove, rank }: {
  slot:CounterSlot; onChange:(id:number,p:Partial<CounterSlot>)=>void; onRemove:(id:number)=>void; rank:number|null;
}) {
  const r = slot.result;
  const upd = (p:Partial<CounterSlot>) => onChange(slot.id, p);
  const evTotal = Object.values(slot.evs).reduce((a,b)=>a+b,0);
  const medal = rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':null;
  const borderColor = !r ? 'var(--border)'
    : r.immune ? 'rgba(107,114,128,.4)'
    : r.ohko||r.possibleOhko ? 'rgba(237,66,69,.5)'
    : r.twoHko||r.maxP>=50    ? 'rgba(250,168,26,.45)'
    : 'rgba(59,165,93,.35)';

  return (
    <div style={{border:`1px solid ${borderColor}`,borderRadius:11,padding:13,display:'flex',flexDirection:'column',gap:9,background:'rgba(255,255,255,.015)',transition:'border-color .2s'}}>
      {/* Row 1: poke + move + nature + tera + flags */}
      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        <span style={{fontSize:14,minWidth:22,textAlign:'center',flexShrink:0}}>
          {medal || <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:700}}>#{slot.id}</span>}
        </span>
        <div style={{flex:'1 1 140px'}}><AutoInput label="" value={slot.name} searchFn={searchPokemon} onChange={v=>{const d=lookupPoke(v);upd({name:v,data:d,result:null,error:''});}} placeholder="Attacker Pokémon…"/></div>
        <div style={{flex:'1 1 140px'}}><AutoInput label="" value={slot.moveName} searchFn={searchMoves} onChange={v=>{const mv=lookupMove(v);upd({moveName:v,moveData:mv,result:null,error:''});}} placeholder="Move…"/></div>
        <select style={{...SEL,width:'auto',minWidth:100,fontSize:11}} value={slot.nature} onChange={e=>upd({nature:e.target.value,result:null})}>{Object.keys(NATURES).map(n=><option key={n}>{n}</option>)}</select>
        <select style={{...SEL,width:'auto',minWidth:90,fontSize:11}} value={slot.teraType} onChange={e=>upd({teraType:e.target.value,result:null})}><option value="">No Tera</option>{ALL_TYPES.map(t=><option key={t}>{t}</option>)}</select>
        <label style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'var(--text-muted)',cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={slot.isCrit} onChange={e=>upd({isCrit:e.target.checked,result:null})}/> Crit</label>
        <label style={{display:'flex',alignItems:'center',gap:3,fontSize:11,color:'var(--text-muted)',cursor:'pointer',whiteSpace:'nowrap'}}><input type="checkbox" checked={slot.zmove} onChange={e=>upd({zmove:e.target.checked,result:null})}/> Z</label>
        <button onClick={()=>onRemove(slot.id)} style={{background:'rgba(237,66,69,.12)',border:'1px solid rgba(237,66,69,.25)',color:'var(--danger)',borderRadius:5,padding:'3px 8px',cursor:'pointer',fontSize:11,fontWeight:700}}>✕</button>
      </div>
      {/* Row 2: level + EVs */}
      <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:700}}>LV</span>
        <input style={{...NUM,width:38}} type="number" min={1} max={100} value={slot.level} onChange={e=>upd({level:parseInt(e.target.value)||100,result:null})}/>
        {STAT_ORDER.map(([k,l])=>(
          <div key={k} style={{display:'flex',alignItems:'center',gap:2}}>
            <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:700,minWidth:22,textAlign:'right'}}>{l}</span>
            <input style={{...NUM,width:36}} type="number" min={0} max={252} value={slot.evs[k]} onChange={e=>upd({evs:{...slot.evs,[k]:Math.max(0,Math.min(252,parseInt(e.target.value)||0))},result:null})}/>
          </div>
        ))}
        <span style={{fontSize:9,color:evTotal>510?'var(--danger)':'var(--text-faint)'}}>({evTotal}/510)</span>
      </div>
      {/* Move info */}
      {slot.moveData && (
        <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
          <TypeBadge t={slot.moveData.type}/>
          <span style={{fontSize:10,color:'var(--text-muted)'}}>{slot.moveData.cat}</span>
          <span style={{fontSize:10,color:'var(--text-muted)'}}>BP {slot.moveData.bp}{slot.zmove?` → Z:${_zPower(slot.moveData.bp)}`:''}</span>
        </div>
      )}
      {slot.error && <div style={{fontSize:11,color:'var(--danger)',background:'var(--danger-subtle)',borderRadius:5,padding:'4px 8px'}}>{slot.error}</div>}
      {/* Result */}
      {r&&!r.immune&&(
        <div style={{background:'rgba(0,0,0,.28)',borderRadius:9,padding:'10px 13px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:5}}>
            <span style={{fontSize:22,fontWeight:900,color:'#fff',fontFamily:"'JetBrains Mono',monospace",letterSpacing:'-.02em'}}>{r.minP.toFixed(1)}%–{r.maxP.toFixed(1)}%</span>
            <span style={{fontSize:14,fontWeight:800,color:r.ohko||r.possibleOhko?'var(--danger)':r.twoHko||r.maxP>=50?'var(--warning)':'var(--success)'}}>
              {r.ohko?'OHKO':r.possibleOhko?'Poss. OHKO':r.twoHko?'2HKO':r.maxP>=50?'Poss. 2HKO':`${r.hitsToKo[0]}HKO`}
            </span>
          </div>
          <div style={{height:9,background:'rgba(255,255,255,.07)',borderRadius:5,overflow:'hidden',position:'relative',marginBottom:5}}>
            <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,r.minP)}%`,background:r.maxP>=100?'var(--danger)':r.maxP>=50?'var(--warning)':'var(--primary)',opacity:.4,borderRadius:5}}/>
            <div style={{position:'absolute',left:`${Math.min(100,r.minP)}%`,top:0,bottom:0,width:`${Math.max(0,Math.min(100,r.maxP)-Math.min(100,r.minP))}%`,background:r.maxP>=100?'var(--danger)':r.maxP>=50?'var(--warning)':'var(--primary)',borderRadius:5}}/>
          </div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap',fontSize:11,color:'var(--text-muted)'}}>
            <span><strong style={{color:'var(--text)'}}>{r.minD}–{r.maxD}</strong> / <strong style={{color:'var(--text)'}}>{r.defHp}</strong> HP</span>
            {r.eff!==1&&<span style={{color:r.eff>1?'var(--warning)':'var(--success)',fontWeight:700}}>{r.eff}× type</span>}
            {r.stab&&<span style={{color:'#818cf8',fontWeight:700}}>STAB</span>}
          </div>
        </div>
      )}
      {r?.immune&&<div style={{fontSize:11,color:'var(--text-muted)',fontStyle:'italic'}}>🛡 Immune to {slot.moveData?.type}</div>}
    </div>
  );
}

// ── Boss Sim Table ────────────────────────────────────────────────────────────
function BossSimPanel({ boss, counters }: { boss:BossConfig; counters:CounterSlot[] }) {
  const [open, setOpen] = useState(false);
  const bossData = boss.data; if (!bossData) return null;
  const bossMoves = getLevelUpMoves(boss.name); if (!bossMoves.length) return null;
  const raidMult = RAID_TIERS[boss.raidTier]??1;
  const bossFake: PokeData = {...bossData, stats:{...bossData.stats, hp:Math.round(bossData.stats.hp*raidMult)}};
  const bossTypes = boss.teraType ? [boss.teraType] : bossData.types;
  const validCounters = counters.filter(c=>c.data||lookupPoke(c.name));

  const simRows = !open ? [] : bossMoves.map(mv => ({
    mv,
    cols: validCounters.map(slot => {
      const cData=slot.data||lookupPoke(slot.name); if (!cData) return null;
      const res=runCalc({atkPoke:bossFake,defPoke:cData,bp:mv.bp,cat:mv.cat,mtyp:mv.type,
        atkEvs:boss.evs,defEvs:slot.evs,atkIvs:boss.ivs,defIvs:slot.ivs,
        atkNat:boss.nature,defNat:slot.nature,atkTera:boss.teraType,defTera:slot.teraType,
        atkItem:'(none)',atkStatus:'Healthy',weather:boss.weather,doubles:boss.doubles,
        atkScreen:boss.defScreen,defScreen:false,isCrit:false,zmove:false,
        atkLv:boss.level||100,defLv:slot.level||100});
      if (!res||res.immune) return {immune:true,minP:0,maxP:0,hitsToKo:[0,0] as [number,number]};
      const dh=res.defHp||1;
      const minP=Math.floor((res.minD??0)/dh*1000)/10;
      const maxP=Math.floor((res.maxD??0)/dh*1000)/10;
      return {...res,minP,maxP,hitsToKo:[(res.maxD??0)?Math.ceil(dh/(res.maxD??1)):99,(res.minD??0)?Math.ceil(dh/(res.minD??1)):99] as [number,number]};
    }),
  }));

  return (
    <div style={{border:'1px solid rgba(124,58,237,.28)',borderRadius:12,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',padding:'11px 16px',background:'rgba(124,58,237,.07)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:"'Lexend',sans-serif"}}>
        <span style={{fontSize:11,fontWeight:800,color:'#c4b5fd',textTransform:'uppercase',letterSpacing:'.09em',display:'flex',alignItems:'center',gap:8}}>
          🎯 Boss Simulation
          <span style={{fontSize:10,color:'var(--text-muted)',fontWeight:400,textTransform:'none'}}>— {bossData.name}'s moves vs your counters</span>
        </span>
        <span style={{color:'var(--text-faint)',fontSize:12}}>{open?'▲':'▼'}</span>
      </button>
      {open && (
        <div style={{padding:'0 14px 14px'}}>
          {!validCounters.length ? (
            <div style={{textAlign:'center',color:'var(--text-muted)',fontSize:12,padding:16}}>Add at least one counter Pokémon above.</div>
          ) : (
            <div style={{overflowX:'auto'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                <thead>
                  <tr>
                    <th style={{textAlign:'left',padding:'5px 8px',color:'var(--text-muted)',fontWeight:700,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',minWidth:160}}>Boss Move</th>
                    {validCounters.map(s=>(
                      <th key={s.id} style={{textAlign:'center',padding:'5px 8px',color:'var(--text)',fontWeight:700,borderBottom:'1px solid var(--border)',whiteSpace:'nowrap',minWidth:100}}>
                        {s.name||'?'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {simRows.map(({mv,cols},ri)=>(
                    <tr key={ri} style={{background:ri%2===0?'rgba(255,255,255,.015)':'transparent'}}>
                      <td style={{padding:'6px 8px',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                        <div style={{display:'flex',alignItems:'center',gap:5}}>
                          <TypeBadge t={mv.type}/>
                          <span style={{color:'var(--text)',fontWeight:600}}>{mv.name}</span>
                          {bossTypes.includes(mv.type)&&<span style={{fontSize:9,color:'#818cf8',fontWeight:700,background:'rgba(129,140,248,.15)',border:'1px solid rgba(129,140,248,.25)',borderRadius:3,padding:'1px 4px'}}>STAB</span>}
                          <span style={{fontSize:10,color:'var(--text-faint)'}}>BP {mv.bp}</span>
                        </div>
                      </td>
                      {cols.map((c:any,ci:number)=>(
                        <td key={ci} style={{padding:'6px 8px',textAlign:'center',borderBottom:'1px solid rgba(255,255,255,.04)'}}>
                          {c===null?<span style={{color:'var(--text-faint)'}}>—</span>
                          :c.immune?<span style={{fontSize:10,color:'var(--text-muted)'}}>🛡 Immune</span>:(
                            <div>
                              <div style={{fontSize:13,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",
                                color:c.maxP>=100?'var(--danger)':c.maxP>=50?'var(--warning)':c.maxP>=25?'#fbbf24':'var(--success)'}}>
                                {c.minP.toFixed(0)}–{c.maxP.toFixed(0)}%
                              </div>
                              <div style={{fontSize:10,color:'var(--text-muted)',fontWeight:700}}>
                                {c.maxP>=100?'OHKO':c.maxP>=50?'2HKO':`${c.hitsToKo[0]}HKO`}
                              </div>
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Monte-Carlo Panel ─────────────────────────────────────────────────────────
function MCPanel({ boss, counters, bossHP, sdState }: {
  boss:BossConfig; counters:CounterSlot[]; bossHP:number; sdState:string;
}) {
  const [open, setOpen]     = useState(false);
  const [trials, setTrials] = useState(2000);
  const [policy, setPolicy] = useState<'uniform'|'bpweighted'>('uniform');
  const [result, setResult] = useState<SimResult|null>(null);
  const [running, setRun]   = useState(false);
  const [err, setErr]       = useState('');
  if (!boss.data) return null;

  const valid = counters.filter(c=>c.name&&(c.data||lookupPoke(c.name))&&c.moveName&&(c.moveData||lookupMove(c.moveName)));
  const bm = getLevelUpMoves(boss.name);

  const run = () => {
    if (!valid.length) { setErr('Add at least one complete counter slot.'); return; }
    if (!bm.length)    { setErr(`No level-up moves found for ${boss.data!.name}.`); return; }
    setErr(''); setRun(true); setResult(null);
    setTimeout(() => { setResult(runMC(boss,counters,bossHP,trials,policy)); setRun(false); }, 20);
  };

  const maxH = result ? Math.max(...Object.values(result.hist)) : 1;
  const hkeys = result ? Object.keys(result.hist).map(Number).sort((a,b)=>a-b) : [];

  return (
    <div style={{border:'1px solid rgba(99,102,241,.3)',borderRadius:12,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)} style={{width:'100%',padding:'11px 16px',background:'rgba(99,102,241,.07)',border:'none',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:"'Lexend',sans-serif"}}>
        <span style={{fontSize:11,fontWeight:800,color:'#a5b4fc',textTransform:'uppercase',letterSpacing:'.09em',display:'flex',alignItems:'center',gap:8}}>
          🎲 Monte-Carlo Simulation
          {result&&<span style={{fontSize:10,color:'var(--success)',fontWeight:600,textTransform:'none'}}>
            · {(result.pWin*100).toFixed(0)}% win · avg {result.mean.toFixed(1)} attacker{result.mean!==1?'s':''}
          </span>}
        </span>
        <span style={{color:'var(--text-faint)',fontSize:12}}>{open?'▲':'▼'}</span>
      </button>
      {open&&(
        <div style={{padding:16,display:'flex',flexDirection:'column',gap:12}}>
          {/* Controls */}
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div>
              <label style={LBL}>Trials</label>
              <div style={{display:'flex',gap:4}}>
                {[500,2000,5000].map(n=>(
                  <button key={n} onClick={()=>setTrials(n)} style={{padding:'5px 11px',borderRadius:6,border:'1px solid var(--border)',background:trials===n?'rgba(99,102,241,.3)':'transparent',color:trials===n?'#a5b4fc':'var(--text-muted)',cursor:'pointer',fontSize:12,fontWeight:trials===n?700:400,fontFamily:"'Lexend',sans-serif"}}>
                    {n.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={LBL}>Boss Move Policy</label>
              <div style={{display:'flex',gap:4}}>
                {(['uniform','bpweighted'] as const).map(p=>(
                  <button key={p} onClick={()=>setPolicy(p)} style={{padding:'5px 11px',borderRadius:6,border:'1px solid var(--border)',background:policy===p?'rgba(99,102,241,.3)':'transparent',color:policy===p?'#a5b4fc':'var(--text-muted)',cursor:'pointer',fontSize:12,fontWeight:policy===p?700:400,fontFamily:"'Lexend',sans-serif"}}>
                    {p==='uniform'?'Uniform':'BP-Weighted'}
                  </button>
                ))}
              </div>
            </div>
            <button className="btn btn-primary" onClick={run} disabled={running||sdState!=='ready'}
              style={{opacity:(running||sdState!=='ready')?.5:1}}>
              {running?'Running…':'▶ Run Simulation'}
            </button>
          </div>
          {err&&<div style={{color:'var(--danger)',fontSize:12}}>{err}</div>}

          {result&&(
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {/* Summary cards */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
                {[
                  {l:'Win Rate',v:`${(result.pWin*100).toFixed(1)}%`,c:result.pWin>=.8?'var(--success)':result.pWin>=.5?'var(--warning)':'var(--danger)'},
                  {l:'Mean Attackers',v:result.mean.toFixed(2),c:'var(--text)'},
                  {l:'Median',v:result.median.toString(),c:'#a5b4fc'},
                  {l:'P90 (worst 10%)',v:result.p90>counters.length?`>${counters.length}`:result.p90.toString(),c:'var(--warning)'},
                ].map(({l,v,c})=>(
                  <div key={l} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 12px',textAlign:'center'}}>
                    <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>{l}</div>
                    <div style={{fontSize:20,fontWeight:900,fontFamily:"'JetBrains Mono',monospace",color:c}}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Histogram */}
              <div style={{background:'rgba(0,0,0,.2)',borderRadius:9,padding:'12px 14px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10}}>
                  Attackers Needed — {result.trials.toLocaleString()} trials
                </div>
                <div style={{display:'flex',gap:6,alignItems:'flex-end',height:80}}>
                  {hkeys.map(k=>{
                    const cnt=result.hist[k]||0; const pct=cnt/result.trials;
                    const bh=Math.max(4,Math.round((cnt/maxH)*72)); const over=k>counters.length;
                    return(
                      <div key={k} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
                        <div style={{fontSize:9,color:'var(--text-muted)',fontFamily:"'JetBrains Mono',monospace"}}>{(pct*100).toFixed(0)}%</div>
                        <div style={{width:'100%',height:bh,background:over?'rgba(237,66,69,.45)':'rgba(88,101,242,.65)',borderRadius:'3px 3px 0 0',minHeight:4,transition:'height .3s'}}/>
                        <div style={{fontSize:10,color:over?'var(--danger)':'#a5b4fc',fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{over?`>${counters.length}`:k}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-slot table */}
              <div style={{background:'rgba(0,0,0,.15)',borderRadius:9,padding:'12px 14px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Per-Counter Survival Stats</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:420}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid var(--border)'}}>
                        {['Counter','Avg Hits Dealt','Avg % to Boss','Survived','OHKO Risk'].map(h=>(
                          <th key={h} style={{padding:'4px 8px',textAlign:'center',color:'var(--text-faint)',fontWeight:700,fontSize:10,textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.perSlot.map((s,i)=>{
                        const pct=s.avgDd/(bossHP||1)*100;
                        return(
                          <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,.04)',background:i%2===0?'rgba(255,255,255,.01)':'transparent'}}>
                            <td style={{padding:'5px 8px',fontWeight:700,color:'var(--text)'}}>{s.name}</td>
                            <td style={{padding:'5px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'var(--success)'}}>{s.avgHd.toFixed(1)}</td>
                            <td style={{padding:'5px 8px',textAlign:'center'}}>
                              <div style={{display:'flex',alignItems:'center',gap:4}}>
                                <div style={{flex:1,height:5,background:'rgba(255,255,255,.07)',borderRadius:3,overflow:'hidden',minWidth:40}}>
                                  <div style={{width:`${Math.min(100,pct)}%`,height:'100%',background:pct>=50?'var(--danger)':'var(--success)',borderRadius:3}}/>
                                </div>
                                <span style={{fontSize:10,fontFamily:"'JetBrains Mono',monospace",color:'var(--text-muted)',minWidth:36}}>{pct.toFixed(1)}%</span>
                              </div>
                            </td>
                            <td style={{padding:'5px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'#a5b4fc'}}>{s.avgHs.toFixed(1)}</td>
                            <td style={{padding:'5px 8px',textAlign:'center'}}>
                              <span style={{padding:'2px 7px',borderRadius:4,fontSize:11,fontWeight:700,
                                background:s.ohko>=.5?'var(--danger-subtle)':s.ohko>=.2?'var(--warning-subtle)':'var(--success-subtle)',
                                color:s.ohko>=.5?'var(--danger)':s.ohko>=.2?'var(--warning)':'var(--success)'}}>
                                {(s.ohko*100).toFixed(0)}%
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{fontSize:10,color:'var(--text-faint)',marginTop:6}}>
                  Policy: <strong style={{color:'var(--text-muted)'}}>{result.policy==='uniform'?'Uniform random':'BP-weighted random'}</strong> · {result.trials.toLocaleString()} trials
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function CounterCalc({ sdState, user }: { sdState: string; user?: { discord_id: string; username: string; avatar_url?: string | null } | null }) {
  const [boss, setBossRaw]    = useState<BossConfig>(mkBoss());
  const [counters, setCounters] = useState<CounterSlot[]>([mkSlot(), mkSlot()]);
  const [calculated, setCalc] = useState(false);
  const [globalErr, setGlErr] = useState('');
  const [sortBy, setSortBy]   = useState<'max'|'min'>('max');
  const [hpOverride, setHpOvr] = useState('');

  // Raid boss presets from admin server
  const [raidPresets, setRaidPresets] = useState<Array<{pokemon_key:string;display_name:string;types:string[];notes:string}>>([]);
  const [showPresets,  setShowPresets] = useState(false);

  useEffect(() => {
    const apiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '');
    const guildId = (import.meta.env.VITE_GUILD_ID as string | undefined) ?? 'global';
    if (!apiUrl) return;
    fetch(`${apiUrl}/api/bossinfo/raidbosses?guild_id=${encodeURIComponent(guildId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.bosses) setRaidPresets(data.bosses); })
      .catch(() => {});
  }, []);

  const setBoss = (p:Partial<BossConfig>) => { setBossRaw(prev=>({...prev,...p})); setCalc(false); };
  const addSlot = () => setCounters(cs=>[...cs,mkSlot()]);
  const removeSlot = (id:number) => setCounters(cs=>cs.filter(c=>c.id!==id));
  const updateSlot = (id:number, p:Partial<CounterSlot>) => setCounters(cs=>cs.map(c=>c.id===id?{...c,...p}:c));

  const raidMult = RAID_TIERS[boss.raidTier]??1;
  const bossHpBase = () => boss.data ? calcStat(boss.data.stats.hp,boss.evs.hp,boss.ivs.hp,true,1,boss.level||100) : 0;
  const effectiveHp = () => { const ov=parseInt(hpOverride); return (!isNaN(ov)&&ov>0)?ov:Math.round(bossHpBase()*raidMult); };

  const calculateAll = () => {
    if (!boss.data) { setGlErr('Set a valid Boss Pokémon first.'); return; }
    setGlErr('');
    const bHP = effectiveHp();
    const bossFake: PokeData = {...boss.data, stats:{...boss.data.stats, hp:Math.round(boss.data.stats.hp*raidMult)}};
    const updated = counters.map(slot => {
      if (!slot.name||!slot.moveName) return {...slot,error:'',result:null};
      const ad=slot.data||lookupPoke(slot.name), mv=slot.moveData||lookupMove(slot.moveName);
      if (!ad) return {...slot,error:`"${slot.name}" not found`,result:null};
      if (!mv||!mv.bp) return {...slot,error:`"${slot.moveName}" not found/status`,result:null};
      const res = runCalc({atkPoke:ad,defPoke:bossFake,bp:mv.bp,cat:mv.cat,mtyp:mv.type,
        atkEvs:slot.evs,defEvs:boss.evs,atkIvs:slot.ivs,defIvs:boss.ivs,
        atkNat:slot.nature,defNat:boss.nature,atkTera:slot.teraType,defTera:boss.teraType,
        atkItem:slot.item,atkStatus:'Healthy',weather:boss.weather,doubles:boss.doubles,
        atkScreen:false,defScreen:boss.defScreen,isCrit:slot.isCrit,zmove:slot.zmove,
        atkLv:slot.level||100,defLv:boss.level||100});
      if (res&&!res.immune) {
        const minD=res.minD??0, maxD=res.maxD??0;
        const minP=bHP?Math.floor(minD/bHP*1000)/10:0, maxP=bHP?Math.floor(maxD/bHP*1000)/10:0;
        return {...slot,error:'',result:{...res,minD,maxD,defHp:bHP,minP,maxP,ohko:minP>=100,possibleOhko:maxP>=100,twoHko:minP>=50,hitsToKo:[maxD?Math.ceil(bHP/maxD):99,minD?Math.ceil(bHP/minD):99] as [number,number]}};
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
    <div className="animate-fade" style={{display:'flex',flexDirection:'column',gap:14,maxWidth:960}}>

      {/* Boss config card */}
      <div style={{background:'linear-gradient(135deg,rgba(220,38,38,.07),rgba(124,58,237,.07))',border:'1px solid rgba(220,38,38,.24)',borderRadius:12,padding:16}}>
        <div style={{fontSize:11,fontWeight:800,color:'#f87171',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:12,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
          <span>👹</span> Boss Configuration
          {boss.data&&<span style={{fontSize:10,color:'var(--success)',fontWeight:600}}>✓ {boss.data.name}</span>}
          {raidPresets.length>0&&(
            <div style={{marginLeft:'auto',position:'relative'}}>
              <button onClick={()=>setShowPresets(p=>!p)} style={{padding:'3px 10px',background:'rgba(88,101,242,.15)',border:'1px solid rgba(88,101,242,.3)',borderRadius:6,color:'#818cf8',cursor:'pointer',fontSize:11,fontWeight:700}}>
                📋 Boss Presets ({raidPresets.length})
              </button>
              {showPresets&&(
                <div style={{position:'absolute',top:'calc(100% + 4px)',right:0,zIndex:50,background:'#181a28',border:'1px solid rgba(255,255,255,.13)',borderRadius:9,padding:6,minWidth:200,maxHeight:220,overflowY:'auto',boxShadow:'0 8px 32px rgba(0,0,0,.7)'}}>
                  <div style={{fontSize:9,color:'#4b5563',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',padding:'4px 8px 6px'}}>Configured Raid Bosses</div>
                  {raidPresets.map(preset=>(
                    <div key={preset.pokemon_key} onMouseDown={()=>{
                      const d=lookupPoke(preset.display_name);
                      setBoss({name:preset.display_name,data:d});
                      setShowPresets(false);
                    }} style={{padding:'7px 10px',cursor:'pointer',borderRadius:6,fontSize:12,color:'#d4d8f0',display:'flex',alignItems:'center',gap:8}}
                    onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(88,101,242,.18)'}
                    onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=''}>
                      <span style={{fontWeight:600}}>{preset.display_name}</span>
                      {(preset.types||[]).slice(0,2).map((t:string)=><span key={t} style={{fontSize:9,background:'rgba(255,255,255,.1)',borderRadius:3,padding:'1px 5px',color:'#9ca3af'}}>{t}</span>)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
          <div>
            <AutoInput label="Boss Pokémon" value={boss.name} searchFn={searchPokemon}
              onChange={v=>{const d=lookupPoke(v);setBoss({name:v,data:d});}} placeholder="e.g. Charizard"/>
            {boss.data&&<div style={{display:'flex',gap:4,marginTop:5,flexWrap:'wrap'}}>
              {(boss.teraType?[boss.teraType]:boss.data.types).map(t=><TypeBadge key={t} t={t}/>)}
            </div>}
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

        <div style={{display:'grid',gridTemplateColumns:'70px 1fr 1fr 1fr',gap:8,marginBottom:10}}>
          <div><label style={LBL}>Level</label><input style={INP} type="number" min={1} max={100} value={boss.level} onChange={e=>setBoss({level:parseInt(e.target.value)||100})}/></div>
          <div><label style={LBL}>Nature</label><select style={SEL} value={boss.nature} onChange={e=>setBoss({nature:e.target.value})}>{Object.keys(NATURES).map(n=><option key={n}>{n}</option>)}</select></div>
          <div><label style={LBL}>Weather</label><select style={SEL} value={boss.weather} onChange={e=>setBoss({weather:e.target.value})}>{WEATHERS.map(w=><option key={w}>{w}</option>)}</select></div>
          <div><label style={LBL}>HP Override</label><input style={INP} type="number" value={hpOverride} onChange={e=>{setHpOvr(e.target.value);setCalc(false);}} placeholder="auto"/></div>
        </div>

        <div style={{marginBottom:10}}>
          <div style={{display:'flex',gap:5,flexWrap:'wrap',alignItems:'center'}}>
            <label style={{...LBL,marginBottom:0,marginRight:6}}>Boss EVs</label>
            {STAT_ORDER.map(([k,l])=>(
              <div key={k} style={{display:'flex',alignItems:'center',gap:3}}>
                <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:700,minWidth:22,textAlign:'right'}}>{l}</span>
                <input style={{...NUM,width:38}} type="number" min={0} max={252} value={boss.evs[k]}
                  onChange={e=>setBoss({evs:{...boss.evs,[k]:Math.max(0,Math.min(252,parseInt(e.target.value)||0))}})}/>
              </div>
            ))}
            <span style={{fontSize:9,color:bossEvTotal>510?'var(--danger)':'var(--text-faint)'}}>({bossEvTotal}/510)</span>
          </div>
        </div>

        <div style={{display:'flex',gap:16,alignItems:'center',flexWrap:'wrap',fontSize:11,color:'var(--text-muted)'}}>
          <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}><input type="checkbox" checked={boss.doubles} onChange={e=>setBoss({doubles:e.target.checked})}/> Doubles</label>
          <label style={{display:'flex',alignItems:'center',gap:4,cursor:'pointer'}}><input type="checkbox" checked={boss.defScreen} onChange={e=>setBoss({defScreen:e.target.checked})}/> Reflect / Light Screen</label>
          {boss.data&&(
            <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-muted)'}}>
              Base HP: <strong style={{color:'var(--text)'}}>{bossHpBase()}</strong>
              {raidMult>1&&<> → Raid HP: <strong style={{color:'var(--danger)'}}>{Math.round(bossHpBase()*raidMult)}</strong> <span style={{color:'var(--text-faint)'}}>×{raidMult}</span></>}
              {hpOverride&&parseInt(hpOverride)>0&&<> → Override: <strong style={{color:'var(--warning)'}}>{hpOverride}</strong></>}
            </span>
          )}
        </div>
      </div>

      {/* Counter list header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div style={{fontSize:11,fontWeight:800,color:'#818cf8',textTransform:'uppercase',letterSpacing:'.09em'}}>
          ⚔️ Counter Pokémon <span style={{color:'var(--text-faint)'}}>({counters.length})</span>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {calculated&&counters.some(c=>c.result&&!c.result.immune)&&(
            <div style={{display:'flex',gap:4,fontSize:11,color:'var(--text-muted)'}}>
              Sort:
              {(['max','min'] as const).map(s=>(
                <button key={s} onClick={()=>setSortBy(s)}
                  style={{padding:'3px 9px',borderRadius:5,border:'1px solid var(--border)',
                    background:sortBy===s?'rgba(88,101,242,.28)':'transparent',
                    color:sortBy===s?'#818cf8':'var(--text-muted)',cursor:'pointer',fontSize:11,
                    fontWeight:sortBy===s?700:400,fontFamily:"'Lexend',sans-serif"}}>
                  {s==='max'?'Max Dmg':'Min Dmg'}
                </button>
              ))}
            </div>
          )}
          <button className="btn btn-ghost btn-sm" onClick={addSlot}>+ Add Counter</button>
        </div>
      </div>

      {/* Counter rows */}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {displayCounters.map(slot=>{
          const rpos = calculated ? rankedIds.indexOf(slot.id)+1 : null;
          return <CounterRow key={slot.id} slot={slot} onChange={updateSlot} onRemove={removeSlot} rank={rpos&&rpos<=3?rpos:null}/>;
        })}
      </div>

      {globalErr&&<div style={{color:'var(--danger)',fontSize:13,padding:'9px 14px',background:'var(--danger-subtle)',borderRadius:8}}>{globalErr}</div>}

      <div style={{textAlign:'center'}}>
        <button className="btn btn-danger" onClick={calculateAll} disabled={sdState!=='ready'}
          style={{padding:'11px 52px',fontSize:14,fontWeight:700,letterSpacing:'.02em',
            background:'linear-gradient(135deg,#dc2626,#7c3aed)',border:'none',color:'#fff',
            boxShadow:'0 4px 20px rgba(220,38,38,.3)',opacity:sdState!=='ready'?.5:1}}>
          {sdState!=='ready' ? '⏳ Loading data…' : '👹 Calculate All Counters'}
        </button>
      </div>

      {/* Boss sim + MC (post-calculate) */}
      {calculated&&boss.data&&<BossSimPanel boss={boss} counters={counters}/>}
      {calculated&&boss.data&&<MCPanel boss={boss} counters={counters} bossHP={effectiveHp()} sdState={sdState}/>}

      {/* Rankings summary */}
      {calculated&&counters.some(c=>c.result&&!c.result.immune&&c.name)&&(
        <div style={{background:'rgba(255,255,255,.025)',border:'1px solid rgba(255,255,255,.09)',borderRadius:10,padding:14}}>
          <div style={{fontSize:10,fontWeight:800,color:'#5865f2',textTransform:'uppercase',letterSpacing:'.09em',marginBottom:10}}>
            📊 Rankings vs {boss.data?.name||'Boss'}{raidMult>1?` — Raid HP ×${raidMult}`:''}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            {ranked.map(({c},i)=>{
              if (!c.result||c.result.immune||!c.name) return null;
              const r=c.result;
              const medal=i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
              const hitStr=r.hitsToKo[0]===r.hitsToKo[1]?`${r.hitsToKo[0]}HKO`:`${r.hitsToKo[0]}–${r.hitsToKo[1]}HKO`;
              return(
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 8px',background:i===0?'rgba(251,191,36,.05)':'rgba(255,255,255,.02)',borderRadius:6,border:'1px solid rgba(255,255,255,.05)'}}>
                  <span style={{fontSize:14,width:22,textAlign:'center',flexShrink:0}}>{medal||<span style={{fontSize:10,color:'var(--text-faint)'}}>{i+1}</span>}</span>
                  <span style={{fontSize:12,fontWeight:700,color:'var(--text)',minWidth:100,flexShrink:0}}>{c.name}</span>
                  {c.moveData&&<TypeBadge t={c.moveData.type}/>}
                  <span style={{fontSize:11,color:'var(--text-muted)',minWidth:80,flexShrink:0}}>{c.moveName}</span>
                  <div style={{flex:1,height:5,background:'rgba(255,255,255,.07)',borderRadius:3,overflow:'hidden',position:'relative',minWidth:60}}>
                    <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(100,r.minP)}%`,background:r.maxP>=100?'var(--danger)':r.maxP>=50?'var(--warning)':'var(--primary)',opacity:.4,borderRadius:3}}/>
                    <div style={{position:'absolute',left:`${Math.min(100,r.minP)}%`,top:0,bottom:0,width:`${Math.max(0,Math.min(100,r.maxP)-Math.min(100,r.minP))}%`,background:r.maxP>=100?'var(--danger)':r.maxP>=50?'var(--warning)':'var(--primary)',borderRadius:3}}/>
                  </div>
                  <span style={{fontSize:12,fontWeight:800,color:'#fff',fontFamily:"'JetBrains Mono',monospace",minWidth:105,textAlign:'right',flexShrink:0}}>{r.minP.toFixed(1)}%–{r.maxP.toFixed(1)}%</span>
                  <span style={{fontSize:11,fontWeight:700,minWidth:65,textAlign:'right',flexShrink:0,color:r.ohko||r.possibleOhko?'var(--danger)':r.twoHko||r.maxP>=50?'var(--warning)':'var(--success)'}}>{hitStr}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

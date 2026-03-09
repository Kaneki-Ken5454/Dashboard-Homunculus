/**
 * CounterCalcTool.tsx — Raid Counter Calculator (main component)
 *
 * Architecture:
 *   - Shared types:       ../lib/raid_types.ts
 *   - MC simulation:      ../lib/mc_engine.ts
 *   - Auto-finder:        ../lib/auto_finder.ts
 *   - Pokémon engine:     ../lib/engine_pokemon.ts
 *   - Custom Pokémon:     defined inline below (CustomPokemonPanel)
 *
 * Admin vs client:
 *   isAdmin=true  →  can create/edit/delete custom Pokémon (stored server-side)
 *   isAdmin=false →  can view/use custom Pokémon created by admins
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import React from 'react';
import {
  lookupPoke,
  lookupMove,
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
  injectCustomPokemon,
  removeCustomPokemon,
  getCustomPokemonNames,
  lookupPokeWithCustom,
  searchPokemonWithCustom,
  getAllPokemonNamesWithCustom,
  getAllLearnableMoveNamesWithCustom,
  type PokeStat,
  type PokeData,
  type MoveData,
} from '../lib/engine_pokemon';
import { TypeBadge, AutoInput } from '../lib/pokemon_components';

// Extracted engine modules
import { runMCViaWorker } from '../lib/mc_engine';
import { runAutoFinder, type SortMetric } from '../lib/auto_finder';
import type {
  CounterSlot, BossConfig, SimResult, CandidateMetrics, CalcResult,
} from '../lib/raid_types';

// ── Slot/Boss factories ───────────────────────────────────────────────────────
let _slotId = 1;
const mkSlot = (): CounterSlot => ({
  id: _slotId++, name: '', data: null, level: 100, nature: 'Hardy', item: '(none)',
  evs: { ...DEFAULT_EVS }, ivs: { ...DEFAULT_IVS }, teraType: '',
  moveName: '', moveData: null, zmove: false, isCrit: false,
  raiderId: 0, result: null, error: '',
});

const mkBoss = (): BossConfig => ({
  name: '', data: null, level: 100, nature: 'Hardy',
  evs: { ...DEFAULT_EVS }, ivs: { ...DEFAULT_IVS }, teraType: '',
  raidTier: 'Normal (×1 HP)', weather: 'None', doubles: false, defScreen: false,
  numRaiders: 1, hpIncreasePerRaider: 0, hpScalingMode: 'additive',
  shieldActivatesAt: 0, shieldDamageReduction: 0.5, customMoves: [],
});

// ── Custom Pokémon Panel ─────────────────────────────────────────────────────
interface CustomPokeEntry {
  name: string;
  types: [string, string?];
  stats: PokeStat;
  moves: Array<{ name: string; type: string; cat: string; bp: number }>;
}

const CUSTOM_LS_KEY = 'pktool_custom_pokemon_v1';

function loadCustomFromStorage(): CustomPokeEntry[] {
  try {
    const raw = localStorage.getItem(CUSTOM_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveCustomToStorage(entries: CustomPokeEntry[]) {
  try { localStorage.setItem(CUSTOM_LS_KEY, JSON.stringify(entries)); } catch {}
}

/** Register all custom entries with the engine so lookupPoke/search picks them up. */
function syncCustomPokemon(entries: CustomPokeEntry[]) {
  // Clear previous custom entries
  for (const n of getCustomPokemonNames()) removeCustomPokemon(n);
  for (const e of entries) {
    const data: PokeData = {
      name: e.name,
      types: e.types.filter(Boolean) as string[],
      stats: e.stats,
      bst: Object.values(e.stats).reduce((a,b)=>a+b,0),
      abilities: [],
      weaknesses: {},
    };
    const moves: MoveData[] = e.moves.map(m => ({ name:m.name, bp:m.bp, cat:m.cat, type:m.type }));
    injectCustomPokemon(data, moves);
  }
}

const BLANK_ENTRY = (): CustomPokeEntry => ({
  name: '', types: ['Normal', undefined],
  stats: { hp:80, atk:80, def:80, spa:80, spd:80, spe:80 },
  moves: [{ name:'', type:'Normal', cat:'Physical', bp:80 }],
});

function CustomPokemonPanel({ isAdmin = false, apiUrl = '', guildId = 'global' }: { isAdmin?: boolean; apiUrl?: string; guildId?: string }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<CustomPokeEntry[]>(() => {
    // Prime from localStorage as instant-load fallback
    const loaded = loadCustomFromStorage();
    syncCustomPokemon(loaded);
    return loaded;
  });
  const [editing, setEditing] = useState<CustomPokeEntry|null>(null);
  const [editIdx, setEditIdx] = useState<number|null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [serverErr, setServerErr] = useState('');

  // Load custom pokemon from server on mount (all users read; admin may write)
  useEffect(() => {
    if (!apiUrl) return;
    setLoading(true);
    fetch(`${apiUrl}/api/custompokemon?guild_id=${encodeURIComponent(guildId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.entries) {
          const mapped: CustomPokeEntry[] = data.entries.map((e: any) => ({
            name: e.name,
            types: (e.types || ['Normal']) as [string, string?],
            stats: e.stats || { hp:80, atk:80, def:80, spa:80, spd:80, spe:80 },
            moves: e.moves || [],
            _serverId: e.id,
          }));
          saveCustomToStorage(mapped);
          syncCustomPokemon(mapped);
          setEntries(mapped);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiUrl, guildId]);

  const sessionToken = () => {
    try { return localStorage.getItem('hom_session') || ''; } catch { return ''; }
  };

  const persistToServer = async (updated: CustomPokeEntry[]) => {
    setServerErr('');
    if (!apiUrl || !isAdmin) {
      // Fallback: local only
      saveCustomToStorage(updated);
      syncCustomPokemon(updated);
      setEntries(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      return;
    }
    // Save every entry to server (upsert by name)
    try {
      for (const e of updated) {
        await fetch(`${apiUrl}/api/custompokemon`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-session-token': sessionToken() },
          body: JSON.stringify({ guild_id: guildId, name: e.name, types: e.types.filter(Boolean), stats: e.stats, moves: e.moves }),
        });
      }
      // Reload from server to get server IDs
      const refreshed = await fetch(`${apiUrl}/api/custompokemon?guild_id=${encodeURIComponent(guildId)}`).then(r=>r.json());
      if (refreshed?.entries) {
        const mapped: CustomPokeEntry[] = refreshed.entries.map((e: any) => ({
          name: e.name, types: e.types as [string,string?], stats: e.stats, moves: e.moves, _serverId: e.id,
        }));
        saveCustomToStorage(mapped);
        syncCustomPokemon(mapped);
        setEntries(mapped);
      } else {
        saveCustomToStorage(updated);
        syncCustomPokemon(updated);
        setEntries(updated);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setServerErr('Failed to save to server — check your session.');
    }
  };

  const deleteFromServer = async (idx: number) => {
    const entry = entries[idx];
    const copy = entries.filter((_,i)=>i!==idx);
    if (apiUrl && isAdmin && (entry as any)._serverId) {
      try {
        await fetch(`${apiUrl}/api/custompokemon/${(entry as any)._serverId}?guild_id=${encodeURIComponent(guildId)}`, {
          method: 'DELETE',
          headers: { 'x-session-token': sessionToken() },
        });
      } catch {}
    }
    saveCustomToStorage(copy);
    syncCustomPokemon(copy);
    setEntries(copy);
  };

  const persist = (updated: CustomPokeEntry[]) => {
    persistToServer(updated);
  };

  const startEdit = (idx: number | null) => {
    setEditing(idx === null ? BLANK_ENTRY() : { ...entries[idx], types: [...entries[idx].types] as [string,string?], moves: entries[idx].moves.map(m=>({...m})) });
    setEditIdx(idx);
  };

  const saveEdit = () => {
    if (!editing || !editing.name.trim()) return;
    const copy = [...entries];
    if (editIdx === null) copy.push(editing);
    else copy[editIdx] = editing;
    persist(copy);
    setEditing(null); setEditIdx(null);
  };

  const deleteEntry = (idx: number) => {
    deleteFromServer(idx);
  };

  const upd = (p: Partial<CustomPokeEntry>) => setEditing(prev => prev ? {...prev,...p} : prev);
  const updStat = (k: keyof PokeStat, v: number) => setEditing(prev => prev ? {...prev, stats:{...prev.stats,[k]:v}} : prev);
  const updMove = (i: number, p: Partial<typeof editing.moves[0]>) =>
    setEditing(prev => { if(!prev) return prev; const mv=[...prev.moves]; mv[i]={...mv[i],...p}; return {...prev,moves:mv}; });
  const addMove = () => setEditing(prev => prev ? {...prev, moves:[...prev.moves,{name:'',type:'Normal',cat:'Physical',bp:80}]} : prev);
  const delMove = (i: number) => setEditing(prev => { if(!prev)return prev; const mv=prev.moves.filter((_,j)=>j!==i); return {...prev,moves:mv}; });

  return (
    <div style={{border:'1px solid rgba(251,191,36,.25)',borderRadius:12,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:'100%',padding:'11px 16px',background:'rgba(251,191,36,.06)',border:'none',
          cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',
          fontFamily:"'Lexend',sans-serif"}}>
        <span style={{fontSize:11,fontWeight:800,color:'#fbbf24',textTransform:'uppercase',letterSpacing:'.09em',display:'flex',alignItems:'center',gap:8}}>
          ✨ Custom / Fan-made Pokémon
          {entries.length>0&&<span style={{fontSize:10,color:'var(--text-muted)',fontWeight:600,textTransform:'none'}}>
            {' · '}{entries.length} registered
          </span>}
          {saved&&<span style={{fontSize:10,color:'var(--success)',fontWeight:600,textTransform:'none'}}>· ✓ Saved</span>}
        </span>
        <span style={{color:'var(--text-faint)',fontSize:12}}>{open?'▲':'▼'}</span>
      </button>

      {open&&(
        <div style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{fontSize:11,color:'var(--text-muted)'}}>
            {isAdmin ? 'Define custom or fan-made Pokémon (stored server-side). They become available to ALL raiders immediately.' : 'Custom Pokémon registered by admins are loaded here automatically.'}
          </div>
          {loading&&<div style={{fontSize:11,color:'var(--text-faint)',display:'flex',alignItems:'center',gap:6}}>⏳ Loading from server…</div>}
          {serverErr&&<div style={{fontSize:11,color:'var(--danger)',padding:'5px 10px',background:'var(--danger-subtle)',borderRadius:6}}>{serverErr}</div>}

          {/* Entry list */}
          {entries.length>0&&(
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {entries.map((e,i)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',
                  background:'rgba(255,255,255,.035)',borderRadius:8,border:'1px solid var(--border)'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:'var(--text)',display:'flex',alignItems:'center',gap:5}}>
                      {e.name}
                      {e.types.filter(Boolean).map(t=><TypeBadge key={t} t={t!}/>)}
                    </div>
                    <div style={{fontSize:10,color:'var(--text-faint)',marginTop:2}}>
                      BST {Object.values(e.stats).reduce((a,b)=>a+b,0)} · {e.moves.length} move{e.moves.length!==1?'s':''}
                    </div>
                  </div>
                  {isAdmin&&<button onClick={()=>startEdit(i)} style={{padding:'4px 10px',background:'rgba(251,191,36,.12)',border:'1px solid rgba(251,191,36,.3)',borderRadius:6,color:'#fbbf24',cursor:'pointer',fontSize:11,fontFamily:"'Lexend',sans-serif"}}>Edit</button>}
                  {isAdmin&&<button onClick={()=>deleteEntry(i)} style={{padding:'4px 10px',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:6,color:'#ef4444',cursor:'pointer',fontSize:11,fontFamily:"'Lexend',sans-serif"}}>✕</button>}
                </div>
              ))}
            </div>
          )}

          {isAdmin&&(
            <button onClick={()=>startEdit(null)}
              style={{padding:'7px 16px',background:'rgba(251,191,36,.1)',border:'1px solid rgba(251,191,36,.3)',
                borderRadius:8,color:'#fbbf24',cursor:'pointer',fontSize:12,fontWeight:700,
                fontFamily:"'Lexend',sans-serif",width:'fit-content'}}>
              + Add Custom Pokémon
            </button>
          )}
          {!isAdmin&&<div style={{fontSize:11,color:'var(--text-faint)',fontStyle:'italic'}}>Ask a server admin to add custom Pokémon — they will appear in all searches once registered.</div>}

          {/* Editor — admin only */}
          {isAdmin&&editing&&(
            <div style={{background:'var(--elevated)',border:'1px solid rgba(251,191,36,.2)',borderRadius:10,padding:14,display:'flex',flexDirection:'column',gap:12}}>
              <div style={{fontSize:12,fontWeight:700,color:'#fbbf24',marginBottom:2}}>
                {editIdx===null?'New Custom Pokémon':'Edit: '+entries[editIdx]?.name}
              </div>

              {/* Name + Types */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                <div>
                  <label style={LBL}>Name *</label>
                  <input style={INP} placeholder="e.g. Shadow Mewtwo" value={editing.name} onChange={e=>upd({name:e.target.value})}/>
                </div>
                <div>
                  <label style={LBL}>Type 1</label>
                  <select style={INP} value={editing.types[0]} onChange={e=>upd({types:[e.target.value as string, editing.types[1]]})}>
                    {ALL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LBL}>Type 2 (optional)</label>
                  <select style={INP} value={editing.types[1]||''} onChange={e=>upd({types:[editing.types[0], e.target.value||undefined]})}>
                    <option value="">— None —</option>
                    {ALL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* Base Stats */}
              <div>
                <label style={LBL}>Base Stats</label>
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:6}}>
                  {(Object.keys(editing.stats) as (keyof PokeStat)[]).map(k=>(
                    <div key={k} style={{textAlign:'center'}}>
                      <div style={{fontSize:9,color:'var(--text-faint)',marginBottom:3,textTransform:'uppercase',fontWeight:700}}>{k}</div>
                      <input type="number" style={{...INP,padding:'4px 2px',textAlign:'center'}} min={1} max={999}
                        value={editing.stats[k]} onChange={e=>updStat(k,Math.max(1,Math.min(999,Number(e.target.value))))}/>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:10,color:'var(--text-faint)',marginTop:4,textAlign:'right'}}>
                  BST: <strong style={{color:'var(--text-muted)'}}>{Object.values(editing.stats).reduce((a,b)=>a+b,0)}</strong>
                </div>
              </div>

              {/* Moves */}
              <div>
                <label style={LBL}>Damaging Moves</label>
                <div style={{display:'flex',flexDirection:'column',gap:5}}>
                  {editing.moves.map((mv,i)=>(
                    <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr auto',gap:6,alignItems:'center'}}>
                      <input style={INP} placeholder="Move name" value={mv.name} onChange={e=>updMove(i,{name:e.target.value})}/>
                      <select style={INP} value={mv.type} onChange={e=>updMove(i,{type:e.target.value})}>
                        {ALL_TYPES.map(t=><option key={t} value={t}>{t}</option>)}
                      </select>
                      <select style={INP} value={mv.cat} onChange={e=>updMove(i,{cat:e.target.value})}>
                        <option value="Physical">Physical</option>
                        <option value="Special">Special</option>
                      </select>
                      <input type="number" style={{...INP,padding:'4px 6px'}} placeholder="BP" min={1} max={300}
                        value={mv.bp} onChange={e=>updMove(i,{bp:Math.max(1,Number(e.target.value))})}/>
                      <button onClick={()=>delMove(i)} style={{padding:'4px 8px',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',borderRadius:6,color:'#ef4444',cursor:'pointer',fontSize:12,fontFamily:"'Lexend',sans-serif"}}>✕</button>
                    </div>
                  ))}
                  <button onClick={addMove} style={{padding:'5px 12px',background:'transparent',border:'1px dashed var(--border)',borderRadius:6,color:'var(--text-faint)',cursor:'pointer',fontSize:11,fontFamily:"'Lexend',sans-serif",width:'fit-content'}}>
                    + Add Move
                  </button>
                </div>
              </div>

              <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
                <button onClick={()=>{setEditing(null);setEditIdx(null);}}
                  style={{padding:'7px 16px',background:'transparent',border:'1px solid var(--border)',borderRadius:7,color:'var(--text-muted)',cursor:'pointer',fontSize:12,fontFamily:"'Lexend',sans-serif"}}>
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={!editing.name.trim()}
                  style={{padding:'7px 18px',background:'rgba(251,191,36,.85)',border:'none',borderRadius:7,color:'#000',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:"'Lexend',sans-serif",opacity:!editing.name.trim()?.5:1}}>
                  ✓ Save Pokémon
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Auto-Finder Panel ─────────────────────────────────────────────────────────
function AutoFinderPanel({ boss, bossBaseHP, onLoadCounters, sdState }: {
  boss: BossConfig;
  bossBaseHP: number;
  onLoadCounters: (slots: Partial<CounterSlot>[]) => void;
  sdState: string;
}) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<CandidateMetrics[]>([]);
  const [maxResults, setMaxResults] = useState(40);
  const [sortMetric, setSortMetric] = useState<SortMetric>('raiders');
  const [err, setErr] = useState('');
  const [loadN, setLoadN] = useState(6);
  const [mcRunning, setMcRunning] = useState(false);
  const [mcResult, setMcResult] = useState<SimResult|null>(null);

  if (!boss.data) return null;
  const inc = boss.hpIncreasePerRaider / 100;

  const runFind = async () => {
    if (!boss.data) return;
    setErr(''); setRunning(true); setResults([]); setProgress(0); setMcResult(null);
    try {
      const found = await runAutoFinder(boss, bossBaseHP, inc, boss.hpScalingMode, maxResults, setProgress, sortMetric);
      if (!found.length) setErr('No viable counters found — ensure boss Pokémon is set and data is loaded.');
      setResults(found);
    } catch(e: any) { setErr(String(e)); }
    finally { setRunning(false); setProgress(100); }
  };

  const doLoad = () => {
    const top = results.slice(0, loadN);
    onLoadCounters(top.map(r => ({ name:r.name, data:r.data, moveName:r.bestMove.name, moveData:r.bestMove })));
  };

  const runMCForTop = () => {
    if (!results.length || !boss.data) return;
    const slots: CounterSlot[] = results.slice(0, loadN).map(r => ({
      ...mkSlot(), name:r.name, data:r.data, moveName:r.bestMove.name, moveData:r.bestMove,
    }));
    setMcRunning(true); setMcResult(null);
    runMCViaWorker(boss, slots, bossBaseHP, 1000, 'uniform').then(res => {
      setMcResult(res); setMcRunning(false);
    });
  };

  const effColor = (e: number) => e >= 2 ? '#ef4444' : e >= 1 ? '#f59e0b' : '#6b7280';
  const rColor   = (r: number) => r <= 2 ? 'var(--success)' : r <= 5 ? 'var(--warning)' : 'var(--danger)';

  return (
    <div style={{border:'1px solid rgba(139,92,246,.3)',borderRadius:12,overflow:'hidden'}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{width:'100%',padding:'11px 16px',background:'rgba(139,92,246,.07)',border:'none',
          cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between',fontFamily:"'Lexend',sans-serif"}}>
        <span style={{fontSize:11,fontWeight:800,color:'#c4b5fd',textTransform:'uppercase',letterSpacing:'.09em',display:'flex',alignItems:'center',gap:8}}>
          🔍 Auto-Find Best Counters
          {results.length>0&&<span style={{fontSize:10,color:'var(--success)',fontWeight:600,textTransform:'none'}}>
            {' · '}{results.length} found — best needs {results[0]?.estRaiders} raider{results[0]?.estRaiders!==1?'s':''}
          </span>}
        </span>
        <span style={{color:'var(--text-faint)',fontSize:12}}>{open?'▲':'▼'}</span>
      </button>

      {open&&(
        <div style={{padding:16,display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div>
              <label style={LBL}>Max Results</label>
              <div style={{display:'flex',gap:4}}>
                {[20,40,80].map(n=>(
                  <button key={n} onClick={()=>setMaxResults(n)}
                    style={{padding:'5px 10px',borderRadius:6,border:'1px solid var(--border)',
                      background:maxResults===n?'rgba(139,92,246,.28)':'transparent',
                      color:maxResults===n?'#c4b5fd':'var(--text-muted)',cursor:'pointer',fontSize:12,
                      fontWeight:maxResults===n?700:400,fontFamily:"'Lexend',sans-serif"}}>{n}</button>
                ))}
              </div>
            </div>
            <div>
              <label style={LBL}>Sort by</label>
              <select style={{...SEL,fontSize:11}} value={sortMetric} onChange={e=>setSortMetric(e.target.value as SortMetric)}>
                <option value="raiders">Min Raiders</option>
                <option value="damage">Max Damage</option>
                <option value="ohko">Lowest OHKO Risk</option>
                <option value="turns">Most Turns Survived</option>
              </select>
            </div>
            <button onClick={runFind} disabled={running||sdState!=='ready'}
              style={{padding:'8px 20px',background:'linear-gradient(135deg,#7c3aed,#4f46e5)',border:'none',
                borderRadius:8,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,
                fontFamily:"'Lexend',sans-serif",opacity:(running||sdState!=='ready')?.5:1}}>
              {running ? ('Scanning… ' + progress + '%') : '🔍 Find Counters'}
            </button>
          </div>

          {running&&(
            <div style={{height:4,background:'var(--border)',borderRadius:2,overflow:'hidden'}}>
              <div style={{height:'100%',width:progress+'%',background:'linear-gradient(90deg,#7c3aed,#4f46e5)',
                transition:'width .1s',borderRadius:2}}/>
            </div>
          )}

          {err&&<div style={{color:'var(--danger)',fontSize:12,padding:'6px 10px',background:'var(--danger-subtle)',borderRadius:6}}>{err}</div>}

          {results.length>0&&(<>
            <div style={{background:'rgba(0,0,0,.18)',borderRadius:9,overflow:'hidden'}}>
              <div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:11}}>
                  <thead>
                    <tr style={{borderBottom:'1px solid var(--border)'}}>
                      {(['#','Pokémon','Best Move','Eff','Hit%','Total%','OHKO Risk','Turns','Est. Raiders'] as const).map(h=>(
                        <th key={h} style={{padding:'6px 8px',textAlign:'center',color:'var(--text-faint)',
                          fontWeight:700,fontSize:10,textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r,i)=>(
                      <tr key={r.name} style={{borderBottom:'1px solid rgba(255,255,255,.04)',
                        background:i<loadN?'rgba(139,92,246,.05)':'transparent'}}>
                        <td style={{padding:'5px 8px',textAlign:'center',color:'var(--text-faint)',fontSize:10}}>{i+1}</td>
                        <td style={{padding:'5px 8px',fontWeight:700,color:'var(--text)',whiteSpace:'nowrap'}}>
                          <div style={{display:'flex',alignItems:'center',gap:5}}>
                            {i<loadN&&<span style={{fontSize:8,color:'#c4b5fd',fontWeight:900}}>✓</span>}
                            {r.name}
                          </div>
                          <div style={{display:'flex',gap:3,marginTop:2}}>
                            {r.data.types.map(t=><TypeBadge key={t} t={t}/>)}
                          </div>
                        </td>
                        <td style={{padding:'5px 8px',whiteSpace:'nowrap'}}>
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <TypeBadge t={r.bestMove.type}/>
                            <span style={{color:'var(--text-muted)'}}>{r.bestMove.name}</span>
                            <span style={{color:'var(--text-faint)',fontSize:10}}>BP{r.bestMove.bp}</span>
                          </div>
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center'}}>
                          <span style={{fontWeight:800,color:effColor(r.eff),fontSize:12}}>{r.eff}×</span>
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",
                          color:r.avgDmgPct>=10?'var(--success)':r.avgDmgPct>=3?'var(--warning)':'var(--danger)'}}>
                          {r.avgDmgPct.toFixed(1)}%
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center'}}>
                          <div style={{display:'flex',alignItems:'center',gap:4}}>
                            <div style={{flex:1,height:4,background:'rgba(255,255,255,.07)',borderRadius:2,overflow:'hidden',minWidth:36}}>
                              <div style={{width:Math.min(100,r.avgTotalPct)+'%',height:'100%',borderRadius:2,
                                background:r.avgTotalPct>=50?'var(--success)':r.avgTotalPct>=20?'var(--warning)':'var(--danger)'}}/>
                            </div>
                            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'var(--text-muted)',minWidth:36}}>
                              {r.avgTotalPct.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center'}}>
                          <span style={{padding:'2px 7px',borderRadius:4,fontSize:10,fontWeight:700,
                            background:r.ohkoRisk>=.5?'var(--danger-subtle)':r.ohkoRisk>=.2?'var(--warning-subtle)':'var(--success-subtle)',
                            color:r.ohkoRisk>=.5?'var(--danger)':r.ohkoRisk>=.2?'var(--warning)':'var(--success)'}}>
                            {(r.ohkoRisk*100).toFixed(0)}%
                          </span>
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'#a5b4fc'}}>
                          {r.turnsSurvived >= 99 ? '∞' : r.turnsSurvived}
                        </td>
                        <td style={{padding:'5px 8px',textAlign:'center'}}>
                          <span style={{fontSize:14,fontWeight:900,fontFamily:"'JetBrains Mono',monospace",color:rColor(r.estRaiders)}}>
                            {r.estRaiders >= 99 ? '99+' : r.estRaiders}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',padding:'10px 12px',
              background:'rgba(139,92,246,.06)',borderRadius:9,border:'1px solid rgba(139,92,246,.15)'}}>
              <div>
                <label style={LBL}>Load top N as counter slots</label>
                <div style={{display:'flex',gap:4}}>
                  {[3,6,10,18].map(n=>(
                    <button key={n} onClick={()=>setLoadN(n)}
                      style={{padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',
                        background:loadN===n?'rgba(139,92,246,.3)':'transparent',
                        color:loadN===n?'#c4b5fd':'var(--text-muted)',cursor:'pointer',
                        fontSize:12,fontWeight:loadN===n?700:400,fontFamily:"'Lexend',sans-serif"}}>{n}</button>
                  ))}
                </div>
              </div>
              <button onClick={doLoad}
                style={{padding:'8px 18px',background:'rgba(139,92,246,.9)',border:'none',borderRadius:8,
                  color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:"'Lexend',sans-serif"}}>
                📥 Load Top {loadN}
              </button>
              <button onClick={runMCForTop} disabled={mcRunning}
                style={{padding:'8px 18px',background:'rgba(99,102,241,.18)',border:'1px solid rgba(99,102,241,.35)',
                  borderRadius:8,color:'#a5b4fc',cursor:'pointer',fontSize:13,fontWeight:700,
                  fontFamily:"'Lexend',sans-serif",opacity:mcRunning?.5:1}}>
                {mcRunning ? 'Running MC…' : ('🎲 MC-Validate Top ' + loadN)}
              </button>
            </div>

            {mcResult&&(
              <div style={{padding:'12px 16px',borderRadius:10,
                background:mcResult.pWin>=.8?'rgba(59,165,93,.1)':mcResult.pWin>=.5?'rgba(250,168,26,.1)':'rgba(237,66,69,.1)',
                border:'1px solid '+(mcResult.pWin>=.8?'rgba(59,165,93,.35)':mcResult.pWin>=.5?'rgba(250,168,26,.35)':'rgba(237,66,69,.35)')}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:5,
                  color:mcResult.pWin>=.8?'var(--success)':mcResult.pWin>=.5?'var(--warning)':'var(--danger)'}}>
                  {mcResult.pWin>=.8?'✅ Strong team — recommended!'
                    :'⚠️ '+(mcResult.pWin>=.5?'Borderline — try more raiders or a different set'
                      :'High risk — increase raiders or pick stronger counters')}
                </div>
                <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.7}}>
                  Win rate: <strong style={{color:'var(--text)'}}>{(mcResult.pWin*100).toFixed(1)}%</strong> over 1,000 MC trials.{' '}
                  Avg counters needed: <strong style={{color:'var(--text)'}}>{mcResult.mean.toFixed(1)}</strong>.{' '}
                  Analytical estimate: <strong style={{color:'#c4b5fd'}}>{results[0]?.estRaiders} raider{results[0]?.estRaiders!==1?'s':''}</strong>.
                </div>
              </div>
            )}

            <div style={{fontSize:10,color:'var(--text-faint)'}}>
              Evaluated at Lv 100, default EVs/IVs, Hardy nature. Searches full learnset (all generations).
              Sorted by estimated min raiders ↑ then total damage ↓. ✓ rows = will be loaded.
            </div>
          </>)}
        </div>
      )}
    </div>
  );
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
        <div style={{flex:'1 1 140px'}}><AutoInput label="" value={slot.name} searchFn={searchPokemonWithCustom} onChange={v=>{const d=lookupPokeWithCustom(v);upd({name:v,data:d,result:null,error:''});}} placeholder="Attacker Pokémon…"/></div>
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
        <input style={{...NUM,width:48,fontSize:12}} type="number" min={1} max={100} value={slot.level} onChange={e=>upd({level:parseInt(e.target.value)||100,result:null})}/>
        {STAT_ORDER.map(([k,l])=>(
          <div key={k} style={{display:'flex',alignItems:'center',gap:2}}>
            <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:700,minWidth:22,textAlign:'right'}}>{l}</span>
            <input style={{...NUM,width:44,fontSize:12}} type="number" min={0} max={252} value={slot.evs[k]} onChange={e=>upd({evs:{...slot.evs,[k]:Math.max(0,Math.min(252,parseInt(e.target.value)||0))},result:null})}/>
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
  const bossMoves = (boss.customMoves?.length ? boss.customMoves : getLevelUpMoves(boss.name)); if (!bossMoves.length) return null;
  const raidMult = RAID_TIERS[boss.raidTier]??1;
  const bossFake: PokeData = {...bossData, stats:{...bossData.stats, hp:Math.round(bossData.stats.hp*raidMult)}};
  const bossTypes = boss.teraType ? [boss.teraType] : bossData.types;
  const validCounters = counters.filter(c=>c.data||lookupPoke(c.name));

  const simRows = !open ? [] : bossMoves.map(mv => ({
    mv,
    cols: validCounters.map(slot => {
      const cData=slot.data||lookupPokeWithCustom(slot.name); if (!cData) return null;
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
  const [policy, setPolicy] = useState<'uniform'|'bpweighted'|'cyclic'|'custom'>('uniform');
  const [result, setResult] = useState<SimResult|null>(null);
  const [running, setRun]   = useState(false);
  const [err, setErr]       = useState('');
  const [moveWeights, setMoveWeights] = useState<Record<string,number>>({});
  if (!boss.data) return null;

  const valid = counters.filter(c=>c.name&&(c.data||lookupPoke(c.name))&&c.moveName&&(c.moveData||lookupMove(c.moveName)));
  // Use custom movepool if configured, otherwise fall back to level-up moves
  const bm = boss.customMoves?.length ? boss.customMoves : getLevelUpMoves(boss.name);

  const getWeightsArray = () => bm.map(mv => {
    const w = moveWeights[mv.name];
    return (w !== undefined && w >= 0) ? w : mv.bp;
  });

  const run = async () => {
    if (!valid.length) { setErr('Add at least one complete counter slot.'); return; }
    if (!bm.length)    { setErr(`No moves found for ${boss.data!.name}. Add custom moves in Boss Configuration, or the boss has no level-up data.`); return; }
    setErr(''); setRun(true); setResult(null);
    const wts = (policy==='custom') ? getWeightsArray() : undefined;
    const res = await runMCViaWorker(boss, counters, bossHP, trials, policy, wts);
    setResult(res);
    setRun(false);
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
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {(['uniform','bpweighted','cyclic','custom'] as const).map(p=>(
                  <button key={p} onClick={()=>setPolicy(p)} style={{padding:'5px 11px',borderRadius:6,border:'1px solid var(--border)',background:policy===p?'rgba(99,102,241,.3)':'transparent',color:policy===p?'#a5b4fc':'var(--text-muted)',cursor:'pointer',fontSize:12,fontWeight:policy===p?700:400,fontFamily:"'Lexend',sans-serif"}}>
                    {p==='uniform'?'Uniform':p==='bpweighted'?'BP-Weighted':p==='cyclic'?'Cyclic':'Custom'}
                  </button>
                ))}
              </div>
              {policy==='cyclic'&&<div style={{fontSize:10,color:'var(--text-faint)',marginTop:5}}>Boss cycles through its moves in fixed order each turn — realistic for scripted bosses.</div>}
              {policy==='custom'&&bm.length>0&&(
                <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:5}}>
                  <div style={{fontSize:10,color:'var(--text-faint)',marginBottom:2}}>Assign relative weight to each move (higher = more frequent). Default is the move BP.</div>
                  {bm.map(mv=>(
                    <div key={mv.name} style={{display:'flex',alignItems:'center',gap:8}}>
                      <TypeBadge t={mv.type}/>
                      <span style={{fontSize:11,color:'var(--text-muted)',minWidth:120,flex:1}}>{mv.name} <span style={{color:'var(--text-faint)'}}>BP{mv.bp}</span></span>
                      <input type="number" min={0} max={100} style={{...INP,width:64,padding:'4px 6px'}}
                        value={moveWeights[mv.name]??mv.bp}
                        onChange={e=>setMoveWeights(prev=>({...prev,[mv.name]:Math.max(0,Number(e.target.value))}))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="btn btn-primary" onClick={run} disabled={running||sdState!=='ready'}
              style={{opacity:(running||sdState!=='ready')?.5:1}}>
              {running?'Running…':'▶ Run Simulation'}
            </button>
          </div>
          {err&&<div style={{color:'var(--danger)',fontSize:12}}>{err}</div>}

          {result&&(
            <div style={{display:'flex',flexDirection:'column',gap:10}}>
              {/* Plain-English verdict */}
              <div style={{background: result.pWin>=.8?'rgba(59,165,93,.1)':result.pWin>=.5?'rgba(250,168,26,.1)':'rgba(237,66,69,.1)', border:`1px solid ${result.pWin>=.8?'rgba(59,165,93,.35)':result.pWin>=.5?'rgba(250,168,26,.35)':'rgba(237,66,69,.35)'}`, borderRadius:10, padding:'12px 16px'}}>
                <div style={{fontSize:13,fontWeight:700,color:result.pWin>=.8?'var(--success)':result.pWin>=.5?'var(--warning)':'var(--danger)',marginBottom:5}}>
                  {result.pWin>=.8?'✅ Strong team composition':'⚠️ '+( result.pWin>=.5?'Borderline — may need more counters':'High risk — team likely insufficient')}
                </div>
                <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.7}}>
                  In <strong style={{color:'var(--text)'}}>{(result.pWin*100).toFixed(0)}%</strong> of {result.trials.toLocaleString()} simulated raids, your counter team defeated the boss.
                  {' '}On average you need <strong style={{color:'var(--text)'}}>{result.mean.toFixed(1)}</strong> counter{result.mean!==1?'s':''} to finish the raid.
                  {result.p90<=counters.length?` In the worst 10% of runs, it still only takes ${result.p90} counter${result.p90!==1?'s':''}.`:` Warning: in the worst 10% of runs, your current ${counters.length} counters may not be enough.`}
                </div>
              </div>

              {/* Summary cards */}
              {(()=>{
                // Wilson score 95% CI for win rate
                const n=result.trials, p=result.pWin, z=1.96;
                const centre=(p + z*z/(2*n))/(1+z*z/n);
                const margin=z*Math.sqrt(p*(1-p)/n + z*z/(4*n*n))/(1+z*z/n);
                const lo=Math.max(0,centre-margin), hi=Math.min(1,centre+margin);
                return (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
                    {[
                      {l:'Win Rate',     v:`${(result.pWin*100).toFixed(1)}%`, sub:`±${((hi-lo)/2*100).toFixed(1)}%`, c:result.pWin>=.8?'var(--success)':result.pWin>=.5?'var(--warning)':'var(--danger)', tip:`95% CI: ${(lo*100).toFixed(1)}%–${(hi*100).toFixed(1)}%`},
                      {l:'Avg Counters', v:result.mean.toFixed(2),             sub:null,                               c:'var(--text)',  tip:'Typical number of counters used'},
                      {l:'Median',       v:result.median.toString(),            sub:null,                               c:'#a5b4fc',     tip:'Most common counters needed'},
                      {l:'Worst 10%',    v:result.p90>counters.length?`>${counters.length}`:result.p90.toString(), sub:null, c:'var(--warning)', tip:'Counters needed in unlucky runs'},
                    ].map(({l,v,sub,c,tip})=>(
                      <div key={l} title={tip} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 12px',textAlign:'center',cursor:'help'}}>
                        <div style={{fontSize:9,color:'var(--text-muted)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>{l}</div>
                        <div style={{fontSize:20,fontWeight:900,fontFamily:"'JetBrains Mono',monospace",color:c}}>{v}</div>
                        {sub&&<div style={{fontSize:9,color:'var(--text-faint)',fontFamily:"'JetBrains Mono',monospace",marginTop:1}}>{sub} 95% CI</div>}
                        <div style={{fontSize:9,color:'var(--text-faint)',marginTop:sub?1:3}}>{tip}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Histogram */}
              <div style={{background:'rgba(0,0,0,.2)',borderRadius:9,padding:'12px 14px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>
                  How many counters did the raid need?
                </div>
                <div style={{fontSize:11,color:'var(--text-faint)',marginBottom:10}}>Each bar = how often that many counters were required. <span style={{color:'var(--danger)'}}>Red = raid failed</span> (ran out of counters).</div>
                <div style={{display:'flex',gap:6,alignItems:'flex-end',height:80}}>
                  {hkeys.map(k=>{
                    const cnt=result.hist[k]||0; const pct=cnt/result.trials;
                    const bh=Math.max(4,Math.round((cnt/maxH)*72)); const over=k>counters.length;
                    return(
                      <div key={k} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:3}} title={`${k} counters: ${(pct*100).toFixed(1)}% of raids`}>
                        <div style={{fontSize:9,color:'var(--text-muted)',fontFamily:"'JetBrains Mono',monospace"}}>{(pct*100).toFixed(0)}%</div>
                        <div style={{width:'100%',height:bh,background:over?'rgba(237,66,69,.45)':'rgba(88,101,242,.65)',borderRadius:'3px 3px 0 0',minHeight:4,transition:'height .3s'}}/>
                        <div style={{fontSize:10,color:over?'var(--danger)':'#a5b4fc',fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{over?'fail':k}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Per-slot table */}
              <div style={{background:'rgba(0,0,0,.15)',borderRadius:9,padding:'12px 14px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:2}}>How did each counter perform?</div>
                <div style={{fontSize:11,color:'var(--text-faint)',marginBottom:8}}>Averaged across all simulations where that counter was used.</div>
                <div style={{overflowX:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:420}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid var(--border)'}}>
                        {[
                          {h:'Counter', tip:'Your attacker'},
                          {h:'Hits Dealt', tip:'Avg times this counter hit the boss'},
                          {h:'Dmg to Boss', tip:'Avg % of boss HP removed by this counter'},
                          {h:'Hits Taken', tip:'Avg times boss hit this counter before it fainted or won'},
                          {h:'OHKO Risk', tip:'Chance of being one-shot by the boss'},
                        ].map(({h,tip})=>(
                          <th key={h} title={tip} style={{padding:'4px 8px',textAlign:'center',color:'var(--text-faint)',fontWeight:700,fontSize:10,textTransform:'uppercase',whiteSpace:'nowrap',cursor:'help'}}>{h}</th>
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
                <div style={{fontSize:10,color:'var(--text-faint)',marginTop:6,display:'flex',gap:12,flexWrap:'wrap'}}>
                  <span>Boss move policy: <strong style={{color:'var(--text-muted)'}}>{result.policy==='uniform'?'Uniform (equal chance)'
  :result.policy==='bpweighted'?'BP-Weighted (stronger moves preferred)'
  :result.policy==='cyclic'?'Cyclic (fixed order)'
  :'Custom (user weights)'}</strong></span>
                  <span>Trials: <strong style={{color:'var(--text-muted)'}}>{result.trials.toLocaleString()}</strong></span>
                  <span>Effective boss HP: <strong style={{color:'var(--text-muted)'}}>{bossHP.toLocaleString()}</strong>
                    {boss.numRaiders>1&&<> <span style={{color:'var(--text-faint)'}}>({boss.numRaiders} raiders, {boss.hpScalingMode}, +{boss.hpIncreasePerRaider}%/raider)</span></>}
                  </span>
                </div>
              </div>

              {/* ── Per-Raider Summary ─────────────────────────────────────────── */}
              {boss.numRaiders > 1 && (()=>{
                const spr = Math.max(1, Math.ceil(counters.length / boss.numRaiders));
                const raiders = Array.from({length:boss.numRaiders},(_,r)=>{
                  const slots = result.perSlot.slice(r*spr,(r+1)*spr);
                  const active = slots.filter(s=>s.avgHd>0||s.avgDd>0);
                  const totalDmgPct = slots.reduce((a,s)=>a+s.avgDd/bossHP*100,0);
                  const avgOhko = active.length ? active.reduce((a,s)=>a+s.ohko,0)/active.length : 0;
                  const totalHd = slots.reduce((a,s)=>a+s.avgHd,0);
                  return {r,totalDmgPct,avgOhko,totalHd,slots};
                });
                const dc=(p:number)=>p>=40?'var(--danger)':p>=20?'var(--warning)':'var(--success)';
                return(
                  <div style={{background:'rgba(0,0,0,.15)',borderRadius:9,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:800,color:'#818cf8',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>
                      👥 Per-Raider Performance
                    </div>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:360}}>
                        <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                          {['Raider','Team','Total Dmg %','Avg OHKO Risk','Hits Dealt'].map(h=>(
                            <th key={h} style={{padding:'4px 8px',textAlign:'center',color:'var(--text-faint)',fontWeight:700,fontSize:10,textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {raiders.map(({r,totalDmgPct,avgOhko,totalHd,slots})=>(
                            <tr key={r} style={{borderBottom:'1px solid rgba(255,255,255,.04)',background:r%2===0?'rgba(255,255,255,.015)':'transparent'}}>
                              <td style={{padding:'6px 8px',fontWeight:700,color:'#818cf8',textAlign:'center',whiteSpace:'nowrap'}}>Raider {r+1}</td>
                              <td style={{padding:'6px 8px',fontSize:10,color:'var(--text-muted)'}}>
                                {(()=>{
                                  const nm:Record<string,number>={};
                                  slots.forEach(s=>{if(s.name)nm[s.name]=(nm[s.name]||0)+1;});
                                  return Object.entries(nm).map(([n,cnt])=>(
                                    <span key={n} style={{display:'inline-block',marginRight:4,whiteSpace:'nowrap',fontWeight:600}}>
                                      {cnt>1?`${cnt}× `:''}{n}
                                    </span>
                                  ));
                                })()}
                              </td>
                              <td style={{padding:'6px 8px',textAlign:'center'}}>
                                <div style={{display:'flex',alignItems:'center',gap:5}}>
                                  <div style={{flex:1,height:5,background:'rgba(255,255,255,.07)',borderRadius:3,overflow:'hidden',minWidth:50}}>
                                    <div style={{width:`${Math.min(100,totalDmgPct)}%`,height:'100%',background:dc(totalDmgPct),borderRadius:3}}/>
                                  </div>
                                  <span style={{fontSize:11,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:dc(totalDmgPct),minWidth:44,textAlign:'right'}}>{totalDmgPct.toFixed(1)}%</span>
                                </div>
                              </td>
                              <td style={{padding:'6px 8px',textAlign:'center'}}>
                                <span style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,
                                  background:avgOhko>=.5?'var(--danger-subtle)':avgOhko>=.2?'var(--warning-subtle)':'var(--success-subtle)',
                                  color:avgOhko>=.5?'var(--danger)':avgOhko>=.2?'var(--warning)':'var(--success)'}}>
                                  {(avgOhko*100).toFixed(0)}%
                                </span>
                              </td>
                              <td style={{padding:'6px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'var(--success)',fontWeight:700}}>{totalHd.toFixed(1)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* ── Per-Species Summary ─────────────────────────────────────────── */}
              {(()=>{
                const specMap:Record<string,{count:number;totalDd:number;totalHd:number;totalOhko:number}>={};
                for(const s of result.perSlot){
                  const nm=s.name||'—';
                  if(!specMap[nm])specMap[nm]={count:0,totalDd:0,totalHd:0,totalOhko:0};
                  specMap[nm].count++;
                  specMap[nm].totalDd+=s.avgDd;
                  specMap[nm].totalHd+=s.avgHd;
                  specMap[nm].totalOhko+=s.ohko;
                }
                const species=Object.entries(specMap)
                  .map(([name,v])=>({name,count:v.count,avgDmgPct:v.totalDd/v.count/bossHP*100,avgHd:v.totalHd/v.count,avgOhko:v.totalOhko/v.count}))
                  .sort((a,b)=>b.avgDmgPct-a.avgDmgPct);
                if(species.length<2) return null;
                const dc=(p:number)=>p>=10?'var(--success)':p>=3?'var(--warning)':'var(--danger)';
                return(
                  <div style={{background:'rgba(0,0,0,.15)',borderRadius:9,padding:'12px 14px'}}>
                    <div style={{fontSize:10,fontWeight:800,color:'#a78bfa',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>
                      🔬 Per-Species Avg Performance
                      <span style={{fontWeight:400,textTransform:'none',color:'var(--text-faint)',marginLeft:6}}>averaged across {result.trials.toLocaleString()} trials</span>
                    </div>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:11,minWidth:360}}>
                        <thead><tr style={{borderBottom:'1px solid var(--border)'}}>
                          {['Species','Count','Avg Dmg%','Avg Hits','Avg OHKO Risk'].map(h=>(
                            <th key={h} style={{padding:'4px 8px',textAlign:'center',color:'var(--text-faint)',fontWeight:700,fontSize:10,textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {species.map((s,i)=>(
                            <tr key={s.name} style={{borderBottom:'1px solid rgba(255,255,255,.04)',background:i%2===0?'rgba(255,255,255,.015)':'transparent'}}>
                              <td style={{padding:'6px 8px',fontWeight:700,color:'var(--text)'}}>
                                <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
                                  <span>{s.name}</span>
                                  {(()=>{const d=lookupPokeWithCustom(s.name);return d?d.types.map(t=><TypeBadge key={t} t={t}/>):null;})()}
                                </div>
                              </td>
                              <td style={{padding:'6px 8px',textAlign:'center',color:'var(--text-muted)',fontFamily:"'JetBrains Mono',monospace"}}>×{s.count}</td>
                              <td style={{padding:'6px 8px',textAlign:'center'}}>
                                <div style={{display:'flex',alignItems:'center',gap:5}}>
                                  <div style={{flex:1,height:5,background:'rgba(255,255,255,.07)',borderRadius:3,overflow:'hidden',minWidth:50}}>
                                    <div style={{width:`${Math.min(100,s.avgDmgPct*6)}%`,height:'100%',background:dc(s.avgDmgPct),borderRadius:3}}/>
                                  </div>
                                  <span style={{fontSize:11,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:dc(s.avgDmgPct),minWidth:44,textAlign:'right'}}>{s.avgDmgPct.toFixed(2)}%</span>
                                </div>
                              </td>
                              <td style={{padding:'6px 8px',textAlign:'center',fontFamily:"'JetBrains Mono',monospace",color:'var(--success)',fontWeight:700}}>{s.avgHd.toFixed(1)}</td>
                              <td style={{padding:'6px 8px',textAlign:'center'}}>
                                <span style={{padding:'2px 8px',borderRadius:4,fontSize:11,fontWeight:700,
                                  background:s.avgOhko>=.5?'var(--danger-subtle)':s.avgOhko>=.2?'var(--warning-subtle)':'var(--success-subtle)',
                                  color:s.avgOhko>=.5?'var(--danger)':s.avgOhko>=.2?'var(--warning)':'var(--success)'}}>
                                  {(s.avgOhko*100).toFixed(0)}%
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function CounterCalc({ sdState, user, isAdmin = false, guildId: guildIdProp }: { sdState: string; user?: { discord_id: string; username: string; avatar_url?: string | null } | null; isAdmin?: boolean; guildId?: string }) {
  const [boss, setBossRaw]    = useState<BossConfig>(mkBoss());
  const [counters, setCounters] = useState<CounterSlot[]>([mkSlot(), mkSlot()]);
  const [calculated, setCalc] = useState(false);
  const [globalErr, setGlErr] = useState('');
  const [sortBy, setSortBy]   = useState<'max'|'min'>('max');
  const [hpOverride, setHpOvr] = useState('');
  const [teamTemplate, setTeamTemplate] = useState<CounterSlot[]|null>(null);

  // Raid boss presets from admin server
  const [raidPresets, setRaidPresets] = useState<Array<{pokemon_key:string;display_name:string;types:string[];notes:string}>>([]);
  const [showPresets,  setShowPresets] = useState(false);

  // Resolve API URL and guild ID — prop overrides env var (admin passes guildId explicitly)
  const apiUrl = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
  const guildId = guildIdProp || (import.meta.env.VITE_GUILD_ID as string | undefined) || 'global';

  useEffect(() => {
    if (!apiUrl) return;
    fetch(`${apiUrl}/api/bossinfo/raidbosses?guild_id=${encodeURIComponent(guildId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.bosses) setRaidPresets(data.bosses); })
      .catch(() => {});
  }, [apiUrl, guildId]);

  const setBoss = (p:Partial<BossConfig>) => { setBossRaw(prev=>({...prev,...p})); setCalc(false); };
  const addSlot = () => setCounters(cs=>[...cs,mkSlot()]);
  const loadAutoFinderSlots = (partials: Partial<CounterSlot>[]) => {
    const newSlots = partials.map(p => ({ ...mkSlot(), ...p, result:null, error:'', raiderId:1 }));
    setCounters(newSlots); setCalc(false);
    setTeamTemplate(newSlots.slice(0, 6));
  };
  const removeSlot = (id:number) => setCounters(cs=>cs.filter(c=>c.id!==id));
  const updateSlot = (id:number, p:Partial<CounterSlot>) => setCounters(cs=>cs.map(c=>c.id===id?{...c,...p}:c));

  const raidMult = RAID_TIERS[boss.raidTier]??1;
  const bossHpBase = () => boss.data ? calcStat(boss.data.stats.hp,boss.evs.hp,boss.ivs.hp,true,1,boss.level||100) : 0;
  const effectiveHp = () => {
    const ov = parseInt(hpOverride);
    const base = (!isNaN(ov) && ov > 0)
      ? ov
      : Math.round(bossHpBase() * raidMult);
    if (boss.numRaiders <= 1) return base;
    const inc = boss.hpIncreasePerRaider / 100;
    const mult = boss.hpScalingMode === 'additive'
      ? 1 + inc * (boss.numRaiders - 1)
      : Math.pow(1 + inc, boss.numRaiders - 1);
    return Math.round(base * mult);
  };
  // Base HP before raider scaling — used by AutoFinder analytical formula
  const bossBaseHP1R = () => {
    const ov = parseInt(hpOverride);
    return (!isNaN(ov) && ov > 0) ? ov : Math.round(bossHpBase() * raidMult);
  };

  const calculateAll = () => {
    if (!boss.data) { setGlErr('Set a valid Boss Pokémon first.'); return; }
    setGlErr('');
    const bHP = effectiveHp();
    const bossFake: PokeData = {...boss.data, stats:{...boss.data.stats, hp:Math.round(boss.data.stats.hp*raidMult)}};
    const updated = counters.map(slot => {
      if (!slot.name||!slot.moveName) return {...slot,error:'',result:null};
      const ad=slot.data||lookupPokeWithCustom(slot.name), mv=slot.moveData||lookupMove(slot.moveName);
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
            <AutoInput label="Boss Pokémon" value={boss.name} searchFn={searchPokemonWithCustom}
              onChange={v=>{const d=lookupPokeWithCustom(v);setBoss({name:v,data:d});}} placeholder="e.g. Charizard"/>
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

        <div style={{display:'grid',gridTemplateColumns:'70px 1fr 1fr 1fr',gap:8,marginBottom:8}}>
          <div><label style={LBL}>Level</label><input style={INP} type="number" min={1} max={100} value={boss.level} onChange={e=>setBoss({level:parseInt(e.target.value)||100})}/></div>
          <div><label style={LBL}>Nature</label><select style={SEL} value={boss.nature} onChange={e=>setBoss({nature:e.target.value})}>{Object.keys(NATURES).map(n=><option key={n}>{n}</option>)}</select></div>
          <div><label style={LBL}>Weather</label><select style={SEL} value={boss.weather} onChange={e=>setBoss({weather:e.target.value})}>{WEATHERS.map(w=><option key={w}>{w}</option>)}</select></div>
          <div><label style={LBL}>HP Override</label><input style={INP} type="number" value={hpOverride} onChange={e=>{setHpOvr(e.target.value);setCalc(false);}} placeholder="auto"/></div>
        </div>

        {/* Raider scaling row */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:10,padding:'10px 12px',background:'rgba(255,255,255,.03)',borderRadius:8,border:'1px solid rgba(255,255,255,.07)'}}>
          <div>
            <label style={LBL}>👥 # Raiders</label>
            <input style={INP} type="number" min={1} max={30} value={boss.numRaiders}
              onChange={e=>setBoss({numRaiders:Math.max(1,parseInt(e.target.value)||1)})}/>
          </div>
          <div>
            <label style={LBL}>HP Increase / Raider (%)</label>
            <input style={INP} type="number" min={0} step={0.1} value={boss.hpIncreasePerRaider}
              onChange={e=>setBoss({hpIncreasePerRaider:Math.max(0,parseFloat(e.target.value)||0)})}/>
          </div>
          <div>
            <label style={LBL}>Scaling Mode</label>
            <select style={SEL} value={boss.hpScalingMode}
              onChange={e=>setBoss({hpScalingMode:e.target.value as 'additive'|'multiplicative'})}>
              <option value="additive">Additive</option>
              <option value="multiplicative">Multiplicative</option>
            </select>
          </div>
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
              {raidMult>1&&<> → Raid: <strong style={{color:'var(--danger)'}}>{Math.round(bossHpBase()*raidMult)}</strong> <span style={{color:'var(--text-faint)'}}>×{raidMult}</span></>}
              {hpOverride&&parseInt(hpOverride)>0&&<> → Override: <strong style={{color:'var(--warning)'}}>{hpOverride}</strong></>}
              {boss.numRaiders>1&&boss.hpIncreasePerRaider>0&&<> → Scaled: <strong style={{color:'#f97316'}}>{effectiveHp().toLocaleString()}</strong> <span style={{color:'var(--text-faint)'}}>({boss.numRaiders}×)</span></>}
              {boss.numRaiders>1&&boss.hpIncreasePerRaider===0&&<> <span style={{color:'var(--text-faint)'}}>({boss.numRaiders} raiders, no HP scale)</span></>}
            </span>
          )}
        </div>

        {/* ── Shield Mechanics ─────────────────────────────────── */}
        <div style={{marginTop:10,padding:'10px 12px',background:'rgba(59,130,246,.05)',borderRadius:8,border:'1px solid rgba(59,130,246,.15)'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#60a5fa',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8,display:'flex',alignItems:'center',gap:6}}>
            🛡 Shield Mechanics
            <span style={{fontSize:10,color:'var(--text-faint)',fontWeight:400,textTransform:'none'}}>(0 = off)</span>
          </div>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',alignItems:'flex-end'}}>
            <div>
              <label style={LBL}>Activates at % HP</label>
              <input style={{...INP,width:70}} type="number" min={0} max={99} step={5}
                value={boss.shieldActivatesAt}
                title="Boss gains shield when HP drops below this percentage. 0 = no shield."
                onChange={e=>setBoss({shieldActivatesAt:Math.max(0,Math.min(99,Number(e.target.value)||0))})}/>
            </div>
            <div>
              <label style={LBL}>Damage Reduction (0–1)</label>
              <input style={{...INP,width:70}} type="number" min={0} max={0.99} step={0.05}
                value={boss.shieldDamageReduction}
                title="While shielded, attacker damage is multiplied by (1 – this value). 0.5 = halve all damage."
                onChange={e=>setBoss({shieldDamageReduction:Math.max(0,Math.min(0.99,Number(e.target.value)||0))})}/>
            </div>
            {boss.shieldActivatesAt>0&&(
              <div style={{fontSize:11,color:'#60a5fa',padding:'4px 10px',background:'rgba(59,130,246,.1)',borderRadius:6,border:'1px solid rgba(59,130,246,.2)'}}>
                Shield at {boss.shieldActivatesAt}% HP · {Math.round(boss.shieldDamageReduction*100)}% damage reduction
              </div>
            )}
          </div>
        </div>

        {/* ── Custom Boss Movepool ──────────────────────────────── */}
        <div style={{marginTop:10,padding:'10px 12px',background:'rgba(239,68,68,.04)',borderRadius:8,border:'1px solid rgba(239,68,68,.15)'}}>
          <div style={{fontSize:10,fontWeight:700,color:'#f87171',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
            ⚔️ Boss Movepool
            {boss.customMoves.length===0&&<span style={{fontSize:10,color:'var(--text-faint)',fontWeight:400,textTransform:'none'}}>— using level-up moves</span>}
            {boss.customMoves.length>0&&<span style={{fontSize:10,color:'#fca5a5',fontWeight:600,textTransform:'none'}}>— {boss.customMoves.length} custom move{boss.customMoves.length!==1?'s':''} (overrides level-up)</span>}
            <button onClick={()=>setBoss({customMoves:[...boss.customMoves,{name:'',type:'Normal',cat:'Physical',bp:80}]})}
              style={{marginLeft:'auto',padding:'2px 8px',background:'rgba(239,68,68,.12)',border:'1px solid rgba(239,68,68,.3)',borderRadius:5,color:'#fca5a5',cursor:'pointer',fontSize:11,fontWeight:700}}>
              + Add Move
            </button>
            {boss.customMoves.length>0&&(
              <button onClick={()=>setBoss({customMoves:[]})}
                style={{padding:'2px 8px',background:'transparent',border:'1px solid rgba(255,255,255,.1)',borderRadius:5,color:'var(--text-faint)',cursor:'pointer',fontSize:11}}>
                Clear
              </button>
            )}
          </div>
          {boss.customMoves.length===0&&boss.data&&(()=>{
            const lum = getLevelUpMoves(boss.name);
            return lum.length ? (
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                {lum.map(mv=>(
                  <span key={mv.name} style={{display:'inline-flex',alignItems:'center',gap:3,padding:'2px 8px',background:'rgba(255,255,255,.04)',borderRadius:5,border:'1px solid var(--border)',fontSize:11,color:'var(--text-muted)'}}>
                    <TypeBadge t={mv.type}/>{mv.name} <span style={{color:'var(--text-faint)',fontSize:9}}>BP{mv.bp}</span>
                  </span>
                ))}
              </div>
            ) : <div style={{fontSize:11,color:'var(--text-faint)'}}>No level-up moves found — add custom moves above.</div>;
          })()}
          {boss.customMoves.map((mv,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr 60px auto',gap:6,alignItems:'center',marginBottom:4}}>
              <AutoInput label="" value={mv.name} searchFn={searchMoves}
                onChange={v=>{const found=lookupMove(v);const nm=[...boss.customMoves];nm[i]={...nm[i],name:v,type:found?.type||nm[i].type,cat:found?.cat||nm[i].cat,bp:found?.bp||nm[i].bp};setBoss({customMoves:nm});}}
                placeholder="Move name"/>
              <select style={SEL} value={mv.type} onChange={e=>{const nm=[...boss.customMoves];nm[i]={...nm[i],type:e.target.value};setBoss({customMoves:nm});}}>
                {ALL_TYPES.map(t=><option key={t}>{t}</option>)}
              </select>
              <select style={SEL} value={mv.cat} onChange={e=>{const nm=[...boss.customMoves];nm[i]={...nm[i],cat:e.target.value};setBoss({customMoves:nm});}}>
                <option value="Physical">Physical</option><option value="Special">Special</option>
              </select>
              <input type="number" style={{...INP,padding:'4px 6px'}} min={1} max={300} value={mv.bp}
                onChange={e=>{const nm=[...boss.customMoves];nm[i]={...nm[i],bp:Math.max(1,Number(e.target.value))};setBoss({customMoves:nm});}}/>
              <button onClick={()=>setBoss({customMoves:boss.customMoves.filter((_,j)=>j!==i)})}
                style={{padding:'4px 8px',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.25)',borderRadius:5,color:'#ef4444',cursor:'pointer',fontSize:12}}>✕</button>
            </div>
          ))}
        </div>
      </div>

      {/* Custom Pokémon panel */}
      <CustomPokemonPanel isAdmin={isAdmin} apiUrl={apiUrl} guildId={guildId}/>

      {/* Auto-Finder panel */}
      {boss.data&&<AutoFinderPanel
        boss={boss}
        bossBaseHP={bossBaseHP1R()}
        onLoadCounters={loadAutoFinderSlots}
        sdState={sdState}
      />}

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
          {counters.length>0&&(
            <button className="btn btn-ghost btn-sm" title="Save current team (first 6 slots) as a reusable template"
              onClick={()=>setTeamTemplate(counters.slice(0,6))}>
              💾 Save Template
            </button>
          )}
          {teamTemplate&&teamTemplate.length>0&&(
            <button className="btn btn-ghost btn-sm"
              title={"Replicate template across all " + boss.numRaiders + " raiders"}
              onClick={()=>{
                if (counters.length > 0 && !window.confirm(`This will overwrite all ${counters.length} current counter slots. Continue?`)) return;
                const tpl = teamTemplate.slice(0,6);
                const newCounters: CounterSlot[] = [];
                for (let r=0; r<boss.numRaiders; r++) {
                  tpl.forEach(slot => newCounters.push({...slot, id:_slotId++, result:null, error:'', raiderId:r+1}));
                }
                setCounters(newCounters); setCalc(false);
              }}>
              🔁 Apply to {boss.numRaiders} Raider{boss.numRaiders!==1?'s':''}
            </button>
          )}
          {boss.numRaiders>1&&counters.length>0&&(
            <button className="btn btn-ghost btn-sm" title="Append copies of ALL current counters for each additional raider"
              onClick={()=>{
                const extras: CounterSlot[] = [];
                for (let i=1; i<boss.numRaiders; i++) {
                  counters.forEach(c => extras.push({...c, id:_slotId++, result:null, error:''}));
                }
                setCounters(cs=>[...cs,...extras]);
              }}>
              ➕ Duplicate Raw
            </button>
          )}
        </div>
      </div>

      {/* Counter rows — with raider group labels when numRaiders > 1 */}
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {displayCounters.map((slot,idx)=>{
          const rpos = calculated ? rankedIds.indexOf(slot.id)+1 : null;
          const slotsPerRaider = boss.numRaiders > 1 ? Math.ceil(counters.length / boss.numRaiders) : 0;
          const showLabel = boss.numRaiders > 1 && slotsPerRaider > 0 && idx % slotsPerRaider === 0;
          const raiderNum  = boss.numRaiders > 1 ? Math.floor(idx / slotsPerRaider) + 1 : 0;
          return (
            <React.Fragment key={slot.id}>
              {showLabel&&(
                <div style={{marginTop:idx>0?8:0,fontSize:11,fontWeight:700,color:'#c4b5fd',
                  display:'flex',alignItems:'center',gap:6,letterSpacing:'.04em'}}>
                  <span style={{fontSize:13}}>👤</span> Raider {raiderNum}
                  <span style={{fontSize:9,color:'var(--text-faint)',fontWeight:400}}>
                    (slots {idx+1}–{Math.min(idx+slotsPerRaider, counters.length)})
                  </span>
                </div>
              )}
              <CounterRow key={slot.id} slot={slot} onChange={updateSlot} onRemove={removeSlot} rank={rpos&&rpos<=3?rpos:null}/>
            </React.Fragment>
          );
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
            {boss.numRaiders>1&&boss.hpIncreasePerRaider>0&&<span style={{fontWeight:400,color:'#f97316',textTransform:'none',fontSize:9}}> — {boss.numRaiders} raiders → {effectiveHp().toLocaleString()} HP</span>}
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

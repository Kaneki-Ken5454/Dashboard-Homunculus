import { useState, useEffect } from 'react';
import {
  lookupPoke,
  searchPokemon,
  weaknessChart,
  ALL_TYPES,
  TC_COLORS,
  LBL,
  SEL,
} from '../lib/engine_pokemon';
import { TypeBadge, AutoInput } from '../lib/pokemon_components';
import { apiCall } from '../lib/db';

interface AssignedCounter { pokemon: string; moves: string; notes: string; is_preferred: boolean; }

function _key(n: string) { return n.toLowerCase().replace(/[^a-z0-9]/g, '-'); }

const MULTIPLIER_SECTIONS = [
  { k:'quad',    label:'4× Weak',     color:'#f87171', bg:'rgba(248,113,113,0.08)', border:'rgba(248,113,113,0.18)' },
  { k:'double',  label:'2× Weak',     color:'#fb923c', bg:'rgba(251,146,60,0.08)',  border:'rgba(251,146,60,0.18)'  },
  { k:'half',    label:'½× Resists',  color:'#4ade80', bg:'rgba(74,222,128,0.06)',  border:'rgba(74,222,128,0.15)'  },
  { k:'quarter', label:'¼× Resists',  color:'#34d399', bg:'rgba(52,211,153,0.06)',  border:'rgba(52,211,153,0.15)'  },
  { k:'immune',  label:'Immune (0×)', color:'#6b7280', bg:'rgba(107,114,128,0.06)', border:'rgba(107,114,128,0.15)' },
];

export default function WeaknessLookup({ guildId }: { guildId?: string }) {
  const [poke, setPoke]  = useState('');
  const [tera, setTera]  = useState('');
  const [data, setData]  = useState<any>(null);
  const [err,  setErr]   = useState('');
  const [ctrs, setCtrs]  = useState<AssignedCounter[]>([]);
  const [ctrsLoading, setCtrsLoading] = useState(false);

  const loadCounters = async (pokeName: string) => {
    if (!guildId) return;
    setCtrsLoading(true);
    try {
      const bosses = await apiCall<any[]>('getRaidBosses', { guildId });
      const hit = (bosses || []).find((b: any) =>
        b.pokemon_key === _key(pokeName) || b.display_name?.toLowerCase() === pokeName.toLowerCase()
      );
      setCtrs(hit?.counters || []);
    } catch { setCtrs([]); }
    setCtrsLoading(false);
  };

  const onPokeChange = (v: string) => {
    setPoke(v);
    const p = lookupPoke(v);
    setData(p);
    setCtrs([]);
    setErr(v && !p ? `"${v}" not found — try spelling it differently` : '');
    if (p) loadCounters(v);
  };

  const types = tera ? [tera] : (data?.types || []);
  const chart = data ? weaknessChart(types, data.abilities[0]||'') : null;

  return (
    <div className="animate-fade" style={{maxWidth:760}}>
      {/* Search bar */}
      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end',marginBottom:18}}>
        <div style={{flex:'1 1 200px'}}>
          <AutoInput label="Pokémon" value={poke} searchFn={searchPokemon}
            onChange={onPokeChange} placeholder="e.g. Heatran, Dragapult…"/>
        </div>
        <div style={{minWidth:140}}>
          <label style={LBL}>Tera Type Override</label>
          <select style={SEL} value={tera} onChange={e=>setTera(e.target.value)}>
            <option value="">None (use base types)</option>
            {ALL_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {err && <div style={{color:'var(--danger)',fontSize:12,marginBottom:10,padding:'7px 12px',background:'var(--danger-subtle)',borderRadius:7}}>{err}</div>}

      {data && chart && (
        <div>
          {/* Header */}
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:14,flexWrap:'wrap',
            background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
            <span style={{fontSize:20,fontWeight:800,color:'#fff'}}>{data.name}</span>
            {data.types.map((t:string) => <TypeBadge key={t} t={t}/>)}
            {tera && (
              <>
                <span style={{fontSize:10,color:'var(--text-muted)',padding:'0 4px'}}>→ Tera</span>
                <TypeBadge t={tera}/>
              </>
            )}
            {data.abilities[0] && (
              <span style={{fontSize:11,color:'var(--text-muted)',marginLeft:'auto'}}>
                {data.abilities.join(' / ')}
              </span>
            )}
          </div>

          {/* Type chart sections */}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {MULTIPLIER_SECTIONS.map(s => {
              const lst: string[] = (chart as any)[s.k] || [];
              if (!lst.length) return null;
              return (
                <div key={s.k} style={{background:s.bg,border:`1px solid ${s.border}`,borderRadius:9,padding:'10px 14px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:7}}>
                    <span style={{fontSize:10,fontWeight:800,color:s.color,textTransform:'uppercase',letterSpacing:'.07em'}}>
                      {s.label}
                    </span>
                    <span style={{fontSize:10,color:'var(--text-faint)'}}>({lst.length} type{lst.length!==1?'s':''})</span>
                  </div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                    {lst.map(t => <TypeBadge key={t} t={t}/>)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Neutral note */}
          {(() => {
            const covered = new Set([
              ...(chart.quad||[]), ...(chart.double||[]), ...(chart.half||[]),
              ...(chart.quarter||[]), ...(chart.immune||[])
            ]);
            const neutral = ALL_TYPES.filter(t => !covered.has(t));
            if (!neutral.length) return null;
            return (
              <div style={{marginTop:8,background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:9,padding:'10px 14px'}}>
                <div style={{fontSize:10,fontWeight:700,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:7}}>
                  1× Neutral ({neutral.length} types)
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5,opacity:.6}}>
                  {neutral.map(t => <TypeBadge key={t} t={t}/>)}
                </div>
              </div>
            );
          })()}

          {/* Assigned Counters (read-only) */}
          {guildId && (
            <div style={{marginTop:10,background:'rgba(88,101,242,0.06)',border:'1px solid rgba(88,101,242,0.22)',borderRadius:9,padding:'12px 14px'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <span style={{fontSize:10,fontWeight:800,color:'#818cf8',textTransform:'uppercase',letterSpacing:'.08em'}}>⭐ Assigned Counters</span>
                {ctrsLoading && <span style={{fontSize:10,color:'var(--text-faint)'}}>Loading…</span>}
                <span style={{fontSize:10,color:'var(--text-faint)',marginLeft:'auto'}}>Saved to /bossinfo</span>
              </div>
              {ctrs.length === 0 && !ctrsLoading ? (
                <div style={{fontSize:12,color:'var(--text-faint)',textAlign:'center',padding:'12px 0'}}>No counters assigned for this boss yet.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {ctrs.map((c,i) => (
                    <div key={i} style={{display:'flex',alignItems:'flex-start',gap:10,padding:'8px 10px',borderRadius:7,background:'rgba(0,0,0,.2)',border:`1px solid ${c.is_preferred?'rgba(251,191,36,.25)':'rgba(255,255,255,.05)'}`}}>
                      {c.is_preferred && <span style={{fontSize:13,flexShrink:0}}>⭐</span>}
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{c.pokemon}</div>
                        {c.moves && <div style={{fontSize:11,color:'#818cf8',marginTop:2}}>{c.moves}</div>}
                        {c.notes && <div style={{fontSize:11,color:'var(--text-muted)',marginTop:1}}>{c.notes}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Base stats quick glance */}
          <div style={{marginTop:10,background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:9,padding:'12px 14px'}}>
            <div style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:10}}>
              Base Stats — BST {data.bst}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:5}}>
              {(['hp','atk','def','spa','spd','spe'] as const).map(stat => {
                const labels: Record<string,string> = {hp:'HP',atk:'Atk',def:'Def',spa:'SpA',spd:'SpD',spe:'Spe'};
                const val = data.stats[stat];
                const pct = Math.round(val/255*100);
                const col = val>=120?'#f87171':val>=90?'#fb923c':val>=60?'#fbbf24':'#6b7280';
                return (
                  <div key={stat} style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{fontSize:10,fontWeight:700,color:'var(--text-muted)',minWidth:28,textTransform:'uppercase'}}>{labels[stat]}</span>
                    <div style={{flex:1,height:7,background:'rgba(255,255,255,0.07)',borderRadius:3,overflow:'hidden'}}>
                      <div style={{width:`${pct}%`,height:'100%',background:col,borderRadius:3,transition:'width .3s'}}/>
                    </div>
                    <span style={{fontSize:11,fontFamily:"'JetBrains Mono',monospace",color:'var(--text)',minWidth:28,textAlign:'right',fontWeight:700}}>{val}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!data && !err && (
        <div style={{textAlign:'center',padding:'48px 0',color:'var(--text-faint)'}}>
          <div style={{fontSize:40,marginBottom:12}}>🛡️</div>
          <div style={{fontSize:14,fontWeight:600,color:'var(--text-muted)',marginBottom:4}}>Type Weakness Lookup</div>
          <div style={{fontSize:12,color:'var(--text-faint)'}}>Search any Pokémon to see their full type chart</div>
        </div>
      )}
    </div>
  );
}

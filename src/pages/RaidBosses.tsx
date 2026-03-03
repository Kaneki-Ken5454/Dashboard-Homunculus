import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Pencil, Shield, ChevronDown, ChevronUp, X, Save, Eye, EyeOff, Swords, Search } from 'lucide-react';
import { apiCall } from '../lib/db';

interface Props { guildId: string }

interface Counter {
  pokemon: string;
  moves: string;
  notes: string;
  is_preferred: boolean;
}

interface RaidBoss {
  id?: number;
  guild_id?: string;
  pokemon_key: string;
  display_name: string;
  types: string[];
  notes: string;
  counters: Counter[];
  is_active: boolean;
}

const ALL_TYPES = ['Normal','Fire','Water','Grass','Electric','Ice','Fighting','Poison',
  'Ground','Flying','Psychic','Bug','Rock','Ghost','Dragon','Dark','Steel','Fairy'];
const TC: Record<string,string> = {
  Fire:'#FF4422',Water:'#3399FF',Grass:'#33CC44',Electric:'#FFCC00',Ice:'#66CCFF',
  Fighting:'#CC3300',Poison:'#993399',Ground:'#CCAA55',Flying:'#88AAFF',Psychic:'#FF5599',
  Bug:'#AABB22',Rock:'#BBAA66',Ghost:'#664477',Dragon:'#7744FF',Dark:'#554433',
  Steel:'#AAAABB',Fairy:'#FFAACC',Normal:'#AAAA88'
};

function TypeBadge({ t }: { t: string }) {
  return <span style={{ background: TC[t]||'#555', color:'#fff', borderRadius:4,
    padding:'2px 9px', fontSize:11, fontWeight:700 }}>{t}</span>;
}

function AutoInput({ value, onChange, url, placeholder, style={} }: {
  value:string; onChange:(v:string)=>void; url:string; placeholder?:string; style?:React.CSSProperties;
}) {
  const [opts, setOpts] = useState<string[]>([]);
  const [show, setShow] = useState(false);
  let timer: any = null;
  const search = (v:string) => {
    onChange(v);
    if (timer) clearTimeout(timer);
    if (v.length < 2) { setOpts([]); setShow(false); return; }
    timer = setTimeout(async () => {
      try {
        const r = await fetch(`/api${url}?q=${encodeURIComponent(v)}`);
        const d = await r.json();
        setOpts(d.results||[]);
        setShow(true);
      } catch {}
    }, 200);
  };
  return (
    <div style={{ position:'relative', ...style }}>
      <input className="inp" value={value}
        onChange={e => search(e.target.value)}
        onBlur={() => setTimeout(() => setShow(false), 130)}
        onFocus={() => opts.length > 0 && setShow(true)}
        placeholder={placeholder}
      />
      {show && opts.length > 0 && (
        <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'var(--surface)',
          border:'1px solid var(--border)', borderRadius:7, zIndex:500, maxHeight:160,
          overflowY:'auto', marginTop:2, boxShadow:'0 8px 32px rgba(0,0,0,0.6)' }}>
          {opts.map(x => (
            <div key={x} onMouseDown={() => { onChange(x); setShow(false); setOpts([]); }}
              className="data-row" style={{ padding:'7px 12px', cursor:'pointer', fontSize:13, color:'var(--text)' }}>
              {x}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CounterRow({ counter, onChange, onRemove }: {
  counter:Counter; onChange:(c:Counter)=>void; onRemove:()=>void;
}) {
  const set = (p: Partial<Counter>) => onChange({...counter,...p});
  return (
    <div style={{ display:'grid', gridTemplateColumns:'180px 1fr 1fr auto auto', gap:8,
      alignItems:'center', padding:'8px 10px', background:'var(--elevated)', borderRadius:7, marginBottom:5 }}>
      <AutoInput value={counter.pokemon} url="/bossinfo/search" placeholder="Pokémon name"
        onChange={v => set({pokemon:v})} />
      <input className="inp" placeholder="Key moves (e.g. Dragon Claw)" value={counter.moves}
        onChange={e => set({moves:e.target.value})} style={{fontSize:12}} />
      <input className="inp" placeholder="Notes (optional)" value={counter.notes}
        onChange={e => set({notes:e.target.value})} style={{fontSize:12}} />
      <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:11,
        color:'var(--text-muted)', cursor:'pointer', whiteSpace:'nowrap' }}>
        <input type="checkbox" checked={counter.is_preferred}
          onChange={e => set({is_preferred:e.target.checked})} /> ⭐
      </label>
      <button onClick={onRemove} className="btn btn-danger btn-sm"><X size={12}/></button>
    </div>
  );
}

function BossEditor({ boss, guildId, onSave, onClose }: {
  boss:Partial<RaidBoss>; guildId:string; onSave:()=>void; onClose:()=>void;
}) {
  const [form, setForm] = useState<RaidBoss>({
    pokemon_key: boss.pokemon_key||'', display_name: boss.display_name||'',
    types: boss.types||[], notes: boss.notes||'',
    counters: boss.counters||[], is_active: boss.is_active!==false, id:boss.id,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [pokeSearch, setPokeSearch] = useState(boss.display_name||'');
  const [autofilling, setAF] = useState(false);

  const addCounter = () => setForm(f => ({...f, counters:[...f.counters,{pokemon:'',moves:'',notes:'',is_preferred:false}]}));
  const updCounter = (i:number, c:Counter) => setForm(f => ({...f, counters:f.counters.map((x,j)=>j===i?c:x)}));
  const delCounter = (i:number) => setForm(f => ({...f, counters:f.counters.filter((_,j)=>j!==i)}));
  const toggleType = (t:string) => setForm(f => ({...f, types: f.types.includes(t)?f.types.filter(x=>x!==t):[...f.types,t]}));

  const autoFill = async (name:string) => {
    if (!name.trim()) return;
    setAF(true);
    try {
      const r = await fetch(`/api/bossinfo/analyze?pokemon=${encodeURIComponent(name)}`);
      const d = await r.json();
      if (d.name && d.types) {
        const pkey = name.toLowerCase().replace(/[\s\-']/g,'');
        setForm(f => ({...f, pokemon_key:pkey, display_name:d.name, types:d.types}));
        setPokeSearch(d.name);
      }
    } catch {}
    setAF(false);
  };

  const save = async () => {
    if (!form.display_name.trim()) { setErr('Display name is required.'); return; }
    setSaving(true); setErr('');
    try { await apiCall('upsertRaidBoss', { guildId, data:form }); onSave(); }
    catch (e) { setErr((e as Error).message); }
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', zIndex:600,
      display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14,
        padding:24, width:'100%', maxWidth:740, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <Swords size={18} style={{color:'#818cf8'}}/>
            <span style={{ fontSize:16, fontWeight:700, color:'var(--text)' }}>
              {boss.id ? 'Edit Raid Boss' : 'Add Raid Boss'}
            </span>
          </div>
          <button onClick={onClose} className="btn btn-ghost btn-sm"><X size={15}/></button>
        </div>

        {err && <div style={{ background:'var(--danger-subtle)', border:'1px solid var(--danger)',
          borderRadius:8, padding:'8px 12px', color:'var(--danger)', fontSize:13, marginBottom:14 }}>{err}</div>}

        {/* Pokémon search */}
        <div style={{marginBottom:14}}>
          <label className="lbl">Pokémon name</label>
          <div style={{display:'flex',gap:8}}>
            <AutoInput value={pokeSearch} url="/bossinfo/search" style={{flex:1}}
              placeholder="e.g. Garchomp"
              onChange={v => { setPokeSearch(v); setForm(f=>({...f,display_name:v})); }} />
            <button className="btn btn-primary" onClick={() => autoFill(pokeSearch)}
              disabled={autofilling||!pokeSearch.trim()}>
              {autofilling ? '…' : '⚡ Auto-fill Types'}
            </button>
          </div>
          <div style={{fontSize:11,color:'var(--text-faint)',marginTop:3}}>
            Auto-fill loads types from Showdown data automatically
          </div>
        </div>

        {/* Display name */}
        <div style={{marginBottom:14}}>
          <label className="lbl">Display Name (shown to users)</label>
          <input className="inp" value={form.display_name} placeholder="e.g. Garchomp (5-Star Raid)"
            onChange={e => setForm(f=>({...f,display_name:e.target.value}))} />
        </div>

        {/* Types */}
        <div style={{marginBottom:14}}>
          <label className="lbl">Types</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
            {ALL_TYPES.map(t => (
              <button key={t} onClick={() => toggleType(t)}
                style={{ background:form.types.includes(t)?TC[t]:'var(--elevated)',
                  border:`1px solid ${form.types.includes(t)?TC[t]:'var(--border)'}`,
                  color:form.types.includes(t)?'#fff':'var(--text-muted)',
                  borderRadius:4, padding:'3px 10px', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div style={{marginBottom:14}}>
          <label className="lbl">Strategy Notes</label>
          <textarea className="inp" value={form.notes} rows={3}
            placeholder="e.g. Watch out for Earthquake. Bring Fairy/Ice types. Boss level 50."
            onChange={e => setForm(f=>({...f,notes:e.target.value}))}
            style={{resize:'vertical',fontFamily:'inherit',fontSize:13}} />
        </div>

        {/* Active */}
        <div style={{marginBottom:18}}>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer',fontSize:13}}>
            <input type="checkbox" checked={form.is_active}
              onChange={e => setForm(f=>({...f,is_active:e.target.checked}))} />
            <span style={{color:'var(--text)'}}>Active — visible when users run /bossinfo</span>
          </label>
        </div>

        {/* Counters */}
        <div style={{borderTop:'1px solid var(--border)',paddingTop:16,marginBottom:16}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <div>
              <span style={{fontSize:14,fontWeight:600,color:'var(--text)'}}>Recommended Counters</span>
              <span style={{fontSize:12,color:'var(--text-muted)',marginLeft:8}}>
                ({form.counters.length} added · ⭐ = best counter)
              </span>
            </div>
            <button className="btn btn-primary" onClick={addCounter} style={{fontSize:12}}>
              <Plus size={13}/> Add Counter
            </button>
          </div>
          {form.counters.length === 0 ? (
            <div style={{textAlign:'center',padding:'20px 0',color:'var(--text-faint)',fontSize:13}}>
              No counters yet — add Pokémon that work well against this boss
            </div>
          ) : (
            <div>
              <div style={{display:'grid',gridTemplateColumns:'180px 1fr 1fr auto auto',
                gap:8, marginBottom:5, padding:'0 10px'}}>
                {['Pokémon','Key Moves','Notes','Best',''].map((h,i) => (
                  <span key={i} style={{fontSize:10,color:'var(--text-faint)',fontWeight:700,
                    textTransform:'uppercase',letterSpacing:'0.05em'}}>{h}</span>
                ))}
              </div>
              {form.counters.map((c,i) => (
                <CounterRow key={i} counter={c}
                  onChange={nc => updCounter(i,nc)}
                  onRemove={() => delCounter(i)} />
              ))}
            </div>
          )}
        </div>

        <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            <Save size={14}/> {saving ? 'Saving…' : 'Save Boss'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RaidBossesPage({ guildId }: Props) {
  const [bosses, setBosses]     = useState<RaidBoss[]>([]);
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState('');
  const [search, setSearch]     = useState('');
  const [editing, setEditing]   = useState<Partial<RaidBoss>|null>(null);
  const [expanded, setExpanded] = useState<number|null>(null);

  const load = useCallback(() => {
    if (!guildId) return;
    setLoading(true);
    apiCall<RaidBoss[]>('getRaidBosses', { guildId })
      .then(rows => setBosses(rows||[]))
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [guildId]);

  useEffect(load, [load]);

  const del = async (b:RaidBoss) => {
    if (!confirm(`Delete "${b.display_name}"?`)) return;
    await apiCall('deleteRaidBoss', { guildId, id:b.id }).catch(()=>{});
    load();
  };

  const toggleActive = async (b:RaidBoss) => {
    await apiCall('setRaidBossActive', { guildId, id:b.id, active:!b.is_active }).catch(()=>{});
    setBosses(prev => prev.map(x => x.id===b.id ? {...x,is_active:!b.is_active} : x));
  };

  const filtered = bosses.filter(b =>
    !search || b.display_name.toLowerCase().includes(search.toLowerCase())
  );
  const active   = filtered.filter(b =>  b.is_active);
  const inactive = filtered.filter(b => !b.is_active);

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300}}>
      <div style={{width:32,height:32,border:'2px solid var(--border)',
        borderTopColor:'var(--primary)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
    </div>
  );

  function BossCard({ b }: { b:RaidBoss }) {
    const open = expanded === b.id;
    const preferred = b.counters.filter(c => c.is_preferred);
    const regular   = b.counters.filter(c => !c.is_preferred);
    return (
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',
        borderRadius:10,overflow:'hidden',opacity:b.is_active?1:0.55}}>
        <div style={{padding:'12px 16px',display:'flex',alignItems:'center',gap:12}}>
          <div style={{flex:1}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>{b.display_name}</span>
              {b.types.map(t => <TypeBadge key={t} t={t}/>)}
              {!b.is_active && <span style={{fontSize:10,background:'rgba(107,114,128,0.2)',
                color:'#6b7280',borderRadius:4,padding:'1px 6px',fontWeight:600}}>INACTIVE</span>}
            </div>
            <div style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>
              {b.counters.length} counter{b.counters.length!==1?'s':''}{b.notes?' · has notes':''}
            </div>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            <button onClick={() => toggleActive(b)} className="btn btn-ghost btn-sm" title={b.is_active?'Deactivate':'Activate'}>
              {b.is_active ? <Eye size={13}/> : <EyeOff size={13}/>}
            </button>
            <button onClick={() => setEditing(b)} className="btn btn-ghost btn-sm"><Pencil size={13}/></button>
            <button onClick={() => del(b)} className="btn btn-danger btn-sm"><Trash2 size={13}/></button>
            <button onClick={() => setExpanded(open?null:(b.id??null))} className="btn btn-ghost btn-sm">
              {open ? <ChevronUp size={13}/> : <ChevronDown size={13}/>}
            </button>
          </div>
        </div>

        {open && (
          <div style={{borderTop:'1px solid var(--border)',padding:'14px 16px'}}>
            {b.notes && (
              <div style={{background:'var(--elevated)',borderRadius:7,padding:'10px 12px',
                marginBottom:12,fontSize:13,color:'var(--text)',lineHeight:1.55,
                borderLeft:'3px solid #5865f2'}}>
                <div style={{fontSize:10,fontWeight:700,color:'#5865f2',textTransform:'uppercase',
                  letterSpacing:'0.06em',marginBottom:5}}>📋 Strategy Notes</div>
                {b.notes}
              </div>
            )}
            {preferred.length > 0 && (
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,fontWeight:700,color:'#fbbf24',textTransform:'uppercase',
                  letterSpacing:'0.06em',marginBottom:6}}>⭐ Best Counters</div>
                {preferred.map((c,i) => (
                  <div key={i} style={{display:'flex',gap:10,background:'rgba(251,191,36,0.07)',
                    border:'1px solid rgba(251,191,36,0.2)',borderRadius:7,padding:'8px 12px',marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:700,color:'var(--text)',minWidth:130}}>{c.pokemon}</span>
                    {c.moves && <span style={{fontSize:12,color:'#818cf8'}}>{c.moves}</span>}
                    {c.notes && <span style={{fontSize:12,color:'var(--text-muted)',flex:1}}>{c.notes}</span>}
                  </div>
                ))}
              </div>
            )}
            {regular.length > 0 && (
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',
                  letterSpacing:'0.06em',marginBottom:6}}>Other Counters</div>
                {regular.map((c,i) => (
                  <div key={i} style={{display:'flex',gap:10,background:'var(--elevated)',
                    borderRadius:6,padding:'7px 10px',marginBottom:3}}>
                    <span style={{fontSize:13,color:'var(--text)',minWidth:130}}>{c.pokemon}</span>
                    {c.moves && <span style={{fontSize:12,color:'#818cf8'}}>{c.moves}</span>}
                    {c.notes && <span style={{fontSize:12,color:'var(--text-muted)',flex:1}}>{c.notes}</span>}
                  </div>
                ))}
              </div>
            )}
            {b.counters.length === 0 && (
              <div style={{textAlign:'center',color:'var(--text-faint)',fontSize:13,padding:'8px 0'}}>
                No counters configured.
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade">
      {editing !== null && (
        <BossEditor boss={editing} guildId={guildId}
          onClose={() => setEditing(null)}
          onSave={() => { setEditing(null); load(); }} />
      )}

      {err && (
        <div style={{background:'var(--danger-subtle)',border:'1px solid var(--danger)',
          borderRadius:10,padding:'10px 14px',color:'var(--danger)',fontSize:13,marginBottom:14}}>
          {err}
        </div>
      )}

      {/* Toolbar */}
      <div style={{display:'flex',gap:10,marginBottom:18,alignItems:'center'}}>
        <div style={{position:'relative',flex:1,maxWidth:280}}>
          <Search size={13} style={{position:'absolute',left:10,top:'50%',
            transform:'translateY(-50%)',color:'var(--text-faint)'}}/>
          <input className="inp" style={{paddingLeft:30}} placeholder="Search bosses…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{marginLeft:'auto',display:'flex',gap:8,alignItems:'center'}}>
          <span style={{fontSize:12,color:'var(--text-muted)'}}>{active.length} active</span>
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus size={14}/> Add Raid Boss
          </button>
        </div>
      </div>

      {/* Info banner */}
      <div style={{background:'rgba(88,101,242,0.08)',border:'1px solid rgba(88,101,242,0.2)',
        borderRadius:9,padding:'10px 14px',marginBottom:18,fontSize:13,color:'var(--text-muted)',
        display:'flex',gap:10,alignItems:'flex-start'}}>
        <Shield size={15} style={{color:'#818cf8',flexShrink:0,marginTop:1}}/>
        <span>
          Raid bosses appear in Discord via <code style={{background:'rgba(255,255,255,0.1)',padding:'1px 5px',borderRadius:3}}>/bossinfo [pokemon]</code>.
          Each entry shows type weaknesses, strategy notes, and your configured counters.
          Toggle inactive to hide without deleting.
        </span>
      </div>

      {active.length > 0 && (
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:'#4ade80'}}/>
            <span style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',
              textTransform:'uppercase',letterSpacing:'0.06em'}}>Active</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {active.map(b => <BossCard key={b.id} b={b}/>)}
          </div>
        </div>
      )}

      {inactive.length > 0 && (
        <div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:'#6b7280'}}/>
            <span style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',
              textTransform:'uppercase',letterSpacing:'0.06em'}}>Inactive</span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {inactive.map(b => <BossCard key={b.id} b={b}/>)}
          </div>
        </div>
      )}

      {bosses.length === 0 && !loading && (
        <div style={{textAlign:'center',padding:'64px 20px'}}>
          <Swords size={40} style={{color:'var(--text-faint)',marginBottom:14,display:'block',margin:'0 auto 14px'}}/>
          <div style={{fontSize:16,fontWeight:600,color:'var(--text-muted)',marginBottom:6}}>No raid bosses yet</div>
          <div style={{fontSize:13,color:'var(--text-faint)',marginBottom:20}}>
            Add raid bosses to show weaknesses and counters in Discord.
          </div>
          <button className="btn btn-primary" onClick={() => setEditing({})}>
            <Plus size={14}/> Add Your First Boss
          </button>
        </div>
      )}
    </div>
  );
}

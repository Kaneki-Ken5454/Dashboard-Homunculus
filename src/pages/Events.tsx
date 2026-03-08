/**
 * Events.tsx — Event Scheduler
 * Dashboard creates/edits events; bot auto-announces them when starts_at arrives.
 */
import { useEffect, useState } from 'react';
import { Calendar, Plus, Trash2, Edit3, Send, Clock, Hash, Bell, RefreshCw, Repeat, ChevronDown, ChevronUp, X } from 'lucide-react';
import { apiCall } from '../lib/db';

interface Props { guildId: string; }

interface Event {
  id: number; title: string; description: string;
  channel_id: string|null; role_ping_id: string|null;
  event_type: string; starts_at: string; ends_at: string|null;
  recurrence: string; recurrence_days: string[];
  image_url: string|null; announced: boolean; created_at: string;
}

const EVENT_TYPES = ['raid','tournament','community','meeting','announcement','other'];
const RECURRENCE  = ['none','daily','weekly','biweekly','monthly'];
const WEEKDAYS    = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

const INP: React.CSSProperties = {
  background:'var(--elevated)', border:'1px solid var(--border)', borderRadius:8,
  color:'var(--text)', fontSize:13, padding:'8px 12px', width:'100%',
  fontFamily:'Lexend,sans-serif', outline:'none', boxSizing:'border-box',
};
const LBL: React.CSSProperties = {
  fontSize:11, fontWeight:600, color:'var(--text-muted)', letterSpacing:'0.06em',
  textTransform:'uppercase', marginBottom:5, display:'block',
};
const TYPE_COLOR: Record<string,string> = {
  raid:'#ef4444', tournament:'#f59e0b', community:'#22c55e',
  meeting:'#5865f2', announcement:'#a78bfa', other:'#6b7280',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month:'short', day:'numeric', year:'numeric',
    hour:'2-digit', minute:'2-digit',
  });
}
function toInputVal(iso?: string|null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n:number) => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY = (): Omit<Event,'id'|'announced'|'created_at'> => ({
  title:'', description:'', channel_id:'', role_ping_id:'',
  event_type:'raid', starts_at:toInputVal(new Date(Date.now()+3600000).toISOString()),
  ends_at:'', recurrence:'none', recurrence_days:[], image_url:'',
});

export default function EventsPage({ guildId }: Props): JSX.Element {
  const [events,   setEvents]   = useState<Event[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<Event|null>(null);
  const [form,     setForm]     = useState(EMPTY());
  const [saving,   setSaving]   = useState(false);
  const [expanded, setExpanded] = useState<number|null>(null);
  const [filter,   setFilter]   = useState<'upcoming'|'past'|'all'>('upcoming');

  const load = async () => {
    if (!guildId) return;
    setLoading(true);
    const rows = await apiCall<Event[]>('getEvents',{guildId}).catch(()=>[]);
    setEvents(rows as Event[]);
    setLoading(false);
  };
  useEffect(()=>{ load(); },[guildId]);

  const openCreate = () => { setEditing(null); setForm(EMPTY()); setShowForm(true); };
  const openEdit   = (ev: Event) => {
    setEditing(ev);
    setForm({ title:ev.title, description:ev.description||'', channel_id:ev.channel_id||'',
      role_ping_id:ev.role_ping_id||'', event_type:ev.event_type, starts_at:toInputVal(ev.starts_at),
      ends_at:toInputVal(ev.ends_at), recurrence:ev.recurrence, recurrence_days:ev.recurrence_days||[],
      image_url:ev.image_url||'' });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title.trim()||!form.starts_at) return;
    setSaving(true);
    try {
      const payload = { guildId, ...form,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at:   form.ends_at ? new Date(form.ends_at).toISOString() : null,
      };
      if (editing) await apiCall('updateEvent',{...payload,id:editing.id});
      else         await apiCall('createEvent',payload);
      await load(); setShowForm(false);
    } catch(e) {
      alert('Failed to save event: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const del = async (id:number) => {
    if (!confirm('Delete this event?')) return;
    await apiCall('deleteEvent',{id,guildId});
    setEvents(prev=>prev.filter(e=>e.id!==id));
  };

  const now = Date.now();
  const filtered = events.filter(e=>{
    const ts = new Date(e.starts_at).getTime();
    if (filter==='upcoming') return ts>=now;
    if (filter==='past')     return ts<now;
    return true;
  }).sort((a,b)=> filter==='past'
    ? new Date(b.starts_at).getTime()-new Date(a.starts_at).getTime()
    : new Date(a.starts_at).getTime()-new Date(b.starts_at).getTime()
  );

  const upcoming = events.filter(e=>new Date(e.starts_at).getTime()>=now&&!e.announced).length;

  return (
    <div className="animate-fade" style={{display:'flex',flexDirection:'column',gap:16}}>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:4,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:4}}>
          {(['upcoming','past','all'] as const).map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{padding:'6px 14px',borderRadius:7,border:'none',cursor:'pointer',background:filter===f?'var(--elevated)':'transparent',color:filter===f?'var(--text)':'var(--text-muted)',fontSize:12,fontFamily:'Lexend,sans-serif',fontWeight:filter===f?700:400,textTransform:'capitalize'}}>
              {f}
            </button>
          ))}
        </div>
        {upcoming>0&&<div style={{fontSize:12,color:'#f59e0b',display:'flex',alignItems:'center',gap:5,background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.3)',borderRadius:8,padding:'5px 10px'}}><Bell size={12}/>{upcoming} event{upcoming>1?'s':''} pending announcement</div>}
        <button onClick={openCreate} style={{marginLeft:'auto',padding:'8px 16px',background:'var(--primary)',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'Lexend,sans-serif',display:'flex',alignItems:'center',gap:7}}>
          <Plus size={14}/>New Event
        </button>
        <button onClick={load} style={{padding:'8px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-muted)',cursor:'pointer'}}><RefreshCw size={13}/></button>
      </div>

      {/* Event form modal */}
      {showForm&&(
        <>
          <div onClick={()=>setShowForm(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:40}}/>
          <div style={{position:'fixed',inset:0,zIndex:50,overflowY:'auto',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px 10px'}}>
          <div style={{width:560,maxWidth:'95vw',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:14,padding:24,marginTop:'auto',marginBottom:'auto'}} onClick={e=>e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
              <div style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>{editing?'Edit Event':'New Event'}</div>
              <button onClick={()=>setShowForm(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-faint)'}}><X size={16}/></button>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div><label style={LBL}>Event Title *</label><input style={INP} placeholder="Mega Garchomp Raid Night" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div>
              <div><label style={LBL}>Description</label><textarea style={{...INP,minHeight:72,resize:'vertical'}} placeholder="What's happening? Any prep tips…" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={LBL}>Event Type</label>
                  <select style={INP} value={form.event_type} onChange={e=>setForm(f=>({...f,event_type:e.target.value}))}>
                    {EVENT_TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LBL}>Announce Channel ID</label>
                  <input style={INP} placeholder="Discord Channel ID" value={form.channel_id||''} onChange={e=>setForm(f=>({...f,channel_id:e.target.value}))}/>
                </div>
                <div>
                  <label style={LBL}>Starts At *</label>
                  <input style={INP} type="datetime-local" value={form.starts_at} onChange={e=>setForm(f=>({...f,starts_at:e.target.value}))}/>
                </div>
                <div>
                  <label style={LBL}>Ends At (optional)</label>
                  <input style={INP} type="datetime-local" value={form.ends_at||''} onChange={e=>setForm(f=>({...f,ends_at:e.target.value}))}/>
                </div>
                <div>
                  <label style={LBL}>Ping Role ID (optional)</label>
                  <input style={INP} placeholder="Role to @ping" value={form.role_ping_id||''} onChange={e=>setForm(f=>({...f,role_ping_id:e.target.value}))}/>
                </div>
                <div>
                  <label style={LBL}>Recurrence</label>
                  <select style={INP} value={form.recurrence} onChange={e=>setForm(f=>({...f,recurrence:e.target.value}))}>
                    {RECURRENCE.map(r=><option key={r} value={r}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              {form.recurrence==='weekly'&&(
                <div>
                  <label style={LBL}>Repeat on days</label>
                  <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                    {WEEKDAYS.map(d=>(
                      <button key={d} onClick={()=>setForm(f=>({...f,recurrence_days:f.recurrence_days.includes(d)?f.recurrence_days.filter(x=>x!==d):[...f.recurrence_days,d]}))}
                        style={{padding:'4px 10px',borderRadius:6,border:'1px solid var(--border)',background:form.recurrence_days.includes(d)?'rgba(88,101,242,.25)':'transparent',color:form.recurrence_days.includes(d)?'#818cf8':'var(--text-muted)',cursor:'pointer',fontSize:12,fontFamily:'Lexend,sans-serif'}}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div><label style={LBL}>Image URL (optional)</label><input style={INP} placeholder="https://…" value={form.image_url||''} onChange={e=>setForm(f=>({...f,image_url:e.target.value}))}/></div>
              <div style={{padding:'10px 14px',background:'rgba(88,101,242,.08)',border:'1px solid rgba(88,101,242,.2)',borderRadius:8,fontSize:12,color:'var(--text-muted)',display:'flex',alignItems:'center',gap:8}}>
                <Bell size={12} style={{color:'#818cf8',flexShrink:0}}/>
                The bot will automatically announce this event in the specified channel when the start time arrives.
              </div>
              <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:4}}>
                <button onClick={()=>setShowForm(false)} style={{padding:'8px 20px',background:'transparent',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-muted)',cursor:'pointer',fontSize:13,fontFamily:'Lexend,sans-serif'}}>Cancel</button>
                <button onClick={save} disabled={saving||!form.title.trim()} style={{padding:'8px 20px',background:'var(--primary)',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'Lexend,sans-serif',opacity:(saving||!form.title.trim())?.6:1}}>
                  {saving?'Saving…':editing?'Save Changes':'Create Event'}
                </button>
              </div>
            </div>
          </div>
          </div>
        </>
      )}

      {/* Events list */}
      {loading?(
        <div style={{display:'flex',justifyContent:'center',padding:60}}><div style={{width:28,height:28,border:'2px solid var(--border)',borderTopColor:'var(--primary)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/></div>
      ):filtered.length===0?(
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'60px 20px',textAlign:'center'}}>
          <Calendar size={32} style={{color:'var(--text-faint)',display:'block',margin:'0 auto 12px'}}/>
          <div style={{color:'var(--text-muted)',fontSize:14}}>No {filter==='all'?'':filter} events</div>
          <button onClick={openCreate} style={{marginTop:14,padding:'7px 18px',background:'var(--primary)',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:12,fontFamily:'Lexend,sans-serif',fontWeight:700}}>Create one</button>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.map(ev=>{
            const isPast = new Date(ev.starts_at).getTime()<now;
            const isExpanded = expanded===ev.id;
            return (
              <div key={ev.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',opacity:isPast?.7:1}}>
                <div style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:'pointer'}} onClick={()=>setExpanded(isExpanded?null:ev.id)}>
                  <div style={{width:8,height:8,borderRadius:4,background:TYPE_COLOR[ev.event_type]||'#6b7280',flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:14,fontWeight:700,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ev.title}</span>
                      <span style={{fontSize:10,fontWeight:700,color:TYPE_COLOR[ev.event_type],background:`${TYPE_COLOR[ev.event_type]}18`,padding:'2px 8px',borderRadius:4,textTransform:'uppercase',flexShrink:0}}>{ev.event_type}</span>
                      {ev.announced&&<span style={{fontSize:10,color:'var(--success)',background:'rgba(34,197,94,.1)',padding:'2px 8px',borderRadius:4,flexShrink:0}}>✓ Announced</span>}
                      {ev.recurrence!=='none'&&<span style={{fontSize:10,color:'#818cf8',display:'flex',alignItems:'center',gap:3,flexShrink:0}}><Repeat size={10}/>{ev.recurrence}</span>}
                    </div>
                    <div style={{fontSize:12,color:'var(--text-muted)',marginTop:3,display:'flex',gap:14,flexWrap:'wrap'}}>
                      <span style={{display:'flex',alignItems:'center',gap:4}}><Clock size={11}/>{fmtDate(ev.starts_at)}</span>
                      {ev.channel_id&&<span style={{display:'flex',alignItems:'center',gap:4}}><Hash size={11}/>{ev.channel_id}</span>}
                    </div>
                  </div>
                  <div style={{display:'flex',gap:6,alignItems:'center'}}>
                    <button onClick={e=>{e.stopPropagation();openEdit(ev);}} style={{padding:'5px 10px',background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:7,color:'var(--text-muted)',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',gap:4}}><Edit3 size={11}/>Edit</button>
                    <button onClick={e=>{e.stopPropagation();del(ev.id);}} style={{padding:'5px',background:'transparent',border:'none',cursor:'pointer',color:'var(--text-faint)'}}><Trash2 size={13}/></button>
                    {isExpanded?<ChevronUp size={13} style={{color:'var(--text-faint)'}}/>:<ChevronDown size={13} style={{color:'var(--text-faint)'}}/>}
                  </div>
                </div>
                {isExpanded&&(
                  <div style={{borderTop:'1px solid var(--border)',padding:'12px 16px 14px',background:'var(--elevated)'}}>
                    {ev.description&&<p style={{fontSize:13,color:'var(--text)',margin:'0 0 10px',lineHeight:1.6}}>{ev.description}</p>}
                    <div style={{display:'flex',gap:16,flexWrap:'wrap',fontSize:12,color:'var(--text-muted)'}}>
                      {ev.ends_at&&<span><b>Ends:</b> {fmtDate(ev.ends_at)}</span>}
                      {ev.role_ping_id&&<span><b>Pings:</b> <span className="mono">{ev.role_ping_id}</span></span>}
                      {ev.image_url&&<span><b>Image:</b> <a href={ev.image_url} target="_blank" rel="noopener" style={{color:'var(--primary)'}}>view</a></span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Announcements.tsx — Announcement composer with embed preview
 * Draft → Send → Bot posts to Discord channel
 */
import { useEffect, useState } from 'react';
import { Megaphone, Plus, Send, Trash2, Edit3, Clock, CheckCircle, X, Eye, EyeOff, Hash } from 'lucide-react';
import { apiCall } from '../lib/db';

interface Props { guildId: string; }

interface Announcement {
  id: number; title: string|null; content: string; channel_id: string|null;
  role_ping_id: string|null; embed: boolean; embed_color: string;
  image_url: string|null; thumbnail_url: string|null; footer: string|null;
  status: 'draft'|'pending'|'sent'; sent_at: string|null;
  scheduled_at: string|null; sent_by: string|null; created_at: string;
}

const INP: React.CSSProperties = { background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:13,padding:'8px 12px',width:'100%',fontFamily:'Lexend,sans-serif',outline:'none',boxSizing:'border-box' };
const LBL: React.CSSProperties = { fontSize:11,fontWeight:600,color:'var(--text-muted)',letterSpacing:'0.06em',textTransform:'uppercase',marginBottom:5,display:'block' };

const STATUS_STYLE: Record<string,[string,string]> = {
  draft:   ['var(--text-muted)','var(--elevated)'],
  pending: ['#f59e0b','rgba(245,158,11,.1)'],
  sent:    ['#22c55e','rgba(34,197,94,.1)'],
};

function fmtDate(iso:string) {
  return new Date(iso).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

interface FormState {
  title:string; content:string; channel_id:string; role_ping_id:string;
  embed:boolean; embed_color:string; image_url:string;
  thumbnail_url:string; footer:string; scheduled_at:string;
}
const EMPTY_FORM = (): FormState => ({
  title:'', content:'', channel_id:'', role_ping_id:'',
  embed:true, embed_color:'#5865f2', image_url:'',
  thumbnail_url:'', footer:'', scheduled_at:'',
});

export default function AnnouncementsPage({ guildId }: Props): JSX.Element {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing,  setEditing]  = useState<Announcement|null>(null);
  const [form,     setForm]     = useState<FormState>(EMPTY_FORM());
  const [saving,   setSaving]   = useState(false);
  const [sending,  setSending]  = useState<number|null>(null);
  const [preview,  setPreview]  = useState(false);
  const [filter,   setFilter]   = useState<'all'|'draft'|'sent'>('all');

  const load = async () => {
    if (!guildId) return;
    setLoading(true);
    const rows = await apiCall<Announcement[]>('getAnnouncements',{guildId}).catch(()=>[]);
    setAnnouncements(rows as Announcement[]);
    setLoading(false);
  };
  useEffect(()=>{ load(); },[guildId]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM()); setPreview(false); setShowForm(true); };
  const openEdit   = (a: Announcement) => {
    setEditing(a);
    setForm({ title:a.title||'', content:a.content, channel_id:a.channel_id||'',
      role_ping_id:a.role_ping_id||'', embed:a.embed, embed_color:a.embed_color||'#5865f2',
      image_url:a.image_url||'', thumbnail_url:a.thumbnail_url||'',
      footer:a.footer||'', scheduled_at:a.scheduled_at||'' });
    setPreview(false); setShowForm(true);
  };

  const save = async () => {
    if (!form.content.trim()) return;
    setSaving(true);
    try {
      const payload = { guildId, ...form,
        title:form.title||null, channel_id:form.channel_id||null,
        role_ping_id:form.role_ping_id||null, image_url:form.image_url||null,
        thumbnail_url:form.thumbnail_url||null, footer:form.footer||null,
        scheduled_at:form.scheduled_at||null,
      };
      if (editing) await apiCall('updateAnnouncement',{...payload,id:editing.id});
      else         await apiCall('createAnnouncement',payload);
      await load(); setShowForm(false);
    } catch(e) {
      alert('Failed to save: ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setSaving(false);
    }
  };

  const send = async (id:number) => {
    setSending(id);
    await apiCall('sendAnnouncement',{id,guildId,sentBy:'admin'});
    setAnnouncements(prev=>prev.map(a=>a.id===id?{...a,status:'pending' as const}:a));
    setSending(null);
  };

  const del = async (id:number) => {
    if (!confirm('Delete this announcement?')) return;
    await apiCall('deleteAnnouncement',{id,guildId});
    setAnnouncements(prev=>prev.filter(a=>a.id!==id));
  };

  const filtered = announcements.filter(a=>filter==='all'||a.status===filter||(filter==='draft'&&a.status==='pending'));

  const draftCount = announcements.filter(a=>a.status==='draft').length;
  const pendingCount = announcements.filter(a=>a.status==='pending').length;

  return (
    <div className="animate-fade" style={{display:'flex',flexDirection:'column',gap:16}}>

      {/* Top bar */}
      <div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:4,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:4}}>
          {(['all','draft','sent'] as const).map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{padding:'6px 14px',borderRadius:7,border:'none',cursor:'pointer',background:filter===f?'var(--elevated)':'transparent',color:filter===f?'var(--text)':'var(--text-muted)',fontSize:12,fontFamily:'Lexend,sans-serif',fontWeight:filter===f?700:400,textTransform:'capitalize'}}>
              {f}
            </button>
          ))}
        </div>
        {pendingCount>0&&<div style={{fontSize:12,color:'#f59e0b',background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.3)',borderRadius:8,padding:'5px 10px',display:'flex',alignItems:'center',gap:5}}>
          <Clock size={12}/>{pendingCount} pending — bot will post soon
        </div>}
        <button onClick={openCreate} style={{marginLeft:'auto',padding:'8px 16px',background:'var(--primary)',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'Lexend,sans-serif',display:'flex',alignItems:'center',gap:7}}>
          <Plus size={14}/>New Announcement
        </button>
      </div>

      {/* Modal */}
      {showForm&&(
        <>
          <div onClick={()=>setShowForm(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:40}}/>
          <div style={{position:'fixed',inset:0,zIndex:50,overflowY:'auto',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'20px 10px'}}>
          <div style={{width:preview?860:560,maxWidth:'97vw',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:14,padding:24,display:'flex',gap:24,marginTop:'auto',marginBottom:'auto'}} onClick={e=>e.stopPropagation()}>
            {/* Form */}
            <div style={{flex:1,display:'flex',flexDirection:'column',gap:12,minWidth:280}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{fontSize:15,fontWeight:700,color:'var(--text)'}}>{editing?'Edit':'New'} Announcement</div>
                <div style={{display:'flex',gap:8,alignItems:'center'}}>
                  <button onClick={()=>setPreview(p=>!p)} style={{padding:'5px 10px',background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:7,color:preview?'var(--primary)':'var(--text-muted)',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',gap:5}}>
                    {preview?<EyeOff size={11}/>:<Eye size={11}/>}{preview?'Hide':'Preview'}
                  </button>
                  <button onClick={()=>setShowForm(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-faint)'}}><X size={16}/></button>
                </div>
              </div>

              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <label style={{display:'flex',alignItems:'center',gap:7,cursor:'pointer',fontSize:13,color:'var(--text)'}}>
                  <div onClick={()=>setForm(f=>({...f,embed:!f.embed}))} style={{width:36,height:20,borderRadius:10,background:form.embed?'var(--primary)':'var(--border)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
                    <div style={{position:'absolute',top:2,left:form.embed?18:2,width:16,height:16,borderRadius:8,background:'#fff',transition:'left .2s'}}/>
                  </div>
                  Use Embed
                </label>
                {form.embed&&<input type="color" value={form.embed_color} onChange={e=>setForm(f=>({...f,embed_color:e.target.value}))} style={{width:32,height:28,padding:2,background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:6,cursor:'pointer'}}/>}
              </div>

              <div><label style={LBL}>Title {!form.embed&&<span style={{fontWeight:400}}>(optional)</span>}</label><input style={INP} placeholder="Announcement title…" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}/></div>
              <div><label style={LBL}>Content *</label><textarea style={{...INP,minHeight:100,resize:'vertical'}} placeholder="Your announcement content… Supports Discord markdown **bold**, *italic*, `code`" value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))}/></div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div><label style={LBL}>Channel ID *</label><input style={INP} placeholder="Discord Channel ID" value={form.channel_id} onChange={e=>setForm(f=>({...f,channel_id:e.target.value}))}/></div>
                <div><label style={LBL}>Ping Role ID</label><input style={INP} placeholder="Role to @mention" value={form.role_ping_id} onChange={e=>setForm(f=>({...f,role_ping_id:e.target.value}))}/></div>
                {form.embed&&<>
                  <div><label style={LBL}>Thumbnail URL</label><input style={INP} placeholder="https://…" value={form.thumbnail_url} onChange={e=>setForm(f=>({...f,thumbnail_url:e.target.value}))}/></div>
                  <div><label style={LBL}>Image URL</label><input style={INP} placeholder="https://…" value={form.image_url} onChange={e=>setForm(f=>({...f,image_url:e.target.value}))}/></div>
                </>}
                {form.embed&&<div style={{gridColumn:'1/-1'}}><label style={LBL}>Footer Text</label><input style={INP} placeholder="Footer text…" value={form.footer} onChange={e=>setForm(f=>({...f,footer:e.target.value}))}/></div>}
              </div>

              <div style={{padding:'10px 12px',background:'rgba(88,101,242,.08)',border:'1px solid rgba(88,101,242,.2)',borderRadius:8,fontSize:12,color:'var(--text-muted)',display:'flex',gap:8,alignItems:'center'}}>
                <Send size={12} style={{color:'#818cf8',flexShrink:0}}/>
                Save as draft, then click <b style={{color:'var(--text)'}}>Send</b> from the list — the bot will immediately post it.
              </div>

              <div style={{display:'flex',justifyContent:'flex-end',gap:8}}>
                <button onClick={()=>setShowForm(false)} style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-muted)',cursor:'pointer',fontSize:13,fontFamily:'Lexend,sans-serif'}}>Cancel</button>
                <button onClick={save} disabled={saving||!form.content.trim()} style={{padding:'8px 18px',background:'var(--primary)',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'Lexend,sans-serif',opacity:(saving||!form.content.trim())?.6:1}}>
                  {saving?'Saving…':editing?'Save Changes':'Save Draft'}
                </button>
              </div>
            </div>

            {/* Preview panel */}
            {preview&&(
              <div style={{width:300,flexShrink:0,background:'#36393f',borderRadius:12,padding:16,display:'flex',flexDirection:'column',gap:8}}>
                <div style={{fontSize:10,color:'#72767d',textTransform:'uppercase',letterSpacing:'.06em',fontWeight:700,marginBottom:4}}>Discord Preview</div>
                {form.role_ping_id&&<div style={{fontSize:13,color:'#c9cdfb'}}>@<span style={{color:'#c9cdfb'}}>{form.role_ping_id}</span></div>}
                {form.embed?(
                  <div style={{borderLeft:`4px solid ${form.embed_color}`,background:'#2f3136',borderRadius:'0 6px 6px 0',padding:'10px 12px'}}>
                    {form.thumbnail_url&&<img src={form.thumbnail_url} alt="" style={{width:60,height:60,borderRadius:4,float:'right',marginLeft:10}}/>}
                    {form.title&&<div style={{fontSize:14,fontWeight:700,color:'#fff',marginBottom:6}}>{form.title}</div>}
                    <div style={{fontSize:13,color:'#dcddde',lineHeight:1.55,whiteSpace:'pre-wrap'}}>{form.content||<span style={{color:'#72767d',fontStyle:'italic'}}>No content yet…</span>}</div>
                    {form.image_url&&<img src={form.image_url} alt="" style={{width:'100%',marginTop:8,borderRadius:4}}/>}
                    {form.footer&&<div style={{fontSize:11,color:'#72767d',marginTop:8,paddingTop:6,borderTop:'1px solid #40444b'}}>{form.footer}</div>}
                  </div>
                ):(
                  <div style={{fontSize:13,color:'#dcddde',lineHeight:1.55,whiteSpace:'pre-wrap'}}>
                    {form.title&&<b style={{color:'#fff',display:'block',marginBottom:4}}>{form.title}</b>}
                    {form.content||<span style={{color:'#72767d',fontStyle:'italic'}}>No content yet…</span>}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
        </>
      )}

      {/* List */}
      {loading?(
        <div style={{display:'flex',justifyContent:'center',padding:60}}><div style={{width:28,height:28,border:'2px solid var(--border)',borderTopColor:'var(--primary)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/></div>
      ):filtered.length===0?(
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'60px 20px',textAlign:'center'}}>
          <Megaphone size={32} style={{color:'var(--text-faint)',display:'block',margin:'0 auto 12px'}}/>
          <div style={{color:'var(--text-muted)',fontSize:14}}>No announcements{filter!=='all'?` (${filter})`:''}. Create your first one.</div>
        </div>
      ):(
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {filtered.map(a=>{
            const [statusColor,statusBg] = STATUS_STYLE[a.status]||STATUS_STYLE.draft;
            return (
              <div key={a.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 16px',display:'flex',gap:12,alignItems:'flex-start'}}>
                <div style={{width:10,height:10,borderRadius:2,background:a.embed_color||'#5865f2',marginTop:3,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                    {a.title&&<span style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{a.title}</span>}
                    <span style={{fontSize:10,fontWeight:700,color:statusColor,background:statusBg,padding:'2px 8px',borderRadius:4,textTransform:'uppercase'}}>{a.status}</span>
                    {a.embed&&<span style={{fontSize:10,color:'#818cf8',background:'rgba(129,140,248,.1)',padding:'2px 6px',borderRadius:4}}>Embed</span>}
                  </div>
                  <p style={{margin:'0 0 6px',fontSize:13,color:'var(--text-muted)',lineHeight:1.5,overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                    {a.content}
                  </p>
                  <div style={{display:'flex',gap:14,fontSize:11,color:'var(--text-faint)',flexWrap:'wrap'}}>
                    {a.channel_id&&<span style={{display:'flex',alignItems:'center',gap:4}}><Hash size={10}/>{a.channel_id}</span>}
                    {a.sent_at?<span style={{display:'flex',alignItems:'center',gap:4}}><CheckCircle size={10}/>Sent {fmtDate(a.sent_at)}</span>:
                     <span style={{display:'flex',alignItems:'center',gap:4}}><Clock size={10}/>Created {fmtDate(a.created_at)}</span>}
                  </div>
                </div>
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  {a.status==='draft'&&(
                    <button onClick={()=>send(a.id)} disabled={sending===a.id} style={{padding:'6px 12px',background:'rgba(34,197,94,.1)',border:'1px solid rgba(34,197,94,.3)',borderRadius:7,color:'#22c55e',cursor:'pointer',fontSize:12,fontWeight:700,fontFamily:'Lexend,sans-serif',display:'flex',alignItems:'center',gap:5,opacity:sending===a.id?.6:1}}>
                      <Send size={11}/>{sending===a.id?'Queuing…':'Send'}
                    </button>
                  )}
                  {a.status==='draft'&&<button onClick={()=>openEdit(a)} style={{padding:'6px 10px',background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:7,color:'var(--text-muted)',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',gap:4}}><Edit3 size={11}/></button>}
                  <button onClick={()=>del(a.id)} style={{padding:'6px',background:'transparent',border:'none',cursor:'pointer',color:'var(--text-faint)'}}><Trash2 size={13}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

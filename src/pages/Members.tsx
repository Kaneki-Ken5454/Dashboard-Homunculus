/**
 * Members.tsx — Members list + full member profile drawer
 */
import { useEffect, useState } from 'react';
import {
  Users, TrendingUp, MessageSquare, Clock, Search,
  Mic, Shield, AlertTriangle, Terminal, StickyNote, X, Plus, Trash2, ChevronRight,
} from 'lucide-react';
import { getMembers, getMemberStats, updateMemberXP, apiCall, type GuildMember, type ActivityStats } from '../lib/db';

interface Props { guildId: string; }

interface Profile {
  member: GuildMember|null;
  vc: { total_seconds:number; session_count:number; last_active:string|null; last_left:string|null }|null;
  warns: { severity:string; reason:string; moderator_id:string; created_at:string }[];
  auditLogs: { action_type:string; reason:string; moderator_id:string; created_at:string }[];
  topCommands: { command:string; uses:number }[];
}
interface Note { id:number; note:string; author_id:string; created_at:string; }

function timeAgo(d:string) {
  if(!d) return '—';
  const diff=Date.now()-new Date(d).getTime();
  const m=Math.floor(diff/60000);
  if(m<1) return 'just now'; if(m<60) return `${m}m ago`;
  const h=Math.floor(m/60);
  if(h<24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`;
}
function fmtDur(s:number) {
  const d=Math.floor(s/86400),h=Math.floor((s%86400)/3600),m=Math.floor((s%3600)/60);
  if(d>0) return `${d}d ${h}h`; if(h>0) return `${h}h ${m}m`; return `${m}m`;
}

const SEV_COLOR: Record<string,string> = { high:'#ef4444', medium:'#f59e0b', low:'#6b7280' };
const INP: React.CSSProperties = { background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:13,padding:'8px 12px',width:'100%',fontFamily:'Lexend',outline:'none',boxSizing:'border-box' };

export default function Members({ guildId }: Props): JSX.Element {
  const [members, setMembers]     = useState<GuildMember[]>([]);
  const [stats,   setStats]       = useState<ActivityStats|null>(null);
  const [loading, setLoading]     = useState(true);
  const [error,   setError]       = useState('');
  const [search,  setSearch]      = useState('');
  const [editing, setEditing]     = useState<string|null>(null);
  const [editXP,  setEditXP]      = useState(0);
  const [editLevel,setEditLevel]  = useState(0);
  const [saving,  setSaving]      = useState(false);

  // Profile drawer
  const [profile,  setProfile]    = useState<Profile|null>(null);
  const [notes,    setNotes]      = useState<Note[]>([]);
  const [newNote,  setNewNote]    = useState('');
  const [profUser, setProfUser]   = useState<GuildMember|null>(null);
  const [profTab,  setProfTab]    = useState<'overview'|'warns'|'audit'|'notes'>('overview');
  const [profLoad, setProfLoad]   = useState(false);

  const load = async () => {
    if(!guildId) return;
    setLoading(true); setError('');
    try {
      const [m,s]=await Promise.all([getMembers(guildId),getMemberStats(guildId)]);
      setMembers(m); setStats(s);
    } catch(e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };
  useEffect(()=>{load();},[guildId]);

  const filtered = members.filter(m=>!search||m.username?.toLowerCase().includes(search.toLowerCase())||m.user_id.includes(search));

  function startEdit(m:GuildMember) { setEditing(m.id); setEditXP(m.xp); setEditLevel(m.level); }
  async function saveXP(m:GuildMember) {
    setSaving(true);
    try { await updateMemberXP(m.id,editXP,editLevel); setMembers(prev=>prev.map(x=>x.id===m.id?{...x,xp:editXP,level:editLevel}:x)); setEditing(null); }
    catch(e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  const openProfile = async (m:GuildMember) => {
    setProfUser(m); setProfLoad(true); setProfTab('overview');
    const [prof,noteRows] = await Promise.all([
      apiCall<Profile>('getMemberProfile',{guildId,userId:m.user_id}),
      apiCall<Note[]>('getMemberNotes',{guildId,userId:m.user_id}),
    ]);
    setProfile(prof as Profile); setNotes(noteRows as Note[]); setProfLoad(false);
  };

  const addNote = async () => {
    if(!newNote.trim()||!profUser) return;
    await apiCall('addMemberNote',{guildId,userId:profUser.user_id,note:newNote,authorId:'admin'});
    const rows = await apiCall<Note[]>('getMemberNotes',{guildId,userId:profUser.user_id});
    setNotes(rows as Note[]); setNewNote('');
  };
  const deleteNote = async (id:number) => {
    await apiCall('deleteMemberNote',{noteId:id,guildId});
    setNotes(prev=>prev.filter(n=>n.id!==id));
  };

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300}}><div style={{width:32,height:32,border:'2px solid var(--border)',borderTopColor:'var(--primary)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/></div>;

  return (
    <div className="animate-fade" style={{position:'relative'}}>
      {error&&<div style={{background:'var(--danger-subtle)',border:'1px solid var(--danger)',borderRadius:10,padding:'12px 16px',color:'var(--danger)',fontSize:13,marginBottom:14}}>{error}</div>}

      {/* Stats row */}
      {stats&&(
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:20}}>
          {[
            {label:'Total Members',value:members.length,icon:Users,color:'#5865f2'},
            {label:'Active (all time)',value:stats.activeAll,icon:TrendingUp,color:'#3ba55d'},
            {label:'Active (7 days)',value:stats.active7d,icon:Clock,color:'#faa81a'},
            {label:'Total Messages',value:stats.totalMsgs,icon:MessageSquare,color:'#9b59b6'},
          ].map(({label,value,icon:Icon,color})=>(
            <div key={label} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'16px 18px'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                <div style={{width:30,height:30,borderRadius:8,background:`${color}22`,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <Icon size={14} style={{color}}/>
                </div>
                <span style={{fontSize:11,color:'var(--text-muted)',fontWeight:500}}>{label}</span>
              </div>
              <div style={{fontSize:24,fontWeight:700,color:'var(--text)'}}>{value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search + table */}
      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
        <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
          <div style={{position:'relative',flex:1,maxWidth:300}}>
            <Search size={13} style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',color:'var(--text-faint)'}}/>
            <input className="inp" style={{paddingLeft:30,fontSize:13}} placeholder="Search by username or ID…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <span style={{fontSize:12,color:'var(--text-muted)'}}>{filtered.length} members</span>
        </div>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'var(--elevated)',borderBottom:'1px solid var(--border)'}}>
              {['User','User ID','Level','XP','Messages','Last Active',''].map(h=>(
                <th key={h} style={{padding:'9px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'var(--text-muted)',letterSpacing:'0.06em',textTransform:'uppercase'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length===0?(
              <tr><td colSpan={7} style={{padding:'40px 16px',textAlign:'center',color:'var(--text-muted)',fontSize:14}}>{search?'No members match your search':'No members tracked yet'}</td></tr>
            ):filtered.map(m=>(
              <tr key={m.id} className="data-row" style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'10px 14px'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    {m.avatar_url?<img src={m.avatar_url} alt="" style={{width:28,height:28,borderRadius:'50%',flexShrink:0}} onError={e=>{(e.target as HTMLImageElement).style.display='none';}}/>
                    :<div style={{width:28,height:28,borderRadius:'50%',background:'var(--elevated)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'var(--text-muted)',flexShrink:0}}>{(m.username||'?')[0].toUpperCase()}</div>}
                    <span style={{fontSize:13,fontWeight:500,color:'var(--text)'}}>{m.username||'—'}</span>
                  </div>
                </td>
                <td style={{padding:'10px 14px'}}><span className="mono" style={{fontSize:11,color:'var(--text-muted)'}}>{m.user_id}</span></td>
                <td style={{padding:'10px 14px'}}>
                  {editing===m.id?<input type="number" className="inp" style={{width:60,padding:'3px 6px',fontSize:13}} value={editLevel} onChange={e=>setEditLevel(Number(e.target.value))}/>
                  :<span style={{fontSize:13,fontWeight:600,color:'#818cf8'}}>{m.level}</span>}
                </td>
                <td style={{padding:'10px 14px'}}>
                  {editing===m.id?<input type="number" className="inp" style={{width:80,padding:'3px 6px',fontSize:13}} value={editXP} onChange={e=>setEditXP(Number(e.target.value))}/>
                  :<span style={{fontSize:13,color:'var(--text-muted)'}}>{m.xp.toLocaleString()}</span>}
                </td>
                <td style={{padding:'10px 14px',fontSize:13,color:'var(--text-muted)'}}>{m.message_count.toLocaleString()}</td>
                <td style={{padding:'10px 14px',fontSize:12,color:'var(--text-muted)',whiteSpace:'nowrap'}}>{timeAgo(m.last_active)}</td>
                <td style={{padding:'10px 14px'}}>
                  {editing===m.id?(
                    <div style={{display:'flex',gap:5}}>
                      <button className="btn btn-primary btn-sm" onClick={()=>saveXP(m)} disabled={saving}>{saving?'…':'Save'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(null)}>Cancel</button>
                    </div>
                  ):(
                    <div style={{display:'flex',gap:5}}>
                      <button className="btn btn-ghost btn-sm" onClick={()=>startEdit(m)}>Edit XP</button>
                      <button className="btn btn-ghost btn-sm" onClick={()=>openProfile(m)} style={{display:'flex',alignItems:'center',gap:4}}>Profile <ChevronRight size={11}/></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Profile Drawer ────────────────────────────────────────── */}
      {profUser&&(
        <>
          {/* Backdrop */}
          <div onClick={()=>setProfUser(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:40}}/>
          {/* Drawer */}
          <div style={{position:'fixed',top:0,right:0,bottom:0,width:480,background:'var(--bg)',borderLeft:'1px solid var(--border)',zIndex:50,display:'flex',flexDirection:'column',overflow:'hidden'}}>
            {/* Header */}
            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12}}>
              {profUser.avatar_url?<img src={profUser.avatar_url} alt="" style={{width:44,height:44,borderRadius:'50%'}}/>
              :<div style={{width:44,height:44,borderRadius:'50%',background:'var(--elevated)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,color:'var(--text-muted)',fontWeight:700}}>{(profUser.username||'?')[0].toUpperCase()}</div>}
              <div style={{flex:1}}>
                <div style={{fontSize:16,fontWeight:700,color:'var(--text)'}}>{profUser.username}</div>
                <div className="mono" style={{fontSize:11,color:'var(--text-faint)'}}>{profUser.user_id}</div>
              </div>
              <button onClick={()=>setProfUser(null)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-faint)',padding:4}}><X size={18}/></button>
            </div>

            {/* Prof tabs */}
            <div style={{display:'flex',borderBottom:'1px solid var(--border)'}}>
              {(['overview','warns','audit','notes'] as const).map(t=>(
                <button key={t} onClick={()=>setProfTab(t)} style={{flex:1,padding:'10px 4px',border:'none',cursor:'pointer',background:'transparent',color:profTab===t?'var(--primary)':'var(--text-muted)',fontSize:12,fontWeight:profTab===t?700:500,fontFamily:'Lexend',borderBottom:profTab===t?'2px solid var(--primary)':'2px solid transparent',textTransform:'capitalize'}}>
                  {t}
                </button>
              ))}
            </div>

            {profLoad?<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{width:28,height:28,border:'2px solid var(--border)',borderTopColor:'var(--primary)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/></div>:(
              <div style={{flex:1,overflow:'auto',padding:16}}>

                {/* OVERVIEW */}
                {profTab==='overview'&&profile&&(
                  <div style={{display:'flex',flexDirection:'column',gap:14}}>
                    {/* Quick stats */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                      {[
                        {label:'Messages',value:profile.member?.message_count?.toLocaleString()||'0',icon:MessageSquare,color:'#5865f2'},
                        {label:'Level / XP',value:`Lv${profile.member?.level||0} · ${(profile.member?.xp||0).toLocaleString()} XP`,icon:TrendingUp,color:'#22c55e'},
                        {label:'VC Time',value:profile.vc?fmtDur(profile.vc.total_seconds):'—',icon:Mic,color:'#a78bfa'},
                        {label:'Warnings',value:profile.warns.length.toString(),icon:AlertTriangle,color:profile.warns.length>0?'#f59e0b':'#6b7280'},
                      ].map(({label,value,icon:Icon,color})=>(
                        <div key={label} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px',display:'flex',alignItems:'center',gap:10}}>
                          <div style={{width:30,height:30,borderRadius:8,background:`${color}20`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                            <Icon size={14} style={{color}}/>
                          </div>
                          <div>
                            <div style={{fontSize:14,fontWeight:700,color:'var(--text)'}}>{value}</div>
                            <div style={{fontSize:10,color:'var(--text-faint)'}}>{label}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Top commands */}
                    {profile.topCommands.length>0&&(
                      <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
                        <div style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:10,display:'flex',alignItems:'center',gap:6}}><Terminal size={12}/>Top Commands</div>
                        {profile.topCommands.map(c=>(
                          <div key={c.command} style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'1px solid var(--border)'}}>
                            <span className="mono" style={{fontSize:12,color:'var(--text)'}}>{c.command}</span>
                            <span style={{fontSize:12,color:'var(--text-muted)'}}>{c.uses}×</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Last active */}
                    <div style={{fontSize:12,color:'var(--text-muted)',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px'}}>
                      Last active: <strong style={{color:'var(--text)'}}>{timeAgo(profile.member?.last_active||'')}</strong>
                      {profile.member?.joined_at&&<> · Joined: <strong style={{color:'var(--text)'}}>{new Date(profile.member.joined_at).toLocaleDateString()}</strong></>}
                    </div>
                  </div>
                )}

                {/* WARNS */}
                {profTab==='warns'&&profile&&(
                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                    {profile.warns.length===0?<div style={{textAlign:'center',padding:40,color:'var(--text-faint)'}}>No warnings on record</div>:
                    profile.warns.map((w,i)=>(
                      <div key={i} style={{background:'var(--surface)',border:`1px solid ${SEV_COLOR[w.severity]||'var(--border)'}40`,borderRadius:10,padding:'10px 14px'}}>
                        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:5}}>
                          <AlertTriangle size={13} style={{color:SEV_COLOR[w.severity]||'var(--text-muted)'}}/>
                          <span style={{fontSize:11,fontWeight:700,color:SEV_COLOR[w.severity]||'var(--text-muted)',textTransform:'uppercase'}}>{w.severity}</span>
                          <span style={{fontSize:10,color:'var(--text-faint)',marginLeft:'auto'}}>{timeAgo(w.created_at)}</span>
                        </div>
                        <div style={{fontSize:13,color:'var(--text)'}}>{w.reason||'No reason'}</div>
                        <div className="mono" style={{fontSize:10,color:'var(--text-faint)',marginTop:4}}>by {w.moderator_id}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* AUDIT */}
                {profTab==='audit'&&profile&&(
                  <div style={{display:'flex',flexDirection:'column',gap:6}}>
                    {profile.auditLogs.length===0?<div style={{textAlign:'center',padding:40,color:'var(--text-faint)'}}>No audit entries</div>:
                    profile.auditLogs.map((a,i)=>(
                      <div key={i} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:9,padding:'9px 13px',display:'flex',gap:10,alignItems:'flex-start'}}>
                        <Shield size={13} style={{color:'var(--text-muted)',marginTop:2,flexShrink:0}}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{a.action_type.replace(/_/g,' ')}</div>
                          {a.reason&&<div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{a.reason}</div>}
                        </div>
                        <span style={{fontSize:10,color:'var(--text-faint)',flexShrink:0}}>{timeAgo(a.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* NOTES */}
                {profTab==='notes'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:10}}>
                    <div style={{display:'flex',gap:8}}>
                      <textarea style={{...INP,flex:1,minHeight:64,resize:'vertical'}} placeholder="Add a staff note about this member…" value={newNote} onChange={e=>setNewNote(e.target.value)}/>
                      <button onClick={addNote} disabled={!newNote.trim()} style={{padding:'8px 14px',background:'var(--primary)',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',alignSelf:'flex-end',opacity:!newNote.trim()?.5:1,fontFamily:'Lexend',fontSize:12,fontWeight:700,display:'flex',alignItems:'center',gap:5}}>
                        <Plus size={13}/>Add
                      </button>
                    </div>
                    {notes.length===0?<div style={{textAlign:'center',padding:32,color:'var(--text-faint)'}}>No notes yet</div>:
                    notes.map(n=>(
                      <div key={n.id} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:'10px 14px',display:'flex',gap:10}}>
                        <StickyNote size={13} style={{color:'#f59e0b',marginTop:2,flexShrink:0}}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,color:'var(--text)',lineHeight:1.5}}>{n.note}</div>
                          <div style={{fontSize:10,color:'var(--text-faint)',marginTop:4}}>{timeAgo(n.created_at)}</div>
                        </div>
                        <button onClick={()=>deleteNote(n.id)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-faint)',padding:2,flexShrink:0}}><Trash2 size={13}/></button>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

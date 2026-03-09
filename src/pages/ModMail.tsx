/**
 * ModMail.tsx — Full ModMail system dashboard
 * Config panel + live thread inbox + reply interface
 */
import { useEffect, useState, useRef } from 'react';
import { Mail, Settings, Send, X, AlertCircle, Clock, CheckCircle, ChevronDown, Plus, Hash, User, RefreshCw, Archive, FileText } from 'lucide-react';
import { apiCall } from '../lib/db';

interface Props { guildId: string; }

interface ModmailConfig {
  enabled: boolean; inbox_channel_id: string|null; log_channel_id: string|null;
  staff_role_id: string|null; greeting: string; auto_close_hours: number;
}
interface Thread {
  id: number; user_id: string; username: string; subject: string;
  status: 'open'|'closed'; priority: 'low'|'normal'|'high'|'urgent';
  opened_at: string; last_message_at: string; closed_at: string|null;
  thread_channel_id: string|null;
}
interface Message {
  id: number; author_id: string; author_name: string; author_is_staff: boolean;
  content: string; attachments: any[]; sent_at: string;
}
interface LogEntry {
  id: number; user_id: string; username: string; subject: string;
  priority: string; closed_by: string; close_reason: string;
  opened_at: string; closed_at: string; message_count: number;
}

const PRIORITY_COLOR: Record<string,string> = {
  low:'#6b7280', normal:'#818cf8', high:'#f59e0b', urgent:'#ef4444'
};

function fmtTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff/60000);
  if (m<1) return 'just now';
  if (m<60) return `${m}m ago`;
  const h = Math.floor(m/60);
  if (h<24) return `${h}h ago`;
  return d.toLocaleDateString('en-US',{month:'short',day:'numeric'});
}

const INP: React.CSSProperties = {
  background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:8,
  color:'var(--text)',fontSize:13,padding:'8px 12px',width:'100%',fontFamily:'Lexend',
  outline:'none',boxSizing:'border-box',
};
const LBL: React.CSSProperties = {
  fontSize:11,fontWeight:600,color:'var(--text-muted)',letterSpacing:'0.06em',
  textTransform:'uppercase',marginBottom:5,display:'block',
};

export default function ModMail({ guildId }: Props): JSX.Element {
  const [tab, setTab] = useState<'inbox'|'config'|'log'>('inbox');
  const [config, setConfig] = useState<ModmailConfig>({
    enabled:false,inbox_channel_id:null,log_channel_id:null,
    staff_role_id:null,greeting:'',auto_close_hours:72,
  });
  const [threads, setThreads] = useState<Thread[]>([]);
  const [filterStatus, setFilterStatus] = useState<'open'|'closed'|'all'>('open');
  const [activeThread, setActiveThread] = useState<Thread|null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [msgLoading, setMsgLoading] = useState(false);
  const [newThread, setNewThread] = useState(false);
  // Close modal
  const [closeModalId, setCloseModalId] = useState<number|null>(null);
  const [closeReason, setCloseReason] = useState('');
  const [closing, setClosing] = useState(false);
  // Log tab
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [logThread, setLogThread] = useState<LogEntry|null>(null);
  const [logMessages, setLogMessages] = useState<Message[]>([]);
  const [logMsgLoading, setLogMsgLoading] = useState(false);
  const [ntUserId, setNtUserId] = useState('');
  const [ntSubject, setNtSubject] = useState('');
  const [ntMessage, setNtMessage] = useState('');
  const [ntPriority, setNtPriority] = useState<'normal'|'high'|'urgent'>('normal');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const threadPollRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // Auto-refresh the thread list every 15s so new threads (from user DMs or other staff) appear
  useEffect(() => {
    if (!guildId) return;
    if (threadPollRef.current) clearInterval(threadPollRef.current);
    threadPollRef.current = setInterval(async () => {
      try {
        const thr = await apiCall<Thread[]>('getModmailThreads', { guildId, status: filterStatus });
        setThreads(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(thr)) return thr as Thread[];
          return prev;
        });
      } catch {}
    }, 15000);
    return () => { if (threadPollRef.current) clearInterval(threadPollRef.current); };
  }, [guildId, filterStatus]);

  // Auto-poll active thread for new messages every 8s (picks up user DM replies)
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!activeThread) return;
    pollRef.current = setInterval(async () => {
      try {
        const msgs = await apiCall<Message[]>('getModmailMessages',{threadId:activeThread.id});
        setMessages(prev => {
          if (JSON.stringify(prev) !== JSON.stringify(msgs)) {
            setTimeout(()=>messagesEndRef.current?.scrollIntoView({behavior:'smooth'}),80);
            return msgs as Message[];
          }
          return prev;
        });
        // Also refresh thread_channel_id so the Discord link appears once the bot creates it
        if (!activeThread.thread_channel_id) {
          const thr = await apiCall<Thread[]>('getModmailThreads',{guildId,status:'all'});
          const updated = (thr as Thread[]).find(t => t.id === activeThread.id);
          if (updated?.thread_channel_id) {
            setActiveThread(t => t ? {...t, thread_channel_id: updated.thread_channel_id} : null);
            setThreads(prev => prev.map(t => t.id === activeThread.id ? {...t, thread_channel_id: updated.thread_channel_id} : t));
          }
        }
      } catch {}
    }, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeThread?.id, activeThread?.thread_channel_id]);

  useEffect(() => {
    if (!guildId) return;
    setLoading(true);
    Promise.all([
      apiCall<ModmailConfig>('getModmailConfig',{guildId}),
      apiCall<Thread[]>('getModmailThreads',{guildId,status:filterStatus}),
    ]).then(([cfg,thr]) => { setConfig(cfg as ModmailConfig); setThreads(thr as Thread[]); })
    .finally(()=>setLoading(false));
  },[guildId]);

  useEffect(() => {
    if (!guildId) return;
    apiCall<Thread[]>('getModmailThreads',{guildId,status:filterStatus}).then(r=>setThreads(r as Thread[]));
  },[filterStatus,guildId]);

  useEffect(() => {
    if (tab === 'log' && guildId) loadLog();
  }, [tab, guildId]);

  const openThread = async (t: Thread) => {
    setActiveThread(t); setMsgLoading(true);
    const msgs = await apiCall<Message[]>('getModmailMessages',{threadId:t.id});
    setMessages(msgs as Message[]);
    setMsgLoading(false);
    setTimeout(()=>messagesEndRef.current?.scrollIntoView({behavior:'smooth'}),100);
  };

  const sendReply = async () => {
    if (!reply.trim()||!activeThread) return;
    setSending(true);
    try {
      await apiCall('replyModmailThread',{
        threadId:activeThread.id, guildId,
        authorId:'admin', authorName:'Staff',
        authorIsStaff:true,
        content:reply,
      });
      const msgs = await apiCall<Message[]>('getModmailMessages',{threadId:activeThread.id});
      setMessages(msgs as Message[]); setReply('');
    } finally {
      setSending(false);
    }
    setTimeout(()=>messagesEndRef.current?.scrollIntoView({behavior:'smooth'}),100);
  };

  const openCloseModal = (id: number) => { setCloseModalId(id); setCloseReason(''); };
  const confirmClose = async () => {
    if (closeModalId == null) return;
    setClosing(true);
    try {
      await apiCall('closeModmailThread',{threadId:closeModalId,closedBy:'Staff',reason:closeReason});
      setThreads(t=>t.map(x=>x.id===closeModalId?{...x,status:'closed' as const}:x));
      if (activeThread?.id===closeModalId) setActiveThread(t=>t?{...t,status:'closed' as const}:null);
    } finally {
      setClosing(false); setCloseModalId(null); setCloseReason('');
    }
  };
  const loadLog = async () => {
    const rows = await apiCall<LogEntry[]>('getModmailLog',{guildId}).catch(()=>[]);
    setLogEntries(rows as LogEntry[]);
  };
  const openLogThread = async (entry: LogEntry) => {
    setLogThread(entry); setLogMsgLoading(true);
    const msgs = await apiCall<Message[]>('getModmailMessages',{threadId:entry.id}).catch(()=>[]);
    setLogMessages(msgs as Message[]); setLogMsgLoading(false);
  };

  const setPriority = async (id: number, priority: string) => {
    await apiCall('setModmailPriority',{threadId:id,priority});
    setThreads(t=>t.map(x=>x.id===id?{...x,priority:priority as any}:x));
    if(activeThread?.id===id) setActiveThread(t=>t?{...t,priority:priority as any}:null);
  };

  const [saveMsg, setSaveMsg] = useState<{ok:boolean;text:string}|null>(null);

  const saveConfig = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      await apiCall('setModmailConfig', {guildId, ...config});
      setSaveMsg({ok:true, text:'Config saved!'});
    } catch (e: any) {
      setSaveMsg({ok:false, text: e?.message ?? 'Save failed'});
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(null), 4000);
    }
  };

  const createThread = async () => {
    if (!ntUserId.trim()) return;
    const subject = ntSubject || 'Staff-initiated thread';
    const r = await apiCall<{id:number}>('createModmailThread',{
      guildId, userId: ntUserId, username: ntUserId,
      subject, priority: ntPriority,
    });
    const newId = (r as any).id;
    if (!newId) return;

    // Send the initial message immediately so the bot poller has something to
    // deliver → it will create the Discord thread and DM the user.
    const firstMsg = ntMessage.trim() || `Staff has opened a thread with you regarding: ${subject}`;
    await apiCall('replyModmailThread', {
      threadId: newId, guildId,
      authorId: 'admin', authorName: 'Staff',
      authorIsStaff: true,
      content: firstMsg,
    }).catch(() => {});

    const t: Thread = {
      id: newId, user_id: ntUserId, username: ntUserId,
      subject, status: 'open', priority: ntPriority,
      opened_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      closed_at: null, thread_channel_id: null,
    };
    setThreads(prev => [t, ...prev]);
    setNewThread(false); setNtUserId(''); setNtSubject(''); setNtMessage('');
    // Open the thread so staff can see the conversation immediately
    openThread(t);
  };

  const TABS: [typeof tab, string, any][] = [['inbox','Inbox',Mail],['log','Log',Archive],['config','Config',Settings]];

  return (
    <div className="animate-fade" style={{display:'flex',flexDirection:'column',gap:16}}>
      {/* Tab bar */}
      <div style={{display:'flex',gap:4,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:10,padding:4,width:'fit-content'}}>
        {TABS.map(([t,label,Icon])=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:'7px 18px',borderRadius:7,border:'none',cursor:'pointer',background:tab===t?'var(--elevated)':'transparent',color:tab===t?'var(--text)':'var(--text-muted)',fontSize:13,fontFamily:'Lexend',fontWeight:500,display:'flex',alignItems:'center',gap:7}}>
            <Icon size={13}/>{label}
          </button>
        ))}
      </div>

      {/* ── CONFIG ─────────────────────────────────────────────────── */}
      {tab==='config'&&(
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:20,display:'flex',flexDirection:'column',gap:14,maxWidth:600}}>
          <div style={{fontSize:14,fontWeight:700,color:'var(--text)',marginBottom:4}}>ModMail Configuration</div>

          <label style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}}>
            <div onClick={()=>setConfig(c=>({...c,enabled:!c.enabled}))}
              style={{width:40,height:22,borderRadius:11,background:config.enabled?'var(--primary)':'var(--border)',position:'relative',transition:'background .2s',flexShrink:0,cursor:'pointer'}}>
              <div style={{position:'absolute',top:3,left:config.enabled?20:3,width:16,height:16,borderRadius:8,background:'#fff',transition:'left .2s'}}/>
            </div>
            <span style={{fontSize:13,color:'var(--text)'}}>Enable ModMail</span>
          </label>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={LBL}>Inbox Channel ID</label>
              <input style={INP} placeholder="Channel ID where threads appear" value={config.inbox_channel_id||''} onChange={e=>setConfig(c=>({...c,inbox_channel_id:e.target.value}))}/>
            </div>
            <div>
              <label style={LBL}>Log Channel ID</label>
              <input style={INP} placeholder="Channel ID for closed thread logs" value={config.log_channel_id||''} onChange={e=>setConfig(c=>({...c,log_channel_id:e.target.value}))}/>
            </div>
            <div>
              <label style={LBL}>Staff Role ID</label>
              <input style={INP} placeholder="Role with access to threads" value={config.staff_role_id||''} onChange={e=>setConfig(c=>({...c,staff_role_id:e.target.value}))}/>
            </div>
            <div>
              <label style={LBL}>Auto-close After (hours)</label>
              <input style={INP} type="number" min={1} max={720} value={config.auto_close_hours} onChange={e=>setConfig(c=>({...c,auto_close_hours:Number(e.target.value)}))}/>
            </div>
          </div>
          <div>
            <label style={LBL}>Greeting Message</label>
            <textarea style={{...INP,minHeight:80,resize:'vertical'}} placeholder="Message sent to users when they open a modmail thread…" value={config.greeting} onChange={e=>setConfig(c=>({...c,greeting:e.target.value}))}/>
          </div>
          <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',gap:12}}>
            {saveMsg && (
              <span style={{fontSize:12,fontWeight:600,color:saveMsg.ok?'#4ade80':'#f87171'}}>
                {saveMsg.ok?'✓ ':' '}{saveMsg.text}
              </span>
            )}
            <button onClick={saveConfig} disabled={saving} style={{padding:'8px 24px',background:'var(--primary)',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'Lexend',opacity:saving?.6:1}}>
              {saving?'Saving…':'Save Config'}
            </button>
          </div>
        </div>
      )}

      {/* ── INBOX ──────────────────────────────────────────────────── */}
      {tab==='inbox'&&(
        <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:12,minHeight:500}}>

          {/* Thread list */}
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'12px 14px',borderBottom:'1px solid var(--border)',display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
              {(['open','closed','all'] as const).map(s=>(
                <button key={s} onClick={()=>setFilterStatus(s)} style={{padding:'3px 10px',borderRadius:6,border:'1px solid var(--border)',background:filterStatus===s?'rgba(88,101,242,.2)':'transparent',color:filterStatus===s?'#818cf8':'var(--text-muted)',cursor:'pointer',fontSize:11,fontFamily:'Lexend',fontWeight:600,textTransform:'capitalize'}}>
                  {s}
                </button>
              ))}
              <button onClick={()=>setNewThread(true)} style={{marginLeft:'auto',padding:'3px 10px',borderRadius:6,border:'1px solid rgba(88,101,242,.4)',background:'rgba(88,101,242,.1)',color:'#818cf8',cursor:'pointer',fontSize:11,fontFamily:'Lexend',fontWeight:700,display:'flex',alignItems:'center',gap:4}}>
                <Plus size={11}/> New
              </button>
            </div>
            {newThread&&(
              <div style={{padding:12,borderBottom:'1px solid var(--border)',background:'var(--elevated)',display:'flex',flexDirection:'column',gap:8}}>
                <input style={INP} placeholder="User ID" value={ntUserId} onChange={e=>setNtUserId(e.target.value)}/>
                <input style={INP} placeholder="Subject" value={ntSubject} onChange={e=>setNtSubject(e.target.value)}/>
                <textarea style={{...INP,minHeight:60,resize:'vertical'}} placeholder="Initial message to send the user…" value={ntMessage} onChange={e=>setNtMessage(e.target.value)}/>
                <select style={INP} value={ntPriority} onChange={e=>setNtPriority(e.target.value as any)}>
                  {['normal','high','urgent'].map(p=><option key={p} value={p}>{p}</option>)}
                </select>
                <div style={{display:'flex',gap:6}}>
                  <button onClick={createThread} style={{flex:1,padding:'6px',background:'var(--primary)',border:'none',borderRadius:6,color:'#fff',cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'Lexend'}}>Create & Send</button>
                  <button onClick={()=>setNewThread(false)} style={{flex:1,padding:'6px',background:'transparent',border:'1px solid var(--border)',borderRadius:6,color:'var(--text-muted)',cursor:'pointer',fontSize:11,fontFamily:'Lexend'}}>Cancel</button>
                </div>
              </div>
            )}
            <div style={{overflow:'auto',flex:1}}>
              {loading?<div style={{padding:32,textAlign:'center',color:'var(--text-faint)'}}>Loading…</div>:
               threads.length===0?<div style={{padding:40,textAlign:'center',color:'var(--text-faint)'}}>No {filterStatus} threads</div>:
               threads.map(t=>(
                <div key={t.id} onClick={()=>openThread(t)}
                  style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',cursor:'pointer',background:activeThread?.id===t.id?'var(--elevated)':'transparent',transition:'background .1s'}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                    <div style={{width:6,height:6,borderRadius:3,background:PRIORITY_COLOR[t.priority],flexShrink:0}}/>
                    <span style={{fontSize:13,fontWeight:600,color:'var(--text)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.username}</span>
                    <span style={{fontSize:10,color:'var(--text-faint)'}}>{fmtTime(t.last_message_at)}</span>
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',paddingLeft:12}}>{t.subject}</div>
                  {t.status==='closed'&&<div style={{fontSize:10,color:'var(--text-faint)',paddingLeft:12,marginTop:2}}>Closed</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Message panel */}
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            {!activeThread?(
              <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:'var(--text-faint)'}}>
                <Mail size={32}/>
                <div style={{fontSize:14,color:'var(--text-muted)'}}>Select a thread to view</div>
              </div>
            ):(
              <>
                {/* Thread header */}
                <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:10}}>
                  <User size={15} style={{color:'var(--text-muted)'}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{activeThread.username}</div>
                    <div style={{fontSize:11,color:'var(--text-muted)'}}>{activeThread.subject} · <span className="mono">{activeThread.user_id}</span>
                      {activeThread.thread_channel_id && (
                        <span style={{marginLeft:8,color:'#818cf8'}}>
                          · <a
                              href={`discord://discord.com/channels/@me/${activeThread.thread_channel_id}`}
                              title={`Discord Thread #${activeThread.thread_channel_id}`}
                              style={{color:'#818cf8',textDecoration:'none',fontSize:10,fontWeight:700}}
                            >
                              <Hash size={10} style={{display:'inline',verticalAlign:'middle',marginRight:2}}/>
                              Discord Thread
                            </a>
                        </span>
                      )}
                      {!activeThread.thread_channel_id && (
                        <span style={{marginLeft:8,fontSize:10,color:'var(--text-faint)'}}>· Discord thread pending…</span>
                      )}
                    </div>
                  </div>
                  <select value={activeThread.priority} onChange={e=>setPriority(activeThread.id,e.target.value)}
                    style={{...INP,width:'auto',padding:'4px 8px',fontSize:11,color:PRIORITY_COLOR[activeThread.priority]}}>
                    {['low','normal','high','urgent'].map(p=><option key={p} value={p}>{p}</option>)}
                  </select>
                  {activeThread.status==='open'&&(
                    <button onClick={()=>openCloseModal(activeThread.id)}
                      style={{padding:'5px 12px',background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:7,color:'#ef4444',cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:'Lexend',display:'flex',alignItems:'center',gap:5}}>
                      <CheckCircle size={12}/> Close
                    </button>
                  )}
                </div>

                {/* Messages */}
                <div style={{flex:1,overflow:'auto',padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
                  {msgLoading?<div style={{textAlign:'center',color:'var(--text-faint)',padding:32}}>Loading…</div>:
                   messages.length===0?<div style={{textAlign:'center',color:'var(--text-faint)',padding:32}}>No messages yet</div>:
                   messages.map(m=>(
                    <div key={m.id} style={{display:'flex',gap:10,flexDirection:m.author_is_staff?'row-reverse':'row'}}>
                      <div style={{width:28,height:28,borderRadius:'50%',background:m.author_is_staff?'rgba(88,101,242,.3)':'rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:11,fontWeight:700,color:m.author_is_staff?'#818cf8':'var(--text-muted)'}}>
                        {m.author_name[0]?.toUpperCase()}
                      </div>
                      <div style={{maxWidth:'70%'}}>
                        <div style={{fontSize:10,color:'var(--text-faint)',marginBottom:3,textAlign:m.author_is_staff?'right':'left'}}>
                          {m.author_name} · {fmtTime(m.sent_at)}
                        </div>
                        <div style={{background:m.author_is_staff?'rgba(88,101,242,.15)':'var(--elevated)',border:`1px solid ${m.author_is_staff?'rgba(88,101,242,.3)':'var(--border)'}`,borderRadius:10,padding:'8px 12px',fontSize:13,color:'var(--text)',lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                          {m.content}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef}/>
                </div>

                {/* Reply box */}
                {activeThread.status==='open'&&(
                  <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',display:'flex',gap:10,alignItems:'flex-end'}}>
                    <textarea
                      style={{...INP,flex:1,minHeight:72,maxHeight:200,resize:'vertical'}}
                      placeholder="Type a reply… (the bot will DM this to the user)"
                      value={reply}
                      onChange={e=>setReply(e.target.value)}
                      onKeyDown={e=>{if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();sendReply();}}}
                    />
                    <button onClick={sendReply} disabled={sending||!reply.trim()}
                      style={{padding:'10px 16px',background:'var(--primary)',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',gap:6,opacity:(sending||!reply.trim())?.5:1,fontFamily:'Lexend',fontWeight:700,fontSize:13,flexShrink:0}}>
                      <Send size={13}/>{sending?'Sending…':'Send'}
                    </button>
                  </div>
                )}
                {activeThread.status==='closed'&&(
                  <div style={{padding:'10px 16px',borderTop:'1px solid var(--border)',textAlign:'center',fontSize:12,color:'var(--text-faint)'}}>
                    This thread is closed. Open a new one to contact this user.
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {/* ── CLOSE MODAL ────────────────────────────────────────────── */}
      {closeModalId!=null&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={e=>{if(e.target===e.currentTarget){setCloseModalId(null);}}}>
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:14,padding:24,minWidth:360,maxWidth:480,width:'90%',display:'flex',flexDirection:'column',gap:14}}>
            <div style={{fontSize:15,fontWeight:700,color:'var(--text)',display:'flex',alignItems:'center',gap:8}}>
              <CheckCircle size={16} style={{color:'#ef4444'}}/> Close Thread #{closeModalId}
            </div>
            <div style={{fontSize:13,color:'var(--text-muted)'}}>
              The user will receive a DM and the thread will be archived in Discord.
            </div>
            <div>
              <label style={LBL}>Reason (optional)</label>
              <textarea style={{...INP,minHeight:72,resize:'vertical'}}
                placeholder="e.g. Resolved — no further action required"
                value={closeReason} onChange={e=>setCloseReason(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&e.ctrlKey){e.preventDefault();confirmClose();}}}
              />
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
              <button onClick={()=>setCloseModalId(null)}
                style={{padding:'8px 18px',background:'transparent',border:'1px solid var(--border)',borderRadius:8,color:'var(--text-muted)',cursor:'pointer',fontSize:13,fontFamily:'Lexend'}}>
                Cancel
              </button>
              <button onClick={confirmClose} disabled={closing}
                style={{padding:'8px 20px',background:'rgba(239,68,68,.9)',border:'none',borderRadius:8,color:'#fff',cursor:'pointer',fontSize:13,fontWeight:700,fontFamily:'Lexend',opacity:closing?.6:1}}>
                {closing?'Closing…':'✓ Confirm Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── LOG ──────────────────────────────────────────────────────── */}
      {tab==='log'&&(
        <div style={{display:'grid',gridTemplateColumns:'300px 1fr',gap:12,minHeight:500}}>
          {/* Closed thread list */}
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{padding:'12px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.07em'}}>Closed Threads</span>
              <button onClick={loadLog} style={{padding:'3px 8px',background:'transparent',border:'1px solid var(--border)',borderRadius:5,color:'var(--text-muted)',cursor:'pointer',fontSize:11,display:'flex',alignItems:'center',gap:4}}>
                <RefreshCw size={10}/> Refresh
              </button>
            </div>
            <div style={{overflow:'auto',flex:1}}>
              {logEntries.length===0
                ?<div style={{padding:40,textAlign:'center',color:'var(--text-faint)',fontSize:13}}>No closed threads yet</div>
                :logEntries.map(e=>(
                  <div key={e.id} onClick={()=>openLogThread(e)}
                    style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',cursor:'pointer',background:logThread?.id===e.id?'var(--elevated)':'transparent'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                      <div style={{width:6,height:6,borderRadius:3,background:PRIORITY_COLOR[e.priority]||'#6b7280',flexShrink:0}}/>
                      <span style={{fontSize:13,fontWeight:600,color:'var(--text)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.username}</span>
                      <span style={{fontSize:10,color:'var(--text-faint)'}}>{e.message_count} msg{e.message_count!==1?'s':''}</span>
                    </div>
                    <div style={{fontSize:11,color:'var(--text-muted)',paddingLeft:12,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.subject}</div>
                    <div style={{fontSize:10,color:'var(--text-faint)',paddingLeft:12,marginTop:2}}>
                      Closed by {e.closed_by||'Staff'} · {e.closed_at?fmtTime(e.closed_at):'?'}
                    </div>
                    {e.close_reason&&<div style={{fontSize:10,color:'var(--text-faint)',paddingLeft:12,fontStyle:'italic',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>"{e.close_reason}"</div>}
                  </div>
                ))
              }
            </div>
          </div>

          {/* Log transcript viewer */}
          <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            {!logThread
              ?<div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:10,color:'var(--text-faint)'}}>
                <FileText size={32}/><div style={{fontSize:14,color:'var(--text-muted)'}}>Select a closed thread to view its transcript</div>
              </div>
              :<>
                <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',gap:10,alignItems:'flex-start',flexWrap:'wrap'}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>{logThread.username} <span style={{fontSize:11,color:'var(--text-faint)'}}>({logThread.user_id})</span></div>
                    <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>{logThread.subject}</div>
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:3,alignItems:'flex-end',fontSize:10,color:'var(--text-faint)'}}>
                    <span>Closed by <strong style={{color:'var(--text-muted)'}}>{logThread.closed_by||'Staff'}</strong></span>
                    {logThread.close_reason&&<span style={{fontStyle:'italic',maxWidth:200,textAlign:'right'}}>"{logThread.close_reason}"</span>}
                    <span>Opened {logThread.opened_at?fmtTime(logThread.opened_at):'?'} · Closed {logThread.closed_at?fmtTime(logThread.closed_at):'?'}</span>
                  </div>
                </div>
                <div style={{flex:1,overflow:'auto',padding:'12px 16px',display:'flex',flexDirection:'column',gap:10}}>
                  {logMsgLoading?<div style={{textAlign:'center',color:'var(--text-faint)',padding:32}}>Loading…</div>
                  :logMessages.length===0?<div style={{textAlign:'center',color:'var(--text-faint)',padding:32}}>No messages in transcript</div>
                  :logMessages.map(m=>(
                    <div key={m.id} style={{display:'flex',gap:10,flexDirection:m.author_is_staff?'row-reverse':'row'}}>
                      <div style={{width:28,height:28,borderRadius:'50%',background:m.author_is_staff?'rgba(88,101,242,.3)':'rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:11,fontWeight:700,color:m.author_is_staff?'#818cf8':'var(--text-muted)'}}>
                        {m.author_name[0]?.toUpperCase()}
                      </div>
                      <div style={{maxWidth:'72%'}}>
                        <div style={{fontSize:10,color:'var(--text-faint)',marginBottom:3,textAlign:m.author_is_staff?'right':'left'}}>
                          {m.author_name} · {fmtTime(m.sent_at)}
                        </div>
                        <div style={{background:m.author_is_staff?'rgba(88,101,242,.15)':'var(--elevated)',border:`1px solid ${m.author_is_staff?'rgba(88,101,242,.3)':'var(--border)'}`,borderRadius:10,padding:'8px 12px',fontSize:13,color:'var(--text)',lineHeight:1.5,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>
                          {m.content}
                        </div>
                      </div>
                    </div>
                  ))
                  }
                </div>
                <div style={{padding:'8px 16px',borderTop:'1px solid var(--border)',textAlign:'center',fontSize:11,color:'var(--text-faint)'}}>
                  Archived transcript · {logThread.message_count} message{logThread.message_count!==1?'s':''}
                </div>
              </>
            }
          </div>
        </div>
      )}
    </div>
  );
}

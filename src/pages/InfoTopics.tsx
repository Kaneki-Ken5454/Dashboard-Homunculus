import { useEffect, useState, useMemo, useRef } from 'react';
import {
  BookOpen, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Eye, EyeOff, Download, Upload, History, ClipboardList,
  FolderEdit, Tag, AlertCircle, CheckCircle, RotateCcw,
  Link, FileText,
} from 'lucide-react';
import {
  getInfoTopics, createInfoTopic, updateInfoTopic, deleteInfoTopic,
  updateInfoSection, updateInfoSubcategory,
  setTopicPublished, getTopicHistory, restoreTopicVersion,
  getInfoAuditLog, exportInfoTopics, importInfoTopics,
  type InfoTopic, type TopicHistoryEntry, type InfoAuditEntry,
} from '../lib/db';
import Modal from '../components/Modal';

interface Props { guildId: string; }

function ago(s: string) {
  const d = Date.now() - new Date(s).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(s).toLocaleDateString();
}

function detectLinks(text: string) { return /https?:\/\/[^\s<>"]+/.test(text); }

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 5, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}{hint && <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text-faint)', textTransform: 'none', fontSize: 11 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const EMOJI_PICKS = [
  '📁','📂','📋','📌','📍','🔖','🏷️','🗂️','📑','📎',
  '🎯','⚡','🔥','✨','💫','🌟','⭐','🎖️','🏆','🎗️',
  '🔧','⚙️','🛠️','🔨','💡','🔍','📡','🖥️','📢','💬',
  '👥','👤','🤝','🎮','🎲','📊','📈','💰','🎁','🎨',
  '🔒','🔓','🛡️','⚠️','❓','ℹ️','🚨','🎵','🌐','🏠',
];

function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
          {value || <span style={{ color: 'var(--text-faint)', fontSize: 14 }}>?</span>}
        </div>
        <input className="inp" style={{ fontSize: 18, flex: 1 }} placeholder="Type or paste emoji" value={value} onChange={e => onChange(e.target.value)} />
        {value && <button onClick={() => onChange('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 16, padding: '0 4px' }}>✕</button>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {EMOJI_PICKS.map(e => (
          <button key={e} onClick={() => onChange(e)} style={{ width: 30, height: 30, background: value === e ? 'var(--primary-subtle)' : 'var(--elevated)', border: `1px solid ${value === e ? '#818cf8' : 'var(--border)'}`, borderRadius: 5, cursor: 'pointer', fontSize: 14 }}>{e}</button>
        ))}
      </div>
    </div>
  );
}

const EMPTY: Partial<InfoTopic> = {
  section: 'general', subcategory: 'General', topic_id: '', name: '',
  embed_title: '', embed_description: '', embed_color: '#5865F2', emoji: '📄',
  image: '', thumbnail: '', footer: '', category_emoji_id: '', is_published: true,
};

type Tab = 'topics' | 'audit';
type ModalType = 'create' | 'edit' | 'section' | 'subcategory' | 'history' | 'import' | null;
type SearchFilter = 'all' | 'published' | 'draft';

function EmbedPreview({ topic }: { topic: Partial<InfoTopic> }) {
  const hex = (topic.embed_color || '#5865F2');
  const hasLinks = detectLinks(topic.embed_description || '');
  return (
    <div>
      <div style={{ background: '#2b2d31', borderRadius: 8, padding: '12px 16px 16px', borderLeft: `4px solid ${hex}` }}>
        {topic.thumbnail && (
          <img src={topic.thumbnail} alt="" style={{ float: 'right', width: 72, height: 72, borderRadius: 4, objectFit: 'cover', marginLeft: 12 }} onError={e => (e.currentTarget.style.display='none')} />
        )}
        {topic.embed_title
          ? <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 6 }}>{topic.embed_title}</div>
          : <div style={{ fontSize: 13, color: '#6d6f78', fontStyle: 'italic', marginBottom: 6 }}>No title…</div>}
        {topic.embed_description
          ? <div style={{ fontSize: 13, color: '#dbdee1', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{topic.embed_description}</div>
          : <div style={{ fontSize: 13, color: '#6d6f78', fontStyle: 'italic' }}>No description…</div>}
        {topic.image && <img src={topic.image} alt="" style={{ width: '100%', borderRadius: 4, marginTop: 12 }} onError={e => (e.currentTarget.style.display='none')} />}
        {topic.footer && <div style={{ fontSize: 11, color: '#a3a6aa', marginTop: 10, borderTop: '1px solid #3a3c43', paddingTop: 8 }}>{topic.footer}</div>}
        <div style={{ clear: 'both' }} />
      </div>
      {hasLinks && <div style={{ marginTop: 5, display: 'flex', gap: 5, alignItems: 'center', fontSize: 11, color: '#faa81a' }}><Link size={11} /> Raw URL detected — use <code style={{ background: 'rgba(255,255,255,0.1)', padding: '0 3px', borderRadius: 3 }}>[text](url)</code></div>}
      {(topic.embed_description?.length ?? 0) > 3500 && <div style={{ marginTop: 5, display: 'flex', gap: 5, alignItems: 'center', fontSize: 11, color: '#ed4245' }}><AlertCircle size={11} /> Too long ({topic.embed_description?.length}/4000)</div>}
    </div>
  );
}

export default function InfoTopicsPage({ guildId }: Props) {
  const [topics, setTopics]       = useState<InfoTopic[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<Tab>('topics');
  const [selected, setSelected]   = useState<InfoTopic | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [modal, setModal]         = useState<ModalType>(null);
  const [form, setForm]           = useState<Partial<InfoTopic>>(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<SearchFilter>('all');
  const [sectionTarget, setSectionTarget] = useState('');
  const [sectionName, setSectionName]     = useState('');
  const [sectionEmoji, setSectionEmoji]   = useState('');
  const [subcatTarget, setSubcatTarget]   = useState<{section:string;name:string}>({section:'',name:''});
  const [subcatName, setSubcatName]       = useState('');
  const [subcatEmoji, setSubcatEmoji]     = useState('');
  const [history, setHistory]     = useState<TopicHistoryEntry[]>([]);
  const [historyFor, setHistoryFor] = useState<InfoTopic | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [audit, setAudit]         = useState<InfoAuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [importJson, setImportJson]   = useState('');
  const [importMode, setImportMode]   = useState<'merge'|'replace'>('merge');
  const [importResult, setImportResult] = useState<{imported:number;skipped:number}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getInfoTopics(guildId)
      .then(t => { setTopics(t); setSelected(s => s ? (t.find(x => x.id===s.id)??null) : null); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); setSelected(null); }, [guildId]);

  const loadAudit = () => {
    setAuditLoading(true);
    getInfoAuditLog(guildId).then(setAudit).catch(()=>{}).finally(()=>setAuditLoading(false));
  };
  useEffect(() => { if (tab==='audit') loadAudit(); }, [tab, guildId]);

  const grouped = useMemo(() => topics.reduce<Record<string,Record<string,InfoTopic[]>>>((acc,t) => {
    const sec=t.section||'general', sub=t.subcategory||'General';
    if (!acc[sec]) acc[sec]={};
    if (!acc[sec][sub]) acc[sec][sub]=[];
    acc[sec][sub].push(t); return acc;
  }, {}), [topics]);

  const emojiMap = useMemo(() => {
    const m = new Map<string,string>();
    for (const t of topics) {
      if (t.category_emoji_id && !m.has(t.section)) m.set(t.section,t.category_emoji_id);
      const k=`${t.section}::${t.subcategory}`;
      if (t.subcategory_emoji && !m.has(k)) m.set(k,t.subcategory_emoji);
    }
    return m;
  }, [topics]);

  const openCreate = () => { setForm({...EMPTY}); setModal('create'); setError(''); };
  const openEdit   = (t:InfoTopic) => { setForm({...t}); setModal('edit'); setError(''); };
  const openEditSection = (s:string) => { setSectionTarget(s); setSectionName(s); setSectionEmoji(emojiMap.get(s)||''); setModal('section'); setError(''); };
  const openEditSub = (sec:string,sub:string) => { setSubcatTarget({section:sec,name:sub}); setSubcatName(sub); setSubcatEmoji(emojiMap.get(`${sec}::${sub}`)||''); setModal('subcategory'); setError(''); };
  const openHistory = async (t:InfoTopic) => {
    setHistoryFor(t); setModal('history'); setHistLoading(true);
    try { setHistory(await getTopicHistory(t.id)); } catch { setHistory([]); } finally { setHistLoading(false); }
  };

  const submitTopic = async () => {
    if (!form.name?.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (modal==='create') await createInfoTopic(guildId, form);
      else if (modal==='edit' && form.id) await updateInfoTopic(form.id, form);
      setModal(null); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const submitSection = async () => {
    if (!sectionName.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true); setError('');
    try {
      await updateInfoSection(guildId, sectionTarget, sectionName.trim().toLowerCase().replace(/\s+/g,'_'), sectionEmoji.trim()||undefined);
      setModal(null); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const submitSub = async () => {
    if (!subcatName.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true); setError('');
    try {
      await updateInfoSubcategory(guildId, subcatTarget.section, subcatTarget.name, subcatName.trim(), subcatEmoji.trim()||undefined);
      setModal(null); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const del = async (t:InfoTopic) => {
    if (!confirm(`Delete "${t.name}"?`)) return;
    try { await deleteInfoTopic(t.id); if (selected?.id===t.id) setSelected(null); setTopics(p=>p.filter(x=>x.id!==t.id)); }
    catch(e) { setError((e as Error).message); }
  };
  const togglePublish = async (t:InfoTopic) => {
    const next = !t.is_published;
    setTopics(p=>p.map(x=>x.id===t.id?{...x,is_published:next}:x));
    if (selected?.id===t.id) setSelected(s=>s?{...s,is_published:next}:s);
    await setTopicPublished(t.id, next).catch(()=>load());
  };
  const doRestore = async (entry:TopicHistoryEntry) => {
    if (!historyFor || !confirm('Restore this version? Current state saved first.')) return;
    await restoreTopicVersion(entry.id, historyFor.id);
    setModal(null); load();
  };
  const doExport = async () => {
    const data = await exportInfoTopics(guildId);
    const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url;
    a.download=`info_topics_${guildId}_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const handleImportFile = (e:React.ChangeEvent<HTMLInputElement>) => {
    const f=e.target.files?.[0]; if(!f) return;
    const r=new FileReader(); r.onload=ev=>setImportJson(ev.target?.result as string??''); r.readAsText(f);
  };
  const doImport = async () => {
    setSaving(true); setImportResult(null);
    try {
      const parsed=JSON.parse(importJson);
      const ts=parsed.topics??(Array.isArray(parsed)?parsed:[]);
      const r=await importInfoTopics(guildId, ts, importMode);
      setImportResult(r); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:300}}>
      <div style={{width:32,height:32,border:'2px solid var(--border)',borderTopColor:'var(--primary)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
    </div>
  );

  const draftCount=topics.filter(t=>!t.is_published).length;
  const pubCount=topics.filter(t=>t.is_published).length;

  const filteredTopics = useMemo(() => {
    let list = topics;
    if (statusFilter === 'published') list = list.filter(t => t.is_published);
    if (statusFilter === 'draft') list = list.filter(t => !t.is_published);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.topic_id?.toLowerCase().includes(q) || t.embed_description?.toLowerCase().includes(q));
    }
    return list;
  }, [topics, statusFilter, search]);

  const groupedFiltered = useMemo(() => filteredTopics.reduce<Record<string,Record<string,InfoTopic[]>>>((acc,t) => {
    const sec=t.section||'general', sub=t.subcategory||'General';
    if (!acc[sec]) acc[sec]={};
    if (!acc[sec][sub]) acc[sec][sub]=[];
    acc[sec][sub].push(t); return acc;
  }, {}), [filteredTopics]);

  return (
    <div className="animate-fade">
      {/* Toolbar */}
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:4}}>
          {(['topics','audit'] as Tab[]).map(t=>(
            <button key={t} onClick={()=>setTab(t)} style={{padding:'5px 12px',borderRadius:7,border:'none',cursor:'pointer',fontSize:12,fontWeight:600,background:tab===t?'var(--primary-subtle)':'var(--elevated)',color:tab===t?'#818cf8':'var(--text-muted)',fontFamily:'inherit',display:'flex',alignItems:'center',gap:4}}>
              {t==='topics'?<><BookOpen size={11}/> Topics</>:<><ClipboardList size={11}/> Audit</>}
            </button>
          ))}
        </div>
        {tab==='topics'&&<>
          <div style={{position:'relative',flex:'1 1 160px',minWidth:130}}>
            <Search size={12} style={{position:'absolute',left:8,top:'50%',transform:'translateY(-50%)',color:'var(--text-faint)',pointerEvents:'none'}}/>
            <input className="inp" style={{paddingLeft:26,fontSize:12,height:30}} placeholder="Search topics…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div style={{display:'flex',gap:3}}>
            {([['all','All'],['published','Live'],['draft','Draft']] as [SearchFilter,string][]).map(([v,l])=>(
              <button key={v} onClick={()=>setStatusFilter(v)} style={{padding:'4px 10px',borderRadius:6,border:`1px solid ${statusFilter===v?'#818cf8':'var(--border)'}`,background:statusFilter===v?'var(--primary-subtle)':'var(--elevated)',color:statusFilter===v?'#818cf8':'var(--text-muted)',cursor:'pointer',fontSize:11,fontWeight:statusFilter===v?700:400}}>{l}</button>
            ))}
          </div>
          <span style={{fontSize:11,color:'var(--text-faint)',whiteSpace:'nowrap'}}>{pubCount} live{draftCount>0&&<span style={{color:'#faa81a'}}> · {draftCount} draft</span>}</span>
        </>}
        <div style={{display:'flex',gap:5,marginLeft:'auto'}}>
          {tab==='topics'&&<>
            <button className="btn btn-ghost btn-sm" onClick={doExport} title="Export as JSON"><Download size={12}/></button>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setImportJson('');setImportResult(null);setModal('import');}} title="Import from JSON"><Upload size={12}/></button>
          </>}
          <button className="btn btn-primary" style={{fontSize:12,padding:'5px 12px'}} onClick={openCreate}><Plus size={12}/> New Topic</button>
        </div>
      </div>

      {error && !modal && <div style={{background:'var(--danger-subtle)',border:'1px solid var(--danger)',borderRadius:10,padding:'10px 14px',color:'var(--danger)',fontSize:13,marginBottom:12}}>{error}</div>}

      {/* Audit tab */}
      {tab==='audit' && (
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>Edit History</span>
            <button className="btn btn-ghost btn-sm" onClick={loadAudit}>Refresh</button>
          </div>
          {auditLoading?<div style={{padding:32,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>Loading…</div>
          :audit.length===0?<div style={{padding:32,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>No audit events yet.</div>
          :<table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:'var(--elevated)',borderBottom:'1px solid var(--border)'}}>
              {['Action','Topic','By','When'].map(h=><th key={h} style={{padding:'8px 14px',textAlign:'left',fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{h}</th>)}
            </tr></thead>
            <tbody>{audit.map(a=>(
              <tr key={a.id} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'8px 14px'}}><span style={{fontSize:11,fontWeight:600,padding:'2px 8px',borderRadius:6,background:a.action==='create'?'rgba(59,165,93,0.15)':a.action==='delete'?'rgba(237,66,69,0.15)':a.action==='publish'?'rgba(88,101,242,0.15)':'rgba(255,255,255,0.07)',color:a.action==='create'?'#3ba55d':a.action==='delete'?'#ed4245':a.action==='publish'?'#818cf8':'var(--text-muted)'}}>{a.action}</span></td>
                <td style={{padding:'8px 14px',fontSize:13,color:'var(--text)'}}>{a.topic_name||'—'} {a.topic_id&&<span className="mono" style={{fontSize:11,color:'var(--text-faint)'}}>({a.topic_id})</span>}</td>
                <td style={{padding:'8px 14px',fontSize:12,color:'var(--text-muted)'}}>{a.changed_by}</td>
                <td style={{padding:'8px 14px',fontSize:12,color:'var(--text-faint)'}}>{ago(a.created_at)}</td>
              </tr>
            ))}</tbody>
          </table>}
        </div>
      )}

      {/* Topics tab */}
      {tab==='topics' && (filteredTopics.length===0?(
        search||statusFilter!=='all'
          ? <div style={{padding:'40px 20px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>No topics match your filter.</div>
          : <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'60px 20px',textAlign:'center'}}>
              <BookOpen size={32} style={{color:'var(--text-faint)',display:'block',margin:'0 auto 12px'}}/><div style={{color:'var(--text-muted)',fontSize:14,marginBottom:16}}>No info topics yet.</div>
              <button className="btn btn-primary" onClick={openCreate}><Plus size={14}/> Create First Topic</button>
            </div>
      ):(
        <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,padding:'60px 20px',textAlign:'center'}}>
          <BookOpen size={32} style={{color:'var(--text-faint)',display:'block',margin:'0 auto 12px'}}/>
          <div style={{color:'var(--text-muted)',fontSize:14,marginBottom:16}}>No info topics yet.</div>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={14}/> Create First Topic</button>
        </div>
      ):(
        <div style={{display:'grid',gridTemplateColumns:selected?'1fr 320px':'1fr',gap:12,alignItems:'start'}}>
          {/* Left: tree */}
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {Object.entries(groupedFiltered).map(([section,subcats])=>{
              const open=!collapsed.has(section);
              const catEmoji=emojiMap.get(section);
              const total=Object.values(subcats).flat().length;
              return (
                <div key={section} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
                  {/* Section header */}
                  <div style={{display:'flex',alignItems:'center',padding:'7px 12px',borderBottom:open?'1px solid var(--border)':'none',background:'var(--elevated)'}}>
                    <button onClick={()=>setCollapsed(p=>{const n=new Set(p);n.has(section)?n.delete(section):n.add(section);return n;})} style={{background:'none',border:'none',color:'var(--text)',cursor:'pointer',display:'flex',alignItems:'center',gap:5,fontFamily:'Lexend,sans-serif',fontSize:12,fontWeight:700,padding:0,flex:1}}>
                      {open?<ChevronDown size={12} style={{color:'var(--text-muted)'}}/>:<ChevronRight size={12} style={{color:'var(--text-muted)'}}/>}
                      {catEmoji&&<span style={{fontSize:13}}>{catEmoji}</span>}
                      <span style={{textTransform:'capitalize'}}>{section}</span>
                      <span style={{background:'var(--primary-subtle)',color:'#818cf8',borderRadius:8,padding:'0 5px',fontSize:10,fontWeight:600}}>{total}</span>
                    </button>
                    
                    <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>openEditSection(section)}><FolderEdit size={10}/> Edit</button>
                  </div>
                  {open&&Object.entries(subcats).map(([sub,items])=>(
                    <div key={sub}>
                      <div style={{display:'flex',alignItems:'center',padding:'3px 12px 3px 26px',background:'rgba(255,255,255,0.015)',borderBottom:'1px solid var(--border)'}}>
                        <button onClick={()=>openEditSub(section,sub)} style={{background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4,padding:0}} title="Edit subcategory">
                          <span style={{fontSize:10,fontWeight:600,color:'var(--text-faint)',textTransform:'uppercase',letterSpacing:'0.06em'}}>
                            {emojiMap.get(`${section}::${sub}`)&&<span style={{marginRight:3,fontSize:11}}>{emojiMap.get(`${section}::${sub}`)}</span>}{sub}
                          </span>
                          <span style={{fontSize:10,color:'var(--text-faint)',marginLeft:3}}>{items.length}</span>
                          <Pencil size={7} style={{color:'var(--text-faint)',opacity:0.4,marginLeft:2}}/>
                        </button>
                      </div>
                      {items.map(t=>(
                        <div key={t.id} onClick={()=>setSelected(s=>s?.id===t.id?null:t)}
                          style={{display:'flex',alignItems:'center',padding:'6px 12px 6px 32px',borderBottom:'1px solid var(--border)',cursor:'pointer',background:selected?.id===t.id?'var(--primary-subtle)':'transparent',transition:'background 0.1s'}}
                          onMouseEnter={e=>{if(selected?.id!==t.id)(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.03)';}}
                          onMouseLeave={e=>{if(selected?.id!==t.id)(e.currentTarget as HTMLElement).style.background='transparent';}}>
                          <span style={{fontSize:13,marginRight:6,flexShrink:0}}>{t.emoji||'📄'}</span>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',gap:5}}>
                              <span style={{fontSize:13,fontWeight:500,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.name}</span>
                              {!t.is_published&&<span style={{fontSize:10,fontWeight:600,background:'rgba(250,168,26,0.15)',color:'#faa81a',padding:'1px 5px',borderRadius:4,flexShrink:0}}>DRAFT</span>}
                            </div>
                            <div style={{fontSize:11,color:'var(--text-faint)',marginTop:1}}>
                              <span className="mono">{t.topic_id}</span>
                              {t.views>0&&<span style={{marginLeft:7}}>👁 {t.views}</span>}
                            </div>
                          </div>
                          <div style={{display:'flex',gap:3,marginLeft:6,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                            <button className="btn btn-ghost btn-sm" style={{padding:'3px 5px'}} onClick={()=>togglePublish(t)} title={t.is_published?'Unpublish':'Publish'}>
                              {t.is_published?<Eye size={10}/>:<EyeOff size={10} style={{color:'#faa81a'}}/>}
                            </button>
                            <button className="btn btn-ghost btn-sm" style={{padding:'3px 5px'}} onClick={()=>openHistory(t)} title="History"><History size={10}/></button>
                            <button className="btn btn-ghost btn-sm" style={{padding:'3px 5px'}} onClick={()=>openEdit(t)} title="Edit"><Pencil size={10}/></button>
                            <button className="btn btn-danger btn-sm" style={{padding:'3px 5px'}} onClick={()=>del(t)} title="Delete"><Trash2 size={10}/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Right: preview pane */}
          {selected&&(
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden',position:'sticky',top:0}}>
              <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',background:'var(--elevated)'}}>
                <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>Live Preview</span>
                <div style={{display:'flex',gap:4}}>
                  <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>openEdit(selected)}><Pencil size={10}/> Edit</button>
                  <button onClick={()=>setSelected(null)} style={{background:'none',border:'none',color:'var(--text-faint)',cursor:'pointer',fontSize:15,padding:'0 2px',lineHeight:1}}>✕</button>
                </div>
              </div>
              <div style={{padding:14}}>
                <div style={{marginBottom:12}}>
                  <div style={{display:'flex',gap:6,alignItems:'center',marginBottom:4}}>
                    <span style={{fontSize:18}}>{selected.emoji||'📄'}</span>
                    <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{selected.name}</span>
                    {!selected.is_published&&<span style={{fontSize:10,background:'rgba(250,168,26,0.15)',color:'#faa81a',padding:'1px 5px',borderRadius:4,fontWeight:600}}>DRAFT</span>}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-faint)'}}>
                    <span className="mono">{selected.topic_id}</span>
                    <span style={{margin:'0 5px',color:'var(--border)'}}>·</span>
                    {selected.section}/{selected.subcategory}
                    <span style={{margin:'0 5px',color:'var(--border)'}}>·</span>
                    {selected.views} views
                  </div>
                  <div style={{fontSize:10,color:'var(--text-faint)',marginTop:2}}>Updated {ago(selected.updated_at)}</div>
                </div>
                <EmbedPreview topic={selected}/>
                <div style={{marginTop:12,display:'flex',flexDirection:'column',gap:5}}>
                  <button className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center'}} onClick={()=>togglePublish(selected)}>
                    {selected.is_published?<><EyeOff size={11}/> Unpublish</>:<><Eye size={11}/> Publish</>}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{width:'100%',justifyContent:'center'}} onClick={()=>openHistory(selected)}>
                    <History size={11}/> Version History
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Create/Edit Modal */}
      {(modal==='create'||modal==='edit')&&(
        <Modal title={modal==='create'?'📝 New Info Topic':'✏️ Edit Topic'} onClose={()=>setModal(null)} width="860px">
          <div style={{display:'grid',gridTemplateColumns:'1fr 360px',gap:20}}>
            <div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 70px',gap:10}}>
                <F label="Name *"><input className="inp" autoFocus placeholder="e.g. How to verify" value={form.name??''} onChange={e=>setForm(p=>({...p,name:e.target.value}))}/></F>
                <F label="Emoji"><input className="inp" style={{fontSize:20,textAlign:'center'}} placeholder="📄" value={form.emoji??''} onChange={e=>setForm(p=>({...p,emoji:e.target.value}))}/></F>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <F label="Section">
                  <select className="inp" value={form.section??'general'} onChange={e=>setForm(p=>({...p,section:e.target.value}))}>
                    <option value="general">general</option><option value="common">common</option><option value="staff">staff</option>
                  </select>
                </F>
                <F label="Subcategory"><input className="inp" placeholder="General" value={form.subcategory??''} onChange={e=>setForm(p=>({...p,subcategory:e.target.value}))}/></F>
              </div>
              <F label="Topic ID" hint="auto-generated if blank"><input className="inp mono" placeholder="how_to_verify" value={form.topic_id??''} onChange={e=>setForm(p=>({...p,topic_id:e.target.value}))}/></F>
              <F label="Embed Title"><input className="inp" placeholder="Title in Discord embed" value={form.embed_title??''} onChange={e=>setForm(p=>({...p,embed_title:e.target.value}))}/></F>
              <F label="Embed Description">
                <textarea className="inp" style={{minHeight:110,resize:'vertical',fontFamily:'JetBrains Mono,monospace',fontSize:12}} placeholder="Supports **bold**, *italic*, [link](url), `code`" value={form.embed_description??''} onChange={e=>setForm(p=>({...p,embed_description:e.target.value}))}/>
                <div style={{fontSize:10,textAlign:'right',marginTop:2,color:(form.embed_description?.length??0)>3500?'#ed4245':'var(--text-faint)'}}>{form.embed_description?.length??0}/4000</div>
              </F>
              <div style={{display:'grid',gridTemplateColumns:'60px 1fr',gap:10,alignItems:'end'}}>
                <F label="Color"><input type="color" value={form.embed_color??'#5865F2'} onChange={e=>setForm(p=>({...p,embed_color:e.target.value}))} style={{width:'100%',height:38,border:'none',borderRadius:6,cursor:'pointer',padding:2,background:'var(--elevated)'}}/></F>
                <F label="Hex"><input className="inp mono" value={form.embed_color??'#5865F2'} onChange={e=>setForm(p=>({...p,embed_color:e.target.value}))}/></F>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <F label="Image URL"><input className="inp" placeholder="https://…" value={form.image??''} onChange={e=>setForm(p=>({...p,image:e.target.value}))}/></F>
                <F label="Thumbnail URL"><input className="inp" placeholder="https://…" value={form.thumbnail??''} onChange={e=>setForm(p=>({...p,thumbnail:e.target.value}))}/></F>
              </div>
              <F label="Footer"><input className="inp" placeholder="Footer text" value={form.footer??''} onChange={e=>setForm(p=>({...p,footer:e.target.value}))}/></F>
              <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:form.is_published?'rgba(59,165,93,0.08)':'rgba(250,168,26,0.08)',borderRadius:8,border:`1px solid ${form.is_published?'rgba(59,165,93,0.3)':'rgba(250,168,26,0.3)'}`}}>
                <button onClick={()=>setForm(p=>({...p,is_published:!p.is_published}))} style={{width:40,height:22,borderRadius:11,border:'none',cursor:'pointer',background:form.is_published?'#3ba55d':'#faa81a',position:'relative',flexShrink:0}}>
                  <div style={{position:'absolute',top:3,left:form.is_published?20:3,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left 0.2s'}}/>
                </button>
                <div>
                  <div style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{form.is_published?'✅ Published':'🟡 Draft'}</div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>{form.is_published?'Visible in /infoview':'Hidden from Discord — dashboard only'}</div>
                </div>
              </div>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Live Preview</div>
              <EmbedPreview topic={form}/>
            </div>
          </div>
          {error&&<div style={{marginTop:12,color:'var(--danger)',background:'var(--danger-subtle)',border:'1px solid var(--danger)',borderRadius:8,padding:'10px 14px',fontSize:13}}>{error}</div>}
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
            <button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitTopic} disabled={saving||!form.name?.trim()}>{saving?'Saving…':modal==='create'?'Create Topic':'Save Changes'}</button>
          </div>
        </Modal>
      )}

      {/* Section modal */}
      {modal==='section'&&(
        <Modal title="✏️ Edit Section" onClose={()=>setModal(null)} width="480px">
          <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>Applies to all <strong style={{color:'var(--text)'}}>{Object.values(grouped[sectionTarget]??{}).flat().length}</strong> topics.</div>
          <F label="Section Name"><input className="inp" autoFocus value={sectionName} onChange={e=>setSectionName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submitSection()}/></F>
          <div style={{fontSize:11,color:'var(--text-faint)',marginTop:-6,marginBottom:14}}>Spaces → underscores, lowercase</div>
          <div style={{height:1,background:'var(--border)',marginBottom:14}}/>
          <F label="Category Emoji" hint="shown next to section in bot menu"><EmojiPicker value={sectionEmoji} onChange={setSectionEmoji}/></F>
          <div style={{fontSize:11,color:'var(--text-faint)',marginTop:6}}>Custom emoji: enter Discord snowflake ID (17-19 digits)</div>
          {error&&<div style={{marginTop:12,color:'var(--danger)',background:'var(--danger-subtle)',border:'1px solid var(--danger)',borderRadius:8,padding:'10px 14px',fontSize:13}}>{error}</div>}
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
            <button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitSection} disabled={saving||!sectionName.trim()}>{saving?'Saving…':'Save Section'}</button>
          </div>
        </Modal>
      )}

      {/* Subcategory modal */}
      {modal==='subcategory'&&(
        <Modal title="✏️ Edit Subcategory" onClose={()=>setModal(null)} width="480px">
          <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:16}}>Editing <strong style={{color:'var(--text)'}}>{subcatTarget.name}</strong> in <strong style={{color:'var(--text)',textTransform:'capitalize'}}>{subcatTarget.section}</strong></div>
          <F label="Subcategory Name"><input className="inp" autoFocus value={subcatName} onChange={e=>setSubcatName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submitSub()}/></F>
          <div style={{height:1,background:'var(--border)',margin:'4px 0 14px'}}/>
          <F label="Subcategory Emoji" hint="shown next to subcategory in bot menu"><EmojiPicker value={subcatEmoji} onChange={setSubcatEmoji}/></F>
          {error&&<div style={{marginTop:12,color:'var(--danger)',background:'var(--danger-subtle)',border:'1px solid var(--danger)',borderRadius:8,padding:'10px 14px',fontSize:13}}>{error}</div>}
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:16}}>
            <button className="btn btn-ghost" onClick={()=>setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitSub} disabled={saving||!subcatName.trim()}>{saving?'Saving…':'Save'}</button>
          </div>
        </Modal>
      )}

      {/* History modal */}
      {modal==='history'&&historyFor&&(
        <Modal title={`🕐 History — ${historyFor.name}`} onClose={()=>setModal(null)} width="580px">
          {histLoading?<div style={{padding:32,textAlign:'center',color:'var(--text-muted)'}}>Loading…</div>
          :history.length===0?<div style={{padding:32,textAlign:'center',color:'var(--text-muted)',fontSize:13}}>No history yet. Recorded on every edit.</div>
          :<div style={{display:'flex',flexDirection:'column',gap:8}}>
            {history.map((h,i)=>(
              <div key={h.id} style={{background:'var(--elevated)',border:'1px solid var(--border)',borderRadius:10,padding:'12px 14px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6}}>
                  <div>
                    <span style={{fontSize:12,fontWeight:600,color:'var(--text)'}}>{i===0?'📌 Latest Save':`v${history.length-i}`}</span>
                    <span style={{marginLeft:8,fontSize:11,color:'var(--text-faint)'}}>{ago(h.created_at)} · {h.changed_by}</span>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{fontSize:11}} onClick={()=>doRestore(h)}><RotateCcw size={10}/> Restore</button>
                </div>
                <div style={{fontSize:12,color:'var(--text-muted)'}}>
                  <strong style={{color:'var(--text)'}}>{h.snapshot.embed_title||h.snapshot.name}</strong>
                  {h.snapshot.embed_description&&<div style={{marginTop:2,color:'var(--text-faint)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{h.snapshot.embed_description.slice(0,120)}{h.snapshot.embed_description.length>120?'…':''}</div>}
                </div>
              </div>
            ))}
          </div>}
          <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}>
            <button className="btn btn-ghost" onClick={()=>setModal(null)}>Close</button>
          </div>
        </Modal>
      )}

      {/* Import modal */}
      {modal==='import'&&(
        <Modal title="📥 Import Topics" onClose={()=>setModal(null)} width="500px">
          <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:14}}>Import topics from a JSON file exported from this dashboard.</div>
          <F label="Import Mode">
            <div style={{display:'flex',gap:8}}>
              {(['merge','replace'] as const).map(m=>(
                <button key={m} onClick={()=>setImportMode(m)} style={{flex:1,padding:'8px 10px',borderRadius:8,border:`1px solid ${importMode===m?'#818cf8':'var(--border)'}`,background:importMode===m?'var(--primary-subtle)':'var(--elevated)',color:importMode===m?'#818cf8':'var(--text-muted)',cursor:'pointer',fontSize:12,fontFamily:'inherit',fontWeight:600}}>
                  {m==='merge'?'🔀 Merge':'♻️ Replace all'}
                </button>
              ))}
            </div>
          </F>
          <F label="JSON File">
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <input ref={fileRef} type="file" accept=".json" style={{display:'none'}} onChange={handleImportFile}/>
              <button className="btn btn-ghost" style={{fontSize:12}} onClick={()=>fileRef.current?.click()}><Upload size={12}/> Choose File</button>
              {importJson&&<span style={{fontSize:11,color:'#3ba55d'}}>✅ {importJson.length.toLocaleString()} chars</span>}
            </div>
          </F>
          {importResult&&<div style={{background:'rgba(59,165,93,0.1)',border:'1px solid rgba(59,165,93,0.3)',borderRadius:8,padding:'12px 14px',marginBottom:10}}><div style={{display:'flex',alignItems:'center',gap:6,fontSize:13,fontWeight:600,color:'#3ba55d'}}><CheckCircle size={14}/> Done</div><div style={{fontSize:12,color:'var(--text-muted)',marginTop:3}}>{importResult.imported} imported · {importResult.skipped} skipped</div></div>}
          {importMode==='replace'&&<div style={{display:'flex',gap:6,fontSize:12,color:'#ed4245',background:'rgba(237,66,69,0.08)',border:'1px solid rgba(237,66,69,0.3)',borderRadius:8,padding:'8px 12px',marginBottom:10}}><AlertCircle size={13} style={{flexShrink:0,marginTop:1}}/> Replace mode deletes ALL existing topics first.</div>}
          {error&&<div style={{color:'var(--danger)',background:'var(--danger-subtle)',border:'1px solid var(--danger)',borderRadius:8,padding:'10px 14px',fontSize:13,marginBottom:10}}>{error}</div>}
          <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:4}}>
            <button className="btn btn-ghost" onClick={()=>setModal(null)}>Close</button>
            <button className="btn btn-primary" onClick={doImport} disabled={!importJson||saving}>{saving?'Importing…':'Import'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

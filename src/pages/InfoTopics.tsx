import { useEffect, useState, useMemo, useRef } from 'react';
import {
  BookOpen, Plus, Pencil, Trash2, ChevronDown, ChevronRight,
  Eye, EyeOff, Download, Upload, History, ClipboardList,
  FolderEdit, AlertCircle, CheckCircle, RotateCcw,
  Link, Search, X, Tag,
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

// ── Field wrapper ─────────────────────────────────────────────────────────────
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

// ── Emoji picker ──────────────────────────────────────────────────────────────
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

// ── Discord embed preview ─────────────────────────────────────────────────────
function EmbedPreview({ topic }: { topic: Partial<InfoTopic> }) {
  const hex = topic.embed_color || '#5865F2';
  const hasLinks = detectLinks(topic.embed_description || '');
  return (
    <div>
      <div style={{ background: '#2b2d31', borderRadius: 8, padding: '12px 16px 16px', borderLeft: `4px solid ${hex}` }}>
        {topic.thumbnail && <img src={topic.thumbnail} alt="" style={{ float: 'right', width: 72, height: 72, borderRadius: 4, objectFit: 'cover', marginLeft: 12 }} onError={e => (e.currentTarget.style.display='none')} />}
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

// ── Topic card (RaidBoss style) ───────────────────────────────────────────────
function TopicCard({ topic, onEdit, onDelete, onTogglePublish, onHistory, isExpanded, onToggleExpand }: {
  topic: InfoTopic;
  onEdit: () => void; onDelete: () => void; onTogglePublish: () => void;
  onHistory: () => void; isExpanded: boolean; onToggleExpand: () => void;
}) {
  const hex = topic.embed_color || '#5865F2';
  return (
    <div style={{ background: 'var(--surface)', border: `1px solid ${isExpanded ? 'rgba(129,140,248,0.35)' : 'var(--border)'}`, borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.15s' }}>
      {/* Card header — always visible */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', cursor: 'pointer', background: isExpanded ? 'var(--primary-subtle)' : 'var(--elevated)', transition: 'background 0.15s' }}
        onClick={onToggleExpand}
        onMouseEnter={e => { if (!isExpanded)(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
        onMouseLeave={e => { if (!isExpanded)(e.currentTarget as HTMLElement).style.background = 'var(--elevated)'; }}
      >
        <div style={{ width: 4, height: 32, borderRadius: 2, background: hex, flexShrink: 0 }} />
        <span style={{ fontSize: 18, flexShrink: 0 }}>{topic.emoji || '📄'}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{topic.name}</span>
            {!topic.is_published && (
              <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(250,168,26,0.15)', color: '#faa81a', padding: '1px 6px', borderRadius: 4, letterSpacing: '0.04em' }}>DRAFT</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 1, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span className="mono">/info {topic.topic_id}</span>
            {topic.subcategory && <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Tag size={9} />{topic.section} › {topic.subcategory}</span>}
            {topic.views > 0 && <span>👁 {topic.views} views</span>}
            <span style={{ color: 'var(--text-faint)' }}>Updated {ago(topic.updated_at)}</span>
          </div>
        </div>
        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} onClick={onTogglePublish} title={topic.is_published ? 'Unpublish' : 'Publish'}>
            {topic.is_published ? <Eye size={11} /> : <EyeOff size={11} style={{ color: '#faa81a' }} />}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} onClick={onHistory} title="History"><History size={11} /></button>
          <button className="btn btn-ghost btn-sm" style={{ padding: '4px 7px' }} onClick={onEdit} title="Edit"><Pencil size={11} /></button>
          <button className="btn btn-danger btn-sm" style={{ padding: '4px 7px' }} onClick={onDelete} title="Delete"><Trash2 size={11} /></button>
        </div>
        {isExpanded ? <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronRight size={13} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border)' }}>
          <EmbedPreview topic={topic} />
          {topic.footer && <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-faint)' }}>Footer: {topic.footer}</div>}
        </div>
      )}
    </div>
  );
}

// ── Section group ─────────────────────────────────────────────────────────────
function SectionGroup({ section, subcats, emojiMap, expandedIds, onToggleExpand, onEdit, onDelete, onTogglePublish, onHistory, onEditSection, onEditSub }: {
  section: string; subcats: Record<string, InfoTopic[]>;
  emojiMap: Map<string,string>; expandedIds: Set<number>;
  onToggleExpand: (id: number) => void;
  onEdit: (t: InfoTopic) => void; onDelete: (t: InfoTopic) => void;
  onTogglePublish: (t: InfoTopic) => void; onHistory: (t: InfoTopic) => void;
  onEditSection: (s: string) => void; onEditSub: (sec: string, sub: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const catEmoji = emojiMap.get(section);
  const total = Object.values(subcats).flat().length;

  return (
    <div style={{ marginBottom: 8 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px', marginBottom: 6 }}>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, flex: 1, color: 'var(--text)' }}>
          {open ? <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={13} style={{ color: 'var(--text-muted)' }} />}
          {catEmoji && <span style={{ fontSize: 15 }}>{catEmoji}</span>}
          <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize', letterSpacing: '0.02em' }}>{section}</span>
          <span style={{ background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 8, padding: '0 6px', fontSize: 10, fontWeight: 700 }}>{total}</span>
        </button>
        <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => onEditSection(section)}>
          <FolderEdit size={10} /> Edit Section
        </button>
      </div>

      {open && Object.entries(subcats).map(([sub, items]) => (
        <div key={sub} style={{ marginBottom: 10 }}>
          {/* Subcategory label */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', marginBottom: 5, marginLeft: 18 }}>
            {emojiMap.get(`${section}::${sub}`) && <span style={{ fontSize: 12 }}>{emojiMap.get(`${section}::${sub}`)}</span>}
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{sub}</span>
            <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>({items.length})</span>
            <button className="btn btn-ghost btn-sm" style={{ padding: '1px 6px', fontSize: 10 }} onClick={() => onEditSub(section, sub)}>
              <Pencil size={8} /> Edit
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginLeft: 18 }}>
            {items.map(t => (
              <TopicCard key={t.id} topic={t}
                isExpanded={expandedIds.has(t.id)}
                onToggleExpand={() => onToggleExpand(t.id)}
                onEdit={() => onEdit(t)} onDelete={() => onDelete(t)}
                onTogglePublish={() => onTogglePublish(t)} onHistory={() => onHistory(t)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '60px 20px', textAlign: 'center' }}>
      <BookOpen size={40} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 14px', opacity: 0.5 }} />
      <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 18 }}>No info topics yet.</div>
      <button className="btn btn-primary" onClick={onAdd}><Plus size={14} /> Create First Topic</button>
    </div>
  );
}

const EMPTY: Partial<InfoTopic> = {
  section: 'general', subcategory: 'General', topic_id: '', name: '',
  embed_title: '', embed_description: '', embed_color: '#5865F2', emoji: '📄',
  image: '', thumbnail: '', footer: '', category_emoji_id: '', is_published: true,
};
type ModalType = 'create' | 'edit' | 'section' | 'subcategory' | 'history' | 'import' | null;
type SearchFilter = 'all' | 'published' | 'draft';

export default function InfoTopicsPage({ guildId }: Props) {
  const [topics, setTopics]       = useState<InfoTopic[]>([]);
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<'topics' | 'audit'>('topics');
  const [modal, setModal]         = useState<ModalType>(null);
  const [form, setForm]           = useState<Partial<InfoTopic>>(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [statusFilter, setFilter] = useState<SearchFilter>('all');
  const [expandedIds, setExpanded]= useState<Set<number>>(new Set());

  // Section/sub edit state
  const [sectionTarget, setSectionTarget] = useState('');
  const [sectionName, setSectionName]     = useState('');
  const [sectionEmoji, setSectionEmoji]   = useState('');
  const [subcatTarget, setSubcatTarget]   = useState<{section:string;name:string}>({section:'',name:''});
  const [subcatName, setSubcatName]       = useState('');
  const [subcatEmoji, setSubcatEmoji]     = useState('');

  // History
  const [history, setHistory]     = useState<TopicHistoryEntry[]>([]);
  const [historyFor, setHistoryFor] = useState<InfoTopic | null>(null);
  const [histLoading, setHistLoad]= useState(false);

  // Audit
  const [audit, setAudit]         = useState<InfoAuditEntry[]>([]);
  const [auditLoading, setAuditLoad] = useState(false);

  // Import
  const [importJson, setImportJson]     = useState('');
  const [importMode, setImportMode]     = useState<'merge'|'replace'>('merge');
  const [importResult, setImportResult] = useState<{imported:number;skipped:number}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getInfoTopics(guildId).then(t => setTopics(t)).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); setExpanded(new Set()); }, [guildId]);

  const loadAudit = () => {
    setAuditLoad(true);
    getInfoAuditLog(guildId).then(setAudit).catch(() => {}).finally(() => setAuditLoad(false));
  };
  useEffect(() => { if (tab === 'audit') loadAudit(); }, [tab, guildId]);

  const emojiMap = useMemo(() => {
    const m = new Map<string,string>();
    for (const t of topics) {
      if (t.category_emoji_id && !m.has(t.section)) m.set(t.section, t.category_emoji_id);
      const k = `${t.section}::${t.subcategory}`;
      if (t.subcategory_emoji && !m.has(k)) m.set(k, t.subcategory_emoji);
    }
    return m;
  }, [topics]);

  const filtered = useMemo(() => {
    let list = topics;
    if (statusFilter === 'published') list = list.filter(t => t.is_published);
    if (statusFilter === 'draft')     list = list.filter(t => !t.is_published);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || t.topic_id?.toLowerCase().includes(q) || t.embed_description?.toLowerCase().includes(q));
    }
    return list;
  }, [topics, statusFilter, search]);

  const grouped = useMemo(() => filtered.reduce<Record<string,Record<string,InfoTopic[]>>>((acc, t) => {
    const sec = t.section || 'general', sub = t.subcategory || 'General';
    if (!acc[sec]) acc[sec] = {};
    if (!acc[sec][sub]) acc[sec][sub] = [];
    acc[sec][sub].push(t);
    return acc;
  }, {}), [filtered]);

  const pubCount   = topics.filter(t => t.is_published).length;
  const draftCount = topics.filter(t => !t.is_published).length;

  // ── Actions ──
  const openCreate  = () => { setForm({ ...EMPTY }); setModal('create'); setError(''); };
  const openEdit    = (t: InfoTopic) => { setForm({ ...t }); setModal('edit'); setError(''); };
  const openEditSec = (s: string) => { setSectionTarget(s); setSectionName(s); setSectionEmoji(emojiMap.get(s) || ''); setModal('section'); setError(''); };
  const openEditSub = (sec: string, sub: string) => { setSubcatTarget({ section: sec, name: sub }); setSubcatName(sub); setSubcatEmoji(emojiMap.get(`${sec}::${sub}`) || ''); setModal('subcategory'); setError(''); };
  const openHistory = async (t: InfoTopic) => {
    setHistoryFor(t); setModal('history'); setHistLoad(true);
    try { setHistory(await getTopicHistory(t.id)); } catch { setHistory([]); } finally { setHistLoad(false); }
  };
  const toggleExpand = (id: number) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const submitTopic = async () => {
    if (!form.name?.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'create') await createInfoTopic(guildId, form);
      else if (modal === 'edit' && form.id) await updateInfoTopic(form.id, form);
      setModal(null); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const submitSection = async () => {
    if (!sectionName.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true); setError('');
    try {
      await updateInfoSection(guildId, sectionTarget, sectionName.trim().toLowerCase().replace(/\s+/g, '_'), sectionEmoji.trim() || undefined);
      setModal(null); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const submitSub = async () => {
    if (!subcatName.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true); setError('');
    try {
      await updateInfoSubcategory(guildId, subcatTarget.section, subcatTarget.name, subcatName.trim(), subcatEmoji.trim() || undefined);
      setModal(null); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };
  const del = async (t: InfoTopic) => {
    if (!confirm(`Delete "${t.name}"?`)) return;
    try { await deleteInfoTopic(t.id); setTopics(p => p.filter(x => x.id !== t.id)); }
    catch(e) { setError((e as Error).message); }
  };
  const togglePublish = async (t: InfoTopic) => {
    const next = !t.is_published;
    setTopics(p => p.map(x => x.id === t.id ? { ...x, is_published: next } : x));
    await setTopicPublished(t.id, next).catch(() => load());
  };
  const doRestore = async (entry: TopicHistoryEntry) => {
    if (!historyFor || !confirm('Restore this version?')) return;
    await restoreTopicVersion(entry.id, historyFor.id);
    setModal(null); load();
  };
  const doExport = async () => {
    const data = await exportInfoTopics(guildId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `info_topics_${guildId}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); URL.revokeObjectURL(url);
  };
  const doImport = async () => {
    setSaving(true); setImportResult(null);
    try {
      const parsed = JSON.parse(importJson);
      const ts = parsed.topics ?? (Array.isArray(parsed) ? parsed : []);
      const r = await importInfoTopics(guildId, ts, importMode);
      setImportResult(r); load();
    } catch(e) { setError((e as Error).message); } finally { setSaving(false); }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade" style={{ maxWidth: 860 }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 3 }}>
          {(['topics', 'audit'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, background: tab === t ? 'var(--primary-subtle)' : 'var(--elevated)', color: tab === t ? '#818cf8' : 'var(--text-muted)', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
              {t === 'topics' ? <><BookOpen size={11} /> Topics</> : <><ClipboardList size={11} /> Audit</>}
            </button>
          ))}
        </div>

        {tab === 'topics' && <>
          <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 130 }}>
            <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)', pointerEvents: 'none' }} />
            <input className="inp" style={{ paddingLeft: 26, fontSize: 12, height: 30 }} placeholder="Search topics…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 0 }}><X size={11} /></button>}
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            {([['all', 'All'], ['published', 'Live'], ['draft', 'Draft']] as [SearchFilter, string][]).map(([v, l]) => (
              <button key={v} onClick={() => setFilter(v)} style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${statusFilter === v ? '#818cf8' : 'var(--border)'}`, background: statusFilter === v ? 'var(--primary-subtle)' : 'var(--elevated)', color: statusFilter === v ? '#818cf8' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontWeight: statusFilter === v ? 700 : 400 }}>{l}</button>
            ))}
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
            {pubCount} live{draftCount > 0 && <span style={{ color: '#faa81a' }}> · {draftCount} draft</span>}
          </span>
        </>}

        <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
          {tab === 'topics' && <>
            <button className="btn btn-ghost btn-sm" onClick={doExport} title="Export JSON"><Download size={12} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => { setImportJson(''); setImportResult(null); setModal('import'); }} title="Import JSON"><Upload size={12} /></button>
          </>}
          <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 14px' }} onClick={openCreate}><Plus size={12} /> New Topic</button>
        </div>
      </div>

      {error && !modal && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '10px 14px', color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {/* ── AUDIT TAB ── */}
      {tab === 'audit' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Edit History</span>
            <button className="btn btn-ghost btn-sm" onClick={loadAudit}>Refresh</button>
          </div>
          {auditLoading ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
            : audit.length === 0 ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No audit events yet.</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: 'var(--elevated)', borderBottom: '1px solid var(--border)' }}>
                  {['Action', 'Topic', 'By', 'When'].map(h => <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>)}
                </tr></thead>
                <tbody>{audit.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 14px' }}><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: a.action === 'create' ? 'rgba(59,165,93,0.15)' : a.action === 'delete' ? 'rgba(237,66,69,0.15)' : a.action === 'publish' ? 'rgba(88,101,242,0.15)' : 'rgba(255,255,255,0.07)', color: a.action === 'create' ? '#3ba55d' : a.action === 'delete' ? '#ed4245' : a.action === 'publish' ? '#818cf8' : 'var(--text-muted)' }}>{a.action}</span></td>
                    <td style={{ padding: '8px 14px', fontSize: 13 }}>{a.topic_name || '—'} {a.topic_id && <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>({a.topic_id})</span>}</td>
                    <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-muted)' }}>{a.changed_by}</td>
                    <td style={{ padding: '8px 14px', fontSize: 12, color: 'var(--text-faint)' }}>{ago(a.created_at)}</td>
                  </tr>
                ))}</tbody>
              </table>}
        </div>
      )}

      {/* ── TOPICS TAB ── */}
      {tab === 'topics' && (
        filtered.length === 0 ? (
          search || statusFilter !== 'all'
            ? <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No topics match your filter.</div>
            : <EmptyState onAdd={openCreate} />
        ) : (
          <div>
            {Object.entries(grouped).map(([section, subcats]) => (
              <SectionGroup key={section} section={section} subcats={subcats}
                emojiMap={emojiMap} expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                onEdit={openEdit} onDelete={del}
                onTogglePublish={togglePublish} onHistory={openHistory}
                onEditSection={openEditSec} onEditSub={openEditSub} />
            ))}
          </div>
        )
      )}

      {/* ── MODALS ── */}

      {/* Create / Edit topic */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? '➕ New Info Topic' : '✏️ Edit Topic'} onClose={() => setModal(null)} width={680}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <F label="Name *"><input className="inp" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Display name" /></F>
            <F label="Topic ID *" hint="used in /info command"><input className="inp" value={form.topic_id || ''} onChange={e => setForm(p => ({ ...p, topic_id: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') }))} placeholder="e.g. how_to_join" style={{ fontFamily: 'var(--font-mono)' }} /></F>
            <F label="Section"><input className="inp" value={form.section || ''} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} placeholder="e.g. general" /></F>
            <F label="Subcategory"><input className="inp" value={form.subcategory || ''} onChange={e => setForm(p => ({ ...p, subcategory: e.target.value }))} placeholder="e.g. Getting Started" /></F>
            <F label="Embed Color"><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="color" value={form.embed_color || '#5865F2'} onChange={e => setForm(p => ({ ...p, embed_color: e.target.value }))} style={{ width: 40, height: 32, borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', padding: 2 }} /><input className="inp" value={form.embed_color || ''} onChange={e => setForm(p => ({ ...p, embed_color: e.target.value }))} style={{ fontFamily: 'var(--font-mono)' }} /></div></F>
            <F label="Emoji"><input className="inp" value={form.emoji || ''} onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))} placeholder="📄" style={{ fontSize: 20 }} /></F>
          </div>
          <F label="Embed Title"><input className="inp" value={form.embed_title || ''} onChange={e => setForm(p => ({ ...p, embed_title: e.target.value }))} placeholder="Title shown in Discord embed" /></F>
          <F label="Embed Description" hint={`${(form.embed_description?.length ?? 0)}/4000 chars · supports markdown`}>
            <textarea className="inp" rows={6} value={form.embed_description || ''} onChange={e => setForm(p => ({ ...p, embed_description: e.target.value }))} placeholder="Main content of the embed. Supports **bold**, _italic_, [links](url)" style={{ resize: 'vertical', lineHeight: 1.5 }} />
          </F>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <F label="Image URL" hint="big image at bottom"><input className="inp" value={form.image || ''} onChange={e => setForm(p => ({ ...p, image: e.target.value }))} placeholder="https://…" /></F>
            <F label="Thumbnail URL" hint="small top-right"><input className="inp" value={form.thumbnail || ''} onChange={e => setForm(p => ({ ...p, thumbnail: e.target.value }))} placeholder="https://…" /></F>
          </div>
          <F label="Footer"><input className="inp" value={form.footer || ''} onChange={e => setForm(p => ({ ...p, footer: e.target.value }))} placeholder="Footer text" /></F>

          <div style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, margin: '12px 0' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preview</div>
            <EmbedPreview topic={form} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" className="toggle" checked={form.is_published ?? true} onChange={e => setForm(p => ({ ...p, is_published: e.target.checked }))} />
              Published (visible to users)
            </label>
            {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submitTopic} disabled={saving}>{saving ? 'Saving…' : modal === 'create' ? 'Create Topic' : 'Save Changes'}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit section */}
      {modal === 'section' && (
        <Modal title="✏️ Edit Section" onClose={() => setModal(null)} width={400}>
          <F label="Section Name"><input className="inp" value={sectionName} onChange={e => setSectionName(e.target.value)} /></F>
          <F label="Category Emoji / Icon"><EmojiPicker value={sectionEmoji} onChange={setSectionEmoji} /></F>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitSection} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* Edit subcategory */}
      {modal === 'subcategory' && (
        <Modal title="✏️ Edit Subcategory" onClose={() => setModal(null)} width={400}>
          <F label="Subcategory Name"><input className="inp" value={subcatName} onChange={e => setSubcatName(e.target.value)} /></F>
          <F label="Emoji"><EmojiPicker value={subcatEmoji} onChange={setSubcatEmoji} /></F>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitSub} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </Modal>
      )}

      {/* History */}
      {modal === 'history' && historyFor && (
        <Modal title={`📜 History: ${historyFor.name}`} onClose={() => setModal(null)} width={580}>
          {histLoading ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
            : history.length === 0 ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No history yet.</div>
            : history.map(h => (
              <div key={h.id} style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{ago(h.created_at)} by {h.changed_by}</span>
                  <button className="btn btn-ghost btn-sm" onClick={() => doRestore(h)}><RotateCcw size={10} /> Restore</button>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginBottom: 3 }}>{h.snapshot?.embed_title || '(no title)'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'hidden' }}>{h.snapshot?.embed_description || ''}</div>
              </div>
            ))}
        </Modal>
      )}

      {/* Import */}
      {modal === 'import' && (
        <Modal title="⬆️ Import Topics" onClose={() => setModal(null)} width={520}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            {(['merge', 'replace'] as const).map(m => (
              <button key={m} onClick={() => setImportMode(m)} style={{ flex: 1, padding: '8px', borderRadius: 7, border: `1px solid ${importMode === m ? '#818cf8' : 'var(--border)'}`, background: importMode === m ? 'var(--primary-subtle)' : 'var(--elevated)', color: importMode === m ? '#818cf8' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit' }}>
                {m === 'merge' ? '🔀 Merge (add missing)' : '♻️ Replace (clear all)'}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>📁 Choose file</button>
            <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={e => { const f = e.target.files?.[0]; if (!f) return; new FileReader().onload = ev => setImportJson(ev.target?.result as string ?? ''); }} />
            <span style={{ fontSize: 12, color: 'var(--text-faint)', alignSelf: 'center' }}>or paste JSON below</span>
          </div>
          <textarea className="inp" rows={8} value={importJson} onChange={e => setImportJson(e.target.value)} placeholder='{"topics": [...]}' style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }} />
          {importResult && <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(59,165,93,0.1)', border: '1px solid rgba(59,165,93,0.3)', borderRadius: 7, fontSize: 12, color: '#3ba55d' }}>✓ Imported {importResult.imported}, skipped {importResult.skipped}</div>}
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={doImport} disabled={saving || !importJson.trim()}>{saving ? 'Importing…' : 'Import'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

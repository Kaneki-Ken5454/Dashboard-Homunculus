import { useEffect, useState, useMemo } from 'react';
import { BookOpen, Trash2, ChevronDown, ChevronRight, Plus, Pencil, FolderEdit, Tag } from 'lucide-react';
import {
  getInfoTopics, createInfoTopic, updateInfoTopic, deleteInfoTopic,
  updateInfoSection, updateInfoSubcategory, type InfoTopic,
} from '../lib/db';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

interface Props { guildId: string; }

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>
        {label}
        {hint && <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text-faint)' }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

const EMPTY: Partial<InfoTopic> = {
  section: 'general', subcategory: 'General', topic_id: '', name: '',
  embed_title: '', embed_description: '', embed_color: '#5865F2', emoji: '📄',
  image: '', thumbnail: '', category_emoji_id: '',
};

const EMOJI_PICKS = [
  '📁','📂','📋','📌','📍','🔖','🏷️','🗂️','📑','📎',
  '🎯','⚡','🔥','✨','💫','🌟','⭐','🎖️','🏆','🎗️',
  '🔧','⚙️','🛠️','🔨','💡','🔍','📡','🖥️','📢','💬',
  '👥','👤','🤝','🎮','🎲','📊','📈','💰','🎁','🎨',
  '🔒','🔓','🛡️','⚠️','❓','ℹ️','🚨','🎵','🌐','🏠',
];

type ModalType = 'create' | 'edit' | 'section' | 'subcategory' | null;

function EmojiPicker({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ width: 42, height: 42, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
          {value ? value : <span style={{ color: 'var(--text-faint)', fontSize: 16 }}>—</span>}
        </div>
        <input
          className="inp"
          placeholder={placeholder || 'Type or paste an emoji'}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ fontSize: 18, flex: 1 }}
        />
        {value && (
          <button onClick={() => onChange('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', fontSize: 18, padding: '0 4px', flexShrink: 0 }} title="Clear">✕</button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {EMOJI_PICKS.map(e => (
          <button
            key={e}
            onClick={() => onChange(e)}
            style={{
              width: 32, height: 32,
              background: value === e ? 'var(--primary-subtle)' : 'var(--elevated)',
              border: `1px solid ${value === e ? '#818cf8' : 'var(--border)'}`,
              borderRadius: 6, cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >{e}</button>
        ))}
      </div>
    </div>
  );
}

export default function InfoTopicsPage({ guildId }: Props) {
  const [topics, setTopics]       = useState<InfoTopic[]>([]);
  const [loading, setLoading]     = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [modal, setModal]         = useState<ModalType>(null);
  const [form, setForm]           = useState<Partial<InfoTopic>>(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  // Section edit state
  const [sectionTarget, setSectionTarget] = useState('');
  const [sectionName, setSectionName]     = useState('');
  const [sectionEmoji, setSectionEmoji]   = useState('');

  // Subcategory edit state
  const [subcatTarget, setSubcatTarget] = useState<{ section: string; name: string }>({ section: '', name: '' });
  const [subcatName, setSubcatName]     = useState('');
  const [subcatEmoji, setSubcatEmoji]   = useState('');

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getInfoTopics(guildId).then(setTopics).catch(e => setError(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, [guildId]);

  function openCreate() { setForm({ ...EMPTY }); setModal('create'); setError(''); }
  function openEdit(t: InfoTopic) { setForm({ ...t }); setModal('edit'); setError(''); }

  function openEditSection(section: string) {
    const anyTopic = topics.find(t => t.section === section);
    setSectionTarget(section);
    setSectionName(section);
    setSectionEmoji(anyTopic?.category_emoji_id || '');
    setModal('section');
    setError('');
  }

  function openEditSubcategory(section: string, sub: string) {
    const anyTopic = topics.find(t => t.section === section && t.subcategory === sub);
    setSubcatTarget({ section, name: sub });
    setSubcatName(sub);
    setSubcatEmoji(anyTopic?.subcategory_emoji || '');
    setModal('subcategory');
    setError('');
  }

  async function submitTopic() {
    if (!form.name?.trim()) { setError('Name is required.'); return; }
    setSaving(true); setError('');
    try {
      if (modal === 'create') await createInfoTopic(guildId, form);
      else if (modal === 'edit' && form.id) await updateInfoTopic(form.id, form);
      setModal(null); load();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  async function submitEditSection() {
    if (!sectionName.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true); setError('');
    try {
      const newSection = sectionName.trim().toLowerCase().replace(/\s+/g, '_');
      await updateInfoSection(guildId, sectionTarget, newSection, sectionEmoji.trim() || undefined);
      setModal(null); load();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  async function submitEditSubcategory() {
    if (!subcatName.trim()) { setError('Name cannot be empty.'); return; }
    setSaving(true); setError('');
    try {
      await updateInfoSubcategory(guildId, subcatTarget.section, subcatTarget.name, subcatName.trim(), subcatEmoji.trim() || undefined);
      setModal(null); load();
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!confirm('Delete this topic?')) return;
    try { await deleteInfoTopic(id); setTopics(p => p.filter(t => t.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }

  function toggleSection(s: string) {
    setCollapsed(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });
  }

  const grouped = useMemo(() => topics.reduce<Record<string, InfoTopic[]>>((acc, t) => {
    if (!acc[t.section]) acc[t.section] = [];
    acc[t.section].push(t);
    return acc;
  }, {}), [topics]);

  // Build emoji lookup: section → category_emoji_id, "section::sub" → subcategory_emoji
  const emojiMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of topics) {
      if (t.category_emoji_id && !m.has(t.section)) m.set(t.section, t.category_emoji_id);
      const k = `${t.section}::${t.subcategory}`;
      if (t.subcategory_emoji && !m.has(k)) m.set(k, t.subcategory_emoji);
    }
    return m;
  }, [topics]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade">
      {error && !modal && (
        <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{topics.length} topics across {Object.keys(grouped).length} sections</div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> New Topic</button>
      </div>

      {topics.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '60px 20px', textAlign: 'center' }}>
          <BookOpen size={32} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>No info topics yet</div>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> Create First Topic</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(grouped).map(([section, items]) => {
            const open = !collapsed.has(section);
            const subcats = [...new Set(items.map(i => i.subcategory).filter(Boolean))] as string[];
            const catEmoji = emojiMap.get(section);
            return (
              <div key={section} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                {/* Section header */}
                <div style={{ display: 'flex', alignItems: 'center', padding: '13px 18px', borderBottom: open ? '1px solid var(--border)' : 'none', gap: 8 }}>
                  <button onClick={() => toggleSection(section)} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'Lexend, sans-serif', fontSize: 14, fontWeight: 600, flex: '0 0 auto', padding: 0 }}>
                    {open ? <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />}
                    {catEmoji && <span style={{ fontSize: 17 }}>{catEmoji}</span>}
                    <span style={{ textTransform: 'capitalize' }}>{section}</span>
                    <span style={{ background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{items.length}</span>
                  </button>

                  {/* Subcategory chips — click to edit */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1 }}>
                    {subcats.map(sub => {
                      const subEmoji = emojiMap.get(`${section}::${sub}`);
                      return (
                        <button
                          key={sub}
                          onClick={() => openEditSubcategory(section, sub)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '2px 8px 2px 6px', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}
                          title={`Edit "${sub}" subcategory`}
                        >
                          {subEmoji ? <span style={{ fontSize: 13 }}>{subEmoji}</span> : <Tag size={9} />}
                          {sub}
                          <Pencil size={8} style={{ marginLeft: 2, opacity: 0.5 }} />
                        </button>
                      );
                    })}
                  </div>

                  <button onClick={() => openEditSection(section)} className="btn btn-ghost btn-sm" title="Edit section name and emoji">
                    <FolderEdit size={13} /> Edit
                  </button>
                </div>

                {open && (
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--elevated)', borderBottom: '1px solid var(--border)' }}>
                        {['', 'Name', 'Topic ID', 'Subcategory', 'Title', ''].map((h, i) => (
                          <th key={i} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map(t => (
                        <tr key={t.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px', fontSize: 20, width: 40 }}>{t.emoji || '📄'}</td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t.name}</div>
                            {t.embed_description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.embed_description}</div>}
                          </td>
                          <td style={{ padding: '10px 14px' }}><span className="mono" style={{ fontSize: 12, color: '#818cf8' }}>{t.topic_id}</span></td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                              {t.subcategory_emoji && <span style={{ fontSize: 14 }}>{t.subcategory_emoji}</span>}
                              <Badge label={t.subcategory || 'General'} variant="muted" />
                            </div>
                          </td>
                          <td style={{ padding: '10px 14px', maxWidth: 200 }}><span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.embed_title || '—'}</span></td>
                          <td style={{ padding: '10px 14px' }}>
                            <div style={{ display: 'flex', gap: 5 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}><Pencil size={11} /></button>
                              <button className="btn btn-danger btn-sm" onClick={() => del(t.id)}><Trash2 size={11} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Topic Create / Edit Modal ── */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'New Info Topic' : 'Edit Topic'} onClose={() => setModal(null)} width="640px">
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <F label="Name *"><input className="inp" placeholder="e.g. How to verify" value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} /></F>
            <F label="Emoji"><input className="inp" style={{ fontSize: 18 }} placeholder="📄" value={form.emoji ?? ''} onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))} /></F>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Section"><input className="inp" placeholder="general" value={form.section ?? 'general'} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} /></F>
            <F label="Subcategory"><input className="inp" placeholder="General" value={form.subcategory ?? ''} onChange={e => setForm(p => ({ ...p, subcategory: e.target.value }))} /></F>
          </div>
          <F label="Topic ID" hint="auto-generated if blank"><input className="inp mono" placeholder="e.g. how_to_verify" value={form.topic_id ?? ''} onChange={e => setForm(p => ({ ...p, topic_id: e.target.value }))} /></F>
          <F label="Embed Title"><input className="inp" placeholder="Title shown in the Discord embed" value={form.embed_title ?? ''} onChange={e => setForm(p => ({ ...p, embed_title: e.target.value }))} /></F>
          <F label="Embed Description"><textarea className="inp" style={{ minHeight: 80, resize: 'vertical' }} placeholder="Content shown when a user runs /infoview" value={form.embed_description ?? ''} onChange={e => setForm(p => ({ ...p, embed_description: e.target.value }))} /></F>
          <F label="Embed Color">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={form.embed_color ?? '#5865F2'} onChange={e => setForm(p => ({ ...p, embed_color: e.target.value }))} style={{ width: 40, height: 40, border: 'none', borderRadius: 6, cursor: 'pointer', padding: 0 }} />
              <input className="inp mono" style={{ flex: 1 }} value={form.embed_color ?? '#5865F2'} onChange={e => setForm(p => ({ ...p, embed_color: e.target.value }))} />
            </div>
          </F>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Image URL"><input className="inp" placeholder="https://..." value={form.image ?? ''} onChange={e => setForm(p => ({ ...p, image: e.target.value }))} /></F>
            <F label="Thumbnail URL"><input className="inp" placeholder="https://..." value={form.thumbnail ?? ''} onChange={e => setForm(p => ({ ...p, thumbnail: e.target.value }))} /></F>
          </div>
          {error && <div style={{ color: 'var(--danger)', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitTopic} disabled={saving || !form.name?.trim()}>{saving ? 'Saving…' : modal === 'create' ? 'Create Topic' : 'Save Changes'}</button>
          </div>
        </Modal>
      )}

      {/* ── Edit Section Modal ── */}
      {modal === 'section' && (
        <Modal title="Edit Section" onClose={() => setModal(null)} width="480px">
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Changes apply to all <strong style={{ color: 'var(--text)' }}>{grouped[sectionTarget]?.length ?? 0} topics</strong> in this section.
          </div>

          <F label="Section Name">
            <input className="inp" autoFocus value={sectionName} onChange={e => setSectionName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitEditSection(); }} />
          </F>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: -8, marginBottom: 16 }}>Spaces → underscores, lowercase.</div>

          <div style={{ height: 1, background: 'var(--border)', marginBottom: 16 }} />

          <F label="Category Emoji" hint="shown next to the section name in the bot menu">
            <EmojiPicker value={sectionEmoji} onChange={setSectionEmoji} placeholder="Paste or type an emoji  e.g. 📁" />
          </F>
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 16 }}>
            You can also enter a Discord custom emoji ID (17-19 digit snowflake) for a server custom emoji.
          </div>

          {error && <div style={{ color: 'var(--danger)', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitEditSection} disabled={saving || !sectionName.trim()}>{saving ? 'Saving…' : 'Save Section'}</button>
          </div>
        </Modal>
      )}

      {/* ── Edit Subcategory Modal ── */}
      {modal === 'subcategory' && (
        <Modal title="Edit Subcategory" onClose={() => setModal(null)} width="480px">
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Editing <strong style={{ color: 'var(--text)' }}>{subcatTarget.name}</strong> in section <strong style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{subcatTarget.section}</strong>.
          </div>

          <F label="Subcategory Name">
            <input className="inp" autoFocus value={subcatName} onChange={e => setSubcatName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') submitEditSubcategory(); }} />
          </F>

          <div style={{ height: 1, background: 'var(--border)', marginBottom: 16, marginTop: 4 }} />

          <F label="Subcategory Emoji" hint="shown next to the subcategory name in the bot menu">
            <EmojiPicker value={subcatEmoji} onChange={setSubcatEmoji} placeholder="Paste or type an emoji  e.g. 🔧" />
          </F>

          {error && <div style={{ color: 'var(--danger)', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submitEditSubcategory} disabled={saving || !subcatName.trim()}>{saving ? 'Saving…' : 'Save Subcategory'}</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

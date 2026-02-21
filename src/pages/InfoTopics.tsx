import { useEffect, useState } from 'react';
import { BookOpen, Trash2, ChevronDown, ChevronRight, Plus, Pencil } from 'lucide-react';
import { getInfoTopics, createInfoTopic, updateInfoTopic, deleteInfoTopic, type InfoTopic } from '../lib/db';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

interface Props { guildId: string; }

const EMPTY: Partial<InfoTopic> = {
  section: 'common', subcategory: 'General', topic_id: '', name: '',
  embed_title: '', embed_description: '', embed_color: '#5865F2', emoji: '📄',
};

export default function InfoTopicsPage({ guildId }: Props) {
  const [topics, setTopics]     = useState<InfoTopic[]>([]);
  const [loading, setLoading]   = useState(true);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [modal, setModal]       = useState<'create' | 'edit' | null>(null);
  const [form, setForm]         = useState<Partial<InfoTopic>>(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getInfoTopics(guildId)
      .then(setTopics)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  function openCreate() { setForm({ ...EMPTY }); setModal('create'); setError(''); }
  function openEdit(t: InfoTopic) { setForm({ ...t }); setModal('edit'); setError(''); }

  async function submit() {
    setSaving(true); setError('');
    try {
      if (modal === 'create') await createInfoTopic(guildId, form);
      else if (modal === 'edit' && form.id) await updateInfoTopic(form.id, form);
      setModal(null); load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!confirm('Delete this topic?')) return;
    try { await deleteInfoTopic(id); setTopics(p => p.filter(t => t.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }

  function toggleSection(s: string) {
    setCollapsed(prev => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s); else n.add(s);
      return n;
    });
  }

  const grouped = topics.reduce<Record<string, InfoTopic[]>>((acc, t) => {
    if (!acc[t.section]) acc[t.section] = [];
    acc[t.section].push(t);
    return acc;
  }, {});

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 13 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade">
      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {topics.length} topics across {Object.keys(grouped).length} sections
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> New Topic</button>
      </div>

      {topics.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '60px 20px', textAlign: 'center' }}>
          <BookOpen size={32} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>No info topics for guild <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{guildId}</span></div>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> Create First Topic</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(grouped).map(([section, items]) => {
            const open = !collapsed.has(section);
            return (
              <div key={section} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <button onClick={() => toggleSection(section)} style={{
                  width: '100%', padding: '13px 18px', background: 'none', border: 'none',
                  color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                  fontFamily: 'Lexend, sans-serif', fontSize: 14, fontWeight: 600,
                }}>
                  {open
                    ? <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />
                    : <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />
                  }
                  <span style={{ textTransform: 'capitalize' }}>{section}</span>
                  <span style={{ background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 10, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{items.length}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontWeight: 400 }}>
                    {[...new Set(items.map(i => i.subcategory).filter(Boolean))].join(', ')}
                  </span>
                </button>

                {open && (
                  <div style={{ borderTop: '1px solid var(--border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: 'var(--elevated)', borderBottom: '1px solid var(--border)' }}>
                          {['', 'Name', 'Topic ID', 'Subcategory', 'Title', 'Views', ''].map((h, i) => (
                            <th key={i} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(t => (
                          <tr key={t.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 14px', fontSize: 20, width: 40 }}>
                              {t.emoji || '📄'}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{t.name}</div>
                              {t.embed_description && (
                                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {t.embed_description}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span className="mono" style={{ fontSize: 12, color: '#818cf8' }}>{t.topic_id}</span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <Badge label={t.subcategory || 'General'} variant="muted" />
                            </td>
                            <td style={{ padding: '10px 14px', maxWidth: 200 }}>
                              <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {t.embed_title || '—'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.views}</span>
                            </td>
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? 'New Info Topic' : 'Edit Topic'} onClose={() => setModal(null)} width="max-w-xl">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Name *">
              <input className="inp" placeholder="e.g. How to verify" value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </F>
            <F label="Emoji">
              <input className="inp" placeholder="📄" value={form.emoji ?? ''} onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))} />
            </F>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Section">
              <input className="inp" placeholder="common" value={form.section ?? 'common'} onChange={e => setForm(p => ({ ...p, section: e.target.value }))} />
            </F>
            <F label="Subcategory">
              <input className="inp" placeholder="General" value={form.subcategory ?? ''} onChange={e => setForm(p => ({ ...p, subcategory: e.target.value }))} />
            </F>
          </div>
          <F label="Topic ID (auto-generated if blank)">
            <input className="inp mono" placeholder="e.g. how_to_verify" value={form.topic_id ?? ''} onChange={e => setForm(p => ({ ...p, topic_id: e.target.value }))} />
          </F>
          <F label="Embed Title">
            <input className="inp" placeholder="Displayed as embed title" value={form.embed_title ?? ''} onChange={e => setForm(p => ({ ...p, embed_title: e.target.value }))} />
          </F>
          <F label="Embed Description">
            <textarea className="inp" style={{ minHeight: 80 }} placeholder="Main content shown in embed" value={form.embed_description ?? ''} onChange={e => setForm(p => ({ ...p, embed_description: e.target.value }))} />
          </F>
          <F label="Embed Color">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="color" value={form.embed_color ?? '#5865F2'} onChange={e => setForm(p => ({ ...p, embed_color: e.target.value }))}
                style={{ width: 36, height: 36, border: 'none', borderRadius: 6, background: 'none', cursor: 'pointer', padding: 0 }} />
              <input className="inp mono" style={{ flex: 1 }} value={form.embed_color ?? '#5865F2'} onChange={e => setForm(p => ({ ...p, embed_color: e.target.value }))} />
            </div>
          </F>

          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !form.name?.trim()}>
              {saving ? 'Saving…' : modal === 'create' ? 'Create Topic' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

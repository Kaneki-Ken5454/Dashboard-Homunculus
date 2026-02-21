import { useEffect, useState } from 'react';
import { Plus, Trash2, Pencil, Code, Hash, Eye } from 'lucide-react';
import { getEmbeds, createEmbed, updateEmbed, deleteEmbed, type Embed } from '../lib/db';
import Modal from '../components/Modal';

interface Props { guildId: string; }

interface EmbedFormData {
  name: string;
  title: string;
  description: string;
  color: string;
  footer: string;
  channel_id: string;
  fields: { name: string; value: string; inline: boolean }[];
}

const EMPTY_FORM: EmbedFormData = {
  name: '', title: '', description: '', color: '#5865F2', footer: '', channel_id: '',
  fields: [],
};

function formToEmbedData(f: EmbedFormData): Record<string, unknown> {
  return {
    title: f.title, description: f.description, color: f.color,
    footer: f.footer || undefined,
    channel_id: f.channel_id || undefined,
    fields: f.fields.length > 0 ? f.fields : undefined,
  };
}

function embedDataToForm(name: string, data: Record<string, unknown>): EmbedFormData {
  const fields = Array.isArray(data.fields) ? data.fields.map((f: Record<string, unknown>) => ({
    name: String(f.name ?? ''), value: String(f.value ?? ''), inline: Boolean(f.inline),
  })) : [];
  return {
    name,
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    color: String(data.color ?? '#5865F2'),
    footer: String(data.footer ?? ''),
    channel_id: String(data.channel_id ?? ''),
    fields,
  };
}

function hexToDecimal(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

export default function Embeds({ guildId }: Props) {
  const [embeds, setEmbeds] = useState<Embed[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<EmbedFormData>(EMPTY_FORM);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getEmbeds(guildId)
      .then(setEmbeds)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  function openCreate() {
    setForm({ ...EMPTY_FORM }); setEditId(null); setModal('create'); setError('');
  }

  function openEdit(emb: Embed) {
    const data = typeof emb.embed_data === 'string' ? JSON.parse(emb.embed_data as unknown as string) : emb.embed_data;
    setForm(embedDataToForm(emb.name, data));
    setEditId(emb.id); setModal('edit'); setError('');
  }

  async function submit() {
    if (!form.name.trim() || !form.title.trim()) return;
    setSaving(true); setError('');
    try {
      const embedData = formToEmbedData(form);
      if (modal === 'create') {
        await createEmbed({ guild_id: guildId, name: form.name.trim(), embed_data: embedData });
      } else if (modal === 'edit' && editId !== null) {
        await updateEmbed(editId, { name: form.name.trim(), embed_data: embedData });
      }
      setModal(null); load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!confirm('Delete this embed?')) return;
    try { await deleteEmbed(id); setEmbeds(p => p.filter(e => e.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }

  function addField() {
    setForm(p => ({ ...p, fields: [...p.fields, { name: '', value: '', inline: false }] }));
  }

  function removeField(idx: number) {
    setForm(p => ({ ...p, fields: p.fields.filter((_, i) => i !== idx) }));
  }

  function updateField(idx: number, key: string, val: unknown) {
    setForm(p => ({
      ...p,
      fields: p.fields.map((f, i) => i === idx ? { ...f, [key]: val } : f),
    }));
  }

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 13 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 100 }} />)}
    </div>
  );

  return (
    <div className="animate-fade">
      <p className="page-description">Create and manage Discord embed messages. Embeds can be targeted to specific channels for organized communication.</p>

      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{embeds.length} embed{embeds.length !== 1 ? 's' : ''} configured</div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> New Embed</button>
      </div>

      {embeds.length === 0 ? (
        <div className="empty-state">
          <Code size={32} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>No embeds configured yet</div>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> Create First Embed</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 14 }}>
          {embeds.map(emb => {
            const data = typeof emb.embed_data === 'string' ? JSON.parse(emb.embed_data as unknown as string) : (emb.embed_data ?? {});
            const color = String(data.color || '#5865F2');
            return (
              <div key={emb.id} style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                borderLeft: `4px solid ${color}`, overflow: 'hidden',
                transition: 'border-color 0.2s, transform 0.2s',
              }}>
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{emb.name}</span>
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(emb)}><Pencil size={11} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(emb.id)}><Trash2 size={11} /></button>
                    </div>
                  </div>
                  {data.title && <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{String(data.title)}</div>}
                  {data.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const }}>
                      {String(data.description)}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    {data.channel_id && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--info)', background: 'var(--info-subtle)', padding: '2px 8px', borderRadius: 12 }}>
                        <Hash size={10} />
                        <span className="mono" style={{ fontSize: 10 }}>{String(data.channel_id)}</span>
                      </span>
                    )}
                    {data.footer && (
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{String(data.footer)}</span>
                    )}
                  </div>
                  {Array.isArray(data.fields) && data.fields.length > 0 && (
                    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-faint)' }}>
                      {data.fields.length} field{data.fields.length !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div style={{ padding: '8px 18px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)' }}>
                  Updated {new Date(emb.updated_at).toLocaleDateString()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title={modal === 'create' ? 'New Embed' : 'Edit Embed'} onClose={() => setModal(null)} width="max-w-2xl">
          <div style={{ display: 'grid', gridTemplateColumns: preview ? '1fr 1fr' : '1fr', gap: 20 }}>
            {/* Form */}
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <F label="Embed Name *">
                  <input className="inp" placeholder="e.g. welcome-embed" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </F>
                <F label="Color">
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))}
                      style={{ width: 36, height: 36, border: 'none', borderRadius: 6, background: 'none', cursor: 'pointer', padding: 0 }} />
                    <input className="inp mono" style={{ flex: 1, fontSize: 12 }} value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} />
                  </div>
                </F>
              </div>
              <F label="Title *">
                <input className="inp" placeholder="Embed title" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              </F>
              <F label="Description">
                <textarea className="inp" style={{ minHeight: 80 }} placeholder="Embed description content..." value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
              </F>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <F label="Footer">
                  <input className="inp" placeholder="Footer text" value={form.footer} onChange={e => setForm(p => ({ ...p, footer: e.target.value }))} />
                </F>
                <F label="Channel ID">
                  <input className="inp mono" placeholder="Target channel ID" value={form.channel_id} onChange={e => setForm(p => ({ ...p, channel_id: e.target.value }))} />
                </F>
              </div>

              {/* Fields */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>Fields</span>
                  <button className="btn btn-ghost btn-sm" onClick={addField}><Plus size={11} /> Add Field</button>
                </div>
                {form.fields.map((field, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: 8, marginBottom: 8 }}>
                    <input className="inp" placeholder="Field name" value={field.name} onChange={e => updateField(idx, 'name', e.target.value)} style={{ fontSize: 12 }} />
                    <input className="inp" placeholder="Field value" value={field.value} onChange={e => updateField(idx, 'value', e.target.value)} style={{ fontSize: 12 }} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <input type="checkbox" checked={field.inline} onChange={e => updateField(idx, 'inline', e.target.checked)} style={{ accentColor: 'var(--primary)' }} /> Inline
                    </label>
                    <button className="btn btn-danger btn-sm" onClick={() => removeField(idx)}><Trash2 size={10} /></button>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            {preview && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 8 }}>Preview</div>
                <div style={{
                  background: 'var(--elevated)', borderLeft: `4px solid ${form.color}`,
                  borderRadius: 4, padding: '12px 16px',
                }}>
                  {form.title && <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>{form.title}</div>}
                  {form.description && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, whiteSpace: 'pre-wrap' }}>{form.description}</div>}
                  {form.fields.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                      {form.fields.map((f, i) => (
                        <div key={i}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{f.name || 'Field'}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{f.value || 'Value'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {form.footer && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)' }}>{form.footer}</div>
                  )}
                  {form.channel_id && (
                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--info)' }}>
                      <Hash size={10} /> Targeting channel <span className="mono">{form.channel_id}</span>
                    </div>
                  )}
                </div>
                <div style={{ marginTop: 8, padding: '8px 10px', background: 'var(--bg)', borderRadius: 6, fontSize: 11, color: 'var(--text-faint)' }}>
                  Color decimal: <span className="mono" style={{ color: 'var(--text-muted)' }}>{hexToDecimal(form.color)}</span>
                </div>
              </div>
            )}
          </div>

          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 14 }}>
            <button className="btn btn-ghost" onClick={() => setPreview(p => !p)}>
              <Eye size={13} /> {preview ? 'Hide Preview' : 'Show Preview'}
            </button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={submit} disabled={saving || !form.name.trim() || !form.title.trim()}>
                {saving ? 'Saving...' : modal === 'create' ? 'Create Embed' : 'Save Changes'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

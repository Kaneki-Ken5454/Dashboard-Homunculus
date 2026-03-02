import { useEffect, useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Zap, Search, ToggleLeft, ToggleRight, ChevronDown, ChevronUp } from 'lucide-react';
import {
  getTriggers, createTrigger, updateTrigger, deleteTrigger, type Trigger,
} from '../lib/db';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

interface Props { guildId: string; }

function F({ label, children, half }: { label: string; children: React.ReactNode; half?: boolean }) {
  return (
    <div style={{ marginBottom: 14, flex: half ? '1 1 calc(50% - 6px)' : '1 1 100%' }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const MATCH_TYPES  = ['contains', 'exact', 'startswith', 'endswith', 'regex'] as const;
const RESP_TYPES   = ['text', 'embed', 'reply', 'dm'] as const;
const PERM_LEVELS  = ['everyone', 'mod', 'admin'] as const;

const EMPTY: Partial<Trigger> = {
  trigger_text: '', response: '',
  match_type: 'contains', response_type: 'text',
  permission_level: 'everyone', cooldown_seconds: 0,
  enabled: true, delete_message: false,
  embed_color: '#5865F2', embed_title: '', channel_id: '',
};

function matchVariant(mt: string): 'primary' | 'muted' | 'success' | 'danger' {
  if (mt === 'regex') return 'danger';
  if (mt === 'exact') return 'success';
  return 'muted';
}

export default function Triggers({ guildId }: Props) {
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [modal, setModal]       = useState<'create' | 'edit' | null>(null);
  const [form, setForm]         = useState<Partial<Trigger>>(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [showAdv, setShowAdv]   = useState(false);

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getTriggers(guildId)
      .then(t => setTriggers(t))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? triggers.filter(t =>
      t.trigger_text.toLowerCase().includes(q) || t.response.toLowerCase().includes(q)
    ) : triggers;
  }, [search, triggers]);

  function openCreate() { setForm({ ...EMPTY, guild_id: guildId }); setShowAdv(false); setModal('create'); }
  function openEdit(t: Trigger) { setForm({ ...t }); setShowAdv(false); setModal('edit'); }

  async function submit() {
    setSaving(true); setError('');
    try {
      const payload = {
        ...form, guild_id: guildId,
        channel_id: form.channel_id?.trim() || null,
        embed_title: form.embed_title?.trim() || null,
        embed_color: form.embed_color?.trim() || null,
      };
      if (modal === 'create') await createTrigger(payload as Partial<Trigger> & { guild_id: string });
      else if (modal === 'edit' && form.id) await updateTrigger(form.id, payload);
      setModal(null); load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!confirm('Delete this trigger?')) return;
    try { await deleteTrigger(id); load(); }
    catch (e) { setError((e as Error).message); }
  }

  async function toggle(t: Trigger) {
    try { await updateTrigger(t.id, { enabled: !t.enabled }); load(); }
    catch (e) { setError((e as Error).message); }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade">
      {error && (
        <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input className="inp" style={{ paddingLeft: 32 }} placeholder="Search triggers…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> Add Trigger</button>
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Total', val: triggers.length, color: 'var(--primary)' },
          { label: 'Enabled', val: triggers.filter(t => t.enabled).length, color: 'var(--success)' },
          { label: 'Disabled', val: triggers.filter(t => !t.enabled).length, color: 'var(--text-muted)' },
          { label: 'Total Fires', val: triggers.reduce((s, t) => s + (t.use_count || 0), 0), color: 'var(--text)' },
        ].map(({ label, val, color }) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 18px', flex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{val}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 ? (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '48px 16px', textAlign: 'center' }}>
            <Zap size={28} style={{ color: 'var(--text-faint)', marginBottom: 10 }} />
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
              {search ? 'No triggers match your search' : 'No triggers yet'}
            </div>
            {!search && (
              <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={openCreate}>
                <Plus size={14} /> Add First Trigger
              </button>
            )}
          </div>
        ) : filtered.map(t => (
          <div key={t.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, overflow: 'hidden', opacity: t.enabled ? 1 : 0.6, transition: 'opacity 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <button onClick={() => toggle(t)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.enabled ? 'var(--success)' : 'var(--text-faint)', padding: 0, flexShrink: 0 }} title={t.enabled ? 'Disable' : 'Enable'}>
                {t.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
              </button>

              <div style={{ flex: '0 0 180px', minWidth: 0 }}>
                <span className="mono" style={{ fontSize: 13, color: 'hsl(239,84%,75%)', fontWeight: 600 }}>{t.trigger_text}</span>
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0, flexWrap: 'wrap' }}>
                <Badge label={t.match_type} variant={matchVariant(t.match_type)} />
                <Badge label={t.response_type} variant="primary" />
                {t.permission_level !== 'everyone' && <Badge label={t.permission_level} variant="danger" />}
                {t.cooldown_seconds > 0 && <Badge label={`${t.cooldown_seconds}s`} variant="muted" />}
                {t.channel_id && <Badge label="channel-locked" variant="muted" />}
                {t.delete_message && <Badge label="auto-delete" variant="muted" />}
              </div>

              <div style={{ flex: 1, overflow: 'hidden', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {t.response}
              </div>

              <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)', flexShrink: 0 }}>{t.use_count || 0} fires</span>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(t)}><Pencil size={12} /></button>
                <button className="btn btn-danger btn-sm" onClick={() => del(t.id)}><Trash2 size={12} /></button>
                <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(expanded === t.id ? null : t.id)} style={{ color: 'var(--text-muted)' }}>
                  {expanded === t.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
            </div>

            {expanded === t.id && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'rgba(0,0,0,0.15)', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <div style={{ flex: '1 1 100%' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase' }}>Response</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{t.response}</div>
                </div>
                {([
                  ['Match Type', t.match_type],
                  ['Response Type', t.response_type],
                  ['Permission', t.permission_level],
                  ['Cooldown', t.cooldown_seconds ? `${t.cooldown_seconds}s` : 'None'],
                  ['Channel Lock', t.channel_id ? `ID: ${t.channel_id}` : 'Any channel'],
                  ['Auto-Delete', t.delete_message ? 'Yes' : 'No'],
                  ...(t.embed_title ? [['Embed Title', t.embed_title]] : []),
                  ...(t.embed_color && t.response_type === 'embed' ? [['Embed Color', t.embed_color]] : []),
                ] as [string, string][]).map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 2 }}>{k}</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {k === 'Embed Color' && <span style={{ width: 12, height: 12, borderRadius: 3, background: v, display: 'inline-block', border: '1px solid rgba(255,255,255,0.1)' }} />}
                      {v}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal */}
      {modal && (
        <Modal title={modal === 'create' ? '⚡ New Trigger' : '✏️ Edit Trigger'} onClose={() => setModal(null)} width="max-w-2xl">
          <F label="Trigger Phrase *">
            <input className="inp mono" placeholder="e.g. hello world" value={form.trigger_text ?? ''} onChange={e => setForm(p => ({ ...p, trigger_text: e.target.value }))} />
          </F>

          <div style={{ display: 'flex', gap: 12 }}>
            <F label="Match Type" half>
              <select className="inp" value={form.match_type ?? 'contains'} onChange={e => setForm(p => ({ ...p, match_type: e.target.value }))}>
                {MATCH_TYPES.map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
              </select>
            </F>
            <F label="Response Type" half>
              <select className="inp" value={form.response_type ?? 'text'} onChange={e => setForm(p => ({ ...p, response_type: e.target.value }))}>
                {RESP_TYPES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
              </select>
            </F>
          </div>

          <F label="Response *">
            <textarea className="inp" rows={4} placeholder="What the bot will say…" value={form.response ?? ''} onChange={e => setForm(p => ({ ...p, response: e.target.value }))} />
          </F>

          <div style={{ display: 'flex', gap: 24, marginBottom: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
              <input type="checkbox" className="toggle" checked={form.enabled ?? true} onChange={e => setForm(p => ({ ...p, enabled: e.target.checked }))} />
              Enabled
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
              <input type="checkbox" className="toggle" checked={form.delete_message ?? false} onChange={e => setForm(p => ({ ...p, delete_message: e.target.checked }))} />
              Delete triggering message
            </label>
          </div>

          <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 14, fontSize: 12 }} onClick={() => setShowAdv(v => !v)}>
            {showAdv ? <ChevronUp size={13} /> : <ChevronDown size={13} />} {showAdv ? 'Hide' : 'Show'} Advanced Options
          </button>

          {showAdv && (
            <>
              <div style={{ display: 'flex', gap: 12 }}>
                <F label="Permission Level" half>
                  <select className="inp" value={form.permission_level ?? 'everyone'} onChange={e => setForm(p => ({ ...p, permission_level: e.target.value }))}>
                    {PERM_LEVELS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </F>
                <F label="Per-user Cooldown (seconds)" half>
                  <input type="number" className="inp" min={0} value={form.cooldown_seconds ?? 0} onChange={e => setForm(p => ({ ...p, cooldown_seconds: Number(e.target.value) }))} />
                </F>
              </div>

              <F label="Channel Lock — channel ID (blank = any channel)">
                <input className="inp mono" placeholder="e.g. 1234567890123456789" value={form.channel_id ?? ''} onChange={e => setForm(p => ({ ...p, channel_id: e.target.value }))} />
              </F>

              {form.response_type === 'embed' && (
                <div style={{ display: 'flex', gap: 12 }}>
                  <F label="Embed Title (optional)" half>
                    <input className="inp" placeholder="Title text" value={form.embed_title ?? ''} onChange={e => setForm(p => ({ ...p, embed_title: e.target.value }))} />
                  </F>
                  <F label="Embed Color" half>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input type="color" value={form.embed_color ?? '#5865F2'} onChange={e => setForm(p => ({ ...p, embed_color: e.target.value }))}
                        style={{ width: 40, height: 36, padding: 2, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer' }} />
                      <input className="inp mono" value={form.embed_color ?? '#5865F2'} onChange={e => setForm(p => ({ ...p, embed_color: e.target.value }))} style={{ flex: 1 }} />
                    </div>
                  </F>
                </div>
              )}

              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'var(--text-muted)', marginBottom: 14 }}>
                <strong style={{ color: 'var(--text)' }}>Match types:</strong>{' '}
                <b>contains</b> anywhere · <b>exact</b> full message · <b>startswith</b> / <b>endswith</b> positional · <b>regex</b> pattern
              </div>
            </>
          )}

          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !form.trigger_text?.trim() || !form.response?.trim()}>
              {saving ? 'Saving…' : modal === 'create' ? 'Create Trigger' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

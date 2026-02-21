import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Search, Terminal } from 'lucide-react';
import { getCustomCommands, createCustomCommand, updateCustomCommand, deleteCustomCommand, type CustomCommand } from '../lib/db';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

interface Props { guildId: string; }

const EMPTY: Partial<CustomCommand> = { trigger: '', name: '', description: '', response: '', response_type: 'text', permission_level: 'everyone', cooldown_seconds: 0, is_tag: false, is_enabled: true };

export default function Commands({ guildId }: Props) {
  const [commands, setCommands] = useState<CustomCommand[]>([]);
  const [filtered, setFiltered] = useState<CustomCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<'create' | 'edit' | null>(null);
  const [form, setForm] = useState<Partial<CustomCommand>>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getCustomCommands(guildId)
      .then(c => { setCommands(c); setFiltered(c); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? commands.filter(c => c.trigger.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q)) : commands);
  }, [search, commands]);

  function openCreate() { setForm({ ...EMPTY, guild_id: guildId }); setModal('create'); }
  function openEdit(c: CustomCommand) { setForm(c); setModal('edit'); }

  async function submit() {
    setSaving(true); setError('');
    try {
      if (modal === 'create') await createCustomCommand(form);
      else if (modal === 'edit' && form.id) await updateCustomCommand(form.id, form);
      setModal(null); load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function del(id: string) {
    if (!confirm('Delete this command?')) return;
    try { await deleteCustomCommand(id); load(); }
    catch (e) { setError((e as Error).message); }
  }

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{label}</label>
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

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input className="inp" style={{ paddingLeft: 32 }} placeholder="Search commands…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> Add Command</button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Trigger', 'Name', 'Response', 'Type', 'Permission', 'Uses', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8}>
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <Terminal size={28} style={{ color: 'var(--text-faint)', marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
                  <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No commands yet</div>
                  <button className="btn btn-primary" style={{ marginTop: 14 }} onClick={openCreate}><Plus size={14} /> Create First Command</button>
                </div>
              </td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 14px' }}>
                  <span className="mono" style={{ fontSize: 13, color: '#818cf8' }}>!{c.trigger}</span>
                </td>
                <td style={{ padding: '11px 14px', fontSize: 13, color: 'var(--text-muted)' }}>{c.name || '—'}</td>
                <td style={{ padding: '11px 14px', maxWidth: 240 }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{c.response}</div>
                </td>
                <td style={{ padding: '11px 14px' }}><Badge label={c.response_type} variant="muted" /></td>
                <td style={{ padding: '11px 14px' }}><Badge label={c.permission_level} variant="primary" /></td>
                <td style={{ padding: '11px 14px' }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.usage_count}</span>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <Badge label={c.is_enabled ? 'enabled' : 'disabled'} variant={c.is_enabled ? 'success' : 'muted'} />
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}><Pencil size={12} /></button>
                    <button className="btn btn-danger btn-sm" onClick={() => del(c.id)}><Trash2 size={12} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={modal === 'create' ? 'New Command' : 'Edit Command'} onClose={() => setModal(null)} width="max-w-xl">
          <F label="Trigger *">
            <input className="inp mono" placeholder="e.g. hello" value={form.trigger ?? ''} onChange={e => setForm(p => ({ ...p, trigger: e.target.value }))} />
          </F>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Name">
              <input className="inp" placeholder="Display name" value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </F>
            <F label="Cooldown (seconds)">
              <input type="number" className="inp" value={form.cooldown_seconds ?? 0} onChange={e => setForm(p => ({ ...p, cooldown_seconds: Number(e.target.value) }))} />
            </F>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <F label="Response Type">
              <select className="inp" value={form.response_type ?? 'text'} onChange={e => setForm(p => ({ ...p, response_type: e.target.value }))}>
                <option value="text">Text</option>
                <option value="embed">Embed</option>
                <option value="reply">Reply</option>
              </select>
            </F>
            <F label="Permission Level">
              <select className="inp" value={form.permission_level ?? 'everyone'} onChange={e => setForm(p => ({ ...p, permission_level: e.target.value }))}>
                <option value="everyone">Everyone</option>
                <option value="mod">Mod</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
            </F>
          </div>
          <F label="Response *">
            <textarea className="inp" placeholder="Command response…" value={form.response ?? ''} onChange={e => setForm(p => ({ ...p, response: e.target.value }))} />
          </F>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <input type="checkbox" className="toggle" checked={form.is_enabled ?? true} onChange={e => setForm(p => ({ ...p, is_enabled: e.target.checked }))} />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>Enabled</span>
            <input type="checkbox" className="toggle" style={{ marginLeft: 16 }} checked={form.is_tag ?? false} onChange={e => setForm(p => ({ ...p, is_tag: e.target.checked }))} />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>Tag</span>
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !form.trigger || !form.response}>
              {saving ? 'Saving…' : modal === 'create' ? 'Create' : 'Save Changes'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

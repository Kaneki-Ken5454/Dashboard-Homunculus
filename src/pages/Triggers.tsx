import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Zap, MessageSquare } from 'lucide-react';
import {
  getTriggers, createTrigger, updateTrigger, deleteTrigger, type Trigger,
  getAutoResponders, createAutoResponder, updateAutoResponder, deleteAutoResponder, type AutoResponder,
} from '../lib/db';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

interface Props { guildId: string; }

export default function Triggers({ guildId }: Props) {
  const [tab, setTab] = useState<'triggers' | 'auto'>('triggers');
  const [triggers, setTriggers] = useState<Trigger[]>([]);
  const [autoRes, setAutoRes] = useState<AutoResponder[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState<Trigger | AutoResponder | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    Promise.all([getTriggers(guildId), getAutoResponders(guildId)])
      .then(([t, a]) => { setTriggers(t); setAutoRes(a); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  function openCreate() {
    setEditItem(null);
    setForm({ trigger_text: '', response: '', match_type: 'contains', enabled: true, is_enabled: true });
    setModal(true);
  }

  function openEdit(item: Trigger | AutoResponder) {
    setEditItem(item);
    setForm({ ...item });
    setModal(true);
  }

  async function submit() {
    setSaving(true); setError('');
    try {
      if (tab === 'triggers') {
        if (editItem) await updateTrigger((editItem as Trigger).id, { ...form, guild_id: guildId } as Partial<Trigger>);
        else await createTrigger({ ...form, guild_id: guildId } as Partial<Trigger>);
      } else {
        if (editItem) await updateAutoResponder((editItem as AutoResponder).id, form as Partial<AutoResponder>);
        else await createAutoResponder({ ...form, guild_id: guildId } as Partial<AutoResponder>);
      }
      setModal(false); load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function del(item: Trigger | AutoResponder) {
    if (!confirm('Delete this item?')) return;
    try {
      if (tab === 'triggers') await deleteTrigger((item as Trigger).id);
      else await deleteAutoResponder((item as AutoResponder).id);
      load();
    } catch (e) { setError((e as Error).message); }
  }

  const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );

  const items = tab === 'triggers' ? triggers : autoRes;
  const enabledKey = tab === 'triggers' ? 'enabled' : 'is_enabled';
  const textKey = tab === 'triggers' ? 'trigger_text' : 'trigger_text';
  const countKey = tab === 'triggers' ? 'use_count' : 'trigger_count';

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade">
      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
          {(['triggers', 'auto'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: tab === t ? 'var(--elevated)' : 'transparent',
              color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 13, fontFamily: 'Lexend', fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {t === 'triggers' ? <Zap size={13} /> : <MessageSquare size={13} />}
              {t === 'triggers' ? 'Triggers' : 'Auto Responders'}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={14} /> Add {tab === 'triggers' ? 'Trigger' : 'Responder'}</button>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Trigger Text', 'Response', 'Match', 'Uses', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6}>
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  {tab === 'triggers' ? <Zap size={28} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} /> : <MessageSquare size={28} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />}
                  <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No {tab === 'triggers' ? 'triggers' : 'auto responders'} yet</div>
                </div>
              </td></tr>
            ) : items.map((item) => {
              const enabled = (item as Record<string, unknown>)[enabledKey] as boolean;
              const text = (item as Record<string, unknown>)[textKey] as string;
              const count = (item as Record<string, unknown>)[countKey] as number;
              return (
                <tr key={(item as Record<string, unknown>).id as string} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 14px' }}>
                    <span className="mono" style={{ fontSize: 13, color: '#818cf8' }}>{text}</span>
                  </td>
                  <td style={{ padding: '11px 14px', maxWidth: 280 }}>
                    <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{item.response}</div>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge label={item.match_type} variant="muted" />
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{count}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge label={enabled ? 'active' : 'disabled'} variant={enabled ? 'success' : 'muted'} />
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}><Pencil size={12} /></button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(item)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <Modal title={editItem ? 'Edit' : 'New'} onClose={() => setModal(false)}>
          <F label="Trigger Text *">
            <input className="inp mono" placeholder="e.g. hello world" value={(form.trigger_text as string) ?? ''} onChange={e => setForm(p => ({ ...p, trigger_text: e.target.value }))} />
          </F>
          <F label="Match Type">
            <select className="inp" value={(form.match_type as string) ?? 'contains'} onChange={e => setForm(p => ({ ...p, match_type: e.target.value }))}>
              <option value="contains">Contains</option>
              <option value="exact">Exact</option>
              <option value="startsWith">Starts With</option>
              <option value="regex">Regex</option>
            </select>
          </F>
          <F label="Response *">
            <textarea className="inp" placeholder="Bot response…" value={(form.response as string) ?? ''} onChange={e => setForm(p => ({ ...p, response: e.target.value }))} />
          </F>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <input type="checkbox" className="toggle" checked={(form[enabledKey] as boolean) ?? true}
              onChange={e => setForm(p => ({ ...p, [enabledKey]: e.target.checked }))} />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>Active</span>
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editItem ? 'Save' : 'Create'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

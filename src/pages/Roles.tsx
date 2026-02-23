import { useEffect, useState } from 'react';
import { Tag, MousePointer, Trash2, Plus, X, Info } from 'lucide-react';
import {
  getReactionRoles, deleteReactionRole, createReactionRole,
  getButtonRoles, deleteButtonRole, createButtonRole,
  type ReactionRole, type ButtonRole,
} from '../lib/db';
import Badge from '../components/Badge';

interface Props { guildId: string; }

/* ── Shared styles ─────────────────────────────────────────────────────────── */
const IS: React.CSSProperties = {
  background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8,
  color: 'var(--text)', fontSize: 13, padding: '8px 12px', width: '100%', fontFamily: 'Lexend',
  outline: 'none', boxSizing: 'border-box',
};
const LS: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em',
  textTransform: 'uppercase', marginBottom: 5, display: 'block',
};

/* ── Field wrapper ─────────────────────────────────────────────────────────
   IMPORTANT: defined at MODULE SCOPE, never inside a component.
   Defining it inside would cause React to remount on every state change
   (new function ref = new component type = unmount/remount = focus lost). */
interface FieldProps { label: string; req?: boolean; hint?: string; children: React.ReactNode; }
function Field({ label, req, hint, children }: FieldProps) {
  return (
    <div>
      <label style={LS}>
        {label}{req && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
      {hint && <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

export default function Roles({ guildId }: Props) {
  const [tab, setTab]           = useState<'reaction' | 'button'>('reaction');
  const [reaction, setReaction] = useState<ReactionRole[]>([]);
  const [button, setButton]     = useState<ButtonRole[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const [showRRForm, setShowRRForm] = useState(false);
  const [rrForm, setRRForm] = useState({ message_id: '', channel_id: '', emoji: '', role_id: '', role_name: '' });
  const [rrSaving, setRRSaving] = useState(false);

  const [showBRForm, setShowBRForm] = useState(false);
  const [brForm, setBRForm] = useState({ channel_id: '', role_id: '', button_label: 'Get Role', button_emoji: '', button_style: 'PRIMARY' });
  const [brSaving, setBRSaving] = useState(false);

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    Promise.all([getReactionRoles(guildId), getButtonRoles(guildId)])
      .then(([r, b]) => { setReaction(r); setButton(b); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  function flash(msg: string) { setSuccess(msg); setTimeout(() => setSuccess(''), 4000); }

  async function delReaction(id: string) {
    if (!confirm('Delete this reaction role?')) return;
    try { await deleteReactionRole(id); setReaction(p => p.filter(r => r.id !== id)); flash('Reaction role removed.'); }
    catch (e) { setError((e as Error).message); }
  }

  async function delButton(id: string) {
    if (!confirm('Delete this button role?')) return;
    try { await deleteButtonRole(id); setButton(p => p.filter(b => b.id !== id)); flash('Button role removed.'); }
    catch (e) { setError((e as Error).message); }
  }

  async function submitReactionRole() {
    setError('');
    const { message_id, channel_id, emoji, role_id } = rrForm;
    if (!channel_id.trim() || !message_id.trim() || !emoji.trim() || !role_id.trim()) {
      setError('Channel ID, Message ID, Emoji, and Role ID are all required.'); return;
    }
    if (!/^\d{17,19}$/.test(channel_id.trim())) { setError('Channel ID must be a 17–19 digit number.'); return; }
    if (!/^\d{17,19}$/.test(message_id.trim())) { setError('Message ID must be a 17–19 digit number.'); return; }
    if (!/^\d{17,19}$/.test(role_id.trim()))    { setError('Role ID must be a 17–19 digit number.'); return; }
    setRRSaving(true);
    try {
      await createReactionRole(guildId, { ...rrForm, guild_id: guildId });
      setShowRRForm(false);
      setRRForm({ message_id: '', channel_id: '', emoji: '', role_id: '', role_name: '' });
      flash('Reaction role created! Bot will add the reaction within 30 seconds.');
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setRRSaving(false); }
  }

  async function submitButtonRole() {
    setError('');
    const { channel_id, role_id } = brForm;
    if (!channel_id.trim()) { setError('Channel ID is required.'); return; }
    if (!role_id.trim())    { setError('Role ID is required.'); return; }
    if (!/^\d{17,19}$/.test(channel_id.trim())) { setError('Channel ID must be a 17–19 digit number.'); return; }
    if (!/^\d{17,19}$/.test(role_id.trim()))    { setError('Role ID must be a 17–19 digit number.'); return; }
    setBRSaving(true);
    try {
      await createButtonRole(guildId, { ...brForm, guild_id: guildId });
      setShowBRForm(false);
      setBRForm({ channel_id: '', role_id: '', button_label: 'Get Role', button_emoji: '', button_style: 'PRIMARY' });
      flash('Button role queued! Bot will post the button message within 30 seconds.');
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setBRSaving(false); }
  }

  const styleMap: Record<string, 'primary' | 'success' | 'danger' | 'muted'> = {
    PRIMARY: 'primary', SUCCESS: 'success', DANGER: 'danger', SECONDARY: 'muted',
  };
  const card: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16,
  };
  const row2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 };
  const row3: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade">

      {error && (
        <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {error}
          <button onClick={() => setError('')} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0 }}><X size={14} /></button>
        </div>
      )}
      {success && (
        <div style={{ background: '#052e16', border: '1px solid #22c55e', borderRadius: 10, padding: '12px 16px', color: '#22c55e', fontSize: 13, marginBottom: 14 }}>
          {success}
        </div>
      )}

      {/* Tab bar + Add button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
          {([['reaction', 'Reaction Roles', Tag, reaction.length], ['button', 'Button Roles', MousePointer, button.length]] as const).map(([t, label, Icon, count]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: tab === t ? 'var(--elevated)' : 'transparent',
              color: tab === t ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 13, fontFamily: 'Lexend', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7,
            }}>
              <Icon size={13} /> {label}
              <span style={{ background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{count}</span>
            </button>
          ))}
        </div>
        <button className="btn btn-primary" onClick={() => { setError(''); tab === 'reaction' ? setShowRRForm(v => !v) : setShowBRForm(v => !v); }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <Plus size={14} /> Add {tab === 'reaction' ? 'Reaction Role' : 'Button Role'}
        </button>
      </div>

      {/* ── Reaction Role Form ── */}
      {tab === 'reaction' && showRRForm && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>🔔 New Reaction Role</span>
            <button onClick={() => { setShowRRForm(false); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
          </div>
          <div style={{ background: 'var(--primary-subtle)', border: '1px solid #4f46e5', borderRadius: 8, padding: '9px 13px', fontSize: 12, color: '#a5b4fc', marginBottom: 16, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Bot will add the emoji reaction to the message automatically. Right-click any message in Discord → <strong>Copy Message ID</strong>.</span>
          </div>
          <div style={row2}>
            <Field label="Channel ID" req hint="Right-click channel → Copy ID">
              <input style={IS} placeholder="987654321098765432" value={rrForm.channel_id}
                onChange={e => setRRForm(p => ({ ...p, channel_id: e.target.value }))} />
            </Field>
            <Field label="Message ID" req hint="Right-click message → Copy Message ID">
              <input style={IS} placeholder="123456789012345678" value={rrForm.message_id}
                onChange={e => setRRForm(p => ({ ...p, message_id: e.target.value }))} />
            </Field>
          </div>
          <div style={row2}>
            <Field label="Emoji" req hint="Standard emoji (✅) or Discord :name: format">
              <input style={{ ...IS, fontSize: 20 }} placeholder="✅" value={rrForm.emoji}
                onChange={e => setRRForm(p => ({ ...p, emoji: e.target.value }))} />
            </Field>
            <Field label="Role ID" req hint="Developer Mode → right-click role → Copy ID">
              <input style={IS} placeholder="111222333444555666" value={rrForm.role_id}
                onChange={e => setRRForm(p => ({ ...p, role_id: e.target.value }))} />
            </Field>
          </div>
          <div style={{ marginBottom: 16 }}>
            <Field label="Role Name" hint="Optional — display label only">
              <input style={IS} placeholder="e.g. Member, VIP…" value={rrForm.role_name}
                onChange={e => setRRForm(p => ({ ...p, role_name: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => { setShowRRForm(false); setError(''); }}>Cancel</button>
            <button className="btn btn-primary" onClick={submitReactionRole} disabled={rrSaving}>
              {rrSaving ? 'Saving…' : 'Create Reaction Role'}
            </button>
          </div>
        </div>
      )}

      {/* ── Button Role Form ── */}
      {tab === 'button' && showBRForm && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>🔘 New Button Role</span>
            <button onClick={() => { setShowBRForm(false); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
          </div>
          <div style={{ background: 'var(--primary-subtle)', border: '1px solid #4f46e5', borderRadius: 8, padding: '9px 13px', fontSize: 12, color: '#a5b4fc', marginBottom: 16, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Bot will send a button message to that channel within 30 s. Users click it to toggle the role.</span>
          </div>
          <div style={row2}>
            <Field label="Channel ID" req hint="Channel where the button message is posted">
              <input style={IS} placeholder="987654321098765432" value={brForm.channel_id}
                onChange={e => setBRForm(p => ({ ...p, channel_id: e.target.value }))} />
            </Field>
            <Field label="Role ID" req hint="Role granted/removed on click">
              <input style={IS} placeholder="111222333444555666" value={brForm.role_id}
                onChange={e => setBRForm(p => ({ ...p, role_id: e.target.value }))} />
            </Field>
          </div>
          <div style={row3}>
            <Field label="Button Label" hint="Text on the button">
              <input style={IS} placeholder="Get Role" value={brForm.button_label}
                onChange={e => setBRForm(p => ({ ...p, button_label: e.target.value }))} />
            </Field>
            <Field label="Button Emoji" hint="Optional emoji prefix">
              <input style={{ ...IS, fontSize: 20 }} placeholder="🎮" value={brForm.button_emoji}
                onChange={e => setBRForm(p => ({ ...p, button_emoji: e.target.value }))} />
            </Field>
            <Field label="Button Style">
              <select style={IS} value={brForm.button_style}
                onChange={e => setBRForm(p => ({ ...p, button_style: e.target.value }))}>
                <option value="PRIMARY">Primary (Blue)</option>
                <option value="SECONDARY">Secondary (Grey)</option>
                <option value="SUCCESS">Success (Green)</option>
                <option value="DANGER">Danger (Red)</option>
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => { setShowBRForm(false); setError(''); }}>Cancel</button>
            <button className="btn btn-primary" onClick={submitButtonRole} disabled={brSaving}>
              {brSaving ? 'Saving…' : 'Create Button Role'}
            </button>
          </div>
        </div>
      )}

      {/* ── Reaction Roles Table ── */}
      {tab === 'reaction' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Emoji', 'Role', 'Message ID', 'Channel ID', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reaction.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  No reaction roles yet — click <strong>Add Reaction Role</strong> above.
                </td></tr>
              ) : reaction.map(r => (
                <tr key={r.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 14px', fontSize: 22 }}>{r.emoji}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.role_name || '—'}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>{r.role_id}</div>
                  </td>
                  <td style={{ padding: '11px 14px' }}><span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.message_id}</span></td>
                  <td style={{ padding: '11px 14px' }}><span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.channel_id}</span></td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge label={(r as unknown as { bot_synced?: boolean }).bot_synced === false ? 'pending' : 'synced'}
                           variant={(r as unknown as { bot_synced?: boolean }).bot_synced === false ? 'warning' : 'success'} />
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => delReaction(r.id)}><Trash2 size={11} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Button Roles Table ── */}
      {tab === 'button' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Button', 'Role ID', 'Style', 'Channel', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {button.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  No button roles yet — click <strong>Add Button Role</strong> above.
                </td></tr>
              ) : button.map(b => (
                <tr key={b.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {b.button_emoji && <span style={{ fontSize: 18 }}>{b.button_emoji}</span>}
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{b.button_label || 'Get Role'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '11px 14px' }}><span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.role_id}</span></td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge label={b.button_style || 'PRIMARY'} variant={styleMap[b.button_style] ?? 'muted'} />
                  </td>
                  <td style={{ padding: '11px 14px' }}><span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.channel_id || '—'}</span></td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge label={(b as unknown as { bot_synced?: boolean }).bot_synced === false ? 'pending' : 'sent'}
                           variant={(b as unknown as { bot_synced?: boolean }).bot_synced === false ? 'warning' : 'success'} />
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => delButton(b.id)}><Trash2 size={11} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

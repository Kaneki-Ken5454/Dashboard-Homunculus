import { useEffect, useState } from 'react';
import { Tag, MousePointer, Trash2, Plus, X, Info, CheckCircle2, Grip } from 'lucide-react';
import {
  getReactionRoles, deleteReactionRole, createReactionRole,
  getButtonRoles, deleteButtonRole, createButtonRole,
  markReactionRoleSynced, markButtonRoleSynced,
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

/* ── Reaction-role pair row (inside the form) ──────────────────────────────── */
interface RRPair { emoji: string; role_id: string; role_name: string; }

function RRPairRow({ pair, idx, onChange, onRemove, canRemove }: {
  pair: RRPair; idx: number;
  onChange: (idx: number, key: keyof RRPair, val: string) => void;
  onRemove: (idx: number) => void; canRemove: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ flex: '0 0 70px' }}>
        <label style={LS}>Emoji *</label>
        <input style={{ ...IS, fontSize: 20 }} placeholder="✅"
          value={pair.emoji} onChange={e => onChange(idx, 'emoji', e.target.value)} />
      </div>
      <div style={{ flex: '1 1 160px' }}>
        <label style={LS}>Role ID *</label>
        <input style={IS} placeholder="111222333444555666"
          value={pair.role_id} onChange={e => onChange(idx, 'role_id', e.target.value)} />
      </div>
      <div style={{ flex: '1 1 120px' }}>
        <label style={LS}>Role Name <span style={{ fontWeight: 400, color: 'var(--text-faint)' }}>(optional)</span></label>
        <input style={IS} placeholder="e.g. Member"
          value={pair.role_name} onChange={e => onChange(idx, 'role_name', e.target.value)} />
      </div>
      {canRemove && (
        <button onClick={() => onRemove(idx)}
          style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '8px 4px', flexShrink: 0 }} title="Remove row">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* ── Button-role pair row (inside the form) ────────────────────────────────── */
interface BRPair { role_id: string; button_label: string; button_emoji: string; button_style: string; }

function BRPairRow({ pair, idx, onChange, onRemove, canRemove }: {
  pair: BRPair; idx: number;
  onChange: (idx: number, key: keyof BRPair, val: string) => void;
  onRemove: (idx: number) => void; canRemove: boolean;
}) {
  return (
    <div style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <Grip size={12} style={{ color: 'var(--text-faint)' }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Button {idx + 1}</span>
        {canRemove && (
          <button onClick={() => onRemove(idx)}
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px 4px', marginLeft: 'auto' }} title="Remove button">
            <X size={13} />
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 60px 1fr 1fr', gap: 8 }}>
        <div>
          <label style={LS}>Role ID *</label>
          <input style={IS} placeholder="111222333444555666"
            value={pair.role_id} onChange={e => onChange(idx, 'role_id', e.target.value)} />
        </div>
        <div>
          <label style={LS}>Emoji</label>
          <input style={{ ...IS, fontSize: 18 }} placeholder="🎮"
            value={pair.button_emoji} onChange={e => onChange(idx, 'button_emoji', e.target.value)} />
        </div>
        <div>
          <label style={LS}>Label</label>
          <input style={IS} placeholder="Get Role"
            value={pair.button_label} onChange={e => onChange(idx, 'button_label', e.target.value)} />
        </div>
        <div>
          <label style={LS}>Style</label>
          <select style={IS} value={pair.button_style}
            onChange={e => onChange(idx, 'button_style', e.target.value)}>
            <option value="PRIMARY">Primary (Blue)</option>
            <option value="SECONDARY">Secondary (Grey)</option>
            <option value="SUCCESS">Success (Green)</option>
            <option value="DANGER">Danger (Red)</option>
          </select>
        </div>
      </div>
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

  /* ── Reaction Role form ─────────────────────────────────────────────────── */
  const [showRRForm, setShowRRForm] = useState(false);
  const [rrChannelId, setRRChannelId] = useState('');
  const [rrMessageId, setRRMessageId] = useState('');
  const [rrPairs, setRRPairs] = useState<RRPair[]>([{ emoji: '', role_id: '', role_name: '' }]);
  const [rrSaving, setRRSaving] = useState(false);

  /* ── Button Role form ───────────────────────────────────────────────────── */
  const [showBRForm, setShowBRForm] = useState(false);
  const [brChannelId, setBRChannelId] = useState('');
  const [brMessage, setBRMessage]   = useState('');
  const [brPairs, setBRPairs] = useState<BRPair[]>([{ role_id: '', button_label: 'Get Role', button_emoji: '', button_style: 'PRIMARY' }]);
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

  /* ── Reaction Role pair helpers ─────────────────────────────────────────── */
  function updateRRPair(idx: number, key: keyof RRPair, val: string) {
    setRRPairs(p => p.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  }
  function removeRRPair(idx: number) { setRRPairs(p => p.filter((_, i) => i !== idx)); }
  function addRRPair() { setRRPairs(p => [...p, { emoji: '', role_id: '', role_name: '' }]); }

  /* ── Button Role pair helpers ───────────────────────────────────────────── */
  function updateBRPair(idx: number, key: keyof BRPair, val: string) {
    setBRPairs(p => p.map((b, i) => i === idx ? { ...b, [key]: val } : b));
  }
  function removeBRPair(idx: number) { setBRPairs(p => p.filter((_, i) => i !== idx)); }
  function addBRPair() {
    if (brPairs.length >= 5) { setError('Discord allows maximum 5 buttons per message.'); return; }
    setBRPairs(p => [...p, { role_id: '', button_label: 'Get Role', button_emoji: '', button_style: 'PRIMARY' }]);
  }

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
    if (!/^\d{17,19}$/.test(rrChannelId.trim())) { setError('Channel ID must be a 17–19 digit number.'); return; }
    if (!/^\d{17,19}$/.test(rrMessageId.trim())) { setError('Message ID must be a 17–19 digit number.'); return; }
    for (const p of rrPairs) {
      if (!p.emoji.trim())   { setError('Each row needs an emoji.'); return; }
      if (!/^\d{17,19}$/.test(p.role_id.trim())) { setError('Each row needs a valid Role ID (17–19 digits).'); return; }
    }
    setRRSaving(true);
    try {
      // Create one DB entry per emoji-role pair, all pointing to the same message
      await Promise.all(rrPairs.map(pair =>
        createReactionRole(guildId, {
          guild_id: guildId,
          channel_id: rrChannelId.trim(),
          message_id: rrMessageId.trim(),
          emoji: pair.emoji.trim(),
          role_id: pair.role_id.trim(),
          role_name: pair.role_name.trim(),
        })
      ));
      setShowRRForm(false);
      setRRChannelId(''); setRRMessageId('');
      setRRPairs([{ emoji: '', role_id: '', role_name: '' }]);
      flash(`${rrPairs.length} reaction role(s) created! Bot will add reactions within 30 seconds.`);
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setRRSaving(false); }
  }

  async function submitButtonRole() {
    setError('');
    if (!/^\d{17,19}$/.test(brChannelId.trim())) { setError('Channel ID must be a 17–19 digit number.'); return; }
    for (const p of brPairs) {
      if (!/^\d{17,19}$/.test(p.role_id.trim())) { setError('Each button needs a valid Role ID (17–19 digits).'); return; }
      if (!p.button_label.trim()) { setError('Each button needs a label.'); return; }
    }
    setBRSaving(true);
    try {
      // Use a shared group_id so the bot sends all buttons in ONE Discord message
      const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await Promise.all(brPairs.map((pair, idx) =>
        createButtonRole(guildId, {
          guild_id: guildId,
          channel_id: brChannelId.trim(),
          role_id: pair.role_id.trim(),
          button_label: pair.button_label.trim() || 'Get Role',
          button_emoji: pair.button_emoji.trim(),
          button_style: pair.button_style,
          message_text: idx === 0 ? (brMessage.trim() || undefined) : undefined,
          group_id: groupId,
          group_position: idx,
        })
      ));
      setShowBRForm(false);
      setBRChannelId(''); setBRMessage('');
      setBRPairs([{ role_id: '', button_label: 'Get Role', button_emoji: '', button_style: 'PRIMARY' }]);
      flash(`${brPairs.length} button role(s) queued! Bot will post them in one message within 30 seconds.`);
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
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>🔔 New Reaction Role(s)</span>
            <button onClick={() => { setShowRRForm(false); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
          </div>
          <div style={{ background: 'var(--primary-subtle)', border: '1px solid #4f46e5', borderRadius: 8, padding: '9px 13px', fontSize: 12, color: '#a5b4fc', marginBottom: 16, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Set the target message once, then add as many emoji→role pairs as you need. All will be added to the same message.</span>
          </div>

          {/* Message target */}
          <div style={row2}>
            <Field label="Channel ID" req hint="Right-click channel → Copy ID">
              <input style={IS} placeholder="987654321098765432" value={rrChannelId}
                onChange={e => setRRChannelId(e.target.value)} />
            </Field>
            <Field label="Message ID" req hint="Right-click message → Copy Message ID">
              <input style={IS} placeholder="123456789012345678" value={rrMessageId}
                onChange={e => setRRMessageId(e.target.value)} />
            </Field>
          </div>

          {/* Emoji-role pairs */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>
              Emoji → Role Pairs
            </div>
            {rrPairs.map((pair, idx) => (
              <RRPairRow key={idx} pair={pair} idx={idx}
                onChange={updateRRPair} onRemove={removeRRPair} canRemove={rrPairs.length > 1} />
            ))}
            <button className="btn btn-ghost btn-sm" onClick={addRRPair}
              style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Plus size={11} /> Add another emoji
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => { setShowRRForm(false); setError(''); }}>Cancel</button>
            <button className="btn btn-primary" onClick={submitReactionRole} disabled={rrSaving}>
              {rrSaving ? 'Saving…' : `Create ${rrPairs.length > 1 ? `${rrPairs.length} ` : ''}Reaction Role${rrPairs.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Button Role Form ── */}
      {tab === 'button' && showBRForm && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>🔘 New Button Role Message</span>
            <button onClick={() => { setShowBRForm(false); setError(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={14} /></button>
          </div>
          <div style={{ background: 'var(--primary-subtle)', border: '1px solid #4f46e5', borderRadius: 8, padding: '9px 13px', fontSize: 12, color: '#a5b4fc', marginBottom: 16, display: 'flex', gap: 7, alignItems: 'flex-start' }}>
            <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>Add up to 5 buttons — all will be sent as a single Discord message. Users click a button to toggle that role.</span>
          </div>

          {/* Channel + message text */}
          <div style={{ marginBottom: 14 }}>
            <Field label="Channel ID" req hint="Channel where the button message is posted">
              <input style={IS} placeholder="987654321098765432" value={brChannelId}
                onChange={e => setBRChannelId(e.target.value)} />
            </Field>
          </div>
          <div style={{ marginBottom: 14 }}>
            <Field label="Message Text" hint="Optional text shown above the buttons">
              <input style={IS} placeholder="Click a button below to toggle your roles."
                value={brMessage} onChange={e => setBRMessage(e.target.value)} />
            </Field>
          </div>

          {/* Button pairs */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Buttons ({brPairs.length}/5)
              </span>
            </div>
            {brPairs.map((pair, idx) => (
              <BRPairRow key={idx} pair={pair} idx={idx}
                onChange={updateBRPair} onRemove={removeBRPair} canRemove={brPairs.length > 1} />
            ))}
            {brPairs.length < 5 && (
              <button className="btn btn-ghost btn-sm" onClick={addBRPair}
                style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                <Plus size={11} /> Add button
              </button>
            )}
          </div>

          {/* Preview */}
          <div style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Discord Preview</div>
            {brMessage && <div style={{ fontSize: 13, color: 'var(--text)', marginBottom: 8 }}>{brMessage}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {brPairs.map((p, i) => {
                const styleColors: Record<string, string> = { PRIMARY: '#5865F2', SECONDARY: '#4e5058', SUCCESS: '#248046', DANGER: '#da373c' };
                return (
                  <div key={i} style={{ background: styleColors[p.button_style] || '#5865F2', borderRadius: 3, padding: '2px 16px', fontSize: 13, color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {p.button_emoji && <span>{p.button_emoji}</span>}
                    <span>{p.button_label || 'Get Role'}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => { setShowBRForm(false); setError(''); }}>Cancel</button>
            <button className="btn btn-primary" onClick={submitButtonRole} disabled={brSaving}>
              {brSaving ? 'Saving…' : `Send Message with ${brPairs.length} Button${brPairs.length > 1 ? 's' : ''}`}
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
                    {(() => { const s = (r as unknown as { bot_synced?: boolean | null }).bot_synced; const pending = s === false || s === null || s === undefined; return (<><Badge label={pending ? 'pending' : 'synced'} variant={pending ? 'warning' : 'success'} />{pending && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={async () => { await markReactionRoleSynced(r.id); load(); }} title="Mark as synced"><CheckCircle2 size={11} /></button>}</>); })()}
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
                {['Button', 'Role ID', 'Style', 'Channel', 'Group', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {button.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
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
                    {(b as unknown as { group_id?: string }).group_id
                      ? <span style={{ fontSize: 10, background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 4, padding: '2px 6px' }}>grouped</span>
                      : <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>—</span>}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    {(() => { const s = (b as unknown as { bot_synced?: boolean | null }).bot_synced; const pending = s === false || s === null || s === undefined; return (<><Badge label={pending ? 'pending' : 'sent'} variant={pending ? 'warning' : 'success'} />{pending && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={async () => { await markButtonRoleSynced(b.id); load(); }} title="Mark as synced"><CheckCircle2 size={11} /></button>}</>); })()}
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

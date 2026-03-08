/**
 * RolesTicketsVotes.tsx — merged page
 * Tabs: Roles | Tickets | Votes
 */
import { useEffect, useState, useMemo } from 'react';
import { Tag, MousePointer, Trash2, Plus, X, Info, CheckCircle2, Ticket, Filter, Bell, BarChart2, Clock, ChevronDown, ChevronUp, Users } from 'lucide-react';
import {
  getReactionRoles, deleteReactionRole, createReactionRole,
  getButtonRoles, deleteButtonRole, createButtonRole,
  markReactionRoleSynced, markButtonRoleSynced,
  getTickets, updateTicketStatus, deleteTicket, deleteTicketPanel,
  getVotes, createVote, deleteVote,
  apiCall,
  type ReactionRole, type ButtonRole, type Ticket as TicketType, type Vote,
} from '../lib/db';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

const TAB_BTN = (active: boolean): React.CSSProperties => ({
  padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: active ? 'var(--elevated)' : 'transparent',
  color: active ? 'var(--text)' : 'var(--text-muted)',
  fontSize: 13, fontFamily: 'Lexend', fontWeight: 500,
  display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
});

// ─── Roles ────────────────────────────────────────────────────────────────────
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

function RolesTab({ guildId }: Props) {
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


// ─── Tickets ──────────────────────────────────────────────────────────────────

interface Panel { id: string; name: string; notificationRoles: string[]; supportRoles: string[]; }

const statusVariant = (s: string): 'success' | 'warning' | 'danger' | 'muted' => {
  if (s === 'open') return 'success';
  if (s === 'claimed') return 'warning';
  if (s === 'closed') return 'muted';
  return 'muted';
};

const priorityVariant = (p: string): 'danger' | 'warning' | 'primary' | 'muted' => {
  if (p === 'high' || p === 'urgent') return 'danger';
  if (p === 'medium') return 'warning';
  if (p === 'low') return 'muted';
  return 'primary';
};

function parseJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[];
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
  return [];
}

function TicketsTab({ guildId }: Props) {
  const [tickets, setTickets]   = useState<TicketType[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [error, setError]       = useState('');
  const [panels, setPanels]     = useState<Panel[]>([]);
  const [pingModal, setPingModal] = useState<{ panelId: string; name: string; roles: string[] } | null>(null);
  const [newRole, setNewRole]   = useState('');
  const [savingPing, setSavingPing] = useState(false);

  const load = async () => {
    if (!guildId) return;
    setLoading(true); setError('');
    try {
      const data = await getTickets(guildId);
      setTickets(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const loadPanels = async () => {
    if (!guildId) return;
    try {
      const rows = await apiCall<{ id: string; name: string; notificationRoles: unknown; supportRoles: unknown }[]>(
        'getTicketPanelPingRoles', { guildId }
      );
      setPanels(rows.map(r => ({
        id: r.id,
        name: r.name,
        notificationRoles: parseJsonArray(r.notificationRoles),
        supportRoles: parseJsonArray(r.supportRoles),
      })));
    } catch { /* panels may not exist yet */ }
  };

  useEffect(() => { load(); loadPanels(); }, [guildId]);

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);
  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    claimed: tickets.filter(t => t.status === 'claimed').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  };

  async function changeStatus(id: string, status: string) {
    try { await updateTicketStatus(id, status); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  async function del(id: string) {
    if (!confirm('Delete this ticket permanently?')) return;
    try { await deleteTicket(id); await load(); }
    catch (e) { setError((e as Error).message); }
  }

  const savePingRoles = async () => {
    if (!pingModal) return;
    setSavingPing(true);
    try {
      await apiCall('updateTicketPanelPingRoles', {
        panelId: pingModal.panelId,
        notificationRoles: pingModal.roles,
      });
      await loadPanels();
      setPingModal(null);
    } catch (e) { setError((e as Error).message); }
    finally { setSavingPing(false); }
  };

  async function delPanel(panelId: string, name: string) {
    if (!confirm(`Delete panel "${name}"?\n\nThis removes the panel from the database. Existing open tickets are kept but unlinked from the panel. The bot will no longer post new tickets from this panel.`)) return;
    try {
      await deleteTicketPanel(panelId, guildId);
      setPanels(p => p.filter(x => x.id !== panelId));
    } catch (e) { setError((e as Error).message); }
  }

  const addRole = () => {
    if (!/^\d{17,19}$/.test(newRole.trim())) return;
    setPingModal(p => p ? { ...p, roles: [...p.roles, newRole.trim()] } : null);
    setNewRole('');
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading tickets...</div>
      </div>
    </div>
  );

  return (
    <div className="animate-fade">
      {error && (
        <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {/* Notification Roles panel — only shown when panels exist */}
      {panels.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={14} style={{ color: 'var(--primary)' }} />
            Ticket Panel Notification Roles
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 14 }}>
            Configure extra roles pinged when a ticket opens (on top of your env-file MOD/ADMIN roles).
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {panels.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--elevated)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {p.notificationRoles.length === 0
                      ? <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No additional roles configured</span>
                      : p.notificationRoles.map((r, i) => (
                        <code key={i} style={{ fontSize: 11, background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 4, padding: '2px 7px' }}>{r}</code>
                      ))
                    }
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPingModal({ panelId: p.id, name: p.name, roles: [...p.notificationRoles] })}
                  >
                    Configure
                  </button>
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => delPanel(p.id, p.name)}
                    title="Delete panel"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <Filter size={14} style={{ color: 'var(--text-muted)', alignSelf: 'center' }} />
        {(['all', 'open', 'claimed', 'closed'] as const).map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid',
            borderColor: filter === s ? 'var(--primary)' : 'var(--border)',
            background: filter === s ? 'var(--primary-subtle)' : 'transparent',
            color: filter === s ? '#818cf8' : 'var(--text-muted)',
            fontSize: 13, fontFamily: 'Lexend', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            <span style={{
              background: filter === s ? 'var(--primary)' : 'var(--elevated)',
              color: filter === s ? 'white' : 'var(--text-muted)',
              borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600,
            }}>{counts[s]}</span>
          </button>
        ))}
      </div>

      {/* Tickets table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Title', 'User', 'Priority', 'Category', 'Messages', 'Opened', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <Ticket size={28} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />
                    <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                      {filter !== 'all' ? `No ${filter} tickets` : 'No tickets in this server'}
                    </div>
                  </div>
                </td>
              </tr>
            ) : filtered.map(t => (
              <tr key={t.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>{t.channel_id}</div>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ fontSize: 13 }}>{t.username}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>{t.user_id}</div>
                </td>
                <td style={{ padding: '11px 14px' }}><Badge label={t.priority} variant={priorityVariant(t.priority)} /></td>
                <td style={{ padding: '11px 14px' }}><Badge label={t.category} variant="muted" /></td>
                <td style={{ padding: '11px 14px' }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.messages_count}</span>
                </td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(t.opened_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '11px 14px' }}><Badge label={t.status} variant={statusVariant(t.status)} /></td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {t.status !== 'open'   && <button className="btn btn-success btn-sm" onClick={() => changeStatus(t.id, 'open')}>Open</button>}
                    {t.status !== 'closed' && <button className="btn btn-ghost btn-sm"   onClick={() => changeStatus(t.id, 'closed')}>Close</button>}
                    <button className="btn btn-danger btn-sm" onClick={() => del(t.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Ping roles modal — INSIDE the root div */}
      {pingModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 100, padding: 'clamp(24px, 6vh, 72px) 16px 32px', overflowY: 'auto' }}>
          <div style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: 440, maxWidth: '90vw' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Notification Roles</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>Panel: <strong>{pingModal.name}</strong></div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Role IDs to ping when a ticket opens:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, minHeight: 32 }}>
              {pingModal.roles.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--primary-subtle)', border: '1px solid #4f46e5', borderRadius: 6, padding: '3px 8px' }}>
                  <code style={{ fontSize: 11, color: '#818cf8' }}>{r}</code>
                  <button
                    onClick={() => setPingModal(p => p ? { ...p, roles: p.roles.filter((_, j) => j !== i) } : null)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#818cf8', padding: 0, lineHeight: 1, display: 'flex' }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              {pingModal.roles.length === 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No roles added yet</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                className="inp"
                style={{ flex: 1, fontSize: 12 }}
                placeholder="Role ID (17–19 digits)"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addRole(); }}
              />
              <button className="btn btn-primary btn-sm" disabled={!/^\d{17,19}$/.test(newRole.trim())} onClick={addRole}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 18 }}>
              These are pinged in addition to MOD_ROLE_IDS / ADMIN_ROLE_IDS set in your bot's .env file.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => { setPingModal(null); setNewRole(''); }}>Cancel</button>
              <button className="btn btn-primary" onClick={savePingRoles} disabled={savingPing}>
                {savingPing ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Votes ────────────────────────────────────────────────────────────────────


interface VoteResult { option: string; count: number; total_weight: number; }
interface VoterRow  { user_id: string; option: string; timestamp: string; username?: string; }

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
        <span>{label}</span><span>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--elevated)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

function VotesTab({ guildId }: Props) {
  const [votes, setVotes]           = useState<Vote[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [question, setQuestion]     = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [channelId, setChannelId]   = useState('');
  const [duration, setDuration]     = useState('1440');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  // Per-vote expanded state
  const [expanded, setExpanded]      = useState<Record<string, boolean>>({});
  const [results, setResults]        = useState<Record<string, VoteResult[]>>({});
  const [voters, setVoters]          = useState<Record<string, VoterRow[]>>({});
  const [loadingResult, setLoadingResult] = useState<Record<string, boolean>>({});

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getVotes(guildId)
      .then(setVotes)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  async function toggleExpand(v: Vote) {
    const key = String(v.vote_id ?? v.id);
    const next = !expanded[key];
    setExpanded(p => ({ ...p, [key]: next }));
    if (next && !results[key]) {
      setLoadingResult(p => ({ ...p, [key]: true }));
      try {
        const [res, vtr] = await Promise.all([
          apiCall<VoteResult[]>('getVoteResults', { voteId: key }),
          apiCall<VoterRow[]>('getVoteVoters', { guildId, voteId: key }),
        ]);
        setResults(p => ({ ...p, [key]: res }));
        setVoters(p => ({ ...p, [key]: vtr }));
      } catch { /* ignore */ }
      finally { setLoadingResult(p => ({ ...p, [key]: false })); }
    }
  }

  async function submit() {
    if (!question.trim()) return;
    const options = optionsText.split('\n').map(s => s.trim()).filter(Boolean);
    if (options.length < 2) { setError('At least 2 options required'); return; }
    if (options.length > 5) { setError('Maximum 5 options'); return; }
    if (channelId.trim() && !/^\d{17,19}$/.test(channelId.trim())) {
      setError('Channel ID must be 17–19 digits'); return;
    }
    const dur = parseInt(duration);
    if (isNaN(dur) || dur < 1 || dur > 43200) {
      setError('Duration: 1–43200 minutes'); return;
    }
    setSaving(true); setError('');
    try {
      await createVote({
        guild_id: guildId, question: question.trim(),
        options, channel_id: channelId.trim() || undefined,
        duration_minutes: dur,
      });
      setModal(false); setQuestion(''); setOptionsText(''); setChannelId(''); setDuration('1440');
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function del(v: Vote) {
    if (!confirm('Delete this vote and all cast votes?')) return;
    try {
      await deleteVote(String(v.vote_id ?? v.id));
      setVotes(p => p.filter(x => (x.vote_id ?? x.id) !== (v.vote_id ?? v.id)));
    } catch (e) { setError((e as Error).message); }
  }

  function voteStatus(v: Vote): { label: string; variant: 'success' | 'warning' | 'muted' } {
    if (v.results_posted) return { label: 'ended', variant: 'muted' };
    if (v.end_time && new Date(v.end_time) < new Date()) return { label: 'expired', variant: 'warning' };
    return { label: 'active', variant: 'success' };
  }

  function timeLeft(endTime?: string) {
    if (!endTime) return null;
    const diff = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) return 'Ended';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '< 1m';
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setModal(true)}>
          <Plus size={14} /> Create Vote
        </button>
      </div>

      {votes.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '60px 20px', textAlign: 'center' }}>
          <BarChart2 size={32} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>No votes yet</div>
          <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={14} /> Create First Vote</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {votes.map(v => {
            const key = String(v.vote_id ?? v.id);
            const { label, variant } = voteStatus(v);
            const opts = Array.isArray(v.options) ? v.options as string[] : [];
            const isExpanded = expanded[key];
            const voteResults = results[key] ?? [];
            const voteVoters  = voters[key] ?? [];
            const total = voteResults.reduce((s, r) => s + r.count, 0);
            const byOption: Record<string, VoterRow[]> = {};
            voteVoters.forEach(vr => {
              byOption[vr.option] = byOption[vr.option] ?? [];
              byOption[vr.option].push(vr);
            });

            return (
              <div key={key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <Badge label={label} variant={variant} />
                        {v.end_time && (
                          <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={11} /> {timeLeft(v.end_time)}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Users size={11} /> {total} vote{total !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
                        {v.question || 'Untitled Vote'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {opts.map((opt, i) => (
                          <div key={i} style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                            {String(opt)}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleExpand(v)}
                        title="View results & voters"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        Results
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(v)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-faint)' }}>
                    Created {new Date(v.created_at).toLocaleDateString()}
                    {v.channel_id && <> · Channel: <code style={{ fontSize: 10 }}>{v.channel_id}</code></>}
                  </div>
                </div>

                {/* Expanded results + voter details */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '18px 20px', background: 'var(--bg)' }}>
                    {loadingResult[key] ? (
                      <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</div>
                    ) : (
                      <>
                        {/* Results bars */}
                        <div style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Results</div>
                          {voteResults.length === 0 ? (
                            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No votes cast yet.</div>
                          ) : (
                            voteResults.map(r => (
                              <ProgressBar
                                key={r.option}
                                label={`${r.option} (${r.count} vote${r.count !== 1 ? 's' : ''})`}
                                pct={total ? (r.count / total) * 100 : 0}
                              />
                            ))
                          )}
                        </div>

                        {/* Voter breakdown — per option */}
                        {voteVoters.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Voter Details <span style={{ fontWeight: 400, color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0 }}>(dashboard-only — Discord votes are anonymous)</span>
                            </div>
                            {Object.entries(byOption).map(([opt, rows]) => (
                              <div key={opt} style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                                  {opt} <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({rows.length})</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {rows.map((vr, i) => (
                                    <div key={i} style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                                      {vr.username || vr.user_id}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title="Create Vote" onClose={() => setModal(false)} width="540px">
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Question *</label>
            <input className="inp" placeholder="What should we do?" value={question} onChange={e => setQuestion(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Channel ID <span style={{ color: 'var(--text-faint)' }}>(optional)</span></label>
              <input className="inp" placeholder="123456789…" value={channelId} onChange={e => setChannelId(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Duration (minutes) *</label>
              <input className="inp" type="number" min="1" max="43200" placeholder="1440" value={duration} onChange={e => setDuration(e.target.value)} />
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>1440 = 24h · 10080 = 7 days</div>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Options — one per line * (max 5)</label>
            <textarea className="inp" style={{ minHeight: 100 }} placeholder={'Option A\nOption B\nOption C'} value={optionsText} onChange={e => setOptionsText(e.target.value)} />
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !question.trim()}>
              {saving ? 'Creating…' : 'Create Vote'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}


// ─── Merged Shell ─────────────────────────────────────────────────────────────
export default function RolesTicketsVotes({ guildId }: { guildId: string }) {
  type Tab = 'roles' | 'tickets' | 'votes';
  const [tab, setTab] = useState<Tab>('roles');

  const TABS: [Tab, string, typeof Tag][] = [
    ['roles',   'Roles',   Tag],
    ['tickets', 'Tickets', Ticket],
    ['votes',   'Votes',   BarChart2],
  ];

  return (
    <div className="animate-fade">
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, marginBottom: 16, width: 'fit-content' }}>
        {TABS.map(([t, label, Icon]) => (
          <button key={t} style={TAB_BTN(tab === t)} onClick={() => setTab(t)}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>
      {tab === 'roles'   && <RolesTab   guildId={guildId} />}
      {tab === 'tickets' && <TicketsTab guildId={guildId} />}
      {tab === 'votes'   && <VotesTab   guildId={guildId} />}
    </div>
  );
}

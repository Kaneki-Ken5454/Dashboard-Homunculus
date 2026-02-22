import { useEffect, useState } from 'react';
import { Ticket, Filter, Bell, Plus, X } from 'lucide-react';
import { apiCall } from '../lib/db';
import { getTickets, updateTicketStatus, deleteTicket, type Ticket as TicketType } from '../lib/db';
import Badge from '../components/Badge';

interface Props { guildId: string; }

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

export default function Tickets({ guildId }: Props) {
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  const load = async () => {
    if (!guildId) return;
    setLoading(true); setError('');
    try {
      console.log(`Loading tickets for guild: ${guildId}`);
      const tickets = await getTickets(guildId);
      console.log(`Loaded ${tickets.length} tickets`);
      setTickets(tickets);
    } catch (e) {
      console.error('Error loading tickets:', e);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [guildId]);

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter);

  const counts = {
    all: tickets.length,
    open: tickets.filter(t => t.status === 'open').length,
    claimed: tickets.filter(t => t.status === 'claimed').length,
    closed: tickets.filter(t => t.status === 'closed').length,
  };

  async function changeStatus(id: string, status: string) {
    try {
      console.log(`Updating ticket ${id} status to: ${status}`);
      await updateTicketStatus(id, status);
      await load(); // Reload data
    } catch (e) {
      console.error('Error updating ticket status:', e);
      setError((e as Error).message);
    }
  }

  async function del(id: string) {
    if (!confirm('Delete this ticket permanently?')) return;
    try {
      console.log(`Deleting ticket: ${id}`);
      await deleteTicket(id);
      await load(); // Reload data
    } catch (e) {
      console.error('Error deleting ticket:', e);
      setError((e as Error).message);
    }
  }

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
      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {/* Notification Roles section */}
      {panels.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px', marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={14} style={{ color: 'var(--primary)' }} />
            Ticket Panel Notification Roles
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 14 }}>
            Configure which roles get pinged (beyond the default staff roles) when a ticket is opened in each panel.
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {panels.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--elevated)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 4 }}>{p.name}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {p.notificationRoles.length === 0 ? (
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>No additional notification roles</span>
                    ) : p.notificationRoles.map((r, i) => (
                      <code key={i} style={{ fontSize: 11, background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 4, padding: '2px 7px' }}>@{r}</code>
                    ))}
                  </div>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => setPingModal({ panelId: p.id, name: p.name, roles: [...p.notificationRoles] })}>
                  Configure
                </button>
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
                      {filter !== 'all' 
                        ? `No ${filter} tickets found` 
                        : 'No tickets in this server'
                      }
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
                    {t.status !== 'open' && <button className="btn btn-success btn-sm" onClick={() => changeStatus(t.id, 'open')}>Open</button>}
                    {t.status !== 'closed' && <button className="btn btn-ghost btn-sm" onClick={() => changeStatus(t.id, 'closed')}>Close</button>}
                    <button className="btn btn-danger btn-sm" onClick={() => del(t.id)}>Del</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>

      {/* Ping roles modal */}
      {pingModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: 440, maxWidth: '90vw' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Notification Roles</div>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginBottom: 16 }}>Panel: {pingModal.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Role IDs to ping when a ticket opens:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12, minHeight: 32 }}>
              {pingModal.roles.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--primary-subtle)', border: '1px solid #4f46e5', borderRadius: 6, padding: '3px 8px' }}>
                  <code style={{ fontSize: 11, color: '#818cf8' }}>{r}</code>
                  <button onClick={() => setPingModal(p => p ? { ...p, roles: p.roles.filter((_, j) => j !== i) } : null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#818cf8', padding: 0, lineHeight: 1 }}>
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <input className="inp" style={{ flex: 1, fontSize: 12 }} placeholder="Role ID (17–19 digits)" value={newRole} onChange={e => setNewRole(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && /^\d{17,19}$/.test(newRole.trim())) { setPingModal(p => p ? { ...p, roles: [...p.roles, newRole.trim()] } : null); setNewRole(''); } }} />
              <button className="btn btn-primary btn-sm" disabled={!/^\d{17,19}$/.test(newRole.trim())} onClick={() => { if (/^\d{17,19}$/.test(newRole.trim())) { setPingModal(p => p ? { ...p, roles: [...p.roles, newRole.trim()] } : null); setNewRole(''); } }}>
                <Plus size={12} /> Add
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 18 }}>These roles will be mentioned in addition to your server's MOD_ROLE_IDS / ADMIN_ROLE_IDS configured in .env</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setPingModal(null)}>Cancel</button>
              <button className="btn btn-primary" onClick={savePingRoles} disabled={savingPing}>{savingPing ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
  );
}

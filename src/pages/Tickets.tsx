import { useEffect, useState } from 'react';
import { Ticket, Filter } from 'lucide-react';
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
  );
}

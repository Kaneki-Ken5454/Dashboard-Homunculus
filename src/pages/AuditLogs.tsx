import { useEffect, useState } from 'react';
import { Shield, Trash2, Search, Filter, Bot, User } from 'lucide-react';
import { getAuditLogs, deleteAuditLog, type AuditLog } from '../lib/db';
import Badge from '../components/Badge';

interface Props { guildId: string; }

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}

const ACTION_TYPES = ['all', 'ban', 'kick', 'warn', 'mute', 'delete', 'create', 'update', 'join'] as const;

export default function AuditLogs({ guildId }: Props) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [botFilter, setBotFilter] = useState<'all' | 'bot' | 'user'>('all');

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getAuditLogs(guildId)
      .then(setLogs)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  async function delLog(id: string) {
    try { await deleteAuditLog(id); setLogs(prev => prev.filter(l => l.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }

  const actionVariant = (type: string): 'danger' | 'warning' | 'success' | 'primary' | 'muted' => {
    if (type.includes('ban') || type.includes('kick') || type.includes('delete')) return 'danger';
    if (type.includes('warn') || type.includes('mute')) return 'warning';
    if (type.includes('create') || type.includes('add') || type.includes('join')) return 'success';
    if (type.includes('update') || type.includes('edit')) return 'primary';
    return 'muted';
  };

  const filtered = logs.filter(log => {
    if (actionFilter !== 'all' && !log.action_type.toLowerCase().includes(actionFilter)) return false;
    if (botFilter === 'bot' && !log.bot_action) return false;
    if (botFilter === 'user' && log.bot_action) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (log.user_id ?? '').toLowerCase().includes(q) ||
        (log.moderator_id ?? '').toLowerCase().includes(q) ||
        (log.reason ?? '').toLowerCase().includes(q) ||
        log.action_type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Compute stats
  const actionCounts = logs.reduce<Record<string, number>>((acc, l) => {
    const key = l.action_type.split('_')[0] || l.action_type;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topActions = Object.entries(actionCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const botCount = logs.filter(l => l.bot_action).length;

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80 }} />)}
      </div>
      {[1,2,3,4,5].map(i => <div key={i} className="skeleton" style={{ height: 52 }} />)}
    </div>
  );

  return (
    <div className="animate-fade">
      <p className="page-description">Complete audit trail of all moderation actions, user events, and bot operations in your server.</p>

      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="stat-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Total Logs</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{logs.length}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Bot Actions</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--info)' }}>{botCount}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>User Actions</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{logs.length - botCount}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Top Action</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {topActions.length > 0 ? <Badge label={topActions[0][0]} variant={actionVariant(topActions[0][0])} /> : <span style={{ color: 'var(--text-faint)' }}>N/A</span>}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input className="inp" style={{ paddingLeft: 32 }} placeholder="Search by user, moderator, reason..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          <select className="inp" style={{ width: 'auto', fontSize: 12, padding: '6px 10px' }} value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
            {ACTION_TYPES.map(a => (
              <option key={a} value={a}>{a === 'all' ? 'All Actions' : a.charAt(0).toUpperCase() + a.slice(1)}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 3 }}>
          {(['all', 'user', 'bot'] as const).map(f => (
            <button key={f} onClick={() => setBotFilter(f)} style={{
              padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: botFilter === f ? 'var(--elevated)' : 'transparent',
              color: botFilter === f ? 'var(--text)' : 'var(--text-muted)',
              fontSize: 12, fontFamily: 'Lexend', display: 'flex', alignItems: 'center', gap: 4,
            }}>
              {f === 'bot' && <Bot size={11} />}
              {f === 'user' && <User size={11} />}
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>{filtered.length} results</div>
      </div>

      {/* Table */}
      <div className="card">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }} className="table-header">
              <th>Action</th>
              <th>User</th>
              <th>Moderator</th>
              <th>Reason</th>
              <th>Source</th>
              <th>Time</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7}>
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <Shield size={28} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />
                  <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    {logs.length === 0 ? 'No audit logs recorded' : 'No logs match your filters'}
                  </div>
                </div>
              </td></tr>
            ) : filtered.map(log => (
              <tr key={log.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px' }}>
                  <Badge label={log.action_type.replace(/_/g, ' ')} variant={actionVariant(log.action_type)} />
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.user_id || '\u2014'}</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.moderator_id || '\u2014'}</span>
                </td>
                <td style={{ padding: '10px 14px', maxWidth: 240 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                    {log.reason || '\u2014'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {log.bot_action ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--info)' }}><Bot size={11} /> Bot</span>
                  ) : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}><User size={11} /> User</span>
                  )}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {timeAgo(log.created_at)}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <button className="btn btn-danger btn-sm" onClick={() => delLog(log.id)}><Trash2 size={11} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

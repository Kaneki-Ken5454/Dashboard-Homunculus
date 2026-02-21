import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, Search, Filter } from 'lucide-react';
import { getWarns, deleteWarn, type WarnEntry } from '../lib/db';
import Badge from '../components/Badge';

interface Props { guildId: string; }

const SEVERITY_OPTIONS = ['all', 'low', 'medium', 'high'] as const;

export default function Warnings({ guildId }: Props) {
  const [warns, setWarns] = useState<WarnEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getWarns(guildId)
      .then(setWarns)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  async function delWarn(id: string) {
    try { await deleteWarn(id); setWarns(prev => prev.filter(w => w.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }

  const severityVariant = (s: string): 'danger' | 'warning' | 'muted' =>
    s === 'high' ? 'danger' : s === 'medium' ? 'warning' : 'muted';

  const filtered = warns.filter(w => {
    if (severityFilter !== 'all' && w.severity !== severityFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        w.user_id.toLowerCase().includes(q) ||
        w.moderator_id.toLowerCase().includes(q) ||
        (w.reason ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Stats
  const severityCounts = { low: 0, medium: 0, high: 0 };
  warns.forEach(w => {
    const s = w.severity as keyof typeof severityCounts;
    if (s in severityCounts) severityCounts[s]++;
  });
  const uniqueUsers = new Set(warns.map(w => w.user_id)).size;

  // Most warned users
  const userWarnCounts = warns.reduce<Record<string, number>>((acc, w) => {
    acc[w.user_id] = (acc[w.user_id] || 0) + 1;
    return acc;
  }, {});
  const topWarned = Object.entries(userWarnCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

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
      <p className="page-description">Track and manage user warnings across your server. Filter by severity, search by user or moderator, and monitor warning trends.</p>

      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {/* Stats cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="stat-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Total Warnings</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{warns.length}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>High Severity</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--danger)' }}>{severityCounts.high}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Medium Severity</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--warning)' }}>{severityCounts.medium}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Warned Users</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{uniqueUsers}</div>
        </div>
      </div>

      {/* Most warned users */}
      {topWarned.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>Most Warned Users</span>
          </div>
          <div style={{ padding: '12px 20px', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {topWarned.map(([userId, count]) => (
              <button key={userId} onClick={() => setSearch(userId)} style={{
                background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                color: 'var(--text)',
              }}>
                <span className="mono" style={{ fontSize: 12 }}>{userId}</span>
                <span style={{
                  background: count >= 3 ? 'var(--danger-subtle)' : 'var(--warning-subtle)',
                  color: count >= 3 ? 'var(--danger)' : 'var(--warning)',
                  borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600,
                }}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input className="inp" style={{ paddingLeft: 32 }} placeholder="Search by user ID, moderator, or reason..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Filter size={13} style={{ color: 'var(--text-muted)' }} />
          {SEVERITY_OPTIONS.map(s => (
            <button key={s} onClick={() => setSeverityFilter(s)} style={{
              padding: '5px 12px', borderRadius: 8, border: '1px solid',
              borderColor: severityFilter === s ? 'var(--primary)' : 'var(--border)',
              background: severityFilter === s ? 'var(--primary-subtle)' : 'transparent',
              color: severityFilter === s ? '#818cf8' : 'var(--text-muted)',
              fontSize: 12, fontFamily: 'Lexend', cursor: 'pointer',
            }}>
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
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
              <th>User ID</th>
              <th>Moderator</th>
              <th>Severity</th>
              <th>Reason</th>
              <th>Date</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6}>
                <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                  <AlertTriangle size={28} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />
                  <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>
                    {warns.length === 0 ? 'No warnings recorded' : 'No warnings match your filters'}
                  </div>
                </div>
              </td></tr>
            ) : filtered.map(w => (
              <tr key={w.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 14px' }}>
                  <span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>{w.user_id}</span>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{w.moderator_id}</span>
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <Badge label={w.severity} variant={severityVariant(w.severity)} />
                </td>
                <td style={{ padding: '11px 14px', maxWidth: 280 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                    {w.reason || '\u2014'}
                  </span>
                </td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {new Date(w.created_at).toLocaleDateString()}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <button className="btn btn-danger btn-sm" onClick={() => delWarn(w.id)}><Trash2 size={11} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

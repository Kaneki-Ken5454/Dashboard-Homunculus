import { useEffect, useState } from 'react';
import { Trophy, MessageSquare, Users, Clock, TrendingUp, RefreshCw } from 'lucide-react';
import { getLeaderboard, getActivityStats, type ActivityMember, type ActivityStats } from '../lib/db';

interface Props { guildId: string; }

const TROPHY_ICONS = ['🥇', '🥈', '🥉'];
const BAR_W = 120;

function Bar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: BAR_W, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,var(--primary),hsl(239,84%,70%))', borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 42 }}>{count.toLocaleString()}</span>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} style={{ color }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{typeof value === 'number' ? value.toLocaleString() : value}</div>
    </div>
  );
}

export default function Activity({ guildId }: Props) {
  const [members, setMembers] = useState<ActivityMember[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit, setLimit] = useState(25);
  const [error, setError] = useState('');

  const load = () => {
    if (!guildId) return;
    setLoading(true); setError('');
    Promise.all([getLeaderboard(guildId, limit), getActivityStats(guildId)])
      .then(([m, s]) => { setMembers(m); setStats(s); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId, limit]);

  const maxMsgs = members[0]?.message_count ?? 1;

  const formatDate = (d: string) => {
    try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch { return '—'; }
  };

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

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Total Messages" value={stats.totalMsgs} icon={MessageSquare} color="var(--primary)" />
          <StatCard label="Active Members" value={stats.activeAll} icon={Users} color="#22c55e" />
          <StatCard label="Active (7 days)" value={stats.active7d} icon={TrendingUp} color="#f59e0b" />
          <StatCard label="Active (24h)" value={stats.active24h} icon={Clock} color="#ec4899" />
        </div>
      )}

      {/* Leaderboard */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={16} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Activity Leaderboard</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--elevated)', padding: '2px 8px', borderRadius: 6 }}>
              {members.length} members
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              className="inp"
              style={{ padding: '5px 10px', fontSize: 12, width: 'auto' }}
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
            >
              {[10, 25, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={load} title="Refresh">
              <RefreshCw size={13} />
            </button>
          </div>
        </div>

        {members.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <Trophy size={28} style={{ color: 'var(--text-faint)', marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No activity data yet</div>
            <div style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 4 }}>Members need to send messages first</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Rank', 'Member', 'Messages', 'Last Active'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.user_id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 16px', width: 60 }}>
                    {i < 3
                      ? <span style={{ fontSize: 18 }}>{TROPHY_ICONS[i]}</span>
                      : <span className="mono" style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>#{i + 1}</span>
                    }
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{m.username || `User ${m.user_id.slice(-4)}`}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{m.user_id}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Bar count={m.message_count} max={maxMsgs} />
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{formatDate(m.last_active)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

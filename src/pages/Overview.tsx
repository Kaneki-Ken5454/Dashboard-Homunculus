import { useEffect, useState } from 'react';
import { Users, Terminal, Ticket, Shield, Zap, AlertTriangle, BarChart2, MessageSquare } from 'lucide-react';
import { getDashboardStats, getRecentActivity, type AuditLog } from '../lib/db';
import Badge from '../components/Badge';

interface Props { guildId: string; }

interface Stats {
  memberCount: number; commandCount: number; ticketCount: number;
  auditCount: number; triggerCount: number; warnCount: number;
  autoRespCount: number; voteCount: number;
}

function fmt(n: number) { return n.toLocaleString(); }
function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Overview({ guildId }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [activity, setActivity] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!guildId) return;
    setLoading(true); setError('');
    Promise.all([getDashboardStats(guildId), getRecentActivity(guildId)])
      .then(([s, a]) => { setStats(s); setActivity(a); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [guildId]);

  const statCards = stats ? [
    { label: 'Members', value: fmt(stats.memberCount), icon: Users, color: '#5865f2' },
    { label: 'Commands', value: fmt(stats.commandCount), icon: Terminal, color: '#3ba55d' },
    { label: 'Tickets', value: fmt(stats.ticketCount), icon: Ticket, color: '#faa81a' },
    { label: 'Audit Logs', value: fmt(stats.auditCount), icon: Shield, color: '#9b59b6' },
    { label: 'Triggers', value: fmt(stats.triggerCount), icon: Zap, color: '#e91e63' },
    { label: 'Warns', value: fmt(stats.warnCount), icon: AlertTriangle, color: '#ed4245' },
    { label: 'Auto Responses', value: fmt(stats.autoRespCount), icon: MessageSquare, color: '#1abc9c' },
    { label: 'Votes', value: fmt(stats.voteCount), icon: BarChart2, color: '#f39c12' },
  ] : [];

  function actionVariant(type: string): 'danger' | 'warning' | 'success' | 'primary' | 'muted' {
    if (type.includes('ban') || type.includes('kick')) return 'danger';
    if (type.includes('warn') || type.includes('mute')) return 'warning';
    if (type.includes('create') || type.includes('add')) return 'success';
    return 'muted';
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  if (error) return (
    <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '16px 20px', color: 'var(--danger)', fontSize: 14 }}>
      {error}
    </div>
  );

  return (
    <div className="animate-fade">
      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 28 }}>
        {statCards.map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${color}22` }}>
                <Icon size={16} style={{ color }} />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text)' }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Recent activity */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Recent Activity</span>
        </div>
        {activity.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No activity logged yet
          </div>
        ) : (
          <div>
            {activity.map((log, i) => (
              <div key={log.id} className="data-row" style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '12px 20px',
                borderBottom: i < activity.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <Badge label={log.action_type.replace(/_/g, ' ')} variant={actionVariant(log.action_type)} />
                <span style={{ fontSize: 13, color: 'var(--text-muted)', flex: 1 }}>
                  {log.user_id && <span className="mono" style={{ color: 'var(--text)', marginRight: 4 }}>{log.user_id}</span>}
                  {log.reason && <span style={{ color: 'var(--text-muted)' }}>— {log.reason}</span>}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>{timeAgo(log.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

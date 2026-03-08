import { useEffect, useState } from 'react';
import { Trophy, MessageSquare, Users, Clock, TrendingUp, RefreshCw, ChevronDown, ChevronUp, Mic, MicOff } from 'lucide-react';
import { getLeaderboard, getActivityStats, apiCall as query, type ActivityMember, type ActivityStats } from '../lib/db';

interface Props { guildId: string; }

const TROPHY_ICONS = ['#1', '#2', '#3'];
const BAR_W = 120;

interface VCMember {
  user_id: string;
  username: string;
  avatar_url: string | null;
  total_seconds: number;
  session_count: number;
  last_active: string | null;
  last_left: string | null;
}
interface VCStats {
  members: number;
  totalSecs: number;
  active24h: number;
  active7d: number;
}

function fmtDur(s: number): string {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

function Bar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: BAR_W, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#5865f2,#7983f5)', borderRadius: 3, transition: 'width 0.4s ease' }} />
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

  const [vcMembers, setVcMembers] = useState<VCMember[]>([]);
  const [vcStats, setVcStats] = useState<VCStats | null>(null);
  const [vcLoading, setVcLoading] = useState(false);
  const [vcExpanded, setVcExpanded] = useState(true);
  const [vcLimit, setVcLimit] = useState(25);

  const load = async () => {
    if (!guildId) return;
    setLoading(true);
    setError('');
    try {
      const [m, s] = await Promise.all([getLeaderboard(guildId, limit), getActivityStats(guildId)]);
      setMembers(Array.isArray(m) ? m : []);
      setStats(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [guildId, limit]);

  const loadVC = async (lim = vcLimit) => {
    if (!guildId) return;
    setVcLoading(true);
    try {
      const [membersData, statsData] = await Promise.all([
        query<VCMember[]>('getVCLeaderboard', { guildId, limit: lim }),
        query<VCStats>('getVCStats', { guildId }),
      ]);
      setVcMembers(Array.isArray(membersData) ? membersData : []);
      setVcStats(statsData);
    } catch {
      setVcMembers([]);
      setVcStats(null);
    } finally {
      setVcLoading(false);
    }
  };

  useEffect(() => {
    void loadVC();
  }, [guildId]);

  const maxMsgs = members[0]?.message_count ?? 1;
  const fmt = (d: string | null) => {
    if (!d) return '-';
    try {
      return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '-';
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'grid', gap: 16 }}>
      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13 }}>{error}</div>}

      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard label="Total Messages" value={stats.totalMsgs} icon={MessageSquare} color="#5865f2" />
          <StatCard label="Active Members" value={stats.activeAll} icon={Users} color="#22c55e" />
          <StatCard label="Active (7 days)" value={stats.active7d} icon={TrendingUp} color="#f59e0b" />
          <StatCard label="Active (24h)" value={stats.active24h} icon={Clock} color="#ec4899" />
        </div>
      )}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Trophy size={15} style={{ color: '#f59e0b' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Message Leaderboard</span>
          </div>
          <button onClick={() => { void load(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4 }}>
            <RefreshCw size={12} />
          </button>
        </div>

        {members.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No activity data found for this guild.</div>
        ) : (
          <>
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
                    <td style={{ padding: '10px 16px', width: 60 }}>
                      {i < 3 ? <span style={{ fontSize: 18 }}>{TROPHY_ICONS[i]}</span> : <span className="mono" style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>#{i + 1}</span>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.username || `User ${m.user_id.slice(-4)}`}</div>
                      <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>{m.user_id}</div>
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <Bar count={m.message_count} max={maxMsgs} />
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(m.last_active)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '10px 20px', display: 'flex', gap: 6, borderTop: '1px solid var(--border)' }}>
              {[10, 25, 50].map(n => (
                <button key={n} onClick={() => setLimit(n)} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: limit === n ? 'rgba(88,101,242,.22)' : 'transparent', color: limit === n ? '#818cf8' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontFamily: "'Lexend',sans-serif" }}>Top {n}</button>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ borderBottom: '1px solid var(--border)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button onClick={() => setVcExpanded(o => !o)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 10, color: 'inherit' }}>
            <Mic size={15} style={{ color: '#a78bfa' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Voice Channel Leaderboard</span>
            {vcStats && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{vcStats.members} members tracked</span>}
            {vcExpanded ? <ChevronUp size={14} style={{ color: 'var(--text-faint)' }} /> : <ChevronDown size={14} style={{ color: 'var(--text-faint)' }} />}
          </button>
          <button onClick={() => { void loadVC(); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4 }}>
            <RefreshCw size={12} />
          </button>
        </div>

        {vcExpanded && (
          <div>
            {vcLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} /></div>
            ) : vcMembers.length === 0 ? (
              <div style={{ padding: '50px 20px', textAlign: 'center' }}>
                <MicOff size={28} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No VC activity data yet</div>
              </div>
            ) : (
              <>
                {vcStats && (
                  <div style={{ display: 'flex', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    {[
                      { l: 'Total VC Time', v: fmtDur(vcStats.totalSecs), c: '#a78bfa' },
                      { l: 'Active (7d)', v: vcStats.active7d.toString(), c: 'var(--success)' },
                      { l: 'Active (24h)', v: vcStats.active24h.toString(), c: 'var(--warning)' },
                    ].map(({ l, v, c }) => (
                      <div key={l} style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', minWidth: 110 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{l}</div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: c, fontFamily: "'JetBrains Mono',monospace" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Rank', 'Member', 'VC Time', 'Sessions', 'Last Active'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vcMembers.map((m, i) => (
                      <tr key={m.user_id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 16px', width: 60 }}>
                          {i < 3 ? <span style={{ fontSize: 18 }}>{TROPHY_ICONS[i]}</span> : <span className="mono" style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>#{i + 1}</span>}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {m.avatar_url ? <img src={m.avatar_url} alt="" style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} /> : <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#5865f2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: '#fff', fontWeight: 700, flexShrink: 0 }}>{(m.username || '?')[0].toUpperCase()}</div>}
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.username || `User ${m.user_id.slice(-4)}`}</div>
                              <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>{m.user_id}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 80, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(100, (m.total_seconds / (vcMembers[0]?.total_seconds || 1)) * 100)}%`, height: '100%', background: 'linear-gradient(90deg,#7c3aed,#a78bfa)', borderRadius: 3 }} />
                            </div>
                            <span className="mono" style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600 }}>{fmtDur(m.total_seconds)}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}><span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.session_count}</span></td>
                        <td style={{ padding: '10px 16px' }}><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(m.last_active)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '10px 20px', display: 'flex', gap: 6, borderTop: '1px solid var(--border)' }}>
                  {[10, 25, 50].map(n => (
                    <button key={n} onClick={() => { setVcLimit(n); void loadVC(n); }} style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: vcLimit === n ? 'rgba(124,58,237,.25)' : 'transparent', color: vcLimit === n ? '#a78bfa' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontFamily: "'Lexend',sans-serif" }}>Top {n}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

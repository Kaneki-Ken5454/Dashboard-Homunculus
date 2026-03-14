import { useEffect, useState } from 'react';
import {
  Trophy, MessageSquare, Users, Clock, TrendingUp,
  RefreshCw, ChevronDown, ChevronUp, Mic, MicOff, AlertCircle,
} from 'lucide-react';
import {
  getLeaderboard, getActivityStats, getVCLeaderboard, getVCStats,
  type ActivityMember, type ActivityStats, type VCMember, type VCStats,
} from '../lib/db';

interface Props { guildId: string; }
const TROPHY_ICONS = ['🥇', '🥈', '🥉'];
const BAR_W = 120;

function fmtDur(s: number) {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}
function fmt(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function Bar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: BAR_W, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#5865f2,#7983f5)', borderRadius: 3, transition: 'width 0.4s' }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 42 }}>{count.toLocaleString()}</span>
    </div>
  );
}
function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, flex: '1 1 160px', minWidth: 140 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', fontFamily: "'JetBrains Mono',monospace" }}>{value.toLocaleString()}</div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{label}</div>
      </div>
    </div>
  );
}

function Avatar({ url, size = 28 }: { url: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url} alt=""
        style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: 'linear-gradient(135deg, var(--primary-subtle), var(--elevated))',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45, color: 'var(--text-faint)',
    }}>👤</div>
  );
}

function ErrorBanner({ msg, onDismiss }: { msg: string; onDismiss: () => void }) {
  return (
    <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '10px 16px', color: 'var(--danger)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
      <AlertCircle size={14} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{msg}</span>
      <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, fontSize: 16, lineHeight: 1 }}>×</button>
    </div>
  );
}

export default function ActivityPage({ guildId }: Props): JSX.Element {
  const [members, setMembers]   = useState<ActivityMember[]>([]);
  const [stats, setStats]       = useState<ActivityStats | null>(null);
  const [loading, setLoading]   = useState(false);
  const [limit, setLimit]       = useState(25);
  const [error, setError]       = useState('');

  const [vcMembers, setVcMembers] = useState<VCMember[]>([]);
  const [vcStats, setVcStats]     = useState<VCStats | null>(null);
  const [vcLoading, setVcLoading] = useState(false);
  const [vcExpanded, setVcExpanded] = useState(true);
  const [vcLimit, setVcLimit]     = useState(25);
  const [vcError, setVcError]     = useState('');

  const load = async (lim = limit) => {
    // Don't try to fetch if there's no guild selected yet
    if (!guildId) return;
    setLoading(true);
    setError('');
    try {
      const [m, s] = await Promise.all([
        getLeaderboard(guildId, lim),
        getActivityStats(guildId),
      ]);
      setMembers(m);
      setStats(s);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load message leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const loadVC = async (lim = vcLimit) => {
    if (!guildId) return;
    setVcLoading(true);
    setVcError('');
    try {
      const [m, s] = await Promise.all([
        getVCLeaderboard(guildId, lim),
        getVCStats(guildId),
      ]);
      setVcMembers(Array.isArray(m) ? m : []);
      setVcStats(s as VCStats);
    } catch (e: any) {
      setVcError(e?.message ?? 'Failed to load VC leaderboard');
    } finally {
      setVcLoading(false);
    }
  };

  // Reload when guildId becomes available or changes
  useEffect(() => {
    if (!guildId) return;
    load();
  }, [guildId]);

  useEffect(() => {
    if (!guildId) return;
    loadVC();
  }, [guildId]);

  const maxMsgs = members[0]?.message_count ?? 0;

  if (!guildId) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, gap: 12, color: 'var(--text-muted)' }}>
        <Users size={32} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 14 }}>Select a server to view activity</div>
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {error && <ErrorBanner msg={error} onDismiss={() => setError('')} />}

      {/* Stats cards */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <StatCard label="Total Messages" value={stats.totalMsgs}    icon={MessageSquare} color="#5865f2" />
          <StatCard label="Active Members" value={stats.activeAll}    icon={Users}         color="#22c55e" />
          <StatCard label="Active (7 days)" value={stats.active7d}    icon={TrendingUp}    color="#f59e0b" />
          <StatCard label="Active (24h)"   value={stats.active24h}    icon={Clock}         color="#ec4899" />
        </div>
      )}

      {/* ── Message Leaderboard ─────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Trophy size={15} style={{ color: '#f59e0b' }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Message Activity Leaderboard</span>
          {stats && <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 4 }}>{stats.totalMembers} members tracked</span>}
          <button
            onClick={() => load()}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4 }}
            title="Refresh"
          >
            <RefreshCw size={12} style={{ animation: loading ? 'spin 0.8s linear infinite' : 'none' }} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : members.length === 0 ? (
          <div style={{ padding: '50px 20px', textAlign: 'center' }}>
            <MessageSquare size={28} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No message activity yet</div>
            <div style={{ color: 'var(--text-faint)', fontSize: 11, marginTop: 4 }}>The bot tracks messages as members chat</div>
          </div>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Rank', 'Member', 'Messages', 'Last Active'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={m.user_id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', width: 60 }}>
                      {i < 3
                        ? <span style={{ fontSize: 14 }}>{TROPHY_ICONS[i]}</span>
                        : <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>#{i + 1}</span>}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <Avatar url={m.avatar_url} />
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.username}</span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px' }}><Bar count={m.message_count} max={maxMsgs} /></td>
                    <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fmt(m.last_active)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '10px 20px', display: 'flex', gap: 6, borderTop: '1px solid var(--border)' }}>
              {[10, 25, 50, 100].map(n => (
                <button key={n} onClick={() => { setLimit(n); load(n); }}
                  style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: limit === n ? 'rgba(88,101,242,.25)' : 'transparent', color: limit === n ? '#818cf8' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontFamily: "'Lexend',sans-serif" }}>
                  Top {n}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── VC Leaderboard ───────────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <button
          onClick={() => setVcExpanded(o => !o)}
          style={{ width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: "'Lexend',sans-serif" }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Mic size={15} style={{ color: '#a78bfa' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Voice Channel Leaderboard</span>
            {vcStats && <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{vcStats.members} members tracked</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              role="button"
              onClick={e => { e.stopPropagation(); loadVC(); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-faint)', padding: 4, display: 'flex' }}
            >
              <RefreshCw size={12} style={{ animation: vcLoading ? 'spin 0.8s linear infinite' : 'none' }} />
            </span>
            {vcExpanded
              ? <ChevronUp size={14} style={{ color: 'var(--text-faint)' }} />
              : <ChevronDown size={14} style={{ color: 'var(--text-faint)' }} />}
          </div>
        </button>

        {vcExpanded && (
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {vcError && (
              <div style={{ margin: '12px 20px 0' }}>
                <ErrorBanner msg={vcError} onDismiss={() => setVcError('')} />
              </div>
            )}
            {vcLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: '#a78bfa', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : vcMembers.length === 0 ? (
              <div style={{ padding: '50px 20px', textAlign: 'center' }}>
                <MicOff size={28} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No VC activity data yet</div>
                <div style={{ color: 'var(--text-faint)', fontSize: 11, marginTop: 4 }}>The bot tracks time members spend in voice channels</div>
              </div>
            ) : (
              <>
                {/* VC summary mini-cards */}
                {vcStats && (
                  <div style={{ display: 'flex', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
                    {[
                      { l: 'Total VC Time', v: fmtDur(vcStats.totalSecs), c: '#a78bfa' },
                      { l: 'Active (7d)',   v: vcStats.active7d.toString(),  c: '#22c55e' },
                      { l: 'Active (24h)',  v: vcStats.active24h.toString(), c: '#f59e0b' },
                    ].map(({ l, v, c }) => (
                      <div key={l} style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', minWidth: 110 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>{l}</div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: c, fontFamily: "'JetBrains Mono',monospace" }}>{v}</div>
                      </div>
                    ))}
                  </div>
                )}

                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Rank', 'Member', 'Total VC Time', 'Sessions', 'Last Active'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {vcMembers.map((m, i) => (
                      <tr key={m.user_id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 16px', width: 60 }}>
                          {i < 3
                            ? <span style={{ fontSize: 14 }}>{TROPHY_ICONS[i]}</span>
                            : <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>#{i + 1}</span>}
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <Avatar url={m.avatar_url} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.username}</span>
                          </div>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span style={{ fontSize: 13, fontFamily: "'JetBrains Mono',monospace", color: '#a78bfa', fontWeight: 700 }}>{fmtDur(m.total_seconds)}</span>
                        </td>
                        <td style={{ padding: '10px 16px' }}>
                          <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.session_count}</span>
                        </td>
                        <td style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{fmt(m.last_active)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '10px 20px', display: 'flex', gap: 6, borderTop: '1px solid var(--border)' }}>
                  {[10, 25, 50].map(n => (
                    <button key={n} onClick={() => { setVcLimit(n); loadVC(n); }}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: vcLimit === n ? 'rgba(124,58,237,.25)' : 'transparent', color: vcLimit === n ? '#a78bfa' : 'var(--text-muted)', cursor: 'pointer', fontSize: 11, fontFamily: "'Lexend',sans-serif" }}>
                      Top {n}
                    </button>
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
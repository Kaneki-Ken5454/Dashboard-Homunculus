import { useEffect, useState } from 'react';
import {
  Trophy, MessageSquare, Users, Clock, TrendingUp, RefreshCw,
  Terminal, ChevronDown, ChevronUp, Mic, MicOff,
} from 'lucide-react';
import {
  getLeaderboard, getActivityStats, apiCall as query,
  type ActivityMember, type ActivityStats,
} from '../lib/db';

interface Props { guildId: string; }

const TROPHY_ICONS = ['🥇', '🥈', '🥉'];
const BAR_W = 120;

// ── Types ─────────────────────────────────────────────────────────────────────

interface CmdUsageLog {
  id: number; user_id: string; username: string;
  command: string; metadata: Record<string, unknown>; used_at: string;
}
interface CmdStats {
  byCommand: { command: string; total_uses: number; unique_users: number }[];
  topUsers:  { user_id: string; username: string; uses: number }[];
}
interface VCMember {
  user_id: string; username: string; avatar_url: string | null;
  total_seconds: number; session_count: number;
  last_active: string; last_left: string | null;
}
interface VCStats {
  members: number; totalSecs: number; active24h: number; active7d: number;
}

const CMD_ICONS: Record<string, string> = {
  infoview: '📚', bossinfo: '👹', weakness: '🛡️', damage: '⚡',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format seconds → "2d 3h 15m", "45m 30s", "30s" */
function fmtDur(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s && !d) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Bar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: BAR_W, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#5865f2,#7983f5)', borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 42 }}>
        {count.toLocaleString()}
      </span>
    </div>
  );
}

function VCBar({ seconds, max }: { seconds: number; max: number }) {
  const pct = max > 0 ? Math.round((seconds / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: BAR_W, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#9b59b6,#c084fc)', borderRadius: 3, transition: 'width 0.4s ease' }} />
      </div>
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 52 }}>
        {fmtDur(seconds)}
      </span>
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, color,
}: { label: string; value: string | number; icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>; color: string }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} style={{ color }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════

export default function Activity({ guildId }: Props) {
  // Message activity
  const [members, setMembers] = useState<ActivityMember[]>([]);
  const [stats,   setStats]   = useState<ActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [limit,   setLimit]   = useState(25);
  const [error,   setError]   = useState('');

  // Command usage
  const [cmdLogs,     setCmdLogs]     = useState<CmdUsageLog[]>([]);
  const [cmdStats,    setCmdStats]    = useState<CmdStats | null>(null);
  const [cmdFilter,   setCmdFilter]   = useState('all');
  const [cmdLoading,  setCmdLoading]  = useState(false);
  const [cmdExpanded, setCmdExpanded] = useState(true);

  // VC leaderboard
  const [vcMembers,  setVcMembers]  = useState<VCMember[]>([]);
  const [vcStats,    setVcStats]    = useState<VCStats | null>(null);
  const [vcLoading,  setVcLoading]  = useState(true);
  const [vcLimit,    setVcLimit]    = useState(25);
  const [vcError,    setVcError]    = useState('');
  const [vcExpanded, setVcExpanded] = useState(true);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const load = () => {
    if (!guildId) return;
    setLoading(true); setError('');
    Promise.all([getLeaderboard(guildId, limit), getActivityStats(guildId)])
      .then(([m, s]) => { setMembers(m); setStats(s); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  const loadCmdUsage = async (filter = cmdFilter) => {
    if (!guildId) return;
    setCmdLoading(true);
    try {
      const [logs, statsData] = await Promise.all([
        query('getCommandUsageLog', { guildId, command: filter === 'all' ? undefined : filter, limit: 100 }),
        query('getCommandUsageStats', { guildId }),
      ]);
      setCmdLogs(Array.isArray(logs) ? logs : []);
      setCmdStats(statsData as CmdStats);
    } catch { /* table may not exist yet */ }
    setCmdLoading(false);
  };

  const loadVC = async () => {
    if (!guildId) return;
    setVcLoading(true); setVcError('');
    try {
      const [lb, vs] = await Promise.all([
        query('getVCLeaderboard', { guildId, limit: vcLimit }),
        query('getVCStats',       { guildId }),
      ]);
      setVcMembers(Array.isArray(lb) ? lb : []);
      setVcStats(vs as VCStats);
    } catch (e: unknown) {
      setVcError((e as Error).message ?? 'Failed to load VC data');
    }
    setVcLoading(false);
  };

  useEffect(load,         [guildId, limit]);
  useEffect(() => { loadCmdUsage(); }, [guildId]);
  useEffect(() => { loadVC(); },        [guildId, vcLimit]);

  // ── Formatters ─────────────────────────────────────────────────────────────

  const fmt     = (d: string) => { try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return '—'; } };
  const fmtFull = (d: string) => { try { return new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } };

  const maxMsgs = members[0]?.message_count ?? 1;
  const maxVC   = vcMembers[0]?.total_seconds ?? 1;
  const knownCmds = cmdStats?.byCommand.map(r => r.command) ?? [];

  // ── Render ─────────────────────────────────────────────────────────────────

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

      {/* ── Message activity stat cards ────────────────────────────────────── */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="Total Messages"  value={stats.totalMsgs} icon={MessageSquare} color="#5865f2" />
          <StatCard label="Active Members"  value={stats.activeAll}  icon={Users}         color="#22c55e" />
          <StatCard label="Active (7 days)" value={stats.active7d}   icon={TrendingUp}    color="#f59e0b" />
          <StatCard label="Active (24h)"    value={stats.active24h}  icon={Clock}         color="#ec4899" />
        </div>
      )}

      {/* ── VC stat cards ──────────────────────────────────────────────────── */}
      {vcStats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard label="VC Members Tracked" value={vcStats.members}              icon={Mic}       color="#9b59b6" />
          <StatCard label="Total VC Time"       value={fmtDur(vcStats.totalSecs)}   icon={Clock}     color="#7c3aed" />
          <StatCard label="VC Active (7 days)"  value={vcStats.active7d}            icon={TrendingUp} color="#6d28d9" />
          <StatCard label="VC Active (24h)"     value={vcStats.active24h}           icon={Users}     color="#8b5cf6" />
        </div>
      )}

      {/* ── Command Usage Log ──────────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        {/* Header */}
        <div
          style={{ padding: '14px 18px', borderBottom: cmdExpanded ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setCmdExpanded(x => !x)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Terminal size={15} style={{ color: '#a78bfa' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Command Usage Log</span>
            {cmdStats && cmdStats.byCommand.length > 0 && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--elevated)', padding: '2px 8px', borderRadius: 6 }}>
                {cmdStats.byCommand.reduce((s, r) => s + r.total_uses, 0).toLocaleString()} uses
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
            <select className="inp" style={{ padding: '5px 10px', fontSize: 12, width: 'auto' }} value={cmdFilter}
              onChange={e => { setCmdFilter(e.target.value); loadCmdUsage(e.target.value); }}>
              <option value="all">All Commands</option>
              {knownCmds.map(c => <option key={c} value={c}>{CMD_ICONS[c] ?? '⚡'} /{c}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={() => loadCmdUsage()} title="Refresh"><RefreshCw size={13} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => setCmdExpanded(x => !x)}>
              {cmdExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
          </div>
        </div>

        {cmdExpanded && (
          <>
            {cmdStats && cmdStats.byCommand.length > 0 && (
              <div style={{ padding: '12px 16px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border)' }}>
                {cmdStats.byCommand.map(r => (
                  <div key={r.command} style={{ background: 'var(--elevated)', borderRadius: 10, padding: '10px 16px', minWidth: 130 }}>
                    <div style={{ fontSize: 20, marginBottom: 2 }}>{CMD_ICONS[r.command] ?? '⚡'}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>/{r.command}</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#a78bfa', lineHeight: 1.1 }}>{r.total_uses.toLocaleString()}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.unique_users} unique users</div>
                  </div>
                ))}
              </div>
            )}

            {cmdStats && cmdStats.topUsers.length > 0 && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Top Users</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {cmdStats.topUsers.slice(0, 8).map((u, i) => (
                    <div key={u.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--elevated)', borderRadius: 8, padding: '5px 10px' }}>
                      <span style={{ fontSize: 13 }}>{TROPHY_ICONS[i] ?? '👤'}</span>
                      <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{u.username || `…${u.user_id.slice(-4)}`}</span>
                      <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700 }}>{u.uses.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {cmdLoading ? (
              <div style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
              </div>
            ) : cmdLogs.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <Terminal size={26} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No command usage recorded yet</div>
                <div style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 4 }}>Usage logs appear when members run /infoview or /bossinfo</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Command', 'Member', 'Details', 'Time'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cmdLogs.map(row => (
                    <tr key={row.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)', borderRadius: 6, padding: '2px 8px', fontSize: 12, color: '#a78bfa', fontWeight: 600 }}>
                          {CMD_ICONS[row.command] ?? '⚡'} /{row.command}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{row.username || `…${row.user_id.slice(-4)}`}</div>
                        <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{row.user_id}</div>
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        {row.metadata && Object.keys(row.metadata).length > 0 ? (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            {Object.entries(row.metadata).map(([k, v]) => (
                              <span key={k} style={{ marginRight: 8 }}><span style={{ color: 'var(--text-faint)' }}>{k}:</span> {String(v)}</span>
                            ))}
                          </span>
                        ) : <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmtFull(row.used_at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* ── VC Leaderboard ─────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
        {/* Header */}
        <div
          style={{ padding: '14px 18px', borderBottom: vcExpanded ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setVcExpanded(x => !x)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Mic size={15} style={{ color: '#9b59b6' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>VC Time Leaderboard</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--elevated)', padding: '2px 8px', borderRadius: 6 }}>
              {vcMembers.length} members
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            <select className="inp" style={{ padding: '5px 10px', fontSize: 12, width: 'auto' }} value={vcLimit}
              onChange={e => setVcLimit(Number(e.target.value))}>
              {[10, 25, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={loadVC} title="Refresh"><RefreshCw size={13} /></button>
            <button className="btn btn-ghost btn-sm" onClick={() => setVcExpanded(x => !x)}>
              {vcExpanded ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
          </div>
        </div>

        {vcExpanded && (
          <>
            {vcError && (
              <div style={{ margin: '12px 16px', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 8, padding: '10px 14px', color: 'var(--danger)', fontSize: 13 }}>
                {vcError}
              </div>
            )}

            {vcLoading ? (
              <div style={{ padding: 48, textAlign: 'center' }}>
                <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: '#9b59b6', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
              </div>
            ) : vcMembers.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <MicOff size={28} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />
                <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No VC activity data yet</div>
                <div style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 4 }}>Members need to join a voice channel to appear here</div>
              </div>
            ) : (
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
                      {/* Rank */}
                      <td style={{ padding: '12px 16px', width: 60 }}>
                        {i < 3
                          ? <span style={{ fontSize: 18 }}>{TROPHY_ICONS[i]}</span>
                          : <span className="mono" style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>#{i + 1}</span>
                        }
                      </td>
                      {/* Member */}
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {m.avatar_url ? (
                            <img src={m.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#9b59b618', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Mic size={13} style={{ color: '#9b59b6' }} />
                            </div>
                          )}
                          <div>
                            <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{m.username || `User ${m.user_id.slice(-4)}`}</div>
                            <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{m.user_id}</div>
                          </div>
                        </div>
                      </td>
                      {/* VC Time bar */}
                      <td style={{ padding: '12px 16px' }}>
                        <VCBar seconds={m.total_seconds} max={maxVC} />
                      </td>
                      {/* Sessions */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
                          {(m.session_count ?? 0).toLocaleString()}
                        </span>
                      </td>
                      {/* Last Active */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {fmt(m.last_left ?? m.last_active)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* ── Message Activity Leaderboard ───────────────────────────────────── */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Trophy size={16} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Message Activity Leaderboard</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', background: 'var(--elevated)', padding: '2px 8px', borderRadius: 6 }}>{members.length} members</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="inp" style={{ padding: '5px 10px', fontSize: 12, width: 'auto' }} value={limit} onChange={e => setLimit(Number(e.target.value))}>
              {[10, 25, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={load} title="Refresh"><RefreshCw size={13} /></button>
          </div>
        </div>
        {members.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center' }}>
            <Trophy size={28} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />
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
                    {i < 3 ? <span style={{ fontSize: 18 }}>{TROPHY_ICONS[i]}</span>
                            : <span className="mono" style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>#{i + 1}</span>}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{m.username || `User ${m.user_id.slice(-4)}`}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 1 }}>{m.user_id}</div>
                  </td>
                  <td style={{ padding: '12px 16px' }}><Bar count={m.message_count} max={maxMsgs} /></td>
                  <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(m.last_active)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

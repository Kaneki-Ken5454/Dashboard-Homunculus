import { useEffect, useState } from 'react';
import { Users, TrendingUp, MessageSquare, Clock, Search } from 'lucide-react';
import { getMembers, getMemberStats, updateMemberXP, type GuildMember, type ActivityStats } from '../lib/db';

interface Props { guildId: string; }

function timeAgo(d: string) {
  if (!d) return '—';
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Members({ guildId }: Props) {
  const [members, setMembers]   = useState<GuildMember[]>([]);
  const [stats, setStats]       = useState<ActivityStats | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [search, setSearch]     = useState('');
  const [editing, setEditing]   = useState<string | null>(null);
  const [editXP, setEditXP]     = useState(0);
  const [editLevel, setEditLevel] = useState(0);
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    if (!guildId) return;
    setLoading(true); setError('');
    try {
      const [m, s] = await Promise.all([getMembers(guildId), getMemberStats(guildId)]);
      setMembers(m);
      setStats(s);
    } catch (e) { setError((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [guildId]);

  const filtered = members.filter(m =>
    !search || m.username?.toLowerCase().includes(search.toLowerCase()) || m.user_id.includes(search)
  );

  function startEdit(m: GuildMember) {
    setEditing(m.id);
    setEditXP(m.xp);
    setEditLevel(m.level);
  }

  async function saveXP(m: GuildMember) {
    setSaving(true);
    try {
      await updateMemberXP(m.id, editXP, editLevel);
      setMembers(prev => prev.map(x => x.id === m.id ? { ...x, xp: editXP, level: editLevel } : x));
      setEditing(null);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade">
      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Total Members',    value: members.length,    icon: Users,         color: '#5865f2' },
            { label: 'Active (all time)',value: stats.activeAll,   icon: TrendingUp,    color: '#3ba55d' },
            { label: 'Active (7 days)',  value: stats.active7d,    icon: Clock,         color: '#faa81a' },
            { label: 'Total Messages',   value: stats.totalMsgs,   icon: MessageSquare, color: '#9b59b6' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={14} style={{ color }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>{value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search + table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
            <input
              className="inp"
              style={{ paddingLeft: 30, fontSize: 13 }}
              placeholder="Search by username or ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} members</span>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--elevated)', borderBottom: '1px solid var(--border)' }}>
              {['User', 'User ID', 'Level', 'XP', 'Messages', 'Last Active', ''].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                  {search ? 'No members match your search' : 'No members tracked yet'}
                </td>
              </tr>
            ) : filtered.map(m => (
              <tr key={m.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {m.avatar_url
                      ? <img src={m.avatar_url} alt="" style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{(m.username || '?')[0].toUpperCase()}</div>
                    }
                    <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{m.username || '—'}</span>
                  </div>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.user_id}</span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {editing === m.id
                    ? <input type="number" className="inp" style={{ width: 60, padding: '3px 6px', fontSize: 13 }} value={editLevel} onChange={e => setEditLevel(Number(e.target.value))} />
                    : <span style={{ fontSize: 13, fontWeight: 600, color: '#818cf8' }}>{m.level}</span>
                  }
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {editing === m.id
                    ? <input type="number" className="inp" style={{ width: 80, padding: '3px 6px', fontSize: 13 }} value={editXP} onChange={e => setEditXP(Number(e.target.value))} />
                    : <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{m.xp.toLocaleString()}</span>
                  }
                </td>
                <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text-muted)' }}>
                  {m.message_count.toLocaleString()}
                </td>
                <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {timeAgo(m.last_active)}
                </td>
                <td style={{ padding: '10px 14px' }}>
                  {editing === m.id ? (
                    <div style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-primary btn-sm" onClick={() => saveXP(m)} disabled={saving}>{saving ? '…' : 'Save'}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn btn-ghost btn-sm" onClick={() => startEdit(m)} style={{ fontSize: 11 }}>Edit XP</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Trophy, Search } from 'lucide-react';
import { getMembers, updateMemberXP, type GuildMember } from '../lib/db';
import Modal from '../components/Modal';

interface Props { guildId: string; }

export default function Members({ guildId }: Props) {
  const [members, setMembers] = useState<GuildMember[]>([]);
  const [filtered, setFiltered] = useState<GuildMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<GuildMember | null>(null);
  const [editXp, setEditXp] = useState('');
  const [editLevel, setEditLevel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getMembers(guildId)
      .then(m => { setMembers(m); setFiltered(m); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? members.filter(m => m.username.toLowerCase().includes(q) || m.user_id.includes(q)) : members);
  }, [search, members]);

  function openEdit(m: GuildMember) {
    setEditing(m); setEditXp(String(m.xp)); setEditLevel(String(m.level));
  }

  async function saveEdit() {
    if (!editing) return;
    setSaving(true);
    try {
      await updateMemberXP(editing.id, Number(editXp), Number(editLevel));
      setEditing(null); load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  const rankColor = (i: number) => i === 0 ? '#f1c40f' : i === 1 ? '#bdc3c7' : i === 2 ? '#cd7f32' : 'var(--text-faint)';

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade">
      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input className="inp" style={{ paddingLeft: 32 }} placeholder="Search members…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
          <Trophy size={14} /> {members.length} members
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['#', 'User', 'Level', 'XP', 'Messages', 'Last Active', ''].map(h => (
                <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>No members found</td></tr>
            ) : filtered.map((m, i) => (
              <tr key={m.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 16px' }}>
                  <Trophy size={13} style={{ color: rankColor(i) }} />
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{m.username}</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.user_id}</div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 600 }}>
                    Lv {m.level}
                  </span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, maxWidth: 80, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, (m.xp % 1000) / 10)}%`, background: 'var(--primary)', borderRadius: 2 }} />
                    </div>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.xp.toLocaleString()}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span className="mono" style={{ fontSize: 13 }}>{m.message_count.toLocaleString()}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(m.last_active).toLocaleDateString()}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => openEdit(m)}>Edit XP</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={`Edit XP — ${editing.username}`} onClose={() => setEditing(null)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>XP</label>
              <input type="number" className="inp" value={editXp} onChange={e => setEditXp(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Level</label>
              <input type="number" className="inp" value={editLevel} onChange={e => setEditLevel(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEdit} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

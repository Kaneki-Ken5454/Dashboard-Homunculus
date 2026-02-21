import { useEffect, useState } from 'react';
import { Tag, MousePointer, Trash2 } from 'lucide-react';
import { getReactionRoles, deleteReactionRole, getButtonRoles, deleteButtonRole, type ReactionRole, type ButtonRole } from '../lib/db';
import Badge from '../components/Badge';

interface Props { guildId: string; }

export default function Roles({ guildId }: Props) {
  const [tab, setTab] = useState<'reaction' | 'button'>('reaction');
  const [reaction, setReaction] = useState<ReactionRole[]>([]);
  const [button, setButton] = useState<ButtonRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    Promise.all([getReactionRoles(guildId), getButtonRoles(guildId)])
      .then(([r, b]) => { setReaction(r); setButton(b); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  async function delReaction(id: string) {
    if (!confirm('Delete this reaction role?')) return;
    try { await deleteReactionRole(id); setReaction(p => p.filter(r => r.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }

  async function delButton(id: string) {
    if (!confirm('Delete this button role?')) return;
    try { await deleteButtonRole(id); setButton(p => p.filter(b => b.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }

  const styleMap: Record<string, 'primary' | 'success' | 'danger' | 'muted'> = {
    PRIMARY: 'primary', SUCCESS: 'success', DANGER: 'danger', SECONDARY: 'muted',
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade">
      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, marginBottom: 16, width: 'fit-content' }}>
        {([['reaction', 'Reaction Roles', Tag, reaction.length], ['button', 'Button Roles', MousePointer, button.length]] as const).map(([t, label, Icon, count]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: tab === t ? 'var(--elevated)' : 'transparent',
            color: tab === t ? 'var(--text)' : 'var(--text-muted)',
            fontSize: 13, fontFamily: 'Lexend', fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <Icon size={13} /> {label}
            <span style={{ background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{count}</span>
          </button>
        ))}
      </div>

      {tab === 'reaction' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Emoji', 'Role', 'Message ID', 'Channel', 'Type', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reaction.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>No reaction roles configured</td></tr>
              ) : reaction.map(r => (
                <tr key={r.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 14px', fontSize: 22 }}>{r.emoji}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.role_name || '—'}</div>
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)' }}>{r.role_id}</div>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.message_id}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.channel_id}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge label={r.is_reaction ? 'reaction' : 'button'} variant="primary" />
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => delReaction(r.id)}><Trash2 size={11} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'button' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Label', 'Emoji', 'Role ID', 'Style', 'Message ID', 'Channel', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {button.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>No button roles configured</td></tr>
              ) : button.map(b => (
                <tr key={b.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 500 }}>{b.button_label || '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 20 }}>{b.button_emoji || '—'}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.role_id}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <Badge label={b.button_style} variant={styleMap[b.button_style] ?? 'muted'} />
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.message_id}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{b.channel_id}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <button className="btn btn-danger btn-sm" onClick={() => delButton(b.id)}><Trash2 size={11} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, Trash2 } from 'lucide-react';
import { getAuditLogs, deleteAuditLog, getWarns, deleteWarn, type AuditLog, type WarnEntry } from '../lib/db';
import Badge from '../components/Badge';

interface Props { guildId: string; }

function timeAgo(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Moderation({ guildId }: Props) {
  const [tab, setTab] = useState<'audit' | 'warns'>('audit');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [warns, setWarns] = useState<WarnEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const load = async () => {
    if (!guildId) return;
    setLoading(true); setError('');
    try {
      console.log(`Loading moderation data for guild: ${guildId}`);
      const [logs, warns] = await Promise.all([getAuditLogs(guildId), getWarns(guildId)]);
      console.log(`Loaded ${logs.length} audit logs and ${warns.length} warns`);
      setLogs(logs); 
      setWarns(warns); 
      setCurrentPage(1); // Reset to first page when data loads
    } catch (e) {
      console.error('Error loading moderation data:', e);
      setError((e as Error).message); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [guildId]);

  async function delLog(id: string) {
    try {
      console.log(`Deleting audit log: ${id}`);
      await deleteAuditLog(id);
      setLogs(prev => prev.filter(l => l.id !== id));
    } catch (e) {
      console.error('Error deleting audit log:', e);
      setError((e as Error).message);
    }
  }

  async function delWarn(id: string) {
    try {
      console.log(`Deleting warn: ${id}`);
      await deleteWarn(id);
      setWarns(prev => prev.filter(w => w.id !== id));
    } catch (e) {
      console.error('Error deleting warn:', e);
      setError((e as Error).message);
    }
  }

  const actionVariant = (type: string): 'danger' | 'warning' | 'success' | 'primary' | 'muted' => {
    if (type.includes('ban') || type.includes('kick') || type.includes('delete')) return 'danger';
    if (type.includes('warn') || type.includes('mute')) return 'warning';
    if (type.includes('create') || type.includes('add') || type.includes('join')) return 'success';
    return 'muted';
  };

  const severityVariant = (s: string): 'danger' | 'warning' | 'muted' =>
    s === 'high' ? 'danger' : s === 'medium' ? 'warning' : 'muted';

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading moderation data...</div>
      </div>
    </div>
  );

  return (
    <div className="animate-fade">
      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      {/* Tabs + counts */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, marginBottom: 16, width: 'fit-content' }}>
        {([['audit', 'Audit Logs', Shield, logs.length], ['warns', 'Warns', AlertTriangle, warns.length]] as const).map(([t, label, Icon, count]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
            background: tab === t ? 'var(--elevated)' : 'transparent',
            color: tab === t ? 'var(--text)' : 'var(--text-muted)',
            fontSize: 13, fontFamily: 'Lexend', fontWeight: 500,
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <Icon size={13} />
            {label}
            <span style={{ background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{count}</span>
          </button>
        ))}
      </div>

      {tab === 'audit' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Action', 'User', 'Moderator', 'Reason', 'Bot', 'Time', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                    No audit logs found
                  </td>
                </tr>
              ) : (() => {
                const startIndex = (currentPage - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const paginatedLogs = logs.slice(startIndex, endIndex);
                
                return (
                  <>
                    {paginatedLogs.map(log => (
                      <tr key={log.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <Badge label={log.action_type.replace(/_/g, ' ')} variant={actionVariant(log.action_type)} />
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.user_id || '—'}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.moderator_id || '—'}</span>
                        </td>
                        <td style={{ padding: '10px 14px', maxWidth: 240 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{log.reason || '—'}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {log.bot_action && <Badge label="bot" variant="primary" />}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(log.created_at)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <button className="btn btn-danger btn-sm" onClick={() => delLog(log.id)}><Trash2 size={11} /></button>
                        </td>
                      </tr>
                    ))}
                  </>
                );
              })()}
            </tbody>
          </table>
          
          {/* Pagination */}
          {logs.length > itemsPerPage && (
            <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Showing {Math.min(currentPage * itemsPerPage, logs.length)} of {logs.length} logs
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Previous
                </button>
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(logs.length / itemsPerPage), p + 1))}
                  disabled={currentPage === Math.ceil(logs.length / itemsPerPage)}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'warns' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['User ID', 'Moderator', 'Severity', 'Reason', 'Date', ''].map(h => (
                  <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {warns.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
                    No warnings recorded
                  </td>
                </tr>
              ) : warns.map(w => (
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
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{w.reason || '—'}</span>
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
      )}
    </div>
  );
}

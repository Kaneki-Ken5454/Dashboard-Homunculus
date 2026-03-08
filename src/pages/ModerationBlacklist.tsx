/**
 * ModerationBlacklist.tsx — merged page
 * Tabs: Audit Log | Warns | Blacklist
 */
import { useEffect, useState, useMemo } from 'react';
import { Shield, AlertTriangle, Trash2, ShieldBan, Plus, RotateCcw, Search } from 'lucide-react';
import {
  getAuditLogs, deleteAuditLog, getWarns, deleteWarn,
  getBlacklist, addBlacklistWord, removeBlacklistWord,
  clearUserViolations, clearAllViolations,
  type AuditLog, type WarnEntry,
} from '../lib/db';
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

const TAB_BTN = (active: boolean): React.CSSProperties => ({
  padding: '7px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: active ? 'var(--elevated)' : 'transparent',
  color: active ? 'var(--text)' : 'var(--text-muted)',
  fontSize: 13, fontFamily: 'Lexend', fontWeight: 500,
  display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
});

export default function ModerationBlacklist({ guildId }: Props) {
  type Tab = 'audit' | 'warns' | 'blacklist';
  const [tab, setTab] = useState<Tab>('audit');

  // ── Moderation state ──────────────────────────────────────────────
  const [logs,   setLogs]   = useState<AuditLog[]>([]);
  const [warns,  setWarns]  = useState<WarnEntry[]>([]);
  const [modLoading, setModLoading] = useState(true);
  const [modError,   setModError]   = useState('');
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;

  // ── Blacklist state ───────────────────────────────────────────────
  const [words,      setWords]      = useState<string[]>([]);
  const [violations, setViolations] = useState<Record<string, number>>({});
  const [blLoading,  setBlLoading]  = useState(true);
  const [blError,    setBlError]    = useState('');
  const [newWord,    setNewWord]    = useState('');
  const [adding,     setAdding]     = useState(false);
  const [search,     setSearch]     = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

  // ── Load functions ────────────────────────────────────────────────
  const loadMod = async () => {
    if (!guildId) return;
    setModLoading(true); setModError('');
    try {
      const [l, w] = await Promise.all([getAuditLogs(guildId), getWarns(guildId)]);
      setLogs(l); setWarns(w); setPage(1);
    } catch (e) { setModError((e as Error).message); }
    finally { setModLoading(false); }
  };

  const loadBl = () => {
    if (!guildId) return;
    setBlLoading(true);
    getBlacklist(guildId)
      .then(d => { setWords(d.words || []); setViolations(d.violations || {}); })
      .catch(e => setBlError(e.message))
      .finally(() => setBlLoading(false));
  };

  useEffect(() => { loadMod(); loadBl(); }, [guildId]);

  // ── Moderation actions ────────────────────────────────────────────
  const delLog  = async (id: string) => { await deleteAuditLog(id); setLogs(p => p.filter(l => l.id !== id)); };
  const delWarn = async (id: string) => { await deleteWarn(id);     setWarns(p => p.filter(w => w.id !== id)); };

  // ── Blacklist actions ─────────────────────────────────────────────
  const addWord = async () => {
    const w = newWord.trim().toLowerCase();
    if (!w || words.includes(w)) return;
    setAdding(true);
    try { await addBlacklistWord(guildId, w); setWords(p => [...p, w]); setNewWord(''); }
    catch (e) { setBlError((e as Error).message); }
    setAdding(false);
  };
  const removeWord = async (w: string) => {
    try { await removeBlacklistWord(guildId, w); setWords(p => p.filter(x => x !== w)); }
    catch (e) { setBlError((e as Error).message); }
  };
  const clearUser = async (uid: string) => {
    try { await clearUserViolations(guildId, uid); loadBl(); }
    catch (e) { setBlError((e as Error).message); }
  };
  const clearAll = async () => {
    try { await clearAllViolations(guildId); setViolations({}); setConfirmClear(false); }
    catch (e) { setBlError((e as Error).message); }
  };

  const filteredWords = useMemo(() => {
    const q = search.toLowerCase();
    return q ? words.filter(w => w.toLowerCase().includes(q)) : words;
  }, [words, search]);

  const sortedViolators = useMemo(() =>
    Object.entries(violations).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]),
    [violations]);

  // ── Helpers ───────────────────────────────────────────────────────
  const actionVariant = (t: string): 'danger'|'warning'|'success'|'primary'|'muted' => {
    if (t.includes('ban') || t.includes('kick') || t.includes('delete')) return 'danger';
    if (t.includes('warn') || t.includes('mute')) return 'warning';
    if (t.includes('create') || t.includes('add') || t.includes('join')) return 'success';
    return 'muted';
  };
  const sevVariant = (s: string): 'danger'|'warning'|'muted' =>
    s === 'high' ? 'danger' : s === 'medium' ? 'warning' : 'muted';

  const TABS: [Tab, string, typeof Shield, number][] = [
    ['audit',     'Audit Logs', Shield,     logs.length],
    ['warns',     'Warns',      AlertTriangle, warns.length],
    ['blacklist', 'Blacklist',  ShieldBan,  words.length],
  ];

  const Spinner = () => (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
      <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade">
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, marginBottom: 16, width: 'fit-content' }}>
        {TABS.map(([t, label, Icon, count]) => (
          <button key={t} style={TAB_BTN(tab === t)} onClick={() => setTab(t)}>
            <Icon size={13} />
            {label}
            <span style={{ background: 'var(--primary-subtle)', color: '#818cf8', borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 600 }}>{count}</span>
          </button>
        ))}
      </div>

      {/* ── AUDIT LOG ─────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <>
          {modError && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{modError}</div>}
          {modLoading ? <Spinner /> : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Action', 'User', 'Moderator', 'Reason', 'Bot', 'Time', ''].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>No audit logs found</td></tr>
                  ) : logs.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(log => (
                    <tr key={log.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px 14px' }}><Badge label={log.action_type.replace(/_/g, ' ')} variant={actionVariant(log.action_type)} /></td>
                      <td style={{ padding: '10px 14px' }}><span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.user_id || '—'}</span></td>
                      <td style={{ padding: '10px 14px' }}><span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.moderator_id || '—'}</span></td>
                      <td style={{ padding: '10px 14px', maxWidth: 240 }}><span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>{log.reason || '—'}</span></td>
                      <td style={{ padding: '10px 14px' }}>{log.bot_action && <Badge label="bot" variant="primary" />}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{timeAgo(log.created_at)}</td>
                      <td style={{ padding: '10px 14px' }}><button className="btn btn-danger btn-sm" onClick={() => delLog(log.id)}><Trash2 size={11} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {logs.length > PER_PAGE && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing {Math.min(page * PER_PAGE, logs.length)} of {logs.length}</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPage(p => Math.min(Math.ceil(logs.length / PER_PAGE), p + 1))} disabled={page === Math.ceil(logs.length / PER_PAGE)}>Next</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── WARNS ─────────────────────────────────────────────────────── */}
      {tab === 'warns' && (
        <>
          {modError && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{modError}</div>}
          {modLoading ? <Spinner /> : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['User ID', 'Moderator', 'Severity', 'Reason', 'Date', ''].map(h => (
                    <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '.06em', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {warns.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>No warnings recorded</td></tr>
                  ) : warns.map(w => (
                    <tr key={w.id} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 14px' }}><span className="mono" style={{ fontSize: 13, color: 'var(--text)' }}>{w.user_id}</span></td>
                      <td style={{ padding: '11px 14px' }}><span className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>{w.moderator_id}</span></td>
                      <td style={{ padding: '11px 14px' }}><Badge label={w.severity} variant={sevVariant(w.severity)} /></td>
                      <td style={{ padding: '11px 14px', maxWidth: 280 }}><span style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: 260 }}>{w.reason || '—'}</span></td>
                      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{new Date(w.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '11px 14px' }}><button className="btn btn-danger btn-sm" onClick={() => delWarn(w.id)}><Trash2 size={11} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── BLACKLIST ──────────────────────────────────────────────────── */}
      {tab === 'blacklist' && (
        <>
          {blError && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{blError}</div>}
          {blLoading ? <Spinner /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Add word */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 10 }}>Add Word</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    className="inp" style={{ flex: 1 }}
                    placeholder="Enter a word or phrase…"
                    value={newWord}
                    onChange={e => setNewWord(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addWord()}
                  />
                  <button className="btn btn-primary" onClick={addWord} disabled={adding || !newWord.trim()}>
                    <Plus size={14} /> {adding ? 'Adding…' : 'Add'}
                  </button>
                </div>
              </div>

              {/* Word list */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                  <ShieldBan size={15} style={{ color: 'var(--danger)' }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Blocked Words</span>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)', background: 'var(--elevated)', padding: '2px 8px', borderRadius: 6 }}>{words.length}</span>
                  <div style={{ marginLeft: 'auto', position: 'relative' }}>
                    <Search size={13} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
                    <input className="inp" style={{ paddingLeft: 28, width: 180 }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
                  </div>
                </div>
                {filteredWords.length === 0 ? (
                  <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {search ? 'No matching words' : 'No blacklisted words yet'}
                  </div>
                ) : (
                  <div style={{ padding: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {filteredWords.map(w => (
                      <span key={w} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontFamily: 'JetBrains Mono,monospace', color: 'var(--text)' }}>
                        {w}
                        <button onClick={() => removeWord(w)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0, display: 'flex', lineHeight: 1 }}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Violations */}
              {sortedViolators.length > 0 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <AlertTriangle size={15} style={{ color: '#f59e0b' }} />
                    <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Violations</span>
                    <div style={{ marginLeft: 'auto' }}>
                      {confirmClear ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Clear all?</span>
                          <button className="btn btn-danger btn-sm" onClick={clearAll}>Yes</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(false)}>No</button>
                        </div>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(true)}><RotateCcw size={12} /> Clear All</button>
                      )}
                    </div>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['User ID', 'Violations', ''].map(h => (
                        <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {sortedViolators.map(([uid, count]) => (
                        <tr key={uid} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '10px 14px' }}><span className="mono" style={{ fontSize: 13 }}>{uid}</span></td>
                          <td style={{ padding: '10px 14px' }}>
                            <span style={{ background: count >= 5 ? 'var(--danger-subtle)' : 'var(--elevated)', color: count >= 5 ? 'var(--danger)' : 'var(--text-muted)', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 600 }}>{count}×</span>
                          </td>
                          <td style={{ padding: '10px 14px' }}><button className="btn btn-ghost btn-sm" onClick={() => clearUser(uid)}><RotateCcw size={12} /> Clear</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

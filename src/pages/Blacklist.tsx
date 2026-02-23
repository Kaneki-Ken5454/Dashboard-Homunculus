import { useEffect, useState, useMemo } from 'react';
import { Plus, Trash2, ShieldBan, AlertTriangle, RotateCcw, Search, X } from 'lucide-react';
import { getBlacklist, addBlacklistWord, removeBlacklistWord, clearUserViolations, clearAllViolations } from '../lib/db';

interface Props { guildId: string; }

export default function Blacklist({ guildId }: Props) {
  const [words, setWords] = useState<string[]>([]);
  const [violations, setViolations] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [newWord, setNewWord] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getBlacklist(guildId)
      .then(d => { setWords(d.words || []); setViolations(d.violations || {}); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  const filteredWords = useMemo(() => {
    const q = search.toLowerCase();
    return q ? words.filter(w => w.toLowerCase().includes(q)) : words;
  }, [words, search]);

  // Sort violations by count desc
  const sortedViolations = useMemo(() => {
    return Object.entries(violations)
      .sort(([, a], [, b]) => b - a)
      .filter(([, count]) => count > 0);
  }, [violations]);

  async function doAdd() {
    const word = newWord.trim().toLowerCase();
    if (!word) return;
    setAdding(true); setError('');
    try {
      await addBlacklistWord(guildId, word);
      setNewWord('');
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setAdding(false); }
  }

  async function doRemove(word: string) {
    if (!confirm(`Remove "${word}" from blacklist?`)) return;
    try { await removeBlacklistWord(guildId, word); load(); }
    catch (e) { setError((e as Error).message); }
  }

  async function doClearUser(userId: string) {
    try { await clearUserViolations(guildId, userId); load(); }
    catch (e) { setError((e as Error).message); }
  }

  async function doClearAll() {
    try { await clearAllViolations(guildId); setConfirmClearAll(false); load(); }
    catch (e) { setError((e as Error).message); }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  return (
    <div className="animate-fade" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
      {error && (
        <div style={{ gridColumn: '1/-1', background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Left — Word List */}
      <div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldBan size={16} style={{ color: 'var(--danger)' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Blocked Words</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', background: 'var(--elevated)', padding: '2px 8px', borderRadius: 6 }}>
              {words.length} words
            </span>
          </div>

          {/* Add word */}
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              className="inp mono"
              placeholder="Add a word or phrase…"
              value={newWord}
              onChange={e => setNewWord(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doAdd(); }}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button className="btn btn-primary" onClick={doAdd} disabled={adding || !newWord.trim()}>
              <Plus size={14} /> Add
            </button>
          </div>

          {/* Search */}
          {words.length > 5 && (
            <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
              <Search size={13} style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
              <input className="inp" style={{ paddingLeft: 32, fontSize: 12 }} placeholder="Search words…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          )}

          {/* Word list */}
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {filteredWords.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                <ShieldBan size={24} style={{ color: 'var(--text-faint)', marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  {search ? 'No words match your search' : 'No blocked words yet'}
                </div>
              </div>
            ) : filteredWords.map(word => (
              <div key={word} className="data-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 13, color: 'var(--text)', filter: 'blur(3px)', transition: 'filter 0.2s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.filter = 'none'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.filter = 'blur(3px)'}
                  title="Hover to reveal"
                >
                  {word}
                </span>
                <button className="btn btn-danger btn-sm" onClick={() => doRemove(word)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
              💡 Words are blurred by default. Hover to reveal. Changes apply immediately to the bot.
            </div>
          </div>
        </div>

        {/* Punishment schedule info */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', marginTop: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={14} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>Punishment Schedule</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[['1st offense', '10 min timeout'], ['2nd offense', '15 min timeout'], ['3rd offense', '20 min timeout'], ['4th+ offense', '+5 min each']].map(([label, value]) => (
              <div key={label} style={{ background: 'var(--elevated)', borderRadius: 7, padding: '8px 10px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500, marginTop: 2 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right — Violations */}
      <div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>Violations</span>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', background: 'var(--elevated)', padding: '2px 8px', borderRadius: 6 }}>
              {sortedViolations.length} users
            </span>
            {sortedViolations.length > 0 && (
              <button
                className="btn btn-danger btn-sm"
                style={{ marginLeft: 4 }}
                onClick={() => setConfirmClearAll(true)}
                title="Clear all violations"
              >
                <RotateCcw size={12} /> Reset All
              </button>
            )}
          </div>

          {/* Confirm dialog */}
          {confirmClearAll && (
            <div style={{ padding: '12px 14px', background: 'var(--danger-subtle)', borderBottom: '1px solid var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontSize: 13, color: 'var(--danger)', fontWeight: 500 }}>Reset all violation counts?</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmClearAll(false)}><X size={12} /> Cancel</button>
                <button className="btn btn-danger btn-sm" onClick={doClearAll}>Confirm Reset</button>
              </div>
            </div>
          )}

          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {sortedViolations.length === 0 ? (
              <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                <AlertTriangle size={24} style={{ color: 'var(--text-faint)', marginBottom: 8, display: 'block', margin: '0 auto 8px' }} />
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No violations recorded</div>
                <div style={{ color: 'var(--text-faint)', fontSize: 12, marginTop: 4 }}>Clean server! 🎉</div>
              </div>
            ) : sortedViolations.map(([userId, count]) => {
              const nextMinutes = 5 + ((count + 1) * 5);
              const barPct = Math.min((count / 10) * 100, 100);
              const severity = count >= 5 ? 'var(--danger)' : count >= 3 ? '#f59e0b' : 'var(--success)';

              return (
                <div key={userId} className="data-row" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div>
                      <div className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>{userId}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Next: {nextMinutes}min timeout</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: severity }}>{count}</span>
                      <button className="btn btn-ghost btn-sm" onClick={() => doClearUser(userId)} title="Clear violations">
                        <RotateCcw size={11} />
                      </button>
                    </div>
                  </div>
                  <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ width: `${barPct}%`, height: '100%', background: severity, borderRadius: 2, transition: 'width 0.3s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

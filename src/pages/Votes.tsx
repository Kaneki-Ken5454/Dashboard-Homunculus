import { useEffect, useState } from 'react';
import { Plus, Trash2, BarChart2, Clock, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { getVotes, createVote, deleteVote, type Vote } from '../lib/db';
import { apiCall } from '../lib/db';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

interface Props { guildId: string; }

interface VoteResult { option: string; count: number; total_weight: number; }
interface VoterRow  { user_id: string; option: string; timestamp: string; username?: string; }

function ProgressBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>
        <span>{label}</span><span>{pct.toFixed(1)}%</span>
      </div>
      <div style={{ height: 8, background: 'var(--elevated)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: 4, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  );
}

export default function Votes({ guildId }: Props) {
  const [votes, setVotes]           = useState<Vote[]>([]);
  const [loading, setLoading]       = useState(true);
  const [modal, setModal]           = useState(false);
  const [question, setQuestion]     = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [channelId, setChannelId]   = useState('');
  const [duration, setDuration]     = useState('1440');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  // Per-vote expanded state
  const [expanded, setExpanded]      = useState<Record<string, boolean>>({});
  const [results, setResults]        = useState<Record<string, VoteResult[]>>({});
  const [voters, setVoters]          = useState<Record<string, VoterRow[]>>({});
  const [loadingResult, setLoadingResult] = useState<Record<string, boolean>>({});

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getVotes(guildId)
      .then(setVotes)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  async function toggleExpand(v: Vote) {
    const key = String(v.vote_id ?? v.id);
    const next = !expanded[key];
    setExpanded(p => ({ ...p, [key]: next }));
    if (next && !results[key]) {
      setLoadingResult(p => ({ ...p, [key]: true }));
      try {
        const [res, vtr] = await Promise.all([
          apiCall<VoteResult[]>('getVoteResults', { voteId: key }),
          apiCall<VoterRow[]>('getVoteVoters', { guildId, voteId: key }),
        ]);
        setResults(p => ({ ...p, [key]: res }));
        setVoters(p => ({ ...p, [key]: vtr }));
      } catch { /* ignore */ }
      finally { setLoadingResult(p => ({ ...p, [key]: false })); }
    }
  }

  async function submit() {
    if (!question.trim()) return;
    const options = optionsText.split('\n').map(s => s.trim()).filter(Boolean);
    if (options.length < 2) { setError('At least 2 options required'); return; }
    if (options.length > 5) { setError('Maximum 5 options'); return; }
    if (channelId.trim() && !/^\d{17,19}$/.test(channelId.trim())) {
      setError('Channel ID must be 17–19 digits'); return;
    }
    const dur = parseInt(duration);
    if (isNaN(dur) || dur < 1 || dur > 43200) {
      setError('Duration: 1–43200 minutes'); return;
    }
    setSaving(true); setError('');
    try {
      await createVote({
        guild_id: guildId, question: question.trim(),
        options, channel_id: channelId.trim() || undefined,
        duration_minutes: dur,
      });
      setModal(false); setQuestion(''); setOptionsText(''); setChannelId(''); setDuration('1440');
      load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function del(v: Vote) {
    if (!confirm('Delete this vote and all cast votes?')) return;
    try {
      await deleteVote(String(v.vote_id ?? v.id));
      setVotes(p => p.filter(x => (x.vote_id ?? x.id) !== (v.vote_id ?? v.id)));
    } catch (e) { setError((e as Error).message); }
  }

  function voteStatus(v: Vote): { label: string; variant: 'success' | 'warning' | 'muted' } {
    if (v.results_posted) return { label: 'ended', variant: 'muted' };
    if (v.end_time && new Date(v.end_time) < new Date()) return { label: 'expired', variant: 'warning' };
    return { label: 'active', variant: 'success' };
  }

  function timeLeft(endTime?: string) {
    if (!endTime) return null;
    const diff = new Date(endTime).getTime() - Date.now();
    if (diff <= 0) return 'Ended';
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return [d && `${d}d`, h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '< 1m';
  }

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

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setModal(true)}>
          <Plus size={14} /> Create Vote
        </button>
      </div>

      {votes.length === 0 ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '60px 20px', textAlign: 'center' }}>
          <BarChart2 size={32} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>No votes yet</div>
          <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={14} /> Create First Vote</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {votes.map(v => {
            const key = String(v.vote_id ?? v.id);
            const { label, variant } = voteStatus(v);
            const opts = Array.isArray(v.options) ? v.options as string[] : [];
            const isExpanded = expanded[key];
            const voteResults = results[key] ?? [];
            const voteVoters  = voters[key] ?? [];
            const total = voteResults.reduce((s, r) => s + r.count, 0);
            const byOption: Record<string, VoterRow[]> = {};
            voteVoters.forEach(vr => {
              byOption[vr.option] = byOption[vr.option] ?? [];
              byOption[vr.option].push(vr);
            });

            return (
              <div key={key} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ padding: '18px 20px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                        <Badge label={label} variant={variant} />
                        {v.end_time && (
                          <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={11} /> {timeLeft(v.end_time)}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Users size={11} /> {total} vote{total !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
                        {v.question || 'Untitled Vote'}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {opts.map((opt, i) => (
                          <div key={i} style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                            {String(opt)}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => toggleExpand(v)}
                        title="View results & voters"
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        Results
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => del(v)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text-faint)' }}>
                    Created {new Date(v.created_at).toLocaleDateString()}
                    {v.channel_id && <> · Channel: <code style={{ fontSize: 10 }}>{v.channel_id}</code></>}
                  </div>
                </div>

                {/* Expanded results + voter details */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '18px 20px', background: 'var(--bg)' }}>
                    {loadingResult[key] ? (
                      <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>Loading…</div>
                    ) : (
                      <>
                        {/* Results bars */}
                        <div style={{ marginBottom: 18 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Results</div>
                          {voteResults.length === 0 ? (
                            <div style={{ color: 'var(--text-faint)', fontSize: 13 }}>No votes cast yet.</div>
                          ) : (
                            voteResults.map(r => (
                              <ProgressBar
                                key={r.option}
                                label={`${r.option} (${r.count} vote${r.count !== 1 ? 's' : ''})`}
                                pct={total ? (r.count / total) * 100 : 0}
                              />
                            ))
                          )}
                        </div>

                        {/* Voter breakdown — per option */}
                        {voteVoters.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Voter Details <span style={{ fontWeight: 400, color: 'var(--text-faint)', textTransform: 'none', letterSpacing: 0 }}>(dashboard-only — Discord votes are anonymous)</span>
                            </div>
                            {Object.entries(byOption).map(([opt, rows]) => (
                              <div key={opt} style={{ marginBottom: 14 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                                  {opt} <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({rows.length})</span>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                  {rows.map((vr, i) => (
                                    <div key={i} style={{ background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                                      {vr.username || vr.user_id}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title="Create Vote" onClose={() => setModal(false)} width="540px">
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Question *</label>
            <input className="inp" placeholder="What should we do?" value={question} onChange={e => setQuestion(e.target.value)} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Channel ID <span style={{ color: 'var(--text-faint)' }}>(optional)</span></label>
              <input className="inp" placeholder="123456789…" value={channelId} onChange={e => setChannelId(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Duration (minutes) *</label>
              <input className="inp" type="number" min="1" max="43200" placeholder="1440" value={duration} onChange={e => setDuration(e.target.value)} />
              <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>1440 = 24h · 10080 = 7 days</div>
            </div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Options — one per line * (max 5)</label>
            <textarea className="inp" style={{ minHeight: 100 }} placeholder={'Option A\nOption B\nOption C'} value={optionsText} onChange={e => setOptionsText(e.target.value)} />
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !question.trim()}>
              {saving ? 'Creating…' : 'Create Vote'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

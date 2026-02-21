import { useEffect, useState } from 'react';
import { Plus, Trash2, BarChart2, CheckCircle, Clock, Hash, EyeOff } from 'lucide-react';
import { getVotes, createVote, deleteVote, type Vote } from '../lib/db';
import Modal from '../components/Modal';
import Badge from '../components/Badge';

interface Props { guildId: string; }

export default function Votes({ guildId }: Props) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [question, setQuestion] = useState('');
  const [optionsText, setOptionsText] = useState('');
  const [channelId, setChannelId] = useState('');
  const [anonymous, setAnonymous] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => {
    if (!guildId) return;
    setLoading(true);
    getVotes(guildId)
      .then(setVotes)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, [guildId]);

  async function submit() {
    if (!question.trim()) return;
    const options = optionsText.split('\n').map(s => s.trim()).filter(Boolean);
    setSaving(true); setError('');
    try {
      await createVote({
        guild_id: guildId,
        question: question.trim(),
        options,
        channel_id: channelId.trim() || undefined,
        anonymous,
      });
      setModal(false); setQuestion(''); setOptionsText(''); setChannelId(''); setAnonymous(false); load();
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function del(id: number) {
    if (!confirm('Delete this vote?')) return;
    try { await deleteVote(id); setVotes(p => p.filter(v => v.id !== id)); }
    catch (e) { setError((e as Error).message); }
  }

  function voteStatus(v: Vote): { label: string; variant: 'success' | 'warning' | 'muted' } {
    if (v.results_posted) return { label: 'ended', variant: 'muted' };
    if (v.end_time && new Date(v.end_time) < new Date()) return { label: 'expired', variant: 'warning' };
    return { label: 'active', variant: 'success' };
  }

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 120 }} />)}
    </div>
  );

  return (
    <div className="animate-fade">
      <p className="page-description">Manage polls and votes for your server. Votes can target specific channels and support anonymous voting.</p>

      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={14} /> Create Vote</button>
      </div>

      {votes.length === 0 ? (
        <div className="empty-state">
          <BarChart2 size={32} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 12px' }} />
          <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>No votes yet</div>
          <button className="btn btn-primary" onClick={() => setModal(true)}><Plus size={14} /> Create First Vote</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {votes.map(v => {
            const { label, variant } = voteStatus(v);
            const opts = Array.isArray(v.options) ? v.options as string[] : [];
            return (
              <div key={v.id} className="stat-card">
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                      <Badge label={label} variant={variant} />
                      {v.anonymous && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-faint)' }}>
                          <EyeOff size={11} /> Anonymous
                        </span>
                      )}
                      {v.channel_id && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--info)', background: 'var(--info-subtle)', padding: '2px 8px', borderRadius: 12 }}>
                          <Hash size={10} />
                          <span className="mono" style={{ fontSize: 10 }}>{v.channel_id}</span>
                        </span>
                      )}
                      {v.end_time && (
                        <span style={{ fontSize: 11, color: 'var(--text-faint)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <Clock size={11} /> {new Date(v.end_time).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
                      {v.question || 'Untitled Vote'}
                    </div>
                    {opts.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {opts.map((opt, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 12px', fontSize: 13 }}>
                            <CheckCircle size={11} style={{ color: 'var(--primary)' }} />
                            {String(opt)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={() => del(v.id)}><Trash2 size={12} /></button>
                </div>
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-faint)' }}>
                  Created {new Date(v.created_at).toLocaleDateString()}
                  {v.vote_id && <span className="mono" style={{ marginLeft: 10, color: 'var(--text-faint)' }}>ID: {v.vote_id}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <Modal title="Create Vote" onClose={() => setModal(false)}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Question *</label>
            <input className="inp" placeholder="What should we do?" value={question} onChange={e => setQuestion(e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Options (one per line)</label>
            <textarea className="inp" style={{ minHeight: 100 }} placeholder={"Option A\nOption B\nOption C"} value={optionsText} onChange={e => setOptionsText(e.target.value)} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <Hash size={12} /> Channel ID (optional)
              </span>
            </label>
            <input className="inp mono" placeholder="e.g. 1234567890123456" value={channelId} onChange={e => setChannelId(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
              Specify a channel to send this vote to. Leave blank for the default channel.
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <input type="checkbox" className="toggle" checked={anonymous} onChange={e => setAnonymous(e.target.checked)} />
            <div>
              <span style={{ fontSize: 13, color: 'var(--text)' }}>Anonymous Voting</span>
              <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>Voters will not be identified to others</div>
            </div>
          </div>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={submit} disabled={saving || !question.trim()}>
              {saving ? 'Creating...' : 'Create Vote'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

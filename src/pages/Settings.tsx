import { useEffect, useState } from 'react';
import { Save, Hash, CheckCircle, AlertCircle } from 'lucide-react';
import { getGuildSetting, upsertGuildSetting, type GuildSetting, getLogChannels, setLogChannels, type LogChannelConfig } from '../lib/db';

interface Props { guildId: string; }

function Label({ text, sub }: { text: string; sub: string }) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{text}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function Row({ label, sub, checked, onToggle }: { label: string; sub: string; checked: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <Label text={label} sub={sub} />
      <input type="checkbox" className="toggle" checked={checked} onChange={onToggle} />
    </div>
  );
}

const LOG_TYPES = [
  { key: 'message_log',   emoji: '📝', label: 'Message Logs',   desc: 'Message edits & deletions' },
  { key: 'channel_log',   emoji: '📁', label: 'Channel Logs',   desc: 'Channel create / update / delete' },
  { key: 'role_log',      emoji: '🎭', label: 'Role Logs',      desc: 'Role create / update / delete' },
  { key: 'server_log',    emoji: '🏠', label: 'Server Logs',    desc: 'Member joins / leaves / bans / unbans' },
  { key: 'blacklist_log', emoji: '🚫', label: 'Blacklist Logs', desc: 'Blacklist violations & timeouts' },
  { key: 'mod_log',       emoji: '🔨', label: 'Mod Logs',       desc: 'All mod actions (ban / kick / timeout / warn)' },
  { key: 'ticket_log',    emoji: '🎫', label: 'Ticket Logs',    desc: 'Ticket opened / closed / claimed' },
];

function LogChannelSection({ guildId }: { guildId: string }) {
  const [config, setConfig]   = useState<LogChannelConfig>({});
  const [draft, setDraft]     = useState<LogChannelConfig>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [quickId, setQuickId] = useState('');

  useEffect(() => {
    if (!guildId) return;
    setLoading(true);
    getLogChannels(guildId)
      .then(c => { const cfg = c || {}; setConfig(cfg); setDraft(cfg); })
      .catch(() => { setConfig({}); setDraft({}); })
      .finally(() => setLoading(false));
  }, [guildId]);

  const applyQuick = () => {
    if (!quickId.trim()) return;
    const all: LogChannelConfig = {};
    LOG_TYPES.forEach(t => { all[t.key] = quickId.trim(); });
    setDraft(all);
    setQuickId('');
  };

  const save = async () => {
    setSaving(true); setError(''); setSaved(false);
    const clean: LogChannelConfig = {};
    for (const [k, v] of Object.entries(draft)) {
      if (v && v.trim()) clean[k] = v.trim();
    }
    try {
      await setLogChannels(guildId, clean);
      setConfig(clean);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(config);

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Hash size={16} style={{ color: 'var(--primary)' }} />
        <div style={{ fontWeight: 600, fontSize: 15 }}>Log Channels</div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
        Enter a Discord <strong style={{ color: 'var(--text)' }}>channel ID</strong> for each log type. Leave blank to disable.
        Get a channel ID by right-clicking it in Discord with Developer Mode enabled.
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, padding: '10px 14px', background: 'rgba(88,101,242,0.06)', border: '1px solid rgba(88,101,242,0.15)', borderRadius: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>Set all to one channel:</span>
        <input className="inp" style={{ flex: 1, minWidth: 180, maxWidth: 240, fontSize: 12, fontFamily: 'var(--font-mono)' }}
          placeholder="Channel ID" value={quickId}
          onChange={e => setQuickId(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && applyQuick()} />
        <button className="btn btn-primary" style={{ fontSize: 12, padding: '5px 14px' }} onClick={applyQuick}>Apply to All</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>Loading…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {LOG_TYPES.map(lt => {
            const val = draft[lt.key] || '';
            const isSaved = !!config[lt.key];
            return (
              <div key={lt.key} style={{ display: 'grid', gridTemplateColumns: '230px 1fr 28px', gap: 10, alignItems: 'center', padding: '9px 12px', background: 'var(--elevated)', borderRadius: 8, border: `1px solid ${isSaved ? 'rgba(74,222,128,0.2)' : 'var(--border)'}`, transition: 'border-color 0.2s' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 18, flexShrink: 0 }}>{lt.emoji}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{lt.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{lt.desc}</div>
                  </div>
                </div>
                <input className="inp" style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}
                  placeholder="Channel ID"
                  value={val}
                  onChange={e => setDraft(prev => ({ ...prev, [lt.key]: e.target.value }))} />
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  {isSaved
                    ? <CheckCircle size={14} style={{ color: '#4ade80' }} title="Active" />
                    : <AlertCircle size={14} style={{ color: 'var(--text-faint)', opacity: 0.35 }} title="Not configured" />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 10 }}>{error}</div>}

      <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button className={`btn ${saved ? 'btn-success' : 'btn-primary'}`} onClick={save} disabled={saving || !hasChanges} style={{ opacity: !hasChanges ? 0.5 : 1 }}>
          <Save size={13} />{saving ? 'Saving…' : saved ? 'Saved!' : 'Save Log Channels'}
        </button>
        {saved && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Saved — bot will use these immediately</span>}
        {hasChanges && !saved && !saving && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Unsaved changes</span>}
      </div>
    </div>
  );
}

export default function Settings({ guildId }: Props) {
  const [settings, setSettings] = useState<GuildSetting | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (!guildId) return;
    setLoading(true);
    getGuildSetting(guildId).then(s => setSettings(s)).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, [guildId]);

  function toggle(key: keyof GuildSetting) {
    if (!settings) return;
    setSettings(prev => prev ? { ...prev, [key]: !prev[key as keyof typeof prev] } : prev);
  }

  async function save() {
    if (!settings) return;
    setSaving(true); setError('');
    try { await upsertGuildSetting(guildId, settings); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  if (!settings) {
    return (
      <div className="animate-fade" style={{ maxWidth: 720 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 28px', marginBottom: 16 }}>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No settings for this guild</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>Click below to create defaults, then configure log channels.</div>
          <button className="btn btn-primary" onClick={async () => {
            setLoading(true);
            try { await upsertGuildSetting(guildId, { prefix: '!', use_slash_commands: true, moderation_enabled: true, levelling_enabled: true, fun_enabled: true, tickets_enabled: true, custom_commands_enabled: true, auto_responders_enabled: true, global_cooldown: 1000 }); const s = await getGuildSetting(guildId); setSettings(s); }
            catch(e) { setError((e as Error).message); }
            finally { setLoading(false); }
          }}>Create Default Settings</button>
          {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 10 }}>{error}</div>}
        </div>
        <LogChannelSection guildId={guildId} />
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ maxWidth: 720 }}>
      {error && <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>{error}</div>}

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 20 }}>Basic Configuration</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Command Prefix</label>
            <input className="inp" value={settings.prefix} onChange={e => setSettings(p => p ? { ...p, prefix: e.target.value } : p)} style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Global Cooldown (ms)</label>
            <input type="number" className="inp" value={settings.global_cooldown} onChange={e => setSettings(p => p ? { ...p, global_cooldown: Number(e.target.value) } : p)} />
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Feature Modules</div>
        <Row label="Slash Commands"    sub="Enable Discord slash commands"                    checked={settings.use_slash_commands}       onToggle={() => toggle('use_slash_commands')} />
        <Row label="Moderation"        sub="Enable moderation commands (ban, kick, warn)"     checked={settings.moderation_enabled}        onToggle={() => toggle('moderation_enabled')} />
        <Row label="Leveling System"   sub="Track XP and level up members for activity"       checked={settings.levelling_enabled}         onToggle={() => toggle('levelling_enabled')} />
        <Row label="Fun Commands"      sub="Enable fun and entertainment commands"             checked={settings.fun_enabled}               onToggle={() => toggle('fun_enabled')} />
        <Row label="Ticketing"         sub="Allow members to create support tickets"          checked={settings.tickets_enabled}           onToggle={() => toggle('tickets_enabled')} />
        <Row label="Custom Commands"   sub="Enable user-defined custom commands"               checked={settings.custom_commands_enabled}   onToggle={() => toggle('custom_commands_enabled')} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16 }}>
          <Label text="Auto Responders" sub="Automatically respond to trigger phrases" />
          <input type="checkbox" className="toggle" checked={settings.auto_responders_enabled} onChange={() => toggle('auto_responders_enabled')} />
        </div>
      </div>

      <button className={`btn ${saved ? 'btn-success' : 'btn-primary'}`} onClick={save} disabled={saving} style={{ marginBottom: 24 }}>
        <Save size={14} /> {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
      </button>

      <LogChannelSection guildId={guildId} />
    </div>
  );
}

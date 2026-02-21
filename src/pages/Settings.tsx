import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { getGuildSetting, upsertGuildSetting, type GuildSetting } from '../lib/db';

interface Props { guildId: string; }

export default function Settings({ guildId }: Props) {
  const [settings, setSettings] = useState<GuildSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!guildId) return;
    setLoading(true);
    getGuildSetting(guildId)
      .then(s => setSettings(s))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [guildId]);

  function toggle(key: keyof GuildSetting) {
    if (!settings) return;
    setSettings(prev => prev ? { ...prev, [key]: !prev[key as keyof typeof prev] } : prev);
  }

  async function save() {
    if (!settings) return;
    setSaving(true); setError('');
    try {
      await upsertGuildSetting(guildId, settings);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const Label = ({ text, sub }: { text: string; sub: string }) => (
    <div>
      <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>{text}</div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>
    </div>
  );

  const Row = ({ label, sub, checked, onToggle }: { label: string; sub: string; checked: boolean; onToggle: () => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <Label text={label} sub={sub} />
      <input type="checkbox" className="toggle" checked={checked} onChange={onToggle} />
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
    </div>
  );

  if (!settings) {
    // Auto-create default settings with save
    const defaults: Partial<import('../lib/db').GuildSetting> = {
      prefix: '!', use_slash_commands: true, moderation_enabled: true,
      levelling_enabled: true, fun_enabled: true, tickets_enabled: true,
      custom_commands_enabled: true, auto_responders_enabled: true, global_cooldown: 1000,
    };
    return (
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '40px 28px', maxWidth: 520 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No settings for this guild</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
          Guild <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text)' }}>{guildId}</span> has no entry in <code>guild_settings</code>. Click below to create one with defaults.
        </div>
        <button className="btn btn-primary" onClick={async () => {
          setLoading(true);
          try {
            await upsertGuildSetting(guildId, defaults);
            const s = await getGuildSetting(guildId);
            setSettings(s);
          } catch(e) { setError((e as Error).message); }
          finally { setLoading(false); }
        }}>Create Default Settings</button>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12, marginTop: 10 }}>{error}</div>}
      </div>
    );
  }

  return (
    <div className="animate-fade" style={{ maxWidth: 720 }}>
      {error && (
        <div style={{ background: 'var(--danger-subtle)', border: '1px solid var(--danger)', borderRadius: 10, padding: '12px 16px', color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Basic config */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 20 }}>Basic Configuration</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Command Prefix</label>
            <input className="inp" value={settings.prefix} onChange={e => setSettings(p => p ? { ...p, prefix: e.target.value } : p)} style={{ fontFamily: 'var(--font-mono)' }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Global Cooldown (ms)</label>
            <input type="number" className="inp" value={settings.global_cooldown}
              onChange={e => setSettings(p => p ? { ...p, global_cooldown: Number(e.target.value) } : p)} />
          </div>
        </div>
      </div>

      {/* Feature toggles */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Feature Modules</div>
        <Row label="Slash Commands" sub="Enable Discord slash commands alongside prefix commands" checked={settings.use_slash_commands} onToggle={() => toggle('use_slash_commands')} />
        <Row label="Moderation" sub="Enable moderation commands (ban, kick, warn, mute)" checked={settings.moderation_enabled} onToggle={() => toggle('moderation_enabled')} />
        <Row label="Leveling System" sub="Track XP and level up members for activity" checked={settings.levelling_enabled} onToggle={() => toggle('levelling_enabled')} />
        <Row label="Fun Commands" sub="Enable fun and entertainment commands" checked={settings.fun_enabled} onToggle={() => toggle('fun_enabled')} />
        <Row label="Ticketing" sub="Allow members to create support tickets" checked={settings.tickets_enabled} onToggle={() => toggle('tickets_enabled')} />
        <Row label="Custom Commands" sub="Enable user-defined custom commands" checked={settings.custom_commands_enabled} onToggle={() => toggle('custom_commands_enabled')} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16 }}>
          <Label text="Auto Responders" sub="Automatically respond to trigger phrases" />
          <input type="checkbox" className="toggle" checked={settings.auto_responders_enabled} onChange={() => toggle('auto_responders_enabled')} />
        </div>
      </div>

      <button className={`btn ${saved ? 'btn-success' : 'btn-primary'}`} onClick={save} disabled={saving}>
        <Save size={14} /> {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}

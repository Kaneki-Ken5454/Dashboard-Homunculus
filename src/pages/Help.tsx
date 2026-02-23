import { useState } from 'react';
import { Search, Terminal, Hash } from 'lucide-react';

interface Cmd {
  name: string;
  syntax: string;
  description: string;
  prefix?: boolean;   // true = prefix command (~)
  slash?: boolean;    // true = slash command (/)
}

interface Category {
  label: string;
  emoji: string;
  color: string;
  commands: Cmd[];
}

const CATEGORIES: Category[] = [
  {
    label: 'Moderation', emoji: '🛡️', color: '#ef4444',
    commands: [
      { name: 'ban',       syntax: '/ban @user [reason]',              description: 'Permanently ban a member', slash: true },
      { name: 'kick',      syntax: '/kick @user [reason]',             description: 'Kick a member from the server', slash: true },
      { name: 'timeout',   syntax: '/timeout @user <minutes> [reason]',description: 'Timeout a member', slash: true },
      { name: 'untimeout', syntax: '/untimeout @user',                 description: 'Remove a timeout', slash: true },
      { name: 'warn',      syntax: '/warn @user <reason>',             description: 'Issue a warning', slash: true },
      { name: 'warnremove',syntax: '/warnremove <warn_id>',            description: 'Remove a warning by ID', slash: true },
      { name: 'purge',     syntax: '/purge <amount>',                  description: 'Bulk-delete messages (1–100)', slash: true },
      { name: 'lock',      syntax: '/lock [channel]',                  description: 'Lock a channel from sending messages', slash: true },
      { name: 'unlock',    syntax: '/unlock [channel]',                description: 'Unlock a channel', slash: true },
    ],
  },
  {
    label: 'Custom Commands', emoji: '⚡', color: '#8b5cf6',
    commands: [
      { name: 'cc add',     syntax: '~cc add <trigger> | <response>',  description: 'Create a new custom command', prefix: true },
      { name: 'cc edit',    syntax: '~cc edit <trigger> | <response>', description: 'Edit an existing command's response', prefix: true },
      { name: 'cc delete',  syntax: '~cc delete <trigger>',            description: 'Delete a custom command', prefix: true },
      { name: 'cc list',    syntax: '~cc list [page]',                 description: 'List all custom commands (10 per page)', prefix: true },
      { name: 'cc info',    syntax: '~cc info <trigger>',              description: 'Show details about a command', prefix: true },
      { name: 'cc enable',  syntax: '~cc enable <trigger>',            description: 'Enable a disabled command', prefix: true },
      { name: 'cc disable', syntax: '~cc disable <trigger>',           description: 'Disable a command without deleting it', prefix: true },
      { name: 'cc set',     syntax: '~cc set <trigger> <field> <val>', description: 'Set rtype, cooldown, perm, name or description', prefix: true },
    ],
  },
  {
    label: 'Triggers', emoji: '🔁', color: '#06b6d4',
    commands: [
      { name: 'addtrigger',    syntax: '/addtrigger <text> <response>',  description: 'Add an auto-trigger', slash: true },
      { name: 'edittrigger',   syntax: '/edittrigger <id> <field> <val>',description: 'Edit a trigger field', slash: true },
      { name: 'deltrigger',    syntax: '/deltrigger <id>',               description: 'Delete a trigger', slash: true },
      { name: 'triggerenable', syntax: '/triggerenable <id>',            description: 'Enable a trigger', slash: true },
      { name: 'triggerdisable',syntax: '/triggerdisable <id>',           description: 'Disable a trigger', slash: true },
      { name: 'triggerset',    syntax: '/triggerset <id> <field> <val>', description: 'Set cooldown, match type, response type', slash: true },
      { name: 'triggerinfo',   syntax: '/triggerinfo <id>',              description: 'Show trigger details', slash: true },
      { name: 'triggers',      syntax: '/triggers [page]',               description: 'List all triggers', slash: true },
      { name: 'triggerimport', syntax: '/triggerimport',                 description: 'Bulk-import triggers from JSON', slash: true },
    ],
  },
  {
    label: 'Activity', emoji: '📊', color: '#22c55e',
    commands: [
      { name: 'leaderboard', syntax: '~leaderboard [top]',  description: 'Top active members by message count (default top 10, max 25)', prefix: true },
      { name: 'rank',        syntax: '~rank [@user]',       description: 'Show your or another member's activity rank', prefix: true },
      { name: 'activity',    syntax: '~activity',           description: 'Server-wide activity snapshot (24h / 7d / all time)', prefix: true },
    ],
  },
  {
    label: 'Info System', emoji: '📖', color: '#f59e0b',
    commands: [
      { name: 'infoview',       syntax: '/infoview <topic_id>',                   description: 'View an info topic embed', slash: true },
      { name: 'newtopic',       syntax: '/newtopic <section> <name> [emoji]',     description: 'Create a new info topic (modal)', slash: true },
      { name: 'edittopic',      syntax: '/edittopic <section> <topic_id>',        description: 'Edit an existing topic (modal)', slash: true },
      { name: 'deletetopic',    syntax: '/deletetopic <section> <topic_id>',      description: 'Delete a topic', slash: true },
      { name: 'addimages',      syntax: '/addimages <section> <topic_id>',        description: 'Add image/thumbnail to a topic (modal)', slash: true },
      { name: 'newcategory',    syntax: '/newcategory <section> <name> [emoji]',  description: 'Create a new category (modal)', slash: true },
      { name: 'editcategory',   syntax: '/editcategory <section> <old> <new>',    description: 'Rename a category', slash: true },
      { name: 'editsubcategory',syntax: '/editsubcategory <section> <name>',      description: 'Rename + set emoji for a subcategory (modal)', slash: true },
      { name: 'deletecategory', syntax: '/deletecategory <section> <name>',       description: 'Delete a category', slash: true },
      { name: 'infolist',       syntax: '/infolist [section]',                    description: 'List all topics or topics in a section', slash: true },
      { name: 'infostats',      syntax: '/infostats',                             description: 'Info system stats and top topics', slash: true },
      { name: 'inforeset',      syntax: '/inforeset <section>',                   description: 'Reset view counts for a section', slash: true },
      { name: 'infohelp',       syntax: '/infohelp',                              description: 'Show info system help', slash: true },
    ],
  },
  {
    label: 'Tickets', emoji: '🎫', color: '#ec4899',
    commands: [
      { name: 'ticket',       syntax: '/ticket',        description: 'Open a support ticket', slash: true },
      { name: 'ticket-panel', syntax: '/ticket-panel',  description: 'Post a ticket panel in the current channel', slash: true },
    ],
  },
  {
    label: 'Voting', emoji: '🗳️', color: '#6366f1',
    commands: [
      { name: 'votecreate',  syntax: '/votecreate <question> <options> [duration]', description: 'Create a vote (up to 10 options, comma-separated)', slash: true },
      { name: 'voteresults', syntax: '/voteresults <vote_id>',                      description: 'Show current results of a vote', slash: true },
      { name: 'vote',        syntax: '/vote',                                        description: 'Vote help overview', slash: true },
      { name: 'voteinfo',    syntax: '/voteinfo <vote_id>',                          description: 'Show info about a specific vote', slash: true },
    ],
  },
  {
    label: 'Reaction & Button Roles', emoji: '🏷️', color: '#14b8a6',
    commands: [
      { name: 'reactionrole', syntax: '/reactionrole add|remove|list', description: 'Manage emoji reaction roles', slash: true },
      { name: 'buttonrole',   syntax: '/buttonrole add|remove|list',   description: 'Manage button-based roles', slash: true },
      { name: 'addrole',      syntax: '/addrole @user @role',           description: 'Manually give a role to a member', slash: true },
      { name: 'removerole',   syntax: '/removerole @user @role',        description: 'Remove a role from a member', slash: true },
    ],
  },
  {
    label: 'Governance', emoji: '⚖️', color: '#a855f7',
    commands: [
      { name: 'config',      syntax: '/config',              description: 'View and change bot configuration', slash: true },
      { name: 'stats',       syntax: '/stats',               description: 'Server governance statistics', slash: true },
      { name: 'reputation',  syntax: '/reputation [@user]',  description: 'View reputation and stats', slash: true },
      { name: 'contributors',syntax: '/contributors',        description: 'Top governance contributors', slash: true },
    ],
  },
  {
    label: 'Embeds', emoji: '🖼️', color: '#f97316',
    commands: [
      { name: 'addembed',  syntax: '/addembed <name>',          description: 'Create a saved embed (modal)', slash: true },
      { name: 'editembed', syntax: '/editembed <name>',         description: 'Edit a saved embed (modal)', slash: true },
      { name: 'delembed',  syntax: '/delembed <name>',          description: 'Delete a saved embed', slash: true },
      { name: 'sendembed', syntax: '/sendembed <name> [ch]',    description: 'Send a saved embed to a channel', slash: true },
      { name: 'listembeds',syntax: '/listembeds',               description: 'List all saved embeds', slash: true },
    ],
  },
  {
    label: 'Logging', emoji: '📋', color: '#64748b',
    commands: [
      { name: 'setalllogs',      syntax: '/setalllogs <channel>',    description: 'Set all log channels at once', slash: true },
      { name: 'setmessagelog',   syntax: '/setmessagelog <channel>', description: 'Log message edits/deletes', slash: true },
      { name: 'setchannellog',   syntax: '/setchannellog <channel>', description: 'Log channel changes', slash: true },
      { name: 'setrolelog',      syntax: '/setrolelog <channel>',    description: 'Log role changes', slash: true },
      { name: 'setserverlog',    syntax: '/setserverlog <channel>',  description: 'Log server events', slash: true },
      { name: 'setmodlog',       syntax: '/setmodlog <channel>',     description: 'Log mod actions', slash: true },
      { name: 'setticketlog',    syntax: '/setticketlog <channel>',  description: 'Log ticket events', slash: true },
      { name: 'setblacklistlog', syntax: '/setblacklistlog <ch>',    description: 'Log blacklist violations', slash: true },
      { name: 'viewlogs',        syntax: '/viewlogs',                description: 'View all configured log channels', slash: true },
      { name: 'testlogs',        syntax: '/testlogs',                description: 'Send test log events to verify setup', slash: true },
      { name: 'removealllogs',   syntax: '/removealllogs',           description: 'Remove all log channel configurations', slash: true },
    ],
  },
  {
    label: 'Scanner / Word Filter', emoji: '🔍', color: '#dc2626',
    commands: [
      { name: 'setscan_source', syntax: '/setscan_source <channel>', description: 'Set source channel to scan', slash: true },
      { name: 'setscan_target', syntax: '/setscan_target <channel>', description: 'Set target channel for flagged content', slash: true },
      { name: 'scan_add',       syntax: '/scan_add <word>',          description: 'Add word to scan blacklist', slash: true },
      { name: 'scan_remove',    syntax: '/scan_remove <word>',       description: 'Remove word from scan blacklist', slash: true },
      { name: 'scan_list',      syntax: '/scan_list',                description: 'List all scan words', slash: true },
    ],
  },
  {
    label: 'Utility', emoji: '🔧', color: '#94a3b8',
    commands: [
      { name: 'ping',    syntax: '/ping',           description: 'Check bot latency', slash: true },
      { name: 'help',    syntax: '/help [command]', description: 'Show bot help', slash: true },
      { name: 'govhelp', syntax: '/govhelp',        description: 'Governance system help', slash: true },
    ],
  },
];

interface Props { guildId: string; }

export default function HelpPage({ guildId: _guildId }: Props) {
  const [search, setSearch]       = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = CATEGORIES.map(cat => ({
    ...cat,
    commands: cat.commands.filter(c => {
      const q = search.toLowerCase();
      return !q || c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.syntax.toLowerCase().includes(q);
    }),
  })).filter(cat => cat.commands.length > 0 && (!activeCategory || cat.label === activeCategory));

  const totalCmds = CATEGORIES.reduce((s, c) => s + c.commands.length, 0);

  return (
    <div className="animate-fade">
      {/* Header bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#5865f2,#7983f5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Terminal size={18} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Homunculus Command Reference</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{totalCmds} commands across {CATEGORIES.length} categories</div>
          </div>
        </div>
        <div style={{ position: 'relative', minWidth: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input className="inp" style={{ paddingLeft: 30, fontSize: 13 }} placeholder="Search commands…" value={search} onChange={e => { setSearch(e.target.value); setActiveCategory(null); }} />
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ background: '#5865f218', color: '#818cf8', borderRadius: 5, padding: '1px 7px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>/</span> Slash command
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-muted)' }}>
          <span style={{ background: '#22c55e18', color: '#22c55e', borderRadius: 5, padding: '1px 7px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>~</span> Prefix command
        </span>
      </div>

      {/* Category filter pills */}
      {!search && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <button
            onClick={() => setActiveCategory(null)}
            style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid var(--border)', background: !activeCategory ? 'var(--primary-subtle)' : 'var(--surface)', color: !activeCategory ? '#818cf8' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'Lexend, sans-serif', fontWeight: 500 }}
          >
            All
          </button>
          {CATEGORIES.map(cat => (
            <button
              key={cat.label}
              onClick={() => setActiveCategory(cat.label === activeCategory ? null : cat.label)}
              style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${activeCategory === cat.label ? cat.color + '60' : 'var(--border)'}`, background: activeCategory === cat.label ? cat.color + '18' : 'var(--surface)', color: activeCategory === cat.label ? cat.color : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'Lexend, sans-serif', fontWeight: 500, transition: 'all 0.1s' }}
            >
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Command tables */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.length === 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '48px 20px', textAlign: 'center' }}>
            <Hash size={24} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 10px' }} />
            <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No commands match "{search}"</div>
          </div>
        )}
        {filtered.map(cat => (
          <div key={cat.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: `${cat.color}0c` }}>
              <span style={{ fontSize: 18 }}>{cat.emoji}</span>
              <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{cat.label}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', background: 'var(--elevated)', padding: '2px 8px', borderRadius: 6 }}>{cat.commands.length} commands</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--elevated)' }}>
                  {['Type', 'Syntax', 'Description'].map(h => (
                    <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cat.commands.map(cmd => (
                  <tr key={cmd.name} className="data-row" style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', width: 48 }}>
                      {cmd.slash && (
                        <span style={{ background: '#5865f218', color: '#818cf8', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>/</span>
                      )}
                      {cmd.prefix && (
                        <span style={{ background: '#22c55e18', color: '#22c55e', borderRadius: 5, padding: '2px 7px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>~</span>
                      )}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text)', background: 'var(--elevated)', padding: '3px 8px', borderRadius: 5, display: 'inline-block' }}>{cmd.syntax}</code>
                    </td>
                    <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-muted)' }}>{cmd.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Search, Terminal, ChevronDown, ChevronUp } from 'lucide-react';

interface Cmd {
  syntax: string;
  description: string;
  type: 'slash' | 'prefix' | 'both';
  perms?: string;
}

interface Category {
  label: string;
  emoji: string;
  accent: string;
  description: string;
  commands: Cmd[];
}

const CATEGORIES: Category[] = [
  {
    label: 'Moderation', emoji: '🛡️', accent: '#ef4444',
    description: 'Ban, kick, timeout, warn, purge and lock channels. Requires Mod or Admin role.',
    commands: [
      { syntax: '/ban @user [reason]',               type: 'both',   perms: 'Mod+',         description: 'Permanently ban a member from the server. Logged to audit channel.' },
      { syntax: '/kick @user [reason]',              type: 'both',   perms: 'Mod+',         description: 'Kick a member. They can rejoin if the server is open.' },
      { syntax: '/timeout @user <minutes> [reason]', type: 'both',   perms: 'Mod+',         description: "Mute a member for N minutes using Discord's native timeout feature." },
      { syntax: '/untimeout @user',                  type: 'both',   perms: 'Mod+',         description: "Remove a member's active timeout early." },
      { syntax: '/warn @user [reason]',              type: 'both',   perms: 'Mod+',         description: 'Issue a formal warning. Saved to database and visible on the dashboard.' },
      { syntax: '/warnremove @user <#>',             type: 'both',   perms: 'Mod+',         description: 'Remove warning #N from a member.' },
      { syntax: '/purge <amount> [@user]',           type: 'both',   perms: 'Mod+',         description: 'Bulk-delete 1-100 messages. Optionally filter by a specific user.' },
      { syntax: '/lock [channel]',                   type: 'both',   perms: 'Mod+',         description: 'Lock a channel - prevents @everyone from sending messages.' },
      { syntax: '/unlock [channel]',                 type: 'both',   perms: 'Mod+',         description: 'Unlock a channel, restoring @everyone send permissions.' },
    ],
  },
  {
    label: 'Auto-Response Triggers', emoji: '⚡', accent: '#06b6d4',
    description: 'Automatically reply when a message matches a phrase. Supports regex, cooldowns, embed responses and more.',
    commands: [
      { syntax: '~addtrigger <phrase> | <response>',  type: 'prefix', perms: 'Manage Server', description: 'Create a trigger. Pipe | separates phrase from response.' },
      { syntax: '~edittrigger <phrase> | <response>', type: 'prefix', perms: 'Manage Server', description: 'Update the response of an existing trigger.' },
      { syntax: '~deltrigger <phrase>',               type: 'prefix', perms: 'Manage Server', description: 'Permanently delete a trigger.' },
      { syntax: '~triggerenable <phrase>',            type: 'prefix', perms: 'Manage Server', description: 'Re-enable a disabled trigger.' },
      { syntax: '~triggerdisable <phrase>',           type: 'prefix', perms: 'Manage Server', description: 'Disable a trigger without deleting it.' },
      { syntax: '~triggers [page]',                   type: 'prefix', perms: 'Everyone',      description: 'List all triggers with status, match type, response type and use count.' },
      { syntax: '~triggerinfo <phrase>',              type: 'prefix', perms: 'Everyone',      description: 'Show every detail of one trigger.' },
      { syntax: '~triggerset <phrase> <field> <val>', type: 'prefix', perms: 'Manage Server', description: 'Set: type (contains/exact/startswith/endswith/regex), rtype (text/embed/reply/dm), cooldown, perm, channel, deletemsg, title, color.' },
      { syntax: '~triggerimport',                     type: 'prefix', perms: 'Admin+',        description: 'Bulk-import triggers. Paste multiple phrase | response lines.' },
    ],
  },
  {
    label: 'Tickets', emoji: '🎫', accent: '#ec4899',
    description: 'Full ticket system with persistent panels, staff assignment, transcripts, and ratings.',
    commands: [
      { syntax: '/ticket-panel create <channel> <name> [options]', type: 'slash', perms: 'Admin+', description: 'Create a panel with a persistent Open Ticket button. Options: title, desc, label, color.' },
      { syntax: '/ticket-panel list',                              type: 'slash', perms: 'Admin+', description: 'List all panels with open ticket counts.' },
      { syntax: '/ticket-panel edit <id> [options]',              type: 'slash', perms: 'Admin+', description: "Edit a panel's label, message or button colour." },
      { syntax: '/ticket-panel delete <id>',                      type: 'slash', perms: 'Admin+', description: 'Remove a panel and its associated tickets.' },
      { syntax: '/ticket list [status]',                          type: 'slash', perms: 'Mod+',   description: 'List open/closed/all tickets for this server.' },
      { syntax: '/ticket close <id>',                             type: 'slash', perms: 'Mod+',   description: 'Close a ticket, generate a transcript, and DM a rating request.' },
      { syntax: '/ticket claim <id>',                             type: 'slash', perms: 'Mod+',   description: 'Assign the ticket to yourself.' },
      { syntax: '/ticket unclaim <id>',                           type: 'slash', perms: 'Mod+',   description: 'Release your claim on a ticket.' },
      { syntax: '/ticket transcript',                             type: 'slash', perms: 'Mod+',   description: 'Download a .txt transcript of the current ticket channel.' },
      { syntax: '/ticket stats',                                  type: 'slash', perms: 'Mod+',   description: 'Server-wide ticket statistics.' },
    ],
  },
  {
    label: 'Votes', emoji: '🗳️', accent: '#6366f1',
    description: 'Create timed polls with up to 10 options, optional anonymity, and channel targeting.',
    commands: [
      { syntax: '/votecreate <question> <options> [duration] [anon] [channel]', type: 'slash', perms: 'Mod+',    description: 'Create a poll. Options are comma-separated. Duration in minutes (default 1440 = 24h).' },
      { syntax: '/voteresults <vote_id>',                                       type: 'slash', perms: 'Everyone', description: 'Show the current or final tally for a vote.' },
      { syntax: '/voteinfo <vote_id>',                                          type: 'slash', perms: 'Everyone', description: 'Show metadata - creator, end time, option list.' },
      { syntax: '/vote',                                                         type: 'slash', perms: 'Everyone', description: 'Vote help overview and quick reference.' },
    ],
  },
  {
    label: 'Info System', emoji: '📖', accent: '#f59e0b',
    description: 'A searchable, embed-based knowledge base. Organised by section > subcategory > topic.',
    commands: [
      { syntax: '/infoview <topic_id>',                  type: 'slash',  perms: 'Everyone', description: 'Display an info topic embed in the current channel.' },
      { syntax: '/newtopic <section> <name> [emoji]',    type: 'both',   perms: 'Admin+',   description: 'Create a new info topic using a modal form.' },
      { syntax: '/edittopic <section> <topic_id>',       type: 'both',   perms: 'Admin+',   description: 'Edit an existing info topic (title, description, colour, image).' },
      { syntax: '/deletetopic <section> <topic_id>',     type: 'both',   perms: 'Admin+',   description: 'Permanently delete a topic.' },
      { syntax: '/addimages <section> <topic_id>',       type: 'both',   perms: 'Admin+',   description: 'Add or replace the image and thumbnail on a topic.' },
      { syntax: '/newcategory <section> <name> [emoji]', type: 'both',   perms: 'Admin+',   description: 'Add a new subcategory to a section.' },
      { syntax: '/editcategory <section> <old> <new>',   type: 'both',   perms: 'Admin+',   description: 'Rename a subcategory across all its topics.' },
      { syntax: '/editsubcategory <section> <name>',     type: 'both',   perms: 'Admin+',   description: 'Rename a subcategory and set its emoji via modal.' },
      { syntax: '/deletecategory <section> <name>',      type: 'both',   perms: 'Admin+',   description: 'Delete a subcategory and all its topics.' },
      { syntax: '/infolist [section]',                   type: 'both',   perms: 'Admin+',   description: 'List all topics, or filter to a specific section.' },
      { syntax: '/infostats',                            type: 'both',   perms: 'Admin+',   description: "Show view counts per topic - useful for seeing what's most read." },
      { syntax: '/inforeset <section>',                  type: 'both',   perms: 'Admin+',   description: 'Reset view counters for a section.' },
      { syntax: '/infohelp',                             type: 'slash',  perms: 'Everyone', description: 'Show in-Discord info system help.' },
    ],
  },
  {
    label: 'Roles', emoji: '🏷️', accent: '#14b8a6',
    description: 'Reaction roles, button roles, and direct role management for members.',
    commands: [
      { syntax: '/reactionrole add <msg_id> <channel> <emoji> <role>', type: 'slash', perms: 'Admin+', description: 'Register an emoji reaction to role mapping. Bot adds the reaction automatically.' },
      { syntax: '/reactionrole remove <id>',                           type: 'slash', perms: 'Admin+', description: 'Remove a reaction role entry by its ID.' },
      { syntax: '/reactionrole list',                                  type: 'slash', perms: 'Admin+', description: 'Show all reaction roles configured for this server.' },
      { syntax: '/buttonrole setup <channel> <role> [options]',        type: 'slash', perms: 'Admin+', description: 'Send a button-role message. Options: label, emoji, style (primary/secondary/success/danger), message text.' },
      { syntax: '/buttonrole remove <id>',                             type: 'slash', perms: 'Admin+', description: 'Unregister a button role entry.' },
      { syntax: '/buttonrole list',                                    type: 'slash', perms: 'Admin+', description: 'Show all button roles configured for this server.' },
      { syntax: '/addrole @user @role',                                type: 'both',  perms: 'Admin+', description: 'Manually give a role to a member.' },
      { syntax: '/removerole @user @role',                             type: 'both',  perms: 'Admin+', description: 'Remove a role from a member.' },
    ],
  },
  {
    label: 'Activity & Leaderboard', emoji: '📊', accent: '#22c55e',
    description: 'Track real message activity - no XP or fake levels. Automatically updated on every message.',
    commands: [
      { syntax: '~leaderboard [top]', type: 'prefix', perms: 'Everyone', description: 'Top active members by message count. Default top 10, max 25. Shows an activity bar.' },
      { syntax: '~rank [@user]',      type: 'prefix', perms: 'Everyone', description: "Show your (or another member's) rank, message count, and percentile." },
      { syntax: '~activity',          type: 'prefix', perms: 'Everyone', description: 'Server-wide activity snapshot: active members, 24h/7d counts, total messages, top 5.' },
    ],
  },
  {
    label: 'Blacklist / Word Filter', emoji: '🚫', accent: '#dc2626',
    description: 'Auto-moderate messages containing blacklisted words with progressive timeouts (10/15/20/25... minutes).',
    commands: [
      { syntax: '~bw <word>',                 type: 'prefix', perms: 'Admin', description: 'Add a word to the blacklist. Uses exact word matching.' },
      { syntax: '~removebw <word>',           type: 'prefix', perms: 'Admin', description: 'Remove a word from the blacklist.' },
      { syntax: '~listbw',                    type: 'prefix', perms: 'Admin', description: 'List all blacklisted words (hidden in spoiler tags for privacy).' },
      { syntax: '~checkbwviolations [@user]', type: 'prefix', perms: 'Admin', description: "Check a user's violation count and their next punishment duration." },
      { syntax: '~clearbwviolations @user',   type: 'prefix', perms: 'Admin', description: "Reset a user's violation counter to zero." },
    ],
  },
  {
    label: 'Embeds', emoji: '🖼️', accent: '#f97316',
    description: 'Save named embeds and send them on demand with a single command.',
    commands: [
      { syntax: '/addembed <name> <content>',  type: 'both', perms: 'Admin+',   description: 'Save a new embed to the database.' },
      { syntax: '/editembed <name> <content>', type: 'both', perms: 'Admin+',   description: 'Edit an existing saved embed.' },
      { syntax: '/delembed <name>',            type: 'both', perms: 'Admin+',   description: 'Delete a saved embed.' },
      { syntax: '/sendembed <name>',           type: 'both', perms: 'Mod+',     description: 'Send a saved embed to the current channel.' },
      { syntax: '/listembeds',                 type: 'both', perms: 'Everyone', description: 'List all saved embeds for this server.' },
    ],
  },
  {
    label: 'Logging', emoji: '📋', accent: '#64748b',
    description: 'Configure per-type log channels. All log types are independent and can point to different channels.',
    commands: [
      { syntax: '/setalllogs <channel>',      type: 'slash', perms: 'Admin', description: 'Point all log types to a single channel at once.' },
      { syntax: '/setmessagelog <channel>',   type: 'slash', perms: 'Admin', description: 'Log message edits and deletions.' },
      { syntax: '/setchannellog <channel>',   type: 'slash', perms: 'Admin', description: 'Log channel creates, deletes and updates.' },
      { syntax: '/setrolelog <channel>',      type: 'slash', perms: 'Admin', description: 'Log role creates, deletes, updates and member role changes.' },
      { syntax: '/setserverlog <channel>',    type: 'slash', perms: 'Admin', description: 'Log bans, unbans, kicks and server-level events.' },
      { syntax: '/setmodlog <channel>',       type: 'slash', perms: 'Admin', description: 'Log mod actions from bot commands (warn, timeout, etc.).' },
      { syntax: '/setticketlog <channel>',    type: 'slash', perms: 'Admin', description: 'Log ticket open/close/claim events.' },
      { syntax: '/setblacklistlog <channel>', type: 'slash', perms: 'Admin', description: 'Log blacklist violations with user, word used, and timeout applied.' },
      { syntax: '/viewlogs',                  type: 'slash', perms: 'Admin', description: 'View all configured log channels.' },
      { syntax: '/testlogs',                  type: 'slash', perms: 'Admin', description: 'Diagnose all log channels - shows which are reachable and which are missing.' },
      { syntax: '/removealllogs',             type: 'slash', perms: 'Admin', description: 'Clear all log channel configurations for this server.' },
    ],
  },
  {
    label: 'Raid Scanner', emoji: '📡', accent: '#a855f7',
    description: 'Watches a source channel for Pokemon raid leaderboard embeds and automatically relocates matching ones.',
    commands: [
      { syntax: '~setscan_source', type: 'both', perms: 'Admin+', description: 'Set the current channel as the Scanner Source - bot watches here for raid embeds.' },
      { syntax: '~setscan_target', type: 'both', perms: 'Admin+', description: 'Set the current channel as the Scanner Target - matching embeds are moved here.' },
      { syntax: '~scan_add <name>', type: 'both', perms: 'Admin+', description: 'Add a Pokemon name to the watchlist (e.g. Koraidon).' },
      { syntax: '~scan_remove <name>', type: 'both', perms: 'Admin+', description: 'Remove a Pokemon from the watchlist.' },
      { syntax: '~scan_list',     type: 'both', perms: 'Admin+', description: 'Show current source/target channel and full watchlist.' },
    ],
  },
  {
    label: 'Utility', emoji: '🔧', accent: '#94a3b8',
    description: 'Public utility commands anyone can use.',
    commands: [
      { syntax: '~ping',              type: 'both',   perms: 'Everyone', description: "Check the bot's WebSocket latency in milliseconds." },
      { syntax: '~userinfo [@user]',  type: 'prefix', perms: 'Everyone', description: 'Show account details, join date, and role list for a user.' },
      { syntax: '~serverinfo',        type: 'prefix', perms: 'Everyone', description: 'Show server stats - members, channels, roles, boosts, verification level.' },
      { syntax: '~avatar [@user]',    type: 'prefix', perms: 'Everyone', description: "Display a user's full-size avatar with a direct link." },
      { syntax: '/help [command]',    type: 'both',   perms: 'Everyone', description: 'Open the interactive paginated help menu in Discord. Optionally get detail on one command.' },
    ],
  },
];

const TYPE_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  slash:  { bg: '#5865f218', color: '#818cf8', label: '/' },
  prefix: { bg: '#22c55e18', color: '#22c55e', label: '~' },
  both:   { bg: '#f59e0b18', color: '#f59e0b', label: '/~' },
};

const PERM_COLOR: Record<string, string> = {
  'Everyone':      '#6b7280',
  'Mod+':          '#3b82f6',
  'Admin+':        '#8b5cf6',
  'Admin':         '#8b5cf6',
  'Manage Server': '#06b6d4',
};

interface Props { guildId: string; }

export default function HelpPage({ guildId: _guildId }: Props) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpand = (label: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const filtered = CATEGORIES.map(cat => ({
    ...cat,
    commands: cat.commands.filter(c => {
      const q = search.toLowerCase();
      return !q || c.syntax.toLowerCase().includes(q) || c.description.toLowerCase().includes(q);
    }),
  })).filter(cat => cat.commands.length > 0 && (!activeCategory || cat.label === activeCategory));

  const totalCmds = CATEGORIES.reduce((s, c) => s + c.commands.length, 0);

  return (
    <div className="animate-fade">

      {/* Header */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 22px', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <div style={{ width: 42, height: 42, borderRadius: 12, background: 'linear-gradient(135deg,#5865f2,#7983f5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Terminal size={20} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>Homunculus — Command Reference</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {totalCmds} commands across {CATEGORIES.length} categories &nbsp;·&nbsp;
              <span style={{ color: '#818cf8' }}>Run <code style={{ fontSize: 11 }}>/help</code> in Discord for the interactive menu</span>
            </div>
          </div>
        </div>
        <div style={{ position: 'relative', minWidth: 230 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-faint)' }} />
          <input className="inp" style={{ paddingLeft: 30, fontSize: 13 }} placeholder="Search commands…" value={search}
            onChange={e => { setSearch(e.target.value); setActiveCategory(null); }} />
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {Object.entries(TYPE_BADGE).map(([k, v]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
            <span style={{ background: v.bg, color: v.color, borderRadius: 5, padding: '1px 8px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }}>{v.label}</span>
            {k === 'slash' ? 'Slash command' : k === 'prefix' ? 'Prefix (~)' : 'Both slash & prefix'}
          </span>
        ))}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto', flexWrap: 'wrap' }}>
          Permissions:
          {(['Everyone', 'Mod+', 'Admin+'] as const).map(k => (
            <span key={k} style={{ background: (PERM_COLOR[k] ?? '#6b7280') + '22', color: PERM_COLOR[k] ?? '#6b7280', borderRadius: 4, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>{k}</span>
          ))}
        </div>
      </div>

      {/* Category filter pills */}
      {!search && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 18 }}>
          <button onClick={() => setActiveCategory(null)}
            style={{ padding: '5px 13px', borderRadius: 20, border: '1px solid var(--border)', background: !activeCategory ? 'var(--primary-subtle)' : 'var(--surface)', color: !activeCategory ? '#818cf8' : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'Lexend, sans-serif', fontWeight: 500 }}>
            All
          </button>
          {CATEGORIES.map(cat => (
            <button key={cat.label} onClick={() => setActiveCategory(cat.label === activeCategory ? null : cat.label)}
              style={{ padding: '5px 13px', borderRadius: 20, border: `1px solid ${activeCategory === cat.label ? cat.accent + '80' : 'var(--border)'}`, background: activeCategory === cat.label ? cat.accent + '18' : 'var(--surface)', color: activeCategory === cat.label ? cat.accent : 'var(--text-muted)', cursor: 'pointer', fontSize: 12, fontFamily: 'Lexend, sans-serif', fontWeight: 500, transition: 'all 0.1s' }}>
              {cat.emoji} {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Command cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '48px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            No commands match "{search}"
          </div>
        )}
        {filtered.map(cat => {
          const isOpen = expanded.has(cat.label) || !!search || !!activeCategory;
          return (
            <div key={cat.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', borderTop: `3px solid ${cat.accent}` }}>

              {/* Collapsible header */}
              <button onClick={() => toggleExpand(cat.label)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{cat.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 650, fontSize: 14, color: 'var(--text)' }}>{cat.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{cat.description}</div>
                </div>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--elevated)', padding: '2px 9px', borderRadius: 6, flexShrink: 0 }}>{cat.commands.length} cmds</span>
                {isOpen
                  ? <ChevronUp size={15} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                  : <ChevronDown size={15} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />}
              </button>

              {/* Command rows */}
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)' }}>
                  {cat.commands.map((cmd, i) => {
                    const badge = TYPE_BADGE[cmd.type];
                    const permColor = cmd.perms ? (PERM_COLOR[cmd.perms] ?? '#6b7280') : '#6b7280';
                    return (
                      <div key={i} className="data-row"
                        style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, padding: '12px 18px', borderBottom: i < cat.commands.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'start' }}>

                        {/* Type badge */}
                        <div style={{ paddingTop: 3 }}>
                          <span style={{ background: badge.bg, color: badge.color, borderRadius: 5, padding: '2px 6px', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, display: 'inline-block' }}>{badge.label}</span>
                        </div>

                        {/* Syntax + description */}
                        <div>
                          <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--text)', background: 'var(--elevated)', padding: '3px 9px', borderRadius: 5, display: 'inline-block', marginBottom: 5 }}>{cmd.syntax}</code>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>{cmd.description}</div>
                        </div>

                        {/* Permission badge */}
                        {cmd.perms && (
                          <div style={{ paddingTop: 3, flexShrink: 0 }}>
                            <span style={{ background: permColor + '20', color: permColor, borderRadius: 5, padding: '2px 8px', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-block' }}>{cmd.perms}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

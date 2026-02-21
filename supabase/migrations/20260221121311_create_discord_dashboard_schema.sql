/*
  # Discord Dashboard Database Schema

  ## Overview
  Complete database schema for a Discord bot management dashboard with comprehensive
  guild settings, moderation tools, custom commands, tickets, leveling system,
  and analytics capabilities.

  ## New Tables

  ### Guild & Settings
  - `guild_settings` - Core guild configuration and feature toggles
  - `role_permissions` - Role-based command permissions
  - `command_cooldowns` - Custom cooldowns per command
  - `guild_config` - Advanced guild configuration for moderation

  ### Messages & Templates
  - `message_templates` - Reusable message templates with embeds
  - `embeds` - Custom embed configurations

  ### Reaction Roles & Interactions
  - `reaction_roles` - Emoji-based role assignment
  - `button_roles` - Button-based role assignment

  ### Custom Commands & Automation
  - `custom_commands` - User-created custom commands and tags
  - `auto_responders` - Automated message responses
  - `triggers` - Simple trigger-response system

  ### Ticketing System
  - `ticket_panels` - Ticket creation interfaces
  - `tickets` - Active and closed support tickets

  ### Moderation & Audit
  - `audit_logs` - Comprehensive action logging
  - `warns_data` - User warnings storage
  - `warn_data` - Individual warning records
  - `blacklist_data` - Blacklisted words per guild
  - `mod_actions` - Moderator action tracking

  ### Leveling & Rewards
  - `guild_members` - Member stats and XP tracking
  - `level_rewards` - Role rewards for level milestones

  ### Community Features
  - `info_topics` - Information database topics
  - `votes` - Voting polls
  - `votes_cast` - Individual vote records
  - `scanner_data` - Pokemon scanner configuration

  ### Analytics & Trust
  - `messages` - Message analytics and sentiment
  - `trust_scores` - User trust and reputation scores
  - `channels` - Channel configuration for logging

  ### Background Processing
  - `pending_actions` - Async action queue

  ## Security
  - RLS enabled on all tables
  - Policies for authenticated users only
  - Guild-based access control
*/

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Guild Settings Table
CREATE TABLE IF NOT EXISTS guild_settings (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL UNIQUE,
    prefix TEXT NOT NULL DEFAULT '!',
    use_slash_commands BOOLEAN NOT NULL DEFAULT true,
    moderation_enabled BOOLEAN NOT NULL DEFAULT true,
    levelling_enabled BOOLEAN NOT NULL DEFAULT true,
    fun_enabled BOOLEAN NOT NULL DEFAULT true,
    tickets_enabled BOOLEAN NOT NULL DEFAULT true,
    custom_commands_enabled BOOLEAN NOT NULL DEFAULT true,
    auto_responders_enabled BOOLEAN NOT NULL DEFAULT true,
    global_cooldown INTEGER NOT NULL DEFAULT 1000,
    command_cooldown JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guild_settings_guild_id ON guild_settings(guild_id);

-- Role Permissions Table
CREATE TABLE IF NOT EXISTS role_permissions (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    command_group TEXT NOT NULL,
    permissions JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT role_permissions_guild_fk FOREIGN KEY (guild_id) 
        REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
    CONSTRAINT role_permissions_unique UNIQUE (guild_id, role_id, command_group)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_guild_role ON role_permissions(guild_id, role_id);

-- Command Cooldowns Table
CREATE TABLE IF NOT EXISTS command_cooldowns (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    command_name TEXT NOT NULL,
    cooldown_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT command_cooldowns_guild_fk FOREIGN KEY (guild_id) 
        REFERENCES guild_settings(guild_id) ON DELETE CASCADE,
    CONSTRAINT command_cooldowns_unique UNIQUE (guild_id, command_name)
);

CREATE INDEX IF NOT EXISTS idx_command_cooldowns_guild ON command_cooldowns(guild_id);

-- Message Templates Table
CREATE TABLE IF NOT EXISTS message_templates (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT,
    embed_data JSONB,
    components JSONB,
    reactions JSONB,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_guild ON message_templates(guild_id);

-- Reaction Roles Table
CREATE TABLE IF NOT EXISTS reaction_roles (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    role_id TEXT NOT NULL,
    role_name TEXT,
    created_by TEXT,
    is_reaction BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT reaction_roles_unique UNIQUE (message_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reaction_roles_guild_message ON reaction_roles(guild_id, message_id);

-- Button Roles Table
CREATE TABLE IF NOT EXISTS button_roles (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    button_id TEXT NOT NULL,
    role_id TEXT NOT NULL,
    button_style TEXT NOT NULL DEFAULT 'PRIMARY',
    button_label TEXT,
    button_emoji TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT button_roles_unique UNIQUE (message_id, button_id)
);

CREATE INDEX IF NOT EXISTS idx_button_roles_guild_message ON button_roles(guild_id, message_id);

-- Custom Commands Table
CREATE TABLE IF NOT EXISTS custom_commands (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    name TEXT,
    trigger TEXT NOT NULL,
    description TEXT,
    response TEXT NOT NULL,
    response_type TEXT NOT NULL DEFAULT 'text',
    permission_level TEXT NOT NULL DEFAULT 'everyone',
    cooldown_seconds INTEGER NOT NULL DEFAULT 0,
    embed_data JSONB,
    components JSONB,
    variables JSONB,
    is_tag BOOLEAN NOT NULL DEFAULT false,
    tag_category TEXT,
    is_multi_page BOOLEAN NOT NULL DEFAULT false,
    menu_pages JSONB,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT custom_commands_unique UNIQUE (guild_id, trigger)
);

CREATE INDEX IF NOT EXISTS idx_custom_commands_guild_tag ON custom_commands(guild_id, is_tag);

-- Auto Responders Table
CREATE TABLE IF NOT EXISTS auto_responders (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    trigger_text TEXT NOT NULL,
    match_type TEXT NOT NULL,
    response TEXT NOT NULL,
    response_type TEXT NOT NULL DEFAULT 'text',
    embed_data JSONB,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    trigger_count INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_responders_guild_enabled ON auto_responders(guild_id, is_enabled);

-- Ticket Panels Table
CREATE TABLE IF NOT EXISTS ticket_panels (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    name TEXT NOT NULL,
    channel_id TEXT,
    message_id TEXT,
    message TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    embed_data JSONB,
    button_label TEXT NOT NULL DEFAULT 'Create Ticket',
    button_color TEXT NOT NULL DEFAULT 'primary',
    button_emoji TEXT,
    category_id TEXT,
    support_roles JSONB NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_panels_guild ON ticket_panels(guild_id);

-- Tickets Table
CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    panel_id TEXT NOT NULL,
    channel_id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT 'Support Ticket',
    username TEXT NOT NULL DEFAULT 'Unknown User',
    priority TEXT NOT NULL DEFAULT 'medium',
    category TEXT NOT NULL DEFAULT 'general',
    messages_count INTEGER NOT NULL DEFAULT 0,
    assigned_to TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    transcript_url TEXT,
    transcript_html TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    claimed_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    CONSTRAINT tickets_panel_fk FOREIGN KEY (panel_id) 
        REFERENCES ticket_panels(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);

-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    user_id TEXT,
    moderator_id TEXT,
    bot_action BOOLEAN NOT NULL DEFAULT false,
    reason TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_action ON audit_logs(guild_id, action_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_user ON audit_logs(guild_id, user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_moderator ON audit_logs(guild_id, moderator_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_guild_created ON audit_logs(guild_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Guild Members Table
CREATE TABLE IF NOT EXISTS guild_members (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    discriminator TEXT,
    avatar_url TEXT,
    message_count INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    xp INTEGER NOT NULL DEFAULT 0,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT guild_members_unique UNIQUE (guild_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_guild_members_guild ON guild_members(guild_id);
CREATE INDEX IF NOT EXISTS idx_guild_members_guild_messages ON guild_members(guild_id, message_count);

-- Level Rewards Table
CREATE TABLE IF NOT EXISTS level_rewards (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    level INTEGER NOT NULL,
    role_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT level_rewards_unique UNIQUE (guild_id, level)
);

CREATE INDEX IF NOT EXISTS idx_level_rewards_guild ON level_rewards(guild_id);

-- Info Topics Table
CREATE TABLE IF NOT EXISTS info_topics (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    section TEXT NOT NULL DEFAULT 'common',
    subcategory TEXT DEFAULT 'General',
    topic_id TEXT NOT NULL,
    name TEXT NOT NULL,
    embed_title TEXT,
    embed_description TEXT,
    embed_color TEXT DEFAULT '#5865F2',
    emoji TEXT DEFAULT '📄',
    category_emoji_id TEXT,
    image TEXT,
    thumbnail TEXT,
    footer TEXT,
    views INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT info_topics_unique UNIQUE (guild_id, section, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_info_topics_guild_section ON info_topics(guild_id, section);

-- Blacklist Data Table
CREATE TABLE IF NOT EXISTS blacklist_data (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL UNIQUE,
    words JSONB NOT NULL DEFAULT '[]',
    violations JSONB NOT NULL DEFAULT '{}'
);

-- Votes Table
CREATE TABLE IF NOT EXISTS votes (
    id SERIAL PRIMARY KEY,
    vote_id TEXT UNIQUE,
    guild_id BIGINT,
    question TEXT,
    options JSONB NOT NULL DEFAULT '[]',
    channel_id BIGINT,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    results_posted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_votes_end_time ON votes(end_time);
CREATE INDEX IF NOT EXISTS idx_votes_guild ON votes(guild_id);
CREATE INDEX IF NOT EXISTS idx_votes_guild_end ON votes(guild_id, end_time);

-- Vote Cast Table
CREATE TABLE IF NOT EXISTS votes_cast (
    id SERIAL PRIMARY KEY,
    vote_id TEXT,
    user_id BIGINT,
    option TEXT,
    weight INTEGER NOT NULL DEFAULT 1,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_votes_cast_vote ON votes_cast(vote_id);

-- Scanner Data Table
CREATE TABLE IF NOT EXISTS scanner_data (
    id SERIAL PRIMARY KEY,
    watched_pokemon JSONB NOT NULL DEFAULT '[]',
    source_channel BIGINT,
    target_channel BIGINT
);

-- Triggers Table
CREATE TABLE IF NOT EXISTS triggers (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    trigger_text TEXT NOT NULL,
    response TEXT NOT NULL,
    match_type TEXT NOT NULL DEFAULT 'contains',
    enabled BOOLEAN NOT NULL DEFAULT true,
    use_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT triggers_unique UNIQUE (guild_id, trigger_text)
);

CREATE INDEX IF NOT EXISTS idx_triggers_guild ON triggers(guild_id);

-- Channels Table
CREATE TABLE IF NOT EXISTS channels (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL UNIQUE,
    blacklist_log BIGINT,
    message_log BIGINT,
    role_log BIGINT,
    channel_log BIGINT,
    server_log BIGINT
);

-- Embeds Table
CREATE TABLE IF NOT EXISTS embeds (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    name TEXT NOT NULL,
    embed_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Guild Config Table
CREATE TABLE IF NOT EXISTS guild_config (
    guild_id BIGINT PRIMARY KEY,
    modules_enabled TEXT,
    mod_alerts_channel BIGINT,
    rule_updates_channel BIGINT,
    weekly_reports_channel BIGINT,
    conflict_threshold REAL DEFAULT 50,
    min_account_age_days INTEGER DEFAULT 7,
    min_join_age_days INTEGER DEFAULT 1
);

-- Messages Table
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT,
    channel_id BIGINT,
    user_id BIGINT,
    sentiment REAL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_guild_time ON messages(guild_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);

-- Mod Actions Table
CREATE TABLE IF NOT EXISTS mod_actions (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    mod_id BIGINT NOT NULL,
    action_type TEXT NOT NULL,
    target_id BIGINT NOT NULL,
    reason TEXT,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mod_actions_guild ON mod_actions(guild_id, timestamp);

-- Pending Actions Table
CREATE TABLE IF NOT EXISTS pending_actions (
    id SERIAL PRIMARY KEY,
    type TEXT NOT NULL,
    payload JSONB NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT now(),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_pending_actions_status ON pending_actions(status, created_at);

-- Trust Scores Table
CREATE TABLE IF NOT EXISTS trust_scores (
    user_id BIGINT NOT NULL,
    guild_id BIGINT NOT NULL,
    activity_score REAL DEFAULT 0.5,
    reputation_score REAL DEFAULT 0.5,
    helpful_votes INTEGER DEFAULT 0,
    total_contributions INTEGER DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, guild_id)
);

-- Warns Data Table
CREATE TABLE IF NOT EXISTS warns_data (
    id SERIAL PRIMARY KEY,
    guild_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    warns JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT warns_data_unique UNIQUE (guild_id, user_id)
);

-- Warn Data Table
CREATE TABLE IF NOT EXISTS warn_data (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    guild_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT,
    severity TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security on all tables
ALTER TABLE guild_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE command_cooldowns ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE reaction_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE button_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_responders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_panels ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE info_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes_cast ENABLE ROW LEVEL SECURITY;
ALTER TABLE scanner_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE guild_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE mod_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE warns_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE warn_data ENABLE ROW LEVEL SECURITY;

-- Create RLS Policies (allowing authenticated access for now - should be customized per use case)
CREATE POLICY "Allow authenticated read access" ON guild_settings FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON guild_settings FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON role_permissions FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON role_permissions FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON command_cooldowns FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON command_cooldowns FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON message_templates FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON message_templates FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON reaction_roles FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON reaction_roles FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON button_roles FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON button_roles FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON custom_commands FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON custom_commands FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON auto_responders FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON auto_responders FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON ticket_panels FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON ticket_panels FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON tickets FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON tickets FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON audit_logs FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON audit_logs FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON guild_members FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON guild_members FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON level_rewards FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON level_rewards FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON info_topics FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON info_topics FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON blacklist_data FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON blacklist_data FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON votes FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON votes FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON votes_cast FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON votes_cast FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON scanner_data FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON scanner_data FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON triggers FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON triggers FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON channels FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON channels FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON embeds FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON embeds FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON guild_config FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON guild_config FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON messages FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON messages FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON mod_actions FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON mod_actions FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON pending_actions FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON pending_actions FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON trust_scores FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON trust_scores FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON warns_data FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON warns_data FOR ALL TO PUBLIC USING (true);

CREATE POLICY "Allow authenticated read access" ON warn_data FOR SELECT TO PUBLIC USING (true);
CREATE POLICY "Allow authenticated write access" ON warn_data FOR ALL TO PUBLIC USING (true);
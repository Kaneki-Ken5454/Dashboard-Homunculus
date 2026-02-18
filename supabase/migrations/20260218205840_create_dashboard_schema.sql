/*
  # Homunculus Dashboard - Initial Schema

  ## Overview
  This migration creates the core database schema for the Homunculus Discord governance dashboard.
  
  ## New Tables
  
  ### 1. `discord_guilds`
  Stores information about Discord servers using the bot
  - `id` (uuid, primary key)
  - `guild_id` (text, unique) - Discord Guild ID
  - `guild_name` (text) - Server name
  - `created_at` (timestamptz)
  - `settings` (jsonb) - Guild-specific settings
  
  ### 2. `members`
  Tracks Discord server members and their activity
  - `id` (uuid, primary key)
  - `guild_id` (text, foreign key)
  - `user_id` (text) - Discord User ID
  - `username` (text) - Discord username
  - `discriminator` (text) - Discord discriminator
  - `avatar_url` (text) - User avatar
  - `joined_at` (timestamptz) - When they joined the server
  - `last_active` (timestamptz) - Last activity timestamp
  - `message_count` (integer, default 0) - Total messages sent
  - `vote_count` (integer, default 0) - Total votes participated in
  - `role_ids` (text[]) - Array of role IDs
  - `created_at` (timestamptz)
  
  ### 3. `votes`
  Stores governance votes and polls
  - `id` (uuid, primary key)
  - `guild_id` (text, foreign key)
  - `question` (text) - Vote question
  - `description` (text) - Optional description
  - `options` (jsonb) - Array of vote options with vote counts
  - `created_by` (text) - User ID who created the vote
  - `channel_id` (text) - Discord channel where vote was posted
  - `message_id` (text) - Discord message ID
  - `start_time` (timestamptz)
  - `end_time` (timestamptz)
  - `is_active` (boolean, default true)
  - `total_votes` (integer, default 0)
  - `created_at` (timestamptz)
  
  ### 4. `vote_responses`
  Individual vote responses from members
  - `id` (uuid, primary key)
  - `vote_id` (uuid, foreign key)
  - `guild_id` (text, foreign key)
  - `user_id` (text) - Discord User ID
  - `option_index` (integer) - Selected option index
  - `voted_at` (timestamptz)
  
  ### 5. `embeds`
  Saved Discord embed templates
  - `id` (uuid, primary key)
  - `guild_id` (text, foreign key)
  - `name` (text) - Embed name/identifier
  - `title` (text)
  - `description` (text)
  - `color` (text) - Hex color code
  - `footer` (text)
  - `thumbnail_url` (text)
  - `image_url` (text)
  - `fields` (jsonb) - Array of embed fields
  - `created_by` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  
  ### 6. `triggers`
  Auto-response triggers for the bot
  - `id` (uuid, primary key)
  - `guild_id` (text, foreign key)
  - `trigger_text` (text) - Text to match
  - `response` (text) - Bot response
  - `match_type` (text) - 'exact', 'contains', 'starts_with', 'ends_with', 'regex'
  - `is_enabled` (boolean, default true)
  - `trigger_count` (integer, default 0) - Times triggered
  - `created_by` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  
  ### 7. `info_topics`
  Knowledge base topics
  - `id` (uuid, primary key)
  - `guild_id` (text, foreign key)
  - `category` (text) - 'common', 'general', 'staff'
  - `title` (text)
  - `content` (text)
  - `section` (text) - Sub-category
  - `view_count` (integer, default 0)
  - `created_by` (text)
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  
  ### 8. `activity_logs`
  Tracks member activity for analytics
  - `id` (uuid, primary key)
  - `guild_id` (text, foreign key)
  - `user_id` (text)
  - `activity_type` (text) - 'message', 'vote', 'reaction', 'voice_join', etc.
  - `channel_id` (text)
  - `metadata` (jsonb) - Additional activity data
  - `created_at` (timestamptz)
  
  ## Security
  - Enable Row Level Security on all tables
  - Add policies for authenticated users to read their guild data
  - Restrict write operations to authenticated users
*/

-- Create discord_guilds table
CREATE TABLE IF NOT EXISTS discord_guilds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text UNIQUE NOT NULL,
  guild_name text NOT NULL,
  settings jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create members table
CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL REFERENCES discord_guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  username text NOT NULL,
  discriminator text DEFAULT '0',
  avatar_url text,
  joined_at timestamptz DEFAULT now(),
  last_active timestamptz DEFAULT now(),
  message_count integer DEFAULT 0,
  vote_count integer DEFAULT 0,
  role_ids text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(guild_id, user_id)
);

-- Create votes table
CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL REFERENCES discord_guilds(guild_id) ON DELETE CASCADE,
  question text NOT NULL,
  description text,
  options jsonb NOT NULL DEFAULT '[]',
  created_by text NOT NULL,
  channel_id text,
  message_id text,
  start_time timestamptz DEFAULT now(),
  end_time timestamptz NOT NULL,
  is_active boolean DEFAULT true,
  total_votes integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create vote_responses table
CREATE TABLE IF NOT EXISTS vote_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vote_id uuid NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
  guild_id text NOT NULL REFERENCES discord_guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  option_index integer NOT NULL,
  voted_at timestamptz DEFAULT now(),
  UNIQUE(vote_id, user_id)
);

-- Create embeds table
CREATE TABLE IF NOT EXISTS embeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL REFERENCES discord_guilds(guild_id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  description text,
  color text DEFAULT '#6366f1',
  footer text,
  thumbnail_url text,
  image_url text,
  fields jsonb DEFAULT '[]',
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(guild_id, name)
);

-- Create triggers table
CREATE TABLE IF NOT EXISTS triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL REFERENCES discord_guilds(guild_id) ON DELETE CASCADE,
  trigger_text text NOT NULL,
  response text NOT NULL,
  match_type text NOT NULL CHECK (match_type IN ('exact', 'contains', 'starts_with', 'ends_with', 'regex')),
  is_enabled boolean DEFAULT true,
  trigger_count integer DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create info_topics table
CREATE TABLE IF NOT EXISTS info_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL REFERENCES discord_guilds(guild_id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('common', 'general', 'staff')),
  title text NOT NULL,
  content text NOT NULL,
  section text NOT NULL,
  view_count integer DEFAULT 0,
  created_by text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guild_id text NOT NULL REFERENCES discord_guilds(guild_id) ON DELETE CASCADE,
  user_id text NOT NULL,
  activity_type text NOT NULL,
  channel_id text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_members_guild_id ON members(guild_id);
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_last_active ON members(last_active DESC);
CREATE INDEX IF NOT EXISTS idx_members_message_count ON members(message_count DESC);
CREATE INDEX IF NOT EXISTS idx_votes_guild_id ON votes(guild_id);
CREATE INDEX IF NOT EXISTS idx_votes_is_active ON votes(is_active);
CREATE INDEX IF NOT EXISTS idx_vote_responses_vote_id ON vote_responses(vote_id);
CREATE INDEX IF NOT EXISTS idx_vote_responses_user_id ON vote_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_guild_id ON activity_logs(guild_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- Enable Row Level Security
ALTER TABLE discord_guilds ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE info_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for discord_guilds
CREATE POLICY "Public read access to guilds"
  ON discord_guilds FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert guilds"
  ON discord_guilds FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update guilds"
  ON discord_guilds FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for members
CREATE POLICY "Public read access to members"
  ON members FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert members"
  ON members FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update members"
  ON members FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for votes
CREATE POLICY "Public read access to votes"
  ON votes FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert votes"
  ON votes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update votes"
  ON votes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete votes"
  ON votes FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for vote_responses
CREATE POLICY "Public read access to vote responses"
  ON vote_responses FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert vote responses"
  ON vote_responses FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for embeds
CREATE POLICY "Public read access to embeds"
  ON embeds FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can manage embeds"
  ON embeds FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for triggers
CREATE POLICY "Public read access to triggers"
  ON triggers FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can manage triggers"
  ON triggers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for info_topics
CREATE POLICY "Public read access to info topics"
  ON info_topics FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can manage info topics"
  ON info_topics FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for activity_logs
CREATE POLICY "Public read access to activity logs"
  ON activity_logs FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert activity logs"
  ON activity_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

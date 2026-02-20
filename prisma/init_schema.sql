-- CreateTable
CREATE TABLE "guild_settings" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '!',
    "use_slash_commands" BOOLEAN NOT NULL DEFAULT true,
    "moderation_enabled" BOOLEAN NOT NULL DEFAULT true,
    "levelling_enabled" BOOLEAN NOT NULL DEFAULT true,
    "fun_enabled" BOOLEAN NOT NULL DEFAULT true,
    "tickets_enabled" BOOLEAN NOT NULL DEFAULT true,
    "custom_commands_enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_responders_enabled" BOOLEAN NOT NULL DEFAULT true,
    "global_cooldown" INTEGER NOT NULL DEFAULT 1000,
    "command_cooldown" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "command_group" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_cooldowns" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "command_name" TEXT NOT NULL,
    "cooldown_ms" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "command_cooldowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT,
    "embed_data" JSONB,
    "components" JSONB,
    "reactions" JSONB,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reaction_roles" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "role_name" TEXT,
    "created_by" TEXT,
    "is_reaction" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reaction_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "button_roles" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "button_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "button_style" TEXT NOT NULL DEFAULT 'PRIMARY',
    "button_label" TEXT,
    "button_emoji" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "button_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_commands" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT,
    "trigger" TEXT NOT NULL,
    "description" TEXT,
    "response" TEXT NOT NULL,
    "response_type" TEXT NOT NULL DEFAULT 'text',
    "permission_level" TEXT NOT NULL DEFAULT 'everyone',
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 0,
    "embed_data" JSONB,
    "components" JSONB,
    "variables" JSONB,
    "is_tag" BOOLEAN NOT NULL DEFAULT false,
    "tag_category" TEXT,
    "is_multi_page" BOOLEAN NOT NULL DEFAULT false,
    "menu_pages" JSONB,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_responders" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "trigger_text" TEXT NOT NULL,
    "match_type" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "response_type" TEXT NOT NULL DEFAULT 'text',
    "embed_data" JSONB,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "trigger_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_responders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_panels" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_id" TEXT,
    "message_id" TEXT,
    "message" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "embed_data" JSONB,
    "button_label" TEXT NOT NULL DEFAULT 'Create Ticket',
    "button_color" TEXT NOT NULL DEFAULT 'primary',
    "button_emoji" TEXT,
    "category_id" TEXT,
    "support_roles" JSONB NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ticket_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "panel_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Support Ticket',
    "username" TEXT NOT NULL DEFAULT 'Unknown User',
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "category" TEXT NOT NULL DEFAULT 'general',
    "messages_count" INTEGER NOT NULL DEFAULT 0,
    "assigned_to" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "transcript_url" TEXT,
    "transcript_html" TEXT,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "user_id" TEXT,
    "moderator_id" TEXT,
    "bot_action" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_members" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "discriminator" TEXT,
    "avatar_url" TEXT,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_rewards" (
    "id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "role_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "level_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "guild_settings_guild_id_key" ON "guild_settings"("guild_id");

-- CreateIndex
CREATE INDEX "guild_settings_guild_id_idx" ON "guild_settings"("guild_id");

-- CreateIndex
CREATE INDEX "role_permissions_guild_id_role_id_idx" ON "role_permissions"("guild_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_guild_id_role_id_command_group_key" ON "role_permissions"("guild_id", "role_id", "command_group");

-- CreateIndex
CREATE INDEX "command_cooldowns_guild_id_idx" ON "command_cooldowns"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "command_cooldowns_guild_id_command_name_key" ON "command_cooldowns"("guild_id", "command_name");

-- CreateIndex
CREATE INDEX "message_templates_guild_id_idx" ON "message_templates"("guild_id");

-- CreateIndex
CREATE INDEX "reaction_roles_guild_id_message_id_idx" ON "reaction_roles"("guild_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "reaction_roles_message_id_emoji_key" ON "reaction_roles"("message_id", "emoji");

-- CreateIndex
CREATE INDEX "button_roles_guild_id_message_id_idx" ON "button_roles"("guild_id", "message_id");

-- CreateIndex
CREATE UNIQUE INDEX "button_roles_message_id_button_id_key" ON "button_roles"("message_id", "button_id");

-- CreateIndex
CREATE INDEX "custom_commands_guild_id_is_tag_idx" ON "custom_commands"("guild_id", "is_tag");

-- CreateIndex
CREATE UNIQUE INDEX "custom_commands_guild_id_trigger_key" ON "custom_commands"("guild_id", "trigger");

-- CreateIndex
CREATE INDEX "auto_responders_guild_id_is_enabled_idx" ON "auto_responders"("guild_id", "is_enabled");

-- CreateIndex
CREATE INDEX "ticket_panels_guild_id_idx" ON "ticket_panels"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_channel_id_key" ON "tickets"("channel_id");

-- CreateIndex
CREATE INDEX "tickets_guild_id_status_idx" ON "tickets"("guild_id", "status");

-- CreateIndex
CREATE INDEX "tickets_user_id_idx" ON "tickets"("user_id");

-- CreateIndex
CREATE INDEX "tickets_assigned_to_idx" ON "tickets"("assigned_to");

-- CreateIndex
CREATE INDEX "audit_logs_guild_id_action_type_idx" ON "audit_logs"("guild_id", "action_type");

-- CreateIndex
CREATE INDEX "audit_logs_guild_id_user_id_idx" ON "audit_logs"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "audit_logs_guild_id_moderator_id_idx" ON "audit_logs"("guild_id", "moderator_id");

-- CreateIndex
CREATE INDEX "audit_logs_guild_id_created_at_idx" ON "audit_logs"("guild_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "guild_members_guild_id_idx" ON "guild_members"("guild_id");

-- CreateIndex
CREATE INDEX "guild_members_guild_id_message_count_idx" ON "guild_members"("guild_id", "message_count");

-- CreateIndex
CREATE UNIQUE INDEX "guild_members_guild_id_user_id_key" ON "guild_members"("guild_id", "user_id");

-- CreateIndex
CREATE INDEX "level_rewards_guild_id_idx" ON "level_rewards"("guild_id");

-- CreateIndex
CREATE UNIQUE INDEX "level_rewards_guild_id_level_key" ON "level_rewards"("guild_id", "level");

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guild_settings"("guild_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_cooldowns" ADD CONSTRAINT "command_cooldowns_guild_id_fkey" FOREIGN KEY ("guild_id") REFERENCES "guild_settings"("guild_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_panel_id_fkey" FOREIGN KEY ("panel_id") REFERENCES "ticket_panels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


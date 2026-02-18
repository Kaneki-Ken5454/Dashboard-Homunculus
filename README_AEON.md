# Aeon Discord Management System

A comprehensive Discord bot management dashboard with real-time updates, drag-and-drop message builder, advanced ticket system, and granular permission controls.

## 🚀 Features

### Module 1: Configuration & Granular Permissions
- **Prefix/Slash Toggle**: Switch between prefix commands and slash commands per guild
- **Module Toggles**: Enable/disable individual modules (Moderation, Levelling, Fun, Tickets, etc.)
- **Permission Hierarchy**: Role-based access control with command group assignments
- **Rate Limiting**: Global and command-specific cooldown management

### Module 2: Visual Interaction Builder
- **Drag-and-Drop Message Preview**: WYSIWYG editor with live Discord-style preview
- **Component Builder**: Add buttons, select menus, and other Discord components
- **Emoji Picker**: Searchable emoji library with custom server emoji support
- **Reaction/Button Roles**: Link reactions or buttons to role assignments

### Module 3: Custom Commands & Auto-Responders
- **Tag System**: Create custom text triggers with categories
- **Logic Engine**: Support for variables like `{user}`, `{server.name}`, `{channel}`
- **Multi-page Menus**: Create "book-style" reaction menus for navigation
- **Auto-Responders**: Pattern matching with exact, contains, starts_with, ends_with, and regex

### Module 4: Advanced Ticket System
- **Panel Creator**: Build multiple ticket panels (Support, Report, Billing, etc.)
- **Staff Workflow**: Claim, unclaim, close, and delete tickets with buttons
- **Transcripts**: Generate HTML transcripts on ticket closure, stored in database

### Module 5: Audit Log & Timeline Analytics
- **Timeline Feed**: Chronological feed of all bot and moderator actions
- **Advanced Filtering**: Search by User ID, Moderator ID, Action Type, or Date Range
- **Real-time Updates**: WebSocket integration for live dashboard updates

## 📋 Prerequisites

- Node.js 18+ and npm
- NeonDB PostgreSQL database (connection string provided)
- Discord Bot Token
- Discord Application with Bot scope

## 🛠️ Installation

### 1. Clone the Repository
```bash
git clone <repository-url>
cd homunculus-haven
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
# NeonDB Connection
DATABASE_URL="postgresql://neondb_owner:npg_dJjb8k0EAUGf@ep-floral-resonance-a1spd9bz-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

# Discord Bot Configuration
DISCORD_BOT_TOKEN="your_bot_token_here"
DISCORD_CLIENT_ID="your_client_id_here"

# Dashboard API
DASHBOARD_API_URL="http://localhost:3000/api"
WEBSOCKET_PORT=3001

# Environment
NODE_ENV="development"
```

### 4. Set Up Database

Generate Prisma Client:
```bash
npm run db:generate
```

Push schema to database:
```bash
npm run db:push
```

Or create a migration:
```bash
npm run db:migrate
```

### 5. Start Development Server

Frontend Dashboard:
```bash
npm run dev
```

The dashboard will be available at `http://localhost:8080`

## 📁 Project Structure

```
├── prisma/
│   └── schema.prisma          # Database schema
├── server/
│   ├── websocket-server.ts    # WebSocket server for real-time updates
│   └── api-routes.ts          # API routes structure
├── src/
│   ├── components/            # React components
│   ├── pages/                 # Dashboard pages
│   ├── lib/                   # Utilities and database operations
│   └── hooks/                 # React hooks
├── BOT_INTEGRATION_GUIDE.md   # Complete bot implementation guide
└── README_AEON.md             # This file
```

## 🗄️ Database Schema

The Prisma schema includes the following tables:

- **GuildSettings**: Server configuration and module toggles
- **RolePermission**: Role-based command permissions
- **CommandCooldown**: Command-specific rate limiting
- **MessageTemplate**: Saved message templates with embeds and components
- **ReactionRole**: Reaction-to-role mappings
- **ButtonRole**: Button-to-role mappings
- **CustomCommand**: Custom commands with variable support
- **AutoResponder**: Auto-response triggers
- **TicketPanel**: Ticket panel configurations
- **Ticket**: Ticket records with transcripts
- **AuditLog**: Comprehensive audit trail
- **GuildMember**: Member activity tracking
- **LevelReward**: Levelling system rewards

See `prisma/schema.prisma` for complete schema definition.

## 🤖 Bot Integration

To connect your Discord bot to this dashboard, refer to `BOT_INTEGRATION_GUIDE.md` for:

- Complete feature implementation guide
- API endpoint specifications
- WebSocket event documentation
- Database operation examples
- Security best practices

## 🔌 API Endpoints

The bot should expose the following REST API endpoints:

### Configuration
- `GET /api/guild/:guildId/settings` - Get guild settings
- `PUT /api/guild/:guildId/settings` - Update guild settings
- `GET /api/guild/:guildId/permissions` - Get role permissions
- `POST /api/guild/:guildId/permissions` - Create role permission
- `DELETE /api/guild/:guildId/permissions/:id` - Delete role permission

### Message Templates
- `GET /api/guild/:guildId/templates` - List templates
- `POST /api/guild/:guildId/templates` - Create template
- `PUT /api/guild/:guildId/templates/:id` - Update template
- `DELETE /api/guild/:guildId/templates/:id` - Delete template
- `POST /api/guild/:guildId/templates/:id/send` - Send template

### Custom Commands
- `GET /api/guild/:guildId/commands` - List commands
- `POST /api/guild/:guildId/commands` - Create command
- `PUT /api/guild/:guildId/commands/:id` - Update command
- `DELETE /api/guild/:guildId/commands/:id` - Delete command

### Tickets
- `GET /api/guild/:guildId/tickets` - List tickets
- `GET /api/guild/:guildId/tickets/:id` - Get ticket details
- `POST /api/guild/:guildId/tickets/:id/claim` - Claim ticket
- `POST /api/guild/:guildId/tickets/:id/close` - Close ticket
- `POST /api/guild/:guildId/tickets/:id/delete` - Delete ticket
- `GET /api/guild/:guildId/tickets/:id/transcript` - Get transcript

### Audit Logs
- `GET /api/guild/:guildId/audit-logs` - List audit logs (with filters)
- `GET /api/guild/:guildId/audit-logs/:id` - Get audit log details

### Guild Data
- `GET /api/guild/:guildId/emojis` - Get guild emojis
- `GET /api/guild/:guildId/roles` - Get guild roles
- `GET /api/guild/:guildId/channels` - Get guild channels
- `GET /api/guild/:guildId/members` - Get guild members

## 🔄 WebSocket Events

### Server → Client (Dashboard)
- `audit_log` - New audit log entry
- `ticket_update` - Ticket status change
- `command_executed` - Command usage
- `settings_update` - Settings changed
- `custom_command_update` - Custom command updated

### Client → Server (Dashboard → Bot)
- `subscribe_guild` - Subscribe to guild updates
- `unsubscribe_guild` - Unsubscribe from guild updates
- `ping` - Keep-alive ping

## 🧪 Development

### Database Operations

Generate Prisma Client:
```bash
npm run db:generate
```

Open Prisma Studio (database GUI):
```bash
npm run db:studio
```

Create a migration:
```bash
npm run db:migrate
```

### Testing

Run tests:
```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `DATABASE_URL` | NeonDB PostgreSQL connection string | Yes |
| `DISCORD_BOT_TOKEN` | Discord bot token | Yes (for bot) |
| `DISCORD_CLIENT_ID` | Discord application client ID | Yes (for bot) |
| `DASHBOARD_API_URL` | Dashboard API base URL | Yes |
| `WEBSOCKET_PORT` | WebSocket server port | No (default: 3001) |
| `NODE_ENV` | Environment mode | No (default: development) |

## 🔒 Security Considerations

1. **API Authentication**: Implement JWT tokens or API keys
2. **Permission Validation**: Always verify permissions server-side
3. **Input Sanitization**: Sanitize all user inputs
4. **Rate Limiting**: Implement API rate limiting
5. **SQL Injection**: Use Prisma parameterized queries (automatic)
6. **XSS Prevention**: Sanitize HTML in transcripts and embeds

## 🚀 Deployment

### Frontend (Dashboard)
```bash
npm run build
```

Production files will be in `dist/` directory.

### Backend (Bot)
1. Set up environment variables
2. Run database migrations
3. Start bot process
4. Start WebSocket server
5. Start API server

## 📚 Documentation

- **Bot Integration Guide**: `BOT_INTEGRATION_GUIDE.md` - Complete guide for implementing the Discord bot
- **Database Schema**: `prisma/schema.prisma` - Prisma schema with all tables
- **API Routes**: `server/api-routes.ts` - API endpoint structure

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

[Your License Here]

## 🆘 Support

For issues, questions, or contributions, please open an issue on GitHub.

---

**Version**: 1.0.0  
**Last Updated**: 2026-02-19

# Homunculus Dashboard - Setup Guide

## Overview
The Homunculus Dashboard is a comprehensive Discord governance and community management platform with real-time database integration, user activity tracking, and administrative tools.

## Features Implemented

### 1. Database Integration
- Full Supabase integration with PostgreSQL backend
- Comprehensive schema for Discord server management
- Row Level Security (RLS) policies for data protection
- Real-time data synchronization

### 2. Core Functionality
- **Overview Dashboard**: Real-time statistics, activity charts, and channel analytics
- **Active Users**: Leaderboard system showing most active members by messages, votes, and recent activity
- **Votes**: Create and manage governance votes with live results
- **Embeds**: Visual embed builder for Discord messages
- **Info System**: Knowledge base with categorized topics
- **Triggers**: Auto-response system with pattern matching
- **Settings**: Configuration and connection management

### 3. Database Tables
- `discord_guilds` - Server information and settings
- `members` - User profiles and activity metrics
- `votes` - Governance polls and proposals
- `vote_responses` - Individual vote records
- `embeds` - Saved embed templates
- `triggers` - Auto-response configurations
- `info_topics` - Knowledge base articles
- `activity_logs` - User activity tracking

## Prerequisites

- Node.js 18+ and npm
- Supabase account (already configured)
- Git

## Installation Steps

### 1. Clone the Repository
```bash
git clone https://github.com/Kaneki-Ken5454/Homunculus-Dashboard.git
cd Homunculus-Dashboard
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables

The `.env` file is already configured with Supabase credentials. If you need to modify it, use the `.env.example` template:

```bash
cp .env.example .env
```

Then edit `.env` with your values:

```env
# Required Supabase Configuration
VITE_SUPABASE_PROJECT_ID="your_project_id"
VITE_SUPABASE_PUBLISHABLE_KEY="your_anon_key"
VITE_SUPABASE_URL="https://your_project_id.supabase.co"

# Optional Discord Bot Integration
VITE_DISCORD_BOT_API_URL="http://localhost:5000"
VITE_DISCORD_GUILD_ID="your_discord_guild_id"
```

### 4. Database Setup

The database is already set up with:
- Complete schema with 8 tables
- Row Level Security policies
- Demo data for testing
- Indexes for optimal performance

No additional database setup is required!

### 5. Start Development Server
```bash
npm run dev
```

The dashboard will be available at `http://localhost:8080`

### 6. Build for Production
```bash
npm run build
```

The optimized production build will be in the `dist/` directory.

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn/ui components
│   ├── AppSidebar.tsx  # Navigation sidebar
│   ├── DashboardCards.tsx # Stats and header components
│   └── DashboardLayout.tsx # Main layout wrapper
├── pages/              # Route pages
│   ├── Overview.tsx    # Main dashboard
│   ├── ActiveUsers.tsx # User activity leaderboard
│   ├── Votes.tsx       # Governance votes
│   ├── Embeds.tsx      # Embed builder
│   ├── InfoSystem.tsx  # Knowledge base
│   ├── Triggers.tsx    # Auto-responses
│   └── SettingsPage.tsx # Configuration
├── hooks/              # Custom React hooks
│   └── use-database.ts # Database query hooks
├── lib/                # Utility functions
│   ├── database.ts     # Database operations
│   └── utils.ts        # Helper functions
├── integrations/       # External services
│   └── supabase/       # Supabase client
└── App.tsx             # Main application component
```

## Key Features Explained

### Active Users Page
The new "Active Users" page provides:
- **Statistics Overview**: Total members, messages, and voting participation
- **Multiple Leaderboards**:
  - Top users by message count
  - Top users by vote participation
  - Recently active members
- **Detailed Member Cards**: Avatar, username, role badges, and activity metrics
- **Overall Leaderboard**: Comprehensive ranking of all members

### Database Connection
All pages connect to the Supabase database using:
- React Query for data fetching and caching
- Custom hooks for type-safe queries
- Automatic error handling and loading states
- Real-time data updates

### Interactive Elements
All buttons and interactive elements are now functional:
- **Create/Save**: Creates new records in the database
- **Delete**: Removes records with confirmation
- **Toggle**: Updates enable/disable states
- **Switch**: Real-time state changes with database sync

## Environment Variables Reference

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SUPABASE_PROJECT_ID` | Your Supabase project ID | Yes |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public API key for client-side | Yes |
| `VITE_SUPABASE_URL` | Supabase project URL | Yes |
| `VITE_DISCORD_BOT_API_URL` | Discord bot API endpoint | No |
| `VITE_DISCORD_GUILD_ID` | Discord server ID | No |

## Database Schema Summary

### Members Table
- Tracks user profiles and activity
- Fields: username, message_count, vote_count, last_active
- Used for: Activity tracking and leaderboards

### Votes Table
- Manages governance votes and polls
- Fields: question, options (JSONB), is_active, total_votes
- Used for: Community decision-making

### Embeds Table
- Stores Discord embed templates
- Fields: name, title, description, color, footer
- Used for: Reusable message formatting

### Triggers Table
- Auto-response configurations
- Fields: trigger_text, response, match_type, is_enabled
- Used for: Bot automation

### Info Topics Table
- Knowledge base articles
- Fields: category, title, content, section
- Used for: Documentation and FAQs

### Activity Logs Table
- User activity tracking
- Fields: user_id, activity_type, created_at
- Used for: Analytics and charts

## Troubleshooting

### Database Connection Issues
1. Verify `.env` file has correct Supabase credentials
2. Check Supabase project is active and not paused
3. Ensure RLS policies allow public access for demo

### Build Errors
1. Clear node_modules and reinstall: `rm -rf node_modules && npm install`
2. Clear build cache: `rm -rf dist`
3. Check for TypeScript errors: `npx tsc --noEmit`

### Runtime Errors
1. Check browser console for specific error messages
2. Verify all environment variables are set
3. Check Supabase dashboard for database errors

## Development Tips

### Adding New Pages
1. Create new page component in `src/pages/`
2. Add route in `src/App.tsx`
3. Add navigation item in `src/components/AppSidebar.tsx`
4. Create database queries if needed in `src/lib/database.ts`
5. Create React hooks in `src/hooks/use-database.ts`

### Database Queries
Use the provided hooks for database operations:
```typescript
import { useTopMembers, useAllVotes } from '@/hooks/use-database';

function MyComponent() {
  const { data, isLoading, error } = useTopMembers();
  // Use the data...
}
```

### Styling
- Uses Tailwind CSS with custom design tokens
- Dark theme by default
- Custom glass-card effects
- Responsive breakpoints: sm, md, lg, xl

## Production Deployment

### Build Optimization
```bash
npm run build
```

### Environment Setup
1. Set production environment variables
2. Configure CORS if using external API
3. Enable Supabase production mode
4. Set up CDN for static assets

### Hosting Options
- **Vercel**: Automatic deployment from Git
- **Netlify**: Simple static hosting
- **Self-hosted**: Use `npm run preview` or serve `dist/` folder

## Support and Documentation

- **Supabase Docs**: https://supabase.com/docs
- **React Query**: https://tanstack.com/query/latest
- **Tailwind CSS**: https://tailwindcss.com/docs
- **shadcn/ui**: https://ui.shadcn.com

## License

This project is part of the Homunculus Discord bot ecosystem.

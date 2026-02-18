# Quick Start Guide

## Get Started in 3 Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```

### 3. Open in Browser
Navigate to: http://localhost:8080

That's it! The dashboard is ready to use with a fully populated database.

## What's Included

- **Overview Dashboard** - Real-time statistics and analytics
- **Active Users** - Leaderboard of most active community members
- **Votes** - Governance voting system
- **Embeds** - Discord embed builder
- **Info System** - Knowledge base management
- **Triggers** - Auto-response configuration
- **Settings** - System configuration

## Demo Data Available

The database includes:
- 25 active members
- 5 governance votes
- 3 saved embeds
- 5 configured triggers
- 6 info topics
- 1,250+ activity logs

## Try These Features

1. **View Active Users**: Click "Active Users" in the sidebar to see the leaderboard
2. **Explore Votes**: Check out active and past votes with live results
3. **Create an Embed**: Use the embed builder to design Discord messages
4. **Toggle Triggers**: Enable/disable auto-response triggers
5. **Browse Topics**: Explore the knowledge base categories

## Environment Variables

Already configured! If you need to change them:
```env
VITE_SUPABASE_PROJECT_ID="qmcsjzvkcwxbyvwkbrty"
VITE_SUPABASE_PUBLISHABLE_KEY="your_key_here"
VITE_SUPABASE_URL="https://qmcsjzvkcwxbyvwkbrty.supabase.co"
```

## Build for Production

```bash
npm run build
```

Production files will be in `dist/` directory.

## Need Help?

See [SETUP.md](./SETUP.md) for detailed documentation.

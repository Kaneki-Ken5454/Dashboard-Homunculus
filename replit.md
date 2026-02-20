# Aeon Discord Dashboard

## Overview
A Discord bot management dashboard built with React (Vite) frontend and Express backend, using Prisma ORM with PostgreSQL. The dashboard provides governance and moderation tools for Discord servers.

## Recent Changes
- 2026-02-20: Initial import and setup completed. Database provisioned, Prisma schema pushed, dependencies installed.

## Project Architecture

### Tech Stack
- **Frontend**: React 18, Vite 5, TailwindCSS, Radix UI, React Router v6, React Query, Recharts
- **Backend**: Express.js with TypeScript (tsx)
- **Database**: PostgreSQL via Prisma ORM
- **Build**: Vite for frontend, tsx for backend transpilation

### Structure
- `src/` - React frontend source
- `server/index.ts` - Express backend (port 3001)
- `prisma/schema.prisma` - Database schema
- `prisma/init_schema.sql` - Additional SQL initialization
- `public/` - Static assets

### Key Configuration
- Frontend runs on port 5000 (Vite dev server)
- Backend runs on port 3001
- Vite proxies `/api` requests to backend
- Workflow: `npx concurrently` runs both servers

### Features
- Overview dashboard with governance metrics
- Active Users management
- Bot Settings configuration
- Custom Commands
- Reaction Roles
- Votes system
- Embeds management
- Triggers
- Info System
- Support Tickets
- Audit Log
- Settings

## User Preferences
- (none recorded yet)

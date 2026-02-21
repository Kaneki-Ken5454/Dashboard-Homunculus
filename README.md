# Dashboard

## Setup

1. Copy environment template and fill your own DB URL:

```bash
cp .env.example .env
```

2. Run the app:

```bash
npm install
npm run dev
```

Use either `VITE_DATABASE_URL` or `DATABASE_URL` in `.env`.

## Security

- Never commit `.env` or real database credentials.
- Rotate credentials immediately if they were ever exposed publicly.

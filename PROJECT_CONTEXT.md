# KOTHA — Complete Project Context

## 📌 Project Overview
- **Name**: Kotha — WhatsApp Chat Viewer + AI Roleplay
- **Stack**: Node.js (Express 5.2.1) + SQLite + Vanilla HTML/JS + Tailwind CSS
- **Domain**: https://onlinekotha.com

## 🖥️ AWS EC2 Server
- **IP**: 13.204.243.185
- **Instance**: t3.micro (908MB RAM, 2 vCPU burstable)
- **OS**: Ubuntu
- **SSH Key**: `/Users/shivaprajapat/Downloads/kotha-key.pem`
- **SSH Command**:
  ```bash
  ssh -i /Users/shivaprajapat/Downloads/kotha-key.pem ubuntu@13.204.243.185
  ```
- **App Path on Server**: `/var/www/onlinekotha`
- **Process Manager**: PM2 (app name: kotha)
- **Web Server**: Nginx (reverse proxy)
- **SSL**: Certbot (Let's Encrypt)

## 🚀 Deploy Command
```bash
ssh -i /Users/shivaprajapat/Downloads/kotha-key.pem ubuntu@13.204.243.185 "cd /var/www/onlinekotha && git pull origin main && pm2 restart kotha"
```

## 🩺 Health Check
```bash
curl https://onlinekotha.com/healthz
```

## 📦 GitHub Repository
- **URL**: https://github.com/The-CyberGenius/onlinekotha.git
- **Branch**: main
- **Local Path**: `/Users/shivaprajapat/Desktop/kotha`

## 🔐 Environment Variables (Production .env)
- `ENCRYPTION_SECRET`: 101097ef2912074859d3113f77a58679e28202373f26425ed383d54a93a972cb
- `ADMIN_EMAIL`: (the email you signed up with first — makes you admin)
- `PORT`: 3000

## 🔑 Google OAuth (Sign in with Google)
- **Client ID**: Saved in admin panel DB (Integrations tab)
- **Client Secret**: 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
- **Google Cloud Console**: https://console.cloud.google.com
- **Redirect URI**: https://onlinekotha.com/api/auth/google/callback
> **⚠️ You still need to add in Google Cloud Console:**
> - Authorized JavaScript origins: https://onlinekotha.com
> - Authorized redirect URIs: https://onlinekotha.com/api/auth/google/callback

## 📁 Key File Structure
`/Users/shivaprajapat/Desktop/kotha/`
├── `server.js`                    # Main Express server
├── `package.json`
├── `.env`                         # Local env vars
├── `kotha.db`                     # SQLite database
├── `server/`
│   ├── `db.js`                    # SQLite setup + schema
│   ├── `auth.js`                  # Auth: signup, login, logout, sessions
│   ├── `admin.js`                 # Admin API routes
│   ├── `ai.js`                    # AI chat endpoint (SSE streaming)
│   ├── `billing.js`               # Stripe billing + webhooks
│   ├── `cache.js`                 # Chat message parser + cache
│   ├── `email.js`                 # Email verification + password reset
│   ├── `oauth.js`                 # Google OAuth routes
│   ├── `upload.js`                # File upload handler (multer)
│   └── `integrations.js`          # DB-backed config (encrypted)
├── `public/`
│   ├── `index.html`               # Landing page
│   ├── `app.html`                 # Main chat viewer
│   ├── `login.html`               # Login/signup page
│   ├── `admin.html`               # Admin panel
│   ├── `404.html`                 # Error page
│   ├── `favicon.svg`
│   ├── `css/style.css`            # Main styles
│   └── `js/`
│       ├── `script.js`            # Chat viewer logic
│       ├── `upload.js`            # Upload handler
│       ├── `ai-panel.js`          # AI chat frontend
│       ├── `admin.js`             # Admin panel frontend
│       ├── `auth-init.js`         # Auth state check
│       └── `tailwind.js`          # Tailwind standalone
├── `src/`                         # User uploaded chat files
│   └── `u_{userId}/`              # Per-user folders
│       └── `{chatFolder}/`        # Each imported chat

## 🏗️ Architecture Notes
- **Cookie name**: `session` (httpOnly, sameSite: lax)
- **Cookie clear fix (Chrome)**: Must pass `{ httpOnly: true, sameSite: 'lax', path: '/' }` to `clearCookie`
- **archiver**: Must use v7.0.1 (CJS compatible) — v8 is ESM-only, breaks `require()`
- **Per-chat AI**: `conversationMap` + `contactNameMap` objects keyed by chat folder name
- **Cache busting**: All script/CSS tags use `?v=5` query params
- **Admin access**: First user who signs up with `ADMIN_EMAIL` env var becomes admin
- **Media serving**: `/media/*` route serves from `src/u_{userId}/` with path traversal protection

## 🛠️ Useful Commands

**Local dev**
```bash
cd /Users/shivaprajapat/Desktop/kotha && node server.js
```

**Git push**
```bash
git add . && git commit -m "message" && git push origin main
```

**Deploy to production**
```bash
ssh -i /Users/shivaprajapat/Downloads/kotha-key.pem ubuntu@13.204.243.185 "cd /var/www/onlinekotha && git pull origin main && pm2 restart kotha"
```

**Check PM2 logs on server**
```bash
ssh -i /Users/shivaprajapat/Downloads/kotha-key.pem ubuntu@13.204.243.185 "pm2 logs kotha --lines 50"
```

**Check PM2 status**
```bash
ssh -i /Users/shivaprajapat/Downloads/kotha-key.pem ubuntu@13.204.243.185 "pm2 status"
```

**Restart Nginx (if needed)**
```bash
ssh -i /Users/shivaprajapat/Downloads/kotha-key.pem ubuntu@13.204.243.185 "sudo systemctl restart nginx"
```

**Install new npm package on server**
```bash
ssh -i /Users/shivaprajapat/Downloads/kotha-key.pem ubuntu@13.204.243.185 "cd /var/www/onlinekotha && npm install <package-name> --production && pm2 restart kotha"
```

## ✅ Completed Features (44 tasks)
Signup/Login, Google OAuth, Email verify, Password reset, Chat upload (zip/folder), WhatsApp parser (iOS+Android), Beautiful viewer, Search + filters, Analytics, Media gallery, AI chat (streaming SSE), Per-chat AI context, Admin panel (providers, models, routing, integrations, limits, users), User delete + chat download (zip), Stripe billing, Landing page, Mobile responsive, SSL, PM2 production

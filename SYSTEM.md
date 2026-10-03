# OnlineKotha — System Reference Guide
> **For:** Developer / Admin
> **Updated:** October 2026
> **Server:** AWS EC2 (`kotha` alias) · Node.js 20 · PM2 · SQLite (WAL mode) · nginx reverse-proxy

---

## 🗂️ Project Structure

```
/
├── server.js              ← App entry point (Express + Socket.io boot)
├── ecosystem.config.js    ← PM2 process config
├── package.json
├── .env                   ← 🔐 Secret keys (never commit)
├── .env.example           ← Safe template for new devs
│
├── server/                ← All backend modules
│   ├── db.js              ← SQLite connection + all table schemas
│   ├── auth.js            ← Sessions, login, middleware, plan logic
│   ├── ai.js              ← All AI routes (chat, compatibility, summary)
│   ├── admin.js           ← Admin panel API routes
│   ├── cache.js           ← In-memory message cache (prevents re-parsing on each request)
│   ├── parser.js          ← WhatsApp .txt parser (date formats, media, system msgs)
│   ├── upload.js          ← File upload handler (zip extraction, validation)
│   ├── email.js           ← Nodemailer: verification + password reset
│   ├── globalChat.js      ← Public global chat room (Socket.io)
│   ├── rateLimit.js       ← Word count + burst limits for AI
│   ├── guest.js           ← Guest session creation/tracking
│   ├── oauth.js           ← Google OAuth2 (Passport.js)
│   ├── llm.js             ← LLM provider abstraction (OpenAI / Gemini)
│   ├── crypto.js          ← Token generation utils
│   ├── context.js         ← AI context builder (summarises chat history)
│   ├── contact.js         ← Contact form email handler
│   ├── integrations.js    ← 3rd party webhook integrations
│   ├── routes/            ← Modular Express routers
│   │   ├── auth.routes.js
│   │   ├── chat.routes.js
│   │   ├── upload.routes.js
│   │   ├── user.routes.js
│   │   ├── analytics.routes.js
│   │   ├── media.routes.js
│   │   ├── demo.routes.js
│   │   └── dodo.routes.js    ← Payment webhook (Dodo Payments)
│   └── middleware/
│       └── errorHandler.js   ← Global Express error handler
│
├── public/                ← All static frontend assets (served by Express)
│   ├── index.html         ← Landing page (SEO, marketing)
│   ├── app.html           ← Main web app (chat viewer, AI, Wrapped)
│   ├── admin.html         ← Admin dashboard (users, analytics, chats)
│   ├── login.html         ← Auth pages
│   ├── css/
│   │   ├── style.css      ← Custom global CSS (dark mode, components)
│   │   └── tailwind.min.css ← Pre-built Tailwind (no CDN dependency)
│   ├── js/
│   │   ├── script.js      ← 🏠 CORE app logic (chat render, upload, search, media)
│   │   ├── features.js    ← Wrapped/Story stats, AI features, export
│   │   ├── story.js       ← Story Card engine (9:16 cards, export, animation)
│   │   ├── dm.js          ← Direct Messaging (Socket.io realtime)
│   │   ├── ai.js          ← AI panel UI (sidebar)
│   │   ├── ai-panel.js    ← AI chat panel rendering
│   │   ├── upload.js      ← Upload UI (progress, validation)
│   │   ├── analytics.js   ← Analytics tracking (page views, sessions)
│   │   ├── auth-init.js   ← Auth state init on page load
│   │   ├── admin.js       ← Admin panel JS
│   │   └── tailwind.js    ← Tailwind runtime config
│   ├── img/               ← Logos, icons, OG images
│   ├── sw.js              ← Service worker (PWA caching)
│   └── manifest.json      ← PWA manifest
│
├── data/                  ← 🔐 Database (gitignored)
│   └── kotha.db           ← THE real database (WAL mode SQLite)
│
├── src/                   ← 🔐 User uploaded chat files (gitignored)
│   └── u_{userId}/        ← One folder per user
│       └── {chatName}/
│           ├── _chat.txt        ← Original WhatsApp export
│           ├── _chat.cache.json ← Parsed JSON cache (avoids re-parsing)
│           └── *.jpg/*.opus/... ← Media files from zip export
│
├── scripts/               ← Utility scripts (run manually, not in production)
│   ├── backup_db.js       ← Copies kotha.db to timestamped backup
│   ├── fix-message-counts.js ← Backfill chats.message_count column
│   ├── inject_analytics.js   ← One-time analytics table migration
│   ├── insert_dummy.js    ← Insert test data
│   ├── setup_ec2.sh       ← Server provisioning script
│   └── nginx.conf         ← nginx config reference
│
└── _archive/              ← Old notes, marketing docs (safe to ignore)
```

---

## 🗄️ Database Schema (kotha.db)

| Table | Purpose |
|---|---|
| `users` | Accounts: email, password_hash, plan, trial_expires_at, is_admin |
| `sessions` | Auth sessions (token → user_id) |
| `email_tokens` | Email verification + password reset tokens |
| `chats` | Metadata for each uploaded chat (user_id, name, message_count) |
| `dm_conversations` | DM thread between 2 users |
| `dm_messages` | All DM messages (with reactions, reply_to) |
| `dm_contact_nicknames` | User-set nicknames for DM contacts |
| `conversations` | AI chat session state |
| `conv_messages` | AI chat message history |
| `global_messages` | Public global chat room messages |
| `usage_log` | Per-user AI word/token usage |
| `payments` | Payment records (Dodo Payments) |
| `analytics_visitors` | Unique visitor tracking |
| `analytics_sessions` | Per-session page-view sequences |
| `analytics_events` | Individual events (page_view, login, message_sent…) |
| `settings` | Key-value app settings |
| `providers` / `models` / `routes` | LLM routing config |
| `guest_sessions` | Guest user tracking |
| `contact_messages` | Contact form submissions |
| `webhook_events` | Payment/integration webhooks |

---

## 🌐 Key API Endpoints

### Auth
| Method | Path | Purpose |
|---|---|---|
| POST | `/register` | Create account |
| POST | `/login` | Login |
| POST | `/logout` | Logout |
| GET | `/me` | Current user session info |

### Chat / AI
| Method | Path | Purpose |
|---|---|---|
| POST | `/upload` | Upload WhatsApp zip |
| GET | `/chats` | List user's chats |
| GET | `/messages?chat=X` | Get parsed messages for a chat |
| POST | `/api/ai/chat/:chat/message` | Send AI chat message |
| POST | `/api/ai/chat/:chat/compatibility` | AI compatibility score (used by Wrapped) |
| DELETE | `/api/chats/:name` | Delete a chat + files |

### Admin (protected)
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/users` | All users |
| GET | `/api/admin/analytics` | Visitor/event analytics |
| POST | `/api/admin/user/:id/plan` | Change user plan |

### DM (Socket.io)
```
emit: dm:join          → join DM room
emit: dm:message       → send message
emit: dm:typing        → typing indicator
on:   dm:message       → receive new message
on:   user:online      → friend came online
on:   user:offline     → friend went offline
```

---

## ⚙️ Server Infrastructure

```
Internet
  → nginx (port 443/80, SSL, gzip, rate-limit headers)
    → Node.js / Express (port 3000, localhost)
      → Socket.io (WebSocket + HTTP fallback)
      → better-sqlite3 (WAL mode, synchronous, fast)
      → /src  (user chat files)
      → /data (database)

PM2 manages the Node process:
  - auto-restart on crash
  - log rotation (pm2-logrotate module)
  - process name: "kotha"
```

### Resource Status (as of Oct 2026)
| Resource | Status |
|---|---|
| Disk | **68% used** (13G/19G) — monitor `src/` growth |
| RAM | ~220MB free · 627MB swap in use — acceptable |
| CPU | 0% idle (no load) |
| DB size | ~272KB (very healthy) |
| PM2 restarts | 1720 (normal — includes all dev restarts) |

> ⚠️ **Disk Warning:** `src/` holds user chat files and is 1.4GB. As users grow, set up a periodic cleanup job or S3 offloading.

---

## 🔄 Real-time Architecture

```
WebSocket (Socket.io) — PRIMARY channel
  - Used for: DM messages, typing, online/offline presence
  - updateLastActive() fires on: connect, typing, message sent

HTTP Polling — DISABLED when socket is connected
  - Falls back only when WebSocket fails
  - sw.js bypasses caching for polling endpoints
```

---

## 📦 Frontend JS Files — What Each Does

| File | Size | Role |
|---|---|---|
| `script.js` | 3760 lines | Core app: renders chat messages, handles search, media, AI sidebar, upload UI |
| `features.js` | ~1930 lines | Wrapped/Story stats computation, launch flow, export functions |
| `story.js` | 765 lines | Story card engine: 9:16 cards, swipe navigation, share/save |
| `dm.js` | 1793 lines | Full DM feature: Socket.io, message render, reactions, media |
| `ai.js` | — | AI chat panel logic |
| `analytics.js` | — | Tracks page views, events to `/api/analytics` |

---

## 🚀 Deployment Workflow

```bash
# 1. Make changes locally in /Users/shivaprajapat/Desktop/OK/

# 2. Test locally if needed
node server.js

# 3. Deploy to production
git add .
git commit -m "describe what changed"
git push
ssh kotha "cd /var/www/onlinekotha && git pull && pm2 restart kotha"
```

> 💡 GitHub Actions CI (`/.github/workflows/deploy.yml`) can automate step 3.

---

## 🔐 Environment Variables (.env)

```bash
# Required — app won't start without these
NODE_ENV=production
SESSION_SECRET=...         # Express session signing key
GEMINI_API_KEY=...         # Google Gemini AI (primary)
OPENAI_API_KEY=...         # OpenAI fallback (optional)

# Email (Nodemailer)
EMAIL_USER=...
EMAIL_PASS=...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# Payments (Dodo)
DODO_WEBHOOK_SECRET=...
DODO_API_KEY=...

# App
BASE_URL=https://onlinekotha.com
ADMIN_EMAIL=...
```

---

## 🩺 Health Checklist

Run this periodically or after issues:

```bash
# Check server is running
ssh kotha "pm2 status"

# Check recent errors
ssh kotha "pm2 logs kotha --lines 50 --nostream"

# Check disk space
ssh kotha "df -h"

# Check memory
ssh kotha "free -h"

# Check database size
ssh kotha "du -sh /var/www/onlinekotha/data/"

# Restart server if needed
ssh kotha "pm2 restart kotha"

# Update PM2 (it's out of date)
ssh kotha "pm2 update"
```

---

## 🐛 Common Issues & Fixes

| Symptom | Likely Cause | Fix |
|---|---|---|
| Story cards blank | Old browser cache | Hard refresh `Cmd+Shift+R` |
| Wrapped not opening | JS error in features.js | Check browser console |
| AI not responding | API key expired or rate limit | Check GEMINI_API_KEY |
| Upload failing | File too large or bad format | Max 50MB, must be WhatsApp zip |
| DM offline when user is online | Socket.io disconnected | Refresh page |
| Server out of memory | Too many sockets or memory leak | `pm2 restart kotha` |
| Disk full | `src/` too large | Delete old chat files from admin panel |

---

## 📋 Story / Wrapped System

```
User opens chat
  → script.js sets window.kothaLoadedChat
  → features.js: preloadWrappedStory() fires automatically
    → computeWrappedStats(msgs) — pure CPU, ~10ms
    → fetch /api/ai/chat/:chat/compatibility — background AI call
    → cache stored in window.kothaWrappedCache[chatName]

User clicks ⭐ Wrapped button
  → launchWrapped() reads from cache (instant)
  → StoryEngine.launch(stats, msgs) called
  → StoryViewer builds 9–12 story cards depending on data
  → Cards shown in 9:16 canvas scaled to viewport
  → Save/Share buttons export via html-to-image library
```

**Card types generated (data-driven):**
1. Cover (always)
2. Who Texted First (if data exists)
3. Busiest Day (if date data exists)
4. Busiest Weekday (if date data exists)
5. Gallery / Media Count (if >10 media)
6. Laughs Count (if any laugh msgs)
7. Longest Message (if >15 words)
8. Question Count / Inquisitor (if >10 questions)
9. Top Emojis (if emojis used)
10. Late Night (if >30 msgs between 12–4AM)
11. Final Total (always)

---

## 🔮 Future Development Notes

### Easy Wins
- [ ] `pm2 update` — update PM2 to latest on server
- [ ] Add `nodemon` or `--watch` for local dev
- [ ] Add `/healthz` endpoint for uptime monitoring
- [ ] Gzip static JS/CSS files (nginx config already supports it)

### Medium Effort
- [ ] Move `src/` user files to S3 as disk grows
- [ ] Add WebP conversion for uploaded images
- [ ] Add pagination to admin user list (currently loads all)
- [ ] Story cards: add compat score card when AI resolves

### Bigger Features
- [ ] Group Wrapped (multi-person story cards)
- [ ] Chat timeline view (calendar-style heatmap)
- [ ] Export full chat as PDF
- [ ] Push notifications for DM (via Web Push)

---

*Last updated by Antigravity AI — October 2026*

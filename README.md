# Chat Importer 🚀

A simple, offline, server-side processed web application to cleanly display exported WhatsApp chats in a familiar WhatsApp-like UI perfectly synced with media.

## Project Structure
```text
ChatImporterApp/
├── package.json
├── server.js         <-- Node.js Backend 
├── README.md
└── public/
    ├── index.html    <-- The main layout
    ├── css/
    │   └── style.css <-- Custom UI styling mimicking WhatsApp
    └── js/
        ├── script.js <-- Frontend chat rendering and search logic
        └── tailwind.js <- Local Tailwind CSS build for zero-internet usage
```

## Features Complete ✅

1. **Total Offline Run:** Zero cloud databases or external CDNs used at runtime. Tailwind CSS is stored and loaded locally.
2. **Beautiful WhatsApp Interface:** Left/Right bubbles according to the sender, matching names, times, and dates.
3. **Media Parsing inline:** Rendered `<attached: media>` perfectly to `image`, `video`, `audio`, and `document` categories showing them beautifully inside the chat bubbles!
4. **Live Search:** Quickly filter out messages via the left search sidebar.
5. **No Database:** Processes your entire history from `_chat.txt` right on start dynamically saving all resources automatically!

## 💳 Payments & Billing

Kotha Pro can be sold through **two independent gateways that run side by side** — the active one is chosen per customer, and every transaction is stored in the `payments` table with a `provider` column.

| | **Polar.sh** |
|---|---|
| Audience | 🌍 International |
| Currency | USD (Merchant of Record — Polar handles tax/VAT) |
| Flow | Redirect to Polar-hosted checkout |
| Verify | Standard Webhooks (`webhook-signature`, native `crypto`) |
| Module | `server/polar.js` |
| Dependencies | none (native `fetch` + `crypto`) |

Both are **optional** — if the keys aren't set, that gateway's upgrade button simply doesn't appear.

### Polar.sh setup (international / USD)

Polar acts as the **Merchant of Record**, so it processes global cards and remits sales tax/VAT for you.

1. In the [Polar dashboard](https://polar.sh) create a **Product** for "Kotha Pro" and copy its **Product ID** (a UUID).
2. Create an **Organization Access Token** (Settings → Developers). Keep it secret.
3. Add a **Webhook** endpoint pointing at `<PUBLIC_BASE_URL>/api/polar/webhook`, subscribe to `order.paid`, `subscription.active`, `subscription.revoked`, `order.refunded`, and copy the **webhook secret** (`whsec_…`).
4. Provide the credentials **either** via the in-app **Admin → Integrations → Polar** panel (encrypted at rest) **or** via environment variables:

   ```bash
   POLAR_ACCESS_TOKEN=polar_oat_xxx
   POLAR_PRODUCT_ID=00000000-0000-0000-0000-000000000000
   POLAR_WEBHOOK_SECRET=whsec_xxx
   POLAR_SERVER=production        # or "sandbox" while testing
   ```

> **Security:** access tokens and webhook secrets live **only** in `.env` (gitignored) or the encrypted `settings` table — never commit them. The public repo must never contain a real token. If a token is ever exposed, **revoke it in Polar immediately** and issue a new one.

**How the flow works:** `POST /api/polar/create-checkout` (auth) creates a hosted checkout and returns its `url`; the browser redirects there. After payment, Polar calls the signed webhook, which is the **sole source of truth** for granting Pro — the signature is verified against the [Standard Webhooks](https://www.standardwebhooks.com) spec and the upgrade is idempotent, so duplicate deliveries are safe.

> The full architecture, database schema, and subsystem details live in [`PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md).

## How to Run locally

### 1. Requirements
Ensure you have [Node.js](https://nodejs.org/) installed in your system.

### 2. Setup
Open your terminal in this directory:
```bash
cd "/Users/shivaprajapat/Documents/chat importer/ChatImporterApp"
```

Install the light-weight backend dependency (`express`):
```bash
npm install
```

### 3. Run the Server
Launch the local server:
```bash
node server.js
```

### 4. Viewing the Chat
It will output `Server running at http://localhost:3000`. 
Open your web browser and go to: [http://localhost:3000](http://localhost:3000)

> Note: Make sure the parent folder `../WhatsApp Chat - kali linux` contains the `_chat.txt` along with the media, as the server looks for this path automatically! Enjoy.

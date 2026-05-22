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

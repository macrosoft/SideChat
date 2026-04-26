# SideChat

Chrome extension that chats with any webpage using a local llama.cpp server. Extracts page content, answers questions, and generates summaries — all offline in a browser side panel.

## Features

- **Local LLM** — connects to `llama.cpp` running on your machine
- **Page Context** — extracts text from any webpage (including Shadow DOM content)
- **Streaming Responses** — real-time markdown rendering
- **Summarize** — one-click page summary
- **Conversation History** — multi-turn chat with page context

## Setup

1. Start your `llama.cpp` server on `http://127.0.0.1:8080`
2. Load the extension in Chrome:
   - Open `chrome://extensions`
   - Enable Developer Mode
   - Click "Load unpacked" and select the `SideChat` folder
3. Click the extension icon to open the side panel
4. Enter server URL and select a model

## Files

- `manifest.json` — Extension config
- `background.js` — Service worker
- `sidepanel.html` — Chat UI
- `sidepanel.js` — Core logic
- `marked.min.js` — Markdown parser ([markedjs/marked](https://github.com/markedjs/marked))

## Repo overview

SideChat is a 5-file Chrome Manifest V3 extension. Chat with any webpage using a local `llama.cpp` server — everything runs offline in a side panel.

No package manager, no build step, no tests, no lint. Just load unpacked.

## Key files

- `manifest.json` — MV3 config. Permissions: `scripting`, `sidePanel`, `storage`. Host permissions include `http://127.0.0.1:8080/*`, `http://localhost:8080/*`, and `<all_urls>` (for scraping active tab content).
- `background.js` — 3-line service worker. Only sets `openPanelOnActionClick: true` on install.
- `sidepanel.html` — Chat UI with inline CSS. Load settings collapsed in `<details>`.
- `sidepanel.js` — All app logic: context extraction, chat, streaming, settings persistence.
- `marked.min.js` — Vendored markdown parser. Do not edit.

## External dependencies

- llama.cpp server API at `http://127.0.0.1:8080` (customizable via settings). Calls: `GET /v1/models` and `POST /v1/chat/completions` (streaming).

## Architecture notes

- **Context extraction** (`extractCleanText()` in `sidepanel.js:86`): injects a script into all frames of the active tab, hides junk selectors (nav, header, footer, script, forms, ARIA regions, etc.), extracts `body` text, re-joins results from multiple frames, truncates to 400,000 chars.
- **Chat flow** (`handleChat()` in `sidepanel.js:168`): `ensureContextLoaded()` builds a system prompt with the full page content + language instruction, then appends user messages to `conversationHistory` array for multi-turn context.
- **Streaming**: SSE reader parses `data: ` JSON lines, re-parses markdown incrementally via `marked.parse()`, auto-scrolls if near bottom of chat.
- **Settings** persist via `chrome.storage.local`: `serverUrl`, `savedModel`, `responseLanguage`, `customLanguage`.
- **State flags**: `conversationHistory`, `isContextLoaded`, `isGenerating` tracked as module-scoped vars in `sidepanel.js`.
- **Enter** sends, **Shift+Enter** for newline.


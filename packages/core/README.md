# @onedeskpro/chatbot-core

Framework-independent core for the [Onedesk Pro](https://onedeskpro.com) chatbot. Ships the chat engine, visitor identification, AI-to-human handoff, the API and socket clients, and a self-contained widget you can drop into any page — no framework required.

Using React? Install [`@onedeskpro/chatbot-react`](https://www.npmjs.com/package/@onedeskpro/chatbot-react) instead.

## Install

```bash
npm install @onedeskpro/chatbot-core
```

## Usage

```ts
import { ChatbotCore } from '@onedeskpro/chatbot-core';

const chatbot = new ChatbotCore();

await chatbot.init({
  apiKey: 'your-onedesk-pro-api-key',
  chatbotName: 'Support',
  primaryColor: '#4f46e5',
  theme: 'auto',            // 'light' | 'dark' | 'auto'
  position: 'bottom-right', // 'bottom-right' | 'bottom-left'
  welcomeMessage: 'Hi! How can we help?',
  autoOpen: false,
});
```

`init` connects to the Onedesk Pro API and adds the widget to the page once the agent can reply. Only `apiKey` is required — use the publishable workspace API key, never a server secret.

### When the widget appears

Nothing is added to the page straight away. `init` first checks that the Onedesk Pro server is reachable and that the agent is ready to reply, and the launcher appears only once both hold and a returning visitor's identity has been checked:

| Situation | `blockReason` | What happens |
| --- | --- | --- |
| Ready | `null` | The launcher appears (and the panel opens, with `autoOpen`). |
| The server cannot be reached, times out, or answers with a 5xx | `server-unavailable` | Stays hidden and checks again after 5, 15, 30 and 60 seconds, then gives up until the next page load. |
| The agent has no system prompt or no knowledge base | `no-prompt`, `no-collections` | Stays hidden. |
| The platform's AI models are not configured | `ai-unavailable` | Stays hidden. |
| The workspace has used its AI token budget | `no-credits` | Stays hidden. |
| No agent is assigned to the Website channel | `no-agent` | Stays hidden. |
| The API key is rejected or the site's origin is not allowed | `null`, with `error` set | Stays hidden. |

`init` resolves after the first check, and the `ready` event fires once the outcome is settled: when the widget appears, when a configuration problem rules it out, or when the last retry fails. A custom UI built on the state can show `blockReason` to explain why chat is unavailable.

### Visitor identification

A visitor must identify with a name and phone number before chatting. The widget shows its own form for this (name, phone with a country picker, optional email), so with the built-in UI there is nothing to wire up.

On success the API returns a visitor token. The SDK stores it and verifies it on the next `init`, so a returning visitor goes straight to the chat. While `getState().needsIdentify` is `true`, nothing is sent and `sendMessage` rejects.

If you build your own UI, collect the details yourself and call `submitIdentify`:

```ts
await chatbot.submitIdentify({
  name: 'Ada Lovelace',
  phone: '+8801712345678', // international format, with country code
  email: 'ada@example.com', // optional
});
```

### Human handoff

Every conversation runs in one of four modes, exposed as `getState().mode`:

| Mode | Meaning |
| --- | --- |
| `ai` | The AI agent is answering. This is the default. |
| `waiting` | A human was requested and no agent has picked the conversation up yet. |
| `human` | A human agent is replying. Their messages arrive live with `type: 'agent'`. |
| `closed` | The conversation was closed. Sending is disabled until `resetSession()`. |

The widget shows a "Request human agent" control once a conversation has started, and a banner for the `waiting`, `human`, and `closed` modes. From your own UI call `requestHuman()`. The mode also changes on its own — when the AI escalates, an agent takes over, hands back to the AI, or closes the conversation — so follow the `ticket-status` or `state-change` event rather than assuming the result of your own call.

### Script tag / CDN

The IIFE build exposes a `window.OnedeskProChatbot` global:

```html
<script src="https://unpkg.com/@onedeskpro/chatbot-core"></script>
<script>
  OnedeskProChatbot.init({ apiKey: 'your-onedesk-pro-api-key' });
</script>
```

`OnedeskProChatbot.getInstance()` returns the `ChatbotCore` created by `init`, or `null`.

## API

### `ChatbotCore`

| Method | Description |
| --- | --- |
| `init(options)` | Mounts the widget and loads remote config. Returns a promise. |
| `submitIdentify({ name, phone, email? })` | Identifies the visitor and unlocks the chat. Returns a promise. |
| `sendMessage(text)` | Sends a message and, in `ai` mode, appends the reply. Returns a promise that rejects if the visitor has not identified. |
| `requestHuman()` | Escalates the conversation to a human agent. Does nothing unless the mode is `ai` and a conversation has started. Returns a promise. |
| `open()` / `close()` / `toggle()` | Control widget visibility. |
| `resetSession()` | Clears a `closed` conversation so the visitor can start a new one. Does nothing in any other mode. |
| `getState()` | Returns a readonly `ChatbotState` snapshot. |
| `on(event, listener)` | Subscribes to an event. Returns an unsubscribe function. |
| `destroy()` | Unmounts the widget, disconnects the socket, and cancels any in-flight `init`. |

### Options — `ChatbotInitOptions`

| Option | Type | Default |
| --- | --- | --- |
| `apiKey` | `string` | **required** |
| `apiBaseUrl` | `string` | `https://api.onedeskpro.com` |
| `chatbotName` | `string` | from remote config |
| `primaryColor` | `string` | theme default |
| `theme` | `'light' \| 'dark' \| 'auto'` | `'auto'` |
| `position` | `'bottom-right' \| 'bottom-left'` | `'bottom-right'` |
| `welcomeMessage` | `string` | — |
| `placeholder` | `string` | — |
| `autoOpen` | `boolean` | `false` |
| `requestTimeoutMs` | `number` | `30000` |

`sessionId` is deprecated and ignored: visitor tokens replace client session ids.

### State — `ChatbotState`

| Field | Type | Meaning |
| --- | --- | --- |
| `isOpen` | `boolean` | The panel is showing. |
| `isLoading` | `boolean` | A send, identify, or human request is in flight. |
| `isReady` | `boolean` | The server answered and the agent can reply; the widget is on the page. |
| `needsIdentify` | `boolean` | The visitor has not identified yet. |
| `blockReason` | `ChatbotBlockReason` | Why the agent cannot answer, or `null`. See [When the widget appears](#when-the-widget-appears). |
| `messages` | `ChatMessage[]` | The conversation so far. `message.type` is `'human'`, `'ai'`, or `'agent'`. |
| `visitorToken` | `string \| null` | The identified visitor's token. |
| `visitorName` | `string \| null` | The identified visitor's name. |
| `mode` | `ChatbotTicketMode` | `'ai'`, `'waiting'`, `'human'`, or `'closed'`. |
| `error` | `string \| null` | The last error message. |

### Events — `ChatbotEventMap`

| Event | Payload | Fires when |
| --- | --- | --- |
| `message` | `ChatMessage` | A message is added — visitor, AI, and human agent alike. |
| `state-change` | `ChatbotState` | Any state changes, including `isLoading` while a reply is in flight. |
| `ready` | — | The readiness check settled: the widget appeared, or it will not (see `blockReason` and `error`). |
| `open` / `close` | — | The panel is shown or hidden. |
| `ticket-status` | `TicketStatusData` | The mode changed — on restore, after a send, or pushed live. |
| `human-requested` | — | `requestHuman()` succeeded. |
| `error` | `Error` | A send, identify, or human request failed (including on timeout), or the live connection could not be established. |
| `session-reset` | — | A closed conversation was cleared. |

Prefer `state-change` when you are mirroring state into your own UI — it is the only event that covers every transition.

```ts
const off = chatbot.on('message', (msg) => console.log(msg.message.content));
off(); // unsubscribe
```

## Also exported

`ApiClient`, `SdkSocket`, `resolveSdkSocketUrl`, `EventEmitter`, `SessionManager`, `isChatbotRequestError`, `DEFAULT_API_BASE_URL`, `DEFAULT_REQUEST_TIMEOUT_MS`, the `ChatbotRequestError` and `SdkSocketConnectOptions` types, and every type from `@onedeskpro/chatbot-types`.

`SessionManager` is deprecated. It is now the visitor token store and is kept only so existing imports keep resolving.

## Notes

Requests abort after `requestTimeoutMs` (30s by default) and surface as an `error` event with `code: 'TIMEOUT'`, so a hung network never leaves the widget stuck. Errors thrown by the client carry `status` and a structured `apiError`; narrow them with `isChatbotRequestError`.

The visitor token persists in `localStorage`, scoped per agent, where storage is available and falls back to in-memory when it is not — private browsing, blocked site data, or a sandboxed iframe. A token the API no longer accepts is discarded and the visitor is asked to identify again.

Once the visitor has identified, the SDK opens a Socket.IO connection to the API for live mode changes and human agent messages. It reconnects on its own and re-reads the mode when it does.

Earlier messages are not restored on reload. A returning visitor keeps their identity and mode but starts with an empty message list.

## Upgrading from 0.1

0.2.0 is a breaking release. The API no longer accepts the `sessionId`-based chat requests that 0.1 sends, so 0.1 cannot chat against the current API.

- With the built-in widget, upgrading is enough: the identify form and handoff controls are included.
- With a custom UI, add an identify step (`needsIdentify` and `submitIdentify`) before the first `sendMessage`, and render `'agent'` messages alongside `'human'` and `'ai'`.
- `ChatbotState.sessionId` is replaced by `visitorToken`, and the `sessionId` init option is ignored.
- `ApiClient.fetchHistory` is removed.
- `resetSession()` now only clears a `closed` conversation.

## License

MIT © Typetech IT

# @onedeskpro/chatbot-types

Shared TypeScript types for the [Onedesk Pro](https://onedeskpro.com) Chatbot SDK. Types only — the runtime bundle is empty.

You normally do not install this directly: [`@onedeskpro/chatbot-core`](https://www.npmjs.com/package/@onedeskpro/chatbot-core) and [`@onedeskpro/chatbot-react`](https://www.npmjs.com/package/@onedeskpro/chatbot-react) both re-export what you need. Install it when you want the types on their own — for example in a backend that mirrors the chat API shapes.

## Install

```bash
npm install --save-dev @onedeskpro/chatbot-types
```

## Exports

| Type | Purpose |
| --- | --- |
| `ChatbotInitOptions` | Options accepted by `ChatbotCore.init` and `ChatbotProvider`. |
| `ChatbotState` | Snapshot of widget state, including `needsIdentify`, `visitorToken`, and `mode`. |
| `ChatMessage` | A single message. `message.type` is `'human'` (the visitor), `'ai'`, or `'agent'` (a human agent). |
| `ChatbotEventMap` | Event names mapped to payloads, including `state-change`, `ticket-status`, and `human-requested`. |
| `ChatbotTicketMode` | Who owns the conversation (`'ai' \| 'waiting' \| 'human' \| 'closed'`). |
| `TicketStatusData` | Mode plus optional `conversationId` and `agentName`. Shared by the human-request and ticket-status endpoints and the `ticket:status` socket event. |
| `ChatbotBlockReason` | Why a bot is not ready (`'no-prompt' \| 'no-collections' \| 'no-directories' \| 'no-agent' \| null`). |
| `SdkConfigResponse` | Remote agent configuration and readiness. |
| `IdentifyRequest` / `IdentifyResponseData` | Identify endpoint request and response bodies. |
| `VisitorVerifyResponse` | Result of verifying a stored visitor token. |
| `ChatRequest` / `ChatResponseData` | Chat endpoint request and response bodies. |
| `ApiResponse<T>` / `ApiError` | Onedesk Pro API envelopes. |

## License

MIT © Typetech IT

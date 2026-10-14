# @onedeskpro/chatbot-react

React SDK for the [Onedesk Pro](https://onedeskpro.com) chatbot. Wraps [`@onedeskpro/chatbot-core`](https://www.npmjs.com/package/@onedeskpro/chatbot-core) in a provider, a drop-in widget, and a `useChatbot` hook for fully custom UI.

## Install

```bash
npm install @onedeskpro/chatbot-react
```

Requires React 18 or later as a peer dependency.

## Usage

Wrap your app in `ChatbotProvider` and render `ChatbotWidget`:

```tsx
import { ChatbotProvider, ChatbotWidget } from '@onedeskpro/chatbot-react';

export default function App() {
  return (
    <ChatbotProvider apiKey="your-onedesk-pro-api-key" theme="auto">
      <YourApp />
      <ChatbotWidget />
    </ChatbotProvider>
  );
}
```

`ChatbotProvider` accepts every `ChatbotInitOptions` field as a prop — `apiKey`, `apiBaseUrl`, `chatbotName`, `primaryColor`, `theme`, `position`, `welcomeMessage`, `placeholder`, `autoOpen`, `requestTimeoutMs`. Only `apiKey` is required. The `sessionId` prop is deprecated and ignored.

`ChatbotWidget` handles the whole flow itself: it asks a new visitor for their name and phone number before the chat opens, and shows the controls and banners for handing a conversation to a human agent.

The components are client-side; in Next.js App Router they carry `'use client'` already, so importing them from a server component is fine as long as the provider itself renders on the client.

## Custom UI

`useChatbot` gives you the whole conversation state and controls. A custom UI has to cover the two steps the built-in widget handles for you: identifying the visitor, and showing the conversation mode.

```tsx
import { useChatbot } from '@onedeskpro/chatbot-react';

function SupportPanel() {
  const {
    messages,
    isLoading,
    isReady,
    needsIdentify,
    mode,
    sendMessage,
    submitIdentify,
    requestHuman,
    resetSession,
  } = useChatbot();

  if (!isReady) return null;

  if (needsIdentify) {
    // Collect these from your own form. Phone must include the country code.
    return (
      <button
        onClick={() => submitIdentify({ name: 'Ada Lovelace', phone: '+8801712345678' })}
        disabled={isLoading}
      >
        Start chatting
      </button>
    );
  }

  return (
    <div>
      {messages.map((m) => (
        <p key={m.id}>
          {m.message.type}: {m.message.content}
        </p>
      ))}
      {mode === 'waiting' && <p>Waiting for a human agent…</p>}
      <button onClick={() => sendMessage('Hello')} disabled={isLoading || mode === 'closed'}>
        Send
      </button>
      {mode === 'ai' && <button onClick={requestHuman}>Talk to a person</button>}
      {mode === 'closed' && <button onClick={resetSession}>New conversation</button>}
    </div>
  );
}
```

`useChatbot` returns:

| Field | Description |
| --- | --- |
| `messages` | The conversation. `message.type` is `'human'` (the visitor), `'ai'`, or `'agent'` (a human agent). |
| `isOpen`, `isLoading`, `isReady` | Panel visibility, a request in flight, and whether the agent can answer. |
| `needsIdentify` | `true` until the visitor has identified. `sendMessage` rejects while it is. |
| `visitorToken`, `visitorName` | The identified visitor, or `null`. |
| `mode` | `'ai'`, `'waiting'`, `'human'`, or `'closed'`. |
| `blockReason`, `error` | Why the agent cannot answer, and the last error message. |
| `submitIdentify({ name, phone, email? })` | Identifies the visitor and unlocks the chat. |
| `sendMessage(text)` | Sends a message. |
| `requestHuman()` | Escalates to a human agent. Does nothing unless `mode` is `'ai'` and a conversation has started. |
| `resetSession()` | Clears a `closed` conversation. Does nothing in any other mode. |
| `open()`, `close()`, `toggle()` | Control the built-in widget's panel. |
| `sessionId` | Deprecated alias of `visitorToken`. |

`mode` also changes on its own — when the AI escalates, or an agent takes over, hands back, or closes the conversation — so render from it rather than from the result of your own calls. See the [`@onedeskpro/chatbot-core` README](https://www.npmjs.com/package/@onedeskpro/chatbot-core) for what each mode means.

For custom chrome around the built-in behavior, `ChatbotHeadless` takes `renderLauncher` and `renderWindow` render props instead of shipping any markup of its own. Its render props do not carry the identify or handoff controls; read those from `useChatbot` inside your render function.

## Exports

`ChatbotProvider`, `ChatbotWidget`, `ChatbotHeadless`, `useChatbot`, `ChatbotContext`, plus the `ChatbotProviderProps`, `ChatbotHeadlessProps`, `UseChatbotReturn`, `ChatbotInitOptions`, `ChatbotState`, `ChatMessage`, `ChatbotEventMap`, `ChatbotTicketMode`, and `TicketStatusData` types.

## Upgrading from 0.1

0.2.0 is a breaking release. The API no longer accepts the chat requests that 0.1 sends, so 0.1 cannot chat against the current API.

- With `ChatbotWidget`, upgrading is enough.
- With a custom UI built on `useChatbot`, add an identify step before the first `sendMessage`, and render `'agent'` messages. `resetSession` now only clears a `closed` conversation.

## License

MIT © Typetech IT

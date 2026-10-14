# Onedesk Pro Chatbot SDK

Embeddable chatbot SDK for [Onedesk Pro](https://onedeskpro.com). A framework-independent core plus a React layer on top.

## Packages

| Package | Description |
| --- | --- |
| [`@onedeskpro/chatbot-core`](packages/core) | Chat engine, visitor identification, AI-to-human handoff, API and socket clients, and a self-contained widget. Works anywhere, including via script tag. |
| [`@onedeskpro/chatbot-react`](packages/react) | `ChatbotProvider`, `ChatbotWidget`, and the `useChatbot` hook. |
| [`@onedeskpro/chatbot-types`](packages/shared-types) | Shared TypeScript types. Types only, no runtime. |

## Quick start

React:

```bash
npm install @onedeskpro/chatbot-react
```

```tsx
import { ChatbotProvider, ChatbotWidget } from '@onedeskpro/chatbot-react';

<ChatbotProvider apiKey="your-onedesk-pro-api-key">
  <App />
  <ChatbotWidget />
</ChatbotProvider>;
```

Anything else:

```bash
npm install @onedeskpro/chatbot-core
```

```ts
import { ChatbotCore } from '@onedeskpro/chatbot-core';

const chatbot = new ChatbotCore();
await chatbot.init({ apiKey: 'your-onedesk-pro-api-key' });
```

The widget asks each new visitor for a name and phone number before the chat opens, and lets them hand the conversation to a human agent. See each package README for the full API, and for what a custom UI has to do to cover those two steps.

## Development

```bash
pnpm install
pnpm build       # build all packages via turbo
pnpm dev         # rebuild on change
pnpm type-check
pnpm test        # vitest, jsdom environment
```

The React demo lives in [`demo/react`](demo/react).

### Tests

Unit tests are Vitest under jsdom and sit beside the code they cover
(`src/api-client.test.ts`, `src/widget/render.test.ts`,
`src/hooks/use-chatbot.test.tsx`). `packages/core` covers the session manager, the
API client, the markdown renderer, the widget and the `ChatbotCore` lifecycle;
`packages/react` drives the provider, the headless component and the `useChatbot`
hook through React Testing Library and `user-event`.

Shared helpers live in each package's `test/` folder, outside `src/` so they never
reach `dist/`:

- `test/setup.ts` starts the MSW server, installs the single `socket.io-client` mock
  and resets storage, the DOM and timers between tests.
- `test/mocks/handlers.ts` holds the happy-path MSW handlers for every `/sdk/*`
  endpoint; a test overrides one with `server.use()`. Nothing stubs `fetch`.
- `test/mocks/socket.ts` is the shared socket mock; `serverEmit()` simulates a push.
- `test/factories/*.factory.ts` build config, chat, ticket and visitor payloads.

The React package resolves `@onedeskpro/chatbot-core` from source in its Vitest
config, so the socket mock reaches core's client.

```bash
pnpm test                                              # every package, via turbo
pnpm --filter @onedeskpro/chatbot-core test            # one package
pnpm --filter @onedeskpro/chatbot-core exec vitest run src/api-client.test.ts
```

Browser E2E tests are Playwright specs in [`e2e/`](e2e), run against `demo/react`
with every API call mocked through `page.route`, so they never touch a real
workspace. Build first, and install the browser once:

```bash
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Two areas are worth keeping honest as the SDK grows:

- **The markdown renderer** writes AI output via `innerHTML`, so its suite asserts
  against a parsed DOM — no `on*` attributes, no live elements, no non-http
  schemes — rather than pattern-matching the HTML string.
- **`init()` is async at several points**, and each await is its own race. The
  supersession tests hold one request open so a superseded run is genuinely
  mid-flight when the live one starts; without that they pass vacuously.

## Releasing

Versions are kept in lockstep across the three packages. Publishing a GitHub
release publishes them to npm through
[`.github/workflows/release.yml`](.github/workflows/release.yml):

```bash
pnpm release:version 0.3.0   # bump all three packages
git commit -am "chore(release): 0.3.0"
git push
gh release create v0.3.0 --generate-notes
```

The workflow checks that the tag matches the package versions, runs
type-check, tests and build, then publishes `chatbot-types`, `chatbot-core` and
`chatbot-react` in that order. A release marked as a pre-release publishes under
the `next` dist-tag instead of `latest`. Versions already on npm are skipped, so
a failed run can be re-run.

It authenticates with npm trusted publishing, so no npm token is stored in
GitHub. Each package lists this repository and `release.yml` as a trusted
publisher on npmjs.com, with direct `npm publish` allowed.

## License

MIT © Typetech IT

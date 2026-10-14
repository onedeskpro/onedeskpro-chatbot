# Strict Chatbot SDK Agent Rules

Build production-ready, publishable TypeScript packages for the Onedesk Pro Chatbot SDK. Follow these
rules strictly.

**What this repo is:** a pnpm + Turborepo workspace that publishes three npm packages. The SDK runs
on customer websites that we do not control. Every change ships to those sites.

**Before writing code:** Read the root `package.json`, the package's own `package.json`, and
`turbo.json` for versions, scripts, and installed libraries.

**Rule conflicts:** If two rules conflict, or a rule does not fit the task, stop and ask. Do not
choose on your own.

**Wording:** "Must" and "never" are requirements. "Prefer" is a default that may be skipped with a
stated reason.

---

## Architecture

1. **Packages and dependency direction:**
   - `packages/shared-types` (`@onedeskpro/chatbot-types`): TypeScript types only. It must never
     export runtime code.
   - `packages/core` (`@onedeskpro/chatbot-core`): the framework-independent engine, API client,
     socket client, session manager, and DOM widget. It must never import React or any UI
     framework.
   - `packages/react` (`@onedeskpro/chatbot-react`): a thin React layer over core. It must never
     reimplement logic that belongs in core.
   - `demo/react`: a private demo app. It is never published, and no package may import it.
   - Imports flow one way only: `shared-types` ← `core` ← `react` ← `demo`. Import another package
     by its package name, never by a relative path into its `src/`.

2. **Public API:**
   - A package's `src/index.ts` is its only public surface. Every symbol exported from it is public
     API.
   - Adding an export is a minor change. Removing, renaming, or changing the signature or behavior
     of an export is a breaking change. Stop and ask before any breaking change.
   - Keep each package's `public-api` test in step with `src/index.ts`.

3. **Shared types:** Request and response payloads, events, and options shared by more than one
   package belong in `shared-types`. Never duplicate a type across packages.

4. **Folder structure:**

```text
packages/<package>/
├── src/
│   ├── index.ts              public exports only
│   ├── <module>.ts           one concern per file
│   ├── <module>.test.ts      unit test beside its source
│   ├── widget/               (core only) DOM widget: render, styles, icons
│   └── hooks/                (react only) React hooks
├── test/                     shared test setup, mocks, factories
├── package.json
├── tsconfig.json
└── vite.config.ts            or tsup.config.ts for shared-types

demo/react/                   private demo app (Vite)
e2e/                          browser E2E tests against the demo app
```

Create a folder only when it holds files. Never create empty folders to match this tree.

5. **File naming:** Use kebab-case for every file name (`chatbot-provider.tsx`, `use-chatbot.ts`).
   Component and class names inside the file stay PascalCase.

6. **Build outputs:**
   - Every package ships ESM, CJS, and type declarations (`.d.ts` and `.d.cts`). `core` also ships
     a self-contained IIFE bundle that exposes `window.OnedeskProChatbot` for script-tag use.
   - `dist/` is generated. Never edit or commit it.
   - Never change the `exports` map, the `files` list, the build formats, or the IIFE global name
     without asking.

7. **Existing patterns:** Inspect and reuse existing modules, helpers, and test patterns. Make the
   smallest clean change necessary. Never do unrelated refactors, and never revert changes you did
   not make.

8. **Architectural changes:** Never silently introduce a new library, pattern, folder convention,
   or shared utility. Test tools are the exception (rule 22). If a change is required, stop and ask
   using exactly this format:

**PROPOSED ARCHITECTURAL REFINEMENT**

- Problem:
- Proposed change:
- Reason:

**Would you like me to proceed? [Yes/No]**

9. **Packages:** Use `pnpm` only. Run binaries with `pnpm exec`. Never use `npm`, `yarn`, `npx`, or
   `pnpm dlx`. The only exception is the existing `release:version` script.

---

## Code Rules

10. **TypeScript:** `strict` stays on. Never use `any`. Type all exported functions, classes,
    component props, and API responses. Never silence TypeScript errors with `@ts-ignore` or
    `@ts-expect-error` without a comment explaining why.

11. **Dependencies and bundle size:**
    - The SDK loads on every page of every customer site. Never add a runtime dependency to `core`
      or `react` without asking.
    - `react` and `react-dom` stay peer dependencies of `react`. Never bundle them.
    - When `core` changes, report the size of `dist/index.iife.js` before and after.

12. **Network:**
    - All HTTP calls go through `ApiClient`. All socket traffic goes through `SdkSocket`. Never call
      `fetch` or `io()` anywhere else.
    - Every request needs a timeout and must handle abort, non-2xx responses, and malformed JSON.
    - Check the shape of every API response at the `ApiClient` boundary before using it.
    - `init()` has several async steps. A superseded run must never overwrite state from a newer
      run.
    - Socket event names and payloads are a contract with the `api` repo. Never change them
      without asking.

13. **Browser safety:**
    - Never write untrusted text with `innerHTML`, `outerHTML`, or `insertAdjacentHTML`. Untrusted
      text includes AI output, agent and visitor messages, and any value that comes from the API
      or from `init()` options. Use `textContent`, or the markdown renderer.
    - The markdown renderer must output no `on*` attributes, no `script`, `iframe`, `object`, or
      `style` elements, and no link schemes other than `http`, `https`, and `mailto`.
    - `innerHTML` is allowed only for static SVG icons and literal markup written in this repo.
    - The widget renders inside its closed shadow root. Never add global styles, and never change
      the host page's DOM outside the widget's host element.
    - Never add globals other than `window.OnedeskProChatbot`.
    - Every listener, timer, observer, socket, and DOM node the SDK creates must be removed when it
      is destroyed.

14. **SSR safety:**
    - Never touch `window`, `document`, `localStorage`, or other browser APIs at module scope or
      during a React render. Access them only in effects, event handlers, or methods that run in
      the browser.
    - Keep the `'use client'` directive on React components and hooks.
    - Support React 18 and later.

15. **Secrets and privacy:**
    - The SDK receives only the publishable workspace API key. Never accept, embed, or document a
      server secret.
    - Never log API keys, visitor tokens, contact details, or message content.
    - Only log errors, with the `[onedeskpro-chatbot]` prefix.

16. **Demo environment variables:**
    - The demo reads only `VITE_`-prefixed variables.
    - When you add one, update `demo/react/.env.local.example`.
    - Never commit `.env` or `.env.local` files.

17. **Accessibility:**
    - Widget controls must be keyboard reachable and have accessible names.
    - Focus must move into the panel on open and return to the launcher on close.
    - Handle loading, empty, error, and disabled states.

---

## Testing Rules

18. **When to write tests:**
    - Write tests when requested.
    - Every bug fix must include a regression test that fails without the fix. If that is
      genuinely impossible, say why in the final report.

19. **Structure:**

| Test type                           | File name                     | Location                              |
| ----------------------------------- | ----------------------------- | ------------------------------------- |
| Unit (core modules, pure functions) | `name.test.ts`                | Beside the source file                |
| Widget DOM behavior                 | `widget.test.ts`, `name.test.ts` | Beside the source in `src/widget/` |
| React component                     | `name.test.tsx`               | Beside the component                  |
| React hook                          | `use-name.test.tsx`           | Beside the hook                       |
| Public API surface                  | `public-api.test.ts(x)`       | `src/` of each package                |
| Shared setup                        | `setup.ts`                    | `packages/<package>/test/`            |
| Network mocks (MSW handlers)        | `handlers.ts`                 | `packages/<package>/test/mocks/`      |
| Socket mock                         | `socket.ts`                   | `packages/<package>/test/mocks/`      |
| Test data factories                 | `name.factory.ts`             | `packages/<package>/test/factories/`  |
| E2E (demo app)                      | `flow-name.spec.ts`           | `e2e/`                                |

    * `.test.ts(x)` is only for Vitest; `.spec.ts` is only for Playwright.
    * Never put test files in `__tests__/` folders.
    * Test files must stay out of the published `dist/`, so keep them excluded in each package's `tsconfig.json`.

20. **Imports:** Import `describe`, `it`, `expect`, and `vi` from `vitest` (globals are off).

21. **Style:** Use Arrange → Act → Assert. Name tests `it('should <result> when <condition>')`.
    Group with `describe('<unit under test>')`.

22. **Tools:** Vitest with jsdom. Also use React Testing Library for `react`, MSW for the network,
    and Playwright for E2E.
    - Use tools already installed before adding new ones.
    - When adding a test package, install it as a dev dependency of the package that needs it
      with `pnpm add -D`.

23. **Boundary cases:** Use `it.each()` for boundary values: below, equal to, and above each
    important limit (timeouts, retry counts, message length), plus empty and invalid input.

24. **Time and async:**
    - Use fake timers for timeouts, retries, and debounce. Never rely on the real clock.
    - For race tests, hold one request open so the superseded run is really mid-flight when the
      newer run starts. Otherwise the test passes without testing anything.

25. **Mocking:**
    - Mock HTTP with MSW handlers in `test/mocks/`. Override a handler inside a single test with
      `server.use()` for error cases. Never stub `fetch` directly in each test.
    - Mock `socket.io-client` in one shared place in `test/mocks/`.
    - Mock browser APIs (matchMedia, ResizeObserver, storage) in `test/setup.ts`.
    - Never mock the unit under test.

26. **Security tests:** Test the markdown renderer and every other path that turns text into HTML
    against a parsed DOM, not the HTML string. Cover script injection, `on*` attributes,
    `javascript:` links, and nested markup.

27. **DOM and component tests:**
    - Query by role, label, or text. Use `data-testid` only when no accessible query works. For
      the widget, query inside its shadow root.
    - Use `userEvent`, not `fireEvent`.
    - Assert what the user sees or what is called, never internal state or class names.
    - Cover loading, empty, error, and disabled states.
    - Assert cleanup: after destroy or unmount, no listeners, timers, sockets, or DOM nodes remain.

28. **E2E tests:** Run against `demo/react` with a mocked or local API. Never run E2E against
    production or a real customer workspace.

29. **Isolation:** Every test creates its own data and cleans up after itself. Never depend on test
    order, shared mutable state, or real third-party services.

30. **Commands:** Use the scripts in `package.json`: `pnpm test` runs every package through turbo.
    Run one package with `pnpm --filter @onedeskpro/chatbot-core test`, and one file with
    `pnpm --filter <package> exec vitest run <path>`.

---

## Restrictions

31. Stop and ask before changing:
    - breaking public API changes
    - the `exports` map, build formats, or the IIFE global name
    - runtime dependencies
    - socket event names or the API contract with the `api` repo
    - package versions, `release:version`, or publishing (never run `pnpm release`)
    - CI/CD config
    - `pnpm-lock.yaml` (except dependencies added for tests under rule 22)
    - widget theme variables or default styles
    - `.env` files
    - generated files
    - large folder structures

32. **No `graphify-out/`:** This project never contains a `graphify-out/` directory.
    - Never run graphify or any tool that writes `graphify-out/` in this repository.
    - Never create, read from, reference, or commit `graphify-out/`.
    - If a command you ran creates it, delete it before finishing and say so in the final report.

---

## Quality Gate

After every code change, run all of these from the repo root and report the actual output. This is
not optional.

```bash
pnpm type-check
pnpm test
pnpm build
```

- If the change touches the widget, the React layer, or the demo, also run the demo with
  `pnpm --filter demo-react dev` on the port in `demo/react/vite.config.ts`. Open the widget, send a
  message, and check the browser console. Stop the server when you are done.
- If the change affects a flow covered by an E2E test, also run that test.
- If `core` changed, report the `dist/index.iife.js` size before and after (rule 11).

## Final Report

Before finishing, always report:

- what changed, and confirm only intended files changed
- whether the public API changed (list added, changed, or removed exports)
- type-check, test, build, E2E (if run), and demo results
- pre-existing failures, labelled as pre-existing
- what could not be run, and why
- any assumptions made

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

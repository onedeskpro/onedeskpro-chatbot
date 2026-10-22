import '@testing-library/jest-dom/vitest';
import { File as NodeFile } from 'node:buffer';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { server } from './mocks/server';
import { resetSocketMock } from './mocks/socket';
import { stubMatchMedia } from './mocks/viewport';
import { installShadowRootCapture, restoreShadowRootCapture } from './shadow-root';

// One shared socket.io-client mock for every test file (rule 25).
vi.mock('socket.io-client', () => import('./mocks/socket'));

// MSW 3 sends requests through Node's fetch (undici), but here FormData, Blob
// and File are jsdom's. Vitest's Request shim copies a jsdom FormData into
// Node's without file names, and undici then wraps each Blob part in the global
// (jsdom) File, which drops its bytes. Re-encode the body with Node's own
// classes on the way into MSW, as a browser would send it.
let mswFetch: typeof fetch;

const toNodeFormData = async (form: FormData): Promise<FormData> => {
  const NodeFormData = (await new Response(new URLSearchParams()).formData())
    .constructor as typeof FormData;
  const out = new NodeFormData();
  for (const [key, value] of form) {
    if (typeof value === 'string') {
      out.append(key, value);
    } else {
      const file = new NodeFile([await value.arrayBuffer()], value.name, { type: value.type });
      out.append(key, file as unknown as File);
    }
  }
  return out;
};

beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
  mswFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) =>
    init?.body instanceof FormData
      ? mswFetch(input, { ...init, body: await toNodeFormData(init.body) })
      : mswFetch(input, init);
});

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  installShadowRootCapture();
  // Desktop by default; phone-layout tests call stubMatchMedia(true).
  stubMatchMedia(false);
});

afterEach(() => {
  server.resetHandlers();
  resetSocketMock();
  restoreShadowRootCapture();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => {
  globalThis.fetch = mswFetch;
  server.close();
});

import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { server } from './mocks/server';
import { resetSocketMock } from './mocks/socket';
import { installShadowRootCapture, restoreShadowRootCapture } from './shadow-root';

// One shared socket.io-client mock for every test file (rule 25).
vi.mock('socket.io-client', () => import('./mocks/socket'));

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  installShadowRootCapture();
});

afterEach(() => {
  server.resetHandlers();
  resetSocketMock();
  restoreShadowRootCapture();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => server.close());

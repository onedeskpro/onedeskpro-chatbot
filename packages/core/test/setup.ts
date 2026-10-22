import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { server } from './mocks/server';
import { resetSocketMock } from './mocks/socket';
import { stubMatchMedia } from './mocks/viewport';
import { installShadowRootCapture, restoreShadowRootCapture } from './shadow-root';

// One shared socket.io-client mock for every test file (rule 25).
vi.mock('socket.io-client', () => import('./mocks/socket'));

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

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

afterAll(() => server.close());

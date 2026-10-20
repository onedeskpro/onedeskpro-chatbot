import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { server } from './mocks/server';
import { resetSocketMock } from './mocks/socket';

// One shared socket.io-client mock for every test file (rule 25). Reaches core's
// socket client because vitest.config.ts resolves the core package from source.
vi.mock('socket.io-client', () => import('./mocks/socket'));

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  // Globals are off, so Testing Library cannot register its own cleanup.
  cleanup();
  server.resetHandlers();
  resetSocketMock();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

afterAll(() => server.close());

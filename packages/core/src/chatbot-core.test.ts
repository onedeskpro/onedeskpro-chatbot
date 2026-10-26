import type { ChatbotState, ChatMessage, TicketStatusData } from '@onedeskpro/chatbot-types';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { buildAttachment, buildChatResponse, buildTicketStatus } from '../test/factories/chat.factory';
import { buildSdkConfig } from '../test/factories/sdk-config.factory';
import {
  buildVisitorVerify,
  seedVisitorToken,
  VISITOR_TOKEN,
  VISITOR_TOKEN_KEY,
} from '../test/factories/visitor.factory';
import { ok, sdkUrl } from '../test/mocks/handlers';
import { server } from '../test/mocks/server';
import { sockets } from '../test/mocks/socket';
import { widgetRoot, widgetText } from '../test/shadow-root';
import { ChatbotCore, READINESS_RETRY_DELAYS_MS } from './chatbot-core';
import { SDK_UPLOAD_MAX_BYTES } from './constants';

const hostCount = () => document.querySelectorAll('#onedeskpro-chatbot-host').length;

/** A promise the test resolves by hand, to hold a request open mid-flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/**
 * Fake `setTimeout`/`clearTimeout` and count only the timers the SDK schedules.
 *
 * MSW 3 sends mocked requests through the real `fetch` (undici) and mocks the
 * socket underneath. Undici re-arms its internal connection timer with the global
 * `setTimeout`, so under fake timers that timer lands on the fake clock too. Leave
 * it out of the count so cleanup assertions see SDK timers only. The undici can be
 * Node's bundled copy or the npm package jsdom installs, so match both stack paths.
 * `vi.useRealTimers()` restores the real globals, which also removes this wrapper.
 */
const UNDICI_FRAME = /node:internal\/deps\/undici|[\\/]node_modules[\\/]undici[\\/]/;

function useFakeTimers() {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const fakeSetTimeout = globalThis.setTimeout;
  const fakeClearTimeout = globalThis.clearTimeout;
  const undiciTimers = new Set<ReturnType<typeof setTimeout>>();

  globalThis.setTimeout = ((handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => {
    if (!UNDICI_FRAME.test(new Error().stack ?? '')) {
      return fakeSetTimeout(handler, timeout, ...args);
    }
    const id = fakeSetTimeout(() => {
      undiciTimers.delete(id);
      handler(...args);
    }, timeout);
    undiciTimers.add(id);
    return id;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id?: ReturnType<typeof setTimeout>) => {
    if (id !== undefined) undiciTimers.delete(id);
    fakeClearTimeout(id);
  }) as typeof clearTimeout;

  return { sdkTimerCount: () => vi.getTimerCount() - undiciTimers.size };
}

/** Answer `/sdk/ticket-status` with `status` for this test only. */
const useTicketStatus = (status: TicketStatusData) =>
  server.use(http.get(sdkUrl('ticket-status'), () => ok(status)));

/** Answer `/sdk/chat` with `reply` for this test only. */
const useChatReply = (reply: Parameters<typeof buildChatResponse>[0]) =>
  server.use(http.post(sdkUrl('chat'), () => ok(buildChatResponse(reply))));

/** Init a core for a returning, verified visitor so it lands straight in chat. */
async function initVerified(options: Partial<Parameters<ChatbotCore['init']>[0]> = {}) {
  seedVisitorToken();
  const core = new ChatbotCore();
  await core.init({ apiKey: 'k', ...options });
  return core;
}

describe('ChatbotCore', () => {
  describe('init', () => {
    it('should reject when no apiKey is given', async () => {
      // Arrange
      const core = new ChatbotCore();

      // Act
      const result = core.init({ apiKey: '' });

      // Assert
      await expect(result).rejects.toThrow(/apiKey/);
    });

    it('should mount the widget and show the identify form when no token is stored', async () => {
      // Arrange
      const core = new ChatbotCore();

      // Act
      await core.init({ apiKey: 'k' });

      // Assert
      expect(hostCount()).toBe(1);
      expect(core.getState().isReady).toBe(true);
      expect(core.getState().needsIdentify).toBe(true);
      expect(widgetText()).toContain('Start Chatting');
      core.destroy();
    });

    it('should skip identify when a stored visitor token verifies', async () => {
      // Arrange / Act
      const core = await initVerified();

      // Assert
      expect(core.getState().needsIdentify).toBe(false);
      expect(core.getState().visitorToken).toBe(VISITOR_TOKEN);
      core.destroy();
    });

    it('should adopt the agent name from remote config when the caller did not set one', async () => {
      // Arrange
      const auto = new ChatbotCore();

      // Act
      await auto.init({ apiKey: 'k' });
      const autoText = widgetText();
      auto.destroy();
      const explicit = new ChatbotCore();
      await explicit.init({ apiKey: 'k', chatbotName: 'My Bot' });

      // Assert
      expect(autoText).toContain('Remote Bot');
      expect(widgetText()).toContain('My Bot');
      expect(widgetText()).not.toContain('Remote Bot');
      explicit.destroy();
    });

    it.each(['no-prompt', 'no-collections', 'ai-unavailable', 'no-credits'] as const)(
      'should keep the widget off the page and announce ready when the agent is blocked by %s',
      async (blockReason) => {
        // Arrange
        server.use(
          http.get(sdkUrl('config'), () => ok(buildSdkConfig({ ready: false, blockReason }))),
        );
        const core = new ChatbotCore();
        const ready = vi.fn();
        core.on('ready', ready);

        // Act
        await core.init({ apiKey: 'k' });

        // Assert
        expect(hostCount()).toBe(0);
        expect(core.getState()).toMatchObject({ isReady: false, blockReason });
        expect(ready).toHaveBeenCalledOnce();
        core.destroy();
      },
    );

    it('should keep the widget off the page when no agent is assigned to the channel', async () => {
      // Arrange
      server.use(
        http.get(sdkUrl('config'), () =>
          HttpResponse.json(
            { statusCode: 403, code: 'agent_not_assigned', message: 'No AI agent is assigned', timestamp: '', path: '/sdk/config' },
            { status: 403 },
          ),
        ),
      );
      const core = new ChatbotCore();

      // Act
      await core.init({ apiKey: 'k' });

      // Assert
      expect(hostCount()).toBe(0);
      expect(core.getState()).toMatchObject({ isReady: false, blockReason: 'no-agent' });
      core.destroy();
    });

    it('should not load chat history into state when a returning visitor verifies', async () => {
      // Arrange / Act
      const core = await initVerified();

      // Assert
      expect(core.getState().messages).toHaveLength(0);
      core.destroy();
    });

    // Spreading optional config through is routine: apiBaseUrl={process.env.X}
    // with X unset must not defeat the default.
    it('should ignore options when they are explicitly passed as undefined', async () => {
      // Arrange
      const core = new ChatbotCore();

      // Act
      const result = core.init({ apiKey: 'k', apiBaseUrl: undefined, theme: undefined });

      // Assert
      await expect(result).resolves.not.toThrow();
      expect(core.getState().isReady).toBe(true);
      core.destroy();
    });
  });

  describe('readiness when the server is unavailable', () => {
    /** Answers `/sdk/config` with each reply in turn, counting the calls. */
    function useConfigReplies(...replies: Array<() => Response>) {
      const calls = { count: 0 };
      server.use(
        http.get(sdkUrl('config'), () => {
          const reply = replies[Math.min(calls.count, replies.length - 1)];
          calls.count += 1;
          return reply();
        }),
      );
      return calls;
    }
    const unreachable = () => HttpResponse.error();
    const failing = () => new HttpResponse(null, { status: 503 });
    const ready = () => ok(buildSdkConfig());

    it.each([
      { case: 'unreachable', reply: unreachable },
      { case: 'answering with a 5xx', reply: failing },
    ])('should keep the widget off the page and retry when the server is $case', async ({ reply }) => {
      // Arrange
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const calls = useConfigReplies(reply, ready);
      seedVisitorToken();
      const core = new ChatbotCore();

      // Act
      await core.init({ apiKey: 'k' });
      const whileDown = { hosts: hostCount(), state: core.getState() };
      await vi.advanceTimersByTimeAsync(READINESS_RETRY_DELAYS_MS[0]);

      // Assert
      expect(whileDown.hosts).toBe(0);
      expect(whileDown.state).toMatchObject({ isReady: false, blockReason: 'server-unavailable' });
      expect(calls.count).toBe(2);
      expect(hostCount()).toBe(1);
      expect(core.getState()).toMatchObject({ isReady: true, blockReason: null, error: null });
      core.destroy();
    });

    it.each([
      { case: 'below the first delay', elapsed: READINESS_RETRY_DELAYS_MS[0] - 1, calls: 1 },
      { case: 'equal to the first delay', elapsed: READINESS_RETRY_DELAYS_MS[0], calls: 2 },
    ])('should make $calls config call(s) when the time since the failure is $case', async ({ elapsed, calls: expected }) => {
      // Arrange
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const calls = useConfigReplies(unreachable);
      const core = new ChatbotCore();
      await core.init({ apiKey: 'k' });

      // Act
      await vi.advanceTimersByTimeAsync(elapsed);

      // Assert
      expect(calls.count).toBe(expected);
      core.destroy();
    });

    it('should stop retrying and announce ready when every retry fails', async () => {
      // Arrange
      const timers = useFakeTimers();
      const calls = useConfigReplies(unreachable);
      const core = new ChatbotCore();
      const readyEvents = vi.fn();
      core.on('ready', readyEvents);
      const total = READINESS_RETRY_DELAYS_MS.reduce((sum, delay) => sum + delay, 0);

      // Act
      await core.init({ apiKey: 'k' });
      await vi.advanceTimersByTimeAsync(total * 2);

      // Assert
      expect(calls.count).toBe(1 + READINESS_RETRY_DELAYS_MS.length);
      expect(readyEvents).toHaveBeenCalledOnce();
      expect(timers.sdkTimerCount()).toBe(0);
      expect(hostCount()).toBe(0);
      expect(core.getState()).toMatchObject({ isReady: false, blockReason: 'server-unavailable' });
      core.destroy();
    });

    it('should not retry when the server rejects the API key', async () => {
      // Arrange
      const timers = useFakeTimers();
      const calls = useConfigReplies(() =>
        HttpResponse.json(
          { statusCode: 401, code: 'unauthorized', message: 'Invalid API key', timestamp: '', path: '/sdk/config' },
          { status: 401 },
        ),
      );
      const core = new ChatbotCore();

      // Act
      await core.init({ apiKey: 'k' });
      await vi.advanceTimersByTimeAsync(READINESS_RETRY_DELAYS_MS[0]);

      // Assert
      expect(calls.count).toBe(1);
      expect(timers.sdkTimerCount()).toBe(0);
      expect(hostCount()).toBe(0);
      expect(core.getState()).toMatchObject({ isReady: false, blockReason: null, error: 'Invalid API key' });
      core.destroy();
    });

    it('should cancel the pending retry when destroyed', async () => {
      // Arrange
      const timers = useFakeTimers();
      const calls = useConfigReplies(unreachable, ready);
      const core = new ChatbotCore();
      await core.init({ apiKey: 'k' });

      // Act
      core.destroy();
      await vi.advanceTimersByTimeAsync(READINESS_RETRY_DELAYS_MS[0]);

      // Assert
      expect(calls.count).toBe(1);
      expect(timers.sdkTimerCount()).toBe(0);
      expect(hostCount()).toBe(0);
    });
  });

  describe('widget visibility', () => {
    it('should keep the launcher hidden until the visitor check has settled', async () => {
      // Arrange: hold the visitor check open so init is mid-flight.
      const gate = deferred<void>();
      server.use(
        http.get(sdkUrl('visitor'), async () => {
          await gate.promise;
          return ok(buildVisitorVerify());
        }),
      );
      seedVisitorToken();
      const core = new ChatbotCore();

      // Act
      const initializing = core.init({ apiKey: 'k' });
      await vi.waitFor(() => expect(hostCount()).toBe(1));
      const host = document.getElementById('onedeskpro-chatbot-host');

      // Assert: mounted but hidden while the check runs, shown once it settles.
      expect(host).not.toBeVisible();
      gate.resolve();
      await initializing;
      expect(host).toBeVisible();
      core.destroy();
    });
  });

  describe('submitIdentify', () => {
    it('should store the visitor token and open chat when identify succeeds', async () => {
      // Arrange
      const core = new ChatbotCore();
      await core.init({ apiKey: 'k' });

      // Act
      await core.submitIdentify({ name: 'Remo', phone: '+8801744716387' });

      // Assert
      expect(core.getState().needsIdentify).toBe(false);
      expect(core.getState().visitorToken).toBe(VISITOR_TOKEN);
      expect(core.getState().visitorName).toBe('Remo');
      expect(localStorage.getItem(VISITOR_TOKEN_KEY)).toBe(VISITOR_TOKEN);
      core.destroy();
    });
  });

  describe('sendMessage', () => {
    it('should reject when called before identify', async () => {
      // Arrange
      const core = new ChatbotCore();

      // Act
      const result = core.sendMessage('hi');

      // Assert
      await expect(result).rejects.toThrow(/Identify/);
    });

    // The optimistic message and the isLoading flip had no event, so a React
    // consumer saw nothing at all until the reply arrived.
    it('should announce the user message and the loading state when the reply has not landed yet', async () => {
      // Arrange
      const reply = deferred<void>();
      server.use(
        http.post(sdkUrl('chat'), async () => {
          await reply.promise;
          return ok(buildChatResponse());
        }),
      );
      const core = await initVerified();
      const seen: ChatbotState[] = [];
      core.on('state-change', (s) => seen.push(s));

      // Act
      const pending = core.sendMessage('hello');

      // Assert
      expect(seen).toHaveLength(1);
      expect(seen[0].messages.map((m) => m.message.content)).toEqual(['hello']);
      expect(seen[0].isLoading).toBe(true);

      reply.resolve();
      await pending;
      const last = seen[seen.length - 1];
      expect(last.isLoading).toBe(false);
      expect(last.messages.map((m) => m.message.type)).toEqual(['human', 'ai']);
      core.destroy();
    });

    it('should emit a message event for both messages when the AI replies', async () => {
      // Arrange
      const core = await initVerified();
      const messages: ChatMessage[] = [];
      core.on('message', (m) => messages.push(m));

      // Act
      await core.sendMessage('hello');

      // Assert
      expect(messages.map((m) => m.message.type)).toEqual(['human', 'ai']);
      core.destroy();
    });

    it('should give every message a distinct id when they are created within the same millisecond', async () => {
      // Arrange
      const core = await initVerified();

      // Act
      await core.sendMessage('one');
      await core.sendMessage('two');

      // Assert
      const ids = core.getState().messages.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      core.destroy();
    });

    it.each([
      { label: 'empty', input: '' },
      { label: 'spaces only', input: '   ' },
      { label: 'mixed whitespace only', input: '\n\t  ' },
    ])('should send nothing when the input is $label', async ({ input }) => {
      // Arrange
      const bodies: unknown[] = [];
      server.use(
        http.post(sdkUrl('chat'), async ({ request }) => {
          bodies.push(await request.json());
          return ok(buildChatResponse());
        }),
      );
      const core = await initVerified();

      // Act
      await core.sendMessage(input);

      // Assert
      expect(core.getState().messages).toHaveLength(0);
      expect(bodies).toHaveLength(0);
      core.destroy();
    });

    it('should ignore blank input and trim what it sends when the input is padded', async () => {
      // Arrange
      const bodies: Array<{ chatInput: string; visitorToken: string }> = [];
      server.use(
        http.post(sdkUrl('chat'), async ({ request }) => {
          bodies.push((await request.json()) as { chatInput: string; visitorToken: string });
          return ok(buildChatResponse());
        }),
      );
      const core = await initVerified();

      // Act
      await core.sendMessage('   ');
      const afterBlank = core.getState().messages.length;
      await core.sendMessage('  padded  ');

      // Assert
      expect(afterBlank).toBe(0);
      expect(core.getState().messages[0].message.content).toBe('padded');
      expect(bodies).toHaveLength(1);
      expect(bodies[0].chatInput).toBe('padded');
      expect(bodies[0].visitorToken).toBe(VISITOR_TOKEN);
      core.destroy();
    });

    it('should record the failure and release the loading state when the chat request fails', async () => {
      // Arrange
      const core = await initVerified();
      server.use(
        http.post(
          sdkUrl('chat'),
          () => new HttpResponse('boom', { status: 500, statusText: 'Server Error' }),
        ),
      );
      const errors: Error[] = [];
      core.on('error', (e) => errors.push(e));

      // Act
      await core.sendMessage('hi');

      // Assert
      expect(errors).toHaveLength(1);
      expect(core.getState().isLoading).toBe(false);
      expect(core.getState().error).toContain('500');
      core.destroy();
    });

    it('should recover and send again when the previous request timed out', async () => {
      // Arrange
      const core = await initVerified({ requestTimeoutMs: 30 });
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      server.use(
        http.post(
          sdkUrl('chat'),
          async () => {
            await delay('infinite');
            return ok(buildChatResponse());
          },
          { once: true },
        ),
      );

      // Act
      const hanging = core.sendMessage('hangs');
      await vi.advanceTimersByTimeAsync(30);
      await hanging;
      const afterTimeout = core.getState();
      await core.sendMessage('works');

      // Assert
      expect(afterTimeout.isLoading).toBe(false);
      expect(afterTimeout.error).toMatch(/timed out/i);
      expect(core.getState().messages.some((m) => m.message.content === 'AI reply')).toBe(true);
      core.destroy();
    });
  });

  describe('sendAttachments', () => {
    const png = () => new File(['png'], 'photo.png', { type: 'image/png' });

    it('should reject when called before identify', async () => {
      // Arrange
      const core = new ChatbotCore();
      await core.init({ apiKey: 'k' });

      // Act
      const result = core.sendAttachments([png()]);

      // Assert
      await expect(result).rejects.toThrow(/Identify before sendAttachments/);
      core.destroy();
    });

    it('should show a pending bubble, then the uploaded file and the AI reply when the upload lands', async () => {
      // Arrange
      const upload = deferred<void>();
      const chatBodies: unknown[] = [];
      server.use(
        http.post(sdkUrl('upload'), async () => {
          await upload.promise;
          return ok(buildAttachment());
        }),
        http.post(sdkUrl('chat'), async ({ request }) => {
          chatBodies.push(await request.json());
          return ok(buildChatResponse({ text: 'Nice photo' }));
        }),
      );
      const core = await initVerified();

      // Act
      const pending = core.sendAttachments([png()], 'look');

      // Assert — while uploading
      const mid = core.getState();
      expect(mid.isLoading).toBe(true);
      expect(mid.messages).toHaveLength(1);
      expect(mid.messages[0].pending).toBe(true);
      expect(mid.messages[0].message.attachments?.[0].fileName).toBe('photo.png');
      expect(widgetText()).toContain('Uploading…');

      upload.resolve();
      await pending;

      // Assert — after
      const done = core.getState();
      expect(done.isLoading).toBe(false);
      expect(done.messages.map((m) => m.message.type)).toEqual(['human', 'ai']);
      expect(done.messages[0].pending).toBe(false);
      expect(done.messages[0].message.attachments).toEqual([buildAttachment()]);
      expect(chatBodies).toEqual([
        { chatInput: 'look', visitorToken: VISITOR_TOKEN, attachments: [buildAttachment()] },
      ]);
      expect(widgetText()).not.toContain('Uploading…');
      expect(widgetRoot().querySelector('img')?.getAttribute('src')).toBe(buildAttachment().url);
      core.destroy();
    });

    it('should report the limit and send nothing when a file is too large', async () => {
      // Arrange
      const requests: string[] = [];
      server.use(
        http.post(sdkUrl('upload'), () => {
          requests.push('upload');
          return ok(buildAttachment());
        }),
      );
      const core = await initVerified();
      const errors: Error[] = [];
      core.on('error', (e) => errors.push(e));
      const big = new File([new Uint8Array(SDK_UPLOAD_MAX_BYTES + 1)], 'big.png', { type: 'image/png' });

      // Act
      await core.sendAttachments([big]);

      // Assert
      expect(requests).toEqual([]);
      expect(core.getState().messages).toEqual([]);
      expect(core.getState().error).toContain('big.png');
      expect(errors).toHaveLength(1);
      core.destroy();
    });

    it('should drop the bubble and record the error when the upload is rejected', async () => {
      // Arrange
      server.use(
        http.post(sdkUrl('upload'), () =>
          HttpResponse.json(
            { statusCode: 400, message: 'Unsupported file type', code: 'validation_failed' },
            { status: 400 },
          ),
        ),
      );
      const core = await initVerified();

      // Act
      await core.sendAttachments([png()]);

      // Assert
      const state = core.getState();
      expect(state.messages).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Unsupported file type');
      expect(widgetText()).toContain('Unsupported file type');
      core.destroy();
    });

    it('should refuse to send files when the conversation is closed', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'closed' }));
      const core = await initVerified();

      // Act
      await core.sendAttachments([png()]);

      // Assert
      expect(core.getState().messages).toEqual([]);
      expect(core.getState().error).toBe('Conversation is closed');
      core.destroy();
    });
  });

  describe('sendVoice', () => {
    const recording = () => ({
      blob: new Blob(['opus-bytes'], { type: 'audio/webm;codecs=opus' }),
      durationSeconds: 4.2,
    });

    it('should reject when called before identify', async () => {
      // Arrange
      const core = new ChatbotCore();
      await core.init({ apiKey: 'k' });

      // Act / Assert
      await expect(core.sendVoice(recording())).rejects.toThrow(/Identify before sendVoice/);
      core.destroy();
    });

    it('should upload the note and post a voice message with its duration when the recording is sent', async () => {
      // Arrange
      const chatBodies: unknown[] = [];
      const uploadTypes: string[] = [];
      server.use(
        http.post(sdkUrl('upload'), async ({ request }) => {
          uploadTypes.push(await request.text());
          return ok(buildAttachment({ type: 'audio/webm', fileName: 'voice-message-1.webm', size: 10 }));
        }),
        http.post(sdkUrl('chat'), async ({ request }) => {
          chatBodies.push(await request.json());
          return ok(buildChatResponse({ text: '' }));
        }),
      );
      const core = await initVerified();

      // Act
      await core.sendVoice(recording());

      // Assert
      expect(uploadTypes[0]).toContain('Content-Type: audio/webm');
      expect(chatBodies).toEqual([
        {
          chatInput: '',
          visitorToken: VISITOR_TOKEN,
          messageType: 'voice',
          attachments: [
            { type: 'audio/webm', url: buildAttachment().url, fileName: 'voice-message-1.webm', size: 10, durationSeconds: 4 },
          ],
        },
      ]);
      const [message] = core.getState().messages;
      expect(message.pending).toBe(false);
      expect(message.message.attachments?.[0].durationSeconds).toBe(4);
      expect(widgetRoot().querySelector('audio')?.getAttribute('src')).toBe(buildAttachment().url);
      core.destroy();
    });

    it('should do nothing when the recording is empty', async () => {
      // Arrange
      const core = await initVerified();

      // Act
      await core.sendVoice({ blob: new Blob([], { type: 'audio/webm' }), durationSeconds: 0 });

      // Assert
      expect(core.getState().messages).toEqual([]);
      expect(core.getState().isLoading).toBe(false);
      core.destroy();
    });
  });

  describe('agent media messages', () => {
    it('should render the attachment when an agent pushes a media message', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'human', agentName: 'Ana' }));
      const core = await initVerified();
      const attachment = buildAttachment({ url: 'https://cdn.example.com/from-agent.png' });

      // Act
      sockets[0].serverEmit('message:receive', {
        id: 'm1',
        messageType: 'media',
        textMessage: 'photo.png',
        attachments: [attachment],
      });

      // Assert
      const [message] = core.getState().messages;
      expect(message.message.type).toBe('agent');
      expect(message.message.attachments).toEqual([attachment]);
      expect(widgetRoot().querySelector('img')?.getAttribute('src')).toBe(attachment.url);
      core.destroy();
    });

    it('should keep both messages when an agent sends two different files with the same label', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'human', agentName: 'Ana' }));
      const core = await initVerified();

      // Act
      sockets[0].serverEmit('message:receive', {
        id: 'm1',
        textMessage: 'Image',
        attachments: [buildAttachment({ url: 'https://cdn.example.com/1.png' })],
      });
      sockets[0].serverEmit('message:receive', {
        id: 'm2',
        textMessage: 'Image',
        attachments: [buildAttachment({ url: 'https://cdn.example.com/2.png' })],
      });

      // Assert
      expect(core.getState().messages).toHaveLength(2);
      core.destroy();
    });

    it('should ignore a pushed message that has neither text nor usable attachments', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'human', agentName: 'Ana' }));
      const core = await initVerified();

      // Act
      sockets[0].serverEmit('message:receive', {
        id: 'm1',
        attachments: [{ type: 'image/png', url: 'javascript:alert(1)' }],
      });

      // Assert
      expect(core.getState().messages).toEqual([]);
      core.destroy();
    });
  });

  describe('getState', () => {
    it('should not mutate a snapshot when state changes after it was taken', async () => {
      // Arrange
      const core = await initVerified();
      const before = core.getState();

      // Act
      await core.sendMessage('hi');

      // Assert
      expect(before.messages).toHaveLength(0);
      expect(before.messages).not.toBe(core.getState().messages);
      core.destroy();
    });
  });

  describe('resetSession', () => {
    it('should clear and return to ai while keeping the visitor token when the episode is closed', async () => {
      // Arrange
      useChatReply({ text: 'done', mode: 'closed' });
      const core = await initVerified();
      await core.sendMessage('hi');
      expect(core.getState().mode).toBe('closed');
      const first = core.getState().visitorToken;
      let announced = false;
      core.on('session-reset', () => {
        announced = true;
      });

      // Act
      core.resetSession();

      // Assert
      expect(core.getState().messages).toHaveLength(0);
      expect(core.getState().mode).toBe('ai');
      expect(core.getState().visitorToken).toBe(first);
      expect(announced).toBe(true);
      core.destroy();
    });

    it('should do nothing when the episode is still open', async () => {
      // Arrange
      const core = await initVerified();
      await core.sendMessage('hi');
      let announced = false;
      core.on('session-reset', () => {
        announced = true;
      });

      // Act
      core.resetSession();

      // Assert
      expect(core.getState().messages.length).toBeGreaterThan(0);
      expect(announced).toBe(false);
      core.destroy();
    });
  });

  describe('requestHuman', () => {
    it('should escalate from ai to waiting and emit events when a ticket exists', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'ai', conversationId: 'c1' }));
      server.use(
        http.post(sdkUrl('human-request'), () =>
          ok(buildTicketStatus({ mode: 'waiting', conversationId: 'c1' })),
        ),
      );
      const core = await initVerified();
      const statuses: Array<{ mode: string }> = [];
      let requested = false;
      core.on('human-requested', () => {
        requested = true;
      });
      core.on('ticket-status', (s) => statuses.push(s));

      // Act
      await core.requestHuman();

      // Assert
      expect(core.getState().mode).toBe('waiting');
      expect(requested).toBe(true);
      expect(statuses.some((s) => s.mode === 'waiting')).toBe(true);
      core.destroy();
    });

    it('should do nothing when the mode is not ai', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'waiting', conversationId: 'c1' }));
      server.use(http.post(sdkUrl('human-request'), () => ok(buildTicketStatus({ mode: 'human' }))));
      const core = await initVerified();
      expect(core.getState().mode).toBe('waiting');

      // Act
      await core.requestHuman();

      // Assert
      expect(core.getState().mode).toBe('waiting');
      core.destroy();
    });

    it('should do nothing when no ticket exists yet', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'ai' }));
      server.use(
        http.post(sdkUrl('human-request'), () =>
          ok(buildTicketStatus({ mode: 'waiting', conversationId: 'c1' })),
        ),
      );
      const core = await initVerified();
      let requested = false;
      core.on('human-requested', () => {
        requested = true;
      });

      // Act
      await core.requestHuman();

      // Assert
      expect(core.getState().mode).toBe('ai');
      expect(requested).toBe(false);
      core.destroy();
    });
  });

  describe('startNewConversation', () => {
    /** Answer `/sdk/conversation/close` with `status` and record each request body. */
    function useCloseConversation(status: TicketStatusData = buildTicketStatus({ mode: 'closed', conversationId: 'c1' })) {
      const bodies: unknown[] = [];
      server.use(
        http.post(sdkUrl('conversation/close'), async ({ request }) => {
          bodies.push(await request.json());
          return ok(status);
        }),
      );
      return bodies;
    }

    it('should end the conversation on the API and start an empty one in ai mode when the visitor is mid-chat', async () => {
      // Arrange
      const bodies = useCloseConversation();
      const core = await initVerified();
      await core.sendMessage('hi');
      let resets = 0;
      core.on('session-reset', () => {
        resets += 1;
      });

      // Act
      await core.startNewConversation();

      // Assert
      expect(bodies).toEqual([{ visitorToken: VISITOR_TOKEN }]);
      expect(core.getState().messages).toHaveLength(0);
      expect(core.getState().mode).toBe('ai');
      expect(core.getState().isLoading).toBe(false);
      expect(core.getState().visitorToken).toBe(VISITOR_TOKEN);
      expect(resets).toBe(1);
      core.destroy();
    });

    it.each(['waiting', 'human', 'closed'] as const)(
      'should return to ai mode when started from %s',
      async (mode) => {
        // Arrange
        useTicketStatus(buildTicketStatus({ mode, conversationId: 'c1', agentName: 'Ana' }));
        useCloseConversation();
        const core = await initVerified();
        expect(core.getState().mode).toBe(mode);

        // Act
        await core.startNewConversation();

        // Assert
        expect(core.getState().mode).toBe('ai');
        expect(widgetText()).not.toContain('Waiting for a human agent');
        expect(widgetText()).not.toContain('Connected with Ana');
        expect(widgetText()).not.toContain('This conversation is closed');
        core.destroy();
      },
    );

    it('should stay in ai mode when the ended conversation is pushed as closed mid-flight', async () => {
      // Arrange: the API pushes `closed` over the socket while the close request is open.
      const gate = deferred<void>();
      server.use(
        http.post(sdkUrl('conversation/close'), async () => {
          await gate.promise;
          return ok(buildTicketStatus({ mode: 'closed', conversationId: 'c1' }));
        }),
      );
      const core = await initVerified();
      await core.sendMessage('hi');

      // Act
      const starting = core.startNewConversation();
      sockets[0].serverEmit('ticket:status', buildTicketStatus({ mode: 'closed', conversationId: 'c1' }));
      gate.resolve();
      await starting;

      // Assert
      expect(core.getState().mode).toBe('ai');
      core.destroy();
    });

    it('should ignore the ended conversation when its closed status arrives after the reset', async () => {
      // Arrange
      useCloseConversation();
      const core = await initVerified();
      await core.sendMessage('hi');
      await core.startNewConversation();
      const statuses: TicketStatusData[] = [];
      core.on('ticket-status', (s) => statuses.push(s));

      // Act
      sockets[0].serverEmit('ticket:status', buildTicketStatus({ mode: 'closed', conversationId: 'c1' }));

      // Assert
      expect(core.getState().mode).toBe('ai');
      expect(statuses).toEqual([]);
      core.destroy();
    });

    it('should ignore the ended conversation when the socket reconnects and restores its status', async () => {
      // Arrange
      useCloseConversation();
      const core = await initVerified();
      await core.sendMessage('hi');
      await core.startNewConversation();
      const restore = deferred<void>();
      server.use(
        http.get(sdkUrl('ticket-status'), () => {
          restore.resolve();
          return ok(buildTicketStatus({ mode: 'closed', conversationId: 'c1' }));
        }),
      );
      let restored = 0;
      core.on('ticket-status', () => {
        restored += 1;
      });

      // Act: the first `connect` is the initial one; the second is a reconnect.
      sockets[0].serverEmit('connect');
      sockets[0].serverEmit('connect');
      await restore.promise;
      // Let the core read the response it was just sent.
      await new Promise((resolve) => setTimeout(resolve, 0));

      // Assert
      expect(core.getState().mode).toBe('ai');
      expect(restored).toBe(0);
      core.destroy();
    });

    it('should apply a closed status again once the next message starts a new ticket', async () => {
      // Arrange
      useCloseConversation();
      const core = await initVerified();
      await core.sendMessage('hi');
      await core.startNewConversation();
      await core.sendMessage('a new question');

      // Act: the same conversation id now belongs to the new ticket.
      sockets[0].serverEmit('ticket:status', buildTicketStatus({ mode: 'closed', conversationId: 'c1' }));

      // Assert
      expect(core.getState().mode).toBe('closed');
      core.destroy();
    });

    it('should keep the conversation and report the failure when the API rejects the close', async () => {
      // Arrange
      server.use(
        http.post(sdkUrl('conversation/close'), () =>
          HttpResponse.json({ statusCode: 500, message: 'boom', code: 'X' }, { status: 500 }),
        ),
      );
      const core = await initVerified();
      await core.sendMessage('hi');
      const errors: Error[] = [];
      core.on('error', (e) => errors.push(e));
      let resets = 0;
      core.on('session-reset', () => {
        resets += 1;
      });

      // Act
      await core.startNewConversation();

      // Assert
      expect(core.getState().messages.map((m) => m.message.content)).toEqual(['hi', 'AI reply']);
      expect(core.getState().error).toBe('boom');
      expect(core.getState().isLoading).toBe(false);
      expect(errors.map((e) => e.message)).toEqual(['boom']);
      expect(resets).toBe(0);
      expect(widgetText()).toContain('Could not start a new conversation. Please try again.');
      core.destroy();
    });

    it('should reject the reply when the API answers with an unexpected shape', async () => {
      // Arrange
      server.use(http.post(sdkUrl('conversation/close'), () => ok({ mode: 'gone' })));
      const core = await initVerified();
      await core.sendMessage('hi');

      // Act
      await core.startNewConversation();

      // Assert
      expect(core.getState().messages).toHaveLength(2);
      expect(core.getState().error).toMatch(/unexpected ticket status/);
      core.destroy();
    });

    it('should not call the API when the visitor has not identified', async () => {
      // Arrange
      const bodies = useCloseConversation();
      const core = new ChatbotCore();
      await core.init({ apiKey: 'k' });

      // Act
      await core.startNewConversation();

      // Assert
      expect(bodies).toEqual([]);
      core.destroy();
    });

    it('should leave a destroyed instance alone when the close resolves after destroy', async () => {
      // Arrange: hold the close open, so destroy() lands mid-flight.
      const gate = deferred<void>();
      server.use(
        http.post(sdkUrl('conversation/close'), async () => {
          await gate.promise;
          return ok(buildTicketStatus({ mode: 'closed', conversationId: 'c1' }));
        }),
      );
      const core = await initVerified();
      await core.sendMessage('hi');
      let resets = 0;
      core.on('session-reset', () => {
        resets += 1;
      });

      // Act
      const starting = core.startNewConversation();
      core.destroy();
      gate.resolve();
      await starting;

      // Assert
      expect(resets).toBe(0);
      expect(core.getState().messages).toHaveLength(2);
      expect(hostCount()).toBe(0);
    });
  });

  describe('cancelHumanRequest', () => {
    /** Answer `/sdk/human-request/cancel` with `status` and count the requests. */
    function useCancel(status: TicketStatusData) {
      const calls = { count: 0 };
      server.use(
        http.post(sdkUrl('human-request/cancel'), () => {
          calls.count += 1;
          return ok(status);
        }),
      );
      return calls;
    }

    it('should hand the conversation back to the AI and emit events when the request is still waiting', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'waiting', conversationId: 'c1' }));
      useCancel(buildTicketStatus({ mode: 'ai', conversationId: 'c1' }));
      const core = await initVerified();
      let cancelled = 0;
      core.on('human-request-cancelled', () => {
        cancelled += 1;
      });
      const statuses: TicketStatusData[] = [];
      core.on('ticket-status', (s) => statuses.push(s));

      // Act
      await core.cancelHumanRequest();

      // Assert
      expect(core.getState().mode).toBe('ai');
      expect(core.getState().isLoading).toBe(false);
      expect(cancelled).toBe(1);
      expect(statuses.map((s) => s.mode)).toEqual(['ai']);
      expect(widgetText()).not.toContain('Waiting for a human agent');
      core.destroy();
    });

    it('should show the agent and not announce a cancel when an agent accepted the request first', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'waiting', conversationId: 'c1' }));
      useCancel(buildTicketStatus({ mode: 'human', conversationId: 'c1', agentName: 'Ana' }));
      const core = await initVerified();
      let cancelled = 0;
      core.on('human-request-cancelled', () => {
        cancelled += 1;
      });

      // Act
      await core.cancelHumanRequest();

      // Assert
      expect(core.getState().mode).toBe('human');
      expect(cancelled).toBe(0);
      expect(widgetText()).toContain('Connected with Ana');
      core.destroy();
    });

    it.each(['ai', 'human', 'closed'] as const)(
      'should not call the API when the mode is %s',
      async (mode) => {
        // Arrange
        useTicketStatus(buildTicketStatus({ mode, conversationId: 'c1' }));
        const calls = useCancel(buildTicketStatus({ mode: 'ai', conversationId: 'c1' }));
        const core = await initVerified();

        // Act
        await core.cancelHumanRequest();

        // Assert
        expect(calls.count).toBe(0);
        expect(core.getState().mode).toBe(mode);
        core.destroy();
      },
    );

    it('should stay waiting and report the failure when the API rejects the cancel', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'waiting', conversationId: 'c1' }));
      server.use(
        http.post(sdkUrl('human-request/cancel'), () =>
          HttpResponse.json({ statusCode: 400, message: 'No active conversation', code: 'validation_failed' }, { status: 400 }),
        ),
      );
      const core = await initVerified();
      const errors: Error[] = [];
      core.on('error', (e) => errors.push(e));

      // Act
      await core.cancelHumanRequest();

      // Assert
      expect(core.getState().mode).toBe('waiting');
      expect(core.getState().error).toBe('No active conversation');
      expect(core.getState().isLoading).toBe(false);
      expect(errors).toHaveLength(1);
      expect(widgetText()).toContain('Could not cancel the request. Please try again.');
      core.destroy();
    });
  });

  describe('ticket modes', () => {
    it('should refuse to send when the conversation is closed', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'closed' }));
      const core = await initVerified();

      // Act
      await core.sendMessage('hi');

      // Assert
      expect(core.getState().messages).toHaveLength(0);
      expect(core.getState().error).toMatch(/closed/i);
      core.destroy();
    });

    it('should not append an empty AI bubble when the ticket is waiting', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'waiting' }));
      useChatReply({ text: '', mode: 'waiting' });
      const core = await initVerified();

      // Act
      await core.sendMessage('still here');

      // Assert
      expect(core.getState().messages.map((m) => m.message.type)).toEqual(['human']);
      expect(core.getState().mode).toBe('waiting');
      core.destroy();
    });

    it('should apply the mode when the server pushes ticket:status over the socket', async () => {
      // Arrange
      const core = await initVerified();
      const statuses: TicketStatusData[] = [];
      core.on('ticket-status', (s) => statuses.push(s));

      // Act
      sockets[0].serverEmit('ticket:status', buildTicketStatus({ mode: 'human', agentName: 'Ana' }));

      // Assert
      expect(core.getState().mode).toBe('human');
      expect(statuses.map((s) => s.mode)).toEqual(['human']);
      expect(widgetText()).toContain('Connected with Ana');
      core.destroy();
    });

    it.each(['waiting', 'closed'] as const)(
      'should show the AI reply once when the same reply moves the conversation to %s',
      async (mode) => {
        // Arrange: hold the chat request open so the socket pushes land mid-flight,
        // in the order the API sends them: the AI message, then the new mode.
        const gate = deferred<void>();
        server.use(
          http.post(sdkUrl('chat'), async () => {
            await gate.promise;
            return ok(buildChatResponse({ text: 'Handing you over.', mode }));
          }),
        );
        const core = await initVerified();

        // Act
        const sending = core.sendMessage('I need a person');
        sockets[0].serverEmit('message:receive', { id: 'm1', textMessage: 'Handing you over.' });
        sockets[0].serverEmit('ticket:status', buildTicketStatus({ mode, conversationId: 'c1' }));
        gate.resolve();
        await sending;

        // Assert
        expect(core.getState().messages.map((m) => m.message.content)).toEqual([
          'I need a person',
          'Handing you over.',
        ]);
        expect(core.getState().mode).toBe(mode);
        core.destroy();
      },
    );

    it('should show the AI reply once when its socket push lands after the mode change', async () => {
      // Arrange
      const gate = deferred<void>();
      server.use(
        http.post(sdkUrl('chat'), async () => {
          await gate.promise;
          return ok(buildChatResponse({ text: 'Handing you over.', mode: 'waiting' }));
        }),
      );
      const core = await initVerified();

      // Act
      const sending = core.sendMessage('I need a person');
      sockets[0].serverEmit('ticket:status', buildTicketStatus({ mode: 'waiting' }));
      sockets[0].serverEmit('message:receive', { id: 'm1', textMessage: 'Handing you over.' });
      gate.resolve();
      await sending;

      // Assert
      expect(core.getState().messages.map((m) => m.message.content)).toEqual([
        'I need a person',
        'Handing you over.',
      ]);
      core.destroy();
    });
  });

  describe('agent messages', () => {
    it('should show both messages when a human agent sends the same text twice', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'human', agentName: 'Ana' }));
      const core = await initVerified();

      // Act
      sockets[0].serverEmit('message:receive', { id: 'm1', textMessage: 'ok' });
      sockets[0].serverEmit('message:receive', { id: 'm2', textMessage: 'ok' });

      // Assert
      expect(core.getState().messages.map((m) => [m.message.type, m.message.content])).toEqual([
        ['agent', 'ok'],
        ['agent', 'ok'],
      ]);
      core.destroy();
    });

    it('should show one message when the same agent message is delivered twice', async () => {
      // Arrange
      useTicketStatus(buildTicketStatus({ mode: 'human', agentName: 'Ana' }));
      const core = await initVerified();

      // Act
      sockets[0].serverEmit('message:receive', { id: 'm1', textMessage: 'ok' });
      sockets[0].serverEmit('message:receive', { id: 'm1', textMessage: 'ok' });

      // Assert
      expect(core.getState().messages).toHaveLength(1);
      core.destroy();
    });

    it('should ignore a pushed message when the AI owns the conversation', async () => {
      // Arrange
      const core = await initVerified();

      // Act
      sockets[0].serverEmit('message:receive', { id: 'm1', textMessage: 'AI reply' });

      // Assert
      expect(core.getState().messages).toHaveLength(0);
      core.destroy();
    });
  });

  describe('destroy', () => {
    it('should remove the widget when destroyed', async () => {
      // Arrange
      const core = new ChatbotCore();
      await core.init({ apiKey: 'k' });

      // Act
      core.destroy();

      // Assert
      expect(hostCount()).toBe(0);
    });

    it('should leave no socket, listeners, timers or DOM nodes behind when destroyed', async () => {
      // Arrange
      const timers = useFakeTimers();
      const core = await initVerified();
      const [socket] = sockets;
      expect(socket.listenerCount()).toBeGreaterThan(0);

      // Act
      core.destroy();
      // jsdom queues a 0ms timer to dispatch `storage` events on setItem; flush it
      // so only timers the SDK owns (request timeouts are 30s) can remain.
      vi.advanceTimersByTime(0);

      // Assert
      expect(socket.removeAllListeners).toHaveBeenCalledTimes(1);
      expect(socket.disconnect).toHaveBeenCalledTimes(1);
      expect(socket.listenerCount()).toBe(0);
      expect(timers.sdkTimerCount()).toBe(0);
      expect(document.body.childElementCount).toBe(0);
    });

    // destroy() used to call removeAllListeners(), silently killing subscriptions
    // owned by other components — every useChatbot() in the tree.
    it('should keep subscriptions that other code owns when destroyed', async () => {
      // Arrange
      const core = new ChatbotCore();
      await core.init({ apiKey: 'k' });
      let seen = 0;
      core.on('state-change', () => {
        seen += 1;
      });

      // Act
      core.destroy();
      core.open();

      // Assert
      expect(seen).toBeGreaterThan(0);
    });
  });

  describe('superseded init', () => {
    it('should ignore a late visitor verify when its init was destroyed', async () => {
      // Arrange — hold the first verify open so the first init is genuinely
      // mid-flight when the second one starts.
      const held = deferred<ReturnType<typeof buildVisitorVerify>>();
      let visitorCalls = 0;
      server.use(
        http.get(sdkUrl('visitor'), async () => {
          visitorCalls += 1;
          return ok(visitorCalls === 1 ? await held.promise : buildVisitorVerify({ valid: false, name: null }));
        }),
      );
      seedVisitorToken();
      const first = new ChatbotCore();
      const firstInit = first.init({ apiKey: 'k' });
      first.destroy();
      localStorage.clear();
      const second = new ChatbotCore();
      await second.init({ apiKey: 'k' });

      // Act
      held.resolve(buildVisitorVerify({ valid: true, name: 'Stale' }));
      await firstInit;

      // Assert
      expect(second.getState().needsIdentify).toBe(true);
      expect(second.getState().visitorToken).toBeNull();
      second.destroy();
    });
  });
});

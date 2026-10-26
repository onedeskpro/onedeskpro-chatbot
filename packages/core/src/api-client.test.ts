import { delay, http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApiError } from '../test/factories/api-response.factory';
import { buildAttachment, buildChatResponse } from '../test/factories/chat.factory';
import { ok, sdkUrl } from '../test/mocks/handlers';
import { server } from '../test/mocks/server';
import { ApiClient, DEFAULT_REQUEST_TIMEOUT_MS, type ChatbotRequestError } from './api-client';

const client = (timeoutMs?: number) =>
  new ApiClient({ baseUrl: 'https://api.example.com/', apiKey: 'secret', timeoutMs });

const chatPayload = { chatInput: 'x', visitorToken: 'sv_token' };

type Outcome<T> = { value: T; error?: undefined } | { value?: undefined; error: ChatbotRequestError };

/** Run `request` while advancing fake time by `ms`, then report how it settled. */
async function settleAfter<T>(request: Promise<T>, ms: number): Promise<Outcome<T>> {
  const outcome = request.then(
    (value): Outcome<T> => ({ value }),
    (error: ChatbotRequestError): Outcome<T> => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(ms);
  return outcome;
}

describe('ApiClient', () => {
  describe('successful responses', () => {
    it('should unwrap the data envelope when the request succeeds', async () => {
      // Arrange
      server.use(http.post(sdkUrl('chat'), () => ok({ text: 'hi', sessionId: 's' })));

      // Act
      const result = client().sendMessage(chatPayload);

      // Assert
      await expect(result).resolves.toEqual({ text: 'hi', sessionId: 's' });
    });

    it('should send the api key and strip the trailing slash when the base url ends with one', async () => {
      // Arrange
      const seen: Request[] = [];
      server.use(
        http.get(sdkUrl('config'), ({ request }) => {
          seen.push(request);
          return ok({});
        }),
      );

      // Act
      await client().fetchConfig();

      // Assert
      expect(seen).toHaveLength(1);
      expect(seen[0].url).toBe('https://api.example.com/sdk/config');
      expect(seen[0].headers.get('X-API-Key')).toBe('secret');
    });

    it('should send the visitor token header when verifying a visitor', async () => {
      // Arrange
      const seen: Request[] = [];
      server.use(
        http.get(sdkUrl('visitor'), ({ request }) => {
          seen.push(request);
          return ok({ valid: true, name: 'Remo' });
        }),
      );

      // Act
      await client().verifyVisitor('sv_abc');

      // Assert
      expect(seen[0].url).toBe('https://api.example.com/sdk/visitor');
      expect(seen[0].headers.get('X-Visitor-Token')).toBe('sv_abc');
    });
  });

  describe('error responses', () => {
    it('should surface the structured API error verbatim when the body is an API error', async () => {
      // Arrange
      server.use(
        http.post(sdkUrl('chat'), () =>
          HttpResponse.json(
            buildApiError({
              statusCode: 401,
              message: 'Invalid API key',
              code: 'UNAUTHORIZED',
              path: '/sdk/chat',
            }),
            { status: 401, statusText: 'Unauthorized' },
          ),
        ),
      );

      // Act
      const result = client().sendMessage(chatPayload);

      // Assert
      await expect(result).rejects.toMatchObject({
        message: 'Invalid API key',
        status: 401,
        apiError: { code: 'UNAUTHORIZED' },
      });
    });

    // A gateway answers with HTML. Parsing before checking res.ok replaced the real
    // status with a JSON SyntaxError.
    it('should report the HTTP status when the error body is not JSON', async () => {
      // Arrange
      server.use(
        http.post(
          sdkUrl('chat'),
          () =>
            new HttpResponse('<html>502</html>', {
              status: 502,
              statusText: 'Bad Gateway',
              headers: { 'Content-Type': 'text/html' },
            }),
        ),
      );

      // Act
      const err: ChatbotRequestError = await client().sendMessage(chatPayload).catch((e) => e);

      // Assert
      expect(err.status).toBe(502);
      expect(err.apiError.code).toBe('HTTP_ERROR');
      expect(err.message).toContain('502');
      expect(err.message).not.toContain('JSON');
    });

    it('should reject rather than return undefined data when the body is empty', async () => {
      // Arrange
      server.use(http.get(sdkUrl('config'), () => new HttpResponse(null, { status: 200 })));

      // Act
      const result = client().fetchConfig();

      // Assert
      await expect(result).rejects.toMatchObject({ apiError: { code: 'BAD_RESPONSE' } });
    });

    it('should reject with BAD_RESPONSE when a 200 body is malformed JSON', async () => {
      // Arrange
      server.use(
        http.get(
          sdkUrl('config'),
          () => new HttpResponse('{"data": ', { status: 200, headers: { 'Content-Type': 'application/json' } }),
        ),
      );

      // Act
      const result = client().fetchConfig();

      // Assert
      await expect(result).rejects.toMatchObject({ apiError: { code: 'BAD_RESPONSE' } });
    });

    it('should report a NETWORK_ERROR code when the network request fails', async () => {
      // Arrange
      server.use(http.get(sdkUrl('config'), () => HttpResponse.error()));

      // Act
      const result = client().fetchConfig();

      // Assert
      await expect(result).rejects.toMatchObject({ apiError: { code: 'NETWORK_ERROR' } });
    });
  });

  // Without a timeout the widget stays disabled forever on a hung connection.
  describe('timeouts', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    });

    it('should abort with a TIMEOUT error when the request exceeds the timeout', async () => {
      // Arrange
      server.use(
        http.post(sdkUrl('chat'), async () => {
          await delay('infinite');
          return ok(buildChatResponse());
        }),
      );

      // Act
      const { error } = await settleAfter(client(50).sendMessage(chatPayload), 50);

      // Assert
      expect(error?.apiError.code).toBe('TIMEOUT');
      expect(error?.message).toContain('timed out');
    });

    it('should resolve when the request completes in time', async () => {
      // Arrange
      server.use(
        http.get(sdkUrl('config'), async () => {
          await delay(10);
          return ok({ ok: true });
        }),
      );

      // Act
      const { value } = await settleAfter(client(500).fetchConfig(), 10);

      // Assert
      expect(value).toEqual({ ok: true });
    });

    it.each([
      { responseMs: 999, expected: 'resolves', label: 'below' },
      { responseMs: 1000, expected: 'TIMEOUT', label: 'equal to' },
      { responseMs: 1001, expected: 'TIMEOUT', label: 'above' },
    ])(
      'should end as $expected when the response time is $label the 1000ms timeout',
      async ({ responseMs, expected }) => {
        // Arrange
        server.use(
          http.get(sdkUrl('config'), async () => {
            await delay(responseMs);
            return ok({ ok: true });
          }),
        );

        // Act
        const outcome = await settleAfter(client(1000).fetchConfig(), 1001);

        // Assert
        if (expected === 'resolves') {
          expect(outcome.value).toEqual({ ok: true });
        } else {
          expect(outcome.error?.apiError.code).toBe(expected);
        }
      },
    );

    it.each([
      { timeoutMs: undefined, label: 'omitted' },
      { timeoutMs: DEFAULT_REQUEST_TIMEOUT_MS, label: 'set to the default' },
    ])(
      'should wait the full default timeout before aborting when timeoutMs is $label',
      async ({ timeoutMs }) => {
        // Arrange
        server.use(
          http.get(sdkUrl('config'), async () => {
            await delay('infinite');
            return ok({});
          }),
        );
        let settled = false;
        const outcome = client(timeoutMs)
          .fetchConfig()
          .then(
            (value): Outcome<unknown> => ({ value }),
            (error: ChatbotRequestError): Outcome<unknown> => ({ error }),
          )
          .finally(() => {
            settled = true;
          });

        // Act
        await vi.advanceTimersByTimeAsync(DEFAULT_REQUEST_TIMEOUT_MS - 1);
        const settledBeforeDeadline = settled;
        await vi.advanceTimersByTimeAsync(1);
        const { error } = await outcome;

        // Assert
        expect(settledBeforeDeadline).toBe(false);
        expect(error?.apiError.code).toBe('TIMEOUT');
      },
    );
  });
});

describe('ApiClient.uploadAttachment', () => {
  it('should post the file as multipart with the visitor token and unwrap the attachment when the upload succeeds', async () => {
    // Arrange
    const seen: Request[] = [];
    const bodies: string[] = [];
    server.use(
      http.post(sdkUrl('upload'), async ({ request }) => {
        seen.push(request);
        bodies.push(await request.text());
        return ok(buildAttachment());
      }),
    );
    const file = new File(['png-bytes'], 'photo.png', { type: 'image/png' });

    // Act
    const result = await client().uploadAttachment(file, 'sv_token');

    // Assert
    expect(result).toEqual(buildAttachment());
    expect(seen[0].headers.get('X-Visitor-Token')).toBe('sv_token');
    expect(seen[0].headers.get('X-API-Key')).toBe('secret');
    expect(seen[0].headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
    expect(bodies[0]).toContain('name="file"');
    expect(bodies[0]).toContain('filename="photo.png"');
    expect(bodies[0]).toContain('Content-Type: image/png');
  });

  it('should reject with BAD_RESPONSE when the upload reply is not an attachment', async () => {
    // Arrange
    server.use(http.post(sdkUrl('upload'), () => ok({ url: 123 })));
    const file = new File(['x'], 'x.png', { type: 'image/png' });

    // Act
    const result = client().uploadAttachment(file, 'sv_token');

    // Assert
    await expect(result).rejects.toMatchObject({ apiError: { code: 'BAD_RESPONSE' } });
  });

  it('should surface the API error when the server rejects the file type', async () => {
    // Arrange
    server.use(
      http.post(sdkUrl('upload'), () =>
        HttpResponse.json(buildApiError({ statusCode: 400, message: 'Unsupported file type' }), {
          status: 400,
        }),
      ),
    );
    const file = new File(['x'], 'x.exe', { type: 'application/x-msdownload' });

    // Act
    const result = client().uploadAttachment(file, 'sv_token');

    // Assert
    await expect(result).rejects.toMatchObject({ status: 400, message: 'Unsupported file type' });
  });
});

describe.each([
  { method: 'closeConversation' as const, endpoint: 'conversation/close' },
  { method: 'cancelHumanRequest' as const, endpoint: 'human-request/cancel' },
])('ApiClient.$method', ({ method, endpoint }) => {
  it('should post the visitor token and unwrap the ticket status when the request succeeds', async () => {
    // Arrange
    const bodies: unknown[] = [];
    server.use(
      http.post(sdkUrl(endpoint), async ({ request }) => {
        bodies.push(await request.json());
        return ok({ mode: 'closed', conversationId: 'c1' });
      }),
    );

    // Act
    const result = await client()[method]('sv_token');

    // Assert
    expect(result).toEqual({ mode: 'closed', conversationId: 'c1' });
    expect(bodies).toEqual([{ visitorToken: 'sv_token' }]);
  });

  it.each([
    { label: 'an unknown mode', data: { mode: 'gone' } },
    { label: 'a missing mode', data: { conversationId: 'c1' } },
    { label: 'a non-string conversation id', data: { mode: 'ai', conversationId: 7 } },
    { label: 'no object at all', data: 'closed' },
  ])('should reject with BAD_RESPONSE when the reply has $label', async ({ data }) => {
    // Arrange
    server.use(http.post(sdkUrl(endpoint), () => ok(data)));

    // Act
    const result = client()[method]('sv_token');

    // Assert
    await expect(result).rejects.toMatchObject({ apiError: { code: 'BAD_RESPONSE' } });
  });

  it('should surface the API error when the server rejects the visitor', async () => {
    // Arrange
    server.use(
      http.post(sdkUrl(endpoint), () =>
        HttpResponse.json(buildApiError({ statusCode: 401, message: 'Invalid visitor token' }), {
          status: 401,
        }),
      ),
    );

    // Act
    const result = client()[method]('sv_token');

    // Assert
    await expect(result).rejects.toMatchObject({ status: 401, message: 'Invalid visitor token' });
  });
});

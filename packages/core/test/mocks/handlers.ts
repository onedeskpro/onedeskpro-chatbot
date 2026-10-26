import { http, HttpResponse } from 'msw';
import { buildEnvelope } from '../factories/api-response.factory';
import { buildAttachment, buildChatResponse, buildTicketStatus } from '../factories/chat.factory';
import { buildSdkConfig } from '../factories/sdk-config.factory';
import { buildIdentifyResponse, buildVisitorVerify } from '../factories/visitor.factory';

/** Match an SDK endpoint on any origin, so every configured `apiBaseUrl` is covered. */
export const sdkUrl = (endpoint: string): string => `*/sdk/${endpoint}`;

/** A 200 response wrapped in the API envelope. */
export const ok = <T>(data: T) => HttpResponse.json(buildEnvelope(data));

/** Happy-path defaults. Override one endpoint inside a test with `server.use()`. */
export const handlers = [
  http.get(sdkUrl('config'), () => ok(buildSdkConfig())),
  http.get(sdkUrl('visitor'), () => ok(buildVisitorVerify())),
  http.post(sdkUrl('identify'), () => ok(buildIdentifyResponse())),
  http.get(sdkUrl('ticket-status'), () => ok(buildTicketStatus())),
  http.post(sdkUrl('human-request'), () => ok(buildTicketStatus({ mode: 'waiting' }))),
  http.post(sdkUrl('human-request/cancel'), () =>
    ok(buildTicketStatus({ mode: 'ai', conversationId: 'c1' })),
  ),
  http.post(sdkUrl('conversation/close'), () =>
    ok(buildTicketStatus({ mode: 'closed', conversationId: 'c1' })),
  ),
  http.post(sdkUrl('chat'), () => ok(buildChatResponse())),
  http.post(sdkUrl('upload'), () => ok(buildAttachment())),
];

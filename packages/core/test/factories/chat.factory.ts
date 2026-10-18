import type { ChatAttachment, ChatResponseData, TicketStatusData } from '@onedeskpro/chatbot-types';

export function buildChatResponse(overrides: Partial<ChatResponseData> = {}): ChatResponseData {
  return { text: 'AI reply', sessionId: 's1', mode: 'ai', ...overrides };
}

export function buildTicketStatus(overrides: Partial<TicketStatusData> = {}): TicketStatusData {
  return { mode: 'ai', ...overrides };
}

/** The attachment `POST /sdk/upload` answers with for an uploaded image. */
export function buildAttachment(overrides: Partial<ChatAttachment> = {}): ChatAttachment {
  return {
    type: 'image/png',
    url: 'https://cdn.example.com/sdk-chat/w1/photo.png',
    fileName: 'photo.png',
    size: 1234,
    ...overrides,
  };
}

export { ChatbotProvider } from './chatbot-provider';
export type { ChatbotProviderProps } from './chatbot-provider';

export { ChatbotWidget, ChatbotHeadless } from './chatbot-widget';
export type { ChatbotHeadlessProps } from './chatbot-widget';

export { useChatbot } from './hooks/use-chatbot';
export type { UseChatbotReturn } from './hooks/use-chatbot';

export { ChatbotContext } from './context';

// Re-export core types for convenience so consumers only need this package
export type {
  ChatbotInitOptions,
  ChatbotState,
  ChatMessage,
  ChatAttachment,
  VoiceRecording,
  ChatbotEventMap,
  ChatbotTicketMode,
  TicketStatusData,
} from '@onedeskpro/chatbot-types';

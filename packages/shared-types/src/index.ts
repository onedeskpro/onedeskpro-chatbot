// ─── Init Options ─────────────────────────────────────────────────────────────

export interface ChatbotInitOptions {
  apiKey: string;
  apiBaseUrl?: string;
  chatbotName?: string;
  primaryColor?: string;
  theme?: 'light' | 'dark' | 'auto';
  position?: 'bottom-right' | 'bottom-left';
  welcomeMessage?: string;
  placeholder?: string;
  autoOpen?: boolean;
  /** @deprecated Visitor tokens replace client session ids. Ignored when present. */
  sessionId?: string;
  /** Abort an API request that has not responded in this many ms. Defaults to 30000. */
  requestTimeoutMs?: number;
}

// ─── API Shapes ────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  path: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  code: string;
  timestamp: string;
  path: string;
}

export interface IdentifyRequest {
  name: string;
  phone: string;
  email?: string;
}

export interface IdentifyResponseData {
  visitorToken: string;
}

export interface VisitorVerifyResponse {
  valid: boolean;
  name: string | null;
}

export interface ChatRequest {
  chatInput: string;
  visitorToken: string;
}

/** Widget / bridge episode mode for AI vs human takeover. */
export type ChatbotTicketMode = 'ai' | 'waiting' | 'human' | 'closed';

export interface ChatResponseData {
  text: string;
  sessionId: string;
  mode: ChatbotTicketMode;
}

/** Shared shape for `POST /sdk/human-request`, `GET /sdk/ticket-status`, and `ticket:status`. */
export interface TicketStatusData {
  mode: ChatbotTicketMode;
  conversationId?: string;
  agentName?: string;
}

export interface ChatMessage {
  id: number;
  sessionId: string;
  message: {
    type: 'human' | 'ai' | 'agent';
    content: string;
  };
}

// ─── Readiness ────────────────────────────────────────────────────────────────

export type ChatbotBlockReason = 'no-prompt' | 'no-collections' | 'no-directories' | 'no-agent' | null;

export interface SdkConfigResponse {
  agentId: string;
  agentName: string;
  ready: boolean;
  blockReason: ChatbotBlockReason;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type ChatbotEventMap = {
  /** Fired for every message added to the conversation, human and AI alike. */
  message: ChatMessage;
  /**
   * Fired whenever any part of the state changes — including the ones no other
   * event covers, such as `isLoading` flipping while a reply is in flight.
   * Carries the new state so subscribers do not have to call `getState()`.
   */
  'state-change': ChatbotState;
  open: void;
  close: void;
  error: Error;
  'session-reset': void;
  ready: void;
  /** Fired after a successful `POST /sdk/human-request`. */
  'human-requested': void;
  /** Fired when ticket mode changes via REST restore or `/sdk` socket push. */
  'ticket-status': TicketStatusData;
};

// ─── State ────────────────────────────────────────────────────────────────────

export interface ChatbotState {
  isOpen: boolean;
  isLoading: boolean;
  isReady: boolean;
  needsIdentify: boolean;
  blockReason: ChatbotBlockReason;
  messages: ChatMessage[];
  visitorToken: string | null;
  visitorName: string | null;
  error: string | null;
  /** Current ticket episode mode. */
  mode: ChatbotTicketMode;
}

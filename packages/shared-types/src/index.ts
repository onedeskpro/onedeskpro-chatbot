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

/** A file attached to a message, as stored by the API and echoed in `message:receive`. */
export interface ChatAttachment {
  /** MIME type, e.g. `image/png`. */
  type: string;
  /** Public URL of the stored file. Local previews use a `blob:` URL until the upload lands. */
  url: string;
  fileName: string;
  /** Size in bytes. */
  size: number;
  durationSeconds?: number;
  /** Up to 64 loudness peaks (0–100) for drawing a voice note. */
  waveform?: number[];
}

/** How a chat message is stored: plain text, files, or a recorded voice note. */
export type ChatMessageKind = 'text' | 'media' | 'voice';

/** A finished recording to send with `sendVoice`, as `VoiceRecorder` produces it. */
export interface VoiceRecording {
  blob: Blob;
  /** MIME type of `blob`; defaults to `blob.type`. */
  mimeType?: string;
  durationSeconds: number;
}

/** Largest file `POST /sdk/upload` accepts, in bytes. */
export const SDK_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
/** Most attachments one chat message may carry. */
export const SDK_CHAT_MAX_ATTACHMENTS = 10;

export interface ChatRequest {
  /** Visitor text; may be empty when `attachments` carry the message. */
  chatInput: string;
  visitorToken: string;
  /** Defaults to `media` when attachments are present, otherwise `text`. */
  messageType?: ChatMessageKind;
  attachments?: ChatAttachment[];
}

/** `POST /sdk/upload` answers with the attachment to send back in `POST /sdk/chat`. */
export type UploadAttachmentResponseData = ChatAttachment;

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
    /** Text, or the caption of a media message (may be empty when `attachments` is set). */
    content: string;
    attachments?: ChatAttachment[];
  };
  /** `true` while the visitor's files are still uploading; cleared once the message is sent. */
  pending?: boolean;
}

// ─── Readiness ────────────────────────────────────────────────────────────────

/**
 * Why the chatbot cannot answer, or `null` when it can. The widget stays hidden
 * while this is set.
 * - `no-prompt`, `no-collections`: the agent is not set up yet (from the API).
 * - `ai-unavailable`: the platform's AI models are not configured (from the API).
 * - `no-credits`: the workspace has used its AI token budget (from the API).
 * - `no-agent`: no agent is assigned to the Website channel.
 * - `server-unavailable`: the API could not be reached; the SDK retries a few times.
 * - `no-directories`: legacy name for `no-collections`.
 */
export type ChatbotBlockReason =
  | 'no-prompt'
  | 'no-collections'
  | 'no-directories'
  | 'ai-unavailable'
  | 'no-credits'
  | 'no-agent'
  | 'server-unavailable'
  | null;

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

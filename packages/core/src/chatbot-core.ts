import type {
  ChatAttachment,
  ChatbotEventMap,
  ChatbotInitOptions,
  ChatbotState,
  ChatbotTicketMode,
  ChatMessage,
  ChatRequest,
  IdentifyRequest,
  SdkConfigResponse,
  TicketStatusData,
  VoiceRecording,
} from '@onedeskpro/chatbot-types';
import { ApiClient, DEFAULT_REQUEST_TIMEOUT_MS, isChatbotRequestError } from './api-client';
import {
  attachmentProblem,
  createPreviewUrl,
  extractAttachments,
  revokePreviewUrl,
  toPreviewAttachment,
} from './attachments';
import { encodeVoice } from './audio';
import { SDK_UPLOAD_MAX_BYTES } from './constants';
import { DEFAULT_API_BASE_URL } from './constants';
import { EventEmitter } from './event-emitter';
import { SdkSocket } from './sdk-socket';
import { VisitorTokenManager } from './session-manager';
import { ChatWidget } from './widget/widget';

type Listener<K extends keyof ChatbotEventMap> =
  ChatbotEventMap[K] extends void ? () => void : (payload: ChatbotEventMap[K]) => void;

const DEFAULTS = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  chatbotName: 'AI Assistant',
  primaryColor: '#2563EB',
  theme: 'auto' as const,
  position: 'bottom-right' as const,
  welcomeMessage: '',
  placeholder: 'Type your message…',
  autoOpen: false,
  sessionId: '',
  requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
};

/**
 * Drop keys whose value is `undefined` so they cannot overwrite a default.
 * Callers routinely spread optional config through — `apiBaseUrl={process.env.X}`
 * with X unset would otherwise land as an explicit `undefined`.
 */
function definedOnly(options: ChatbotInitOptions): Partial<ChatbotInitOptions> {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as Partial<ChatbotInitOptions>;
}

/**
 * Waits before each new readiness check while the server is unreachable. Bounded,
 * so a page left open during an outage stops calling once the list runs out.
 */
export const READINESS_RETRY_DELAYS_MS: readonly number[] = [5_000, 15_000, 30_000, 60_000];

/**
 * True when `/sdk/config` failed because the server could not be reached or is
 * failing (network error, timeout, a 5xx, or an unreadable reply), rather than
 * because it rejected this site.
 */
function isServerUnavailable(error: unknown): boolean {
  if (!isChatbotRequestError(error)) return false;
  return error.status === 0 || error.status >= 500 || error.apiError.code === 'BAD_RESPONSE';
}

function errorMessage(error: unknown): string {
  if (isChatbotRequestError(error)) return error.apiError.message;
  return error instanceof Error ? error.message : 'Failed to load chatbot config.';
}

/** Monotonic ids for locally-created messages — `Date.now()` collides within a tick. */
let nextLocalId = 0;
const localMessageId = (): number => Date.now() * 1000 + (nextLocalId++ % 1000);

/**
 * Pull agent text from an inbox-shaped `message:receive` payload (`textMessage`)
 * or a few simpler shapes used in tests / future lean events.
 */
function extractAgentText(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  if (typeof record.textMessage === 'string' && record.textMessage.trim()) {
    return record.textMessage.trim();
  }
  if (typeof record.content === 'string' && record.content.trim()) {
    return record.content.trim();
  }
  if (record.message && typeof record.message === 'object') {
    const nested = record.message as Record<string, unknown>;
    if (typeof nested.content === 'string' && nested.content.trim()) {
      return nested.content.trim();
    }
    if (typeof nested.textMessage === 'string' && nested.textMessage.trim()) {
      return nested.textMessage.trim();
    }
  }
  return null;
}

/**
 * Identity of a message for de-duplication: the same text with the same files.
 * Two media messages that only share a caption (or the inbox's "Image" label)
 * are different messages.
 */
function messageKey(message: { content: string; attachments?: ChatAttachment[] }): string {
  const urls = (message.attachments ?? []).map((attachment) => attachment.url).join('\u0001');
  return `${message.content}\u0000${urls}`;
}

/** The server id of a `message:receive` payload, when it carries one. */
function extractMessageId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;

  if (typeof record.id === 'string' && record.id) return record.id;
  if (record.message && typeof record.message === 'object') {
    const nested = record.message as Record<string, unknown>;
    if (typeof nested.id === 'string' && nested.id) return nested.id;
  }
  return null;
}

export class ChatbotCore {
  private apiClient!: ApiClient;
  private emitter = new EventEmitter();
  private visitorTokens = new VisitorTokenManager();
  private widget: ChatWidget | null = null;
  private sdkSocket: SdkSocket | null = null;
  private options!: Required<ChatbotInitOptions>;
  private callerSetName = false;
  /**
   * True once this session has an open (or recently closed) ticket episode —
   * from ticket-status `conversationId`, a non-ai mode, or a successful chat
   * round-trip. Gates the request-human control so visitors cannot escalate
   * before a ticket exists.
   */
  private hasActiveTicket = false;
  /** Pending readiness re-check while the server is unreachable. */
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  /** Server id of the last `message:receive` push rendered as an agent bubble. */
  private lastPushId: string | null = null;
  /**
   * The conversation `startNewConversation` just ended. Its `closed` status — the
   * socket push the close triggers, or a restore on reconnect — would put the
   * fresh chat back into closed mode, so it is ignored until the next message
   * starts a new ticket on that conversation.
   */
  private endedConversationId: string | null = null;
  /**
   * Bumped by every init() and by destroy(). An async init compares the token it
   * started with against this before touching anything, so a superseded run — a
   * React StrictMode remount, or a caller re-initialising — quietly stands down
   * instead of racing the live one.
   */
  private initToken = 0;

  private _state: ChatbotState = {
    isOpen: false,
    isLoading: false,
    isReady: false,
    needsIdentify: true,
    blockReason: null,
    messages: [],
    visitorToken: null,
    visitorName: null,
    error: null,
    mode: 'ai',
  };

  /**
   * The single place state is written. Replaces `_state` rather than mutating it
   * and announces the change, so subscribers (React especially) stay in sync with
   * everything — not just the transitions that have a dedicated event.
   */
  private setState(patch: Partial<ChatbotState>): void {
    this._state = { ...this._state, ...patch };
    this.emitter.emit('state-change', this._state);
  }

  private applyMode(mode: ChatbotTicketMode, ticketStatus?: TicketStatusData): void {
    if (ticketStatus) {
      this.syncHasActiveTicket(ticketStatus);
    } else if (mode !== 'ai') {
      this.hasActiveTicket = true;
    }
    this.setState({ mode });
    this.syncWidgetMode(mode, ticketStatus?.agentName);
    if (ticketStatus) {
      this.emitter.emit('ticket-status', ticketStatus);
    }
  }

  /** Derive ticket existence from status restore / socket pushes. */
  private syncHasActiveTicket(status: TicketStatusData): void {
    if (status.conversationId || status.mode !== 'ai') {
      this.hasActiveTicket = true;
    } else {
      this.hasActiveTicket = false;
    }
  }

  private syncWidgetMode(mode: ChatbotTicketMode, agentName?: string | null): void {
    this.widget?.setMode(mode, {
      agentName,
      canRequestHuman: mode === 'ai' && this.hasActiveTicket,
      canStartNew: mode === 'closed' || this.hasActiveTicket,
    });
  }

  /** True for the stale `closed` status of the conversation the visitor just ended. */
  private isEndedConversation(status: TicketStatusData): boolean {
    return (
      status.mode === 'closed' &&
      Boolean(status.conversationId) &&
      status.conversationId === this.endedConversationId
    );
  }

  async init(options: ChatbotInitOptions): Promise<void> {
    if (!options.apiKey) {
      throw new Error('[onedeskpro-chatbot] `apiKey` is required to initialise the chatbot.');
    }

    const token = ++this.initToken;

    // Re-initialising must not orphan the previous widget in the DOM.
    this.clearRetry();
    this.disconnectSdkSocket();
    this.widget?.destroy();
    this.widget = null;

    this.callerSetName = options.chatbotName !== undefined;
    this.options = { ...DEFAULTS, ...definedOnly(options) } as Required<ChatbotInitOptions>;

    this.apiClient = new ApiClient({
      baseUrl: this.options.apiBaseUrl,
      apiKey: this.options.apiKey,
      timeoutMs: this.options.requestTimeoutMs,
    });

    this.hasActiveTicket = false;
    this.endedConversationId = null;
    this.setState({
      isReady: false,
      blockReason: null,
      visitorToken: null,
      visitorName: null,
      needsIdentify: true,
      messages: [],
      error: null,
      mode: 'ai',
    });

    // Nothing goes on the page yet: the widget appears only once the server has
    // answered and the agent can reply (see checkReadiness).
    await this.checkReadiness(token, 0);
  }

  /**
   * Asks `/sdk/config` whether the server is up and the agent can reply, and
   * shows the widget only when both hold. An unreachable server is retried on
   * READINESS_RETRY_DELAYS_MS; a configuration problem is final for this page.
   * `ready` fires once the outcome is settled either way.
   */
  private async checkReadiness(token: number, attempt: number): Promise<void> {
    let config: SdkConfigResponse;
    try {
      config = await this.apiClient.fetchConfig();
    } catch (error) {
      if (token !== this.initToken) return;
      if (isServerUnavailable(error)) {
        this.setState({ isReady: false, blockReason: 'server-unavailable', error: errorMessage(error) });
        const delay = READINESS_RETRY_DELAYS_MS[attempt];
        if (delay !== undefined) {
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.checkReadiness(token, attempt + 1);
          }, delay);
          return;
        }
      } else {
        this.handleConfigError(error);
      }
      this.emitter.emit('ready');
      return;
    }
    if (token !== this.initToken) return;

    if (!this.callerSetName && config.agentName.trim()) {
      this.options.chatbotName = config.agentName;
    }
    const blockReason = config.blockReason ?? null;
    const isReady = config.ready && blockReason === null;
    this.setState({ blockReason, isReady, error: null });
    if (!isReady) {
      this.emitter.emit('ready');
      return;
    }

    this.mountWidget();
    this.visitorTokens.setScope(config.agentId);
    await this.resolveVisitorGate(token);
    if (token !== this.initToken) return;

    // Reveal only now, so the visitor never sees a launcher that opens onto a
    // loading panel or a check that is still running.
    this.widget?.reveal();
    this.emitter.emit('ready');
  }

  /** Creates the widget hidden; checkReadiness reveals it once every check passed. */
  private mountWidget(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    this.widget = new ChatWidget(this.options, {
      onSend: (text) => void this.sendMessage(text),
      onSendAttachments: (files, text) => void this.sendAttachments(files, text),
      onSendVoice: (recording) => void this.sendVoice(recording),
      onIdentify: (payload) => void this.submitIdentify(payload),
      onOpen: () => {
        this.setState({ isOpen: true });
        this.emitter.emit('open');
      },
      onClose: () => {
        this.setState({ isOpen: false });
        this.emitter.emit('close');
      },
      onNewConversation: () => void this.startNewConversation(),
      onRequestHuman: () => void this.requestHuman(),
      onCancelHumanRequest: () => void this.cancelHumanRequest(),
    });
  }

  private clearRetry(): void {
    if (this.retryTimer === null) return;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /**
   * Maps `/sdk/config` rejections other than an unreachable server: missing
   * Connected Channels becomes `no-agent`; anything else (an invalid key, a
   * disallowed origin) is recorded as `state.error`.
   */
  private handleConfigError(error: unknown): void {
    const requestError = isChatbotRequestError(error) ? error : null;
    const blockReason = requestError?.apiError.code === 'agent_not_assigned' ? 'no-agent' : null;
    this.setState({ isReady: false, blockReason, error: errorMessage(error) });
  }

  private async resolveVisitorGate(token: number): Promise<void> {
    const stored = this.visitorTokens.get();
    if (stored) {
      try {
        const result = await this.apiClient.verifyVisitor(stored);
        if (token !== this.initToken) return;
        if (result.valid) {
          await this.enterChat(stored, result.name, token);
          return;
        }
      } catch {
        // Treat verify failure as unknown visitor.
      }
      this.visitorTokens.clear();
    }

    this.setState({ needsIdentify: true, visitorToken: null, visitorName: null });
    this.widget?.showIdentifyForm(this.options);
  }

  private async enterChat(
    visitorToken: string,
    visitorName: string | null,
    token = this.initToken,
  ): Promise<void> {
    this.visitorTokens.set(visitorToken);
    this.setState({
      visitorToken,
      visitorName,
      needsIdentify: false,
      messages: [],
      error: null,
    });
    this.widget?.readyToChat(this.options);
    this.connectSdkSocket(visitorToken);
    await this.restoreTicketStatus(visitorToken, token);
  }

  private connectSdkSocket(visitorToken: string): void {
    if (!this.sdkSocket) {
      this.sdkSocket = new SdkSocket();
    }
    this.sdkSocket.connect({
      baseUrl: this.options.apiBaseUrl,
      apiKey: this.options.apiKey,
      visitorToken,
      onTicketStatus: (payload) => this.handleTicketStatus(payload),
      onMessageReceive: (payload) => this.handleMessageReceive(payload),
      onReconnect: () => {
        const token = this.visitorTokens.get() ?? this._state.visitorToken;
        if (token) void this.restoreTicketStatus(token, this.initToken);
      },
      onConnectError: (error) => {
        this.emitter.emit('error', error);
      },
    });
  }

  private disconnectSdkSocket(): void {
    this.sdkSocket?.disconnect();
    this.sdkSocket = null;
  }

  /** Restore episode mode after identify / verify — never hydrates messages. */
  private async restoreTicketStatus(visitorToken: string, token: number): Promise<void> {
    try {
      const data = await this.apiClient.fetchTicketStatus(visitorToken);
      if (token !== this.initToken || this.isEndedConversation(data)) return;
      this.applyMode(data.mode, data);
    } catch {
      // Stay on default `ai` if status is unavailable (new visitor / offline).
    }
  }

  private handleTicketStatus(payload: TicketStatusData): void {
    if (!payload?.mode || this.isEndedConversation(payload)) return;
    this.applyMode(payload.mode, payload);
  }

  /**
   * Live human (agent) pushes from `/sdk` `message:receive`.
   *
   * Choice: ignore while `mode === 'ai'`. Website outbound (including AI
   * replies) is fanned out to the visitor room; AI text already arrives via
   * `POST /sdk/chat` REST and would double-render as an `agent` bubble. Accept
   * pushes in `waiting` / `human` / `closed` (late agent messages after close).
   * Also dedupe against the last bubble: an `ai` bubble by content, an `agent`
   * bubble by server id, so an agent can send the same text twice.
   */
  private handleMessageReceive(payload: unknown): void {
    if (this._state.mode === 'ai') return;

    const content = extractAgentText(payload) ?? '';
    const attachments = extractAttachments(payload);
    if (!content && attachments.length === 0) return;

    const pushId = extractMessageId(payload);
    const last = this._state.messages[this._state.messages.length - 1];
    if (last && messageKey(last.message) === messageKey({ content, attachments })) {
      if (last.message.type === 'ai') return;
      // Without an id there is no telling a redelivery from a repeat; drop it.
      if (last.message.type === 'agent' && (!pushId || pushId === this.lastPushId)) return;
    }
    this.lastPushId = pushId;

    const visitorToken = this.visitorTokens.get() ?? this._state.visitorToken ?? '';
    const agentMsg: ChatMessage = {
      id: localMessageId(),
      sessionId: visitorToken,
      message: {
        type: 'agent',
        content,
        ...(attachments.length > 0 ? { attachments } : {}),
      },
    };
    this.setState({ messages: [...this._state.messages, agentMsg] });
    this.widget?.appendMessage(agentMsg);
    this.emitter.emit('message', agentMsg);
  }

  async submitIdentify(payload: IdentifyRequest): Promise<void> {
    if (!this.apiClient || this._state.isLoading || !this._state.isReady) return;

    const name = payload.name.trim();
    const phone = payload.phone.trim();
    if (!name || !phone) return;

    this.setState({ isLoading: true, error: null });
    this.widget?.setIdentifyLoading(true);

    try {
      const response = await this.apiClient.identify({
        name,
        phone,
        ...(payload.email?.trim() ? { email: payload.email.trim() } : {}),
      });
      await this.enterChat(response.visitorToken, name);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState({ error: error.message });
      this.widget?.showIdentifyError(error.message);
      this.emitter.emit('error', error);
    } finally {
      this.setState({ isLoading: false });
      this.widget?.setIdentifyLoading(false);
    }
  }

  /**
   * Escalate the open AI ticket to Unassigned. No-op unless the widget is in `ai` mode.
   */
  async requestHuman(): Promise<void> {
    if (
      !this.apiClient ||
      this._state.mode !== 'ai' ||
      !this.hasActiveTicket ||
      this._state.isLoading
    ) {
      return;
    }

    const visitorToken = this.visitorTokens.get() ?? this._state.visitorToken;
    if (!visitorToken) {
      throw new Error('[onedeskpro-chatbot] Identify before requestHuman().');
    }

    this.setState({ isLoading: true, error: null });
    try {
      const data = await this.apiClient.requestHuman(visitorToken);
      this.applyMode(data.mode, data);
      this.emitter.emit('human-requested');
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState({ error: error.message });
      this.emitter.emit('error', error);
    } finally {
      this.setState({ isLoading: false });
    }
  }

  /**
   * Withdraws a pending human-agent request so the AI answers again. No-op unless the
   * widget is in `waiting` mode. When an agent accepted the ticket in the meantime, the
   * mode moves to `human` instead. Emits `human-request-cancelled` once the AI is back.
   */
  async cancelHumanRequest(): Promise<void> {
    if (!this.apiClient || this._state.mode !== 'waiting' || this._state.isLoading) return;
    const visitorToken = this.requireVisitorToken('cancelHumanRequest');

    const token = this.initToken;
    this.setState({ isLoading: true, error: null });
    this.widget?.setActionPending(true);
    this.widget?.showComposeError('');
    try {
      const data = await this.apiClient.cancelHumanRequest(visitorToken);
      if (token !== this.initToken) return;
      this.applyMode(data.mode, data);
      if (data.mode === 'ai') this.emitter.emit('human-request-cancelled');
    } catch (err) {
      if (token !== this.initToken) return;
      this.rejectAction(err, 'Could not cancel the request. Please try again.');
    } finally {
      if (token === this.initToken) {
        this.setState({ isLoading: false });
        this.widget?.setActionPending(false);
      }
    }
  }

  /**
   * Ends the current conversation and starts a fresh one: the API closes the open ticket
   * and gives the AI a new memory, then the chat is cleared and returns to `ai` mode.
   * Emits `session-reset`. No-op until the visitor has identified, or while a request is
   * in flight. Unlike `resetSession`, it works in every mode.
   */
  async startNewConversation(): Promise<void> {
    if (!this.apiClient || !this._state.isReady || this._state.needsIdentify) return;
    if (this._state.isLoading) return;
    const visitorToken = this.requireVisitorToken('startNewConversation');

    const token = this.initToken;
    this.setState({ isLoading: true, error: null });
    this.widget?.setActionPending(true);
    this.widget?.showComposeError('');
    try {
      const ended = await this.apiClient.closeConversation(visitorToken);
      if (token !== this.initToken) return;
      this.endedConversationId = ended.mode === 'closed' ? (ended.conversationId ?? null) : null;
      this.hasActiveTicket = false;
      this.setState({ messages: [], error: null, mode: 'ai' });
      this.widget?.clearMessages(this.options.chatbotName);
      this.syncWidgetMode('ai');
      this.emitter.emit('session-reset');
    } catch (err) {
      if (token !== this.initToken) return;
      this.rejectAction(err, 'Could not start a new conversation. Please try again.');
    } finally {
      if (token === this.initToken) {
        this.setState({ isLoading: false });
        this.widget?.setActionPending(false);
      }
    }
  }

  /** Records a failed header/banner action: `state.error`, a visible notice, and `error`. */
  private rejectAction(err: unknown, notice: string): void {
    const error = err instanceof Error ? err : new Error(String(err));
    this.setState({ error: error.message });
    this.widget?.showComposeError(notice);
    this.emitter.emit('error', error);
  }

  /** The visitor token every send needs; throws when the visitor has not identified. */
  private requireVisitorToken(method: string): string {
    const visitorToken = this.visitorTokens.get() ?? this._state.visitorToken;
    if (!this.apiClient || !visitorToken) {
      throw new Error(`[onedeskpro-chatbot] Identify before ${method}().`);
    }
    return visitorToken;
  }

  /** Adds the visitor's own message optimistically and marks a send in flight. */
  private pushLocalMessage(message: ChatMessage): void {
    this.setState({
      messages: [...this._state.messages, message],
      isLoading: true,
      error: null,
    });
    this.widget?.appendMessage(message);
    this.emitter.emit('message', message);
  }

  private replaceMessage(id: number, next: ChatMessage): void {
    this.setState({
      messages: this._state.messages.map((message) => (message.id === id ? next : message)),
    });
    this.widget?.replaceMessage(id, next);
  }

  private removeMessage(id: number): void {
    this.setState({ messages: this._state.messages.filter((message) => message.id !== id) });
    this.widget?.removeMessage(id);
  }

  async sendMessage(text: string): Promise<void> {
    const visitorToken = this.requireVisitorToken('sendMessage');

    if (this._state.mode === 'closed') {
      this.setState({ error: 'Conversation is closed' });
      return;
    }

    const content = text.trim();
    if (!content || this._state.isLoading || this._state.needsIdentify) return;

    const optimistic: ChatMessage = {
      id: localMessageId(),
      sessionId: visitorToken,
      message: { type: 'human', content },
    };
    const modeAtSend = this._state.mode;
    this.pushLocalMessage(optimistic);
    // Typing / AI-wait spinner only makes sense while AI owns the episode.
    if (modeAtSend === 'ai') this.widget?.setLoading(true);

    await this.deliver({ chatInput: content, visitorToken }, modeAtSend);
  }

  /** Records a send that never left the browser: `state.error`, the composer, and `error`. */
  private rejectSend(message: string): void {
    this.setState({ error: message });
    this.widget?.showComposeError(message);
    this.emitter.emit('error', new Error(message));
  }

  /**
   * Sends `files` as one media message, with `text` as its caption. The bubble
   * appears at once with local previews, uploads each file through the API, then
   * posts the chat message the same way `sendMessage` does. Rejects when the visitor
   * has not identified; a file that breaks the size or count limit is reported as
   * `state.error` (and an `error` event) without sending anything.
   */
  async sendAttachments(files: File[], text = ''): Promise<void> {
    const visitorToken = this.requireVisitorToken('sendAttachments');

    if (this._state.mode === 'closed') {
      this.setState({ error: 'Conversation is closed' });
      return;
    }

    if (files.length === 0 || this._state.isLoading || this._state.needsIdentify) return;

    const problem = attachmentProblem(files);
    if (problem) {
      this.rejectSend(problem);
      return;
    }

    await this.uploadThenDeliver({
      visitorToken,
      files,
      previews: files.map(toPreviewAttachment),
      caption: text.trim(),
    });
  }

  /**
   * Sends a recorded voice note (from `VoiceRecorder` or your own recorder). The
   * recording is re-encoded as mono WAV with a waveform where Web Audio allows,
   * uploaded, and posted as a `voice` message so the inbox shows its voice player.
   * Rejects when the visitor has not identified; an unusable or oversized recording is
   * reported as `state.error` (and an `error` event) without sending anything.
   */
  async sendVoice(recording: VoiceRecording): Promise<void> {
    const visitorToken = this.requireVisitorToken('sendVoice');

    if (this._state.mode === 'closed') {
      this.setState({ error: 'Conversation is closed' });
      return;
    }

    if (!recording?.blob || recording.blob.size === 0) return;
    if (this._state.isLoading || this._state.needsIdentify) return;

    let encoded;
    try {
      encoded = await encodeVoice(recording);
    } catch {
      this.rejectSend('Could not process the recording.');
      return;
    }
    if (encoded.file.size > SDK_UPLOAD_MAX_BYTES) {
      this.rejectSend('This voice message is too long to send.');
      return;
    }

    const voiceMeta: Pick<ChatAttachment, 'durationSeconds' | 'waveform'> = {
      durationSeconds: encoded.durationSeconds,
      ...(encoded.waveform ? { waveform: encoded.waveform } : {}),
    };
    const preview: ChatAttachment = {
      type: encoded.file.type,
      url: createPreviewUrl(encoded.file),
      fileName: encoded.file.name,
      size: encoded.file.size,
      ...voiceMeta,
    };

    await this.uploadThenDeliver({
      visitorToken,
      files: [encoded.file],
      previews: [preview],
      caption: '',
      messageType: 'voice',
      decorate: (uploaded) => ({ ...uploaded, ...voiceMeta }),
    });
  }

  /**
   * Shared tail of every file send: an optimistic `pending` bubble with local previews,
   * one upload per file, then `deliver`. A failed upload removes the bubble; a failed
   * chat post keeps it (the files are already stored) and records the error.
   */
  private async uploadThenDeliver(input: {
    visitorToken: string;
    files: File[];
    previews: ChatAttachment[];
    caption: string;
    messageType?: 'media' | 'voice';
    /** Adds client-side metadata (duration, waveform) to what the API returned. */
    decorate?: (uploaded: ChatAttachment) => ChatAttachment;
  }): Promise<void> {
    const { visitorToken, files, previews, caption } = input;
    const optimistic: ChatMessage = {
      id: localMessageId(),
      sessionId: visitorToken,
      message: { type: 'human', content: caption, attachments: previews },
      pending: true,
    };
    const modeAtSend = this._state.mode;
    this.pushLocalMessage(optimistic);

    const uploaded: ChatAttachment[] = [];
    try {
      for (const file of files) {
        const attachment = await this.apiClient.uploadAttachment(file, visitorToken);
        uploaded.push(input.decorate ? input.decorate(attachment) : attachment);
      }
    } catch (err) {
      // Nothing reached the conversation, so the bubble goes away with the error.
      this.removeMessage(optimistic.id);
      for (const preview of previews) revokePreviewUrl(preview.url);
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState({ error: error.message, isLoading: false });
      this.widget?.showComposeError(error.message);
      this.emitter.emit('error', error);
      return;
    }

    const sent: ChatMessage = {
      ...optimistic,
      pending: false,
      message: { ...optimistic.message, attachments: uploaded },
    };
    this.replaceMessage(optimistic.id, sent);
    for (const preview of previews) revokePreviewUrl(preview.url);
    if (modeAtSend === 'ai') this.widget?.setLoading(true);

    await this.deliver(
      {
        chatInput: caption,
        visitorToken,
        attachments: uploaded,
        ...(input.messageType ? { messageType: input.messageType } : {}),
      },
      modeAtSend,
    );
  }

  /**
   * Posts `payload` to `/sdk/chat` and applies the outcome: the ticket now exists,
   * the mode may have moved, and in `ai` mode the reply becomes a bubble.
   */
  private async deliver(payload: ChatRequest, modeAtSend: ChatbotTicketMode): Promise<void> {
    try {
      const response = await this.apiClient.sendMessage(payload);

      // Successful chat creates or continues a ticket episode.
      this.hasActiveTicket = true;
      this.endedConversationId = null;

      const nextMode = response.mode ?? modeAtSend;
      const messages = [...this._state.messages];
      const reply = (response.text ?? '').trim();

      // Prefer server mode immediately (e.g. dashboard handed the ticket back to AI
      // while the widget still showed "Connected with …").
      if (nextMode !== modeAtSend) {
        this.setState({ mode: nextMode });
        this.syncWidgetMode(nextMode);
        this.emitter.emit('ticket-status', { mode: nextMode });
      }

      // The API returns text only when the AI answered this message, and that
      // includes the reply that hands over to a human or closes the conversation.
      // While a human owns the episode the text is empty and replies arrive as
      // `message:receive` agent bubbles, so there is nothing to double-render.
      if (reply) {
        const last = messages[messages.length - 1];
        const duplicate =
          (last?.message.type === 'agent' || last?.message.type === 'ai') &&
          last.message.content === reply;
        if (!duplicate) {
          const aiMsg: ChatMessage = {
            id: localMessageId(),
            sessionId: response.sessionId,
            message: { type: 'ai', content: reply },
          };
          messages.push(aiMsg);
          this.widget?.appendMessage(aiMsg);
          this.emitter.emit('message', aiMsg);
        }
      }

      this.setState({ messages, isLoading: false, mode: nextMode });
      this.syncWidgetMode(nextMode);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState({ error: error.message, isLoading: false });
      this.emitter.emit('error', error);
    } finally {
      // State already settled above; the widget still needs its spinner cleared
      // on both paths.
      this.widget?.setLoading(false);
    }
  }

  on<K extends keyof ChatbotEventMap>(event: K, listener: Listener<K>): () => void {
    return this.emitter.on(event, listener);
  }

  resetSession(): void {
    if (!this._state.isReady || this._state.needsIdentify) return;
    if (this._state.mode !== 'closed') return;
    this.hasActiveTicket = false;
    this.setState({ messages: [], error: null, mode: 'ai' });
    this.widget?.clearMessages(this.options.chatbotName);
    this.syncWidgetMode('ai');
    this.emitter.emit('session-reset');
  }

  open(): void { this.widget?.open(); }
  close(): void { this.widget?.close(); }
  toggle(): void { this.widget?.toggle(); }

  getState(): Readonly<ChatbotState> {
    return { ...this._state };
  }

  /**
   * Unmounts the widget and cancels any in-flight init. Subscriptions are left
   * alone on purpose: they belong to whoever registered them, and tearing them
   * down here would silently kill listeners this instance does not own — every
   * useChatbot() in the tree, for one. They are released with the instance.
   */
  destroy(): void {
    this.initToken++;
    this.clearRetry();
    this.disconnectSdkSocket();
    this.widget?.destroy();
    this.widget = null;
    this.setState({ isOpen: false, isLoading: false, isReady: false, needsIdentify: true });
  }
}

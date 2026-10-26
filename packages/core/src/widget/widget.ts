import type {
  ChatMessage,
  ChatbotInitOptions,
  ChatbotTicketMode,
  IdentifyRequest,
  VoiceRecording,
} from '@onedeskpro/chatbot-types';
import { attachmentProblem, createPreviewUrl, revokePreviewUrl } from '../attachments';
import { formatAudioDuration } from '../audio';
import { VoiceRecorder, type VoiceRecorderSnapshot } from '../voice-recorder';
import {
  buildE164Phone,
  DEFAULT_DIAL_COUNTRY,
  DIAL_COUNTRIES,
  type DialCountry,
} from './countries';
import { buildStyles, FULLSCREEN_MEDIA } from './styles';
import {
  arrowRightIcon,
  botIcon,
  buildMessageEl,
  buildTypingIndicator,
  chatIcon,
  chevronDownIcon,
  closeIcon,
  envelopeIcon,
  fileIcon,
  imageIcon,
  micIcon,
  newSessionIcon,
  paperclipIcon,
  personIcon,
  plusIcon,
  requestHumanIcon,
  sendIcon,
  stopIcon,
  trashIcon,
  shieldCheckIcon,
  starsIcon,
  verifiedCheckIcon,
} from './render';

export interface WidgetCallbacks {
  onSend: (text: string) => void;
  /** Files picked in the composer, with whatever was typed as the caption. */
  onSendAttachments: (files: File[], text: string) => void;
  /** A voice note the visitor recorded and confirmed. */
  onSendVoice: (recording: VoiceRecording) => void;
  onIdentify: (payload: IdentifyRequest) => void;
  onOpen: () => void;
  onClose: () => void;
  /** The visitor confirmed ending this conversation to start a new one. */
  onNewConversation: () => void;
  onRequestHuman: () => void;
  /** The visitor withdrew a pending human-agent request. */
  onCancelHumanRequest: () => void;
}

type PanelMode = 'form' | 'chat' | 'compact';

/**
 * What the pickers offer: the types the API's upload filter accepts. Word documents
 * are left out because their MIME types do not pass that filter.
 */
const ATTACHMENT_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4',
  'video/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
  'audio/aac',
  'audio/opus',
  'application/pdf',
  'text/csv',
].join(',');
const PHOTO_ACCEPT = 'image/jpeg,image/png,image/gif';

interface PendingFile {
  file: File;
  /** `blob:` preview for images, `''` otherwise. Revoked when the file leaves the tray. */
  previewUrl: string;
}

export class ChatWidget {
  private host!: HTMLElement;
  private shadow!: ShadowRoot;
  private fab!: HTMLButtonElement;
  private panel!: HTMLElement;
  private stopViewportSync: (() => void) | null = null;
  private messagesContainer!: HTMLElement;
  private identifyContainer!: HTMLElement;
  private footer!: HTMLElement;
  private headerTitle!: HTMLElement;
  private newSessionBtn!: HTMLButtonElement;
  private requestHumanBtn!: HTMLButtonElement;
  private modeBanner!: HTMLElement;
  private modeBannerText!: HTMLElement;
  private cancelHumanBtn!: HTMLButtonElement;
  private confirmNewBar!: HTMLElement;
  private confirmNewBtn!: HTMLButtonElement;
  private keepChattingBtn!: HTMLButtonElement;
  private confirmingNew = false;
  private actionPending = false;
  private ticketMode: ChatbotTicketMode = 'ai';
  private input!: HTMLInputElement;
  private sendBtn!: HTMLButtonElement;
  private attachBtn!: HTMLButtonElement;
  private attachMenu!: HTMLElement;
  private attachFileInput!: HTMLInputElement;
  private attachPhotoInput!: HTMLInputElement;
  private pendingTray!: HTMLElement;
  private composeError!: HTMLElement;
  private pendingFiles: PendingFile[] = [];
  private attachMenuOpen = false;
  private composeForm!: HTMLFormElement;
  private micBtn!: HTMLButtonElement;
  private voiceBar!: HTMLElement;
  private voiceTime!: HTMLElement;
  private voiceLevel!: HTMLElement;
  private voiceStopBtn!: HTMLButtonElement;
  private voiceCancelBtn!: HTMLButtonElement;
  private voicePreview!: HTMLElement;
  private voiceAudio!: HTMLAudioElement;
  private voicePreviewTime!: HTMLElement;
  private voiceSendBtn!: HTMLButtonElement;
  private voiceDiscardBtn!: HTMLButtonElement;
  private recorder: VoiceRecorder | null = null;
  private voicePreviewUrl = '';
  private nameInput!: HTMLInputElement;
  private phoneInput!: HTMLInputElement;
  private emailInput!: HTMLInputElement;
  private identifySubmit!: HTMLButtonElement;
  private identifyError!: HTMLElement;
  private dialBtn!: HTMLButtonElement;
  private dialFlag!: HTMLElement;
  private dialCode!: HTMLElement;
  private countryPopover!: HTMLElement;
  private countrySearch!: HTMLInputElement;
  private countryList!: HTMLElement;
  private selectedCountry: DialCountry = DEFAULT_DIAL_COUNTRY;
  private countryOpen = false;
  private isOpen = false;
  private autoOpen: boolean;
  private destroyed = false;
  private position: string;
  private callbacks: WidgetCallbacks;

  constructor(options: ChatbotInitOptions, callbacks: WidgetCallbacks) {
    this.position = options.position ?? 'bottom-right';
    this.callbacks = callbacks;
    this.autoOpen = options.autoOpen === true;
    this.mount(options);
  }

  private mount(options: ChatbotInitOptions): void {
    this.host = document.createElement('div');
    this.host.id = 'onedeskpro-chatbot-host';
    // Hidden until ChatbotCore has confirmed the agent can reply; see reveal().
    this.host.style.display = 'none';
    this.shadow = this.host.attachShadow({ mode: 'closed' });

    const styleEl = document.createElement('style');
    styleEl.textContent = buildStyles(
      options.primaryColor ?? '#2563EB',
      options.theme ?? 'auto',
    );
    this.shadow.appendChild(styleEl);

    this.fab = document.createElement('button');
    this.fab.className = `ttcb-fab ${this.position}`;
    this.fab.setAttribute('aria-label', 'Open chat');
    this.fab.innerHTML = chatIcon();
    this.fab.addEventListener('click', () => this.toggle());
    this.shadow.appendChild(this.fab);

    this.panel = document.createElement('div');
    this.panel.className = `ttcb-panel ${this.position} hidden ttcb-mode-compact`;
    // Focus target on phones, where focusing a field would raise the keyboard on open.
    this.panel.tabIndex = -1;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-label', options.chatbotName ?? 'AI Assistant');

    this.panel.appendChild(this.buildHeader(options));

    this.identifyContainer = document.createElement('div');
    this.identifyContainer.className = 'ttcb-identify';
    this.buildIdentifyForm(this.identifyContainer);
    this.panel.appendChild(this.identifyContainer);

    this.messagesContainer = document.createElement('div');
    this.messagesContainer.className = 'ttcb-messages';
    this.messagesContainer.setAttribute('aria-live', 'polite');
    this.messagesContainer.setAttribute('aria-label', 'Chat messages');
    this.panel.appendChild(this.messagesContainer);

    this.modeBanner = document.createElement('div');
    this.modeBanner.className = 'ttcb-mode-banner';
    // Only the text is a live region, so the Cancel button is not read out with it.
    this.modeBannerText = document.createElement('span');
    this.modeBannerText.className = 'ttcb-mode-banner-text';
    this.modeBannerText.setAttribute('role', 'status');
    this.cancelHumanBtn = this.buildBannerButton('Cancel request', () => {
      if (!this.actionPending) this.callbacks.onCancelHumanRequest();
    });
    this.cancelHumanBtn.classList.add('hidden');
    this.modeBanner.appendChild(this.modeBannerText);
    this.modeBanner.appendChild(this.cancelHumanBtn);
    this.panel.appendChild(this.modeBanner);
    this.panel.appendChild(this.buildConfirmNewBar());

    this.footer = document.createElement('div');
    this.footer.className = 'ttcb-footer';

    this.pendingTray = document.createElement('div');
    this.pendingTray.className = 'ttcb-pending-tray';
    this.pendingTray.setAttribute('role', 'list');
    this.pendingTray.setAttribute('aria-label', 'Files to send');
    this.footer.appendChild(this.pendingTray);

    this.composeError = document.createElement('p');
    this.composeError.className = 'ttcb-compose-error';
    this.composeError.setAttribute('role', 'alert');
    this.footer.appendChild(this.composeError);

    this.footer.appendChild(this.buildVoiceBar());
    this.footer.appendChild(this.buildVoicePreview());

    const form = document.createElement('form');
    form.className = 'ttcb-form';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSend();
    });
    this.composeForm = form;
    form.appendChild(this.buildAttachControls());

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'ttcb-input';
    this.input.placeholder = options.placeholder ?? 'Type your message…';
    this.input.setAttribute('aria-label', 'Message input');
    this.input.setAttribute('autocomplete', 'off');

    this.sendBtn = document.createElement('button');
    this.sendBtn.type = 'submit';
    this.sendBtn.className = 'ttcb-send-btn';
    this.sendBtn.innerHTML = sendIcon();
    this.sendBtn.setAttribute('aria-label', 'Send message');

    this.micBtn = document.createElement('button');
    this.micBtn.type = 'button';
    this.micBtn.className = 'ttcb-mic-btn';
    this.micBtn.setAttribute('aria-label', 'Record voice message');
    this.micBtn.title = 'Record voice message';
    this.micBtn.innerHTML = micIcon();
    this.micBtn.addEventListener('click', () => void this.startVoice());

    form.appendChild(this.input);
    form.appendChild(this.micBtn);
    form.appendChild(this.sendBtn);
    this.footer.appendChild(form);
    this.panel.appendChild(this.footer);
    this.shadow.appendChild(this.panel);

    this.shadow.addEventListener('click', (e) => {
      const target = e.target as Node | null;
      if (
        this.attachMenuOpen &&
        !(target && (this.attachBtn.contains(target) || this.attachMenu.contains(target)))
      ) {
        this.closeAttachMenu();
      }
      if (!this.countryOpen) return;
      if (
        target &&
        (this.dialBtn.contains(target) || this.countryPopover.contains(target))
      ) {
        return;
      }
      this.closeCountryPopover();
    });
    this.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.attachMenuOpen) {
        e.stopPropagation();
        this.closeAttachMenu();
        this.attachBtn.focus();
      } else if (e.key === 'Escape' && this.confirmingNew) {
        e.stopPropagation();
        this.hideConfirmNew();
        this.newSessionBtn.focus();
      }
    });

    this.attachToDocument();
    this.showInitialLoading();
  }

  /** Shows the launcher (and the panel, with `autoOpen`) once every readiness check passed. */
  reveal(): void {
    this.host.style.removeProperty('display');
    if (this.autoOpen && !this.isOpen) this.open();
  }

  private buildHeader(options: ChatbotInitOptions): HTMLElement {
    const header = document.createElement('div');
    header.className = 'ttcb-header';

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'ttcb-avatar-wrap';
    const avatar = document.createElement('div');
    avatar.className = 'ttcb-avatar';
    avatar.innerHTML = botIcon();
    avatarWrap.appendChild(avatar);

    const main = document.createElement('div');
    main.className = 'ttcb-header-main';

    const titleRow = document.createElement('div');
    titleRow.className = 'ttcb-header-title-row';
    this.headerTitle = document.createElement('span');
    this.headerTitle.className = 'ttcb-header-title';
    this.headerTitle.textContent = options.chatbotName ?? 'AI Assistant';
    const verified = document.createElement('span');
    verified.className = 'ttcb-verified';
    verified.setAttribute('aria-label', 'Verified');
    verified.innerHTML = verifiedCheckIcon();
    titleRow.appendChild(this.headerTitle);
    titleRow.appendChild(verified);

    const meta = document.createElement('div');
    meta.className = 'ttcb-header-meta';
    const online = document.createElement('span');
    online.className = 'ttcb-meta-online';
    online.textContent = 'Online';
    const sep = document.createElement('span');
    sep.className = 'ttcb-meta-sep';
    sep.setAttribute('aria-hidden', 'true');
    const replies = document.createElement('span');
    replies.className = 'ttcb-meta-replies';
    replies.innerHTML = `${starsIcon()}<span>Replies instantly</span>`;
    meta.appendChild(online);
    meta.appendChild(sep);
    meta.appendChild(replies);

    main.appendChild(titleRow);
    main.appendChild(meta);

    const actions = document.createElement('div');
    actions.className = 'ttcb-header-actions';

    this.requestHumanBtn = document.createElement('button');
    this.requestHumanBtn.type = 'button';
    this.requestHumanBtn.className = 'ttcb-request-human-btn hidden';
    this.requestHumanBtn.id = 'ttcb-request-human-btn';
    this.requestHumanBtn.setAttribute('aria-label', 'Request human agent');
    this.requestHumanBtn.title = 'Request human agent';
    this.requestHumanBtn.innerHTML = requestHumanIcon();
    this.requestHumanBtn.addEventListener('click', () => this.callbacks.onRequestHuman());

    this.newSessionBtn = document.createElement('button');
    this.newSessionBtn.type = 'button';
    this.newSessionBtn.className = 'ttcb-new-session-btn hidden';
    this.newSessionBtn.setAttribute('aria-label', 'New conversation');
    this.newSessionBtn.title = 'New conversation';
    this.newSessionBtn.innerHTML = newSessionIcon();
    this.newSessionBtn.addEventListener('click', () => {
      if (this.actionPending) return;
      // A closed conversation has nothing left to lose, so it skips the confirmation.
      if (this.ticketMode === 'closed') this.callbacks.onNewConversation();
      else this.showConfirmNew();
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ttcb-close-btn';
    closeBtn.setAttribute('aria-label', 'Close chat');
    closeBtn.innerHTML = closeIcon();
    closeBtn.addEventListener('click', () => this.close());

    actions.appendChild(this.requestHumanBtn);
    actions.appendChild(this.newSessionBtn);
    actions.appendChild(closeBtn);

    header.appendChild(avatarWrap);
    header.appendChild(main);
    header.appendChild(actions);
    return header;
  }

  /** A small text button for the mode banner and the confirmation bar. */
  private buildBannerButton(label: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ttcb-banner-btn';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    return btn;
  }

  /** "End this conversation and start a new one?" with Start new / Keep chatting. */
  private buildConfirmNewBar(): HTMLElement {
    this.confirmNewBar = document.createElement('div');
    this.confirmNewBar.className = 'ttcb-confirm-bar';
    this.confirmNewBar.setAttribute('role', 'group');
    this.confirmNewBar.setAttribute('aria-label', 'Start a new conversation');

    const text = document.createElement('span');
    text.className = 'ttcb-confirm-text';
    text.textContent = 'End this conversation and start a new one?';

    this.confirmNewBtn = this.buildBannerButton('Start new', () => {
      if (this.actionPending) return;
      this.hideConfirmNew();
      this.input.focus();
      this.callbacks.onNewConversation();
    });
    this.confirmNewBtn.classList.add('primary');
    this.keepChattingBtn = this.buildBannerButton('Keep chatting', () => {
      this.hideConfirmNew();
      this.newSessionBtn.focus();
    });

    // Grouped so the two choices wrap onto the next line together on a narrow panel.
    const actions = document.createElement('div');
    actions.className = 'ttcb-confirm-actions';
    actions.appendChild(this.confirmNewBtn);
    actions.appendChild(this.keepChattingBtn);

    this.confirmNewBar.appendChild(text);
    this.confirmNewBar.appendChild(actions);
    return this.confirmNewBar;
  }

  private showConfirmNew(): void {
    this.confirmingNew = true;
    this.confirmNewBar.classList.add('visible');
    // Start on the choice that loses nothing.
    queueMicrotask(() => this.keepChattingBtn.focus());
  }

  private hideConfirmNew(): void {
    this.confirmingNew = false;
    this.confirmNewBar.classList.remove('visible');
  }

  /**
   * Marks the new-conversation and cancel-request controls unavailable while one of them
   * is in flight. `aria-disabled` rather than `disabled`: disabling the button that was
   * just pressed would drop focus out of the dialog.
   */
  setActionPending(pending: boolean): void {
    this.actionPending = pending;
    for (const btn of [this.newSessionBtn, this.cancelHumanBtn, this.confirmNewBtn]) {
      btn.setAttribute('aria-disabled', String(pending));
    }
  }

  /** The "+" button, its Attachment / Photo menu, and the hidden file inputs behind them. */
  private buildAttachControls(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'ttcb-attach';

    this.attachBtn = document.createElement('button');
    this.attachBtn.type = 'button';
    this.attachBtn.className = 'ttcb-attach-btn';
    this.attachBtn.setAttribute('aria-label', 'Add attachment');
    this.attachBtn.setAttribute('aria-haspopup', 'menu');
    this.attachBtn.setAttribute('aria-expanded', 'false');
    this.attachBtn.title = 'Add attachment';
    this.attachBtn.innerHTML = plusIcon();
    this.attachBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleAttachMenu();
    });

    this.attachMenu = document.createElement('div');
    this.attachMenu.className = 'ttcb-attach-menu';
    this.attachMenu.setAttribute('role', 'menu');

    this.attachFileInput = this.createFileInput(ATTACHMENT_ACCEPT, 'Choose files');
    this.attachPhotoInput = this.createFileInput(PHOTO_ACCEPT, 'Choose photos');

    const items: Array<{ label: string; icon: string; input: HTMLInputElement }> = [
      { label: 'Attachment', icon: paperclipIcon(), input: this.attachFileInput },
      { label: 'Photo', icon: imageIcon(), input: this.attachPhotoInput },
    ];
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ttcb-attach-item';
      btn.setAttribute('role', 'menuitem');
      btn.innerHTML = `${item.icon}<span>${item.label}</span>`;
      btn.addEventListener('click', () => {
        this.closeAttachMenu();
        item.input.click();
      });
      this.attachMenu.appendChild(btn);
    }

    wrap.appendChild(this.attachBtn);
    wrap.appendChild(this.attachMenu);
    wrap.appendChild(this.attachFileInput);
    wrap.appendChild(this.attachPhotoInput);
    return wrap;
  }

  private createFileInput(accept: string, label: string): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = accept;
    input.className = 'ttcb-file-input';
    input.tabIndex = -1;
    input.setAttribute('aria-label', label);
    input.addEventListener('change', () => {
      this.addPendingFiles(Array.from(input.files ?? []));
      // Reset so picking the same file again still fires `change`.
      input.value = '';
    });
    return input;
  }

  private toggleAttachMenu(): void {
    if (this.attachMenuOpen) this.closeAttachMenu();
    else this.openAttachMenu();
  }

  private openAttachMenu(): void {
    if (this.attachBtn.disabled) return;
    this.attachMenuOpen = true;
    this.attachMenu.classList.add('open');
    this.attachBtn.setAttribute('aria-expanded', 'true');
    const first = this.attachMenu.querySelector<HTMLButtonElement>('.ttcb-attach-item');
    queueMicrotask(() => first?.focus());
  }

  private closeAttachMenu(): void {
    if (!this.attachMenuOpen) return;
    this.attachMenuOpen = false;
    this.attachMenu.classList.remove('open');
    this.attachBtn.setAttribute('aria-expanded', 'false');
  }

  /** Adds picked files to the tray, or shows why the batch cannot be sent. */
  private addPendingFiles(files: File[]): void {
    if (files.length === 0) return;
    const problem = attachmentProblem([...this.pendingFiles.map((item) => item.file), ...files]);
    if (problem) {
      this.showComposeError(problem);
      return;
    }
    this.showComposeError('');
    for (const file of files) {
      const previewUrl = file.type.startsWith('image/') ? createPreviewUrl(file) : '';
      this.pendingFiles.push({ file, previewUrl });
    }
    this.renderPendingTray();
    this.input.focus();
  }

  private removePendingFile(index: number): void {
    const [removed] = this.pendingFiles.splice(index, 1);
    if (removed) revokePreviewUrl(removed.previewUrl);
    this.renderPendingTray();
    this.input.focus();
  }

  private clearPendingFiles(): void {
    for (const item of this.pendingFiles) revokePreviewUrl(item.previewUrl);
    this.pendingFiles = [];
    this.renderPendingTray();
  }

  private renderPendingTray(): void {
    this.pendingTray.innerHTML = '';
    this.pendingTray.classList.toggle('visible', this.pendingFiles.length > 0);
    this.pendingFiles.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'ttcb-pending-item';
      row.setAttribute('role', 'listitem');

      if (item.previewUrl) {
        const thumb = document.createElement('img');
        thumb.className = 'ttcb-pending-thumb';
        thumb.src = item.previewUrl;
        thumb.alt = '';
        row.appendChild(thumb);
      } else {
        const icon = document.createElement('span');
        icon.className = 'ttcb-pending-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = fileIcon();
        row.appendChild(icon);
      }

      const name = document.createElement('span');
      name.className = 'ttcb-pending-name';
      name.textContent = item.file.name || 'attachment';
      name.title = item.file.name;
      row.appendChild(name);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ttcb-pending-remove';
      remove.setAttribute('aria-label', `Remove ${item.file.name || 'attachment'}`);
      remove.innerHTML = closeIcon();
      remove.addEventListener('click', () => this.removePendingFile(index));
      row.appendChild(remove);

      this.pendingTray.appendChild(row);
    });
  }

  /** Recording state: red dot, timer, level meter, cancel and stop. */
  private buildVoiceBar(): HTMLElement {
    this.voiceBar = document.createElement('div');
    this.voiceBar.className = 'ttcb-voice-bar';
    this.voiceBar.setAttribute('role', 'group');
    this.voiceBar.setAttribute('aria-label', 'Recording voice message');

    const dot = document.createElement('span');
    dot.className = 'ttcb-voice-dot';
    dot.setAttribute('aria-hidden', 'true');

    this.voiceTime = document.createElement('span');
    this.voiceTime.className = 'ttcb-voice-time';
    this.voiceTime.setAttribute('role', 'timer');
    this.voiceTime.textContent = '0:00';

    const meter = document.createElement('div');
    meter.className = 'ttcb-voice-meter';
    meter.setAttribute('aria-hidden', 'true');
    this.voiceLevel = document.createElement('span');
    this.voiceLevel.className = 'ttcb-voice-level';
    meter.appendChild(this.voiceLevel);

    this.voiceCancelBtn = this.createVoiceButton('Cancel recording', trashIcon(), () =>
      this.cancelVoice(),
    );
    this.voiceStopBtn = this.createVoiceButton('Stop recording', stopIcon(), () => void this.stopVoice());
    this.voiceStopBtn.classList.add('primary');

    this.voiceBar.appendChild(dot);
    this.voiceBar.appendChild(this.voiceTime);
    this.voiceBar.appendChild(meter);
    this.voiceBar.appendChild(this.voiceCancelBtn);
    this.voiceBar.appendChild(this.voiceStopBtn);
    return this.voiceBar;
  }

  /** Preview state: listen back, then discard or send. */
  private buildVoicePreview(): HTMLElement {
    this.voicePreview = document.createElement('div');
    this.voicePreview.className = 'ttcb-voice-preview';
    this.voicePreview.setAttribute('role', 'group');
    this.voicePreview.setAttribute('aria-label', 'Voice message preview');

    this.voiceAudio = document.createElement('audio');
    this.voiceAudio.className = 'ttcb-voice-audio';
    this.voiceAudio.controls = true;
    this.voiceAudio.preload = 'metadata';
    this.voiceAudio.setAttribute('aria-label', 'Recorded voice message');

    this.voicePreviewTime = document.createElement('span');
    this.voicePreviewTime.className = 'ttcb-voice-time';

    this.voiceDiscardBtn = this.createVoiceButton('Discard voice message', trashIcon(), () =>
      this.cancelVoice(),
    );
    this.voiceSendBtn = this.createVoiceButton('Send voice message', sendIcon(), () =>
      this.sendVoice(),
    );
    this.voiceSendBtn.classList.add('primary');

    this.voicePreview.appendChild(this.voiceAudio);
    this.voicePreview.appendChild(this.voicePreviewTime);
    this.voicePreview.appendChild(this.voiceDiscardBtn);
    this.voicePreview.appendChild(this.voiceSendBtn);
    return this.voicePreview;
  }

  private createVoiceButton(label: string, icon: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ttcb-voice-btn';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.innerHTML = icon;
    btn.addEventListener('click', onClick);
    return btn;
  }

  /** Starts a voice note; reports a missing microphone or denied permission inline. */
  private async startVoice(): Promise<void> {
    if (this.micBtn.disabled) return;
    this.closeAttachMenu();
    this.showComposeError('');
    if (!VoiceRecorder.isSupported()) {
      this.showComposeError('Voice messages are not supported in this browser.');
      return;
    }
    this.recorder?.destroy();
    this.recorder = new VoiceRecorder((snapshot) => this.renderVoice(snapshot));
    try {
      await this.recorder.start();
    } catch (error) {
      this.showComposeError(error instanceof Error ? error.message : 'Could not start recording.');
      this.recorder.destroy();
      this.recorder = null;
      this.renderVoice({ state: 'idle', elapsedSeconds: 0, level: 0, result: null });
    }
  }

  private async stopVoice(): Promise<void> {
    await this.recorder?.stop();
  }

  private cancelVoice(): void {
    this.recorder?.cancel();
    this.recorder?.destroy();
    this.recorder = null;
    this.renderVoice({ state: 'idle', elapsedSeconds: 0, level: 0, result: null });
    this.input.focus();
  }

  private sendVoice(): void {
    const result = this.recorder?.getSnapshot().result;
    if (!result) return;
    this.cancelVoice();
    this.callbacks.onSendVoice(result);
  }

  /** Swaps the composer between its text form, the recording bar and the preview. */
  private renderVoice(snapshot: VoiceRecorderSnapshot): void {
    if (this.destroyed) return;
    const { state } = snapshot;
    this.composeForm.classList.toggle('hidden', state !== 'idle');
    this.voiceBar.classList.toggle('visible', state === 'recording');
    this.voicePreview.classList.toggle('visible', state === 'preview');

    if (state === 'recording') {
      this.voiceTime.textContent = formatAudioDuration(snapshot.elapsedSeconds);
      this.voiceLevel.style.width = `${Math.max(4, Math.round(snapshot.level * 100))}%`;
      return;
    }

    revokePreviewUrl(this.voicePreviewUrl);
    this.voicePreviewUrl = '';
    this.voiceAudio.removeAttribute('src');
    if (state === 'preview' && snapshot.result) {
      this.voicePreviewUrl = createPreviewUrl(
        new File([snapshot.result.blob], 'voice-preview', { type: snapshot.result.blob.type }),
      );
      if (this.voicePreviewUrl) this.voiceAudio.src = this.voicePreviewUrl;
      this.voicePreviewTime.textContent = formatAudioDuration(snapshot.result.durationSeconds);
      queueMicrotask(() => this.voiceSendBtn.focus());
    }
  }

  /** Inline composer error (file too large, too many files, upload rejected). */
  showComposeError(message: string): void {
    this.composeError.textContent = message;
    this.composeError.classList.toggle('visible', Boolean(message));
  }

  private setPanelMode(mode: PanelMode): void {
    this.panel.classList.remove('ttcb-mode-form', 'ttcb-mode-chat', 'ttcb-mode-compact');
    this.panel.classList.add(`ttcb-mode-${mode}`);
    if (mode !== 'chat') {
      this.requestHumanBtn.classList.add('hidden');
      this.newSessionBtn.classList.add('hidden');
      this.hideConfirmNew();
      this.hideModeBanner();
    }
  }

  private buildIdentifyForm(container: HTMLElement): void {
    const form = document.createElement('form');
    form.className = 'ttcb-identify-form';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleIdentifySubmit();
    });

    this.nameInput = this.createIconField(form, {
      id: 'name',
      label: 'Name',
      required: true,
      hint: 'Required',
      placeholder: 'Your name',
      type: 'text',
      autocomplete: 'name',
      icon: personIcon(),
    });

    this.createPhoneField(form);

    this.emailInput = this.createIconField(form, {
      id: 'email',
      label: 'Email (optional)',
      required: false,
      hint: 'For chat transcript',
      placeholder: 'Email (optional)',
      type: 'email',
      autocomplete: 'email',
      icon: envelopeIcon(),
    });

    this.identifyError = document.createElement('p');
    this.identifyError.className = 'ttcb-identify-error';
    form.appendChild(this.identifyError);

    this.identifySubmit = document.createElement('button');
    this.identifySubmit.type = 'submit';
    this.identifySubmit.className = 'ttcb-identify-submit';
    this.identifySubmit.innerHTML = `<span>Start Chatting</span>${arrowRightIcon()}`;
    form.appendChild(this.identifySubmit);

    container.appendChild(form);

    const trust = document.createElement('div');
    trust.className = 'ttcb-trust';
    trust.innerHTML = `${shieldCheckIcon()}<span>Encrypted connection • No spam, ever</span>`;
    container.appendChild(trust);
  }

  private createIconField(
    form: HTMLElement,
    opts: {
      id: string;
      label: string;
      required: boolean;
      hint: string;
      placeholder: string;
      type: string;
      autocomplete: HTMLInputElement['autocomplete'];
      icon: string;
    },
  ): HTMLInputElement {
    const field = document.createElement('div');
    field.className = 'ttcb-field';

    const labelRow = document.createElement('div');
    labelRow.className = 'ttcb-field-label-row';
    const label = document.createElement('label');
    label.className = 'ttcb-label';
    label.htmlFor = `ttcb-${opts.id}`;
    if (opts.required) {
      label.innerHTML = `${opts.label.replace(' (optional)', '')} <span class="ttcb-req">*</span>`;
    } else {
      label.textContent = opts.label;
    }
    const hint = document.createElement('span');
    hint.className = 'ttcb-field-hint';
    hint.textContent = opts.hint;
    labelRow.appendChild(label);
    labelRow.appendChild(hint);

    const wrap = document.createElement('div');
    wrap.className = 'ttcb-input-wrap';
    const icon = document.createElement('span');
    icon.className = 'ttcb-input-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = opts.icon;
    const input = document.createElement('input');
    input.id = `ttcb-${opts.id}`;
    input.name = opts.id;
    input.type = opts.type;
    input.className = 'ttcb-identify-input';
    input.placeholder = opts.placeholder;
    input.required = opts.required;
    input.autocomplete = opts.autocomplete;
    wrap.appendChild(icon);
    wrap.appendChild(input);

    field.appendChild(labelRow);
    field.appendChild(wrap);
    form.appendChild(field);
    return input;
  }

  private createPhoneField(form: HTMLElement): void {
    const field = document.createElement('div');
    field.className = 'ttcb-field';

    const labelRow = document.createElement('div');
    labelRow.className = 'ttcb-field-label-row';
    const label = document.createElement('label');
    label.className = 'ttcb-label';
    label.htmlFor = 'ttcb-tel';
    label.innerHTML = 'Phone <span class="ttcb-req">*</span>';
    const hint = document.createElement('span');
    hint.className = 'ttcb-field-hint';
    hint.textContent = 'SMS / WhatsApp sync';
    labelRow.appendChild(label);
    labelRow.appendChild(hint);

    const phoneRow = document.createElement('div');
    phoneRow.className = 'ttcb-phone-row';
    phoneRow.id = 'ttcb-phone-row';

    this.dialBtn = document.createElement('button');
    this.dialBtn.type = 'button';
    this.dialBtn.className = 'ttcb-dial-btn';
    this.dialBtn.setAttribute('aria-label', 'Select country code');
    this.dialBtn.setAttribute('aria-haspopup', 'listbox');
    this.dialBtn.setAttribute('aria-expanded', 'false');
    this.dialFlag = document.createElement('span');
    this.dialFlag.className = 'ttcb-dial-flag';
    this.dialCode = document.createElement('span');
    this.dialCode.className = 'ttcb-dial-code';
    this.syncDialButton();
    this.dialBtn.appendChild(this.dialFlag);
    this.dialBtn.appendChild(this.dialCode);
    const chevron = document.createElement('span');
    chevron.setAttribute('aria-hidden', 'true');
    chevron.innerHTML = chevronDownIcon();
    this.dialBtn.appendChild(chevron);
    this.dialBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleCountryPopover();
    });

    this.phoneInput = document.createElement('input');
    this.phoneInput.id = 'ttcb-tel';
    this.phoneInput.name = 'tel';
    this.phoneInput.type = 'tel';
    this.phoneInput.className = 'ttcb-phone-national';
    this.phoneInput.placeholder = '1712-345678';
    this.phoneInput.required = true;
    this.phoneInput.autocomplete = 'tel-national';
    this.phoneInput.setAttribute('inputmode', 'tel');

    phoneRow.appendChild(this.dialBtn);
    phoneRow.appendChild(this.phoneInput);

    this.countryPopover = document.createElement('div');
    this.countryPopover.className = 'ttcb-country-popover';
    this.countryPopover.setAttribute('role', 'listbox');

    this.countrySearch = document.createElement('input');
    this.countrySearch.type = 'search';
    this.countrySearch.className = 'ttcb-country-search';
    this.countrySearch.placeholder = 'Search country…';
    this.countrySearch.setAttribute('aria-label', 'Search countries');
    this.countrySearch.addEventListener('input', () => this.renderCountryList());

    this.countryList = document.createElement('div');
    this.countryList.className = 'ttcb-country-list';

    this.countryPopover.appendChild(this.countrySearch);
    this.countryPopover.appendChild(this.countryList);
    this.renderCountryList();

    field.appendChild(labelRow);
    field.appendChild(phoneRow);
    field.appendChild(this.countryPopover);
    form.appendChild(field);
  }

  private syncDialButton(): void {
    this.dialFlag.textContent = this.selectedCountry.flag;
    this.dialCode.textContent = `+${this.selectedCountry.dial}`;
  }

  private toggleCountryPopover(): void {
    if (this.countryOpen) this.closeCountryPopover();
    else this.openCountryPopover();
  }

  private openCountryPopover(): void {
    this.countryOpen = true;
    this.countryPopover.classList.add('open');
    this.dialBtn.setAttribute('aria-expanded', 'true');
    this.countrySearch.value = '';
    this.renderCountryList();
    queueMicrotask(() => this.countrySearch.focus());
  }

  private closeCountryPopover(): void {
    this.countryOpen = false;
    this.countryPopover.classList.remove('open');
    this.dialBtn.setAttribute('aria-expanded', 'false');
  }

  private renderCountryList(): void {
    const q = this.countrySearch.value.trim().toLowerCase();
    const items = DIAL_COUNTRIES.filter((c) => {
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.dial.includes(q) ||
        c.iso.toLowerCase().includes(q) ||
        `+${c.dial}`.includes(q)
      );
    });

    this.countryList.innerHTML = '';
    for (const country of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ttcb-country-item';
      btn.setAttribute('role', 'option');
      btn.setAttribute(
        'aria-selected',
        country.iso === this.selectedCountry.iso ? 'true' : 'false',
      );
      btn.innerHTML = `
        <span class="ttcb-dial-flag">${country.flag}</span>
        <span class="ttcb-country-item-name">${country.name}</span>
        <span class="ttcb-country-item-dial">+${country.dial}</span>
      `;
      btn.addEventListener('click', () => {
        this.selectedCountry = country;
        this.syncDialButton();
        this.closeCountryPopover();
        this.phoneInput.focus();
      });
      this.countryList.appendChild(btn);
    }
  }

  /**
   * `document.body` is null when the CDN script runs from <head> without defer,
   * so fall back to waiting for the parse to finish rather than throwing.
   */
  private attachToDocument(): void {
    const attach = () => {
      if (this.destroyed) return;
      (document.body ?? document.documentElement).appendChild(this.host);
    };
    if (document.body) attach();
    else document.addEventListener('DOMContentLoaded', attach, { once: true });
  }

  private showInitialLoading(): void {
    this.setPanelMode('compact');
    this.identifyContainer.classList.remove('visible');
    this.messagesContainer.classList.remove('hidden');
    this.footer.classList.add('hidden');
    this.messagesContainer.innerHTML = '';
    this.input.disabled = true;
    this.sendBtn.disabled = true;

    const el = document.createElement('div');
    el.className = 'ttcb-initial-loading';
    el.id = 'ttcb-initial-loading';
    const spinner = document.createElement('div');
    spinner.className = 'ttcb-spinner';
    const text = document.createElement('p');
    text.textContent = 'Loading…';
    el.appendChild(spinner);
    el.appendChild(text);
    this.messagesContainer.appendChild(el);
  }

  private showEmptyState(name: string): void {
    const empty = document.createElement('div');
    empty.className = 'ttcb-empty';
    empty.id = 'ttcb-empty';
    const icon = document.createElement('div');
    icon.className = 'ttcb-empty-icon';
    icon.innerHTML = botIcon();
    const p1 = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = name;
    p1.appendChild(document.createTextNode('Welcome to '));
    p1.appendChild(strong);
    const p2 = document.createElement('p');
    p2.textContent = "Ask me anything — I'm here to help!";
    p2.style.marginTop = '6px';
    p2.style.fontSize = '12px';
    empty.appendChild(icon);
    empty.appendChild(p1);
    empty.appendChild(p2);
    this.messagesContainer.appendChild(empty);
  }

  private removeEmptyState(): void {
    const el = this.shadow.getElementById('ttcb-empty');
    if (el) el.remove();
  }

  private handleSend(): void {
    const text = this.input.value.trim();
    // Skip while a reply is in flight — sendBtn is disabled, but Enter can still
    // fire submit; core also guards, this avoids clearing the draft for nothing.
    if (this.sendBtn.disabled) return;
    if (this.pendingFiles.length > 0) {
      const files = this.pendingFiles.map((item) => item.file);
      this.clearPendingFiles();
      this.showComposeError('');
      this.input.value = '';
      this.callbacks.onSendAttachments(files, text);
      this.input.focus();
      return;
    }
    if (!text) return;
    this.input.value = '';
    this.callbacks.onSend(text);
    // Keep caret in the field after send so the user can type the next message
    // without clicking back in (disabled inputs would steal focus).
    this.input.focus();
  }

  private handleIdentifySubmit(): void {
    const name = this.nameInput.value.trim();
    const phone = buildE164Phone(this.selectedCountry.dial, this.phoneInput.value);
    const email = this.emailInput.value.trim();
    if (!name || !phone) {
      this.showIdentifyError('Name and phone are required.');
      return;
    }
    this.showIdentifyError('');
    this.callbacks.onIdentify({
      name,
      phone,
      ...(email ? { email } : {}),
    });
  }

  appendMessage(msg: { type: 'human' | 'ai' | 'agent'; content: string } | ChatMessage): void {
    this.removeEmptyState();
    const el = this.buildMessage(msg);
    this.messagesContainer.appendChild(el);
    this.scrollToBottom();
  }

  /** Re-renders the bubble with id `id` — e.g. once its uploads finished. */
  replaceMessage(id: number, msg: ChatMessage): void {
    const existing = this.findMessageEl(id);
    if (!existing) {
      this.appendMessage(msg);
      return;
    }
    existing.replaceWith(this.buildMessage(msg));
    this.scrollToBottom();
  }

  removeMessage(id: number): void {
    this.findMessageEl(id)?.remove();
  }

  private buildMessage(
    msg: { type: 'human' | 'ai' | 'agent'; content: string } | ChatMessage,
  ): HTMLElement {
    if ('message' in msg) {
      const el = buildMessageEl({ ...msg.message, pending: msg.pending });
      el.dataset.msgId = String(msg.id);
      return el;
    }
    return buildMessageEl(msg);
  }

  private findMessageEl(id: number): HTMLElement | null {
    for (const el of this.messagesContainer.querySelectorAll<HTMLElement>('.ttcb-msg')) {
      if (el.dataset.msgId === String(id)) return el;
    }
    return null;
  }

  setMessages(messages: ChatMessage[]): void {
    this.messagesContainer.innerHTML = '';
    if (messages.length === 0) return;
    for (const msg of messages) {
      this.messagesContainer.appendChild(this.buildMessage(msg));
    }
    this.scrollToBottom();
  }

  setLoading(loading: boolean): void {
    // Only disable the send button. Disabling the input blurs it (browser
    // behavior), which forces the user to click back after every message.
    // Concurrent sends are blocked via sendBtn.disabled + handleSend/core guards.
    // Keep send disabled when compose is locked (closed mode via setMode).
    this.sendBtn.disabled = loading || this.input.disabled;
    this.attachBtn.disabled = loading || this.input.disabled;
    this.micBtn.disabled = loading || this.input.disabled;
    if (loading) {
      this.closeAttachMenu();
      if (!this.shadow.getElementById('ttcb-typing')) {
        this.messagesContainer.appendChild(buildTypingIndicator());
        this.scrollToBottom();
      }
      // On phones focusing raises the keyboard again after the visitor dismissed it to read.
      if (!this.isFullScreen()) this.input.focus();
    } else {
      const el = this.shadow.getElementById('ttcb-typing');
      if (el) el.remove();
      if (!this.input.disabled && !this.isFullScreen()) {
        this.input.focus();
      }
    }
  }

  setIdentifyLoading(loading: boolean): void {
    this.identifySubmit.disabled = loading;
    this.nameInput.disabled = loading;
    this.phoneInput.disabled = loading;
    this.emailInput.disabled = loading;
    this.dialBtn.disabled = loading;
    const phoneRow = this.shadow.getElementById('ttcb-phone-row');
    phoneRow?.classList.toggle('disabled', loading);
    for (const wrap of this.identifyContainer.querySelectorAll('.ttcb-input-wrap')) {
      wrap.classList.toggle('disabled', loading);
    }
    this.identifySubmit.innerHTML = loading
      ? '<span>Starting…</span>'
      : `<span>Start Chatting</span>${arrowRightIcon()}`;
    if (loading) this.closeCountryPopover();
  }

  showIdentifyError(message: string): void {
    this.identifyError.textContent = message;
  }

  open(): void {
    this.isOpen = true;
    this.startViewportSync();
    this.panel.classList.remove('hidden');
    this.fab.classList.add('ttcb-open');
    if (this.isFullScreen()) {
      // The keyboard would cover half the screen before the visitor has read anything.
      this.panel.focus({ preventScroll: true });
    } else if (this.identifyContainer.classList.contains('visible')) {
      this.nameInput.focus();
    } else {
      this.input.focus();
    }
    this.callbacks.onOpen();
  }

  close(): void {
    this.isOpen = false;
    this.closeCountryPopover();
    this.closeAttachMenu();
    this.panel.classList.add('hidden');
    this.fab.classList.remove('ttcb-open');
    this.stopViewportSync?.();
    this.stopViewportSync = null;
    // Also blurs the field inside the now-hidden panel, which dismisses a phone keyboard.
    this.fab.focus({ preventScroll: true });
    this.callbacks.onClose();
  }

  private isFullScreen(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia(FULLSCREEN_MEDIA).matches;
  }

  /**
   * iOS Safari, and Chrome on Android since 108, leave the layout viewport alone when
   * the keyboard opens and scroll the page instead, so a full-height fixed panel ends
   * up half behind the keyboard. While open, mirror the visual viewport into CSS vars
   * that the full-screen layout reads; the floating desktop panel ignores them.
   */
  private startViewportSync(): void {
    const viewport = window.visualViewport;
    if (!viewport || this.stopViewportSync) return;
    const sync = () => {
      const list = this.messagesContainer;
      const atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
      this.panel.style.setProperty('--ttcb-vv-top', `${viewport.offsetTop}px`);
      this.panel.style.setProperty('--ttcb-vv-left', `${viewport.offsetLeft}px`);
      this.panel.style.setProperty('--ttcb-vv-width', `${viewport.width}px`);
      this.panel.style.setProperty('--ttcb-vv-height', `${viewport.height}px`);
      // Keep the latest message in view when the keyboard shrinks the list.
      if (atBottom) this.scrollToBottom();
    };
    viewport.addEventListener('resize', sync);
    viewport.addEventListener('scroll', sync);
    sync();
    this.stopViewportSync = () => {
      viewport.removeEventListener('resize', sync);
      viewport.removeEventListener('scroll', sync);
    };
  }

  toggle(): void {
    if (this.isOpen) this.close();
    else this.open();
  }

  showIdentifyForm(options: ChatbotInitOptions): void {
    this.setPanelMode('form');
    if (options.chatbotName) {
      this.headerTitle.textContent = options.chatbotName;
    }
    this.messagesContainer.classList.add('hidden');
    this.footer.classList.add('hidden');
    this.identifyContainer.classList.add('visible');
    this.showIdentifyError('');
    this.setIdentifyLoading(false);
  }

  readyToChat(options: ChatbotInitOptions): void {
    this.setPanelMode('chat');
    this.closeCountryPopover();
    this.identifyContainer.classList.remove('visible');
    this.messagesContainer.classList.remove('hidden');
    this.footer.classList.remove('hidden');
    this.messagesContainer.innerHTML = '';
    if (options.chatbotName) {
      this.headerTitle.textContent = options.chatbotName;
    }
    if (options.welcomeMessage) {
      this.appendMessage({ type: 'ai', content: options.welcomeMessage });
    } else {
      this.showEmptyState(options.chatbotName ?? 'AI Assistant');
    }
    this.setMode('ai');
  }

  clearMessages(name: string): void {
    this.messagesContainer.innerHTML = '';
    this.clearPendingFiles();
    this.showComposeError('');
    this.hideConfirmNew();
    this.showEmptyState(name);
  }

  /**
   * Sync header controls, compose lock, and status banner with ticket mode.
   * `canRequestHuman` (`mode === 'ai' && hasActiveTicket`) and `canStartNew`
   * (`mode === 'closed' || hasActiveTicket`) are decided by ChatbotCore.
   */
  setMode(
    mode: ChatbotTicketMode,
    options?: { agentName?: string | null; canRequestHuman?: boolean; canStartNew?: boolean },
  ): void {
    const inChat = this.panel.classList.contains('ttcb-mode-chat');
    const agentName = options?.agentName;
    const canRequestHuman = options?.canRequestHuman === true;
    const canStartNew = options?.canStartNew ?? mode === 'closed';

    const showRequestHuman = inChat && canRequestHuman;
    const showNewSession = inChat && canStartNew;
    const closed = mode === 'closed';
    this.ticketMode = mode;

    this.requestHumanBtn.classList.toggle('hidden', !showRequestHuman);
    this.newSessionBtn.classList.toggle('hidden', !showNewSession);
    // Closed needs no confirmation, and a hidden button has nothing to confirm.
    if (!showNewSession || closed) this.hideConfirmNew();

    this.input.disabled = closed;
    if (closed) {
      this.sendBtn.disabled = true;
      this.attachBtn.disabled = true;
      this.micBtn.disabled = true;
      this.closeAttachMenu();
      this.clearPendingFiles();
      if (this.recorder) this.cancelVoice();
      this.showComposeError('');
    } else if (!this.shadow.getElementById('ttcb-typing')) {
      this.sendBtn.disabled = false;
      this.attachBtn.disabled = false;
      this.micBtn.disabled = false;
    }

    if (!inChat) {
      this.hideModeBanner();
      this.rescueFocus();
      return;
    }

    if (mode === 'waiting') {
      this.showModeBanner('Waiting for a human agent…', 'waiting');
    } else if (mode === 'closed') {
      this.showModeBanner('This conversation is closed', 'closed');
    } else if (mode === 'human' && agentName?.trim()) {
      this.showModeBanner(`Connected with ${agentName.trim()}`, 'human');
    } else {
      this.hideModeBanner();
    }
    this.rescueFocus();
  }

  private showModeBanner(text: string, kind: 'waiting' | 'human' | 'closed'): void {
    this.modeBannerText.textContent = text;
    this.modeBanner.className = `ttcb-mode-banner visible ${kind}`;
    this.cancelHumanBtn.classList.toggle('hidden', kind !== 'waiting');
  }

  private hideModeBanner(): void {
    this.modeBannerText.textContent = '';
    this.modeBanner.className = 'ttcb-mode-banner';
    this.cancelHumanBtn.classList.add('hidden');
  }

  /**
   * A mode change can hide the control that has focus (Cancel request once the AI is
   * back, New conversation after a reset). Move focus to the composer, or the panel,
   * instead of letting it fall out of the dialog.
   */
  private rescueFocus(): void {
    const active = this.shadow.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (!active.closest('.hidden') && !active.closest('.ttcb-mode-banner:not(.visible)')) return;
    if (!this.input.disabled) this.input.focus();
    else this.panel.focus({ preventScroll: true });
  }

  destroy(): void {
    this.destroyed = true;
    this.stopViewportSync?.();
    this.stopViewportSync = null;
    this.clearPendingFiles();
    this.recorder?.destroy();
    this.recorder = null;
    revokePreviewUrl(this.voicePreviewUrl);
    this.voicePreviewUrl = '';
    this.host.remove();
  }

  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import type {
  ChatbotBlockReason,
  ChatbotTicketMode,
  ChatMessage,
  ChatbotState,
  VoiceRecording,
} from '@onedeskpro/chatbot-types';
import { useChatbotContext } from '../context';

export interface UseChatbotReturn {
  messages: ChatMessage[];
  isOpen: boolean;
  isLoading: boolean;
  isReady: boolean;
  needsIdentify: boolean;
  blockReason: ChatbotBlockReason;
  error: string | null;
  visitorToken: string | null;
  visitorName: string | null;
  /** Ticket episode mode: ai | waiting | human | closed. */
  mode: ChatbotTicketMode;
  /** @deprecated Use visitorToken. */
  sessionId: string | null;
  sendMessage: (text: string) => Promise<void>;
  /**
   * Sends files as one media message, with `text` as the caption. The message shows
   * up in `messages` with `pending: true` and local previews until the uploads land.
   */
  sendAttachments: (files: File[], text?: string) => Promise<void>;
  /** Sends a recorded voice note (record one with `VoiceRecorder` from `@onedeskpro/chatbot-core`). */
  sendVoice: (recording: VoiceRecording) => Promise<void>;
  submitIdentify: (payload: { name: string; phone: string; email?: string }) => Promise<void>;
  /** Escalate the open AI ticket to a human agent (no-op unless mode is `ai`). */
  requestHuman: () => Promise<void>;
  /** Withdraw a pending human request so the AI answers again (no-op unless mode is `waiting`). */
  cancelHumanRequest: () => Promise<void>;
  /** End the current conversation in any mode and start a fresh one (clears `messages`). */
  startNewConversation: () => Promise<void>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  resetSession: () => void;
}

export function useChatbot(): UseChatbotReturn {
  const instance = useChatbotContext();

  const [state, setState] = useState<ChatbotState>(() => instance.getState());

  useEffect(() => {
    // `state-change` fires for every state transition, so one subscription keeps
    // React in sync with all of them — including the optimistic user message and
    // the `isLoading` flip, which have no event of their own.
    const off = instance.on('state-change', (next) => setState({ ...next }));

    // The instance may have moved on between the useState initialiser and this
    // effect (init() is async), so re-read once on subscribe.
    setState({ ...instance.getState() });

    return off;
  }, [instance]);

  const sendMessage = useCallback(
    (text: string) => instance.sendMessage(text),
    [instance],
  );
  const sendAttachments = useCallback(
    (files: File[], text?: string) => instance.sendAttachments(files, text),
    [instance],
  );
  const sendVoice = useCallback(
    (recording: VoiceRecording) => instance.sendVoice(recording),
    [instance],
  );
  const submitIdentify = useCallback(
    (payload: { name: string; phone: string; email?: string }) =>
      instance.submitIdentify(payload),
    [instance],
  );
  const requestHuman = useCallback(() => instance.requestHuman(), [instance]);
  const cancelHumanRequest = useCallback(() => instance.cancelHumanRequest(), [instance]);
  const startNewConversation = useCallback(() => instance.startNewConversation(), [instance]);
  const open = useCallback(() => instance.open(), [instance]);
  const close = useCallback(() => instance.close(), [instance]);
  const toggle = useCallback(() => instance.toggle(), [instance]);
  const resetSession = useCallback(() => instance.resetSession(), [instance]);

  return {
    messages: state.messages,
    isOpen: state.isOpen,
    isLoading: state.isLoading,
    isReady: state.isReady,
    needsIdentify: state.needsIdentify,
    blockReason: state.blockReason,
    error: state.error,
    visitorToken: state.visitorToken,
    visitorName: state.visitorName,
    mode: state.mode,
    sessionId: state.visitorToken,
    sendMessage,
    sendAttachments,
    sendVoice,
    submitIdentify,
    requestHuman,
    cancelHumanRequest,
    startNewConversation,
    open,
    close,
    toggle,
    resetSession,
  };
}

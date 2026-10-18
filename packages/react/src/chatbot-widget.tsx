'use client';

import React, { useEffect, type ReactNode } from 'react';
import { useChatbot } from './hooks/use-chatbot';
import { useChatbotContext } from './context';

/**
 * Default floating widget — delegates rendering to the core Shadow DOM widget
 * that ChatbotCore.init() mounts into document.body. This component just
 * ensures the provider is in scope; the actual UI lives outside React's tree.
 */
export function ChatbotWidget() {
  const instance = useChatbotContext();
  useEffect(() => {
    void instance;
  }, [instance]);
  return <div style={{ display: 'none' }} aria-hidden="true" />;
}

// ─── Headless variant ─────────────────────────────────────────────────────────

export interface ChatbotHeadlessProps {
  renderLauncher: (props: {
    isOpen: boolean;
    toggle: () => void;
    open: () => void;
    close: () => void;
  }) => ReactNode;
  renderWindow: (props: {
    isOpen: boolean;
    messages: ReturnType<typeof useChatbot>['messages'];
    sendMessage: (text: string) => Promise<void>;
    sendAttachments: (files: File[], text?: string) => Promise<void>;
    isLoading: boolean;
    error: string | null;
    close: () => void;
  }) => ReactNode;
}

/**
 * Headless variant — no built-in UI. Supply your own launcher and chat window
 * via render props. All state comes from useChatbot() internally.
 */
export function ChatbotHeadless({ renderLauncher, renderWindow }: ChatbotHeadlessProps) {
  const { isOpen, toggle, open, close, messages, sendMessage, sendAttachments, isLoading, error } =
    useChatbot();
  return (
    <>
      {renderLauncher({ isOpen, toggle, open, close })}
      {renderWindow({ isOpen, messages, sendMessage, sendAttachments, isLoading, error, close })}
    </>
  );
}

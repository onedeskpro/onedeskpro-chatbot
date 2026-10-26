import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildChatResponse, buildTicketStatus } from '../../test/factories/chat.factory';
import { seedVisitorToken } from '../../test/factories/visitor.factory';
import { ok, sdkUrl } from '../../test/mocks/handlers';
import { server } from '../../test/mocks/server';
import { deferred, renderWithProvider } from '../../test/render-chat';
import { useChatbot } from './use-chatbot';

function Conversation() {
  const { messages, isLoading, isReady, sendMessage } = useChatbot();
  return (
    <div>
      <span role="status" aria-label="ready">{String(isReady)}</span>
      <span role="status" aria-label="loading">{String(isLoading)}</span>
      <ul>
        {messages.map((m) => (
          <li key={m.id}>
            {m.message.type}: {m.message.content}
          </li>
        ))}
      </ul>
      <button onClick={() => void sendMessage('hello')}>send</button>
    </div>
  );
}

function WithError() {
  const { error, isLoading, sendMessage } = useChatbot();
  return (
    <div>
      <span role="status" aria-label="loading">{String(isLoading)}</span>
      <span role="alert">{error ?? ''}</span>
      <button onClick={() => void sendMessage('hi')}>send</button>
    </div>
  );
}

function ConversationControls() {
  const { messages, mode, isReady, sendMessage, cancelHumanRequest, startNewConversation } =
    useChatbot();
  return (
    <div>
      <span role="status" aria-label="ready">{String(isReady)}</span>
      <span role="status" aria-label="mode">{mode}</span>
      <span role="status" aria-label="count">{messages.length}</span>
      <button onClick={() => void sendMessage('hello')}>send</button>
      <button onClick={() => void cancelHumanRequest()}>cancel request</button>
      <button onClick={() => void startNewConversation()}>new conversation</button>
    </div>
  );
}

const status = (name: string) => screen.getByRole('status', { name });

/** Hold the chat reply open until the returned `release()` is called. */
function holdChatReply() {
  const reply = deferred<void>();
  server.use(
    http.post(sdkUrl('chat'), async () => {
      await reply.promise;
      return ok(buildChatResponse());
    }),
  );
  return { release: () => reply.resolve() };
}

describe('useChatbot', () => {
  beforeEach(() => {
    seedVisitorToken();
  });

  it('should throw a helpful error when used outside a provider', () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {});

    // Act
    const renderOutside = () => render(<Conversation />);

    // Assert
    expect(renderOutside).toThrow(/ChatbotProvider/);
  });

  it('should become ready when init resolves', async () => {
    // Arrange / Act
    renderWithProvider(<Conversation />);

    // Assert
    await waitFor(() => expect(status('ready')).toHaveTextContent('true'));
  });

  // The bug this package shipped with: the optimistic message and the loading
  // flip emitted no event, so React rendered nothing until the reply arrived.
  it('should show the user message and the spinner when the reply has not arrived yet', async () => {
    // Arrange
    const user = userEvent.setup();
    const { release } = holdChatReply();
    renderWithProvider(<Conversation />);
    await waitFor(() => expect(status('ready')).toHaveTextContent('true'));

    // Act
    await user.click(screen.getByRole('button', { name: 'send' }));

    // Assert
    expect(screen.getByText('human: hello')).toBeInTheDocument();
    expect(status('loading')).toHaveTextContent('true');
    expect(screen.queryByText(/^ai:/)).toBeNull();

    release();
    expect(await screen.findByText('ai: AI reply')).toBeInTheDocument();
    expect(status('loading')).toHaveTextContent('false');
  });

  it('should keep working when mounted twice by StrictMode', async () => {
    // Arrange
    const user = userEvent.setup();
    const { release } = holdChatReply();
    renderWithProvider(<Conversation />, { strict: true });
    await waitFor(() => expect(status('ready')).toHaveTextContent('true'));

    // Act
    await user.click(screen.getByRole('button', { name: 'send' }));

    // Assert
    expect(screen.getByText('human: hello')).toBeInTheDocument();
    release();
    expect(await screen.findByText('ai: AI reply')).toBeInTheDocument();
  });

  it('should surface a send failure without leaving the UI stuck loading when the request fails', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProvider(<WithError />);
    await waitFor(() =>
      expect(document.querySelectorAll('#onedeskpro-chatbot-host')).toHaveLength(1),
    );
    server.use(
      http.post(sdkUrl('chat'), () => new HttpResponse('boom', { status: 500, statusText: 'Server Error' })),
    );

    // Act
    await user.click(screen.getByRole('button', { name: 'send' }));

    // Assert
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('500'));
    expect(status('loading')).toHaveTextContent('false');
  });

  it('should clear the messages and return to ai when startNewConversation is called', async () => {
    // Arrange
    const user = userEvent.setup();
    renderWithProvider(<ConversationControls />);
    await waitFor(() => expect(status('ready')).toHaveTextContent('true'));
    await user.click(screen.getByRole('button', { name: 'send' }));
    await waitFor(() => expect(status('count')).toHaveTextContent('2'));

    // Act
    await user.click(screen.getByRole('button', { name: 'new conversation' }));

    // Assert
    await waitFor(() => expect(status('count')).toHaveTextContent('0'));
    expect(status('mode')).toHaveTextContent('ai');
  });

  it('should hand back to the AI when cancelHumanRequest is called while waiting', async () => {
    // Arrange
    const user = userEvent.setup();
    server.use(
      http.get(sdkUrl('ticket-status'), () =>
        ok(buildTicketStatus({ mode: 'waiting', conversationId: 'c1' })),
      ),
    );
    renderWithProvider(<ConversationControls />);
    await waitFor(() => expect(status('mode')).toHaveTextContent('waiting'));

    // Act
    await user.click(screen.getByRole('button', { name: 'cancel request' }));

    // Assert
    await waitFor(() => expect(status('mode')).toHaveTextContent('ai'));
  });
});

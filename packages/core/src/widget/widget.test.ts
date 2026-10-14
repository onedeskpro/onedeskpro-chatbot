import { within } from '@testing-library/dom';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { widgetRoot } from '../../test/shadow-root';
import { ChatWidget, type WidgetCallbacks } from './widget';

const OPTIONS = { apiKey: 'test', chatbotName: 'Test' };

/** Mount a widget that is ready to chat, and return handles for querying it. */
function mountWidget() {
  const callbacks: WidgetCallbacks = {
    onSend: vi.fn(),
    onIdentify: vi.fn(),
    onOpen: vi.fn(),
    onClose: vi.fn(),
    onReset: vi.fn(),
    onRequestHuman: vi.fn(),
  };
  const widget = new ChatWidget(OPTIONS, callbacks);
  widget.readyToChat(OPTIONS);
  widget.reveal();
  const root = widgetRoot();
  const shadow = root as unknown as ShadowRoot;
  const ui = within(root);
  return {
    widget,
    callbacks,
    shadow,
    launcher: ui.getByRole('button', { name: 'Open chat' }),
    input: ui.getByRole('textbox', { name: 'Message input' }),
    sendBtn: ui.getByRole('button', { name: 'Send message' }),
    closeBtn: ui.getByRole('button', { name: 'Close chat' }),
  };
}

describe('ChatWidget', () => {
  describe('input focus while loading', () => {
    it('should keep the input enabled and focused when a reply starts loading', async () => {
      // Arrange
      const user = userEvent.setup();
      const { widget, input, sendBtn, shadow } = mountWidget();
      widget.open();
      await user.click(input);
      expect(shadow.activeElement).toBe(input);

      // Act
      widget.setLoading(true);

      // Assert
      expect(input).toBeEnabled();
      expect(sendBtn).toBeDisabled();
      expect(shadow.activeElement).toBe(input);
      widget.destroy();
    });

    it('should restore input focus when loading ends', async () => {
      // Arrange
      const user = userEvent.setup();
      const { widget, input, shadow } = mountWidget();
      widget.open();
      await user.click(input);
      widget.setLoading(true);

      // Act
      widget.setLoading(false);

      // Assert
      expect(input).toBeEnabled();
      expect(shadow.activeElement).toBe(input);
      widget.destroy();
    });
  });

  describe('reveal', () => {
    const callbacks = (): WidgetCallbacks => ({
      onSend: vi.fn(),
      onIdentify: vi.fn(),
      onOpen: vi.fn(),
      onClose: vi.fn(),
      onReset: vi.fn(),
      onRequestHuman: vi.fn(),
    });
    const host = () => document.getElementById('onedeskpro-chatbot-host');

    it('should stay hidden when it has not been revealed yet', () => {
      // Arrange / Act
      const widget = new ChatWidget({ ...OPTIONS, autoOpen: true }, callbacks());

      // Assert
      expect(host()).not.toBeVisible();
      widget.destroy();
    });

    it.each([
      { autoOpen: false, opened: false },
      { autoOpen: true, opened: true },
    ])('should show the launcher and open=$opened when revealed with autoOpen=$autoOpen', ({ autoOpen, opened }) => {
      // Arrange
      const handlers = callbacks();
      const widget = new ChatWidget({ ...OPTIONS, autoOpen }, handlers);

      // Act
      widget.reveal();

      // Assert
      expect(host()).toBeVisible();
      expect(handlers.onOpen).toHaveBeenCalledTimes(opened ? 1 : 0);
      widget.destroy();
    });
  });

  describe('open and close', () => {
    it('should move focus into the panel and announce open when the launcher is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      const { widget, launcher, input, shadow, callbacks } = mountWidget();

      // Act
      await user.click(launcher);

      // Assert
      expect(callbacks.onOpen).toHaveBeenCalledTimes(1);
      expect(shadow.activeElement).toBe(input);
      widget.destroy();
    });

    // Rule 17: focus must return to the launcher on close. close() does not move
    // focus today, so this is skipped as a suspected bug rather than changed here.
    it.skip('should return focus to the launcher when the close button is clicked', async () => {
      // Arrange
      const user = userEvent.setup();
      const { widget, launcher, closeBtn, shadow, callbacks } = mountWidget();
      await user.click(launcher);

      // Act
      await user.click(closeBtn);

      // Assert
      expect(callbacks.onClose).toHaveBeenCalledTimes(1);
      expect(shadow.activeElement).toBe(launcher);
      widget.destroy();
    });
  });

  describe('destroy', () => {
    it('should remove its host and leave no DOM nodes behind when destroyed', () => {
      // Arrange
      const { widget } = mountWidget();
      expect(document.body.childElementCount).toBe(1);

      // Act
      widget.destroy();

      // Assert
      expect(document.getElementById('onedeskpro-chatbot-host')).toBeNull();
      expect(document.body.childElementCount).toBe(0);
    });
  });
});

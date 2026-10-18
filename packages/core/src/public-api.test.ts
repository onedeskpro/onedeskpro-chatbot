import { describe, expect, it } from 'vitest';
import * as core from './index';

// The published surface is a contract: adding to it is fine, removing or renaming
// is a breaking change, and anything the README promises must actually be here.
describe('public API', () => {
  it('should export exactly the documented runtime members when the package is imported', () => {
    // Arrange
    const expected = [
      'ApiClient',
      'ChatbotCore',
      'DEFAULT_API_BASE_URL',
      'DEFAULT_REQUEST_TIMEOUT_MS',
      'EventEmitter',
      'OnedeskProChatbot',
      'SDK_CHAT_MAX_ATTACHMENTS',
      'SDK_UPLOAD_MAX_BYTES',
      'SdkSocket',
      'SessionManager',
      'VOICE_MAX_DURATION_SECONDS',
      'VoiceRecorder',
      'isChatbotRequestError',
      'resolveSdkSocketUrl',
    ];

    // Act
    const actual = Object.keys(core).sort();

    // Assert
    expect(actual).toEqual(expected);
  });

  it('should expose the CDN singleton when used by the script-tag build', () => {
    // Arrange
    const { OnedeskProChatbot } = core;

    // Act
    const instance = OnedeskProChatbot.getInstance();

    // Assert
    expect(typeof OnedeskProChatbot.init).toBe('function');
    expect(instance).toBeNull();
  });

  it('should keep the documented defaults when read from the package', () => {
    // Arrange / Act
    const { DEFAULT_API_BASE_URL, DEFAULT_REQUEST_TIMEOUT_MS } = core;

    // Assert
    expect(DEFAULT_API_BASE_URL).toBe('https://api.onedeskpro.com');
    expect(DEFAULT_REQUEST_TIMEOUT_MS).toBe(30_000);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { installFakeMediaRecorder } from '../test/mocks/media-recorder';
import { VoiceRecorder, type VoiceRecorderSnapshot } from './voice-recorder';

describe('VoiceRecorder', () => {
  it('should reject with a visitor-facing message when the browser cannot record', async () => {
    // Arrange (jsdom has no MediaRecorder)
    const recorder = new VoiceRecorder(() => undefined);

    // Act / Assert
    expect(VoiceRecorder.isSupported()).toBe(false);
    await expect(recorder.start()).rejects.toThrow(/not supported/);
  });

  it('should report a denied microphone without changing state', async () => {
    // Arrange
    installFakeMediaRecorder({ denyMic: true });
    const seen: VoiceRecorderSnapshot[] = [];
    const recorder = new VoiceRecorder((s) => seen.push(s));

    // Act / Assert
    await expect(recorder.start()).rejects.toThrow('Microphone access was denied.');
    expect(seen).toEqual([]);
    expect(recorder.getSnapshot().state).toBe('idle');
  });

  it('should move through recording to preview and release the microphone when stopped', async () => {
    // Arrange
    vi.useFakeTimers();
    const fakes = installFakeMediaRecorder();
    const seen: VoiceRecorderSnapshot[] = [];
    const recorder = new VoiceRecorder((s) => seen.push(s));

    // Act
    await recorder.start();
    await vi.advanceTimersByTimeAsync(2_600);
    const result = await recorder.stop();

    // Assert
    expect(seen[0].state).toBe('recording');
    expect(recorder.getSnapshot()).toMatchObject({ state: 'preview', elapsedSeconds: 3 });
    expect(result).toMatchObject({ mimeType: 'audio/webm', durationSeconds: 3 });
    expect(result?.blob.size).toBeGreaterThan(0);
    expect(fakes.tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(fakes.recorders[0].state).toBe('inactive');
    recorder.destroy();
  });

  it('should stop on its own when the maximum duration is reached', async () => {
    // Arrange
    vi.useFakeTimers();
    installFakeMediaRecorder();
    const recorder = new VoiceRecorder(() => undefined, 2);

    // Act
    await recorder.start();
    await vi.advanceTimersByTimeAsync(2_100);

    // Assert
    expect(recorder.getSnapshot()).toMatchObject({ state: 'preview', elapsedSeconds: 2 });
    recorder.destroy();
  });

  it('should leave no timers running and stop the microphone when cancelled mid-recording', async () => {
    // Arrange
    vi.useFakeTimers();
    const fakes = installFakeMediaRecorder();
    const recorder = new VoiceRecorder(() => undefined);
    await recorder.start();

    // Act
    recorder.cancel();

    // Assert
    expect(recorder.getSnapshot()).toEqual({ state: 'idle', elapsedSeconds: 0, level: 0, result: null });
    expect(fakes.tracks[0].stop).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});

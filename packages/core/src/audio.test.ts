import { describe, expect, it } from 'vitest';
import {
  audioExtensionForMimeType,
  encodeVoice,
  encodeWav,
  formatAudioDuration,
  normalizeAudioMimeType,
  waveformPeaks,
} from './audio';

describe('normalizeAudioMimeType', () => {
  it.each([
    ['audio/webm;codecs=opus', 'audio/webm'],
    ['AUDIO/MP4', 'audio/mp4'],
    ['', 'audio/webm'],
    [undefined, 'audio/webm'],
  ])('should turn %p into %p', (input, expected) => {
    expect(normalizeAudioMimeType(input)).toBe(expected);
  });
});

describe('audioExtensionForMimeType', () => {
  it.each([
    ['audio/mpeg', 'mp3'],
    ['audio/wav', 'wav'],
    ['audio/mp4', 'm4a'],
    ['audio/ogg', 'ogg'],
    ['audio/webm', 'webm'],
  ])('should map %p to .%s', (mime, ext) => {
    expect(audioExtensionForMimeType(mime)).toBe(ext);
  });
});

describe('formatAudioDuration', () => {
  it.each([
    [0, '0:00'],
    [59, '0:59'],
    [60, '1:00'],
    [125.7, '2:05'],
    [-3, '0:00'],
    [Number.NaN, '0:00'],
  ])('should format %p as %p', (seconds, expected) => {
    expect(formatAudioDuration(seconds)).toBe(expected);
  });
});

describe('encodeWav', () => {
  it('should write a RIFF header and one 16-bit sample per input sample when given mono samples', async () => {
    // Arrange
    const samples = new Float32Array([0, 1, -1, 0.5]);

    // Act
    const blob = encodeWav(samples, 16_000);
    const view = new DataView(await blob.arrayBuffer());

    // Assert
    expect(blob.type).toBe('audio/wav');
    expect(blob.size).toBe(44 + samples.length * 2);
    expect(String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))).toBe('RIFF');
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
  });
});

describe('waveformPeaks', () => {
  it('should scale buckets to 8–100 against the loudest one when levels vary', () => {
    // Arrange: first half silent, second half loud
    const samples = new Float32Array(96);
    samples.fill(0.8, 48);

    // Act
    const peaks = waveformPeaks(samples, 4);

    // Assert
    expect(peaks).toEqual([8, 8, 100, 100]);
  });

  it('should return an empty list when there are no samples', () => {
    expect(waveformPeaks(new Float32Array(0))).toEqual([]);
  });
});

describe('encodeVoice', () => {
  it('should send the original blob with a bare mime type when Web Audio is unavailable', async () => {
    // Arrange (jsdom has no AudioContext)
    const blob = new Blob(['opus-bytes'], { type: 'audio/webm;codecs=opus' });

    // Act
    const encoded = await encodeVoice({ blob, durationSeconds: 3.4 });

    // Assert
    expect(encoded.file.type).toBe('audio/webm');
    expect(encoded.file.name).toMatch(/^voice-message-\d+\.webm$/);
    expect(encoded.file.size).toBe(blob.size);
    expect(encoded.durationSeconds).toBe(3);
    expect(encoded.waveform).toBeUndefined();
  });

  it('should never report a duration under one second when the recording was very short', async () => {
    const encoded = await encodeVoice({ blob: new Blob(['x'], { type: 'audio/mp4' }), durationSeconds: 0.2 });
    expect(encoded.durationSeconds).toBe(1);
  });
});

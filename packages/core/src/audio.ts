import type { VoiceRecording } from '@onedeskpro/chatbot-types';

/** Voice notes are re-encoded as mono 16 kHz WAV: plays everywhere and stays small. */
export const VOICE_SAMPLE_RATE = 16_000;
/** Loudness buckets stored with a voice note (the API allows up to 64). */
export const WAVEFORM_BUCKETS = 48;

export interface EncodedVoice {
  file: File;
  durationSeconds: number;
  waveform?: number[];
}

/** `audio/webm;codecs=opus` → `audio/webm`: the API's upload filter matches the bare subtype. */
export function normalizeAudioMimeType(type: string | undefined): string {
  const bare = (type ?? '').split(';')[0].trim().toLowerCase();
  return bare || 'audio/webm';
}

export function audioExtensionForMimeType(mimeType: string): string {
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

export function formatAudioDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function offlineContextCtor(): typeof OfflineAudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    OfflineAudioContext?: typeof OfflineAudioContext;
    webkitOfflineAudioContext?: typeof OfflineAudioContext;
  };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

async function decodeAudio(blob: Blob): Promise<AudioBuffer | null> {
  const Ctor = audioContextCtor();
  if (!Ctor) return null;
  const context = new Ctor();
  try {
    const bytes = await blob.arrayBuffer();
    return await context.decodeAudioData(bytes.slice(0));
  } catch {
    return null;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Mono samples at `VOICE_SAMPLE_RATE`; falls back to channel 0 at the source rate. */
async function toMonoSamples(buffer: AudioBuffer): Promise<{ samples: Float32Array; sampleRate: number }> {
  const Ctor = offlineContextCtor();
  if (Ctor) {
    try {
      const length = Math.max(1, Math.ceil(buffer.duration * VOICE_SAMPLE_RATE));
      const offline = new Ctor(1, length, VOICE_SAMPLE_RATE);
      const source = offline.createBufferSource();
      source.buffer = buffer;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      return { samples: rendered.getChannelData(0), sampleRate: VOICE_SAMPLE_RATE };
    } catch {
      // Fall through to the un-resampled channel.
    }
  }
  return { samples: buffer.getChannelData(0), sampleRate: buffer.sampleRate };
}

/** Mono 16-bit PCM WAV: a 44-byte header followed by the samples. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const dataSize = samples.length * 2;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const writeAscii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff), true);
    offset += 2;
  }
  return new Blob([out], { type: 'audio/wav' });
}

/** RMS per bucket, scaled to 8–100 against the loudest bucket so quiet notes keep a shape. */
export function waveformPeaks(samples: Float32Array, buckets = WAVEFORM_BUCKETS): number[] {
  if (samples.length === 0) return [];
  const perBucket = Math.max(1, Math.floor(samples.length / buckets));
  const raw: number[] = [];
  let max = 0;
  for (let b = 0; b < buckets; b++) {
    const start = b * perBucket;
    const end = Math.min(start + perBucket, samples.length);
    let sum = 0;
    for (let i = start; i < end; i++) {
      const v = samples[i] ?? 0;
      sum += v * v;
    }
    const rms = end > start ? Math.sqrt(sum / (end - start)) : 0;
    raw.push(rms);
    if (rms > max) max = rms;
  }
  return raw.map((rms) => (max > 0 ? Math.max(8, Math.min(100, Math.round((rms / max) * 100))) : 8));
}

/**
 * Turns a recording into the file to upload. Decodes with Web Audio and writes mono
 * 16 kHz WAV plus a waveform; where decoding is unavailable or fails, the original blob
 * is sent as-is with a normalised MIME type so the message still goes out.
 */
export async function encodeVoice(recording: VoiceRecording): Promise<EncodedVoice> {
  const stamp = Date.now();
  const fallbackDuration = Math.max(1, Math.round(recording.durationSeconds || 1));
  const sourceMime = normalizeAudioMimeType(recording.mimeType ?? recording.blob.type);

  const decoded = await decodeAudio(recording.blob);
  if (!decoded) {
    return {
      file: new File([recording.blob], `voice-message-${stamp}.${audioExtensionForMimeType(sourceMime)}`, {
        type: sourceMime,
      }),
      durationSeconds: fallbackDuration,
    };
  }

  const { samples, sampleRate } = await toMonoSamples(decoded);
  return {
    file: new File([encodeWav(samples, sampleRate)], `voice-message-${stamp}.wav`, { type: 'audio/wav' }),
    durationSeconds: Math.max(1, Math.round(decoded.duration || fallbackDuration)),
    waveform: waveformPeaks(samples),
  };
}

import type { VoiceRecording } from '@onedeskpro/chatbot-types';
import { normalizeAudioMimeType } from './audio';

export type VoiceRecorderState = 'idle' | 'recording' | 'preview';

export interface VoiceRecorderSnapshot {
  state: VoiceRecorderState;
  /** Whole seconds recorded so far (or the final length in `preview`). */
  elapsedSeconds: number;
  /** Microphone loudness 0–1 while recording, 0 otherwise. */
  level: number;
  /** The finished recording while in `preview`. */
  result: VoiceRecording | null;
}

/** Longest voice note the widget records before stopping on its own. */
export const VOICE_MAX_DURATION_SECONDS = 300;

const TICK_MS = 250;
const LEVEL_MS = 100;

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return 'audio/webm';
  }
  return MIME_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? 'audio/webm';
}

function startErrorMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Microphone access was denied.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'No microphone was found.';
  return 'Could not start recording.';
}

/**
 * Records a voice note with `MediaRecorder`. Framework-independent: the widget uses it,
 * and custom UIs built on `ChatbotCore` can too. `destroy()` releases the microphone,
 * timers and audio context; nothing is left running once it returns.
 */
export class VoiceRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private mimeType = 'audio/webm';
  private startedAt = 0;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private levelTimer: ReturnType<typeof setInterval> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private snapshot: VoiceRecorderSnapshot = { state: 'idle', elapsedSeconds: 0, level: 0, result: null };

  constructor(
    private readonly onChange: (snapshot: VoiceRecorderSnapshot) => void,
    private readonly maxDurationSeconds = VOICE_MAX_DURATION_SECONDS,
  ) {}

  static isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices?.getUserMedia === 'function' &&
      typeof MediaRecorder !== 'undefined'
    );
  }

  getSnapshot(): VoiceRecorderSnapshot {
    return { ...this.snapshot };
  }

  /** Asks for the microphone and starts recording. Rejects with a visitor-facing message. */
  async start(): Promise<void> {
    if (!VoiceRecorder.isSupported()) {
      throw new Error('Voice messages are not supported in this browser.');
    }
    this.release();
    this.chunks = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      throw new Error(startErrorMessage(error));
    }

    try {
      this.mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType: this.mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      this.stream = stream;
      this.recorder = recorder;
      this.startedAt = Date.now();
      recorder.start(200);
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
      this.recorder = null;
      throw new Error(startErrorMessage(error));
    }

    this.startLevelMeter(stream);
    this.tickTimer = setInterval(() => {
      this.update({ elapsedSeconds: Math.floor(this.elapsedMs() / 1000) });
    }, TICK_MS);
    this.maxTimer = setTimeout(() => void this.stop(), this.maxDurationSeconds * 1000);
    this.update({ state: 'recording', elapsedSeconds: 0, level: 0, result: null });
  }

  /** Stops recording and moves to `preview`. Resolves with the recording, or null if none. */
  async stop(): Promise<VoiceRecording | null> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === 'inactive') {
      this.release();
      return null;
    }
    const durationSeconds = Math.max(1, Math.round(this.elapsedMs() / 1000));
    this.clearTimers();

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        const parts = this.chunks;
        this.chunks = [];
        resolve(new Blob(parts, { type: normalizeAudioMimeType(this.mimeType) }));
      };
      try {
        recorder.stop();
      } catch {
        resolve(new Blob(this.chunks, { type: normalizeAudioMimeType(this.mimeType) }));
      }
    });
    this.releaseMedia();

    const result: VoiceRecording = {
      blob,
      mimeType: normalizeAudioMimeType(this.mimeType),
      durationSeconds,
    };
    this.update({ state: 'preview', elapsedSeconds: durationSeconds, level: 0, result });
    return result;
  }

  /** Discards the recording (or the one in preview) and returns to `idle`. */
  cancel(): void {
    this.release();
    this.update({ state: 'idle', elapsedSeconds: 0, level: 0, result: null });
  }

  destroy(): void {
    this.release();
    this.snapshot = { state: 'idle', elapsedSeconds: 0, level: 0, result: null };
  }

  private update(patch: Partial<VoiceRecorderSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.onChange({ ...this.snapshot });
  }

  private elapsedMs(): number {
    return this.startedAt > 0 ? Date.now() - this.startedAt : 0;
  }

  private startLevelMeter(stream: MediaStream): void {
    const w = typeof window === 'undefined' ? null : (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext });
    const Ctor = w?.AudioContext ?? w?.webkitAudioContext;
    if (!Ctor) return;
    try {
      const context = new Ctor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      context.createMediaStreamSource(stream).connect(analyser);
      void context.resume().catch(() => undefined);
      this.audioContext = context;
      this.analyser = analyser;
      const data = new Uint8Array(analyser.frequencyBinCount);
      this.levelTimer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const centered = ((data[i] ?? 128) - 128) / 128;
          sum += centered * centered;
        }
        this.update({ level: Math.min(1, Math.sqrt(sum / data.length) * 3.2) });
      }, LEVEL_MS);
    } catch {
      // No level meter; recording still works.
    }
  }

  private clearTimers(): void {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.levelTimer) clearInterval(this.levelTimer);
    if (this.maxTimer) clearTimeout(this.maxTimer);
    this.tickTimer = null;
    this.levelTimer = null;
    this.maxTimer = null;
  }

  private releaseMedia(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.analyser = null;
    if (this.audioContext) {
      void this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }
    this.startedAt = 0;
  }

  private release(): void {
    this.clearTimers();
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      try {
        this.recorder.stop();
      } catch {
        // already stopped
      }
    }
    this.chunks = [];
    this.releaseMedia();
  }
}

import { vi } from 'vitest';

/**
 * Minimal `MediaRecorder` + `getUserMedia` stand-ins for jsdom, which has neither.
 * Recording "produces" one chunk per `start()`; `stop()` fires `onstop` synchronously.
 */
export interface FakeRecorderHandle {
  recorders: FakeMediaRecorder[];
  tracks: { stop: ReturnType<typeof vi.fn> }[];
}

export class FakeMediaRecorder {
  static isTypeSupported = (type: string) => type === 'audio/webm';
  state: 'inactive' | 'recording' | 'paused' = 'inactive';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(public stream: MediaStream, public options?: { mimeType?: string }) {}
  start(): void {
    this.state = 'recording';
    this.ondataavailable?.({ data: new Blob(['chunk'], { type: 'audio/webm' }) });
  }
  stop(): void {
    this.state = 'inactive';
    this.onstop?.();
  }
}

/** Installs the fakes for one test; `vi.unstubAllGlobals()` in setup removes them. */
export function installFakeMediaRecorder(options: { denyMic?: boolean } = {}): FakeRecorderHandle {
  const handle: FakeRecorderHandle = { recorders: [], tracks: [] };
  class Recorder extends FakeMediaRecorder {
    constructor(stream: MediaStream, opts?: { mimeType?: string }) {
      super(stream, opts);
      handle.recorders.push(this);
    }
  }
  vi.stubGlobal('MediaRecorder', Recorder);
  const getUserMedia = vi.fn(async () => {
    if (options.denyMic) {
      throw new DOMException('denied', 'NotAllowedError');
    }
    const track = { stop: vi.fn() };
    handle.tracks.push(track);
    return { getTracks: () => [track] } as unknown as MediaStream;
  });
  vi.stubGlobal('navigator', { ...navigator, mediaDevices: { getUserMedia } });
  return handle;
}

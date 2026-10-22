import { vi } from 'vitest';

/**
 * jsdom has neither `matchMedia` nor `visualViewport`. `test/setup.ts` installs a
 * matchMedia that matches nothing; tests that need a phone layout or a keyboard
 * override them here. `vi.unstubAllGlobals()` in setup removes both after each test.
 */
export function stubMatchMedia(matches: boolean): void {
  vi.stubGlobal('matchMedia', (query: string): MediaQueryList => {
    const list = new EventTarget() as MediaQueryList;
    Object.assign(list, {
      matches,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    });
    return list;
  });
}

export interface FakeVisualViewport extends EventTarget {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
  /** Change the visible area and fire `resize`, as a keyboard opening or closing does. */
  resizeTo(size: { width?: number; height?: number; offsetTop?: number }): void;
}

export function stubVisualViewport(width: number, height: number): FakeVisualViewport {
  const viewport = new EventTarget() as FakeVisualViewport;
  Object.assign(viewport, {
    width,
    height,
    offsetTop: 0,
    offsetLeft: 0,
    resizeTo(size: { width?: number; height?: number; offsetTop?: number }) {
      Object.assign(viewport, size);
      viewport.dispatchEvent(new Event('resize'));
    },
  });
  vi.spyOn(viewport, 'addEventListener');
  vi.spyOn(viewport, 'removeEventListener');
  vi.stubGlobal('visualViewport', viewport);
  return viewport;
}

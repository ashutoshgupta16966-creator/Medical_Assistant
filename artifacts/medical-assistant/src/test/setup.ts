import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

if (typeof window !== 'undefined') {
  // Mock Image onload for jsdom test environment
  Object.defineProperty(globalThis.Image.prototype, 'src', {
    set(_src) {
      setTimeout(() => {
        if (this.onload) this.onload(new Event('load'));
      }, 0);
    },
  });

  // Mock canvas 2d context and toDataURL if not provided in jsdom
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: any[]) {
    if (contextId === '2d') {
      return {
        drawImage: () => {},
        fillRect: () => {},
        fillText: () => {},
        measureText: () => ({ width: 100 }),
        roundRect: () => {},
      } as any;
    }
    return originalGetContext ? originalGetContext.apply(this, [contextId, ...args] as any) : null;
  };

  HTMLCanvasElement.prototype.toDataURL = function () {
    return 'data:image/jpeg;base64,mockcompresseddata';
  };
}

afterEach(() => {
  cleanup();
});
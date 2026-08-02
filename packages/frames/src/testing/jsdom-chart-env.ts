/**
 * The jsdom stubs a D3 chart frame needs before it will render anything.
 *
 * jsdom has no layout, no IntersectionObserver/ResizeObserver and no SVG
 * geometry, and the chart layer depends on all three: it measures its container
 * to compute scales (a 0-width container renders no chart at all), it gates
 * polling on visibility, and it measures its own path to animate the draw-in.
 * Without these a chart frame renders an empty card and every DOM assertion
 * quietly passes against nothing.
 *
 * Call `installChartEnv()` in `beforeAll` and the returned restore fn in
 * `afterAll` — vitest gives each file its own jsdom, but a sized
 * `getBoundingClientRect` is exactly the stub that would silently change what a
 * neighbouring suite measures if that ever stopped being true.
 */
export function installChartEnv({
  width = 640,
  height = 320,
} = {}): () => void {
  const originals = new Map<string, PropertyDescriptor | undefined>();
  const remember = (target: object, key: string, label: string) => {
    originals.set(label, Object.getOwnPropertyDescriptor(target, key));
  };

  const g = globalThis as unknown as Record<string, unknown>;
  remember(g, "IntersectionObserver", "g.IntersectionObserver");
  remember(g, "ResizeObserver", "g.ResizeObserver");
  remember(Element.prototype, "getBoundingClientRect", "el.rect");
  const svg = SVGElement.prototype as unknown as Record<string, unknown>;
  for (const key of ["getTotalLength", "getPointAtLength", "getBBox"]) {
    remember(SVGElement.prototype, key, `svg.${key}`);
  }

  /** Reports a real size the moment it's observed, so measurement resolves. */
  class SizedObserver {
    constructor(private cb?: (entries: unknown[], obs: unknown) => void) {}
    observe(target?: unknown) {
      this.cb?.(
        [{ target, isIntersecting: true, contentRect: { width, height } }],
        this,
      );
    }
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  g.IntersectionObserver = SizedObserver;
  g.ResizeObserver = SizedObserver;

  Element.prototype.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON() {},
    }) as DOMRect;

  svg.getTotalLength = () => 0;
  svg.getPointAtLength = () => ({ x: 0, y: 0 });
  svg.getBBox = () => ({ x: 0, y: 0, width, height });

  return () => {
    const restore = (target: object, key: string, label: string) => {
      const descriptor = originals.get(label);
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else delete (target as Record<string, unknown>)[key];
    };
    restore(g, "IntersectionObserver", "g.IntersectionObserver");
    restore(g, "ResizeObserver", "g.ResizeObserver");
    restore(Element.prototype, "getBoundingClientRect", "el.rect");
    for (const key of ["getTotalLength", "getPointAtLength", "getBBox"]) {
      restore(SVGElement.prototype, key, `svg.${key}`);
    }
  };
}

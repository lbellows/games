/**
 * A minimal but *strict* CanvasRenderingContext2D stand-in for the headless smoke test.
 * Only real canvas API members are implemented; touching anything else throws, so the test
 * catches typos in drawing code that TypeScript cannot (e.g. ctx.fillCircle).
 */
const METHODS = [
  'save', 'restore', 'scale', 'rotate', 'translate', 'transform', 'setTransform', 'resetTransform',
  'beginPath', 'closePath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'arc',
  'arcTo', 'ellipse', 'rect', 'roundRect', 'fill', 'stroke', 'clip', 'isPointInPath',
  'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage', 'putImageData',
  'setLineDash', 'getLineDash', 'createPattern', 'createImageData', 'getImageData',
];

const PROPS = {
  fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
  globalAlpha: 1, globalCompositeOperation: 'source-over', font: '10px sans-serif',
  textAlign: 'start', textBaseline: 'alphabetic', letterSpacing: '0px', shadowColor: 'transparent',
  shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, imageSmoothingEnabled: true, miterLimit: 10,
  lineDashOffset: 0, filter: 'none', direction: 'inherit',
};

export function createContextStub(canvas) {
  const target = { canvas, ...PROPS, calls: 0 };
  // Layout tracking: records text drawn while the transform is identity, so the smoke test
  // can assert HUD/menu copy stays inside the 1280x720 frame.
  const stack = [];
  let transformed = false;
  target.texts = [];
  target.recording = false;
  for (const name of METHODS) {
    target[name] = () => {
      target.calls++;
      return undefined;
    };
  }
  target.save = () => {
    stack.push(transformed);
  };
  target.restore = () => {
    transformed = stack.length > 0 ? stack.pop() : false;
  };
  for (const name of ['translate', 'rotate', 'scale', 'transform', 'setTransform']) {
    target[name] = () => {
      transformed = true;
    };
  }
  target.fillText = (value, x, y) => {
    if (target.recording && !transformed) {
      target.texts.push({ value: String(value), x, y, font: target.font, align: target.textAlign });
    }
  };
  target.measureText = (t) => ({ width: String(t).length * 6, actualBoundingBoxAscent: 8 });
  const gradient = { addColorStop: () => {} };
  target.createLinearGradient = () => gradient;
  target.createRadialGradient = () => gradient;
  target.createConicGradient = () => gradient;

  return new Proxy(target, {
    get(obj, prop) {
      if (prop in obj) return obj[prop];
      if (typeof prop === 'symbol') return undefined;
      throw new Error(`canvas stub: unsupported 2D context member "${String(prop)}"`);
    },
    set(obj, prop, value) {
      if (!(prop in obj)) throw new Error(`canvas stub: unsupported 2D context property "${String(prop)}"`);
      obj[prop] = value;
      return true;
    },
  });
}

/** Installs the DOM/storage globals the game modules touch. */
export function installDomStubs() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (i) => [...store.keys()][i] ?? null,
  };

  const makeCanvas = () => {
    const canvas = { width: 0, height: 0 };
    canvas.getContext = () => createContextStub(canvas);
    return canvas;
  };
  globalThis.document = {
    createElement: (tag) => {
      if (tag !== 'canvas') throw new Error(`canvas stub: unexpected createElement(${tag})`);
      return makeCanvas();
    },
  };
  return { store, context: createContextStub(makeCanvas()) };
}

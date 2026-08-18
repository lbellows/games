import { VIEW } from '../config.ts';
import { norm, type Vec } from './math.ts';

const MOVE_LEFT = ['KeyA', 'ArrowLeft'];
const MOVE_RIGHT = ['KeyD', 'ArrowRight'];
const MOVE_UP = ['KeyW', 'ArrowUp'];
const MOVE_DOWN = ['KeyS', 'ArrowDown'];
const SPRAY_KEYS = ['Space'];
/** Keys we swallow so the page never scrolls mid-fight. */
const SWALLOW = new Set([...MOVE_LEFT, ...MOVE_RIGHT, ...MOVE_UP, ...MOVE_DOWN, ...SPRAY_KEYS]);

/** How long after the last mouse move we keep trusting the mouse for aiming. */
const POINTER_TRUST = 2.5;

export interface Click {
  x: number;
  y: number;
}

/**
 * Keyboard + mouse state. Pointer coordinates are converted into the game's fixed
 * 1280x720 logical space, so letterboxing and window scaling are invisible to gameplay.
 */
export class Input {
  readonly pointer: Vec = { x: VIEW.w / 2, y: VIEW.h / 2 };
  pointerDown = false;
  /** Seconds since the mouse last moved; starts "stale" so keyboard-only play works instantly. */
  private pointerIdle = POINTER_TRUST + 1;
  private hasSeenPointer = false;

  private readonly held = new Set<string>();
  private readonly pressed = new Set<string>();
  private clicks: Click[] = [];
  private canvas: HTMLCanvasElement | null = null;
  private detachers: Array<() => void> = [];

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const on = <K extends keyof WindowEventMap>(
      target: Window | HTMLCanvasElement,
      type: K,
      handler: (ev: WindowEventMap[K]) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      target.addEventListener(type, handler as EventListener, opts);
      this.detachers.push(() => target.removeEventListener(type, handler as EventListener));
    };

    on(window, 'keydown', (e) => {
      if (e.repeat) {
        if (SWALLOW.has(e.code)) e.preventDefault();
        return;
      }
      if (SWALLOW.has(e.code)) e.preventDefault();
      this.held.add(e.code);
      this.pressed.add(e.code);
    });
    on(window, 'keyup', (e) => {
      this.held.delete(e.code);
    });
    on(window, 'blur', () => {
      this.held.clear();
      this.pointerDown = false;
    });
    on(canvas, 'mousemove', (e) => {
      this.setPointerFromEvent(e);
      this.pointerIdle = 0;
      this.hasSeenPointer = true;
    });
    on(canvas, 'mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.setPointerFromEvent(e);
      this.pointerIdle = 0;
      this.hasSeenPointer = true;
      this.pointerDown = true;
      this.clicks.push({ x: this.pointer.x, y: this.pointer.y });
    });
    on(window, 'mouseup', (e) => {
      if (e.button === 0) this.pointerDown = false;
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
  }

  detach(): void {
    for (const off of this.detachers) off();
    this.detachers = [];
    this.canvas = null;
  }

  private setPointerFromEvent(e: MouseEvent): void {
    const rect = this.canvas?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * VIEW.w;
    this.pointer.y = ((e.clientY - rect.top) / rect.height) * VIEW.h;
  }

  /** Advances pointer-idle bookkeeping. Call once per update step. */
  tick(dt: number): void {
    this.pointerIdle += dt;
  }

  /** Clears per-frame edge state. Call at the very end of a frame. */
  endFrame(): void {
    this.pressed.clear();
    this.clicks.length = 0;
  }

  isDown(...codes: string[]): boolean {
    return codes.some((c) => this.held.has(c));
  }

  wasPressed(...codes: string[]): boolean {
    return codes.some((c) => this.pressed.has(c));
  }

  anyPressed(): boolean {
    return this.pressed.size > 0;
  }

  /** Normalised movement direction from WASD / arrow keys. */
  moveVector(): Vec {
    let x = 0;
    let y = 0;
    if (this.isDown(...MOVE_LEFT)) x -= 1;
    if (this.isDown(...MOVE_RIGHT)) x += 1;
    if (this.isDown(...MOVE_UP)) y -= 1;
    if (this.isDown(...MOVE_DOWN)) y += 1;
    return norm(x, y);
  }

  get sprayHeld(): boolean {
    return this.pointerDown || this.isDown(...SPRAY_KEYS);
  }

  /** True while the mouse is a trustworthy aim source. */
  get pointerIsFresh(): boolean {
    return this.hasSeenPointer && (this.pointerDown || this.pointerIdle < POINTER_TRUST);
  }

  takeClicks(): readonly Click[] {
    return this.clicks;
  }

  /** Test-only helper: lets the headless smoke test drive the game without a DOM. */
  debugSet(state: {
    held?: readonly string[];
    pressed?: readonly string[];
    pointer?: Vec;
    pointerDown?: boolean;
    click?: Click;
  }): void {
    if (state.held) {
      this.held.clear();
      for (const c of state.held) this.held.add(c);
    }
    if (state.pressed) for (const c of state.pressed) this.pressed.add(c);
    if (state.pointer) {
      this.pointer.x = state.pointer.x;
      this.pointer.y = state.pointer.y;
      this.pointerIdle = 0;
      this.hasSeenPointer = true;
    }
    if (state.pointerDown !== undefined) this.pointerDown = state.pointerDown;
    if (state.click) this.clicks.push(state.click);
  }
}

import { rand } from './math.ts';

/** Screen-shake only "camera": stores an offset that decays over time. */
export class Camera {
  x = 0;
  y = 0;
  private power = 0;

  shake(power: number): void {
    this.power = Math.min(26, Math.max(this.power, power));
  }

  update(dt: number): void {
    this.power = Math.max(0, this.power - this.power * 7.5 * dt - 6 * dt);
    if (this.power < 0.05) {
      this.power = 0;
      this.x = 0;
      this.y = 0;
      return;
    }
    this.x = rand(-this.power, this.power);
    this.y = rand(-this.power, this.power);
  }

  reset(): void {
    this.power = 0;
    this.x = 0;
    this.y = 0;
  }
}

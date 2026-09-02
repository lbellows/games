/**
 * Uniform spatial hash over the playfield. Arena swarms push the enemy count into the hundreds,
 * where pairwise separation and cone queries would be O(n^2); this keeps both near O(n).
 * Rebuilt from scratch every frame — cheap, and avoids stale-cell bookkeeping.
 */
export interface GridItem {
  x: number;
  y: number;
  radius: number;
}

const CELL = 56;

export class SpatialGrid {
  private readonly cells = new Map<number, number[]>();
  private items: readonly GridItem[] = [];

  private key(cx: number, cy: number): number {
    // 16-bit interleave: the field is far smaller than 65k cells per axis.
    return ((cx + 4096) << 13) | (cy + 4096);
  }

  rebuild(items: readonly GridItem[]): void {
    this.cells.clear();
    this.items = items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as GridItem;
      const k = this.key(Math.floor(item.x / CELL), Math.floor(item.y / CELL));
      const bucket = this.cells.get(k);
      if (bucket) bucket.push(i);
      else this.cells.set(k, [i]);
    }
  }

  /** Calls `visit` with the index of every item whose cell overlaps the query circle. */
  query(x: number, y: number, radius: number, visit: (index: number) => void): void {
    const minX = Math.floor((x - radius) / CELL);
    const maxX = Math.floor((x + radius) / CELL);
    const minY = Math.floor((y - radius) / CELL);
    const maxY = Math.floor((y + radius) / CELL);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const bucket = this.cells.get(this.key(cx, cy));
        if (!bucket) continue;
        for (const index of bucket) visit(index);
      }
    }
  }

  /**
   * Visits each nearby pair exactly once (index a < index b), for symmetric work like separation.
   */
  pairs(visit: (a: number, b: number) => void): void {
    const items = this.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i] as GridItem;
      this.query(item.x, item.y, item.radius * 2 + CELL * 0.5, (j) => {
        if (j > i) visit(i, j);
      });
    }
  }
}

// Dijkstra / A* / weighted A* on the road graph. One function, the heuristic
// weight picks the algorithm: 0 = Dijkstra, 1 = A* (straight-line, admissible),
// >1 = weighted A* (faster, not guaranteed optimal).
import { other, type RoadGraph } from "./graph";

export type SearchResult = {
  hWeight: number;
  settled: number[]; // nodes in the order they were popped (finalized)
  settledEdge: number[]; // edge used to reach settled[i] (-1 for the start)
  path: number[]; // start .. goal
  pathEdges: number[];
  pathLength: number; // meters
  pushes: number;
};

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const k = this.k;
    const v = this.v;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  pop(): number {
    const k = this.k;
    const v = this.v;
    const top = v[0];
    const lk = k.pop()!;
    const lv = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    return top;
  }
}

export const search = (g: RoadGraph, s: number, t: number, hWeight: number): SearchResult => {
  const dist = new Float64Array(g.n).fill(Infinity);
  const via = new Int32Array(g.n).fill(-1);
  const done = new Uint8Array(g.n);
  const h = (u: number) => hWeight * Math.hypot(g.x[u] - g.x[t], g.y[u] - g.y[t]);
  const heap = new MinHeap();
  const settled: number[] = [];
  const settledEdge: number[] = [];
  dist[s] = 0;
  heap.push(h(s), s);
  let pushes = 1;
  while (heap.size) {
    const u = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    settled.push(u);
    settledEdge.push(via[u]);
    if (u === t) break;
    for (const e of g.adj[u]) {
      const w = other(g, e, u);
      if (done[w]) continue;
      const nd = dist[u] + g.elen[e];
      if (nd < dist[w]) {
        dist[w] = nd;
        via[w] = e;
        heap.push(nd + h(w), w);
        pushes++;
      }
    }
  }
  const path = [t];
  const pathEdges: number[] = [];
  while (path[path.length - 1] !== s) {
    const u = path[path.length - 1];
    pathEdges.push(via[u]);
    path.push(other(g, via[u], u));
  }
  path.reverse();
  pathEdges.reverse();
  return { hWeight, settled, settledEdge, path, pathEdges, pathLength: dist[t], pushes };
};

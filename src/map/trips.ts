// The trips shown in the video and every number derived from them.
// Computed once at module load (pure + deterministic).
import { CITY, nodeNear, other } from "./graph";
import { search, type SearchResult } from "./search";

export type Trip = {
  s: number;
  t: number;
  fromName: string;
  toName: string;
  dij: SearchResult; // h x 0
  astar: SearchResult; // h x 1
  greedy: SearchResult; // h x 3
};

const trip = (from: [number, number], to: [number, number], fromName: string, toName: string): Trip => {
  const s = nodeNear(CITY, ...from);
  const t = nodeNear(CITY, ...to);
  return { s, t, fromName, toName, dij: search(CITY, s, t, 0), astar: search(CITY, s, t, 1), greedy: search(CITY, s, t, 3) };
};

export const RACE1 = trip([40.7033, -74.017], [40.758, -73.9855], "Battery Park", "Times Square");
export const RACE2 = trip([40.7447, -73.9485], [40.734, -74.005], "Long Island City", "West Village");

export const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
export const km = (m: number) => `${(m / 1000).toFixed(2)} km`;
export const ratio = (t: Trip) => t.dij.settled.length / t.astar.settled.length;

export const straight = (a: number, b: number) => Math.hypot(CITY.x[a] - CITY.x[b], CITY.y[a] - CITY.y[b]);

// Tree path (start .. u) inside a finished search, as node ids
export const treePath = (r: SearchResult, u: number) => {
  const via = new Map<number, number>();
  r.settled.forEach((v, i) => via.set(v, r.settledEdge[i]));
  const out = [u];
  let cur = u;
  while (via.has(cur) && via.get(cur)! >= 0) {
    cur = other(CITY, via.get(cur)!, cur);
    out.push(cur);
  }
  return out.reverse();
};

const gOf = (path: number[]) => {
  let g = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const e = CITY.adj[a].find((e) => other(CITY, e, a) === b)!;
    g += CITY.elen[e];
  }
  return g;
};

// "Why" scene: a node on the A* route (good) vs a node Dijkstra explored but A*
// skipped, with a similar g but far from the goal (bad).
export type Probe = { node: number; path: number[]; g: number; h: number };
const pickProbes = (tr: Trip): { good: Probe; bad: Probe } => {
  const route = tr.astar.path;
  const goodNode = route[Math.floor(route.length * 0.42)];
  const goodPath = treePath(tr.dij, goodNode);
  const gGood = gOf(goodPath);
  const inA = new Set(tr.astar.settled);
  let bad = tr.s;
  let bestH = -1;
  for (const v of tr.dij.settled) {
    if (inA.has(v)) continue;
    const p = treePath(tr.dij, v);
    const g = gOf(p);
    if (Math.abs(g - gGood) > 250) continue;
    const h = straight(v, tr.t);
    if (h > bestH) {
      bestH = h;
      bad = v;
    }
  }
  const badPath = treePath(tr.dij, bad);
  return {
    good: { node: goodNode, path: goodPath, g: gGood, h: straight(goodNode, tr.t) },
    bad: { node: bad, path: badPath, g: gOf(badPath), h: straight(bad, tr.t) },
  };
};
export const PROBES = pickProbes(RACE1);

// Convex hull (monotone chain) of the explored nodes, in meters
export const hull = (nodes: number[]): [number, number][] => {
  const pts = nodes.map((v) => [CITY.x[v], CITY.y[v]] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
};

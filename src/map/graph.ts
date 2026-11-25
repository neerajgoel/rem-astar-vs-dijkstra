// Real road graph of Lower/Midtown Manhattan (+ Downtown Brooklyn, LIC).
// Built by scripts/fetch-osm.mjs from OpenStreetMap (© OpenStreetMap contributors, ODbL).
import raw from "./data/manhattan.json";

export type RoadGraph = {
  width: number; // meters
  height: number;
  n: number;
  x: Float64Array; // node position in meters (north up)
  y: Float64Array;
  // edges: endpoints, length (m), interior polyline points
  ea: Int32Array;
  eb: Int32Array;
  elen: Float64Array;
  epts: number[][];
  // adjacency: neighbours of u are adj[u] (edge indices)
  adj: number[][];
};

type Raw = { bbox: { s: number; w: number; n: number; e: number }; width: number; height: number; nodes: number[]; edges: number[][] };

const build = (r: Raw): RoadGraph => {
  const n = r.nodes.length / 2;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = r.nodes[2 * i];
    y[i] = r.nodes[2 * i + 1];
  }
  const m = r.edges.length;
  const ea = new Int32Array(m);
  const eb = new Int32Array(m);
  const elen = new Float64Array(m);
  const epts: number[][] = [];
  const adj: number[][] = Array.from({ length: n }, () => []);
  r.edges.forEach((e, i) => {
    ea[i] = e[0];
    eb[i] = e[1];
    elen[i] = Math.max(1, e[2]);
    epts.push(e.slice(3));
    adj[e[0]].push(i);
    adj[e[1]].push(i);
  });
  return { width: r.width, height: r.height, n, x, y, ea, eb, elen, epts, adj };
};

export const BBOX = (raw as Raw).bbox;
export const CITY: RoadGraph = build(raw as Raw);

// Nearest graph node to a lat/lon (same projection as fetch-osm.mjs)
export const nodeNear = (g: RoadGraph, lat: number, lon: number) => {
  const lat0 = (BBOX.s + BBOX.n) / 2;
  const px = (lon - BBOX.w) * Math.cos((lat0 * Math.PI) / 180) * 111320;
  const py = (BBOX.n - lat) * 110574;
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < g.n; i++) {
    const d = (g.x[i] - px) ** 2 + (g.y[i] - py) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
};

export const other = (g: RoadGraph, e: number, u: number) => (g.ea[e] === u ? g.eb[e] : g.ea[e]);

// SVG renderer for the real road graph: dim base roads, the explored search
// tree (bucketed heat colors), frontier glow, route draw-on and pins.
// Everything is drawn in meters via the viewBox; strokes stay in pixels.
import React from "react";
import { interpolateColors } from "remotion";
import { CITY } from "./graph";
import type { SearchResult } from "./search";

const g = CITY;

const edgeD = (e: number, from?: number) => {
  const pts: number[] = [g.x[g.ea[e]], g.y[g.ea[e]], ...g.epts[e], g.x[g.eb[e]], g.y[g.eb[e]]];
  const xy: [number, number][] = [];
  for (let i = 0; i < pts.length; i += 2) xy.push([pts[i], pts[i + 1]]);
  if (from !== undefined && g.eb[e] === from) xy.reverse();
  return xy;
};
const toD = (xy: [number, number][], move = true) =>
  xy.map(([x, y], i) => `${i === 0 && move ? "M" : "L"}${Math.round(x)} ${Math.round(y)}`).join("");

const BASE_D = Array.from({ length: g.ea.length }, (_, e) => toD(edgeD(e))).join("");

// Per search result: one path string per settled node (edge used to reach it), bucketed
const BUCKET = 50;
type Prepared = { segs: string[]; buckets: string[] };
const cache = new WeakMap<SearchResult, Prepared>();
const prep = (r: SearchResult): Prepared => {
  let p = cache.get(r);
  if (!p) {
    const segs = r.settledEdge.map((e) => (e < 0 ? "" : toD(edgeD(e))));
    const buckets: string[] = [];
    for (let i = 0; i < segs.length; i += BUCKET) buckets.push(segs.slice(i, i + BUCKET).join(""));
    p = { segs, buckets };
    cache.set(r, p);
  }
  return p;
};

const routeCache = new WeakMap<SearchResult, string>();
export const routeD = (r: SearchResult) => {
  let d = routeCache.get(r);
  if (!d) {
    d = r.pathEdges.map((e, i) => toD(edgeD(e, r.path[i]), i === 0)).join("");
    routeCache.set(r, d);
  }
  return d;
};
export const nodePathD = (nodes: number[]) => {
  const parts: string[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const a = nodes[i - 1];
    const b = nodes[i];
    const e = g.adj[a].find((e) => g.ea[e] === b || g.eb[e] === b)!;
    parts.push(toD(edgeD(e, a), i === 1));
  }
  return parts.join("");
};

export type Camera = { cx: number; cy: number; zoom: number };
export const FULL: Camera = { cx: g.width / 2, cy: g.height / 2, zoom: 1 };
export const camAt = (node: number, zoom: number): Camera => ({ cx: g.x[node], cy: g.y[node], zoom });
export const lerpCam = (a: Camera, b: Camera, t: number): Camera => ({
  cx: a.cx + (b.cx - a.cx) * t,
  cy: a.cy + (b.cy - a.cy) * t,
  // zoom interpolated in log space so it feels linear
  zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * t),
});

export type CityMapProps = {
  w: number;
  h: number;
  cam?: Camera;
  run?: SearchResult;
  count?: number; // nodes settled so far
  palette: string[];
  route?: SearchResult;
  routeP?: number; // 0..1 draw-on
  routeColor?: string;
  start?: number;
  goal?: number;
  pinsP?: number; // 0..1 pin drop
  reveal?: number; // 0..1 radial reveal of the base map
  showNodes?: number; // 0..1 opacity of intersection dots
  baseColor?: string;
  frame: number;
  overlay?: (mpp: number) => React.ReactNode; // extra SVG in meter coords
};

export const CityMap: React.FC<CityMapProps> = ({
  w,
  h,
  cam = FULL,
  run,
  count = 0,
  palette,
  route,
  routeP = 0,
  routeColor = "#39ff14",
  start,
  goal,
  pinsP = 1,
  reveal = 1,
  showNodes = 0,
  baseColor = "#24306e",
  frame,
  overlay,
}) => {
  const mpp = Math.max(g.width / w, g.height / h) / cam.zoom; // meters per pixel
  const vb = [cam.cx - (w * mpp) / 2, cam.cy - (h * mpp) / 2, w * mpp, h * mpp];
  const clipId = `reveal-${w}-${h}`;
  const p = run ? prep(run) : null;
  const n = run ? Math.max(0, Math.min(run.settled.length, Math.floor(count))) : 0;
  const full = Math.floor(n / BUCKET);
  const nb = p ? p.buckets.length : 1;
  const heat = (k: number) => interpolateColors(nb <= 1 ? 0 : k / (nb - 1), palette.map((_, i) => i / (palette.length - 1)), palette);
  const radius = Math.hypot(g.width, g.height) * reveal * 0.62;

  const visibleNodes: number[] = [];
  if (showNodes > 0) {
    for (let i = 0; i < g.n; i++) {
      if (g.x[i] > vb[0] && g.x[i] < vb[0] + vb[2] && g.y[i] > vb[1] && g.y[i] < vb[1] + vb[3]) visibleNodes.push(i);
    }
  }
  const S = { vectorEffect: "non-scaling-stroke" as const, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

  return (
    <svg width={w} height={h} viewBox={vb.join(" ")} style={{ display: "block", overflow: "hidden" }}>
      <defs>
        <clipPath id={clipId}>
          <circle cx={g.width / 2} cy={g.height / 2} r={radius} />
        </clipPath>
      </defs>
      <g clipPath={reveal < 1 ? `url(#${clipId})` : undefined}>
        <path d={BASE_D} stroke={baseColor} strokeWidth={4} opacity={0.35} {...S} />
        <path d={BASE_D} stroke={baseColor} strokeWidth={1.3} {...S} />
      </g>
      {p ? (
        <g>
          {p.buckets.slice(0, full).map((d, k) => (
            <path key={k} d={d} stroke={heat(k)} strokeWidth={2.4} {...S} />
          ))}
          {n % BUCKET ? <path d={p.segs.slice(full * BUCKET, n).join("")} stroke={heat(full)} strokeWidth={2.4} {...S} /> : null}
          {run && n < run.settled.length && n > 0
            ? run.settled.slice(Math.max(0, n - 36), n).map((v, i, arr) => {
                const age = (arr.length - 1 - i) / arr.length;
                return <circle key={v} cx={g.x[v]} cy={g.y[v]} r={(3.5 + (1 - age) * 3) * mpp} fill="#ffffff" opacity={0.9 * (1 - age)} />;
              })
            : null}
        </g>
      ) : null}
      {showNodes > 0
        ? visibleNodes.map((v) => (
            <circle key={v} cx={g.x[v]} cy={g.y[v]} r={5 * mpp} fill="#ffe600" stroke="#000" strokeWidth={1} opacity={showNodes} {...{ vectorEffect: "non-scaling-stroke" }} />
          ))
        : null}
      {route && routeP > 0 ? (
        <g>
          <path d={routeD(route)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - routeP} stroke={routeColor} strokeWidth={16} opacity={0.25} {...S} />
          <path d={routeD(route)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - routeP} stroke={routeColor} strokeWidth={6} {...S} />
          <path d={routeD(route)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - routeP} stroke="#ffffff" strokeWidth={1.6} {...S} />
        </g>
      ) : null}
      {overlay ? overlay(mpp) : null}
      {start !== undefined ? <Pin node={start} mpp={mpp} color="#00ff9d" label="START" p={pinsP} frame={frame} /> : null}
      {goal !== undefined ? <Pin node={goal} mpp={mpp} color="#ff1744" label="GOAL" p={Math.max(0, pinsP * 1.25 - 0.25)} frame={frame} /> : null}
    </svg>
  );
};

const Pin: React.FC<{ node: number; mpp: number; color: string; label: string; p: number; frame: number }> = ({ node, mpp, color, label, p, frame }) => {
  if (p <= 0) return null;
  const x = g.x[node];
  const y = g.y[node];
  const drop = (1 - Math.min(1, p)) * 120 * mpp;
  const pulse = (frame % 40) / 40;
  const s = mpp; // 1 px in meters
  return (
    <g opacity={Math.min(1, p * 2)}>
      <circle cx={x} cy={y} r={(10 + pulse * 26) * s} fill="none" stroke={color} strokeWidth={3} opacity={1 - pulse} style={{ vectorEffect: "non-scaling-stroke" }} />
      <g transform={`translate(${x} ${y - drop})`}>
        <path
          d={`M0 0 C ${-6 * s} ${-12 * s} ${-16 * s} ${-18 * s} ${-16 * s} ${-30 * s} A ${16 * s} ${16 * s} 0 1 1 ${16 * s} ${-30 * s} C ${16 * s} ${-18 * s} ${6 * s} ${-12 * s} 0 0 Z`}
          fill={color}
          stroke="#ffffff"
          strokeWidth={2.5}
          style={{ vectorEffect: "non-scaling-stroke", filter: `drop-shadow(0 0 ${6 * s}px ${color})` }}
        />
        <circle cx={0} cy={-30 * s} r={6 * s} fill="#0a0a1a" />
        <text x={0} y={-54 * s} fontSize={18 * s} fontWeight={900} textAnchor="middle" fill="#ffffff" stroke="#000" strokeWidth={4 * s} paintOrder="stroke" style={{ fontFamily: "Inter, sans-serif" }}>
          {label}
        </text>
      </g>
    </g>
  );
};

export const nodeXY = (v: number): [number, number] => [g.x[v], g.y[v]];

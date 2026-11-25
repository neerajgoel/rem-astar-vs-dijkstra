// 16:9 deep dive: Dijkstra (left) vs A* (right) on the real Manhattan road
// graph. Hook → setup → race 1 → why (g, h, f, circle vs cone) → race 2 →
// heuristic dial (h x0 / x1 / x3) → cheat sheet → outro.
import { Audio } from "@remotion/media";
import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { anton, inter, mono } from "../theme";
import { camAt, CityMap, FULL, lerpCam, nodePathD, nodeXY, routeD } from "./CityMap";
import { CITY } from "./graph";
import type { SearchResult } from "./search";
import { fmt, hull, km, PROBES, RACE1, RACE2, ratio, type Trip } from "./trips";

// ---- Timeline (30 fps) ----
export const T = {
  hook: 0,
  setup: 240,
  race1: 720,
  why: 1800,
  whyB: 2100,
  whyC: 2520,
  whyD: 2850,
  race2: 3150,
  dial: 3900,
  sheet: 4800,
  outro: 5220,
  end: 5400,
};
export const VIDEO_DURATION = T.end;

// A race: countdown, then both sides pop nodes on the same clock
// count(t) = c1 t + c2 t^2, solved so the fast side finishes at t1 and the slow at t2
type Race = { go: number; c1: number; c2: number };
const makeRace = (go: number, t1: number, n1: number, t2: number, n2: number): Race => {
  const c2 = (n2 - (n1 * t2) / t1) / (t2 * t2 - t1 * t2);
  return { go, c1: (n1 - c2 * t1 * t1) / t1, c2 };
};
const countAt = (r: Race, frame: number) => {
  const t = Math.max(0, frame - r.go);
  return r.c1 * t + r.c2 * t * t;
};
const doneAt = (r: Race, n: number) => {
  const { c1, c2 } = r;
  return r.go + Math.ceil((-c1 + Math.sqrt(c1 * c1 + 4 * c2 * n)) / (2 * c2));
};
const R1 = makeRace(T.race1 + 90, 180, RACE1.astar.settled.length, 480, RACE1.dij.settled.length);
const R2 = makeRace(T.race2 + 90, 150, RACE2.astar.settled.length, 390, RACE2.dij.settled.length);
const RD = makeRace(T.dial + 90, 170, RACE1.astar.settled.length, 420, RACE1.dij.settled.length);

// ---- Look ----
const DIJ = {
  name: "DIJKSTRA",
  tag: "picks the smallest g(n)",
  main: "#00e5ff",
  palette: ["#00e5ff", "#2f6bff", "#8a2bff"],
  bg: "radial-gradient(ellipse at 50% 45%, #062a55 0%, #050c24 60%, #02030a 100%)",
};
const AST = {
  name: "A*",
  tag: "picks the smallest g(n) + h(n)",
  main: "#ff2bd6",
  palette: ["#ff2bd6", "#ff5e3a", "#ffae00"],
  bg: "radial-gradient(ellipse at 50% 45%, #4a0a45 0%, #1a0626 60%, #07020c 100%)",
};
const GREEDY = { name: "h × 3", main: "#ffe600", palette: ["#fff200", "#b6ff00", "#00ff9d"] };
type Look = { name: string; tag?: string; main: string; palette: string[] };
const ROUTE = "#39ff14";
const G_COL = "#00e5ff";
const H_COL = "#ffe600";

const ease = Easing.bezier(0.33, 1, 0.68, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ramp = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], { ...clamp, easing: ease });
const inOut = (f: number, a: number, b: number, fade = 12) =>
  Math.min(ramp(f, a, a + fade), 1 - ramp(f, b - fade, b));

// ---- Layout (each half 960 x 1080) ----
const MAP_W = 750;
const MAP_H = 862;
const MAP_Y = 150;
const COL_W = 178;
const mapX = (left: boolean) => (left ? 960 - MAP_W - 8 : 8);
const colX = (left: boolean) => (left ? 14 : 960 - COL_W - 14);

const glow = (c: string, s = 1) => `0 0 ${18 * s}px ${c}, 0 0 ${42 * s}px ${c}, 4px 4px 0 #000`;

// ---------------------------------------------------------------------------

const Header: React.FC<{ look: Look; left: boolean; frame: number; dim?: number }> = ({ look, left, frame, dim = 0 }) => {
  const a = ramp(frame, 8, 30);
  return (
    <div
      style={{
        position: "absolute",
        top: 18,
        left: left ? 0 : 0,
        width: 960,
        textAlign: "center",
        opacity: a * (1 - dim * 0.7),
        transform: `translateY(${(1 - a) * -40}px)`,
      }}
    >
      <div style={{ fontFamily: anton, fontSize: 84, lineHeight: 1, color: look.main, textShadow: glow(look.main, 0.8), letterSpacing: 3 }}>{look.name}</div>
      <div style={{ fontFamily: mono, fontSize: 25, color: "#e8ecff", marginTop: 8, fontWeight: 700 }}>{look.tag}</div>
    </div>
  );
};

const StatBox: React.FC<{ label: string; value: string; color: string; small?: boolean }> = ({ label, value, color, small }) => (
  <div style={{ marginBottom: 22 }}>
    <div style={{ fontFamily: inter, fontWeight: 800, fontSize: 17, letterSpacing: 2, color: "#9aa3d8" }}>{label}</div>
    <div style={{ fontFamily: anton, fontSize: small ? 34 : 52, lineHeight: 1.1, color, textShadow: `0 0 16px ${color}` }}>{value}</div>
  </div>
);

const Stats: React.FC<{ look: Look; left: boolean; run: SearchResult; count: number; found: boolean; opacity: number }> = ({ look, left, run, count, found, opacity }) => {
  const n = Math.min(count, run.settled.length);
  const pct = (100 * n) / CITY.n;
  return (
    <div style={{ position: "absolute", top: MAP_Y + 30, left: colX(left), width: COL_W, opacity, textAlign: left ? "left" : "right" }}>
      <StatBox label="EXPLORED" value={fmt(n)} color={look.main} />
      <div style={{ fontFamily: inter, fontWeight: 800, fontSize: 17, letterSpacing: 2, color: "#9aa3d8" }}>OF THE CITY</div>
      <div style={{ height: 16, background: "#1a1f44", borderRadius: 8, margin: "8px 0 4px", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct * 1.6)}%`, height: "100%", background: look.main, boxShadow: `0 0 14px ${look.main}`, marginLeft: left ? 0 : "auto" }} />
      </div>
      <div style={{ fontFamily: anton, fontSize: 40, color: "#fff", marginBottom: 22 }}>{pct.toFixed(1)}%</div>
      <StatBox label="ROUTE" value={found ? km(run.pathLength) : "…"} color={found ? ROUTE : "#59618f"} small />
      <div
        style={{
          display: "inline-block",
          padding: "8px 14px",
          borderRadius: 10,
          fontFamily: anton,
          fontSize: 30,
          letterSpacing: 1,
          color: found ? "#04140a" : "#fff",
          background: found ? ROUTE : "#2a2f5e",
          boxShadow: found ? `0 0 24px ${ROUTE}` : "none",
        }}
      >
        {found ? "FOUND ✓" : "SEARCHING"}
      </div>
    </div>
  );
};

const Caption: React.FC<{ frame: number; items: [number, number, React.ReactNode][] }> = ({ frame, items }) => {
  const cur = items.find(([a, b]) => frame >= a && frame < b);
  if (!cur) return null;
  const [a, b, text] = cur;
  const o = inOut(frame, a, b, 8);
  return (
    <div style={{ position: "absolute", zIndex: 11, left: 0, right: 0, bottom: 16, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          fontFamily: inter,
          fontWeight: 800,
          fontSize: 36,
          color: "#fff",
          background: "rgba(6,8,24,0.88)",
          border: "2px solid #ffffff30",
          borderRadius: 18,
          padding: "10px 30px",
          transform: `translateY(${(1 - o) * 20}px)`,
          boxShadow: "0 10px 40px #000a",
        }}
      >
        {text}
      </div>
    </div>
  );
};

const Card: React.FC<{ frame: number; from: number; to: number; children: React.ReactNode; width?: number; top?: number }> = ({ frame, from, to, children, width = 1240, top }) => {
  const { fps } = useVideoConfig();
  if (frame < from || frame >= to) return null;
  const s = spring({ frame: frame - from, fps, config: { damping: 14, stiffness: 140 } });
  const out = 1 - ramp(frame, to - 10, to);
  return (
    <AbsoluteFill style={{ zIndex: 10, background: `rgba(2,2,10,${0.6 * Math.min(1, s) * out})`, alignItems: "center", justifyContent: top === undefined ? "center" : "flex-start" }}>
      <div
        style={{
          marginTop: top,
          width,
          padding: "36px 56px",
          borderRadius: 34,
          background: "linear-gradient(160deg, #141a4a 0%, #0b0b26 55%, #2a0a35 100%)",
          border: "3px solid #ffffff22",
          boxShadow: "0 0 60px #ff2bd655, 0 0 60px #00e5ff44, 0 30px 80px #000",
          transform: `scale(${0.6 + 0.4 * s})`,
          opacity: out * Math.min(1, s * 1.5),
          color: "#fff",
          fontFamily: inter,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

const Hi: React.FC<{ c: string; children: React.ReactNode }> = ({ c, children }) => (
  <span style={{ color: c, textShadow: `0 0 14px ${c}` }}>{children}</span>
);

const Divider: React.FC<{ frame: number }> = ({ frame }) => {
  const h = ramp(frame, 0, 40) * 1080;
  const pulse = 1 + 0.06 * Math.sin(frame / 6);
  return (
    <>
      <div style={{ position: "absolute", left: 957, top: 540 - h / 2, width: 6, height: h, background: "linear-gradient(#00e5ff, #ffffff, #ff2bd6)", boxShadow: "0 0 24px #fff" }} />
      <div
        style={{
          position: "absolute",
          left: 960 - 62,
          top: 540 - 62,
          width: 124,
          height: 124,
          borderRadius: 62,
          background: "#05050f",
          border: "5px solid #fff",
          boxShadow: "0 0 30px #00e5ff, 0 0 60px #ff2bd6",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: anton,
          fontSize: 56,
          color: "#ffe600",
          transform: `scale(${ramp(frame, 20, 45) * pulse})`,
        }}
      >
        VS
      </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// One half: map + header + stats

type HalfProps = {
  left: boolean;
  look: Look;
  frame: number;
  trip: Trip;
  run?: SearchResult;
  count?: number;
  routeP?: number;
  pinsP?: number;
  cam?: Parameters<typeof CityMap>[0]["cam"];
  reveal?: number;
  showNodes?: number;
  stats?: number;
  dim?: number;
  overlay?: (mpp: number) => React.ReactNode;
  children?: React.ReactNode;
};
const Half: React.FC<HalfProps> = ({ left, look, frame, trip, run, count = 0, routeP = 0, pinsP = 0, cam, reveal, showNodes, stats = 0, dim = 0, overlay, children }) => (
  <AbsoluteFill style={{ left: left ? 0 : 960, width: 960, background: left ? DIJ.bg : AST.bg, overflow: "hidden" }}>
    <div style={{ position: "absolute", left: mapX(left), top: MAP_Y, width: MAP_W, height: MAP_H, borderRadius: 24, overflow: "hidden", border: `2px solid ${look.main}44`, boxShadow: `inset 0 0 60px #000, 0 0 30px ${look.main}33`, background: "#03040c" }}>
      <CityMap
        w={MAP_W}
        h={MAP_H}
        frame={frame}
        cam={cam}
        run={run}
        count={count}
        palette={look.palette}
        route={run && count >= run.settled.length ? run : undefined}
        routeP={routeP}
        routeColor={ROUTE}
        start={pinsP > 0 ? trip.s : undefined}
        goal={pinsP > 0 ? trip.t : undefined}
        pinsP={pinsP}
        reveal={reveal}
        showNodes={showNodes}
        overlay={overlay}
      />
      <div style={{ position: "absolute", inset: 0, background: "#02030a", opacity: dim * 0.65 }} />
    </div>
    <Header look={look} left={left} frame={frame} dim={dim} />
    {run && stats > 0 ? <Stats look={look} left={left} run={run} count={count} found={count >= run.settled.length} opacity={stats * (1 - dim * 0.6)} /> : null}
    {children}
  </AbsoluteFill>
);

// ---------------------------------------------------------------------------
// Scenes

const Hook: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  if (frame >= T.setup) return null;
  const s = spring({ frame: frame - 20, fps, config: { damping: 11 } });
  const out = 1 - ramp(frame, T.setup - 20, T.setup);
  const line2 = ramp(frame, 70, 90);
  const line3 = ramp(frame, 120, 140);
  return (
    <AbsoluteFill style={{ zIndex: 10, alignItems: "center", justifyContent: "center", opacity: out, background: `rgba(0,0,0,${0.6 * out})` }}>
      <div style={{ transform: `scale(${s})`, fontFamily: anton, fontSize: 190, lineHeight: 1, letterSpacing: 4 }}>
        <Hi c="#00e5ff">DIJKSTRA</Hi> <span style={{ color: "#ffe600", textShadow: glow("#ff6a00") }}>vs</span> <Hi c="#ff2bd6">A*</Hi>
      </div>
      <div style={{ fontFamily: inter, fontWeight: 900, fontSize: 56, color: "#fff", marginTop: 26, opacity: line2, textShadow: "0 4px 20px #000" }}>
        Same city. Same start. Same goal.
      </div>
      <div style={{ fontFamily: anton, fontSize: 84, color: "#ffe600", marginTop: 16, opacity: line3, transform: `scale(${0.8 + 0.2 * line3})`, textShadow: glow("#ff6a00", 0.7) }}>
        WHO FINDS THE ROUTE FIRST? 🏁
      </div>
    </AbsoluteFill>
  );
};

const Countdown: React.FC<{ frame: number; go: number }> = ({ frame, go }) => {
  const f = frame - (go - 90);
  if (f < 0 || f >= 110) return null;
  const idx = Math.floor(f / 30);
  const label = ["3", "2", "1", "GO!"][Math.min(3, idx)];
  const local = f - idx * 30;
  const s = interpolate(local, [0, 8, 30], [2.2, 1, 0.9], clamp);
  const o = idx === 3 ? 1 - ramp(f, 95, 110) : interpolate(local, [0, 4, 24, 30], [0, 1, 1, 0], clamp);
  const c = idx === 3 ? ROUTE : "#ffe600";
  return (
    <AbsoluteFill style={{ zIndex: 10, alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
      <div style={{ fontFamily: anton, fontSize: 300, color: c, opacity: o, transform: `scale(${s})`, textShadow: glow(c, 1.4) }}>{label}</div>
    </AbsoluteFill>
  );
};

const FoundBurst: React.FC<{ frame: number; at: number; left: boolean; text: string; color: string }> = ({ frame, at, left, text, color }) => {
  const { fps } = useVideoConfig();
  const f = frame - at;
  if (f < 0 || f > 75) return null;
  const s = spring({ frame: f, fps, config: { damping: 9, stiffness: 160 } });
  const o = 1 - ramp(frame, at + 60, at + 75);
  return (
    <div style={{ position: "absolute", left: left ? 0 : 960, width: 960, top: 430, textAlign: "center", opacity: o, transform: `scale(${s}) rotate(-4deg)` }}>
      <span style={{ fontFamily: anton, fontSize: 120, color, textShadow: glow(color, 1.2), WebkitTextStroke: "3px #000" }}>{text}</span>
    </div>
  );
};

const RaceHalves: React.FC<{ frame: number; trip: Trip; race: Race; dimLeft?: number; dimRight?: number; overlayL?: (m: number) => React.ReactNode; overlayR?: (m: number) => React.ReactNode; childrenL?: React.ReactNode; childrenR?: React.ReactNode; statsO?: number }> = ({
  frame,
  trip,
  race,
  dimLeft = 0,
  dimRight = 0,
  overlayL,
  overlayR,
  childrenL,
  childrenR,
  statsO = 1,
}) => {
  const cnt = countAt(race, frame);
  const aDone = doneAt(race, trip.astar.settled.length);
  const dDone = doneAt(race, trip.dij.settled.length);
  const pins = ramp(frame, race.go - 90, race.go - 60);
  return (
    <>
      <Half left look={DIJ} frame={frame} trip={trip} run={trip.dij} count={cnt} routeP={ramp(frame, dDone, dDone + 40)} pinsP={pins} stats={statsO} dim={dimLeft} overlay={overlayL}>
        {childrenL}
      </Half>
      <Half left={false} look={AST} frame={frame} trip={trip} run={trip.astar} count={cnt} routeP={ramp(frame, aDone, aDone + 40)} pinsP={pins} stats={statsO} dim={dimRight} overlay={overlayR}>
        {childrenR}
      </Half>
    </>
  );
};

const raceCaptions = (trip: Trip, race: Race): [number, number, React.ReactNode][] => {
  const a = doneAt(race, trip.astar.settled.length);
  const d = doneAt(race, trip.dij.settled.length);
  return [
    [race.go - 90, race.go, <>From <Hi c="#00ff9d">{trip.fromName}</Hi> to <Hi c="#ff1744">{trip.toName}</Hi></>],
    [race.go, a, <>Same speed: both expand <Hi c="#ffe600">one intersection per step</Hi></>],
    [a, d, <><Hi c={AST.main}>A* found it!</Hi> Dijkstra is still searching… 🐢</>],
    [d, d + 60, <><Hi c={DIJ.main}>Dijkstra</Hi> finally gets there. Same route.</>],
  ];
};

const ResultRows: React.FC<{ frame: number; from: number; trip: Trip }> = ({ frame, from, trip }) => {
  const row = (i: number) => ramp(frame, from + 14 + i * 16, from + 28 + i * 16);
  const R = (i: number, label: string, l: React.ReactNode, r: React.ReactNode) => (
    <div style={{ display: "flex", alignItems: "center", fontSize: 44, fontWeight: 800, padding: "12px 0", borderBottom: "2px solid #ffffff14", opacity: row(i), transform: `translateX(${(1 - row(i)) * 60}px)` }}>
      <div style={{ width: 420, color: "#aab3ff", fontSize: 34 }}>{label}</div>
      <div style={{ flex: 1, textAlign: "center", fontFamily: anton }}>{l}</div>
      <div style={{ flex: 1, textAlign: "center", fontFamily: anton }}>{r}</div>
    </div>
  );
  const x = ratio(trip);
  const pop = ramp(frame, from + 90, from + 110);
  return (
    <>
      <div style={{ display: "flex", fontFamily: anton, fontSize: 56, marginBottom: 8 }}>
        <div style={{ width: 420 }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <Hi c={DIJ.main}>DIJKSTRA</Hi>
        </div>
        <div style={{ flex: 1, textAlign: "center" }}>
          <Hi c={AST.main}>A*</Hi>
        </div>
      </div>
      {R(0, "Intersections explored", <Hi c={DIJ.main}>{fmt(trip.dij.settled.length)}</Hi>, <Hi c={AST.main}>{fmt(trip.astar.settled.length)}</Hi>)}
      {R(1, "Share of the map", `${((100 * trip.dij.settled.length) / CITY.n).toFixed(0)}%`, `${((100 * trip.astar.settled.length) / CITY.n).toFixed(0)}%`)}
      {R(2, "Route length", <Hi c={ROUTE}>{km(trip.dij.pathLength)}</Hi>, <Hi c={ROUTE}>{km(trip.astar.pathLength)} ✓</Hi>)}
      <div style={{ textAlign: "center", marginTop: 26, fontFamily: anton, fontSize: 86, transform: `scale(${0.5 + 0.5 * pop})`, opacity: pop, color: "#ffe600", textShadow: glow("#ff6a00", 0.8) }}>
        A* DID {x.toFixed(1)}× LESS WORK ⚡
      </div>
      <div style={{ textAlign: "center", fontSize: 32, fontWeight: 800, color: "#cfd5ff", opacity: ramp(frame, from + 130, from + 145) }}>…and still found the exact same shortest route.</div>
    </>
  );
};

// --- Why ---
const Rings: React.FC<{ frame: number; mpp: number; center: number; color: string }> = ({ frame, mpp, center, color }) => {
  const [cx, cy] = nodeXY(center);
  const rings = [];
  for (let k = 0; k < 5; k++) {
    const t = ((frame / 70 + k / 5) % 1);
    rings.push(<circle key={k} cx={cx} cy={cy} r={t * 5200} fill="none" stroke={color} strokeWidth={4} opacity={(1 - t) * 0.9} style={{ vectorEffect: "non-scaling-stroke" }} />);
  }
  void mpp;
  return <>{rings}</>;
};

const ProbeArt: React.FC<{ p: typeof PROBES.good; goal: number; o: number; mpp: number; ok: boolean }> = ({ p, goal, o, mpp, ok }) => {
  if (o <= 0) return null;
  const [x, y] = nodeXY(p.node);
  const [gx, gy] = nodeXY(goal);
  const S = { vectorEffect: "non-scaling-stroke" as const, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const c = ok ? "#39ff14" : "#ff1744";
  return (
    <g opacity={Math.min(1, o * 1.5)}>
      <path d={nodePathD(p.path)} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - Math.min(1, o * 1.4)} stroke={G_COL} strokeWidth={7} {...S} />
      <line x1={x} y1={y} x2={x + (gx - x) * Math.min(1, Math.max(0, o * 2 - 0.6))} y2={y + (gy - y) * Math.min(1, Math.max(0, o * 2 - 0.6))} stroke={H_COL} strokeWidth={5} strokeDasharray="14 10" {...S} />
      <circle cx={x} cy={y} r={14 * mpp} fill={c} stroke="#fff" strokeWidth={3} style={{ vectorEffect: "non-scaling-stroke", filter: `drop-shadow(0 0 ${10 * mpp}px ${c})` }} />
    </g>
  );
};

const ProbeBox: React.FC<{ title: string; p: typeof PROBES.good; ok: boolean; o: number }> = ({ title, p, ok, o }) => {
  const c = ok ? "#39ff14" : "#ff1744";
  const f = p.g + p.h;
  return (
    <div style={{ opacity: o, transform: `translateX(${(1 - o) * 40}px)`, marginBottom: 26, padding: "14px 14px", borderRadius: 16, background: "#0a0c22ee", border: `3px solid ${c}`, boxShadow: `0 0 20px ${c}66`, textAlign: "left" }}>
      <div style={{ fontFamily: anton, fontSize: 30, color: c }}>{title}</div>
      <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 21, lineHeight: 1.55, color: "#fff" }}>
        <div><Hi c={G_COL}>g</Hi> = {km(p.g)}</div>
        <div><Hi c={H_COL}>h</Hi> = {km(p.h)}</div>
        <div style={{ borderTop: "2px solid #fff3", marginTop: 4, paddingTop: 4, fontSize: 22, whiteSpace: "nowrap" }}>f = <span style={{ color: c }}>{km(f)}</span></div>
      </div>
      <div style={{ fontFamily: anton, fontSize: 28, color: c, marginTop: 4 }}>{ok ? "✓ EXPLORE" : "✗ SKIP"}</div>
    </div>
  );
};

const HullArt: React.FC<{ pts: [number, number][]; color: string; p: number; label: string; mpp: number }> = ({ pts, color, p, label, mpp }) => {
  if (p <= 0) return null;
  const d = "M" + pts.map(([x, y]) => `${Math.round(x)} ${Math.round(y)}`).join("L") + "Z";
  const cx = pts.reduce((s, q) => s + q[0], 0) / pts.length;
  const cy = pts.reduce((s, q) => s + q[1], 0) / pts.length;
  return (
    <g>
      <path d={d} fill={color} fillOpacity={0.12 * p} />
      <path d={d} pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} fill="none" stroke={color} strokeWidth={6} strokeLinejoin="round" style={{ vectorEffect: "non-scaling-stroke", filter: `drop-shadow(0 0 ${8 * mpp}px ${color})` }} />
      <text x={cx} y={cy} fontSize={64 * mpp} textAnchor="middle" fill="#fff" stroke="#000" strokeWidth={10 * mpp} paintOrder="stroke" opacity={ramp(p, 0.6, 1)} style={{ fontFamily: anton, letterSpacing: 4 * mpp }}>
        {label}
      </text>
    </g>
  );
};

const HULL_DIJ = hull(RACE1.dij.settled);
const HULL_AST = hull(RACE1.astar.settled);

const Why: React.FC<{ frame: number }> = ({ frame }) => {
  const done = 1e9;
  const showA = frame >= T.whyB;
  const dimL = frame < T.whyB ? 0 : frame < T.whyD ? 1 : 0;
  const dimR = frame < T.whyB ? ramp(frame, T.why, T.why + 20) : 0;
  const goodO = ramp(frame, T.whyB + 40, T.whyB + 110);
  const badO = ramp(frame, T.whyB + 200, T.whyB + 270);
  const hullO = ramp(frame, T.whyD + 20, T.whyD + 80);
  const ringO = frame < T.whyB ? inOut(frame, T.why + 30, T.whyB, 15) : 0;
  const colO = (a: number, b: number) => inOut(frame, a, b, 14);
  const side = (left: boolean): React.CSSProperties => ({ position: "absolute", top: MAP_Y + 20, left: colX(left), width: COL_W + (left ? 0 : 0), fontFamily: inter, fontWeight: 800, color: "#fff", textAlign: left ? "left" : "right" });
  return (
    <>
      <Half
        left
        look={DIJ}
        frame={frame}
        trip={RACE1}
        run={RACE1.dij}
        count={done}
        routeP={1}
        pinsP={1}
        dim={dimL}
        overlay={(m) => (
          <>
            {ringO > 0 ? <g opacity={ringO}><Rings frame={frame} mpp={m} center={RACE1.s} color="#ffffff" /></g> : null}
            <HullArt pts={HULL_DIJ} color={DIJ.main} p={hullO} label="CIRCLE" mpp={m} />
          </>
        )}
      >
        <div style={side(true)}>
          <div style={{ opacity: colO(T.why + 20, T.whyB) }}>
            <div style={{ fontSize: 20, color: "#9aa3d8", letterSpacing: 2 }}>NEXT NODE</div>
            <div style={{ fontFamily: anton, fontSize: 40, color: G_COL, textShadow: `0 0 16px ${G_COL}`, whiteSpace: "nowrap" }}>min g(n)</div>
            <div style={{ fontSize: 22, lineHeight: 1.35, marginTop: 12 }}>g = road distance already traveled from START</div>
            <div style={{ fontSize: 22, lineHeight: 1.35, marginTop: 18, color: "#ffb4b4", opacity: ramp(frame, T.why + 120, T.why + 140) }}>No idea where the goal is 🙈</div>
          </div>
          <div style={{ lineHeight: 1.35, marginTop: 14, fontSize: 30, opacity: colO(T.whyD + 60, T.race2) }}>explores in every direction 🌊</div>
        </div>
      </Half>
      <Half
        left={false}
        look={AST}
        frame={frame}
        trip={RACE1}
        run={RACE1.astar}
        count={done}
        routeP={1}
        pinsP={1}
        dim={dimR}
        overlay={(m) => (
          <>
            {showA && frame < T.whyD ? (
              <>
                <ProbeArt p={PROBES.bad} goal={RACE1.t} o={badO} mpp={m} ok={false} />
                <ProbeArt p={PROBES.good} goal={RACE1.t} o={goodO} mpp={m} ok />
              </>
            ) : null}
            <HullArt pts={HULL_AST} color={AST.main} p={hullO} label="CONE" mpp={m} />
          </>
        )}
      >
        <div style={side(false)}>
          {frame >= T.whyB && frame < T.whyC ? (
            <>
              <ProbeBox title="ON THE WAY" p={PROBES.good} ok o={colO(T.whyB + 60, T.whyC)} />
              <ProbeBox title="WRONG WAY" p={PROBES.bad} ok={false} o={colO(T.whyB + 220, T.whyC)} />
            </>
          ) : null}
          <div style={{ lineHeight: 1.35, marginTop: 14, fontSize: 30, opacity: colO(T.whyD + 60, T.race2) }}>beams straight at the goal 🎯</div>
        </div>
      </Half>
      <Card frame={frame} from={T.whyC} to={T.whyD} width={1500}>
        <div style={{ textAlign: "center", fontFamily: anton, fontSize: 130, lineHeight: 1.1, letterSpacing: 2 }}>
          f(n) = <Hi c={G_COL}>g(n)</Hi> + <Hi c={H_COL}>h(n)</Hi>
        </div>
        {[
          [<Hi c={G_COL}>g(n)</Hi>, "distance traveled from START: known, exact"],
          [<Hi c={H_COL}>h(n)</Hi>, "straight-line guess to the GOAL: the heuristic"],
          [<Hi c="#39ff14">✓</Hi>, "A straight line is never longer than a road, so h never overestimates."],
          [<Hi c="#39ff14">⇒</Hi>, "A* skips wrong-way streets but still returns the SHORTEST route."],
        ].map(([k, v], i) => {
          const o = ramp(frame, T.whyC + 30 + i * 45, T.whyC + 45 + i * 45);
          return (
            <div key={i} style={{ display: "flex", gap: 24, alignItems: "baseline", fontSize: 40, fontWeight: 800, marginTop: 18, opacity: o, transform: `translateX(${(1 - o) * 60}px)` }}>
              <div style={{ fontFamily: anton, fontSize: 50, width: 150, textAlign: "right" }}>{k}</div>
              <div style={{ flex: 1 }}>{v}</div>
            </div>
          );
        })}
      </Card>
      <Caption
        frame={frame}
        items={[
          [T.why, T.why + 150, <>Why is A* faster? Look at <Hi c={DIJ.main}>how each one picks the next node</Hi></>],
          [T.why + 150, T.whyB, <>Dijkstra ripples out <Hi c="#ffe600">like a wave</Hi>, even AWAY from Times Square</>],
          [T.whyB, T.whyB + 190, <>A* asks: <Hi c={G_COL}>how far have I come</Hi> + <Hi c={H_COL}>how far is the goal (straight line)?</Hi></>],
          [T.whyB + 190, T.whyC, <>Wrong-way node: small <Hi c={G_COL}>g</Hi>, huge <Hi c={H_COL}>h</Hi> → big f → <Hi c="#ff1744">A* never goes there</Hi></>],
          [T.whyD, T.race2, <>Dijkstra floods a <Hi c={DIJ.main}>circle</Hi>. A* carves a <Hi c={AST.main}>cone</Hi> toward the goal.</>],
        ]}
      />
    </>
  );
};

// --- Heuristic dial (3 panels) ---
const PANEL_W = 640;
const DMAP_W = 600;
const DMAP_H = 650;
const DIAL: { look: Look; run: SearchResult; h: string; verdict: (r: SearchResult) => React.ReactNode }[] = [
  { look: { ...DIJ, name: "h × 0" }, run: RACE1.dij, h: "h = 0 → it IS Dijkstra", verdict: () => <Hi c={ROUTE}>✓ shortest, slow</Hi> },
  { look: { ...AST, name: "h × 1" }, run: RACE1.astar, h: "h = straight line (A*)", verdict: () => <Hi c={ROUTE}>✓ shortest, fast</Hi> },
  {
    look: { ...GREEDY },
    run: RACE1.greedy,
    h: "h × 3: overconfident",
    verdict: (r) => <Hi c="#ff1744">✗ {(((r.pathLength - RACE1.astar.pathLength) / RACE1.astar.pathLength) * 100).toFixed(0)}% longer route</Hi>,
  },
];

const Dial: React.FC<{ frame: number }> = ({ frame }) => {
  const cnt = countAt(RD, frame);
  const pins = ramp(frame, RD.go - 90, RD.go - 60);
  return (
    <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 40%, #1a0e4a 0%, #070718 60%, #020208 100%)" }}>
      {DIAL.map((d, i) => {
        const doneF = doneAt(RD, d.run.settled.length);
        const found = cnt >= d.run.settled.length;
        const lab = ramp(frame, doneF, doneF + 15);
        return (
          <div key={i} style={{ position: "absolute", left: i * PANEL_W, top: 0, width: PANEL_W, height: 1080 }}>
            <div style={{ textAlign: "center", marginTop: 22, fontFamily: anton, fontSize: 76, color: d.look.main, textShadow: glow(d.look.main, 0.8) }}>{d.look.name}</div>
            <div style={{ textAlign: "center", fontFamily: mono, fontWeight: 700, fontSize: 26, color: "#e8ecff" }}>{d.h}</div>
            <div style={{ position: "absolute", left: 20, top: 180, width: DMAP_W, height: DMAP_H, borderRadius: 22, overflow: "hidden", border: `2px solid ${d.look.main}55`, background: "#03040c" }}>
              <CityMap
                w={DMAP_W}
                h={DMAP_H}
                frame={frame}
                run={d.run}
                count={cnt}
                palette={d.look.palette}
                route={found ? d.run : undefined}
                routeP={ramp(frame, doneF, doneF + 35)}
                routeColor={i === 2 ? "#ff1744" : ROUTE}
                start={RACE1.s}
                goal={RACE1.t}
                pinsP={pins}
                overlay={
                  i === 2 && found
                    ? () => (
                        <path d={routeD(RACE1.astar)} fill="none" stroke={ROUTE} strokeWidth={5} strokeDasharray="10 8" opacity={0.85} style={{ vectorEffect: "non-scaling-stroke" }} />
                      )
                    : undefined
                }
              />
            </div>
            <div style={{ position: "absolute", top: 838, left: 0, width: PANEL_W, textAlign: "center" }}>
              <div style={{ fontFamily: anton, fontSize: 64, color: "#fff" }}>
                {fmt(Math.min(cnt, d.run.settled.length))} <span style={{ fontSize: 34, color: "#9aa3d8" }}>nodes</span>
              </div>
              <div style={{ fontFamily: inter, fontWeight: 900, fontSize: 36, color: "#fff", opacity: lab, transform: `scale(${0.7 + 0.3 * lab})` }}>
                {found ? <>{km(d.run.pathLength)} · {d.verdict(d.run)}</> : <span style={{ color: "#59618f" }}>searching…</span>}
              </div>
            </div>
          </div>
        );
      })}
      {[1, 2].map((i) => (
        <div key={i} style={{ position: "absolute", left: i * PANEL_W - 2, top: 0, width: 4, height: 1080, background: "linear-gradient(#ffffff00, #ffffff88, #ffffff00)" }} />
      ))}
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------

const Sheet: React.FC<{ frame: number }> = ({ frame }) => {
  const rows: [string, React.ReactNode, React.ReactNode][] = [
    ["Next node", "smallest g(n)", "smallest g(n) + h(n)"],
    ["Knows the goal?", "no 🙈", "yes 🎯"],
    ["Explored (race 1)", fmt(RACE1.dij.settled.length), fmt(RACE1.astar.settled.length)],
    ["Explored (race 2)", fmt(RACE2.dij.settled.length), fmt(RACE2.astar.settled.length)],
    ["Shortest route?", "✓ always", "✓ if h never overestimates"],
    ["Shape", "circle 🔵", "cone 🔺"],
    ["Use it for", "one → ALL destinations", "one → ONE goal: maps, games, robots"],
  ];
  return (
    <Card frame={frame} from={T.sheet} to={T.outro} width={1640}>
      <div style={{ textAlign: "center", fontFamily: anton, fontSize: 76, marginBottom: 10 }}>
        <Hi c="#ffe600">CHEAT SHEET</Hi> 📌
      </div>
      <div style={{ display: "flex", fontFamily: anton, fontSize: 48, paddingBottom: 6 }}>
        <div style={{ width: 400 }} />
        <div style={{ flex: 1, textAlign: "center" }}><Hi c={DIJ.main}>DIJKSTRA</Hi></div>
        <div style={{ flex: 1, textAlign: "center" }}><Hi c={AST.main}>A*</Hi></div>
      </div>
      {rows.map(([k, a, b], i) => {
        const o = ramp(frame, T.sheet + 20 + i * 22, T.sheet + 34 + i * 22);
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 800, padding: "11px 0", borderTop: "2px solid #ffffff14", opacity: o, transform: `translateY(${(1 - o) * 20}px)` }}>
            <div style={{ width: 400, color: "#aab3ff" }}>{k}</div>
            <div style={{ flex: 1, textAlign: "center" }}>{a}</div>
            <div style={{ flex: 1, textAlign: "center", color: "#ffd6f5" }}>{b}</div>
          </div>
        );
      })}
    </Card>
  );
};

const Outro: React.FC<{ frame: number }> = ({ frame }) => {
  const { fps } = useVideoConfig();
  if (frame < T.outro) return null;
  const s = spring({ frame: frame - T.outro, fps, config: { damping: 12 } });
  const l2 = ramp(frame, T.outro + 40, T.outro + 60);
  const l3 = ramp(frame, T.outro + 80, T.outro + 100);
  return (
    <AbsoluteFill style={{ zIndex: 12, alignItems: "center", justifyContent: "center", background: `rgba(2,2,10,${0.75 * Math.min(1, s)})` }}>
      <div style={{ fontFamily: anton, fontSize: 120, textAlign: "center", lineHeight: 1.1, transform: `scale(${s})` }}>
        <Hi c={AST.main}>A*</Hi> = <Hi c={DIJ.main}>DIJKSTRA</Hi> + 🧭
      </div>
      <div style={{ fontFamily: inter, fontWeight: 900, fontSize: 54, color: "#fff", marginTop: 20, opacity: l2 }}>Dijkstra with a sense of direction.</div>
      <div style={{ marginTop: 50, opacity: l3, transform: `scale(${0.8 + 0.2 * l3})`, padding: "18px 44px", borderRadius: 60, background: "#ff1744", fontFamily: anton, fontSize: 56, color: "#fff", boxShadow: "0 0 40px #ff1744" }}>
        SUBSCRIBE for more algorithms, visualized 🔔
      </div>
    </AbsoluteFill>
  );
};

const Attribution: React.FC = () => (
  <div style={{ position: "absolute", right: 14, bottom: 4, fontFamily: inter, fontSize: 15, fontWeight: 700, color: "#ffffff70" }}>Map data © OpenStreetMap contributors (ODbL)</div>
);

// ---------------------------------------------------------------------------

const MUSIC_VOLUME = 0.4; // under the SFX; the track itself is loud in races, quiet in explanations

const SoundTrack: React.FC = () => {
  const cues: { from: number; file: string; volume: number }[] = [
    { from: 0, file: "split.wav", volume: 0.6 },
    { from: 20, file: "merged.wav", volume: 0.5 },
  ];
  const race = (r: Race, slowN: number, fastN: number) => {
    for (let i = 0; i < 3; i++) cues.push({ from: r.go - 90 + i * 30, file: "tick.wav", volume: 0.8 });
    cues.push({ from: r.go, file: "split.wav", volume: 0.7 });
    const end = doneAt(r, slowN);
    for (let f = r.go + 8, k = 0; f < end; f += 10, k++) {
      cues.push({ from: f, file: `note-${Math.min(15, Math.floor((k * 16 * 10) / (end - r.go)))}.wav`, volume: 0.22 });
    }
    cues.push({ from: doneAt(r, fastN), file: "final.wav", volume: 0.75 });
    cues.push({ from: end, file: "drop-right.wav", volume: 0.6 });
  };
  race(R1, RACE1.dij.settled.length, RACE1.astar.settled.length);
  race(R2, RACE2.dij.settled.length, RACE2.astar.settled.length);
  race(RD, RACE1.dij.settled.length, RACE1.astar.settled.length);
  cues.push({ from: doneAt(RD, RACE1.greedy.settled.length), file: "pop.wav", volume: 0.6 });
  const r1Card = doneAt(R1, RACE1.dij.settled.length) + 60;
  const r2Card = doneAt(R2, RACE2.dij.settled.length) + 50;
  for (const c of [r1Card, r2Card]) {
    cues.push({ from: c, file: "merged.wav", volume: 0.6 });
    for (let i = 0; i < 3; i++) cues.push({ from: c + 14 + i * 16, file: "pop.wav", volume: 0.45 });
    cues.push({ from: c + 92, file: "final.wav", volume: 0.6 });
  }
  cues.push({ from: T.whyB + 50, file: "drop-left.wav", volume: 0.6 });
  cues.push({ from: T.whyB + 210, file: "compare.wav", volume: 0.6 });
  cues.push({ from: T.whyC, file: "merged.wav", volume: 0.6 });
  for (let i = 0; i < 4; i++) cues.push({ from: T.whyC + 30 + i * 45, file: "pop.wav", volume: 0.45 });
  cues.push({ from: T.whyD + 20, file: "split.wav", volume: 0.6 });
  cues.push({ from: T.race2, file: "merged.wav", volume: 0.5 });
  cues.push({ from: T.dial, file: "merged.wav", volume: 0.5 });
  cues.push({ from: T.sheet, file: "merged.wav", volume: 0.6 });
  for (let i = 0; i < 7; i++) cues.push({ from: T.sheet + 20 + i * 22, file: "pop.wav", volume: 0.4 });
  cues.push({ from: T.outro, file: "final.wav", volume: 0.7 });
  return (
    <>
      {/* Background music: generated by scripts/generate-music.mjs with its sections
          (calm / race / riser) matched to T. Re-run it if T changes. */}
      <Audio src={staticFile("music/astar-vs-dijkstra.mp3")} volume={MUSIC_VOLUME} />
      {cues.map((c, i) => (
        <Sequence key={i} name={c.file} from={c.from} durationInFrames={90} layout="none">
          <Audio src={staticFile(`sfx/${c.file}`)} volume={c.volume} />
        </Sequence>
      ))}
    </>
  );
};

// ---------------------------------------------------------------------------

const SETUP_ZOOM_NODE = RACE1.s;
const setupCam = (frame: number) => {
  const zin = ramp(frame, T.setup + 80, T.setup + 150);
  const zout = ramp(frame, T.setup + 290, T.setup + 350);
  const near = camAt(SETUP_ZOOM_NODE, 5);
  return zout > 0 ? lerpCam(near, FULL, zout) : lerpCam(FULL, near, zin);
};
// One street near the start, labelled with its length
const SAMPLE_EDGE = CITY.adj[SETUP_ZOOM_NODE].reduce((b, e) => (CITY.elen[e] > CITY.elen[b] ? e : b));

const SetupOverlay: React.FC<{ frame: number; mpp: number }> = ({ frame, mpp }) => {
  const o = inOut(frame, T.setup + 200, T.setup + 300, 12);
  if (o <= 0) return null;
  const a = SAMPLE_EDGE;
  const [x1, y1] = nodeXY(CITY.ea[a]);
  const [x2, y2] = nodeXY(CITY.eb[a]);
  const S = { vectorEffect: "non-scaling-stroke" as const, strokeLinecap: "round" as const };
  return (
    <g opacity={o}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#ff2bd6" strokeWidth={9} {...S} />
      <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 18 * mpp} fontSize={34 * mpp} textAnchor="middle" fill="#fff" stroke="#000" strokeWidth={8 * mpp} paintOrder="stroke" style={{ fontFamily: anton }}>
        {Math.round(CITY.elen[a])} m
      </text>
    </g>
  );
};

const Setup: React.FC<{ frame: number }> = ({ frame }) => {
  const cam = setupCam(frame);
  const nodesO = inOut(frame, T.setup + 130, T.setup + 300, 15);
  const pins = ramp(frame, T.setup + 360, T.setup + 420);
  const props = { frame, trip: RACE1, cam, showNodes: nodesO, pinsP: pins, overlay: (m: number) => <SetupOverlay frame={frame} mpp={m} /> };
  return (
    <>
      <Half left look={DIJ} {...props} />
      <Half left={false} look={AST} {...props} />
      <Caption
        frame={frame}
        items={[
          [T.setup, T.setup + 120, <>This is <Hi c="#ffe600">REAL Manhattan</Hi> 🗽: every drivable street from OpenStreetMap</>],
          [T.setup + 120, T.setup + 210, <><Hi c="#ffe600">{fmt(CITY.n)} intersections</Hi> → the NODES of a graph</>],
          [T.setup + 210, T.setup + 330, <><Hi c="#ff2bd6">{fmt(CITY.ea.length)} streets</Hi> → EDGES, weight = length in meters</>],
          [T.setup + 330, T.race1, <>Task: shortest drive from <Hi c="#00ff9d">{RACE1.fromName}</Hi> to <Hi c="#ff1744">{RACE1.toName}</Hi></>],
        ]}
      />
    </>
  );
};

export const AstarVsDijkstra: React.FC = () => {
  const frame = useCurrentFrame();
  let body: React.ReactNode;
  if (frame < T.setup) {
    const props = { frame, trip: RACE1, reveal: ramp(frame, 0, 150) };
    body = (
      <>
        <Half left look={DIJ} {...props} />
        <Half left={false} look={AST} {...props} />
        <Divider frame={frame} />
        <Hook frame={frame} />
      </>
    );
  } else if (frame < T.race1) {
    body = (
      <>
        <Setup frame={frame} />
        <Divider frame={frame} />
      </>
    );
  } else if (frame < T.why) {
    const dD = doneAt(R1, RACE1.dij.settled.length);
    const aD = doneAt(R1, RACE1.astar.settled.length);
    const card = dD + 60;
    body = (
      <>
        <RaceHalves frame={frame} trip={RACE1} race={R1} />
        <Divider frame={frame} />
        <Countdown frame={frame} go={R1.go} />
        <FoundBurst frame={frame} at={aD} left={false} text="FOUND IT! ⚡" color={ROUTE} />
        <FoundBurst frame={frame} at={dD} left text="FINALLY…" color="#ffe600" />
        <Caption frame={frame} items={raceCaptions(RACE1, R1)} />
        <Card frame={frame} from={card} to={T.why}>
          <ResultRows frame={frame} from={card} trip={RACE1} />
        </Card>
      </>
    );
  } else if (frame < T.race2) {
    body = (
      <>
        <Why frame={frame} />
        <Divider frame={frame} />
      </>
    );
  } else if (frame < T.dial) {
    const dD = doneAt(R2, RACE2.dij.settled.length);
    const aD = doneAt(R2, RACE2.astar.settled.length);
    const card = dD + 50;
    body = (
      <>
        <RaceHalves frame={frame} trip={RACE2} race={R2} />
        <Divider frame={frame} />
        <Card frame={frame} from={T.race2} to={R2.go - 70} width={1300}>
          <div style={{ textAlign: "center", fontFamily: anton, fontSize: 110, color: "#ffe600", textShadow: glow("#ff6a00", 0.7) }}>ROUND 2 🥊</div>
          <div style={{ textAlign: "center", fontSize: 46, fontWeight: 900 }}>
            <Hi c="#00ff9d">{RACE2.fromName}</Hi> → <Hi c="#ff1744">{RACE2.toName}</Hi>
          </div>
          <div style={{ textAlign: "center", fontSize: 34, fontWeight: 700, color: "#cfd5ff", marginTop: 10 }}>across the East River, through the Midtown grid</div>
        </Card>
        <Countdown frame={frame} go={R2.go} />
        <FoundBurst frame={frame} at={aD} left={false} text="FOUND IT! ⚡" color={ROUTE} />
        <FoundBurst frame={frame} at={dD} left text="FINALLY…" color="#ffe600" />
        <Caption frame={frame} items={raceCaptions(RACE2, R2)} />
        <Card frame={frame} from={card} to={T.dial}>
          <ResultRows frame={frame} from={card} trip={RACE2} />
        </Card>
      </>
    );
  } else if (frame < T.sheet) {
    const lesson = T.dial + 640;
    body = (
      <>
        <Dial frame={frame} />
        <Card frame={frame} from={T.dial} to={RD.go - 70} width={1400}>
          <div style={{ textAlign: "center", fontFamily: anton, fontSize: 100, color: "#ffe600", textShadow: glow("#ff6a00", 0.7) }}>TURN THE HEURISTIC DIAL 🎛️</div>
          <div style={{ textAlign: "center", fontSize: 44, fontWeight: 800 }}>
            f(n) = <Hi c={G_COL}>g(n)</Hi> + <Hi c="#ffe600">w</Hi> × <Hi c={H_COL}>h(n)</Hi> · what happens for w = 0, 1, 3?
          </div>
        </Card>
        <Countdown frame={frame} go={RD.go} />
        <Caption
          frame={frame}
          items={[
            [RD.go, doneAt(RD, RACE1.dij.settled.length) + 30, <>Same trip: <Hi c="#00ff9d">{RACE1.fromName}</Hi> → <Hi c="#ff1744">{RACE1.toName}</Hi>, three different heuristics</>],
            [doneAt(RD, RACE1.dij.settled.length) + 30, lesson, <>w = 0 is <Hi c={DIJ.main}>Dijkstra</Hi>. w = 3 is fast but <Hi c="#ff1744">gets the route wrong</Hi>.</>],
          ]}
        />
        <Card frame={frame} from={lesson} to={T.sheet} width={1500}>
          <div style={{ textAlign: "center", fontFamily: anton, fontSize: 92, marginBottom: 16 }}>
            THE <Hi c="#ffe600">HEURISTIC</Hi> IS THE SECRET 🔑
          </div>
          {[
            [<Hi c={DIJ.main}>too low (0)</Hi>, "explores everything: slow but correct"],
            [<Hi c={ROUTE}>just right</Hi>, "never overestimates: fast AND shortest"],
            [<Hi c="#ff1744">too high</Hi>, "super fast, but the route can be wrong"],
          ].map(([k, v], i) => {
            const o = ramp(frame, lesson + 20 + i * 30, lesson + 36 + i * 30);
            return (
              <div key={i} style={{ display: "flex", gap: 30, fontSize: 44, fontWeight: 800, marginTop: 14, opacity: o, transform: `translateX(${(1 - o) * 60}px)` }}>
                <div style={{ fontFamily: anton, width: 360, textAlign: "right", fontSize: 48 }}>{k}</div>
                <div style={{ flex: 1 }}>{v}</div>
              </div>
            );
          })}
        </Card>
      </>
    );
  } else {
    body = (
      <>
        <RaceHalves frame={T.why - 1} trip={RACE1} race={R1} statsO={0} />
        <Divider frame={frame} />
        <Sheet frame={frame} />
        <Outro frame={frame} />
      </>
    );
  }
  return (
    <AbsoluteFill style={{ background: "#02030a" }}>
      {body}
      <Attribution />
      <SoundTrack />
    </AbsoluteFill>
  );
};

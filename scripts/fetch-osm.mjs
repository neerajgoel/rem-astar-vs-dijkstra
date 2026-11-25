// Downloads the drivable road network of Lower/Midtown Manhattan (+ Downtown
// Brooklyn, LIC) from OpenStreetMap via the Overpass API, simplifies it to an
// intersection graph and writes src/map/data/manhattan.json.
//
// Usage: node scripts/fetch-osm.mjs   (needs network; output is committed)
// Data © OpenStreetMap contributors, ODbL.

import { mkdirSync, writeFileSync } from "node:fs";

const BBOX = { s: 40.695, w: -74.02, n: 40.77, e: -73.935 };
const HIGHWAYS = [
  "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified",
  "residential", "living_street",
  "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
];
const OUT = "src/map/data/manhattan.json";

const query = `[out:json][timeout:180];
way["highway"~"^(${HIGHWAYS.join("|")})$"](${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e});
(._;>;);
out skel qt;`;

// Overpass is often busy: try a few public mirrors
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
let osm = null;
for (const url of MIRRORS) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "remotion-map-video/1.0" },
      body: "data=" + encodeURIComponent(query),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    osm = await res.json();
    console.log(`Fetched from ${url}`);
    break;
  } catch (err) {
    console.warn(`${url} failed: ${err.message}`);
  }
}
if (!osm) throw new Error("All Overpass mirrors failed; try again later");

// Project lat/lon to meters (equirectangular around the bbox centre), north up
const lat0 = (BBOX.s + BBOX.n) / 2;
const kx = Math.cos((lat0 * Math.PI) / 180) * 111320;
const ky = 110574;
const coord = new Map();
for (const el of osm.elements) {
  if (el.type === "node") coord.set(el.id, [(el.lon - BBOX.w) * kx, (BBOX.n - el.lat) * ky]);
}
const ways = osm.elements.filter((e) => e.type === "way").map((w) => w.nodes.filter((id) => coord.has(id)));

// Keep nodes: way endpoints and nodes shared by several ways (intersections)
const uses = new Map();
for (const w of ways) {
  w.forEach((id, i) => {
    const bump = i === 0 || i === w.length - 1 ? 2 : 1;
    uses.set(id, (uses.get(id) ?? 0) + bump);
  });
}
const isKey = (id) => (uses.get(id) ?? 0) >= 2;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const edgeMap = new Map(); // "a|b" -> {a, b, len, pts}
for (const w of ways) {
  if (w.length < 2) continue;
  let start = 0;
  for (let i = 1; i < w.length; i++) {
    if (!isKey(w[i]) && i !== w.length - 1) continue;
    const seg = w.slice(start, i + 1);
    start = i;
    const a = seg[0];
    const b = seg[seg.length - 1];
    if (a === b) continue;
    let len = 0;
    for (let k = 1; k < seg.length; k++) len += dist(coord.get(seg[k - 1]), coord.get(seg[k]));
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    const prev = edgeMap.get(key);
    if (!prev || prev.len > len) edgeMap.set(key, { a, b, len, pts: seg });
  }
}

// Largest connected component
const adj = new Map();
for (const e of edgeMap.values()) {
  if (!adj.has(e.a)) adj.set(e.a, []);
  if (!adj.has(e.b)) adj.set(e.b, []);
  adj.get(e.a).push(e.b);
  adj.get(e.b).push(e.a);
}
const comp = new Map();
let best = -1;
let bestSize = 0;
let c = 0;
for (const id of adj.keys()) {
  if (comp.has(id)) continue;
  const stack = [id];
  comp.set(id, c);
  let size = 0;
  while (stack.length) {
    const u = stack.pop();
    size++;
    for (const v of adj.get(u)) if (!comp.has(v)) { comp.set(v, c); stack.push(v); }
  }
  if (size > bestSize) { bestSize = size; best = c; }
  c++;
}

const index = new Map();
const nodes = [];
for (const id of adj.keys()) {
  if (comp.get(id) !== best) continue;
  index.set(id, nodes.length / 2);
  const [x, y] = coord.get(id);
  nodes.push(Math.round(x), Math.round(y));
}
// edges: [a, b, lengthMeters, ...interior points x,y]
const edges = [];
for (const e of edgeMap.values()) {
  if (comp.get(e.a) !== best) continue;
  const inner = e.pts.slice(1, -1).flatMap((id) => coord.get(id).map(Math.round));
  edges.push([index.get(e.a), index.get(e.b), Math.round(e.len), ...inner]);
}

const width = Math.round((BBOX.e - BBOX.w) * kx);
const height = Math.round((BBOX.n - BBOX.s) * ky);
mkdirSync("src/map/data", { recursive: true });
const json = JSON.stringify({ bbox: BBOX, width, height, nodes, edges });
writeFileSync(OUT, json);
console.log(`${nodes.length / 2} nodes, ${edges.length} edges, ${width}x${height} m, ${(json.length / 1e6).toFixed(2)} MB → ${OUT}`);

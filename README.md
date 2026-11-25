# A* vs Dijkstra on real Manhattan streets

A 3-minute, 16:9 (1920x1080, 30fps) [Remotion](https://www.remotion.dev) video that races Dijkstra and A* across the real drivable road graph of Lower/Midtown Manhattan, shows why A* explores less (the heuristic cone), and ends on a cheat sheet.

## Run it

```console
npm i
npm run dev       # Remotion Studio preview
npm run render    # renders out/video.mp4
```

Rendering loads Google Fonts, so it needs network access.

## Layout

- `src/map/AstarVsDijkstra.tsx`: the video. The timeline `T` (in frames) is at the top.
- `src/map/CityMap.tsx`: SVG map renderer (camera in meters, explored tree, route, pins).
- `src/map/graph.ts`: loads `data/manhattan.json` into a road graph.
- `src/map/search.ts`: one `search(g, s, t, hWeight)`: 0 = Dijkstra, 1 = A*, 3 = weighted A*.
- `src/map/trips.ts`: the two race trips and the numbers derived from them.
- `src/theme.ts`: fonts.
- `public/music/astar-vs-dijkstra.mp3`, `public/sfx/*.wav`: audio.

## Regenerating assets

- `npm run fetch-osm`: re-downloads the road network from the Overpass API into `src/map/data/manhattan.json` (only needed to change the area).
- `npm run music`: re-synthesizes the background track (needs ffmpeg). Its `SECTIONS` mirror the video timeline `T`, so re-run it after changing `T`.
- `npm run sfx`: re-synthesizes the sound effects (Python 3, stdlib only).

## Credits

- Map data © OpenStreetMap contributors, licensed under the [ODbL](https://opendatacommons.org/licenses/odbl/). Keep this attribution when you publish the video.
- Music and sound effects are original, synthesized by the scripts in `scripts/`.

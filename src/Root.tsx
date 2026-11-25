import { Composition } from "remotion";
import { AstarVsDijkstra, VIDEO_DURATION } from "./map/AstarVsDijkstra";

// A* vs Dijkstra on real Manhattan streets (16:9, ~3 min)
export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="astar-vs-dijkstra"
      component={AstarVsDijkstra}
      durationInFrames={VIDEO_DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

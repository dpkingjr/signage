import type { Viewport } from "next";
import Player from "./Player";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
  viewportFit: "cover",
};

export default function DefaultPlayerPage() {
  return <Player />;
}

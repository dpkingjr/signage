import type { Viewport } from "next";
import Player from "../Player";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
  viewportFit: "cover",
};

export default async function PlaylistPlayerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Player slug={slug} />;
}

import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signage",
  description: "Digital signage manager",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#080a0e",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

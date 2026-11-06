import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signage",
  description: "Digital signage manager",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

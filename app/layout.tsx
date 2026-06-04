import type { Metadata } from "next";
import "./globals.css";
import "@/lib/arcade/arcade.css";

export const metadata: Metadata = {
  title: "Sitecorex SAI Quiz — Sitecore Arcade",
  description: "A Sitecore Marketplace trivia game that plays with your tenant.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Pixel font loaded at runtime (not build time) so the production build
            never depends on network access to Google Fonts. Falls back to a
            monospace stack offline — arcade.css declares the fallback. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* App Router root-layout link loads globally; the pages/_document rule doesn't apply. */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=VT323&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

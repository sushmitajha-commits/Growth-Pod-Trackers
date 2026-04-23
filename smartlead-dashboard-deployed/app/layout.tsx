import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const vert = localFont({
  src: "../VertGrotesk.ttf",
  variable: "--font-vert",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SmartLead Email Dashboard",
  description: "GTM Email Campaign Metrics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={vert.variable}>
      <body className="bg-white text-slate-900 min-h-screen antialiased font-sans">{children}</body>
    </html>
  );
}

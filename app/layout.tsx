import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmartLead Email Dashboard",
  description: "GTM Email Campaign Metrics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#0a0e1a] text-white min-h-screen antialiased">{children}</body>
    </html>
  );
}

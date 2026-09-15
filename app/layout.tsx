import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Ghandsons", template: "%s · Ghandsons" },
  description: "Jobs, quotes, invoices and receipts for a small building business.",
  applicationName: "Ghandsons",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Ghandsons" },
  formatDetection: { telephone: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}

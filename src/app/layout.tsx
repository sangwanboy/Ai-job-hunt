import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "JOB OS",
  description: "Production-minded job intelligence and outreach SaaS with stateful AI agents.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

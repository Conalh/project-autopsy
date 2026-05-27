import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Autopsy",
  description: "Evidence-backed autopsy reports and revival plans for stalled repositories."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

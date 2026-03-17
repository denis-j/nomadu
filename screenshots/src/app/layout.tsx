import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Nomad – App Store Screenshots",
  description: "Screenshot generator for Nomad",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} antialiased`}
        style={{ fontFamily: "-apple-system, 'SF Pro Display', 'SF Pro Text', var(--font-sans), sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}

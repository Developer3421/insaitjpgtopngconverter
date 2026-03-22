import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Insait Jpeg to Png Converter",
  description: "Convert JPEG/JPG images to high-quality PNG files instantly — powered by Insait.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}


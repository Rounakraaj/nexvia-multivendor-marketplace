import type { Metadata } from "next";
import { Sora } from "next/font/google";
import ToastProvider from "@/components/ToastProvider";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nexvia Market",
  description: "A multi-vendor marketplace where independent sellers and buyers meet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning className={`${sora.variable} h-full antialiased`}>
      <body className="min-h-full"><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}

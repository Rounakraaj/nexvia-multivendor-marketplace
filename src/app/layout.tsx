import type { Metadata } from "next";
import { Sora } from "next/font/google";
import { connection } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CartProvider } from "@/lib/cart";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const session = await getServerSession(authOptions);
  const cartUserId = session?.user.role === "CUSTOMER" ? session.user.id : null;
  return (
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning className={`${sora.variable} h-full antialiased`}>
      <body className="min-h-full"><ToastProvider><CartProvider userId={cartUserId}>{children}</CartProvider></ToastProvider></body>
    </html>
  );
}

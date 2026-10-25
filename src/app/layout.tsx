import type { Metadata } from "next";
import { Sora, Playfair_Display } from "next/font/google";
import { connection } from "next/server";
import { getSession } from "@/lib/session";
import { CartProvider } from "@/lib/cart";
import ToastProvider from "@/components/ToastProvider";
import CursorGlow from "@/components/CursorGlow";
import "./globals.css";
import "./neon.css";
import "./theme.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nexvia Market",
  description: "A multi-vendor marketplace where independent sellers and buyers meet.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const session = await getSession();
  const cartUserId = session?.user.role === "CUSTOMER" ? session.user.id : null;

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      className={`${sora.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <ToastProvider>
          <CartProvider userId={cartUserId}>
            {children}
            <CursorGlow />
          </CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import AuthGate from "@/components/AuthGate";
import Navigation from "@/components/Navigation";
import "./globals.css";

export const metadata: Metadata = {
  title: "PEBS Desk",
  description: "PEBS Desk 내부 관리 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased font-sans">
        <AuthGate>
          <Navigation />
          {children}
        </AuthGate>
      </body>
    </html>
  );
}

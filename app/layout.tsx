import type { Metadata } from "next";
import { Noto_Sans_KR } from "next/font/google";
import AuthGate from "@/components/AuthGate";
import "./globals.css";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-kr",
});

export const metadata: Metadata = {
  title: "PEBS 계약금 지급 관리",
  description: "펩스 계약금 지급 관리 시스템",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className={`${notoSansKR.variable} antialiased font-sans`}>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}

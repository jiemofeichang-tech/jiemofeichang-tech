import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OiiOii - AI 动画智能体团队",
  description: "想象力，即刻呈现。为你打造的 AI 动画智能体团队。",
};

export const viewport: Viewport = {
  themeColor: "#111213",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@100..900&family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="theme-pink">{children}</body>
    </html>
  );
}

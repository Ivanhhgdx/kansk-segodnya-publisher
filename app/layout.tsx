import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Edit — Канск Сегодня",
  description: "Публичная облачная система публикации и редактирования канала Канск Сегодня.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}

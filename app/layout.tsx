import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codebase Intelligence",
  description: "Local repository exploration with verified evidence",
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="system"
      className="h-full antialiased"
    >
      <body className="flex h-full flex-col">
        {children}
      </body>
    </html>
  );
}

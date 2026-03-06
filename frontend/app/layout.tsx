import type { Metadata } from "next";
import "./globals.css";
import { LedgerProvider } from "@/contexts/LedgerContext";
import { QueryProvider } from "@/components/QueryProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export const metadata: Metadata = {
  title: "bookkeeping",
  description: "Financial Freedom",
  icons: {
    icon: "/icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ErrorBoundary>
          <QueryProvider>
            <LedgerProvider initialLedgers={[]}>{children}</LedgerProvider>
          </QueryProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}


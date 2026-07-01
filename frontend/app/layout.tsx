import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import ToastContainer from "./components/Toast";
import AppShell from "./components/AppShell";
import { ThemeProvider } from "./components/ThemeProvider";

export const metadata: Metadata = {
  title: "Enfeca Interview — AI Voice Interview Platform",
  description:
    "Practice technical interviews with an AI interviewer that listens, evaluates, and helps you improve in real-time using voice interaction.",
  keywords: ["AI interview", "voice interview", "technical interview", "mock interview", "speech recognition"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="font-sans">
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <Suspense fallback={children}>
            <AppShell>{children}</AppShell>
          </Suspense>
          <ToastContainer />
        </ThemeProvider>
      </body>
    </html>
  );
}

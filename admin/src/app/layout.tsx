import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Triad Admin",
  description: "Internt nav för Triad Solutions",
  robots: { index: false, follow: false },
  icons: {
    icon: "/admin/logos/Logo_Color_Icon.png",
    shortcut: "/admin/logos/Logo_Color_Icon.png",
    apple: "/admin/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Triad Admin",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&family=Roboto:wght@400;500;700&family=JetBrains+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

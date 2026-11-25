import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://radar.optarys.com.br"),
  applicationName: "Vidalys Radar",
  title: {
    default: "Vidalys Radar",
    template: "%s · Vidalys Radar",
  },
  description:
    "Encontre o produto, encontre o fornecedor, descubra sua margem. Inteligência para revender no Mercado Livre.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/mark.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/brand/mark.svg"],
  },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Vidalys Radar",
    title: "Vidalys Radar",
    description:
      "Encontre o produto, encontre o fornecedor, descubra sua margem.",
    images: [
      {
        url: "/brand/social-card.svg",
        width: 1200,
        height: 630,
        alt: "Vidalys Radar — Inteligência para revender",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vidalys Radar",
    description:
      "Encontre o produto, encontre o fornecedor, descubra sua margem.",
    images: ["/brand/social-card.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#16181D",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}

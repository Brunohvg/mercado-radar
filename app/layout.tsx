import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://radar.optarys.com.br"),
  applicationName: "Mercado Radar",
  title: {
    default: "Mercado Radar",
    template: "%s · Mercado Radar",
  },
  description:
    "Inteligência de oportunidade, preço, margem, anúncios e publicidade para vendedores do Mercado Livre.",
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
    siteName: "Mercado Radar",
    title: "Mercado Radar",
    description:
      "Inteligência para vender melhor no Mercado Livre.",
    images: [
      {
        url: "/brand/social-card.svg",
        width: 1200,
        height: 630,
        alt: "Mercado Radar — Seller Intelligence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mercado Radar",
    description:
      "Inteligência para vender melhor no Mercado Livre.",
    images: ["/brand/social-card.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#0E8063",
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

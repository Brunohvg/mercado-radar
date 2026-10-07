import type { Metadata } from "next";
import { AppNavigation } from "@/components/app-navigation";
import { MarketIntelligence } from "@/components/market-intelligence";

export const metadata: Metadata = { title: "Mercado" };

export default function MercadoPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <MarketIntelligence />
      </section>
    </main>
  );
}

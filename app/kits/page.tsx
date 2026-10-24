import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { KitOptimizer } from "@/components/kit-optimizer";
import { intelligenceEnabled } from "@/lib/intelligence-access";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Simulador de kits" };
export default function KitsPage() {
  if (!intelligenceEnabled()) notFound();
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <KitOptimizer />
      </section>
    </main>
  );
}

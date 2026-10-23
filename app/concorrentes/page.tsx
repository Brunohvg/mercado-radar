import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppNavigation } from "@/components/app-navigation";
import { CompetitorRadar } from "@/components/competitor-radar";
import { intelligenceEnabled } from "@/lib/intelligence-access";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Concorrentes" };
export default function ConcorrentesPage() {
  if (!intelligenceEnabled()) notFound();
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <CompetitorRadar />
      </section>
    </main>
  );
}

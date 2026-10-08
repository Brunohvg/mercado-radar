import type { Metadata } from "next";
import { AppNavigation } from "@/components/app-navigation";
import { Onboarding } from "@/components/onboarding";

export const metadata: Metadata = { title: "Primeiros passos" };

export default function OnboardingPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <Onboarding />
      </section>
    </main>
  );
}

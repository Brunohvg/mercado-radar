import { AppNavigation } from "@/components/app-navigation";
import { OpportunityRadar } from "@/components/opportunity-radar";

export default function OpportunitiesPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <OpportunityRadar />
      </section>
    </main>
  );
}

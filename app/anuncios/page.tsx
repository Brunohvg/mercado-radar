import { SectionTabs } from "@/components/section-tabs";
import { AppNavigation } from "@/components/app-navigation";
import { ListingsDashboard } from "@/components/listings-dashboard";

export default function ListingsPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SectionTabs section="anuncios" current="/anuncios" />
        <ListingsDashboard />
      </section>
    </main>
  );
}

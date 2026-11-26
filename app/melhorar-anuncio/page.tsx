import { SectionTabs } from "@/components/section-tabs";
import { AppNavigation } from "@/components/app-navigation";
import { ListingImprover } from "@/components/listing-improver";

export default function ImproveListingPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SectionTabs section="anuncios" current="/melhorar-anuncio" />
        <ListingImprover />
      </section>
    </main>
  );
}

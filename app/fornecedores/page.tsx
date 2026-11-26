import { SectionTabs } from "@/components/section-tabs";
import { AppNavigation } from "@/components/app-navigation";
import { SuppliersDashboard } from "@/components/suppliers-dashboard";

export default function SuppliersPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <SectionTabs section="compras" current="/fornecedores" />
        <SuppliersDashboard />
      </section>
    </main>
  );
}

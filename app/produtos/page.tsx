import { AppNavigation } from "@/components/app-navigation";
import { ProductsDashboard } from "@/components/products-dashboard";

export default function ProductsPage() {
  return (
    <main className="shell">
      <AppNavigation />
      <section className="content routed-content">
        <ProductsDashboard />
      </section>
    </main>
  );
}

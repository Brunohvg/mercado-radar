import { MercadoLivreIntegration } from "@/components/mercado-livre-integration";
import { ProductAnalyzer } from "@/components/product-analyzer";
import { ProductsDashboard } from "@/components/products-dashboard";
import { SalesDashboard } from "@/components/sales-dashboard";
import { OpportunityRadar } from "@/components/opportunity-radar";
import { AppNavigation } from "@/components/app-navigation";

const pillars = [
  {
    number: "01",
    title: "Sourcing",
    question: "O que comprar e quanto pagar?",
    description:
      "Identifique produtos, leia o mercado e descubra o preço máximo de compra antes de colocar capital em estoque.",
  },
  {
    number: "02",
    title: "Pricing",
    question: "Por quanto vender?",
    description:
      "Cruze custo, tarifa, frete e concorrência para encontrar um preço saudável que ainda caiba no mercado.",
  },
  {
    number: "03",
    title: "Profit",
    question: "Quanto realmente sobrou?",
    description:
      "Compare o previsto com a venda realizada e enxergue margem real, taxas, frete e custo por produto.",
  },
  {
    number: "04",
    title: "Capital & Estoque",
    question: "Repor, reduzir ou parar?",
    description:
      "Use giro, cobertura, margem e capital necessário para decidir onde vale continuar investindo.",
  },
] as const;

export default function Home() {
  return (
    <main className="shell">
      <AppNavigation />

      <section className="content">
        <header className="topbar product-positioning">
          <div>
            <p className="eyebrow">Copiloto de compra e rentabilidade</p>
            <h1>
              Decida <em>o que comprar, quanto pagar e quando repor.</em>
            </h1>
            <p className="hero-copy">
              O Mercado Livre mostra o que acontece dentro do marketplace. O
              Radar junta mercado, fornecedor, custos e vendas reais para
              transformar esses dados em decisão financeira.
            </p>
          </div>
          <div className="pill">20% margem · 30% ROI · ajustável</div>
        </header>

        <section className="value-pillars" aria-label="Pilares do Mercado Radar">
          {pillars.map((pillar) => (
            <article className="value-pillar" key={pillar.title}>
              <span className="value-pillar-number">{pillar.number}</span>
              <div>
                <span className="value-pillar-title">{pillar.title}</span>
                <strong>{pillar.question}</strong>
                <p>{pillar.description}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="radar-promise">
          <span className="eyebrow">Regra do produto</span>
          <strong>
            Se uma informação puder ser descoberta com segurança, o Radar não
            deve pedir que você digite.
          </strong>
          <p>
            Categoria, tarifas, frete, faixa de mercado e embalagem estimada são
            preenchidos automaticamente quando houver evidência suficiente.
          </p>
        </section>

        <ProductAnalyzer />
        <OpportunityRadar />
        <ProductsDashboard />
        <SalesDashboard />
        <MercadoLivreIntegration />
      </section>
    </main>
  );
}

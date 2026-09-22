import Link from "next/link";
import { AppNavigation } from "@/components/app-navigation";

const pillars = [
  {
    href: "/analisar",
    number: "01",
    title: "Sourcing & Pricing",
    question: "O que comprar e quanto pagar?",
    description:
      "Busque por nome ou código de barras, descubra o preço praticado e calcule o teto de compra antes de colocar capital no produto.",
    action: "Analisar produto",
  },
  {
    href: "/oportunidades",
    number: "02",
    title: "Oportunidades",
    question: "O que merece investigação agora?",
    description:
      "Cruze tendências, mais vendidos, concorrência e custos da sua conta para encontrar candidatos de revenda.",
    action: "Abrir Radar",
  },
  {
    href: "/vendas",
    number: "03",
    title: "Profit",
    question: "Quanto realmente sobrou?",
    description:
      "Use custos realizados da venda para separar faturamento de lucro e entender quais produtos realmente geram retorno.",
    action: "Ver lucro",
  },
  {
    href: "/produtos",
    number: "04",
    title: "Capital & Estoque",
    question: "Repor, manter ou parar?",
    description:
      "Use giro, cobertura e margem para decidir onde colocar mais capital e quais produtos precisam de atenção.",
    action: "Ver produtos",
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
              O Mercado Livre mostra dados. <em>O Radar transforma em decisão.</em>
            </h1>
            <p className="hero-copy">
              Descubra o que comprar, o máximo que pode pagar, quanto realmente
              lucrou e quando faz sentido repor estoque.
            </p>
          </div>
          <div className="pill">20% margem · 30% ROI · ajustável</div>
        </header>

        <section className="value-pillars route-pillars" aria-label="Áreas do Mercado Radar">
          {pillars.map((pillar) => (
            <Link className="value-pillar route-pillar" href={pillar.href} key={pillar.href}>
              <span className="value-pillar-number">{pillar.number}</span>
              <div>
                <span className="value-pillar-title">{pillar.title}</span>
                <strong>{pillar.question}</strong>
                <p>{pillar.description}</p>
                <span className="route-pillar-action">{pillar.action} →</span>
              </div>
            </Link>
          ))}
        </section>

        <section className="radar-promise">
          <span className="eyebrow">Regra do produto</span>
          <strong>
            Se uma informação puder ser descoberta com segurança, o Radar não
            deve pedir que você digite.
          </strong>
          <p>
            Categoria, tarifas, frete, faixa de mercado e embalagem estimada
            são preenchidos automaticamente quando houver evidência suficiente.
          </p>
        </section>
      </section>
    </main>
  );
}

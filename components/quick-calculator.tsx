"use client";

import { useState } from "react";

// Calculadora única: a mesma regra da extensão (/api/calculator usa o mesmo
// código de /api/extension/profitability). Só o anúncio é obrigatório.

type Assumption = { field: string; text: string; material: boolean };
type Response = {
  error?: string;
  availability?: "READY" | "ASSUMED" | "PARTIAL" | "REVERSE";
  item?: { title: string; price: number; isOwn: boolean };
  fees?: { commissionPercent: number | null; fixedFee: number | null; shippingCost: number | null; taxPercent: number | null };
  assumptions?: Assumption[];
  note?: string;
  reverse?: {
    forTargetMargin: number | null;
    forTargetRoi?: number | null;
    maximumSupplierCost?: number | null;
    limitingTarget?: "margin" | "ROI" | null;
    breakEven: number | null;
    targetMarginPercent: number;
    targetRoiPercent?: number;
  } | null;
  result?: { profit: number; marginPercent: number; roiPercent: number | null; minimumSuggestedPrice: number | null } | null;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

export function listingIdFrom(text: string): string | null {
  const clean = text.trim().toUpperCase();
  const match = clean.match(/MLBU?-?\d{5,}/);
  return match ? match[0].replace("-", "") : null;
}

function num(value: string): number | undefined {
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return value.trim() && Number.isFinite(n) && n >= 0 ? n : undefined;
}

export function QuickCalculator() {
  const [listing, setListing] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [cost, setCost] = useState("");
  const [shippingCost, setShippingCost] = useState("");
  const [tax, setTax] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState("");

  async function calculate(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setData(null);
    const itemId = listingIdFrom(listing);
    if (!itemId) { setError("Cole o link ou o código do anúncio (ex.: MLB1234567890)."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/calculator", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          itemId,
          ...(num(salePrice) ? { salePrice: num(salePrice) } : {}),
          ...(num(cost) != null ? { supplierPrice: num(cost) } : {}),
          ...(num(shippingCost) != null ? { shippingCost: num(shippingCost) } : {}),
          ...(num(tax) != null ? { taxPercent: num(tax) } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as Response;
      if (!response.ok) throw new Error(body.error || "Não foi possível calcular.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível calcular.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="clean-panel quick-calc" aria-labelledby="quick-calc-title">
      <header>
        <h1 id="quick-calc-title">Calculadora de lucro</h1>
        <p>Sem custo de compra, mostramos o teto que atende margem e ROI. Frete ou imposto ausentes precisam de cotação ou confirmação antes do resultado.</p>
      </header>
      <form onSubmit={calculate} className="quick-calc-form">
        <label className="quick-calc-wide">
          <span>Anúncio do Mercado Livre</span>
          <input value={listing} onChange={(e) => setListing(e.target.value)} placeholder="Link ou código MLB" required />
        </label>
        <label>
          <span>Preço de venda (opcional)</span>
          <input inputMode="decimal" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="Preço atual do anúncio" />
        </label>
        <label>
          <span>Custo do produto (opcional)</span>
          <input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Sem custo? Calculamos o teto" />
        </label>
        <label>
          <span>Frete pago pelo vendedor (opcional)</span>
          <input inputMode="decimal" value={shippingCost} onChange={(e) => setShippingCost(e.target.value)} placeholder="Informe ou confirme zero" />
        </label>
        <label>
          <span>Imposto % (opcional)</span>
          <input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} placeholder="Usa o de Configurações" />
        </label>
        <button type="submit" className="vr-btn" disabled={busy}>{busy ? "Calculando..." : "Calcular"}</button>
      </form>

      {error && <p className="quick-calc-error" role="alert">{error}</p>}

      {data && (
        <div className="quick-calc-result" aria-live="polite">
          {data.item && <p className="quick-calc-item"><strong>{data.item.title}</strong> · vendido a {money.format(data.item.price)}</p>}

          {data.availability === "PARTIAL" && <p className="quick-calc-error">{data.note}</p>}

          {data.reverse && (
            <div className="quick-calc-big">
              <span>Você pode pagar até</span>
              <strong className={(data.reverse.maximumSupplierCost ?? data.reverse.forTargetMargin) == null || (data.reverse.maximumSupplierCost ?? data.reverse.forTargetMargin)! <= 0 ? "danger-value" : "good-value"}>{(data.reverse.maximumSupplierCost ?? data.reverse.forTargetMargin) == null || (data.reverse.maximumSupplierCost ?? data.reverse.forTargetMargin)! <= 0 ? "inviável na meta" : money.format((data.reverse.maximumSupplierCost ?? data.reverse.forTargetMargin)!)}</strong>
              <small>
                por unidade para atingir {pct(data.reverse.targetMarginPercent)} de margem
                {data.reverse.targetRoiPercent != null && ` e ${pct(data.reverse.targetRoiPercent)} de ROI`}.
                {data.reverse.limitingTarget && ` Limite por ${data.reverse.limitingTarget === "ROI" ? "ROI" : "margem"}.`}
                {data.reverse.breakEven != null && ` Acima de ${money.format(data.reverse.breakEven)} você tem prejuízo.`}
              </small>
            </div>
          )}

          {data.result && (
            <div className="quick-calc-big">
              <span>Lucro por venda</span>
              <strong className={data.result.profit < 0 ? "danger-value" : "good-value"}>{money.format(data.result.profit)}</strong>
              <small>
                Margem {pct(data.result.marginPercent)}
                {data.result.roiPercent != null && ` · retorno ${pct(data.result.roiPercent)}`}
                {data.result.minimumSuggestedPrice != null && ` · preço mínimo para a meta ${money.format(data.result.minimumSuggestedPrice)}`}
              </small>
            </div>
          )}

          {data.fees && (
            <dl className="quick-calc-fees">
              <div><dt>Comissão</dt><dd>{data.fees.commissionPercent == null ? "não informada" : pct(data.fees.commissionPercent)}</dd></div>
              <div><dt>Tarifa fixa</dt><dd>{data.fees.fixedFee == null ? "não informada" : money.format(data.fees.fixedFee)}</dd></div>
              <div><dt>Frete pago por você</dt><dd>{data.fees.shippingCost == null ? "não informado" : money.format(data.fees.shippingCost)}</dd></div>
              <div><dt>Imposto</dt><dd>{data.fees.taxPercent == null ? "não informado" : pct(data.fees.taxPercent)}</dd></div>
            </dl>
          )}

          {!!data.assumptions?.length && (
            <ul className="quick-calc-assumptions">
              {data.assumptions.map((a) => (
                <li key={a.field} className={a.material ? "is-material" : ""}>{a.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

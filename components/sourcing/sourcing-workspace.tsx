"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { MarketSignals } from "./market-signals";
import type { ListingInsights } from "@/lib/marketplaces/types";
import {
  api,
  brl,
  dateBr,
  parseNumber,
  pct,
  KIND_LABEL,
  REFERENCE_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
} from "./format";

type Criterion = { key: string; label: string; importance: string; state: "OK" | "PENDENTE" | "FALHA"; detail: string };
type Supplier = {
  id: string;
  name: string;
  kind: string;
  cnpj: string | null;
  website: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  sellsToCpf: boolean | null;
  requiresCnpj: boolean | null;
  issuesInvoice: boolean | null;
  servesSmall: boolean | null;
  minOrderValue: number | null;
  minOrderUnits: number | null;
  leadTimeDays: number | null;
  reputationNote: string | null;
  origin: string;
  originUrl: string | null;
  cnpjCheck: { status: string; statusLabel: string | null; legalName: string | null; mainActivity: string | null; size: string | null; checkedAt: string } | null;
  qualification: { level: string; label: string; confirmed: number; total: number; criteria: Criterion[]; nextAsk: string | null };
};
type Viability = {
  quoteId: string;
  supplierName: string;
  source: string;
  status: string;
  missing: string[];
  order: { minimumUnits: number; units: number; sellableListings: number; goodsCost: number; extraCosts: number; capital: number; limitedBy: string };
  landedUnitCost: number;
  perSale: null | {
    salePrice: number; saleFeeAmount: number; shippingCost: number; purchaseCost: number; operatingCost: number;
    taxAmount: number; profit: number; marginPercent: number; roiPercent: number; verdict: string; breakEvenPrice: number;
  };
  maxUnitCostForTarget: number | null;
  plan: { salesToRecoverCapital: number | null; profitIfAllSold: number | null; monthsOfStock: number | null };
  risks: Array<{ level: string; text: string }>;
};
type Quote = {
  id: string; supplierId: string; unitPrice: number; unitsPerPack: number; minUnits: number | null;
  freightCost: number | null; otherCosts: number | null; exactMatch: boolean | null; source: string;
  evidenceUrl: string | null; quotedAt: string; validUntil: string | null; notes: string | null; viability: Viability;
};
type AiContact = { value: string; verified: boolean } | null;
type Candidate = {
  name: string; url: string; domain: string; kind: string; reasons: string[]; snippet: string | null;
  origin?: "IA"; sources?: Array<{ title: string; url: string }>;
  phone?: AiContact; email?: AiContact; cnpj?: AiContact; city?: string | null; state?: string | null;
  sellsToCpf?: boolean | null; minimumOrder?: string | null;
};
type AiResearch = {
  status: string; message: string | null; model: string | null; webQueries: string[];
  searchEntryPointHtml: string | null; sources: Array<{ title: string; url: string }>; rejected: number;
};
type SearchOutcome = {
  status: string; message: string | null; candidates: Candidate[]; discarded: number;
  queries: Array<{ intent: string; query: string }>; manualLinks: Array<{ label: string; url: string }>; searchedAt: string;
  ai?: AiResearch | null;
};
type View = {
  opportunity: {
    id: string; title: string; mlItemId: string | null; permalink: string | null; brand: string | null; model: string | null;
    gtin: string | null; packQuantity: number | null; referencePrice: number | null; referenceSource: string | null;
    referenceAt: string | null; listingType: string; commissionPercent: number | null; fixedFee: number | null;
    shippingCost: number | null; taxPercent: number | null; operatingCost: number | null; budget: number | null;
    monthlyDemand: number | null; status: string; notes: string | null;
    identity: { facts?: Array<{ label: string; value: string; source: string }>; sourceNotes?: string[]; gtinValid?: boolean | null } | null;
    searchSnapshot: SearchOutcome | null;
    marketInsights: ListingInsights | null;
    marketInsightsAt: string | null;
  };
  sale: { targetMarginPercent: number; taxPercent: number | null; operatingCost: number | null };
  suppliers: Supplier[];
  quotes: Quote[];
  best: Viability | null;
  nextAction: { title: string; detail: string; tab: Tab };
};
type Tab = "mercado" | "fornecedores" | "margem" | "plano";

const TABS: Array<[Tab, string]> = [
  ["mercado", "Preço de venda"],
  ["fornecedores", "Fornecedores"],
  ["margem", "Lucro"],
  ["plano", "Decisão"],
];

function stepDone(view: View, tab: Tab) {
  if (tab === "mercado") return view.opportunity.referencePrice != null;
  if (tab === "fornecedores") return view.suppliers.length > 0;
  if (tab === "margem") return view.quotes.length > 0;
  return ["VIAVEL", "COMPRANDO", "DESCARTADA"].includes(view.opportunity.status);
}

export function SourcingWorkspace({ id }: { id: string }) {
  const [view, setView] = useState<View | null>(null);
  const [tab, setTab] = useState<Tab>("mercado");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const body = await api<View>(`/api/sourcing/opportunities/${id}`);
      setView(body);
      return body;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao carregar.");
      return null;
    }
  }, [id]);

  useEffect(() => {
    void load().then((body) => body && setTab(body.nextAction.tab));
  }, [load]);

  async function patch(data: Record<string, unknown>, message = "Salvo.") {
    setError("");
    try {
      setView(await api<View>(`/api/sourcing/opportunities/${id}`, { method: "PATCH", body: JSON.stringify(data) }));
      setNotice(message);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar.");
    }
  }

  if (!view)
    return (
      <div className="vr">
        {error ? <p className="vr-alert" role="alert">{error}</p> : <p className="vr-muted">Carregando…</p>}
      </div>
    );

  const o = view.opportunity;
  return (
    <div className="vr">
      <nav className="vr-crumbs"><Link href="/onde-comprar">Onde comprar</Link> / Produto</nav>
      <header className="vr-product">
        <div>
          <h1>{o.title}</h1>
          <p className="vr-muted">
            {[o.brand, o.model && `modelo ${o.model}`, o.packQuantity && `${o.packQuantity} un. por anúncio`].filter(Boolean).join(" · ") || "Marca e modelo não informados"}
          </p>
        </div>
        <div className="vr-product-price">
          <span>Você vende por</span>
          <strong className="vr-num">{brl(o.referencePrice)}</strong>
          <span className={`vr-status vr-status--${o.status.toLowerCase()}`}>{STATUS_LABEL[o.status] ?? o.status}</span>
        </div>
      </header>

      <ol className="vr-steps" role="tablist" aria-label="Etapas">
        {TABS.map(([key, label], index) => {
          const done = stepDone(view, key);
          return (
            <li key={key}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={(done ? "is-done " : "") + (view.nextAction.tab === key ? "is-next" : "")}
                onClick={() => setTab(key)}
              >
                <span className="vr-step-num" aria-hidden="true">{done ? "✓" : index + 1}</span>
                <span className="vr-step-label">
                  {label}
                  {key === "fornecedores" && view.suppliers.length > 0 && <small>{view.suppliers.length} cadastrado(s)</small>}
                  {key === "margem" && view.best?.perSale && <small>{pct(view.best.perSale.marginPercent)} de margem</small>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <aside className="vr-next" aria-label="Próximo passo">
        <span className="vr-next-label">Próximo passo</span>
        <strong>{view.nextAction.title}</strong>
        <span>{view.nextAction.detail}</span>
        {tab !== view.nextAction.tab && (
          <button className="vr-btn vr-btn--small" onClick={() => setTab(view.nextAction.tab)}>Ir para {TABS.find(([key]) => key === view.nextAction.tab)?.[1]}</button>
        )}
      </aside>

      {error && <p className="vr-alert" role="alert">{error}</p>}
      {notice && !error && <p className="vr-notice" role="status">{notice}</p>}

      {tab === "mercado" && (
        <MarketTab
          view={view}
          onSave={patch}
          onSignals={async (message) => {
            await load();
            setNotice(message);
          }}
          setError={setError}
        />
      )}
      {tab === "fornecedores" && (
        <SuppliersTab view={view} reload={load} setError={setError} setNotice={setNotice} setView={setView} />
      )}
      {tab === "margem" && <MarginTab view={view} />}
      {tab === "plano" && <PlanTab view={view} onSave={patch} />}
    </div>
  );
}

function numField(form: FormData, name: string) {
  return parseNumber(String(form.get(name) ?? ""));
}

function MarketTab({
  view, onSave, onSignals, setError,
}: {
  view: View;
  onSave: (data: Record<string, unknown>, message?: string) => void;
  onSignals: (message: string) => Promise<unknown>;
  setError: (value: string) => void;
}) {
  const o = view.opportunity;
  const facts = o.identity?.facts ?? [];
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const price = numField(form, "referencePrice");
    onSave(
      {
        brand: String(form.get("brand") ?? "").trim() || null,
        model: String(form.get("model") ?? "").trim() || null,
        gtin: String(form.get("gtin") ?? "").replace(/\D/g, "") || null,
        packQuantity: numField(form, "packQuantity"),
        ...(price !== o.referencePrice ? { referencePrice: price, referenceSource: price == null ? null : "MANUAL" } : {}),
        listingType: form.get("listingType"),
        commissionPercent: numField(form, "commissionPercent"),
        fixedFee: numField(form, "fixedFee"),
        shippingCost: numField(form, "shippingCost"),
        taxPercent: numField(form, "taxPercent"),
        monthlyDemand: numField(form, "monthlyDemand"),
      },
      "Dados de mercado salvos.",
    );
  }
  return (
    <section className="vr-panel">
      <div className="vr-grid-2">
        <div className="vr-card">
          <h2>O que a fonte informa</h2>
          {facts.length ? (
            <dl className="vr-facts">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value} <small>{fact.source === "ATRIBUTO" ? "atributo do anúncio" : "lido do título"}</small></dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="vr-muted">Sem atributos do anúncio. Preencha marca e modelo se souber: eles guiam a busca de fornecedores.</p>
          )}
          {o.identity?.gtinValid === false && <p className="vr-warn">O GTIN informado não passa no dígito verificador.</p>}
          {(o.identity?.sourceNotes ?? []).map((note) => <p key={note} className="vr-warn">{note}</p>)}
          {o.permalink && <p><a href={o.permalink} target="_blank" rel="noopener noreferrer">Abrir anúncio ↗</a></p>}
        </div>
        <form className="vr-card vr-form" onSubmit={submit}>
          <h2>Venda no Mercado Livre</h2>
          <div className="vr-form--row">
            <label>Marca<input name="brand" defaultValue={o.brand ?? ""} /></label>
            <label>Modelo<input name="model" defaultValue={o.model ?? ""} /></label>
          </div>
          <div className="vr-form--row">
            <label>GTIN/EAN<input name="gtin" defaultValue={o.gtin ?? ""} inputMode="numeric" /></label>
            <label>Unidades por anúncio<input name="packQuantity" defaultValue={o.packQuantity ?? ""} inputMode="numeric" /></label>
          </div>
          <div className="vr-form--row">
            <label>Preço de venda (R$)<input name="referencePrice" defaultValue={o.referencePrice ?? ""} inputMode="decimal" /></label>
            <label>Tipo de anúncio
              <select name="listingType" defaultValue={o.listingType}>
                <option value="CLASSIC">Clássico</option>
                <option value="PREMIUM">Premium</option>
              </select>
            </label>
          </div>
          <div className="vr-form--row">
            <label>Comissão (%)<input name="commissionPercent" defaultValue={o.commissionPercent ?? ""} inputMode="decimal" /></label>
            <label>Tarifa fixa (R$)<input name="fixedFee" defaultValue={o.fixedFee ?? ""} inputMode="decimal" /></label>
          </div>
          <div className="vr-form--row">
            <label>Frete pago por você (R$)<input name="shippingCost" defaultValue={o.shippingCost ?? ""} placeholder={o.referencePrice != null && o.referencePrice < 79 ? "vazio = 0 (abaixo de R$ 79 o comprador paga)" : "a confirmar"} inputMode="decimal" /></label>
            <label>Imposto (%)<input name="taxPercent" defaultValue={o.taxPercent ?? ""} placeholder={view.sale.taxPercent != null ? `padrão ${view.sale.taxPercent}%` : "não informado"} inputMode="decimal" /></label>
          </div>
          <label>Vendas por mês observadas (opcional)<input name="monthlyDemand" defaultValue={o.monthlyDemand ?? ""} inputMode="numeric" /></label>
          <p className="vr-hint">Campo vazio fica “a confirmar” e não entra como zero. Tarifa oficial é preenchida quando o Mercado Livre está conectado.</p>
          <button className="vr-btn">Salvar</button>
        </form>
      </div>
      <MarketSignals
        opportunityId={o.id}
        mlItemId={o.mlItemId}
        permalink={o.permalink}
        packQuantity={o.packQuantity}
        insights={o.marketInsights}
        insightsAt={o.marketInsightsAt}
        onChanged={onSignals}
        setError={setError}
      />
    </section>
  );
}

function SuppliersTab({
  view, reload, setError, setNotice, setView,
}: {
  view: View;
  reload: () => Promise<View | null>;
  setError: (value: string) => void;
  setNotice: (value: string) => void;
  setView: (value: View) => void;
}) {
  const o = view.opportunity;
  const [search, setSearch] = useState<SearchOutcome | null>(o.searchSnapshot);
  const [busy, setBusy] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  const [adding, setAdding] = useState<Partial<Supplier> | null>(null);
  const [quoting, setQuoting] = useState<string | null>(null);

  async function runSearch() {
    setBusy("search");
    setError("");
    try {
      const body = await api<{ search: SearchOutcome }>(`/api/sourcing/opportunities/${o.id}/search`, { method: "POST" });
      setSearch(body.search);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na busca.");
    } finally {
      setBusy("");
    }
  }

  async function saveSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tri = (name: string) => {
      const value = String(form.get(name) ?? "");
      return value === "sim" ? true : value === "nao" ? false : null;
    };
    const text = (name: string) => String(form.get(name) ?? "").trim() || null;
    setBusy("supplier");
    setError("");
    try {
      const payload = {
        name: text("name"),
        kind: form.get("kind"),
        cnpj: text("cnpj"),
        website: text("website"),
        phone: text("phone"),
        email: text("email"),
        city: text("city"),
        state: text("state"),
        sellsToCpf: tri("sellsToCpf"),
        requiresCnpj: tri("requiresCnpj"),
        issuesInvoice: tri("issuesInvoice"),
        minOrderUnits: numField(form, "minOrderUnits"),
        minOrderValue: numField(form, "minOrderValue"),
        leadTimeDays: numField(form, "leadTimeDays"),
        reputationNote: text("reputationNote"),
        origin: adding?.origin ?? "MANUAL",
        originUrl: adding?.originUrl ?? null,
      };
      if (adding?.id) {
        await api(`/api/sourcing/suppliers/${adding.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await api("/api/sourcing/suppliers", { method: "POST", body: JSON.stringify({ ...payload, opportunityId: o.id }) });
      }
      setAdding(null);
      setNotice("Fornecedor salvo.");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar fornecedor.");
    } finally {
      setBusy("");
    }
  }

  async function removeSupplier(supplier: Supplier) {
    setBusy(`del-${supplier.id}`);
    setError("");
    try {
      await api(`/api/sourcing/suppliers/${supplier.id}`, { method: "DELETE" });
      setDeleting(null);
      setNotice(`Fornecedor ${supplier.name} excluído.`);
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao excluir.");
    } finally {
      setBusy("");
    }
  }

  async function verifyCnpj(supplier: Supplier) {
    setBusy(`cnpj-${supplier.id}`);
    setError("");
    try {
      await api(`/api/sourcing/suppliers/${supplier.id}/cnpj`, { method: "POST" });
      setNotice("Situação cadastral consultada na base pública da Receita.");
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha na consulta.");
    } finally {
      setBusy("");
    }
  }

  async function saveQuote(event: FormEvent<HTMLFormElement>, supplierId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const match = String(form.get("exactMatch") ?? "");
    setBusy("quote");
    setError("");
    try {
      const body = await api<View>("/api/sourcing/quotes", {
        method: "POST",
        body: JSON.stringify({
          opportunityId: o.id,
          supplierId,
          unitPrice: numField(form, "unitPrice"),
          unitsPerPack: numField(form, "unitsPerPack") ?? 1,
          minUnits: numField(form, "minUnits"),
          freightCost: numField(form, "freightCost"),
          otherCosts: numField(form, "otherCosts"),
          exactMatch: match === "sim" ? true : match === "nao" ? false : null,
          source: form.get("source"),
          evidenceUrl: String(form.get("evidenceUrl") ?? "").trim() || null,
          notes: String(form.get("notes") ?? "").trim() || null,
        }),
      });
      setView(body);
      setQuoting(null);
      setNotice("Cotação registrada. Veja a margem.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao salvar cotação.");
    } finally {
      setBusy("");
    }
  }

  async function removeQuote(quoteId: string) {
    setError("");
    try {
      setView(await api<View>(`/api/sourcing/quotes/${quoteId}`, { method: "DELETE" }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Falha ao remover.");
    }
  }

  const known = new Set(view.suppliers.map((s) => s.originUrl).filter(Boolean));

  return (
    <section className="vr-panel">
      <div className="vr-card">
        <div className="vr-card-head">
          <h2>Onde comprar este produto?</h2>
          <button className="vr-btn" onClick={runSearch} disabled={busy === "search"}>
            {busy === "search" ? "Buscando…" : search ? "Buscar de novo" : "Buscar fornecedores"}
          </button>
        </div>
        <p className="vr-muted">
          A busca parte da marca, descarta varejo e mostra fabricantes, distribuidores, atacadistas e lojas de volume. Candidato não é fornecedor confirmado: qualifique antes de comprar.
        </p>
        {search && (
          <>
            {search.message && <p className="vr-warn">{search.message}</p>}
            {search.candidates.length > 0 && (
              <ul className="vr-candidates">
                {search.candidates.map((candidate) => (
                  <li key={candidate.url}>
                    <div>
                      <span className="vr-tag">{KIND_LABEL[candidate.kind] ?? candidate.kind}</span>
                      <strong>{candidate.name}</strong>
                      <a href={candidate.url} target="_blank" rel="noopener noreferrer">{candidate.domain} ↗</a>
                      <small>{candidate.reasons.join(" · ")}</small>
                      {candidate.origin === "IA" && <AiDetails candidate={candidate} />}
                    </div>
                    <button
                      className="vr-btn vr-btn--ghost vr-btn--small"
                      disabled={known.has(candidate.url)}
                      onClick={() =>
                        setAdding({
                          name: candidate.name,
                          kind: candidate.kind,
                          website: candidate.url,
                          origin: "BUSCA_WEB",
                          originUrl: candidate.url,
                          // Só entra no cadastro o contato confirmado na página; CNPJ é conferido na Receita depois.
                          phone: candidate.phone?.verified ? candidate.phone.value : null,
                          email: candidate.email?.verified ? candidate.email.value : null,
                          cnpj: candidate.cnpj?.value ?? null,
                          city: candidate.city ?? null,
                          state: candidate.state ?? null,
                          sellsToCpf: candidate.sellsToCpf ?? null,
                        })
                      }
                    >
                      {known.has(candidate.url) ? "Já adicionado" : "Adicionar"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {search.ai && <AiResearchNote research={search.ai} />}
            <div className="vr-manual">
              <span>Pesquise no seu navegador:</span>
              {search.manualLinks.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>
              ))}
            </div>
            <p className="vr-hint">Busca de {dateBr(search.searchedAt)}{search.discarded ? ` · ${search.discarded} resultado(s) de varejo ou sem sinal comercial descartado(s)` : ""}.</p>
          </>
        )}
        <button className="vr-btn vr-btn--ghost" onClick={() => setAdding({ kind: "OUTRO" })}>Cadastrar fornecedor que já conheço</button>
      </div>

      {adding && (
        <form className="vr-card vr-form" onSubmit={saveSupplier}>
          <h2>{adding.id ? "Editar ficha do fornecedor" : "Ficha do fornecedor"}</h2>
          <div className="vr-form--row">
            <label>Nome<input name="name" required defaultValue={adding.name ?? ""} /></label>
            <label>Tipo
              <select name="kind" defaultValue={adding.kind ?? "OUTRO"}>
                {Object.entries(KIND_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <div className="vr-form--row">
            <label>CNPJ<input name="cnpj" defaultValue={adding.cnpj ?? ""} inputMode="numeric" /></label>
            <label>Site<input name="website" defaultValue={adding.website ?? ""} inputMode="url" /></label>
          </div>
          <div className="vr-form--row">
            <label>Telefone / WhatsApp<input name="phone" defaultValue={adding.phone ?? ""} /></label>
            <label>E-mail<input name="email" type="email" defaultValue={adding.email ?? ""} /></label>
          </div>
          <div className="vr-form--row">
            <label>Cidade<input name="city" defaultValue={adding.city ?? ""} /></label>
            <label>UF<input name="state" maxLength={2} defaultValue={adding.state ?? ""} /></label>
          </div>
          <div className="vr-form--row vr-form--three">
            <TriSelect name="sellsToCpf" label="Vende para CPF?" value={adding.sellsToCpf} />
            <TriSelect name="requiresCnpj" label="Exige CNPJ?" value={adding.requiresCnpj} />
            <TriSelect name="issuesInvoice" label="Emite nota fiscal?" value={adding.issuesInvoice} />
          </div>
          <div className="vr-form--row vr-form--three">
            <label>Pedido mínimo (un.)<input name="minOrderUnits" defaultValue={adding.minOrderUnits ?? ""} inputMode="numeric" /></label>
            <label>Pedido mínimo (R$)<input name="minOrderValue" defaultValue={adding.minOrderValue ?? ""} inputMode="decimal" /></label>
            <label>Prazo (dias)<input name="leadTimeDays" defaultValue={adding.leadTimeDays ?? ""} inputMode="numeric" /></label>
          </div>
          <label>Evidência de reputação<input name="reputationNote" defaultValue={adding.reputationNote ?? ""} placeholder="Ex.: Reclame Aqui 8,1; indicação de outro vendedor; compra anterior" /></label>
          <div className="vr-actions">
            <button className="vr-btn" disabled={busy === "supplier"}>Salvar fornecedor</button>
            <button type="button" className="vr-btn vr-btn--ghost" onClick={() => setAdding(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {view.suppliers.map((supplier) => {
        const quotes = view.quotes.filter((quote) => quote.supplierId === supplier.id);
        return (
          <article key={supplier.id} className="vr-card vr-supplier">
            <header className="vr-card-head">
              <div>
                <span className="vr-tag">{KIND_LABEL[supplier.kind] ?? supplier.kind}</span>
                <h3>{supplier.name}</h3>
                <p className="vr-muted">
                  {[supplier.city && supplier.state ? `${supplier.city}/${supplier.state}` : supplier.state, supplier.cnpj && `CNPJ ${supplier.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}`].filter(Boolean).join(" · ") || "Localização e CNPJ a confirmar"}
                </p>
              </div>
              <span className={`vr-level vr-level--${supplier.qualification.level.toLowerCase()}`}>
                {supplier.qualification.label} · {supplier.qualification.confirmed}/{supplier.qualification.total}
              </span>
            </header>
            <ul className="vr-criteria">
              {supplier.qualification.criteria.map((criterion) => (
                <li key={criterion.key} className={`vr-crit vr-crit--${criterion.state.toLowerCase()}`}>
                  <span className="vr-crit-mark" aria-hidden>{criterion.state === "OK" ? "✓" : criterion.state === "FALHA" ? "✕" : "?"}</span>
                  <span>
                    <strong>{criterion.label}</strong>
                    <small>{criterion.detail}{criterion.importance === "ESSENCIAL" ? " · essencial" : ""}</small>
                  </span>
                </li>
              ))}
            </ul>
            {supplier.cnpjCheck && (
              <p className="vr-hint">
                Base pública da Receita (BrasilAPI), {dateBr(supplier.cnpjCheck.checkedAt)}: {supplier.cnpjCheck.legalName ?? "razão social não informada"}
                {supplier.cnpjCheck.mainActivity ? ` · ${supplier.cnpjCheck.mainActivity}` : ""}. CNPJ ativo comprova cadastro, não confiabilidade.
              </p>
            )}
            {quotes.map((quote) => (
              <div key={quote.id} className="vr-quote">
                <span className={`vr-source vr-source--${quote.source.toLowerCase()}`}>{SOURCE_LABEL[quote.source]}</span>
                <span className="vr-num">{brl(quote.unitPrice)} / peça</span>
                <span>mín. {quote.viability.order.minimumUnits.toLocaleString("pt-BR")} un. · frete {quote.freightCost == null ? "a confirmar" : brl(quote.freightCost)} · {dateBr(quote.quotedAt)}</span>
                {quote.evidenceUrl && <a href={quote.evidenceUrl} target="_blank" rel="noopener noreferrer">evidência ↗</a>}
                <button className="vr-link" onClick={() => removeQuote(quote.id)}>remover</button>
              </div>
            ))}
            <div className="vr-actions">
              {supplier.qualification.nextAsk && <span className="vr-ask">Pergunte: {supplier.qualification.nextAsk}</span>}
              <button className="vr-btn vr-btn--small" onClick={() => setQuoting(quoting === supplier.id ? null : supplier.id)}>Registrar cotação</button>
              {supplier.cnpj && (
                <button className="vr-btn vr-btn--ghost vr-btn--small" onClick={() => verifyCnpj(supplier)} disabled={busy === `cnpj-${supplier.id}`}>
                  {busy === `cnpj-${supplier.id}` ? "Consultando…" : "Verificar CNPJ"}
                </button>
              )}
              <button className="vr-btn vr-btn--ghost vr-btn--small" onClick={() => setAdding(supplier)}>Editar ficha</button>
              {deleting === supplier.id ? (
                <span className="vr-confirm">
                  Excluir {supplier.name} e as cotações dele em todos os produtos?
                  <button className="vr-btn vr-btn--small vr-btn--danger" disabled={busy === `del-${supplier.id}`} onClick={() => removeSupplier(supplier)}>
                    {busy === `del-${supplier.id}` ? "Excluindo…" : "Sim, excluir"}
                  </button>
                  <button className="vr-btn vr-btn--ghost vr-btn--small" onClick={() => setDeleting(null)}>Voltar</button>
                </span>
              ) : (
                <button className="vr-link" onClick={() => setDeleting(supplier.id)}>Excluir</button>
              )}
              {supplier.website && <a href={supplier.website} target="_blank" rel="noopener noreferrer">Site ↗</a>}
            </div>
            {quoting === supplier.id && (
              <form className="vr-form vr-quote-form" onSubmit={(event) => saveQuote(event, supplier.id)}>
                <div className="vr-form--row vr-form--three">
                  <label>Preço por peça (R$)<input name="unitPrice" required inputMode="decimal" placeholder="0,04" /></label>
                  <label>Peças por embalagem<input name="unitsPerPack" inputMode="numeric" placeholder="1000" /></label>
                  <label>Mínimo (peças)<input name="minUnits" inputMode="numeric" /></label>
                </div>
                <div className="vr-form--row vr-form--three">
                  <label>Frete até você (R$)<input name="freightCost" inputMode="decimal" placeholder="a confirmar" /></label>
                  <label>Outros custos (R$)<input name="otherCosts" inputMode="decimal" /></label>
                  <TriSelect name="exactMatch" label="Mesmo produto do anúncio?" value={null} />
                </div>
                <div className="vr-form--row">
                  <label>Origem do preço
                    <select name="source" required defaultValue="COTACAO_RECEBIDA">
                      <option value="COTACAO_RECEBIDA">Cotação recebida do fornecedor</option>
                      <option value="PRECO_PUBLICADO">Preço publicado no site/catálogo</option>
                      <option value="ESTIMATIVA_USUARIO">Estimativa minha (não confirmada)</option>
                    </select>
                  </label>
                  <label>Link da evidência<input name="evidenceUrl" inputMode="url" placeholder="https://" /></label>
                </div>
                <div className="vr-actions">
                  <button className="vr-btn" disabled={busy === "quote"}>Salvar cotação</button>
                  <button type="button" className="vr-btn vr-btn--ghost" onClick={() => setQuoting(null)}>Cancelar</button>
                </div>
              </form>
            )}
          </article>
        );
      })}
    </section>
  );
}

function TriSelect({ name, label, value }: { name: string; label: string; value: boolean | null | undefined }) {
  return (
    <label>
      {label}
      <select name={name} defaultValue={value === true ? "sim" : value === false ? "nao" : ""}>
        <option value="">A confirmar</option>
        <option value="sim">Sim</option>
        <option value="nao">Não</option>
      </select>
    </label>
  );
}

const VERDICT: Record<string, [string, string]> = {
  GOOD: ["Compensa", "ok"],
  TIGHT: ["Apertado", "warn"],
  BAD: ["Não compensa", "risk"],
};

function MarginTab({ view }: { view: View }) {
  const best = view.best;
  if (!view.quotes.length)
    return (
      <section className="vr-panel">
        <div className="vr-card"><p className="vr-muted">Sem custo de fornecedor ainda. Registre uma cotação na aba Fornecedores para ver a margem real.</p></div>
      </section>
    );
  return (
    <section className="vr-panel">
      {best?.perSale && (
        <div className="vr-card">
          <div className="vr-card-head">
            <h2>Melhor cenário · {best.supplierName}</h2>
            <span className={`vr-verdict vr-verdict--${VERDICT[best.perSale.verdict]?.[1]}`}>{VERDICT[best.perSale.verdict]?.[0]}</span>
          </div>
          <Waterfall v={best} />
          <p className="vr-hint">
            Custo entregue de {brl(best.landedUnitCost)} por peça (preço + frete e custos rateados no lote de {best.order.units.toLocaleString("pt-BR")} un.). Origem: {SOURCE_LABEL[best.source]}.
            {best.maxUnitCostForTarget != null && ` Para a meta de ${view.sale.targetMarginPercent}% de margem, o custo de compra pode ir até ${brl(best.maxUnitCostForTarget)} por peça.`}
          </p>
        </div>
      )}
      <div className="vr-card">
        <h2>Comparar fornecedores</h2>
        <div className="vr-table-wrap">
          <table className="vr-table">
            <thead>
              <tr><th>Fornecedor</th><th>Origem</th><th className="num">Custo entregue/peça</th><th className="num">Lucro/venda</th><th className="num">Margem</th><th className="num">Lote mínimo</th></tr>
            </thead>
            <tbody>
              {view.quotes.map((quote) => {
                const v = quote.viability;
                return (
                  <tr key={quote.id}>
                    <td>{v.supplierName}</td>
                    <td><span className={`vr-source vr-source--${v.source.toLowerCase()}`}>{SOURCE_LABEL[v.source]}</span></td>
                    <td className="num">{brl(v.landedUnitCost)}</td>
                    <td className={`num ${v.perSale ? (v.perSale.profit > 0 ? "vr-pos" : "vr-neg") : ""}`}>{v.perSale ? brl(v.perSale.profit) : "falta dado"}</td>
                    <td className="num">{v.perSale ? pct(v.perSale.marginPercent) : "—"}</td>
                    <td className="num">{brl(v.order.minimumUnits * quote.unitPrice + v.order.extraCosts)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {best?.status === "FALTAM_DADOS" && <p className="vr-warn">Para calcular a margem falta: {best.missing.join(", ")}. Preencha na aba Mercado.</p>}
      </div>
    </section>
  );
}

function Waterfall({ v }: { v: Viability }) {
  const p = v.perSale!;
  const rows: Array<[string, number, string]> = [
    ["Preço de venda", p.salePrice, "base"],
    ["Tarifa do Mercado Livre", -p.saleFeeAmount, "cost"],
    ["Frete do vendedor", -p.shippingCost, "cost"],
    ["Imposto", -p.taxAmount, "cost"],
    ["Custo operacional", -p.operatingCost, "cost"],
    ["Custo do produto (entregue)", -p.purchaseCost, "cost"],
    ["Lucro por venda", p.profit, p.profit > 0 ? "pos" : "neg"],
  ];
  const max = Math.max(p.salePrice, 1);
  return (
    <ul className="vr-waterfall">
      {rows.map(([label, value, kind]) => (
        <li key={label} className={`vr-wf vr-wf--${kind}`}>
          <span>{label}</span>
          <span className="vr-wf-bar"><span style={{ width: `${Math.min(100, (Math.abs(value) / max) * 100)}%` }} /></span>
          <span className="vr-num">{brl(value)}</span>
        </li>
      ))}
      <li className="vr-wf-foot">Margem {pct(p.marginPercent)} · ROI {pct(p.roiPercent)} · preço de equilíbrio {brl(p.breakEvenPrice)}</li>
    </ul>
  );
}

const LIMIT_LABEL: Record<string, string> = {
  PEDIDO_MINIMO: "pedido mínimo do fornecedor",
  ORCAMENTO: "seu orçamento",
  DEMANDA: "giro de ~2 meses observado",
};

function PlanTab({ view, onSave }: { view: View; onSave: (data: Record<string, unknown>, message?: string) => void }) {
  const best = view.best;
  const o = view.opportunity;
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({ budget: numField(form, "budget"), notes: String(form.get("notes") ?? "").trim() || null }, "Plano salvo.");
  }
  return (
    <section className="vr-panel">
      <div className="vr-grid-2">
        <div className="vr-card">
          <h2>Plano de compra</h2>
          {!best ? (
            <p className="vr-muted">Registre uma cotação para montar o plano.</p>
          ) : (
            <>
              <dl className="vr-kpis">
                <div><dt>Comprar</dt><dd className="vr-num">{best.order.units.toLocaleString("pt-BR")} un.</dd><small>limitado pelo {LIMIT_LABEL[best.order.limitedBy]}</small></div>
                <div><dt>Investimento</dt><dd className="vr-num">{brl(best.order.capital)}</dd><small>produto {brl(best.order.goodsCost)} + frete/outros {brl(best.order.extraCosts)}</small></div>
                <div><dt>Anúncios vendáveis</dt><dd className="vr-num">{best.order.sellableListings}</dd><small>{o.packQuantity ?? 1} un. por venda</small></div>
                <div><dt>Vendas para recuperar</dt><dd className="vr-num">{best.plan.salesToRecoverCapital ?? "—"}</dd><small>{best.plan.profitIfAllSold != null ? `lucro se vender tudo: ${brl(best.plan.profitIfAllSold)}` : "margem ainda não calculada"}</small></div>
              </dl>
              {best.plan.monthsOfStock != null && <p className="vr-hint">Estoque para cerca de {best.plan.monthsOfStock.toLocaleString("pt-BR")} mês(es) no giro informado.</p>}
              <h3>Riscos</h3>
              {best.risks.length ? (
                <ul className="vr-risks">
                  {best.risks.map((risk) => <li key={risk.text} className={`vr-risk vr-risk--${risk.level.toLowerCase()}`}>{risk.text}</li>)}
                </ul>
              ) : <p className="vr-muted">Nenhum risco registrado com os dados atuais.</p>}
            </>
          )}
        </div>
        <form className="vr-card vr-form" onSubmit={submit}>
          <h2>Decisão</h2>
          <label>Quanto pode investir neste produto (R$)<input name="budget" defaultValue={o.budget ?? ""} inputMode="decimal" /></label>
          <label>Anotações<textarea name="notes" rows={4} defaultValue={o.notes ?? ""} /></label>
          <button className="vr-btn">Salvar plano</button>
          <div className="vr-status-actions" role="group" aria-label="Status">
            {(["COTANDO", "VIAVEL", "COMPRANDO", "DESCARTADA"] as const).map((status) => (
              <button key={status} type="button" className="vr-btn vr-btn--ghost vr-btn--small" aria-pressed={o.status === status} onClick={() => onSave({ status }, `Marcado como ${STATUS_LABEL[status].toLowerCase()}.`)}>
                {STATUS_LABEL[status]}
              </button>
            ))}
          </div>
          <p className="vr-hint">Depois de comprar, use “Criar anúncio” e “Monitoramento” para acompanhar a concorrência e o resultado.</p>
        </form>
      </div>
    </section>
  );
}

function ContactLine({ label, contact }: { label: string; contact: AiContact | undefined }) {
  if (!contact) return null;
  return (
    <span className={contact.verified ? "vr-contact is-verified" : "vr-contact"}>
      {label}: {contact.value} <em>{contact.verified ? "confirmado na página" : "a confirmar"}</em>
    </span>
  );
}

function AiDetails({ candidate }: { candidate: Candidate }) {
  return (
    <div className="vr-ai">
      <ContactLine label="Telefone" contact={candidate.phone} />
      <ContactLine label="E-mail" contact={candidate.email} />
      <ContactLine label="CNPJ" contact={candidate.cnpj} />
      {(candidate.city || candidate.state) && <span className="vr-contact">{[candidate.city, candidate.state].filter(Boolean).join(" / ")}</span>}
      {candidate.minimumOrder && <span className="vr-contact">Pedido mínimo: {candidate.minimumOrder} <em>a confirmar</em></span>}
      {candidate.sources?.length ? (
        <span className="vr-sources">
          Fonte:{" "}
          {candidate.sources.map((source) => (
            <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer nofollow">{source.title} ↗</a>
          ))}
        </span>
      ) : null}
    </div>
  );
}

function AiResearchNote({ research }: { research: AiResearch }) {
  return (
    <div className="vr-ai-note">
      <p className="vr-hint">
        Pesquisa com IA ({research.model ?? "Gemini"} + Google Search): só ficam fornecedores com site entre as fontes do Google
        {research.rejected ? `; ${research.rejected} sugestão(ões) sem fonte ou de varejo descartada(s)` : ""}. Preço nunca vem da IA.
      </p>
      {research.status !== "OK" && research.message && <p className="vr-warn">{research.message}</p>}
      {research.searchEntryPointHtml && (
        <iframe
          className="vr-search-entry"
          title="Sugestões de pesquisa do Google"
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          srcDoc={research.searchEntryPointHtml}
        />
      )}
    </div>
  );
}

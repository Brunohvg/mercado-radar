"use client";

import { useState } from "react";

export type InsightMarket = {
  count: number;
  minimum: number | null;
  p25: number | null;
  median: number | null;
  p75: number | null;
  maximum: number | null;
  gapToMedian: number | null;
  cheaperThanYou?: number | null;
  source?: "EXTENSAO" | "CATALOGO" | "BUSCA" | "SEM_DADOS";
  notice?: string | null;
};

export type InsightData = {
  ranking: { position: number | null; searched: number; source?: string; capturedAt?: string | null };
  market: InsightMarket;
  profitability: { profit: number; marginPercent: number; roiPercent: number; breakEvenPrice: number; minimumSuggestedPrice: number } | null;
  profitabilityNote?: string | null;
  strategy: { action: "HOLD" | "RAISE" | "REDUCE" | "RAISE_OR_EXIT"; recommendedPrice: number; safeFloor: number; marketReferencePrice: number; message: string; caveat: string } | null;
  competitors: Array<{ id: string; title: string; price: number | null; freeShipping: boolean; searchPosition?: number | null; logisticType?: string | null; source?: string }>;
  catalogCompetition?: { status: string | null; priceToWin: number | null } | null;
};

export type EditableListing = {
  mlItemId: string;
  currentPrice: number | null;
  availableQuantity: number;
  status: string;
  permalink: string | null;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const pct = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
function parsePrice(raw: string) {
  const text = raw.trim();
  if (/^\d+(?:\.\d{1,2})?$/.test(text)) return Number(text);
  if (/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text))
    return Number(text.replace(/\./g, "").replace(",", "."));
  return NaN;
}

const SOURCE: Record<NonNullable<InsightMarket["source"]>, string> = {
  EXTENSAO: "capturado pela extensão na busca do ML",
  CATALOGO: "ofertas de catálogo lidas agora na API do ML",
  BUSCA: "busca do ML lida agora",
  SEM_DADOS: "sem dados de concorrência",
};

const ACTION: Record<NonNullable<InsightData["strategy"]>["action"], string> = {
  HOLD: "Manter o preço",
  RAISE: "Dá para subir o preço",
  REDUCE: "Baixar, sem passar do piso",
  RAISE_OR_EXIT: "Subir ou sair deste produto",
};

export function ListingInsightPanel({
  item,
  insight,
  onEdited,
}: {
  item: EditableListing;
  insight: InsightData | null;
  onEdited: (patch: Partial<EditableListing>) => void;
}) {
  const m = insight?.market;
  const price = item.currentPrice;
  const [draftPrice, setDraftPrice] = useState<string | null>(null);

  return (
    <div className="insight2">
      <ListingEditor item={item} presetPrice={draftPrice} onEdited={onEdited} />
      {insight && m && <>
      <section className="insight2-market" aria-label="Seu preço no mercado">
        <header>
          <strong>Seu preço no mercado</strong>
          <small>{m.count ? `${m.count} ofertas · ${SOURCE[m.source ?? "EXTENSAO"]}` : SOURCE.SEM_DADOS}</small>
        </header>
        {m.count > 0 && m.minimum != null && m.maximum != null && price != null ? (
          <>
            <p className="insight2-headline">
              {m.cheaperThanYou != null
                ? m.cheaperThanYou === 0
                  ? "Você tem o menor preço entre as ofertas lidas."
                  : `${m.cheaperThanYou} de ${m.count} ofertas estão mais baratas que você.`
                : m.gapToMedian != null
                  ? `Seu preço está ${m.gapToMedian >= 0 ? pct(m.gapToMedian) + " acima" : pct(-m.gapToMedian) + " abaixo"} da mediana.`
                  : ""}
              {m.median != null && ` Mediana ${money.format(m.median)}.`}
            </p>
            <PriceBar min={m.minimum} max={m.maximum} median={m.median} mine={price} floor={insight.strategy?.safeFloor ?? null} />
          </>
        ) : (
          <p className="insight2-empty">
            {m.notice ??
              "Não achamos ofertas comparáveis pela API. Abra a busca deste produto no Mercado Livre com a extensão ativa para capturar os concorrentes."}
          </p>
        )}
        {m.notice && m.count > 0 && <p className="insight2-note">{m.notice}</p>}
        {insight.catalogCompetition?.priceToWin != null && (
          <p className="insight2-note">Preço para ganhar o catálogo: <b>{money.format(insight.catalogCompetition.priceToWin)}</b>.</p>
        )}
        {insight.ranking.source === "EXTENSION_SEARCH" ? (
          <p className="insight2-note">
            Posição na busca: {insight.ranking.position == null ? `fora dos ${insight.ranking.searched} primeiros` : `#${insight.ranking.position}`}
            {insight.ranking.capturedAt ? ` (capturada em ${new Date(insight.ranking.capturedAt).toLocaleDateString("pt-BR")})` : ""}.
          </p>
        ) : null}
      </section>

      <section className="insight2-money" aria-label="Lucro e recomendação">
        <header><strong>Lucro e o que fazer</strong></header>
        {insight.profitability ? (
          <dl className="insight2-kv">
            <div><dt>Lucro por venda</dt><dd className={insight.profitability.profit < 0 ? "danger-value" : "good-value"}>{money.format(insight.profitability.profit)}</dd></div>
            <div><dt>Margem</dt><dd>{pct(insight.profitability.marginPercent)}</dd></div>
            <div><dt>Empata em</dt><dd>{money.format(insight.profitability.breakEvenPrice)}</dd></div>
          </dl>
        ) : (
          <p className="insight2-empty">{insight.profitabilityNote ?? "Cadastre o custo do produto para ver lucro e piso."}</p>
        )}
        {insight.strategy && (
          <div className={`insight2-reco insight2-reco--${insight.strategy.action.toLowerCase()}`}>
            <strong>{ACTION[insight.strategy.action]}</strong>
            <p>{insight.strategy.message}</p>
            <p className="insight2-reco-nums">
              Sugerido <b>{money.format(insight.strategy.recommendedPrice)}</b> · piso <b>{money.format(insight.strategy.safeFloor)}</b>
            </p>
            {price != null && Math.abs(insight.strategy.recommendedPrice - price) >= 0.01 && (
              <button
                type="button"
                className="vr-btn vr-btn--small vr-btn--ghost"
                onClick={() => setDraftPrice(insight.strategy!.recommendedPrice.toFixed(2).replace(".", ","))}
              >
                Usar {money.format(insight.strategy.recommendedPrice)} na edição
              </button>
            )}
          </div>
        )}
      </section>

      {insight.competitors.length > 0 && (
        <section className="insight2-competitors" aria-label="Concorrentes">
          <header><strong>Concorrentes mais baratos</strong></header>
          <ol>
            {[...insight.competitors]
              .filter((c) => c.price != null)
              .sort((a, b) => a.price! - b.price!)
              .slice(0, 6)
              .map((c) => (
                <li key={c.id}>
                  <a href={`https://produto.mercadolivre.com.br/${c.id.replace(/^MLB/, "MLB-")}`} target="_blank" rel="noreferrer" title={c.title}>
                    {c.title}
                  </a>
                  <small>
                    {c.source === "CATALOG_WINNER" ? "vencedor do catálogo" : c.searchPosition ? `#${c.searchPosition} na busca` : c.id}
                    {c.freeShipping ? " · frete grátis" : ""}
                    {c.logisticType === "fulfillment" ? " · Full" : ""}
                  </small>
                  <b className={price != null && c.price! < price ? "danger-value" : undefined}>{money.format(c.price!)}</b>
                </li>
              ))}
          </ol>
        </section>
      )}
      </>}
    </div>
  );
}

function PriceBar({ min, max, median, mine, floor }: { min: number; max: number; median: number | null; mine: number; floor: number | null }) {
  const lo = Math.min(min, mine, floor ?? min);
  const hi = Math.max(max, mine);
  const at = (v: number) => `${hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100}%`;
  return (
    <div className="insight2-bar" role="img" aria-label={`Ofertas de ${money.format(min)} a ${money.format(max)}; você em ${money.format(mine)}`}>
      <div className="insight2-bar-track">
        <span className="insight2-bar-range" style={{ left: at(min), width: `calc(${at(max)} - ${at(min)})` }} />
        {floor != null && <span className="insight2-bar-floor" style={{ left: at(floor) }} title={`Seu piso ${money.format(floor)}`} />}
        {median != null && <span className="insight2-bar-median" style={{ left: at(median) }} title={`Mediana ${money.format(median)}`} />}
        <span className="insight2-bar-mine" style={{ left: at(mine) }} title={`Você ${money.format(mine)}`} />
      </div>
      <div className="insight2-bar-legend">
        <span>{money.format(min)}</span>
        <span className="insight2-legend-mine">● você {money.format(mine)}</span>
        {median != null && <span className="insight2-legend-median">│ mediana</span>}
        {floor != null && <span className="insight2-legend-floor">┆ seu piso</span>}
        <span>{money.format(max)}</span>
      </div>
    </div>
  );
}

function ListingEditor({
  item,
  presetPrice,
  onEdited,
}: {
  item: EditableListing;
  presetPrice: string | null;
  onEdited: (patch: Partial<EditableListing>) => void;
}) {
  const initialPrice = item.currentPrice == null ? "" : item.currentPrice.toFixed(2).replace(".", ",");
  const [price, setPrice] = useState(initialPrice);
  const [stock, setStock] = useState(String(item.availableQuantity));
  const [status, setStatus] = useState(item.status === "paused" ? "paused" : "active");
  const [confirming, setConfirming] = useState(false);
  const [belowFloor, setBelowFloor] = useState(false);
  const [variationCount, setVariationCount] = useState<number | null>(null);
  const [variationConfirmed, setVariationConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const [lastPreset, setLastPreset] = useState<string | null>(null);

  if (presetPrice && presetPrice !== lastPreset) {
    setLastPreset(presetPrice);
    setPrice(presetPrice);
    resetReview();
  }

  const editable = item.status === "active" || item.status === "paused";
  const priceValue = parsePrice(price);
  const stockValue = /^\d+$/.test(stock.trim()) ? Number(stock) : null;
  const stockValid = stockValue !== null && Number.isSafeInteger(stockValue) && stockValue <= 99_999;
  const changes: string[] = [];
  if (item.currentPrice != null && Number.isFinite(priceValue) && Math.abs(priceValue - item.currentPrice) >= 0.005)
    changes.push(`preço ${money.format(item.currentPrice)} → ${money.format(priceValue)}`);
  if (stockValid && stockValue !== item.availableQuantity) changes.push(`estoque ${item.availableQuantity} → ${stockValue}`);
  if (status !== item.status) changes.push(status === "paused" ? "pausar" : "reativar");
  const valid = priceValue > 0 && priceValue <= 1_000_000 && stockValid;

  function resetReview() {
    setConfirming(false);
    setBelowFloor(false);
    setVariationCount(null);
    setVariationConfirmed(false);
    setError("");
    setDone("");
  }

  async function apply(allowBelowFloor = false) {
    if (busy || !valid || !changes.length) return;
    setBusy(true);
    setError("");
    const body: Record<string, unknown> = {
      mlItemId: item.mlItemId,
      expected: { price: item.currentPrice, availableQuantity: item.availableQuantity, status: item.status },
      confirm: true,
      allowBelowFloor,
      confirmVariationPrice: variationConfirmed,
    };
    if (item.currentPrice != null && Math.abs(priceValue - item.currentPrice) >= 0.005) body.price = priceValue;
    if (stockValue !== item.availableQuantity) body.availableQuantity = stockValue;
    if (status !== item.status) body.status = status;
    try {
      const response = await fetch("/api/ml/products/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBelowFloor(response.status === 422 && data.floor != null);
        if (response.status === 422 && Number.isInteger(data.variationCount)) setVariationCount(data.variationCount);
        if (response.status === 409 && data.live) {
          onEdited({ currentPrice: data.live.price, availableQuantity: data.live.availableQuantity, status: data.live.status });
          resetReview();
        }
        if (data.applied) {
          onEdited(data.applied);
          resetReview();
        }
        throw new Error(data.error ?? "Não foi possível alterar.");
      }
      setDone(`Alterado no Mercado Livre: ${(data.summary as string[]).join(", ")}.`);
      setConfirming(false);
      setBelowFloor(false);
      setVariationCount(null);
      setVariationConfirmed(false);
      onEdited({
        ...(body.price != null ? { currentPrice: priceValue } : {}),
        ...(body.availableQuantity != null ? { availableQuantity: stockValue } : {}),
        ...(body.status ? { status: String(body.status) } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível alterar.");
    } finally {
      setBusy(false);
    }
  }

  if (!editable)
    return (
      <section className="insight2-edit">
        <header><strong>Editar no Mercado Livre</strong></header>
        <p className="insight2-empty">Anúncio encerrado ou em revisão: edite direto no Mercado Livre.</p>
      </section>
    );

  return (
    <section className="insight2-edit" aria-label="Editar anúncio">
      <header>
        <strong>Editar no Mercado Livre</strong>
        <small>Muda o anúncio de verdade, depois da sua confirmação. Fica registrado.</small>
      </header>
      <div className="insight2-edit-grid">
        <label>
          <span>Preço (R$)</span>
          <input inputMode="decimal" disabled={busy} value={price} onChange={(e) => { setPrice(e.target.value); resetReview(); }} />
        </label>
        <label>
          <span>Estoque</span>
          <input inputMode="numeric" disabled={busy} aria-invalid={!stockValid} value={stock} onChange={(e) => { setStock(e.target.value); resetReview(); }} />
        </label>
        <label>
          <span>Status</span>
          <select value={status} disabled={busy} onChange={(e) => { setStatus(e.target.value); resetReview(); }}>
            <option value="active">Ativo</option>
            <option value="paused">Pausado</option>
          </select>
        </label>
      </div>
      {!stockValid && <p className="insight2-empty">Informe um estoque inteiro. Use 0 para zerar.</p>}
      {!confirming ? (
        <button type="button" className="vr-btn vr-btn--small" disabled={!valid || !changes.length || busy} onClick={() => setConfirming(true)}>
          Revisar alteração
        </button>
      ) : (
        <div className="insight2-confirm">
          <span>Aplicar no Mercado Livre: {changes.join(", ")}?</span>
          {variationCount != null && (
            <label><input type="checkbox" checked={variationConfirmed} disabled={busy} onChange={(event) => setVariationConfirmed(event.target.checked)} />
              Aplicar o mesmo preço às {variationCount} variações
            </label>
          )}
          <button type="button" className="vr-btn vr-btn--small" disabled={busy || (variationCount != null && !variationConfirmed)} onClick={() => void apply(false)}>
            {busy ? "Aplicando..." : "Sim, aplicar"}
          </button>
          <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" disabled={busy} onClick={resetReview}>Voltar</button>
        </div>
      )}
      {error && (
        <p className="pilot-exec-error" role="alert">
          {error}{" "}
          {belowFloor && (
            <button type="button" className="inline-link-button" disabled={busy || !valid || (variationCount != null && !variationConfirmed)} onClick={() => void apply(true)}>
              Aplicar mesmo assim
            </button>
          )}
        </p>
      )}
      {done && <p className="pilot-done" role="status">{done}</p>}
    </section>
  );
}

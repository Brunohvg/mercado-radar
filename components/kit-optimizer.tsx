"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  defaultKitScenario,
  evaluateKits,
  rankKitResults,
  kitQuoteContext,
  kitQuoteKey,
  type KitScenario,
  type KitResult,
  type KitQuote,
} from "@/lib/kit-optimizer";
import type { Competitor } from "@/lib/competitor-analysis";
import {
  kitPayloadSchema,
  kitScenarioSchema,
} from "@/lib/intelligence-validation";
import {
  IntelligenceDrafts,
  type IntelligenceDraft,
} from "@/components/intelligence-drafts";

const money = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n)
    ? "A confirmar"
    : n.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 2,
      });
const STATUS = {
  INCOMPLETE: "Completar custos",
  LOSS: "Não compensa neste preço",
  BELOW_TARGET: "Abaixo da sua meta",
  VALIDATE: "Validar antes de comprar",
  PILOT: "Cenário para teste pequeno",
};
function parseNumber(text: string) {
  if (!text.trim()) return null;
  const normalized = text
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  return /^\d+(?:\.\d*)?$/.test(normalized) &&
    Number.isFinite(Number(normalized))
    ? Number(normalized)
    : null;
}
function NumberField({
  label,
  value,
  onChange,
  hint,
  integer = false,
}: {
  label: string;
  value: number | null;
  onChange: (n: number | null) => void;
  hint?: string;
  integer?: boolean;
}) {
  const [text, setText] = useState(
    value == null ? "" : String(value).replace(".", ","),
  );
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (document.activeElement !== ref.current)
      setText(value == null ? "" : String(value).replace(".", ","));
  }, [value]);
  return (
    <label>
      {label}
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={text}
        aria-label={label}
        aria-invalid={Boolean(
          text.trim() &&
            (parseNumber(text) == null ||
              (integer && !Number.isInteger(parseNumber(text)))),
        )}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseNumber(e.target.value));
        }}
        onBlur={() =>
          setText(value == null ? "" : String(value).replace(".", ","))
        }
      />
      {hint && <small>{hint}</small>}
      {integer && value != null && !Number.isInteger(value) && (
        <small>Informe uma quantidade inteira de unidades.</small>
      )}
    </label>
  );
}
type Context = {
  workspaceId: string;
  accountId: string | null;
  accountName: string | null;
  defaults: {
    taxPercent: number | null;
    operatingCost: number;
    targetMarginPercent: number;
    targetRoiPercent: number;
  };
};
type Frozen = {
  at: string;
  financial?: {
    profit: number;
    marginPercent: number;
    minimumSuggestedPrice: number | null;
  } | null;
  notice?: string | null;
};

export function KitOptimizer() {
  const [scenario, setScenario] = useState<KitScenario>(defaultKitScenario);
  const [context, setContext] = useState<Context | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [quotes, setQuotes] = useState<KitQuote[]>([]);
  const [message, setMessage] = useState("");
  const [notices, setNotices] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [retry, setRetry] = useState(0);
  const [clock, setClock] = useState(Date.now());
  const [sizesText, setSizesText] = useState("2, 4, 6, 8");
  const [selectedQuantity, setSelectedQuantity] = useState<number | null>(null);
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [costsOpen, setCostsOpen] = useState(false);
  const [frozen, setFrozen] = useState<Frozen | null>(null);
  const sequence = useRef(0),
    quoteSequence = useRef(0),
    contextSequence = useRef(0);
  const owner = useRef<string | null>(null);
  const productEdited = useRef(false);
  const detail = useRef<HTMLElement>(null);
  const hasBase =
    scenario.productName.trim().length >= 2 &&
    (scenario.unitCost != null ||
      scenario.variants.some((v) => v.unitCost != null));
  const results = useMemo(
    () =>
      hasBase
        ? evaluateKits(
            scenario,
            competitors,
            quotes,
            clock,
            context?.accountId ?? null,
          )
        : [],
    [scenario, competitors, quotes, clock, context?.accountId, hasBase],
  );
  const ranked = useMemo(() => rankKitResults(results), [results]);
  const visible = useMemo(
    () =>
      scenario.sizes
        .map(
          (quantity) =>
            ranked.find(
              (r) => r.quantity === quantity && r.id === choices[quantity],
            ) ?? ranked.find((r) => r.quantity === quantity),
        )
        .filter((r): r is KitResult => Boolean(r)),
    [ranked, scenario.sizes, choices],
  );
  const best = ranked[0] ?? null;
  const selected =
    visible.find((r) => r.quantity === selectedQuantity) ??
    visible.find((r) => r.id === best?.id) ??
    visible[0] ??
    null;
  const selectedQuote =
    selected?.salePrice != null
      ? quotes.find(
          (q) =>
            q.accountId === context?.accountId &&
            kitQuoteKey(q.context) ===
              kitQuoteKey(
                kitQuoteContext(
                  scenario,
                  selected.quantity,
                  selected.salePrice!,
                ),
              ) &&
            clock - new Date(q.quotedAt).getTime() <= 300000,
        )
      : null;
  const signature = JSON.stringify(
    visible
      .filter((r) => r.salePrice != null && scenario.categoryId)
      .map((r) => kitQuoteContext(scenario, r.quantity, r.salePrice!)),
  );

  async function refreshContext() {
    const seq = ++contextSequence.current;
    try {
      const r = await fetch("/api/intelligence/kits/context", {
          cache: "no-store",
        }),
        body = await r.json();
      if (seq !== contextSequence.current) return;
      if (!r.ok) throw new Error(body.error);
      const next = body as Context,
        key = next.workspaceId + ":" + next.accountId;
      if (owner.current !== key) {
        const changed = owner.current != null;
        owner.current = key;
        sequence.current++;
        quoteSequence.current++;
        setQuotes([]);
        setCompetitors([]);
        setFrozen(null);
        setChoices({});
        setSelectedQuantity(null);
        setScenario((prev) => ({
          ...(changed ? defaultKitScenario() : prev),
          ...next.defaults,
        }));
        setContext(next);
        if (changed) {
          setSizesText("2, 4, 6, 8");
          setMessage(
            "A conta mudou. Os custos e cotações anteriores foram retirados desta simulação.",
          );
        }
      } else setContext(next);
    } catch (error) {
      if (seq === contextSequence.current)
        setMessage(
          (error as Error).message ??
            "Não foi possível carregar as configurações. Informe os custos para simular.",
        );
    }
  }
  useEffect(() => {
    let active = true;
    refreshContext().then(() => {
      if (!active || productEdited.current) return;
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref && /^MLB\d{6,20}$/.test(ref)) void research(ref, true);
    });
    const focus = () => {
      if (document.visibilityState === "visible") void refreshContext();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    const timer = setInterval(() => setClock(Date.now()), 30000);
    return () => {
      active = false;
      sequence.current++;
      quoteSequence.current++;
      contextSequence.current++;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, []);
  useEffect(() => {
    const seq = ++quoteSequence.current;
    if (!scenario.useApiQuotes || !context?.accountId) {
      setQuoting(false);
      return;
    }
    const contexts: ReturnType<typeof kitQuoteContext>[] =
      JSON.parse(signature);
    const pending = contexts.filter(
      (c) =>
        !quotes.some(
          (q) =>
            q.accountId === context.accountId &&
            kitQuoteKey(q.context) === kitQuoteKey(c) &&
            Date.now() - new Date(q.quotedAt).getTime() < 300000,
        ),
    );
    if (!pending.length) {
      setQuoting(false);
      return;
    }
    const controller = new AbortController();
    setQuoting(true);
    const timer = setTimeout(async () => {
      const outputs = await Promise.allSettled(
        pending.map(async (c) => {
          const r = await fetch("/api/intelligence/kits/quote", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(c),
            signal: controller.signal,
          });
          const body = await r.json();
          if (!r.ok)
            throw new Error(
              body.error ??
                "Cotação indisponível. Use uma estimativa identificada.",
            );
          return body as KitQuote;
        }),
      );
      if (seq !== quoteSequence.current) return;
      const good: KitQuote[] = [],
        bad: string[] = [];
      for (const output of outputs)
        if (output.status === "fulfilled") good.push(output.value);
        else if (output.reason?.name !== "AbortError")
          bad.push(output.reason?.message ?? "Cotação indisponível.");
      setQuotes((prev) =>
        [
          ...prev.filter(
            (q) =>
              q.accountId === context.accountId &&
              !good.some(
                (g) => kitQuoteKey(g.context) === kitQuoteKey(q.context),
              ) &&
              Date.now() - new Date(q.quotedAt).getTime() < 300000,
          ),
          ...good,
        ].slice(-24),
      );
      if (bad.length) setMessage([...new Set(bad)].join(" "));
      setQuoting(false);
      setClock(Date.now());
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    signature,
    context?.accountId,
    scenario.useApiQuotes,
    retry,
    Math.floor(clock / 60000),
  ]);
  async function research(query: string, importReference = false) {
    const seq = ++sequence.current;
    setSearching(true);
    setMessage("");
    setNotices([]);
    try {
      const r = await fetch(
          "/api/intelligence/competitors?" + new URLSearchParams({ q: query }),
          { cache: "no-store" },
        ),
        body = await r.json();
      if (seq !== sequence.current) return;
      if (!r.ok) throw new Error(body.error);
      setCompetitors(body.items);
      setNotices(body.notices.map((n: { message: string }) => n.message));
      const ref: Competitor | undefined =
        body.items.find((i: Competitor) => i.id === body.referenceId) ??
        body.items[0];
      if (ref)
        setScenario((prev) => ({
          ...prev,
          ...(importReference ? { productName: ref.title.slice(0, 160) } : {}),
          referenceId: ref.id,
          categoryId: ref.categoryId ?? prev.categoryId,
          brand: ref.brand ?? prev.brand,
          model: ref.model ?? prev.model,
          variants:
            prev.variants.length === 1 &&
            prev.variants[0].label === "Única" &&
            ref.color
              ? [{ ...prev.variants[0], label: ref.color }]
              : prev.variants,
        }));
      if (!body.items.length)
        setMessage(
          "Sem ofertas acessíveis nesta consulta. Você ainda pode simular pelos custos e validar o mercado depois.",
        );
    } catch (error) {
      if (seq === sequence.current) setMessage((error as Error).message);
    } finally {
      if (seq === sequence.current) setSearching(false);
    }
  }
  function change<K extends keyof KitScenario>(key: K, value: KitScenario[K]) {
    setScenario((prev) => ({ ...prev, [key]: value }));
  }
  function editName(value: string) {
    productEdited.current = true;
    sequence.current++;
    setSearching(false);
    setCompetitors([]);
    setQuotes([]);
    setScenario((prev) => ({
      ...prev,
      productName: value,
      referenceId: null,
      brand: null,
      model: null,
      categoryId: "",
      reviewedOffers: [],
    }));
  }
  function setSalePrice(quantity: number, price: number | null) {
    change("salePrices", [
      ...scenario.salePrices.filter((p) => p.quantity !== quantity),
      ...(price != null && price > 0 ? [{ quantity, price }] : []),
    ]);
  }
  function example() {
    productEdited.current = true;
    setSearching(false);
    const next = {
      ...defaultKitScenario(),
      productName: "Caneta Fantasminha Montovani",
      brand: "Montovani",
      model: "Fantasminha",
      unitCost: 4.5,
      variants: ["Azul", "Preta", "Vermelha", "Rosa"].map((label, i) => ({
        id: "color" + i,
        label,
        stock: 12,
        unitCost: null,
      })),
      ...(context?.defaults ?? {}),
    };
    sequence.current++;
    setScenario(next);
    setSizesText("2, 4, 6, 8");
    setCompetitors([]);
    setQuotes([]);
    setChoices({});
    setSelectedQuantity(null);
    setFrozen(null);
    setMessage(
      "Exemplo de teste: custo de R$ 4,50 e estoque de 12 por cor são fictícios. Informe preços, embalagem e frete da sua operação.",
    );
  }
  function openDraft(draft: IntelligenceDraft) {
    productEdited.current = true;
    setSearching(false);
    const payload = draft.payload as {
      scenario?: unknown;
      selectedKitId?: unknown;
      snapshot?: Frozen;
    };
    const parsed = kitPayloadSchema.safeParse({
      scenario: payload.scenario,
      selectedKitId: payload.selectedKitId,
    });
    if (!parsed.success) {
      setMessage("Este rascunho não é compatível com a versão atual.");
      return;
    }
    sequence.current++;
    quoteSequence.current++;
    setScenario(parsed.data.scenario);
    setSizesText(parsed.data.scenario.sizes.join(", "));
    setQuotes([]);
    setCompetitors([]);
    setFrozen(payload.snapshot ?? null);
    setChoices({});
    const row = evaluateKits(parsed.data.scenario).find(
      (r) => r.id === parsed.data.selectedKitId,
    );
    setSelectedQuantity(row?.quantity ?? null);
    if (row) setChoices({ [row.quantity]: row.id });
    setMessage(
      "Rascunho reaberto. A cotação será consultada novamente; o registro anterior está preservado abaixo.",
    );
  }
  function useManual() {
    setScenario((prev) => ({
      ...prev,
      useApiQuotes: false,
      commissionPercent:
        selectedQuote?.fee?.commissionPercent ?? prev.commissionPercent,
      fixedFee: selectedQuote?.fee?.fixedFee ?? prev.fixedFee,
      shippingCost: selectedQuote?.shipping?.shippingCost ?? prev.shippingCost,
    }));
    setMessage(
      "Modo manual: os valores serão tratados como estimativas informadas. Revise-os antes de decidir.",
    );
  }
  const payloadScenario = {
    ...scenario,
    salePrices: [
      ...new Map(
        [
          ...scenario.salePrices,
          ...visible
            .filter((r) => r.salePrice != null)
            .map((r) => ({ quantity: r.quantity, price: r.salePrice! })),
        ].map((p) => [p.quantity, p]),
      ).values(),
    ],
  };
  const valid =
    kitScenarioSchema.safeParse(payloadScenario).success && Boolean(selected);
  const dimension = (
    key: "heightCm" | "widthCm" | "lengthCm",
    value: number | null,
  ) =>
    change("dimensions", {
      ...(scenario.dimensions ?? {
        heightCm: null,
        widthCm: null,
        lengthCm: null,
      }),
      [key]: value,
    });
  const updateVariant = (
    id: string,
    fields: Partial<KitScenario["variants"][number]>,
  ) =>
    change(
      "variants",
      scenario.variants.map((v) => (v.id === id ? { ...v, ...fields } : v)),
    );
  return (
    <div className="intel-workspace">
      <header className="page-header">
        <div>
          <p className="eyebrow">Simulador inteligente</p>
          <h1>Qual kit vale testar?</h1>
          <p>
            Compare o que sobra em cada combinação. Custos e estoque mudam o
            resultado na hora.
          </p>
        </div>
        <Link className="secondary" href="/concorrentes">
          Pesquisar concorrentes →
        </Link>
      </header>
      {message && (
        <p className="intel-notice" role="status">
          {message}
        </p>
      )}
      <section
        key={"inputs:" + context?.workspaceId + ":" + context?.accountId}
        className="kit-inputs"
        aria-label="Produto e estoque"
      >
        <div className="intel-toolbar">
          <h2>Seu produto</h2>
          <button className="text-button" onClick={example}>
            Carregar exemplo Montovani
          </button>
        </div>
        <div className="kit-main-fields">
          <label>
            Produto base
            <input
              value={scenario.productName}
              maxLength={240}
              onChange={(e) => editName(e.target.value)}
              placeholder="Nome, SKU ou link do anúncio"
            />
          </label>
          <NumberField
            label="Custo de compra por unidade (R$)"
            value={scenario.unitCost}
            onChange={(v) => change("unitCost", v)}
          />
          <NumberField
            label="Preço por unidade para simular (R$)"
            value={scenario.pricePerUnit}
            onChange={(v) => change("pricePerUnit", v)}
            hint="Opcional com três ofertas equivalentes ou custos completos."
          />
          <NumberField
            label="Meta de margem (%)"
            value={scenario.targetMarginPercent}
            onChange={(v) => {
              if (v != null) change("targetMarginPercent", v);
            }}
          />
        </div>
        <div className="intel-toolbar">
          <p className="intel-muted">
            {context?.accountName
              ? `Cotações na conta ${context.accountName}.`
              : "A simulação manual funciona mesmo antes de conectar a conta."}
          </p>
          <button
            className="secondary"
            disabled={searching || scenario.productName.trim().length < 2}
            onClick={() =>
              research(
                scenario.productName,
                /^https?:|^MLB-?\d+/i.test(scenario.productName),
              )
            }
          >
            {searching ? "Consultando ofertas…" : "Buscar ofertas do produto"}
          </button>
        </div>
        <div className="kit-stock">
          <div className="intel-toolbar">
            <h3>Variações e estoque disponível</h3>
            <button
              className="text-button"
              disabled={scenario.variants.length >= 8}
              onClick={() =>
                change("variants", [
                  ...scenario.variants,
                  {
                    id: "v" + Date.now(),
                    label: "Variação " + (scenario.variants.length + 1),
                    stock: null,
                    unitCost: null,
                  },
                ])
              }
            >
              + Adicionar variação
            </button>
          </div>
          {scenario.variants.map((v, i) => (
            <div className="kit-variant" key={v.id}>
              <label>
                Variação {i + 1}
                <input
                  value={v.label}
                  maxLength={60}
                  onChange={(e) =>
                    updateVariant(v.id, { label: e.target.value })
                  }
                />
              </label>
              <NumberField
                label={`Estoque de ${v.label || "variação " + (i + 1)} (un.)`}
                integer
                value={v.stock}
                onChange={(n) => updateVariant(v.id, { stock: n })}
              />
              <button
                className="text-button"
                aria-label={`Remover variação ${i + 1}`}
                disabled={scenario.variants.length === 1}
                onClick={() =>
                  change(
                    "variants",
                    scenario.variants.filter((x) => x.id !== v.id),
                  )
                }
              >
                Remover
              </button>
            </div>
          ))}
          <p className="intel-muted">
            Campo vazio significa estoque não confirmado; zero impede usar essa
            variação. As combinações são alternativas e compartilham o mesmo
            estoque.
          </p>
        </div>
        <div className="kit-known-costs">
          <NumberField
            label="Embalagem por kit (R$)"
            value={scenario.packageCost}
            onChange={(v) => change("packageCost", v)}
            hint="Inclua caixa, saquinho e proteção. Zero precisa ser informado."
          />
          {scenario.taxPercent == null && (
            <NumberField
              label="Imposto sobre a venda (%)"
              value={scenario.taxPercent}
              onChange={(v) => change("taxPercent", v)}
            />
          )}
          {scenario.useApiQuotes && selectedQuote?.shipping ? (
            <p className="intel-muted">
              Frete estimado pela API neste kit:{" "}
              <strong>{money(selectedQuote.shipping.shippingCost)}</strong>.
              Confira o pacote em Ajustar cotação.
            </p>
          ) : (
            <NumberField
              label="Frete estimado do vendedor (R$)"
              value={scenario.shippingCost}
              onChange={(v) => change("shippingCost", v)}
              hint="Preencha se não houver cotação do pacote. A API terá prioridade quando disponível."
            />
          )}
        </div>
        <details
          className="kit-cost-settings"
          open={costsOpen}
          onToggle={(e) => setCostsOpen(e.currentTarget.open)}
        >
          <summary>Ajustar cotação, custos e tamanhos dos kits</summary>
          <div className="kit-settings-grid">
            <label>
              Categoria MLB
              <input
                value={scenario.categoryId}
                placeholder="Preenchida pela pesquisa quando disponível"
                onChange={(e) =>
                  change("categoryId", e.target.value.toUpperCase())
                }
              />
            </label>
            <label>
              Modalidade
              <select
                aria-label="Modalidade do kit"
                value={scenario.listingType}
                onChange={(e) =>
                  change(
                    "listingType",
                    e.target.value as KitScenario["listingType"],
                  )
                }
              >
                <option value="CLASSIC">Clássico</option>
                <option value="PREMIUM">Premium</option>
              </select>
            </label>
            <label>
              Logística
              <select
                aria-label="Logística do kit"
                value={scenario.logisticType}
                onChange={(e) =>
                  change(
                    "logisticType",
                    e.target.value as KitScenario["logisticType"],
                  )
                }
              >
                <option value="drop_off">Agência / coleta</option>
                <option value="self_service">Flex</option>
                <option value="fulfillment">Full</option>
              </select>
            </label>
            <label>
              Tamanhos (até 8)
              <input
                value={sizesText}
                onChange={(e) => {
                  setSizesText(e.target.value);
                  const sizes = [
                    ...new Set(
                      e.target.value
                        .split(/[;,\s]+/)
                        .filter(Boolean)
                        .map(Number),
                    ),
                  ];
                  change(
                    "sizes",
                    sizes
                      .filter((n) => Number.isInteger(n) && n > 0 && n <= 10000)
                      .slice(0, 8),
                  );
                }}
              />
            </label>
            <label>
              Marca
              <input
                value={scenario.brand ?? ""}
                onChange={(e) => change("brand", e.target.value || null)}
              />
            </label>
            <label>
              Modelo
              <input
                value={scenario.model ?? ""}
                onChange={(e) => change("model", e.target.value || null)}
              />
            </label>
            <NumberField
              label="Imposto (%)"
              value={scenario.taxPercent}
              onChange={(v) => change("taxPercent", v)}
            />
            <NumberField
              label="Outras despesas por kit (R$)"
              value={scenario.operatingCost}
              onChange={(v) => change("operatingCost", v)}
            />
            <NumberField
              label="Meta de ROI (%)"
              value={scenario.targetRoiPercent}
              onChange={(v) => {
                if (v != null) change("targetRoiPercent", v);
              }}
            />
            <NumberField
              label="Peso de uma unidade (g)"
              value={scenario.unitWeightGrams}
              onChange={(v) => change("unitWeightGrams", v)}
            />
            <NumberField
              label="Peso da embalagem (g)"
              value={scenario.packageWeightGrams}
              onChange={(v) => change("packageWeightGrams", v)}
            />
            <NumberField
              label="Altura do pacote (cm)"
              value={scenario.dimensions?.heightCm ?? null}
              onChange={(v) => dimension("heightCm", v)}
            />
            <NumberField
              label="Largura do pacote (cm)"
              value={scenario.dimensions?.widthCm ?? null}
              onChange={(v) => dimension("widthCm", v)}
            />
            <NumberField
              label="Comprimento do pacote (cm)"
              value={scenario.dimensions?.lengthCm ?? null}
              onChange={(v) => dimension("lengthCm", v)}
            />
          </div>
          <p>
            Para cotar, o peso total soma as unidades e a embalagem. As
            dimensões são do pacote externo informado; confira se comporta cada
            kit. O frete considera a condição de envio selecionada abaixo.
            Armazenagem Full, Ads e devoluções exigem despesas próprias.
          </p>
          <label className="intel-check">
            <input
              type="checkbox"
              checked={scenario.useApiQuotes}
              onChange={(e) =>
                e.target.checked ? change("useApiQuotes", true) : useManual()
              }
            />
            Consultar automaticamente na minha conta
          </label>
          <label className="intel-check">
            <input
              type="checkbox"
              checked={scenario.freeShipping}
              onChange={(e) => change("freeShipping", e.target.checked)}
            />
            Simular frete grátis ao comprador
          </label>
          <div className="kit-settings-grid">
            <NumberField
              label="Comissão manual estimada (%)"
              value={scenario.commissionPercent}
              onChange={(v) => change("commissionPercent", v)}
            />
            <NumberField
              label="Tarifa fixa manual estimada (R$)"
              value={scenario.fixedFee}
              onChange={(v) => change("fixedFee", v)}
            />
            {scenario.variants.map((v) => (
              <NumberField
                key={v.id}
                label={`Custo específico de ${v.label} (R$)`}
                value={v.unitCost}
                onChange={(n) => updateVariant(v.id, { unitCost: n })}
                hint="Vazio usa o custo unitário principal."
              />
            ))}
          </div>
          <p>
            Taxas manuais são alternativas para quando não houver cotação.
            Nenhum valor ausente será tratado como zero.
          </p>
        </details>
      </section>
      {notices.length > 0 && (
        <details className="intel-source-notices">
          <summary>Disponibilidade das fontes ({notices.length})</summary>
          {notices.map((n, i) => (
            <p key={i}>{n}</p>
          ))}
        </details>
      )}
      {best && (
        <section
          className={`kit-decision kit-decision--${best.status.toLowerCase()}`}
          aria-label="Recomendação do cenário"
        >
          <div>
            <span className="intel-pill">{STATUS[best.status]}</span>
            <h2>
              {best.financial
                ? `Melhor cenário calculado: kit ${best.quantity}`
                : "Sua simulação precisa de custos confirmados"}
            </h2>
            <p>{best.reason}</p>
          </div>
          <div className="kit-decision-value">
            <small>Lucro simulado por venda</small>
            <strong>{money(best.financial?.profit)}</strong>
            {best.financial && (
              <span>
                {best.financial.marginPercent.toLocaleString("pt-BR")}% de
                margem
              </span>
            )}
          </div>
          {best.status === "INCOMPLETE" && (
            <button className="secondary" onClick={() => setCostsOpen(true)}>
              Completar custos
            </button>
          )}
        </section>
      )}
      {quoting && (
        <p className="intel-muted" role="status">
          Atualizando tarifas e frete nas condições da sua conta…
        </p>
      )}
      {!results.length && (
        <div className="intel-empty">
          <h2>
            {hasBase
              ? "Nenhuma composição disponível neste estoque"
              : "Informe o produto e o custo de compra"}
          </h2>
          <p>
            {hasBase
              ? "Revise o estoque e os tamanhos dos kits."
              : "As combinações e os resultados aparecem automaticamente quando você informa a base da simulação."}
          </p>
        </div>
      )}
      <div className="kit-results">
        {visible.map((row) => (
          <article
            className={`kit-card kit-card--${row.status.toLowerCase()}`}
            data-kit-quantity={row.quantity}
            key={row.quantity}
          >
            <div className="intel-toolbar">
              <h2>Kit {row.quantity}</h2>
              <span className="intel-pill">{STATUS[row.status]}</span>
            </div>
            <p className="kit-composition">{row.label}</p>
            <div className="kit-financial">
              <small>Lucro simulado</small>
              <strong>{money(row.financial?.profit)}</strong>
              <span>
                {row.financial
                  ? `${row.financial.marginPercent.toLocaleString("pt-BR")}% de margem`
                  : "Custos pendentes"}
              </span>
            </div>
            <dl className="kit-card-facts">
              <div>
                <dt>Preço de venda</dt>
                <dd>{money(row.salePrice)}</dd>
              </div>
              <div>
                <dt>Custo dos produtos</dt>
                <dd>{money(row.purchaseCost)}</dd>
              </div>
              <div>
                <dt>Mínimo estimado para a meta</dt>
                <dd>{money(row.financial?.minimumSuggestedPrice)}</dd>
              </div>
              <div>
                <dt>Cabe no estoque</dt>
                <dd>
                  {row.maxKits == null
                    ? "A confirmar"
                    : `${row.maxKits} kit(s)`}
                </dd>
              </div>
            </dl>
            <p className="intel-muted">
              {row.priceSource === "MARKET_SAMPLE"
                ? "Preço: mediana de ofertas equivalentes."
                : row.priceSource === "COST_FLOOR"
                  ? "Preço calculado pelos custos; não é preço de mercado."
                  : row.priceSource
                    ? "Preço do cenário informado."
                    : "Preço a confirmar."}
            </p>
            <button
              className="secondary"
              onClick={() => {
                setSelectedQuantity(row.quantity);
                detail.current?.scrollIntoView({
                  behavior: "smooth",
                  block: "start",
                });
              }}
            >
              Ver composição e custos
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <section
          ref={detail}
          className="kit-detail"
          aria-label="Detalhes do kit"
        >
          <div className="intel-toolbar">
            <div>
              <h2>Kit {selected.quantity}: confira antes de decidir</h2>
              <p>
                Quantidade, composição e custos precisam representar o produto
                que você vai vender.
              </p>
            </div>
            <button
              className="text-button"
              onClick={() => {
                setQuotes([]);
                setRetry((n) => n + 1);
              }}
            >
              Atualizar cotações
            </button>
          </div>
          <div className="kit-settings-grid">
            <label>
              Composição
              <select
                aria-label="Composição do kit"
                value={selected.id}
                onChange={(e) =>
                  setChoices((prev) => ({
                    ...prev,
                    [selected.quantity]: e.target.value,
                  }))
                }
              >
                {results
                  .filter((r) => r.quantity === selected.quantity)
                  .map((r) => (
                    <option value={r.id} key={r.id}>
                      {r.label}
                    </option>
                  ))}
              </select>
            </label>
            <NumberField
              label={`Preço de venda do kit ${selected.quantity} (R$)`}
              value={selected.salePrice}
              onChange={(v) => setSalePrice(selected.quantity, v)}
            />
          </div>
          <p className="intel-reference">{selected.reason}</p>
          <details>
            <summary>Como o resultado foi calculado</summary>
            <dl className="kit-cost-breakdown">
              {[
                ["Compra dos produtos", selected.purchaseCost],
                ["Embalagem", scenario.packageCost],
                ["Comissão", selected.financial?.commissionAmount],
                ["Tarifa fixa", selected.financial?.fixedFee],
                ["Frete do vendedor", selected.financial?.shippingCost],
                ["Imposto", selected.financial?.taxAmount],
                ["Outras despesas", scenario.operatingCost],
                ["Lucro simulado", selected.financial?.profit],
                ["Equilíbrio estimado", selected.financial?.breakEvenPrice],
                [
                  "Mínimo estimado para a meta",
                  selected.financial?.minimumSuggestedPrice,
                ],
              ].map(([label, value]) => (
                <div key={String(label)}>
                  <dt>{String(label)}</dt>
                  <dd>{money(value as number | null | undefined)}</dd>
                </div>
              ))}
            </dl>
            <p>
              Tarifas:{" "}
              {selected.feeSource === "ML_API_ESTIMATE"
                ? "cotação da API na sua conta"
                : selected.feeSource === "USER_ESTIMATE"
                  ? "estimativa manual"
                  : "Não disponível"}
              . Frete:{" "}
              {selected.shippingSource === "ML_API_ESTIMATE"
                ? "estimativa da API"
                : selected.shippingSource === "USER_ESTIMATE"
                  ? "estimativa manual"
                  : "Não disponível"}
              .
            </p>
            {selectedQuote && (
              <p>
                Conta: {selectedQuote.accountName}. Cotação em{" "}
                {new Date(selectedQuote.quotedAt).toLocaleString("pt-BR")}. O
                desconto já está aplicado ao frete retornado; não é subtraído
                novamente.
              </p>
            )}
            <p>
              Lucro e metas usam a fórmula atual do Radar. A tarifa fixa já
              integra o custo total da API. O preço mínimo usa taxas constantes
              e precisa de nova cotação no preço escolhido.
            </p>
          </details>
          {selectedQuote?.notices.map((n, i) => (
            <p key={i} className="intel-notice">
              {n.message}
            </p>
          ))}
          <details>
            <summary>
              Ofertas e pontos para validar ({selected.candidateIds.length}{" "}
              oferta(s) da mesma quantidade)
            </summary>
            <p>
              Somente ofertas recentes e equivalentes entram na referência
              automática. Em kits mistos, confirme a composição inteira.
            </p>
            {competitors
              .filter((i) => selected.candidateIds.includes(i.id))
              .slice(0, 20)
              .map((i) => (
                <label key={i.id} className="kit-offer-review">
                  <input
                    type="checkbox"
                    checked={selected.comparableIds.includes(i.id)}
                    disabled={
                      selected.comparableIds.includes(i.id) &&
                      !scenario.reviewedOffers
                        .find((r) => r.kitId === selected.id)
                        ?.itemIds.includes(i.id)
                    }
                    onChange={(e) => {
                      const entry = scenario.reviewedOffers.find(
                          (r) => r.kitId === selected.id,
                        ),
                        ids = new Set(entry?.itemIds);
                      if (e.target.checked) ids.add(i.id);
                      else ids.delete(i.id);
                      change("reviewedOffers", [
                        ...scenario.reviewedOffers.filter(
                          (r) => r.kitId !== selected.id,
                        ),
                        { kitId: selected.id, itemIds: [...ids] },
                      ]);
                    }}
                  />
                  <span>
                    {i.title}
                    <small>
                      {money(i.price)} · {i.quantity} unidades ·{" "}
                      {i.brand ?? "Marca não disponível"} ·{" "}
                      {i.color ?? "Cor não disponível"}
                      <br />
                      {new Date(i.observedAt).toLocaleString("pt-BR")} ·{" "}
                      {i.source === "ML_API"
                        ? "API Mercado Livre"
                        : "Leitura do Radar"}
                    </small>
                  </span>
                </label>
              ))}
            {selected.risks.map((risk, i) => (
              <p key={i}>• {risk}</p>
            ))}
          </details>
          <p className="intel-muted">
            A recomendação compara cenários de lucro, margem, ROI, estoque e
            qualidade das ofertas. Não prevê vendas nem garante lucro.
          </p>
        </section>
      )}
      {frozen && (
        <details className="intel-source-notices">
          <summary>Registro no momento de salvar</summary>
          <p>
            {new Date(frozen.at).toLocaleString("pt-BR")} · Lucro simulado:{" "}
            {money(frozen.financial?.profit)} · Margem:{" "}
            {frozen.financial?.marginPercent ?? "A confirmar"}% · Piso estimado:{" "}
            {money(frozen.financial?.minimumSuggestedPrice)}
          </p>
          {frozen.notice && <p>{frozen.notice}</p>}
          <p>
            O registro é uma simulação datada. A análise acima usa as condições
            atuais.
          </p>
        </details>
      )}
      <IntelligenceDrafts
        key={"drafts:" + context?.workspaceId + ":" + context?.accountId}
        kind="KIT"
        name={
          scenario.productName
            ? `${scenario.productName} · kit ${selected?.quantity ?? ""}`
            : "Simulação de kits"
        }
        payload={{
          scenario: payloadScenario,
          selectedKitId: selected?.id ?? null,
        }}
        canSave={valid && !quoting}
        onOpen={openDraft}
      />
    </div>
  );
}

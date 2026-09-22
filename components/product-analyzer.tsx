"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeProfitability,
  type ListingType,
  type ProfitabilityResult,
} from "@/lib/profitability";

type FormState = {
  productName: string;
  supplierName: string;
  supplierPrice: string;
  discountPercent: string;
  kitQuantity: string;
  salePrice: string;
  listingType: ListingType;
  commissionPercent: string;
  fixedFee: string;
  shippingCost: string;
  operatingCost: string;
  targetMarginPercent: string;
  targetRoiPercent: string;
  categoryId: string;
  weightGrams: string;
  heightCm: string;
  widthCm: string;
  lengthCm: string;
};

type MlQuote = {
  listingType: ListingType;
  commissionPercent: number;
  fixedFee: number;
  saleFeeAmount: number;
  shippingCost: number;
  billableWeight: number;
  shippingDiscountRate: number;
  shippingPromotedAmount: number;
};

type ComparedQuote = MlQuote & {
  analysis: ProfitabilityResult;
};

type CategorySuggestion = {
  domainId: string | null;
  domainName: string | null;
  categoryId: string;
  categoryName: string;
};

type ProductSearchSuggestion = {
  key: string;
  source: "CATALOG" | "MARKETPLACE";
  id: string;
  title: string;
  price: number | null;
  thumbnail: string | null;
  categoryId: string | null;
  productIdentifier: string | null;
};

type ProductSearchPayload = {
  query: string;
  barcode: string | null;
  catalogUnavailable: boolean;
  suggestions: ProductSearchSuggestion[];
};

type DiscoveryPayload = {
  identification: {
    input: string;
    barcode: string | null;
    source: "CATALOG" | "MARKETPLACE";
    catalogProductId: string | null;
    name: string;
    categoryId: string | null;
    categoryName: string | null;
    domainName: string | null;
  };
  market: {
    comparableCount: number;
    minimumPrice: number | null;
    medianPrice: number | null;
    maximumPrice: number | null;
  };
  dimensions: {
    heightCm: number;
    widthCm: number;
    lengthCm: number;
    weightGrams: number;
    source: string;
    sampleSize: number;
    confidence: "HIGH" | "MEDIUM" | "LOW";
  } | null;
  comparables: Array<{
    id: string;
    title: string;
    price: number;
    permalink: string | null;
    thumbnail: string | null;
    freeShipping: boolean;
  }>;
};

type MarketScan = {
  verdict: string;
  verdictLabel: string;
  fitScore: number;
  decision: {
    headline: string;
    reason: string;
    nextAction: string;
  };
  market: {
    resultCount: number;
    minimumPrice: number;
    p25Price: number;
    medianPrice: number;
    p75Price: number;
    maximumPrice: number;
    averagePrice: number;
    marketGapPercent: number;
  };
  finance: {
    profit: number;
    marginPercent: number;
    roiPercent: number;
    minimumSuggestedPrice: number;
  };
  buyingPower: {
    currentNetUnitCost: number;
    maxNetUnitCostAtMedian: number;
    maxSupplierPriceAtMedian: number;
    costReductionNeeded: number;
  };
  evidence: {
    averageSimilarityPercent: number;
    comparableCount: number;
  };
  competitors: Array<{
    id: string;
    title: string;
    price: number;
    similarity: number;
    permalink: string | null;
    freeShipping: boolean;
    listingTypeId: string | null;
    priceSource: string;
  }>;
};

const initial: FormState = {
  productName: "",
  supplierName: "",
  supplierPrice: "",
  discountPercent: "0",
  kitQuantity: "1",
  salePrice: "",
  listingType: "CLASSIC",
  commissionPercent: "0",
  fixedFee: "0",
  shippingCost: "0",
  operatingCost: "0",
  targetMarginPercent: "20",
  targetRoiPercent: "30",
  categoryId: "",
  weightGrams: "",
  heightCm: "",
  widthCm: "",
  lengthCm: "",
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function verdictLabel(verdict: ProfitabilityResult["verdict"]) {
  if (verdict === "GOOD") return "COMPENSA TESTAR";
  if (verdict === "TIGHT") return "MARGEM APERTADA";
  return "NÃO COMPENSA";
}

function number(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchJsonWithTimeout<T>(
  url: string,
  init: RequestInit,
  timeoutMs = 30000,
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        typeof payload?.error === "string"
          ? payload.error
          : "A operação não pôde ser concluída.",
      );
    }

    return payload as T;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "A consulta demorou demais. O carregamento foi interrompido; tente novamente.",
      );
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function toInput(form: FormState, override?: Partial<{
  listingType: ListingType;
  commissionPercent: number;
  fixedFee: number;
  shippingCost: number;
  kitQuantity: number;
  salePrice: number;
}>) {
  return {
    productName: form.productName,
    supplierPrice: number(form.supplierPrice),
    discountPercent: number(form.discountPercent),
    kitQuantity: override?.kitQuantity ?? number(form.kitQuantity),
    salePrice: override?.salePrice ?? number(form.salePrice),
    listingType: override?.listingType ?? form.listingType,
    commissionPercent:
      override?.commissionPercent ?? number(form.commissionPercent),
    fixedFee: override?.fixedFee ?? number(form.fixedFee),
    shippingCost: override?.shippingCost ?? number(form.shippingCost),
    operatingCost: number(form.operatingCost),
    targetMarginPercent: number(form.targetMarginPercent),
    targetRoiPercent: number(form.targetRoiPercent),
  };
}

export function ProductAnalyzer() {
  const [form, setForm] = useState<FormState>(initial);
  const [analysis, setAnalysis] = useState<ProfitabilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [error, setError] = useState("");
  const [quoteMessage, setQuoteMessage] = useState("");
  const [comparison, setComparison] = useState<ComparedQuote[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [discovery, setDiscovery] = useState<DiscoveryPayload | null>(null);
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [productSuggestions, setProductSuggestions] = useState<
    ProductSearchSuggestion[]
  >([]);
  const [catalogSearchUnavailable, setCatalogSearchUnavailable] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState("");
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketScan, setMarketScan] = useState<MarketScan | null>(null);
  const [categorySuggestion, setCategorySuggestion] =
    useState<CategorySuggestion | null>(null);

  useEffect(() => {
    function loadProduct(productName: string) {
      const clean = productName.trim();
      if (!clean) return;

      setForm((current) => ({
        ...current,
        productName: clean,
        categoryId: "",
        salePrice: "",
        weightGrams: "",
        heightCm: "",
        widthCm: "",
        lengthCm: "",
        commissionPercent: "0",
        fixedFee: "0",
        shippingCost: "0",
      }));
      setDiscovery(null);
      setAnalysis(null);
      setMarketScan(null);
      setComparison([]);
      setQuoteMessage(
        "Produto carregado do Radar de oportunidades. Identifique para completar os dados.",
      );
    }

    const queryProduct = new URLSearchParams(window.location.search).get("q");
    if (queryProduct) loadProduct(queryProduct);

    function handleOpportunity(event: Event) {
      const custom = event as CustomEvent<{ productName?: string }>;
      if (custom.detail?.productName) loadProduct(custom.detail.productName);
    }

    window.addEventListener("radar:analyze-product", handleOpportunity);
    return () =>
      window.removeEventListener("radar:analyze-product", handleOpportunity);
  }, []);;

  useEffect(() => {
    const query = form.productName.trim();

    if (query.length < 2 || discovery) {
      setProductSuggestions([]);
      setCatalogSearchUnavailable(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setProductSearchLoading(true);

      try {
        const response = await fetch(
          `/api/ml/product-search?q=${encodeURIComponent(query)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        const payload = (await response.json()) as ProductSearchPayload & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? "Falha ao buscar produtos.");
        }

        setProductSuggestions(payload.suggestions);
        setCatalogSearchUnavailable(payload.catalogUnavailable);
      } catch (caught) {
        if (
          !(caught instanceof DOMException && caught.name === "AbortError")
        ) {
          setProductSuggestions([]);
        }
      } finally {
        setProductSearchLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [form.productName, discovery]);

  function stopBarcodeScanner() {
    scannerStreamRef.current?.getTracks().forEach((track) => track.stop());
    scannerStreamRef.current = null;
    if (scannerVideoRef.current) {
      scannerVideoRef.current.srcObject = null;
    }
    setScannerOpen(false);
  }

  async function openBarcodeScanner() {
    setScannerMessage("");

    try {
      const BarcodeDetectorCtor = (
        window as typeof window & {
          BarcodeDetector?: new (options?: { formats?: string[] }) => {
            detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
          };
        }
      ).BarcodeDetector;

      if (!BarcodeDetectorCtor) {
        throw new Error(
          "Este navegador não oferece leitura automática de código. Digite o EAN/GTIN no campo.",
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      scannerStreamRef.current = stream;
      setScannerOpen(true);

      window.setTimeout(async () => {
        const video = scannerVideoRef.current;
        if (!video) return;

        video.srcObject = stream;
        await video.play();

        const detector = new BarcodeDetectorCtor({
          formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"],
        });

        const scan = async () => {
          if (!scannerStreamRef.current || !scannerVideoRef.current) return;

          try {
            const codes = await detector.detect(scannerVideoRef.current);
            const value = codes[0]?.rawValue?.trim();

            if (value) {
              setForm((current) => ({
                ...current,
                productName: value,
              }));
              setProductSuggestions([]);
              setDiscovery(null);
              setScannerMessage(`Código identificado: ${value}`);
              stopBarcodeScanner();
              return;
            }
          } catch {
            // Mantém a câmera ativa e tenta novamente.
          }

          window.setTimeout(scan, 350);
        };

        void scan();
      }, 50);
    } catch (caught) {
      stopBarcodeScanner();
      setScannerMessage(
        caught instanceof Error
          ? caught.message
          : "Não foi possível abrir a câmera.",
      );
    }
  }

  function selectProductSuggestion(item: ProductSearchSuggestion) {
    setForm((current) => ({
      ...current,
      productName: item.title,
      categoryId: item.categoryId ?? current.categoryId,
    }));
    setProductSuggestions([]);
    setDiscovery(null);
    setQuoteMessage(
      item.source === "CATALOG"
        ? "Produto selecionado no catálogo. Agora vou completar mercado e logística."
        : "Anúncio semelhante selecionado. Agora vou completar mercado e logística.",
    );
  }

  const tone = useMemo(() => {
    if (!analysis) return "neutral";
    return analysis.verdict === "GOOD"
      ? "good"
      : analysis.verdict === "TIGHT"
        ? "tight"
        : "bad";
  }, [analysis]);

  const hasCoreInputs =
    number(form.supplierPrice) > 0 && number(form.salePrice) > 0;

  const currentPreview = useMemo(
    () => (hasCoreInputs ? analyzeProfitability(toInput(form)) : null),
    [form, hasCoreInputs],
  );

  const maxNetPurchase = Math.max(
    0,
    number(form.salePrice) -
      (number(form.salePrice) * number(form.commissionPercent)) / 100 -
      number(form.fixedFee) -
      number(form.shippingCost) -
      number(form.operatingCost) -
      (number(form.salePrice) * number(form.targetMarginPercent)) / 100,
  );

  const discountFactor = 1 - number(form.discountPercent) / 100;
  const qty = Math.max(1, number(form.kitQuantity));
  const maxSupplierUnit =
    discountFactor > 0 ? maxNetPurchase / qty / discountFactor : 0;

  const kitRows = useMemo(() => {
    if (!hasCoreInputs) return [];

    const basePrice = number(form.salePrice);
    const discounts: Record<number, number> = {
      1: 1,
      2: 0.97,
      3: 0.94,
      5: 0.91,
      10: 0.88,
    };

    return [1, 2, 3, 5, 10].map((kitQuantity) =>
      analyzeProfitability(
        toInput(form, {
          kitQuantity,
          salePrice: basePrice * kitQuantity * discounts[kitQuantity],
        }),
      ),
    );
  }, [form, hasCoreInputs]);

  function field<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function runAnalysis(nextForm = form) {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toInput(nextForm)),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error ?? "Falha ao analisar produto");
    }

    setAnalysis(payload.analysis);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setQuoteMessage("");

    try {
      if (!form.productName.trim()) {
        throw new Error("Informe o nome, EAN ou GTIN do produto.");
      }

      if (number(form.supplierPrice) <= 0) {
        throw new Error("Informe o preço de compra do produto.");
      }

      let next = { ...form };

      const needsDiscovery =
        !next.categoryId.trim() ||
        number(next.weightGrams) <= 0 ||
        number(next.heightCm) <= 0 ||
        number(next.widthCm) <= 0 ||
        number(next.lengthCm) <= 0;

      if (needsDiscovery) {
        const discoveryPayload = await fetchJsonWithTimeout<DiscoveryPayload>(
          "/api/ml/product-discovery",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query: next.productName.trim() }),
          },
          35000,
        );

        setDiscovery(discoveryPayload);

        next = {
          ...next,
          productName:
            discoveryPayload.identification.name || next.productName,
          categoryId:
            discoveryPayload.identification.categoryId ??
            next.categoryId,
          weightGrams:
            number(next.weightGrams) > 0
              ? next.weightGrams
              : discoveryPayload.dimensions
                ? String(discoveryPayload.dimensions.weightGrams)
                : "",
          heightCm:
            number(next.heightCm) > 0
              ? next.heightCm
              : discoveryPayload.dimensions
                ? String(discoveryPayload.dimensions.heightCm)
                : "",
          widthCm:
            number(next.widthCm) > 0
              ? next.widthCm
              : discoveryPayload.dimensions
                ? String(discoveryPayload.dimensions.widthCm)
                : "",
          lengthCm:
            number(next.lengthCm) > 0
              ? next.lengthCm
              : discoveryPayload.dimensions
                ? String(discoveryPayload.dimensions.lengthCm)
                : "",
        };

        if (discoveryPayload.identification.categoryId) {
          setCategorySuggestion({
            domainId: null,
            domainName: discoveryPayload.identification.domainName,
            categoryId: discoveryPayload.identification.categoryId,
            categoryName:
              discoveryPayload.identification.categoryName ??
              discoveryPayload.identification.categoryId,
          });
        }
      }

      if (!next.categoryId.trim()) {
        throw new Error(
          "Não consegui identificar a categoria automaticamente. Refine o nome do produto.",
        );
      }

      if (
        number(next.weightGrams) <= 0 ||
        number(next.heightCm) <= 0 ||
        number(next.widthCm) <= 0 ||
        number(next.lengthCm) <= 0
      ) {
        throw new Error(
          "Não encontrei embalagem confiável em produtos semelhantes. Informe peso e dimensões apenas para este caso.",
        );
      }

      if (number(next.salePrice) <= 0) {
        const pricePayload = await fetchJsonWithTimeout<{
          suggestedPrice: number;
          quote: {
            commissionPercent: number;
            fixedFee: number;
            shippingCost: number;
          };
          analysis: ProfitabilityResult;
        }>(
          "/api/ml/suggest-price",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              productName: next.productName,
              supplierPrice: number(next.supplierPrice),
              discountPercent: number(next.discountPercent),
              kitQuantity: number(next.kitQuantity),
              listingType: next.listingType,
              categoryId: next.categoryId.trim(),
              weightGrams: number(next.weightGrams),
              heightCm: number(next.heightCm),
              widthCm: number(next.widthCm),
              lengthCm: number(next.lengthCm),
              operatingCost: number(next.operatingCost),
              targetMarginPercent: number(next.targetMarginPercent),
              targetRoiPercent: number(next.targetRoiPercent),
            }),
          },
          45000,
        );

        next = {
          ...next,
          salePrice: Number(pricePayload.suggestedPrice).toFixed(2),
          commissionPercent: Number(
            pricePayload.quote.commissionPercent,
          ).toFixed(2),
          fixedFee: Number(pricePayload.quote.fixedFee).toFixed(2),
          shippingCost: Number(pricePayload.quote.shippingCost).toFixed(2),
        };
        setAnalysis(pricePayload.analysis);
      } else {
        const quote = await fetchMlQuote(next.listingType, next);
        next = {
          ...next,
          commissionPercent: quote.commissionPercent.toFixed(2),
          fixedFee: quote.fixedFee.toFixed(2),
          shippingCost: quote.shippingCost.toFixed(2),
        };
        await runAnalysis(next);
      }

      setForm(next);
      setQuoteMessage(
        "Produto identificado, custos do Mercado Livre atualizados e análise concluída.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Falha ao analisar",
      );
    } finally {
      setLoading(false);
    }
  }

  async function fetchMlQuote(
    listingType: ListingType,
    sourceForm: FormState = form,
  ): Promise<MlQuote> {
    return fetchJsonWithTimeout<MlQuote>(
      "/api/ml/quote",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salePrice: number(sourceForm.salePrice),
          categoryId: sourceForm.categoryId.trim(),
          listingType,
          weightGrams: number(sourceForm.weightGrams),
          heightCm: number(sourceForm.heightCm),
          widthCm: number(sourceForm.widthCm),
          lengthCm: number(sourceForm.lengthCm),
        }),
      },
      25000,
    );
  }

  async function identifyProduct() {
    if (!form.productName.trim()) {
      setError("Informe o nome, EAN ou GTIN do produto.");
      return;
    }

    setDiscoveryLoading(true);
    setError("");
    setQuoteMessage("");

    try {
      const payload = await fetchJsonWithTimeout<DiscoveryPayload>(
        "/api/ml/product-discovery",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: form.productName.trim() }),
        },
        35000,
      );

      const next = {
        ...form,
        productName: payload.identification.name || form.productName,
        categoryId:
          payload.identification.categoryId ?? form.categoryId,
        weightGrams: payload.dimensions
          ? String(payload.dimensions.weightGrams)
          : form.weightGrams,
        heightCm: payload.dimensions
          ? String(payload.dimensions.heightCm)
          : form.heightCm,
        widthCm: payload.dimensions
          ? String(payload.dimensions.widthCm)
          : form.widthCm,
        lengthCm: payload.dimensions
          ? String(payload.dimensions.lengthCm)
          : form.lengthCm,
      };

      setForm(next);
      setDiscovery(payload);

      if (payload.identification.categoryId) {
        setCategorySuggestion({
          domainId: null,
          domainName: payload.identification.domainName,
          categoryId: payload.identification.categoryId,
          categoryName:
            payload.identification.categoryName ??
            payload.identification.categoryId,
        });
      }

      setQuoteMessage(
        payload.dimensions
          ? "Produto identificado. Categoria, preço de mercado e embalagem estimada foram carregados."
          : "Produto identificado e faixa de mercado carregada. Confirme peso e dimensões da embalagem.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Falha ao identificar produto.",
      );
    } finally {
      setDiscoveryLoading(false);
    }
  }

  async function detectCategory() {
    setCategoryLoading(true);
    setQuoteMessage("");
    setError("");

    try {
      const response = await fetch("/api/ml/category-predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.productName }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao detectar categoria.");
      }

      const best = payload.best as CategorySuggestion | null;
      if (!best) {
        throw new Error("Nenhuma categoria sugerida para esse produto.");
      }

      setCategorySuggestion(best);
      field("categoryId", best.categoryId);
      setQuoteMessage(
        `Categoria sugerida: ${best.categoryName} (${best.categoryId}).`,
      );
    } catch (caught) {
      setQuoteMessage(
        caught instanceof Error
          ? caught.message
          : "Falha ao detectar categoria.",
      );
    } finally {
      setCategoryLoading(false);
    }
  }

  async function suggestPrice() {
    setPriceLoading(true);
    setQuoteMessage("");
    setError("");

    try {
      const response = await fetch("/api/ml/suggest-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: form.productName,
          supplierPrice: number(form.supplierPrice),
          discountPercent: number(form.discountPercent),
          kitQuantity: number(form.kitQuantity),
          listingType: form.listingType,
          categoryId: form.categoryId.trim(),
          weightGrams: number(form.weightGrams),
          heightCm: number(form.heightCm),
          widthCm: number(form.widthCm),
          lengthCm: number(form.lengthCm),
          operatingCost: number(form.operatingCost),
          targetMarginPercent: number(form.targetMarginPercent),
          targetRoiPercent: number(form.targetRoiPercent),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao sugerir preço.");
      }

      const next = {
        ...form,
        salePrice: Number(payload.suggestedPrice).toFixed(2),
        commissionPercent: Number(payload.quote.commissionPercent).toFixed(2),
        fixedFee: Number(payload.quote.fixedFee).toFixed(2),
        shippingCost: Number(payload.quote.shippingCost).toFixed(2),
      };

      setForm(next);
      setAnalysis(payload.analysis);
      setQuoteMessage(
        `Preço sugerido pelo Radar: ${money.format(payload.suggestedPrice)} com tarifa e frete reais da sua conta.`,
      );
    } catch (caught) {
      setQuoteMessage(
        caught instanceof Error ? caught.message : "Falha ao sugerir preço.",
      );
    } finally {
      setPriceLoading(false);
    }
  }

  async function scanMarket(nextForm = form) {
    setMarketLoading(true);
    setQuoteMessage("");
    setError("");

    try {
      const response = await fetch("/api/ml/market-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: nextForm.productName,
          supplierPrice: number(nextForm.supplierPrice),
          discountPercent: number(nextForm.discountPercent),
          kitQuantity: number(nextForm.kitQuantity),
          salePrice: number(nextForm.salePrice),
          listingType: nextForm.listingType,
          categoryId: nextForm.categoryId.trim(),
          weightGrams: number(nextForm.weightGrams),
          heightCm: number(nextForm.heightCm),
          widthCm: number(nextForm.widthCm),
          lengthCm: number(nextForm.lengthCm),
          operatingCost: number(nextForm.operatingCost),
          targetMarginPercent: number(nextForm.targetMarginPercent),
          targetRoiPercent: number(nextForm.targetRoiPercent),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao analisar o mercado.");
      }

      setMarketScan(payload);
      setQuoteMessage(
        `Mercado analisado: ${payload.market.resultCount} comparáveis · ${payload.verdictLabel}.`,
      );
    } catch (caught) {
      setQuoteMessage(
        caught instanceof Error ? caught.message : "Falha ao analisar mercado.",
      );
    } finally {
      setMarketLoading(false);
    }
  }

  async function applyMlQuote() {
    setQuoteLoading(true);
    setQuoteMessage("");
    setError("");

    try {
      const quote = await fetchMlQuote(form.listingType);
      const next = {
        ...form,
        commissionPercent: quote.commissionPercent.toFixed(2),
        fixedFee: quote.fixedFee.toFixed(2),
        shippingCost: quote.shippingCost.toFixed(2),
      };

      setForm(next);
      await runAnalysis(next);
      setQuoteMessage(
        "Tarifa e frete da API aplicados à análise atual.",
      );
    } catch (caught) {
      setQuoteMessage(
        caught instanceof Error
          ? caught.message
          : "Falha ao consultar Mercado Livre.",
      );
    } finally {
      setQuoteLoading(false);
    }
  }

  async function compareListingTypes() {
    setQuoteLoading(true);
    setQuoteMessage("");
    setComparison([]);

    try {
      const [classic, premium] = await Promise.all([
        fetchMlQuote("CLASSIC"),
        fetchMlQuote("PREMIUM"),
      ]);

      const enrich = (quote: MlQuote): ComparedQuote => ({
        ...quote,
        analysis: analyzeProfitability(
          toInput(form, {
            listingType: quote.listingType,
            commissionPercent: quote.commissionPercent,
            fixedFee: quote.fixedFee,
            shippingCost: quote.shippingCost,
          }),
        ),
      });

      setComparison([enrich(classic), enrich(premium)]);
      setQuoteMessage(
        "Comparação carregada com custos da sua conta.",
      );
    } catch (caught) {
      setQuoteMessage(
        caught instanceof Error
          ? caught.message
          : "Falha ao comparar anúncios.",
      );
    } finally {
      setQuoteLoading(false);
    }
  }

  function useComparedQuote(item: ComparedQuote) {
    const next = {
      ...form,
      listingType: item.listingType,
      commissionPercent: item.commissionPercent.toFixed(2),
      fixedFee: item.fixedFee.toFixed(2),
      shippingCost: item.shippingCost.toFixed(2),
    };

    setForm(next);
    setAnalysis(item.analysis);
  }

  return (
    <section className="analyzer" id="analisar">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Analisador de produto</p>
          <h2>Preço, frete, comissão e margem em uma conta só.</h2>
        </div>
        <p>
          Informe o produto e seu custo. Comissão, tarifa e frete são consultados
          automaticamente na conta conectada do Mercado Livre.
        </p>
      </div>

      <div className="analyzer-grid">
        <form className="panel form-panel" onSubmit={submit}>
          <div className="field wide smart-product-field">
            <label>Produto, EAN ou GTIN</label>
            <div className="smart-product-search-shell">
              <div className="smart-product-input">
                <input
                  placeholder="Comece a digitar o produto ou informe o código de barras"
                  value={form.productName}
                  onChange={(e) => {
                    field("productName", e.target.value);
                    setDiscovery(null);
                    setProductSuggestions([]);
                  }}
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="scanner-button"
                  onClick={openBarcodeScanner}
                  aria-label="Ler código de barras com a câmera"
                  title="Ler código de barras"
                >
                  ▣
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={discoveryLoading || !form.productName.trim()}
                  onClick={identifyProduct}
                >
                  {discoveryLoading ? "Analisando..." : "Usar este produto"}
                </button>
              </div>

              {(productSearchLoading || productSuggestions.length > 0) && (
                <div className="product-search-results">
                  {productSearchLoading && (
                    <div className="product-search-status">
                      Buscando no Mercado Livre...
                    </div>
                  )}

                  {!productSearchLoading &&
                    productSuggestions.map((item) => (
                      <button
                        type="button"
                        className="product-search-option"
                        key={item.key}
                        onClick={() => selectProductSuggestion(item)}
                      >
                        {item.thumbnail ? (
                          <img src={item.thumbnail} alt="" loading="lazy" />
                        ) : (
                          <span className="product-search-thumb">ML</span>
                        )}

                        <span className="product-search-copy">
                          <strong>{item.title}</strong>
                          <small>
                            {item.source === "CATALOG"
                              ? "Produto de catálogo"
                              : "Anúncio semelhante"}
                            {item.price != null
                              ? ` · ${money.format(item.price)}`
                              : ""}
                          </small>
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            <small className="field-hint neutral">
              Ao digitar, o Radar mostra produtos do catálogo e anúncios semelhantes.
              EAN/GTIN tenta uma identificação exata primeiro.
            </small>

            {catalogSearchUnavailable && (
              <small className="field-hint warning">
                O catálogo não respondeu para esta conta, então estou usando a busca
                de anúncios semelhantes como fallback.
              </small>
            )}
          </div>

          {scannerMessage && (
            <small className="field-hint neutral wide">{scannerMessage}</small>
          )}

          {scannerOpen && (
            <div className="barcode-scanner-modal" role="dialog" aria-modal="true">
              <div className="barcode-scanner-card">
                <div className="barcode-scanner-head">
                  <div>
                    <span className="eyebrow">Leitor de código</span>
                    <strong>Aponte para o EAN/GTIN</strong>
                  </div>
                  <button type="button" onClick={stopBarcodeScanner}>
                    Fechar
                  </button>
                </div>
                <div className="barcode-video-shell">
                  <video ref={scannerVideoRef} muted playsInline />
                  <span className="barcode-target" />
                </div>
                <small>
                  O código é processado no próprio navegador e usado apenas para
                  localizar o produto.
                </small>
              </div>
            </div>
          )}

          {discovery && (
            <div className="discovery-card wide">
              <div className="discovery-main">
                <div>
                  <span className="data-origin">
                    {discovery.identification.barcode
                      ? "Identificado por código de barras"
                      : "Identificado pelo Mercado Livre"}
                  </span>
                  <strong>{discovery.identification.name}</strong>
                  <small>
                    {discovery.identification.categoryName ?? "Categoria detectada"}
                    {discovery.identification.catalogProductId
                      ? ` · Catálogo ${discovery.identification.catalogProductId}`
                      : ""}
                  </small>
                </div>
                <div className="discovery-market-price">
                  <span>Preço típico no mercado</span>
                  <strong>
                    {discovery.market.medianPrice == null
                      ? "Sem referência"
                      : money.format(discovery.market.medianPrice)}
                  </strong>
                  <small>
                    {discovery.market.comparableCount} anúncios comparáveis
                    {discovery.market.minimumPrice != null &&
                    discovery.market.maximumPrice != null
                      ? ` · ${money.format(discovery.market.minimumPrice)} a ${money.format(discovery.market.maximumPrice)}`
                      : ""}
                  </small>
                </div>
              </div>

              {discovery.dimensions && (
                <div className="discovery-dimensions">
                  <span>Embalagem estimada</span>
                  <strong>
                    {discovery.dimensions.lengthCm} × {discovery.dimensions.widthCm} × {discovery.dimensions.heightCm} cm · {discovery.dimensions.weightGrams} g
                  </strong>
                  <small>
                    Baseada em {discovery.dimensions.sampleSize} anúncio(s) semelhante(s) · confiança {discovery.dimensions.confidence.toLowerCase()}
                  </small>
                </div>
              )}
            </div>
          )}

          <div className="field">
            <label>Fornecedor <span className="optional-label">opcional</span></label>
            <input
              placeholder="Ex.: Distribuidora X"
              value={form.supplierName}
              onChange={(e) => field("supplierName", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Preço de compra / tabela</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0,00"
              value={form.supplierPrice}
              onChange={(e) => field("supplierPrice", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Desconto do fornecedor %</label>
            <input
              type="number"
              step="0.01"
              value={form.discountPercent}
              onChange={(e) => field("discountPercent", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Quantidade no kit</label>
            <input
              type="number"
              min="1"
              value={form.kitQuantity}
              onChange={(e) => field("kitQuantity", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Preço de venda</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Pode ser sugerido pelo Radar"
              value={form.salePrice}
              onChange={(e) => field("salePrice", e.target.value)}
            />
            <small className="field-hint neutral">
              Deixe vazio para usar a sugestão baseada nos custos reais do Mercado Livre.
            </small>
          </div>

          <div className="field">
            <label>Tipo de anúncio</label>
            <select
              value={form.listingType}
              onChange={(e) =>
                field("listingType", e.target.value as ListingType)
              }
            >
              <option value="CLASSIC">Clássico</option>
              <option value="PREMIUM">Premium</option>
            </select>
          </div>
          <div className="ml-costs-auto wide">
            <div className="ml-costs-head">
              <div>
                <span>Custos Mercado Livre</span>
                <strong>Preenchimento automático</strong>
              </div>
              <span className="api-source-badge">Mercado Livre API</span>
            </div>
            <div className="ml-costs-grid">
              <div>
                <span>Comissão</span>
                <strong>
                  {number(form.commissionPercent) > 0
                    ? form.commissionPercent + "%"
                    : "Aguardando consulta"}
                </strong>
              </div>
              <div>
                <span>Tarifa fixa</span>
                <strong>
                  {number(form.fixedFee) > 0
                    ? money.format(number(form.fixedFee))
                    : "Automática"}
                </strong>
              </div>
              <div>
                <span>Frete da conta</span>
                <strong>
                  {number(form.shippingCost) > 0
                    ? money.format(number(form.shippingCost))
                    : "Automático"}
                </strong>
              </div>
            </div>
            <small>
              Esses valores não são digitados manualmente. O Radar consulta sua
              conta, categoria, preço e logística no momento da análise.
            </small>
          </div>
          <div className="field">
            <label>Custo operacional</label>
            <input
              type="number"
              step="0.01"
              value={form.operatingCost}
              onChange={(e) => field("operatingCost", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Meta de margem %</label>
            <input
              type="number"
              step="0.01"
              value={form.targetMarginPercent}
              onChange={(e) =>
                field("targetMarginPercent", e.target.value)
              }
            />
          </div>
          <div className="field">
            <label>Meta de ROI %</label>
            <input
              type="number"
              step="0.01"
              value={form.targetRoiPercent}
              onChange={(e) => field("targetRoiPercent", e.target.value)}
            />
          </div>

          {number(form.salePrice) > 0 ? (
            <div className="purchase-limit wide">
              <div>
                <span>Custo líquido máximo do kit</span>
                <strong>{money.format(maxNetPurchase)}</strong>
              </div>
              <div>
                <span>Preço máximo no fornecedor por unidade</span>
                <strong>{money.format(maxSupplierUnit)}</strong>
              </div>
              <small>
                Limite calculado para manter {form.targetMarginPercent}% de
                margem com os custos atuais.
              </small>
            </div>
          ) : (
            <div className="purchase-limit wide empty-limit">
              <div>
                <span>Preço de venda</span>
                <strong>Será sugerido</strong>
              </div>
              <small>
                Detecte a categoria, informe peso e dimensões e use “Sugerir preço”.
              </small>
            </div>
          )}

          {error && <div className="error wide">{error}</div>}

          <button
            className="primary wide"
            disabled={loading}
          >
            {loading
              ? "Consultando Mercado Livre..."
              : "Analisar produto automaticamente"}
          </button>
        </form>

        <div className={"panel result-panel " + tone}>
          {!analysis ? (
            <div className="empty-result">
              <span className="radar">◎</span>
              <h3>{currentPreview ? "Prévia pronta" : "Comece pelo produto"}</h3>
              <p>
                {currentPreview
                  ? `Com os números atuais: margem ${currentPreview.marginPercent.toFixed(1)}% e ROI ${currentPreview.roiPercent.toFixed(1)}%.`
                  : "Informe nome e custo. O Radar completa os dados do Mercado Livre e pode sugerir o preço."}
              </p>
            </div>
          ) : (
            <>
              <div className="verdict">
                <span>Resultado</span>
                <strong>{verdictLabel(analysis.verdict)}</strong>
              </div>

              <div className="hero-number">
                <span>Lucro estimado por venda</span>
                <strong>{money.format(analysis.profit)}</strong>
              </div>

              <div className="result-grid">
                <div>
                  <span>Custo unitário</span>
                  <strong>{money.format(analysis.unitCost)}</strong>
                </div>
                <div>
                  <span>Custo do kit</span>
                  <strong>{money.format(analysis.purchaseCost)}</strong>
                </div>
                <div>
                  <span>Comissão ML</span>
                  <strong>{money.format(analysis.commissionAmount)}</strong>
                </div>
                <div>
                  <span>Recebe do ML</span>
                  <strong>{money.format(analysis.amountReceived)}</strong>
                </div>
                <div>
                  <span>Margem</span>
                  <strong>{analysis.marginPercent.toFixed(1)}%</strong>
                </div>
                <div>
                  <span>ROI</span>
                  <strong>{analysis.roiPercent.toFixed(1)}%</strong>
                </div>
              </div>

              <div className="recommendation">
                <span>Preço mínimo para suas metas</span>
                <strong>
                  {money.format(analysis.minimumSuggestedPrice)}
                </strong>
                <small>
                  Ponto de equilíbrio:{" "}
                  {money.format(analysis.breakEvenPrice)} · ML deixa{" "}
                  {analysis.receivedPercent.toFixed(1)}% do preço antes
                  do custo do produto.
                </small>
              </div>
            </>
          )}
        </div>
      </div>

      <details className="ml-quote-panel advanced-analysis">
        <summary>
          <div>
            <span className="eyebrow">Ajustes avançados</span>
            <strong>Categoria, embalagem e custos do Mercado Livre</strong>
          </div>
          <span className="advanced-chevron">⌄</span>
        </summary>
        <div className="advanced-analysis-body">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Custos reais da conta</p>
            <h2>Consultar Mercado Livre</h2>
          </div>
          <p>
            O Radar tenta preencher categoria, peso e dimensões por produtos
            semelhantes. Quando houver estimativa, confirme antes de publicar
            porque a embalagem real continua sendo a referência correta.
          </p>
        </div>

        <div className="quote-fields">
          <div className="field category">
            <label>Categoria ML</label>
            <input
              placeholder="Detecte pela descrição ou informe o ID"
              value={form.categoryId}
              onChange={(e) => field("categoryId", e.target.value.trim())}
            />
            {categorySuggestion && (
              <small className="field-hint">
                {categorySuggestion.categoryName}
                {categorySuggestion.domainName
                  ? ` · ${categorySuggestion.domainName}`
                  : ""}
              </small>
            )}
          </div>
          <div className="field">
            <label>Peso (g)</label>
            <input
              type="number"
              value={form.weightGrams}
              onChange={(e) => field("weightGrams", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Altura (cm)</label>
            <input
              type="number"
              step="0.1"
              value={form.heightCm}
              onChange={(e) => field("heightCm", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Largura (cm)</label>
            <input
              type="number"
              step="0.1"
              value={form.widthCm}
              onChange={(e) => field("widthCm", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Comprimento (cm)</label>
            <input
              type="number"
              step="0.1"
              value={form.lengthCm}
              onChange={(e) => field("lengthCm", e.target.value)}
            />
          </div>
        </div>

        <div className="quote-actions">
          <button
            type="button"
            className="secondary"
            disabled={categoryLoading || !form.productName.trim()}
            onClick={detectCategory}
          >
            {categoryLoading ? "Detectando..." : "1. Detectar categoria"}
          </button>
          <button
            type="button"
            className="primary inline"
            disabled={
              priceLoading ||
              !form.categoryId ||
              !form.productName.trim() ||
              number(form.supplierPrice) <= 0 ||
              number(form.weightGrams) <= 0 ||
              number(form.heightCm) <= 0 ||
              number(form.widthCm) <= 0 ||
              number(form.lengthCm) <= 0
            }
            onClick={suggestPrice}
          >
            {priceLoading ? "Calculando preço..." : "2. Sugerir preço"}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={quoteLoading || !form.categoryId || number(form.salePrice) <= 0}
            onClick={compareListingTypes}
          >
            3. Comparar Clássico × Premium
          </button>
          <button
            type="button"
            className="primary inline"
            disabled={quoteLoading || !form.categoryId || number(form.salePrice) <= 0}
            onClick={applyMlQuote}
          >
            {quoteLoading ? "Consultando..." : "Recalcular custos ML"}
          </button>
          <button
            type="button"
            className="secondary market-action"
            disabled={
              marketLoading ||
              !form.categoryId ||
              number(form.salePrice) <= 0 ||
              number(form.supplierPrice) <= 0
            }
            onClick={() => scanMarket()}
          >
            {marketLoading ? "Lendo mercado..." : "4. Analisar mercado"}
          </button>
        </div>

        {quoteMessage && (
          <div className="quote-message">{quoteMessage}</div>
        )}

        {comparison.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Anúncio</th>
                  <th>Comissão</th>
                  <th>Tarifa fixa</th>
                  <th>Frete</th>
                  <th>Lucro</th>
                  <th>Margem</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {comparison.map((item) => (
                  <tr key={item.listingType}>
                    <td>
                      <strong>
                        {item.listingType === "CLASSIC"
                          ? "Clássico"
                          : "Premium"}
                      </strong>
                    </td>
                    <td>{item.commissionPercent.toFixed(2)}%</td>
                    <td>{money.format(item.fixedFee)}</td>
                    <td>{money.format(item.shippingCost)}</td>
                    <td>{money.format(item.analysis.profit)}</td>
                    <td>{item.analysis.marginPercent.toFixed(1)}%</td>
                    <td>
                      <button
                        type="button"
                        className="table-action"
                        onClick={() => useComparedQuote(item)}
                      >
                        Usar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </details>

      {marketScan && (
        <section className="market-intelligence-panel" id="mercado">
          <div className="market-decision-head">
            <div>
              <p className="eyebrow">Decisão de mercado</p>
              <h2>{marketScan.verdictLabel}</h2>
              <p>
                O Radar cruza sua rentabilidade com anúncios comparáveis reais.
                O score mede aderência financeira e de preço — não é previsão de vendas.
              </p>
            </div>
            <div className={"fit-score " + (
              marketScan.fitScore >= 75
                ? "good"
                : marketScan.fitScore >= 55
                  ? "tight"
                  : "bad"
            )}>
              <span>Fit score</span>
              <strong>{marketScan.fitScore}</strong>
              <small>/100</small>
            </div>
          </div>

          <div className="decision-guidance">
            <div>
              <span>Leitura do Radar</span>
              <strong>{marketScan.decision.headline}</strong>
              <p>{marketScan.decision.reason}</p>
            </div>
            <div className="decision-next">
              <span>Próxima ação</span>
              <p>{marketScan.decision.nextAction}</p>
            </div>
          </div>

          <div className="market-kpis">
            <div>
              <span>Seu preço</span>
              <strong>{money.format(number(form.salePrice))}</strong>
              <small>
                {marketScan.market.marketGapPercent > 0 ? "+" : ""}
                {marketScan.market.marketGapPercent.toFixed(1)}% vs. mediana
              </small>
            </div>
            <div>
              <span>Mediana mercado</span>
              <strong>{money.format(marketScan.market.medianPrice)}</strong>
              <small>{marketScan.market.resultCount} comparáveis</small>
            </div>
            <div>
              <span>Faixa central</span>
              <strong>
                {money.format(marketScan.market.p25Price)} — {money.format(marketScan.market.p75Price)}
              </strong>
              <small>P25 a P75</small>
            </div>
            <div>
              <span>Lucro no seu preço</span>
              <strong>{money.format(marketScan.finance.profit)}</strong>
              <small>
                {marketScan.finance.marginPercent.toFixed(1)}% margem · {marketScan.finance.roiPercent.toFixed(1)}% ROI
              </small>
            </div>
          </div>

          <div className="price-ladder">
            <div className="ladder-labels">
              <span>Mín. {money.format(marketScan.market.minimumPrice)}</span>
              <span>Mediana {money.format(marketScan.market.medianPrice)}</span>
              <span>Máx. {money.format(marketScan.market.maximumPrice)}</span>
            </div>
            <div className="ladder-track">
              <span
                className="ladder-market-band"
                style={{
                  left: `${Math.max(
                    0,
                    Math.min(
                      100,
                      ((marketScan.market.p25Price - marketScan.market.minimumPrice) /
                        Math.max(0.01, marketScan.market.maximumPrice - marketScan.market.minimumPrice)) *
                        100,
                    ),
                  )}%`,
                  width: `${Math.max(
                    2,
                    Math.min(
                      100,
                      ((marketScan.market.p75Price - marketScan.market.p25Price) /
                        Math.max(0.01, marketScan.market.maximumPrice - marketScan.market.minimumPrice)) *
                        100,
                    ),
                  )}%`,
                }}
              />
              <span
                className="ladder-own-price"
                style={{
                  left: `${Math.max(
                    0,
                    Math.min(
                      100,
                      ((number(form.salePrice) - marketScan.market.minimumPrice) /
                        Math.max(0.01, marketScan.market.maximumPrice - marketScan.market.minimumPrice)) *
                        100,
                    ),
                  )}%`,
                }}
              >
                <i />
                <b>Você</b>
              </span>
            </div>
          </div>

          <div className="buying-power">
            <div>
              <span>Seu custo líquido/un.</span>
              <strong>{money.format(marketScan.buyingPower.currentNetUnitCost)}</strong>
            </div>
            <div>
              <span>Custo líquido máximo na mediana</span>
              <strong>{money.format(marketScan.buyingPower.maxNetUnitCostAtMedian)}</strong>
            </div>
            <div>
              <span>Preço máximo de tabela no fornecedor</span>
              <strong>{money.format(marketScan.buyingPower.maxSupplierPriceAtMedian)}</strong>
            </div>
            <div className={marketScan.buyingPower.costReductionNeeded > 0 ? "danger-value" : "good-value"}>
              <span>Ajuste de custo necessário</span>
              <strong>
                {marketScan.buyingPower.costReductionNeeded > 0
                  ? "-" + money.format(marketScan.buyingPower.costReductionNeeded)
                  : "Dentro da meta"}
              </strong>
            </div>
          </div>

          <div className="competitor-head">
            <div>
              <strong>Comparáveis encontrados</strong>
              <small>
                Similaridade média {marketScan.evidence.averageSimilarityPercent}% · preços atuais quando disponíveis
              </small>
            </div>
          </div>

          <div className="competitor-grid">
            {marketScan.competitors.map((item) => (
              <article className="competitor-card" key={item.id}>
                <div className="competitor-top">
                  <span>{item.similarity}% similar</span>
                  {item.freeShipping && <b>Frete grátis</b>}
                </div>
                <h3>{item.title}</h3>
                <strong>{money.format(item.price)}</strong>
                <small>{item.id}</small>
                {item.permalink && (
                  <a href={item.permalink} target="_blank" rel="noreferrer">
                    Ver anúncio
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      {kitRows.length > 0 && (
      <section className="kit-panel" id="kits">
        <div className="section-heading compact">
          <div>
            <p className="eyebrow">Simulador de kits</p>
            <h2>Quando o kit melhora a conta?</h2>
          </div>
          <p>
            Prévia com desconto progressivo no preço do kit e o mesmo frete
            atual. Recalcule o frete antes de publicar kits maiores.
          </p>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kit</th>
                <th>Preço simulado</th>
                <th>Custo produto</th>
                <th>Lucro</th>
                <th>Margem</th>
                <th>ROI</th>
                <th>Preço mínimo</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {kitRows.map((item) => (
                <tr key={item.kitQuantity}>
                  <td>
                    <strong>{item.kitQuantity} un.</strong>
                  </td>
                  <td>{money.format(item.salePrice)}</td>
                  <td>{money.format(item.purchaseCost)}</td>
                  <td>{money.format(item.profit)}</td>
                  <td>{item.marginPercent.toFixed(1)}%</td>
                  <td>{item.roiPercent.toFixed(1)}%</td>
                  <td>{money.format(item.minimumSuggestedPrice)}</td>
                  <td>
                    <span
                      className={
                        "mini-verdict " +
                        (item.verdict === "GOOD"
                          ? "good"
                          : item.verdict === "TIGHT"
                            ? "tight"
                            : "bad")
                      }
                    >
                      {verdictLabel(item.verdict)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      )}
    </section>
  );
}

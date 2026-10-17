/** Product analysis: automatic reads, explicit evidence, server-side profit formula. */
(() => {
  "use strict";
  const M = globalThis.RadarPanelModel;
  const numeric = (value) =>
    typeof value === "number" && Number.isFinite(value);
  const brl = (value) =>
    numeric(value)
      ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      : "—";
  const num = (value) =>
    numeric(value)
      ? value.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
      : "—";
  const pct = (value) => num(value) + "%";
  const P = globalThis.RadarMarketModel;
  const demand = P.measuredDemand;
  function opportunity(insight, result) {
    const d = demand(insight);
    if (
      result &&
      (result.verdict === "BAD" ||
        result.profit <= 0 ||
        result.marginPercent < 10)
    )
      return {
        tone: "bad",
        title: "Ruim para este custo",
        reason: "A margem simulada fica abaixo de 10% ou há prejuízo.",
      };
    if (d.level === "BAIXA")
      return {
        tone: "warn",
        title: "Oportunidade com pouco giro",
        reason:
          "O ritmo medido fica abaixo de 0,7 unidade por dia. Avalie o capital parado.",
      };
    if (result?.verdict === "TIGHT")
      return {
        tone: "warn",
        title: "Margem apertada",
        reason:
          "A simulação não alcança todas as suas metas de margem e retorno.",
      };
    if (
      result?.verdict === "GOOD" &&
      ["ALTA", "EXCELENTE"].includes(d.level) &&
      insight.estimate.method !== "VIDA"
    )
      return {
        tone: "good",
        title: "Boa oportunidade",
        reason:
          "Demanda medida alta e margem dentro das suas metas. Confira a amostra de preços.",
      };
    if (result?.verdict === "GOOD")
      return {
        tone: "good",
        title: d.level
          ? "Boa margem para analisar"
          : "Boa margem · demanda a confirmar",
        reason:
          "Os custos informados atendem às suas metas. A margem não garante vendas.",
      };
    if (["ALTA", "EXCELENTE"].includes(d.level))
      return {
        tone: "good",
        title: "Demanda forte · avalie o lucro",
        reason:
          "O ritmo de vendas é favorável. Complete seus custos para concluir a viabilidade.",
      };
    return {
      tone: "neutral",
      title: "Análise da oportunidade",
      reason: "Informe o custo de compra para avaliar a margem neste preço.",
    };
  }
  function cardMetrics(observation, insight) {
    const obs = observation || {},
      a = P.assessMarket(obs, insight),
      d = a.demand;
    const signal = {
      text: d.text,
      label: d.label + (d.lowerBound ? " · mínima" : ""),
      tone:
        {
          EXCELENTE: "excellent",
          ALTA: "high",
          MEDIA: "medium",
          BAIXA: "initial",
        }[d.level] || "",
      detail: d.basis,
    };
    if (
      a.recent &&
      numeric(obs.price) &&
      obs.price > 0 &&
      Number.isFinite(d.rate * obs.price)
    ) {
      return {
        signal,
        amount: P.compactMoney(d.rate * obs.price),
        label: "receita est./dia",
        kind: "daily",
        basis: a.soldText,
        detail:
          d.basis +
          " Ritmo medido × preço atual. Estimativa bruta, não faturamento recebido.",
      };
    }
    if (a.reference)
      return {
        signal,
        amount: a.reference.text,
        label: a.reference.label,
        kind: "reference",
        basis: a.soldText,
        detail: a.reference.basis + ". " + a.reference.detail,
      };
    if (d.rate != null)
      return {
        signal,
        amount: num(d.rate) + " un./dia",
        label: "média histórica",
        kind: "rate",
        basis: a.soldText,
        detail: d.basis,
      };
    return {
      signal,
      amount: "—",
      label: "receita de referência",
      kind: "missing",
      basis: a.soldText,
      detail:
        "Falta preço ou quantidade vendida para calcular a referência bruta.",
    };
  }
  function decision(observation, insight, result, advertising) {
    let r = result;
    if (
      r &&
      numeric(advertising?.profitAfterAds) &&
      numeric(advertising?.marginAfterAdsPercent)
    ) {
      const profit = advertising.profitAfterAds,
        margin = advertising.marginAfterAdsPercent;
      const investment = r.purchaseCost + r.operatingCost;
      r = {
        ...r,
        profit,
        marginPercent: margin,
        verdict:
          profit <= 0 || margin < 10
            ? "BAD"
            : margin < (r.targetMarginPercent ?? 20) ||
                (investment > 0 &&
                  (profit / investment) * 100 < (r.targetRoiPercent ?? 30))
              ? "TIGHT"
              : r.verdict,
      };
    }
    if (r && numeric(r.profit) && numeric(r.marginPercent)) {
      const suffix = advertising ? " após Ads" : "";
      if (r.profit <= 0 || r.marginPercent < 10 || r.verdict === "BAD")
        return {
          title:
            r.profit <= 0
              ? "Não compensa neste custo"
              : "Margem baixa para entrar",
          tone: "bad",
          reason:
            r.profit < 0
              ? "Prejuízo de " +
                brl(Math.abs(r.profit)) +
                " por venda" +
                suffix +
                "."
              : "Sobra " +
                brl(r.profit) +
                " por venda" +
                suffix +
                "; margem de " +
                pct(r.marginPercent) +
                ".",
        };
      if (r.verdict === "TIGHT")
        return {
          title: "Margem apertada para sua meta",
          tone: "warn",
          reason:
            "Sobra " +
            brl(r.profit) +
            " por venda" +
            suffix +
            ". A simulação não atinge todas as suas metas.",
        };
      const d = demand(insight);
      if (d.level === "BAIXA")
        return {
          title: "Margem boa · giro baixo",
          tone: "warn",
          reason:
            "O ritmo medido pede cautela com estoque. " +
            brl(r.profit) +
            " por venda" +
            suffix +
            ".",
        };
      const o = opportunity(insight, r);
      return {
        ...o,
        title:
          o.title === "Boa oportunidade"
            ? o.title
            : "Margem boa · confirme o giro",
        reason:
          "Sobra " +
          brl(r.profit) +
          " por venda" +
          suffix +
          ". " +
          (o.title === "Boa oportunidade"
            ? "Demanda recente alta e metas atendidas."
            : "A margem está calculada; o giro recente ainda exige confirmação."),
      };
    }
    return P.assessMarket(observation || {}, insight).potential;
  }
  function receipt(quote, price) {
    const f = quote?.fees;
    if (
      !numeric(price) ||
      !numeric(f?.commissionAmount) ||
      !numeric(f?.fixedFee)
    )
      return null;
    const shipKnown = quote.shippingKnown === true && numeric(f.shippingCost);
    const estimated =
      quote.shippingEstimated === true && numeric(f.shippingCost);
    const manual =
      quote.shippingSource === "MANUAL_ESTIMATE" && numeric(f.shippingCost);
    const applied = shipKnown || estimated || manual;
    return {
      value:
        Math.round(
          (price -
            f.commissionAmount -
            f.fixedFee -
            (applied ? f.shippingCost : 0)) *
            100,
        ) / 100,
      label: estimated
        ? "Repasse com frete estimado"
        : manual
          ? "Repasse com frete informado"
          : shipKnown
            ? "Repasse após tarifas e frete"
            : "Após tarifas, antes do frete",
      shippingKnown: shipKnown,
      shippingEstimated: estimated,
      shippingApplied: applied,
    };
  }
  function createController({ send, preferences, changed }) {
    let generation = 0,
      timer,
      currentKey = "",
      lastCalculation = "";
    let state = empty();
    function empty() {
      return {
        obs: null,
        status: "idle",
        auth: null,
        taxConfigured: false,
        insight: null,
        analytics: null,
        item: null,
        quotes: {},
        candidates: [],
        sample: null,
        listingType: "CLASSIC",
        result: null,
        error: "",
        costSource: "",
        fields: { cost: "", shipping: "", tax: "", operating: "0" },
        settings: { margin: 20, roi: 30 },
        edited: new Set(),
        calculating: false,
      };
    }
    const emit = () => changed(state);
    async function request(path, method = "GET", body) {
      try {
        return await send({ type: "RADAR_FETCH", path, method, body });
      } catch {
        return {
          ok: false,
          status: 0,
          body: { error: "Conexão interrompida. Tente atualizar a análise." },
        };
      }
    }
    function alive(revision) {
      return revision === generation;
    }
    function refresh() {
      if (state.obs) void load(state.obs, true);
    }
    function clear() {
      if (!state.obs) return;
      generation++;
      clearTimeout(timer);
      currentKey = "";
      lastCalculation = "";
      state = empty();
      emit();
    }
    function completeFields() {
      const quote = state.quotes[state.listingType];
      const shipping =
        M.money(state.fields.shipping) ??
        (quote?.shippingKnown || quote?.shippingEstimated
          ? quote.fees.shippingCost
          : null);
      return {
        cost: M.money(state.fields.cost),
        tax: M.money(state.fields.tax),
        operating: M.money(state.fields.operating),
        shipping,
      };
    }
    function payload(quoteOnly = false, listingType = state.listingType) {
      const fields = completeFields();
      return {
        itemId: state.item?.id || state.obs.id,
        title: state.obs.title,
        categoryId: state.item?.categoryId || state.obs.categoryId || undefined,
        salePrice: state.obs.price,
        supplierPrice: quoteOnly ? 0 : fields.cost,
        discountPercent: 0,
        kitQuantity: 1,
        taxPercent: fields.tax ?? undefined,
        operatingCost: fields.operating ?? 0,
        shippingCost:
          quoteOnly ||
          (!state.edited.has("shipping") &&
            (state.quotes[listingType]?.shippingKnown ||
              state.quotes[listingType]?.shippingEstimated))
            ? undefined
            : (fields.shipping ?? undefined),
        targetMarginPercent: state.settings.margin,
        targetRoiPercent: state.settings.roi,
        listingType,
        logisticType:
          state.item?.logisticType ||
          state.obs.logisticType ||
          (state.obs.fulfillment ? "fulfillment" : "drop_off"),
        freeShipping: state.obs.freeShipping,
        quoteOnly,
      };
    }
    async function calculate() {
      clearTimeout(timer);
      const f = completeFields();
      if (
        !state.obs ||
        !state.auth?.authenticated ||
        state.auth.extensionProtocol !== 2 ||
        f.cost == null ||
        f.tax == null ||
        f.tax > 50 ||
        f.shipping == null ||
        f.shipping > 10000 ||
        f.operating == null ||
        f.cost > 10000000 ||
        !(state.obs.price > 0)
      )
        return;
      const data = payload(),
        key = JSON.stringify(data),
        revision = generation;
      if (key === lastCalculation) return;
      lastCalculation = key;
      state.calculating = true;
      state.error = "";
      state.result = null;
      emit();
      const response = await request(
        "/api/extension/profitability",
        "POST",
        data,
      );
      if (!alive(revision) || key !== lastCalculation) return;
      state.calculating = false;
      if (response?.ok) {
        state.quotes[data.listingType] = response.body;
        state.result = response.body?.result || null;
        if (!state.result)
          state.error =
            response.body?.note || "Faltam tarifas ou custos para calcular.";
      } else {
        state.error =
          response?.status === 401
            ? "Entre no Radar para calcular."
            : response?.body?.error || "Não foi possível calcular agora.";
        lastCalculation = "";
      }
      emit();
    }
    function edit(name, value) {
      if (!Object.hasOwn(state.fields, name)) return;
      state.fields[name] = value;
      state.edited.add(name);
      state.result = null;
      state.error = "";
      state.calculating = false;
      lastCalculation = "";
      if (name === "cost")
        state.costSource = "Custo informado para este produto/kit";
      // Editing also invalidates a result already in flight; its payload can no longer win.
      emit();
      clearTimeout(timer);
      timer = setTimeout(() => void calculate(), 450);
    }
    function selectType(type) {
      if (!["CLASSIC", "PREMIUM"].includes(type) || state.listingType === type)
        return;
      state.listingType = type;
      state.edited.add("listingType");
      state.result = null;
      state.error = "";
      state.calculating = false;
      lastCalculation = "";
      emit();
      void calculate();
    }
    async function load(obs, force = false) {
      if (!obs) {
        clear();
        return;
      }
      const key = JSON.stringify([
        obs.id,
        obs.title,
        obs.price,
        obs.categoryId,
        obs.fulfillment,
        obs.freeShipping,
        obs.soldLower,
        obs.soldHasPlus,
        obs.soldLabel,
        obs.rating,
        obs.reviews,
        obs.catalogProductId,
      ]);
      if (!force && key === currentKey) return;
      const previous = state,
        same = previous.obs?.id === obs.id;
      currentKey = key;
      const revision = ++generation;
      clearTimeout(timer);
      lastCalculation = "";
      state = empty();
      state.obs = obs;
      state.status = "loading";
      if (same) {
        state.fields = { ...previous.fields };
        state.edited = new Set(previous.edited);
        state.costSource = previous.costSource;
      }
      emit();
      const auth = await send({ type: "RADAR_AUTH_STATUS" }).catch(() => null);
      if (!alive(revision)) return;
      state.auth = auth;
      if (!auth?.authenticated || auth.extensionProtocol !== 2) {
        state.status = "connection";
        emit();
        return;
      }
      const p = await preferences().catch(() => ({}));
      if (!alive(revision)) return;
      state.taxConfigured = p.radarTaxPercent != null;
      if (!state.edited.has("tax"))
        state.fields.tax =
          p.radarTaxPercent == null ? "" : String(p.radarTaxPercent);
      if (!state.edited.has("operating"))
        state.fields.operating = String(p.radarOperatingCost ?? 0);
      state.settings = {
        margin: M.money(p.radarTargetMarginPercent) ?? 20,
        roi: M.money(p.radarTargetRoiPercent) ?? 30,
      };
      const history = (async () => {
        const r = await request("/api/extension/observations", "POST", {
          page: "product",
          items: [obs],
        });
        if (!alive(revision)) return;
        state.insight = r?.ok
          ? r.body?.items?.find((i) => i.id === obs.id) || null
          : null;
        emit();
      })();
      const market = (async () => {
        const params = new URLSearchParams({
          title: obs.title,
          itemId: obs.id,
        });
        if (obs.price > 0) params.set("currentPrice", String(obs.price));
        const r = await request("/api/extension/market?" + params);
        if (!alive(revision)) return;
        state.candidates = r?.ok
          ? [
              ...new Map(
                (r.body?.competitors || [])
                  .filter(
                    (c) => c.id !== obs.id && numeric(c.price) && c.price > 0,
                  )
                  .map((c) => [c.id, c]),
              ).values(),
            ]
          : [];
        state.sample = M.sample(
          state.candidates.map((c) => c.price),
          obs.price,
        );
        emit();
      })();
      const details = (async () => {
        const r = await request(
          "/api/extension/item?" +
            new URLSearchParams({
              id: obs.id,
              kind:
                obs.referenceKind ||
                (obs.id.startsWith("MLBU") ? "USER_PRODUCT" : "ITEM"),
              ...(obs.catalogProductId
                ? { catalogProductId: obs.catalogProductId }
                : {}),
            }),
        );
        if (!alive(revision)) return;
        state.item = r?.ok ? r.body?.item || null : null;
        const analytics = (async () => {
          const catalogId =
            state.item?.catalogProductId || obs.catalogProductId;
          const data = await request(
            "/api/extension/item?" +
              new URLSearchParams({
                id: state.item?.id || obs.id,
                kind: state.item?.id
                  ? "ITEM"
                  : obs.referenceKind ||
                    (obs.id.startsWith("MLBU") ? "USER_PRODUCT" : "ITEM"),
                analyticsOnly: "1",
                ...(catalogId ? { catalogProductId: catalogId } : {}),
              }),
          );
          if (!alive(revision)) return;
          state.analytics = data?.ok ? data.body?.analytics || null : null;
          emit();
        })();
        const cost = state.item?.isOwn ? r.body?.savedCost : null;
        if (
          cost &&
          numeric(cost.supplierPrice) &&
          numeric(cost.discountPercent) &&
          !state.edited.has("cost")
        ) {
          state.fields.cost = String(
            Math.round(
              cost.supplierPrice * (1 - cost.discountPercent / 100) * 100,
            ) / 100,
          );
          state.costSource =
            cost.source === "SKU"
              ? "Custo cadastrado no SKU deste anúncio"
              : "Custo cadastrado neste anúncio";
        }
        if (!state.edited.has("listingType"))
          state.listingType =
            state.item?.listingTypeId === "gold_pro" ? "PREMIUM" : "CLASSIC";
        emit();
        if (!(obs.price > 0)) return;
        await Promise.allSettled([
          analytics,
          ...["CLASSIC", "PREMIUM"].map(async (type) => {
            const data = payload(true, type),
              quote = await request(
                "/api/extension/profitability",
                "POST",
                data,
              );
            if (!alive(revision)) return;
            state.quotes[type] = quote?.ok
              ? quote.body
              : { error: quote?.body?.error || "Tarifa não disponível" };
            emit();
            if (type === state.listingType) void calculate();
          }),
        ]);
      })();
      await Promise.allSettled([history, market, details]);
      if (!alive(revision)) return;
      state.status = "ready";
      emit();
    }
    return {
      load,
      clear,
      refresh,
      edit,
      selectType,
      calculate,
      get state() {
        return state;
      },
    };
  }
  function marketMetrics(s) {
    const d = demand(s.insight),
      a = s.analytics,
      c = a?.catalog,
      sample = c?.visitsSample,
      visits = sample?.perDay ?? a?.itemVisits?.perDay;
    return [
      {
        label: sample ? "Visitas/dia · ofertas" : "Visitas/dia · anúncio",
        value: numeric(visits) ? num(visits) : "Sem acesso",
        detail: sample
          ? sample.offersMeasured +
            " ofertas medidas em " +
            num(sample.days) +
            " dias. Soma das ofertas; não visitantes únicos do catálogo."
          : a?.itemVisits
            ? "API · " + num(a.itemVisits.days) + " dias."
            : "A API não disponibilizou visitas datadas para esta referência.",
      },
      {
        label:
          d.rate == null &&
          Number.isSafeInteger(s.obs?.soldLower) &&
          s.obs.soldLower >= 0
            ? "Vendas acumuladas · página"
            : s.insight?.estimate?.method === "VIDA"
              ? "Vendas/dia · histórica"
              : "Vendas/dia",
        value:
          d.rate == null
            ? Number.isSafeInteger(s.obs?.soldLower) && s.obs.soldLower >= 0
              ? (s.obs.soldHasPlus ? "+" : "") + num(s.obs.soldLower)
              : "Sem período"
            : num(d.rate),
        detail:
          d.rate == null
            ? "Acumulado visível na página, sem período informado. Não representa vendas por dia."
            : d.basis,
      },
      {
        label: "Ofertas no catálogo",
        value:
          c?.totalReported != null
            ? num(c.totalReported)
            : c?.offersObserved != null
              ? num(c.offersObserved) + " vistas"
              : "Não disponível",
        detail:
          c?.offersObserved != null
            ? num(c.offersObserved) +
              " ofertas carregadas. " +
              num(c.fullOffersObserved) +
              " Full identificadas nessa amostra."
            : "Catálogo não identificado ou ofertas indisponíveis. Não representa todos os produtos parecidos.",
      },
      {
        label: "Visitas Full · amostra",
        value: numeric(sample?.fullVisitSharePercent)
          ? pct(sample.fullVisitSharePercent)
          : "Sem acesso",
        detail: sample
          ? "Participação nas visitas das " +
            num(sample.offersMeasured) +
            " ofertas medidas. Cobertura parcial pode não representar o catálogo inteiro."
          : "Quantidade de ofertas Full não comprova participação nas visitas.",
      },
    ];
  }
  function mount(root, controller, { connect, advanced }) {
    const $ = (tag, text, cls) => {
      const node = document.createElement(tag);
      if (text != null) node.textContent = text;
      if (cls) node.className = cls;
      return node;
    };
    const style = $("style");
    style.textContent = `
      .auto-analysis{padding-top:12px;min-width:0}.auto-verdict{padding:11px 12px;border-radius:9px;background:#f1f5f1;border:1px solid #e0e8e0}.auto-verdict.good{background:#edf7ef;border-color:#cfe5d3}.auto-verdict.bad{background:#fff0eb;border-color:#f0d4ca}.auto-verdict.warn{background:#fff8e8;border-color:#eddfb9}.auto-verdict strong{display:block;font-size:15px;letter-spacing:-.3px}.auto-verdict p{margin-top:4px;font-size:10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.auto-badge{display:inline-block;border-radius:5px;padding:3px 5px;font-size:14px;background:#edf2ee;color:#47654f}.auto-badge.good{background:#e1f1e4;color:#12603b}.auto-badge.warn{background:#fff0cf;color:#845916}.auto-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}.auto-metric{padding:8px;background:#f7f9f7;border-radius:8px;min-width:0}.auto-metric small{display:block;font-size:9px}.auto-metric strong{font-size:15px;display:block;overflow-wrap:anywhere}.auto-metric .auto-badge{font-size:14px;padding:0;background:transparent}.auto-source{font-size:9px;margin-top:7px;color:#708273;line-height:1.5}.auto-receipt{border-top:1px solid #e0e9df;margin-top:12px;padding-top:12px}.auto-receipt>small{display:block}.auto-receipt>strong{display:block;font-size:24px;letter-spacing:-.6px;margin-top:2px}.auto-types{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;margin-top:7px}.auto-types button{padding:6px;min-height:31px;font-size:10px}.auto-types button[aria-pressed=true]{background:#e5f2e8;border-color:#82b293;color:#125a39}.auto-analysis details{border-top:1px solid #e1e9e1;margin-top:10px;padding-top:8px}.auto-analysis summary{font-size:10px;color:#5d7764;cursor:pointer}.auto-breakdown{margin:8px 0 0;font-size:10px}.auto-breakdown div{display:flex;justify-content:space-between;gap:8px;padding:4px 0}.auto-breakdown dt{color:#60796a}.auto-breakdown dd{margin:0;font-variant-numeric:tabular-nums}.auto-calc{margin-top:12px;padding-top:11px;border-top:1px solid #dfe9df}.auto-calc label{display:block;font-size:10px;color:#40624d;font-weight:600;margin-bottom:5px}.auto-calc input{box-sizing:border-box;width:100%;min-width:0;min-height:35px;border:1px solid #c4d7c8;border-radius:7px;padding:7px 9px;color:#183e2b;background:white;font:13px system-ui}.auto-calc input[aria-invalid=true]{border-color:#b94832}.auto-calc .auto-grid{margin-top:9px}.auto-result{background:#eaf5ec;border:1px solid #cde1d1;border-radius:9px;padding:10px;margin-top:10px}.auto-result.bad{background:#fff0eb;border-color:#f0d4ca}.auto-result strong{display:block;font-size:22px}.auto-result small{display:block}.auto-result p{font-size:10px;margin-top:4px}.auto-helper{margin-top:8px;font-size:10px}.auto-connection button{width:100%;margin-top:8px}.auto-candidate{padding:5px 0;border-bottom:1px solid #edf1ec;font-size:10px}.auto-candidate b{display:block;margin-top:2px}.auto-calc .auto-operating{margin-top:9px}.auto-readout{font-size:10px;margin-top:9px;color:#607a68}.auto-update{display:flex;justify-content:space-between;gap:5px;margin-top:8px;align-items:center}.auto-update button{padding:3px;font-size:9px;min-height:22px;border:0;background:transparent;color:#58705c}.auto-update small{font-size:9px}.auto-update .auto-more{font-size:10px;border:0;min-height:26px;padding:3px 0;background:transparent}.auto-inputs[hidden],.auto-analysis [hidden]{display:none!important}
    `;
    const container = $("div", null, "auto-analysis"),
      verdict = $("div", null, "auto-verdict"),
      verdictTitle = $("strong"),
      reason = $("p");
    verdict.append(verdictTitle, reason);
    const overview = $("section", null, "auto-overview");
    overview.append(verdict);
    container.append(overview);
    const grid = $("div", null, "auto-grid"),
      metrics = [];
    for (const label of ["Demanda histórica", "Receita de referência"]) {
      const box = $("div", null, "auto-metric"),
        value = $("strong", "—");
      box.append($("small", label), value);
      grid.append(box);
      metrics.push(value);
    }
    const source = $("p", "", "auto-source"),
      publicLine = $("p", "", "auto-readout");
    overview.append(grid, publicLine);
    const evidence = $("details"),
      missingFacts = $("dl", null, "auto-breakdown");
    evidence.append(
      $("summary", "Detalhes de mercado e tarifas"),
      source,
      missingFacts,
    );
    const marketGrid = $("div", null, "auto-grid");
    overview.append(marketGrid);
    const payout = $("div", null, "auto-receipt"),
      payoutLabel = $("small"),
      payoutValue = $("strong"),
      types = $("div", null, "auto-types"),
      typeButtons = {};
    for (const [type, label] of [
      ["CLASSIC", "Clássico"],
      ["PREMIUM", "Premium"],
    ]) {
      const b = $("button", label);
      b.type = "button";
      b.addEventListener("click", () => controller.selectType(type));
      typeButtons[type] = b;
      types.append(b);
    }
    const quoteNote = $("p", "", "auto-source"),
      feeDetails = $("details"),
      breakdown = $("dl", null, "auto-breakdown");
    feeDetails.append($("summary", "Tarifas e origem da cotação"), breakdown);
    feeDetails.append(quoteNote);
    payout.append(payoutLabel, payoutValue, types);
    container.append(payout);
    const form = $("form", null, "auto-calc"),
      fields = {},
      fieldWraps = {};
    const makeField = (name, label, parent) => {
      const wrap = $("div"),
        id = "radar-auto-" + name;
      const text = $("label", label);
      text.htmlFor = id;
      const input = $("input");
      input.id = id;
      input.inputMode = "decimal";
      input.placeholder =
        name === "cost"
          ? "Informe seu custo para este anúncio"
          : "Confirme, inclusive zero";
      input.addEventListener("input", () => controller.edit(name, input.value));
      wrap.append(text, input);
      parent.append(wrap);
      fields[name] = input;
      fieldWraps[name] = wrap;
    };
    makeField("cost", "Seu custo do produto/kit · R$", form);
    const costSource = $("p", "", "auto-source");
    form.append(costSource);
    const missing = $("div", null, "auto-grid");
    makeField("shipping", "Seu frete por venda · R$", missing);
    makeField("tax", "Seu imposto · %", missing);
    form.append(missing);
    const advancedCosts = $("details"),
      operations = $("div", null, "auto-operating");
    advancedCosts.append($("summary", "Ajustar imposto e operação"));
    const taxEdit = $("input");
    taxEdit.inputMode = "decimal";
    taxEdit.id = "radar-auto-tax-edit";
    const taxLabel = $("label", "Imposto aplicado · %");
    taxLabel.htmlFor = taxEdit.id;
    taxEdit.addEventListener("input", () =>
      controller.edit("tax", taxEdit.value),
    );
    operations.append(taxLabel, taxEdit);
    makeField("operating", "Embalagem e operação · R$", operations);
    advancedCosts.append(operations);
    form.append(advancedCosts);
    const helper = $("p", "", "auto-helper"),
      resultBox = $("div", null, "auto-result"),
      profit = $("strong"),
      profitDetails = $("p");
    resultBox.append(
      $("small", "Lucro simulado por venda"),
      profit,
      profitDetails,
    );
    form.prepend(resultBox);
    form.append(helper);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void controller.calculate();
    });
    container.append(form);
    const marketDetails = $("details"),
      marketSummary = $("summary", "Faixa preliminar de preços"),
      range = $("p", "", "auto-helper"),
      candidateList = $("div");
    marketDetails.append(
      marketSummary,
      range,
      $(
        "p",
        "Candidatos automáticos: confira marca, quantidade, medida e condição.",
        "auto-source",
      ),
      candidateList,
    );
    evidence.append(feeDetails, marketDetails);
    container.append(evidence);
    const connection = $("div", null, "auto-connection"),
      connectButton = $("button", "Conectar minha conta");
    connectButton.type = "button";
    connectButton.addEventListener("click", connect);
    connection.append(connectButton);
    container.append(connection);
    const update = $("div", null, "auto-update"),
      status = $("small"),
      retry = $("button", "Atualizar análise ↻");
    retry.type = "button";
    retry.addEventListener("click", () => controller.refresh());
    const more = $("button", "Calculadora completa ↗");
    more.type = "button";
    more.addEventListener("click", advanced);
    more.className = "auto-more";
    evidence.append(status);
    update.append(more, retry);
    container.append(update);
    root.append(style, container);
    function syncInput(input, value) {
      if (input.getRootNode().activeElement !== input && input.value !== value)
        input.value = value;
    }
    return {
      render(s) {
        if (!s.obs) return;
        const d = demand(s.insight),
          o = decision(s.obs, s.insight, s.result),
          quote = s.quotes[s.listingType],
          received = receipt(quote, s.obs.price),
          f = quote?.fees;
        verdict.className = "auto-verdict " + o.tone;
        verdictTitle.textContent = o.title;
        reason.textContent = o.reason;
        reason.title = o.reason;
        const reading = P.assessMarket(s.obs, s.insight),
          card = cardMetrics(s.obs, s.insight);
        metrics[0].className =
          "auto-badge " +
          (reading.demand.level === "BAIXA" ? "warn" : reading.potential.tone);
        metrics[0].textContent = reading.demand.text;
        metrics[0].parentElement.querySelector("small").textContent =
          reading.demand.label + (reading.demand.lowerBound ? " · mínima" : "");
        metrics[0].title = reading.demand.basis;
        metrics[1].textContent = card.amount;
        metrics[1].parentElement.querySelector("small").textContent =
          card.label;
        metrics[1].title = card.detail;
        source.textContent =
          reading.demand.basis + " " + (reading.reference?.detail || "");
        publicLine.textContent = [
          s.obs.soldLabel ||
            (s.obs.soldLower == null
              ? null
              : (s.obs.soldHasPlus ? "+" : "") +
                num(s.obs.soldLower) +
                " vendidos"),
          s.obs.rating == null ? null : "★ " + num(s.obs.rating),
          s.obs.reviews == null ? null : num(s.obs.reviews) + " avaliações",
          s.obs.fulfillment ? "Full" : null,
        ]
          .filter(Boolean)
          .join(" · ");
        marketGrid.replaceChildren();
        missingFacts.replaceChildren();
        // Available traffic/catalog facts are useful. Missing grants belong in
        // the source disclosure, rather than four large empty tiles.
        for (const [index, fact] of marketMetrics(s).entries()) {
          const unknown = [
            "Sem acesso",
            "Sem período",
            "Não disponível",
          ].includes(fact.value);
          if (unknown) {
            const row = $("div");
            row.title = fact.detail;
            row.append($("dt", fact.label), $("dd", fact.value));
            missingFacts.append(row);
          } else if (index !== 1) {
            const box = $("div", null, "auto-metric");
            box.title = fact.detail;
            box.append($("small", fact.label), $("strong", fact.value));
            marketGrid.append(box);
          }
        }
        marketGrid.hidden = !marketGrid.childElementCount;
        payoutLabel.textContent = received?.label || "Repasse após tarifas";
        payoutValue.textContent = received
          ? brl(received.value)
          : s.status === "loading"
            ? "Consultando…"
            : "Tarifa indisponível";
        for (const [type, b] of Object.entries(typeButtons)) {
          b.setAttribute("aria-pressed", String(s.listingType === type));
          b.textContent =
            (type === "CLASSIC" ? "Clássico" : "Premium") +
            (numeric(s.quotes[type]?.fees?.commissionPercent)
              ? " · " + pct(s.quotes[type].fees.commissionPercent)
              : "");
        }
        const actualType =
          s.item?.listingTypeId === "gold_pro"
            ? "PREMIUM"
            : s.item?.listingTypeId === "gold_special"
              ? "CLASSIC"
              : null;
        quoteNote.textContent =
          (actualType
            ? "Anúncio " +
              (actualType === "PREMIUM" ? "Premium" : "Clássico") +
              " na API. " +
              (actualType === s.listingType
                ? "Cotação da mesma modalidade. "
                : "Simulando outra modalidade. ")
            : "Modalidade simulada; não confirmada para este anúncio. ") +
          (quote?.categorySource === "PREDICTED"
            ? "Categoria sugerida pelo título. "
            : "") +
          "Repasse não é lucro: faltam compra, imposto e operação.";
        breakdown.replaceChildren();
        for (const [label, value] of [
          ["Comissão", f?.commissionAmount],
          ["Tarifa fixa", f?.fixedFee],
          [
            "Frete do vendedor",
            received?.shippingApplied ? f.shippingCost : null,
          ],
        ]) {
          const row = $("div");
          row.append($("dt", label), $("dd", brl(value)));
          breakdown.append(row);
        }
        form.hidden = s.status === "connection";
        for (const [name, input] of Object.entries(fields)) {
          syncInput(input, s.fields[name]);
          const v = M.money(input.value);
          input.setAttribute(
            "aria-invalid",
            String(
              input.value !== "" &&
                (v == null ||
                  (name === "tax" && v > 50) ||
                  (name === "shipping" && v > 10000)),
            ),
          );
        }
        syncInput(taxEdit, s.fields.tax);
        costSource.textContent = s.costSource;
        fieldWraps.shipping.hidden = received?.shippingApplied === true;
        fieldWraps.tax.hidden = s.taxConfigured;
        missing.hidden =
          (fieldWraps.shipping.hidden && fieldWraps.tax.hidden) ||
          M.money(s.fields.cost) == null;
        helper.textContent = s.calculating
          ? "Calculando automaticamente…"
          : s.error ||
            (s.result
              ? "Tarifas e custos desta simulação. Não inclui Ads ou devoluções."
              : [
                  M.money(s.fields.cost) == null
                    ? "Informe o custo de compra."
                    : null,
                  !received?.shippingApplied &&
                  M.money(s.fields.shipping) == null
                    ? "Confirme seu frete."
                    : null,
                  M.money(s.fields.tax) == null
                    ? "Confirme seu imposto."
                    : null,
                ]
                  .filter(Boolean)
                  .join(" "));
        helper.hidden =
          !s.error && !s.calculating && M.money(s.fields.cost) == null;
        payout.hidden = s.status === "connection";
        resultBox.hidden = !s.result;
        resultBox.className =
          "auto-result" + (s.result?.verdict === "BAD" ? " bad" : "");
        profit.textContent = brl(s.result?.profit);
        profitDetails.textContent =
          "Margem " +
          pct(s.result?.marginPercent) +
          (numeric(s.result?.minimumSuggestedPrice)
            ? " · Preço para sua meta " + brl(s.result.minimumSuggestedPrice)
            : "");
        marketSummary.textContent = s.sample
          ? "Faixa preliminar · " +
            brl(s.sample.p25) +
            " a " +
            brl(s.sample.p75)
          : "Preços · amostra ainda insuficiente";
        range.textContent = s.sample
          ? "Mediana " +
            brl(s.sample.median) +
            " · " +
            s.sample.count +
            " candidatos. Sem frete do comprador."
          : "São necessários pelo menos três candidatos comparáveis com preço.";
        candidateList.replaceChildren();
        for (const c of s.candidates.slice(0, 6)) {
          const row = $("div", c.title, "auto-candidate");
          row.append($("b", brl(c.price)));
          candidateList.append(row);
        }
        connection.hidden = s.status !== "connection";
        connectButton.textContent = s.auth?.authenticated
          ? "Atualizar extensão e servidor"
          : "Conectar minha conta";
        status.textContent =
          s.status === "loading"
            ? "Consultas automáticas em andamento"
            : s.status === "connection"
              ? "Entre para consultar dados da sua conta"
              : "Leitura e análise automáticas";
        retry.disabled = s.status === "loading";
      },
    };
  }
  globalThis.RadarProductAnalysis = {
    marketMetrics,
    cardMetrics,
    decision,
    demand,
    opportunity,
    receipt,
    createController,
    mount,
  };
})();

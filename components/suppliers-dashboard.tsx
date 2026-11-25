"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  contactName: string | null;
  address: string | null;
  zipCode: string | null;
  paymentTerms: string | null;
  sellsToCpf: boolean | null;
  issuesInvoice: boolean | null;
  minOrderValue: number | null;
  minOrderUnits: number | null;
  leadTimeDays: number | null;
  notes: string | null;
  quoteCount?: number;
  cnpjCheck: { status: string; legalName: string | null; tradeName: string | null; checkedAt: string } | null;
};

type Product = {
  mlItemId: string;
  title: string;
  supplier: string | null;
  netUnitCost: number | null;
  availableQuantity: number;
  health: { unitsSold: number; inventoryCapital: number | null; decisionMarginPercent: number | null };
};

type CnpjCheck = {
  status: string;
  statusLabel: string | null;
  legalName: string | null;
  tradeName: string | null;
  city: string | null;
  state: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  zipCode?: string | null;
  mainActivity: string | null;
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const KINDS: Record<string, string> = {
  FABRICANTE: "Fabricante",
  DISTRIBUIDOR: "Distribuidor",
  ATACADISTA: "Atacadista",
  IMPORTADOR: "Importador",
  LOJA_ML: "Loja no Mercado Livre",
  OUTRO: "Outro",
};
const key = (name: string | null | undefined) => (name ?? "").trim().toLowerCase();
const cnpjMask = (v: string | null) => (v ?? "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "Não foi possível concluir.");
  return body as T;
}

export function SuppliersDashboard() {
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [s, p] = await Promise.all([
        api<{ suppliers: Supplier[] }>("/api/sourcing/suppliers"),
        api<{ products: Product[] }>("/api/ml/products").catch(() => ({ products: [] as Product[] })),
      ]);
      setSuppliers(s.suppliers);
      setProducts(p.products);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar fornecedores.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const byName = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of products) {
      if (!p.supplier?.trim()) continue;
      const k = key(p.supplier);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return map;
  }, [products]);

  const registered = new Set((suppliers ?? []).map((s) => key(s.name)));
  const unregistered = [...byName.entries()].filter(([k]) => !registered.has(k)).map(([, list]) => list[0].supplier!.trim());
  const withoutSupplier = products.filter((p) => !p.supplier?.trim()).length;
  const visible = (suppliers ?? []).filter((s) => {
    const q = query.trim().toLowerCase();
    return !q || [s.name, s.cnpj, s.city, s.contactName, s.cnpjCheck?.legalName].some((v) => v?.toLowerCase().includes(q));
  });

  async function remove(supplier: Supplier) {
    try {
      await api(`/api/sourcing/suppliers/${supplier.id}`, { method: "DELETE" });
      if (byName.has(key(supplier.name)))
        await api("/api/ml/products/supplier", { method: "PATCH", body: JSON.stringify({ from: byName.get(key(supplier.name))![0].supplier!.trim(), to: null }) });
      setDeleting(null);
      setNotice(`${supplier.name} excluído. O custo dos produtos continua cadastrado.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  }

  return (
    <section className="suppliers-page">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Operação</p>
          <h1>Fornecedores</h1>
          <p>Quem vende para você, como falar com cada um e quanto do seu estoque vem de cada fornecedor.</p>
        </div>
        <div className="page-header-actions">
          <button type="button" className="vr-btn" onClick={() => { setEditing({ kind: "DISTRIBUIDOR" }); setNotice(""); }}>
            Novo fornecedor
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}
      {notice && <p className="pilot-done" role="status">{notice}</p>}

      {editing && (
        <SupplierForm
          key={editing.id ?? editing.name ?? "new"}
          initial={editing}
          onCancel={() => setEditing(null)}
          onSaved={async (saved, previousName) => {
            if (previousName && key(previousName) !== key(saved.name) && byName.has(key(previousName)))
              await api("/api/ml/products/supplier", { method: "PATCH", body: JSON.stringify({ from: byName.get(key(previousName))![0].supplier!.trim(), to: saved.name }) }).catch(() => null);
            setEditing(null);
            setNotice(`${saved.name} salvo.`);
            await load();
          }}
        />
      )}

      {!!unregistered.length && (
        <div className="clean-panel supplier-unregistered">
          <strong>Nomes usados nos seus produtos ainda sem cadastro</strong>
          <div>
            {unregistered.map((name) => (
              <button key={name} type="button" className="vr-btn vr-btn--ghost vr-btn--small" onClick={() => setEditing({ name, kind: "DISTRIBUIDOR" })}>
                Cadastrar {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {!suppliers ? (
        !error && <div className="clean-loading">Carregando fornecedores...</div>
      ) : (
        <section className="clean-panel supplier-registry">
          <div className="supplier-registry-toolbar">
            <strong>{suppliers.length} fornecedor(es) cadastrado(s)</strong>
            <input type="search" placeholder="Buscar por nome, CNPJ, cidade ou contato" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar fornecedor" />
          </div>
          {!visible.length ? (
            <div className="module-empty">
              <strong>{suppliers.length ? "Nenhum fornecedor com essa busca" : "Nenhum fornecedor cadastrado"}</strong>
              <span>Cadastre pelo CNPJ: o Radar preenche razão social, endereço e contato da Receita.</span>
            </div>
          ) : (
            <ul className="supplier-list">
              {visible.map((s) => {
                const items = byName.get(key(s.name)) ?? [];
                const capital = items.reduce((sum, p) => sum + Number(p.health.inventoryCapital ?? 0), 0);
                const margins = items.map((p) => p.health.decisionMarginPercent).filter((m): m is number => m != null);
                const margin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null;
                const active = s.cnpjCheck?.status === "ATIVA";
                return (
                  <li key={s.id} className="supplier-item">
                    <div className="supplier-item-main">
                      <div className="supplier-item-title">
                        <strong>{s.name}</strong>
                        <span className="supplier-kind">{KINDS[s.kind] ?? s.kind}</span>
                        {s.cnpj && (
                          <span className={`supplier-cnpj ${s.cnpjCheck ? (active ? "is-ok" : "is-bad") : ""}`}>
                            CNPJ {cnpjMask(s.cnpj)} {s.cnpjCheck ? `· ${active ? "ativo" : s.cnpjCheck.status.toLowerCase()}` : "· não verificado"}
                          </span>
                        )}
                      </div>
                      <small>
                        {[s.cnpjCheck?.legalName && s.cnpjCheck.legalName !== s.name ? s.cnpjCheck.legalName : null, [s.city, s.state].filter(Boolean).join("/"), s.contactName]
                          .filter(Boolean).join(" · ") || "Complete o cadastro com CNPJ e contato"}
                      </small>
                      <div className="supplier-contact">
                        {s.phone && <a href={`https://wa.me/55${s.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{s.phone}</a>}
                        {s.email && <a href={`mailto:${s.email}`}>{s.email}</a>}
                        {s.website && <a href={s.website} target="_blank" rel="noreferrer">site ↗</a>}
                        {s.minOrderValue != null && <span>pedido mín. {money.format(s.minOrderValue)}</span>}
                        {s.leadTimeDays != null && <span>entrega em {s.leadTimeDays} dia(s)</span>}
                        {s.paymentTerms && <span>{s.paymentTerms}</span>}
                      </div>
                    </div>
                    <div className="supplier-item-stats">
                      <span><b>{items.length}</b> produto(s)</span>
                      <span><b>{money.format(capital)}</b> em estoque</span>
                      <span className={margin != null && margin < 15 ? "danger-value" : undefined}>
                        {margin == null ? "margem —" : `margem ${margin.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                      </span>
                    </div>
                    <div className="supplier-item-actions">
                      <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" onClick={() => { setEditing(s); setNotice(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Editar</button>
                      {!!items.length && (
                        <button type="button" className="inline-link-button" aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                          {open === s.id ? "Fechar produtos" : "Ver produtos"}
                        </button>
                      )}
                      {deleting === s.id ? (
                        <span className="supplier-confirm">
                          Excluir {s.name}{s.quoteCount ? ` e ${s.quoteCount} cotação(ões)` : ""}? Os produtos ficam sem fornecedor, o custo continua.
                          <button type="button" className="vr-btn vr-btn--small vr-btn--danger" onClick={() => void remove(s)}>Sim, excluir</button>
                          <button type="button" className="vr-btn vr-btn--ghost vr-btn--small" onClick={() => setDeleting(null)}>Voltar</button>
                        </span>
                      ) : (
                        <button type="button" className="vr-link" onClick={() => setDeleting(s.id)}>Excluir</button>
                      )}
                    </div>
                    {open === s.id && (
                      <ul className="supplier-products">
                        {items.map((item) => (
                          <li key={item.mlItemId}>
                            <span>
                              <strong title={item.title}>{item.title}</strong>
                              <small>{item.mlItemId} · estoque {item.availableQuantity} · vendeu {item.health.unitsSold} em 30 dias</small>
                            </span>
                            <span className="num">{item.netUnitCost == null ? "sem custo" : `${money.format(item.netUnitCost)}/un.`}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {withoutSupplier > 0 && (
            <p className="supplier-hint">
              {withoutSupplier} produto(s) sem fornecedor. Vincule em <a href="/produtos">Produtos</a>, no editor de custo.
            </p>
          )}
        </section>
      )}
    </section>
  );
}

function SupplierForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Partial<Supplier>;
  onCancel: () => void;
  onSaved: (saved: Supplier, previousName: string | null) => Promise<void>;
}) {
  const [form, setForm] = useState<Partial<Supplier>>(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [check, setCheck] = useState<CnpjCheck | null>(null);
  const set = (k: keyof Supplier) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const text = (v: unknown) => (typeof v === "string" ? v.trim() || null : v == null ? null : String(v));
  const numOrNull = (v: unknown) => {
    const raw = text(v);
    if (raw == null) return null;
    const n = Number(raw.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const tri = (v: boolean | null | undefined) => (v === true ? "sim" : v === false ? "nao" : "");

  async function fillFromCnpj() {
    setBusy("cnpj");
    setError("");
    try {
      const r = await api<{ check: CnpjCheck }>(`/api/sourcing/cnpj?cnpj=${encodeURIComponent(form.cnpj ?? "")}`);
      const c = r.check;
      setCheck(c);
      // Só preenche o que está vazio: o que você digitou vale mais.
      setForm((f) => ({
        ...f,
        name: f.name?.trim() ? f.name : c.tradeName || c.legalName || f.name,
        phone: f.phone || c.phone || null,
        email: f.email || c.email || null,
        address: f.address || c.address || null,
        zipCode: f.zipCode || c.zipCode || null,
        city: f.city || c.city || null,
        state: f.state || c.state || null,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Consulta indisponível.");
    } finally {
      setBusy("");
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError("");
    const payload = {
      name: text(form.name),
      kind: form.kind ?? "OUTRO",
      cnpj: text(form.cnpj),
      contactName: text(form.contactName),
      phone: text(form.phone),
      email: text(form.email),
      website: text(form.website),
      address: text(form.address),
      zipCode: text(form.zipCode),
      city: text(form.city),
      state: text(form.state)?.toUpperCase() ?? null,
      minOrderValue: numOrNull(form.minOrderValue),
      minOrderUnits: numOrNull(form.minOrderUnits),
      leadTimeDays: numOrNull(form.leadTimeDays),
      paymentTerms: text(form.paymentTerms),
      issuesInvoice: form.issuesInvoice ?? null,
      sellsToCpf: form.sellsToCpf ?? null,
      notes: text(form.notes),
    };
    try {
      const r = form.id
        ? await api<{ supplier: Supplier }>(`/api/sourcing/suppliers/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await api<{ supplier: Supplier }>("/api/sourcing/suppliers", { method: "POST", body: JSON.stringify(payload) });
      // Guarda a situação na Receita junto do cadastro.
      if (r.supplier.cnpj) await api(`/api/sourcing/suppliers/${r.supplier.id}/cnpj`, { method: "POST" }).catch(() => null);
      await onSaved(r.supplier, initial.id ? initial.name ?? null : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy("");
    }
  }

  const triSelect = (k: "issuesInvoice" | "sellsToCpf", label: string) => (
    <label>
      <span>{label}</span>
      <select value={tri(form[k])} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value === "sim" ? true : e.target.value === "nao" ? false : null }))}>
        <option value="">Não sei</option>
        <option value="sim">Sim</option>
        <option value="nao">Não</option>
      </select>
    </label>
  );

  return (
    <form className="clean-panel supplier-form" onSubmit={save}>
      <header>
        <h2>{form.id ? `Editar ${initial.name}` : "Novo fornecedor"}</h2>
        <p>Comece pelo CNPJ: o Radar busca na Receita e preenche o que estiver vazio.</p>
      </header>

      <div className="supplier-form-cnpj">
        <label>
          <span>CNPJ</span>
          <input value={form.cnpj ?? ""} onChange={set("cnpj")} inputMode="numeric" placeholder="00.000.000/0000-00" />
        </label>
        <button type="button" className="vr-btn vr-btn--ghost" disabled={busy !== "" || (form.cnpj ?? "").replace(/\D/g, "").length !== 14} onClick={() => void fillFromCnpj()}>
          {busy === "cnpj" ? "Buscando..." : "Buscar dados do CNPJ"}
        </button>
        {check && (
          <p className={`supplier-check ${check.status === "ATIVA" ? "is-ok" : "is-bad"}`}>
            {check.legalName ?? "Razão social não informada"} · situação {check.statusLabel ?? check.status}
            {check.mainActivity ? ` · ${check.mainActivity}` : ""}
          </p>
        )}
      </div>

      <fieldset>
        <legend>Identificação e contato</legend>
        <div className="supplier-form-grid">
          <label className="span-2"><span>Nome *</span><input required value={form.name ?? ""} onChange={set("name")} maxLength={160} /></label>
          <label><span>Tipo</span>
            <select value={form.kind ?? "OUTRO"} onChange={set("kind")}>
              {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label><span>Pessoa de contato</span><input value={form.contactName ?? ""} onChange={set("contactName")} maxLength={120} /></label>
          <label><span>Telefone / WhatsApp</span><input value={form.phone ?? ""} onChange={set("phone")} inputMode="tel" maxLength={40} /></label>
          <label><span>E-mail</span><input type="email" value={form.email ?? ""} onChange={set("email")} maxLength={160} /></label>
          <label className="span-2"><span>Site</span><input type="url" value={form.website ?? ""} onChange={set("website")} placeholder="https://" /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Endereço</legend>
        <div className="supplier-form-grid">
          <label className="span-2"><span>Endereço</span><input value={form.address ?? ""} onChange={set("address")} maxLength={300} /></label>
          <label><span>CEP</span><input value={form.zipCode ?? ""} onChange={set("zipCode")} maxLength={10} /></label>
          <label><span>Cidade</span><input value={form.city ?? ""} onChange={set("city")} maxLength={80} /></label>
          <label><span>UF</span><input value={form.state ?? ""} onChange={set("state")} maxLength={2} /></label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Condições de compra</legend>
        <div className="supplier-form-grid">
          <label><span>Pedido mínimo (R$)</span><input inputMode="decimal" value={form.minOrderValue ?? ""} onChange={set("minOrderValue")} /></label>
          <label><span>Pedido mínimo (unidades)</span><input inputMode="numeric" value={form.minOrderUnits ?? ""} onChange={set("minOrderUnits")} /></label>
          <label><span>Prazo de entrega (dias)</span><input inputMode="numeric" value={form.leadTimeDays ?? ""} onChange={set("leadTimeDays")} /></label>
          <label><span>Pagamento</span><input value={form.paymentTerms ?? ""} onChange={set("paymentTerms")} placeholder="Ex.: boleto 28 dias, Pix à vista" maxLength={200} /></label>
          {triSelect("issuesInvoice", "Emite nota fiscal?")}
          {triSelect("sellsToCpf", "Vende para CPF?")}
          <label className="span-3"><span>Observações</span><textarea rows={2} value={form.notes ?? ""} onChange={set("notes")} maxLength={4000} /></label>
        </div>
      </fieldset>

      {error && <p className="pilot-exec-error" role="alert">{error}</p>}
      <div className="supplier-form-actions">
        <button type="submit" className="vr-btn" disabled={busy !== ""}>{busy === "save" ? "Salvando..." : "Salvar fornecedor"}</button>
        <button type="button" className="vr-btn vr-btn--ghost" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

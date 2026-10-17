"use client";
import { FormEvent, useEffect, useState } from "react";

type Form = {
  name: string;
  taxPercent: string;
  operatingCostDefault: string;
  defaultDiscountPercent: string;
  targetMarginPercent: string;
  targetRoiPercent: string;
  leadTimeDays: string;
  safetyStockDays: string;
  stockCoverageDays: string;
};
type Account = {
  user: { email: string; isOperator: boolean };
  workspace: { plan: string; dailyRequestLimit: number; requestsToday: number };
};
type Client = {
  id: string;
  email: string;
  active: boolean;
  workspace: { name: string; plan: string; dailyRequestLimit: number };
};
const fields: Array<{
  key: Exclude<keyof Form, "name">;
  label: string;
  help: string;
  max: number;
  min: number;
  step: string;
}> = [
  {
    key: "taxPercent",
    label: "Imposto sobre a venda (%)",
    help: "Informe sua alíquota efetiva. Confirme 0 explicitamente quando aplicável.",
    min: 0,
    max: 50,
    step: "0.01",
  },
  {
    key: "operatingCostDefault",
    label: "Embalagem e operação por pedido (R$)",
    help: "Valor total de embalagem e outros custos operacionais por pedido.",
    min: 0,
    max: 10000,
    step: "0.01",
  },
  {
    key: "defaultDiscountPercent",
    label: "Desconto padrão do fornecedor (%)",
    help: "Usado como ponto de partida para novas análises.",
    min: 0,
    max: 95,
    step: "0.01",
  },
  {
    key: "targetMarginPercent",
    label: "Meta de margem (%)",
    help: "Lucro dividido pelo preço de venda. Abaixo de 10% exige revisão.",
    min: 10,
    max: 80,
    step: "0.1",
  },
  {
    key: "targetRoiPercent",
    label: "Meta de retorno sobre o investimento (%)",
    help: "Lucro dividido pelo custo de compra + operação.",
    min: 0,
    max: 500,
    step: "1",
  },
  {
    key: "leadTimeDays",
    label: "Prazo do fornecedor (dias)",
    help: "Tempo entre comprar e o estoque ficar disponível para vender.",
    min: 0,
    max: 180,
    step: "1",
  },
  {
    key: "safetyStockDays",
    label: "Segurança de estoque (dias)",
    help: "Cobertura extra para atrasos e oscilações na saída.",
    min: 0,
    max: 180,
    step: "1",
  },
  {
    key: "stockCoverageDays",
    label: "Cobertura desejada (dias)",
    help: "Tamanho do lote sugerido pela saída observada. Nunca menor que prazo + segurança.",
    min: 1,
    max: 365,
    step: "1",
  },
];
async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error ?? "Não foi possível concluir. Tente novamente.",
    );
  return body;
}
export function WorkspaceSettings() {
  const [form, setForm] = useState<Form | null>(null),
    [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<Client[]>([]),
    [creating, setCreating] = useState(false),
    [clientBusy, setClientBusy] = useState("");
  const [clientForm, setClientForm] = useState({
    name: "",
    email: "",
    password: "",
    dailyRequestLimit: "500",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    password: "",
  });
  async function loadClients() {
    const body = await api("/api/workspace/clients");
    setClients(body.clients);
  }
  useEffect(() => {
    let active = true;
    api("/api/workspace")
      .then((body) => {
        if (!active) return;
        setAccount(body);
        const next: Record<string, string> = { name: body.workspace.name };
        for (const field of fields)
          next[field.key] =
            body.settings[field.key] == null
              ? ""
              : String(body.settings[field.key]);
        setForm(next as Form);
        if (body.user.isOperator)
          void loadClients().catch((e) => setError(e.message));
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form || saving) return;
    setSaving(true);
    setNotice("");
    setError("");
    try {
      const values: Record<string, string | number> = { name: form.name };
      for (const f of fields) values[f.key] = Number(form[f.key]);
      await api("/api/workspace", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(values),
      });
      setNotice(
        "Configuração salva. Atualize as vendas para apurar os pedidos pendentes. Custos de vendas já apuradas preservam seu histórico.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function addClient(e: FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setError("");
    setNotice("");
    try {
      await api("/api/workspace/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...clientForm,
          dailyRequestLimit: Number(clientForm.dailyRequestLimit),
        }),
      });
      setNotice(
        `Acesso criado para ${clientForm.email}. O cliente já pode entrar com a senha definida.`,
      );
      setClientForm({
        name: "",
        email: "",
        password: "",
        dailyRequestLimit: "500",
      });
      await loadClients();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  }
  async function toggle(client: Client) {
    setClientBusy(client.id);
    setError("");
    setNotice("");
    try {
      await api("/api/workspace/clients", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: client.id, active: !client.active }),
      });
      await loadClients();
      setNotice(
        client.active
          ? "Acesso suspenso e sessões revogadas."
          : "Acesso reativado. O cliente pode entrar novamente.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setClientBusy("");
    }
  }
  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(passwordForm),
      });
      window.location.assign("/login");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }
  return (
    <section className="workspace-settings">
      <header className="page-header clean-page-header">
        <div>
          <p className="page-kicker">Sua operação</p>
          <h1>Metas, custos e acesso</h1>
          <p>
            Uma base financeira consistente para todas as decisões do Radar.
          </p>
        </div>
        <a className="clean-secondary" href="/">
          Voltar ao radar
        </a>
      </header>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="settings-success" role="status">
          {notice}
        </div>
      )}
      {!form && !error && <p role="status">Carregando sua configuração…</p>}
      {form && (
        <div className="settings-layout">
          <form className="clean-panel settings-form" onSubmit={save}>
            <div className="clean-panel-head">
              <div>
                <span>Perfil financeiro</span>
                <strong>Quanto precisa sobrar em cada venda?</strong>
              </div>
            </div>
            <label className="settings-field settings-wide">
              <span>Nome da operação</span>
              <input
                required
                maxLength={100}
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <div className="settings-fields">
              {fields.map((field) => (
                <label className="settings-field" key={field.key}>
                  <span>{field.label}</span>
                  <input
                    type="number"
                    required
                    min={field.min}
                    max={field.max}
                    step={field.step}
                    value={form[field.key]}
                    onChange={(e) =>
                      setForm({ ...form, [field.key]: e.target.value })
                    }
                  />
                  <small>{field.help}</small>
                </label>
              ))}
            </div>
            <button className="clean-primary" type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar configuração"}
            </button>
          </form>
          <aside className="settings-aside">
            <section className="clean-panel">
              <p className="page-kicker">Acesso individual</p>
              <h2>Sua conta no Radar</h2>
              <p className="settings-email">{account?.user.email}</p>
              <span className="table-status good">
                {account?.workspace.plan === "PILOT"
                  ? "Piloto"
                  : account?.workspace.plan}
              </span>
              <dl className="settings-facts">
                <div>
                  <dt>Uso da extensão hoje</dt>
                  <dd>
                    {account?.workspace.requestsToday ?? 0} /{" "}
                    {account?.workspace.dailyRequestLimit ?? 0}
                  </dd>
                </div>
                <div>
                  <dt>Renovação do limite</dt>
                  <dd>0h UTC · 21h de Brasília</dd>
                </div>
              </dl>
              <p className="settings-muted">
                O limite é compartilhado entre os dispositivos da sua operação.
              </p>
            </section>
            <section className="clean-panel settings-help">
              <h3>Como o Radar decide</h3>
              <p>
                <strong>Compensa:</strong> alcança suas metas de margem e ROI.
              </p>
              <p>
                <strong>Apertado:</strong> margem de pelo menos 10%, com uma
                meta ainda pendente.
              </p>
              <p>
                <strong>Revisar:</strong> margem abaixo de 10% ou prejuízo.
              </p>
              <p>
                Reposição usa vendas pagas, prazo do fornecedor e segurança.
                Histórico incompleto bloqueia a sugestão de compra.
              </p>
            </section>
            {!account?.user.isOperator && (
              <form
                className="clean-panel settings-form"
                onSubmit={changePassword}
              >
                <h3>Alterar senha</h3>
                <label className="settings-field">
                  <span>Senha atual</span>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        currentPassword: e.target.value,
                      })
                    }
                  />
                </label>
                <label className="settings-field">
                  <span>Nova senha · mínimo 12 caracteres</span>
                  <input
                    type="password"
                    required
                    minLength={12}
                    maxLength={200}
                    autoComplete="new-password"
                    value={passwordForm.password}
                    onChange={(e) =>
                      setPasswordForm({
                        ...passwordForm,
                        password: e.target.value,
                      })
                    }
                  />
                </label>
                <button className="clean-secondary" disabled={saving}>
                  Alterar e entrar novamente
                </button>
              </form>
            )}
          </aside>
        </div>
      )}
      {account?.user.isOperator && (
        <section className="clean-panel">
          <div className="clean-panel-head">
            <div>
              <span>Clientes do piloto</span>
              <strong>Acessos individuais com dados separados</strong>
            </div>
          </div>
          <form className="settings-client-form" onSubmit={addClient}>
            <label className="settings-field">
              <span>Nome da operação</span>
              <input
                required
                minLength={2}
                maxLength={100}
                value={clientForm.name}
                onChange={(e) =>
                  setClientForm({ ...clientForm, name: e.target.value })
                }
              />
            </label>
            <label className="settings-field">
              <span>E-mail do cliente</span>
              <input
                required
                type="email"
                maxLength={200}
                autoComplete="off"
                value={clientForm.email}
                onChange={(e) =>
                  setClientForm({ ...clientForm, email: e.target.value })
                }
              />
            </label>
            <label className="settings-field">
              <span>Senha inicial</span>
              <input
                required
                type="password"
                minLength={12}
                maxLength={200}
                autoComplete="new-password"
                value={clientForm.password}
                onChange={(e) =>
                  setClientForm({ ...clientForm, password: e.target.value })
                }
              />
            </label>
            <label className="settings-field">
              <span>Consultas da extensão/dia</span>
              <input
                required
                type="number"
                min={50}
                max={50000}
                step={1}
                value={clientForm.dailyRequestLimit}
                onChange={(e) =>
                  setClientForm({
                    ...clientForm,
                    dailyRequestLimit: e.target.value,
                  })
                }
              />
            </label>
            <button className="clean-primary" disabled={creating}>
              {creating ? "Criando…" : "Criar acesso"}
            </button>
          </form>
          <div className="clean-table-wrap">
            <table className="clean-table">
              <thead>
                <tr>
                  <th>Operação</th>
                  <th>E-mail</th>
                  <th>Limite/dia</th>
                  <th>Acesso</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>{client.workspace.name}</td>
                    <td>{client.email}</td>
                    <td>{client.workspace.dailyRequestLimit}</td>
                    <td>{client.active ? "Ativo" : "Suspenso"}</td>
                    <td>
                      <button
                        className="clean-secondary"
                        disabled={clientBusy === client.id}
                        onClick={() => void toggle(client)}
                      >
                        {clientBusy === client.id
                          ? "Salvando…"
                          : client.active
                            ? "Suspender acesso"
                            : "Reativar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!clients.length && (
            <p className="settings-muted">
              Nenhum cliente criado ainda. Cada acesso recebe uma operação
              independente.
            </p>
          )}
        </section>
      )}
    </section>
  );
}

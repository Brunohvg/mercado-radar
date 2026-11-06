"use client";

import { useState } from "react";

type ChromeRuntime = {
  sendMessage: (id: string, message: unknown, callback: (value?: { ok?: boolean; error?: string }) => void) => void;
  lastError?: { message?: string };
};
export default function ConnectExtensionPage() {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [success, setSuccess] = useState(false);

  async function connect() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const p = new URLSearchParams(window.location.search);
      const extensionId = p.get("extension_id") ?? "";
      const redirectUri = p.get("redirect_uri") ?? "";
      const codeChallenge = p.get("code_challenge") ?? "";
      const state = p.get("state") ?? "";
      const deviceId = p.get("device_id") ?? "";
      if (!/^[a-p]{32}$/.test(extensionId)) throw new Error("Identificador da extensão inválido.");
      const chromeApi = (window as Window & { chrome?: { runtime?: ChromeRuntime } }).chrome?.runtime;
      if (!chromeApi?.sendMessage) {
        throw new Error("A extensão não foi encontrada neste navegador. Instale-a pelo Radar e tente novamente.");
      }
      const response = await fetch("/api/extension/auth/browser-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extensionId, redirectUri, codeChallenge, state, deviceId }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.code) throw new Error(payload.error || "Falha ao autorizar a extensão.");
      const result = await new Promise<{ ok?: boolean; error?: string }>((resolve, reject) => {
        chromeApi.sendMessage(extensionId, {
          type: "RADAR_BROWSER_LINK",
          code: payload.code,
          state,
          redirectUri,
        }, answer => {
          if (chromeApi.lastError) return reject(new Error(chromeApi.lastError.message || "A extensão não respondeu."));
          resolve(answer ?? { ok: false, error: "A extensão não respondeu." });
        });
      });
      if (!result.ok) throw new Error(result.error || "Não foi possível concluir a vinculação.");
      setSuccess(true);
      setNotice("Extensão vinculada! Volte ao Mercado Livre e abra o Radar. Esta autorização fica salva neste navegador.");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Falha ao conectar a extensão.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="rd-auth" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <section className="rd-auth__card" style={{ width: "min(540px, 94vw)" }}>
        <div className="rd-auth__brand">
          <img src="/brand/mark.svg" alt="" aria-hidden="true" />
          <div><strong>Mercado Radar</strong><small>Vincular extensão ao navegador</small></div>
        </div>
        <h1>Conectar extensão</h1>
        <p>A extensão vai usar a conta Radar que já está aberta neste navegador. Nenhuma senha ou chave do Mercado Livre será enviada à extensão.</p>
        <button className="rd-btn rd-btn--block" type="button" onClick={connect} disabled={busy || success}>
          {busy ? "Vinculando…" : success ? "Conectado" : "Autorizar extensão neste navegador"}
        </button>
        {notice && <p role="status" style={{ marginTop: 16 }}>{notice}</p>}
        <p style={{ marginTop: 16, fontSize: 13 }}>Se sua sessão Radar estiver encerrada, <a href="/login">entre no painel</a> e volte a esta aba para autorizar.</p>
      </section>
    </main>
  );
}

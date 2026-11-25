/**
 * Leitura de texto de uma página pública para conferir contatos.
 * Proteções contra SSRF: só https na porta padrão, sem IP literal, sem
 * hosts internos, DNS precisa resolver só para endereços públicos, sem
 * seguir redirecionamento, tempo e tamanho limitados.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const a = address.toLowerCase();
    if (a === "::1" || a === "::" || a.startsWith("fc") || a.startsWith("fd") || a.startsWith("fe80")) return true;
    const mapped = /::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const [a, b] = address.split(".").map(Number);
  return (
    a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
  );
}

export function isAllowedPublicUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (isIP(host) || host === "localhost" || /\.(local|internal|lan|home|corp)$/.test(host) || !host.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

export async function fetchPublicPageText(raw: string, maxBytes = 1_000_000): Promise<string | null> {
  if (!isAllowedPublicUrl(raw)) return null;
  const url = new URL(raw);
  try {
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) return null;
    const response = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
      headers: { "user-agent": "VidalysRadar/2.0 (verificacao de contato de fornecedor)", accept: "text/html" },
    });
    if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html") || !response.body) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    const html = Buffer.concat(chunks).toString("utf8");
    return html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ");
  } catch {
    return null;
  }
}

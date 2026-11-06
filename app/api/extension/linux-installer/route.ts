import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Same extension assets as the Windows installer. No ML credentials are bundled.
const FILES = [
  "manifest.json", "background.js", "selectors.js", "content.js",
  "ui/tokens.css", "ui/sidepanel.css", "sidepanel.html", "sidepanel.js",
  "panel-model.js", "market-model.js", "product-analysis.js",
  "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "icons/icon128.png",
] as const;

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!origin.startsWith("https://") && !local) {
      return NextResponse.json({ error: "Instalação exige HTTPS ou localhost." }, { status: 400 });
    }

    const production = origin === "https://radar.optarys.com.br";
    const folder = production ? "ExtensionDev" : "ExtensionBeta";
    const base = path.join(process.cwd(), "extension");
    const entries = await Promise.all(FILES.map(async (name) => {
      const source = await readFile(path.join(base, name));
      let bytes = source;
      if (!production && name === "manifest.json") {
        const manifest = JSON.parse(source.toString("utf8")) as { host_permissions?: string[] };
        manifest.host_permissions = (manifest.host_permissions || []).map(host =>
          host === "https://radar.optarys.com.br/*" ? origin + "/*" : host
        );
        bytes = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
      } else if (!production && ["background.js", "sidepanel.js", "content.js", "sidepanel.html"].includes(name)) {
        bytes = Buffer.from(source.toString("utf8").replaceAll("https://radar.optarys.com.br", origin));
      }
      return { name, base64: bytes.toString("base64") };
    }));

    // Files are embedded in a self-contained installer. No curl|bash, sudo, or
    // privileged writes. Chromium still requires the user's confirmation.
    const lines = [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "",
      'if ! command -v base64 >/dev/null 2>&1; then echo "Instale o utilitário base64 (coreutils)." >&2; exit 1; fi',
      'install_root="${XDG_DATA_HOME:-$HOME/.local/share}/MercadoRadar"',
      'install_dir="$install_root/' + folder + '"',
      'mkdir -p "$install_dir"',
      "",
    ];
    for (const entry of entries) {
      // Whitelisted source paths; no user-controlled shell variables in filenames.
      const dir = entry.name.includes("/") ? entry.name.slice(0, entry.name.lastIndexOf("/")) : "";
      if (dir) lines.push('mkdir -p "$install_dir/' + dir + '"');
      lines.push("base64 --decode > \"$install_dir/" + entry.name + "\" <<'RADAR_EMBEDDED_FILE'");
      lines.push(entry.base64);
      lines.push("RADAR_EMBEDDED_FILE");
    }
    lines.push(
      "",
      'printf "\\nExtensão Mercado Radar preparada em:\\n%s\\n\\n" "$install_dir"',
      'printf "Chrome/Chromium: abra chrome://extensions, habilite o modo desenvolvedor e escolha Carregar sem compactação.\\n"',
      'printf "Selecione a pasta exibida acima. Recarregue as abas do Mercado Livre após instalar.\\n\\n"',
      'if command -v xdg-open >/dev/null 2>&1; then xdg-open "$install_dir" >/dev/null 2>&1 || true; fi',
      'if command -v google-chrome >/dev/null 2>&1; then google-chrome "chrome://extensions/" >/dev/null 2>&1 || true;',
      'elif command -v chromium >/dev/null 2>&1; then chromium "chrome://extensions/" >/dev/null 2>&1 || true; fi',
      "",
    );

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "application/x-sh; charset=utf-8",
        "Content-Disposition": 'attachment; filename="MercadoRadar-Instalar-Linux.sh"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[extension/linux-installer] failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Não foi possível preparar o instalador Linux." }, { status: 500 });
  }
}

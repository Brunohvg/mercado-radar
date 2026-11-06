import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EXTENSION_FILES = [
  "manifest.json",
  "background.js",
  "selectors.js",
  "content.js",
  "ui/tokens.css",
  "ui/sidepanel.css",
  "sidepanel.html",
  "sidepanel.js",
  "panel-model.js",
  "market-model.js",
  "product-analysis.js",
  "icons/icon16.png",
  "icons/icon32.png",
  "icons/icon48.png",
  "icons/icon128.png",
] as const;

function psString(value: string) {
  return "'" + value.replaceAll("'", "''") + "'";
}

export async function GET(request: Request) {
  try {
    const origin = new URL(request.url).origin;
    const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (!origin.startsWith("https://") && !isLocal) {
      return NextResponse.json(
        { error: "A instalação exige HTTPS ou localhost." },
        { status: 400 },
      );
    }
    const isProduction = origin === "https://radar.optarys.com.br";
    const destination = isProduction ? "ExtensionDev" : "ExtensionBeta";
    const installDirLine = '$installDir = Join-Path $env:LOCALAPPDATA "MercadoRadar\\' + destination + '"';
    const root = path.join(process.cwd(), "extension");

    // Bind beta files only to the Coolify deployment they came from.
    // No production seller token or session is carried into homologation.
    const files = await Promise.all(
      EXTENSION_FILES.map(async (name) => {
        const original = await readFile(path.join(root, name));
        let data = original;
        if (!isProduction && name === "manifest.json") {
          const manifest = JSON.parse(original.toString("utf8")) as {
            host_permissions: string[];
          };
          manifest.host_permissions = manifest.host_permissions.map((host) =>
            host === "https://radar.optarys.com.br/*" ? origin + "/*" : host,
          );
          data = Buffer.from(JSON.stringify(manifest, null, 2) + "\n");
        } else if (
          !isProduction &&
          ["background.js", "sidepanel.js", "content.js", "sidepanel.html"].includes(name)
        ) {
          data = Buffer.from(
            original.toString("utf8").replaceAll("https://radar.optarys.com.br", origin),
          );
        }
        return { name, data: data.toString("base64") };
      }),
    );

    const entries = files
      .map(({ name, data }) => "  " + psString(name) + " = " + psString(data))
      .join("\r\n");

    const script = [
      '$ErrorActionPreference = "Stop"',
      "",
      installDirLine,
      "New-Item -ItemType Directory -Force -Path $installDir | Out-Null",
      "",
      "$files = @{",
      entries,
      "}",
      "",
      "foreach ($entry in $files.GetEnumerator()) {",
      "  $target = Join-Path $installDir $entry.Key",
      "  $parent = Split-Path $target -Parent",
      "  New-Item -ItemType Directory -Force -Path $parent | Out-Null",
      "  [IO.File]::WriteAllBytes($target, [Convert]::FromBase64String($entry.Value))",
      "}",
      "",
      'Write-Host ""',
      'Write-Host "Mercado Radar preparado em:" -ForegroundColor Green',
      "Write-Host $installDir -ForegroundColor Cyan",
      'Write-Host ""',
      "",
      "Start-Process explorer.exe -ArgumentList $installDir",
      "",
      "$chromeCandidates = @(",
      '  "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",',
      '  "${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe",',
      '  "$env:LOCALAPPDATA\\Google\\Chrome\\Application\\chrome.exe"',
      ")",
      "",
      "$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1",
      "if ($chrome) {",
      '  Start-Process $chrome "chrome://extensions/"',
      "}",
      "",
      "Add-Type -AssemblyName PresentationFramework",
      "$nl = [Environment]::NewLine",
      '$message = "Arquivos instalados em:" + $nl + $installDir + $nl + $nl + "Agora no Chrome:" + $nl + "1. Ative Modo do desenvolvedor." + $nl + "2. Clique em Carregar sem compactacao." + $nl + "3. Selecione a pasta ExtensionDev que acabou de abrir." + $nl + $nl + "O Chrome exige estes cliques por seguranca enquanto a extensao nao estiver publicada na Chrome Web Store."',
      '[System.Windows.MessageBox]::Show($message, "Mercado Radar - Instalacao") | Out-Null',
      "",
    ].join("\r\n");

    return new NextResponse(script, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="MercadoRadar-Instalar.ps1"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Falha ao preparar instalador da extensão.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

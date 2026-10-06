import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const EXTENSION_FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "content.css",
  "sidepanel.html",
  "sidepanel.js",
] as const;

function psString(value: string) {
  return "'" + value.replaceAll("'", "''") + "'";
}

export async function GET() {
  try {
    const root = path.join(process.cwd(), "extension");
    const files = await Promise.all(
      EXTENSION_FILES.map(async (name) => ({
        name,
        data: (await readFile(path.join(root, name))).toString("base64"),
      })),
    );

    const entries = files
      .map(
        ({ name, data }) =>
          "  " + psString(name) + " = " + psString(data),
      )
      .join("\r\n");

    const script = [
      '$ErrorActionPreference = "Stop"',
      "",
      '$installDir = Join-Path $env:LOCALAPPDATA "MercadoRadar\\ExtensionDev"',
      'New-Item -ItemType Directory -Force -Path $installDir | Out-Null',
      "",
      "$files = @{",
      entries,
      "}",
      "",
      "foreach ($entry in $files.GetEnumerator()) {",
      "  $target = Join-Path $installDir $entry.Key",
      "  [IO.File]::WriteAllBytes($target, [Convert]::FromBase64String($entry.Value))",
      "}",
      "",
      'Write-Host ""',
      'Write-Host "Mercado Radar preparado em:" -ForegroundColor Green',
      'Write-Host $installDir -ForegroundColor Cyan',
      'Write-Host ""',
      "",
      'Start-Process explorer.exe -ArgumentList $installDir',
      "",
      '$chromeCandidates = @(',
      '  "$env:ProgramFiles\\Google\\Chrome\\Application\\chrome.exe",',
      '  "${env:ProgramFiles(x86)}\\Google\\Chrome\\Application\\chrome.exe",',
      '  "$env:LOCALAPPDATA\\Google\\Chrome\\Application\\chrome.exe"',
      ")",
      "",
      '$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1',
      'if ($chrome) {',
      '  Start-Process $chrome "chrome://extensions/"',
      '}',
      "",
      "Add-Type -AssemblyName PresentationFramework",
      '$nl = [Environment]::NewLine',
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

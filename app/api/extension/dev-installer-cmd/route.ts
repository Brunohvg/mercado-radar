import { NextResponse } from "next/server";
import { getInstallerOrigin } from "@/lib/public-url";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Each Coolify deployment must download its own extension version.
  // The old static URL silently installed production files during homologation.
  const origin = getInstallerOrigin(request);
  if (!origin) {
    return NextResponse.json(
      { error: "Configure NEXT_PUBLIC_APP_URL com o endereço público HTTPS do Radar." },
      { status: 400 },
    );
  }
  const script = [
    "@echo off",
    "setlocal",
    "title Vidalys Radar - Instalador",
    "echo.",
    "echo Preparando Vidalys Radar...",
    "echo.",
    'set "RADAR_INSTALL_URL=' + origin + '/api/extension/dev-installer"',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference = \'Stop\'; $ps1 = Join-Path $env:TEMP (\'VidalysRadar-\' + [Guid]::NewGuid().ToString(\'N\') + \'.ps1\'); try { Invoke-WebRequest -UseBasicParsing -Uri $env:RADAR_INSTALL_URL -OutFile $ps1; if (-not (Test-Path -LiteralPath $ps1)) { throw \'Download nao concluido\' }; & $ps1 } catch { Write-Host $_.Exception.Message -ForegroundColor Red; exit 1 } finally { Remove-Item -LiteralPath $ps1 -Force -ErrorAction SilentlyContinue }"',
    "if errorlevel 1 (",
    "  echo.",
    "  echo Nao foi possivel preparar a extensao.",
    "  echo Verifique sua conexao e tente novamente.",
    "  pause",
    "  exit /b 1",
    ")",
    "endlocal",
    "",
  ].join("\r\n");

  return new NextResponse(script, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition":
        'attachment; filename="MercadoRadar-Instalar.cmd"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

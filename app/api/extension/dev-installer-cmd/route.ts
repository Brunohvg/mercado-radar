import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Each Coolify deployment must download its own extension version.
  // The old static URL silently installed production files during homologation.
  const origin = new URL(request.url).origin;
  const isLocal = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!origin.startsWith("https://") && !isLocal) {
    return NextResponse.json(
      { error: "A instalação exige HTTPS ou localhost." },
      { status: 400 },
    );
  }
  const script = [
    "@echo off",
    "setlocal",
    "title Mercado Radar - Instalador",
    "echo.",
    "echo Preparando Mercado Radar...",
    "echo.",
    'set "URL=' + origin + '/api/extension/dev-installer"',
    'set "PS1=%TEMP%\\MercadoRadar-Instalar.ps1"',
    'powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing \\"%URL%\\" -OutFile \\"%PS1%\\"; & \\"%PS1%\\""',
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
    },
  });
}

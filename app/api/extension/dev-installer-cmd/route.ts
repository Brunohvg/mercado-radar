import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const script = "@echo off\r\nsetlocal\r\ntitle Mercado Radar - Instalador\r\necho.\r\necho Preparando Mercado Radar...\r\necho.\r\nset \"URL=https://radar.optarys.com.br/api/extension/dev-installer\"\r\nset \"PS1=%TEMP%\\MercadoRadar-Instalar.ps1\"\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command \"Invoke-WebRequest -UseBasicParsing \\\"%URL%\\\" -OutFile \\\"%PS1%\\\"; & \\\"%PS1%\\\"\"\r\nif errorlevel 1 (\r\n  echo.\r\n  echo Nao foi possivel preparar a extensao.\r\n  echo Verifique sua conexao e tente novamente.\r\n  pause\r\n  exit /b 1\r\n)\r\nendlocal\r\n";

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

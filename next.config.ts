import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // O instalador de desenvolvimento lê /extension em tempo de execução; sem isto o
  // file tracing do modo standalone pode não copiar a pasta (nem os arquivos novos).
  outputFileTracingIncludes: {
    "/api/extension/dev-installer": ["./extension/**/*"],
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // A conciliação de fatura envia o PDF (ou foto) numa Server Action;
      // o padrão de 1 MB não cabe uma fatura de várias páginas.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;

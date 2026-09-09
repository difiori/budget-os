import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Budget OS",
    short_name: "Budget OS",
    description: "Controle de orçamento do casal — Diego & Vitor",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f4f0",
    theme_color: "#1e4d3b",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      // Quadrado cheio com as bolinhas na zona segura: o Android aplica a máscara.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      // Silhueta branca: "ícones temáticos" do Android pintam com a cor do tema.
      { src: "/icon-mono-512.png", sizes: "512x512", type: "image/png", purpose: "monochrome" },
    ],
  };
}

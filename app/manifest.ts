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
      { src: "/app-icon3.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon3.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

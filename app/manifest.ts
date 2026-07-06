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
      { src: "/app-icon4.png", sizes: "1024x1024", type: "image/png", purpose: "any" },
      { src: "/app-icon4.png", sizes: "1024x1024", type: "image/png", purpose: "maskable" },
    ],
  };
}

import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

// Poppins cobre os dois papéis (display e interface) — uma família só no
// projeto todo, sem serifa.
const poppinsDisplay = Poppins({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const poppinsSans = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Budget OS",
  description: "Gestão financeira do casal — Diego & Vitor",
  applicationName: "Budget OS",
  icons: {
    // Aba do navegador: o script de tema abaixo troca este href entre
    // favicon-light.png e favicon-dark.png seguindo o tema do PRÓPRIO app
    // (funciona no Safari, que não lê tema em favicon SVG). Tela de início
    // (iOS) e manifesto usam o PNG escuro em quadrado cheio — o sistema
    // arredonda. Gerados por scripts/gerar-icones.ts.
    icon: { url: "/favicon-dark.png", sizes: "96x96", type: "image/png" },
    shortcut: "/favicon-dark.png",
    // 180 para o iPhone; 1024 para o Dock do Mac ficar nítido em Retina.
    apple: [
      { url: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { url: "/app-icon.png", sizes: "1024x1024", type: "image/png" },
    ],
  },
  // Faz o iOS abrir em tela cheia (sem barra do Safari) quando instalado na
  // tela de início. `black-translucent`: o app é imersivo e o fundo (charcoal
  // + aurora) vai até o topo, atrás da status bar; o conteúdo é afastado da
  // status bar via env(safe-area-inset-top) no layout.
  appleWebApp: {
    capable: true,
    title: "Budget OS",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover: o conteúdo respeita os cantos/notch via safe-area
  // (a barra de navegação mobile já usa env(safe-area-inset-bottom)).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f4f0" },
    { media: "(prefers-color-scheme: dark)", color: "#121613" },
  ],
};

/* Aplica o tema salvo (ou o do sistema) antes da primeira pintura, evitando
 * flash de tema errado — e faz o favicon da aba seguir o mesmo tema: troca o
 * href de <link rel="icon"> agora, quando o interruptor dispara "theme-change"
 * e quando o sistema muda de esquema (só vale se não há tema salvo). */
const themeInitScript = `
(function () {
  function temaAtual() {
    try {
      var stored = localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") return stored;
    } catch (e) {}
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  function aplicarFavicon(theme) {
    var href = theme === "dark" ? "/favicon-dark.png" : "/favicon-light.png";
    var links = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    if (!links.length) {
      var l = document.createElement("link");
      l.rel = "icon"; l.type = "image/png"; l.sizes = "96x96";
      document.head.appendChild(l);
      links = [l];
    }
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute("href") !== href) links[i].setAttribute("href", href);
    }
  }
  function temaDoDocumento() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }
  try {
    var theme = temaAtual();
    document.documentElement.setAttribute("data-theme", theme);
    aplicarFavicon(theme);
    // Os <link rel="icon"> do Next entram no <head> depois deste script:
    // reaplica quando o documento termina de carregar.
    document.addEventListener("DOMContentLoaded", function () { aplicarFavicon(temaDoDocumento()); });
    window.addEventListener("theme-change", function () { aplicarFavicon(temaDoDocumento()); });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function () {
      try { if (localStorage.getItem("theme")) return; } catch (e) {}
      var t = temaAtual();
      document.documentElement.setAttribute("data-theme", t);
      aplicarFavicon(t);
    });
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: o script de tema escreve data-theme antes da
    // hidratação — divergência intencional e restrita a este atributo.
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${poppinsDisplay.variable} ${poppinsSans.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-ink">
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}

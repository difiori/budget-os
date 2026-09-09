// Gera os ícones do Budget OS (conceito "dois pontos" levemente sobrepostos —
// decisão do Diego em 09/09 —, acabamento de vidro à
// moda macOS): favicon SVG com troca automática claro/escuro, PNGs para tela
// de início (iOS), manifesto (Android/PWA, inclusive maskable e monocromático)
// e fallback de favicon.
//
//   npx tsx scripts/gerar-icones.ts
//
// Saída em public/. Cores = tokens do app (globals.css).

import sharp from "sharp";
import { writeFileSync } from "node:fs";

type Tema = "light" | "dark";
const CORES = {
  light: { bgTop: "#fdfdfb", bgBot: "#e6e7df", borda: "rgba(255,255,255,0.85)", sombraBorda: "rgba(0,0,0,0.08)", gloss: 0.6, diego: "#2f6bd6", vitor: "#d9691f", fundoPlano: "#f4f4f0" },
  dark: { bgTop: "#2a2f37", bgBot: "#0f1216", borda: "rgba(255,255,255,0.28)", sombraBorda: "rgba(0,0,0,0.5)", gloss: 0.2, diego: "#3aa7ff", vitor: "#ff8a3d", fundoPlano: "#16191e" },
} as const;

/**
 * Desenho em 1024×1024. `arredondado=false` entrega o quadrado inteiro (iOS e
 * o maskable do Android aplicam a própria máscara — cantos duplos ficam feios).
 */
function svgIcone(tema: Tema, opts: { arredondado?: boolean; mono?: boolean } = {}): string {
  const c = CORES[tema];
  const rx = opts.arredondado === false ? 0 : 230;
  const clip = `<clipPath id="q"><rect width="1024" height="1024" rx="${rx}"/></clipPath>`;
  if (opts.mono) {
    // Silhueta para "ícones temáticos" do Android: o sistema pinta.
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><circle cx="358" cy="512" r="166" fill="#fff"/><circle cx="666" cy="512" r="166" fill="#fff"/></svg>`;
  }
  const bolinha = (cx: number, cor: string, id: string) => `
    <radialGradient id="g${id}" cx="0.35" cy="0.28" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.45" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#000" stop-opacity="0.18"/></radialGradient>
    <circle cx="${cx}" cy="512" r="166" fill="${cor}" filter="url(#sombra)"/>
    <circle cx="${cx}" cy="512" r="166" fill="url(#g${id})"/>
    <ellipse cx="${cx}" cy="430" rx="104" ry="52" fill="url(#spec)"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    ${clip}
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.bgTop}"/><stop offset="1" stop-color="${c.bgBot}"/></linearGradient>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="${c.gloss}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="spec" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${tema === "dark" ? 0.35 : 0.06}"/></linearGradient>
    <filter id="sombra" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="${tema === "dark" ? 0.55 : 0.22}"/></filter>
  </defs>
  <g clip-path="url(#q)">
    <rect width="1024" height="1024" fill="url(#bg)"/>
    <!-- reflexo de vidro: metade de cima, com a borda inferior levemente curva -->
    <path d="M0 0H1024V400Q512 520 0 400Z" fill="url(#gloss)"/>
    <!-- peso na base -->
    <rect y="512" width="1024" height="512" fill="url(#base)"/>
    ${bolinha(358, c.diego, "D")}
    ${bolinha(666, c.vitor, "V")}
    <!-- borda interna iluminada em cima, sombreada embaixo -->
    <rect x="3" y="3" width="1018" height="1018" rx="${Math.max(0, rx - 3)}" fill="none" stroke="${c.borda}" stroke-width="4"/>
    <rect x="1.5" y="1.5" width="1021" height="1021" rx="${Math.max(0, rx - 1.5)}" fill="none" stroke="${c.sombraBorda}" stroke-width="3"/>
  </g>
</svg>`;
}

/** Favicon: um SVG só, que troca de tema pelo sistema (Chrome, Edge, Firefox). */
function svgFavicon(): string {
  const l = CORES.light, d = CORES.dark;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <style>
    .bg{fill:${l.fundoPlano}} .b{fill:${l.diego}} .v{fill:${l.vitor}} .e{stroke:rgba(0,0,0,0.12)}
    @media (prefers-color-scheme: dark){ .bg{fill:${d.fundoPlano}} .b{fill:${d.diego}} .v{fill:${d.vitor}} .e{stroke:rgba(255,255,255,0.18)} }
  </style>
  <defs>
    <clipPath id="q"><rect width="1024" height="1024" rx="230"/></clipPath>
    <linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <linearGradient id="spec" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <g clip-path="url(#q)">
    <rect class="bg" width="1024" height="1024"/>
    <path d="M0 0H1024V400Q512 520 0 400Z" fill="url(#gloss)"/>
    <circle class="b" cx="340" cy="512" r="190"/><ellipse cx="340" cy="420" rx="118" ry="60" fill="url(#spec)"/>
    <circle class="v" cx="684" cy="512" r="190"/><ellipse cx="684" cy="420" rx="118" ry="60" fill="url(#spec)"/>
    <rect class="e" x="2" y="2" width="1020" height="1020" rx="228" fill="none" stroke-width="4"/>
  </g>
</svg>`;
}

async function png(svg: string, size: number, arquivo: string) {
  await sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png().toFile(`public/${arquivo}`);
  console.log(`  ${arquivo} ${size}px`);
}

async function main() {
  writeFileSync("public/icon.svg", svgFavicon());
  console.log("  icon.svg (claro/escuro automático)");
  // Tela de início (iOS) e manifesto: escuro, quadrado cheio — o sistema arredonda.
  await png(svgIcone("dark", { arredondado: false }), 1024, "app-icon.png");
  await png(svgIcone("dark", { arredondado: false }), 180, "apple-icon.png");
  await png(svgIcone("dark", { arredondado: false }), 512, "icon-512.png");
  await png(svgIcone("dark", { arredondado: false }), 192, "icon-192.png");
  await png(svgIcone("dark", { mono: true }), 512, "icon-mono-512.png");
  // Fallback do favicon (Safari): escuro, arredondado.
  await png(svgIcone("dark"), 96, "favicon.png");
  // Pré-visualizações arredondadas (só com --preview; não vão para o app).
  if (process.argv.includes("--preview")) {
    await png(svgIcone("light"), 1024, "preview-icon-light.png");
    await png(svgIcone("dark"), 1024, "preview-icon-dark.png");
  }
}
main();

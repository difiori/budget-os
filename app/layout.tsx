import type { Metadata } from "next";
import { Poppins } from "next/font/google";
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
};

/* Aplica o tema salvo (ou o do sistema) antes da primeira pintura,
 * evitando flash de tema errado. */
const themeInitScript = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var theme = stored === "light" || stored === "dark"
      ? stored
      : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
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
      <body className="flex min-h-full flex-col bg-bg text-ink">{children}</body>
    </html>
  );
}

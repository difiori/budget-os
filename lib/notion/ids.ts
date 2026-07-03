// IDs fixos do Notion (databases/páginas de relation), usados pelo sync (F3).
// Mapeados por `nome` porque os UUIDs locais do Supabase variam por ambiente.

export const SAIDAS_DATABASE_ID = "864ddabe0d7c4a3cb01b3d7f0211db40";

export const CONTA_NOTION_IDS: Record<string, string> = {
  "Conta C6 (CPF)": "3904c37a7776816aa26be12d31aa18b6",
  "Conta C6 (CNPJ)": "3904c37a777681a9a320fb01af3a0161",
  "Conta C6 Bank": "3904c37a7776812da22fe4d9f6ac63ff",
};

export const CARTAO_NOTION_IDS: Record<string, string> = {
  "C6 Carbon Black": "3904c37a77768105b2d5d501c48c2446",
  "C6 Business": "3904c37a777681568eded73eaed38ed7",
  Pluxee: "3904c37a77768148b3d1e167f1c553f7",
  "C6 Black": "3904c37a777681b39eb5dcf3eb7000a7",
  "Casas Bahia": "3904c37a77768155bdfbcd1f7d6db362",
  "Mercado Pago": "3904c37a7776817ab508f66c06ea9267",
  Nubank: "3904c37a777681e7bbbfe9216c11f03e",
};

export const CATEGORIA_NOTION_IDS: Record<string, string> = {
  Alimentação: "3904c37a777681ad9730c4369c97ace5",
  Apartamento: "3904c37a7776810ab028fee217840dae",
  Assinaturas: "3904c37a7776818c8efac200e29e644e",
  "Contas mãe": "3904c37a777681a69b5fd9651b97bf67",
  Farmácia: "3904c37a7776814586bac56db85eb6da",
  "Gastos Diversos": "3904c37a77768139941ceb6c7799a921",
  Pets: "3904c37a7776816a8a4ffa7b39acbfe3",
  "Tarifas Bancárias": "3904c37a77768104acffd3f77af6d280",
  Transporte: "3904c37a7776811cb099e8c3a9a8b5e2",
  "Contas Jurídicas": "3904c37a777681a0ab14f56073eb973d",
  Empréstimos: "3904c37a777681c38659d63eb13df713",
  Shopping: "3904c37a777681f68d67e3664fd67227",
};

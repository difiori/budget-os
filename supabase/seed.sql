-- Seeds do MD: contas, cartões e categorias.
-- Valores em centavos.

insert into conta (nome, dono) values
  ('Conta C6 (CPF)', 'Diego'),
  ('Conta C6 (CNPJ)', 'Diego'),
  ('Conta C6 Bank', 'Vitor');

insert into cartao (nome, dono, tipo, limite_cents) values
  ('C6 Carbon Black', 'Diego', 'Crédito', 320560),
  ('C6 Business', 'Diego', 'Crédito', 300000),
  ('Pluxee', 'Diego', 'Benefício', null),
  ('C6 Black', 'Vitor', 'Crédito', 41149),
  ('Casas Bahia', 'Vitor', 'Crédito', 228000),
  ('Mercado Pago', 'Vitor', 'Crédito', 360000),
  ('Nubank', 'Vitor', 'Crédito', 80000);

insert into categoria (nome, dono) values
  ('Alimentação', 'Ambos'),
  ('Apartamento', 'Ambos'),
  ('Assinaturas', 'Ambos'),
  ('Contas mãe', 'Ambos'),
  ('Farmácia', 'Ambos'),
  ('Gastos Diversos', 'Ambos'),
  ('Pets', 'Ambos'),
  ('Tarifas Bancárias', 'Ambos'),
  ('Transporte', 'Ambos'),
  ('Contas Jurídicas', 'Diego'),
  ('Empréstimos', 'Diego'),
  ('Shopping', 'Diego');

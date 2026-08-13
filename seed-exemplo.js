'use strict';
/* Popula o sistema com dados de exemplo para você testar. Rode:  npm run exemplo  */
const { db } = require('./src/db');

const rep = (nome, cnpj, com, min) => db.prepare(
  'INSERT INTO representadas (nome, cnpj, comissao_pct, pedido_minimo, contato, telefone) VALUES (?,?,?,?,?,?)')
  .run(nome, cnpj, com, min, 'Central de Vendas', '(11) 3000-0000').lastInsertRowid;

const jaTem = db.prepare('SELECT COUNT(*) c FROM representadas').get().c;
if (jaTem) { console.log('Já existem dados. Nada foi alterado.'); process.exit(0); }

const r1 = rep('Vinícola Serra Alta', '12345678000190', 6, 1500);
const r2 = rep('Laticínios Colonial', '98765432000155', 5, 800);

for (const [rid, nome] of [[r1, 'Tabela 2026'], [r2, 'Tabela 2026']]) {
  db.prepare('INSERT INTO tabelas_preco (representada_id, nome, padrao, ativo) VALUES (?,?,1,1)').run(rid, nome);
}
for (const [rid, d, p, pm] of [[r1, '30/60/90 dias', 3, 60], [r1, 'À vista', 1, 0], [r2, '28/56 dias', 2, 42]]) {
  db.prepare('INSERT INTO condicoes_pagamento (representada_id, descricao, parcelas, prazo_medio, padrao, ativo) VALUES (?,?,?,?,?,1)')
    .run(rid, d, p, pm, d.includes('30/60') || d.includes('28/56') ? 1 : 0);
}

const produtos = [
  [r1, 'VN001', 'Malbec Reserva 750ml', 'UN', 89.9, 6],
  [r1, 'VN002', 'Cabernet Sauvignon 750ml', 'UN', 74.5, 6],
  [r1, 'VN003', 'Torrontés 750ml', 'UN', 62.0, 6],
  [r2, 'LC001', 'Queijo colonial 500g', 'UN', 38.0, 10],
  [r2, 'LC002', 'Salame italiano 300g', 'UN', 29.9, 12],
];
for (const [rid, cod, desc, un, preco, cx] of produtos) {
  db.prepare('INSERT INTO produtos (representada_id, codigo, descricao, unidade, preco_base, embalagem, estoque) VALUES (?,?,?,?,?,?,?)')
    .run(rid, cod, desc, un, preco, cx, 500);
}

const clientes = [
  ['11222333000181', 'Adega Central Comércio de Bebidas Ltda', 'Adega Central', 'Curitiba', 'PR', '41 3222-1000'],
  ['22333444000172', 'Mercado Bom Preço Ltda', 'Bom Preço', 'São José dos Pinhais', 'PR', '41 3333-2000'],
  ['33444555000163', 'Empório do Vinho Eireli', 'Empório do Vinho', 'Curitiba', 'PR', '41 3444-3000'],
];
for (const [cnpj, rs, nf, cid, uf, tel] of clientes) {
  db.prepare('INSERT INTO clientes (cnpj, razao_social, nome_fantasia, cidade, uf, telefone, usuario_id) VALUES (?,?,?,?,?,?,1)')
    .run(cnpj, rs, nf, cid, uf, tel);
}

const ano = new Date().getFullYear();
for (const rid of [r1, r2]) {
  for (let m = 1; m <= 12; m++) {
    db.prepare('INSERT INTO metas (ano, mes, representada_id, valor, dias_uteis) VALUES (?,?,?,?,22)')
      .run(ano, m, rid, rid === r1 ? 18000 : 11000);
  }
}
for (let m = 1; m <= 12; m++) {
  db.prepare('INSERT INTO historico_vendas (ano, mes, representada_id, realizado, meta) VALUES (?,?,?,?,?)')
    .run(ano - 1, m, r1, 14000 + m * 450, 16000);
  db.prepare('INSERT INTO historico_vendas (ano, mes, representada_id, realizado, meta) VALUES (?,?,?,?,?)')
    .run(ano - 1, m, r2, 8500 + m * 260, 10000);
}

console.log('Dados de exemplo criados: 2 representadas, 5 produtos, 3 clientes, metas e histórico do ano passado.');

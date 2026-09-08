'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { hashSenha } = require('./auth');

const DATA_DIR = process.env.REPSYS_DATA || path.join(__dirname, '..', 'dados');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'repsys.db');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'representante', -- admin | representante
  telefone TEXT DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS representadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  cnpj TEXT DEFAULT '',
  contato TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  comissao_pct REAL NOT NULL DEFAULT 0,
  pedido_minimo REAL NOT NULL DEFAULT 0,
  observacoes TEXT DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS tabelas_preco (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  representada_id INTEGER NOT NULL REFERENCES representadas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  vigencia_inicio TEXT DEFAULT '',
  vigencia_fim TEXT DEFAULT '',
  padrao INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS condicoes_pagamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  representada_id INTEGER REFERENCES representadas(id) ON DELETE CASCADE,
  descricao TEXT NOT NULL,          -- ex.: 28/56/84 dias
  parcelas INTEGER NOT NULL DEFAULT 1,
  prazo_medio INTEGER NOT NULL DEFAULT 0,
  acrescimo_pct REAL NOT NULL DEFAULT 0,
  desconto_pct REAL NOT NULL DEFAULT 0,
  padrao INTEGER NOT NULL DEFAULT 0,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  representada_id INTEGER NOT NULL REFERENCES representadas(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  unidade TEXT NOT NULL DEFAULT 'UN',
  ncm TEXT DEFAULT '',
  ipi_pct REAL NOT NULL DEFAULT 0,
  st_pct REAL NOT NULL DEFAULT 0,
  embalagem REAL NOT NULL DEFAULT 1,     -- multiplo de venda
  peso REAL NOT NULL DEFAULT 0,
  estoque REAL NOT NULL DEFAULT 0,
  preco_base REAL NOT NULL DEFAULT 0,
  desconto_max_pct REAL NOT NULL DEFAULT 0,
  imagem TEXT DEFAULT '',
  observacoes TEXT DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (representada_id, codigo)
);

CREATE TABLE IF NOT EXISTS precos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela_id INTEGER NOT NULL REFERENCES tabelas_preco(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  preco REAL NOT NULL DEFAULT 0,
  UNIQUE (tabela_id, produto_id)
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cnpj TEXT DEFAULT '',
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT DEFAULT '',
  ie TEXT DEFAULT '',
  email TEXT DEFAULT '',
  telefone TEXT DEFAULT '',
  contato TEXT DEFAULT '',
  cep TEXT DEFAULT '',
  logradouro TEXT DEFAULT '',
  numero TEXT DEFAULT '',
  complemento TEXT DEFAULT '',
  bairro TEXT DEFAULT '',
  cidade TEXT DEFAULT '',
  uf TEXT DEFAULT '',
  situacao TEXT DEFAULT '',
  abertura TEXT DEFAULT '',
  atividade TEXT DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  observacoes TEXT DEFAULT '',
  ativo INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_clientes_cnpj ON clientes(cnpj);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'pedido',        -- pedido | cotacao
  status TEXT NOT NULL DEFAULT 'rascunho',    -- rascunho|aberto|enviado|faturado|cancelado (pedido)
                                              -- rascunho|enviada|ganha|perdida (cotacao)
  cliente_id INTEGER NOT NULL REFERENCES clientes(id),
  representada_id INTEGER NOT NULL REFERENCES representadas(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  tabela_id INTEGER REFERENCES tabelas_preco(id),
  condicao_id INTEGER REFERENCES condicoes_pagamento(id),
  data_emissao TEXT NOT NULL,
  data_entrega TEXT DEFAULT '',
  validade TEXT DEFAULT '',
  tipo_frete TEXT DEFAULT 'CIF',
  transportadora TEXT DEFAULT '',
  frete REAL NOT NULL DEFAULT 0,
  desconto_pct REAL NOT NULL DEFAULT 0,
  total_bruto REAL NOT NULL DEFAULT 0,
  total_ipi REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  comissao_valor REAL NOT NULL DEFAULT 0,
  origem_id INTEGER REFERENCES pedidos(id),   -- cotacao que virou pedido
  observacoes TEXT DEFAULT '',
  criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_pedidos_data ON pedidos(data_emissao);
CREATE INDEX IF NOT EXISTS idx_pedidos_rep ON pedidos(representada_id);

CREATE TABLE IF NOT EXISTS pedido_itens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id INTEGER REFERENCES produtos(id),
  codigo TEXT DEFAULT '',
  descricao TEXT NOT NULL,
  unidade TEXT DEFAULT 'UN',
  quantidade REAL NOT NULL DEFAULT 1,
  preco_unit REAL NOT NULL DEFAULT 0,
  desconto_pct REAL NOT NULL DEFAULT 0,
  ipi_pct REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_itens_pedido ON pedido_itens(pedido_id);

CREATE TABLE IF NOT EXISTS metas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ano INTEGER NOT NULL,
  mes INTEGER,                                -- NULL = meta anual
  representada_id INTEGER REFERENCES representadas(id) ON DELETE CASCADE, -- NULL = todas
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,           -- NULL = equipe toda
  valor REAL NOT NULL DEFAULT 0,
  dias_uteis INTEGER NOT NULL DEFAULT 22,
  meta_diaria REAL NOT NULL DEFAULT 0,        -- 0 = calcula valor/dias_uteis
  observacoes TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_metas_unica
  ON metas(ano, IFNULL(mes,0), IFNULL(representada_id,0), IFNULL(usuario_id,0));

CREATE TABLE IF NOT EXISTS historico_vendas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  representada_id INTEGER REFERENCES representadas(id) ON DELETE CASCADE,
  realizado REAL NOT NULL DEFAULT 0,
  meta REAL NOT NULL DEFAULT 0,
  observacoes TEXT DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_unico
  ON historico_vendas(ano, mes, IFNULL(representada_id,0));

CREATE TABLE IF NOT EXISTS config (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);
`);

// ---- atualizacoes de estrutura em bancos ja existentes
function garantirColuna(tabela, coluna, definicao) {
  const cols = db.prepare(`PRAGMA table_info(${tabela})`).all().map(c => c.name);
  if (!cols.includes(coluna)) db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${definicao}`);
}
garantirColuna('produtos', 'imagem', "TEXT DEFAULT ''");
garantirColuna('representadas', 'logo', "TEXT DEFAULT ''");
garantirColuna('pedidos', 'condicao_texto', "TEXT DEFAULT ''");        // prazo negociado, texto livre
garantirColuna('pedidos', 'comissao_pct', "REAL");                     // NULL = usa a % da representada
garantirColuna('pedidos', 'comissao_status', "TEXT DEFAULT 'pendente'"); // pendente | recebida
garantirColuna('pedidos', 'comissao_recebida_em', "TEXT DEFAULT ''");

// ---- valores padrao de configuracao (dados do representante / cabecalho do PDF)
const cfgPadrao = {
  empresa_nome: 'INOVE Representações',
  empresa_cnpj: '',
  empresa_telefone: '',
  empresa_email: '',
  empresa_endereco: '',
  status_faturamento: 'faturado', // status que conta como venda realizada
  contar_status: 'aberto,enviado,faturado',
  logo_arquivo: '',
};
const insCfg = db.prepare('INSERT OR IGNORE INTO config (chave, valor) VALUES (?, ?)');
for (const [k, v] of Object.entries(cfgPadrao)) insCfg.run(k, v);

// ---- usuario administrador inicial
// Em servidor publicado, defina REPSYS_ADMIN_EMAIL e REPSYS_ADMIN_SENHA
const EMAIL_INICIAL = process.env.REPSYS_ADMIN_EMAIL || 'admin@local';
const SENHA_INICIAL = process.env.REPSYS_ADMIN_SENHA || 'admin123';
const totalUsuarios = db.prepare('SELECT COUNT(*) c FROM usuarios').get().c;
if (totalUsuarios === 0) {
  db.prepare(
    'INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES (?, ?, ?, ?)'
  ).run('Administrador', EMAIL_INICIAL, hashSenha(SENHA_INICIAL), 'admin');
  console.log(`>> Usuário inicial criado:  ${EMAIL_INICIAL}` +
    (process.env.REPSYS_ADMIN_SENHA ? '  (senha definida na configuração do servidor)' : `  /  ${SENHA_INICIAL}`));
}

// ---- backup automático diário (guarda os 7 últimos)
const PASTA_BACKUP = path.join(DATA_DIR, 'backups');
function backupAutomatico() {
  try {
    fs.mkdirSync(PASTA_BACKUP, { recursive: true });
    const hoje = new Date().toLocaleDateString('sv-SE');
    const destino = path.join(PASTA_BACKUP, `backup-${hoje}.db`);
    if (!fs.existsSync(destino)) {
      db.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);
      console.log('   backup automático gravado em dados/backups/backup-' + hoje + '.db');
    }
    const antigos = fs.readdirSync(PASTA_BACKUP).filter(a => a.startsWith('backup-')).sort();
    while (antigos.length > 7) fs.unlinkSync(path.join(PASTA_BACKUP, antigos.shift()));
  } catch (e) { console.log('   (não foi possível gravar o backup automático: ' + e.message + ')'); }
}
backupAutomatico();
setInterval(backupAutomatico, 12 * 60 * 60 * 1000).unref();

function config(chave) {
  const r = db.prepare('SELECT valor FROM config WHERE chave = ?').get(chave);
  return r ? r.valor : '';
}
function setConfig(chave, valor) {
  db.prepare('INSERT INTO config (chave,valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor')
    .run(chave, String(valor ?? ''));
}

module.exports = { db, config, setConfig, DB_FILE, DATA_DIR };

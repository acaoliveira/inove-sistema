'use strict';
const { db } = require('./db');

const hoje = () => new Date().toLocaleDateString('sv-SE');   // AAAA-MM-DD no fuso da máquina
const somarDias = (iso, n) => {
  const [a, m, d] = String(iso).split('-').map(Number);
  const x = new Date(a, m - 1, d + n);
  return x.toLocaleDateString('sv-SE');
};
const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const horaValida = (s) => s === '' || /^\d{2}:\d{2}$/.test(String(s || ''));
const SITUACOES = ['marcado', 'realizado', 'cancelado'];

const SQL = `SELECT c.*, cl.razao_social AS cliente_nome, cl.nome_fantasia AS cliente_fantasia,
    cl.telefone AS cliente_telefone, cl.cidade AS cliente_cidade, cl.uf AS cliente_uf,
    u.nome AS usuario_nome
  FROM compromissos c
  LEFT JOIN clientes cl ON cl.id = c.cliente_id
  LEFT JOIN usuarios u ON u.id = c.usuario_id`;

module.exports = function (rota, ErroApi) {
  /** Confere e normaliza o que veio da tela antes de gravar */
  function validar(corpo) {
    const data = String(corpo.data || '').trim();
    if (!dataValida(data)) throw new ErroApi('Escolha a data do compromisso.');
    const hora = String(corpo.hora || '').trim();
    if (!horaValida(hora)) throw new ErroApi('A hora precisa estar no formato 14:30 — ou deixe em branco.');
    const assunto = String(corpo.assunto || '').trim();
    if (assunto.length < 2) throw new ErroApi('Escreva o assunto do compromisso.');
    const retorno = String(corpo.retorno_em || '').trim();
    if (retorno && !dataValida(retorno)) throw new ErroApi('A data de retorno está incompleta.');
    if (retorno && retorno < data) throw new ErroApi('O retorno não pode ser antes do próprio compromisso.');
    const cliente_id = Number(corpo.cliente_id) || null;
    if (cliente_id && !db.prepare('SELECT 1 FROM clientes WHERE id = ?').get(cliente_id)) {
      throw new ErroApi('Cliente não encontrado.');
    }
    const situacao = SITUACOES.includes(corpo.situacao) ? corpo.situacao : 'marcado';
    return { data, hora, assunto, retorno, cliente_id, situacao };
  }

  /** Lista por período. Sem período, traz de uma semana atrás em diante. */
  rota.get('/api/agenda', ({ query }) => {
    const cond = [], args = [];
    const de = dataValida(query.de) ? query.de : somarDias(hoje(), -7);
    const ate = dataValida(query.ate) ? query.ate : somarDias(hoje(), 120);
    cond.push('c.data >= ?', 'c.data <= ?'); args.push(de, ate);
    if (SITUACOES.includes(query.situacao)) { cond.push('c.situacao = ?'); args.push(query.situacao); }
    if (query.cliente_id) { cond.push('c.cliente_id = ?'); args.push(Number(query.cliente_id)); }
    const lista = db.prepare(`${SQL} WHERE ${cond.join(' AND ')}
      ORDER BY c.data, CASE WHEN c.hora = '' THEN 1 ELSE 0 END, c.hora, c.id
      LIMIT ${Number(query.limite || 500)}`).all(...args);
    return { periodo: { de, ate }, lista };
  });

  /**
   * O que importa agora: hoje, amanhã, o que passou sem resposta e os retornos
   * que venceram. É o que alimenta o cartão do painel.
   */
  rota.get('/api/agenda/resumo', () => {
    const h = hoje(), a = somarDias(h, 1);
    const porData = (d) => db.prepare(`${SQL} WHERE c.data = ? AND c.situacao <> 'cancelado'
      ORDER BY CASE WHEN c.hora = '' THEN 1 ELSE 0 END, c.hora, c.id`).all(d);
    // marcado e já passou da data: ficou sem desfecho
    const atrasados = db.prepare(`${SQL} WHERE c.data < ? AND c.situacao = 'marcado'
      ORDER BY c.data DESC LIMIT 20`).all(h);
    // o "voltar a procurar" chegou e não virou compromisso novo
    const retornos = db.prepare(`${SQL} WHERE c.retorno_em <> '' AND c.retorno_em <= ?
        AND c.situacao <> 'cancelado'
        AND NOT EXISTS (SELECT 1 FROM compromissos f
          WHERE f.cliente_id = c.cliente_id AND f.data > c.data AND f.situacao <> 'cancelado')
      ORDER BY c.retorno_em LIMIT 20`).all(h);
    return { hoje: porData(h), amanha: porData(a), atrasados, retornos, data_hoje: h };
  });

  rota.get('/api/agenda/:id', ({ params }) => {
    const c = db.prepare(`${SQL} WHERE c.id = ?`).get(Number(params.id));
    if (!c) throw new ErroApi('Compromisso não encontrado.', 404);
    return c;
  });

  rota.post('/api/agenda', ({ corpo, usuario }) => {
    const v = validar(corpo);
    const r = db.prepare(`INSERT INTO compromissos
        (data, hora, cliente_id, assunto, situacao, retorno_em, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(v.data, v.hora, v.cliente_id, v.assunto, v.situacao, v.retorno, usuario?.id || null);
    return db.prepare(`${SQL} WHERE c.id = ?`).get(Number(r.lastInsertRowid));
  });

  rota.put('/api/agenda/:id', ({ params, corpo }) => {
    const id = Number(params.id);
    if (!db.prepare('SELECT 1 FROM compromissos WHERE id = ?').get(id)) {
      throw new ErroApi('Compromisso não encontrado.', 404);
    }
    const v = validar(corpo);
    db.prepare(`UPDATE compromissos SET data = ?, hora = ?, cliente_id = ?, assunto = ?,
        situacao = ?, retorno_em = ?, atualizado_em = datetime('now','localtime') WHERE id = ?`)
      .run(v.data, v.hora, v.cliente_id, v.assunto, v.situacao, v.retorno, id);
    return db.prepare(`${SQL} WHERE c.id = ?`).get(id);
  });

  /** Atalho da lista: marcar como realizado ou cancelado sem abrir o formulário */
  rota.post('/api/agenda/:id/situacao', ({ params, corpo }) => {
    if (!SITUACOES.includes(corpo.situacao)) throw new ErroApi('Situação inválida.');
    const id = Number(params.id);
    if (!db.prepare('SELECT 1 FROM compromissos WHERE id = ?').get(id)) {
      throw new ErroApi('Compromisso não encontrado.', 404);
    }
    db.prepare(`UPDATE compromissos SET situacao = ?, atualizado_em = datetime('now','localtime')
      WHERE id = ?`).run(corpo.situacao, id);
    return db.prepare(`${SQL} WHERE c.id = ?`).get(id);
  });

  rota.del('/api/agenda/:id', ({ params }) => {
    const id = Number(params.id);
    if (!db.prepare('SELECT 1 FROM compromissos WHERE id = ?').get(id)) {
      throw new ErroApi('Compromisso não encontrado.', 404);
    }
    db.prepare('DELETE FROM compromissos WHERE id = ?').run(id);
    return { ok: true };
  });
};

'use strict';
/**
 * Gerador de PDF em JavaScript puro (sem bibliotecas externas).
 * A4, fontes Helvetica / Helvetica-Bold e suporte a imagem (logo) PNG ou JPEG.
 */
const zlib = require('node:zlib');
const { lerImagem } = require('./imagem');

const LARGURA = 595.28;
const ALTURA = 841.89;

const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

function larguraTexto(txt, tam, bold) {
  const t = bold ? W_BOLD : W_REG;
  let w = 0;
  for (const ch of String(txt)) {
    const c = ch.charCodeAt(0);
    w += (c >= 32 && c <= 126) ? t[c - 32] : 556;
  }
  return (w / 1000) * tam;
}

// caracteres fora do Latin-1 que existem no WinAnsiEncoding (cp1252)
const CP1252 = { '€': '\x80', '‚': '\x82', 'ƒ': '\x83', '„': '\x84', '…': '\x85',
  '†': '\x86', '‡': '\x87', 'ˆ': '\x88', '‰': '\x89', 'Š': '\x8A', '‹': '\x8B',
  'Œ': '\x8C', 'Ž': '\x8E', '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94',
  '•': '\x95', '–': '\x96', '—': '\x97', '˜': '\x98', '™': '\x99', 'š': '\x9A',
  '›': '\x9B', 'œ': '\x9C', 'ž': '\x9E', 'Ÿ': '\x9F' };

function esc(s) {
  return String(s)
    .replace(/[Ā-￿]/g, c => CP1252[c] || '?')
    .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

class Doc {
  constructor() {
    this.paginas = [];
    this.imagens = [];
    this.novaPagina();
  }
  novaPagina() { this.buf = []; this.paginas.push(this.buf); return this; }
  texto(x, y, txt, o = {}) {
    const tam = o.tam || 9, bold = !!o.bold;
    let s = String(txt ?? '');
    if (o.max) {
      const original = s;
      while (larguraTexto(s, tam, bold) > o.max && s.length > 1) s = s.slice(0, -1);
      if (s !== original) s = s.slice(0, -1) + '…';
    }
    let px = x;
    if (o.align === 'right') px = x - larguraTexto(s, tam, bold);
    else if (o.align === 'center') px = x - larguraTexto(s, tam, bold) / 2;
    const c = o.cor || [0, 0, 0];
    this.buf.push(`BT ${c[0]} ${c[1]} ${c[2]} rg /${bold ? 'F2' : 'F1'} ${tam} Tf 1 0 0 1 ${px.toFixed(2)} ${(ALTURA - y).toFixed(2)} Tm (${esc(s)}) Tj ET`);
    return this;
  }
  retangulo(x, y, w, h, cor) {
    this.buf.push(`${cor[0]} ${cor[1]} ${cor[2]} rg ${x.toFixed(2)} ${(ALTURA - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
    return this;
  }
  linha(x1, y1, x2, y2, cor = [0.75, 0.75, 0.75], esp = 0.6) {
    this.buf.push(`${cor[0]} ${cor[1]} ${cor[2]} RG ${esp} w ${x1.toFixed(2)} ${(ALTURA - y1).toFixed(2)} m ${x2.toFixed(2)} ${(ALTURA - y2).toFixed(2)} l S`);
    return this;
  }
  /** Registra a imagem uma única vez e a desenha na posição indicada */
  imagem(img, x, y, w, h) {
    let i = this.imagens.indexOf(img);
    if (i < 0) { this.imagens.push(img); i = this.imagens.length - 1; }
    this.buf.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(ALTURA - y - h).toFixed(2)} cm /Im${i} Do Q`);
    return this;
  }

  gerar() {
    const nImg = this.imagens.length;
    const nPag = this.paginas.length;
    const idImg = (i) => 5 + i;
    const idPagina = (i) => 5 + nImg + i * 2;
    const idConteudo = (i) => 6 + nImg + i * 2;
    const recursos = `/Font << /F1 3 0 R /F2 4 0 R >>` +
      (nImg ? ` /XObject << ${this.imagens.map((_, i) => `/Im${i} ${idImg(i)} 0 R`).join(' ')} >>` : '');

    const objs = [];
    const dic = (s) => objs.push(Buffer.from(s, 'latin1'));
    const fluxo = (cab, dados) => objs.push(Buffer.concat([
      Buffer.from(`<< ${cab} /Length ${dados.length} >>\nstream\n`, 'latin1'), dados, Buffer.from('\nendstream', 'latin1')]));

    dic(`<< /Type /Catalog /Pages 2 0 R >>`);
    dic(`<< /Type /Pages /Count ${nPag} /Kids [${this.paginas.map((_, i) => `${idPagina(i)} 0 R`).join(' ')}] >>`);
    dic(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
    dic(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);
    for (const img of this.imagens) {
      if (img.tipo === 'jpeg') {
        fluxo(`/Type /XObject /Subtype /Image /Width ${img.largura} /Height ${img.altura} ` +
          `/ColorSpace /${img.componentes === 1 ? 'DeviceGray' : 'DeviceRGB'} /BitsPerComponent 8 /Filter /DCTDecode`, img.dados);
      } else {
        fluxo(`/Type /XObject /Subtype /Image /Width ${img.largura} /Height ${img.altura} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`, zlib.deflateSync(img.dados));
      }
    }
    this.paginas.forEach((conteudo, i) => {
      dic(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGURA} ${ALTURA}] /Resources << ${recursos} >> /Contents ${idConteudo(i)} 0 R >>`);
      fluxo('', Buffer.from(conteudo.join('\n'), 'latin1'));
    });

    const partes = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    let deslocamento = partes[0].length;
    const offsets = [0];
    objs.forEach((corpo, i) => {
      offsets.push(deslocamento);
      const p = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`, 'latin1'), corpo, Buffer.from('\nendobj\n', 'latin1')]);
      partes.push(p); deslocamento += p.length;
    });
    let fim = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objs.length; i++) fim += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    fim += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${deslocamento}\n%%EOF\n`;
    partes.push(Buffer.from(fim, 'latin1'));
    return Buffer.concat(partes);
  }
}

const brl = (n) => Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const dataBR = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : (s || ''));
function formatarCNPJ(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v || '';
}

const CARVAO = [0.176, 0.176, 0.192];   // #2D2D31 — cor da marca
const CINZA = [0.945, 0.945, 0.95];
const SUAVE = [0.45, 0.45, 0.47];

/**
 * @param {object} d { pedido, cliente, representada, itens, condicao, usuario, empresa, logo }
 */
function gerarPedidoPDF(d) {
  const { pedido, cliente, representada, itens, condicao, usuario, empresa } = d;
  const doc = new Doc();
  const M = 36;
  const eCotacao = pedido.tipo === 'cotacao';
  const titulo = eCotacao ? 'COTAÇÃO / ORÇAMENTO' : 'PEDIDO DE VENDA';

  let logo = null;
  if (d.logo) { try { logo = lerImagem(d.logo); } catch { logo = null; } }

  const cabecalho = () => {
    if (logo) {
      const altMax = 44, largMax = 230;
      let h = altMax, w = (logo.largura / logo.altura) * h;
      if (w > largMax) { w = largMax; h = (logo.altura / logo.largura) * w; }
      doc.imagem(logo, M, 14 + (altMax - h) / 2, w, h);
    } else {
      doc.texto(M, 40, empresa.empresa_nome || 'Representação Comercial', { tam: 16, bold: true, cor: CARVAO });
    }
    const sub = [empresa.empresa_cnpj && 'CNPJ ' + formatarCNPJ(empresa.empresa_cnpj), empresa.empresa_telefone, empresa.empresa_email]
      .filter(Boolean).join('   •   ');
    if (sub) doc.texto(M, 74, sub, { tam: 7.5, cor: SUAVE });
    doc.texto(LARGURA - M, 28, titulo, { tam: 11.5, bold: true, align: 'right', cor: CARVAO });
    doc.texto(LARGURA - M, 45, `Nº ${pedido.numero}`, { tam: 13, bold: true, align: 'right', cor: CARVAO });
    doc.texto(LARGURA - M, 60, dataBR(pedido.data_emissao), { tam: 8, align: 'right', cor: SUAVE });
    doc.retangulo(M, 82, LARGURA - 2 * M, 2.4, CARVAO);
  };

  const bloco = (y, rotulo, linhas) => {
    doc.retangulo(M, y, LARGURA - 2 * M, 14, CINZA);
    doc.texto(M + 6, y + 10, rotulo, { tam: 7.5, bold: true, cor: CARVAO });
    let yy = y + 26;
    for (const [rot, val] of linhas) {
      doc.texto(M + 6, yy, rot, { tam: 7.5, cor: SUAVE });
      doc.texto(M + 78, yy, val || '-', { tam: 8.5, max: LARGURA - 2 * M - 90 });
      yy += 12.5;
    }
    return yy + 4;
  };

  cabecalho();
  let y = 98;

  y = bloco(y, 'REPRESENTADA / FORNECEDOR', [
    ['Empresa', representada.nome],
    ['CNPJ', formatarCNPJ(representada.cnpj)],
    ['Contato', [representada.contato, representada.telefone, representada.email].filter(Boolean).join('  •  ')],
  ]);

  const endereco = [cliente.logradouro, cliente.numero, cliente.complemento].filter(Boolean).join(', ');
  const cidade = [cliente.bairro, [cliente.cidade, cliente.uf].filter(Boolean).join('/'), cliente.cep && 'CEP ' + cliente.cep].filter(Boolean).join(' - ');
  y = bloco(y, 'CLIENTE', [
    ['Razão social', cliente.razao_social],
    ['Fantasia', cliente.nome_fantasia],
    ['CNPJ / IE', [formatarCNPJ(cliente.cnpj), cliente.ie && 'IE ' + cliente.ie].filter(Boolean).join('   •   ')],
    ['Endereço', endereco],
    ['Cidade', cidade],
    ['Contato', [cliente.contato, cliente.telefone, cliente.email].filter(Boolean).join('  •  ')],
  ]);

  y = bloco(y, 'CONDIÇÕES COMERCIAIS', [
    ['Pagamento', condicao ? condicao.descricao : '-'],
    [eCotacao ? 'Validade' : 'Entrega', dataBR(eCotacao ? pedido.validade : pedido.data_entrega)],
    ['Frete', [pedido.tipo_frete, pedido.transportadora].filter(Boolean).join(' - ')],
    ['Vendedor', usuario ? usuario.nome : '-'],
  ]);

  // ---- tabela de itens
  const colunas = [
    { t: 'Cód.', x: M + 4, w: 52 },
    { t: 'Descrição', x: M + 58, w: 216 },
    { t: 'Un', x: M + 278, w: 22 },
    { t: 'Qtd', x: M + 336, w: 40, a: 'right' },
    { t: 'Preço', x: M + 398, w: 46, a: 'right' },
    { t: 'Desc%', x: M + 438, w: 34, a: 'right' },
    { t: 'Total', x: LARGURA - M - 4, w: 60, a: 'right' },
  ];
  const cabTabela = (yy) => {
    doc.retangulo(M, yy, LARGURA - 2 * M, 15, CARVAO);
    for (const c of colunas) doc.texto(c.x, yy + 10.5, c.t, { tam: 7.5, bold: true, cor: [1, 1, 1], align: c.a });
    return yy + 15;
  };

  y += 4;
  y = cabTabela(y);
  let zebra = false;
  const LIMITE = ALTURA - 150;

  for (const it of itens) {
    if (y > LIMITE) {
      doc.texto(LARGURA / 2, ALTURA - 30, 'continua na próxima página…', { tam: 7, align: 'center', cor: SUAVE });
      doc.novaPagina();
      cabecalho();
      y = cabTabela(98);
      zebra = false;
    }
    if (zebra) doc.retangulo(M, y, LARGURA - 2 * M, 14, [0.975, 0.975, 0.98]);
    zebra = !zebra;
    const vals = [it.codigo, it.descricao, it.unidade, qtd(it.quantidade), brl(it.preco_unit),
      Number(it.desconto_pct) ? Number(it.desconto_pct).toFixed(1) : '-', brl(it.total)];
    colunas.forEach((c, i) => doc.texto(c.x, y + 9.5, vals[i], { tam: 8, align: c.a, max: c.w }));
    y += 14;
  }
  doc.linha(M, y, LARGURA - M, y);

  // ---- totais
  if (y > ALTURA - 140) { doc.novaPagina(); cabecalho(); y = 98; }
  y += 10;
  const xr = LARGURA - M;
  const linhaTotal = (rot, val, bold) => {
    doc.texto(xr - 110, y, rot, { tam: 8.5, bold, align: 'right' });
    doc.texto(xr - 4, y, val, { tam: bold ? 10 : 8.5, bold, align: 'right' });
    y += bold ? 16 : 13;
  };
  linhaTotal('Subtotal', 'R$ ' + brl(pedido.total_bruto));
  if (Number(pedido.desconto_pct)) linhaTotal(`Desconto (${Number(pedido.desconto_pct).toFixed(2)}%)`, '- R$ ' + brl(pedido.total_bruto * pedido.desconto_pct / 100));
  if (Number(pedido.total_ipi)) linhaTotal('IPI', 'R$ ' + brl(pedido.total_ipi));
  if (Number(pedido.frete)) linhaTotal('Frete', 'R$ ' + brl(pedido.frete));
  y += 4;
  doc.linha(xr - 170, y - 11, xr, y - 11, CARVAO, 1);
  linhaTotal('TOTAL', 'R$ ' + brl(pedido.total), true);

  const totalPecas = itens.reduce((s, i) => s + Number(i.quantidade || 0), 0);
  doc.texto(M, y - 34, `${itens.length} item(ns)  •  ${qtd(totalPecas)} unidade(s)`, { tam: 8, cor: SUAVE });

  if (pedido.observacoes) {
    y += 8;
    doc.texto(M, y, 'Observações', { tam: 8, bold: true, cor: CARVAO }); y += 12;
    for (const parte of String(pedido.observacoes).split('\n')) {
      let resto = parte;
      while (resto.length) {
        let corte = resto.length;
        while (larguraTexto(resto.slice(0, corte), 8, false) > LARGURA - 2 * M && corte > 1) corte--;
        doc.texto(M, y, resto.slice(0, corte), { tam: 8 });
        resto = resto.slice(corte); y += 11;
      }
    }
  }

  // ---- rodapé
  doc.linha(M, ALTURA - 46, LARGURA - M, ALTURA - 46);
  doc.texto(M, ALTURA - 34, eCotacao
    ? 'Cotação sem validade fiscal. Preços sujeitos a confirmação da representada.'
    : 'Pedido sujeito a aprovação de crédito e disponibilidade de estoque da representada.',
    { tam: 7, cor: SUAVE });
  doc.texto(LARGURA - M, ALTURA - 34, `Emitido em ${new Date().toLocaleString('pt-BR')}`, { tam: 7, align: 'right', cor: SUAVE });

  return doc.gerar();
}

/** Quebra um texto em várias linhas respeitando a largura */
function quebrar(txt, largura, tam, bold, maxLinhas) {
  const palavras = String(txt || '').split(/\s+/).filter(Boolean);
  const linhas = [];
  let atual = '';
  for (const p of palavras) {
    const teste = atual ? atual + ' ' + p : p;
    if (larguraTexto(teste, tam, bold) <= largura) atual = teste;
    else { if (atual) linhas.push(atual); atual = p; }
    if (maxLinhas && linhas.length >= maxLinhas) break;
  }
  if (atual && (!maxLinhas || linhas.length < maxLinhas)) linhas.push(atual);
  if (maxLinhas && linhas.length === maxLinhas) {
    let u = linhas[maxLinhas - 1];
    const sobrou = palavras.join(' ').length > linhas.join(' ').length;
    if (sobrou) {
      while (larguraTexto(u + '…', tam, bold) > largura && u.length > 1) u = u.slice(0, -1);
      linhas[maxLinhas - 1] = u + '…';
    }
  }
  return linhas;
}

/**
 * Catálogo de produtos com foto.
 * @param {object} d { representada, tabela, produtos:[{codigo,descricao,unidade,embalagem,preco,imagem:Buffer}], empresa, logo }
 */
function gerarCatalogoPDF(d) {
  const { representada, tabela, produtos, empresa } = d;
  const doc = new Doc();
  const M = 30;
  let logo = null;
  if (d.logo) { try { logo = lerImagem(d.logo); } catch { logo = null; } }

  const cabecalho = () => {
    if (logo) {
      const altMax = 34, largMax = 175;
      let h = altMax, w = (logo.largura / logo.altura) * h;
      if (w > largMax) { w = largMax; h = (logo.altura / logo.largura) * w; }
      doc.imagem(logo, M, 16 + (altMax - h) / 2, w, h);
    } else {
      doc.texto(M, 36, empresa.empresa_nome || '', { tam: 14, bold: true, cor: CARVAO });
    }
    doc.texto(LARGURA - M, 26, 'CATÁLOGO DE PRODUTOS', { tam: 11, bold: true, align: 'right', cor: CARVAO });
    doc.texto(LARGURA - M, 41, representada.nome, { tam: 10, bold: true, align: 'right', cor: CARVAO });
    doc.texto(LARGURA - M, 54, [tabela ? tabela.nome : 'Preço base', new Date().toLocaleDateString('pt-BR')].join('  •  '),
      { tam: 7.5, align: 'right', cor: SUAVE });
    doc.retangulo(M, 62, LARGURA - 2 * M, 2, CARVAO);
  };

  const COLS = 3, LINHAS = 3;
  const ESP = 12;
  const LC = (LARGURA - 2 * M - ESP * (COLS - 1)) / COLS;   // largura da célula
  const HIMG = 118, HC = 208;                                // altura da imagem e da célula
  const TOPO = 78;

  cabecalho();
  let i = 0;
  for (const p of produtos) {
    const pos = i % (COLS * LINHAS);
    if (i > 0 && pos === 0) { doc.novaPagina(); cabecalho(); }
    const col = pos % COLS, lin = Math.floor(pos / COLS);
    const x = M + col * (LC + ESP);
    const y = TOPO + lin * (HC + ESP);

    // moldura
    doc.retangulo(x, y, LC, HC, [0.985, 0.985, 0.99]);
    doc.linha(x, y, x + LC, y, [0.88, 0.88, 0.9]);
    doc.linha(x, y + HC, x + LC, y + HC, [0.88, 0.88, 0.9]);
    doc.linha(x, y, x, y + HC, [0.88, 0.88, 0.9]);
    doc.linha(x + LC, y, x + LC, y + HC, [0.88, 0.88, 0.9]);

    // foto
    doc.retangulo(x + 1, y + 1, LC - 2, HIMG, [1, 1, 1]);
    let img = null;
    if (p.imagem) { try { img = lerImagem(p.imagem); } catch { img = null; } }
    if (img) {
      const cx = LC - 14, cy = HIMG - 10;
      let w = cx, h = (img.altura / img.largura) * w;
      if (h > cy) { h = cy; w = (img.largura / img.altura) * h; }
      doc.imagem(img, x + (LC - w) / 2, y + 5 + (cy - h) / 2, w, h);
    } else {
      doc.texto(x + LC / 2, y + HIMG / 2 + 3, 'sem foto', { tam: 8, align: 'center', cor: [0.72, 0.72, 0.75] });
    }
    doc.linha(x + 1, y + HIMG + 1, x + LC - 1, y + HIMG + 1, [0.9, 0.9, 0.92]);

    // textos
    let ty = y + HIMG + 16;
    doc.texto(x + 8, ty, p.codigo || '', { tam: 7, cor: SUAVE }); ty += 11;
    for (const l of quebrar(p.descricao, LC - 16, 8.5, true, 3)) { doc.texto(x + 8, ty, l, { tam: 8.5, bold: true }); ty += 10.5; }
    ty = y + HC - 26;
    doc.texto(x + 8, ty, 'R$ ' + brl(p.preco), { tam: 13, bold: true, cor: CARVAO });
    const extra = [p.unidade, Number(p.embalagem) > 1 ? `cx ${qtd(p.embalagem)}` : '', Number(p.ipi_pct) ? `IPI ${p.ipi_pct}%` : '']
      .filter(Boolean).join('  •  ');
    doc.texto(x + LC - 8, ty, extra, { tam: 7, align: 'right', cor: SUAVE, max: LC - 90 });
    i++;
  }

  if (!produtos.length) doc.texto(LARGURA / 2, 300, 'Nenhum produto cadastrado para esta representada.', { tam: 11, align: 'center', cor: SUAVE });

  // rodapé em todas as páginas
  const total = doc.paginas.length;
  doc.paginas.forEach((pag, idx) => {
    const antes = doc.buf; doc.buf = pag;
    doc.linha(M, ALTURA - 34, LARGURA - M, ALTURA - 34);
    doc.texto(M, ALTURA - 22, [empresa.empresa_nome, empresa.empresa_telefone, empresa.empresa_email].filter(Boolean).join('  •  '),
      { tam: 7, cor: SUAVE });
    doc.texto(LARGURA - M, ALTURA - 22, `Página ${idx + 1} de ${total}  •  preços sujeitos a alteração`, { tam: 7, align: 'right', cor: SUAVE });
    doc.buf = antes;
  });

  return doc.gerar();
}

/**
 * Relatório de vendas do período.
 * @param {object} d { periodo:{de,ate,rotulo}, resumo, meses, representadas, clientes, produtos, pedidos, empresa, logo, filtros }
 */
function gerarRelatorioPDF(d) {
  const { periodo, resumo, meses, representadas, clientes, produtos, pedidos, empresa } = d;
  const doc = new Doc();
  const M = 36;
  const LU = LARGURA - 2 * M;
  let logo = null;
  if (d.logo) { try { logo = lerImagem(d.logo); } catch { logo = null; } }

  const cabecalho = () => {
    if (logo) {
      const altMax = 40, largMax = 200;
      let h = altMax, w = (logo.largura / logo.altura) * h;
      if (w > largMax) { w = largMax; h = (logo.altura / logo.largura) * w; }
      doc.imagem(logo, M, 14 + (altMax - h) / 2, w, h);
    } else {
      doc.texto(M, 38, empresa.empresa_nome || '', { tam: 14, bold: true, cor: CARVAO });
    }
    doc.texto(LARGURA - M, 28, 'RELATÓRIO DE VENDAS', { tam: 11.5, bold: true, align: 'right', cor: CARVAO });
    doc.texto(LARGURA - M, 44, periodo.rotulo, { tam: 10, bold: true, align: 'right', cor: CARVAO });
    if (d.filtros) doc.texto(LARGURA - M, 58, d.filtros, { tam: 7.5, align: 'right', cor: SUAVE });
    doc.retangulo(M, 68, LU, 2.2, CARVAO);
  };

  let y = 0;
  const espaco = (altura) => { if (y + altura > ALTURA - 60) { doc.novaPagina(); cabecalho(); y = 84; } };

  const titulo = (txt) => {
    espaco(40);
    y += 6;
    doc.retangulo(M, y, LU, 15, CINZA);
    doc.texto(M + 7, y + 10.5, txt, { tam: 8, bold: true, cor: CARVAO });
    y += 15;
  };

  /** colunas: [{t, l(largura), a(alinhamento)}] ; linhas: array de arrays */
  const tabela = (colunas, linhas, rodape) => {
    const posX = [];
    let acc = M;
    for (const c of colunas) { posX.push(c.a === 'right' ? acc + c.l - 6 : acc + 6); acc += c.l; }
    espaco(28);
    doc.retangulo(M, y, LU, 14, [1, 1, 1]);
    colunas.forEach((c, i) => doc.texto(posX[i], y + 9.5, c.t, { tam: 7, bold: true, cor: SUAVE, align: c.a }));
    doc.linha(M, y + 14, LARGURA - M, y + 14, [0.8, 0.8, 0.83]);
    y += 14;
    let zebra = false;
    for (const l of linhas) {
      espaco(16);
      if (zebra) doc.retangulo(M, y, LU, 14, [0.975, 0.975, 0.98]);
      zebra = !zebra;
      colunas.forEach((c, i) => doc.texto(posX[i], y + 9.5, l[i], { tam: 8, align: c.a, max: c.l - 12, bold: !!c.b }));
      y += 14;
    }
    if (rodape) {
      espaco(18);
      doc.linha(M, y, LARGURA - M, y, [0.8, 0.8, 0.83]);
      colunas.forEach((c, i) => doc.texto(posX[i], y + 11, rodape[i], { tam: 8.5, bold: true, align: c.a, max: c.l - 12 }));
      y += 17;
    }
    y += 4;
  };

  cabecalho();
  y = 84;

  // ---- resumo em cartões
  const cartoes = [
    ['Faturamento', 'R$ ' + brl(resumo.total)],
    ['Pedidos', String(resumo.pedidos)],
    ['Ticket médio', 'R$ ' + brl(resumo.ticket)],
    ['Clientes', String(resumo.clientes)],
    ['Comissão', 'R$ ' + brl(resumo.comissao)],
  ];
  const lc = (LU - 4 * 8) / 5;
  cartoes.forEach(([rot, val], i) => {
    const x = M + i * (lc + 8);
    doc.retangulo(x, y, lc, 46, [0.975, 0.975, 0.98]);
    doc.texto(x + 8, y + 15, rot.toUpperCase(), { tam: 6.5, bold: true, cor: SUAVE });
    doc.texto(x + 8, y + 34, val, { tam: 12, bold: true, cor: CARVAO, max: lc - 14 });
  });
  y += 56;

  if (meses && meses.length > 1) {
    titulo('FATURAMENTO POR MÊS');
    tabela(
      [{ t: 'Mês', l: 150 }, { t: 'Pedidos', l: 90, a: 'right' }, { t: 'Faturamento', l: 140, a: 'right' },
       { t: 'Meta', l: 110, a: 'right' }, { t: '% meta', l: 33.28, a: 'right' }],
      meses.map(m => [m.rotulo, String(m.pedidos), 'R$ ' + brl(m.total), m.meta ? 'R$ ' + brl(m.meta) : '-',
        m.meta ? ((m.total / m.meta) * 100).toFixed(0) + '%' : '-']),
      ['TOTAL', String(resumo.pedidos), 'R$ ' + brl(resumo.total), '', '']
    );
  }

  if (representadas && representadas.length) {
    titulo('POR REPRESENTADA');
    tabela(
      [{ t: 'Representada', l: 210 }, { t: 'Pedidos', l: 80, a: 'right' }, { t: 'Faturamento', l: 120, a: 'right' },
       { t: 'Participação', l: 113.28, a: 'right' }],
      representadas.map(r => [r.nome, String(r.pedidos), 'R$ ' + brl(r.total),
        resumo.total ? ((r.total / resumo.total) * 100).toFixed(1) + '%' : '-'])
    );
  }

  if (clientes && clientes.length) {
    titulo('CLIENTES QUE MAIS COMPRARAM');
    tabela(
      [{ t: 'Cliente', l: 260 }, { t: 'Cidade', l: 110 }, { t: 'Pedidos', l: 65, a: 'right' }, { t: 'Total', l: 88.28, a: 'right' }],
      clientes.map(c => [c.nome, c.cidade || '-', String(c.pedidos), 'R$ ' + brl(c.total)])
    );
  }

  if (produtos && produtos.length) {
    titulo('PRODUTOS MAIS VENDIDOS');
    tabela(
      [{ t: 'Produto', l: 250 }, { t: 'Código', l: 80 }, { t: 'Qtd', l: 80, a: 'right' }, { t: 'Total', l: 113.28, a: 'right' }],
      produtos.map(p => [p.descricao, p.codigo || '-', qtd(p.quantidade), 'R$ ' + brl(p.total)])
    );
  }

  if (pedidos && pedidos.length) {
    titulo('PEDIDOS DO PERÍODO');
    tabela(
      [{ t: 'Número', l: 85 }, { t: 'Data', l: 55 }, { t: 'Cliente', l: 155 }, { t: 'Representada', l: 105 },
       { t: 'Situação', l: 50 }, { t: 'Total', l: 73.28, a: 'right' }],
      pedidos.map(p => [p.numero, dataBR(p.data_emissao), p.cliente, p.representada, p.status, brl(p.total)])
    );
  }

  const total = doc.paginas.length;
  doc.paginas.forEach((pag, idx) => {
    const antes = doc.buf; doc.buf = pag;
    doc.linha(M, ALTURA - 40, LARGURA - M, ALTURA - 40);
    doc.texto(M, ALTURA - 28, [empresa.empresa_nome, empresa.empresa_telefone].filter(Boolean).join('  •  '), { tam: 7, cor: SUAVE });
    doc.texto(LARGURA - M, ALTURA - 28, `Emitido em ${new Date().toLocaleString('pt-BR')}  •  página ${idx + 1} de ${total}`,
      { tam: 7, align: 'right', cor: SUAVE });
    doc.buf = antes;
  });

  return doc.gerar();
}

module.exports = { gerarPedidoPDF, gerarCatalogoPDF, gerarRelatorioPDF, formatarCNPJ, brl, dataBR };

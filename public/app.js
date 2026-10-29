'use strict';
/* =========================================================================
   Sistema de Representação Comercial — interface
   ========================================================================= */

const $ = (s, e = document) => e.querySelector(s);
const $$ = (s, e = document) => [...e.querySelectorAll(s)];

const estado = { usuario: null, config: {}, representadas: [], usuarios: [], temLogo: false, logoVersao: 0 };

/* ------------------------------------------------------------- utilidades */
async function api(metodo, caminho, corpo) {
  const r = await fetch('/api' + caminho, {
    method: metodo,
    headers: corpo ? { 'Content-Type': 'application/json' } : {},
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  if (r.status === 401) { mostrarLogin(); throw new Error('Sessão expirada'); }
  const tipo = r.headers.get('content-type') || '';
  const dados = tipo.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error(dados?.erro || 'Erro na operação');
  return dados;
}
const get = (c) => api('GET', c);

const n = (v) => Number(v || 0);
const dinheiro = (v) => n(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const numero = (v, d = 0) => n(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: Math.max(d, 3) });
const curto = (v) => {
  const x = n(v);
  if (Math.abs(x) >= 1e6) return 'R$ ' + (x / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  if (Math.abs(x) >= 1000) return 'R$ ' + (x / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  return dinheiro(x);
};
const pct = (v) => n(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

/* ---- valores digitados no padrão brasileiro (35.000,00 e não 35000.00) ---- */
/** Escreve o número como o brasileiro lê: 35.000,00 (vazio continua vazio) */
const moedaBR = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)))
  ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Lê o que a pessoa digitou aceitando 35.000,00 / 35000,00 / 35000 / 35.000 */
function numBR(txt) {
  if (typeof txt === 'number') return txt;
  let s = String(txt ?? '').trim().replace(/[R$\s ]/g, '');
  if (!s) return 0;
  const negativo = /^-/.test(s);
  s = s.replace(/[^\d.,]/g, '');
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');          // vírgula é a casa decimal
  } else if (s.includes('.')) {
    const partes = s.split('.');
    const ultima = partes[partes.length - 1];
    // "35.000" e "1.234.567" são milhares; "35.5" é decimal
    if (partes.length > 2 || ultima.length === 3) s = partes.join('');
  }
  const v = Number(s);
  return Number.isNaN(v) ? 0 : (negativo ? -v : v);
}
/** Formata o campo assim que a pessoa sai dele */
function ligarCamposBR(seletor, aoMudar) {
  $$(seletor).forEach(el => {
    el.addEventListener('focus', () => { if (el.value) el.value = String(numBR(el.value)).replace('.', ','); el.select?.(); });
    el.addEventListener('blur', () => { el.value = el.value.trim() === '' ? '' : moedaBR(numBR(el.value)); aoMudar?.(); });
  });
}
const dataBR = (s) => (s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10).split('-').reverse().join('/') : (s || '-'));
const hojeISO = () => new Date().toLocaleDateString('sv-SE');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cnpjFmt = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v || '';
};

function aviso(msg, tipo = '') {
  const d = document.createElement('div');
  d.className = 'aviso ' + tipo; d.textContent = msg;
  $('#avisos').appendChild(d);
  setTimeout(() => d.remove(), 4200);
}
const erro = (e) => aviso(e?.message || e, 'erro');
const ok = (m) => aviso(m, 'ok');

function abrirModal(html) {
  $('#modal-corpo').innerHTML = html;
  $('#modal').classList.remove('oculto');
  $('#dica')?.classList.remove('on');   // a dica do gráfico ficava flutuando por cima do modal
  setTimeout(() => $('#modal-corpo input:not([type=hidden])')?.focus(), 60);
}
function fecharModal() { $('#modal').classList.add('oculto'); $('#modal-corpo').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.classList.contains('modal-fechar')) fecharModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

const dadosForm = (form) => {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    o[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : (el.type === 'number' ? (el.value === '' ? 0 : Number(el.value)) : el.value);
  }
  return o;
};

/** Reduz a imagem no navegador antes de enviar (economiza espaço e deixa rápido) */
function reduzirImagem(arquivo, max = 900, qualidade = 0.82) {
  return new Promise((resolver, falhar) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > max || h > max) { const f = Math.min(max / w, max / h); w = Math.round(w * f); h = Math.round(h * f); }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolver(c.toDataURL('image/jpeg', qualidade));
      };
      img.onerror = () => falhar(new Error('Não foi possível ler a imagem.'));
      img.src = leitor.result;
    };
    leitor.onerror = () => falhar(new Error('Não foi possível abrir o arquivo.'));
    leitor.readAsDataURL(arquivo);
  });
}
const fotoProduto = (p) => p.imagem
  ? `<img class="foto-prod" src="/api/produtos/${p.id}/imagem?v=${encodeURIComponent(p.imagem)}" alt="">`
  : '<span class="foto-prod vazia">sem foto</span>';
/** Miniatura da logomarca da representada (lista e cabeçalho do pedido) */
const logoRep = (r) => r && r.logo
  ? `<img class="logo-rep" src="/api/representadas/${r.id}/logo?v=${encodeURIComponent(r.logo)}" alt="${esc(r.nome || '')}">`
  : '<span class="logo-rep vazia">sem logo</span>';

const ETIQUETAS = {
  rascunho: ['etq-cinza', 'Rascunho'], aberto: ['etq-azul', 'Aberto'], enviado: ['etq-laranja', 'Enviado'],
  faturado: ['etq-verde', 'Faturado'], cancelado: ['etq-vermelha', 'Cancelado'],
  enviada: ['etq-laranja', 'Enviada'], ganha: ['etq-verde', 'Ganha'], perdida: ['etq-vermelha', 'Perdida'],
};
const etq = (s) => { const [c, t] = ETIQUETAS[s] || ['etq-cinza', s]; return `<span class="etq ${c}">${t}</span>`; };
const barraCor = (p) => (p >= 100 ? 'ok' : p >= 70 ? '' : p >= 40 ? 'alerta' : 'ruim');
const ehAdmin = () => estado.usuario?.papel === 'admin';
const soAdmin = '<span style="color:var(--suave);font-size:12.5px">Somente o administrador edita este cadastro.</span>';


/* ------------------------------------------------------------- marca */
const LOGO_SVG = (contra) => `<svg viewBox="0 0 430 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="INOVE Representações">
  <rect x="2" y="2" width="52" height="24" fill="currentColor"/>
  <rect x="3.3" y="33.3" width="49.4" height="103.4" fill="none" stroke="currentColor" stroke-width="2.6"/>
  <text x="59" y="136" font-family="Arial Black, Arial Bold, Arial, Helvetica, sans-serif" font-weight="900"
        font-size="116" letter-spacing="-2" fill="currentColor">NOVE</text>
  <rect x="2" y="147" width="426" height="51" fill="currentColor"/>
  <text x="215" y="183" text-anchor="middle" font-family="Arial, Helvetica, sans-serif"
        font-size="31" letter-spacing="4" fill="${contra}">REPRESENTA\u00c7\u00d5ES</text>
</svg>`;

function marcaHTML() {
  // menu e login ficam os dois sobre fundo escuro: o logo enviado vai numa
  // plaquinha branca para não sumir, e o SVG usa o escuro como contraste.
  if (estado.temLogo) return `<span class="chip"><img src="/api/logo?v=${estado.logoVersao}" alt="Logo da empresa"></span>`;
  return LOGO_SVG('#1b1a18');
}
async function verificarLogo() {
  try { const r = await fetch('/api/logo?t=' + Date.now()); estado.temLogo = r.status === 200; }
  catch { estado.temLogo = false; }
  estado.logoVersao = Date.now();
  pintarMarca();
}
function pintarMarca() {
  const m = $('#marca-menu'), l = $('#marca-login');
  if (m) m.innerHTML = marcaHTML();
  if (l) l.innerHTML = marcaHTML();
}

/* ------------------------------------------------------------- sess\u00e3o */
async function iniciar() {
  try {
    const r = await get('/eu');
    estado.usuario = r.usuario; estado.config = r.config;
    // senha temporária: o servidor bloqueia tudo até trocar, então nem carrega o resto
    if (r.usuario.trocar_senha) return trocaObrigatoria();
    $('#tela-login').classList.add('oculto');
    $('#app').classList.remove('oculto');
    $('#nome-usuario').textContent = r.usuario.nome;
    $('#papel-usuario').textContent = r.usuario.papel;
    $('#avatar-usuario').textContent = iniciais(r.usuario.nome);
    estado.representadas = await get('/representadas');
    try { estado.usuarios = await get('/usuarios'); } catch { estado.usuarios = []; }
    contarAgenda();
    rotear();
  } catch { mostrarLogin(); }
}

/** Entrou com senha temporária: define a nova antes de qualquer tela */
function trocaObrigatoria() {
  $('#app').classList.add('oculto');
  $('#tela-login').classList.remove('oculto');
  const card = $('#form-login');
  card.dataset.modo = 'troca';
  card.innerHTML = `
    <div>
      <h2>Defina sua senha</h2>
      <p class="sub">Você entrou com uma senha temporária. Escolha uma senha sua para continuar.</p>
    </div>
    <label>Senha temporária<input type="password" id="tr-atual" required autocomplete="current-password"></label>
    <label>Nova senha<input type="password" id="tr-nova" required minlength="4" autocomplete="new-password"></label>
    <label>Repita a nova senha<input type="password" id="tr-nova2" required minlength="4" autocomplete="new-password"></label>
    <button class="btn btn-primario btn-bloco" type="submit">Salvar e entrar</button>
    <div class="erro" id="erro-login"></div>
    <p class="login-ajuda"><a href="#" id="tr-sair">Sair</a></p>`;
  $('#tr-sair').addEventListener('click', async (e) => {
    e.preventDefault(); await api('POST', '/logout'); location.reload();
  });
  card.onsubmit = async (e) => {
    e.preventDefault();
    const nova = $('#tr-nova').value;
    if (nova.length < 4) return ($('#erro-login').textContent = 'A nova senha precisa ter ao menos 4 caracteres.');
    if (nova !== $('#tr-nova2').value) return ($('#erro-login').textContent = 'As duas senhas não são iguais.');
    try {
      await api('POST', '/senha', { atual: $('#tr-atual').value, nova });
      location.reload();
    } catch (x) { $('#erro-login').textContent = x.message; }
  };
}

/* ---- "Esqueci minha senha": prova quem é pela pergunta de segurança ---- */
$('#link-esqueci').addEventListener('click', (e) => {
  e.preventDefault();
  abrirModal(`<h3>Esqueci minha senha</h3>
    <div class="modal-corpo">
      <p class="modal-sub">Informe o e-mail cadastrado. Se você tiver uma pergunta de segurança,
        respondendo certo já define uma senha nova.</p>
      <label class="campo">E-mail
        <input type="email" id="rc-email" value="${esc($('#form-login [name=email]')?.value || '')}"
          autocomplete="username"></label>
      <div id="rc-passo2" class="oculto">
        <label class="campo" id="rc-rot-pergunta">Pergunta
          <input type="text" id="rc-resposta" placeholder="sua resposta" autocomplete="off"></label>
        <div class="grade g2" style="margin-top:12px">
          <label class="campo">Nova senha<input type="password" id="rc-nova" minlength="4" autocomplete="new-password"></label>
          <label class="campo">Repita a nova senha<input type="password" id="rc-nova2" minlength="4" autocomplete="new-password"></label>
        </div>
      </div>
      <div class="erro" id="rc-erro" style="color:var(--vermelho-txt);font-size:13px"></div>
      <div class="modal-acoes">
        <button class="btn" onclick="window.__fechar()">Cancelar</button>
        <button class="btn btn-primario" id="rc-ok">Continuar</button>
      </div>
    </div>`);

  let passo = 1;
  const falha = (m) => { $('#rc-erro').textContent = m; };
  $('#rc-ok').addEventListener('click', async () => {
    falha('');
    if (passo === 1) {
      const email = $('#rc-email').value.trim();
      if (!email) return falha('Informe o e-mail cadastrado.');
      try {
        const r = await get('/recuperar?email=' + encodeURIComponent(email));
        if (!r.tem_pergunta) return falha(r.aviso);
        $('#rc-rot-pergunta').firstChild.textContent = r.pergunta + ' ';
        $('#rc-passo2').classList.remove('oculto');
        $('#rc-ok').textContent = 'Salvar nova senha';
        $('#rc-email').readOnly = true;
        $('#rc-resposta').focus();
        passo = 2;
      } catch (x) { falha(x.message); }
      return;
    }
    const nova = $('#rc-nova').value;
    if (nova.length < 4) return falha('A nova senha precisa ter ao menos 4 caracteres.');
    if (nova !== $('#rc-nova2').value) return falha('As duas senhas não são iguais.');
    try {
      await api('POST', '/recuperar', { email: $('#rc-email').value.trim(), resposta: $('#rc-resposta').value, nova });
      fecharModal();
      ok('Senha alterada! Entre com a nova senha.');
      $('#form-login [name=senha]')?.focus();
    } catch (x) { falha(x.message); }
  });
  setTimeout(() => $('#rc-email').focus(), 80);
});
function mostrarLogin() {
  $('#app').classList.add('oculto');
  $('#tela-login').classList.remove('oculto');
}
$('#form-login').addEventListener('submit', async e => {
  // o mesmo <form> vira a tela de troca obrigatória; lá quem responde é o onsubmit dela
  if (e.currentTarget.dataset.modo === 'troca') return;
  e.preventDefault();
  $('#erro-login').textContent = '';
  try { await api('POST', '/login', dadosForm(e.target)); location.hash = '#/painel'; await iniciar(); }
  catch (x) { $('#erro-login').textContent = x.message; }
});
$('#btn-sair').addEventListener('click', async () => { await api('POST', '/logout'); location.reload(); });
$('#btn-menu').addEventListener('click', () => { $('#menu').classList.toggle('aberto'); $('#fundo-menu').classList.toggle('on'); });
$('#fundo-menu').addEventListener('click', () => { $('#menu').classList.remove('aberto'); $('#fundo-menu').classList.remove('on'); });
$$('#menu .item').forEach(a => a.addEventListener('click', () => { location.hash = '#/' + a.dataset.tela; }));

/* ------------------------------------------------------------- rotas */
const telas = {};
async function rotear() {
  // com senha temporária o servidor barra tudo: não adianta tentar abrir tela
  if (estado.usuario?.trocar_senha) return;
  const partes = (location.hash.replace(/^#\/?/, '') || 'painel').split('/');
  const nome = partes[0].split('?')[0];   // "#/comissoes?de=..." → "comissoes"
  $$('#menu .item').forEach(a => a.classList.toggle('ativo', a.dataset.tela === nome ||
    (nome === 'pedido' && a.dataset.tela === 'pedidos') || (nome === 'cotacao' && a.dataset.tela === 'cotacoes')));
  $('#menu').classList.remove('aberto'); $('#fundo-menu').classList.remove('on');
  $('#topo-acoes').innerHTML = '';
  $('#tela').innerHTML = '<div class="vazio">Carregando…</div>';
  const fn = telas[nome] || telas.painel;
  try { await fn(partes.slice(1)); } catch (e) { erro(e); $('#tela').innerHTML = `<div class="vazio"><b>Não foi possível carregar</b>${esc(e.message)}</div>`; }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', rotear);

/** Primeira letra do primeiro e do último nome, para o avatar do menu */
const iniciais = (nome) => {
  const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
  return ((p[0] || '')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?';
};
/** Grupo do menu a que cada tela pertence — aparece acima do título */
const SECOES = {
  painel: 'Vendas', faturamento: 'Vendas', relatorios: 'Vendas', comissoes: 'Vendas',
  agenda: 'Lançamentos',
  pedidos: 'Lançamentos', cotacoes: 'Lançamentos', pedido: 'Lançamentos', cotacao: 'Lançamentos',
  clientes: 'Cadastros', produtos: 'Cadastros', representadas: 'Cadastros',
  metas: 'Planejamento', historico: 'Planejamento', config: 'Sistema',
};
const titulo = (t) => {
  $('#titulo-tela').textContent = t;
  const nome = (location.hash.replace(/^#\/?/, '') || 'painel').split('/')[0].split('?')[0];
  $('#secao-tela').textContent = SECOES[nome] || '';
};
const acoes = (html) => { $('#topo-acoes').innerHTML = html; };
const pintar = (html) => { $('#tela').innerHTML = html; };

/* =========================================================================
   GRÁFICOS — paleta e componentes (sem biblioteca externa)
   ========================================================================= */
// Paleta categórica validada para daltonismo. A ordem é fixa: a cor segue a
// entidade, nunca a posição no ranking.
// O redesign é monocromático: a barra é grafite e a cor fica reservada para
// indicar situação (meta batida, comissão recebida, cotação em aberto).
const COR_REALIZADO = '#1f1e1c';
const COR_META = '#dcd9d2';
const COR_ANTERIOR = '#9fb0c6';
const COR_OK = '#1d7a55';        // recebido / ganho
const COR_ESPERA = '#d99a3d';    // pendente
const COR_ABERTA = '#5a6f8f';    // cotação em aberto

/** Dica flutuante: qualquer elemento com data-dica mostra o texto ao passar o mouse */
function ligarDicas() {
  if (window.__dicaPronta) return;
  window.__dicaPronta = true;
  const d = document.createElement('div');
  d.id = 'dica'; d.setAttribute('role', 'tooltip');
  document.body.appendChild(d);
  document.addEventListener('mouseover', e => {
    const alvo = e.target.closest('[data-dica]');
    if (!alvo) return;
    d.innerHTML = alvo.dataset.dica;
    d.classList.add('on');
  });
  document.addEventListener('mousemove', e => {
    if (!d.classList.contains('on')) return;
    const larg = d.offsetWidth, alt = d.offsetHeight;
    d.style.left = Math.min(window.innerWidth - larg - 10, Math.max(8, e.clientX + 14)) + 'px';
    d.style.top = Math.max(8, e.clientY - alt - 12) + 'px';
  });
  document.addEventListener('mouseout', e => {
    if (e.target.closest('[data-dica]')) d.classList.remove('on');
  });
}

/** Legenda de gráfico, para ficar no canto direito do título do cartão */
const legendaGr = (itens) => `<span class="legenda">${itens
  .map(i => `<span><i style="background:${i.cor}"></i>${i.nome}</span>`).join('')}</span>`;

/** Colunas agrupadas: realizado x meta, mês a mês */
function graficoColunas(serie, ano) {
  const max = Math.max(...serie.map(s => Math.max(s.realizado, s.meta)), 1);
  const mesAtual = new Date().getMonth() + 1;
  const esteAno = ano === new Date().getFullYear();
  return `<div class="tabela-rolagem"><div class="gr-plot">
    ${serie.map(s => {
      const p = s.meta ? (s.realizado / s.meta) * 100 : 0;
      const destaque = esteAno && s.mes === mesAtual;
      return `<div class="gr-col${destaque ? ' agora' : ''}" data-dica="<b>${s.nome}/${ano}</b><br>Realizado ${dinheiro(s.realizado)}<br>Meta ${dinheiro(s.meta)}${s.meta ? '<br>' + pct(p) + ' da meta' : ''}">
        <div class="gr-topo">${s.realizado > 0 ? curto(s.realizado).replace('R$ ', '') : ''}</div>
        <div class="gr-barras">
          <span class="gr-b${s.realizado > 0 ? '' : ' zero'}" style="height:${(s.realizado / max) * 100}%"></span>
          <span class="gr-b meta${s.meta > 0 ? '' : ' zero'}" style="height:${(s.meta / max) * 100}%"></span>
        </div>
        <div class="gr-rot">${s.nome}</div>
      </div>`;
    }).join('')}
  </div></div>`;
}

/** Barras horizontais com rótulo e valor visíveis */
function graficoBarras(itens) {
  const max = Math.max(...itens.map(i => i.valor), 1);
  const soma = itens.reduce((s, i) => s + i.valor, 0);
  if (!itens.length || soma <= 0) return '<div class="vazio">Sem vendas no período.</div>';
  return `<div class="gr-h">${itens.map((i) => `
    <div class="gr-h-linha" data-dica="<b>${esc(i.nome)}</b><br>${dinheiro(i.valor)}${soma ? '<br>' + pct((i.valor / soma) * 100) + ' do total' : ''}">
      <span class="gr-h-rot" title="${esc(i.nome)}">${esc(i.nome)}</span>
      <span class="gr-h-trilho"><span class="gr-h-barra" style="width:${(i.valor / max) * 100}%"></span></span>
      <span class="gr-h-val">${dinheiro(i.valor)}<small>· ${pct((i.valor / soma) * 100)}</small></span>
    </div>`).join('')}</div>`;
}

/** Barra de proporção com duas partes rotuladas */
function graficoProporcao(partes) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (total <= 0) return '<div class="vazio">Nada a mostrar ainda.</div>';
  return `
    <div class="gr-pilha">${partes.map(p => `
      <span style="width:${(p.valor / total) * 100}%;background:${p.cor}"
        data-dica="<b>${esc(p.nome)}</b><br>${dinheiro(p.valor)}<br>${pct((p.valor / total) * 100)} do total"></span>`).join('')}
    </div>
    <div class="gr-legenda">${partes.map(p => `
      <div>
        <div class="rot"><span class="ponto" style="background:${p.cor}"></span>${esc(p.nome)}</div>
        <div class="val">${dinheiro(p.valor)}</div>
        ${p.obs ? `<div class="qtd">${p.obs}</div>` : ''}
      </div>`).join('')}
    </div>`;
}

/* =========================================================================
   PAINEL
   ========================================================================= */
telas.painel = async () => {
  titulo('Painel');
  const agora = new Date();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const ano = Number(q.get('ano') || agora.getFullYear());
  const mes = Number(q.get('mes') || agora.getMonth() + 1);
  const rep = q.get('rep') || '';
  const modo = ['mes', 'ano', 'intervalo'].includes(q.get('modo')) ? q.get('modo') : 'mes';
  const f2 = (n) => String(n).padStart(2, '0');
  const de = q.get('de') || `${ano}-${f2(mes)}-01`;
  const ate = q.get('ate') || `${ano}-${f2(mes)}-${new Date(ano, mes, 0).getDate()}`;

  const par = new URLSearchParams({ modo, ano, mes });
  if (modo === 'intervalo') { par.set('de', de); par.set('ate', ate); }
  if (rep) par.set('representada_id', rep);
  const d = await get('/painel?' + par);
  const per = d.periodo;

  const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const pDia = d.dia.meta ? (d.dia.realizado / d.dia.meta) * 100 : 0;
  const pPer = per.meta ? (per.realizado / per.meta) * 100 : 0;
  const pAno = d.ano_atual.meta ? (d.ano_atual.realizado / d.ano_atual.meta) * 100 : 0;
  const com = d.comissoes || { pendente: 0, recebida: 0, total: 0, qtd_pendente: 0, qtd_recebida: 0 };

  acoes(`
    <span class="segmentado" id="f-modo" data-valor="${modo}">
      ${[['mes', 'Mês'], ['ano', 'Ano'], ['intervalo', 'Período']].map(([v, t]) =>
        `<button type="button" data-modo="${v}" class="${modo === v ? 'ativo' : ''}">${t}</button>`).join('')}
    </span>
    <select id="f-ano" style="width:auto" ${modo === 'intervalo' ? 'hidden' : ''}>${
      [...new Set([...d.historico_anos.map(h => h.ano), ano, agora.getFullYear()])].sort((a, b) => b - a)
      .map(a => `<option value="${a}" ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
    <select id="f-mes" style="width:auto" ${modo === 'mes' ? '' : 'hidden'}>${
      MES.map((m, i) => `<option value="${i + 1}" ${i + 1 === mes ? 'selected' : ''}>${m}</option>`).join('')}</select>
    <input type="date" id="f-de" value="${de}" style="width:auto" ${modo === 'intervalo' ? '' : 'hidden'} title="Data inicial">
    <input type="date" id="f-ate" value="${ate}" style="width:auto" ${modo === 'intervalo' ? '' : 'hidden'} title="Data final">
    <select id="f-rep" style="width:auto"><option value="">Todas representadas</option>
      ${estado.representadas.map(r => `<option value="${r.id}" ${String(r.id) === rep ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select>
    <a class="btn btn-primario" href="#/pedido/novo">+ Pedido</a>`);

  const repsAno = [...d.por_representada].filter(r => r.realizado_ano > 0).sort((a, b) => b.realizado_ano - a.realizado_ano);

  pintar(`
  <div id="painel-agenda"></div>
  <div class="kpis k6">
    <div class="kpi faixa-azul"><div class="rot">Hoje — ${dataBR(d.dia.data)}</div>
      <div class="val">${dinheiro(d.dia.realizado)}</div>
      <div class="obs">Meta diária ${dinheiro(d.dia.meta)} • ${d.dia.qtd} pedido(s)</div>
      <div class="barra ${barraCor(pDia)}"><span style="width:${Math.min(100, pDia)}%"></span></div></div>

    <div class="kpi faixa-azul"><div class="rot">${esc(per.rotulo)}</div>
      <div class="val">${dinheiro(per.realizado)}</div>
      <div class="obs">${per.meta ? `Meta ${dinheiro(per.meta)} • ${pct(pPer)} atingido` : `${per.dias} dia(s) no período`}</div>
      <div class="barra ${barraCor(pPer)}"><span style="width:${Math.min(100, pPer)}%"></span></div></div>

    <div class="kpi faixa-azul"><div class="rot">Ano ${ano}</div>
      <div class="val">${dinheiro(d.ano_atual.realizado)}</div>
      <div class="obs">Meta ${dinheiro(d.ano_atual.meta)} • falta ${dinheiro(d.ano_atual.falta)}</div>
      <div class="barra ${barraCor(pAno)}"><span style="width:${Math.min(100, pAno)}%"></span></div></div>

    <div class="kpi faixa-laranja"><div class="rot">Projeção do período</div>
      <div class="val">${dinheiro(per.projecao)}</div>
      <div class="obs">Média/dia ${dinheiro(per.media_dia)}${per.meta ? ` • falta ${dinheiro(per.falta)}` : ''}</div></div>

    <div class="kpi faixa-verde"><div class="rot">Ticket médio do período</div>
      <div class="val">${dinheiro(per.ticket)}</div>
      <div class="obs">${per.qtd} pedidos • ${per.clientes} clientes</div></div>

    <div class="kpi faixa-roxa"><div class="rot">Comissão a receber</div>
      <div class="val">${dinheiro(com.pendente)}</div>
      <div class="obs">${com.qtd_pendente} pedido(s) • <a href="#/comissoes">ver comissões</a></div></div>
  </div>

  <div class="cartao"><div class="cartao-tit">Realizado x Meta — ${ano}
      ${legendaGr([{ nome: 'Realizado', cor: COR_REALIZADO }, { nome: 'Meta', cor: COR_META }])}</div>
    <div class="cartao-corpo">${graficoColunas(d.serie, ano)}</div></div>

  <div class="grade cartoes">
    <div class="cartao"><div class="cartao-tit">Quem mais vendeu em ${ano}</div>
      <div class="cartao-corpo">${graficoBarras(repsAno.map(r => ({ nome: r.nome, valor: r.realizado_ano })))}</div></div>

    <div class="cartao"><div class="cartao-tit">Comissões — ${esc(per.rotulo)}</div>
      <div class="cartao-corpo">
        ${graficoProporcao([
          { nome: 'Recebida', valor: com.recebida, cor: COR_OK, obs: com.qtd_recebida + ' pedido(s)' },
          { nome: 'A receber', valor: com.pendente, cor: COR_ESPERA, obs: com.qtd_pendente + ' pedido(s)' },
        ])}
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <a class="btn btn-peq" href="#/comissoes">Abrir tela de comissões</a>
        </div>
      </div></div>
  </div>

  <div class="cartao"><div class="cartao-tit">Desempenho por representada — ${esc(per.rotulo)}</div>
    <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
      <thead><tr><th>Representada</th><th class="dir">Realizado no período</th><th class="dir">Meta do período</th><th style="width:130px">Atingido</th>
        <th class="dir">Realizado ano</th><th class="dir">Meta ano</th><th class="cen">Pedidos</th></tr></thead>
      <tbody>${d.por_representada.length ? d.por_representada.map((r) => {
        const p = r.meta_periodo ? (r.realizado_periodo / r.meta_periodo) * 100 : 0;
        return `<tr><td><b>${esc(r.nome)}</b></td>
          <td class="dir mono">${dinheiro(r.realizado_periodo)}</td><td class="dir mono">${dinheiro(r.meta_periodo)}</td>
          <td><div class="barra ${barraCor(p)}"><span style="width:${Math.min(100, p)}%"></span></div>
              <small style="color:var(--suave)">${pct(p)}</small></td>
          <td class="dir mono">${dinheiro(r.realizado_ano)}</td><td class="dir mono">${dinheiro(r.meta_ano)}</td>
          <td class="cen">${r.qtd_periodo}</td></tr>`;
      }).join('') : '<tr><td colspan="7" class="vazio">Cadastre suas representadas para começar.</td></tr>'}</tbody>
    </table></div></div></div>

  <div class="grade cartoes">
    <div class="cartao"><div class="cartao-tit">Comparativo por ano</div>
      <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
        <thead><tr><th>Ano</th><th class="dir">Realizado</th><th class="dir">Meta</th><th class="dir">%</th><th class="dir">Var.</th></tr></thead>
        <tbody>${d.historico_anos.length ? d.historico_anos.map((h, i) => {
          const ant = d.historico_anos[i - 1];
          const v = ant && ant.realizado ? ((h.realizado - ant.realizado) / ant.realizado) * 100 : null;
          const p = h.meta ? (h.realizado / h.meta) * 100 : 0;
          return `<tr><td><b>${h.ano}</b></td><td class="dir mono">${dinheiro(h.realizado)}</td>
            <td class="dir mono">${h.meta ? dinheiro(h.meta) : '-'}</td>
            <td class="dir">${h.meta ? `<span class="etq ${p >= 100 ? 'etq-verde' : p >= 70 ? 'etq-laranja' : 'etq-vermelha'}">${pct(p)}</span>` : '-'}</td>
            <td class="dir">${v === null ? '-' : `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${pct(v)}</span>`}</td></tr>`;
        }).join('') : '<tr><td colspan="5" class="vazio">Cadastre o histórico em <b>Histórico</b>.</td></tr>'}</tbody>
      </table></div></div></div>

    <div class="cartao"><div class="cartao-tit">Cotações — ${esc(per.rotulo)}</div><div class="cartao-corpo">
      ${graficoProporcao([
        { nome: 'Ganhas', valor: d.cotacoes.valor_ganhas, cor: COR_OK, obs: d.cotacoes.ganhas + ' cotação(ões)' },
        { nome: 'Em aberto', valor: d.cotacoes.valor_abertas, cor: COR_ABERTA, obs: d.cotacoes.abertas + ' cotação(ões)' },
      ])}
      <div style="margin-top:12px;color:var(--suave);font-size:12.5px">
        Taxa de conversão: <b style="color:var(--texto)">${pct(d.cotacoes.conversao)}</b> • ${d.cotacoes.perdidas} perdida(s)
      </div>
    </div></div>
  </div>

  <div class="grade cartoes">
    <div class="cartao"><div class="cartao-tit">Top 10 clientes — ${esc(per.rotulo)}</div>
      <div class="cartao-corpo">${graficoBarras(d.top_clientes.map(c => ({ nome: c.razao_social, valor: c.total })))}</div></div>

    <div class="cartao"><div class="cartao-tit">Top 10 produtos — ${esc(per.rotulo)}</div>
      <div class="cartao-corpo">${graficoBarras(d.top_produtos.map(p => ({ nome: p.descricao, valor: p.total })))}</div></div>
  </div>

  <div class="cartao"><div class="cartao-tit">Últimos lançamentos <a href="#/pedidos">Ver todos</a></div>
    <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
      <thead><tr><th>Número</th><th>Cliente</th><th>Representada</th><th class="cen">Situação</th><th>Data</th><th class="dir">Total</th></tr></thead>
      <tbody>${d.ultimos_pedidos.length ? d.ultimos_pedidos.map(p => `
        <tr style="cursor:pointer" onclick="location.hash='#/${p.tipo === 'cotacao' ? 'cotacao' : 'pedido'}/${p.id}'">
          <td><b>${p.numero}</b></td><td>${esc(p.cliente_nome)}</td>
          <td><small>${esc(p.representada_nome)}</small></td>
          <td class="cen">${etq(p.status)}</td><td>${dataBR(p.data_emissao)}</td>
          <td class="dir mono"><b>${dinheiro(p.total)}</b></td></tr>`).join('')
        : '<tr><td colspan="6" class="vazio">Nenhum lançamento ainda.</td></tr>'}</tbody>
    </table></div></div></div>`);

  ligarDicas();
  const aplicar = (modoNovo) => {
    const m = modoNovo || $('#f-modo').dataset.valor;
    const p = new URLSearchParams({ modo: m, ano: $('#f-ano').value, mes: $('#f-mes').value, rep: $('#f-rep').value });
    if (m === 'intervalo') {
      if (!$('#f-de').value || !$('#f-ate').value) return erro('Escolha a data inicial e a data final.');
      p.set('de', $('#f-de').value); p.set('ate', $('#f-ate').value);
    }
    location.hash = '#/painel?' + p; rotear();
  };
  $$('#f-modo button').forEach(b => b.addEventListener('click', () => aplicar(b.dataset.modo)));
  ['#f-ano', '#f-mes', '#f-rep', '#f-de', '#f-ate'].forEach(s => $(s).addEventListener('change', () => aplicar()));

  // compromissos de hoje e amanhã: abrir o sistema de manhã já mostra o dia
  get('/agenda/resumo').then(r => {
    const alvo = $('#painel-agenda'); if (!alvo) return;
    const abertos = (l) => l.filter(c => c.situacao === 'marcado');
    const hj = abertos(r.hoje), am = abertos(r.amanha);
    const pend = r.atrasados.length + r.retornos.length;
    if (!hj.length && !am.length && !pend) return;
    const item = (c, quando) => `<a class="comp" href="#/agenda?dia=${c.data}">
      <div class="comp-hora">${quando}<small>${c.hora || ''}</small></div>
      <div class="comp-corpo"><b>${esc(c.assunto)}</b>
        <small>${esc(c.cliente_fantasia || c.cliente_nome || 'Sem cliente')}</small></div></a>`;
    alvo.innerHTML = `<div class="cartao"><div class="cartao-tit">Compromissos
        <a href="#/agenda">Abrir agenda</a></div>
      <div class="cartao-corpo sem-pad"><div class="lista-comp">
        ${hj.map(c => item(c, 'hoje')).join('')}
        ${am.map(c => item(c, 'amanhã')).join('')}
        ${!hj.length && !am.length ? '<div class="vazio"><b>Nada marcado para hoje nem amanhã</b>A agenda está livre.</div>' : ''}
        ${pend ? `<a class="comp atrasado" href="#/agenda">
          <div class="comp-hora">!</div>
          <div class="comp-corpo"><b>${pend} compromisso(s) precisam de atenção</b>
            <small>passaram da data sem desfecho ou têm retorno vencido</small></div></a>` : ''}
      </div></div></div>`;
  }).catch(() => {});
};

/* =========================================================================
   AGENDA — compromissos com cliente, dentro do sistema
   ========================================================================= */
const DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const f2 = (x) => String(x).padStart(2, '0');
const isoDe = (d) => `${d.getFullYear()}-${f2(d.getMonth() + 1)}-${f2(d.getDate())}`;
const deIso = (s) => { const [a, m, d] = String(s).split('-').map(Number); return new Date(a, m - 1, d); };
const maisDias = (iso, n) => { const d = deIso(iso); d.setDate(d.getDate() + n); return isoDe(d); };
/** "hoje", "amanhã", "ontem" ou "qua, 12/11" — data que a pessoa lê sem contar */
function dataAmigavel(iso) {
  const h = hojeISO();
  if (iso === h) return 'hoje';
  if (iso === maisDias(h, 1)) return 'amanhã';
  if (iso === maisDias(h, -1)) return 'ontem';
  const d = deIso(iso);
  return `${DIAS_SEM[d.getDay()]}, ${f2(d.getDate())}/${f2(d.getMonth() + 1)}`;
}
const ETQ_SIT = { marcado: ['etq-azul', 'Marcado'], realizado: ['etq-verde', 'Realizado'], cancelado: ['etq-cinza', 'Cancelado'] };
const etqSit = (s) => { const [c, t] = ETQ_SIT[s] || ETQ_SIT.marcado; return `<span class="etq ${c}">${t}</span>`; };

/** Contador de compromissos de hoje ao lado de "Agenda" no menu */
async function contarAgenda() {
  const el = $('#menu-agenda'); if (!el) return;
  try {
    const r = await get('/agenda/resumo');
    const n = r.hoje.filter(c => c.situacao === 'marcado').length;
    el.textContent = n || ''; el.classList.toggle('oculto', !n);
  } catch { el.classList.add('oculto'); }
}

/** Formulário de compromisso. `c` nulo = novo. */
function formCompromisso(c, dataPadrao, aoSalvar) {
  const novo = !c;
  c = c || { data: dataPadrao || hojeISO(), hora: '', assunto: '', situacao: 'marcado', retorno_em: '' };
  abrirModal(`<h3>${novo ? 'Novo compromisso' : 'Compromisso'}</h3>
    <form id="form-comp" class="modal-corpo">
      <div class="grade g3">
        <label class="campo">Data *<input type="date" name="data" value="${esc(c.data)}" required></label>
        <label class="campo">Hora<input type="time" name="hora" value="${esc(c.hora || '')}">
          <small class="ajuda">Em branco = sem hora marcada</small></label>
        <label class="campo">Situação<select name="situacao">
          ${Object.entries(ETQ_SIT).map(([v, [, t]]) =>
            `<option value="${v}" ${c.situacao === v ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
      </div>
      <label class="campo">Cliente<select name="cliente_id" id="comp-cli"><option value="">Sem cliente</option></select>
        <small class="ajuda">Deixe em branco para compromisso que não é de cliente (feira, viagem).</small></label>
      <label class="campo">Assunto *
        <input name="assunto" value="${esc(c.assunto)}" required minlength="2"
          placeholder="Apresentar linha nova, fechar pedido do mês, cobrar retorno…"></label>
      <label class="campo">Voltar a procurar em
        <input type="date" name="retorno_em" value="${esc(c.retorno_em || '')}">
        <small class="ajuda">Opcional. Na data, o cliente reaparece na agenda como lembrete.</small></label>
      <div class="modal-acoes">
        ${novo ? '' : '<button type="button" class="btn btn-perigo" id="comp-apagar">Apagar</button>'}
        <button type="button" class="btn" onclick="window.__fechar()">Cancelar</button>
        <button class="btn btn-primario">${novo ? 'Marcar' : 'Salvar'}</button>
      </div>
    </form>`);

  get('/clientes?ativo=1&limite=2000').then(lista => {
    const sel = $('#comp-cli'); if (!sel) return;
    sel.innerHTML = '<option value="">Sem cliente</option>' + lista.map(x =>
      `<option value="${x.id}" ${x.id === c.cliente_id ? 'selected' : ''}>${esc(x.nome_fantasia || x.razao_social)}${x.cidade ? ' — ' + esc(x.cidade) : ''}</option>`).join('');
  }).catch(() => {});

  $('#form-comp').addEventListener('submit', async (e) => {
    e.preventDefault();
    const corpo = dadosForm(e.target);
    corpo.cliente_id = corpo.cliente_id ? Number(corpo.cliente_id) : null;
    try {
      await (novo ? api('POST', '/agenda', corpo) : api('PUT', '/agenda/' + c.id, corpo));
      fecharModal(); ok(novo ? 'Compromisso marcado.' : 'Compromisso salvo.');
      contarAgenda(); aoSalvar?.();
    } catch (x) { erro(x); }
  });
  $('#comp-apagar')?.addEventListener('click', async () => {
    if (!confirm(`Apagar o compromisso “${c.assunto}”?`)) return;
    try { await api('DELETE', '/agenda/' + c.id); fecharModal(); ok('Compromisso apagado.'); contarAgenda(); aoSalvar?.(); }
    catch (x) { erro(x); }
  });
}

telas.agenda = async () => {
  titulo('Agenda');
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(q.get('dia') || '') ? q.get('dia') : hojeISO();
  const base = deIso(dia);
  const ano = base.getFullYear(), mes = base.getMonth();            // mês mostrado no calendário
  const primeiro = isoDe(new Date(ano, mes, 1));
  const ultimo = isoDe(new Date(ano, mes + 1, 0));

  acoes(`<button class="btn btn-primario" id="btn-novo-comp">+ Novo compromisso</button>`);

  const [d, resumo] = await Promise.all([
    get(`/agenda?de=${primeiro}&ate=${maisDias(ultimo, 60)}`),
    get('/agenda/resumo'),
  ]);
  const porDia = {};
  for (const c of d.lista) (porDia[c.data] ||= []).push(c);

  const nomeCli = (c) => c.cliente_nome ? (c.cliente_fantasia || c.cliente_nome) : 'Sem cliente';
  const linha = (c) => `<div class="comp ${c.situacao}" data-abrir="${c.id}">
      <div class="comp-hora">${c.hora || '—'}</div>
      <div class="comp-corpo">
        <b>${esc(c.assunto)}</b>
        <small>${esc(nomeCli(c))}${c.cliente_telefone ? ' • ' + esc(c.cliente_telefone) : ''}</small>
      </div>
      <div class="comp-lado">${etqSit(c.situacao)}
        ${c.situacao === 'marcado' ? `<div class="comp-botoes">
          <button class="btn btn-peq" data-sit="realizado" data-id="${c.id}">Realizado</button>
          <button class="btn btn-peq" data-sit="cancelado" data-id="${c.id}">Cancelar</button></div>` : ''}
      </div>
    </div>`;

  // calendário do mês: ponto no dia que tem compromisso marcado
  const inicioGrade = new Date(ano, mes, 1 - new Date(ano, mes, 1).getDay());
  const celulas = [];
  for (let i = 0; i < 42; i++) {
    const dt = new Date(inicioGrade); dt.setDate(inicioGrade.getDate() + i);
    const iso = isoDe(dt);
    const doMes = dt.getMonth() === mes;
    const lista = (porDia[iso] || []).filter(c => c.situacao !== 'cancelado');
    celulas.push(`<button type="button" class="cal-dia${doMes ? '' : ' fora'}${iso === hojeISO() ? ' hoje' : ''}${iso === dia ? ' sel' : ''}"
      data-dia="${iso}" aria-label="${iso}">${dt.getDate()}${lista.length
        ? `<span class="cal-ponto">${lista.length > 1 ? lista.length : ''}</span>` : ''}</button>`);
  }

  const doDia = (porDia[dia] || []);
  const seguir = d.lista.filter(c => c.data > dia && c.situacao === 'marcado').slice(0, 6);
  const alertas = [...resumo.atrasados, ...resumo.retornos.filter(r => !resumo.atrasados.some(a => a.id === r.id))];

  pintar(`
  ${alertas.length ? `<div class="cartao"><div class="cartao-tit">Precisam de atenção
      <span style="font-weight:400;color:var(--suave);font-size:12.5px">${alertas.length} item(ns)</span></div>
    <div class="cartao-corpo sem-pad"><div class="lista-comp">
      ${resumo.atrasados.map(c => `<div class="comp atrasado" data-abrir="${c.id}">
        <div class="comp-hora">${dataAmigavel(c.data)}</div>
        <div class="comp-corpo"><b>${esc(c.assunto)}</b><small>${esc(nomeCli(c))} — passou da data e continua marcado</small></div>
        <div class="comp-lado"><div class="comp-botoes">
          <button class="btn btn-peq" data-sit="realizado" data-id="${c.id}">Realizado</button>
          <button class="btn btn-peq" data-sit="cancelado" data-id="${c.id}">Cancelar</button></div></div></div>`).join('')}
      ${resumo.retornos.filter(r => !resumo.atrasados.some(a => a.id === r.id)).map(c => `<div class="comp retorno" data-abrir="${c.id}">
        <div class="comp-hora">${dataAmigavel(c.retorno_em)}</div>
        <div class="comp-corpo"><b>Voltar a procurar ${esc(nomeCli(c))}</b><small>combinado em ${dataBR(c.data)} — ${esc(c.assunto)}</small></div>
        <div class="comp-lado"><button class="btn btn-peq btn-primario" data-remarcar="${c.cliente_id || ''}">Marcar visita</button></div></div>`).join('')}
    </div></div></div>` : ''}

  <div class="agenda-grade">
    <div class="cartao">
      <div class="cartao-tit cal-topo">
        <button type="button" class="btn btn-peq" id="cal-ant">‹</button>
        <b>${MES_LONGO[mes]} ${ano}</b>
        <button type="button" class="btn btn-peq" id="cal-prox">›</button>
      </div>
      <div class="cartao-corpo">
        <div class="cal-sem">${DIAS_SEM.map(s => `<span>${s}</span>`).join('')}</div>
        <div class="cal-grade">${celulas.join('')}</div>
        <button type="button" class="btn btn-peq btn-bloco" id="cal-hoje" style="margin-top:10px">Ir para hoje</button>
      </div>
    </div>

    <div class="coluna">
      <div class="cartao"><div class="cartao-tit">${dataAmigavel(dia) === 'hoje' ? 'Hoje' : 'Dia'} — ${dataBR(dia)}
          <span style="font-weight:400;color:var(--suave);font-size:12.5px">${doDia.length} compromisso(s)</span></div>
        <div class="cartao-corpo sem-pad"><div class="lista-comp">
          ${doDia.length ? doDia.map(linha).join('')
            : '<div class="vazio"><b>Nada marcado neste dia</b>Toque em “Novo compromisso” para agendar.</div>'}
        </div></div></div>

      <div class="cartao"><div class="cartao-tit">A seguir</div>
        <div class="cartao-corpo sem-pad"><div class="lista-comp">
          ${seguir.length ? seguir.map(c => `<div class="comp" data-abrir="${c.id}">
            <div class="comp-hora">${dataAmigavel(c.data)}<small>${c.hora || ''}</small></div>
            <div class="comp-corpo"><b>${esc(c.assunto)}</b><small>${esc(nomeCli(c))}</small></div></div>`).join('')
            : '<div class="vazio"><b>Nada marcado daqui para a frente</b>A agenda está livre.</div>'}
        </div></div></div>
    </div>
  </div>`);

  const irPara = (novoDia) => { location.hash = '#/agenda?dia=' + novoDia; rotear(); };
  $('#cal-ant').addEventListener('click', () => irPara(isoDe(new Date(ano, mes - 1, 1))));
  $('#cal-prox').addEventListener('click', () => irPara(isoDe(new Date(ano, mes + 1, 1))));
  $('#cal-hoje').addEventListener('click', () => irPara(hojeISO()));
  $$('.cal-dia').forEach(b => b.addEventListener('click', () => irPara(b.dataset.dia)));
  $('#btn-novo-comp').addEventListener('click', () => formCompromisso(null, dia, rotear));

  $('#tela').addEventListener('click', async (e) => {
    const sit = e.target.dataset.sit;
    if (sit) {
      e.stopPropagation();
      try { await api('POST', `/agenda/${e.target.dataset.id}/situacao`, { situacao: sit });
        ok(sit === 'realizado' ? 'Marcado como realizado.' : 'Compromisso cancelado.');
        contarAgenda(); rotear(); } catch (x) { erro(x); }
      return;
    }
    const rem = e.target.dataset.remarcar;
    if (rem !== undefined) {
      e.stopPropagation();
      formCompromisso({ data: hojeISO(), hora: '', assunto: '', situacao: 'marcado',
        retorno_em: '', cliente_id: Number(rem) || null }, hojeISO(), rotear);
      return;
    }
    const alvo = e.target.closest('[data-abrir]');
    if (alvo) {
      try { formCompromisso(await get('/agenda/' + alvo.dataset.abrir), dia, rotear); } catch (x) { erro(x); }
    }
  });
};

/* =========================================================================
   DITADO POR VOZ — fala vira rascunho de pedido, nunca pedido salvo
   =========================================================================
   O navegador transcreve (SpeechRecognition é nativo: sem biblioteca, sem
   serviço externo). Aqui a gente só casa o texto com o catálogo cadastrado.
   Quando dois produtos empatam, a voz NÃO escolhe: marca e pergunta.        */
const VOZ_OK = !!(window.SpeechRecognition || window.webkitSpeechRecognition);

const vozNumeros = { um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,
  onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,dezesseis:16,dezessete:17,dezoito:18,dezenove:19,
  vinte:20,trinta:30,quarenta:40,cinquenta:50,sessenta:60,setenta:70,oitenta:80,noventa:90,cem:100,cento:100,duzentos:200 };
const vozUnidades = { caixa:'CX',caixas:'CX',cx:'CX',fardo:'FD',fardos:'FD',fd:'FD',
  quilo:'KG',quilos:'KG',kg:'KG',kilo:'KG',kilos:'KG',unidade:'UN',unidades:'UN',un:'UN',pacote:'UN',pacotes:'UN' };

function vozNormalizar(s) {
  let t = String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const p = t.split(' '), fora = [];
  for (let i = 0; i < p.length; i++) {
    if (vozNumeros[p[i]] !== undefined) {
      let v = vozNumeros[p[i]];
      if (v >= 20 && v <= 90 && p[i + 1] === 'e' && vozNumeros[p[i + 2]] !== undefined && vozNumeros[p[i + 2]] < 10) {
        v += vozNumeros[p[i + 2]]; i += 2;
      }
      fora.push(String(v));
    } else fora.push(p[i]);
  }
  t = fora.join(' ');
  return t.replace(/(\d+)\s*(gramas|grama|gr|g)\b/g, '$1g')
    .replace(/(\d+)\s+e\s+meio\s*(kg|quilos?|k)\b/g, '$1e5kg')
    .replace(/(\d+)\s*(quilos|quilo|kilos|kilo|kg|k)\b/g, '$1kg')
    .replace(/(\d+)\s+(\d+)\s*kg\b/g, '$1e$2kg')
    .replace(/\s+/g, ' ').trim();
}
const vozTokens = (s) => vozNormalizar(s).split(' ').filter(Boolean);
const VOZ_TAM = /^(\d+)(g|kg|ml|l)$|^(cx|fd)?\d+x\d+(g|kg|ml|l)$|^\d+e\d+kg$/;
const vozTamanhos = (s) => vozTokens(s).filter(t => VOZ_TAM.test(t));
function vozBigramas(s) {
  const t = vozNormalizar(s).replace(/ /g, ''), r = [];
  for (let i = 0; i < t.length - 1; i++) r.push(t.slice(i, i + 2));
  return r;
}
function vozDice(a, b) {
  const A = vozBigramas(a), B = vozBigramas(b);
  if (!A.length || !B.length) return 0;
  const m = new Map(); for (const g of A) m.set(g, (m.get(g) || 0) + 1);
  let c = 0; for (const g of B) { const q = m.get(g) || 0; if (q > 0) { c++; m.set(g, q - 1); } }
  return (2 * c) / (A.length + B.length);
}
function vozPontuar(consulta, alvo) {
  const tc = vozTokens(consulta), ta = new Set(vozTokens(alvo));
  if (!tc.length) return 0;
  let s = 0.55 * (tc.filter(t => ta.has(t)).length / tc.length) + 0.45 * vozDice(consulta, alvo);
  const tf = vozTamanhos(consulta), tp = vozTamanhos(alvo);
  // errar 1KG por 5KG é o erro caro: tamanho diferente derruba a nota
  if (tf.length && tp.length) s *= tf.some(x => tp.includes(x)) ? 1.15 : 0.40;
  return Math.min(1, s);
}
const vozMelhores = (c, lista, campo, n = 4) =>
  lista.map(x => ({ x, s: vozPontuar(c, campo(x)) })).sort((a, b) => b.s - a.s).slice(0, n);

/** Quebra a fala em itens: cada pedaço começa num número */
function vozFatiar(txt) {
  const t = vozNormalizar(txt), re = /(?:^|\s)(\d+)\s+/g, cortes = [];
  let m; while ((m = re.exec(t)) !== null) cortes.push({ i: m.index === 0 ? 0 : m.index + 1, q: Number(m[1]) });
  return cortes.map((c, k) => {
    const fim = k + 1 < cortes.length ? cortes[k + 1].i : t.length;
    let corpo = t.slice(c.i, fim).replace(/^\d+\s*/, '').trim(), unidade = '';
    const pu = corpo.split(' ')[0];
    if (vozUnidades[pu]) { unidade = vozUnidades[pu]; corpo = corpo.slice(pu.length).trim(); }
    corpo = corpo.replace(/^(de|do|da|dos|das)\s+/, '');
    return { qtd: c.q, unidade, consulta: corpo };
  }).filter(i => i.consulta.length > 2);
}

/**
 * @param {string} texto fala transcrita
 * @param {object} cat { produtos, clientes } — catálogo cadastrado
 * @param {boolean} comCliente procurar cliente no fim da frase
 */
function vozAnalisar(texto, cat, comCliente) {
  const t = vozNormalizar(texto);
  const mc = comCliente ? t.match(/\b(?:para|pra|pro|cliente)\s+(?:o|a|os|as)?\s*([a-z0-9 ]{3,60})$/) : null;
  const corpo = mc ? t.slice(0, mc.index) : t;
  const cli = mc ? vozMelhores(mc[1], cat.clientes, c => (c.nome_fantasia ? c.nome_fantasia + ' ' : '') + c.razao_social, 4) : [];
  const itens = vozFatiar(corpo).map(i => {
    const cand = vozMelhores(i.consulta, cat.produtos, p => p.descricao, 4);
    const gap = cand[0].s - (cand[1]?.s || 0);
    // alternativa só entra se realmente concorre — sugestão ruim confunde mais que ajuda
    const corte = Math.max(0.35, cand[0].s * 0.6);
    return { ...i, candidatos: [cand[0], ...cand.slice(1).filter(c => c.s >= corte)],
      escolhido: 0, duvida: gap < 0.08 || cand[0].s < 0.45 };
  });
  const cont = {};
  for (const i of itens) if (i.candidatos[0].s > 0.45) {
    const r = i.candidatos[0].x.representada_id; cont[r] = (cont[r] || 0) + 1;
  }
  const repId = Object.entries(cont).sort((a, b) => b[1] - a[1])[0]?.[0];
  return { texto: texto.trim(), cliente: cli[0] && cli[0].s > 0.4 ? cli[0] : null,
    itens, representada_id: repId ? Number(repId) : null };
}

/** Catálogo completo para o casamento — carregado uma vez por sessão */
async function vozCatalogo() {
  if (estado.vozCat) return estado.vozCat;
  const [p, c] = await Promise.all([get('/produtos?ativo=1&limite=3000'), get('/clientes?ativo=1&limite=3000')]);
  estado.vozCat = { produtos: p, clientes: c };
  return estado.vozCat;
}

/**
 * Painel do microfone. Devolve a análise por `aoAplicar`; não mexe em nada sozinho.
 * @param {'pedido'|'itens'} modo pedido = procura cliente também
 */
async function abrirVoz(modo, aoAplicar) {
  let cat;
  try { cat = await vozCatalogo(); } catch (e) { return erro(e); }
  const comCliente = modo === 'pedido';

  abrirModal(`<h3>Ditar ${comCliente ? 'pedido' : 'itens'}</h3>
    <div class="modal-corpo">
      ${VOZ_OK ? '' : `<div class="aviso-linha">Este navegador não reconhece voz.
        No iPhone use o <b>Safari</b>, no Android o <b>Chrome</b>. Você ainda pode digitar abaixo.</div>`}
      <button type="button" class="btn voz-mic" id="vz-mic" ${VOZ_OK ? '' : 'disabled'}>
        <span class="voz-ponto"></span> Tocar e falar</button>
      <p class="modal-sub" id="vz-dica">Fale como falaria para um colega: <i>“vinte caixas de arroz
        reserva cinco quilos${comCliente ? ', para o Mercado Bom Preço' : ''}”</i>.
        Comece cada item por um número.</p>
      <label class="campo">O que foi entendido
        <textarea id="vz-texto" rows="3" placeholder="Você pode corrigir este texto antes de aplicar."></textarea></label>
      <div class="erro" id="vz-erro" style="color:var(--vermelho-txt);font-size:13px"></div>
      <div id="vz-previa"></div>
      <div class="modal-acoes">
        <button type="button" class="btn" onclick="window.__fechar()">Cancelar</button>
        <button type="button" class="btn btn-primario" id="vz-ok" disabled>Aplicar no pedido</button>
      </div>
    </div>`);

  let analise = null;
  const previa = () => {
    const txt = $('#vz-texto').value.trim();
    if (!txt) { $('#vz-previa').innerHTML = ''; $('#vz-ok').disabled = true; return; }
    analise = vozAnalisar(txt, cat, comCliente);
    const dud = analise.itens.filter(i => i.duvida).length;
    $('#vz-previa').innerHTML = `
      ${comCliente ? `<div class="voz-linha ${analise.cliente ? '' : 'duvida'}">
        <span class="rot">Cliente</span>
        <b>${analise.cliente ? esc(analise.cliente.x.razao_social) : 'não identificado — você escolhe na tela'}</b></div>` : ''}
      ${analise.itens.length ? analise.itens.map(i => `<div class="voz-linha ${i.duvida ? 'duvida' : ''}">
        <span class="rot">${i.qtd}${i.unidade ? ' ' + i.unidade : ''}</span>
        <b>${esc(i.candidatos[0].x.descricao)}</b>
        ${i.duvida ? '<small>parecidos demais — você escolhe na tela</small>' : ''}</div>`).join('')
        : '<div class="voz-linha duvida"><b>Nenhum item reconhecido</b><small>Comece cada item por um número: “dez caixas de…”</small></div>'}
      ${dud ? `<div class="info-linha">${dud} item(ns) vão entrar marcados em laranja esperando sua escolha.</div>` : ''}`;
    $('#vz-ok').disabled = !analise.itens.length;
  };
  $('#vz-texto').addEventListener('input', previa);

  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, ouvindo = false;
  $('#vz-mic')?.addEventListener('click', () => {
    if (!Rec) return;
    if (ouvindo) { rec.stop(); return; }
    rec = new Rec();
    rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true;
    let pronto = '';
    rec.onstart = () => { ouvindo = true; $('#vz-mic').classList.add('ouvindo');
      $('#vz-mic').innerHTML = '<span class="voz-ponto"></span> Ouvindo… toque para parar'; $('#vz-erro').textContent = ''; };
    rec.onresult = (e) => {
      let parcial = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) pronto += e.results[i][0].transcript + ' ';
        else parcial += e.results[i][0].transcript;
      }
      $('#vz-texto').value = (pronto + parcial).trim();
    };
    rec.onerror = (e) => { $('#vz-erro').textContent = e.error === 'not-allowed'
      ? 'O microfone está bloqueado para este site. Libere nas permissões do navegador.'
      : 'Microfone: ' + e.error; };
    rec.onend = () => { ouvindo = false; $('#vz-mic').classList.remove('ouvindo');
      $('#vz-mic').innerHTML = '<span class="voz-ponto"></span> Tocar e falar'; previa(); };
    rec.start();
  });

  $('#vz-ok').addEventListener('click', () => {
    if (!analise) return;
    try { rec?.stop(); } catch {}
    fecharModal();
    aoAplicar(analise);
  });
  setTimeout(() => $('#vz-mic')?.focus(), 80);
}

/**
 * Depois de salvar um pedido ditado: a voz acertou? Guarda a opinião junto do
 * que foi mexido de fato. Resolve sozinho se a pergunta estiver desligada.
 */
function perguntarVoz(pedido, uso) {
  const registrar = (veredito) => api('POST', '/voz/avaliacao', {
    pedido_id: pedido.id, texto: uso.texto, veredito,
    itens_propostos: uso.propostos, itens_duvidosos: uso.duvidosos,
    itens_trocados: uso.trocados, itens_removidos: uso.removidos,
    cliente_trocado: uso.clienteTrocado ? 1 : 0,
  }).catch(() => {});

  if (estado.config.voz_perguntar === '0') return registrar('');

  return new Promise((resolver) => {
    const mexidos = uso.trocados + uso.removidos;
    abrirModal(`<h3>O ditado acertou?</h3>
      <div class="modal-corpo">
        <p class="modal-sub">Pedido <b>${esc(pedido.numero)}</b> salvo. A voz propôs
          <b>${uso.propostos} item(ns)</b>${mexidos ? ` e você ajustou <b>${mexidos}</b>` : ' e você não precisou ajustar nenhum'}.
          Sua resposta me ajuda a melhorar o reconhecimento.</p>
        <div class="voz-votos">
          <button type="button" class="btn" data-v="acertou">Acertou tudo</button>
          <button type="button" class="btn" data-v="quase">Quase — ajustei algo</button>
          <button type="button" class="btn" data-v="errou">Errou feio</button>
        </div>
        <div class="modal-acoes">
          <label class="voz-nao-perguntar"><input type="checkbox" id="vz-nunca"> Não perguntar mais</label>
          <button type="button" class="btn" data-v="">Agora não</button>
        </div>
      </div>`);
    $('#modal-corpo').addEventListener('click', async (e) => {
      const v = e.target.dataset.v;
      if (v === undefined) return;
      if ($('#vz-nunca')?.checked) {
        estado.config.voz_perguntar = '0';          // para de perguntar já nesta sessão
        // gravar a preferência é coisa de administrador; se não for, vale só até sair
        try { await api('PUT', '/config', { voz_perguntar: '0' }); } catch {}
      }
      await registrar(v);
      fecharModal();
      resolver();
    });
  });
}

/* =========================================================================
   DEVOLUÇÕES — mercadoria que voltou depois do pedido faturado
   ========================================================================= */
/**
 * Abre o lançamento de devolução. Com `pedido` já definido vai direto ao
 * formulário; sem ele, primeiro procura o pedido pelo número ou pelo cliente.
 * `aoGravar` é chamado depois que a devolução entra.
 */
async function lancarDevolucao(pedido, aoGravar) {
  /** % que vale para o pedido: a dele, senão a da representada */
  const pctDo = (p) => (p.comissao_pct != null ? n(p.comissao_pct)
    : n(estado.representadas.find(r => r.id === p.representada_id)?.comissao_pct));

  const formulario = (p) => {
    const pc = pctDo(p);
    abrirModal(`<h3>Lançar devolução</h3>
      <div class="modal-corpo">
        <div class="info-linha">Pedido <b>${esc(p.numero)}</b> — ${esc(p.cliente_nome)}<br>
          Valor do pedido ${dinheiro(p.total)} • comissão de <b>${pct(pc)}</b></div>
        <div class="grade g3">
          <label class="campo">Data da devolução
            <input type="date" id="dv-data" value="${hojeISO()}"></label>
          <label class="campo">Mercadoria devolvida (R$)
            <input type="text" inputmode="decimal" id="dv-valor" placeholder="0,00"></label>
          <label class="campo">Estorno da comissão
            <input type="text" id="dv-estorno" value="R$ 0,00" readonly></label>
        </div>
        <label class="campo">Motivo (opcional)
          <input type="text" id="dv-motivo" placeholder="avaria no transporte, recusa do cliente…"></label>
        <small class="ajuda">O estorno sai de ${pct(pc)} sobre o valor devolvido. O pedido não muda:
          a devolução fica ao lado dele e abate na hora de gerar o acerto.</small>
        <div class="modal-acoes">
          <button class="btn" onclick="window.__fechar()">Cancelar</button>
          <button class="btn btn-primario" id="dv-ok">Lançar devolução</button>
        </div>
      </div>`);

    const recalcular = () => { $('#dv-estorno').value = dinheiro(numBR($('#dv-valor').value) * pc / 100); };
    $('#dv-valor').addEventListener('input', recalcular);
    ligarCamposBR('#dv-valor', recalcular);
    setTimeout(() => $('#dv-valor').focus(), 80);

    $('#dv-ok').addEventListener('click', async () => {
      const valor = numBR($('#dv-valor').value);
      if (!(valor > 0)) return erro('Informe o valor da mercadoria devolvida.');
      try {
        await api('POST', '/devolucoes', {
          pedido_id: p.id, data: $('#dv-data').value, valor, motivo: $('#dv-motivo').value,
        });
        fecharModal();
        ok(`Devolução lançada. Estorno de ${dinheiro(valor * pc / 100)} na comissão.`);
        aoGravar?.();
      } catch (e) { erro(e); }
    });
  };

  if (pedido) return formulario(pedido);

  // sem pedido definido: procura primeiro
  abrirModal(`<h3>Devolução — qual pedido?</h3>
    <div class="modal-corpo">
      <label class="campo">Procure pelo número do pedido ou pelo nome do cliente
        <input type="text" id="dv-busca" placeholder="PED-2026-0012 ou Mercado Bom Preço" autocomplete="off"></label>
      <div class="busca-lista" id="dv-res"><div class="vazio">Digite para procurar.</div></div>
      <div class="modal-acoes"><button class="btn" onclick="window.__fechar()">Cancelar</button></div>
    </div>`);

  let tempo;
  const procurar = async () => {
    const t = $('#dv-busca').value.trim();
    if (t.length < 2) return ($('#dv-res').innerHTML = '<div class="vazio">Digite para procurar.</div>');
    try {
      const lista = await get(`/pedidos?tipo=pedido&busca=${encodeURIComponent(t)}&limite=20`);
      $('#dv-res').innerHTML = lista.length
        ? lista.map(p => `<div data-id="${p.id}"><b>${esc(p.numero)} — ${esc(p.cliente_nome)}</b>
            <small>${dataBR(p.data_emissao)} • ${esc(p.representada_nome)} • ${dinheiro(p.total)}</small></div>`).join('')
        : '<div class="vazio">Nenhum pedido encontrado.</div>';
    } catch (e) { erro(e); }
  };
  $('#dv-busca').addEventListener('input', () => { clearTimeout(tempo); tempo = setTimeout(procurar, 300); });
  $('#dv-res').addEventListener('click', async e => {
    const div = e.target.closest('[data-id]'); if (!div) return;
    try { formulario(await get('/pedidos/' + div.dataset.id)); } catch (x) { erro(x); }
  });
  setTimeout(() => $('#dv-busca').focus(), 80);
}

/* =========================================================================
   COMISSÕES
   ========================================================================= */
telas.comissoes = async () => {
  titulo('Comissões');
  const agora = new Date();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const f2 = (x) => String(x).padStart(2, '0');
  const ano = Number(q.get('ano') || agora.getFullYear());
  const de = q.get('de') || `${ano}-01-01`;
  const ate = q.get('ate') || `${ano}-12-31`;
  const rep = q.get('rep') || '';
  const situacao = q.get('sit') || '';

  const par = new URLSearchParams({ de, ate });
  if (rep) par.set('representada_id', rep);
  if (situacao) par.set('status', situacao);
  const parDev = new URLSearchParams({ de, ate });
  if (rep) parDev.set('representada_id', rep);
  const [d, dev] = await Promise.all([get('/comissoes?' + par), get('/devolucoes?' + parDev)]);
  const r = d.resumo;

  acoes(`<button class="btn" id="btn-acerto">Acerto por marca (PDF)</button>
         <button class="btn" id="btn-devolucao">Lançar devolução</button>
         <button class="btn btn-verde" id="btn-marcar">Marcar selecionadas como recebidas</button>
         <button class="btn" id="btn-desmarcar">Voltar para pendente</button>`);

  pintar(`
  <div class="filtros nao-imprimir">
    <label class="campo">De<input type="date" id="f-de" value="${de}"></label>
    <label class="campo">Até<input type="date" id="f-ate" value="${ate}"></label>
    <label class="campo">Representada<select id="f-rep"><option value="">Todas</option>
      ${estado.representadas.map(x => `<option value="${x.id}" ${String(x.id) === rep ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label>
    <label class="campo">Situação<select id="f-sit">
      <option value="">Todas</option>
      <option value="pendente" ${situacao === 'pendente' ? 'selected' : ''}>A receber</option>
      <option value="recebida" ${situacao === 'recebida' ? 'selected' : ''}>Recebidas</option></select></label>
    <button class="btn btn-primario" id="btn-filtrar">Filtrar</button>
  </div>

  <div class="cartao"><div class="cartao-corpo">
    <div class="resumo-comissao">
      <div><div class="rot">A receber</div><div class="val">${dinheiro(r.pendente)}</div>
        <div class="obs">${r.qtd_pendente} pedido(s)</div></div>
      <div><div class="rot">Já recebida</div><div class="val">${dinheiro(r.recebida)}</div>
        <div class="obs">${r.qtd_recebida} pedido(s)</div></div>
      <div><div class="rot">Total do período</div><div class="val">${dinheiro(r.total)}</div>
        <div class="obs">${r.qtd_total} pedido(s)</div></div>
    </div>
    ${graficoProporcao([
      { nome: 'Recebida', valor: r.recebida, cor: COR_OK, obs: r.qtd_recebida + ' pedido(s)' },
      { nome: 'A receber', valor: r.pendente, cor: COR_ESPERA, obs: r.qtd_pendente + ' pedido(s)' },
    ])}
  </div></div>

  <div class="cartao"><div class="cartao-tit">Pedidos do período
      <span style="font-weight:400;color:var(--suave);font-size:12.5px">${d.lista.length} registro(s)</span></div>
    <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
      <thead><tr>
        <th style="width:36px" class="cen"><input type="checkbox" id="sel-todos" style="width:auto"></th>
        <th>Pedido</th><th>Cliente</th><th>Representada</th><th>Emissão</th>
        <th class="dir">Total</th><th class="dir">%</th><th class="dir">Comissão</th><th class="cen">Situação</th></tr></thead>
      <tbody>${d.lista.length ? d.lista.map(p => `
        <tr class="${p.comissao_status === 'recebida' ? 'linha-recebida' : ''}">
          <td class="cen"><input type="checkbox" class="sel" value="${p.id}" style="width:auto"></td>
          <td><a href="#/pedido/${p.id}"><b>${p.numero}</b></a></td>
          <td>${esc(p.cliente_nome)}</td>
          <td><small>${esc(p.representada_nome)}</small></td>
          <td>${dataBR(p.data_emissao)}</td>
          <td class="dir mono">${dinheiro(p.total)}</td>
          <td class="dir">${p.comissao_pct != null
            ? `<b>${pct(p.comissao_pct)}</b>`
            : (p.comissao_pct_representada
              ? `${pct(p.comissao_pct_representada)}<br><small style="color:var(--suave)">da representada</small>`
              : '-')}</td>
          <td class="dir mono"><b>${dinheiro(p.comissao_valor)}</b></td>
          <td class="cen">${p.comissao_status === 'recebida'
            ? `<span class="etq etq-verde">Recebida</span>${p.comissao_recebida_em ? `<br><small style="color:var(--suave)">${dataBR(p.comissao_recebida_em)}</small>` : ''}`
            : '<span class="etq etq-laranja">A receber</span>'}</td></tr>`).join('')
        : '<tr><td colspan="9" class="vazio"><b>Nenhum pedido no período</b>Ajuste os filtros acima.</td></tr>'}</tbody>
    </table></div></div></div>

  <div class="cartao"><div class="cartao-tit">Devoluções no período
      <span style="font-weight:400;color:var(--suave);font-size:12.5px">${dev.resumo.qtd} lançamento(s)
        • abate ${dinheiro(dev.resumo.estorno)} de comissão</span></div>
    <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
      <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Representada</th><th>Motivo</th>
        <th class="dir">Devolvido</th><th class="dir">%</th><th class="dir">Estorno</th><th style="width:44px"></th></tr></thead>
      <tbody>${dev.lista.length ? dev.lista.map(v => `<tr>
          <td>${dataBR(v.data)}</td>
          <td><a href="#/pedido/${v.pedido_id}"><b>${esc(v.numero)}</b></a></td>
          <td>${esc(v.cliente_nome)}</td>
          <td><small>${esc(v.representada_nome)}</small></td>
          <td><small>${esc(v.motivo || '-')}</small></td>
          <td class="dir mono">${dinheiro(v.valor)}</td>
          <td class="dir">${pct(v.comissao_pct)}</td>
          <td class="dir mono neg"><b>- ${dinheiro(v.comissao_estorno)}</b></td>
          <td class="cen"><button class="btn btn-peq btn-perigo apagar-dev" data-id="${v.id}"
            title="Apagar esta devolução">×</button></td></tr>`).join('')
        : '<tr><td colspan="9" class="vazio"><b>Nenhuma devolução no período</b>Quando um cliente devolver mercadoria, lance aqui para abater da comissão.</td></tr>'}
      </tbody>
    </table></div></div></div>

  <div class="info-linha">A comissão de cada pedido usa a <b>% gravada no próprio pedido</b>. Se você negociou
    diferente em algum, altere o percentual dentro do pedido que o valor se ajusta aqui.
    A devolução estorna pela mesma %, e só entra no acerto se você marcar a opção na hora de gerar.</div>`);

  ligarDicas();
  const filtrar = () => {
    const p = new URLSearchParams({ de: $('#f-de').value, ate: $('#f-ate').value, rep: $('#f-rep').value, sit: $('#f-sit').value });
    location.hash = '#/comissoes?' + p; rotear();
  };
  $('#btn-filtrar').addEventListener('click', filtrar);
  ['#f-rep', '#f-sit'].forEach(x => $(x).addEventListener('change', filtrar));
  $('#sel-todos').addEventListener('change', e => $$('.sel').forEach(c => c.checked = e.target.checked));

  const marcar = async (status) => {
    const ids = $$('.sel').filter(c => c.checked).map(c => Number(c.value));
    if (!ids.length) return erro('Selecione ao menos um pedido na lista.');
    const txt = status === 'recebida' ? 'marcar como RECEBIDAS' : 'voltar para PENDENTE';
    if (!confirm(`Confirma ${txt} ${ids.length} comissão(ões)?`)) return;
    try { await api('POST', '/comissoes/marcar', { ids, status }); ok('Comissões atualizadas.'); rotear(); }
    catch (e) { erro(e); }
  };
  $('#btn-marcar').addEventListener('click', () => marcar('recebida'));
  $('#btn-desmarcar').addEventListener('click', () => marcar('pendente'));

  /* ---- devoluções ---- */
  $('#btn-devolucao').addEventListener('click', () => lancarDevolucao(null, rotear));
  $$('.apagar-dev').forEach(b => b.addEventListener('click', async () => {
    const v = dev.lista.find(x => x.id === Number(b.dataset.id));
    if (!confirm(`Apagar a devolução de ${dinheiro(v.valor)} do pedido ${v.numero}?\n\n` +
      `A comissão volta a contar ${dinheiro(v.comissao_estorno)} a mais.`)) return;
    try { await api('DELETE', '/devolucoes/' + v.id); ok('Devolução apagada.'); rotear(); }
    catch (e) { erro(e); }
  }));

  /* ---- acerto: o PDF de cobrança que vai para cada representada ---- */
  $('#btn-acerto').addEventListener('click', async () => {
    const d1 = $('#f-de').value, d2 = $('#f-ate').value;
    if (!d1 || !d2) return erro('Preencha as datas De e Até antes de gerar o acerto.');
    let a;
    try { a = await get(`/comissoes/acerto?de=${d1}&ate=${d2}`); } catch (e) { return erro(e); }

    if (!a.representadas.length) {
      return abrirModal(`<h3>Acerto de comissão</h3>
        <div class="modal-corpo">
          <div class="vazio"><b>Nada a receber em ${esc(a.periodo.rotulo)}</b>
            Nenhuma comissão pendente neste período. Pode ser que já estejam marcadas como
            recebidas, ou que as datas do filtro não peguem os pedidos certos.</div>
          <div class="modal-acoes"><button class="btn" onclick="window.__fechar()">Fechar</button></div>
        </div>`);
    }

    const base = `de=${encodeURIComponent(d1)}&ate=${encodeURIComponent(d2)}`;
    const temDev = a.total_devolucoes > 0;
    abrirModal(`<h3>Acerto de comissão — ${esc(a.periodo.rotulo)}</h3>
      <div class="modal-corpo">
        <p class="modal-sub">Um PDF por representada, com os pedidos listados um a um, para você
          mandar para a empresa pagar. Entra só o que está <b>a receber</b> — gerar o acerto
          não marca nada como recebido.</p>
        ${temDev ? `<label class="dev-opcao">
          <input type="checkbox" id="ac-dev" checked>
          <span><b>Abater as devoluções do período</b>
            <small>${dinheiro(a.total_devolucoes)} em estornos lançados entre ${dataBR(d1)} e ${dataBR(d2)}.
              Desmarque para gerar o acerto só com os pedidos.</small></span></label>` : ''}
        <div class="acerto-lista" id="ac-lista"></div>
        <div class="modal-acoes"><button class="btn" onclick="window.__fechar()">Fechar</button></div>
      </div>`);

    const desenhar = () => {
      const abater = !!$('#ac-dev')?.checked;
      const valor = (r) => (abater ? r.liquido : r.comissao);
      const linhas = a.representadas.filter(r => r.qtd > 0 || (abater && r.qtd_devolucoes > 0));
      $('#ac-lista').innerHTML = `
        ${linhas.map(r => `<div class="acerto-item">
          <div class="acerto-nome"><b>${esc(r.nome)}</b>
            <small>${r.qtd} pedido(s) • ${dataBR(r.primeiro)} a ${dataBR(r.ultimo)}${
              abater && r.qtd_devolucoes ? ` • <span class="neg">${r.qtd_devolucoes} devolução(ões), - ${dinheiro(r.devolucao_estorno)}</span>` : ''}</small></div>
          <div class="acerto-val mono ${valor(r) < 0 ? 'neg' : ''}">${dinheiro(valor(r))}</div>
          <a class="btn btn-peq btn-primario"
            href="/api/comissoes/acerto/${r.representada_id}/pdf?${base}${abater ? '&devolucoes=1' : ''}"
            target="_blank" rel="noopener">Gerar acerto</a>
        </div>`).join('')}
        <div class="acerto-item acerto-total">
          <div class="acerto-nome"><b>Total a receber</b>${
            abater && temDev ? `<small>${dinheiro(a.total)} de comissão menos ${dinheiro(a.total_devolucoes)} de devoluções</small>` : ''}</div>
          <div class="acerto-val mono">${dinheiro(abater ? a.total_liquido : a.total)}</div>
        </div>`;
    };
    desenhar();
    $('#ac-dev')?.addEventListener('change', desenhar);
  });
};

/* =========================================================================
   RELATÓRIO DE VENDAS
   ========================================================================= */
telas.relatorios = async () => {
  titulo('Relatório de vendas');
  const agora = new Date();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const f2 = (x) => String(x).padStart(2, '0');
  const ano = Number(q.get('ano') || agora.getFullYear());
  const mes = Number(q.get('mes') || agora.getMonth() + 1);
  const rep = q.get('rep') || '';
  const modo = q.get('modo') || 'mes';
  const de = q.get('de') || `${ano}-${f2(mes)}-01`;
  const ate = q.get('ate') || `${ano}-${f2(mes)}-${new Date(ano, mes, 0).getDate()}`;

  const par = new URLSearchParams(modo === 'mes' ? { ano, mes } : { de, ate });
  if (rep) par.set('representada_id', rep);
  const [d, t] = await Promise.all([get('/relatorio/vendas?' + par), get('/relatorio/vendas/texto?' + par)]);

  const MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const anos = []; for (let a = agora.getFullYear(); a >= agora.getFullYear() - 6; a--) anos.push(a);

  acoes(`
    <a class="btn" href="/api/relatorio/vendas/pdf?${par}" target="_blank">📄 Ver PDF</a>
    <a class="btn" href="/api/relatorio/vendas/pdf?${par}&download=1">⬇ Baixar</a>
    <button class="btn" id="btn-imprimir">🖨 Imprimir</button>
    <button class="btn btn-verde" id="btn-zap">WhatsApp</button>`);

  pintar(`
  <div class="filtros nao-imprimir">
    <label class="campo">Período<select id="f-modo">
      <option value="mes" ${modo === 'mes' ? 'selected' : ''}>Mês fechado</option>
      <option value="livre" ${modo === 'livre' ? 'selected' : ''}>Datas escolhidas</option></select></label>
    <label class="campo" id="c-mes" style="${modo === 'mes' ? '' : 'display:none'}">Mês
      <select id="f-mes">${MES.map((x, i) => `<option value="${i + 1}" ${i + 1 === mes ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
    <label class="campo" id="c-ano" style="${modo === 'mes' ? '' : 'display:none'}">Ano
      <select id="f-ano">${anos.map(a => `<option ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
    <label class="campo" id="c-de" style="${modo === 'mes' ? 'display:none' : ''}">De<input type="date" id="f-de" value="${de}"></label>
    <label class="campo" id="c-ate" style="${modo === 'mes' ? 'display:none' : ''}">Até<input type="date" id="f-ate" value="${ate}"></label>
    <label class="campo">Representada<select id="f-rep"><option value="">Todas</option>
      ${estado.representadas.map(r => `<option value="${r.id}" ${String(r.id) === rep ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></label>
    <button class="btn btn-primario" id="btn-gerar">Gerar</button>
  </div>

  <div id="folha">
    <div class="cabecalho-impressao">
      <h2 style="margin:0">Relatório de vendas</h2>
      <div style="color:var(--suave);font-size:13px">${esc(d.periodo.rotulo)}${d.filtros ? ' — ' + esc(d.filtros) : ''}</div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="rot">Faturamento</div><div class="val">${dinheiro(d.resumo.total)}</div>
        <div class="obs">${esc(d.periodo.rotulo)}</div></div>
      <div class="kpi"><div class="rot">Pedidos</div><div class="val">${d.resumo.pedidos}</div>
        <div class="obs">${d.resumo.clientes} cliente(s) atendido(s)</div></div>
      <div class="kpi"><div class="rot">Ticket médio</div><div class="val">${dinheiro(d.resumo.ticket)}</div>
        <div class="obs">por pedido</div></div>
      <div class="kpi"><div class="rot">Comissão</div><div class="val">${dinheiro(d.resumo.comissao)}</div>
        <div class="obs">conforme % de cada representada</div></div>
    </div>

    ${d.meses.length > 1 ? `<div class="cartao"><div class="cartao-tit">Faturamento por mês</div>
      <div class="cartao-corpo sem-pad"><table>
        <thead><tr><th>Mês</th><th class="cen">Pedidos</th><th class="dir">Faturamento</th><th class="dir">Meta</th><th class="dir">% meta</th></tr></thead>
        <tbody>${d.meses.map(m => {
          const p = m.meta ? (m.total / m.meta) * 100 : 0;
          return `<tr><td><b>${m.rotulo}</b></td><td class="cen">${m.pedidos}</td>
            <td class="dir mono">${dinheiro(m.total)}</td><td class="dir mono">${m.meta ? dinheiro(m.meta) : '-'}</td>
            <td class="dir">${m.meta ? `<span class="etq ${p >= 100 ? 'etq-verde' : p >= 70 ? 'etq-laranja' : 'etq-vermelha'}">${pct(p)}</span>` : '-'}</td></tr>`;
        }).join('')}</tbody></table></div></div>` : ''}

    <div class="grade cartoes">
      <div class="cartao"><div class="cartao-tit">Por representada</div>
        <div class="cartao-corpo sem-pad"><table>
          <thead><tr><th>Representada</th><th class="cen">Pedidos</th><th class="dir">Total</th><th class="dir">%</th></tr></thead>
          <tbody>${d.representadas.length ? d.representadas.map(r => `<tr><td>${esc(r.nome)}</td>
            <td class="cen">${r.pedidos}</td><td class="dir mono">${dinheiro(r.total)}</td>
            <td class="dir">${d.resumo.total ? pct((r.total / d.resumo.total) * 100) : '-'}</td></tr>`).join('')
            : '<tr><td colspan="4" class="vazio">Sem vendas no período.</td></tr>'}</tbody></table></div></div>

      <div class="cartao"><div class="cartao-tit">Clientes que mais compraram</div>
        <div class="cartao-corpo sem-pad"><table>
          <thead><tr><th>Cliente</th><th class="cen">Pedidos</th><th class="dir">Total</th></tr></thead>
          <tbody>${d.clientes.length ? d.clientes.map(c => `<tr><td>${esc(c.nome)}
            <br><small style="color:var(--suave)">${esc(c.cidade || '')}</small></td>
            <td class="cen">${c.pedidos}</td><td class="dir mono">${dinheiro(c.total)}</td></tr>`).join('')
            : '<tr><td colspan="3" class="vazio">Sem vendas no período.</td></tr>'}</tbody></table></div></div>
    </div>

    <div class="cartao"><div class="cartao-tit">Produtos mais vendidos</div>
      <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
        <thead><tr><th>Produto</th><th>Código</th><th class="dir">Quantidade</th><th class="dir">Total</th></tr></thead>
        <tbody>${d.produtos.length ? d.produtos.map(p => `<tr><td>${esc(p.descricao)}</td>
          <td class="cod">${esc(p.codigo || '-')}</td><td class="dir mono">${numero(p.quantidade)}</td>
          <td class="dir mono">${dinheiro(p.total)}</td></tr>`).join('')
          : '<tr><td colspan="4" class="vazio">Sem vendas no período.</td></tr>'}</tbody></table></div></div></div>

    <div class="cartao"><div class="cartao-tit">Pedidos do período (${d.pedidos.length})</div>
      <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
        <thead><tr><th>Número</th><th>Data</th><th>Cliente</th><th>Representada</th><th class="cen">Situação</th><th class="dir">Total</th></tr></thead>
        <tbody>${d.pedidos.length ? d.pedidos.map(p => `<tr><td class="cod">${p.numero}</td><td>${dataBR(p.data_emissao)}</td>
          <td>${esc(p.cliente)}</td><td><small>${esc(p.representada)}</small></td>
          <td class="cen"><small>${esc(p.status)}</small></td><td class="dir mono">${dinheiro(p.total)}</td></tr>`).join('')
          : '<tr><td colspan="6" class="vazio">Nenhum pedido no período.</td></tr>'}</tbody></table></div></div></div>
  </div>`);

  const trocarModo = () => {
    const livre = $('#f-modo').value === 'livre';
    ['#c-mes', '#c-ano'].forEach(x => $(x).style.display = livre ? 'none' : '');
    ['#c-de', '#c-ate'].forEach(x => $(x).style.display = livre ? '' : 'none');
  };
  $('#f-modo').addEventListener('change', trocarModo);
  $('#btn-gerar').addEventListener('click', () => {
    const p = new URLSearchParams({ modo: $('#f-modo').value, rep: $('#f-rep').value });
    if ($('#f-modo').value === 'mes') { p.set('ano', $('#f-ano').value); p.set('mes', $('#f-mes').value); }
    else { p.set('de', $('#f-de').value); p.set('ate', $('#f-ate').value); }
    location.hash = '#/relatorios?' + p; rotear();
  });
  $('#btn-imprimir').addEventListener('click', () => window.print());
  $('#btn-zap').addEventListener('click', () => {
    abrirModal(`<h3>Enviar relatório por WhatsApp</h3>
      <div class="grade g2" style="margin-bottom:14px">
        <a class="btn btn-verde btn-bloco" href="${t.whatsapp}" target="_blank">Abrir WhatsApp</a>
        <a class="btn btn-bloco" href="/api/relatorio/vendas/pdf?${par}&download=1">Baixar PDF para anexar</a>
      </div>
      <label class="campo">Mensagem (edite se quiser)
        <textarea id="txt-rel" style="min-height:260px;font-family:ui-monospace,monospace;font-size:12px">${esc(t.texto)}</textarea></label>
      <div class="modal-acoes"><button class="btn" id="btn-copiar-rel">Copiar texto</button>
        <button class="btn btn-primario" onclick="window.__fechar()">Fechar</button></div>`);
    $('#btn-copiar-rel').addEventListener('click', async () => {
      try { await navigator.clipboard.writeText($('#txt-rel').value); ok('Texto copiado!'); }
      catch { $('#txt-rel').select(); document.execCommand('copy'); ok('Texto copiado!'); }
    });
  });
};

/* =========================================================================
   FATURAMENTO
   ========================================================================= */
telas.faturamento = async () => {
  titulo('Faturamento');
  const agora = new Date();
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  const ano = Number(q.get('ano') || agora.getFullYear());
  const rep = q.get('rep') || '';
  const d = await get(`/faturamento?ano=${ano}${rep ? '&representada_id=' + rep : ''}`);

  const anos = []; for (let a = agora.getFullYear(); a >= agora.getFullYear() - 6; a--) anos.push(a);
  acoes(`
    <select id="f-ano" style="width:auto">${anos.map(a => `<option value="${a}" ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
    <select id="f-rep" style="width:auto"><option value="">Todas representadas</option>
      ${estado.representadas.map(r => `<option value="${r.id}" ${String(r.id) === rep ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select>
    <button class="btn" onclick="window.print()">Imprimir</button>`);

  const t = d.totais, m = d.mes;
  const pAno = t.meta ? (t.realizado / t.meta) * 100 : 0;
  const pMes = m.meta ? (m.realizado / m.meta) * 100 : 0;
  const maxG = Math.max(...d.meses.map(x => Math.max(x.realizado, x.meta, x.anterior)), 1);

  pintar(`
  <div class="kpis">
    <div class="kpi"><div class="rot">Faturamento ${ano}</div>
      <div class="val">${dinheiro(t.realizado)}</div>
      <div class="obs">${t.pedidos} pedidos • ticket ${dinheiro(t.ticket)}</div>
      <div class="barra ${barraCor(pAno)}"><span style="width:${Math.min(100, pAno)}%"></span></div></div>

    <div class="kpi"><div class="rot">Projeção do ano</div>
      <div class="val">${dinheiro(d.projecao_ano)}</div>
      <div class="obs">${t.meta ? `${pct((d.projecao_ano / t.meta) * 100)} da meta de ${curto(t.meta)}` : 'sem meta cadastrada'}</div></div>

    <div class="kpi"><div class="rot">${m.nome} (mês atual)</div>
      <div class="val">${dinheiro(m.realizado)}</div>
      <div class="obs">Meta ${dinheiro(m.meta)} • ${pct(pMes)} atingido</div>
      <div class="barra ${barraCor(pMes)}"><span style="width:${Math.min(100, pMes)}%"></span></div></div>

    <div class="kpi"><div class="rot">Projeção de ${m.nome}</div>
      <div class="val">${dinheiro(m.projecao)}</div>
      <div class="obs">no ritmo de ${dinheiro(m.media_dia)}/dia • dia ${m.dias_corridos} de ${m.dias_do_mes}</div></div>

    <div class="kpi"><div class="rot">Média mensal</div>
      <div class="val">${dinheiro(d.media_mensal)}</div>
      <div class="obs">base dos meses já fechados</div></div>

    <div class="kpi"><div class="rot">Comissão do ano</div>
      <div class="val">${dinheiro(t.comissao)}</div>
      <div class="obs">${t.variacao === null ? 'sem base do ano anterior'
        : `<span class="${t.variacao >= 0 ? 'pos' : 'neg'}">${t.variacao >= 0 ? '+' : ''}${pct(t.variacao)}</span> vs ${ano - 1}`}</div></div>
  </div>

  <div class="cartao"><div class="cartao-tit">Faturamento mês a mês — ${ano}</div><div class="cartao-corpo">
    <div class="grafico">${d.meses.map(x => `
      <div class="col" title="${x.nome}: ${dinheiro(x.realizado)} (meta ${dinheiro(x.meta)}, ${ano - 1}: ${dinheiro(x.anterior)})">
        <div class="barras">
          <div class="b" style="height:${(x.realizado / maxG) * 100}%"></div>
          <div class="b meta" style="height:${(x.meta / maxG) * 100}%"></div>
          <div class="b ant" style="height:${(x.anterior / maxG) * 100}%"></div>
        </div><div class="rot">${x.nome}</div></div>`).join('')}</div>
    <div class="legenda">
      <span><i style="background:#2d2d31"></i>Realizado ${ano}</span>
      <span><i style="background:#d9d9de"></i>Meta</span>
      <span><i style="background:#a9b7c9"></i>${ano - 1}</span></div>
  </div></div>

  <div class="cartao"><div class="cartao-tit">Detalhe por mês</div>
    <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
      <thead><tr><th>Mês</th><th class="dir">Faturamento</th><th class="cen">Pedidos</th>
        <th class="dir">Meta</th><th class="dir">% meta</th><th class="dir">${ano - 1}</th>
        <th class="dir">Variação</th><th class="dir">Acumulado</th></tr></thead>
      <tbody>${(() => { let ac = 0; return d.meses.map(x => {
        ac += x.realizado;
        const p = x.meta ? (x.realizado / x.meta) * 100 : 0;
        const v = x.anterior ? ((x.realizado - x.anterior) / x.anterior) * 100 : null;
        const atual = x.mes === d.mes_atual && ano === agora.getFullYear();
        return `<tr${atual ? ' style="background:#f6f6f8"' : ''}>
          <td><b>${x.nome}</b>${atual ? ' <span class="etq etq-cinza">em andamento</span>' : ''}</td>
          <td class="dir mono"><b>${dinheiro(x.realizado)}</b></td>
          <td class="cen">${x.pedidos || '-'}</td>
          <td class="dir mono">${x.meta ? dinheiro(x.meta) : '-'}</td>
          <td class="dir">${x.meta ? `<span class="etq ${p >= 100 ? 'etq-verde' : p >= 70 ? 'etq-laranja' : 'etq-vermelha'}">${pct(p)}</span>` : '-'}</td>
          <td class="dir mono">${x.anterior ? dinheiro(x.anterior) : '-'}</td>
          <td class="dir">${v === null ? '-' : `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : ''}${pct(v)}</span>`}</td>
          <td class="dir mono">${dinheiro(ac)}</td></tr>`;
      }).join(''); })()}
      <tr style="background:#fafbfc"><td><b>TOTAL</b></td>
        <td class="dir mono"><b>${dinheiro(t.realizado)}</b></td><td class="cen"><b>${t.pedidos}</b></td>
        <td class="dir mono">${t.meta ? dinheiro(t.meta) : '-'}</td>
        <td class="dir">${t.meta ? pct(pAno) : '-'}</td>
        <td class="dir mono">${t.anterior ? dinheiro(t.anterior) : '-'}</td>
        <td class="dir">${t.variacao === null ? '-' : `<span class="${t.variacao >= 0 ? 'pos' : 'neg'}">${t.variacao >= 0 ? '+' : ''}${pct(t.variacao)}</span>`}</td>
        <td class="dir mono"><b>${dinheiro(t.realizado)}</b></td></tr>
      </tbody></table></div></div></div>

  <div class="cartao"><div class="cartao-tit">Por representada — ${ano}</div>
    <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
      <thead><tr><th>Representada</th><th class="dir">${m.nome}</th><th class="dir">Projeção ${m.nome}</th>
        <th class="dir">Ano</th><th class="dir">Meta ano</th><th class="dir">% meta</th>
        <th class="dir">${ano - 1}</th><th class="cen">Pedidos</th><th class="dir">Comissão</th></tr></thead>
      <tbody>${d.por_representada.length ? d.por_representada.map(r => {
        const p = r.meta_ano ? (r.ano / r.meta_ano) * 100 : 0;
        return `<tr><td><b>${esc(r.nome)}</b><br><small style="color:var(--suave)">comissão ${pct(r.comissao_pct)}</small></td>
          <td class="dir mono">${dinheiro(r.mes)}</td><td class="dir mono">${dinheiro(r.projecao_mes)}</td>
          <td class="dir mono"><b>${dinheiro(r.ano)}</b></td><td class="dir mono">${r.meta_ano ? dinheiro(r.meta_ano) : '-'}</td>
          <td class="dir">${r.meta_ano ? `<span class="etq ${p >= 100 ? 'etq-verde' : p >= 70 ? 'etq-laranja' : 'etq-vermelha'}">${pct(p)}</span>` : '-'}</td>
          <td class="dir mono">${r.anterior ? dinheiro(r.anterior) : '-'}</td>
          <td class="cen">${r.pedidos}</td><td class="dir mono">${dinheiro(r.comissao_ano)}</td></tr>`;
      }).join('') : '<tr><td colspan="9" class="vazio">Cadastre suas representadas.</td></tr>'}</tbody>
    </table></div></div></div>

  <div class="info-linha">Como a projeção é calculada: o faturamento do mês é dividido pelos dias já corridos e
    multiplicado pelos dias totais do mês. A projeção do ano soma o que já entrou, o fechamento previsto do mês
    e a média dos meses fechados para os meses que faltam.</div>`);

  const aplicar = () => { location.hash = `#/faturamento?ano=${$('#f-ano').value}&rep=${$('#f-rep').value}`; rotear(); };
  ['#f-ano', '#f-rep'].forEach(x => $(x).addEventListener('change', aplicar));
};

/* =========================================================================
   PEDIDOS E COTAÇÕES — listagem
   ========================================================================= */
function listaDocumentos(tipo) {
  return async () => {
    const eCot = tipo === 'cotacao';
    titulo(eCot ? 'Cotações' : 'Pedidos');
    acoes(`<a class="btn btn-primario" href="#/${eCot ? 'cotacao' : 'pedido'}/novo">+ ${eCot ? 'Nova cotação' : 'Novo pedido'}</a>`);
    const hoje = new Date();
    const de = new Date(hoje.getFullYear(), hoje.getMonth() - 2, 1).toLocaleDateString('sv-SE');
    pintar(`
      <div class="filtros">
        <label class="campo">Buscar<input id="f-busca" placeholder="Nº, cliente…"></label>
        <label class="campo">De<input type="date" id="f-de" value="${de}"></label>
        <label class="campo">Até<input type="date" id="f-ate" value="${hojeISO()}"></label>
        <label class="campo">Representada<select id="f-rep"><option value="">Todas</option>
          ${estado.representadas.map(r => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</select></label>
        <label class="campo">Situação<select id="f-status"><option value="">Todas</option>
          ${(eCot ? ['rascunho', 'enviada', 'ganha', 'perdida'] : ['rascunho', 'aberto', 'enviado', 'faturado', 'cancelado'])
            .map(s => `<option value="${s}">${ETIQUETAS[s][1]}</option>`).join('')}</select></label>
        <button class="btn" id="f-limpar">Limpar</button>
      </div>
      <div class="cartao"><div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
        <thead><tr><th>Número</th><th>Cliente</th><th>Representada</th><th>Emissão</th>
          <th>${eCot ? 'Validade' : 'Entrega'}</th><th>Pagamento</th><th class="cen">Situação</th>
          <th class="dir">Total</th><th></th></tr></thead>
        <tbody id="corpo-lista"><tr><td colspan="9" class="vazio">Carregando…</td></tr></tbody>
      </table></div></div></div>
      <div id="resumo-lista" style="color:var(--suave);font-size:12.5px;padding:0 4px"></div>`);

    const carregar = async () => {
      const p = new URLSearchParams({ tipo });
      for (const [id, k] of [['f-busca', 'busca'], ['f-de', 'de'], ['f-ate', 'ate'], ['f-rep', 'representada_id'], ['f-status', 'status']])
        if ($('#' + id).value) p.set(k, $('#' + id).value);
      const lista = await get('/pedidos?' + p);
      $('#corpo-lista').innerHTML = lista.length ? lista.map(x => `
        <tr style="cursor:pointer" onclick="location.hash='#/${eCot ? 'cotacao' : 'pedido'}/${x.id}'">
          <td><b>${x.numero}</b><br><small style="color:var(--suave)">${x.qtd_itens} item(ns)</small></td>
          <td>${esc(x.cliente_fantasia || x.cliente_nome)}<br><small style="color:var(--suave)">${esc([x.cliente_cidade, x.cliente_uf].filter(Boolean).join('/'))}</small></td>
          <td>${esc(x.representada_nome)}</td><td>${dataBR(x.data_emissao)}</td>
          <td>${dataBR(eCot ? x.validade : x.data_entrega)}</td>
          <td><small>${esc(x.condicao_desc || '-')}</small></td>
          <td class="cen">${etq(x.status)}</td><td class="dir mono"><b>${dinheiro(x.total)}</b></td>
          <td class="dir"><a class="btn btn-peq" href="/api/pedidos/${x.id}/pdf" target="_blank" onclick="event.stopPropagation()">PDF</a></td>
        </tr>`).join('') : `<tr><td colspan="9" class="vazio"><b>Nenhum registro no período</b>Ajuste os filtros ou crie um novo.</td></tr>`;
      const soma = lista.reduce((s, x) => s + n(x.total), 0);
      $('#resumo-lista').innerHTML = `${lista.length} registro(s) • total ${dinheiro(soma)}`;
    };
    ['f-busca', 'f-de', 'f-ate', 'f-rep', 'f-status'].forEach(id => {
      const el = $('#' + id);
      el.addEventListener('change', carregar);
      if (id === 'f-busca') { let t; el.addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 350); }); }
    });
    $('#f-limpar').addEventListener('click', () => { ['f-busca', 'f-rep', 'f-status'].forEach(i => $('#' + i).value = ''); carregar(); });
    await carregar();
  };
}
telas.pedidos = listaDocumentos('pedido');
telas.cotacoes = listaDocumentos('cotacao');

/* =========================================================================
   EDITOR DE PEDIDO / COTAÇÃO
   ========================================================================= */
function editor(tipoPadrao) {
  return async (args) => {
    const id = args[0] && args[0] !== 'novo' ? Number(args[0]) : null;
    let doc, itens = [], devs = { lista: [], resumo: { qtd: 0, valor: 0, estorno: 0 } };
    // o que o ditado propôs e o que a pessoa mexeu depois — medida honesta do acerto
    const vozUso = { usou: false, texto: '', propostos: 0, duvidosos: 0, trocados: 0, removidos: 0, clienteTrocado: false };
    if (id) {
      doc = await get('/pedidos/' + id);
      itens = doc.itens.map(i => ({ ...i }));
      if (doc.tipo === 'pedido') devs = await get('/devolucoes?pedido_id=' + id).catch(() => devs);
    } else {
      doc = {
        tipo: tipoPadrao, status: tipoPadrao === 'cotacao' ? 'rascunho' : 'aberto',
        data_emissao: hojeISO(), tipo_frete: 'CIF', desconto_pct: 0, frete: 0,
        validade: tipoPadrao === 'cotacao' ? new Date(Date.now() + 15 * 864e5).toLocaleDateString('sv-SE') : '',
      };
    }
    const eCot = doc.tipo === 'cotacao';
    const bloqueado = ['faturado', 'cancelado'].includes(doc.status);
    titulo(id ? `${eCot ? 'Cotação' : 'Pedido'} ${doc.numero}` : `${eCot ? 'Nova cotação' : 'Novo pedido'}`);

    const clientes = await get('/clientes?ativo=1&limite=1000');
    let tabelas = [], condicoes = [], produtos = [];

    const botaoVoz = bloqueado ? '' : `<button class="btn" id="btn-voz">🎙️ Ditar</button>`;
    acoes(id ? `
      ${etq(doc.status)}
      <a class="btn" href="/api/pedidos/${id}/pdf" target="_blank">Ver PDF</a>
      ${botaoVoz}
      <button class="btn" id="btn-enviar">Enviar cópia</button>
      <button class="btn" id="btn-situacao">Situação</button>
      <button class="btn" id="btn-mais">⋯</button>
      ${bloqueado ? '' : '<button class="btn btn-primario" id="btn-salvar">Salvar</button>'}`
      : `${botaoVoz}
      <button class="btn btn-primario" id="btn-salvar">Salvar ${eCot ? 'cotação' : 'pedido'}</button>`);

    pintar(`
    ${bloqueado ? `<div class="aviso-linha">Este ${eCot ? 'documento' : 'pedido'} está <b>${ETIQUETAS[doc.status][1].toLowerCase()}</b> e não pode mais ser editado.</div>` : ''}
    ${devs.lista.length ? `<div class="cartao"><div class="cartao-tit">Devoluções deste pedido
        <span style="font-weight:400;color:var(--suave);font-size:12.5px">${dinheiro(devs.resumo.valor)} devolvido
          • estorno de ${dinheiro(devs.resumo.estorno)} na comissão</span></div>
      <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
        <thead><tr><th>Data</th><th>Motivo</th><th class="dir">Devolvido</th><th class="dir">%</th><th class="dir">Estorno</th></tr></thead>
        <tbody>${devs.lista.map(v => `<tr><td>${dataBR(v.data)}</td><td><small>${esc(v.motivo || '-')}</small></td>
          <td class="dir mono">${dinheiro(v.valor)}</td><td class="dir">${pct(v.comissao_pct)}</td>
          <td class="dir mono neg"><b>- ${dinheiro(v.comissao_estorno)}</b></td></tr>`).join('')}</tbody>
      </table></div></div></div>` : ''}
    <form id="form-pedido">
      <div class="cartao"><div class="cartao-tit">Dados do ${eCot ? 'orçamento' : 'pedido'}</div><div class="cartao-corpo">
        <div class="grade g4">
          <label class="campo">Cliente *
            <select name="cliente_id" required ${bloqueado ? 'disabled' : ''}>
              <option value="">Selecione…</option>
              ${clientes.map(c => `<option value="${c.id}" ${doc.cliente_id === c.id ? 'selected' : ''}>${esc(c.nome_fantasia || c.razao_social)}${c.cidade ? ' — ' + esc(c.cidade) : ''}</option>`).join('')}
            </select></label>
          <label class="campo">Representada *
            <select name="representada_id" id="sel-rep" required ${bloqueado ? 'disabled' : ''}>
              <option value="">Selecione…</option>
              ${estado.representadas.filter(r => r.ativo || r.id === doc.representada_id).map(r => `<option value="${r.id}" ${doc.representada_id === r.id ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}
            </select></label>
          <label class="campo">Tabela de preço<select name="tabela_id" id="sel-tabela" ${bloqueado ? 'disabled' : ''}></select></label>
          <label class="campo">Prazo de pagamento<select name="condicao_id" id="sel-condicao" ${bloqueado ? 'disabled' : ''}></select></label>
        </div>
        <div class="grade g4">
          <label class="campo">Emissão<input type="date" name="data_emissao" value="${doc.data_emissao || hojeISO()}" ${bloqueado ? 'readonly' : ''}></label>
          ${eCot
            ? `<label class="campo">Validade da cotação<input type="date" name="validade" value="${doc.validade || ''}" ${bloqueado ? 'readonly' : ''}></label>`
            : `<label class="campo">Previsão de entrega<input type="date" name="data_entrega" value="${doc.data_entrega || ''}" ${bloqueado ? 'readonly' : ''}></label>`}
          <label class="campo">Frete<select name="tipo_frete" ${bloqueado ? 'disabled' : ''}>
            ${['CIF', 'FOB', 'Retira', 'Terceiros'].map(t => `<option ${doc.tipo_frete === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="campo">Transportadora<input name="transportadora" value="${esc(doc.transportadora || '')}" ${bloqueado ? 'readonly' : ''}></label>
        </div>
        <label class="campo">Prazo negociado neste ${eCot ? 'orçamento' : 'pedido'} (opcional)
          <input name="condicao_texto" id="in-cond-texto" value="${esc(doc.condicao_texto || '')}"
            placeholder="Ex.: 30/60/90 dias — boleto, primeira em 15/03" ${bloqueado ? 'readonly' : ''}>
          <small class="ajuda">Se preencher, este texto substitui o prazo da lista acima no PDF e no WhatsApp.</small></label>
        <div id="info-cliente"></div>
      </div></div>

      <div class="cartao"><div class="cartao-tit">Itens
        ${bloqueado ? '' : `<span style="display:flex;gap:8px">
          <button type="button" class="btn btn-peq" id="btn-item-livre">+ Item avulso</button>
          <button type="button" class="btn btn-primario btn-peq" id="btn-add-produto">+ Adicionar produto</button></span>`}
      </div>
      <div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table class="itens-pedido">
        <thead><tr><th style="width:100px">Código</th><th>Descrição</th><th style="width:60px">Un</th>
          <th style="width:90px" class="dir">Qtd</th><th style="width:110px" class="dir">Preço</th>
          <th style="width:80px" class="dir">Desc %</th><th style="width:75px" class="dir">IPI %</th>
          <th style="width:110px" class="dir">Total</th><th style="width:38px"></th></tr></thead>
        <tbody id="corpo-itens"></tbody>
      </table></div></div></div>

      <div class="grade cartoes">
        <div class="cartao"><div class="cartao-tit">Observações</div><div class="cartao-corpo">
          <textarea name="observacoes" placeholder="Instruções de entrega, negociação, prazo especial…" ${bloqueado ? 'readonly' : ''}>${esc(doc.observacoes || '')}</textarea>
        </div></div>
        <div class="cartao"><div class="cartao-tit">Totais</div><div class="cartao-corpo">
          <div class="grade g3">
            <label class="campo">Desconto geral (%)<input type="number" step="0.01" name="desconto_pct" id="in-desc" value="${n(doc.desconto_pct)}" ${bloqueado ? 'readonly' : ''}></label>
            <label class="campo">Frete (R$)<input type="number" step="0.01" name="frete" id="in-frete" value="${n(doc.frete)}" ${bloqueado ? 'readonly' : ''}></label>
            <label class="campo">Comissão (%)
              <input type="number" step="0.01" min="0" id="in-comissao"
                value="${doc.comissao_pct === null || doc.comissao_pct === undefined ? '' : doc.comissao_pct}"
                placeholder="da representada" ${bloqueado ? 'readonly' : ''}>
              <small class="ajuda">Deixe vazio para usar a % da representada.</small></label>
          </div>
          <table style="font-size:13.5px"><tbody id="corpo-totais"></tbody></table>
        </div></div>
      </div>
    </form>`);

    /* ---- carregamento dependente da representada */
    async function carregarRepresentada(manter) {
      const repId = $('#sel-rep').value;
      const selT = $('#sel-tabela'), selC = $('#sel-condicao');
      if (!repId) { selT.innerHTML = '<option value="">—</option>'; selC.innerHTML = '<option value="">—</option>'; produtos = []; return; }
      [tabelas, condicoes] = await Promise.all([get('/tabelas?representada_id=' + repId), get('/condicoes?representada_id=' + repId)]);
      const padraoT = tabelas.find(t => t.padrao) || tabelas[0];
      selT.innerHTML = '<option value="">Preço base do cadastro</option>' +
        tabelas.filter(t => t.ativo).map(t => `<option value="${t.id}">${esc(t.nome)}</option>`).join('');
      selT.value = (manter && doc.tabela_id) ? doc.tabela_id : (padraoT ? padraoT.id : '');
      const padraoC = condicoes.find(c => c.padrao) || condicoes[0];
      selC.innerHTML = '<option value="">Não informado</option>' +
        condicoes.filter(c => c.ativo).map(c => `<option value="${c.id}">${esc(c.descricao)}${c.acrescimo_pct ? ` (+${c.acrescimo_pct}%)` : ''}${c.desconto_pct ? ` (-${c.desconto_pct}%)` : ''}</option>`).join('');
      selC.value = (manter && doc.condicao_id) ? doc.condicao_id : (padraoC ? padraoC.id : '');
      await carregarProdutos();
    }
    async function carregarProdutos() {
      const repId = $('#sel-rep').value, tab = $('#sel-tabela').value;
      produtos = repId ? await get(`/produtos?representada_id=${repId}&ativo=1&limite=2000${tab ? '&tabela_id=' + tab : ''}`) : [];
    }
    $('#sel-rep').addEventListener('change', () => { itens = []; desenharItens(); carregarRepresentada(false); });
    $('#sel-tabela').addEventListener('change', async () => {
      await carregarProdutos();
      if (itens.length && confirm('Atualizar os preços dos itens para a nova tabela?')) {
        itens.forEach(it => { const p = produtos.find(x => x.id === it.produto_id); if (p) it.preco_unit = n(p.preco_venda); });
        desenharItens();
      }
    });
    $('#sel-condicao').addEventListener('change', () => {
      const c = condicoes.find(x => x.id === Number($('#sel-condicao').value));
      if (c && (c.acrescimo_pct || c.desconto_pct)) {
        $('#in-desc').value = (n(c.desconto_pct) - n(c.acrescimo_pct)).toFixed(2);
        totais();
      }
    });
    $('[name=cliente_id]').addEventListener('change', mostrarCliente);
    function mostrarCliente() {
      const c = clientes.find(x => x.id === Number($('[name=cliente_id]').value));
      if (!c) { $('#info-cliente').innerHTML = ''; return; }
      const endereco = esc([c.logradouro, c.numero, c.bairro, [c.cidade, c.uf].filter(Boolean).join('/')].filter(Boolean).join(', '));
      const partes = [
        c.cnpj ? `CNPJ <span class="cod">${cnpjFmt(c.cnpj)}</span>` : '',
        c.telefone ? esc(c.telefone) : '',
        endereco,
        c.qtd_pedidos ? `${c.qtd_pedidos} pedido(s), última compra ${dataBR(c.ultima_compra)}` : 'primeiro pedido deste cliente',
      ].filter(Boolean);
      $('#info-cliente').innerHTML = `<div class="resumo-cliente"><b>${esc(c.razao_social)}</b>
        ${partes.map(x => `<span>${x}</span>`).join('')}</div>`;
    }

    /* ---- itens */
    function desenharItens() {
      $('#corpo-itens').innerHTML = itens.length ? itens.map((it, i) => `
        <tr data-i="${i}" class="${it._vozDuvida ? 'item-duvida' : ''}">
          <td><input value="${esc(it.codigo || '')}" data-c="codigo" ${bloqueado ? 'readonly' : ''}></td>
          <td><input value="${esc(it.descricao || '')}" data-c="descricao" ${bloqueado ? 'readonly' : ''}>
            ${it._vozDuvida ? `<div class="voz-escolha">
              <small>você disse “${esc(it._vozFalado || '')}” — confirme qual produto:</small>
              <div class="chips">${(it._vozCandidatos || []).map((c, j) =>
                `<button type="button" class="chip" data-voz="${i}" data-c2="${j}">${esc(c.descricao)}</button>`).join('')}
                <button type="button" class="chip chip-ok" data-voz="${i}" data-c2="-1">manter como está</button></div>
            </div>` : ''}</td>
          <td><input value="${esc(it.unidade || 'UN')}" data-c="unidade" ${bloqueado ? 'readonly' : ''}></td>
          <td><input type="number" step="0.001" min="0" class="dir" value="${n(it.quantidade)}" data-c="quantidade" ${bloqueado ? 'readonly' : ''}></td>
          <td><input type="number" step="0.01" min="0" class="dir" value="${n(it.preco_unit)}" data-c="preco_unit" ${bloqueado ? 'readonly' : ''}></td>
          <td><input type="number" step="0.01" min="0" class="dir" value="${n(it.desconto_pct)}" data-c="desconto_pct" ${bloqueado ? 'readonly' : ''}></td>
          <td><input type="number" step="0.01" min="0" class="dir" value="${n(it.ipi_pct)}" data-c="ipi_pct" ${bloqueado ? 'readonly' : ''}></td>
          <td class="dir mono"><b>${dinheiro(n(it.quantidade) * n(it.preco_unit) * (1 - n(it.desconto_pct) / 100))}</b></td>
          <td class="cen">${bloqueado ? '' : `<a class="btn btn-peq btn-perigo" data-remover="${i}">×</a>`}</td>
        </tr>`).join('')
        : `<tr><td colspan="9" class="vazio"><b>Nenhum item</b>Clique em “Adicionar produto” para montar o ${eCot ? 'orçamento' : 'pedido'}.</td></tr>`;
      totais();
    }
    $('#corpo-itens').addEventListener('input', e => {
      const tr = e.target.closest('tr'); if (!tr) return;
      const it = itens[Number(tr.dataset.i)], c = e.target.dataset.c;
      if (!it || !c) return;
      it[c] = ['descricao', 'codigo', 'unidade'].includes(c) ? e.target.value : n(e.target.value);
      tr.cells[7].innerHTML = `<b>${dinheiro(n(it.quantidade) * n(it.preco_unit) * (1 - n(it.desconto_pct) / 100))}</b>`;
      totais();
    });
    $('#corpo-itens').addEventListener('click', e => {
      const r = e.target.dataset.remover;
      if (r !== undefined) {
        if (itens[Number(r)]?._vozFalado) vozUso.removidos++;
        itens.splice(Number(r), 1); desenharItens(); return;
      }
      // resolveu um item que a voz deixou em dúvida
      const v = e.target.dataset.voz;
      if (v !== undefined) {
        const it = itens[Number(v)], j = Number(e.target.dataset.c2);
        if (!it) return;
        if (j >= 0) {
          const p = (it._vozCandidatos || [])[j];
          if (p) {
            if (p.id !== it.produto_id) vozUso.trocados++;
            Object.assign(it, { produto_id: p.id, codigo: p.codigo, descricao: p.descricao,
              unidade: p.unidade || it.unidade, preco_unit: n(p.preco_venda ?? p.preco_base ?? it.preco_unit),
              ipi_pct: n(p.ipi_pct) });
          }
        }
        it._vozDuvida = false;
        desenharItens();
      }
    });
    ['#in-desc', '#in-frete', '#in-comissao'].forEach(s => $(s).addEventListener('input', totais));

    function totais() {
      const bruto = itens.reduce((s, it) => s + n(it.quantidade) * n(it.preco_unit) * (1 - n(it.desconto_pct) / 100), 0);
      const dp = n($('#in-desc').value), frete = n($('#in-frete').value);
      const base = bruto * (1 - dp / 100);
      const ipi = itens.reduce((s, it) => s + n(it.quantidade) * n(it.preco_unit) * (1 - n(it.desconto_pct) / 100) * (1 - dp / 100) * (n(it.ipi_pct) / 100), 0);
      const total = base + ipi + frete;
      const rep = estado.representadas.find(r => r.id === Number($('#sel-rep').value));
      const pecas = itens.reduce((s, it) => s + n(it.quantidade), 0);
      // % do pedido quando preenchida; senão a da representada
      const pcTxt = ($('#in-comissao')?.value || '').trim();
      const comPct = pcTxt === '' ? n(rep?.comissao_pct) : n(pcTxt);
      const comProprio = pcTxt !== '' && n(pcTxt) !== n(rep?.comissao_pct);
      $('#corpo-totais').innerHTML = `
        <tr><td>Subtotal</td><td class="dir mono">${dinheiro(bruto)}</td></tr>
        ${dp ? `<tr><td>Desconto ${pct(dp)}</td><td class="dir mono neg">- ${dinheiro(bruto * dp / 100)}</td></tr>` : ''}
        ${ipi ? `<tr><td>IPI</td><td class="dir mono">${dinheiro(ipi)}</td></tr>` : ''}
        ${frete ? `<tr><td>Frete</td><td class="dir mono">${dinheiro(frete)}</td></tr>` : ''}
        <tr><td style="border-top:2px solid var(--borda)"><b>TOTAL</b></td>
            <td class="dir mono" style="border-top:2px solid var(--borda);font-size:19px"><b>${dinheiro(total)}</b></td></tr>
        <tr><td colspan="2" class="resumo-totais">
          <span>${itens.length} item(ns)</span><span>${numero(pecas)} unidade(s)</span>
          ${comPct ? `<span>comissão ${pct(comPct)} = ${dinheiro(base * comPct / 100)}${comProprio ? ' <b>(deste pedido)</b>' : ''}</span>` : ''}
          ${rep && rep.pedido_minimo ? `<span>mínimo ${dinheiro(rep.pedido_minimo)}</span>` : ''}</td></tr>`;
    }

    /* ---- adicionar produto */
    $('#btn-add-produto')?.addEventListener('click', () => {
      if (!$('#sel-rep').value) return erro('Escolha a representada primeiro.');
      if (!produtos.length) return erro('Nenhum produto cadastrado para esta representada.');
      abrirModal(`<h3>Adicionar produto</h3>
        <input id="busca-prod" placeholder="Digite código ou descrição…" autofocus>
        <div class="busca-lista" id="lista-prod"></div>
        <div class="modal-acoes"><button class="btn" onclick="window.__fechar()">Fechar</button></div>`);
      const desenhar = () => {
        const t = $('#busca-prod').value.toLowerCase();
        const f = produtos.filter(p => !t || (p.descricao + ' ' + p.codigo).toLowerCase().includes(t)).slice(0, 80);
        $('#lista-prod').innerHTML = f.length ? f.map(p => `<div data-p="${p.id}" class="linha-prod">
          ${fotoProduto(p)}
          <span><b>${esc(p.descricao)}</b> — ${dinheiro(p.preco_venda)}
          <small>${esc(p.codigo)} • ${esc(p.unidade)}${p.embalagem > 1 ? ` • cx ${numero(p.embalagem)}` : ''}${p.ipi_pct ? ` • IPI ${p.ipi_pct}%` : ''}${p.estoque ? ` • estoque ${numero(p.estoque)}` : ''}</small></span></div>`).join('')
          : '<div style="padding:14px;color:var(--suave)">Nenhum produto encontrado.</div>';
      };
      desenhar();
      $('#busca-prod').addEventListener('input', desenhar);
      $('#lista-prod').addEventListener('click', e => {
        const div = e.target.closest('[data-p]'); if (!div) return;
        const p = produtos.find(x => x.id === Number(div.dataset.p));
        const existente = itens.find(i => i.produto_id === p.id);
        if (existente) existente.quantidade = n(existente.quantidade) + (p.embalagem > 1 ? n(p.embalagem) : 1);
        else itens.push({
          produto_id: p.id, codigo: p.codigo, descricao: p.descricao, unidade: p.unidade,
          quantidade: p.embalagem > 1 ? n(p.embalagem) : 1, preco_unit: n(p.preco_venda), desconto_pct: 0, ipi_pct: n(p.ipi_pct),
        });
        desenharItens(); $('#busca-prod').value = ''; $('#busca-prod').focus(); desenhar();
        ok(p.descricao + ' adicionado');
      });
    });
    /* ---- ditado por voz ---- */
    $('#btn-voz')?.addEventListener('click', () => {
      // num pedido novo a voz também escolhe cliente e representada; num já aberto, só soma itens
      const modo = (!id && !$('#sel-rep').value) ? 'pedido' : 'itens';
      abrirVoz(modo, async (a) => {
        vozUso.usou = true;
        vozUso.texto = a.texto;

        if (modo === 'pedido') {
          if (a.representada_id && Number($('#sel-rep').value) !== a.representada_id) {
            $('#sel-rep').value = a.representada_id;
            await carregarRepresentada(false);   // traz os preços da representada certa
          }
          if (a.cliente) {
            const sc = $('[name=cliente_id]');
            if ([...sc.options].some(o => Number(o.value) === a.cliente.x.id)) {
              sc.value = a.cliente.x.id; mostrarCliente();
            }
          }
        }
        if (!$('#sel-rep').value) return erro('Escolha a representada para o sistema trazer os preços.');

        let entraram = 0;
        for (const i of a.itens) {
          const alvo = i.candidatos[0].x;
          // o preço vem da tabela carregada para a representada deste pedido
          const p = produtos.find(x => x.id === alvo.id);
          if (!p) continue;   // produto de outra representada: não cabe neste pedido
          const cands = i.candidatos.map(c => produtos.find(x => x.id === c.x.id)).filter(Boolean);
          itens.push({
            produto_id: p.id, codigo: p.codigo, descricao: p.descricao,
            unidade: i.unidade || p.unidade, quantidade: i.qtd,
            preco_unit: n(p.preco_venda), desconto_pct: 0, ipi_pct: n(p.ipi_pct),
            _vozFalado: i.consulta, _vozDuvida: !!i.duvida, _vozCandidatos: cands,
          });
          entraram++;
          vozUso.propostos++;
          if (i.duvida) vozUso.duvidosos++;
        }
        desenharItens();
        const fora = a.itens.length - entraram;
        if (!entraram) erro('Nenhum item desta fala pertence à representada escolhida.');
        else ok(`${entraram} item(ns) do ditado${fora ? ` — ${fora} ficaram de fora por serem de outra representada` : ''}.`);
      });
    });

    $('#btn-item-livre')?.addEventListener('click', () => {
      itens.push({ produto_id: null, codigo: '', descricao: '', unidade: 'UN', quantidade: 1, preco_unit: 0, desconto_pct: 0, ipi_pct: 0 });
      desenharItens();
      const ult = $('#corpo-itens').lastElementChild?.querySelector('[data-c=descricao]'); ult?.focus();
    });

    /* ---- salvar */
    $('#btn-salvar')?.addEventListener('click', async () => {
      // item que a voz não teve certeza não vai para o cliente sem alguém confirmar
      const pendentes = itens.filter(i => i._vozDuvida).length;
      if (pendentes) {
        $('#corpo-itens').querySelector('.item-duvida')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return erro(`${pendentes} item(ns) do ditado ainda esperam sua confirmação. ` +
          'Toque no produto certo na linha laranja antes de salvar.');
      }
      const f = dadosForm($('#form-pedido'));
      // os campos do ditado são só da tela: não vão para o banco
      const limpos = itens.map(({ _vozDuvida, _vozCandidatos, _vozFalado, ...resto }) => resto);
      const corpo = { ...f, tipo: doc.tipo, itens: limpos };
      // vazio = herda a % da representada (null), e não zero
      const pc = $('#in-comissao').value.trim();
      corpo.comissao_pct = pc === '' ? null : Number(pc);
      try {
        const salvo = id ? await api('PUT', '/pedidos/' + id, corpo) : await api('POST', '/pedidos', corpo);
        ok(`${eCot ? 'Cotação' : 'Pedido'} ${salvo.numero} salvo!`);
        if (vozUso.usou) await perguntarVoz(salvo, vozUso);
        location.hash = `#/${eCot ? 'cotacao' : 'pedido'}/${salvo.id}`;
        if (id) rotear();
      } catch (e) { erro(e); }
    });

    /* ---- ações do documento */
    $('#btn-situacao')?.addEventListener('click', () => {
      const lista = eCot ? ['rascunho', 'enviada', 'ganha', 'perdida', 'cancelado'] : ['rascunho', 'aberto', 'enviado', 'faturado', 'cancelado'];
      abrirModal(`<h3>Alterar situação</h3>
        <div class="busca-lista lista-situacao">${lista.map(s => `<div data-s="${s}">${etq(s)}
          ${s === doc.status ? '<span class="atual">atual</span>' : ''}</div>`).join('')}</div>`);
      $('#modal-corpo .busca-lista').addEventListener('click', async e => {
        const d = e.target.closest('[data-s]'); if (!d) return;
        try { await api('POST', `/pedidos/${id}/status`, { status: d.dataset.s }); fecharModal(); ok('Situação atualizada.'); rotear(); }
        catch (x) { erro(x); }
      });
    });

    $('#btn-mais')?.addEventListener('click', () => {
      abrirModal(`<h3>Mais ações</h3><div class="busca-lista">
        <div data-a="duplicar"><b>Duplicar</b><small>Cria uma cópia com a data de hoje</small></div>
        ${eCot ? '<div data-a="converter"><b>Converter em pedido</b><small>Gera o pedido e marca a cotação como ganha</small></div>'
          : '<div data-a="devolucao"><b>Lançar devolução</b><small>Mercadoria que voltou: estorna da comissão</small></div>'}
        <div data-a="excluir" class="perigo"><b>Excluir</b><small>Remove definitivamente</small></div>
      </div>`);
      $('#modal-corpo .busca-lista').addEventListener('click', async e => {
        const d = e.target.closest('[data-a]'); if (!d) return;
        try {
          if (d.dataset.a === 'devolucao') { fecharModal(); lancarDevolucao(doc, rotear); return; }
          if (d.dataset.a === 'duplicar') { const novo = await api('POST', `/pedidos/${id}/duplicar`); fecharModal(); ok('Cópia criada: ' + novo.numero); location.hash = `#/${eCot ? 'cotacao' : 'pedido'}/${novo.id}`; rotear(); }
          if (d.dataset.a === 'converter') { const novo = await api('POST', `/pedidos/${id}/converter`); fecharModal(); ok('Pedido gerado: ' + novo.numero); location.hash = '#/pedido/' + novo.id; rotear(); }
          if (d.dataset.a === 'excluir') {
            if (!confirm('Excluir definitivamente?')) return;
            await api('DELETE', '/pedidos/' + id); fecharModal(); ok('Excluído.'); location.hash = eCot ? '#/cotacoes' : '#/pedidos';
          }
        } catch (x) { erro(x); }
      });
    });

    $('#btn-enviar')?.addEventListener('click', async () => {
      const t = await get(`/pedidos/${id}/texto`);
      abrirModal(`<h3>Enviar cópia ${eCot ? 'da cotação' : 'do pedido'}</h3>
        <div class="grade g3" style="margin-bottom:14px">
          <a class="btn btn-verde btn-bloco" href="${t.whatsapp}" target="_blank">WhatsApp</a>
          <a class="btn btn-bloco" href="mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent(t.assunto)}&body=${encodeURIComponent(t.texto.replace(/\*/g, ''))}">E-mail</a>
          <a class="btn btn-bloco" href="/api/pedidos/${id}/pdf?download=1" target="_blank">Baixar PDF</a>
        </div>
        <label class="campo">Texto da mensagem (edite se quiser e copie)
          <textarea id="txt-copia" style="min-height:230px;font-family:ui-monospace,monospace;font-size:12px">${esc(t.texto)}</textarea></label>
        <div class="modal-acoes">
          <button class="btn" id="btn-copiar">Copiar texto</button>
          <button class="btn btn-primario" onclick="window.__fechar()">Fechar</button></div>`);
      $('#btn-copiar').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText($('#txt-copia').value); ok('Texto copiado!'); }
        catch { $('#txt-copia').select(); document.execCommand('copy'); ok('Texto copiado!'); }
      });
    });

    await carregarRepresentada(true);
    if (doc.tabela_id) $('#sel-tabela').value = doc.tabela_id;
    if (doc.condicao_id) $('#sel-condicao').value = doc.condicao_id;
    mostrarCliente();
    desenharItens();
  };
}
telas.pedido = editor('pedido');
telas.cotacao = editor('cotacao');
window.__fechar = fecharModal;

/* =========================================================================
   CLIENTES
   ========================================================================= */
telas.clientes = async () => {
  titulo('Clientes');
  acoes(`<button class="btn btn-primario" id="btn-novo">+ Novo cliente</button>`);
  pintar(`<div class="filtros">
      <label class="campo">Buscar<input id="f-busca" placeholder="Razão social, CNPJ, cidade…" style="min-width:260px"></label>
      <label class="campo">Situação<select id="f-ativo"><option value="1">Ativos</option><option value="">Todos</option><option value="0">Inativos</option></select></label>
    </div>
    <div class="cartao"><div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
      <thead><tr><th>Cliente</th><th>CNPJ</th><th>Cidade</th><th>Contato</th><th class="cen">Pedidos</th>
        <th class="dir">Total comprado</th><th>Última compra</th><th></th></tr></thead>
      <tbody id="corpo"><tr><td colspan="8" class="vazio">Carregando…</td></tr></tbody></table></div></div></div>`);

  const carregar = async () => {
    const lista = await get(`/clientes?busca=${encodeURIComponent($('#f-busca').value)}&ativo=${$('#f-ativo').value}`);
    $('#corpo').innerHTML = lista.length ? lista.map(c => `<tr>
      <td><b>${esc(c.nome_fantasia || c.razao_social)}</b>${!c.ativo ? ' <span class="etq etq-cinza">inativo</span>' : ''}
        <br><small style="color:var(--suave)">${esc(c.razao_social)}</small></td>
      <td class="cod">${cnpjFmt(c.cnpj)}</td>
      <td>${esc([c.cidade, c.uf].filter(Boolean).join('/'))}</td>
      <td><small>${esc(c.contato || '')}${c.telefone ? '<br>' + esc(c.telefone) : ''}</small></td>
      <td class="cen">${c.qtd_pedidos}</td><td class="dir mono">${dinheiro(c.total_comprado)}</td>
      <td>${dataBR(c.ultima_compra)}</td>
      <td class="dir"><div class="linha-acoes">
        <button class="btn btn-peq" data-editar="${c.id}">Editar</button>
        <a class="btn btn-peq" href="#/pedido/novo">Pedido</a></div></td></tr>`).join('')
      : `<tr><td colspan="8" class="vazio"><b>Nenhum cliente</b>Cadastre o primeiro para começar a lançar pedidos.</td></tr>`;
    $$('#corpo [data-editar]').forEach(b => b.addEventListener('click', () => formCliente(lista.find(x => x.id === Number(b.dataset.editar)), carregar)));
  };
  let t; $('#f-busca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 350); });
  $('#f-ativo').addEventListener('change', carregar);
  $('#btn-novo').addEventListener('click', () => formCliente(null, carregar));
  await carregar();
};

function formCliente(c, aoSalvar) {
  c = c || { ativo: 1, uf: '' };
  const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];
  abrirModal(`<h3>${c.id ? 'Editar cliente' : 'Novo cliente'}</h3>
  <form id="form-cliente">
    <p class="sub-tit">Identificação</p>
    <div class="grade g4">
      <label class="campo">CNPJ / CPF<div style="display:flex;gap:6px">
        <input name="cnpj" id="in-cnpj" value="${esc(c.cnpj || '')}" placeholder="00.000.000/0000-00">
        <button type="button" class="btn" id="btn-buscar-cnpj" title="Buscar dados na Receita">🔎</button></div></label>
      <label class="campo" style="grid-column:span 2">Razão social *<input name="razao_social" value="${esc(c.razao_social || '')}" required></label>
      <label class="campo">Nome fantasia<input name="nome_fantasia" value="${esc(c.nome_fantasia || '')}"></label>
    </div>
    <div class="grade g4">
      <label class="campo">Inscrição estadual<input name="ie" value="${esc(c.ie || '')}"></label>
      <label class="campo">Contato<input name="contato" value="${esc(c.contato || '')}"></label>
      <label class="campo">Telefone / WhatsApp<input name="telefone" value="${esc(c.telefone || '')}" placeholder="41 99999-9999"></label>
      <label class="campo">E-mail<input type="email" name="email" value="${esc(c.email || '')}"></label>
    </div>
    <p class="sub-tit">Endereço</p>
    <div class="grade g4">
      <label class="campo">CEP<div style="display:flex;gap:6px">
        <input name="cep" id="in-cep" value="${esc(c.cep || '')}" placeholder="80000-000">
        <button type="button" class="btn" id="btn-buscar-cep">🔎</button></div></label>
      <label class="campo" style="grid-column:span 2">Logradouro<input name="logradouro" value="${esc(c.logradouro || '')}"></label>
      <label class="campo">Número<input name="numero" value="${esc(c.numero || '')}"></label>
    </div>
    <div class="grade g4">
      <label class="campo">Complemento<input name="complemento" value="${esc(c.complemento || '')}"></label>
      <label class="campo">Bairro<input name="bairro" value="${esc(c.bairro || '')}"></label>
      <label class="campo">Cidade<input name="cidade" value="${esc(c.cidade || '')}"></label>
      <label class="campo">UF<select name="uf"><option value=""></option>${UFS.map(u => `<option ${c.uf === u ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
    </div>
    <p class="sub-tit">Outros</p>
    <div class="grade g3">
      <label class="campo">Situação cadastral<input name="situacao" value="${esc(c.situacao || '')}" readonly></label>
      <label class="campo">Atividade principal<input name="atividade" value="${esc(c.atividade || '')}" readonly></label>
      <label class="campo">Ativo<select name="ativo"><option value="1" ${c.ativo ? 'selected' : ''}>Sim</option><option value="0" ${!c.ativo ? 'selected' : ''}>Não</option></select></label>
    </div>
    <label class="campo">Observações<textarea name="observacoes">${esc(c.observacoes || '')}</textarea></label>
    <div class="modal-acoes">
      ${c.id ? '<button type="button" class="btn btn-perigo" id="btn-excluir">Excluir</button>' : ''}
      <button type="button" class="btn" onclick="window.__fechar()">Cancelar</button>
      <button type="submit" class="btn btn-primario">Salvar cliente</button></div>
  </form>`);

  const preencher = (d) => { for (const [k, v] of Object.entries(d)) { const el = $(`[name=${k}]`, $('#form-cliente')); if (el && v) el.value = v; } };

  $('#btn-buscar-cnpj').addEventListener('click', async () => {
    const cnpj = $('#in-cnpj').value.replace(/\D/g, '');
    if (cnpj.length !== 14) return erro('Digite os 14 dígitos do CNPJ.');
    $('#btn-buscar-cnpj').textContent = '…';
    try {
      const r = await get('/consulta/cnpj/' + cnpj);
      if (r.ja_cadastrado && r.ja_cadastrado.id !== c.id) aviso('Atenção: já existe cliente com este CNPJ — ' + r.ja_cadastrado.razao_social, 'erro');
      if (r.dados) { preencher(r.dados); ok('Dados encontrados na Receita Federal.'); }
      else erro(r.aviso || 'Não encontrado.');
    } catch (e) { erro(e); } finally { $('#btn-buscar-cnpj').textContent = '🔎'; }
  });
  $('#in-cnpj').addEventListener('blur', () => { const d = $('#in-cnpj').value.replace(/\D/g, ''); if (d.length === 14) $('#in-cnpj').value = cnpjFmt(d); });
  $('#btn-buscar-cep').addEventListener('click', async () => {
    const cep = $('#in-cep').value.replace(/\D/g, '');
    if (cep.length !== 8) return erro('Digite os 8 dígitos do CEP.');
    try { const r = await get('/consulta/cep/' + cep); if (r.dados) { preencher(r.dados); ok('Endereço preenchido.'); } else erro(r.aviso); }
    catch (e) { erro(e); }
  });
  $('#btn-excluir')?.addEventListener('click', async () => {
    if (!confirm('Excluir este cliente? Se houver pedidos, prefira marcar como inativo.')) return;
    try { await api('DELETE', '/clientes/' + c.id); fecharModal(); ok('Cliente excluído.'); aoSalvar(); } catch (e) { erro(e); }
  });
  $('#form-cliente').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const d = dadosForm(e.target);
      c.id ? await api('PUT', '/clientes/' + c.id, d) : await api('POST', '/clientes', d);
      fecharModal(); ok('Cliente salvo!'); aoSalvar();
    } catch (x) { erro(x); }
  });
}

/* =========================================================================
   PRODUTOS
   ========================================================================= */
telas.produtos = async () => {
  titulo('Produtos');
  acoes(`<button class="btn" id="btn-catalogo">📕 Catálogo PDF</button>
         ${ehAdmin() ? `<button class="btn" id="btn-importar">Importar CSV</button>
         <button class="btn btn-primario" id="btn-novo">+ Novo produto</button>` : ''}`);
  pintar(`<div class="filtros">
      <label class="campo">Representada<select id="f-rep"><option value="">Todas</option>
        ${estado.representadas.map(r => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</select></label>
      <label class="campo">Tabela de preço<select id="f-tab"><option value="">Preço base</option></select></label>
      <label class="campo">Buscar<input id="f-busca" placeholder="Código ou descrição" style="min-width:220px"></label>
      <label class="campo">Situação<select id="f-ativo"><option value="1">Ativos</option><option value="">Todos</option><option value="0">Inativos</option></select></label>
    </div>
    <div class="cartao"><div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
      <thead><tr><th style="width:56px"></th><th>Código</th><th>Descrição</th><th>Representada</th><th class="cen">Un</th>
        <th class="dir">Preço base</th><th class="dir">Preço tabela</th><th class="dir">IPI</th>
        <th class="dir">Estoque</th><th></th></tr></thead>
      <tbody id="corpo"><tr><td colspan="10" class="vazio">Carregando…</td></tr></tbody></table></div></div></div>`);

  const carregarTabelas = async () => {
    const rep = $('#f-rep').value;
    const t = rep ? await get('/tabelas?representada_id=' + rep) : [];
    $('#f-tab').innerHTML = '<option value="">Preço base</option>' + t.map(x => `<option value="${x.id}">${esc(x.nome)}</option>`).join('');
  };
  const carregar = async () => {
    const p = new URLSearchParams();
    if ($('#f-rep').value) p.set('representada_id', $('#f-rep').value);
    if ($('#f-tab').value) p.set('tabela_id', $('#f-tab').value);
    if ($('#f-busca').value) p.set('busca', $('#f-busca').value);
    if ($('#f-ativo').value) p.set('ativo', $('#f-ativo').value);
    const lista = await get('/produtos?' + p);
    $('#corpo').innerHTML = lista.length ? lista.map(x => `<tr>
      <td>${fotoProduto(x)}</td>
      <td class="cod">${esc(x.codigo)}</td>
      <td><b>${esc(x.descricao)}</b>${x.embalagem > 1 ? `<br><small style="color:var(--suave)">Caixa com ${numero(x.embalagem)}</small>` : ''}</td>
      <td><small>${esc(x.representada_nome)}</small></td><td class="cen">${esc(x.unidade)}</td>
      <td class="dir mono">${dinheiro(x.preco_base)}</td>
      <td class="dir mono">${x.preco_tabela != null ? `<b>${dinheiro(x.preco_tabela)}</b>` : '<span style="color:var(--suave)">—</span>'}</td>
      <td class="dir">${x.ipi_pct ? pct(x.ipi_pct) : '-'}</td><td class="dir mono">${numero(x.estoque)}</td>
      <td class="dir"><div class="linha-acoes">${ehAdmin() ? `<button class="btn btn-peq" data-editar="${x.id}">Editar</button>
        ${$('#f-tab').value ? `<button class="btn btn-peq" data-preco="${x.id}">Preço</button>` : ''}` : ''}</div></td></tr>`).join('')
      : `<tr><td colspan="10" class="vazio"><b>Nenhum produto</b>Cadastre os produtos de cada representada.</td></tr>`;
    $$('#corpo [data-editar]').forEach(b => b.addEventListener('click', () => formProduto(lista.find(x => x.id === Number(b.dataset.editar)), carregar)));
    $$('#corpo [data-preco]').forEach(b => b.addEventListener('click', async () => {
      const prod = lista.find(x => x.id === Number(b.dataset.preco));
      const novo = prompt(`Preço de "${prod.descricao}" nesta tabela:`, prod.preco_tabela ?? prod.preco_base);
      if (novo === null) return;
      await api('POST', '/precos', { tabela_id: Number($('#f-tab').value), produto_id: prod.id, preco: Number(String(novo).replace(',', '.')) });
      ok('Preço gravado.'); carregar();
    }));
  };
  $('#f-rep').addEventListener('change', async () => { await carregarTabelas(); carregar(); });
  $('#f-tab').addEventListener('change', carregar);
  $('#f-ativo').addEventListener('change', carregar);
  let t; $('#f-busca').addEventListener('input', () => { clearTimeout(t); t = setTimeout(carregar, 300); });
  $('#btn-catalogo').addEventListener('click', () => {
    const rep = $('#f-rep').value, tab = $('#f-tab').value;
    if (!rep) return erro('Escolha a representada no filtro acima para gerar o catálogo.');
    window.open(`/api/catalogo?representada_id=${rep}${tab ? '&tabela_id=' + tab : ''}`, '_blank');
  });
  $('#btn-novo')?.addEventListener('click', () => formProduto(null, carregar));
  $('#btn-importar')?.addEventListener('click', () => importarProdutos(carregar));
  await carregar();
};

function formProduto(p, aoSalvar) {
  p = p || { ativo: 1, unidade: 'UN', embalagem: 1 };
  abrirModal(`<h3>${p.id ? 'Editar produto' : 'Novo produto'}</h3>
  <form id="form-produto">
    <div class="grade g3">
      <label class="campo">Representada *<select name="representada_id" required>
        <option value="">Selecione…</option>
        ${estado.representadas.map(r => `<option value="${r.id}" ${p.representada_id === r.id ? 'selected' : ''}>${esc(r.nome)}</option>`).join('')}</select></label>
      <label class="campo">Código *<input name="codigo" value="${esc(p.codigo || '')}" required></label>
      <label class="campo">Unidade<input name="unidade" value="${esc(p.unidade || 'UN')}"></label>
    </div>
    <label class="campo">Descrição *<input name="descricao" value="${esc(p.descricao || '')}" required></label>
    <div class="grade g4">
      <label class="campo">Preço base (R$)<input type="number" step="0.01" name="preco_base" value="${n(p.preco_base)}"></label>
      <label class="campo">IPI (%)<input type="number" step="0.01" name="ipi_pct" value="${n(p.ipi_pct)}"></label>
      <label class="campo">ST (%)<input type="number" step="0.01" name="st_pct" value="${n(p.st_pct)}"></label>
      <label class="campo">Desconto máx. (%)<input type="number" step="0.01" name="desconto_max_pct" value="${n(p.desconto_max_pct)}"></label>
    </div>
    <div class="grade g4">
      <label class="campo">Qtd por caixa<input type="number" step="0.001" name="embalagem" value="${n(p.embalagem) || 1}"></label>
      <label class="campo">Peso (kg)<input type="number" step="0.001" name="peso" value="${n(p.peso)}"></label>
      <label class="campo">Estoque<input type="number" step="0.001" name="estoque" value="${n(p.estoque)}"></label>
      <label class="campo">NCM<input name="ncm" value="${esc(p.ncm || '')}"></label>
    </div>
    <div class="grade g2">
      <label class="campo">Observações<input name="observacoes" value="${esc(p.observacoes || '')}"></label>
      <label class="campo">Ativo<select name="ativo"><option value="1" ${p.ativo ? 'selected' : ''}>Sim</option><option value="0" ${!p.ativo ? 'selected' : ''}>Não</option></select></label>
    </div>
    ${p.id ? `<p class="sub-tit">Foto do produto</p>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
      <div id="previa-foto" class="caixa-foto"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <label class="btn btn-primario" style="cursor:pointer">📷 Escolher / tirar foto
          <input type="file" id="arq-foto" accept="image/*" style="display:none"></label>
        ${p.imagem ? '<button type="button" class="btn btn-perigo" id="btn-tirar-foto">Remover foto</button>' : ''}
        <span style="color:var(--suave);font-size:12px;align-self:center">No celular abre a câmera direto.</span>
      </div>
    </div>` : '<div class="info-linha">Salve o produto primeiro para poder adicionar a foto.</div>'}
    <div class="modal-acoes">
      ${p.id ? '<button type="button" class="btn btn-perigo" id="btn-excluir">Excluir</button>' : ''}
      <button type="button" class="btn" onclick="window.__fechar()">Cancelar</button>
      <button type="submit" class="btn btn-primario">Salvar produto</button></div>
  </form>`);
  if (p.id) {
    const desenharPrevia = () => {
      $('#previa-foto').innerHTML = p.imagem
        ? `<img src="/api/produtos/${p.id}/imagem?v=${Date.now()}" alt="">`
        : '<span>sem foto</span>';
    };
    desenharPrevia();
    $('#arq-foto').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        aviso('Preparando a imagem…');
        const dados = await reduzirImagem(f);
        const r = await api('POST', `/produtos/${p.id}/imagem`, { dados });
        p.imagem = r.imagem; desenharPrevia(); ok('Foto salva!'); aoSalvar();
      } catch (x) { erro(x); }
    });
    $('#btn-tirar-foto')?.addEventListener('click', async () => {
      if (!confirm('Remover a foto deste produto?')) return;
      try { await api('DELETE', `/produtos/${p.id}/imagem`); p.imagem = ''; desenharPrevia(); ok('Foto removida.'); aoSalvar(); }
      catch (x) { erro(x); }
    });
  }

  $('#btn-excluir')?.addEventListener('click', async () => {
    if (!confirm('Excluir este produto?')) return;
    try { await api('DELETE', '/produtos/' + p.id); fecharModal(); ok('Produto excluído.'); aoSalvar(); } catch (e) { erro(e); }
  });
  $('#form-produto').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const d = dadosForm(e.target);
      if (p.id) { await api('PUT', '/produtos/' + p.id, d); fecharModal(); ok('Produto salvo!'); aoSalvar(); }
      else {
        const criado = await api('POST', '/produtos', d);
        ok('Produto criado! Agora você pode adicionar a foto.');
        aoSalvar(); formProduto(criado, aoSalvar);
      }
    } catch (x) { erro(x); }
  });
}

function importarProdutos(aoSalvar) {
  abrirModal(`<h3>Importar produtos por CSV / Excel</h3>
    <div class="info-linha">Cole abaixo as colunas na ordem:<br>
      <b>codigo ; descricao ; unidade ; preco ; ipi% ; qtd por caixa</b><br>
      Uma linha por produto. Você pode copiar direto do Excel (colunas separadas por TAB) ou usar <b>;</b> / <b>,</b>.</div>
    <label class="campo">Representada *<select id="imp-rep">
      <option value="">Selecione…</option>${estado.representadas.map(r => `<option value="${r.id}">${esc(r.nome)}</option>`).join('')}</select></label>
    <label class="campo">Dados<textarea id="imp-txt" style="min-height:200px;font-family:ui-monospace,monospace;font-size:12px"
      placeholder="1001;Vinho Malbec 750ml;UN;89,90;0;6&#10;1002;Queijo colonial 500g;UN;42,00;0;10"></textarea></label>
    <div class="modal-acoes"><button class="btn" onclick="window.__fechar()">Cancelar</button>
      <button class="btn btn-primario" id="imp-ok">Importar</button></div>`);
  $('#imp-ok').addEventListener('click', async () => {
    const rep = Number($('#imp-rep').value);
    if (!rep) return erro('Escolha a representada.');
    const linhas = $('#imp-txt').value.split('\n').map(l => l.trim()).filter(Boolean);
    let gravados = 0, falhas = 0;
    for (const l of linhas) {
      const col = l.split(/\t|;|(?:,(?=\s*\D))/).map(s => s.trim());
      if (col.length < 2) { falhas++; continue; }
      const preco = Number(String(col[3] || '0').replace(/\./g, '').replace(',', '.')) || 0;
      try {
        await api('POST', '/produtos', {
          representada_id: rep, codigo: col[0], descricao: col[1], unidade: col[2] || 'UN',
          preco_base: preco, ipi_pct: Number(String(col[4] || '0').replace(',', '.')) || 0,
          embalagem: Number(String(col[5] || '1').replace(',', '.')) || 1, ativo: 1,
        });
        gravados++;
      } catch { falhas++; }
    }
    fecharModal();
    ok(`${gravados} produto(s) importado(s).` + (falhas ? ` ${falhas} linha(s) com erro ou código repetido.` : ''));
    aoSalvar();
  });
}

/* =========================================================================
   REPRESENTADAS (+ tabelas de preço e condições de pagamento)
   ========================================================================= */
telas.representadas = async () => {
  titulo('Representadas');
  acoes(ehAdmin() ? `<button class="btn btn-primario" id="btn-nova">+ Nova representada</button>` : soAdmin);
  const carregar = async () => {
    estado.representadas = await get('/representadas');
    pintar(`<div class="cartao"><div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table>
      <thead><tr><th style="width:64px">Logo</th><th>Representada</th><th>CNPJ</th><th>Contato</th><th class="dir">Comissão</th>
        <th class="dir">Pedido mínimo</th><th class="cen">Produtos</th><th class="cen">Tabelas</th><th></th></tr></thead>
      <tbody>${estado.representadas.length ? estado.representadas.map(r => `<tr>
        <td>${logoRep(r)}</td>
        <td><b>${esc(r.nome)}</b>${!r.ativo ? ' <span class="etq etq-cinza">inativa</span>' : ''}</td>
        <td class="cod">${cnpjFmt(r.cnpj)}</td>
        <td><small>${esc(r.contato || '')}${r.telefone ? '<br>' + esc(r.telefone) : ''}</small></td>
        <td class="dir">${pct(r.comissao_pct)}</td><td class="dir mono">${r.pedido_minimo ? dinheiro(r.pedido_minimo) : '-'}</td>
        <td class="cen">${r.qtd_produtos}</td><td class="cen">${r.qtd_tabelas}</td>
        <td class="dir"><div class="linha-acoes">${ehAdmin() ? `
          <button class="btn btn-peq" data-tabelas="${r.id}">Tabelas</button>
          <button class="btn btn-peq" data-prazos="${r.id}">Prazos</button>
          <button class="btn btn-peq" data-editar="${r.id}">Editar</button>` : ''}</div></td></tr>`).join('')
        : `<tr><td colspan="9" class="vazio"><b>Nenhuma representada</b>Comece cadastrando as empresas que você representa.</td></tr>`}
      </tbody></table></div></div></div>`);
    $$('[data-editar]').forEach(b => b.addEventListener('click', () => formRepresentada(estado.representadas.find(x => x.id === Number(b.dataset.editar)), carregar)));
    $$('[data-tabelas]').forEach(b => b.addEventListener('click', () => gerenciarTabelas(Number(b.dataset.tabelas), carregar)));
    $$('[data-prazos]').forEach(b => b.addEventListener('click', () => gerenciarCondicoes(Number(b.dataset.prazos), carregar)));
  };
  $('#btn-nova')?.addEventListener('click', () => formRepresentada(null, carregar));
  await carregar();
};

function formRepresentada(r, aoSalvar) {
  r = r || { ativo: 1, comissao_pct: 5 };
  abrirModal(`<h3>${r.id ? 'Editar representada' : 'Nova representada'}</h3>
  <form id="form-rep">
    <div class="grade g2">
      <label class="campo">Nome / marca *<input name="nome" value="${esc(r.nome || '')}" required></label>
      <label class="campo">CNPJ<input name="cnpj" value="${esc(r.cnpj || '')}"></label>
    </div>
    <div class="grade g3">
      <label class="campo">Pessoa de contato<input name="contato" value="${esc(r.contato || '')}"></label>
      <label class="campo">Telefone<input name="telefone" value="${esc(r.telefone || '')}"></label>
      <label class="campo">E-mail (envio de pedidos)<input type="email" name="email" value="${esc(r.email || '')}"></label>
    </div>
    <div class="grade g3">
      <label class="campo">Comissão (%)<input type="number" step="0.01" name="comissao_pct" value="${n(r.comissao_pct)}"></label>
      <label class="campo">Pedido mínimo (R$)<input type="number" step="0.01" name="pedido_minimo" value="${n(r.pedido_minimo)}"></label>
      <label class="campo">Ativa<select name="ativo"><option value="1" ${r.ativo ? 'selected' : ''}>Sim</option><option value="0" ${!r.ativo ? 'selected' : ''}>Não</option></select></label>
    </div>
    <label class="campo">Observações<textarea name="observacoes">${esc(r.observacoes || '')}</textarea></label>
    ${r.id ? `<p class="sub-tit">Logomarca da representada</p>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
      <div id="previa-logo" class="caixa-logo"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <label class="btn btn-primario" style="cursor:pointer">🖼️ Escolher logomarca
          <input type="file" id="arq-logo" accept="image/*" style="display:none"></label>
        ${r.logo ? '<button type="button" class="btn btn-perigo" id="btn-tirar-logo">Remover</button>' : ''}
        <span style="color:var(--suave);font-size:12px;align-self:center;max-width:230px">
          Aparece no PDF do pedido e na lista de representadas.</span>
      </div>
    </div>` : '<div class="info-linha">Salve a representada primeiro para poder enviar a logomarca.</div>'}
    <div class="modal-acoes">
      ${r.id ? '<button type="button" class="btn btn-perigo" id="btn-excluir">Excluir</button>' : ''}
      <button type="button" class="btn" onclick="window.__fechar()">Cancelar</button>
      <button type="submit" class="btn btn-primario">Salvar</button></div>
  </form>`);
  if (r.id) {
    const desenharLogo = () => {
      $('#previa-logo').innerHTML = r.logo
        ? `<img src="/api/representadas/${r.id}/logo?v=${Date.now()}" alt="">`
        : '<span>sem logo</span>';
    };
    desenharLogo();
    $('#arq-logo').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        aviso('Preparando a imagem…');
        const dados = await reduzirImagem(f, 600, 0.9);
        const x = await api('POST', `/representadas/${r.id}/logo`, { dados });
        r.logo = x.logo; desenharLogo(); ok('Logomarca salva!'); aoSalvar();
      } catch (x) { erro(x); }
    });
    $('#btn-tirar-logo')?.addEventListener('click', async () => {
      if (!confirm('Remover a logomarca desta representada?')) return;
      try { await api('DELETE', `/representadas/${r.id}/logo`); r.logo = ''; desenharLogo(); ok('Logomarca removida.'); aoSalvar(); }
      catch (x) { erro(x); }
    });
  }
  $('#btn-excluir')?.addEventListener('click', async () => {
    if (!confirm('Excluir a representada apaga também seus produtos e tabelas. Continuar?')) return;
    try { await api('DELETE', '/representadas/' + r.id); fecharModal(); ok('Excluída.'); aoSalvar(); } catch (e) { erro(e); }
  });
  $('#form-rep').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const d = dadosForm(e.target);
      r.id ? await api('PUT', '/representadas/' + r.id, d) : await api('POST', '/representadas', d);
      fecharModal(); ok('Representada salva!'); aoSalvar();
    } catch (x) { erro(x); }
  });
}

async function gerenciarTabelas(repId, aoFechar) {
  const rep = estado.representadas.find(r => r.id === repId);
  const desenhar = async () => {
    const lista = await get('/tabelas?representada_id=' + repId);
    abrirModal(`<h3>Tabelas de preço — ${esc(rep.nome)}</h3>
      <div class="cartao"><div class="cartao-corpo sem-pad"><table>
        <thead><tr><th>Tabela</th><th>Vigência</th><th class="cen">Padrão</th><th class="cen">Itens</th><th></th></tr></thead>
        <tbody>${lista.length ? lista.map(t => `<tr>
          <td><b>${esc(t.nome)}</b>${!t.ativo ? ' <span class="etq etq-cinza">inativa</span>' : ''}</td>
          <td><small>${t.vigencia_inicio ? dataBR(t.vigencia_inicio) : ''} ${t.vigencia_fim ? '→ ' + dataBR(t.vigencia_fim) : ''}</small></td>
          <td class="cen">${t.padrao ? '✔' : ''}</td><td class="cen">${t.qtd_precos}</td>
          <td class="dir"><button class="btn btn-peq btn-perigo" data-del="${t.id}">Excluir</button></td></tr>`).join('')
          : '<tr><td colspan="5" class="vazio">Nenhuma tabela. Sem tabela, o sistema usa o preço base do produto.</td></tr>'}</tbody></table></div></div>
      <form id="form-tab"><p class="sub-tit">Nova tabela</p>
        <div class="grade g4">
          <label class="campo">Nome<input name="nome" placeholder="Tabela 2026 / Promocional" required></label>
          <label class="campo">Início<input type="date" name="vigencia_inicio"></label>
          <label class="campo">Fim<input type="date" name="vigencia_fim"></label>
          <label class="campo">Padrão<select name="padrao"><option value="0">Não</option><option value="1">Sim</option></select></label>
        </div>
        <div class="modal-acoes"><button type="button" class="btn" onclick="window.__fechar()">Fechar</button>
          <button type="submit" class="btn btn-primario">Adicionar tabela</button></div></form>`);
    $$('#modal-corpo [data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Excluir esta tabela e seus preços?')) return;
      await api('DELETE', '/tabelas/' + b.dataset.del); ok('Excluída.'); desenhar();
    }));
    $('#form-tab').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('POST', '/tabelas', { ...dadosForm(e.target), representada_id: repId, ativo: 1 }); ok('Tabela criada.'); desenhar(); aoFechar?.(); }
      catch (x) { erro(x); }
    });
  };
  await desenhar();
}

async function gerenciarCondicoes(repId, aoFechar) {
  const rep = estado.representadas.find(r => r.id === repId);
  const desenhar = async () => {
    const lista = (await get('/condicoes?representada_id=' + repId)).filter(c => c.representada_id === repId);
    abrirModal(`<h3>Prazos de pagamento — ${esc(rep.nome)}</h3>
      <div class="cartao"><div class="cartao-corpo sem-pad"><table>
        <thead><tr><th>Condição</th><th class="cen">Parcelas</th><th class="cen">Prazo médio</th>
          <th class="dir">Acréscimo</th><th class="dir">Desconto</th><th class="cen">Padrão</th><th></th></tr></thead>
        <tbody>${lista.length ? lista.map(c => `<tr>
          <td><b>${esc(c.descricao)}</b></td><td class="cen">${c.parcelas}</td><td class="cen">${c.prazo_medio} d</td>
          <td class="dir">${c.acrescimo_pct ? pct(c.acrescimo_pct) : '-'}</td><td class="dir">${c.desconto_pct ? pct(c.desconto_pct) : '-'}</td>
          <td class="cen">${c.padrao ? '✔' : ''}</td>
          <td class="dir"><button class="btn btn-peq btn-perigo" data-del="${c.id}">Excluir</button></td></tr>`).join('')
          : '<tr><td colspan="7" class="vazio">Nenhum prazo cadastrado.</td></tr>'}</tbody></table></div></div>
      <form id="form-cond"><p class="sub-tit">Novo prazo</p>
        <div class="grade g3">
          <label class="campo">Descrição<input name="descricao" placeholder="28/56/84 dias" required></label>
          <label class="campo">Parcelas<input type="number" name="parcelas" value="1"></label>
          <label class="campo">Prazo médio (dias)<input type="number" name="prazo_medio" value="0"></label>
        </div>
        <div class="grade g3">
          <label class="campo">Acréscimo (%)<input type="number" step="0.01" name="acrescimo_pct" value="0"></label>
          <label class="campo">Desconto (%)<input type="number" step="0.01" name="desconto_pct" value="0"></label>
          <label class="campo">Padrão<select name="padrao"><option value="0">Não</option><option value="1">Sim</option></select></label>
        </div>
        <div class="modal-acoes"><button type="button" class="btn" onclick="window.__fechar()">Fechar</button>
          <button type="submit" class="btn btn-primario">Adicionar prazo</button></div></form>`);
    $$('#modal-corpo [data-del]').forEach(b => b.addEventListener('click', async () => {
      await api('DELETE', '/condicoes/' + b.dataset.del); ok('Excluído.'); desenhar();
    }));
    $('#form-cond').addEventListener('submit', async e => {
      e.preventDefault();
      try { await api('POST', '/condicoes', { ...dadosForm(e.target), representada_id: repId, ativo: 1 }); ok('Prazo criado.'); desenhar(); aoFechar?.(); }
      catch (x) { erro(x); }
    });
  };
  await desenhar();
}

/* =========================================================================
   METAS
   ========================================================================= */
telas.metas = async () => {
  titulo('Metas');
  const ano = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('ano') || new Date().getFullYear());
  const anos = []; for (let a = new Date().getFullYear() + 1; a >= new Date().getFullYear() - 5; a--) anos.push(a);
  acoes(`<select id="f-ano" style="width:auto">${anos.map(a => `<option ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
         ${ehAdmin() ? `<button class="btn" id="btn-distribuir">Distribuir meta anual</button>
         <button class="btn btn-primario" id="btn-salvar">Salvar metas</button>` : soAdmin}`);
  const g = await get('/metas/grade?ano=' + ano);

  const MES_LONGO = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  const agora = new Date();
  const mesAtual = agora.getFullYear() === ano ? agora.getMonth() + 1 : 0;
  const totalRep = (l) => l.meses.reduce((s, m) => s + m.meta, 0);

  pintar(`
  <div class="info-linha">Digite a meta de cada representada por mês. O sistema calcula sozinho a
    <b>meta diária</b> (meta do mês ÷ dias úteis), a <b>meta anual</b> (soma dos meses) e compara com o realizado.</div>

  <div class="cartao"><div class="cartao-tit">Total do ano por representada</div>
    <div class="cartao-corpo metas-resumo">
      <div class="metas-reps">
        ${g.linhas.map(l => `<div>
          <div class="rot">${esc(l.nome)}</div>
          <div class="val tot-rep" data-rep="${l.representada_id}">${dinheiro(totalRep(l))}</div>
        </div>`).join('')}
      </div>
      <div class="metas-anual">
        <div class="rot">Meta anual</div>
        <div class="val" id="tot-geral">${dinheiro(g.total.reduce((s, t) => s + t.meta, 0))}</div>
      </div>
    </div></div>

  <div class="metas-meses">
    ${MES_LONGO.map((nome, i) => {
      const mes = i + 1;
      const diasUteis = g.linhas[0]?.meses[i]?.dias_uteis || 22;
      const tot = g.total[i] || { meta: 0, realizado: 0 };
      return `<div class="cartao mes-cartao${mes === mesAtual ? ' agora' : ''}">
        <div class="mes-topo">
          <span class="nome">${nome}</span>
          <label>Dias úteis
            <input type="number" class="dias-in" data-mes="${mes}" value="${diasUteis}" min="1" max="31"></label>
        </div>
        <div class="mes-corpo">
          ${g.linhas.map(l => {
            const m = l.meses[i];
            return `<div class="mes-rep">
              <div>
                <div class="nome">${esc(l.nome)}</div>
                <div class="real">real ${curto(m.realizado)}</div>
              </div>
              <input type="text" inputmode="decimal" class="meta-in" data-mes="${mes}"
                data-rep="${l.representada_id}" value="${moedaBR(m.meta || '')}" placeholder="0,00"
                aria-label="Meta de ${esc(l.nome)} em ${nome}">
            </div>`;
          }).join('')}
        </div>
        <div class="mes-pe">
          <span>Total <span class="real">real ${curto(tot.realizado)}</span></span>
          <b class="tot-mes" data-mes="${mes}">${dinheiro(tot.meta)}</b>
        </div>
      </div>`;
    }).join('')}
  </div>`);

  const recalcular = () => {
    let geral = 0;
    // total por representada (soma dos 12 meses daquela representada)
    $$('.tot-rep').forEach(el => {
      const s = $$(`.meta-in[data-rep="${el.dataset.rep}"]`).reduce((a, i) => a + numBR(i.value), 0);
      el.textContent = dinheiro(s); geral += s;
    });
    $('#tot-geral').textContent = dinheiro(geral);
    // total por mês (soma das representadas naquele mês)
    $$('.tot-mes').forEach(el => {
      const s = $$(`.meta-in[data-mes="${el.dataset.mes}"]`).reduce((a, i) => a + numBR(i.value), 0);
      el.textContent = dinheiro(s);
    });
  };
  $('.metas-meses').addEventListener('input', recalcular);
  ligarCamposBR('.meta-in', recalcular);
  $('#f-ano').addEventListener('change', () => { location.hash = '#/metas?ano=' + $('#f-ano').value; rotear(); });

  $('#btn-distribuir')?.addEventListener('click', () => {
    abrirModal(`<h3>Distribuir meta anual pelos meses</h3>
      <div class="grade g2">
        <label class="campo">Representada<select id="d-rep">
          ${g.linhas.map(l => `<option value="${l.representada_id}">${esc(l.nome)}</option>`).join('')}</select></label>
        <label class="campo">Meta do ano (R$)<input type="text" inputmode="decimal" id="d-valor" placeholder="600.000,00"></label>
      </div>
      <label class="campo">Como distribuir<select id="d-modo">
        <option value="igual">Igual em todos os meses</option>
        <option value="historico">Proporcional ao ano anterior</option>
        <option value="crescente">Crescente (+2% ao mês)</option></select></label>
      <div class="modal-acoes"><button class="btn" onclick="window.__fechar()">Cancelar</button>
        <button class="btn btn-primario" id="d-ok">Aplicar</button></div>`);
    $('#d-ok').addEventListener('click', async () => {
      const rep = Number($('#d-rep').value), valor = numBR($('#d-valor').value), modo = $('#d-modo').value;
      if (!valor) return erro('Informe o valor da meta anual.');
      let pesos = Array(12).fill(1);
      if (modo === 'crescente') pesos = pesos.map((_, i) => Math.pow(1.02, i));
      if (modo === 'historico') {
        const ant = await get(`/metas/grade?ano=${ano - 1}`);
        const l = ant.linhas.find(x => x.representada_id === rep);
        const r = l ? l.meses.map(m => m.realizado) : [];
        if (r.reduce((a, b) => a + b, 0) > 0) pesos = r.map(v => v || 0.0001);
      }
      const soma = pesos.reduce((a, b) => a + b, 0);
      for (let m = 1; m <= 12; m++) {
        const inp = $(`.meta-in[data-rep="${rep}"][data-mes="${m}"]`);
        if (inp) inp.value = moedaBR((valor * pesos[m - 1]) / soma);
      }
      recalcular(); fecharModal(); ok('Meta distribuída — confira e clique em Salvar metas.');
    });
  });

  $('#btn-salvar')?.addEventListener('click', async () => {
    const dias = {}; $$('.dias-in').forEach(i => dias[i.dataset.mes] = Number(i.value) || 22);
    const itens = $$('.meta-in').map(inp => ({
      ano, mes: Number(inp.dataset.mes), representada_id: Number(inp.dataset.rep),
      valor: numBR(inp.value), dias_uteis: dias[inp.dataset.mes],
    }));
    try { await api('POST', '/metas', { itens }); ok('Metas salvas!'); rotear(); } catch (e) { erro(e); }
  });
};

/* =========================================================================
   HISTÓRICO DE ANOS ANTERIORES
   ========================================================================= */
telas.historico = async () => {
  titulo('Histórico de anos anteriores');
  const ano = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('ano') || new Date().getFullYear() - 1);
  const anos = []; for (let a = new Date().getFullYear(); a >= new Date().getFullYear() - 10; a--) anos.push(a);
  acoes(`<select id="f-ano" style="width:auto">${anos.map(a => `<option ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
         ${ehAdmin() ? '<button class="btn btn-primario" id="btn-salvar">Salvar histórico</button>' : soAdmin}`);
  const [hist, MES] = [await get('/historico?ano=' + ano), ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']];
  const valor = (rep, mes, campo) => hist.find(h => h.mes === mes && (h.representada_id || 0) === rep)?.[campo] || '';

  pintar(`<div class="info-linha">Use esta tela para lançar as vendas dos anos em que você ainda não usava o sistema.
    Assim o painel mostra a evolução ano a ano. <b>O valor lançado aqui é o que vale</b> — ele é o fechamento do mês,
    e o painel usa ele mesmo que existam pedidos daquele mês no sistema. Deixe o mês em branco para o painel
    contar os pedidos normalmente.</div>
    <div class="cartao"><div class="cartao-corpo sem-pad"><div class="tabela-rolagem"><table id="tab-hist">
      <thead><tr><th style="min-width:150px">Representada</th>
        ${MES.map(m => `<th class="dir">${m}</th>`).join('')}<th class="dir">Total</th></tr></thead>
      <tbody>
        ${[{ id: 0, nome: 'Geral (sem separar)' }, ...estado.representadas].map(r => `<tr data-rep="${r.id}">
          <td><b>${esc(r.nome)}</b></td>
          ${MES.map((_, i) => `<td><input type="text" inputmode="decimal" class="hist-in dir" data-mes="${i + 1}"
            value="${moedaBR(valor(r.id, i + 1, 'realizado'))}" placeholder="0,00" style="min-width:104px"></td>`).join('')}
          <td class="dir mono"><b class="tot-linha">-</b></td></tr>`).join('')}
      </tbody></table></div></div></div>`);

  const recalc = () => $$('#tab-hist tr[data-rep]').forEach(tr => {
    $('.tot-linha', tr).textContent = dinheiro($$('.hist-in', tr).reduce((a, i) => a + numBR(i.value), 0));
  });
  recalc();
  $('#tab-hist').addEventListener('input', recalc);
  ligarCamposBR('.hist-in', recalc);
  $('#f-ano').addEventListener('change', () => { location.hash = '#/historico?ano=' + $('#f-ano').value; rotear(); });
  $('#btn-salvar')?.addEventListener('click', async () => {
    const itens = [];
    $$('#tab-hist tr[data-rep]').forEach(tr => {
      const rep = Number(tr.dataset.rep) || null;
      $$('.hist-in', tr).forEach(i => { if (i.value.trim() !== '') itens.push({ ano, mes: Number(i.dataset.mes), representada_id: rep, realizado: numBR(i.value) }); });
    });
    if (!itens.length) return erro('Nada para salvar.');
    try { await api('POST', '/historico', { itens }); ok('Histórico salvo!'); } catch (e) { erro(e); }
  });
};

/* =========================================================================
   CONFIGURAÇÕES
   ========================================================================= */
telas.config = async () => {
  titulo('Configurações');
  const c = await get('/config');
  const admin = estado.usuario.papel === 'admin';
  const rel = await get('/relogio').catch(() => null);
  const fusoCerto = rel && rel.diferenca_utc_min === -180;
  pintar(`
  ${rel ? `<div class="${fusoCerto ? 'info-linha nota-ok' : 'aviso-linha'}">
    <b>Relógio do servidor:</b> ${dataBR(rel.data)} às ${esc(rel.hora)} — fuso ${esc(rel.fuso || 'não informado')}.
    ${fusoCerto
      ? ' Está no horário de Brasília, como deve ser.'
      : ' <b>Atenção:</b> não está no horário de Brasília. É deste relógio que saem o “hoje” do painel, a meta diária e a data do pedido — enquanto estiver assim, o dia pode virar na hora errada.'}
  </div>` : ''}

  <div class="duas-colunas">
    <div class="coluna">
      <div class="cartao"><div class="cartao-tit"><div>Seus dados<small class="tit-sub">Aparecem no cabeçalho do PDF</small></div></div><div class="cartao-corpo">
    <form id="form-emp">
      <div class="grade g2">
        <label class="campo">Nome da representação<input name="empresa_nome" value="${esc(c.empresa_nome || '')}"></label>
        <label class="campo">CNPJ<input name="empresa_cnpj" value="${esc(c.empresa_cnpj || '')}"></label>
      </div>
      <div class="grade g2">
        <label class="campo">Telefone<input name="empresa_telefone" value="${esc(c.empresa_telefone || '')}"></label>
        <label class="campo">E-mail<input name="empresa_email" value="${esc(c.empresa_email || '')}"></label>
      </div>
      <label class="campo">Endereço<input name="empresa_endereco" value="${esc(c.empresa_endereco || '')}"></label>
      <label class="campo">Situações que contam como venda realizada nas metas
        <input class="cod" name="contar_status" value="${esc(c.contar_status || '')}" placeholder="aberto,enviado,faturado"></label>
      <button class="btn btn-primario" ${admin ? '' : 'disabled'}>Salvar</button>
      ${admin ? '' : '<small style="color:var(--suave);margin-left:10px">Somente administradores alteram estas configurações.</small>'}
    </form>
  </div></div>

      <div class="cartao"><div class="cartao-tit">Minha senha</div><div class="cartao-corpo">
    <form id="form-senha"><div class="grade g3">
      <label class="campo">Senha atual<input type="password" name="atual" required></label>
      <label class="campo">Nova senha<input type="password" name="nova" required></label>
      <label class="campo">&nbsp;<button class="btn btn-primario btn-bloco">Alterar senha</button></label>
    </div></form>
  </div></div>

      <div class="cartao"><div class="cartao-tit">Ditado por voz</div><div class="cartao-corpo">
    <p style="margin-top:0;color:var(--suave);font-size:13px">No pedido, o botão <b>🎙️ Ditar</b> ouve, casa o que
      você falou com o cadastro e deixa tudo na tela para conferir. Item que ficar em dúvida entra em laranja
      e o sistema não deixa salvar sem você confirmar.</p>
    <label class="voz-nao-perguntar" style="margin:0 0 12px">
      <input type="checkbox" id="cfg-voz" ${c.voz_perguntar !== '0' ? 'checked' : ''} ${admin ? '' : 'disabled'}>
      Perguntar se o ditado acertou depois de salvar</label>
    <div id="voz-relatorio"></div>
  </div></div>

      <div class="cartao"><div class="cartao-tit">Pergunta de segurança
        ${estado.usuario.tem_pergunta
          ? '<span class="etq etq-verde">Cadastrada</span>'
          : '<span class="etq etq-laranja">Não cadastrada</span>'}</div><div class="cartao-corpo">
    <p style="margin-top:0;color:var(--suave);font-size:13px">É assim que você destrava o sistema sozinho se esquecer
      a senha: na tela de acesso, "Esqueci minha senha" faz esta pergunta. Escolha algo que só você saiba responder —
      <b>sem ela, só o administrador consegue gerar uma senha nova para você</b>.</p>
    <form id="form-seguranca">
      <div class="grade g3">
        <label class="campo">Pergunta
          <input name="pergunta" required minlength="5" placeholder="Qual era o nome do meu primeiro cachorro?"
            value="${esc(estado.usuario.pergunta_seguranca || '')}"></label>
        <label class="campo">Resposta<input name="resposta" required minlength="2" placeholder="a resposta secreta"></label>
        <label class="campo">Senha atual<input type="password" name="atual" required></label>
      </div>
      <button class="btn btn-primario" style="margin-top:12px">
        ${estado.usuario.tem_pergunta ? 'Trocar pergunta' : 'Cadastrar pergunta'}</button>
      <small class="ajuda" style="margin-left:10px">Maiúsculas e acentos não atrapalham na hora de responder.</small>
    </form>
  </div></div>
    </div>
    <div class="coluna">
      ${admin ? `<div class="cartao"><div class="cartao-tit">Logo da empresa</div><div class="cartao-corpo">
    <p style="margin-top:0;color:var(--suave);font-size:13px">Envie o arquivo oficial da marca (PNG ou JPG, at\u00e9 3 MB).
      Ele passa a aparecer na tela de acesso, no menu e no cabe\u00e7alho do PDF que o cliente recebe.
      Prefira PNG com fundo transparente ou branco.</p>
    <div style="display:flex;gap:14px;align-items:center;flex-wrap:wrap">
      <div style="border:1px solid var(--borda);border-radius:8px;padding:10px 14px;background:#fff;min-width:190px;
        display:flex;align-items:center;justify-content:center;min-height:74px" id="previa-logo"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <label class="btn btn-primario" style="cursor:pointer">Escolher arquivo
          <input type="file" id="arq-logo" accept="image/png,image/jpeg" style="display:none"></label>
        ${estado.temLogo ? '<button class="btn btn-perigo" id="btn-tirar-logo">Remover logo</button>' : ''}
      </div>
    </div>
  </div></div>` : ''}

      ${admin ? `<div class="cartao"><div class="cartao-tit">Equipe
    <button class="btn btn-peq btn-primario" id="btn-novo-usuario">+ Novo usuário</button></div>
    <div class="cartao-corpo sem-pad"><table>
      <thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th><th class="cen">Ativo</th><th></th></tr></thead>
      <tbody id="corpo-usuarios"></tbody></table></div></div>

  <div class="cartao"><div class="cartao-tit">Backup</div><div class="cartao-corpo">
    <p style="margin-top:0;color:var(--suave);font-size:13px">Baixe uma cópia do banco de dados. Guarde em local seguro —
      para restaurar, substitua o arquivo <b class="cod">dados/repsys.db</b> na pasta do sistema.</p>
    <a class="btn btn-primario" href="/api/backup" download>Baixar backup agora</a>
  </div></div>` : ''}
    </div>
  </div>`);

  $('#form-emp').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('PUT', '/config', dadosForm(e.target)); ok('Configurações salvas.'); } catch (x) { erro(x); }
  });
  if (admin) {
    $('#previa-logo').innerHTML = estado.temLogo
      ? `<img src="/api/logo?v=${estado.logoVersao}" style="max-width:180px;max-height:64px;display:block">`
      : '<span style="color:var(--suave);font-size:12.5px">Nenhum logo enviado</span>';
    $('#arq-logo').addEventListener('change', async e => {
      const f = e.target.files[0];
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) return erro('Arquivo maior que 3 MB.');
      const leitor = new FileReader();
      leitor.onload = async () => {
        try { await api('POST', '/logo', { dados: leitor.result }); await verificarLogo(); ok('Logo atualizado!'); rotear(); }
        catch (x) { erro(x); }
      };
      leitor.readAsDataURL(f);
    });
    $('#btn-tirar-logo')?.addEventListener('click', async () => {
      if (!confirm('Remover o logo enviado?')) return;
      try { await api('DELETE', '/logo'); await verificarLogo(); ok('Logo removido.'); rotear(); } catch (x) { erro(x); }
    });
  }

  $('#form-senha').addEventListener('submit', async e => {
    e.preventDefault();
    try { await api('POST', '/senha', dadosForm(e.target)); ok('Senha alterada!'); e.target.reset(); } catch (x) { erro(x); }
  });

  $('#cfg-voz')?.addEventListener('change', async (e) => {
    const v = e.target.checked ? '1' : '0';
    estado.config.voz_perguntar = v;
    try { await api('PUT', '/config', { voz_perguntar: v }); ok('Preferência salva.'); } catch (x) { erro(x); }
  });
  if (admin) {
    get('/voz/relatorio').then(r => {
      const el = $('#voz-relatorio'); if (!el) return;
      if (!r.total) {
        el.innerHTML = '<div class="info-linha">Nenhum pedido ditado ainda. Depois de alguns, aparece aqui quanto o ditado está acertando.</div>';
        return;
      }
      el.innerHTML = `<div class="kpis" style="margin-bottom:10px">
        <div class="kpi"><div class="rot">Pedidos ditados</div><div class="val">${r.total}</div></div>
        <div class="kpi"><div class="rot">Itens que ficaram como a voz propôs</div>
          <div class="val">${r.aproveitamento === null ? '-' : r.aproveitamento + '%'}</div>
          <div class="obs">${r.itens.propostos} propostos • ${r.itens.trocados} trocados • ${r.itens.removidos} apagados</div></div>
        <div class="kpi"><div class="rot">Sua avaliação</div>
          <div class="val">${r.veredito.acertou}/${r.veredito.acertou + r.veredito.quase + r.veredito.errou || 0}</div>
          <div class="obs">acertou tudo • ${r.veredito.quase} quase • ${r.veredito.errou} errou feio</div></div>
      </div>`;
    }).catch(() => {});
  }

  $('#form-seguranca').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await api('POST', '/seguranca', dadosForm(e.target));
      ok('Pergunta de segurança cadastrada. Agora você consegue recuperar a senha sozinho.');
      estado.usuario.tem_pergunta = true;
      rotear();
    } catch (x) { erro(x); }
  });

  if (admin) {
    const carregarUsuarios = async () => {
      estado.usuarios = await get('/usuarios');
      $('#corpo-usuarios').innerHTML = estado.usuarios.map(u => `<tr>
        <td><b>${esc(u.nome)}</b></td><td>${esc(u.email)}</td><td style="text-transform:capitalize">${u.papel}</td>
        <td class="cen">${u.ativo ? '✔' : '—'}</td>
        <td class="dir"><div class="linha-acoes">
          <button class="btn btn-peq" data-senha="${u.id}">Gerar senha temporária</button>
          <button class="btn btn-peq" data-editar="${u.id}">Editar</button></div></td></tr>`).join('');
      $$('#corpo-usuarios [data-editar]').forEach(b => b.addEventListener('click', () => formUsuario(estado.usuarios.find(x => x.id === Number(b.dataset.editar)), carregarUsuarios)));
      $$('#corpo-usuarios [data-senha]').forEach(b => b.addEventListener('click', async () => {
        const u = estado.usuarios.find(x => x.id === Number(b.dataset.senha));
        if (!confirm(`Gerar uma senha temporária para ${u.nome}?\n\n` +
          'A senha atual dele(a) para de funcionar na hora, e no próximo acesso o sistema vai pedir que escolha uma senha nova.')) return;
        try {
          const r = await api('POST', `/usuarios/${u.id}/senha`, {});
          abrirModal(`<h3>Senha temporária de ${esc(r.nome)}</h3>
            <div class="modal-corpo">
              <p class="modal-sub">Passe esta senha para a pessoa. Ela aparece <b>uma única vez</b> —
                se fechar sem anotar, é só gerar outra.</p>
              <div class="senha-temp cod">${esc(r.senha)}</div>
              <small class="ajuda">No primeiro acesso o sistema pede que ela escolha uma senha própria.
                Até lá, nenhuma tela abre.</small>
              <div class="modal-acoes"><button class="btn btn-primario" onclick="window.__fechar()">Fechar</button></div>
            </div>`);
        } catch (e) { erro(e); }
      }));
    };
    $('#btn-novo-usuario').addEventListener('click', () => formUsuario(null, carregarUsuarios));
    await carregarUsuarios();
  }
};

function formUsuario(u, aoSalvar) {
  u = u || { ativo: 1, papel: 'representante' };
  abrirModal(`<h3>${u.id ? 'Editar usuário' : 'Novo usuário'}</h3>
  <form id="form-usuario">
    <div class="grade g2">
      <label class="campo">Nome *<input name="nome" value="${esc(u.nome || '')}" required></label>
      <label class="campo">E-mail *<input type="email" name="email" value="${esc(u.email || '')}" required></label>
    </div>
    <div class="grade g3">
      <label class="campo">Perfil<select name="papel">
        <option value="representante" ${u.papel === 'representante' ? 'selected' : ''}>Representante</option>
        <option value="admin" ${u.papel === 'admin' ? 'selected' : ''}>Administrador</option></select></label>
      <label class="campo">Telefone<input name="telefone" value="${esc(u.telefone || '')}"></label>
      <label class="campo">Ativo<select name="ativo"><option value="1" ${u.ativo ? 'selected' : ''}>Sim</option><option value="0" ${!u.ativo ? 'selected' : ''}>Não</option></select></label>
    </div>
    ${u.id ? '' : '<label class="campo">Senha inicial *<input type="password" name="senha" required></label>'}
    <div class="modal-acoes"><button type="button" class="btn" onclick="window.__fechar()">Cancelar</button>
      <button type="submit" class="btn btn-primario">Salvar</button></div></form>`);
  $('#form-usuario').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const d = dadosForm(e.target);
      u.id ? await api('PUT', '/usuarios/' + u.id, d) : await api('POST', '/usuarios', d);
      fecharModal(); ok('Usuário salvo!'); aoSalvar();
    } catch (x) { erro(x); }
  });
}

/* ------------------------------------------------------------- partida */
verificarLogo();
iniciar();

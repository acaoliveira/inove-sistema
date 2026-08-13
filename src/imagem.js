'use strict';
/**
 * Leitura de PNG e JPEG em JavaScript puro, para embutir o logo no PDF.
 * Devolve { largura, altura, canais, dados } com os pixels em RGB (ou cinza),
 * já compostos sobre fundo branco quando a imagem tiver transparência.
 */
const zlib = require('node:zlib');

function lerPNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) return null;
  let pos = 8, largura = 0, altura = 0, prof = 8, tipoCor = 6, paleta = null, transp = null;
  const pedacos = [];
  while (pos < buf.length) {
    const tam = buf.readUInt32BE(pos);
    const tipo = buf.toString('latin1', pos + 4, pos + 8);
    const dados = buf.subarray(pos + 8, pos + 8 + tam);
    if (tipo === 'IHDR') {
      largura = dados.readUInt32BE(0); altura = dados.readUInt32BE(4);
      prof = dados[8]; tipoCor = dados[9];
      if (dados[12] !== 0) return null;          // entrelaçamento não suportado
    } else if (tipo === 'PLTE') paleta = Buffer.from(dados);
    else if (tipo === 'tRNS') transp = Buffer.from(dados);
    else if (tipo === 'IDAT') pedacos.push(Buffer.from(dados));
    else if (tipo === 'IEND') break;
    pos += 12 + tam;
  }
  if (prof !== 8 || !largura || !altura) return null;

  const canaisOrig = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[tipoCor];
  if (!canaisOrig) return null;
  const bruto = zlib.inflateSync(Buffer.concat(pedacos));
  const bpl = largura * canaisOrig;
  const linhas = Buffer.alloc(altura * bpl);
  let ant = Buffer.alloc(bpl);

  for (let y = 0; y < altura; y++) {
    const filtro = bruto[y * (bpl + 1)];
    const linha = bruto.subarray(y * (bpl + 1) + 1, y * (bpl + 1) + 1 + bpl);
    const saida = linhas.subarray(y * bpl, (y + 1) * bpl);
    for (let i = 0; i < bpl; i++) {
      const a = i >= canaisOrig ? saida[i - canaisOrig] : 0;
      const b = ant[i];
      const c = i >= canaisOrig ? ant[i - canaisOrig] : 0;
      let v = linha[i];
      if (filtro === 1) v += a;
      else if (filtro === 2) v += b;
      else if (filtro === 3) v += (a + b) >> 1;
      else if (filtro === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      saida[i] = v & 0xff;
    }
    ant = saida;
  }

  // converte tudo para RGB, compondo sobre branco
  const saida = Buffer.alloc(largura * altura * 3);
  for (let i = 0, j = 0; i < largura * altura; i++) {
    let r, g, b, a = 255;
    if (tipoCor === 0) { r = g = b = linhas[i]; }
    else if (tipoCor === 4) { r = g = b = linhas[i * 2]; a = linhas[i * 2 + 1]; }
    else if (tipoCor === 2) { r = linhas[i * 3]; g = linhas[i * 3 + 1]; b = linhas[i * 3 + 2]; }
    else if (tipoCor === 6) { r = linhas[i * 4]; g = linhas[i * 4 + 1]; b = linhas[i * 4 + 2]; a = linhas[i * 4 + 3]; }
    else { // paleta
      const idx = linhas[i];
      if (!paleta) return null;
      r = paleta[idx * 3]; g = paleta[idx * 3 + 1]; b = paleta[idx * 3 + 2];
      if (transp && idx < transp.length) a = transp[idx];
    }
    if (a < 255) { const f = a / 255; r = Math.round(r * f + 255 * (1 - f)); g = Math.round(g * f + 255 * (1 - f)); b = Math.round(b * f + 255 * (1 - f)); }
    saida[j++] = r; saida[j++] = g; saida[j++] = b;
  }
  return { largura, altura, tipo: 'rgb', dados: saida };
}

function lerJPEG(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let pos = 2;
  while (pos < buf.length - 1) {
    if (buf[pos] !== 0xff) { pos++; continue; }
    const marca = buf[pos + 1];
    if (marca >= 0xc0 && marca <= 0xcf && marca !== 0xc4 && marca !== 0xc8 && marca !== 0xcc) {
      const altura = buf.readUInt16BE(pos + 5);
      const largura = buf.readUInt16BE(pos + 7);
      const componentes = buf[pos + 9];
      return { largura, altura, tipo: 'jpeg', componentes, dados: buf };
    }
    pos += 2 + buf.readUInt16BE(pos + 2);
  }
  return null;
}

function lerImagem(buf) {
  return lerPNG(buf) || lerJPEG(buf) || null;
}

module.exports = { lerImagem };

/* CANTIERI — scanner.js: lo scanner dei documenti (estratto da ordini-bolle.js,
   l'unica parte che resta quando struttura ordini e lettura bolla vanno via).
   Usato per bolla e registro firme: quattro angoli da trascinare sui bordi del
   foglio, e il foglio si raddrizza — una trasformazione di prospettiva fatta
   sulla tela, un pixel alla volta, senza librerie. "Usa così" salta tutto e
   tiene la foto com'è. */
'use strict';

let RITAGLIO = null;
// La foto, ridotta a LATO_RITAGLIO, su una tela: da qui escono l'anteprima e il ritaglio.
async function telaSorgente(file) {
  const im = await apriImmagine(file);
  const w = im.naturalWidth || im.width, a = im.naturalHeight || im.height;
  if (!w || !a) throw new Error('Foto vuota');
  const scala = Math.min(1, LATO_RITAGLIO / Math.max(w, a));
  const tela = document.createElement('canvas');
  tela.width = Math.max(1, Math.round(w * scala)); tela.height = Math.max(1, Math.round(a * scala));
  tela.getContext('2d').drawImage(im, 0, 0, tela.width, tela.height);
  if (im.close) im.close();
  return tela;
}
/* La schermata del ritaglio. Risolve con la tela del foglio raddrizzato, con la
   parola 'salta' se si usa la foto com'è, con null se si chiude senza salvare. */
async function ritagliaDocumento(file) {
  const sorgente = await telaSorgente(file);
  return new Promise(function (ok) {
    const box = document.createElement('div');
    box.id = 'ritaglio';
    box.innerHTML = '<div class="area"><div class="foglio"><canvas></canvas><svg><polygon></polygon></svg>' +
      [0, 1, 2, 3].map(function (i) { return '<button class="angolo" data-i="' + i + '" aria-label="Angolo ' + (i + 1) + '"></button>'; }).join('') + '</div></div>' +
      '<button class="chiudi" data-az="ritaglio-chiudi" aria-label="Chiudi">✕</button>' +
      '<div class="barra"><button class="az verde" data-az="ritaglio-ok">Ritaglia</button><button class="az stretta" data-az="ritaglio-salta">Usa così</button></div>';
    document.body.appendChild(box);
    // La foto adattata all'area libera; gli angoli partono dai quattro angoli della foto.
    const area = box.querySelector('.area'), foglio = box.querySelector('.foglio'), tela = box.querySelector('canvas');
    const scala = Math.min(area.clientWidth / sorgente.width, area.clientHeight / sorgente.height);
    const W = Math.round(sorgente.width * scala), A = Math.round(sorgente.height * scala);
    foglio.style.width = W + 'px'; foglio.style.height = A + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    tela.width = Math.round(W * dpr); tela.height = Math.round(A * dpr);
    tela.getContext('2d').drawImage(sorgente, 0, 0, tela.width, tela.height);
    const punti = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: A }, { x: 0, y: A }];
    RITAGLIO = { box: box, sorgente: sorgente, punti: punti, scala: scala, ok: ok, attivo: null };
    disegnaRitaglio();
    // Un dito sull'angolo lo porta dove va: il gesto resta suo anche uscendo dal cerchietto.
    foglio.addEventListener('pointerdown', function (ev) {
      const an = ev.target.closest('.angolo');
      if (!an) return;
      RITAGLIO.attivo = Number(an.dataset.i);
      an.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    foglio.addEventListener('pointermove', function (ev) {
      if (RITAGLIO.attivo == null) return;
      const r = foglio.getBoundingClientRect();
      RITAGLIO.punti[RITAGLIO.attivo] = { x: Math.min(W, Math.max(0, ev.clientX - r.left)), y: Math.min(A, Math.max(0, ev.clientY - r.top)) };
      disegnaRitaglio();
    });
    foglio.addEventListener('pointerup', function () { RITAGLIO.attivo = null; });
    foglio.addEventListener('pointercancel', function () { RITAGLIO.attivo = null; });
  });
}
function disegnaRitaglio() {
  if (!RITAGLIO) return;
  const p = RITAGLIO.punti;
  RITAGLIO.box.querySelector('polygon').setAttribute('points', p.map(function (q) { return q.x + ',' + q.y; }).join(' '));
  RITAGLIO.box.querySelectorAll('.angolo').forEach(function (an, i) { an.style.left = p[i].x + 'px'; an.style.top = p[i].y + 'px'; });
}
function chiudiRitaglio(esito) {
  if (!RITAGLIO) return;
  const r = RITAGLIO;
  RITAGLIO = null;
  r.box.remove();
  if (esito !== 'tela') r.sorgente.width = 1;
  r.ok(esito === 'tela' ? raddrizza(r.sorgente, r.punti.map(function (q) { return { x: q.x / r.scala, y: q.y / r.scala }; })) : esito);
}
/* Il quadrilatero segnato diventa un rettangolo. La corrispondenza fra il
   rettangolo di uscita e il quadrilatero è un'omografia (Heckbert, quadrato
   unitario → quadrilatero); per ogni pixel di uscita si va a prendere il punto
   della foto, con interpolazione bilineare perché il testo resti leggibile. */
function raddrizza(sorgente, p) {
  const dist = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
  let W = Math.max(dist(p[0], p[1]), dist(p[3], p[2])), A = Math.max(dist(p[0], p[3]), dist(p[1], p[2]));
  const scala = Math.min(1, LATO_DOC / Math.max(W, A));
  W = Math.max(1, Math.round(W * scala)); A = Math.max(1, Math.round(A * scala));
  const x0 = p[0].x, y0 = p[0].y, x1 = p[1].x, y1 = p[1].y, x2 = p[2].x, y2 = p[2].y, x3 = p[3].x, y3 = p[3].y;
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3;
  let g = 0, hh = 0;
  if (dx3 || dy3) { const den = dx1 * dy2 - dx2 * dy1; g = (dx3 * dy2 - dx2 * dy3) / den; hh = (dx1 * dy3 - dx3 * dy1) / den; }
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
  const sw = sorgente.width, sh = sorgente.height;
  const src = sorgente.getContext('2d').getImageData(0, 0, sw, sh).data;
  sorgente.width = 1;
  const uscita = document.createElement('canvas');
  uscita.width = W; uscita.height = A;
  const ctx = uscita.getContext('2d');
  const img = ctx.createImageData(W, A), o = img.data;
  let k = 0;
  for (let j = 0; j < A; j++) {
    const v = (j + 0.5) / A;
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W, den = g * u + hh * v + 1;
      let x = (a * u + b * v + c) / den, y = (d * u + e * v + f) / den;
      x = Math.min(sw - 1.001, Math.max(0, x)); y = Math.min(sh - 1.001, Math.max(0, y));
      const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi;
      const i00 = (yi * sw + xi) * 4, i01 = i00 + 4, i10 = i00 + sw * 4, i11 = i10 + 4;
      for (let z = 0; z < 3; z++) {
        o[k + z] = src[i00 + z] * (1 - fx) * (1 - fy) + src[i01 + z] * fx * (1 - fy) + src[i10 + z] * (1 - fx) * fy + src[i11 + z] * fx * fy;
      }
      o[k + 3] = 255;
      k += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
  return uscita;
}

// Le azioni di questo file.
Object.assign(AZIONI, {
  // Il ritaglio del documento: raddrizza, tieni com'è, o lascia perdere.
  'ritaglio-ok': function () { avvisa('Raddrizzo…'); setTimeout(function () { chiudiRitaglio('tela'); }, 30); },
  'ritaglio-salta': function () { chiudiRitaglio('salta'); },
  'ritaglio-chiudi': function () { chiudiRitaglio(null); },
});

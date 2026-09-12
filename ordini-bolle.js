/* CANTIERI — ordini-bolle.js: righe d'ordine, documenti, lettura della bolla, confronto */
'use strict';


/* ---- la lettura di una bolla ----
   Una chiamata sola: la foto (o il testo del PDF) e l'elenco numerato di quello
   che era a ordine. Se la foto piccola non si legge si riprova una volta con
   quella grande; poi ci si ferma e il documento resta com'è. */
async function lavoroBolla(l) {
  const sop = sopralluogo(l.sop);
  const f = sop && trovaFoto(sop, l.foto);
  if (!f) return;
  const c = cantierePerCodice(sop.cantiere);
  // A ordine: quello che non è ancora arrivato, più quello che questa stessa bolla aveva già spuntato (rilettura).
  const aperte = ordiniDi(c).filter(function (o) { return o.stato !== 'arrivato' || (o.arrivi && o.arrivi[f.id] != null); });
  const elenco = 'Materiale ordinato per questo cantiere:\n' +
    (aperte.length ? aperte.map(function (o, i) { return (i + 1) + '. ' + rigaOrdineTesto(o); }).join('\n') : '(niente a ordine)');
  let r = null;
  for (const grande of [false, true]) {
    if (grande && f.formato !== 'pdf' && !f.lettura) break;
    const blocchi = await contenutoBolla(f, grande);
    if (!blocchi) break;
    blocchi.push({ type: 'text', text: elenco });
    r = estraiJSON(await chiamaClaude(REGOLE_BOLLA, blocchi, 4000));
    if (r && r.leggibile !== false) break;
    r = null;
  }
  if (!r) {
    f.stato = 'errore'; f.errore = 'bolla non leggibile';
    salva('sopralluogo', sop);
    avvisa('Bolla non leggibile', 'err');
    aggiornaVista();
    return;
  }
  applicaBolla(sop, f, r, aperte, c);
  // La domanda aspetta una risposta: la coda no, va avanti con il resto.
  chiediSpostamentoBolla(sop, f, c).catch(function () {});
}
/* I blocchi del messaggio: l'immagine in base64, oppure per un PDF il testo se
   ce l'ha dentro, se no le sue pagine disegnate (al massimo tre). */
async function contenutoBolla(f, grande) {
  const lato = grande ? LATO_DOC : LATO_LETTURA;
  const immagine = async function (blob) { return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await blobInBase64(blob) } }; };
  const blob = await leggiMedia(f.formato === 'pdf' ? f.file : ((!grande && f.lettura) || f.file));
  if (!blob) return null;
  if (f.formato !== 'pdf') return [await immagine(blob)];
  const lib = await caricaPdfJs();
  const doc = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
  const pagine = Math.min(doc.numPages, 3);
  if (!grande) {
    let testo = '';
    for (let n = 1; n <= pagine; n++) {
      const tc = await (await doc.getPage(n)).getTextContent();
      testo += tc.items.map(function (i) { return i.str; }).join(' ') + '\n';
    }
    if (testo.trim().length > 40) return [{ type: 'text', text: 'Testo della bolla (PDF):\n' + testo.trim() }];
  }
  const blocchi = [];
  for (let n = 1; n <= pagine; n++) {
    const pagina = await doc.getPage(n);
    const base = pagina.getViewport({ scale: 1 });
    const vista = pagina.getViewport({ scale: lato / Math.max(base.width, base.height) });
    const tela = document.createElement('canvas');
    tela.width = Math.round(vista.width); tela.height = Math.round(vista.height);
    await pagina.render({ canvasContext: tela.getContext('2d'), viewport: vista }).promise;
    blocchi.push(await immagine((await blobDaTela(tela, QUALITA_LETTURA)).blob));
  }
  return blocchi;
}
// "12/09/2026", "2026-09-12", "12.9.26": se si capisce diventa ISO, se no resta com'è scritta.
function dataDaBolla(t) {
  t = String(t || '').trim();
  if (!t) return '';
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  m = t.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) return (m[3].length === 2 ? '20' + m[3] : m[3]) + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  return t;
}
function eISO(t) { return /^\d{4}-\d{2}-\d{2}$/.test(String(t || '')); }
function dataBollaBreve(f) { return eISO(f.dataBolla) ? giornoMese(f.dataBolla) + '/' + f.dataBolla.slice(0, 4) : (f.dataBolla || ''); }
// "Fornitore · n. 123 · del 12/09/2026": quello che si è letto, per la card e per il referto.
function intestazioneBolla(f) {
  return [f.fornitore, f.numero ? 'n. ' + f.numero : '', f.dataBolla ? 'del ' + dataBollaBreve(f) : ''].filter(Boolean).join(' · ');
}
/* Quello che si è letto va sul documento, nel referto (sotto, se c'era già del
   testo) e sulle righe d'ordine agganciate, che passano ad arrivato con la
   quantità arrivata. Quello che non era a ordine resta sul documento, da
   aggiungere con un tocco. Nessuna riga si cancella. */
function applicaBolla(sop, f, r, aperte, c) {
  f.fornitore = r.fornitore ? String(r.fornitore).trim() : '';
  f.numero = r.numero != null && r.numero !== '' ? String(r.numero).trim() : '';
  f.dataBolla = dataDaBolla(r.data);
  const righe = (Array.isArray(r.righe) ? r.righe : []).filter(function (x) { return x && String(x.descrizione || '').trim(); })
    .map(function (x) { return { descrizione: String(x.descrizione).trim(), quantita: Number(x.quantita) || 0, um: String(x.um || '').trim(), ordine: Number(x.ordine) || 0 }; });
  const letto = [intestazioneBolla(f)].concat(righe.map(rigaOrdineTesto)).filter(Boolean).join('\n');
  const prima = String(f.referto || '').trim();
  f.referto = prima ? prima + '\n\n' + letto : letto;
  // Una rilettura non somma due volte: prima si toglie quello che questa bolla aveva già messo.
  ordiniDi(c).forEach(function (o) { if (o.arrivi && o.arrivi[f.id] != null) { delete o.arrivi[f.id]; o.arrivata = sommaArrivi(o); } });
  f.senzaOrdine = [];
  righe.forEach(function (x) {
    const o = x.ordine >= 1 && x.ordine <= aperte.length ? aperte[x.ordine - 1] : null;
    if (!o) { f.senzaOrdine.push({ id: nuovoId(), descrizione: x.descrizione, quantita: x.quantita, um: x.um }); return; }
    o.arrivi = o.arrivi || {};
    o.arrivi[f.id] = (o.arrivi[f.id] || 0) + x.quantita;
    o.arrivata = sommaArrivi(o);
    o.stato = 'arrivato';
  });
  f.stato = 'riordinato'; f.errore = null;
  f.letta = adessoISO();
  salva('sopralluogo', sop);
  if (c) salva('cantiere', c);
  avvisa('Bolla letta', 'ok');
  aggiornaVista();
}
function sommaArrivi(o) { return Object.keys(o.arrivi || {}).reduce(function (t, k) { return t + (Number(o.arrivi[k]) || 0); }, 0); }
/* Com'è andato il confronto di una bolla: le righe d'ordine che ha spuntato,
   quante tornano, quante no (arrivato meno, o arrivato senza ordine). */
function confrontoBolla(c, f) {
  const righe = ordiniDi(c).filter(function (o) { return o.arrivi && o.arrivi[f.id] != null; });
  const meno = righe.filter(function (o) { return mancante(o) > 0; }).length;
  const senza = (f.senzaOrdine || []).length;
  return { righe: righe, aPosto: righe.length - meno, diff: meno + senza };
}
// "3 righe a posto · 1 differenza": verde se torna tutto, gialla se no.
function riepilogoBollaHtml(c, f) {
  const k = confrontoBolla(c, f);
  const testo = k.righe.length || k.diff
    ? k.aPosto + (k.aPosto === 1 ? ' riga a posto' : ' righe a posto') + (k.diff ? ' · ' + k.diff + (k.diff === 1 ? ' differenza' : ' differenze') : '')
    : 'niente da confrontare';
  return '<span class="esito ' + (k.diff ? 'att' : 'ok') + '">' + h(testo) + '</span>';
}
// Il dettaglio riga per riga, per la tendina Confronto della giornata.
function dettaglioConfrontoHtml(c, sop, f) {
  const k = confrontoBolla(c, f);
  let html = '<button class="riga" data-az="vai" data-a="#/foto/' + h(sop.id) + '/' + h(f.id) + '"><span class="desc">' + h(intestazioneBolla(f) || nomeFoto(f)) + '<small>' + riepilogoBollaHtml(c, f) + '</small></span><span class="frec">›</span></button>';
  if (!k.righe.length && !(f.senzaOrdine || []).length) return html;
  html += '<div class="card-corpo">';
  k.righe.forEach(function (o) {
    const manca = mancante(o);
    html += '<div class="voce"><span class="segno">●</span><span>' + h(o.descrizione) + ' · ordinati ' + h(numeroIt(o.quantita)) + ' · arrivati ' + h(numeroIt(o.arrivi[f.id])) +
      (manca ? ' <b class="meno">−' + h(numeroIt(manca)) + '</b>' : '') + '</span></div>';
  });
  (f.senzaOrdine || []).forEach(function (x) {
    html += '<div class="voce"><span class="segno">●</span><span>' + h(x.descrizione) + ' · arrivati ' + h(contiOrdine(x)) + ' <b class="meno">senza ordine</b></span></div>';
  });
  return html + '</div>';
}
/* La bolla porta una data diversa dal giorno in cui è stata caricata, e quel
   giorno nel cantiere c'è già: si chiede una volta sola se spostarla lì. */
async function chiediSpostamentoBolla(sop, f, c) {
  if (!c || f.spostaChiesto || !eISO(f.dataBolla) || f.dataBolla === f.giorno) return;
  const dest = sopralluoghiDelGiorno(c.codice, f.dataBolla)[0];
  if (!dest || dest.id === sop.id) return;
  f.spostaChiesto = true;
  salva('sopralluogo', sop);
  const si = await chiedi('Bolla ' + delGiorno(f.dataBolla), 'La bolla porta la data ' + delGiorno(f.dataBolla) + ', e quel giorno c\'è già nel cantiere. La sposto lì?', 'Sposta');
  chiudiFoglio();
  if (!si) return;
  sop.media = sop.media.filter(function (m) { return m !== f; });
  f.giorno = f.dataBolla;
  if (!Array.isArray(dest.media)) dest.media = [];
  dest.media.push(f);
  salva('sopralluogo', sop);
  salva('sopralluogo', dest);
  avvisa('Spostata nella giornata ' + delGiorno(f.giorno), 'ok');
  if (ROTTA.nome === 'foto' && ROTTA.parametri[1] === f.id) vai('#/foto/' + dest.id + '/' + f.id); else aggiornaVista();
}

/* ---- il ritaglio di una bolla ----
   La foto di un foglio è quasi sempre storta e con il tavolo intorno. Quattro
   angoli da trascinare sui bordi del foglio, e il foglio si raddrizza: una
   trasformazione di prospettiva fatta sulla tela, un pixel alla volta, senza
   librerie. "Usa così" salta tutto e tiene la foto com'è. */
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
/* Le righe d'ordine nate oggi, in tutta la giornata: la tendina c'è solo se ce ne sono. */
function tendinaOrdiniOggi(s, c) {
  if (!c.codice) return '';
  const righe = ordiniDi(c).filter(function (o) { return o.giorno === s.giorno; });
  if (!righe.length) return '';
  const diff = righe.filter(function (o) { return mancante(o) > 0; }).length;
  return tendina('ordini-' + s.id, 'Ordini di oggi', '<div class="card">' + scorrevole(righe.map(function (o) { return rigaOrdineHtml(c, o); }).join('')) + '</div>',
    diff ? { n: diff, att: true } : righe.length);
}
/* Il confronto delle bolle lette oggi: per ognuna la riga di riepilogo e, sotto,
   riga per riga cosa era a ordine e cosa è arrivato. */
function tendinaConfronto(s, c) {
  if (!c.codice) return '';
  const bolle = [];
  sopralluoghiDelGiorno(s.cantiere, s.giorno).forEach(function (x) {
    documentiDi(x).forEach(function (f) { if (f.genere === 'bolla' && f.letta) bolle.push({ sop: x, f: f }); });
  });
  if (!bolle.length) return '';
  const diff = bolle.reduce(function (t, b) { return t + confrontoBolla(c, b.f).diff; }, 0);
  return tendina('confronto-' + s.id, 'Confronto',
    '<div class="card">' + scorrevole(bolle.map(function (b) { return dettaglioConfrontoHtml(c, b.sop, b.f); }).join('')) + '</div>',
    diff ? { n: diff, att: true } : bolle.length);
}

/* ---------------- ORDINI ---------------- */
/* Le righe d'ordine stanno nel cantiere: il materiale si ordina per il lavoro,
   non per il giorno. Ogni riga sa da quale sopralluogo e da quale giorno è nata,
   e passa per tre stati con un tocco sulla pastiglia. */
const STATI_ORDINE = [
  { id: 'da_ordinare', nome: 'da ordinare', pill: 'att' },
  { id: 'ordinato',    nome: 'ordinato',    pill: 'blu' },
  { id: 'arrivato',    nome: 'arrivato',    pill: 'ok'  }
];
function ordiniDi(c) { return (c && c.ordini) || []; }
function ordineDi(c, id) { return ordiniDi(c).find(function (o) { return o.id === id; }) || null; }
function daOrdinare(c) { return ordiniDi(c).filter(function (o) { return o.stato === 'da_ordinare'; }); }
// "3 pz · 120x150 cm": la quantità solo se è stata detta.
function contiOrdine(o) {
  return [o.quantita ? numeroIt(o.quantita) + (o.um ? ' ' + o.um : '') : (o.um || ''), o.misure || ''].filter(Boolean).join(' · ');
}
// "3 pz Finestre 120x150 cm": la riga come si scrive a un fornitore, quantità davanti.
function rigaOrdineTesto(o) {
  return [o.quantita ? numeroIt(o.quantita) + (o.um ? ' ' + o.um : '') : '', o.descrizione, o.misure || ''].filter(Boolean).join(' ');
}
// Arrivata meno merce di quanta era a ordine: la riga lo dice, e resta gialla.
function mancante(o) { return o.stato === 'arrivato' && o.arrivata != null && o.quantita > o.arrivata ? o.quantita - o.arrivata : 0; }
// "l'11 settembre", "il 12 settembre": come delGiorno, ma con l'articolo.
function ilGiorno(iso) { return delGiorno(iso).replace(/^dell'/, "l'").replace(/^del /, 'il '); }
// Un documento del cantiere, cercato per id in tutti i suoi sopralluoghi.
function documentoDi(c, fotoId) {
  const sops = sopralluoghiDi(c.codice);
  for (let i = 0; i < sops.length; i++) {
    const f = trovaFoto(sops[i], fotoId);
    if (f) return { sop: sops[i], f: f };
  }
  return null;
}
// "con DDT 4471", o "con la bolla del 10/09" se il numero non si è letto.
function conBolla(f) { return f.numero ? 'DDT ' + f.numero : 'la bolla del ' + (dataBollaBreve(f) || giornoMese(f.giorno)); }

/* Tutto quello che sta negli Ordini, in un elenco solo: le righe del cantiere
   e la merce arrivata senza ordine. Le differenze — arrivato meno di quanto
   ordinato, o arrivato senza ordine — stanno in cima; poi le righe per stato. */
function vociOrdini(c) {
  const voci = [];
  sopralluoghiDi(c.codice).forEach(function (s) {
    documentiDi(s).forEach(function (f) {
      (f.senzaOrdine || []).forEach(function (x) { voci.push({ tipo: 'senza', sop: s, f: f, x: x, diff: true, testo: x.descrizione }); });
    });
  });
  ordiniDi(c).forEach(function (o) { voci.push({ tipo: 'riga', o: o, diff: mancante(o) > 0, testo: o.descrizione }); });
  const peso = function (v) { return v.diff ? 0 : 1 + STATI_ORDINE.findIndex(function (s) { return v.o && s.id === v.o.stato; }); };
  return voci.sort(function (a, b) { return peso(a) - peso(b); });
}
function differenzeOrdini(c) { return vociOrdini(c).filter(function (v) { return v.diff; }).length; }
// Il numero sulla linguetta: le differenze in giallo, se no le righe aperte.
function numeroOrdini(c) {
  const diff = differenzeOrdini(c);
  return diff ? { n: diff, att: true } : ordiniDi(c).filter(function (o) { return o.stato !== 'arrivato'; }).length;
}
function listaOrdiniHtml(c, voci) {
  return voci.map(function (v) { return v.tipo === 'senza' ? rigaSenzaOrdineHtml(c, v) : rigaOrdineHtml(c, v.o); }).join('');
}
/* Due tocchi sulla stessa riga: la descrizione apre la riga, la pastiglia cambia
   lo stato. Una riga con una differenza è gialla, dice quanto manca e con quale
   bolla è arrivato; toccandola escono i due tasti, come i puntini delle card. */
function rigaOrdineHtml(c, o) {
  const st = STATI_ORDINE.find(function (s) { return s.id === o.stato; }) || STATI_ORDINE[0];
  const rif = 'data-cantiere="' + h(c.id) + '" data-id="' + h(o.id) + '"';
  const manca = mancante(o);
  const chiave = 'ord-' + o.id, aperto = PUNTI_APERTI === chiave;
  let sotto = h(contiOrdine(o)) + (o.giorno ? ' · rilievo ' + h(giornoMese(o.giorno)) : '');
  let voci = '';
  if (manca) {
    const bolle = Object.keys(o.arrivi || {}).map(function (id) { return documentoDi(c, id); }).filter(Boolean);
    sotto = 'ordinati ' + h(numeroIt(o.quantita)) + (o.um ? ' ' + h(o.um) : '') + (o.giorno ? ' ' + h(ilGiorno(o.giorno)) : '') +
      ' · arrivati ' + h(numeroIt(o.arrivata)) + (bolle.length ? ' con ' + h(bolle.map(function (b) { return conBolla(b.f); }).join(', ')) : '');
    if (aperto) voci = '<div class="esp-voci"><button class="voce-m" data-az="ordine-modifica" ' + rif + '><b>Correggi l\'ordine</b></button>' +
      bolle.map(function (b) { return '<button class="voce-m" data-az="vai" data-a="#/foto/' + h(b.sop.id) + '/' + h(b.f.id) + '"><b>Vai alla bolla</b><small>' + h(conBolla(b.f)) + '</small></button>'; }).join('') + '</div>';
  }
  return '<div class="ordine' + (manca ? ' diff' : '') + '">' +
    '<button class="desc" data-az="' + (manca ? 'menu-punti' : 'ordine-modifica') + '" data-chiave="' + h(chiave) + '" ' + rif + '>' + h(o.descrizione) + '<small>' + sotto + '</small></button>' +
    (manca
      ? '<span class="stato"><span class="meno">−' + h(numeroIt(manca)) + '</span></span>'
      : '<button class="stato" data-az="ordine-stato" ' + rif + ' aria-label="Cambia stato"><span class="pill ' + st.pill + '">' + h(st.nome) + '</span></button>') +
    '</div>' + voci;
}
// Merce arrivata senza essere a ordine: gialla come le differenze; con un tocco entra fra le righe, già arrivata.
function rigaSenzaOrdineHtml(c, v) {
  const chiave = 'senza-' + v.x.id, aperto = PUNTI_APERTI === chiave;
  return '<div class="ordine diff">' +
    '<button class="desc" data-az="menu-punti" data-chiave="' + h(chiave) + '">' + h(v.x.descrizione) + '<small>arrivati ' + h(contiOrdine(v.x)) + ' con ' + h(conBolla(v.f)) + ' · non a ordine</small></button>' +
    '<span class="stato"><span class="pill att">senza ordine</span></span></div>' +
    (aperto ? '<div class="esp-voci"><button class="voce-m" data-az="ordine-da-bolla" data-sop="' + h(v.sop.id) + '" data-foto="' + h(v.f.id) + '" data-id="' + h(v.x.id) + '"><b>Aggiungi come arrivata</b></button>' +
      '<button class="voce-m" data-az="vai" data-a="#/foto/' + h(v.sop.id) + '/' + h(v.f.id) + '"><b>Vai alla bolla</b><small>' + h(conBolla(v.f)) + '</small></button></div>' : '');
}
// La tendina Ordini del cantiere: le voci che scorrono, e in piede la strada per la pagina.
function tendinaOrdini(c) {
  const voci = vociOrdini(c);
  if (!voci.length) return '';
  return tendina('ordini-' + c.id, 'Ordini',
    '<div class="card">' + scorrevole(listaOrdiniHtml(c, voci)) +
    '<div class="card-piede"><button class="link" style="margin-left:auto" data-az="vai" data-a="#/ordini/' + h(c.id) + '">Cerca e filtra negli ordini</button></div></div>', numeroOrdini(c));
}

/* La pagina degli ordini: ricerca sulla descrizione, filtri di stato, le righe
   complete, e in fondo la lista da mandare al fornitore. */
let filtroOrdini = '', statoOrdini = 'tutti';
const FILTRI_ORDINI = [['tutti', 'tutti'], ['differenza', 'differenza'], ['da_ordinare', 'da ordinare'], ['ordinato', 'ordinato'], ['arrivato', 'arrivato']];
function vistaOrdini(idCantiere) {
  const c = cantiere(idCantiere);
  if (!c) return vistaDashboard();
  const q = senzaAccenti(filtroOrdini.trim());
  const voci = vociOrdini(c).filter(function (v) {
    if (q && senzaAccenti(v.testo).indexOf(q) === -1) return false;
    if (statoOrdini === 'tutti') return true;
    if (statoOrdini === 'differenza') return v.diff;
    return v.o && v.o.stato === statoOrdini;
  });
  const diff = differenzeOrdini(c);
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Ordini', sotto: h(c.nome),
    destra: diff ? '<span class="pill att">' + diff + (diff === 1 ? ' differenza' : ' differenze') + '</span>' : '' });
  html += '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Cerca nella descrizione" value="' + h(filtroOrdini) + '" data-campo="filtro-ordini" autocomplete="off"></div>';
  html += '<div class="periodi">' + FILTRI_ORDINI.map(function (f) {
    return '<button class="pill cod' + (statoOrdini === f[0] ? ' on' : '') + '" data-az="ordini-filtro" data-stato="' + f[0] + '">' + h(f[1]) + '</button>';
  }).join('') + '</div>';
  if (voci.length) html += '<div class="card">' + listaOrdiniHtml(c, voci) + '</div>';
  else html += '<div class="vuoto-stato">' + (ordiniDi(c).length ? 'Nessuna riga con questi filtri.' : 'Nessuna riga. Le righe nascono dal tasto «Rilievo d\'ordine», nel cantiere o nella giornata.') + '</div>';
  if (!REG.attiva && daOrdinare(c).length) html += '<div class="barra"><button class="az verde" data-az="ordine-lista" data-id="' + h(c.id) + '"><span class="ico ico-invio"></span> Lista da ordinare</button></div>';
  return html;
}

/* ---------------- DOCUMENTI ---------------- */
// Tutti i documenti del cantiere, dal più recente, con il sopralluogo in cui stanno.
function documentiTutti(c) {
  const lista = [];
  sopralluoghiDi(c.codice).forEach(function (s) { documentiDi(s).forEach(function (f) { lista.push({ sop: s, f: f }); }); });
  return lista.sort(function (a, b) { return String(b.f.quando).localeCompare(String(a.f.quando)); });
}
// La riga di un documento: genere e fornitore sopra, data e numero sotto.
function rigaDocumentoHtml(v) {
  const f = v.f;
  return '<button class="riga" data-az="vai" data-a="#/foto/' + h(v.sop.id) + '/' + h(f.id) + '">' +
    '<span class="desc">' + h(GENERI[f.genere] || 'Documento') + (f.fornitore ? ' · ' + h(f.fornitore) : '') +
    '<small>' + h(dataSenzaAnno(f.giorno)) + ', ' + h(oraCorta(f.ora)) + (f.numero ? ' · n. ' + h(f.numero) : '') + (f.formato === 'pdf' ? ' · ' + h(paginePdf(f)) : '') + '</small></span>' +
    '<span class="frec">›</span></button>';
}
/* La pagina delle bolle: ricerca su fornitore, numero, referto e righe lette;
   l'elenco per data, dalla più recente. Toccando si apre il documento. */
let filtroDoc = '';
function vistaDocumenti(idCantiere) {
  const c = cantiere(idCantiere);
  if (!c) return vistaDashboard();
  const q = senzaAccenti(filtroDoc.trim());
  const tutti = documentiTutti(c);
  const lista = q ? tutti.filter(function (v) {
    return senzaAccenti([intestazioneBolla(v.f), v.f.referto, (v.f.senzaOrdine || []).map(function (x) { return x.descrizione; }).join(' ')].join(' ')).indexOf(q) !== -1;
  }) : tutti;
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Bolle', sotto: h(c.nome) });
  html += '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Fornitore, numero, una parola del referto" value="' + h(filtroDoc) + '" data-campo="filtro-doc" autocomplete="off"></div>';
  if (lista.length) html += '<div class="card">' + lista.map(rigaDocumentoHtml).join('') + '</div>';
  else html += '<div class="vuoto-stato">' + (tutti.length ? 'Nessun documento con «' + h(filtroDoc) + '».' : 'Nessun documento. Le bolle si scansionano dal tasto «Bolla», nel cantiere o nella giornata.') + '</div>';
  return html;
}

// Il foglio per correggere una riga, campo per campo: lo stesso della contabilità.
let ORDINE_APERTO = null;
function apriRigaOrdine(c, o) {
  const um = o.um || '';
  const opzioniUm = ['', 'pz', 'm', 'm²', 'm³', 'kg', 'q', 't', 'corpo'];
  if (um && opzioniUm.indexOf(um) === -1) opzioniUm.push(um);
  apriFoglio(
    '<h2>' + h(primaRiga(o.descrizione) || 'Riga') + '</h2>' +
    '<label class="eticampo">Descrizione</label><input class="campo" id="o-desc" value="' + h(o.descrizione) + '" autocomplete="off">' +
    '<div class="due" style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Quantità</label><input class="campo" id="o-qta" inputmode="decimal" value="' + h(numeroIt(o.quantita)) + '"></div>' +
    '<div style="flex:1"><label class="eticampo">Unità</label><select class="campo" id="o-um">' + opzioniUm.map(function (u) { return '<option value="' + h(u) + '"' + (u === um ? ' selected' : '') + '>' + (u || '—') + '</option>'; }).join('') + '</select></div></div>' +
    '<label class="eticampo">Misure</label><input class="campo" id="o-mis" value="' + h(o.misure || '') + '" placeholder="120x150 cm" autocomplete="off">' +
    '<div class="righe"><button class="btn btn-ok" data-az="ordine-salva">Salva</button>' +
    '<button class="btn btn-rosso" data-az="ordine-elimina">Elimina</button></div>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>'
  );
  ORDINE_APERTO = { cantiere: c.id, id: o.id };
}

/* La lista per il fornitore: una riga per prodotto, come nel rilievo — prima la
   quantità, poi la cosa, poi le misure. Solo le righe ancora da ordinare. */
function testoListaOrdine(c) {
  return daOrdinare(c).map(rigaOrdineTesto).join('\n');
}
// Lo stesso in CSV per Excel italiano: punto e virgola, decimali con la virgola, BOM per gli accenti.
function csvListaOrdine(c) {
  const cella = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const righe = [['Descrizione', 'Quantità', 'Unità', 'Misure', 'Data rilievo']];
  daOrdinare(c).forEach(function (o) {
    righe.push([o.descrizione, String(o.quantita || 0).replace('.', ','), o.um || '', o.misure || '', o.giorno ? o.giorno.split('-').reverse().join('/') : '']);
  });
  return String.fromCharCode(0xFEFF) + righe.map(function (r) { return r.map(cella).join(';'); }).join('\r\n');
}
function apriListaOrdine(c) {
  apriFoglio(
    '<h2>Lista da ordinare</h2>' +
    '<textarea class="corpo" id="o-lista" readonly>' + h(testoListaOrdine(c)) + '</textarea>' +
    '<div class="righe"><button class="btn btn-ok" data-az="ordine-copia">Copia</button>' +
    '<button class="btn" data-az="ordine-csv" data-id="' + h(c.id) + '">Scarica CSV</button></div>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Chiudi</button>'
  );
  const t = document.getElementById('o-lista');
  if (t) cresciTextarea(t);
}
// Copia negli appunti; se il telefono non lo permette, seleziona il testo e lo dice.
async function copiaTesto(testo, campo) {
  try { await navigator.clipboard.writeText(testo); avvisa('Copiato', 'ok'); return; } catch (e) { /* si prova con la selezione */ }
  if (campo) {
    campo.focus(); campo.select();
    try { if (document.execCommand('copy')) { avvisa('Copiato', 'ok'); return; } } catch (e) { /* neanche così */ }
  }
  avvisa('Non riesco a copiare: il testo è selezionato', 'att');
}

// Le azioni di questo file.
Object.assign(AZIONI, {
  // Il ritaglio della bolla: raddrizza, tieni com'è, o lascia perdere.
  'ritaglio-ok': function () { avvisa('Raddrizzo…'); setTimeout(function () { chiudiRitaglio('tela'); }, 30); },
  'ritaglio-salta': function () { chiudiRitaglio('salta'); },
  'ritaglio-chiudi': function () { chiudiRitaglio(null); },
  // La bolla si rilegge: stessa strada della prima volta, dalla coda.
  'bolla-rileggi': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    accoda({ tipo: 'bolla', sop: s.id, foto: f.id, etichetta: nomeFoto(f) });
    avvisa('Rileggo la bolla…');
    aggiornaVista();
  },
  // Merce arrivata senza ordine: entra fra le righe del cantiere, già arrivata.
  'ordine-da-bolla': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.foto);
    const x = f && (f.senzaOrdine || []).find(function (y) { return y.id === el.dataset.id; });
    const c = s && cantierePerCodice(s.cantiere);
    if (!x || !c) return;
    c.ordini = c.ordini || [];
    const arrivi = {}; arrivi[f.id] = x.quantita;
    c.ordini.push({ id: nuovoId(), descrizione: x.descrizione, quantita: x.quantita, um: x.um, misure: '', stato: 'arrivato', arrivata: x.quantita, arrivi: arrivi, sop: s.codice, giorno: f.giorno, ora: f.ora });
    f.senzaOrdine = f.senzaOrdine.filter(function (y) { return y !== x; });
    salva('cantiere', c);
    salva('sopralluogo', s);
    avvisa('Aggiunta, già arrivata', 'ok');
    aggiornaVista();
  },
  // Le righe d'ordine: lo stato gira con un tocco, il resto passa dal foglio.
  'ordine-stato': function (el) {
    const c = cantiere(el.dataset.cantiere), o = ordineDi(c, el.dataset.id);
    if (!o) return;
    const i = STATI_ORDINE.findIndex(function (s) { return s.id === o.stato; });
    o.stato = STATI_ORDINE[(i + 1) % STATI_ORDINE.length].id;
    salva('cantiere', c);
    aggiornaVista();
  },
  'ordine-modifica': function (el) {
    const c = cantiere(el.dataset.cantiere), o = ordineDi(c, el.dataset.id);
    if (o) apriRigaOrdine(c, o);
  },
  'ordine-salva': function () {
    const c = ORDINE_APERTO && cantiere(ORDINE_APERTO.cantiere), o = ORDINE_APERTO && ordineDi(c, ORDINE_APERTO.id);
    if (!o) { chiudiFoglio(); return; }
    o.descrizione = document.getElementById('o-desc').value.trim();
    const q = leggiNumero(document.getElementById('o-qta').value, ',');
    o.quantita = isNaN(q) ? 0 : q;
    o.um = document.getElementById('o-um').value;
    o.misure = document.getElementById('o-mis').value.trim();
    salva('cantiere', c);
    chiudiFoglio();
    ORDINE_APERTO = null;
    avvisa('Salvato', 'ok');
    aggiornaVista();
  },
  'ordine-elimina': async function () {
    const c = ORDINE_APERTO && cantiere(ORDINE_APERTO.cantiere), o = ORDINE_APERTO && ordineDi(c, ORDINE_APERTO.id);
    chiudiFoglio();
    if (!o) return;
    const ok = await chiedi('Eliminare la riga?', o.descrizione, 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    c.ordini = c.ordini.filter(function (x) { return x.id !== o.id; });
    salva('cantiere', c);
    ORDINE_APERTO = null;
    avvisa('Eliminata', 'ok');
    aggiornaVista();
  },
  'ordine-lista': function (el) { const c = cantiere(el.dataset.id); if (c) apriListaOrdine(c); },
  'ordini-filtro': function (el) { statoOrdini = el.dataset.stato; aggiornaVista(); },
  'ordine-copia': function () { const t = document.getElementById('o-lista'); if (t) copiaTesto(t.value, t); },
  'ordine-csv': function (el) {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    scaricaBlob(new Blob([csvListaOrdine(c)], { type: 'text/csv;charset=utf-8' }), 'ordine-' + oggiISO() + '.csv');
  },
});

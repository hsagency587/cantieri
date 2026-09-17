/* CANTIERI — viste-giorno.js: giornata, sopralluoghi, verbale, foto */
'use strict';


/* ============================================================
   LE FOTOGRAFIE
   Si scattano dal sopralluogo e restano attaccate a quel giorno, in IndexedDB
   come l'audio. Si riducono PRIMA di salvarle, sempre: nel telefono non entra
   mai una foto a piena risoluzione. Sulla foto non si scrive niente: data, ora
   e cantiere sono dati, e si mostrano accanto. Nel JSON che va su GitHub c'è
   solo il riferimento e il testo, mai l'immagine.
   ============================================================ */

// createImageBitmap raddrizza la foto secondo l'orientamento del telefono; se manca si passa da un <img>.
async function apriImmagine(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { /* si prova l'altra strada */ }
  }
  return await new Promise(function (ok, no) {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = function () { URL.revokeObjectURL(url); ok(im); };
    im.onerror = function () { URL.revokeObjectURL(url); no(new Error('Il telefono non riesce ad aprire questa foto')); };
    im.src = url;
  });
}

/* Un documento può essere un PDF fatto dallo scanner del telefono. Si riconosce dal
   tipo o dal nome; si contano le pagine con pdf-lib quando c'è (null se non si riesce). */
function ePdf(file) { return file.type === 'application/pdf' || /\.pdf$/i.test(file.name || ''); }
async function contaPaginePdf(blob) {
  if (!window.PDFLib) return null;
  try { return (await window.PDFLib.PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true })).getPageCount(); }
  catch (e) { return null; }
}
// L'estensione con cui un file esce dal telefono: le scansioni PDF non sono jpg.
function estensioneMedia(f) { return f.formato === 'pdf' ? '.pdf' : '.jpg'; }
function tipoMedia(f, blob) { return blob.type || (f.formato === 'pdf' ? 'application/pdf' : 'image/jpeg'); }

// Lato lungo a latoMax, JPEG alla qualità detta. Torna il blob e le misure, che servono al PDF.
async function riduciFoto(file, latoMax, qualita) {
  const im = await apriImmagine(file);
  const w = im.naturalWidth || im.width, a = im.naturalHeight || im.height;
  if (!w || !a) throw new Error('Foto vuota');
  const scala = Math.min(1, latoMax / Math.max(w, a));
  const W = Math.max(1, Math.round(w * scala)), A = Math.max(1, Math.round(a * scala));
  const tela = document.createElement('canvas');
  tela.width = W; tela.height = A;
  tela.getContext('2d').drawImage(im, 0, 0, W, A);
  if (im.close) im.close();
  const blob = await new Promise(function (ok, no) {
    tela.toBlob(function (b) { if (b) ok(b); else no(new Error('Riduzione non riuscita')); }, 'image/jpeg', qualita);
  });
  // Safari tiene la memoria della tela finché esiste: la si svuota subito, il telefono ne ha poca.
  tela.width = 1; tela.height = 1;
  return { blob: blob, larghezza: W, altezza: A };
}
// Una tela già della misura giusta diventa un JPEG, con le misure che servono al PDF.
async function blobDaTela(tela, qualita) {
  const W = tela.width, A = tela.height;
  const blob = await new Promise(function (ok, no) {
    tela.toBlob(function (b) { if (b) ok(b); else no(new Error('Riduzione non riuscita')); }, 'image/jpeg', qualita);
  });
  tela.width = 1; tela.height = 1;
  return { blob: blob, larghezza: W, altezza: A };
}

/* ---- la fotocamera dentro l'app ----
   La fotocamera del telefono, aperta dall'ingresso file, su Android chiude spesso la
   pagina per liberare memoria: la foto scattata non torna mai. Qui la camera si apre
   dentro l'app, a tutto schermo, e lo scatto non esce mai dalla pagina. Se la camera
   non si può aprire (permesso negato, browser vecchio) si torna all'ingresso file. */
let CAMERA = null;
function ingressoScatto() { const f = document.getElementById('file-foto-scatta'); if (f) f.click(); }
async function apriFotocamera(sopId) {
  if (CAMERA) return;
  if (!sopId || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { ingressoScatto(); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } });
  } catch (e) { ingressoScatto(); return; }
  const box = document.createElement('div');
  box.id = 'fotocamera';
  box.innerHTML = '<video autoplay playsinline muted></video>' +
    '<button class="chiudi" data-az="fotocamera-chiudi" aria-label="Chiudi">✕</button>' +
    '<button class="scatta" data-az="fotocamera-scatta" aria-label="Scatta"></button>';
  document.body.appendChild(box);
  const video = box.querySelector('video');
  video.srcObject = stream;
  CAMERA = { stream: stream, box: box, video: video, sop: sopId };
}
function chiudiFotocamera() {
  if (!CAMERA) return;
  CAMERA.stream.getTracks().forEach(function (t) { t.stop(); });
  CAMERA.box.remove();
  CAMERA = null;
}
// Il fotogramma di adesso diventa un JPEG e prende la strada di ogni altra foto.
async function scattaFotocamera() {
  if (!CAMERA || !CAMERA.video.videoWidth) return;
  const v = CAMERA.video, sop = CAMERA.sop;
  const tela = document.createElement('canvas');
  tela.width = v.videoWidth; tela.height = v.videoHeight;
  tela.getContext('2d').drawImage(v, 0, 0);
  const blob = await new Promise(function (ok) { tela.toBlob(ok, 'image/jpeg', 0.92); });
  tela.width = 1; tela.height = 1;
  chiudiFotocamera();
  if (!blob) { avvisa('Scatto non riuscito', 'err'); return; }
  await aggiungiFoto(new File([blob], 'scatto.jpg', { type: 'image/jpeg' }), sop, 'scatto');
}

/* Dal file scelto (scattato o preso dal rullino) alla voce in media del sopralluogo.
   Poi si apre la foto grande: la cosa più probabile è che voglia dire subito cos'è. */
async function aggiungiFoto(file, sopId, origine, genere) {
  const s = sopralluogo(sopId);
  if (!s || !file) return;
  const doc = !!GENERI[genere];
  /* Lo scanner del telefono restituisce un PDF: si salva com'è, senza disegnarlo.
     Le pagine si contano con pdf-lib, se c'è; se non si riesce restano ignote. */
  const pdf = doc && ePdf(file);
  // Bolla e registro firme sono fogli fotografati: passano dal ritaglio scanner.
  // Un documento generale può essere già un PDF o una foto pulita: niente ritaglio.
  const scansiona = genere === 'bolla' || genere === 'firme';
  let ridotta = null;
  if (scansiona && !pdf) {
    let esito = 'salta';
    try { esito = await ritagliaDocumento(file); } catch (e) { avvisa(e.message || 'Foto non leggibile', 'err'); return; }
    if (!esito) return;
    if (esito !== 'salta') ridotta = await blobDaTela(esito, QUALITA_DOC);
  }
  avvisa(doc ? 'Preparo la scansione…' : 'Preparo la foto…');
  if (pdf) {
    ridotta = { blob: file, larghezza: 0, altezza: 0, pagine: await contaPaginePdf(file) };
  } else if (!ridotta) {
    try { ridotta = await riduciFoto(file, doc ? LATO_DOC : LATO_FOTO, doc ? QUALITA_DOC : QUALITA_FOTO); }
    catch (e) { avvisa(e.message || 'Foto non leggibile', 'err'); return; }
  }
  const id = nuovoId();
  let rif;
  try { rif = await salvaMedia(id, ridotta.blob); }
  catch (e) { avvisa('Foto non salvata', 'err'); return; }
  // Dal rullino vale la data del file, se è credibile; uno scatto è adesso.
  const d = (origine === 'rullino' && file.lastModified && file.lastModified < Date.now() - 60000) ? new Date(file.lastModified) : new Date();
  if (!Array.isArray(s.media)) s.media = [];
  const f = {
    id: id, codice: codiceNuovo(doc ? 'DOC' : 'FOTO'), tipo: 'foto', genere: doc ? genere : null, file: rif,
    quando: d.toISOString(), giorno: dataLocaleISO(d), ora: oraAdesso(d),
    // Un documento non è di una sezione del verbale: è un allegato, e ci va sempre.
    sezione: doc ? '' : SEZIONE_FOTO, referto: '', grezzo: '', nelPdf: doc,
    // Vale per tutto il cantiere, non solo per la giornata in cui è stato preso.
    cantiere: doc ? !!DOC_PER_CANTIERE : false,
    peso: ridotta.blob.size, larghezza: ridotta.larghezza, altezza: ridotta.altezza,
    stato: '', audio: null
  };
  // Campi in più solo per il PDF scansionato: una foto normale non li ha, e non cambia.
  if (pdf) { f.formato = 'pdf'; f.pagine = ridotta.pagine; }
  s.media.push(f);
  salva('sopralluogo', s);
  /* Dopo uno scatto non si cambia schermata: in cantiere le foto si fanno in fila, e
     cambiare pagina fra una e l'altra costava un tocco ogni volta. La miniatura compare
     da sola nella striscia; il referto si detta toccandola, quando si ha tempo. */
  if (doc) { avvisa(GENERI[genere] + ' salvata', 'ok'); aggiornaVista(); return; }
  avvisa('Foto salvata · ' + fotoNormali(s).length + ' oggi', 'ok');
  aggiornaVista();
}

/* Tolta una registrazione, si toglie l'audio dal telefono e i suoi lavori dalla coda.
   Il testo già finito nelle sezioni resta dov'è: è del verbale, non della registrazione. */
async function eliminaPezzo(s, p) {
  const loc = leggiLocale();
  loc.coda = loc.coda.filter(function (l) { return l.pezzo !== p.id; });
  salvaLocale();
  if (pezzoInAscolto === p.id) { const lettore = document.getElementById('lettore'); if (lettore) lettore.pause(); pezzoInAscolto = null; }
  if (p.audio) await cancellaMedia(p.audio);
  s.pezzi = s.pezzi.filter(function (x) { return x !== p; });
  salva('sopralluogo', s);
}

// Tolta una foto, si tolgono il file, l'audio del referto se è ancora in giro, e i suoi lavori in coda.
async function eliminaFoto(s, f) {
  const loc = leggiLocale();
  loc.coda = loc.coda.filter(function (l) { return l.foto !== f.id; });
  salvaLocale();
  if (f.file) { scordaFoto(f.file); await cancellaMedia(f.file); }
  if (f.lettura) await cancellaMedia(f.lettura);
  if (f.audio) await cancellaMedia(f.audio);
  s.media = (s.media || []).filter(function (m) { return m !== f; });
  salva('sopralluogo', s);
}
// Quando si cancella un sopralluogo intero: i file di tutte le sue foto.
async function cancellaFileFoto(s) {
  for (const f of fotoDi(s)) {
    if (f.file) { scordaFoto(f.file); await cancellaMedia(f.file); }
    if (f.lettura) await cancellaMedia(f.lettura);
    if (f.audio) await cancellaMedia(f.audio);
  }
}
/* Via un sopralluogo intero: i suoi audio, le sue foto, il suo verbale, e lui.
   La giornata resta: è un dato suo, e se questo era l'ultimo passaggio resta vuota. */
async function eliminaSopralluogo(s) {
  for (const p of s.pezzi) { if (p.audio) await cancellaMedia(p.audio); }
  await cancellaFileFoto(s);
  const v = verbaleDiSopralluogo(s.codice);
  if (v) cancella('verbale', v.id);
  assicuraGiornata(s.cantiere, s.giorno);
  cancella('sopralluogo', s.id);
}
/* Via una giornata intera: tutti i suoi sopralluoghi, il verbale di giornata, e lei.
   Il cantiere resta com'è. */
async function eliminaGiornata(codiceCantiere, giorno) {
  for (const s of sopralluoghiDelGiorno(codiceCantiere, giorno)) await eliminaSopralluogo(s);
  const vg = verbaleDiGiornata(codiceCantiere, giorno);
  if (vg) cancella('verbale', vg.id);
  const g = giornataDi(codiceCantiere, giorno);
  if (g) cancella('giornata', g.id);
}

/* Le schermate sono stringhe HTML e IndexedDB è asincrono: le immagini si
   mettono dopo, leggendo il blob una volta sola e tenendo l'indirizzo in
   memoria. Le foto non cambiano mai una volta salvate, quindi si può. */
const URL_FOTO = {};
function urlFoto(rif) {
  if (!URL_FOTO[rif]) {
    URL_FOTO[rif] = leggiMedia(rif).then(function (blob) {
      if (!blob) { delete URL_FOTO[rif]; return null; }
      return URL.createObjectURL(blob);
    });
  }
  return URL_FOTO[rif];
}
function scordaFoto(rif) {
  const p = URL_FOTO[rif];
  if (!p) return;
  delete URL_FOTO[rif];
  p.then(function (u) { if (u) URL.revokeObjectURL(u); });
}
function caricaImmagini(radice) {
  radice.querySelectorAll('img[data-foto]').forEach(function (img) {
    urlFoto(img.dataset.foto).then(function (u) {
      if (!img.isConnected) return;
      if (u) img.src = u;
      else { const q = img.parentElement; if (q) { q.classList.add('persa'); img.remove(); } }
    });
  });
}

// La coda sa più della foto: se un lavoro suo è in corso o è fallito, lo si dice.
function statoLavoroFoto(f) {
  const loc = leggiLocale();
  const l = loc.coda.find(function (x) { return x.foto === f.id; });
  const copia = Object.assign({}, f);
  if (l) {
    // La bolla in coda o in lettura dice la stessa cosa: si sta leggendo.
    if (l.tipo === 'bolla' && l.stato !== 'fallito') copia.stato = 'lettura';
    else if (l.stato === 'in_corso') copia.stato = l.tipo === 'referto' ? 'trascritto' : 'in_corso';
    else if (l.stato === 'fallito') { copia.stato = 'errore'; copia.errore = l.errore; }
    else if (l.stato === 'in_attesa') { copia.stato = l.tipo === 'referto' ? 'trascritto' : 'in_coda'; copia.errore = l.errore || null; }
  } else if (f.stato === 'in_coda' || f.stato === 'in_corso' || f.stato === 'trascritto') {
    // Un lavoro sparito dalla coda (svuotata a mano) non deve sembrare ancora in corso.
    copia.stato = 'errore'; copia.errore = 'tolto dalla coda';
  }
  return copia;
}
function descriviStatoFoto(st) {
  if (st.stato === 'lettura') return { testo: 'Leggo la bolla…', classe: 'att' };
  if (st.stato === 'in_coda') return { testo: 'referto in coda' + (st.errore ? ' · ' + st.errore : ''), classe: 'att' };
  if (st.stato === 'in_corso') return { testo: 'trascrivendo…', classe: 'att' };
  if (st.stato === 'trascritto') return { testo: 'trascritto, sistemo il referto…', classe: 'att' };
  if (st.stato === 'errore') return { testo: 'non riuscito: ' + (st.errore || ''), classe: 'err' };
  return { testo: '', classe: '' };
}

// Le miniature in fila. Con opzioni.segna sotto ognuna c'è il tasto per metterla nel PDF o toglierla.
function filaFoto(s, lista, opzioni) {
  opzioni = opzioni || {};
  if (!lista.length) return '';
  return '<div class="foto-fila">' + lista.map(function (x) {
    // Un elemento è la foto, oppure { sop, f } quando la fila mette insieme più sopralluoghi.
    const f = x.f || x, sx = x.sop || s;
    const st = statoLavoroFoto(f);
    const eti = opzioni.doc ? (st.stato === 'lettura' ? 'Leggo…' : (GENERI_BREVI[f.genere] || 'documento')) : (st.stato === 'errore' ? 'non riuscito' : ((st.stato && st.stato !== 'riordinato') ? 'referto…' : f.ora));
    return '<div class="foto-mini' + (f.nelPdf ? ' pdf' : '') + '">' +
      '<button class="q' + (f.file ? '' : ' manca') + (f.formato === 'pdf' ? ' scan' : '') + '" data-az="vai" data-a="#/foto/' + h(sx.id) + '/' + h(f.id) + '" aria-label="Apri ' + h(nomeFoto(f)) + '">' +
      // Una scansione PDF non ha miniatura: l'icona del documento e il numero di pagine.
      (f.file ? (f.formato === 'pdf' ? '<span class="ico ico-documento"></span><small>' + (f.pagine ? f.pagine + ' pag.' : 'PDF') + '</small>' : '<img data-foto="' + h(f.file) + '" alt="">') : '') + '</button>' +
      // La ✕ sull'angolo della miniatura: una foto sbagliata si butta senza aprirla, sempre.
      '<button class="x-mini" data-az="foto-elimina" data-sop="' + h(sx.id) + '" data-id="' + h(f.id) + '" aria-label="Elimina ' + h(nomeFoto(f)) + '">✕</button>' +
      /* Il bollino del PDF sta nell'angolo basso della foto. Dove serve scegliere si tocca,
         e non ruba una riga sotto la miniatura; altrove dice soltanto com'è messa. */
      (opzioni.segna
        ? '<button class="tacca' + (f.nelPdf ? ' on' : '') + '" data-az="foto-marca" data-sop="' + h(sx.id) + '" data-id="' + h(f.id) + '" aria-label="' + (f.nelPdf ? 'Togli dal PDF' : 'Metti nel PDF') + '">' + (f.nelPdf ? '✓ PDF' : '☐ PDF') + '</button>'
        : (f.nelPdf ? '<span class="tacca on">✓ PDF</span>' : '')) +
      '<span class="e' + (st.stato === 'errore' ? ' err' : ((st.stato && st.stato !== 'riordinato') ? ' att' : '')) + '">' + h(eti) + '</span>' +
      '</div>';
  }).join('') + '</div>';
}
// Le foto di un sopralluogo divise per sezione: serve alle schermate del giorno e al PDF.
function fotoPerSezione(s) {
  const per = {};
  fotoNormali(s).forEach(function (f) { const k = sezioneFoto(f); (per[k] = per[k] || []).push(f); });
  return per;
}

function creaSopralluogo(c, giorno, ora) {
  assicuraGiornata(c.codice, giorno || oggiISO());
  return salva('sopralluogo', {
    cantiere: c.codice, giorno: giorno || oggiISO(), ora: ora || oraAdesso(), nome: '',
    sezioni: sezioniVuote(), pezzi: [], chiuso: null, media: [], posizione: null
  });
}
/* Dove va a finire quello che si detta adesso. In una giornata i sopralluoghi possono
   essere più d'uno: si scrive sull'ultimo rimasto aperto. Se sono tutti chiusi, o non ce
   n'è ancora nessuno, ne nasce uno con l'ora di adesso. La scelta vera, quando serve,
   arriva dopo: a testo trascritto, non prima di premere. */
function sopralluogoPerDettare(c) {
  const aperti = sopralluoghiApertiOggi(c.codice);
  return aperti.length ? aperti[aperti.length - 1] : creaSopralluogo(c);
}

/* ---------------- IL GIORNO ---------------- */
function vistaGiorno(id) {
  const s = sopralluogo(id);
  if (!s) return vistaDashboard();
  const c = cantierePerCodice(s.cantiere) || { nome: '?', id: '' };
  // Aprire un giorno vale come aprire il suo cantiere: è quello su cui "Detta" della dashboard andrà.
  if (c.id) { const loc = leggiLocale(); if (loc.ultimoCantiere !== c.id) { loc.ultimoCantiere = c.id; salvaLocale(); } }
  // Una vista sola: fatto il verbale, la giornata resta quella che era e si continua a lavorarci.
  return vistaGiornoInCorso(s, c);
}

/* La giornata senza sopralluoghi: la stessa testa della giornata piena, e sotto solo
   la striscia con "＋ un altro". Se intanto un sopralluogo c'è, si va su quello. */
function vistaGiornata(id) {
  const g = leggiTutto().giornate[id];
  if (!g) return vistaDashboard();
  const sops = sopralluoghiDelGiorno(g.cantiere, g.giorno);
  if (sops.length) return vistaGiorno(sops[0].id);
  const c = cantierePerCodice(g.cantiere) || { nome: '?', id: '' };
  const vg = verbaleDiGiornata(g.cantiere, g.giorno);
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: dataBreve(g.giorno), sotto: h(c.nome),
    destra: '' });
  html += '<div class="avanz"><div class="r">' +
    tastoVerbaleGiornata(vg, g.cantiere, g.giorno) +
    '<span class="dx">0 audio · 0:00 | 0 foto</span></div></div>';
  if (vg) html += cardVerbaleGiornata(vg);
  html += '<div class="card"><div class="card-capo">Sopralluoghi del giorno<span class="dx">nessuno</span></div><div class="doc-fila">' +
    '<div class="doc-mini piu"><button class="q vuota" data-az="giornata-sopralluogo-nuovo" data-cantiere="' + h(g.cantiere) + '" data-giorno="' + h(g.giorno) + '"><span class="ora">＋</span><span class="nm">sopralluogo</span></button></div>' +
    '</div></div>';
  return html;
}

/* Il tasto in testa alla giornata: verde per scrivere il verbale, verde per aggiornarlo
   se dal verbale in poi è cambiato qualcosa; grigio e spento se non c'è niente da aggiornare. */
function tastoVerbaleGiornata(vg, codiceCantiere, giorno) {
  if (vg && verbaleAllineato(vg)) return '<button class="pill grigia" disabled>Aggiorna il verbale</button>';
  return '<button class="pill ok" data-az="giornata-verbale" data-cantiere="' + h(codiceCantiere) + '" data-giorno="' + h(giorno) + '">' + (vg ? 'Aggiorna il verbale' : 'Scrivi il verbale') + '</button>';
}
// La card del verbale di giornata: il titolo nel colore primario, come il pallino, e i tre tasti.
function cardVerbaleGiornata(vg) {
  return '<div class="card"><div class="card-capo"><span class="et acc">Verbale di giornata</span></div>' +
    '<div class="griglia tre">' +
    '<button class="btn" data-az="verbale-vedi" data-id="' + h(vg.id) + '">Visualizza</button>' +
    tastoEsporta('vg-' + vg.id) +
    '<button class="btn" data-az="vai" data-a="#/verbale/' + h(vg.id) + '">Modifica</button></div>' +
    vociEsporta('vg-' + vg.id, 'verbale-esporta', vg.id, 'verbale-scarica', vg.id) + '</div>';
}
// Il sopralluogo aperto sotto il box (Fase 7.5): resta quello scelto finché si sta in questa giornata.
let sopralluogoEspanso = null;
function vistaGiornoInCorso(s, c) {
  if (!sopralluogoEspanso || !sopralluoghiDelGiorno(s.cantiere, s.giorno).some(function (x) { return x.id === sopralluogoEspanso; })) sopralluogoEspanso = s.id;
  const attivo = sopralluogo(sopralluogoEspanso) || s;
  const registrandoQui = REG.attiva && REG.destinazione && ((REG.destinazione.tipo === 'sopralluogo' && REG.destinazione.id === attivo.id) ||
    (REG.destinazione.tipo === 'rilievo' && REG.destinazione.sop === attivo.id));
  const quanteFoto = fotoNormali(s).length;
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: dataBreve(s.giorno), sotto: h(c.nome) + (sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1 ? ' · ' + h(oraCorta(s.ora)) : ''), tocca: 'modifica-testata', id: s.id,
    destra: registrandoQui ? '<span class="pill reg">● rec</span>' : '' });
  /* 7.1 — resta com'era: il verbale di giornata, il tasto e la card Visualizza/Esporta/Modifica. */
  const vg = verbaleDiGiornata(s.cantiere, s.giorno);
  const fratelli = sopralluoghiDelGiorno(s.cantiere, s.giorno);
  const audioTotali = fratelli.reduce(function (t, x) { return t + x.pezzi.length; }, 0);
  const parlatoTotale = fratelli.reduce(function (t, x) { return t + x.pezzi.reduce(function (u, p) { return u + (p.durata || 0); }, 0); }, 0);
  html += '<div class="avanz"><div class="r">' +
    tastoVerbaleGiornata(vg, s.cantiere, s.giorno) +
    '<span class="dx">' + (registrandoQui ? 'sto ascoltando…' : (audioTotali + ' audio · ' + durataBreve(parlatoTotale) + ' | ' + quanteFoto + ' foto')) + '</span></div></div>';
  if (vg) html += cardVerbaleGiornata(vg);
  // 7.2 — due tendine in cima: foto e bolle di tutta la giornata.
  html += cardFotoGiornataConTutte(s);
  html += bolleGiornataHtml(s);
  // 7.3 — linea sottile, due tasti: rilevamento d'ordine e bolla. Agiscono sul sopralluogo aperto.
  if (!REG.attiva) {
    html += '<div class="card"><div class="griglia">' +
      '<button class="btn" data-az="detta-rilievo" data-id="' + h(attivo.id) + '" data-sezione="rilievi_ordine"><span class="ico ico-righello"></span> Rilievo d\'ordine</button>' +
      '<button class="btn" data-az="doc-scansiona" data-id="' + h(attivo.id) + '" data-genere="bolla"><span class="ico ico-documento"></span> Bolla</button>' +
      '</div></div>';
  }
  html += ingressiDocumento(attivo);
  // 7.4 — box dei sopralluoghi, righe in verticale.
  html += boxSopralluoghi(s, attivo.id);
  html += cardDaAssegnare(s);
  // 7.5-7.6 — il sopralluogo aperto: non una pagina nuova, il contenuto compare qui sotto.
  html += cardRilieviNuovi({ sop: attivo.id });
  html += contenutoSopralluogoEspanso(attivo);
  html += ingressiFoto(attivo);
  if (!REG.attiva) {
    html += '<div class="barra"><button class="az verde" data-az="detta" data-id="' + h(attivo.id) + '"><span class="ico ico-microfono"></span> Detta</button>' +
      '<button class="az verde" data-az="foto-scatta" data-id="' + h(attivo.id) + '"><span class="ico ico-fotocamera"></span> Foto</button></div>';
  }
  return html;
}

/* I verbali di giornata del cantiere, uno di fianco all'altro. Stesse card, stessi
   tre puntini: Visualizza, Modifica, Esporta, Scarica. */
/* Cosa sta nella casella dei verbali: i verbali di giornata della settimana in
   corso (da lunedì), il verbale di questa settimana appena fatto, e quello della settimana scorsa,
   che resta lì tutta la settimana per poterla confrontare con questa. Alla mezzanotte di domenica
   i giorni escono e resta la settimana chiusa; i PDF di giornata restano in "PDF archiviati". */
function verbaliInVista(c) {
  const lunedi = lunediDi(oggiISO());
  const scorsa = dataLocaleISO(new Date(daISO(lunedi).getTime() - 7 * 86400000));
  const settimane = pdfDi(c.codice).filter(function (p) { return p.tipo === 'periodo'; }).map(function (p) {
    const k = String(p.chiave || '').split(':');
    return { pdf: p, dal: k[2] || '', al: k[3] || '' };
  }).filter(function (w) { return w.dal >= scorsa; }).sort(function (a, b) { return b.al.localeCompare(a.al); });
  const giornate = verbaliDiGiornata(c.codice).filter(function (v) { return v.giorno >= lunedi; });
  return { settimane: settimane, giornate: giornate };
}
function strisciaVerbaliGiornata(c) {
  const vista = verbaliInVista(c);
  const lista = vista.giornate;
  if (!lista.length && !vista.settimane.length) return '';
  // La card di un verbale di settimana: si tocca per leggere il PDF, i puntini per mandarlo fuori o buttarlo.
  const cardSettimana = function (w) {
    const aperto = PUNTI_APERTI === w.pdf.id;
    return '<div class="doc-mini fatto' + (aperto ? ' menu' : '') + '">' +
      '<div class="q"><span class="ora">Settimana</span><span class="nm">' + h(giornoMese(w.dal) + ' – ' + giornoMese(w.al)) + '</span></div>' +
      (aperto
        ? '<div class="voci"><button class="voce-m" data-az="settimana-rifai" data-id="' + h(c.id) + '" data-dal="' + h(w.dal) + '" data-al="' + h(w.al) + '">Rifai</button>' +
          '<button class="voce-m" data-az="pdf-manda" data-id="' + h(w.pdf.id) + '">Esporta</button>' +
          '<button class="voce-m" data-az="pdf-fuori" data-id="' + h(w.pdf.id) + '">Scarica</button>' +
          '<button class="voce-m rossa" data-az="pdf-elimina" data-id="' + h(w.pdf.id) + '">Elimina</button></div>'
        : '<button class="vedi" data-az="pdf-apri" data-id="' + h(w.pdf.id) + '">Visualizza</button>') +
      '<button class="punti' + (aperto ? ' on' : '') + '" data-az="menu-verbale" data-id="' + h(w.pdf.id) + '" aria-label="Altro">⋯</button>' +
      '</div>';
  };
  return '<div class="card"><div class="card-capo">Verbali<span class="dx">' + (vista.settimane.length + lista.length) + '</span></div>' +
    '<div class="doc-fila">' + vista.settimane.map(cardSettimana).join('') + lista.map(function (v) {
      const suoNome = String(v.nome || '').trim();
      const aperto = PUNTI_APERTI === v.id;
      return '<div class="doc-mini' + (aperto ? ' menu' : '') + '">' +
        '<div class="q">' +
        '<span class="ora">' + h(suoNome || 'Giornata ' + delGiorno(v.giorno)) + '</span>' +
        '<span class="nm">' + h(giornoMese(v.giorno)) + '</span></div>' +
        (aperto
          ? '<div class="voci">' + vociMenuVerbale(v) + '</div>'
          : '<button class="vedi" data-az="verbale-vedi" data-id="' + h(v.id) + '">Visualizza</button>') +
        '<button class="punti' + (aperto ? ' on' : '') + '" data-az="menu-verbale" data-id="' + h(v.id) + '" aria-label="Altro">⋯</button>' +
        '</div>';
    }).join('') + '</div></div>';
}

/* Il verbale di giornata mette insieme i verbali dei sopralluoghi di quel giorno.
   Sezione per sezione, con davanti l'ora del passaggio da cui viene il testo, così
   chi legge sa in che momento della giornata è successa ogni cosa. Si riscrive: è
   sempre lo stesso documento, con lo stesso codice. */
async function faiVerbaleGiornata(codiceCantiere, giorno) {
  const c = cantierePerCodice(codiceCantiere);
  if (!c) return;
  const sops = sopralluoghiDelGiorno(codiceCantiere, giorno);
  if (!sops.length) { avvisa('Nessun sopralluogo in questa giornata', 'att'); return; }
  // Senza verbale vuol dire senza verbale: non "non chiuso".
  const senza = sops.filter(function (x) { return !verbaleDiSopralluogo(x.codice); }).length;
  const gia = verbaleDiGiornata(codiceCantiere, giorno);
  // Una riga sola, e solo se serve: chi non ha il verbale entra con i suoi appunti.
  let testo = !senza ? '' : (senza === 1
    ? 'Un sopralluogo non ha ancora il suo verbale. I suoi appunti entrano lo stesso.'
    : senza + ' sopralluoghi non hanno ancora il loro verbale. I loro appunti entrano lo stesso.');
  testo = (testo ? testo + ' ' : '') + 'Gli audio già trascritti sono già stati cancellati dal telefono: resta il testo.';
  const ok = await chiedi(gia ? 'Aggiornare il verbale di giornata?' : 'Scrivere il verbale di giornata?', testo, gia ? 'Aggiorna' : 'Scrivi', '',
    '<label class="eticampo">Nome del verbale</label><input class="campo" id="vg-nome" maxlength="80" placeholder="facoltativo" value="' + h(gia ? (gia.nome || '') : '') + '">');
  const campo = document.getElementById('vg-nome');
  const nomeScelto = campo ? campo.value.trim() : '';
  chiudiFoglio();
  if (!ok) return;
  const v = scriviVerbaleGiornata(codiceCantiere, giorno, nomeScelto);
  // Anche il verbale di giornata è una trascrizione approvata: gli audio del giorno si cancellano.
  for (const x of sops) await cancellaAudioTrascritti(x);
  avvisa(gia ? 'Verbale di giornata aggiornato' : 'Verbale di giornata scritto', 'ok');
  aggiornaVista();
  /* Il PDF si fa subito e scende nel telefono: il verbale di giornata è il documento
     che si manda fuori, non serve un altro tocco. Resta archiviato, così "Visualizza"
     lo apre senza aspettare. */
  if (!v) return;
  const p = await pdfVerbale(v);
  if (!p) { avvisa('PDF non pronto: serve la rete la prima volta', 'att'); return; }
  const blob = p.file ? await leggiMedia(p.file) : null;
  if (blob) scaricaBlob(blob, p.nome || 'verbale.pdf');
  aggiornaVista();
}
/* La scrittura vera, senza domande: la usa il tasto qui sopra e la chiusura della
   settimana, che i verbali mancanti li fa da sola. Torna null se il giorno è vuoto. */
/* L'impronta di quello che entra in un verbale: le sezioni, le foto spuntate con il
   loro referto e la loro sezione, i documenti nel PDF. Si salva sul verbale quando lo
   si scrive; finché non cambia nemmeno una virgola, "Aggiorna" non ha niente da fare. */
function improntaSopralluogo(s) {
  return JSON.stringify([
    CHIAVI_SEZIONI.map(function (k) { return s.sezioni[k] || ''; }), s.sezioni.da_smistare || '',
    fotoNormali(s).filter(function (f) { return f.nelPdf; }).map(function (f) { return [f.id, f.referto || '', sezioneFoto(f)]; }),
    documentiDi(s).filter(function (f) { return f.nelPdf; }).map(function (f) { return [f.id, f.referto || '']; })
  ]);
}
// Il verbale di giornata prende il testo dai verbali dei passaggi, se ci sono; le foto dai passaggi.
function improntaGiornata(sops) {
  return JSON.stringify(sops.map(function (x) {
    const vb = verbaleDiSopralluogo(x.codice);
    return [x.codice, x.ora, x.nome || '', vb ? CHIAVI_SEZIONI.map(function (k) { return vb.sezioni[k] || ''; }) : null, improntaSopralluogo(x)];
  }));
}
// Vero se dal verbale in poi non è cambiato niente. Un verbale vecchio senza impronta conta come cambiato.
function verbaleAllineato(v) {
  if (!v || !v.impronta) return false;
  if (v.giornata) return improntaGiornata(sopralluoghiDelGiorno(v.cantiere, v.giorno)) === v.impronta;
  const s = sopralluogoPerCodice(v.sopralluogo);
  return !!s && improntaSopralluogo(s) === v.impronta;
}
function scriviVerbaleGiornata(codiceCantiere, giorno, nomeScelto) {
  const sops = sopralluoghiDelGiorno(codiceCantiere, giorno);
  if (!sops.length) return null;
  const sezioni = {};
  CHIAVI_SEZIONI.forEach(function (k) { sezioni[k] = ''; });
  sops.forEach(function (x) {
    const vb = verbaleDiSopralluogo(x.codice);
    const fonte = vb ? vb.sezioni : x.sezioni;
    CHIAVI_SEZIONI.forEach(function (k) {
      const t = String(fonte[k] || '').trim();
      if (!t) return;
      sezioni[k] = aggiungiTesto(sezioni[k], (String(x.nome || '').trim() ? x.nome + '\n' : '') + t);
    });
  });
  let v = verbaleDiGiornata(codiceCantiere, giorno);
  const campi = { cantiere: codiceCantiere, giorno: giorno, ora: sops[0].ora, giornata: true, impronta: improntaGiornata(sops),
    sopralluoghi: sops.map(function (x) { return x.codice; }), nome: nomeScelto || '', sezioni: sezioni };
  if (v) { Object.assign(v, campi); return salva('verbale', v); }
  return salva('verbale', campi);
}

/* Le tre voci che compaiono dentro la card quando si toccano i puntini. */
function vociMenuVerbale(v) {
  return '<button class="voce-m" data-az="pdf-modifica" data-id="' + h(v.id) + '">Modifica</button>' +
    '<button class="voce-m" data-az="verbale-esporta" data-id="' + h(v.id) + '">Esporta</button>' +
    '<button class="voce-m" data-az="verbale-scarica" data-id="' + h(v.id) + '">Scarica</button>' +
    '<button class="voce-m rossa" data-az="verbale-elimina" data-id="' + h(v.id) + '">Elimina</button>';
}
/* Sul sopralluogo: prima del verbale si scrive o si modifica la giornata; dopo,
   le stesse voci del verbale. Elimina c'è sempre, e porta via anche il verbale. */
function vociMenuSopralluogo(x) {
  const vb = verbaleDiSopralluogo(x.codice);
  const elimina = '<button class="voce-m rossa" data-az="sopralluogo-elimina" data-id="' + h(x.id) + '">Elimina</button>';
  if (!vb) {
    return '<button class="voce-m" data-az="sopralluogo-chiudi" data-id="' + h(x.id) + '">Scrivi il verbale</button>' +
      '<button class="voce-m" data-az="vai" data-a="#/giorno/' + h(x.id) + '">Modifica</button>' + elimina;
  }
  return '<button class="voce-m" data-az="pdf-modifica" data-id="' + h(vb.id) + '">Modifica</button>' +
    '<button class="voce-m" data-az="verbale-esporta" data-id="' + h(vb.id) + '">Esporta</button>' +
    '<button class="voce-m" data-az="verbale-scarica" data-id="' + h(vb.id) + '">Scarica</button>' + elimina;
}

/* I tre puntini: le quattro cose che si fanno a un verbale senza aprirlo. */
function menuVerbale(idVerbale) {
  const v = verbale(idVerbale);
  if (!v) return;
  apriFoglio(
    '<h2>' + h(titoloVerbale(v, true)) + '</h2><p>' + h(dataBreve(v.giorno)) + (v.giornata ? ' · verbale di giornata' : ' · ore ' + h(v.ora)) + '</p>' +
    '<button class="btn btn-ok" data-az="pdf-modifica" data-id="' + h(v.id) + '">Modifica</button>' +
    '<button class="btn" data-az="verbale-esporta" data-id="' + h(v.id) + '">Esporta</button>' +
    '<button class="btn" data-az="verbale-scarica" data-id="' + h(v.id) + '">Scarica</button>' +
    '<button class="btn" data-az="chiudi-foglio">Chiudi</button>'
  );
}

/* Gli stessi tre puntini su un sopralluogo: portano al suo verbale, se c'è. */
/* I tre puntini del sopralluogo lavorano sul suo verbale: modificarlo,
   mandarlo fuori, salvarlo. Finché il verbale non c'è, l'unica cosa da fare
   è scriverlo, e il menu lo dice invece di mostrare tasti che non fanno niente. */
function menuSopralluogo(idSop) {
  const s = sopralluogo(idSop);
  if (!s) return;
  const vb = verbaleDiSopralluogo(s.codice);
  apriFoglio(
    '<h2>' + h(nomeSopralluogo(s)) + '</h2><p>' + h(dataBreve(s.giorno)) + ' · ore ' + h(s.ora) + '</p>' +
    (vb
      ? '<button class="btn btn-ok" data-az="pdf-modifica" data-id="' + h(vb.id) + '">Modifica</button>' +
        '<button class="btn" data-az="verbale-esporta" data-id="' + h(vb.id) + '">Esporta</button>' +
        '<button class="btn" data-az="verbale-scarica" data-id="' + h(vb.id) + '">Scarica</button>'
      : '<p style="color:var(--muted)">Il verbale non c\'è ancora.</p>' +
        '<button class="btn btn-ok" data-az="sopralluogo-chiudi" data-id="' + h(s.id) + '">Scrivi il verbale</button>') +
    '<button class="btn" data-az="chiudi-foglio">Chiudi</button>'
  );
}

/* Dare un nome al sopralluogo serve a nominarlo dettando: "questo va nel controllo
   del pomeriggio". Senza nome vale l'ora, e funziona lo stesso. Il posto normale
   per cambiarlo è il foglio della testata, insieme a data e ora; questa resta per
   chi ci arriva da un'altra strada. */
async function rinominaSopralluogo(idSop) {
  const s = sopralluogo(idSop);
  if (!s) return;
  const ok = await chiedi('Nome del sopralluogo', 'Serve a nominarlo quando detti: "questo va nel controllo del pomeriggio". Se lo lasci vuoto vale l\'ora.', 'Salva', '',
    '<input class="campo" id="sop-nome" maxlength="60" placeholder="controllo del pomeriggio" value="' + h(s.nome || '') + '">');
  const campo = document.getElementById('sop-nome');
  const nome = campo ? campo.value.trim() : '';
  chiudiFoglio();
  if (!ok) return;
  s.nome = nome;
  salva('sopralluogo', s);
  avvisa('Salvato', 'ok');
  aggiornaVista();
}

/* Le registrazioni che aspettano di sapere dove vanno. Finché sono qui il loro testo
   non è entrato in nessuna sezione: si tocca il sopralluogo giusto e ci va. */
function cardDaAssegnare(s) {
  const attesa = s.pezzi.filter(function (p) { return p.daAssegnare; });
  if (!attesa.length) return '';
  const aperti = sopralluoghiApertiOggi(s.cantiere);
  return '<div class="card gialla"><div class="card-capo gialla">' + attesa.length + (attesa.length === 1 ? ' registrazione da assegnare' : ' registrazioni da assegnare') + '</div>' +
    attesa.map(function (p) {
      let scelte = '<div class="griglia">';
      const visti = {};
      scelte += '<button class="btn btn-ok" data-az="assegna-pezzo" data-sop="' + h(s.id) + '" data-pezzo="' + h(p.id) + '" data-dest="' + h(s.id) + '">In questo (' + h(s.ora) + ')</button>';
      visti[s.id] = true;
      aperti.forEach(function (x) {
        if (visti[x.id]) return;
        visti[x.id] = true;
        scelte += '<button class="btn" data-az="assegna-pezzo" data-sop="' + h(s.id) + '" data-pezzo="' + h(p.id) + '" data-dest="' + h(x.id) + '">' + h(nomeSopralluogo(x)) + '</button>';
      });
      scelte += '<button class="btn" data-az="assegna-pezzo" data-sop="' + h(s.id) + '" data-pezzo="' + h(p.id) + '" data-dest="nuovo">Un sopralluogo nuovo</button></div>';
      return '<div class="card-capo spenta">' + h(p.titolo || ('Registrazione delle ' + p.ora)) + '<span class="dx">' + h(p.ora) + '</span></div>' +
        '<div class="card-corpo" style="color:var(--text-2)">' + h(p.grezzo || '') + '</div>' + scelte;
    }).join('') + '</div>';
}

/* Lo scanner del telefono: si fotografa una bolla di consegna o il modulo firme degli
   operai e resta allegato alla giornata. La fotocamera si apre già sul retro; dal rullino
   si prende una scansione fatta prima. Sono documenti, non foto: ci vanno nel PDF sempre. */
function ingressiDocumento(s) {
  // Il giorno lo scrive il tasto quando si preme: da un cantiere il giorno di oggi
  // potrebbe non esserci ancora, e crearlo solo per disegnare la pagina sarebbe sbagliato.
  const id = s ? h(s.id) : '';
  /* Un ingresso solo, senza "capture": il telefono apre il suo menu con dentro
     la fotocamera e il rullino. Prima c'erano due tasti e una riga di testo per
     dire la stessa cosa. */
  /* Con anche i PDF fra i tipi accettati l'iPhone mette nel menu "Scansiona documenti":
     ritaglia il foglio, lo raddrizza, mette più pagine in un file. È del telefono. */
  return '<input type="file" accept="image/*,application/pdf" multiple id="file-doc-scatta" hidden data-campo="file-documento" data-id="' + id + '" data-origine="rullino">';
}

/* Un tasto di rilievo o di scansione può stare in una giornata o in un cantiere.
   Dal cantiere vale il giorno di oggi: se non c'è ancora, nasce adesso. */
/* Il tasto indietro della schermata sa dove tornare meglio della cronologia:
   se non c'è, si torna all'elenco delle aziende. */
function indietro() {
  const b = document.querySelector('#vista .top .indietro');
  if (b && b.dataset.a) { vai(b.dataset.a); return; }
  if (location.hash && location.hash !== '#/') vai('#/');
}

function giornoDelTasto(el) {
  if (el.dataset.cantiere) { const c = cantiere(el.dataset.cantiere); return c ? sopralluogoPerDettare(c) : null; }
  return sopralluogo(el.dataset.id);
}
function apriScanner(el, idIngresso) {
  const s = giornoDelTasto(el);
  const f = document.getElementById(idIngresso);
  if (!s || !f) return;
  DOC_GENERE = el.dataset.genere;
  /* Un documento preso dalla schermata del cantiere nasce già come documento
     del cantiere: vale per tutto il lavoro, non solo per la giornata di oggi. */
  DOC_PER_CANTIERE = !!el.dataset.cantiere;
  f.dataset.id = s.id;
  f.click();
}

function righeSezione(s, k) { const t = String(s.sezioni[k] || '').trim(); return t ? righeElenco(t).length : 0; }

/* Tutte le foto della giornata (di tutti i sopralluoghi), in tendina, con "Marca tutte/Smarca tutte" (Fase 7.2). */
function cardFotoGiornataConTutte(s) {
  const lista = [];
  sopralluoghiDelGiorno(s.cantiere, s.giorno).forEach(function (x) { fotoNormali(x).forEach(function (f) { lista.push({ sop: x, f: f }); }); });
  if (!lista.length) return '';
  const nelPdf = lista.filter(function (x) { return x.f.nelPdf; }).length;
  const tutte = nelPdf === lista.length;
  return tendina('foto-giorno-' + s.cantiere + '-' + s.giorno, 'Foto della giornata',
    '<div class="card"><div class="card-capo">' + nelPdf + ' su ' + lista.length + ' nel PDF</div>' +
    filaFoto(null, lista, { segna: true }) +
    '<div class="card-piede dx"><button class="pill cod" data-az="foto-marca-tutte-giorno" data-cantiere="' + h(s.cantiere) + '" data-giorno="' + h(s.giorno) + '">' + (tutte ? 'Smarca tutte' : 'Marca tutte') + '</button></div></div>',
    lista.length);
}
// Tutte le bolle della giornata (di tutti i sopralluoghi), in tendina: stesso principio delle foto, niente bulk (Fase 7.2).
function bolleGiornataHtml(s) {
  const lista = [];
  sopralluoghiDelGiorno(s.cantiere, s.giorno).forEach(function (x) { documentiDi(x).forEach(function (f) { if (f.genere === 'bolla') lista.push({ sop: x, f: f }); }); });
  if (!lista.length) return '';
  return tendina('bolle-giorno-' + s.cantiere + '-' + s.giorno, 'Bolle della giornata', filaFoto(null, lista, { doc: true }), lista.length);
}

/* Le foto di un solo sopralluogo: tendina aperta di default (Fase 7.5), con "Marca tutte/Smarca tutte". */
function cardFotoGiorno(s) {
  const foto = fotoNormali(s);
  if (!foto.length) return '';
  const nelPdf = foto.filter(function (f) { return f.nelPdf; }).length;
  const tutte = nelPdf === foto.length;
  return tendinaApertaPerDefault('foto-' + s.id, 'Foto del sopralluogo',
    '<div class="card"><div class="card-capo">' + nelPdf + ' su ' + foto.length + ' nel PDF</div>' +
    filaFoto(s, foto, { segna: true }) +
    '<div class="card-piede dx"><button class="pill cod" data-az="foto-marca-tutte" data-id="' + h(s.id) + '">' + (tutte ? 'Smarca tutte' : 'Marca tutte') + '</button></div>' +
    '</div>', foto.length);
}
/* Una tendina come tendina(), ma aperta di default finché nessuno la tocca (Fase 7.5:
   "parte aperta. Tutte le altre partono chiuse."). Una volta toccata, vale la sua scelta. */
function tendinaApertaPerDefault(chiave, etichetta, contenuto, n) {
  const loc = leggiLocale();
  const aperta = Object.prototype.hasOwnProperty.call(loc.tendine, chiave) ? !!loc.tendine[chiave] : true;
  const att = n && typeof n === 'object'; if (att) n = n.n;
  return '<button class="tend" data-az="tendina" data-chiave="' + h(chiave) + '" aria-expanded="' + aperta + '">' +
    '<span class="frec">▶</span> <span class="et">' + h(etichetta) + '</span>' + (n != null ? '<span class="n' + (att ? ' att' : '') + '">' + h(n) + '</span>' : '') + '</button>' +
    '<div' + (aperta ? '' : ' hidden') + '>' + contenuto + '</div>';
}

/* La riga di un sopralluogo dentro il box del giorno (Fase 7.4): un tocco lo apre sotto,
   i puntini portano a Scrivi/Aggiorna il verbale, Modifica, Esporta, Elimina. */
function rigaSopralluogoBoxHtml(x, espansoId) {
  const vb = verbaleDiSopralluogo(x.codice);
  const suoNome = String(x.nome || '').trim();
  const aperto = PUNTI_APERTI === x.id;
  const stato = !vb ? 'da scrivere' : (verbaleAllineato(vb) ? 'verbale fatto' : 'da aggiornare');
  return '<div class="ordine' + (x.id === espansoId ? ' diff' : '') + '">' +
    '<button class="desc" data-az="sopralluogo-espandi" data-id="' + h(x.id) + '">' + h(suoNome || x.ora) +
    '<small>' + (suoNome ? h(x.ora) + ' · ' : '') + h(stato) + '</small></button>' +
    '<button class="stato pill cod puntini' + (aperto ? ' on' : '') + '" data-az="menu-sopralluogo" data-id="' + h(x.id) + '" aria-label="Altro">⋯</button>' +
    '</div>' + (aperto ? '<div class="esp-voci">' + vociMenuSopralluogo(x) + '</div>' : '');
}
// Il box: righe in verticale, 4-5 per volta (scorrevole si occupa dell'altezza), niente se non c'è niente.
function boxSopralluoghi(s, espansoId) {
  const fratelli = sopralluoghiDelGiorno(s.cantiere, s.giorno);
  if (!fratelli.length) return '';
  let html = '<div class="card">' + scorrevole(fratelli.map(function (x) { return rigaSopralluogoBoxHtml(x, espansoId); }).join(''));
  if (s.giorno === oggiISO()) html += '<div class="card-piede"><button class="link" data-az="sopralluogo-nuovo" data-id="' + h(s.id) + '">＋ un altro sopralluogo</button></div>';
  return html + '</div>';
}

/* Il contenuto del sopralluogo aperto (Fase 7.5-7.6), in ordine:
   1. rilevamento d'ordine (se c'è) — 2. materiali necessari, sua tendina in cima —
   3. foto del sopralluogo, aperta — 4. le scritte (dettatura originale) — 5. i punti. */
function contenutoSopralluogoEspanso(x) {
  let html = '';
  if (String(x.sezioni.da_smistare || '').trim()) {
    html += '<div class="card gialla"><div class="card-capo gialla">Da smistare</div>' +
      '<textarea class="corpo" data-campo="sezione" data-id="' + h(x.id) + '" data-sezione="da_smistare">' + h(x.sezioni.da_smistare) + '</textarea>' +
      '<div class="card-piede">Manda questo testo in una sezione:</div><div class="griglia">' +
      SEZIONI.map(function (z) { return '<button class="btn" data-az="smista" data-id="' + h(x.id) + '" data-sezione="' + z.chiave + '">' + h(z.nome) + '</button>'; }).join('') +
      '</div></div>';
  }
  const rilOrd = String(x.sezioni.rilievi_ordine || '').trim();
  if (rilOrd) html += tendina('rilord-sop-' + x.id, "Rilevamento d'ordine", '<div class="card"><div class="card-corpo">' + testoElenco(rilOrd, true) + '</div></div>', righeElenco(rilOrd).length);
  // Materiali necessari: non è fra i punti sotto, sta nella sua tendina in cima (D8, Fase 7.6).
  const matNec = String(x.sezioni.materiali_necessari || '').trim();
  html += tendina('matnec-' + x.id, 'Materiali necessari',
    '<div class="card"><textarea class="corpo" data-campo="sezione" data-id="' + h(x.id) + '" data-sezione="materiali_necessari" placeholder="—">' + h(matNec) + '</textarea></div>',
    matNec ? righeElenco(matNec).length : null);
  html += cardFotoGiorno(x);
  html += tendinaGrezzo(x);
  const pezziVivi = x.pezzi.filter(function (p) { return p.audio || (p.stato && p.stato !== 'riordinato'); });
  if (pezziVivi.length) html += '<div class="card"><div class="card-capo">Audio<span class="dx">' + pezziVivi.length + ' · tocca per sentire</span></div>' + listaAudio(x, pezziVivi.slice().reverse()) + '</div>';
  const fotoPer = fotoPerSezione(x);
  const vuote = [];
  SEZIONI.forEach(function (z) {
    if (z.chiave === 'rilievi_ordine' || z.chiave === 'materiali_necessari') return;
    const testo = x.sezioni[z.chiave] || '';
    const pezziQui = pezziVivi.filter(function (p) { return (p.sezioni || []).indexOf(z.chiave) !== -1 || p.sezione === z.chiave; });
    const fotoQui = fotoPer[z.chiave] || [];
    const card = '<div class="card" id="sez-' + z.chiave + '"><div class="card-capo' + (testo.trim() ? '' : ' spenta') + '">' + h(z.nome) + '</div>' +
      '<textarea class="corpo" data-campo="sezione" data-id="' + h(x.id) + '" data-sezione="' + z.chiave + '" placeholder="' + (z.elenco ? 'una voce per riga' : '—') + '">' + h(testo) + '</textarea>' +
      listaAudio(x, pezziQui, { dentroSezione: true, chiave: x.id + '-' + z.chiave }) + filaFoto(x, fotoQui, { segna: true }) + '</div>';
    if (testo.trim() || fotoQui.length) html += card; else vuote.push(card);
  });
  if (vuote.length) html += tendina('vuote-' + x.id, vuote.length + (vuote.length === 1 ? ' sezione ancora vuota' : ' sezioni ancora vuote'), vuote.join(''));
  return html;
}

/* I due ingressi nascosti — la fotocamera (capture) e il rullino (senza) — più il
   link del rullino. Stanno nel giorno e anche nella schermata di una foto: dopo
   averne caricata una se ne carica un'altra da lì, senza tornare indietro. */
function ingressiFoto(s) {
  return '<input type="file" accept="image/*" capture="environment" id="file-foto-scatta" hidden data-campo="file-foto" data-id="' + h(s.id) + '" data-origine="scatto">' +
    '<input type="file" accept="image/*" multiple id="file-foto-rullino" hidden data-campo="file-foto" data-id="' + h(s.id) + '" data-origine="rullino">' +
    '<button class="link blocco" data-az="foto-rullino">＋ Foto dal rullino</button>';
}

// Il testo grezzo resta sempre sotto: è la prova di cosa è stato detto, anche dopo il riordino.
function tendinaGrezzo(s) {
  const grezzi = s.pezzi.filter(function (p) { return p.grezzo; });
  if (!grezzi.length) return '';
  return tendina('grezzo-' + s.id, 'Dettatura originale',
    '<div class="card">' + grezzi.map(function (p) {
      return '<div class="card-capo spenta">' + h(p.titolo || 'Registrazione delle ' + p.ora) + '<span class="dx">' + h(p.ora) + '</span></div><div class="card-corpo" style="color:var(--text-2)">' + h(p.grezzo) + '</div>';
    }).join('') + '</div>');
}

/* Chiudere la giornata vuol dire scrivere il verbale, e basta: la giornata non si blocca.
   Si continua a cambiarla, e ogni correzione passa da sola nel verbale. Il verbale è
   sempre lo stesso documento, con lo stesso codice: si riscrive, non se ne fa un altro. */
async function chiudiGiornata(sopId) {
  const s = sopralluogo(sopId);
  if (!s) return;
  if (REG.attiva) { avvisa('Ferma prima la registrazione', 'att'); return; }
  const inCoda = leggiLocale().coda.some(function (l) { return l.sop === s.id && l.stato !== 'fallito'; });
  const giaFatto = verbaleDiSopralluogo(s.codice);
  let testo = giaFatto
    ? 'Il verbale si rifà con quello che hai cambiato. Le correzioni fatte a mano sul verbale si perdono. La giornata resta modificabile.'
    : 'Si scrive il verbale della giornata. La giornata resta modificabile: se cambi qualcosa, il verbale si aggiorna da solo.';
  if (inCoda) testo = 'Una registrazione è ancora in coda: il suo testo non entrerà nel verbale. ' + testo;
  if (String(s.sezioni.da_smistare || '').trim()) testo = 'C\'è del testo da smistare: finirà nelle Note. ' + testo;
  testo += ' Gli audio già trascritti sono già stati cancellati dal telefono: resta il testo.';
  // D6: se l'azienda ha tecnici in Schema, si chiede chi chiude — la sua firma va sul verbale.
  const az = aziendaDiCantiere(cantierePerCodice(s.cantiere));
  const tecnici = (az && az.tecnici) || [];
  const extraTecnico = tecnici.length
    ? '<label class="eticampo">Chi chiude questo sopralluogo</label><select class="campo" id="v-tecnico">' +
      '<option value="">— nessuno —</option>' +
      tecnici.map(function (t) { return '<option value="' + h(t.id) + '"' + (giaFatto && giaFatto.tecnicoId === t.id ? ' selected' : '') + '>' + h(t.nome) + '</option>'; }).join('') +
      '</select>' : '';
  const ok = await chiedi(giaFatto ? 'Aggiornare il verbale?' : 'Scrivere il verbale?', testo, giaFatto ? 'Aggiorna il verbale' : 'Scrivi il verbale', '',
    '<label class="eticampo">Nome del verbale</label><input class="campo" id="v-nome" maxlength="80" placeholder="facoltativo" value="' + h(giaFatto ? (giaFatto.nome || '') : '') + '">' + extraTecnico);
  // I campi si leggono prima di chiudere il foglio: dopo non ci sono più.
  const campoNome = document.getElementById('v-nome');
  const nomeScelto = campoNome ? campoNome.value.trim() : '';
  const campoTecnico = document.getElementById('v-tecnico');
  const tecnicoScelto = campoTecnico ? campoTecnico.value : (giaFatto ? giaFatto.tecnicoId : '');
  chiudiFoglio();
  if (!ok) return;
  const sezioni = {};
  CHIAVI_SEZIONI.forEach(function (k) { sezioni[k] = s.sezioni[k] || ''; });
  if (String(s.sezioni.da_smistare || '').trim()) sezioni.note = aggiungiTesto(sezioni.note, s.sezioni.da_smistare);
  let v = giaFatto;
  const impronta = improntaSopralluogo(s);
  if (v) { v.sezioni = sezioni; v.giorno = s.giorno; v.ora = s.ora; v.nome = nomeScelto; v.tecnicoId = tecnicoScelto || null; v.impronta = impronta; v = salva('verbale', v); }
  else v = salva('verbale', { sopralluogo: s.codice, cantiere: s.cantiere, giorno: s.giorno, ora: s.ora, nome: nomeScelto, tecnicoId: tecnicoScelto || null, sezioni: sezioni, impronta: impronta });
  // "chiuso" adesso vuol dire "verbale scritto, l'ultima volta a quest'ora".
  s.chiuso = adessoISO();
  s.verbale = v.codice;
  salva('sopralluogo', s);
  // Il verbale è la trascrizione approvata: la voce, da qui in poi, non serve più.
  await cancellaAudioTrascritti(s);
  avvisa(giaFatto ? 'Verbale aggiornato' : 'Verbale scritto', 'ok');
  aggiornaVista();
  // Se il suo PDF esiste già, si rifà adesso con il testo e le foto di adesso: Visualizza ed Esporta non devono mostrare quello vecchio.
  if (pdfConChiave('verbale:' + v.codice)) { await pdfVerbale(v); aggiornaVista(); }
}

/* ---------------- VERBALE: modifica ---------------- */
function vistaVerbaleModifica(id) {
  const v = verbale(id);
  if (!v) return vistaDashboard();
  const s = valori(leggiTutto().sopralluoghi).find(function (x) { return x.codice === v.sopralluogo; });
  const c = cantierePerCodice(v.cantiere) || { nome: '?', id: '' };
  const indietro = v.giornata ? ('#/cantiere/' + (cantiere(c.id) ? c.id : '')) : (s ? '#/giorno/' + s.id : '#/');
  let html = testata({ indietro: indietro || '#/', titolo: 'Modifica ' + (v.nome ? v.nome : (v.giornata ? 'giornata' : 'verbale')), sotto: h(c.nome) + ' · ' + h(dataBreve(v.giorno)) + (v.giornata ? '' : ' · ' + h(v.ora)),
    destra: '<span class="pill ok">' + (v.giornata ? 'giornata' : 'verbale') + '</span>' });
  html += '<div class="avviso" style="background:var(--surface);border-color:var(--line);color:var(--muted)">' +
    (v.giornata
      ? 'È il verbale di tutta la giornata: mette insieme i ' + ((v.sopralluoghi || []).length || 'vari') + ' sopralluoghi di quel giorno. Se lo rifai da capo, le correzioni fatte qui si perdono.'
      : 'Correggere il verbale non tocca il sopralluogo: la dettatura originale resta com\'era.') + '</div>';
  html += '<div class="card"><div class="card-capo">Nome del verbale</div>' +
    '<input class="campo" data-campo="nome-verbale" data-id="' + h(v.id) + '" maxlength="80" placeholder="facoltativo" value="' + h(v.nome || '') + '"></div>';
  SEZIONI.forEach(function (z) {
    const testo = v.sezioni[z.chiave] || '';
    html += '<div class="card"><div class="card-capo' + (testo.trim() ? '' : ' spenta') + '">' + h(z.nome) + '</div>' +
      '<textarea class="corpo" data-campo="sezione-verbale" data-id="' + h(v.id) + '" data-sezione="' + z.chiave + '" placeholder="' + (z.elenco ? 'una voce per riga' : '—') + '">' + h(testo) + '</textarea></div>';
  });
  html += '<div class="barra"><button class="az verde" data-az="salva-verbale" data-id="' + h(v.id) + '">Salva</button></div>';
  return html;
}

/* ---------------- LA FOTO GRANDE ---------------- */
/* È una schermata e non un foglio: così la striscia di registrazione resta
   sopra a tutto e il gesto "indietro" riporta al giorno. Sotto la foto i suoi
   dati, poi il referto (che si corregge a mano come tutto il resto), la sezione
   e il tasto per il PDF. */
function vistaFoto(sopId, fotoId) {
  const s = sopralluogo(sopId);
  const f = s && trovaFoto(s, fotoId);
  if (!f) return s ? vistaGiorno(s.id) : vistaDashboard();
  const c = cantierePerCodice(s.cantiere) || { nome: '?', id: '' };
  const st = descriviStatoFoto(statoLavoroFoto(f));
  const registrandoQui = REG.attiva && REG.destinazione && REG.destinazione.tipo === 'foto' && REG.destinazione.foto === f.id;
  const sezione = sezioneFoto(f);
  const doc = !!GENERI[f.genere];
  let html = testata({ indietro: '#/giorno/' + s.id, titolo: nomeFoto(f), sotto: h(c.nome) + ' · ' + h(dataBreve(f.giorno)),
    destra: registrandoQui ? '<span class="pill reg">● rec</span>' : (f.nelPdf ? '<span class="pill ok">nel PDF</span>' : '<span class="pill grigia">non nel PDF</span>') });
  html += '<div class="foto-grande' + (f.file ? '' : ' manca') + '">' +
    (f.file
      ? (f.formato === 'pdf'
        ? '<div class="foto-vuota scan"><span class="ico ico-documento"></span>' + h(paginePdf(f)) + '<small>scansione del telefono: entra nel verbale com\'è</small></div>'
        : '<img data-foto="' + h(f.file) + '" alt="">')
      : '<div class="foto-vuota">Foto archiviata' + (f.archiviato ? ' il ' + h(dataSenzaAnno(f.archiviato)) : '') + ': è nei File del telefono.</div>') +
    '<div class="foto-dati">' + h(dataEstesa(f.giorno)) + ' alle ' + h(f.ora) + '<br>' + h(titoloSopralluogo(s)) + '</div></div>';
  html += '<div class="card"><div class="card-capo' + (String(f.referto || '').trim() ? '' : ' spenta') + '">Referto' + (st.testo ? '<span class="dx ' + st.classe + '">' + h(st.testo) + '</span>' : '') + '</div>' +
    '<textarea class="corpo" data-campo="referto-foto" data-id="' + h(f.id) + '" data-sop="' + h(s.id) + '" placeholder="' + (doc ? 'Detta o scrivi cosa c\'è su questo documento' : 'Detta o scrivi cosa si vede') + '">' + h(f.referto || '') + '</textarea>' +
    (f.grezzo ? '<div class="card-piede">« ' + h(f.grezzo) + ' »</div>' : '') + '</div>';
  // Un documento è un allegato del verbale, non appartiene a una sezione: la scelta non si mostra.
  if (!doc) html += '<div class="card"><div class="card-capo">Sezione del verbale<span class="dx">' + h(nomeSezione(sezione)) + '</span></div><div class="griglia">' +
    SEZIONI.map(function (z) { return '<button class="btn' + (z.chiave === sezione ? ' btn-ok' : '') + '" data-az="foto-sezione" data-sop="' + h(s.id) + '" data-id="' + h(f.id) + '" data-sezione="' + z.chiave + '">' + h(z.nome) + '</button>'; }).join('') +
    '</div></div>';
  html += '<div class="modulo">' +
    (f.genere ? '<button class="btn' + (f.cantiere ? ' btn-ok' : '') + '" style="margin-bottom:8px" data-az="foto-cantiere" data-sop="' + h(s.id) + '" data-id="' + h(f.id) + '">' + (f.cantiere ? '✓ Vale per tutto il cantiere' : 'Vale per tutto il cantiere') + '</button>' : '') +
    '<button class="btn' + (f.nelPdf ? ' btn-ok' : '') + '" data-az="foto-marca" data-sop="' + h(s.id) + '" data-id="' + h(f.id) + '">' + (f.nelPdf ? '✓ Nel PDF' : 'Metti nel PDF') + '</button>' +
    '<button class="btn btn-rosso medio" data-az="foto-elimina" data-sop="' + h(s.id) + '" data-id="' + h(f.id) + '" style="margin-top:12px">' + (doc ? 'Elimina il documento' : 'Elimina la foto') + '</button></div>';
  // I tasti della foto restano anche qui: caricata una, la successiva parte da questa schermata.
  html += ingressiFoto(s);
  if (!REG.attiva) html += '<div class="barra"><button class="az verde" data-az="foto-detta" data-sop="' + h(s.id) + '" data-id="' + h(f.id) + '"><span class="ico ico-microfono"></span> ' + (String(f.referto || '').trim() ? 'Aggiungi al referto' : 'Detta il referto') + '</button>' +
    '<button class="az stretta" data-az="foto-scatta"><span class="ico ico-fotocamera"></span> Foto</button></div>';
  return html;
}

// Le azioni di questo file.
Object.assign(AZIONI, {
  'doc-scansiona': function (el) { apriScanner(el, 'file-doc-scatta'); },
  /* Marca tutti i documenti di questo sopralluogo come validi per tutto il cantiere.
     I rilievi non si accodano più da nessuna parte: la tendina Rilevamento d'ordine
     del cantiere li legge già, dal vivo, da ogni sopralluogo (D8). */
  'al-cantiere': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const doc = documentiDi(s);
    const tutti = doc.length && doc.every(function (f) { return f.cantiere; });
    let fatto = 0;
    doc.forEach(function (f) { if (!f.cantiere) { f.cantiere = true; fatto++; } });
    if (fatto) salva('sopralluogo', s);
    avvisa(fatto ? 'Nel cantiere' : (tutti ? 'Già tutto nel cantiere' : 'Non c\'è niente da portare'), fatto ? 'ok' : 'att');
    aggiornaVista();
  },
  /* Lo stesso su una scansione sola, dalla sua schermata. */
  'foto-cantiere': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s ? trovaFoto(s, el.dataset.id) : null;
    if (!f) return;
    f.cantiere = !f.cantiere;
    salva('sopralluogo', s);
    avvisa(f.cantiere ? 'Vale per tutto il cantiere' : 'Solo di questa giornata', 'ok');
    aggiornaVista();
  },
  'chiudi-giornata': function (el) { chiudiGiornata(el.dataset.id); },
  /* Un altro passaggio nello stesso giorno: nasce con l'ora di adesso e si apre subito. */
  'sopralluogo-nuovo': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    if (s.giorno !== oggiISO()) { avvisa('Sui giorni passati non si aprono sopralluoghi', 'att'); return; }
    const c = cantierePerCodice(s.cantiere);
    if (!c) return;
    const n = creaSopralluogo(c, s.giorno, oraAdesso());
    vai('#/giorno/' + n.id);
  },
  'menu-sopralluogo': function (el) { apriPunti(el.dataset.id); },
  // Un tocco su una riga del box apre quel sopralluogo qui sotto: non si cambia pagina (Fase 7.5).
  'sopralluogo-espandi': function (el) { sopralluogoEspanso = el.dataset.id; PUNTI_APERTI = null; aggiornaVista(); },
  'foto-marca-tutte-giorno': function (el) {
    const lista = [];
    sopralluoghiDelGiorno(el.dataset.cantiere, el.dataset.giorno).forEach(function (x) { fotoNormali(x).forEach(function (f) { lista.push({ sop: x, f: f }); }); });
    if (!lista.length) return;
    const tutte = lista.every(function (x) { return x.f.nelPdf; });
    const tocchi = {};
    lista.forEach(function (x) { x.f.nelPdf = !tutte; tocchi[x.sop.id] = x.sop; });
    Object.keys(tocchi).forEach(function (id) { salva('sopralluogo', tocchi[id]); });
    avvisa(tutte ? 'Nessuna nel PDF' : 'Tutte nel PDF', tutte ? undefined : 'ok');
    aggiornaVista();
  },
  'menu-verbale': function (el) { apriPunti(el.dataset.id); },
  'sopralluogo-apri': function (el) { chiudiFoglio(); vai('#/giorno/' + el.dataset.id); },
  'sopralluogo-nome': function (el) { rinominaSopralluogo(el.dataset.id); },
  'sopralluogo-chiudi': function (el) { PUNTI_APERTI = null; chiudiFoglio(); chiudiGiornata(el.dataset.id); },
  'giornata-verbale': function (el) { faiVerbaleGiornata(el.dataset.cantiere, el.dataset.giorno); },
  /* "Verbale di sopralluogo" sul passaggio aperto: il suo PDF. Se il verbale non è ancora
     scritto si chiede di scriverlo; se il PDF non c'è si fa adesso; poi si apre. */
  'sopralluogo-verbale': async function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    let vb = verbaleDiSopralluogo(s.codice);
    if (!vb) { await chiudiGiornata(s.id); vb = verbaleDiSopralluogo(s.codice); }
    if (!vb) return;
    let p = pdfConChiave('verbale:' + vb.codice);
    if (!p) { avvisa('Preparo il PDF…'); p = await pdfVerbale(vb); }
    if (!p) { avvisa('PDF non riuscito', 'err'); return; }
    vai('#/leggi/' + p.id);
  },
  /* Visualizza: se il PDF c'è già si legge quello, se no si apre il verbale. */
  'verbale-vedi': function (el) {
    const v = verbale(el.dataset.id);
    if (foglioAperto()) chiudiFoglio();
    if (!v && el.dataset.sop) { const sx = sopralluogo(el.dataset.sop); const vx = sx ? verbaleDiSopralluogo(sx.codice) : null; if (vx) { vai('#/verbale/' + vx.id); return; } }
    if (!v) return;
    // Visualizza mostra il PDF: se non c'è ancora si fa adesso, e si apre. Senza pdf-lib resta il testo.
    const p = pdfConChiave('verbale:' + v.codice);
    if (p) { vai('#/leggi/' + p.id); return; }
    avvisa('Preparo il PDF…');
    return pdfVerbale(v).then(function (nuovo) { vai(nuovo ? '#/leggi/' + nuovo.id : '#/verbale/' + v.id); });
  },
  /* Si butta il verbale, non la giornata: il sopralluogo resta con i suoi audio e
     le sue sezioni, e torna "da chiudere". Un verbale di giornata si butta e basta. */
  'verbale-elimina': async function (el) {
    const v = verbale(el.dataset.id);
    PUNTI_APERTI = null;
    if (!v) return;
    chiudiFoglio();
    const ok = await chiedi('Eliminare il verbale?', titoloVerbale(v, true) + (v.giornata ? '' : ': la giornata resta com\'è, con audio e sezioni.'), 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    const s = valori(leggiTutto().sopralluoghi).find(function (x) { return x.codice === v.sopralluogo; });
    cancella('verbale', v.id);
    if (s && !v.giornata) { s.verbale = null; s.chiuso = null; salva('sopralluogo', s); }
    avvisa('Verbale eliminato', 'ok');
    if (ROTTA.nome === 'verbale') vai(s ? '#/giorno/' + s.id : '#/'); else aggiornaVista();
  },
  'salva-verbale': function (el) {
    const v = verbale(el.dataset.id);
    if (!v) return;
    salva('verbale', v);
    avvisa('Salvato', 'ok');
    const s = valori(leggiTutto().sopralluoghi).find(function (x) { return x.codice === v.sopralluogo; });
    vai(s ? '#/giorno/' + s.id : '#/');
    // Corretto a mano il verbale, il suo PDF (se c'è) si rifà: mai due versioni in giro.
    if (pdfConChiave('verbale:' + v.codice)) return pdfVerbale(v).then(function () { aggiornaVista(); });
  },
  'smista': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const testo = String(s.sezioni.da_smistare || '').trim();
    if (!testo) return;
    s.sezioni[el.dataset.sezione] = aggiungiTesto(s.sezioni[el.dataset.sezione], testo);
    s.sezioni.da_smistare = '';
    // I pezzi che stavano "da smistare" adesso hanno una sezione: così l'audio si trova sotto il testo.
    s.pezzi.forEach(function (p) { if (p.sezione === 'da_smistare' || (!p.sezione && p.stato === 'riordinato')) { p.sezione = el.dataset.sezione; p.sezioni = [el.dataset.sezione]; } });
    salva('sopralluogo', s);
    allineaVerbale(s, [el.dataset.sezione]);
    avvisa('Spostato in ' + nomeSezione(el.dataset.sezione), 'ok');
    aggiornaVista();
  },
  'modifica-testata': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const cantieri = valori(leggiTutto().cantieri).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    apriFoglio(
      '<h2>' + h(titoloSopralluogo(s)) + '</h2>' +
      '<label class="eticampo">Cantiere</label><select class="campo" id="t-cantiere">' + cantieri.map(function (c) { return '<option value="' + h(c.codice) + '"' + (c.codice === s.cantiere ? ' selected' : '') + '>' + h(c.nome) + '</option>'; }).join('') + '</select>' +
      '<div style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Data</label><input class="campo" type="date" id="t-data" value="' + h(s.giorno) + '"></div>' +
      '<div style="flex:1"><label class="eticampo">Ora</label><input class="campo" type="time" id="t-ora" value="' + h(s.ora) + '"></div></div>' +
      /* Il nome serve a chiamarlo dettando: "questo va nel controllo del pomeriggio". */
      '<label class="eticampo">Nome del sopralluogo</label><input class="campo" id="t-nome" maxlength="60" placeholder="facoltativo, se no vale l\'ora" value="' + h(s.nome || '') + '">' +
      '<div class="righe"><button class="btn btn-ok" data-az="testata-salva" data-id="' + h(s.id) + '">Salva</button>' +
      '<button class="btn btn-rosso" data-az="sopralluogo-elimina" data-id="' + h(s.id) + '">Elimina</button></div>' +
      '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>'
    );
  },
  'testata-salva': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const codiceCant = document.getElementById('t-cantiere').value;
    const giorno = document.getElementById('t-data').value || s.giorno;
    const ora = document.getElementById('t-ora').value || s.ora;
    const campoNome = document.getElementById('t-nome');
    s.cantiere = codiceCant; s.giorno = giorno; s.ora = ora;
    if (campoNome) s.nome = campoNome.value.trim();
    salva('sopralluogo', s);
    const v = verbaleDiSopralluogo(s.codice);
    if (v) { v.cantiere = codiceCant; v.giorno = giorno; v.ora = ora; salva('verbale', v); }
    chiudiFoglio(); avvisa('Salvato', 'ok'); aggiornaVista();
  },
  'sopralluogo-elimina': async function (el) {
    const s = sopralluogo(el.dataset.id);
    PUNTI_APERTI = null;
    if (!s) return;
    chiudiFoglio();
    const ok = await chiedi('Eliminare il sopralluogo?', titoloSopralluogo(s) + ': si cancellano il sopralluogo, i suoi audio' + (s.verbale ? ' e il suo verbale' : '') + '.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    await eliminaSopralluogo(s);
    avvisa('Eliminato', 'ok');
    // Si resta nella giornata: su un altro passaggio se c'è, se no sulla giornata vuota.
    const resto = sopralluoghiDelGiorno(s.cantiere, s.giorno);
    vai(resto.length ? '#/giorno/' + resto[0].id : '#/giornata/' + giornataDi(s.cantiere, s.giorno).id);
  },
  'giornata-elimina': async function (el) {
    PUNTI_APERTI = null;
    const c = cantiere(el.dataset.cantiere);
    if (!c) return;
    const n = sopralluoghiDelGiorno(c.codice, el.dataset.giorno).length;
    const ok = await chiediDueVolte('Eliminare la giornata?', dataBreve(el.dataset.giorno) + ': si cancellano ' + n + (n === 1 ? ' sopralluogo' : ' sopralluoghi') + ', i loro audio, le foto e i verbali.', 'Elimina');
    if (!ok) return;
    await eliminaGiornata(c.codice, el.dataset.giorno);
    avvisa('Eliminata', 'ok');
    if (ROTTA.nome === 'cantiere') aggiornaVista(); else vai('#/cantiere/' + c.id);
  },
  // Nella giornata vuota: nasce il primo sopralluogo e ci si entra.
  'giornata-sopralluogo-nuovo': function (el) {
    const c = cantierePerCodice(el.dataset.cantiere);
    if (!c) return;
    vai('#/giorno/' + creaSopralluogo(c, el.dataset.giorno, oraAdesso()).id);
  },
  // --- foto ---
  // Il sopralluogo lo dice il tasto; dove non lo dice (schermata della foto) lo sa l'ingresso file.
  'foto-scatta': function (el) { const f = document.getElementById('file-foto-scatta'); apriFotocamera(el.dataset.id || (f ? f.dataset.id : '')); },
  'fotocamera-scatta': function () { return scattaFotocamera(); },
  'fotocamera-chiudi': function () { chiudiFotocamera(); },
  'foto-rullino': function () { const f = document.getElementById('file-foto-rullino'); if (f) f.click(); },
  'foto-sezione': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    f.sezione = el.dataset.sezione;
    // Scelta a mano: da qui in poi Claude non la sposta più.
    f.sezioneScelta = true;
    salva('sopralluogo', s);
    avvisa(nomeSezione(f.sezione), 'ok');
    aggiornaVista();
  },
  'foto-marca': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    f.nelPdf = !f.nelPdf;
    salva('sopralluogo', s);
    avvisa(f.nelPdf ? 'Nel PDF' : 'Fuori dal PDF', f.nelPdf ? 'ok' : undefined);
    aggiornaVista();
  },
  'foto-marca-tutte': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    const foto = fotoDi(s);
    if (!foto.length) return;
    // Se sono già tutte dentro, il tasto le tira fuori tutte: un tasto solo, due versi.
    const tutte = foto.every(function (f) { return f.nelPdf; });
    foto.forEach(function (f) { f.nelPdf = !tutte; });
    salva('sopralluogo', s);
    avvisa(tutte ? 'Nessuna nel PDF' : 'Tutte nel PDF', tutte ? undefined : 'ok');
    aggiornaVista();
  },
  'foto-detta': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    avviaRegistrazione({ tipo: 'foto', sop: s.id, foto: f.id });
  },
  'foto-elimina': async function (el) {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    if (REG.attiva && REG.destinazione && REG.destinazione.foto === f.id) { avvisa('Ferma prima la registrazione', 'att'); return; }
    const ok = await chiedi('Eliminare ' + nomeFoto(f).toLowerCase() + '?', 'La foto e il suo referto si cancellano dal telefono.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    await eliminaFoto(s, f);
    avvisa('Eliminata', 'ok');
    // Dalla schermata della foto si torna al giorno; dalla miniatura si resta dov'è, si ridisegna e basta.
    if (ROTTA.nome === 'foto') vai('#/giorno/' + s.id); else aggiornaVista();
  },
});

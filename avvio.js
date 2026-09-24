/* CANTIERI — avvio.js: avvio(), gli eventi globali, il service worker, la prima schermata. Sempre per ultimo. */
'use strict';


/* ---- notifiche ---- */
async function chiediNotificheUnaVolta() {
  const loc = leggiLocale();
  if (loc.notificheChieste || !('Notification' in window)) return;
  loc.notificheChieste = true;
  salvaLocale();
  try { await Notification.requestPermission(); } catch (e) { /* se dice no, non si insiste */ }
}
async function mostraNotifica(titolo, corpo, url) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
    if (reg && reg.showNotification) await reg.showNotification(titolo, { body: corpo, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: url || './' }, tag: titolo });
    else new Notification(titolo, { body: corpo, icon: 'icon-192.png' });
  } catch (e) { /* niente errori a schermo per una notifica */ }
}

/* Alle 18, se per un cantiere attivo manca il sopralluogo di oggi, il telefono avvisa.
   Funziona solo con l'app aperta o in secondo piano da poco: senza un server non c'è altro modo. */
function controllaPromemoria() {
  const adesso = new Date();
  if (adesso.getHours() < 18) return;
  const loc = leggiLocale();
  const oggi = oggiISO();
  if (loc.promemoriaGiorno === oggi) return;
  loc.promemoriaGiorno = oggi;
  salvaLocale();
  valori(leggiTutto().cantieri).filter(function (c) { return c.stato === 'attivo'; }).forEach(function (c) {
    if (!sopralluogoDiOggi(c.codice)) mostraNotifica('Manca il sopralluogo di oggi', c.nome, '#/cantiere/' + c.id);
  });
}

/* Il giorno cambia allo scattare della mezzanotte. Non si apre niente da solo: un
   sopralluogo nasce quando si detta, e basta. Quelli di ieri rimasti aperti restano
   lì da chiudere, e non si mettono in mezzo al lavoro di oggi. */
let GIORNO_APP = oggiISO();
function controllaCambioGiorno() {
  const oggi = oggiISO();
  if (oggi === GIORNO_APP) return;
  GIORNO_APP = oggi;
  aggiornaVista();
  creaVerbaliSettimanaScorsa();
  pulisciSettimane().then(contaSettimana).then(function () { if (SETT_CONTO.inizio) aggiornaVista(); });
}

let tocchiTitolo = 0, timerTocchi = null;

// I campi: si aggiorna il modello subito, si scrive nel telefono dopo mezzo secondo di fermo.
function suCampo(el, evento) {
  const campo = el.dataset.campo;
  if (campo === 'filtro-cantieri') { filtroCantieri = el.value; aggiornaVista(); return; }
  if (campo === 'filtro-listino') { filtroListino = el.value; aggiornaVista(); return; }
  if (campo === 'filtro-documenti') { filtroDocumenti = el.value; aggiornaVista(); return; }
  if (campo === 'filtro-verbali-cant') { filtroVerbaliCant = el.value; aggiornaVista(); return; }
  if (campo === 'filtro-rilievi-cant') { filtroRilieviCant = el.value; aggiornaVista(); return; }
  if (campo === 'filtro-bolle-cant') { filtroBolleCant = el.value; aggiornaVista(); return; }
  if (campo === 'filtro-doc-cant') { filtroDocCant = el.value; aggiornaVista(); return; }
  if (campo === 'sezione') {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    s.sezioni[el.dataset.sezione] = el.value;
    cresciTextarea(el);
    const capo = el.previousElementSibling;
    if (capo && capo.classList.contains('card-capo') && !capo.classList.contains('gialla')) capo.classList.toggle('spenta', !el.value.trim());
    salvaConCalma('sop-' + s.id, function () { salva('sopralluogo', s); allineaVerbale(s, [el.dataset.sezione]); chiediNotificheUnaVolta(); });
    return;
  }
  if (campo === 'nome-verbale') {
    const v = verbale(el.dataset.id);
    if (!v) return;
    v.nome = el.value.trim();
    salvaConCalma('ver-' + v.id, function () { salva('verbale', v); });
    return;
  }
  if (campo === 'sezione-verbale') {
    const v = verbale(el.dataset.id);
    if (!v) return;
    v.sezioni[el.dataset.sezione] = el.value;
    cresciTextarea(el);
    const capo = el.previousElementSibling;
    if (capo) capo.classList.toggle('spenta', !el.value.trim());
    salvaConCalma('ver-' + v.id, function () { salva('verbale', v); });
    return;
  }
  if (campo === 'inbreve-relazione') {
    const rel = relazione(el.dataset.id);
    if (!rel) return;
    rel.inBreve = el.value;
    cresciTextarea(el);
    const capo = el.previousElementSibling;
    if (capo) capo.classList.toggle('spenta', !el.value.trim());
    salvaConCalma('rel-' + el.dataset.id, function () { salva('relazione', rel); });
    return;
  }
  if (campo === 'blocco-relazione') {
    // L'id del campo dice relazione, sezione e pezzo: "id/sezione/indice". Così ogni campo ha un id suo,
    // e dopo un ridisegno il cursore torna nel pezzo giusto e non nel primo della relazione.
    const p = String(el.dataset.id).split('/');
    const rel = relazione(p[0]);
    if (!rel) return;
    const blocchi = rel.sezioni[p[1]] || (rel.sezioni[p[1]] = []);
    const i = Number(p[2]) || 0;
    // Il pezzo di una sezione vuota nasce qui, senza data: è un'aggiunta a mano.
    if (!blocchi[i]) blocchi[i] = { giorno: null, codice: '', aperta: false, testo: '' };
    blocchi[i].testo = el.value;
    cresciTextarea(el);
    salvaConCalma('rel-' + el.dataset.id, function () { salva('relazione', rel); });
    return;
  }
  if (campo === 'note-cantiere') {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    c.note = el.value;
    cresciTextarea(el);
    salvaConCalma('cant-' + c.id, function () { salva('cantiere', c); });
    return;
  }
  if (campo === 'file-listino' && evento === 'change') {
    const scelti = Array.prototype.slice.call(el.files || []);
    const codice = el.dataset.listino;
    el.value = '';
    if (!scelti.length) return;
    // Più foto insieme sono le pagine di uno stesso prezzario.
    const p = scelti.length > 1 && scelti.every(function (f) { return /^image\//.test(f.type); })
      ? (IMPORT.nome = scelti.length + ' foto', IMPORT.listino = codice, IMPORT.errore = '', IMPORT.confronto = null, IMPORT.passo = 'lettura', aggiornaVista(), importaDaImmagini(scelti, codice))
      : avviaImportListino(scelti[0], codice);
    p.catch(function (e) { avvisa('Errore: ' + e.message, 'err'); IMPORT.passo = 'file'; aggiornaVista(); });
    return;
  }
  if (campo === 'file-foto' && evento === 'change') {
    const scelte = Array.prototype.slice.call(el.files || []);
    const sopId = el.dataset.id, origine = el.dataset.origine;
    // Si svuota subito: così la stessa foto si può scegliere di nuovo, e il file grosso non resta appeso al campo.
    el.value = '';
    if (!scelte.length) return;
    // Dal rullino se ne possono prendere più d'una: si caricano in fila e si resta dov'è.
    (async function () {
      for (const f of scelte) await aggiungiFoto(f, sopId, origine);
      if (scelte.length > 1) { avvisa(scelte.length + ' foto salvate', 'ok'); aggiornaVista(); }
    })().catch(function (e) { avvisa('Errore: ' + e.message, 'err'); });
    return;
  }
  /* La ruota dei colori: si muove il cursore e il colore si vede subito, si
     salva quando si lascia andare. */
  if (campo === 'file-azienda' && evento === 'change') {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file || !AZ_IMMAGINE) return;
    const dove = AZ_IMMAGINE; AZ_IMMAGINE = null;
    (async function () {
      const a = azienda(dove.id);
      if (!a) return;
      avvisa('Preparo l\'immagine…');
      // Una banda è larga quanto il foglio: si riduce meno, se no in stampa sgrana.
      const banda = dove.quale === 'banda' || dove.quale === 'bandaPiede';
      const ridotta = await riduciFoto(file, banda ? LATO_BANDA : LATO_LOGO, QUALITA_LOGO);
      const id = nuovoId();
      const rif = await salvaMedia(id, ridotta.blob);
      // La firma di un tecnico (D5): va sul tecnico, non sull'azienda.
      if (dove.tecnico) {
        const t = (a.tecnici || []).find(function (x) { return x.id === dove.tecnico; });
        if (!t) { await cancellaMedia(rif); return; }
        if (t.firma) { scordaFoto(t.firma); await cancellaMedia(t.firma); }
        t.firma = rif;
      } else {
        if (a[dove.quale]) { scordaFoto(a[dove.quale]); await cancellaMedia(a[dove.quale]); }
        a[dove.quale] = rif;
      }
      salva('azienda', a);
      avvisa(dove.tecnico ? 'Firma messa' : ({ logo: 'Logo messo', firma: 'Firma messa', banda: 'Intestazione messa', bandaPiede: 'Piè di pagina messo' }[dove.quale] || 'Fatto'), 'ok');
      aggiornaVista();
    })().catch(function (e) { avvisa('Errore: ' + e.message, 'err'); });
    return;
  }
  if (campo === 'file-azienda-doc' && evento === 'change') {
    const scelte = Array.prototype.slice.call(el.files || []);
    const idAz = el.dataset.id;
    el.value = '';
    if (!scelte.length) return;
    (async function () {
      const a = azienda(idAz);
      if (!a) return;
      if (!Array.isArray(a.documenti)) a.documenti = [];
      for (const file of scelte) {
        const rif = await salvaMedia(nuovoId(), file);
        a.documenti.push({ id: nuovoId(), file: rif, nome: file.name, peso: file.size });
      }
      salva('azienda', a);
      avvisa(scelte.length > 1 ? scelte.length + ' documenti aggiunti' : 'Documento aggiunto', 'ok');
      aggiornaVista();
    })().catch(function (e) { avvisa('Errore: ' + e.message, 'err'); });
    return;
  }
  if (campo === 'file-documento' && evento === 'change') {
    const scelte = Array.prototype.slice.call(el.files || []);
    const sopId = el.dataset.id, origine = el.dataset.origine, genere = GENERI[DOC_GENERE] ? DOC_GENERE : 'bolla';
    el.value = '';
    if (!scelte.length) return;
    (async function () {
      for (const f of scelte) await aggiungiFoto(f, sopId, origine, genere);
      if (scelte.length > 1) avvisa(scelte.length + ' scansioni salvate', 'ok');
      // Scansionata da un cantiere, si va nel giorno dov'è finita; già nel giorno, si ridisegna e basta.
      if (ROTTA.nome === 'giorno') aggiornaVista(); else vai('#/giorno/' + sopId);
    })().catch(function (e) { avvisa('Errore: ' + e.message, 'err'); });
    return;
  }
  if (campo === 'referto-foto') {
    const s = sopralluogo(el.dataset.sop);
    const f = s && trovaFoto(s, el.dataset.id);
    if (!f) return;
    f.referto = el.value;
    cresciTextarea(el);
    const capo = el.previousElementSibling;
    if (capo && capo.classList.contains('card-capo')) capo.classList.toggle('spenta', !el.value.trim());
    salvaConCalma('foto-' + f.id, function () { salva('sopralluogo', s); });
    return;
  }
  if (campo === 'import-intestazione') { IMPORT.schema.riga_intestazione = Number(el.value) || 0; aggiornaVista(); return; }
  if (campo === 'import-decimali') { IMPORT.schema.decimali = el.value; return; }
  if (campo === 'import-colonna') {
    const i = Number(el.dataset.indice);
    Object.keys(IMPORT.schema.colonne).forEach(function (k) { if (IMPORT.schema.colonne[k] === i) IMPORT.schema.colonne[k] = null; });
    if (el.value) IMPORT.schema.colonne[el.value] = i;
    aggiornaVista();
    return;
  }
  if (campo === 'pdf-modo' || campo === 'pdf-ambito') { aggiornaFoglioPdf(); return; }
}

/* ============================================================
   L'AVVIO
   ============================================================ */

function avvio() {
  const db = leggiTutto();
  leggiLocale();
  applicaColori();
  // La prima volta l'app parte con i dati di esempio dentro.
  if (!archivioEsiste()) { inserisciDatiEsempio(); }
  else if (!conta(db.cantieri) && db.soloEsempio) { inserisciDatiEsempio(); }
  sistemaAziende();
  migraListini();
  ripescaDaAssegnare();

  leggiRotta();
  chiudiTendine();
  disegna();

  // Un solo ascoltatore per tutti i tocchi
  document.addEventListener('click', function (ev) {
    const el = ev.target.closest('[data-az]');
    if (!el) return;
    if (el.disabled) return;
    const fn = AZIONI[el.dataset.az];
    if (!fn) return;
    ev.preventDefault();
    try { const r = fn(el, ev); if (r && r.catch) r.catch(function (e) { avvisa('Errore: ' + e.message, 'err'); }); }
    catch (e) { avvisa('Errore: ' + e.message, 'err'); }
  });
  /* Torna indietro trascinando dal bordo sinistro, come fa il telefono nelle sue
     app. Serve soprattutto quando CANTIERI è installata sulla schermata home:
     lì la barra del browser non c'è, e senza questo l'unico modo di tornare
     indietro è il tasto in cima allo schermo, lontano dal pollice.
     Il gesto parte solo dai primi 32 pixel: dentro la pagina ci sono file che
     scorrono di lato — le foto, i tasti dei rilievi — e non vanno disturbate. */
  let tocco = null;
  document.addEventListener('touchstart', function (ev) {
    if (ev.touches.length !== 1) { tocco = null; return; }
    const t = ev.touches[0];
    tocco = t.clientX <= 32 ? { x: t.clientX, y: t.clientY, quando: Date.now() } : null;
  }, { passive: true });
  document.addEventListener('touchend', function (ev) {
    if (!tocco) return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - tocco.x, dy = Math.abs(t.clientY - tocco.y);
    const veloce = Date.now() - tocco.quando < 700;
    tocco = null;
    if (dx > 70 && dy < 60 && veloce) indietro();
  }, { passive: true });

  document.addEventListener('input', function (ev) { const el = ev.target.closest('[data-campo]'); if (el) suCampo(el, 'input'); });
  document.addEventListener('change', function (ev) { const el = ev.target.closest('[data-campo]'); if (el && (el.type === 'file' || el.type === 'color' || el.tagName === 'SELECT')) suCampo(el, 'change'); });
  // Uscendo da un campo si dice "Salvato": una parola, per sapere che è andata.
  document.addEventListener('focusout', function (ev) {
    const el = ev.target;
    if (!el || !el.dataset || !el.dataset.campo) return;
    const prefissi = { 'sezione': 'sop-', 'sezione-verbale': 'ver-', 'note-cantiere': 'cant-', 'note-contabilita': 'cont-', 'referto-foto': 'foto-', 'inbreve-relazione': 'rel-', 'blocco-relazione': 'rel-' };
    const pre = prefissi[el.dataset.campo];
    if (pre && salvaAdesso(pre + el.dataset.id)) avvisa('Salvato', 'ok');
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target && ev.target.id === 'pin') { ev.preventDefault(); AZIONI['pin-verifica'](); }
    if (ev.key === 'Escape' && foglioAperto()) AZIONI['chiudi-foglio']();
  });

  // Cinque tocchi di fila sul titolo: il modo sviluppatore
  document.addEventListener('click', function (ev) {
    if (!ev.target.closest('#titolo-app')) return;
    tocchiTitolo++;
    clearTimeout(timerTocchi);
    timerTocchi = setTimeout(function () { tocchiTitolo = 0; }, 1500);
    if (tocchiTitolo >= 5) { tocchiTitolo = 0; devSbloccato = false; vai('#/dev'); }
  });

  document.getElementById('reg-ferma').addEventListener('click', function () {
    // Il permesso delle notifiche si chiede qui, dentro il tocco: iPhone lo accetta solo così.
    chiediNotificheUnaVolta();
    fermaRegistrazione();
  });

  window.addEventListener('hashchange', function () {
    leggiRotta();
    if (ROTTA.nome !== 'listino' || ROTTA.parametri[1] !== 'carica') { IMPORT.passo = 'file'; IMPORT.errore = ''; }
    if (ROTTA.nome !== 'dev') devSbloccato = false;
    if (foglioAperto()) chiudiFoglio();
    chiudiFotocamera();
    chiudiTendine();
    disegna();
    window.scrollTo(0, 0);
    if (ROTTA.nome === 'dev' && devSbloccato) misuraSpazio().then(aggiornaVista);
  });

  window.addEventListener('online', function () { avvisa('Rete tornata', 'ok'); elaboraCoda(); if (leggiLocale().github.daMandare) programmaInvioGitHub(); aggiornaVista(); });
  window.addEventListener('offline', function () { avvisa('Manca la rete', 'att'); aggiornaVista(); });
  // Prima di sparire si scrive quello che è rimasto in sospeso.
  window.addEventListener('pagehide', function () { salvaSubitoTutto(); salvagenteGitHub(); });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { salvaSubitoTutto(); salvagenteGitHub(); }
    else {
      // Tornati davanti con il microfono acceso: si riprende se era in pausa, e lo schermo resta sveglio.
      if (REG.attiva) { if (REG.daRiprendere || !REG.recorder || REG.recorder.state !== 'recording') riprendiRegistrazione(); else tieniSveglio(); }
      ricaricaSeFresco(); controllaCambioGiorno(); aggiornaVista(); elaboraCoda(); controllaPromemoria(); contaSettimana().then(function () { if (SETT_CONTO.inizio) aggiornaVista(); });
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* senza service worker l'app funziona lo stesso, solo non senza rete */ });
  }

  elaboraCoda();
  setInterval(elaboraCoda, 60000);
  setInterval(controllaPromemoria, 60000);
  setInterval(controllaCambioGiorno, 60000);
  controllaPromemoria();
  misuraSpazio().then(function () { if (SPAZIO.avviso) aggiornaVista(); });
  // Memoria protetta e avviso all'80% (24/09/2026): vedi impostazioni.js.
  proteggiMemoria().then(function () { if (ROTTA.nome === 'impostazioni') aggiornaVista(); });
  controllaMemoria();
  // Fase 5: il verbale della settimana appena chiusa si scrive da solo appena si apre l'app.
  creaVerbaliSettimanaScorsa();
  // Da mercoledì le settimane passate si chiudono da sole; poi si conta quella che aspetta "Libera memoria".
  pulisciSettimane().then(contaSettimana).then(function () { if (SETT_CONTO.inizio) aggiornaVista(); });

  // La copia online: si legge senza token, e se c'è qualcosa da mandare si manda.
  if (navigator.onLine && repoGitHub()) {
    scaricaGitHub().then(function (cambiato) {
      if (cambiato) { sistemaAziende(); migraListini(); avvisa('Aggiornato da GitHub', 'ok'); aggiornaVista(); }
      if (leggiLocale().github.daMandare) programmaInvioGitHub();
    }).catch(function () { /* il file può non esserci ancora: non è un errore */ });
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvio);
else avvio();

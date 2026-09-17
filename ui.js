/* CANTIERI — ui.js: mattoni comuni: testata, card, tendine, fogli, chiedi, avvisa, pill, il router (leggiRotta, disegna, aggiornaVista) */
'use strict';


/* ============================================================
   AVVISI DI UNA PAROLA E FOGLI DAL BASSO
   ============================================================ */

let timerToast = null;
function avvisa(parola, tipo) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = parola;
  t.className = 'toast su' + (tipo ? ' ' + tipo : '');
  clearTimeout(timerToast);
  timerToast = setTimeout(function () { t.className = 'toast'; }, 1800);
}

// Una finestra sola alla volta. Il foglio sale dal basso: sta sotto il pollice.
function apriFoglio(html, opzioni) {
  const f = document.getElementById('finestra');
  f.innerHTML = '<div class="velo" data-az="chiudi-foglio-velo"><div class="foglio" role="dialog">' + html + '</div></div>';
  f.hidden = false;
  segnaScorrimento(f);
  if (opzioni && opzioni.pieno) f.firstChild.className = 'velo';
  const primo = f.querySelector('[autofocus]');
  if (primo) setTimeout(function () { primo.focus(); }, 50);
}
function chiudiFoglio() {
  const f = document.getElementById('finestra');
  f.hidden = true;
  f.innerHTML = '';
}
function foglioAperto() { return !document.getElementById('finestra').hidden; }

// Le conferme non usano confirm(): su iPhone installata esce un riquadro piccolo e grigio, illeggibile.
function chiedi(titolo, testo, etichettaOk, tipoOk, extra) {
  return new Promise(function (ok) {
    apriFoglio(
      '<h2>' + h(titolo) + '</h2>' + (testo ? '<p>' + h(testo) + '</p>' : '') + (extra || '') +
      '<button class="btn ' + (tipoOk === 'rosso' ? 'btn-rosso' : 'btn-ok') + '" data-az="conferma-si">' + h(etichettaOk || 'Conferma') + '</button>' +
      '<button class="btn" data-az="conferma-no">Annulla</button>'
    );
    attesaConferma = ok;
  });
}
let attesaConferma = null;

function mostraTestoPieno(titolo, testo) {
  const f = document.getElementById('finestra');
  f.innerHTML = '<div class="pieno"><h2 class="pieno-tit">' + h(titolo) + '</h2><div class="pieno-testo">' + h(testo) + '</div>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:12px">Chiudi</button></div>';
  f.hidden = false;
}
// "Sicuro?" dopo l'"Eliminare?": per giornate, cantieri e aziende non si torna indietro.
async function chiediDueVolte(titolo, testo, etichetta) {
  const ok = await chiedi(titolo, testo, etichetta, 'rosso');
  chiudiFoglio();
  if (!ok) return false;
  const sicuro = await chiedi('Sicuro?', 'Non si torna indietro.', 'Sì, elimina', 'rosso');
  chiudiFoglio();
  return sicuro;
}

/* ============================================================
   IL ROUTER E LE SCHERMATE
   Le rotte stanno nell'hash: così il gesto "indietro" dell'iPhone funziona
   e una pagina ricaricata riapre dove era.
   ============================================================ */

let ROTTA = { nome: 'dashboard', parametri: [] };
let devSbloccato = false;

/* I tre puntini aprono un menu piccolo, agganciato al tasto: non più la card
   che si allunga sotto (cambiato il 17/09/2026, su richiesta di Simone — il
   menu è "fixed", posizionaMenuPunti lo mette a posto dopo ogni disegno, così
   esce dal bordo arrotondato della card che lo conterrebbe). Un solo menu
   aperto per volta; si chiude toccando fuori, scorrendo, o cambiando schermata. */
let PUNTI_APERTI = null;
function apriPunti(id) { PUNTI_APERTI = (PUNTI_APERTI === id ? null : id); aggiornaVista(); }
// Vale anche per il tasto Esporta (tastoMenuAperto, più sotto): stesso menu flottante, stesso calcolo.
function posizionaMenuPunti() {
  const menu = document.querySelector('.menu-punti');
  const btn = tastoMenuAperto();
  if (!menu || !btn) return;
  const margine = 8;
  const r = btn.getBoundingClientRect();
  const largo = menu.offsetWidth, alto = menu.offsetHeight;
  let top = r.bottom + 4;
  if (top + alto > innerHeight - margine) top = Math.max(margine, r.top - alto - 4);
  let left = Math.min(r.right, innerWidth - margine) - largo;
  left = Math.max(margine, left);
  menu.style.top = top + 'px';
  menu.style.left = left + 'px';
}
// Trova il tasto che ha aperto il menu flottante in questo momento, puntini o Esporta.
function tastoMenuAperto() { return document.querySelector('.on[data-az^="menu-"]') || document.querySelector('.on[data-az="esporta-tendina"]'); }
// Si chiude toccando fuori dal menu (il tasto che l'ha aperto si gestisce da sé) o scorrendo.
document.addEventListener('click', function (ev) {
  if (!PUNTI_APERTI && !ESPORTA_APERTO) return;
  if (ev.target.closest('.menu-punti') || ev.target.closest('[data-az^="menu-"]') || ev.target.closest('[data-az="esporta-tendina"]')) return;
  PUNTI_APERTI = null; ESPORTA_APERTO = null;
  aggiornaVista();
});
function chiudiMenuFlottanteSuGesto() { if (PUNTI_APERTI || ESPORTA_APERTO) { PUNTI_APERTI = null; ESPORTA_APERTO = null; aggiornaVista(); } }
/* "wheel"/"touchmove", non "scroll": aggiornaVista() richiama da sola window.scrollTo
   per tenere il punto dov'era, e quello genera un evento "scroll" che chiuderebbe
   il menu appena aperto — bug segnalato da Simone il 17/09/2026. Con un gesto vero
   non si sbaglia mai, e non lo genera mai il codice. */
document.addEventListener('wheel', chiudiMenuFlottanteSuGesto, { passive: true });
document.addEventListener('touchmove', chiudiMenuFlottanteSuGesto, { passive: true });
window.addEventListener('resize', chiudiMenuFlottanteSuGesto);
function vai(hash) { PUNTI_APERTI = null; ESPORTA_APERTO = null; location.hash = hash; }

/* Il tasto "Esporta" di una card con Visualizza · Esporta · Correggi: toccato,
   apre il menu flottante con le due strade — Esporta (condividi) e Scarica (nel
   telefono), come i tre puntini. Un menu aperto alla volta, e si chiude
   cambiando schermata. */
let ESPORTA_APERTO = null;
// Scelta una voce, la tendina si richiude subito, prima che parta il lavoro.
function chiudiEsporta() { if (ESPORTA_APERTO) { ESPORTA_APERTO = null; aggiornaVista(); } }
function tastoEsporta(chiave) {
  const aperto = ESPORTA_APERTO === chiave;
  return '<button class="btn' + (aperto ? ' on' : '') + '" data-az="esporta-tendina" data-chiave="' + h(chiave) + '" aria-expanded="' + aperto + '">Esporta<span class="fr">' + (aperto ? '▴' : '▾') + '</span></button>';
}
/* I tre puntini di giornate, cantieri e aziende: il tasto, e sotto — nella card,
   come la tendina di Esporta — la sola voce Elimina. Gli attributi data-* arrivano
   già pronti, perché ogni cosa da eliminare si identifica a modo suo. */
function tastoPunti(chiave) {
  const aperto = PUNTI_APERTI === chiave;
  return '<button class="pill cod puntini' + (aperto ? ' on' : '') + '" data-az="menu-punti" data-chiave="' + h(chiave) + '" aria-label="Altro" aria-expanded="' + aperto + '">⋯</button>';
}
function vociPunti(chiave, azione, attributi) {
  if (PUNTI_APERTI !== chiave) return '';
  return '<div class="menu-punti"><button class="voce-m rossa" data-az="' + azione + '" ' + attributi + '><b>Elimina</b></button></div>';
}
// Flottante come i tre puntini, non più due righe che si aprono sotto (17/09/2026, richiesta di Simone).
function vociEsporta(chiave, azEsporta, idEsporta, azScarica, idScarica) {
  if (ESPORTA_APERTO !== chiave) return '';
  return '<div class="menu-punti">' +
    '<button class="voce-m" data-az="' + azEsporta + '" data-id="' + h(idEsporta) + '"><b>Esporta</b><small>manda a qualcuno: mail, WhatsApp, stampa</small></button>' +
    '<button class="voce-m" data-az="' + azScarica + '" data-id="' + h(idScarica) + '"><b>Scarica</b><small>salva il PDF nel telefono</small></button></div>';
}
function leggiRotta() {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  ROTTA = { nome: p[0] || 'dashboard', parametri: p.slice(1).map(decodeURIComponent) };
}
function aggiornaSeDev() { if (ROTTA.nome === 'dev') aggiornaVista(); }

/* Si ridisegna tutta la schermata. Se l'utente stava scrivendo in un campo,
   si rimette il cursore dove era: un riordino che arriva non deve fargli
   perdere la riga. */
function aggiornaVista() {
  const attivo = document.activeElement;
  let ricorda = null;
  if (attivo && attivo.closest && attivo.closest('#vista') && attivo.dataset.campo) {
    ricorda = { campo: attivo.dataset.campo, id: attivo.dataset.id || '', inizio: attivo.selectionStart, fine: attivo.selectionEnd };
  }
  const scroll = window.scrollY;
  disegna();
  if (ricorda) {
    const el = Array.prototype.find.call(document.querySelectorAll('#vista [data-campo]'), function (e) {
      return e.dataset.campo === ricorda.campo && (e.dataset.id || '') === ricorda.id;
    });
    if (el) { el.focus(); try { el.setSelectionRange(ricorda.inizio, ricorda.fine); } catch (e) { /* non è un campo di testo */ } }
  }
  window.scrollTo(0, scroll);
}

function disegna() {
  const vista = document.getElementById('vista');
  let html = '';
  try {
    switch (ROTTA.nome) {
      case 'dashboard': html = leggiLocale().saltaAziende ? vistaDashboard() : vistaAziende(); break;
      case 'aziende': html = vistaAziende(); break;
      case 'azienda': html = vistaDashboard(ROTTA.parametri[0]); break;
      case 'nuova-azienda': html = vistaAziendaForm(null); break;
      case 'modifica-azienda': html = vistaAziendaForm(ROTTA.parametri[0]); break;
      case 'cantiere': html = vistaCantiere(ROTTA.parametri[0]); break;
      case 'nuovo-cantiere': html = vistaCantiereForm(null, ROTTA.parametri[0]); break;
      case 'modifica-cantiere': html = vistaCantiereForm(ROTTA.parametri[0]); break;
      case 'giorno': html = vistaGiorno(ROTTA.parametri[0]); break;
      case 'giornata': html = vistaGiornata(ROTTA.parametri[0]); break;
      case 'verbale': html = vistaVerbaleModifica(ROTTA.parametri[0]); break;
      case 'relazione': html = vistaRelazione(ROTTA.parametri[0]); break;
      case 'modifica-relazione': html = vistaRelazioneModifica(ROTTA.parametri[0]); break;
      case 'foto': html = vistaFoto(ROTTA.parametri[0], ROTTA.parametri[1]); break;
      case 'listino': html = vistaListino(ROTTA.parametri[0], ROTTA.parametri[1], ROTTA.parametri[2]); break;
      case 'note': html = vistaNote(ROTTA.parametri[0]); break;
      case 'pdf': html = vistaPdf(ROTTA.parametri[0]); break;
      case 'leggi': html = vistaLeggiPdf(ROTTA.parametri[0]); break;
      case 'cerca': html = vistaCerca(); break;
      case 'impostazioni':
        html = ROTTA.parametri[0] === 'aspetto' ? vistaImpostazioniAspetto()
          : ROTTA.parametri[0] === 'archivio' ? vistaImpostazioniArchivio()
          : vistaImpostazioni();
        break;
      case 'dev': html = vistaDev(); break;
      default: html = vistaDashboard();
    }
  } catch (e) {
    html = '<div class="top"><div class="tit"><h1>CANTIERI</h1></div></div><div class="avviso rosso">Qualcosa è andato storto: ' + h(e.message) + '</div>' +
      '<div class="modulo"><button class="btn" data-az="vai" data-a="#/">Torna all\'inizio</button></div>';
  }
  vista.innerHTML = html;
  vista.querySelectorAll('textarea.corpo, textarea.campo.auto').forEach(cresciTextarea);
  // Le foto arrivano da IndexedDB dopo: la schermata è già disegnata.
  caricaImmagini(vista);
  segnaScorrimento(vista);
  // Le pagine del PDF si disegnano dopo, quando il contenitore ha una larghezza.
  if (ROTTA.nome === 'leggi') mostraPdfDentro(ROTTA.parametri[0]);
  posizionaMenuPunti();
}
function cresciTextarea(t) {
  t.style.height = 'auto';
  t.style.height = Math.max(60, t.scrollHeight + 2) + 'px';
}
/* Le file che scorrono di lato — foto, sopralluoghi, verbali, tasti dei rilievi, tinte —
   hanno due freccette ai bordi, e ognuna si vede solo se da quella parte c'è altra roba.
   Stanno dentro la fila, appiccicate ai bordi (sticky): così nessun contenitore va
   avvolto e il CSS delle file resta com'è. Toccarle fa scorrere di una schermata. */
function segnaScorrimento(radice) {
  radice.querySelectorAll('.griglia, .doc-fila, .foto-fila, .tinte').forEach(function (fila) {
    if (fila.querySelector('.frec-s')) return;
    fila.insertAdjacentHTML('afterbegin', '<span class="frec-s sx" data-az="scorri" data-verso="-1" aria-hidden="true"><i>‹</i></span>');
    fila.insertAdjacentHTML('beforeend', '<span class="frec-s dx" data-az="scorri" data-verso="1" aria-hidden="true"><i>›</i></span>');
    const aggiorna = function () {
      // A riposo lo snap porta la prima card a filo, oltre il padding: quello non conta come "altra roba".
      const bordo = parseFloat(getComputedStyle(fila).paddingLeft) || 0;
      fila.classList.toggle('piu-sx', fila.scrollLeft > bordo + 2);
      fila.classList.toggle('piu-dx', fila.scrollLeft + fila.clientWidth < fila.scrollWidth - 2);
    };
    fila.addEventListener('scroll', aggiorna, { passive: true });
    aggiorna();
  });
}
window.addEventListener('resize', function () {
  document.querySelectorAll('.frec-s.sx').forEach(function (el) { el.parentElement.dispatchEvent(new Event('scroll')); });
});

// ---- pezzi comuni ----
function testata(o) {
  return '<div class="top">' +
    (o.indietro ? '<button class="indietro" data-az="vai" data-a="' + h(o.indietro) + '" aria-label="Indietro">‹</button>' : '') +
    '<div class="tit">' + (o.tocca ? '<button class="tocca" data-az="' + h(o.tocca) + '" data-id="' + h(o.id || '') + '">' : '') +
    '<h1' + (o.grande ? '' : ' class="pic"') + (o.idTitolo ? ' id="' + o.idTitolo + '"' : '') + '>' + h(o.titolo) + '</h1>' +
    (o.sotto ? '<div class="sub">' + o.sotto + '</div>' : '') + (o.tocca ? '</button>' : '') + '</div>' +
    (o.destra ? '<div class="destra">' + o.destra + '</div>' : '') +
    '</div>';
}
function tendina(chiave, etichetta, contenuto, n) {
  const aperta = !!leggiLocale().tendine[chiave];
  // Il numero a destra può essere gialla: { n: 2, att: true } dice "qui c'è qualcosa da guardare".
  const att = n && typeof n === 'object';
  if (att) n = n.n;
  return '<button class="tend" data-az="tendina" data-chiave="' + h(chiave) + '" aria-expanded="' + aperta + '">' +
    '<span class="frec">▶</span> <span class="et">' + h(etichetta) + '</span>' + (n != null ? '<span class="n' + (att ? ' att' : '') + '">' + h(n) + '</span>' : '') + '</button>' +
    '<div' + (aperta ? '' : ' hidden') + '>' + contenuto + '</div>';
}
/* Le tendine di una schermata stanno due per riga; quella aperta prende la riga
   intera con il suo contenuto sotto. Si passano solo quelle che hanno qualcosa
   dentro: una tendina vuota non si disegna. Una sola, e prende tutta la riga. */
function grigliaTendine(lista) {
  lista = lista.filter(Boolean);
  if (!lista.length) return '';
  return '<div class="tendine' + (lista.length === 1 ? ' una' : '') + '">' + lista.join('') + '</div>';
}
// L'elenco dentro una tendina scorre nella sua altezza, come la lista degli audio.
function scorrevole(html) { return '<div class="audio-lista corta">' + html + '</div>'; }
function testoElenco(testo, elenco) {
  if (!elenco) return h(testo);
  return righeElenco(testo).map(function (r) { return '<div class="voce"><span class="segno">●</span><span>' + h(r) + '</span></div>'; }).join('');
}

/* ============================================================
   LE AZIONI
   Un solo ascoltatore per i tocchi e uno per i campi: ogni bottone porta
   data-az, ogni campo data-campo. Le schermate si ridisegnano da zero e
   non c'è niente da ricollegare.
   ============================================================ */

const SALVATAGGI = {};
// Un salvataggio ogni battuta sarebbe troppo: si aspetta mezzo secondo di fermo.
function salvaConCalma(chiave, fn) {
  if (SALVATAGGI[chiave]) clearTimeout(SALVATAGGI[chiave].timer);
  SALVATAGGI[chiave] = { fn: fn, timer: setTimeout(function () { delete SALVATAGGI[chiave]; fn(); }, 500) };
}
// Uscendo da un campo, o chiudendo l'app, quello in sospeso si scrive subito.
function salvaAdesso(chiave) {
  const s = SALVATAGGI[chiave];
  if (!s) return false;
  clearTimeout(s.timer);
  delete SALVATAGGI[chiave];
  s.fn();
  return true;
}
function salvaSubitoTutto() {
  Object.keys(SALVATAGGI).forEach(salvaAdesso);
}

// Le azioni di questo file.
Object.assign(AZIONI, {
  'vai': function (el) { vai(el.dataset.a); },
  'chiudi-foglio': function () { chiudiFoglio(); if (attesaConferma) { attesaConferma(false); attesaConferma = null; } if (IMPORT.scegliFoglio) IMPORT.scegliFoglio(null); },
  'chiudi-foglio-velo': function (el, ev) { if (ev.target === el) AZIONI['chiudi-foglio'](); },
  'conferma-si': function () { if (attesaConferma) { const f = attesaConferma; attesaConferma = null; f(true); } },
  'conferma-no': function () { chiudiFoglio(); if (attesaConferma) { const f = attesaConferma; attesaConferma = null; f(false); } },
  // La freccetta di una fila: scorre di quasi una schermata, verso dove indica.
  'scorri': function (el) {
    const fila = el.parentElement;
    fila.scrollBy({ left: Number(el.dataset.verso) * fila.clientWidth * 0.8, behavior: 'smooth' });
  },
  'tendina': function (el) {
    const loc = leggiLocale();
    loc.tendine[el.dataset.chiave] = !loc.tendine[el.dataset.chiave];
    salvaLocale();
    const aperta = loc.tendine[el.dataset.chiave];
    el.setAttribute('aria-expanded', String(aperta));
    /* Quello che si apre di solito sta subito dopo il tasto. Quando il tasto
       divide la riga con un altro (l'azienda, che ha anche "scheda"), sta
       subito dopo la riga intera. */
    let box = el.nextElementSibling;
    if (!box || box.hasAttribute('data-az')) box = el.parentElement ? el.parentElement.nextElementSibling : null;
    if (box) {
      box.hidden = !aperta;
      box.querySelectorAll('textarea.corpo').forEach(cresciTextarea);
      // Le file dentro erano nascoste: le freccette si ricalcolano adesso che hanno una larghezza.
      box.querySelectorAll('.frec-s.sx').forEach(function (f) { f.parentElement.dispatchEvent(new Event('scroll')); });
    }
  },
  'esporta-tendina': function (el) { ESPORTA_APERTO = (ESPORTA_APERTO === el.dataset.chiave ? null : el.dataset.chiave); aggiornaVista(); },
  'menu-punti': function (el) { apriPunti(el.dataset.chiave); },
});

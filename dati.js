/* CANTIERI — dati.js: l'archivio: leggiTutto, salva, cancella, le collezioni, foto e audio in IndexedDB, sincronizzazione con GitHub, coda di invio */
'use strict';


/* ============================================================
   L'ARCHIVIO
   Tutte le letture e le scritture passano da qui. Nient'altro nel codice
   tocca localStorage o IndexedDB: così il giorno che l'archivio cambia
   (un database vero, più utenti) si riscrive questo blocco e basta.

   Due chiavi in localStorage:
   - cantieri.dati   → i documenti e i contatori. È quello che va su GitHub.
   - cantieri.locale → chiavi dei servizi, coda, consumi, preferenze. Resta nel telefono.
   L'audio sta in IndexedDB, che regge i file grossi; localStorage no.
   ============================================================ */

// Sull'anteprima le chiavi cambiano nome, cosi' non si pesca
// nell'archivio dell'app vera: stesso dominio, cassetti diversi.
// Vale sia per /cantieri/anteprime/<ramo>/ sia per /cantieri-anteprime/<ramo>/.
const PREFISSO = location.pathname.includes('anteprime') ? 'anteprima.' : '';
const CHIAVE_DATI = PREFISSO + 'cantieri.dati';
const CHIAVE_LOCALE = PREFISSO + 'cantieri.locale';
const NOME_IDB = PREFISSO + 'cantieri-audio';
const STORE_IDB = 'audio';

let DB = null;       // i documenti, in memoria
let LOCALE = null;   // le cose del telefono, in memoria

function archivioVuoto() {
  return {
    versione: 1,
    contatori: { AZ: 0, CANT: 0, GIO: 0, SOP: 0, VER: 0, VOCE: 0, LIS: 0, PRZ: 0, REL: 0 },
    aziende: {}, cantieri: {}, giornate: {}, sopralluoghi: {}, verbali: {}, listino: {}, listini: {}, relazioni: {},
    cancellati: {},     // id → quando: perché una cancellazione arrivi anche all'altra copia
    soloEsempio: true,  // finché è vero, dentro ci sono solo i dati di esempio
    aggiornato: adessoISO()
  };
}

function localeVuoto() {
  return {
    chiavi: { groq: '', anthropic: '', github: '' },
    repo: '',
    modello: MODELLO,
    coda: [],
    proposte: [],
    consumi: {},
    ultimaCache: null,
    tendine: {},
    ultimoCantiere: null,
    notificheChieste: false,
    promemoriaGiorno: null,
    github: { daMandare: false, ultimoInvio: null, errore: null, sha: null },
    scaricati: {},
    pdf: [],
    mail: '',
    colori: { primario: '', secondario: '' },
    saltaAziende: false,
    settimane: {}
  };
}

function leggiTutto() {
  if (DB) return DB;
  let grezzo = null;
  try { grezzo = localStorage.getItem(CHIAVE_DATI); } catch (e) { grezzo = null; }
  if (grezzo) {
    try { DB = JSON.parse(grezzo); } catch (e) { DB = null; }
  }
  if (!DB || !DB.contatori) DB = archivioVuoto();
  completaArchivio(DB);
  return DB;
}

/* Un archivio scritto da una versione più vecchia non ha le collezioni nate
   dopo — le relazioni, le aziende. Senza questa riparazione il primo salvataggio
   scrive dentro il vuoto e l'app non parte più. Vale per quello che c'è sul
   telefono e per quello che arriva da GitHub. */
function completaArchivio(db) {
  if (!db) return db;
  const modello = archivioVuoto();
  Object.keys(modello).forEach(function (k) {
    if (modello[k] && typeof modello[k] === 'object' && !Array.isArray(modello[k])) {
      if (!db[k] || typeof db[k] !== 'object') db[k] = {};
      if (k === 'contatori') Object.keys(modello.contatori).forEach(function (c) {
        if (typeof db.contatori[c] !== 'number') db.contatori[c] = 0;
      });
    }
  });
  return db;
}
// Dice se nel telefono c'è già un archivio: la prima volta si parte con gli esempi.
function archivioEsiste() {
  try { return !!localStorage.getItem(CHIAVE_DATI); } catch (e) { return true; }
}
function leggiLocale() {
  if (LOCALE) return LOCALE;
  let grezzo = null;
  try { grezzo = localStorage.getItem(CHIAVE_LOCALE); } catch (e) { grezzo = null; }
  const base = localeVuoto();
  if (grezzo) {
    try { LOCALE = Object.assign(base, JSON.parse(grezzo)); } catch (e) { LOCALE = base; }
  } else LOCALE = base;
  if (!LOCALE.chiavi) LOCALE.chiavi = base.chiavi;
  if (!LOCALE.github) LOCALE.github = base.github;
  if (!Array.isArray(LOCALE.coda)) LOCALE.coda = [];
  if (!Array.isArray(LOCALE.proposte)) LOCALE.proposte = [];
  if (!Array.isArray(LOCALE.rilieviNuovi)) LOCALE.rilieviNuovi = [];
  return LOCALE;
}
function salvaLocale() {
  try { localStorage.setItem(CHIAVE_LOCALE, JSON.stringify(leggiLocale())); } catch (e) { /* spazio finito: si va avanti lo stesso */ }
}

/* Una pagina rimasta aperta per ore ha in memoria una copia vecchia. Prima di
   scrivere si guarda se nel telefono c'è qualcosa di più fresco (scritto da
   un'altra scheda, o dalla stessa app riaperta): in quel caso si riprende
   quello, e la modifica si applica sopra. È la regola che viene da un guasto vero. */
function ricaricaSeFresco() {
  let grezzo = null;
  try { grezzo = localStorage.getItem(CHIAVE_DATI); } catch (e) { return; }
  if (!grezzo) return;
  let sulTelefono = null;
  try { sulTelefono = JSON.parse(grezzo); } catch (e) { return; }
  if (sulTelefono && sulTelefono.aggiornato && DB && DB.aggiornato && sulTelefono.aggiornato > DB.aggiornato) {
    DB = completaArchivio(sulTelefono);
    if (!DB.cancellati) DB.cancellati = {};
    if (!DB.relazioni) DB.relazioni = {};
  }
}
function persisti() {
  try { localStorage.setItem(CHIAVE_DATI, JSON.stringify(DB)); }
  catch (e) { avvisa('Spazio pieno', 'err'); }
}

function codiceNuovo(prefisso) {
  const db = leggiTutto();
  /* Un codice già usato non si ridà. Succede quando due telefoni lavorano senza
     essersi ancora scambiati i dati: il contatore è indietro, e senza questo
     controllo nascerebbero due SOP-010, col verbale dell'uno attaccato all'altro. */
  const tipo = Object.keys(PREFISSI).find(function (k) { return PREFISSI[k] === prefisso; });
  const coll = tipo && COLLEZIONI[tipo] ? valori(db[COLLEZIONI[tipo]] || {}) : [];
  let n = db.contatori[prefisso] || 0, codice;
  // Tre cifre, che diventano quattro da sole quando serve.
  do { n++; codice = prefisso + '-' + String(n).padStart(3, '0'); }
  while (coll.some(function (x) { return x.codice === codice; }));
  db.contatori[prefisso] = n;
  return codice;
}

function salva(tipo, oggetto) {
  const db = leggiTutto();
  ricaricaSeFresco();
  const collezione = COLLEZIONI[tipo];
  if (!collezione) throw new Error('Tipo sconosciuto: ' + tipo);
  const adesso = adessoISO();
  if (!oggetto.id) oggetto.id = nuovoId();
  if (!oggetto.codice) oggetto.codice = codiceNuovo(PREFISSI[tipo]);
  if (!oggetto.azienda) oggetto.azienda = 'locale';
  if (!oggetto.utente) oggetto.utente = 'locale';
  if (!oggetto.creato) oggetto.creato = adesso;
  oggetto.aggiornato = adesso;
  DB[collezione][oggetto.id] = oggetto;
  DB.aggiornato = adesso;
  if (!oggetto.esempio) DB.soloEsempio = false;
  persisti();
  programmaInvioGitHub();
  return oggetto;
}

function cancella(tipo, id) {
  leggiTutto();
  ricaricaSeFresco();
  const collezione = COLLEZIONI[tipo];
  if (!collezione || !DB[collezione][id]) return;
  delete DB[collezione][id];
  DB.cancellati[id] = adessoISO();
  DB.aggiornato = adessoISO();
  persisti();
  programmaInvioGitHub();
}

// ---- IndexedDB per l'audio ----
let idbPromessa = null;
function apriIDB() {
  if (idbPromessa) return idbPromessa;
  idbPromessa = new Promise(function (ok, no) {
    if (!window.indexedDB) { no(new Error('IndexedDB non disponibile')); return; }
    const req = indexedDB.open(NOME_IDB, 1);
    req.onupgradeneeded = function () {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_IDB)) db.createObjectStore(STORE_IDB, { keyPath: 'id' });
    };
    req.onsuccess = function () { ok(req.result); };
    req.onerror = function () { no(req.error); };
  });
  return idbPromessa;
}
function salvaMedia(id, blob) {
  return apriIDB().then(function (db) {
    return new Promise(function (ok, no) {
      const tx = db.transaction(STORE_IDB, 'readwrite');
      tx.objectStore(STORE_IDB).put({ id: id, blob: blob, tipo: blob.type, peso: blob.size, quando: adessoISO() });
      tx.oncomplete = function () { ok('idb:' + id); };
      tx.onerror = function () { no(tx.error); };
    });
  });
}
function leggiMedia(rif) {
  const id = String(rif || '').replace(/^idb:/, '');
  if (!id) return Promise.resolve(null);
  return apriIDB().then(function (db) {
    return new Promise(function (ok, no) {
      const req = db.transaction(STORE_IDB, 'readonly').objectStore(STORE_IDB).get(id);
      req.onsuccess = function () { ok(req.result ? req.result.blob : null); };
      req.onerror = function () { no(req.error); };
    });
  }).catch(function () { return null; });
}
function cancellaMedia(rif) {
  const id = String(rif || '').replace(/^idb:/, '');
  return apriIDB().then(function (db) {
    return new Promise(function (ok, no) {
      const tx = db.transaction(STORE_IDB, 'readwrite');
      tx.objectStore(STORE_IDB).delete(id);
      tx.oncomplete = function () { ok(); };
      tx.onerror = function () { no(tx.error); };
    });
  }).catch(function () {});
}
// L'elenco senza i blob: serve alla card Spazio per sapere quanto pesa ogni mese.
function elencaMedia() {
  return apriIDB().then(function (db) {
    return new Promise(function (ok, no) {
      const elenco = [];
      const req = db.transaction(STORE_IDB, 'readonly').objectStore(STORE_IDB).openCursor();
      req.onsuccess = function () {
        const c = req.result;
        if (c) { elenco.push({ id: c.value.id, peso: c.value.peso || (c.value.blob ? c.value.blob.size : 0), quando: c.value.quando, tipo: c.value.tipo || (c.value.blob ? c.value.blob.type : '') }); c.continue(); }
        else ok(elenco);
      };
      req.onerror = function () { no(req.error); };
    });
  }).catch(function () { return []; });
}

// ---- comodità di lettura ----
function cantiere(id) { return leggiTutto().cantieri[id] || null; }
function cantierePerCodice(codice) { return valori(leggiTutto().cantieri).find(function (c) { return c.codice === codice; }) || null; }
function sopralluogo(id) { return leggiTutto().sopralluoghi[id] || null; }
function verbale(id) { return leggiTutto().verbali[id] || null; }
// Un verbale si può chiamare come si vuole; se non ha un nome vale il codice.
function nomeVerbale(v) { return v ? (String(v.nome || '').trim() || v.codice) : ''; }
/* ---- Come si chiamano le cose sullo schermo ----
   I codici (AZ-001, SOP-012, VER-004…) restano nei dati e nel PDF: tengono unico
   ogni elemento. Sullo schermo si mostra un nome che una persona riconosce. */
// "dell'11 settembre", "del 12 settembre": l'apostrofo va davanti a 1, 8 e 11.
function delGiorno(iso) {
  const d = daISO(iso), n = d.getDate();
  return (n === 1 || n === 8 || n === 11 ? "dell'" : 'del ') + n + ' ' + MESI[d.getMonth()];
}
function oraCorta(ora) { return String(ora || '').replace(/^0/, ''); }
// L'ora si aggiunge solo quando in quel giorno di sopralluoghi ce n'è più d'uno.
function quandoSopralluogo(s) {
  const piu = sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1;
  return dataSenzaAnno(s.giorno) + (piu ? ', ' + oraCorta(s.ora) : '');
}
// Cantiere + data: "Via Mazzini 14 · 11 settembre". Dentro il suo cantiere, la data basta.
function titoloSopralluogo(s, senzaCantiere) {
  const c = senzaCantiere ? null : cantierePerCodice(s.cantiere);
  return (c ? c.nome + ' · ' : '') + quandoSopralluogo(s);
}
// Il nome dato a mano vince; se no "Verbale dell'11 settembre · Via Mazzini 14".
function titoloVerbale(v, senzaCantiere) {
  const nome = String(v.nome || '').trim();
  if (nome) return nome;
  const c = senzaCantiere ? null : cantierePerCodice(v.cantiere);
  const s = v.giornata ? null : sopralluogoPerCodice(v.sopralluogo);
  const ora = s && sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1 ? ', ' + oraCorta(s.ora) : '';
  return (v.giornata ? 'Giornata ' : 'Verbale ') + delGiorno(v.giorno) + ora + (c ? ' · ' + c.nome : '');
}
function verbalePerCodice(codice) { return valori(leggiTutto().verbali).find(function (v) { return v.codice === codice; }) || null; }
// Una foto si chiama con l'ora, un documento con il suo genere: "Foto delle 9:40", "Bolla delle 14:05".
function nomeFoto(f) { return (GENERI[f.genere] || 'Foto') + ' delle ' + oraCorta(f.ora); }
// "PDF · 3 pagine", o solo "PDF" se le pagine non si sono potute contare.
function paginePdf(f) { return 'PDF' + (f.pagine ? ' · ' + f.pagine + (f.pagine === 1 ? ' pagina' : ' pagine') : ''); }
function sopralluoghiDi(codiceCantiere) {
  return valori(leggiTutto().sopralluoghi).filter(function (s) { return s.cantiere === codiceCantiere; })
    .sort(function (a, b) { return (b.giorno + b.ora).localeCompare(a.giorno + a.ora); });
}
function verbaleDiSopralluogo(codiceSop) {
  return valori(leggiTutto().verbali).find(function (v) { return v.sopralluogo === codiceSop; }) || null;
}
function relazione(id) { return leggiTutto().relazioni[id] || null; }
// Una relazione per cantiere: si riscrive, non se ne fa una seconda.
function relazioneDi(codiceCantiere) {
  return valori(leggiTutto().relazioni).find(function (r) { return r.cantiere === codiceCantiere; }) || null;
}
function listinoTutto() {
  return valori(leggiTutto().listino).sort(function (a, b) { return a.codice.localeCompare(b.codice); });
}
/* ---- i listini: più d'uno, legati al cantiere ----
   Le voci stanno nella collezione "listino" di sempre; ogni voce dice a quale
   listino appartiene. Il "Generale" vale per tutti i cantieri, ed è l'ultimo in
   cui si cerca. Un cantiere tiene l'elenco ordinato dei suoi listini. */
function listiniTutti() {
  return valori(leggiTutto().listini).sort(function (a, b) { return (b.generale ? 1 : 0) - (a.generale ? 1 : 0) || a.nome.localeCompare(b.nome); });
}
function listinoPerCodice(codice) { return listiniTutti().find(function (l) { return l.codice === codice; }) || null; }
function listinoGenerale() { return listiniTutti().find(function (l) { return l.generale; }) || null; }
// Nato mentre ci sono solo gli esempi, è un esempio anche lui: se no l'archivio non sembrerebbe più "solo esempi".
function listinoGeneraleOCrea() { return listinoGenerale() || salva('listini', { nome: 'Generale', riferimento: '', generale: true, esempio: !!leggiTutto().soloEsempio }); }
function vociDi(codiceListino) { return listinoTutto().filter(function (v) { return v.listino === codiceListino; }); }
// I listini di un cantiere, nell'ordine in cui si cerca; il Generale chiude sempre.
function listiniDelCantiere(c) {
  const lista = (c && c.listini || []).map(listinoPerCodice).filter(Boolean);
  const gen = listinoGenerale();
  if (gen && lista.indexOf(gen) === -1) lista.push(gen);
  return lista;
}
/* Le voci di prima non avevano un listino: alla prima apertura finiscono tutte nel
   "Generale". Silenzioso, una volta sola, e vale anche per un archivio arrivato
   da un altro telefono. */
function migraListini() {
  const orfane = listinoTutto().filter(function (v) { return !v.listino; });
  if (!orfane.length) return;
  const gen = listinoGeneraleOCrea();
  orfane.forEach(function (v) { v.listino = gen.codice; salva('listino', v); });
}

/* ---------------- LE AZIENDE ----------------
   Il livello sopra i cantieri: tuo padre lavora per più imprese, e ognuna ha la sua
   carta intestata. Un cantiere appartiene a un'azienda; finché non ce n'è nessuna
   l'app funziona come prima, e i cantieri senza azienda non spariscono mai. */
/* Un cantiere sta sempre dentro un'azienda. Se ce ne sono e di aziende nemmeno una —
   perché l'app viene da prima, o perché arrivano da GitHub — se ne apre una e li prende
   tutti. Il nome è un segnaposto: si cambia dalla sua scheda in due tocchi. */
function sistemaAziende() {
  const db = leggiTutto();
  if (conta(db.aziende) || !conta(db.cantieri)) return null;
  const soloEsempi = valori(db.cantieri).every(function (c) { return c.esempio; });
  const a = salva('azienda', { nome: 'La mia azienda', ragione: '', piva: '', indirizzo: '', telefono: '', mail: '', pec: '', note: '', media: [], esempio: soloEsempi || undefined });
  valori(db.cantieri).forEach(function (c) { c.azienda = a.codice; salva('cantiere', c); });
  return a;
}

function azienda(id) { return leggiTutto().aziende[id] || null; }
function aziendaPerCodice(codice) {
  return valori(leggiTutto().aziende).find(function (a) { return a.codice === codice; }) || null;
}
function aziendeTutte() {
  return valori(leggiTutto().aziende).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
}
function cantieriDiAzienda(codice) {
  return valori(leggiTutto().cantieri).filter(function (c) { return (c.azienda || '') === codice; });
}
function cantieriSenzaAzienda() {
  const codici = aziendeTutte().map(function (a) { return a.codice; });
  return valori(leggiTutto().cantieri).filter(function (c) { return !c.azienda || codici.indexOf(c.azienda) === -1; });
}
function aziendaDiCantiere(c) { return c && c.azienda ? aziendaPerCodice(c.azienda) : null; }

function sopralluogoDiOggi(codiceCantiere) {
  const oggi = oggiISO();
  return sopralluoghiDi(codiceCantiere).find(function (s) { return s.giorno === oggi; }) || null;
}
/* In una giornata si va in cantiere più volte: ogni passaggio è un sopralluogo suo,
   con la sua ora e il suo verbale. Qui stanno tutti quelli di un giorno, dal primo. */
function sopralluoghiDelGiorno(codiceCantiere, giorno) {
  return sopralluoghiDi(codiceCantiere).filter(function (s) { return s.giorno === giorno; })
    .sort(function (a, b) { return String(a.ora).localeCompare(String(b.ora)); });
}
function sopralluoghiDiOggi(codiceCantiere) { return sopralluoghiDelGiorno(codiceCantiere, oggiISO()); }
// Aperto vuol dire senza verbale fatto.
function sopralluoghiApertiOggi(codiceCantiere) {
  return sopralluoghiDiOggi(codiceCantiere).filter(function (s) { return !s.chiuso; });
}
// Un sopralluogo si può chiamare come si vuole; se non ha un nome vale l'ora.
function nomeSopralluogo(s) { return s ? (String(s.nome || '').trim() || ('sopralluogo delle ' + s.ora)) : ''; }
function sopralluogoPerCodice(codice) {
  return valori(leggiTutto().sopralluoghi).find(function (s) { return s.codice === codice; }) || null;
}
/* Il verbale di giornata: uno per cantiere e per giorno, e tiene dentro i verbali
   dei sopralluoghi di quel giorno. Ha lo stesso archivio degli altri verbali. */
function verbaleDiGiornata(codiceCantiere, giorno) {
  return valori(leggiTutto().verbali).find(function (v) { return v.giornata && v.cantiere === codiceCantiere && v.giorno === giorno; }) || null;
}
function verbaliDiGiornata(codiceCantiere) {
  return valori(leggiTutto().verbali).filter(function (v) { return v.giornata && v.cantiere === codiceCantiere; })
    .sort(function (a, b) { return b.giorno.localeCompare(a.giorno); });
}
/* La giornata è un dato suo: così esiste anche senza sopralluoghi, e si può eliminare
   da sola. Nasce col primo sopralluogo del giorno; le giornate vecchie, di prima che
   il dato esistesse, si ricavano dai sopralluoghi e vanno bene lo stesso. */
function giornataDi(codiceCantiere, giorno) {
  return valori(leggiTutto().giornate).find(function (g) { return g.cantiere === codiceCantiere && g.giorno === giorno; }) || null;
}
function assicuraGiornata(codiceCantiere, giorno) {
  return giornataDi(codiceCantiere, giorno) || salva('giornata', { cantiere: codiceCantiere, giorno: giorno });
}
// I giorni di un cantiere, dal più recente: ognuno con i suoi sopralluoghi e il suo verbale.
/* Com'è messo un cantiere, per l'elenco: "da fare" se ha giornate passate senza
   verbale di giornata; "in corso" (blu) se resta solo quella di oggi; "fatto" quando
   anche oggi ha il verbale, o non c'è niente da compilare. Chiuso resta chiuso. */
function statoCantiere(c) {
  const oggi = oggiISO();
  if (c.stato === 'chiuso') return { pill: 'grigia', nome: 'chiuso', mini: '' };
  const giornate = giornateDi(c.codice);
  const arretrate = giornate.filter(function (g) { return g.giorno < oggi && g.sops.length && !g.verbale; });
  if (arretrate.length) return { pill: 'att', nome: 'da fare', mini: arretrate.length + (arretrate.length === 1 ? ' giornata da chiudere' : ' giornate da chiudere') };
  const diOggi = giornate.find(function (g) { return g.giorno === oggi && g.sops.length; });
  if (diOggi && !diOggi.verbale) {
    const sop = diOggi.sops[0];
    return { pill: 'blu', nome: 'in corso', mini: 'oggi alle ' + oraCorta(sop.ora) + ' · ' + diOggi.sops.reduce(function (t, s) { return t + s.pezzi.length; }, 0) + ' audio' };
  }
  const ultima = giornate.find(function (g) { return g.sops.length; });
  return { pill: 'ok', nome: 'fatto', mini: diOggi ? 'verbale di oggi fatto' : (ultima ? 'ultimo: ' + (nomeGiornoRelativo(ultima.giorno).toLowerCase() + (Date.now() - daISO(ultima.giorno).getTime() > 6 * 86400000 ? ' ' + dataSenzaAnno(ultima.giorno) : '')) : 'nessun sopralluogo') };
}
function giornateDi(codiceCantiere) {
  const per = {};
  valori(leggiTutto().giornate).forEach(function (g) { if (g.cantiere === codiceCantiere) per[g.giorno] = []; });
  sopralluoghiDi(codiceCantiere).forEach(function (s) { (per[s.giorno] = per[s.giorno] || []).push(s); });
  return Object.keys(per).sort(function (a, b) { return b.localeCompare(a); }).map(function (g) {
    return { giorno: g, sops: per[g].sort(function (a, b) { return String(a.ora).localeCompare(String(b.ora)); }), verbale: verbaleDiGiornata(codiceCantiere, g) };
  });
}
function sezioniPiene(sezioni) {
  return CHIAVI_SEZIONI.filter(function (k) { return String(sezioni[k] || '').trim(); });
}
function sezioniVuote() {
  const s = {};
  CHIAVI_SEZIONI.forEach(function (k) { s[k] = ''; });
  s.da_smistare = '';
  return s;
}
function nomeSezione(chiave) {
  const s = SEZIONI.find(function (x) { return x.chiave === chiave; });
  return s ? s.nome : (chiave === 'da_smistare' ? 'Da smistare' : chiave);
}
// Le foto stanno in media, che oggi contiene solo foto ma domani potrebbe contenere altro.
function fotoDi(sop) {
  return (sop && Array.isArray(sop.media) ? sop.media : []).filter(function (m) { return m && m.tipo === 'foto'; });
}
// Le foto vere sono quelle di quello che si vede. Bolle e moduli firme hanno un genere e vanno per conto loro.
function fotoNormali(sop) { return fotoDi(sop).filter(function (f) { return !f.genere; }); }
function documentiDi(sop) { return fotoDi(sop).filter(function (f) { return !!f.genere; }); }
/* I documenti che valgono per tutto il cantiere: nascono in una giornata — quella
   in cui sono stati scansionati, e quel legame non si perde — ma sono marcati, e
   si vedono anche dal cantiere. Tornano dal più recente. */
function documentiDelCantiere(codiceCantiere) {
  const fuori = [];
  sopralluoghiDi(codiceCantiere).forEach(function (s) {
    documentiDi(s).forEach(function (f) { if (f.cantiere) fuori.push({ sop: s, f: f }); });
  });
  return fuori.sort(function (a, b) { return String(b.f.quando).localeCompare(String(a.f.quando)); });
}
// Tutti i documenti del cantiere, da qualunque sopralluogo, dal più recente. A differenza di
// documentiDelCantiere() non filtra per il flag "vale per tutto il cantiere": qui vanno tutti.
function documentiTutti(codiceCantiere, genere) {
  const lista = [];
  sopralluoghiDi(codiceCantiere).forEach(function (s) {
    documentiDi(s).forEach(function (f) { if (!genere || f.genere === genere) lista.push({ sop: s, f: f }); });
  });
  return lista.sort(function (a, b) { return String(b.f.quando).localeCompare(String(a.f.quando)); });
}
function trovaFoto(sop, id) {
  return fotoDi(sop).find(function (f) { return f.id === id; }) || null;
}
// Una foto senza sezione, o con una sezione che non esiste più, va in "Altre osservazioni".
function sezioneFoto(f) {
  return CHIAVI_SEZIONI.indexOf(f.sezione) !== -1 ? f.sezione : SEZIONE_FOTO;
}

/* ============================================================
   I DATI DI ESEMPIO
   Tre cantieri (uno chiuso), due sopralluoghi con le sezioni piene, un
   verbale, una contabilità con quattro righe, un listino di quindici voci.
   Le date sono relative a oggi, così la demo sembra viva anche fra un mese.
   ============================================================ */

function giorniFa(n) { return dataLocaleISO(new Date(Date.now() - n * 86400000)); }

/* ============================================================
   LA COPIA SU GITHUB
   Il testo va su GitHub, l'audio no. Un file JSON sul ramo "dati", scritto
   con un commit via API. Si scrive prima nel telefono, sempre; il commit
   parte dopo, quando c'è rete. Se le due copie litigano vince la più
   recente, documento per documento.
   ============================================================ */

let timerGitHub = null;

function repoGitHub() {
  const loc = leggiLocale();
  if (loc.repo) return loc.repo.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
  // Sulle GitHub Pages il nome del repository è nell'indirizzo: tuonome.github.io/cantieri
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const seg = location.pathname.split('/').filter(Boolean)[0];
  if (m && seg) return m[1] + '/' + seg;
  return '';
}
function githubPronto() {
  const loc = leggiLocale();
  return !!(loc.chiavi.github && repoGitHub());
}
function programmaInvioGitHub() {
  const loc = leggiLocale();
  loc.github.daMandare = true;
  salvaLocale();
  if (!githubPronto()) return;
  clearTimeout(timerGitHub);
  // Si aspetta qualche secondo: dettando si salva dieci volte in un minuto, e un commit basta.
  timerGitHub = setTimeout(function () { inviaGitHub().catch(function () {}); }, 4000);
}

// Il documento con la data di aggiornamento più recente vince, da qualunque parte venga.
function fondiArchivi(locale, remoto) {
  if (!remoto || typeof remoto !== 'object' || !remoto.contatori) return false;
  let cambiato = false;
  const cancellatiLoc = locale.cancellati || {};
  const cancellatiRem = remoto.cancellati || {};
  Object.keys(COLLEZIONI).forEach(function (tipo) {
    const coll = COLLEZIONI[tipo];
    const mia = locale[coll] || (locale[coll] = {});
    const sua = remoto[coll] || {};
    Object.keys(sua).forEach(function (id) {
      const quandoCancellato = cancellatiLoc[id];
      if (quandoCancellato && quandoCancellato >= (sua[id].aggiornato || '')) return;
      if (!mia[id] || (sua[id].aggiornato || '') > (mia[id].aggiornato || '')) { mia[id] = sua[id]; cambiato = true; }
    });
    Object.keys(mia).forEach(function (id) {
      const q = cancellatiRem[id];
      if (q && q >= (mia[id].aggiornato || '')) { delete mia[id]; cambiato = true; }
    });
  });
  Object.keys(remoto.contatori || {}).forEach(function (k) {
    if ((remoto.contatori[k] || 0) > (locale.contatori[k] || 0)) { locale.contatori[k] = remoto.contatori[k]; cambiato = true; }
  });
  Object.keys(cancellatiRem).forEach(function (id) { if (!cancellatiLoc[id]) { cancellatiLoc[id] = cancellatiRem[id]; } });
  locale.cancellati = cancellatiLoc;
  return cambiato;
}

async function scaricaGitHub() {
  const repo = repoGitHub();
  if (!repo || !navigator.onLine) return false;
  /* Il repository dei dati è privato: l'indirizzo "raw" risponde 404 senza token.
     Con il token si passa dall'API, che è la stessa strada della scrittura. */
  const token = leggiLocale().chiavi.github;
  let remoto;
  if (token) {
    const r = await fetch('https://api.github.com/repos/' + repo + '/contents/dati.json?ref=dati&t=' + Date.now(),
      { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    const j = await r.json();
    remoto = JSON.parse(daBase64Utf8(j.content || ''));
  } else {
    const risposta = await fetch('https://raw.githubusercontent.com/' + repo + '/dati/dati.json?t=' + Date.now(), { cache: 'no-store' });
    if (!risposta.ok) throw new Error('GitHub ' + risposta.status);
    remoto = await risposta.json();
  }
  const db = leggiTutto();
  if (!remoto || !remoto.contatori) return false;
  let cambiato;
  if (db.soloEsempio && conta(remoto.cantieri)) {
    // Nel telefono ci sono solo gli esempi e online c'è roba vera: gli esempi si buttano, senza mescolarli.
    DB = completaArchivio(remoto);
    if (!DB.cancellati) DB.cancellati = {};
    if (!DB.relazioni) DB.relazioni = {};
    DB.soloEsempio = false;
    cambiato = true;
  } else {
    cambiato = fondiArchivi(db, remoto);
  }
  if (cambiato) { DB.aggiornato = adessoISO(); persisti(); }
  return cambiato;
}

/* Due archivi sono uguali se lo sono a meno dell'ora dell'ultimo salvataggio,
   che si muove da sola a ogni tocco e non è un dato. Le chiavi si ordinano prima
   di confrontare: due oggetti uguali possono avere le chiavi in ordine diverso. */
function jsonOrdinato(valore) {
  if (valore === null || typeof valore !== 'object') return JSON.stringify(valore);
  if (Array.isArray(valore)) return '[' + valore.map(jsonOrdinato).join(',') + ']';
  const chiavi = Object.keys(valore).sort();
  return '{' + chiavi.map(function (k) { return JSON.stringify(k) + ':' + jsonOrdinato(valore[k]); }).join(',') + '}';
}
function stessiDati(a, b) {
  try {
    const senzaOra = function (o) { const c = Object.assign({}, o); delete c.aggiornato; return jsonOrdinato(c); };
    return senzaOra(a) === senzaOra(b);
  } catch (e) { return false; }
}

/* L'ultima spinta quando la pagina sparisce. Il browser porta a termine una richiesta
   marcata keepalive anche a pagina chiusa, ma solo sotto i 60 KB. Si usa lo sha
   dell'ultima scrittura, perché qui non c'è il tempo di rileggerlo: se è vecchio la
   scrittura fallisce e basta. Il dato resta nel telefono e riparte alla prossima apertura,
   e lì il controllo "è già uguale" evita il commit doppio. */
function salvagenteGitHub() {
  const loc = leggiLocale();
  if (!loc.github.daMandare || !githubPronto() || !navigator.onLine || !loc.github.sha) return;
  let corpo;
  try {
    corpo = JSON.stringify({
      message: 'CANTIERI ' + adessoISO(),
      content: base64Utf8(JSON.stringify(leggiTutto())),
      branch: 'dati',
      sha: loc.github.sha
    });
  } catch (e) { return; }
  if (corpo.length > 60000) return;
  try {
    fetch('https://api.github.com/repos/' + repoGitHub() + '/contents/dati.json', {
      method: 'PUT',
      headers: {
        'Authorization': 'Bearer ' + loc.chiavi.github,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: corpo,
      keepalive: true
    }).catch(function () { /* a pagina chiusa non si può fare altro */ });
  } catch (e) { /* niente da fare: riparte alla prossima apertura */ }
}

async function inviaGitHub() {
  const loc = leggiLocale();
  if (!githubPronto() || !navigator.onLine) return false;
  const repo = repoGitHub();
  const intestazioni = { 'Authorization': 'Bearer ' + loc.chiavi.github, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json' };
  const urlFile = 'https://api.github.com/repos/' + repo + '/contents/dati.json';
  try {
    let sha = null, remoto = null;
    const attuale = await fetch(urlFile + '?ref=dati&t=' + Date.now(), { headers: intestazioni, cache: 'no-store' });
    if (attuale.ok) {
      const j = await attuale.json();
      sha = j.sha;
      try { remoto = JSON.parse(daBase64Utf8(j.content || '')); } catch (e) { remoto = null; }
      // Se online c'è qualcosa di più fresco (un altro telefono), si fonde prima di scrivere sopra.
      if (remoto) fondiArchivi(leggiTutto(), remoto);
    } else if (attuale.status !== 404) {
      throw new Error('GitHub ' + attuale.status);
    }
    const db = leggiTutto();
    // Se online c'è già esattamente questa roba, non si scrive. Un commit identico al
    // precedente non serve a niente, e la storia del repository si porta dietro per
    // sempre una copia intera del file a ogni commit.
    if (remoto && stessiDati(db, remoto)) {
      loc.github.daMandare = false;
      loc.github.ultimoInvio = adessoISO();
      loc.github.errore = null;
      loc.github.sha = sha;
      salvaLocale();
      aggiornaSeDev();
      return true;
    }
    const corpo = { message: 'CANTIERI ' + adessoISO(), content: base64Utf8(JSON.stringify(db)), branch: 'dati' };
    if (sha) corpo.sha = sha;
    const r = await fetch(urlFile, { method: 'PUT', headers: intestazioni, body: JSON.stringify(corpo) });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    // Lo sha nuovo serve al salvagente: alla chiusura non c'è tempo di rileggerlo.
    try { const jr = await r.json(); loc.github.sha = (jr && jr.content && jr.content.sha) || null; } catch (e) { loc.github.sha = null; }
    loc.github.daMandare = false;
    loc.github.ultimoInvio = adessoISO();
    loc.github.errore = null;
    salvaLocale();
    aggiornaSeDev();
    return true;
  } catch (e) {
    loc.github.errore = e.message || String(e);
    salvaLocale();
    aggiornaSeDev();
    return false;
  }
}

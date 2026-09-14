/* CANTIERI — app.js
   Verbali di sopralluogo dettati a voce, contabilità e listino prezzi.
   Un file solo, JavaScript normale, nessuna compilazione.
   I commenti spiegano il perché: il cosa lo dice il codice.

   LA GERARCHIA — le parole si usano sempre così:
     azienda      → chi fa il lavoro; ha i suoi cantieri.
     cantiere     → un lavoro; ha le sue giornate.
     giornata     → un giorno di quel cantiere; ha i suoi sopralluoghi. Esiste anche vuota.
     sopralluogo  → un passaggio della giornata: audio, foto, sezioni. Vive dentro la giornata.
     verbale      → il verbale DI GIORNATA: mette insieme i sopralluoghi del giorno. Uno per giornata.
     verbale di sopralluogo → il PDF di un sopralluogo, da solo.
   Le foto stanno nel sopralluogo che le ha scattate; la giornata le mostra tutte insieme. */
/* CANTIERI — base.js: costanti, misure, modelli, prezzi; utilità di data, ora, numero, testo, h(), codici, id */
'use strict';


/* ============================================================
   COSTANTI CHE SI CAMBIANO IN UNA RIGA
   ============================================================ */

// Il PIN del modo sviluppatore. Va cambiato prima di dare il telefono all'utente.
const PIN = '2211';

// Il modello che riordina il testo. Si cambia qui, o dal modo sviluppatore.
const MODELLO = 'claude-haiku-4-5';

// Versione dell'app: si vede nel modo sviluppatore, per sapere cosa gira sul telefono.
const VERSIONE_APP = '1.0.0';

// Prezzi del modello in dollari per milione di token: servono solo per la stima dei consumi.
const PREZZI = { ingresso: 1.0, uscita: 5.0, cacheLettura: 0.10, cacheScrittura: 2.00 };

// Oltre questo tempo una registrazione si spezza da sola: sopra i 25 MB la trascrizione la rifiuta.
const LIMITE_PEZZO_SECONDI = 40 * 60;

// Nel telefono restano gli audio di questi giorni; i più vecchi vanno scaricati.
const GIORNI_AUDIO = 30;

// Sopra questa quota di spazio occupato si avvisa.
const SOGLIA_SPAZIO = 0.70;

// Attese fra un tentativo e l'altro della coda: tre e poi ci si ferma.
const ATTESE_TENTATIVI = [2000, 8000, 30000];

// Le foto si riducono prima di salvarle, sempre: a piena risoluzione dieci foto riempiono il telefono.
const LATO_FOTO = 1600;
const QUALITA_FOTO = 0.75;
// Nel PDF non serve la qualità dello schermo: si ricomprime ancora.
const LATO_FOTO_PDF = 1200;
const QUALITA_FOTO_PDF = 0.6;
// La sezione in cui finisce una foto se nessuno ne sceglie una.
const SEZIONE_FOTO = 'osservazioni';
/* I documenti scansionati col telefono: una bolla di consegna, il modulo firme degli
   operai. Sono foto anche loro, ma si leggono, quindi si riducono meno e si comprimono
   meno. Vivono nello stesso posto delle foto e si distinguono per il "genere". */
// Il logo e la firma dell'azienda: piccoli ma nitidi, finiscono stampati su un foglio.
const LATO_LOGO = 700;
const LATO_BANDA = 1600;
const QUALITA_LOGO = 0.92;
const LATO_DOC = 2200;
const QUALITA_DOC = 0.82;
const LATO_DOC_PDF = 1700;
const QUALITA_DOC_PDF = 0.7;
// La copia di una bolla che si manda a leggere: più piccola del documento, basta per il testo.
const LATO_LETTURA = 1200;
const QUALITA_LETTURA = 0.8;
// La foto originale, prima del ritaglio: oltre questo lato il telefono finisce la memoria.
const LATO_RITAGLIO = 3000;
const GENERI = { bolla: 'Bolla', firme: 'Registro firme', documento: 'Documento' };
// Sotto una miniatura larga 104 "Registro firme" non ci sta: lì basta la parola.
const GENERI_BREVI = { bolla: 'Bolla', firme: 'Firme', documento: 'Documento' };
// Quale dei due tasti è stato premuto: l'ingresso file è uno solo e non se lo porta dietro.
let DOC_GENERE = 'bolla';
let DOC_PER_CANTIERE = false;
// Logo o firma: l'ingresso file dell'azienda è uno solo e non se lo porta dietro.
let AZ_IMMAGINE = null;

// Le undici sezioni del sopralluogo, nell'ordine deciso. Non si toccano.
const SEZIONI = [
  { chiave: 'lavorazioni_eseguite',     nome: 'Lavorazioni eseguite',              elenco: false },
  { chiave: 'lavorazioni_non_eseguite', nome: 'Lavorazioni non eseguite',          elenco: false },
  { chiave: 'operai',                   nome: 'Operai presenti',                   elenco: true  },
  { chiave: 'attrezzature_presenti',    nome: 'Attrezzature presenti in cantiere', elenco: true  },
  { chiave: 'attrezzature_necessarie',  nome: 'Attrezzature necessarie',           elenco: true  },
  { chiave: 'materiali_impiegati',      nome: 'Materiali impiegati',               elenco: true  },
  { chiave: 'materiali_necessari',      nome: 'Materiali necessari',               elenco: false },
  { chiave: 'rilievi_ordine',           nome: "Rilievi per l'ordine",              elenco: true  },
  { chiave: 'sicurezza',                nome: 'Sicurezza',                         elenco: false },
  { chiave: 'problemi',                 nome: 'Problemi o anomalie',               elenco: false },
  { chiave: 'osservazioni',             nome: 'Altre osservazioni',                elenco: false },
  { chiave: 'note',                     nome: 'Note',                              elenco: false }
];
const CHIAVI_SEZIONI = SEZIONI.map(function (s) { return s.chiave; });

// Le parole che, dette all'inizio di un pezzo corto, lo mandano dritto in una sezione senza chiamare nessuno.
const PAROLE_SEZIONE = {
  lavorazioni_eseguite: ['lavorazioni eseguite', 'lavori eseguiti', 'eseguito', 'fatto oggi', 'lavorazioni fatte'],
  lavorazioni_non_eseguite: ['lavorazioni non eseguite', 'lavori non eseguiti', 'non eseguito', 'non fatto'],
  operai: ['operai', 'operai presenti', 'personale', 'squadra', 'presenti'],
  attrezzature_presenti: ['attrezzature presenti', 'attrezzature in cantiere', 'mezzi presenti', 'mezzi in cantiere'],
  attrezzature_necessarie: ['attrezzature necessarie', 'attrezzature che servono', 'mezzi necessari', 'servono mezzi'],
  materiali_impiegati: ['materiali impiegati', 'materiali usati', 'materiale usato', 'materiale impiegato'],
  materiali_necessari: ['materiali necessari', 'materiali che servono', 'materiale da ordinare', 'da ordinare', 'materiali da ordinare'],
  rilievi_ordine: ['rilievo d\'ordine', 'rilievi d\'ordine', 'rilievo ordine', 'rilievi ordine', 'misure da ordinare', 'rilievo per l\'ordine'],
  sicurezza: ['sicurezza'],
  problemi: ['problemi', 'anomalie', 'problemi o anomalie', 'anomalia', 'problema'],
  osservazioni: ['osservazioni', 'altre osservazioni'],
  note: ['note', 'nota', 'appunti']
};

// Prefissi dei codici automatici e dove sta ogni tipo di documento nell'archivio.
const PREFISSI = { azienda: 'AZ', cantiere: 'CANT', giornata: 'GIO', sopralluogo: 'SOP', verbale: 'VER', voce: 'VOCE', listino: 'LIS', listini: 'PRZ', foto: 'FOTO', relazione: 'REL' };
const COLLEZIONI = { azienda: 'aziende', cantiere: 'cantieri', giornata: 'giornate', sopralluogo: 'sopralluoghi', verbale: 'verbali', listino: 'listino', listini: 'listini', relazione: 'relazioni' };

// Unità di misura: la tabella dei sinonimi si applica in locale, gratis. Claude si chiama solo per quello che manca qui.
const UM_SINONIMI = {
  'm²': ['m2', 'mq', 'metri quadri', 'metro quadro', 'metri quadrati', 'metro quadrato', 'metriquadri', 'metri quadro', 'mq.', 'm^2'],
  'm³': ['m3', 'mc', 'metri cubi', 'metro cubo', 'metricubi', 'mc.', 'm^3'],
  'm':  ['metri', 'metro', 'ml', 'metri lineari', 'metro lineare', 'metrolineare', 'm.'],
  'kg': ['chili', 'chilo', 'chilogrammi', 'chilogrammo', 'kili', 'kilo', 'kg.'],
  'q':  ['quintali', 'quintale', 'q.li', 'ql', 'q.le'],
  't':  ['tonnellate', 'tonnellata', 'ton', 'tonn'],
  'n':  ['numero', 'pezzi', 'pezzo', 'cad', 'cadauno', 'pz', 'n.', 'nr', 'num', 'cad.', 'pz.'],
  'h':  ['ore', 'ora', 'h.', 'hh'],
  'corpo': ['a corpo', 'corpo', 'forfait', 'a forfait', 'a.c.'],
  'l':  ['litri', 'litro', 'lt', 'l.']
};

/* ============================================================
   UTILITÀ
   ============================================================ */

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI_SETT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const GIORNI_BREVI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

// Il testo che finisce nell'HTML passa sempre da qui: un nome di cantiere con un "<" non deve rompere la pagina.
function h(testo) {
  return String(testo == null ? '' : testo)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function nuovoId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function adessoISO() { return new Date().toISOString(); }

// Le date locali si scrivono a mano: toISOString() darebbe il giorno in UTC, e alle 23 sarebbe già domani.
function dataLocaleISO(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function oggiISO() { return dataLocaleISO(new Date()); }
function oraAdesso(d) {
  d = d || new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function daISO(iso) {
  if (!iso) return new Date();
  const p = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2] || 1);
}
function dataEstesa(iso) {
  const d = daISO(iso);
  return GIORNI_SETT[d.getDay()] + ' ' + d.getDate() + ' ' + MESI[d.getMonth()] + ' ' + d.getFullYear();
}
function dataBreve(iso) {
  const d = daISO(iso);
  const g = GIORNI_BREVI[d.getDay()];
  return g.charAt(0).toUpperCase() + g.slice(1) + ' ' + d.getDate() + ' ' + MESI[d.getMonth()];
}
/* 10/09/26: la forma corta che si legge a colpo d'occhio anche in un'etichetta. */
function dataNumerica(iso) {
  const d = daISO(iso);
  const due = function (x) { return (x < 10 ? '0' : '') + x; };
  return due(d.getDate()) + '/' + due(d.getMonth() + 1) + '/' + String(d.getFullYear()).slice(-2);
}
/* 10/09: giorno e mese, senza anno. Sta davanti al titolo di una giornata. */
/* Il primo giorno della settimana è il lunedì. */
function lunedi(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const g = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - g);
  return x;
}
/* Le date pronte dei due momenti in cui si mandano i verbali: fine settimana
   e fine mese. Tornano già scritte come le vuole il campo data. */
function periodoPronto(quale) {
  const oggi = new Date();
  let dal, al;
  if (quale === 'settimana') { dal = lunedi(oggi); al = new Date(dal); al.setDate(al.getDate() + 6); }
  else if (quale === 'settimana-scorsa') { dal = lunedi(oggi); dal.setDate(dal.getDate() - 7); al = new Date(dal); al.setDate(al.getDate() + 6); }
  else if (quale === 'mese') { dal = new Date(oggi.getFullYear(), oggi.getMonth(), 1); al = new Date(oggi.getFullYear(), oggi.getMonth() + 1, 0); }
  else { dal = new Date(oggi.getFullYear(), oggi.getMonth() - 1, 1); al = new Date(oggi.getFullYear(), oggi.getMonth(), 0); }
  return { dal: dataLocaleISO(dal), al: dataLocaleISO(al) };
}

function giornoMese(iso) {
  const d = daISO(iso);
  const due = function (x) { return (x < 10 ? '0' : '') + x; };
  return due(d.getDate()) + '/' + due(d.getMonth() + 1);
}
function dataSenzaAnno(iso) {
  const d = daISO(iso);
  return d.getDate() + ' ' + MESI[d.getMonth()];
}
function titoloMese(iso) {
  const d = daISO(iso);
  const m = MESI[d.getMonth()];
  return m.charAt(0).toUpperCase() + m.slice(1) + ' ' + d.getFullYear();
}
function nomeGiornoRelativo(iso) {
  const oggi = oggiISO();
  if (iso === oggi) return 'Oggi';
  const ieri = dataLocaleISO(new Date(Date.now() - 86400000));
  if (iso === ieri) return 'Ieri';
  const g = GIORNI_SETT[daISO(iso).getDay()];
  return g.charAt(0).toUpperCase() + g.slice(1);
}
function oraDaISO(iso) {
  const d = new Date(iso);
  return isNaN(d) ? '' : oraAdesso(d);
}
function durataBreve(secondi) {
  secondi = Math.max(0, Math.round(secondi || 0));
  const m = Math.floor(secondi / 60), s = secondi % 60;
  return m + ':' + String(s).padStart(2, '0');
}
// Il parlato di un cantiere intero si conta in ore: "2 h 05" si legge, "125:30" no.
function durataLunga(secondi) {
  secondi = Math.max(0, Math.round(secondi || 0));
  if (secondi < 3600) return durataBreve(secondi);
  const o = Math.floor(secondi / 3600), m = Math.floor((secondi % 3600) / 60);
  return o + ' h ' + String(m).padStart(2, '0');
}
function euro(n) {
  n = Number(n) || 0;
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
function numeroIt(n, dec) {
  n = Number(n) || 0;
  return n.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: dec == null ? 2 : dec });
}
function compatto(n) {
  n = Number(n) || 0;
  if (n >= 1000000) return (n / 1000000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'M';
  if (n >= 10000) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + 'k';
  return numeroIt(n, 0);
}
function megabyte(b) { return (b / 1048576).toLocaleString('it-IT', { maximumFractionDigits: 1 }) + ' MB'; }
// Un PDF sta sui 200 KB: dirlo in MB darebbe sempre "0,2 MB". Sotto il mega si scrive in KB.
function pesoFile(b) { return b >= 1048576 ? megabyte(b) : Math.round(b / 1024) + ' KB'; }

// Un numero scritto all'italiana ("1.250,50") o all'inglese ("1,250.50"): si prova a capire quale.
function leggiNumero(testo, decimali, migliaia) {
  if (typeof testo === 'number') return testo;
  let s = String(testo == null ? '' : testo).replace(/[€$\s]/g, '').replace(/[^\d.,\-]/g, '');
  if (!s) return NaN;
  if (decimali === ',' ) { s = s.replace(/\./g, '').replace(',', '.'); }
  else if (decimali === '.') { s = s.replace(/,/g, ''); }
  else {
    // Non si sa: se c'è una virgola dopo l'ultimo punto è la virgola dei decimali, e viceversa.
    const uv = s.lastIndexOf(','), up = s.lastIndexOf('.');
    if (uv > up) s = s.replace(/\./g, '').replace(',', '.');
    else if (up > uv) s = s.replace(/,/g, '');
  }
  if (migliaia === "'" ) s = s.replace(/'/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? NaN : n;
}

function senzaAccenti(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function parole(s) {
  return senzaAccenti(s).replace(/[^a-z0-9àèéìòù²³]+/g, ' ').trim().split(/\s+/).filter(function (p) { return p.length >= 3; });
}
function primaRiga(testo) {
  const r = String(testo || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean);
  return r[0] || '';
}
function conta(obj) { return Object.keys(obj || {}).length; }
// "1 giorno", "2 giorni": la parola giusta accanto a un numero.
function plurale(n, uno, tanti) { return Number(n) === 1 ? uno : tanti; }
function valori(obj) { return Object.keys(obj || {}).map(function (k) { return obj[k]; }); }
function stimaToken(testo) { return Math.ceil(String(testo || '').split(/\s+/).filter(Boolean).length * 1.6); }

// Il modello ogni tanto avvolge il JSON in una recinzione di codice o in una frase: si prende solo l'oggetto.
function estraiJSON(testo) {
  if (!testo) return null;
  let s = String(testo).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a === -1 || b === -1) return null;
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e) { return null; }
}

function normalizzaUmLocale(testo) {
  const t = senzaAccenti(testo).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const chiavi = Object.keys(UM_SINONIMI);
  for (const um of chiavi) {
    if (t === senzaAccenti(um)) return um;
    if (UM_SINONIMI[um].some(function (s) { return senzaAccenti(s) === t; })) return um;
  }
  if (t === 'cm' || t === 'centimetri' || t === 'centimetro') return 'cm';
  if (t === 'mm' || t === 'millimetri' || t === 'millimetro') return 'mm';
  return null;
}

// Il testo di un elenco diventa righe pulite: niente segni davanti, niente righe vuote.
function righeElenco(testo) {
  return String(testo || '').split('\n').map(function (r) { return r.replace(/^\s*[-•*·]\s*/, '').trim(); }).filter(Boolean);
}
function aggiungiTesto(vecchio, nuovo) {
  nuovo = String(nuovo || '').trim();
  if (!nuovo) return vecchio || '';
  vecchio = String(vecchio || '').trim();
  return vecchio ? vecchio + '\n' + nuovo : nuovo;
}
function attendi(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function blobInBase64(blob) {
  return new Promise(function (ok, no) {
    const r = new FileReader();
    r.onload = function () { ok(String(r.result).split(',')[1]); };
    r.onerror = no;
    r.readAsDataURL(blob);
  });
}
// btoa non digerisce le lettere accentate: si passa dai byte UTF-8.
function base64Utf8(testo) {
  const byte = new TextEncoder().encode(testo);
  let s = '';
  for (let i = 0; i < byte.length; i += 0x8000) s += String.fromCharCode.apply(null, byte.subarray(i, i + 0x8000));
  return btoa(s);
}
function daBase64Utf8(b64) {
  const s = atob(String(b64).replace(/\n/g, ''));
  const byte = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) byte[i] = s.charCodeAt(i);
  return new TextDecoder().decode(byte);
}
function estensioneAudio(tipo) {
  tipo = String(tipo || '');
  if (tipo.indexOf('mp4') !== -1 || tipo.indexOf('m4a') !== -1 || tipo.indexOf('aac') !== -1) return 'm4a';
  if (tipo.indexOf('webm') !== -1) return 'webm';
  if (tipo.indexOf('ogg') !== -1) return 'ogg';
  if (tipo.indexOf('wav') !== -1) return 'wav';
  if (tipo.indexOf('mpeg') !== -1 || tipo.indexOf('mp3') !== -1) return 'mp3';
  return 'm4a';
}
function nomeFile(s) {
  return senzaAccenti(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'audio';
}
/* Le azioni dei tocchi (data-az). L'oggetto nasce qui, prima di tutti: ogni file
   ci aggiunge le sue con Object.assign, subito dopo le funzioni che le servono. */
const AZIONI = {};

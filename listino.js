/* CANTIERI — listino.js: listini, import da file, capitoli */
'use strict';

// Cerca per parole dentro un elenco di voci (tutte, se non è detto quali).
function cercaListinoLocale(testo, voci) {
  const p = parole(testo);
  if (!p.length) return [];
  return (voci || listinoTutto()).map(function (v) {
    const pv = parole(v.descrizione);
    let punti = 0;
    p.forEach(function (w) { if (pv.some(function (x) { return x === w || (w.length > 4 && x.indexOf(w) === 0) || (x.length > 4 && w.indexOf(x) === 0); })) punti++; });
    return { voce: v, punti: punti };
  }).filter(function (r) { return r.punti > 0; }).sort(function (a, b) { return b.punti - a.punti; });
}

/* Si cerca un listino alla volta, nell'ordine del cantiere: il primo che dà una
   voce vince, e il Generale è l'ultimo. Dentro ogni listino prima le parole,
   gratis; Claude solo se non trova niente o trova troppo. */
async function trovaVoceListino(descrizione, listini) {
  for (const l of listini) {
    const voce = await trovaVoceIn(descrizione, vociDi(l.codice));
    if (voce) return voce;
  }
  return null;
}
async function trovaVoceIn(descrizione, voci) {
  if (!voci.length) return null;
  const risultati = cercaListinoLocale(descrizione, voci);
  const nParole = parole(descrizione).length;
  // Una sola voce chiara: prende tutte le parole, o stacca nettamente la seconda.
  if (risultati.length === 1 && risultati[0].punti >= Math.min(2, nParole)) return risultati[0].voce;
  if (risultati.length > 1 && risultati[0].punti >= Math.min(2, nParole) && risultati[0].punti >= risultati[1].punti * 2) return risultati[0].voce;
  if (!chiaveAnthropic() || !navigator.onLine) return null;
  const candidate = (risultati.length ? risultati : voci.map(function (v) { return { voce: v }; })).slice(0, 20).map(function (r) { return r.voce; });
  const elenco = candidate.map(function (v, i) { return (i + 1) + '. ' + v.descrizione + ' (' + v.um + ')'; }).join('\n');
  try {
    const risposta = await chiamaClaude(REGOLE_CERCA_VOCE, 'Lavorazione dettata: ' + descrizione + '\n\nVoci del listino:\n' + elenco, 800);
    const m = String(risposta).trim().match(/^\D*(\d+)/);
    if (!m) return null;
    const i = parseInt(m[1], 10) - 1;
    return candidate[i] || null;
  } catch (e) { return null; }
}

async function normalizzaUm(testo) {
  const locale = normalizzaUmLocale(testo);
  if (locale) return locale;
  const t = String(testo || '').trim();
  if (!t || !chiaveAnthropic() || !navigator.onLine) return t;
  try {
    const r = (await chiamaClaude(REGOLE_UM, 'Unità: ' + t, 800)).trim();
    return (r && r !== '?' && r.length <= 6) ? r : t;
  } catch (e) { return t; }
}

/* ---------------- LISTINO ---------------- */
/* Tre schermate: i listini del cantiere, un listino con le sue voci a capitoli,
   il caricamento da file. La rotta è #/listino/<cantiere>[/<listino>[/carica]]. */
let filtroListino = '';
function vistaListino(idCantiere, idListino, sotto) {
  const c = cantiere(idCantiere);
  if (!c) return vistaDashboard();
  if (!idListino) return vistaListini(c);
  const l = leggiTutto().listini[idListino];
  if (!l) return vistaListini(c);
  if (sotto === 'carica') return vistaCaricaListino(c, l);
  const tutte = vociDi(l.codice);
  let html = testata({ indietro: '#/listino/' + c.id, titolo: l.nome, sotto: h([l.riferimento, tutte.length + ' voci', c.nome].filter(Boolean).join(' · ')),
    destra: '<button class="pill cod" data-az="listino-modifica" data-id="' + h(l.id) + '">modifica</button>' });
  html += '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Cerca nella descrizione" value="' + h(filtroListino) + '" data-campo="filtro-listino" autocomplete="off"></div>';
  html += '<div class="modulo"><button class="btn medio" data-az="vai" data-a="#/listino/' + h(c.id) + '/' + h(l.id) + '/carica"><span class="ico ico-documento"></span> Carica da file</button>' +
    // Svuotare tutto in un colpo: un listino sbagliato o di prova si butta senza toccare le voci una per una.
    (tutte.length ? '<button class="btn medio btn-rosso" data-az="listino-svuota" data-id="' + h(l.id) + '" style="margin-top:8px"><span class="ico ico-cestino"></span> Svuota il listino</button>' : '') + '</div>';
  if (filtroListino) {
    // La ricerca guarda tutto, anche dentro i capitoli chiusi: i risultati escono in un elenco solo.
    const voci = cercaListinoLocale(filtroListino, tutte).map(function (r) { return r.voce; });
    html += voci.length ? '<div class="card" style="margin-top:12px">' + voci.slice(0, 200).map(rigaVoceHtml).join('') + '</div>' : '<div class="vuoto-stato">Nessuna voce trovata.</div>';
    if (voci.length > 200) html += '<div class="vuoto-stato">Mostrate le prime 200: cerca per restringere.</div>';
  } else if (tutte.length) {
    /* Le voci per capitolo, in tendine chiuse con il numero sulla linguetta; le voci
       senza capitolo chiudono l'elenco. Stessa griglia delle altre schermate. */
    const capitoli = {};
    tutte.forEach(function (v) { const k = String(v.capitolo || '').trim() || 'Senza capitolo'; (capitoli[k] = capitoli[k] || []).push(v); });
    const nomi = Object.keys(capitoli).filter(function (k) { return k !== 'Senza capitolo'; }).sort(function (a, b) { return a.localeCompare(b); });
    if (capitoli['Senza capitolo']) nomi.push('Senza capitolo');
    html += grigliaTendine(nomi.map(function (k) {
      return tendina('cap-' + l.id + '-' + senzaAccenti(k).replace(/\W+/g, '-'), k, '<div class="card">' + scorrevole(capitoli[k].map(rigaVoceHtml).join('')) + '</div>', capitoli[k].length);
    }));
  } else {
    html += '<div class="vuoto-stato">Il listino è vuoto. Aggiungi una voce, o carica un file.</div>';
  }
  html += '<div class="barra"><button class="az verde" data-az="voce-nuova" data-listino="' + h(l.codice) + '">＋ Aggiungi voce</button></div>';
  return html;
}
function rigaVoceHtml(v) {
  return '<button class="riga" data-az="voce-modifica" data-id="' + h(v.id) + '"><span class="desc">' + h(v.descrizione) + '<small>' + (v.rif ? h(v.rif) + ' · ' : '') + h(v.um || '—') + '</small></span><span class="dx">' + h(euro(v.prezzo)) + '</span></button>';
}
/* I listini che valgono per questo cantiere, nell'ordine in cui si cerca, e sotto
   gli altri. Si toccano per entrare; l'ordine si decide nella scheda del cantiere. */
function vistaListini(c) {
  listinoGeneraleOCrea();
  const miei = listiniDelCantiere(c);
  const altri = listiniTutti().filter(function (l) { return miei.indexOf(l) === -1; });
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Listini', sotto: h(c.nome),
    destra: '<button class="pill cod" data-az="vai" data-a="#/modifica-cantiere/' + h(c.id) + '">scegli</button>' });
  const riga = function (l, i) {
    return '<button class="riga" data-az="vai" data-a="#/listino/' + h(c.id) + '/' + h(l.id) + '"><span class="desc">' + (i != null ? '<span class="targa">' + (i + 1) + '°</span> ' : '') + h(l.nome) +
      '<small>' + h([l.riferimento, vociDi(l.codice).length + ' voci', l.generale ? 'vale per tutti i cantieri' : ''].filter(Boolean).join(' · ')) + '</small></span><span class="frec">›</span></button>';
  };
  html += '<div class="card"><div class="card-capo">Di questo cantiere<span class="dx">in ordine di ricerca</span></div>' + miei.map(riga).join('') + '</div>';
  if (altri.length) html += '<div class="card"><div class="card-capo spenta">Altri listini</div>' + altri.map(function (l) { return riga(l, null); }).join('') + '</div>';
  html += '<div class="barra"><button class="az verde" data-az="listino-nuovo">＋ Nuovo listino</button></div>';
  return html;
}
// Nome e riferimento di un listino: nuovo, o da cambiare.
let LISTINO_APERTO = null;
function apriListinoForm(l) {
  LISTINO_APERTO = l || { nome: '', riferimento: '' };
  apriFoglio(
    '<h2>' + (l ? 'Listino' : 'Nuovo listino') + '</h2>' +
    '<label class="eticampo">Nome</label><input class="campo" id="l-nome" value="' + h(LISTINO_APERTO.nome) + '" placeholder="es. Prezzario regionale" autocomplete="off"' + (l ? '' : ' autofocus') + '>' +
    '<label class="eticampo">Anno o riferimento</label><input class="campo" id="l-rif" value="' + h(LISTINO_APERTO.riferimento || '') + '" placeholder="es. 2026" autocomplete="off">' +
    '<div class="righe"><button class="btn btn-ok" data-az="listino-salva">Salva</button>' +
    (l && !l.generale ? '<button class="btn btn-rosso" data-az="listino-elimina">Elimina</button>' : '') + '</div>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>'
  );
}
function apriVoceListino(v, codiceListino) {
  VOCE_APERTA = v || { descrizione: '', um: '', prezzo: 0, capitolo: '', listino: codiceListino };
  apriFoglio(
    '<h2>' + (v ? 'Voce del listino' : 'Nuova voce') + '</h2>' +
    '<label class="eticampo">Descrizione</label><input class="campo" id="v-desc" value="' + h(VOCE_APERTA.descrizione) + '" autocomplete="off"' + (v ? '' : ' autofocus') + '>' +
    '<div style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Unità</label><input class="campo" id="v-um" value="' + h(VOCE_APERTA.um) + '" placeholder="m², kg, h…" autocomplete="off"></div>' +
    '<div style="flex:1"><label class="eticampo">Prezzo unitario €</label><input class="campo" id="v-prezzo" inputmode="decimal" value="' + h(VOCE_APERTA.prezzo ? numeroIt(VOCE_APERTA.prezzo) : '') + '"></div></div>' +
    '<label class="eticampo">Capitolo</label><input class="campo" id="v-cap" value="' + h(VOCE_APERTA.capitolo || '') + '" placeholder="es. Murature" autocomplete="off">' +
    '<div class="righe"><button class="btn btn-ok" data-az="voce-salva">Salva</button>' + (v ? '<button class="btn btn-rosso" data-az="voce-elimina">Elimina</button>' : '') + '</div>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>'
  );
}
let VOCE_APERTA = null;
async function salvaVoceAperta() {
  const v = VOCE_APERTA;
  v.descrizione = document.getElementById('v-desc').value.trim();
  if (!v.descrizione) { avvisa('Manca la descrizione', 'att'); return; }
  v.um = await normalizzaUm(document.getElementById('v-um').value);
  const p = leggiNumero(document.getElementById('v-prezzo').value, ',');
  v.prezzo = isNaN(p) ? 0 : p;
  v.capitolo = document.getElementById('v-cap').value.trim();
  if (!v.listino) v.listino = listinoGeneraleOCrea().codice;
  salva('listino', v);
  chiudiFoglio();
  avvisa('Salvato', 'ok');
  aggiornaVista();
}

/* ---- caricamento da file: il listino lo legge Claude ----
   Da CSV e TXT come sempre; da Excel con SheetJS; da PDF con testo con pdf.js;
   da PDF scansionato o foto con Claude, una pagina alla volta. Tutte le strade
   portano alle stesse righe, alla stessa conferma e allo stesso import. */
const IMPORT = { passo: 'file', nome: '', righe: [], schema: null, errore: '', esempi: [], daClaude: false, listino: '', confronto: null };
const PAGINE_MAX = 30;

function vistaCaricaListino(c, l) {
  const qui = '#/listino/' + h(c.id) + '/' + h(l.id);
  let html = testata({ indietro: qui, titolo: 'Carica listino', sotto: h(IMPORT.nome ? IMPORT.nome + ' → ' + l.nome : 'in ' + l.nome) });
  if (IMPORT.passo === 'file') {
    html += '<div class="modulo"><p style="color:var(--text-2);margin:8px 0 16px">Scegli il file del prezzario: un foglio di calcolo (CSV, Excel), un PDF, o la foto delle pagine. L\'app legge com\'è fatto e ti chiede solo conferma.</p>' +
      '<input type="file" id="file-listino" accept=".csv,.txt,.xlsx,.xls,.pdf,image/*" multiple hidden data-campo="file-listino" data-listino="' + h(l.codice) + '">' +
      '<button class="btn btn-ok" data-az="scegli-file">Scegli il file</button></div>';
  } else if (IMPORT.passo === 'lettura') {
    html += '<div class="vuoto-stato">' + h(IMPORT.errore || 'Sto leggendo com\'è fatto il file…') + '</div>';
  } else if (IMPORT.passo === 'conferma') {
    const s = IMPORT.schema;
    const int = IMPORT.righe[s.riga_intestazione] || [];
    const nomeCol = function (i) { return i == null || i < 0 ? '—' : 'colonna ' + (i + 1) + (int[i] ? ' “' + int[i] + '”' : ''); };
    html += '<div class="card"><div class="card-capo' + (IMPORT.daClaude ? '' : ' spenta') + '">' + (IMPORT.daClaude ? 'Ho capito così' : 'Scelta a mano') + '</div>' +
      '<div class="card-corpo" style="font-size:17px">Intestazione alla riga ' + (s.riga_intestazione + 1) + '\nDescrizione ← ' + h(nomeCol(s.colonne.descrizione)) + '\nUnità ← ' + h(nomeCol(s.colonne.um)) + '\nPrezzo ← ' + h(nomeCol(s.colonne.prezzo)) + '\nCodice ← ' + h(nomeCol(s.colonne.codice)) + '\nDecimali con ' + (s.decimali === ',' ? 'la virgola' : 'il punto') + '</div>' +
      '<div class="card-capo spenta">Tre righe lette</div>' +
      (IMPORT.esempi.length ? IMPORT.esempi.map(function (e) { return '<div class="riga" style="min-height:52px"><span class="desc">' + h(e.descrizione) + '<small>' + h([e.rif, e.capitolo, e.um || '—'].filter(Boolean).join(' · ')) + '</small></span><span class="dx">' + h(euro(e.prezzo)) + '</span></div>'; }).join('') : '<div class="card-corpo" style="color:var(--gold)">Con queste colonne non esce nessuna riga buona: correggi con “Cambia”.</div>') +
      '</div>';
    if (IMPORT.errore) html += '<div class="avviso">' + h(IMPORT.errore) + '</div>';
    html += '<div class="modulo"><button class="btn btn-ok" data-az="import-carica"' + (IMPORT.esempi.length ? '' : ' disabled') + '>Carica</button>' +
      '<button class="link blocco" data-az="import-cambia" style="margin:8px 0 0">Cambia: scegli le colonne a mano</button></div>';
  } else if (IMPORT.passo === 'manuale') {
    const s = IMPORT.schema;
    const int = IMPORT.righe[s.riga_intestazione] || [];
    const nCol = Math.max.apply(null, IMPORT.righe.slice(0, 40).map(function (r) { return r.length; }).concat([1]));
    const ruoli = [['', 'ignora'], ['descrizione', 'descrizione'], ['um', 'unità'], ['prezzo', 'prezzo'], ['codice', 'codice']];
    html += '<div class="card"><div class="card-capo">Com\'è fatto il file</div>' +
      '<div class="colonna"><span class="nome">Riga di intestazione</span><select class="campo" data-campo="import-intestazione">' +
      IMPORT.righe.slice(0, 40).map(function (r, i) { return '<option value="' + i + '"' + (i === s.riga_intestazione ? ' selected' : '') + '>riga ' + (i + 1) + ': ' + h((r.join(' | ')).slice(0, 30)) + '</option>'; }).join('') + '</select></div>' +
      '<div class="colonna"><span class="nome">Decimali</span><select class="campo" data-campo="import-decimali"><option value=","' + (s.decimali === ',' ? ' selected' : '') + '>virgola (12,50)</option><option value="."' + (s.decimali === '.' ? ' selected' : '') + '>punto (12.50)</option></select></div>';
    for (let i = 0; i < nCol; i++) {
      const ruolo = Object.keys(s.colonne).find(function (k) { return s.colonne[k] === i; }) || '';
      html += '<div class="colonna"><span class="nome">' + (i + 1) + '. ' + h(int[i] || '(senza nome)') + '</span><select class="campo" data-campo="import-colonna" data-indice="' + i + '">' +
        ruoli.map(function (r) { return '<option value="' + r[0] + '"' + (r[0] === ruolo ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></div>';
    }
    html += '<div class="anteprima">' + h(IMPORT.righe.slice(0, 8).map(function (r, i) { return (i + 1) + '  ' + r.join(' | '); }).join('\n')) + '</div></div>';
    html += '<div class="modulo"><button class="btn btn-ok" data-az="import-conferma-manuale">Vedi come viene</button></div>';
  } else if (IMPORT.passo === 'riepilogo') {
    /* Il listino ha già delle voci: prima di scrivere si dice cosa cambia. Le righe
       di contabilità già scritte non si toccano in nessun caso. */
    const k = IMPORT.confronto;
    html += '<div class="card"><div class="card-capo">Cosa cambia in ' + h(l.nome) + '</div>' +
      '<div class="card-corpo" style="font-size:17px">' + k.nuove.length + ' voci nuove\n' + k.uguali + ' uguali\n' + k.cambiate.length + ' cambiate di prezzo</div>' +
      (k.cambiate.length ? '<div class="card-capo spenta">Prezzi che cambiano</div>' + scorrevole(k.cambiate.map(function (x) {
        const pct = x.vecchio.prezzo ? Math.round((x.nuovo.prezzo - x.vecchio.prezzo) / x.vecchio.prezzo * 1000) / 10 : 0;
        return '<div class="riga" style="min-height:52px"><span class="desc">' + h(x.nuovo.descrizione) + '<small>' + h(euro(x.vecchio.prezzo)) + ' → ' + h(euro(x.nuovo.prezzo)) + '</small></span>' +
          '<span class="dx ' + (pct > 0 ? 'att' : '') + '">' + (pct > 0 ? '+' : '') + h(numeroIt(pct, 1)) + '%</span></div>';
      }).join('')) : '') + '</div>';
    html += '<div class="avviso" style="background:var(--surface);border-color:var(--line);color:var(--muted)">Le righe di contabilità già scritte non cambiano: tengono il prezzo che hanno.</div>';
    html += '<div class="modulo"><button class="btn btn-ok" data-az="import-tutto">Importa tutto</button>' +
      '<button class="btn" data-az="import-nuove" style="margin-top:8px"' + (k.nuove.length ? '' : ' disabled') + '>Solo le ' + k.nuove.length + ' voci nuove</button></div>';
  } else if (IMPORT.passo === 'fatto') {
    html += '<div class="card"><div class="card-capo">Caricato</div><div class="card-corpo">' + h(IMPORT.esito) + '</div></div>' +
      '<div class="modulo"><button class="btn btn-ok" data-az="vai" data-a="' + qui + '">Vai al listino</button></div>';
  }
  return html;
}

// Il file si legge come testo, riga per riga; il separatore è quello che compare di più nella prima riga.
function leggiCSV(testo) {
  testo = String(testo).replace(/^\uFEFF/, '');
  const righeGrezze = testo.split(/\r\n|\r|\n/);
  const prima = righeGrezze.find(function (r) { return r.trim(); }) || '';
  const conta = function (ch) { return (prima.split(ch).length - 1); };
  let sep = ';';
  const nV = conta(','), nPV = conta(';'), nT = conta('\t');
  if (nT > nV && nT > nPV) sep = '\t'; else if (nV > nPV) sep = ','; else sep = ';';
  const righe = [];
  let campo = '', riga = [], dentro = false;
  // Un campo fra virgolette può contenere il separatore e gli a capo: si legge carattere per carattere.
  for (let i = 0; i < testo.length; i++) {
    const ch = testo[i];
    if (dentro) {
      if (ch === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else dentro = false; }
      else campo += ch;
    } else if (ch === '"') dentro = true;
    else if (ch === sep) { riga.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && testo[i + 1] === '\n') i++;
      riga.push(campo); campo = '';
      if (riga.some(function (x) { return x.trim(); })) righe.push(riga.map(function (x) { return x.trim(); }));
      riga = [];
    } else campo += ch;
  }
  riga.push(campo);
  if (riga.some(function (x) { return x.trim(); })) righe.push(riga.map(function (x) { return x.trim(); }));
  return righe;
}

/* SheetJS serve solo a leggere un Excel: si scarica la prima volta che serve, da
   cdnjs come pdf.js. */
let SHEETJS = null;
function caricaSheetJs() {
  if (SHEETJS) return SHEETJS;
  SHEETJS = new Promise(function (ok, no) {
    if (window.XLSX) return ok(window.XLSX);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = function () { ok(window.XLSX); };
    s.onerror = function () { SHEETJS = null; no(new Error('serve la rete la prima volta')); };
    document.head.appendChild(s);
  });
  return SHEETJS;
}
// Un foglio Excel diventa righe di celle; se i fogli sono più d'uno si chiede quale.
async function righeDaExcel(file) {
  const XLSX = await caricaSheetJs();
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const nomi = wb.SheetNames.filter(function (n) { return XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 }).length; });
  if (!nomi.length) return [];
  let nome = nomi[0];
  if (nomi.length > 1) {
    nome = await new Promise(function (ok) {
      apriFoglio('<h2>Quale foglio?</h2>' + nomi.map(function (n) { return '<button class="btn" data-az="import-foglio" data-nome="' + h(n) + '">' + h(n) + '</button>'; }).join('') +
        '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>');
      IMPORT.scegliFoglio = ok;
    });
    IMPORT.scegliFoglio = null;
    if (!nome) return null;
  }
  return XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: false, defval: '' })
    .map(function (r) { return r.map(function (x) { return String(x == null ? '' : x).trim(); }); })
    .filter(function (r) { return r.some(Boolean); });
}
/* Il testo di un PDF, riga per riga: i pezzi di testo si mettono insieme per
   altezza, e dentro la riga si stacca una cella dall'altra dove c'è un vuoto.
   Le colonne le dà la riga più piena: ogni cella va nella colonna che comincia
   più vicino a lei, così un titolo di capitolo resta sotto "descrizione". */
async function righeDaPdf(doc) {
  const righe = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const tc = await (await doc.getPage(n)).getTextContent();
    const linee = {};
    tc.items.forEach(function (i) {
      if (!i.str.trim()) return;
      const y = Math.round(i.transform[5] / 3);
      (linee[y] = linee[y] || []).push({ x: i.transform[4], fine: i.transform[4] + i.width, s: i.str });
    });
    Object.keys(linee).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
      const pezzi = linee[y].sort(function (a, b) { return a.x - b.x; });
      const celle = [];
      pezzi.forEach(function (p, i) {
        if (i && p.x - pezzi[i - 1].fine < 6) { celle[celle.length - 1].s += ' ' + p.s; celle[celle.length - 1].fine = p.fine; }
        else celle.push({ x: p.x, fine: p.fine, s: p.s });
      });
      righe.push(celle);
    });
  }
  const guida = righe.reduce(function (m, r) { return r.length > m.length ? r : m; }, []);
  const colonne = guida.map(function (c) { return c.x; });
  return righe.map(function (r) {
    const out = colonne.map(function () { return ''; });
    r.forEach(function (c) {
      let k = 0;
      colonne.forEach(function (x, i) { if (Math.abs(x - c.x) < Math.abs(colonne[k] - c.x)) k = i; });
      out[k] = (out[k] ? out[k] + ' ' : '') + c.s.trim();
    });
    return out;
  }).filter(function (r) { return r.some(Boolean); });
}

async function avviaImportListino(file, codiceListino) {
  IMPORT.nome = file.name;
  IMPORT.listino = codiceListino;
  IMPORT.errore = '';
  IMPORT.daClaude = false;
  IMPORT.confronto = null;
  IMPORT.passo = 'lettura';
  aggiornaVista();
  let righe = null;
  try {
    if (/\.xlsx?$/i.test(file.name)) righe = await righeDaExcel(file);
    else if (ePdf(file)) {
      const lib = await caricaPdfJs();
      const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
      righe = await righeDaPdf(doc);
      // Poco testo vuol dire scansione: le pagine le legge Claude.
      if (righe.reduce(function (t, r) { return t + r.join('').length; }, 0) < 60) { await importaDaImmagini(paginePdf(doc), codiceListino); return; }
    } else if (/^image\//.test(file.type)) { await importaDaImmagini([file], codiceListino); return; }
    else righe = leggiCSV(await file.text());
  } catch (e) { avvisa('Non riesco a leggere il file: ' + e.message, 'err'); IMPORT.passo = 'file'; aggiornaVista(); return; }
  if (righe === null) { IMPORT.passo = 'file'; aggiornaVista(); return; }
  IMPORT.righe = righe;
  if (!IMPORT.righe.length) { avvisa('File vuoto', 'err'); IMPORT.passo = 'file'; aggiornaVista(); return; }
  await leggiSchemaImport();
}
// Le pagine di un PDF, da disegnare una alla volta quando servono (al massimo PAGINE_MAX).
function paginePdf(doc) {
  const pagine = [];
  for (let n = 1; n <= Math.min(doc.numPages, PAGINE_MAX); n++) {
    pagine.push(async function () {
      const pagina = await doc.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const vista = pagina.getViewport({ scale: LATO_LETTURA / Math.max(base.width, base.height) });
      const tela = document.createElement('canvas');
      tela.width = Math.round(vista.width); tela.height = Math.round(vista.height);
      await pagina.render({ canvasContext: tela.getContext('2d'), viewport: vista }).promise;
      return (await blobDaTela(tela, QUALITA_LETTURA)).blob;
    });
  }
  return pagine;
}
/* Le pagine fotografate le legge Claude, una per volta. Prima si dice quante sono
   e quanto costano, e si conferma una volta sola. Le voci lette prendono la strada
   delle righe di un foglio: quattro colonne fisse, e la stessa conferma di sempre. */
async function importaDaImmagini(pagine, codiceListino) {
  pagine = pagine.slice(0, PAGINE_MAX);
  if (!chiaveAnthropic()) { avvisa('Manca la chiave Anthropic', 'err'); IMPORT.passo = 'file'; aggiornaVista(); return; }
  // Una pagina a 1200 px sono circa 1800 token in ingresso; le voci in uscita, circa 1500.
  const spesa = spesaStimata({ ingresso: pagine.length * 1800, uscita: pagine.length * 1500, cacheLettura: 0, cacheScrittura: 0 });
  const ok = await chiedi('Leggo ' + pagine.length + (pagine.length === 1 ? ' pagina' : ' pagine') + '?', 'Le legge Claude una per volta. Spesa stimata: ' + euro(spesa) + '.', 'Leggi');
  chiudiFoglio();
  if (!ok) { IMPORT.passo = 'file'; aggiornaVista(); return; }
  const righe = [['codice', 'descrizione', 'um', 'prezzo']];
  for (let i = 0; i < pagine.length; i++) {
    IMPORT.errore = 'Leggo la pagina ' + (i + 1) + ' di ' + pagine.length + '…';
    aggiornaVista();
    let blob;
    try { blob = typeof pagine[i] === 'function' ? await pagine[i]() : (await riduciFoto(pagine[i], LATO_LETTURA, QUALITA_LETTURA)).blob; }
    catch (e) { avvisa('Pagina ' + (i + 1) + ' non leggibile', 'att'); continue; }
    try {
      const r = estraiJSON(await chiamaClaude(REGOLE_LISTINO_IMMAGINE, [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: await blobInBase64(blob) } }], 4000));
      (r && Array.isArray(r.righe) ? r.righe : []).forEach(function (x) {
        if (!x || !String(x.descrizione || '').trim()) return;
        righe.push([String(x.codice || '').trim(), String(x.descrizione).trim(), String(x.um || '').trim(), x.prezzo == null ? '' : String(x.prezzo)]);
      });
    } catch (e) { avvisa('Pagina ' + (i + 1) + ': ' + e.message, 'err'); }
  }
  IMPORT.errore = '';
  IMPORT.righe = righe;
  if (righe.length < 2) { avvisa('Nessuna voce letta', 'err'); IMPORT.passo = 'file'; aggiornaVista(); return; }
  IMPORT.schema = { riga_intestazione: 0, colonne: { codice: 0, descrizione: 1, um: 2, prezzo: 3 }, decimali: '.', migliaia: null, riga_categoria: 'il prezzo è vuoto' };
  IMPORT.daClaude = true;
  IMPORT.esempi = applicaSchemaListino(IMPORT.righe, IMPORT.schema).slice(0, 3);
  IMPORT.passo = 'conferma';
  aggiornaVista();
}
// Le righe ci sono: Claude dice com'è fatto il file, se no si scelgono le colonne a mano.
async function leggiSchemaImport() {
  const prime = IMPORT.righe.slice(0, 30).map(function (r, i) { return i + ': ' + r.join(' ; '); }).join('\n');
  let schema = null;
  if (chiaveAnthropic() && navigator.onLine) {
    try {
      const risposta = await chiamaClaude(REGOLE_LISTINO, 'Prime righe del file (indice: campi separati da " ; "):\n' + prime, 800);
      schema = estraiJSON(risposta);
    } catch (e) { IMPORT.errore = 'Claude non ha risposto (' + e.message + '): scegli le colonne a mano.'; }
  } else {
    IMPORT.errore = navigator.onLine ? 'Manca la chiave Anthropic: scegli le colonne a mano.' : 'Manca la rete: scegli le colonne a mano.';
  }
  if (schema && schema.colonne) {
    IMPORT.schema = {
      riga_intestazione: Number(schema.riga_intestazione) || 0,
      colonne: { codice: intOrNull(schema.colonne.codice), descrizione: intOrNull(schema.colonne.descrizione), um: intOrNull(schema.colonne.um), prezzo: intOrNull(schema.colonne.prezzo) },
      decimali: schema.decimali === '.' ? '.' : ',',
      migliaia: schema.migliaia || null,
      riga_categoria: schema.riga_categoria || ''
    };
    IMPORT.daClaude = true;
    IMPORT.esempi = applicaSchemaListino(IMPORT.righe, IMPORT.schema).slice(0, 3);
    IMPORT.passo = 'conferma';
  } else {
    IMPORT.schema = indovinaSchemaLocale(IMPORT.righe);
    IMPORT.passo = 'manuale';
  }
  aggiornaVista();
}
function intOrNull(v) { return (v == null || v === '' || isNaN(Number(v))) ? null : Number(v); }

// Senza Claude si parte da un'ipotesi minima: la prima riga con più campi è l'intestazione, e il resto lo sceglie l'uomo.
function indovinaSchemaLocale(righe) {
  let ri = 0, max = 0;
  righe.slice(0, 15).forEach(function (r, i) { const n = r.filter(Boolean).length; if (n > max) { max = n; ri = i; } });
  const int = righe[ri] || [];
  const trova = function (re) { const i = int.findIndex(function (x) { return re.test(senzaAccenti(x)); }); return i === -1 ? null : i; };
  const cp = trova(/prez|importo|euro|€/);
  // Da un Excel i numeri arrivano col punto: se nella colonna del prezzo non c'è mai una virgola, i decimali sono col punto.
  const prezzi = cp == null ? [] : righe.slice(ri + 1, ri + 40).map(function (r) { return r[cp] || ''; });
  const punto = prezzi.some(function (x) { return /^\d+\.\d+$/.test(x); }) && !prezzi.some(function (x) { return /,\d+$/.test(x); });
  return { riga_intestazione: ri, colonne: { codice: trova(/^(cod|codice|art|tariffa)/), descrizione: trova(/descr|voce|lavoraz/), um: trova(/^(u\.?m\.?|unit)/), prezzo: cp }, decimali: punto ? '.' : ',', migliaia: punto ? null : '.', riga_categoria: '' };
}

/* Si applica lo schema a tutto il file, senza altre chiamate.
   Una riga con la descrizione e senza prezzo è un titolo di categoria: diventa il
   capitolo delle voci che seguono. Una riga senza descrizione è rumore: si salta. */
function applicaSchemaListino(righe, s) {
  const out = [];
  const cd = s.colonne.descrizione, cu = s.colonne.um, cp = s.colonne.prezzo, cc = s.colonne.codice;
  if (cd == null || cp == null) return out;
  let capitolo = '';
  for (let i = s.riga_intestazione + 1; i < righe.length; i++) {
    const r = righe[i];
    const desc = (r[cd] || '').trim();
    if (!desc) continue;
    const prezzo = leggiNumero(r[cp], s.decimali, s.migliaia);
    if (isNaN(prezzo) || prezzo <= 0) { if (!(cu != null && (r[cu] || '').trim())) capitolo = desc; continue; }
    const um = cu != null ? normalizzaUmLocale(r[cu] || '') || (r[cu] || '').trim() : '';
    out.push({ descrizione: desc, um: um, prezzo: Math.round(prezzo * 100) / 100, rif: cc != null ? (r[cc] || '').trim() : '', capitolo: capitolo });
  }
  return out;
}
/* Cosa cambierebbe nel listino con queste voci: nuove, uguali, cambiate di prezzo.
   La stessa descrizione vale come la stessa voce. */
function confrontaImport(voci, codiceListino) {
  const esistenti = {};
  vociDi(codiceListino).forEach(function (v) { esistenti[senzaAccenti(v.descrizione)] = v; });
  const k = { nuove: [], uguali: 0, cambiate: [] };
  voci.forEach(function (n) {
    const v = esistenti[senzaAccenti(n.descrizione)];
    if (!v) k.nuove.push(n);
    else if (Math.abs((v.prezzo || 0) - n.prezzo) < 0.005) k.uguali++;
    else k.cambiate.push({ vecchio: v, nuovo: n });
  });
  return k;
}
// Dalla conferma: su un listino pieno prima il riepilogo, su uno vuoto si scrive subito.
function importaListino() {
  const voci = applicaSchemaListino(IMPORT.righe, IMPORT.schema);
  if (!voci.length) { avvisa('Nessuna riga leggibile', 'err'); return; }
  if (vociDi(IMPORT.listino).length) {
    IMPORT.confronto = confrontaImport(voci, IMPORT.listino);
    IMPORT.passo = 'riepilogo';
    aggiornaVista();
    return;
  }
  scriviImport(voci, false);
}
/* Le voci entrano nel listino scelto. La stessa descrizione già presente si
   aggiorna (due voci uguali con prezzi diversi confondono), a meno che si sia
   scelto di prendere solo le nuove. Le righe di contabilità non si toccano. */
function scriviImport(voci, soloNuove) {
  const esistenti = {};
  vociDi(IMPORT.listino).forEach(function (v) { esistenti[senzaAccenti(v.descrizione)] = v; });
  let nuove = 0, aggiornate = 0;
  voci.forEach(function (n) {
    const v = esistenti[senzaAccenti(n.descrizione)];
    if (v) { if (soloNuove) return; v.um = n.um || v.um; v.prezzo = n.prezzo; v.rif = n.rif || v.rif; if (n.capitolo) v.capitolo = n.capitolo; salva('listino', v); aggiornate++; }
    else { salva('listino', { descrizione: n.descrizione, um: n.um, prezzo: n.prezzo, rif: n.rif, capitolo: n.capitolo, listino: IMPORT.listino }); nuove++; }
  });
  IMPORT.esito = 'Lette ' + voci.length + ' voci da ' + IMPORT.nome + ': ' + nuove + ' nuove, ' + aggiornate + ' aggiornate.';
  IMPORT.passo = 'fatto';
  avvisa('Caricato', 'ok');
  aggiornaVista();
}

// Le azioni di questo file.
Object.assign(AZIONI, {
  // --- listino ---
  'voce-nuova': function (el) { apriVoceListino(null, el.dataset.listino); },
  // --- i listini: nuovo, nome, elimina ---
  'listino-nuovo': function () { apriListinoForm(null); },
  'listino-modifica': function (el) { const l = leggiTutto().listini[el.dataset.id]; if (l) apriListinoForm(l); },
  'listino-salva': function () {
    const l = LISTINO_APERTO;
    if (!l) return;
    l.nome = document.getElementById('l-nome').value.trim();
    if (!l.nome) { avvisa('Manca il nome', 'att'); return; }
    l.riferimento = document.getElementById('l-rif').value.trim();
    salva('listini', l);
    LISTINO_APERTO = null;
    chiudiFoglio();
    avvisa('Salvato', 'ok');
    aggiornaVista();
  },
  // Via il listino e le sue voci; i cantieri che lo usavano tornano al Generale. Le righe di contabilità restano.
  'listino-elimina': async function () {
    const l = LISTINO_APERTO;
    if (!l || !l.id || l.generale) return;
    chiudiFoglio();
    const n = vociDi(l.codice).length;
    const ok = await chiedi('Eliminare ' + l.nome + '?', 'Si cancellano il listino e le sue ' + n + ' voci. Le righe di contabilità già scritte restano come sono.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    vociDi(l.codice).forEach(function (v) { cancella('listino', v.id); });
    valori(leggiTutto().cantieri).forEach(function (c) { if (c.listini && c.listini.indexOf(l.codice) !== -1) { c.listini = c.listini.filter(function (k) { return k !== l.codice; }); salva('cantiere', c); } });
    cancella('listini', l.id);
    LISTINO_APERTO = null;
    avvisa('Eliminato', 'ok');
    if (ROTTA.nome === 'listino') vai('#/listino/' + ROTTA.parametri[0]); else aggiornaVista();
  },
  'listino-svuota': async function (el) {
    const l = leggiTutto().listini[el.dataset.id];
    const tutte = l ? vociDi(l.codice) : [];
    if (!tutte.length) return;
    const ok = await chiedi('Svuotare ' + l.nome + '?', 'Si cancellano tutte e ' + tutte.length + ' le voci. Le righe di contabilità già scritte restano come sono, col prezzo che hanno adesso.', 'Svuota il listino', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    tutte.forEach(function (v) { cancella('listino', v.id); });
    filtroListino = '';
    avvisa('Listino svuotato', 'ok');
    aggiornaVista();
  },
  'voce-modifica': function (el) { const v = leggiTutto().listino[el.dataset.id]; if (v) apriVoceListino(v); },
  'voce-salva': function () { if (VOCE_APERTA) salvaVoceAperta(); },
  'voce-elimina': async function () {
    if (!VOCE_APERTA || !VOCE_APERTA.id) return;
    const v = VOCE_APERTA;
    chiudiFoglio();
    const ok = await chiedi('Eliminare la voce?', v.descrizione, 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    cancella('listino', v.id);
    VOCE_APERTA = null;
    avvisa('Eliminata', 'ok');
    aggiornaVista();
  },
  'scegli-file': function () { const f = document.getElementById('file-listino'); if (f) f.click(); },
  'import-carica': function () { importaListino(); },
  'import-tutto': function () { scriviImport(applicaSchemaListino(IMPORT.righe, IMPORT.schema), false); },
  'import-nuove': function () { scriviImport(applicaSchemaListino(IMPORT.righe, IMPORT.schema), true); },
  'import-foglio': function (el) { chiudiFoglio(); if (IMPORT.scegliFoglio) IMPORT.scegliFoglio(el.dataset.nome); },
  'import-cambia': function () { IMPORT.passo = 'manuale'; aggiornaVista(); },
  'import-conferma-manuale': function () {
    IMPORT.daClaude = false;
    IMPORT.errore = (IMPORT.schema.colonne.descrizione == null || IMPORT.schema.colonne.prezzo == null) ? 'Servono almeno la colonna della descrizione e quella del prezzo.' : '';
    IMPORT.esempi = applicaSchemaListino(IMPORT.righe, IMPORT.schema).slice(0, 3);
    IMPORT.passo = 'conferma';
    aggiornaVista();
  },
});

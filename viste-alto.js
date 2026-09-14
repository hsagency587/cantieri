/* CANTIERI — viste-alto.js: aziende, dashboard, scheda cantiere, ricerca generale */
'use strict';

/* La card della settimana chiusa: compare da mercoledì, in cima alla prima schermata,
   e non se ne va finché non la mandi fuori o non dici che ce l'hai già. */
function cardSettimana() {
  const sett = settimanaDaChiudere();
  if (!sett || SETT_CONTO.inizio !== sett.inizio || !(SETT_CONTO.audio || SETT_CONTO.foto)) return '';
  // Una riga sottile e due parole: quello che fa lo spiega la domanda che si apre dopo.
  return '<button class="riga-memoria" data-az="settimana-libera" data-inizio="' + h(sett.inizio) + '" data-fine="' + h(sett.fine) + '">Libera memoria</button>';
}

/* ---------------- DASHBOARD ---------------- */
let filtroCantieri = '';
/* La prima schermata quando c'è almeno un'azienda: l'elenco delle imprese. Chi non la
   vuole la salta dalle impostazioni e trova un tastino piccolo per tornarci. */
function vistaAziende() {
  const aziende = aziendeTutte();
  const orfani = cantieriSenzaAzienda();
  let html = testata({ titolo: 'AZIENDE', grande: true, idTitolo: 'titolo-app', sotto: h(GIORNI_SETT[new Date().getDay()] + ' ' + new Date().getDate() + ' ' + MESI[new Date().getMonth()]),
    destra: '<button class="pill ok" data-az="vai" data-a="#/nuova-azienda">＋ azienda</button>' +
      '<button class="ingranaggio" data-az="vai" data-a="#/impostazioni" aria-label="Impostazioni"><span class="ico ico-ingranaggio"></span></button>' });
  html += cardSettimana();
  /* I cantieri stanno dentro la loro azienda, non in un elenco a parte: si vede subito
     chi ha cosa, e si entra dritti nel cantiere senza passare dalla scheda dell'impresa. */
  const rigaCantiere = function (c) {
    const st = statoCantiere(c);
    return '<button class="riga" data-az="vai" data-a="#/cantiere/' + h(c.id) + '">' +
      '<span class="desc">' + h(c.nome) + '<small>' + h([c.committente, st.mini].filter(Boolean).join(' · ')) + '</small></span>' +
      '<span class="pill ' + st.pill + '">' + h(st.nome) + '</span>' +
      '<span class="frec">›</span></button>';
  };
  /* La riga dell'azienda apre e chiude i suoi cantieri: con più aziende in
     elenco si vedono prima le imprese, e si apre solo quella che serve. Con una
     sola azienda resta aperta, se no ci sarebbe un tocco in più ogni volta.
     La scheda dell'azienda si raggiunge dall'ultima riga di dentro. */
  aziende.forEach(function (a) {
    const cant = cantieriDiAzienda(a.codice).sort(function (x, z) { return x.nome.localeCompare(z.nome); });
    const attivi = cant.filter(function (c) { return c.stato !== 'chiuso'; });
    const daFare = attivi.filter(function (c) { return statoCantiere(c).nome === 'da fare'; }).length;
    const chiave = 'azienda-' + a.codice;
    const memoria = leggiLocale().tendine;
    const aperta = Object.prototype.hasOwnProperty.call(memoria, chiave) ? !!memoria[chiave] : aziende.length === 1;
    /* Due tasti sulla stessa riga: il grosso apre e chiude i cantieri, quello
       piccolo a destra porta dritto nella scheda dell'azienda senza dover
       aprire niente. */
    html += '<div class="card">' +
      '<div class="riga az-capo">' +
      '<button class="apre" data-az="tendina" data-chiave="' + h(chiave) + '" aria-expanded="' + aperta + '">' +
      (a.logo ? '<img class="az-logo" data-foto="' + h(a.logo) + '" alt="">' : '<div class="az-logo vuoto">' + h((a.nome || '?').slice(0, 2).toUpperCase()) + '</div>') +
      '<span class="desc"><b>' + h(a.nome) + '</b><small>' + attivi.length + (attivi.length === 1 ? ' cantiere' : ' cantieri') + (daFare ? ' · ' + daFare + ' da fare' : '') + '</small></span>' +
      '<span class="frec">▶</span></button>' +
      '<button class="pill cod" data-az="vai" data-a="#/azienda/' + h(a.id) + '">apri</button>' +
      '</div>' +
      '<div' + (aperta ? '' : ' hidden') + '>' +
      attivi.map(rigaCantiere).join('') +
      // Ultima riga: "＋ cantiere" a sinistra, i tre puntini dell'azienda dal lato opposto.
      '<div class="riga az-capo"><button class="apre piu" data-az="vai" data-a="#/nuovo-cantiere/' + h(a.id) + '"><span class="desc">＋ cantiere</span></button>' + tastoPunti('azienda-' + a.id) + '</div>' +
      vociPunti('azienda-' + a.id, 'azienda-elimina', 'data-id="' + h(a.id) + '"') +
      '</div></div>';
  });
  if (orfani.length) {
    html += '<div class="eti">' + (aziende.length ? 'Senza azienda' : 'I tuoi cantieri') + ' <span class="n">' + orfani.length + '</span></div>';
    html += '<div class="card">' + orfani.sort(function (x, z) { return x.nome.localeCompare(z.nome); }).map(rigaCantiere).join('') + '</div>';
  }
  if (!aziende.length && !orfani.length) html += '<div class="vuoto-stato">Nessuna azienda e nessun cantiere. Comincia da “＋ azienda”.</div>';
  if (!REG.attiva) html += '<div class="barra"><button class="az verde" data-az="parla-dashboard"><span class="ico ico-microfono"></span> Detta un sopralluogo</button></div>';
  return html;
}

/* La scheda di un'azienda: i dati che finiscono sulla carta intestata, il logo e la firma. */
function vistaAziendaForm(id) {
  const a = id ? azienda(id) : null;
  if (id && !a) return vistaAziende();
  const v = a || { nome: '', ragione: '', tecnico: '', piva: '', indirizzo: '', telefono: '', mail: '', pec: '', sito: '', note: '' };
  let html = testata({ indietro: a ? '#/azienda/' + a.id : '#/', titolo: a ? 'Scheda azienda' : 'Nuova azienda', sotto: a ? h(a.nome) : '' });
  html += '<div class="modulo">' +
    '<label class="eticampo">Nome breve</label><input class="campo" id="a-nome" value="' + h(v.nome) + '" placeholder="es. Edil Rossi" autocomplete="off"' + (a ? '' : ' autofocus') + '>' +
    '<label class="eticampo">Ragione sociale</label><input class="campo" id="a-ragione" value="' + h(v.ragione || '') + '" placeholder="es. Edil Rossi S.r.l." autocomplete="off">' +
    '<label class="eticampo">Tecnico</label><input class="campo" id="a-tecnico" value="' + h(v.tecnico || '') + '" placeholder="es. Geom. Mario Rossi" autocomplete="off">' +
    '<label class="eticampo">Partita IVA</label><input class="campo" id="a-piva" value="' + h(v.piva || '') + '" autocomplete="off">' +
    '<label class="eticampo">Indirizzo</label><input class="campo" id="a-ind" value="' + h(v.indirizzo || '') + '" autocomplete="off">' +
    '<div class="due"><div><label class="eticampo">Telefono</label><input class="campo" id="a-tel" type="tel" value="' + h(v.telefono || '') + '" autocomplete="off"></div>' +
    '<div><label class="eticampo">Mail</label><input class="campo" id="a-mail" type="email" value="' + h(v.mail || '') + '" autocomplete="off"></div></div>' +
    '<div class="due"><div><label class="eticampo">PEC</label><input class="campo" id="a-pec" type="email" value="' + h(v.pec || '') + '" autocomplete="off"></div>' +
    '<div><label class="eticampo">Sito</label><input class="campo" id="a-sito" value="' + h(v.sito || '') + '" placeholder="edilrossi.it" autocomplete="off"></div></div>' +
    '<label class="eticampo">Note</label><textarea class="campo auto" id="a-note" rows="2">' + h(v.note || '') + '</textarea>' +
    '</div>';
  if (a) {
    /* I tecnici dell'azienda (D5): più di uno, ognuno con nome, ruolo e firma sua.
       Alla chiusura di un sopralluogo si sceglie chi ha chiuso, e si usa la sua firma (D6). */
    html += '<div class="card"><div class="card-capo">Tecnici<span class="dx">le firme dei verbali</span></div>' +
      (a.tecnici && a.tecnici.length ? a.tecnici.map(function (t) {
        return '<button class="riga" data-az="tecnico-modifica" data-id="' + h(a.id) + '" data-tecnico="' + h(t.id) + '"><span class="desc">' + h(t.nome) + '<small>' + h(t.ruolo || '—') + ' · ' + (t.firma ? 'firma pronta' : 'senza firma') + '</small></span><span class="frec">›</span></button>';
      }).join('') : '<div class="card-corpo" style="color:var(--muted)">Nessun tecnico ancora.</div>') +
      '<div class="card-piede"><button class="link" style="margin-left:auto" data-az="tecnico-nuovo" data-id="' + h(a.id) + '">＋ aggiungi tecnico</button></div></div>';
    /* La banda intera: l'immagine che il cliente ha già, con dentro logo, dati e
       tutto il resto. Se c'è, va in cima e in fondo a ogni pagina del PDF al posto
       della carta intestata costruita a pezzi. */
    html += '<div class="card"><div class="card-capo">Banda intera<span class="dx">su ogni pagina del PDF</span></div>' +
      '<div class="az-banda"><div class="et">Intestazione</div>' +
      (a.banda ? '<img data-foto="' + h(a.banda) + '" alt="">' : '<div class="vuoto">niente</div>') +
      '<button class="btn medio" data-az="az-immagine" data-id="' + h(a.id) + '" data-quale="banda">' + (a.banda ? 'Cambia' : 'Metti') + '</button></div>' +
      '<div class="az-banda"><div class="et">Piè di pagina</div>' +
      (a.bandaPiede ? '<img data-foto="' + h(a.bandaPiede) + '" alt="">' : '<div class="vuoto">niente</div>') +
      '<button class="btn medio" data-az="az-immagine" data-id="' + h(a.id) + '" data-quale="bandaPiede">' + (a.bandaPiede ? 'Cambia' : 'Metti') + '</button></div>' +
      '<div class="card-piede">PNG largo quanto il foglio. Se c\'è, prende il posto della carta intestata qui sotto.</div></div>';

    html += '<div class="card"><div class="card-capo">Carta intestata<span class="dx">se non c\'è la banda</span></div><div class="card-in az-imm">' +
      '<div class="az-slot"><div class="et">Logo</div>' +
      (a.logo ? '<img data-foto="' + h(a.logo) + '" alt="">' : '<div class="vuoto">niente</div>') +
      '<button class="btn medio" data-az="az-immagine" data-id="' + h(a.id) + '" data-quale="logo">' + (a.logo ? 'Cambia' : 'Metti') + '</button></div>' +
      '</div><div class="card-piede">Il logo va in cima al PDF. La firma in fondo è del tecnico scelto alla chiusura del sopralluogo (qui sopra, Tecnici).</div></div>' +
      '<input type="file" accept="image/*" id="file-azienda" hidden data-campo="file-azienda" data-id="' + h(a.id) + '">' +
      /* Documenti azienda (4.3): loghi, direttive, pdf, brochure — solo qui, mai nei
         documenti di un cantiere o di una giornata (D14). */
      tendinaConAzione('doc-az-' + a.id, 'Documenti azienda',
        ((a.documenti || []).length
          ? '<div class="card">' + scorrevole((a.documenti || []).map(function (d) {
              return '<div class="ordine"><button class="desc" data-az="azienda-doc-apri" data-id="' + h(a.id) + '" data-doc="' + h(d.id) + '">' + h(d.nome || 'Documento') + '<small>' + h(pesoFile(d.peso || 0)) + '</small></button>' +
                '<button class="stato pill cod puntini" data-az="azienda-doc-elimina" data-id="' + h(a.id) + '" data-doc="' + h(d.id) + '" aria-label="Elimina">✕</button></div>';
            }).join('')) + '</div>'
          : '<div class="vuoto-stato">Nessun documento azienda.</div>'),
        '<button class="pill cod" data-az="azienda-doc-inserisci" data-id="' + h(a.id) + '">＋ documento</button>') +
      '<input type="file" accept="image/*,application/pdf" id="file-azienda-doc" hidden data-campo="file-azienda-doc" data-id="' + h(a.id) + '">' +
      '<div class="modulo"><button class="btn btn-rosso" data-az="azienda-elimina" data-id="' + h(a.id) + '">Elimina l\'azienda</button></div>';
  }
  html += '<div class="barra"><button class="az verde" data-az="azienda-salva" data-id="' + h(a ? a.id : '') + '">Salva</button></div>';
  return html;
}

// Il foglio per aggiungere o correggere un tecnico: nome, ruolo, e — solo se già salvato — la firma.
function apriFoglioTecnico(idAzienda, idTecnico) {
  const a = azienda(idAzienda);
  if (!a) return;
  const t = idTecnico ? (a.tecnici || []).find(function (x) { return x.id === idTecnico; }) : null;
  apriFoglio('<h2>' + (t ? 'Modifica tecnico' : 'Nuovo tecnico') + '</h2>' +
    '<label class="eticampo">Nome e cognome</label><input class="campo" id="t-nome" value="' + h(t ? t.nome : '') + '" placeholder="es. Geom. Mario Rossi" autocomplete="off" autofocus>' +
    '<label class="eticampo">Ruolo</label><input class="campo" id="t-ruolo" value="' + h(t ? t.ruolo || '' : '') + '" placeholder="es. Geometra, Ingegnere" autocomplete="off">' +
    (t ? '<label class="eticampo">Firma</label><div class="az-firma">' +
      (t.firma ? '<img data-foto="' + h(t.firma) + '" alt="">' : '<div class="vuoto">niente</div>') +
      '<button class="btn" data-az="tecnico-firma" data-id="' + h(a.id) + '" data-tecnico="' + h(t.id) + '"><span class="ico ico-firma"></span> ' + (t.firma ? 'Cambia la firma' : 'Scansiona la firma') + '</button></div>' : '') +
    '<div class="righe"><button class="btn btn-ok" data-az="tecnico-salva" data-id="' + h(a.id) + '" data-tecnico="' + h(t ? t.id : '') + '">Salva</button>' +
    (t ? '<button class="btn btn-rosso" data-az="tecnico-elimina" data-id="' + h(a.id) + '" data-tecnico="' + h(t.id) + '">Elimina</button>' : '') + '</div>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>');
}

function vistaDashboard(idAzienda) {
  const db = leggiTutto();
  const loc = leggiLocale();
  const oggi = oggiISO();
  // 4.4: senza il campo di ricerca (nascosto per un'azienda) non si filtra: si vedono tutti i suoi cantieri.
  const f = idAzienda ? '' : senzaAccenti(filtroCantieri);
  const base = idAzienda === 'senza' ? cantieriSenzaAzienda() : (idAzienda ? cantieriDiAzienda((azienda(idAzienda) || {}).codice) : valori(db.cantieri));
  const tutti = base.filter(function (c) {
    if (!f) return true;
    return senzaAccenti(c.nome + ' ' + c.committente + ' ' + c.codice + ' ' + (c.indirizzo || '')).indexOf(f) !== -1;
  });
  const attivi = tutti.filter(function (c) { return c.stato !== 'chiuso'; });
  const chiusi = tutti.filter(function (c) { return c.stato === 'chiuso'; });
  const daFare = [], inCorso = [], fatti = [];
  attivi.forEach(function (c) { const n = statoCantiere(c).nome; (n === 'da fare' ? daFare : n === 'in corso' ? inCorso : fatti).push(c); });
  const ordina = function (a, b) { return a.nome.localeCompare(b.nome); };
  daFare.sort(ordina); inCorso.sort(ordina); fatti.sort(ordina); chiusi.sort(ordina);

  const az = idAzienda && idAzienda !== 'senza' ? azienda(idAzienda) : null;
  const senza = idAzienda === 'senza';
  let html;
  if (az || senza) {
    html = testata({ indietro: '#/', titolo: az ? az.nome : 'Senza azienda', sotto: az ? h(az.ragione || '') : 'cantieri non ancora assegnati',
      destra: az ? '<button class="pill cod" data-az="vai" data-a="#/modifica-azienda/' + h(az.id) + '">scheda</button>' : '' });
  } else {
    html = testata({ titolo: 'CANTIERI', grande: true, idTitolo: 'titolo-app', sotto: h(GIORNI_SETT[new Date().getDay()] + ' ' + new Date().getDate() + ' ' + MESI[new Date().getMonth()]),
      destra: '<button class="pill ok" data-az="vai" data-a="#/nuovo-cantiere">＋ cantiere</button>' });
    // Chi ha scelto di saltare le aziende trova qui il modo di tornarci: piccolo, senza colore.
    if (aziendeTutte().length) html += '<button class="link blocco" data-az="vai" data-a="#/aziende" style="text-align:left"><span class="ico ico-edificio"></span> Aziende</button>';
  }
  // 4.4: nella schermata di un'azienda via la ricerca dei cantieri — resta solo su tutti i cantieri.
  if (!az) html += '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Cerca cantiere, committente, indirizzo" value="' + h(filtroCantieri) + '" data-campo="filtro-cantieri" autocomplete="off"></div>';

  if (SPAZIO.avviso) html += '<div class="avviso">Spazio quasi pieno: scarica audio e foto vecchi. <button class="link" data-az="vai" data-a="#/dev" style="min-height:auto">Apri</button></div>';
  if (!navigator.onLine) html += '<div class="avviso">Manca la rete: si registra e si salva lo stesso, la trascrizione parte quando torna.</div>';
  html += cardSettimana();
  const lavoriFalliti = loc.coda.filter(function (l) { return l.stato === 'fallito'; }).length;
  if (lavoriFalliti) html += '<div class="avviso rosso">' + lavoriFalliti + (lavoriFalliti === 1 ? ' lavoro non riuscito' : ' lavori non riusciti') + ': guarda la coda nel modo sviluppatore.</div>';

  function cardCantiere(c) {
    const st = statoCantiere(c);
    const stato = '<span class="pill ' + st.pill + '">' + h(st.nome) + '</span>', mini = st.mini;
    /* Due righe invece di tre: il nome con lo stato in fondo alla sua riga,
       e sotto tutto il resto in una frase sola. A destra non resta vuoto. */
    // I tre puntini in fondo alla riga del titolo; la voce Elimina scende sotto, nella card.
    return '<div class="card tocca" data-az="vai" data-a="#/cantiere/' + h(c.id) + '"><div class="card-in cant">' +
      '<p class="titolo">' + h(c.nome) + '</p>' + stato + tastoPunti('cantiere-' + c.id) +
      '<div class="sotto">' + [h(c.committente), c.indirizzo ? h(c.indirizzo) : '', h(mini)].filter(Boolean).join(' · ') + '</div>' +
      '</div>' + vociPunti('cantiere-' + c.id, 'cantiere-elimina', 'data-id="' + h(c.id) + '"') + '</div>';
  }
  /* Sotto la ricerca, una riga sola: il cantiere nuovo si prende tre quarti,
     la ricerca nei documenti l'ultimo quarto. */
  html += '<div class="duetasti">' +
    (az ? '<button class="btn piucantiere" data-az="vai" data-a="#/nuovo-cantiere/' + h(az.id) + '">＋ Nuovo cantiere</button>'
        : '<button class="btn piucantiere" data-az="vai" data-a="#/nuovo-cantiere">＋ Nuovo cantiere</button>') +
    '<button class="btn cercadoc" data-az="vai" data-a="#/cerca"><span class="ico ico-lente"></span> documenti</button>' +
    '</div>';
  if (!attivi.length && !chiusi.length) {
    html += '<div class="vuoto-stato">' + (f ? 'Nessun cantiere trovato.' : 'Nessun cantiere. Tocca “＋ cantiere” per aprirne uno.') + '</div>';
  }
  if (daFare.length) html += '<div class="eti">Da fare <span class="n">' + daFare.length + '</span></div>' + daFare.map(cardCantiere).join('');
  if (inCorso.length) html += '<div class="eti">In corso <span class="n">' + inCorso.length + '</span></div>' + inCorso.map(cardCantiere).join('');
  if (fatti.length) html += '<div class="eti">Fatti <span class="n">' + fatti.length + '</span></div>' + fatti.map(cardCantiere).join('');
  if (chiusi.length) html += tendina('chiusi', 'Cantieri chiusi (' + chiusi.length + ')', chiusi.map(cardCantiere).join(''));
  if (!REG.attiva) html += '<div class="barra"><button class="az verde" data-az="parla-dashboard"' + (idAzienda ? ' data-azienda="' + h(idAzienda) + '"' : '') + '><span class="ico ico-microfono"></span> Detta un sopralluogo</button></div>';
  return html;
}

/* ---------------- CANTIERE: le sei tendine (rework 14/09/2026) ---------------- */
/* Una tendina come tendina(), con un secondo tasto piccolo sulla stessa riga:
   "Rileva bolla" (Bolle), "＋ documento" (Documenti), "＋ crea" (Rilevamento
   d'ordine). Stessa misura delle altre tendine: niente numero (non richiesto),
   il tasto .tend resta un .tend, il tasto piccolo gli sta a fianco senza
   ingrandire la riga (vedi .tend-riga in stile.css). */
function tendinaConAzione(chiave, etichetta, contenuto, azioneHtml) {
  const aperta = !!leggiLocale().tendine[chiave];
  return '<div class="tend-riga">' +
    '<button class="tend" data-az="tendina" data-chiave="' + h(chiave) + '" aria-expanded="' + aperta + '">' +
    '<span class="frec">▶</span> <span class="et">' + h(etichetta) + '</span></button>' +
    azioneHtml + '</div>' +
    '<div' + (aperta ? '' : ' hidden') + '>' + contenuto + '</div>';
}

// La riga di un documento (bolla, registro firme, documento generale): niente più fornitore/numero letti, l'OCR è tolto.
function rigaDocumentoHtml(v) {
  const f = v.f;
  return '<button class="riga" data-az="vai" data-a="#/foto/' + h(v.sop.id) + '/' + h(f.id) + '">' +
    '<span class="desc">' + h(GENERI[f.genere] || 'Documento') +
    '<small>' + h(dataSenzaAnno(f.giorno)) + ', ' + h(oraCorta(f.ora)) + (f.formato === 'pdf' ? ' · ' + h(paginePdf(f)) : '') + '</small></span>' +
    '<span class="frec">›</span></button>';
}

/* ---- Tendina 1: Verbali ---- */
// Sopralluoghi, verbali di giornata e verbali settimanali di tutto il cantiere, in un elenco solo.
function verbaliCercabili(c) {
  const lista = [];
  valori(leggiTutto().verbali).forEach(function (v) {
    if (v.cantiere !== c.codice) return;
    lista.push({ tipo: v.giornata ? 'giornata' : 'sopralluogo', v: v, giorno: v.giorno });
  });
  pdfDi(c.codice).filter(function (p) { return p.tipo === 'periodo'; }).forEach(function (p) {
    const k = String(p.chiave || '').split(':');
    lista.push({ tipo: 'settimana', pdf: p, giorno: k[3] || p.giorno, dal: k[2] || '', al: k[3] || '' });
  });
  return lista.sort(function (a, b) { return String(b.giorno).localeCompare(String(a.giorno)); });
}
function rigaVerbaleCercabileHtml(x) {
  if (x.tipo === 'settimana') {
    return '<button class="riga" data-az="vai" data-a="#/leggi/' + h(x.pdf.id) + '"><span class="desc">Settimana ' + h(giornoMese(x.dal) + ' – ' + giornoMese(x.al)) + '<small>verbale settimanale</small></span><span class="frec">›</span></button>';
  }
  const s = x.tipo === 'sopralluogo' ? valori(leggiTutto().sopralluoghi).find(function (z) { return z.codice === x.v.sopralluogo; }) : null;
  const a = x.tipo === 'giornata' ? '#/verbale/' + h(x.v.id) : (s ? '#/giorno/' + h(s.id) : '#/verbale/' + h(x.v.id));
  return '<button class="riga" data-az="vai" data-a="' + a + '"><span class="desc">' + h(titoloVerbale(x.v, true)) +
    '<small>' + (x.tipo === 'giornata' ? 'verbale di giornata' : 'verbale di sopralluogo') + ' · ' + h(dataSenzaAnno(x.giorno)) + '</small></span><span class="frec">›</span></button>';
}
let filtroVerbaliCant = '';
let selVerbaliCant = { sopralluogo: false, giornata: false, settimana: false };
function tendinaVerbaliCantiere(c) {
  const tutti = verbaliCercabili(c);
  const q = senzaAccenti(filtroVerbaliCant.trim());
  const attivi = ['sopralluogo', 'giornata', 'settimana'].filter(function (k) { return selVerbaliCant[k]; });
  // D13: nessun selettore acceso = si cerca in tutti i documenti.
  const filtrati = tutti.filter(function (x) {
    if (attivi.length && attivi.indexOf(x.tipo) === -1) return false;
    if (q && senzaAccenti(titoloVerbale(x.tipo === 'settimana' ? { nome: 'Settimana ' + x.dal + ' ' + x.al } : x.v, true)).indexOf(q) === -1) return false;
    return true;
  });
  const pill = function (k, etichetta) { return '<button class="pill cod' + (selVerbaliCant[k] ? ' on' : '') + '" data-az="verbali-cant-sel" data-sel="' + k + '">' + etichetta + '</button>'; };
  let html = '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Cerca nei verbali" value="' + h(filtroVerbaliCant) + '" data-campo="filtro-verbali-cant" autocomplete="off"></div>' +
    '<div class="periodi">' + pill('sopralluogo', 'sopralluoghi') + pill('giornata', 'giornata') + pill('settimana', 'settimana') + '</div>';
  html += filtrati.length ? '<div class="card">' + scorrevole(filtrati.map(rigaVerbaleCercabileHtml).join('')) + '</div>' : '<div class="vuoto-stato">' + (tutti.length ? 'Nessun verbale con questi filtri.' : 'Nessun verbale ancora.') + '</div>';
  return tendina('verbali-' + c.id, 'Verbali', html, tutti.length);
}

/* ---- Tendina 2: Giornate ---- */
// La stessa riga-giorno di sempre, spostata qui dentro: contenuto identico, solo il posto cambia.
function giorniCantiereHtml(c, lista, oggi) {
  let html = '', meseCorrente = null;
  lista.forEach(function (g) {
    const mese = g.giorno.slice(0, 7);
    if (mese !== meseCorrente) { if (meseCorrente) html += '</div>'; html += '<div class="card mese">'; meseCorrente = mese; }
    const piene = CHIAVI_SEZIONI.filter(function (k) { return g.sops.some(function (s) { return String(s.sezioni[k] || '').trim(); }); }).length;
    const audio = g.sops.reduce(function (t, s) { return t + s.pezzi.length; }, 0);
    const anteprima = g.sops.map(function (s) {
      return CHIAVI_SEZIONI.map(function (k) { return primaRiga(s.sezioni[k]); }).filter(Boolean)[0] || (s.sezioni.da_smistare ? primaRiga(s.sezioni.da_smistare) : '');
    }).filter(Boolean)[0] || (audio ? 'trascrizione in arrivo…' : 'ancora niente');
    let pill;
    if (g.verbale) pill = '<span class="pill ok">' + h(g.verbale.nome || 'verbale di giornata') + '</span>';
    else if (g.giorno === oggi) pill = '<span class="pill blu">in corso</span>';
    else pill = '<span class="pill att">da chiudere</span>';
    const apre = g.sops.length ? '#/giorno/' + g.sops[0].id : '#/giornata/' + giornataDi(c.codice, g.giorno).id;
    const chiavePunti = 'giornata-' + c.codice + '-' + g.giorno;
    html += '<div class="giorno' + (g.giorno === oggi && !g.verbale ? ' oggi' : '') + '" data-az="vai" data-a="' + h(apre) + '">' +
      '<div class="n"><div class="titolo"><span class="gm">' + h(giornoMese(g.giorno)) + '</span> ' + h(nomeGiornoRelativo(g.giorno)) + ' · ' + g.sops.length + (g.sops.length === 1 ? ' sopralluogo' : ' sopralluoghi') + '</div>' +
      '<div class="prima">' + h(anteprima) + '</div>' +
      '<div class="stat">' + pill + '<span class="mini">' + piene + '/' + CHIAVI_SEZIONI.length + ' sezioni · ' + audio + ' audio</span>' + tastoPunti(chiavePunti) + '</div></div></div>' +
      vociPunti(chiavePunti, 'giornata-elimina', 'data-cantiere="' + h(c.id) + '" data-giorno="' + h(g.giorno) + '"');
  });
  if (meseCorrente) html += '</div>';
  return html;
}
// Sopra le giornate, i verbali di giornata della settimana in corso, in verticale (come le vecchie liste audio).
function tendinaGiornateCantiere(c, oggi) {
  const lunedi = lunediDi(oggi);
  const lista = giornateDi(c.codice).filter(function (g) { return g.giorno >= lunedi; });
  const verbaliSett = verbaliDiGiornata(c.codice).filter(function (v) { return v.giorno >= lunedi; });
  let html = '';
  if (verbaliSett.length) {
    html += '<div class="card"><div class="card-capo">Verbali di giornata<span class="dx">' + verbaliSett.length + '</span></div>' +
      scorrevole(verbaliSett.map(function (v) {
        return '<button class="riga" data-az="vai" data-a="#/verbale/' + h(v.id) + '"><span class="desc">' + h(titoloVerbale(v, true)) + '<small>' + h(dataSenzaAnno(v.giorno)) + '</small></span><span class="frec">›</span></button>';
      }).join('')) + '</div>';
  }
  html += lista.length ? giorniCantiereHtml(c, lista, oggi) : '<div class="vuoto-stato">Nessun giorno questa settimana.</div>';
  return tendina('giornate-' + c.id, 'Giornate', html, lista.length);
}

/* ---- Tendina 3: Foto — Tendina 4: Bolle (stesso principio, filtri per giorno/settimana) ---- */
function fotoTutteCantiere(c) {
  const lista = [];
  sopralluoghiDi(c.codice).forEach(function (s) { fotoNormali(s).forEach(function (f) { lista.push({ sop: s, f: f, giorno: s.giorno }); }); });
  return lista.sort(function (a, b) { return String(b.f.quando).localeCompare(String(a.f.quando)); });
}
/* Tre stati fissi, non un elenco di ogni giorno/settimana passati: tutte (se richiesta),
   giorno (oggi), settimana (quella corrente, da lunedì). Un tocco, un filtro solo. */
function pilloleGiornoSettimana(chiave, sel, conTutte) {
  const pill = function (tipo, etichetta) {
    const attivo = tipo === 'tutte' ? (!sel.giorno && !sel.settimana) : tipo === 'giorno' ? !!sel.giorno : !!sel.settimana;
    return '<button class="pill cod' + (attivo ? ' on' : '') + '" data-az="' + chiave + '-filtro" data-tipo="' + tipo + '">' + etichetta + '</button>';
  };
  return '<div class="periodi">' + (conTutte ? pill('tutte', 'tutte') : '') + pill('giorno', 'giorno') + pill('settimana', 'settimana') + '</div>';
}
let selFotoCant = { giorno: '', settimana: '' };
function tendinaFotoCantiere(c) {
  const tutti = fotoTutteCantiere(c);
  let lista = tutti;
  if (selFotoCant.giorno) lista = lista.filter(function (x) { return x.giorno === selFotoCant.giorno; });
  else if (selFotoCant.settimana) lista = lista.filter(function (x) { return lunediDi(x.giorno) === selFotoCant.settimana; });
  const html = pilloleGiornoSettimana('foto-cant', selFotoCant, true) +
    (lista.length ? filaFoto(null, lista, {}) : '<div class="vuoto-stato">' + (tutti.length ? 'Nessuna foto con questo filtro.' : 'Nessuna foto ancora.') + '</div>');
  return tendina('foto-cant-' + c.id, 'Foto', html, tutti.length);
}
let filtroBolleCant = '';
// Niente "tutte" qui: solo giorno e settimana, non c'è un'altra categoria con cui contrastarla.
let selBolleCant = { giorno: '', settimana: '' };
function tendinaBolleCantiere(c) {
  const tutti = documentiTutti(c.codice, 'bolla');
  let lista = tutti;
  const q = senzaAccenti(filtroBolleCant.trim());
  if (q) lista = lista.filter(function (x) { return senzaAccenti(x.f.referto || '').indexOf(q) !== -1; });
  if (selBolleCant.giorno) lista = lista.filter(function (x) { return x.f.giorno === selBolleCant.giorno; });
  else if (selBolleCant.settimana) lista = lista.filter(function (x) { return lunediDi(x.f.giorno) === selBolleCant.settimana; });
  let html = '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Cerca nelle bolle" value="' + h(filtroBolleCant) + '" data-campo="filtro-bolle-cant" autocomplete="off"></div>';
  html += pilloleGiornoSettimana('bolle-cant', selBolleCant, false);
  html += lista.length ? '<div class="card">' + scorrevole(lista.map(rigaDocumentoHtml).join('')) + '</div>' : '<div class="vuoto-stato">Nessuna bolla con questi filtri.</div>';
  const azione = '<button class="pill cod" data-az="doc-scansiona" data-cantiere="' + h(c.id) + '" data-genere="bolla">Rileva bolla</button>';
  return tendinaConAzione('bolle-cant-' + c.id, 'Bolle', html, azione);
}

/* ---- Tendina 5: Documenti ---- */
// Documenti del cantiere che non sono verbali, non sono bolle, non sono documenti azienda:
// registro firme (presenze) e documenti generali. I nomi delle categorie sono un segnaposto (Fase 6.7).
function documentiGeneraliCantiere(c) {
  const lista = [];
  sopralluoghiDi(c.codice).forEach(function (s) { documentiDi(s).forEach(function (f) { if (f.genere === 'firme' || f.genere === 'documento') lista.push({ sop: s, f: f }); }); });
  return lista.sort(function (a, b) { return String(b.f.quando).localeCompare(String(a.f.quando)); });
}
let filtroDocCant = '';
let selDocCant = 'tutti';
function tendinaDocumentiCantiere(c) {
  const tutti = documentiGeneraliCantiere(c);
  let lista = selDocCant === 'presenze' ? tutti.filter(function (x) { return x.f.genere === 'firme'; })
    : selDocCant === 'generali' ? tutti.filter(function (x) { return x.f.genere === 'documento'; }) : tutti;
  const q = senzaAccenti(filtroDocCant.trim());
  if (q) lista = lista.filter(function (x) { return senzaAccenti((GENERI[x.f.genere] || '') + ' ' + (x.f.referto || '')).indexOf(q) !== -1; });
  const pill = function (k, etichetta) { return '<button class="pill cod' + (selDocCant === k ? ' on' : '') + '" data-az="doc-cant-sel" data-sel="' + k + '">' + etichetta + '</button>'; };
  let html = '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Cerca nei documenti" value="' + h(filtroDocCant) + '" data-campo="filtro-doc-cant" autocomplete="off"></div>';
  html += '<div class="periodi">' + pill('tutti', 'tutti') + pill('presenze', 'presenze') + pill('generali', 'documenti generali') + '</div>';
  html += lista.length ? '<div class="card">' + scorrevole(lista.map(rigaDocumentoHtml).join('')) + '</div>' : '<div class="vuoto-stato">Nessun documento con questi filtri.</div>';
  const azione = '<button class="pill cod" data-az="doc-cant-inserisci" data-id="' + h(c.id) + '">＋ documento</button>';
  return tendinaConAzione('doc-cant-' + c.id, 'Documenti', html, azione);
}

/* ---- Tendina 6: Rilevamento d'ordine ---- */
/* Il testo dettato (sop.sezioni.rilievi_ordine) letto da ogni sopralluogo del cantiere,
   dal più recente: non una copia, lo stesso contenuto della giornata e del verbale (D8).
   Niente filtri: solo ordinamento per data e ricerca. */
function rilieviOrdineTutti(c) {
  const lista = [];
  sopralluoghiDi(c.codice).forEach(function (s) {
    const t = String(s.sezioni.rilievi_ordine || '').trim();
    if (t) lista.push({ sop: s, testo: t, giorno: s.giorno });
  });
  return lista.sort(function (a, b) { return String(b.giorno).localeCompare(String(a.giorno)); });
}
let filtroRilieviCant = '';
function tendinaRilievoOrdineCantiere(c) {
  const tutti = rilieviOrdineTutti(c);
  const q = senzaAccenti(filtroRilieviCant.trim());
  const lista = q ? tutti.filter(function (x) { return senzaAccenti(dataSenzaAnno(x.giorno)).indexOf(q) !== -1; }) : tutti;
  let html = '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Cerca per data" value="' + h(filtroRilieviCant) + '" data-campo="filtro-rilievi-cant" autocomplete="off"></div>';
  html += lista.length ? '<div class="card">' + scorrevole(lista.map(function (x) {
    return '<button class="riga" data-az="vai" data-a="#/giorno/' + h(x.sop.id) + '"><span class="desc">' + h(dataEstesa(x.giorno)) + '<small>' + h(primaRiga(x.testo)) + '</small></span><span class="frec">›</span></button>';
  }).join('')) + '</div>' : '<div class="vuoto-stato">' + (tutti.length ? 'Nessun rilevamento con questa data.' : 'Nessun rilevamento ancora.') + '</div>';
  const azione = '<button class="pill cod" data-az="crea-rilevamento" data-id="' + h(c.id) + '">＋ crea</button>';
  return tendinaConAzione('rilord-cant-' + c.id, "Rilevamento d'ordine", html, azione);
}

/* ---------------- CANTIERE: la pagina ---------------- */
function vistaCantiere(id) {
  const c = cantiere(id);
  if (!c) return vistaDashboard();
  const loc = leggiLocale();
  loc.ultimoCantiere = c.id; salvaLocale();
  const sops = sopralluoghiDi(c.codice);
  const nVerbali = sops.filter(function (s) { return s.chiuso; }).length;
  const oggi = oggiISO();
  /* Committente e indirizzo stanno su una riga sola sotto il titolo. Resta com'è (6.1). */
  let html = testata({ indietro: '#/', titolo: c.nome,
    sotto: h(c.committente) + (c.indirizzo ? ' · ' + h(c.indirizzo) : ''),
    destra: '<button class="pill ' + (c.stato === 'chiuso' ? 'grigia' : 'cod') + '" data-az="vai" data-a="#/modifica-cantiere/' + h(c.id) + '">' + (c.stato === 'chiuso' ? 'chiuso' : 'modifica') + '</button>' });
  // Due box, non più tre: via la contabilità (6.1, D1).
  html += '<div class="numeri"><div class="n"><div class="v">' + giornateDi(c.codice).length + '</div><div class="k">' + plurale(giornateDi(c.codice).length, 'giorno', 'giorni') + '</div></div>' +
    '<div class="n"><div class="v">' + nVerbali + '</div><div class="k">' + plurale(nVerbali, 'verbale', 'verbali') + '</div></div></div>';
  // Un cantiere chiuso ha la sua relazione in testa, prima di tutto: resta com'era.
  const rel = c.stato === 'chiuso' ? relazioneDi(c.codice) : null;
  if (c.stato === 'chiuso') {
    if (rel) {
      const pdfRel = pdfConChiave('relazione:' + rel.codice);
      html += '<div class="card tocca" data-az="vai" data-a="#/relazione/' + h(rel.id) + '"><div class="card-in"><p class="titolo">Relazione di fine cantiere</p><div class="sotto">chiuso il ' + h(dataEstesa(rel.chiusura)) + '</div>' +
        '<div class="fila"><span class="pill ok">chiuso</span><span class="mini">' + rel.giorni.length + ' ' + plurale(rel.giorni.length, 'giorno', 'giorni') + '</span></div></div>' +
        '<div class="griglia tre">' +
        '<button class="btn" data-az="vai" data-a="' + (pdfRel ? '#/leggi/' + h(pdfRel.id) : '#/relazione/' + h(rel.id)) + '">Visualizza</button>' +
        tastoEsporta('rel-' + rel.id) +
        '<button class="btn" data-az="vai" data-a="#/modifica-relazione/' + h(rel.id) + '">Correggi</button></div>' + vociEsporta('rel-' + rel.id, 'esporta-pdf-relazione', rel.id, 'relazione-scarica', rel.id) + '</div>';
    }
    else html += '<div class="card tocca piu" data-az="relazione-genera" data-id="' + h(c.id) + '"><div class="card-in"><p class="titolo">＋ Scrivi la relazione di fine cantiere</p><div class="sotto">il riepilogo di tutti i giorni</div></div></div>';
  }
  // Le due card "＋": resta com'era.
  const adesso = new Date();
  const finestraSettimana = adesso.getDay() === 0 || (adesso.getDay() === 6 && adesso.getHours() >= 10);
  const cardOggi = !sops.some(function (s) { return s.giorno === oggi; }) && c.stato !== 'chiuso'
    ? '<div class="card tocca piu" data-az="nuovo-sopralluogo" data-id="' + h(c.id) + '"><div class="card-in"><p class="titolo">＋ Sopralluogo di oggi</p></div></div>' : '';
  const cardSett = finestraSettimana && c.stato !== 'chiuso' && verbaliDiGiornata(c.codice).filter(function (v) { return v.giorno >= lunediDi(oggi) && v.giorno <= oggi; }).length >= 2 && !pdfConChiave('periodo:' + c.codice + ':' + lunediDi(oggi) + ':' + oggi)
    ? '<div class="card tocca piu" data-az="settimana-verbale" data-id="' + h(c.id) + '"><div class="card-in"><p class="titolo">＋ Verbale settimanale</p></div></div>' : '';
  html += cardOggi && cardSett ? '<div class="due-card">' + cardOggi + cardSett + '</div>' : cardOggi + cardSett;
  // Un rilievo appena dettato da qui si fa vedere qui, prima delle tendine: resta com'era.
  html += cardRilieviNuovi({ cantiere: c.codice });
  /* Le sei tendine, in quest'ordine (Fase 6.2): Verbali, Giornate, Foto, Bolle,
     Documenti, Rilevamento d'ordine. Verbali e Foto si nascondono se non c'è
     ancora niente; le altre restano sempre — servono anche solo per inserire. */
  html += '<div class="tendine una">' +
    tendinaVerbaliCantiere(c) +
    tendinaGiornateCantiere(c, oggi) +
    tendinaFotoCantiere(c) +
    tendinaBolleCantiere(c) +
    tendinaDocumentiCantiere(c) +
    tendinaRilievoOrdineCantiere(c) +
    '</div>' + ingressiDocumento(null);
  if (!sops.length) html += '<div class="vuoto-stato">' + (c.stato === 'chiuso' ? 'Nessun sopralluogo in questo cantiere.' : 'Nessun sopralluogo ancora. Premi il bottone verde e parla.') + '</div>';
  // Note e PDF archiviati: non fra le sei tendine (non previste dal documento), restano raggiungibili da qui.
  html += tendina('voci-' + c.id, 'Note · PDF archiviati',
    '<div class="card">' +
    '<button class="riga" data-az="vai" data-a="#/note/' + h(c.id) + '"><span class="desc">Note del cantiere<small>' + h(primaRiga(c.note) || 'nessuna nota') + '</small></span><span class="frec">›</span></button>' +
    '<button class="riga" data-az="vai" data-a="#/pdf/' + h(c.id) + '"><span class="desc">PDF archiviati<small>' + (pdfDi(c.codice).length ? pdfDi(c.codice).length + ' documenti · ' + h(pesoFile(pdfDi(c.codice).reduce(function (t, p) { return t + (p.peso || 0); }, 0))) : 'ancora nessuno') + '</small></span><span class="frec">›</span></button>' +
    '</div>');
  // In fondo, come nel giorno: resta com'era.
  if (!REG.attiva) {
    if (c.stato === 'chiuso') {
      html += '<div class="barra">' + (rel ? '<button class="az verde" data-az="vai" data-a="#/relazione/' + h(rel.id) + '">Apri la relazione</button>' : '<button class="az verde" data-az="relazione-genera" data-id="' + h(c.id) + '">Scrivi la relazione</button>') +
        '<button class="az stretta" data-az="riapri-cantiere" data-id="' + h(c.id) + '">Riapri</button></div>';
    } else {
      html += '<div class="barra larga"><button class="az verde" data-az="parla-cantiere" data-id="' + h(c.id) + '"><span class="ico ico-microfono"></span> Detta un sopralluogo</button>' +
        '<button class="az stretta" data-az="chiudi-cantiere" data-id="' + h(c.id) + '">Chiudi cantiere</button></div>';
    }
  }
  return html;
}

/* ---------------- NOTE DEL CANTIERE ---------------- */
function vistaNote(idCantiere) {
  const c = cantiere(idCantiere);
  if (!c) return vistaDashboard();
  const inCoda = leggiLocale().coda.filter(function (l) { return l.cantiere === c.id && (l.per === 'nota' || l.tipo === 'nota'); });
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Note del cantiere', sotto: h(c.nome) });
  inCoda.forEach(function (l) { html += '<div class="avviso" style="color:var(--muted);border-color:var(--line);background:var(--surface)">' + (l.stato === 'fallito' ? 'Nota dettata non riuscita: ' + h(l.errore || '') : 'Nota dettata in arrivo…') + '</div>'; });
  html += '<div class="modulo"><textarea class="campo auto" data-campo="note-cantiere" data-id="' + h(c.id) + '" placeholder="Note che valgono per tutto il cantiere" style="min-height:200px">' + h(c.note || '') + '</textarea></div>';
  if (!REG.attiva) html += '<div class="barra"><button class="az verde" data-az="detta-nota" data-id="' + h(c.id) + '"><span class="ico ico-microfono"></span> Detta una nota</button></div>';
  return html;
}

/* ---------------- CERCA NEI DOCUMENTI ---------------- */
let filtroDocumenti = '';
function vistaCerca() {
  let html = testata({ indietro: '#/', titolo: 'Cerca nei documenti', sotto: 'sopralluoghi, verbali, bolle' });
  html += '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Una parola: ferro, ponteggio, Rossi…" value="' + h(filtroDocumenti) + '" data-campo="filtro-documenti" autocomplete="off" autofocus></div>';
  const q = senzaAccenti(filtroDocumenti.trim());
  if (q.length < 2) { html += '<div class="vuoto-stato">Scrivi almeno due lettere.</div>'; return html; }
  const db = leggiTutto();
  const risultati = [];
  const stralcio = function (testo) {
    const t = String(testo || '');
    const i = senzaAccenti(t).indexOf(q);
    if (i === -1) return '';
    const a = Math.max(0, i - 40), b = Math.min(t.length, i + q.length + 60);
    return (a > 0 ? '…' : '') + t.slice(a, b).replace(/\n/g, ' ') + (b < t.length ? '…' : '');
  };
  valori(db.sopralluoghi).forEach(function (s) {
    CHIAVI_SEZIONI.concat(['da_smistare']).forEach(function (k) {
      const st = stralcio(s.sezioni[k]);
      if (st) risultati.push({ cantiere: s.cantiere, cosa: 'Sopralluogo', giorno: s.giorno, dove: nomeSezione(k), testo: st, a: '#/giorno/' + s.id });
    });
  });
  valori(db.verbali).forEach(function (v) {
    const s = valori(db.sopralluoghi).find(function (x) { return x.codice === v.sopralluogo; });
    CHIAVI_SEZIONI.forEach(function (k) {
      const st = stralcio(v.sezioni[k]);
      if (st) risultati.push({ cantiere: v.cantiere, cosa: v.nome || (v.giornata ? 'Giornata' : 'Verbale'), giorno: v.giorno, dove: nomeSezione(k), testo: st, a: s ? '#/giorno/' + s.id : '#/verbale/' + v.id });
    });
  });
  // I documenti: per il testo del referto (bolla, registro firme, documento generale).
  valori(db.sopralluoghi).forEach(function (s) {
    documentiDi(s).forEach(function (f) {
      const st = stralcio(f.referto);
      if (st) risultati.push({ cantiere: s.cantiere, cosa: GENERI[f.genere] || 'Documento', giorno: f.giorno, dove: 'Documento', testo: st, a: '#/foto/' + s.id + '/' + f.id });
    });
  });
  valori(db.cantieri).forEach(function (c) {
    const sn = stralcio(c.note);
    if (sn) risultati.push({ cantiere: c.codice, cosa: 'Cantiere', giorno: c.aggiornato.slice(0, 10), dove: 'Note del cantiere', testo: sn, a: '#/note/' + c.id });
  });
  risultati.sort(function (a, b) { return b.giorno.localeCompare(a.giorno); });
  if (!risultati.length) { html += '<div class="vuoto-stato">Niente con «' + h(filtroDocumenti) + '».</div>'; return html; }
  html += '<div class="eti">Risultati <span class="n">' + risultati.length + '</span></div>';
  risultati.slice(0, 100).forEach(function (r) {
    const cant = cantierePerCodice(r.cantiere);
    html += '<div class="card tocca" data-az="vai" data-a="' + h(r.a) + '"><div class="card-in"><div class="fila" style="margin:0 0 6px"><span class="pill cod">' + h(r.cosa) + '</span><span class="mini">' + h(cant ? cant.nome : '') + ' · ' + h(dataSenzaAnno(r.giorno)) + '</span></div>' +
      '<div class="sotto" style="color:var(--azione);font-size:14px;text-transform:uppercase;letter-spacing:.05em">' + h(r.dove) + '</div><div style="font-size:17px;margin-top:4px">' + h(r.testo) + '</div></div></div>';
  });
  return html;
}

/* ---------------- CANTIERE: nuovo / modifica ---------------- */
function vistaCantiereForm(id, idAzienda) {
  const c = id ? cantiere(id) : null;
  if (id && !c) return vistaDashboard();
  const azNuova = idAzienda ? azienda(idAzienda) : null;
  const v = c || { nome: '', committente: '', indirizzo: '', stato: 'attivo', aperto: oggiISO(), azienda: azNuova ? azNuova.codice : '' };
  const aziende = aziendeTutte();
  let html = testata({ indietro: c ? '#/cantiere/' + c.id : '#/', titolo: c ? 'Modifica cantiere' : 'Nuovo cantiere', sotto: c ? h(c.nome) : '' });
  html += '<div class="modulo">' +
    '<label class="eticampo">Nome del cantiere</label><input class="campo" id="c-nome" value="' + h(v.nome) + '" placeholder="es. Via Mazzini 14" autocomplete="off"' + (c ? '' : ' autofocus') + '>' +
    '<label class="eticampo">Committente</label><input class="campo" id="c-comm" value="' + h(v.committente) + '" autocomplete="off">' +
    '<label class="eticampo">Indirizzo</label><input class="campo" id="c-ind" value="' + h(v.indirizzo || '') + '" autocomplete="off">' +
    (aziende.length ? '<label class="eticampo">Azienda</label><select class="campo" id="c-azienda"><option value="">— nessuna —</option>' +
      aziende.map(function (a) { return '<option value="' + h(a.codice) + '"' + ((v.azienda || '') === a.codice ? ' selected' : '') + '>' + h(a.nome) + '</option>'; }).join('') + '</select>' : '') +
    '<div class="due"><div><label class="eticampo">Stato</label><select class="campo" id="c-stato"><option value="attivo"' + (v.stato !== 'chiuso' ? ' selected' : '') + '>attivo</option><option value="chiuso"' + (v.stato === 'chiuso' ? ' selected' : '') + '>chiuso</option></select></div>' +
    '<div><label class="eticampo">Aperto il</label><input class="campo" id="c-aperto" type="date" value="' + h(v.aperto || '') + '"></div></div>' +
    '</div>';
  /* I listini di questo cantiere: si toccano per scegliere, e l'ordine del tocco è
     l'ordine in cui si cerca. Il Generale vale sempre, per ultimo, e non si sceglie. */
  FORM_LISTINI = (v.listini || []).slice();
  html += '<div class="card"><div class="card-capo">Listini<span class="dx">nell\'ordine in cui si cerca</span></div><div id="c-listini">' + righeListiniForm() + '</div></div>';
  html += '<div class="barra"><button class="az verde" data-az="cantiere-salva" data-id="' + h(c ? c.id : '') + '">Salva</button></div>';
  return html;
}
let FORM_LISTINI = [];
function righeListiniForm() {
  const scelti = listiniTutti().filter(function (l) { return !l.generale; });
  if (!scelti.length) return '<div class="card-corpo" style="color:var(--muted)">Solo il Generale. I listini si creano dalla scheda Listini del cantiere.</div>';
  return scelti.map(function (l) {
    const i = FORM_LISTINI.indexOf(l.codice);
    return '<div class="riga lis"><button class="desc" data-az="cantiere-listino" data-codice="' + h(l.codice) + '">' +
      (i !== -1 ? '<span class="targa">' + (i + 1) + '°</span> ' : '') + h(l.nome) + '<small>' + h([l.riferimento, vociDi(l.codice).length + ' voci'].filter(Boolean).join(' · ')) + '</small></button>' +
      (i > 0 ? '<button class="pill cod" data-az="cantiere-listino-su" data-codice="' + h(l.codice) + '" aria-label="Sposta su">↑</button>' : '') +
      '<span class="pill ' + (i !== -1 ? 'ok' : 'grigia') + '">' + (i !== -1 ? 'sì' : 'no') + '</span></div>';
  }).join('') + '<div class="card-piede">Il Generale vale sempre, per ultimo.</div>';
}

// Le azioni di questo file.
Object.assign(AZIONI, {
  /* Da Aziende o da un'azienda: i cantieri attivi (dell'azienda, o tutti). Uno solo
     parte subito; due o più si scelgono da un foglio. Il tocco sul cantiere è il
     gesto dell'utente: il microfono parte da lì, senza timer in mezzo. */
  'parla-dashboard': function (el) {
    const idAz = el.dataset.azienda;
    const base = idAz === 'senza' ? cantieriSenzaAzienda() : (idAz ? cantieriDiAzienda((azienda(idAz) || {}).codice) : valori(leggiTutto().cantieri));
    const attivi = base.filter(function (x) { return x.stato !== 'chiuso'; }).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
    if (!attivi.length) { avvisa('Apri prima un cantiere', 'att'); vai('#/nuovo-cantiere'); return; }
    if (attivi.length === 1) { dettaSu(attivi[0]); return; }
    const tasto = function (c) { return '<button class="btn scelta" data-az="detta-cantiere-scelto" data-id="' + h(c.id) + '"><b>' + h(c.nome) + '</b><small>' + h(c.committente || '') + '</small></button>'; };
    let html = '';
    if (idAz) html = attivi.map(tasto).join('');
    else {
      // Da tutte le aziende: un'etichetta per azienda, e in fondo i cantieri senza azienda.
      aziendeTutte().forEach(function (a) {
        const suoi = attivi.filter(function (c) { return c.azienda === a.codice; });
        if (suoi.length) html += '<label class="eticampo">' + h(a.nome) + '</label>' + suoi.map(tasto).join('');
      });
      const senza = attivi.filter(function (c) { return !aziendaPerCodice(c.azienda); });
      if (senza.length) html += (html ? '<label class="eticampo">Senza azienda</label>' : '') + senza.map(tasto).join('');
    }
    apriFoglio('<h2>Su quale cantiere?</h2>' + html + '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>');
  },
  'detta-cantiere-scelto': function (el) { const c = cantiere(el.dataset.id); chiudiFoglio(); if (c) return dettaSu(c); },
  'parla-cantiere': function (el) { const c = cantiere(el.dataset.id); if (c) dettaSu(c); },
  'nuovo-sopralluogo': function (el) { const c = cantiere(el.dataset.id); if (!c) return; const s = sopralluogoPerDettare(c); vai('#/giorno/' + s.id); },
  // --- le sei tendine del cantiere (rework 14/09/2026) ---
  'verbali-cant-sel': function (el) { selVerbaliCant[el.dataset.sel] = !selVerbaliCant[el.dataset.sel]; aggiornaVista(); },
  'foto-cant-filtro': function (el) {
    if (el.dataset.tipo === 'tutte') selFotoCant = { giorno: '', settimana: '' };
    else if (el.dataset.tipo === 'giorno') selFotoCant = { giorno: oggiISO(), settimana: '' };
    else selFotoCant = { giorno: '', settimana: lunediDi(oggiISO()) };
    aggiornaVista();
  },
  'bolle-cant-filtro': function (el) {
    if (el.dataset.tipo === 'tutte') selBolleCant = { giorno: '', settimana: '' };
    else if (el.dataset.tipo === 'giorno') selBolleCant = { giorno: oggiISO(), settimana: '' };
    else selBolleCant = { giorno: '', settimana: lunediDi(oggiISO()) };
    aggiornaVista();
  },
  'doc-cant-sel': function (el) { selDocCant = el.dataset.sel; aggiornaVista(); },
  // Un solo tasto "＋ documento": chiede se è il registro firme o un documento generale, poi apre lo scanner con quel genere.
  'doc-cant-inserisci': function (el) {
    apriFoglio('<h2>Che documento è?</h2>' +
      '<button class="btn btn-ok" data-az="doc-cant-scegli" data-genere="firme" data-id="' + h(el.dataset.id) + '">Registro firme<br><small style="font-weight:400">il foglio presenze fotografato</small></button>' +
      '<button class="btn" data-az="doc-cant-scegli" data-genere="documento" data-id="' + h(el.dataset.id) + '" style="margin-top:8px">Documento generale</button>' +
      '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>');
  },
  'doc-cant-scegli': function (el) {
    chiudiFoglio();
    const pseudo = { dataset: { cantiere: el.dataset.id, genere: el.dataset.genere } };
    apriScanner(pseudo, 'file-doc-scatta');
  },
  // Crea rilevamento senza dettatura: entra come nota nel sopralluogo aperto di oggi (D9), come un rilievo dettato.
  'crea-rilevamento': function (el) {
    apriFoglio('<h2>Crea rilevamento</h2>' +
      '<textarea class="corpo" id="rilord-testo" placeholder="una voce per riga" autofocus></textarea>' +
      '<div class="righe"><button class="btn btn-ok" data-az="crea-rilevamento-salva" data-id="' + h(el.dataset.id) + '">Salva</button></div>' +
      '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>');
  },
  'crea-rilevamento-salva': function (el) {
    const c = cantiere(el.dataset.id);
    const campo = document.getElementById('rilord-testo');
    const testo = campo ? campo.value.trim() : '';
    chiudiFoglio();
    if (!c || !testo) return;
    const s = sopralluogoPerDettare(c);
    s.sezioni.rilievi_ordine = aggiungiTesto(s.sezioni.rilievi_ordine, testo);
    salva('sopralluogo', s);
    allineaVerbale(s, ['rilievi_ordine']);
    avvisa('Rilevamento creato', 'ok');
    aggiornaVista();
  },
  // --- documenti azienda (4.3): loghi, direttive, pdf, brochure — solo qui (D14) ---
  'azienda-doc-inserisci': function (el) { const f = document.getElementById('file-azienda-doc'); if (f) f.click(); },
  'azienda-doc-apri': async function (el) {
    const a = azienda(el.dataset.id);
    const d = a && (a.documenti || []).find(function (x) { return x.id === el.dataset.doc; });
    if (!d) return;
    const blob = d.file ? await leggiMedia(d.file) : null;
    if (!blob) { avvisa('Il file non c\'è più', 'err'); return; }
    scaricaBlob(blob, d.nome || 'documento');
  },
  'azienda-doc-elimina': async function (el) {
    const a = azienda(el.dataset.id);
    const d = a && (a.documenti || []).find(function (x) { return x.id === el.dataset.doc; });
    if (!a || !d) return;
    const ok = await chiedi('Eliminare ' + (d.nome || 'questo documento') + '?', '', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    if (d.file) await cancellaMedia(d.file);
    a.documenti = a.documenti.filter(function (x) { return x !== d; });
    salva('azienda', a);
    avvisa('Eliminato', 'ok');
    aggiornaVista();
  },
  // --- chiusura del cantiere e relazione ---
  'chiudi-cantiere': function (el) { chiudiCantiere(el.dataset.id); },
  'riapri-cantiere': function (el) { riapriCantiere(el.dataset.id); },
  // --- cantiere ---
  'azienda-salva': async function (el) {
    const nome = document.getElementById('a-nome').value.trim();
    if (!nome) { avvisa('Manca il nome', 'att'); document.getElementById('a-nome').focus(); return; }
    const nuova = !el.dataset.id;
    const a = el.dataset.id ? azienda(el.dataset.id) : { media: [] };
    if (!a) return;
    a.nome = nome;
    a.ragione = document.getElementById('a-ragione').value.trim();
    a.piva = document.getElementById('a-piva').value.trim();
    a.indirizzo = document.getElementById('a-ind').value.trim();
    a.telefono = document.getElementById('a-tel').value.trim();
    a.mail = document.getElementById('a-mail').value.trim();
    a.pec = document.getElementById('a-pec').value.trim();
    a.tecnico = (document.getElementById('a-tecnico') || {}).value ? document.getElementById('a-tecnico').value.trim() : '';
    a.sito = (document.getElementById('a-sito') || {}).value ? document.getElementById('a-sito').value.trim() : '';
    a.note = document.getElementById('a-note').value.trim();
    const salvata = salva('azienda', a);
    avvisa('Salvata', 'ok');
    /* La prima azienda si porta dietro i cantieri che c'erano già: senza, resterebbero
       in un limbo che nessuno guarda. Si spostano poi uno per uno dalla loro scheda. */
    // La prima azienda si porta dentro i cantieri che c'erano già, senza chiedere:
    // altrimenti resterebbero in un elenco a parte. Si spostano dalla scheda del cantiere.
    const orfani = cantieriSenzaAzienda();
    if (nuova && orfani.length) {
      orfani.forEach(function (c) { c.azienda = salvata.codice; salva('cantiere', c); });
      avvisa(orfani.length + (orfani.length === 1 ? ' cantiere messo dentro' : ' cantieri messi dentro'), 'ok');
    }
    vai('#/azienda/' + salvata.id);
  },
  'azienda-elimina': async function (el) {
    const a = azienda(el.dataset.id);
    if (!a) return;
    const cant = cantieriDiAzienda(a.codice);
    PUNTI_APERTI = null;
    const ok = await chiediDueVolte('Eliminare ' + a.nome + '?', (cant.length ? 'I suoi ' + cant.length + ' cantieri non si cancellano: tornano fra quelli senza azienda.' : 'Non ha cantieri.'), 'Elimina');
    if (!ok) return;
    for (const k of ['logo', 'firma', 'banda', 'bandaPiede']) if (a[k]) await cancellaMedia(a[k]);
    for (const t of (a.tecnici || [])) if (t.firma) await cancellaMedia(t.firma);
    for (const d of (a.documenti || [])) if (d.file) await cancellaMedia(d.file);
    cant.forEach(function (c) { c.azienda = ''; salva('cantiere', c); });
    cancella('azienda', a.id);
    avvisa('Eliminata', 'ok');
    if (ROTTA.nome === 'dashboard' || ROTTA.nome === 'aziende') aggiornaVista(); else vai('#/');
  },
  'az-immagine': function (el) {
    AZ_IMMAGINE = { id: el.dataset.id, quale: el.dataset.quale };
    const f = document.getElementById('file-azienda');
    if (f) f.click();
  },
  // --- tecnici e le loro firme (D5) ---
  'tecnico-nuovo': function (el) { apriFoglioTecnico(el.dataset.id, null); },
  'tecnico-modifica': function (el) { apriFoglioTecnico(el.dataset.id, el.dataset.tecnico); },
  'tecnico-firma': function (el) {
    AZ_IMMAGINE = { id: el.dataset.id, quale: 'firma', tecnico: el.dataset.tecnico };
    const f = document.getElementById('file-azienda');
    if (f) f.click();
  },
  'tecnico-salva': function (el) {
    const a = azienda(el.dataset.id);
    if (!a) return;
    const nome = ((document.getElementById('t-nome') || {}).value || '').trim();
    const ruolo = ((document.getElementById('t-ruolo') || {}).value || '').trim();
    if (!nome) { avvisa('Manca il nome', 'att'); return; }
    if (!Array.isArray(a.tecnici)) a.tecnici = [];
    let t = el.dataset.tecnico ? a.tecnici.find(function (x) { return x.id === el.dataset.tecnico; }) : null;
    const nuovo = !t;
    if (!t) { t = { id: nuovoId(), firma: null }; a.tecnici.push(t); }
    t.nome = nome; t.ruolo = ruolo;
    salva('azienda', a);
    chiudiFoglio();
    avvisa('Salvato', 'ok');
    // Appena creato si riapre la stessa scheda: solo ora che ha un id può prendere la firma.
    if (nuovo) apriFoglioTecnico(a.id, t.id); else aggiornaVista();
  },
  'tecnico-elimina': async function (el) {
    const a = azienda(el.dataset.id);
    const t = a && (a.tecnici || []).find(function (x) { return x.id === el.dataset.tecnico; });
    chiudiFoglio();
    if (!a || !t) return;
    const ok = await chiedi('Eliminare ' + (t.nome || 'questo tecnico') + '?', 'Le firme già messe sui verbali chiusi restano.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    if (t.firma) await cancellaMedia(t.firma);
    a.tecnici = a.tecnici.filter(function (x) { return x !== t; });
    salva('azienda', a);
    avvisa('Eliminato', 'ok');
    aggiornaVista();
  },
  'cantiere-salva': function (el) {
    const nome = document.getElementById('c-nome').value.trim();
    if (!nome) { avvisa('Manca il nome', 'att'); document.getElementById('c-nome').focus(); return; }
    const c = el.dataset.id ? cantiere(el.dataset.id) : { note: '' };
    if (!c) return;
    c.nome = nome;
    c.committente = document.getElementById('c-comm').value.trim();
    c.indirizzo = document.getElementById('c-ind').value.trim();
    const selAz = document.getElementById('c-azienda');
    if (selAz) c.azienda = selAz.value;
    c.stato = document.getElementById('c-stato').value;
    c.aperto = document.getElementById('c-aperto').value || oggiISO();
    // Chiudere o riaprire dal modulo vale come farlo dalla scheda: la data di chiusura segue lo stato.
    if (c.stato === 'chiuso') { if (!c.chiuso) c.chiuso = oggiISO(); } else c.chiuso = null;
    c.listini = FORM_LISTINI.slice();
    salva('cantiere', c);
    avvisa('Salvato', 'ok');
    vai('#/cantiere/' + c.id);
  },
  // I listini nella scheda: un tocco sceglie o toglie, la freccia sposta su. Si ridisegna solo quel pezzo: i campi scritti restano.
  'cantiere-listino': function (el) {
    const i = FORM_LISTINI.indexOf(el.dataset.codice);
    if (i === -1) FORM_LISTINI.push(el.dataset.codice); else FORM_LISTINI.splice(i, 1);
    document.getElementById('c-listini').innerHTML = righeListiniForm();
  },
  'cantiere-listino-su': function (el) {
    const i = FORM_LISTINI.indexOf(el.dataset.codice);
    if (i > 0) { FORM_LISTINI.splice(i - 1, 0, FORM_LISTINI.splice(i, 1)[0]); document.getElementById('c-listini').innerHTML = righeListiniForm(); }
  },
  'cantiere-elimina': async function (el) {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    const sops = sopralluoghiDi(c.codice);
    const rel = relazioneDi(c.codice);
    PUNTI_APERTI = null;
    const ok = await chiediDueVolte('Eliminare ' + c.nome + '?', 'Si cancellano anche ' + sops.length + ' sopralluoghi e i verbali' + (rel ? ' e la relazione' : '') + '. Il listino resta.', 'Elimina tutto');
    if (!ok) return;
    if (rel) cancella('relazione', rel.id);
    // Giornata per giornata: vanno via i sopralluoghi, i verbali di giornata e le giornate stesse.
    for (const g of giornateDi(c.codice)) await eliminaGiornata(c.codice, g.giorno);
    cancella('cantiere', c.id);
    avvisa('Eliminato', 'ok');
    if (ROTTA.nome === 'cantiere') vai('#/'); else aggiornaVista();
  },
});

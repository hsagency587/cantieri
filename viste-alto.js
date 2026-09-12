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
    /* La firma del tecnico sta con il suo nome: è quella che va in fondo a ogni
       verbale. Si scansiona da qui (foglio bianco, fotocamera o file). */
    (a ? '<label class="eticampo">Firma del tecnico</label><div class="az-firma">' +
      (a.firma ? '<img data-foto="' + h(a.firma) + '" alt="">' : '<div class="vuoto">niente</div>') +
      '<button class="btn" data-az="az-immagine" data-id="' + h(a.id) + '" data-quale="firma"><span class="ico ico-firma"></span> ' + (a.firma ? 'Cambia la firma' : 'Scansiona la firma') + '</button></div>' : '') +
    '<label class="eticampo">Partita IVA</label><input class="campo" id="a-piva" value="' + h(v.piva || '') + '" autocomplete="off">' +
    '<label class="eticampo">Indirizzo</label><input class="campo" id="a-ind" value="' + h(v.indirizzo || '') + '" autocomplete="off">' +
    '<div class="due"><div><label class="eticampo">Telefono</label><input class="campo" id="a-tel" type="tel" value="' + h(v.telefono || '') + '" autocomplete="off"></div>' +
    '<div><label class="eticampo">Mail</label><input class="campo" id="a-mail" type="email" value="' + h(v.mail || '') + '" autocomplete="off"></div></div>' +
    '<div class="due"><div><label class="eticampo">PEC</label><input class="campo" id="a-pec" type="email" value="' + h(v.pec || '') + '" autocomplete="off"></div>' +
    '<div><label class="eticampo">Sito</label><input class="campo" id="a-sito" value="' + h(v.sito || '') + '" placeholder="edilrossi.it" autocomplete="off"></div></div>' +
    '<label class="eticampo">Note</label><textarea class="campo auto" id="a-note" rows="2">' + h(v.note || '') + '</textarea>' +
    '</div>';
  if (a) {
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
      '</div><div class="card-piede">Il logo va in cima al PDF, la firma del tecnico (qui sopra) in fondo.</div></div>' +
      '<input type="file" accept="image/*" id="file-azienda" hidden data-campo="file-azienda" data-id="' + h(a.id) + '">' +
      '<div class="modulo"><button class="btn btn-rosso" data-az="azienda-elimina" data-id="' + h(a.id) + '">Elimina l\'azienda</button></div>';
  }
  html += '<div class="barra"><button class="az verde" data-az="azienda-salva" data-id="' + h(a ? a.id : '') + '">Salva</button></div>';
  return html;
}

function vistaDashboard(idAzienda) {
  const db = leggiTutto();
  const loc = leggiLocale();
  const oggi = oggiISO();
  const f = senzaAccenti(filtroCantieri);
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
  html += '<div class="cerca"><span class="ico ico-lente"></span> <input type="search" placeholder="Cerca cantiere, committente, indirizzo" value="' + h(filtroCantieri) + '" data-campo="filtro-cantieri" autocomplete="off"></div>';

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

/* ---------------- CANTIERE: i giorni ---------------- */
function vistaCantiere(id) {
  const c = cantiere(id);
  if (!c) return vistaDashboard();
  const loc = leggiLocale();
  loc.ultimoCantiere = c.id; salvaLocale();
  const sops = sopralluoghiDi(c.codice);
  const nVerbali = sops.filter(function (s) { return s.chiuso; }).length;
  const cont = contabilitaDi(c.codice);
  const totale = totaleContabilita(cont);
  const oggi = oggiISO();
  /* Committente e indirizzo stanno su una riga sola sotto il titolo:
     erano due righe corte incolonnate a sinistra con mezzo schermo vuoto a destra. */
  let html = testata({ indietro: '#/', titolo: c.nome,
    sotto: h(c.committente) + (c.indirizzo ? ' · ' + h(c.indirizzo) : ''),
    destra: '<button class="pill ' + (c.stato === 'chiuso' ? 'grigia' : 'cod') + '" data-az="vai" data-a="#/modifica-cantiere/' + h(c.id) + '">' + (c.stato === 'chiuso' ? 'chiuso' : 'modifica') + '</button>' });
  // "giorni" conta le giornate, non i passaggi: tre sopralluoghi in un giorno sono un giorno.
  html += '<div class="numeri"><div class="n"><div class="v">' + giornateDi(c.codice).length + '</div><div class="k">' + plurale(giornateDi(c.codice).length, 'giorno', 'giorni') + '</div></div>' +
    '<div class="n"><div class="v">' + nVerbali + '</div><div class="k">' + plurale(nVerbali, 'verbale', 'verbali') + '</div></div>' +
    '<div class="n"><div class="v fatto">' + h(compatto(totale)) + '</div><div class="k">contabilità €</div></div></div>';
  // Un cantiere chiuso ha la sua relazione in testa, prima dei giorni: è la cosa che si va a leggere.
  const rel = c.stato === 'chiuso' ? relazioneDi(c.codice) : null;
  if (c.stato === 'chiuso') {
    if (rel) {
      // La card si tocca per leggere la relazione; i tre tasti sotto fanno il resto.
      const pdfRel = pdfConChiave('relazione:' + rel.codice);
      html += '<div class="card tocca" data-az="vai" data-a="#/relazione/' + h(rel.id) + '"><div class="card-in"><p class="titolo">Relazione di fine cantiere</p><div class="sotto">chiuso il ' + h(dataEstesa(rel.chiusura)) + '</div>' +
        '<div class="fila"><span class="pill ok">chiuso</span><span class="mini">' + rel.giorni.length + ' ' + plurale(rel.giorni.length, 'giorno', 'giorni') + ' · ' + h(euro(rel.numeri.totale)) + '</span></div></div>' +
        '<div class="griglia tre">' +
        '<button class="btn" data-az="vai" data-a="' + (pdfRel ? '#/leggi/' + h(pdfRel.id) : '#/relazione/' + h(rel.id)) + '">Visualizza</button>' +
        tastoEsporta('rel-' + rel.id) +
        '<button class="btn" data-az="vai" data-a="#/modifica-relazione/' + h(rel.id) + '">Correggi</button></div>' + vociEsporta('rel-' + rel.id, 'esporta-pdf-relazione', rel.id, 'relazione-scarica', rel.id) + '</div>';
    }
    else html += '<div class="card tocca piu" data-az="relazione-genera" data-id="' + h(c.id) + '"><div class="card-in"><p class="titolo">＋ Scrivi la relazione di fine cantiere</p><div class="sotto">il riepilogo di tutti i giorni, con i conti</div></div></div>';
  }
  /* Le due card "＋": il sopralluogo di oggi (se non c'è ancora) e il verbale di settimana,
     una di fianco all'altra su una riga sola quando ci sono tutte e due. Il verbale di
     settimana compare da sabato alle 10 fino a domenica, se la settimana ha almeno un
     sopralluogo, e sparisce una volta fatto — solo in questo cantiere. Per rifarlo:
     i puntini della sua card nella casella Verbali. */
  const adesso = new Date();
  const finestraSettimana = adesso.getDay() === 0 || (adesso.getDay() === 6 && adesso.getHours() >= 10);
  const cardOggi = !sops.some(function (s) { return s.giorno === oggi; }) && c.stato !== 'chiuso'
    ? '<div class="card tocca piu" data-az="nuovo-sopralluogo" data-id="' + h(c.id) + '"><div class="card-in"><p class="titolo">＋ Sopralluogo di oggi</p></div></div>' : '';
  const cardSett = finestraSettimana && c.stato !== 'chiuso' && sops.some(function (s) { return s.giorno >= lunediDi(oggi); }) && !pdfConChiave('periodo:' + c.codice + ':' + lunediDi(oggi) + ':' + oggi)
    ? '<div class="card tocca piu" data-az="settimana-verbale" data-id="' + h(c.id) + '"><div class="card-in"><p class="titolo">＋ Verbale di settimana</p></div></div>' : '';
  html += cardOggi && cardSett ? '<div class="due-card">' + cardOggi + cardSett + '</div>' : cardOggi + cardSett;
  /* Rilievi e bolle si prendono pensando al cantiere, non alla giornata: qui il tasto sta
     in chiaro, e quello che si detta o si scansiona finisce nel giorno di oggi. */
  /* Due piani. Quello del cantiere raccoglie i rilievi e i documenti che valgono
     per tutto il lavoro: quelli presi da qui nascono già così, quelli di una
     giornata ci arrivano quando li porti dentro tu. Il piano della giornata resta
     nella giornata. */
  /* Del cantiere: quello che vale per tutto il lavoro, non per una giornata sola.
     I rilievi in un blocco e le scansioni sotto: la categoria con cui sono stati
     presi non conta più, una volta che sono qui. */
  // Un rilievo appena dettato da qui si fa vedere qui, prima del resto.
  html += cardRilieviNuovi({ cantiere: c.codice });
  /* Ordini, bolle, verbali e rilievi di tutto il lavoro stanno in quattro tendine,
     due per riga: compaiono solo se dentro c'è qualcosa, e dentro si scorre. */
  const rilCant = String(c.rilievi || '').trim();
  const docCant = documentiTutti(c);
  const vistaVerbali = verbaliInVista(c); const verbCant = vistaVerbali.settimane.concat(vistaVerbali.giornate);
  html += grigliaTendine([
    tendinaOrdini(c),
    docCant.length ? tendina('bolle-' + c.id, 'Bolle',
      '<div class="card">' + scorrevole(docCant.map(rigaDocumentoHtml).join('')) +
      '<div class="card-piede"><button class="link" style="margin-left:auto" data-az="vai" data-a="#/documenti/' + h(c.id) + '">Cerca nelle bolle</button></div></div>', docCant.length) : '',
    verbCant.length ? tendina('verbali-' + c.id, 'Verbali', strisciaVerbaliGiornata(c), verbCant.length) : '',
    rilCant ? tendina('rilievi-' + c.id, 'Rilievi',
      '<div class="card">' + scorrevole('<div class="card-corpo">' + testoElenco(c.rilievi, true) + '</div>') +
      '<div class="card-piede"><button class="link" style="margin-left:auto" data-az="rilievo-cantiere-svuota" data-id="' + h(c.id) + '">svuota i rilievi</button></div></div>', righeElenco(c.rilievi).length) : ''
  ]);
  if (c.stato !== 'chiuso') {
    html += '<div class="card"><div class="griglia">' +
      '<button class="btn" data-az="detta-rilievo" data-cantiere="' + h(c.id) + '" data-sezione="rilievi_ordine"><span class="ico ico-righello"></span> Rilievo d\'ordine</button>' +
      '<button class="btn" data-az="detta-rilievo" data-cantiere="' + h(c.id) + '" data-sezione="rilievi_contabilita"><span class="ico ico-calcolatrice"></span> Rilievo da contabilità</button>' +
      '<button class="btn" data-az="doc-scansiona" data-cantiere="' + h(c.id) + '" data-genere="bolla"><span class="ico ico-documento"></span> Bolla</button>' +
      '</div></div>' + ingressiDocumento(null);
  }

  /* Le giornate, dalla più recente, raggruppate per mese. Una riga per data: i
     passaggi di un giorno stanno dentro la giornata, non nell'elenco — se no
     "Oggi" compariva tre volte. La riga si apre sul primo passaggio del giorno,
     che ha già la striscia con gli altri. */
  let meseCorrente = null;
  giornateDi(c.codice).forEach(function (g) {
    const mese = g.giorno.slice(0, 7);
    if (mese !== meseCorrente) {
      if (meseCorrente) html += '</div>';
      /* Niente più intestazione del mese: la data sta già davanti a ogni riga.
         Fra un mese e l'altro basta una riga di stacco. */
      html += '<div class="card mese">';
      meseCorrente = mese;
    }
    // Una sezione piena in un passaggio qualsiasi conta una volta sola per la giornata.
    const piene = CHIAVI_SEZIONI.filter(function (k) { return g.sops.some(function (s) { return String(s.sezioni[k] || '').trim(); }); }).length;
    const audio = g.sops.reduce(function (t, s) { return t + s.pezzi.length; }, 0);
    const anteprima = g.sops.map(function (s) {
      return CHIAVI_SEZIONI.map(function (k) { return primaRiga(s.sezioni[k]); }).filter(Boolean)[0] || (s.sezioni.da_smistare ? primaRiga(s.sezioni.da_smistare) : '');
    }).filter(Boolean)[0] || (audio ? 'trascrizione in arrivo…' : 'ancora niente');
    let pill;
    if (g.verbale) pill = '<span class="pill ok">' + h(g.verbale.nome || 'verbale di giornata') + '</span>';
    else if (g.giorno === oggi) pill = '<span class="pill blu">in corso</span>';
    else pill = '<span class="pill att">da chiudere</span>';
    /* Una giornata senza sopralluoghi si apre sulla sua schermata vuota. La riga è un
       div e non un bottone, così i tre puntini possono starci dentro. */
    const apre = g.sops.length ? '#/giorno/' + g.sops[0].id : '#/giornata/' + giornataDi(c.codice, g.giorno).id;
    const chiavePunti = 'giornata-' + c.codice + '-' + g.giorno;
    html += '<div class="giorno' + (g.giorno === oggi && !g.verbale ? ' oggi' : '') + '" data-az="vai" data-a="' + h(apre) + '">' +
      '<div class="n"><div class="titolo"><span class="gm">' + h(giornoMese(g.giorno)) + '</span> ' + h(nomeGiornoRelativo(g.giorno)) + ' · ' + g.sops.length + (g.sops.length === 1 ? ' sopralluogo' : ' sopralluoghi') + '</div>' +
      '<div class="prima">' + h(anteprima) + '</div>' +
      '<div class="stat">' + pill + '<span class="mini">' + piene + '/' + CHIAVI_SEZIONI.length + ' sezioni · ' + audio + ' audio</span>' + tastoPunti(chiavePunti) + '</div></div></div>' +
      vociPunti(chiavePunti, 'giornata-elimina', 'data-cantiere="' + h(c.id) + '" data-giorno="' + h(g.giorno) + '"');
  });
  if (meseCorrente) html += '</div>';
  if (!sops.length) html += '<div class="vuoto-stato">' + (c.stato === 'chiuso' ? 'Nessun sopralluogo in questo cantiere.' : 'Nessun sopralluogo ancora. Premi il bottone verde e parla.') + '</div>';
  html += tendina('voci-' + c.id, 'Contabilità · Note · Listino',
    '<div class="card">' +
    '<button class="riga" data-az="vai" data-a="#/contabilita/' + h(c.id) + '"><span class="desc">Contabilità<small>' + (cont ? cont.righe.length + ' righe · ' + h(euro(totale)) : 'ancora vuota') + '</small></span><span class="frec">›</span></button>' +
    '<button class="riga" data-az="vai" data-a="#/note/' + h(c.id) + '"><span class="desc">Note del cantiere<small>' + h(primaRiga(c.note) || 'nessuna nota') + '</small></span><span class="frec">›</span></button>' +
    '<button class="riga" data-az="vai" data-a="#/listino/' + h(c.id) + '"><span class="desc">Listini<small>' + h(listiniDelCantiere(c).map(function (l) { return l.nome; }).join(' · ') || 'nessuno') + '</small></span><span class="frec">›</span></button>' +
    '<button class="riga" data-az="vai" data-a="#/pdf/' + h(c.id) + '"><span class="desc">PDF archiviati<small>' + (pdfDi(c.codice).length ? pdfDi(c.codice).length + ' documenti · ' + h(pesoFile(pdfDi(c.codice).reduce(function (t, p) { return t + (p.peso || 0); }, 0))) : 'ancora nessuno') + '</small></span><span class="frec">›</span></button>' +
    '</div>');
  // In fondo, come nel giorno: l'azione grande a sinistra, "Chiudi" stretto a destra. Chiuso, al posto di Detta c'è la relazione, e Riapri.
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
  let html = testata({ indietro: '#/', titolo: 'Cerca nei documenti', sotto: 'sopralluoghi, verbali, contabilità, bolle' });
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
  // I documenti: per fornitore e numero letti sulla bolla, e per il testo del referto.
  valori(db.sopralluoghi).forEach(function (s) {
    documentiDi(s).forEach(function (f) {
      const st = stralcio(intestazioneBolla(f)) || stralcio(f.referto);
      if (st) risultati.push({ cantiere: s.cantiere, cosa: GENERI[f.genere] || 'Documento', giorno: f.giorno, dove: 'Documento', testo: st, a: '#/foto/' + s.id + '/' + f.id });
    });
  });
  valori(db.contabilita).forEach(function (c) {
    const cant = cantierePerCodice(c.cantiere);
    (c.righe || []).forEach(function (r) {
      const st = stralcio(r.descrizione);
      if (st) risultati.push({ cantiere: c.cantiere, cosa: 'Contabilità', giorno: c.aggiornato.slice(0, 10), dove: 'Riga di contabilità', testo: st, a: cant ? '#/contabilita/' + cant.id : '#/' });
    });
    const sn = stralcio(c.note);
    if (sn) risultati.push({ cantiere: c.cantiere, cosa: 'Contabilità', giorno: c.aggiornato.slice(0, 10), dove: 'Note della contabilità', testo: sn, a: cant ? '#/contabilita/' + cant.id : '#/' });
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
  'rilievo-cantiere-svuota': async function (el) {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    const si = await chiedi('Svuoto questo rilievo del cantiere?', 'Quello scritto nelle giornate resta dov\'è.', 'Svuota', 'rosso');
    chiudiFoglio();
    if (!si) return;
    c.rilievi = '';
    salva('cantiere', c);
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
    const ok = await chiediDueVolte('Eliminare ' + c.nome + '?', 'Si cancellano anche ' + sops.length + ' sopralluoghi, i verbali' + (rel ? ', la relazione' : '') + ' e la contabilità. Il listino resta.', 'Elimina tutto');
    if (!ok) return;
    if (rel) cancella('relazione', rel.id);
    // Giornata per giornata: vanno via i sopralluoghi, i verbali di giornata e le giornate stesse.
    for (const g of giornateDi(c.codice)) await eliminaGiornata(c.codice, g.giorno);
    const cont = contabilitaDi(c.codice);
    if (cont) cancella('contabilita', cont.id);
    cancella('cantiere', c.id);
    avvisa('Eliminato', 'ok');
    if (ROTTA.nome === 'cantiere') vai('#/'); else aggiornaVista();
  },
});

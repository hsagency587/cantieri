/* CANTIERI — stampe.js: tutti i PDF e la relazione di fine cantiere */
'use strict';


/* ============================================================
   LA CHIUSURA DEL CANTIERE E LA RELAZIONE DI FINE CANTIERE
   La giornata si chiude e ne esce un verbale; il cantiere si chiude e ne
   esce una relazione: un documento unico che racconta tutto il lavoro, con
   i conti. È una fotografia dei documenti al momento della chiusura, con un
   codice suo (REL-001): si corregge a mano come un verbale, e si rigenera
   se dopo la chiusura si aggiunge qualcosa. Un cantiere chiuso si riapre
   senza perdere niente: la relazione resta, e si riscrive quando si richiude.
   ============================================================ */

// id della relazione → vero finché Claude sta scrivendo le due righe "in breve"
const RELAZIONI_IN_SCRITTURA = {};

/* Il riepilogo per sezione: sotto ogni sezione, quello che è stato scritto nei
   vari giorni, ogni pezzo con la sua data davanti. Per un giorno chiuso vale
   il verbale, che è il documento corretto; per un giorno aperto il sopralluogo. */
function riepilogoPerSezione(sops) {
  const per = {};
  CHIAVI_SEZIONI.forEach(function (k) { per[k] = []; });
  sops.forEach(function (s) {
    const v = s.chiuso ? verbaleDiSopralluogo(s.codice) : null;
    const sezioni = v ? v.sezioni : s.sezioni;
    CHIAVI_SEZIONI.forEach(function (k) {
      let testo = String(sezioni[k] || '').trim();
      // In un giorno aperto il testo da smistare finirebbe nelle Note alla chiusura: qui si fa lo stesso, così non si perde.
      if (!v && k === 'note' && String(s.sezioni.da_smistare || '').trim()) testo = aggiungiTesto(testo, s.sezioni.da_smistare);
      if (testo) per[k].push({ giorno: s.giorno, codice: v ? v.codice : s.codice, aperta: !s.chiuso, testo: testo });
    });
  });
  return per;
}

/* L'etichetta di un pezzo del riepilogo. Nel PDF (esteso): la data, poi il codice del
   documento da cui viene. Sullo schermo: la data, e l'ora se quel giorno ha più passaggi. */
function etichettaBlocco(b, esteso) {
  const data = b.giorno ? (esteso ? dataEstesa(b.giorno) : dataBreve(b.giorno)) : 'aggiunto a mano';
  if (esteso) return data + (b.codice ? ' - ' + b.codice : '') + (b.aperta ? ' - giornata non chiusa' : '');
  const s = b.codice ? (sopralluogoPerCodice(b.codice) || sopralluogoPerCodice((verbalePerCodice(b.codice) || {}).sopralluogo)) : null;
  return data + (s && sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1 ? ' · ' + oraCorta(s.ora) : '');
}

/* Scrive la relazione dai documenti di adesso, o la riscrive se esiste già (stesso codice).
   Tutto quello che c'è dentro è copiato: correggere la relazione non tocca verbali e contabilità,
   e correggere quelli non cambia la relazione finché non la si rigenera. */
function generaRelazione(c, esistente) {
  // Dal primo giorno all'ultimo: la relazione racconta in ordine, non dal più recente.
  const sops = sopralluoghiDi(c.codice).slice().reverse();
  const cont = contabilitaDi(c.codice);
  const rel = esistente || { cantiere: c.codice };
  rel.apertura = c.aperto || (sops.length ? sops[0].giorno : oggiISO());
  rel.chiusura = c.chiuso || oggiISO();
  rel.numeri = {
    giorni: sops.length,
    verbali: sops.filter(function (s) { return s.chiuso; }).length,
    aperte: sops.filter(function (s) { return !s.chiuso; }).length,
    foto: sops.reduce(function (t, s) { return t + fotoNormali(s).length; }, 0),
    documenti: sops.reduce(function (t, s) { return t + documentiDi(s).length; }, 0),
    parlato: sops.reduce(function (t, s) { return t + s.pezzi.reduce(function (u, p) { return u + (p.durata || 0); }, 0); }, 0),
    totale: totaleContabilita(cont)
  };
  rel.sezioni = riepilogoPerSezione(sops);
  rel.contabilita = {
    codice: cont ? cont.codice : '',
    note: cont ? String(cont.note || '') : '',
    totale: totaleContabilita(cont),
    // Sconto e IVA del documento, copiati: la relazione fa gli stessi conti della contabilità.
    sconto: cont ? Number(cont.sconto) || 0 : 0, iva: cont ? Number(cont.iva) || 0 : 0,
    righe: (cont ? cont.righe : []).map(function (r) {
      return { codice: r.codice, descrizione: r.descrizione, quantita: r.quantita, um: r.um, prezzo: r.prezzo, importo: r.importo, dacompletare: !!r.dacompletare };
    })
  };
  rel.giorni = sops.map(function (s) {
    const v = s.chiuso ? verbaleDiSopralluogo(s.codice) : null;
    return { sop: s.id, sopralluogo: s.codice, verbale: v ? v.codice : (s.verbale || null), giorno: s.giorno, ora: s.ora, chiuso: !!s.chiuso,
      sezioni: sezioniPiene(v ? v.sezioni : s.sezioni).length, audio: s.pezzi.length, foto: fotoNormali(s).length, documenti: documentiDi(s).length };
  });
  rel.inBreve = '';
  rel.generata = adessoISO();
  // Nata da un cantiere di esempio, è un esempio anche lei: "butta via gli esempi" la porta via.
  if (c.esempio) rel.esempio = true;
  salva('relazione', rel);
  c.relazione = rel.codice;
  salva('cantiere', c);
  scriviInBreve(rel);
  return rel;
}

/* Le due righe "in breve" le scrive Claude con il foglio del riassunto, dal riepilogo appena fatto.
   Senza chiave o senza rete si salta: la relazione esce lo stesso, e si può rigenerare più tardi. */
async function scriviInBreve(rel) {
  if (!chiaveAnthropic() || !navigator.onLine) return;
  const c = cantierePerCodice(rel.cantiere) || {};
  const testo = SEZIONI.map(function (z) {
    const blocchi = (rel.sezioni[z.chiave] || []).filter(function (b) { return String(b.testo || '').trim(); });
    return blocchi.length ? z.nome + ':\n' + blocchi.map(function (b) { return (b.giorno ? dataBreve(b.giorno) + ': ' : '') + b.testo; }).join('\n') : '';
  }).filter(Boolean).join('\n\n');
  if (!testo) return;
  RELAZIONI_IN_SCRITTURA[rel.id] = true;
  aggiornaVista();
  try {
    const risposta = await chiamaClaude(REGOLE_RIASSUNTO, 'Cantiere: ' + (c.nome || '') + '\nPeriodo: dal ' + dataEstesa(rel.apertura) + ' al ' + dataEstesa(rel.chiusura) + '\nVerbali:\n' + testo.slice(0, 20000), 800);
    const fresca = relazione(rel.id);
    // Se nel frattempo è stata rigenerata o cancellata, questa risposta non vale più.
    if (fresca && fresca.generata === rel.generata) { fresca.inBreve = String(risposta || '').trim(); salva('relazione', fresca); }
  } catch (e) { /* senza "in breve" la relazione vale lo stesso */ }
  delete RELAZIONI_IN_SCRITTURA[rel.id];
  aggiornaVista();
}

async function chiudiCantiere(id) {
  const c = cantiere(id);
  if (!c || c.stato === 'chiuso') return;
  if (REG.attiva) { avvisa('Ferma prima la registrazione', 'att'); return; }
  const sops = sopralluoghiDi(c.codice);
  const aperte = sops.filter(function (s) { return !s.chiuso; }).length;
  const idSops = sops.map(function (s) { return s.id; });
  const inCoda = leggiLocale().coda.some(function (l) { return (idSops.indexOf(l.sop) !== -1 || l.cantiere === c.id) && l.stato !== 'fallito'; });
  const esistente = relazioneDi(c.codice);
  let testo = 'Si scrive la relazione di fine cantiere: il riepilogo di tutti i giorni e i conti. Il cantiere va fra quelli chiusi, e si potrà riaprire.';
  if (aperte) testo = (aperte === 1 ? 'Una giornata è ancora aperta' : aperte + ' giornate sono ancora aperte') + ': nella relazione compaiono come non chiuse. ' + testo;
  if (inCoda) testo = 'Una registrazione è ancora in coda: il suo testo non entrerà nella relazione. ' + testo;
  if (esistente) testo += ' La relazione si riscrive: le correzioni fatte a mano si perdono.';
  const ok = await chiedi('Chiudere il cantiere?', testo, 'Chiudi il cantiere');
  chiudiFoglio();
  if (!ok) return;
  c.stato = 'chiuso';
  c.chiuso = oggiISO();
  salva('cantiere', c);
  const rel = generaRelazione(c, esistente);
  avvisa('Relazione scritta', 'ok');
  vai('#/relazione/' + rel.id);
}

async function riapriCantiere(id) {
  const c = cantiere(id);
  if (!c || c.stato !== 'chiuso') return;
  const rel = relazioneDi(c.codice);
  const ok = await chiedi('Riaprire il cantiere?', c.nome + ' torna fra i cantieri attivi. Non si perde niente' + (rel ? ': la relazione resta, e si riscrive quando lo richiudi.' : '.'), 'Riapri il cantiere');
  chiudiFoglio();
  if (!ok) return;
  c.stato = 'attivo';
  c.chiuso = null;
  salva('cantiere', c);
  avvisa('Cantiere riaperto', 'ok');
  aggiornaVista();
}

async function rigeneraRelazione(relId) {
  const rel = relazione(relId);
  const c = rel && cantierePerCodice(rel.cantiere);
  if (!c) return;
  const ok = await chiedi('Rigenerare la relazione?', 'Si riscrive dai verbali e dalla contabilità di adesso. Le correzioni fatte a mano sulla relazione si perdono.', 'Rigenera');
  chiudiFoglio();
  if (!ok) return;
  generaRelazione(c, rel);
  avvisa('Rigenerata', 'ok');
  aggiornaVista();
}

/* ---------------- RELAZIONE: lettura ---------------- */
/* Si legge come si legge un giorno chiuso: i numeri in testa, poi le card, in fondo Esporta e Modifica. */
function vistaRelazione(id) {
  const rel = relazione(id);
  if (!rel) return vistaDashboard();
  const c = cantierePerCodice(rel.cantiere) || { nome: '?', id: '', codice: rel.cantiere, stato: 'chiuso' };
  const n = rel.numeri || {};
  const scrivendo = !!RELAZIONI_IN_SCRITTURA[rel.id];
  const inBreve = String(rel.inBreve || '').trim();
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Relazione di fine cantiere', sotto: h(c.nome),
    // La pastiglia dice una parola: la data di chiusura sta nella card sotto. Una pastiglia lunga schiaccia il titolo.
    destra: c.stato === 'chiuso' ? '<span class="pill ok">chiuso</span>' : '<span class="pill att">riaperto</span>' });
  // L'intestazione
  html += '<div class="card"><div class="card-capo">Cantiere</div><div class="card-corpo">' + h(c.nome) +
    (c.committente ? '\nCommittente: ' + h(c.committente) : '') + (c.indirizzo ? '\n' + h(c.indirizzo) : '') +
    '\nAperto ' + h(dataEstesa(rel.apertura)) + '\nChiuso ' + h(dataEstesa(rel.chiusura)) + '</div>' +
    '<div class="card-piede">Scritta il ' + h(dataSenzaAnno(rel.generata)) + ' alle ' + h(oraDaISO(rel.generata)) + '</div></div>';
  // I numeri, come nella giornata chiusa; il totale è l'unico verde, le giornate aperte l'unico giallo
  html += '<div class="numeri sei">' +
    '<div class="n"><div class="v">' + (n.giorni || 0) + '</div><div class="k">' + plurale(n.giorni, 'giorno', 'giorni') + '</div></div>' +
    '<div class="n"><div class="v">' + (n.verbali || 0) + '</div><div class="k">' + plurale(n.verbali, 'verbale', 'verbali') + '</div></div>' +
    '<div class="n"><div class="v' + (n.aperte ? ' att' : '') + '">' + (n.aperte || 0) + '</div><div class="k">non chiuse</div></div>' +
    '<div class="n"><div class="v">' + (n.foto || 0) + '</div><div class="k">foto</div></div>' +
    '<div class="n"><div class="v">' + h(durataLunga(n.parlato)) + '</div><div class="k">parlato</div></div>' +
    '<div class="n"><div class="v fatto">' + h(compatto(n.totale)) + '</div><div class="k">totale €</div></div></div>';
  html += '<button class="link blocco" data-az="relazione-rigenera" data-id="' + h(rel.id) + '">↻ Rigenera dai documenti di adesso</button>';
  // In breve: due righe di Claude. Se mancano e nessuno le sta scrivendo, la card non c'è.
  if (scrivendo || inBreve) {
    html += '<div class="card"><div class="card-capo' + (inBreve ? '' : ' spenta') + '">In breve' + (scrivendo ? '<span class="dx att">scrivo…</span>' : '') + '</div>' +
      (inBreve ? '<div class="card-corpo">' + h(inBreve) + '</div>' : '') + '</div>';
  }
  // Il riepilogo per sezione: le sezioni vuote non si mostrano
  html += '<div class="eti">Riepilogo per sezione</div>';
  let piene = 0;
  SEZIONI.forEach(function (z) {
    const blocchi = (rel.sezioni[z.chiave] || []).filter(function (b) { return String(b.testo || '').trim(); });
    if (!blocchi.length) return;
    piene++;
    html += '<div class="card" id="sez-' + z.chiave + '"><div class="card-capo">' + h(z.nome) + '<span class="dx">' + blocchi.length + (blocchi.length === 1 ? ' giorno' : ' giorni') + '</span></div>' +
      blocchi.map(function (b) {
        return '<div class="card-capo spenta">' + h(etichettaBlocco(b)) + (b.aperta ? '<span class="dx att">non chiusa</span>' : '') + '</div>' +
          '<div class="card-corpo">' + testoElenco(b.testo, z.elenco) + '</div>';
      }).join('') + '</div>';
  });
  if (!piene) html += '<div class="vuoto-stato">Nessuna sezione compilata nei giorni di questo cantiere.</div>';
  // La contabilità completa: le righe senza prezzo si segnalano, il totale sta in fondo
  const cont = rel.contabilita || { righe: [], totale: 0, note: '' };
  const daCompletare = cont.righe.filter(function (r) { return r.dacompletare; }).length;
  html += '<div class="eti">Contabilità' + (daCompletare ? '<span class="n" style="color:var(--gold)">' + daCompletare + ' da completare</span>' : '') + '</div>';
  if (cont.righe.length) html += '<div class="card">' + cont.righe.map(function (r) { return rigaContabilitaHtml(r, { lettura: true }); }).join('') + '</div>';
  else html += '<div class="vuoto-stato">Nessuna riga di contabilità.</div>';
  html += totaliContabilitaHtml(cont, 'Totale');
  if (String(cont.note || '').trim()) html += '<div class="card"><div class="card-capo spenta">Note della contabilità</div><div class="card-corpo">' + h(cont.note) + '</div></div>';
  // L'elenco dei giorni: una riga per giornata, si tocca e si va al giorno
  html += '<div class="eti">Giorni<span class="n">' + rel.giorni.length + '</span></div>';
  if (rel.giorni.length) {
    html += '<div class="card">' + rel.giorni.map(function (g) {
      return '<button class="riga" data-az="vai" data-a="#/giorno/' + h(g.sop) + '"><span class="desc">' + h(dataBreve(g.giorno)) + ' · ' + h(g.ora) +
        '<small>' + g.sezioni + '/' + CHIAVI_SEZIONI.length + ' sezioni · ' + g.audio + ' audio · ' + g.foto + ' foto' + (g.documenti ? ' · ' + g.documenti + ' doc' : '') + '</small></span>' +
        (g.chiuso ? '<span class="pill ok">chiusa</span>' : '<span class="pill att">non chiusa</span>') + '<span class="frec">›</span></button>';
    }).join('') + '</div>';
  } else html += '<div class="vuoto-stato">Nessun giorno di sopralluogo.</div>';
  // Le foto marcate, giorno per giorno: si leggono dal sopralluogo, come fa il PDF del verbale
  let fotoHtml = '';
  rel.giorni.forEach(function (g) {
    const s = sopralluogo(g.sop);
    const marcate = s ? fotoDi(s).filter(function (f) { return f.nelPdf; }) : [];
    if (!marcate.length) return;
    fotoHtml += '<div class="card"><div class="card-capo spenta">' + h(dataBreve(g.giorno)) + '<span class="dx">' + h(oraCorta(g.ora)) + '</span></div>' + filaFoto(s, marcate) + '</div>';
  });
  if (fotoHtml) html += '<div class="eti">Foto nel PDF</div>' + fotoHtml;
  html += '<div class="barra"><button class="az verde" data-az="esporta-pdf-relazione" data-id="' + h(rel.id) + '">Esporta PDF</button>' +
    '<button class="az stretta" data-az="vai" data-a="#/modifica-relazione/' + h(rel.id) + '">Modifica</button></div>';
  return html;
}

/* ---------------- RELAZIONE: modifica ---------------- */
/* Come la modifica del verbale, ma ogni sezione è fatta di pezzi con la loro data: un campo per pezzo. */
function vistaRelazioneModifica(id) {
  const rel = relazione(id);
  if (!rel) return vistaDashboard();
  const c = cantierePerCodice(rel.cantiere) || { nome: '?' };
  let html = testata({ indietro: '#/relazione/' + rel.id, titolo: 'Modifica relazione', sotto: 'relazione di fine cantiere · ' + h(c.nome) });
  html += '<div class="avviso" style="background:var(--surface);border-color:var(--line);color:var(--muted)">Correggere la relazione non tocca i verbali né la contabilità. Rigenerandola, le correzioni si perdono.</div>';
  html += '<div class="card"><div class="card-capo' + (String(rel.inBreve || '').trim() ? '' : ' spenta') + '">In breve</div>' +
    '<textarea class="corpo" data-campo="inbreve-relazione" data-id="' + h(rel.id) + '" placeholder="Due righe su com\'è andato il cantiere">' + h(rel.inBreve || '') + '</textarea></div>';
  SEZIONI.forEach(function (z) {
    const blocchi = rel.sezioni[z.chiave] || [];
    const pieno = blocchi.some(function (b) { return String(b.testo || '').trim(); });
    const segnaposto = z.elenco ? 'una voce per riga' : '—';
    html += '<div class="card"><div class="card-capo' + (pieno ? '' : ' spenta') + '">' + h(z.nome) + '</div>';
    if (blocchi.length) {
      blocchi.forEach(function (b, i) {
        html += '<div class="card-capo spenta">' + h(etichettaBlocco(b)) + (b.aperta ? '<span class="dx att">non chiusa</span>' : '') + '</div>' +
          '<textarea class="corpo" data-campo="blocco-relazione" data-id="' + h(rel.id + '/' + z.chiave + '/' + i) + '" placeholder="' + segnaposto + '">' + h(b.testo || '') + '</textarea>';
      });
    } else {
      // Una sezione rimasta vuota si può riempire a mano: il pezzo nasce alla prima lettera, senza data.
      html += '<textarea class="corpo" data-campo="blocco-relazione" data-id="' + h(rel.id + '/' + z.chiave + '/0') + '" placeholder="' + segnaposto + '"></textarea>';
    }
    html += '</div>';
  });
  html += '<div class="barra"><button class="az verde" data-az="salva-relazione" data-id="' + h(rel.id) + '">Salva</button></div>';
  return html;
}

/* ============================================================
   MODO SVILUPPATORE
   Si entra con cinque tocchi sul titolo e un PIN. Qui stanno le chiavi,
   la coda, i consumi, lo spazio, la copia su GitHub e i dati di esempio.
   Fuori di qui, niente di tecnico.
   ============================================================ */

// Il conto della settimana da chiudere: si misura quando serve, e la schermata lo legge già pronto.
const SETT_CONTO = { inizio: null, audio: 0, foto: 0, byte: 0 };
async function contaSettimana() {
  const sett = settimanaDaChiudere();
  if (!sett) { SETT_CONTO.inizio = null; SETT_CONTO.audio = 0; SETT_CONTO.foto = 0; SETT_CONTO.byte = 0; return; }
  if (SETT_CONTO.inizio === sett.inizio) return;
  const p = await pesoSettimana(sett.inizio, sett.fine);
  SETT_CONTO.inizio = sett.inizio; SETT_CONTO.audio = p.audio; SETT_CONTO.foto = p.foto; SETT_CONTO.byte = p.byte;
}

/* ============================================================
   IL PDF
   Tre modi: questo verbale, tutti i verbali di un cantiere in un periodo,
   una sola sezione. Le sezioni vuote non si stampano. Quando è pronto si apre
   il tasto di condivisione dell'iPhone: nessun invio automatico.
   ============================================================ */

/* Si arriva qui da un sopralluogo — e allora si prende il suo verbale — oppure
   direttamente da un verbale, anche da quello di giornata. */
function apriEsportaPdf(sopId, idVerbale) {
  let v = idVerbale ? verbale(idVerbale) : null;
  if (!v) { const s = sopralluogo(sopId); v = s ? verbaleDiSopralluogo(s.codice) : null; }
  if (!v) { avvisa('Nessun verbale', 'att'); return; }
  const c = cantierePerCodice(v.cantiere);
  const tutti = valori(leggiTutto().verbali).filter(function (x) { return x.cantiere === v.cantiere; }).sort(function (a, b) { return a.giorno.localeCompare(b.giorno); });
  const primo = tutti.length ? tutti[0].giorno : v.giorno;
  // Nel cantiere chiuso c'è una voce in più: la relazione di fine cantiere.
  const rel = c && c.stato === 'chiuso' ? relazioneDi(c.codice) : null;
  apriFoglio(
    '<h2>Esporta PDF</h2><p>' + h(c ? c.nome + ' · ' : '') + h(titoloVerbale(v, true)) + '</p>' +
    '<label class="eticampo">Cosa</label><select class="campo" id="pdf-modo" data-campo="pdf-modo">' +
    '<option value="questo">Questo verbale</option><option value="periodo">Tutti i verbali del cantiere in un periodo</option><option value="sezione">Una sola sezione</option>' +
    (rel ? '<option value="relazione">Relazione di fine cantiere</option>' : '') + '</select>' +
    '<div id="pdf-periodo" hidden>' +
    '<label class="eticampo">Periodi pronti</label>' +
    '<div class="periodi">' +
    '<button class="pill cod" data-az="pdf-quando" data-quando="settimana">questa settimana</button>' +
    '<button class="pill cod" data-az="pdf-quando" data-quando="settimana-scorsa">settimana scorsa</button>' +
    '<button class="pill cod" data-az="pdf-quando" data-quando="mese">questo mese</button>' +
    '<button class="pill cod" data-az="pdf-quando" data-quando="mese-scorso">mese scorso</button>' +
    '</div>' +
    '<div style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Dal</label><input class="campo" type="date" id="pdf-dal" value="' + h(primo) + '"></div><div style="flex:1"><label class="eticampo">Al</label><input class="campo" type="date" id="pdf-al" value="' + h(v.giorno) + '"></div></div></div>' +
    '<div id="pdf-sezione" hidden><label class="eticampo">Sezione</label><select class="campo" id="pdf-quale">' + SEZIONI.map(function (z) { return '<option value="' + z.chiave + '">' + h(z.nome) + '</option>'; }).join('') + '</select>' +
    '<label class="eticampo">Di quali verbali</label><select class="campo" id="pdf-ambito" data-campo="pdf-ambito"><option value="questo">Solo questo verbale</option><option value="periodo">Tutti quelli di un periodo</option></select></div>' +
    '<button class="btn btn-ok" data-az="pdf-crea" data-id="' + h(v.id) + '">Crea il PDF</button>' +
    '<button class="btn" data-az="chiudi-foglio">Annulla</button>'
  );
}
// Le tendine del foglio PDF si mostrano a seconda del modo scelto.
function aggiornaFoglioPdf() {
  const modo = document.getElementById('pdf-modo');
  if (!modo) return;
  const ambito = document.getElementById('pdf-ambito');
  document.getElementById('pdf-sezione').hidden = modo.value !== 'sezione';
  document.getElementById('pdf-periodo').hidden = !(modo.value === 'periodo' || (modo.value === 'sezione' && ambito.value === 'periodo'));
}

async function creaPdf(idVerbale) {
  if (!window.PDFLib) { avvisa('PDF non pronto: serve la rete la prima volta', 'err'); return; }
  const v = verbale(idVerbale);
  if (!v) return;
  const modo = document.getElementById('pdf-modo').value;
  if (modo === 'relazione') {
    // La relazione ha il suo PDF: il foglio è servito solo a sceglierla.
    chiudiFoglio();
    const rel = relazioneDi(v.cantiere);
    if (rel) await creaPdfRelazione(rel.id); else avvisa('Nessuna relazione', 'att');
    return;
  }
  const dal = document.getElementById('pdf-dal').value, al = document.getElementById('pdf-al').value;
  const quale = document.getElementById('pdf-quale').value;
  const ambito = document.getElementById('pdf-ambito').value;
  let verbali = [v], soloSezione = null, riassunto = '';
  if (modo === 'periodo' || (modo === 'sezione' && ambito === 'periodo')) {
    verbali = verbaliDelPeriodo(v.cantiere, dal, al);
    if (!verbali.length) { avvisa('Nessun verbale nel periodo', 'att'); return; }
  }
  if (modo === 'sezione') soloSezione = quale;
  chiudiFoglio();
  avvisa('Preparo il PDF…');
  if (modo === 'periodo') riassunto = await riassuntoPeriodo(verbali);
  let byte;
  try { byte = await costruisciPdf(verbali, soloSezione, riassunto, { dal: dal, al: al, modo: modo }); }
  catch (e) { avvisa('PDF non riuscito', 'err'); return; }
  const c = cantierePerCodice(v.cantiere);
  // Se il verbale ha un nome, il file lo porta dietro al codice: VER-003_getto-solaio.pdf
  const baseVerbale = v.nome ? v.codice + '_' + nomeFile(v.nome) : v.codice;
  const nome = (modo === 'questo' ? baseVerbale : (modo === 'periodo' ? (c ? c.codice : 'cantiere') + '_' + dal + '_' + al : baseVerbale + '_' + quale)) + '.pdf';
  // Prima resta nell'app, poi esce: se la condivisione la annulli, il documento c'è lo stesso.
  const archiviato = await archiviaPdf(byte, nome, {
    chiave: modo === 'questo' ? 'verbale:' + v.codice : (modo === 'periodo' ? 'periodo:' + v.cantiere + ':' + dal + ':' + al : 'sezione:' + v.codice + ':' + quale),
    tipo: modo === 'questo' ? 'verbale' : (modo === 'periodo' ? 'periodo' : 'sezione'),
    cantiere: v.cantiere, sopralluogo: modo === 'questo' ? v.sopralluogo : '', giorno: modo === 'periodo' ? al : v.giorno
  });
  /* Finiti nel PDF, i rilievi della giornata si svuotano: il testo è nel verbale,
     nel PDF e nei rilievi complessivi del cantiere, e nella giornata non serve
     più. Foto e audio restano dove sono: quelli si buttano da soli con il tempo. */
  verbali.forEach(function (x) {
    const sop = valori(leggiTutto().sopralluoghi).find(function (z) { return z.codice === x.sopralluogo; });
    if (!sop) return;
    let svuotato = false;
    ['rilievi_ordine', 'rilievi_contabilita'].forEach(function (k) {
      if (String(sop.sezioni[k] || '').trim()) { sop.sezioni[k] = ''; svuotato = true; }
    });
    if (svuotato) salva('sopralluogo', sop);
  });
  /* Il PDF è fatto e archiviato. Adesso si sceglie cosa farne: mandarlo fuori,
     guardarlo qui dentro, o tornare a correggere il verbale da cui nasce. */
  apriFoglioPdfFatto(archiviato, v.id);
}

/* Scarica: il file finisce nei download, senza passare dal foglio di condivisione.
   Se il PDF non c'è ancora si apre la scelta del PDF, che lo fa e poi lo archivia. */
async function scaricaVerbale(idVerbale) {
  const v = verbale(idVerbale);
  if (!v) return;
  const p = pdfConChiave('verbale:' + v.codice);
  if (!p) { apriEsportaPdf(null, v.id); return; }
  const blob = p.file ? await leggiMedia(p.file) : null;
  if (!blob) { avvisa('Il file non c\'è più', 'err'); return; }
  scaricaBlob(blob, p.nome || 'verbale.pdf');
}
// Un file che scende nel telefono: un link di download, premuto e buttato.
function scaricaBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  avvisa('Scaricato', 'ok');
}

/* Le tre strade dopo "Crea il PDF". */
function apriFoglioPdfFatto(p, idVerbale) {
  if (!p) return;
  apriFoglio(
    '<h2>PDF pronto</h2><p>' + h(p.nome || 'documento.pdf') + ' · ' + h(pesoFile(p.peso || 0)) + '</p>' +
    '<button class="btn btn-ok" data-az="pdf-manda" data-id="' + h(p.id) + '">Esporta</button>' +
    '<button class="btn" data-az="pdf-leggi" data-id="' + h(p.id) + '">Visualizza</button>' +
    (idVerbale ? '<button class="btn" data-az="pdf-modifica" data-id="' + h(idVerbale) + '">Modifica il verbale</button>' : '') +
    '<button class="btn" data-az="chiudi-foglio">Chiudi</button>'
  );
}

// Le lettere che il carattere standard non sa scrivere si sostituiscono, se no pdf-lib si ferma.
function testoPdf(s) {
  return String(s || '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[—–]/g, '-').replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF\u20AC\u2022\n]/g, '?');
}
function spezzaRighe(font, testo, corpo, larghezza) {
  const righe = [];
  String(testo).split('\n').forEach(function (par) {
    const parole = par.split(/\s+/).filter(Boolean);
    if (!parole.length) { righe.push(''); return; }
    let riga = '';
    parole.forEach(function (p) {
      const prova = riga ? riga + ' ' + p : p;
      if (font.widthOfTextAtSize(prova, corpo) <= larghezza) riga = prova;
      else {
        if (riga) righe.push(riga);
        // Una parola più lunga della riga si spezza a forza.
        while (font.widthOfTextAtSize(p, corpo) > larghezza && p.length > 1) {
          let n = p.length;
          while (n > 1 && font.widthOfTextAtSize(p.slice(0, n), corpo) > larghezza) n--;
          righe.push(p.slice(0, n)); p = p.slice(n);
        }
        riga = p;
      }
    });
    if (riga) righe.push(riga);
  });
  return righe;
}

async function costruisciPdf(verbali, soloSezione, riassunto, info) {
  const PDF = window.PDFLib;
  const doc = await PDF.PDFDocument.create();
  const normale = await doc.embedFont(PDF.StandardFonts.Helvetica);
  const grassetto = await doc.embedFont(PDF.StandardFonts.HelveticaBold);
  const L = 595.28, A = 841.89, M = 50;
  const larghezza = L - 2 * M;
  let pagina = null, y = 0, numero = 0;
  // Il marchio dell'azienda del cantiere: logo, firma e i dati della carta intestata.
  let marchio = { az: null, logo: null, firma: null, banda: null, piede: null };
  /* Le bande dell'azienda: immagini larghe quanto il foglio, in cima e in fondo
     a ogni pagina. Sono la carta intestata vera del cliente, non una ricostruita
     a pezzi, quindi quando ci sono comandano loro. */
  const altBanda = function (img) { return img ? (img.height * L / img.width) : 0; };
  const nuovaPagina = function () {
    pagina = doc.addPage([L, A]);
    numero++;
    y = A - M;
    let bassoPiede = 28;
    if (marchio.piede) {
      const la = altBanda(marchio.piede);
      pagina.drawImage(marchio.piede, { x: 0, y: 0, width: L, height: la });
      bassoPiede = la + 10;
    }
    pagina.drawText(testoPdf((marchio.az ? marchio.az.nome + ' - ' : '') + 'CANTIERI - pagina ' + numero), { x: M, y: bassoPiede, size: 9, font: normale, color: PDF.rgb(0.5, 0.5, 0.5) });
    if (marchio.banda) {
      const la = altBanda(marchio.banda);
      pagina.drawImage(marchio.banda, { x: 0, y: A - la, width: L, height: la });
      y = A - la - 18;
    }
  };
  /* Il fondo utile della pagina si alza se c'è la banda del piè di pagina:
     senza questo il testo ci finirebbe sopra. */
  const fondo = function () { return M + (marchio.piede ? altBanda(marchio.piede) : 0); };
  const spazio = function (alt) { if (!pagina || y - alt < fondo()) nuovaPagina(); };
  const scrivi = function (testo, corpo, font, colore, rientro) {
    const righe = spezzaRighe(font, testoPdf(testo), corpo, larghezza - (rientro || 0));
    righe.forEach(function (r) {
      spazio(corpo * 1.4);
      if (r) pagina.drawText(r, { x: M + (rientro || 0), y: y - corpo, size: corpo, font: font, color: colore || PDF.rgb(0, 0, 0) });
      y -= corpo * 1.4;
    });
  };
  // Le foto marcate si preparano tutte prima: l'incorporazione è asincrona, il ciclo sotto no.
  marchio = await preparaMarchio(doc, verbali[0]);
  const fotoPerVerbale = await preparaFotoPdf(doc, verbali, soloSezione);
  // I documenti solo quando si stampa tutto: un'estrazione di una sezione sola non li riguarda.
  const docPerVerbale = soloSezione ? {} : await preparaDocumentiPdf(doc, verbali);
  /* Le foto vanno a due per riga, in due colonne larghe mezza pagina: un verbale con dodici
     foto occupava dodici pagine, così ne occupa tre. Sotto ogni foto il suo referto e i suoi
     dati, dentro la sua colonna: si legge come una scheda, non come un elenco. */
  const VUOTO_COL = 18;
  const LARG_COL = (larghezza - VUOTO_COL) / 2;
  const ALT_COL = 210;
  const datiFoto = function (f, c) { return f.codice + ' - ' + dataEstesa(f.giorno) + ', ' + (f.ora || '') + ' - ' + (c.nome || ''); };
  const mancaFoto = function (f) { return '[' + (f.file ? 'foto non leggibile' : 'foto archiviata' + (f.archiviato ? ' il ' + dataSenzaAnno(f.archiviato) : '')) + ']'; };
  /* Quanto è alto il blocco di una foto nella sua colonna. Si misura prima di disegnare:
     serve per sapere se la riga ci sta nella pagina e per far partire le due colonne dalla
     stessa altezza. */
  const misuraFoto = function (voce, c) {
    const f = voce.foto;
    let alt = 0, lo = 0, la = 0;
    if (voce.img) {
      const scala = Math.min(LARG_COL / voce.img.width, ALT_COL / voce.img.height, 1);
      lo = voce.img.width * scala; la = voce.img.height * scala;
      alt += la + 6;
    } else {
      alt += spezzaRighe(normale, testoPdf(mancaFoto(f)), 9, LARG_COL).length * 9 * 1.35 + 4;
    }
    const ref = String(f.referto || '').trim();
    if (ref) alt += spezzaRighe(normale, testoPdf(ref), 10, LARG_COL).length * 10 * 1.35 + 2;
    alt += spezzaRighe(normale, testoPdf(datiFoto(f, c)), 8, LARG_COL).length * 8 * 1.35;
    return { alt: alt, lo: lo, la: la };
  };
  const altezzaFoto = function (voce, c) { return voce ? misuraFoto(voce, c).alt : 0; };
  // Il testo dentro una colonna: stessa spezzatura del resto, ma largo mezza pagina.
  const scriviCol = function (testo, corpo, colore, x, cima) {
    spezzaRighe(normale, testoPdf(testo), corpo, LARG_COL).forEach(function (r) {
      if (r) pagina.drawText(r, { x: x, y: cima - corpo, size: corpo, font: normale, color: colore || PDF.rgb(0, 0, 0) });
      cima -= corpo * 1.35;
    });
    return cima;
  };
  const disegnaColonna = function (voce, c, x, cima, m) {
    const f = voce.foto;
    if (voce.img) {
      // Una foto in piedi è più stretta della colonna: si centra, così la pagina resta dritta.
      pagina.drawImage(voce.img, { x: x + (LARG_COL - m.lo) / 2, y: cima - m.la, width: m.lo, height: m.la });
      cima -= m.la + 6;
    } else {
      cima = scriviCol(mancaFoto(f), 9, PDF.rgb(0.45, 0.45, 0.45), x, cima) - 4;
    }
    const ref = String(f.referto || '').trim();
    if (ref) cima = scriviCol(ref, 10, null, x, cima) - 2;
    scriviCol(datiFoto(f, c), 8, PDF.rgb(0.45, 0.45, 0.45), x, cima);
  };
  /* Un documento non si mette in colonna: va largo quanto la pagina e alto quanto serve
     per leggerlo. Uno per riga, col suo cartellino sotto. */
  const ALT_DOC = 470;
  // Quanto è alto un documento sulla pagina: serve per non lasciare il titolo orfano in fondo.
  const altezzaDoc = function (voce) {
    if (!voce || !voce.img) return 40;
    return voce.img.height * Math.min(larghezza / voce.img.width, ALT_DOC / voce.img.height, 1) + 44;
  };
  const disegnaDocumenti = function (lista, c) {
    lista.forEach(function (voce) {
      const f = voce.foto;
      const eti = (GENERI[f.genere] || 'Documento') + ' - ' + f.codice + ' - ' + dataEstesa(f.giorno) + ', ' + (f.ora || '') + ' - ' + (c.nome || '');
      if (voce.pagine && voce.pagine.length) {
        /* Scansione PDF: l'etichetta e il referto stanno qui, poi le sue pagine
           entrano intere una dopo l'altra, e quello che segue riparte su una
           pagina nuova. Le pagine copiate contano nella numerazione. */
        spazio(40);
        scrivi(eti, 9, normale, PDF.rgb(0.45, 0.45, 0.45));
        if (String(f.referto || '').trim()) scrivi(f.referto, 10, normale);
        scrivi('(' + voce.pagine.length + (voce.pagine.length === 1 ? ' pagina allegata' : ' pagine allegate') + ')', 9, normale, PDF.rgb(0.45, 0.45, 0.45));
        voce.pagine.forEach(function (p) { doc.addPage(p); numero++; });
        pagina = null;
        return;
      }
      if (voce.img) {
        const scala = Math.min(larghezza / voce.img.width, ALT_DOC / voce.img.height, 1);
        const lo = voce.img.width * scala, la = voce.img.height * scala;
        spazio(Math.min(la + 44, A - 2 * M));
        y -= 4;
        pagina.drawImage(voce.img, { x: M + (larghezza - lo) / 2, y: y - la, width: lo, height: la });
        y -= la + 6;
      } else {
        spazio(40);
        scrivi('[' + (voce.fallito ? 'scansione PDF non copiabile: saltata' : (f.file ? 'documento non leggibile' : 'documento archiviato')) + ']', 10, normale, PDF.rgb(0.45, 0.45, 0.45));
      }
      if (String(f.referto || '').trim()) scrivi(f.referto, 10, normale);
      scrivi(eti, 9, normale, PDF.rgb(0.45, 0.45, 0.45));
      y -= 10;
    });
  };
  /* La carta intestata: logo a sinistra, i dati dell'azienda di fianco, e una riga sotto.
     Sta solo sulla prima pagina; sulle altre il nome torna nel piede. */
  const disegnaIntestazione = function () {
    if (!marchio.az) return;
    // Con la banda in cima la carta intestata c'è già: qui non si aggiunge niente.
    if (marchio.banda) return;
    const a = marchio.az;
    const righe = [a.ragione || a.nome, a.tecnico || '', a.indirizzo,
      [a.piva ? 'P.IVA ' + a.piva : '', a.telefono || ''].filter(Boolean).join('   -   '),
      [a.mail || '', a.sito || ''].filter(Boolean).join('   -   ')].filter(Boolean);
    let bassoLogo = y;
    let x = M;
    if (marchio.logo) {
      const scala = Math.min(140 / marchio.logo.width, 50 / marchio.logo.height, 1);
      const lo = marchio.logo.width * scala, la = marchio.logo.height * scala;
      pagina.drawImage(marchio.logo, { x: M, y: y - la, width: lo, height: la });
      bassoLogo = y - la;
      x = M + lo + 16;
    }
    let yy = y;
    righe.forEach(function (r, i) {
      const corpo = i === 0 ? 12 : 9;
      yy -= corpo;
      pagina.drawText(testoPdf(r), { x: x, y: yy, size: corpo, font: i === 0 ? grassetto : normale, color: i === 0 ? PDF.rgb(0, 0, 0) : PDF.rgb(0.4, 0.4, 0.4) });
      yy -= 4;
    });
    y = Math.min(bassoLogo, yy) - 10;
    pagina.drawLine({ start: { x: M, y: y }, end: { x: L - M, y: y }, thickness: 1.2, color: PDF.rgb(0.2, 0.2, 0.2) });
    y -= 18;
  };

  /* La firma in fondo: data a sinistra, azienda e firma a destra, sopra una riga.
     Se la firma non c'è resta lo spazio bianco per farla a penna. */
  const disegnaFirma = function () {
    if (!marchio.az) return;
    const a = marchio.az;
    spazio(130);
    y -= 24;
    pagina.drawText(testoPdf(dataEstesa(oggiISO())), { x: M, y: y - 10, size: 10, font: normale, color: PDF.rgb(0.45, 0.45, 0.45) });
    const x = L - M - 200;
    pagina.drawText(testoPdf(a.ragione || a.nome), { x: x, y: y - 10, size: 10, font: normale, color: PDF.rgb(0.45, 0.45, 0.45) });
    y -= 20;
    if (marchio.firma) {
      const scala = Math.min(200 / marchio.firma.width, 62 / marchio.firma.height, 1);
      const lo = marchio.firma.width * scala, la = marchio.firma.height * scala;
      pagina.drawImage(marchio.firma, { x: x, y: y - la, width: lo, height: la });
      y -= la + 4;
    } else y -= 46;
    pagina.drawLine({ start: { x: x, y: y }, end: { x: L - M, y: y }, thickness: 0.6, color: PDF.rgb(0.4, 0.4, 0.4) });
    pagina.drawText(testoPdf(a.tecnico ? a.tecnico : 'Firma'), { x: x, y: y - 12, size: 9, font: normale, color: PDF.rgb(0.45, 0.45, 0.45) });
    y -= 24;
  };

  const disegnaFotoGriglia = function (lista, c) {
    for (let i = 0; i < lista.length; i += 2) {
      const coppia = lista.slice(i, i + 2);
      const mis = coppia.map(function (v) { return misuraFoto(v, c); });
      const alt = Math.max.apply(null, mis.map(function (m) { return m.alt; }));
      // Le due foto della riga partono dalla stessa altezza; la riga finisce sulla più lunga.
      spazio(Math.min(alt + 12, A - 2 * M));
      const cima = y - 4;
      coppia.forEach(function (voce, j) { disegnaColonna(voce, c, M + j * (LARG_COL + VUOTO_COL), cima, mis[j]); });
      y = cima - alt - 12;
    }
  };
  // La relazione di fine cantiere ha una forma sua, ma la pagina, il testo e le foto sono questi:
  // le passa come attrezzi e si ferma qui. "giu" e "linea" muovono y e pagina, che vivono solo qui dentro.
  if (info.relazione) {
    disegnaRelazionePdf(info.relazione, {
      PDF: PDF, normale: normale, grassetto: grassetto, scrivi: scrivi, spazio: spazio, nuovaPagina: nuovaPagina,
      disegnaFotoGriglia: disegnaFotoGriglia, disegnaDocumenti: disegnaDocumenti, altezzaFoto: altezzaFoto, altezzaDoc: altezzaDoc,
      disegnaIntestazione: disegnaIntestazione, disegnaFirma: disegnaFirma,
      fotoPerGiorno: fotoPerVerbale, docPerGiorno: docPerVerbale,
      giu: function (n) { y -= n; },
      linea: function () { spazio(14); y -= 6; pagina.drawLine({ start: { x: M, y: y }, end: { x: L - M, y: y }, thickness: 0.8, color: PDF.rgb(0.2, 0.2, 0.2) }); y -= 12; }
    });
    return await doc.save();
  }
  const c0 = cantierePerCodice(verbali[0].cantiere) || {};
  let ultimoCantiere = c0;
  const conCopertina = info.modo === 'periodo' || (info.modo === 'sezione' && verbali.length > 1);
  if (conCopertina) {
    nuovaPagina();
    disegnaIntestazione();
    scrivi(soloSezione ? nomeSezione(soloSezione).toUpperCase() : 'VERBALI DI SOPRALLUOGO', 18, grassetto);
    y -= 6;
    scrivi((c0.codice || '') + ' - ' + (c0.nome || ''), 12, grassetto);
    scrivi('Committente: ' + (c0.committente || '') + (c0.indirizzo ? '\nIndirizzo: ' + c0.indirizzo : ''), 11, normale);
    scrivi('Periodo: dal ' + dataEstesa(info.dal) + ' al ' + dataEstesa(info.al) + ' - ' + verbali.length + (verbali.length === 1 ? ' verbale' : ' verbali'), 11, normale);
    if (riassunto) { y -= 8; scrivi('In breve', 11, grassetto); scrivi(riassunto, 11, normale); }
    y -= 10;
  }
  verbali.forEach(function (v, i) {
    const c = cantierePerCodice(v.cantiere) || {};
    if (!pagina) { nuovaPagina(); disegnaIntestazione(); } else if (i > 0) { y -= 16; spazio(120); }
    const testataPiena = !soloSezione || verbali.length === 1;
    if (testataPiena) {
      scrivi('VERBALE DI SOPRALLUOGO', 16, grassetto);
      y -= 4;
      if (v.nome) scrivi(v.nome, 12, grassetto);
      scrivi(v.codice + '   -   sopralluogo ' + (v.sopralluogo || ''), 11, normale);
      scrivi('Cantiere: ' + (c.codice || '') + ' - ' + (c.nome || '') + (c.indirizzo ? ' - ' + c.indirizzo : ''), 11, normale);
      scrivi('Committente: ' + (c.committente || ''), 11, normale);
      scrivi('Data: ' + dataEstesa(v.giorno) + '   Ora: ' + (v.ora || ''), 11, normale);
      spazio(14); y -= 6;
      pagina.drawLine({ start: { x: M, y: y }, end: { x: L - M, y: y }, thickness: 0.8, color: PDF.rgb(0.2, 0.2, 0.2) });
      y -= 12;
    } else {
      scrivi(dataEstesa(v.giorno).toUpperCase() + ' - ' + nomeVerbale(v), 12, grassetto);
    }
    const chiavi = soloSezione ? [soloSezione] : CHIAVI_SEZIONI;
    const fotoQui = fotoPerVerbale[v.id] || {};
    let stampate = 0;
    chiavi.forEach(function (k) {
      const testo = String(v.sezioni[k] || '').trim();
      const foto = fotoQui[k] || [];
      if (!testo && !foto.length) return;
      const def = SEZIONI.find(function (z) { return z.chiave === k; });
      // Una sezione di sole foto: il titolo deve stare nella stessa pagina della prima foto, non orfano in fondo.
      spazio(40 + (testo ? 0 : altezzaFoto(foto[0], c) + 40));
      scrivi(def.nome.toUpperCase(), 11, grassetto);
      if (!testo) { /* sezione con sole foto: il titolo fa da intestazione e basta */ }
      else if (def.elenco) righeElenco(testo).forEach(function (r) { scrivi('• ' + r, 11, normale, null, 6); });
      else scrivi(testo, 11, normale);
      disegnaFotoGriglia(foto, c);
      y -= 8;
      stampate++;
    });
    if (!stampate) scrivi(soloSezione ? '(sezione vuota)' : '(nessuna sezione compilata)', 11, normale, PDF.rgb(0.45, 0.45, 0.45));
    if (i === verbali.length - 1) ultimoCantiere = c;
    const docQui = docPerVerbale[v.id] || [];
    if (docQui.length) {
      y -= 6;
      // Il titolo resta sulla stessa pagina del primo documento.
      spazio(Math.min(30 + altezzaDoc(docQui[0]), A - 2 * M));
      scrivi('DOCUMENTI ALLEGATI', 11, grassetto);
      disegnaDocumenti(docQui, c);
    }
  });
  disegnaFirma();
  return await doc.save();
}

/* I sopralluoghi da cui un verbale prende foto e documenti: uno solo per il verbale di un
   sopralluogo; per la giornata tutti i passaggi, nell'ordine di v.sopralluoghi, o per ora
   se un verbale di giornata vecchio non lo porta. Lo stato del sopralluogo non conta. */
function sopralluoghiDelVerbale(v, sops) {
  if (!v.giornata) return sops.filter(function (x) { return x.codice === v.sopralluogo; });
  if (!(v.sopralluoghi || []).length) return sopralluoghiDelGiorno(v.cantiere, v.giorno);
  return v.sopralluoghi.map(function (k) { return sops.find(function (x) { return x.codice === k; }); })
    .filter(Boolean);
}

/* Le foto marcate dei verbali richiesti, ricompresse per la stampa e già incorporate nel
   documento: { idVerbale: { chiaveSezione: [ { foto, img } ] } }. Una foto il cui file non
   c'è più (archiviata) entra lo stesso, senza immagine: il referto è informazione. */
async function preparaFotoPdf(doc, verbali, soloSezione) {
  const per = {};
  const sops = valori(leggiTutto().sopralluoghi);
  for (const v of verbali) {
    for (const s of sopralluoghiDelVerbale(v, sops)) for (const f of fotoNormali(s)) {
      if (!f.nelPdf) continue;
      const k = sezioneFoto(f);
      if (soloSezione && k !== soloSezione) continue;
      let img = null;
      if (f.file) {
        const blob = await leggiMedia(f.file);
        if (blob) {
          try {
            const ridotta = await riduciFoto(blob, LATO_FOTO_PDF, QUALITA_FOTO_PDF);
            img = await doc.embedJpg(await ridotta.blob.arrayBuffer());
          } catch (e) { img = null; }
        }
      }
      per[v.id] = per[v.id] || {};
      (per[v.id][k] = per[v.id][k] || []).push({ foto: f, img: img });
    }
  }
  return per;
}

/* Logo e firma dell'azienda del cantiere, già incorporati nel documento. Senza azienda,
   o senza immagini, si restituisce vuoto e il PDF esce come prima. */
async function preparaMarchio(doc, primo) {
  const vuoto = { az: null, logo: null, firma: null, banda: null, piede: null };
  if (!primo) return vuoto;
  const c = cantierePerCodice(primo.cantiere);
  const a = aziendaDiCantiere(c);
  if (!a) return vuoto;
  const dentro = async function (rif) {
    if (!rif) return null;
    const blob = await leggiMedia(rif);
    if (!blob) return null;
    try {
      const ridotta = await riduciFoto(blob, LATO_LOGO, QUALITA_LOGO);
      return await doc.embedJpg(await ridotta.blob.arrayBuffer());
    } catch (e) { return null; }
  };
  const dentroGrande = async function (rif) {
    if (!rif) return null;
    const blob = await leggiMedia(rif);
    if (!blob) return null;
    try {
      const ridotta = await riduciFoto(blob, LATO_BANDA, QUALITA_LOGO);
      return await doc.embedJpg(await ridotta.blob.arrayBuffer());
    } catch (e) { return null; }
  };
  return { az: a, logo: await dentro(a.logo), firma: await dentro(a.firma),
    banda: await dentroGrande(a.banda), piede: await dentroGrande(a.bandaPiede) };
}

/* Le bolle e i moduli firme marcati, pronti da stampare: { idVerbale: [ { foto, img } ] }.
   Si riducono meno delle foto, perché di un documento conta quello che c'è scritto. */
async function preparaDocumentiPdf(doc, verbali) {
  const per = {};
  const sops = valori(leggiTutto().sopralluoghi);
  for (const v of verbali) {
    for (const s of sopralluoghiDelVerbale(v, sops)) for (const f of documentiDi(s)) {
      if (!f.nelPdf) continue;
      let img = null, pagine = null, fallito = false;
      if (f.file) {
        const blob = await leggiMedia(f.file);
        if (blob) {
          try {
            if (f.formato === 'pdf') {
              /* Una scansione PDF si copia dentro pagina per pagina. Se non si
                 riesce (file rovinato, cifrato), il documento si salta e nel PDF
                 resta una riga che lo dice: l'esportazione non si ferma. */
              const src = await window.PDFLib.PDFDocument.load(await blob.arrayBuffer(), { ignoreEncryption: true });
              pagine = await doc.copyPages(src, src.getPageIndices());
            } else {
              const ridotta = await riduciFoto(blob, LATO_DOC_PDF, QUALITA_DOC_PDF);
              img = await doc.embedJpg(await ridotta.blob.arrayBuffer());
            }
          } catch (e) { img = null; pagine = null; fallito = true; }
        }
      }
      (per[v.id] = per[v.id] || []).push({ foto: f, img: img, pagine: pagine, fallito: fallito });
    }
  }
  return per;
}

/* La relazione di fine cantiere sulla carta, nell'ordine deciso: intestazione, numeri, in breve,
   riepilogo per sezione, contabilità col totale, elenco dei giorni, foto marcate. Riceve gli
   attrezzi di costruisciPdf e non ne conosce l'interno: la meccanica del PDF resta una sola. */
function disegnaRelazionePdf(rel, a) {
  const c = cantierePerCodice(rel.cantiere) || {};
  const grigio = a.PDF.rgb(0.45, 0.45, 0.45);
  const giallo = a.PDF.rgb(0.62, 0.45, 0);
  const n = rel.numeri || {};
  const titolo = function (t) { a.giu(6); a.spazio(70); a.scrivi(t, 12, a.grassetto); a.giu(4); };
  a.nuovaPagina();
  a.disegnaIntestazione();
  a.scrivi('RELAZIONE DI FINE CANTIERE', 18, a.grassetto);
  a.giu(4);
  a.scrivi(rel.codice, 11, a.normale);
  a.scrivi('Cantiere: ' + (c.codice || '') + ' - ' + (c.nome || '') + (c.indirizzo ? ' - ' + c.indirizzo : ''), 11, a.normale);
  a.scrivi('Committente: ' + (c.committente || ''), 11, a.normale);
  a.scrivi('Aperto il ' + dataEstesa(rel.apertura) + '   -   Chiuso il ' + dataEstesa(rel.chiusura), 11, a.normale);
  a.linea();
  // I numeri in una riga, e il totale sotto in grassetto
  const conta = function (q, uno, tanti) { return (q || 0) + ' ' + ((q || 0) === 1 ? uno : tanti); };
  a.scrivi(conta(n.giorni, 'giorno di sopralluogo', 'giorni di sopralluogo') + ', ' + conta(n.verbali, 'verbale chiuso', 'verbali chiusi') + ', ' + conta(n.aperte, 'giornata non chiusa', 'giornate non chiuse') + ', ' + (n.foto || 0) + ' foto, ' + (n.documenti || 0) + ' documenti, ' + durataLunga(n.parlato) + ' di parlato', 11, a.normale);
  a.scrivi('Contabilità: ' + euro(contiContabilita(rel.contabilita).totale), 12, a.grassetto);
  if (String(rel.inBreve || '').trim()) { titolo('IN BREVE'); a.scrivi(rel.inBreve, 11, a.normale); }
  // Il riepilogo per sezione: le sezioni vuote non si stampano
  titolo('RIEPILOGO PER SEZIONE');
  let stampate = 0;
  SEZIONI.forEach(function (z) {
    const blocchi = (rel.sezioni[z.chiave] || []).filter(function (b) { return String(b.testo || '').trim(); });
    if (!blocchi.length) return;
    a.spazio(60);
    a.scrivi(z.nome.toUpperCase(), 11, a.grassetto);
    blocchi.forEach(function (b) {
      a.spazio(40);
      a.scrivi(etichettaBlocco(b, true), 9, a.normale, grigio);
      if (z.elenco) righeElenco(b.testo).forEach(function (r) { a.scrivi('• ' + r, 11, a.normale, null, 6); });
      else a.scrivi(b.testo, 11, a.normale);
      a.giu(4);
    });
    a.giu(6);
    stampate++;
  });
  if (!stampate) a.scrivi('(nessuna sezione compilata)', 11, a.normale, grigio);
  // La contabilità completa: ogni riga coi suoi numeri, le righe senza prezzo segnalate, il totale in fondo
  const cont = rel.contabilita || { righe: [], totale: 0, note: '' };
  titolo('CONTABILITÀ' + (cont.codice ? ' - ' + cont.codice : ''));
  if (!cont.righe.length) a.scrivi('(nessuna riga)', 11, a.normale, grigio);
  cont.righe.forEach(function (r) {
    a.spazio(36);
    a.scrivi((r.codice ? r.codice + '   ' : '') + (r.descrizione || '(senza descrizione)'), 11, a.normale);
    a.scrivi(numeroIt(r.quantita) + ' ' + (r.um || '') + '  ×  ' + euro(r.prezzo) + '  =  ' + (r.dacompletare ? 'DA COMPLETARE: manca il prezzo' : euro(r.importo)), 10, a.normale, r.dacompletare ? giallo : grigio, 6);
    a.giu(3);
  });
  const daCompletare = cont.righe.filter(function (r) { return r.dacompletare; }).length;
  // In fondo i conti: solo il totale se sconto e IVA sono a zero, se no tutti e cinque
  const k = contiContabilita(cont);
  a.giu(4); a.spazio(k.pSconto || k.pIva ? 100 : 40);
  if (k.pSconto || k.pIva) {
    a.scrivi('Totale lavori   ' + euro(k.lavori), 11, a.normale, grigio);
    if (k.pSconto) a.scrivi('Sconto ' + numeroIt(k.pSconto) + '%   -' + euro(k.sconto), 11, a.normale, grigio);
    a.scrivi('Imponibile   ' + euro(k.imponibile), 11, a.normale, grigio);
    if (k.pIva) a.scrivi('IVA ' + numeroIt(k.pIva) + '%   ' + euro(k.iva), 11, a.normale, grigio);
  }
  a.scrivi('TOTALE   ' + euro(k.totale), 13, a.grassetto);
  if (daCompletare) a.scrivi(daCompletare + (daCompletare === 1 ? ' riga senza prezzo non conta' : ' righe senza prezzo non contano') + ' nel totale.', 10, a.normale, giallo);
  if (String(cont.note || '').trim()) a.scrivi('Note: ' + cont.note, 10, a.normale, grigio);
  // L'elenco dei giorni, dal primo all'ultimo; le giornate non chiuse marcate
  titolo('ELENCO DEI GIORNI');
  if (!rel.giorni.length) a.scrivi('(nessun giorno di sopralluogo)', 11, a.normale, grigio);
  rel.giorni.forEach(function (g) {
    a.scrivi('• ' + dataEstesa(g.giorno) + ', ' + (g.ora || '') + '  -  ' + (g.chiuso ? (g.verbale || 'chiusa') : g.sopralluogo + ' (NON CHIUSA)') + '  -  ' + g.sezioni + ' sezioni, ' + g.audio + ' audio, ' + g.foto + ' foto' + (g.documenti ? ', ' + g.documenti + ' documenti' : ''), 11, a.normale, g.chiuso ? null : giallo, 6);
  });
  // I documenti allegati, giorno per giorno: bolle e moduli firme, larghi quanto la pagina
  const conDoc = rel.giorni.filter(function (g) { return (a.docPerGiorno[g.sop] || []).length; });
  if (conDoc.length) {
    titolo('DOCUMENTI ALLEGATI');
    conDoc.forEach(function (g) {
      a.spazio(30 + a.altezzaDoc((a.docPerGiorno[g.sop] || [])[0]));
      a.scrivi(dataEstesa(g.giorno).toUpperCase() + ' - ' + (g.verbale || g.sopralluogo), 11, a.grassetto);
      a.disegnaDocumenti(a.docPerGiorno[g.sop], c);
    });
  }
  // Le foto marcate, giorno per giorno, con il referto: come nel PDF del verbale
  const conFoto = rel.giorni.filter(function (g) { return a.fotoPerGiorno[g.sop]; });
  if (conFoto.length) {
    a.giu(6);
    conFoto.forEach(function (g, i) {
      const per = a.fotoPerGiorno[g.sop];
      const prima = CHIAVI_SEZIONI.map(function (k) { return (per[k] || [])[0]; }).filter(Boolean)[0];
      // Il titolo FOTO e quello del giorno restano sulla stessa pagina della prima foto, non orfani in fondo.
      a.spazio((i === 0 ? 30 : 0) + 40 + a.altezzaFoto(prima, c) + 40);
      if (i === 0) { a.scrivi('FOTO', 12, a.grassetto); a.giu(4); }
      a.scrivi(dataEstesa(g.giorno).toUpperCase() + ' - ' + (g.verbale || g.sopralluogo), 11, a.grassetto);
      // Il nome della sezione una volta sola, poi le sue foto a due per riga.
      CHIAVI_SEZIONI.forEach(function (k) {
        const qui = per[k] || [];
        if (!qui.length) return;
        a.scrivi(nomeSezione(k), 9, a.normale, grigio);
        a.disegnaFotoGriglia(qui, c);
      });
    });
  }
  a.disegnaFirma();
}

async function creaPdfRelazione(relId, soloScarica) {
  if (!window.PDFLib) { avvisa('PDF non pronto: serve la rete la prima volta', 'err'); return; }
  const rel = relazione(relId);
  if (!rel) return;
  avvisa('Preparo il PDF…');
  // Le foto marcate si cercano giorno per giorno: a preparaFotoPdf bastano l'id e il codice del sopralluogo.
  const giorni = rel.giorni.map(function (g) { return { id: g.sop, sopralluogo: g.sopralluogo, cantiere: rel.cantiere, giorno: g.giorno }; });
  let byte;
  try { byte = await costruisciPdf(giorni.length ? giorni : [{ cantiere: rel.cantiere }], null, rel.inBreve, { modo: 'relazione', relazione: rel }); }
  catch (e) { avvisa('PDF non riuscito', 'err'); return; }
  await archiviaPdf(byte, rel.codice + '.pdf', { chiave: 'relazione:' + rel.codice, tipo: 'relazione', cantiere: rel.cantiere, giorno: rel.chiusura });
  const blob = new Blob([byte], { type: 'application/pdf' });
  // "Scarica" salva il file nel telefono; "Esporta" apre la condivisione.
  if (soloScarica) scaricaBlob(blob, rel.codice + '.pdf');
  else await condividiFile(blob, rel.codice + '.pdf', 'Relazione di fine cantiere');
}
/* Scarica la relazione: il PDF archiviato se c'è, se no lo si fa adesso. */
async function scaricaRelazione(relId) {
  const rel = relazione(relId);
  if (!rel) return;
  const p = pdfConChiave('relazione:' + rel.codice);
  const blob = p && p.file ? await leggiMedia(p.file) : null;
  if (blob) { scaricaBlob(blob, p.nome || rel.codice + '.pdf'); return; }
  await creaPdfRelazione(relId, true);
}

/* ---------------- LA SETTIMANA ----------------
   La settimana va da lunedì a domenica. Passata, i suoi audio e le sue foto restano nel
   telefono solo fino a mercoledì. Lunedì e martedì una riga in testa dice "Libera memoria":
   fa i PDF che mancano — il verbale di giornata di ogni giorno, il verbale di settimana di
   ogni cantiere — li manda fuori, e poi svuota audio e foto. Da mercoledì lo fa l'app da
   sola: i PDF restano nell'archivio dentro l'app, audio e foto se ne vanno. Le foto da lì
   in poi vivono nei PDF, col loro referto. Il testo e i verbali non si toccano mai. */

// Il lunedì della settimana in cui cade una data.
function lunediDi(iso) {
  const d = daISO(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dataLocaleISO(d);
}
// Da lunedì a domenica, partendo dal lunedì.
function settimanaDa(lunedi) {
  const d = daISO(lunedi);
  d.setDate(d.getDate() + 6);
  return { inizio: lunedi, fine: dataLocaleISO(d) };
}
function settimanaScorsa() {
  const lun = daISO(lunediDi(oggiISO()));
  lun.setDate(lun.getDate() - 7);
  return settimanaDa(dataLocaleISO(lun));
}
// Lunedì e martedì: la settimana scorsa aspetta "Libera memoria", se non è già a posto.
function settimanaDaChiudere() {
  if ((daISO(oggiISO()).getDay() + 6) % 7 > 1) return null;
  const s = settimanaScorsa();
  return leggiLocale().settimane[s.inizio] ? null : s;
}

// Quello che c'è dentro una settimana: le registrazioni con l'audio e le foto di quei giorni.
function materialeSettimana(inizio, fine) {
  const audio = [], foto = [];
  valori(leggiTutto().sopralluoghi).forEach(function (s) {
    if (s.giorno < inizio || s.giorno > fine) return;
    s.pezzi.forEach(function (p) { if (p.audio) audio.push({ sop: s, pezzo: p }); });
    fotoDi(s).forEach(function (f) { foto.push({ sop: s, foto: f }); });
  });
  return { audio: audio, foto: foto };
}
async function pesoSettimana(inizio, fine) {
  const m = materialeSettimana(inizio, fine);
  const elenco = await elencaMedia();
  const pesi = {};
  elenco.forEach(function (x) { pesi[x.id] = x.peso || 0; });
  let byte = 0;
  m.audio.forEach(function (a) { byte += pesi[a.pezzo.audio.replace(/^idb:/, '')] || 0; });
  m.foto.forEach(function (f) { if (f.foto.file) byte += pesi[f.foto.file.replace(/^idb:/, '')] || 0; });
  return { audio: m.audio.length, foto: m.foto.length, byte: byte };
}
// Le settimane passate, fino a quella data, che hanno ancora audio o foto: dalla più vecchia.
function settimaneConMateriale(fineUltima) {
  const per = {};
  valori(leggiTutto().sopralluoghi).forEach(function (s) {
    if (s.giorno > fineUltima) return;
    if (s.pezzi.some(function (p) { return p.audio; }) || fotoDi(s).length) per[lunediDi(s.giorno)] = true;
  });
  return Object.keys(per).sort().map(settimanaDa);
}

/* I PDF di una settimana: il verbale di giornata di ogni giorno lavorato, e il verbale di
   settimana di ogni cantiere. Quelli che mancano si fanno adesso, verbali compresi; quelli
   che ci sono già si prendono com'erano. Se un PDF non riesce, si dice quanti mancano:
   con un buco non si svuota niente. */
async function pdfDellaSettimana(inizio, fine) {
  const schede = [];
  let mancanti = 0;
  const perCantiere = {};
  valori(leggiTutto().sopralluoghi).forEach(function (s) {
    if (s.giorno < inizio || s.giorno > fine) return;
    (perCantiere[s.cantiere] = perCantiere[s.cantiere] || {})[s.giorno] = true;
  });
  for (const codice of Object.keys(perCantiere)) {
    const c = cantierePerCodice(codice);
    if (!c) continue;
    for (const giorno of Object.keys(perCantiere[codice]).sort()) {
      const vg = verbaleDiGiornata(codice, giorno) || scriviVerbaleGiornata(codice, giorno, '');
      const p = vg && (pdfConChiave('verbale:' + vg.codice) || await pdfVerbale(vg));
      if (p) schede.push(p); else mancanti++;
    }
    const ps = pdfConChiave('periodo:' + codice + ':' + inizio + ':' + fine) || await pdfPeriodo(c, inizio, fine);
    if (ps) schede.push(ps); else mancanti++;
  }
  return { schede: schede, mancanti: mancanti };
}

/* Audio e foto di una settimana se ne vanno dal telefono. Le registrazioni restano come
   righe senza file — il loro testo è già nelle sezioni — le foto spariscono del tutto:
   da qui in poi vivono nei PDF. */
async function svuotaSettimana(inizio, fine) {
  const loc = leggiLocale();
  const oggi = oggiISO();
  let tolti = 0;
  for (const s of valori(leggiTutto().sopralluoghi)) {
    if (s.giorno < inizio || s.giorno > fine) continue;
    let toccato = false;
    for (const p of s.pezzi) {
      if (!p.audio) continue;
      await cancellaMedia(p.audio);
      p.audio = null; p.archiviato = oggi; toccato = true; tolti++;
    }
    const foto = fotoDi(s);
    if (foto.length) {
      const id = {};
      foto.forEach(function (f) { id[f.id] = true; });
      loc.coda = loc.coda.filter(function (l) { return !id[l.foto]; });
      await cancellaFileFoto(s);
      s.media = (s.media || []).filter(function (m) { return !(m && m.tipo === 'foto'); });
      toccato = true; tolti += foto.length;
    }
    if (toccato) salva('sopralluogo', s);
  }
  salvaLocale();
  return tolti;
}

/* "Libera memoria", a mano: i PDF della settimana escono dal foglio di condivisione
   (mail, WhatsApp, salva), e solo dopo audio e foto si buttano. Annullando non si tocca niente. */
async function liberaMemoria(inizio, fine) {
  if (!window.PDFLib) { avvisa('PDF non pronto: serve la rete la prima volta', 'err'); return; }
  const ok = await chiedi('Libera memoria?', 'Settimana ' + dataSenzaAnno(inizio) + ' – ' + dataSenzaAnno(fine) + ': si fanno i PDF che mancano (verbale di ogni giornata, verbale di settimana di ogni cantiere), li mandi fuori o li salvi, e poi audio e foto di quei giorni si tolgono dal telefono. Restano nei PDF.', 'Vai', 'rosso');
  chiudiFoglio();
  if (!ok) return;
  avvisa('Preparo i PDF della settimana…');
  const r = await pdfDellaSettimana(inizio, fine);
  if (r.mancanti) { avvisa(r.mancanti + (r.mancanti === 1 ? ' PDF non riuscito' : ' PDF non riusciti') + ': non svuoto niente', 'err'); return; }
  const file = [];
  for (const p of r.schede) {
    const blob = p.file ? await leggiMedia(p.file) : null;
    if (blob) file.push(new File([blob], p.nome, { type: 'application/pdf' }));
  }
  if (file.length && !(await portaFuori(file, 'CANTIERI · settimana del ' + dataSenzaAnno(inizio)))) return;
  const tolti = await svuotaSettimana(inizio, fine);
  segnaSettimanaFatta(inizio, 'mandata');
  avvisa(file.length + ' PDF mandati fuori' + (tolti ? ' · ' + tolti + ' file liberati' : ''), 'ok');
  SETT_CONTO.inizio = null;
  await contaSettimana();
  aggiornaVista();
}

/* Da mercoledì l'app chiude da sola le settimane passate che hanno ancora audio o foto:
   fa i PDF che mancano, li tiene in archivio, e svuota. Se un PDF non riesce — manca la
   rete e pdf-lib non c'è ancora — quella settimana aspetta la volta dopo. */
async function pulisciSettimane() {
  if ((daISO(oggiISO()).getDay() + 6) % 7 < 2 || !window.PDFLib) return;
  let chiuse = 0;
  for (const sett of settimaneConMateriale(settimanaScorsa().fine)) {
    const r = await pdfDellaSettimana(sett.inizio, sett.fine);
    if (r.mancanti) continue;
    await svuotaSettimana(sett.inizio, sett.fine);
    segnaSettimanaFatta(sett.inizio, 'automatica');
    chiuse++;
  }
  if (chiuse) {
    avvisa((chiuse === 1 ? 'Settimana passata chiusa' : chiuse + ' settimane passate chiuse') + ': PDF in archivio, audio e foto liberati', 'ok');
    SETT_CONTO.inizio = null;
    aggiornaVista();
  }
}

function segnaSettimanaFatta(inizio, come) {
  const loc = leggiLocale();
  loc.settimane[inizio] = { come: come, quando: adessoISO() };
  salvaLocale();
}

/* Il PDF di un verbale — di giornata o di sopralluogo — fatto e archiviato senza domande. */
async function pdfVerbale(v) {
  if (!window.PDFLib) return null;
  let byte;
  try { byte = await costruisciPdf([v], null, '', { modo: 'questo' }); } catch (e) { return null; }
  return await archiviaPdf(byte, (v.nome ? v.codice + '_' + nomeFile(v.nome) : v.codice) + '.pdf',
    { chiave: 'verbale:' + v.codice, tipo: 'verbale', cantiere: v.cantiere, sopralluogo: v.sopralluogo || '', giorno: v.giorno });
}
/* I verbali di un cantiere in un periodo. Un giorno entra una volta sola: se ha il verbale
   di giornata vale quello, che già mette insieme i sopralluoghi; se no i verbali dei
   singoli sopralluoghi. */
function verbaliDelPeriodo(codiceCantiere, dal, al) {
  const tutti = valori(leggiTutto().verbali).filter(function (x) { return x.cantiere === codiceCantiere && x.giorno >= dal && x.giorno <= al; });
  const giorniConGiornata = {};
  tutti.forEach(function (x) { if (x.giornata) giorniConGiornata[x.giorno] = true; });
  return tutti.filter(function (x) { return x.giornata || !giorniConGiornata[x.giorno]; })
    .sort(function (a, b) { return (a.giorno + a.ora).localeCompare(b.giorno + b.ora); });
}
// Due righe in testa che dicono come è andato il periodo: le scrive Claude dai verbali, se può.
async function riassuntoPeriodo(verbali) {
  if (!(verbali.length > 1 && chiaveAnthropic() && navigator.onLine)) return '';
  try {
    const testo = verbali.map(function (x) { return dataBreve(x.giorno) + ':\n' + sezioniPiene(x.sezioni).map(function (k) { return nomeSezione(k) + ': ' + x.sezioni[k]; }).join('\n'); }).join('\n\n');
    return (await chiamaClaude(REGOLE_RIASSUNTO, 'Verbali:\n' + testo.slice(0, 20000), 800)).trim();
  } catch (e) { return ''; }
}
/* Il PDF di un periodo di un cantiere, fatto e archiviato: da lunedì a domenica è il
   verbale di settimana. Senza verbali nel periodo non c'è niente da fare. */
async function pdfPeriodo(c, dal, al) {
  if (!window.PDFLib) return null;
  const verbali = verbaliDelPeriodo(c.codice, dal, al);
  if (!verbali.length) return null;
  let byte;
  try { byte = await costruisciPdf(verbali, null, await riassuntoPeriodo(verbali), { dal: dal, al: al, modo: 'periodo' }); }
  catch (e) { return null; }
  return await archiviaPdf(byte, c.codice + '_' + dal + '_' + al + '.pdf',
    { chiave: 'periodo:' + c.codice + ':' + dal + ':' + al, tipo: 'periodo', cantiere: c.codice, sopralluogo: '', giorno: al });
}

/* ---------------- L'ARCHIVIO DEI PDF ----------------
   Un PDF generato non si butta più: resta nel telefono e si riapre dall'app. È lui
   l'archivio vero, perché foto e audio prima o poi se ne vanno. Rifare lo stesso
   documento non ne crea un secondo: sostituisce quello di prima, stessa chiave. */

function pdfArchiviati() {
  const l = leggiLocale().pdf;
  return Array.isArray(l) ? l : [];
}
function pdfDi(codiceCantiere) {
  return pdfArchiviati().filter(function (p) { return p.cantiere === codiceCantiere; })
    .sort(function (a, b) { return String(b.quando).localeCompare(String(a.quando)); });
}
function pdfConChiave(chiave) {
  return pdfArchiviati().find(function (p) { return p.chiave === chiave; }) || null;
}
function pdfPerSopralluogo(codiceSop) {
  return pdfArchiviati().find(function (p) { return p.tipo === 'verbale' && p.sopralluogo === codiceSop; }) || null;
}

async function archiviaPdf(byte, nome, meta) {
  const loc = leggiLocale();
  if (!Array.isArray(loc.pdf)) loc.pdf = [];
  const id = nuovoId();
  let rif;
  try { rif = await salvaMedia(id, new Blob([byte], { type: 'application/pdf' })); }
  catch (e) { avvisa('PDF non archiviato: manca spazio', 'att'); return null; }
  // Stessa chiave, stesso documento: quello vecchio esce di scena e il suo file si cancella.
  const vecchio = loc.pdf.find(function (p) { return p.chiave === meta.chiave; });
  if (vecchio) {
    if (vecchio.file) await cancellaMedia(vecchio.file);
    loc.pdf = loc.pdf.filter(function (p) { return p !== vecchio; });
  }
  const scheda = {
    id: id, chiave: meta.chiave, tipo: meta.tipo, nome: nome,
    cantiere: meta.cantiere || '', sopralluogo: meta.sopralluogo || '', giorno: meta.giorno || oggiISO(),
    quando: adessoISO(), peso: byte.length || byte.byteLength || 0, file: rif
  };
  loc.pdf.push(scheda);
  salvaLocale();
  return scheda;
}

/* pdf.js serve solo a guardare un PDF dentro l'app: si scarica la prima volta
   che si tocca "Visualizza", non all'avvio. Sta su cdnjs, l'unico posto esterno
   che il service worker mette in cache, quindi dalla seconda volta c'è anche
   senza linea. */
let PDFJS = null;
function caricaPdfJs() {
  if (PDFJS) return PDFJS;
  PDFJS = new Promise(function (ok, no) {
    if (window.pdfjsLib) return ok(window.pdfjsLib);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      ok(window.pdfjsLib);
    };
    s.onerror = function () { PDFJS = null; no(new Error('serve la rete la prima volta')); };
    document.head.appendChild(s);
  });
  return PDFJS;
}

/* Disegna le pagine del PDF una sotto l'altra, dentro la schermata. */
async function mostraPdfDentro(idPdf) {
  const box = document.getElementById('pdf-pagine');
  if (!box) return;
  const p = pdfArchiviati().find(function (x) { return x.id === idPdf; });
  if (!p) { box.innerHTML = '<div class="vuoto-stato">Questo PDF non c\'è più.</div>'; return; }
  try {
    const lib = await caricaPdfJs();
    const blob = p.file ? await leggiMedia(p.file) : null;
    if (!blob) { box.innerHTML = '<div class="vuoto-stato">Il file non c\'è più.</div>'; return; }
    const doc = await lib.getDocument({ data: await blob.arrayBuffer() }).promise;
    box.innerHTML = '';
    const largo = Math.min(box.clientWidth || 360, 900);
    for (let n = 1; n <= doc.numPages; n++) {
      const pagina = await doc.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      // Si disegna al doppio per non vedere i pixel sugli schermi fitti.
      const scala = (largo / base.width) * Math.min(window.devicePixelRatio || 1, 2);
      const vista = pagina.getViewport({ scale: scala });
      const tela = document.createElement('canvas');
      tela.width = vista.width; tela.height = vista.height;
      tela.className = 'pdf-pagina';
      tela.style.width = largo + 'px';
      box.appendChild(tela);
      await pagina.render({ canvasContext: tela.getContext('2d'), viewport: vista }).promise;
    }
  } catch (e) {
    box.innerHTML = '<div class="vuoto-stato">Non riesco a mostrarlo qui: ' + h(e.message) + '.<br>Usa Esporta per aprirlo fuori.</div>';
  }
}

/* La schermata che mostra un PDF archiviato. */
function vistaLeggiPdf(idPdf) {
  const p = pdfArchiviati().find(function (x) { return x.id === idPdf; });
  if (!p) return vistaDashboard();
  const c = p.cantiere ? cantierePerCodice(p.cantiere) : null;
  const sop = p.sopralluogo ? valori(leggiTutto().sopralluoghi).find(function (z) { return z.codice === p.sopralluogo; }) : null;
  const v = sop ? verbaleDiSopralluogo(sop.codice) : null;
  /* Indietro torna da dove si è venuti: il PDF di un sopralluogo o di una giornata
     riporta nella giornata; gli altri (periodo, sezione, relazione) nell'elenco dei PDF. */
  const vg = p.tipo === 'verbale' && !sop ? verbalePerCodice(String(p.chiave || '').replace(/^verbale:/, '')) : null;
  const giornata = vg && vg.giornata ? (sopralluoghiDelGiorno(vg.cantiere, vg.giorno)[0] || null) : null;
  let indietro = c ? '#/pdf/' + c.id : '#/';
  if (sop) indietro = '#/giorno/' + sop.id;
  else if (giornata) indietro = '#/giorno/' + giornata.id;
  else if (vg && vg.giornata && giornataDi(vg.cantiere, vg.giorno)) indietro = '#/giornata/' + giornataDi(vg.cantiere, vg.giorno).id;
  let html = testata({
    indietro: indietro,
    titolo: p.nome || 'documento.pdf',
    sotto: h(dataBreve(p.giorno)) + ' · ' + h(pesoFile(p.peso || 0))
  });
  html += '<div id="pdf-pagine" class="pdf-pagine"><div class="vuoto-stato">Apro il documento…</div></div>';
  html += '<div class="barra"><button class="az verde" data-az="pdf-manda" data-id="' + h(p.id) + '"><span class="ico ico-invio"></span> Esporta</button>' +
    (v ? '<button class="az" data-az="pdf-modifica" data-id="' + h(v.id) + '">Modifica</button>' : '') + '</div>';
  return html;
}

async function apriPdf(id) {
  const p = pdfArchiviati().find(function (x) { return x.id === id; });
  if (!p) return;
  const blob = p.file ? await leggiMedia(p.file) : null;
  if (!blob) { avvisa('Il file non c\'è più', 'err'); return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
}

async function mandaFuoriPdf(id) {
  const p = pdfArchiviati().find(function (x) { return x.id === id; });
  if (!p) return;
  const blob = p.file ? await leggiMedia(p.file) : null;
  if (!blob) { avvisa('Il file non c\'è più', 'err'); return; }
  await condividiFile(blob, p.nome, 'PDF di CANTIERI');
}

async function eliminaPdf(id) {
  const loc = leggiLocale();
  const p = pdfArchiviati().find(function (x) { return x.id === id; });
  if (!p) return;
  if (p.file) await cancellaMedia(p.file);
  loc.pdf = pdfArchiviati().filter(function (x) { return x.id !== id; });
  salvaLocale();
}

const NOMI_PDF = { verbale: 'Verbale della giornata', periodo: 'Verbali di un periodo', sezione: 'Una sezione sola', relazione: 'Relazione di fine cantiere' };

function vistaPdf(idCantiere) {
  const c = cantiere(idCantiere);
  if (!c) return vistaDashboard();
  const elenco = pdfDi(c.codice);
  const totale = elenco.reduce(function (t, p) { return t + (p.peso || 0); }, 0);
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'PDF', sotto: h(c.nome) + ' · ' + elenco.length + (elenco.length === 1 ? ' documento · ' : ' documenti · ') + h(pesoFile(totale)) });
  if (!elenco.length) return html + '<div class="vuoto-stato">Ancora nessun PDF. Si archiviano da soli quando li generi.</div>';
  let meseCorrente = null;
  elenco.forEach(function (p) {
    const mese = String(p.giorno).slice(0, 7);
    if (mese !== meseCorrente) {
      if (meseCorrente) html += '</div>';
      html += '<div class="eti">' + h(titoloMese(p.giorno)) + '</div><div class="card">';
      meseCorrente = mese;
    }
    html += '<div class="riga-pdf"><button class="n" data-az="pdf-apri" data-id="' + h(p.id) + '">' +
      '<div class="t">' + h(p.nome) + '</div>' +
      '<div class="s">' + h(dataBreve(p.giorno)) + ' · ' + h(pesoFile(p.peso)) + ' · ' + h(NOMI_PDF[p.tipo] || p.tipo) + '</div></button>' +
      '<button class="pill cod" data-az="pdf-manda" data-id="' + h(p.id) + '">Manda</button>' +
      '<button class="x-riga" data-az="pdf-elimina" data-id="' + h(p.id) + '" aria-label="Elimina">✕</button></div>';
  });
  if (meseCorrente) html += '</div>';
  html += '<div class="vuoto-stato" style="text-align:left">I PDF restano nel telefono. Foto e audio no: quelli si buttano ogni settimana.</div>';
  return html;
}

async function condividiFile(blob, nome, titolo) {
  const file = new File([blob], nome, { type: blob.type });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: titolo }); avvisa('Pronto', 'ok'); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = nome; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  avvisa('Scaricato', 'ok');
}

// Le azioni di questo file.
Object.assign(AZIONI, {
  'verbale-esporta': function (el) {
    const v = verbale(el.dataset.id);
    PUNTI_APERTI = null;
    if (!v) return;
    const p = pdfConChiave('verbale:' + v.codice);
    chiudiFoglio();
    if (p) mandaFuoriPdf(p.id); else apriEsportaPdf(null, v.id);
  },
  'verbale-scarica': function (el) { const id = el.dataset.id; PUNTI_APERTI = null; chiudiEsporta(); chiudiFoglio(); scaricaVerbale(id); },
  'esporta-pdf': function (el) { chiudiEsporta(); apriEsportaPdf(el.dataset.id); },
  'pdf-crea': function (el) { creaPdf(el.dataset.id); },
  /* Le scorciatoie del periodo: riempiono le due date al posto tuo. Fine
     settimana e fine mese sono i due momenti in cui i verbali si mandano. */
  'pdf-quando': function (el) {
    const p = periodoPronto(el.dataset.quando);
    const dal = document.getElementById('pdf-dal'), al = document.getElementById('pdf-al');
    if (dal) dal.value = p.dal;
    if (al) al.value = p.al;
    document.querySelectorAll('[data-az="pdf-quando"]').forEach(function (b) { b.classList.toggle('ok', b === el); });
  },
  'relazione-genera': function (el) {
    // Un cantiere messo "chiuso" dal modulo non ha la relazione: la si scrive da qui.
    const c = cantiere(el.dataset.id);
    if (!c) return;
    const rel = generaRelazione(c, relazioneDi(c.codice));
    avvisa('Relazione scritta', 'ok');
    vai('#/relazione/' + rel.id);
  },
  'relazione-rigenera': function (el) { rigeneraRelazione(el.dataset.id); },
  'esporta-pdf-relazione': function (el) { chiudiEsporta(); creaPdfRelazione(el.dataset.id); },
  'relazione-scarica': function (el) { chiudiEsporta(); scaricaRelazione(el.dataset.id); },
  'salva-relazione': function (el) {
    const rel = relazione(el.dataset.id);
    if (!rel) return;
    salva('relazione', rel);
    avvisa('Salvato', 'ok');
    vai('#/relazione/' + rel.id);
  },
  'settimana-libera': function (el) { return liberaMemoria(el.dataset.inizio, el.dataset.fine); },
  /* La domenica, nel cantiere: il verbale di settimana — il PDF da lunedì a oggi — si rifà
     sempre da capo, così porta dentro le correzioni fatte nel frattempo. */
  'settimana-verbale': async function (el) {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    if (!window.PDFLib) { avvisa('PDF non pronto: serve la rete la prima volta', 'err'); return; }
    avvisa('Preparo il verbale di settimana…');
    const p = await pdfPeriodo(c, lunediDi(oggiISO()), oggiISO());
    if (!p) { avvisa('Nessun verbale in questa settimana', 'att'); return; }
    apriFoglioPdfFatto(p, null);
  },
  'pdf-apri': function (el) { vai('#/leggi/' + el.dataset.id); },
  'pdf-leggi': function (el) { chiudiFoglio(); vai('#/leggi/' + el.dataset.id); },
  'pdf-modifica': function (el) { chiudiFoglio(); vai('#/verbale/' + el.dataset.id); },
  'pdf-fuori': function (el) { apriPdf(el.dataset.id); },
  'pdf-manda': function (el) { mandaFuoriPdf(el.dataset.id); },
  'pdf-elimina': async function (el) {
    const p = pdfArchiviati().find(function (x) { return x.id === el.dataset.id; });
    if (!p) return;
    const ok = await chiedi('Eliminare questo PDF?', p.nome + '. Si può rifare dalla giornata, ma le foto già buttate non tornano.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    await eliminaPdf(p.id);
    avvisa('Eliminato', 'ok');
    aggiornaVista();
  },
});

/* CANTIERI — contabilita.js: righe, totali, sconto e IVA, esportazioni */
'use strict';


async function lavoroContabilita(l) {
  const c = cantiere(l.cantiere);
  if (!c) return;
  let righe = null;
  if (chiaveAnthropic()) {
    const risposta = await chiamaClaude(REGOLE_CONTABILITA, 'Frase: ' + l.grezzo, 800);
    const j = estraiJSON(risposta);
    if (!j || !Array.isArray(j.righe)) throw new Error('Risposta non leggibile');
    righe = j.righe;
  } else {
    righe = [rigaContabilitaLocale(l.grezzo)];
  }
  // Il listino scelto a fine dettato, se c'è, va per primo; poi il Generale. Se no l'ordine del cantiere.
  const scelto = l.listino ? listinoPerCodice(l.listino) : null;
  const listini = scelto ? [scelto].concat(listinoGenerale() && !scelto.generale ? [listinoGenerale()] : []) : listiniDelCantiere(c);
  const proposte = [];
  for (const r of righe) {
    const riga = {
      descrizione: String(r.descrizione || '').trim(),
      quantita: Number(r.quantita) || 0,
      um: normalizzaUmLocale(r.um || '') || String(r.um || '').trim(),
      prezzo: r.prezzo_unitario != null ? Number(r.prezzo_unitario) || 0 : 0,
      dallistino: null, dacompletare: false, grezzo: l.grezzo
    };
    if (!(riga.prezzo > 0)) {
      // Prima la ricerca per parole, gratis. Claude solo se non trova niente o trova troppo.
      const voce = await trovaVoceListino(riga.descrizione, listini);
      if (voce) {
        riga.prezzo = voce.prezzo; riga.dallistino = voce.codice;
        if (!riga.um) riga.um = voce.um;
        /* Unità dettata diversa da quella della voce: niente conversione a indovinare.
           L'importo si calcola lo stesso, la riga resta segnata finché uno la sistema. */
        else if (voce.um && riga.um !== voce.um) riga.umListino = voce.um;
      }
    }
    riga.dacompletare = !(riga.prezzo > 0);
    riga.importo = Math.round(riga.quantita * riga.prezzo * 100) / 100;
    proposte.push(riga);
  }
  const loc = leggiLocale();
  loc.proposte.push({ id: nuovoId(), cantiere: c.id, ora: l.ora || oraAdesso(), grezzo: l.grezzo, righe: proposte, creato: adessoISO() });
  salvaLocale();
  avvisa('Proposta pronta', 'ok');
}

// Senza Claude si fa quel che si può: "inserisci intonaco civile, 25 metri quadrati" → descrizione, numero, unità.
function rigaContabilitaLocale(frase) {
  let t = String(frase || '').trim().replace(/^(inserisci|aggiungi|metti|segna)\s+/i, '');
  const mNum = t.match(/(\d+(?:[.,]\d+)?)\s*([a-zà-ù²³.]+(?:\s+[a-zà-ù]+){0,2})?/i);
  let quantita = 0, um = '';
  if (mNum) {
    quantita = leggiNumero(mNum[1], ',');
    const candidate = (mNum[2] || '').split(/\s+/);
    for (let n = candidate.length; n > 0; n--) {
      const u = normalizzaUmLocale(candidate.slice(0, n).join(' '));
      if (u) { um = u; break; }
    }
    t = t.slice(0, mNum.index).trim();
  }
  t = t.replace(/[,;:]+$/, '').trim();
  return { descrizione: t.charAt(0).toUpperCase() + t.slice(1), quantita: quantita, um: um, prezzo_unitario: null };
}

/* A fine dettato, se il cantiere ha più di un listino, si chiede quale usare: un
   tasto per listino, e la scelta vale solo per quella riga dettata. Con un
   listino solo non si chiede niente. */
function chiediListinoPerDettato(c, lavoro) {
  const listini = listiniDelCantiere(c);
  if (listini.length < 2) return;
  apriFoglio(
    '<h2>Con quale listino?</h2><p>Per i prezzi di questa riga dettata.</p>' +
    listini.map(function (l) { return '<button class="btn" data-az="listino-scelto" data-lavoro="' + h(lavoro.id) + '" data-listino="' + h(l.codice) + '">' + h(l.nome) + (l.riferimento ? ' <small>' + h(l.riferimento) + '</small>' : '') + '</button>'; }).join('') +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Nell\'ordine del cantiere</button>'
  );
}

/* ---------------- CONTABILITÀ ---------------- */
function vistaContabilita(idCantiere) {
  const c = cantiere(idCantiere);
  if (!c) return vistaDashboard();
  const cont = contabilitaDi(c.codice);
  const righe = cont ? cont.righe : [];
  const loc = leggiLocale();
  const proposte = loc.proposte.filter(function (p) { return p.cantiere === c.id; });
  const inCoda = loc.coda.filter(function (l) { return l.cantiere === c.id && (l.per === 'contabilita' || l.tipo === 'contabilita'); });
  const daSistemare = righe.filter(function (r) { return r.dacompletare || r.umListino; }).length;
  let html = testata({ indietro: '#/cantiere/' + c.id, titolo: 'Contabilità', sotto: h(c.nome),
    destra: daSistemare ? '<span class="pill att">' + daSistemare + ' da sistemare</span>' : '' });
  inCoda.forEach(function (l) {
    html += '<div class="avviso" style="color:var(--muted);border-color:var(--line);background:var(--surface)">' +
      (l.stato === 'fallito' ? 'Riga dettata non riuscita: ' + h(l.errore || '') : (l.stato === 'in_corso' ? 'Sto leggendo la riga dettata…' : 'Riga dettata in coda (' + h(l.etichetta || '') + ')')) + '</div>';
  });
  // Quello che torna dalla dettatura è una proposta: si guarda e si corregge prima di salvare.
  proposte.forEach(function (p) {
    html += '<div class="card gialla"><div class="card-capo gialla">Proposta dalla dettatura delle ' + h(p.ora) + '</div>' +
      '<div class="card-piede" style="border-top:0">« ' + h(p.grezzo) + ' »</div>' +
      p.righe.map(function (r, i) { return rigaContabilitaHtml(r, { proposta: p.id, indice: i }); }).join('') +
      '<div class="griglia"><button class="btn btn-ok" data-az="proposta-aggiungi" data-id="' + h(p.id) + '">Aggiungi</button>' +
      '<button class="btn" data-az="proposta-scarta" data-id="' + h(p.id) + '">Scarta</button></div></div>';
  });
  if (righe.length) {
    html += '<div class="card">' + righe.map(function (r) { return rigaContabilitaHtml(r, { cont: cont.id }); }).join('') + '</div>';
    // La stessa voce si somma: una vista in più, le righe restano come sono.
    html += grigliaTendine([tendina('pervoce-' + c.id, 'Per voce', '<div class="card">' + scorrevole(perVoceHtml(righe)) + '</div>', perVoce(righe).length)]);
  } else if (!proposte.length) {
    html += '<div class="vuoto-stato">Nessuna riga. Premi il bottone verde e di\' per esempio: «Inserisci intonaco civile, 25 metri quadrati».</div>';
  }
  html += totaliContabilitaHtml(cont, 'Totale progressivo');
  // Sconto e IVA del documento: con tutti e due a zero in fondo resta solo il totale.
  html += '<div class="modulo"><div class="due"><div><label class="eticampo">Sconto o ribasso %</label><input class="campo" inputmode="decimal" data-campo="sconto-contabilita" data-id="' + h(c.id) + '" value="' + h(cont && cont.sconto ? numeroIt(cont.sconto) : '') + '" placeholder="0"></div>' +
    '<div><label class="eticampo">IVA %</label><select class="campo" data-campo="iva-contabilita" data-id="' + h(c.id) + '">' + opzioniIva(cont ? cont.iva : 0, !!(cont && cont.ivaMano)) + '</select></div></div>' +
    (cont && cont.ivaMano ? '<input class="campo" inputmode="decimal" data-campo="iva-mano-contabilita" data-id="' + h(c.id) + '" value="' + h(cont.iva ? numeroIt(cont.iva) : '') + '" placeholder="aliquota a mano">' : '') +
    '<label class="eticampo">Note</label><textarea class="campo auto" data-campo="note-contabilita" data-id="' + h(c.id) + '" placeholder="Note del documento">' + h(cont ? cont.note : '') + '</textarea>' +
    (righe.length ? '<button class="btn medio" data-az="contabilita-csv" data-id="' + h(c.id) + '" style="margin-top:12px"><span class="ico ico-invio"></span> Esporta in foglio di calcolo</button>' : '') + '</div>';
  if (!REG.attiva) {
    html += '<div class="barra"><button class="az verde" data-az="detta-contabilita" data-id="' + h(c.id) + '"><span class="ico ico-microfono"></span> Aggiungi una riga</button>' +
      '<button class="az stretta" data-az="riga-nuova" data-id="' + h(c.id) + '">＋ a mano</button></div>';
  }
  return html;
}
// L'aliquota: le tre di sempre, o una scritta a mano.
function opzioniIva(iva, mano) {
  iva = Number(iva) || 0;
  const fisse = [[0, 'nessuna'], [22, '22%'], [10, '10%'], [4, '4%']];
  const aMano = mano || fisse.every(function (o) { return o[0] !== iva; });
  return fisse.map(function (o) { return '<option value="' + o[0] + '"' + (!aMano && o[0] === iva ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
    '<option value="mano"' + (aMano ? ' selected' : '') + '>a mano' + (aMano && iva ? ' (' + numeroIt(iva) + '%)' : '') + '</option>';
}
/* I conti del documento: totale lavori, sconto, imponibile, IVA, totale. Le righe
   senza prezzo non contano, come prima. */
function contiContabilita(cont) {
  const lavori = totaleContabilita(cont);
  const pSconto = cont ? Number(cont.sconto) || 0 : 0, pIva = cont ? Number(cont.iva) || 0 : 0;
  const sconto = Math.round(lavori * pSconto) / 100;
  const imponibile = Math.round((lavori - sconto) * 100) / 100;
  const iva = Math.round(imponibile * pIva) / 100;
  return { lavori: lavori, pSconto: pSconto, sconto: sconto, imponibile: imponibile, pIva: pIva, iva: iva, totale: Math.round((imponibile + iva) * 100) / 100 };
}
// In fondo: solo il totale se sconto e IVA sono a zero, se no i cinque numeri.
function totaliContabilitaHtml(cont, etichetta) {
  const k = contiContabilita(cont);
  if (!k.pSconto && !k.pIva) return '<div class="totale"><span class="eti">' + h(etichetta) + '</span><span class="cifra">' + h(euro(k.lavori)) + '</span></div>';
  const r = function (nome, val, classe) { return '<div class="conto' + (classe ? ' ' + classe : '') + '"><span>' + h(nome) + '</span><span>' + h(euro(val)) + '</span></div>'; };
  return '<div class="totale conti"><div class="conti-righe">' +
    r('Totale lavori', k.lavori) + (k.pSconto ? r('Sconto ' + numeroIt(k.pSconto) + '%', -k.sconto) : '') + r('Imponibile', k.imponibile) +
    (k.pIva ? r('IVA ' + numeroIt(k.pIva) + '%', k.iva) : '') + '</div>' +
    '<div class="conto finale"><span class="eti">Totale</span><span class="cifra">' + h(euro(k.totale)) + '</span></div></div>';
}
/* Le righe che vengono dalla stessa voce di listino stanno insieme; quelle senza
   voce si mettono insieme per descrizione uguale. Quantità e importo sommati. */
function perVoce(righe) {
  const gruppi = {};
  righe.forEach(function (r) {
    const k = r.dallistino ? 'v:' + r.dallistino : 'd:' + senzaAccenti(r.descrizione || '');
    const g = gruppi[k] || (gruppi[k] = { chiave: k, descrizione: r.descrizione, um: r.um, voce: r.dallistino || '', righe: 0, quantita: 0, importo: 0, misto: false });
    g.righe++; g.quantita += Number(r.quantita) || 0; g.importo += Number(r.importo) || 0;
    if (r.um && g.um && r.um !== g.um) g.misto = true;
  });
  return valori(gruppi).sort(function (a, b) { return b.importo - a.importo; });
}
function perVoceHtml(righe) {
  return perVoce(righe).map(function (g) {
    return '<div class="voceriga"><div class="desc">' + h(g.descrizione || '(senza descrizione)') + '</div>' +
      '<div class="conti"><span>' + g.righe + (g.righe === 1 ? ' riga' : ' righe') + '</span><span>' + h(numeroIt(Math.round(g.quantita * 100) / 100)) + ' ' + (g.misto ? '(unità miste)' : h(g.um || '')) + '</span>' +
      (g.voce ? '<span class="targa">listino</span>' : '') + '<span class="importo">' + h(euro(g.importo)) + '</span></div></div>';
  }).join('');
}
/* La contabilità in un CSV per Excel italiano: una riga per voce, punto e virgola,
   decimali con la virgola. Il sopralluogo è quello del giorno in cui la riga è nata. */
function csvContabilita(c, cont) {
  const cella = function (v) { v = String(v == null ? '' : v); return /[;"\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const num = function (n) { return String(Number(n) || 0).replace('.', ','); };
  const righe = [['Data', 'Sopralluogo', 'Descrizione', 'Codice voce listino', 'Quantità', 'Unità', 'Prezzo unitario', 'Importo']];
  (cont ? cont.righe : []).forEach(function (r) {
    const sop = r.giorno ? sopralluoghiDelGiorno(c.codice, r.giorno)[0] : null;
    righe.push([r.giorno ? r.giorno.split('-').reverse().join('/') : '', sop ? sop.codice : '', r.descrizione || '', r.dallistino || '', num(r.quantita), r.um || '', num(r.prezzo), num(r.importo)]);
  });
  return String.fromCharCode(0xFEFF) + righe.map(function (r) { return r.map(cella).join(';'); }).join('\r\n');
}
function rigaContabilitaHtml(r, rif) {
  // Nella relazione la riga è una copia e si legge soltanto: stesso disegno, ma non è un bottone.
  const tag = rif.lettura ? 'div' : 'button';
  const attr = rif.lettura ? '' : (rif.proposta ? ' data-az="riga-modifica" data-proposta="' + h(rif.proposta) + '" data-indice="' + rif.indice + '"' : ' data-az="riga-modifica" data-cont="' + h(rif.cont) + '" data-id="' + h(r.codice) + '"');
  return '<' + tag + ' class="voceriga' + (r.dacompletare ? ' dacompletare' : '') + (r.umListino ? ' umdiversa' : '') + '"' + attr + '>' +
    '<div class="desc">' + h(r.descrizione || '(senza descrizione)') + '</div>' +
    '<div class="conti">' + (r.codice ? '' : '<span class="codice">nuova</span>') + '<span>' + h(numeroIt(r.quantita)) + ' ' + h(r.um || '') + '</span>' +
    '<span>× ' + h(euro(r.prezzo)) + '</span>' + (r.dallistino ? '<span class="targa">listino</span>' : '') +
    '<span class="importo">' + (r.dacompletare ? 'da completare' : h(euro(r.importo))) + '</span></div>' +
    (r.umListino ? '<div class="avvertenza">unità diversa: listino ' + h(r.umListino) + ', dettato ' + h(r.um || '—') + '</div>' : '') + '</' + tag + '>';
}

function ricalcolaRiga(r) {
  r.quantita = Number(r.quantita) || 0;
  r.prezzo = Number(r.prezzo) || 0;
  r.importo = Math.round(r.quantita * r.prezzo * 100) / 100;
  r.dacompletare = !(r.prezzo > 0);
  return r;
}

// Il foglio per correggere una riga, campo per campo.
function apriRigaContabilita(riga, rif) {
  const um = riga.um || '';
  const opzioniUm = ['', 'm', 'm²', 'm³', 'kg', 'q', 't', 'n', 'h', 'corpo', 'l'];
  if (um && opzioniUm.indexOf(um) === -1) opzioniUm.push(um);
  // Il listino in cui entrerebbe la voce: il primo collegato al cantiere.
  const c = rif.cantiere ? cantiere(rif.cantiere) : null;
  const dest = c ? listiniDelCantiere(c)[0] : null;
  apriFoglio(
    '<h2>' + (riga.codice ? h(primaRiga(riga.descrizione) || 'Riga') : 'Riga nuova') + '</h2>' +
    '<label class="eticampo">Descrizione lavorazione</label><input class="campo" id="r-desc" value="' + h(riga.descrizione) + '" autocomplete="off">' +
    '<div class="due" style="display:flex;gap:8px"><div style="flex:1"><label class="eticampo">Quantità</label><input class="campo" id="r-qta" inputmode="decimal" value="' + h(numeroIt(riga.quantita)) + '"></div>' +
    '<div style="flex:1"><label class="eticampo">Unità</label><select class="campo" id="r-um">' + opzioniUm.map(function (u) { return '<option value="' + h(u) + '"' + (u === um ? ' selected' : '') + '>' + (u || '—') + '</option>'; }).join('') + '</select></div></div>' +
    // Unità diversa da quella del listino: si dice, e con un tocco si prende quella del listino.
    (riga.umListino ? '<div class="avvertenza">unità diversa: listino ' + h(riga.umListino) + ', dettato ' + h(um || '—') + '</div>' +
      '<button class="btn medio" data-az="riga-um-listino" style="margin-top:8px">Usa ' + h(riga.umListino) + ' come nel listino</button>' : '') +
    '<label class="eticampo">Prezzo unitario €</label><input class="campo" id="r-prezzo" inputmode="decimal" value="' + h(riga.prezzo ? numeroIt(riga.prezzo) : '') + '" placeholder="0,00">' +
    '<button class="btn medio" data-az="riga-cerca-listino" style="margin-top:12px"><span class="ico ico-lente"></span> Cerca nel listino</button>' +
    /* Il listino impara: una riga gialla completata a mano può entrare nel listino con
       un tocco — descrizione, unità e prezzo — e la volta dopo si trova da sola. */
    (riga.dacompletare && !riga.dallistino && dest ? '<button class="btn medio" data-az="riga-nel-listino" style="margin-top:8px"><span class="ico ico-documento"></span> Metti questa voce nel listino <b>' + h(dest.nome) + '</b></button>' : '') +
    '<div class="righe"><button class="btn btn-ok" data-az="riga-salva">Salva</button>' +
    (riga.codice ? '<button class="btn btn-rosso" data-az="riga-elimina">Elimina</button>' : '') + '</div>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>'
  );
  RIGA_APERTA = { riga: riga, rif: rif };
}
let RIGA_APERTA = null;
function leggiRigaDalFoglio() {
  const r = RIGA_APERTA.riga;
  r.descrizione = document.getElementById('r-desc').value.trim();
  r.quantita = leggiNumero(document.getElementById('r-qta').value, ',');
  if (isNaN(r.quantita)) r.quantita = 0;
  r.um = document.getElementById('r-um').value;
  // Messa l'unità del listino, la riga non è più da sistemare.
  if (r.umListino && r.um === r.umListino) delete r.umListino;
  const p = leggiNumero(document.getElementById('r-prezzo').value, ',');
  r.prezzo = isNaN(p) ? 0 : p;
  return ricalcolaRiga(r);
}
function salvaRigaAperta() {
  const r = leggiRigaDalFoglio();
  const rif = RIGA_APERTA.rif;
  if (rif.proposta) {
    // Una riga di una proposta si corregge sul posto: entra in contabilità solo con "Aggiungi".
    salvaLocale();
  } else {
    const c = cantiere(rif.cantiere);
    const cont = contabilitaOCrea(c.codice);
    if (!r.codice) { r.codice = codiceNuovo('VOCE'); r.giorno = r.giorno || oggiISO(); cont.righe.push(r); }
    else { const i = cont.righe.findIndex(function (x) { return x.codice === r.codice; }); if (i === -1) cont.righe.push(r); else cont.righe[i] = r; }
    salva('contabilita', cont);
  }
  chiudiFoglio();
  RIGA_APERTA = null;
  avvisa('Salvato', 'ok');
  aggiornaVista();
}

// Il selettore del listino: si cerca dentro la descrizione e si tocca la voce.
let filtroListinoScelta = '';
function apriSceltaListino() {
  leggiRigaDalFoglio();
  filtroListinoScelta = RIGA_APERTA.riga.descrizione || '';
  disegnaSceltaListino();
}
function disegnaSceltaListino() {
  // Le voci dei listini di questo cantiere, nel loro ordine: il primo listino prima, il Generale in fondo.
  const tutte = listiniDelCantiere(cantiere(RIGA_APERTA.rif.cantiere)).reduce(function (t, l) { return t.concat(vociDi(l.codice)); }, []);
  const voci = filtroListinoScelta ? cercaListinoLocale(filtroListinoScelta, tutte).map(function (r) { return r.voce; }) : [];
  const elenco = (voci.length ? voci : tutte).slice(0, 60);
  apriFoglio(
    '<h2>Cerca nel listino</h2>' +
    '<div class="cerca" style="margin:0 0 12px"><span class="ico ico-lente"></span> <input type="search" id="scelta-cerca" placeholder="Cerca nella descrizione" value="' + h(filtroListinoScelta) + '" data-campo="filtro-scelta" autocomplete="off" autofocus></div>' +
    '<div class="lista">' + (elenco.length ? elenco.map(function (v) {
      return '<button class="riga" data-az="scegli-voce" data-id="' + h(v.id) + '"><span class="desc">' + h(v.descrizione) + '<small>' + h(v.um) + '</small></span><span class="dx">' + h(euro(v.prezzo)) + '</span></button>';
    }).join('') : '<div class="vuoto-stato">' + (tutte.length ? 'Nessuna voce trovata.' : 'Il listino è vuoto.') + '</div>') + '</div>' +
    '<button class="btn" data-az="scelta-annulla">Torna alla riga</button>'
  );
}

// Le azioni di questo file.
Object.assign(AZIONI, {
  // --- contabilità ---
  'detta-contabilita': function (el) { const c = cantiere(el.dataset.id); if (c) avviaRegistrazione({ tipo: 'contabilita', cantiere: c.id }); },
  'riga-nuova': function (el) { apriRigaContabilita(ricalcolaRiga({ descrizione: '', quantita: 0, um: '', prezzo: 0 }), { cantiere: el.dataset.id }); },
  'riga-modifica': function (el) {
    if (el.dataset.proposta) {
      const p = leggiLocale().proposte.find(function (x) { return x.id === el.dataset.proposta; });
      if (!p) return;
      apriRigaContabilita(p.righe[Number(el.dataset.indice)], { proposta: p.id, cantiere: p.cantiere });
    } else {
      const cont = leggiTutto().contabilita[el.dataset.cont];
      const r = cont && cont.righe.find(function (x) { return x.codice === el.dataset.id; });
      if (!r) return;
      const c = cantierePerCodice(cont.cantiere);
      apriRigaContabilita(r, { cantiere: c ? c.id : '' });
    }
  },
  'riga-salva': function () { if (RIGA_APERTA) salvaRigaAperta(); },
  'riga-elimina': async function () {
    if (!RIGA_APERTA) return;
    const r = RIGA_APERTA.riga, rif = RIGA_APERTA.rif;
    chiudiFoglio();
    const ok = await chiedi('Eliminare la riga?', r.descrizione, 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    if (rif.proposta) {
      const loc = leggiLocale();
      const p = loc.proposte.find(function (x) { return x.id === rif.proposta; });
      if (p) { p.righe = p.righe.filter(function (x) { return x !== r; }); if (!p.righe.length) loc.proposte = loc.proposte.filter(function (x) { return x.id !== p.id; }); salvaLocale(); }
    } else {
      const c = cantiere(rif.cantiere);
      const cont = c && contabilitaDi(c.codice);
      if (cont) { cont.righe = cont.righe.filter(function (x) { return x.codice !== r.codice; }); salva('contabilita', cont); }
    }
    RIGA_APERTA = null;
    avvisa('Eliminata', 'ok');
    aggiornaVista();
  },
  // Il listino scelto per una riga dettata: va sul lavoro in coda, che sia ancora la trascrizione o già la riga.
  'listino-scelto': function (el) {
    const loc = leggiLocale();
    loc.coda.forEach(function (l) { if (l.id === el.dataset.lavoro || l.origine === el.dataset.lavoro) l.listino = el.dataset.listino; });
    salvaLocale();
    chiudiFoglio();
  },
  'riga-cerca-listino': function () { if (RIGA_APERTA) apriSceltaListino(); },
  // Il listino impara: la riga completata a mano entra nel primo listino del cantiere, e la riga resta agganciata alla voce.
  'riga-nel-listino': async function () {
    if (!RIGA_APERTA) return;
    const r = leggiRigaDalFoglio();
    if (!r.descrizione) { avvisa('Manca la descrizione', 'att'); return; }
    if (!(r.prezzo > 0)) { avvisa('Prima il prezzo', 'att'); return; }
    const c = cantiere(RIGA_APERTA.rif.cantiere);
    const dest = c && listiniDelCantiere(c)[0];
    if (!dest) return;
    const v = salva('listino', { descrizione: r.descrizione, um: await normalizzaUm(r.um), prezzo: r.prezzo, capitolo: '', listino: dest.codice });
    r.dallistino = v.codice;
    avvisa('Nel listino ' + dest.nome, 'ok');
    salvaRigaAperta();
  },
  // L'unità del listino al posto di quella dettata: la riga non è più da sistemare.
  'riga-um-listino': function () {
    if (!RIGA_APERTA) return;
    const r = RIGA_APERTA.riga;
    r.um = r.umListino; delete r.umListino;
    apriRigaContabilita(r, RIGA_APERTA.rif);
  },
  'contabilita-csv': function (el) {
    const c = cantiere(el.dataset.id);
    if (!c) return;
    scaricaBlob(new Blob([csvContabilita(c, contabilitaDi(c.codice))], { type: 'text/csv;charset=utf-8' }), 'contabilita-' + nomeFile(c.nome) + '-' + oggiISO() + '.csv');
  },
  'scelta-annulla': function () { if (RIGA_APERTA) apriRigaContabilita(RIGA_APERTA.riga, RIGA_APERTA.rif); else chiudiFoglio(); },
  'scegli-voce': function (el) {
    const v = leggiTutto().listino[el.dataset.id];
    if (!v || !RIGA_APERTA) return;
    const r = RIGA_APERTA.riga;
    r.descrizione = v.descrizione; r.um = v.um; r.prezzo = v.prezzo; r.dallistino = v.codice;
    ricalcolaRiga(r);
    apriRigaContabilita(r, RIGA_APERTA.rif);
  },
  'proposta-aggiungi': function (el) {
    const loc = leggiLocale();
    const p = loc.proposte.find(function (x) { return x.id === el.dataset.id; });
    const c = p && cantiere(p.cantiere);
    if (!c) return;
    const cont = contabilitaOCrea(c.codice);
    p.righe.forEach(function (r) { r.codice = codiceNuovo('VOCE'); r.giorno = p.creato ? dataLocaleISO(new Date(p.creato)) : oggiISO(); cont.righe.push(ricalcolaRiga(r)); });
    salva('contabilita', cont);
    loc.proposte = loc.proposte.filter(function (x) { return x.id !== p.id; });
    salvaLocale();
    avvisa('Aggiunte ' + p.righe.length + (p.righe.length === 1 ? ' riga' : ' righe'), 'ok');
    aggiornaVista();
  },
  'proposta-scarta': function (el) {
    const loc = leggiLocale();
    loc.proposte = loc.proposte.filter(function (x) { return x.id !== el.dataset.id; });
    salvaLocale();
    avvisa('Scartata');
    aggiornaVista();
  },
});

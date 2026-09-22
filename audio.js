/* CANTIERI — audio.js: registrazione, trascrizione, pezzi, smistamento nelle sezioni */
'use strict';


/* I nomi propri già visti in quel cantiere: ditte, persone, mezzi, materiali.
   Solo quelli di quel cantiere, al massimo cinquanta, i più recenti. */
function nomiNoti(codiceCantiere) {
  const trovati = new Map();
  const stop = new Set(['Il', 'La', 'Lo', 'Le', 'Gli', 'Un', 'Una', 'Non', 'Per', 'Con', 'Del', 'Della', 'Dei', 'Delle', 'Al', 'Alla', 'Sul', 'Sulla', 'Nel', 'Nella', 'Oggi', 'Ieri', 'Domani', 'Da', 'Di', 'In', 'Su', 'Se', 'Ma', 'E', 'A', 'O', 'Che', 'Chi', 'Cosa', 'Come', 'Dove', 'Quando', 'Posa', 'Getto', 'Casseri', 'Finito', 'Ripresa', 'Segnalato', 'Detto', 'Chiamare', 'Rimozione', 'Consegna', 'Controllo', 'Ponteggio', 'Gru', 'Betoniera', 'Trabattello', 'Autopompa', 'Scavo', 'Muratura', 'Intonaco', 'Massetto', 'Solaio', 'Pilastri', 'Cordolo', 'Platea', 'Casseratura', 'Armatura']);
  const pulisci = function (w) { return String(w || '').replace(/[^\wÀ-ÿ'.-]/g, ''); };
  const maiuscola = function (w) { return /^[A-ZÀ-Ý][a-zà-ÿ'.-]{2,}$/.test(w); };
  const aggiungi = function (n, peso) {
    n = String(n || '').trim();
    if (n.length < 3 || !/^[A-ZÀ-Ý]/.test(n) || stop.has(n)) return;
    if (!trovati.has(n)) trovati.set(n, peso);
  };
  const c = cantierePerCodice(codiceCantiere);
  if (c && c.committente) aggiungi(c.committente, 1e15);
  sopralluoghiDi(codiceCantiere).forEach(function (s, indice) {
    const peso = 1e12 - indice; // i sopralluoghi più recenti prima
    // Le righe degli operai hanno una forma nota: "Nome (Ditta) — compito"
    righeElenco(s.sezioni.operai).forEach(function (r) {
      const m = r.match(/^([^(—–]+?)\s*(?:\(([^)]+)\))?\s*(?:[—–]|$)/);
      if (m) { if (!/^\d/.test(m[1])) aggiungi(m[1], peso); if (m[2]) aggiungi(m[2], peso); }
    });
    const testo = CHIAVI_SEZIONI.map(function (k) { return s.sezioni[k] || ''; }).join('\n');
    // Le ditte fra parentesi, ovunque siano
    (testo.match(/\(([^)]{2,40})\)/g) || []).forEach(function (m) { aggiungi(m.slice(1, -1), peso); });
    // Le parole con la maiuscola non all'inizio della frase, anche in coppia ("Mario Rossi", "Edil Rossi")
    testo.split(/[.\n:;!?()—–]/).forEach(function (frase) {
      const p = frase.trim().split(/\s+/);
      for (let i = 1; i < p.length; i++) {
        const w = pulisci(p[i]);
        if (maiuscola(w) && !stop.has(w)) {
          const succ = p[i + 1] ? pulisci(p[i + 1]) : '';
          if (maiuscola(succ) && !stop.has(succ)) { aggiungi(w + ' ' + succ, peso); i++; }
          else aggiungi(w, peso);
        }
      }
    });
  });
  return Array.from(trovati.entries()).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 50).map(function (e) { return e[0]; });
}

function messaggioRiordino(sop, grezzo) {
  const c = cantierePerCodice(sop.cantiere) || {};
  return 'Cantiere: ' + (c.nome || '') + '\nCommittente: ' + (c.committente || '') + '\nData: ' + dataEstesa(sop.giorno) +
    '\nNomi noti: ' + (nomiNoti(sop.cantiere).join(', ') || 'nessuno') + '\nTesto: ' + grezzo;
}

// Sopra le 3.000 parole si taglia in due sui punti fermi: una risposta lunga rischia il taglio, e si rifà da capo.
function spezzaTesto(testo) {
  const p = testo.split(/\s+/);
  if (p.length <= 3000) return [testo];
  const meta = Math.floor(testo.length / 2);
  let taglio = testo.lastIndexOf('. ', meta);
  if (taglio < testo.length * 0.3) taglio = testo.indexOf('. ', meta);
  if (taglio === -1) taglio = meta;
  return [testo.slice(0, taglio + 1).trim(), testo.slice(taglio + 1).trim()];
}

/* Un pezzo corto che comincia con una parola chiave chiara va nella sezione senza chiamare nessuno. */
function smistaInLocale(grezzo) {
  const t = senzaAccenti(grezzo).replace(/[^\w\sàèéìòù]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.split(' ').length >= 15) return null;
  const chiavi = Object.keys(PAROLE_SEZIONE);
  let migliore = null;
  for (const k of chiavi) {
    for (const frase of PAROLE_SEZIONE[k]) {
      const f = senzaAccenti(frase);
      const prefissi = [f, 'capitolo ' + f, 'sezione ' + f];
      for (const pre of prefissi) {
        if (t.indexOf(pre + ' ') === 0 || t === pre) {
          if (!migliore || pre.length > migliore.pre.length) migliore = { sezione: k, pre: pre };
        }
      }
    }
  }
  if (!migliore) return null;
  const resto = grezzo.trim().slice(migliore.pre.length).replace(/^[\s:,.;-]+/, '').trim();
  if (!resto) return null;
  const testo = resto.charAt(0).toUpperCase() + resto.slice(1);
  return { sezione: migliore.sezione, testo: testo.replace(/[.]?$/, '.'), titolo: testo.split(/\s+/).slice(0, 4).join(' ').replace(/[.,;:]$/, '') };
}

/* Prima di riordinare: il tecnico ha detto dove va questo dettato? Si guarda sempre,
   anche quando di sopralluoghi aperti ce n'e' uno solo. Torna il sopralluogo trovato
   (o niente) e il testo ripulito dalla frase che lo nominava: quella frase nel verbale
   non ci deve finire. */
async function scansionaDestinazione(sop, grezzo) {
  const fratelli = sopralluoghiDelGiorno(sop.cantiere, sop.giorno);
  const vuoto = { sop: null, pulito: grezzo };
  if (!chiaveAnthropic() || !String(grezzo).trim()) return vuoto;
  const elenco = fratelli.map(function (x) {
    return '- ' + x.codice + ': ' + nomeSopralluogo(x) + ' (ore ' + x.ora + (x.chiuso ? ', verbale gia fatto' : '') + ')';
  }).join('\n');
  try {
    const risposta = await chiamaClaude(REGOLE_SCAN_SOPRALLUOGO,
      'Sopralluoghi di oggi su questo cantiere:\n' + elenco + '\n\nDettato:\n' + grezzo, 900);
    const j = estraiJSON(risposta);
    if (!j) return vuoto;
    const codice = String(j.sopralluogo || '').trim();
    const pulito = String(j.pulito || '').trim() || grezzo;
    if (!codice) return { sop: null, pulito: pulito };
    const trovato = fratelli.find(function (x) { return x.codice === codice; }) || null;
    return { sop: trovato, pulito: pulito };
  } catch (e) { return vuoto; }
}

async function riordinaConClaude(sop, grezzo) {
  const parti = spezzaTesto(grezzo);
  const risultato = { titolo: '' };
  CHIAVI_SEZIONI.concat(['da_smistare']).forEach(function (k) { risultato[k] = ''; });
  for (const parte of parti) {
    const risposta = await chiamaClaude(REGOLE_SOPRALLUOGO, messaggioRiordino(sop, parte), Math.ceil(stimaToken(parte) * 1.5));
    const j = estraiJSON(risposta);
    if (!j) throw new Error('Risposta non leggibile');
    if (!risultato.titolo && j.titolo) risultato.titolo = String(j.titolo).trim();
    CHIAVI_SEZIONI.concat(['da_smistare']).forEach(function (k) {
      if (j[k] && String(j[k]).trim()) risultato[k] = aggiungiTesto(risultato[k], String(j[k]));
    });
  }
  return risultato;
}

/* Se la giornata ha già il suo verbale, una correzione alla giornata passa da sola
   nel verbale: solo le sezioni toccate, così quello che si è corretto a mano
   nelle altre resta. Non serve più premere Aggiorna. */
function allineaVerbale(sop, chiavi) {
  if (!sop.chiuso) return;
  const v = verbaleDiSopralluogo(sop.codice);
  if (!v) return;
  let cambiato = false;
  chiavi.forEach(function (k) {
    if (k === 'da_smistare' || CHIAVI_SEZIONI.indexOf(k) === -1) return;
    const testo = String(sop.sezioni[k] || '');
    if ((v.sezioni[k] || '') !== testo) { v.sezioni[k] = testo; cambiato = true; }
  });
  if (cambiato) salva('verbale', v);
}

// Il testo nuovo non sostituisce quello che c'è già: si aggiunge in fondo, a capo.
function applicaRiordino(sop, pezzo, risultato) {
  const piene = [];
  CHIAVI_SEZIONI.concat(['da_smistare']).forEach(function (k) {
    const nuovo = String(risultato[k] || '').trim();
    if (!nuovo) return;
    sop.sezioni[k] = aggiungiTesto(sop.sezioni[k], nuovo);
    if (k !== 'da_smistare') piene.push(k);
  });
  if (risultato.titolo) pezzo.titolo = risultato.titolo;
  pezzo.sezioni = piene;
  pezzo.sezione = piene[0] || (risultato.da_smistare ? 'da_smistare' : '');
  pezzo.stato = 'riordinato';
  salva('sopralluogo', sop);
  allineaVerbale(sop, piene);
}

async function lavoroTrascrizione(l) {
  // Mai mandare due volte lo stesso audio: se il testo c'è già, si passa oltre.
  if (l.per === 'sopralluogo') {
    const sop = sopralluogo(l.sop);
    if (!sop) return;
    const pezzo = sop.pezzi.find(function (p) { return p.id === l.pezzo; });
    if (!pezzo) return;
    if (!pezzo.grezzo) {
      const blob = await leggiMedia(pezzo.audio);
      if (!blob) throw new Error('Audio non trovato nel telefono');
      pezzo.grezzo = await trascriviConGroq(blob);
      pezzo.stato = 'trascritto';
      salva('sopralluogo', sop);
      // Il testo c'è: la voce si cancella subito. È il dato più delicato, e da qui in poi non serve.
      await scordaAudioPezzo(pezzo);
      salva('sopralluogo', sop);
      avvisa('Trascritto', 'ok');
    }
    if (!pezzo.grezzo.trim()) { pezzo.stato = 'riordinato'; pezzo.titolo = pezzo.titolo || 'Registrazione vuota'; salva('sopralluogo', sop); return; }
    // Pezzo corto con parola chiave: dritto nella sezione, gratis.
    const locale = smistaInLocale(pezzo.grezzo);
    if (locale) {
      const r = { titolo: locale.titolo };
      r[locale.sezione] = locale.testo;
      applicaRiordino(sop, pezzo, r);
      avvisa('Riordinato', 'ok');
      return;
    }
    accoda({ tipo: 'riordino', sop: sop.id, pezzo: pezzo.id, etichetta: pezzo.titolo || 'Registrazione delle ' + pezzo.ora });
    return;
  }
  if (l.per === 'nota') {
    if (!l.grezzo) {
      const blob = await leggiMedia(l.audio);
      if (!blob) throw new Error('Audio non trovato nel telefono');
      l.grezzo = await trascriviConGroq(blob);
      salvaLocale();
      avvisa('Trascritto', 'ok');
    }
    // L'audio di una nota serve solo a trascrivere: una volta letto si libera.
    await cancellaMedia(l.audio);
    accoda({ tipo: 'nota', cantiere: l.cantiere, grezzo: l.grezzo, etichetta: l.etichetta });
  }
  if (l.per === 'rilievo') {
    const sop = sopralluogo(l.sop);
    const pezzo = sop && sop.pezzi.find(function (p) { return p.id === l.pezzo; });
    if (!pezzo) return;
    if (!pezzo.grezzo) {
      const blob = await leggiMedia(pezzo.audio);
      if (!blob) throw new Error('Audio non trovato nel telefono');
      pezzo.grezzo = await trascriviConGroq(blob);
      pezzo.stato = 'trascritto';
      salva('sopralluogo', sop);
      // Il testo c'è: la voce si cancella subito. È il dato più delicato, e da qui in poi non serve.
      await scordaAudioPezzo(pezzo);
      salva('sopralluogo', sop);
      avvisa('Trascritto', 'ok');
    }
    if (!pezzo.grezzo.trim()) { pezzo.stato = 'riordinato'; pezzo.titolo = pezzo.titolo || 'Registrazione vuota'; salva('sopralluogo', sop); return; }
    accoda({ tipo: 'rilievo', sop: sop.id, pezzo: pezzo.id, sezione: l.sezione, etichetta: l.etichetta });
    return;
  }
  if (l.per === 'foto') {
    const sop = sopralluogo(l.sop);
    const f = sop && trovaFoto(sop, l.foto);
    if (!f) { await cancellaMedia(l.audio); return; }
    if (!l.grezzo) {
      const blob = await leggiMedia(l.audio);
      if (!blob) throw new Error('Audio non trovato nel telefono');
      l.grezzo = await trascriviConGroq(blob);
      salvaLocale();
      avvisa('Trascritto', 'ok');
    }
    // Come per le note: l'audio del referto serve solo a trascrivere. La foto invece resta.
    await cancellaMedia(l.audio);
    if (f.audio === l.audio) f.audio = null;
    f.grezzo = aggiungiTesto(f.grezzo, l.grezzo);
    f.stato = 'trascritto';
    salva('sopralluogo', sop);
    accoda({ tipo: 'referto', sop: sop.id, foto: f.id, grezzo: l.grezzo, etichetta: l.etichetta });
  }
}

/* Il dettato di un rilievo va dritto nel suo paragrafo: il tasto ha già detto dove.
   Non passa dallo smistamento — costa meno e non può finire nella sezione sbagliata. */
async function lavoroRilievo(l) {
  const sop = sopralluogo(l.sop);
  const pezzo = sop && sop.pezzi.find(function (p) { return p.id === l.pezzo; });
  if (!pezzo || pezzo.stato === 'riordinato') return;
  const grezzo = String(pezzo.grezzo || '').trim();
  let testo = grezzo;
  if (grezzo && chiaveAnthropic()) {
    testo = String(await chiamaClaude(REGOLE_RILIEVO, 'Dettato: ' + grezzo, 800)).trim().replace(/^["«“]+|["»”]+$/g, '').trim() || grezzo;
  }
  // Come per le sezioni: il testo nuovo non sostituisce quello che c'è già, si aggiunge in fondo.
  sop.sezioni[l.sezione] = aggiungiTesto(sop.sezioni[l.sezione], testo);
  pezzo.stato = 'riordinato';
  pezzo.errore = null;
  salva('sopralluogo', sop);
  allineaVerbale(sop, [l.sezione]);
  /* Il testo è già al sicuro nella sezione. In più si fa vedere subito, in una
     scheda con "Va bene" e "Correggi": resta finché non si preme uno dei due,
     anche cambiando schermata. Vive nel telefono, non nei dati. */
  if (testo) {
    const loc = leggiLocale();
    loc.rilieviNuovi.push({ id: nuovoId(), sop: sop.id, cantiere: sop.cantiere, sezione: l.sezione, testo: testo, ora: pezzo.ora || oraAdesso() });
    salvaLocale();
  }
  avvisa('Rilievo pronto', 'ok');
  aggiornaVista();
}

/* La scheda del rilievo appena arrivato. Si mostra nella giornata (per sopralluogo)
   e nel cantiere (per cantiere): dove uno si trova. "Correggi" apre il testo lì
   dentro; salvando si sostituisce solo il pezzo aggiunto, non tutta la sezione. */
function cardRilieviNuovi(filtro) {
  const lista = leggiLocale().rilieviNuovi.filter(function (r) { return filtro.sop ? r.sop === filtro.sop : r.cantiere === filtro.cantiere; });
  if (!lista.length) return '';
  return lista.map(function (r) {
    return '<div class="card gialla"><div class="card-capo gialla">' + h(nomeSezione(r.sezione)) + ' · rilievo delle ' + h(oraCorta(r.ora)) + '</div>' +
      (r.modifica
        ? '<textarea class="corpo" id="ril-' + h(r.id) + '">' + h(r.testo) + '</textarea>' +
          '<div class="griglia"><button class="btn btn-ok" data-az="rilievo-salva" data-id="' + h(r.id) + '">Salva</button>' +
          '<button class="btn" data-az="rilievo-annulla" data-id="' + h(r.id) + '">Annulla</button></div>'
        : '<div class="card-corpo">' + testoElenco(r.testo, true) + '</div>' +
          '<div class="griglia"><button class="btn btn-ok" data-az="rilievo-ok" data-id="' + h(r.id) + '">Va bene</button>' +
          '<button class="btn" data-az="rilievo-correggi" data-id="' + h(r.id) + '">Correggi</button></div>') +
      '</div>';
  }).join('');
}
function rilievoNuovo(id) { return leggiLocale().rilieviNuovi.find(function (r) { return r.id === id; }) || null; }
function togliRilievoNuovo(id) {
  const loc = leggiLocale();
  loc.rilieviNuovi = loc.rilieviNuovi.filter(function (r) { return r.id !== id; });
  salvaLocale();
}
/* Il pezzo aggiunto si cerca tale e quale nella sezione e si sostituisce. Se nel
   frattempo la sezione è stata cambiata a mano e il pezzo non c'è più uguale, il
   testo corretto si aggiunge in fondo: non si perde niente in nessun caso. */
function correggiRilievo(id, nuovo) {
  const r = rilievoNuovo(id);
  const s = r && sopralluogo(r.sop);
  if (!s) { togliRilievoNuovo(id); return; }
  nuovo = String(nuovo || '').trim();
  const attuale = String(s.sezioni[r.sezione] || '');
  const dove = attuale.lastIndexOf(r.testo);
  if (dove !== -1) {
    s.sezioni[r.sezione] = (attuale.slice(0, dove) + nuovo + attuale.slice(dove + r.testo.length)).replace(/\n{3,}/g, '\n\n').trim();
  } else {
    s.sezioni[r.sezione] = aggiungiTesto(attuale, nuovo);
    avvisa('La sezione era cambiata: il testo corretto è in fondo', 'att');
  }
  salva('sopralluogo', s);
  allineaVerbale(s, [r.sezione]);
  togliRilievoNuovo(id);
}

// Il dettato di una foto diventa una didascalia. Senza chiave resta il testo grezzo: non si perde niente.
async function lavoroReferto(l) {
  const sop = sopralluogo(l.sop);
  const f = sop && trovaFoto(sop, l.foto);
  if (!f) return;
  const grezzo = String(l.grezzo || '').trim();
  let didascalia = grezzo;
  if (grezzo && chiaveAnthropic()) {
    const risposta = String(await chiamaClaude(REGOLE_FOTO, 'Dettato: ' + grezzo, 800)).trim();
    const j = estraiJSON(risposta);
    if (j && j.didascalia) {
      didascalia = String(j.didascalia).trim() || grezzo;
      /* La sezione la sceglie Claude dal referto, come per il testo dettato. Non si applica
         a un documento — una bolla non appartiene a un capitolo — e non si applica se la
         sezione l'ha già messa a mano una persona: quella vince sempre. */
      if (!f.genere && !f.sezioneScelta && CHIAVI_SEZIONI.indexOf(j.sezione) !== -1) f.sezione = j.sezione;
    } else {
      didascalia = risposta.replace(/^["«“]+|["»”]+$/g, '').trim() || grezzo;
    }
  }
  // Come per le sezioni: il testo nuovo non sostituisce quello che c'è già, si aggiunge in fondo.
  f.referto = aggiungiTesto(f.referto, didascalia);
  f.stato = 'riordinato';
  f.errore = null;
  salva('sopralluogo', sop);
  avvisa(grezzo ? 'Referto pronto' : 'Registrazione vuota', grezzo ? 'ok' : 'att');
}

async function lavoroRiordino(l) {
  let sop = sopralluogo(l.sop);
  if (!sop) return;
  let pezzo = sop.pezzi.find(function (p) { return p.id === l.pezzo; });
  if (!pezzo || pezzo.stato === 'riordinato') return;
  if (!chiaveAnthropic()) {
    // Senza chiave il testo non si perde: va in "da smistare", e l'uomo lo mette dove va.
    const r = { titolo: '' }; r.da_smistare = pezzo.grezzo;
    applicaRiordino(sop, pezzo, r);
    pezzo.titolo = pezzo.titolo || 'Registrazione delle ' + pezzo.ora;
    salva('sopralluogo', sop);
    return;
  }
  /* Lo scan gira solo se la destinazione non e' gia' decisa a mano (assegnaPezzo lo
     segna con "assegnato"): senza questo, ogni pezzo appena scelto dalla scheda
     "da assegnare" tornava a chiedere la stessa cosa da capo, e il dettato non
     entrava mai nelle sezioni. Se il tecnico ha nominato un sopralluogo, il pezzo ci va
     dentro da solo — anche se quel sopralluogo ha gia il verbale fatto, e allora lo
     diciamo. Se non ha nominato niente, il pezzo resta li' da assegnare: la scelta
     compare sulla sua card, e nessun testo entra in una sezione prima di quella. */
  if (!l.assegnato) {
    const scan = await scansionaDestinazione(sop, pezzo.grezzo);
    if (scan.pulito && scan.pulito !== pezzo.grezzo) { pezzo.grezzo = scan.pulito; salva('sopralluogo', sop); }
    // Se il tecnico non ha nominato nessun sopralluogo e nella giornata ce n'è uno solo,
    // è per forza quello: la registrazione ci entra da sola. Si chiede solo quando c'è
    // davvero da scegliere. Che il sopralluogo abbia già il verbale non conta: le
    // sezioni nuove ci passano da sole (allineaVerbale).
    const quantiOggi = sopralluoghiDelGiorno(sop.cantiere, sop.giorno).length;
    const destino = scan.sop || (quantiOggi <= 1 ? sop : null);
    if (destino && destino.id !== sop.id) {
      const spostato = spostaPezzo(sop, pezzo, destino);
      if (spostato) {
        sop = spostato.sop; pezzo = spostato.pezzo;
        avvisa('Va nel ' + nomeSopralluogo(sop), 'ok');
      }
    } else if (!destino) {
      pezzo.daAssegnare = true;
      pezzo.stato = 'da-assegnare';
      pezzo.titolo = pezzo.titolo || primaRiga(pezzo.grezzo) || ('Registrazione delle ' + pezzo.ora);
      salva('sopralluogo', sop);
      avvisa('Dimmi in che sopralluogo va', 'att');
      aggiornaVista();
      return;
    }
  }
  const risultato = await riordinaConClaude(sop, pezzo.grezzo);
  applicaRiordino(sop, pezzo, risultato);
  avvisa('Riordinato', 'ok');
}

/* Sposta una registrazione da un sopralluogo all'altro, con le sue foto e il suo audio.
   Il testo gia' finito nelle sezioni resta dov'era: qui si sposta solo la registrazione. */
function spostaPezzo(da, pezzo, a) {
  const dest = sopralluogo(a.id);
  if (!dest) return null;
  da.pezzi = da.pezzi.filter(function (p) { return p.id !== pezzo.id; });
  const copia = Object.assign({}, pezzo);
  dest.pezzi.push(copia);
  salva('sopralluogo', da);
  salva('sopralluogo', dest);
  return { sop: dest, pezzo: dest.pezzi[dest.pezzi.length - 1] };
}

/* La registrazione in attesa finisce nel sopralluogo scelto e da li' riparte il riordino.
   Se si sceglie "un sopralluogo nuovo", nasce con l'ora della registrazione. */
async function assegnaPezzo(sopId, pezzoId, destId) {
  const sop = sopralluogo(sopId);
  if (!sop) return;
  const pezzo = sop.pezzi.find(function (p) { return p.id === pezzoId; });
  if (!pezzo) return;
  let dest = sop;
  if (destId === 'nuovo') {
    const c = cantierePerCodice(sop.cantiere);
    if (!c) return;
    dest = creaSopralluogo(c, sop.giorno, pezzo.ora || oraAdesso());
  } else if (destId && destId !== sopId) {
    dest = sopralluogo(destId) || sop;
  }
  let corrente = { sop: sop, pezzo: pezzo };
  if (dest.id !== sop.id) {
    const spostato = spostaPezzo(sop, pezzo, dest);
    if (spostato) corrente = spostato;
  }
  corrente.pezzo.daAssegnare = false;
  corrente.pezzo.stato = 'trascritto';
  salva('sopralluogo', corrente.sop);
  chiudiFoglio();
  if (dest.id !== sop.id) vai('#/giorno/' + corrente.sop.id);
  aggiornaVista();
  accoda({ tipo: 'riordino', sop: corrente.sop.id, pezzo: corrente.pezzo.id, etichetta: 'Riordino', assegnato: true });
}

/* All'avvio: le registrazioni rimaste "da assegnare" in una giornata che ha un
   sopralluogo solo non hanno niente da scegliere. Entrano lì e si riordinano. */
function ripescaDaAssegnare() {
  valori(leggiTutto().sopralluoghi).forEach(function (s) {
    const attesa = (s.pezzi || []).filter(function (p) { return p.daAssegnare; });
    if (!attesa.length || sopralluoghiDelGiorno(s.cantiere, s.giorno).length > 1) return;
    attesa.forEach(function (p) { p.daAssegnare = false; p.stato = 'trascritto'; });
    salva('sopralluogo', s);
    attesa.forEach(function (p) { accoda({ tipo: 'riordino', sop: s.id, pezzo: p.id, etichetta: 'Riordino' }); });
  });
}

async function lavoroNota(l) {
  const c = cantiere(l.cantiere);
  if (!c) return;
  c.note = aggiungiTesto(c.note, l.grezzo);
  salva('cantiere', c);
  avvisa('Salvato', 'ok');
}

/* ============================================================
   LA REGISTRAZIONE
   Si preme per iniziare, si preme per fermare. Non si ferma da sola.
   La striscia vive fuori dalle schermate: si può scorrere e cambiare pagina
   mentre il microfono resta acceso.
   ============================================================ */

const REG = {
  attiva: false, recorder: null, stream: null, pezzi: [], inizio: 0, inizioPezzo: 0,
  timer: null, contesto: null, audioCtx: null, analizzatore: null, rafOnda: null, spezzaTimer: null, destinazione: null,
  // Chi ha fermato (la persona o il telefono), se c'è da riprendere, e il blocco dello schermo.
  fermataUtente: false, daRiprendere: false, sveglia: null
};

function registrazioneAttiva() { return REG.attiva; }

/* Il microfono è negato: una pagina web non può aprire le Impostazioni del telefono,
   né su iPhone né su Android. Quindi si spiega, con i passi giusti per quel telefono
   e per come è aperta l'app. La destinazione resta da parte: "Riprova" riparte da lì. */
let MIC_DESTINAZIONE = null;
function apriFoglioMicrofono(destinazione) {
  MIC_DESTINAZIONE = destinazione;
  const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installata = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const passi = iphone
    ? (installata
      ? ['Apri Impostazioni del telefono.', 'Tocca App, poi Safari.', 'Tocca Impostazioni per i siti web, poi Microfono.', 'Trova CANTIERI e scegli Consenti.', 'Torna qui e tocca Riprova.']
      : ['Tocca AA a sinistra dell\'indirizzo, in alto.', 'Tocca Impostazioni sito web.', 'Alla voce Microfono scegli Consenti.', 'Torna qui e tocca Riprova.'])
    : (installata
      ? ['Tieni premuta l\'icona di CANTIERI sulla schermata Home.', 'Tocca Informazioni app, poi Impostazioni sito.', 'Alla voce Microfono scegli Consenti.', 'Torna qui e tocca Riprova.']
      : ['Tocca il lucchetto (o l\'icona) a sinistra dell\'indirizzo, in alto.', 'Tocca Autorizzazioni.', 'Alla voce Microfono scegli Consenti.', 'Torna qui e tocca Riprova.']);
  const nota = iphone
    ? (installata
      ? 'Se CANTIERI non c\'è nell\'elenco: togli l\'icona dalla schermata Home, apri l\'indirizzo in Safari, consenti il microfono, poi rimetti l\'icona con Condividi › Aggiungi alla schermata Home.'
      : 'Se non trovi AA: Impostazioni del telefono › App › Safari › Impostazioni per i siti web › Microfono › CANTIERI › Consenti.')
    : '';
  apriFoglio(
    '<h2>Il microfono è spento per questa app</h2>' +
    '<ol class="passi">' + passi.map(function (p) { return '<li>' + h(p) + '</li>'; }).join('') + '</ol>' +
    (nota ? '<p class="nota-piccola">' + h(nota) + '</p>' : '') +
    '<button class="btn btn-ok" data-az="microfono-riprova">Riprova</button>' +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>'
  );
}

async function avviaRegistrazione(destinazione) {
  if (REG.attiva) return;
  if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    avvisa('Microfono non disponibile', 'err');
    return;
  }
  let stream;
  try {
    // Il permesso si chiede qui, alla prima pressione del bottone, non all'apertura dell'app.
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    // Permesso negato: un foglio che spiega come ridarlo. Il resto: un avviso.
    if (e && (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError')) apriFoglioMicrofono(destinazione);
    else avvisa('Microfono non disponibile', 'err');
    return;
  }
  REG.stream = stream;
  REG.destinazione = destinazione;
  REG.attiva = true;
  REG.fermataUtente = false;
  REG.daRiprendere = false;
  REG.inizio = Date.now();
  sorvegliaTraccia(stream);
  avviaPezzo();
  avviaOnda(stream);
  tieniSveglio();
  document.getElementById('striscia').hidden = false;
  document.getElementById('reg-tempo').textContent = '0:00';
  REG.timer = setInterval(aggiornaTempoRegistrazione, 500);
  avvisa('Registrando', 'err');
  aggiornaVista();
}

/* Lo schermo non si spegne da solo finché si registra: in stand-by il telefono
   toglie il microfono all'app. Il blocco cade da solo quando la pagina va sotto
   (una chiamata, un'altra app) e si richiede quando torna. */
async function tieniSveglio() {
  if (!REG.attiva || !navigator.wakeLock) return;
  try {
    REG.sveglia = await navigator.wakeLock.request('screen');
    REG.sveglia.addEventListener('release', function () { REG.sveglia = null; });
  } catch (e) { REG.sveglia = null; }
}
function lasciaDormire() {
  if (REG.sveglia) { try { REG.sveglia.release(); } catch (e) { /* già rilasciato */ } REG.sveglia = null; }
}

/* Una chiamata in arrivo, o il telefono che va in stand-by, chiude la traccia
   del microfono senza che nessuno abbia premuto Stop. Quando succede si chiude
   il pezzo — così l'audio fatto fin lì è al sicuro — e si riprende con un
   pezzo nuovo appena il microfono torna, da solo. */
function sorvegliaTraccia(stream) {
  const traccia = stream.getAudioTracks()[0];
  if (!traccia) return;
  const interrotta = function () {
    if (!REG.attiva || REG.fermataUtente || REG.stream !== stream) return;
    if (REG.recorder && REG.recorder.state === 'recording') { try { REG.recorder.stop(); } catch (e) { riprendiRegistrazione(); } }
    else riprendiRegistrazione();
  };
  traccia.addEventListener('ended', interrotta);
  traccia.addEventListener('mute', interrotta);
}
async function riprendiRegistrazione() {
  if (!REG.attiva || REG.fermataUtente) return;
  if (REG.recorder && REG.recorder.state === 'recording') return;
  chiudiStream();
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) {
    // Sotto una chiamata il microfono non si dà: si riprova quando l'app torna davanti.
    REG.daRiprendere = true;
    avvisa('Registrazione in pausa: riprende da sola', 'att');
    return;
  }
  if (!REG.attiva || REG.fermataUtente) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }
  REG.stream = stream;
  REG.daRiprendere = false;
  sorvegliaTraccia(stream);
  avviaPezzo();
  fermaOnda();
  avviaOnda(stream);
  tieniSveglio();
  avvisa('Registrazione ripresa', 'ok');
}

function avviaPezzo() {
  // Su iPhone esce audio/mp4: si accetta com'è, senza forzare formati.
  let recorder;
  try { recorder = new MediaRecorder(REG.stream); }
  catch (e) { avvisa('Registrazione non riuscita', 'err'); fermaRegistrazione(); return; }
  REG.recorder = recorder;
  REG.pezzi = [];
  REG.inizioPezzo = Date.now();
  recorder.ondataavailable = function (e) { if (e.data && e.data.size) REG.pezzi.push(e.data); };
  // Un errore del registratore non è uno Stop: si riprende con un pezzo nuovo.
  recorder.onerror = function () { if (REG.attiva && !REG.fermataUtente && recorder.state !== 'recording') riprendiRegistrazione(); };
  recorder.onstop = function () {
    const durata = Math.round((Date.now() - REG.inizioPezzo) / 1000);
    const blob = new Blob(REG.pezzi, { type: recorder.mimeType || 'audio/mp4' });
    const ora = oraAdesso(new Date(REG.inizioPezzo));
    REG.pezzi = [];
    if (blob.size > 0) salvaPezzoRegistrato(blob, durata, ora, REG.destinazione);
    if (REG.continua) { REG.continua = false; avviaPezzo(); }
    // Fermato non da chi registra ma dal telefono (chiamata, stand-by): si riprende.
    else if (REG.attiva && !REG.fermataUtente) riprendiRegistrazione();
    else chiudiStream();
  };
  recorder.start(1000);
  // Sopra i 40 minuti la trascrizione rifiuta il file: si spezza da soli e si va avanti senza fermarsi.
  clearTimeout(REG.spezzaTimer);
  REG.spezzaTimer = setTimeout(function () {
    if (REG.attiva && REG.recorder && REG.recorder.state === 'recording') { REG.continua = true; REG.recorder.stop(); }
  }, LIMITE_PEZZO_SECONDI * 1000);
}

function fermaRegistrazione() {
  if (!REG.attiva) return;
  REG.attiva = false;
  REG.fermataUtente = true;
  REG.daRiprendere = false;
  lasciaDormire();
  clearInterval(REG.timer);
  clearTimeout(REG.spezzaTimer);
  fermaOnda();
  document.getElementById('striscia').hidden = true;
  if (REG.recorder && REG.recorder.state !== 'inactive') {
    REG.continua = false;
    try { REG.recorder.stop(); } catch (e) { chiudiStream(); }
  } else chiudiStream();
  aggiornaVista();
}
function chiudiStream() {
  if (REG.stream) { REG.stream.getTracks().forEach(function (t) { t.stop(); }); REG.stream = null; }
  if (REG.audioCtx) { try { REG.audioCtx.close(); } catch (e) { /* già chiuso */ } REG.audioCtx = null; }
  REG.recorder = null;
}
function aggiornaTempoRegistrazione() {
  const el = document.getElementById('reg-tempo');
  if (el) el.textContent = durataBreve((Date.now() - REG.inizio) / 1000);
}

// L'onda non è decorazione: è l'unico modo di sapere che il microfono sta prendendo davvero.
function avviaOnda(stream) {
  const onda = document.getElementById('reg-onda');
  onda.innerHTML = '';
  const N = 24;
  for (let i = 0; i < N; i++) onda.appendChild(document.createElement('i'));
  const barre = Array.prototype.slice.call(onda.children);
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    REG.audioCtx = new AC();
    const sorgente = REG.audioCtx.createMediaStreamSource(stream);
    REG.analizzatore = REG.audioCtx.createAnalyser();
    REG.analizzatore.fftSize = 512;
    sorgente.connect(REG.analizzatore);
    if (REG.audioCtx.state === 'suspended') REG.audioCtx.resume();
  } catch (e) { return; }
  const dati = new Uint8Array(REG.analizzatore.fftSize);
  const storia = [];
  function passo() {
    if (!REG.attiva) return;
    REG.analizzatore.getByteTimeDomainData(dati);
    let somma = 0;
    for (let i = 0; i < dati.length; i++) { const v = (dati[i] - 128) / 128; somma += v * v; }
    const rms = Math.sqrt(somma / dati.length);
    storia.push(rms);
    if (storia.length > N) storia.shift();
    for (let i = 0; i < N; i++) {
      const v = storia[storia.length - N + i] || 0;
      barre[i].style.height = Math.max(4, Math.min(26, 4 + v * 160)) + 'px';
    }
    REG.rafOnda = requestAnimationFrame(passo);
  }
  passo();
}
function fermaOnda() { if (REG.rafOnda) cancelAnimationFrame(REG.rafOnda); REG.rafOnda = null; }

/* Appena fermato: si salva nel telefono, subito, e parte verso la trascrizione. */
async function salvaPezzoRegistrato(blob, durata, ora, destinazione) {
  const id = nuovoId();
  let rif = null;
  try { rif = await salvaMedia(id, blob); }
  catch (e) { avvisa('Audio non salvato', 'err'); return; }
  if (destinazione.tipo === 'sopralluogo') {
    const sop = sopralluogo(destinazione.id);
    if (!sop) return;
    const pezzo = { id: id, ora: ora, durata: durata, audio: rif, grezzo: '', titolo: '', sezione: '', sezioni: [], stato: 'in_coda', peso: blob.size };
    sop.pezzi.push(pezzo);
    salva('sopralluogo', sop);
    avvisa('Salvato', 'ok');
    accoda({ tipo: 'trascrizione', per: 'sopralluogo', sop: sop.id, pezzo: id, etichetta: 'Registrazione delle ' + ora });
  } else if (destinazione.tipo === 'nota') {
    avvisa('Salvato', 'ok');
    accoda({ tipo: 'trascrizione', per: 'nota', cantiere: destinazione.cantiere, audio: rif, ora: ora, etichetta: 'nota delle ' + ora });
  } else if (destinazione.tipo === 'rilievo') {
    const sop = sopralluogo(destinazione.sop);
    if (!sop) { await cancellaMedia(rif); return; }
    // Il rilievo resta una registrazione come le altre: si riascolta, si butta, si conta.
    // Quello che cambia è che la sua sezione è già decisa dal tasto.
    const nome = nomeSezione(destinazione.sezione);
    const pezzo = { id: id, ora: ora, durata: durata, audio: rif, grezzo: '', titolo: nome + ' delle ' + ora,
      sezione: destinazione.sezione, sezioni: [destinazione.sezione], stato: 'in_coda', peso: blob.size };
    sop.pezzi.push(pezzo);
    salva('sopralluogo', sop);
    avvisa('Salvato', 'ok');
    accoda({ tipo: 'trascrizione', per: 'rilievo', sop: sop.id, pezzo: id, sezione: destinazione.sezione, etichetta: nome + ' delle ' + ora });
  } else if (destinazione.tipo === 'foto') {
    const sop = sopralluogo(destinazione.sop);
    const f = sop && trovaFoto(sop, destinazione.foto);
    if (!f) { await cancellaMedia(rif); return; }
    // Il riferimento all'audio sta anche sulla foto: così la card Spazio lo conta e la schermata sa che c'è un referto in arrivo.
    f.audio = rif; f.stato = 'in_coda'; f.errore = null;
    salva('sopralluogo', sop);
    avvisa('Salvato', 'ok');
    accoda({ tipo: 'trascrizione', per: 'foto', sop: sop.id, foto: f.id, audio: rif, etichetta: nomeFoto(f) });
  }
  aggiornaVista();
}

/* ---- riascolto ---- */
let urlInAscolto = null;
let pezzoInAscolto = null;
/* La voce è il dato più delicato che l'app tiene: appena il testo trascritto è
   salvato, l'audio si cancella dal telefono. Resta il testo — grezzo e poi
   riordinato — che è quello che conta. Chi lo chiama salva il sopralluogo. */
async function scordaAudioPezzo(pezzo) {
  if (!pezzo.audio) return;
  if (pezzoInAscolto === pezzo.id) { const lettore = document.getElementById('lettore'); if (lettore) lettore.pause(); pezzoInAscolto = null; }
  await cancellaMedia(pezzo.audio);
  pezzo.audio = null; pezzo.cancellato = adessoISO();
}
/* Rete di sicurezza al verbale: un audio rimasto con il suo testo già scritto
   (cancellazione fallita, dati vecchi) si cancella qui. */
async function cancellaAudioTrascritti(s) {
  let tolti = 0;
  for (const p of s.pezzi) {
    if (!p.audio || !String(p.grezzo || '').trim()) continue;
    await scordaAudioPezzo(p); tolti++;
  }
  if (tolti) salva('sopralluogo', s);
  return tolti;
}
async function riascolta(sopId, pezzoId) {
  const lettore = document.getElementById('lettore');
  if (pezzoInAscolto === pezzoId && !lettore.paused) { lettore.pause(); pezzoInAscolto = null; aggiornaVista(); return; }
  const sop = sopralluogo(sopId);
  const pezzo = sop && sop.pezzi.find(function (p) { return p.id === pezzoId; });
  if (!pezzo) return;
  if (!pezzo.audio) { avvisa(pezzo.cancellato ? 'Audio cancellato dopo la trascrizione' : (pezzo.archiviato ? 'Audio archiviato' : 'Senza audio'), 'att'); return; }
  const blob = await leggiMedia(pezzo.audio);
  if (!blob) { avvisa('Audio non trovato', 'err'); return; }
  if (urlInAscolto) URL.revokeObjectURL(urlInAscolto);
  urlInAscolto = URL.createObjectURL(blob);
  lettore.src = urlInAscolto;
  pezzoInAscolto = pezzoId;
  lettore.onended = function () { pezzoInAscolto = null; aggiornaVista(); };
  try { await lettore.play(); } catch (e) { avvisa('Non si sente', 'err'); pezzoInAscolto = null; }
  aggiornaVista();
}
// "extra" è quello che sta sotto il testo: le foto della sezione. Una sezione con sole foto non ha corpo.
function rigaAudio(sop, pezzo, opzioni) {
  opzioni = opzioni || {};
  const suona = pezzoInAscolto === pezzo.id;
  let sotto = '', classe = '';
  const nome = pezzo.titolo || 'Registrazione delle ' + pezzo.ora;
  if (pezzo.stato === 'in_coda') { sotto = 'in coda' + (pezzo.errore ? ' · ' + pezzo.errore : '') + ' · ' + pezzo.ora; classe = 'att'; }
  else if (pezzo.stato === 'in_corso' || pezzo.stato === 'trascritto') { sotto = (pezzo.stato === 'trascritto' ? 'trascritto, riordino in corso' : 'trascrivendo…') + ' · ' + pezzo.ora; classe = 'att'; }
  else if (pezzo.stato === 'errore') { sotto = testoErrorePezzo(pezzo.errore); classe = 'err'; }
  else if (pezzo.archiviato) { sotto = 'audio archiviato il ' + dataSenzaAnno(pezzo.archiviato) + ' · ' + pezzo.ora; }
  else if (pezzo.cancellato) { sotto = 'audio cancellato dopo la trascrizione · ' + pezzo.ora; }
  else if (!pezzo.audio) { sotto = 'esempio, senza audio · ' + pezzo.ora; }
  else if (opzioni.dentroSezione) { sotto = pezzo.ora; }
  else { sotto = (pezzo.sezione ? nomeSezione(pezzo.sezione) : 'da smistare') + ' · ' + pezzo.ora; }
  const spento = !pezzo.audio;
  // Riprova solo quando ha senso: l'audio c'è ancora e l'errore non è di quelli che si ripetono uguali.
  const riprova = pezzo.stato === 'errore' && (pezzo.audio || pezzo.grezzo) && !errorePermanente(pezzo.errore);
  return '<div class="audio' + (opzioni.dentroSezione ? ' sotto' : '') + '">' +
    '<button class="play' + (spento ? ' spento' : '') + (suona ? ' suona' : '') + '" data-az="riascolta" data-sop="' + h(sop.id) + '" data-id="' + h(pezzo.id) + '" aria-label="Riascolta">' + (suona ? '❚❚' : '▶') + '</button>' +
    '<button class="n" data-az="vai-sezione" data-sop="' + h(sop.id) + '" data-id="' + h(pezzo.id) + '"><div class="t">' + h(nome) + '</div><div class="s ' + classe + '">' + h(sotto) + '</div></button>' +
    (riprova ? '<button class="riprova" data-az="pezzo-riprova" data-sop="' + h(sop.id) + '" data-id="' + h(pezzo.id) + '">Riprova</button>' : '<span class="d">' + durataBreve(pezzo.durata) + '</span>') +
    // La ✕ in fondo alla riga: una registrazione venuta male si butta e si rifà, sempre.
    '<button class="x-riga" data-az="pezzo-elimina" data-sop="' + h(sop.id) + '" data-id="' + h(pezzo.id) + '" aria-label="Elimina la registrazione">✕</button></div>';
}
/* Gli errori che si ripetono uguali a ogni tentativo: riprovare non serve, si dice
   cosa fare. Gli altri (rete, servizio occupato) si riprovano. */
function errorePermanente(errore) { return /\b(400|401|403|413)\b|Manca la chiave/.test(String(errore || '')); }
function testoErrorePezzo(errore) {
  const e = String(errore || '');
  if (/\b40[13]\b/.test(e)) return 'chiave non valida: controlla il Modo tecnico';
  if (/\b413\b/.test(e)) return 'registrazione troppo grande';
  if (/\b400\b/.test(e)) return 'file non accettato';
  return 'non riuscito: ' + e;
}
/* Il lavoro di quel pezzo torna in coda, dello stesso tipo. Se non c'è più (coda
   svuotata dal Modo tecnico) si ricrea: senza testo grezzo una trascrizione, con il
   testo il passo dopo — il riordino, o il rilievo se il pezzo era un rilievo. */
function riprovaPezzo(sop, pezzo) {
  const loc = leggiLocale();
  const l = loc.coda.find(function (x) { return x.pezzo === pezzo.id; });
  if (l) { l.stato = 'in_attesa'; l.tentativi = 0; l.prossimo = 0; l.errore = null; salvaLocale(); }
  else if (pezzo.audio || pezzo.grezzo) {
    const rilievo = pezzo.sezione === 'rilievi_ordine' || pezzo.sezione === 'rilievi_contabilita';
    const etichetta = pezzo.titolo || 'Registrazione delle ' + pezzo.ora;
    if (!pezzo.grezzo) accoda({ tipo: 'trascrizione', per: rilievo ? 'rilievo' : 'sopralluogo', sop: sop.id, pezzo: pezzo.id, sezione: rilievo ? pezzo.sezione : undefined, etichetta: etichetta });
    else if (rilievo) accoda({ tipo: 'rilievo', sop: sop.id, pezzo: pezzo.id, sezione: pezzo.sezione, etichetta: etichetta });
    else accoda({ tipo: 'riordino', sop: sop.id, pezzo: pezzo.id, etichetta: etichetta });
  } else return false;
  pezzo.stato = pezzo.grezzo ? 'trascritto' : 'in_coda';
  pezzo.errore = null;
  salva('sopralluogo', sop);
  return true;
}

/* Gli audio in una scatola alta tre righe, che scorre dentro di sé: dieci registrazioni
   non devono spingere il resto della giornata fuori dallo schermo. Il tasto sotto la
   apre tutta, e la scelta resta memorizzata come le tendine. */
const AUDIO_A_VISTA = 3;
function listaAudio(sop, pezzi, opzioni) {
  opzioni = opzioni || {};
  if (!pezzi.length) return '';
  const chiave = 'audio-' + (opzioni.chiave || sop.id);
  const tutta = !!leggiLocale().tendine[chiave];
  const troppi = pezzi.length > AUDIO_A_VISTA;
  return '<div class="audio-lista' + (troppi && !tutta ? ' corta' : '') + '">' +
    pezzi.map(function (p) { return rigaAudio(sop, statoLavoroPezzo(p), opzioni); }).join('') + '</div>' +
    (troppi ? '<button class="lista-tutta" data-az="lista-tutta" data-chiave="' + h(chiave) + '">' +
      (tutta ? '▲ Mostra solo le ultime ' + AUDIO_A_VISTA : '▼ Vedi tutte e ' + pezzi.length) + '</button>' : '');
}

function statoLavoroPezzo(pezzo) {
  // La coda sa più del pezzo: se un lavoro suo è in corso, lo si dice.
  const loc = leggiLocale();
  const l = loc.coda.find(function (x) { return x.pezzo === pezzo.id; });
  if (!l) return pezzo;
  const copia = Object.assign({}, pezzo);
  if (l.stato === 'in_corso') copia.stato = 'in_corso';
  else if (l.stato === 'fallito') { copia.stato = 'errore'; copia.errore = l.errore; }
  else if (l.stato === 'in_attesa' && pezzo.stato !== 'trascritto') { copia.stato = 'in_coda'; copia.errore = l.errore || null; }
  return copia;
}

/* Un sopralluogo in un elenco si scrive in una maniera sola, in tutta l'app: il nome in
   grassetto (o l'ora, se non ha nome) e sotto, in piccolo, l'ora e lo stato. */
function voceSopralluogoDaDettare(x) {
  const nome = String(x.nome || '').trim();
  const stato = x.chiuso ? 'chiuso — il suo verbale andrà aggiornato' : 'aperto';
  return '<button class="btn scelta" data-az="detta-in-sopralluogo" data-id="' + h(x.id) + '"><b>' + h(nome || x.ora) + '</b>' +
    '<small>' + h((nome ? x.ora + ' · ' : '') + stato) + '</small></button>';
}
/* Il foglio che chiede dove va la voce. Le voci arrivano già fatte; "Apri un sopralluogo
   nuovo" solo se si può (la giornata è oggi). La registrazione parte dentro il tocco sulla
   voce, come in detta-cantiere-scelto: su iPhone il microfono si accende solo nel gesto. */
function apriFoglioDoveDetta(titolo, voci, idCantiereNuovo) {
  apriFoglio('<h2>' + h(titolo) + '</h2>' + voci +
    (idCantiereNuovo ? '<button class="btn scelta" data-az="detta-sopralluogo-nuovo" data-id="' + h(idCantiereNuovo) + '"><b>Apri un sopralluogo nuovo</b></button>' : '') +
    '<button class="btn" data-az="chiudi-foglio" style="margin-top:8px">Annulla</button>');
}
// Da fuori della giornata: parte da solo solo se oggi c'è un sopralluogo aperto e uno solo, o nessuno.
function dettaSu(c) {
  const oggi = sopralluoghiDiOggi(c.codice);
  if (!oggi.length) return dettaInNuovo(c);
  if (oggi.length === 1 && !oggi[0].chiuso) return dettaIn(oggi[0]);
  apriFoglioDoveDetta('In quale sopralluogo?', oggi.map(function (x) { return voceSopralluogoDaDettare(x); }).join(''), c.id);
}
// Si va sulla giornata con quel sopralluogo aperto nel box, e il microfono parte: niente in mezzo.
function dettaIn(s) {
  sopralluogoEspanso = s.id;
  if (location.hash !== '#/giorno/' + s.id) vai('#/giorno/' + s.id);
  return avviaRegistrazione({ tipo: 'sopralluogo', id: s.id });
}
function dettaInNuovo(c) {
  return dettaIn(creaSopralluogo(c));
}

// Le azioni di questo file.
Object.assign(AZIONI, {
  'riascolta': function (el) { riascolta(el.dataset.sop, el.dataset.id); },
  // Apre o richiude una lista di audio lunga. La scelta sta con le tendine, così regge il ridisegno.
  'lista-tutta': function (el) {
    const loc = leggiLocale();
    loc.tendine[el.dataset.chiave] = !loc.tendine[el.dataset.chiave];
    salvaLocale();
    aggiornaVista();
  },
  // Dal foglio del microfono: si riparte dalla stessa destinazione, dentro il tocco, senza timer (iPhone se no nega).
  'microfono-riprova': function () { chiudiFoglio(); const d = MIC_DESTINAZIONE; MIC_DESTINAZIONE = null; if (d) return avviaRegistrazione(d); },
  // Riprova sulla riga dell'audio fallito: il suo lavoro torna in coda, dello stesso tipo.
  'pezzo-riprova': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const p = s && s.pezzi.find(function (x) { return x.id === el.dataset.id; });
    if (!p) return;
    if (riprovaPezzo(s, p)) { avvisa('Riprovo', 'ok'); elaboraCoda(); }
    aggiornaVista();
  },
  'pezzo-elimina': async function (el) {
    const s = sopralluogo(el.dataset.sop);
    const p = s && s.pezzi.find(function (x) { return x.id === el.dataset.id; });
    if (!p) return;
    const nome = p.titolo || 'Registrazione delle ' + p.ora;
    const ok = await chiedi('Eliminare questa registrazione?', nome + '. L\'audio si cancella dal telefono; il testo già finito nelle sezioni resta.', 'Elimina', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    await eliminaPezzo(s, p);
    avvisa('Eliminata', 'ok');
    aggiornaVista();
  },
  'vai-sezione': function (el) {
    const s = sopralluogo(el.dataset.sop);
    const p = s && s.pezzi.find(function (x) { return x.id === el.dataset.id; });
    if (!p) return;
    if (p.grezzo && (!p.sezione || p.stato === 'errore')) { mostraTestoPieno(p.titolo || 'Registrazione delle ' + p.ora, p.grezzo); return; }
    const chiave = p.sezione === 'da_smistare' ? null : p.sezione;
    if (!chiave) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    const card = document.getElementById('sez-' + chiave);
    if (!card) { avvisa(nomeSezione(chiave)); return; }
    // Se la sezione sta in una tendina chiusa, la si apre.
    const contenitore = card.parentElement;
    if (contenitore && contenitore.hidden) { contenitore.hidden = false; const t = contenitore.previousElementSibling; if (t) t.setAttribute('aria-expanded', 'true'); contenitore.querySelectorAll('textarea.corpo').forEach(cresciTextarea); }
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.remove('lampeggia'); void card.offsetWidth; card.classList.add('lampeggia');
  },
  /* "Detta" dentro la giornata: nel sopralluogo aperto nel box, se non è chiuso. Se è chiuso
     si chiede: aggiungere lì, uno degli altri sopralluoghi del giorno ancora aperti, o uno nuovo (solo oggi). */
  'detta': function (el) {
    const s = sopralluogo(el.dataset.id);
    if (!s) return;
    if (!s.chiuso) return avviaRegistrazione({ tipo: 'sopralluogo', id: s.id });
    const c = cantierePerCodice(s.cantiere);
    const altri = sopralluoghiDelGiorno(s.cantiere, s.giorno).filter(function (x) { return x.id !== s.id && !x.chiuso; });
    apriFoglioDoveDetta('Questo sopralluogo è chiuso. Dove metto quello che detti?',
      '<button class="btn scelta" data-az="detta-in-sopralluogo" data-id="' + h(s.id) + '"><b>Aggiungi a questo sopralluogo</b><small>il suo verbale andrà aggiornato</small></button>' +
      altri.map(function (x) { return voceSopralluogoDaDettare(x); }).join(''),
      c && s.giorno === oggiISO() ? c.id : null);
  },
  // Le voci dei fogli qui sopra: il microfono parte dentro il tocco, senza timer né attese prima.
  'detta-in-sopralluogo': function (el) { const s = sopralluogo(el.dataset.id); chiudiFoglio(); if (s) return dettaIn(s); },
  'detta-sopralluogo-nuovo': function (el) { const c = cantiere(el.dataset.id); chiudiFoglio(); if (c) return dettaInNuovo(c); },
  'detta-rilievo': function (el) {
    const s = giornoDelTasto(el);
    if (!s) return;
    avviaRegistrazione({ tipo: 'rilievo', sop: s.id, sezione: el.dataset.sezione });
  },
  // La scheda del rilievo appena arrivato: si accetta, si corregge, si salva.
  'rilievo-ok': function (el) { togliRilievoNuovo(el.dataset.id); aggiornaVista(); },
  'rilievo-correggi': function (el) { const r = rilievoNuovo(el.dataset.id); if (r) { r.modifica = true; salvaLocale(); aggiornaVista(); } },
  'rilievo-annulla': function (el) { const r = rilievoNuovo(el.dataset.id); if (r) { r.modifica = false; salvaLocale(); aggiornaVista(); } },
  'rilievo-salva': function (el) {
    const campo = document.getElementById('ril-' + el.dataset.id);
    correggiRilievo(el.dataset.id, campo ? campo.value : '');
    avvisa('Rilievo corretto', 'ok');
    aggiornaVista();
  },
  'assegna-pezzo': function (el) { assegnaPezzo(el.dataset.sop, el.dataset.pezzo, el.dataset.dest); },
  // --- note ---
  'detta-nota': function (el) { const c = cantiere(el.dataset.id); if (c) avviaRegistrazione({ tipo: 'nota', cantiere: c.id }); },
});

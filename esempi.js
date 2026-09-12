/* CANTIERI — esempi.js: i dati di esempio */
'use strict';


function inserisciDatiEsempio() {
  const oggi = oggiISO();
  const az = salva('azienda', { nome: 'Geom. Scirè', ragione: '', piva: '', indirizzo: '', telefono: '', mail: '', pec: '', note: '', media: [], esempio: true });
  const c1 = salva('cantiere', { nome: 'Via Mazzini 14', committente: 'Immobiliare Castelli', indirizzo: 'via Mazzini 14, Vigevano', azienda: az.codice, note: 'Accesso dal cancello sul retro, chiave dal custode.\nReferente del committente: geom. Ferrari, 333 1234567.', aperto: giorniFa(40), stato: 'attivo', esempio: true });
  const c2 = salva('cantiere', { nome: 'Scuola media Pascoli', committente: 'Comune di Mortara', indirizzo: 'via Roma 8, Mortara', azienda: az.codice, note: '', aperto: giorniFa(20), stato: 'attivo', esempio: true });
  salva('cantiere', { nome: 'Villa Serra, rifacimento tetto', committente: 'Famiglia Serra', indirizzo: 'strada per Gambolò 12', azienda: az.codice, note: 'Lavori consegnati.', aperto: giorniFa(120), stato: 'chiuso', esempio: true });

  // Un sopralluogo di due giorni fa, già chiuso col suo verbale
  const s1 = salva('sopralluogo', {
    cantiere: c1.codice, giorno: giorniFa(2), ora: '09:15',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Posa dell\'armatura del solaio sul lato sud. Casseratura completata per due campate su tre.',
      operai: 'Mario Rossi (Edil Rossi) — capo squadra\n3 carpentieri (Edil Rossi) — casseratura solaio\n2 ferraioli (Edil Rossi) — armatura',
      attrezzature_presenti: 'Gru a torre\nBetoniera\nTrabattello',
      materiali_necessari: '20 q di ferro Ø12, per giovedì\n3 bancali di blocchi da 30',
      problemi: 'Casseri arrivati alle 11 invece che alle 8: mezza giornata persa sulla terza campata.',
      note: 'Chiamare il geom. Ferrari per le quote dei pilastri.'
    }),
    pezzi: [
      { id: nuovoId(), ora: '09:16', durata: 72, audio: null, grezzo: 'allora oggi hanno posato l\'armatura del solaio sul lato sud e la casseratura è completata per due campate su tre', titolo: 'Armatura solaio lato sud', sezione: 'lavorazioni_eseguite', sezioni: ['lavorazioni_eseguite'], stato: 'riordinato', esempio: true },
      { id: nuovoId(), ora: '09:41', durata: 48, audio: null, grezzo: 'problemi i casseri sono arrivati alle undici invece che alle otto quindi mezza giornata persa sulla terza campata', titolo: 'Ritardo consegna casseri', sezione: 'problemi', sezioni: ['problemi'], stato: 'riordinato', esempio: true },
      { id: nuovoId(), ora: '10:02', durata: 93, audio: null, grezzo: 'materiali che servono per giovedì venti quintali di ferro fi dodici e tre bancali di blocchi da trenta appunto chiamare il geometra ferrari per le quote dei pilastri', titolo: 'Ferro da ordinare per giovedì', sezione: 'materiali_necessari', sezioni: ['materiali_necessari', 'note'], stato: 'riordinato', esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });
  const v1 = salva('verbale', { sopralluogo: s1.codice, cantiere: c1.codice, giorno: s1.giorno, ora: s1.ora, sezioni: Object.assign({}, s1.sezioni), esempio: true });
  s1.chiuso = new Date(daISO(s1.giorno).getTime() + 15 * 3600000 + 10 * 60000).toISOString();
  s1.verbale = v1.codice;
  salva('sopralluogo', s1);

  /* La giornata di oggi sul primo cantiere: tre passaggi, come capita davvero.
     Il primo del mattino ha già il suo verbale, quello del pomeriggio è in corso
     con una registrazione ancora da assegnare, l'ultimo è di fine giornata. */
  const m1 = salva('sopralluogo', {
    cantiere: c1.codice, giorno: oggi, ora: '08:10', nome: 'primo giro del mattino',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Scarico del ferro per il solaio del secondo piano. Pulizia del piano di lavoro.',
      operai: 'Mario Rossi (Edil Rossi) — capo squadra\n2 carpentieri (Edil Rossi) — scarico e stoccaggio',
      attrezzature_presenti: 'Gru a torre\nAutocarro con gru del fornitore',
      materiali_impiegati: '38 q di ferro Ø12 e Ø16, bolla n. 2214 di Ferriera Lomellina'
    }),
    pezzi: [
      { id: nuovoId(), ora: '08:12', durata: 54, audio: null, grezzo: 'scarico del ferro per il solaio del secondo piano trentotto quintali fi dodici e fi sedici bolla duemiladuecentoquattordici ferriera lomellina', titolo: 'Scarico ferro secondo piano', sezione: 'materiali_impiegati', sezioni: ['lavorazioni_eseguite', 'materiali_impiegati'], stato: 'riordinato', esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });
  const vm1 = salva('verbale', { sopralluogo: m1.codice, cantiere: c1.codice, giorno: oggi, ora: m1.ora, nome: 'mattino', sezioni: Object.assign({}, m1.sezioni), esempio: true });
  m1.chiuso = new Date(daISO(oggi).getTime() + 9 * 3600000).toISOString();
  m1.verbale = vm1.codice;
  salva('sopralluogo', m1);

  const p3 = salva('sopralluogo', {
    cantiere: c1.codice, giorno: oggi, ora: '17:05', nome: 'chiusura di giornata',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Bagnatura del getto. Copertura del solaio con teli per la notte.',
      sicurezza: 'Rimesso il fermapiede sul terzo impalcato del ponteggio lato nord, come segnalato nel pomeriggio.',
      note: 'Domani mattina disarmo delle sponde se il tempo regge.'
    }),
    pezzi: [
      { id: nuovoId(), ora: '17:06', durata: 61, audio: null, grezzo: 'bagnatura del getto e copertura con i teli per la notte sicurezza hanno rimesso il fermapiede sul terzo impalcato lato nord domani mattina disarmo delle sponde se il tempo regge', titolo: 'Chiusura e copertura getto', sezione: 'lavorazioni_eseguite', sezioni: ['lavorazioni_eseguite', 'sicurezza', 'note'], stato: 'riordinato', esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });
  const vp3 = salva('verbale', { sopralluogo: p3.codice, cantiere: c1.codice, giorno: oggi, ora: p3.ora, nome: 'sera', sezioni: Object.assign({}, p3.sezioni), esempio: true });
  p3.chiuso = new Date(daISO(oggi).getTime() + 17 * 3600000 + 40 * 60000).toISOString();
  p3.verbale = vp3.codice;
  salva('sopralluogo', p3);

  // Il sopralluogo di oggi, in corso
  salva('sopralluogo', {
    cantiere: c1.codice, giorno: oggi, ora: '14:30', nome: 'pomeriggio',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Getto del solaio al primo piano, completato entro le 12. Ripresa delle tracce impianti sul lato est.',
      operai: 'Mario Rossi (Edil Rossi) — capo squadra\n2 muratori (Edil Rossi) — getto solaio\nLuca Bianchi (Impianti Bianchi) — tracce impianti',
      sicurezza: 'Ponteggio lato nord senza fermapiede sul terzo impalcato. Segnalato al capo squadra.'
    }),
    pezzi: [
      { id: nuovoId(), ora: '14:31', durata: 42, audio: null, grezzo: 'lavorazioni eseguite getto del solaio al primo piano completato entro le dodici ripresa delle tracce impianti sul lato est', titolo: 'Getto solaio primo piano', sezione: 'lavorazioni_eseguite', sezioni: ['lavorazioni_eseguite'], stato: 'riordinato', esempio: true },
      { id: nuovoId(), ora: '14:36', durata: 65, audio: null, grezzo: 'capitolo operai mario rossi della edil rossi capo squadra due muratori sempre rossi sul getto e luca bianchi impianti bianchi sulle tracce', titolo: 'Squadra Rossi e impianti', sezione: 'operai', sezioni: ['operai'], stato: 'riordinato', esempio: true },
      { id: nuovoId(), ora: '14:49', durata: 145, audio: null, grezzo: 'sicurezza il ponteggio lato nord non ha il fermapiede sul terzo impalcato l\'ho segnalato al capo squadra', titolo: 'Ponteggio senza fermapiede', sezione: 'sicurezza', sezioni: ['sicurezza'], stato: 'riordinato', esempio: true },
      // Questa è arrivata senza che si capisse in che passaggio va: aspetta lì.
      { id: nuovoId(), ora: '15:20', durata: 37, audio: null, grezzo: 'il committente è passato e ha chiesto di spostare la presa della cucina di trenta centimetri verso la finestra', titolo: 'Richiesta del committente sulla presa', sezione: '', sezioni: [], stato: 'da-assegnare', daAssegnare: true, esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });

  /* Il verbale di giornata di ieri sul primo cantiere: un documento solo che
     tiene dentro i passaggi di quel giorno. Serve a far vedere com'è fatto. */
  const gIeri = giorniFa(1);
  const sIeriA = salva('sopralluogo', {
    cantiere: c1.codice, giorno: gIeri, ora: '08:40', nome: 'consegna materiali',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Montaggio delle sponde per il getto del solaio.',
      materiali_impiegati: '6 bancali di blocchi da 30, bolla n. 2198.'
    }),
    pezzi: [], chiuso: null, media: [], posizione: null, esempio: true
  });
  const vIeriA = salva('verbale', { sopralluogo: sIeriA.codice, cantiere: c1.codice, giorno: gIeri, ora: sIeriA.ora, sezioni: Object.assign({}, sIeriA.sezioni), esempio: true });
  sIeriA.chiuso = new Date(daISO(gIeri).getTime() + 10 * 3600000).toISOString();
  sIeriA.verbale = vIeriA.codice;
  salva('sopralluogo', sIeriA);

  const sIeriB = salva('sopralluogo', {
    cantiere: c1.codice, giorno: gIeri, ora: '15:10', nome: 'controllo del pomeriggio',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Controllo delle quote delle sponde prima del getto.',
      problemi: 'Una sponda fuori quota di 2 cm sul lato est: rifatta in giornata.'
    }),
    pezzi: [], chiuso: null, media: [], posizione: null, esempio: true
  });
  const vIeriB = salva('verbale', { sopralluogo: sIeriB.codice, cantiere: c1.codice, giorno: gIeri, ora: sIeriB.ora, sezioni: Object.assign({}, sIeriB.sezioni), esempio: true });
  sIeriB.chiuso = new Date(daISO(gIeri).getTime() + 16 * 3600000).toISOString();
  sIeriB.verbale = vIeriB.codice;
  salva('sopralluogo', sIeriB);

  const sezGiornata = {};
  CHIAVI_SEZIONI.forEach(function (k) { sezGiornata[k] = ''; });
  [sIeriA, sIeriB].forEach(function (x) {
    CHIAVI_SEZIONI.forEach(function (k) {
      const t = String(x.sezioni[k] || '').trim();
      if (t) sezGiornata[k] = aggiungiTesto(sezGiornata[k], 'Ore ' + x.ora + ' · ' + x.nome + '\n' + t);
    });
  });
  salva('verbale', { cantiere: c1.codice, giorno: gIeri, ora: sIeriA.ora, giornata: true,
    sopralluoghi: [sIeriA.codice, sIeriB.codice], nome: 'giornata di ieri', sezioni: sezGiornata, esempio: true });

  // Un sopralluogo vecchio sul secondo cantiere, chiuso
  const s3 = salva('sopralluogo', {
    cantiere: c2.codice, giorno: giorniFa(5), ora: '16:00',
    sezioni: Object.assign(sezioniVuote(), {
      lavorazioni_eseguite: 'Consegna del ferro. Controllo delle quote dei pilastri della palestra.',
      lavorazioni_non_eseguite: 'Non è stato gettato il cordolo lato ovest: mancava il ferro.',
      operai: '4 muratori (Impresa Colombo) — pilastri',
      attrezzature_necessarie: 'Autopompa per il getto della platea, settimana prossima'
    }),
    pezzi: [
      { id: nuovoId(), ora: '16:02', durata: 88, audio: null, grezzo: 'consegna del ferro controllo quote pilastri palestra non hanno gettato il cordolo lato ovest mancava il ferro quattro muratori della colombo sui pilastri per la settimana prossima ci vuole l\'autopompa per la platea', titolo: 'Consegna ferro e quote pilastri', sezione: 'lavorazioni_eseguite', sezioni: ['lavorazioni_eseguite', 'lavorazioni_non_eseguite', 'operai', 'attrezzature_necessarie'], stato: 'riordinato', esempio: true }
    ],
    chiuso: null, media: [], posizione: null, esempio: true
  });
  const v3 = salva('verbale', { sopralluogo: s3.codice, cantiere: c2.codice, giorno: s3.giorno, ora: s3.ora, sezioni: Object.assign({}, s3.sezioni), esempio: true });
  s3.chiuso = new Date(daISO(s3.giorno).getTime() + 17 * 3600000 + 20 * 60000).toISOString();
  s3.verbale = v3.codice;
  salva('sopralluogo', s3);

  // Il listino: quindici voci vere da prezzario edile
  const voci = [
    ['Scavo di sbancamento con mezzi meccanici', 'm³', 8.50],
    ['Scavo a sezione obbligata per fondazioni', 'm³', 14.20],
    ['Calcestruzzo C25/30 per fondazioni, fornito e posto in opera', 'm³', 145.00],
    ['Acciaio B450C per armature, lavorato e posto in opera', 'kg', 1.85],
    ['Casseforme per getti in calcestruzzo armato', 'm²', 28.00],
    ['Muratura in blocchi di laterizio porizzato sp. 30 cm', 'm²', 78.00],
    ['Tramezzi in laterizio forato sp. 8 cm', 'm²', 32.00],
    ['Intonaco civile per interni a tre strati', 'm²', 22.50],
    ['Intonaco rustico per esterni', 'm²', 19.00],
    ['Massetto in sabbia e cemento sp. 5 cm', 'm²', 18.00],
    ['Impermeabilizzazione con guaina bituminosa 4 mm', 'm²', 16.50],
    ['Solaio in latero-cemento H 20+4', 'm²', 62.00],
    ['Tinteggiatura interna a due mani con idropittura', 'm²', 7.80],
    ['Ponteggio metallico, nolo per il primo mese', 'm²', 9.50],
    ['Demolizione di pavimento e sottofondo', 'm²', 12.00]
  ];
  const lis = voci.map(function (v) { return salva('listino', { descrizione: v[0], um: v[1], prezzo: v[2], esempio: true }); });

  // La contabilità del primo cantiere: quattro righe, una senza prezzo (gialla)
  const righe = [
    { descrizione: 'Scavo di sbancamento con mezzi meccanici', quantita: 120, um: 'm³', prezzo: 8.50, dallistino: lis[0].codice },
    { descrizione: 'Calcestruzzo C25/30 per fondazioni', quantita: 45, um: 'm³', prezzo: 145, dallistino: lis[2].codice },
    { descrizione: 'Acciaio B450C per armature', quantita: 3800, um: 'kg', prezzo: 1.85, dallistino: lis[3].codice },
    { descrizione: 'Rimozione tettoia in lamiera', quantita: 1, um: 'corpo', prezzo: 0, dallistino: null }
  ].map(function (r) {
    r.codice = codiceNuovo('VOCE');
    r.importo = Math.round(r.quantita * r.prezzo * 100) / 100;
    r.dacompletare = !(r.prezzo > 0);
    return r;
  });
  salva('contabilita', { cantiere: c1.codice, note: 'Prezzi dal listino 2026. La tettoia va quotata a parte.', righe: righe, esempio: true });

  leggiTutto().soloEsempio = true;
  persisti();
}

function buttaDatiEsempio() {
  const db = leggiTutto();
  Object.keys(COLLEZIONI).forEach(function (tipo) {
    valori(db[COLLEZIONI[tipo]]).forEach(function (o) { if (o.esempio) cancella(tipo, o.id); });
  });
  db.soloEsempio = false;
  persisti();
}

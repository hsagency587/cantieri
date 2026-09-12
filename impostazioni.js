/* CANTIERI — impostazioni.js: impostazioni, chiavi, modo sviluppatore, diagnostica */
'use strict';

/* I due colori dell'app. Il primario è quello del lavoro fatto e delle azioni,
   il secondario è quello del materiale da consultare. Si cambiano dalle
   impostazioni: qui c'è la tavolozza, tutte tinte che si leggono sul fondo scuro. */
const TINTE = [
  { id: 'corallo',   nome: 'Corallo',   val: '#ff6b6b' },
  { id: 'mattone',   nome: 'Mattone',   val: '#f4633a' },
  { id: 'arancio',   nome: 'Arancio',   val: '#ff8a3d' },
  { id: 'ambra',     nome: 'Ambra',     val: '#e6b450' },
  { id: 'oro',       nome: 'Oro',       val: '#f5c542' },
  { id: 'giallo',    nome: 'Giallo',    val: '#ffe066' },
  { id: 'lime',      nome: 'Lime',      val: '#a3e635' },
  { id: 'mela',      nome: 'Mela',      val: '#7fe36a' },
  { id: 'verde',     nome: 'Verde',     val: '#3ddc84' },
  { id: 'smeraldo',  nome: 'Smeraldo',  val: '#34d399' },
  { id: 'petrolio',  nome: 'Petrolio',  val: '#2dd4bf' },
  { id: 'acqua',     nome: 'Acqua',     val: '#22d3ee' },
  { id: 'azzurro',   nome: 'Azzurro',   val: '#38bdf8' },
  { id: 'celeste',   nome: 'Celeste',   val: '#60a5fa' },
  { id: 'blu',       nome: 'Blu',       val: '#5b9dff' },
  { id: 'indaco',    nome: 'Indaco',    val: '#818cf8' },
  { id: 'viola',     nome: 'Viola',     val: '#a98bfa' },
  { id: 'lavanda',   nome: 'Lavanda',   val: '#c4b5fd' },
  { id: 'magenta',   nome: 'Magenta',   val: '#e879f9' },
  { id: 'rosa',      nome: 'Rosa',      val: '#f97fb5' },
  { id: 'ciclamino', nome: 'Ciclamino', val: '#fb7185' },
  { id: 'sabbia',    nome: 'Sabbia',    val: '#d9c2a3' },
  { id: 'perla',     nome: 'Perla',     val: '#d6dbe3' },
  { id: 'bianco',    nome: 'Bianco',    val: '#f2f0ec' }
];
/* Un colore può venire dalla tavolozza (un nome) o dalla ruota (un #rrggbb
   scelto a mano). Le due cose passano dalla stessa porta. */
function tinta(id) {
  if (typeof id === 'string' && /^#[0-9a-fA-F]{6}$/.test(id)) return { id: id, nome: 'Tuo', val: id.toLowerCase() };
  return TINTE.find(function (t) { return t.id === id; }) || null;
}

/* Scrive i due colori scelti sulle variabili del foglio di stile. Tutto il
   resto dell'app usa quelle variabili, quindi cambia da solo. */
function applicaColori() {
  const c = (leggiLocale().colori) || {};
  const r = document.documentElement;
  const p = tinta(c.primario), sec = tinta(c.secondario);
  if (p) r.style.setProperty('--accent', p.val); else r.style.removeProperty('--accent');
  if (sec) r.style.setProperty('--azione', sec.val); else r.style.removeProperty('--azione');
}

const SPAZIO = { usato: 0, quota: 0, audioByte: 0, audioN: 0, fotoByte: 0, fotoN: 0, pdfByte: 0, pdfN: 0, mesi: {}, vecchi: 0, fotoVecchie: 0, avviso: false, orfani: [] };

async function misuraSpazio() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const e = await navigator.storage.estimate();
      SPAZIO.usato = e.usage || 0; SPAZIO.quota = e.quota || 0;
    }
  } catch (e) { /* non tutti i browser lo dicono */ }
  const elenco = await elencaMedia();
  const perId = {};
  valori(leggiTutto().sopralluoghi).forEach(function (s) {
    s.pezzi.forEach(function (p) { if (p.audio) perId[p.audio.replace(/^idb:/, '')] = { sop: s, pezzo: p }; });
    // Le foto, e l'audio di un referto non ancora trascritto: non sono orfani, hanno un documento.
    fotoDi(s).forEach(function (f) {
      if (f.file) perId[f.file.replace(/^idb:/, '')] = { sop: s, foto: f };
      if (f.audio) perId[f.audio.replace(/^idb:/, '')] = { sop: s, pezzo: { scaricato: null } };
    });
  });
  // I PDF archiviati hanno un padrone anche loro: senza questo finirebbero fra gli orfani da buttare.
  const perPdf = {};
  pdfArchiviati().forEach(function (p) { if (p.file) perPdf[p.file.replace(/^idb:/, '')] = p; });
  // Logo e firma delle aziende: hanno un padrone anche loro, e non si buttano.
  valori(leggiTutto().aziende).forEach(function (a) {
    ['logo', 'firma', 'banda', 'bandaPiede'].forEach(function (k) {
      if (a[k]) perPdf[a[k].replace(/^idb:/, '')] = a;
    });
  });
  const limite = giorniFa(GIORNI_AUDIO);
  SPAZIO.audioByte = 0; SPAZIO.audioN = 0; SPAZIO.fotoByte = 0; SPAZIO.fotoN = 0; SPAZIO.pdfByte = 0; SPAZIO.pdfN = 0; SPAZIO.mesi = {}; SPAZIO.vecchi = 0; SPAZIO.fotoVecchie = 0; SPAZIO.orfani = [];
  elenco.forEach(function (m) {
    if (perPdf[m.id]) { SPAZIO.pdfByte += m.peso || 0; SPAZIO.pdfN += 1; return; }
    const rif = perId[m.id];
    // Un audio senza documento (una nota già trascritta, un pezzo di un sopralluogo cancellato) è solo peso morto.
    if (!rif) { SPAZIO.orfani.push(m.id); return; }
    const mese = rif.sop.giorno.slice(0, 7);
    const voce = SPAZIO.mesi[mese] || (SPAZIO.mesi[mese] = { byte: 0, n: 0, scaricati: 0, foto: { byte: 0, n: 0, scaricati: 0 } });
    if (rif.foto) {
      voce.foto.byte += m.peso || 0; voce.foto.n += 1;
      if (rif.foto.scaricato) voce.foto.scaricati += 1;
      SPAZIO.fotoByte += m.peso || 0; SPAZIO.fotoN += 1;
      if (rif.sop.giorno < limite) SPAZIO.fotoVecchie += 1;
      return;
    }
    voce.byte += m.peso || 0; voce.n += 1;
    if (rif.pezzo.scaricato) voce.scaricati += 1;
    SPAZIO.audioByte += m.peso || 0; SPAZIO.audioN += 1;
    if (rif.sop.giorno < limite) SPAZIO.vecchi += 1;
  });
  SPAZIO.avviso = SPAZIO.quota > 0 && (SPAZIO.usato / SPAZIO.quota) > SOGLIA_SPAZIO;
  return SPAZIO;
}

/* Le impostazioni: quello che l'utente cambia davvero. La roba tecnica —
   chiavi, coda, spazio, copia su GitHub — resta nel modo tecnico, che da qui
   si raggiunge con una riga. */
function vistaImpostazioni() {
  const c = (leggiLocale().colori) || {};
  let html = testata({ indietro: '#/', titolo: 'Impostazioni' });
  const voce = function (dove, nome, sotto) {
    return '<button class="riga" data-az="vai" data-a="#/impostazioni/' + dove + '">' +
      '<span class="desc">' + h(nome) + '<small>' + h(sotto) + '</small></span><span class="frec">›</span></button>';
  };
  html += '<div class="card">' +
    voce('aspetto', 'Aspetto', (tinta(c.primario) || tinta('verde')).nome + ' e ' + (tinta(c.secondario) || tinta('azzurro')).nome) +
    voce('archivio', 'Archivio', 'aziende, cantieri, verbali') +
    '<button class="riga" data-az="vai" data-a="#/dev"><span class="desc">Modo tecnico<small>chiavi, coda, spazio, copia su GitHub</small></span><span class="frec">›</span></button>' +
    '</div>';
  return html;
}

function vistaImpostazioniAspetto() {
  const c = (leggiLocale().colori) || {};
  const blocco = function (quale, sceltoId, difetto, titolo, spiega) {
    const ora = tinta(sceltoId) || tinta(difetto);
    const suMisura = /^#/.test(String(sceltoId || ''));
    /* Una riga sola che scorre di lato, come la striscia delle foto. Il primo
       posto è del pennello: si vede subito che il colore te lo puoi fare tu. */
    return '<div class="card"><div class="card-capo">' + h(titolo) + '<span class="dx">' + h(ora.nome) + '</span></div>' +
      '<div class="tinte">' +
      '<span class="pennello-box' + (suMisura ? ' scelta' : '') + '">' +
      '<input type="color" class="pennello" value="' + h(ora.val) + '" data-campo="colore-libero" data-quale="' + quale + '" aria-label="Fatti il colore che vuoi" title="Fatti il colore che vuoi">' +
      '</span>' +
      TINTE.map(function (t) {
        const scelto = !suMisura && (sceltoId ? t.id === sceltoId : t.id === difetto);
        return '<button class="tinta' + (scelto ? ' scelta' : '') + '" data-az="colore" data-quale="' + quale + '" data-tinta="' + t.id + '"' +
          ' style="--tinta:' + t.val + '" aria-label="' + h(t.nome) + '" title="' + h(t.nome) + '"></button>';
      }).join('') + '</div>' +
      '<div class="card-piede"><span style="flex:1">' + h(spiega) + '</span>' +
      '<button class="link" data-az="colore" data-quale="' + quale + '" data-tinta="' + difetto + '">torna a ' + h(tinta(difetto).nome.toLowerCase()) + '</button></div>' +
      '</div>';
  };
  let html = testata({ indietro: '#/impostazioni', titolo: 'Aspetto' });
  html += blocco('primario', c.primario, 'verde', 'Colore principale', 'Il lavoro fatto, i tasti, i totali.');
  html += blocco('secondario', c.secondario, 'azzurro', 'Colore secondario', 'Quello che si apre e si consulta.');
  return html;
}

function vistaImpostazioniArchivio() {
  const db = leggiTutto();
  const az = valori(db.aziende || {});
  const cant = valori(db.cantieri).sort(function (a, b) { return a.nome.localeCompare(b.nome); });
  const verb = valori(db.verbali).sort(function (a, b) { return (b.giorno + b.ora).localeCompare(a.giorno + a.ora); });
  const pdf = pdfArchiviati().sort(function (a, b) { return String(b.quando).localeCompare(String(a.quando)); });
  let html = testata({ indietro: '#/impostazioni', titolo: 'Archivio' });

  html += tendina('arc-aziende', 'Aziende', '<div class="card">' + (az.length ? az.map(function (a) {
    return '<button class="riga" data-az="vai" data-a="#/azienda/' + h(a.id) + '">' +
      '<span class="desc">' + h(a.nome) + '<small>' + cantieriDiAzienda(a.codice).length + ' cantieri</small></span>' +
      '<span class="frec">›</span></button>';
  }).join('') : '<div class="card-corpo">Nessuna azienda.</div>') + '</div>', az.length);

  html += tendina('arc-cantieri', 'Cantieri', '<div class="card">' + (cant.length ? cant.map(function (c) {
    return '<button class="riga" data-az="vai" data-a="#/cantiere/' + h(c.id) + '">' +
      '<span class="desc">' + h(c.nome) + '<small>' + h(c.committente || 'senza committente') + (c.stato === 'chiuso' ? ' · chiuso' : '') + '</small></span>' +
      '<span class="frec">›</span></button>';
  }).join('') : '<div class="card-corpo">Nessun cantiere.</div>') + '</div>', cant.length);

  html += tendina('arc-verbali', 'Verbali', '<div class="card">' + (verb.length ? verb.map(function (v) {
    const sop = valori(db.sopralluoghi).find(function (z) { return z.codice === v.sopralluogo; });
    const c = cantierePerCodice(v.cantiere);
    return '<button class="riga"' + (sop ? ' data-az="vai" data-a="#/giorno/' + h(sop.id) + '"' : '') + '>' +
      '<span class="desc">' + h(titoloVerbale(v, true)) + '<small>' + h(giornoMese(v.giorno)) + ' · ' + h(c ? c.nome : '') + '</small></span>' +
      (sop ? '<span class="frec">›</span>' : '') + '</button>';
  }).join('') : '<div class="card-corpo">Nessun verbale.</div>') + '</div>', verb.length);

  html += tendina('arc-pdf', 'PDF archiviati', '<div class="card">' + (pdf.length ? pdf.map(function (p) {
    return '<div class="riga-pdf"><button class="n" data-az="pdf-apri" data-id="' + h(p.id) + '">' +
      '<span class="t">' + h(p.nome || 'documento.pdf') + '</span>' +
      '<span class="s">' + h(p.giorno ? giornoMese(p.giorno) : '') + (p.peso ? ' · ' + h(pesoFile(p.peso)) : '') + '</span></button>' +
      '<button class="pill cod" data-az="pdf-manda" data-id="' + h(p.id) + '">manda</button></div>';
  }).join('') : '<div class="card-corpo">Nessun PDF archiviato.</div>') + '</div>', pdf.length);

  return html;
}

function vistaDev() {
  if (!devSbloccato) {
    return testata({ indietro: '#/', titolo: 'Modo sviluppatore', sotto: 'serve il PIN' }) +
      '<div class="modulo"><input class="campo pin" id="pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="····" autofocus>' +
      '<button class="btn btn-ok" data-az="pin-verifica" style="margin-top:12px">Entra</button></div>';
  }
  const loc = leggiLocale();
  const mese = oggiISO().slice(0, 7);
  const c = loc.consumi[mese] || { ingresso: 0, uscita: 0, cacheLettura: 0, cacheScrittura: 0, chiamate: 0 };
  const percento = SPAZIO.quota ? Math.round(SPAZIO.usato / SPAZIO.quota * 100) : null;
  const statoChiave = function (k) { return k ? '<span class="pill ok">impostata</span>' : '<span class="pill att">mancante</span>'; };
  let html = testata({ indietro: '#/', titolo: 'Modo sviluppatore', sotto: 'versione ' + VERSIONE_APP + ' · ' + (navigator.onLine ? 'in rete' : 'senza rete') });
  html += '<div class="dev">';
  // Le chiavi: si scrivono, non si rileggono mai in chiaro.
  html += '<div class="card"><div class="card-capo">Chiavi dei servizi</div><div class="card-in">' +
    '<label class="eticampo">Chiave Groq (gsk_…) ' + statoChiave(loc.chiavi.groq) + '</label><input class="campo" id="k-groq" type="password" autocomplete="off" placeholder="' + (loc.chiavi.groq ? 'lascia vuoto per non cambiarla' : 'incolla qui') + '">' +
    '<label class="eticampo">Chiave Anthropic (sk-ant-…) ' + statoChiave(loc.chiavi.anthropic) + '</label><input class="campo" id="k-anthropic" type="password" autocomplete="off" placeholder="' + (loc.chiavi.anthropic ? 'lascia vuoto per non cambiarla' : 'incolla qui') + '">' +
    '<label class="eticampo">Token GitHub (github_pat_…) ' + statoChiave(loc.chiavi.github) + '</label><input class="campo" id="k-github" type="password" autocomplete="off" placeholder="' + (loc.chiavi.github ? 'lascia vuoto per non cambiarlo' : 'incolla qui') + '">' +
    '<label class="eticampo">Repository GitHub (utente/nome)</label><input class="campo" id="k-repo" autocomplete="off" value="' + h(loc.repo || '') + '" placeholder="' + h(repoGitHub() || 'tuonome/cantieri') + '">' +
    '<label class="eticampo">Modello per il riordino</label><input class="campo" id="k-modello" autocomplete="off" value="' + h(loc.modello || MODELLO) + '">' +
    '<label class="eticampo">Mail dove mandare la settimana</label><input class="campo" id="k-mail" type="email" autocomplete="off" value="' + h(loc.mail || '') + '" placeholder="nome@esempio.it">' +
    '<label class="eticampo">Prima schermata</label><select class="campo" id="k-salta"><option value=""' + (loc.saltaAziende ? '' : ' selected') + '>le aziende</option><option value="1"' + (loc.saltaAziende ? ' selected' : '') + '>i cantieri, salta le aziende</option></select>' +
    '<button class="btn btn-ok" data-az="chiavi-salva" style="margin-top:16px">Salva le chiavi</button>' +
    '<button class="btn btn-rosso medio" data-az="chiavi-cancella" style="margin-top:8px">Cancella tutte le chiavi</button></div></div>';
  // La coda
  const coda = loc.coda;
  html += '<div class="card"><div class="card-capo' + (coda.length ? '' : ' spenta') + '">Coda<span class="dx">' + coda.length + ' lavori</span></div>' +
    (coda.length ? coda.map(function (l) {
      const cls = l.stato === 'fallito' ? 'err' : (l.stato === 'in_corso' ? 'ok' : 'att');
      return '<div class="coda-riga"><span>' + h(descriviLavoro(l)) + (l.errore ? '<br><small style="color:var(--muted)">' + h(l.errore) + ' · tentativi ' + (l.tentativi || 0) + '</small>' : '') + '</span><span class="stato ' + cls + '">' + h(l.stato.replace('_', ' ')) + '</span></div>';
    }).join('') : '<div class="card-corpo" style="color:var(--muted)">Vuota: niente in attesa.</div>') +
    '<div class="griglia"><button class="btn" data-az="coda-riprova">Riprova i falliti</button><button class="btn btn-rosso" data-az="coda-svuota">Svuota la coda</button></div></div>';
  // Consumi
  html += '<div class="card"><div class="card-capo">Consumi di ' + h(titoloMese(mese + '-01')) + '</div><div class="card-corpo">' +
    'Token in ingresso: ' + h(numeroIt(c.ingresso, 0)) + '\nToken in uscita: ' + h(numeroIt(c.uscita, 0)) +
    '\nLetti dalla cache: ' + h(numeroIt(c.cacheLettura, 0)) + ' · scritti in cache: ' + h(numeroIt(c.cacheScrittura, 0)) +
    '\nChiamate: ' + c.chiamate + '\nSpesa stimata: ' + spesaStimata(c).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' $</div>' +
    '<div class="card-piede">Ultima chiamata: ' + (loc.ultimaCache ? h(numeroIt(loc.ultimaCache.letti, 0)) + ' token letti dalla cache' + (loc.ultimaCache.letti > 0 ? ' ✓' : (loc.ultimaCache.scritti > 0 ? ' (scritti ' + h(numeroIt(loc.ultimaCache.scritti, 0)) + ')' : ' — la cache non ha lavorato')) : 'nessuna ancora') + '</div></div>';
  // Spazio
  html += '<div class="card' + (SPAZIO.avviso ? ' attenzione' : '') + '"><div class="card-capo">Spazio</div><div class="card-corpo">' +
    (SPAZIO.quota ? 'Occupato: ' + h(megabyte(SPAZIO.usato)) + ' su ' + h(megabyte(SPAZIO.quota)) + ' (' + percento + '%)' : 'Occupato: il telefono non lo dice') +
    '\nAudio nel telefono: ' + SPAZIO.audioN + ' (' + h(megabyte(SPAZIO.audioByte)) + ')' +
    '\nFoto nel telefono: ' + SPAZIO.fotoN + ' (' + h(megabyte(SPAZIO.fotoByte)) + ')' +
    (SPAZIO.vecchi ? '\nAudio più vecchi di ' + GIORNI_AUDIO + ' giorni: ' + SPAZIO.vecchi + ' — da scaricare' : '') +
    (SPAZIO.fotoVecchie ? '\nFoto più vecchie di ' + GIORNI_AUDIO + ' giorni: ' + SPAZIO.fotoVecchie + ' — da scaricare' : '') +
    (SPAZIO.avviso ? '\nSpazio quasi pieno: scarica audio e foto vecchi e libera.' : '') + '</div>';
  const mesi = Object.keys(SPAZIO.mesi).sort();
  mesi.forEach(function (m) {
    const v = SPAZIO.mesi[m];
    const nomeMese = h(MESI[parseInt(m.slice(5), 10) - 1]);
    const contoScaricati = function (x) { return x.scaricati >= x.n ? ' · scaricati' : (x.scaricati ? ' · ' + x.scaricati + ' scaricati' : ''); };
    // Prima si porta fuori tutto, audio e foto, poi si libera: il tasto rosso si accende solo allora.
    const tuttiScaricati = v.scaricati >= v.n && v.foto.scaricati >= v.foto.n;
    html += '<div class="card-piede" style="flex-wrap:wrap;gap:8px"><span style="flex:1 1 100%">' + h(titoloMese(m + '-01')) + ': ' +
      (v.n ? v.n + ' audio, ' + h(megabyte(v.byte)) + contoScaricati(v) : 'nessun audio') + '<br>' +
      (v.foto.n ? v.foto.n + ' foto, ' + h(megabyte(v.foto.byte)) + contoScaricati(v.foto) : 'nessuna foto') + '</span>' +
      (v.n ? '<button class="btn medio" style="flex:1 1 100%" data-az="spazio-scarica" data-mese="' + m + '">Scarica gli audio di ' + nomeMese + '</button>' : '') +
      (v.foto.n ? '<button class="btn medio" style="flex:1 1 100%" data-az="spazio-scarica-foto" data-mese="' + m + '">Scarica le foto di ' + nomeMese + '</button>' : '') +
      '<button class="btn medio btn-rosso" style="flex:1 1 100%" data-az="spazio-libera" data-mese="' + m + '"' + (tuttiScaricati ? '' : ' disabled') + '>Libera spazio</button></div>';
  });
  if (SPAZIO.orfani.length) html += '<div class="card-piede"><span style="flex:1">' + SPAZIO.orfani.length + ' audio senza documento</span><button class="btn medio" data-az="spazio-orfani">Pulisci</button></div>';
  html += '</div>';
  // GitHub
  const g = loc.github;
  html += '<div class="card"><div class="card-capo' + (githubPronto() ? '' : ' spenta') + '">Copia su GitHub</div><div class="card-corpo">' +
    (githubPronto() ? 'Repository: ' + h(repoGitHub()) + ', ramo dati' : 'Non configurata: servono token e repository.') +
    '\nUltimo invio: ' + (g.ultimoInvio ? h(new Date(g.ultimoInvio).toLocaleString('it-IT')) : 'mai') +
    (g.daMandare ? '\nCi sono modifiche da mandare.' : '') + (g.errore ? '\nErrore: ' + h(g.errore) : '') + '</div>' +
    '<div class="griglia"><button class="btn" data-az="github-manda">Manda adesso</button><button class="btn" data-az="github-scarica">Scarica da GitHub</button></div></div>';
  // Dati di esempio
  const nEsempio = Object.keys(COLLEZIONI).reduce(function (n, t) { return n + valori(leggiTutto()[COLLEZIONI[t]]).filter(function (o) { return o.esempio; }).length; }, 0);
  html += '<div class="card"><div class="card-capo' + (nEsempio ? '' : ' spenta') + '">Dati di esempio<span class="dx">' + nEsempio + ' documenti</span></div>' +
    '<div class="griglia"><button class="btn btn-rosso" data-az="esempio-butta"' + (nEsempio ? '' : ' disabled') + '>Butta via gli esempi</button><button class="btn" data-az="esempio-rimetti">Rimetti gli esempi</button></div></div>';
  html += '<div class="card"><div class="card-capo spenta">Notifiche</div><div class="card-corpo">' + ('Notification' in window ? 'Permesso: ' + h(Notification.permission) : 'Non disponibili su questo browser') + '\nPromemoria delle 18: ' + (loc.promemoriaGiorno === oggiISO() ? 'già mandato oggi' : 'non ancora oggi') + '</div>' +
    '<div class="griglia"><button class="btn" data-az="notifiche-chiedi">Chiedi il permesso</button><button class="btn" data-az="notifiche-prova">Prova una notifica</button></div></div>';
  html += '<div class="modulo"><button class="btn" data-az="dev-esci">Esci dal modo sviluppatore</button></div>';
  html += '</div>';
  return html;
}

async function scaricaAudioMese(mese) {
  const file = [];
  const pezziDelMese = [];
  for (const s of valori(leggiTutto().sopralluoghi)) {
    if (s.giorno.slice(0, 7) !== mese) continue;
    for (const p of s.pezzi) {
      if (!p.audio) continue;
      const blob = await leggiMedia(p.audio);
      if (!blob) continue;
      const nome = s.codice + '_' + s.giorno + '_' + p.ora.replace(':', '-') + '_' + nomeFile(p.titolo || 'registrazione') + '.' + estensioneAudio(blob.type);
      file.push(new File([blob], nome, { type: blob.type || 'audio/mp4' }));
      pezziDelMese.push({ sop: s, pezzo: p });
    }
  }
  if (!file.length) { avvisa('Niente da scaricare', 'att'); return; }
  if (!(await portaFuori(file, 'Audio CANTIERI ' + mese))) return;
  const adesso = adessoISO();
  const toccati = new Set();
  pezziDelMese.forEach(function (x) { x.pezzo.scaricato = adesso; toccati.add(x.sop); });
  toccati.forEach(function (s) { salva('sopralluogo', s); });
  avvisa('Scaricati', 'ok');
  await misuraSpazio();
  aggiornaVista();
}

/* I file escono dal telefono con il tasto di condivisione dell'iPhone (i File, iCloud).
   Torna vero se sono usciti, falso se l'uomo ha annullato: serve ad audio e foto allo stesso modo. */
async function portaFuori(file, titolo) {
  if (navigator.share && navigator.canShare && navigator.canShare({ files: file })) {
    try { await navigator.share({ files: file, title: titolo }); return true; }
    catch (e) { if (e && e.name === 'AbortError') { avvisa('Annullato', 'att'); return false; } }
  }
  // Senza condivisione (un computer): si scaricano uno per uno.
  for (const f of file) {
    const url = URL.createObjectURL(f);
    const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    await attendi(300);
    URL.revokeObjectURL(url);
  }
  return true;
}

// Come per gli audio: le foto di un mese escono tutte insieme, col nome che dice giorno, ora, codice e referto.
async function scaricaFotoMese(mese) {
  const file = [];
  const fotoDelMese = [];
  for (const s of valori(leggiTutto().sopralluoghi)) {
    if (s.giorno.slice(0, 7) !== mese) continue;
    for (const f of fotoDi(s)) {
      if (!f.file) continue;
      const blob = await leggiMedia(f.file);
      if (!blob) continue;
      const referto = primaRiga(f.referto);
      const nome = s.codice + '_' + f.giorno + '_' + String(f.ora || '').replace(':', '-') + '_' + f.codice + (referto ? '_' + nomeFile(referto) : '') + estensioneMedia(f);
      file.push(new File([blob], nome, { type: tipoMedia(f, blob) }));
      fotoDelMese.push({ sop: s, foto: f });
    }
  }
  if (!file.length) { avvisa('Niente da scaricare', 'att'); return; }
  if (!(await portaFuori(file, 'Foto CANTIERI ' + mese))) return;
  const adesso = adessoISO();
  const toccati = new Set();
  fotoDelMese.forEach(function (x) { x.foto.scaricato = adesso; toccati.add(x.sop); });
  toccati.forEach(function (s) { salva('sopralluogo', s); });
  avvisa('Scaricate', 'ok');
  await misuraSpazio();
  aggiornaVista();
}

// Cancella solo dopo che lo scaricamento è andato a buon fine, e solo i file: testo, referti e nomi restano per sempre.
async function liberaSpazioMese(mese) {
  const ok = await chiedi('Liberare lo spazio?', 'Gli audio e le foto di ' + titoloMese(mese + '-01') + ' si cancellano dal telefono. Il testo trascritto, i referti e i nomi restano.', 'Libera spazio', 'rosso');
  chiudiFoglio();
  if (!ok) return;
  const oggi = oggiISO();
  for (const s of valori(leggiTutto().sopralluoghi)) {
    if (s.giorno.slice(0, 7) !== mese) continue;
    let toccato = false;
    for (const p of s.pezzi) {
      if (!p.audio || !p.scaricato) continue;
      await cancellaMedia(p.audio);
      p.audio = null; p.archiviato = oggi; toccato = true;
    }
    for (const f of fotoDi(s)) {
      if (!f.file || !f.scaricato) continue;
      scordaFoto(f.file);
      await cancellaMedia(f.file);
      f.file = null; f.archiviato = oggi; toccato = true;
    }
    if (toccato) salva('sopralluogo', s);
  }
  avvisa('Spazio liberato', 'ok');
  await misuraSpazio();
  aggiornaVista();
}

// Le azioni di questo file.
Object.assign(AZIONI, {
  'colore': function (el) {
    const loc = leggiLocale();
    if (!loc.colori) loc.colori = { primario: '', secondario: '' };
    loc.colori[el.dataset.quale] = el.dataset.tinta;
    salvaLocale();
    applicaColori();
    disegna();
  },
  // --- modo sviluppatore ---
  'pin-verifica': function () {
    const v = (document.getElementById('pin').value || '').trim();
    if (v === PIN) { devSbloccato = true; misuraSpazio().then(aggiornaVista); aggiornaVista(); }
    else { avvisa('PIN sbagliato', 'err'); document.getElementById('pin').value = ''; }
  },
  'dev-esci': function () { devSbloccato = false; vai('#/'); },
  'chiavi-salva': function () {
    const loc = leggiLocale();
    const g = document.getElementById('k-groq').value.trim(), a = document.getElementById('k-anthropic').value.trim(), gh = document.getElementById('k-github').value.trim();
    if (g) loc.chiavi.groq = g;
    if (a) loc.chiavi.anthropic = a;
    if (gh) loc.chiavi.github = gh;
    loc.repo = document.getElementById('k-repo').value.trim();
    loc.modello = document.getElementById('k-modello').value.trim() || MODELLO;
    loc.mail = document.getElementById('k-mail').value.trim();
    loc.saltaAziende = !!document.getElementById('k-salta').value;
    salvaLocale();
    avvisa('Salvato', 'ok');
    aggiornaVista();
    elaboraCoda();
    if (loc.github.daMandare) programmaInvioGitHub();
  },
  'chiavi-cancella': async function () {
    const ok = await chiedi('Cancellare le chiavi?', 'Groq, Anthropic e GitHub: l\'app smette di trascrivere e di salvare online finché non le rimetti.', 'Cancella', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    const loc = leggiLocale();
    loc.chiavi = { groq: '', anthropic: '', github: '' };
    salvaLocale();
    avvisa('Cancellate', 'ok');
    aggiornaVista();
  },
  'coda-riprova': function () {
    const loc = leggiLocale();
    // I lavori di un pezzo passano da riprovaPezzo, così la logica sta in un posto solo; gli altri (foto, contabilità, note) si rimettono in attesa qui.
    loc.coda.filter(function (l) { return l.stato === 'fallito' || l.stato === 'in_corso'; }).forEach(function (l) {
      const s = l.pezzo ? sopralluogo(l.sop) : null;
      const p = s && s.pezzi.find(function (x) { return x.id === l.pezzo; });
      if (p) riprovaPezzo(s, p);
      else { l.stato = 'in_attesa'; l.tentativi = 0; l.prossimo = 0; l.errore = null; }
    });
    salvaLocale();
    avvisa('Riprovo', 'ok');
    aggiornaVista();
    elaboraCoda();
  },
  'coda-svuota': async function () {
    const ok = await chiedi('Svuotare la coda?', 'I lavori in attesa si perdono. Gli audio restano nel telefono e si possono rimandare riascoltandoli.', 'Svuota', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    const loc = leggiLocale();
    const ids = loc.coda.map(function (l) { return l.pezzo; }).filter(Boolean);
    loc.coda = [];
    salvaLocale();
    valori(leggiTutto().sopralluoghi).forEach(function (s) {
      let toccato = false;
      s.pezzi.forEach(function (p) { if (ids.indexOf(p.id) !== -1 && p.stato !== 'riordinato') { p.stato = 'errore'; p.errore = 'tolto dalla coda'; toccato = true; } });
      if (toccato) salva('sopralluogo', s);
    });
    avvisa('Coda vuota', 'ok');
    aggiornaVista();
  },
  'spazio-scarica': function (el) { scaricaAudioMese(el.dataset.mese); },
  'spazio-scarica-foto': function (el) { scaricaFotoMese(el.dataset.mese); },
  'spazio-libera': function (el) { liberaSpazioMese(el.dataset.mese); },
  'spazio-orfani': async function () {
    for (const id of SPAZIO.orfani) await cancellaMedia(id);
    avvisa('Puliti', 'ok');
    await misuraSpazio();
    aggiornaVista();
  },
  'github-manda': async function () {
    if (!githubPronto()) { avvisa('Manca token o repository', 'att'); return; }
    avvisa('Mando…');
    const ok = await inviaGitHub();
    avvisa(ok ? 'Mandato' : 'Non riuscito', ok ? 'ok' : 'err');
    aggiornaVista();
  },
  'github-scarica': async function () {
    if (!repoGitHub()) { avvisa('Manca il repository', 'att'); return; }
    avvisa('Scarico…');
    try { const cambiato = await scaricaGitHub(); avvisa(cambiato ? 'Aggiornato' : 'Già allineato', 'ok'); }
    catch (e) { avvisa('Non riuscito', 'err'); leggiLocale().github.errore = e.message; salvaLocale(); }
    aggiornaVista();
  },
  'esempio-butta': async function () {
    const ok = await chiedi('Buttare via gli esempi?', 'Si cancellano i cantieri, i sopralluoghi, i verbali, la contabilità e il listino di esempio. I documenti veri restano.', 'Butta via', 'rosso');
    chiudiFoglio();
    if (!ok) return;
    buttaDatiEsempio();
    avvisa('Fatto', 'ok');
    aggiornaVista();
  },
  'esempio-rimetti': function () { inserisciDatiEsempio(); avvisa('Rimessi', 'ok'); aggiornaVista(); },
  'notifiche-chiedi': async function () {
    if (!('Notification' in window)) { avvisa('Non disponibili', 'att'); return; }
    const loc = leggiLocale(); loc.notificheChieste = true; salvaLocale();
    try { await Notification.requestPermission(); } catch (e) { /* niente */ }
    aggiornaVista();
  },
  'notifiche-prova': function () { mostraNotifica('Manca il sopralluogo di CANT-000', 'È una prova.', './'); },
});

/* CANTIERI — service worker
   Il numero qui sotto va alzato a ogni rilascio: è l'unico modo per far
   buttare via al telefono la versione vecchia dei file. */
const VERSIONE = 'cantieri-f015df0';

/* Quello che serve per aprire l'app senza rete. pdf-lib sta qui perché il PDF
   deve uscire anche in cantiere, dove la linea non c'è. */
const FILE_BASE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-1024.png',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'
];

/* I servizi non si mettono mai in cache: una risposta vecchia di Groq o di
   Claude sarebbe un errore silenzioso, peggio di un errore vero. */
const NON_TOCCARE = ['api.groq.com', 'api.anthropic.com', 'api.github.com', 'raw.githubusercontent.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSIONE).then(function (cache) {
      // Un file che manca (per esempio un'icona non ancora caricata) non deve
      // impedire l'installazione: si aggiungono uno per uno e si ignora chi fallisce.
      return Promise.all(FILE_BASE.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (chiavi) {
      return Promise.all(chiavi.filter(function (k) { return k !== VERSIONE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  const richiesta = e.request;
  if (richiesta.method !== 'GET') return;
  const url = new URL(richiesta.url);
  if (NON_TOCCARE.some(function (h) { return url.hostname === h; })) return;
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  /* Network-first: si prova la rete, e se risponde si aggiorna la cache.
     Se la rete manca, si serve la copia. Per le navigazioni la copia è index.html:
     l'app è una pagina sola e le sue rotte stanno nell'hash.

     I file dell'app si chiedono con "reload": GitHub Pages dice al browser di
     tenersi la copia per dieci minuti, e senza questo, dopo una pubblicazione,
     il telefono continuava a far girare la versione di prima anche con la rete
     attaccata. Gli altri — pdf-lib, che ha il numero di versione nell'indirizzo —
     restano come sono. */
  const dallOrigine = url.origin === self.location.origin;
  const chiedi = dallOrigine
    ? fetch(url.href, { cache: 'reload', credentials: 'same-origin' })
    : fetch(richiesta);
  e.respondWith(
    chiedi.then(function (risposta) {
      if (risposta && risposta.ok && (url.origin === self.location.origin || url.hostname === 'cdnjs.cloudflare.com')) {
        const copia = risposta.clone();
        caches.open(VERSIONE).then(function (cache) { cache.put(richiesta, copia); }).catch(function () {});
      }
      return risposta;
    }).catch(function () {
      return caches.match(richiesta).then(function (incache) {
        if (incache) return incache;
        if (richiesta.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 503, statusText: 'Manca la rete' });
      });
    })
  );
});

/* Toccando la notifica della sera si apre l'app, o si porta davanti se è già aperta */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  const destinazione = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (finestre) {
      for (const f of finestre) {
        if ('focus' in f) { f.navigate(destinazione).catch(function () {}); return f.focus(); }
      }
      return self.clients.openWindow(destinazione);
    })
  );
});

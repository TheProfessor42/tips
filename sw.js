// Tip Tracker offline support (service worker).
// Keeps a copy of the app on the phone so it opens even with no signal.
// With signal, the app always loads the newest version from the internet (waiting up to 3 seconds),
// and the saved copy is only used when the internet is missing or too slow.
// VERSION must change whenever an app file changes. The test suite checks this and can stamp it.
var VERSION = "tt-892701fb";
var FILES = ["./", "index.html", "manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png"];
var WAIT = 3000;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(FILES.map(function (f) { return new Request(f, { cache: "reload" }); }));
  }).then(function () { return self.skipWaiting(); }));
});

// Clear out copies saved by older versions
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var r = e.request, u = new URL(r.url);
  // Only the app's own files. The Google Sheet backup and anything else go straight to the internet.
  if (r.method !== "GET" || u.origin !== self.location.origin) return;
  if (r.mode === "navigate") { e.respondWith(page(r)); return; }
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(function (hit) {
    var net = fetch(r).then(function (res) {
      if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(r, copy); }); }
      return res;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});

function saved() {
  return caches.open(VERSION).then(function (c) {
    return c.match("./").then(function (h) { return h || c.match("index.html"); });
  });
}

// Opening the app: newest from the internet if it answers within 3 seconds, otherwise the saved copy
function page(r) {
  return new Promise(function (done) {
    var sent = false;
    function give(res) { if (!sent && res) { sent = true; done(res); } }
    var t = setTimeout(function () { saved().then(give); }, WAIT);
    // A page-open request can't be re-used with options, so ask for the same address fresh
    fetch(r.url, { cache: "no-cache", credentials: "same-origin" }).then(function (res) {
      clearTimeout(t);
      if (res.ok) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put("./", copy); });
        give(res);
      } else saved().then(function (h) { give(h || res); });
    }).catch(function () {
      clearTimeout(t);
      saved().then(function (h) { give(h || Response.error()); });
    });
  });
}

// Service worker cleanup.
// The app previously cached /login and / with a cache-first strategy, which can
// leave employees on an old sign-in screen. PulseSurvey is an online app, so we
// unregister the service worker and clear old app-shell caches.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("pulse-survey-"))
              .map((key) => caches.delete(key))
          )
        ),
      self.registration.unregister(),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  return;
});

"use client";

import { useEffect } from "react";

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister()))
        )
        .catch(() => {
          /* ignore */
        });

      if ("caches" in window) {
        caches.keys()
          .then((keys) =>
            Promise.all(
              keys
                .filter((key) => key.startsWith("pulse-survey-"))
                .map((key) => caches.delete(key))
            )
          )
          .catch(() => {
            /* ignore */
          });
      }
    }
  }, []);
  return null;
}

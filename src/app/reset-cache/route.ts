export async function GET() {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Refreshing PulseSurvey</title>
    <style>
      body {
        align-items: center;
        background: #f8fafc;
        color: #0f172a;
        display: flex;
        font-family: Arial, sans-serif;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
      }
      main {
        max-width: 420px;
        padding: 24px;
        text-align: center;
      }
      a {
        color: #0f766e;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Refreshing PulseSurvey</h1>
      <p>Clearing the old cached version and opening the current login page.</p>
      <p><a href="/login?fresh=1">Continue to PulseSurvey</a></p>
    </main>
    <script>
      async function resetPulseSurvey() {
        try {
          if ("serviceWorker" in navigator) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map((registration) => registration.unregister()));
          }
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(
              keys
                .filter((key) => key.startsWith("pulse-survey-"))
                .map((key) => caches.delete(key))
            );
          }
        } catch (error) {
          // A normal navigation below is still enough when the old cache missed this route.
        }
        window.location.replace("/login?fresh=" + Date.now());
      }
      resetPulseSurvey();
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Clear-Site-Data": '"cache", "storage"',
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

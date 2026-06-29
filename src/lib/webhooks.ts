// Slack/Teams webhook integration for posting survey links and results

export async function sendSlackNotification(message: string, blocks?: any[]) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: "SLACK_WEBHOOK_URL not configured" };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, blocks }),
    });
    return { sent: res.ok };
  } catch (err: any) {
    return { sent: false, reason: err.message };
  }
}

export async function sendTeamsNotification(message: string) {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: "TEAMS_WEBHOOK_URL not configured" };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: "0d9488",
        title: "Employee Pulse Survey",
        text: message,
      }),
    });
    return { sent: res.ok };
  } catch (err: any) {
    return { sent: false, reason: err.message };
  }
}

export async function notifyChannels(message: string) {
  const results = await Promise.allSettled([
    sendSlackNotification(message),
    sendTeamsNotification(message),
  ]);
  return results;
}

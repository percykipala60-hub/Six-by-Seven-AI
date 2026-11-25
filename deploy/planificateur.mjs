// Service Docker indépendant du navigateur. Aucun contenu de tâche ni secret dans les logs.
const secret = process.env.SIX_CRON_SECRET;
if (!secret || secret.length < 32)
  throw new Error("Configurer SIX_CRON_SECRET (32 caractères minimum).");
while (true) {
  try {
    const res = await fetch("http://six:3000/api/travail/executer", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(600000),
    });
    if (!res.ok) console.error("Planificateur : HTTP", res.status);
  } catch {
    console.error("Planificateur : serveur indisponible");
  }
  await new Promise((resolve) => setTimeout(resolve, 30000));
}

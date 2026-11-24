let preparation: Promise<string> | undefined;
export function prepareOffline(): Promise<string> {
  return (preparation ??= (async () => {
    if (!import.meta.env.PROD)
      return "Mode développement : compilez l’application pour activer le hors ligne.";
    if (!("serviceWorker" in navigator))
      return "Installation hors ligne indisponible dans ce navigateur.";
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      return registration.waiting
        ? "Mise à jour prête : fermez tous les onglets MoneyPilot puis rouvrez l’application."
        : "Ressources hors ligne prêtes. Les données sont conservées sur cet appareil.";
    } catch (error) {
      console.warn("Installation hors ligne indisponible", error);
      return "Installation hors ligne indisponible. Essayez dans Chrome ou Safari récent.";
    }
  })());
}

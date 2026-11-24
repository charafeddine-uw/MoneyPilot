export function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Laisser le navigateur démarrer le téléchargement avant de libérer l'URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}

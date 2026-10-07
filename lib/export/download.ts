/** Saves a blob through the browser's download bar, under `filename`. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // The click has already started the download; the URL only has to outlive it.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

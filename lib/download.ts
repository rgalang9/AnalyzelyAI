// Browser only: saves a file to the user's computer.
// The link is briefly added to the page before clicking: without that (and with text files
// labelled as text), some browsers show the file in a tab instead of saving it.
export function downloadBlob(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

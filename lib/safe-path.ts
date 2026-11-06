// Keeps a "go back to" address inside this site, so a link can't send someone elsewhere
export function safePath(value: unknown, fallback = "/upload") {
  if (typeof value !== "string" || !value.startsWith("/")) return fallback;
  const url = new URL(value, "https://analyzely.local");
  return url.origin === "https://analyzely.local" ? url.pathname + url.search : fallback;
}

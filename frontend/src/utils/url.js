const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeExternalUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed || /[\u0000-\u001F\u007F\s]/.test(trimmed)) return "";

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(candidate);
    if (!HTTP_PROTOCOLS.has(url.protocol)) return "";
    if (!url.hostname) return "";
    return url.href;
  } catch {
    return "";
  }
}

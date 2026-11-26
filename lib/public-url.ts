export function getPublicOrigin(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const url = new URL(request.url);

  if (
    url.hostname === "0.0.0.0" ||
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1"
  ) {
    const host = request.headers.get("host");
    if (host) {
      return `https://${host}`;
    }
  }

  return url.origin;
}


/** Installer downloads must use the externally reachable deployment, never the bind address. */
export function getInstallerOrigin(request: Request): string | null {
  try {
    const url = new URL(getPublicOrigin(request));
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    // Restrict shell interpolation to a canonical DNS hostname and optional port.
    if (url.username || url.password || !/^[a-z0-9.-]+$/i.test(url.hostname)) return null;
    if (url.hostname === "0.0.0.0" || (!local && (/^\d+(?:\.\d+){3}$/.test(url.hostname) || !url.hostname.includes(".")))) return null;
    if (url.protocol !== "https:" && !(local && url.protocol === "http:")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

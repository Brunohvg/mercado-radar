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

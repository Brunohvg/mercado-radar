export function isExtensionAuthorized(request: Request) {
  const configured = process.env.RADAR_EXTENSION_API_KEY?.trim();

  if (!configured) {
    return process.env.NODE_ENV !== "production";
  }

  const authorization = request.headers.get("authorization") ?? "";
  const apiKey = request.headers.get("x-radar-extension-key") ?? "";

  if (authorization.startsWith("Bearer ")) {
    return authorization.slice(7).trim() === configured;
  }

  return apiKey === configured;
}

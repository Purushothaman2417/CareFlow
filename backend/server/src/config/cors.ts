const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function isAllowedClientOrigin(
  origin: string | undefined,
  configuredOrigins: string[],
): boolean {
  if (!origin) return true;
  if (configuredOrigins.includes(origin)) return true;

  try {
    const parsedOrigin = new URL(origin);
    return (
      (parsedOrigin.protocol === "http:" || parsedOrigin.protocol === "https:") &&
      LOCAL_DEVELOPMENT_HOSTS.has(parsedOrigin.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

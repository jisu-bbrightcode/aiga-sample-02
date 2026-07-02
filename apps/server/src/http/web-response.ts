import type { Response } from "express";

/**
 * Pipe a Web (Fetch API) `Response` — as returned by better-auth's server API
 * with `asResponse: true` — back through an Express response, preserving status,
 * headers, and (critically) `Set-Cookie` for session establishment.
 */
export async function sendWebResponse(
  res: Response,
  webResponse: globalThis.Response,
): Promise<void> {
  res.status(webResponse.status);

  webResponse.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return; // handled below
    res.setHeader(key, value);
  });

  const setCookies = webResponse.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    res.setHeader("set-cookie", setCookies);
  }

  const body = await webResponse.text();
  res.send(body.length > 0 ? body : undefined);
}

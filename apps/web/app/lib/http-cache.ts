export const PRIVATE_NO_STORE = "private, no-store";

export function noStoreHeaders(headers?: HeadersInit): Headers {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("Cache-Control", PRIVATE_NO_STORE);
  return nextHeaders;
}

export function jsonNoStoreResponse(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, {
    ...init,
    headers: noStoreHeaders(init.headers)
  });
}

export function noStoreResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: noStoreHeaders(init.headers)
  });
}

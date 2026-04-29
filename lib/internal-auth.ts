import { NextRequest } from "next/server";

/**
 * Verifica se a request vem do n8n com a API key correta.
 * Usa o header X-N8N-API-Key.
 */
export function isValidInternalRequest(req: NextRequest): boolean {
  const key = req.headers.get("x-n8n-api-key");
  const expected = process.env.N8N_API_KEY;

  if (!expected) {
    console.warn("[internal-auth] N8N_API_KEY não configurada");
    return false;
  }

  return key === expected;
}

export function unauthorizedResponse() {
  return Response.json({ error: "Não autorizado" }, { status: 401 });
}

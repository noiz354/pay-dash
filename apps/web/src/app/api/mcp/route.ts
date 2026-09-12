import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authorizeMcpRequest, resolveMcpOrganization } from "@/server/mcp/auth";
import { buildMcpServer } from "@/server/mcp/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const auth = await authorizeMcpRequest(request);
  if (!auth.ok) {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32001, message: auth.reason } },
      { status: auth.status }
    );
  }

  // Wave 7A: bind the server instance to the request's tenant *before* any tool
  // can run. One bearer token across tenants is why this has to be per request.
  const organization = await resolveMcpOrganization(request);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildMcpServer(undefined, organization);
  await server.connect(transport);

  try {
    return await transport.handleRequest(request);
  } catch {
    return Response.json(
      { jsonrpc: "2.0", error: { code: -32000, message: "MCP request failed." } },
      { status: 500 }
    );
  }
}
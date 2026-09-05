import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { authorizeMcpRequest } from "@/server/mcp/auth";
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

  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = buildMcpServer();
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
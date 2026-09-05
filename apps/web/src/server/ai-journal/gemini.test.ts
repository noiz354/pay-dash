import { afterEach, describe, expect, it, vi } from "vitest";
import { generateJournalReply } from "./gemini";
import { executeXenditReadTool } from "./xendit-read";

vi.mock("./secrets", () => ({
  getGeminiApiKey: async () => "test-key",
}));

vi.mock("./xendit-read", () => ({
  XENDIT_READ_FUNCTIONS: [
    { name: "xendit_get_balance", parameters: { type: "object", properties: {} } },
    { name: "xendit_list_transactions", parameters: { type: "object", properties: { limit: { type: "integer" } } } },
  ],
  executeXenditReadTool: vi.fn(async () => ({ ok: true, data: { available: 100, currency: "IDR", source: "xendit-live" } })),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const fetchMock = vi.fn();

function installFetchSequence(bodies: Array<Record<string, unknown>>) {
  fetchMock.mockReset();
  bodies.forEach((body) => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => body } as unknown as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
}

describe("generateJournalReply (function calling)", () => {
  it("executes a read tool and returns the final text", async () => {
    installFetchSequence([
      { candidates: [{ content: { parts: [{ functionCall: { name: "xendit_get_balance", args: {} } }] } }] },
      { candidates: [{ content: { parts: [{ text: "Saldo kamu Rp 100." }] } }] },
    ]);

    const result = await generateJournalReply({ mode: "journal", messages: [{ role: "user", text: "Berapa saldo saya?" }] });

    expect(result.text).toContain("Rp 100");
    expect(result.toolCalls).toEqual(["xendit_get_balance"]);
    expect(executeXenditReadTool).toHaveBeenCalledWith("xendit_get_balance", {});
  });

  it("sends the functionResponse back in the follow-up request", async () => {
    let secondBody: Record<string, unknown> | undefined;
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name: "xendit_get_balance", args: {} } }] } }] }) } as unknown as Response)
      .mockImplementationOnce((_url: unknown, init?: RequestInit) => {
        secondBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Promise.resolve({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }) } as unknown as Response);
      });
    vi.stubGlobal("fetch", fetchMock);

    await generateJournalReply({ mode: "journal", messages: [{ role: "user", text: "saldo?" }] });

    const contents = secondBody?.contents as Array<Record<string, unknown>>;
    const last = contents[contents.length - 1] as { parts?: Array<{ functionResponse?: { name: string; response: Record<string, unknown> } }> };
    expect(last.parts?.[0]?.functionResponse?.name).toBe("xendit_get_balance");
  });

  it("relays a tool error into the functionResponse instead of throwing", async () => {
    vi.mocked(executeXenditReadTool).mockResolvedValueOnce({ ok: false, error: "Xendit live calls are disabled in runtime settings." });
    installFetchSequence([
      { candidates: [{ content: { parts: [{ functionCall: { name: "xendit_get_balance", args: {} } }] } }] },
      { candidates: [{ content: { parts: [{ text: "Live calls mati dulu." }] } }] },
    ]);

    const result = await generateJournalReply({ mode: "journal", messages: [{ role: "user", text: "saldo?" }] });
    expect(result.text).toContain("Live calls mati");
  });
});
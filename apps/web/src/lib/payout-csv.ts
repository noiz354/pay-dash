import { isValidAccountNumber, parseAmount } from "./payout-status";

// Client-safe recipient CSV parser.
//
// The bulk-payout dropzone was decorative: no file input, no parsing, no
// validation feedback. Parsing lives here so the browser can preview and
// validate a file *before* anything is uploaded, and the Server Action can run
// the exact same parse on submit — one implementation, no drift.

export type RecipientDraft = {
  line: number;
  name: string;
  bank: string;
  accountNumber: string;
  amount: number;
  reference: string;
};

export type RecipientRejection = {
  line: number;
  raw: string;
  reason: string;
};

export type ParsedRecipients = {
  valid: RecipientDraft[];
  invalid: RecipientRejection[];
  total: number;
  totalAmount: number;
};

export const RECIPIENT_CSV_HEADERS = ["name", "bank", "account_number", "amount", "reference"] as const;

export const RECIPIENT_CSV_TEMPLATE = [
  RECIPIENT_CSV_HEADERS.join(","),
  "Budi Santoso,BCA,1234567890,250000,INV-1001",
  "Siti Rahayu,Mandiri,9876543210,1750000,INV-1002",
  "Agus Wijaya,BNI,5544332211,499500,",
].join("\n");

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map((cell) => cell.trim());
}

/**
 * Parses `name,bank,account_number,amount,reference`. A header row is optional.
 * Every rejected row is returned with its line number and a human reason so the
 * preview table can show exactly what to fix instead of failing the whole file.
 */
export function parseRecipientsCsv(text: string): ParsedRecipients {
  const lines = text.split(/\r?\n/);
  const valid: RecipientDraft[] = [];
  const invalid: RecipientRejection[] = [];
  const seen = new Set<string>();

  lines.forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;

    const cells = splitCsvLine(raw);
    const first = (cells[0] ?? "").toLowerCase();
    if (index === 0 && (first === "name" || first === "recipient")) return; // header

    const [name, bank, accountNumber, amountCell, reference] = cells;

    if (cells.length < 4) {
      invalid.push({ line, raw, reason: "Expected 4–5 columns: name, bank, account_number, amount[, reference]" });
      return;
    }
    if (!name) {
      invalid.push({ line, raw, reason: "Recipient name is empty" });
      return;
    }
    if (!bank) {
      invalid.push({ line, raw, reason: "Bank is empty" });
      return;
    }
    if (!isValidAccountNumber(accountNumber ?? "")) {
      invalid.push({ line, raw, reason: `"${accountNumber}" is not an 8–20 digit account number` });
      return;
    }
    const amount = parseAmount(amountCell ?? "");
    if (amount === null) {
      invalid.push({ line, raw, reason: `"${amountCell}" is not an amount` });
      return;
    }
    if (amount <= 0) {
      invalid.push({ line, raw, reason: "Amount must be greater than zero" });
      return;
    }

    const key = `${bank.toLowerCase()}:${accountNumber.replace(/[\s-]/g, "")}`;
    if (seen.has(key)) {
      invalid.push({ line, raw, reason: "Duplicate account number in this file" });
      return;
    }
    seen.add(key);

    valid.push({
      line,
      name,
      bank,
      accountNumber: accountNumber.replace(/[\s-]/g, ""),
      amount,
      reference: reference ?? "",
    });
  });

  return {
    valid,
    invalid,
    total: valid.length + invalid.length,
    totalAmount: valid.reduce((sum, row) => sum + row.amount, 0),
  };
}

/** Rejected rows, exported so the operator can fix and re-upload just those. */
export function rejectionsToCsv(rejections: RecipientRejection[]) {
  const header = ["line", "reason", "row"];
  const body = rejections.map((r) => [r.line, `"${r.reason.replace(/"/g, '""')}"`, `"${r.raw.replace(/"/g, '""')}"`].join(","));
  return [header.join(","), ...body].join("\n");
}

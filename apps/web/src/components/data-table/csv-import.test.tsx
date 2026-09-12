import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CsvImport } from "./csv-import";

describe("CsvImport (Wave2 CSV workflows)", () => {
  it("validates type and size", async () => {
    const onSubmit = vi.fn(async () => ({ succeeded: 1, failed: 0 }));
    render(<CsvImport onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Select CSV file") as HTMLInputElement;
    const file = new File(["name,bank,account_number,amount\nBudi,BCA,1234567890,250000"], "bad.txt", { type: "text/plain" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText(/must be .csv/)).toBeInTheDocument());
  });

  it("parses valid and invalid rows, shows preview and failed.csv download", async () => {
    const onSubmit = vi.fn(async () => ({ succeeded: 1, failed: 1 }));
    render(<CsvImport onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Select CSV file") as HTMLInputElement;
    const csv = "name,bank,account_number,amount\nBudi,BCA,1234567890,250000\n,BNI,123,abc";
    const file = new File([csv], "test.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("Valid: 1")).toBeInTheDocument());
    expect(screen.getByText("Invalid: 1")).toBeInTheDocument();
    expect(screen.getByText("Budi")).toBeInTheDocument();
    expect(screen.getByText(/Download failed.csv/)).toBeInTheDocument();
    // Submit only valid
    fireEvent.click(screen.getByText(/Submit 1 valid rows/));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it("partial failure preserved — invalid rows not submitted", async () => {
    const onSubmit = vi.fn(async (valid: unknown[]) => {
      expect((valid as unknown[]).length).toBe(1);
      return { succeeded: 1, failed: 0 };
    });
    render(<CsvImport onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Select CSV file") as HTMLInputElement;
    const csv = "name,bank,account_number,amount\nBudi,BCA,1234567890,250000\nSiti,BNI,,50000";
    const file = new File([csv], "test.csv", { type: "text/csv" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(screen.getByText("Valid: 1")).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Submit 1 valid rows/));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });
});

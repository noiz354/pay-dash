import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CanonicalDataTable, type Column } from "./canonical-data-table";

type Row = { id: string; name: string; amount: number; status: string };

const cols: Column<Row>[] = [
  { id: "name", header: "Name", accessor: (r) => r.name, sortable: true, sortKey: "name" },
  { id: "amount", header: "Amount", accessor: (r) => String(r.amount), sortable: true },
  { id: "status", header: "Status", accessor: (r) => r.status, priority: 1 },
];

const rows: Row[] = [
  { id: "1", name: "Alice", amount: 100, status: "PAID" },
  { id: "2", name: "Bob", amount: 200, status: "FAILED" },
];

describe("CanonicalDataTable (CMP-005)", () => {
  it("loading shows skeleton aria-busy", () => {
    render(<CanonicalDataTable columns={cols} rows={[]} rowKey={(r) => r.id} page={1} pageCount={1} total={0} pageSize={10} loading />);
    expect(screen.getByLabelText(/Loading/)).toBeInTheDocument();
  });

  it("empty no data vs filtered empty", () => {
    const { rerender } = render(
      <CanonicalDataTable columns={cols} rows={[]} rowKey={(r) => r.id} page={1} pageCount={1} total={0} pageSize={10} emptyTitle="No data" filteredEmptyTitle="No results" isFiltered={false} />
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    rerender(<CanonicalDataTable columns={cols} rows={[]} rowKey={(r) => r.id} page={1} pageCount={1} total={0} pageSize={10} emptyTitle="No data" filteredEmptyTitle="No results" isFiltered />);
    expect(screen.getByText("No results")).toBeInTheDocument();
  });

  it("rows render with aria-sort", () => {
    render(<CanonicalDataTable columns={cols} rows={rows} rowKey={(r) => r.id} page={1} pageCount={1} total={2} pageSize={10} sort="amount" direction="asc" />);
    expect(screen.getByText("Alice")).toBeInTheDocument();
    const th = screen.getByText("Amount").closest("th");
    expect(th).toHaveAttribute("aria-sort", "ascending");
  });

  it("selection page scope with bulk bar", () => {
    const onChange = vi.fn();
    render(<CanonicalDataTable columns={cols} rows={rows} rowKey={(r) => r.id} page={1} pageCount={1} total={2} pageSize={10} selectable selectedKeys={["1"]} onSelectionChange={onChange} bulkActions={<button>Export</button>} />);
    expect(screen.getByText("1 selected — page scope")).toBeInTheDocument();
    // Toggle Bob
    const cb = screen.getByLabelText("Select row 2");
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith(expect.arrayContaining(["1", "2"]));
  });

  it("select all page", () => {
    const onChange = vi.fn();
    render(<CanonicalDataTable columns={cols} rows={rows} rowKey={(r) => r.id} page={1} pageCount={1} total={2} pageSize={10} selectable selectedKeys={[]} onSelectionChange={onChange} />);
    const selectAll = screen.getByLabelText("Select all rows on this page");
    fireEvent.click(selectAll);
    expect(onChange).toHaveBeenCalledWith(["1", "2"]);
  });

  it("pagination Previous/Next disabled edges", () => {
    render(<CanonicalDataTable columns={cols} rows={rows} rowKey={(r) => r.id} page={1} pageCount={2} total={20} pageSize={10} />);
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).not.toBeDisabled();
  });

  it("error state with retry", () => {
    const onRetry = vi.fn();
    render(<CanonicalDataTable columns={cols} rows={[]} rowKey={(r) => r.id} page={1} pageCount={1} total={0} pageSize={10} error="Network error" onRetry={onRetry} />);
    expect(screen.getByText("Network error")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("mobile cards contain primary identity", () => {
    render(<CanonicalDataTable columns={cols} rows={rows} rowKey={(r) => r.id} page={1} pageCount={1} total={2} pageSize={10} cardRenderer={(r) => <div>{r.name} card</div>} />);
    // Cards are hidden on desktop but still in DOM
    expect(screen.getByText("Alice card")).toBeInTheDocument();
  });

  it("sorting callback asc/desc none", () => {
    const onSort = vi.fn();
    render(<CanonicalDataTable columns={cols} rows={rows} rowKey={(r) => r.id} page={1} pageCount={1} total={2} pageSize={10} sort="name" direction="asc" onSort={onSort} />);
    fireEvent.click(screen.getByText("Name"));
    expect(onSort).toHaveBeenCalledWith("name", "desc");
    fireEvent.click(screen.getByText("Amount"));
    expect(onSort).toHaveBeenCalledWith("amount", "asc");
  });
});

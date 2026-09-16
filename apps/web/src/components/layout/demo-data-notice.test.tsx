import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { DemoDataNotice, SeedBadge } from "./demo-data-notice";

/**
 * Audit findings R-07 / F-03. `/webhooks` and `/system` are read during
 * incidents, and most of what they show is invented by the store's seed
 * function. The notice has to appear when there is seed data, quantify it, and
 * stay out of the way when a deployment has real traffic only — a warning that
 * is always present teaches people to look past it.
 */
describe("DemoDataNotice", () => {
  it("renders nothing when no row is seeded", () => {
    const { container } = render(<DemoDataNotice seeded={0} total={12} />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByTestId("demo-data-notice")).toBeNull();
  });

  it("quantifies a mixed log", () => {
    render(<DemoDataNotice seeded={7} total={9} scope="callbacks in this log" />);

    const notice = screen.getByTestId("demo-data-notice");
    expect(notice).toHaveTextContent("7 of the 9 callbacks in this log");
    expect(notice).toHaveTextContent(/not received from a provider/i);
  });

  it("says so plainly when every row is invented", () => {
    render(<DemoDataNotice seeded={5} total={5} scope="callbacks in the last 24 hours" />);

    const notice = screen.getByTestId("demo-data-notice");
    expect(notice).toHaveTextContent("Every one of the 5 callbacks in the last 24 hours");
    // …and not the partial phrasing, which would understate it.
    expect(notice).not.toHaveTextContent(/not received from a provider/i);
  });

  it("warns against using the figures to diagnose an incident", () => {
    render(<DemoDataNotice seeded={2} total={9} />);

    const notice = screen.getByTestId("demo-data-notice");
    // The specific harm R-07 describes: statuses for events that never arrived,
    // read as provider health by someone on call.
    expect(notice).toHaveTextContent(/never arrived/i);
    expect(notice).toHaveTextContent(/do not use these figures to diagnose an incident/i);
  });

  it("is exposed to assistive tech as a note, not a banner", () => {
    render(<DemoDataNotice seeded={1} total={4} />);
    const notice = screen.getByTestId("demo-data-notice");
    expect(notice).toHaveAttribute("role", "note");
    expect(notice).toHaveAttribute("aria-label", "Demo data");
  });

  it("names the row-level marker it refers to", () => {
    render(<DemoDataNotice seeded={3} total={8} />);
    // The copy promises seeded rows are individually marked; SeedBadge is what
    // keeps that promise, so the two must stay in step.
    expect(screen.getByTestId("demo-data-notice")).toHaveTextContent("seed");
    render(<SeedBadge />);
    expect(screen.getByTestId("seed-badge")).toHaveTextContent("seed");
  });

  it("defaults the scope when the caller does not supply one", () => {
    render(<DemoDataNotice seeded={2} total={6} />);
    expect(screen.getByTestId("demo-data-notice")).toHaveTextContent("2 of the 6 rows on this page");
  });
});

describe("SeedBadge", () => {
  it("explains itself on hover rather than relying on the page-level notice", () => {
    render(<SeedBadge />);
    const badge = screen.getByTestId("seed-badge");
    expect(badge).toHaveTextContent("seed");
    expect(badge.getAttribute("title")).toMatch(/never received from a provider/i);
  });
});

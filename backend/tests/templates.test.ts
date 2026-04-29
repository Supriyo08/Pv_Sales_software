import { describe, expect, it } from "vitest";
import { analyze, render } from "../src/modules/templates/template.service";

describe("template engine", () => {
  it("extracts unique @placeholders with counts", () => {
    const a = analyze("Dear @name, your address is @address. Thanks @name!");
    expect(a.placeholders).toEqual(
      expect.arrayContaining([
        { tag: "name", count: 2 },
        { tag: "address", count: 1 },
      ])
    );
  });

  it("extracts [[OPTIONAL]] sections with labels", () => {
    const body = `Intro.
[[OPTIONAL:warranty|Extended warranty clause]]
Warranty text...
[[/OPTIONAL]]
Footer.`;
    const a = analyze(body);
    expect(a.sections).toEqual([{ id: "warranty", label: "Extended warranty clause" }]);
  });

  it("renders with substitutions", () => {
    const out = render("Hello @name, age @age", { name: "Mario", age: "42" }, []);
    expect(out).toBe("Hello Mario, age 42");
  });

  it("flags missing placeholder values with [[tag]]", () => {
    const out = render("Hello @name, age @age", { name: "Mario" }, []);
    expect(out).toBe("Hello Mario, age [[age]]");
  });

  it("removes omitted optional sections including content", () => {
    const body = `A.
[[OPTIONAL:wa|Warranty]]
keep_or_drop
[[/OPTIONAL]]
B.`;
    const omitted = render(body, {}, ["wa"]);
    expect(omitted).not.toContain("keep_or_drop");
    expect(omitted).not.toContain("OPTIONAL");
    expect(omitted).toContain("A.");
    expect(omitted).toContain("B.");
  });

  it("keeps optional sections that are not omitted, stripping just the markers", () => {
    const body = `A.
[[OPTIONAL:wa|Warranty]]
keep_me
[[/OPTIONAL]]
B.`;
    const kept = render(body, {}, []);
    expect(kept).toContain("keep_me");
    expect(kept).not.toContain("OPTIONAL");
  });

  it("handles real-world contract example", () => {
    const body = `CONTRACT for @customer_name
Address: @address

Contract value: €@amount

[[OPTIONAL:warranty|Extended 10-year warranty]]
The Provider extends a 10-year warranty on all modules.
[[/OPTIONAL]]

[[OPTIONAL:financing|Financing terms]]
Monthly payments of €@monthly over @months months.
[[/OPTIONAL]]

Signed by @customer_name on @date.`;

    const fullText = render(
      body,
      {
        customer_name: "Mario Rossi",
        address: "Via Roma 1",
        amount: "10000",
        monthly: "200",
        months: "60",
        date: "2026-04-15",
      },
      []
    );
    expect(fullText).toContain("Mario Rossi");
    expect(fullText).toContain("Monthly payments of €200");
    expect(fullText).toContain("The Provider extends a 10-year warranty");

    const noFinancing = render(
      body,
      { customer_name: "Mario Rossi", address: "Via Roma 1", amount: "10000", date: "2026-04-15" },
      ["financing"]
    );
    expect(noFinancing).not.toContain("Monthly payments");
    expect(noFinancing).toContain("The Provider extends a 10-year warranty");
  });
});

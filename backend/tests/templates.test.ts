import { describe, expect, it } from "vitest";
import {
  analyze,
  render,
  renderDocx,
  substituteDocxXml,
} from "../src/modules/templates/template.service";

describe("template engine", () => {
  it("extracts unique @@placeholders with counts (Review 1.1 follow-up)", () => {
    const a = analyze("Dear @@name, your address is @@address. Thanks @@name!");
    expect(a.placeholders).toEqual(
      expect.arrayContaining([
        { tag: "name", count: 2 },
        { tag: "address", count: 1 },
      ])
    );
  });

  it("ignores email addresses (single @) — does not match as placeholder", () => {
    // Real-world example from Edilteca template: emails next to placeholders.
    const body = `Contact: edilteca2022@pec.it / info@edilteca.it
Customer: @@nome_agente at @@Place_birth_client`;
    const a = analyze(body);
    const tags = a.placeholders.map((p) => p.tag).sort();
    expect(tags).toEqual(["Place_birth_client", "nome_agente"]);
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
    const out = render("Hello @@name, age @@age", { name: "Mario", age: "42" }, []);
    expect(out).toBe("Hello Mario, age 42");
  });

  it("flags missing placeholder values with [[tag]]", () => {
    const out = render("Hello @@name, age @@age", { name: "Mario" }, []);
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
    const body = `CONTRACT for @@customer_name
Address: @@address

Contract value: €@@amount

[[OPTIONAL:warranty|Extended 10-year warranty]]
The Provider extends a 10-year warranty on all modules.
[[/OPTIONAL]]

[[OPTIONAL:financing|Financing terms]]
Monthly payments of €@@monthly over @@months months.
[[/OPTIONAL]]

Signed by @@customer_name on @@date.`;

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

describe(".docx round-trip render (follow-up to Review 1.1, 2026-05-02)", () => {
  it("substituteDocxXml replaces @@tag inside the raw word/document.xml", () => {
    // Realistic single-run snippet from a Word document.xml — placeholder is
    // contained in one <w:t> element, the common case for typed templates.
    const xml = `<w:p><w:r><w:t xml:space="preserve">Hello @@nome_agente, born in @@Place_birth_client.</w:t></w:r></w:p>`;
    const out = substituteDocxXml(xml, {
      nome_agente: "Mario Rossi",
      Place_birth_client: "Roma",
    });
    expect(out).toContain("Hello Mario Rossi, born in Roma.");
    expect(out).not.toContain("@@");
  });

  it("does not match @-only emails like edilteca2022@pec.it", () => {
    const xml = `<w:t>info@edilteca.it &amp; @@nome</w:t>`;
    const out = substituteDocxXml(xml, { nome: "AGENT" });
    expect(out).toContain("info@edilteca.it"); // untouched
    expect(out).toContain("AGENT");
    expect(out).not.toContain("@@nome");
  });

  it("flags missing placeholders with [[tag]] sentinel", () => {
    const xml = `<w:t>@@only_provided / @@missing</w:t>`;
    const out = substituteDocxXml(xml, { only_provided: "OK" });
    expect(out).toContain("OK");
    expect(out).toContain("[[missing]]");
  });

  it("XML-escapes user-supplied values to keep the doc well-formed", () => {
    const xml = `<w:t>Notes: @@note</w:t>`;
    const out = substituteDocxXml(xml, { note: "<b>boom</b> & co." });
    expect(out).toContain("&lt;b&gt;boom&lt;/b&gt; &amp; co.");
    expect(out).not.toContain("<b>boom</b>");
  });

  it("renderDocx produces a valid zip with substituted document.xml", async () => {
    // Build a minimal valid .docx in memory.
    const PizZip = (await import("pizzip")).default;
    const minimalDocxXml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
      `<w:body><w:p><w:r><w:t xml:space="preserve">Hello @@name!</w:t></w:r></w:p></w:body>` +
      `</w:document>`;
    const sourceZip = new PizZip();
    sourceZip.file("[Content_Types].xml", "<?xml version='1.0'?><Types/>");
    sourceZip.file("word/document.xml", minimalDocxXml);
    const sourceBuffer = sourceZip.generate({ type: "nodebuffer" });

    const rendered = renderDocx(sourceBuffer, { name: "Mario" });
    const outZip = new PizZip(rendered);
    const outXml = outZip.file("word/document.xml")!.asText();
    expect(outXml).toContain("Hello Mario!");
    expect(outXml).not.toContain("@@name");
  });
});

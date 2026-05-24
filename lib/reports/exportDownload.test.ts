import { describe, expect, it } from "vitest";

import { filenameFromContentDisposition } from "@/lib/reports/exportDownload";

describe("filenameFromContentDisposition", () => {
  it("usa filename quoted", () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="report-team-1-2026-01-01-2026-01-31.pdf"',
        "fallback.pdf",
      ),
    ).toBe("report-team-1-2026-01-01-2026-01-31.pdf");
  });

  it("decodifica filename UTF-8", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=UTF-8''report%20team.pdf",
        "fallback.pdf",
      ),
    ).toBe("report team.pdf");
  });

  it("ritorna fallback se header assente", () => {
    expect(filenameFromContentDisposition(null, "fallback.csv")).toBe("fallback.csv");
  });
});

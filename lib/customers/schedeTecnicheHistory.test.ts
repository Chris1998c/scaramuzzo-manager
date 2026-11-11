import { describe, expect, it } from "vitest";
import {
  SCHEDE_HISTORY_PAGE_SIZE,
  schedeHistoryHasMore,
  schedeHistoryRange,
} from "@/lib/customers/schedeTecnicheHistory";

describe("schedeTecnicheHistory", () => {
  it("reuses page-size range like movimenti", () => {
    expect(SCHEDE_HISTORY_PAGE_SIZE).toBe(20);
    expect(schedeHistoryRange(1)).toEqual({ from: 0, to: 19 });
    expect(schedeHistoryRange(2)).toEqual({ from: 20, to: 39 });
  });

  it("hasMore when a full page was returned", () => {
    expect(schedeHistoryHasMore(20)).toBe(true);
    expect(schedeHistoryHasMore(40)).toBe(true);
    expect(schedeHistoryHasMore(19)).toBe(false);
    expect(schedeHistoryHasMore(0)).toBe(false);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

const getUserMock = vi.fn();
const createClientMock = vi.fn(() => ({
  auth: { getUser: getUserMock },
}));
const createServerSupabaseMock = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => createClientMock(),
}));

vi.mock("@/lib/supabaseServer", () => ({
  createServerSupabase: () => createServerSupabaseMock(),
}));

import {
  getAuthenticatedUserFromRequest,
  parseAuthorizationBearer,
} from "@/lib/getAuthenticatedUserFromRequest";

describe("parseAuthorizationBearer", () => {
  it("estrae token da header Bearer", () => {
    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer supabase-jwt-here" },
    });
    expect(parseAuthorizationBearer(req)).toBe("supabase-jwt-here");
  });

  it("restituisce null senza header", () => {
    const req = new Request("http://localhost");
    expect(parseAuthorizationBearer(req)).toBeNull();
  });
});

describe("getAuthenticatedUserFromRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("valida Bearer con auth.getUser(token)", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: { id: "user-bearer" } },
      error: null,
    });

    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer access-token-123" },
    });

    const result = await getAuthenticatedUserFromRequest(req);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe("user-bearer");
    expect(createClientMock).toHaveBeenCalled();
    expect(getUserMock).toHaveBeenCalledWith("access-token-123");
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });

  it("Bearer non valido → ok false", async () => {
    getUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: "invalid" },
    });

    const req = new Request("http://localhost", {
      headers: { Authorization: "Bearer bad-token" },
    });

    const result = await getAuthenticatedUserFromRequest(req);
    expect(result.ok).toBe(false);
    expect(createServerSupabaseMock).not.toHaveBeenCalled();
  });

  it("senza Bearer usa cookie sessione SSR", async () => {
    const cookieGetUser = vi.fn().mockResolvedValue({
      data: { user: { id: "user-cookie" } },
      error: null,
    });
    createServerSupabaseMock.mockResolvedValueOnce({
      auth: { getUser: cookieGetUser },
    });

    const req = new Request("http://localhost");
    const result = await getAuthenticatedUserFromRequest(req);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.user.id).toBe("user-cookie");
    expect(createClientMock).not.toHaveBeenCalled();
    expect(cookieGetUser).toHaveBeenCalledWith();
  });
});

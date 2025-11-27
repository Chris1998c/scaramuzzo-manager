import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("sb-access-token")?.value;

  const path = req.nextUrl.pathname;
  const isDashboard = path.startsWith("/dashboard");
  const isLogin = path === "/login";

  if (!token && isDashboard) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (token && isLogin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};

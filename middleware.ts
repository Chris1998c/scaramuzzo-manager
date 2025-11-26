import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("sb-access-token")?.value;

  const isDashboard = req.nextUrl.pathname.startsWith("/dashboard");
  const isLogin = req.nextUrl.pathname.startsWith("/login");

  // NO TOKEN → blocco dashboard
  if (!token && isDashboard) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // SE LOGGATO → evita login
  if (token && isLogin) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};

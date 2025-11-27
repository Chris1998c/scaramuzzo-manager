// app/api/auth/logout/route.ts
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.redirect(
    new URL(
      "/login",
      process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
    )
  );

  response.cookies.set("sb-access-token", "", {
    path: "/",
    maxAge: 0,
  });

  response.cookies.set("sb-refresh-token", "", {
    path: "/",
    maxAge: 0,
  });

  return response;
}

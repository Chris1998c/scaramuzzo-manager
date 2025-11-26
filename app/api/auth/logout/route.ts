import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));

  response.cookies.set("sb-access-token", "", {
    maxAge: 0,
    path: "/",
  });

  response.cookies.set("sb-refresh-token", "", {
    maxAge: 0,
    path: "/",
  });

  return response;
}

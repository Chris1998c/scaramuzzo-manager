import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.redirect("/login");

  res.cookies.set("sb-access-token", "", { path: "/", maxAge: 0 });
  res.cookies.set("sb-refresh-token", "", { path: "/", maxAge: 0 });

  return res;
}

import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword || !password) {
    return NextResponse.json({ error: "Invalid" }, { status: 401 });
  }

  let valid = false;
  if (adminPassword.startsWith("$2")) {
    valid = await bcrypt.compare(password, adminPassword);
  } else {
    valid = password === adminPassword;
  }

  if (!valid) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("auth_token", "authenticated", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return response;
}

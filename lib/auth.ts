"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";

const COOKIE_NAME = "auth_token";
const COOKIE_VALUE = "authenticated";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function login(password: string, from: string = "/"): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;

  let valid = false;
  if (adminPassword.startsWith("$2")) {
    valid = await bcrypt.compare(password, adminPassword);
  } else {
    valid = password === adminPassword;
  }

  if (!valid) return false;

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, COOKIE_VALUE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  });

  redirect(from);
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value === COOKIE_VALUE;
}

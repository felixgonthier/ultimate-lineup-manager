"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  createSessionToken,
  getSessionUserId,
} from "./session";

export async function login(
  username: string,
  password: string,
  from: string = "/",
): Promise<boolean> {
  if (!username || !password) return false;

  const user = await prisma.user.findUnique({
    where: { username: username.trim() },
  });
  if (!user) return false;

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return false;

  const token = await createSessionToken(user.id);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE_SECONDS,
    path: "/",
  });

  redirect(from);
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  redirect("/login");
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getSessionUserId()) !== null;
}

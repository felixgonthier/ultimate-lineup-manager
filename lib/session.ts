import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "./db";

export const COOKIE_NAME = "auth_token";
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET env var is not set");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    include: { team: true },
  });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireTeam() {
  const user = await requireUser();
  if (!user.team) redirect("/teams/new");
  return { user, team: user.team };
}

export async function assertTournamentOwned(tournamentId: string, teamId: string) {
  const t = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { teamId: true },
  });
  if (!t || t.teamId !== teamId) throw new Error("Not authorized");
}

export async function assertGameOwned(gameId: string, teamId: string) {
  const g = await prisma.game.findUnique({
    where: { id: gameId },
    select: { tournament: { select: { teamId: true } } },
  });
  if (!g || g.tournament.teamId !== teamId) throw new Error("Not authorized");
}

export async function assertLineOwned(lineId: string, teamId: string) {
  const l = await prisma.line.findUnique({
    where: { id: lineId },
    select: { tournament: { select: { teamId: true } } },
  });
  if (!l || l.tournament.teamId !== teamId) throw new Error("Not authorized");
}

export async function assertPlayerOwned(playerId: string, teamId: string) {
  const p = await prisma.player.findUnique({
    where: { id: playerId },
    select: { teamId: true },
  });
  if (!p || p.teamId !== teamId) throw new Error("Not authorized");
}

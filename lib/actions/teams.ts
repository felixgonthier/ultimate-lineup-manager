"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  assertPlayerOwned,
  requireTeam,
  requireUser,
} from "@/lib/session";

type PlayerRole = "HANDLER" | "CUTTER" | "HYBRID";

export async function getTeams() {
  const user = await requireUser();
  if (!user.team) return [];
  const team = await prisma.team.findUnique({
    where: { id: user.team.id },
    include: {
      _count: { select: { players: { where: { active: true } } } },
    },
  });
  return team ? [team] : [];
}

export async function getMyTeam() {
  const user = await requireUser();
  return user.team;
}

export async function getTeam(id: string) {
  const user = await requireUser();
  if (!user.team || user.team.id !== id) return null;
  return prisma.team.findUnique({
    where: { id },
    include: {
      players: {
        where: { active: true },
        orderBy: [{ number: "asc" }, { name: "asc" }],
      },
    },
  });
}

export async function createTeam(name: string) {
  const user = await requireUser();
  if (user.team) throw new Error("You already have a team");
  const team = await prisma.team.create({
    data: { name, userId: user.id },
  });
  revalidatePath("/teams");
  revalidatePath("/");
  return team;
}

export async function updateTeam(id: string, name: string) {
  const { team } = await requireTeam();
  if (team.id !== id) throw new Error("Not authorized");
  const updated = await prisma.team.update({
    where: { id },
    data: { name },
  });
  revalidatePath("/teams");
  revalidatePath(`/teams/${id}`);
  return updated;
}

export async function deleteTeam(id: string) {
  const { team } = await requireTeam();
  if (team.id !== id) throw new Error("Not authorized");
  await prisma.team.delete({ where: { id } });
  revalidatePath("/teams");
  revalidatePath("/");
}

export async function createPlayer(data: {
  teamId: string;
  name: string;
  number?: number | null;
  role: PlayerRole;
}) {
  const { team } = await requireTeam();
  if (team.id !== data.teamId) throw new Error("Not authorized");
  const player = await prisma.player.create({ data });
  revalidatePath(`/teams/${data.teamId}`);
  return player;
}

export async function updatePlayer(
  id: string,
  data: {
    name?: string;
    number?: number | null;
    role?: PlayerRole;
    active?: boolean;
  },
) {
  const { team } = await requireTeam();
  await assertPlayerOwned(id, team.id);
  const player = await prisma.player.update({ where: { id }, data });
  revalidatePath(`/teams/${player.teamId}`);
  return player;
}

export async function deletePlayer(id: string, teamId: string) {
  const { team } = await requireTeam();
  if (team.id !== teamId) throw new Error("Not authorized");
  await assertPlayerOwned(id, team.id);
  await prisma.player.delete({ where: { id } });
  revalidatePath(`/teams/${teamId}`);
}

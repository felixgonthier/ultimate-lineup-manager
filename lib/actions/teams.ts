"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

type PlayerRole = "HANDLER" | "CUTTER" | "HYBRID";

export async function getTeams() {
  return prisma.team.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { players: { where: { active: true } } } } },
  });
}

export async function getTeam(id: string) {
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
  const team = await prisma.team.create({ data: { name } });
  revalidatePath("/teams");
  return team;
}

export async function updateTeam(id: string, name: string) {
  const team = await prisma.team.update({ where: { id }, data: { name } });
  revalidatePath("/teams");
  revalidatePath(`/teams/${id}`);
  return team;
}

export async function deleteTeam(id: string) {
  await prisma.team.delete({ where: { id } });
  revalidatePath("/teams");
}

export async function createPlayer(data: {
  teamId: string;
  name: string;
  number?: number | null;
  role: PlayerRole;
}) {
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
  }
) {
  const player = await prisma.player.update({ where: { id }, data });
  revalidatePath(`/teams/${player.teamId}`);
  return player;
}

export async function deletePlayer(id: string, teamId: string) {
  await prisma.player.delete({ where: { id } });
  revalidatePath(`/teams/${teamId}`);
}

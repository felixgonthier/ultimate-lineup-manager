"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import {
  assertLineOwned,
  assertPlayerOwned,
  assertTournamentOwned,
  requireTeam,
} from "@/lib/session";

export async function createLine(
  tournamentId: string,
  name: string,
  type: "NORMAL" | "POWER" = "NORMAL",
) {
  const { team } = await requireTeam();
  await assertTournamentOwned(tournamentId, team.id);
  const line = await prisma.line.create({
    data: { tournamentId, name, type },
  });
  revalidatePath(`/tournaments/${tournamentId}/lines`);
  return line;
}

export async function updateLine(id: string, name: string, tournamentId: string) {
  const { team } = await requireTeam();
  await assertLineOwned(id, team.id);
  const line = await prisma.line.update({ where: { id }, data: { name } });
  revalidatePath(`/tournaments/${tournamentId}/lines`);
  return line;
}

export async function deleteLine(id: string, tournamentId: string) {
  const { team } = await requireTeam();
  await assertLineOwned(id, team.id);
  await prisma.line.delete({ where: { id } });
  revalidatePath(`/tournaments/${tournamentId}/lines`);
}

export async function setLinePlayers(
  lineId: string,
  playerIds: string[],
  tournamentId: string,
) {
  const { team } = await requireTeam();
  await assertLineOwned(lineId, team.id);
  await Promise.all(
    playerIds.map((id: string) => assertPlayerOwned(id, team.id)),
  );
  await prisma.linePlayer.deleteMany({ where: { lineId } });
  if (playerIds.length > 0) {
    await prisma.linePlayer.createMany({
      data: playerIds.map((playerId: string) => ({ lineId, playerId })),
    });
  }
  revalidatePath(`/tournaments/${tournamentId}/lines`);
}

export async function addPlayerToLine(
  lineId: string,
  playerId: string,
  tournamentId: string,
) {
  const { team } = await requireTeam();
  await assertLineOwned(lineId, team.id);
  await assertPlayerOwned(playerId, team.id);
  await prisma.linePlayer.createMany({
    data: [{ lineId, playerId }],
    skipDuplicates: true,
  });
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function removePlayerFromLine(
  lineId: string,
  playerId: string,
  tournamentId: string,
) {
  const { team } = await requireTeam();
  await assertLineOwned(lineId, team.id);
  await prisma.linePlayer.deleteMany({ where: { lineId, playerId } });
  revalidatePath(`/tournaments/${tournamentId}`);
}

export async function getLinePlayers(tournamentId: string) {
  const { team } = await requireTeam();
  await assertTournamentOwned(tournamentId, team.id);
  return prisma.line.findMany({
    where: { tournamentId },
    include: {
      players: {
        include: { player: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

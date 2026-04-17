import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { EditPlayerForm } from "./edit-form";

export const dynamic = "force-dynamic";

export default async function EditPlayerPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>;
}) {
  const { id: teamId, pid } = await params;
  const user = await requireUser();
  if (!user.team || user.team.id !== teamId) notFound();

  const player = await prisma.player.findUnique({ where: { id: pid } });
  if (!player || player.teamId !== teamId) notFound();

  return <EditPlayerForm player={player} teamId={teamId} />;
}

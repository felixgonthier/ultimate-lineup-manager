import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { NewTournamentForm } from "./new-tournament-form";

export const dynamic = "force-dynamic";

export default async function NewTournamentPage() {
  const user = await requireUser();
  if (!user.team) redirect("/teams/new");
  return <NewTournamentForm teamId={user.team.id} />;
}

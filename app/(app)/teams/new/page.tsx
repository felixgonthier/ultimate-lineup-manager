import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { NewTeamForm } from "./new-team-form";

export const dynamic = "force-dynamic";

export default async function NewTeamPage() {
  const user = await requireUser();
  if (user.team) redirect(`/teams/${user.team.id}`);
  return <NewTeamForm />;
}

import Link from "next/link";
import { getAdvancedStatsPayload } from "@/lib/actions/stats";
import { requireAdmin } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, BarChart3 } from "lucide-react";
import { StatsExplorer } from "./stats-explorer";

export const dynamic = "force-dynamic";

export default async function AdvancedStatsPage() {
  await requireAdmin();
  const payload = await getAdvancedStatsPayload();

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Link href="/">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold leading-tight flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Advanced Stats
          </h1>
          <p className="text-xs text-muted-foreground">
            Efficiency, chemistry and game difficulty
          </p>
        </div>
      </div>

      {payload.points.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-10 gap-2 text-center">
            <p className="font-medium">No points recorded yet</p>
            <p className="text-sm text-muted-foreground">
              Play a game to start building efficiency numbers.
            </p>
            <Link href="/tournaments">
              <Button className="mt-2">Go to tournaments</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <StatsExplorer payload={payload} />
      )}
    </div>
  );
}

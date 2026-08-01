"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EyeOff, Eye, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { setGameDifficulty, setGameExcluded } from "@/lib/actions/stats";
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_TONE,
  MIN_GAME_POINTS_FOR_DIFFICULTY,
  pct,
  type Difficulty,
  type GameAnalysis,
  type PayloadTournament,
} from "@/lib/advanced-stats";

type Override = "AUTO" | Difficulty;

const OVERRIDES: { id: Override; label: string }[] = [
  { id: "AUTO", label: "Auto" },
  { id: "EASY", label: "Easy" },
  { id: "EVEN", label: "Even" },
  { id: "TOUGH", label: "Tough" },
  { id: "OUT_OF_REACH", label: "Out of reach" },
];

export function GamesPanel({
  analyses,
  included,
  tournaments,
}: {
  analyses: GameAnalysis[];
  included: boolean[];
  tournaments: PayloadTournament[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tournaments arrive newest-first, so ascending index is reverse-chronological.
  const ordered = [...analyses].sort((a: GameAnalysis, b: GameAnalysis) => {
    if (a.tournamentIndex !== b.tournamentIndex) {
      return a.tournamentIndex - b.tournamentIndex;
    }
    return b.index - a.index;
  });

  function applyDifficulty(game: GameAnalysis, next: Override) {
    startTransition(async () => {
      await setGameDifficulty(game.id, next === "AUTO" ? null : next);
      router.refresh();
    });
  }

  function applyExcluded(game: GameAnalysis, excluded: boolean) {
    startTransition(async () => {
      await setGameExcluded(game.id, excluded);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className={cn("p-0", isPending && "opacity-60")}>
        <div className="px-4 py-3 border-b">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Difficulty is scored from how well we converted in each game against
            the rest of the season. Override the label when the score doesn&apos;t
            tell the story, or exclude a game to drop it from every view.
          </p>
        </div>

        {ordered.map((g: GameAnalysis, i: number) => {
          const tournament = tournaments[g.tournamentIndex];
          const override: Override = g.manualDifficulty ?? "AUTO";
          const isIncluded = included[g.index];

          return (
            <div
              key={g.id}
              className={cn(
                "px-4 py-3 space-y-2",
                i < ordered.length - 1 && "border-b",
                g.excluded && "opacity-50",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium leading-tight truncate">
                    vs {g.opponent}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {tournament ? tournament.name : "—"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={cn(
                      "text-lg font-bold tabular-nums leading-tight",
                      g.scoreUs > g.scoreThem
                        ? "text-green-600"
                        : g.scoreUs < g.scoreThem
                          ? "text-red-500"
                          : "text-foreground",
                    )}
                  >
                    {g.scoreUs}–{g.scoreThem}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {g.pointsPlayed} pts · {pct(g.conversion)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {g.difficulty ? (
                  <Badge
                    className={cn(
                      "text-xs font-medium",
                      DIFFICULTY_TONE[g.difficulty],
                    )}
                  >
                    {DIFFICULTY_LABEL[g.difficulty]}
                    {g.manualDifficulty ? " (set)" : ""}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    Under {MIN_GAME_POINTS_FOR_DIFFICULTY} pts
                  </Badge>
                )}
                {g.z !== null && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    z {g.z > 0 ? "+" : ""}
                    {g.z.toFixed(2)}
                  </span>
                )}
                {g.isOutlier && (
                  <span className="text-xs text-amber-700 flex items-center gap-1">
                    <TriangleAlert className="h-3 w-3" />
                    outlier
                  </span>
                )}
                {!isIncluded && !g.excluded && (
                  <span className="text-xs text-muted-foreground">
                    filtered out
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex flex-wrap rounded-lg bg-muted p-0.5 text-xs font-medium">
                  {OVERRIDES.map((o: (typeof OVERRIDES)[number]) => (
                    <button
                      key={o.id}
                      type="button"
                      disabled={isPending}
                      onClick={() => applyDifficulty(g, o.id)}
                      className={cn(
                        "px-2 py-1 rounded-md transition-colors disabled:cursor-not-allowed",
                        override === o.id
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => applyExcluded(g, !g.excluded)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors disabled:cursor-not-allowed",
                    g.excluded
                      ? "border-input hover:bg-accent"
                      : "border-input text-muted-foreground hover:bg-accent",
                  )}
                >
                  {g.excluded ? (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      Include
                    </>
                  ) : (
                    <>
                      <EyeOff className="h-3.5 w-3.5" />
                      Exclude
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

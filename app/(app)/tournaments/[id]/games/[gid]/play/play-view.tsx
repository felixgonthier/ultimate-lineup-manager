"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordPoint, deleteLastPoint } from "@/lib/actions/points";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  RotateCcw,
  Check,
  X,
  Zap,
  Wand2,
  RefreshCw,
  ArrowLeftRight,
  Timer,
  UserX,
  Users,
} from "lucide-react";

type Player = {
  id: string;
  name: string;
  number: number | null;
  role: string;
  pointCount: number;
  lineIds: string[];
};

type Line = { id: string; name: string; type: "NORMAL" | "POWER" };

type Game = {
  id: string;
  tournamentId: string;
  opponentName: string;
  scoreUs: number;
  scoreThem: number;
};

type Step = "select" | "outcome";

const ROLE_SHORT: Record<string, string> = {
  HANDLER: "H",
  CUTTER: "C",
  HYBRID: "Hy",
};
const ROLE_COLORS: Record<string, string> = {
  HANDLER: "bg-blue-100 text-blue-700",
  CUTTER: "bg-green-100 text-green-700",
  HYBRID: "bg-purple-100 text-purple-700",
};

// Recommend 7 players: fairness (fewest points) + at least 1 handler, 3 handler+hybrid
function computeRecommendedIds(players: Player[]): Set<string> {
  if (players.length <= 7) return new Set(players.map((p) => p.id));

  const sorted = [...players].sort((a, b) => a.pointCount - b.pointCount);
  const handlers = sorted.filter((p) => p.role === "HANDLER");
  const handlerHybrids = sorted.filter(
    (p) => p.role === "HANDLER" || p.role === "HYBRID",
  );

  // Can't meet constraints — fall back to pure fairness
  if (handlers.length === 0 || handlerHybrids.length < 3) {
    return new Set(sorted.slice(0, 7).map((p) => p.id));
  }

  const pickedIds = new Set<string>();
  const picked: Player[] = [];

  // 1. Lowest-point handler (mandatory)
  picked.push(handlers[0]);
  pickedIds.add(handlers[0].id);

  // 2. Fill to 3 handler+hybrid (by fewest points)
  for (const p of handlerHybrids) {
    if (picked.length >= 3) break;
    if (!pickedIds.has(p.id)) {
      picked.push(p);
      pickedIds.add(p.id);
    }
  }

  // 3. Fill remaining 4 slots with fewest-points players
  for (const p of sorted) {
    if (picked.length >= 7) break;
    if (!pickedIds.has(p.id)) {
      picked.push(p);
      pickedIds.add(p.id);
    }
  }

  return new Set(picked.map((p) => p.id));
}

export function PlayView({
  game,
  players,
  lines,
  nextPointNumber,
  hotPlayerIds,
  consecutiveCounts,
}: {
  game: Game;
  players: Player[];
  lines: Line[];
  nextPointNumber: number;
  hotPlayerIds: string[];
  consecutiveCounts: Record<string, number>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [step, setStep] = useState<Step>("select");
  const [selectedLine, setSelectedLine] = useState<string | null>(
    lines.length > 0 ? lines[0].id : null,
  );
  const [ourOffense, setOurOffense] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastLineupIds, setLastLineupIds] = useState<Set<string>>(new Set());
  const [scoredByUs, setScoredByUs] = useState<boolean | null>(null);
  const [assistId, setAssistId] = useState<string | null>(null);
  const [goalId, setGoalId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [subbingOutId, setSubbingOutId] = useState<string | null>(null);
  const [injuredIds, setInjuredIds] = useState<Set<string>>(new Set());
  const [playerLineOverrides, setPlayerLineOverrides] = useState<
    Record<string, string[]>
  >({});
  const [manageOpen, setManageOpen] = useState(false);

  const hotSet = useMemo(() => new Set(hotPlayerIds), [hotPlayerIds]);

  function effectiveLineIds(p: Player): string[] {
    return playerLineOverrides[p.id] ?? p.lineIds;
  }

  function toggleInjury(id: string) {
    const becomingInjured = !injuredIds.has(id);
    setInjuredIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (becomingInjured) {
      setSelectedIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      if (assistId === id) setAssistId(null);
      if (goalId === id) setGoalId(null);
    }
  }

  function togglePlayerLine(playerId: string, lineId: string) {
    setPlayerLineOverrides((prev) => {
      const player = players.find((p) => p.id === playerId)!;
      const current = prev[playerId] ?? [...player.lineIds];
      const next = current.includes(lineId)
        ? current.filter((id) => id !== lineId)
        : [...current, lineId];
      return { ...prev, [playerId]: next };
    });
  }

  // Filter + sort players by fewest points (injured players excluded)
  const visiblePlayers = players
    .filter((p) => !injuredIds.has(p.id))
    .filter((p) => !selectedLine || effectiveLineIds(p).includes(selectedLine))
    .sort((a, b) => a.pointCount - b.pointCount);

  const recommendedIds = useMemo(
    () => computeRecommendedIds(visiblePlayers),
    // visiblePlayers identity changes with selectedLine/players, so these are the real deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedLine, players],
  );

  function togglePlayer(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < 7) {
        next.add(id);
      }
      return next;
    });
  }

  async function handleConfirmLineup() {
    if (selectedIds.size !== 7) return;
    setSubbingOutId(null);
    setStep("outcome");
  }

  function completeSub(outId: string, inId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(outId);
      next.add(inId);
      return next;
    });
    if (assistId === outId) setAssistId(null);
    if (goalId === outId) setGoalId(null);
    setSubbingOutId(null);
  }

  async function handleSubmitPoint() {
    if (scoredByUs === null) return;
    setSubmitting(true);

    await recordPoint({
      gameId: game.id,
      tournamentId: game.tournamentId,
      pointNumber: nextPointNumber,
      ourOffense,
      playerIds: Array.from(selectedIds),
      scoredByUs,
      assistPlayerId: scoredByUs && assistId ? assistId : undefined,
      goalPlayerId: scoredByUs && goalId ? goalId : undefined,
    });

    setLastLineupIds(new Set(selectedIds));
    startTransition(() => {
      router.refresh();
    });
    // Reset for next point
    setStep("select");
    setSelectedIds(new Set());
    setOurOffense(!scoredByUs); // scored → we kick, start D; conceded → we receive, start O
    setScoredByUs(null);
    setAssistId(null);
    setGoalId(null);
    setSubbingOutId(null);
    setSubmitting(false);
  }

  async function handleUndo() {
    if (!confirm("Undo last point?")) return;
    await deleteLastPoint(game.id, game.tournamentId);
    startTransition(() => router.refresh());
  }

  const selectedPlayers = players.filter((p) => selectedIds.has(p.id));
  const benchPlayers = players
    .filter((p) => !selectedIds.has(p.id) && !injuredIds.has(p.id))
    .sort((a, b) => a.pointCount - b.pointCount);

  return (
    <>
      {step === "outcome" ? (
        <div className="fixed inset-0 z-[51] bg-background overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 py-4 space-y-5">
            {/* Header */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    setSubbingOutId(null);
                    setStep("select");
                  }}
                  className="flex items-center gap-1 text-sm text-muted-foreground"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
                <button
                  onClick={() => setManageOpen(true)}
                  className="text-muted-foreground p-1"
                  title="Manage roster"
                >
                  <Users className="h-4 w-4" />
                </button>
              </div>
              <div className="text-center">
                <p className="text-5xl font-black tracking-tight tabular-nums leading-none">
                  {game.scoreUs}
                  <span className="text-muted-foreground font-light mx-3">
                    –
                  </span>
                  {game.scoreThem}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  vs {game.opponentName}
                </p>
              </div>
            </div>

            {/* Selected lineup preview */}
            <div className="space-y-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
                On field
              </p>
              <div className="divide-y divide-border rounded-xl border overflow-hidden">
                {selectedPlayers.map((p) => {
                  const isSubbingOut = subbingOutId === p.id;
                  return (
                    <div
                      key={p.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 bg-card transition-colors",
                        isSubbingOut && "bg-amber-50",
                      )}
                    >
                      {p.number != null && (
                        <span className="text-xs font-mono text-muted-foreground w-6 shrink-0 text-right">
                          {p.number}
                        </span>
                      )}
                      <span className="flex-1 text-sm font-medium truncate">
                        {p.name}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0",
                          ROLE_COLORS[p.role],
                        )}
                      >
                        {ROLE_SHORT[p.role]}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                        {p.pointCount}pt{p.pointCount !== 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={() =>
                          setSubbingOutId(isSubbingOut ? null : p.id)
                        }
                        className={cn(
                          "ml-1 p-1.5 rounded-lg border transition-colors shrink-0",
                          isSubbingOut
                            ? "border-amber-400 bg-amber-100 text-amber-700"
                            : "border-input text-muted-foreground hover:bg-accent",
                        )}
                        title="Sub this player out"
                      >
                        <ArrowLeftRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bench — shown when subbing */}
            {subbingOutId && (
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 px-1">
                  Sub in for {players.find((p) => p.id === subbingOutId)?.name}
                </p>
                {benchPlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    No bench players available
                  </p>
                ) : (
                  <div className="divide-y divide-border rounded-xl border overflow-hidden">
                    {benchPlayers.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => completeSub(subbingOutId, p.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 bg-card hover:bg-accent text-left transition-colors"
                      >
                        {p.number != null && (
                          <span className="text-xs font-mono text-muted-foreground w-6 shrink-0 text-right">
                            {p.number}
                          </span>
                        )}
                        <span className="flex-1 text-sm font-medium truncate">
                          {p.name}
                        </span>
                        <span
                          className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0",
                            ROLE_COLORS[p.role],
                          )}
                        >
                          {ROLE_SHORT[p.role]}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-10 text-right">
                          {p.pointCount}pt{p.pointCount !== 1 ? "s" : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Outcome */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Who scored?
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setScoredByUs(true)}
                  className={cn(
                    "py-5 rounded-2xl border-2 font-bold text-base transition-all flex items-center justify-center gap-2",
                    scoredByUs === true
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-input hover:bg-accent",
                  )}
                >
                  <Check className="h-4 w-4" /> We scored
                </button>
                <button
                  onClick={() => {
                    setScoredByUs(false);
                    setAssistId(null);
                    setGoalId(null);
                  }}
                  className={cn(
                    "py-5 rounded-2xl border-2 font-bold text-base transition-all flex items-center justify-center gap-2",
                    scoredByUs === false
                      ? "border-red-400 bg-red-50 text-red-600"
                      : "border-input hover:bg-accent",
                  )}
                >
                  <X className="h-4 w-4" /> They scored
                </button>
              </div>
            </div>

            {/* Scorer details — only if we scored */}
            {scoredByUs === true && (
              <div className="space-y-0.5">
                <div className="flex items-center px-1 pb-1">
                  <span className="flex-1" />
                  <span className="w-10 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Ast
                  </span>
                  <span className="w-10 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Goal
                  </span>
                </div>
                {selectedPlayers.map((p) => {
                  const isAssist = assistId === p.id;
                  const isGoal = goalId === p.id;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-1 px-1 py-1"
                    >
                      <span className="flex-1 text-sm font-medium truncate">
                        {p.name}
                      </span>
                      <button
                        onClick={() => {
                          setAssistId(isAssist ? null : p.id);
                          if (!isAssist && goalId === p.id) setGoalId(null);
                        }}
                        className={cn(
                          "w-10 h-8 rounded-lg text-xs font-bold border-2 transition-all shrink-0",
                          isAssist
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input text-muted-foreground hover:bg-accent",
                        )}
                      >
                        A
                      </button>
                      <button
                        onClick={() => {
                          setGoalId(isGoal ? null : p.id);
                          if (!isGoal && assistId === p.id) setAssistId(null);
                        }}
                        className={cn(
                          "w-10 h-8 rounded-lg text-xs font-bold border-2 transition-all shrink-0",
                          isGoal
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input text-muted-foreground hover:bg-accent",
                        )}
                      >
                        G
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <Button
              className="w-full h-14 text-base font-bold"
              onClick={handleSubmitPoint}
              disabled={scoredByUs === null || submitting}
            >
              {submitting ? "Saving…" : "Record Point"}
            </Button>
          </div>
        </div>
      ) : (
        /* Step: select players */
        <div className="fixed inset-0 z-[51] flex flex-col bg-background">
          {/* Header */}
          <div className="w-full border-b bg-background">
            <div className="max-w-lg mx-auto px-4 pt-3 pb-2 space-y-2">
              {/* Row 1: back · score · manage · undo */}
              <div className="flex items-center justify-between">
                <Link
                  href={`/tournaments/${game.tournamentId}/games/${game.id}`}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </Button>
                </Link>
                <p className="text-2xl font-black tracking-tight tabular-nums leading-none">
                  {game.scoreUs}
                  <span className="text-muted-foreground font-light mx-1.5">
                    –
                  </span>
                  {game.scoreThem}
                </p>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => setManageOpen(true)}
                    className="text-muted-foreground p-1"
                    title="Manage roster"
                  >
                    <Users className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleUndo}
                    className="text-muted-foreground p-1"
                    title="Undo last point"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Row 2: opponent · O/D toggle */}
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-medium text-muted-foreground">
                  vs {game.opponentName}
                </span>
                <div className="flex items-center bg-muted rounded-full p-0.5">
                  <button
                    onClick={() => setOurOffense(true)}
                    className={cn(
                      "px-3 py-0.5 rounded-full text-xs font-bold transition-all",
                      ourOffense
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Offense
                  </button>
                  <button
                    onClick={() => setOurOffense(false)}
                    className={cn(
                      "px-3 py-0.5 rounded-full text-xs font-bold transition-all",
                      !ourOffense
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Defense
                  </button>
                </div>
              </div>

              {/* Row 3: all line filters in one scrollable row */}
              {lines.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 mt-1">
                  <button
                    onClick={() => setSelectedLine(null)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap shrink-0 transition-colors",
                      selectedLine === null
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-accent",
                    )}
                  >
                    All
                  </button>
                  {lines
                    .filter((l) => l.type === "NORMAL")
                    .map((line) => (
                      <button
                        key={line.id}
                        onClick={() => setSelectedLine(line.id)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap shrink-0 transition-colors",
                          selectedLine === line.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-input hover:bg-accent",
                        )}
                      >
                        {line.name}
                      </button>
                    ))}
                  {lines.some((l) => l.type === "POWER") && (
                    <span className="self-center text-border text-xs shrink-0 select-none">
                      |
                    </span>
                  )}
                  {lines
                    .filter((l) => l.type === "POWER")
                    .map((line) => (
                      <button
                        key={line.id}
                        onClick={() =>
                          setSelectedLine(
                            selectedLine === line.id ? null : line.id,
                          )
                        }
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap shrink-0 transition-colors flex items-center gap-1",
                          selectedLine === line.id
                            ? "bg-amber-500 text-white border-amber-500"
                            : "border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100",
                        )}
                      >
                        <Zap className="h-3 w-3 shrink-0" />
                        {line.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* Scrollable player list */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-lg mx-auto px-4 py-2 space-y-1.5">
              {visiblePlayers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No players in this line
                </p>
              )}
              {visiblePlayers.map((player) => {
                const selected = selectedIds.has(player.id);
                const isHot = hotSet.has(player.id);
                const streak = consecutiveCounts[player.id] ?? 0;

                return (
                  <button
                    key={player.id}
                    onClick={() => togglePlayer(player.id)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border-2 text-left transition-all active:scale-98",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-input bg-card hover:bg-accent",
                    )}
                  >
                    {/* Selection indicator */}
                    <div
                      className={cn(
                        "h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground",
                      )}
                    >
                      {selected && <Check className="h-3 w-3" />}
                    </div>

                    {/* Player info */}
                    <div className="flex-1 flex items-center gap-1.5 min-w-0">
                      {player.number != null && (
                        <span className="text-xs font-mono text-muted-foreground shrink-0">
                          #{player.number}
                        </span>
                      )}
                      <span className="font-semibold text-sm truncate">
                        {player.name}
                      </span>
                      <span
                        className={cn(
                          "text-xs px-1.5 py-0.5 rounded font-medium shrink-0",
                          ROLE_COLORS[player.role],
                        )}
                      >
                        {ROLE_SHORT[player.role]}
                      </span>
                      {streak >= 2 && (
                        <span
                          className="flex items-center gap-0.5 text-red-500 shrink-0"
                          title={`${streak} consecutive points`}
                        >
                          <Timer className="h-3 w-3" />
                          <span className="text-[10px] font-bold tabular-nums">
                            {streak}
                          </span>
                        </span>
                      )}
                      {streak === 1 && (
                        <span title="Played last point" className="shrink-0">
                          <Timer className="h-3 w-3 text-amber-400" />
                        </span>
                      )}
                      {isHot && (
                        <span
                          className="text-sm leading-none shrink-0"
                          title="Hot — scored recently"
                        >
                          🔥
                        </span>
                      )}
                    </div>

                    {/* Point count */}
                    <span className="text-xs text-muted-foreground shrink-0">
                      {player.pointCount}pt{player.pointCount !== 1 ? "s" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Confirm bar */}
          <div className="w-full border-t bg-background safe-area-bottom">
            <div className="max-w-lg mx-auto px-4 pt-2 pb-3 space-y-2">
              <div className="flex gap-2">
                {lastLineupIds.size === 7 && (
                  <button
                    onClick={() =>
                      setSelectedIds(
                        new Set(
                          [...lastLineupIds].filter(
                            (id) => !injuredIds.has(id),
                          ),
                        ),
                      )
                    }
                    className="flex-1 h-10 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 border-input bg-card text-foreground hover:bg-accent transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Same
                  </button>
                )}
                <button
                  onClick={() => setSelectedIds(recommendedIds)}
                  className={cn(
                    "h-10 rounded-xl border text-sm font-medium flex items-center justify-center gap-1.5 border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors",
                    lastLineupIds.size === 7 ? "flex-1" : "w-full",
                  )}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  Suggest
                </button>
              </div>
              <Button
                className="w-full h-14 text-base font-bold"
                disabled={selectedIds.size !== 7}
                onClick={handleConfirmLineup}
              >
                {selectedIds.size === 7
                  ? "Confirm Lineup →"
                  : `Select ${7 - selectedIds.size} more player${7 - selectedIds.size !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Roster management sheet — line reassignment and injury marking */}
      <Sheet open={manageOpen} onOpenChange={setManageOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[80vh] flex flex-col overflow-hidden"
        >
          <SheetHeader className="shrink-0">
            <SheetTitle>Manage Roster</SheetTitle>
            <SheetDescription>
              Reassign lines or mark injuries for this game.
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-0">
            {players.map((p) => {
              const injured = injuredIds.has(p.id);
              const currentLineIds = playerLineOverrides[p.id] ?? p.lineIds;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-start gap-3 py-3 border-b border-border last:border-0",
                    injured && "opacity-50",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {p.number != null && (
                        <span className="text-xs font-mono text-muted-foreground">
                          #{p.number}
                        </span>
                      )}
                      <span
                        className={cn(
                          "text-sm font-medium",
                          injured && "line-through",
                        )}
                      >
                        {p.name}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded font-semibold",
                          ROLE_COLORS[p.role],
                        )}
                      >
                        {ROLE_SHORT[p.role]}
                      </span>
                    </div>
                    {lines.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {lines.map((line) => {
                          const inLine = currentLineIds.includes(line.id);
                          return (
                            <button
                              key={line.id}
                              onClick={() => togglePlayerLine(p.id, line.id)}
                              className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors flex items-center gap-0.5",
                                inLine
                                  ? line.type === "POWER"
                                    ? "bg-amber-500 text-white border-amber-500"
                                    : "bg-primary/20 text-primary border-primary/50"
                                  : "border-input text-muted-foreground hover:bg-accent",
                              )}
                            >
                              {line.type === "POWER" && (
                                <Zap className="h-2.5 w-2.5" />
                              )}
                              {line.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => toggleInjury(p.id)}
                    className={cn(
                      "mt-0.5 p-2 rounded-lg border transition-colors shrink-0",
                      injured
                        ? "border-red-400 bg-red-50 text-red-600"
                        : "border-input text-muted-foreground hover:bg-accent",
                    )}
                    title={injured ? "Mark available" : "Mark injured"}
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

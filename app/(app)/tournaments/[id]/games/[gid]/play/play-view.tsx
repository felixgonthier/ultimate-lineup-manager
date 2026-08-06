"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { recordPoint, deleteLastPoint } from "@/lib/actions/points";
import { setGameAbsence, clearGameAbsences } from "@/lib/actions/games";
import { isCallahanPoint } from "@/lib/stats";
import { explainCandidate, type Reason } from "@/lib/lineup-explain";
import {
  ROLE_LABEL,
  ROLE_SHORT,
  ROLE_TONE,
  type Role as PlayerRole,
} from "@/lib/advanced-stats";
import {
  clampRung,
  rungLabel,
  suggestLine,
  type Candidate,
  type CandidateRatings,
  type LineupMode,
  type Pool,
  type Role,
  type Rung,
  type Tier,
  type Variance,
  type WindStrength,
} from "@/lib/lineup";
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
  ChevronDown,
  RotateCcw,
  Check,
  X,
  Zap,
  Wand2,
  RefreshCw,
  ArrowLeftRight,
  Timer,
  UserMinus,
  UserPlus,
  Users,
  AlertTriangle,
  Shield,
  Undo2,
  Wind,
  SlidersHorizontal,
} from "lucide-react";

/** One link of the scoring chain. Order is the order they get filled in. */
type ChainSlot = "goal" | "assist" | "hockeyAssist";

const CHAIN_SLOTS: { slot: ChainSlot; label: string; tag: string }[] = [
  { slot: "goal", label: "Goal", tag: "G" },
  { slot: "assist", label: "Assist", tag: "A" },
  { slot: "hockeyAssist", label: "2nd", tag: "HA" },
];

/** What a player has done in this game — the "right now" read on a name. */
export type GameImpact = {
  goals: number;
  assists: number;
  hockeyAssists: number;
  blocks: number;
  turnovers: number;
  /** Offence points on the field, and how many were held. */
  holds: number;
  holdOpps: number;
  /** Defence points on the field, and how many were broken. */
  breaks: number;
  breakOpps: number;
  /** On-field flag for each of the last few points, oldest first. */
  recent: boolean[];
};

/** A player's tournament-so-far form — the sample this game is too small to be. */
export type PlayerForm = {
  holds: number;
  holdOpps: number;
  breaks: number;
  breakOpps: number;
  blocks: number;
  dPoints: number;
  /** Goals plus assists. A player cannot have both on one point, so this is
   *  also the count of points they finished. */
  scores: number;
  /** Drops and throwaways charged across the tournament. */
  turnovers: number;
  pointsPlayed: number;
};

type Player = {
  id: string;
  name: string;
  role: string;
  pool: Pool;
  tier: Tier;
  variance: Variance;
  /** Points played in this game — fairness. */
  pointCount: number;
  /** Points played across the tournament — fatigue. */
  tournamentPointCount: number;
  lineIds: string[];
};

type Line = { id: string; name: string; type: "NORMAL" | "POWER" };

type Game = {
  id: string;
  tournamentId: string;
  opponentName: string;
  scoreUs: number;
  scoreThem: number;
  /** Already resolved server-side: game override ?? tournament default. */
  lineupMode: LineupMode;
  windStrength: WindStrength;
  /** Which end we attack on point 1. null = wind irrelevant. */
  startAttackingUpwind: boolean | null;
  fairnessFloor: number | null;
};

type Step = "select" | "outcome";

/** The roster sheet does two unrelated jobs, so it gets two panes. */
type ManageTab = "availability" | "lines";

const TIER_ABBR: Record<Tier, string> = {
  STAR: "STAR",
  CORE: "CORE",
  DEPTH: "DEPTH",
};
/**
 * Tier sits ahead of the name as a quiet chip. The O/D pool is deliberately
 * absent — it drives the suggester's own ranking, so the pick order already
 * reflects it.
 */
function TierChip({ tier }: { tier: Tier }) {
  return (
    <span
      className="shrink-0 px-[2px] py-[1px] rounded-[2px] border border-foreground/10 bg-foreground/[0.03] text-[7px] font-bold uppercase tracking-wide leading-none text-foreground/45"
      title={`${tier.charAt(0)}${tier.slice(1).toLowerCase()} tier`}
    >
      {TIER_ABBR[tier]}
    </span>
  );
}

/** The role tag the rest of the app uses — same tone, same shape, same letters. */
function RoleTag({ role, compact }: { role: string; compact?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded font-medium",
        compact ? "text-[7px] px-1 py-[1px]" : "text-[10px] px-1.5 py-0.5",
        ROLE_TONE[role as PlayerRole],
      )}
      title={ROLE_LABEL[role as PlayerRole]}
    >
      {ROLE_SHORT[role as PlayerRole]}
    </span>
  );
}

const MODE_ORDER: LineupMode[] = ["FAIR", "BALANCED", "RESULTS"];
const MODE_LABELS: Record<LineupMode, string> = {
  FAIR: "Fair",
  BALANCED: "Balanced",
  RESULTS: "Results",
};
const MODE_HINTS: Record<LineupMode, string> = {
  FAIR: "Equal minutes — fewest points played go on",
  BALANCED: "Mixes fairness with the matchup",
  RESULTS: "Best line for the point, fairness last",
};

// Reasons read as a quiet caption, not a row of stickers — only the warning
// tone earns colour.
const REASON_TONES: Record<Reason["tone"], string> = {
  good: "text-muted-foreground",
  fair: "text-muted-foreground",
  warn: "text-red-500 font-semibold",
};

const RUNG_ORDER: Rung[] = [
  "DEPTH",
  "ROTATION",
  "STARTING",
  "HALF_PUSH",
  "FULL_PUSH",
];

/**
 * On-field flags for the last few points — game fatigue at a glance. The bar is
 * always the full window wide so every player's load reads against the same
 * ruler; points that have not happened yet are empty outlines.
 */
const FATIGUE_WINDOW = 9;

function FatigueDots({ recent }: { recent: boolean[] }) {
  const played = recent.slice(-FATIGUE_WINDOW);
  const pending = FATIGUE_WINDOW - played.length;
  // null marks a slot with no point behind it yet.
  const slots: (boolean | null)[] = [
    ...Array.from({ length: pending }, () => null),
    ...played,
  ];
  return (
    <span
      className="flex items-center gap-[2px] shrink-0"
      title={
        played.length === 0
          ? `Last ${FATIGUE_WINDOW} points — no points played yet`
          : `Last ${played.length} point${played.length === 1 ? "" : "s"} — filled means on the field`
      }
    >
      {slots.map((on: (typeof slots)[number], i: number) => (
        <span
          key={i}
          className={cn(
            "h-2 w-[3px] rounded-full",
            on === null
              ? "border border-foreground/10"
              : on
                ? "bg-foreground/60"
                : "bg-foreground/15",
          )}
        />
      ))}
    </span>
  );
}

/**
 * Whether a player has anything to show for this game yet. The row asks before
 * it lays out a line for the strip: an empty stat line is dead space, and at 0–0
 * every row would have one.
 */
function hasGameImpact(impact: GameImpact | undefined): boolean {
  if (!impact) return false;
  return (
    impact.holdOpps > 0 ||
    impact.breakOpps > 0 ||
    impact.turnovers > 0 ||
    impact.goals > 0 ||
    impact.assists > 0 ||
    impact.hockeyAssists > 0 ||
    impact.blocks > 0
  );
}

/** Same question for the tournament-so-far line. */
function hasForm(form: PlayerForm | undefined): boolean {
  return form !== undefined && form.pointsPlayed > 0;
}

/**
 * What the team did with this player on the field. Conversion split by O and D
 * beats a single plus-minus: a handler at 5/5 holding and a defender at 2/3
 * breaking are both excellent, and one number would hide that.
 */
function ImpactStrip({ impact }: { impact: GameImpact | undefined }) {
  if (!hasGameImpact(impact) || !impact) return null;
  const credits: string[] = [];
  if (impact.goals > 0) credits.push(`${impact.goals}G`);
  if (impact.assists > 0) credits.push(`${impact.assists}A`);
  if (impact.hockeyAssists > 0) credits.push(`${impact.hockeyAssists}HA`);
  if (impact.blocks > 0) credits.push(`${impact.blocks}D`);
  return (
    <span className="flex items-center gap-1.5 shrink-0 tabular-nums">
      {impact.holdOpps > 0 && (
        <span
          className={cn(
            "font-medium",
            impact.holds === impact.holdOpps
              ? "text-emerald-600"
              : "text-foreground/70",
          )}
          title={`Held ${impact.holds} of ${impact.holdOpps} offence points on the field`}
        >
          {impact.holds}/{impact.holdOpps}{" "}
          <span className="font-normal text-muted-foreground">holds</span>
        </span>
      )}
      {impact.breakOpps > 0 && (
        <span
          className={cn(
            "font-medium",
            impact.breaks > 0 ? "text-emerald-600" : "text-foreground/70",
          )}
          title={`Broke ${impact.breaks} of ${impact.breakOpps} defence points on the field`}
        >
          {impact.breaks}/{impact.breakOpps}{" "}
          <span className="font-normal text-muted-foreground">breaks</span>
        </span>
      )}
      {credits.length > 0 && (
        <span className="font-medium text-foreground/70">
          {credits.join(" ")}
        </span>
      )}
      {impact.turnovers > 0 && (
        <span
          className="font-medium text-amber-600"
          title={`${impact.turnovers} turnover${impact.turnovers === 1 ? "" : "s"} charged this game`}
        >
          {impact.turnovers}TO
        </span>
      )}
    </span>
  );
}

function pct(n: number, d: number): string {
  return `${Math.round((n / d) * 100)}%`;
}

/**
 * The day's numbers. Rates rather than counts, because the point of this line is
 * comparing two names against each other, and raw totals just rank whoever has
 * played most. Anything without a denominator is left out rather than shown as
 * a zero — no opportunities is not the same as failed opportunities.
 */
function FormStrip({ form }: { form: PlayerForm | undefined }) {
  if (!hasForm(form) || !form) return null;
  const items: { key: string; value: string; label: string; title: string }[] =
    [];

  if (form.holdOpps > 0) {
    items.push({
      key: "hold",
      value: pct(form.holds, form.holdOpps),
      label: "hold",
      title: `Held ${form.holds} of ${form.holdOpps} offence points this tournament`,
    });
  }
  if (form.breakOpps > 0) {
    items.push({
      key: "break",
      value: pct(form.breaks, form.breakOpps),
      label: "break",
      title: `Broke ${form.breaks} of ${form.breakOpps} defence points this tournament`,
    });
  }
  items.push({
    key: "scores",
    value: pct(form.scores, form.pointsPlayed),
    label: "scored",
    title: `Threw or caught the goal on ${form.scores} of the ${form.pointsPlayed} points they played`,
  });
  // Only worth the width once it has happened — a 0% giveaway rate is the
  // default state, not news.
  if (form.turnovers > 0) {
    items.push({
      key: "turnovers",
      value: (form.turnovers / form.pointsPlayed).toFixed(2),
      label: "TO/pt",
      title: `${form.turnovers} turnover${form.turnovers === 1 ? "" : "s"} over ${form.pointsPlayed} points this tournament`,
    });
  }

  return (
    <span className="flex items-center gap-1.5 min-w-0 truncate tabular-nums">
      {items.map((it: (typeof items)[number]) => (
        <span
          key={it.key}
          title={it.title}
          className="shrink-0 whitespace-nowrap text-foreground/60"
        >
          {it.value}{" "}
          <span className="font-normal text-muted-foreground">{it.label}</span>
        </span>
      ))}
    </span>
  );
}

function ReasonChips({ reasons }: { reasons: Reason[] }) {
  if (reasons.length === 0) return null;
  return (
    <span className="flex items-center gap-1 min-w-0 truncate">
      {reasons.map((r: Reason, i: number) => (
        <span key={r.label} className="flex items-center gap-1 shrink-0">
          {i > 0 && <span className="text-foreground/20">·</span>}
          <span
            title={r.detail}
            className={cn("whitespace-nowrap", REASON_TONES[r.tone])}
          >
            {r.label}
          </span>
        </span>
      ))}
    </span>
  );
}

/** How many names are sat, on the button that opens the sheet. */
function OutBadge({ count }: { count: number }) {
  return (
    <span
      className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-[3px] rounded-full bg-red-500 text-white text-[9px] font-bold leading-[14px] text-center tabular-nums"
      title={`${count} player${count === 1 ? "" : "s"} sitting out`}
    >
      {count}
    </span>
  );
}

/**
 * One half of the availability pane. Names are chips rather than rows so the
 * whole squad fits on one screen — the old list meant scrolling to find someone
 * and then hitting a 16px icon, which is the wrong shape for a decision made
 * between points with cold hands. Tapping a chip moves it to the other section.
 */
function AvailabilitySection({
  title,
  players,
  out,
  gamePointTotal,
  onToggle,
  emptyLabel,
}: {
  title: string;
  players: Player[];
  /** Whether this section holds the players sitting out. */
  out: boolean;
  gamePointTotal: number;
  onToggle: (id: string) => void;
  emptyLabel: string;
}) {
  const Icon = out ? UserPlus : UserMinus;
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}{" "}
        <span className="tabular-nums text-foreground/50">
          {players.length}
        </span>
      </p>
      {players.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {players.map((p: Player) => (
            <button
              key={p.id}
              onClick={() => onToggle(p.id)}
              title={
                out
                  ? `Bring ${p.name} back in`
                  : `Sit ${p.name} out of this game`
              }
              className={cn(
                "min-h-11 px-2.5 rounded-xl border flex items-center gap-1.5 transition-colors active:scale-[0.98]",
                out
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
                  : "border-border bg-card hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "text-sm font-medium",
                  out && "line-through decoration-red-400",
                )}
              >
                {p.name}
              </span>
              <RoleTag role={p.role} compact />
              <span
                className="text-[10px] tabular-nums text-muted-foreground"
                title={`${p.pointCount} of ${gamePointTotal} points this game`}
              >
                {p.pointCount}
              </span>
              <Icon
                className={cn(
                  "h-3.5 w-3.5 shrink-0",
                  out ? "text-red-400" : "text-muted-foreground/50",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlayView({
  game,
  players,
  initialUnavailableIds,
  lines,
  nextPointNumber,
  gamePointTotal,
  tournamentPointTotal,
  hotPlayerIds,
  consecutiveCounts,
  impacts,
  breaks,
  forms,
  run,
  ratings,
}: {
  game: Game;
  players: Player[];
  /** Players already sat out of this game, as saved. */
  initialUnavailableIds: string[];
  lines: Line[];
  nextPointNumber: number;
  /** Points played so far this game — the denominator for a player's share. */
  gamePointTotal: number;
  /** Points played so far this tournament. */
  tournamentPointTotal: number;
  hotPlayerIds: string[];
  consecutiveCounts: Record<string, number>;
  /** Per-player game contribution, keyed by player id. */
  impacts: Record<string, GameImpact>;
  /** Breaks converted and conceded this game. */
  breaks: { us: number; them: number };
  /** Tournament-so-far form, keyed by player id. */
  forms: Record<string, PlayerForm>;
  /** Current unanswered run of scores, or null at 0–0. */
  run: { count: number; byUs: boolean } | null;
  /** Measured hold/break ratings by player id. Empty until there are rated games. */
  ratings: Record<string, CandidateRatings>;
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
  const [hockeyAssistId, setHockeyAssistId] = useState<string | null>(null);
  // Which link the next name tap fills, when the caller has pointed at one.
  // null means "let the chain decide" — see activeSlot.
  const [chainTarget, setChainTarget] = useState<ChainSlot | null>(null);
  const [blocks, setBlocks] = useState<Record<string, number>>({});
  const [turnovers, setTurnovers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [subbingOutId, setSubbingOutId] = useState<string | null>(null);
  // Who is not playing this game. Seeded from what was saved, so a reload or a
  // locked phone mid-game does not put the whole squad back on the list.
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(
    () => new Set(initialUnavailableIds),
  );
  const [playerLineOverrides, setPlayerLineOverrides] = useState<
    Record<string, string[]>
  >({});
  const [manageOpen, setManageOpen] = useState(false);
  const [manageTab, setManageTab] = useState<ManageTab>("availability");
  // Mode, wind and the aggression ladder live behind one collapsed strip: all
  // three are set once and rarely touched, but their current values still have
  // to be readable without opening anything.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Mode can be flipped mid-game (a blowout in pool play becomes a chance to
  // give minutes away). Starts from the game's resolved mode.
  const [mode, setMode] = useState<LineupMode>(game.lineupMode);
  // Teams switch ends after every score, so this flips every point regardless of
  // who scored — no need to ask. null when wind is irrelevant.
  const [attackingUpwind, setAttackingUpwind] = useState<boolean | null>(
    game.startAttackingUpwind,
  );
  // null = let the situation pick the rung.
  const [rungOverride, setRungOverride] = useState<Rung | null>(null);

  const hotSet = useMemo(() => new Set(hotPlayerIds), [hotPlayerIds]);

  function effectiveLineIds(p: Player): string[] {
    return playerLineOverrides[p.id] ?? p.lineIds;
  }

  function clearBlocks(id: string) {
    setBlocks((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function clearTurnovers(id: string) {
    setTurnovers((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function addTurnover(id: string) {
    setTurnovers((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }

  // The chain fills front to back, and falls back to the first empty link.
  // Deriving it rather than tracking it means anything that empties a slot —
  // an injury, a sub, submitting the point — re-opens it for free. A hockey
  // assist behind no assist is not a thing, and the ordering gives that too:
  // the 2nd slot is only ever reached with the assist already in.
  const activeSlot: ChainSlot | null =
    chainTarget ??
    (!goalId
      ? "goal"
      : !assistId
        ? "assist"
        : !hockeyAssistId
          ? "hockeyAssist"
          : null);

  const activeSlotLabel =
    CHAIN_SLOTS.find(({ slot }) => slot === activeSlot)?.label ?? null;

  function chainHolder(slot: ChainSlot): string | null {
    if (slot === "goal") return goalId;
    if (slot === "assist") return assistId;
    return hockeyAssistId;
  }

  function assignChain(playerId: string) {
    if (!activeSlot) return;
    if (activeSlot === "hockeyAssist" && !assistId) return;
    // One player, one link — taking a slot gives up whichever they held. Nobody
    // throws to themself, so this is a rule and not just tidiness.
    if (goalId === playerId) setGoalId(null);
    if (assistId === playerId) setAssistId(null);
    if (hockeyAssistId === playerId) setHockeyAssistId(null);
    if (activeSlot === "goal") setGoalId(playerId);
    else if (activeSlot === "assist") setAssistId(playerId);
    else setHockeyAssistId(playerId);
    setChainTarget(null);
  }

  function clearChain(slot: ChainSlot) {
    if (slot === "goal") setGoalId(null);
    else if (slot === "assist") {
      setAssistId(null);
      // The pass before an assist that no longer exists isn't one either.
      setHockeyAssistId(null);
    } else setHockeyAssistId(null);
    setChainTarget(slot);
  }

  // A goal with no assist can only have been a callahan — never asked, always derived.
  const isCallahan = isCallahanPoint({
    scoredByUs,
    goalPlayerId: goalId,
    assistPlayerId: assistId,
  });

  // A callahan is by definition a block by the scorer, so it counts as one for free.
  function impliedBlocks(id: string): number {
    return isCallahan && id === goalId ? 1 : 0;
  }

  function shownBlocks(id: string): number {
    return Math.max(blocks[id] ?? 0, impliedBlocks(id));
  }

  function addBlock(id: string) {
    setBlocks((prev) => ({ ...prev, [id]: shownBlocks(id) + 1 }));
  }

  /** Drop a player out of everything the current point still holds on them. */
  function detachFromPoint(id: string) {
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (assistId === id) setAssistId(null);
    if (goalId === id) setGoalId(null);
    if (hockeyAssistId === id) setHockeyAssistId(null);
    clearBlocks(id);
    clearTurnovers(id);
  }

  // The list updates on the tap and the write goes out behind it — sitting a
  // player is a call made between points, and it should never wait on a network.
  function toggleAvailability(id: string) {
    const sittingOut = !unavailableIds.has(id);
    setUnavailableIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (sittingOut) detachFromPoint(id);
    void setGameAbsence(game.id, game.tournamentId, id, sittingOut);
  }

  function bringEveryoneIn() {
    setUnavailableIds(new Set());
    void clearGameAbsences(game.id, game.tournamentId);
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

  // Filter + sort players by fewest points (players sat out excluded). Kept in
  // fewest-points order because that order is the tie-break the suggester
  // inherits, and it is what makes FAIR mode reproduce the original picker.
  const visiblePlayers = players
    .filter((p) => !unavailableIds.has(p.id))
    .filter((p) => !selectedLine || effectiveLineIds(p).includes(selectedLine))
    .sort((a, b) => a.pointCount - b.pointCount);

  const situation = {
    ourOffense,
    attackingUpwind,
    windStrength: game.windStrength,
  };

  const hasRatings = Object.keys(ratings).length > 0;

  const candidates = visiblePlayers.map((p: Player): Candidate => ({
    id: p.id,
    role: p.role as Role,
    pool: p.pool,
    tier: p.tier,
    variance: p.variance,
    ratings: ratings[p.id],
    gamePoints: p.pointCount,
    tournamentPoints: p.tournamentPointCount,
    streak: consecutiveCounts[p.id] ?? 0,
  }));

  // Derived every render rather than memoised: it depends on availability, line
  // overrides, mode, rung and wind, and a stale memo here used to recommend
  // players who were already sat.
  const suggestion = suggestLine({
    candidates,
    mode,
    situation,
    rung: rungOverride ?? undefined,
    fairnessFloor: game.fairnessFloor ?? undefined,
  });
  const recommendedIds = new Set<string>(suggestion.playerIds);
  const rankById = new Map<string, number>(
    suggestion.playerIds.map((id: string, i: number) => [id, i + 1]),
  );

  const gamePointsPool = candidates.map((c: Candidate) => c.gamePoints);
  const minGamePoints = Math.min(...gamePointsPool, Infinity);
  const maxGamePoints = Math.max(...gamePointsPool, 0);
  const reasonsById = new Map<string, Reason[]>(
    candidates.map((c: Candidate) => [
      c.id,
      explainCandidate({
        candidate: c,
        mode,
        rung: suggestion.rung,
        situation,
        metric: suggestion.metric,
        fairnessFloor: game.fairnessFloor ?? undefined,
        minGamePoints,
        maxGamePoints,
      }),
    ]),
  );

  // Fair mode keeps the familiar fewest-points ordering; the other modes lead
  // with whoever the suggester rates highest. Either way the suggested seven
  // float to the top in pick order, so "who does it want?" needs no tap.
  const restOrder =
    mode === "FAIR"
      ? visiblePlayers
      : [...visiblePlayers].sort(
          (a: Player, b: Player) =>
            suggestion.scores[b.id] - suggestion.scores[a.id],
        );
  const displayPlayers = [
    ...restOrder
      .filter((p: Player) => recommendedIds.has(p.id))
      .sort(
        (a: Player, b: Player) =>
          (rankById.get(a.id) ?? 0) - (rankById.get(b.id) ?? 0),
      ),
    ...restOrder.filter((p: Player) => !recommendedIds.has(p.id)),
  ];

  const availableRungs = RUNG_ORDER.filter(
    (r: Rung) => clampRung(mode, r) === r,
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
    if (hockeyAssistId === outId) setHockeyAssistId(null);
    clearBlocks(outId);
    clearTurnovers(outId);
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
      attackingUpwind,
      rung: mode === "FAIR" ? null : suggestion.rung,
      playerIds: Array.from(selectedIds),
      blocks,
      turnovers,
      scoredByUs,
      assistPlayerId: scoredByUs && assistId ? assistId : undefined,
      goalPlayerId: scoredByUs && goalId ? goalId : undefined,
      // A hockey assist without an assist in front of it is not a thing.
      hockeyAssistPlayerId:
        scoredByUs && assistId && hockeyAssistId ? hockeyAssistId : undefined,
    });

    setLastLineupIds(new Set(selectedIds));
    startTransition(() => {
      router.refresh();
    });
    // Reset for next point
    setStep("select");
    setSelectedIds(new Set());
    setOurOffense(!scoredByUs); // scored → we kick, start D; conceded → we receive, start O
    // Ends switch after every score, so direction flips no matter who scored.
    setAttackingUpwind((prev) => (prev === null ? null : !prev));
    setRungOverride(null);
    setScoredByUs(null);
    setAssistId(null);
    setGoalId(null);
    setHockeyAssistId(null);
    setChainTarget(null);
    setBlocks({});
    setTurnovers({});
    setSubbingOutId(null);
    setSubmitting(false);
  }

  async function handleUndo() {
    if (!confirm("Undo last point?")) return;
    await deleteLastPoint(game.id, game.tournamentId);
    startTransition(() => router.refresh());
  }

  // Both halves of the roster sheet, kept in roster order rather than points
  // order: the sheet is where you go to find a specific name, and a list that
  // reshuffles itself as the game goes on is the hardest kind to scan.
  const availableRoster = players.filter((p) => !unavailableIds.has(p.id));
  const sittingOut = players.filter((p) => unavailableIds.has(p.id));

  const selectedPlayers = players.filter((p) => selectedIds.has(p.id));
  const benchPlayers = players
    .filter((p) => !selectedIds.has(p.id) && !unavailableIds.has(p.id))
    .sort((a, b) => a.pointCount - b.pointCount);

  const windLabel =
    attackingUpwind === null ? null : attackingUpwind ? "Upwind" : "Downwind";
  // The number that actually says who is winning the game: holds are expected,
  // breaks are what move the scoreboard.
  const breakDiff = breaks.us - breaks.them;
  const breakLabel =
    breakDiff === 0
      ? "On serve"
      : `${breakDiff > 0 ? "+" : ""}${breakDiff} break${Math.abs(breakDiff) === 1 ? "" : "s"}`;
  // A "run" of one is just the previous point — only a streak is worth saying.
  const runLabel =
    run && run.count >= 2
      ? `${run.count} straight ${run.byUs ? "for us" : "against"}`
      : null;

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
                  className="relative text-muted-foreground p-1"
                  title="Roster"
                >
                  <Users className="h-4 w-4" />
                  {sittingOut.length > 0 && <OutBadge count={sittingOut.length} />}
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
                {/* What this point is, as chips — the two things that shape the
                    call (phase, wind) read as state, the two that describe the
                    game (breaks, run) read as a score. */}
                <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[11px] tabular-nums">
                  <span className="font-semibold text-muted-foreground">
                    Pt {nextPointNumber}
                  </span>
                  <span
                    className={cn(
                      "px-1.5 py-[1px] rounded-full border text-[10px] font-bold uppercase tracking-wide",
                      ourOffense
                        ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                        : "border-sky-300 bg-sky-50 text-sky-700",
                    )}
                  >
                    {ourOffense ? "Offense" : "Defense"}
                  </span>
                  {windLabel && (
                    <span
                      className={cn(
                        "flex items-center gap-0.5 px-1.5 py-[1px] rounded-full border text-[10px] font-semibold",
                        attackingUpwind
                          ? "border-orange-300 bg-orange-50 text-orange-700"
                          : "border-emerald-300 bg-emerald-50 text-emerald-700",
                      )}
                    >
                      <Wind className="h-2.5 w-2.5 shrink-0" />
                      {windLabel}
                    </span>
                  )}
                  <span className="text-foreground/20">·</span>
                  <span
                    className={cn(
                      "font-bold",
                      breakDiff > 0
                        ? "text-emerald-600"
                        : breakDiff < 0
                          ? "text-red-500"
                          : "text-muted-foreground",
                    )}
                    title={`${breaks.us} break${breaks.us === 1 ? "" : "s"} converted, ${breaks.them} conceded`}
                  >
                    {breakLabel}
                  </span>
                  {run && runLabel && (
                    <>
                      <span className="text-foreground/20">·</span>
                      <span
                        className={cn(
                          "font-bold",
                          run.byUs ? "text-emerald-600" : "text-red-500",
                        )}
                      >
                        {runLabel}
                      </span>
                    </>
                  )}
                </div>
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
                      <span className="flex-1 text-sm font-medium truncate">
                        {p.name}
                      </span>
                      <RoleTag role={p.role} />
                      <span
                        className="tabular-nums shrink-0 w-14 text-right leading-none"
                        title={`${p.pointCount} of ${gamePointTotal} points this game · ${p.tournamentPointCount} of ${tournamentPointTotal} this tournament`}
                      >
                        <span className="block text-xs font-semibold">
                          {p.pointCount}
                          <span className="text-muted-foreground font-normal">
                            /{gamePointTotal}
                          </span>
                        </span>
                        <span className="block text-[10px] text-muted-foreground mt-0.5">
                          {p.tournamentPointCount}/{tournamentPointTotal}
                        </span>
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
                        <span className="flex-1 text-sm font-medium truncate">
                          {p.name}
                        </span>
                        <FatigueDots recent={impacts[p.id]?.recent ?? []} />
                        <RoleTag role={p.role} />
                        <span
                          className="tabular-nums shrink-0 w-14 text-right leading-none"
                          title={`${p.pointCount} of ${gamePointTotal} points this game · ${p.tournamentPointCount} of ${tournamentPointTotal} this tournament`}
                        >
                          <span className="block text-xs font-semibold">
                            {p.pointCount}
                          </span>
                          <span className="block text-[10px] text-muted-foreground mt-0.5">
                            {p.tournamentPointCount}
                          </span>
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
                    setHockeyAssistId(null);
                    setChainTarget(null);
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

            {/* The scoring chain is three facts about the point, not a column
                per player — so it gets three slots, filled by tapping a name. */}
            {scoredByUs === true && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Scoring chain
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {CHAIN_SLOTS.map(({ slot, label }) => {
                    const holderId = chainHolder(slot);
                    const holder = holderId
                      ? players.find((p) => p.id === holderId)
                      : undefined;
                    const isActive = activeSlot === slot;
                    // Nothing to be the pass before until there is an assist.
                    const locked = slot === "hockeyAssist" && !assistId;
                    return (
                      <div key={slot} className="min-w-0">
                        <p
                          className={cn(
                            "mb-1 text-center text-[10px] font-semibold uppercase tracking-wider transition-colors",
                            isActive ? "text-primary" : "text-muted-foreground",
                            locked && "opacity-50",
                          )}
                        >
                          {label}
                        </p>
                        <div className="relative">
                          <button
                            onClick={() => setChainTarget(slot)}
                            disabled={locked}
                            className={cn(
                              "w-full h-12 rounded-xl border-2 px-2 truncate transition-all",
                              holder
                                ? "border-primary bg-primary text-primary-foreground text-sm font-bold"
                                : isActive
                                  ? "border-dashed border-primary bg-primary/5 text-primary text-[11px] font-semibold"
                                  : "border-dashed border-input text-muted-foreground/60 text-[11px] font-semibold",
                              locked && "opacity-50",
                            )}
                            title={
                              locked
                                ? "Pick the assist first"
                                : holder
                                  ? `${holder.name} — tap to pick someone else`
                                  : `Set the ${label.toLowerCase()}`
                            }
                          >
                            {holder
                              ? holder.name
                              : isActive
                                ? "Tap a name"
                                : "—"}
                          </button>
                          {holder && (
                            <button
                              onClick={() => clearChain(slot)}
                              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full border bg-background shadow-sm flex items-center justify-center text-muted-foreground"
                              title={`Clear the ${label.toLowerCase()}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="px-0.5 text-[11px] text-muted-foreground">
                  {activeSlot === "goal"
                    ? "Tap a player's name below to set the goal."
                    : activeSlot === "assist"
                      ? "Tap the assist — or leave it empty for a callahan."
                      : activeSlot === "hockeyAssist"
                        ? "Optional: tap the pass before the assist."
                        : "Chain complete. Tap a slot above to change it."}
                </p>
              </div>
            )}

            {/* Per-player counters — these really are per player, so they stay
                as columns. */}
            <div className="space-y-0.5">
              <div className="flex items-center gap-1 px-1 pb-1">
                <span className="flex-1" />
                <span className="w-5 shrink-0" />
                <span className="w-10 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  D
                </span>
                <span className="w-10 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  TO
                </span>
              </div>
              {selectedPlayers.map((p) => {
                const blockCount = shownBlocks(p.id);
                const turnoverCount = turnovers[p.id] ?? 0;
                const canClear = (blocks[p.id] ?? 0) > 0 || turnoverCount > 0;
                const chainTag = CHAIN_SLOTS.find(
                  ({ slot }) => chainHolder(slot) === p.id,
                )?.tag;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-1 px-1 py-0.5"
                  >
                    {scoredByUs === true ? (
                      <button
                        onClick={() => assignChain(p.id)}
                        disabled={!activeSlot}
                        className={cn(
                          "flex-1 min-w-0 h-9 px-1.5 rounded-lg flex items-center gap-1.5 text-left transition-colors",
                          activeSlot && "hover:bg-accent active:bg-accent",
                        )}
                        title={
                          activeSlotLabel
                            ? `Credit ${p.name} with the ${activeSlotLabel.toLowerCase()}`
                            : undefined
                        }
                      >
                        <span className="text-sm font-medium truncate">
                          {p.name}
                        </span>
                        {chainTag && (
                          <span className="shrink-0 rounded bg-primary/15 px-1 py-0.5 text-[10px] font-bold leading-none text-primary">
                            {chainTag}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="flex-1 px-1.5 text-sm font-medium truncate">
                        {p.name}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        clearBlocks(p.id);
                        clearTurnovers(p.id);
                      }}
                      className={cn(
                        "w-5 h-8 text-muted-foreground shrink-0 transition-opacity",
                        canClear
                          ? "opacity-100"
                          : "opacity-0 pointer-events-none",
                      )}
                      tabIndex={canClear ? 0 : -1}
                      aria-hidden={!canClear}
                      title={`Clear ${p.name}'s Ds and turnovers`}
                    >
                      <X className="h-3.5 w-3.5 mx-auto" />
                    </button>
                    <button
                      onClick={() => addBlock(p.id)}
                      className={cn(
                        "w-10 h-8 rounded-lg text-xs font-bold border-2 transition-all shrink-0 flex items-center justify-center gap-0.5",
                        blockCount > 0
                          ? "border-sky-500 bg-sky-500 text-white"
                          : "border-input text-muted-foreground hover:bg-accent",
                      )}
                      title={
                        impliedBlocks(p.id) > 0 && (blocks[p.id] ?? 0) === 0
                          ? "Callahan — block credited automatically"
                          : blockCount > 0
                            ? `${blockCount} D${blockCount > 1 ? "s" : ""} — tap to add another`
                            : "Credit a defensive block"
                      }
                    >
                      <Shield className="h-3.5 w-3.5" />
                      {blockCount > 1 && (
                        <span className="tabular-nums">{blockCount}</span>
                      )}
                    </button>
                    <button
                      onClick={() => addTurnover(p.id)}
                      className={cn(
                        "w-10 h-8 rounded-lg text-xs font-bold border-2 transition-all shrink-0 flex items-center justify-center gap-0.5",
                        turnoverCount > 0
                          ? "border-amber-500 bg-amber-500 text-white"
                          : "border-input text-muted-foreground hover:bg-accent",
                      )}
                      title={
                        turnoverCount > 0
                          ? `${turnoverCount} turnover${turnoverCount > 1 ? "s" : ""} — tap to add another`
                          : "Charge a drop or throwaway"
                      }
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      {turnoverCount > 1 && (
                        <span className="tabular-nums">{turnoverCount}</span>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

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
          {/* Header — two fixed rows, one collapsed settings strip, one line row */}
          <div className="w-full border-b bg-background">
            <div className="max-w-lg mx-auto px-4 pt-2 pb-2 space-y-2">
              {/* Row 1: back · score + point context · roster · undo */}
              <div className="flex items-center justify-between gap-2">
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
                <div className="min-w-0 text-center">
                  <p className="text-2xl font-black tracking-tight tabular-nums leading-none">
                    {game.scoreUs}
                    <span className="text-muted-foreground font-light mx-1.5">
                      –
                    </span>
                    {game.scoreThem}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                    vs {game.opponentName}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => setManageOpen(true)}
                    className="relative text-muted-foreground p-1.5"
                    title="Roster"
                  >
                    <Users className="h-4 w-4" />
                    {sittingOut.length > 0 && (
                      <OutBadge count={sittingOut.length} />
                    )}
                  </button>
                  <button
                    onClick={handleUndo}
                    className="text-muted-foreground p-1.5"
                    title="Undo last point"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Row 2: point context · O/D toggle */}
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground tabular-nums truncate">
                  <span
                    className={cn(
                      "font-bold",
                      breakDiff > 0
                        ? "text-emerald-600"
                        : breakDiff < 0
                          ? "text-red-500"
                          : "text-muted-foreground",
                    )}
                    title={`${breaks.us} break${breaks.us === 1 ? "" : "s"} converted, ${breaks.them} conceded`}
                  >
                    {breakLabel}
                  </span>
                  {run && runLabel && (
                    <>
                      <span className="text-foreground/20">·</span>
                      <span
                        className={cn(
                          "font-bold",
                          run.byUs ? "text-emerald-600" : "text-red-500",
                        )}
                      >
                        {runLabel}
                      </span>
                    </>
                  )}
                </p>
                <div className="flex items-center bg-muted rounded-full p-0.5 shrink-0">
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

              {/* Row 3: the one settings strip — mode, wind, aggression ladder */}
              <div className="rounded-xl border bg-card">
                <button
                  onClick={() => setSettingsOpen((v) => !v)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 min-w-0 text-[11px] font-semibold truncate">
                    {MODE_LABELS[mode]}
                    {windLabel && (
                      <span className="text-muted-foreground font-medium">
                        {" · "}
                        {windLabel}
                      </span>
                    )}
                    {mode !== "FAIR" && (
                      <span className="text-muted-foreground font-medium">
                        {" · "}
                        {rungLabel(suggestion.rung, situation)}
                        {rungOverride === null ? "" : " (set)"}
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform",
                      settingsOpen && "rotate-180",
                    )}
                  />
                </button>

                {settingsOpen && (
                  <div className="px-2.5 pb-2.5 pt-0.5 space-y-2 border-t">
                    {/* Mode */}
                    <div className="flex items-center gap-1 pt-2">
                      {MODE_ORDER.map((m: LineupMode) => (
                        <button
                          key={m}
                          onClick={() => {
                            setMode(m);
                            setRungOverride(null);
                          }}
                          className={cn(
                            "flex-1 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                            mode === m
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-input hover:bg-accent",
                          )}
                        >
                          {MODE_LABELS[m]}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {MODE_HINTS[mode]}
                    </p>

                    {/* Wind */}
                    {attackingUpwind !== null && (
                      <button
                        onClick={() => setAttackingUpwind(!attackingUpwind)}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                          attackingUpwind
                            ? "border-orange-300 bg-orange-50 text-orange-700"
                            : "border-emerald-300 bg-emerald-50 text-emerald-700",
                        )}
                        title="Flips automatically each point — tap to correct"
                      >
                        <Wind className="h-3 w-3 shrink-0" />
                        Attacking {attackingUpwind ? "upwind" : "downwind"}
                      </button>
                    )}

                    {/* Aggression ladder */}
                    {mode !== "FAIR" && (
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        <button
                          onClick={() => setRungOverride(null)}
                          className={cn(
                            "px-2 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap shrink-0 transition-colors",
                            rungOverride === null
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-input hover:bg-accent",
                          )}
                        >
                          Auto · {rungLabel(suggestion.rung, situation)}
                        </button>
                        {availableRungs.map((r: Rung) => (
                          <button
                            key={r}
                            onClick={() =>
                              setRungOverride(rungOverride === r ? null : r)
                            }
                            className={cn(
                              "px-2 py-1 rounded-full text-[11px] font-medium border whitespace-nowrap shrink-0 transition-colors",
                              rungOverride === r
                                ? "bg-rose-500 text-white border-rose-500"
                                : "border-input hover:bg-accent",
                            )}
                          >
                            {rungLabel(r, situation)}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Says plainly whether measured rates are behind the call */}
                    {suggestion.metric && (
                      <p className="text-[10px] text-muted-foreground">
                        {hasRatings
                          ? `Team's best ${suggestion.metric} converters first`
                          : "No rated games yet — ranking on assigned tiers"}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Row 4: line filters — only when there is a choice to make */}
              {lines.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
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
            <div className="max-w-lg mx-auto px-4 py-2 space-y-1">
              {displayPlayers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No players in this line
                </p>
              )}
              {displayPlayers.map((player: Player) => {
                const selected = selectedIds.has(player.id);
                const isHot = hotSet.has(player.id);
                const streak = consecutiveCounts[player.id] ?? 0;
                const rank = rankById.get(player.id);
                const impact = impacts[player.id];
                const reasons = (reasonsById.get(player.id) ?? []).slice(0, 2);

                return (
                  <button
                    key={player.id}
                    onClick={() => togglePlayer(player.id)}
                    className={cn(
                      "w-full flex items-stretch gap-1.5 px-2.5 py-1 rounded-lg border text-left transition-colors active:scale-[0.995]",
                      selected
                        ? "border-foreground/60 bg-foreground/[0.04]"
                        : "border-border bg-card hover:bg-accent",
                    )}
                  >
                    {/* Selection indicator */}
                    <span
                      className={cn(
                        "h-4 w-4 rounded-full border self-center flex items-center justify-center shrink-0 transition-colors",
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground/25",
                      )}
                    >
                      {selected && <Check className="h-2.5 w-2.5" />}
                    </span>

                    {/* Self-centred, so a row with nothing to say yet keeps the
                        name level with the radio and the chips beside it. */}
                    <div className="flex-1 min-w-0 self-center">
                      {/* Identity */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span
                          className={cn(
                            "text-sm truncate",
                            rank === undefined
                              ? "font-medium text-foreground/70"
                              : "font-semibold",
                          )}
                        >
                          {player.name}
                        </span>
                        {streak >= 2 && (
                          <span
                            className={cn(
                              "flex items-center gap-0.5 shrink-0",
                              streak >= 3
                                ? "text-red-500"
                                : "text-muted-foreground",
                            )}
                            title={`${streak} consecutive points`}
                          >
                            <Timer className="h-2.5 w-2.5" />
                            <span className="text-[10px] font-semibold tabular-nums">
                              {streak}
                            </span>
                          </span>
                        )}
                        {isHot && (
                          <span
                            className="text-[11px] leading-none shrink-0"
                            title="Hot — scored recently"
                          >
                            🔥
                          </span>
                        )}
                      </div>

                      {/* This game — omitted entirely before there is anything
                          to put on it, rather than left as an empty line. */}
                      {(hasGameImpact(impact) || reasons.length > 0) && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground overflow-hidden">
                          <ImpactStrip impact={impact} />
                          <ReasonChips reasons={reasons} />
                        </div>
                      )}

                      {/* The day so far */}
                      {hasForm(forms[player.id]) && (
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground overflow-hidden">
                          <FormStrip form={forms[player.id]} />
                        </div>
                      )}
                    </div>

                    {/* Tier and recent load, stacked to match the two text lines */}
                    <span className="shrink-0 self-center flex flex-col items-end gap-1">
                      <span className="flex items-center gap-1">
                        <TierChip tier={player.tier} />
                        <RoleTag role={player.role} compact />
                      </span>
                      <FatigueDots recent={impact?.recent ?? []} />
                    </span>

                    {/* Share of play: this game over this tournament */}
                    <span
                      className="shrink-0 w-11 self-center text-right tabular-nums leading-none whitespace-nowrap"
                      title={`${player.pointCount} of ${gamePointTotal} points this game · ${player.tournamentPointCount} of ${tournamentPointTotal} this tournament`}
                    >
                      <span className="block text-sm font-semibold">
                        {player.pointCount}
                        <span className="text-muted-foreground font-normal">
                          /{gamePointTotal}
                        </span>
                      </span>
                      <span className="block text-[10px] text-muted-foreground mt-0.5">
                        {player.tournamentPointCount}/{tournamentPointTotal}
                      </span>
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
                            (id) => !unavailableIds.has(id),
                          ),
                        ),
                      )
                    }
                    className="flex-1 h-10 rounded-lg border text-sm font-medium flex items-center justify-center gap-1.5 border-border bg-card text-foreground hover:bg-accent transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Same
                  </button>
                )}
                <button
                  onClick={() => setSelectedIds(recommendedIds)}
                  className={cn(
                    "h-10 rounded-lg border text-sm font-medium flex items-center justify-center gap-1.5 border-border bg-card text-foreground hover:bg-accent transition-colors",
                    lastLineupIds.size === 7 ? "flex-1" : "w-full",
                  )}
                >
                  <Wand2 className="h-3.5 w-3.5" />
                  {mode === "FAIR"
                    ? "Take suggestion"
                    : `Take · ${rungLabel(suggestion.rung, situation)}`}
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

      {/* Roster sheet — who is playing this game, and which lines they sit in */}
      <Sheet open={manageOpen} onOpenChange={setManageOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] flex flex-col overflow-hidden"
        >
          <SheetHeader className="shrink-0">
            <SheetTitle>Roster</SheetTitle>
            <SheetDescription>
              {manageTab === "availability"
                ? "Tap a name to sit them out or bring them back. Saved to this game."
                : "Reassign lines for this game."}
            </SheetDescription>
          </SheetHeader>

          {lines.length > 0 && (
            <div className="shrink-0 px-4 pb-2">
              <div className="flex items-center bg-muted rounded-full p-0.5">
                {(
                  [
                    ["availability", "Availability"],
                    ["lines", "Lines"],
                  ] as [ManageTab, string][]
                ).map(([tab, label]: [ManageTab, string]) => (
                  <button
                    key={tab}
                    onClick={() => setManageTab(tab)}
                    className={cn(
                      "flex-1 py-1.5 rounded-full text-xs font-bold transition-all",
                      manageTab === tab
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {manageTab === "availability" || lines.length === 0 ? (
            <>
              {/* The count is the thing being managed, so it stays pinned above
                  the scroll along with the one bulk move worth a button. */}
              <div className="shrink-0 flex items-center gap-2 px-4 pb-2">
                <p className="flex-1 text-xs font-semibold tabular-nums">
                  {availableRoster.length} in
                  {sittingOut.length > 0 && (
                    <span className="text-muted-foreground font-medium">
                      {" · "}
                      {sittingOut.length} out
                    </span>
                  )}
                </p>
                {sittingOut.length > 0 && (
                  <button
                    onClick={bringEveryoneIn}
                    className="shrink-0 px-2.5 py-1 rounded-full border border-input text-[11px] font-semibold hover:bg-accent transition-colors"
                  >
                    All in
                  </button>
                )}
              </div>

              {availableRoster.length < 7 && (
                <div className="shrink-0 mx-4 mb-2 flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  Only {availableRoster.length} available — a line needs 7.
                </div>
              )}

              <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-4">
                <AvailabilitySection
                  title="Playing"
                  players={availableRoster}
                  out={false}
                  gamePointTotal={gamePointTotal}
                  onToggle={toggleAvailability}
                  emptyLabel="Nobody is available — tap a name below."
                />
                <AvailabilitySection
                  title="Sitting out"
                  players={sittingOut}
                  out
                  gamePointTotal={gamePointTotal}
                  onToggle={toggleAvailability}
                  emptyLabel="Everyone is in."
                />
              </div>
            </>
          ) : (
            <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-0">
              {players.map((p: Player) => {
                const out = unavailableIds.has(p.id);
                const currentLineIds = playerLineOverrides[p.id] ?? p.lineIds;
                return (
                  <div
                    key={p.id}
                    className={cn(
                      "py-3 border-b border-border last:border-0",
                      out && "opacity-50",
                    )}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={cn(
                          "text-sm font-medium",
                          out && "line-through",
                        )}
                      >
                        {p.name}
                      </span>
                      <RoleTag role={p.role} />
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {p.pointCount}/{gamePointTotal} pt ·{" "}
                        {p.tournamentPointCount}/{tournamentPointTotal} tourn
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {lines.map((line: Line) => {
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
                  </div>
                );
              })}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

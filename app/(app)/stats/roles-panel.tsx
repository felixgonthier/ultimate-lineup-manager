"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  pct,
  ROLES,
  ROLE_LABEL,
  ROLE_TONE,
  type Archetype,
  type ArchetypeTone,
  type PlayerAdvanced,
  type Role,
  type ShapeStats,
} from "@/lib/advanced-stats";

type Section = "archetypes" | "shapes";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "archetypes", label: "Archetypes" },
  { id: "shapes", label: "Line shapes" },
];

/** A shape needs this many points before its conversion means anything. */
const MIN_SHAPE_POINTS = 5;

/**
 * Coloured by what the label means rather than by which label it is: praise,
 * plain description, or something to look into.
 */
const ARCHETYPE_TONE: Record<ArchetypeTone, string> = {
  positive: "bg-emerald-100 text-emerald-900",
  neutral: "bg-slate-200 text-slate-800",
  watch: "bg-amber-100 text-amber-900",
};

function ArchetypeSection({
  players,
  minPoints,
}: {
  players: PlayerAdvanced[];
  minPoints: number;
}) {
  const eligible = players.filter(
    (p: PlayerAdvanced) => p.pointsPlayed >= minPoints,
  );

  if (eligible.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        No player has {minPoints}+ points under these filters.
      </p>
    );
  }

  return (
    <div>
      {ROLES.map((role: Role) => {
        const group = eligible
          .filter((p: PlayerAdvanced) => p.role === role)
          .sort(
            (a: PlayerAdvanced, b: PlayerAdvanced) =>
              b.archetypes.length - a.archetypes.length ||
              b.pointsPlayed - a.pointsPlayed,
          );
        if (group.length === 0) return null;

        return (
          <div key={role} className="border-b last:border-b-0">
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/30">
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded text-xs font-medium",
                  ROLE_TONE[role],
                )}
              >
                {ROLE_LABEL[role]}
              </span>
              <span className="text-xs text-muted-foreground">
                {group.length} player{group.length === 1 ? "" : "s"}
              </span>
            </div>

            {group.map((p: PlayerAdvanced) => (
              <div key={p.id} className="px-4 py-2.5 border-t">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium text-sm truncate">
                    {p.number != null && (
                      <span className="text-muted-foreground tabular-nums mr-1.5">
                        {p.number}
                      </span>
                    )}
                    {p.name}
                  </p>
                  <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {p.pointsPlayed} pts · {pct(p.conversion)}
                  </p>
                </div>

                {p.archetypes.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-1">
                    No standout pattern yet
                  </p>
                ) : (
                  <div className="mt-1.5 space-y-1">
                    {p.archetypes.map((a: Archetype) => (
                      <div key={a.id} className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            "px-1.5 py-0.5 rounded text-xs font-medium shrink-0",
                            ARCHETYPE_TONE[a.tone],
                          )}
                        >
                          {a.label}
                        </span>
                        <span className="text-xs text-muted-foreground leading-snug">
                          {a.detail}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ShapeRow({ shape, label }: { shape: ShapeStats; label: string }) {
  const thin = shape.points < MIN_SHAPE_POINTS;
  return (
    <div
      className={cn(
        "grid grid-cols-[1fr_auto_auto_auto_auto] items-center px-4 py-2 text-sm border-t",
        thin && "opacity-60",
      )}
    >
      <span className="font-medium tabular-nums">
        {label}
        {thin && (
          <span
            title={`Only ${shape.points} points on this shape`}
            className="text-muted-foreground"
          >
            {" "}
            ·
          </span>
        )}
      </span>
      <span className="w-10 text-center tabular-nums text-xs text-muted-foreground">
        {shape.points}
      </span>
      <span className="w-12 text-center tabular-nums">
        {pct(shape.conversion)}
      </span>
      <span className="w-12 text-center tabular-nums text-muted-foreground">
        {pct(shape.oConversion)}
      </span>
      <span className="w-12 text-center tabular-nums text-muted-foreground">
        {pct(shape.dConversion)}
      </span>
    </div>
  );
}

function ShapesSection({
  shapes,
  handlerShapes,
}: {
  shapes: ShapeStats[];
  handlerShapes: ShapeStats[];
}) {
  if (handlerShapes.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-muted-foreground">
        No points match these filters.
      </p>
    );
  }

  const header = (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] text-xs text-muted-foreground font-medium uppercase tracking-wide px-4 py-1.5 bg-muted/30">
      <span>Shape</span>
      <span className="w-10 text-center">Pts</span>
      <span className="w-12 text-center">Conv</span>
      <span className="w-12 text-center" title="Conversion on offence points">
        Hold
      </span>
      <span className="w-12 text-center" title="Conversion on defence points">
        Brk
      </span>
    </div>
  );

  return (
    <div>
      <p className="px-4 pt-3 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        By handler count
      </p>
      {header}
      {handlerShapes.map((s: ShapeStats) => (
        <ShapeRow
          key={s.key}
          shape={s}
          label={`${s.handlers} handler${s.handlers === 1 ? "" : "s"}`}
        />
      ))}

      <p className="px-4 pt-4 pb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Full make-up
      </p>
      {header}
      {shapes.map((s: ShapeStats) => (
        <ShapeRow
          key={s.key}
          shape={s}
          label={`${s.handlers}H · ${s.cutters}C · ${s.hybrids}Y`}
        />
      ))}

      <p className="px-4 py-3 text-xs text-muted-foreground leading-relaxed border-t mt-2">
        Conversion by the role make-up of the seven on the field, rather than by
        who was on it. A <span className="text-foreground">·</span> marks a shape
        played fewer than {MIN_SHAPE_POINTS} times.
      </p>
    </div>
  );
}

export function RolesPanel({
  players,
  shapes,
  handlerShapes,
  minPoints,
}: {
  players: PlayerAdvanced[];
  shapes: ShapeStats[];
  handlerShapes: ShapeStats[];
  minPoints: number;
}) {
  const [section, setSection] = useState<Section>("archetypes");

  return (
    <Card>
      <CardContent className="p-0">
        <div className="px-4 pt-4 pb-2">
          <div className="inline-flex rounded-lg bg-muted p-0.5 text-xs font-medium">
            {SECTIONS.map((s: (typeof SECTIONS)[number]) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors whitespace-nowrap",
                  section === s.id
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {section === "archetypes" ? (
          <>
            <ArchetypeSection players={players} minPoints={minPoints} />
            <p className="px-4 py-3 text-xs text-muted-foreground leading-relaxed border-t">
              Up to four labels per player, at most one from each family, so
              nobody collects two badges saying the same thing.{" "}
              <span
                className={cn(
                  "px-1 py-0.5 rounded font-medium",
                  ARCHETYPE_TONE.watch,
                )}
              >
                Amber
              </span>{" "}
              labels are diagnostic, not criticism — they flag something worth a
              look.
            </p>
          </>
        ) : (
          <ShapesSection shapes={shapes} handlerShapes={handlerShapes} />
        )}
      </CardContent>
    </Card>
  );
}

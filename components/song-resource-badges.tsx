"use client";

import { cn } from "@/lib/utils";
import { Music, Youtube, Headphones, Layers, Radio } from "lucide-react";
import type { SongResources, SongResourceType } from "@/lib/song-resources";

const RESOURCE_CONFIG: Record<SongResourceType, { label: string; Icon: any }> = {
  cifra:      { label: "Cifra",      Icon: Music },
  youtube:    { label: "YouTube",    Icon: Youtube },
  audio:      { label: "Áudio",      Icon: Radio },
  multitrack: { label: "Multitrack", Icon: Headphones },
  pad:        { label: "Pad",        Icon: Layers },
};

interface SongResourceBadgesProps {
  resources: SongResources;
  /** quais recursos mostrar — padrão: todos */
  show?: SongResourceType[];
  /** mostrar apenas disponíveis */
  onlyAvailable?: boolean;
  className?: string;
}

export function SongResourceBadges({
  resources,
  show = ["cifra", "youtube", "audio", "multitrack", "pad"],
  onlyAvailable = false,
  className,
}: SongResourceBadgesProps) {
  const entries = show.map((type) => ({ type, res: resources[type] }));
  const filtered = onlyAvailable ? entries.filter((e) => e.res.available) : entries;

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {filtered.map(({ type, res }) => {
        const { label, Icon } = RESOURCE_CONFIG[type];
        return (
          <span
            key={type}
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium border",
              res.available
                ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-400"
                : "bg-muted/50 text-muted-foreground border-border/50 opacity-50"
            )}
            title={res.available ? `${label} disponível` : `${label} não disponível`}
          >
            <Icon className="h-2.5 w-2.5" />
            {label}
          </span>
        );
      })}
    </div>
  );
}

interface PrimaryActionButtonProps {
  resources: SongResources;
  songId: string;
  className?: string;
  size?: "sm" | "md";
}

/**
 * Botão inteligente de ação primária:
 * Multitrack > YouTube > Áudio > nenhum
 */
export function PrimaryActionButton({
  resources,
  songId,
  className,
  size = "md",
}: PrimaryActionButtonProps) {
  const { primaryAction } = resources;

  if (primaryAction === "multitrack") {
    const albumId = resources.multitrack.multitrackAlbumId;
    const rented = resources.multitrack.multitrackRentalStatus === "ACTIVE";
    if (rented && albumId) {
      return (
        <a
          href={`/multitracks/${albumId}`}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors",
            "bg-emerald-600 hover:bg-emerald-700 text-white",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
            className
          )}
        >
          <Headphones className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
          Multitrack
        </a>
      );
    }
    // Tem album mas não alugou — mostrar botão de alugar
    return (
      <a
        href={`/multitracks?highlight=${albumId}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors border",
          "border-emerald-500/40 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400",
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
          className
        )}
      >
        <Headphones className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Ver Multitrack
      </a>
    );
  }

  if (primaryAction === "youtube" && resources.youtube.url) {
    return (
      <a
        href={resources.youtube.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors",
          "bg-red-600 hover:bg-red-700 text-white",
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
          className
        )}
      >
        <Youtube className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        YouTube
      </a>
    );
  }

  if (primaryAction === "audio" && resources.audio.url) {
    return (
      <a
        href={resources.audio.url}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors",
          "bg-primary hover:bg-primary/90 text-primary-foreground",
          size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
          className
        )}
      >
        <Radio className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
        Áudio
      </a>
    );
  }

  return null;
}

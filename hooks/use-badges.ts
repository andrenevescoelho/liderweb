"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface Badges {
  escalas: number;
  comunicados: number;
  chat: number;
  ensaios: number;
  aniversariantes: number;
  musicas: number;
  tickets: number;
  pendingRoles: number;
}

const EMPTY: Badges = { escalas: 0, comunicados: 0, chat: 0, ensaios: 0, aniversariantes: 0, musicas: 0, tickets: 0, pendingRoles: 0 };

const SECTIONS = ["chat", "comunicados", "musicas", "ensaios", "aniversariantes"] as const;

let _refresh: (() => void) | null = null;

export function refreshBadges() {
  _refresh?.();
}

export function markAsSeen(section: string) {
  localStorage.setItem(`badge_seen_${section}`, String(Date.now()));
  refreshBadges();
}

export function useBadges() {
  const { data: session } = useSession() || {};
  const [badges, setBadges] = useState<Badges>(EMPTY);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    _refresh = () => setVersion((v) => v + 1);
    return () => { _refresh = null; };
  }, []);

  useEffect(() => {
    if (!session?.user) return;

    const fetchBadges = async () => {
      try {
        const params = new URLSearchParams();
        for (const section of SECTIONS) {
          const ts = localStorage.getItem(`badge_seen_${section}`);
          if (ts) params.set(`seen_${section}`, ts);
        }
        const query = params.toString();
        const res = await fetch(`/api/badges${query ? `?${query}` : ""}`);
        if (res.ok) setBadges(await res.json());
      } catch { /* silent */ }
    };

    fetchBadges();
    const interval = setInterval(fetchBadges, 60_000);
    return () => clearInterval(interval);
  }, [session?.user, version]);

  return badges;
}

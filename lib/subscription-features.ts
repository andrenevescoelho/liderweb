type ModuleAccess = {
  professor: boolean;
  multitracks: number;
  split: number;
};

const DEFAULT_ACCESS: ModuleAccess = {
  professor: false,
  multitracks: 0,
  split: 0,
};

function normalizePlanName(name?: string | null) {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const PLAN_ACCESS_BY_NAME: Record<string, ModuleAccess> = {
  free: DEFAULT_ACCESS,
  gratuito: DEFAULT_ACCESS,
  starter: { professor: true, multitracks: 0, split: 0 },
  basico: { professor: true, multitracks: 0, split: 0 },
  pro: { professor: true, multitracks: 3, split: 0 },
  intermediario: { professor: true, multitracks: 3, split: 0 },
  avancado: { professor: true, multitracks: 5, split: 3 },
  igreja: { professor: true, multitracks: 10, split: 10 },
  enterprise: { professor: true, multitracks: 10, split: 10 },
};

export function getModuleAccess(features?: string[] | null, planName?: string | null): ModuleAccess {
  const parsed: ModuleAccess = { ...DEFAULT_ACCESS };

  for (const feature of features ?? []) {
    const value = String(feature ?? "").toLowerCase();

    const multitracksMatch = value.match(/multitracks?\s*:?\s*(\d+)/i);
    if (multitracksMatch?.[1]) {
      parsed.multitracks = Math.max(parsed.multitracks, Number(multitracksMatch[1]) || 0);
    }

    const splitMatch = value.match(/splits?\s*:?\s*(\d+)/i);
    if (splitMatch?.[1]) {
      parsed.split = Math.max(parsed.split, Number(splitMatch[1]) || 0);
    }

    if (value.includes("professor") || value.includes("coach") || value.includes("ia.module.access")) {
      parsed.professor = true;
    }
  }

  const hasParsedData = parsed.professor || parsed.multitracks > 0 || parsed.split > 0;
  if (hasParsedData) return parsed;

  return PLAN_ACCESS_BY_NAME[normalizePlanName(planName)] ?? { ...DEFAULT_ACCESS };
}


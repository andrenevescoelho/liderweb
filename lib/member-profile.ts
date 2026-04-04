export const MEMBER_FUNCTION_OPTIONS = [
  { value: "MINISTRO", label: "Ministro" },
  { value: "VOCAL", label: "Vocal" },
  { value: "BACKING_VOCAL", label: "Backing Vocal" },
  { value: "TECLADO", label: "Teclado" },
  { value: "VIOLAO", label: "Violão" },
  { value: "GUITARRA", label: "Guitarra" },
  { value: "BAIXO", label: "Baixo" },
  { value: "BATERIA", label: "Bateria" },
  { value: "PERCUSSAO", label: "Percussão" },
  { value: "SOPRO", label: "Sopro" },
  { value: "SOM", label: "Som" },
  { value: "MIDIA", label: "Mídia" },
  { value: "OUTRO", label: "Outro" },
] as const;

export const SKILL_LEVEL_OPTIONS = [
  { value: "BEGINNER", label: "Iniciante" },
  { value: "INTERMEDIATE", label: "Intermediário" },
  { value: "ADVANCED", label: "Avançado" },
] as const;

export const PROFILE_VOICE_TYPE_OPTIONS = [
  { value: "soprano", label: "Soprano" },
  { value: "contralto", label: "Contralto" },
  { value: "tenor", label: "Tenor" },
  { value: "baritono", label: "Barítono" },
  { value: "baixo", label: "Baixo" },
] as const;

export type MemberFunctionValue = (typeof MEMBER_FUNCTION_OPTIONS)[number]["value"];
export type SkillLevelValue = (typeof SKILL_LEVEL_OPTIONS)[number]["value"];

/** Nomes canônicos das RoleFunctions padrão de cada grupo */
export const DEFAULT_ROLE_FUNCTION_NAMES = MEMBER_FUNCTION_OPTIONS.map((o) => o.label);

/** Mapeia value (ex: "BACKING_VOCAL") → label (ex: "Backing Vocal") */
export const memberFunctionLabel = (value: string): string => {
  return (
    MEMBER_FUNCTION_OPTIONS.find((o) => o.value === value)?.label ?? value
  );
};

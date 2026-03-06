export const MEMBER_FUNCTION_OPTIONS = [
  { value: "VOCAL", label: "Vocal" },
  { value: "TECLADO", label: "Teclado" },
  { value: "VIOLAO", label: "Violão" },
  { value: "GUITARRA", label: "Guitarra" },
  { value: "BAIXO", label: "Baixo" },
  { value: "BATERIA", label: "Bateria" },
  { value: "PERCUSSAO", label: "Percussão" },
  { value: "BACKING_VOCAL", label: "Backing vocal" },
  { value: "SOPRO", label: "Sopro" },
  { value: "MIDIA", label: "Mídia" },
  { value: "SOM", label: "Som" },
  { value: "LIDER", label: "Líder" },
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

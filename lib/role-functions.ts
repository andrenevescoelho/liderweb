import { prisma } from "@/lib/db";
import { MEMBER_FUNCTION_OPTIONS, MemberFunctionValue } from "@/lib/member-profile";

/**
 * Garante que todas as RoleFunctions padrão existem para o grupo.
 * Cria apenas as que ainda não existem (upsert por groupId + name).
 * Retorna um mapa { value -> RoleFunction.id }
 */
export async function ensureDefaultRoleFunctions(
  groupId: string
): Promise<Record<MemberFunctionValue, string>> {
  const existing = await prisma.roleFunction.findMany({
    where: { groupId },
    select: { id: true, name: true },
  });

  const existingMap = new Map(existing.map((r) => [r.name, r.id]));
  const result: Record<string, string> = {};

  for (const option of MEMBER_FUNCTION_OPTIONS) {
    if (existingMap.has(option.label)) {
      result[option.value] = existingMap.get(option.label)!;
    } else {
      const created = await prisma.roleFunction.create({
        data: { groupId, name: option.label },
      });
      result[option.value] = created.id;
    }
  }

  return result as Record<MemberFunctionValue, string>;
}

/**
 * Retorna as RoleFunctions do grupo como mapa { label -> id }
 */
export async function getRoleFunctionMap(
  groupId: string
): Promise<Map<string, string>> {
  const roleFunctions = await prisma.roleFunction.findMany({
    where: { groupId },
    select: { id: true, name: true },
  });
  return new Map(roleFunctions.map((r) => [r.name, r.id]));
}

/**
 * Retorna os MemberFunctions aprovados de um usuário como array de labels.
 * Ex: ["Vocal", "Teclado"]
 */
export async function getApprovedFunctionLabels(userId: string): Promise<string[]> {
  const functions = await prisma.memberFunction.findMany({
    where: { memberId: userId, isPending: false },
    include: { roleFunction: { select: { name: true } } },
  });
  return functions.map((f) => f.roleFunction.name);
}

/**
 * Retorna os MemberFunctions aprovados de um usuário como array de values (ex: "VOCAL").
 * Útil para Professor IA e escalas.
 */
export async function getApprovedFunctionValues(userId: string): Promise<MemberFunctionValue[]> {
  const labels = await getApprovedFunctionLabels(userId);
  return labels
    .map(
      (label) =>
        MEMBER_FUNCTION_OPTIONS.find((o) => o.label === label)?.value ?? null
    )
    .filter(Boolean) as MemberFunctionValue[];
}

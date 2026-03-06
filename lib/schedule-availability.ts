import { WEEKDAYS } from "@/lib/types";

const normalizeWeekday = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/-feira/g, "")
    .trim();

export const getWeekdayFromDate = (date: Date) => WEEKDAYS[date.getDay()] ?? "";

const buildAvailabilitySet = (availability: string[] | null | undefined) =>
  new Set((availability ?? []).map((day) => normalizeWeekday(String(day ?? ""))));

export const isAvailableOnWeekday = (availability: string[] | null | undefined, weekday: string) => {
  if (!availability || availability.length === 0) {
    return true;
  }

  const normalizedWeekday = normalizeWeekday(weekday);
  const availabilitySet = buildAvailabilitySet(availability);
  return availabilitySet.has(normalizedWeekday);
};

type RoleAssignment = {
  role?: string;
  memberId?: string | null;
};

type MemberAvailability = {
  id: string;
  name?: string | null;
  profile?: {
    availability?: string[];
  } | null;
};

export type ScheduleAvailabilityConflict = {
  memberId: string;
  memberName: string;
  role: string;
  weekday: string;
};

export const findScheduleAvailabilityConflicts = ({
  date,
  roles,
  members,
}: {
  date: Date;
  roles: RoleAssignment[];
  members: MemberAvailability[];
}): ScheduleAvailabilityConflict[] => {
  const weekday = getWeekdayFromDate(date);
  const membersById = new Map(members.map((member) => [member.id, member]));

  return (roles ?? [])
    .filter((role) => Boolean(role?.memberId))
    .flatMap((role) => {
      const memberId = String(role?.memberId ?? "");
      const member = membersById.get(memberId);
      if (!member) return [];

      if (isAvailableOnWeekday(member?.profile?.availability, weekday)) {
        return [];
      }

      return [
        {
          memberId,
          memberName: member?.name ?? "Membro sem nome",
          role: String(role?.role ?? "Sem papel"),
          weekday,
        },
      ];
    });
};

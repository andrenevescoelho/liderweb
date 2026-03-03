import { cn } from "@/lib/utils";

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ color?: string; name?: string; value?: string | number }>;
  label?: string;
}

export function ChartTooltip({ active, payload, label }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="dashboard-chart-tooltip min-w-[160px] p-3 text-xs">
      {label && <p className="mb-2 font-semibold text-popover-foreground">{label}</p>}
      <div className="space-y-1.5">
        {payload.map((entry, index) => (
          <div key={`${entry.name}-${index}`} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              {entry.name}
            </span>
            <span className={cn("font-semibold text-popover-foreground")}>{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

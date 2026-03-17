import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { AgentRunSummary } from "../../data/agentConfig";

interface Props {
  runs: AgentRunSummary[];
}

export function RunHistoryChart({ runs }: Props) {
  const data = runs.map((run) => {
    const date = run.startedAt?.toDate?.()
      ?? new Date(run.startedAt?.seconds ? run.startedAt.seconds * 1000 : 0);
    return {
      date: date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      signals: run.metrics.signalsStored,
      articles: run.metrics.articlesFetched,
      cost: run.cost?.total ?? 0,
      outcome: run.outcome,
    };
  });

  if (data.length === 0) {
    return (
      <p className="text-white/40 text-sm text-center py-6">
        No run history available
      </p>
    );
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="signalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="articleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
            axisLine={false}
            tickLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "rgba(0,0,0,0.8)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
              color: "white",
            }}
          />
          <Area
            type="monotone"
            dataKey="articles"
            stroke="#8b5cf6"
            fill="url(#articleGrad)"
            strokeWidth={1.5}
            name="Articles"
          />
          <Area
            type="monotone"
            dataKey="signals"
            stroke="#3b82f6"
            fill="url(#signalGrad)"
            strokeWidth={1.5}
            name="Signals"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

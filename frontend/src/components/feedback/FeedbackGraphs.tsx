import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { Card } from "../ui/Card";
import { useTheme } from "../../context/ThemeContext";
import type { FeedbackHistoryEntry } from "../../context/SessionConnectionContext";

interface FeedbackGraphsProps {
  history: FeedbackHistoryEntry[];
}

const CLUSTER_NUMERIC: Record<string, number> = {
  passive: 1,
  moderate: 2,
  active: 3,
};

const CLUSTER_LABELS: Record<number, string> = {
  1: "Passive",
  2: "Moderate",
  3: "Active",
};

const formatClusterTick = (value: number) => CLUSTER_LABELS[value] ?? "";

export const FeedbackGraphs: React.FC<FeedbackGraphsProps> = ({ history }) => {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  if (!history || history.length === 0) {
    return null;
  }

  const chartData = history.map((h) => ({
    name: `Q${h.questionNumber}`,
    accuracy: h.accuracy,
    responseTime: h.responseTime,
    cluster: CLUSTER_NUMERIC[h.cluster?.toLowerCase()] ?? 2,
    isCorrect: h.isCorrect,
  }));

  const gridColor = isDark ? "#374151" : "#f0f0f0";
  const tickColor = isDark ? "#9ca3af" : "#666";
  const tooltipBg = isDark ? "#1f2937" : "#fff";
  const tooltipBorder = isDark ? "#374151" : "#e5e7eb";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Accuracy Line Chart */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Accuracy Over Time</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: tickColor }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: tickColor }} unit="%" />
            <Tooltip
              formatter={(value: number) => [`${value}%`, "Accuracy"]}
              contentStyle={{ borderRadius: 8, fontSize: 13, backgroundColor: tooltipBg, borderColor: tooltipBorder, color: tickColor }}
            />
            <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "75%", position: "right", fontSize: 11, fill: tickColor }} />
            <Line
              type="monotone"
              dataKey="accuracy"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 4, fill: "#6366f1" }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Response Time Bar Chart */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Response Time</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: tickColor }} />
            <YAxis tick={{ fontSize: 12, fill: tickColor }} unit="s" />
            <Tooltip
              formatter={(value: number) => [`${value}s`, "Time"]}
              contentStyle={{ borderRadius: 8, fontSize: 13, backgroundColor: tooltipBg, borderColor: tooltipBorder, color: tickColor }}
            />
            <Bar dataKey="responseTime" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Cluster Timeline */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Cluster Level</h4>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: tickColor }} />
            <YAxis
              domain={[0.5, 3.5]}
              ticks={[1, 2, 3]}
              tickFormatter={formatClusterTick}
              tick={{ fontSize: 11, fill: tickColor }}
            />
            <Tooltip
              formatter={(value: number) => [CLUSTER_LABELS[value] ?? value, "Cluster"]}
              contentStyle={{ borderRadius: 8, fontSize: 13, backgroundColor: tooltipBg, borderColor: tooltipBorder, color: tickColor }}
            />
            <Area
              type="stepAfter"
              dataKey="cluster"
              stroke="#10b981"
              fill={isDark ? "#064e3b" : "#d1fae5"}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};

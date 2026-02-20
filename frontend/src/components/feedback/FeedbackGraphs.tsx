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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
      {/* Accuracy Line Chart */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Accuracy Over Time</h4>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
            <Tooltip
              formatter={(value: number) => [`${value}%`, "Accuracy"]}
              contentStyle={{ borderRadius: 8, fontSize: 13 }}
            />
            <ReferenceLine y={75} stroke="#22c55e" strokeDasharray="3 3" label={{ value: "75%", position: "right", fontSize: 11 }} />
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
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Response Time</h4>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} unit="s" />
            <Tooltip
              formatter={(value: number) => [`${value}s`, "Time"]}
              contentStyle={{ borderRadius: 8, fontSize: 13 }}
            />
            <Bar dataKey="responseTime" radius={[4, 4, 0, 0]} fill="#8b5cf6" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Cluster Timeline */}
      <Card className="p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Cluster Level</h4>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis
              domain={[0.5, 3.5]}
              ticks={[1, 2, 3]}
              tickFormatter={formatClusterTick}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value: number) => [CLUSTER_LABELS[value] ?? value, "Cluster"]}
              contentStyle={{ borderRadius: 8, fontSize: 13 }}
            />
            <Area
              type="stepAfter"
              dataKey="cluster"
              stroke="#10b981"
              fill="#d1fae5"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
};

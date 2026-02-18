import { motion } from "framer-motion";
import { StatCard, PageHeader } from "@/components/DashboardCards";
import {
  LayoutDashboard,
  Users,
  Vote,
  HeartPulse,
  TrendingUp,
  Shield,
  Scale,
  Activity,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { useGuildStats, useActivityAnalytics, useTopChannels } from "@/hooks/use-database";

const sentimentData = [
  { time: "6am", score: 72 },
  { time: "9am", score: 78 },
  { time: "12pm", score: 85 },
  { time: "3pm", score: 80 },
  { time: "6pm", score: 88 },
  { time: "9pm", score: 75 },
  { time: "12am", score: 70 },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload) return null;
  return (
    <div className="glass-card p-3 text-xs">
      <p className="text-foreground font-medium mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-muted-foreground">
          {p.name}: <span className="text-foreground font-mono">{p.value}</span>
        </p>
      ))}
    </div>
  );
};

export default function Overview() {
  const { data: stats, isLoading: statsLoading } = useGuildStats();
  const { data: activityData, isLoading: activityLoading } = useActivityAnalytics();
  const { data: topChannels, isLoading: channelsLoading } = useTopChannels();

  const governanceScore = stats ? Math.min(Math.round((stats.totalMembers / 30) + (stats.activeVotes * 5) + 50), 100) : 87;
  const participation = stats && stats.totalMembers > 0 ? Math.round((stats.weeklyActivity / (stats.totalMembers * 7)) * 100) : 64;
  const healthScore = stats ? Math.min(Math.round((stats.activeVotes * 10) + (participation * 0.5) + 50), 100) : 92;

  // Don't show full loading screen - show dashboard with loading states for individual components
  return (
    <div>
      <PageHeader
        title="Overview"
        description="Governance health at a glance"
        icon={LayoutDashboard}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Governance Score"
          value={statsLoading ? "..." : `${governanceScore.toFixed(1)}`}
          icon={Shield}
          variant="primary"
          trend="+5.2%"
          trendUp
          delay={0}
        />
        <StatCard
          title="Members"
          value={statsLoading ? "..." : stats?.totalMembers.toLocaleString() || "0"}
          icon={Users}
          variant="success"
          trend="+128"
          trendUp
          delay={0.05}
        />
        <StatCard
          title="Active Votes"
          value={statsLoading ? "..." : String(stats?.activeVotes || 0)}
          icon={Vote}
          variant="warning"
          delay={0.1}
        />
        <StatCard
          title="Health"
          value={statsLoading ? "..." : `${healthScore}%`}
          icon={HeartPulse}
          variant="success"
          trend="+3.1%"
          trendUp
          delay={0.15}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <StatCard title="Stability" value="High" icon={TrendingUp} delay={0.2} />
        <StatCard
          title="Participation"
          value={statsLoading ? "..." : `${participation}%`}
          icon={Activity}
          variant="primary"
          delay={0.25}
        />
        <StatCard title="Fairness" value="91%" icon={Scale} variant="success" delay={0.3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Weekly Activity</h3>
          {activityLoading ? (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
              Loading activity data...
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={activityData || []}>
                <XAxis dataKey="day" tick={{ fill: "hsl(220 10% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "hsl(220 10% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="messages" fill="hsl(239, 84%, 67%)" radius={[4, 4, 0, 0]} opacity={0.9} />
                <Bar dataKey="votes" fill="hsl(142, 76%, 46%)" radius={[4, 4, 0, 0]} opacity={0.9} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Sentiment Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={sentimentData}>
              <defs>
                <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(239, 84%, 67%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(239, 84%, 67%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={{ fill: "hsl(220 10% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis domain={[60, 100]} tick={{ fill: "hsl(220 10% 55%)", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="score" stroke="hsl(239, 84%, 67%)" fill="url(#sentimentGradient)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="glass-card p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Top Channels</h3>
        {channelsLoading ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
            Loading channel data...
          </div>
        ) : (
          <div className="space-y-3">
            {(topChannels || []).map((ch, i) => (
              <div key={ch.name} className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground w-6 font-mono">{i + 1}</span>
                <span className="text-sm text-foreground w-28 truncate">#{ch.name}</span>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${ch.percentage}%` }}
                    transition={{ duration: 0.6, delay: 0.5 + i * 0.1 }}
                  />
                </div>
                <span className="text-xs font-mono text-muted-foreground w-16 text-right">{ch.messages.toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

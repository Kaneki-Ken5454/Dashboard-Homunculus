import { motion } from "framer-motion";
import { PageHeader, StatCard } from "@/components/DashboardCards";
import { Users, MessageSquare, Vote, Clock, TrendingUp, Award, Crown } from "lucide-react";
import { useTopMembers, useGuildStats } from "@/hooks/use-database";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ActiveUsers() {
  const { data: topMembers, isLoading } = useTopMembers(25);
  const { data: stats } = useGuildStats();

  const topByMessages = [...(topMembers || [])].sort((a, b) => b.message_count - a.message_count).slice(0, 10);
  const topByVotes = [...(topMembers || [])].sort((a, b) => b.vote_count - a.vote_count).slice(0, 10);
  const recentlyActive = [...(topMembers || [])].sort((a, b) => new Date(b.last_active).getTime() - new Date(a.last_active).getTime()).slice(0, 10);

  const totalMessages = topMembers?.reduce((sum, m) => sum + m.message_count, 0) || 0;
  const totalVotes = topMembers?.reduce((sum, m) => sum + m.vote_count, 0) || 0;
  const avgMessages = topMembers && topMembers.length > 0 ? Math.round(totalMessages / topMembers.length) : 0;

  const formatLastActive = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div>
      <PageHeader
        title="Most Active Users"
        description="Top contributors and community leaders"
        icon={Users}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Members"
          value={stats?.totalMembers.toLocaleString() || "0"}
          icon={Users}
          variant="primary"
          delay={0}
        />
        <StatCard
          title="Total Messages"
          value={totalMessages.toLocaleString()}
          icon={MessageSquare}
          variant="success"
          delay={0.05}
        />
        <StatCard
          title="Average Messages"
          value={avgMessages.toLocaleString()}
          icon={TrendingUp}
          delay={0.1}
        />
        <StatCard
          title="Total Votes Cast"
          value={totalVotes.toLocaleString()}
          icon={Vote}
          variant="warning"
          delay={0.15}
        />
      </div>

      <Tabs defaultValue="messages" className="mb-8">
        <TabsList className="bg-muted/50 border border-border mb-6">
          <TabsTrigger value="messages" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Messages
          </TabsTrigger>
          <TabsTrigger value="votes" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Vote className="w-3.5 h-3.5 mr-1.5" /> Votes
          </TabsTrigger>
          <TabsTrigger value="recent" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Clock className="w-3.5 h-3.5 mr-1.5" /> Recent
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading members...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topByMessages.map((member, i) => (
                <UserCard key={member.id} member={member} rank={i + 1} delay={i * 0.05} metric="messages" />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="votes">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading members...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topByVotes.map((member, i) => (
                <UserCard key={member.id} member={member} rank={i + 1} delay={i * 0.05} metric="votes" />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="recent">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading members...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentlyActive.map((member, i) => (
                <UserCard key={member.id} member={member} rank={i + 1} delay={i * 0.05} metric="recent" />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-6"
      >
        <h3 className="text-sm font-semibold text-foreground mb-4">Leaderboard - All Members</h3>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading leaderboard...</div>
        ) : !topMembers || topMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No members found</div>
        ) : (
          <div className="space-y-2">
            {topMembers.map((member, i) => (
              <motion.div
                key={member.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.02 }}
                className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors"
              >
                <span className={`text-sm font-mono w-8 text-center ${
                  i < 3 ? "text-primary font-bold" : "text-muted-foreground"
                }`}>
                  #{i + 1}
                </span>
                <Avatar className="w-8 h-8">
                  <AvatarImage src={member.avatar_url || undefined} alt={member.username} />
                  <AvatarFallback className="text-xs">{member.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{member.username}</p>
                  <p className="text-xs text-muted-foreground">Last active {formatLastActive(member.last_active)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Messages</p>
                    <p className="text-sm font-mono text-foreground">{member.message_count.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Votes</p>
                    <p className="text-sm font-mono text-foreground">{member.vote_count}</p>
                  </div>
                </div>
                {i < 3 && (
                  <div className="flex-shrink-0">
                    {i === 0 && <Crown className="w-4 h-4 text-warning" />}
                    {i === 1 && <Award className="w-4 h-4 text-muted-foreground" />}
                    {i === 2 && <Award className="w-4 h-4 text-muted-foreground/60" />}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

interface UserCardProps {
  member: {
    id: string;
    username: string;
    avatar_url?: string;
    message_count: number;
    vote_count: number;
    last_active: string;
    role_ids: string[];
  };
  rank: number;
  delay: number;
  metric: 'messages' | 'votes' | 'recent';
}

function UserCard({ member, rank, delay, metric }: UserCardProps) {
  const formatLastActive = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  const getRankBadgeColor = () => {
    if (rank === 1) return "bg-warning/15 text-warning border-warning/30";
    if (rank === 2) return "bg-muted text-foreground border-border";
    if (rank === 3) return "bg-muted/60 text-muted-foreground border-border/60";
    return "bg-muted/30 text-muted-foreground border-border/30";
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-card p-4 hover-lift"
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${getRankBadgeColor()} flex-shrink-0`}>
          <span className="font-bold font-mono">{rank}</span>
        </div>
        <Avatar className="w-12 h-12">
          <AvatarImage src={member.avatar_url || undefined} alt={member.username} />
          <AvatarFallback>{member.username.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-foreground truncate">{member.username}</h4>
            {member.role_ids.includes('admin') && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Admin</Badge>
            )}
            {member.role_ids.includes('moderator') && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0">Mod</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" /> {member.message_count.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <Vote className="w-3 h-3" /> {member.vote_count}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {formatLastActive(member.last_active)}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

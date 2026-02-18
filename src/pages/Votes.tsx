import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Vote, Plus, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAllVotes } from "@/hooks/use-database";
import { toast } from "@/components/ui/sonner";

export default function Votes() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: allVotes, isLoading } = useAllVotes();

  const activeVotes = allVotes?.filter((v) => v.is_active) || [];
  const pastVotes = allVotes?.filter((v) => !v.is_active) || [];

  const handleCreateVote = () => {
    toast.success("Vote creation is disabled in demo mode");
    setShowCreate(false);
  };

  return (
    <div>
      <PageHeader
        title="Votes"
        description="Manage governance votes and polls"
        icon={Vote}
        actions={
          <Button onClick={() => setShowCreate(true)} className="bg-success hover:bg-success/90 text-success-foreground">
            <Plus className="w-4 h-4 mr-2" /> Create Vote
          </Button>
        }
      />

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Active Votes</h2>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading votes...</div>
        ) : activeVotes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No active votes</div>
        ) : (
          <div className="space-y-4">
            {activeVotes.map((vote, i) => (
              <VoteCard key={vote.id} vote={vote} delay={i * 0.05} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Vote History</h2>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading history...</div>
        ) : pastVotes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No past votes</div>
        ) : (
          <div className="space-y-4">
            {pastVotes.map((vote, i) => (
              <VoteCard key={vote.id} vote={vote} delay={0.2 + i * 0.05} />
            ))}
          </div>
        )}
      </section>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Create New Vote</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Question</Label>
              <Input placeholder="What should we vote on?" className="mt-1.5 bg-muted border-border" />
            </div>
            <div>
              <Label>Options</Label>
              <div className="space-y-2 mt-1.5">
                <Input placeholder="Option 1" className="bg-muted border-border" />
                <Input placeholder="Option 2" className="bg-muted border-border" />
              </div>
              <Button variant="ghost" size="sm" className="mt-2 text-primary text-xs">
                <Plus className="w-3 h-3 mr-1" /> Add Option
              </Button>
            </div>
            <div>
              <Label>Duration (minutes)</Label>
              <Input type="number" defaultValue={1440} className="mt-1.5 bg-muted border-border" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreateVote} className="bg-success hover:bg-success/90 text-success-foreground">Create Vote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface VoteCardProps {
  vote: {
    id: string;
    question: string;
    options: { text: string; votes: number }[];
    end_time: string;
    is_active: boolean;
    total_votes: number;
  };
  delay: number;
}

function VoteCard({ vote, delay }: VoteCardProps) {
  const totalVotes = vote.total_votes || vote.options.reduce((s, o) => s + o.votes, 0);
  const winner = [...vote.options].sort((a, b) => b.votes - a.votes)[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass-card p-5 hover-lift"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-foreground">{vote.question}</h3>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="w-3 h-3" /> {totalVotes} votes
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" /> {vote.is_active ? "Ends " + new Date(vote.end_time).toLocaleDateString() : "Ended"}
            </span>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          vote.is_active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
        }`}>
          {vote.is_active ? "Active" : "Closed"}
        </span>
      </div>

      <div className="space-y-2.5">
        {vote.options.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
          const isWinner = opt === winner;
          return (
            <div key={opt.text}>
              <div className="flex justify-between text-xs mb-1">
                <span className={`${isWinner && !vote.is_active ? "text-success font-medium" : "text-foreground"}`}>{opt.text}</span>
                <span className="font-mono text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${isWinner ? "bg-primary" : "bg-muted-foreground/30"}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.5, delay: delay + 0.1 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

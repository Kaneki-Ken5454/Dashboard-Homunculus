import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Vote, Plus, Clock, Users, CheckCircle2, XCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";

interface VoteItem {
  id: string;
  question: string;
  options: { text: string; votes: number }[];
  endTime: string;
  active: boolean;
}

const mockVotes: VoteItem[] = [
  {
    id: "1",
    question: "Should we implement proposal #42 for treasury allocation?",
    options: [
      { text: "Yes, approve", votes: 156 },
      { text: "No, reject", votes: 43 },
      { text: "Abstain", votes: 18 },
    ],
    endTime: "2026-02-20T18:00:00Z",
    active: true,
  },
  {
    id: "2",
    question: "New moderation policy: stricter rules for off-topic?",
    options: [
      { text: "Agree", votes: 89 },
      { text: "Disagree", votes: 67 },
    ],
    endTime: "2026-02-19T12:00:00Z",
    active: true,
  },
  {
    id: "3",
    question: "Community event: Game night or Movie night?",
    options: [
      { text: "Game Night", votes: 234 },
      { text: "Movie Night", votes: 189 },
    ],
    endTime: "2026-02-15T18:00:00Z",
    active: false,
  },
];

export default function Votes() {
  const [showCreate, setShowCreate] = useState(false);
  const activeVotes = mockVotes.filter((v) => v.active);
  const pastVotes = mockVotes.filter((v) => !v.active);

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
        <div className="space-y-4">
          {activeVotes.map((vote, i) => (
            <VoteCard key={vote.id} vote={vote} delay={i * 0.05} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Vote History</h2>
        <div className="space-y-4">
          {pastVotes.map((vote, i) => (
            <VoteCard key={vote.id} vote={vote} delay={0.2 + i * 0.05} />
          ))}
        </div>
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
            <Button className="bg-success hover:bg-success/90 text-success-foreground">Create Vote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VoteCard({ vote, delay }: { vote: VoteItem; delay: number }) {
  const totalVotes = vote.options.reduce((s, o) => s + o.votes, 0);
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
              <Clock className="w-3 h-3" /> {vote.active ? "Ends " + new Date(vote.endTime).toLocaleDateString() : "Ended"}
            </span>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
          vote.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
        }`}>
          {vote.active ? "Active" : "Closed"}
        </span>
      </div>

      <div className="space-y-2.5">
        {vote.options.map((opt) => {
          const pct = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;
          const isWinner = opt === winner;
          return (
            <div key={opt.text}>
              <div className="flex justify-between text-xs mb-1">
                <span className={`${isWinner && !vote.active ? "text-success font-medium" : "text-foreground"}`}>{opt.text}</span>
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

import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Zap, Plus, ToggleLeft, ToggleRight, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const mockTriggers = [
  { id: "1", trigger: "hello", response: "Hi there! How can I help?", matchType: "contains", enabled: true },
  { id: "2", trigger: "!rules", response: "Please check #rules for our community guidelines.", matchType: "exact", enabled: true },
  { id: "3", trigger: "discord.gg/", response: "⚠️ Unauthorized invite links are not allowed.", matchType: "contains", enabled: false },
  { id: "4", trigger: "!help", response: "Available commands: !rules, !info, !vote", matchType: "exact", enabled: true },
  { id: "5", trigger: "good morning", response: "Good morning! ☀️ Have a great day!", matchType: "starts_with", enabled: true },
];

const matchColors: Record<string, string> = {
  contains: "bg-primary/15 text-primary",
  exact: "bg-success/15 text-success",
  starts_with: "bg-warning/15 text-warning",
  ends_with: "bg-destructive/15 text-destructive",
  regex: "bg-muted text-muted-foreground",
};

export default function Triggers() {
  const [triggers, setTriggers] = useState(mockTriggers);

  const toggleTrigger = (id: string) => {
    setTriggers((prev) => prev.map((t) => (t.id === id ? { ...t, enabled: !t.enabled } : t)));
  };

  return (
    <div>
      <PageHeader
        title="Triggers"
        description="Manage auto-response triggers"
        icon={Zap}
        actions={
          <Button className="bg-success hover:bg-success/90 text-success-foreground">
            <Plus className="w-4 h-4 mr-2" /> Create Trigger
          </Button>
        }
      />

      <div className="space-y-3">
        {triggers.map((trigger, i) => (
          <motion.div
            key={trigger.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`glass-card p-4 hover-lift transition-opacity ${!trigger.enabled ? "opacity-50" : ""}`}
          >
            <div className="flex items-center gap-4">
              <Switch
                checked={trigger.enabled}
                onCheckedChange={() => toggleTrigger(trigger.id)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <code className="text-sm font-mono text-foreground bg-muted px-2 py-0.5 rounded">
                    {trigger.trigger}
                  </code>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${matchColors[trigger.matchType]}`}>
                    {trigger.matchType}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{trigger.response}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button className="p-1.5 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

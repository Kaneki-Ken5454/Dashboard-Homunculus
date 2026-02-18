import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Zap, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTriggers, useUpdateTrigger, useDeleteTrigger } from "@/hooks/use-database";
import { toast } from "@/components/ui/sonner";

const matchColors: Record<string, string> = {
  contains: "bg-primary/15 text-primary",
  exact: "bg-success/15 text-success",
  starts_with: "bg-warning/15 text-warning",
  ends_with: "bg-destructive/15 text-destructive",
  regex: "bg-muted text-muted-foreground",
};

export default function Triggers() {
  const { data: triggers, isLoading } = useTriggers();
  const updateTrigger = useUpdateTrigger();
  const deleteTrigger = useDeleteTrigger();

  const handleToggleTrigger = async (id: string, currentEnabled: boolean) => {
    try {
      await updateTrigger.mutateAsync({
        id,
        updates: { is_enabled: !currentEnabled },
      });
      toast.success(currentEnabled ? "Trigger disabled" : "Trigger enabled");
    } catch (error) {
      toast.error("Failed to update trigger");
      console.error(error);
    }
  };

  const handleDeleteTrigger = async (id: string) => {
    try {
      await deleteTrigger.mutateAsync(id);
      toast.success("Trigger deleted");
    } catch (error) {
      toast.error("Failed to delete trigger");
      console.error(error);
    }
  };

  return (
    <div>
      <PageHeader
        title="Triggers"
        description="Manage auto-response triggers"
        icon={Zap}
        actions={
          <Button className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => toast.info("Create trigger feature coming soon")}>
            <Plus className="w-4 h-4 mr-2" /> Create Trigger
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading triggers...</div>
      ) : !triggers || triggers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No triggers configured</div>
      ) : (
        <div className="space-y-3">
          {triggers.map((trigger, i) => (
            <motion.div
              key={trigger.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`glass-card p-4 hover-lift transition-opacity ${!trigger.is_enabled ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-4">
                <Switch
                  checked={trigger.is_enabled}
                  onCheckedChange={() => handleToggleTrigger(trigger.id, trigger.is_enabled)}
                  disabled={updateTrigger.isPending}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-sm font-mono text-foreground bg-muted px-2 py-0.5 rounded">
                      {trigger.trigger_text}
                    </code>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${matchColors[trigger.match_type]}`}>
                      {trigger.match_type}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{trigger.response}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => toast.info("Edit trigger feature coming soon")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="p-1.5 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => handleDeleteTrigger(trigger.id)}
                    disabled={deleteTrigger.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

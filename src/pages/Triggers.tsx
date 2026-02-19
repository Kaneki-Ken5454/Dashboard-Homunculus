import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Zap, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTriggers, useCreateTrigger, useUpdateTrigger, useDeleteTrigger } from "@/hooks/use-database";
import { toast } from "@/components/ui/sonner";

const matchColors: Record<string, string> = {
  contains: "bg-primary/15 text-primary",
  exact: "bg-success/15 text-success",
  starts_with: "bg-warning/15 text-warning",
  ends_with: "bg-destructive/15 text-destructive",
  regex: "bg-muted text-muted-foreground",
};

export default function Triggers() {
  const [showCreate, setShowCreate] = useState(false);
  const [triggerText, setTriggerText] = useState("");
  const [response, setResponse] = useState("");
  const [matchType, setMatchType] = useState<string>("contains");

  const { data: triggers, isLoading } = useTriggers();
  const createTrigger = useCreateTrigger();
  const updateTrigger = useUpdateTrigger();
  const deleteTrigger = useDeleteTrigger();

  const handleCreate = async () => {
    if (!triggerText || !response) { toast.error("Trigger text and response are required"); return; }
    try {
      await createTrigger.mutateAsync({ trigger_text: triggerText, response, match_type: matchType as any });
      toast.success("Trigger created");
      setShowCreate(false);
      setTriggerText(""); setResponse(""); setMatchType("contains");
    } catch (error: any) { toast.error(error.message || "Failed to create trigger"); }
  };

  const handleToggleTrigger = async (id: string, currentEnabled: boolean) => {
    try {
      await updateTrigger.mutateAsync({ id, updates: { is_enabled: !currentEnabled } });
      toast.success(currentEnabled ? "Trigger disabled" : "Trigger enabled");
    } catch { toast.error("Failed to update trigger"); }
  };

  const handleDeleteTrigger = async (id: string) => {
    try { await deleteTrigger.mutateAsync(id); toast.success("Trigger deleted"); }
    catch { toast.error("Failed to delete trigger"); }
  };

  return (
    <div>
      <PageHeader title="Triggers" description="Manage auto-response triggers"
        icon={Zap}
        actions={
          <Button className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" /> Create Trigger
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading triggers...</div>
      ) : !triggers || triggers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No triggers configured</p>
        </div>
      ) : (
        <div className="space-y-3">
          {triggers.map((trigger, i) => (
            <motion.div key={trigger.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className={`glass-card p-4 hover-lift transition-opacity ${!trigger.is_enabled ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-4">
                <Switch checked={trigger.is_enabled} onCheckedChange={() => handleToggleTrigger(trigger.id, trigger.is_enabled)} disabled={updateTrigger.isPending} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-sm font-mono text-foreground bg-muted px-2 py-0.5 rounded">{trigger.trigger_text}</code>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${matchColors[trigger.match_type]}`}>{trigger.match_type}</span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{trigger.response}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button className="p-1.5 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => handleDeleteTrigger(trigger.id)} disabled={deleteTrigger.isPending}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Create Trigger</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Trigger Text</Label>
              <Input value={triggerText} onChange={(e) => setTriggerText(e.target.value)} placeholder="hello" className="mt-1.5 bg-muted border-border font-mono text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Match Type</Label>
              <Select value={matchType} onValueChange={setMatchType}>
                <SelectTrigger className="mt-1.5 bg-muted border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="exact">Exact</SelectItem>
                  <SelectItem value="starts_with">Starts With</SelectItem>
                  <SelectItem value="ends_with">Ends With</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Response</Label>
              <Textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Hi there! 👋" rows={3} className="mt-1.5 bg-muted border-border resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createTrigger.isPending} className="bg-success hover:bg-success/90 text-success-foreground">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

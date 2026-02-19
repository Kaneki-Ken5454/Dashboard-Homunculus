import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Code, Plus, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCustomCommands, useCreateCustomCommand, useUpdateCustomCommand, useDeleteCustomCommand } from "@/hooks/use-database";
import { toast } from "@/components/ui/sonner";

const permColors: Record<string, string> = {
  everyone: "bg-success/15 text-success",
  moderator: "bg-primary/15 text-primary",
  admin: "bg-warning/15 text-warning",
  owner: "bg-destructive/15 text-destructive",
};

export default function CustomCommands() {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [response, setResponse] = useState("");
  const [permissionLevel, setPermissionLevel] = useState("everyone");
  const [cooldownSec, setCooldownSec] = useState(0);

  const { data: commands, isLoading } = useCustomCommands();
  const createCommand = useCreateCustomCommand();
  const updateCommand = useUpdateCustomCommand();
  const deleteCommand = useDeleteCustomCommand();

  const handleCreate = async () => {
    if (!name || !response) { toast.error("Name and response are required"); return; }
    try {
      await createCommand.mutateAsync({ name, description, response, permission_level: permissionLevel, cooldown_seconds: cooldownSec });
      toast.success("Command created");
      setShowCreate(false);
      setName(""); setDescription(""); setResponse(""); setPermissionLevel("everyone"); setCooldownSec(0);
    } catch (error: any) { toast.error(error.message || "Failed to create command"); }
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      await updateCommand.mutateAsync({ id, updates: { is_enabled: !currentEnabled } });
      toast.success(currentEnabled ? "Command disabled" : "Command enabled");
    } catch { toast.error("Failed to update"); }
  };

  const handleDelete = async (id: string) => {
    try { await deleteCommand.mutateAsync(id); toast.success("Command deleted"); }
    catch { toast.error("Failed to delete"); }
  };

  return (
    <div>
      <PageHeader
        title="Custom Commands"
        description="Create & manage custom bot commands, tags & autoresponders"
        icon={Code}
        actions={
          <Button onClick={() => setShowCreate(true)} className="bg-success hover:bg-success/90 text-success-foreground">
            <Plus className="w-4 h-4 mr-2" /> Create Command
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading commands...</div>
      ) : !commands || commands.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Code className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No custom commands yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {commands.map((cmd, i) => (
            <motion.div key={cmd.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              className={`glass-card p-4 hover-lift transition-opacity ${!cmd.is_enabled ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-4">
                <Switch checked={cmd.is_enabled} onCheckedChange={() => handleToggle(cmd.id, cmd.is_enabled)} disabled={updateCommand.isPending} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-sm font-mono text-foreground bg-muted px-2 py-0.5 rounded">/{cmd.name}</code>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${permColors[cmd.permission_level] || permColors.everyone}`}>
                      {cmd.permission_level}
                    </span>
                    {cmd.cooldown_seconds > 0 && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{cmd.cooldown_seconds}s cooldown</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{cmd.response}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{cmd.use_count || 0} uses</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button className="p-1.5 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => handleDelete(cmd.id)} disabled={deleteCommand.isPending}>
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
          <DialogHeader><DialogTitle>Create Custom Command</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-muted-foreground">Command Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="hello" className="mt-1.5 bg-muted border-border font-mono text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A friendly greeting" className="mt-1.5 bg-muted border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Response</Label>
              <Textarea value={response} onChange={(e) => setResponse(e.target.value)} placeholder="Hello {user}! Welcome to {server}!" rows={4} className="mt-1.5 bg-muted border-border resize-none font-mono text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Permission Level</Label>
                <Select value={permissionLevel} onValueChange={setPermissionLevel}>
                  <SelectTrigger className="mt-1.5 bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">Everyone</SelectItem>
                    <SelectItem value="moderator">Moderator</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Cooldown (seconds)</Label>
                <Input type="number" value={cooldownSec} onChange={(e) => setCooldownSec(Number(e.target.value))} className="mt-1.5 bg-muted border-border font-mono text-sm" min={0} max={300} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createCommand.isPending} className="bg-success hover:bg-success/90 text-success-foreground">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

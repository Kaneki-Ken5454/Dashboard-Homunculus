import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Smile, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReactionRoles, useCreateReactionRole, useDeleteReactionRole } from "@/hooks/use-database";
import { toast } from "@/components/ui/sonner";

export default function ReactionRoles() {
  const [showCreate, setShowCreate] = useState(false);
  const [emoji, setEmoji] = useState("");
  const [roleName, setRoleName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [messageId, setMessageId] = useState("");
  const [channelId, setChannelId] = useState("");
  const [type, setType] = useState<"reaction" | "button">("reaction");

  const { data: roles, isLoading } = useReactionRoles();
  const createRole = useCreateReactionRole();
  const deleteRole = useDeleteReactionRole();

  const handleCreate = async () => {
    if (!emoji || !roleName || !roleId || !messageId || !channelId) {
      toast.error("All fields are required");
      return;
    }
    try {
      await createRole.mutateAsync({ emoji, role_name: roleName, role_id: roleId, message_id: messageId, channel_id: channelId, type });
      toast.success("Reaction role created");
      setShowCreate(false);
      setEmoji(""); setRoleName(""); setRoleId(""); setMessageId(""); setChannelId("");
    } catch (error: any) {
      toast.error(error.message || "Failed to create reaction role");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRole.mutateAsync(id);
      toast.success("Reaction role deleted");
    } catch { toast.error("Failed to delete"); }
  };

  return (
    <div>
      <PageHeader
        title="Reaction Roles"
        description="Manage reaction & button role assignments"
        icon={Smile}
        actions={
          <Button onClick={() => setShowCreate(true)} className="bg-success hover:bg-success/90 text-success-foreground">
            <Plus className="w-4 h-4 mr-2" /> Add Role
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading reaction roles...</div>
      ) : !roles || roles.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Smile className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No reaction roles configured</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map((role, i) => (
            <motion.div key={role.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass-card p-4 hover-lift group">
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{role.emoji}</span>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${role.type === "button" ? "bg-primary/15 text-primary" : "bg-success/15 text-success"}`}>
                    {role.type}
                  </span>
                  <button onClick={() => handleDelete(role.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <h4 className="text-sm font-semibold text-foreground mb-1">{role.role_name}</h4>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Role: <code className="bg-muted px-1 rounded">{role.role_id}</code></p>
                <p>Message: <code className="bg-muted px-1 rounded">{role.message_id}</code></p>
                <p>Channel: <code className="bg-muted px-1 rounded">{role.channel_id}</code></p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle>Add Reaction Role</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Emoji</Label>
                <Input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🎮" className="mt-1.5 bg-muted border-border" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={type} onValueChange={(v: "reaction" | "button") => setType(v)}>
                  <SelectTrigger className="mt-1.5 bg-muted border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="reaction">Reaction</SelectItem>
                    <SelectItem value="button">Button</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Role Name</Label>
              <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Gamer" className="mt-1.5 bg-muted border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Role ID</Label>
              <Input value={roleId} onChange={(e) => setRoleId(e.target.value)} placeholder="123456789" className="mt-1.5 bg-muted border-border font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Message ID</Label>
              <Input value={messageId} onChange={(e) => setMessageId(e.target.value)} placeholder="123456789" className="mt-1.5 bg-muted border-border font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Channel ID</Label>
              <Input value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="123456789" className="mt-1.5 bg-muted border-border font-mono text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createRole.isPending} className="bg-success hover:bg-success/90 text-success-foreground">Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

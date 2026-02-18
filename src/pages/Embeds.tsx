import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { MessageSquare, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEmbeds, useCreateEmbed, useDeleteEmbed } from "@/hooks/use-database";
import { toast } from "@/components/ui/sonner";

export default function Embeds() {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [footer, setFooter] = useState("");

  const { data: embeds, isLoading } = useEmbeds();
  const createEmbed = useCreateEmbed();
  const deleteEmbed = useDeleteEmbed();

  const handleSaveEmbed = async () => {
    if (!name || !title) {
      toast.error("Name and title are required");
      return;
    }

    try {
      await createEmbed.mutateAsync({
        name,
        title,
        description,
        color,
        footer,
        created_by: "demo_user",
      });
      toast.success("Embed saved successfully");
      setName("");
      setTitle("");
      setDescription("");
      setColor("#6366f1");
      setFooter("");
    } catch (error: any) {
      toast.error(error.message || "Failed to save embed");
      console.error(error);
    }
  };

  const handleDeleteEmbed = async (id: string) => {
    try {
      await deleteEmbed.mutateAsync(id);
      toast.success("Embed deleted");
    } catch (error) {
      toast.error("Failed to delete embed");
      console.error(error);
    }
  };

  return (
    <div>
      <PageHeader
        title="Embed Builder"
        description="Create and manage Discord embeds"
        icon={MessageSquare}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Builder</h3>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Name (Unique ID)</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. welcome" className="mt-1.5 bg-muted border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Embed title" className="mt-1.5 bg-muted border-border" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Embed description..." rows={4} className="mt-1.5 bg-muted border-border resize-none" />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">Color</Label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border-0" />
                  <Input value={color} onChange={(e) => setColor(e.target.value)} className="bg-muted border-border font-mono text-xs" />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Footer</Label>
              <Input value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Footer text" className="mt-1.5 bg-muted border-border" />
            </div>
            <Button
              onClick={handleSaveEmbed}
              disabled={createEmbed.isPending}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              <Save className="w-4 h-4 mr-2" /> Save Embed
            </Button>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="glass-card p-6">
          <h3 className="text-sm font-semibold text-foreground mb-4">Live Preview</h3>
          <div className="rounded-lg overflow-hidden" style={{ borderLeft: `4px solid ${color}` }}>
            <div className="bg-muted/50 p-4">
              {title ? <h4 className="text-foreground font-semibold text-sm mb-1">{title}</h4> : <p className="text-muted-foreground text-xs italic">Enter a title...</p>}
              {description ? (
                <p className="text-secondary-foreground text-xs whitespace-pre-wrap">{description}</p>
              ) : (
                <p className="text-muted-foreground text-xs italic">Enter a description...</p>
              )}
              {footer && (
                <div className="border-t border-border mt-3 pt-2">
                  <p className="text-muted-foreground text-[10px]">{footer}</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Saved Embeds</h3>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading embeds...</div>
        ) : !embeds || embeds.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No saved embeds yet</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {embeds.map((embed, i) => (
              <motion.div
                key={embed.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.05 }}
                className="glass-card p-4 hover-lift cursor-pointer group"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: embed.color }} />
                  <span className="text-xs font-medium text-muted-foreground">{embed.name}</span>
                  <button
                    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    onClick={() => handleDeleteEmbed(embed.id)}
                    disabled={deleteEmbed.isPending}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <h4 className="text-sm font-semibold text-foreground mb-1">{embed.title}</h4>
                <p className="text-xs text-muted-foreground line-clamp-2">{embed.description}</p>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

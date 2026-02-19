import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Settings, Save, Terminal, Gauge, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useBotSettings, useUpdateBotSettings } from "@/hooks/use-database";
import { toast } from "@/components/ui/sonner";

const defaultModules = {
  moderation: true,
  automod: true,
  leveling: false,
  welcome: true,
  logging: true,
  tickets: true,
  music: false,
  economy: false,
};

export default function BotSettings() {
  const { data: settings, isLoading } = useBotSettings();
  const updateSettings = useUpdateBotSettings();

  const [prefix, setPrefix] = useState("!");
  const [slashEnabled, setSlashEnabled] = useState(true);
  const [cooldown, setCooldown] = useState(3);
  const [ratelimit, setRatelimit] = useState(20);
  const [modules, setModules] = useState<Record<string, boolean>>(defaultModules);

  useEffect(() => {
    if (settings) {
      setPrefix(settings.prefix || "!");
      setSlashEnabled(settings.slash_commands_enabled !== false);
      setCooldown(settings.cooldown_seconds || 3);
      setRatelimit(settings.ratelimit_per_minute || 20);
      setModules({ ...defaultModules, ...(settings.modules || {}) });
    }
  }, [settings]);

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        prefix,
        slash_commands_enabled: slashEnabled,
        cooldown_seconds: cooldown,
        ratelimit_per_minute: ratelimit,
        modules,
      });
      toast.success("Settings saved");
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
    }
  };

  const toggleModule = (key: string) => {
    setModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div>
      <PageHeader
        title="Bot Settings"
        description="Configure prefix, commands, modules & rate limits"
        icon={Settings}
        actions={
          <Button onClick={handleSave} disabled={updateSettings.isPending} className="bg-success hover:bg-success/90 text-success-foreground">
            <Save className="w-4 h-4 mr-2" /> Save Changes
          </Button>
        }
      />

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading settings...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
                <Terminal className="w-4 h-4 text-primary" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Command Settings</h3>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Bot Prefix</Label>
                <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} className="mt-1.5 bg-muted border-border font-mono text-sm" maxLength={5} />
              </div>
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm text-foreground font-medium">Slash Commands</p>
                  <p className="text-xs text-muted-foreground">Enable Discord slash command support</p>
                </div>
                <Switch checked={slashEnabled} onCheckedChange={setSlashEnabled} />
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-warning/15 flex items-center justify-center">
                <Gauge className="w-4 h-4 text-warning" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Rate Limits</h3>
            </div>
            <div className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Cooldown (seconds)</Label>
                <Input type="number" value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} className="mt-1.5 bg-muted border-border font-mono text-sm" min={0} max={300} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Rate Limit (commands/min)</Label>
                <Input type="number" value={ratelimit} onChange={(e) => setRatelimit(Number(e.target.value))} className="mt-1.5 bg-muted border-border font-mono text-sm" min={1} max={100} />
              </div>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6 lg:col-span-2">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center">
                <Shield className="w-4 h-4 text-success" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Modules</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(modules).map(([key, enabled]) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border/50">
                  <span className="text-sm text-foreground capitalize">{key}</span>
                  <Switch checked={enabled} onCheckedChange={() => toggleModule(key)} />
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Settings as SettingsIcon, Globe, Key, Server, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useGuild } from "@/hooks/use-guild";
import { db } from "@/lib/database";
import { toast } from "sonner";

export default function SettingsPage() {
  const { guildId, setGuildId } = useGuild();
  const [inputValue, setInputValue] = useState(guildId);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = () => {
    setGuildId(inputValue);
    toast.success("Guild ID saved! Dashboard will now show data for this server.");
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult('idle');
    try {
      const stats = await db.getGuildStats(inputValue.trim() || guildId);
      setTestResult('success');
      toast.success(`Connection successful! Found ${stats.totalMembers} members, ${stats.totalMessages} messages.`);
    } catch (e: any) {
      setTestResult('error');
      toast.error(`Connection failed: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Configure your dashboard connection"
        icon={SettingsIcon}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center">
              <Server className="w-4 h-4 text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Connection</h3>
          </div>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Guild ID (Discord Server ID)</Label>
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter your Discord Guild ID"
                className="mt-1.5 bg-muted border-border font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Right-click your server icon → Copy Server ID. Enable Developer Mode in Discord if needed.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSave}
                disabled={!inputValue.trim() || inputValue === guildId}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Save Guild ID
              </Button>
              <Button
                onClick={handleTest}
                disabled={testing || !inputValue.trim()}
                variant="outline"
                className="flex-1"
              >
                {testing ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</>
                ) : (
                  <><Globe className="w-4 h-4 mr-2" /> Test Connection</>
                )}
              </Button>
            </div>
            {testResult === 'success' && (
              <div className="flex items-center gap-2 text-xs text-green-500">
                <CheckCircle2 className="w-4 h-4" /> Connected successfully
              </div>
            )}
            {testResult === 'error' && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <XCircle className="w-4 h-4" /> Connection failed — check Guild ID or database
              </div>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-success/15 flex items-center justify-center">
              <Key className="w-4 h-4 text-success" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">Status</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">Active Guild ID</span>
              <span className="text-xs text-foreground font-mono">{guildId}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">Database</span>
              <span className="text-xs text-success font-medium">● NeonDB Connected</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">API</span>
              <span className="text-xs text-success font-medium">● Edge Function Active</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">Auto-Refresh</span>
              <span className="text-xs text-primary font-medium">● Polling every 30s</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-muted-foreground">Pending Guild ID</span>
              <span className="text-xs text-foreground font-mono">
                {inputValue !== guildId ? <span className="text-warning">{inputValue || '—'} (unsaved)</span> : '—'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

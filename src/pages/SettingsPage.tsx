import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Settings as SettingsIcon, Globe, Key, Server } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
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
              <Label className="text-xs text-muted-foreground">API Base URL</Label>
              <Input defaultValue="http://localhost:5000" className="mt-1.5 bg-muted border-border font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Guild ID</Label>
              <Input placeholder="Enter your Discord Guild ID" className="mt-1.5 bg-muted border-border font-mono text-xs" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">API Key</Label>
              <Input type="password" placeholder="Optional - for production access" className="mt-1.5 bg-muted border-border" />
            </div>
            <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground">
              <Globe className="w-4 h-4 mr-2" /> Test Connection
            </Button>
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
              <span className="text-xs text-muted-foreground">Database</span>
              <span className="text-xs text-success font-medium">● Connected</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">API</span>
              <span className="text-xs text-success font-medium">● Healthy</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">Bot Bridge</span>
              <span className="text-xs text-warning font-medium">● Polling</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-muted-foreground">Last Sync</span>
              <span className="text-xs text-foreground font-mono">2 min ago</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Shield, Clock, User, AlertTriangle, CheckCircle, Activity } from "lucide-react";
import { useState } from "react";

interface AuditLog {
  id: string;
  action: string;
  user: string;
  timestamp: string;
  details: string;
  severity: 'info' | 'warning' | 'error' | 'success';
}

export default function Audit() {
  const [filter, setFilter] = useState<string>('all');

  // Mock audit data
  const auditLogs: AuditLog[] = [
    {
      id: '1',
      action: 'User joined',
      user: 'john_doe#1234',
      timestamp: '2024-02-19 14:30:15',
      details: 'User joined the server',
      severity: 'info'
    },
    {
      id: '2',
      action: 'Vote created',
      user: 'admin_user#0001',
      timestamp: '2024-02-19 14:25:30',
      details: 'New governance vote: "Server rules update"',
      severity: 'success'
    },
    {
      id: '3',
      action: 'Trigger updated',
      user: 'mod_user#5678',
      timestamp: '2024-02-19 14:20:45',
      details: 'Updated trigger: "help" response',
      severity: 'info'
    },
    {
      id: '4',
      action: 'Embed deleted',
      user: 'admin_user#0001',
      timestamp: '2024-02-19 14:15:20',
      details: 'Deleted embed: "welcome_message"',
      severity: 'warning'
    },
    {
      id: '5',
      action: 'Database sync',
      user: 'system',
      timestamp: '2024-02-19 14:10:00',
      details: 'Daily database synchronization completed',
      severity: 'success'
    },
    {
      id: '6',
      action: 'Permission denied',
      user: 'unknown_user#9999',
      timestamp: '2024-02-19 14:05:10',
      details: 'Attempted to access restricted channel',
      severity: 'error'
    }
  ];

  const filteredLogs = filter === 'all' ? auditLogs : auditLogs.filter(log => log.severity === filter);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'text-destructive';
      case 'warning': return 'text-warning';
      case 'success': return 'text-success';
      case 'info': return 'text-primary';
      default: return 'text-foreground';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error': return <AlertTriangle className="w-4 h-4" />;
      case 'warning': return <AlertTriangle className="w-4 h-4" />;
      case 'success': return <CheckCircle className="w-4 h-4" />;
      case 'info': return <Activity className="w-4 h-4" />;
      default: return <Activity className="w-4 h-4" />;
    }
  };

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="System activity and security events"
        icon={Shield}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Events"
          value={auditLogs.length.toString()}
          icon={Activity}
          variant="default"
        />
        <StatCard
          title="Errors"
          value={auditLogs.filter(l => l.severity === 'error').length.toString()}
          icon={AlertTriangle}
          variant="destructive"
        />
        <StatCard
          title="Warnings"
          value={auditLogs.filter(l => l.severity === 'warning').length.toString()}
          icon={AlertTriangle}
          variant="warning"
        />
        <StatCard
          title="Success"
          value={auditLogs.filter(l => l.severity === 'success').length.toString()}
          icon={CheckCircle}
          variant="success"
        />
      </div>

      <div className="glass-card p-4 mb-6">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-foreground">Filter by:</span>
          <div className="flex gap-2">
            {['all', 'info', 'success', 'warning', 'error'].map((type) => (
              <button
                key={type}
                onClick={() => setFilter(type)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  filter === type 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredLogs.map((log, i) => (
          <motion.div
            key={log.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-4 hover-lift"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className={`p-1.5 rounded-lg bg-muted/50 ${getSeverityColor(log.severity)}`}>
                {getSeverityIcon(log.severity)}
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground">{log.action}</h4>
                <p className="text-xs text-muted-foreground">{log.details}</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <User className="w-3 h-3" />
                <span>{log.user}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                <Clock className="w-3 h-3 inline mr-1" />
                {log.timestamp}
              </span>
              <span className={`text-xs font-medium ${getSeverityColor(log.severity)}`}>
                {log.severity.toUpperCase()}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  icon: any;
  variant: "default" | "primary" | "success" | "warning" | "destructive";
}

function StatCard({ title, value, icon: Icon, variant }: StatCardProps) {
  const variantStyles = {
    default: "border-border/50",
    primary: "border-primary/30 glow-primary",
    success: "border-success/30 glow-success",
    warning: "border-warning/30",
    destructive: "border-destructive/30",
  };

  const iconVariantStyles = {
    default: "bg-muted text-muted-foreground",
    primary: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card p-4 ${variantStyles[variant]}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconVariantStyles[variant]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{title}</p>
      <p className="text-foreground text-lg font-bold">{value}</p>
    </motion.div>
  );
}
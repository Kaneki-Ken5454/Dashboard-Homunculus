import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Ticket, User, Clock, MessageSquare, CheckCircle, AlertCircle, HelpCircle } from "lucide-react";
import { useState } from "react";

interface TicketItem {
  id: string;
  title: string;
  user: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  category: string;
  createdAt: string;
  lastUpdated: string;
  messages: number;
}

export default function Tickets() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  // Mock ticket data
  const tickets: TicketItem[] = [
    {
      id: 'TCK-001',
      title: 'Bot not responding to commands',
      user: 'user123#4567',
      status: 'in_progress',
      priority: 'high',
      category: 'Bot Issues',
      createdAt: '2024-02-19 10:30:00',
      lastUpdated: '2024-02-19 14:15:00',
      messages: 5
    },
    {
      id: 'TCK-002',
      title: 'Vote creation permission error',
      user: 'moderator#1111',
      status: 'open',
      priority: 'medium',
      category: 'Permissions',
      createdAt: '2024-02-19 09:45:00',
      lastUpdated: '2024-02-19 09:45:00',
      messages: 2
    },
    {
      id: 'TCK-003',
      title: 'Embed formatting issue',
      user: 'designer#2222',
      status: 'resolved',
      priority: 'low',
      category: 'UI/UX',
      createdAt: '2024-02-18 16:20:00',
      lastUpdated: '2024-02-19 08:30:00',
      messages: 8
    },
    {
      id: 'TCK-004',
      title: 'Database connection timeout',
      user: 'admin#0000',
      status: 'in_progress',
      priority: 'urgent',
      category: 'System',
      createdAt: '2024-02-19 07:15:00',
      lastUpdated: '2024-02-19 13:45:00',
      messages: 12
    },
    {
      id: 'TCK-005',
      title: 'Trigger not working properly',
      user: 'bot_manager#3333',
      status: 'open',
      priority: 'medium',
      category: 'Automation',
      createdAt: '2024-02-19 06:30:00',
      lastUpdated: '2024-02-19 06:30:00',
      messages: 3
    }
  ];

  const filteredTickets = tickets.filter(ticket => {
    const statusMatch = statusFilter === 'all' || ticket.status === statusFilter;
    const priorityMatch = priorityFilter === 'all' || ticket.priority === priorityFilter;
    return statusMatch && priorityMatch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-warning/15 text-warning border-warning/30';
      case 'in_progress': return 'bg-primary/15 text-primary border-primary/30';
      case 'resolved': return 'bg-success/15 text-success border-success/30';
      case 'closed': return 'bg-muted text-muted-foreground border-border';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-destructive/15 text-destructive border-destructive/30';
      case 'high': return 'bg-warning/15 text-warning border-warning/30';
      case 'medium': return 'bg-primary/15 text-primary border-primary/30';
      case 'low': return 'bg-success/15 text-success border-success/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <AlertCircle className="w-3 h-3" />;
      case 'in_progress': return <Clock className="w-3 h-3" />;
      case 'resolved': return <CheckCircle className="w-3 h-3" />;
      case 'closed': return <HelpCircle className="w-3 h-3" />;
      default: return <HelpCircle className="w-3 h-3" />;
    }
  };

  return (
    <div>
      <PageHeader
        title="Support Tickets"
        description="Manage user support requests and issues"
        icon={Ticket}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Tickets"
          value={tickets.length.toString()}
          icon={Ticket}
          variant="default"
        />
        <StatCard
          title="Open"
          value={tickets.filter(t => t.status === 'open').length.toString()}
          icon={AlertCircle}
          variant="warning"
        />
        <StatCard
          title="In Progress"
          value={tickets.filter(t => t.status === 'in_progress').length.toString()}
          icon={Clock}
          variant="primary"
        />
        <StatCard
          title="Resolved"
          value={tickets.filter(t => t.status === 'resolved').length.toString()}
          icon={CheckCircle}
          variant="success"
        />
      </div>

      <div className="glass-card p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-sm font-medium text-foreground">Status:</span>
            <div className="flex gap-2 mt-2">
              {['all', 'open', 'in_progress', 'resolved', 'closed'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    statusFilter === status 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </button>
              ))}
            </div>
          </div>
          
          <div className="border-l border-border h-12 mx-2"></div>
          
          <div>
            <span className="text-sm font-medium text-foreground">Priority:</span>
            <div className="flex gap-2 mt-2">
              {['all', 'urgent', 'high', 'medium', 'low'].map((priority) => (
                <button
                  key={priority}
                  onClick={() => setPriorityFilter(priority)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    priorityFilter === priority 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {filteredTickets.map((ticket, i) => (
          <motion.div
            key={ticket.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-4 hover-lift cursor-pointer"
          >
            <div className="flex items-center gap-4 mb-3">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(ticket.status)}`}>
                  {getStatusIcon(ticket.status)}
                  <span className="ml-1">{ticket.status.replace('_', ' ')}</span>
                </span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                  {ticket.priority}
                </span>
              </div>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
                {ticket.category}
              </span>
            </div>
            
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="text-sm font-semibold text-foreground mb-1">{ticket.title}</h4>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    <span>{ticket.user}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" />
                    <span>{ticket.messages} messages</span>
                  </div>
                </div>
              </div>
              
              <div className="text-right text-xs text-muted-foreground">
                <div>Created: {ticket.createdAt}</div>
                <div>Updated: {ticket.lastUpdated}</div>
              </div>
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
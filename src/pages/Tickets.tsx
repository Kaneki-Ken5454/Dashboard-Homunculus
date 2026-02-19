import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Ticket, User, Clock, MessageSquare, CheckCircle, AlertCircle, HelpCircle, Hand, X, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useTickets, useClaimTicket, useCloseTicket, useTicketPanels, useCreateTicketPanel, useDeleteTicketPanel } from "@/hooks/use-database";
import { toast } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Tickets() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showPanelCreate, setShowPanelCreate] = useState(false);
  const [panelName, setPanelName] = useState("");
  const [panelChannel, setPanelChannel] = useState("");
  const [panelMessage, setPanelMessage] = useState("");
  const [panelLabel, setPanelLabel] = useState("Open Ticket");

  const { data: tickets, isLoading } = useTickets(undefined, statusFilter !== 'all' ? statusFilter : undefined, priorityFilter !== 'all' ? priorityFilter : undefined);
  const claimTicket = useClaimTicket();
  const closeTicket = useCloseTicket();
  const { data: panels, isLoading: panelsLoading } = useTicketPanels();
  const createPanel = useCreateTicketPanel();
  const deletePanel = useDeleteTicketPanel();

  const handleClaim = async (id: string) => {
    try { await claimTicket.mutateAsync({ id, userId: "dashboard_admin" }); toast.success("Ticket claimed"); }
    catch { toast.error("Failed to claim ticket"); }
  };

  const handleClose = async (id: string) => {
    try { await closeTicket.mutateAsync(id); toast.success("Ticket closed"); }
    catch { toast.error("Failed to close ticket"); }
  };

  const handleCreatePanel = async () => {
    if (!panelName || !panelChannel) { toast.error("Name and channel are required"); return; }
    try {
      await createPanel.mutateAsync({ name: panelName, channel_id: panelChannel, message: panelMessage, button_label: panelLabel });
      toast.success("Panel created");
      setShowPanelCreate(false);
      setPanelName(""); setPanelChannel(""); setPanelMessage(""); setPanelLabel("Open Ticket");
    } catch (error: any) { toast.error(error.message || "Failed to create panel"); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'bg-warning/15 text-warning';
      case 'in_progress': return 'bg-primary/15 text-primary';
      case 'resolved': return 'bg-success/15 text-success';
      case 'closed': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-destructive/15 text-destructive';
      case 'high': return 'bg-warning/15 text-warning';
      case 'medium': return 'bg-primary/15 text-primary';
      case 'low': return 'bg-success/15 text-success';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'open': return <AlertCircle className="w-3 h-3" />;
      case 'in_progress': return <Clock className="w-3 h-3" />;
      case 'resolved': return <CheckCircle className="w-3 h-3" />;
      default: return <HelpCircle className="w-3 h-3" />;
    }
  };

  const openCount = tickets?.filter(t => t.status === 'open').length || 0;
  const inProgressCount = tickets?.filter(t => t.status === 'in_progress').length || 0;
  const resolvedCount = tickets?.filter(t => t.status === 'resolved').length || 0;

  return (
    <div>
      <PageHeader title="Support Tickets" description="Manage user support requests, panels & transcripts" icon={Ticket} />

      <Tabs defaultValue="tickets">
        <TabsList className="bg-muted/50 border border-border mb-6">
          <TabsTrigger value="tickets" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Ticket className="w-3.5 h-3.5 mr-1.5" /> Tickets
          </TabsTrigger>
          <TabsTrigger value="panels" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <MessageSquare className="w-3.5 h-3.5 mr-1.5" /> Panels
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tickets">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
            <StatCard title="Total" value={tickets?.length || 0} icon={Ticket} variant="default" />
            <StatCard title="Open" value={openCount} icon={AlertCircle} variant="warning" />
            <StatCard title="In Progress" value={inProgressCount} icon={Clock} variant="primary" />
            <StatCard title="Resolved" value={resolvedCount} icon={CheckCircle} variant="success" />
          </div>

          <div className="glass-card p-4 mb-6">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <span className="text-sm font-medium text-foreground">Status:</span>
                <div className="flex gap-2 mt-2">
                  {['all', 'open', 'in_progress', 'resolved', 'closed'].map((s) => (
                    <button key={s} onClick={() => setStatusFilter(s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-l border-border h-12 mx-2" />
              <div>
                <span className="text-sm font-medium text-foreground">Priority:</span>
                <div className="flex gap-2 mt-2">
                  {['all', 'urgent', 'high', 'medium', 'low'].map((p) => (
                    <button key={p} onClick={() => setPriorityFilter(p)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${priorityFilter === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading tickets...</div>
          ) : !tickets || tickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No tickets found</div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket, i) => (
                <motion.div key={ticket.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass-card p-4 hover-lift">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${getStatusColor(ticket.status)}`}>
                      {getStatusIcon(ticket.status)} {ticket.status.replace('_', ' ')}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(ticket.priority)}`}>{ticket.priority}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">{ticket.category}</span>
                  </div>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-sm font-semibold text-foreground mb-1">{ticket.title}</h4>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><User className="w-3 h-3" /> {ticket.username}</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> {ticket.messages_count || 0} messages</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {ticket.status === 'open' && (
                        <Button size="sm" variant="outline" onClick={() => handleClaim(ticket.id)} disabled={claimTicket.isPending}
                          className="text-xs border-primary/30 text-primary hover:bg-primary/10">
                          <Hand className="w-3 h-3 mr-1" /> Claim
                        </Button>
                      )}
                      {(ticket.status === 'open' || ticket.status === 'in_progress') && (
                        <Button size="sm" variant="outline" onClick={() => handleClose(ticket.id)} disabled={closeTicket.isPending}
                          className="text-xs border-destructive/30 text-destructive hover:bg-destructive/10">
                          <X className="w-3 h-3 mr-1" /> Close
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground mt-2">
                    <span>Created: {new Date(ticket.created_at).toLocaleString()}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="panels">
          <div className="flex justify-end mb-4">
            <Button onClick={() => setShowPanelCreate(true)} className="bg-success hover:bg-success/90 text-success-foreground">
              <Plus className="w-4 h-4 mr-2" /> Create Panel
            </Button>
          </div>
          {panelsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading panels...</div>
          ) : !panels || panels.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No ticket panels configured</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {panels.map((panel, i) => (
                <motion.div key={panel.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="glass-card p-5 hover-lift group">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-foreground">{panel.name}</h4>
                    <button onClick={() => deletePanel.mutateAsync(panel.id).then(() => toast.success("Panel deleted")).catch(() => toast.error("Failed"))}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{panel.message || "No message configured"}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-primary/15 text-primary">{panel.button_label}</span>
                    <span className="text-[10px] text-muted-foreground">Channel: {panel.channel_id}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          <Dialog open={showPanelCreate} onOpenChange={setShowPanelCreate}>
            <DialogContent className="bg-card border-border">
              <DialogHeader><DialogTitle>Create Ticket Panel</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label className="text-xs text-muted-foreground">Panel Name</Label>
                  <Input value={panelName} onChange={(e) => setPanelName(e.target.value)} placeholder="Support" className="mt-1.5 bg-muted border-border" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Channel ID</Label>
                  <Input value={panelChannel} onChange={(e) => setPanelChannel(e.target.value)} placeholder="123456789" className="mt-1.5 bg-muted border-border font-mono text-xs" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Panel Message</Label>
                  <Input value={panelMessage} onChange={(e) => setPanelMessage(e.target.value)} placeholder="Click below to open a ticket" className="mt-1.5 bg-muted border-border" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Button Label</Label>
                  <Input value={panelLabel} onChange={(e) => setPanelLabel(e.target.value)} className="mt-1.5 bg-muted border-border" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setShowPanelCreate(false)}>Cancel</Button>
                <Button onClick={handleCreatePanel} disabled={createPanel.isPending} className="bg-success hover:bg-success/90 text-success-foreground">Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, variant }: { title: string; value: number; icon: any; variant: string }) {
  const variantStyles: Record<string, string> = {
    default: "border-border/50", primary: "border-primary/30 glow-primary",
    success: "border-success/30 glow-success", warning: "border-warning/30",
    destructive: "border-destructive/30",
  };
  const iconStyles: Record<string, string> = {
    default: "bg-muted text-muted-foreground", primary: "bg-primary/15 text-primary",
    success: "bg-success/15 text-success", warning: "bg-warning/15 text-warning",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className={`glass-card p-4 ${variantStyles[variant]}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${iconStyles[variant]}`}><Icon className="w-4 h-4" /></div>
      <p className="text-muted-foreground text-xs uppercase tracking-wider mb-1">{title}</p>
      <p className="text-foreground text-lg font-bold">{value}</p>
    </motion.div>
  );
}

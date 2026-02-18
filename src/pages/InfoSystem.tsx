import { useState } from "react";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Info, Plus, FileText, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const mockTopics = {
  common: [
    { id: "faq", title: "Frequently Asked Questions", description: "Common questions about the server", section: "General" },
    { id: "rules", title: "Server Rules", description: "Community guidelines and rules", section: "General" },
    { id: "roles", title: "Available Roles", description: "How to get roles and what they mean", section: "Roles" },
  ],
  general: [
    { id: "events", title: "Upcoming Events", description: "Calendar of community events", section: "Community" },
    { id: "links", title: "Important Links", description: "Resource links for the community", section: "Resources" },
  ],
  staff: [
    { id: "mod-guide", title: "Moderation Guide", description: "How to handle various situations", section: "Moderation" },
    { id: "escalation", title: "Escalation Process", description: "When and how to escalate issues", section: "Moderation" },
  ],
};

const categoryIcons = { common: FileText, general: Users, staff: Shield };

export default function InfoSystem() {
  return (
    <div>
      <PageHeader
        title="Info System"
        description="Manage knowledge base and info topics"
        icon={Info}
        actions={
          <Button className="bg-success hover:bg-success/90 text-success-foreground">
            <Plus className="w-4 h-4 mr-2" /> Create Topic
          </Button>
        }
      />

      <Tabs defaultValue="common">
        <TabsList className="bg-muted/50 border border-border mb-6">
          <TabsTrigger value="common" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Common
          </TabsTrigger>
          <TabsTrigger value="general" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Users className="w-3.5 h-3.5 mr-1.5" /> General
          </TabsTrigger>
          <TabsTrigger value="staff" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Shield className="w-3.5 h-3.5 mr-1.5" /> Staff
          </TabsTrigger>
        </TabsList>

        {Object.entries(mockTopics).map(([cat, topics]) => (
          <TabsContent key={cat} value={cat}>
            <div className="space-y-3">
              {topics.map((topic, i) => (
                <motion.div
                  key={topic.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card p-4 hover-lift cursor-pointer flex items-center gap-4"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">{topic.title}</h4>
                    <p className="text-xs text-muted-foreground truncate">{topic.description}</p>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                    {topic.section}
                  </span>
                </motion.div>
              ))}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

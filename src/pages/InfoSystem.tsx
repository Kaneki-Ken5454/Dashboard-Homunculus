import { motion } from "framer-motion";
import { PageHeader } from "@/components/DashboardCards";
import { Info, Plus, FileText, Users, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useInfoTopics } from "@/hooks/use-database";
import { toast } from "@/components/ui/sonner";

const categoryIcons = { common: FileText, general: Users, staff: Shield };

export default function InfoSystem() {
  const { data: commonTopics, isLoading: commonLoading } = useInfoTopics('common');
  const { data: generalTopics, isLoading: generalLoading } = useInfoTopics('general');
  const { data: staffTopics, isLoading: staffLoading } = useInfoTopics('staff');

  const categories = [
    { value: 'common', label: 'Common', Icon: FileText, topics: commonTopics, loading: commonLoading },
    { value: 'general', label: 'General', Icon: Users, topics: generalTopics, loading: generalLoading },
    { value: 'staff', label: 'Staff', Icon: Shield, topics: staffTopics, loading: staffLoading },
  ];

  return (
    <div>
      <PageHeader
        title="Info System"
        description="Manage knowledge base and info topics"
        icon={Info}
        actions={
          <Button className="bg-success hover:bg-success/90 text-success-foreground" onClick={() => toast.info("Create topic feature coming soon")}>
            <Plus className="w-4 h-4 mr-2" /> Create Topic
          </Button>
        }
      />

      <Tabs defaultValue="common">
        <TabsList className="bg-muted/50 border border-border mb-6">
          {categories.map(({ value, label, Icon }) => (
            <TabsTrigger key={value} value={value} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Icon className="w-3.5 h-3.5 mr-1.5" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {categories.map(({ value, topics, loading }) => (
          <TabsContent key={value} value={value}>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading topics...</div>
            ) : !topics || topics.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No topics in this category</div>
            ) : (
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
                      <p className="text-xs text-muted-foreground truncate">{topic.content.substring(0, 100)}...</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                      {topic.section}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

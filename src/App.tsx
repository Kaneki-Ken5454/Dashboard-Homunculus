import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { GuildProvider } from "@/hooks/use-guild";
import Overview from "./pages/Overview";
import ActiveUsers from "./pages/ActiveUsers";
import Votes from "./pages/Votes";
import Embeds from "./pages/Embeds";
import InfoSystem from "./pages/InfoSystem";
import Triggers from "./pages/Triggers";
import SettingsPage from "./pages/SettingsPage";
import Audit from "./pages/Audit";
import Tickets from "./pages/Tickets";
import BotSettings from "./pages/BotSettings";
import ReactionRoles from "./pages/ReactionRoles";
import CustomCommands from "./pages/CustomCommands";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <GuildProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <DashboardLayout>
            <ErrorBoundary>
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/active-users" element={<ActiveUsers />} />
                <Route path="/bot-settings" element={<BotSettings />} />
                <Route path="/custom-commands" element={<CustomCommands />} />
                <Route path="/reaction-roles" element={<ReactionRoles />} />
                <Route path="/votes" element={<Votes />} />
                <Route path="/embeds" element={<Embeds />} />
                <Route path="/info" element={<InfoSystem />} />
                <Route path="/triggers" element={<Triggers />} />
                <Route path="/audit" element={<Audit />} />
                <Route path="/tickets" element={<Tickets />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </ErrorBoundary>
          </DashboardLayout>
        </BrowserRouter>
      </TooltipProvider>
    </GuildProvider>
  </QueryClientProvider>
);

export default App;

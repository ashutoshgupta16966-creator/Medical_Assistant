import { type ReactNode, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { MedicalShell } from '@/components/medical-shell';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { History } from '@/pages/history';
import { Home, type ScanRecord } from '@/pages/home';
import { Chat, type ChatMessage, type ChatLanguage } from '@/pages/chat';
import NotFound from '@/pages/not-found';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

function Router() {
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatLanguage, setChatLanguage] = useState<ChatLanguage>('en');

  const addHistory = (record: ScanRecord) => {
    setHistory((current) => [{ familyMember: 'Myself', ...record }, ...current.filter((item) => item.id !== record.id)].slice(0, 10));
  };

  const updateHistory = (id: string, patch: Partial<ScanRecord>) => {
    setHistory((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <MedicalShell>
        <Switch>
          <Route path="/">
            <Home history={history} onAddHistory={addHistory} onUpdateHistory={updateHistory} />
          </Route>
          <Route path="/history">
            <History history={history} onDeleteHistory={(id) => setHistory((current) => current.filter((item) => item.id !== id))} />
          </Route>
          <Route path="/chat">
            <Chat messages={chatMessages} onAddMessage={(message) => setChatMessages((current) => [...current, message])} onClearMessages={() => setChatMessages([])} language={chatLanguage} onLanguageChange={setChatLanguage} />
          </Route>
          <Route component={NotFound} />
        </Switch>
      </MedicalShell>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

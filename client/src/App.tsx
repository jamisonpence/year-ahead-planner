import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppShell from "@/components/AppShell";
import DashboardPage from "@/pages/DashboardPage";
import CalendarPage from "@/pages/CalendarPage";
import GoalsPage from "@/pages/GoalsPage";
import ReadingPage from "@/pages/ReadingPage";
import WorkoutsPage from "@/pages/WorkoutsPage";
import RelationshipsPage from "@/pages/RelationshipsPage";
import RecipesPage from "@/pages/RecipesPage";
import MoviesPage from "@/pages/MoviesPage";
import BudgetPage from "@/pages/BudgetPage";
import PlantsPage from "@/pages/PlantsPage";
import LoginPage from "@/pages/LoginPage";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/useAuth";

function AuthenticatedApp() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/goals" component={GoalsPage} />
        <Route path="/reading" component={ReadingPage} />
        <Route path="/workouts" component={WorkoutsPage} />
        <Route path="/relationships" component={RelationshipsPage} />
        <Route path="/recipes" component={RecipesPage} />
        <Route path="/movies" component={MoviesPage} />
        <Route path="/budget" component={BudgetPage} />
        <Route path="/plants" component={PlantsPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function AppContent() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading…</div>
      </div>
    );
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route>
        {user ? <AuthenticatedApp /> : <LoginPage />}
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Router hook={useHashLocation}>
          <AppContent />
        </Router>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

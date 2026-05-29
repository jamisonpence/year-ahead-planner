import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppShell from "@/components/AppShell";
import DashboardPage from "@/pages/DashboardPage";
import FeedPage from "@/pages/FeedPage";
import DiscoverPage from "@/pages/DiscoverPage";
import CalendarPage from "@/pages/CalendarPage";
import GoalsPage from "@/pages/GoalsPage";
import TasksPage from "@/pages/TasksPage";
import ReadingPage from "@/pages/ReadingPage";
import WorkoutsPage from "@/pages/WorkoutsPage";
import RelationshipsPage from "@/pages/RelationshipsPage";
import RecipesPage from "@/pages/RecipesPage";
import MoviesPage from "@/pages/MoviesPage";
import MusicPage from "@/pages/MusicPage";
import BudgetPage from "@/pages/BudgetPage";
import PlantsPage from "@/pages/PlantsPage";
import HousekeepingPage from "@/pages/HousekeepingPage";
import SpotsPage from "@/pages/SpotsPage";
import EventsPage from "@/pages/EventsPage";
import KidsPage from "@/pages/KidsPage";
import QuotesPage from "@/pages/QuotesPage";
import ArtPage from "@/pages/ArtPage";
import JournalPage from "@/pages/JournalPage";
import HobbiesPage from "@/pages/HobbiesPage";
import HobbyDetailPage from "@/pages/HobbyDetailPage";
import HobbyPlanDetailPage from "@/pages/HobbyPlanDetailPage";
import HabitsPage from "@/pages/HabitsPage";
import FaithPage from "@/pages/FaithPage";
import HealthPage from "@/pages/HealthPage";
import PoliticsPage from "@/pages/PoliticsPage";
import LoginPage from "@/pages/LoginPage";
import SettingsPage from "@/pages/SettingsPage";
import ProfilePage from "@/pages/ProfilePage";
import MessengerPage from "@/pages/MessengerPage";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/useAuth";
import OnboardingModal from "@/components/OnboardingModal";
import InstallPrompt from "@/components/InstallPrompt";
import { PlannerProvider } from "@/state/PlannerContext";
import PlannerHome from "@/pages/planner/Home";
import PlannerSetup from "@/pages/planner/Setup";
import PlannerPreferences from "@/pages/planner/Preferences";
import PlannerPlan from "@/pages/planner/Plan";
import PlannerLibrary from "@/pages/planner/Library";
import PlannerRecipeDetail from "@/pages/planner/RecipeDetail";
import PlannerShopping from "@/pages/planner/Shopping";

function AuthenticatedApp() {
  const { user } = useAuth();
  return (
    <PlannerProvider>
    <AppShell>
      <Switch>
        <Route path="/" component={FeedPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/discover" component={DiscoverPage} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/goals" component={GoalsPage} />
        <Route path="/tasks" component={TasksPage} />
        <Route path="/reading" component={ReadingPage} />
        <Route path="/workouts" component={WorkoutsPage} />
        <Route path="/relationships" component={RelationshipsPage} />
        <Route path="/recipes" component={RecipesPage} />
        <Route path="/movies" component={MoviesPage} />
        <Route path="/music" component={MusicPage} />
        <Route path="/budget" component={BudgetPage} />
        <Route path="/plants" component={PlantsPage} />
        <Route path="/housekeeping" component={HousekeepingPage} />
        <Route path="/spots" component={SpotsPage} />
        <Route path="/travel" component={SpotsPage} />
        <Route path="/events" component={EventsPage} />
        <Route path="/kids" component={KidsPage} />
        <Route path="/quotes" component={QuotesPage} />
        <Route path="/art" component={ArtPage} />
        <Route path="/journal" component={JournalPage} />
        <Route path="/hobbies" component={HobbiesPage} />
        <Route path="/hobbies/:id/plans/:planId" component={HobbyPlanDetailPage} />
        <Route path="/hobbies/:id" component={HobbyDetailPage} />
        <Route path="/habits" component={HabitsPage} />
        <Route path="/faith" component={FaithPage} />
        <Route path="/health" component={HealthPage} />
        <Route path="/politics" component={PoliticsPage} />
        <Route path="/messenger" component={MessengerPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route path="/profile/:userId" component={ProfilePage} />
        <Route path="/meal-planner/setup" component={PlannerSetup} />
        <Route path="/meal-planner/preferences" component={PlannerPreferences} />
        <Route path="/meal-planner/plan" component={PlannerPlan} />
        <Route path="/meal-planner/library" component={PlannerLibrary} />
        <Route path="/meal-planner/recipe/:id" component={PlannerRecipeDetail} />
        <Route path="/meal-planner/shopping" component={PlannerShopping} />
        <Route path="/meal-planner" component={PlannerHome} />
        <Route component={NotFound} />
      </Switch>
      {user && !user.onboarded && <OnboardingModal userName={user.name} />}
      <InstallPrompt />
    </AppShell>
    </PlannerProvider>
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

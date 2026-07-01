import { lazy, Suspense, type ComponentType } from "react";
import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppShell from "@/components/AppShell";
// Eagerly loaded: the two screens users hit first.
import DashboardPage from "@/pages/DashboardPage";
import LoginPage from "@/pages/LoginPage";
import { useAuth } from "@/hooks/useAuth";
import OnboardingModal from "@/components/OnboardingModal";
import InstallPrompt from "@/components/InstallPrompt";
import { PlannerProvider } from "@/state/PlannerContext";
// Everything else is code-split into per-page chunks. Pages take assorted
// optional props (embedded, onClose, …), so widen to ComponentType<any> for
// compatibility with wouter's Route component prop.
function lazyPage(loader: () => Promise<{ default: ComponentType<any> }>) {
  return lazy(loader);
}
const FeedPage = lazyPage(() => import("@/pages/FeedPage"));
const DiscoverPage = lazyPage(() => import("@/pages/DiscoverPage"));
const CalendarPage = lazyPage(() => import("@/pages/CalendarPage"));
const GoalsPage = lazyPage(() => import("@/pages/GoalsPage"));
const TasksPage = lazyPage(() => import("@/pages/TasksPage"));
const ReadingPage = lazyPage(() => import("@/pages/ReadingPage"));
const WorkoutsPage = lazyPage(() => import("@/pages/WorkoutsPage"));
const RelationshipsPage = lazyPage(() => import("@/pages/RelationshipsPage"));
const RecipesPage = lazyPage(() => import("@/pages/RecipesPage"));
const MoviesPage = lazyPage(() => import("@/pages/MoviesPage"));
const MusicPage = lazyPage(() => import("@/pages/MusicPage"));
const BudgetPage = lazyPage(() => import("@/pages/BudgetPage"));
const PlantsPage = lazyPage(() => import("@/pages/PlantsPage"));
const HousekeepingPage = lazyPage(() => import("@/pages/HousekeepingPage"));
const SpotsPage = lazyPage(() => import("@/pages/SpotsPage"));
const EventsPage = lazyPage(() => import("@/pages/EventsPage"));
const KidsPage = lazyPage(() => import("@/pages/KidsPage"));
const QuotesPage = lazyPage(() => import("@/pages/QuotesPage"));
const ArtPage = lazyPage(() => import("@/pages/ArtPage"));
const JournalPage = lazyPage(() => import("@/pages/JournalPage"));
const HobbiesPage = lazyPage(() => import("@/pages/HobbiesPage"));
const HobbyDetailPage = lazyPage(() => import("@/pages/HobbyDetailPage"));
const HobbyPlanDetailPage = lazyPage(() => import("@/pages/HobbyPlanDetailPage"));
const HabitsPage = lazyPage(() => import("@/pages/HabitsPage"));
const FaithPage = lazyPage(() => import("@/pages/FaithPage"));
const HealthPage = lazyPage(() => import("@/pages/HealthPage"));
const NutritionPage = lazyPage(() => import("@/pages/NutritionPage"));
const PoliticsPage = lazyPage(() => import("@/pages/PoliticsPage"));
const SettingsPage = lazyPage(() => import("@/pages/SettingsPage"));
const ProfilePage = lazyPage(() => import("@/pages/ProfilePage"));
const MessengerPage = lazyPage(() => import("@/pages/MessengerPage"));
const NotFound = lazyPage(() => import("@/pages/not-found"));
const PlannerHome = lazyPage(() => import("@/pages/planner/Home"));
const PlannerSetup = lazyPage(() => import("@/pages/planner/Setup"));
const PlannerPreferences = lazyPage(() => import("@/pages/planner/Preferences"));
const PlannerPlan = lazyPage(() => import("@/pages/planner/Plan"));
const PlannerLibrary = lazyPage(() => import("@/pages/planner/Library"));
const PlannerRecipeDetail = lazyPage(() => import("@/pages/planner/RecipeDetail"));
const PlannerShopping = lazyPage(() => import("@/pages/planner/Shopping"));

function PageLoading() {
  return (
    <div className="min-h-[50vh] flex items-center justify-center">
      <div className="text-muted-foreground text-sm">Loading…</div>
    </div>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();
  return (
    <PlannerProvider>
    <AppShell>
      <Suspense fallback={<PageLoading />}>
      <Switch>
        <Route path="/" component={DashboardPage} />
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
        <Route path="/nutrition" component={NutritionPage} />
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
      </Suspense>
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

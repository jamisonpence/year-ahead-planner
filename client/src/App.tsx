import { useEffect, useReducer, useState, type ComponentType } from "react";
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
// Everything else is code-split into per-page chunks.
//
// NOTE: we deliberately do NOT use React.lazy/Suspense here. wouter drives
// navigation through useSyncExternalStore, whose updates are always
// synchronous — and when a sync update suspends, React can get stuck showing
// the Suspense fallback even after the chunk has loaded (the page sat on
// "Loading…" until you navigated away and back). This state-driven loader
// can't get stuck: it re-renders itself the moment the module arrives.
const pageLoaders: Array<() => Promise<unknown>> = [];

function lazyPage(loader: () => Promise<{ default: ComponentType<any> }>) {
  let Loaded: ComponentType<any> | null = null;
  const load = () =>
    loader().then((m) => {
      Loaded = m.default;
      return m;
    });
  pageLoaders.push(load);

  return function LazyPage(props: any) {
    const [, rerender] = useReducer((c: number) => c + 1, 0);
    useEffect(() => {
      if (Loaded) return;
      let mounted = true;
      load().then(
        () => { if (mounted) rerender(); },
        () => {
          // Chunk failed (usually a stale deploy: old HTML referencing chunks
          // that no longer exist). Reload once to pick up the new build.
          if (!sessionStorage.getItem("chunk-reload")) {
            sessionStorage.setItem("chunk-reload", "1");
            window.location.reload();
          }
        },
      );
      return () => { mounted = false; };
    }, []);
    if (Loaded) {
      sessionStorage.removeItem("chunk-reload");
      return <Loaded {...props} />;
    }
    return <PageLoading />;
  };
}
const LibraryPage = lazyPage(() => import("@/pages/LibraryPage"));
const MyLifosPage = lazyPage(() => import("@/pages/MyLifosPage"));
const FeedPage = lazyPage(() => import("@/pages/FeedPage"));
const DiscoverPage = lazyPage(() => import("@/pages/DiscoverPage"));
const CalendarPage = lazyPage(() => import("@/pages/CalendarPage"));
const GoalsPage = lazyPage(() => import("@/pages/GoalsPage"));
const TasksPage = lazyPage(() => import("@/pages/TasksPage"));
const ReadingPage = lazyPage(() => import("@/pages/ReadingPage"));
const WorkoutsPage = lazyPage(() => import("@/pages/WorkoutsPage"));
const HealthHubPage = lazyPage(() => import("@/pages/HealthHubPage"));
const RelationshipsPage = lazyPage(() => import("@/pages/RelationshipsPage"));
const PeoplePage = lazyPage(() => import("@/pages/PeoplePage"));
const RecipesPage = lazyPage(() => import("@/pages/RecipesPage"));
const MoviesPage = lazyPage(() => import("@/pages/MoviesPage"));
const MusicPage = lazyPage(() => import("@/pages/MusicPage"));
const BudgetPage = lazyPage(() => import("@/pages/BudgetPage"));
const PlantsPage = lazyPage(() => import("@/pages/PlantsPage"));
const HousekeepingPage = lazyPage(() => import("@/pages/HousekeepingPage"));
const SpotsPage = lazyPage(() => import("@/pages/SpotsPage"));
const PlacesTripsPage = lazyPage(() => import("@/pages/PlacesTripsPage"));
const EventsPage = lazyPage(() => import("@/pages/EventsPage"));
const KidsPage = lazyPage(() => import("@/pages/KidsPage"));
const QuotesPage = lazyPage(() => import("@/pages/QuotesPage"));
const ArtPage = lazyPage(() => import("@/pages/ArtPage"));
const JournalPage = lazyPage(() => import("@/pages/JournalPage"));
const HobbiesPage = lazyPage(() => import("@/pages/HobbiesPage"));
const HobbyDetailPage = lazyPage(() => import("@/pages/HobbyDetailPage"));
const HobbyPlanDetailPage = lazyPage(() => import("@/pages/HobbyPlanDetailPage"));
const HabitsPage = lazyPage(() => import("@/pages/HabitsPage"));
const BeliefsPage = lazyPage(() => import("@/pages/BeliefsPage"));
const FaithPage = lazyPage(() => import("@/pages/FaithPage"));
const HealthPage = lazyPage(() => import("@/pages/HealthPage"));
const NutritionPage = lazyPage(() => import("@/pages/NutritionPage"));
const PoliticsPage = lazyPage(() => import("@/pages/PoliticsPage"));
const SettingsPage = lazyPage(() => import("@/pages/SettingsPage"));
const ProfilePage = lazyPage(() => import("@/pages/ProfilePage"));
const MessengerPage = lazyPage(() => import("@/pages/MessengerPage"));
const NotFound = lazyPage(() => import("@/pages/not-found"));
const ReviewPage = lazyPage(() => import("@/pages/ReviewPage"));
const CloseDayPage = lazyPage(() => import("@/pages/CloseDayPage"));
const PlannerHome = lazyPage(() => import("@/pages/planner/Home"));
const PlannerSetup = lazyPage(() => import("@/pages/planner/Setup"));
const PlannerPreferences = lazyPage(() => import("@/pages/planner/Preferences"));
const PlannerPlan = lazyPage(() => import("@/pages/planner/Plan"));
const PlannerLibrary = lazyPage(() => import("@/pages/planner/Library"));
const PlannerRecipeDetail = lazyPage(() => import("@/pages/planner/RecipeDetail"));
const PlannerShopping = lazyPage(() => import("@/pages/planner/Shopping"));

function PageLoading() {
  // Skeleton layout: reads as "content arriving" instead of a bare spinner
  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-4 animate-pulse" aria-label="Loading page">
      <div className="space-y-2">
        <div className="h-3 w-32 rounded bg-secondary/70" />
        <div className="h-7 w-56 rounded bg-secondary" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="h-40 rounded-2xl bg-secondary/60" />
          <div className="h-28 rounded-2xl bg-secondary/40" />
        </div>
        <div className="space-y-4">
          <div className="h-32 rounded-2xl bg-secondary/50" />
          <div className="h-24 rounded-2xl bg-secondary/30" />
        </div>
      </div>
    </div>
  );
}

function AuthenticatedApp() {
  const { user } = useAuth();

  // Latch the onboarding modal: once shown, it stays until ITS OWN finish flow
  // completes. Without this, any mid-flow /api/me refetch that reports
  // onboarded=true (e.g. the QA account's first-call-only override, another
  // tab, a cache invalidation) unmounts the modal mid-setup — discarding the
  // user's selections before nav prefs are saved or navigation happens.
  const [onboardingActive, setOnboardingActive] = useState(false);
  useEffect(() => {
    if (user && !user.onboarded) setOnboardingActive(true);
  }, [user]);

  // After signing in, the browser can be left on the /login pathname while the
  // hash router takes over (e.g. mylifos.com/login#/dashboard). Normalize it so
  // URLs are clean and shareable.
  useEffect(() => {
    if (window.location.pathname === "/login") {
      window.history.replaceState(null, "", "/" + (window.location.hash || "#/"));
    }
  }, []);

  // Prefetch page chunks in the background so tab switches are instant.
  // Waits for the window load event (so it never delays initial page load),
  // then trickles the imports in small batches.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function start() {
      const queue = [...pageLoaders];
      function next() {
        if (cancelled || queue.length === 0) return;
        for (const load of queue.splice(0, 4)) load().catch(() => {});
        timer = setTimeout(next, 300);
      }
      timer = setTimeout(next, 2000);
    }

    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("load", start);
    };
  }, []);

  return (
    <PlannerProvider>
    <AppShell>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/dashboard" component={DashboardPage} />
        <Route path="/discover" component={DiscoverPage} />
        <Route path="/calendar" component={CalendarPage} />
        <Route path="/goals" component={GoalsPage} />
        <Route path="/tasks" component={TasksPage} />
        <Route path="/mylifos" component={MyLifosPage} />
        <Route path="/library" component={LibraryPage} />
        <Route path="/reading" component={ReadingPage} />
        <Route path="/health" component={HealthHubPage} />
        <Route path="/workouts" component={WorkoutsPage} />
        <Route path="/people" component={PeoplePage} />
        <Route path="/relationships" component={RelationshipsPage} />
        <Route path="/recipes" component={RecipesPage} />
        <Route path="/movies" component={MoviesPage} />
        <Route path="/music" component={MusicPage} />
        <Route path="/budget" component={BudgetPage} />
        <Route path="/plants" component={PlantsPage} />
        <Route path="/housekeeping" component={HousekeepingPage} />
        <Route path="/places" component={PlacesTripsPage} />
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
        <Route path="/beliefs" component={BeliefsPage} />
        <Route path="/faith" component={FaithPage} />
        <Route path="/nutrition" component={NutritionPage} />
        <Route path="/politics" component={PoliticsPage} />
        <Route path="/review" component={ReviewPage} />
        <Route path="/close-day" component={CloseDayPage} />
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
        {/* Aliases — every sidebar/nav name deep-links to its page */}
        <Route path="/today" component={DashboardPage} />
        <Route path="/plan" component={GoalsPage} />
        <Route path="/schedule" component={CalendarPage} />
        <Route path="/finance" component={BudgetPage} />
        <Route path="/home" component={HousekeepingPage} />
        <Route path="/media" component={LibraryPage} />
        <Route path="/interests" component={HobbiesPage} />
        <Route path="/messages" component={MessengerPage} />
        <Route path="/weekly-review" component={ReviewPage} />
        <Route component={NotFound} />
      </Switch>
      {user && onboardingActive && (
        <OnboardingModal userName={user.name} onComplete={() => setOnboardingActive(false)} />
      )}
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

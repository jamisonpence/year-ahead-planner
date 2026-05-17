#!/bin/bash
set -e
cd "$(dirname "$0")"
rm -f .git/index.lock .git/index.lock.bak .git/HEAD.lock .git/refs/heads/main.lock
git add \
  client/src/pages/GoalsPage.tsx \
  client/src/pages/WorkoutsPage.tsx \
  client/src/pages/MoviesPage.tsx \
  client/src/pages/MusicPage.tsx \
  client/src/pages/RecipesPage.tsx \
  client/src/pages/PlantsPage.tsx \
  client/src/pages/RelationshipsPage.tsx \
  client/src/pages/HousekeepingPage.tsx \
  client/src/pages/ReadingPage.tsx \
  client/src/pages/BudgetPage.tsx \
  client/src/pages/SpotsPage.tsx \
  client/src/pages/ArtPage.tsx \
  client/src/pages/FaithPage.tsx \
  client/src/pages/QuotesPage.tsx \
  client/src/pages/HealthPage.tsx \
  client/src/pages/PoliticsPage.tsx \
  client/src/pages/HobbiesPage.tsx \
  client/src/pages/JournalPage.tsx \
  client/src/pages/KidsPage.tsx \
  client/src/pages/LoginPage.tsx \
  client/src/pages/PlannerPage.tsx \
  client/src/pages/SettingsPage.tsx \
  client/src/components/AppShell.tsx \
  client/src/components/InstallPrompt.tsx \
  client/src/components/OnboardingModal.tsx \
  client/index.html \
  vite.config.ts \
  server/routes.ts \
  server/storage.ts \
  shared/schema.ts \
  landing.html \
  client/public/icons/icon-72x72.png \
  client/public/icons/icon-96x96.png \
  client/public/icons/icon-128x128.png \
  client/public/icons/icon-144x144.png \
  client/public/icons/icon-152x152.png \
  client/public/icons/icon-180x180.png \
  client/public/icons/icon-192x192.png \
  client/public/icons/icon-384x384.png \
  client/public/icons/icon-512x512.png \
  client/public/icons/icon-512x512-maskable.png \
  client/public/icons/apple-touch-icon.png
git commit -m "AI Day Planner on Dashboard; Trip Planning in Spots; Health collab banner; MyLifos rebrand"
git push origin main
echo "✓ Done!"

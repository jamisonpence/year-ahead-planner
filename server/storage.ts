import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { events, tasks, recipes, mealBundles, weekPlan, groceryChecks, customGroceryItems, trips, tripItems, books, readingSessions, workoutTemplates, workoutLogs, workoutPlans, workoutShares, goals, goalTasks, projects, projectTasks, generalTasks, relationshipGroups, people, movies, movieLists, movieListMembers, budgetCategories, transactions, subscriptions, receipts, navPrefs, tabPrivacy, users, plants, musicArtists, musicSongs, chores, houseProjects, houseProjectTasks, appliances, spots, spotShares, children, childMilestones, childMemories, childPrepItems, pets, petVetVisits, quotes, quoteShares, mantras, artPieces, artShares, journalEntries, equipment, friendRequests, bookRecommendations, musicRecommendations, recipeShares, movieShares, hobbies, musicCollections, musicCollectionItems, tabCollaborations, sacredTexts, faithPractices, sermons, prayerItems, medications, healthMetrics, sleepLogs, careProviders, politicalOfficials, politicalIssues, politicalElections, civicActions, politicalNewsSources, politicalDebates, politicalDebatePosts, politicalDebateUpvotes, politicalDebateMembers, activityFeed, activityReactions, activityComments, foodLogEntries, waterLogs, nutritionGoals, bodyCompPlans, bodyCompCheckIns, readingGoals, habits, budBets } from "@shared/schema";
import type {
  InsertEvent, Event, InsertTask, Task, EventWithTasks,
  InsertRecipe, Recipe, InsertMealBundle, MealBundle, InsertWeekPlan, WeekPlan, InsertGroceryCheck, GroceryCheck, InsertCustomGroceryItem, CustomGroceryItem, InsertTrip, Trip, InsertTripItem, TripItem,
  InsertBook, Book, BookWithSessions,
  InsertReadingSession, ReadingSession,
  InsertWorkoutTemplate, WorkoutTemplate,
  InsertWorkoutLog, WorkoutLog,
  InsertGoal, Goal, GoalWithTasks, GoalWithProjects,
  InsertGoalTask, GoalTask,
  InsertProject, Project, ProjectWithTasks,
  InsertProjectTask, ProjectTask,
  InsertGeneralTask, GeneralTask,
  InsertRelationshipGroup, RelationshipGroup,
  InsertPerson, Person, PersonWithSpouse,
  InsertMovie, Movie,
  InsertBudgetCategory, BudgetCategory,
  InsertTransaction, Transaction,
  InsertSubscription, Subscription,
  InsertReceipt, Receipt,
  NavPref, TabPrivacySetting,
  User, InsertUser,
  InsertPlant, Plant,
  InsertMusicArtist, MusicArtist, InsertMusicSong, MusicSong, MusicArtistWithSongs,
  InsertChore, Chore, InsertHouseProject, HouseProject, HouseProjectWithTasks, InsertHouseProjectTask, HouseProjectTask, InsertAppliance, Appliance,
  InsertSpot, Spot,
  InsertChild, Child, ChildWithDetails,
  InsertChildMilestone, ChildMilestone,
  InsertChildMemory, ChildMemory,
  InsertChildPrepItem, ChildPrepItem,
  InsertPet, Pet, PetWithVisits, InsertPetVetVisit, PetVetVisit,
  InsertQuote, Quote,
  InsertMantra, Mantra,
  InsertArtPiece, ArtPiece,
  InsertJournalEntry, JournalEntry,
  InsertEquipment, Equipment,
  InsertFriendRequest, FriendRequest, FriendRequestWithUser, PublicUser,
  InsertBookRecommendation, BookRecommendation, BookRecommendationWithUser,
  InsertMusicRecommendation, MusicRecommendation, MusicRecommendationWithUser,
  InsertRecipeShare, RecipeShare, RecipeShareWithUser,
  InsertMovieShare, MovieShare, MovieShareWithUser,
  InsertSpotShare, SpotShare, SpotShareWithUser,
  InsertArtShare, ArtShare, ArtShareWithUser,
  InsertQuoteShare, QuoteShare, QuoteShareWithUser,
  InsertWorkoutPlan, WorkoutPlan,
  InsertWorkoutShare, WorkoutShare, WorkoutShareWithUser,
  InsertHobby, Hobby,
  InsertMusicCollection, MusicCollection, MusicCollectionWithItems,
  InsertMusicCollectionItem, MusicCollectionItem,
  InsertTabCollaboration, TabCollaboration, TabCollaborationWithUser,
  InsertSacredText, SacredText,
  InsertFaithPractice, FaithPractice,
  InsertSermon, Sermon,
  InsertPrayerItem, PrayerItem,
  InsertFoodLogEntry, FoodLogEntry,
  InsertWaterLog, WaterLog,
  InsertNutritionGoal, NutritionGoal,
  insertFoodLogSchema,
  insertNutritionGoalSchema,
  InsertBodyCompPlan, BodyCompPlan, BodyCompCheckIn, InsertBodyCompCheckIn,
  InsertReadingGoal, ReadingGoal,
  MovieList, MovieListMember,
  InsertHabit, Habit, HabitWithStats, HabitCompletion,
} from "@shared/schema";
import { eq, asc, desc, and, inArray, or, isNull } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://localhost/planner" });
const db = drizzle(pool);

// ── Schema migrations ─────────────────────────────────────────────────────────
// Add new columns here with IF NOT EXISTS so they apply automatically on startup
// without needing drizzle-kit push in production.
export async function runMigrations() {
  const migrations = [
    `ALTER TABLE habits ADD COLUMN IF NOT EXISTS linked_goal_id integer`,
  ];
  for (const sql of migrations) {
    await pool.query(sql);
  }
  console.log("[migrations] schema up to date");
}

// ── OAuth token encryption ────────────────────────────────────────────────────
// Third-party OAuth tokens (Google, Strava, Facebook, LinkedIn) are encrypted
// at rest with AES-256-GCM. Legacy plaintext rows are handled transparently:
// decToken falls back to the raw value if it isn't in encrypted format.
import { encrypt as _encryptToken, decrypt as _decryptToken, hasEncryptionKey } from "./encryption";

function encToken(value: string): string;
function encToken(value: string | null | undefined): string | null;
function encToken(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!hasEncryptionKey()) return value;
  try { return _encryptToken(value); } catch { return value; }
}

function decToken(value: string): string;
function decToken(value: string | null | undefined): string | null;
function decToken(value: string | null | undefined): string | null {
  if (!value) return null;
  // Encrypted values are "iv:authTag:ciphertext" (3 base64 parts)
  if (value.split(":").length === 3) {
    try { return _decryptToken(value); } catch { return value; }
  }
  return value;
}

// ── DDL ────────────────────────────────────────────────────────────────────────
export async function initializeStorage() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      google_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      end_date TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      recurring TEXT NOT NULL DEFAULT 'none',
      description TEXT,
      color TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      due_date TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS books (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title TEXT NOT NULL,
      author TEXT,
      series TEXT,
      series_number INTEGER,
      genre TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      total_pages INTEGER,
      pages_read INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      target_finish_date TEXT,
      finish_date TEXT,
      notes TEXT,
      highlights TEXT,
      linked_goal_id INTEGER,
      cover_color TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reading_sessions (
      id SERIAL PRIMARY KEY,
      book_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      pages_read INTEGER NOT NULL DEFAULT 0,
      duration_minutes INTEGER,
      notes TEXT,
      planned BOOLEAN NOT NULL DEFAULT FALSE,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      recurring TEXT NOT NULL DEFAULT 'none'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_templates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      workout_type TEXT NOT NULL DEFAULT 'custom',
      scheduled_day TEXT,
      recurring TEXT NOT NULL DEFAULT 'none',
      notes TEXT,
      linked_goal_id INTEGER,
      exercises_json TEXT NOT NULL DEFAULT '[]'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      template_id INTEGER,
      date TEXT NOT NULL,
      name TEXT NOT NULL,
      workout_type TEXT NOT NULL DEFAULT 'custom',
      duration_minutes INTEGER,
      notes TEXT,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      exercises_json TEXT NOT NULL DEFAULT '[]',
      linked_goal_id INTEGER
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      progress_type TEXT NOT NULL DEFAULT 'percent',
      progress_current REAL NOT NULL DEFAULT 0,
      progress_target REAL NOT NULL DEFAULT 100,
      priority TEXT NOT NULL DEFAULT 'medium',
      start_date TEXT,
      target_date TEXT,
      recurring TEXT NOT NULL DEFAULT 'none',
      description TEXT,
      linked_book_id INTEGER,
      linked_template_id INTEGER,
      linked_workout_plan_id INTEGER
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS goal_tasks (
      id SERIAL PRIMARY KEY,
      goal_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      due_date TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🍽️',
      category TEXT,
      prep_time INTEGER,
      cook_time INTEGER,
      ingredients_json TEXT NOT NULL DEFAULT '[]',
      instructions TEXT
    )
  `);
  // Migrations for recipes table
  await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS component_type TEXT`);
  await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS nutrition_data TEXT`);
  await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS servings INTEGER`);
  await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS tags TEXT`);
  await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS description TEXT`);
  await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS source TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_bundles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '🍽️',
      description TEXT,
      recipe_ids_json TEXT NOT NULL DEFAULT '[]'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS week_plan (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      day_index INTEGER NOT NULL,
      recipe_id INTEGER,
      week_start TEXT NOT NULL
    )
  `);
  // Migrations for week_plan table
  await pool.query(`ALTER TABLE week_plan ADD COLUMN IF NOT EXISTS bundle_id INTEGER`);
  await pool.query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS linked_workout_plan_id INTEGER`);
  await pool.query(`ALTER TABLE week_plan ALTER COLUMN recipe_id DROP NOT NULL`).catch(() => {});

  await pool.query(`
    CREATE TABLE IF NOT EXISTS grocery_checks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      week_start TEXT NOT NULL,
      item_key TEXT NOT NULL,
      checked BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS custom_grocery_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      week_start TEXT NOT NULL,
      name TEXT NOT NULL,
      qty TEXT,
      category TEXT,
      checked BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS relationship_groups (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS people (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      group_id INTEGER,
      first_name TEXT NOT NULL,
      last_name TEXT,
      birthday TEXT,
      notes TEXT,
      spouse_id INTEGER,
      children_json TEXT NOT NULL DEFAULT '[]',
      birthday_event_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      linked_user_id INTEGER
    )
  `);
  await pool.query(`ALTER TABLE people ADD COLUMN IF NOT EXISTS linked_user_id INTEGER`);
  await pool.query(`ALTER TABLE people ADD COLUMN IF NOT EXISTS keep_in_touch_frequency TEXT`);
  await pool.query(`ALTER TABLE people ADD COLUMN IF NOT EXISTS last_contacted_at TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS timeline_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      person_ids_json TEXT NOT NULL DEFAULT '[]',
      interaction_type TEXT NOT NULL DEFAULT 'note',
      custom_type TEXT,
      note TEXT,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS general_tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      goal_id INTEGER,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      due_date TEXT,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_tasks (
      id SERIAL PRIMARY KEY,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS movies (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      media_type TEXT NOT NULL DEFAULT 'movie',
      title TEXT NOT NULL,
      year INTEGER,
      director TEXT,
      genres TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      rating INTEGER,
      notes TEXT,
      lists_json TEXT NOT NULL DEFAULT '[]',
      is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
      poster_color TEXT,
      streaming_on TEXT,
      total_seasons INTEGER,
      current_season INTEGER
    )
  `);
  // Migrate existing rows: add new columns if they don't exist yet
  await pool.query(`ALTER TABLE movies ADD COLUMN IF NOT EXISTS media_type TEXT NOT NULL DEFAULT 'movie'`);
  await pool.query(`ALTER TABLE movies ADD COLUMN IF NOT EXISTS total_seasons INTEGER`);
  await pool.query(`ALTER TABLE movies ADD COLUMN IF NOT EXISTS current_season INTEGER`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS movie_lists (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'friends',
      is_ranked BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    )
  `);
  await pool.query(`ALTER TABLE movie_lists ADD COLUMN IF NOT EXISTS movies_json TEXT DEFAULT '[]'`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movie_list_members (
      id SERIAL PRIMARY KEY,
      list_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      invited_by INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL
    )
  `);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS movie_list_members_unique ON movie_list_members(list_id, user_id)`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS budget_categories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      color TEXT,
      icon TEXT,
      budget_amount REAL NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      category_id INTEGER,
      date TEXT NOT NULL,
      notes TEXT,
      recurring TEXT NOT NULL DEFAULT 'none'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      billing_cycle TEXT NOT NULL DEFAULT 'monthly',
      next_renewal TEXT NOT NULL,
      category_id INTEGER,
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      color TEXT,
      icon TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS receipts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      upload_date TEXT NOT NULL,
      category_id INTEGER,
      transaction_id INTEGER,
      notes TEXT,
      merchant TEXT,
      amount REAL,
      receipt_date TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS nav_prefs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      prefs_json TEXT NOT NULL DEFAULT '[]'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tab_privacy (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      settings_json TEXT NOT NULL DEFAULT '[]'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS plants (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      species TEXT,
      location TEXT,
      light_needs TEXT NOT NULL DEFAULT 'medium',
      water_frequency_days INTEGER NOT NULL DEFAULT 7,
      soil_type TEXT,
      notes TEXT,
      last_watered TEXT,
      reminders_enabled BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS music_artists (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      genres TEXT,
      is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      accent_color TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS music_songs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      artist_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      album TEXT,
      genre TEXT,
      year INTEGER,
      status TEXT NOT NULL DEFAULT 'want_to_listen',
      is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
      rating INTEGER,
      notes TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chores (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'cleaning',
      frequency TEXT NOT NULL DEFAULT 'weekly',
      custom_frequency_days INTEGER,
      last_completed TEXT,
      next_due TEXT,
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      priority TEXT NOT NULL DEFAULT 'medium',
      assignee TEXT,
      tags TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS house_projects (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      priority TEXT NOT NULL DEFAULT 'medium',
      due_date TEXT,
      completed_date TEXT,
      estimated_cost REAL,
      actual_cost REAL,
      contractor TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      notes TEXT,
      tags TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS house_project_tasks (
      id SERIAL PRIMARY KEY,
      house_project_id INTEGER NOT NULL,
      user_id INTEGER,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT false,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appliances (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      serial_number TEXT,
      location TEXT,
      purchase_date TEXT,
      purchase_price REAL,
      warranty_expiry TEXT,
      last_serviced TEXT,
      service_frequency_months INTEGER,
      next_service_due TEXT,
      notes TEXT,
      tags TEXT
    )
  `);

  // Video URL migration for movies
  await pool.query(`ALTER TABLE movies ADD COLUMN IF NOT EXISTS video_url TEXT`);

  // Poster URL from TMDB
  await pool.query(`ALTER TABLE movies ADD COLUMN IF NOT EXISTS poster_url TEXT`);

  // Cover URL from Google Books
  await pool.query(`ALTER TABLE books ADD COLUMN IF NOT EXISTS cover_url TEXT`);

  // Image URL for recipes
  await pool.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS image_url TEXT`);

  // Meal slot for week plan (breakfast / lunch / dinner)
  await pool.query(`ALTER TABLE week_plan ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT 'dinner'`);

  // Photo URL for plants (from Perenual API)
  await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS photo_url TEXT`);

  // AI enrichment fields for plants
  await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS toxicity_notes TEXT`);
  await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS propagation_methods TEXT`);
  await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS care_difficulty TEXT`);
  await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS ai_enriched BOOLEAN NOT NULL DEFAULT false`);

  // Encrypted Anthropic API key on users
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS anthropic_api_key_enc TEXT`);

  // Onboarding flag — false until user completes welcome flow
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded BOOLEAN NOT NULL DEFAULT false`);

  // Google Calendar integration tokens
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gcal_access_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gcal_refresh_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gcal_token_expiry TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gcal_last_sync TEXT`);

  // Strava integration tokens
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_access_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_refresh_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_token_expiry TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS strava_athlete_id TEXT`);

  // LinkedIn integration
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_access_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_profile_id TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_name TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_headline TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_avatar_url TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin_email TEXT`);

  // Facebook integration
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_access_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_user_id TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_name TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_email TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_avatar_url TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_birthday TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_location TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_last_sync TEXT`);

  // Google Contacts columns
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_contacts_access_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_contacts_refresh_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_contacts_token_expiry TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_contacts_last_sync TEXT`);

  // Google Contacts table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS google_contacts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      resource_name TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      email TEXT,
      phone TEXT,
      birthday TEXT,
      avatar_url TEXT,
      company TEXT,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, resource_name)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS facebook_friends (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      fb_friend_id TEXT NOT NULL,
      name TEXT NOT NULL,
      birthday TEXT,
      birthday_raw TEXT,
      avatar_url TEXT,
      location TEXT,
      imported_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, fb_friend_id)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS linkedin_contacts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      last_name TEXT,
      email TEXT,
      company TEXT,
      position TEXT,
      connected_on TEXT,
      imported_at TEXT NOT NULL
    )
  `);

  // Google Calendar event ID on events table
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS gcal_event_id TEXT`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS events_gcal_event_id_idx ON events(gcal_event_id) WHERE gcal_event_id IS NOT NULL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS children (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      birth_date TEXT,
      notes TEXT,
      accent_color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_milestones (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      child_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      date TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_memories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      child_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      date TEXT,
      tags TEXT,
      mood TEXT NOT NULL DEFAULT 'happy',
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS child_prep_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      child_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      due_date TEXT,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      species TEXT NOT NULL DEFAULT 'dog',
      breed TEXT,
      birthday TEXT,
      notes TEXT,
      accent_color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS pet_vet_visits (
      id SERIAL PRIMARY KEY,
      pet_id INTEGER NOT NULL,
      user_id INTEGER,
      date TEXT NOT NULL,
      reason TEXT NOT NULL,
      notes TEXT,
      vet_name TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      text TEXT NOT NULL,
      author TEXT,
      source TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      tags TEXT,
      notes TEXT,
      is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mantras (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      text TEXT NOT NULL,
      intention TEXT,
      category TEXT NOT NULL DEFAULT 'other',
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_favorite BOOLEAN NOT NULL DEFAULT false,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS art_pieces (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title TEXT NOT NULL,
      artist_name TEXT,
      year_created INTEGER,
      medium TEXT NOT NULL DEFAULT 'other',
      movement TEXT,
      where_viewed TEXT,
      city TEXT,
      status TEXT NOT NULL DEFAULT 'want_to_see',
      notes TEXT,
      is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
      accent_color TEXT,
      image_url TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE art_pieces ADD COLUMN IF NOT EXISTS rating INTEGER`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS spots (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'restaurant',
      address TEXT,
      neighborhood TEXT,
      city TEXT,
      status TEXT NOT NULL DEFAULT 'want_to_visit',
      rating INTEGER,
      notes TEXT,
      website TEXT,
      price_range INTEGER,
      tags TEXT,
      visited_date TEXT,
      is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
      opening_hours TEXT
    )
  `);

  await pool.query(`ALTER TABLE spots ADD COLUMN IF NOT EXISTS lat REAL`);
  await pool.query(`ALTER TABLE spots ADD COLUMN IF NOT EXISTS lon REAL`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      date TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      mood TEXT,
      tags TEXT,
      is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS equipment (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other',
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS book_recommendations (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      book_title TEXT NOT NULL,
      book_author TEXT,
      cover_url TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS recipe_shares (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      recipe_name TEXT NOT NULL,
      recipe_emoji TEXT NOT NULL DEFAULT '🍽️',
      recipe_category TEXT,
      recipe_component_type TEXT,
      recipe_prep_time INTEGER,
      recipe_cook_time INTEGER,
      recipe_servings INTEGER,
      recipe_ingredients TEXT NOT NULL DEFAULT '[]',
      recipe_instructions TEXT,
      recipe_image_url TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS music_recommendations (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      song_title TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS quote_shares (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      author TEXT,
      source TEXT,
      category TEXT,
      tags TEXT,
      quote_notes TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS art_shares (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      artist_name TEXT,
      year_created INTEGER,
      medium TEXT,
      movement TEXT,
      where_viewed TEXT,
      city TEXT,
      accent_color TEXT,
      image_url TEXT,
      art_notes TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trips (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      destination TEXT,
      start_date TEXT,
      end_date TEXT,
      emoji TEXT NOT NULL DEFAULT '✈️',
      notes TEXT,
      cover_color TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS trip_items (
      id SERIAL PRIMARY KEY,
      trip_id INTEGER NOT NULL,
      user_id INTEGER,
      spot_id INTEGER,
      name TEXT NOT NULL,
      address TEXT,
      date TEXT,
      time TEXT,
      duration TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      type TEXT DEFAULT 'other',
      confirmed BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS visited_cities (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      city TEXT NOT NULL,
      country TEXT,
      lat REAL,
      lon REAL,
      visited_date TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS family_members (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      gender TEXT DEFAULT 'unknown',
      role TEXT NOT NULL DEFAULT 'other',
      side TEXT DEFAULT 'none',
      birth_year INTEGER,
      death_year INTEGER,
      birth_place TEXT,
      notes TEXT,
      is_deceased INTEGER DEFAULT 0,
      parent1_id INTEGER,
      parent2_id INTEGER,
      created_at TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS spot_shares (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'restaurant',
      address TEXT,
      neighborhood TEXT,
      city TEXT,
      website TEXT,
      price_range INTEGER,
      tags TEXT,
      opening_hours TEXT,
      rating INTEGER,
      spot_notes TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS movie_shares (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'movie',
      title TEXT NOT NULL,
      year INTEGER,
      director TEXT,
      genres TEXT,
      streaming_on TEXT,
      poster_color TEXT,
      poster_url TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE
    );
  `);

  // Ensure is_dismissed and is_read columns exist on all share tables
  await pool.query(`
    ALTER TABLE book_recommendations    ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE book_recommendations    ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE music_recommendations   ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE music_recommendations   ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE recipe_shares           ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE recipe_shares           ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE quote_shares            ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE quote_shares            ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE art_shares              ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE art_shares              ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE spot_shares             ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE spot_shares             ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE movie_shares            ADD COLUMN IF NOT EXISTS is_dismissed BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE movie_shares            ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pair_idx
      ON friend_requests (LEAST(from_user_id, to_user_id), GREATEST(from_user_id, to_user_id))
      WHERE status <> 'declined';
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_plans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      duration_weeks INTEGER NOT NULL DEFAULT 4,
      schedule_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    )
  `);

  // Migrate: add goal-oriented columns to workout_plans
  await pool.query(`ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS goal_type TEXT NOT NULL DEFAULT 'general'`);
  await pool.query(`ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS goal_metric_json TEXT`);
  await pool.query(`ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS start_date TEXT`);
  await pool.query(`ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS milestones_json TEXT NOT NULL DEFAULT '[]'`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS workout_shares (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      share_type TEXT NOT NULL DEFAULT 'template',
      content_json TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
      is_read BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS hobbies (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      hobby_type TEXT NOT NULL DEFAULT 'creative',
      category TEXT,
      cover_url TEXT,
      description TEXT,
      skill_level TEXT NOT NULL DEFAULT 'beginner',
      date_started TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      extra_json TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_favorite BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS music_collections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      name TEXT NOT NULL,
      description TEXT,
      cover_color TEXT NOT NULL DEFAULT '#6366f1',
      cover_emoji TEXT NOT NULL DEFAULT '🎵',
      shared_with_friends BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS music_collection_items (
      id SERIAL PRIMARY KEY,
      collection_id INTEGER NOT NULL,
      item_type TEXT NOT NULL DEFAULT 'song',
      song_id INTEGER,
      artist_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS tab_collaborations (
      id SERIAL PRIMARY KEY,
      owner_user_id INTEGER NOT NULL,
      collaborator_user_id INTEGER NOT NULL,
      tab_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    )
  `);

  // ── Faith & Spirituality ──────────────────────────────────────────────────
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sacred_texts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      author TEXT,
      tradition TEXT,
      translation_version TEXT,
      status TEXT NOT NULL DEFAULT 'Want to Read',
      saved_passages TEXT NOT NULL DEFAULT '[]',
      personal_notes TEXT,
      cover_image_url TEXT,
      date_added TEXT NOT NULL
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS faith_practices (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      frequency TEXT,
      date_started TEXT,
      status TEXT NOT NULL DEFAULT 'Active',
      personal_notes TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sermons (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      speaker TEXT,
      source TEXT,
      source_url TEXT,
      date TEXT,
      topic TEXT,
      key_takeaways TEXT,
      personal_notes TEXT,
      tags TEXT NOT NULL DEFAULT '[]'
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS prayer_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      date_added TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Active',
      date_answered TEXT,
      answer_reflection TEXT,
      notes TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS medications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'medication',
      dosage TEXT,
      frequency TEXT,
      time_of_day TEXT,
      start_date TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      prescribed_by TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS health_metrics (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      value TEXT NOT NULL,
      unit TEXT,
      date TEXT NOT NULL,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS sleep_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      hours_slept REAL NOT NULL,
      quality INTEGER,
      bedtime TEXT,
      wake_time TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS care_providers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      specialty TEXT,
      practice TEXT,
      phone TEXT,
      address TEXT,
      last_appointment TEXT,
      next_appointment TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS political_officials (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      title TEXT,
      level TEXT,
      party TEXT,
      district TEXT,
      state_code TEXT,
      external_id TEXT,
      phone TEXT,
      email TEXT,
      website TEXT,
      term_end TEXT,
      notes TEXT
    );
    ALTER TABLE political_officials ADD COLUMN IF NOT EXISTS state_code TEXT;
    ALTER TABLE political_officials ADD COLUMN IF NOT EXISTS external_id TEXT;
    CREATE TABLE IF NOT EXISTS political_issues (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      topic TEXT NOT NULL,
      category TEXT,
      position TEXT,
      importance INTEGER,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS political_elections (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      date TEXT,
      level TEXT,
      voted BOOLEAN NOT NULL DEFAULT false,
      registration_deadline TEXT,
      polling_location TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS civic_actions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      description TEXT,
      official TEXT,
      notes TEXT
    );
    CREATE TABLE IF NOT EXISTS political_news_sources (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      url TEXT,
      bias TEXT,
      reliability INTEGER,
      type TEXT,
      topics TEXT,
      notes TEXT
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS political_debates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      issue_ref TEXT,
      share_code TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'open',
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS political_debate_posts (
      id SERIAL PRIMARY KEY,
      debate_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      display_name TEXT,
      content TEXT NOT NULL,
      side TEXT,
      upvote_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS political_debate_upvotes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(post_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS political_debate_members (
      id SERIAL PRIMARY KEY,
      debate_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      joined_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(debate_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS activity_feed (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL,
      item_id INTEGER,
      item_type TEXT,
      item_title TEXT,
      item_image_url TEXT,
      item_subtitle TEXT,
      item_extra TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS activity_reactions (
      id SERIAL PRIMARY KEY,
      feed_item_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(feed_item_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS activity_comments (
      id SERIAL PRIMARY KEY,
      feed_item_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Add sides column to political_debates if it doesn't exist yet
  await pool.query(`ALTER TABLE political_debates ADD COLUMN IF NOT EXISTS sides TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS saved_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      external_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      start_datetime TEXT,
      end_datetime TEXT,
      venue_name TEXT,
      venue_address TEXT,
      city TEXT,
      url TEXT,
      image_url TEXT,
      price_info TEXT,
      status TEXT NOT NULL DEFAULT 'want_to_attend',
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, source, external_id)
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS food_log_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      food_name TEXT NOT NULL,
      usda_food_id TEXT,
      barcode TEXT,
      serving_size REAL NOT NULL DEFAULT 1,
      serving_unit TEXT NOT NULL DEFAULT 'serving',
      quantity REAL NOT NULL DEFAULT 1,
      meal_type TEXT NOT NULL DEFAULT 'snack',
      date TEXT NOT NULL,
      calories REAL NOT NULL DEFAULT 0,
      protein REAL NOT NULL DEFAULT 0,
      carbs REAL NOT NULL DEFAULT 0,
      fat REAL NOT NULL DEFAULT 0,
      fiber REAL NOT NULL DEFAULT 0,
      sugar REAL NOT NULL DEFAULT 0,
      sodium REAL NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE food_log_entries ADD COLUMN IF NOT EXISTS ingredients_json TEXT`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS water_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      glasses INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, date)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition_goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      calories INTEGER NOT NULL DEFAULT 2000,
      protein INTEGER NOT NULL DEFAULT 150,
      carbs INTEGER NOT NULL DEFAULT 250,
      fat INTEGER NOT NULL DEFAULT 65,
      water_glasses INTEGER NOT NULL DEFAULT 8
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS body_comp_plans (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      plan_type TEXT NOT NULL DEFAULT 'cut',
      weight_unit TEXT NOT NULL DEFAULT 'lbs',
      current_weight REAL,
      goal_weight REAL,
      current_body_fat REAL,
      goal_body_fat REAL,
      activity_level TEXT NOT NULL DEFAULT 'moderate',
      maintenance_calories INTEGER NOT NULL,
      target_calories INTEGER NOT NULL,
      protein_grams INTEGER NOT NULL,
      carbs_grams INTEGER NOT NULL,
      fat_grams INTEGER NOT NULL,
      protein_per_lb REAL NOT NULL DEFAULT 1.0,
      fat_pct REAL NOT NULL DEFAULT 25.0,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS body_comp_check_ins (
      id SERIAL PRIMARY KEY,
      plan_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      weight REAL,
      body_fat REAL,
      notes TEXT,
      created_at TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS reading_goals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE,
      books_target INTEGER NOT NULL DEFAULT 12,
      year INTEGER NOT NULL DEFAULT 2026
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS habits (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      emoji TEXT NOT NULL DEFAULT '✅',
      color TEXT NOT NULL DEFAULT '#6366f1',
      frequency TEXT NOT NULL DEFAULT 'daily',
      target_days_per_week INTEGER NOT NULL DEFAULT 7,
      category TEXT NOT NULL DEFAULT 'general',
      is_archived BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL,
      completions_json TEXT NOT NULL DEFAULT '[]'
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS bud_bets (
      id SERIAL PRIMARY KEY,
      creator_id INTEGER NOT NULL,
      opponent_id INTEGER,
      opponent_name TEXT,
      arbitrator_id INTEGER,
      arbitrator_name TEXT,
      title TEXT NOT NULL,
      wager TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      winner_id INTEGER,
      payout_status TEXT NOT NULL DEFAULT 'pending',
      payout_marked_by_id INTEGER,
      created_at TEXT NOT NULL,
      settled_at TEXT
    )
  `);
  // Migrate reading_goals to add flexible timeframe columns
  await db.execute(`ALTER TABLE reading_goals ADD COLUMN IF NOT EXISTS label TEXT`);
  await db.execute(`ALTER TABLE reading_goals ADD COLUMN IF NOT EXISTS start_date TEXT`);
  await db.execute(`ALTER TABLE reading_goals ADD COLUMN IF NOT EXISTS end_date TEXT`);
  // Accountabilibuddy — link a friend to a goal
  await db.execute(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS buddy_user_id INTEGER`);
  // Goal horizons: this_year | next_year | 3_years | 5_years | someday
  await db.execute(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS horizon TEXT NOT NULL DEFAULT 'this_year'`);
  // Parent-child goal linking across horizons
  await db.execute(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS parent_goal_id INTEGER`);
  // Fix nav_prefs ordering: ensure /habits comes before /journal for all users
  {
    const navRows = await pool.query(`SELECT id, prefs_json FROM nav_prefs WHERE prefs_json IS NOT NULL`);
    for (const row of navRows.rows) {
      try {
        const prefs: { path: string; hidden: boolean }[] = JSON.parse(row.prefs_json || '[]');
        const hi = prefs.findIndex(p => p.path === '/habits');
        const ji = prefs.findIndex(p => p.path === '/journal');
        if (hi !== -1 && ji !== -1 && ji < hi) {
          // Journal is before habits — swap them to correct order
          const habitsItem = prefs.splice(hi, 1)[0];
          const journalIdx = prefs.findIndex(p => p.path === '/journal');
          prefs.splice(journalIdx + 1, 0, habitsItem);
          await pool.query(`UPDATE nav_prefs SET prefs_json = $1 WHERE id = $2`, [JSON.stringify(prefs), row.id]);
        }
      } catch { /* skip malformed rows */ }
    }
  }
  // Trip prep: projects can be linked to a trip
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS trip_id INTEGER`);
  // Purchase list
  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      notes TEXT,
      price REAL,
      url TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      purchased BOOLEAN NOT NULL DEFAULT FALSE,
      linked_task_id INTEGER,
      category TEXT,
      created_at TEXT NOT NULL
    )
  `);
  // Spot folders (user-created collections)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spot_folders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      emoji TEXT NOT NULL DEFAULT '📁',
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`ALTER TABLE spots ADD COLUMN IF NOT EXISTS folder_id INTEGER`);
  // Multi-folder: junction table replaces single folder_id
  await pool.query(`
    CREATE TABLE IF NOT EXISTS spot_folder_members (
      spot_id INTEGER NOT NULL,
      folder_id INTEGER NOT NULL,
      PRIMARY KEY (spot_id, folder_id)
    )
  `);
  // Migrate existing folder_id assignments into junction table
  await pool.query(`
    INSERT INTO spot_folder_members (spot_id, folder_id)
    SELECT id, folder_id FROM spots WHERE folder_id IS NOT NULL
    ON CONFLICT DO NOTHING
  `);
  // Accountabilibuddy on reading + nutrition goals
  await db.execute(`ALTER TABLE reading_goals ADD COLUMN IF NOT EXISTS buddy_user_id INTEGER`);
  await db.execute(`ALTER TABLE nutrition_goals ADD COLUMN IF NOT EXISTS buddy_user_id INTEGER`);
  // Accountabilibuddy on workout plans
  await db.execute(`ALTER TABLE workout_plans ADD COLUMN IF NOT EXISTS buddy_user_id INTEGER`);
  // Allow multiple reading goals per user (drop old unique constraint)
  await db.execute(`ALTER TABLE reading_goals DROP CONSTRAINT IF EXISTS reading_goals_user_id_unique`);

  // Messenger tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      name TEXT,
      is_group BOOLEAN NOT NULL DEFAULT FALSE,
      created_by INTEGER,
      created_at TEXT NOT NULL,
      last_message_at TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_participants (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      joined_at TEXT NOT NULL,
      last_read_at TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (message_id, user_id, emoji)
    )
  `);

  // Parent-child links on family_members
  await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS parent1_id INTEGER`);
  await pool.query(`ALTER TABLE family_members ADD COLUMN IF NOT EXISTS parent2_id INTEGER`);

  // Share messages in the messenger
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS share_type TEXT`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS share_data TEXT`);

  // Link chores to appliances
  await pool.query(`ALTER TABLE chores ADD COLUMN IF NOT EXISTS appliance_id INTEGER`);

  // Goal milestones
  await pool.query(`ALTER TABLE goals ADD COLUMN IF NOT EXISTS milestones_json TEXT NOT NULL DEFAULT '[]'`);

  // Time-blocking: events can carry a time of day and link back to a task
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS time TEXT`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS linked_task_id INTEGER`);
  await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS linked_task_type TEXT`);

  // Weekly reviews
  await pool.query(`
    CREATE TABLE IF NOT EXISTS weekly_reviews (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      week_start TEXT NOT NULL,
      wins TEXT,
      challenges TEXT,
      focus TEXT,
      stats_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE (user_id, week_start)
    )
  `);

  // Life Graph: generic connections between people, places, books, music,
  // recipes, goals, trips, workouts, notes, habits, projects, and future items.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS life_graph_links (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL,
      target_type TEXT NOT NULL,
      target_id INTEGER NOT NULL,
      relation TEXT NOT NULL DEFAULT 'related',
      notes TEXT,
      created_at TEXT NOT NULL,
      UNIQUE (user_id, source_type, source_id, target_type, target_id, relation)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_life_graph_source ON life_graph_links (user_id, source_type, source_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_life_graph_target ON life_graph_links (user_id, target_type, target_id)`);

  // Invite links (one permanent code per user; auto-friends on signup)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invites (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      from_user_id INTEGER NOT NULL,
      uses INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
  `);

  // Unified shares — replaces the 8 per-type share/recommendation tables.
  // content_json holds the type-specific fields (camelCase, same names the
  // client already expects). Legacy rows are migrated on first boot.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shares (
      id SERIAL PRIMARY KEY,
      share_type TEXT NOT NULL,
      from_user_id INTEGER NOT NULL,
      to_user_id INTEGER NOT NULL,
      content_json TEXT NOT NULL DEFAULT '{}',
      notes TEXT,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      is_dismissed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    )
  `);
  await migrateLegacyShares();

  // Persistent in-app notifications
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      href TEXT,
      actor_id INTEGER,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TEXT NOT NULL
    )
  `);

  // ── INDEXES ─────────────────────────────────────────────────────────────────
  // Nearly every query filters by user_id (or a parent FK). Without these,
  // every request is a sequential scan. Idempotent; each wrapped in try/catch
  // so a missing table can never block startup.
  const indexes: Array<[string, string]> = [
    ["users", "email"],
    ["events", "user_id"], ["events", "date"],
    ["books", "user_id"],
    ["reading_sessions", "book_id"],
    ["workout_templates", "user_id"],
    ["workout_logs", "user_id"], ["workout_logs", "template_id"],
    ["workout_plans", "user_id"],
    ["workout_shares", "to_user_id"], ["workout_shares", "from_user_id"],
    ["goals", "user_id"], ["goals", "parent_goal_id"],
    ["projects", "user_id"], ["projects", "goal_id"],
    ["purchase_items", "user_id"],
    ["recipes", "user_id"],
    ["meal_bundles", "user_id"],
    ["week_plan", "user_id, week_start"],
    ["grocery_checks", "user_id, week_start"],
    ["custom_grocery_items", "user_id, week_start"],
    ["timeline_entries", "user_id"],
    ["relationship_groups", "user_id"],
    ["people", "user_id"], ["people", "group_id"],
    ["google_contacts", "user_id"],
    ["facebook_friends", "user_id"],
    ["linkedin_contacts", "user_id"],
    ["movies", "user_id"],
    ["movie_lists", "user_id"],
    ["movie_list_members", "list_id"], ["movie_list_members", "user_id"],
    ["music_artists", "user_id"],
    ["music_songs", "user_id"], ["music_songs", "artist_id"],
    ["music_collections", "user_id"],
    ["music_collection_items", "collection_id"],
    ["budget_categories", "user_id"],
    ["transactions", "user_id"], ["transactions", "category_id"],
    ["subscriptions", "user_id"],
    ["receipts", "user_id"],
    ["plants", "user_id"],
    ["chores", "user_id"],
    ["house_projects", "user_id"],
    ["house_project_tasks", "house_project_id"],
    ["appliances", "user_id"],
    ["spots", "user_id"], ["spots", "folder_id"],
    ["spot_folders", "user_id"],
    ["spot_shares", "to_user_id"], ["spot_shares", "from_user_id"],
    ["nav_prefs", "user_id"],
    ["trips", "user_id"],
    ["trip_items", "trip_id"],
    ["visited_cities", "user_id"],
    ["family_members", "user_id"],
    ["children", "user_id"],
    ["child_milestones", "child_id"],
    ["child_memories", "child_id"],
    ["child_prep_items", "child_id"],
    ["pets", "user_id"],
    ["pet_vet_visits", "pet_id"],
    ["quotes", "user_id"],
    ["mantras", "user_id"],
    ["quote_shares", "to_user_id"],
    ["hobbies", "user_id"],
    ["art_pieces", "user_id"],
    ["art_shares", "to_user_id"],
    ["equipment", "user_id"],
    ["journal_entries", "user_id"],
    ["book_recommendations", "to_user_id"],
    ["movie_shares", "to_user_id"],
    ["recipe_shares", "to_user_id"],
    ["music_recommendations", "to_user_id"],
    ["tab_collaborations", "owner_user_id"], ["tab_collaborations", "collaborator_user_id"],
    ["friend_requests", "from_user_id"], ["friend_requests", "to_user_id"],
    ["sacred_texts", "user_id"],
    ["faith_practices", "user_id"],
    ["sermons", "user_id"],
    ["prayer_items", "user_id"],
    ["medications", "user_id"],
    ["health_metrics", "user_id"],
    ["sleep_logs", "user_id"],
    ["care_providers", "user_id"],
    ["political_officials", "user_id"],
    ["political_issues", "user_id"],
    ["political_elections", "user_id"],
    ["civic_actions", "user_id"],
    ["political_news_sources", "user_id"],
    ["political_debates", "user_id"],
    ["political_debate_posts", "debate_id"],
    ["political_debate_upvotes", "post_id"],
    ["political_debate_members", "debate_id"],
    ["activity_feed", "user_id, created_at"],
    ["activity_reactions", "feed_item_id"],
    ["activity_comments", "feed_item_id"],
    ["body_comp_plans", "user_id"],
    ["body_comp_check_ins", "plan_id"],
    ["food_log_entries", "user_id, date"],
    ["water_logs", "user_id, date"],
    ["reading_goals", "user_id"],
    ["habits", "user_id"],
    ["conversation_participants", "conversation_id"], ["conversation_participants", "user_id"],
    ["messages", "conversation_id, created_at"],
    ["bud_bets", "creator_id"], ["bud_bets", "opponent_id"],
    ["notifications", "user_id, is_read"],
    ["notifications", "user_id, created_at"],
    ["shares", "to_user_id, share_type"],
    ["shares", "from_user_id"],
  ];
  for (const [table, cols] of indexes) {
    const name = `idx_${table}_${cols.replace(/[^a-z_]/g, "_").replace(/__+/g, "_")}`;
    try {
      await pool.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${table} (${cols})`);
    } catch (e) {
      console.warn(`Index skipped: ${name} — ${String(e).slice(0, 120)}`);
    }
  }

  // Merge the four task tables into unified_tasks (one-time; legacy names
  // become writable views so all existing queries keep working).
  await migrateUnifiedTasks();
}

// ── STORAGE INTERFACE ──────────────────────────────────────────────────────────
export interface IStorage {
  createDMShareMessage(fromUserId: number, toUserId: number, shareType: string, shareData: string, displayText: string): Promise<void>;
  createDMTextMessage(fromUserId: number, toUserId: number, text: string): Promise<void>;
  // Events
  getAllEventsWithTasks(userId: number): Promise<EventWithTasks[]>;
  createEvent(data: InsertEvent, userId: number): Promise<Event>;
  updateEvent(id: number, data: Partial<InsertEvent>): Promise<Event | undefined>;
  deleteEvent(id: number): Promise<boolean>;
  // Tasks
  createTask(data: InsertTask): Promise<Task>;
  updateTask(id: number, data: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<boolean>;
  // Books
  getAllBooks(userId: number): Promise<Book[]>;
  getAllBooksWithSessions(userId: number): Promise<BookWithSessions[]>;
  createBook(data: InsertBook, userId: number): Promise<Book>;
  updateBook(id: number, data: Partial<InsertBook>): Promise<Book | undefined>;
  deleteBook(id: number): Promise<boolean>;
  // Reading Sessions
  getAllReadingSessions(): Promise<ReadingSession[]>;
  createReadingSession(data: InsertReadingSession): Promise<ReadingSession>;
  updateReadingSession(id: number, data: Partial<InsertReadingSession>): Promise<ReadingSession | undefined>;
  deleteReadingSession(id: number): Promise<boolean>;
  // Workout Templates
  getAllWorkoutTemplates(userId: number): Promise<WorkoutTemplate[]>;
  createWorkoutTemplate(data: InsertWorkoutTemplate, userId: number): Promise<WorkoutTemplate>;
  updateWorkoutTemplate(id: number, data: Partial<InsertWorkoutTemplate>): Promise<WorkoutTemplate | undefined>;
  deleteWorkoutTemplate(id: number): Promise<boolean>;
  // Workout Logs
  getAllWorkoutLogs(userId: number): Promise<WorkoutLog[]>;
  createWorkoutLog(data: InsertWorkoutLog, userId: number): Promise<WorkoutLog>;
  updateWorkoutLog(id: number, data: Partial<InsertWorkoutLog>): Promise<WorkoutLog | undefined>;
  deleteWorkoutLog(id: number): Promise<boolean>;
  // Goals
  getAllGoalsWithProjects(userId: number): Promise<GoalWithProjects[]>;
  getAllGoalsWithTasks(userId: number): Promise<GoalWithTasks[]>;
  createGoal(data: InsertGoal, userId: number): Promise<Goal>;
  updateGoal(id: number, data: Partial<InsertGoal>): Promise<Goal | undefined>;
  deleteGoal(id: number): Promise<boolean>;
  // Goal Tasks (legacy)
  createGoalTask(data: InsertGoalTask): Promise<GoalTask>;
  updateGoalTask(id: number, data: Partial<InsertGoalTask>): Promise<GoalTask | undefined>;
  deleteGoalTask(id: number): Promise<boolean>;
  // Projects
  getProjectsForGoal(goalId: number): Promise<ProjectWithTasks[]>;
  getStandaloneProjects(userId: number): Promise<ProjectWithTasks[]>;
  createProject(data: InsertProject, userId: number): Promise<Project>;
  updateProject(id: number, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: number): Promise<boolean>;
  // Project Tasks
  createProjectTask(data: InsertProjectTask): Promise<ProjectTask>;
  updateProjectTask(id: number, data: Partial<InsertProjectTask>): Promise<ProjectTask | undefined>;
  deleteProjectTask(id: number): Promise<boolean>;
  // General Tasks
  getAllGeneralTasks(userId: number): Promise<GeneralTask[]>;
  createGeneralTask(data: InsertGeneralTask, userId: number): Promise<GeneralTask>;
  updateGeneralTask(id: number, data: Partial<InsertGeneralTask>): Promise<GeneralTask | undefined>;
  deleteGeneralTask(id: number): Promise<boolean>;
  // Recipes
  getAllRecipes(userId: number): Promise<Recipe[]>;
  createRecipe(data: InsertRecipe, userId: number): Promise<Recipe>;
  updateRecipe(id: number, data: Partial<InsertRecipe>): Promise<Recipe | undefined>;
  deleteRecipe(id: number): Promise<boolean>;
  // Meal Bundles
  getAllBundles(userId: number): Promise<MealBundle[]>;
  createBundle(data: InsertMealBundle, userId: number): Promise<MealBundle>;
  updateBundle(id: number, data: Partial<InsertMealBundle>): Promise<MealBundle | undefined>;
  deleteBundle(id: number): Promise<boolean>;
  // Week Plan
  getWeekPlan(weekStart: string, userId: number): Promise<WeekPlan[]>;
  assignToWeek(data: InsertWeekPlan, userId: number): Promise<WeekPlan>;
  removeWeekAssignment(id: number): Promise<boolean>;
  // Grocery Checks
  getGroceryChecks(weekStart: string, userId: number): Promise<GroceryCheck[]>;
  upsertGroceryCheck(weekStart: string, itemKey: string, checked: boolean, userId: number): Promise<GroceryCheck>;
  // Custom Grocery Items
  getCustomGroceryItems(weekStart: string, userId: number): Promise<CustomGroceryItem[]>;
  addCustomGroceryItem(data: InsertCustomGroceryItem, userId: number): Promise<CustomGroceryItem>;
  updateCustomGroceryItem(id: number, data: Partial<InsertCustomGroceryItem>): Promise<CustomGroceryItem | undefined>;
  deleteCustomGroceryItem(id: number): Promise<boolean>;
  // Relationship Groups
  getAllGroups(userId: number): Promise<RelationshipGroup[]>;
  createGroup(data: InsertRelationshipGroup, userId: number): Promise<RelationshipGroup>;
  updateGroup(id: number, data: Partial<InsertRelationshipGroup>): Promise<RelationshipGroup | undefined>;
  deleteGroup(id: number): Promise<boolean>;
  // People
  getAllPeople(userId: number): Promise<PersonWithSpouse[]>;
  createPerson(data: InsertPerson, userId: number): Promise<Person>;
  updatePerson(id: number, data: Partial<InsertPerson>): Promise<Person | undefined>;
  deletePerson(id: number): Promise<boolean>;
  // Movies
  getAllMovies(userId: number): Promise<Movie[]>;
  createMovie(data: InsertMovie, userId: number): Promise<Movie>;
  updateMovie(id: number, data: Partial<InsertMovie>): Promise<Movie | undefined>;
  deleteMovie(id: number): Promise<boolean>;
  // Budget Categories
  getAllBudgetCategories(userId: number): Promise<BudgetCategory[]>;
  createBudgetCategory(data: InsertBudgetCategory, userId: number): Promise<BudgetCategory>;
  updateBudgetCategory(id: number, data: Partial<InsertBudgetCategory>): Promise<BudgetCategory | undefined>;
  deleteBudgetCategory(id: number): Promise<boolean>;
  // Transactions
  getAllTransactions(userId: number): Promise<Transaction[]>;
  createTransaction(data: InsertTransaction, userId: number): Promise<Transaction>;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Promise<Transaction | undefined>;
  deleteTransaction(id: number): Promise<boolean>;
  // Subscriptions
  getAllSubscriptions(userId: number): Promise<Subscription[]>;
  createSubscription(data: InsertSubscription, userId: number): Promise<Subscription>;
  updateSubscription(id: number, data: Partial<InsertSubscription>): Promise<Subscription | undefined>;
  deleteSubscription(id: number): Promise<boolean>;
  // Receipts
  getAllReceipts(userId: number): Promise<Receipt[]>;
  createReceiptRecord(data: InsertReceipt, userId: number): Promise<Receipt>;
  updateReceiptRecord(id: number, data: Partial<InsertReceipt>): Promise<Receipt | undefined>;
  deleteReceiptRecord(id: number): Promise<boolean>;
  // Nav Prefs
  getNavPrefs(userId: number): Promise<NavPref[]>;
  saveNavPrefs(userId: number, prefs: NavPref[]): Promise<void>;
  getTabPrivacy(userId: number): Promise<TabPrivacySetting[]>;
  saveTabPrivacy(userId: number, settings: TabPrivacySetting[]): Promise<void>;
  getFriendProfile(viewerId: number, targetId: number): Promise<{
    user: { id: number; name: string; avatarUrl: string | null; email: string };
    visibleTabs: string[];
    data: Record<string, any>;
  } | null>;
  // Users
  upsertUser(data: { googleId: string; email: string; name: string; avatarUrl: string | null }): Promise<User>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createLocalUser(data: { email: string; name: string; passwordHash: string }): Promise<User>;
  setPasswordHash(userId: number, hash: string): Promise<void>;
  getUserById(id: number): Promise<User | undefined>;
  completeOnboarding(userId: number): Promise<void>;
  deleteAccount(userId: number): Promise<void>;
  // Strava tokens
  saveStravaTokens(userId: number, accessToken: string, refreshToken: string, expiry: string, athleteId: string): Promise<void>;
  getStravaTokens(userId: number): Promise<{ accessToken: string; refreshToken: string; expiry: string; athleteId: string } | null>;
  clearStravaTokens(userId: number): Promise<void>;
  // Facebook
  saveFacebookProfile(userId: number, data: { accessToken: string; fbUserId: string; name: string; email: string | null; avatarUrl: string | null; birthday: string | null }): Promise<void>;
  getFacebookProfile(userId: number): Promise<{ accessToken: string; fbUserId: string; name: string; email: string | null; avatarUrl: string | null; birthday: string | null; lastSync: string | null } | null>;
  clearFacebookProfile(userId: number): Promise<void>;
  upsertFacebookFriends(userId: number, friends: Array<{ fbFriendId: string; name: string; birthday?: string | null; birthdayRaw?: string | null; avatarUrl?: string | null; location?: string | null }>): Promise<number>;
  getFacebookFriends(userId: number): Promise<Array<{ id: number; fbFriendId: string; name: string; birthday: string | null; avatarUrl: string | null; location: string | null; importedAt: string }>>;
  setFacebookLastSync(userId: number, ts: string): Promise<void>;
  // LinkedIn
  saveLinkedinProfile(userId: number, data: { accessToken: string; profileId: string; name: string; headline: string | null; avatarUrl: string | null; email: string | null }): Promise<void>;
  getLinkedinProfile(userId: number): Promise<{ accessToken: string; profileId: string; name: string; headline: string | null; avatarUrl: string | null; email: string | null } | null>;
  clearLinkedinProfile(userId: number): Promise<void>;
  importLinkedinContacts(userId: number, contacts: Array<{ firstName: string; lastName?: string; email?: string; company?: string; position?: string; connectedOn?: string }>): Promise<number>;
  getLinkedinContacts(userId: number): Promise<Array<{ id: number; firstName: string; lastName: string | null; email: string | null; company: string | null; position: string | null; connectedOn: string | null; importedAt: string }>>;
  // Google Contacts
  saveGoogleContactsTokens(userId: number, data: { accessToken: string; refreshToken: string | null; expiry: string }): Promise<void>;
  getGoogleContactsTokens(userId: number): Promise<{ accessToken: string; refreshToken: string | null; expiry: string } | null>;
  clearGoogleContactsTokens(userId: number): Promise<void>;
  upsertGoogleContacts(userId: number, contacts: Array<{ resourceName: string; firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null; birthday?: string | null; avatarUrl?: string | null; company?: string | null }>): Promise<number>;
  getGoogleContacts(userId: number): Promise<Array<{ id: number; resourceName: string; firstName: string | null; lastName: string | null; email: string | null; phone: string | null; birthday: string | null; avatarUrl: string | null; company: string | null; importedAt: string }>>;
  setGoogleContactsLastSync(userId: number, ts: string): Promise<void>;
  // Google Calendar tokens
  saveGcalTokens(userId: number, accessToken: string, refreshToken: string | null, expiry: string): Promise<void>;
  getGcalTokens(userId: number): Promise<{ accessToken: string; refreshToken: string | null; expiry: string } | null>;
  clearGcalTokens(userId: number): Promise<void>;
  updateGcalLastSync(userId: number, ts: string): Promise<void>;
  upsertGcalEvent(data: { userId: number; title: string; date: string; endDate: string | null; description: string | null; gcalEventId: string }): Promise<void>;
  deleteGcalEvents(userId: number): Promise<void>;
  deleteStaleGcalEvents(userId: number, currentIds: string[]): Promise<void>;
  // Plants
  getAllPlants(userId: number): Promise<Plant[]>;
  createPlant(data: InsertPlant, userId: number): Promise<Plant>;
  updatePlant(id: number, data: Partial<InsertPlant>): Promise<Plant | undefined>;
  deletePlant(id: number): Promise<boolean>;
  // Music Artists
  getAllMusicArtistsWithSongs(userId: number): Promise<MusicArtistWithSongs[]>;
  createMusicArtist(data: InsertMusicArtist, userId: number): Promise<MusicArtist>;
  updateMusicArtist(id: number, data: Partial<InsertMusicArtist>): Promise<MusicArtist | undefined>;
  deleteMusicArtist(id: number): Promise<boolean>;
  // Music Songs
  createMusicSong(data: InsertMusicSong, userId: number): Promise<MusicSong>;
  updateMusicSong(id: number, data: Partial<InsertMusicSong>): Promise<MusicSong | undefined>;
  deleteMusicSong(id: number): Promise<boolean>;
  // Chores
  getAllChores(userId: number): Promise<Chore[]>;
  createChore(data: InsertChore, userId: number): Promise<Chore>;
  updateChore(id: number, data: Partial<InsertChore>): Promise<Chore | undefined>;
  deleteChore(id: number): Promise<boolean>;
  // House Projects
  getAllHouseProjects(userId: number): Promise<HouseProjectWithTasks[]>;
  createHouseProject(data: InsertHouseProject, userId: number): Promise<HouseProject>;
  updateHouseProject(id: number, data: Partial<InsertHouseProject>): Promise<HouseProject | undefined>;
  deleteHouseProject(id: number): Promise<boolean>;
  // House Project Tasks
  createHouseProjectTask(data: InsertHouseProjectTask, userId: number): Promise<HouseProjectTask>;
  updateHouseProjectTask(id: number, data: Partial<InsertHouseProjectTask>): Promise<HouseProjectTask | undefined>;
  deleteHouseProjectTask(id: number): Promise<boolean>;
  // Appliances
  getAllAppliances(userId: number): Promise<Appliance[]>;
  createAppliance(data: InsertAppliance, userId: number): Promise<Appliance>;
  updateAppliance(id: number, data: Partial<InsertAppliance>): Promise<Appliance | undefined>;
  deleteAppliance(id: number): Promise<boolean>;
  // Spots
  getAllSpots(userId: number): Promise<Spot[]>;
  createSpot(data: InsertSpot, userId: number): Promise<Spot>;
  updateSpot(id: number, data: Partial<InsertSpot>): Promise<Spot | undefined>;
  deleteSpot(id: number): Promise<boolean>;
  // Trips
  getAllTrips(userId: number): Promise<Trip[]>;
  createTrip(data: InsertTrip, userId: number): Promise<Trip>;
  updateTrip(id: number, data: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: number): Promise<boolean>;
  getTripItems(tripId: number): Promise<TripItem[]>;
  createTripItem(data: InsertTripItem, userId: number): Promise<TripItem>;
  updateTripItem(id: number, data: Partial<InsertTripItem>): Promise<TripItem | undefined>;
  deleteTripItem(id: number): Promise<boolean>;
  // Children
  getAllChildrenWithDetails(userId: number): Promise<ChildWithDetails[]>;
  createChild(data: InsertChild, userId: number): Promise<Child>;
  updateChild(id: number, data: Partial<InsertChild>): Promise<Child | undefined>;
  deleteChild(id: number): Promise<boolean>;
  // Child Milestones
  createChildMilestone(data: InsertChildMilestone, userId: number): Promise<ChildMilestone>;
  updateChildMilestone(id: number, data: Partial<InsertChildMilestone>): Promise<ChildMilestone | undefined>;
  deleteChildMilestone(id: number): Promise<boolean>;
  // Child Memories
  createChildMemory(data: InsertChildMemory, userId: number): Promise<ChildMemory>;
  updateChildMemory(id: number, data: Partial<InsertChildMemory>): Promise<ChildMemory | undefined>;
  deleteChildMemory(id: number): Promise<boolean>;
  // Child Prep Items
  createChildPrepItem(data: InsertChildPrepItem, userId: number): Promise<ChildPrepItem>;
  updateChildPrepItem(id: number, data: Partial<InsertChildPrepItem>): Promise<ChildPrepItem | undefined>;
  deleteChildPrepItem(id: number): Promise<boolean>;
  // Pets
  getAllPetsWithVisits(userId: number): Promise<PetWithVisits[]>;
  createPet(data: InsertPet, userId: number): Promise<Pet>;
  updatePet(id: number, data: Partial<InsertPet>): Promise<Pet | undefined>;
  deletePet(id: number): Promise<boolean>;
  createPetVetVisit(data: InsertPetVetVisit, userId: number): Promise<PetVetVisit>;
  updatePetVetVisit(id: number, data: Partial<InsertPetVetVisit>): Promise<PetVetVisit | undefined>;
  deletePetVetVisit(id: number): Promise<boolean>;
  // Quotes
  getAllQuotes(userId: number): Promise<Quote[]>;
  createQuote(data: InsertQuote, userId: number): Promise<Quote>;
  updateQuote(id: number, data: Partial<InsertQuote>): Promise<Quote | undefined>;
  deleteQuote(id: number): Promise<boolean>;
  // Mantras
  getAllMantras(userId: number): Promise<Mantra[]>;
  createMantra(data: InsertMantra, userId: number): Promise<Mantra>;
  updateMantra(id: number, data: Partial<InsertMantra>): Promise<Mantra | undefined>;
  deleteMantra(id: number): Promise<boolean>;
  // Art Pieces
  getAllArtPieces(userId: number): Promise<ArtPiece[]>;
  createArtPiece(data: InsertArtPiece, userId: number): Promise<ArtPiece>;
  updateArtPiece(id: number, data: Partial<InsertArtPiece>): Promise<ArtPiece | undefined>;
  deleteArtPiece(id: number): Promise<boolean>;
  // Journal
  getJournalEntries(userId: number): Promise<JournalEntry[]>;
  createJournalEntry(data: InsertJournalEntry, userId: number): Promise<JournalEntry>;
  updateJournalEntry(id: number, data: Partial<InsertJournalEntry>): Promise<JournalEntry | null>;
  deleteJournalEntry(id: number): Promise<boolean>;
  // Equipment
  getAllEquipment(userId: number): Promise<Equipment[]>;
  createEquipment(data: InsertEquipment, userId: number): Promise<Equipment>;
  updateEquipment(id: number, data: Partial<InsertEquipment>): Promise<Equipment | undefined>;
  deleteEquipment(id: number): Promise<boolean>;
  // Hobbies
  getAllHobbies(userId: number): Promise<Hobby[]>;
  createHobby(data: InsertHobby, userId: number): Promise<Hobby>;
  updateHobby(id: number, data: Partial<InsertHobby>): Promise<Hobby | undefined>;
  deleteHobby(id: number): Promise<boolean>;
  // Music Collections
  getAllCollections(userId: number): Promise<MusicCollectionWithItems[]>;
  createCollection(data: Partial<InsertMusicCollection>, userId: number): Promise<MusicCollection>;
  updateCollection(id: number, data: Partial<InsertMusicCollection>): Promise<MusicCollection | undefined>;
  deleteCollection(id: number): Promise<boolean>;
  addCollectionItem(collectionId: number, itemType: string, songId?: number | null, artistId?: number | null): Promise<MusicCollectionItem>;
  removeCollectionItem(itemId: number): Promise<boolean>;
  reorderCollectionItems(collectionId: number, itemIds: number[]): Promise<void>;
  // Quote Shares
  sendQuoteShare(data: InsertQuoteShare): Promise<QuoteShare>;
  getQuoteShares(userId: number): Promise<{ received: QuoteShareWithUser[]; sent: QuoteShareWithUser[] }>;
  dismissQuoteShare(id: number, userId: number): Promise<boolean>;
  deleteQuoteShare(id: number, userId: number): Promise<boolean>;
  // Art Shares
  sendArtShare(data: InsertArtShare): Promise<ArtShare>;
  getArtShares(userId: number): Promise<{ received: ArtShareWithUser[]; sent: ArtShareWithUser[] }>;
  dismissArtShare(id: number, userId: number): Promise<boolean>;
  deleteArtShare(id: number, userId: number): Promise<boolean>;
  // Spot Shares
  sendSpotShare(data: InsertSpotShare): Promise<SpotShare>;
  getSpotShares(userId: number): Promise<{ received: SpotShareWithUser[]; sent: SpotShareWithUser[] }>;
  dismissSpotShare(id: number, userId: number): Promise<boolean>;
  deleteSpotShare(id: number, userId: number): Promise<boolean>;
  // Movie Shares
  sendMovieShare(data: InsertMovieShare): Promise<MovieShare>;
  getMovieShares(userId: number): Promise<{ received: MovieShareWithUser[]; sent: MovieShareWithUser[] }>;
  dismissMovieShare(id: number, userId: number): Promise<boolean>;
  deleteMovieShare(id: number, userId: number): Promise<boolean>;
  // Recipe Shares
  sendRecipeShare(data: InsertRecipeShare): Promise<RecipeShare>;
  getRecipeShares(userId: number): Promise<{ received: RecipeShareWithUser[]; sent: RecipeShareWithUser[] }>;
  dismissRecipeShare(id: number, userId: number): Promise<boolean>;
  deleteRecipeShare(id: number, userId: number): Promise<boolean>;
  // Music Recommendations
  sendMusicRecommendation(data: InsertMusicRecommendation): Promise<MusicRecommendation>;
  getMusicRecommendations(userId: number): Promise<{ received: MusicRecommendationWithUser[]; sent: MusicRecommendationWithUser[] }>;
  dismissMusicRecommendation(id: number, userId: number): Promise<boolean>;
  deleteMusicRecommendation(id: number, userId: number): Promise<boolean>;
  // Book Recommendations
  sendBookRecommendation(data: InsertBookRecommendation): Promise<BookRecommendation>;
  getBookRecommendations(userId: number): Promise<{ received: BookRecommendationWithUser[]; sent: BookRecommendationWithUser[] }>;
  dismissBookRecommendation(id: number, userId: number): Promise<boolean>;
  deleteBookRecommendation(id: number, userId: number): Promise<boolean>;
  // Friends
  searchUsers(query: string, currentUserId: number): Promise<PublicUser[]>;
  sendFriendRequest(fromUserId: number, toUserId: number): Promise<FriendRequest>;
  getFriendRequests(userId: number): Promise<{ incoming: FriendRequestWithUser[]; outgoing: FriendRequestWithUser[] }>;
  respondFriendRequest(id: number, status: "accepted" | "declined", userId: number): Promise<FriendRequest | null>;
  cancelFriendRequest(id: number, fromUserId: number): Promise<boolean>;
  getFriends(userId: number): Promise<PublicUser[]>;
  unfriend(userId: number, friendId: number): Promise<boolean>;
  getPendingIncomingCount(userId: number): Promise<number>;
  getUnreadSharesCount(userId: number): Promise<{ total: number; books: number; music: number; recipes: number; movies: number; spots: number; art: number; quotes: number; workouts: number }>;
  markSharesRead(type: string, userId: number): Promise<void>;
  // Workout Plans
  getAllWorkoutPlans(userId: number): Promise<WorkoutPlan[]>;
  createWorkoutPlan(data: InsertWorkoutPlan, userId: number): Promise<WorkoutPlan>;
  updateWorkoutPlan(id: number, data: Partial<InsertWorkoutPlan>): Promise<WorkoutPlan | null>;
  deleteWorkoutPlan(id: number): Promise<boolean>;
  // Body Composition Plans
  getBodyCompPlans(userId: number): Promise<BodyCompPlan[]>;
  createBodyCompPlan(data: InsertBodyCompPlan, userId: number): Promise<BodyCompPlan>;
  updateBodyCompPlan(id: number, data: Partial<InsertBodyCompPlan>): Promise<BodyCompPlan | null>;
  deleteBodyCompPlan(id: number, userId: number): Promise<boolean>;
  getBodyCompCheckIns(planId: number, userId: number): Promise<BodyCompCheckIn[]>;
  createBodyCompCheckIn(data: InsertBodyCompCheckIn, userId: number): Promise<BodyCompCheckIn>;
  deleteBodyCompCheckIn(id: number, userId: number): Promise<boolean>;
  // Workout Shares
  createWorkoutShare(data: InsertWorkoutShare): Promise<WorkoutShare>;
  getWorkoutShares(userId: number): Promise<WorkoutShareWithUser[]>;
  dismissWorkoutShare(id: number, userId: number): Promise<void>;
  // Tab Collaborations
  getTabCollaborations(userId: number): Promise<TabCollaborationWithUser[]>;
  createTabCollaboration(data: InsertTabCollaboration): Promise<TabCollaboration>;
  updateTabCollaborationStatus(id: number, status: string): Promise<TabCollaboration | undefined>;
  deleteTabCollaboration(id: number): Promise<boolean>;
  getTabUserId(requestingUserId: number, tabName: string): Promise<number>;
  // Faith & Spirituality (private — never exposed to friends/recommendations)
  getSacredTexts(userId: number): Promise<SacredText[]>;
  createSacredText(data: InsertSacredText): Promise<SacredText>;
  updateSacredText(id: number, data: Partial<InsertSacredText>): Promise<SacredText | undefined>;
  deleteSacredText(id: number): Promise<boolean>;
  getFaithPractices(userId: number): Promise<FaithPractice[]>;
  createFaithPractice(data: InsertFaithPractice): Promise<FaithPractice>;
  updateFaithPractice(id: number, data: Partial<InsertFaithPractice>): Promise<FaithPractice | undefined>;
  deleteFaithPractice(id: number): Promise<boolean>;
  getSermons(userId: number): Promise<Sermon[]>;
  createSermon(data: InsertSermon): Promise<Sermon>;
  updateSermon(id: number, data: Partial<InsertSermon>): Promise<Sermon | undefined>;
  deleteSermon(id: number): Promise<boolean>;
  getPrayerItems(userId: number): Promise<PrayerItem[]>;
  createPrayerItem(data: InsertPrayerItem): Promise<PrayerItem>;
  updatePrayerItem(id: number, data: Partial<InsertPrayerItem>): Promise<PrayerItem | undefined>;
  deletePrayerItem(id: number): Promise<boolean>;

  // Health
  getMedications(userId: number): Promise<import("@shared/schema").Medication[]>;
  createMedication(data: import("@shared/schema").InsertMedication, userId: number): Promise<import("@shared/schema").Medication>;
  updateMedication(id: number, data: Partial<import("@shared/schema").InsertMedication>): Promise<import("@shared/schema").Medication | undefined>;
  deleteMedication(id: number): Promise<boolean>;
  getHealthMetrics(userId: number): Promise<import("@shared/schema").HealthMetric[]>;
  createHealthMetric(data: import("@shared/schema").InsertHealthMetric, userId: number): Promise<import("@shared/schema").HealthMetric>;
  deleteHealthMetric(id: number): Promise<boolean>;
  getSleepLogs(userId: number): Promise<import("@shared/schema").SleepLog[]>;
  createSleepLog(data: import("@shared/schema").InsertSleepLog, userId: number): Promise<import("@shared/schema").SleepLog>;
  updateSleepLog(id: number, data: Partial<import("@shared/schema").InsertSleepLog>): Promise<import("@shared/schema").SleepLog | undefined>;
  deleteSleepLog(id: number): Promise<boolean>;

  // Care Team
  getCareProviders(userId: number): Promise<import("@shared/schema").CareProvider[]>;
  createCareProvider(data: import("@shared/schema").InsertCareProvider, userId: number): Promise<import("@shared/schema").CareProvider>;
  updateCareProvider(id: number, data: Partial<import("@shared/schema").InsertCareProvider>): Promise<import("@shared/schema").CareProvider | undefined>;
  deleteCareProvider(id: number): Promise<boolean>;
  // Politics
  getPoliticalOfficials(userId: number): Promise<import("@shared/schema").PoliticalOfficial[]>;
  createPoliticalOfficial(data: import("@shared/schema").InsertPoliticalOfficial, userId: number): Promise<import("@shared/schema").PoliticalOfficial>;
  updatePoliticalOfficial(id: number, data: Partial<import("@shared/schema").InsertPoliticalOfficial>): Promise<import("@shared/schema").PoliticalOfficial | undefined>;
  deletePoliticalOfficial(id: number): Promise<boolean>;
  getPoliticalIssues(userId: number): Promise<import("@shared/schema").PoliticalIssue[]>;
  createPoliticalIssue(data: import("@shared/schema").InsertPoliticalIssue, userId: number): Promise<import("@shared/schema").PoliticalIssue>;
  updatePoliticalIssue(id: number, data: Partial<import("@shared/schema").InsertPoliticalIssue>): Promise<import("@shared/schema").PoliticalIssue | undefined>;
  deletePoliticalIssue(id: number): Promise<boolean>;
  getPoliticalElections(userId: number): Promise<import("@shared/schema").PoliticalElection[]>;
  createPoliticalElection(data: import("@shared/schema").InsertPoliticalElection, userId: number): Promise<import("@shared/schema").PoliticalElection>;
  updatePoliticalElection(id: number, data: Partial<import("@shared/schema").InsertPoliticalElection>): Promise<import("@shared/schema").PoliticalElection | undefined>;
  deletePoliticalElection(id: number): Promise<boolean>;
  getCivicActions(userId: number): Promise<import("@shared/schema").CivicAction[]>;
  createCivicAction(data: import("@shared/schema").InsertCivicAction, userId: number): Promise<import("@shared/schema").CivicAction>;
  updateCivicAction(id: number, data: Partial<import("@shared/schema").InsertCivicAction>): Promise<import("@shared/schema").CivicAction | undefined>;
  deleteCivicAction(id: number): Promise<boolean>;
  getPoliticalNewsSources(userId: number): Promise<import("@shared/schema").PoliticalNewsSource[]>;
  createPoliticalNewsSource(data: import("@shared/schema").InsertPoliticalNewsSource, userId: number): Promise<import("@shared/schema").PoliticalNewsSource>;
  updatePoliticalNewsSource(id: number, data: Partial<import("@shared/schema").InsertPoliticalNewsSource>): Promise<import("@shared/schema").PoliticalNewsSource | undefined>;
  deletePoliticalNewsSource(id: number): Promise<boolean>;
  // Activity Feed
  logActivity(userId: number, type: string, itemId: number | null, itemType: string | null, title: string | null, imageUrl: string | null, subtitle: string | null, extra?: string): Promise<void>;
  getFeedForUser(userId: number, page: number, pageSize: number): Promise<{ items: any[]; total: number }>;
  getMyRecentActivity(userId: number, limit?: number): Promise<any[]>;
  toggleReaction(feedItemId: number, userId: number, emoji: string): Promise<void>;
  addComment(feedItemId: number, userId: number, content: string): Promise<any>;
  // Habits
  getHabits(userId: number): Promise<HabitWithStats[]>;
  createHabit(userId: number, data: Partial<InsertHabit>): Promise<Habit>;
  updateHabit(id: number, userId: number, data: Partial<InsertHabit>): Promise<Habit>;
  deleteHabit(id: number, userId: number): Promise<void>;
  toggleHabitCompletion(id: number, userId: number, date: string, note?: string): Promise<Habit>;
  // Notifications
  createNotification(n: { userId: number; type: string; title: string; body?: string | null; href?: string | null; actorId?: number | null }): Promise<any>;
  getNotifications(userId: number, limit?: number): Promise<any[]>;
  getUnreadNotificationCount(userId: number): Promise<number>;
  markAllNotificationsRead(userId: number): Promise<void>;
  hasNotificationToday(userId: number, type: string, todayISO: string): Promise<boolean>;
  // Today (unified agenda)
  getTodayItems(userId: number, today: string): Promise<{
    date: string;
    items: Array<{ type: string; id: number; title: string; sub: string | null; href: string; dueDate: string | null; overdue: boolean; done: boolean }>;
    counts: { total: number; overdue: number; done: number };
  }>;
}

// ── Habit streak helpers ─────────────────────────────────────────────────────
// Streak insurance: every 7 completions in the last 60 days banks a "freeze"
// (max 2). A freeze automatically covers a single missed day so one off-day
// doesn't zero out weeks of consistency. Two consecutive missed days (or more
// gaps than banked freezes) still break the streak.
function computeHabitStreakInfo(completions: { date: string }[]): { streak: number; freezesAvailable: number; freezesUsed: number } {
  if (!completions.length) return { streak: 0, freezesAvailable: 0, freezesUsed: 0 };
  const dates = new Set(completions.map(c => c.date));
  const today = new Date();
  const dayStr = (offset: number) => {
    const d = new Date(today); d.setDate(d.getDate() - offset);
    return d.toISOString().slice(0, 10);
  };
  const cutoff = dayStr(60);
  const recentCount = completions.filter(c => c.date >= cutoff).length;
  const bank = Math.min(2, Math.floor(recentCount / 7));
  let streak = 0, used = 0;
  for (let i = 0; i <= 365; i++) {
    const ds = dayStr(i);
    if (dates.has(ds)) { streak++; continue; }
    if (i === 0) continue; // today not logged yet — no penalty
    // Missed day: a freeze can bridge it, but only a single-day gap
    if (bank - used > 0 && dates.has(dayStr(i + 1))) { used++; continue; }
    break;
  }
  return { streak, freezesAvailable: Math.max(0, bank - used), freezesUsed: used };
}
function computeHabitStreak(completions: { date: string }[], _targetDays: number, _frequency: string): number {
  return computeHabitStreakInfo(completions).streak;
}
function computeHabitBestStreak(completions: { date: string }[]): number {
  if (!completions.length) return 0;
  const sorted = [...completions].sort((a, b) => a.date.localeCompare(b.date));
  let best = 1, cur = 1;
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].date); prev.setDate(prev.getDate() + 1);
    if (prev.toISOString().slice(0, 10) === sorted[i].date) { cur++; if (cur > best) best = cur; } else cur = 1;
  }
  return best;
}

export const storage: IStorage = {
  // ── Events ──────────────────────────────────────────────────────────────────
  async getAllEventsWithTasks(userId: number) {
    const evs = await db.select().from(events).where(eq(events.userId, userId)).orderBy(asc(events.date));
    const tks = await db.select().from(tasks).orderBy(asc(tasks.sortOrder));
    return evs.map((e) => ({ ...e, tasks: tks.filter((t) => t.eventId === e.id) }));
  },
  async createEvent(data, userId) {
    const result = await db.insert(events).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateEvent(id, data) {
    const existing = await db.select().from(events).where(eq(events.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(events).set(data).where(eq(events.id, id)).returning();
    return result[0];
  },
  async deleteEvent(id) {
    await pool.query(`DELETE FROM tasks WHERE event_id = $1`, [id]);
    const result = await db.delete(events).where(eq(events.id, id));
    return result.rowCount > 0;
  },

  // ── Tasks ────────────────────────────────────────────────────────────────────
  async createTask(data) {
    const result = await db.insert(tasks).values(data).returning();
    return result[0];
  },
  async updateTask(id, data) {
    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(tasks).set(data).where(eq(tasks.id, id)).returning();
    return result[0];
  },
  async deleteTask(id) {
    const result = await db.delete(tasks).where(eq(tasks.id, id));
    return result.rowCount > 0;
  },

  // ── Books ────────────────────────────────────────────────────────────────────
  async getAllBooks(userId: number) {
    return db.select().from(books).where(eq(books.userId, userId)).orderBy(asc(books.title));
  },
  async getAllBooksWithSessions(userId: number) {
    const bs = await db.select().from(books).where(eq(books.userId, userId)).orderBy(asc(books.title));
    const ss = await db.select().from(readingSessions).orderBy(desc(readingSessions.date));
    return bs.map((b) => ({ ...b, sessions: ss.filter((s) => s.bookId === b.id) }));
  },
  async createBook(data, userId) {
    const result = await db.insert(books).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateBook(id, data) {
    const existing = await db.select().from(books).where(eq(books.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(books).set(data).where(eq(books.id, id)).returning();
    return result[0];
  },
  async deleteBook(id) {
    await pool.query(`DELETE FROM reading_sessions WHERE book_id = $1`, [id]);
    const result = await db.delete(books).where(eq(books.id, id));
    return result.rowCount > 0;
  },

  // ── Reading Sessions ──────────────────────────────────────────────────────────
  async getAllReadingSessions() {
    return db.select().from(readingSessions).orderBy(desc(readingSessions.date));
  },
  async createReadingSession(data) {
    const result = await db.insert(readingSessions).values(data).returning();
    return result[0];
  },
  async updateReadingSession(id, data) {
    const existing = await db.select().from(readingSessions).where(eq(readingSessions.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(readingSessions).set(data).where(eq(readingSessions.id, id)).returning();
    return result[0];
  },
  async deleteReadingSession(id) {
    const result = await db.delete(readingSessions).where(eq(readingSessions.id, id));
    return result.rowCount > 0;
  },

  // ── Workout Templates ─────────────────────────────────────────────────────────
  async getAllWorkoutTemplates(userId: number) {
    return db.select().from(workoutTemplates).where(eq(workoutTemplates.userId, userId)).orderBy(asc(workoutTemplates.name));
  },
  async createWorkoutTemplate(data, userId) {
    const result = await db.insert(workoutTemplates).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateWorkoutTemplate(id, data) {
    const existing = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(workoutTemplates).set(data).where(eq(workoutTemplates.id, id)).returning();
    return result[0];
  },
  async deleteWorkoutTemplate(id) {
    const result = await db.delete(workoutTemplates).where(eq(workoutTemplates.id, id));
    return result.rowCount > 0;
  },

  // ── Workout Logs ──────────────────────────────────────────────────────────────
  async getAllWorkoutLogs(userId: number) {
    return db.select().from(workoutLogs).where(eq(workoutLogs.userId, userId)).orderBy(desc(workoutLogs.date));
  },
  async createWorkoutLog(data, userId) {
    const result = await db.insert(workoutLogs).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateWorkoutLog(id, data) {
    const existing = await db.select().from(workoutLogs).where(eq(workoutLogs.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(workoutLogs).set(data).where(eq(workoutLogs.id, id)).returning();
    return result[0];
  },
  async deleteWorkoutLog(id) {
    const result = await db.delete(workoutLogs).where(eq(workoutLogs.id, id));
    return result.rowCount > 0;
  },

  // ── Goals ─────────────────────────────────────────────────────────────────────
  async getAllGoalsWithProjects(userId: number) {
    const gs = await db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.title));
    const ps = await db.select().from(projects).where(eq(projects.userId, userId)).orderBy(asc(projects.sortOrder));
    const pts = await db.select().from(projectTasks).orderBy(asc(projectTasks.sortOrder));
    return gs.map((g) => ({
      ...g,
      projects: ps
        .filter((p) => p.goalId === g.id)
        .map((p) => ({ ...p, tasks: pts.filter((t) => t.projectId === p.id) })),
    }));
  },
  async getAllGoalsWithTasks(userId: number) {
    const gs = await db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.title));
    const gts = await db.select().from(goalTasks).orderBy(asc(goalTasks.sortOrder));
    return gs.map((g) => ({ ...g, tasks: gts.filter((t) => t.goalId === g.id) }));
  },
  async createGoal(data, userId) {
    const result = await db.insert(goals).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateGoal(id, data) {
    const existing = await db.select().from(goals).where(eq(goals.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(goals).set(data).where(eq(goals.id, id)).returning();
    return result[0];
  },
  async deleteGoal(id) {
    const ps = await db.select().from(projects).where(eq(projects.goalId, id));
    for (const p of ps) {
      await pool.query(`DELETE FROM project_tasks WHERE project_id = $1`, [p.id]);
    }
    await pool.query(`DELETE FROM projects WHERE goal_id = $1`, [id]);
    await pool.query(`DELETE FROM goal_tasks WHERE goal_id = $1`, [id]);
    const result = await db.delete(goals).where(eq(goals.id, id));
    return result.rowCount > 0;
  },

  // ── Goal Tasks (legacy) ───────────────────────────────────────────────────────
  async createGoalTask(data) {
    const result = await db.insert(goalTasks).values(data).returning();
    return result[0];
  },
  async updateGoalTask(id, data) {
    const existing = await db.select().from(goalTasks).where(eq(goalTasks.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(goalTasks).set(data).where(eq(goalTasks.id, id)).returning();
    return result[0];
  },
  async deleteGoalTask(id) {
    const result = await db.delete(goalTasks).where(eq(goalTasks.id, id));
    return result.rowCount > 0;
  },

  // ── Projects ──────────────────────────────────────────────────────────────────
  async getProjectsForGoal(goalId) {
    const ps = await db.select().from(projects).where(eq(projects.goalId, goalId)).orderBy(asc(projects.sortOrder));
    const pts = await db.select().from(projectTasks).orderBy(asc(projectTasks.sortOrder));
    return ps.map((p) => ({ ...p, tasks: pts.filter((t) => t.projectId === p.id) }));
  },
  async getStandaloneProjects(userId: number) {
    const ps = await db.select().from(projects).where(eq(projects.userId, userId)).orderBy(asc(projects.sortOrder));
    const filtered = ps.filter((p) => p.goalId == null);
    filtered.sort((a, b) => a.sortOrder - b.sortOrder);
    const pts = await db.select().from(projectTasks).orderBy(asc(projectTasks.sortOrder));
    return filtered.map((p) => ({ ...p, tasks: pts.filter((t) => t.projectId === p.id) }));
  },
  async createProject(data, userId) {
    const result = await db.insert(projects).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateProject(id, data) {
    const existing = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return result[0];
  },
  async deleteProject(id) {
    await pool.query(`DELETE FROM project_tasks WHERE project_id = $1`, [id]);
    const result = await db.delete(projects).where(eq(projects.id, id));
    return result.rowCount > 0;
  },

  // ── Project Tasks ─────────────────────────────────────────────────────────────
  async createProjectTask(data) {
    const result = await db.insert(projectTasks).values(data).returning();
    return result[0];
  },
  async updateProjectTask(id, data) {
    const existing = await db.select().from(projectTasks).where(eq(projectTasks.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(projectTasks).set(data).where(eq(projectTasks.id, id)).returning();
    return result[0];
  },
  async deleteProjectTask(id) {
    const result = await db.delete(projectTasks).where(eq(projectTasks.id, id));
    return result.rowCount > 0;
  },

  // ── General Tasks ──────────────────────────────────────────────────────────────
  async getAllGeneralTasks(userId: number) {
    return db.select().from(generalTasks).where(eq(generalTasks.userId, userId)).orderBy(asc(generalTasks.sortOrder));
  },
  async createGeneralTask(data, userId) {
    const result = await db.insert(generalTasks).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateGeneralTask(id, data) {
    const existing = await db.select().from(generalTasks).where(eq(generalTasks.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(generalTasks).set(data).where(eq(generalTasks.id, id)).returning();
    return result[0];
  },
  async deleteGeneralTask(id) {
    const result = await db.delete(generalTasks).where(eq(generalTasks.id, id));
    return result.rowCount > 0;
  },

  // ── Recipes ──────────────────────────────────────────────────────────
  async getAllRecipes(userId: number) {
    return db.select().from(recipes)
      .where(or(eq(recipes.userId, userId), isNull(recipes.userId)))
      .orderBy(asc(recipes.name));
  },
  async createRecipe(data: InsertRecipe, userId: number) {
    const result = await db.insert(recipes).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateRecipe(id: number, data: Partial<InsertRecipe>) {
    const existing = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(recipes).set(data).where(eq(recipes.id, id)).returning();
    return result[0];
  },
  async deleteRecipe(id: number) {
    await pool.query(`DELETE FROM week_plan WHERE recipe_id = $1`, [id]);
    const result = await db.delete(recipes).where(eq(recipes.id, id));
    return result.rowCount > 0;
  },

  // ── Meal Bundles ──────────────────────────────────────────────────────
  async getAllBundles(userId: number) {
    return db.select().from(mealBundles).where(eq(mealBundles.userId, userId)).orderBy(asc(mealBundles.name));
  },
  async createBundle(data: InsertMealBundle, userId: number) {
    const result = await db.insert(mealBundles).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateBundle(id: number, data: Partial<InsertMealBundle>) {
    const existing = await db.select().from(mealBundles).where(eq(mealBundles.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(mealBundles).set(data).where(eq(mealBundles.id, id)).returning();
    return result[0];
  },
  async deleteBundle(id: number) {
    await pool.query(`DELETE FROM week_plan WHERE bundle_id = $1`, [id]);
    const result = await db.delete(mealBundles).where(eq(mealBundles.id, id));
    return result.rowCount > 0;
  },

  // ── Week Plan ─────────────────────────────────────────────────────────
  async getWeekPlan(weekStart: string, userId: number) {
    return db.select().from(weekPlan).where(eq(weekPlan.weekStart, weekStart)).where(eq(weekPlan.userId, userId));
  },
  async assignToWeek(data: InsertWeekPlan, userId: number) {
    const result = await db.insert(weekPlan).values({ ...data, userId }).returning();
    return result[0];
  },
  async removeWeekAssignment(id: number) {
    const result = await db.delete(weekPlan).where(eq(weekPlan.id, id));
    return result.rowCount > 0;
  },

  // ── Grocery Checks ────────────────────────────────────────────────────────
  async getGroceryChecks(weekStart: string, userId: number) {
    return db.select().from(groceryChecks).where(eq(groceryChecks.weekStart, weekStart)).where(eq(groceryChecks.userId, userId));
  },
  async upsertGroceryCheck(weekStart: string, itemKey: string, checked: boolean, userId: number) {
    const existing = await db.select().from(groceryChecks)
      .where(eq(groceryChecks.weekStart, weekStart))
      .where(eq(groceryChecks.userId, userId));
    const found = existing.find(g => g.itemKey === itemKey);
    if (found) {
      const result = await db.update(groceryChecks).set({ checked })
        .where(eq(groceryChecks.id, found.id)).returning();
      return result[0];
    }
    const result = await db.insert(groceryChecks).values({ weekStart, itemKey, checked, userId }).returning();
    return result[0];
  },

  // ── Custom Grocery Items ─────────────────────────────────────────────────────
  async getCustomGroceryItems(weekStart: string, userId: number) {
    return db.select().from(customGroceryItems)
      .where(eq(customGroceryItems.weekStart, weekStart))
      .where(eq(customGroceryItems.userId, userId));
  },
  async addCustomGroceryItem(data: InsertCustomGroceryItem, userId: number) {
    const result = await db.insert(customGroceryItems).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateCustomGroceryItem(id: number, data: Partial<InsertCustomGroceryItem>) {
    const result = await db.update(customGroceryItems).set(data).where(eq(customGroceryItems.id, id)).returning();
    return result[0];
  },
  async deleteCustomGroceryItem(id: number) {
    const result = await db.delete(customGroceryItems).where(eq(customGroceryItems.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  // ── Relationship Groups ───────────────────────────────────────────────────────
  async getAllGroups(userId: number) {
    return db.select().from(relationshipGroups).where(eq(relationshipGroups.userId, userId)).orderBy(asc(relationshipGroups.sortOrder));
  },
  async createGroup(data, userId) {
    const result = await db.insert(relationshipGroups).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateGroup(id, data) {
    const existing = await db.select().from(relationshipGroups).where(eq(relationshipGroups.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(relationshipGroups).set(data).where(eq(relationshipGroups.id, id)).returning();
    return result[0];
  },
  async deleteGroup(id) {
    await pool.query(`UPDATE people SET group_id = NULL WHERE group_id = $1`, [id]);
    const result = await db.delete(relationshipGroups).where(eq(relationshipGroups.id, id));
    return result.rowCount > 0;
  },

  // ── People ────────────────────────────────────────────────────────────────────
  async getAllPeople(userId: number): Promise<PersonWithSpouse[]> {
    const ps = await db.select().from(people).where(eq(people.userId, userId)).orderBy(asc(people.sortOrder));
    return ps.map((p) => ({
      ...p,
      spouse: p.spouseId ? (ps.find((s) => s.id === p.spouseId) ?? null) : null,
    }));
  },
  async createPerson(data, userId) {
    const result = await db.insert(people).values({ ...data, userId }).returning();
    return result[0];
  },
  async updatePerson(id, data) {
    const existing = await db.select().from(people).where(eq(people.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(people).set(data).where(eq(people.id, id)).returning();
    return result[0];
  },
  async deletePerson(id) {
    await pool.query(`UPDATE people SET spouse_id = NULL WHERE spouse_id = $1`, [id]);
    const p = await db.select().from(people).where(eq(people.id, id)).limit(1);
    if (p[0]?.birthdayEventId) {
      await pool.query(`DELETE FROM tasks WHERE event_id = $1`, [p[0].birthdayEventId]);
      await pool.query(`DELETE FROM events WHERE id = $1`, [p[0].birthdayEventId]);
    }
    const result = await db.delete(people).where(eq(people.id, id));
    return result.rowCount > 0;
  },

  // ── Timeline Entries ─────────────────────────────────────────────────────────
  async getTimelineEntries(userId: number) {
    const r = await pool.query(
      `SELECT id, user_id, person_ids_json, interaction_type, custom_type, note, date, created_at
       FROM timeline_entries WHERE user_id=$1 ORDER BY date DESC, created_at DESC`,
      [userId]
    );
    return r.rows.map((row: any) => ({
      id: row.id,
      userId: row.user_id,
      personIdsJson: row.person_ids_json,
      interactionType: row.interaction_type,
      customType: row.custom_type ?? null,
      note: row.note ?? null,
      date: row.date,
      createdAt: row.created_at,
    }));
  },
  async createTimelineEntry(userId: number, data: { personIdsJson: string; interactionType: string; customType?: string | null; note?: string | null; date: string }) {
    const now = new Date().toISOString();
    const r = await pool.query(
      `INSERT INTO timeline_entries (user_id, person_ids_json, interaction_type, custom_type, note, date, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [userId, data.personIdsJson, data.interactionType, data.customType ?? null, data.note ?? null, data.date, now]
    );
    return r.rows[0].id as number;
  },
  async updateTimelineEntry(id: number, userId: number, data: { personIdsJson?: string; interactionType?: string; customType?: string | null; note?: string | null; date?: string }) {
    const fields: string[] = [];
    const vals: any[] = [];
    let i = 1;
    if (data.personIdsJson !== undefined) { fields.push(`person_ids_json=$${i++}`); vals.push(data.personIdsJson); }
    if (data.interactionType !== undefined) { fields.push(`interaction_type=$${i++}`); vals.push(data.interactionType); }
    if (data.customType !== undefined) { fields.push(`custom_type=$${i++}`); vals.push(data.customType); }
    if (data.note !== undefined) { fields.push(`note=$${i++}`); vals.push(data.note); }
    if (data.date !== undefined) { fields.push(`date=$${i++}`); vals.push(data.date); }
    if (fields.length === 0) return;
    vals.push(id, userId);
    await pool.query(`UPDATE timeline_entries SET ${fields.join(",")} WHERE id=$${i++} AND user_id=$${i}`, vals);
  },
  async deleteTimelineEntry(id: number, userId: number) {
    const r = await pool.query(`DELETE FROM timeline_entries WHERE id=$1 AND user_id=$2`, [id, userId]);
    return (r.rowCount ?? 0) > 0;
  },

  // ── Movies ────────────────────────────────────────────────────────────────────────
  async getAllMovies(userId: number) {
    return db.select().from(movies).where(eq(movies.userId, userId)).orderBy(asc(movies.title));
  },
  async createMovie(data, userId) {
    const result = await db.insert(movies).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateMovie(id, data) {
    const existing = await db.select().from(movies).where(eq(movies.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(movies).set(data).where(eq(movies.id, id)).returning();
    return result[0];
  },
  async deleteMovie(id) {
    const result = await db.delete(movies).where(eq(movies.id, id));
    return result.rowCount > 0;
  },

  // ── Movie Lists ───────────────────────────────────────────────────────────────
  async getMovieLists(userId: number): Promise<MovieList[]> {
    return db.select().from(movieLists).where(eq(movieLists.userId, userId)).orderBy(asc(movieLists.name));
  },
  async createMovieList(userId: number, data: { name: string; visibility: string; isRanked: boolean; moviesJson?: string }): Promise<MovieList> {
    const [r] = await db.insert(movieLists).values({ ...data, moviesJson: data.moviesJson ?? "[]", userId, createdAt: new Date().toISOString() }).returning();
    return r;
  },
  async updateMovieList(id: number, userId: number, data: Partial<{ name: string; visibility: string; isRanked: boolean; moviesJson: string }>): Promise<MovieList> {
    const [r] = await db.update(movieLists).set(data).where(and(eq(movieLists.id, id), eq(movieLists.userId, userId))).returning();
    return r;
  },
  async deleteMovieList(id: number, userId: number): Promise<void> {
    await db.delete(movieLists).where(and(eq(movieLists.id, id), eq(movieLists.userId, userId)));
    // Clean up all members when list is deleted
    await db.delete(movieListMembers).where(eq(movieListMembers.listId, id));
  },

  // ── Movie List Members ────────────────────────────────────────────────────────
  async getListMembers(listId: number): Promise<Array<MovieListMember & { name: string; avatarUrl: string | null; email: string }>> {
    const rows = await pool.query(`
      SELECT mlm.*, u.name, u.email, u.avatar_url as "avatarUrl"
      FROM movie_list_members mlm
      JOIN users u ON u.id = mlm.user_id
      WHERE mlm.list_id = $1
      ORDER BY mlm.created_at ASC
    `, [listId]);
    return rows.rows;
  },
  async addListMember(listId: number, userId: number, invitedBy: number, role: string): Promise<void> {
    await pool.query(`
      INSERT INTO movie_list_members (list_id, user_id, invited_by, role, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (list_id, user_id) DO UPDATE SET role = EXCLUDED.role
    `, [listId, userId, invitedBy, role, new Date().toISOString()]);
  },
  async removeListMember(listId: number, userId: number, ownerUserId: number): Promise<void> {
    // Only list owner or the member themselves can remove
    const list = await db.select().from(movieLists).where(eq(movieLists.id, listId)).limit(1);
    if (list.length === 0 || (list[0].userId !== ownerUserId && userId !== ownerUserId)) return;
    await db.delete(movieListMembers).where(and(eq(movieListMembers.listId, listId), eq(movieListMembers.userId, userId)));
  },
  async updateListMemberRole(listId: number, userId: number, role: string): Promise<void> {
    await pool.query(`UPDATE movie_list_members SET role = $1 WHERE list_id = $2 AND user_id = $3`, [role, listId, userId]);
  },
  async getSharedListsForUser(userId: number): Promise<Array<MovieList & { role: string; ownerName: string; ownerAvatarUrl: string | null }>> {
    const rows = await pool.query(`
      SELECT ml.*, mlm.role, u.name as "ownerName", u.avatar_url as "ownerAvatarUrl"
      FROM movie_list_members mlm
      JOIN movie_lists ml ON ml.id = mlm.list_id
      JOIN users u ON u.id = ml.user_id
      WHERE mlm.user_id = $1
      ORDER BY ml.name ASC
    `, [userId]);
    return rows.rows;
  },
  // Get movies for a list from all contributing users (owner + collaborators)
  async getListMoviesAllUsers(listId: number, ownerUserId: number, listName: string): Promise<Array<{ id: number; title: string; year: number | null; mediaType: string | null; posterUrl: string | null; posterColor: string | null; isFavorite: boolean; rating: number | null; contributerName: string; contributerId: number }>> {
    const members = await pool.query(`
      SELECT mlm.user_id as "userId", u.name
      FROM movie_list_members mlm
      JOIN users u ON u.id = mlm.user_id
      WHERE mlm.list_id = $1 AND mlm.role = 'collaborator'
    `, [listId]);
    const allUserIds = [ownerUserId, ...members.rows.map((r: any) => r.userId)];
    const userNames: Record<number, string> = { [ownerUserId]: "You" };
    members.rows.forEach((r: any) => { userNames[r.userId] = r.name; });

    const rows = await pool.query(`
      SELECT m.id, m.title, m.year, m.media_type as "mediaType", m.poster_url as "posterUrl",
             m.poster_color as "posterColor", m.is_favorite as "isFavorite", m.rating,
             m.user_id as "contributerId"
      FROM movies m
      WHERE m.user_id = ANY($1)
        AND m.lists_json::text LIKE $2
      ORDER BY m.title ASC
    `, [allUserIds, `%${listName}%`]);

    return rows.rows
      .filter((r: any) => {
        try { return (JSON.parse(r.listsJson ?? "[]") as string[]).includes(listName); } catch { return true; }
      })
      .map((r: any) => ({ ...r, contributerName: userNames[r.contributerId] ?? "Unknown" }));
  },

  // ── Budget Categories ──────────────────────────────────────────────────────────
  async getAllBudgetCategories(userId: number) {
    return db.select().from(budgetCategories).where(eq(budgetCategories.userId, userId)).orderBy(asc(budgetCategories.sortOrder));
  },
  async createBudgetCategory(data, userId) {
    const result = await db.insert(budgetCategories).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateBudgetCategory(id, data) {
    const existing = await db.select().from(budgetCategories).where(eq(budgetCategories.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(budgetCategories).set(data).where(eq(budgetCategories.id, id)).returning();
    return result[0];
  },
  async deleteBudgetCategory(id) {
    const result = await db.delete(budgetCategories).where(eq(budgetCategories.id, id));
    return result.rowCount > 0;
  },

  // ── Transactions ───────────────────────────────────────────────────────────────────
  async getAllTransactions(userId: number) {
    return db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.date));
  },
  async createTransaction(data, userId) {
    const result = await db.insert(transactions).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateTransaction(id, data) {
    const existing = await db.select().from(transactions).where(eq(transactions.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(transactions).set(data).where(eq(transactions.id, id)).returning();
    return result[0];
  },
  async deleteTransaction(id) {
    const result = await db.delete(transactions).where(eq(transactions.id, id));
    return result.rowCount > 0;
  },

  // ── Subscriptions ──────────────────────────────────────────────────────────────────
  async getAllSubscriptions(userId: number) {
    return db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(asc(subscriptions.name));
  },
  async createSubscription(data, userId) {
    const result = await db.insert(subscriptions).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateSubscription(id, data) {
    const existing = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning();
    return result[0];
  },
  async deleteSubscription(id) {
    const result = await db.delete(subscriptions).where(eq(subscriptions.id, id));
    return result.rowCount > 0;
  },

  // ── Receipts ────────────────────────────────────────────────────────────────────────
  async getAllReceipts(userId: number) {
    return db.select().from(receipts).where(eq(receipts.userId, userId)).orderBy(desc(receipts.uploadDate));
  },
  async createReceiptRecord(data, userId) {
    const result = await db.insert(receipts).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateReceiptRecord(id, data) {
    const existing = await db.select().from(receipts).where(eq(receipts.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(receipts).set(data).where(eq(receipts.id, id)).returning();
    return result[0];
  },
  async deleteReceiptRecord(id) {
    const result = await db.delete(receipts).where(eq(receipts.id, id));
    return result.rowCount > 0;
  },

  // ── Nav Prefs ───────────────────────────────────────────────────────────────────────
  async getNavPrefs(userId: number): Promise<NavPref[]> {
    const row = await db.select().from(navPrefs).where(eq(navPrefs.userId, userId)).limit(1);
    if (!row[0]) return [];
    try { return JSON.parse(row[0].prefsJson) as NavPref[]; } catch { return []; }
  },
  async saveNavPrefs(userId: number, prefs: NavPref[]) {
    const row = await db.select().from(navPrefs).where(eq(navPrefs.userId, userId)).limit(1);
    const json = JSON.stringify(prefs);
    if (row[0]) {
      await db.update(navPrefs).set({ prefsJson: json }).where(eq(navPrefs.id, row[0].id));
    } else {
      await db.insert(navPrefs).values({ prefsJson: json, userId });
    }
  },

  async getTabPrivacy(userId: number): Promise<TabPrivacySetting[]> {
    const row = await db.select().from(tabPrivacy).where(eq(tabPrivacy.userId, userId)).limit(1);
    if (!row[0]) return [];
    try { return JSON.parse(row[0].settingsJson) as TabPrivacySetting[]; } catch { return []; }
  },
  async saveTabPrivacy(userId: number, settings: TabPrivacySetting[]) {
    const row = await db.select().from(tabPrivacy).where(eq(tabPrivacy.userId, userId)).limit(1);
    const json = JSON.stringify(settings);
    if (row[0]) {
      await db.update(tabPrivacy).set({ settingsJson: json }).where(eq(tabPrivacy.userId, userId));
    } else {
      await db.insert(tabPrivacy).values({ settingsJson: json, userId });
    }
  },

  async getFriendProfile(viewerId, targetId) {
    try {
      // Verify friendship
      const friendship = await pool.query(
        `SELECT id FROM friend_requests WHERE status = 'accepted'
         AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))`,
        [viewerId, targetId]
      );
      if (!friendship.rows[0]) {
        console.error(`[getFriendProfile] No accepted friendship between viewer=${viewerId} and target=${targetId}`);
        return null;
      }

      const userRows = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
      if (!userRows[0]) {
        console.error(`[getFriendProfile] Target user ${targetId} not found`);
        return null;
      }
      const u = userRows[0];

      // Get visible tabs
      const privacyRow = await db.select().from(tabPrivacy).where(eq(tabPrivacy.userId, targetId)).limit(1);
      let visibleTabs: string[] = [];
      if (privacyRow[0]) {
        try {
          const s = JSON.parse(privacyRow[0].settingsJson) as TabPrivacySetting[];
          visibleTabs = s.filter(x => x.visibility === "friends").map(x => x.path);
        } catch (e) {
          console.error(`[getFriendProfile] Failed to parse tab privacy for user ${targetId}:`, e);
        }
      }

      const data: Record<string, any> = {};

      if (visibleTabs.includes("/reading")) {
        try {
          const r = await pool.query(`SELECT id, title, author, status, cover_url FROM books WHERE user_id = $1 ORDER BY title`, [targetId]);
          data.reading = r.rows.map(x => ({ id: x.id, title: x.title, author: x.author, status: x.status, coverUrl: x.cover_url }));
        } catch (e) { console.error(`[getFriendProfile] reading query failed:`, e); data.reading = []; }
      }
      if (visibleTabs.includes("/movies")) {
        try {
          const r = await pool.query(`SELECT id, title, media_type, status, rating, is_favorite, poster_url, poster_color FROM movies WHERE user_id = $1 ORDER BY title`, [targetId]);
          data.movies = r.rows.map(x => ({ id: x.id, title: x.title, mediaType: x.media_type, status: x.status, rating: x.rating, isFavorite: x.is_favorite, posterUrl: x.poster_url, posterColor: x.poster_color }));
        } catch (e) { console.error(`[getFriendProfile] movies query failed:`, e); data.movies = []; }
      }
      if (visibleTabs.includes("/music")) {
        try {
          const r = await pool.query(
            `SELECT a.id, a.name, a.is_favorite, a.genres,
              COALESCE(json_agg(json_build_object('id',s.id,'title',s.title,'isFavorite',s.is_favorite)) FILTER (WHERE s.id IS NOT NULL),'[]'::json) AS songs
             FROM music_artists a LEFT JOIN music_songs s ON s.artist_id = a.id
             WHERE a.user_id = $1 GROUP BY a.id ORDER BY a.name`, [targetId]);
          data.music = r.rows.map(x => ({ id: x.id, name: x.name, isFavorite: x.is_favorite, genres: x.genres, songs: x.songs }));
        } catch (e) { console.error(`[getFriendProfile] music query failed:`, e); data.music = []; }
      }
      if (visibleTabs.includes("/recipes")) {
        try {
          const r = await pool.query(`SELECT id, name, emoji, category FROM recipes WHERE user_id = $1 ORDER BY name`, [targetId]);
          data.recipes = r.rows.map(x => ({ id: x.id, name: x.name, emoji: x.emoji, category: x.category }));
        } catch (e) { console.error(`[getFriendProfile] recipes query failed:`, e); data.recipes = []; }
      }
      if (visibleTabs.includes("/spots")) {
        try {
          const r = await pool.query(`SELECT id, name, type, city, neighborhood, rating, is_favorite FROM spots WHERE user_id = $1 ORDER BY name`, [targetId]);
          data.spots = r.rows.map(x => ({ id: x.id, name: x.name, type: x.type, city: x.city, neighborhood: x.neighborhood, rating: x.rating, isFavorite: x.is_favorite }));
        } catch (e) { console.error(`[getFriendProfile] spots query failed:`, e); data.spots = []; }
      }
      if (visibleTabs.includes("/art")) {
        try {
          const r = await pool.query(`SELECT id, title, artist_name, medium, image_url, accent_color, where_viewed FROM art_pieces WHERE user_id = $1 ORDER BY title`, [targetId]);
          data.art = r.rows.map(x => ({ id: x.id, title: x.title, artistName: x.artist_name, medium: x.medium, imageUrl: x.image_url, accentColor: x.accent_color, whereViewed: x.where_viewed }));
        } catch (e) { console.error(`[getFriendProfile] art query failed:`, e); data.art = []; }
      }
      if (visibleTabs.includes("/quotes")) {
        try {
          const r = await pool.query(`SELECT id, text, author, category, is_favorite FROM quotes WHERE user_id = $1 ORDER BY id DESC`, [targetId]);
          data.quotes = r.rows.map(x => ({ id: x.id, text: x.text, author: x.author, category: x.category, isFavorite: x.is_favorite }));
        } catch (e) { console.error(`[getFriendProfile] quotes query failed:`, e); data.quotes = []; }
      }
      if (visibleTabs.includes("/goals")) {
        try {
          const r = await pool.query(
            `SELECT id, title, category, priority, progress_current, progress_target FROM goals WHERE user_id = $1 ORDER BY title`,
            [targetId]
          );
          data.goals = r.rows.map(x => ({
            id: x.id,
            name: x.title,
            category: x.category,
            status: x.progress_current >= x.progress_target ? "completed" : "active",
          }));
        } catch (e) { console.error(`[getFriendProfile] goals query failed:`, e); data.goals = []; }
      }
      if (visibleTabs.includes("/workouts")) {
        try {
          const r = await pool.query(`SELECT id, name, workout_type FROM workout_templates WHERE user_id = $1 ORDER BY name`, [targetId]);
          data.workouts = r.rows.map(x => ({ id: x.id, name: x.name, muscleGroup: x.workout_type }));
        } catch (e) { console.error(`[getFriendProfile] workouts query failed:`, e); data.workouts = []; }
      }
      if (visibleTabs.includes("/plants")) {
        try {
          const r = await pool.query(`SELECT id, name, species, photo_url FROM plants WHERE user_id = $1 ORDER BY name`, [targetId]);
          data.plants = r.rows.map(x => ({ id: x.id, name: x.name, species: x.species, imageUrl: x.photo_url }));
        } catch (e) { console.error(`[getFriendProfile] plants query failed:`, e); data.plants = []; }
      }
      if (visibleTabs.includes("/hobbies")) {
        try {
          const r = await pool.query(
            `SELECT id, name, hobby_type, category, skill_level, status, description, cover_url, is_favorite
             FROM hobbies WHERE user_id = $1 ORDER BY sort_order, name`,
            [targetId]
          );
          data.hobbies = r.rows.map(x => ({
            id: x.id, name: x.name, hobbyType: x.hobby_type,
            category: x.category, skillLevel: x.skill_level,
            status: x.status, description: x.description,
            coverUrl: x.cover_url, isFavorite: x.is_favorite,
          }));
        } catch (e) { console.error(`[getFriendProfile] hobbies query failed:`, e); data.hobbies = []; }
      }
      if (visibleTabs.includes("/faith")) {
        try {
          // Sacred texts (title, author, tradition, status — no personal notes or passages)
          const st = await pool.query(
            `SELECT id, title, author, tradition, status, cover_image_url FROM sacred_texts WHERE user_id = $1 ORDER BY id DESC`,
            [targetId]
          );
          data.faithTexts = st.rows.map(x => ({
            id: x.id, title: x.title, author: x.author,
            tradition: x.tradition, status: x.status, coverImageUrl: x.cover_image_url,
          }));
          // Practices (name, frequency, status — no personal notes)
          const fp = await pool.query(
            `SELECT id, name, frequency, status FROM faith_practices WHERE user_id = $1 ORDER BY id`,
            [targetId]
          );
          data.faithPractices = fp.rows.map(x => ({
            id: x.id, name: x.name, frequency: x.frequency, status: x.status,
          }));
          // Sermons/Teachings (title, speaker, date, topic — no personal notes)
          const sr = await pool.query(
            `SELECT id, title, speaker, source, date, topic, tags FROM sermons WHERE user_id = $1 ORDER BY id DESC`,
            [targetId]
          );
          data.faithSermons = sr.rows.map(x => ({
            id: x.id, title: x.title, speaker: x.speaker,
            source: x.source, date: x.date, topic: x.topic, tags: x.tags,
          }));
          // Prayer items are never shared — too personal
        } catch (e) { console.error(`[getFriendProfile] faith query failed:`, e); data.faithTexts = []; data.faithPractices = []; data.faithSermons = []; }
      }

      return { user: { id: u.id, name: u.name, avatarUrl: u.avatarUrl, email: u.email }, visibleTabs, data };
    } catch (e) {
      console.error(`[getFriendProfile] Unexpected error for viewer=${viewerId} target=${targetId}:`, e);
      return null;
    }
  },

  async copyFromProfile(viewerId: number, sourceUserId: number, type: string, data: any) {
    // Verify friendship first
    const friendship = await pool.query(
      `SELECT id FROM friend_requests WHERE status = 'accepted'
       AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))`,
      [viewerId, sourceUserId]
    );
    if (!friendship.rows[0]) throw new Error("Not friends with that user");

    switch (type) {
      case "book": {
        const result = await db.insert(books).values({
          userId: viewerId, title: data.title, author: data.author ?? null,
          coverUrl: data.coverUrl ?? null, status: "want_to_read", isFavorite: false,
        }).returning();
        return result[0];
      }
      case "movie": {
        const result = await db.insert(movies).values({
          userId: viewerId, title: data.title, mediaType: data.mediaType ?? "movie",
          posterUrl: data.posterUrl ?? null, posterColor: data.posterColor ?? null,
          status: "backlog", isFavorite: false,
        }).returning();
        return result[0];
      }
      case "music_artist": {
        const artist = await db.insert(musicArtists).values({
          userId: viewerId, name: data.name, genres: data.genres ?? null, isFavorite: false,
        }).returning().then(r => r[0]);
        if (data.songs?.length) {
          for (const song of data.songs) {
            await db.insert(musicSongs).values({
              userId: viewerId, artistId: artist.id, title: song.title, isFavorite: false,
            }).catch(() => {});
          }
        }
        return artist;
      }
      case "recipe": {
        const result = await db.insert(recipes).values({
          userId: viewerId, name: data.name, emoji: data.emoji ?? "🍽️",
          category: data.category ?? null, tags: data.tags ?? null,
        }).returning();
        return result[0];
      }
      case "spot": {
        const result = await db.insert(spots).values({
          userId: viewerId, name: data.name, type: data.type ?? "restaurant",
          city: data.city ?? null, neighborhood: data.neighborhood ?? null,
          status: "want_to_visit", isFavorite: false,
        }).returning();
        return result[0];
      }
      case "art": {
        const result = await db.insert(artPieces).values({
          userId: viewerId, title: data.title, artistName: data.artistName ?? null,
          medium: data.medium ?? "other", imageUrl: data.imageUrl ?? null,
          accentColor: data.accentColor ?? null, whereViewed: data.whereViewed ?? null,
          status: "want_to_see", isFavorite: false,
        }).returning();
        return result[0];
      }
      case "quote": {
        const result = await db.insert(quotes).values({
          userId: viewerId, text: data.text, author: data.author ?? null,
          category: data.category ?? "other", isFavorite: false,
        }).returning();
        return result[0];
      }
      case "plant": {
        const result = await db.insert(plants).values({
          userId: viewerId, name: data.name, species: data.species ?? null,
          photoUrl: data.imageUrl ?? null,
        }).returning();
        return result[0];
      }
      default:
        throw new Error(`Unknown copy type: ${type}`);
    }
  },

  // ── Users ────────────────────────────────────────────────────────────
  async upsertUser({ googleId, email, name, avatarUrl }) {
    const existing = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);
    if (existing[0]) {
      const result = await db.update(users).set({ email, name, avatarUrl }).where(eq(users.googleId, googleId)).returning();
      return result[0];
    }
    const result = await db.insert(users).values({ googleId, email, name, avatarUrl, createdAt: new Date().toISOString() }).returning();
    return result[0];
  },
  async getUserByEmail(email: string) {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  },
  async createLocalUser({ email, name, passwordHash }: { email: string; name: string; passwordHash: string }) {
    const localId = "local:" + email;
    const result = await db.insert(users).values({
      googleId: localId, email, name, passwordHash,
      avatarUrl: null, createdAt: new Date().toISOString(),
    }).returning();
    return result[0];
  },
  async setPasswordHash(userId: number, hash: string) {
    await db.update(users).set({ passwordHash: hash }).where(eq(users.id, userId));
  },
  async getUserById(id) {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  },
  async completeOnboarding(userId: number) {
    await db.update(users).set({ onboarded: true }).where(eq(users.id, userId));
  },
  async saveStravaTokens(userId: number, accessToken: string, refreshToken: string, expiry: string, athleteId: string) {
    await db.update(users).set({ stravaAccessToken: encToken(accessToken), stravaRefreshToken: encToken(refreshToken), stravaTokenExpiry: expiry, stravaAthleteId: athleteId }).where(eq(users.id, userId));
  },
  async getStravaTokens(userId: number) {
    const result = await db.select({ a: users.stravaAccessToken, r: users.stravaRefreshToken, e: users.stravaTokenExpiry, ai: users.stravaAthleteId }).from(users).where(eq(users.id, userId)).limit(1);
    if (!result[0]?.a) return null;
    return { accessToken: decToken(result[0].a), refreshToken: decToken(result[0].r!), expiry: result[0].e!, athleteId: result[0].ai! };
  },
  async clearStravaTokens(userId: number) {
    await db.update(users).set({ stravaAccessToken: null, stravaRefreshToken: null, stravaTokenExpiry: null, stravaAthleteId: null }).where(eq(users.id, userId));
  },
  async saveFacebookProfile(userId: number, data: { accessToken: string; fbUserId: string; name: string; email: string | null; avatarUrl: string | null; birthday: string | null; location?: string | null }) {
    await db.update(users).set({
      facebookAccessToken: encToken(data.accessToken), facebookUserId: data.fbUserId,
      facebookName: data.name, facebookEmail: data.email,
      facebookAvatarUrl: data.avatarUrl, facebookBirthday: data.birthday,
      facebookLocation: data.location ?? null,
    }).where(eq(users.id, userId));
  },
  async getFacebookProfile(userId: number) {
    const r = await db.select({
      a: users.facebookAccessToken, u: users.facebookUserId, n: users.facebookName,
      e: users.facebookEmail, av: users.facebookAvatarUrl, b: users.facebookBirthday, ls: users.facebookLastSync,
    }).from(users).where(eq(users.id, userId)).limit(1);
    if (!r[0]?.u) return null;
    return { accessToken: decToken(r[0].a!), fbUserId: r[0].u, name: r[0].n ?? "", email: r[0].e ?? null, avatarUrl: r[0].av ?? null, birthday: r[0].b ?? null, lastSync: r[0].ls ?? null };
  },
  async clearFacebookProfile(userId: number) {
    await db.update(users).set({ facebookAccessToken: null, facebookUserId: null, facebookName: null, facebookEmail: null, facebookAvatarUrl: null, facebookBirthday: null, facebookLastSync: null }).where(eq(users.id, userId));
    await pool.query(`DELETE FROM facebook_friends WHERE user_id=$1`, [userId]);
  },
  async upsertFacebookFriends(userId: number, friends: Array<{ fbFriendId: string; name: string; birthday?: string | null; birthdayRaw?: string | null; avatarUrl?: string | null; location?: string | null }>) {
    if (friends.length === 0) return 0;
    const now = new Date().toISOString();
    let count = 0;
    for (const f of friends) {
      await pool.query(
        `INSERT INTO facebook_friends (user_id, fb_friend_id, name, birthday, birthday_raw, avatar_url, location, imported_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
         ON CONFLICT (user_id, fb_friend_id) DO UPDATE SET
           name=EXCLUDED.name, birthday=COALESCE(EXCLUDED.birthday, facebook_friends.birthday),
           birthday_raw=COALESCE(EXCLUDED.birthday_raw, facebook_friends.birthday_raw),
           avatar_url=COALESCE(EXCLUDED.avatar_url, facebook_friends.avatar_url),
           location=COALESCE(EXCLUDED.location, facebook_friends.location),
           updated_at=$8`,
        [userId, f.fbFriendId, f.name, f.birthday ?? null, f.birthdayRaw ?? null, f.avatarUrl ?? null, f.location ?? null, now]
      );
      count++;
    }
    return count;
  },
  async getFacebookFriends(userId: number) {
    const r = await pool.query(
      `SELECT id, fb_friend_id, name, birthday, avatar_url, location, imported_at FROM facebook_friends WHERE user_id=$1 ORDER BY name`,
      [userId]
    );
    return r.rows.map((row: any) => ({
      id: row.id, fbFriendId: row.fb_friend_id, name: row.name,
      birthday: row.birthday ?? null, avatarUrl: row.avatar_url ?? null,
      location: row.location ?? null, importedAt: row.imported_at,
    }));
  },
  async setFacebookLastSync(userId: number, ts: string) {
    await db.update(users).set({ facebookLastSync: ts }).where(eq(users.id, userId));
  },
  async saveLinkedinProfile(userId: number, data: { accessToken: string; profileId: string; name: string; headline: string | null; avatarUrl: string | null; email: string | null }) {
    await db.update(users).set({
      linkedinAccessToken: encToken(data.accessToken),
      linkedinProfileId: data.profileId,
      linkedinName: data.name,
      linkedinHeadline: data.headline,
      linkedinAvatarUrl: data.avatarUrl,
      linkedinEmail: data.email,
    }).where(eq(users.id, userId));
  },
  async getLinkedinProfile(userId: number) {
    const r = await db.select({
      a: users.linkedinAccessToken, p: users.linkedinProfileId,
      n: users.linkedinName, h: users.linkedinHeadline,
      av: users.linkedinAvatarUrl, e: users.linkedinEmail,
    }).from(users).where(eq(users.id, userId)).limit(1);
    if (!r[0]?.p) return null;
    return { accessToken: decToken(r[0].a!), profileId: r[0].p, name: r[0].n ?? "", headline: r[0].h ?? null, avatarUrl: r[0].av ?? null, email: r[0].e ?? null };
  },
  async clearLinkedinProfile(userId: number) {
    await db.update(users).set({ linkedinAccessToken: null, linkedinProfileId: null, linkedinName: null, linkedinHeadline: null, linkedinAvatarUrl: null, linkedinEmail: null }).where(eq(users.id, userId));
  },
  async importLinkedinContacts(userId: number, contacts: Array<{ firstName: string; lastName?: string; email?: string; company?: string; position?: string; connectedOn?: string }>) {
    if (contacts.length === 0) return 0;
    const now = new Date().toISOString();
    const values = contacts.map(c =>
      `(${userId}, ${pool.escapeLiteral(c.firstName)}, ${c.lastName ? pool.escapeLiteral(c.lastName) : 'NULL'}, ${c.email ? pool.escapeLiteral(c.email) : 'NULL'}, ${c.company ? pool.escapeLiteral(c.company) : 'NULL'}, ${c.position ? pool.escapeLiteral(c.position) : 'NULL'}, ${c.connectedOn ? pool.escapeLiteral(c.connectedOn) : 'NULL'}, ${pool.escapeLiteral(now)})`
    ).join(",");
    const result = await pool.query(`INSERT INTO linkedin_contacts (user_id,first_name,last_name,email,company,position,connected_on,imported_at) VALUES ${values}`);
    return result.rowCount ?? 0;
  },
  async getLinkedinContacts(userId: number) {
    const r = await pool.query(`SELECT id,first_name,last_name,email,company,position,connected_on,imported_at FROM linkedin_contacts WHERE user_id=$1 ORDER BY first_name`, [userId]);
    return r.rows.map((row: any) => ({
      id: row.id, firstName: row.first_name, lastName: row.last_name ?? null,
      email: row.email ?? null, company: row.company ?? null,
      position: row.position ?? null, connectedOn: row.connected_on ?? null,
      importedAt: row.imported_at,
    }));
  },
  async saveGoogleContactsTokens(userId: number, data: { accessToken: string; refreshToken: string | null; expiry: string }) {
    await pool.query(
      `UPDATE users SET google_contacts_access_token=$1, google_contacts_refresh_token=$2, google_contacts_token_expiry=$3 WHERE id=$4`,
      [encToken(data.accessToken), encToken(data.refreshToken), data.expiry, userId]
    );
  },
  async getGoogleContactsTokens(userId: number) {
    const r = await pool.query(
      `SELECT google_contacts_access_token, google_contacts_refresh_token, google_contacts_token_expiry FROM users WHERE id=$1`,
      [userId]
    );
    const row = r.rows[0];
    if (!row?.google_contacts_access_token) return null;
    return { accessToken: decToken(row.google_contacts_access_token as string), refreshToken: decToken(row.google_contacts_refresh_token ?? null), expiry: row.google_contacts_token_expiry ?? new Date().toISOString() };
  },
  async clearGoogleContactsTokens(userId: number) {
    await pool.query(
      `UPDATE users SET google_contacts_access_token=NULL, google_contacts_refresh_token=NULL, google_contacts_token_expiry=NULL, google_contacts_last_sync=NULL WHERE id=$1`,
      [userId]
    );
    await pool.query(`DELETE FROM google_contacts WHERE user_id=$1`, [userId]);
  },
  async upsertGoogleContacts(userId: number, contacts: Array<{ resourceName: string; firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null; birthday?: string | null; avatarUrl?: string | null; company?: string | null }>) {
    if (contacts.length === 0) return 0;
    const now = new Date().toISOString();
    let count = 0;
    for (const c of contacts) {
      await pool.query(
        `INSERT INTO google_contacts (user_id, resource_name, first_name, last_name, email, phone, birthday, avatar_url, company, imported_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
         ON CONFLICT (user_id, resource_name) DO UPDATE SET
           first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name,
           email=COALESCE(EXCLUDED.email, google_contacts.email),
           phone=COALESCE(EXCLUDED.phone, google_contacts.phone),
           birthday=COALESCE(EXCLUDED.birthday, google_contacts.birthday),
           avatar_url=COALESCE(EXCLUDED.avatar_url, google_contacts.avatar_url),
           company=COALESCE(EXCLUDED.company, google_contacts.company),
           updated_at=$10`,
        [userId, c.resourceName, c.firstName ?? null, c.lastName ?? null, c.email ?? null, c.phone ?? null, c.birthday ?? null, c.avatarUrl ?? null, c.company ?? null, now]
      );
      count++;
    }
    return count;
  },
  async getGoogleContacts(userId: number) {
    const r = await pool.query(
      `SELECT id, resource_name, first_name, last_name, email, phone, birthday, avatar_url, company, imported_at FROM google_contacts WHERE user_id=$1 ORDER BY first_name, last_name`,
      [userId]
    );
    return r.rows.map((row: any) => ({
      id: row.id, resourceName: row.resource_name,
      firstName: row.first_name ?? null, lastName: row.last_name ?? null,
      email: row.email ?? null, phone: row.phone ?? null,
      birthday: row.birthday ?? null, avatarUrl: row.avatar_url ?? null,
      company: row.company ?? null, importedAt: row.imported_at,
    }));
  },
  async setGoogleContactsLastSync(userId: number, ts: string) {
    await pool.query(`UPDATE users SET google_contacts_last_sync=$1 WHERE id=$2`, [ts, userId]);
  },
  async saveGcalTokens(userId: number, accessToken: string, refreshToken: string | null, expiry: string) {
    await db.update(users).set({ gcalAccessToken: encToken(accessToken), gcalRefreshToken: encToken(refreshToken), gcalTokenExpiry: expiry }).where(eq(users.id, userId));
  },
  async getGcalTokens(userId: number) {
    const result = await db.select({ a: users.gcalAccessToken, r: users.gcalRefreshToken, e: users.gcalTokenExpiry }).from(users).where(eq(users.id, userId)).limit(1);
    const row = result[0];
    if (!row?.a) return null;
    return { accessToken: decToken(row.a), refreshToken: decToken(row.r ?? null), expiry: row.e ?? new Date().toISOString() };
  },
  async clearGcalTokens(userId: number) {
    await db.update(users).set({ gcalAccessToken: null, gcalRefreshToken: null, gcalTokenExpiry: null, gcalLastSync: null }).where(eq(users.id, userId));
  },
  async updateGcalLastSync(userId: number, ts: string) {
    await db.update(users).set({ gcalLastSync: ts }).where(eq(users.id, userId));
  },
  async upsertGcalEvent({ userId, title, date, endDate, description, gcalEventId }) {
    await pool.query(
      `INSERT INTO events (user_id, title, date, end_date, description, category, recurring, gcal_event_id)
       VALUES ($1, $2, $3, $4, $5, 'gcal', 'none', $6)
       ON CONFLICT (gcal_event_id) WHERE gcal_event_id IS NOT NULL
       DO UPDATE SET title = EXCLUDED.title, date = EXCLUDED.date, end_date = EXCLUDED.end_date, description = EXCLUDED.description`,
      [userId, title, date, endDate, description, gcalEventId]
    );
  },
  async deleteGcalEvents(userId: number) {
    await pool.query(`DELETE FROM events WHERE user_id = $1 AND gcal_event_id IS NOT NULL`, [userId]);
  },
  async deleteStaleGcalEvents(userId: number, currentIds: string[]) {
    if (currentIds.length === 0) {
      await pool.query(`DELETE FROM events WHERE user_id = $1 AND gcal_event_id IS NOT NULL`, [userId]);
    } else {
      const placeholders = currentIds.map((_, i) => `$${i + 2}`).join(",");
      await pool.query(`DELETE FROM events WHERE user_id = $1 AND gcal_event_id IS NOT NULL AND gcal_event_id NOT IN (${placeholders})`, [userId, ...currentIds]);
    }
  },
  async deleteAccount(userId: number) {
    const uid = userId;
    // Helper — swallows errors for tables that may not exist in all environments
    const del = (sql: string) => pool.query(sql, [uid]).catch(() => {});
    // Delete in dependency order — children before parents, social tables included
    await del(`DELETE FROM shares WHERE from_user_id = $1 OR to_user_id = $1`);
    await del(`DELETE FROM notifications WHERE user_id = $1 OR actor_id = $1`);
    await del(`DELETE FROM push_subscriptions WHERE user_id = $1`);
    await del(`DELETE FROM invites WHERE from_user_id = $1`);
    await del(`DELETE FROM political_debate_upvotes WHERE user_id = $1`);
    await del(`DELETE FROM political_debate_members WHERE user_id = $1`);
    await del(`DELETE FROM political_debate_posts WHERE user_id = $1`);
    await del(`DELETE FROM political_debates WHERE user_id = $1`);
    await del(`DELETE FROM civic_actions WHERE user_id = $1`);
    await del(`DELETE FROM political_news_sources WHERE user_id = $1`);
    await del(`DELETE FROM political_elections WHERE user_id = $1`);
    await del(`DELETE FROM political_issues WHERE user_id = $1`);
    await del(`DELETE FROM political_officials WHERE user_id = $1`);
    await del(`DELETE FROM prayer_items WHERE user_id = $1`);
    await del(`DELETE FROM sermons WHERE user_id = $1`);
    await del(`DELETE FROM faith_practices WHERE user_id = $1`);
    await del(`DELETE FROM sacred_texts WHERE user_id = $1`);
    await del(`DELETE FROM care_providers WHERE user_id = $1`);
    await del(`DELETE FROM sleep_logs WHERE user_id = $1`);
    await del(`DELETE FROM health_metrics WHERE user_id = $1`);
    await del(`DELETE FROM medications WHERE user_id = $1`);
    await del(`DELETE FROM child_prep_items WHERE child_id IN (SELECT id FROM children WHERE user_id = $1)`);
    await del(`DELETE FROM child_memories WHERE child_id IN (SELECT id FROM children WHERE user_id = $1)`);
    await del(`DELETE FROM child_milestones WHERE child_id IN (SELECT id FROM children WHERE user_id = $1)`);
    await del(`DELETE FROM children WHERE user_id = $1`);
    await del(`DELETE FROM appliances WHERE user_id = $1`);
    await del(`DELETE FROM house_project_tasks WHERE project_id IN (SELECT id FROM house_projects WHERE user_id = $1)`);
    await del(`DELETE FROM house_projects WHERE user_id = $1`);
    await del(`DELETE FROM chores WHERE user_id = $1`);
    await del(`DELETE FROM spots WHERE user_id = $1`);
    await del(`DELETE FROM art_shares WHERE from_user_id = $1 OR to_user_id = $1`);
    await del(`DELETE FROM art_pieces WHERE user_id = $1`);
    await del(`DELETE FROM quote_shares WHERE from_user_id = $1 OR to_user_id = $1`);
    await del(`DELETE FROM quotes WHERE user_id = $1`);
    await del(`DELETE FROM journal_entries WHERE user_id = $1`);
    await del(`DELETE FROM hobbies WHERE user_id = $1`);
    await del(`DELETE FROM music_collection_items WHERE collection_id IN (SELECT id FROM music_collections WHERE user_id = $1)`);
    await del(`DELETE FROM music_collections WHERE user_id = $1`);
    await del(`DELETE FROM music_recommendations WHERE from_user_id = $1 OR to_user_id = $1`);
    await del(`DELETE FROM music_songs WHERE user_id = $1`);
    await del(`DELETE FROM music_artists WHERE user_id = $1`);
    await del(`DELETE FROM plants WHERE user_id = $1`);
    await del(`DELETE FROM subscriptions WHERE user_id = $1`);
    await del(`DELETE FROM transactions WHERE user_id = $1`);
    await del(`DELETE FROM budget_categories WHERE user_id = $1`);
    await del(`DELETE FROM movie_shares WHERE from_user_id = $1 OR to_user_id = $1`);
    await del(`DELETE FROM movies WHERE user_id = $1`);
    await del(`DELETE FROM spot_shares WHERE from_user_id = $1 OR to_user_id = $1`);
    await del(`DELETE FROM recipe_shares WHERE from_user_id = $1 OR to_user_id = $1`);
    await del(`DELETE FROM grocery_checks WHERE user_id = $1`);
    await del(`DELETE FROM week_plan WHERE user_id = $1`);
    await del(`DELETE FROM meal_bundles WHERE user_id = $1`);
    await del(`DELETE FROM recipes WHERE user_id = $1`);
    await del(`DELETE FROM workout_shares WHERE from_user_id = $1 OR to_user_id = $1`);
    await del(`DELETE FROM workout_logs WHERE user_id = $1`);
    await del(`DELETE FROM workout_templates WHERE user_id = $1`);
    await del(`DELETE FROM workout_plans WHERE user_id = $1`);
    await del(`DELETE FROM equipment WHERE user_id = $1`);
    await del(`DELETE FROM book_recommendations WHERE from_user_id = $1 OR to_user_id = $1`);
    await del(`DELETE FROM reading_sessions WHERE user_id = $1`);
    await del(`DELETE FROM books WHERE user_id = $1`);
    await del(`DELETE FROM goal_tasks WHERE goal_id IN (SELECT id FROM goals WHERE user_id = $1)`);
    await del(`DELETE FROM goals WHERE user_id = $1`);
    await del(`DELETE FROM project_tasks WHERE project_id IN (SELECT id FROM projects WHERE user_id = $1)`);
    await del(`DELETE FROM projects WHERE user_id = $1`);
    await del(`DELETE FROM general_tasks WHERE user_id = $1`);
    await del(`DELETE FROM tasks WHERE user_id = $1`);
    await del(`DELETE FROM timeline_entries WHERE user_id = $1`);
    await del(`DELETE FROM people WHERE user_id = $1`);
    await del(`DELETE FROM relationship_groups WHERE user_id = $1`);
    await del(`DELETE FROM events WHERE user_id = $1`);
    await del(`DELETE FROM tab_collaborations WHERE owner_user_id = $1 OR collaborator_user_id = $1`);
    await del(`DELETE FROM friend_requests WHERE from_user_id = $1 OR to_user_id = $1`);
    await del(`DELETE FROM tab_privacy WHERE user_id = $1`);
    await del(`DELETE FROM nav_prefs WHERE user_id = $1`);
    // Must succeed — the user row itself
    await pool.query(`DELETE FROM users WHERE id = $1`, [uid]);
  },
  async saveAnthropicApiKey(userId: number, encryptedKey: string) {
    await db.update(users).set({ anthropicApiKeyEnc: encryptedKey }).where(eq(users.id, userId));
  },
  async getAnthropicApiKeyEnc(userId: number): Promise<string | null> {
    const result = await db.select({ enc: users.anthropicApiKeyEnc }).from(users).where(eq(users.id, userId)).limit(1);
    return result[0]?.enc ?? null;
  },
  async removeAnthropicApiKey(userId: number) {
    await db.update(users).set({ anthropicApiKeyEnc: null }).where(eq(users.id, userId));
  },

  // ── Plants ───────────────────────────────────────────────────────────────────
  async getAllPlants(userId: number) {
    return db.select().from(plants).where(eq(plants.userId, userId)).orderBy(asc(plants.sortOrder), asc(plants.name));
  },
  async createPlant(data, userId) {
    const result = await db.insert(plants).values({ ...data, userId }).returning();
    return result[0];
  },
  async updatePlant(id, data) {
    const existing = await db.select().from(plants).where(eq(plants.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(plants).set(data).where(eq(plants.id, id)).returning();
    return result[0];
  },
  async deletePlant(id) {
    const result = await db.delete(plants).where(eq(plants.id, id));
    return result.rowCount > 0;
  },

  // ── Music ─────────────────────────────────────────────────────────────────────
  async getAllMusicArtistsWithSongs(userId: number) {
    const artists = await db.select().from(musicArtists).where(eq(musicArtists.userId, userId)).orderBy(asc(musicArtists.name));
    const songs = await db.select().from(musicSongs).where(eq(musicSongs.userId, userId)).orderBy(asc(musicSongs.title));
    return artists.map((a) => ({ ...a, songs: songs.filter((s) => s.artistId === a.id) }));
  },
  async createMusicArtist(data, userId) {
    const result = await db.insert(musicArtists).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateMusicArtist(id, data) {
    const existing = await db.select().from(musicArtists).where(eq(musicArtists.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(musicArtists).set(data).where(eq(musicArtists.id, id)).returning();
    return result[0];
  },
  async deleteMusicArtist(id) {
    await pool.query(`DELETE FROM music_songs WHERE artist_id = $1`, [id]);
    const result = await db.delete(musicArtists).where(eq(musicArtists.id, id));
    return result.rowCount > 0;
  },
  async createMusicSong(data, userId) {
    const result = await db.insert(musicSongs).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateMusicSong(id, data) {
    const existing = await db.select().from(musicSongs).where(eq(musicSongs.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(musicSongs).set(data).where(eq(musicSongs.id, id)).returning();
    return result[0];
  },
  async deleteMusicSong(id) {
    const result = await db.delete(musicSongs).where(eq(musicSongs.id, id));
    return result.rowCount > 0;
  },

  // ── Chores ────────────────────────────────────────────────────────────────────
  async getAllChores(userId: number) {
    return db.select().from(chores).where(eq(chores.userId, userId)).orderBy(asc(chores.sortOrder), asc(chores.title));
  },
  async createChore(data, userId) {
    const result = await db.insert(chores).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateChore(id, data) {
    const existing = await db.select().from(chores).where(eq(chores.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(chores).set(data).where(eq(chores.id, id)).returning();
    return result[0];
  },
  async deleteChore(id) {
    const result = await db.delete(chores).where(eq(chores.id, id));
    return result.rowCount > 0;
  },

  // ── House Projects ────────────────────────────────────────────────────────────
  async getAllHouseProjects(userId: number) {
    const projects = await db.select().from(houseProjects).where(eq(houseProjects.userId, userId)).orderBy(asc(houseProjects.sortOrder), asc(houseProjects.title));
    const allTasks = await db.select().from(houseProjectTasks).where(eq(houseProjectTasks.userId, userId)).orderBy(asc(houseProjectTasks.sortOrder));
    return projects.map((p) => ({ ...p, tasks: allTasks.filter((t) => t.houseProjectId === p.id) }));
  },
  async createHouseProject(data, userId) {
    const result = await db.insert(houseProjects).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateHouseProject(id, data) {
    const existing = await db.select().from(houseProjects).where(eq(houseProjects.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(houseProjects).set(data).where(eq(houseProjects.id, id)).returning();
    return result[0];
  },
  async deleteHouseProject(id) {
    await db.delete(houseProjectTasks).where(eq(houseProjectTasks.houseProjectId, id));
    const result = await db.delete(houseProjects).where(eq(houseProjects.id, id));
    return result.rowCount > 0;
  },

  // ── House Project Tasks ────────────────────────────────────────────────────────
  async createHouseProjectTask(data, userId) {
    const result = await db.insert(houseProjectTasks).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateHouseProjectTask(id, data) {
    const existing = await db.select().from(houseProjectTasks).where(eq(houseProjectTasks.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(houseProjectTasks).set(data).where(eq(houseProjectTasks.id, id)).returning();
    return result[0];
  },
  async deleteHouseProjectTask(id) {
    const result = await db.delete(houseProjectTasks).where(eq(houseProjectTasks.id, id));
    return result.rowCount > 0;
  },

  // ── Appliances ────────────────────────────────────────────────────────────────
  async getAllAppliances(userId: number) {
    return db.select().from(appliances).where(eq(appliances.userId, userId)).orderBy(asc(appliances.name));
  },
  async createAppliance(data, userId) {
    const result = await db.insert(appliances).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateAppliance(id, data) {
    const existing = await db.select().from(appliances).where(eq(appliances.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(appliances).set(data).where(eq(appliances.id, id)).returning();
    return result[0];
  },
  async deleteAppliance(id) {
    const result = await db.delete(appliances).where(eq(appliances.id, id));
    return result.rowCount > 0;
  },

  // ── Spots ─────────────────────────────────────────────────────────────────────
  async getAllSpots(userId: number) {
    const rows = await pool.query(
      `SELECT s.*, COALESCE(
        (SELECT json_agg(sfm.folder_id ORDER BY sfm.folder_id)
         FROM spot_folder_members sfm WHERE sfm.spot_id = s.id),
        '[]'::json
       ) AS "folderIds"
       FROM spots s WHERE s.user_id = $1 ORDER BY s.name`,
      [userId]
    );
    return rows.rows;
  },
  async createSpot(data, userId) {
    const result = await db.insert(spots).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateSpot(id, data) {
    const existing = await db.select().from(spots).where(eq(spots.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(spots).set(data).where(eq(spots.id, id)).returning();
    return result[0];
  },
  async deleteSpot(id) {
    const result = await db.delete(spots).where(eq(spots.id, id));
    return result.rowCount > 0;
  },

  // ── Children ──────────────────────────────────────────────────────────────────
  async getAllChildrenWithDetails(userId: number) {
    const kids = await db.select().from(children).where(eq(children.userId, userId)).orderBy(asc(children.sortOrder), asc(children.name));
    const milestones = await db.select().from(childMilestones).where(eq(childMilestones.userId, userId)).orderBy(asc(childMilestones.sortOrder));
    const memories = await db.select().from(childMemories).where(eq(childMemories.userId, userId)).orderBy(desc(childMemories.date));
    const prepItems = await db.select().from(childPrepItems).where(eq(childPrepItems.userId, userId)).orderBy(asc(childPrepItems.sortOrder));
    return kids.map((k) => ({
      ...k,
      milestones: milestones.filter((m) => m.childId === k.id),
      memories: memories.filter((m) => m.childId === k.id),
      prepItems: prepItems.filter((p) => p.childId === k.id),
    }));
  },
  async createChild(data, userId) {
    const result = await db.insert(children).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateChild(id, data) {
    const existing = await db.select().from(children).where(eq(children.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(children).set(data).where(eq(children.id, id)).returning();
    return result[0];
  },
  async deleteChild(id) {
    await db.delete(childMilestones).where(eq(childMilestones.childId, id));
    await db.delete(childMemories).where(eq(childMemories.childId, id));
    await db.delete(childPrepItems).where(eq(childPrepItems.childId, id));
    const result = await db.delete(children).where(eq(children.id, id));
    return result.rowCount > 0;
  },

  // ── Child Milestones ──────────────────────────────────────────────────────────
  async createChildMilestone(data, userId) {
    const result = await db.insert(childMilestones).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateChildMilestone(id, data) {
    const existing = await db.select().from(childMilestones).where(eq(childMilestones.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(childMilestones).set(data).where(eq(childMilestones.id, id)).returning();
    return result[0];
  },
  async deleteChildMilestone(id) {
    const result = await db.delete(childMilestones).where(eq(childMilestones.id, id));
    return result.rowCount > 0;
  },

  // ── Child Memories ────────────────────────────────────────────────────────────
  async createChildMemory(data, userId) {
    const result = await db.insert(childMemories).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateChildMemory(id, data) {
    const existing = await db.select().from(childMemories).where(eq(childMemories.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(childMemories).set(data).where(eq(childMemories.id, id)).returning();
    return result[0];
  },
  async deleteChildMemory(id) {
    const result = await db.delete(childMemories).where(eq(childMemories.id, id));
    return result.rowCount > 0;
  },

  // ── Child Prep Items ──────────────────────────────────────────────────────────
  async createChildPrepItem(data, userId) {
    const result = await db.insert(childPrepItems).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateChildPrepItem(id, data) {
    const existing = await db.select().from(childPrepItems).where(eq(childPrepItems.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(childPrepItems).set(data).where(eq(childPrepItems.id, id)).returning();
    return result[0];
  },
  async deleteChildPrepItem(id) {
    const result = await db.delete(childPrepItems).where(eq(childPrepItems.id, id));
    return result.rowCount > 0;
  },

  // ── Pets ──────────────────────────────────────────────────────────────────────
  async getAllPetsWithVisits(userId: number): Promise<PetWithVisits[]> {
    const petList = await db.select().from(pets).where(eq(pets.userId, userId)).orderBy(asc(pets.sortOrder), asc(pets.name));
    const visits = await db.select().from(petVetVisits).where(eq(petVetVisits.userId, userId)).orderBy(desc(petVetVisits.date));
    return petList.map((p) => ({ ...p, vetVisits: visits.filter((v) => v.petId === p.id) }));
  },
  async createPet(data: InsertPet, userId: number): Promise<Pet> {
    const result = await db.insert(pets).values({ ...data, userId }).returning();
    return result[0];
  },
  async updatePet(id: number, data: Partial<InsertPet>): Promise<Pet | undefined> {
    const result = await db.update(pets).set(data).where(eq(pets.id, id)).returning();
    return result[0];
  },
  async deletePet(id: number): Promise<boolean> {
    await db.delete(petVetVisits).where(eq(petVetVisits.petId, id));
    const result = await db.delete(pets).where(eq(pets.id, id));
    return result.rowCount > 0;
  },
  async createPetVetVisit(data: InsertPetVetVisit, userId: number): Promise<PetVetVisit> {
    const result = await db.insert(petVetVisits).values({ ...data, userId }).returning();
    return result[0];
  },
  async updatePetVetVisit(id: number, data: Partial<InsertPetVetVisit>): Promise<PetVetVisit | undefined> {
    const result = await db.update(petVetVisits).set(data).where(eq(petVetVisits.id, id)).returning();
    return result[0];
  },
  async deletePetVetVisit(id: number): Promise<boolean> {
    const result = await db.delete(petVetVisits).where(eq(petVetVisits.id, id));
    return result.rowCount > 0;
  },

  // ── Quotes ────────────────────────────────────────────────────────────────────
  async getAllQuotes(userId: number) {
    return db.select().from(quotes).where(eq(quotes.userId, userId)).orderBy(desc(quotes.sortOrder), asc(quotes.id));
  },
  async createQuote(data, userId) {
    const result = await db.insert(quotes).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateQuote(id, data) {
    const existing = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(quotes).set(data).where(eq(quotes.id, id)).returning();
    return result[0];
  },
  async deleteQuote(id) {
    const result = await db.delete(quotes).where(eq(quotes.id, id));
    return result.rowCount > 0;
  },

  // ── Mantras ───────────────────────────────────────────────────────────────────
  async getAllMantras(userId: number) {
    return db.select().from(mantras).where(eq(mantras.userId, userId)).orderBy(desc(mantras.isActive), asc(mantras.id));
  },
  async createMantra(data, userId) {
    const result = await db.insert(mantras).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateMantra(id, data) {
    const existing = await db.select().from(mantras).where(eq(mantras.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(mantras).set(data).where(eq(mantras.id, id)).returning();
    return result[0];
  },
  async deleteMantra(id) {
    const result = await db.delete(mantras).where(eq(mantras.id, id));
    return result.rowCount > 0;
  },

  // ── Art Pieces ────────────────────────────────────────────────────────────────
  async getAllArtPieces(userId: number) {
    return db.select().from(artPieces).where(eq(artPieces.userId, userId)).orderBy(asc(artPieces.sortOrder), asc(artPieces.title));
  },
  async createArtPiece(data, userId) {
    const result = await db.insert(artPieces).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateArtPiece(id, data) {
    const existing = await db.select().from(artPieces).where(eq(artPieces.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(artPieces).set(data).where(eq(artPieces.id, id)).returning();
    return result[0];
  },
  async deleteArtPiece(id) {
    const result = await db.delete(artPieces).where(eq(artPieces.id, id));
    return result.rowCount > 0;
  },

  // ── Journal Entries ───────────────────────────────────────────────────────────
  async getJournalEntries(userId: number) {
    return db.select().from(journalEntries).where(eq(journalEntries.userId, userId)).orderBy(desc(journalEntries.date));
  },
  async createJournalEntry(data, userId) {
    const result = await db.insert(journalEntries).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateJournalEntry(id, data) {
    const existing = await db.select().from(journalEntries).where(eq(journalEntries.id, id)).limit(1);
    if (!existing[0]) return null;
    const result = await db.update(journalEntries).set(data).where(eq(journalEntries.id, id)).returning();
    return result[0];
  },
  async deleteJournalEntry(id) {
    const result = await db.delete(journalEntries).where(eq(journalEntries.id, id));
    return result.rowCount > 0;
  },

  // ── Equipment ─────────────────────────────────────────────────────────────────
  async getAllEquipment(userId: number) {
    return db.select().from(equipment).where(eq(equipment.userId, userId)).orderBy(asc(equipment.category), asc(equipment.name));
  },
  async createEquipment(data, userId) {
    const result = await db.insert(equipment).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateEquipment(id, data) {
    const existing = await db.select().from(equipment).where(eq(equipment.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(equipment).set(data).where(eq(equipment.id, id)).returning();
    return result[0];
  },
  async deleteEquipment(id) {
    const result = await db.delete(equipment).where(eq(equipment.id, id));
    return result.rowCount > 0;
  },

  // ── Friends ────────────────────────────────────────────────────────────────
  async searchUsers(query, currentUserId) {
    const q = query.trim();
    if (!q) return [];
    const r = await pool.query(
      `SELECT id, name, email, avatar_url AS "avatarUrl"
       FROM users
       WHERE id != $1
         AND (LOWER(name) LIKE $2 OR LOWER(email) LIKE $2)
       ORDER BY name
       LIMIT 20`,
      [currentUserId, `%${q.toLowerCase()}%`]
    );
    return r.rows;
  },

  async sendFriendRequest(fromUserId, toUserId) {
    const now = new Date().toISOString();
    const result = await db.insert(friendRequests).values({ fromUserId, toUserId, status: "pending", createdAt: now }).returning();
    return result[0];
  },

  async getFriendRequests(userId) {
    const all = await pool.query(`
      SELECT fr.*,
        u.id as other_id, u.name as other_name, u.email as other_email, u.avatar_url as other_avatar
      FROM friend_requests fr
      JOIN users u ON (
        CASE WHEN fr.from_user_id = $1 THEN fr.to_user_id ELSE fr.from_user_id END = u.id
      )
      WHERE (fr.from_user_id = $1 OR fr.to_user_id = $1)
        AND fr.status = 'pending'
      ORDER BY fr.created_at DESC
    `, [userId]);

    const incoming: FriendRequestWithUser[] = [];
    const outgoing: FriendRequestWithUser[] = [];
    for (const row of all.rows) {
      const req: FriendRequestWithUser = {
        id: row.id, fromUserId: row.from_user_id, toUserId: row.to_user_id,
        status: row.status, createdAt: row.created_at,
        otherUser: { id: row.other_id, name: row.other_name, email: row.other_email, avatarUrl: row.other_avatar },
      };
      if (row.to_user_id === userId) incoming.push(req);
      else outgoing.push(req);
    }
    return { incoming, outgoing };
  },

  async respondFriendRequest(id, status, userId) {
    const existing = await db.select().from(friendRequests).where(eq(friendRequests.id, id)).limit(1);
    if (!existing[0] || existing[0].toUserId !== userId) return null;
    const result = await db.update(friendRequests).set({ status }).where(eq(friendRequests.id, id)).returning();
    return result[0] ?? null;
  },

  async cancelFriendRequest(id, fromUserId) {
    const existing = await db.select().from(friendRequests).where(eq(friendRequests.id, id)).limit(1);
    if (!existing[0] || existing[0].fromUserId !== fromUserId) return false;
    const result = await db.delete(friendRequests).where(eq(friendRequests.id, id));
    return result.rowCount > 0;
  },

  async getFriends(userId) {
    const rows = await pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_url as "avatarUrl"
      FROM friend_requests fr
      JOIN users u ON (
        CASE WHEN fr.from_user_id = $1 THEN fr.to_user_id ELSE fr.from_user_id END = u.id
      )
      WHERE (fr.from_user_id = $1 OR fr.to_user_id = $1)
        AND fr.status = 'accepted'
      ORDER BY u.name ASC
    `, [userId]);
    return rows.rows as PublicUser[];
  },

  async unfriend(userId, friendId) {
    const result = await pool.query(`
      DELETE FROM friend_requests
      WHERE status = 'accepted'
        AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))
    `, [userId, friendId]);
    return (result.rowCount ?? 0) > 0;
  },

  async getPendingIncomingCount(userId) {
    const result = await pool.query(
      `SELECT COUNT(*) FROM friend_requests WHERE to_user_id = $1 AND status = 'pending'`,
      [userId]
    );
    return parseInt(result.rows[0].count, 10);
  },

  // ── Recipe Shares ───────────────────────────────────────────────────────────
  async sendRecipeShare(data) {
    const result = await db.insert(recipeShares).values(data).returning();
    return result[0];
  },

  async getRecipeShares(userId) {
    const rows = await pool.query<{
      id: number; from_user_id: number; to_user_id: number;
      recipe_name: string; recipe_emoji: string; recipe_category: string | null;
      recipe_component_type: string | null; recipe_prep_time: number | null;
      recipe_cook_time: number | null; recipe_servings: number | null;
      recipe_ingredients: string; recipe_instructions: string | null;
      recipe_image_url: string | null; notes: string | null;
      created_at: string; is_dismissed: boolean;
      from_id: number; from_name: string; from_avatar: string | null;
      to_id: number; to_name: string; to_avatar: string | null;
    }>(`
      SELECT rs.*,
        fu.id as from_id, fu.name as from_name, fu.avatar_url as from_avatar,
        tu.id as to_id, tu.name as to_name, tu.avatar_url as to_avatar
      FROM recipe_shares rs
      JOIN users fu ON rs.from_user_id = fu.id
      JOIN users tu ON rs.to_user_id = tu.id
      WHERE rs.from_user_id = $1 OR rs.to_user_id = $1
      ORDER BY rs.created_at DESC
    `, [userId]);

    const toShare = (r: typeof rows.rows[0]): RecipeShareWithUser => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      recipeName: r.recipe_name,
      recipeEmoji: r.recipe_emoji,
      recipeCategory: r.recipe_category,
      recipeComponentType: r.recipe_component_type,
      recipePrepTime: r.recipe_prep_time,
      recipeCookTime: r.recipe_cook_time,
      recipeServings: r.recipe_servings,
      recipeIngredients: r.recipe_ingredients,
      recipeInstructions: r.recipe_instructions,
      recipeImageUrl: r.recipe_image_url,
      notes: r.notes,
      createdAt: r.created_at,
      isDismissed: r.is_dismissed,
      fromUser: { id: r.from_id, name: r.from_name, avatarUrl: r.from_avatar },
      toUser: { id: r.to_id, name: r.to_name, avatarUrl: r.to_avatar },
    });

    const received = rows.rows.filter((r) => r.to_user_id === userId && !r.is_dismissed).map(toShare);
    const sent = rows.rows.filter((r) => r.from_user_id === userId).map(toShare);
    return { received, sent };
  },

  async dismissRecipeShare(id, userId) {
    const result = await pool.query(
      `UPDATE recipe_shares SET is_dismissed = true WHERE id = $1 AND to_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async deleteRecipeShare(id, userId) {
    const result = await pool.query(
      `DELETE FROM recipe_shares WHERE id = $1 AND from_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  // ── Music Recommendations ───────────────────────────────────────────────────
  async sendMusicRecommendation(data) {
    const result = await db.insert(musicRecommendations).values(data).returning();
    return result[0];
  },

  async getMusicRecommendations(userId) {
    const rows = await pool.query<{
      id: number; from_user_id: number; to_user_id: number;
      type: string; artist_name: string; song_title: string | null;
      notes: string | null; created_at: string; is_dismissed: boolean;
      from_id: number; from_name: string; from_avatar: string | null;
      to_id: number; to_name: string; to_avatar: string | null;
    }>(`
      SELECT mr.*,
        fu.id as from_id, fu.name as from_name, fu.avatar_url as from_avatar,
        tu.id as to_id, tu.name as to_name, tu.avatar_url as to_avatar
      FROM music_recommendations mr
      JOIN users fu ON mr.from_user_id = fu.id
      JOIN users tu ON mr.to_user_id = tu.id
      WHERE mr.from_user_id = $1 OR mr.to_user_id = $1
      ORDER BY mr.created_at DESC
    `, [userId]);

    const toRec = (r: typeof rows.rows[0]): MusicRecommendationWithUser => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      type: r.type,
      artistName: r.artist_name,
      songTitle: r.song_title,
      notes: r.notes,
      createdAt: r.created_at,
      isDismissed: r.is_dismissed,
      fromUser: { id: r.from_id, name: r.from_name, avatarUrl: r.from_avatar },
      toUser: { id: r.to_id, name: r.to_name, avatarUrl: r.to_avatar },
    });

    const received = rows.rows.filter((r) => r.to_user_id === userId && !r.is_dismissed).map(toRec);
    const sent = rows.rows.filter((r) => r.from_user_id === userId).map(toRec);
    return { received, sent };
  },

  async dismissMusicRecommendation(id, userId) {
    const result = await pool.query(
      `UPDATE music_recommendations SET is_dismissed = true WHERE id = $1 AND to_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async deleteMusicRecommendation(id, userId) {
    const result = await pool.query(
      `DELETE FROM music_recommendations WHERE id = $1 AND from_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  // ── Book Recommendations ────────────────────────────────────────────────────
  async sendBookRecommendation(data) {
    const result = await db.insert(bookRecommendations).values(data).returning();
    return result[0];
  },

  async getBookRecommendations(userId) {
    const rows = await pool.query<{
      id: number; from_user_id: number; to_user_id: number;
      book_title: string; book_author: string | null; cover_url: string | null;
      notes: string | null; created_at: string; is_dismissed: boolean;
      from_id: number; from_name: string; from_email: string; from_avatar: string | null;
      to_id: number; to_name: string; to_email: string; to_avatar: string | null;
    }>(`
      SELECT br.*,
        fu.id as from_id, fu.name as from_name, fu.email as from_email, fu.avatar_url as from_avatar,
        tu.id as to_id, tu.name as to_name, tu.email as to_email, tu.avatar_url as to_avatar
      FROM book_recommendations br
      JOIN users fu ON br.from_user_id = fu.id
      JOIN users tu ON br.to_user_id = tu.id
      WHERE br.from_user_id = $1 OR br.to_user_id = $1
      ORDER BY br.created_at DESC
    `, [userId]);

    const toRec = (r: typeof rows.rows[0]): BookRecommendationWithUser => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      bookTitle: r.book_title,
      bookAuthor: r.book_author,
      coverUrl: r.cover_url,
      notes: r.notes,
      createdAt: r.created_at,
      isDismissed: r.is_dismissed,
      fromUser: { id: r.from_id, name: r.from_name, avatarUrl: r.from_avatar },
      toUser: { id: r.to_id, name: r.to_name, avatarUrl: r.to_avatar },
    });

    const received = rows.rows.filter((r) => r.to_user_id === userId && !r.is_dismissed).map(toRec);
    const sent = rows.rows.filter((r) => r.from_user_id === userId).map(toRec);
    return { received, sent };
  },

  async dismissBookRecommendation(id, userId) {
    const result = await pool.query(
      `UPDATE book_recommendations SET is_dismissed = true WHERE id = $1 AND to_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async deleteBookRecommendation(id, userId) {
    const result = await pool.query(
      `DELETE FROM book_recommendations WHERE id = $1 AND from_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  // ── Quote Shares ─────────────────────────────────────────────────────────────
  async sendQuoteShare(data) {
    const result = await db.insert(quoteShares).values(data).returning();
    return result[0];
  },

  async getQuoteShares(userId) {
    const rows = await pool.query(`
      SELECT qs.*,
        fu.id as from_id, fu.name as from_name, fu.avatar_url as from_avatar,
        tu.id as to_id, tu.name as to_name, tu.avatar_url as to_avatar
      FROM quote_shares qs
      JOIN users fu ON qs.from_user_id = fu.id
      JOIN users tu ON qs.to_user_id = tu.id
      WHERE qs.from_user_id = $1 OR qs.to_user_id = $1
      ORDER BY qs.created_at DESC
    `, [userId]);

    const toShare = (r: any): QuoteShareWithUser => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      text: r.text,
      author: r.author,
      source: r.source,
      category: r.category,
      tags: r.tags,
      quoteNotes: r.quote_notes,
      notes: r.notes,
      createdAt: r.created_at,
      isDismissed: r.is_dismissed,
      fromUser: { id: r.from_id, name: r.from_name, avatarUrl: r.from_avatar },
      toUser: { id: r.to_id, name: r.to_name, avatarUrl: r.to_avatar },
    });

    const received = rows.rows.filter((r: any) => r.to_user_id === userId && !r.is_dismissed).map(toShare);
    const sent = rows.rows.filter((r: any) => r.from_user_id === userId).map(toShare);
    return { received, sent };
  },

  async dismissQuoteShare(id, userId) {
    const result = await pool.query(
      `UPDATE quote_shares SET is_dismissed = true WHERE id = $1 AND to_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async deleteQuoteShare(id, userId) {
    const result = await pool.query(
      `DELETE FROM quote_shares WHERE id = $1 AND from_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  // ── Art Shares ──────────────────────────────────────────────────────────────
  async sendArtShare(data) {
    const result = await db.insert(artShares).values(data).returning();
    return result[0];
  },

  async getArtShares(userId) {
    const rows = await pool.query(`
      SELECT as2.*,
        fu.id as from_id, fu.name as from_name, fu.avatar_url as from_avatar,
        tu.id as to_id, tu.name as to_name, tu.avatar_url as to_avatar
      FROM art_shares as2
      JOIN users fu ON as2.from_user_id = fu.id
      JOIN users tu ON as2.to_user_id = tu.id
      WHERE as2.from_user_id = $1 OR as2.to_user_id = $1
      ORDER BY as2.created_at DESC
    `, [userId]);

    const toShare = (r: any): ArtShareWithUser => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      title: r.title,
      artistName: r.artist_name,
      yearCreated: r.year_created,
      medium: r.medium,
      movement: r.movement,
      whereViewed: r.where_viewed,
      city: r.city,
      accentColor: r.accent_color,
      imageUrl: r.image_url,
      artNotes: r.art_notes,
      notes: r.notes,
      createdAt: r.created_at,
      isDismissed: r.is_dismissed,
      fromUser: { id: r.from_id, name: r.from_name, avatarUrl: r.from_avatar },
      toUser: { id: r.to_id, name: r.to_name, avatarUrl: r.to_avatar },
    });

    const received = rows.rows.filter((r: any) => r.to_user_id === userId && !r.is_dismissed).map(toShare);
    const sent = rows.rows.filter((r: any) => r.from_user_id === userId).map(toShare);
    return { received, sent };
  },

  async dismissArtShare(id, userId) {
    const result = await pool.query(
      `UPDATE art_shares SET is_dismissed = true WHERE id = $1 AND to_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async deleteArtShare(id, userId) {
    const result = await pool.query(
      `DELETE FROM art_shares WHERE id = $1 AND from_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  // ── Spot Shares ─────────────────────────────────────────────────────────────
  async sendSpotShare(data) {
    const result = await db.insert(spotShares).values(data).returning();
    return result[0];
  },

  async getSpotShares(userId) {
    const rows = await pool.query(`
      SELECT ss.*,
        fu.id as from_id, fu.name as from_name, fu.avatar_url as from_avatar,
        tu.id as to_id, tu.name as to_name, tu.avatar_url as to_avatar
      FROM spot_shares ss
      JOIN users fu ON ss.from_user_id = fu.id
      JOIN users tu ON ss.to_user_id = tu.id
      WHERE ss.from_user_id = $1 OR ss.to_user_id = $1
      ORDER BY ss.created_at DESC
    `, [userId]);

    const toShare = (r: any): SpotShareWithUser => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      name: r.name,
      type: r.type,
      address: r.address,
      neighborhood: r.neighborhood,
      city: r.city,
      website: r.website,
      priceRange: r.price_range,
      tags: r.tags,
      openingHours: r.opening_hours,
      rating: r.rating,
      spotNotes: r.spot_notes,
      notes: r.notes,
      createdAt: r.created_at,
      isDismissed: r.is_dismissed,
      fromUser: { id: r.from_id, name: r.from_name, avatarUrl: r.from_avatar },
      toUser: { id: r.to_id, name: r.to_name, avatarUrl: r.to_avatar },
    });

    const received = rows.rows.filter((r: any) => r.to_user_id === userId && !r.is_dismissed).map(toShare);
    const sent = rows.rows.filter((r: any) => r.from_user_id === userId).map(toShare);
    return { received, sent };
  },

  async dismissSpotShare(id, userId) {
    const result = await pool.query(
      `UPDATE spot_shares SET is_dismissed = true WHERE id = $1 AND to_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async deleteSpotShare(id, userId) {
    const result = await pool.query(
      `DELETE FROM spot_shares WHERE id = $1 AND from_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  // ── Movie Shares ────────────────────────────────────────────────────────────
  async sendMovieShare(data) {
    const result = await db.insert(movieShares).values(data).returning();
    return result[0];
  },

  async getMovieShares(userId) {
    const rows = await pool.query(`
      SELECT ms.*,
        fu.id as from_id, fu.name as from_name, fu.avatar_url as from_avatar,
        tu.id as to_id, tu.name as to_name, tu.avatar_url as to_avatar
      FROM movie_shares ms
      JOIN users fu ON ms.from_user_id = fu.id
      JOIN users tu ON ms.to_user_id = tu.id
      WHERE ms.from_user_id = $1 OR ms.to_user_id = $1
      ORDER BY ms.created_at DESC
    `, [userId]);

    const toShare = (r: any): MovieShareWithUser => ({
      id: r.id,
      fromUserId: r.from_user_id,
      toUserId: r.to_user_id,
      mediaType: r.media_type,
      title: r.title,
      year: r.year,
      director: r.director,
      genres: r.genres,
      streamingOn: r.streaming_on,
      posterColor: r.poster_color,
      posterUrl: r.poster_url,
      notes: r.notes,
      createdAt: r.created_at,
      isDismissed: r.is_dismissed,
      fromUser: { id: r.from_id, name: r.from_name, avatarUrl: r.from_avatar },
      toUser: { id: r.to_id, name: r.to_name, avatarUrl: r.to_avatar },
    });

    const received = rows.rows.filter((r: any) => r.to_user_id === userId && !r.is_dismissed).map(toShare);
    const sent = rows.rows.filter((r: any) => r.from_user_id === userId).map(toShare);
    return { received, sent };
  },

  async dismissMovieShare(id, userId) {
    const result = await pool.query(
      `UPDATE movie_shares SET is_dismissed = true WHERE id = $1 AND to_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async deleteMovieShare(id, userId) {
    const result = await pool.query(
      `DELETE FROM movie_shares WHERE id = $1 AND from_user_id = $2`,
      [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async getUnreadSharesCount(userId) {
    const result = await pool.query(
      `SELECT
        (SELECT COUNT(*) FROM book_recommendations WHERE to_user_id = $1 AND is_dismissed = false AND is_read = false)::int  AS books,
        (SELECT COUNT(*) FROM music_recommendations WHERE to_user_id = $1 AND is_dismissed = false AND is_read = false)::int AS music,
        (SELECT COUNT(*) FROM recipe_shares WHERE to_user_id = $1 AND is_dismissed = false AND is_read = false)::int         AS recipes,
        (SELECT COUNT(*) FROM movie_shares WHERE to_user_id = $1 AND is_dismissed = false AND is_read = false)::int          AS movies,
        (SELECT COUNT(*) FROM spot_shares WHERE to_user_id = $1 AND is_dismissed = false AND is_read = false)::int           AS spots,
        (SELECT COUNT(*) FROM art_shares WHERE to_user_id = $1 AND is_dismissed = false AND is_read = false)::int            AS art,
        (SELECT COUNT(*) FROM quote_shares WHERE to_user_id = $1 AND is_dismissed = false AND is_read = false)::int          AS quotes,
        (SELECT COUNT(*) FROM workout_shares WHERE to_user_id = $1 AND is_dismissed = false AND is_read = false)::int        AS workouts`,
      [userId]
    );
    const row = result.rows[0];
    const { books, music, recipes, movies, spots, art, quotes, workouts } = row;
    return { total: books + music + recipes + movies + spots + art + quotes + workouts, books, music, recipes, movies, spots, art, quotes, workouts };
  },

  async markSharesRead(type, userId) {
    if (type === "workouts") {
      await pool.query(`UPDATE workout_shares SET is_read = true WHERE to_user_id = $1 AND is_read = false`, [userId]);
      return;
    }
    const tableMap: Record<string, string> = {
      books: "book_recommendations",
      music: "music_recommendations",
      recipes: "recipe_shares",
      movies: "movie_shares",
      spots: "spot_shares",
      art: "art_shares",
      quotes: "quote_shares",
    };
    const table = tableMap[type];
    if (!table) return;
    await pool.query(`UPDATE ${table} SET is_read = true WHERE to_user_id = $1 AND is_read = false`, [userId]);
  },

  // ── Unified Recommendations Inbox ────────────────────────────────────────────

  async getRecommendationsInbox(userId: number, filterType?: string) {
    type Row = { id: number; from_user_id: number; from_name: string; from_avatar: string | null; title: string; subtitle: string | null; image_url: string | null; note: string | null; created_at: string; is_read: boolean };

    const queries: Array<{ type: string; sql: string }> = [
      { type: "book", sql: `
        SELECT br.id, br.from_user_id, u.name as from_name, u.avatar_url as from_avatar,
          br.book_title as title, br.book_author as subtitle, br.cover_url as image_url,
          br.notes as note, br.created_at, br.is_read
        FROM book_recommendations br JOIN users u ON u.id = br.from_user_id
        WHERE br.to_user_id = $1 AND br.is_dismissed = false` },
      { type: "movie", sql: `
        SELECT ms.id, ms.from_user_id, u.name as from_name, u.avatar_url as from_avatar,
          ms.title, ms.director as subtitle, ms.poster_url as image_url,
          ms.notes as note, ms.created_at, ms.is_read
        FROM movie_shares ms JOIN users u ON u.id = ms.from_user_id
        WHERE ms.to_user_id = $1 AND ms.is_dismissed = false` },
      { type: "music", sql: `
        SELECT mr.id, mr.from_user_id, u.name as from_name, u.avatar_url as from_avatar,
          mr.artist_name as title, mr.song_title as subtitle, NULL::text as image_url,
          mr.notes as note, mr.created_at, mr.is_read
        FROM music_recommendations mr JOIN users u ON u.id = mr.from_user_id
        WHERE mr.to_user_id = $1 AND mr.is_dismissed = false` },
      { type: "recipe", sql: `
        SELECT rs.id, rs.from_user_id, u.name as from_name, u.avatar_url as from_avatar,
          rs.recipe_name as title, rs.recipe_category as subtitle, rs.recipe_image_url as image_url,
          rs.notes as note, rs.created_at, rs.is_read
        FROM recipe_shares rs JOIN users u ON u.id = rs.from_user_id
        WHERE rs.to_user_id = $1 AND rs.is_dismissed = false` },
      { type: "spot", sql: `
        SELECT ss.id, ss.from_user_id, u.name as from_name, u.avatar_url as from_avatar,
          ss.name as title, ss.city as subtitle, NULL::text as image_url,
          ss.notes as note, ss.created_at, ss.is_read
        FROM spot_shares ss JOIN users u ON u.id = ss.from_user_id
        WHERE ss.to_user_id = $1 AND ss.is_dismissed = false` },
      { type: "art", sql: `
        SELECT as2.id, as2.from_user_id, u.name as from_name, u.avatar_url as from_avatar,
          as2.title, as2.artist_name as subtitle, as2.image_url as image_url,
          as2.notes as note, as2.created_at, as2.is_read
        FROM art_shares as2 JOIN users u ON u.id = as2.from_user_id
        WHERE as2.to_user_id = $1 AND as2.is_dismissed = false` },
      { type: "quote", sql: `
        SELECT qs.id, qs.from_user_id, u.name as from_name, u.avatar_url as from_avatar,
          qs.text as title, qs.author as subtitle, NULL::text as image_url,
          qs.notes as note, qs.created_at, qs.is_read
        FROM quote_shares qs JOIN users u ON u.id = qs.from_user_id
        WHERE qs.to_user_id = $1 AND qs.is_dismissed = false` },
    ];

    const active = filterType && filterType !== "all"
      ? queries.filter(q => q.type === filterType)
      : queries;

    const results = await Promise.all(
      active.map(q => pool.query<Row>(q.sql, [userId]).then(r => r.rows.map(row => ({
        id: row.id,
        recType: q.type,
        fromUser: { id: row.from_user_id, name: row.from_name, avatarUrl: row.from_avatar },
        title: row.title,
        subtitle: row.subtitle,
        imageUrl: row.image_url,
        note: row.note,
        createdAt: row.created_at,
        isRead: row.is_read,
      }))))
    );

    return results.flat().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async markRecommendationRead(userId: number, type: string, id: number) {
    const tableMap: Record<string, string> = {
      book: "book_recommendations", movie: "movie_shares", music: "music_recommendations",
      recipe: "recipe_shares", spot: "spot_shares", art: "art_shares", quote: "quote_shares",
    };
    const table = tableMap[type];
    if (!table) return;
    await pool.query(
      `UPDATE ${table} SET is_read = true WHERE id = $1 AND to_user_id = $2`,
      [id, userId]
    );
  },

  async addRecommendationToCollection(userId: number, type: string, recId: number) {
    const tableMap: Record<string, string> = {
      book: "book_recommendations", movie: "movie_shares", music: "music_recommendations",
      recipe: "recipe_shares", spot: "spot_shares", art: "art_shares", quote: "quote_shares",
    };
    const table = tableMap[type];
    if (!table) throw new Error(`Unknown rec type: ${type}`);

    // Fetch the rec row
    const row = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND to_user_id = $2`, [recId, userId]);
    if (!row.rows[0]) throw new Error("Recommendation not found");
    const r = row.rows[0];

    // Mark read
    await pool.query(`UPDATE ${table} SET is_read = true WHERE id = $1`, [recId]);

    // Insert into user's collection using same logic as copyFromProfile
    switch (type) {
      case "book":
        return db.insert(books).values({ userId, title: r.book_title, author: r.book_author ?? null, coverUrl: r.cover_url ?? null, status: "want_to_read", isFavorite: false }).returning().then(x => x[0]);
      case "movie":
        return db.insert(movies).values({ userId, title: r.title, mediaType: r.media_type ?? "movie", posterUrl: r.poster_url ?? null, posterColor: r.poster_color ?? null, status: "backlog", isFavorite: false }).returning().then(x => x[0]);
      case "music": {
        const artist = await db.insert(musicArtists).values({ userId, name: r.artist_name, genres: null, isFavorite: false }).returning().then(x => x[0]);
        if (r.song_title) {
          await db.insert(musicSongs).values({ userId, artistId: artist.id, title: r.song_title, isFavorite: false }).catch(() => {});
        }
        return artist;
      }
      case "recipe":
        return db.insert(recipes).values({ userId, name: r.recipe_name, emoji: r.recipe_emoji ?? "🍽️", category: r.recipe_category ?? null, tags: null }).returning().then(x => x[0]);
      case "spot":
        return db.insert(spots).values({ userId, name: r.name, type: r.type ?? "restaurant", city: r.city ?? null, neighborhood: r.neighborhood ?? null, status: "want_to_visit", isFavorite: false }).returning().then(x => x[0]);
      case "art":
        return db.insert(artPieces).values({ userId, title: r.title, artistName: r.artist_name ?? null, medium: r.medium ?? "other", imageUrl: r.image_url ?? null, accentColor: r.accent_color ?? null, whereViewed: r.where_viewed ?? null, status: "want_to_see", isFavorite: false }).returning().then(x => x[0]);
      case "quote":
        return db.insert(quotes).values({ userId, text: r.text, author: r.author ?? null, category: r.category ?? "other", isFavorite: false }).returning().then(x => x[0]);
      default:
        throw new Error(`Cannot add type: ${type}`);
    }
  },

  async sendUnifiedRecommendation(fromUserId: number, toUserId: number, type: string, data: { title: string; subtitle?: string; imageUrl?: string; note?: string }) {
    const now = new Date().toISOString();
    switch (type) {
      case "book":
        return db.insert(bookRecommendations).values({ fromUserId, toUserId, bookTitle: data.title, bookAuthor: data.subtitle ?? null, coverUrl: data.imageUrl ?? null, notes: data.note ?? null, createdAt: now, isDismissed: false }).returning().then(x => x[0]);
      case "movie":
        return db.insert(movieShares).values({ fromUserId, toUserId, title: data.title, mediaType: "movie", notes: data.note ?? null, createdAt: now, isDismissed: false }).returning().then(x => x[0]);
      case "music":
        return db.insert(musicRecommendations).values({ fromUserId, toUserId, type: data.subtitle ? "song" : "artist", artistName: data.title, songTitle: data.subtitle ?? null, notes: data.note ?? null, createdAt: now, isDismissed: false }).returning().then(x => x[0]);
      case "recipe":
        return db.insert(recipeShares).values({ fromUserId, toUserId, recipeName: data.title, recipeEmoji: "🍽️", recipeIngredients: "[]", notes: data.note ?? null, createdAt: now, isDismissed: false }).returning().then(x => x[0]);
      case "spot":
        return db.insert(spotShares).values({ fromUserId, toUserId, name: data.title, type: "restaurant", notes: data.note ?? null, createdAt: now, isDismissed: false }).returning().then(x => x[0]);
      case "art":
        return db.insert(artShares).values({ fromUserId, toUserId, title: data.title, artistName: data.subtitle ?? null, notes: data.note ?? null, createdAt: now, isDismissed: false }).returning().then(x => x[0]);
      case "quote":
        return db.insert(quoteShares).values({ fromUserId, toUserId, text: data.title, author: data.subtitle ?? null, notes: data.note ?? null, createdAt: now, isDismissed: false }).returning().then(x => x[0]);
      default:
        throw new Error(`Unknown rec type: ${type}`);
    }
  },

  async getFriendsEnriched(userId: number) {
    // Get all friends
    const friendsRes = await pool.query<{ id: number; name: string; email: string; avatarUrl: string | null }>(`
      SELECT u.id, u.name, u.email, u.avatar_url as "avatarUrl"
      FROM friend_requests fr
      JOIN users u ON u.id = CASE WHEN fr.from_user_id = $1 THEN fr.to_user_id ELSE fr.from_user_id END
      WHERE fr.status = 'accepted' AND (fr.from_user_id = $1 OR fr.to_user_id = $1)
      ORDER BY u.name ASC
    `, [userId]);
    const friends = friendsRes.rows;
    if (friends.length === 0) return [];

    const friendIds = friends.map(f => f.id);

    // Batch: overlap counts for all friends
    const overlapRes = await pool.query(`
      SELECT af2.user_id as friend_id, COUNT(*) as overlap_count
      FROM activity_feed af1
      JOIN activity_feed af2
        ON af2.item_type = af1.item_type
        AND af2.item_title = af1.item_title
        AND af2.user_id != $1
      WHERE af1.user_id = $1
        AND af1.item_title IS NOT NULL
        AND af2.user_id = ANY($2::int[])
      GROUP BY af2.user_id
    `, [userId, friendIds]);
    const overlapMap = new Map<number, number>(
      overlapRes.rows.map((r: any) => [r.friend_id, parseInt(r.overlap_count, 10)])
    );

    // My total for denominator
    const myTotalRes = await pool.query(`SELECT COUNT(*) as c FROM activity_feed WHERE user_id = $1`, [userId]);
    const myTotal = parseInt(myTotalRes.rows[0].c, 10);

    // Batch: most recent activity per friend
    const actRes = await pool.query(`
      SELECT DISTINCT ON (user_id)
        user_id, activity_type, item_title, item_type, created_at
      FROM activity_feed
      WHERE user_id = ANY($1::int[])
        AND item_title IS NOT NULL
      ORDER BY user_id, created_at DESC
    `, [friendIds]);
    const actMap = new Map(actRes.rows.map((r: any) => [r.user_id, r]));

    // Friend totals for denominator
    const friendTotalsRes = await pool.query(`
      SELECT user_id, COUNT(*) as c
      FROM activity_feed
      WHERE user_id = ANY($1::int[])
      GROUP BY user_id
    `, [friendIds]);
    const friendTotalMap = new Map<number, number>(
      friendTotalsRes.rows.map((r: any) => [r.user_id, parseInt(r.c, 10)])
    );

    return friends.map(f => {
      const overlap = overlapMap.get(f.id) ?? 0;
      const friendTotal = friendTotalMap.get(f.id) ?? 0;
      const denom = Math.max(myTotal, friendTotal, 1);
      const tasteMatchPct = Math.round((overlap / denom) * 100);

      const act = actMap.get(f.id);
      let recentActivityLabel: string | null = null;
      if (act) {
        const typeLabels: Record<string, string> = {
          book: "book", movie: "movie", song: "song", recipe: "recipe",
          spot: "spot", quote: "quote", art: "artwork", workout: "workout",
        };
        const label = typeLabels[act.item_type] ?? act.item_type;
        const daysAgo = Math.round((Date.now() - new Date(act.created_at).getTime()) / 86400000);
        const when = daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo}d ago`;
        recentActivityLabel = `Added "${act.item_title.slice(0, 25)}${act.item_title.length > 25 ? "…" : ""}" ${when}`;
      }

      return { ...f, tasteMatchPct, recentActivityLabel, overlapCount: overlap };
    });
  },

  async getProfileTasteMatch(viewerId: number, targetId: number) {
    const [viewerRes, targetRes, overlapRes, mutualRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) as c FROM activity_feed WHERE user_id = $1`, [viewerId]),
      pool.query(`SELECT COUNT(*) as c FROM activity_feed WHERE user_id = $1`, [targetId]),
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE af1.item_type = 'book')   as books,
          COUNT(*) FILTER (WHERE af1.item_type = 'movie')  as movies,
          COUNT(*) FILTER (WHERE af1.item_type = 'song')   as songs,
          COUNT(*) FILTER (WHERE af1.item_type = 'recipe') as recipes,
          COUNT(*) FILTER (WHERE af1.item_type = 'spot')   as spots
        FROM activity_feed af1
        JOIN activity_feed af2
          ON af2.user_id = $2
          AND af2.item_type = af1.item_type
          AND af2.item_title = af1.item_title
        WHERE af1.user_id = $1 AND af1.item_title IS NOT NULL
      `, [viewerId, targetId]),
      pool.query(`
        SELECT COUNT(*) as c
        FROM friend_requests fr1
        JOIN friend_requests fr2
          ON (
            CASE WHEN fr1.from_user_id = $1 THEN fr1.to_user_id ELSE fr1.from_user_id END =
            CASE WHEN fr2.from_user_id = $2 THEN fr2.to_user_id ELSE fr2.from_user_id END
          )
        WHERE fr1.status = 'accepted' AND (fr1.from_user_id = $1 OR fr1.to_user_id = $1)
          AND fr2.status = 'accepted' AND (fr2.from_user_id = $2 OR fr2.to_user_id = $2)
          AND CASE WHEN fr1.from_user_id = $1 THEN fr1.to_user_id ELSE fr1.from_user_id END != $2
      `, [viewerId, targetId]),
    ]);
    const vTotal = parseInt(viewerRes.rows[0].c, 10);
    const tTotal = parseInt(targetRes.rows[0].c, 10);
    const denom = Math.max(vTotal, tTotal, 1);
    const ov = overlapRes.rows[0];
    const overlapTotal = parseInt(ov.total, 10);
    return {
      pct: Math.round((overlapTotal / denom) * 100),
      total: overlapTotal,
      mutualFriends: parseInt(mutualRes.rows[0].c, 10),
      breakdown: {
        books: parseInt(ov.books, 10),
        movies: parseInt(ov.movies, 10),
        songs: parseInt(ov.songs, 10),
        recipes: parseInt(ov.recipes, 10),
        spots: parseInt(ov.spots, 10),
      },
    };
  },

  // ── Workout Plans ────────────────────────────────────────────────────────────
  async getAllWorkoutPlans(userId) {
    return db.select().from(workoutPlans).where(eq(workoutPlans.userId, userId)).orderBy(desc(workoutPlans.createdAt));
  },
  async createWorkoutPlan(data, userId) {
    const result = await db.insert(workoutPlans).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateWorkoutPlan(id, data) {
    const result = await db.update(workoutPlans).set(data).where(eq(workoutPlans.id, id)).returning();
    return result[0] ?? null;
  },
  async deleteWorkoutPlan(id) {
    const result = await db.delete(workoutPlans).where(eq(workoutPlans.id, id));
    return (result.rowCount ?? 0) > 0;
  },
  async setActivePlan(id: number, userId: number) {
    // Toggle — flip isActive for this plan only, others unchanged
    const [current] = await db.select().from(workoutPlans).where(eq(workoutPlans.id, id));
    if (!current || current.userId !== userId) return null;
    const activating = !current.isActive;
    // When activating, set startDate to the Monday of the following calendar week
    // so week 1 begins then and the first scheduled workout falls in week 1.
    let startDate: string | null = null;
    if (activating) {
      const today = new Date();
      const day = today.getDay(); // 0=Sun … 6=Sat
      const daysUntilNextMonday = ((1 - day + 7) % 7) || 7;
      const nextMonday = new Date(today);
      nextMonday.setDate(today.getDate() + daysUntilNextMonday);
      startDate = nextMonday.toISOString().split("T")[0]; // YYYY-MM-DD
    }
    const result = await db.update(workoutPlans)
      .set({ isActive: activating, startDate })
      .where(eq(workoutPlans.id, id))
      .returning();
    return result[0] ?? null;
  },

  // ── Body Composition Plans ────────────────────────────────────────────────────
  async getBodyCompPlans(userId: number) {
    return db.select().from(bodyCompPlans).where(eq(bodyCompPlans.userId, userId)).orderBy(desc(bodyCompPlans.createdAt));
  },
  async createBodyCompPlan(data: InsertBodyCompPlan, userId: number) {
    const result = await db.insert(bodyCompPlans).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateBodyCompPlan(id: number, data: Partial<InsertBodyCompPlan>) {
    const result = await db.update(bodyCompPlans).set(data).where(eq(bodyCompPlans.id, id)).returning();
    return result[0] ?? null;
  },
  async deleteBodyCompPlan(id: number, userId: number) {
    // Delete check-ins first
    await db.delete(bodyCompCheckIns).where(and(eq(bodyCompCheckIns.planId, id), eq(bodyCompCheckIns.userId, userId)));
    const result = await db.delete(bodyCompPlans).where(and(eq(bodyCompPlans.id, id), eq(bodyCompPlans.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  },
  async getBodyCompCheckIns(planId: number, userId: number) {
    return db.select().from(bodyCompCheckIns).where(and(eq(bodyCompCheckIns.planId, planId), eq(bodyCompCheckIns.userId, userId))).orderBy(desc(bodyCompCheckIns.date));
  },
  async createBodyCompCheckIn(data: InsertBodyCompCheckIn, userId: number) {
    const result = await db.insert(bodyCompCheckIns).values({ ...data, userId }).returning();
    return result[0];
  },
  async deleteBodyCompCheckIn(id: number, userId: number) {
    const result = await db.delete(bodyCompCheckIns).where(and(eq(bodyCompCheckIns.id, id), eq(bodyCompCheckIns.userId, userId)));
    return (result.rowCount ?? 0) > 0;
  },

  // ── Workout Shares ───────────────────────────────────────────────────────────
  async createWorkoutShare(data) {
    const result = await db.insert(workoutShares).values(data).returning();
    return result[0];
  },
  async getWorkoutShares(userId) {
    const rows = await pool.query(
      `SELECT ws.*, u.name AS from_name, u.avatar_url AS from_avatar
       FROM workout_shares ws
       JOIN users u ON u.id = ws.from_user_id
       WHERE ws.to_user_id = $1 AND ws.is_dismissed = false
       ORDER BY ws.created_at DESC`,
      [userId]
    );
    return rows.rows.map((r: any) => ({
      id: r.id, fromUserId: r.from_user_id, toUserId: r.to_user_id,
      shareType: r.share_type, contentJson: r.content_json, notes: r.notes,
      createdAt: r.created_at, isDismissed: r.is_dismissed, isRead: r.is_read,
      fromUser: { id: r.from_user_id, name: r.from_name, avatarUrl: r.from_avatar },
    }));
  },
  async dismissWorkoutShare(id, userId) {
    await pool.query(`UPDATE workout_shares SET is_dismissed = true WHERE id = $1 AND to_user_id = $2`, [id, userId]);
  },

  // ── Hobbies ───────────────────────────────────────────────────────────────────
  async getAllHobbies(userId: number) {
    return db.select().from(hobbies).where(eq(hobbies.userId, userId)).orderBy(asc(hobbies.sortOrder), asc(hobbies.name));
  },
  async createHobby(data, userId) {
    const result = await db.insert(hobbies).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateHobby(id, data) {
    const existing = await db.select().from(hobbies).where(eq(hobbies.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(hobbies).set(data).where(eq(hobbies.id, id)).returning();
    return result[0];
  },
  async deleteHobby(id) {
    const result = await db.delete(hobbies).where(eq(hobbies.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  // ── Music Collections ─────────────────────────────────────────────────────────
  async getAllCollections(userId: number): Promise<MusicCollectionWithItems[]> {
    const cols = await db.select().from(musicCollections).where(eq(musicCollections.userId, userId)).orderBy(asc(musicCollections.sortOrder), asc(musicCollections.name));
    if (cols.length === 0) return [];
    // Load all items for these collections plus song/artist data
    const colIds = cols.map(c => c.id);
    const itemsRaw = await pool.query(
      `SELECT mci.*,
         ms.title as song_title, ms.album as song_album, ms.genre as song_genre,
         ms.year as song_year, ms.status as song_status, ms.is_favorite as song_is_favorite,
         ms.rating as song_rating, ms.notes as song_notes, ms.artist_id as song_artist_id,
         ma_song.name as song_artist_name,
         ma.name as artist_name, ma.genres as artist_genres, ma.is_favorite as artist_is_favorite, ma.accent_color as artist_accent_color
       FROM music_collection_items mci
       LEFT JOIN music_songs ms ON ms.id = mci.song_id AND mci.item_type = 'song'
       LEFT JOIN music_artists ma_song ON ma_song.id = ms.artist_id
       LEFT JOIN music_artists ma ON ma.id = mci.artist_id AND mci.item_type = 'artist'
       WHERE mci.collection_id = ANY($1)
       ORDER BY mci.collection_id, mci.sort_order`,
      [colIds]
    );
    const itemsByCollection = new Map<number, any[]>();
    for (const row of itemsRaw.rows) {
      if (!itemsByCollection.has(row.collection_id)) itemsByCollection.set(row.collection_id, []);
      const item: any = {
        id: row.id,
        collectionId: row.collection_id,
        itemType: row.item_type,
        songId: row.song_id,
        artistId: row.artist_id,
        sortOrder: row.sort_order,
      };
      if (row.item_type === 'song' && row.song_id) {
        item.song = {
          id: row.song_id,
          userId: null,
          artistId: row.song_artist_id,
          title: row.song_title,
          album: row.song_album,
          genre: row.song_genre,
          year: row.song_year,
          status: row.song_status,
          isFavorite: row.song_is_favorite,
          rating: row.song_rating,
          notes: row.song_notes,
          artistName: row.song_artist_name,
        };
      } else if (row.item_type === 'artist' && row.artist_id) {
        item.artist = {
          id: row.artist_id,
          userId: null,
          name: row.artist_name,
          genres: row.artist_genres,
          isFavorite: row.artist_is_favorite,
          accentColor: row.artist_accent_color,
          notes: null,
        };
      }
      itemsByCollection.get(row.collection_id)!.push(item);
    }
    return cols.map(c => ({ ...c, items: itemsByCollection.get(c.id) ?? [] }));
  },

  async createCollection(data, userId) {
    const result = await db.insert(musicCollections).values({
      userId,
      name: (data as any).name,
      description: (data as any).description ?? null,
      coverColor: (data as any).coverColor ?? '#6366f1',
      coverEmoji: (data as any).coverEmoji ?? '🎵',
      sharedWithFriends: (data as any).sharedWithFriends ?? false,
      sortOrder: (data as any).sortOrder ?? 0,
    }).returning();
    return result[0];
  },

  async updateCollection(id, data) {
    const existing = await db.select().from(musicCollections).where(eq(musicCollections.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(musicCollections).set(data as any).where(eq(musicCollections.id, id)).returning();
    return result[0];
  },

  async deleteCollection(id) {
    await pool.query(`DELETE FROM music_collection_items WHERE collection_id = $1`, [id]);
    const result = await db.delete(musicCollections).where(eq(musicCollections.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  async addCollectionItem(collectionId, itemType, songId, artistId) {
    // Get current max sort_order for this collection
    const maxRes = await pool.query(
      `SELECT COALESCE(MAX(sort_order), -1) as max_order FROM music_collection_items WHERE collection_id = $1`,
      [collectionId]
    );
    const nextOrder = (maxRes.rows[0]?.max_order ?? -1) + 1;
    const result = await db.insert(musicCollectionItems).values({
      collectionId,
      itemType,
      songId: songId ?? null,
      artistId: artistId ?? null,
      sortOrder: nextOrder,
    }).returning();
    return result[0];
  },

  async removeCollectionItem(itemId) {
    const result = await db.delete(musicCollectionItems).where(eq(musicCollectionItems.id, itemId));
    return (result.rowCount ?? 0) > 0;
  },

  async reorderCollectionItems(collectionId, itemIds) {
    for (let i = 0; i < itemIds.length; i++) {
      await db.update(musicCollectionItems)
        .set({ sortOrder: i })
        .where(eq(musicCollectionItems.id, itemIds[i]));
    }
  },

  // ── Tab Collaborations ──────────────────────────────────────────────────────
  async getTabCollaborations(userId) {
    const rows = await pool.query<{
      id: number; owner_user_id: number; collaborator_user_id: number;
      tab_name: string; status: string; created_at: string;
      other_id: number; other_name: string; other_email: string; other_avatar: string | null;
    }>(
      `SELECT tc.*,
              u.id AS other_id, u.name AS other_name, u.email AS other_email, u.avatar_url AS other_avatar
       FROM tab_collaborations tc
       JOIN users u ON u.id = CASE
         WHEN tc.owner_user_id = $1 THEN tc.collaborator_user_id
         ELSE tc.owner_user_id
       END
       WHERE tc.owner_user_id = $1 OR tc.collaborator_user_id = $1
       ORDER BY tc.created_at DESC`,
      [userId]
    );
    return rows.rows.map(r => ({
      id: r.id,
      ownerUserId: r.owner_user_id,
      collaboratorUserId: r.collaborator_user_id,
      tabName: r.tab_name,
      status: r.status,
      createdAt: r.created_at,
      otherUser: { id: r.other_id, name: r.other_name, email: r.other_email, avatarUrl: r.other_avatar },
      role: r.owner_user_id === userId ? "owner" : "collaborator",
    } as TabCollaborationWithUser));
  },

  async createTabCollaboration(data) {
    const result = await db.insert(tabCollaborations).values(data).returning();
    return result[0];
  },

  async updateTabCollaborationStatus(id, status) {
    const result = await db.update(tabCollaborations)
      .set({ status })
      .where(eq(tabCollaborations.id, id))
      .returning();
    return result[0];
  },

  async deleteTabCollaboration(id) {
    const result = await db.delete(tabCollaborations).where(eq(tabCollaborations.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  async getTabUserId(requestingUserId, tabName) {
    const result = await pool.query<{ owner_user_id: number }>(
      `SELECT owner_user_id FROM tab_collaborations
       WHERE collaborator_user_id = $1 AND tab_name = $2 AND status = 'accepted'
       LIMIT 1`,
      [requestingUserId, tabName]
    );
    return result.rows[0]?.owner_user_id ?? requestingUserId;
  },

  // ── Faith & Spirituality ────────────────────────────────────────────────────
  async getSacredTexts(userId) {
    return db.select().from(sacredTexts).where(eq(sacredTexts.userId, userId)).orderBy(desc(sacredTexts.id));
  },
  async createSacredText(data) {
    const result = await db.insert(sacredTexts).values(data).returning();
    return result[0];
  },
  async updateSacredText(id, data) {
    const result = await db.update(sacredTexts).set(data).where(eq(sacredTexts.id, id)).returning();
    return result[0];
  },
  async deleteSacredText(id) {
    const result = await db.delete(sacredTexts).where(eq(sacredTexts.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  async getFaithPractices(userId) {
    return db.select().from(faithPractices).where(eq(faithPractices.userId, userId)).orderBy(asc(faithPractices.id));
  },
  async createFaithPractice(data) {
    const result = await db.insert(faithPractices).values(data).returning();
    return result[0];
  },
  async updateFaithPractice(id, data) {
    const result = await db.update(faithPractices).set(data).where(eq(faithPractices.id, id)).returning();
    return result[0];
  },
  async deleteFaithPractice(id) {
    const result = await db.delete(faithPractices).where(eq(faithPractices.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  async getSermons(userId) {
    return db.select().from(sermons).where(eq(sermons.userId, userId)).orderBy(desc(sermons.id));
  },
  async createSermon(data) {
    const result = await db.insert(sermons).values(data).returning();
    return result[0];
  },
  async updateSermon(id, data) {
    const result = await db.update(sermons).set(data).where(eq(sermons.id, id)).returning();
    return result[0];
  },
  async deleteSermon(id) {
    const result = await db.delete(sermons).where(eq(sermons.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  async getPrayerItems(userId) {
    return db.select().from(prayerItems).where(eq(prayerItems.userId, userId)).orderBy(asc(prayerItems.dateAdded));
  },
  async createPrayerItem(data) {
    const result = await db.insert(prayerItems).values(data).returning();
    return result[0];
  },
  async updatePrayerItem(id, data) {
    const result = await db.update(prayerItems).set(data).where(eq(prayerItems.id, id)).returning();
    return result[0];
  },
  async deletePrayerItem(id) {
    const result = await db.delete(prayerItems).where(eq(prayerItems.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  // ── Health ─────────────────────────────────────────────────────────────────
  async getMedications(userId: number) {
    return db.select().from(medications).where(eq(medications.userId, userId)).orderBy(asc(medications.name));
  },
  async createMedication(data: any, userId: number) {
    const result = await db.insert(medications).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateMedication(id: number, data: any) {
    const result = await db.update(medications).set(data).where(eq(medications.id, id)).returning();
    return result[0];
  },
  async deleteMedication(id: number) {
    const result = await db.delete(medications).where(eq(medications.id, id));
    return (result.rowCount ?? 0) > 0;
  },
  async getHealthMetrics(userId: number) {
    return db.select().from(healthMetrics).where(eq(healthMetrics.userId, userId)).orderBy(desc(healthMetrics.date), asc(healthMetrics.name));
  },
  async createHealthMetric(data: any, userId: number) {
    const result = await db.insert(healthMetrics).values({ ...data, userId }).returning();
    return result[0];
  },
  async deleteHealthMetric(id: number) {
    const result = await db.delete(healthMetrics).where(eq(healthMetrics.id, id));
    return (result.rowCount ?? 0) > 0;
  },
  async getSleepLogs(userId: number) {
    return db.select().from(sleepLogs).where(eq(sleepLogs.userId, userId)).orderBy(desc(sleepLogs.date));
  },
  async createSleepLog(data: any, userId: number) {
    const result = await db.insert(sleepLogs).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateSleepLog(id: number, data: any) {
    const result = await db.update(sleepLogs).set(data).where(eq(sleepLogs.id, id)).returning();
    return result[0];
  },
  async deleteSleepLog(id: number) {
    const result = await db.delete(sleepLogs).where(eq(sleepLogs.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  // ── Care Team ──────────────────────────────────────────────────────────────
  async getCareProviders(userId: number) {
    return db.select().from(careProviders).where(eq(careProviders.userId, userId)).orderBy(asc(careProviders.name));
  },
  async createCareProvider(data: any, userId: number) {
    const result = await db.insert(careProviders).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateCareProvider(id: number, data: any) {
    const result = await db.update(careProviders).set(data).where(eq(careProviders.id, id)).returning();
    return result[0];
  },
  async deleteCareProvider(id: number) {
    const result = await db.delete(careProviders).where(eq(careProviders.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  // ── Politics ────────────────────────────────────────────────────────────────
  async getPoliticalOfficials(userId: number) {
    return db.select().from(politicalOfficials).where(eq(politicalOfficials.userId, userId)).orderBy(asc(politicalOfficials.level), asc(politicalOfficials.name));
  },
  async createPoliticalOfficial(data: any, userId: number) {
    const result = await db.insert(politicalOfficials).values({ ...data, userId }).returning();
    return result[0];
  },
  async updatePoliticalOfficial(id: number, data: any) {
    const result = await db.update(politicalOfficials).set(data).where(eq(politicalOfficials.id, id)).returning();
    return result[0];
  },
  async deletePoliticalOfficial(id: number) {
    const result = await db.delete(politicalOfficials).where(eq(politicalOfficials.id, id));
    return (result.rowCount ?? 0) > 0;
  },
  async getPoliticalIssues(userId: number) {
    return db.select().from(politicalIssues).where(eq(politicalIssues.userId, userId)).orderBy(desc(politicalIssues.importance), asc(politicalIssues.topic));
  },
  async createPoliticalIssue(data: any, userId: number) {
    const result = await db.insert(politicalIssues).values({ ...data, userId }).returning();
    return result[0];
  },
  async updatePoliticalIssue(id: number, data: any) {
    const result = await db.update(politicalIssues).set(data).where(eq(politicalIssues.id, id)).returning();
    return result[0];
  },
  async deletePoliticalIssue(id: number) {
    const result = await db.delete(politicalIssues).where(eq(politicalIssues.id, id));
    return (result.rowCount ?? 0) > 0;
  },
  async getPoliticalElections(userId: number) {
    return db.select().from(politicalElections).where(eq(politicalElections.userId, userId)).orderBy(asc(politicalElections.date));
  },
  async createPoliticalElection(data: any, userId: number) {
    const result = await db.insert(politicalElections).values({ ...data, userId }).returning();
    return result[0];
  },
  async updatePoliticalElection(id: number, data: any) {
    const result = await db.update(politicalElections).set(data).where(eq(politicalElections.id, id)).returning();
    return result[0];
  },
  async deletePoliticalElection(id: number) {
    const result = await db.delete(politicalElections).where(eq(politicalElections.id, id));
    return (result.rowCount ?? 0) > 0;
  },
  async getCivicActions(userId: number) {
    return db.select().from(civicActions).where(eq(civicActions.userId, userId)).orderBy(desc(civicActions.date));
  },
  async createCivicAction(data: any, userId: number) {
    const result = await db.insert(civicActions).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateCivicAction(id: number, data: any) {
    const result = await db.update(civicActions).set(data).where(eq(civicActions.id, id)).returning();
    return result[0];
  },
  async deleteCivicAction(id: number) {
    const result = await db.delete(civicActions).where(eq(civicActions.id, id));
    return (result.rowCount ?? 0) > 0;
  },
  async getPoliticalNewsSources(userId: number) {
    return db.select().from(politicalNewsSources).where(eq(politicalNewsSources.userId, userId)).orderBy(asc(politicalNewsSources.name));
  },
  async createPoliticalNewsSource(data: any, userId: number) {
    const result = await db.insert(politicalNewsSources).values({ ...data, userId }).returning();
    return result[0];
  },
  async updatePoliticalNewsSource(id: number, data: any) {
    const result = await db.update(politicalNewsSources).set(data).where(eq(politicalNewsSources.id, id)).returning();
    return result[0];
  },
  async deletePoliticalNewsSource(id: number) {
    const result = await db.delete(politicalNewsSources).where(eq(politicalNewsSources.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  // ── Political Debates ──────────────────────────────────────────────────────
  async getDebatesForUser(userId: number) {
    // Debates the user created OR joined
    const created = await db.select().from(politicalDebates).where(eq(politicalDebates.userId, userId));
    const memberships = await db.select().from(politicalDebateMembers).where(eq(politicalDebateMembers.userId, userId));
    const joinedIds = memberships.map(m => m.debateId).filter(id => !created.find(d => d.id === id));
    let joined: any[] = [];
    if (joinedIds.length > 0) {
      joined = await Promise.all(joinedIds.map(id => db.select().from(politicalDebates).where(eq(politicalDebates.id, id)).then(r => r[0]).catch(() => null)));
      joined = joined.filter(Boolean);
    }
    return [...created, ...joined].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },
  async getDebateById(id: number) {
    const rows = await db.select().from(politicalDebates).where(eq(politicalDebates.id, id));
    return rows[0] ?? null;
  },
  async getDebateByShareCode(shareCode: string) {
    const rows = await db.select().from(politicalDebates).where(eq(politicalDebates.shareCode, shareCode));
    return rows[0] ?? null;
  },
  async createDebate(data: any, userId: number) {
    const result = await db.insert(politicalDebates).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateDebate(id: number, data: any) {
    const result = await db.update(politicalDebates).set(data).where(eq(politicalDebates.id, id)).returning();
    return result[0];
  },
  async deleteDebate(id: number) {
    await db.delete(politicalDebatePosts).where(eq(politicalDebatePosts.debateId, id));
    await db.delete(politicalDebateMembers).where(eq(politicalDebateMembers.debateId, id));
    const result = await db.delete(politicalDebates).where(eq(politicalDebates.id, id));
    return (result.rowCount ?? 0) > 0;
  },
  async joinDebate(debateId: number, userId: number) {
    await db.insert(politicalDebateMembers).values({ debateId, userId }).onConflictDoNothing();
  },
  async getDebateMembers(debateId: number) {
    return db.select().from(politicalDebateMembers).where(eq(politicalDebateMembers.debateId, debateId));
  },
  async getDebateMembersWithNames(debateId: number) {
    const rows = await pool.query(`
      SELECT u.id, u.name, u.email, u.avatar_url as "avatarUrl", dm.joined_at as "joinedAt"
      FROM political_debate_members dm
      JOIN users u ON u.id = dm.user_id
      WHERE dm.debate_id = $1
      ORDER BY dm.joined_at ASC
    `, [debateId]);
    return rows.rows as Array<{ id: number; name: string; email: string; avatarUrl: string | null; joinedAt: string }>;
  },

  // Posts
  async getDebatePosts(debateId: number) {
    return db.select().from(politicalDebatePosts).where(eq(politicalDebatePosts.debateId, debateId)).orderBy(asc(politicalDebatePosts.createdAt));
  },
  async createDebatePost(data: any, userId: number) {
    const result = await db.insert(politicalDebatePosts).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateDebatePost(id: number, data: any) {
    const result = await db.update(politicalDebatePosts).set(data).where(eq(politicalDebatePosts.id, id)).returning();
    return result[0];
  },
  async deleteDebatePost(id: number) {
    await db.delete(politicalDebateUpvotes).where(eq(politicalDebateUpvotes.postId, id));
    const result = await db.delete(politicalDebatePosts).where(eq(politicalDebatePosts.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  // Upvotes
  async getUpvotesForDebate(debateId: number) {
    // Get all upvotes for posts in this debate
    const posts = await db.select({ id: politicalDebatePosts.id }).from(politicalDebatePosts).where(eq(politicalDebatePosts.debateId, debateId));
    if (posts.length === 0) return [];
    const postIds = posts.map(p => p.id);
    const all: any[] = [];
    for (const pid of postIds) {
      const uvs = await db.select().from(politicalDebateUpvotes).where(eq(politicalDebateUpvotes.postId, pid));
      all.push(...uvs);
    }
    return all;
  },
  async toggleUpvote(postId: number, userId: number) {
    const existing = await db.select().from(politicalDebateUpvotes)
      .where(eq(politicalDebateUpvotes.postId, postId));
    const mine = existing.find(u => u.userId === userId);
    if (mine) {
      await db.delete(politicalDebateUpvotes).where(eq(politicalDebateUpvotes.id, mine.id));
      await db.update(politicalDebatePosts).set({ upvoteCount: Math.max(0, existing.length - 1) }).where(eq(politicalDebatePosts.id, postId));
      return false; // removed
    } else {
      await db.insert(politicalDebateUpvotes).values({ postId, userId });
      await db.update(politicalDebatePosts).set({ upvoteCount: existing.length + 1 }).where(eq(politicalDebatePosts.id, postId));
      return true; // added
    }
  },

  // ── Trips ──────────────────────────────────────────────────────────────────
  async getAllTrips(userId: number) {
    return db.select().from(trips).where(eq(trips.userId, userId)).orderBy(asc(trips.startDate));
  },
  async createTrip(data: InsertTrip, userId: number) {
    const result = await db.insert(trips).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateTrip(id: number, data: Partial<InsertTrip>) {
    const existing = await db.select().from(trips).where(eq(trips.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(trips).set(data).where(eq(trips.id, id)).returning();
    return result[0];
  },
  async deleteTrip(id: number) {
    await db.delete(tripItems).where(eq(tripItems.tripId, id));
    const result = await db.delete(trips).where(eq(trips.id, id));
    return (result.rowCount ?? 0) > 0;
  },
  async getTripItems(tripId: number) {
    return db.select().from(tripItems).where(eq(tripItems.tripId, tripId)).orderBy(asc(tripItems.date), asc(tripItems.sortOrder));
  },
  async createTripItem(data: InsertTripItem, userId: number) {
    const result = await db.insert(tripItems).values({ ...data, userId }).returning();
    return result[0];
  },
  async updateTripItem(id: number, data: Partial<InsertTripItem>) {
    const existing = await db.select().from(tripItems).where(eq(tripItems.id, id)).limit(1);
    if (!existing[0]) return undefined;
    const result = await db.update(tripItems).set(data).where(eq(tripItems.id, id)).returning();
    return result[0];
  },
  async deleteTripItem(id: number) {
    const result = await db.delete(tripItems).where(eq(tripItems.id, id));
    return (result.rowCount ?? 0) > 0;
  },

  // ── Visited Cities ────────────────────────────────────────────────────────────
  async getVisitedCities(userId: number) {
    const result = await pool.query(
      `SELECT * FROM visited_cities WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map((r: any) => ({
      id: r.id, userId: r.user_id, city: r.city, country: r.country,
      lat: r.lat, lon: r.lon, visitedDate: r.visited_date,
      notes: r.notes, createdAt: r.created_at,
    }));
  },
  async addVisitedCity(userId: number, data: { city: string; country?: string; lat?: number; lon?: number; visitedDate?: string; notes?: string }) {
    const now = new Date().toISOString();
    const result = await pool.query(
      `INSERT INTO visited_cities (user_id, city, country, lat, lon, visited_date, notes, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [userId, data.city, data.country ?? null, data.lat ?? null, data.lon ?? null,
       data.visitedDate ?? null, data.notes ?? null, now]
    );
    const r = result.rows[0];
    return { id: r.id, userId: r.user_id, city: r.city, country: r.country,
             lat: r.lat, lon: r.lon, visitedDate: r.visited_date, notes: r.notes, createdAt: r.created_at };
  },
  async updateVisitedCity(id: number, userId: number, data: Partial<{ city: string; country: string; lat: number; lon: number; visitedDate: string; notes: string }>) {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;
    if (data.city        !== undefined) { fields.push(`city=$${idx++}`);         values.push(data.city); }
    if (data.country     !== undefined) { fields.push(`country=$${idx++}`);      values.push(data.country); }
    if (data.lat         !== undefined) { fields.push(`lat=$${idx++}`);          values.push(data.lat); }
    if (data.lon         !== undefined) { fields.push(`lon=$${idx++}`);          values.push(data.lon); }
    if (data.visitedDate !== undefined) { fields.push(`visited_date=$${idx++}`); values.push(data.visitedDate); }
    if (data.notes       !== undefined) { fields.push(`notes=$${idx++}`);        values.push(data.notes); }
    if (fields.length === 0) return null;
    values.push(id, userId);
    const result = await pool.query(
      `UPDATE visited_cities SET ${fields.join(",")} WHERE id=$${idx++} AND user_id=$${idx} RETURNING *`,
      values
    );
    const r = result.rows[0];
    if (!r) return null;
    return { id: r.id, userId: r.user_id, city: r.city, country: r.country,
             lat: r.lat, lon: r.lon, visitedDate: r.visited_date, notes: r.notes, createdAt: r.created_at };
  },
  async deleteVisitedCity(id: number, userId: number) {
    const result = await pool.query(
      `DELETE FROM visited_cities WHERE id=$1 AND user_id=$2`, [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  // ── Family Tree ───────────────────────────────────────────────────────────────
  async getFamilyMembers(userId: number) {
    const { rows } = await pool.query(
      `SELECT * FROM family_members WHERE user_id = $1 ORDER BY
        CASE role
          WHEN 'great_grandparent' THEN 1
          WHEN 'grandparent' THEN 2
          WHEN 'parent' THEN 3
          WHEN 'aunt_uncle' THEN 3
          WHEN 'self' THEN 4
          WHEN 'spouse' THEN 4
          WHEN 'sibling' THEN 4
          WHEN 'child' THEN 5
          WHEN 'grandchild' THEN 6
          ELSE 7
        END, side, name`,
      [userId]
    );
    return rows.map((r: any) => ({
      id: r.id, userId: r.user_id, name: r.name, gender: r.gender,
      role: r.role, side: r.side, birthYear: r.birth_year, deathYear: r.death_year,
      birthPlace: r.birth_place, notes: r.notes, isDeceased: r.is_deceased,
      parent1Id: r.parent1_id ?? null, parent2Id: r.parent2_id ?? null,
      createdAt: r.created_at,
    }));
  },
  async addFamilyMember(userId: number, data: { name: string; gender?: string; role?: string; side?: string; birthYear?: number; deathYear?: number; birthPlace?: string; notes?: string; isDeceased?: number; parent1Id?: number | null; parent2Id?: number | null }) {
    const { rows } = await pool.query(
      `INSERT INTO family_members (user_id, name, gender, role, side, birth_year, death_year, birth_place, notes, is_deceased, parent1_id, parent2_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [userId, data.name, data.gender ?? "unknown", data.role ?? "other", data.side ?? "none",
       data.birthYear ?? null, data.deathYear ?? null, data.birthPlace ?? null,
       data.notes ?? null, data.isDeceased ?? 0,
       data.parent1Id ?? null, data.parent2Id ?? null,
       new Date().toISOString()]
    );
    const r = rows[0];
    return { id: r.id, userId: r.user_id, name: r.name, gender: r.gender,
             role: r.role, side: r.side, birthYear: r.birth_year, deathYear: r.death_year,
             birthPlace: r.birth_place, notes: r.notes, isDeceased: r.is_deceased,
             parent1Id: r.parent1_id ?? null, parent2Id: r.parent2_id ?? null,
             createdAt: r.created_at };
  },
  async updateFamilyMember(id: number, userId: number, data: Partial<{ name: string; gender: string; role: string; side: string; birthYear: number | null; deathYear: number | null; birthPlace: string; notes: string; isDeceased: number; parent1Id: number | null; parent2Id: number | null }>) {
    const fieldMap: Record<string, string> = {
      name: "name", gender: "gender", role: "role", side: "side",
      birthYear: "birth_year", deathYear: "death_year", birthPlace: "birth_place",
      notes: "notes", isDeceased: "is_deceased",
      parent1Id: "parent1_id", parent2Id: "parent2_id",
    };
    const fields: string[] = []; const values: any[] = [];
    let idx = 1;
    for (const [k, v] of Object.entries(data)) {
      if (fieldMap[k]) { fields.push(`${fieldMap[k]}=$${idx++}`); values.push(v); }
    }
    if (!fields.length) return null;
    values.push(id); values.push(userId);
    const { rows } = await pool.query(
      `UPDATE family_members SET ${fields.join(",")} WHERE id=$${idx++} AND user_id=$${idx} RETURNING *`,
      values
    );
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, userId: r.user_id, name: r.name, gender: r.gender,
             role: r.role, side: r.side, birthYear: r.birth_year, deathYear: r.death_year,
             birthPlace: r.birth_place, notes: r.notes, isDeceased: r.is_deceased,
             parent1Id: r.parent1_id ?? null, parent2Id: r.parent2_id ?? null,
             createdAt: r.created_at };
  },
  async deleteFamilyMember(id: number, userId: number) {
    const result = await pool.query(
      `DELETE FROM family_members WHERE id=$1 AND user_id=$2`, [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  // ── Activity Feed ─────────────────────────────────────────────────────────────
  async logActivity(userId, type, itemId, itemType, title, imageUrl, subtitle, extra) {
    await db.insert(activityFeed).values({
      userId,
      activityType: type,
      itemId: itemId ?? undefined,
      itemType: itemType ?? undefined,
      itemTitle: title ?? undefined,
      itemImageUrl: imageUrl ?? undefined,
      itemSubtitle: subtitle ?? undefined,
      itemExtra: extra ?? undefined,
    });
  },

  async getFeedForUser(userId, page, pageSize) {
    const offset = (page - 1) * pageSize;
    // Get friends (users where accepted friend request exists)
    const friendsResult = await pool.query(`
      SELECT CASE WHEN from_user_id = $1 THEN to_user_id ELSE from_user_id END as friend_id
      FROM friend_requests
      WHERE status = 'accepted' AND (from_user_id = $1 OR to_user_id = $1)
    `, [userId]);
    const friendIds: number[] = friendsResult.rows.map((r: any) => r.friend_id);
    // Include own activity in the feed
    const allIds = [userId, ...friendIds];
    if (allIds.length === 0) return { items: [], total: 0 };

    const placeholders = allIds.map((_, i) => `$${i + 1}`).join(",");
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM activity_feed WHERE user_id IN (${placeholders})`,
      allIds
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const itemsResult = await pool.query(`
      SELECT af.*, u.name as user_name, u.avatar_url as user_avatar_url, u.id as user_id_val
      FROM activity_feed af
      JOIN users u ON u.id = af.user_id
      WHERE af.user_id IN (${placeholders})
      ORDER BY af.created_at DESC
      LIMIT $${allIds.length + 1} OFFSET $${allIds.length + 2}
    `, [...allIds, pageSize, offset]);

    const feedItems = itemsResult.rows;
    if (feedItems.length === 0) return { items: [], total };

    const feedItemIds = feedItems.map((r: any) => r.id);
    const idPlaceholders = feedItemIds.map((_: any, i: number) => `$${i + 1}`).join(",");

    const reactionsResult = await pool.query(`
      SELECT ar.*, u.name as user_name
      FROM activity_reactions ar
      JOIN users u ON u.id = ar.user_id
      WHERE ar.feed_item_id IN (${idPlaceholders})
    `, feedItemIds);

    const commentsResult = await pool.query(`
      SELECT ac.*, u.name as user_name
      FROM activity_comments ac
      JOIN users u ON u.id = ac.user_id
      WHERE ac.feed_item_id IN (${idPlaceholders})
      ORDER BY ac.created_at ASC
    `, feedItemIds);

    const reactionsByFeedId: Record<number, any[]> = {};
    const commentsByFeedId: Record<number, any[]> = {};
    for (const r of reactionsResult.rows) {
      if (!reactionsByFeedId[r.feed_item_id]) reactionsByFeedId[r.feed_item_id] = [];
      reactionsByFeedId[r.feed_item_id].push({ id: r.id, emoji: r.emoji, userId: r.user_id, userName: r.user_name });
    }
    for (const c of commentsResult.rows) {
      if (!commentsByFeedId[c.feed_item_id]) commentsByFeedId[c.feed_item_id] = [];
      commentsByFeedId[c.feed_item_id].push({ id: c.id, content: c.content, userId: c.user_id, userName: c.user_name, createdAt: c.created_at });
    }

    const items = feedItems.map((r: any) => ({
      id: r.id,
      activityType: r.activity_type,
      itemId: r.item_id,
      itemType: r.item_type,
      itemTitle: r.item_title,
      itemImageUrl: r.item_image_url,
      itemSubtitle: r.item_subtitle,
      itemExtra: r.item_extra,
      createdAt: r.created_at,
      user: { id: r.user_id, name: r.user_name, avatarUrl: r.user_avatar_url },
      reactions: reactionsByFeedId[r.id] ?? [],
      comments: commentsByFeedId[r.id] ?? [],
    }));

    return { items, total };
  },

  async getMyRecentActivity(userId, limit = 5) {
    const result = await pool.query(`
      SELECT af.*, u.name as user_name, u.avatar_url as user_avatar_url
      FROM activity_feed af
      JOIN users u ON u.id = af.user_id
      WHERE af.user_id = $1
      ORDER BY af.created_at DESC
      LIMIT $2
    `, [userId, limit]);
    return result.rows.map((r: any) => ({
      id: r.id,
      activityType: r.activity_type,
      itemId: r.item_id,
      itemType: r.item_type,
      itemTitle: r.item_title,
      itemImageUrl: r.item_image_url,
      itemSubtitle: r.item_subtitle,
      itemExtra: r.item_extra,
      createdAt: r.created_at,
      user: { id: r.user_id, name: r.user_name, avatarUrl: r.user_avatar_url },
    }));
  },

  async toggleReaction(feedItemId, userId, emoji) {
    const existing = await pool.query(
      `SELECT id FROM activity_reactions WHERE feed_item_id = $1 AND user_id = $2 AND emoji = $3`,
      [feedItemId, userId, emoji]
    );
    if (existing.rows.length > 0) {
      await pool.query(`DELETE FROM activity_reactions WHERE id = $1`, [existing.rows[0].id]);
    } else {
      await pool.query(
        `INSERT INTO activity_reactions (feed_item_id, user_id, emoji) VALUES ($1, $2, $3)`,
        [feedItemId, userId, emoji]
      );
    }
  },

  async addComment(feedItemId, userId, content) {
    const result = await pool.query(
      `INSERT INTO activity_comments (feed_item_id, user_id, content) VALUES ($1, $2, $3) RETURNING *`,
      [feedItemId, userId, content]
    );
    return result.rows[0];
  },

  // ── Discover ──────────────────────────────────────────────────────────────

  async getDiscoverTasteProfile(userId: number) {
    const result = await pool.query(`
      SELECT item_type, COUNT(*) AS count
      FROM activity_feed
      WHERE user_id = $1 AND item_type IS NOT NULL
      GROUP BY item_type
      ORDER BY count DESC
    `, [userId]);
    const rows: { item_type: string; count: string }[] = result.rows;
    const total = rows.reduce((s, r) => s + parseInt(r.count, 10), 0);
    return rows.map(r => ({
      category: r.item_type,
      count: parseInt(r.count, 10),
      percentage: total > 0 ? Math.round((parseInt(r.count, 10) / total) * 100) : 0,
    }));
  },

  async getDiscoverTrending(userId: number) {
    const friendsRes = await pool.query(`
      SELECT CASE WHEN from_user_id = $1 THEN to_user_id ELSE from_user_id END AS fid
      FROM friend_requests WHERE status = 'accepted' AND (from_user_id = $1 OR to_user_id = $1)
    `, [userId]);
    const friendIds: number[] = friendsRes.rows.map((r: any) => r.fid);
    if (friendIds.length === 0) return [];
    const ph = friendIds.map((_, i) => `$${i + 2}`).join(",");
    const result = await pool.query(`
      SELECT
        af.item_type,
        af.item_title,
        MAX(af.item_image_url) AS item_image_url,
        MAX(af.item_subtitle)  AS item_subtitle,
        COUNT(DISTINCT af.user_id) AS friend_count
      FROM activity_feed af
      WHERE af.user_id IN (${ph})
        AND af.item_title IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM activity_feed uf
          WHERE uf.user_id = $1
            AND uf.item_type = af.item_type
            AND uf.item_title = af.item_title
        )
      GROUP BY af.item_type, af.item_title
      HAVING COUNT(DISTINCT af.user_id) >= 2
      ORDER BY friend_count DESC
      LIMIT 20
    `, [userId, ...friendIds]);
    return result.rows.map((r: any) => ({
      itemType: r.item_type,
      itemTitle: r.item_title,
      itemImageUrl: r.item_image_url,
      itemSubtitle: r.item_subtitle,
      friendCount: parseInt(r.friend_count, 10),
    }));
  },

  async getDiscoverYouMightLike(userId: number) {
    const friendsRes = await pool.query(`
      SELECT CASE WHEN from_user_id = $1 THEN to_user_id ELSE from_user_id END AS fid
      FROM friend_requests WHERE status = 'accepted' AND (from_user_id = $1 OR to_user_id = $1)
    `, [userId]);
    const friendIds: number[] = friendsRes.rows.map((r: any) => r.fid);
    if (friendIds.length === 0) return [];
    // Top 3 categories for this user
    const catsRes = await pool.query(`
      SELECT item_type FROM activity_feed
      WHERE user_id = $1 AND item_type IS NOT NULL
      GROUP BY item_type ORDER BY COUNT(*) DESC LIMIT 3
    `, [userId]);
    const topCats: string[] = catsRes.rows.map((r: any) => r.item_type);
    if (topCats.length === 0) {
      // fallback: any category
      topCats.push("book", "movie", "song");
    }
    const friendPh = friendIds.map((_, i) => `$${i + 2}`).join(",");
    const catPh = topCats.map((_, i) => `$${i + 2 + friendIds.length}`).join(",");
    const result = await pool.query(`
      SELECT DISTINCT ON (af.item_type, af.item_title)
        af.item_type, af.item_title, af.item_image_url, af.item_subtitle,
        u.name AS friend_name, u.id AS friend_id
      FROM activity_feed af
      JOIN users u ON u.id = af.user_id
      WHERE af.user_id IN (${friendPh})
        AND af.item_type IN (${catPh})
        AND af.item_title IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM activity_feed uf
          WHERE uf.user_id = $1
            AND uf.item_type = af.item_type
            AND uf.item_title = af.item_title
        )
      ORDER BY af.item_type, af.item_title, af.created_at DESC
      LIMIT 10
    `, [userId, ...friendIds, ...topCats]);
    // Taste context: for each recommending friend, find what you already share
    // — "because you both saved X" beats "via Mike" every time.
    const recFriendIds = [...new Set(result.rows.map((r: any) => r.friend_id))] as number[];
    const sharedByFriend = new Map<number, { count: number; examples: { type: string; title: string }[] }>();
    if (recFriendIds.length > 0) {
      const ph = recFriendIds.map((_, i) => `$${i + 2}`).join(",");
      const sharedRes = await pool.query(`
        SELECT DISTINCT af.user_id AS fid, af.item_type, af.item_title
        FROM activity_feed af
        WHERE af.user_id IN (${ph}) AND af.item_title IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM activity_feed uf
            WHERE uf.user_id = $1 AND uf.item_type = af.item_type AND uf.item_title = af.item_title
          )
      `, [userId, ...recFriendIds]);
      for (const row of sharedRes.rows) {
        const entry = sharedByFriend.get(row.fid) ?? { count: 0, examples: [] };
        entry.count++;
        if (entry.examples.length < 5) entry.examples.push({ type: row.item_type, title: row.item_title });
        sharedByFriend.set(row.fid, entry);
      }
    }

    return result.rows.map((r: any) => {
      const shared = sharedByFriend.get(r.friend_id);
      // Prefer a shared example of the same type as the recommendation
      const example = shared?.examples.find(e => e.type === r.item_type) ?? shared?.examples[0] ?? null;
      return {
        itemType: r.item_type,
        itemTitle: r.item_title,
        itemImageUrl: r.item_image_url,
        itemSubtitle: r.item_subtitle,
        friendName: r.friend_name,
        friendId: r.friend_id,
        sharedCount: shared?.count ?? 0,
        sharedExample: example?.title ?? null,
      };
    });
  },

  async getDiscoverSharedTaste(userId: number) {
    const friendsRes = await pool.query(`
      SELECT u.id, u.name, u.avatar_url AS "avatarUrl"
      FROM friend_requests fr
      JOIN users u ON u.id = CASE WHEN fr.from_user_id = $1 THEN fr.to_user_id ELSE fr.from_user_id END
      WHERE fr.status = 'accepted' AND (fr.from_user_id = $1 OR fr.to_user_id = $1)
    `, [userId]);
    const friends: { id: number; name: string; avatarUrl: string | null }[] = friendsRes.rows;
    if (friends.length === 0) return [];

    const myTotalRes = await pool.query(
      `SELECT COUNT(*) AS c FROM activity_feed WHERE user_id = $1`, [userId]
    );
    const myTotal = parseInt(myTotalRes.rows[0].c, 10);

    const results = await Promise.all(friends.map(async f => {
      const overlapRes = await pool.query(`
        SELECT
          COUNT(*) AS overlap_total,
          COUNT(*) FILTER (WHERE af1.item_type = 'book')  AS books,
          COUNT(*) FILTER (WHERE af1.item_type = 'movie') AS movies,
          COUNT(*) FILTER (WHERE af1.item_type = 'song')  AS songs,
          COUNT(*) FILTER (WHERE af1.item_type = 'recipe') AS recipes
        FROM activity_feed af1
        JOIN activity_feed af2
          ON af2.user_id = $2
          AND af2.item_type = af1.item_type
          AND af2.item_title = af1.item_title
        WHERE af1.user_id = $1
          AND af1.item_title IS NOT NULL
      `, [userId, f.id]);
      const row = overlapRes.rows[0];
      const overlapCount = parseInt(row.overlap_total, 10);
      const friendTotalRes = await pool.query(
        `SELECT COUNT(*) AS c FROM activity_feed WHERE user_id = $1`, [f.id]
      );
      const friendTotal = parseInt(friendTotalRes.rows[0].c, 10);
      const denom = Math.max(myTotal, friendTotal, 1);
      return {
        id: f.id,
        name: f.name,
        avatarUrl: f.avatarUrl,
        overlapCount,
        overlapPct: Math.round((overlapCount / denom) * 100),
        breakdown: {
          books: parseInt(row.books, 10),
          movies: parseInt(row.movies, 10),
          songs: parseInt(row.songs, 10),
          recipes: parseInt(row.recipes, 10),
        },
      };
    }));

    return results.sort((a, b) => b.overlapPct - a.overlapPct);
  },

  // ── User summary (My Lifos profile stats + per-section item counts) ─────────

  async getUserSummary(userId: number) {
    const [
      counts,
      friendsRes,
      recsRes,
    ] = await Promise.all([
      // Run all per-section counts in one multi-row query
      pool.query(`
        SELECT 'reading'      AS section, COUNT(*) AS cnt FROM books WHERE user_id = $1
        UNION ALL
        SELECT 'movies',                  COUNT(*)         FROM movies WHERE user_id = $1
        UNION ALL
        SELECT 'music',                   COUNT(*)         FROM music_songs WHERE user_id = $1
        UNION ALL
        SELECT 'recipes',                 COUNT(*)         FROM recipes WHERE user_id = $1
        UNION ALL
        SELECT 'spots',                   COUNT(*)         FROM spots WHERE user_id = $1
        UNION ALL
        SELECT 'quotes',                  COUNT(*)         FROM quotes WHERE user_id = $1
        UNION ALL
        SELECT 'art',                     COUNT(*)         FROM art_pieces WHERE user_id = $1
        UNION ALL
        SELECT 'hobbies',                 COUNT(*)         FROM hobbies WHERE user_id = $1
        UNION ALL
        SELECT 'workouts',                COUNT(*)         FROM workout_logs WHERE user_id = $1
        UNION ALL
        SELECT 'plants',                  COUNT(*)         FROM plants WHERE user_id = $1
        UNION ALL
        SELECT 'health',                  COUNT(*)         FROM health_metrics WHERE user_id = $1
        UNION ALL
        SELECT 'goals',                   COUNT(*)         FROM goals WHERE user_id = $1
        UNION ALL
        SELECT 'budget',                  COUNT(*)         FROM transactions WHERE user_id = $1
        UNION ALL
        SELECT 'calendar',                COUNT(*)         FROM events WHERE user_id = $1
        UNION ALL
        SELECT 'relationships',           COUNT(*)         FROM people WHERE user_id = $1
        UNION ALL
        SELECT 'housekeeping',            COUNT(*)         FROM chores WHERE user_id = $1
        UNION ALL
        SELECT 'kids',                    COUNT(*)         FROM children WHERE user_id = $1
        UNION ALL
        SELECT 'journal',                 COUNT(*)         FROM journal_entries WHERE user_id = $1
        UNION ALL
        SELECT 'faith',                   COUNT(*)         FROM sacred_texts WHERE user_id = $1
        UNION ALL
        SELECT 'politics',                COUNT(*)         FROM political_issues WHERE user_id = $1
      `, [userId]),
      // Friends count
      pool.query(
        `SELECT COUNT(*) AS c FROM friend_requests WHERE status = 'accepted' AND (from_user_id = $1 OR to_user_id = $1)`,
        [userId]
      ),
      // Recommendations/shares sent
      pool.query(`
        SELECT
          (SELECT COUNT(*) FROM book_recommendations     WHERE from_user_id = $1) +
          (SELECT COUNT(*) FROM music_recommendations    WHERE from_user_id = $1) +
          (SELECT COUNT(*) FROM movie_shares             WHERE from_user_id = $1) +
          (SELECT COUNT(*) FROM recipe_shares            WHERE from_user_id = $1) +
          (SELECT COUNT(*) FROM spot_shares              WHERE from_user_id = $1) +
          (SELECT COUNT(*) FROM art_shares               WHERE from_user_id = $1) +
          (SELECT COUNT(*) FROM quote_shares             WHERE from_user_id = $1) +
          (SELECT COUNT(*) FROM workout_shares           WHERE from_user_id = $1) AS total
      `, [userId]),
    ]);

    const sectionCounts: Record<string, number> = {};
    let totalItems = 0;
    for (const row of counts.rows as { section: string; cnt: string }[]) {
      const n = parseInt(row.cnt, 10);
      sectionCounts[row.section] = n;
      totalItems += n;
    }

    return {
      totalItems,
      friendsCount: parseInt(friendsRes.rows[0].c, 10),
      recommendationsSent: parseInt(recsRes.rows[0].total, 10),
      counts: sectionCounts,
    };
  },

  // ── Saved Events ────────────────────────────────────────────────────────────

  async getSavedEvents(userId: number) {
    const result = await pool.query(
      `SELECT * FROM saved_events WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map((r: any) => ({
      id: r.id,
      source: r.source,
      externalId: r.external_id,
      name: r.name,
      description: r.description,
      startDatetime: r.start_datetime,
      endDatetime: r.end_datetime,
      venueName: r.venue_name,
      venueAddress: r.venue_address,
      city: r.city,
      url: r.url,
      imageUrl: r.image_url,
      priceInfo: r.price_info,
      status: r.status,
      notes: r.notes,
      createdAt: r.created_at,
    }));
  },

  async saveEvent(userId: number, data: {
    source: string; externalId: string; name: string; description?: string;
    startDatetime?: string; endDatetime?: string; venueName?: string;
    venueAddress?: string; city?: string; url?: string; imageUrl?: string; priceInfo?: string;
  }) {
    const result = await pool.query(
      `INSERT INTO saved_events
        (user_id, source, external_id, name, description, start_datetime, end_datetime,
         venue_name, venue_address, city, url, image_url, price_info)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (user_id, source, external_id) DO NOTHING
       RETURNING *`,
      [userId, data.source, data.externalId, data.name, data.description ?? null,
       data.startDatetime ?? null, data.endDatetime ?? null, data.venueName ?? null,
       data.venueAddress ?? null, data.city ?? null, data.url ?? null,
       data.imageUrl ?? null, data.priceInfo ?? null]
    );
    return result.rows[0] ?? null;
  },

  async deleteSavedEvent(userId: number, id: number) {
    await pool.query(
      `DELETE FROM saved_events WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );
  },

  async updateSavedEventStatus(userId: number, id: number, status: string, notes?: string) {
    await pool.query(
      `UPDATE saved_events SET status = $1, notes = COALESCE($2, notes) WHERE id = $3 AND user_id = $4`,
      [status, notes ?? null, id, userId]
    );
  },

  // ── Food Log ────────────────────────────────────────────────────────────────
  async getFoodLogForDate(userId: number, date: string): Promise<FoodLogEntry[]> {
    return db.select().from(foodLogEntries)
      .where(and(eq(foodLogEntries.userId, userId), eq(foodLogEntries.date, date)))
      .orderBy(foodLogEntries.createdAt);
  },
  async createFoodLogEntry(data: InsertFoodLogEntry): Promise<FoodLogEntry> {
    const [r] = await db.insert(foodLogEntries).values(data).returning();
    return r;
  },
  async deleteFoodLogEntry(id: number): Promise<boolean> {
    const r = await db.delete(foodLogEntries).where(eq(foodLogEntries.id, id)).returning();
    return r.length > 0;
  },
  async updateFoodLogEntry(id: number, data: Partial<InsertFoodLogEntry>): Promise<FoodLogEntry | null> {
    const [r] = await db.update(foodLogEntries).set(data).where(eq(foodLogEntries.id, id)).returning();
    return r ?? null;
  },
  async getFoodLogForWeek(userId: number, dates: string[]): Promise<FoodLogEntry[]> {
    if (dates.length === 0) return [];
    return db.select().from(foodLogEntries)
      .where(and(eq(foodLogEntries.userId, userId), inArray(foodLogEntries.date, dates)));
  },
  async getFoodLogHistory(userId: number): Promise<FoodLogEntry[]> {
    // Fetch recent entries and deduplicate by foodName (case-insensitive), most recent first
    const entries = await db.select().from(foodLogEntries)
      .where(eq(foodLogEntries.userId, userId))
      .orderBy(desc(foodLogEntries.createdAt))
      .limit(500);
    const seen = new Set<string>();
    return entries.filter(e => {
      const key = e.foodName.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 50);
  },

  // ── Water Log ───────────────────────────────────────────────────────────────
  async getWaterLog(userId: number, date: string): Promise<WaterLog | null> {
    const [r] = await db.select().from(waterLogs)
      .where(and(eq(waterLogs.userId, userId), eq(waterLogs.date, date)));
    return r ?? null;
  },
  async upsertWaterLog(userId: number, date: string, glasses: number): Promise<WaterLog> {
    const existing = await storage.getWaterLog(userId, date);
    if (existing) {
      const [r] = await db.update(waterLogs).set({ glasses }).where(eq(waterLogs.id, existing.id)).returning();
      return r;
    }
    const [r] = await db.insert(waterLogs).values({ userId, date, glasses }).returning();
    return r;
  },

  // ── Reading Goals (multi) ────────────────────────────────────────────────────
  async getReadingGoals(userId: number): Promise<ReadingGoal[]> {
    return db.select().from(readingGoals).where(eq(readingGoals.userId, userId));
  },
  /** @deprecated use getReadingGoals */
  async getReadingGoal(userId: number): Promise<ReadingGoal | null> {
    const rows = await storage.getReadingGoals(userId);
    return rows[0] ?? null;
  },
  async createReadingGoal(userId: number, data: Partial<Omit<ReadingGoal, 'id' | 'userId'>>): Promise<ReadingGoal> {
    const currentYear = new Date().getFullYear();
    const defaults = { booksTarget: 12, year: currentYear, label: null, startDate: null, endDate: null, buddyUserId: null };
    const [r] = await db.insert(readingGoals).values({ userId, ...defaults, ...data }).returning();
    return r;
  },
  async updateReadingGoalById(id: number, userId: number, data: Partial<Omit<ReadingGoal, 'id' | 'userId'>>): Promise<ReadingGoal> {
    const [r] = await db.update(readingGoals).set(data).where(and(eq(readingGoals.id, id), eq(readingGoals.userId, userId))).returning();
    return r;
  },
  async deleteReadingGoalById(id: number, userId: number): Promise<void> {
    await db.delete(readingGoals).where(and(eq(readingGoals.id, id), eq(readingGoals.userId, userId)));
  },
  /** @deprecated use deleteReadingGoalById */
  async upsertReadingGoal(userId: number, data: Partial<Omit<ReadingGoal, 'id' | 'userId'>>): Promise<ReadingGoal> {
    const existing = await storage.getReadingGoal(userId);
    if (existing) {
      return storage.updateReadingGoalById(existing.id, userId, data);
    }
    return storage.createReadingGoal(userId, data);
  },
  async deleteReadingGoal(userId: number): Promise<void> {
    await db.delete(readingGoals).where(eq(readingGoals.userId, userId));
  },

  // ── Nutrition Goals ──────────────────────────────────────────────────────────
  async getNutritionGoals(userId: number): Promise<NutritionGoal | null> {
    const [r] = await db.select().from(nutritionGoals).where(eq(nutritionGoals.userId, userId));
    return r ?? null;
  },
  async deleteNutritionGoals(userId: number): Promise<void> {
    await db.delete(nutritionGoals).where(eq(nutritionGoals.userId, userId));
  },
  async upsertNutritionGoals(userId: number, data: Partial<Omit<NutritionGoal, 'id' | 'userId'>>): Promise<NutritionGoal> {
    const existing = await storage.getNutritionGoals(userId);
    if (existing) {
      const [r] = await db.update(nutritionGoals).set(data).where(eq(nutritionGoals.userId, userId)).returning();
      return r;
    }
    const defaults = { calories: 2000, protein: 150, carbs: 250, fat: 65, waterGlasses: 8 };
    const [r] = await db.insert(nutritionGoals).values({ userId, ...defaults, ...data }).returning();
    return r;
  },

  // ── Messenger ────────────────────────────────────────────────────────────────

  async ensureMessengerTables() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id SERIAL PRIMARY KEY,
        name TEXT,
        is_group BOOLEAN NOT NULL DEFAULT FALSE,
        created_by INTEGER,
        created_at TEXT NOT NULL,
        last_message_at TEXT
      );
      CREATE TABLE IF NOT EXISTS conversation_participants (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        joined_at TEXT NOT NULL,
        last_read_at TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        is_deleted BOOLEAN NOT NULL DEFAULT FALSE
      );
      CREATE TABLE IF NOT EXISTS message_reactions (
        id SERIAL PRIMARY KEY,
        message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        emoji TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE (message_id, user_id, emoji)
      );
    `);
  },

  async getConversationsForUser(userId: number): Promise<any[]> {
    const rows = await pool.query(`
      SELECT
        c.id, c.name, c.is_group AS "isGroup", c.created_by AS "createdBy",
        c.created_at AS "createdAt", c.last_message_at AS "lastMessageAt"
      FROM conversations c
      JOIN conversation_participants cp ON cp.conversation_id = c.id
      WHERE cp.user_id = $1
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
    `, [userId]);

    if (rows.rows.length === 0) return [];

    const convIds = rows.rows.map((r: any) => r.id);
    const placeholders = convIds.map((_: any, i: number) => `$${i + 1}`).join(",");

    // Participants with user info
    const partRows = await pool.query(`
      SELECT cp.conversation_id AS "conversationId", cp.last_read_at AS "lastReadAt",
             u.id, u.name, u.email, u.avatar_url AS "avatarUrl"
      FROM conversation_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.conversation_id IN (${placeholders})
    `, convIds);

    // Last message per conversation
    const msgRows = await pool.query(`
      SELECT DISTINCT ON (m.conversation_id)
        m.id, m.conversation_id AS "conversationId", m.sender_id AS "senderId",
        m.content, m.created_at AS "createdAt", m.is_deleted AS "isDeleted",
        u.id AS "sUid", u.name AS "sName", u.email AS "sEmail", u.avatar_url AS "sAvatarUrl"
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id IN (${placeholders}) AND m.is_deleted = FALSE
      ORDER BY m.conversation_id, m.created_at DESC
    `, convIds);

    // Unread count per conversation
    const unreadRows = await pool.query(`
      SELECT m.conversation_id AS "conversationId", COUNT(*)::int AS "count"
      FROM messages m
      JOIN conversation_participants cp
        ON cp.conversation_id = m.conversation_id AND cp.user_id = $1
      WHERE m.conversation_id IN (${placeholders.replace(/\$(\d+)/g, (_, n) => `$${+n + 1}`)})
        AND m.is_deleted = FALSE
        AND m.sender_id != $1
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
      GROUP BY m.conversation_id
    `, [userId, ...convIds]);

    const partMap: Record<number, any[]> = {};
    for (const p of partRows.rows) {
      if (!partMap[p.conversationId]) partMap[p.conversationId] = [];
      partMap[p.conversationId].push({ id: p.id, name: p.name, email: p.email, avatarUrl: p.avatarUrl, lastReadAt: p.lastReadAt });
    }
    const msgMap: Record<number, any> = {};
    for (const m of msgRows.rows) {
      msgMap[m.conversationId] = {
        id: m.id, conversationId: m.conversationId, senderId: m.senderId,
        content: m.content, createdAt: m.createdAt, isDeleted: m.isDeleted,
        sender: { id: m.sUid, name: m.sName, email: m.sEmail, avatarUrl: m.sAvatarUrl },
      };
    }
    const unreadMap: Record<number, number> = {};
    for (const u of unreadRows.rows) unreadMap[u.conversationId] = u.count;

    return rows.rows.map((c: any) => ({
      ...c,
      participants: partMap[c.id] ?? [],
      lastMessage: msgMap[c.id] ?? null,
      unreadCount: unreadMap[c.id] ?? 0,
    }));
  },

  async getOrCreateDM(userId1: number, userId2: number): Promise<any> {
    // Check if a DM already exists between these two users
    const existing = await pool.query(`
      SELECT c.id FROM conversations c
      JOIN conversation_participants cp1 ON cp1.conversation_id = c.id AND cp1.user_id = $1
      JOIN conversation_participants cp2 ON cp2.conversation_id = c.id AND cp2.user_id = $2
      WHERE c.is_group = FALSE
      LIMIT 1
    `, [userId1, userId2]);
    if (existing.rows[0]) return existing.rows[0];

    const now = new Date().toISOString();
    const conv = await pool.query(
      `INSERT INTO conversations (is_group, created_by, created_at) VALUES (FALSE, $1, $2) RETURNING id`,
      [userId1, now]
    );
    const convId = conv.rows[0].id;
    await pool.query(
      `INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES ($1,$2,$3),($1,$4,$3)`,
      [convId, userId1, now, userId2]
    );
    return { id: convId };
  },

  async createGroupConversation(createdBy: number, name: string, participantIds: number[]): Promise<any> {
    const now = new Date().toISOString();
    const conv = await pool.query(
      `INSERT INTO conversations (name, is_group, created_by, created_at) VALUES ($1, TRUE, $2, $3) RETURNING id`,
      [name, createdBy, now]
    );
    const convId = conv.rows[0].id;
    const allIds = Array.from(new Set([createdBy, ...participantIds]));
    // params = [convId, ...allIds, now]
    // $1 = convId, $2..$N+1 = user ids, $N+2 = now
    const nowParam = allIds.length + 2;
    const vals = allIds.map((_, i) => `($1,$${i + 2},$${nowParam})`).join(",");
    await pool.query(`INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES ${vals}`, [convId, ...allIds, now]);
    return { id: convId };
  },

  async getMessages(conversationId: number, userId: number, limit = 50, beforeId?: number): Promise<any[]> {
    // Verify user is a participant
    const check = await pool.query(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId]
    );
    if (!check.rows[0]) throw new Error("Not a participant");

    const beforeClause = beforeId ? `AND m.id < ${beforeId}` : "";
    const rows = await pool.query(`
      SELECT m.id, m.conversation_id AS "conversationId", m.sender_id AS "senderId",
             m.content, m.created_at AS "createdAt", m.is_deleted AS "isDeleted",
             COALESCE(m.message_type, 'text') AS "messageType",
             m.share_type AS "shareType", m.share_data AS "shareData",
             u.id AS "sUid", u.name AS "sName", u.email AS "sEmail", u.avatar_url AS "sAvatarUrl"
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1 ${beforeClause}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $2
    `, [conversationId, limit]);

    const msgList = rows.rows.reverse().map((m: any) => ({
      id: m.id, conversationId: m.conversationId, senderId: m.senderId,
      content: m.content, createdAt: m.createdAt, isDeleted: m.isDeleted,
      messageType: m.messageType, shareType: m.shareType, shareData: m.shareData,
      sender: { id: m.sUid, name: m.sName, email: m.sEmail, avatarUrl: m.sAvatarUrl },
      reactions: [] as any[],
    }));

    if (msgList.length > 0) {
      const ids = msgList.map((m: any) => m.id);
      const rxRows = await pool.query(
        `SELECT message_id AS "messageId", user_id AS "userId", emoji FROM message_reactions WHERE message_id = ANY($1)`,
        [ids]
      );
      const byMsg: Record<number, { emoji: string; userIds: number[] }[]> = {};
      for (const rx of rxRows.rows) {
        if (!byMsg[rx.messageId]) byMsg[rx.messageId] = [];
        let entry = byMsg[rx.messageId].find((e: any) => e.emoji === rx.emoji);
        if (!entry) { entry = { emoji: rx.emoji, userIds: [] }; byMsg[rx.messageId].push(entry); }
        entry.userIds.push(rx.userId);
      }
      for (const m of msgList) {
        m.reactions = (byMsg[m.id] ?? []).map((e: any) => ({ emoji: e.emoji, count: e.userIds.length, userIds: e.userIds }));
      }
    }

    return msgList;
  },

  async createMessage(
    conversationId: number, senderId: number, content: string,
    opts?: { messageType?: string; shareType?: string; shareData?: string }
  ): Promise<any> {
    // Verify sender is a participant
    const check = await pool.query(
      `SELECT 1 FROM conversation_participants WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, senderId]
    );
    if (!check.rows[0]) throw new Error("Not a participant");

    const now = new Date().toISOString();
    const mt = opts?.messageType ?? 'text';
    const st = opts?.shareType ?? null;
    const sd = opts?.shareData ?? null;
    const msg = await pool.query(
      `INSERT INTO messages (conversation_id, sender_id, content, created_at, message_type, share_type, share_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [conversationId, senderId, content, now, mt, st, sd]
    );
    await pool.query(
      `UPDATE conversations SET last_message_at = $1 WHERE id = $2`,
      [now, conversationId]
    );
    const senderRow = await pool.query(
      `SELECT id, name, email, avatar_url AS "avatarUrl" FROM users WHERE id = $1`, [senderId]
    );
    return {
      id: msg.rows[0].id, conversationId, senderId, content, createdAt: now, isDeleted: false,
      messageType: mt, shareType: st, shareData: sd,
      sender: senderRow.rows[0], reactions: [],
    };
  },

  /**
   * Get or create the DM conversation between two users, then insert a share message.
   * Called automatically when a share (spot, movie, etc.) is created.
   */
  async createDMShareMessage(
    fromUserId: number, toUserId: number,
    shareType: string, shareData: string, displayText: string
  ): Promise<void> {
    try {
      const conv = await this.getOrCreateDM(fromUserId, toUserId);
      // Ensure both users are participants
      for (const uid of [fromUserId, toUserId]) {
        const p = await pool.query(
          `SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2`,
          [conv.id, uid]
        );
        if (!p.rows[0]) {
          await pool.query(
            `INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [conv.id, uid, new Date().toISOString()]
          );
        }
      }
      await this.createMessage(conv.id, fromUserId, displayText, {
        messageType: 'share', shareType, shareData,
      });
    } catch (e) {
      // Non-fatal: share itself already created, messenger message is a bonus
      console.error('[createDMShareMessage] error:', e);
    }
  },

  async createDMTextMessage(fromUserId: number, toUserId: number, text: string): Promise<void> {
    try {
      const conv = await this.getOrCreateDM(fromUserId, toUserId);
      for (const uid of [fromUserId, toUserId]) {
        const p = await pool.query(
          `SELECT 1 FROM conversation_participants WHERE conversation_id=$1 AND user_id=$2`,
          [conv.id, uid]
        );
        if (!p.rows[0]) {
          await pool.query(
            `INSERT INTO conversation_participants (conversation_id, user_id, joined_at)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [conv.id, uid, new Date().toISOString()]
          );
        }
      }
      await this.createMessage(conv.id, fromUserId, text);
    } catch (e) {
      // Non-fatal: the primary action already succeeded; the DM is a bonus
      console.error('[createDMTextMessage] error:', e);
    }
  },

  async markConversationRead(conversationId: number, userId: number): Promise<void> {
    const now = new Date().toISOString();
    await pool.query(
      `UPDATE conversation_participants SET last_read_at = $1 WHERE conversation_id = $2 AND user_id = $3`,
      [now, conversationId, userId]
    );
  },

  async getUnreadMessageCount(userId: number): Promise<number> {
    const rows = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM messages m
      JOIN conversation_participants cp
        ON cp.conversation_id = m.conversation_id AND cp.user_id = $1
      WHERE m.is_deleted = FALSE
        AND m.sender_id != $1
        AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
    `, [userId]);
    return rows.rows[0]?.count ?? 0;
  },

  async softDeleteMessage(messageId: number, userId: number): Promise<boolean> {
    const result = await pool.query(
      `UPDATE messages SET is_deleted = TRUE WHERE id = $1 AND sender_id = $2`,
      [messageId, userId]
    );
    return (result.rowCount ?? 0) > 0;
  },

  async addMessageReaction(messageId: number, userId: number, emoji: string): Promise<void> {
    // Upsert — one reaction per user per emoji per message
    await pool.query(
      `INSERT INTO message_reactions (message_id, user_id, emoji, created_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [messageId, userId, emoji, new Date().toISOString()]
    );
  },

  async removeMessageReaction(messageId: number, userId: number, emoji: string): Promise<void> {
    await pool.query(
      `DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3`,
      [messageId, userId, emoji]
    );
  },

  async addConversationParticipant(conversationId: number, userId: number): Promise<void> {
    const now = new Date().toISOString();
    await pool.query(
      `INSERT INTO conversation_participants (conversation_id, user_id, joined_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [conversationId, userId, now]
    );
  },

  // ── Habits ──────────────────────────────────────────────────────────────────
  async getHabits(userId: number): Promise<HabitWithStats[]> {
    const rows = await db.select().from(habits).where(and(eq(habits.userId, userId), eq(habits.isArchived, false)));
    return rows.map((h) => {
      let completions: HabitCompletion[] = [];
      try { completions = JSON.parse(h.completionsJson); } catch {}
      const today = new Date();
      const streakInfo = computeHabitStreakInfo(completions);
      const streakCurrent = streakInfo.streak;
      const streakFreezes = streakInfo.freezesAvailable;
      const streakFreezesUsed = streakInfo.freezesUsed;
      const streakBest = computeHabitBestStreak(completions);
      const last7 = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today); d.setDate(d.getDate() - i);
        return d.toISOString().slice(0, 10);
      });
      const completionRate7d = last7.filter(dt => completions.some(c => c.date === dt)).length / 7;
      const { completionsJson: _cj, ...rest } = h;
      return { ...rest, completions, streakCurrent, streakBest, streakFreezes, streakFreezesUsed, completionRate7d };
    });
  },

  async createHabit(userId: number, data: Partial<InsertHabit>): Promise<Habit> {
    const now = new Date().toISOString();
    const [row] = await db.insert(habits).values({
      userId,
      title: data.title ?? "New Habit",
      description: data.description ?? null,
      emoji: data.emoji ?? "✅",
      color: data.color ?? "#6366f1",
      frequency: data.frequency ?? "daily",
      targetDaysPerWeek: data.targetDaysPerWeek ?? 7,
      category: data.category ?? "general",
      isArchived: false,
      createdAt: now,
      completionsJson: "[]",
      linkedGoalId: data.linkedGoalId ?? null,
    }).returning();
    return row;
  },

  async updateHabit(id: number, userId: number, data: Partial<InsertHabit>): Promise<Habit> {
    const [row] = await db.update(habits).set(data).where(and(eq(habits.id, id), eq(habits.userId, userId))).returning();
    return row;
  },

  async deleteHabit(id: number, userId: number): Promise<void> {
    await db.delete(habits).where(and(eq(habits.id, id), eq(habits.userId, userId)));
  },

  async toggleHabitCompletion(id: number, userId: number, date: string, note?: string): Promise<Habit> {
    const [row] = await db.select().from(habits).where(and(eq(habits.id, id), eq(habits.userId, userId)));
    if (!row) throw new Error("Habit not found");
    let completions: HabitCompletion[] = [];
    try { completions = JSON.parse(row.completionsJson); } catch {}
    const exists = completions.findIndex(c => c.date === date);
    if (exists >= 0) {
      completions.splice(exists, 1);
    } else {
      completions.push({ date, ...(note ? { note } : {}) });
    }
    const [updated] = await db.update(habits).set({ completionsJson: JSON.stringify(completions) }).where(eq(habits.id, id)).returning();
    return updated;
  },
  // ── BUD BETS ────────────────────────────────────────────────────────────────
  async getBudBets(userId: number) {
    return db.select().from(budBets).where(
      or(eq(budBets.creatorId, userId), eq(budBets.opponentId, userId), eq(budBets.arbitratorId, userId))
    ).orderBy(desc(budBets.createdAt));
  },
  async createBudBet(data: any) {
    const [row] = await db.insert(budBets).values({ ...data, createdAt: new Date().toISOString() }).returning();
    return row;
  },
  async updateBudBet(id: number, userId: number, data: any) {
    const [row] = await db.select().from(budBets).where(eq(budBets.id, id));
    if (!row) throw new Error("Bet not found");
    if (row.creatorId !== userId && row.opponentId !== userId && row.arbitratorId !== userId) throw new Error("Unauthorized");
    const [updated] = await db.update(budBets).set(data).where(eq(budBets.id, id)).returning();
    return updated;
  },
  async deleteBudBet(id: number, userId: number) {
    const [row] = await db.select().from(budBets).where(eq(budBets.id, id));
    if (!row) throw new Error("Bet not found");
    if (row.creatorId !== userId) throw new Error("Only creator can delete");
    await db.delete(budBets).where(eq(budBets.id, id));
  },

  // ── Notifications ────────────────────────────────────────────────────────────
  async createNotification(n: { userId: number; type: string; title: string; body?: string | null; href?: string | null; actorId?: number | null }) {
    const r = await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, href, actor_id, is_read, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,false,$7) RETURNING *`,
      [n.userId, n.type, n.title, n.body ?? null, n.href ?? null, n.actorId ?? null, new Date().toISOString()]
    );
    return r.rows[0];
  },
  async getNotifications(userId: number, limit = 20) {
    const r = await pool.query(
      `SELECT n.*, u.name AS actor_name, u.avatar_url AS actor_avatar
       FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );
    return r.rows.map((row: any) => ({
      id: row.id, userId: row.user_id, type: row.type, title: row.title,
      body: row.body, href: row.href, actorId: row.actor_id,
      isRead: row.is_read, createdAt: row.created_at,
      actor: row.actor_id ? { id: row.actor_id, name: row.actor_name, avatarUrl: row.actor_avatar } : null,
    }));
  },
  async getUnreadNotificationCount(userId: number): Promise<number> {
    const r = await pool.query(`SELECT COUNT(*) FROM notifications WHERE user_id=$1 AND is_read=false`, [userId]);
    return parseInt(r.rows[0].count, 10);
  },
  async markAllNotificationsRead(userId: number) {
    await pool.query(`UPDATE notifications SET is_read=true WHERE user_id=$1 AND is_read=false`, [userId]);
  },
  async hasNotificationToday(userId: number, type: string, todayISO: string): Promise<boolean> {
    const r = await pool.query(
      `SELECT 1 FROM notifications WHERE user_id=$1 AND type=$2 AND created_at >= $3 LIMIT 1`,
      [userId, type, todayISO]
    );
    return r.rows.length > 0;
  },

  // ── Today (unified agenda) ───────────────────────────────────────────────────
  // One aggregated view of everything actionable today, across all modules.
  async getTodayItems(userId: number, today: string) {
    type Item = {
      type: string; id: number; title: string; sub: string | null;
      href: string; dueDate: string | null; overdue: boolean; done: boolean;
    };
    const items: Item[] = [];

    const [genTasks, projTasks, houseTasks, choresDue, eventsToday, habitsRows, plantsRows] = await Promise.all([
      pool.query(
        `SELECT id, title, due_date FROM general_tasks
         WHERE user_id=$1 AND completed=false AND due_date IS NOT NULL AND due_date <= $2
         ORDER BY due_date LIMIT 50`, [userId, today]),
      pool.query(
        `SELECT pt.id, pt.title, pt.due_date, p.title AS project_title
         FROM project_tasks pt JOIN projects p ON p.id = pt.project_id
         WHERE p.user_id=$1 AND pt.completed=false AND pt.due_date IS NOT NULL AND pt.due_date <= $2
         ORDER BY pt.due_date LIMIT 50`, [userId, today]),
      pool.query(
        `SELECT ht.id, ht.title, ht.due_date, hp.title AS project_title
         FROM house_project_tasks ht JOIN house_projects hp ON hp.id = ht.house_project_id
         WHERE hp.user_id=$1 AND ht.completed=false AND ht.due_date IS NOT NULL AND ht.due_date <= $2
         ORDER BY ht.due_date LIMIT 50`, [userId, today]),
      pool.query(
        `SELECT id, title, next_due FROM chores
         WHERE user_id=$1 AND is_active=true AND next_due IS NOT NULL AND next_due <= $2
         ORDER BY next_due LIMIT 50`, [userId, today]),
      pool.query(
        `SELECT id, title, date, category FROM events
         WHERE user_id=$1 AND date=$2 LIMIT 50`, [userId, today]),
      pool.query(
        `SELECT id, title, completions_json FROM habits
         WHERE user_id=$1 AND is_archived=false LIMIT 50`, [userId]),
      pool.query(
        `SELECT id, name, last_watered, water_frequency_days FROM plants
         WHERE user_id=$1 LIMIT 100`, [userId]),
    ]);

    for (const t of genTasks.rows) items.push({
      type: "task", id: t.id, title: t.title, sub: null, href: "/tasks",
      dueDate: t.due_date, overdue: t.due_date < today, done: false,
    });
    for (const t of projTasks.rows) items.push({
      type: "project_task", id: t.id, title: t.title, sub: t.project_title, href: "/tasks",
      dueDate: t.due_date, overdue: t.due_date < today, done: false,
    });
    for (const t of houseTasks.rows) items.push({
      type: "house_task", id: t.id, title: t.title, sub: t.project_title, href: "/housekeeping",
      dueDate: t.due_date, overdue: t.due_date < today, done: false,
    });
    for (const c of choresDue.rows) items.push({
      type: "chore", id: c.id, title: c.title, sub: null, href: "/housekeeping",
      dueDate: c.next_due, overdue: c.next_due < today, done: false,
    });
    for (const e of eventsToday.rows) items.push({
      type: "event", id: e.id, title: e.title, sub: e.category, href: "/calendar",
      dueDate: e.date, overdue: false, done: false,
    });
    for (const h of habitsRows.rows) {
      let completions: Array<{ date: string }> = [];
      try { completions = JSON.parse(h.completions_json || "[]"); } catch {}
      const doneToday = completions.some((c) => c.date === today);
      items.push({
        type: "habit", id: h.id, title: h.title, sub: "Daily habit", href: "/habits",
        dueDate: today, overdue: false, done: doneToday,
      });
    }
    for (const p of plantsRows.rows) {
      if (!p.last_watered) continue;
      const freq = p.water_frequency_days ?? 7;
      const next = new Date(new Date(p.last_watered + "T00:00:00Z").getTime() + freq * 86400_000)
        .toISOString().slice(0, 10);
      if (next <= today) items.push({
        type: "plant", id: p.id, title: `Water ${p.name}`, sub: null, href: "/plants",
        dueDate: next, overdue: next < today, done: false,
      });
    }

    // Overdue first, then by due date; done items last
    items.sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999");
    });

    return {
      date: today,
      items,
      counts: {
        total: items.length,
        overdue: items.filter((i) => i.overdue).length,
        done: items.filter((i) => i.done).length,
      },
    };
  },

};

// ── System Recipe Seeding ─────────────────────────────────────────────────────
import { SYSTEM_RECIPES } from "./recipeData";

function getCategoryEmoji(cat: string): string {
  const map: Record<string, string> = {
    "Baking": "🥧", "Bread Machine": "🍞", "Breakfast for Dinner": "🍳",
    "Chicken": "🍗", "Desserts": "🍰", "Vegan": "🥗", "Vegetarian": "🥦",
    "Seafood": "🐟", "Pasta": "🍝", "Mexican": "🌮", "Asian": "🍜",
    "Indian": "🍛", "Italian Regional": "🍕", "Mediterranean": "🫒",
    "Soups & Stews": "🥣", "Slow Cooker": "🍲", "Instant Pot": "⚡",
    "Sides & Vegetables": "🥕", "Steak": "🥩", "BBQ & Grilling": "🔥",
    "Keto": "🥑", "Whole30": "🥙", "Healthy Dinner": "🥗",
    "Healthy Breakfast": "🥞", "Healthy Lunch": "🥙", "Healthy Kids": "🌟",
    "Kid-Friendly": "🧒", "Game Day": "🏈", "Holiday Feasts": "🎄",
    "Jewish": "✡️",
  };
  return map[cat] || "🍽️";
}

function mapCategoryToComponentType(cat: string): string | null {
  if (["Baking", "Bread Machine", "Desserts"].includes(cat)) return "baking";
  if (["Sides & Vegetables"].includes(cat)) return "side";
  return "main";
}

export async function seedSystemRecipes() {
  const { rows } = await pool.query(`SELECT COUNT(*) FROM recipes WHERE user_id IS NULL`);
  if (parseInt(rows[0].count) > 0) return; // Already seeded

  // Insert in batches of 50
  const batch = 50;
  for (let i = 0; i < SYSTEM_RECIPES.length; i += batch) {
    const slice = SYSTEM_RECIPES.slice(i, i + batch);
    await db.insert(recipes).values(slice.map(r => ({
      userId: null,
      name: r.name,
      emoji: getCategoryEmoji(r.category),
      category: r.category,
      description: r.description || null,
      servings: r.servings || null,
      prepTime: r.prepTime || null,
      cookTime: r.cookTime || null,
      ingredientsJson: r.ingredientsJson,
      instructions: r.instructions || null,
      tags: r.tags || null,
      source: r.source || null,
      nutritionData: r.nutritionData || null,
      componentType: mapCategoryToComponentType(r.category),
    })));
  }
  console.log(`Seeded ${SYSTEM_RECIPES.length} system recipes`);
}

// ── MealDB Recipe Seeding ─────────────────────────────────────────────────────
import mealdbData from "./mealdbData.json";

type MealDBEntry = {
  mealdbId: string; name: string; emoji: string; category: string | null;
  componentType: string; ingredientsJson: string; instructions: string | null;
  imageUrl: string | null; tags: string | null; source: string | null;
};

export async function seedMealDBRecipes() {
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM recipes WHERE user_id IS NULL AND tags LIKE '%mealdb%'`
  );
  if (parseInt(rows[0].count) > 0) return; // Already seeded

  const data = mealdbData as MealDBEntry[];
  const batch = 50;
  for (let i = 0; i < data.length; i += batch) {
    const slice = data.slice(i, i + batch);
    await db.insert(recipes).values(slice.map(r => ({
      userId: null,
      name: r.name,
      emoji: r.emoji,
      category: r.category,
      componentType: r.componentType,
      ingredientsJson: r.ingredientsJson,
      instructions: r.instructions,
      imageUrl: r.imageUrl,
      tags: [r.tags, "mealdb"].filter(Boolean).join(","),
      source: r.source,
    })));
  }
  console.log(`Seeded ${data.length} MealDB recipes`);
}

// ── Manual Recipe Images ──────────────────────────────────────────────────────
// Hand-curated name → image URL mappings. Applied on every startup (overwrites).
const MANUAL_RECIPE_IMAGES: { name: string; imageUrl: string }[] = [
  { name: "100% Whole Wheat Bread", imageUrl: "https://www.kingarthurbaking.com/sites/default/files/styles/featured_image_2x/public/recipe_legacy/5997-3-large.jpg?itok=9NikFeli" },
  { name: "30-Minute Cashew Alfredo", imageUrl: "https://minimalistbaker.com/wp-content/uploads/2017/08/AMAZING-30-Minute-Vegan-Alfredo-Creamy-cheesy-SO-tasty-pasta-alfredo-zoodles-recipe-vegan-glutenfree-minimalistbaker-oilfree-12.jpg" },
  { name: "4th of July Baby Back Ribs", imageUrl: "https://ayearatthetable.com/wp-content/uploads/2011/06/IMG_33561.jpg" },
  { name: "5-Alarm Competition Chili", imageUrl: "https://spicysouthernkitchen.com/wp-content/uploads/5-alarm-chili-4.jpg" },
  { name: "Abbacchio Scottadito", imageUrl: "https://www.giallozafferano.it/images/3-326/Abbacchio-A-Scottadito_780x520_wm.jpg" },
  { name: "Aglio e Olio", imageUrl: "https://www.allrecipes.com/thmb/gqWs6X3LQQUQiqENYtphs32W-Po=/0x512/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/AR-222000-spaghetti-aglio-e-olio-DDMFS-beauty-3x4-8d8d06ed371c4c17a29f2aa7eb500e9e.jpg" },
  { name: "Air Fryer Egg Cups", imageUrl: "https://www.eazypeazymealz.com/wp-content/uploads/2016/06/air-fryer-egg-cups-6.jpg" },
  { name: "Air Fryer Garlic Butter Steak Bites", imageUrl: "https://www.thecountrycook.net/wp-content/uploads/2023/06/1st-image-Air-Fryer-Garlic-Butter-Steak-Bites-scaled.jpg" },
  { name: "Air Fryer Garlic Parmesan Wings", imageUrl: "https://drdavinahseats.com/wp-content/uploads/2021/05/Air-Fryer-Garlic-Parmesan-Chicken-Wings-2-V4-1200-X-1800.jpg" },
  { name: "Air Fryer Roasted Cauliflower", imageUrl: "https://www.allrecipes.com/thmb/Xi360DVVJSOBQzgoWGk01QTKsDc=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/267304-air-fryer-roasted-cauliflower-ddmfs-step-4x3-64dd8aa5047348d7b3ec887860222f63.jpg" },
  { name: "Air Fryer Sweet Potato Fries", imageUrl: "https://natashaskitchen.com/wp-content/uploads/2022/01/Air-Fryer-Sweet-Potato-Fries-5.jpg" },
  { name: "Alabama White Sauce Smoked Chicken", imageUrl: "https://bamagrillmaster.com/cdn/shop/articles/20240302205543-img_1765.jpg?v=1729624932&width=2200" },
  { name: "All-American Beef Stew", imageUrl: "https://www.seriouseats.com/thmb/vjjDTUANmCqADYHyhzbv3p4oYyQ=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/__opt__aboutcom__coeus__resources__content_migration__serious_eats__seriouseats.com__recipes__images__2016__01__20160116-american-beef-stew-recipe-34-bafc948f10ba4d49a8bfb1dd6502c911.jpg" },
  { name: "Aloo Paratha", imageUrl: "https://www.seriouseats.com/thmb/rUJE0u39M7K-_UCHQeQ0vyM-yLI=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/__opt__aboutcom__coeus__resources__content_migration__serious_eats__seriouseats.com__2021__01__20210106-aloo-parathas-nik-sharma-13-52b77ba4cbad4c4f844f2f88910b2b53.jpg" },
  { name: "Al Pastor Tacos", imageUrl: "https://www.seriouseats.com/thmb/phKX03D3YWbjHp9ZoelmXYWag-0=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/20260609-SEA-tacos-al-pastor-Lorena-Masso-03-051d44b9937346dcb3f818e853b9c20b.jpg" },
  { name: "Anadama Bread", imageUrl: "https://www.seriouseats.com/thmb/TsBNLZUb1GFsLIuxxYCSuajCMAU=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/20250129-SEA-AnadamaBread-DebbieWee-Beauty2-24-538335cc8ae94e79a563006ff9be44f3.jpg" },
  { name: "Andalusian Gazpacho", imageUrl: "https://www.seriouseats.com/thmb/4r5EDLcD3I9S3SKXgEqk4Ha7ccU=/750x0/filters:no_upscale():max_bytes(150000):strip_icc():format(webp)/andalusian-gazpacho-recipe-hero-04_1-a7207c6562c543fa9d5c4d1c53996f46.JPG" },
];

export async function applyManualRecipeImages() {
  let updated = 0;
  for (const { name, imageUrl } of MANUAL_RECIPE_IMAGES) {
    const result = await pool.query(
      `UPDATE recipes SET image_url = $1 WHERE name = $2`,
      [imageUrl, name]
    );
    if ((result.rowCount ?? 0) > 0) updated++;
  }
  if (updated > 0) console.log(`[manual-images] Applied ${updated} manual recipe images.`);
}

// ── Recipe Image Enrichment ────────────────────────────────────────────────────
// Fetches og:image from each system recipe's source URL and stores it in the DB.
// Runs once at startup; idempotent (skips recipes that already have image_url).
// Failures are silently swallowed so startup is never blocked.
export async function seedRecipeImages() {
  const { rows } = await pool.query<{ id: number; source: string }>(
    `SELECT id, source FROM recipes
     WHERE user_id IS NULL
       AND image_url IS NULL
       AND source IS NOT NULL
       AND source LIKE 'http%'
     ORDER BY id`
  );

  if (rows.length === 0) {
    console.log("[recipe-images] All system recipes already have images.");
    return;
  }

  console.log(`[recipe-images] Enriching ${rows.length} recipes with og:image…`);

  let updated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(row.source, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; recipe-enricher/1.0)",
          "Accept": "text/html",
        },
        redirect: "follow",
      }).finally(() => clearTimeout(timeout));

      if (!res.ok) { failed++; continue; }

      const html = await res.text();

      // Try og:image first, then twitter:image
      const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
        ?? html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);

      const imageUrl = ogMatch?.[1]?.trim();
      if (!imageUrl || !imageUrl.startsWith("http")) { failed++; continue; }

      await pool.query(`UPDATE recipes SET image_url = $1 WHERE id = $2`, [imageUrl, row.id]);
      updated++;

      // Be polite — 150ms between requests
      await new Promise(r => setTimeout(r, 150));
    } catch {
      failed++;
    }
  }

  console.log(`[recipe-images] Done. Updated: ${updated}, Failed/skipped: ${failed}`);
}

export { pool };

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED SHARES
// One `shares` table replaces: recipe_shares, quote_shares, art_shares,
// spot_shares, movie_shares, workout_shares, book_recommendations,
// music_recommendations. The legacy storage methods below are overridden at
// runtime (Object.assign) so every route and client keeps its exact shape.
// Legacy tables are kept as a read-only backup after one-time migration.
// ═══════════════════════════════════════════════════════════════════════════

function snakeToCamelKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    out[k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] = obj[k];
  }
  return out;
}

function parseContent(json: string | null): Record<string, unknown> {
  try { return JSON.parse(json || "{}"); } catch { return {}; }
}

/**
 * One-time merge of the four task tables (tasks, general_tasks, project_tasks,
 * goal_tasks) into a single unified_tasks table. The four legacy names live on
 * as auto-updatable SQL VIEWS over unified_tasks, so every existing query —
 * Drizzle and raw SQL, reads and writes — keeps working unchanged.
 * General task ids are preserved (purchase_items.linked_task_id and
 * events.linked_task_id reference them); other tables get fresh ids.
 * Original tables are renamed to *_legacy as a backup.
 */
export async function migrateUnifiedTasks() {
  const exists = await pool.query(`SELECT to_regclass('unified_tasks') AS r`);
  if (exists.rows[0].r) return;
  console.log("Merging task tables into unified_tasks…");
  await pool.query(`
    BEGIN;

    CREATE TABLE unified_tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      event_id INTEGER,
      project_id INTEGER,
      goal_id INTEGER,
      title TEXT NOT NULL,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    -- General tasks first, ids preserved
    INSERT INTO unified_tasks (id, user_id, title, completed, due_date, priority, notes, sort_order)
      SELECT id, user_id, title, completed, due_date, priority, notes, sort_order FROM general_tasks;

    -- Bump the sequence past preserved ids before the others take fresh ones
    SELECT setval('unified_tasks_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM unified_tasks), 1));

    INSERT INTO unified_tasks (event_id, title, completed, due_date, notes, sort_order)
      SELECT event_id, title, completed, due_date, notes, sort_order FROM tasks;
    INSERT INTO unified_tasks (project_id, title, completed, due_date, priority, notes, sort_order)
      SELECT project_id, title, completed, due_date, priority, notes, sort_order FROM project_tasks;
    INSERT INTO unified_tasks (goal_id, title, completed, due_date, notes, sort_order)
      SELECT goal_id, title, completed, due_date, notes, sort_order FROM goal_tasks;

    SELECT setval('unified_tasks_id_seq', GREATEST((SELECT COALESCE(MAX(id),0) FROM unified_tasks), 1));

    CREATE INDEX idx_unified_tasks_user ON unified_tasks (user_id) WHERE user_id IS NOT NULL;
    CREATE INDEX idx_unified_tasks_event ON unified_tasks (event_id) WHERE event_id IS NOT NULL;
    CREATE INDEX idx_unified_tasks_project ON unified_tasks (project_id) WHERE project_id IS NOT NULL;
    CREATE INDEX idx_unified_tasks_goal ON unified_tasks (goal_id) WHERE goal_id IS NOT NULL;

    ALTER TABLE general_tasks RENAME TO general_tasks_legacy;
    ALTER TABLE tasks RENAME TO tasks_legacy;
    ALTER TABLE project_tasks RENAME TO project_tasks_legacy;
    ALTER TABLE goal_tasks RENAME TO goal_tasks_legacy;

    CREATE VIEW general_tasks AS
      SELECT id, user_id, title, completed, due_date, priority, notes, sort_order
      FROM unified_tasks
      WHERE event_id IS NULL AND project_id IS NULL AND goal_id IS NULL;
    CREATE VIEW tasks AS
      SELECT id, event_id, title, completed, due_date, notes, sort_order
      FROM unified_tasks WHERE event_id IS NOT NULL;
    CREATE VIEW project_tasks AS
      SELECT id, project_id, title, completed, due_date, priority, notes, sort_order
      FROM unified_tasks WHERE project_id IS NOT NULL;
    CREATE VIEW goal_tasks AS
      SELECT id, goal_id, title, completed, due_date, notes, sort_order
      FROM unified_tasks WHERE goal_id IS NOT NULL;

    COMMIT;
  `);
  console.log("unified_tasks migration complete.");
}

/** One-time copy of legacy share rows into the unified table. */
export async function migrateLegacyShares() {
  const existing = await pool.query(`SELECT COUNT(*)::int AS c FROM shares`);
  if (existing.rows[0].c > 0) return;
  const sources: Array<[string, string]> = [
    ["book", "book_recommendations"], ["music", "music_recommendations"],
    ["recipe", "recipe_shares"], ["quote", "quote_shares"], ["art", "art_shares"],
    ["spot", "spot_shares"], ["movie", "movie_shares"], ["workout", "workout_shares"],
  ];
  let total = 0;
  for (const [type, table] of sources) {
    try {
      const rows = await pool.query(`SELECT * FROM ${table} ORDER BY id`);
      for (const row of rows.rows) {
        const { id: _id, from_user_id, to_user_id, notes, created_at, is_dismissed, is_read, ...rest } = row;
        await pool.query(
          `INSERT INTO shares (share_type, from_user_id, to_user_id, content_json, notes, is_read, is_dismissed, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [type, from_user_id, to_user_id, JSON.stringify(snakeToCamelKeys(rest)),
           notes ?? null, is_read ?? false, is_dismissed ?? false, created_at ?? new Date().toISOString()]
        );
        total++;
      }
    } catch (e) { console.warn(`Share migration skipped for ${table}: ${String(e).slice(0, 120)}`); }
  }
  if (total > 0) console.log(`Migrated ${total} legacy share rows into unified shares table.`);
}

async function sendShareUnified(shareType: string, data: Record<string, any>): Promise<any> {
  const {
    id: _drop, fromUserId, toUserId,
    notes = null, createdAt = new Date().toISOString(),
    isDismissed = false, isRead = false,
    ...content
  } = data;
  const r = await pool.query(
    `INSERT INTO shares (share_type, from_user_id, to_user_id, content_json, notes, is_read, is_dismissed, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [shareType, fromUserId, toUserId, JSON.stringify(content), notes, isRead, isDismissed, createdAt]
  );
  return { id: r.rows[0].id, fromUserId, toUserId, ...content, notes, createdAt, isDismissed, isRead };
}

async function getSharesUnified(shareType: string, userId: number): Promise<{ received: any[]; sent: any[] }> {
  const rows = await pool.query(
    `SELECT s.*, fu.name AS from_name, fu.avatar_url AS from_avatar,
            tu.name AS to_name, tu.avatar_url AS to_avatar
     FROM shares s
     JOIN users fu ON fu.id = s.from_user_id
     JOIN users tu ON tu.id = s.to_user_id
     WHERE s.share_type = $1 AND (s.from_user_id = $2 OR s.to_user_id = $2)
     ORDER BY s.created_at DESC`,
    [shareType, userId]
  );
  const map = (r: any) => ({
    id: r.id, fromUserId: r.from_user_id, toUserId: r.to_user_id,
    ...parseContent(r.content_json),
    notes: r.notes, createdAt: r.created_at, isDismissed: r.is_dismissed, isRead: r.is_read,
    fromUser: { id: r.from_user_id, name: r.from_name, avatarUrl: r.from_avatar },
    toUser: { id: r.to_user_id, name: r.to_name, avatarUrl: r.to_avatar },
  });
  return {
    received: rows.rows.filter((r: any) => r.to_user_id === userId && !r.is_dismissed).map(map),
    sent: rows.rows.filter((r: any) => r.from_user_id === userId).map(map),
  };
}

async function dismissShareUnified(shareType: string, id: number, userId: number): Promise<boolean> {
  const r = await pool.query(
    `UPDATE shares SET is_dismissed = true WHERE id = $1 AND to_user_id = $2 AND share_type = $3`,
    [id, userId, shareType]
  );
  return (r.rowCount ?? 0) > 0;
}

async function deleteShareUnified(shareType: string, id: number, userId: number): Promise<boolean> {
  const r = await pool.query(
    `DELETE FROM shares WHERE id = $1 AND from_user_id = $2 AND share_type = $3`,
    [id, userId, shareType]
  );
  return (r.rowCount ?? 0) > 0;
}

// How each type maps its content fields to the generic inbox card
const INBOX_FIELDS: Record<string, (c: any) => { title: string; subtitle: string | null; imageUrl: string | null }> = {
  book:   (c) => ({ title: c.bookTitle,  subtitle: c.bookAuthor ?? null,     imageUrl: c.coverUrl ?? null }),
  movie:  (c) => ({ title: c.title,      subtitle: c.director ?? null,       imageUrl: c.posterUrl ?? null }),
  music:  (c) => ({ title: c.artistName, subtitle: c.songTitle ?? null,      imageUrl: null }),
  recipe: (c) => ({ title: c.recipeName, subtitle: c.recipeCategory ?? null, imageUrl: c.recipeImageUrl ?? null }),
  spot:   (c) => ({ title: c.name,       subtitle: c.city ?? null,           imageUrl: null }),
  art:    (c) => ({ title: c.title,      subtitle: c.artistName ?? null,     imageUrl: c.imageUrl ?? null }),
  quote:  (c) => ({ title: c.text,       subtitle: c.author ?? null,         imageUrl: null }),
};

const PLURAL_TO_TYPE: Record<string, string> = {
  books: "book", music: "music", recipes: "recipe", movies: "movie",
  spots: "spot", art: "art", quotes: "quote", workouts: "workout",
};

Object.assign(storage as any, {
  // Per-type send/get/dismiss/delete — same signatures and return shapes
  sendRecipeShare: (d: any) => sendShareUnified("recipe", d),
  getRecipeShares: (u: number) => getSharesUnified("recipe", u),
  dismissRecipeShare: (id: number, u: number) => dismissShareUnified("recipe", id, u),
  deleteRecipeShare: (id: number, u: number) => deleteShareUnified("recipe", id, u),

  sendMusicRecommendation: (d: any) => sendShareUnified("music", d),
  getMusicRecommendations: (u: number) => getSharesUnified("music", u),
  dismissMusicRecommendation: (id: number, u: number) => dismissShareUnified("music", id, u),
  deleteMusicRecommendation: (id: number, u: number) => deleteShareUnified("music", id, u),

  sendBookRecommendation: (d: any) => sendShareUnified("book", d),
  getBookRecommendations: (u: number) => getSharesUnified("book", u),
  dismissBookRecommendation: (id: number, u: number) => dismissShareUnified("book", id, u),
  deleteBookRecommendation: (id: number, u: number) => deleteShareUnified("book", id, u),

  sendQuoteShare: (d: any) => sendShareUnified("quote", d),
  getQuoteShares: (u: number) => getSharesUnified("quote", u),
  dismissQuoteShare: (id: number, u: number) => dismissShareUnified("quote", id, u),
  deleteQuoteShare: (id: number, u: number) => deleteShareUnified("quote", id, u),

  sendArtShare: (d: any) => sendShareUnified("art", d),
  getArtShares: (u: number) => getSharesUnified("art", u),
  dismissArtShare: (id: number, u: number) => dismissShareUnified("art", id, u),
  deleteArtShare: (id: number, u: number) => deleteShareUnified("art", id, u),

  sendSpotShare: (d: any) => sendShareUnified("spot", d),
  getSpotShares: (u: number) => getSharesUnified("spot", u),
  dismissSpotShare: (id: number, u: number) => dismissShareUnified("spot", id, u),
  deleteSpotShare: (id: number, u: number) => deleteShareUnified("spot", id, u),

  sendMovieShare: (d: any) => sendShareUnified("movie", d),
  getMovieShares: (u: number) => getSharesUnified("movie", u),
  dismissMovieShare: (id: number, u: number) => dismissShareUnified("movie", id, u),
  deleteMovieShare: (id: number, u: number) => deleteShareUnified("movie", id, u),

  createWorkoutShare: (d: any) => sendShareUnified("workout", d),
  getWorkoutShares: async (u: number) => (await getSharesUnified("workout", u)).received,
  dismissWorkoutShare: (id: number, u: number) => dismissShareUnified("workout", id, u),

  // Aggregates
  async getUnreadSharesCount(userId: number) {
    const r = await pool.query(
      `SELECT share_type, COUNT(*)::int AS c FROM shares
       WHERE to_user_id = $1 AND is_dismissed = false AND is_read = false
       GROUP BY share_type`,
      [userId]
    );
    const byType: Record<string, number> = Object.fromEntries(r.rows.map((x: any) => [x.share_type, x.c]));
    const counts = {
      books: byType.book ?? 0, music: byType.music ?? 0, recipes: byType.recipe ?? 0,
      movies: byType.movie ?? 0, spots: byType.spot ?? 0, art: byType.art ?? 0,
      quotes: byType.quote ?? 0, workouts: byType.workout ?? 0,
    };
    return { total: Object.values(counts).reduce((a, b) => a + b, 0), ...counts };
  },

  async markSharesRead(type: string, userId: number) {
    const shareType = PLURAL_TO_TYPE[type];
    if (!shareType) return;
    await pool.query(
      `UPDATE shares SET is_read = true WHERE to_user_id = $1 AND share_type = $2 AND is_read = false`,
      [userId, shareType]
    );
  },

  async getRecommendationsInbox(userId: number, filterType?: string) {
    const types = filterType && filterType !== "all" ? [filterType] : Object.keys(INBOX_FIELDS);
    const r = await pool.query(
      `SELECT s.*, u.name AS from_name, u.avatar_url AS from_avatar
       FROM shares s JOIN users u ON u.id = s.from_user_id
       WHERE s.to_user_id = $1 AND s.is_dismissed = false AND s.share_type = ANY($2)
       ORDER BY s.created_at DESC`,
      [userId, types]
    );
    return r.rows.map((row: any) => {
      const fields = INBOX_FIELDS[row.share_type]?.(parseContent(row.content_json))
        ?? { title: "", subtitle: null, imageUrl: null };
      return {
        id: row.id, recType: row.share_type,
        fromUser: { id: row.from_user_id, name: row.from_name, avatarUrl: row.from_avatar },
        ...fields,
        note: row.notes, createdAt: row.created_at, isRead: row.is_read,
      };
    });
  },

  async markRecommendationRead(userId: number, _type: string, id: number) {
    await pool.query(`UPDATE shares SET is_read = true WHERE id = $1 AND to_user_id = $2`, [id, userId]);
  },

  async addRecommendationToCollection(userId: number, type: string, recId: number) {
    const row = await pool.query(`SELECT * FROM shares WHERE id = $1 AND to_user_id = $2`, [recId, userId]);
    if (!row.rows[0]) throw new Error("Recommendation not found");
    const c: any = parseContent(row.rows[0].content_json);
    await pool.query(`UPDATE shares SET is_read = true WHERE id = $1`, [recId]);

    switch (type) {
      case "book":
        return db.insert(books).values({ userId, title: c.bookTitle, author: c.bookAuthor ?? null, coverUrl: c.coverUrl ?? null, status: "want_to_read" }).returning().then(x => x[0]);
      case "movie":
        return db.insert(movies).values({ userId, title: c.title, mediaType: c.mediaType ?? "movie", posterUrl: c.posterUrl ?? null, posterColor: c.posterColor ?? null, status: "backlog", isFavorite: false }).returning().then(x => x[0]);
      case "music": {
        const artist = await db.insert(musicArtists).values({ userId, name: c.artistName, genres: null, isFavorite: false }).returning().then(x => x[0]);
        if (c.songTitle) {
          await db.insert(musicSongs).values({ userId, artistId: artist.id, title: c.songTitle, isFavorite: false }).catch(() => {});
        }
        return artist;
      }
      case "recipe":
        return db.insert(recipes).values({ userId, name: c.recipeName, emoji: c.recipeEmoji ?? "🍽️", category: c.recipeCategory ?? null, tags: null }).returning().then(x => x[0]);
      case "spot":
        return db.insert(spots).values({ userId, name: c.name, type: c.type ?? "restaurant", city: c.city ?? null, neighborhood: c.neighborhood ?? null, status: "want_to_visit", isFavorite: false }).returning().then(x => x[0]);
      case "art":
        return db.insert(artPieces).values({ userId, title: c.title, artistName: c.artistName ?? null, medium: c.medium ?? "other", imageUrl: c.imageUrl ?? null, accentColor: c.accentColor ?? null, whereViewed: c.whereViewed ?? null, status: "want_to_see", isFavorite: false }).returning().then(x => x[0]);
      case "quote":
        return db.insert(quotes).values({ userId, text: c.text, author: c.author ?? null, category: c.category ?? "other", isFavorite: false }).returning().then(x => x[0]);
      default:
        throw new Error(`Cannot add type: ${type}`);
    }
  },

  async sendUnifiedRecommendation(fromUserId: number, toUserId: number, type: string, data: { title: string; subtitle?: string; imageUrl?: string; note?: string }) {
    const base = { fromUserId, toUserId, notes: data.note ?? null };
    switch (type) {
      case "book":
        return sendShareUnified("book", { ...base, bookTitle: data.title, bookAuthor: data.subtitle ?? null, coverUrl: data.imageUrl ?? null });
      case "movie":
        return sendShareUnified("movie", { ...base, title: data.title, mediaType: "movie", posterUrl: data.imageUrl ?? null });
      case "music":
        return sendShareUnified("music", { ...base, type: data.subtitle ? "song" : "artist", artistName: data.title, songTitle: data.subtitle ?? null });
      case "recipe":
        return sendShareUnified("recipe", { ...base, recipeName: data.title, recipeEmoji: "🍽️", recipeIngredients: "[]", recipeImageUrl: data.imageUrl ?? null });
      case "spot":
        return sendShareUnified("spot", { ...base, name: data.title, type: "restaurant", city: data.subtitle ?? null });
      case "art":
        return sendShareUnified("art", { ...base, title: data.title, artistName: data.subtitle ?? null, imageUrl: data.imageUrl ?? null });
      case "quote":
        return sendShareUnified("quote", { ...base, text: data.title, author: data.subtitle ?? null });
      default:
        throw new Error(`Unknown rec type: ${type}`);
    }
  },
});

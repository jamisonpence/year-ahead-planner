import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { events, tasks, recipes, mealBundles, weekPlan, groceryChecks, books, readingSessions, workoutTemplates, workoutLogs, workoutPlans, workoutShares, goals, goalTasks, projects, projectTasks, generalTasks, relationshipGroups, people, movies, budgetCategories, transactions, subscriptions, receipts, navPrefs, tabPrivacy, users, plants, musicArtists, musicSongs, chores, houseProjects, houseProjectTasks, appliances, spots, spotShares, children, childMilestones, childMemories, childPrepItems, quotes, quoteShares, artPieces, artShares, journalEntries, equipment, friendRequests, bookRecommendations, musicRecommendations, recipeShares, movieShares, hobbies } from "@shared/schema";
import type {
  InsertEvent, Event, InsertTask, Task, EventWithTasks,
  InsertRecipe, Recipe, InsertMealBundle, MealBundle, InsertWeekPlan, WeekPlan, InsertGroceryCheck, GroceryCheck,
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
  InsertQuote, Quote,
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
} from "@shared/schema";
import { eq, asc, desc } from "drizzle-orm";

const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgresql://localhost/planner" });
const db = drizzle(pool);

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
      linked_template_id INTEGER
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
      sort_order INTEGER NOT NULL DEFAULT 0
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

  // Photo URL for plants (from Perenual API)
  await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS photo_url TEXT`);

  // AI enrichment fields for plants
  await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS toxicity_notes TEXT`);
  await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS propagation_methods TEXT`);
  await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS care_difficulty TEXT`);
  await pool.query(`ALTER TABLE plants ADD COLUMN IF NOT EXISTS ai_enriched BOOLEAN NOT NULL DEFAULT false`);

  // Encrypted Anthropic API key on users
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS anthropic_api_key_enc TEXT`);

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
}

// ── STORAGE INTERFACE ──────────────────────────────────────────────────────────
export interface IStorage {
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
  getUserById(id: number): Promise<User | undefined>;
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
  // Quotes
  getAllQuotes(userId: number): Promise<Quote[]>;
  createQuote(data: InsertQuote, userId: number): Promise<Quote>;
  updateQuote(id: number, data: Partial<InsertQuote>): Promise<Quote | undefined>;
  deleteQuote(id: number): Promise<boolean>;
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
  // Workout Shares
  createWorkoutShare(data: InsertWorkoutShare): Promise<WorkoutShare>;
  getWorkoutShares(userId: number): Promise<WorkoutShareWithUser[]>;
  dismissWorkoutShare(id: number, userId: number): Promise<void>;
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
    return db.select().from(recipes).where(eq(recipes.userId, userId)).orderBy(asc(recipes.name));
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
  async getUserById(id) {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
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
    return db.select().from(spots).where(eq(spots.userId, userId)).orderBy(asc(spots.name));
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
};

export { pool };

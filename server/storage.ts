import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { events, tasks, recipes, mealBundles, weekPlan, groceryChecks, books, readingSessions, workoutTemplates, workoutLogs, goals, goalTasks, projects, projectTasks, generalTasks, relationshipGroups, people, movies, budgetCategories, transactions, subscriptions, receipts, navPrefs, users, plants, musicArtists, musicSongs, chores, houseProjects, houseProjectTasks, appliances, spots, children, childMilestones, childMemories, childPrepItems, quotes, artPieces, journalEntries, equipment, friendRequests, bookRecommendations, musicRecommendations } from "@shared/schema";
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
  NavPref,
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
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const all = await db.select({
      id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl,
    }).from(users);
    return all
      .filter((u) => u.id !== currentUserId)
      .filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 20);
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
};

export { pool };

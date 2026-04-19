import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { events, tasks, recipes, weekPlan, groceryChecks, books, readingSessions, workoutTemplates, workoutLogs, goals, goalTasks, projects, projectTasks, generalTasks, relationshipGroups, people, movies, budgetCategories, transactions, subscriptions, receipts, navPrefs, users, plants } from "@shared/schema";
import type {
  InsertEvent, Event, InsertTask, Task, EventWithTasks,
  InsertRecipe, Recipe, InsertWeekPlan, WeekPlan, InsertGroceryCheck, GroceryCheck,
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS week_plan (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      day_index INTEGER NOT NULL,
      recipe_id INTEGER NOT NULL,
      week_start TEXT NOT NULL
    )
  `);

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
      streaming_on TEXT
    )
  `);

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
  // Week Plan
  getWeekPlan(weekStart: string, userId: number): Promise<WeekPlan[]>;
  assignRecipe(data: InsertWeekPlan, userId: number): Promise<WeekPlan>;
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

  // ── Week Plan ─────────────────────────────────────────────────────────
  async getWeekPlan(weekStart: string, userId: number) {
    return db.select().from(weekPlan).where(eq(weekPlan.weekStart, weekStart)).where(eq(weekPlan.userId, userId));
  },
  async assignRecipe(data: InsertWeekPlan, userId: number) {
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
};

export { pool };

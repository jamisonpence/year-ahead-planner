import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { events, tasks, recipes, weekPlan, groceryChecks, books, readingSessions, workoutTemplates, workoutLogs, goals, goalTasks, projects, projectTasks, generalTasks, relationshipGroups, people, movies, budgetCategories, transactions, subscriptions, receipts, navPrefs, users } from "@shared/schema";
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
} from "@shared/schema";
import { eq, asc, desc } from "drizzle-orm";

const sqlite = new Database("planner.db");
const db = drizzle(sqlite);

// ── DDL ────────────────────────────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    end_date TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    recurring TEXT NOT NULL DEFAULT 'none',
    description TEXT,
    color TEXT
  );
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS books (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  );
  CREATE TABLE IF NOT EXISTS reading_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    pages_read INTEGER NOT NULL DEFAULT 0,
    duration_minutes INTEGER,
    notes TEXT,
    planned INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    recurring TEXT NOT NULL DEFAULT 'none'
  );
  CREATE TABLE IF NOT EXISTS workout_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    workout_type TEXT NOT NULL DEFAULT 'custom',
    scheduled_day TEXT,
    recurring TEXT NOT NULL DEFAULT 'none',
    notes TEXT,
    linked_goal_id INTEGER,
    exercises_json TEXT NOT NULL DEFAULT '[]'
  );
  CREATE TABLE IF NOT EXISTS workout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    template_id INTEGER,
    date TEXT NOT NULL,
    name TEXT NOT NULL,
    workout_type TEXT NOT NULL DEFAULT 'custom',
    duration_minutes INTEGER,
    notes TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    exercises_json TEXT NOT NULL DEFAULT '[]',
    linked_goal_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  );
  CREATE TABLE IF NOT EXISTS goal_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`);

// Recipe tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    emoji TEXT NOT NULL DEFAULT '🍽️',
    category TEXT,
    prep_time INTEGER,
    cook_time INTEGER,
    ingredients_json TEXT NOT NULL DEFAULT '[]',
    instructions TEXT
  );
  CREATE TABLE IF NOT EXISTS week_plan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    day_index INTEGER NOT NULL,
    recipe_id INTEGER NOT NULL,
    week_start TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS grocery_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    week_start TEXT NOT NULL,
    item_key TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0
  );
`);

// Relationship tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS relationship_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  );
`);

// New tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS general_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`);

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    goal_id INTEGER,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started',
    due_date TEXT,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS project_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    due_date TEXT,
    priority TEXT NOT NULL DEFAULT 'medium',
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
`);

// Movies table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    year INTEGER,
    director TEXT,
    genres TEXT,
    status TEXT NOT NULL DEFAULT 'backlog',
    rating INTEGER,
    notes TEXT,
    lists_json TEXT NOT NULL DEFAULT '[]',
    is_favorite INTEGER NOT NULL DEFAULT 0,
    poster_color TEXT,
    streaming_on TEXT
  );
`);

// Budget tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS budget_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    budget_amount REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL DEFAULT 'expense',
    category_id INTEGER,
    date TEXT NOT NULL,
    notes TEXT,
    recurring TEXT NOT NULL DEFAULT 'none'
  );
  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT NOT NULL,
    amount REAL NOT NULL,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    next_renewal TEXT NOT NULL,
    category_id INTEGER,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    color TEXT,
    icon TEXT
  );
`);

// Receipts table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS receipts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
  );
`);

// Nav preferences table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS nav_prefs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    prefs_json TEXT NOT NULL DEFAULT '[]'
  );
`);

// Users table (for Google OAuth)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TEXT NOT NULL
  );
`);

// Safe migrations for existing DBs
const migrations = [
  `ALTER TABLE events ADD COLUMN recurring TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE events ADD COLUMN user_id INTEGER`,
  `ALTER TABLE books ADD COLUMN user_id INTEGER`,
  `ALTER TABLE workout_templates ADD COLUMN user_id INTEGER`,
  `ALTER TABLE workout_logs ADD COLUMN user_id INTEGER`,
  `ALTER TABLE goals ADD COLUMN user_id INTEGER`,
  `ALTER TABLE projects ADD COLUMN user_id INTEGER`,
  `ALTER TABLE general_tasks ADD COLUMN user_id INTEGER`,
  `ALTER TABLE recipes ADD COLUMN user_id INTEGER`,
  `ALTER TABLE week_plan ADD COLUMN user_id INTEGER`,
  `ALTER TABLE grocery_checks ADD COLUMN user_id INTEGER`,
  `ALTER TABLE relationship_groups ADD COLUMN user_id INTEGER`,
  `ALTER TABLE people ADD COLUMN user_id INTEGER`,
  `ALTER TABLE movies ADD COLUMN user_id INTEGER`,
  `ALTER TABLE budget_categories ADD COLUMN user_id INTEGER`,
  `ALTER TABLE transactions ADD COLUMN user_id INTEGER`,
  `ALTER TABLE subscriptions ADD COLUMN user_id INTEGER`,
  `ALTER TABLE receipts ADD COLUMN user_id INTEGER`,
  `ALTER TABLE nav_prefs ADD COLUMN user_id INTEGER`,
];
migrations.forEach((sql) => { try { sqlite.exec(sql); } catch {} });

// ── STORAGE INTERFACE ──────────────────────────────────────────────────────────
export interface IStorage {
  // Events
  getAllEventsWithTasks(userId: number): EventWithTasks[];
  createEvent(data: InsertEvent, userId: number): Event;
  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): boolean;
  // Tasks
  createTask(data: InsertTask): Task;
  updateTask(id: number, data: Partial<InsertTask>): Task | undefined;
  deleteTask(id: number): boolean;
  // Books
  getAllBooks(userId: number): Book[];
  getAllBooksWithSessions(userId: number): BookWithSessions[];
  createBook(data: InsertBook, userId: number): Book;
  updateBook(id: number, data: Partial<InsertBook>): Book | undefined;
  deleteBook(id: number): boolean;
  // Reading Sessions
  getAllReadingSessions(): ReadingSession[];
  createReadingSession(data: InsertReadingSession): ReadingSession;
  updateReadingSession(id: number, data: Partial<InsertReadingSession>): ReadingSession | undefined;
  deleteReadingSession(id: number): boolean;
  // Workout Templates
  getAllWorkoutTemplates(userId: number): WorkoutTemplate[];
  createWorkoutTemplate(data: InsertWorkoutTemplate, userId: number): WorkoutTemplate;
  updateWorkoutTemplate(id: number, data: Partial<InsertWorkoutTemplate>): WorkoutTemplate | undefined;
  deleteWorkoutTemplate(id: number): boolean;
  // Workout Logs
  getAllWorkoutLogs(userId: number): WorkoutLog[];
  createWorkoutLog(data: InsertWorkoutLog, userId: number): WorkoutLog;
  updateWorkoutLog(id: number, data: Partial<InsertWorkoutLog>): WorkoutLog | undefined;
  deleteWorkoutLog(id: number): boolean;
  // Goals
  getAllGoalsWithProjects(userId: number): GoalWithProjects[];
  getAllGoalsWithTasks(userId: number): GoalWithTasks[]; // legacy
  createGoal(data: InsertGoal, userId: number): Goal;
  updateGoal(id: number, data: Partial<InsertGoal>): Goal | undefined;
  deleteGoal(id: number): boolean;
  // Goal Tasks (legacy)
  createGoalTask(data: InsertGoalTask): GoalTask;
  updateGoalTask(id: number, data: Partial<InsertGoalTask>): GoalTask | undefined;
  deleteGoalTask(id: number): boolean;
  // Projects
  getProjectsForGoal(goalId: number): ProjectWithTasks[];
  getStandaloneProjects(userId: number): ProjectWithTasks[];
  createProject(data: InsertProject, userId: number): Project;
  updateProject(id: number, data: Partial<InsertProject>): Project | undefined;
  deleteProject(id: number): boolean;
  // Project Tasks
  createProjectTask(data: InsertProjectTask): ProjectTask;
  updateProjectTask(id: number, data: Partial<InsertProjectTask>): ProjectTask | undefined;
  deleteProjectTask(id: number): boolean;
  // General Tasks
  getAllGeneralTasks(userId: number): GeneralTask[];
  createGeneralTask(data: InsertGeneralTask, userId: number): GeneralTask;
  updateGeneralTask(id: number, data: Partial<InsertGeneralTask>): GeneralTask | undefined;
  deleteGeneralTask(id: number): boolean;
  // Recipes
  getAllRecipes(userId: number): Recipe[];
  createRecipe(data: InsertRecipe, userId: number): Recipe;
  updateRecipe(id: number, data: Partial<InsertRecipe>): Recipe | undefined;
  deleteRecipe(id: number): boolean;
  // Week Plan
  getWeekPlan(weekStart: string, userId: number): WeekPlan[];
  assignRecipe(data: InsertWeekPlan, userId: number): WeekPlan;
  removeWeekAssignment(id: number): boolean;
  // Grocery Checks
  getGroceryChecks(weekStart: string, userId: number): GroceryCheck[];
  upsertGroceryCheck(weekStart: string, itemKey: string, checked: boolean, userId: number): GroceryCheck;
  // Relationship Groups
  getAllGroups(userId: number): RelationshipGroup[];
  createGroup(data: InsertRelationshipGroup, userId: number): RelationshipGroup;
  updateGroup(id: number, data: Partial<InsertRelationshipGroup>): RelationshipGroup | undefined;
  deleteGroup(id: number): boolean;
  // People
  getAllPeople(userId: number): PersonWithSpouse[];
  createPerson(data: InsertPerson, userId: number): Person;
  updatePerson(id: number, data: Partial<InsertPerson>): Person | undefined;
  deletePerson(id: number): boolean;
  // Movies
  getAllMovies(userId: number): Movie[];
  createMovie(data: InsertMovie, userId: number): Movie;
  updateMovie(id: number, data: Partial<InsertMovie>): Movie | undefined;
  deleteMovie(id: number): boolean;
  // Budget Categories
  getAllBudgetCategories(userId: number): BudgetCategory[];
  createBudgetCategory(data: InsertBudgetCategory, userId: number): BudgetCategory;
  updateBudgetCategory(id: number, data: Partial<InsertBudgetCategory>): BudgetCategory | undefined;
  deleteBudgetCategory(id: number): boolean;
  // Transactions
  getAllTransactions(userId: number): Transaction[];
  createTransaction(data: InsertTransaction, userId: number): Transaction;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Transaction | undefined;
  deleteTransaction(id: number): boolean;
  // Subscriptions
  getAllSubscriptions(userId: number): Subscription[];
  createSubscription(data: InsertSubscription, userId: number): Subscription;
  updateSubscription(id: number, data: Partial<InsertSubscription>): Subscription | undefined;
  deleteSubscription(id: number): boolean;
  // Receipts
  getAllReceipts(userId: number): Receipt[];
  createReceiptRecord(data: InsertReceipt, userId: number): Receipt;
  updateReceiptRecord(id: number, data: Partial<InsertReceipt>): Receipt | undefined;
  deleteReceiptRecord(id: number): boolean;
  // Nav Prefs
  getNavPrefs(userId: number): NavPref[];
  saveNavPrefs(userId: number, prefs: NavPref[]): void;
  // Users
  upsertUser(data: { googleId: string; email: string; name: string; avatarUrl: string | null }): User;
  getUserById(id: number): User | undefined;
}

export const storage: IStorage = {
  // ── Events ──────────────────────────────────────────────────────────────────
  getAllEventsWithTasks(userId: number) {
    const evs = db.select().from(events).where(eq(events.userId, userId)).orderBy(asc(events.date)).all();
    const tks = db.select().from(tasks).orderBy(asc(tasks.sortOrder)).all();
    return evs.map((e) => ({ ...e, tasks: tks.filter((t) => t.eventId === e.id) }));
  },
  createEvent(data, userId) { return db.insert(events).values({ ...data, userId }).returning().get(); },
  updateEvent(id, data) {
    if (!db.select().from(events).where(eq(events.id, id)).get()) return undefined;
    return db.update(events).set(data).where(eq(events.id, id)).returning().get();
  },
  deleteEvent(id) {
    sqlite.exec(`DELETE FROM tasks WHERE event_id = ${id}`);
    return db.delete(events).where(eq(events.id, id)).run().changes > 0;
  },

  // ── Tasks ────────────────────────────────────────────────────────────────────
  createTask(data) { return db.insert(tasks).values(data).returning().get(); },
  updateTask(id, data) {
    if (!db.select().from(tasks).where(eq(tasks.id, id)).get()) return undefined;
    return db.update(tasks).set(data).where(eq(tasks.id, id)).returning().get();
  },
  deleteTask(id) { return db.delete(tasks).where(eq(tasks.id, id)).run().changes > 0; },

  // ── Books ────────────────────────────────────────────────────────────────────
  getAllBooks(userId: number) { return db.select().from(books).where(eq(books.userId, userId)).orderBy(asc(books.title)).all(); },
  getAllBooksWithSessions(userId: number) {
    const bs = db.select().from(books).where(eq(books.userId, userId)).orderBy(asc(books.title)).all();
    const ss = db.select().from(readingSessions).orderBy(desc(readingSessions.date)).all();
    return bs.map((b) => ({ ...b, sessions: ss.filter((s) => s.bookId === b.id) }));
  },
  createBook(data, userId) { return db.insert(books).values({ ...data, userId }).returning().get(); },
  updateBook(id, data) {
    if (!db.select().from(books).where(eq(books.id, id)).get()) return undefined;
    return db.update(books).set(data).where(eq(books.id, id)).returning().get();
  },
  deleteBook(id) {
    sqlite.exec(`DELETE FROM reading_sessions WHERE book_id = ${id}`);
    return db.delete(books).where(eq(books.id, id)).run().changes > 0;
  },

  // ── Reading Sessions ──────────────────────────────────────────────────────────
  getAllReadingSessions() { return db.select().from(readingSessions).orderBy(desc(readingSessions.date)).all(); },
  createReadingSession(data) { return db.insert(readingSessions).values(data).returning().get(); },
  updateReadingSession(id, data) {
    if (!db.select().from(readingSessions).where(eq(readingSessions.id, id)).get()) return undefined;
    return db.update(readingSessions).set(data).where(eq(readingSessions.id, id)).returning().get();
  },
  deleteReadingSession(id) { return db.delete(readingSessions).where(eq(readingSessions.id, id)).run().changes > 0; },

  // ── Workout Templates ─────────────────────────────────────────────────────────
  getAllWorkoutTemplates(userId: number) { return db.select().from(workoutTemplates).where(eq(workoutTemplates.userId, userId)).orderBy(asc(workoutTemplates.name)).all(); },
  createWorkoutTemplate(data, userId) { return db.insert(workoutTemplates).values({ ...data, userId }).returning().get(); },
  updateWorkoutTemplate(id, data) {
    if (!db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id)).get()) return undefined;
    return db.update(workoutTemplates).set(data).where(eq(workoutTemplates.id, id)).returning().get();
  },
  deleteWorkoutTemplate(id) { return db.delete(workoutTemplates).where(eq(workoutTemplates.id, id)).run().changes > 0; },

  // ── Workout Logs ──────────────────────────────────────────────────────────────
  getAllWorkoutLogs(userId: number) { return db.select().from(workoutLogs).where(eq(workoutLogs.userId, userId)).orderBy(desc(workoutLogs.date)).all(); },
  createWorkoutLog(data, userId) { return db.insert(workoutLogs).values({ ...data, userId }).returning().get(); },
  updateWorkoutLog(id, data) {
    if (!db.select().from(workoutLogs).where(eq(workoutLogs.id, id)).get()) return undefined;
    return db.update(workoutLogs).set(data).where(eq(workoutLogs.id, id)).returning().get();
  },
  deleteWorkoutLog(id) { return db.delete(workoutLogs).where(eq(workoutLogs.id, id)).run().changes > 0; },

  // ── Goals ─────────────────────────────────────────────────────────────────────
  getAllGoalsWithProjects(userId: number) {
    const gs = db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.title)).all();
    // Projects already filtered by userId, so only include goal-linked projects (goalId != null)
    const ps = db.select().from(projects).where(eq(projects.userId, userId)).orderBy(asc(projects.sortOrder)).all().filter((p) => p.goalId != null);
    const pts = db.select().from(projectTasks).orderBy(asc(projectTasks.sortOrder)).all();
    return gs.map((g) => ({
      ...g,
      projects: ps
        .filter((p) => p.goalId === g.id)
        .map((p) => ({ ...p, tasks: pts.filter((t) => t.projectId === p.id) })),
    }));
  },
  getAllGoalsWithTasks(userId: number) {
    const gs = db.select().from(goals).where(eq(goals.userId, userId)).orderBy(asc(goals.title)).all();
    const gts = db.select().from(goalTasks).orderBy(asc(goalTasks.sortOrder)).all();
    return gs.map((g) => ({ ...g, tasks: gts.filter((t) => t.goalId === g.id) }));
  },
  createGoal(data, userId) { return db.insert(goals).values({ ...data, userId }).returning().get(); },
  updateGoal(id, data) {
    if (!db.select().from(goals).where(eq(goals.id, id)).get()) return undefined;
    return db.update(goals).set(data).where(eq(goals.id, id)).returning().get();
  },
  deleteGoal(id) {
    const ps = db.select().from(projects).where(eq(projects.goalId, id)).all();
    ps.forEach((p) => sqlite.exec(`DELETE FROM project_tasks WHERE project_id = ${p.id}`));
    sqlite.exec(`DELETE FROM projects WHERE goal_id = ${id}`);
    sqlite.exec(`DELETE FROM goal_tasks WHERE goal_id = ${id}`);
    return db.delete(goals).where(eq(goals.id, id)).run().changes > 0;
  },

  // ── Goal Tasks (legacy) ───────────────────────────────────────────────────────
  createGoalTask(data) { return db.insert(goalTasks).values(data).returning().get(); },
  updateGoalTask(id, data) {
    if (!db.select().from(goalTasks).where(eq(goalTasks.id, id)).get()) return undefined;
    return db.update(goalTasks).set(data).where(eq(goalTasks.id, id)).returning().get();
  },
  deleteGoalTask(id) { return db.delete(goalTasks).where(eq(goalTasks.id, id)).run().changes > 0; },

  // ── Projects ──────────────────────────────────────────────────────────────────
  getProjectsForGoal(goalId) {
    const ps = db.select().from(projects).where(eq(projects.goalId, goalId)).orderBy(asc(projects.sortOrder)).all();
    const pts = db.select().from(projectTasks).orderBy(asc(projectTasks.sortOrder)).all();
    return ps.map((p) => ({ ...p, tasks: pts.filter((t) => t.projectId === p.id) }));
  },
  getStandaloneProjects(userId: number) {
    // goalId IS NULL and userId matches — filter in JS since drizzle isNull may vary by version
    const ps = db.select().from(projects).where(eq(projects.userId, userId)).orderBy(asc(projects.sortOrder)).all().filter((p) => p.goalId == null);
    ps.sort((a, b) => a.sortOrder - b.sortOrder);
    const pts = db.select().from(projectTasks).orderBy(asc(projectTasks.sortOrder)).all();
    return ps.map((p) => ({ ...p, tasks: pts.filter((t) => t.projectId === p.id) }));
  },
  createProject(data, userId) { return db.insert(projects).values({ ...data, userId }).returning().get(); },
  updateProject(id, data) {
    if (!db.select().from(projects).where(eq(projects.id, id)).get()) return undefined;
    return db.update(projects).set(data).where(eq(projects.id, id)).returning().get();
  },
  deleteProject(id) {
    sqlite.exec(`DELETE FROM project_tasks WHERE project_id = ${id}`);
    return db.delete(projects).where(eq(projects.id, id)).run().changes > 0;
  },

  // ── Project Tasks ─────────────────────────────────────────────────────────────
  createProjectTask(data) { return db.insert(projectTasks).values(data).returning().get(); },
  updateProjectTask(id, data) {
    if (!db.select().from(projectTasks).where(eq(projectTasks.id, id)).get()) return undefined;
    return db.update(projectTasks).set(data).where(eq(projectTasks.id, id)).returning().get();
  },
  deleteProjectTask(id) { return db.delete(projectTasks).where(eq(projectTasks.id, id)).run().changes > 0; },

  // ── General Tasks ──────────────────────────────────────────────────────────────
  getAllGeneralTasks(userId: number) { return db.select().from(generalTasks).where(eq(generalTasks.userId, userId)).orderBy(asc(generalTasks.sortOrder)).all(); },
  createGeneralTask(data, userId) { return db.insert(generalTasks).values({ ...data, userId }).returning().get(); },
  updateGeneralTask(id, data) {
    if (!db.select().from(generalTasks).where(eq(generalTasks.id, id)).get()) return undefined;
    return db.update(generalTasks).set(data).where(eq(generalTasks.id, id)).returning().get();
  },
  deleteGeneralTask(id) { return db.delete(generalTasks).where(eq(generalTasks.id, id)).run().changes > 0; },

  // ── Recipes ──────────────────────────────────────────────────────────────
  getAllRecipes(userId: number) { return db.select().from(recipes).where(eq(recipes.userId, userId)).orderBy(asc(recipes.name)).all(); },
  createRecipe(data: InsertRecipe, userId: number) { return db.insert(recipes).values({ ...data, userId }).returning().get(); },
  updateRecipe(id: number, data: Partial<InsertRecipe>) {
    if (!db.select().from(recipes).where(eq(recipes.id, id)).get()) return undefined;
    return db.update(recipes).set(data).where(eq(recipes.id, id)).returning().get();
  },
  deleteRecipe(id: number) {
    sqlite.exec(`DELETE FROM week_plan WHERE recipe_id = ${id}`);
    return db.delete(recipes).where(eq(recipes.id, id)).run().changes > 0;
  },

  // ── Week Plan ─────────────────────────────────────────────────────────
  getWeekPlan(weekStart: string, userId: number) {
    return db.select().from(weekPlan).where(eq(weekPlan.weekStart, weekStart)).where(eq(weekPlan.userId, userId)).all();
  },
  assignRecipe(data: InsertWeekPlan, userId: number) { return db.insert(weekPlan).values({ ...data, userId }).returning().get(); },
  removeWeekAssignment(id: number) { return db.delete(weekPlan).where(eq(weekPlan.id, id)).run().changes > 0; },

  // ── Grocery Checks ────────────────────────────────────────────────────────
  getGroceryChecks(weekStart: string, userId: number) {
    return db.select().from(groceryChecks).where(eq(groceryChecks.weekStart, weekStart)).where(eq(groceryChecks.userId, userId)).all();
  },
  upsertGroceryCheck(weekStart: string, itemKey: string, checked: boolean, userId: number) {
    const existing = db.select().from(groceryChecks)
      .where(eq(groceryChecks.weekStart, weekStart))
      .where(eq(groceryChecks.userId, userId)).all()
      .find(g => g.itemKey === itemKey);
    if (existing) {
      return db.update(groceryChecks).set({ checked })
        .where(eq(groceryChecks.id, existing.id)).returning().get();
    }
    return db.insert(groceryChecks).values({ weekStart, itemKey, checked, userId }).returning().get();
  },

  // ── Relationship Groups ───────────────────────────────────────────────────────
  getAllGroups(userId: number) { return db.select().from(relationshipGroups).where(eq(relationshipGroups.userId, userId)).orderBy(asc(relationshipGroups.sortOrder)).all(); },
  createGroup(data, userId) { return db.insert(relationshipGroups).values({ ...data, userId }).returning().get(); },
  updateGroup(id, data) {
    if (!db.select().from(relationshipGroups).where(eq(relationshipGroups.id, id)).get()) return undefined;
    return db.update(relationshipGroups).set(data).where(eq(relationshipGroups.id, id)).returning().get();
  },
  deleteGroup(id) {
    // Ungroup people belonging to this group
    sqlite.exec(`UPDATE people SET group_id = NULL WHERE group_id = ${id}`);
    return db.delete(relationshipGroups).where(eq(relationshipGroups.id, id)).run().changes > 0;
  },

  // ── People ────────────────────────────────────────────────────────────────────
  getAllPeople(userId: number): PersonWithSpouse[] {
    const ps = db.select().from(people).where(eq(people.userId, userId)).orderBy(asc(people.sortOrder)).all();
    // Attach spouse details
    return ps.map((p) => ({
      ...p,
      spouse: p.spouseId ? (ps.find((s) => s.id === p.spouseId) ?? null) : null,
    }));
  },
  createPerson(data, userId) { return db.insert(people).values({ ...data, userId }).returning().get(); },
  updatePerson(id, data) {
    if (!db.select().from(people).where(eq(people.id, id)).get()) return undefined;
    return db.update(people).set(data).where(eq(people.id, id)).returning().get();
  },
  deletePerson(id) {
    // Remove spouse links pointing to this person
    sqlite.exec(`UPDATE people SET spouse_id = NULL WHERE spouse_id = ${id}`);
    // Delete linked birthday event if any
    const p = db.select().from(people).where(eq(people.id, id)).get();
    if (p?.birthdayEventId) {
      sqlite.exec(`DELETE FROM tasks WHERE event_id = ${p.birthdayEventId}`);
      sqlite.exec(`DELETE FROM events WHERE id = ${p.birthdayEventId}`);
    }
    return db.delete(people).where(eq(people.id, id)).run().changes > 0;
  },

  // ── Movies ────────────────────────────────────────────────────────────────────────
  getAllMovies(userId: number) { return db.select().from(movies).where(eq(movies.userId, userId)).orderBy(asc(movies.title)).all(); },
  createMovie(data, userId) { return db.insert(movies).values({ ...data, userId }).returning().get(); },
  updateMovie(id, data) {
    if (!db.select().from(movies).where(eq(movies.id, id)).get()) return undefined;
    return db.update(movies).set(data).where(eq(movies.id, id)).returning().get();
  },
  deleteMovie(id) { return db.delete(movies).where(eq(movies.id, id)).run().changes > 0; },

  // ── Budget Categories ──────────────────────────────────────────────────────────
  getAllBudgetCategories(userId: number) { return db.select().from(budgetCategories).where(eq(budgetCategories.userId, userId)).orderBy(asc(budgetCategories.sortOrder)).all(); },
  createBudgetCategory(data, userId) { return db.insert(budgetCategories).values({ ...data, userId }).returning().get(); },
  updateBudgetCategory(id, data) {
    if (!db.select().from(budgetCategories).where(eq(budgetCategories.id, id)).get()) return undefined;
    return db.update(budgetCategories).set(data).where(eq(budgetCategories.id, id)).returning().get();
  },
  deleteBudgetCategory(id) { return db.delete(budgetCategories).where(eq(budgetCategories.id, id)).run().changes > 0; },

  // ── Transactions ───────────────────────────────────────────────────────────────────
  getAllTransactions(userId: number) { return db.select().from(transactions).where(eq(transactions.userId, userId)).orderBy(desc(transactions.date)).all(); },
  createTransaction(data, userId) { return db.insert(transactions).values({ ...data, userId }).returning().get(); },
  updateTransaction(id, data) {
    if (!db.select().from(transactions).where(eq(transactions.id, id)).get()) return undefined;
    return db.update(transactions).set(data).where(eq(transactions.id, id)).returning().get();
  },
  deleteTransaction(id) { return db.delete(transactions).where(eq(transactions.id, id)).run().changes > 0; },

  // ── Subscriptions ──────────────────────────────────────────────────────────────────
  getAllSubscriptions(userId: number) { return db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(asc(subscriptions.name)).all(); },
  createSubscription(data, userId) { return db.insert(subscriptions).values({ ...data, userId }).returning().get(); },
  updateSubscription(id, data) {
    if (!db.select().from(subscriptions).where(eq(subscriptions.id, id)).get()) return undefined;
    return db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning().get();
  },
  deleteSubscription(id) { return db.delete(subscriptions).where(eq(subscriptions.id, id)).run().changes > 0; },

  // ── Receipts ────────────────────────────────────────────────────────────────────────
  getAllReceipts(userId: number) { return db.select().from(receipts).where(eq(receipts.userId, userId)).orderBy(desc(receipts.uploadDate)).all(); },
  createReceiptRecord(data, userId) { return db.insert(receipts).values({ ...data, userId }).returning().get(); },
  updateReceiptRecord(id, data) {
    if (!db.select().from(receipts).where(eq(receipts.id, id)).get()) return undefined;
    return db.update(receipts).set(data).where(eq(receipts.id, id)).returning().get();
  },
  deleteReceiptRecord(id) { return db.delete(receipts).where(eq(receipts.id, id)).run().changes > 0; },

  // ── Nav Prefs ───────────────────────────────────────────────────────────────────────
  getNavPrefs(userId: number): NavPref[] {
    const row = db.select().from(navPrefs).where(eq(navPrefs.userId, userId)).limit(1).get();
    if (!row) return [];
    try { return JSON.parse(row.prefsJson) as NavPref[]; } catch { return []; }
  },
  saveNavPrefs(userId: number, prefs: NavPref[]) {
    const row = db.select().from(navPrefs).where(eq(navPrefs.userId, userId)).limit(1).get();
    const json = JSON.stringify(prefs);
    if (row) {
      db.update(navPrefs).set({ prefsJson: json }).where(eq(navPrefs.id, row.id)).run();
    } else {
      db.insert(navPrefs).values({ prefsJson: json, userId }).run();
    }
  },

  // ── Users ────────────────────────────────────────────────────────────────
  upsertUser({ googleId, email, name, avatarUrl }) {
    const existing = db.select().from(users).where(eq(users.googleId, googleId)).get();
    if (existing) {
      return db.update(users).set({ email, name, avatarUrl }).where(eq(users.googleId, googleId)).returning().get();
    }
    return db.insert(users).values({ googleId, email, name, avatarUrl, createdAt: new Date().toISOString() }).returning().get();
  },
  getUserById(id) {
    return db.select().from(users).where(eq(users.id, id)).get();
  },
};

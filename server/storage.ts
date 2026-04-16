import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { events, tasks, recipes, weekPlan, groceryChecks, books, readingSessions, workoutTemplates, workoutLogs, goals, goalTasks, projects, projectTasks, generalTasks, relationshipGroups, people, movies, budgetCategories, transactions, subscriptions, receipts, navPrefs } from "@shared/schema";
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
} from "@shared/schema";
import { eq, asc, desc } from "drizzle-orm";

const sqlite = new Database("planner.db");
const db = drizzle(sqlite);

// ── DDL ────────────────────────────────────────────────────────────────────────
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    day_index INTEGER NOT NULL,
    recipe_id INTEGER NOT NULL,
    week_start TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS grocery_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL,
    item_key TEXT NOT NULL,
    checked INTEGER NOT NULL DEFAULT 0
  );
`);

// Relationship tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS relationship_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    name TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    budget_amount REAL NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    prefs_json TEXT NOT NULL DEFAULT '[]'
  );
`);

// Safe migrations for existing DBs
const migrations = [
  `ALTER TABLE events ADD COLUMN recurring TEXT NOT NULL DEFAULT 'none'`,
];
migrations.forEach((sql) => { try { sqlite.exec(sql); } catch {} });

// ── STORAGE INTERFACE ──────────────────────────────────────────────────────────
export interface IStorage {
  // Events
  getAllEventsWithTasks(): EventWithTasks[];
  createEvent(data: InsertEvent): Event;
  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): boolean;
  // Tasks
  createTask(data: InsertTask): Task;
  updateTask(id: number, data: Partial<InsertTask>): Task | undefined;
  deleteTask(id: number): boolean;
  // Books
  getAllBooks(): Book[];
  getAllBooksWithSessions(): BookWithSessions[];
  createBook(data: InsertBook): Book;
  updateBook(id: number, data: Partial<InsertBook>): Book | undefined;
  deleteBook(id: number): boolean;
  // Reading Sessions
  getAllReadingSessions(): ReadingSession[];
  createReadingSession(data: InsertReadingSession): ReadingSession;
  updateReadingSession(id: number, data: Partial<InsertReadingSession>): ReadingSession | undefined;
  deleteReadingSession(id: number): boolean;
  // Workout Templates
  getAllWorkoutTemplates(): WorkoutTemplate[];
  createWorkoutTemplate(data: InsertWorkoutTemplate): WorkoutTemplate;
  updateWorkoutTemplate(id: number, data: Partial<InsertWorkoutTemplate>): WorkoutTemplate | undefined;
  deleteWorkoutTemplate(id: number): boolean;
  // Workout Logs
  getAllWorkoutLogs(): WorkoutLog[];
  createWorkoutLog(data: InsertWorkoutLog): WorkoutLog;
  updateWorkoutLog(id: number, data: Partial<InsertWorkoutLog>): WorkoutLog | undefined;
  deleteWorkoutLog(id: number): boolean;
  // Goals
  getAllGoalsWithProjects(): GoalWithProjects[];
  getAllGoalsWithTasks(): GoalWithTasks[]; // legacy
  createGoal(data: InsertGoal): Goal;
  updateGoal(id: number, data: Partial<InsertGoal>): Goal | undefined;
  deleteGoal(id: number): boolean;
  // Goal Tasks (legacy)
  createGoalTask(data: InsertGoalTask): GoalTask;
  updateGoalTask(id: number, data: Partial<InsertGoalTask>): GoalTask | undefined;
  deleteGoalTask(id: number): boolean;
  // Projects
  getProjectsForGoal(goalId: number): ProjectWithTasks[];
  getStandaloneProjects(): ProjectWithTasks[];
  createProject(data: InsertProject): Project;
  updateProject(id: number, data: Partial<InsertProject>): Project | undefined;
  deleteProject(id: number): boolean;
  // Project Tasks
  createProjectTask(data: InsertProjectTask): ProjectTask;
  updateProjectTask(id: number, data: Partial<InsertProjectTask>): ProjectTask | undefined;
  deleteProjectTask(id: number): boolean;
  // General Tasks
  getAllGeneralTasks(): GeneralTask[];
  createGeneralTask(data: InsertGeneralTask): GeneralTask;
  updateGeneralTask(id: number, data: Partial<InsertGeneralTask>): GeneralTask | undefined;
  deleteGeneralTask(id: number): boolean;
  // Recipes
  getAllRecipes(): Recipe[];
  createRecipe(data: InsertRecipe): Recipe;
  updateRecipe(id: number, data: Partial<InsertRecipe>): Recipe | undefined;
  deleteRecipe(id: number): boolean;
  // Week Plan
  getWeekPlan(weekStart: string): WeekPlan[];
  assignRecipe(data: InsertWeekPlan): WeekPlan;
  removeWeekAssignment(id: number): boolean;
  // Grocery Checks
  getGroceryChecks(weekStart: string): GroceryCheck[];
  upsertGroceryCheck(weekStart: string, itemKey: string, checked: boolean): GroceryCheck;
  // Relationship Groups
  getAllGroups(): RelationshipGroup[];
  createGroup(data: InsertRelationshipGroup): RelationshipGroup;
  updateGroup(id: number, data: Partial<InsertRelationshipGroup>): RelationshipGroup | undefined;
  deleteGroup(id: number): boolean;
  // People
  getAllPeople(): PersonWithSpouse[];
  createPerson(data: InsertPerson): Person;
  updatePerson(id: number, data: Partial<InsertPerson>): Person | undefined;
  deletePerson(id: number): boolean;
  // Movies
  getAllMovies(): Movie[];
  createMovie(data: InsertMovie): Movie;
  updateMovie(id: number, data: Partial<InsertMovie>): Movie | undefined;
  deleteMovie(id: number): boolean;
  // Budget Categories
  getAllBudgetCategories(): BudgetCategory[];
  createBudgetCategory(data: InsertBudgetCategory): BudgetCategory;
  updateBudgetCategory(id: number, data: Partial<InsertBudgetCategory>): BudgetCategory | undefined;
  deleteBudgetCategory(id: number): boolean;
  // Transactions
  getAllTransactions(): Transaction[];
  createTransaction(data: InsertTransaction): Transaction;
  updateTransaction(id: number, data: Partial<InsertTransaction>): Transaction | undefined;
  deleteTransaction(id: number): boolean;
  // Subscriptions
  getAllSubscriptions(): Subscription[];
  createSubscription(data: InsertSubscription): Subscription;
  updateSubscription(id: number, data: Partial<InsertSubscription>): Subscription | undefined;
  deleteSubscription(id: number): boolean;
  // Receipts
  getAllReceipts(): Receipt[];
  createReceiptRecord(data: InsertReceipt): Receipt;
  updateReceiptRecord(id: number, data: Partial<InsertReceipt>): Receipt | undefined;
  deleteReceiptRecord(id: number): boolean;
  // Nav Prefs
  getNavPrefs(): NavPref[];
  saveNavPrefs(prefs: NavPref[]): void;
}

export const storage: IStorage = {
  // ── Events ──────────────────────────────────────────────────────────────────
  getAllEventsWithTasks() {
    const evs = db.select().from(events).orderBy(asc(events.date)).all();
    const tks = db.select().from(tasks).orderBy(asc(tasks.sortOrder)).all();
    return evs.map((e) => ({ ...e, tasks: tks.filter((t) => t.eventId === e.id) }));
  },
  createEvent(data) { return db.insert(events).values(data).returning().get(); },
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
  getAllBooks() { return db.select().from(books).orderBy(asc(books.title)).all(); },
  getAllBooksWithSessions() {
    const bs = db.select().from(books).orderBy(asc(books.title)).all();
    const ss = db.select().from(readingSessions).orderBy(desc(readingSessions.date)).all();
    return bs.map((b) => ({ ...b, sessions: ss.filter((s) => s.bookId === b.id) }));
  },
  createBook(data) { return db.insert(books).values(data).returning().get(); },
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
  getAllWorkoutTemplates() { return db.select().from(workoutTemplates).orderBy(asc(workoutTemplates.name)).all(); },
  createWorkoutTemplate(data) { return db.insert(workoutTemplates).values(data).returning().get(); },
  updateWorkoutTemplate(id, data) {
    if (!db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id)).get()) return undefined;
    return db.update(workoutTemplates).set(data).where(eq(workoutTemplates.id, id)).returning().get();
  },
  deleteWorkoutTemplate(id) { return db.delete(workoutTemplates).where(eq(workoutTemplates.id, id)).run().changes > 0; },

  // ── Workout Logs ──────────────────────────────────────────────────────────────
  getAllWorkoutLogs() { return db.select().from(workoutLogs).orderBy(desc(workoutLogs.date)).all(); },
  createWorkoutLog(data) { return db.insert(workoutLogs).values(data).returning().get(); },
  updateWorkoutLog(id, data) {
    if (!db.select().from(workoutLogs).where(eq(workoutLogs.id, id)).get()) return undefined;
    return db.update(workoutLogs).set(data).where(eq(workoutLogs.id, id)).returning().get();
  },
  deleteWorkoutLog(id) { return db.delete(workoutLogs).where(eq(workoutLogs.id, id)).run().changes > 0; },

  // ── Goals ─────────────────────────────────────────────────────────────────────
  getAllGoalsWithProjects() {
    const gs = db.select().from(goals).orderBy(asc(goals.title)).all();
    // Only include goal-linked projects (goalId != null)
    const ps = db.select().from(projects).orderBy(asc(projects.sortOrder)).all().filter((p) => p.goalId != null);
    const pts = db.select().from(projectTasks).orderBy(asc(projectTasks.sortOrder)).all();
    return gs.map((g) => ({
      ...g,
      projects: ps
        .filter((p) => p.goalId === g.id)
        .map((p) => ({ ...p, tasks: pts.filter((t) => t.projectId === p.id) })),
    }));
  },
  getAllGoalsWithTasks() {
    const gs = db.select().from(goals).orderBy(asc(goals.title)).all();
    const gts = db.select().from(goalTasks).orderBy(asc(goalTasks.sortOrder)).all();
    return gs.map((g) => ({ ...g, tasks: gts.filter((t) => t.goalId === g.id) }));
  },
  createGoal(data) { return db.insert(goals).values(data).returning().get(); },
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
  getStandaloneProjects() {
    // goalId IS NULL — filter in JS since drizzle isNull may vary by version
    const ps = db.select().from(projects).orderBy(asc(projects.sortOrder)).all().filter((p) => p.goalId == null);
    ps.sort((a, b) => a.sortOrder - b.sortOrder);
    const pts = db.select().from(projectTasks).orderBy(asc(projectTasks.sortOrder)).all();
    return ps.map((p) => ({ ...p, tasks: pts.filter((t) => t.projectId === p.id) }));
  },
  createProject(data) { return db.insert(projects).values(data).returning().get(); },
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
  getAllGeneralTasks() { return db.select().from(generalTasks).orderBy(asc(generalTasks.sortOrder)).all(); },
  createGeneralTask(data) { return db.insert(generalTasks).values(data).returning().get(); },
  updateGeneralTask(id, data) {
    if (!db.select().from(generalTasks).where(eq(generalTasks.id, id)).get()) return undefined;
    return db.update(generalTasks).set(data).where(eq(generalTasks.id, id)).returning().get();
  },
  deleteGeneralTask(id) { return db.delete(generalTasks).where(eq(generalTasks.id, id)).run().changes > 0; },

  // ── Recipes ──────────────────────────────────────────────────────────────────
  getAllRecipes() { return db.select().from(recipes).orderBy(asc(recipes.name)).all(); },
  createRecipe(data: InsertRecipe) { return db.insert(recipes).values(data).returning().get(); },
  updateRecipe(id: number, data: Partial<InsertRecipe>) {
    if (!db.select().from(recipes).where(eq(recipes.id, id)).get()) return undefined;
    return db.update(recipes).set(data).where(eq(recipes.id, id)).returning().get();
  },
  deleteRecipe(id: number) {
    sqlite.exec(`DELETE FROM week_plan WHERE recipe_id = ${id}`);
    return db.delete(recipes).where(eq(recipes.id, id)).run().changes > 0;
  },

  // ── Week Plan ─────────────────────────────────────────────────────────────
  getWeekPlan(weekStart: string) {
    return db.select().from(weekPlan).where(eq(weekPlan.weekStart, weekStart)).all();
  },
  assignRecipe(data: InsertWeekPlan) { return db.insert(weekPlan).values(data).returning().get(); },
  removeWeekAssignment(id: number) { return db.delete(weekPlan).where(eq(weekPlan.id, id)).run().changes > 0; },

  // ── Grocery Checks ────────────────────────────────────────────────────────
  getGroceryChecks(weekStart: string) {
    return db.select().from(groceryChecks).where(eq(groceryChecks.weekStart, weekStart)).all();
  },
  upsertGroceryCheck(weekStart: string, itemKey: string, checked: boolean) {
    const existing = db.select().from(groceryChecks)
      .where(eq(groceryChecks.weekStart, weekStart)).all()
      .find(g => g.itemKey === itemKey);
    if (existing) {
      return db.update(groceryChecks).set({ checked })
        .where(eq(groceryChecks.id, existing.id)).returning().get();
    }
    return db.insert(groceryChecks).values({ weekStart, itemKey, checked }).returning().get();
  },

  // ── Relationship Groups ───────────────────────────────────────────────────────
  getAllGroups() { return db.select().from(relationshipGroups).orderBy(asc(relationshipGroups.sortOrder)).all(); },
  createGroup(data) { return db.insert(relationshipGroups).values(data).returning().get(); },
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
  getAllPeople(): PersonWithSpouse[] {
    const ps = db.select().from(people).orderBy(asc(people.sortOrder)).all();
    // Attach spouse details
    return ps.map((p) => ({
      ...p,
      spouse: p.spouseId ? (ps.find((s) => s.id === p.spouseId) ?? null) : null,
    }));
  },
  createPerson(data) { return db.insert(people).values(data).returning().get(); },
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
  getAllMovies() { return db.select().from(movies).orderBy(asc(movies.title)).all(); },
  createMovie(data) { return db.insert(movies).values(data).returning().get(); },
  updateMovie(id, data) {
    if (!db.select().from(movies).where(eq(movies.id, id)).get()) return undefined;
    return db.update(movies).set(data).where(eq(movies.id, id)).returning().get();
  },
  deleteMovie(id) { return db.delete(movies).where(eq(movies.id, id)).run().changes > 0; },

  // ── Budget Categories ──────────────────────────────────────────────────────────
  getAllBudgetCategories() { return db.select().from(budgetCategories).orderBy(asc(budgetCategories.sortOrder)).all(); },
  createBudgetCategory(data) { return db.insert(budgetCategories).values(data).returning().get(); },
  updateBudgetCategory(id, data) {
    if (!db.select().from(budgetCategories).where(eq(budgetCategories.id, id)).get()) return undefined;
    return db.update(budgetCategories).set(data).where(eq(budgetCategories.id, id)).returning().get();
  },
  deleteBudgetCategory(id) { return db.delete(budgetCategories).where(eq(budgetCategories.id, id)).run().changes > 0; },

  // ── Transactions ───────────────────────────────────────────────────────────────────
  getAllTransactions() { return db.select().from(transactions).orderBy(desc(transactions.date)).all(); },
  createTransaction(data) { return db.insert(transactions).values(data).returning().get(); },
  updateTransaction(id, data) {
    if (!db.select().from(transactions).where(eq(transactions.id, id)).get()) return undefined;
    return db.update(transactions).set(data).where(eq(transactions.id, id)).returning().get();
  },
  deleteTransaction(id) { return db.delete(transactions).where(eq(transactions.id, id)).run().changes > 0; },

  // ── Subscriptions ──────────────────────────────────────────────────────────────────
  getAllSubscriptions() { return db.select().from(subscriptions).orderBy(asc(subscriptions.name)).all(); },
  createSubscription(data) { return db.insert(subscriptions).values(data).returning().get(); },
  updateSubscription(id, data) {
    if (!db.select().from(subscriptions).where(eq(subscriptions.id, id)).get()) return undefined;
    return db.update(subscriptions).set(data).where(eq(subscriptions.id, id)).returning().get();
  },
  deleteSubscription(id) { return db.delete(subscriptions).where(eq(subscriptions.id, id)).run().changes > 0; },

  // ── Receipts ────────────────────────────────────────────────────────────────────────
  getAllReceipts() { return db.select().from(receipts).orderBy(desc(receipts.uploadDate)).all(); },
  createReceiptRecord(data) { return db.insert(receipts).values(data).returning().get(); },
  updateReceiptRecord(id, data) {
    if (!db.select().from(receipts).where(eq(receipts.id, id)).get()) return undefined;
    return db.update(receipts).set(data).where(eq(receipts.id, id)).returning().get();
  },
  deleteReceiptRecord(id) { return db.delete(receipts).where(eq(receipts.id, id)).run().changes > 0; },

  // ── Nav Prefs ───────────────────────────────────────────────────────────────────────
  getNavPrefs(): NavPref[] {
    const row = db.select().from(navPrefs).limit(1).get();
    if (!row) return [];
    try { return JSON.parse(row.prefsJson) as NavPref[]; } catch { return []; }
  },
  saveNavPrefs(prefs: NavPref[]) {
    const row = db.select().from(navPrefs).limit(1).get();
    const json = JSON.stringify(prefs);
    if (row) {
      db.update(navPrefs).set({ prefsJson: json }).where(eq(navPrefs.id, row.id)).run();
    } else {
      db.insert(navPrefs).values({ prefsJson: json }).run();
    }
  },
};

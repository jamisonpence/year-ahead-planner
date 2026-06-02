import { pgTable, text, integer, real, serial, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ── USERS ─────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  googleId: text("google_id").notNull().unique(),
  passwordHash: text("password_hash"),
  email: text("email").notNull(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  createdAt: text("created_at").notNull(),
  anthropicApiKeyEnc: text("anthropic_api_key_enc"), // AES-256-GCM encrypted, never returned to client
  onboarded: boolean("onboarded").notNull().default(false),
  // Google Calendar integration
  gcalAccessToken: text("gcal_access_token"),
  gcalRefreshToken: text("gcal_refresh_token"),
  gcalTokenExpiry: text("gcal_token_expiry"),
  gcalLastSync: text("gcal_last_sync"),
  // Strava integration
  stravaAccessToken: text("strava_access_token"),
  stravaRefreshToken: text("strava_refresh_token"),
  stravaTokenExpiry: text("strava_token_expiry"),
  stravaAthleteId: text("strava_athlete_id"),
  // LinkedIn integration
  linkedinAccessToken: text("linkedin_access_token"),
  linkedinProfileId: text("linkedin_profile_id"),
  linkedinName: text("linkedin_name"),
  linkedinHeadline: text("linkedin_headline"),
  linkedinAvatarUrl: text("linkedin_avatar_url"),
  linkedinEmail: text("linkedin_email"),
  // Facebook integration
  facebookAccessToken: text("facebook_access_token"),
  facebookUserId: text("facebook_user_id"),
  facebookName: text("facebook_name"),
  facebookEmail: text("facebook_email"),
  facebookAvatarUrl: text("facebook_avatar_url"),
  facebookBirthday: text("facebook_birthday"),
  facebookLocation: text("facebook_location"),
  facebookLastSync: text("facebook_last_sync"),
  // Google Contacts integration (separate from login/GCal OAuth)
  googleContactsAccessToken: text("google_contacts_access_token"),
  googleContactsRefreshToken: text("google_contacts_refresh_token"),
  googleContactsTokenExpiry: text("google_contacts_token_expiry"),
  googleContactsLastSync: text("google_contacts_last_sync"),
});

// ── GOOGLE CONTACTS ───────────────────────────────────────────────────────────
export const googleContacts = pgTable("google_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  resourceName: text("resource_name").notNull(), // e.g. "people/c1234"
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  birthday: text("birthday"),      // YYYY-MM-DD or MM-DD
  avatarUrl: text("avatar_url"),
  company: text("company"),
  importedAt: text("imported_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export type GoogleContact = typeof googleContacts.$inferSelect;

// ── FACEBOOK FRIENDS ──────────────────────────────────────────────────────────
export const facebookFriends = pgTable("facebook_friends", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  fbFriendId: text("fb_friend_id").notNull(),
  name: text("name").notNull(),
  birthday: text("birthday"),          // MM/DD/YYYY or MM/DD from birthday calendar
  birthdayRaw: text("birthday_raw"),   // raw ICS string
  avatarUrl: text("avatar_url"),
  location: text("location"),
  importedAt: text("imported_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export type FacebookFriend = typeof facebookFriends.$inferSelect;

// ── LINKEDIN CONTACTS ─────────────────────────────────────────────────────────
export const linkedinContacts = pgTable("linkedin_contacts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  company: text("company"),
  position: text("position"),
  connectedOn: text("connected_on"),
  importedAt: text("imported_at").notNull(),
});
export type LinkedinContact = typeof linkedinContacts.$inferSelect;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── EVENTS (existing, extended) ───────────────────────────────────────────────
export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  date: text("date").notNull(),
  endDate: text("end_date"),
  category: text("category").notNull().default("other"),
  recurring: text("recurring").notNull().default("none"),
  description: text("description"),
  color: text("color"),
  gcalEventId: text("gcal_event_id"),
});

// ── TASKS (existing, unchanged) ────────────────────────────────────────────────
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  eventId: integer("event_id").notNull(),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── BOOKS ─────────────────────────────────────────────────────────────────────
// status: "backlog" | "current" | "paused" | "finished"
export const books = pgTable("books", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  author: text("author"),
  series: text("series"),
  seriesNumber: integer("series_number"),
  genre: text("genre"),        // comma-separated tags
  status: text("status").notNull().default("backlog"),
  totalPages: integer("total_pages"),
  pagesRead: integer("pages_read").notNull().default(0),
  startDate: text("start_date"),
  targetFinishDate: text("target_finish_date"),
  finishDate: text("finish_date"),
  notes: text("notes"),
  highlights: text("highlights"),
  linkedGoalId: integer("linked_goal_id"),
  coverColor: text("cover_color"),  // for visual card accent
  coverUrl: text("cover_url"),      // thumbnail from Google Books
});

// ── READING SESSIONS ──────────────────────────────────────────────────────────
export const readingSessions = pgTable("reading_sessions", {
  id: serial("id").primaryKey(),
  bookId: integer("book_id").notNull(),
  date: text("date").notNull(),
  pagesRead: integer("pages_read").notNull().default(0),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  // for calendar scheduling (planned vs completed)
  planned: boolean("planned").notNull().default(false),
  completed: boolean("completed").notNull().default(false),
  recurring: text("recurring").notNull().default("none"),
});

// ── WORKOUT TEMPLATES ─────────────────────────────────────────────────────────
// workoutType: "full_body" | "upper" | "lower" | "push" | "pull" | "legs" | "strength" | "custom"
export const workoutTemplates = pgTable("workout_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  workoutType: text("workout_type").notNull().default("custom"),
  scheduledDay: text("scheduled_day"),  // "monday" | "tuesday" etc, or null
  recurring: text("recurring").notNull().default("none"),
  notes: text("notes"),
  linkedGoalId: integer("linked_goal_id"),
  // exercises stored as JSON array: [{name, sets, reps, weight, restSeconds, notes}]
  exercisesJson: text("exercises_json").notNull().default("[]"),
});

// ── WORKOUT LOGS (actual completed sessions) ───────────────────────────────────
export const workoutLogs = pgTable("workout_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  templateId: integer("template_id"),  // null = ad-hoc
  date: text("date").notNull(),
  name: text("name").notNull(),
  workoutType: text("workout_type").notNull().default("custom"),
  durationMinutes: integer("duration_minutes"),
  notes: text("notes"),
  completed: boolean("completed").notNull().default(false),
  // logged exercises: [{name, sets:[{reps,weight,rpe}], isPR, notes}]
  exercisesJson: text("exercises_json").notNull().default("[]"),
  linkedGoalId: integer("linked_goal_id"),
});

// ── GOALS (extended from events, now standalone) ───────────────────────────────
// Goals are stored separately from events for richer linking
export const goals = pgTable("goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  category: text("category").notNull().default("general"),
  // horizon: "this_year" | "next_year" | "3_years" | "5_years" | "someday"
  horizon: text("horizon").notNull().default("this_year"),
  // parent goal — a yearly goal can link up to a 3-year or 5-year goal
  parentGoalId: integer("parent_goal_id"),
  // progressType: "percent" | "count" | "sessions" | "pages" | "books" | "weight" | "boolean"
  progressType: text("progress_type").notNull().default("percent"),
  progressCurrent: real("progress_current").notNull().default(0),
  progressTarget: real("progress_target").notNull().default(100),
  priority: text("priority").notNull().default("medium"), // low | medium | high
  startDate: text("start_date"),
  targetDate: text("target_date"),
  recurring: text("recurring").notNull().default("none"),
  description: text("description"),
  linkedBookId: integer("linked_book_id"),
  linkedTemplateId: integer("linked_template_id"),
  linkedWorkoutPlanId: integer("linked_workout_plan_id"),
  buddyUserId: integer("buddy_user_id"),
});

// ── PROJECTS (optionally linked to a Goal) ──────────────────────────────────
// status: "not_started" | "in_progress" | "done" | "blocked"
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  goalId: integer("goal_id"),  // nullable — null means standalone project
  tripId: integer("trip_id"),   // nullable — links to a trip for prep tasks
  title: text("title").notNull(),
  status: text("status").notNull().default("not_started"),
  dueDate: text("due_date"),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── PROJECT TASKS (children of Projects) ──────────────────────────────────────
export const projectTasks = pgTable("project_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull(),  // always linked to a project
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── PURCHASE LIST ────────────────────────────────────────────────────────────
export const purchaseItems = pgTable("purchase_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  notes: text("notes"),
  price: real("price"),
  url: text("url"),
  priority: text("priority").notNull().default("medium"),
  purchased: boolean("purchased").notNull().default(false),
  linkedTaskId: integer("linked_task_id"),
  category: text("category"),
  createdAt: text("created_at").notNull(),
});
export const insertPurchaseItemSchema = createInsertSchema(purchaseItems).omit({ id: true });
export type InsertPurchaseItem = z.infer<typeof insertPurchaseItemSchema>;
export type PurchaseItem = typeof purchaseItems.$inferSelect;

// ── RECIPES ─────────────────────────────────────────────────────
export const recipes = pgTable("recipes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🍽️"),
  category: text("category"),
  // "main" | "vegetable" | "side" | "sauce" — null = unclassified
  componentType: text("component_type"),
  prepTime: integer("prep_time"),
  cookTime: integer("cook_time"),
  // JSON: [{name: string, qty: string}][]
  ingredientsJson: text("ingredients_json").notNull().default("[]"),
  instructions: text("instructions"),
  imageUrl: text("image_url"),
  nutritionData: text("nutrition_data"),
  servings: integer("servings"),
  tags: text("tags"),            // comma-separated tags
  description: text("description"),
  source: text("source"),
});

// ── Meal Bundles ─────────────────────────────────────────────────────────────
// A saved full-meal combination: e.g. "Steak Night" = Ribeye + Roasted Broccoli + Mashed Potatoes + Chimichurri
export const mealBundles = pgTable("meal_bundles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("🍽️"),
  description: text("description"),
  // JSON: number[] — array of recipe IDs in this bundle
  recipeIdsJson: text("recipe_ids_json").notNull().default("[]"),
});

export const weekPlan = pgTable("week_plan", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  // 0=Sun, 1=Mon ... 6=Sat
  dayIndex: integer("day_index").notNull(),
  recipeId: integer("recipe_id"),   // set for single-recipe assignments
  bundleId: integer("bundle_id"),   // set for bundle assignments
  weekStart: text("week_start").notNull(), // ISO "YYYY-MM-DD" of the Sunday
});

export const groceryChecks = pgTable("grocery_checks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  weekStart: text("week_start").notNull(),
  itemKey: text("item_key").notNull(), // "ingredient_name" lowercase
  checked: boolean("checked").notNull().default(false),
});

export const insertRecipeSchema = createInsertSchema(recipes).omit({ id: true });
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type Recipe = typeof recipes.$inferSelect;

export const insertMealBundleSchema = createInsertSchema(mealBundles).omit({ id: true });
export type InsertMealBundle = z.infer<typeof insertMealBundleSchema>;
export type MealBundle = typeof mealBundles.$inferSelect;

export const insertWeekPlanSchema = createInsertSchema(weekPlan).omit({ id: true });
export type InsertWeekPlan = z.infer<typeof insertWeekPlanSchema>;
export type WeekPlan = typeof weekPlan.$inferSelect;

export const insertGroceryCheckSchema = createInsertSchema(groceryChecks).omit({ id: true });
export type InsertGroceryCheck = z.infer<typeof insertGroceryCheckSchema>;
export type GroceryCheck = typeof groceryChecks.$inferSelect;

export const customGroceryItems = pgTable("custom_grocery_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  weekStart: text("week_start").notNull(),
  name: text("name").notNull(),
  qty: text("qty"),
  category: text("category"),
  checked: boolean("checked").notNull().default(false),
});

export const insertCustomGroceryItemSchema = createInsertSchema(customGroceryItems).omit({ id: true });
export type InsertCustomGroceryItem = z.infer<typeof insertCustomGroceryItemSchema>;
export type CustomGroceryItem = typeof customGroceryItems.$inferSelect;

export type RecipeIngredient = { name: string; qty: string };
export type ComponentType = "main" | "vegetable" | "side" | "sauce" | "dessert" | "baking";

// ── TIMELINE ENTRIES ─────────────────────────────────────────────────────────
export const timelineEntries = pgTable("timeline_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  personIdsJson: text("person_ids_json").notNull().default("[]"), // JSON array of person IDs
  interactionType: text("interaction_type").notNull().default("note"), // call|coffee|email|meal|meeting|networking|note|other|party|text|custom
  customType: text("custom_type"),       // label when interactionType === "custom"
  note: text("note"),
  date: text("date").notNull(),          // ISO date "YYYY-MM-DD"
  createdAt: text("created_at").notNull(),
});
export type TimelineEntry = typeof timelineEntries.$inferSelect;
export const insertTimelineEntrySchema = createInsertSchema(timelineEntries).omit({ id: true });
export type InsertTimelineEntry = z.infer<typeof insertTimelineEntrySchema>;

// ── RELATIONSHIP GROUPS ─────────────────────────────────────────────────────
export const relationshipGroups = pgTable("relationship_groups", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),          // "Daycare", "Hometown", "Austin"
  color: text("color"),                   // optional accent color
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── PEOPLE ───────────────────────────────────────────────────────────────────
export const people = pgTable("people", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  groupId: integer("group_id"),           // nullable — can be ungrouped
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  birthday: text("birthday"),             // ISO date "YYYY-MM-DD"
  notes: text("notes"),
  spouseId: integer("spouse_id"),         // self-ref to another person
  // JSON array of person IDs who are children of this person: [1, 2, 3]
  childrenJson: text("children_json").notNull().default("[]"),
  // linked birthday event id (for syncing)
  birthdayEventId: integer("birthday_event_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  // linked app user id — when set, this person is an app-connected friend
  linkedUserId: integer("linked_user_id"),
  // Keep in touch
  keepInTouchFrequency: text("keep_in_touch_frequency"), // "week"|"2weeks"|"month"|"6weeks"|"3months"|"6months"|"year"|"never"
  lastContactedAt: text("last_contacted_at"),            // ISO date "YYYY-MM-DD"
});

// ── GENERAL TASKS (standalone — not linked to any project or goal) ────────────
export const generalTasks = pgTable("general_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── GOAL TASKS (legacy — keep for migration, now unused in UI) ─────────────────
export const goalTasks = pgTable("goal_tasks", {
  id: serial("id").primaryKey(),
  goalId: integer("goal_id").notNull(),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── MOVIES & SHOWS ────────────────────────────────────────────────────────────
// mediaType: "movie" | "show"
// status: "backlog" | "watching" | "watched" | "finished"
export const movies = pgTable("movies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  mediaType: text("media_type").notNull().default("movie"), // "movie" | "show"
  title: text("title").notNull(),
  year: integer("year"),
  director: text("director"),       // director for movies, creator for shows
  // comma-separated genres e.g. "Action,Thriller"
  genres: text("genres"),
  status: text("status").notNull().default("backlog"), // backlog | watching | watched | finished
  rating: integer("rating"),   // 1-5 stars, null = unrated
  notes: text("notes"),
  // JSON array of custom list names: ["Date Night", "Watch with Kids"]
  listsJson: text("lists_json").notNull().default("[]"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  posterColor: text("poster_color"),   // accent color for card
  streamingOn: text("streaming_on"),  // "Netflix", "HBO", etc.
  // Show-specific
  totalSeasons: integer("total_seasons"),
  currentSeason: integer("current_season"),
  // Video-specific
  videoUrl: text("video_url"),
  // Poster from TMDB
  posterUrl: text("poster_url"),
});

export const insertMovieSchema = createInsertSchema(movies).omit({ id: true });
export type InsertMovie = z.infer<typeof insertMovieSchema>;
export type Movie = typeof movies.$inferSelect;

export const movieLists = pgTable("movie_lists", {
  id:         serial("id").primaryKey(),
  userId:     integer("user_id").notNull(),
  name:       text("name").notNull(),
  visibility: text("visibility").notNull().default("friends"), // "public" | "friends" | "private"
  isRanked:   boolean("is_ranked").notNull().default(false),
  moviesJson: text("movies_json").default("[]"), // ordered array of movie IDs for ranked lists
  createdAt:  text("created_at").notNull(),
});
export type MovieList = typeof movieLists.$inferSelect;

export const movieListMembers = pgTable("movie_list_members", {
  id:          serial("id").primaryKey(),
  listId:      integer("list_id").notNull(),
  userId:      integer("user_id").notNull(),   // the friend given access
  invitedBy:   integer("invited_by").notNull(), // the list owner
  role:        text("role").notNull().default("viewer"), // "viewer" | "collaborator"
  createdAt:   text("created_at").notNull(),
});
export type MovieListMember = typeof movieListMembers.$inferSelect;

// ── MUSIC ─────────────────────────────────────────────────────────────────────
// Artists to explore or that you love
export const musicArtists = pgTable("music_artists", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  genres: text("genres"),           // comma-separated e.g. "Rock,Indie"
  isFavorite: boolean("is_favorite").notNull().default(false),
  notes: text("notes"),
  accentColor: text("accent_color"), // card accent
});

// Songs nested under artists
// status: "want_to_listen" | "listening" | "listened"
export const musicSongs = pgTable("music_songs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  artistId: integer("artist_id").notNull(),
  title: text("title").notNull(),
  album: text("album"),
  genre: text("genre"),             // comma-separated
  year: integer("year"),
  status: text("status").notNull().default("want_to_listen"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  rating: integer("rating"),        // 1–5
  notes: text("notes"),
});

export const insertMusicArtistSchema = createInsertSchema(musicArtists).omit({ id: true });
export type InsertMusicArtist = z.infer<typeof insertMusicArtistSchema>;
export type MusicArtist = typeof musicArtists.$inferSelect;

export const insertMusicSongSchema = createInsertSchema(musicSongs).omit({ id: true });
export type InsertMusicSong = z.infer<typeof insertMusicSongSchema>;
export type MusicSong = typeof musicSongs.$inferSelect;

export type MusicArtistWithSongs = MusicArtist & { songs: MusicSong[] };

// ── BUDGET ────────────────────────────────────────────────────────────────────
// Budget categories for organizing expenses
export const budgetCategories = pgTable("budget_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),   // emoji or lucide icon name
  budgetAmount: real("budget_amount").notNull().default(0),  // monthly budget
  sortOrder: integer("sort_order").notNull().default(0),
});

// Individual income/expense transactions
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  amount: real("amount").notNull(),   // positive = income, negative = expense
  type: text("type").notNull().default("expense"),  // income | expense
  categoryId: integer("category_id"),
  date: text("date").notNull(),
  notes: text("notes"),
  // for recurring transactions
  recurring: text("recurring").notNull().default("none"),  // none | monthly | weekly | yearly
});

// Subscriptions with renewal tracking
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  amount: real("amount").notNull(),
  billingCycle: text("billing_cycle").notNull().default("monthly"), // monthly | yearly | weekly | quarterly
  nextRenewal: text("next_renewal").notNull(),   // ISO date
  categoryId: integer("category_id"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  color: text("color"),
  icon: text("icon"),  // emoji
});

export const insertBudgetCategorySchema = createInsertSchema(budgetCategories).omit({ id: true });
export type InsertBudgetCategory = z.infer<typeof insertBudgetCategorySchema>;
export type BudgetCategory = typeof budgetCategories.$inferSelect;

export const insertTransactionSchema = createInsertSchema(transactions).omit({ id: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactions.$inferSelect;

export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true });
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// ── RECEIPTS ─────────────────────────────────────────────────────────────────
export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  filename: text("filename").notNull(),       // stored filename on disk
  originalName: text("original_name").notNull(), // user's original filename
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadDate: text("upload_date").notNull(),  // ISO date
  categoryId: integer("category_id"),
  transactionId: integer("transaction_id"),   // optional link to a transaction
  notes: text("notes"),
  merchant: text("merchant"),
  amount: real("amount"),                     // manually entered amount on receipt
  receiptDate: text("receipt_date"),          // date printed on receipt
});

export const insertReceiptSchema = createInsertSchema(receipts).omit({ id: true });
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receipts.$inferSelect;

// ── PLANTS ────────────────────────────────────────────────────────────────────
// lightNeeds: "low" | "medium" | "bright_indirect" | "direct"
export const plants = pgTable("plants", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  species: text("species"),
  location: text("location"),
  lightNeeds: text("light_needs").notNull().default("medium"),
  waterFrequencyDays: integer("water_frequency_days").notNull().default(7),
  soilType: text("soil_type"),
  notes: text("notes"),
  lastWatered: text("last_watered"),          // ISO date "YYYY-MM-DD"
  remindersEnabled: boolean("reminders_enabled").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  photoUrl: text("photo_url"),
  // AI-enriched fields (populated by Claude)
  toxicityNotes: text("toxicity_notes"),
  propagationMethods: text("propagation_methods"),
  careDifficulty: text("care_difficulty"), // "easy" | "moderate" | "difficult"
  aiEnriched: boolean("ai_enriched").notNull().default(false),
});

// ── CHORES ────────────────────────────────────────────────────────────────────
// frequency: "daily"|"weekly"|"biweekly"|"monthly"|"quarterly"|"yearly"|"custom"|"as_needed"
export const chores = pgTable("chores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  category: text("category").notNull().default("cleaning"), // cleaning|yard|maintenance|laundry|cooking|other
  frequency: text("frequency").notNull().default("weekly"),
  customFrequencyDays: integer("custom_frequency_days"),     // used when frequency="custom"
  lastCompleted: text("last_completed"),   // ISO date
  nextDue: text("next_due"),               // ISO date
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  priority: text("priority").notNull().default("medium"),    // low|medium|high
  assignee: text("assignee"),              // optional household member name
  tags: text("tags"),                      // comma-separated custom tags
  sortOrder: integer("sort_order").notNull().default(0),
  applianceId: integer("appliance_id"),     // optional link to an appliance
});

// ── HOUSE PROJECTS ────────────────────────────────────────────────────────────
// status: "not_started"|"in_progress"|"done"|"blocked"
export const houseProjects = pgTable("house_projects", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  status: text("status").notNull().default("not_started"),
  priority: text("priority").notNull().default("medium"),
  dueDate: text("due_date"),
  completedDate: text("completed_date"),
  estimatedCost: real("estimated_cost"),
  actualCost: real("actual_cost"),
  contractor: text("contractor"),
  category: text("category").notNull().default("other"),     // repair|renovation|improvement|cleaning|other
  notes: text("notes"),
  tags: text("tags"),                      // comma-separated custom tags
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── HOUSE PROJECT TASKS ───────────────────────────────────────────────────────
export const houseProjectTasks = pgTable("house_project_tasks", {
  id: serial("id").primaryKey(),
  houseProjectId: integer("house_project_id").notNull(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  completed: boolean("completed").notNull().default(false),
  dueDate: text("due_date"),
  priority: text("priority").notNull().default("medium"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── APPLIANCES ────────────────────────────────────────────────────────────────
export const appliances = pgTable("appliances", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  brand: text("brand"),
  model: text("model"),
  serialNumber: text("serial_number"),
  location: text("location"),              // kitchen|bathroom|laundry|garage|bedroom|living_room|other
  purchaseDate: text("purchase_date"),     // ISO date
  purchasePrice: real("purchase_price"),
  warrantyExpiry: text("warranty_expiry"), // ISO date
  lastServiced: text("last_serviced"),     // ISO date
  serviceFrequencyMonths: integer("service_frequency_months"),
  nextServiceDue: text("next_service_due"),// ISO date
  notes: text("notes"),
  tags: text("tags"),                      // comma-separated custom tags
});

// ── SPOTS ─────────────────────────────────────────────────────────────────────
// type: "restaurant"|"bar"|"cafe"|"park"|"trail"|"shop"|"service"|"attraction"|"hotel"|"other"
// status: "want_to_visit"|"visited"|"favorite"
export const spots = pgTable("spots", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  type: text("type").notNull().default("restaurant"),
  address: text("address"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  status: text("status").notNull().default("want_to_visit"),
  rating: integer("rating"),               // 1–5
  notes: text("notes"),
  website: text("website"),
  priceRange: integer("price_range"),      // 1=$, 2=$$, 3=$$$, 4=$$$$
  tags: text("tags"),                      // comma-separated custom tags/filters
  visitedDate: text("visited_date"),       // ISO date
  isFavorite: boolean("is_favorite").notNull().default(false),
  openingHours: text("opening_hours"),
  lat: real("lat"),
  lon: real("lon"),
  folderId: integer("folder_id"),          // optional: assigned to a user folder
});

// ── SPOT FOLDERS ──────────────────────────────────────────────────────────────
export const spotFolders = pgTable("spot_folders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  emoji: text("emoji").notNull().default("📁"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertSpotFolderSchema = createInsertSchema(spotFolders).omit({ id: true });
export type InsertSpotFolder = z.infer<typeof insertSpotFolderSchema>;
export type SpotFolder = typeof spotFolders.$inferSelect;

// ── NAV PREFERENCES ───────────────────────────────────────────────────────────
// Stores user's tab order and visibility as a single JSON row
export const navPrefs = pgTable("nav_prefs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  // JSON: [{path, hidden}] — ordered list
  prefsJson: text("prefs_json").notNull().default("[]"),
});

export type NavPref = { path: string; hidden: boolean };

// ── TAB PRIVACY ───────────────────────────────────────────────────────────────
// Stores which tabs friends can see — default "private" for all
export const tabPrivacy = pgTable("tab_privacy", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  // JSON: [{path, visibility}] where visibility = "private" | "friends"
  settingsJson: text("settings_json").notNull().default("[]"),
});

export type TabPrivacySetting = { path: string; visibility: "private" | "friends" };

// ── INSERT SCHEMAS & TYPES ─────────────────────────────────────────────────────
export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

export const insertBookSchema = createInsertSchema(books).omit({ id: true });
export type InsertBook = z.infer<typeof insertBookSchema>;
export type Book = typeof books.$inferSelect;

export const insertReadingSessionSchema = createInsertSchema(readingSessions).omit({ id: true });
export type InsertReadingSession = z.infer<typeof insertReadingSessionSchema>;
export type ReadingSession = typeof readingSessions.$inferSelect;

export const insertWorkoutTemplateSchema = createInsertSchema(workoutTemplates).omit({ id: true });
export type InsertWorkoutTemplate = z.infer<typeof insertWorkoutTemplateSchema>;
export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;

export const insertWorkoutLogSchema = createInsertSchema(workoutLogs).omit({ id: true });
export type InsertWorkoutLog = z.infer<typeof insertWorkoutLogSchema>;
export type WorkoutLog = typeof workoutLogs.$inferSelect;

// ── WORKOUT PLANS ─────────────────────────────────────────────────────────────
// A named collection of templates arranged into a weekly repeating schedule
export const workoutPlans = pgTable("workout_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  description: text("description"),
  durationWeeks: integer("duration_weeks").notNull().default(4),
  // JSON: [{ dayOfWeek: "monday"|"tuesday"|..., templateId: number, templateName: string }]
  scheduleJson: text("schedule_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  // Goal-oriented fields
  // "strength_pr" | "endurance" | "body_composition" | "general"
  goalType: text("goal_type").notNull().default("general"),
  // strength_pr: { exercise, currentValue, targetValue, unit }
  // endurance: { raceDistance, raceDate, currentDistance, unit }
  // body_composition: { metric, currentValue, targetValue, unit }
  goalMetricJson: text("goal_metric_json"),
  startDate: text("start_date"),
  isActive: boolean("is_active").notNull().default(false),
  // [{ week: number, description: string, targetValue?: number }]
  milestonesJson: text("milestones_json").notNull().default("[]"),
  buddyUserId: integer("buddy_user_id"),
});

export const insertWorkoutPlanSchema = createInsertSchema(workoutPlans).omit({ id: true });
export type InsertWorkoutPlan = z.infer<typeof insertWorkoutPlanSchema>;
export type WorkoutPlan = typeof workoutPlans.$inferSelect;
export type WorkoutPlanDayEntry = { dayOfWeek: string; templateId: number; templateName: string };
export type WorkoutPlanMilestone = { week: number; description: string; targetValue?: number };

// ── WORKOUT SHARES ────────────────────────────────────────────────────────────
// Share a template or plan with a friend
export const workoutShares = pgTable("workout_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  shareType: text("share_type").notNull().default("template"), // "template" | "plan"
  // template: { name, workoutType, exercisesJson, notes }
  // plan: { name, description, durationWeeks, schedule: [{dayOfWeek, templateName, workoutType, exercisesJson}] }
  contentJson: text("content_json").notNull(),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
  isRead: boolean("is_read").notNull().default(false),
});

export const insertWorkoutShareSchema = createInsertSchema(workoutShares).omit({ id: true });
export type InsertWorkoutShare = z.infer<typeof insertWorkoutShareSchema>;
export type WorkoutShare = typeof workoutShares.$inferSelect;
export type WorkoutShareWithUser = WorkoutShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
};

export const insertGoalSchema = createInsertSchema(goals).omit({ id: true });
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type Goal = typeof goals.$inferSelect;

export const insertGoalTaskSchema = createInsertSchema(goalTasks).omit({ id: true });
export type InsertGoalTask = z.infer<typeof insertGoalTaskSchema>;
export type GoalTask = typeof goalTasks.$inferSelect;

export const insertProjectSchema = createInsertSchema(projects).omit({ id: true });
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({ id: true });
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type ProjectTask = typeof projectTasks.$inferSelect;

export const insertGeneralTaskSchema = createInsertSchema(generalTasks).omit({ id: true });
export type InsertGeneralTask = z.infer<typeof insertGeneralTaskSchema>;
export type GeneralTask = typeof generalTasks.$inferSelect;

export const insertRelationshipGroupSchema = createInsertSchema(relationshipGroups).omit({ id: true });
export type InsertRelationshipGroup = z.infer<typeof insertRelationshipGroupSchema>;
export type RelationshipGroup = typeof relationshipGroups.$inferSelect;

export const insertPersonSchema = createInsertSchema(people).omit({ id: true });
export type InsertPerson = z.infer<typeof insertPersonSchema>;
export type Person = typeof people.$inferSelect;

// childrenJson stores an array of child person IDs: number[]
// (Legacy: may also contain [{name, birthday}] objects — handle both gracefully)
export type PersonWithSpouse = Person & { spouse?: Person | null };

export const insertPlantSchema = createInsertSchema(plants).omit({ id: true });
export type InsertPlant = z.infer<typeof insertPlantSchema>;
export type Plant = typeof plants.$inferSelect;

export const insertChoreSchema = createInsertSchema(chores).omit({ id: true });
export type InsertChore = z.infer<typeof insertChoreSchema>;
export type Chore = typeof chores.$inferSelect;

export const insertHouseProjectSchema = createInsertSchema(houseProjects).omit({ id: true });
export type InsertHouseProject = z.infer<typeof insertHouseProjectSchema>;
export type HouseProject = typeof houseProjects.$inferSelect;

export const insertHouseProjectTaskSchema = createInsertSchema(houseProjectTasks).omit({ id: true });
export type InsertHouseProjectTask = z.infer<typeof insertHouseProjectTaskSchema>;
export type HouseProjectTask = typeof houseProjectTasks.$inferSelect;
export type HouseProjectWithTasks = HouseProject & { tasks: HouseProjectTask[] };

export const insertApplianceSchema = createInsertSchema(appliances).omit({ id: true });
export type InsertAppliance = z.infer<typeof insertApplianceSchema>;
export type Appliance = typeof appliances.$inferSelect;

export const insertSpotSchema = createInsertSchema(spots).omit({ id: true });
export type InsertSpot = z.infer<typeof insertSpotSchema>;
export type Spot = typeof spots.$inferSelect;

// ── TRIPS ─────────────────────────────────────────────────────────────────────
export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  destination: text("destination"),
  startDate: text("start_date"),   // YYYY-MM-DD
  endDate: text("end_date"),       // YYYY-MM-DD
  emoji: text("emoji").notNull().default("✈️"),
  notes: text("notes"),
  coverColor: text("cover_color"),
});

export const tripItems = pgTable("trip_items", {
  id: serial("id").primaryKey(),
  tripId: integer("trip_id").notNull(),
  userId: integer("user_id"),
  spotId: integer("spot_id"),       // optional link to an existing Spot
  name: text("name").notNull(),
  address: text("address"),
  date: text("date"),               // YYYY-MM-DD — which day of the trip
  time: text("time"),               // freeform e.g. "9:00 AM", "Morning"
  duration: text("duration"),       // freeform e.g. "2 hours"
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
  type: text("type").default("other"),
  confirmed: boolean("confirmed").notNull().default(false),
});

export const insertTripSchema = createInsertSchema(trips).omit({ id: true });
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof trips.$inferSelect;

export const insertTripItemSchema = createInsertSchema(tripItems).omit({ id: true });
export type InsertTripItem = z.infer<typeof insertTripItemSchema>;
export type TripItem = typeof tripItems.$inferSelect;

// ── VISITED CITIES ────────────────────────────────────────────────────────────
export const visitedCities = pgTable("visited_cities", {
  id:          serial("id").primaryKey(),
  userId:      integer("user_id").notNull(),
  city:        text("city").notNull(),
  country:     text("country"),
  lat:         real("lat"),
  lon:         real("lon"),
  visitedDate: text("visited_date"),
  notes:       text("notes"),
  createdAt:   text("created_at").notNull(),
});
export type VisitedCity = typeof visitedCities.$inferSelect;

// ── FAMILY TREE ───────────────────────────────────────────────────────────────
export const familyMembers = pgTable("family_members", {
  id:         serial("id").primaryKey(),
  userId:     integer("user_id").notNull(),
  name:       text("name").notNull(),
  gender:     text("gender").default("unknown"),          // male | female | other | unknown
  role:       text("role").notNull().default("other"),
  side:       text("side").default("none"),               // paternal | maternal | none
  birthYear:  integer("birth_year"),
  deathYear:  integer("death_year"),
  birthPlace: text("birth_place"),
  notes:      text("notes"),
  isDeceased: integer("is_deceased").default(0),
  parent1Id:  integer("parent1_id"),                     // explicit parent link (mother/parent A)
  parent2Id:  integer("parent2_id"),                     // explicit parent link (father/parent B)
  createdAt:  text("created_at").notNull(),
});
export type FamilyMember = typeof familyMembers.$inferSelect;

// ── SPOT SHARES ────────────────────────────────────────────────────────────────
export const spotShares = pgTable("spot_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("restaurant"),
  address: text("address"),
  neighborhood: text("neighborhood"),
  city: text("city"),
  website: text("website"),
  priceRange: integer("price_range"),
  tags: text("tags"),
  openingHours: text("opening_hours"),
  rating: integer("rating"),
  spotNotes: text("spot_notes"),    // original spot notes
  notes: text("notes"),             // share message/note
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertSpotShareSchema = createInsertSchema(spotShares).omit({ id: true });
export type InsertSpotShare = z.infer<typeof insertSpotShareSchema>;
export type SpotShare = typeof spotShares.$inferSelect;

export type SpotShareWithUser = SpotShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── KIDS ─────────────────────────────────────────────────────────────────────
export const children = pgTable("children", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  birthDate: text("birth_date"),
  notes: text("notes"),
  accentColor: text("accent_color"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const childMilestones = pgTable("child_milestones", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  childId: integer("child_id").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull().default("other"), // motor|speech|social|academic|health|first|other
  date: text("date"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const childMemories = pgTable("child_memories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  childId: integer("child_id").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  date: text("date"),
  tags: text("tags"), // comma-separated
  mood: text("mood").notNull().default("happy"), // happy|funny|proud|sweet|bittersweet
  sortOrder: integer("sort_order").notNull().default(0),
});

export const childPrepItems = pgTable("child_prep_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  childId: integer("child_id").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull().default("other"), // health|school|activity|party|safety|gear|other
  dueDate: text("due_date"),
  completed: boolean("completed").notNull().default(false),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertChildSchema = createInsertSchema(children).omit({ id: true });
export type InsertChild = z.infer<typeof insertChildSchema>;
export type Child = typeof children.$inferSelect;

export const insertChildMilestoneSchema = createInsertSchema(childMilestones).omit({ id: true });
export type InsertChildMilestone = z.infer<typeof insertChildMilestoneSchema>;
export type ChildMilestone = typeof childMilestones.$inferSelect;

export const insertChildMemorySchema = createInsertSchema(childMemories).omit({ id: true });
export type InsertChildMemory = z.infer<typeof insertChildMemorySchema>;
export type ChildMemory = typeof childMemories.$inferSelect;

export const insertChildPrepItemSchema = createInsertSchema(childPrepItems).omit({ id: true });
export type InsertChildPrepItem = z.infer<typeof insertChildPrepItemSchema>;
export type ChildPrepItem = typeof childPrepItems.$inferSelect;

export type ChildWithDetails = Child & {
  milestones: ChildMilestone[];
  memories: ChildMemory[];
  prepItems: ChildPrepItem[];
};

// ── PETS ───────────────────────────────────────────────────────────────────────
export const pets = pgTable("pets", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  species: text("species").notNull().default("dog"), // dog|cat|rabbit|bird|fish|reptile|other
  breed: text("breed"),
  birthday: text("birthday"), // YYYY-MM-DD
  notes: text("notes"),
  accentColor: text("accent_color"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const petVetVisits = pgTable("pet_vet_visits", {
  id: serial("id").primaryKey(),
  petId: integer("pet_id").notNull(),
  userId: integer("user_id"),
  date: text("date").notNull(), // YYYY-MM-DD
  reason: text("reason").notNull(),
  notes: text("notes"),
  vetName: text("vet_name"),
});

export const insertPetSchema = createInsertSchema(pets).omit({ id: true });
export type InsertPet = z.infer<typeof insertPetSchema>;
export type Pet = typeof pets.$inferSelect;

export const insertPetVetVisitSchema = createInsertSchema(petVetVisits).omit({ id: true });
export type InsertPetVetVisit = z.infer<typeof insertPetVetVisitSchema>;
export type PetVetVisit = typeof petVetVisits.$inferSelect;

export type PetWithVisits = Pet & { vetVisits: PetVetVisit[] };

// ── QUOTES ─────────────────────────────────────────────────────────────────────
export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  text: text("text").notNull(),
  author: text("author"),
  source: text("source"),
  category: text("category").notNull().default("other"), // motivation|wisdom|humor|love|life|philosophy|other
  tags: text("tags"), // comma-separated
  notes: text("notes"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({ id: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotes.$inferSelect;

// ── MANTRAS ────────────────────────────────────────────────────────────────────
export const mantras = pgTable("mantras", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  text: text("text").notNull(),
  intention: text("intention"),            // what this mantra helps with
  category: text("category").notNull().default("other"), // confidence|calm|focus|resilience|gratitude|love|other
  isActive: boolean("is_active").notNull().default(true),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const insertMantraSchema = createInsertSchema(mantras).omit({ id: true });
export type InsertMantra = z.infer<typeof insertMantraSchema>;
export type Mantra = typeof mantras.$inferSelect;

// ── QUOTE SHARES ───────────────────────────────────────────────────────────────
export const quoteShares = pgTable("quote_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  text: text("text").notNull(),
  author: text("author"),
  source: text("source"),
  category: text("category"),
  tags: text("tags"),
  quoteNotes: text("quote_notes"),  // original quote notes
  notes: text("notes"),             // share message
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertQuoteShareSchema = createInsertSchema(quoteShares).omit({ id: true });
export type InsertQuoteShare = z.infer<typeof insertQuoteShareSchema>;
export type QuoteShare = typeof quoteShares.$inferSelect;

export type QuoteShareWithUser = QuoteShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── HOBBIES ───────────────────────────────────────────────────────────────────
// hobbyType: "creative" | "collection" | "outdoor" | "games" | "learning" | "performance"
// skillLevel: "beginner" | "intermediate" | "advanced" | "expert"
// status: "active" | "on_pause" | "retired"
// extraJson stores type-specific fields as JSON
export const hobbies = pgTable("hobbies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  hobbyType: text("hobby_type").notNull().default("creative"),
  category: text("category"),                // e.g. "Photography", "Chess", etc.
  coverUrl: text("cover_url"),
  description: text("description"),
  skillLevel: text("skill_level").notNull().default("beginner"),
  dateStarted: text("date_started"),         // ISO date
  status: text("status").notNull().default("active"),
  notes: text("notes"),
  // Type-specific extra data as JSON — shape varies by hobbyType
  extraJson: text("extra_json").notNull().default("{}"),
  sortOrder: integer("sort_order").notNull().default(0),
  isFavorite: boolean("is_favorite").notNull().default(false),
});

export const insertHobbySchema = createInsertSchema(hobbies).omit({ id: true });
export type InsertHobby = z.infer<typeof insertHobbySchema>;
export type Hobby = typeof hobbies.$inferSelect;

// Type-specific extra field shapes
export type HobbyExtraCollection = {
  itemCount?: number;
  estimatedValue?: string;
  mostPrizedItem?: string;
};
export type HobbyExtraOutdoor = {
  favoriteLocations?: string;
  gearList?: string;
  personalBests?: string;
};
export type HobbyExtraCreative = {
  portfolioUrls?: string[];   // multiple photo URLs
  materialsTools?: string;
  worksInProgress?: string;
};
export type HobbyExtraGames = {
  favoriteGames?: string;
  ratingElo?: string;
  playFrequency?: string;
};
export type HobbyExtraLearning = {
  currentLevel?: string;
  goals?: string;
  resources?: string;
};
export type HobbyExtraPerformance = {
  instrumentStyle?: string;
  yearsPlaying?: number;
  favoritePieces?: string;
};

// ── ART ───────────────────────────────────────────────────────────────────────
export const artPieces = pgTable("art_pieces", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  artistName: text("artist_name"),
  yearCreated: integer("year_created"),
  medium: text("medium").notNull().default("other"), // painting|sculpture|photography|digital|print|drawing|textile|other
  movement: text("movement"),
  whereViewed: text("where_viewed"),
  city: text("city"),
  status: text("status").notNull().default("want_to_see"), // want_to_see|seen|own
  notes: text("notes"),
  rating: integer("rating"),  // 1-5 stars, null = unrated
  isFavorite: boolean("is_favorite").notNull().default(false),
  accentColor: text("accent_color"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertArtPieceSchema = createInsertSchema(artPieces).omit({ id: true });
export type InsertArtPiece = z.infer<typeof insertArtPieceSchema>;
export type ArtPiece = typeof artPieces.$inferSelect;

// ── ART SHARES ─────────────────────────────────────────────────────────────────
export const artShares = pgTable("art_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  title: text("title").notNull(),
  artistName: text("artist_name"),
  yearCreated: integer("year_created"),
  medium: text("medium"),
  movement: text("movement"),
  whereViewed: text("where_viewed"),
  city: text("city"),
  accentColor: text("accent_color"),
  imageUrl: text("image_url"),
  artNotes: text("art_notes"),   // original piece notes
  notes: text("notes"),          // share message
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertArtShareSchema = createInsertSchema(artShares).omit({ id: true });
export type InsertArtShare = z.infer<typeof insertArtShareSchema>;
export type ArtShare = typeof artShares.$inferSelect;

export type ArtShareWithUser = ArtShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── EQUIPMENT ────────────────────────────────────────────────────────────────────
// category: "barbell" | "dumbbell" | "kettlebell" | "resistance_band" | "cable" | "machine" | "pullup_bar" | "bench" | "cardio" | "bodyweight" | "other"
export const equipment = pgTable("equipment", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  notes: text("notes"),
  sortOrder: integer("sort_order").notNull().default(0),
});
export const insertEquipmentSchema = createInsertSchema(equipment).omit({ id: true });
export type InsertEquipment = z.infer<typeof insertEquipmentSchema>;
export type Equipment = typeof equipment.$inferSelect;

// ── JOURNAL ────────────────────────────────────────────────────────────────────

export const journalEntries = pgTable("journal_entries", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  date: text("date").notNull(),
  title: text("title"),
  content: text("content").notNull(),
  mood: text("mood"),
  tags: text("tags"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const insertJournalEntrySchema = createInsertSchema(journalEntries).omit({ id: true });
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type JournalEntry = typeof journalEntries.$inferSelect;

// ── BOOK RECOMMENDATIONS ──────────────────────────────────────────────────────
export const bookRecommendations = pgTable("book_recommendations", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  bookTitle: text("book_title").notNull(),
  bookAuthor: text("book_author"),
  coverUrl: text("cover_url"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertBookRecommendationSchema = createInsertSchema(bookRecommendations).omit({ id: true });
export type InsertBookRecommendation = z.infer<typeof insertBookRecommendationSchema>;
export type BookRecommendation = typeof bookRecommendations.$inferSelect;

export type BookRecommendationWithUser = BookRecommendation & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── MOVIE SHARES ───────────────────────────────────────────────────────────────
export const movieShares = pgTable("movie_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  mediaType: text("media_type").notNull().default("movie"), // movie | show
  title: text("title").notNull(),
  year: integer("year"),
  director: text("director"),
  genres: text("genres"),
  streamingOn: text("streaming_on"),
  posterColor: text("poster_color"),
  posterUrl: text("poster_url"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertMovieShareSchema = createInsertSchema(movieShares).omit({ id: true });
export type InsertMovieShare = z.infer<typeof insertMovieShareSchema>;
export type MovieShare = typeof movieShares.$inferSelect;

export type MovieShareWithUser = MovieShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── RECIPE SHARES ──────────────────────────────────────────────────────────────
export const recipeShares = pgTable("recipe_shares", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  recipeName: text("recipe_name").notNull(),
  recipeEmoji: text("recipe_emoji").notNull().default("🍽️"),
  recipeCategory: text("recipe_category"),
  recipeComponentType: text("recipe_component_type"),
  recipePrepTime: integer("recipe_prep_time"),
  recipeCookTime: integer("recipe_cook_time"),
  recipeServings: integer("recipe_servings"),
  recipeIngredients: text("recipe_ingredients").notNull().default("[]"),
  recipeInstructions: text("recipe_instructions"),
  recipeImageUrl: text("recipe_image_url"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertRecipeShareSchema = createInsertSchema(recipeShares).omit({ id: true });
export type InsertRecipeShare = z.infer<typeof insertRecipeShareSchema>;
export type RecipeShare = typeof recipeShares.$inferSelect;

export type RecipeShareWithUser = RecipeShare & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── MUSIC RECOMMENDATIONS ──────────────────────────────────────────────────────
export const musicRecommendations = pgTable("music_recommendations", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  type: text("type").notNull(), // "artist" | "song"
  artistName: text("artist_name").notNull(),
  songTitle: text("song_title"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
  isDismissed: boolean("is_dismissed").notNull().default(false),
});

export const insertMusicRecommendationSchema = createInsertSchema(musicRecommendations).omit({ id: true });
export type InsertMusicRecommendation = z.infer<typeof insertMusicRecommendationSchema>;
export type MusicRecommendation = typeof musicRecommendations.$inferSelect;

export type MusicRecommendationWithUser = MusicRecommendation & {
  fromUser: { id: number; name: string; avatarUrl: string | null };
  toUser: { id: number; name: string; avatarUrl: string | null };
};

// ── MUSIC COLLECTIONS ─────────────────────────────────────────────────────────
// A named list of songs and/or artists with a cover color/emoji
export const musicCollections = pgTable("music_collections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  name: text("name").notNull(),
  description: text("description"),
  coverColor: text("cover_color").notNull().default("#6366f1"),
  coverEmoji: text("cover_emoji").notNull().default("🎵"),
  sharedWithFriends: boolean("shared_with_friends").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

// Items inside a collection — either a song or an artist
export const musicCollectionItems = pgTable("music_collection_items", {
  id: serial("id").primaryKey(),
  collectionId: integer("collection_id").notNull(),
  itemType: text("item_type").notNull().default("song"), // "song" | "artist"
  songId: integer("song_id"),     // set when itemType = "song"
  artistId: integer("artist_id"), // set when itemType = "artist"
  sortOrder: integer("sort_order").notNull().default(0),
});

export const insertMusicCollectionSchema = createInsertSchema(musicCollections).omit({ id: true });
export type InsertMusicCollection = z.infer<typeof insertMusicCollectionSchema>;
export type MusicCollection = typeof musicCollections.$inferSelect;

export const insertMusicCollectionItemSchema = createInsertSchema(musicCollectionItems).omit({ id: true });
export type InsertMusicCollectionItem = z.infer<typeof insertMusicCollectionItemSchema>;
export type MusicCollectionItem = typeof musicCollectionItems.$inferSelect;

// Enriched item with song/artist data attached
export type MusicCollectionItemWithData = MusicCollectionItem & {
  song?: MusicSong & { artistName: string };
  artist?: MusicArtist;
};
export type MusicCollectionWithItems = MusicCollection & {
  items: MusicCollectionItemWithData[];
};

// ── TAB COLLABORATIONS ────────────────────────────────────────────────────────
// When ownerUserId invites collaboratorUserId to share a tab, collaborator
// reads + writes as if they were the owner for that tab's data.
export const tabCollaborations = pgTable("tab_collaborations", {
  id: serial("id").primaryKey(),
  ownerUserId: integer("owner_user_id").notNull(),
  collaboratorUserId: integer("collaborator_user_id").notNull(),
  tabName: text("tab_name").notNull(),   // e.g. "kids", "housekeeping"
  status: text("status").notNull().default("pending"), // pending | accepted | declined
  createdAt: text("created_at").notNull(),
});

export const insertTabCollaborationSchema = createInsertSchema(tabCollaborations).omit({ id: true });
export type InsertTabCollaboration = z.infer<typeof insertTabCollaborationSchema>;
export type TabCollaboration = typeof tabCollaborations.$inferSelect;

// Enriched version with the "other user" profile attached (relative to viewer)
export type TabCollaborationWithUser = TabCollaboration & {
  otherUser: { id: number; name: string; email: string; avatarUrl: string | null };
  role: "owner" | "collaborator";
};

// ── FRIEND REQUESTS ────────────────────────────────────────────────────────────
export const friendRequests = pgTable("friend_requests", {
  id: serial("id").primaryKey(),
  fromUserId: integer("from_user_id").notNull(),
  toUserId: integer("to_user_id").notNull(),
  status: text("status").notNull().default("pending"), // pending | accepted | declined
  createdAt: text("created_at").notNull(),
});

export const insertFriendRequestSchema = createInsertSchema(friendRequests).omit({ id: true });
export type InsertFriendRequest = z.infer<typeof insertFriendRequestSchema>;
export type FriendRequest = typeof friendRequests.$inferSelect;

// Enriched version with user info attached
export type FriendRequestWithUser = FriendRequest & {
  otherUser: { id: number; name: string; email: string; avatarUrl: string | null };
};

// Public user profile (no sensitive fields)
export type PublicUser = { id: number; name: string; email: string; avatarUrl: string | null };

// ── COMPOSITE TYPES ────────────────────────────────────────────────────────────
export type EventWithTasks = Event & { tasks: Task[] };
export type GoalWithTasks = Goal & { tasks: GoalTask[] }; // legacy
export type ProjectWithTasks = Project & { tasks: ProjectTask[] };
export type GoalWithProjects = Goal & { projects: ProjectWithTasks[] };
export type BookWithSessions = Book & { sessions: ReadingSession[] };
export type WorkoutTemplateWithLogs = WorkoutTemplate & { recentLogs: WorkoutLog[] };

// Exercise types (JSON shapes)
// Each set in a template can have its own reps + weight target
export type TemplateSet = { reps: number; weight: number };
export type TemplateExercise = {
  name: string;
  type?: string;         // "Lifting" | "Run" | "Bike" | "Swim" | "HIIT" | "Yoga" | "Stretch" | custom
  sets: TemplateSet[];   // array of individual sets (used for Lifting/HIIT/Custom)
  distance?: string;     // for cardio types: "5 mi", "10 km", "400 m"
  duration?: string;     // for cardio/endurance types: "30 min", "1:15:00"
  restSeconds: number;
  notes: string;
};
export type LoggedSet = { reps: number; weight: number; rpe?: number };
export type LoggedExercise = {
  name: string;
  type?: string;
  sets: LoggedSet[];
  distance?: string;
  duration?: string;
  isPR: boolean;
  notes: string;
};

// ── FAITH & SPIRITUALITY ──────────────────────────────────────────────────────
// Intentionally tradition-agnostic: free-text tradition, no fixed dropdowns.
// None of these tables participate in shares, recommendations, or public profiles.

export const sacredTexts = pgTable("sacred_texts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  author: text("author"),
  tradition: text("tradition"),
  translationVersion: text("translation_version"),
  status: text("status").notNull().default("Want to Read"), // Reading | Completed | Want to Read
  savedPassages: text("saved_passages").notNull().default("[]"), // JSON: {passage, reference, notes}[]
  personalNotes: text("personal_notes"),
  coverImageUrl: text("cover_image_url"),
  dateAdded: text("date_added").notNull(),
});
export const insertSacredTextSchema = createInsertSchema(sacredTexts).omit({ id: true });
export type InsertSacredText = z.infer<typeof insertSacredTextSchema>;
export type SacredText = typeof sacredTexts.$inferSelect;
export type SavedPassage = { passage: string; reference: string; notes: string };

export const faithPractices = pgTable("faith_practices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  frequency: text("frequency"), // Daily | Weekly | Monthly | Occasionally
  dateStarted: text("date_started"),
  status: text("status").notNull().default("Active"), // Active | Exploring | Paused
  personalNotes: text("personal_notes"),
});
export const insertFaithPracticeSchema = createInsertSchema(faithPractices).omit({ id: true });
export type InsertFaithPractice = z.infer<typeof insertFaithPracticeSchema>;
export type FaithPractice = typeof faithPractices.$inferSelect;

export const sermons = pgTable("sermons", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  title: text("title").notNull(),
  speaker: text("speaker"),
  source: text("source"), // Church | Podcast | YouTube | etc.
  sourceUrl: text("source_url"),
  date: text("date"),
  topic: text("topic"),
  keyTakeaways: text("key_takeaways"),
  personalNotes: text("personal_notes"),
  tags: text("tags").notNull().default("[]"), // JSON string[]
});
export const insertSermonSchema = createInsertSchema(sermons).omit({ id: true });
export type InsertSermon = z.infer<typeof insertSermonSchema>;
export type Sermon = typeof sermons.$inferSelect;

export const prayerItems = pgTable("prayer_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  description: text("description").notNull(),
  dateAdded: text("date_added").notNull(),
  status: text("status").notNull().default("Active"), // Active | Answered
  dateAnswered: text("date_answered"),
  answerReflection: text("answer_reflection"),
  notes: text("notes"),
});
export const insertPrayerItemSchema = createInsertSchema(prayerItems).omit({ id: true });
export type InsertPrayerItem = z.infer<typeof insertPrayerItemSchema>;
export type PrayerItem = typeof prayerItems.$inferSelect;

// ── HEALTH ────────────────────────────────────────────────────────────────────

export const medications = pgTable("medications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull().default("medication"), // medication | supplement | vitamin
  dosage: text("dosage"),
  frequency: text("frequency"), // Once daily | Twice daily | As needed | Weekly | etc.
  timeOfDay: text("time_of_day"), // Morning | Evening | With meals | Bedtime | As needed
  startDate: text("start_date"),
  isActive: boolean("is_active").notNull().default(true),
  prescribedBy: text("prescribed_by"),
  notes: text("notes"),
});
export const insertMedicationSchema = createInsertSchema(medications).omit({ id: true });
export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type Medication = typeof medications.$inferSelect;

export const healthMetrics = pgTable("health_metrics", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(), // Weight | Blood Pressure | Blood Sugar | Heart Rate | custom
  value: text("value").notNull(), // text so "120/80" works for BP
  unit: text("unit"), // lbs | kg | mmHg | mg/dL | bpm | %
  date: text("date").notNull(),
  notes: text("notes"),
});
export const insertHealthMetricSchema = createInsertSchema(healthMetrics).omit({ id: true });
export type InsertHealthMetric = z.infer<typeof insertHealthMetricSchema>;
export type HealthMetric = typeof healthMetrics.$inferSelect;

export const sleepLogs = pgTable("sleep_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: text("date").notNull(), // date of the night (e.g. "2024-01-15")
  hoursSlept: real("hours_slept").notNull(),
  quality: integer("quality"), // 1-5
  bedtime: text("bedtime"), // "10:30 PM"
  wakeTime: text("wake_time"), // "6:30 AM"
  notes: text("notes"),
});
export const insertSleepLogSchema = createInsertSchema(sleepLogs).omit({ id: true });
export type InsertSleepLog = z.infer<typeof insertSleepLogSchema>;
export type SleepLog = typeof sleepLogs.$inferSelect;

export const careProviders = pgTable("care_providers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),          // "Dr. Sarah Kim"
  specialty: text("specialty"),          // "Primary Care" | "Dentist" | "Cardiologist" | etc.
  practice: text("practice"),            // Practice/clinic name
  phone: text("phone"),
  address: text("address"),
  lastAppointment: text("last_appointment"),   // ISO date
  nextAppointment: text("next_appointment"),   // ISO date
  notes: text("notes"),
});
export const insertCareProviderSchema = createInsertSchema(careProviders).omit({ id: true });
export type InsertCareProvider = z.infer<typeof insertCareProviderSchema>;
export type CareProvider = typeof careProviders.$inferSelect;

// ── Politics ───────────────────────────────────────────────────────────────────

export const politicalOfficials = pgTable("political_officials", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  title: text("title"),
  level: text("level"),        // "federal" | "state" | "local"
  party: text("party"),
  district: text("district"),
  stateCode: text("state_code"),   // 2-letter state code for LegiScan lookups
  externalId: text("external_id"), // bioguideId (federal) or LegiScan people_id (state)
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  termEnd: text("term_end"),
  notes: text("notes"),
});
export const insertPoliticalOfficialSchema = createInsertSchema(politicalOfficials).omit({ id: true });
export type InsertPoliticalOfficial = z.infer<typeof insertPoliticalOfficialSchema>;
export type PoliticalOfficial = typeof politicalOfficials.$inferSelect;

export const politicalIssues = pgTable("political_issues", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  topic: text("topic").notNull(),
  category: text("category"),
  position: text("position"),  // "support" | "oppose" | "neutral" | "undecided"
  importance: integer("importance"),  // 1-5
  notes: text("notes"),
});
export const insertPoliticalIssueSchema = createInsertSchema(politicalIssues).omit({ id: true });
export type InsertPoliticalIssue = z.infer<typeof insertPoliticalIssueSchema>;
export type PoliticalIssue = typeof politicalIssues.$inferSelect;

export const politicalElections = pgTable("political_elections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  date: text("date"),
  level: text("level"),        // "federal" | "state" | "local" | "primary"
  voted: boolean("voted").default(false),
  registrationDeadline: text("registration_deadline"),
  pollingLocation: text("polling_location"),
  notes: text("notes"),
});
export const insertPoliticalElectionSchema = createInsertSchema(politicalElections).omit({ id: true });
export type InsertPoliticalElection = z.infer<typeof insertPoliticalElectionSchema>;
export type PoliticalElection = typeof politicalElections.$inferSelect;

export const civicActions = pgTable("civic_actions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  date: text("date").notNull(),
  type: text("type").notNull(),  // "voted" | "called" | "emailed" | "volunteered" | "donated" | "attended" | "petition" | "letter" | "other"
  description: text("description"),
  official: text("official"),
  notes: text("notes"),
});
export const insertCivicActionSchema = createInsertSchema(civicActions).omit({ id: true });
export type InsertCivicAction = z.infer<typeof insertCivicActionSchema>;
export type CivicAction = typeof civicActions.$inferSelect;

export const politicalNewsSources = pgTable("political_news_sources", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  url: text("url"),
  bias: text("bias"),          // "left" | "center-left" | "center" | "center-right" | "right"
  reliability: integer("reliability"),  // 1-5
  type: text("type"),          // "newspaper" | "tv" | "podcast" | "newsletter" | "website" | "other"
  topics: text("topics"),
  notes: text("notes"),
});
export const insertPoliticalNewsSourceSchema = createInsertSchema(politicalNewsSources).omit({ id: true });
export type InsertPoliticalNewsSource = z.infer<typeof insertPoliticalNewsSourceSchema>;
export type PoliticalNewsSource = typeof politicalNewsSources.$inferSelect;

// ── Political Debates ──────────────────────────────────────────────────────────
export const politicalDebates = pgTable("political_debates", {
  id:          serial("id").primaryKey(),
  userId:      integer("user_id").notNull(),       // creator
  title:       text("title").notNull(),
  description: text("description"),
  issueRef:    text("issue_ref"),                  // optional issue topic reference
  shareCode:   text("share_code").notNull(),        // 8-char code for friends to join
  status:      text("status").default("open"),      // "open" | "closed"
  sides:       text("sides"),                       // JSON array of side label strings e.g. '["For","Against","Neutral"]'
  createdAt:   timestamp("created_at").defaultNow(),
});
export const insertPoliticalDebateSchema = createInsertSchema(politicalDebates).omit({ id: true, createdAt: true });
export type InsertPoliticalDebate = z.infer<typeof insertPoliticalDebateSchema>;
export type PoliticalDebate = typeof politicalDebates.$inferSelect;

export const politicalDebatePosts = pgTable("political_debate_posts", {
  id:            serial("id").primaryKey(),
  debateId:      integer("debate_id").notNull(),
  userId:        integer("user_id").notNull(),
  displayName:   text("display_name"),               // cached name of poster
  content:       text("content").notNull(),
  side:          text("side"),                       // "for" | "against" | "neutral"
  upvoteCount:   integer("upvote_count").default(0),
  citationUrl:   text("citation_url"),               // optional article URL to cite
  citationTitle: text("citation_title"),             // optional display title for the citation
  createdAt:     timestamp("created_at").defaultNow(),
});
export const insertPoliticalDebatePostSchema = createInsertSchema(politicalDebatePosts).omit({ id: true, createdAt: true, upvoteCount: true });
export type InsertPoliticalDebatePost = z.infer<typeof insertPoliticalDebatePostSchema>;
export type PoliticalDebatePost = typeof politicalDebatePosts.$inferSelect;

export const politicalDebateUpvotes = pgTable("political_debate_upvotes", {
  id:        serial("id").primaryKey(),
  postId:    integer("post_id").notNull(),
  userId:    integer("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});
export type PoliticalDebateUpvote = typeof politicalDebateUpvotes.$inferSelect;

export const politicalDebateMembers = pgTable("political_debate_members", {
  id:        serial("id").primaryKey(),
  debateId:  integer("debate_id").notNull(),
  userId:    integer("user_id").notNull(),
  joinedAt:  timestamp("joined_at").defaultNow(),
});

// ── ACTIVITY FEED ─────────────────────────────────────────────────────────────
export const activityFeed = pgTable("activity_feed", {
  id:           serial("id").primaryKey(),
  userId:       integer("user_id").notNull(),        // who did the action
  activityType: text("activity_type").notNull(),     // book_added | book_finished | movie_added | song_added | recipe_added | spot_added | quote_added | recommendation_received
  itemId:       integer("item_id"),
  itemType:     text("item_type"),                   // book | movie | song | recipe | spot | quote
  itemTitle:    text("item_title"),
  itemImageUrl: text("item_image_url"),
  itemSubtitle: text("item_subtitle"),               // author, director, artist etc.
  itemExtra:    text("item_extra"),                  // JSON: extra metadata
  createdAt:    timestamp("created_at").defaultNow(),
});
export type ActivityFeedItem = typeof activityFeed.$inferSelect;

export const activityReactions = pgTable("activity_reactions", {
  id:         serial("id").primaryKey(),
  feedItemId: integer("feed_item_id").notNull(),
  userId:     integer("user_id").notNull(),
  emoji:      text("emoji").notNull(),               // 👍 ❤️ 🔥
  createdAt:  timestamp("created_at").defaultNow(),
});
export type ActivityReaction = typeof activityReactions.$inferSelect;

export const activityComments = pgTable("activity_comments", {
  id:         serial("id").primaryKey(),
  feedItemId: integer("feed_item_id").notNull(),
  userId:     integer("user_id").notNull(),
  content:    text("content").notNull(),
  createdAt:  timestamp("created_at").defaultNow(),
});
export type ActivityComment = typeof activityComments.$inferSelect;

// ── BODY COMPOSITION PLANS ───────────────────────────────────────────────────
// planType: "cut" | "bulk" | "recomp"
// activityLevel: "sedentary" | "light" | "moderate" | "heavy" | "athlete"
export const bodyCompPlans = pgTable("body_comp_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  planType: text("plan_type").notNull().default("cut"), // cut | bulk | recomp
  weightUnit: text("weight_unit").notNull().default("lbs"), // lbs | kg
  currentWeight: real("current_weight"),
  goalWeight: real("goal_weight"),
  currentBodyFat: real("current_body_fat"),
  goalBodyFat: real("goal_body_fat"),
  activityLevel: text("activity_level").notNull().default("moderate"),
  maintenanceCalories: integer("maintenance_calories").notNull(),
  targetCalories: integer("target_calories").notNull(),
  proteinGrams: integer("protein_grams").notNull(),
  carbsGrams: integer("carbs_grams").notNull(),
  fatGrams: integer("fat_grams").notNull(),
  proteinPerLb: real("protein_per_lb").notNull().default(1.0),
  fatPct: real("fat_pct").notNull().default(25.0),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: text("created_at").notNull(),
});

export const bodyCompCheckIns = pgTable("body_comp_check_ins", {
  id: serial("id").primaryKey(),
  planId: integer("plan_id").notNull(),
  userId: integer("user_id").notNull(),
  date: text("date").notNull(),
  weight: real("weight"),
  bodyFat: real("body_fat"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const insertBodyCompPlanSchema = createInsertSchema(bodyCompPlans).omit({ id: true });
export type InsertBodyCompPlan = z.infer<typeof insertBodyCompPlanSchema>;
export type BodyCompPlan = typeof bodyCompPlans.$inferSelect;

export const insertBodyCompCheckInSchema = createInsertSchema(bodyCompCheckIns).omit({ id: true });
export type InsertBodyCompCheckIn = z.infer<typeof insertBodyCompCheckInSchema>;
export type BodyCompCheckIn = typeof bodyCompCheckIns.$inferSelect;

export type BodyCompPlanWithCheckIns = BodyCompPlan & { checkIns: BodyCompCheckIn[] };

// ── Nutrition / Food Log ──────────────────────────────────────────────────────
export const foodLogEntries = pgTable("food_log_entries", {
  id:          serial("id").primaryKey(),
  userId:      integer("user_id").notNull(),
  foodName:    text("food_name").notNull(),
  usdaFoodId:  text("usda_food_id"),
  barcode:     text("barcode"),
  servingSize: real("serving_size").notNull().default(1),
  servingUnit: text("serving_unit").notNull().default("serving"),
  quantity:    real("quantity").notNull().default(1),
  mealType:    text("meal_type").notNull().default("snack"),
  date:        text("date").notNull(),
  calories:    real("calories").notNull().default(0),
  protein:     real("protein").notNull().default(0),
  carbs:       real("carbs").notNull().default(0),
  fat:         real("fat").notNull().default(0),
  fiber:       real("fiber").notNull().default(0),
  sugar:       real("sugar").notNull().default(0),
  sodium:           real("sodium").notNull().default(0),
  ingredientsJson:  text("ingredients_json"),
  createdAt:        timestamp("created_at").defaultNow(),
});
export const insertFoodLogSchema = createInsertSchema(foodLogEntries).omit({ id: true, createdAt: true });
export type InsertFoodLogEntry = z.infer<typeof insertFoodLogSchema>;
export type FoodLogEntry = typeof foodLogEntries.$inferSelect;

export const waterLogs = pgTable("water_logs", {
  id:      serial("id").primaryKey(),
  userId:  integer("user_id").notNull(),
  date:    text("date").notNull(),
  glasses: integer("glasses").notNull().default(0),
});
export const insertWaterLogSchema = createInsertSchema(waterLogs).omit({ id: true });
export type InsertWaterLog = z.infer<typeof insertWaterLogSchema>;
export type WaterLog = typeof waterLogs.$inferSelect;

export const nutritionGoals = pgTable("nutrition_goals", {
  id:           serial("id").primaryKey(),
  userId:       integer("user_id").notNull().unique(),
  calories:     integer("calories").notNull().default(2000),
  protein:      integer("protein").notNull().default(150),
  carbs:        integer("carbs").notNull().default(250),
  fat:          integer("fat").notNull().default(65),
  waterGlasses: integer("water_glasses").notNull().default(8),
  buddyUserId:  integer("buddy_user_id"),
});
export const insertNutritionGoalSchema = createInsertSchema(nutritionGoals).omit({ id: true });
export type InsertNutritionGoal = z.infer<typeof insertNutritionGoalSchema>;
export type NutritionGoal = typeof nutritionGoals.$inferSelect;

export type NutritionSummary = {
  calories: number; protein: number; carbs: number; fat: number;
  fiber: number; sugar: number; sodium: number;
  servings: number; partial?: boolean;
  unmatchedIngredients?: string[];
};

// ── READING GOALS ──────────────────────────────────────────────────────────────
export const readingGoals = pgTable("reading_goals", {
  id:           serial("id").primaryKey(),
  userId:       integer("user_id").notNull(),
  booksTarget:  integer("books_target").notNull().default(12),
  year:         integer("year").notNull().default(2026),
  label:        text("label"),           // e.g. "Summer Reading 2026"
  startDate:    text("start_date"),      // ISO date "2026-01-01"
  endDate:      text("end_date"),        // ISO date "2026-12-31"
  buddyUserId:  integer("buddy_user_id"),
});
export const insertReadingGoalSchema = createInsertSchema(readingGoals).omit({ id: true });
export type InsertReadingGoal = z.infer<typeof insertReadingGoalSchema>;
export type ReadingGoal = typeof readingGoals.$inferSelect;

// ── HABITS ─────────────────────────────────────────────────────────────────────

export const habits = pgTable("habits", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  title: text("title").notNull(),
  description: text("description"),
  emoji: text("emoji").notNull().default("✅"),
  color: text("color").notNull().default("#6366f1"),
  frequency: text("frequency").notNull().default("daily"), // "daily" | "weekly"
  targetDaysPerWeek: integer("target_days_per_week").notNull().default(7),
  category: text("category").notNull().default("general"), // "health" | "mind" | "growth" | "social" | "general"
  isArchived: boolean("is_archived").notNull().default(false),
  createdAt: text("created_at").notNull(),
  // JSON array: [{ date: "YYYY-MM-DD", note?: string }]
  completionsJson: text("completions_json").notNull().default("[]"),
});

export const insertHabitSchema = createInsertSchema(habits).omit({ id: true });
export type InsertHabit = z.infer<typeof insertHabitSchema>;
export type Habit = typeof habits.$inferSelect;

// Client-facing type with parsed completions
export type HabitCompletion = { date: string; note?: string };
export type HabitWithStats = Omit<Habit, "completionsJson"> & {
  completions: HabitCompletion[];
  streakCurrent: number;
  streakBest: number;
  completionRate7d: number; // 0..100
};

// ── MESSENGER ──────────────────────────────────────────────────────────────────

export const conversations = pgTable("conversations", {
  id:            serial("id").primaryKey(),
  name:          text("name"),                                   // null = DM, set = group name
  isGroup:       boolean("is_group").notNull().default(false),
  createdBy:     integer("created_by"),
  createdAt:     text("created_at").notNull(),
  lastMessageAt: text("last_message_at"),
});

export const conversationParticipants = pgTable("conversation_participants", {
  id:             serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  userId:         integer("user_id").notNull(),
  joinedAt:       text("joined_at").notNull(),
  lastReadAt:     text("last_read_at"),
});

export const messages = pgTable("messages", {
  id:             serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull(),
  senderId:       integer("sender_id").notNull(),
  content:        text("content").notNull(),
  createdAt:      text("created_at").notNull(),
  isDeleted:      boolean("is_deleted").notNull().default(false),
});

export const messageReactions = pgTable("message_reactions", {
  id:        serial("id").primaryKey(),
  messageId: integer("message_id").notNull(),
  userId:    integer("user_id").notNull(),
  emoji:     text("emoji").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Conversation = typeof conversations.$inferSelect;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageReaction = typeof messageReactions.$inferSelect;

export type ReactionSummary = { emoji: string; count: number; userIds: number[] };

/** Structured payload stored in message.share_data (JSON string) */
export type SharePayload = {
  shareType: string;        // 'spot' | 'movie' | 'recipe' | 'book' | 'workout'
  name: string;             // primary title
  subtitle?: string;        // e.g. "Restaurant · NYC" or "Drama · 2023"
  emoji?: string;           // type emoji
  imageUrl?: string;
  note?: string;            // optional personal note
  id?: number;              // source item id for fetching fresh details
  details?: Record<string, any>; // snapshot of full item details at share time
};

export type MessageWithSender = Message & {
  sender: PublicUser;
  reactions: ReactionSummary[];
  messageType?: string;     // 'text' | 'share'
  shareType?: string;
  shareData?: string;       // JSON SharePayload
};
export type ConversationWithDetails = Conversation & {
  participants: (PublicUser & { lastReadAt: string | null })[];
  lastMessage: MessageWithSender | null;
  unreadCount: number;
};

// ── BUD BETS ───────────────────────────────────────────────────────────────────
export const budBets = pgTable("bud_bets", {
  id:               serial("id").primaryKey(),
  creatorId:        integer("creator_id").notNull(),
  // opponent — either an app user (opponentId) or a free-text name (opponentName)
  opponentId:       integer("opponent_id"),
  opponentName:     text("opponent_name"),
  // optional impartial arbitrator
  arbitratorId:     integer("arbitrator_id"),
  arbitratorName:   text("arbitrator_name"),
  // bet details
  title:            text("title").notNull(),           // "Who wins the Super Bowl"
  wager:            text("wager").notNull(),            // "Loser buys dinner and drinks"
  dueDate:          text("due_date"),                  // ISO date string, optional
  // lifecycle: pending → active → settled | cancelled
  status:           text("status").notNull().default("active"),
  winnerId:         integer("winner_id"),               // null until settled; -1 = creator lost
  // payout tracking
  payoutStatus:     text("payout_status").notNull().default("pending"), // "pending" | "paid" | "stiffed"
  payoutMarkedById: integer("payout_marked_by_id"),
  // timestamps
  createdAt:        text("created_at").notNull(),
  settledAt:        text("settled_at"),
});

export const insertBudBetSchema = createInsertSchema(budBets).omit({ id: true });
export type BudBet = typeof budBets.$inferSelect;
export type InsertBudBet = z.infer<typeof insertBudBetSchema>;

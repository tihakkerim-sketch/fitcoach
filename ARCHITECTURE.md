# FitCoach Desktop — Full Technical Context for Claude

This file gives you complete knowledge of the FitCoach Electron app so you can act as a technical contributor or coaching assistant with full context.

---

## Stack

| Layer | Technology |
|---|---|
| Shell | Electron 31 (main + renderer process) |
| Frontend | React 18 + TypeScript (strict) + Vite |
| Routing | React Router v6 HashRouter |
| Styling | Tailwind CSS v3 + shadcn/ui components |
| Database | sql.js (SQLite WASM) + Drizzle ORM v0.30.10 |
| Charts | Recharts |
| IPC | Electron `ipcMain.handle` / `ipcRenderer.invoke` via contextBridge |
| Icons | Lucide React |

**Important sql.js constraint:** sql.js WASM SQLite does **not** support `ALTER TABLE … ADD COLUMN IF NOT EXISTS` — only plain `ALTER TABLE … ADD COLUMN`. New columns are added via a `try/catch` wrapper in `applySchemaPatches()`. New tables use `CREATE TABLE IF NOT EXISTS`. All schema patches run idempotently on every startup.

**DB persistence:** The database is loaded from / saved to `{userData}/fitcoach.db` as a binary buffer. A debounced `flushDb()` call saves after every write (triggered by `markDirty()`).

---

## Project structure

```
FitnessTrackerApp/
├── electron/
│   ├── main.ts                  # App entry — registers all IPC handlers
│   ├── preload.ts               # contextBridge: exposes window.electronAPI
│   └── ipc/
│       ├── activities.ts        # ACTIVITIES_* handlers
│       ├── plans.ts             # PLANS_*, SESSIONS_*, PLANS_ADAPT handlers
│       ├── profile.ts           # PROFILE_*, HR_ZONES_* handlers
│       ├── habits.ts            # HABITS_*, HABIT_LOG_* handlers
│       ├── checkin.ts           # CHECKIN_* handlers
│       ├── nutrition.ts         # NUTRITION_* handlers
│       ├── recovery.ts          # RECOVERY_* handlers (readiness auto-calc)
│       ├── challenges.ts        # CHALLENGES_*, CHALLENGE_POOL_* handlers
│       ├── body.ts              # BODY_* handlers
│       ├── stats.ts             # STATS_GET handler
│       ├── summary.ts           # EXPORT_GENERATE_SUMMARY handler
│       ├── garmin.ts            # GARMIN_PARSE handler
│       └── data.ts              # DATA_EXPORT / DATA_IMPORT handlers
├── db/
│   ├── schema.ts                # All Drizzle table definitions
│   ├── index.ts                 # initDb(), applySchemaPatches(), markDirty()
│   └── migrations/              # Drizzle migration files
├── src/
│   ├── App.tsx                  # HashRouter + all routes
│   ├── components/
│   │   ├── Layout.tsx           # Sidebar nav, theme toggle, N shortcut
│   │   ├── activities/          # LogActivityModal, ActivityCard, GarminDropZone, forms
│   │   ├── plans/               # WeekGrid, SessionActionModal, PlanCard,
│   │   │                        # CreatePlanModal, ImportPlanModal, AdaptPlanModal,
│   │   │                        # PlanPreview
│   │   ├── habits/              # HabitsWidget
│   │   ├── nutrition/           # NutritionWidget
│   │   ├── recovery/            # RecoveryWidget
│   │   ├── challenges/          # ChallengesWidget
│   │   └── ui/                  # shadcn/ui primitives
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── ActivityLog.tsx
│   │   ├── PlanView.tsx
│   │   ├── PlanDetail.tsx
│   │   ├── Progress.tsx
│   │   ├── Habits.tsx
│   │   ├── DailyCheckin.tsx
│   │   ├── Nutrition.tsx
│   │   ├── Recovery.tsx
│   │   ├── Body.tsx
│   │   ├── Challenges.tsx
│   │   ├── Export.tsx
│   │   └── Settings.tsx
│   ├── hooks/
│   │   ├── usePlanDetail.ts
│   │   └── usePlans.ts
│   ├── lib/
│   │   ├── ipc.ts               # invoke<T>(channel, payload?) wrapper
│   │   ├── utils.ts             # cn() helper
│   │   ├── zones.ts             # HR zone utilities
│   │   ├── recoveryScore.ts     # calcReadiness() formula (shared frontend+backend)
│   │   └── planImport.ts        # parsePlanJson(), toCreatePayload(), prompts
│   └── types/
│       └── ipc.ts               # All IPC channel constants + TypeScript types
```

---

## Routes

```
/              → Dashboard
/activities    → ActivityLog
/plan          → PlanView (list)
/plan/:id      → PlanDetail (week grid)
/progress      → Progress (charts)
/habits        → Habits
/checkin       → DailyCheckin
/challenges    → Challenges
/nutrition     → Nutrition
/recovery      → Recovery
/body          → Body
/export        → Export
/settings      → Settings
```

---

## Database schema

All dates stored as `text` in `YYYY-MM-DD` format. All timestamps stored as Unix ms integers (`integer`). All boolean-like fields stored as `integer` (0/1).

### `activities`
```sql
id              integer PK autoincrement
type            text NOT NULL          -- running|cycling|sleep|strength|custom
date            text NOT NULL          -- YYYY-MM-DD
created_at      integer NOT NULL
source          text NOT NULL          -- manual|garmin_import
garmin_file_name text
avg_hr          integer
max_hr          integer
duration_min    real
-- Running specific
start_time      text
distance_km     real
hr_zone_distribution text             -- JSON: {z1,z2,z3,z4,z5}
perceived_effort integer              -- 1–10
surface_type    text
notes           text
-- Cycling specific
avg_cadence     integer
-- Sleep specific
bedtime         text
wake_time       text
sleep_quality   integer               -- 1–5
-- Strength specific
exercises       text                  -- JSON: [{name,sets,reps}]
-- Custom
type_label      text
-- Garmin
raw_garmin_data text                  -- JSON blob
```

### `training_plans`
```sql
id         integer PK autoincrement
name       text NOT NULL
goal_event text
goal_date  text
is_active  integer NOT NULL DEFAULT 1  -- 0|1
created_at integer NOT NULL
```

### `plan_phases`
```sql
id             integer PK autoincrement
plan_id        integer NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE
name           text NOT NULL
order_index    integer NOT NULL          -- 0-based phase order
duration_weeks integer NOT NULL
```

### `plan_weeks`
```sql
id          integer PK autoincrement
phase_id    integer NOT NULL REFERENCES plan_phases(id) ON DELETE CASCADE
week_number integer NOT NULL             -- 1-based within phase
notes       text
```

### `plan_sessions`
```sql
id                 integer PK autoincrement
week_id            integer NOT NULL REFERENCES plan_weeks(id) ON DELETE CASCADE
day_of_week        integer NOT NULL       -- 1=Mon … 7=Sun
type               text NOT NULL          -- running|cycling|strength|rest|custom
target_duration_min integer
target_hr_zone     integer
intensity_label    text
coaching_note      text
status             text NOT NULL DEFAULT 'planned'  -- planned|completed|skipped
linked_activity_id integer REFERENCES activities(id) ON DELETE SET NULL
completed_at       integer
completion_note    text
```

### `user_profile` (single row, id=1)
```sql
id                     integer PK
name                   text
age                    integer
max_hr                 integer
resting_hr             integer
goal_event             text
goal_finish_time       text
training_days_per_week integer
fixed_rest_days        text              -- JSON array e.g. [0,6]
injury_notes           text
theme                  text DEFAULT 'dark'   -- light|dark|system
weekly_goal_km         real
weekly_goal_sessions   integer
daily_calorie_target   integer           -- kcal
daily_protein_target_g real              -- grams
daily_water_target_ml  integer           -- millilitres
```

### `hr_zones`
```sql
id          integer PK autoincrement
zone_number integer NOT NULL     -- 1–5
min_hr      integer NOT NULL
max_hr      integer NOT NULL
label       text NOT NULL
```

### `habits`
```sql
id          integer PK autoincrement
name        text NOT NULL
emoji       text NOT NULL DEFAULT '⚡'
color       text NOT NULL DEFAULT 'blue'   -- blue|green|orange|purple|rose
created_at  integer NOT NULL
archived_at integer                         -- soft delete
```

### `habit_logs`
```sql
id           integer PK autoincrement
habit_id     integer NOT NULL REFERENCES habits(id) ON DELETE CASCADE
date         text NOT NULL          -- YYYY-MM-DD
completed_at integer NOT NULL
```

### `daily_checkins`
```sql
id                 integer PK autoincrement
date               text NOT NULL UNIQUE    -- YYYY-MM-DD, one row per day
morning_energy     integer                 -- 1–5
morning_clarity    integer                 -- 1–5
morning_intention  text
evening_rating     integer                 -- 1–5
evening_wins       text
evening_note       text
created_at         integer NOT NULL
updated_at         integer NOT NULL
```

### `recovery_logs`
```sql
id              integer PK autoincrement
date            text NOT NULL UNIQUE   -- YYYY-MM-DD, one row per day
hrv_rmssd       real                   -- ms RMSSD
body_battery    integer                -- 0–100
sleep_score     integer                -- 0–100
readiness_score integer                -- 0–100 AUTO-CALCULATED (never user input)
resting_hr      integer                -- bpm
note            text
source          text NOT NULL DEFAULT 'manual'   -- manual|garmin_import
created_at      integer NOT NULL
updated_at      integer NOT NULL
```

### `nutrition_logs`
```sql
id         integer PK autoincrement
date       text NOT NULL          -- YYYY-MM-DD
label      text                   -- Breakfast|Lunch|Dinner|Snack|Water|Other
calories   integer                -- kcal
protein_g  real                   -- grams
water_ml   integer                -- millilitres
note       text
created_at integer NOT NULL
```

### `body_metrics`
```sql
id           integer PK autoincrement
date         text NOT NULL   -- YYYY-MM-DD
weight_kg    real
body_fat_pct real
note         text
created_at   integer NOT NULL
```

### `challenge_pool`
```sql
id          integer PK autoincrement
text        text NOT NULL
category    text NOT NULL DEFAULT 'fitness'   -- fitness|mindset|nutrition|mobility|custom
is_built_in integer NOT NULL DEFAULT 0        -- 1 = cannot be deleted by user
is_active   integer NOT NULL DEFAULT 1        -- 1 = eligible for daily picks
```
Seeded with 20 built-in challenges (ids 1–20) via `INSERT OR IGNORE` on startup.

### `daily_challenges`
```sql
id           integer PK autoincrement
date         text NOT NULL            -- YYYY-MM-DD
pool_id      integer                  -- nullable FK to challenge_pool
text         text NOT NULL            -- snapshot of challenge text at generation time
completed    integer NOT NULL DEFAULT 0   -- 0|1
completed_at integer
```
3 challenges generated per day on first `CHALLENGES_TODAY_GET` call.

---

## IPC channels (all constants in `src/types/ipc.ts`)

```typescript
// Activities
ACTIVITIES_CREATE    = 'activities:create'
ACTIVITIES_LIST      = 'activities:list'
ACTIVITIES_GET       = 'activities:get'
ACTIVITIES_UPDATE    = 'activities:update'
ACTIVITIES_DELETE    = 'activities:delete'

// Garmin
GARMIN_PARSE         = 'garmin:parse'

// Plans
PLANS_CREATE         = 'plans:create'
PLANS_LIST           = 'plans:list'
PLANS_GET            = 'plans:get'
PLANS_DELETE         = 'plans:delete'
PLANS_ACTIVATE       = 'plans:activate'
PLANS_ADAPT          = 'plans:adapt'         // key feature — see below
SESSIONS_UPDATE_STATUS = 'sessions:updateStatus'
SESSIONS_LINK_ACTIVITY = 'sessions:linkActivity'

// Stats
STATS_GET            = 'stats:get'

// Export
EXPORT_GENERATE_SUMMARY = 'export:generateSummary'
EXPORT_SAVE_MD       = 'export:saveMd'

// Profile
PROFILE_GET          = 'profile:get'
PROFILE_SAVE         = 'profile:save'
HR_ZONES_GET         = 'hrZones:get'
HR_ZONES_SAVE        = 'hrZones:save'

// Data backup
DATA_EXPORT          = 'data:export'
DATA_IMPORT          = 'data:import'

// Habits
HABITS_CREATE        = 'habits:create'
HABITS_LIST          = 'habits:list'
HABITS_DELETE        = 'habits:delete'       // soft-delete (sets archived_at)
HABIT_LOG_TOGGLE     = 'habits:logToggle'
HABIT_LOGS_GET       = 'habits:logsGet'

// Check-in
CHECKIN_GET          = 'checkin:get'
CHECKIN_UPSERT       = 'checkin:upsert'

// Body
BODY_CREATE          = 'body:create'
BODY_LIST            = 'body:list'
BODY_DELETE          = 'body:delete'

// Nutrition
NUTRITION_LOG_CREATE = 'nutrition:logCreate'
NUTRITION_LOGS_GET   = 'nutrition:logsGet'
NUTRITION_LOG_DELETE = 'nutrition:logDelete'

// Recovery
RECOVERY_LOG_UPSERT  = 'recovery:upsert'
RECOVERY_LOGS_GET    = 'recovery:logsGet'
RECOVERY_LOG_DELETE  = 'recovery:delete'

// Challenges
CHALLENGES_TODAY_GET         = 'challenges:todayGet'
CHALLENGE_TOGGLE             = 'challenges:toggle'
CHALLENGE_POOL_LIST          = 'challenges:poolList'
CHALLENGE_POOL_ADD           = 'challenges:poolAdd'
CHALLENGE_POOL_TOGGLE_ACTIVE = 'challenges:poolToggleActive'
CHALLENGE_POOL_DELETE        = 'challenges:poolDelete'
```

### IPC response envelope
Every handler returns:
```typescript
type IpcResponse<T> = { success: true; data: T } | { success: false; error: string }
```
The `invoke<T>()` wrapper in `src/lib/ipc.ts` unwraps this and throws on `success: false`.

---

## Key algorithms & business logic

### Readiness score (auto-calculated)
Defined in `src/lib/recoveryScore.ts`, imported by both the electron IPC handler and the frontend.

```typescript
// Weights
Sleep Score:   35%  (already 0–100, used as-is)
Body Battery:  35%  (already 0–100, used as-is)
HRV RMSSD:     20%  → normalised: (hrv - 20) / 60 * 100, clamped [0,100]
Resting HR:    10%  → normalised: (80 - hr) / 40 * 100, clamped [0,100]
               // HRV: 20ms=0, 80ms=100
               // RHR: 80bpm=0, 40bpm=100

// Missing inputs → weights redistributed proportionally
// Returns null if no inputs at all
```

The readiness_score is stored in the DB on every upsert — it is **never** entered manually by the user. The frontend has a live preview tile in the form that recalculates as the user types.

### Plan adapt algorithm (`PLANS_ADAPT` in `electron/ipc/plans.ts`)
Preserves training history when Claude gives an updated plan:

1. **Snapshot** all `completed` + `skipped` sessions from the existing plan, storing `{phaseOrderIndex, weekNumber, dayOfWeek, status, completedAt, completionNote, linkedActivityId}`
2. **Delete** all `plan_phases` for the plan (cascades → plan_weeks → plan_sessions)
3. **Insert** the new structure (phases → weeks → sessions) with all sessions as `planned`
4. **Restore** snapshots: match by `phaseOrderIndex:weekNumber:dayOfWeek` key → update the matching new session with the stored status/timestamps/link
5. **Update** the plan's name/goalEvent/goalDate metadata
6. **Return** `{ preserved: total_snapshots, restored: matched_count }`

### Daily challenge generation (`CHALLENGES_TODAY_GET`)
On first call of the day:
1. Check if `daily_challenges` already has rows for today → if yes, return them
2. Fetch all active pool entries → Fisher-Yates shuffle → take first 3
3. Insert 3 rows into `daily_challenges` with the text snapshot
4. Return challenges + computed streak

Streak = consecutive days (backwards from today) where ALL daily_challenges rows for that date have `completed = 1`.

### Habit streak
Computed from `habit_logs`. Streak = consecutive days (backwards from today) where the habit has a log entry for that date.

### Training streak (in stats)
Consecutive days with at least one non-sleep activity.

### Day-of-week mapping
```
1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7=Sunday
```
(Note: JavaScript's `Date.getDay()` returns 0=Sunday, so the app converts: `d === 0 ? 7 : d`)

---

## Plan JSON format (for Claude integration)

Both ImportPlanModal and AdaptPlanModal use this format. The user copies a prompt from the app, sends it to Claude, and pastes the JSON back.

```json
{
  "name": "Plan name",
  "goalEvent": "optional event name",
  "goalDate": "YYYY-MM-DD (optional)",
  "phases": [
    {
      "name": "Phase name",
      "weeks": 4,
      "sessions": [
        {
          "day": "Mon",
          "type": "running",
          "durationMin": 45,
          "hrZone": 2,
          "label": "Easy aerobic run",
          "note": "Optional coaching note"
        }
      ]
    }
  ]
}
```

**Rules:**
- `day`: Mon | Tue | Wed | Thu | Fri | Sat | Sun
- `type`: running | cycling | strength | rest | custom
- `durationMin`, `hrZone`, `label`, `note` are all optional
- Sessions listed under a phase repeat **every week** for that phase's entire duration
- Output must be raw JSON only — no markdown fences, no explanation text

The parser (`parsePlanJson` in `src/lib/planImport.ts`) strips markdown fences if Claude adds them anyway.

---

## TypeScript types (key interfaces)

```typescript
// src/types/ipc.ts

type ActivityType = 'running' | 'cycling' | 'sleep' | 'strength' | 'custom'
type ActivitySource = 'manual' | 'garmin_import'
type SessionType = 'running' | 'cycling' | 'strength' | 'rest' | 'custom'
type SessionStatus = 'planned' | 'completed' | 'skipped'
type HabitColor = 'blue' | 'green' | 'orange' | 'purple' | 'rose'
type NutritionLabel = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack' | 'Water' | 'Other'
type RecoverySource = 'manual' | 'garmin_import'
type ChallengeCategory = 'fitness' | 'mindset' | 'nutrition' | 'mobility' | 'custom'

interface UserProfile {
  id: number; name?: string; age?: number
  maxHr?: number; restingHr?: number
  goalEvent?: string; goalFinishTime?: string
  trainingDaysPerWeek?: number; fixedRestDays?: number[]
  injuryNotes?: string; theme: 'light' | 'dark' | 'system'
  weeklyGoalKm?: number; weeklyGoalSessions?: number
  dailyCalorieTarget?: number; dailyProteinTargetG?: number; dailyWaterTargetMl?: number
}

interface RecoveryLog {
  id: number; date: string
  hrvRmssd?: number; bodyBattery?: number; sleepScore?: number
  readinessScore?: number  // auto-calculated, never in UpsertRecoveryLogPayload
  restingHr?: number; note?: string; source: RecoverySource
  createdAt: number; updatedAt: number
}

interface UpsertRecoveryLogPayload {
  date: string; hrvRmssd?: number; bodyBattery?: number
  sleepScore?: number; restingHr?: number
  note?: string; source?: RecoverySource
  // readinessScore intentionally omitted — always auto-calculated
}

interface AdaptPlanPayload extends CreatePlanPayload {
  planId: number
}

interface AdaptPlanResult {
  preserved: number  // completed/skipped sessions found
  restored: number   // sessions matched back onto new structure
}

interface TodayChallengesResult {
  challenges: DailyChallenge[]
  streak: number
}

interface DailyChallenge {
  id: number; date: string; poolId?: number
  text: string; completed: boolean; completedAt?: number
}

interface ChallengePoolEntry {
  id: number; text: string; category: ChallengeCategory
  isBuiltIn: boolean; isActive: boolean
}
```

---

## Dashboard layout

Two-column grid (`max-w-5xl`, `grid-cols-2`, `gap-6`):

**Left — Today's Training:**
- `WeekBar` — Mon–Sun dot strip using `SESSION_COLORS[type].dot`
  - Completed → filled colour dot
  - Planned future → faded primary border
  - Planned past (missed) → muted/transparent
  - Today → `ring-2 ring-primary ring-offset-1`, slightly larger
- Active session card (`TodayCard`) OR `RestDayCard` OR `NoPlanCard`
- `UpcomingList` — next 3 planned sessions

**Right — Performance OS:**
- `CheckinBanner` — prompts morning/evening check-in if not done
- `HabitsWidget`
- `RecoveryWidget`
- `NutritionWidget`
- `ChallengesWidget`

All widgets are self-contained (fetch their own data) and navigate to their full page on click.

---

## Export / coaching workflow

The Export page (`EXPORT_GENERATE_SUMMARY`) generates a Markdown report for a date range including:
- Activity details (type, distance, duration, avg HR, pace, effort)
- Weekly volume summary
- Habit completion
- Check-in scores and notes
- Recovery metrics

**Intended workflow:**
1. Generate last week's report → copy to clipboard
2. Paste into Claude with coaching question (e.g. "Adapt my plan based on this")
3. Claude outputs the updated plan JSON
4. Paste into the Adapt Plan modal → apply → history preserved

---

## Development notes

- **Theme system:** `ThemeContext` wraps the app; cycles `light → dark → system` via the sidebar button. Stored in `user_profile.theme`.
- **Toast system:** `ToastContext` + `Toaster` component for non-blocking notifications.
- **Global N shortcut:** Defined in `Layout.tsx` → opens `LogActivityModal`.
- **Date handling:** Always use `date + 'T12:00:00'` when constructing `Date` objects from `YYYY-MM-DD` strings to avoid UTC timezone offset shifting the date.
- **Drizzle column naming:** TypeScript key = camelCase JS property; column name = snake_case SQL name (e.g. `proteinG: real('protein_g')`).
- **Data export version:** `version: 2` in JSON backup. v1 backups (with coach conversation data) are silently accepted — coach fields are ignored.

-- Health Tracker SQLite Schema
-- Run with: sqlite3 data/health_tracker.db < schema.sql

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Profile data (JSON fields for nested structures)
CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    age INTEGER,
    sex TEXT,
    dob TEXT,
    height REAL,
    race TEXT,  -- JSON array
    smoker INTEGER DEFAULT 0,
    on_bp_meds INTEGER DEFAULT 0,
    diabetic INTEGER DEFAULT 0,
    tracking_type TEXT DEFAULT 'bp',
    goals TEXT,  -- JSON object
    health_concerns TEXT,  -- JSON array
    medications TEXT,  -- JSON array
    diagnoses TEXT,  -- JSON array
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Scale readings (VeSync data)
CREATE TABLE IF NOT EXISTS scale_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    weight REAL,
    bmi REAL,
    body_fat_percent REAL,
    fat_free_weight REAL,
    subcutaneous_fat_percent REAL,
    visceral_fat INTEGER,
    body_water_percent REAL,
    skeletal_muscle_percent REAL,
    muscle_mass REAL,
    bone_mass REAL,
    protein_percent REAL,
    bmr INTEGER,
    metabolic_age INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, timestamp)
);

-- Blood pressure readings
CREATE TABLE IF NOT EXISTS blood_pressure (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    systolic INTEGER NOT NULL,
    diastolic INTEGER NOT NULL,
    pulse INTEGER,
    setting TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Seizure episodes
CREATE TABLE IF NOT EXISTS seizure_episodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    duration INTEGER,
    type TEXT,
    trigger TEXT,
    activity TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Medication log
CREATE TABLE IF NOT EXISTS medication_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    medication TEXT NOT NULL,
    form TEXT,
    side_effects TEXT,  -- JSON object
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- InBody scans (stored as JSON blob)
CREATE TABLE IF NOT EXISTS inbody_scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
);

-- Lab results (stored as JSON blob)
CREATE TABLE IF NOT EXISTS labs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    source TEXT,
    data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date, source)
);

-- Body measurements (stored as JSON blob)
CREATE TABLE IF NOT EXISTS measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, date)
);

-- Notes (general user notes)
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =====================================================
-- WORKOUT TRACKING TABLES
-- =====================================================

-- Workout templates (weekly plan structure)
CREATE TABLE IF NOT EXISTS workout_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    day_of_week INTEGER,  -- 0=Sunday, 1=Monday, ... 6=Saturday. NULL for unscheduled
    notes TEXT,
    is_active INTEGER DEFAULT 1,  -- Soft delete flag
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Template exercises (exercises within a template)
CREATE TABLE IF NOT EXISTS template_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    template_id INTEGER NOT NULL,
    superset_group TEXT,  -- "A", "B", "C" etc. NULL for standalone
    superset_order INTEGER DEFAULT 1,  -- 1=A1, 2=A2 within group
    exercise_name TEXT NOT NULL,
    target_sets INTEGER,
    target_reps TEXT,  -- "10" or "8-12" or "8 per leg"
    target_weight REAL,
    weight_unit TEXT DEFAULT 'lbs',  -- "lbs", "kg", "body", "band"
    weight_note TEXT,  -- "per hand", "each side"
    rest_seconds INTEGER,
    notes TEXT,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (template_id) REFERENCES workout_templates(id) ON DELETE CASCADE
);

-- Workout logs (actual workout sessions)
CREATE TABLE IF NOT EXISTS workout_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    template_id INTEGER,  -- NULL for ad-hoc workouts
    date TEXT NOT NULL,
    start_time TEXT,
    end_time TEXT,
    duration_minutes INTEGER,
    overall_difficulty INTEGER,  -- 1-10 RPE scale
    overall_notes TEXT,
    completed INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (template_id) REFERENCES workout_templates(id) ON DELETE SET NULL
);

-- Exercise logs (exercises performed in a workout)
CREATE TABLE IF NOT EXISTS exercise_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workout_log_id INTEGER NOT NULL,
    template_exercise_id INTEGER,
    exercise_name TEXT NOT NULL,
    superset_group TEXT,
    superset_order INTEGER,
    sort_order INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE CASCADE,
    FOREIGN KEY (template_exercise_id) REFERENCES template_exercises(id) ON DELETE SET NULL
);

-- Set logs (individual sets within an exercise)
CREATE TABLE IF NOT EXISTS set_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_log_id INTEGER NOT NULL,
    set_number INTEGER NOT NULL,
    target_reps INTEGER,
    target_weight REAL,
    actual_reps INTEGER,
    actual_weight REAL,
    weight_unit TEXT DEFAULT 'lbs',
    rpe INTEGER,  -- Rate of Perceived Exertion 1-10
    completed INTEGER DEFAULT 1,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exercise_log_id) REFERENCES exercise_logs(id) ON DELETE CASCADE
);

-- Cardio logs (cardio sessions)
CREATE TABLE IF NOT EXISTS cardio_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    workout_log_id INTEGER,  -- NULL for standalone cardio
    date TEXT NOT NULL,
    activity_type TEXT NOT NULL,  -- "walk", "run", "bike"
    duration_minutes INTEGER,
    duration_seconds INTEGER,
    distance REAL,
    distance_unit TEXT DEFAULT 'miles',
    speed REAL,
    speed_unit TEXT DEFAULT 'mph',
    avg_heart_rate INTEGER,
    max_heart_rate INTEGER,
    target_hr_min INTEGER,
    target_hr_max INTEGER,
    incline REAL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (workout_log_id) REFERENCES workout_logs(id) ON DELETE SET NULL
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_scale_readings_user_timestamp
    ON scale_readings(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_blood_pressure_user_date
    ON blood_pressure(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_seizure_episodes_user_date
    ON seizure_episodes(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_medication_log_user_date
    ON medication_log(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_inbody_scans_user_date
    ON inbody_scans(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_labs_user_date
    ON labs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_user_date
    ON measurements(user_id, date DESC);

-- Workout indexes
CREATE INDEX IF NOT EXISTS idx_workout_templates_user
    ON workout_templates(user_id, is_active, day_of_week);
CREATE INDEX IF NOT EXISTS idx_template_exercises_template
    ON template_exercises(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_date
    ON workout_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_exercise_logs_workout
    ON exercise_logs(workout_log_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_set_logs_exercise
    ON set_logs(exercise_log_id, set_number);
CREATE INDEX IF NOT EXISTS idx_cardio_logs_user_date
    ON cardio_logs(user_id, date DESC);

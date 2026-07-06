#!/usr/bin/env python3
"""
Health Tracker Server with SQLite backend.
Run: python server.py
Then open: http://localhost:8000
"""

import json
import os
import re
import shutil
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse

PORT = 8000
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DB_PATH = os.path.join(DATA_DIR, 'health_tracker.db')
BACKUP_DIR = os.path.join(DATA_DIR, 'backups')


@contextmanager
def get_db():
    """Context manager for database connections."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
    finally:
        conn.close()


def get_user_id(conn, username):
    """Get user ID by username, create user if doesn't exist."""
    row = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row:
        return row['id']
    # Create new user
    conn.execute(
        "INSERT INTO users (username, name) VALUES (?, ?)",
        (username, username.title())
    )
    conn.commit()
    return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def row_to_dict(row):
    """Convert sqlite3.Row to dict."""
    if row is None:
        return None
    return dict(row)


def get_user_data(username):
    """Reconstruct full JSON structure from SQLite."""
    with get_db() as conn:
        user_row = conn.execute(
            "SELECT id FROM users WHERE username = ?", (username,)
        ).fetchone()

        if not user_row:
            return None

        user_id = user_row['id']

        # Get profile
        profile_row = conn.execute(
            "SELECT * FROM profiles WHERE user_id = ?", (user_id,)
        ).fetchone()

        if profile_row:
            profile = {
                'name': conn.execute(
                    "SELECT name FROM users WHERE id = ?", (user_id,)
                ).fetchone()['name'],
                'age': profile_row['age'],
                'sex': profile_row['sex'],
                'dob': profile_row['dob'],
                'height': profile_row['height'],
                'race': json.loads(profile_row['race']) if profile_row['race'] else [],
                'smoker': bool(profile_row['smoker']),
                'onBPMeds': bool(profile_row['on_bp_meds']),
                'diabetic': bool(profile_row['diabetic']),
                'trackingType': profile_row['tracking_type'],
                'goals': json.loads(profile_row['goals']) if profile_row['goals'] else {},
                'healthConcerns': json.loads(profile_row['health_concerns']) if profile_row['health_concerns'] else [],
                'medications': json.loads(profile_row['medications']) if profile_row['medications'] else [],
                'diagnoses': json.loads(profile_row['diagnoses']) if profile_row['diagnoses'] else [],
            }
        else:
            profile = {'name': username.title(), 'trackingType': 'bp'}

        # Get scale readings
        scale_readings = []
        for row in conn.execute(
            "SELECT * FROM scale_readings WHERE user_id = ? ORDER BY timestamp", (user_id,)
        ):
            scale_readings.append({
                'timestamp': row['timestamp'],
                'weight': row['weight'],
                'bmi': row['bmi'],
                'bodyFatPercent': row['body_fat_percent'],
                'fatFreeWeight': row['fat_free_weight'],
                'subcutaneousFatPercent': row['subcutaneous_fat_percent'],
                'visceralFat': row['visceral_fat'],
                'bodyWaterPercent': row['body_water_percent'],
                'skeletalMusclePercent': row['skeletal_muscle_percent'],
                'muscleMass': row['muscle_mass'],
                'boneMass': row['bone_mass'],
                'proteinPercent': row['protein_percent'],
                'bmr': row['bmr'],
                'metabolicAge': row['metabolic_age'],
            })

        # Get blood pressure
        blood_pressure = []
        for row in conn.execute(
            "SELECT * FROM blood_pressure WHERE user_id = ? ORDER BY timestamp", (user_id,)
        ):
            blood_pressure.append({
                'id': row['id'],
                'date': row['date'],
                'timestamp': row['timestamp'],
                'systolic': row['systolic'],
                'diastolic': row['diastolic'],
                'pulse': row['pulse'],
                'setting': row['setting'],
                'notes': row['notes'],
            })

        # Get seizure episodes
        seizure_episodes = []
        for row in conn.execute(
            "SELECT * FROM seizure_episodes WHERE user_id = ? ORDER BY timestamp", (user_id,)
        ):
            seizure_episodes.append({
                'id': row['id'],
                'date': row['date'],
                'timestamp': row['timestamp'],
                'duration': row['duration'],
                'type': row['type'],
                'trigger': row['trigger'],
                'activity': row['activity'],
                'notes': row['notes'],
            })

        # Get medication log
        medication_log = []
        for row in conn.execute(
            "SELECT * FROM medication_log WHERE user_id = ? ORDER BY timestamp", (user_id,)
        ):
            medication_log.append({
                'id': row['id'],
                'date': row['date'],
                'timestamp': row['timestamp'],
                'medication': row['medication'],
                'form': row['form'],
                'sideEffects': json.loads(row['side_effects']) if row['side_effects'] else {},
                'notes': row['notes'],
            })

        # Get InBody scans
        inbody_scans = []
        for row in conn.execute(
            "SELECT * FROM inbody_scans WHERE user_id = ? ORDER BY date", (user_id,)
        ):
            scan_data = json.loads(row['data'])
            scan_data['id'] = row['id']
            inbody_scans.append(scan_data)

        # Get labs
        labs = []
        for row in conn.execute(
            "SELECT * FROM labs WHERE user_id = ? ORDER BY date", (user_id,)
        ):
            lab_data = json.loads(row['data'])
            lab_data['id'] = row['id']
            labs.append(lab_data)

        # Get measurements
        measurements = []
        for row in conn.execute(
            "SELECT * FROM measurements WHERE user_id = ? ORDER BY date", (user_id,)
        ):
            measurements.append({
                'id': row['id'],
                'date': row['date'],
                'measurements': json.loads(row['data']) if row['data'] else {},
            })

        # Get notes
        notes = []
        for row in conn.execute(
            "SELECT * FROM notes WHERE user_id = ? ORDER BY created_at", (user_id,)
        ):
            notes.append({
                'id': row['id'],
                'date': row['date'],
                'content': row['content'],
            })

        # Get workout templates with exercises
        workout_templates = []
        for template_row in conn.execute(
            "SELECT * FROM workout_templates WHERE user_id = ? AND is_active = 1 ORDER BY day_of_week, sort_order",
            (user_id,)
        ):
            exercises = []
            for ex_row in conn.execute(
                "SELECT * FROM template_exercises WHERE template_id = ? ORDER BY sort_order",
                (template_row['id'],)
            ):
                exercises.append({
                    'id': ex_row['id'],
                    'supersetGroup': ex_row['superset_group'],
                    'supersetOrder': ex_row['superset_order'],
                    'exerciseName': ex_row['exercise_name'],
                    'targetSets': ex_row['target_sets'],
                    'targetReps': ex_row['target_reps'],
                    'targetWeight': ex_row['target_weight'],
                    'weightUnit': ex_row['weight_unit'],
                    'weightNote': ex_row['weight_note'],
                    'restSeconds': ex_row['rest_seconds'],
                    'notes': ex_row['notes'],
                    'sortOrder': ex_row['sort_order'],
                })
            workout_templates.append({
                'id': template_row['id'],
                'name': template_row['name'],
                'dayOfWeek': template_row['day_of_week'],
                'notes': template_row['notes'],
                'sortOrder': template_row['sort_order'],
                'exercises': exercises,
            })

        # Get workout logs with exercises and sets
        workout_logs = []
        for log_row in conn.execute(
            "SELECT * FROM workout_logs WHERE user_id = ? ORDER BY date DESC LIMIT 50",
            (user_id,)
        ):
            exercises = []
            for ex_row in conn.execute(
                "SELECT * FROM exercise_logs WHERE workout_log_id = ? ORDER BY sort_order",
                (log_row['id'],)
            ):
                sets = []
                for set_row in conn.execute(
                    "SELECT * FROM set_logs WHERE exercise_log_id = ? ORDER BY set_number",
                    (ex_row['id'],)
                ):
                    sets.append({
                        'id': set_row['id'],
                        'setNumber': set_row['set_number'],
                        'targetReps': set_row['target_reps'],
                        'targetWeight': set_row['target_weight'],
                        'actualReps': set_row['actual_reps'],
                        'actualWeight': set_row['actual_weight'],
                        'weightUnit': set_row['weight_unit'],
                        'rpe': set_row['rpe'],
                        'completed': bool(set_row['completed']),
                        'notes': set_row['notes'],
                    })
                exercises.append({
                    'id': ex_row['id'],
                    'templateExerciseId': ex_row['template_exercise_id'],
                    'exerciseName': ex_row['exercise_name'],
                    'supersetGroup': ex_row['superset_group'],
                    'supersetOrder': ex_row['superset_order'],
                    'sortOrder': ex_row['sort_order'],
                    'notes': ex_row['notes'],
                    'sets': sets,
                })
            workout_logs.append({
                'id': log_row['id'],
                'templateId': log_row['template_id'],
                'date': log_row['date'],
                'startTime': log_row['start_time'],
                'endTime': log_row['end_time'],
                'durationMinutes': log_row['duration_minutes'],
                'overallDifficulty': log_row['overall_difficulty'],
                'overallNotes': log_row['overall_notes'],
                'completed': bool(log_row['completed']),
                'exercises': exercises,
            })

        # Get cardio logs
        cardio_logs = []
        for row in conn.execute(
            "SELECT * FROM cardio_logs WHERE user_id = ? ORDER BY date DESC LIMIT 50",
            (user_id,)
        ):
            cardio_logs.append({
                'id': row['id'],
                'workoutLogId': row['workout_log_id'],
                'date': row['date'],
                'activityType': row['activity_type'],
                'durationMinutes': row['duration_minutes'],
                'durationSeconds': row['duration_seconds'],
                'distance': row['distance'],
                'distanceUnit': row['distance_unit'],
                'speed': row['speed'],
                'speedUnit': row['speed_unit'],
                'avgHeartRate': row['avg_heart_rate'],
                'maxHeartRate': row['max_heart_rate'],
                'targetHrMin': row['target_hr_min'],
                'targetHrMax': row['target_hr_max'],
                'incline': row['incline'],
                'notes': row['notes'],
            })

        return {
            'profile': profile,
            'scaleReadings': scale_readings,
            'bloodPressure': blood_pressure,
            'seizureEpisodes': seizure_episodes,
            'medicationLog': medication_log,
            'inbodyScans': inbody_scans,
            'labs': labs,
            'measurements': measurements,
            'notes': notes,
            'workoutTemplates': workout_templates,
            'workoutLogs': workout_logs,
            'cardioLogs': cardio_logs,
        }


def backup_database():
    """Create timestamped database backup."""
    if not os.path.exists(DB_PATH):
        return None
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = os.path.join(BACKUP_DIR, f'health_tracker_{timestamp}.db')
    shutil.copy2(DB_PATH, backup_path)

    # Keep only last 30 backups
    backups = sorted([f for f in os.listdir(BACKUP_DIR) if f.endswith('.db')])
    for old_backup in backups[:-30]:
        os.remove(os.path.join(BACKUP_DIR, old_backup))

    return backup_path


class HealthTrackerHandler(SimpleHTTPRequestHandler):
    def send_json(self, data, status=200):
        """Send JSON response."""
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status, message):
        """Send JSON error response."""
        self.send_json({'error': message}, status)

    def read_json_body(self):
        """Read and parse JSON body."""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        return json.loads(body.decode('utf-8'))

    def send_head(self):
        # Defense in depth: never serve the raw database or its backups as static
        # files, even to a local request. Both do_GET and do_HEAD funnel through
        # send_head(), so guarding here closes every file-serving path (including
        # HEAD, which would otherwise leak the DB's exact size and mtime) at the
        # single point where the path is resolved. Match on the RESOLVED
        # filesystem path translate_path() will open -- it decodes %xx escapes and
        # collapses dot-segments -- lowercased so case-variant requests can't slip
        # past on the case-insensitive filesystems this runs on (macOS, Windows).
        # BACKUP_DIR lives under DATA_DIR, so the DATA_DIR check covers backups.
        served = os.path.realpath(self.translate_path(self.path)).lower()
        protected = os.path.realpath(DATA_DIR).lower()
        if served == protected or served.startswith(protected + os.sep):
            self.send_error_json(403, 'Forbidden')
            return None
        return super().send_head()

    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = parsed.path

        # API: Get user measurements (latest)
        match = re.match(r'^/api/users/(\w+)/measurements/latest$', path)
        if match:
            username = match.group(1)
            with get_db() as conn:
                user_row = conn.execute(
                    "SELECT id FROM users WHERE username = ?", (username,)
                ).fetchone()
                if not user_row:
                    self.send_error_json(404, f'User {username} not found')
                    return
                row = conn.execute(
                    "SELECT * FROM measurements WHERE user_id = ? ORDER BY date DESC LIMIT 1",
                    (user_row['id'],)
                ).fetchone()
                if row:
                    self.send_json({
                        'id': row['id'],
                        'date': row['date'],
                        'measurements': json.loads(row['data']) if row['data'] else {},
                    })
                else:
                    self.send_json({'measurements': []})
            return

        # API: Get user measurements (all)
        match = re.match(r'^/api/users/(\w+)/measurements$', path)
        if match:
            username = match.group(1)
            with get_db() as conn:
                user_row = conn.execute(
                    "SELECT id FROM users WHERE username = ?", (username,)
                ).fetchone()
                if not user_row:
                    self.send_error_json(404, f'User {username} not found')
                    return
                measurements = []
                for row in conn.execute(
                    "SELECT * FROM measurements WHERE user_id = ? ORDER BY date DESC",
                    (user_row['id'],)
                ):
                    measurements.append({
                        'id': row['id'],
                        'date': row['date'],
                        'measurements': json.loads(row['data']) if row['data'] else {},
                    })
                self.send_json({'user': username, 'measurements': measurements, 'count': len(measurements)})
            return

        # API: Get user data
        match = re.match(r'^/api/users/(\w+)$', path)
        if match:
            username = match.group(1)
            data = get_user_data(username)
            if data:
                self.send_json(data)
            else:
                self.send_error_json(404, f'User {username} not found')
            return

        # Serve static files. The data/ and backups/ block lives in send_head()
        # below, which both do_GET and do_HEAD funnel through.
        super().do_GET()

    def do_POST(self):
        """Handle POST requests."""
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            # Blood pressure
            match = re.match(r'^/api/users/(\w+)/blood-pressure$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute("""
                        INSERT INTO blood_pressure
                        (user_id, date, timestamp, systolic, diastolic, pulse, setting, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        user_id, data['date'], data['timestamp'],
                        data['systolic'], data['diastolic'],
                        data.get('pulse'), data.get('setting'), data.get('notes')
                    ))
                    conn.commit()
                    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                self.send_json({'success': True, 'id': new_id})
                print(f"Added BP reading for {username}")
                return

            # Seizure episodes
            match = re.match(r'^/api/users/(\w+)/seizures$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute("""
                        INSERT INTO seizure_episodes
                        (user_id, date, timestamp, duration, type, trigger, activity, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        user_id, data['date'], data['timestamp'],
                        data.get('duration'), data.get('type'),
                        data.get('trigger'), data.get('activity'), data.get('notes')
                    ))
                    conn.commit()
                    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                self.send_json({'success': True, 'id': new_id})
                print(f"Added seizure episode for {username}")
                return

            # Medication log
            match = re.match(r'^/api/users/(\w+)/medication-log$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute("""
                        INSERT INTO medication_log
                        (user_id, date, timestamp, medication, form, side_effects, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        user_id, data['date'], data['timestamp'],
                        data['medication'], data.get('form'),
                        json.dumps(data.get('sideEffects', {})), data.get('notes')
                    ))
                    conn.commit()
                    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                self.send_json({'success': True, 'id': new_id})
                print(f"Added medication log for {username}")
                return

            # Scale readings (bulk import)
            match = re.match(r'^/api/users/(\w+)/scale-readings$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                readings = data if isinstance(data, list) else [data]
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    count = 0
                    for reading in readings:
                        try:
                            conn.execute("""
                                INSERT OR IGNORE INTO scale_readings
                                (user_id, timestamp, weight, bmi, body_fat_percent, fat_free_weight,
                                 subcutaneous_fat_percent, visceral_fat, body_water_percent,
                                 skeletal_muscle_percent, muscle_mass, bone_mass, protein_percent,
                                 bmr, metabolic_age)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                user_id,
                                reading.get('timestamp'),
                                reading.get('weight'),
                                reading.get('bmi'),
                                reading.get('bodyFatPercent'),
                                reading.get('fatFreeWeight'),
                                reading.get('subcutaneousFatPercent'),
                                reading.get('visceralFat'),
                                reading.get('bodyWaterPercent'),
                                reading.get('skeletalMusclePercent'),
                                reading.get('muscleMass'),
                                reading.get('boneMass'),
                                reading.get('proteinPercent'),
                                reading.get('bmr'),
                                reading.get('metabolicAge')
                            ))
                            count += 1
                        except sqlite3.IntegrityError:
                            pass  # Skip duplicates
                    conn.commit()
                self.send_json({'success': True, 'count': count})
                print(f"Added {count} scale readings for {username}")
                return

            # InBody scans
            match = re.match(r'^/api/users/(\w+)/inbody-scans$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute("""
                        INSERT OR REPLACE INTO inbody_scans (user_id, date, data)
                        VALUES (?, ?, ?)
                    """, (user_id, data.get('date'), json.dumps(data)))
                    conn.commit()
                    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                self.send_json({'success': True, 'id': new_id})
                print(f"Added InBody scan for {username}")
                return

            # Labs
            match = re.match(r'^/api/users/(\w+)/labs$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute("""
                        INSERT OR REPLACE INTO labs (user_id, date, source, data)
                        VALUES (?, ?, ?, ?)
                    """, (user_id, data.get('date'), data.get('source'), json.dumps(data)))
                    conn.commit()
                    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                self.send_json({'success': True, 'id': new_id})
                print(f"Added labs for {username}")
                return

            # Measurements
            match = re.match(r'^/api/users/(\w+)/measurements$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute("""
                        INSERT OR REPLACE INTO measurements (user_id, date, data)
                        VALUES (?, ?, ?)
                    """, (user_id, data.get('date'), json.dumps(data.get('measurements', {}))))
                    conn.commit()
                    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                self.send_json({'success': True, 'id': new_id})
                print(f"Added measurements for {username}")
                return

            # Health concerns
            match = re.match(r'^/api/users/(\w+)/health-concerns$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    # Get current concerns
                    row = conn.execute(
                        "SELECT health_concerns FROM profiles WHERE user_id = ?", (user_id,)
                    ).fetchone()
                    concerns = json.loads(row['health_concerns']) if row and row['health_concerns'] else []
                    concerns.append(data)
                    conn.execute(
                        "UPDATE profiles SET health_concerns = ? WHERE user_id = ?",
                        (json.dumps(concerns), user_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Added health concern for {username}")
                return

            # Workout templates
            match = re.match(r'^/api/users/(\w+)/workout-templates$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute("""
                        INSERT INTO workout_templates
                        (user_id, name, day_of_week, notes, sort_order)
                        VALUES (?, ?, ?, ?, ?)
                    """, (
                        user_id, data['name'], data.get('dayOfWeek'),
                        data.get('notes'), data.get('sortOrder', 0)
                    ))
                    conn.commit()
                    template_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

                    # Add exercises if provided
                    for i, ex in enumerate(data.get('exercises', [])):
                        conn.execute("""
                            INSERT INTO template_exercises
                            (template_id, superset_group, superset_order, exercise_name,
                             target_sets, target_reps, target_weight, weight_unit, weight_note,
                             rest_seconds, notes, sort_order)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            template_id, ex.get('supersetGroup'), ex.get('supersetOrder', 1),
                            ex['exerciseName'], ex.get('targetSets'), ex.get('targetReps'),
                            ex.get('targetWeight'), ex.get('weightUnit', 'lbs'),
                            ex.get('weightNote'), ex.get('restSeconds'), ex.get('notes'),
                            ex.get('sortOrder', i)
                        ))
                    conn.commit()
                self.send_json({'success': True, 'id': template_id})
                print(f"Added workout template for {username}")
                return

            # Template exercises
            match = re.match(r'^/api/users/(\w+)/workout-templates/(\d+)/exercises$', path)
            if match:
                username, template_id = match.groups()
                data = self.read_json_body()
                with get_db() as conn:
                    conn.execute("""
                        INSERT INTO template_exercises
                        (template_id, superset_group, superset_order, exercise_name,
                         target_sets, target_reps, target_weight, weight_unit, weight_note,
                         rest_seconds, notes, sort_order)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        template_id, data.get('supersetGroup'), data.get('supersetOrder', 1),
                        data['exerciseName'], data.get('targetSets'), data.get('targetReps'),
                        data.get('targetWeight'), data.get('weightUnit', 'lbs'),
                        data.get('weightNote'), data.get('restSeconds'), data.get('notes'),
                        data.get('sortOrder', 0)
                    ))
                    conn.commit()
                    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                self.send_json({'success': True, 'id': new_id})
                print(f"Added exercise to template {template_id}")
                return

            # Workout logs
            match = re.match(r'^/api/users/(\w+)/workout-logs$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute("""
                        INSERT INTO workout_logs
                        (user_id, template_id, date, start_time, end_time, duration_minutes,
                         overall_difficulty, overall_notes, completed)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        user_id, data.get('templateId'), data['date'],
                        data.get('startTime'), data.get('endTime'),
                        data.get('durationMinutes'), data.get('overallDifficulty'),
                        data.get('overallNotes'), 1 if data.get('completed') else 0
                    ))
                    conn.commit()
                    workout_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

                    # If template_id provided, pre-populate exercises from template
                    if data.get('templateId'):
                        for ex_row in conn.execute(
                            "SELECT * FROM template_exercises WHERE template_id = ? ORDER BY sort_order",
                            (data['templateId'],)
                        ):
                            conn.execute("""
                                INSERT INTO exercise_logs
                                (workout_log_id, template_exercise_id, exercise_name,
                                 superset_group, superset_order, sort_order)
                                VALUES (?, ?, ?, ?, ?, ?)
                            """, (
                                workout_log_id, ex_row['id'], ex_row['exercise_name'],
                                ex_row['superset_group'], ex_row['superset_order'],
                                ex_row['sort_order']
                            ))
                            exercise_log_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]

                            # Create placeholder sets
                            for set_num in range(1, (ex_row['target_sets'] or 0) + 1):
                                conn.execute("""
                                    INSERT INTO set_logs
                                    (exercise_log_id, set_number, target_reps, target_weight, weight_unit, completed)
                                    VALUES (?, ?, ?, ?, ?, 0)
                                """, (
                                    exercise_log_id, set_num,
                                    int(ex_row['target_reps']) if ex_row['target_reps'] and ex_row['target_reps'].isdigit() else None,
                                    ex_row['target_weight'], ex_row['weight_unit']
                                ))
                        conn.commit()

                self.send_json({'success': True, 'id': workout_log_id})
                print(f"Added workout log for {username}")
                return

            # Exercise logs
            match = re.match(r'^/api/users/(\w+)/workout-logs/(\d+)/exercises$', path)
            if match:
                username, workout_log_id = match.groups()
                data = self.read_json_body()
                with get_db() as conn:
                    conn.execute("""
                        INSERT INTO exercise_logs
                        (workout_log_id, template_exercise_id, exercise_name,
                         superset_group, superset_order, sort_order, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    """, (
                        workout_log_id, data.get('templateExerciseId'),
                        data['exerciseName'], data.get('supersetGroup'),
                        data.get('supersetOrder'), data.get('sortOrder', 0),
                        data.get('notes')
                    ))
                    conn.commit()
                    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                self.send_json({'success': True, 'id': new_id})
                print(f"Added exercise to workout log {workout_log_id}")
                return

            # Set logs
            match = re.match(r'^/api/users/(\w+)/workout-logs/(\d+)/exercises/(\d+)/sets$', path)
            if match:
                username, workout_log_id, exercise_log_id = match.groups()
                data = self.read_json_body()
                with get_db() as conn:
                    conn.execute("""
                        INSERT INTO set_logs
                        (exercise_log_id, set_number, target_reps, target_weight,
                         actual_reps, actual_weight, weight_unit, rpe, completed, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        exercise_log_id, data['setNumber'],
                        data.get('targetReps'), data.get('targetWeight'),
                        data.get('actualReps'), data.get('actualWeight'),
                        data.get('weightUnit', 'lbs'), data.get('rpe'),
                        1 if data.get('completed', True) else 0, data.get('notes')
                    ))
                    conn.commit()
                    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                self.send_json({'success': True, 'id': new_id})
                print(f"Added set to exercise {exercise_log_id}")
                return

            # Cardio logs
            match = re.match(r'^/api/users/(\w+)/cardio-logs$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute("""
                        INSERT INTO cardio_logs
                        (user_id, workout_log_id, date, activity_type, duration_minutes,
                         duration_seconds, distance, distance_unit, speed, speed_unit,
                         avg_heart_rate, max_heart_rate, target_hr_min, target_hr_max,
                         incline, notes)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        user_id, data.get('workoutLogId'), data['date'],
                        data['activityType'], data.get('durationMinutes'),
                        data.get('durationSeconds'), data.get('distance'),
                        data.get('distanceUnit', 'miles'), data.get('speed'),
                        data.get('speedUnit', 'mph'), data.get('avgHeartRate'),
                        data.get('maxHeartRate'), data.get('targetHrMin'),
                        data.get('targetHrMax'), data.get('incline'), data.get('notes')
                    ))
                    conn.commit()
                    new_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
                self.send_json({'success': True, 'id': new_id})
                print(f"Added cardio log for {username}")
                return

            self.send_error_json(404, 'Not found')

        except json.JSONDecodeError as e:
            self.send_error_json(400, f'Invalid JSON: {e}')
        except Exception as e:
            self.send_error_json(500, f'Server error: {e}')

    def do_PATCH(self):
        """Handle PATCH requests."""
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            # Update profile
            match = re.match(r'^/api/users/(\w+)/profile$', path)
            if match:
                username = match.group(1)
                data = self.read_json_body()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)

                    # Update user name if provided
                    if 'name' in data:
                        conn.execute(
                            "UPDATE users SET name = ? WHERE id = ?",
                            (data['name'], user_id)
                        )

                    # Check if profile exists
                    row = conn.execute(
                        "SELECT id FROM profiles WHERE user_id = ?", (user_id,)
                    ).fetchone()

                    if row:
                        # Build dynamic update
                        fields = []
                        values = []
                        field_map = {
                            'age': 'age', 'sex': 'sex', 'dob': 'dob', 'height': 'height',
                            'smoker': 'smoker', 'onBPMeds': 'on_bp_meds', 'diabetic': 'diabetic',
                            'trackingType': 'tracking_type',
                        }
                        json_fields = ['race', 'goals', 'healthConcerns', 'medications', 'diagnoses']
                        json_field_map = {
                            'race': 'race', 'goals': 'goals', 'healthConcerns': 'health_concerns',
                            'medications': 'medications', 'diagnoses': 'diagnoses'
                        }

                        for js_key, db_key in field_map.items():
                            if js_key in data:
                                fields.append(f"{db_key} = ?")
                                val = data[js_key]
                                if js_key in ['smoker', 'onBPMeds', 'diabetic']:
                                    val = 1 if val else 0
                                values.append(val)

                        for js_key, db_key in json_field_map.items():
                            if js_key in data:
                                fields.append(f"{db_key} = ?")
                                values.append(json.dumps(data[js_key]))

                        if fields:
                            values.append(user_id)
                            conn.execute(
                                f"UPDATE profiles SET {', '.join(fields)}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?",
                                values
                            )
                    else:
                        # Insert new profile
                        race = data.get('race', [])
                        if isinstance(race, str):
                            race = [race]
                        conn.execute("""
                            INSERT INTO profiles
                            (user_id, age, sex, dob, height, race, smoker, on_bp_meds, diabetic,
                             tracking_type, goals, health_concerns, medications, diagnoses)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            user_id,
                            data.get('age'),
                            data.get('sex'),
                            data.get('dob'),
                            data.get('height'),
                            json.dumps(race),
                            1 if data.get('smoker') else 0,
                            1 if data.get('onBPMeds') else 0,
                            1 if data.get('diabetic') else 0,
                            data.get('trackingType', 'bp'),
                            json.dumps(data.get('goals', {})),
                            json.dumps(data.get('healthConcerns', [])),
                            json.dumps(data.get('medications', [])),
                            json.dumps(data.get('diagnoses', []))
                        ))

                    conn.commit()
                self.send_json({'success': True})
                print(f"Updated profile for {username}")
                return

            # Update workout template
            match = re.match(r'^/api/users/(\w+)/workout-templates/(\d+)$', path)
            if match:
                username, template_id = match.groups()
                data = self.read_json_body()
                with get_db() as conn:
                    fields = []
                    values = []
                    field_map = {
                        'name': 'name', 'dayOfWeek': 'day_of_week',
                        'notes': 'notes', 'sortOrder': 'sort_order'
                    }
                    for js_key, db_key in field_map.items():
                        if js_key in data:
                            fields.append(f"{db_key} = ?")
                            values.append(data[js_key])
                    if fields:
                        fields.append("updated_at = CURRENT_TIMESTAMP")
                        values.append(template_id)
                        conn.execute(
                            f"UPDATE workout_templates SET {', '.join(fields)} WHERE id = ?",
                            values
                        )
                        conn.commit()
                self.send_json({'success': True})
                print(f"Updated workout template {template_id}")
                return

            # Update template exercise
            match = re.match(r'^/api/users/(\w+)/workout-templates/(\d+)/exercises/(\d+)$', path)
            if match:
                username, template_id, exercise_id = match.groups()
                data = self.read_json_body()
                with get_db() as conn:
                    fields = []
                    values = []
                    field_map = {
                        'supersetGroup': 'superset_group', 'supersetOrder': 'superset_order',
                        'exerciseName': 'exercise_name', 'targetSets': 'target_sets',
                        'targetReps': 'target_reps', 'targetWeight': 'target_weight',
                        'weightUnit': 'weight_unit', 'weightNote': 'weight_note',
                        'restSeconds': 'rest_seconds', 'notes': 'notes', 'sortOrder': 'sort_order'
                    }
                    for js_key, db_key in field_map.items():
                        if js_key in data:
                            fields.append(f"{db_key} = ?")
                            values.append(data[js_key])
                    if fields:
                        values.append(exercise_id)
                        conn.execute(
                            f"UPDATE template_exercises SET {', '.join(fields)} WHERE id = ?",
                            values
                        )
                        conn.commit()
                self.send_json({'success': True})
                print(f"Updated template exercise {exercise_id}")
                return

            # Update workout log
            match = re.match(r'^/api/users/(\w+)/workout-logs/(\d+)$', path)
            if match:
                username, workout_log_id = match.groups()
                data = self.read_json_body()
                with get_db() as conn:
                    fields = []
                    values = []
                    field_map = {
                        'startTime': 'start_time', 'endTime': 'end_time',
                        'durationMinutes': 'duration_minutes',
                        'overallDifficulty': 'overall_difficulty',
                        'overallNotes': 'overall_notes'
                    }
                    for js_key, db_key in field_map.items():
                        if js_key in data:
                            fields.append(f"{db_key} = ?")
                            values.append(data[js_key])
                    if 'completed' in data:
                        fields.append("completed = ?")
                        values.append(1 if data['completed'] else 0)
                    if fields:
                        values.append(workout_log_id)
                        conn.execute(
                            f"UPDATE workout_logs SET {', '.join(fields)} WHERE id = ?",
                            values
                        )
                        conn.commit()
                self.send_json({'success': True})
                print(f"Updated workout log {workout_log_id}")
                return

            # Update set log
            match = re.match(r'^/api/users/(\w+)/workout-logs/(\d+)/exercises/(\d+)/sets/(\d+)$', path)
            if match:
                username, workout_log_id, exercise_log_id, set_id = match.groups()
                data = self.read_json_body()
                with get_db() as conn:
                    fields = []
                    values = []
                    field_map = {
                        'setNumber': 'set_number', 'targetReps': 'target_reps',
                        'targetWeight': 'target_weight', 'actualReps': 'actual_reps',
                        'actualWeight': 'actual_weight', 'weightUnit': 'weight_unit',
                        'rpe': 'rpe', 'notes': 'notes'
                    }
                    for js_key, db_key in field_map.items():
                        if js_key in data:
                            fields.append(f"{db_key} = ?")
                            values.append(data[js_key])
                    if 'completed' in data:
                        fields.append("completed = ?")
                        values.append(1 if data['completed'] else 0)
                    if fields:
                        values.append(set_id)
                        conn.execute(
                            f"UPDATE set_logs SET {', '.join(fields)} WHERE id = ?",
                            values
                        )
                        conn.commit()
                self.send_json({'success': True})
                print(f"Updated set {set_id}")
                return

            # Update cardio log
            match = re.match(r'^/api/users/(\w+)/cardio-logs/(\d+)$', path)
            if match:
                username, cardio_id = match.groups()
                data = self.read_json_body()
                with get_db() as conn:
                    fields = []
                    values = []
                    field_map = {
                        'activityType': 'activity_type', 'durationMinutes': 'duration_minutes',
                        'durationSeconds': 'duration_seconds', 'distance': 'distance',
                        'distanceUnit': 'distance_unit', 'speed': 'speed',
                        'speedUnit': 'speed_unit', 'avgHeartRate': 'avg_heart_rate',
                        'maxHeartRate': 'max_heart_rate', 'targetHrMin': 'target_hr_min',
                        'targetHrMax': 'target_hr_max', 'incline': 'incline', 'notes': 'notes'
                    }
                    for js_key, db_key in field_map.items():
                        if js_key in data:
                            fields.append(f"{db_key} = ?")
                            values.append(data[js_key])
                    if fields:
                        values.append(cardio_id)
                        conn.execute(
                            f"UPDATE cardio_logs SET {', '.join(fields)} WHERE id = ?",
                            values
                        )
                        conn.commit()
                self.send_json({'success': True})
                print(f"Updated cardio log {cardio_id}")
                return

            self.send_error_json(404, 'Not found')

        except json.JSONDecodeError as e:
            self.send_error_json(400, f'Invalid JSON: {e}')
        except Exception as e:
            self.send_error_json(500, f'Server error: {e}')

    def do_DELETE(self):
        """Handle DELETE requests."""
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            # Delete blood pressure
            match = re.match(r'^/api/users/(\w+)/blood-pressure/(\d+)$', path)
            if match:
                username, record_id = match.groups()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute(
                        "DELETE FROM blood_pressure WHERE id = ? AND user_id = ?",
                        (record_id, user_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Deleted BP reading {record_id} for {username}")
                return

            # Delete single scale reading
            match = re.match(r'^/api/users/(\w+)/scale-readings/(\d+)$', path)
            if match:
                username, record_id = match.groups()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute(
                        "DELETE FROM scale_readings WHERE id = ? AND user_id = ?",
                        (record_id, user_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Deleted scale reading {record_id} for {username}")
                return

            # Delete all scale readings for user
            match = re.match(r'^/api/users/(\w+)/scale-readings$', path)
            if match:
                username = match.group(1)
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    cursor = conn.execute(
                        "DELETE FROM scale_readings WHERE user_id = ?",
                        (user_id,)
                    )
                    count = cursor.rowcount
                    conn.commit()
                self.send_json({'success': True, 'deleted': count})
                print(f"Deleted {count} scale readings for {username}")
                return

            # Delete seizure
            match = re.match(r'^/api/users/(\w+)/seizures/(\d+)$', path)
            if match:
                username, record_id = match.groups()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute(
                        "DELETE FROM seizure_episodes WHERE id = ? AND user_id = ?",
                        (record_id, user_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Deleted seizure {record_id} for {username}")
                return

            # Delete medication log
            match = re.match(r'^/api/users/(\w+)/medication-log/(\d+)$', path)
            if match:
                username, record_id = match.groups()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute(
                        "DELETE FROM medication_log WHERE id = ? AND user_id = ?",
                        (record_id, user_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Deleted medication log {record_id} for {username}")
                return

            # Delete measurement
            match = re.match(r'^/api/users/(\w+)/measurements/(\d+)$', path)
            if match:
                username, record_id = match.groups()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute(
                        "DELETE FROM measurements WHERE id = ? AND user_id = ?",
                        (record_id, user_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Deleted measurement {record_id} for {username}")
                return

            # Delete health concern
            match = re.match(r'^/api/users/(\w+)/health-concerns/(.+)$', path)
            if match:
                username, concern_id = match.groups()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    row = conn.execute(
                        "SELECT health_concerns FROM profiles WHERE user_id = ?", (user_id,)
                    ).fetchone()
                    if row and row['health_concerns']:
                        concerns = json.loads(row['health_concerns'])
                        concerns = [c for c in concerns if c.get('id') != concern_id]
                        conn.execute(
                            "UPDATE profiles SET health_concerns = ? WHERE user_id = ?",
                            (json.dumps(concerns), user_id)
                        )
                        conn.commit()
                self.send_json({'success': True})
                print(f"Deleted health concern {concern_id} for {username}")
                return

            # Delete workout template (soft delete)
            match = re.match(r'^/api/users/(\w+)/workout-templates/(\d+)$', path)
            if match:
                username, template_id = match.groups()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute(
                        "UPDATE workout_templates SET is_active = 0 WHERE id = ? AND user_id = ?",
                        (template_id, user_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Deleted workout template {template_id} for {username}")
                return

            # Delete template exercise
            match = re.match(r'^/api/users/(\w+)/workout-templates/(\d+)/exercises/(\d+)$', path)
            if match:
                username, template_id, exercise_id = match.groups()
                with get_db() as conn:
                    conn.execute(
                        "DELETE FROM template_exercises WHERE id = ? AND template_id = ?",
                        (exercise_id, template_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Deleted template exercise {exercise_id}")
                return

            # Delete workout log (cascades to exercises and sets)
            match = re.match(r'^/api/users/(\w+)/workout-logs/(\d+)$', path)
            if match:
                username, workout_log_id = match.groups()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute(
                        "DELETE FROM workout_logs WHERE id = ? AND user_id = ?",
                        (workout_log_id, user_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Deleted workout log {workout_log_id} for {username}")
                return

            # Delete exercise log (cascades to sets)
            match = re.match(r'^/api/users/(\w+)/workout-logs/(\d+)/exercises/(\d+)$', path)
            if match:
                username, workout_log_id, exercise_log_id = match.groups()
                with get_db() as conn:
                    conn.execute(
                        "DELETE FROM exercise_logs WHERE id = ? AND workout_log_id = ?",
                        (exercise_log_id, workout_log_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Deleted exercise log {exercise_log_id}")
                return

            # Delete cardio log
            match = re.match(r'^/api/users/(\w+)/cardio-logs/(\d+)$', path)
            if match:
                username, cardio_id = match.groups()
                with get_db() as conn:
                    user_id = get_user_id(conn, username)
                    conn.execute(
                        "DELETE FROM cardio_logs WHERE id = ? AND user_id = ?",
                        (cardio_id, user_id)
                    )
                    conn.commit()
                self.send_json({'success': True})
                print(f"Deleted cardio log {cardio_id} for {username}")
                return

            self.send_error_json(404, 'Not found')

        except Exception as e:
            self.send_error_json(500, f'Server error: {e}')

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def end_headers(self):
        """Add CORS and cache-control headers to all responses."""
        self.send_header('Access-Control-Allow-Origin', '*')
        # Prevent caching of JS/HTML files during development
        if self.path.endswith(('.js', '.html', '.css')):
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()


def run():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(DATA_DIR, exist_ok=True)

    # Backup database on startup
    if os.path.exists(DB_PATH):
        backup_path = backup_database()
        if backup_path:
            print(f"Backed up database to: {backup_path}")

    # Check if database exists
    if not os.path.exists(DB_PATH):
        print(f"WARNING: Database not found at {DB_PATH}")
        print("Run 'python migrate_to_sqlite.py' first to create and populate the database.")

    # Bind to loopback only. The dashboard is meant to be opened locally on this
    # machine (phone access goes through the Telegram agent, not this server), so
    # there is no reason to listen on all interfaces — doing so would expose the
    # health database to every host on the local network with no authentication.
    server = HTTPServer(('127.0.0.1', PORT), HealthTrackerHandler)
    print(f"Health Tracker server running at http://localhost:{PORT}")
    print(f"Database: {DB_PATH}")
    print("Press Ctrl+C to stop")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped")
        server.shutdown()


if __name__ == '__main__':
    run()

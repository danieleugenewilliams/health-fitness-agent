#!/usr/bin/env python3
"""
One-time migration script: JSON files -> SQLite database.

Usage:
    cd /path/to/health-fitness-agent/app
    python migrate_to_sqlite.py

Creates: data/health_tracker.db
"""

import json
import sqlite3
import os
from datetime import datetime

DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
DB_PATH = os.path.join(DATA_DIR, 'health_tracker.db')
SCHEMA_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'schema.sql')
USERS = ['user1', 'user2', 'user3']


def create_schema(conn):
    """Execute schema.sql to create tables."""
    with open(SCHEMA_PATH, 'r') as f:
        conn.executescript(f.read())
    conn.commit()
    print("  Created database schema")


def migrate_user(conn, username, data):
    """Migrate a single user's data."""
    profile = data.get('profile', {})

    # Insert user
    conn.execute(
        "INSERT OR IGNORE INTO users (username, name) VALUES (?, ?)",
        (username, profile.get('name', username.title()))
    )
    user_id = conn.execute(
        "SELECT id FROM users WHERE username = ?", (username,)
    ).fetchone()[0]

    # Insert profile
    race = profile.get('race', [])
    if isinstance(race, str):
        race = [race]

    conn.execute("""
        INSERT OR REPLACE INTO profiles
        (user_id, age, sex, dob, height, race, smoker, on_bp_meds, diabetic,
         tracking_type, goals, health_concerns, medications, diagnoses)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        profile.get('age'),
        profile.get('sex'),
        profile.get('dob'),
        profile.get('height'),
        json.dumps(race),
        1 if profile.get('smoker') else 0,
        1 if profile.get('onBPMeds') else 0,
        1 if profile.get('diabetic') else 0,
        profile.get('trackingType', 'bp'),
        json.dumps(profile.get('goals', {})),
        json.dumps(profile.get('healthConcerns', [])),
        json.dumps(profile.get('medications', [])),
        json.dumps(profile.get('diagnoses', []))
    ))

    # Migrate scale readings
    scale_count = 0
    for reading in data.get('scaleReadings', []):
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
            scale_count += 1
        except sqlite3.IntegrityError:
            pass  # Skip duplicates

    # Migrate blood pressure
    bp_count = 0
    for bp in data.get('bloodPressure', []):
        conn.execute("""
            INSERT INTO blood_pressure
            (user_id, date, timestamp, systolic, diastolic, pulse, setting, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            bp.get('date'),
            bp.get('timestamp'),
            bp.get('systolic'),
            bp.get('diastolic'),
            bp.get('pulse'),
            bp.get('setting'),
            bp.get('notes')
        ))
        bp_count += 1

    # Migrate seizure episodes
    seizure_count = 0
    for ep in data.get('seizureEpisodes', []):
        conn.execute("""
            INSERT INTO seizure_episodes
            (user_id, date, timestamp, duration, type, trigger, activity, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            ep.get('date'),
            ep.get('timestamp'),
            ep.get('duration'),
            ep.get('type'),
            ep.get('trigger'),
            ep.get('activity'),
            ep.get('notes')
        ))
        seizure_count += 1

    # Migrate medication log
    med_count = 0
    for log in data.get('medicationLog', []):
        conn.execute("""
            INSERT INTO medication_log
            (user_id, date, timestamp, medication, form, side_effects, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            log.get('date'),
            log.get('timestamp'),
            log.get('medication'),
            log.get('form'),
            json.dumps(log.get('sideEffects', {})),
            log.get('notes')
        ))
        med_count += 1

    # Migrate InBody scans
    inbody_count = 0
    for scan in data.get('inbodyScans', []):
        try:
            conn.execute("""
                INSERT OR IGNORE INTO inbody_scans (user_id, date, data)
                VALUES (?, ?, ?)
            """, (user_id, scan.get('date'), json.dumps(scan)))
            inbody_count += 1
        except sqlite3.IntegrityError:
            pass

    # Migrate labs
    labs_count = 0
    for lab in data.get('labs', []):
        try:
            conn.execute("""
                INSERT OR IGNORE INTO labs (user_id, date, source, data)
                VALUES (?, ?, ?, ?)
            """, (user_id, lab.get('date'), lab.get('source'), json.dumps(lab)))
            labs_count += 1
        except sqlite3.IntegrityError:
            pass

    # Migrate measurements
    meas_count = 0
    for meas in data.get('measurements', []):
        try:
            conn.execute("""
                INSERT OR IGNORE INTO measurements (user_id, date, data)
                VALUES (?, ?, ?)
            """, (user_id, meas.get('date'), json.dumps(meas.get('measurements', {}))))
            meas_count += 1
        except sqlite3.IntegrityError:
            pass

    # Migrate notes
    notes_count = 0
    for note in data.get('notes', []):
        if note:  # Skip empty notes
            conn.execute("""
                INSERT INTO notes (user_id, date, content)
                VALUES (?, ?, ?)
            """, (user_id, note.get('date'), note.get('content', str(note))))
            notes_count += 1

    conn.commit()

    print(f"  {username}: {scale_count} scale, {bp_count} BP, {seizure_count} seizures, "
          f"{med_count} meds, {inbody_count} InBody, {labs_count} labs, {meas_count} measurements")


def main():
    print("=" * 60)
    print("Health Tracker Migration: JSON -> SQLite")
    print("=" * 60)

    # Backup existing DB if it exists
    if os.path.exists(DB_PATH):
        backup_path = f"{DB_PATH}.backup.{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        os.rename(DB_PATH, backup_path)
        print(f"  Backed up existing DB to: {backup_path}")

    # Create new database
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON")

    # Create schema
    create_schema(conn)

    # Migrate each user
    print("\nMigrating users:")
    for username in USERS:
        json_path = os.path.join(DATA_DIR, f'{username}.json')
        if os.path.exists(json_path):
            with open(json_path, 'r') as f:
                data = json.load(f)
            migrate_user(conn, username, data)
        else:
            print(f"  {username}: SKIPPED (no JSON file)")

    conn.close()

    print("\n" + "=" * 60)
    print(f"Migration complete!")
    print(f"Database: {DB_PATH}")
    print("=" * 60)

    # Verify
    print("\nVerification:")
    conn = sqlite3.connect(DB_PATH)
    for row in conn.execute("""
        SELECT u.username,
               (SELECT COUNT(*) FROM scale_readings WHERE user_id=u.id) as scale,
               (SELECT COUNT(*) FROM blood_pressure WHERE user_id=u.id) as bp,
               (SELECT COUNT(*) FROM seizure_episodes WHERE user_id=u.id) as seizures,
               (SELECT COUNT(*) FROM medication_log WHERE user_id=u.id) as meds
        FROM users u
    """):
        print(f"  {row[0]}: {row[1]} scale, {row[2]} BP, {row[3]} seizures, {row[4]} meds")
    conn.close()

    print("\nJSON files preserved for backup. You can delete them later if migration is successful.")


if __name__ == '__main__':
    main()

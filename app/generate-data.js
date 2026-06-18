#!/usr/bin/env node
/**
 * Generate a user's data JSON from CSV exports (VeSync scale + body measurements).
 *
 * Usage:
 *   1. Put your CSVs under ../<username>/ (see paths in the "Main" section below).
 *   2. Run: node generate-data.js
 *   3. Output is written to data/<username>.json.
 *
 * No personal data is bundled with this script. Point the paths at your own
 * exports. Lab results, blood pressure, and profile details are intentionally
 * left empty here; add them through the app or your own import step.
 */

const fs = require('fs');
const path = require('path');

// ---- Configure these for your own data ----
const USERNAME = 'user1';
const VESYNC_CSV = 'vesync-export.csv';        // your VeSync scale export
const MEASUREMENTS_CSV = 'measurements.csv';   // your body-measurements export
// --------------------------------------------

// Parse VeSync CSV
function parseVeSync(csvText) {
    const lines = csvText.trim().split('\n');
    const readings = [];

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 2) continue;

        const reading = {
            timestamp: parseVeSyncDate(values[0]),
            weight: parseNumber(values[1], 'lb'),
            bmi: parseNumber(values[2]),
            bodyFatPercent: parseNumber(values[3], '%'),
            fatFreeWeight: parseNumber(values[4], 'lb'),
            subcutaneousFatPercent: parseNumber(values[5], '%'),
            visceralFat: parseNumber(values[6]),
            bodyWaterPercent: parseNumber(values[7], '%'),
            skeletalMusclePercent: parseNumber(values[8], '%'),
            muscleMass: parseNumber(values[9], 'lb'),
            boneMass: parseNumber(values[10], 'lb'),
            proteinPercent: parseNumber(values[11], '%'),
            bmr: parseNumber(values[12], 'kcal'),
            metabolicAge: parseNumber(values[13])
        };

        if (reading.weight && reading.timestamp) {
            readings.push(reading);
        }
    }

    readings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return readings;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current.trim());
    return values;
}

function parseVeSyncDate(dateStr) {
    if (!dateStr) return null;
    dateStr = dateStr.replace(/"/g, '');

    const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s*(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return null;

    let [, month, day, year, hour, minute, ampm] = match;
    hour = parseInt(hour);

    if (ampm) {
        if (ampm.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }

    const date = new Date(year, month - 1, day, hour, minute);
    return date.toISOString();
}

function parseNumber(str, unit = '') {
    if (!str) return null;
    let cleaned = str.replace(new RegExp(unit + '$', 'i'), '').trim();
    cleaned = cleaned.replace(/[^\d.-]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
}

// Parse Measurements CSV
function parseMeasurements(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = parseCSVLine(lines[0]);
    const dates = headers.slice(1, -1);

    const measurementsByDate = {};
    dates.forEach(date => {
        measurementsByDate[date] = {
            date: parseMeasurementDate(date),
            measurements: {}
        };
    });

    const bodyPartMap = {
        'chestwidest': 'chest',
        'waistsmallest': 'waist',
        'bellywidestnearbutton': 'belly',
        'buttwidest': 'butt',
        'rightthigh': 'rightThigh',
        'leftthigh': 'leftThigh',
        'rightcalf': 'rightCalf',
        'leftcalf': 'leftCalf',
        'rightbicep': 'rightBicep',
        'leftbicep': 'leftBicep',
        'rightforearm': 'rightForearm',
        'leftforearm': 'leftForearm'
    };

    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length < 2) continue;

        const rawPart = values[0].toLowerCase().replace(/[^a-z]/g, '');
        const bodyPart = bodyPartMap[rawPart];
        if (!bodyPart) continue;

        for (let j = 0; j < dates.length; j++) {
            const value = parseNumber(values[j + 1]);
            if (value !== null) {
                measurementsByDate[dates[j]].measurements[bodyPart] = value;
            }
        }
    }

    return Object.values(measurementsByDate)
        .filter(m => Object.keys(m.measurements).length > 0)
        .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function parseMeasurementDate(dateStr) {
    if (!dateStr) return null;
    const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    if (!match) return null;

    let [, month, day, year] = match;
    if (year.length === 2) year = '20' + year;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Main
const baseDir = path.join(__dirname, '..');
const vesyncPath = path.join(baseDir, USERNAME, VESYNC_CSV);
const measurementsPath = path.join(baseDir, USERNAME, MEASUREMENTS_CSV);
const outputPath = path.join(__dirname, 'data', `${USERNAME}.json`);

let scaleReadings = [];
if (fs.existsSync(vesyncPath)) {
    console.log('Parsing VeSync CSV...');
    scaleReadings = parseVeSync(fs.readFileSync(vesyncPath, 'utf8'));
    console.log(`  Found ${scaleReadings.length} scale readings`);
} else {
    console.log(`No VeSync CSV at ${vesyncPath} (skipping).`);
}

let measurements = [];
if (fs.existsSync(measurementsPath)) {
    console.log('Parsing measurements CSV...');
    measurements = parseMeasurements(fs.readFileSync(measurementsPath, 'utf8'));
    console.log(`  Found ${measurements.length} measurement dates`);
} else {
    console.log(`No measurements CSV at ${measurementsPath} (skipping).`);
}

const data = {
    profile: {
        // Fill in your own profile, or set these through the app.
        name: '',
        height: null,
        goals: {}
    },
    scaleReadings,
    bloodPressure: [],
    inbodyScans: [],
    labs: [],
    measurements
};

fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
console.log(`\nWritten to ${outputPath}`);
console.log(`  Scale readings: ${data.scaleReadings.length}`);
console.log(`  Measurements: ${data.measurements.length}`);

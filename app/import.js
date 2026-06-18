/**
 * Data Import Utilities
 * Handles CSV parsing for VeSync scale data and body measurements
 */

const DataImport = {
    /**
     * Parse VeSync CSV export
     * Format: Time, Weight (with "lb"), BMI, Body Fat (with "%"), etc.
     */
    parseVeSync(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = lines[0].split(',');
        const readings = [];

        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length < 2) continue;

            const reading = {
                timestamp: this.parseVeSyncDate(values[0]),
                weight: this.parseNumber(values[1], 'lb'),
                bmi: this.parseNumber(values[2]),
                bodyFatPercent: this.parseNumber(values[3], '%'),
                fatFreeWeight: this.parseNumber(values[4], 'lb'),
                subcutaneousFatPercent: this.parseNumber(values[5], '%'),
                visceralFat: this.parseNumber(values[6]),
                bodyWaterPercent: this.parseNumber(values[7], '%'),
                skeletalMusclePercent: this.parseNumber(values[8], '%'),
                muscleMass: this.parseNumber(values[9], 'lb'),
                boneMass: this.parseNumber(values[10], 'lb'),
                proteinPercent: this.parseNumber(values[11], '%'),
                bmr: this.parseNumber(values[12], 'kcal'),
                metabolicAge: this.parseNumber(values[13])
            };

            // Only add valid readings with at least weight
            if (reading.weight && reading.timestamp) {
                readings.push(reading);
            }
        }

        // Sort by date (oldest first)
        readings.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        return readings;
    },

    /**
     * Parse CSV line handling quoted values
     */
    parseCSVLine(line) {
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
    },

    /**
     * Parse VeSync date format: "1/21/2026, 9:28 AM"
     */
    parseVeSyncDate(dateStr) {
        if (!dateStr) return null;

        // Remove quotes
        dateStr = dateStr.replace(/"/g, '');

        // Parse "M/D/YYYY, H:MM AM/PM"
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
    },

    /**
     * Parse number from string, removing unit suffix
     */
    parseNumber(str, unit = '') {
        if (!str) return null;

        // Remove unit suffix and parse
        let cleaned = str.replace(new RegExp(unit + '$', 'i'), '').trim();
        cleaned = cleaned.replace(/[^\d.-]/g, '');

        const num = parseFloat(cleaned);
        return isNaN(num) ? null : num;
    },

    /**
     * Parse measurements CSV (pivoted format)
     * Format: Body Part | Date1 | Date2 | Date3 | Unit
     */
    parseMeasurements(csvText) {
        const lines = csvText.trim().split('\n');
        const headers = this.parseCSVLine(lines[0]);

        // Get dates from headers (skip first "Body Part" and last "Unit")
        const dates = headers.slice(1, -1);

        // Initialize measurements array for each date
        const measurementsByDate = {};
        dates.forEach(date => {
            measurementsByDate[date] = {
                date: this.parseMeasurementDate(date),
                measurements: {}
            };
        });

        // Parse body part rows
        for (let i = 1; i < lines.length; i++) {
            const values = this.parseCSVLine(lines[i]);
            if (values.length < 2) continue;

            const bodyPart = this.normalizeBodyPart(values[0]);
            if (!bodyPart) continue;

            // Get measurement for each date
            for (let j = 0; j < dates.length; j++) {
                const value = this.parseNumber(values[j + 1]);
                if (value !== null) {
                    measurementsByDate[dates[j]].measurements[bodyPart] = value;
                }
            }
        }

        // Convert to array and sort by date
        return Object.values(measurementsByDate)
            .filter(m => Object.keys(m.measurements).length > 0)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    /**
     * Parse measurement date format: "10/17/25" or "10/17/2025"
     */
    parseMeasurementDate(dateStr) {
        if (!dateStr) return null;

        const match = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (!match) return null;

        let [, month, day, year] = match;
        if (year.length === 2) {
            year = '20' + year;
        }

        return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    },

    /**
     * Normalize body part name to consistent key
     */
    normalizeBodyPart(name) {
        if (!name) return null;

        const normalized = name.toLowerCase().replace(/[^a-z]/g, '');

        const mapping = {
            'chestwidest': 'chest',
            'chest': 'chest',
            'waistsmallest': 'waist',
            'waist': 'waist',
            'bellywidestnearbutton': 'belly',
            'belly': 'belly',
            'buttwidest': 'butt',
            'butt': 'butt',
            'rightthigh': 'rightThigh',
            'leftthigh': 'leftThigh',
            'rightcalf': 'rightCalf',
            'leftcalf': 'leftCalf',
            'rightbicep': 'rightBicep',
            'leftbicep': 'leftBicep',
            'rightforearm': 'rightForearm',
            'leftforearm': 'leftForearm',
            'weight': 'weight'
        };

        return mapping[normalized] || null;
    },

    /**
     * Deduplicate scale readings by date, keeping the latest per day
     */
    deduplicateByDate(readings) {
        const byDate = {};

        readings.forEach(reading => {
            const date = reading.timestamp.split('T')[0];
            const existing = byDate[date];

            if (!existing || new Date(reading.timestamp) > new Date(existing.timestamp)) {
                byDate[date] = reading;
            }
        });

        return Object.values(byDate).sort((a, b) =>
            new Date(a.timestamp) - new Date(b.timestamp)
        );
    },

    /**
     * Merge imported readings with existing data, avoiding duplicates
     */
    mergeReadings(existing, imported) {
        const existingDates = new Set(existing.map(r => r.timestamp));
        const newReadings = imported.filter(r => !existingDates.has(r.timestamp));

        return [...existing, ...newReadings].sort((a, b) =>
            new Date(a.timestamp) - new Date(b.timestamp)
        );
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataImport;
}

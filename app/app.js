/**
 * Health Tracker App
 * Main application logic
 */

const App = {
    currentUser: 'user1',
    data: null,
    currentTimeRange: 90,

    /**
     * Parse a date string as local date (not UTC)
     * Handles "YYYY-MM-DD" format correctly
     */
    parseLocalDate(dateStr) {
        if (!dateStr) return null;
        // If it's just a date (YYYY-MM-DD), parse as local
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const [year, month, day] = dateStr.split('-').map(Number);
            return new Date(year, month - 1, day);
        }
        // Otherwise parse normally
        return new Date(dateStr);
    },

    /**
     * Get today's date as YYYY-MM-DD string in local time
     */
    getTodayString() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Format a date string for display (handles YYYY-MM-DD correctly)
     */
    formatDate(dateStr) {
        const date = this.parseLocalDate(dateStr);
        if (!date || isNaN(date)) return '--';
        return date.toLocaleDateString();
    },

    /**
     * Initialize the application
     */
    async init() {
        await this.loadData();
        this.applyTrackingType();
        this.setupEventListeners();
        this.renderDashboard();
        this.renderCharts();
        this.renderBPReadings();
        this.renderBPAnalysis();
        this.renderSeizureEpisodes();
        this.renderSeizureAnalysis();
        this.populateMedicationSelect();
        this.renderMedicationLog();
        this.renderWeeklyPlan();
        this.renderTodaysWorkout();
        this.renderRecentWorkouts();
        this.renderRecentCardio();
        this.updateDataSummary();

        // Set default dates for forms
        const bpDateEl = document.getElementById('bpDate');
        const seizureDateEl = document.getElementById('seizureDate');
        const medLogDateEl = document.getElementById('medLogDate');
        const medLogTimeEl = document.getElementById('medLogTime');

        const today = this.getTodayString();
        if (bpDateEl) bpDateEl.value = today;
        if (seizureDateEl) seizureDateEl.value = today;
        if (medLogDateEl) medLogDateEl.value = today;
        if (medLogTimeEl) {
            const now = new Date();
            medLogTimeEl.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        }
    },

    /**
     * Apply tracking type class to body based on user profile
     */
    applyTrackingType() {
        const trackingType = this.data?.profile?.trackingType || 'bp';
        document.body.classList.remove('tracking-bp', 'tracking-seizures', 'tracking-glucose', 'tracking-symptoms', 'tracking-body-composition');
        document.body.classList.add(`tracking-${trackingType}`);
    },

    /**
     * Load user data from JSON file
     */
    async loadData() {
        try {
            const response = await fetch(`/api/users/${this.currentUser}`);
            if (response.ok) {
                this.data = await response.json();
            } else {
                // Initialize with default structure
                this.data = this.getDefaultData();
            }
        } catch (error) {
            console.log('No existing data found, using defaults');
            this.data = this.getDefaultData();
        }
    },

    /**
     * Switch to a different user
     */
    async switchUser(username) {
        this.currentUser = username;
        localStorage.setItem('healthTracker_currentUser', username);
        console.log('Switched to user:', username, '- saved to localStorage');

        await this.loadData();
        this.applyTrackingType();
        this.renderDashboard();
        this.renderCharts();
        this.renderBPReadings();
        this.renderBPAnalysis();
        this.renderSeizureEpisodes();
        this.renderSeizureAnalysis();
        this.populateMedicationSelect();
        this.renderMedicationLog();
        this.renderWeeklyPlan();
        this.renderTodaysWorkout();
        this.renderRecentWorkouts();
        this.renderRecentCardio();
        this.updateDataSummary();
        this.loadStagedFiles();

        // Reset the Profile tab form if currently viewing it
        if (document.getElementById('profile').classList.contains('active')) {
            this.renderProfile();
            this.renderHealthConcerns();
        }
    },

    /**
     * Get default data structure
     */
    getDefaultData() {
        const name = this.currentUser.charAt(0).toUpperCase() + this.currentUser.slice(1);
        return {
            profile: {
                name: name,
                height: null,
                age: null,
                sex: null,
                race: null,
                smoker: false,
                onBPMeds: false,
                diabetic: false,
                goals: {
                    weight: { target: null, unit: 'lbs' },
                    visceralFat: { target: null, comparison: '<' },
                    bmi: { target: null, comparison: '<' },
                    bloodPressure: { systolic: 120, diastolic: 80 }
                },
                healthConcerns: []
            },
            scaleReadings: [],
            bloodPressure: [],
            inbodyScans: [],
            labs: [],
            measurements: [],
            workoutTemplates: [],
            workoutLogs: [],
            cardioLogs: []
        };
    },

    /**
     * Save data to server (persists to disk)
     */
    async saveData() {
        try {
            const response = await fetch(`/api/save/${this.currentUser}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.data)
            });

            if (!response.ok) {
                console.error('Failed to save data:', response.statusText);
            }
        } catch (error) {
            console.error('Error saving data:', error);
            // Fallback to localStorage if server unavailable
            localStorage.setItem(`healthTracker_${this.currentUser}`, JSON.stringify(this.data));
        }

        this.updateDataSummary();
    },

    /**
     * Export data as downloadable JSON file
     */
    exportData() {
        const dataStr = JSON.stringify(this.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.currentUser}.json`;
        a.click();

        URL.revokeObjectURL(url);
    },

    /**
     * Calculate 10-Year ASCVD Risk using Pooled Cohort Equations
     * Returns risk percentage and category
     */
    calculateASCVD() {
        const profile = this.data.profile;
        const labs = this.data.labs;

        if (!labs || labs.length === 0) {
            return null;
        }

        // Get latest lab results
        const latestLab = labs[labs.length - 1];
        const lipids = latestLab.results?.lipids;

        if (!lipids) return null;

        // Use total cholesterol from lab if available, otherwise calculate it
        let totalChol;
        if (lipids.totalCholesterol?.value) {
            totalChol = lipids.totalCholesterol.value;
        } else {
            // Calculate: LDL + HDL + (Triglycerides / 5)
            totalChol = lipids.ldlC.value + lipids.hdlC.value + (lipids.triglycerides.value / 5);
        }
        const hdl = lipids.hdlC.value;

        // Get systolic BP from lab or BP readings
        let systolicBP = 120;
        if (latestLab.bloodPressure && latestLab.bloodPressure.length > 0) {
            systolicBP = latestLab.bloodPressure.reduce((sum, bp) => sum + bp.systolic, 0) / latestLab.bloodPressure.length;
        } else if (this.data.bloodPressure.length > 0) {
            systolicBP = this.data.bloodPressure[this.data.bloodPressure.length - 1].systolic;
        }

        const age = profile.age || 50;
        const isMale = profile.sex === 'male';
        // Support both old single value and new array format for race
        const raceArray = Array.isArray(profile.race) ? profile.race : [profile.race];
        const isAA = raceArray.includes('black') || raceArray.includes('african-american');
        const isAsian = raceArray.includes('asian');
        const smoker = profile.smoker ? 1 : 0;
        const diabetic = profile.diabetic ? 1 : 0;
        const onBPMeds = profile.onBPMeds ? 1 : 0;

        // Pooled Cohort Equations coefficients
        let coefficients, meanCoefSum, baseSurvival;

        if (isMale && isAA) {
            // African American Male
            coefficients = {
                lnAge: 2.469,
                lnTotalChol: 0.302,
                lnHDL: -0.307,
                lnTreatedSBP: 1.916,
                lnUntreatedSBP: 1.809,
                smoker: 0.549,
                diabetic: 0.645
            };
            meanCoefSum = 19.54;
            baseSurvival = 0.8954;
        } else if (isMale && !isAA) {
            // White Male
            coefficients = {
                lnAge: 12.344,
                lnTotalChol: 11.853,
                lnAgeTotalChol: -2.664,
                lnHDL: -7.990,
                lnAgeHDL: 1.769,
                lnTreatedSBP: 1.797,
                lnUntreatedSBP: 1.764,
                smoker: 7.837,
                lnAgeSmoker: -1.795,
                diabetic: 0.658
            };
            meanCoefSum = 61.18;
            baseSurvival = 0.9144;
        } else if (!isMale && isAA) {
            // African American Female
            coefficients = {
                lnAge: 17.114,
                lnTotalChol: 0.940,
                lnHDL: -18.920,
                lnAgeHDL: 4.475,
                lnTreatedSBP: 29.291,
                lnAgeTreatedSBP: -6.432,
                lnUntreatedSBP: 27.820,
                lnAgeUntreatedSBP: -6.087,
                smoker: 0.691,
                diabetic: 0.874
            };
            meanCoefSum = 86.61;
            baseSurvival = 0.9533;
        } else {
            // White Female
            coefficients = {
                lnAge: -29.799,
                lnAgeSquared: 4.884,
                lnTotalChol: 13.540,
                lnAgeTotalChol: -3.114,
                lnHDL: -13.578,
                lnAgeHDL: 3.149,
                lnTreatedSBP: 2.019,
                lnUntreatedSBP: 1.957,
                smoker: 7.574,
                lnAgeSmoker: -1.665,
                diabetic: 0.661
            };
            meanCoefSum = -29.18;
            baseSurvival = 0.9665;
        }

        // Calculate individual sum
        const lnAge = Math.log(age);
        const lnTotalChol = Math.log(totalChol);
        const lnHDL = Math.log(hdl);
        const lnSBP = Math.log(systolicBP);

        let individualSum = 0;

        if (isMale && isAA) {
            individualSum = (lnAge * coefficients.lnAge) +
                (lnTotalChol * coefficients.lnTotalChol) +
                (lnHDL * coefficients.lnHDL) +
                (lnSBP * (onBPMeds ? coefficients.lnTreatedSBP : coefficients.lnUntreatedSBP)) +
                (smoker * coefficients.smoker) +
                (diabetic * coefficients.diabetic);
        } else if (isMale && !isAA) {
            individualSum = (lnAge * coefficients.lnAge) +
                (lnTotalChol * coefficients.lnTotalChol) +
                (lnAge * lnTotalChol * coefficients.lnAgeTotalChol) +
                (lnHDL * coefficients.lnHDL) +
                (lnAge * lnHDL * coefficients.lnAgeHDL) +
                (lnSBP * (onBPMeds ? coefficients.lnTreatedSBP : coefficients.lnUntreatedSBP)) +
                (smoker * coefficients.smoker) +
                (lnAge * smoker * coefficients.lnAgeSmoker) +
                (diabetic * coefficients.diabetic);
        } else if (!isMale && isAA) {
            individualSum = (lnAge * coefficients.lnAge) +
                (lnTotalChol * coefficients.lnTotalChol) +
                (lnHDL * coefficients.lnHDL) +
                (lnAge * lnHDL * coefficients.lnAgeHDL) +
                (onBPMeds ? (lnSBP * coefficients.lnTreatedSBP + lnAge * lnSBP * coefficients.lnAgeTreatedSBP) :
                    (lnSBP * coefficients.lnUntreatedSBP + lnAge * lnSBP * coefficients.lnAgeUntreatedSBP)) +
                (smoker * coefficients.smoker) +
                (diabetic * coefficients.diabetic);
        } else {
            individualSum = (lnAge * coefficients.lnAge) +
                (lnAge * lnAge * coefficients.lnAgeSquared) +
                (lnTotalChol * coefficients.lnTotalChol) +
                (lnAge * lnTotalChol * coefficients.lnAgeTotalChol) +
                (lnHDL * coefficients.lnHDL) +
                (lnAge * lnHDL * coefficients.lnAgeHDL) +
                (lnSBP * (onBPMeds ? coefficients.lnTreatedSBP : coefficients.lnUntreatedSBP)) +
                (smoker * coefficients.smoker) +
                (lnAge * smoker * coefficients.lnAgeSmoker) +
                (diabetic * coefficients.diabetic);
        }

        // Calculate risk
        const risk = 1 - Math.pow(baseSurvival, Math.exp(individualSum - meanCoefSum));
        const riskPercent = Math.max(0, Math.min(100, risk * 100));

        // Determine category
        let category;
        if (riskPercent < 5) {
            category = 'low';
        } else if (riskPercent < 7.5) {
            category = 'borderline';
        } else if (riskPercent < 20) {
            category = 'intermediate';
        } else {
            category = 'high';
        }

        return {
            risk: riskPercent,
            category: category,
            isAsian: isAsian,
            inputs: {
                age,
                totalCholesterol: Math.round(totalChol),
                hdl,
                systolicBP: Math.round(systolicBP),
                onBPMeds: profile.onBPMeds,
                diabetic: profile.diabetic,
                smoker: profile.smoker
            }
        };
    },

    /**
     * Render ASCVD risk on dashboard
     */
    renderASCVD() {
        const result = this.calculateASCVD();
        const scoreEl = document.getElementById('ascvdScore');
        const categoryEl = document.getElementById('ascvdCategory');
        const markerEl = document.getElementById('ascvdMarker');
        const detailsEl = document.getElementById('ascvdDetails');

        if (!scoreEl) return;

        // Clear display if no result
        if (!result) {
            scoreEl.textContent = '--';
            if (categoryEl) {
                categoryEl.textContent = 'Insufficient data';
                categoryEl.className = 'ascvd-category';
            }
            if (markerEl) markerEl.style.left = '0%';
            if (detailsEl) detailsEl.innerHTML = 'Need lab results (cholesterol, HDL) and profile data to calculate';
            return;
        }

        scoreEl.textContent = result.risk.toFixed(1);

        const categoryLabels = {
            low: 'Low Risk',
            borderline: 'Borderline Risk',
            intermediate: 'Intermediate Risk',
            high: 'High Risk'
        };

        categoryEl.textContent = categoryLabels[result.category];
        categoryEl.className = `ascvd-category ${result.category}`;

        // Position marker (0-30% scale, capped)
        const markerPos = Math.min(result.risk / 30 * 100, 100);
        markerEl.style.left = `${markerPos}%`;

        let detailsHtml = `Based on: Age ${result.inputs.age}, TC ${result.inputs.totalCholesterol}, HDL ${result.inputs.hdl}, SBP ${result.inputs.systolicBP}`;

        // Add note for Asian populations
        if (result.isAsian) {
            detailsHtml += `<br><span class="ascvd-note">Note: PCE may overestimate risk for Asian populations</span>`;
        }

        detailsEl.innerHTML = detailsHtml;
    },

    /**
     * Render Labs Summary for body-composition tracking users
     * Shows key markers from the most recent lab results
     */
    renderLabsSummary() {
        const container = document.getElementById('labMarkersSummary');
        const dateEl = document.getElementById('labMarkersDate');
        if (!container) return;

        const labs = this.data.labs || [];
        if (labs.length === 0) {
            container.innerHTML = '<p class="text-muted">No lab results yet</p>';
            if (dateEl) dateEl.textContent = '';
            return;
        }

        // Get the most recent lab
        const latestLab = labs[labs.length - 1];
        const panels = latestLab.panels || [];

        // Extract key markers based on user's health concerns
        const markers = [];
        const diagnoses = this.data.profile.diagnoses || [];
        const concerns = this.data.profile.healthConcerns || [];

        // Check for autoimmune-related diagnoses/concerns
        const hasAutoimmune = diagnoses.some(d =>
            d.name?.toLowerCase().includes('hashimoto') ||
            d.name?.toLowerCase().includes('autoimmune')
        ) || concerns.some(c =>
            c.name?.toLowerCase().includes('autoimmune') ||
            c.name?.toLowerCase().includes('thyroid')
        );

        // Extract markers from panels
        panels.forEach(panel => {
            const tests = panel.tests || [];
            tests.forEach(test => {
                const name = test.name;
                const value = test.value;
                const flag = test.flag;
                const prev = test.previous;

                // Priority markers for autoimmune/thyroid users
                if (hasAutoimmune) {
                    if (name.includes('ANA') || name.includes('Anti-Nuclear')) {
                        markers.push({ name: 'ANA', value, flag, type: flag ? 'critical' : 'normal' });
                    }
                    if (name.includes('Anti-Chromatin')) {
                        markers.push({ name: 'Anti-Chromatin', value, flag, type: flag ? 'critical' : 'normal', ref: test.reference });
                    }
                    if (name.includes('Anti-Smooth Muscle')) {
                        markers.push({ name: 'Anti-SMA', value, flag, type: flag ? 'abnormal' : 'normal' });
                    }
                }

                // Liver enzymes (common concern)
                if (name === 'AST (SGOT)' || name === 'ALT (SGPT)') {
                    const trend = prev ? (value < prev.value ? 'down' : 'up') : null;
                    const improved = prev && value < prev.value && prev.value > 40;
                    markers.push({
                        name: name.replace(' (SGOT)', '').replace(' (SGPT)', ''),
                        value,
                        flag,
                        type: improved ? 'improved' : (flag ? 'abnormal' : 'normal'),
                        trend,
                        prev: prev ? prev.value : null
                    });
                }

                // Lipase (if elevated)
                if (name === 'Lipase' && flag) {
                    markers.push({ name: 'Lipase', value, flag, type: 'abnormal', ref: test.reference });
                }
            });
        });

        // Limit to top 6 markers
        const displayMarkers = markers.slice(0, 6);

        if (displayMarkers.length === 0) {
            container.innerHTML = '<p class="text-muted">No key markers found</p>';
            if (dateEl) dateEl.textContent = `Last labs: ${this.formatDate(latestLab.date)}`;
            return;
        }

        container.innerHTML = displayMarkers.map(m => `
            <div class="lab-marker ${m.type}">
                <span class="marker-name">${m.name}</span>
                <span class="marker-value">${m.value}${m.flag ? ' ⚠' : ''}</span>
                ${m.trend ? `<span class="marker-trend ${m.trend}">${m.prev ? `(was ${m.prev})` : ''} ${m.trend === 'down' ? '↓' : '↑'}</span>` : ''}
            </div>
        `).join('');

        if (dateEl) dateEl.textContent = `Last labs: ${this.formatDate(latestLab.date)}`;
    },

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // User switcher
        document.getElementById('userSelect').addEventListener('change', async (e) => {
            await this.switchUser(e.target.value);
        });

        // Tab navigation
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // Time range buttons
        document.querySelectorAll('.range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.range-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const days = btn.dataset.days === 'all' ? 'all' : parseInt(btn.dataset.days);
                this.currentTimeRange = days;
                Charts.updateTimeRange(days, this.data);
            });
        });

        // BP Form
        document.getElementById('bpForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveBPReading();
        });

        // Seizure Form
        const seizureForm = document.getElementById('seizureForm');
        if (seizureForm) {
            seizureForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSeizureEpisode();
            });
        }

        // Medication Log Form
        const medLogForm = document.getElementById('medicationLogForm');
        if (medLogForm) {
            medLogForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveMedicationLog();
            });
        }

        // VeSync Import
        document.getElementById('importVesync').addEventListener('click', () => {
            this.importVeSync();
        });

        // Measurements Import
        document.getElementById('importMeasurements').addEventListener('click', () => {
            this.importMeasurements();
        });

        // Export Data
        document.getElementById('exportData').addEventListener('click', () => {
            this.exportData();
        });

        // Refresh staged files
        document.getElementById('refreshStaged').addEventListener('click', () => {
            this.loadStagedFiles();
        });

        // Concern selector - show/hide custom input
        document.getElementById('concernSelect').addEventListener('change', (e) => {
            const customGroup = document.getElementById('customConcernGroup');
            customGroup.style.display = e.target.value === 'custom' ? 'block' : 'none';
        });

        // Add concern
        document.getElementById('addConcern').addEventListener('click', () => {
            this.addHealthConcern();
        });

        // Profile form
        document.getElementById('profileForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveProfile();
        });
    },

    /**
     * Switch active tab
     */
    switchTab(tabName) {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        const tabButton = document.querySelector(`.tab[data-tab="${tabName}"]`);
        const tabContent = document.getElementById(tabName);

        if (tabButton && tabContent) {
            tabButton.classList.add('active');
            tabContent.classList.add('active');
            localStorage.setItem('healthTracker_currentTab', tabName);
        }

        // Re-render charts when switching to trends tab
        if (tabName === 'trends') {
            this.renderCharts();
        }
        // Render BP analysis when switching to data-entry tab
        if (tabName === 'data-entry') {
            this.renderBPAnalysis();
        }
        // Render profile when switching to profile tab
        if (tabName === 'profile') {
            this.renderProfile();
            this.renderHealthConcerns();
        }
    },

    /**
     * Render dashboard with current metrics and goals
     */
    renderDashboard() {
        const readings = this.data.scaleReadings || [];
        const goals = this.data.profile.goals || {};

        // Always render priorities and labs summary
        this.renderDashboardPriorities();
        this.renderLabsSummary();

        // Update goal target displays (always show these)
        document.getElementById('goalWeightTarget').textContent = goals.weight?.target || '--';
        document.getElementById('goalVisceralFatTarget').textContent = goals.visceralFat?.target ? '<' + goals.visceralFat.target : '--';
        document.getElementById('goalBMITarget').textContent = goals.bmi?.target ? '<' + goals.bmi.target : '--';

        // Update BP target display
        const bpTargetDisplay = document.getElementById('bpTargetDisplay');
        if (bpTargetDisplay && goals.bloodPressure) {
            bpTargetDisplay.textContent = `Target: <${goals.bloodPressure.systolic}/${goals.bloodPressure.diastolic}`;
        }

        // Handle case with no scale readings
        if (readings.length === 0) {
            document.getElementById('latestDate').textContent = 'No scale data yet';
            document.getElementById('currentWeight').textContent = '--';
            document.getElementById('currentBMI').textContent = '--';
            document.getElementById('currentBodyFat').textContent = '--';
            document.getElementById('currentVisceralFat').textContent = '--';
            document.getElementById('currentMuscleMass').textContent = '--';
            document.getElementById('currentBMR').textContent = '--';

            // Clear goal progress
            this.clearGoalProgress('goalWeight');
            this.clearGoalProgress('goalVisceralFat');
            this.clearGoalProgress('goalBMI');

            // Clear mini chart
            const miniCanvas = document.getElementById('miniWeightChart');
            if (miniCanvas) {
                Charts.renderMiniWeightChart(miniCanvas, [], goals);
            }

            // Clear or render BP based on availability
            const bpData = this.data.bloodPressure || [];
            if (bpData.length > 0) {
                this.renderLatestBP(bpData[bpData.length - 1]);
            } else {
                this.clearLatestBP();
            }

            // Still render ASCVD if we have lab data
            this.renderASCVD();
            return;
        }

        // Get latest reading
        const latest = readings[readings.length - 1];
        const latestDate = new Date(latest.timestamp);

        // Update current metrics
        document.getElementById('latestDate').textContent =
            `Last reading: ${latestDate.toLocaleDateString()} ${latestDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        document.getElementById('currentWeight').textContent = latest.weight?.toFixed(1) || '--';
        document.getElementById('currentBMI').textContent = latest.bmi?.toFixed(1) || '--';
        document.getElementById('currentBodyFat').textContent = latest.bodyFatPercent?.toFixed(1) || '--';
        document.getElementById('currentVisceralFat').textContent = latest.visceralFat || '--';
        document.getElementById('currentMuscleMass').textContent = latest.muscleMass?.toFixed(1) || '--';
        document.getElementById('currentBMR').textContent = latest.bmr || '--';

        // Update goal progress
        this.updateGoalProgress('goalWeight', latest.weight, goals.weight?.target, 'lbs', 'down');
        this.updateGoalProgress('goalVisceralFat', latest.visceralFat, goals.visceralFat?.target, '', 'down');
        this.updateGoalProgress('goalBMI', latest.bmi, goals.bmi?.target, '', 'down');

        // Update BP if available
        if (this.data.bloodPressure && this.data.bloodPressure.length > 0) {
            const latestBP = this.data.bloodPressure[this.data.bloodPressure.length - 1];
            this.renderLatestBP(latestBP);
        } else {
            this.clearLatestBP();
        }

        // Render mini weight chart
        const miniCanvas = document.getElementById('miniWeightChart');
        if (miniCanvas) {
            Charts.renderMiniWeightChart(miniCanvas, readings, goals);
        }

        // Render ASCVD risk
        this.renderASCVD();
    },

    /**
     * Clear goal progress display
     */
    clearGoalProgress(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        const currentSpan = element.querySelector('.goal-current');
        const progressFill = element.querySelector('.progress-fill');
        const remaining = element.querySelector('.goal-remaining');

        if (currentSpan) currentSpan.textContent = '--';
        if (progressFill) progressFill.style.width = '0%';
        if (remaining) remaining.textContent = '';
    },

    /**
     * Render health priorities on dashboard
     */
    renderDashboardPriorities() {
        const container = document.getElementById('dashboardPriorities');
        if (!container) return;

        const concerns = this.data.profile.healthConcerns || [];

        if (concerns.length === 0) {
            container.innerHTML = '<p class="text-muted">No priorities set. <a href="#" onclick="App.switchTab(\'profile\'); return false;">Add some</a></p>';
            return;
        }

        // Show top 5 concerns
        container.innerHTML = concerns.slice(0, 5).map((concern, index) => `
            <div class="priority-item ${concern.urgency}">
                <span class="priority-number">${index + 1}</span>
                <span class="priority-name">${concern.name}</span>
            </div>
        `).join('');
    },

    /**
     * Update goal progress bar
     */
    updateGoalProgress(elementId, current, target, unit, direction) {
        const element = document.getElementById(elementId);
        if (!element || current === null || current === undefined) return;

        const currentSpan = element.querySelector('.goal-current');
        const progressFill = element.querySelector('.progress-fill');
        const remaining = element.querySelector('.goal-remaining');

        currentSpan.textContent = typeof current === 'number' ? current.toFixed(1) : current;

        // Calculate progress (for "down" goals like weight loss)
        let progress, diff;
        if (direction === 'down') {
            // Assume starting point was higher
            const startWeight = 195; // Approximate starting point
            progress = ((startWeight - current) / (startWeight - target)) * 100;
            diff = current - target;
        } else {
            progress = (current / target) * 100;
            diff = target - current;
        }

        progress = Math.min(100, Math.max(0, progress));
        progressFill.style.width = `${progress}%`;

        // Color based on proximity to goal
        if (progress >= 90) {
            progressFill.className = 'progress-fill on-track';
        } else if (progress >= 60) {
            progressFill.className = 'progress-fill close';
        } else {
            progressFill.className = 'progress-fill off-track';
        }

        remaining.textContent = diff > 0 ? `${diff.toFixed(1)} ${unit} to go` : 'Goal reached!';
    },

    /**
     * Render latest blood pressure reading
     */
    renderLatestBP(bp) {
        const container = document.getElementById('latestBP');
        if (!container) return;

        const systolicEl = container.querySelector('.bp-systolic');
        const diastolicEl = container.querySelector('.bp-diastolic');
        const dateEl = container.querySelector('.bp-date');
        const statusEl = container.querySelector('.bp-status');

        systolicEl.textContent = bp.systolic;
        diastolicEl.textContent = bp.diastolic;

        // Color systolic based on range
        if (bp.systolic < 120) {
            systolicEl.className = 'bp-systolic bp-normal';
        } else if (bp.systolic < 130) {
            systolicEl.className = 'bp-systolic bp-elevated';
        } else if (bp.systolic < 140) {
            systolicEl.className = 'bp-systolic bp-stage1';
        } else {
            systolicEl.className = 'bp-systolic bp-stage2';
        }

        // Color diastolic based on range
        if (bp.diastolic < 80) {
            diastolicEl.className = 'bp-diastolic bp-normal';
        } else if (bp.diastolic < 90) {
            diastolicEl.className = 'bp-diastolic bp-stage1';
        } else {
            diastolicEl.className = 'bp-diastolic bp-stage2';
        }

        dateEl.textContent = this.formatDate(bp.date || bp.timestamp);

        // Classify BP using AHA standards
        const classification = this.classifyBP(bp.systolic, bp.diastolic);

        statusEl.textContent = classification.status;
        statusEl.className = `bp-status ${classification.statusClass}`;
        statusEl.title = classification.description;

        // Update BP target display
        const goals = this.data.profile.goals.bloodPressure;
        const targetDisplay = document.getElementById('bpTargetDisplay');
        if (targetDisplay) {
            targetDisplay.textContent = `Goal: <${goals.systolic}/${goals.diastolic}`;
        }
    },

    /**
     * Clear latest blood pressure display
     */
    clearLatestBP() {
        const container = document.getElementById('latestBP');
        if (!container) return;

        const systolicEl = container.querySelector('.bp-systolic');
        const diastolicEl = container.querySelector('.bp-diastolic');
        const dateEl = container.querySelector('.bp-date');
        const statusEl = container.querySelector('.bp-status');

        if (systolicEl) systolicEl.textContent = '--';
        if (diastolicEl) diastolicEl.textContent = '--';
        if (dateEl) dateEl.textContent = 'No readings yet';
        if (statusEl) {
            statusEl.textContent = '';
            statusEl.className = 'bp-status';
        }
    },

    /**
     * Render all charts
     */
    renderCharts() {
        const readings = this.data.scaleReadings || [];
        const goals = this.data.profile?.goals || {};
        const days = this.currentTimeRange;
        const inbodyScans = this.data.inbodyScans || [];
        const bloodPressure = this.data.bloodPressure || [];
        const measurements = this.data.measurements || [];

        const weightCanvas = document.getElementById('weightChart');
        const compositionCanvas = document.getElementById('compositionChart');
        const visceralCanvas = document.getElementById('visceralChart');
        const bpCanvas = document.getElementById('bpChart');
        const measurementsCanvas = document.getElementById('measurementsChart');

        if (readings.length > 0) {
            if (weightCanvas) Charts.renderWeightChart(weightCanvas, readings, goals, days, inbodyScans);
            if (compositionCanvas) Charts.renderCompositionChart(compositionCanvas, readings, days, inbodyScans);
            if (visceralCanvas) Charts.renderVisceralChart(visceralCanvas, readings, goals, days, inbodyScans);
        } else {
            // Clear charts when no data
            if (weightCanvas) Charts.clearChart(weightCanvas);
            if (compositionCanvas) Charts.clearChart(compositionCanvas);
            if (visceralCanvas) Charts.clearChart(visceralCanvas);
        }

        if (bloodPressure.length > 0) {
            if (bpCanvas) Charts.renderBPChart(bpCanvas, bloodPressure, goals, days);
        } else {
            if (bpCanvas) Charts.clearChart(bpCanvas);
        }

        if (measurements.length > 0) {
            if (measurementsCanvas) Charts.renderMeasurementsChart(measurementsCanvas, measurements);
        } else {
            if (measurementsCanvas) Charts.clearChart(measurementsCanvas);
        }

        // Seizure tracking charts
        const seizureEpisodes = this.data.seizureEpisodes || [];
        const medicationLog = this.data.medicationLog || [];

        const seizureCanvas = document.getElementById('seizureFrequencyChart');
        const medAdherenceCanvas = document.getElementById('medicationAdherenceChart');
        const sideEffectsCanvas = document.getElementById('sideEffectsChart');

        if (seizureCanvas) {
            if (seizureEpisodes.length > 0) {
                Charts.renderSeizureFrequencyChart(seizureCanvas, seizureEpisodes, days);
            } else {
                Charts.clearChart(seizureCanvas);
            }
        }

        if (medAdherenceCanvas) {
            Charts.renderMedicationAdherenceChart(medAdherenceCanvas, medicationLog, days);
        }

        if (sideEffectsCanvas) {
            Charts.renderSideEffectsChart(sideEffectsCanvas, medicationLog, days);
        }
    },

    /**
     * Save BP reading from form
     */
    async saveBPReading() {
        const date = document.getElementById('bpDate').value;
        const time = document.getElementById('bpTime').value || '12:00';
        const systolic = parseInt(document.getElementById('systolic').value);
        const diastolic = parseInt(document.getElementById('diastolic').value);
        const pulse = document.getElementById('bpPulse').value;
        const setting = document.getElementById('bpSetting').value;
        const notes = document.getElementById('bpNotes').value;

        const reading = {
            date: date,
            timestamp: `${date}T${time}:00`,
            systolic,
            diastolic,
            setting,
            notes
        };

        if (pulse) reading.pulse = parseInt(pulse);

        try {
            const response = await fetch(`/api/users/${this.currentUser}/blood-pressure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reading)
            });

            if (!response.ok) throw new Error('Failed to save');

            const result = await response.json();
            reading.id = result.id;

            this.data.bloodPressure.push(reading);
            this.data.bloodPressure.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            this.renderDashboard();
            this.renderBPReadings();
            this.renderBPAnalysis();
            this.renderCharts();

            // Reset form
            document.getElementById('bpForm').reset();
            document.getElementById('bpDate').value = this.getTodayString();
        } catch (error) {
            console.error('Error saving BP:', error);
            alert('Failed to save blood pressure reading. Please try again.');
        }
    },

    /**
     * Render BP readings list
     */
    renderBPReadings() {
        const container = document.getElementById('bpReadingsList');
        if (!container) return;

        const bpData = this.data.bloodPressure || [];
        const readings = [...bpData].reverse().slice(0, 20);

        if (readings.length === 0) {
            container.innerHTML = '<p class="text-muted">No blood pressure readings yet.</p>';
            return;
        }

        container.innerHTML = readings.map((bp) => {
            const dateStr = bp.date || bp.timestamp;

            return `
                <div class="reading-item">
                    <div>
                        <span class="reading-values">${bp.systolic}/${bp.diastolic}</span>
                        ${bp.pulse ? `<span class="text-muted"> (${bp.pulse} bpm)</span>` : ''}
                        <div class="reading-date">${this.formatDate(dateStr)} - ${bp.setting || 'home'}</div>
                    </div>
                    <button class="reading-delete" onclick="App.deleteBPReading(${bp.id})">Delete</button>
                </div>
            `;
        }).join('');
    },

    /**
     * Delete BP reading
     */
    async deleteBPReading(id) {
        if (!confirm('Delete this blood pressure reading?')) return;

        try {
            const response = await fetch(`/api/users/${this.currentUser}/blood-pressure/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete');

            this.data.bloodPressure = this.data.bloodPressure.filter(bp => bp.id !== id);
            this.renderDashboard();
            this.renderBPReadings();
            this.renderBPAnalysis();
            this.renderCharts();
        } catch (error) {
            console.error('Error deleting BP:', error);
            alert('Failed to delete. Please try again.');
        }
    },

    /**
     * Render BP Analysis section
     */
    renderBPAnalysis() {
        const readings = this.data.bloodPressure || [];

        // Clear analysis if no readings
        if (readings.length === 0) {
            this.clearBPAnalysis();
            return;
        }

        const goals = this.data.profile?.goals?.bloodPressure || { systolic: 120, diastolic: 80 };

        // Calculate time-of-day averages
        const morning = readings.filter(bp => {
            const hour = this.getHourFromTimestamp(bp.timestamp);
            return hour < 12;
        });
        const evening = readings.filter(bp => {
            const hour = this.getHourFromTimestamp(bp.timestamp);
            return hour >= 12;
        });

        this.renderTimeOfDayStats(morning, evening, goals);
        this.renderWeeklyStats(readings, goals);
        this.renderMonthlyStats(readings, goals);
        this.renderAboveTarget(readings, goals);
    },

    /**
     * Get hour from timestamp string
     */
    getHourFromTimestamp(timestamp) {
        if (!timestamp) return 12;
        const match = timestamp.match(/T(\d{2}):/);
        return match ? parseInt(match[1]) : 12;
    },

    /**
     * Calculate average BP from readings
     */
    calculateBPAverage(readings) {
        if (!readings || readings.length === 0) return null;
        const sum = readings.reduce((acc, bp) => ({
            systolic: acc.systolic + bp.systolic,
            diastolic: acc.diastolic + bp.diastolic
        }), { systolic: 0, diastolic: 0 });
        return {
            systolic: Math.round(sum.systolic / readings.length),
            diastolic: Math.round(sum.diastolic / readings.length)
        };
    },

    /**
     * Check if BP is above target
     */
    isAboveTarget(bp, goals) {
        return bp.systolic > goals.systolic || bp.diastolic > goals.diastolic;
    },

    /**
     * Classify blood pressure using AHA (American Heart Association) standards
     * Returns status, CSS class, and description for tooltip
     */
    classifyBP(systolic, diastolic) {
        // Hypertensive Crisis: >180 systolic and/or >120 diastolic
        if (systolic > 180 || diastolic > 120) {
            return {
                status: 'Crisis',
                statusClass: 'crisis',
                description: 'Hypertensive Crisis (>180 and/or >120) - Seek immediate medical attention'
            };
        }
        // Stage 2 Hypertension: >=140 systolic or >=90 diastolic
        if (systolic >= 140 || diastolic >= 90) {
            return {
                status: 'Stage 2',
                statusClass: 'stage2',
                description: 'Stage 2 Hypertension (>=140 or >=90)'
            };
        }
        // Stage 1 Hypertension: 130-139 systolic or 80-89 diastolic
        if (systolic >= 130 || diastolic >= 80) {
            return {
                status: 'Stage 1',
                statusClass: 'stage1',
                description: 'Stage 1 Hypertension (130-139 or 80-89)'
            };
        }
        // Elevated: 120-129 systolic and <80 diastolic
        if (systolic >= 120 && diastolic < 80) {
            return {
                status: 'Elevated',
                statusClass: 'elevated',
                description: 'Elevated (120-129 and <80)'
            };
        }
        // Normal: <120 systolic and <80 diastolic
        return {
            status: 'Normal',
            statusClass: 'normal',
            description: 'Normal (<120 and <80)'
        };
    },

    /**
     * Render time-of-day stats
     */
    renderTimeOfDayStats(morning, evening, goals) {
        const morningAvg = this.calculateBPAverage(morning);
        const eveningAvg = this.calculateBPAverage(evening);

        const morningAvgEl = document.getElementById('bpMorningAvg');
        const morningCountEl = document.getElementById('bpMorningCount');
        const eveningAvgEl = document.getElementById('bpEveningAvg');
        const eveningCountEl = document.getElementById('bpEveningCount');

        // Morning stats - clear if no data
        if (morningAvgEl) {
            if (morningAvg) {
                morningAvgEl.textContent = `${morningAvg.systolic}/${morningAvg.diastolic}`;
                morningAvgEl.className = 'bp-stat-value ' +
                    (this.isAboveTarget(morningAvg, goals) ? 'above-target' : 'at-target');
                morningCountEl.textContent = `(${morning.length} readings)`;
            } else {
                morningAvgEl.textContent = '--/--';
                morningAvgEl.className = 'bp-stat-value';
                morningCountEl.textContent = '(0 readings)';
            }
        }

        // Evening stats - clear if no data
        if (eveningAvgEl) {
            if (eveningAvg) {
                eveningAvgEl.textContent = `${eveningAvg.systolic}/${eveningAvg.diastolic}`;
                eveningAvgEl.className = 'bp-stat-value ' +
                    (this.isAboveTarget(eveningAvg, goals) ? 'above-target' : 'at-target');
                eveningCountEl.textContent = `(${evening.length} readings)`;
            } else {
                eveningAvgEl.textContent = '--/--';
                eveningAvgEl.className = 'bp-stat-value';
                eveningCountEl.textContent = '(0 readings)';
            }
        }
    },

    /**
     * Render weekly stats
     */
    renderWeeklyStats(readings, goals) {
        const container = document.getElementById('bpWeeklyStats');
        if (!container) return;

        // Group by week
        const weeks = {};
        readings.forEach(bp => {
            const date = this.parseLocalDate(bp.date);
            if (!date) return;
            // Get start of week (Sunday)
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            const weekKey = weekStart.toISOString().split('T')[0];
            if (!weeks[weekKey]) weeks[weekKey] = [];
            weeks[weekKey].push(bp);
        });

        // Sort weeks descending and take last 8
        const sortedWeeks = Object.entries(weeks)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 8);

        container.innerHTML = sortedWeeks.map(([weekStart, bps]) => {
            const avg = this.calculateBPAverage(bps);
            const weekDate = this.parseLocalDate(weekStart);
            const weekEnd = new Date(weekDate);
            weekEnd.setDate(weekDate.getDate() + 6);
            const label = `${weekDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            const aboveClass = this.isAboveTarget(avg, goals) ? 'above-target' : 'at-target';

            return `
                <div class="bp-stat-row">
                    <span class="bp-stat-label">${label}</span>
                    <span class="bp-stat-value ${aboveClass}">${avg.systolic}/${avg.diastolic}</span>
                    <span class="bp-stat-count">(${bps.length})</span>
                </div>
            `;
        }).join('');
    },

    /**
     * Render monthly stats
     */
    renderMonthlyStats(readings, goals) {
        const container = document.getElementById('bpMonthlyStats');
        if (!container) return;

        // Group by month
        const months = {};
        readings.forEach(bp => {
            const date = this.parseLocalDate(bp.date);
            if (!date) return;
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!months[monthKey]) months[monthKey] = [];
            months[monthKey].push(bp);
        });

        // Sort months descending
        const sortedMonths = Object.entries(months)
            .sort((a, b) => b[0].localeCompare(a[0]));

        container.innerHTML = sortedMonths.map(([monthKey, bps]) => {
            const avg = this.calculateBPAverage(bps);
            const [year, month] = monthKey.split('-');
            const monthDate = new Date(year, month - 1);
            const label = monthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            const aboveClass = this.isAboveTarget(avg, goals) ? 'above-target' : 'at-target';

            return `
                <div class="bp-stat-row">
                    <span class="bp-stat-label">${label}</span>
                    <span class="bp-stat-value ${aboveClass}">${avg.systolic}/${avg.diastolic}</span>
                    <span class="bp-stat-count">(${bps.length})</span>
                </div>
            `;
        }).join('');
    },

    /**
     * Render readings above target
     */
    renderAboveTarget(readings, goals) {
        const container = document.getElementById('bpAboveTarget');
        if (!container) return;

        // Update the header label with current target
        const labelEl = document.getElementById('bpAboveTargetLabel');
        if (labelEl) {
            labelEl.textContent = `>${goals.systolic}/${goals.diastolic}`;
        }

        const aboveTarget = readings.filter(bp => this.isAboveTarget(bp, goals));
        const percentage = Math.round((aboveTarget.length / readings.length) * 100);

        // Summary
        let html = `
            <div class="bp-above-summary">
                <div class="count">${aboveTarget.length} of ${readings.length}</div>
                <div class="label">${percentage}% of readings above target</div>
            </div>
        `;

        // List recent above-target readings (last 10)
        const recentAbove = [...aboveTarget]
            .sort((a, b) => (b.date || b.timestamp).localeCompare(a.date || a.timestamp))
            .slice(0, 10);

        html += recentAbove.map(bp => `
            <div class="bp-above-item">
                <span class="bp-value">${bp.systolic}/${bp.diastolic}</span>
                <span class="bp-date">${this.formatDate(bp.date)} ${bp.setting ? `(${bp.setting})` : ''}</span>
            </div>
        `).join('');

        container.innerHTML = html;
    },

    /**
     * Clear BP Analysis section
     */
    clearBPAnalysis() {
        // Clear time-of-day stats
        const morningAvgEl = document.getElementById('bpMorningAvg');
        const morningCountEl = document.getElementById('bpMorningCount');
        const eveningAvgEl = document.getElementById('bpEveningAvg');
        const eveningCountEl = document.getElementById('bpEveningCount');

        if (morningAvgEl) {
            morningAvgEl.textContent = '--/--';
            morningAvgEl.className = 'bp-stat-value';
        }
        if (morningCountEl) morningCountEl.textContent = '(0 readings)';
        if (eveningAvgEl) {
            eveningAvgEl.textContent = '--/--';
            eveningAvgEl.className = 'bp-stat-value';
        }
        if (eveningCountEl) eveningCountEl.textContent = '(0 readings)';

        // Clear weekly stats
        const weeklyContainer = document.getElementById('bpWeeklyStats');
        if (weeklyContainer) weeklyContainer.innerHTML = '<p class="text-muted">No data</p>';

        // Clear monthly stats
        const monthlyContainer = document.getElementById('bpMonthlyStats');
        if (monthlyContainer) monthlyContainer.innerHTML = '<p class="text-muted">No data</p>';

        // Clear above target
        const aboveContainer = document.getElementById('bpAboveTarget');
        if (aboveContainer) aboveContainer.innerHTML = '<p class="text-muted">No data</p>';
    },

    /**
     * Import VeSync CSV
     */
    async importVeSync() {
        const fileInput = document.getElementById('vesyncFile');
        const statusEl = document.getElementById('vesyncStatus');

        if (!fileInput.files.length) {
            statusEl.className = 'import-status error';
            statusEl.textContent = 'Please select a CSV file first.';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const readings = DataImport.parseVeSync(e.target.result);

                // Send to server
                const response = await fetch(`/api/users/${this.currentUser}/scale-readings`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(readings)
                });

                if (!response.ok) throw new Error('Failed to save');

                const result = await response.json();

                // Merge locally
                const merged = DataImport.mergeReadings(this.data.scaleReadings, readings);
                const newCount = merged.length - this.data.scaleReadings.length;
                this.data.scaleReadings = merged;

                this.renderDashboard();
                this.renderCharts();

                statusEl.className = 'import-status success';
                statusEl.textContent = `Imported ${readings.length} readings (${newCount} new).`;
            } catch (error) {
                statusEl.className = 'import-status error';
                statusEl.textContent = `Error: ${error.message}`;
            }
        };

        reader.readAsText(fileInput.files[0]);
    },

    /**
     * Import Measurements CSV
     */
    async importMeasurements() {
        const fileInput = document.getElementById('measurementsFile');
        const statusEl = document.getElementById('measurementsStatus');

        if (!fileInput.files.length) {
            statusEl.className = 'import-status error';
            statusEl.textContent = 'Please select a CSV file first.';
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const measurements = DataImport.parseMeasurements(e.target.result);

                // Merge with existing (by date)
                const existingDates = new Set(this.data.measurements.map(m => m.date));
                const newMeasurements = measurements.filter(m => !existingDates.has(m.date));

                // Save each new measurement to the server
                for (const meas of newMeasurements) {
                    await fetch(`/api/users/${this.currentUser}/measurements`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(meas)
                    });
                }

                this.data.measurements = [...this.data.measurements, ...newMeasurements]
                    .sort((a, b) => new Date(a.date) - new Date(b.date));

                this.renderCharts();

                statusEl.className = 'import-status success';
                statusEl.textContent = `Imported ${measurements.length} measurement dates (${newMeasurements.length} new).`;
            } catch (error) {
                statusEl.className = 'import-status error';
                statusEl.textContent = `Error: ${error.message}`;
            }
        };

        reader.readAsText(fileInput.files[0]);
    },

    /**
     * Load staged JSON files for import
     */
    async loadStagedFiles() {
        const container = document.getElementById('stagedFiles');
        // In a real implementation, this would list files from the imports folder
        // For now, show a message about manual import
        container.innerHTML = `
            <p class="text-muted">
                To import AI-extracted data, place JSON files in <code>app/data/imports/</code>
                and reload the page, or use the manual JSON import below.
            </p>
            <div class="form-group">
                <label>Import JSON Data:</label>
                <input type="file" id="jsonImportFile" accept=".json">
                <button class="btn btn-primary" style="margin-top: 0.5rem;" onclick="App.importJSON()">
                    Import JSON
                </button>
            </div>
        `;
    },

    /**
     * Import JSON data (InBody, labs, etc.)
     */
    async importJSON() {
        const fileInput = document.getElementById('jsonImportFile');
        if (!fileInput || !fileInput.files.length) {
            alert('Please select a JSON file first.');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // Detect data type and save to server
                if (data.source === 'InBody' || data.skeletalMuscleMass !== undefined) {
                    const response = await fetch(`/api/users/${this.currentUser}/inbody-scans`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if (!response.ok) throw new Error('Failed to save');

                    this.data.inbodyScans.push(data);
                    this.data.inbodyScans.sort((a, b) => new Date(a.date) - new Date(b.date));
                    alert('InBody scan imported successfully!');
                } else if (data.results || data.source === 'lab') {
                    const response = await fetch(`/api/users/${this.currentUser}/labs`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data)
                    });
                    if (!response.ok) throw new Error('Failed to save');

                    this.data.labs.push(data);
                    this.data.labs.sort((a, b) => new Date(a.date) - new Date(b.date));
                    alert('Lab results imported successfully!');
                } else {
                    alert('Unknown data format. Please ensure the JSON matches expected schema.');
                    return;
                }

                this.updateDataSummary();
            } catch (error) {
                alert(`Error: ${error.message}`);
            }
        };

        reader.readAsText(fileInput.files[0]);
    },

    /**
     * Update data summary counts
     */
    updateDataSummary() {
        document.getElementById('scaleCount').textContent = (this.data.scaleReadings || []).length;
        document.getElementById('bpCount').textContent = (this.data.bloodPressure || []).length;
        document.getElementById('measurementCount').textContent = (this.data.measurements || []).length;
        document.getElementById('inbodyCount').textContent = (this.data.inbodyScans || []).length;
        document.getElementById('labCount').textContent = (this.data.labs || []).length;
    },

    /**
     * Health concern name mapping
     */
    concernNames: {
        'high-bp': 'High Blood Pressure',
        'cholesterol': 'High Cholesterol / Lipids',
        'heart-disease': 'Heart Disease Risk',
        'insulin-resistance': 'Insulin Resistance / Pre-diabetes',
        'diabetes': 'Diabetes Management',
        'metabolic-syndrome': 'Metabolic Syndrome',
        'visceral-fat': 'Visceral Fat',
        'weight-loss': 'Weight Loss',
        'muscle-gain': 'Muscle Building',
        'body-fat': 'Body Fat Reduction',
        'liver': 'Liver Health (Elevated Enzymes)',
        'kidney': 'Kidney Function',
        'thyroid': 'Thyroid Issues',
        'inflammation': 'Chronic Inflammation',
        'allergies': 'Allergies',
        'sleep': 'Sleep Quality',
        'energy': 'Energy / Fatigue'
    },

    /**
     * Add a health concern
     */
    async addHealthConcern() {
        const select = document.getElementById('concernSelect');
        const customName = document.getElementById('customConcernName');
        const notes = document.getElementById('concernNotes');
        const urgency = document.getElementById('concernUrgency');

        if (!select.value) {
            alert('Please select a health concern');
            return;
        }

        // Initialize healthConcerns array if not exists
        if (!this.data.profile.healthConcerns) {
            this.data.profile.healthConcerns = [];
        }

        const concernId = select.value === 'custom' ?
            'custom-' + Date.now() : select.value;
        const concernName = select.value === 'custom' ?
            customName.value : this.concernNames[select.value];

        if (select.value === 'custom' && !customName.value) {
            alert('Please enter a name for your custom concern');
            return;
        }

        // Check for duplicates
        if (this.data.profile.healthConcerns.some(c => c.id === concernId)) {
            alert('This concern is already in your list');
            return;
        }

        const concern = {
            id: concernId,
            name: concernName,
            notes: notes.value,
            urgency: urgency.value,
            addedDate: new Date().toISOString().split('T')[0]
        };

        try {
            const response = await fetch(`/api/users/${this.currentUser}/health-concerns`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(concern)
            });

            if (!response.ok) throw new Error('Failed to save');

            this.data.profile.healthConcerns.push(concern);
            this.renderHealthConcerns();

            // Reset form
            select.value = '';
            customName.value = '';
            notes.value = '';
            urgency.value = 'monitor';
            document.getElementById('customConcernGroup').style.display = 'none';
        } catch (error) {
            console.error('Error adding concern:', error);
            alert('Failed to add health concern. Please try again.');
        }
    },

    /**
     * Remove a health concern
     */
    async removeHealthConcern(concernId) {
        if (!confirm('Remove this health concern?')) return;

        try {
            const response = await fetch(`/api/users/${this.currentUser}/health-concerns/${concernId}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete');

            this.data.profile.healthConcerns = this.data.profile.healthConcerns.filter(c => c.id !== concernId);
            this.renderHealthConcerns();
        } catch (error) {
            console.error('Error removing concern:', error);
            alert('Failed to remove health concern. Please try again.');
        }
    },

    /**
     * Move concern up in priority
     */
    async moveConcernUp(index) {
        if (index === 0) return;
        const concerns = this.data.profile.healthConcerns;
        [concerns[index - 1], concerns[index]] = [concerns[index], concerns[index - 1]];

        try {
            await fetch(`/api/users/${this.currentUser}/profile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ healthConcerns: concerns })
            });
            this.renderHealthConcerns();
        } catch (error) {
            console.error('Error moving concern:', error);
        }
    },

    /**
     * Move concern down in priority
     */
    async moveConcernDown(index) {
        const concerns = this.data.profile.healthConcerns;
        if (index >= concerns.length - 1) return;
        [concerns[index], concerns[index + 1]] = [concerns[index + 1], concerns[index]];

        try {
            await fetch(`/api/users/${this.currentUser}/profile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ healthConcerns: concerns })
            });
            this.renderHealthConcerns();
        } catch (error) {
            console.error('Error moving concern:', error);
        }
    },

    /**
     * Render health concerns list
     */
    renderHealthConcerns() {
        const container = document.getElementById('concernsList');
        if (!container) return;

        const concerns = this.data.profile.healthConcerns || [];

        if (concerns.length === 0) {
            container.innerHTML = '<p class="text-muted">No health concerns added yet. Add your priorities below.</p>';
            return;
        }

        container.innerHTML = concerns.map((concern, index) => `
            <div class="concern-item urgency-${concern.urgency}">
                <span class="concern-priority">${index + 1}</span>
                <div class="concern-content">
                    <div class="concern-name">${concern.name}</div>
                    ${concern.notes ? `<div class="concern-notes">${concern.notes}</div>` : ''}
                    <span class="concern-urgency ${concern.urgency}">${concern.urgency}</span>
                </div>
                <div class="concern-actions">
                    <button onclick="App.moveConcernUp(${index})" title="Move up">↑</button>
                    <button onclick="App.moveConcernDown(${index})" title="Move down">↓</button>
                    <button onclick="App.removeHealthConcern('${concern.id}')" title="Remove">×</button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Render profile form with current values
     */
    renderProfile() {
        const profile = this.data.profile;

        // Set form values
        document.getElementById('profileAge').value = profile.age || '';
        document.getElementById('profileHeight').value = profile.height || '';
        document.getElementById('profileSex').value = profile.sex || 'male';

        // Handle race checkboxes (support both old single value and new array format)
        const raceArray = Array.isArray(profile.race) ? profile.race : (profile.race ? [profile.race] : []);
        // Map old 'african-american' to 'black'
        const normalizedRaces = raceArray.map(r => r === 'african-american' ? 'black' : r);
        document.querySelectorAll('input[name="profileRace"]').forEach(cb => {
            cb.checked = normalizedRaces.includes(cb.value);
        });

        document.getElementById('profileSmoker').checked = profile.smoker || false;
        document.getElementById('profileBPMeds').checked = profile.onBPMeds || false;
        document.getElementById('profileDiabetic').checked = profile.diabetic || false;

        // Goals
        document.getElementById('inputGoalWeight').value = profile.goals?.weight?.target || '';
        document.getElementById('inputGoalBMI').value = profile.goals?.bmi?.target || '';
        document.getElementById('inputGoalVisceralFat').value = profile.goals?.visceralFat?.target || '';
        document.getElementById('inputGoalSystolic').value = profile.goals?.bloodPressure?.systolic || '';
        document.getElementById('inputGoalDiastolic').value = profile.goals?.bloodPressure?.diastolic || '';
    },

    /**
     * Save profile from form
     */
    async saveProfile() {
        const profile = this.data.profile;

        profile.age = parseInt(document.getElementById('profileAge').value) || null;
        profile.height = parseInt(document.getElementById('profileHeight').value) || null;
        profile.sex = document.getElementById('profileSex').value;

        // Read race checkboxes as array
        const selectedRaces = [];
        document.querySelectorAll('input[name="profileRace"]:checked').forEach(cb => {
            selectedRaces.push(cb.value);
        });
        profile.race = selectedRaces;

        profile.smoker = document.getElementById('profileSmoker').checked;
        profile.onBPMeds = document.getElementById('profileBPMeds').checked;
        profile.diabetic = document.getElementById('profileDiabetic').checked;

        // Goals
        if (!profile.goals) profile.goals = {};
        profile.goals.weight = {
            target: parseInt(document.getElementById('inputGoalWeight').value) || 150,
            unit: 'lbs'
        };
        profile.goals.bmi = {
            target: parseFloat(document.getElementById('inputGoalBMI').value) || 24.9,
            comparison: '<'
        };
        profile.goals.visceralFat = {
            target: parseInt(document.getElementById('inputGoalVisceralFat').value) || 6,
            comparison: '<'
        };
        profile.goals.bloodPressure = {
            systolic: parseInt(document.getElementById('inputGoalSystolic').value) || 130,
            diastolic: parseInt(document.getElementById('inputGoalDiastolic').value) || 85
        };

        try {
            const response = await fetch(`/api/users/${this.currentUser}/profile`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(profile)
            });

            if (!response.ok) throw new Error('Failed to save profile');

            this.renderDashboard();
            this.renderCharts();
            alert('Profile saved!');
        } catch (error) {
            console.error('Error saving profile:', error);
            alert('Failed to save profile. Please try again.');
        }
    },

    // =====================
    // Seizure Tracking Methods
    // =====================

    /**
     * Save a seizure episode
     */
    async saveSeizureEpisode() {
        const date = document.getElementById('seizureDate').value;
        const duration = parseInt(document.getElementById('seizureDuration').value) || null;
        const notes = document.getElementById('seizureNotes').value;

        const episode = {
            date: date,
            timestamp: `${date}T12:00:00`,
            duration: duration,
            notes: notes || null
        };

        try {
            const response = await fetch(`/api/users/${this.currentUser}/seizures`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(episode)
            });

            if (!response.ok) throw new Error('Failed to save');

            const result = await response.json();
            episode.id = result.id;

            if (!this.data.seizureEpisodes) {
                this.data.seizureEpisodes = [];
            }
            this.data.seizureEpisodes.push(episode);

            this.renderSeizureEpisodes();
            this.renderSeizureAnalysis();
            this.renderDashboard();

            // Reset form
            document.getElementById('seizureForm').reset();
            document.getElementById('seizureDate').value = this.getTodayString();

            alert('Seizure episode logged');
        } catch (error) {
            console.error('Error saving seizure:', error);
            alert('Failed to save seizure episode. Please try again.');
        }
    },

    /**
     * Delete a seizure episode
     */
    async deleteSeizureEpisode(id) {
        if (!confirm('Delete this seizure episode?')) return;

        try {
            const response = await fetch(`/api/users/${this.currentUser}/seizures/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete');

            this.data.seizureEpisodes = this.data.seizureEpisodes.filter(e => e.id !== id);
            this.renderSeizureEpisodes();
            this.renderSeizureAnalysis();
            this.renderDashboard();
        } catch (error) {
            console.error('Error deleting seizure:', error);
            alert('Failed to delete. Please try again.');
        }
    },

    /**
     * Render seizure episodes list
     */
    renderSeizureEpisodes() {
        const container = document.getElementById('seizureEpisodesList');
        if (!container) return;

        const episodes = this.data?.seizureEpisodes || [];

        if (episodes.length === 0) {
            container.innerHTML = '<p class="text-muted">No seizure episodes recorded yet.</p>';
            return;
        }

        // Sort by date descending and take most recent 20
        const sorted = [...episodes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);

        container.innerHTML = sorted.map((ep, idx) => {
            return `
            <div class="seizure-item">
                <div class="seizure-item-header">
                    <span class="seizure-datetime">${this.formatDate(ep.date)}</span>
                    <span class="seizure-duration">${ep.duration ? ep.duration + 's' : ''}</span>
                </div>
                ${ep.notes ? `<div class="seizure-notes">${ep.notes}</div>` : ''}
                <div class="seizure-item-actions">
                    <button class="btn btn-sm btn-danger" onclick="App.deleteSeizureEpisode(${ep.id})">Delete</button>
                </div>
            </div>
        `}).join('');
    },

    /**
     * Render seizure analysis
     */
    renderSeizureAnalysis() {
        const episodes = this.data?.seizureEpisodes || [];
        const now = new Date();

        // Calculate date boundaries
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const fourteenDaysAgo = new Date(now);
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Last 7 days
        const last7Days = episodes.filter(ep => this.parseLocalDate(ep.date) >= sevenDaysAgo);
        const el7Days = document.getElementById('seizures7Days');
        if (el7Days) el7Days.textContent = last7Days.length;

        // Previous 7 days (days 8-14)
        const prev7Days = episodes.filter(ep => {
            const d = this.parseLocalDate(ep.date);
            return d >= fourteenDaysAgo && d < sevenDaysAgo;
        });
        const elPrev7Days = document.getElementById('seizuresPrev7Days');
        if (elPrev7Days) elPrev7Days.textContent = prev7Days.length;

        // Daily average (7-day)
        const dailyAvg = last7Days.length > 0 ? (last7Days.length / 7).toFixed(2) : '--';
        const elDailyAvg = document.getElementById('seizureDailyAvg');
        if (elDailyAvg) elDailyAvg.textContent = dailyAvg;

        // Weekly trend - compare last 7 days vs previous 7 days
        const weeklyTrendEl = document.getElementById('seizureWeeklyTrend');
        if (weeklyTrendEl) {
            const current = last7Days.length;
            const previous = prev7Days.length;

            if (episodes.length < 2) {
                weeklyTrendEl.innerHTML = '<span class="trend-unchanged">Not enough data</span>';
            } else if (current > previous) {
                const diff = current - previous;
                weeklyTrendEl.innerHTML = `<span class="trend-up">+${diff} from last week</span>`;
            } else if (current < previous) {
                const diff = previous - current;
                weeklyTrendEl.innerHTML = `<span class="trend-down">-${diff} from last week</span>`;
            } else {
                weeklyTrendEl.innerHTML = '<span class="trend-unchanged">Same as last week</span>';
            }
        }

        // Daily trend - show daily average with comparison to last week
        const dailyTrendEl = document.getElementById('seizureDailyTrend');
        if (dailyTrendEl) {
            const currentAvg = last7Days.length / 7;
            const prevAvg = prev7Days.length / 7;
            const diff = currentAvg - prevAvg;

            if (episodes.length < 2) {
                dailyTrendEl.innerHTML = '<span class="trend-unchanged">Not enough data</span>';
            } else if (diff > 0) {
                dailyTrendEl.innerHTML = `<span class="trend-up">Avg ${currentAvg.toFixed(1)}/day (+${diff.toFixed(1)} from last week)</span>`;
            } else if (diff < 0) {
                dailyTrendEl.innerHTML = `<span class="trend-down">Avg ${currentAvg.toFixed(1)}/day (${diff.toFixed(1)} from last week)</span>`;
            } else {
                dailyTrendEl.innerHTML = `<span class="trend-unchanged">Avg ${currentAvg.toFixed(1)}/day (unchanged)</span>`;
            }
        }

        // Update dashboard seizure stats
        this.renderSeizureDashboard();
    },

    /**
     * Render seizure dashboard cards
     */
    renderSeizureDashboard() {
        const episodes = this.data?.seizureEpisodes || [];
        const medications = this.data?.profile?.medications || [];

        // Render mini seizure chart
        const miniSeizureCanvas = document.getElementById('miniSeizureChart');
        if (miniSeizureCanvas) {
            Charts.renderMiniSeizureChart(miniSeizureCanvas, episodes);
        }

        // Seizure count (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const last30Days = episodes.filter(ep => new Date(ep.timestamp) >= thirtyDaysAgo);

        const countEl = document.getElementById('dashboardSeizureCount');
        if (countEl) countEl.textContent = last30Days.length;

        // Days since last seizure
        const seizureFreeDaysEl = document.getElementById('seizureFreeDays');
        if (seizureFreeDaysEl) {
            if (episodes.length === 0) {
                seizureFreeDaysEl.textContent = '--';
            } else {
                const sorted = [...episodes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                const lastSeizure = new Date(sorted[0].timestamp);
                const today = new Date();
                const diffDays = Math.floor((today - lastSeizure) / (1000 * 60 * 60 * 24));
                seizureFreeDaysEl.textContent = diffDays;
            }
        }

        // Medication display
        const medEl = document.getElementById('dashboardMedication');
        if (medEl) {
            if (medications.length === 0) {
                medEl.innerHTML = '<p class="text-muted">No medications listed</p>';
            } else {
                medEl.innerHTML = medications.map(med => `
                    <div style="margin-bottom: 0.5rem;">
                        <div class="med-name">${med.name}</div>
                        <div class="med-dose">${med.dose} ${med.form || ''}</div>
                        ${med.notes ? `<div class="text-muted" style="font-size: 0.75rem;">${med.notes}</div>` : ''}
                    </div>
                `).join('');
            }
        }

        // Recent seizures on dashboard
        const recentEl = document.getElementById('dashboardRecentSeizures');
        if (recentEl) {
            if (episodes.length === 0) {
                recentEl.innerHTML = '<p class="text-muted">No episodes recorded</p>';
            } else {
                const sorted = [...episodes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);
                recentEl.innerHTML = sorted.map(ep => `
                    <div style="padding: 0.5rem 0; border-bottom: 1px solid var(--border-color);">
                        <strong>${this.formatDate(ep.date)}</strong>
                        ${ep.duration ? `<span class="text-muted">(${ep.duration}s)</span>` : ''}
                        ${ep.notes ? `<div class="text-muted" style="font-size: 0.75rem;">${ep.notes.substring(0, 50)}${ep.notes.length > 50 ? '...' : ''}</div>` : ''}
                    </div>
                `).join('');
            }
        }
    },

    // =====================
    // Medication Log Methods
    // =====================

    /**
     * Populate the medication select dropdown from profile medications
     */
    populateMedicationSelect() {
        const select = document.getElementById('medLogMedication');
        if (!select) return;

        const medications = this.data?.profile?.medications || [];

        if (medications.length === 0) {
            select.innerHTML = '<option value="">No medications in profile</option>';
        } else {
            select.innerHTML = medications.map(med =>
                `<option value="${med.name}">${med.name} (${med.dose})</option>`
            ).join('');
        }
    },

    /**
     * Save a medication log entry
     */
    async saveMedicationLog() {
        const date = document.getElementById('medLogDate').value;
        const time = document.getElementById('medLogTime').value;
        const medication = document.getElementById('medLogMedication').value;
        const form = document.getElementById('medLogForm').value;
        const nausea = document.getElementById('medLogNausea').checked;
        const vomited = document.getElementById('medLogVomited').checked;
        const diarrhea = document.getElementById('medLogDiarrhea').checked;
        const itchiness = document.getElementById('medLogItchiness').checked;
        const throatBurning = document.getElementById('medLogThroatBurning').checked;
        const upsetStomach = document.getElementById('medLogUpsetStomach').checked;
        const hiccups = document.getElementById('medLogHiccups').checked;
        const itchyThroat = document.getElementById('medLogItchyThroat').checked;
        const coughing = document.getElementById('medLogCoughing').checked;
        const gagging = document.getElementById('medLogGagging').checked;
        const headache = document.getElementById('medLogHeadache').checked;
        const notes = document.getElementById('medLogNotes').value;

        if (!medication) {
            alert('Please select a medication');
            return;
        }

        const entry = {
            date: date,
            timestamp: `${date}T${time}:00`,
            medication: medication,
            form: form,
            sideEffects: {
                nausea: nausea,
                vomited: vomited,
                diarrhea: diarrhea,
                itchiness: itchiness,
                throatBurning: throatBurning,
                upsetStomach: upsetStomach,
                hiccups: hiccups,
                itchyThroat: itchyThroat,
                coughing: coughing,
                gagging: gagging,
                headache: headache
            },
            notes: notes || null
        };

        try {
            const response = await fetch(`/api/users/${this.currentUser}/medication-log`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            });

            if (!response.ok) throw new Error('Failed to save');

            const result = await response.json();
            entry.id = result.id;

            if (!this.data.medicationLog) {
                this.data.medicationLog = [];
            }
            this.data.medicationLog.push(entry);

            this.renderMedicationLog();
            this.renderDashboard();

            // Reset form
            document.getElementById('medicationLogForm').reset();
            document.getElementById('medLogDate').value = this.getTodayString();
            const now = new Date();
            document.getElementById('medLogTime').value =
                `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

            alert('Medication logged');
        } catch (error) {
            console.error('Error saving medication log:', error);
            alert('Failed to save medication log. Please try again.');
        }
    },

    /**
     * Delete a medication log entry
     */
    async deleteMedicationLog(id) {
        if (!confirm('Delete this medication log entry?')) return;

        try {
            const response = await fetch(`/api/users/${this.currentUser}/medication-log/${id}`, {
                method: 'DELETE'
            });

            if (!response.ok) throw new Error('Failed to delete');

            this.data.medicationLog = this.data.medicationLog.filter(e => e.id !== id);
            this.renderMedicationLog();
            this.renderDashboard();
        } catch (error) {
            console.error('Error deleting medication log:', error);
            alert('Failed to delete. Please try again.');
        }
    },

    /**
     * Render medication log list
     */
    renderMedicationLog() {
        const container = document.getElementById('medicationLogList');
        if (!container) return;

        const logs = this.data?.medicationLog || [];

        if (logs.length === 0) {
            container.innerHTML = '<p class="text-muted">No medication logs yet.</p>';
            return;
        }

        // Sort by date descending and take most recent 20
        const sorted = [...logs].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 20);

        container.innerHTML = sorted.map(log => {
            const sideEffects = [];
            if (log.sideEffects?.nausea) sideEffects.push('Nausea');
            if (log.sideEffects?.vomited) sideEffects.push('Vomited');
            if (log.sideEffects?.diarrhea) sideEffects.push('Diarrhea');
            if (log.sideEffects?.itchiness) sideEffects.push('Itchiness');
            if (log.sideEffects?.throatBurning) sideEffects.push('Throat burning');
            if (log.sideEffects?.upsetStomach) sideEffects.push('Upset stomach');
            if (log.sideEffects?.hiccups) sideEffects.push('Hiccups');
            if (log.sideEffects?.itchyThroat) sideEffects.push('Itchy throat');
            if (log.sideEffects?.coughing) sideEffects.push('Coughing');
            if (log.sideEffects?.gagging) sideEffects.push('Gagging');
            if (log.sideEffects?.headache) sideEffects.push('Headache');

            return `
            <div class="med-log-item">
                <div class="med-log-header">
                    <span class="med-log-name">${log.medication}</span>
                    <span class="med-log-form">${log.form}</span>
                </div>
                <div class="med-log-datetime">${this.formatDate(log.date)} at ${log.timestamp.split('T')[1]?.substring(0, 5) || '--'}</div>
                ${sideEffects.length > 0 ? `<div class="med-log-side-effects">${sideEffects.map(e => `<span class="side-effect">${e}</span>`).join('')}</div>` : ''}
                ${log.notes ? `<div class="med-log-notes">${log.notes}</div>` : ''}
                <div class="med-log-actions">
                    <button class="btn btn-sm btn-danger" onclick="App.deleteMedicationLog(${log.id})">Delete</button>
                </div>
            </div>
        `}).join('');
    },

    // =====================================================
    // WORKOUT TRACKING METHODS
    // =====================================================

    /**
     * Format weight with unit for display
     */
    formatWeight(weight, unit) {
        if (!weight && unit !== 'body' && unit !== 'band') return 'BW';
        switch (unit) {
            case 'lbs': return `${weight}#`;
            case 'kg': return `${weight}kg`;
            case 'body': return 'BW';
            case 'band': return 'Band';
            case 'min': return `${weight} min`;
            case 'sec': return `${weight} sec`;
            default: return `${weight}#`;
        }
    },

    /**
     * Get day of week name
     */
    getDayName(dayOfWeek) {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        return days[dayOfWeek] || 'Unscheduled';
    },

    /**
     * Get today's day of week (0-6)
     */
    getTodayDayOfWeek() {
        return new Date().getDay();
    },

    /**
     * Render weekly workout plan
     */
    renderWeeklyPlan() {
        const container = document.getElementById('weeklyPlanGrid');
        if (!container) return;

        const templates = this.data?.workoutTemplates || [];
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

        container.innerHTML = days.map((day, index) => {
            const dayTemplates = templates.filter(t => t.dayOfWeek === index);
            const todayClass = index === this.getTodayDayOfWeek() ? 'today' : '';

            return `
                <div class="week-day ${todayClass}" data-day="${index}">
                    <div class="week-day-header">${day}</div>
                    <div class="week-day-content">
                        ${dayTemplates.length > 0
                            ? dayTemplates.map(t => `
                                <div class="scheduled-workout" data-template-id="${t.id}" onclick="App.openTemplateEditor(${t.id})">
                                    <span class="workout-name">${t.name}</span>
                                    <span class="exercise-count">${t.exercises?.length || 0} exercises</span>
                                </div>
                            `).join('')
                            : '<span class="rest-day">Rest</span>'
                        }
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Render today's scheduled workout
     */
    renderTodaysWorkout() {
        const container = document.getElementById('todaysWorkoutContent');
        if (!container) return;

        const templates = this.data?.workoutTemplates || [];
        const todayTemplates = templates.filter(t => t.dayOfWeek === this.getTodayDayOfWeek());

        if (todayTemplates.length === 0) {
            container.innerHTML = `
                <div class="rest-day-message">
                    <p>Rest Day</p>
                    <p class="text-muted">No workout scheduled for today</p>
                </div>
            `;
            const startBtn = document.getElementById('startWorkoutBtn');
            if (startBtn) startBtn.style.display = 'none';
            return;
        }

        const template = todayTemplates[0];
        const exercises = template.exercises || [];

        // Group exercises by superset
        const supersets = {};
        const standalone = [];
        exercises.forEach(ex => {
            if (ex.supersetGroup) {
                if (!supersets[ex.supersetGroup]) supersets[ex.supersetGroup] = [];
                supersets[ex.supersetGroup].push(ex);
            } else {
                standalone.push(ex);
            }
        });

        container.innerHTML = `
            <h3 class="workout-title">${template.name}</h3>
            <div class="workout-exercises-preview">
                ${Object.entries(supersets).map(([group, exs]) => `
                    <div class="superset-preview">
                        <span class="superset-label">Superset ${group}</span>
                        ${exs.sort((a, b) => a.supersetOrder - b.supersetOrder).map(ex => `
                            <div class="exercise-preview">
                                <span class="exercise-label">${group}${ex.supersetOrder}</span>
                                <span class="exercise-name">${ex.exerciseName}</span>
                                <span class="exercise-detail">${ex.targetSets}×${ex.targetReps} @ ${this.formatWeight(ex.targetWeight, ex.weightUnit)}</span>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
                ${standalone.map(ex => `
                    <div class="exercise-preview standalone">
                        <span class="exercise-name">${ex.exerciseName}</span>
                        <span class="exercise-detail">${ex.targetSets}×${ex.targetReps} @ ${this.formatWeight(ex.targetWeight, ex.weightUnit)}</span>
                    </div>
                `).join('')}
            </div>
        `;

        const startBtn = document.getElementById('startWorkoutBtn');
        if (startBtn) {
            startBtn.style.display = 'block';
            startBtn.onclick = () => this.startWorkout(template.id);
        }
    },

    /**
     * Render recent workout logs
     */
    renderRecentWorkouts() {
        const container = document.getElementById('recentWorkoutsList');
        if (!container) return;

        const logs = this.data?.workoutLogs || [];
        const recent = [...logs].slice(0, 10);

        if (recent.length === 0) {
            container.innerHTML = '<p class="text-muted">No workouts logged yet.</p>';
            return;
        }

        container.innerHTML = recent.map(log => {
            const template = this.data.workoutTemplates?.find(t => t.id === log.templateId);
            const exerciseCount = log.exercises?.length || 0;
            const completedSets = log.exercises?.reduce((sum, ex) =>
                sum + (ex.sets?.filter(s => s.completed)?.length || 0), 0) || 0;

            return `
                <div class="workout-log-item ${log.completed ? 'completed' : ''}">
                    <div class="workout-log-header">
                        <span class="workout-log-name">${template?.name || 'Ad-hoc Workout'}</span>
                        <span class="workout-log-date">${this.formatDate(log.date)}</span>
                    </div>
                    <div class="workout-log-stats">
                        <span>${exerciseCount} exercises</span>
                        <span>${completedSets} sets completed</span>
                        ${log.durationMinutes ? `<span>${log.durationMinutes} min</span>` : ''}
                    </div>
                    <div class="workout-log-actions">
                        <button class="btn btn-sm btn-secondary" onclick="App.showActiveWorkout(${log.id})">Edit</button>
                        <button class="btn btn-sm btn-danger" onclick="App.deleteWorkoutLog(${log.id})">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Render recent cardio logs
     */
    renderRecentCardio() {
        const container = document.getElementById('recentCardioList');
        if (!container) return;

        const logs = this.data?.cardioLogs || [];
        const recent = [...logs].slice(0, 10);

        if (recent.length === 0) {
            container.innerHTML = '<p class="text-muted">No cardio logged yet.</p>';
            return;
        }

        container.innerHTML = recent.map(log => {
            const hrClass = this.getHRZoneClass(log.avgHeartRate, log.targetHrMin, log.targetHrMax);

            return `
                <div class="cardio-log-item">
                    <div class="cardio-log-header">
                        <span class="cardio-type">${log.activityType}</span>
                        <span class="cardio-date">${this.formatDate(log.date)}</span>
                    </div>
                    <div class="cardio-log-stats">
                        ${log.distance ? `<span>${log.distance} ${log.distanceUnit}</span>` : ''}
                        ${log.durationMinutes ? `<span>${log.durationMinutes}:${String(log.durationSeconds || 0).padStart(2, '0')}</span>` : ''}
                        ${log.speed ? `<span>${log.speed} ${log.speedUnit}</span>` : ''}
                        ${log.avgHeartRate ? `<span class="hr-badge ${hrClass}">${log.avgHeartRate} bpm</span>` : ''}
                    </div>
                    <div class="cardio-log-actions">
                        <button class="btn btn-sm btn-danger" onclick="App.deleteCardioLog(${log.id})">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    /**
     * Get HR zone class based on target range
     */
    getHRZoneClass(hr, min, max) {
        if (!hr) return '';
        if (min && max) {
            if (hr < min) return 'hr-below';
            if (hr > max) return 'hr-above';
            return 'hr-in-zone';
        }
        return '';
    },

    /**
     * Start a workout from template
     */
    async startWorkout(templateId) {
        const date = this.getTodayString();
        const now = new Date();
        const startTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        try {
            const response = await fetch(`/api/users/${this.currentUser}/workout-logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    templateId,
                    date,
                    startTime
                })
            });

            if (!response.ok) throw new Error('Failed to start workout');

            const result = await response.json();

            // Reload data to get the full workout log with exercises
            await this.loadData();
            this.renderRecentWorkouts();

            // Open active workout view
            this.showActiveWorkout(result.id);

        } catch (error) {
            console.error('Error starting workout:', error);
            alert('Failed to start workout. Please try again.');
        }
    },

    /**
     * Show active workout overlay
     */
    showActiveWorkout(workoutLogId) {
        const overlay = document.getElementById('activeWorkoutOverlay');
        if (!overlay) return;

        const workoutLog = this.data.workoutLogs?.find(w => w.id === workoutLogId);
        if (!workoutLog) return;

        const template = this.data.workoutTemplates?.find(t => t.id === workoutLog.templateId);
        const exercises = workoutLog.exercises || [];

        // Group by superset
        const supersets = {};
        const standalone = [];
        exercises.forEach(ex => {
            if (ex.supersetGroup) {
                if (!supersets[ex.supersetGroup]) supersets[ex.supersetGroup] = [];
                supersets[ex.supersetGroup].push(ex);
            } else {
                standalone.push(ex);
            }
        });

        overlay.innerHTML = `
            <div class="active-workout-content">
                <div class="active-workout-header">
                    <h2>${template?.name || 'Workout'}</h2>
                    <div class="workout-timer" id="workoutTimer">00:00</div>
                    <button class="btn btn-success" onclick="App.finishWorkout(${workoutLogId})">Finish</button>
                </div>
                <div class="exercise-list">
                    ${Object.entries(supersets).map(([group, exs]) => `
                        <div class="superset-group">
                            <div class="superset-header">
                                <span class="superset-label">Superset ${group}</span>
                            </div>
                            ${exs.sort((a, b) => a.supersetOrder - b.supersetOrder).map(ex => this.renderActiveExercise(ex, group)).join('')}
                        </div>
                    `).join('')}
                    ${standalone.map(ex => this.renderActiveExercise(ex, null)).join('')}
                </div>
                <button class="btn btn-secondary close-workout-btn" onclick="App.hideActiveWorkout()">Close</button>
            </div>
        `;

        overlay.classList.add('active');
        this.startWorkoutTimer(workoutLog.startTime);
    },

    /**
     * Render active exercise with set inputs
     */
    renderActiveExercise(exercise, supersetGroup) {
        const sets = exercise.sets || [];
        const label = supersetGroup ? `${supersetGroup}${exercise.supersetOrder}` : '';

        return `
            <div class="exercise-item" data-exercise-id="${exercise.id}">
                <div class="exercise-header">
                    ${label ? `<span class="exercise-label">${label}</span>` : ''}
                    <span class="exercise-name">${exercise.exerciseName}</span>
                </div>
                <div class="sets-grid">
                    ${sets.map(set => `
                        <div class="set-entry ${set.completed ? 'completed' : ''}" data-set-id="${set.id}">
                            <span class="set-number">${set.setNumber}</span>
                            <input type="number" class="set-weight" value="${set.actualWeight || set.targetWeight || ''}"
                                   placeholder="${set.targetWeight || ''}" data-field="actualWeight">
                            <span class="weight-unit">${set.weightUnit === 'min' ? 'min' : (set.weightUnit === 'sec' ? 'sec' : (set.weightUnit === 'kg' ? 'kg' : '#'))}</span>
                            <span class="times">×</span>
                            <input type="number" class="set-reps" value="${set.actualReps || ''}"
                                   placeholder="${set.targetReps || ''}" data-field="actualReps">
                            <button class="set-done-btn ${set.completed ? 'done' : ''}"
                                    onclick="App.toggleSetComplete(${exercise.id}, ${set.id}, this)">✓</button>
                        </div>
                    `).join('')}
                </div>
                <div class="exercise-notes">
                    <input type="text" placeholder="Notes..." value="${exercise.notes || ''}"
                           onchange="App.updateExerciseNotes(${exercise.id}, this.value)">
                </div>
            </div>
        `;
    },

    /**
     * Toggle set completion
     */
    async toggleSetComplete(exerciseLogId, setId, btn) {
        const setEntry = btn.closest('.set-entry');
        const weightInput = setEntry.querySelector('.set-weight');
        const repsInput = setEntry.querySelector('.set-reps');
        const isCompleted = !setEntry.classList.contains('completed');

        try {
            const workoutLog = this.data.workoutLogs?.find(w =>
                w.exercises?.some(e => e.id === exerciseLogId)
            );
            if (!workoutLog) return;

            await fetch(`/api/users/${this.currentUser}/workout-logs/${workoutLog.id}/exercises/${exerciseLogId}/sets/${setId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    actualWeight: parseFloat(weightInput.value) || null,
                    actualReps: parseInt(repsInput.value) || null,
                    completed: isCompleted
                })
            });

            setEntry.classList.toggle('completed', isCompleted);
            btn.classList.toggle('done', isCompleted);

            // Update local data
            const exercise = workoutLog.exercises.find(e => e.id === exerciseLogId);
            const set = exercise?.sets?.find(s => s.id === setId);
            if (set) {
                set.actualWeight = parseFloat(weightInput.value) || null;
                set.actualReps = parseInt(repsInput.value) || null;
                set.completed = isCompleted;
            }

        } catch (error) {
            console.error('Error updating set:', error);
        }
    },

    /**
     * Update exercise notes
     */
    async updateExerciseNotes(exerciseLogId, notes) {
        // Find the workout log containing this exercise
        const workoutLog = this.data.workoutLogs?.find(w =>
            w.exercises?.some(e => e.id === exerciseLogId)
        );
        if (!workoutLog) return;

        // Note: We'd need an endpoint for this, for now just update local state
        const exercise = workoutLog.exercises.find(e => e.id === exerciseLogId);
        if (exercise) {
            exercise.notes = notes;
        }
    },

    /**
     * Hide active workout overlay
     */
    hideActiveWorkout() {
        const overlay = document.getElementById('activeWorkoutOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            this.stopWorkoutTimer();
        }
    },

    /**
     * Start workout timer
     */
    startWorkoutTimer(startTime) {
        const timerEl = document.getElementById('workoutTimer');
        if (!timerEl || !startTime) return;

        const [hours, minutes] = startTime.split(':').map(Number);
        const startDate = new Date();
        startDate.setHours(hours, minutes, 0, 0);

        this.workoutTimerInterval = setInterval(() => {
            const elapsed = Date.now() - startDate.getTime();
            const mins = Math.floor(elapsed / 60000);
            const secs = Math.floor((elapsed % 60000) / 1000);
            timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }, 1000);
    },

    /**
     * Stop workout timer
     */
    stopWorkoutTimer() {
        if (this.workoutTimerInterval) {
            clearInterval(this.workoutTimerInterval);
            this.workoutTimerInterval = null;
        }
    },

    /**
     * Finish workout
     */
    async finishWorkout(workoutLogId) {
        const now = new Date();
        const endTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        try {
            await fetch(`/api/users/${this.currentUser}/workout-logs/${workoutLogId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    endTime,
                    completed: true
                })
            });

            // Update local data
            const workoutLog = this.data.workoutLogs?.find(w => w.id === workoutLogId);
            if (workoutLog) {
                workoutLog.endTime = endTime;
                workoutLog.completed = true;
            }

            this.hideActiveWorkout();
            this.renderRecentWorkouts();
            alert('Workout completed!');

        } catch (error) {
            console.error('Error finishing workout:', error);
            alert('Failed to save workout. Please try again.');
        }
    },

    /**
     * Delete workout log
     */
    async deleteWorkoutLog(id) {
        if (!confirm('Delete this workout log?')) return;

        try {
            await fetch(`/api/users/${this.currentUser}/workout-logs/${id}`, {
                method: 'DELETE'
            });

            this.data.workoutLogs = this.data.workoutLogs.filter(w => w.id !== id);
            this.renderRecentWorkouts();

        } catch (error) {
            console.error('Error deleting workout:', error);
            alert('Failed to delete workout.');
        }
    },

    /**
     * Save cardio log from form
     */
    async saveCardioLog() {
        const date = document.getElementById('cardioDate')?.value || this.getTodayString();
        const activityType = document.getElementById('cardioType')?.value;
        const distance = document.getElementById('cardioDistance')?.value;
        const durationMinutes = document.getElementById('cardioDuration')?.value;
        const speed = document.getElementById('cardioSpeed')?.value;
        const avgHeartRate = document.getElementById('cardioHR')?.value;
        const notes = document.getElementById('cardioNotes')?.value;

        if (!activityType) {
            alert('Please select an activity type');
            return;
        }

        const cardioData = {
            date,
            activityType,
            targetHrMin: 120,
            targetHrMax: 125
        };

        if (distance) cardioData.distance = parseFloat(distance);
        if (durationMinutes) cardioData.durationMinutes = parseInt(durationMinutes);
        if (speed) cardioData.speed = parseFloat(speed);
        if (avgHeartRate) cardioData.avgHeartRate = parseInt(avgHeartRate);
        if (notes) cardioData.notes = notes;

        try {
            const response = await fetch(`/api/users/${this.currentUser}/cardio-logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cardioData)
            });

            if (!response.ok) throw new Error('Failed to save');

            const result = await response.json();
            cardioData.id = result.id;

            if (!this.data.cardioLogs) this.data.cardioLogs = [];
            this.data.cardioLogs.unshift(cardioData);

            this.renderRecentCardio();

            // Reset form
            document.getElementById('cardioForm')?.reset();
            const cardioDateEl = document.getElementById('cardioDate');
            if (cardioDateEl) cardioDateEl.value = this.getTodayString();

        } catch (error) {
            console.error('Error saving cardio:', error);
            alert('Failed to save cardio log.');
        }
    },

    /**
     * Delete cardio log
     */
    async deleteCardioLog(id) {
        if (!confirm('Delete this cardio log?')) return;

        try {
            await fetch(`/api/users/${this.currentUser}/cardio-logs/${id}`, {
                method: 'DELETE'
            });

            this.data.cardioLogs = this.data.cardioLogs.filter(c => c.id !== id);
            this.renderRecentCardio();

        } catch (error) {
            console.error('Error deleting cardio:', error);
            alert('Failed to delete cardio log.');
        }
    },

    /**
     * Open template editor modal
     */
    openTemplateEditor(templateId = null) {
        const modal = document.getElementById('templateEditorModal');
        if (!modal) return;

        let template = null;
        if (templateId) {
            template = this.data.workoutTemplates?.find(t => t.id === templateId);
        }

        // Update modal title
        const modalTitle = modal.querySelector('h2');
        if (modalTitle) {
            modalTitle.textContent = template ? 'Edit Workout Template' : 'New Workout Template';
        }

        // Populate form
        document.getElementById('templateName').value = template?.name || '';
        document.getElementById('templateDay').value = template?.dayOfWeek ?? '';
        document.getElementById('templateNotes').value = template?.notes || '';

        // Store template ID for save
        modal.dataset.templateId = templateId || '';

        // Show/hide delete button
        const deleteBtn = document.getElementById('deleteTemplateBtn');
        if (deleteBtn) {
            deleteBtn.style.display = template ? 'inline-block' : 'none';
            deleteBtn.onclick = () => this.deleteTemplate(templateId);
        }

        // Render exercises
        this.renderTemplateExercises(template?.exercises || []);

        modal.classList.add('active');
    },

    /**
     * Close template editor modal
     */
    closeTemplateEditor() {
        const modal = document.getElementById('templateEditorModal');
        if (modal) modal.classList.remove('active');
    },

    /**
     * Render exercises in template editor
     */
    renderTemplateExercises(exercises) {
        const container = document.getElementById('templateExercises');
        if (!container) return;

        if (exercises.length === 0) {
            container.innerHTML = '<p class="text-muted">No exercises yet. Add exercises below.</p>';
            return;
        }

        container.innerHTML = exercises.map((ex, index) => `
            <div class="template-exercise-item" data-index="${index}">
                <div class="exercise-inputs">
                    <input type="text" class="exercise-superset" placeholder="A" value="${ex.supersetGroup || ''}" style="width: 40px">
                    <input type="number" class="exercise-superset-order" placeholder="1" value="${ex.supersetOrder || ''}" style="width: 40px">
                    <input type="text" class="exercise-name-input" placeholder="Exercise name" value="${ex.exerciseName || ''}" required>
                    <input type="number" class="exercise-sets-input" placeholder="Sets" value="${ex.targetSets || ''}" style="width: 60px">
                    <input type="text" class="exercise-reps-input" placeholder="Reps" value="${ex.targetReps || ''}" style="width: 80px">
                    <input type="number" class="exercise-weight-input" placeholder="Weight" value="${ex.targetWeight || ''}" style="width: 70px">
                    <select class="exercise-unit-input" style="width: 70px">
                        <option value="lbs" ${ex.weightUnit === 'lbs' ? 'selected' : ''}>lbs</option>
                        <option value="kg" ${ex.weightUnit === 'kg' ? 'selected' : ''}>kg</option>
                        <option value="body" ${ex.weightUnit === 'body' ? 'selected' : ''}>BW</option>
                        <option value="band" ${ex.weightUnit === 'band' ? 'selected' : ''}>Band</option>
                        <option value="min" ${ex.weightUnit === 'min' ? 'selected' : ''}>min</option>
                        <option value="sec" ${ex.weightUnit === 'sec' ? 'selected' : ''}>sec</option>
                    </select>
                    <button type="button" class="btn btn-sm btn-danger" onclick="App.removeTemplateExercise(${index})">×</button>
                </div>
            </div>
        `).join('');
    },

    /**
     * Add exercise to template editor
     */
    addTemplateExercise() {
        const container = document.getElementById('templateExercises');
        if (!container) return;

        const exercises = this.getTemplateExercisesFromForm();
        exercises.push({
            supersetGroup: '',
            supersetOrder: 1,
            exerciseName: '',
            targetSets: 3,
            targetReps: '10',
            targetWeight: null,
            weightUnit: 'lbs'
        });
        this.renderTemplateExercises(exercises);
    },

    /**
     * Remove exercise from template editor
     */
    removeTemplateExercise(index) {
        const exercises = this.getTemplateExercisesFromForm();
        exercises.splice(index, 1);
        this.renderTemplateExercises(exercises);
    },

    /**
     * Get exercises from template editor form
     */
    getTemplateExercisesFromForm() {
        const container = document.getElementById('templateExercises');
        if (!container) return [];

        const exercises = [];
        container.querySelectorAll('.template-exercise-item').forEach(item => {
            exercises.push({
                supersetGroup: item.querySelector('.exercise-superset')?.value || null,
                supersetOrder: parseInt(item.querySelector('.exercise-superset-order')?.value) || 1,
                exerciseName: item.querySelector('.exercise-name-input')?.value || '',
                targetSets: parseInt(item.querySelector('.exercise-sets-input')?.value) || null,
                targetReps: item.querySelector('.exercise-reps-input')?.value || null,
                targetWeight: parseFloat(item.querySelector('.exercise-weight-input')?.value) || null,
                weightUnit: item.querySelector('.exercise-unit-input')?.value || 'lbs'
            });
        });
        return exercises;
    },

    /**
     * Save workout template
     */
    async saveTemplate() {
        const modal = document.getElementById('templateEditorModal');
        const templateId = modal?.dataset.templateId;

        const name = document.getElementById('templateName')?.value;
        const dayOfWeek = document.getElementById('templateDay')?.value;
        const notes = document.getElementById('templateNotes')?.value;
        const exercises = this.getTemplateExercisesFromForm().filter(e => e.exerciseName);

        if (!name) {
            alert('Please enter a workout name');
            return;
        }

        const templateData = {
            name,
            dayOfWeek: dayOfWeek !== '' ? parseInt(dayOfWeek) : null,
            notes,
            exercises: exercises.map((ex, i) => ({ ...ex, sortOrder: i }))
        };

        try {
            if (templateId) {
                // Delete old template and create new one (simpler than updating exercises individually)
                await fetch(`/api/users/${this.currentUser}/workout-templates/${templateId}`, {
                    method: 'DELETE'
                });
            }

            // Create new template (or recreate after delete)
            const response = await fetch(`/api/users/${this.currentUser}/workout-templates`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(templateData)
            });

            if (!response.ok) throw new Error('Failed to save template');

            // Reload data
            await this.loadData();
            this.renderWeeklyPlan();
            this.renderTodaysWorkout();
            this.closeTemplateEditor();

        } catch (error) {
            console.error('Error saving template:', error);
            alert('Failed to save workout template.');
        }
    },

    /**
     * Delete workout template
     */
    async deleteTemplate(id) {
        if (!confirm('Delete this workout template?')) return;

        try {
            await fetch(`/api/users/${this.currentUser}/workout-templates/${id}`, {
                method: 'DELETE'
            });

            this.data.workoutTemplates = this.data.workoutTemplates.filter(t => t.id !== id);
            this.renderWeeklyPlan();
            this.renderTodaysWorkout();
            this.closeTemplateEditor();

        } catch (error) {
            console.error('Error deleting template:', error);
            alert('Failed to delete template.');
        }
    }
};

// Load data from JSON file on init
document.addEventListener('DOMContentLoaded', async () => {
    // Restore saved user from localStorage
    const savedUser = localStorage.getItem('healthTracker_currentUser');
    console.log('Restored user from localStorage:', savedUser);
    if (savedUser && ['user1', 'user2', 'user3'].includes(savedUser)) {
        App.currentUser = savedUser;
    }
    console.log('Using user:', App.currentUser);

    // Update user selector to match
    const userSelect = document.getElementById('userSelect');
    if (userSelect) {
        userSelect.value = App.currentUser;
    }

    // Load from SQLite API
    try {
        const response = await fetch(`/api/users/${App.currentUser}`);
        if (response.ok) {
            App.data = await response.json();
        } else {
            App.data = App.getDefaultData();
        }
    } catch (error) {
        console.log('No user data found, using defaults');
        App.data = App.getDefaultData();
    }

    App.applyTrackingType();
    App.setupEventListeners();
    App.renderDashboard();
    App.renderCharts();
    App.renderBPReadings();
    App.renderBPAnalysis();
    App.renderSeizureEpisodes();
    App.renderSeizureAnalysis();
    App.populateMedicationSelect();
    App.renderMedicationLog();
    App.renderWeeklyPlan();
    App.renderTodaysWorkout();
    App.renderRecentWorkouts();
    App.renderRecentCardio();
    App.updateDataSummary();

    // Set default dates for forms
    const bpDateEl = document.getElementById('bpDate');
    const seizureDateEl = document.getElementById('seizureDate');
    const medLogDateEl = document.getElementById('medLogDate');
    const medLogTimeEl = document.getElementById('medLogTime');
    const cardioDateEl = document.getElementById('cardioDate');

    const today = App.getTodayString();
    if (bpDateEl) bpDateEl.value = today;
    if (seizureDateEl) seizureDateEl.value = today;
    if (medLogDateEl) medLogDateEl.value = today;
    if (cardioDateEl) cardioDateEl.value = today;
    if (medLogTimeEl) {
        const now = new Date();
        medLogTimeEl.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    // Load staged files info
    App.loadStagedFiles();

    // Restore saved tab from localStorage
    const savedTab = localStorage.getItem('healthTracker_currentTab');
    if (savedTab) {
        App.switchTab(savedTab);
    }
});

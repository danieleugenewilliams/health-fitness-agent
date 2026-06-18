/**
 * Chart Configurations and Rendering
 * Uses Chart.js for visualization
 */

const Charts = {
    instances: {},
    colors: {
        primary: '#2563eb',
        primaryLight: 'rgba(37, 99, 235, 0.1)',
        success: '#16a34a',
        successLight: 'rgba(22, 163, 74, 0.1)',
        warning: '#d97706',
        danger: '#dc2626',
        dangerLight: 'rgba(220, 38, 38, 0.1)',
        gray: '#64748b',
        grayLight: 'rgba(100, 116, 139, 0.1)'
    },

    /**
     * Common chart options
     */
    getBaseOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            resizeDelay: 0,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            animation: {
                duration: 300
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        displayFormats: {
                            day: 'MMM d'
                        }
                    },
                    grid: {
                        display: false
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    }
                }
            }
        };
    },

    /**
     * Render mini weight chart on dashboard
     */
    renderMiniWeightChart(canvas, data, goals) {
        const ctx = canvas.getContext('2d');

        if (this.instances.miniWeight) {
            this.instances.miniWeight.destroy();
        }

        // Filter to last 30 days
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const recentData = data.filter(d => new Date(d.timestamp) >= cutoff);

        const chartData = recentData.map(d => ({
            x: new Date(d.timestamp),
            y: d.weight
        }));

        // Calculate trend (first vs last weight in 30-day period)
        let trendText = '';
        let trendColor = this.colors.gray;
        if (chartData.length >= 2) {
            const firstWeight = chartData[0].y;
            const lastWeight = chartData[chartData.length - 1].y;
            const diff = lastWeight - firstWeight;
            const sign = diff > 0 ? '+' : '';
            trendText = `${sign}${diff.toFixed(1)} lbs (30d)`;
            trendColor = diff < 0 ? this.colors.success : (diff > 0 ? this.colors.danger : this.colors.gray);
        }

        this.instances.miniWeight = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Weight',
                    data: chartData,
                    borderColor: this.colors.primary,
                    backgroundColor: this.colors.primaryLight,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }, {
                    label: 'Goal',
                    data: chartData.map(d => ({ x: d.x, y: goals.weight.target })),
                    borderColor: this.colors.success,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: !!trendText,
                        text: trendText,
                        position: 'top',
                        align: 'end',
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        color: trendColor,
                        padding: { bottom: 5 }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day' },
                        display: false
                    },
                    y: {
                        display: true,
                        grid: { display: false }
                    }
                }
            }
        });
    },

    /**
     * Render mini seizure chart on dashboard (daily seizures over 30 days)
     */
    renderMiniSeizureChart(canvas, episodes) {
        const ctx = canvas.getContext('2d');

        if (this.instances.miniSeizure) {
            this.instances.miniSeizure.destroy();
        }

        // Build daily counts for last 30 days
        const dailyData = {};
        const today = new Date();

        // Initialize all days with 0
        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateKey = this.formatDateKey(date);
            dailyData[dateKey] = 0;
        }

        // Count seizures per day
        episodes.forEach(ep => {
            const dateKey = ep.date || ep.timestamp?.split('T')[0];
            if (dailyData.hasOwnProperty(dateKey)) {
                dailyData[dateKey]++;
            }
        });

        // Convert to chart data
        const chartData = Object.entries(dailyData)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, count]) => ({
                x: this.parseLocalDate(date),
                y: count
            }));

        // Calculate totals for trend
        const last7 = chartData.slice(-7).reduce((sum, d) => sum + d.y, 0);
        const prev7 = chartData.slice(-14, -7).reduce((sum, d) => sum + d.y, 0);

        let trendText = '';
        let trendColor = this.colors.gray;
        if (chartData.length >= 14) {
            const diff = last7 - prev7;
            const sign = diff > 0 ? '+' : '';
            trendText = `${sign}${diff} vs prev week`;
            // For seizures, down is good (green), up is bad (red)
            trendColor = diff < 0 ? this.colors.success : (diff > 0 ? this.colors.danger : this.colors.gray);
        }

        this.instances.miniSeizure = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Seizures',
                    data: chartData,
                    borderColor: this.colors.primary,
                    backgroundColor: this.colors.primaryLight,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: !!trendText,
                        text: trendText,
                        position: 'top',
                        align: 'end',
                        font: {
                            size: 14,
                            weight: 'bold'
                        },
                        color: trendColor,
                        padding: { bottom: 5 }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day' },
                        display: false
                    },
                    y: {
                        display: true,
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        grid: { display: false }
                    }
                }
            }
        });
    },

    /**
     * Render full weight chart with goal line and InBody markers
     */
    renderWeightChart(canvas, data, goals, days = 90, inbodyScans = []) {
        const ctx = canvas.getContext('2d');

        if (this.instances.weight) {
            this.instances.weight.destroy();
        }

        const filteredData = this.filterByDays(data, days);
        const chartData = filteredData.map(d => ({
            x: new Date(d.timestamp),
            y: d.weight
        }));

        // Calculate trend (first vs last weight in period)
        let trendText = '';
        if (chartData.length >= 2) {
            const firstWeight = chartData[0].y;
            const lastWeight = chartData[chartData.length - 1].y;
            const diff = lastWeight - firstWeight;
            const sign = diff > 0 ? '+' : '';
            trendText = `${sign}${diff.toFixed(1)} lbs`;
        }

        // Filter InBody scans to the same date range
        const filteredInBody = this.filterByDays(inbodyScans, days, 'date');
        const inbodyData = filteredInBody.map(d => ({
            x: new Date(d.date),
            y: d.weight
        }));

        const datasets = [{
            label: 'VeSync Weight',
            data: chartData,
            borderColor: this.colors.primary,
            backgroundColor: this.colors.primaryLight,
            fill: true,
            tension: 0.3,
            pointRadius: 2
        }, {
            label: `Goal (${goals.weight?.target || '--'} lbs)`,
            data: chartData.length > 0 && goals.weight?.target ? [
                { x: chartData[0].x, y: goals.weight.target },
                { x: chartData[chartData.length - 1].x, y: goals.weight.target }
            ] : [],
            borderColor: this.colors.success,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
        }];

        // Add InBody markers if available
        if (inbodyData.length > 0) {
            datasets.push({
                label: 'InBody Scan',
                data: inbodyData,
                borderColor: '#8b5cf6',
                backgroundColor: '#8b5cf6',
                pointRadius: 8,
                pointStyle: 'triangle',
                showLine: false
            });
        }

        const options = {
            ...this.getBaseOptions(),
            plugins: {
                ...this.getBaseOptions().plugins,
                title: {
                    display: !!trendText,
                    text: trendText,
                    position: 'top',
                    align: 'end',
                    font: {
                        size: 16,
                        weight: 'bold'
                    },
                    color: trendText.startsWith('-') ? this.colors.success : (trendText.startsWith('+') ? this.colors.danger : this.colors.gray),
                    padding: { bottom: 10 }
                }
            }
        };

        this.instances.weight = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options
        });
    },

    /**
     * Render body composition chart (fat % and muscle mass) with InBody markers
     */
    renderCompositionChart(canvas, data, days = 90, inbodyScans = []) {
        const ctx = canvas.getContext('2d');

        if (this.instances.composition) {
            this.instances.composition.destroy();
        }

        const filteredData = this.filterByDays(data, days);

        const fatData = filteredData.map(d => ({
            x: new Date(d.timestamp),
            y: d.bodyFatPercent
        }));

        const muscleData = filteredData.map(d => ({
            x: new Date(d.timestamp),
            y: d.muscleMass
        }));

        // Filter InBody scans to the same date range
        const filteredInBody = this.filterByDays(inbodyScans, days, 'date');
        const inbodyFatData = filteredInBody.map(d => ({
            x: new Date(d.date),
            y: d.bodyFatPercent
        }));
        const inbodyMuscleData = filteredInBody.map(d => ({
            x: new Date(d.date),
            y: d.skeletalMuscleMass
        }));

        const datasets = [{
            label: 'VeSync Body Fat %',
            data: fatData,
            borderColor: this.colors.warning,
            backgroundColor: 'transparent',
            tension: 0.3,
            pointRadius: 2,
            yAxisID: 'y'
        }, {
            label: 'VeSync Muscle (lbs)',
            data: muscleData,
            borderColor: this.colors.primary,
            backgroundColor: 'transparent',
            tension: 0.3,
            pointRadius: 2,
            yAxisID: 'y1'
        }];

        // Add InBody markers if available
        if (inbodyFatData.length > 0) {
            datasets.push({
                label: 'InBody Fat %',
                data: inbodyFatData,
                borderColor: '#dc2626',
                backgroundColor: '#dc2626',
                pointRadius: 8,
                pointStyle: 'triangle',
                showLine: false,
                yAxisID: 'y'
            });
            datasets.push({
                label: 'InBody Muscle (lbs)',
                data: inbodyMuscleData,
                borderColor: '#8b5cf6',
                backgroundColor: '#8b5cf6',
                pointRadius: 8,
                pointStyle: 'triangle',
                showLine: false,
                yAxisID: 'y1'
            });
        }

        this.instances.composition = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                ...this.getBaseOptions(),
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'day', displayFormats: { day: 'MMM d' } },
                        grid: { display: false }
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Body Fat %' },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Muscle (lbs)' },
                        grid: { drawOnChartArea: false }
                    }
                }
            }
        });
    },

    /**
     * Render visceral fat chart with target zone and InBody markers
     */
    renderVisceralChart(canvas, data, goals, days = 90, inbodyScans = []) {
        const ctx = canvas.getContext('2d');

        if (this.instances.visceral) {
            this.instances.visceral.destroy();
        }

        const filteredData = this.filterByDays(data, days);
        const chartData = filteredData.map(d => ({
            x: new Date(d.timestamp),
            y: d.visceralFat
        }));

        // Filter InBody scans to the same date range
        const filteredInBody = this.filterByDays(inbodyScans, days, 'date');
        const inbodyData = filteredInBody.map(d => ({
            x: new Date(d.date),
            y: d.visceralFatLevel
        }));

        const datasets = [{
            label: 'VeSync Visceral Fat',
            data: chartData,
            borderColor: this.colors.danger,
            backgroundColor: this.colors.dangerLight,
            fill: true,
            tension: 0.3,
            pointRadius: 2
        }, {
            label: `Target (<${goals.visceralFat.target})`,
            data: chartData.length > 0 ? [
                { x: chartData[0].x, y: goals.visceralFat.target },
                { x: chartData[chartData.length - 1].x, y: goals.visceralFat.target }
            ] : [],
            borderColor: this.colors.success,
            borderDash: [5, 5],
            pointRadius: 0,
            fill: false
        }];

        // Add InBody markers if available
        if (inbodyData.length > 0) {
            datasets.push({
                label: 'InBody Visceral Fat',
                data: inbodyData,
                borderColor: '#8b5cf6',
                backgroundColor: '#8b5cf6',
                pointRadius: 8,
                pointStyle: 'triangle',
                showLine: false
            });
        }

        this.instances.visceral = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                ...this.getBaseOptions(),
                scales: {
                    ...this.getBaseOptions().scales,
                    y: {
                        ...this.getBaseOptions().scales.y,
                        min: 0,
                        max: 20,
                        ticks: {
                            stepSize: 2
                        }
                    }
                }
            }
        });
    },

    /**
     * Render blood pressure chart
     */
    renderBPChart(canvas, data, goals, days = 90) {
        const ctx = canvas.getContext('2d');

        if (this.instances.bp) {
            this.instances.bp.destroy();
        }

        const filteredData = this.filterByDays(data, days, 'date');

        const systolicData = filteredData.map(d => ({
            x: new Date(d.date || d.timestamp),
            y: d.systolic
        }));

        const diastolicData = filteredData.map(d => ({
            x: new Date(d.date || d.timestamp),
            y: d.diastolic
        }));

        this.instances.bp = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Systolic',
                    data: systolicData,
                    borderColor: this.colors.danger,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 4
                }, {
                    label: 'Diastolic',
                    data: diastolicData,
                    borderColor: this.colors.primary,
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 4
                }, {
                    label: `Systolic Target (${goals.bloodPressure.systolic})`,
                    data: systolicData.length > 0 ? [
                        { x: systolicData[0].x, y: goals.bloodPressure.systolic },
                        { x: systolicData[systolicData.length - 1].x, y: goals.bloodPressure.systolic }
                    ] : [],
                    borderColor: this.colors.danger,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }, {
                    label: `Diastolic Target (${goals.bloodPressure.diastolic})`,
                    data: diastolicData.length > 0 ? [
                        { x: diastolicData[0].x, y: goals.bloodPressure.diastolic },
                        { x: diastolicData[diastolicData.length - 1].x, y: goals.bloodPressure.diastolic }
                    ] : [],
                    borderColor: this.colors.primary,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false
                }]
            },
            options: {
                ...this.getBaseOptions(),
                scales: {
                    ...this.getBaseOptions().scales,
                    y: {
                        ...this.getBaseOptions().scales.y,
                        min: 60,
                        max: 180
                    }
                }
            }
        });
    },

    /**
     * Render body measurements chart
     */
    renderMeasurementsChart(canvas, data) {
        const ctx = canvas.getContext('2d');

        if (this.instances.measurements) {
            this.instances.measurements.destroy();
        }

        if (!data || data.length === 0) {
            return;
        }

        // Measurement labels to display
        const measurementLabels = {
            chest: 'Chest',
            waist: 'Waist',
            belly: 'Belly',
            butt: 'Butt',
            rightThigh: 'R. Thigh',
            leftThigh: 'L. Thigh',
            rightCalf: 'R. Calf',
            leftCalf: 'L. Calf',
            rightBicep: 'R. Bicep',
            leftBicep: 'L. Bicep',
            rightForearm: 'R. Forearm',
            leftForearm: 'L. Forearm'
        };

        const colorPalette = [
            '#2563eb', '#16a34a', '#d97706', '#dc2626',
            '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16',
            '#14b8a6', '#f97316', '#a855f7', '#22c55e'
        ];

        // Get measurement keys from any data point that has data (not just first)
        // Find first record with actual measurement data
        const sampleData = data.find(d => {
            const m = d.measurements || d;
            return Object.keys(measurementLabels).some(key => m[key] !== undefined);
        }) || data[0];

        const measurementKeys = Object.keys(measurementLabels).filter(key => {
            // Check if key exists at top level or in nested measurements object
            return sampleData[key] !== undefined || (sampleData.measurements && sampleData.measurements[key] !== undefined);
        });

        const datasets = measurementKeys.map((key, index) => ({
            label: measurementLabels[key],
            data: data.map(d => ({
                x: d.date,
                // Support both flat structure (d.chest) and nested (d.measurements.chest)
                y: d[key] !== undefined ? d[key] : (d.measurements ? d.measurements[key] : undefined)
            })).filter(d => d.y !== undefined),
            borderColor: colorPalette[index % colorPalette.length],
            backgroundColor: 'transparent',
            tension: 0.3,
            pointRadius: 5
        }));

        this.instances.measurements = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                ...this.getBaseOptions(),
                scales: {
                    x: {
                        type: 'time',
                        time: {
                            unit: 'month',
                            displayFormats: { month: 'MMM yyyy' }
                        },
                        grid: { display: false }
                    },
                    y: {
                        title: { display: true, text: 'Inches' },
                        grid: { color: 'rgba(0, 0, 0, 0.05)' }
                    }
                }
            }
        });
    },

    /**
     * Parse a date string as local date (not UTC)
     */
    parseLocalDate(dateStr) {
        if (!dateStr) return null;
        // Extract just the date part if it has a time
        const datePart = dateStr.split('T')[0];
        const [year, month, day] = datePart.split('-').map(Number);
        return new Date(year, month - 1, day);
    },

    /**
     * Format date as YYYY-MM-DD in local time
     */
    formatDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    /**
     * Render seizure frequency chart (seizures per week)
     */
    renderSeizureFrequencyChart(canvas, episodes, days = 90) {
        if (!canvas) return;

        this.clearChart(canvas);
        const ctx = canvas.getContext('2d');

        // Group by week
        const filtered = this.filterByDays(episodes, days, 'timestamp');
        const weeklyData = {};

        filtered.forEach(ep => {
            const date = this.parseLocalDate(ep.date || ep.timestamp);
            // Get start of week (Sunday)
            const startOfWeek = new Date(date);
            startOfWeek.setDate(date.getDate() - date.getDay());
            const weekKey = this.formatDateKey(startOfWeek);
            weeklyData[weekKey] = (weeklyData[weekKey] || 0) + 1;
        });

        // Fill in missing weeks with zero
        const sortedWeeks = Object.keys(weeklyData).sort();
        if (sortedWeeks.length > 0) {
            const startDate = this.parseLocalDate(sortedWeeks[0]);
            const endDate = new Date();
            const allWeeks = [];
            const current = new Date(startDate);

            while (current <= endDate) {
                const weekKey = this.formatDateKey(current);
                allWeeks.push({
                    week: weekKey,
                    count: weeklyData[weekKey] || 0
                });
                current.setDate(current.getDate() + 7);
            }

            const chartData = allWeeks.slice(-12); // Last 12 weeks

            this.instances.seizureFrequency = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: chartData.map(d => {
                        const date = this.parseLocalDate(d.week);
                        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    }),
                    datasets: [{
                        label: 'Seizures',
                        data: chartData.map(d => d.count),
                        backgroundColor: this.colors.primary,
                        borderRadius: 4
                    }]
                },
                options: {
                    ...this.getBaseOptions(),
                    plugins: {
                        ...this.getBaseOptions().plugins,
                        legend: { display: false }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: { stepSize: 1 },
                            title: { display: true, text: 'Seizures' }
                        },
                        x: {
                            title: { display: true, text: 'Week of' }
                        }
                    }
                }
            });
        }
    },

    /**
     * Render medication adherence chart
     */
    renderMedicationAdherenceChart(canvas, medicationLog, days = 30) {
        if (!canvas) return;

        this.clearChart(canvas);
        const ctx = canvas.getContext('2d');

        // Group by date
        const filtered = this.filterByDays(medicationLog, days, 'timestamp');
        const dailyData = {};

        filtered.forEach(log => {
            const dateKey = log.date;
            dailyData[dateKey] = (dailyData[dateKey] || 0) + 1;
        });

        // Get last N days
        const chartData = [];
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateKey = this.formatDateKey(date);
            chartData.push({
                date: dateKey,
                count: dailyData[dateKey] || 0
            });
        }

        // Only show last 30 points max
        const displayData = chartData.slice(-30);

        this.instances.medicationAdherence = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: displayData.map(d => {
                    const date = this.parseLocalDate(d.date);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }),
                datasets: [{
                    label: 'Doses logged',
                    data: displayData.map(d => d.count),
                    backgroundColor: displayData.map(d => d.count > 0 ? this.colors.success : this.colors.grayLight),
                    borderRadius: 4
                }]
            },
            options: {
                ...this.getBaseOptions(),
                plugins: {
                    ...this.getBaseOptions().plugins,
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        title: { display: true, text: 'Doses' }
                    }
                }
            }
        });
    },

    /**
     * Render side effects chart
     */
    renderSideEffectsChart(canvas, medicationLog, days = 30) {
        if (!canvas) return;

        this.clearChart(canvas);
        const ctx = canvas.getContext('2d');

        const filtered = this.filterByDays(medicationLog, days, 'timestamp');

        // Count side effects
        const sideEffectCounts = {
            nausea: 0,
            vomited: 0,
            diarrhea: 0,
            itchiness: 0,
            throatBurning: 0,
            upsetStomach: 0,
            hiccups: 0,
            itchyThroat: 0,
            coughing: 0,
            gagging: 0,
            headache: 0
        };

        filtered.forEach(log => {
            if (log.sideEffects) {
                Object.keys(sideEffectCounts).forEach(effect => {
                    if (log.sideEffects[effect]) sideEffectCounts[effect]++;
                });
            }
        });

        const labels = ['Nausea', 'Vomited', 'Diarrhea', 'Itchiness', 'Throat Burn', 'Upset Stomach', 'Hiccups', 'Itchy Throat', 'Coughing', 'Gagging', 'Headache'];
        const data = [
            sideEffectCounts.nausea,
            sideEffectCounts.vomited,
            sideEffectCounts.diarrhea,
            sideEffectCounts.itchiness,
            sideEffectCounts.throatBurning,
            sideEffectCounts.upsetStomach,
            sideEffectCounts.hiccups,
            sideEffectCounts.itchyThroat,
            sideEffectCounts.coughing,
            sideEffectCounts.gagging,
            sideEffectCounts.headache
        ];

        this.instances.sideEffects = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Occurrences',
                    data: data,
                    backgroundColor: this.colors.warning,
                    borderRadius: 4
                }]
            },
            options: {
                ...this.getBaseOptions(),
                indexAxis: 'y',
                plugins: {
                    ...this.getBaseOptions().plugins,
                    legend: { display: false }
                },
                scales: {
                    x: {
                        beginAtZero: true,
                        ticks: { stepSize: 1 },
                        title: { display: true, text: 'Occurrences' }
                    }
                }
            }
        });
    },

    /**
     * Filter data by number of days
     */
    filterByDays(data, days, dateField = 'timestamp') {
        if (days === 'all' || !days) return data;

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        return data.filter(d => {
            const date = new Date(d[dateField] || d.timestamp || d.date);
            return date >= cutoff;
        });
    },

    /**
     * Update all charts with new time range
     */
    updateTimeRange(days, appData) {
        const inbodyScans = appData.inbodyScans || [];

        if (appData.scaleReadings && appData.scaleReadings.length > 0) {
            const weightCanvas = document.getElementById('weightChart');
            const compositionCanvas = document.getElementById('compositionChart');
            const visceralCanvas = document.getElementById('visceralChart');

            if (weightCanvas) {
                this.renderWeightChart(weightCanvas, appData.scaleReadings, appData.profile.goals, days, inbodyScans);
            }
            if (compositionCanvas) {
                this.renderCompositionChart(compositionCanvas, appData.scaleReadings, days, inbodyScans);
            }
            if (visceralCanvas) {
                this.renderVisceralChart(visceralCanvas, appData.scaleReadings, appData.profile.goals, days, inbodyScans);
            }
        }

        if (appData.bloodPressure && appData.bloodPressure.length > 0) {
            const bpCanvas = document.getElementById('bpChart');
            if (bpCanvas) {
                this.renderBPChart(bpCanvas, appData.bloodPressure, appData.profile.goals, days);
            }
        }

        // Seizure tracking charts
        if (appData.seizureEpisodes) {
            const seizureCanvas = document.getElementById('seizureFrequencyChart');
            if (seizureCanvas) {
                this.renderSeizureFrequencyChart(seizureCanvas, appData.seizureEpisodes, days);
            }
        }

        if (appData.medicationLog) {
            const medCanvas = document.getElementById('medicationAdherenceChart');
            const sideEffectsCanvas = document.getElementById('sideEffectsChart');
            if (medCanvas) {
                this.renderMedicationAdherenceChart(medCanvas, appData.medicationLog, days);
            }
            if (sideEffectsCanvas) {
                this.renderSideEffectsChart(sideEffectsCanvas, appData.medicationLog, days);
            }
        }
    },

    /**
     * Clear a specific chart by canvas element
     */
    clearChart(canvas) {
        const chartId = canvas.id;
        const instanceMap = {
            'weightChart': 'weight',
            'compositionChart': 'composition',
            'visceralChart': 'visceral',
            'bpChart': 'bp',
            'measurementsChart': 'measurements',
            'miniWeightChart': 'miniWeight',
            'miniSeizureChart': 'miniSeizure',
            'seizureFrequencyChart': 'seizureFrequency',
            'medicationAdherenceChart': 'medicationAdherence',
            'sideEffectsChart': 'sideEffects'
        };

        const instanceKey = instanceMap[chartId];
        if (instanceKey && this.instances[instanceKey]) {
            this.instances[instanceKey].destroy();
            this.instances[instanceKey] = null;
        }
    },

    /**
     * Destroy all chart instances
     */
    destroyAll() {
        Object.values(this.instances).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.instances = {};
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Charts;
}

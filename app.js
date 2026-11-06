(() => {
  'use strict';

  const STORAGE_KEY = 'gain30_personal_tracker_v1';

  // Default Food Template matching exact user specification
  function createDefaultFoods() {
    return [
      { id: 'eggs', name: 'Eggs', qty: 4, unit: 'eggs', step: 1, calPerUnit: 72, protPerUnit: 6.3, checked: false, isDefault: true },
      { id: 'bananas', name: 'Bananas', qty: 4, unit: 'bananas', step: 1, calPerUnit: 105, protPerUnit: 1.3, checked: false, isDefault: true },
      { id: 'milk', name: 'Milk', qty: 500, unit: 'ml', step: 100, calPerUnit: 0.64, protPerUnit: 0.034, checked: false, isDefault: true },
      { id: 'peanut_butter', name: 'Peanut Butter', qty: 2, unit: 'tbsp', step: 0.5, calPerUnit: 94, protPerUnit: 4.0, checked: false, isDefault: true },
      { id: 'bread', name: 'Bread', qty: 4, unit: 'slices', step: 1, calPerUnit: 75, protPerUnit: 2.7, checked: false, isDefault: true },
      { id: 'fruits', name: 'Optional Fruits', qty: 1, unit: 'serving', step: 1, calPerUnit: 95, protPerUnit: 1.2, checked: false, isDefault: true },
      { id: 'breakfast', name: 'Normal Breakfast', qty: 1, unit: 'meal', step: 0.5, calPerUnit: 450, protPerUnit: 14.0, checked: false, isDefault: true },
      { id: 'lunch', name: 'Normal Lunch', qty: 1, unit: 'meal', step: 0.5, calPerUnit: 650, protPerUnit: 22.0, checked: false, isDefault: true },
      { id: 'dinner', name: 'Normal Dinner', qty: 1, unit: 'meal', step: 0.5, calPerUnit: 600, protPerUnit: 20.0, checked: false, isDefault: true }
    ];
  }

  // Default Workout Template matching exact user specification
  function createDefaultWorkouts() {
    return [
      { id: 'pushups', name: 'Push-ups', target: 30, unit: 'reps', step: 5, checked: false, isDefault: true },
      { id: 'squats', name: 'Squats', target: 40, unit: 'reps', step: 5, checked: false, isDefault: true },
      { id: 'lunges', name: 'Lunges', target: 30, unit: 'reps', step: 5, checked: false, isDefault: true },
      { id: 'plank', name: 'Plank', target: 60, unit: 'sec', step: 15, checked: false, isDefault: true },
      { id: 'walking', name: 'Walking', target: 30, unit: 'mins', step: 5, checked: false, isDefault: true }
    ];
  }

  function getTodayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function createDayRecord(dayNumber) {
    return {
      day: dayNumber,
      foods: createDefaultFoods(),
      waterMl: 0,
      workouts: createDefaultWorkouts(),
      restDay: false,
      workoutNotes: '',
      weightKg: dayNumber === 1 ? 46.0 : null
    };
  }

  function createInitialState() {
    const days = {};
    for (let i = 1; i <= 30; i++) {
      days[i] = createDayRecord(i);
    }
    return {
      version: 1,
      settings: {
        startWeight: 46.0,
        targetWeight: 50.0,
        durationDays: 30,
        calorieGoal: 3000,
        proteinGoal: 110,
        waterGoal: 2500,
        startDate: getTodayISO()
      },
      activeDay: 1,
      historySelectedDay: 1,
      days
    };
  }

  // Load & Validate State from LocalStorage
  let state = loadState();
  let activeTab = 'dashboard';

  // Plank Timer runtime variables
  let plankInterval = null;
  let plankElapsedSec = 0;

  // Deferred PWA Install Prompt
  let deferredInstallPrompt = null;

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const initial = createInitialState();
        initial.activeDay = computeTodayDayIndex(initial.settings.startDate);
        initial.historySelectedDay = initial.activeDay;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
        return initial;
      }
      const parsed = JSON.parse(raw);
      return normalizeState(parsed);
    } catch (err) {
      console.error('Failed to load state from LocalStorage, initializing fresh state:', err);
      return createInitialState();
    }
  }

  function normalizeState(data) {
    const fallback = createInitialState();
    if (!data || typeof data !== 'object') return fallback;

    const settings = Object.assign({}, fallback.settings, data.settings || {});
    settings.startWeight = Number(settings.startWeight) || 46.0;
    settings.targetWeight = Number(settings.targetWeight) || 50.0;
    settings.durationDays = 30;
    settings.calorieGoal = Number(settings.calorieGoal) || 3000;
    settings.proteinGoal = Number(settings.proteinGoal) || 110;
    settings.waterGoal = Number(settings.waterGoal) || 2500;
    if (!settings.startDate) settings.startDate = getTodayISO();

    const days = {};
    for (let i = 1; i <= 30; i++) {
      const existing = data.days && data.days[i] ? data.days[i] : createDayRecord(i);
      days[i] = {
        day: i,
        foods: Array.isArray(existing.foods) && existing.foods.length > 0
          ? existing.foods.map((f, idx) => ({
              id: f.id || `food_${i}_${idx}`,
              name: String(f.name || 'Food'),
              qty: Number(f.qty) >= 0 ? Number(f.qty) : 1,
              unit: String(f.unit || 'serving'),
              step: Number(f.step) > 0 ? Number(f.step) : 1,
              calPerUnit: Number(f.calPerUnit) >= 0 ? Number(f.calPerUnit) : 0,
              protPerUnit: Number(f.protPerUnit) >= 0 ? Number(f.protPerUnit) : 0,
              checked: Boolean(f.checked),
              isDefault: Boolean(f.isDefault)
            }))
          : createDefaultFoods(),
        waterMl: Math.max(0, Number(existing.waterMl) || 0),
        workouts: Array.isArray(existing.workouts) && existing.workouts.length > 0
          ? existing.workouts.map((w, idx) => ({
              id: w.id || `workout_${i}_${idx}`,
              name: String(w.name || 'Exercise'),
              target: Math.max(1, Number(w.target) || 10),
              unit: String(w.unit || 'reps'),
              step: Number(w.step) > 0 ? Number(w.step) : 5,
              checked: Boolean(w.checked),
              isDefault: Boolean(w.isDefault)
            }))
          : createDefaultWorkouts(),
        restDay: Boolean(existing.restDay),
        workoutNotes: String(existing.workoutNotes || ''),
        weightKg: existing.weightKg !== null && existing.weightKg !== undefined && existing.weightKg !== ''
          ? Number(existing.weightKg)
          : null
      };
    }

    const activeDay = clampDay(Number(data.activeDay) || computeTodayDayIndex(settings.startDate));
    const historySelectedDay = clampDay(Number(data.historySelectedDay) || activeDay);

    return {
      version: 1,
      settings,
      activeDay,
      historySelectedDay,
      days
    };
  }

  function saveState(toastMsg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      pulseSaveBadge();
      if (toastMsg) showToast(toastMsg);
    } catch (err) {
      console.error('Error saving to LocalStorage:', err);
      showToast('Storage error: Check browser quota');
    }
  }

  function pulseSaveBadge() {
    const badge = document.getElementById('saveStatusBadge');
    if (!badge) return;
    badge.innerHTML = '<span class="save-dot"></span> Saved';
    badge.style.transform = 'scale(1.06)';
    setTimeout(() => {
      badge.style.transform = 'scale(1)';
    }, 180);
  }

  function clampDay(d) {
    return Math.min(30, Math.max(1, Math.round(d)));
  }

  function computeTodayDayIndex(startDateStr) {
    try {
      const [y, m, d] = startDateStr.split('-').map(Number);
      const start = new Date(y, m - 1, d);
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const diffDays = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1;
      return clampDay(diffDays);
    } catch {
      return 1;
    }
  }

  function getDateForDay(dayNum) {
    try {
      const [y, m, d] = state.settings.startDate.split('-').map(Number);
      const dt = new Date(y, m - 1, d + (dayNum - 1));
      return dt;
    } catch {
      return new Date();
    }
  }

  function formatShortDate(dayNum) {
    const dt = getDateForDay(dayNum);
    return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function formatFullDate(dayNum) {
    const dt = getDateForDay(dayNum);
    const todayIdx = computeTodayDayIndex(state.settings.startDate);
    const base = dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    return dayNum === todayIdx ? `Today, ${base}` : base;
  }

  // Calculation Helpers
  function calcFoodItemMacros(item) {
    const cals = Math.round((Number(item.qty) || 0) * (Number(item.calPerUnit) || 0));
    const prot = +((Number(item.qty) || 0) * (Number(item.protPerUnit) || 0)).toFixed(1);
    return { cals, prot };
  }

  function calcDayNutrition(dayRecord) {
    let calories = 0;
    let protein = 0;
    let checkedCount = 0;
    const totalCount = dayRecord.foods.length;

    dayRecord.foods.forEach((item) => {
      if (item.checked) {
        const m = calcFoodItemMacros(item);
        calories += m.cals;
        protein += m.prot;
        checkedCount++;
      }
    });

    return {
      calories: Math.round(calories),
      protein: +protein.toFixed(1),
      checkedCount,
      totalCount
    };
  }

  function calcDayWorkoutProgress(dayRecord) {
    if (dayRecord.restDay) {
      return { completed: dayRecord.workouts.length, total: dayRecord.workouts.length, pct: 100, isRest: true };
    }
    const total = dayRecord.workouts.length;
    const completed = dayRecord.workouts.filter((w) => w.checked).length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, pct, isRest: false };
  }

  // Get latest known weight up to activeDay (or overall latest logged weight)
  function getCurrentWeightSummary() {
    const { startWeight, targetWeight } = state.settings;
    let latestWeight = startWeight;
    let latestDay = 1;

    for (let i = 1; i <= 30; i++) {
      const w = state.days[i].weightKg;
      if (w !== null && !isNaN(w)) {
        latestWeight = Number(w);
        latestDay = i;
      }
    }

    // If activeDay has a weight logged, prioritize showing activeDay or latest overall
    const activeDayWeight = state.days[state.activeDay].weightKg;
    const displayWeight = activeDayWeight !== null && !isNaN(activeDayWeight)
      ? Number(activeDayWeight)
      : latestWeight;

    const gained = +(displayWeight - startWeight).toFixed(1);
    const remaining = +Math.max(0, targetWeight - displayWeight).toFixed(1);
    const totalGoalSpan = Math.max(0.1, targetWeight - startWeight);
    const pct = Math.min(100, Math.max(0, Math.round(((displayWeight - startWeight) / totalGoalSpan) * 100)));

    return {
      displayWeight,
      latestWeight,
      latestDay,
      gained,
      remaining,
      pct
    };
  }

  // Toast helper
  let toastTimeout = null;
  function showToast(message) {
    const toast = document.getElementById('appToast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.add('hidden');
    }, 2200);
  }

  // ==================== MASTER RENDER ====================
  function renderAll() {
    renderHeaderAndDayBar();
    renderDashboard();
    renderFoodAndWaterTab();
    renderWorkoutTab();
    renderWeightTab();
    renderHistoryTab();
  }

  function renderHeaderAndDayBar() {
    const { startWeight, targetWeight } = state.settings;
    document.getElementById('headerGoalSubtitle').textContent =
      `${startWeight.toFixed(1)} kg → ${targetWeight.toFixed(1)} kg • 30 Days`;

    const d = state.activeDay;
    document.getElementById('activeDayBadge').textContent = `DAY ${d} / 30`;
    document.getElementById('activeDayDateText').textContent = formatFullDate(d);

    document.getElementById('prevDayBtn').disabled = d <= 1;
    document.getElementById('nextDayBtn').disabled = d >= 30;

    const todayIdx = computeTodayDayIndex(state.settings.startDate);
    const jumpBtn = document.getElementById('jumpTodayBtn');
    if (d !== todayIdx) {
      jumpBtn.classList.remove('hidden');
    } else {
      jumpBtn.classList.add('hidden');
    }
  }

  // ==================== 1. RENDER DASHBOARD ====================
  function renderDashboard() {
    const dayRec = state.days[state.activeDay];
    const { startWeight, targetWeight, calorieGoal, proteinGoal, waterGoal } = state.settings;
    const wSum = getCurrentWeightSummary();

    document.getElementById('dashCurrentWeight').textContent = wSum.displayWeight.toFixed(1);
    const sign = wSum.gained >= 0 ? '+' : '';
    document.getElementById('dashWeightDeltaPill').textContent = `${sign}${wSum.gained.toFixed(1)} kg gained`;
    document.getElementById('dashStartWeight').textContent = `${startWeight.toFixed(1)} kg`;
    document.getElementById('dashTargetWeight').textContent = `${targetWeight.toFixed(1)} kg`;
    document.getElementById('dashGoalPercent').textContent = `${wSum.pct}% Complete`;
    document.getElementById('dashWeightProgressBar').style.width = `${wSum.pct}%`;

    // Milestone labels
    const step = (targetWeight - startWeight) / 4;
    const milestonesEl = document.getElementById('dashMilestones');
    milestonesEl.innerHTML = [0, 1, 2, 3, 4]
      .map((i) => `<span>${(startWeight + step * i).toFixed(1).replace(/\.0$/, '')}kg</span>`)
      .join('');

    // 4 Stat boxes
    document.getElementById('statStartWeight').innerHTML = `${startWeight.toFixed(1)} <small>kg</small>`;
    document.getElementById('statWeightGained').innerHTML = `${sign}${wSum.gained.toFixed(1)} <small>kg</small>`;
    document.getElementById('statWeightRemaining').innerHTML = `${wSum.remaining.toFixed(1)} <small>kg</small>`;
    document.getElementById('statDayCounter').innerHTML = `${state.activeDay} <small>/ 30</small>`;

    // Nutrition Rings
    const nutri = calcDayNutrition(dayRec);
    const circumference = 2 * Math.PI * 50; // 314.16
    const calPct = Math.min(1, nutri.calories / Math.max(1, calorieGoal));
    const protPct = Math.min(1, nutri.protein / Math.max(1, proteinGoal));

    document.getElementById('dashCalorieRing').style.strokeDashoffset =
      String(circumference * (1 - calPct));
    document.getElementById('dashProteinRing').style.strokeDashoffset =
      String(circumference * (1 - protPct));

    document.getElementById('dashCaloriesVal').textContent = String(nutri.calories);
    document.getElementById('dashCaloriesTarget').textContent = String(calorieGoal);
    const calRem = Math.max(0, calorieGoal - nutri.calories);
    document.getElementById('dashCaloriesRemain').textContent =
      calRem === 0 ? 'Goal Reached!' : `${calRem} kcal left`;

    document.getElementById('dashProteinVal').textContent = String(nutri.protein);
    document.getElementById('dashProteinTarget').textContent = String(proteinGoal);
    const protRem = +(Math.max(0, proteinGoal - nutri.protein)).toFixed(1);
    document.getElementById('dashProteinRemain').textContent =
      protRem === 0 ? 'Goal Reached!' : `${protRem}g left`;

    // Compact Food & Workout Cards
    const foodPct = nutri.totalCount > 0 ? Math.round((nutri.checkedCount / nutri.totalCount) * 100) : 0;
    document.getElementById('dashFoodCountBadge').textContent = `${nutri.checkedCount} / ${nutri.totalCount}`;
    document.getElementById('dashFoodSummaryText').textContent =
      `${nutri.calories} kcal • ${nutri.protein}g protein logged`;
    document.getElementById('dashFoodBar').style.width = `${foodPct}%`;

    const wkProg = calcDayWorkoutProgress(dayRec);
    document.getElementById('dashWorkoutCountBadge').textContent =
      wkProg.isRest ? 'REST DAY' : `${wkProg.completed} / ${wkProg.total}`;
    document.getElementById('dashWorkoutSummaryText').textContent =
      wkProg.isRest ? 'Active recovery & mass growth' : `${wkProg.pct}% of daily training done`;
    document.getElementById('dashWorkoutBar').style.width = `${wkProg.pct}%`;

    // Water Quick Card
    const waterPct = Math.min(100, Math.round((dayRec.waterMl / Math.max(1, waterGoal)) * 100));
    document.getElementById('dashWaterVal').textContent = String(dayRec.waterMl);
    document.getElementById('dashWaterTarget').textContent = String(waterGoal);
    document.getElementById('dashWaterPct').textContent = `${waterPct}%`;
    document.getElementById('dashWaterBar').style.width = `${waterPct}%`;

    // Quick Food Checklist Grid on Dashboard
    const quickListEl = document.getElementById('dashFoodQuickList');
    quickListEl.innerHTML = dayRec.foods
      .map((item) => {
        const m = calcFoodItemMacros(item);
        return `
          <div class="dash-food-chip ${item.checked ? 'checked' : ''}" data-dash-food-id="${escapeHtml(item.id)}">
            <div class="dash-food-chip-check">${item.checked ? '✓' : ''}</div>
            <div class="dash-food-chip-info">
              <div class="dash-food-chip-name">${escapeHtml(item.name)} (${formatQty(item.qty)} ${escapeHtml(item.unit)})</div>
              <div class="dash-food-chip-meta">${m.cals} kcal • ${m.prot}g P</div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // ==================== 2. RENDER FOOD & WATER TAB ====================
  function renderFoodAndWaterTab() {
    const dayRec = state.days[state.activeDay];
    const { calorieGoal, proteinGoal, waterGoal } = state.settings;
    const nutri = calcDayNutrition(dayRec);

    document.getElementById('foodTabCalories').textContent = String(nutri.calories);
    document.getElementById('foodTabCalTarget').textContent = String(calorieGoal);
    document.getElementById('foodTabCalBar').style.width =
      `${Math.min(100, Math.round((nutri.calories / Math.max(1, calorieGoal)) * 100))}%`;

    document.getElementById('foodTabProtein').textContent = String(nutri.protein);
    document.getElementById('foodTabProtTarget').textContent = String(proteinGoal);
    document.getElementById('foodTabProtBar').style.width =
      `${Math.min(100, Math.round((nutri.protein / Math.max(1, proteinGoal)) * 100))}%`;

    const container = document.getElementById('foodChecklistContainer');
    container.innerHTML = dayRec.foods
      .map((item) => {
        const m = calcFoodItemMacros(item);
        return `
          <div class="food-item-row ${item.checked ? 'checked' : ''}" data-food-row="${escapeHtml(item.id)}">
            <div class="food-left" data-toggle-food="${escapeHtml(item.id)}">
              <div class="custom-checkbox">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </div>
              <div class="food-details">
                <div class="food-title-line">
                  <span class="food-name">${escapeHtml(item.name)}</span>
                </div>
                <div class="food-macros-line">
                  <span class="macro-pill-cal">${m.cals} kcal</span>
                  <span>•</span>
                  <span class="macro-pill-prot">${m.prot}g protein</span>
                </div>
              </div>
            </div>

            <div class="food-controls">
              <div class="qty-stepper">
                <button type="button" class="qty-btn" data-step-food="${escapeHtml(item.id)}" data-dir="-1" title="Decrease quantity">−</button>
                <span class="qty-display">${formatQty(item.qty)} ${escapeHtml(item.unit)}</span>
                <button type="button" class="qty-btn" data-step-food="${escapeHtml(item.id)}" data-dir="1" title="Increase quantity">+</button>
              </div>
              <button type="button" class="edit-row-btn" data-edit-food="${escapeHtml(item.id)}" title="Edit item & nutrition">✎</button>
            </div>
          </div>
        `;
      })
      .join('');

    // Water Section
    const waterPct = Math.min(100, Math.round((dayRec.waterMl / Math.max(1, waterGoal)) * 100));
    document.getElementById('waterTabBadge').textContent = `${dayRec.waterMl} / ${waterGoal} ml`;
    document.getElementById('waterTankFill').style.height = `${waterPct}%`;
    document.getElementById('waterBigNumber').innerHTML = `${dayRec.waterMl} <small>ml</small>`;
    document.getElementById('waterSubStatus').textContent = `${waterPct}% of ${waterGoal} ml goal`;

    // Render interactive 250ml glasses
    const totalGlasses = Math.max(8, Math.ceil(waterGoal / 250));
    const filledGlasses = Math.floor(dayRec.waterMl / 250);
    const glassesGrid = document.getElementById('waterGlassesGrid');
    let glassesHtml = '';
    for (let g = 1; g <= totalGlasses; g++) {
      const isFilled = g <= filledGlasses;
      glassesHtml += `
        <button type="button" class="water-glass-btn ${isFilled ? 'filled' : ''}" data-set-glasses="${g}" title="Set to ${g * 250} ml">
          💧${g}
        </button>
      `;
    }
    glassesGrid.innerHTML = glassesHtml;
  }

  // ==================== 3. RENDER WORKOUT TAB ====================
  function renderWorkoutTab() {
    const dayRec = state.days[state.activeDay];
    const prog = calcDayWorkoutProgress(dayRec);

    document.getElementById('workoutProgressSubtitle').textContent = prog.isRest
      ? 'Rest & Muscle Recovery Day Active'
      : `${prog.completed} of ${prog.total} exercises completed (Day ${state.activeDay})`;
    document.getElementById('workoutProgressBar').style.width = `${prog.pct}%`;

    const restBtn = document.getElementById('restDayToggleBtn');
    restBtn.textContent = dayRec.restDay ? 'Switch to Training Day' : 'Mark as Rest Day';

    const listEl = document.getElementById('workoutListContainer');
    listEl.innerHTML = dayRec.workouts
      .map((w) => `
        <div class="food-item-row ${w.checked ? 'checked' : ''}">
          <div class="food-left" data-toggle-workout="${escapeHtml(w.id)}">
            <div class="custom-checkbox">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div class="food-details">
              <span class="food-name">${escapeHtml(w.name)}</span>
              <div class="food-macros-line">
                <span class="macro-pill-cal">Target: ${w.target} ${escapeHtml(w.unit)}</span>
              </div>
            </div>
          </div>

          <div class="food-controls">
            <div class="qty-stepper">
              <button type="button" class="qty-btn" data-step-workout="${escapeHtml(w.id)}" data-dir="-1">−</button>
              <span class="qty-display">${w.target} ${escapeHtml(w.unit)}</span>
              <button type="button" class="qty-btn" data-step-workout="${escapeHtml(w.id)}" data-dir="1">+</button>
            </div>
          </div>
        </div>
      `)
      .join('');

    // Update Plank target pill
    const plankItem = dayRec.workouts.find((w) => w.id === 'plank' || w.name.toLowerCase().includes('plank'));
    const targetSec = plankItem ? plankItem.target : 60;
    document.getElementById('plankTargetPill').textContent = `Target: ${targetSec}s`;

    const notesInput = document.getElementById('workoutNotesInput');
    if (document.activeElement !== notesInput) {
      notesInput.value = dayRec.workoutNotes || '';
    }
  }

  // ==================== 4. RENDER WEIGHT TAB ====================
  function renderWeightTab() {
    const d = state.activeDay;
    const dayRec = state.days[d];
    const wSum = getCurrentWeightSummary();

    document.getElementById('weightEntryDayLabel').textContent =
      `Logging for Day ${d} (${formatShortDate(d)})`;

    const statusTag = document.getElementById('weightLoggedStatusTag');
    const weightInput = document.getElementById('dailyWeightInput');

    if (dayRec.weightKg !== null && !isNaN(dayRec.weightKg)) {
      statusTag.textContent = `Logged: ${dayRec.weightKg.toFixed(1)} kg`;
      statusTag.classList.add('logged');
      if (document.activeElement !== weightInput) {
        weightInput.value = dayRec.weightKg.toFixed(1);
      }
    } else {
      statusTag.textContent = 'Not logged for this day';
      statusTag.classList.remove('logged');
      if (document.activeElement !== weightInput) {
        weightInput.value = wSum.latestWeight.toFixed(1);
      }
    }

    renderWeightChart();
    renderWeeklyAverages();
    renderWeightLogList();
  }

  function renderWeightChart() {
    const svg = document.getElementById('weightChartSvg');
    if (!svg) return;

    const { startWeight, targetWeight } = state.settings;
    const points = [];
    for (let i = 1; i <= 30; i++) {
      const w = state.days[i].weightKg;
      if (w !== null && !isNaN(w)) {
        points.push({ day: i, weight: Number(w) });
      }
    }

    const allWeights = [startWeight, targetWeight, ...points.map((p) => p.weight)];
    const minW = Math.floor((Math.min(...allWeights) - 0.5) * 2) / 2;
    const maxW = Math.ceil((Math.max(...allWeights) + 0.5) * 2) / 2;
    const rangeW = Math.max(1, maxW - minW);

    const W = 600;
    const H = 260;
    const padL = 44;
    const padR = 18;
    const padT = 18;
    const padB = 30;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const xForDay = (day) => padL + ((day - 1) / 29) * plotW;
    const yForWeight = (w) => padT + (1 - (w - minW) / rangeW) * plotH;

    let html = `
      <defs>
        <linearGradient id="chartAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#22c55e" stop-opacity="0.38"/>
          <stop offset="100%" stop-color="#22c55e" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
    `;

    // Horizontal grid lines
    const steps = 4;
    for (let s = 0; s <= steps; s++) {
      const val = minW + (rangeW * s) / steps;
      const y = yForWeight(val);
      html += `
        <line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-width="1" />
        <text x="${padL - 8}" y="${y + 4}" text-anchor="end" fill="#64746b" font-size="11" font-weight="600">${val.toFixed(1)}</text>
      `;
    }

    // X-axis day labels
    [1, 5, 10, 15, 20, 25, 30].forEach((d) => {
      const x = xForDay(d);
      html += `
        <text x="${x}" y="${H - 8}" text-anchor="middle" fill="#64746b" font-size="11" font-weight="600">D${d}</text>
      `;
    });

    // Ideal 30-day target pace line (startWeight -> targetWeight)
    const x1 = xForDay(1);
    const y1 = yForWeight(startWeight);
    const x2 = xForDay(30);
    const y2 = yForWeight(targetWeight);
    html += `
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(156,168,161,0.4)" stroke-width="2" stroke-dasharray="6 5" />
    `;

    // Actual logged weight path
    if (points.length > 0) {
      const coords = points.map((p) => ({ x: xForDay(p.day), y: yForWeight(p.weight), day: p.day, weight: p.weight }));
      const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');

      if (coords.length > 1) {
        const first = coords[0];
        const last = coords[coords.length - 1];
        const areaPath = `${linePath} L ${last.x.toFixed(1)} ${(padT + plotH).toFixed(1)} L ${first.x.toFixed(1)} ${(padT + plotH).toFixed(1)} Z`;
        html += `<path d="${areaPath}" fill="url(#chartAreaGrad)" />`;
      }

      html += `<path d="${linePath}" fill="none" stroke="#4ade80" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />`;

      coords.forEach((c) => {
        const isCurrentDay = c.day === state.activeDay;
        html += `
          <circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="${isCurrentDay ? 6 : 4.2}"
            fill="${isCurrentDay ? '#ffffff' : '#22c55e'}" stroke="#052e16" stroke-width="2"
            data-chart-day="${c.day}" data-chart-weight="${c.weight.toFixed(1)}" style="cursor:pointer" />
        `;
      });
    }

    svg.innerHTML = html;
  }

  function renderWeeklyAverages() {
    const weeks = [
      { label: 'Week 1', range: [1, 7] },
      { label: 'Week 2', range: [8, 14] },
      { label: 'Week 3', range: [15, 21] },
      { label: 'Week 4', range: [22, 28] },
      { label: 'Final Stretch (Days 29–30)', range: [29, 30] }
    ];

    const container = document.getElementById('weeklyAveragesContainer');
    let prevAvg = state.settings.startWeight;

    container.innerHTML = weeks
      .map((wk) => {
        const logged = [];
        for (let d = wk.range[0]; d <= wk.range[1]; d++) {
          const w = state.days[d].weightKg;
          if (w !== null && !isNaN(w)) logged.push(Number(w));
        }

        if (logged.length === 0) {
          return `
            <div class="week-avg-row">
              <div>
                <div class="week-title">${wk.label} <small style="color:var(--text-muted)">(Days ${wk.range[0]}–${wk.range[1]})</small></div>
                <div class="week-sub">No weigh-ins recorded yet</div>
              </div>
              <div class="week-stats-right">
                <div class="week-avg-val" style="color:var(--text-muted)">—</div>
              </div>
            </div>
          `;
        }

        const avg = logged.reduce((a, b) => a + b, 0) / logged.length;
        const delta = +(avg - prevAvg).toFixed(2);
        prevAvg = avg;
        const sign = delta >= 0 ? '+' : '';

        return `
          <div class="week-avg-row">
            <div>
              <div class="week-title">${wk.label} <small style="color:var(--text-muted)">(Days ${wk.range[0]}–${wk.range[1]})</small></div>
              <div class="week-sub">${logged.length} day${logged.length > 1 ? 's' : ''} logged • Min ${Math.min(...logged).toFixed(1)} / Max ${Math.max(...logged).toFixed(1)} kg</div>
            </div>
            <div class="week-stats-right">
              <div class="week-avg-val">${avg.toFixed(2)} kg</div>
              <div class="week-delta-val">${sign}${delta} kg vs prior</div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderWeightLogList() {
    const container = document.getElementById('weightLogListContainer');
    const entries = [];
    for (let i = 30; i >= 1; i--) {
      const w = state.days[i].weightKg;
      if (w !== null && !isNaN(w)) {
        entries.push({ day: i, weight: Number(w) });
      }
    }

    if (entries.length === 0) {
      container.innerHTML = `<p class="card-subtitle">No weight entries logged yet. Enter your weight above!</p>`;
      return;
    }

    container.innerHTML = entries
      .map((e) => {
        const diffFromStart = +(e.weight - state.settings.startWeight).toFixed(1);
        const sign = diffFromStart >= 0 ? '+' : '';
        return `
          <div class="weight-log-row" data-jump-day="${e.day}">
            <div>
              <div class="week-title">Day ${e.day} • ${formatShortDate(e.day)}</div>
              <div class="week-sub">${sign}${diffFromStart} kg from starting weight</div>
            </div>
            <div class="week-stats-right">
              <div class="week-avg-val">${e.weight.toFixed(1)} kg</div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // ==================== 5. RENDER 30-DAY HISTORY TAB ====================
  function renderHistoryTab() {
    const grid = document.getElementById('calendar30Grid');
    const todayIdx = computeTodayDayIndex(state.settings.startDate);
    const selDay = state.historySelectedDay;

    let cellsHtml = '';
    for (let d = 1; d <= 30; d++) {
      const rec = state.days[d];
      const nutri = calcDayNutrition(rec);
      const wk = calcDayWorkoutProgress(rec);

      const foodOn = nutri.checkedCount > 0;
      const waterOn = rec.waterMl > 0;
      const workoutOn = wk.completed > 0;
      const weightText = rec.weightKg !== null && !isNaN(rec.weightKg)
        ? `${rec.weightKg.toFixed(1)}kg`
        : '—';

      cellsHtml += `
        <div class="cal-day-cell ${d === selDay ? 'selected' : ''} ${d === todayIdx ? 'is-today' : ''}" data-select-history-day="${d}">
          <span class="cal-day-num">Day ${d}</span>
          <span class="cal-day-date">${formatShortDate(d)}</span>
          <span class="cal-day-weight">${weightText}</span>
          <div class="cal-dots-row">
            <span class="cal-status-dot ${foodOn ? 'food-on' : ''}" title="Food"></span>
            <span class="cal-status-dot ${waterOn ? 'water-on' : ''}" title="Water"></span>
            <span class="cal-status-dot ${workoutOn ? 'workout-on' : ''}" title="Workout"></span>
          </div>
        </div>
      `;
    }
    grid.innerHTML = cellsHtml;

    // Render Inspector for selDay
    const selRec = state.days[selDay];
    const selNutri = calcDayNutrition(selRec);
    const selWk = calcDayWorkoutProgress(selRec);

    document.getElementById('inspectorDayEyebrow').textContent = `DAY ${selDay} OF 30 RECORD`;
    document.getElementById('inspectorDayTitle').textContent = `Day ${selDay} (${formatFullDate(selDay)})`;

    document.getElementById('inspectorMetricsGrid').innerHTML = `
      <div class="stat-tile">
        <span class="stat-label">Weight</span>
        <span class="stat-value emerald">${selRec.weightKg !== null ? `${selRec.weightKg.toFixed(1)} <small>kg</small>` : '—'}</span>
      </div>
      <div class="stat-tile">
        <span class="stat-label">Calories</span>
        <span class="stat-value">${selNutri.calories} <small>kcal</small></span>
      </div>
      <div class="stat-tile">
        <span class="stat-label">Protein</span>
        <span class="stat-value">${selNutri.protein} <small>g</small></span>
      </div>
      <div class="stat-tile">
        <span class="stat-label">Water</span>
        <span class="stat-value">${selRec.waterMl} <small>ml</small></span>
      </div>
    `;

    document.getElementById('inspectorFoodList').innerHTML = selRec.foods
      .map((f) => {
        const m = calcFoodItemMacros(f);
        return `
          <div class="inspector-row ${f.checked ? 'done' : ''}" data-inspector-toggle-food="${escapeHtml(f.id)}">
            <span>${f.checked ? '✅' : '⬜'} <strong>${escapeHtml(f.name)}</strong> (${formatQty(f.qty)} ${escapeHtml(f.unit)})</span>
            <span>${m.cals} kcal • ${m.prot}g P</span>
          </div>
        `;
      })
      .join('');

    document.getElementById('inspectorWorkoutList').innerHTML = selRec.workouts
      .map((w) => `
        <div class="inspector-row ${w.checked ? 'done' : ''}" data-inspector-toggle-workout="${escapeHtml(w.id)}">
          <span>${w.checked ? '✅' : '⬜'} <strong>${escapeHtml(w.name)}</strong></span>
          <span>${w.target} ${escapeHtml(w.unit)}</span>
        </div>
      `)
      .join('') + (selRec.workoutNotes ? `<p class="card-subtitle" style="margin-top:6px;">Note: ${escapeHtml(selRec.workoutNotes)}</p>` : '');
  }

  // ==================== UTILITIES ====================
  function formatQty(q) {
    const n = Number(q);
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function switchTab(tabId) {
    activeTab = tabId;
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.id === `tab-${tabId}`);
    });
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ==================== EVENT LISTENERS ====================
  function attachEvents() {
    // Bottom Navigation Tabs
    document.querySelectorAll('.nav-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Quick data-goto-tab links
    document.querySelectorAll('[data-goto-tab]').forEach((el) => {
      el.addEventListener('click', () => switchTab(el.dataset.gotoTab));
    });

    // Day Switcher
    document.getElementById('prevDayBtn').addEventListener('click', () => {
      if (state.activeDay > 1) {
        state.activeDay--;
        state.historySelectedDay = state.activeDay;
        saveState();
        renderAll();
      }
    });

    document.getElementById('nextDayBtn').addEventListener('click', () => {
      if (state.activeDay < 30) {
        state.activeDay++;
        state.historySelectedDay = state.activeDay;
        saveState();
        renderAll();
      }
    });

    document.getElementById('jumpTodayBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      state.activeDay = computeTodayDayIndex(state.settings.startDate);
      state.historySelectedDay = state.activeDay;
      saveState('Jumped to Today');
      renderAll();
    });

    document.getElementById('daySwitcherCenter').addEventListener('click', () => {
      state.historySelectedDay = state.activeDay;
      renderHistoryTab();
      switchTab('history');
    });

    // Dashboard Quick Weight Button
    document.getElementById('dashQuickWeightBtn').addEventListener('click', () => {
      switchTab('weight');
      setTimeout(() => document.getElementById('dailyWeightInput').focus(), 150);
    });

    // Delegated clicks inside mainContent
    document.getElementById('mainContent').addEventListener('click', (e) => {
      const dayRec = state.days[state.activeDay];

      // 1. Dashboard quick food chip toggle
      const dashFoodChip = e.target.closest('[data-dash-food-id]');
      if (dashFoodChip) {
        const foodId = dashFoodChip.dataset.dashFoodId;
        const item = dayRec.foods.find((f) => f.id === foodId);
        if (item) {
          item.checked = !item.checked;
          saveState();
          renderAll();
        }
        return;
      }

      // 2. Food Tab checkbox toggle
      const toggleFood = e.target.closest('[data-toggle-food]');
      if (toggleFood) {
        const foodId = toggleFood.dataset.toggleFood;
        const item = dayRec.foods.find((f) => f.id === foodId);
        if (item) {
          item.checked = !item.checked;
          saveState();
          renderAll();
        }
        return;
      }

      // 3. Food Quantity Stepper (- / +)
      const stepFood = e.target.closest('[data-step-food]');
      if (stepFood) {
        const foodId = stepFood.dataset.stepFood;
        const dir = Number(stepFood.dataset.dir);
        const item = dayRec.foods.find((f) => f.id === foodId);
        if (item) {
          const step = item.step || (item.unit === 'ml' ? 50 : 0.5);
          item.qty = Math.max(step, +(item.qty + dir * step).toFixed(2));
          saveState();
          renderAll();
        }
        return;
      }

      // 4. Open Edit Food Modal
      const editFood = e.target.closest('[data-edit-food]');
      if (editFood) {
        openFoodModal(editFood.dataset.editFood);
        return;
      }

      // 5. Water delta buttons (+250, +500, -250)
      const waterDeltaBtn = e.target.closest('[data-water-delta]');
      if (waterDeltaBtn) {
        const delta = Number(waterDeltaBtn.dataset.waterDelta);
        dayRec.waterMl = Math.max(0, dayRec.waterMl + delta);
        saveState(delta > 0 ? `+${delta} ml water added` : `${delta} ml water`);
        renderAll();
        return;
      }

      // 6. Water glass tap
      const glassBtn = e.target.closest('[data-set-glasses]');
      if (glassBtn) {
        const g = Number(glassBtn.dataset.setGlasses);
        const targetMl = g * 250;
        dayRec.waterMl = dayRec.waterMl === targetMl ? targetMl - 250 : targetMl;
        saveState(`Water: ${dayRec.waterMl} ml`);
        renderAll();
        return;
      }

      // 7. Workout checkbox toggle
      const toggleWk = e.target.closest('[data-toggle-workout]');
      if (toggleWk) {
        const wkId = toggleWk.dataset.toggleWorkout;
        const w = dayRec.workouts.find((x) => x.id === wkId);
        if (w) {
          w.checked = !w.checked;
          saveState();
          renderAll();
        }
        return;
      }

      // 8. Workout target stepper
      const stepWk = e.target.closest('[data-step-workout]');
      if (stepWk) {
        const wkId = stepWk.dataset.stepWorkout;
        const dir = Number(stepWk.dataset.dir);
        const w = dayRec.workouts.find((x) => x.id === wkId);
        if (w) {
          const step = w.step || 5;
          w.target = Math.max(step, w.target + dir * step);
          saveState();
          renderAll();
        }
        return;
      }

      // 9. Weight chart point tap
      const chartPt = e.target.closest('[data-chart-day]');
      if (chartPt) {
        const d = Number(chartPt.dataset.chartDay);
        const w = chartPt.dataset.chartWeight;
        const tooltip = document.getElementById('weightChartTooltip');
        tooltip.textContent = `Day ${d} (${formatShortDate(d)}): ${w} kg`;
        tooltip.classList.remove('hidden');
        return;
      }

      // 10. Weight log row tap
      const jumpDayRow = e.target.closest('[data-jump-day]');
      if (jumpDayRow) {
        state.activeDay = clampDay(Number(jumpDayRow.dataset.jumpDay));
        state.historySelectedDay = state.activeDay;
        saveState(`Switched to Day ${state.activeDay}`);
        renderAll();
        return;
      }

      // 11. 30-Day History Calendar Cell click
      const calCell = e.target.closest('[data-select-history-day]');
      if (calCell) {
        state.historySelectedDay = clampDay(Number(calCell.dataset.selectHistoryDay));
        saveState();
        renderHistoryTab();
        return;
      }

      // 12. History Inspector direct toggle food/workout
      const inspFood = e.target.closest('[data-inspector-toggle-food]');
      if (inspFood) {
        const rec = state.days[state.historySelectedDay];
        const f = rec.foods.find((x) => x.id === inspFood.dataset.inspectorToggleFood);
        if (f) {
          f.checked = !f.checked;
          saveState();
          renderAll();
        }
        return;
      }

      const inspWk = e.target.closest('[data-inspector-toggle-workout]');
      if (inspWk) {
        const rec = state.days[state.historySelectedDay];
        const w = rec.workouts.find((x) => x.id === inspWk.dataset.inspectorToggleWorkout);
        if (w) {
          w.checked = !w.checked;
          saveState();
          renderAll();
        }
        return;
      }
    });

    // Food utility actions
    document.getElementById('checkAllFoodsBtn').addEventListener('click', () => {
      state.days[state.activeDay].foods.forEach((f) => { f.checked = true; });
      saveState('All foods checked!');
      renderAll();
    });

    document.getElementById('uncheckAllFoodsBtn').addEventListener('click', () => {
      state.days[state.activeDay].foods.forEach((f) => { f.checked = false; });
      saveState('Food checklist cleared');
      renderAll();
    });

    document.getElementById('resetDefaultFoodsBtn').addEventListener('click', () => {
      state.days[state.activeDay].foods = createDefaultFoods();
      saveState('Restored default daily foods');
      renderAll();
    });

    // Custom Water Input
    document.getElementById('addCustomWaterBtn').addEventListener('click', () => {
      const inp = document.getElementById('customWaterInput');
      const val = Number(inp.value);
      if (val > 0) {
        state.days[state.activeDay].waterMl += Math.round(val);
        inp.value = '';
        saveState(`+${Math.round(val)} ml water added`);
        renderAll();
      }
    });

    // Workout utility buttons & notes
    document.getElementById('checkAllWorkoutsBtn').addEventListener('click', () => {
      const rec = state.days[state.activeDay];
      rec.restDay = false;
      rec.workouts.forEach((w) => { w.checked = true; });
      saveState('Workout completed!');
      renderAll();
    });

    document.getElementById('restDayToggleBtn').addEventListener('click', () => {
      const rec = state.days[state.activeDay];
      rec.restDay = !rec.restDay;
      saveState(rec.restDay ? 'Marked as Rest Day' : 'Training Day active');
      renderAll();
    });

    document.getElementById('workoutNotesInput').addEventListener('input', (e) => {
      state.days[state.activeDay].workoutNotes = e.target.value;
      saveState();
    });

    // Plank Stopwatch
    document.getElementById('plankStartPauseBtn').addEventListener('click', togglePlankTimer);
    document.getElementById('plankResetBtn').addEventListener('click', resetPlankTimer);

    // Weight Entry Controls
    document.getElementById('weightMinusBtn').addEventListener('click', () => stepWeightInput(-0.1));
    document.getElementById('weightPlusBtn').addEventListener('click', () => stepWeightInput(0.1));

    document.getElementById('saveDailyWeightBtn').addEventListener('click', () => {
      const val = parseFloat(document.getElementById('dailyWeightInput').value);
      if (!isNaN(val) && val >= 25 && val <= 250) {
        state.days[state.activeDay].weightKg = +val.toFixed(1);
        saveState(`Saved ${val.toFixed(1)} kg for Day ${state.activeDay}`);
        renderAll();
      } else {
        showToast('Enter a valid weight in kg');
      }
    });

    document.getElementById('dailyWeightInput').addEventListener('change', (e) => {
      const val = parseFloat(e.target.value);
      if (!isNaN(val) && val >= 25 && val <= 250) {
        state.days[state.activeDay].weightKg = +val.toFixed(1);
        saveState(`Saved ${val.toFixed(1)} kg`);
        renderAll();
      }
    });

    document.getElementById('clearDailyWeightBtn').addEventListener('click', () => {
      state.days[state.activeDay].weightKg = null;
      saveState(`Cleared weight for Day ${state.activeDay}`);
      renderAll();
    });

    // History Inspector -> Open Day in Tracker
    document.getElementById('inspectorEditInTrackerBtn').addEventListener('click', () => {
      state.activeDay = state.historySelectedDay;
      saveState(`Editing Day ${state.activeDay}`);
      renderAll();
      switchTab('food');
    });

    // Modals Setup
    setupFoodModal();
    setupWorkoutModal();
    setupSettingsAndBackupModal();
    setupPwaInstall();
  }

  function stepWeightInput(delta) {
    const inp = document.getElementById('dailyWeightInput');
    const cur = parseFloat(inp.value) || state.settings.startWeight;
    const next = +(cur + delta).toFixed(1);
    inp.value = next.toFixed(1);
    state.days[state.activeDay].weightKg = next;
    saveState(`Weight: ${next.toFixed(1)} kg`);
    renderAll();
  }

  // ==================== PLANK LIVE STOPWATCH ====================
  function togglePlankTimer() {
    const btn = document.getElementById('plankStartPauseBtn');
    if (plankInterval) {
      clearInterval(plankInterval);
      plankInterval = null;
      btn.textContent = 'Resume';
      return;
    }

    const startMs = performance.now() - plankElapsedSec * 1000;
    btn.textContent = 'Pause';

    plankInterval = setInterval(() => {
      plankElapsedSec = (performance.now() - startMs) / 1000;
      updatePlankDisplay();

      const dayRec = state.days[state.activeDay];
      const plankItem = dayRec.workouts.find((w) => w.id === 'plank' || w.name.toLowerCase().includes('plank'));
      const targetSec = plankItem ? plankItem.target : 60;

      if (plankItem && !plankItem.checked && plankElapsedSec >= targetSec) {
        plankItem.checked = true;
        saveState(`Plank target (${targetSec}s) completed! 💪`);
        renderAll();
      }
    }, 100);
  }

  function resetPlankTimer() {
    if (plankInterval) {
      clearInterval(plankInterval);
      plankInterval = null;
    }
    plankElapsedSec = 0;
    updatePlankDisplay();
    document.getElementById('plankStartPauseBtn').textContent = 'Start Timer';
  }

  function updatePlankDisplay() {
    const mins = Math.floor(plankElapsedSec / 60);
    const secs = Math.floor(plankElapsedSec % 60);
    const tenths = Math.floor((plankElapsedSec * 10) % 10);
    document.getElementById('plankTimerDisplay').textContent =
      `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
  }

  // ==================== ADD / EDIT FOOD MODAL ====================
  function openFoodModal(editFoodId = null) {
    const modal = document.getElementById('foodModalBackdrop');
    const title = document.getElementById('foodModalTitle');
    const idInp = document.getElementById('editFoodIdInput');
    const nameInp = document.getElementById('foodNameInput');
    const qtyInp = document.getElementById('foodQtyInput');
    const unitInp = document.getElementById('foodUnitInput');
    const calInp = document.getElementById('foodCalPerUnitInput');
    const protInp = document.getElementById('foodProtPerUnitInput');
    const delBtn = document.getElementById('deleteFoodItemBtn');
    const futureCheck = document.getElementById('applyFoodToFutureDays');

    const dayRec = state.days[state.activeDay];
    const existing = editFoodId ? dayRec.foods.find((f) => f.id === editFoodId) : null;

    if (existing) {
      title.textContent = `Edit ${existing.name}`;
      idInp.value = existing.id;
      nameInp.value = existing.name;
      qtyInp.value = existing.qty;
      unitInp.value = existing.unit;
      calInp.value = existing.calPerUnit;
      protInp.value = existing.protPerUnit;
      delBtn.classList.remove('hidden');
      futureCheck.checked = false;
    } else {
      title.textContent = 'Add Custom Food';
      idInp.value = '';
      nameInp.value = '';
      qtyInp.value = 1;
      unitInp.value = 'serving';
      calInp.value = 250;
      protInp.value = 12;
      delBtn.classList.add('hidden');
      futureCheck.checked = true;
    }

    updateFoodModalPreview();
    modal.classList.remove('hidden');
    nameInp.focus();
  }

  function updateFoodModalPreview() {
    const qty = parseFloat(document.getElementById('foodQtyInput').value) || 0;
    const cal = parseFloat(document.getElementById('foodCalPerUnitInput').value) || 0;
    const prot = parseFloat(document.getElementById('foodProtPerUnitInput').value) || 0;
    const totalCal = Math.round(qty * cal);
    const totalProt = +(qty * prot).toFixed(1);
    document.getElementById('foodModalCalcPreview').innerHTML =
      `Total for quantity: <strong>${totalCal} kcal</strong> • <strong>${totalProt} g protein</strong>`;
  }

  function setupFoodModal() {
    const modal = document.getElementById('foodModalBackdrop');
    const close = () => modal.classList.add('hidden');

    document.getElementById('addCustomFoodBtn').addEventListener('click', () => openFoodModal(null));
    document.getElementById('closeFoodModalBtn').addEventListener('click', close);
    document.getElementById('cancelFoodModalBtn').addEventListener('click', close);

    ['foodQtyInput', 'foodCalPerUnitInput', 'foodProtPerUnitInput'].forEach((id) => {
      document.getElementById(id).addEventListener('input', updateFoodModalPreview);
    });

    document.getElementById('foodItemForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const idVal = document.getElementById('editFoodIdInput').value;
      const name = document.getElementById('foodNameInput').value.trim() || 'Custom Food';
      const qty = Math.max(0.1, parseFloat(document.getElementById('foodQtyInput').value) || 1);
      const unit = document.getElementById('foodUnitInput').value.trim() || 'serving';
      const calPerUnit = Math.max(0, parseFloat(document.getElementById('foodCalPerUnitInput').value) || 0);
      const protPerUnit = Math.max(0, parseFloat(document.getElementById('foodProtPerUnitInput').value) || 0);
      const applyFuture = document.getElementById('applyFoodToFutureDays').checked;
      const step = unit === 'ml' ? 100 : 1;

      const dayRec = state.days[state.activeDay];

      if (idVal) {
        const item = dayRec.foods.find((f) => f.id === idVal);
        if (item) {
          item.name = name;
          item.qty = qty;
          item.unit = unit;
          item.calPerUnit = calPerUnit;
          item.protPerUnit = protPerUnit;
        }
        if (applyFuture) {
          for (let d = state.activeDay + 1; d <= 30; d++) {
            const target = state.days[d].foods.find((f) => f.id === idVal);
            if (target) {
              target.name = name;
              target.qty = qty;
              target.unit = unit;
              target.calPerUnit = calPerUnit;
              target.protPerUnit = protPerUnit;
            }
          }
        }
        saveState(`Updated ${name}`);
      } else {
        const newId = `custom_${Date.now()}`;
        const newItem = { id: newId, name, qty, unit, step, calPerUnit, protPerUnit, checked: true, isDefault: false };
        dayRec.foods.push(newItem);
        if (applyFuture) {
          for (let d = state.activeDay + 1; d <= 30; d++) {
            state.days[d].foods.push(Object.assign({}, newItem, { checked: false }));
          }
        }
        saveState(`Added ${name}`);
      }

      close();
      renderAll();
    });

    document.getElementById('deleteFoodItemBtn').addEventListener('click', () => {
      const idVal = document.getElementById('editFoodIdInput').value;
      if (!idVal) return;
      const dayRec = state.days[state.activeDay];
      dayRec.foods = dayRec.foods.filter((f) => f.id !== idVal);
      saveState('Food item removed');
      close();
      renderAll();
    });
  }

  // ==================== ADD WORKOUT MODAL ====================
  function setupWorkoutModal() {
    const modal = document.getElementById('workoutModalBackdrop');
    const close = () => modal.classList.add('hidden');

    document.getElementById('addCustomWorkoutBtn').addEventListener('click', () => {
      document.getElementById('workoutNameInput').value = '';
      document.getElementById('workoutTargetInput').value = 20;
      document.getElementById('workoutUnitInput').value = 'reps';
      modal.classList.remove('hidden');
      document.getElementById('workoutNameInput').focus();
    });

    document.getElementById('closeWorkoutModalBtn').addEventListener('click', close);
    document.getElementById('cancelWorkoutModalBtn').addEventListener('click', close);

    document.getElementById('workoutItemForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('workoutNameInput').value.trim() || 'Exercise';
      const target = Math.max(1, parseInt(document.getElementById('workoutTargetInput').value, 10) || 15);
      const unit = document.getElementById('workoutUnitInput').value.trim() || 'reps';

      state.days[state.activeDay].workouts.push({
        id: `wk_${Date.now()}`,
        name,
        target,
        unit,
        step: 5,
        checked: true,
        isDefault: false
      });

      saveState(`Added ${name}`);
      close();
      renderAll();
    });
  }

  // ==================== SETTINGS & JSON BACKUP MODAL ====================
  function setupSettingsAndBackupModal() {
    const modal = document.getElementById('settingsModalBackdrop');
    const close = () => modal.classList.add('hidden');

    document.getElementById('openSettingsBtn').addEventListener('click', () => {
      const s = state.settings;
      document.getElementById('setStartWeight').value = s.startWeight;
      document.getElementById('setTargetWeight').value = s.targetWeight;
      document.getElementById('setCalorieGoal').value = s.calorieGoal;
      document.getElementById('setProteinGoal').value = s.proteinGoal;
      document.getElementById('setWaterGoal').value = s.waterGoal;
      document.getElementById('setStartDate').value = s.startDate;
      document.getElementById('rawJsonTextarea').value = JSON.stringify(state, null, 2);
      modal.classList.remove('hidden');
    });

    document.getElementById('closeSettingsModalBtn').addEventListener('click', close);

    document.getElementById('goalSettingsForm').addEventListener('submit', (e) => {
      e.preventDefault();
      state.settings.startWeight = parseFloat(document.getElementById('setStartWeight').value) || 46.0;
      state.settings.targetWeight = parseFloat(document.getElementById('setTargetWeight').value) || 50.0;
      state.settings.calorieGoal = parseInt(document.getElementById('setCalorieGoal').value, 10) || 3000;
      state.settings.proteinGoal = parseInt(document.getElementById('setProteinGoal').value, 10) || 110;
      state.settings.waterGoal = parseInt(document.getElementById('setWaterGoal').value, 10) || 2500;
      state.settings.startDate = document.getElementById('setStartDate').value || getTodayISO();

      saveState('Goal settings updated!');
      close();
      renderAll();
    });

    // JSON Export Download
    document.getElementById('exportJsonBtn').addEventListener('click', () => {
      const jsonStr = JSON.stringify(state, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `GAIN30_Backup_${getTodayISO()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('JSON Backup downloaded!');
    });

    // JSON Import File Upload
    document.getElementById('importJsonFileInput').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.target.result));
          state = normalizeState(parsed);
          saveState('30-Day Backup Restored Successfully!');
          close();
          renderAll();
        } catch (err) {
          showToast('Invalid JSON backup file');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // Copy Raw JSON
    document.getElementById('copyRawJsonBtn').addEventListener('click', () => {
      const txt = JSON.stringify(state, null, 2);
      document.getElementById('rawJsonTextarea').value = txt;
      if (navigator.clipboard) {
        navigator.clipboard.writeText(txt).then(() => showToast('Copied JSON to clipboard!'));
      } else {
        showToast('JSON ready in text box');
      }
    });

    // Restore from Raw JSON Textarea
    document.getElementById('restoreRawJsonBtn').addEventListener('click', () => {
      try {
        const raw = document.getElementById('rawJsonTextarea').value;
        const parsed = JSON.parse(raw);
        state = normalizeState(parsed);
        saveState('Restored from JSON text!');
        close();
        renderAll();
      } catch {
        showToast('Invalid JSON format');
      }
    });

    // Factory Reset
    document.getElementById('factoryResetBtn').addEventListener('click', () => {
      if (window.confirm('Reset all 30-day records back to initial 46 kg → 50 kg defaults? Make sure you exported a backup if needed.')) {
        state = createInitialState();
        saveState('All 30-day data reset');
        close();
        renderAll();
      }
    });
  }

  // ==================== PWA SERVICE WORKER & INSTALL PROMPT ====================
  function setupPwaInstall() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
          console.warn('SW registration skipped/failed:', err);
        });
      });
    }

    const installBtn = document.getElementById('installPwaBtn');
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      installBtn.classList.remove('hidden');
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        installBtn.classList.add('hidden');
        showToast('Installing GAIN30...');
      }
      deferredInstallPrompt = null;
    });

    window.addEventListener('appinstalled', () => {
      installBtn.classList.add('hidden');
      showToast('GAIN30 installed on your device!');
    });
  }

  // Handle URL shortcut parameter (?tab=food or ?tab=weight)
  function checkUrlShortcut() {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['dashboard', 'food', 'workout', 'weight', 'history'].includes(tab)) {
      switchTab(tab);
    }
  }

  // Initialize App
  document.addEventListener('DOMContentLoaded', () => {
    attachEvents();
    renderAll();
    checkUrlShortcut();
  });
})();

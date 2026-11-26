// Global Web Audio Context for synthesized sound cues
let audioCtx = null;

function playSound(frequency, duration) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
        
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        // Exponential decay
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.log("Web Audio API not supported or blocked by user gesture:", e);
    }
}

// State variables
let waterLogged = 0;
let caloriesBudget = 0;
let exercises = [
    { id: 1, name: "50x Jumping Jacks", completed: false },
    { id: 2, name: "20x Push Ups", completed: false },
    { id: 3, name: "15x Bodyweight Squats", completed: false },
    { id: 4, name: "30s Low Plank", completed: false }
];

// HIIT Timer state variables
let timerInterval = null;
let timerState = 'idle'; // idle, counting, paused
let workDuration = 30;
let restDuration = 15;
let totalRounds = 4;
let currentRound = 1;
let timeRemaining = 5; // Start with 5s countdown
let currentPhase = 'prepare'; // prepare, work, rest

// DOM Elements
const timerWork = document.getElementById('timerWork');
const timerRest = document.getElementById('timerRest');
const timerRounds = document.getElementById('timerRounds');
const workValLabel = document.getElementById('workValLabel');
const restValLabel = document.getElementById('restValLabel');
const roundsValLabel = document.getElementById('roundsValLabel');

const btnStartTimer = document.getElementById('btnStartTimer');
const btnPauseTimer = document.getElementById('btnPauseTimer');
const btnStopTimer = document.getElementById('btnStopTimer');

const timerConfig = document.getElementById('timerConfig');
const timerActiveDisplay = document.getElementById('timerActiveDisplay');
const timerControls = document.getElementById('timerControls');
const timerActiveControls = document.getElementById('timerActiveControls');

const timerRingColor = document.getElementById('timerRingColor');
const timerPhaseText = document.getElementById('timerPhaseText');
const timerClock = document.getElementById('timerClock');
const currentRoundText = document.getElementById('currentRoundText');
const totalRoundsText = document.getElementById('totalRoundsText');

// Init application
document.addEventListener("DOMContentLoaded", () => {
    loadLocalStorage();
    setupEventHandlers();
    updateWaterUI();
    renderExercises();
    updateSlidersLabel();
});

function setupEventHandlers() {
    // Calorie Calculator
    document.getElementById('btnCalculateTdee').addEventListener('click', calculateTdee);
    document.getElementById('btnRecalculate').addEventListener('click', () => {
        document.getElementById('resultsBox').classList.add('d-none');
        document.getElementById('calculatorBox').classList.remove('d-none');
    });

    // Reset Day Data (2-click inline confirm, no native blocking dialog)
    const btnResetAll = document.getElementById('btnResetAll');
    let resetArmed = false;
    btnResetAll.addEventListener('click', () => {
        if (!resetArmed) {
            resetArmed = true;
            btnResetAll.dataset.orig = btnResetAll.innerHTML;
            btnResetAll.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i> Click again to confirm Reset';
            setTimeout(() => {
                resetArmed = false;
                if (btnResetAll.dataset.orig) btnResetAll.innerHTML = btnResetAll.dataset.orig;
            }, 3500);
            return;
        }
        resetArmed = false;
        if (btnResetAll.dataset.orig) btnResetAll.innerHTML = btnResetAll.dataset.orig;
        waterLogged = 0;
        caloriesBudget = 0;
        exercises.forEach(ex => ex.completed = false);
        saveToLocalStorage();
        updateWaterUI();
        renderExercises();
        document.getElementById('resultsBox').classList.add('d-none');
        document.getElementById('calculatorBox').classList.remove('d-none');
    });

    // Routine Planner
    document.getElementById('btnAddExercise').addEventListener('click', addCustomExercise);
    document.getElementById('exerciseInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addCustomExercise();
    });

    // HIIT Sliders
    timerWork.addEventListener('input', updateSlidersLabel);
    timerRest.addEventListener('input', updateSlidersLabel);
    timerRounds.addEventListener('input', updateSlidersLabel);

    // HIIT Controls
    btnStartTimer.addEventListener('click', startHiitTimer);
    btnPauseTimer.addEventListener('click', pauseHiitTimer);
    btnStopTimer.addEventListener('click', stopHiitTimer);
}

// Local Storage Handlers
function saveToLocalStorage() {
    localStorage.setItem('aura_water', waterLogged);
    localStorage.setItem('aura_calories', caloriesBudget);
    localStorage.setItem('aura_exercises', JSON.stringify(exercises));
}

function loadLocalStorage() {
    const savedWater = localStorage.getItem('aura_water');
    const savedCalories = localStorage.getItem('aura_calories');
    const savedExercises = localStorage.getItem('aura_exercises');

    if (savedWater !== null) waterLogged = parseInt(savedWater);
    if (savedCalories !== null && parseInt(savedCalories) > 0) {
        caloriesBudget = parseInt(savedCalories);
        showCalorieResult(caloriesBudget);
    }
    if (savedExercises !== null) {
        exercises = JSON.parse(savedExercises);
    }
}

// Calorie Calculator Formulas
function calculateTdee() {
    const age = parseInt(document.getElementById('fitAge').value);
    const weight = parseFloat(document.getElementById('fitWeight').value);
    const height = parseFloat(document.getElementById('fitHeight').value);
    const gender = document.getElementById('fitGender').value;
    const activity = parseFloat(document.getElementById('fitActivity').value);
    const goal = document.getElementById('fitGoal').value;

    if (!age || !weight || !height || age <= 0 || weight <= 0 || height <= 0) {
        let errBox = document.getElementById('tdeeValidationError');
        if (!errBox) {
            errBox = document.createElement('div');
            errBox.id = 'tdeeValidationError';
            errBox.className = 'alert alert-danger py-2 mt-2 small';
            document.getElementById('calculatorBox').appendChild(errBox);
        }
        errBox.textContent = 'Please enter valid positive Age, Weight, and Height values.';
        return;
    }
    const existingErr = document.getElementById('tdeeValidationError');
    if (existingErr) existingErr.remove();

    // BMR formula (Mifflin-St Jeor)
    let bmr = 0;
    if (gender === 'male') {
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5;
    } else {
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161;
    }

    const tdee = Math.round(bmr * activity);
    let budget = tdee;

    if (goal === 'lose') budget = tdee - 500;
    else if (goal === 'gain') budget = tdee + 500;

    caloriesBudget = budget;
    saveToLocalStorage();
    showCalorieResult(caloriesBudget);
}

function showCalorieResult(val) {
    document.getElementById('calculatorBox').classList.add('d-none');
    document.getElementById('resultsBox').classList.remove('d-none');
    document.getElementById('caloriesOutput').innerText = val;
    
    const goalText = document.getElementById('fitGoal').options[document.getElementById('fitGoal').selectedIndex].text;
    document.getElementById('tdeeSummaryText').innerText = `Target calculated for your goal: ${goalText}`;
}

// Hydration Log Logic
function addWater(amount) {
    waterLogged = Math.min(waterLogged + amount, 6000);
    saveToLocalStorage();
    updateWaterUI();
    playSound(600, 0.15); // Water drop bubble sound
}

function updateWaterUI() {
    document.getElementById('waterVal').innerText = waterLogged;
    const pct = Math.min(Math.round((waterLogged / 3000) * 100), 100);
    document.getElementById('waterPercent').innerText = `${pct}%`;
    document.getElementById('waterBar').style.width = `${pct}%`;
}

// Routine List logic
function renderExercises() {
    const list = document.getElementById('exerciseList');
    list.innerHTML = '';
    
    let completed = 0;

    exercises.forEach(ex => {
        if (ex.completed) completed++;

        const item = document.createElement('div');
        item.className = `list-item-fit ${ex.completed ? 'completed' : ''}`;
        item.innerHTML = `
            <div onclick="toggleExercise(${ex.id})" style="flex-grow: 1;">
                <i class="fa-solid ${ex.completed ? 'fa-circle-check text-success-fit' : 'fa-circle-notch text-muted-nav'} me-3"></i>
                <span>${ex.name}</span>
            </div>
            <button class="btn-delete-item-fit" onclick="deleteExercise(${ex.id})"><i class="fa-solid fa-trash-can"></i></button>
        `;
        list.appendChild(item);
    });

    document.getElementById('completedCount').innerText = completed;
    
    // Check achievements
    const trophy = document.getElementById('trophyIcon');
    if (completed > 0 && completed === exercises.length) {
        trophy.classList.add('active');
        trophy.innerHTML = '<i class="fa-solid fa-trophy fs-3"></i>';
    } else {
        trophy.classList.remove('active');
        trophy.innerHTML = '<i class="fa-solid fa-medal text-muted-nav fs-3"></i>';
    }
}

function toggleExercise(id) {
    const ex = exercises.find(item => item.id === id);
    if (ex) {
        ex.completed = !ex.completed;
        saveToLocalStorage();
        renderExercises();
        playSound(ex.completed ? 700 : 450, 0.1);
    }
}

function addCustomExercise() {
    const input = document.getElementById('exerciseInput');
    const name = input.value.trim();
    if (name === '') return;

    const newEx = {
        id: Date.now(),
        name: name,
        completed: false
    };

    exercises.push(newEx);
    saveToLocalStorage();
    renderExercises();
    input.value = '';
    playSound(800, 0.1);
}

function deleteExercise(id) {
    exercises = exercises.filter(ex => ex.id !== id);
    saveToLocalStorage();
    renderExercises();
    playSound(350, 0.15);
}

// HIIT Timer Functions
function updateSlidersLabel() {
    workValLabel.innerText = `${timerWork.value}s`;
    restValLabel.innerText = `${timerRest.value}s`;
    roundsValLabel.innerText = `${timerRounds.value} Rounds`;
}

function startHiitTimer() {
    if (timerState === 'idle') {
        // Initialize timer values from sliders
        workDuration = parseInt(timerWork.value);
        restDuration = parseInt(timerRest.value);
        totalRounds = parseInt(timerRounds.value);
        currentRound = 1;
        timeRemaining = 5; // 5s prepare countdown
        currentPhase = 'prepare';
        
        timerWork.disabled = true;
        timerRest.disabled = true;
        timerRounds.disabled = true;

        timerConfig.classList.add('d-none');
        timerActiveDisplay.classList.remove('d-none');
        timerControls.classList.add('d-none');
        timerActiveControls.classList.remove('d-none');
    }

    timerState = 'counting';
    btnPauseTimer.innerHTML = '<i class="fa-solid fa-pause me-2"></i>Pause Session';
    
    // Unlock Audio Context (must be on click event)
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    
    runCountdownLoop();
}

function runCountdownLoop() {
    clearInterval(timerInterval);
    
    updateTimerUI();
    
    timerInterval = setInterval(() => {
        timeRemaining--;
        
        if (timeRemaining < 0) {
            // Transition to next phase
            transitionPhase();
        } else {
            // Standard second tick down sound cue
            if (timeRemaining <= 3 && timeRemaining > 0) {
                playSound(600, 0.08); // High frequency quick warning beep
            }
            updateTimerUI();
        }
    }, 1000);
}

function updateTimerUI() {
    // Clock numbers formatting
    timerClock.innerText = timeRemaining.toString().padStart(2, '0');
    currentRoundText.innerText = currentRound;
    totalRoundsText.innerText = totalRounds;

    // Phase style transitions
    timerRingColor.className = 'timer-ring-outer';
    if (currentPhase === 'prepare') {
        timerPhaseText.innerText = 'GET READY';
        timerRingColor.classList.add('timer-state-ready');
    } else if (currentPhase === 'work') {
        timerPhaseText.innerText = 'WORK HARD';
        timerRingColor.classList.add('timer-state-work');
    } else if (currentPhase === 'rest') {
        timerPhaseText.innerText = 'REST PERIOD';
        timerRingColor.classList.add('timer-state-rest');
    }
}

function transitionPhase() {
    if (currentPhase === 'prepare') {
        // Go to round 1 work
        currentPhase = 'work';
        timeRemaining = workDuration;
        playSound(1000, 0.45); // Heavy sound trigger for WORK
    } else if (currentPhase === 'work') {
        // Work finished. Is this the last round?
        if (currentRound >= totalRounds) {
            // Whole HIIT routine completed!
            endRoutineSuccess();
            return;
        } else {
            // Rest phase
            currentPhase = 'rest';
            timeRemaining = restDuration;
            playSound(400, 0.45); // Calm transition for REST
        }
    } else if (currentPhase === 'rest') {
        // Rest completed, advance round
        currentRound++;
        currentPhase = 'work';
        timeRemaining = workDuration;
        playSound(1000, 0.45); // Heavy sound trigger for WORK
    }
    
    updateTimerUI();
}

function pauseHiitTimer() {
    if (timerState === 'counting') {
        timerState = 'paused';
        clearInterval(timerInterval);
        btnPauseTimer.innerHTML = '<i class="fa-solid fa-play me-2"></i>Resume';
        timerPhaseText.innerText = 'SESSION PAUSED';
        playSound(450, 0.15);
    } else if (timerState === 'paused') {
        startHiitTimer();
    }
}

function stopHiitTimer() {
    clearInterval(timerInterval);
    timerState = 'idle';
    
    timerWork.disabled = false;
    timerRest.disabled = false;
    timerRounds.disabled = false;

    timerConfig.classList.remove('d-none');
    timerActiveDisplay.classList.add('d-none');
    timerControls.classList.remove('d-none');
    timerActiveControls.classList.add('d-none');
    playSound(300, 0.3);
}

function endRoutineSuccess() {
    clearInterval(timerInterval);
    timerState = 'idle';
    
    timerClock.innerText = 'DONE';
    timerPhaseText.innerText = 'CONGRATULATIONS!';
    timerRingColor.className = 'timer-ring-outer timer-state-work';
    
    // Play celebratory synthetic fanfare
    setTimeout(() => playSound(523.25, 0.15), 0); // C5
    setTimeout(() => playSound(659.25, 0.15), 150); // E5
    setTimeout(() => playSound(783.99, 0.15), 300); // G5
    setTimeout(() => playSound(1046.50, 0.4), 450); // C6
    
    btnPauseTimer.classList.add('d-none');
    btnStopTimer.innerText = 'Return Setup';
    btnStopTimer.className = 'btn btn-warning-fit w-100 py-2';
    
    btnStopTimer.addEventListener('click', restoreHiitDashboard);
}

function restoreHiitDashboard() {
    btnPauseTimer.classList.remove('d-none');
    btnStopTimer.innerText = 'End';
    btnStopTimer.className = 'btn btn-outline-danger-fit w-100 py-2';
    btnStopTimer.removeEventListener('click', restoreHiitDashboard);
    stopHiitTimer();
}

const btnExportFitSummary = document.getElementById('btnExportFitSummary');
if (btnExportFitSummary) {
    btnExportFitSummary.addEventListener('click', () => {
        const lines = [
            'AuraFit Daily Workout & Health Summary',
            '======================================',
            `Generated: ${new Date().toLocaleString()}`,
            `Calorie Budget: ${caloriesBudget || 'Not calculated'} kcal/day`,
            `Hydration: ${waterLogged} / 3000 ml`,
            `HIIT Setup: ${timerWork.value}s work / ${timerRest.value}s rest x ${timerRounds.value} rounds`,
            '',
            'Routine Checklist:',
            ...exercises.map(ex => `- [${ex.completed ? 'x' : ' '}] ${ex.name}`),
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'aurafit-summary.txt';
        a.click();
    });
}

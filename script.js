/**
 * RULE BREAKER - Premium Logic Puzzle
 * v2.9.2 - Daily Lives Edition
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";
import { getFirestore, doc, getDoc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAc3UHoN1eGOYvnCeTGbzK6jBwA5LnKWEA",
  authDomain: "rulebreaker-cd36c.firebaseapp.com",
  projectId: "rulebreaker-cd36c",
  storageBucket: "rulebreaker-cd36c.firebasestorage.app",
  messagingSenderId: "336779222735",
  appId: "1:336779222735:web:e25a0e86c2df802ffca1ba",
  measurementId: "G-Q8V8DWXZ58"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CONFIG = {
    TOTAL_RULES: 100,
    COLORS: ['red', 'blue', 'green', 'yellow', 'purple'],
    SHAPES: ['circle', 'square', 'triangle'],
    INITIAL_TIME: 120,
    PENALTY: 3,
    HISTORY_LIMIT: 6,
    TIMER_CIRUMFERENCE: 283
};

class Game {
    constructor() {
        this.currentLevelNumber = parseInt(localStorage.getItem('rulebreaker_level_num')) || 1;
        this.ruleHistory = JSON.parse(localStorage.getItem('rulebreaker_history')) || [];
        this.starsData = JSON.parse(localStorage.getItem('rulebreaker_stars')) || {};
        this.ruleStars = JSON.parse(localStorage.getItem('rulebreaker_rule_stars')) || {};
        this.discoveredRules = new Set(JSON.parse(localStorage.getItem('rulebreaker_codex')) || []);
        
        this.dailyTrophies = parseInt(localStorage.getItem('rulebreaker_daily_count')) || 0;
        this.lastDailyDate = localStorage.getItem('rulebreaker_last_daily') || '';
        this.dailyAttempts = parseInt(localStorage.getItem('rulebreaker_daily_attempts')) ?? 3;
        this.lastAttemptDate = localStorage.getItem('rulebreaker_last_attempt_date') || '';
        this.isDailyMode = false;

        this.gridSize = 4;
        this.cells = [];
        this.correctCellsFound = 0;
        this.totalCorrectCells = 0;
        this.isLevelComplete = false;
        this.isGameStarted = false;
        
        this.consecutiveWrong = 0;
        this.lastClickTime = 0;
        this.wrongClicksThisLevel = 0;

        this.timeLeft = CONFIG.INITIAL_TIME;
        this.timerInterval = null;
        this.audioCtx = null;
        this.rulesPool = this.initRulesPool();
        this.dailyRulesPool = this.initDailyRulesPool();
        this.currentRule = null;
        this.currentRuleIndex = -1;
        this.user = null;
        this.hints = null;
        this.currentHintIndex = 0;

        this.dom = {
            appShell: document.querySelector('.app-shell'),
            menu: document.getElementById('main-menu'),
            game: document.getElementById('game-screen'),
            codex: document.getElementById('rules-screen'),
            board: document.getElementById('game-board'),
            level: document.getElementById('current-level'),
            timerText: document.getElementById('timer-value'),
            timerProgress: document.getElementById('timer-progress'),
            timerContainer: document.getElementById('timer-container'),
            progressBar: document.getElementById('progress-fill'),
            feedback: document.getElementById('feedback-text'),
            winModal: document.getElementById('win-modal'),
            overModal: document.getElementById('game-over-modal'),
            tutModal: document.getElementById('tutorial-modal'),
            resetModal: document.getElementById('reset-modal'),
            previewModal: document.getElementById('rule-preview-modal'),
            ruleDesc: document.getElementById('rule-text'),
            starsContainer: document.getElementById('stars-display'),
            startBtn: document.getElementById('start-game-btn'),
            dailyBtn: document.getElementById('daily-challenge-btn'),
            dailyLives: document.getElementById('daily-lives-display'),
            dailyTimer: document.getElementById('daily-countdown'),
            dailyCountDisplay: document.getElementById('daily-trophies'),
            howToBtn: document.getElementById('how-to-play-btn'),
            codexBtn: document.getElementById('view-rules-btn'),
            resetBtn: document.getElementById('reset-progress'),
            closeTut: document.getElementById('close-tutorial-btn'),
            cancelReset: document.getElementById('cancel-reset-btn'),
            closePreview: document.getElementById('close-preview-btn'),
            nextBtn: document.getElementById('next-level-btn'),
            retryBtn: document.getElementById('retry-level-btn'),
            homeBtn: document.getElementById('home-btn'),
            winHomeBtn: document.getElementById('win-home-btn'),
            codexBackBtn: document.getElementById('rules-back-btn'),
            codexList: document.getElementById('rules-list'),
            discoveredCount: document.getElementById('discovered-count'),
            resetBoard: document.getElementById('reset-board'),
            resetHint: document.getElementById('reset-rule-hint'),
            previewBoard: document.getElementById('preview-board'),
            previewTitle: document.getElementById('preview-rule-title'),
            previewDesc: document.getElementById('preview-rule-desc')
        };

        this.init();
        this.initAuth();
        this.startDailyTimer();
    }

    async initAuth() {
        onAuthStateChanged(auth, async (user) => {
            if (user) { this.user = user; await this.syncFromCloud(); }
            else { signInAnonymously(auth).catch((error) => console.error("Auth failed:", error)); }
        });
    }

    async syncToCloud() {
        if (!this.user) return;
        try {
            const userDoc = doc(db, "users", this.user.uid);
            await setDoc(userDoc, {
                level: this.currentLevelNumber,
                stars: this.starsData,
                ruleStars: this.ruleStars,
                codex: Array.from(this.discoveredRules),
                dailyCount: this.dailyTrophies,
                lastDailyDate: this.lastDailyDate,
                dailyAttempts: this.dailyAttempts,
                lastAttemptDate: this.lastAttemptDate,
                lastUpdated: new Date().getTime()
            }, { merge: true });
        } catch (e) { console.error("Cloud sync failed:", e); }
    }

    async syncFromCloud() {
        if (!this.user) return;
        try {
            const userDoc = doc(db, "users", this.user.uid);
            const snap = await getDoc(userDoc);
            if (snap.exists()) {
                const data = snap.data();
                if ((data.level || 0) >= this.currentLevelNumber) {
                    this.currentLevelNumber = data.level || 1;
                    this.starsData = data.stars || {};
                    this.ruleStars = data.ruleStars || {};
                    this.discoveredRules = new Set(data.codex || []);
                    this.dailyTrophies = data.dailyCount || 0;
                    this.lastDailyDate = data.lastDailyDate || '';
                    this.dailyAttempts = data.dailyAttempts ?? 3;
                    this.lastAttemptDate = data.lastAttemptDate || '';
                    this.saveLocal();
                    this.initMenu();
                }
            }
        } catch (e) { console.error("Cloud fetch failed:", e); }
    }

    saveLocal() {
        localStorage.setItem('rulebreaker_level_num', this.currentLevelNumber);
        localStorage.setItem('rulebreaker_stars', JSON.stringify(this.starsData));
        localStorage.setItem('rulebreaker_rule_stars', JSON.stringify(this.ruleStars));
        localStorage.setItem('rulebreaker_codex', JSON.stringify(Array.from(this.discoveredRules)));
        localStorage.setItem('rulebreaker_daily_count', this.dailyTrophies);
        localStorage.setItem('rulebreaker_last_daily', this.lastDailyDate);
        localStorage.setItem('rulebreaker_daily_attempts', this.dailyAttempts);
        localStorage.setItem('rulebreaker_last_attempt_date', this.lastAttemptDate);
    }

    init() {
        this.initMenu();
        this.dom.startBtn.onclick = () => { this.playSound('click'); this.startGame(); };
        this.dom.dailyBtn.onclick = () => { this.playSound('click'); this.startDailyChallenge(); };
        this.dom.howToBtn.onclick = () => { this.playSound('click'); this.dom.tutModal.classList.remove('hidden'); };
        this.dom.codexBtn.onclick = () => { this.playSound('click'); this.openCodex(); };
        this.dom.closeTut.onclick = () => { this.playSound('click'); this.dom.tutModal.classList.add('hidden'); };
        this.dom.resetBtn.onclick = () => { this.playSound('click'); this.openResetAuth(); };
        this.dom.cancelReset.onclick = () => { this.playSound('click'); this.dom.resetModal.classList.add('hidden'); };
        this.dom.closePreview.onclick = () => { this.playSound('click'); this.dom.previewModal.classList.add('hidden'); };
        this.dom.nextBtn.onclick = () => { this.playSound('click'); this.isDailyMode ? this.backToMenu() : this.nextLevel(); };
        this.dom.retryBtn.onclick = () => { this.playSound('click'); this.startLevel(); };
        this.dom.homeBtn.onclick = () => { this.playSound('click'); this.backToMenu(); };
        this.dom.winHomeBtn.onclick = () => { this.playSound('click'); this.backToMenu(); };
        this.dom.codexBackBtn.onclick = () => { this.playSound('click'); this.backToMenu(); };
        document.body.onclick = () => { if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); };
        this.createParticles();
        this.loadHints();
    }

    async loadHints() {
        try {
            const response = await fetch('hint.json');
            this.hints = await response.json();
        } catch (e) { console.error("Hints load failed:", e); }
    }

    initMenu() {
        const totalStars = Object.values(this.starsData).reduce((a, b) => a + b, 0);
        this.dom.appShell.querySelector('#total-stars').innerText = totalStars;
        this.dom.appShell.querySelector('#discovered-ratio').innerText = `${this.discoveredRules.size}/${CONFIG.TOTAL_RULES}`;
        this.dom.dailyCountDisplay.innerText = this.dailyTrophies;
        this.dom.appShell.querySelector('#level-subtitle').innerText = this.currentLevelNumber > 1 ? `Seviye ${this.currentLevelNumber}` : 'YENİ BAŞLA';
        
        const today = new Date().toISOString().split('T')[0];
        // Reset daily attempts if it's a new day
        if (this.lastAttemptDate !== today) {
            this.dailyAttempts = 3;
            this.lastAttemptDate = today;
            this.saveLocal();
        }

        this.renderDailyHearts();

        if (this.lastDailyDate === today) {
            this.dom.dailyBtn.classList.add('exhausted');
            this.dom.dailyBtn.style.opacity = '0.6';
        } else if (this.dailyAttempts <= 0) {
            this.dom.dailyBtn.classList.add('exhausted');
        } else {
            this.dom.dailyBtn.classList.remove('exhausted');
            this.dom.dailyBtn.style.opacity = '1';
        }
    }

    renderDailyHearts() {
        const hearts = this.dom.dailyLives.querySelectorAll('i');
        hearts.forEach((h, i) => {
            if (i < this.dailyAttempts) h.classList.remove('lost');
            else h.classList.add('lost');
        });
    }

    startDailyTimer() {
        setInterval(() => {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(0, 0, 0, 0);
            const diff = tomorrow - now;
            const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
            const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
            const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
            this.dom.dailyTimer.innerText = `${h}:${m}:${s}`;
        }, 1000);
    }

    startDailyChallenge() {
        const today = new Date().toISOString().split('T')[0];
        if (this.lastDailyDate === today || this.dailyAttempts <= 0) return;
        
        this.isDailyMode = true;
        this.dom.appShell.classList.add('daily-mode');
        this.dom.menu.classList.add('hidden');
        this.dom.game.classList.remove('hidden');
        this.startLevel();
    }

    startGame() {
        this.isDailyMode = false;
        this.dom.appShell.classList.remove('daily-mode');
        this.dom.menu.classList.add('hidden');
        this.dom.game.classList.remove('hidden');
        this.startLevel();
    }

    backToMenu() {
        this.stopTimer();
        this.isGameStarted = false;
        this.isDailyMode = false;
        this.dom.appShell.classList.remove('daily-mode');
        this.dom.game.classList.add('hidden');
        this.dom.codex.classList.add('hidden');
        this.dom.winModal.classList.add('hidden');
        this.dom.overModal.classList.add('hidden');
        this.dom.menu.classList.remove('hidden');
        this.initMenu();
    }

    openCodex() { this.dom.menu.classList.add('hidden'); this.dom.codex.classList.remove('hidden'); this.renderCodex(); }

    renderCodex() {
        this.dom.codexList.innerHTML = '';
        this.dom.discoveredCount.innerText = this.discoveredRules.size;
        document.getElementById('total-rules-count').innerText = CONFIG.TOTAL_RULES;
        const ruleEntries = this.rulesPool.map((rule, index) => ({ rule, index, isDiscovered: this.discoveredRules.has(index), stars: this.ruleStars[index] || 0 }));
        ruleEntries.sort((a, b) => (a.isDiscovered === b.isDiscovered) ? a.index - b.index : (a.isDiscovered ? -1 : 1));
        ruleEntries.forEach((entry) => {
            const { rule, index, isDiscovered, stars } = entry;
            const item = document.createElement('div');
            item.className = `rule-item ${isDiscovered ? 'unlocked' : 'locked'}`;
            let starHTML = '';
            for(let i=1; i<=3; i++) starHTML += `<span class="mini-star ${i <= stars ? 'active' : ''}"><i class="fas fa-star"></i></span>`;
            item.innerHTML = `<div class="rule-num">${index + 1}</div><div class="rule-info"><div class="rule-name">${isDiscovered ? rule.desc : '??????????'}</div><div class="rule-status">${isDiscovered ? 'KEŞFEDİLDİ' : 'BİLİNMİYOR'} ${isDiscovered ? `<div class="mini-stars">${starHTML}</div>` : ''}</div></div>${isDiscovered ? '<div class="rule-check"><i class="fas fa-check-circle"></i></div>' : '<div class="rule-lock"><i class="fas fa-lock"></i></div>'}`;
            if (isDiscovered) item.onclick = () => { this.playSound('click'); this.showRulePreview(index); };
            this.dom.codexList.appendChild(item);
        });
    }

    showRulePreview(ruleIndex) {
        const rule = this.rulesPool[ruleIndex];
        this.dom.previewTitle.innerText = `Kural #${ruleIndex + 1}`;
        this.dom.previewDesc.innerText = rule.desc;
        this.dom.previewBoard.innerHTML = '';
        const size = 4;
        this.dom.previewBoard.className = 'mini-grid preview-grid';
        let mockCells = []; let validSample = false; let attempts = 0;
        while(!validSample && attempts < 10) {
            mockCells = []; let matches = 0;
            for (let i = 0; i < size * size; i++) {
                const c = { row: Math.floor(i/size), col: i%size, gridSize: size, color: CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)], shape: CONFIG.SHAPES[Math.floor(Math.random() * CONFIG.SHAPES.length)] };
                c.isMatch = rule.check(c, mockCells); if (c.isMatch) matches++;
                mockCells.push(c);
            }
            if (matches > 0 && matches < size * size) validSample = true;
            attempts++;
        }
        mockCells.forEach(c => {
            const cellEl = document.createElement('div'); cellEl.className = `cell ${c.isMatch ? 'active' : ''} cell-${c.color}`;
            const s = document.createElement('div'); s.className = `shape ${c.shape}`; cellEl.appendChild(s);
            this.dom.previewBoard.appendChild(cellEl);
        });
        this.dom.previewModal.classList.remove('hidden');
    }

    openResetAuth() { this.dom.resetModal.classList.remove('hidden'); this.generateResetPuzzle(); }

    generateResetPuzzle() {
        this.dom.resetBoard.innerHTML = '';
        const targetColor = CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)];
        const colorNames = { 'red': 'KIRMIZI', 'blue': 'MAVİ', 'green': 'YEŞİL', 'yellow': 'SARI', 'purple': 'MOR' };
        this.dom.resetHint.innerText = `${colorNames[targetColor]} hücreleri seç`;
        let correctCount = 0; let foundCount = 0;
        for (let i = 0; i < 9; i++) {
            const color = CONFIG.COLORS[Math.floor(Math.random() * CONFIG.COLORS.length)];
            const isCorrect = color === targetColor; if (isCorrect) correctCount++;
            const cell = document.createElement('div'); cell.className = `cell cell-${color}`;
            cell.onclick = () => {
                this.playSound('click');
                if (isCorrect) {
                    if (cell.classList.contains('found')) return;
                    cell.classList.add('found'); foundCount++; this.playSound('correct');
                    if (foundCount === correctCount) this.executeReset();
                } else { this.playSound('wrong'); this.dom.resetModal.classList.add('hidden'); }
            };
            this.dom.resetBoard.appendChild(cell);
        }
        if (correctCount === 0) this.generateResetPuzzle();
    }

    async executeReset() {
        this.playSound('win');
        if (this.user) {
            const userDoc = doc(db, "users", this.user.uid);
            await setDoc(userDoc, { level: 1, stars: {}, ruleStars: {}, codex: [], dailyCount: 0, lastDailyDate: '', dailyAttempts: 3 }, { merge: true });
        }
        localStorage.clear(); location.reload();
    }

    seededRandom(seed) {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }

    startLevel() {
        this.dom.winModal.classList.add('hidden'); this.dom.overModal.classList.add('hidden');
        
        if (this.isDailyMode) {
            if (this.dailyAttempts <= 0) { this.backToMenu(); return; }
            const today = new Date().toISOString().split('T')[0];
            const seed = parseInt(today.replace(/-/g, ''));
            const index = seed % this.dailyRulesPool.length;
            this.currentRule = this.dailyRulesPool[index];
            this.currentRuleIndex = -1;
            this.gridSize = 6;
        } else {
            let index;
            do { index = Math.floor(Math.random() * this.rulesPool.length); } while (this.ruleHistory.includes(index));
            this.ruleHistory.push(index);
            if (this.ruleHistory.length > CONFIG.HISTORY_LIMIT) this.ruleHistory.shift();
            this.currentRuleIndex = index;
            this.currentRule = this.rulesPool[index];
            this.gridSize = this.currentLevelNumber >= 15 ? 5 : 4;
        }
        
        this.startLevelLogic();
        
        let feedbackText = "Gizli kuralı keşfet...";
        if (!this.isDailyMode && this.hints && this.hints.normal) {
            const ruleHints = this.hints.normal.find(h => h.id === this.currentRuleIndex);
            if (ruleHints && ruleHints.hints) {
                feedbackText = ruleHints.hints[Math.floor(Math.random() * 3)];
            }
        } else if (this.isDailyMode) {
            feedbackText = `GÜNLÜK MÜCADELE (Kalan Hak: ${this.dailyAttempts})`;
        }
        
        this.dom.feedback.innerText = feedbackText;
        this.dom.feedback.style.color = "var(--text-muted)";
    }

    startLevelLogic() {
        this.isLevelComplete = false; this.correctCellsFound = 0; this.consecutiveWrong = 0;
        this.wrongClicksThisLevel = 0; this.isGameStarted = true;
        this.generateGrid(); this.updateStats(); this.startTimer();
    }

    generateGrid() {
        this.dom.board.innerHTML = '';
        this.dom.board.className = this.gridSize === 4 ? 'grid-4x4' : (this.gridSize === 5 ? 'grid-5x5' : 'grid-6x6');
        const today = new Date().toISOString().split('T')[0];
        let seed = this.isDailyMode ? parseInt(today.replace(/-/g, '')) : Math.random() * 1000000;
        let valid = false;
        let attempts = 0;
        while (!valid && attempts < 100) {
            attempts++;
            this.cells = []; this.totalCorrectCells = 0;
            for (let i = 0; i < this.gridSize * this.gridSize; i++) {
                const rVal = this.isDailyMode ? this.seededRandom(seed++) : Math.random();
                const sVal = this.isDailyMode ? this.seededRandom(seed++) : Math.random();
                this.cells.push({ index: i, row: Math.floor(i/this.gridSize), col: i%this.gridSize, gridSize: this.gridSize, color: CONFIG.COLORS[Math.floor(rVal * CONFIG.COLORS.length)], shape: CONFIG.SHAPES[Math.floor(sVal * CONFIG.SHAPES.length)], isFound: false });
            }
            this.cells.forEach(c => { c.isCorrect = this.currentRule.check(c, this.cells); if (c.isCorrect) this.totalCorrectCells++; });
            if (this.totalCorrectCells >= 2 && this.totalCorrectCells <= (this.gridSize*this.gridSize - 5)) valid = true;
            if (!valid && this.isDailyMode) seed += 100;
        }
        this.cells.forEach((c, idx) => {
            const el = document.createElement('div'); el.className = `cell cell-${c.color}`; el.style.animationDelay = `${idx * 0.01}s`;
            const s = document.createElement('div'); s.className = `shape ${c.shape}`; el.appendChild(s);
            el.onclick = () => this.handleCellClick(c, el); this.dom.board.appendChild(el);
        });
    }

    handleCellClick(cell, el) {
        if (!this.isGameStarted || this.isLevelComplete || cell.isFound || this.timeLeft <= 0) return;
        this.lastClickTime = Date.now(); this.playSound('click');
        if (cell.isCorrect) {
            this.consecutiveWrong = 0; cell.isFound = true; el.classList.add('found'); this.correctCellsFound++; this.playSound('correct');
            if (this.correctCellsFound === this.totalCorrectCells) this.completeLevel();
        } else {
            this.wrongClicksThisLevel++; this.consecutiveWrong++;
            const penaltySequence = [3, 4, 5, 7, 10, 15, 20, 30, 45, 60];
            const penalty = penaltySequence[Math.min(this.consecutiveWrong - 1, penaltySequence.length - 1)];
            el.classList.add('wrong'); this.playSound('wrong'); 
            this.timeLeft = Math.max(0, this.timeLeft - penalty); this.updateTimerUI();
            setTimeout(() => el.classList.remove('wrong'), 400); 
            this.dom.feedback.innerText = `HATA! -${penalty}s`; this.dom.feedback.style.color = "var(--danger)";
        }
    }

    completeLevel() {
        this.isLevelComplete = true; this.stopTimer();
        this.dom.ruleDesc.innerText = this.currentRule.desc;
        let stars = 1;
        if (this.wrongClicksThisLevel <= 2 && this.timeLeft > 80) stars = 3;
        else if (this.wrongClicksThisLevel <= 5 && this.timeLeft > 40) stars = 2;
        if (this.isDailyMode) { this.lastDailyDate = new Date().toISOString().split('T')[0]; this.dailyTrophies++; }
        else {
            this.discoveredRules.add(this.currentRuleIndex);
            this.starsData[this.currentLevelNumber] = Math.max(this.starsData[this.currentLevelNumber] || 0, stars);
            this.ruleStars[this.currentRuleIndex] = Math.max(this.ruleStars[this.currentRuleIndex] || 0, stars);
        }
        this.saveLocal(); this.syncToCloud(); this.playSound('win');
        setTimeout(() => { this.showStars(this.isDailyMode ? 3 : stars); this.dom.winModal.classList.remove('hidden'); this.winFX(); }, 400);
    }

    showStars(count) {
        const stars = this.dom.starsContainer.querySelectorAll('.star');
        stars.forEach((s, i) => { s.classList.remove('active'); if (i < count) setTimeout(() => s.classList.add('active'), i * 200 + 300); });
    }

    nextLevel() { this.currentLevelNumber++; this.saveLocal(); this.syncToCloud(); this.startLevel(); }

    updateStats() { 
        this.dom.level.innerText = this.isDailyMode ? "DAILY" : this.currentLevelNumber.toString().padStart(2, '0'); 
        const progress = (this.currentLevelNumber % 10) * 10 || 100; 
        this.dom.progressBar.style.width = this.isDailyMode ? "100%" : `${progress}%`; 
    }

    startTimer() {
        this.stopTimer(); this.timeLeft = CONFIG.INITIAL_TIME; this.updateTimerUI();
        this.timerInterval = setInterval(() => { this.timeLeft--; this.updateTimerUI(); if (this.timeLeft <= 0) this.handleTimeUp(); }, 1000);
    }

    stopTimer() { if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; } }

    updateTimerUI() {
        this.dom.timerText.innerText = Math.max(0, this.timeLeft);
        const offset = CONFIG.TIMER_CIRUMFERENCE - (this.timeLeft / CONFIG.INITIAL_TIME) * CONFIG.TIMER_CIRUMFERENCE;
        this.dom.timerProgress.style.strokeDashoffset = offset;
        if (this.timeLeft <= 20) this.dom.timerContainer.classList.add('danger');
        else this.dom.timerContainer.classList.remove('danger');
    }

    handleTimeUp() {
        this.stopTimer();
        this.playSound('wrong');
        
        if (this.isDailyMode) {
            this.dailyAttempts--;
            this.saveLocal();
            this.syncToCloud();
            if (this.dailyAttempts <= 0) {
                this.dom.overModal.querySelector('h2').innerText = "HAKLAR TÜKENDİ";
                this.dom.overModal.querySelector('p').innerText = "Günün Mücadelesi için hakkın kalmadı. Yarın tekrar gel!";
                this.dom.retryBtn.classList.add('hidden');
            } else {
                this.dom.overModal.querySelector('p').innerText = `Günün Mücadelesi için ${this.dailyAttempts} hakkın kaldı!`;
                this.dom.retryBtn.classList.remove('hidden');
            }
        } else {
            this.dom.retryBtn.classList.remove('hidden');
        }
        
        this.dom.overModal.classList.remove('hidden');
    }

    getNeighbors(cell, grid) {
        const neighbors = [{r:cell.row-1, c:cell.col}, {r:cell.row+1, c:cell.col}, {r:cell.row, c:cell.col-1}, {r:cell.row, c:cell.col+1}];
        return neighbors.map(n => grid.find(gc => gc.row === n.r && gc.col === n.c)).filter(Boolean);
    }

    hasNeighborColor(cell, grid, color) { return this.getNeighbors(cell, grid).some(n => n.color === color); }

    playSound(type) {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator(); const gain = this.audioCtx.createGain(); osc.connect(gain); gain.connect(this.audioCtx.destination);
        const now = this.audioCtx.currentTime;
        if (type === 'click') { osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.05); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05); osc.start(); osc.stop(now + 0.05); }
        else if (type === 'correct') { osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1); gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(); osc.stop(now + 0.1); }
        else if (type === 'wrong') { osc.type = 'square'; osc.frequency.setValueAtTime(150, now); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.2); osc.start(); osc.stop(now + 0.2); }
        else if (type === 'win') { [523, 659, 783].forEach((f, i) => { const o = this.audioCtx.createOscillator(); const g = this.audioCtx.createGain(); o.connect(g); g.connect(this.audioCtx.destination); o.frequency.setValueAtTime(f, now + i*0.1); g.gain.setValueAtTime(0.1, now + i*0.1); g.gain.exponentialRampToValueAtTime(0.01, now + i*0.1 + 0.3); o.start(now + i*0.1); o.stop(now + i*0.1 + 0.3); }); }
    }

    createParticles() {
        const container = document.getElementById('particles'); if (!container) return;
        for (let i = 0; i < 30; i++) { const p = document.createElement('div'); p.className = 'bg-dot'; p.style.left = Math.random() * 100 + '%'; p.style.top = Math.random() * 100 + '%'; p.style.animationDelay = Math.random() * 10 + 's'; container.appendChild(p); }
    }

    winFX() {
        const rect = this.dom.board.getBoundingClientRect();
        for (let i = 0; i < 40; i++) {
            const p = document.createElement('div'); p.className = 'win-particle'; p.style.left = rect.left + rect.width/2 + 'px'; p.style.top = rect.top + rect.height/2 + 'px'; p.style.background = CONFIG.COLORS[Math.floor(Math.random()*CONFIG.COLORS.length)]; document.body.appendChild(p);
            const angle = Math.random() * Math.PI * 2; const dist = 150 + Math.random() * 250;
            p.animate([{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(angle)*dist}px, ${Math.sin(angle)*dist}px) scale(0)`, opacity: 0 }], { duration: 1200, easing: 'cubic-bezier(0, .9, .57, 1)' }).onfinish = () => p.remove();
        }
    }

    initDailyRulesPool() {
        return [
            { check: (c) => c.color === 'red' && c.shape === 'circle', desc: "Tüm kırmızı daireler" },
            { check: (c) => c.row === c.col && c.color === 'blue', desc: "Diyagonal üzerindeki maviler" },
            { check: (c) => (c.row + c.col) % 2 === 0 && c.shape === 'triangle', desc: "Açık karelerdeki üçgenler" },
            { check: (c) => c.color === 'green' && (c.row === 0 || c.row === 5), desc: "Üst ve alt sıradaki yeşiller" },
            { check: (c) => c.shape === 'square' && (c.col === 0 || c.col === 5), desc: "En sol ve sağdaki kareler" },
            { check: (c) => c.color === 'purple' && c.row >= 2 && c.row <= 3, desc: "Merkez iki satırdaki morlar" },
            { check: (c) => c.color === 'yellow' && c.col >= 2 && c.col <= 3, desc: "Merkez iki sütundaki sarılar" },
            { check: (c) => c.row + c.col === 5 && c.shape === 'circle', desc: "Ters diyagonaldeki daireler" },
            { check: (c) => (c.row === 0 || c.row === 5 || c.col === 0 || c.col === 5) && c.color === 'red', desc: "Kenarlardaki kırmızılar" },
            { check: (c) => !(c.row === 0 || c.row === 5 || c.col === 0 || c.col === 5) && c.shape === 'square', desc: "İç alandaki kareler" },
            { check: (c) => c.row % 2 === 0 && c.color === 'blue', desc: "Çift satırlardaki maviler" },
            { check: (c) => c.col % 2 !== 0 && c.color === 'green', desc: "Tek sütunlardaki yeşiller" },
            { check: (c) => c.shape === 'triangle' && c.color !== 'red', desc: "Kırmızı olmayan tüm üçgenler" },
            { check: (c) => c.color === 'purple' || c.color === 'yellow' && c.shape === 'circle', desc: "Morlar veya sarı daireler" },
            { check: (c) => c.row === 2 || c.row === 3 || c.col === 2 || c.col === 3, desc: "Merkez çapraz hatlar" },
            { check: (c) => (c.row + c.col) === 4, desc: "Toplam koordinatı 4 olanlar" },
            { check: (c) => c.color === 'red' && c.shape !== 'square', desc: "Kırmızı ama kare olmayanlar" },
            { check: (c) => c.shape === 'circle' && c.row < 3, desc: "Üst yarıdaki daireler" },
            { check: (c) => c.color === 'blue' && c.col > 2, desc: "Sağ yarıdaki maviler" },
            { check: (c) => (c.row + c.col) % 3 === 0 && c.color === 'green', desc: "3'lü desenlerdeki yeşiller" },
            { check: (c) => c.row === c.col && c.shape === 'triangle', desc: "Diyagonaldeki üçgenler" },
            { check: (c) => c.row + c.col === 5 && c.color === 'purple', desc: "Ters diyagonaldeki morlar" },
            { check: (c) => (c.row === 1 || c.row === 4) && (c.col === 1 || c.col === 4), desc: "İç çerçeve köşeleri" },
            { check: (c) => c.color === 'yellow' && c.row % 2 !== 0, desc: "Tek satırlardaki sarılar" },
            { check: (c) => c.shape === 'square' && c.col % 2 === 0, desc: "Çift sütunlardaki kareler" },
            { check: (c) => (c.row + c.col) % 4 === 0, desc: "Dama tahtası 4'lü desen" },
            { check: (c) => c.color === 'red' || c.color === 'blue' && c.shape === 'circle', desc: "Kırmızılar veya mavi daireler" },
            { check: (c) => c.shape === 'triangle' && (c.row === 0 || c.col === 0), desc: "Üst veya sol kenar üçgenleri" },
            { check: (c) => c.color === 'green' && (c.row === 5 || c.col === 5), desc: "Alt veya sağ kenar yeşilleri" },
            { check: (c) => (c.row === 2 || c.row === 3) && c.shape === 'square', desc: "Merkez yataydaki kareler" },
            { check: (c) => c.color === 'purple' && c.shape === 'circle' && (c.row + c.col) % 2 === 0, desc: "Açık karelerdeki mor daireler" },
            { check: (c) => c.color === 'blue' && c.row > c.col, desc: "Alt üçgendeki maviler" },
            { check: (c) => c.color === 'red' && c.row < c.col, desc: "Üst üçgendeki kırmızılar" },
            { check: (c) => c.shape === 'triangle' && c.row + c.col > 6, desc: "Sağ alt bölgedeki üçgenler" },
            { check: (c) => c.color === 'green' && c.row + c.col < 4, desc: "Sol üst bölgedeki yeşiller" },
            { check: (c) => c.color === 'yellow' && c.row === 0 || c.color === 'purple' && c.row === 5, desc: "Üstte sarı, altta mor" },
            { check: (c) => c.shape === 'square' && c.col === 2 || c.shape === 'circle' && c.col === 3, desc: "3. sütun kare, 4. sütun daire" },
            { check: (c) => (c.row + c.col) % 5 === 0, desc: "Beşerli desenler" },
            { check: (c) => c.color === 'red' && c.shape === 'triangle' || c.color === 'blue' && c.shape === 'square', desc: "Kırmızı üçgen veya mavi kare" },
            { check: (c) => c.row === 1 || c.row === 4 || c.col === 1 || c.col === 4, desc: "İç halka hücreleri" },
            { check: (c) => c.color === 'purple' && c.row === c.col, desc: "Diyagonal morlar" },
            { check: (c) => c.color === 'green' && c.row + c.col === 5, desc: "Ters diyagonal yeşiller" },
            { check: (c) => c.shape === 'circle' && c.color !== 'yellow', desc: "Sarı olmayan daireler" },
            { check: (c) => c.color === 'blue' && c.shape !== 'triangle', desc: "Mavi ama üçgen değil" },
            { check: (c) => (c.row === 0 || c.row === 5) && (c.col === 2 || c.col === 3), desc: "Üst/Alt merkez hücreler" },
            { check: (c) => (c.col === 0 || c.col === 5) && (c.row === 2 || c.row === 3), desc: "Sol/Sağ merkez hücreler" },
            { check: (c) => c.color === 'red' && c.row % 3 === 0, desc: "3'ün katı olan satır kırmızılar" },
            { check: (c) => c.shape === 'square' && c.col % 3 === 0, desc: "3'ün katı olan sütun kareler" },
            { check: (c) => (c.row + c.col) % 2 !== 0 && c.color === 'purple', desc: "Koyu karelerdeki morlar" },
            { check: (c) => c.gridSize === 6 && (c.row === 0 && c.col === 0 || c.row === 5 && c.col === 5), desc: "Sadece sol üst ve sağ alt köşe" }
        ];
    }

    initRulesPool() {
        return [
            { check: (c) => c.color === 'red', desc: "Tüm kırmızı kareler" },
            { check: (c) => c.row === 0 || c.row === c.gridSize - 1 || c.col === 0 || c.col === c.gridSize - 1, desc: "Tüm dış kenarlar" },
            { check: (c) => c.row === 0, desc: "En üstteki satır" },
            { check: (c) => c.color === 'blue', desc: "Tüm mavi kareler" },
            { check: (c) => (c.row === 1 || c.row === 2) && (c.col === 1 || c.col === 2), desc: "Merkezdeki 2x2 alan" },
            { check: (c) => c.col === 0, desc: "En soldaki sütun" },
            { check: (c) => c.shape === 'circle', desc: "Tüm daireler" },
            { check: (c) => c.color === 'green', desc: "Tüm yeşil kareler" },
            { check: (c) => c.row === c.gridSize - 1, desc: "En alttaki satır" },
            { check: (c) => c.col === c.gridSize - 1, desc: "En sağdaki sütun" },
            { check: (c) => c.color === 'red' && (c.row === 0 || c.row === c.gridSize-1) && (c.col === 0 || c.col === c.gridSize-1), desc: "Köşelerdeki kırmızılar" },
            { check: (c) => c.color === 'blue' && (c.row === 0 || c.row === c.gridSize-1 || c.col === 0 || c.col === c.gridSize-1), desc: "Kenarlardaki maviler" },
            { check: (c) => c.row === c.col, desc: "Sol üstten sağ alta çapraz" },
            { check: (c) => (c.row + c.col) % 2 === 0, desc: "Satranç tahtası (Açık)" },
            { check: (c) => c.color === 'green' && !((c.row === 0 || c.row === c.gridSize-1) && (c.col === 0 || c.col === c.gridSize-1)), desc: "Kenarlarda ama köşede değil" },
            { check: (c) => c.shape === 'triangle' && c.color === 'purple', desc: "Mor üçgenler" },
            { check: (c) => c.col === 1 || c.col === 3, desc: "2. ve 4. sütunlar" },
            { check: (c) => c.row === 1 || c.row === 3, desc: "2. ve 4. satırlar" },
            { check: (c) => c.color !== 'red', desc: "Kırmızı olmayanlar" },
            { check: (c) => c.row === Math.floor(c.gridSize/2) || c.col === Math.floor(c.gridSize/2), desc: "Merkez artı (+) şekli" },
            { check: (c, grid) => this.hasNeighborColor(c, grid, 'red'), desc: "Kırmızı kareye komşu olanlar" },
            { check: (c) => (c.row + c.col) % 2 !== 0, desc: "Satranç tahtası (Koyu)" },
            { check: (c) => c.color === 'red' || c.color === 'blue', desc: "Kırmızı veya mavi kareler" },
            { check: (c) => c.row === c.col || c.row + c.col === (c.gridSize - 1), desc: "Büyük X şekli" },
            { check: (c) => (c.row === 0 || c.row === c.gridSize-1 || c.col === 0 || c.col === c.gridSize-1) && c.color === 'yellow', desc: "Kenarlardaki sarılar" },
            { check: (c) => c.col === (c.gridSize - 1 - c.row), desc: "Sağ üstten sol alta çapraz" },
            { check: (c) => c.row > c.col, desc: "Diyagonalın altında kalanlar" },
            { check: (c) => c.row < c.col, desc: "Diyagonalın üstünde kalanlar" },
            { check: (c) => (c.row + c.col) % 3 === 0, desc: "3'erli diyagonal desen" },
            { check: (c) => (c.row >= 1 && c.row <= 3) && (c.col >= 1 && c.col <= 3) && !(c.row === 2 && c.col === 2), desc: "Merkez etrafındaki halka" },
            { check: (c) => c.shape === 'square', desc: "Tüm kare şekilleri" },
            { check: (c) => c.row % 2 === 0, desc: "Çift satırlar" },
            { check: (c) => c.col % 2 === 0, desc: "Çift sütunlar" },
            { check: (c) => c.color === 'yellow' || c.color === 'purple', desc: "Sarı veya morlar" },
            { check: (c) => c.color === 'green' || c.shape === 'triangle', desc: "Yeşiller veya üçgenler" },
            { check: (c) => c.color === 'red' || c.shape === 'square', desc: "Kırmızılar veya kareler" },
            { check: (c) => [2, 3, 5, 7, 11, 13, 17, 19, 23].includes(c.row * 5 + c.col), desc: "ID numarası asal olanlar" },
            { check: (c) => (c.row + c.col) % 4 === 0, desc: "Her 4 karede bir desen" },
            { check: (c) => c.gridSize === 5 && (c.row === 2 || c.col === 2), desc: "5x5 merkez hatları" },
            { check: (c) => c.row >= 1 && c.row <= c.gridSize-2 && c.col >= 1 && c.col <= c.gridSize-2, desc: "İç kısımdaki alan" },
            { check: (c) => Math.abs(c.row - c.col) === 1, desc: "Ana diyagonalin hemen yanındakiler" },
            { check: (c) => c.row === 0 || c.row === c.gridSize-1, desc: "Sadece en üst ve en alt satır" },
            { check: (c) => c.col === 0 || c.col === c.gridSize-1, desc: "Sadece en sol ve en sağ sütun" },
            { check: (c) => (c.row === 1 || c.row === c.gridSize-2) && (c.col >= 1 && c.col <= c.gridSize-2), desc: "İç yatay çizgiler" },
            { check: (c) => (c.col === 1 || c.col === c.gridSize-2) && (c.row >= 1 && c.row <= c.gridSize-2), desc: "İç dikey çizgiler" },
            { check: (c) => c.color === 'purple' && c.shape === 'circle', desc: "Mor daireler" },
            { check: (c) => c.color === 'yellow' && c.shape === 'square', desc: "Sarı kareler" },
            { check: (c) => c.color === 'green' && c.shape === 'circle', desc: "Yeşil daireler" },
            { check: (c) => (c.row + c.col) === c.gridSize - 1, desc: "Ters çapraz çizgi" },
            { check: (c) => c.row === 1 && c.col === 1 || c.row === 1 && c.col === c.gridSize-2 || c.row === c.gridSize-2 && c.col === 1 || c.row === c.gridSize-2 && c.col === c.gridSize-2, desc: "İç köşeler" },
            { check: (c, grid) => grid.filter(g => g.color === c.color).length > 4, desc: "Tabloda 4'ten fazla bulunan renkler" },
            { check: (c, grid) => grid.filter(g => g.color === c.color).length < 3, desc: "Tabloda 3'ten az bulunan renkler" },
            { check: (c) => c.color !== 'red' && c.color !== 'blue', desc: "Kırmızı ve mavi olmayanlar" },
            { check: (c) => c.shape !== 'circle', desc: "Daire olmayan her şey" },
            { check: (c) => c.row % 2 !== 0, desc: "Tek numaralı satırlar" },
            { check: (c) => c.col % 2 !== 0, desc: "Tek numaralı sütunlar" },
            { check: (c) => (c.row + c.col) % 5 === 0, desc: "Koordinat toplamı 5'in katı olanlar" },
            { check: (c) => (c.row * c.col) % 2 !== 0, desc: "Satır ve sütun çarpımı tek olanlar" },
            { check: (c) => c.color === 'purple' || c.shape === 'circle', desc: "Morlar veya daireler" },
            { check: (c) => c.color === 'blue' && c.shape !== 'triangle', desc: "Mavi ama üçgen olmayanlar" },
            { check: (c, grid) => this.getNeighbors(c, grid).every(n => n.color !== c.color), desc: "Etrafında kendi renginden kimse olmayanlar" },
            { check: (c, grid) => this.getNeighbors(c, grid).some(n => n.shape === c.shape), desc: "Komşularından biriyle aynı şekle sahip olanlar" },
            { check: (c) => c.row === Math.floor(c.gridSize/2), desc: "Tam orta yatay hat" },
            { check: (c) => c.col === Math.floor(c.gridSize/2), desc: "Tam orta dikey hat" },
            { check: (c) => (c.row === 0 && c.col % 2 === 0) || (c.row === c.gridSize-1 && c.col % 2 !== 0), desc: "Üst çift, alt tek sütunlar" },
            { check: (c) => c.color === 'red' || c.color === 'green' || c.color === 'blue', desc: "Ana renkler (RGB)" },
            { check: (c) => c.color === 'yellow' || c.color === 'purple', desc: "Ara renkler" },
            { check: (c) => c.shape === 'triangle' && (c.row === 0 || c.row === c.gridSize-1), desc: "En üst veya en alttaki üçgenler" },
            { check: (c) => c.shape === 'square' && (c.col === 0 || c.col === c.gridSize-1), desc: "En sol veya en sağdaki kareler" },
            { check: (c) => (c.row + c.col) > 4, desc: "Koordinat toplamı 4'ten büyük olanlar" },
            { check: (c) => [0, 1, 4, 9, 16].includes(c.row * 5 + c.col), desc: "ID numarası tam kare olanlar" },
            { check: (c) => (c.row * c.col) === 0, desc: "En az bir koordinatı 0 olanlar" },
            { check: (c) => c.row === 2, desc: "3. satırdaki tüm hücreler" },
            { check: (c) => c.col === 2, desc: "3. sütundaki tüm hücreler" },
            { check: (c) => c.color === 'red' && c.row % 2 === 0, desc: "Çift satırlardaki kırmızılar" },
            { check: (c) => c.color === 'blue' && c.col % 2 !== 0, desc: "Tek sütunlardaki maviler" },
            { check: (c) => c.shape === 'circle' && (c.row + c.col) % 2 === 0, desc: "Satranç düzenindeki daireler" },
            { check: (c) => c.color === 'green' && c.row > 0 && c.row < c.gridSize-1, desc: "Üst ve alt kenar hariç yeşiller" },
            { check: (c) => c.color === 'purple' && c.col > 0 && c.col < c.gridSize-1, desc: "Sol ve sağ kenar hariç morlar" },
            { check: (c) => (c.row + c.col) === 3, desc: "Toplamı 3 eden koordinatlar" },
            { check: (c) => c.shape === 'triangle', desc: "Tüm üçgenler" },
            { check: (c) => c.color !== 'yellow' && c.shape === 'square', desc: "Sarı olmayan kareler" },
            { check: (c) => c.row === c.col + 1 || c.col === c.row + 1, desc: "Ana diyagonalın komşu çizgileri" },
            { check: (c) => (c.row === 0 || c.row === c.gridSize-1) && (c.col === 1 || c.col === c.gridSize-2), desc: "Kenar ortalarındaki hücreler" },
            { check: (c) => c.color === 'yellow' && c.row === c.col, desc: "Diyagonal üzerindeki sarılar" },
            { check: (c) => c.color === 'red' && c.row + c.col === c.gridSize-1, desc: "Ters diyagonal üzerindeki kırmızılar" },
            { check: (c) => c.shape === 'triangle' && c.color !== 'purple', desc: "Mor olmayan tüm üçgenler" },
            { check: (c) => c.shape === 'circle' && c.color !== 'green', desc: "Yeşil olmayan tüm daireler" },
            { check: (c) => c.row >= 2, desc: "Alt yarım küre (Satır >= 2)" },
            { check: (c) => c.col >= 2, desc: "Sağ yarım küre (Sütun >= 2)" },
            { check: (c) => (c.row + c.col) % 3 !== 0, desc: "Koordinat toplamı 3'ün katı OLMAYANLAR" },
            { check: (c) => c.color === 'blue' || c.color === 'red' || c.shape === 'circle', desc: "Mavi, Kırmızı veya Daire" },
            { check: (c) => (c.row === 0 || c.col === 0 || c.row === c.gridSize-1 || c.col === c.gridSize-1) && c.shape === 'triangle', desc: "Kenarlardaki tüm üçgenler" },
            { check: (c) => !(c.row === 1 || c.row === 2 || c.col === 1 || c.col === 2), desc: "Dış çerçeve köşeleri (Merkez hariç)" },
            { check: (c) => c.color === 'green' && c.shape === 'square', desc: "Yeşil kareler" },
            { check: (c) => c.color === 'purple' && c.shape === 'triangle', desc: "Mor üçgenler" },
            { check: (c) => (c.row + c.col) % 2 === 0 && c.color === 'yellow', desc: "Açık karelerdeki sarılar" },
            { check: (c) => (c.row + c.col) % 2 !== 0 && c.color === 'blue', desc: "Koyu karelerdeki maviler" },
            { check: (c) => c.row === 0 && c.color === 'red' || c.row === c.gridSize-1 && c.color === 'blue', desc: "Üstte kırmızı, altta mavi" },
            { check: (c) => c.gridSize === 5 && (c.row + c.col) === 4, desc: "5x5 için özel ters diyagonal" }
        ].slice(0, CONFIG.TOTAL_RULES);
    }
}

document.addEventListener('DOMContentLoaded', () => new Game());

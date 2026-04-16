/* ============================================
   SHARED APPLICATION LOGIC
   German A2 Course - Progress Tracking & Gamification
   ============================================ */

class GermanCourseApp {
    constructor() {
        this.exercisesCompleted = 0;
        this.totalExercises = 0;
        this.score = 0;
        this.achievements = [];
        this.streak = 0;
        this.currentChapter = 1;
        this.loadProgress();
    }

    // ============================================
    // PROGRESS MANAGEMENT
    // ============================================

    saveProgress() {
        const progress = {
            exercisesCompleted: this.exercisesCompleted,
            totalExercises: this.totalExercises,
            score: this.score,
            achievements: this.achievements,
            streak: this.streak,
            currentChapter: this.currentChapter,
            lastUpdated: new Date().toISOString()
        };
        localStorage.setItem('germanCourseProgress', JSON.stringify(progress));
    }

    loadProgress() {
        const saved = localStorage.getItem('germanCourseProgress');
        if (saved) {
            const progress = JSON.parse(saved);
            this.exercisesCompleted = progress.exercisesCompleted || 0;
            this.totalExercises = progress.totalExercises || 0;
            this.score = progress.score || 0;
            this.achievements = progress.achievements || [];
            this.streak = progress.streak || 0;
            this.currentChapter = progress.currentChapter || 1;
        }
    }

    // ============================================
    // EXERCISE TRACKING
    // ============================================

    recordExerciseCompletion(correct = true) {
        this.exercisesCompleted++;
        
        if (correct) {
            this.score += 10;
            this.streak++;
            this.checkForAchievements();
        } else {
            this.streak = 0;
        }
        
        this.updateUI();
        this.saveProgress();
    }

    // ============================================
    // ACHIEVEMENTS SYSTEM
    // ============================================

    checkForAchievements() {
        // First Exercise
        if (this.exercisesCompleted === 1) {
            this.unlockAchievement('first_step', 'First Step', 'Complete your first exercise!', '🎯');
        }

        // 5 Exercises
        if (this.exercisesCompleted === 5) {
            this.unlockAchievement('five_exercises', 'Getting Started', 'Complete 5 exercises!', '📚');
        }

        // 10 Exercises
        if (this.exercisesCompleted === 10) {
            this.unlockAchievement('ten_exercises', 'Dedicated Learner', 'Complete 10 exercises!', '⭐');
        }

        // Perfect Streak
        if (this.streak === 5) {
            this.unlockAchievement('streak_five', 'On Fire!', 'Get 5 correct answers in a row!', '🔥');
        }

        if (this.streak === 10) {
            this.unlockAchievement('streak_ten', 'Unstoppable', 'Get 10 correct answers in a row!', '⚡');
        }

        // Score Milestones
        if (this.score === 100) {
            this.unlockAchievement('score_100', 'Centennial', 'Reach 100 points!', '💯');
        }

        if (this.score >= 500) {
            this.unlockAchievement('score_500', 'Scholar', 'Reach 500 points!', '📖');
        }
    }

    unlockAchievement(id, title, description, emoji) {
        if (!this.achievements.includes(id)) {
            this.achievements.push(id);
            this.showAchievementBadge(title, emoji, description);
        }
    }

    showAchievementBadge(title, emoji, description) {
        const badge = document.createElement('div');
        badge.className = 'achievement-box';
        badge.innerHTML = `
            <div class="achievement-title">${emoji} ${title}</div>
            <div class="achievement-message">${description}</div>
        `;
        
        const container = document.querySelector('.content-area') || document.body;
        container.insertBefore(badge, container.firstChild);
        
        setTimeout(() => {
            badge.style.animation = 'fadeOut 0.5s ease forwards';
            setTimeout(() => badge.remove(), 500);
        }, 3000);
    }

    // ============================================
    // UI UPDATES
    // ============================================

    updateUI() {
        this.updateProgressBar();
        this.updateStats();
    }

    updateProgressBar() {
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            const percentage = this.totalExercises > 0 
                ? (this.exercisesCompleted / this.totalExercises) * 100 
                : 0;
            progressFill.style.width = percentage + '%';
        }

        const progressLabel = document.querySelector('.progress-label');
        if (progressLabel) {
            progressLabel.innerHTML = `
                <span>Exercises Completed</span>
                <span>${this.exercisesCompleted}/${this.totalExercises}</span>
            `;
        }
    }

    updateStats() {
        const vocab = document.getElementById('vocabCount');
        const grammar = document.getElementById('grammarCount');
        const exercises = document.getElementById('exerciseCount');

        if (vocab) vocab.textContent = this.exercisesCompleted;
        if (exercises) exercises.textContent = this.totalExercises;
    }

    setTotalExercises(count) {
        this.totalExercises = count;
        this.saveProgress();
        this.updateUI();
    }

    // ============================================
    // CHAPTER NAVIGATION
    // ============================================

    switchChapter(chapterNumber) {
        this.currentChapter = chapterNumber;
        this.saveProgress();
        window.location.href = `chapter${chapterNumber}.html`;
    }

    // ============================================
    // ANSWER VALIDATION
    // ============================================

    checkAnswer(isCorrect, feedback) {
        if (isCorrect) {
            this.recordExerciseCompletion(true);
            return {
                status: 'correct',
                message: `✅ Correct! ${feedback}`,
                className: 'result-correct'
            };
        } else {
            this.recordExerciseCompletion(false);
            return {
                status: 'incorrect',
                message: `❌ Incorrect. ${feedback}`,
                className: 'result-incorrect'
            };
        }
    }

    // ============================================
    // STREAK & MOTIVATION
    // ============================================

    getMotivationalMessage() {
        const messages = {
            0: '🎯 Ready to start? Complete your first exercise!',
            1: '🌟 Great start! Keep going!',
            3: '🔥 You\'re on fire! 3 in a row!',
            5: '⚡ Unstoppable! 5 correct answers!',
            10: '🏆 Incredible! 10 in a row!',
            20: '👑 You\'re a German master!'
        };

        return messages[this.streak] || messages[0];
    }

    // ============================================
    // STATISTICS
    // ============================================

    getStats() {
        return {
            exercisesCompleted: this.exercisesCompleted,
            totalExercises: this.totalExercises,
            score: this.score,
            streak: this.streak,
            achievements: this.achievements.length,
            completionPercentage: this.totalExercises > 0 
                ? Math.round((this.exercisesCompleted / this.totalExercises) * 100) 
                : 0
        };
    }

    // ============================================
    // UTILITIES
    // ============================================

    resetProgress() {
        if (confirm('Are you sure you want to reset all progress? This cannot be undone.')) {
            this.exercisesCompleted = 0;
            this.totalExercises = 0;
            this.score = 0;
            this.achievements = [];
            this.streak = 0;
            this.currentChapter = 1;
            localStorage.removeItem('germanCourseProgress');
            location.reload();
        }
    }
}

// Initialize the app
const app = new GermanCourseApp();

// ============================================
// EXERCISE CHECKER FUNCTIONS
// ============================================

function checkMultipleChoice(questionId, correctAnswer, feedback) {
    const selected = document.querySelector(`input[name="${questionId}"]:checked`);
    const resultBox = document.getElementById(`result-${questionId}`);

    if (!selected) {
        resultBox.classList.add('show', 'result-incorrect');
        resultBox.innerHTML = '<div class="result-text">⚠️ Please select an answer!</div>';
        return;
    }

    const isCorrect = selected.value === correctAnswer;
    const result = app.checkAnswer(isCorrect, feedback);

    resultBox.classList.remove('result-correct', 'result-incorrect');
    resultBox.classList.add('show', result.className);
    resultBox.innerHTML = `<div class="result-text">${result.message}</div><div class="result-feedback">Streak: ${app.streak} ✨</div>`;
}

function checkFillBlank(elementId, correctAnswer, feedback) {
    const input = document.getElementById(elementId);
    const resultBox = document.getElementById(`result-${elementId}`);
    const userAnswer = input.value.trim().toLowerCase();

    if (!userAnswer) {
        resultBox.classList.add('show', 'result-incorrect');
        resultBox.innerHTML = '<div class="result-text">⚠️ Please enter an answer!</div>';
        return;
    }

    const isCorrect = userAnswer === correctAnswer.toLowerCase();
    const result = app.checkAnswer(isCorrect, feedback);

    resultBox.classList.remove('result-correct', 'result-incorrect');
    resultBox.classList.add('show', result.className);
    
    if (!isCorrect) {
        resultBox.innerHTML = `<div class="result-text">${result.message}</div><div class="result-feedback">Correct answer: "${correctAnswer}"</div>`;
    } else {
        resultBox.innerHTML = `<div class="result-text">${result.message}</div>`;
    }
}

function checkMatching() {
    const matches = [
        { id: 'match1', correct: 'intelligent' },
        { id: 'match2', correct: 'shy' },
        { id: 'match3', correct: 'gentle' }
    ];

    const resultBox = document.getElementById('result-matching');
    let correct = 0;

    matches.forEach((match) => {
        const select = document.getElementById(match.id);
        const result = document.getElementById(`${match.id}-result`);

        if (select.value === match.correct) {
            correct++;
            result.textContent = '✅';
            result.style.color = 'var(--success-color)';
        } else {
            result.textContent = select.value ? '❌' : '';
            result.style.color = 'var(--secondary-color)';
        }
    });

    const isAllCorrect = correct === 3;
    const result = app.checkAnswer(isAllCorrect, 'Perfect matching!');

    resultBox.classList.remove('result-correct', 'result-incorrect');
    resultBox.classList.add('show', result.className);
    resultBox.innerHTML = `<div class="result-text">${correct}/3 Correct</div><div class="result-feedback">Streak: ${app.streak} ✨</div>`;
}

function checkTranslation(elementId, partialCorrect, feedback) {
    const input = document.getElementById(elementId);
    const resultBox = document.getElementById(`result-${elementId}`);
    const userAnswer = input.value.trim().toLowerCase();

    if (!userAnswer) {
        resultBox.classList.add('show', 'result-incorrect');
        resultBox.innerHTML = '<div class="result-text">⚠️ Please enter a translation!</div>';
        return;
    }

    const keyWords = partialCorrect.toLowerCase().split(' ').filter(w => w.length > 2);
    const matches = keyWords.filter(word => userAnswer.includes(word)).length;
    const isCorrect = matches >= Math.ceil(keyWords.length * 0.7);
    
    const result = app.checkAnswer(isCorrect, feedback);

    resultBox.classList.remove('result-correct', 'result-incorrect');
    resultBox.classList.add('show', result.className);
    resultBox.innerHTML = `<div class="result-text">${result.message}</div><div class="result-feedback">Streak: ${app.streak} ✨</div>`;
}

function switchChapter(chapterNumber) {
    app.switchChapter(chapterNumber);
}

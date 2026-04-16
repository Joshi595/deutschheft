# 🛠️ Technical Documentation - For Developers

This document contains technical details about the German A2 Course platform architecture, code structure, and development guidelines.

---

## 📁 Project Structure

```
german-a2/
├── index.html           # Home page with chapter overview and progress dashboard
├── chapters/
│   ├── chapter1.html    # Chapter 1: Character Traits (Charaktereigenschaften)
│   └── chapter2.html    # Chapter 2: Conjunction "Weil" (Because)
├── css/
│   └── master.css       # Central stylesheet for all pages
└── js/
    └── app.js           # Shared JavaScript logic and gamification system
```

---

## 🛠️ Technical Stack

- **HTML5**: Semantic markup for better structure
- **CSS3**: Modern styling with CSS variables, animations, and responsive grid layout
- **Vanilla JavaScript**: No dependencies for lightweight, fast performance
- **LocalStorage API**: Persists user progress across sessions

---

## 📊 Architecture

### 1. Modular Architecture

- **master.css**: Single centralized stylesheet used across all pages
  - Reduces HTTP requests
  - Consistent styling across the platform
  - Easy global theme changes
  
- **app.js**: Core JavaScript class `GermanCourseApp` for shared logic
  - Progress management
  - Achievement system
  - Exercise validation
  - UI updates
  
- **Separate chapter files**: Each chapter is standalone HTML
  - Easy to add new chapters
  - Encapsulated content
  - Independent progress tracking per chapter

### 2. File Descriptions

#### index.html (Home Page)
- Beautiful hero section with call-to-action
- Features showcase section
- Progress dashboard showing:
  - Total exercises completed
  - Overall score
  - Achievements unlocked
- Chapter grid with navigation
- Smooth animations and gradients

**Imports**: `css/master.css`, `js/app.js`

#### chapter1.html & chapter2.html
- Chapter header with progress bar
- Sidebar with chapter navigation
- Stats dashboard specific to chapters
- Lesson content:
  - Vocabulary tables with pronunciation
  - Grammar explanations with examples
  - Exercise section with tracker
- Completion message with next chapter navigation

**Imports**: `../css/master.css`, `../js/app.js`

#### master.css
Comprehensive stylesheet organized by sections:
- Root CSS variables for theming
- Typography and spacing standards
- Animation keyframes (@keyframes)
- Component styles for all UI elements
- Responsive breakpoints (768px, 480px)

**Key Features**:
- CSS Variables for easy customization
- Cubic-bezier easing for smooth animations
- Pseudo-elements (::before, ::after) for decorative effects
- Mobile-first responsive design

#### app.js
Main `GermanCourseApp` class with methods:
- `loadProgress()` - Restore progress from LocalStorage
- `saveProgress()` - Persist progress to LocalStorage
- `recordExerciseCompletion(chapterNum, exerciseNum, score)` - Track completion
- `checkAnswer(answer, correctAnswer, type)` - Validate answers
- `unlockAchievement(badge)` - Award badges
- `getStats()` - Return user statistics

---

## 🎨 Color Scheme & Variables

```css
--primary-color: #1e40af      /* Blue - Primary action */
--secondary-color: #dc2626    /* Red - Highlights */
--success-color: #10b981      /* Green - Correct answers */
--warning-color: #f59e0b      /* Orange - Exercises */
--accent-1: #667eea           /* Purple - Gradients */
--accent-2: #764ba2           /* Dark Purple - Gradients */
--accent-3: #06b6d4           /* Cyan - Additional */
--accent-4: #ec4899           /* Pink - Additional */
```

---

## 💾 Data Storage & LocalStorage

Progress is automatically stored with key `germanCourseProgress`:

```javascript
{
  exercisesCompleted: 5,
  totalExercises: 11,
  score: 50,
  achievements: [
    'first_step', 
    'five_exercises',
    'dedicated_learner',
    'on_fire',
    'unstoppable',
    'centennial',
    'scholar'
  ],
  streak: 3,
  currentChapter: 1,
  lastUpdated: "2026-04-16T10:30:00.000Z"
}
```

**LocalStorage Operations**:
- Data persists across browser sessions
- Survives browser restart
- Per-browser/per-device (not synced)
- ~5-10MB storage limit per domain

---

## 🔄 Exercise Validation Logic

Each exercise type has specialized validation:

### 1. Multiple Choice
- Exact string matching
- Case-insensitive comparison
- Return immediate pass/fail

### 2. Fill Blanks
- Case-insensitive word matching
- Supports multiple correct answers
- Partial credit possible

### 3. Matching Exercises
- All pairs must match for 100%
- Flexible matching with visual feedback
- Score = correct pairs / total pairs

### 4. Translation
- 70% keyword match required
- Flexible phrasing accepted
- Keywords extracted and compared

### 5. Custom Answers
- Check for required keywords (e.g., "weil")
- Support multiple valid variations
- Educate learner on structure

---

## 🎯 Achievement System

Seven badge types with unlock conditions:

| Badge | Unlock Condition | Points |
|-------|-----------------|--------|
| 🎯 First Step | Complete 1st exercise | 10 |
| 📚 Getting Started | Complete 5 exercises | 25 |
| ⭐ Dedicated Learner | Complete 10 exercises | 50 |
| 🔥 On Fire! | 5-answer streak | 30 |
| ⚡ Unstoppable | 10-answer streak | 50 |
| 💯 Centennial | Earn 100 points | 50 |
| 📖 Scholar | Earn 500 points | 100 |

---

## ⚡ Performance Optimizations

- **Single CSS file**: Reduces HTTP requests, better caching
- **Shared app.js**: Centralized logic, reduced duplication
- **LocalStorage**: Instant progress restoration (no server calls)
- **CSS animations**: GPU-accelerated transitions
- **Vanilla JS**: No framework overhead, fast execution

---

## 📱 Responsive Design Breakpoints

```css
/* Desktop (default) */
/* Normal full-width layout */

/* Tablet - max-width: 768px */
- Grid: single column
- Sidebar: static positioning
- Font sizes reduced by ~10-15%
- Button padding adjusted

/* Mobile - max-width: 480px */
- Minimal padding and margins
- Font sizes reduced by ~20-25%
- Touch-friendly button sizes
- Optimized for small screens
```

---

## 🚀 Adding New Chapters

### Step 1: Create Chapter HTML
1. Copy `chapters/chapter1.html` as template
2. Update title, content, and exercises
3. Import: `<link rel="stylesheet" href="../css/master.css">`
4. Import: `<script src="../js/app.js"></script>`

### Step 2: Add Navigation
1. Update chapter sidebar in new file
2. Add links to existing chapters
3. Update existing chapters' sidebars

### Step 3: Update Home Page
1. Add chapter card to `index.html` chapter grid
2. Link to new chapter with button

### Step 4: Define Exercises
- Use same HTML structure as existing chapters
- Maintain consistent CSS class names
- Exercises auto-integrate with progress tracking

---

## 🔍 Browser Compatibility

- **Chrome/Edge**: Full support ✅
- **Firefox**: Full support ✅
- **Safari**: Full support ✅
- **Mobile browsers**: Full support ✅

**Requirements**:
- ES6 (ECMAScript 2015) support
- LocalStorage API
- CSS Grid & Flexbox
- CSS custom properties (variables)

---

## 🐛 Debugging

### LocalStorage Issues
```javascript
// Check saved progress
console.log(JSON.parse(localStorage.getItem('germanCourseProgress')));

// Clear all progress (reset)
localStorage.removeItem('germanCourseProgress');

// Check specific values
const progress = JSON.parse(localStorage.getItem('germanCourseProgress'));
console.log('Score:', progress.score);
console.log('Achievements:', progress.achievements);
```

### Browser Console Checks
```javascript
// Verify app is loaded
console.log(typeof GermanCourseApp);

// Check method availability
console.log(typeof app.checkAnswer);
```

---

## 📝 Adding New Exercise Types

1. **Create validation function** in `app.js`
   - Compare user answer with correct answer
   - Return score (0-100)

2. **Create HTML structure** in chapter file
   - Use semantic class names
   - Follow existing patterns

3. **Create CSS styling** in `master.css`
   - Add component styles
   - Include hover/active states
   - Ensure responsiveness

4. **Integrate with progress** 
   - Call `recordExerciseCompletion()` on submit
   - Use `checkAnswer()` for validation

---

## 🔐 Security Notes

- All processing happens client-side
- No server communication
- Progress only stored locally
- Data never leaves user's device
- XSS prevention: Content is text (not HTML injection)

---

## 📈 Future Enhancements

- [ ] Backend API for progress sync across devices
- [ ] Audio pronunciation with Web Audio API
- [ ] Spaced repetition algorithm
- [ ] Leaderboard system
- [ ] Social sharing features
- [ ] PDF certificate generation
- [ ] Teacher dashboard
- [ ] AI-powered recommendations
- [ ] Offline support with Service Workers
- [ ] PWA capabilities

---

## 🤝 Contributing

To contribute:

1. **Fork the repository**
2. **Create a feature branch**
3. **Make changes with clear commits**
4. **Test on multiple browsers**
5. **Submit pull request with description**

### Code Style Guidelines
- Use consistent indentation (4 spaces)
- Comment complex logic
- Follow semantic HTML
- Use CSS variables for colors
- Mobile-first CSS approach

---

## 📄 License

This project is open source. Feel free to use, modify, and distribute.

---

**For learner documentation, see the main README.md**

Last Updated: April 16, 2026

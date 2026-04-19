/**
 * Universal AI Feedback Module
 * Provides intelligent feedback for exercises across all chapters
 */

class AIFeedbackEngine {
    constructor(apiKey = null) {
        this.apiKey = apiKey || localStorage.getItem('groqApiKey') || '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';
        this.model = 'llama-3.1-8b-instant';
        this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    }

    /**
     * Get AI feedback for any answer
     * @param {string} userAnswer - What the student answered
     * @param {string} correctAnswer - What the correct answer is
     * @param {string} exerciseType - Type of exercise (multiple-choice, fill-blank, translation, etc.)
     * @param {string} context - Exercise context/question
     * @returns {Promise<string|null>} One-line feedback or null
     */
    async getAnswerFeedback(userAnswer, correctAnswer, exerciseType, context) {
        try {
            const prompt = this.generateFeedbackPrompt(userAnswer, correctAnswer, exerciseType, context);
            return await this.callAPI(prompt);
        } catch (error) {
            console.error('AI Feedback Error:', error);
            return null;
        }
    }

    /**
     * Get feedback for creative writing/free-form responses
     * @param {string} userText - Student's written response
     * @param {string} topic - What the exercise is about (e.g., "nominative adjectives")
     * @returns {Promise<string|null>} Feedback or null
     */
    async getCreativeFeedback(userText, topic) {
        try {
            const prompt = `You are a German grammar tutor. A student wrote this sentence about ${topic}:

"${userText}"

Provide ONE-LINE feedback: If correct, praise briefly. If incorrect, give ONE specific grammar tip to fix it. Be concise!`;

            return await this.callAPI(prompt);
        } catch (error) {
            console.error('Creative Feedback Error:', error);
            return null;
        }
    }

    /**
     * Get feedback for grammar rules
     * @param {string} userAnswer - Student's answer
     * @param {string} rule - Grammar rule being tested (e.g., "nominative endings")
     * @param {string} context - Context of the question
     * @returns {Promise<string|null>} Feedback or null
     */
    async getGrammarFeedback(userAnswer, rule, context) {
        try {
            const prompt = `You are a German grammar tutor teaching about ${rule}.

Student answered: "${userAnswer}"
Context: ${context}

Provide ONE-LINE feedback: Why is this wrong and what's the correction? Format: "The error is... The correct rule is..."`;

            return await this.callAPI(prompt);
        } catch (error) {
            console.error('Grammar Feedback Error:', error);
            return null;
        }
    }

    /**
     * Get feedback for translation exercises
     * @param {string} userTranslation - Student's translation
     * @param {string} englishSentence - English sentence to translate
     * @returns {Promise<string|null>} Feedback or null
     */
    async getTranslationFeedback(userTranslation, englishSentence) {
        try {
            const prompt = `You are a German tutor. The student needs to translate: "${englishSentence}"

They answered: "${userTranslation}"

Provide ONE-LINE feedback: If close/correct in meaning, confirm. If wrong, give the key word they missed or grammar error. Be specific!`;

            return await this.callAPI(prompt);
        } catch (error) {
            console.error('Translation Feedback Error:', error);
            return null;
        }
    }

    /**
     * Generate prompt based on exercise type
     */
    generateFeedbackPrompt(userAnswer, correctAnswer, exerciseType, context) {
        const basePrompt = `You are a German grammar tutor. A student gave this answer to a grammar exercise.

Question: ${context}
Student's Answer: "${userAnswer}"
Correct Answer: "${correctAnswer}"
Exercise Type: ${exerciseType}`;

        const instructions = `Provide a ONE-LINE explanation of why the student's answer is wrong and how to correct it. Be concise and specific. Format: "Error: [problem] | Fix: [solution]"`;

        return `${basePrompt}\n\n${instructions}`;
    }

    /**
     * Call Groq API
     */
    async callAPI(prompt) {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.model,
                messages: [{ role: 'user', content: prompt }],
                max_tokens: 120,
                temperature: 0.7
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices[0]) {
            return data.choices[0].message.content.trim();
        }
        
        if (data.error) {
            console.error('API Error:', data.error.message);
            return null;
        }
        
        return null;
    }

    /**
     * Update API key (for setup.html)
     */
    setAPIKey(key) {
        this.apiKey = key;
        localStorage.setItem('groqApiKey', key);
    }
}

// Initialize globally
const aiFeedback = new AIFeedbackEngine();

// Groq API Configuration for German Language Exercises
// This module handles AI-powered validation for fill-in-the-blanks exercises

class GroqValidator {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        this.model = 'llama-3.1-8b-instant'; // Fast and free model
    }

    /**
     * Remove accents and umlauts for comparison
     */
    removeAccents(str) {
        return str.normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/ö/g, 'o')
            .replace(/ä/g, 'a')
            .replace(/ü/g, 'u')
            .replace(/ß/g, 'ss');
    }

    /**
     * Validate a German fill-in-the-blanks answer using Groq AI
     * @param {string} userAnswer - The answer provided by the user
     * @param {string} correctAnswer - The expected answer
     * @param {string} sentence - The full sentence context
     * @returns {Promise<Object>} - Contains isCorrect, feedback, score
     */
    async validateFillBlank(userAnswer, correctAnswer, sentence) {
        if (!this.apiKey) {
            // Fallback to basic validation if no API key
            console.log('No API key found, using basic validation');
            return this.basicValidation(userAnswer, correctAnswer);
        }

        const userTrimmed = userAnswer.toLowerCase().trim();
        const correctTrimmed = correctAnswer.toLowerCase().trim();
        
        // Exact match
        if (userTrimmed === correctTrimmed) {
            return {
                isCorrect: true,
                feedback: 'Perfect!',
                explanation: 'Your answer is exactly correct.',
                score: 10
            };
        }

        // Check if they match ignoring accents/umlauts (very close match)
        const userNoAccents = this.removeAccents(userTrimmed);
        const correctNoAccents = this.removeAccents(correctTrimmed);
        
        if (userNoAccents === correctNoAccents) {
            return {
                isCorrect: true,
                feedback: 'Correct! (Note: German uses umlauts - ä, ö, ü - which are important)',
                explanation: `Your answer "${userAnswer}" is essentially correct. The proper spelling is "${correctAnswer}".`,
                score: 10
            };
        }

        try {
            const prompt = `You are a strict German language teacher evaluating a fill-in-the-blank answer.

Sentence context: ${sentence}
Expected answer: ${correctAnswer}
Student's answer: ${userAnswer}

Respond with ONLY valid JSON (no other text):
{
  "isCorrect": false,
  "feedback": "The correct answer is '${correctAnswer}'. Your answer '${userAnswer}' is different.",
  "explanation": "Make sure you provide the exact word needed."
}`;

            console.log('Calling Groq API for validation...');
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 200
                })
            });

            if (!response.ok) {
                console.error('Groq API error - Status:', response.status);
                return this.basicValidation(userAnswer, correctAnswer);
            }

            const data = await response.json();
            const content = data.choices[0].message.content;
            
            // Parse JSON response
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.error('Could not parse JSON from response');
                return this.basicValidation(userAnswer, correctAnswer);
            }

            const result = JSON.parse(jsonMatch[0]);
            console.log('AI Validation result:', result);
            return {
                isCorrect: result.isCorrect,
                feedback: result.feedback,
                explanation: result.explanation,
                score: result.isCorrect ? 10 : 0
            };
        } catch (error) {
            console.error('Error calling Groq API:', error);
            return this.basicValidation(userAnswer, correctAnswer);
        }
    }

    /**
     * Fallback basic validation if API fails
     */
    basicValidation(userAnswer, correctAnswer) {
        const userTrimmed = userAnswer.toLowerCase().trim();
        const correctTrimmed = correctAnswer.toLowerCase().trim();
        
        // Exact match
        const isExact = userTrimmed === correctTrimmed;
        
        // Match ignoring accents
        const userNoAccents = this.removeAccents(userTrimmed);
        const correctNoAccents = this.removeAccents(correctTrimmed);
        const isCloseMatch = userNoAccents === correctNoAccents;
        
        if (isExact) {
            return {
                isCorrect: true,
                feedback: 'Perfect! Your answer is exactly correct.',
                explanation: 'Excellent work!',
                score: 10
            };
        }
        
        if (isCloseMatch) {
            return {
                isCorrect: true,
                feedback: 'Correct! (Note: proper spelling includes umlauts - ä, ö, ü)',
                explanation: `Your answer "${userAnswer}" is essentially correct. The proper spelling is "${correctAnswer}".`,
                score: 10
            };
        }
        
        return {
            isCorrect: false,
            feedback: `The correct answer is "${correctAnswer}", not "${userAnswer}".`,
            explanation: `Your answer does not match. The expected answer is: ${correctAnswer}`,
            score: 0
        };
    }
}

// Initialize validator with API key from environment or user input
let groqValidator = null;

function initializeGroqValidator(apiKey) {
    if (apiKey) {
        groqValidator = new GroqValidator(apiKey);
        console.log('Groq validator initialized');
    } else {
        console.log('Groq API key not found, using basic validation');
    }
}

// Try to get API key from localStorage or environment
function getGroqApiKey() {
    // Check localStorage first (user might have set it)
    const storedKey = localStorage.getItem('groqApiKey');
    if (storedKey) return storedKey;
    
    // Check if it's defined globally (can be set in HTML)
    if (typeof window.GROQ_API_KEY !== 'undefined') {
        return window.GROQ_API_KEY;
    }
    
    return null;
}

// Auto-initialize on load
document.addEventListener('DOMContentLoaded', () => {
    const apiKey = getGroqApiKey();
    console.log('API Key status:', apiKey ? 'Found ✅' : 'Not found ❌');
    if (apiKey) {
        console.log('API Key starts with:', apiKey.substring(0, 10) + '...');
    }
    initializeGroqValidator(apiKey);
    console.log('groqValidator status:', groqValidator ? 'Initialized ✅' : 'Not initialized ❌');
});

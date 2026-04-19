// Groq API Configuration for German Language Exercises
// This module handles AI-powered validation for fill-in-the-blanks exercises

class GroqValidator {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        this.model = 'llama-3.1-8b-instant'; // Fast and free model
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

        try {
            const prompt = `You are a German language teacher. Evaluate this answer:

Sentence: ${sentence}
Expected answer: ${correctAnswer}
Student's answer: ${userAnswer}

Respond ONLY with valid JSON (no extra text):
{
  "isCorrect": boolean (true if answer is essentially correct),
  "feedback": "Brief feedback in English (2-3 sentences max)",
  "explanation": "Why this is/isn't correct and how to improve"
}`;

            console.log('Calling Groq API...');
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
                    temperature: 0.3,
                    max_tokens: 200
                })
            });

            if (!response.ok) {
                console.error('Groq API error - Status:', response.status, response.statusText);
                console.error('Response:', await response.text());
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
            console.log('Falling back to basic validation');
            return this.basicValidation(userAnswer, correctAnswer);
        }
    }

    /**
     * Fallback basic validation if API fails
     */
    basicValidation(userAnswer, correctAnswer) {
        const userLower = userAnswer.toLowerCase().trim();
        const correctLower = correctAnswer.toLowerCase().trim();
        
        const isCorrect = userLower === correctLower;
        
        return {
            isCorrect: isCorrect,
            feedback: isCorrect 
                ? 'Perfect! Your answer is correct. | Perfekt! Deine Antwort ist richtig.' 
                : `The expected answer is: ${correctAnswer} | Die erwartete Antwort ist: ${correctAnswer}`,
            explanation: isCorrect
                ? 'Great work! | Großartig!'
                : 'Your answer does not match the expected response. Try again! | Deine Antwort stimmt nicht mit der erwarteten Antwort überein. Versuche es nochmal!',
            score: isCorrect ? 10 : 0,
            usingFallback: true
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

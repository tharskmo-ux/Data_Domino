const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

admin.initializeApp();

// Initialize Gemini AI
// Note: You must set the GOOGLE_AICORE_KEY using:
// firebase functions:secrets:set GEMINI_API_KEY
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

exports.getAIInsights = functions.https.onCall(async (data, context) => {
    // 1. Basic Auth Check
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "User must be logged in.");
    }

    const { summary, context: userContext } = data;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
            You are a procurement expert and data scientist.
            Analyze the following spend summary and provide 3-5 actionable insights.
            Focus on savings, risk reduction, and vendor consolidation.
            
            Current Currency: ${data.currency || 'INR'}
            
            Spend Summary:
            ${JSON.stringify(summary, null, 2)}
            
            User Context:
            ${userContext || "None"}

            Return the response in a clean JSON format:
            {
                "insights": [
                    { "title": "...", "description": "...", "impact": "High/Medium/Low" }
                ],
                "summary": "..."
            }
        `;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        // Extract JSON from response (sometimes Gemini adds markdown code blocks)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const aiResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: "Failed to parse AI response" };

        return aiResponse;

    } catch (error) {
        console.error("Gemini API Error:", error);
        throw new functions.https.HttpsError("internal", "AI failed to generate insights.");
    }
});

import { GoogleGenAI } from "@google/genai";

export const genAI = new GoogleGenAI({
    vertexai: true,
    project: process.env.GOOGLE_PROJECT_ID,
    location: "us-central1",
    apiVersion: 'v1',
    googleAuthOptions: {
        credentials: {
            client_email: process.env.GOOGLE_CLIENT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        },
        projectId: process.env.GOOGLE_PROJECT_ID,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    }
});
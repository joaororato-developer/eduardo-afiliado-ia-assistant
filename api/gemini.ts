import { GoogleGenAI } from "@google/genai";

export const genAI = new GoogleGenAI({
    vertexai: true,
    project: "promos-clube-geral",
    location: "us-central1",
    apiVersion: 'v1',
    googleAuthOptions: {
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
    }
});
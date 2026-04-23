import { GoogleGenAI } from "@google/genai";

// Log para te ajudar a debugar no servidor (remova após funcionar)
console.log('DEBUG AUTH:', {
    project: process.env.GOOGLE_PROJECT_ID ? 'OK' : 'MISSING',
    email: process.env.GOOGLE_CLIENT_EMAIL ? 'OK' : 'MISSING',
    key: process.env.GOOGLE_PRIVATE_KEY ? 'OK' : 'MISSING'
});

export const genAI = new GoogleGenAI({
    vertexai: true, // DEVE SER MAIÚSCULO 'AI'
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

// FUNÇÃO DE TESTE - Executa ao iniciar o servidor
(async () => {
    try {
        console.log("--- TESTANDO CONEXÃO COM GEMINI ---");
        const result = await genAI.models.generateContent({
            model: "gemini-2.5-flash",
            contents: "Oi! Responda apenas 'CONECTADO' se estiver funcionando."
        });
        console.log("RESULTADO DO TESTE:", result.text);
        console.log("--- CONEXÃO OK ---");
    } catch (error) {
        console.error("--- ERRO NO TESTE DE CONEXÃO ---");
        console.error(error);
    }
})();
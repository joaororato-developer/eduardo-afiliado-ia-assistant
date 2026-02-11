import OpenAI from 'openai';

export const openai = new OpenAI({
	baseURL: process.env.DEEPSEEK_URL,
	apiKey: process.env.DEEPSEEK_API_KEY, 
	timeout: 60_000
})
import { config } from "dotenv"
config()
import express, { Request, Response } from 'express';
import { openai } from './open_ai';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.post('/receive-whatsapp', (req: Request, res: Response) => {
	setImmediate(async () => {
		const { data, justATest } = req.body

		if (justATest) {
			const completion = await openai.chat.completions.create({
				model: "gpt-4o-mini",
				messages: [
				  { role: "system", content: "Você é um assistente útil e direto." },
				  { role: "user", content: "Olá, tudo bem ?" }
				],
				max_tokens: 500,
			});

			console.log({ completion })

			return
		}

		if (!data?.message?.conversation) return

		const { message } = data
		const { conversation: messageBody } = message
		const remoteJidGroupAllowed = process.env.AUTOMATION_GROUP
		const remoteJidMessage = data.key.remoteJid

		if (remoteJidGroupAllowed !== remoteJidMessage) return
	})

	return res.status(200).json({
		body: req.body
	})
});

app.get('/', (req: Request, res: Response) => {
	return res.status(200).json({
		message: "Bem vindo a API de Gustavo Hoffmann", 
		timestamp: new Date()
	})
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});

export default app;
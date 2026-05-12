import { config } from "dotenv"
config()
import express, { Request, Response } from 'express';
import { genAI } from './gemini';
import { proto } from '@whiskeysockets/baileys'
import { getPromptGeneral, getPromptMale, getPromptFemale, getPromptModifier, PromptParts } from "./prompts";
import pino from 'pino';

const logger = pino()
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '200mb' }));

app.use(express.urlencoded({ limit: '200mb', extended: true }));

const sendTextToEvolution = async (body: string, remoteJid: string) => {
	const headers = {
		'Content-Type': 'application/json',
		apikey: process.env.EVOLUTION_API_KEY || ''
	};

	await fetch(
		`${process.env.EVOLUTION_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`,
		{
			method: 'POST',
			headers,
			body: JSON.stringify({
				number: remoteJid,
				options: {
					delay: 300,
				},
				text: body
			})
		}
	);
};

app.get('/health', (req: Request, res: Response) => {
	res.status(200).send('ok')
})


app.post('/receive-whatsapp', (req: Request, res: Response) => {
	const { data } = req.body || {};

	if (!data || !data.key) {
		return res.status(200).send();
	}

	const { key } = data;
	if (key.fromMe) {
		return res.status(200).send();
	}

	const { remoteJid: remoteJidMessage } = key;

	const groupGeneral = process.env.GROUP_GENERAL;
	const groupMale = process.env.GROUP_MALE;
	const groupFemale = process.env.GROUP_FEMALE;

	const remoteJidGroupAllowed = [groupGeneral, groupMale, groupFemale];

	logger.info(JSON.stringify({ remoteJidGroupAllowed, remoteJidMessage }))
	logger.info(JSON.stringify({
		isAllowedRemoteJid: !remoteJidGroupAllowed.includes(remoteJidMessage)
	}))
	if (!remoteJidGroupAllowed.includes(remoteJidMessage)) {
		return res.status(200).send();
	}

	setImmediate(async () => {
		logger.info(JSON.stringify({ data }))
		try {
			const { message } = data;
			let { messageType } = data;

			let messageBody = '';

			if (data.contextInfo?.quotedMessage) {
				messageType = `${messageType}ReplyMessage`;
			}
			logger.info(JSON.stringify({ messageType }))
			if (!messageType) return;

			let isModifyRequest = false;
			let quotedMessageBody = '';

			switch (messageType) {
				case 'conversation':
				case 'extendedTextMessage':
					messageBody = message.conversation || message.extendedTextMessage?.text;
					break;
				case 'imageMessage':
					messageBody = message.imageMessage.caption || '';
					break;
				case 'videoMessage':
					messageBody = message.videoMessage.caption || '';
					break;
				case 'conversationReplyMessage':
				case 'extendedTextMessageReplyMessage':
					messageBody = message.conversation || message.extendedTextMessage?.text;
					const quotedMessage = data.contextInfo?.quotedMessage;
					quotedMessageBody = quotedMessage?.conversation || quotedMessage?.extendedTextMessage?.text || quotedMessage?.imageMessage?.caption || '';
					if (quotedMessageBody) {
						isModifyRequest = true;
					} else {
						return;
					}
					break;
				default:
					return;
			}

			if (!messageBody) return;

			let prompt: PromptParts = { systemInstruction: '', userContent: '' };
			if (isModifyRequest) {
				prompt = getPromptModifier(quotedMessageBody, messageBody);
			} else {
				switch (remoteJidMessage) {
					case groupGeneral:
						prompt = getPromptGeneral(messageBody);
						break;
					case groupMale:
						prompt = getPromptMale(messageBody);
						break;
					case groupFemale:
						prompt = getPromptFemale(messageBody);
						break;
				}
			}

			logger.info("Chamando Gemini")
			const startTime = Date.now();

			const timeoutMs = 30000;
			const result = await Promise.race([
				genAI.models.generateContent({
					model: "gemini-2.5-flash",
					contents: prompt.userContent,
					config: {
						systemInstruction: prompt.systemInstruction,
						thinkingConfig: {
							thinkingBudget: 0
						}
					}
				}),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error(`Gemini timeout após ${timeoutMs / 1000}s`)), timeoutMs)
				)
			]);

			logger.info(`Gemini respondeu em ${Date.now() - startTime}ms`);

			let outputMessage = result.text?.trim() || '';
			logger.info(JSON.stringify({ outputMessage }))
			await sendTextToEvolution(outputMessage, remoteJidMessage);

		} catch (err) {
			console.error(err);
		}
	});

	return res.status(200).json({
		body: req.body
	});
});

app.get('/', (req: Request, res: Response) => {
	return res.status(200).json({
		message: "Bem vindo a API de Eduardo",
		timestamp: new Date()
	})
});

app.listen(Number(PORT), '0.0.0.0', () => {
	console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});

export default app;

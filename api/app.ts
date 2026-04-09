import { config } from "dotenv"
config()
import express, { Request, Response } from 'express';
import { genAI } from './gemini';
import { proto } from '@whiskeysockets/baileys'
import { getPromptGeneral, getPromptMale, getPromptFemale, getPromptModifier } from "./prompts";

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
		`http://localhost:9000/message/sendText/${process.env.EVOLUTION_INSTANCE_NAME}`,
		{
			method: 'POST',
			headers,
			body: JSON.stringify({
				number: remoteJid,
				options: {
					delay: 1000,
				},
				text: body
			})
		}
	);
};

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

	if (!remoteJidGroupAllowed.includes(remoteJidMessage)) {
		return res.status(200).send();
	}

	setImmediate(async () => {
		try {
			const { message } = data;
			let { messageType } = data;

			let messageBody = '';

			if (data.contextInfo?.quotedMessage) {
				messageType = `${messageType}ReplyMessage`;
			}

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

			let promptText = '';
			if (isModifyRequest) {
				promptText = getPromptModifier(quotedMessageBody, messageBody);
			} else {
				switch (remoteJidMessage) {
					case groupGeneral:
						promptText = getPromptGeneral(messageBody);
						break;
					case groupMale:
						promptText = getPromptMale(messageBody);
						break;
					case groupFemale:
						promptText = getPromptFemale(messageBody);
						break;
				}
			}

			const model = genAI.getGenerativeModel({
				model: "gemini-2.5-flash",
			});

			const result = await model.generateContent({
				contents: [
					{ role: 'user', parts: [{ text: promptText }] }
				]
			});

			let outputMessage = result.response.text().trim();

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


app.listen(PORT, () => {
	console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});

export default app;
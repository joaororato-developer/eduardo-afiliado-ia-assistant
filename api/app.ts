import { config } from "dotenv"
config()
import { google } from 'googleapis';
import express, { Request, Response } from 'express';
import { Browser, BrowserContext, chromium, Page } from "playwright"
import { openai } from './open_ai';
import { loginMercadoLivre } from "./mercadolivreAuth";
import { loginGoogle } from "./googleAuth";
import { getSystemMessagePromptLinkExtractor, getUserMessagePromptLinkExtractor } from "./linkExtractor";
import { getItemCoupoun, getItemLink, getItemPrice, getItemDiscountText } from "./ml-helper";
import { getSystemMessagePromptMessageFormatter, getUserMessagePromptMessageFormatter } from "./messageFormatter";
import { downloadContentFromMessage, proto } from '@whiskeysockets/baileys'
import { getSystemMessagePromptDiscountExtractor, getUserMessagePromptDiscountExtractor } from "./discountExtractor";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '200mb' }));

app.use(express.urlencoded({ limit: '200mb', extended: true }));

const userDataDir = "C:/chrome-profiles/ml-automation";

const browserInstance = chromium.launchPersistentContext(
    userDataDir,
    {
        channel: "chrome",
        headless: false,
        args: [
            "--disable-blink-features=AutomationControlled"
        ]
    }
);

export let browserContext: BrowserContext | null = null

const waitLogin = async () => {
    browserContext = await browserInstance;
    const page = await browserContext.newPage();

    await loginGoogle(page, browserContext);
    await loginMercadoLivre(page, browserContext);
};


async function getImageBase64FromEvolution(messageKey: proto.IMessageKey) {
    const baseUrl = (process.env.EVOLUTION_URL || 'http://localhost:9000').replace(/\/$/, '');
    const url = `${baseUrl}/chat/getBase64FromMediaMessage/${process.env.EVOLUTION_INSTANCE_NAME}`;

    for (let i = 0; i < 3; i++) {
        try {
            console.log(`Tentativa ${i + 1} de recuperar base64...`);
            
            await new Promise(resolve => setTimeout(resolve, 1500));

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: process.env.EVOLUTION_API_KEY || '',
                },
                body: JSON.stringify({
                    message: { key: messageKey },
                    convertToMp4: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Status ${response.status}: ${errorText}`);
            }

            const data: any = await response.json();

            if (data && data.base64) {
                return data.base64;
            }

            console.warn("Base64 ainda não disponível, tentando novamente...");
        } catch (err) {
            console.error(`Erro na tentativa ${i + 1}:`, err);
        }
    }

    throw new Error("Falha ao descriptografar imagem após 3 tentativas.");
}

const sendToEvolution = async (
    body: string,
    mediaBase64: string,
    remoteJid: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    mimeType: string = 'image/jpeg'
) => {
    if (!mediaBase64) return;

    const normalizedBase64 = mediaBase64.includes('base64,')
        ? mediaBase64.split('base64,')[1]
        : mediaBase64;

    await fetch(
        `http://localhost:9000/message/sendMedia/${process.env.EVOLUTION_INSTANCE_NAME}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                apikey: process.env.EVOLUTION_API_KEY || ''
            },
            body: JSON.stringify({
                number: remoteJid,
                mediatype: mediaType,
                mimetype: mimeType,
                caption: body,
                media: normalizedBase64,
                fileName: `file.${mimeType.split('/')[1] || 'jpg'}`
            })
        }
    );
};

app.post('/receive-whatsapp', (req: Request, res: Response) => {
    setImmediate(async () => {
        const { data } = req.body
        const { key } = data

        if (!key || key.fromMe) return

        const { remoteJid: remoteJidMessage, id: messageId } = key
        // Extraindo message diretamente do data para garantir que temos o objeto completo
        const { message } = data 
        const { messageType } = data
        const remoteJidGroupAllowed = process.env.AUTOMATION_GROUP

        if (remoteJidGroupAllowed !== remoteJidMessage) return

        let messageBody = ''

        if (!messageType) return

        const systemMessagePromptLinkExtractor = getSystemMessagePromptLinkExtractor(`mercadolivre.com`)

        const messageTypeFunctionsMap: { [key: string]: () => Promise<any> } = {
            imageMessage: async () => {
                console.log('imageMessageRecebida')
                messageBody = message.imageMessage.caption
                const { url: imageUrl, mimetype, jpegThumbnail } = message.imageMessage
                const mediaType = mimetype.split('/')[0]

                let mediaToSend = '';
                try {
                    console.log('Baixando mídia via Evolution API...');
                    mediaToSend = await getImageBase64FromEvolution(key);
                } catch (err) {
                    console.error('Falha ao baixar da Evolution:', err);
                }

                if (!mediaToSend) {
                    console.log("Abortando: Imagem não pôde ser baixada.");
                    return;
                }

                const completion = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemMessagePromptLinkExtractor },
                        { role: "user", content: getUserMessagePromptLinkExtractor(messageBody) }
                    ],
                    max_tokens: 500,
                    response_format: {
                        type: "json_schema",
                        json_schema: {
                            name: "ml_extractor",
                            schema: {
                                type: "object",
                                properties: {
                                    links: {
                                        type: "array",
                                        items: {
                                            type: "string",
                                            description: "URL do produto no Mercado Livre"
                                        }
                                    }
                                },
                                required: ["links"],
                                additionalProperties: false
                            }
                        }
                    }
                });

                const completionExtractorContent = JSON.parse(completion.choices[0].message?.content || '{}')
                const generatedLinksByOpenAI = completionExtractorContent.links
                let isDiscountOnTheAd = completionExtractorContent.discountOnTheAd || false
                let outputMessage = ''

                for (const link of generatedLinksByOpenAI) {
                    try {
						const page = await browserContext!.newPage()
						await page.goto(link, {
							waitUntil: 'domcontentloaded',
						})

                        const itemLink = await getItemLink(link, page)
                        const coupoun = await getItemCoupoun(link, page)
                        const price = await getItemPrice(link, page)
                        const discountText = await getItemDiscountText(link, page)

						await page.close()

                        if (coupoun && !('error' in coupoun)) {
                            isDiscountOnTheAd = coupoun.isDiscountOnTheAd
                        }

                        let discountLimit = null
                        let discountPercentage = null
                        if (discountText) {
                            const discountCompletion = await openai.chat.completions.create({
                                model: "gpt-4o-mini",
                                messages: [
                                    { role: "system", content: getSystemMessagePromptDiscountExtractor() },
                                    { role: "user", content: getUserMessagePromptDiscountExtractor(discountText) }
                                ],
                                response_format: { 
                                    type: "json_schema",
                                    json_schema: {
                                        name: "discount_limit",
                                        schema: {
                                            type: "object",
                                            properties: {
                                                limit: { type: ["number", "null"] },
                                                discount_percentage: { type: ["number", "null"] }
                                            },
                                            required: ["limit", "discount_percentage"],
                                            additionalProperties: false
                                        },
                                        strict: true
                                    }
                                }
                            });
                            const discountContent = JSON.parse(discountCompletion.choices[0].message?.content || '{}')
                            discountLimit = discountContent.limit
                            discountPercentage = discountContent.discount_percentage
                        }

                        if (typeof itemLink === 'object' && ('error' in itemLink)) {
                            outputMessage += `\n ${itemLink.error}`
                        }

                        if (typeof price === 'object' && ('error' in price)) {
                            outputMessage += `\n ${price.error}`
                        }

                        if (outputMessage) {
                            outputMessage =
                                `ERROS:[${outputMessage}] 
                                `
                        }

                        if (typeof itemLink !== 'string') {
                            await sendToEvolution(
                                outputMessage,
                                mediaToSend,
                                remoteJidMessage,
                                "image",
                                mimetype
                            )
                            continue
                        }

                        const completion = await openai.chat.completions.create({
                            model: "gpt-4o-mini",
                            messages: [
                                { role: "system", content: getSystemMessagePromptMessageFormatter() },
                                {
                                    role: "user", content: getUserMessagePromptMessageFormatter({
                                        itemCoupon: (coupoun && !('error' in coupoun)) ? coupoun.coupon : "",
                                        itemLink,
                                        itemPrice: typeof price == 'string' ? price : "",
                                        itemSummary: messageBody,
                                        isDiscountOnTheAd,
                                        discountLimit,
                                        discountPercentage
                                    })
                                }
                            ]
                        });

                        outputMessage += `\n ${completion.choices[0].message.content}`;
						outputMessage = outputMessage.trimStart()
                    } catch (error) {
                        console.log(error)
                    }
                }

                await sendToEvolution(
                    outputMessage,
                    mediaToSend,
                    remoteJidMessage,
                    "image",
                    mimetype
                )
            }
        }

        const messageTypeFunction = messageTypeFunctionsMap[messageType]

        if (!messageTypeFunction) return

        await messageTypeFunction()
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


waitLogin().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
    });
})

export default app;
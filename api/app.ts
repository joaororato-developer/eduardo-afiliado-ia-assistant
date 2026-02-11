import { config } from "dotenv"
config()
import { google } from 'googleapis';
import express, { Request, Response } from 'express';
import { Browser, BrowserContext, chromium, Page } from "playwright"
import { genAI } from './gemini'; // Importa a instância do GoogleGenerativeAI
import { loginMercadoLivre } from "./mercadolivreAuth";
import { loginGoogle } from "./googleAuth";
import { getSystemMessagePromptLinkExtractor, getUserMessagePromptLinkExtractor } from "./linkExtractor";
import { getItemCoupoun, getItemLink, getItemPrice, getItemDiscountText, getItemOldPrice, getItemPaymentMethod, getItemTitle, getFreeShippingFull, getStoreVerified } from "./ml-helper";
import { getSystemMessagePromptMessageFormatter, getUserMessagePromptMessageFormatter } from "./messageFormatter";
import { proto } from '@whiskeysockets/baileys'
import { getSystemMessagePromptDiscountExtractor, getUserMessagePromptDiscountExtractor } from "./discountExtractor";
import { getSystemMessagePromptMessageModifier, getUserMessagePromptMessageModifier } from "./messageModifier";
import { getRandomDelay } from "./utils";
import { sendFlowApi } from "./sendflow";

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


const confirmationMessage = `\n\n---/---
Enviar para as campanhas ou realizar alguma alteração?`

const normalizeText = (text: string) => {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

const isConfirmationMessage = (text: string) => {
    if (!text) return false;
    const normalizedText = normalizeText(text);
    const confirmationKeywords = [
        "ok", "pode enviar", "envia", "enviar", "certo", "👍", "perfeito", "show", "aprovado", "envio aprovado",
        "sim", "pode", "manda", "manda ver", "dale", "beleza", "blz", "confirmado", "confere", "isso", "isso ai", 
        "isso mesmo", "correto", "exato", "ta ok", "tá ok", "okay", "okk", "ook", "fechado", "top"
    ];
    return confirmationKeywords.includes(normalizedText);
}

async function getImageBase64FromEvolution(messageKey: proto.IMessageKey) {
    const baseUrl = (process.env.EVOLUTION_URL || 'http://localhost:9000').replace(/\/$/, '');
    const url = `${baseUrl}/chat/getBase64FromMediaMessage/${process.env.EVOLUTION_INSTANCE_NAME}`;

    for (let i = 0; i < 3; i++) {
        try {
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
        const { message } = data 
        let { messageType } = data
        const remoteJidGroupAllowed = process.env.AUTOMATION_GROUP

        if (remoteJidGroupAllowed !== remoteJidMessage) return

        let messageBody = ''

        if (data.contextInfo?.quotedMessage) {
            messageType = `${messageType}ReplyMessage`
        }

        if (!messageType) return

        const systemMessagePromptLinkExtractor = getSystemMessagePromptLinkExtractor(`mercadolivre.com`)

        const messageTypeFunctionsMap: { [key: string]: () => Promise<any> } = {
            imageMessage: async () => {
                messageBody = message.imageMessage.caption
                const { url: imageUrl, mimetype } = message.imageMessage
                const mediaType = mimetype.split('/')[0]

                let mediaToSend = '';
                try {
                    mediaToSend = await getImageBase64FromEvolution(key);
                } catch (err) {
                    console.error('Falha ao baixar da Evolution:', err);
                }

                if (!mediaToSend) {
                    return;
                }

                // --- GERAÇÃO LINK EXTRACTOR ---
                // Inicializa o modelo com a instrução de sistema específica
                const linkModel = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    systemInstruction: systemMessagePromptLinkExtractor
                });

                const linkResult = await linkModel.generateContent({
                    contents: [
                        { role: 'user', parts: [{ text: getUserMessagePromptLinkExtractor(messageBody) }] }
                    ],
                    generationConfig: { responseMimeType: "application/json" }
                });

                const completionExtractorContent = JSON.parse(linkResult.response.text())
                const generatedLinksByAI = completionExtractorContent.links || []
                let isDiscountOnTheAd = completionExtractorContent.discountOnTheAd || false
                let outputMessage = ''

                for (const link of generatedLinksByAI) {
                    try {
                        const page = await browserContext!.newPage()
                        await page.goto(link, {
                            waitUntil: 'domcontentloaded',
                        })

                        const isFreeShippingFull = await getFreeShippingFull(link, page)
                        const itemLink = await getItemLink(link, page)
                        const coupoun = await getItemCoupoun(link, page)
                        const price = await getItemPrice(link, page)
                        const oldPrice = await getItemOldPrice(link, page)
                        const discountData = await getItemDiscountText(link, page)
                        const paymentMethod = await getItemPaymentMethod(link, page)
                        const title = await getItemTitle(link, page)
                        const isStoreVerified = await getStoreVerified(link, page)

                        await page.close()

                        if (coupoun && !('error' in coupoun)) {
                            isDiscountOnTheAd = coupoun.isDiscountOnTheAd
                        }

                        let discountLimit = null
                        let discountPercentage = null
                        
                        if (discountData.discountText) {
                            const textToAnalyze = `${discountData.discountText}. ${discountData.minCartValueText || ''}`
                            
                            // --- GERAÇÃO DISCOUNT EXTRACTOR ---
                            const discountModel = genAI.getGenerativeModel({
                                model: "gemini-2.5-flash",
                                systemInstruction: getSystemMessagePromptDiscountExtractor()
                            });

                            const discountResult = await discountModel.generateContent({
                                contents: [
                                    { role: 'user', parts: [{ text: getUserMessagePromptDiscountExtractor(textToAnalyze) }] }
                                ],
                                generationConfig: { responseMimeType: "application/json" }
                            });
                            
                            const discountContent = JSON.parse(discountResult.response.text())
                            discountLimit = discountContent.limit
                            discountPercentage = discountContent.discount_percentage

                            const minCartValue = discountContent.min_cart_value

                            if (minCartValue && typeof price === 'string') {
                                const numericPrice = parseFloat(price.replace(/[^\d,]/g, '').replace(',', '.'));
                                if (minCartValue > numericPrice) {
                                    isDiscountOnTheAd = false
                                    discountLimit = null
                                    discountPercentage = null
                                }
                            }
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

                        const itemCoupon = isDiscountOnTheAd ? '' : (coupoun && !('error' in coupoun)) ? coupoun.coupon : ""

                        // --- GERAÇÃO MESSAGE FORMATTER ---
                        const formatterModel = genAI.getGenerativeModel({
                            model: "gemini-2.5-flash",
                            systemInstruction: getSystemMessagePromptMessageFormatter()
                        });

                        const formatterResult = await formatterModel.generateContent({
                            contents:[
                                { role: 'user', parts: [{ text: getUserMessagePromptMessageFormatter({
                                    itemCoupon,
                                    itemLink,
                                    itemPrice: typeof price == 'string' ? price : "",
                                    itemOldPrice: typeof oldPrice == 'string' ? oldPrice : null,
                                    itemSummary: messageBody,
                                    isDiscountOnTheAd,
                                    discountLimit,
                                    discountPercentage,
                                    itemPaymentMethod: typeof paymentMethod == 'string' ? paymentMethod : null,
                                    itemTitle: typeof title == 'string' ? title : null,
                                    isFreeShippingFull: itemCoupon ? false : isFreeShippingFull,
                                    isStoreVerified
                                }) }] }
                            ]
                        });

                        outputMessage += `\n ${formatterResult.response.text()}`;
                        outputMessage += confirmationMessage
                        outputMessage = outputMessage.trim()
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
            }, 
            conversationReplyMessage: async () => {
                const quotedMessage = data.contextInfo?.quotedMessage
                let quotedMessageBody = quotedMessage.imageMessage.caption
                
                messageBody = message.conversation || message.extendedTextMessage?.text

                const isApproved = isConfirmationMessage(messageBody)

                const quotedMessageKey: proto.IMessageKey = {
                    id: data.contextInfo.stanzaId,
                    remoteJid: remoteJidMessage,
                    fromMe: true
                }

                
                let mediaToSend = '';
                
                if (isApproved) {
                    try {
                        mediaToSend = await getImageBase64FromEvolution(quotedMessageKey);
                    } catch (err) {
                        console.error('Falha ao baixar imagem da mensagem citada:', err);
                    }
                
                    if (mediaToSend) {
                        const releaseGroups = await sendFlowApi.getTestReleaseGroup()

                        for (const group of releaseGroups) {
                            const remoteJidGroup = group.jid

                            const delay = getRandomDelay(5000, 7000)
                            await new Promise(resolve => setTimeout(resolve, delay))

                            await sendToEvolution(
                                quotedMessageBody.replace(confirmationMessage, '').trim(),
                                mediaToSend,
                                remoteJidGroup,
                                "image",
                                quotedMessage.imageMessage.mimetype
                            )
                        }
                    }
                    
                    return
                }

                if (!quotedMessageBody) return

                // --- GERAÇÃO MESSAGE MODIFIER ---
                const modifierModel = genAI.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    systemInstruction: getSystemMessagePromptMessageModifier()
                });

                const modifierResult = await modifierModel.generateContent({
                    contents: [
                        { role: 'user', parts: [{ text: getUserMessagePromptMessageModifier(quotedMessageBody, messageBody) }] }
                    ],
                    generationConfig: { responseMimeType: "application/json" }
                });

                const modificationResult = JSON.parse(modifierResult.response.text())

                if (modificationResult.hasModification && modificationResult.modifiedMessage) {
                    let outputMessage = modificationResult.modifiedMessage
                    outputMessage += confirmationMessage

                    try {
                        mediaToSend = await getImageBase64FromEvolution(quotedMessageKey);
                    } catch (err) {
                        console.error('Falha ao baixar imagem da mensagem citada:', err);
                    }
                    
                    if (mediaToSend) {
                        await sendToEvolution(
                            outputMessage,
                            mediaToSend,
                            remoteJidMessage,
                            "image",
                            quotedMessage.imageMessage.mimetype
                        )
                    }
                }

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
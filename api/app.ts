import { config } from "dotenv"
config()
import express, { Request, Response } from 'express';
import { Browser, BrowserContext, chromium } from "playwright"
import { openai } from './open_ai';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const browserInstance = chromium.launch({ headless: false }) // Abre o navegador visível

export let browserContext: BrowserContext | null = null

const waitLogin = async () => {
	const browser = await browserInstance
	browserContext = await browser.newContext() as BrowserContext
	const page = await browserContext.newPage()

	await page.goto('https://www.mercadolivre.com/jms/mlb/lgz/msl/login/')
	await page.waitForTimeout(500)
	await page
		.getByTestId('user_id')
		.pressSequentially(process.env.ML_EMAIL as string, { delay: 100 })
	await page.locator('#_R_ijkr2e_').click()

	await page.waitForTimeout(60000)

	await browserContext.storageState({ path: 'auth.json' })
}

export const getItemLinkCoupon = async (itemUrl: string) => {
	const context = browserContext as BrowserContext
	const page = await context.newPage()

	await page.goto(itemUrl)
	const actionLink = page.locator(
		'.poly-component__link.poly-component__link--action-link',
	)
	await actionLink.waitFor({ state: 'visible', timeout: 8000 })
	await actionLink.click()

	// Pegar link
	let itemLink: string | null;

	const shareLinkButton = page.getByTestId('generate_link_button').filter({ hasText: 'Compartilhar' })
	await shareLinkButton.waitFor({ state: 'visible', timeout: 8000 })
	await shareLinkButton.click()
	const linkInput = page.getByTestId('text-field__label_link')
	await linkInput.waitFor({ state: 'visible', timeout: 8000 })

	itemLink = await linkInput.inputValue()


	// Pegar cupom
	const couponsLink = page.getByTestId('action-modal-link')
		.filter({ hasText: 'Ver cupons disponíveis' })
	couponsLink.waitFor({ state: 'visible', timeout: 8000 })

	couponsLink && await couponsLink.click()
	await page.waitForTimeout(500)

	const couponFrame = page.frameLocator('iframe[title="Ver cupons disponíveis"]');

	const firstCouponItem = couponFrame.locator('.input-code-coupon').first();

	let coupon: string | null = null;

	try {
		await firstCouponItem.waitFor({ state: 'visible', timeout: 8000 });

		coupon = await firstCouponItem.innerText();

		return {
			coupon,
			itemLink
		}
	} catch (error) {
		await page.screenshot({ path: 'erro_iframe.png' });
	}
}


const getSystemMessagePromptLinkExtractor = (mercadoLivreDomain: string) => `
	Você é um extrator de dados.
	Sua tarefa é identificar e extrair links de produtos do Mercado Livre presentes no texto fornecido.

	Regras:
	- Considere apenas links do domínio ${mercadoLivreDomain}
	- Ignore links de outros domínios
	- Se não houver link válido, retorne um array vazio
	- Responda exclusivamente em JSON
	- Não inclua explicações, comentários ou texto adicional
	- Nunca invente links
	- Extraia a url exata (QUALQUER ERRO AQUI SERÁ CONSIDERADO COMO FALHA CRÍTICA)

	Formato de resposta:
	{
	"links": string[]
`

const getUserMessagePromptLinkExtractor = (messageBody: string) => `
	Extraia o link do produto no texto:
	${messageBody}
`

app.post('/receive-whatsapp', (req: Request, res: Response) => {
	setImmediate(async () => {
		const { data } = req.body
		const { key } = data

		if (!key) return

		const { remoteJid: remoteJidMessage } = key
		const { message } = data
		const { messageType } = data
		const remoteJidGroupAllowed = process.env.AUTOMATION_GROUP

		if (remoteJidGroupAllowed !== remoteJidMessage) return

		let messageBody = ''

		if (!messageType) return

		const systemMessagePromptLinkExtractor = getSystemMessagePromptLinkExtractor(`mercadolivre.com`)

		const messageTypeFunctionsMap: { [key: string]: () => Promise<any> } = {
			imageMessage: async () => {
				messageBody = message.imageMessage.caption
				const { url: imageUrl } = message

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
							name: "ml_links",
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

				const generatedLinksByOpenAI = JSON.parse(completion.choices[0].message?.content || '{}').links

				for (const link of generatedLinksByOpenAI) {
					try {
						const itemData = await getItemLinkCoupon(link)

						if (!itemData) continue

						const { coupon, itemLink } = itemData
					} catch (error) {
						console.log(error)
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
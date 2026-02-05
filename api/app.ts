import { config } from "dotenv"
config()
import { google } from 'googleapis';
import express, { Request, Response } from 'express';
import { Browser, BrowserContext, chromium } from "playwright"
import { openai } from './open_ai';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

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

function decodeBase64(data: string) {
	return Buffer
	  .from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
	  .toString('utf-8');
}

const waitLogin = async () => {
	browserContext = await browserInstance;
	const page = await browserContext.newPage();

	// 0️⃣ Login no Google (Gmail)
	await page.goto('https://accounts.google.com/', {
		waitUntil: 'domcontentloaded',
	});
  
	// Email
	const googleEmail = page.locator('input[type="email"]');
	await googleEmail.waitFor({ timeout: 15000 });
	
	await googleEmail.type(process.env.ML_EMAIL as string, {
		delay: 80, // 👈 digitação humana
	});
	
	await page.waitForTimeout(500);
	await page.keyboard.press('Enter');
	
	// Senha
	const googlePassword = page.locator('input[type="password"]');
	await googlePassword.waitFor({ timeout: 15000 });
	
	await googlePassword.type(process.env.ML_PASSWORD as string, {
		delay: 90, // 👈 ligeiramente diferente do email
	});
	
	await page.waitForTimeout(600);
	await page.keyboard.press('Enter');
	
	// Aguarda login completar
	await page.waitForURL(/myaccount\.google\.com|mail\.google\.com/, {
		timeout: 30000,
	});
	
	console.log('✅ Login no Google realizado');

	// 1️⃣ Agora sim, abre o Mercado Livre
	await page.goto('https://www.mercadolivre.com/jms/mlb/lgz/msl/login/', {
	waitUntil: 'domcontentloaded',
	});

	// 5️⃣ Clica para enviar código por e-mail
	await page.locator('#code_validation button').click();

	const emailSentAt = new Date();
	console.log('📧 Código solicitado por e-mail em:', emailSentAt.toISOString());

	// 6️⃣ Aguarda 30 segundos
	await new Promise(resolve => setTimeout(resolve, 30_000));

	// 7️⃣ Configura OAuth Gmail
	const oauth2Client = new google.auth.OAuth2(
		process.env.GMAIL_OAUTH_CLIENT_ID,
		process.env.GMAIL_OAUTH_SECRET_KEY
	);

	oauth2Client.setCredentials({
		refresh_token: process.env.GMAIL_OAUTH_REFRESH_TOKEN
	});

	const gmail = google.gmail({
		version: 'v1',
		auth: oauth2Client
	});

	// 8️⃣ Busca e-mails do Mercado Livre com "código" no assunto,
	// recebidos APÓS o clique
	const afterUnix = Math.floor(emailSentAt.getTime() / 1000);

	const response = await gmail.users.messages.list({
		userId: 'me',
		q: `from:mercadolivre subject:código after:${afterUnix}`,
		maxResults: 5
	});

	const mails = response.data.messages || [];

	for (const mail of mails) {
		const { id: messageId } = mail;
		if (!messageId) continue;
	  
		const message = await gmail.users.messages.get({
		  userId: 'me',
		  id: messageId,
		  format: 'full',
		});
	  
		const payload = message.data.payload;
		if (!payload) continue;
	  
		let html = '';
	  
		// 1️⃣ Se for multipart
		if (payload.parts) {
		  const htmlPart = payload.parts.find(
			p => p.mimeType === 'text/html'
		  );
	  
		  if (htmlPart?.body?.data) {
			html = Buffer.from(
			  htmlPart.body.data.replace(/-/g, '+').replace(/_/g, '/'),
			  'base64'
			).toString('utf-8');
		  }
		}
	  
		// 2️⃣ Se for single-part
		else if (payload.mimeType === 'text/html' && payload.body?.data) {
		  html = Buffer.from(
			payload.body.data.replace(/-/g, '+').replace(/_/g, '/'),
			'base64'
		  ).toString('utf-8');
		}
	  
		if (!html) continue;
	  
		// 3️⃣ Extrair código
		const match = html.match(/\b\d{6}\b/);
		const code = match?.[0];
	  
		if (code) {
		  console.log('Código encontrado:', code);
		  break;
		}
	  }


	if (mails.length === 0) {
		console.log('❌ Nenhum e-mail de código encontrado ainda');
	} else {
		console.log(`✅ ${mails.length} e-mail(s) de código encontrados`);
	}

	// 9️⃣ Aguarda login manual ou próxima automação
	await page.waitForTimeout(120000);

	// 🔟 Salva sessão
	await browserContext.storageState({ path: 'auth.json' });
	console.log('✅ Sessão salva em auth.json');
};
  

export const getItemLink = async (itemUrl: string) => {
	const context = browserContext as BrowserContext
	const page = await context.newPage()

	try {
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
	
		return itemLink
	} catch (error) {
		await page.screenshot({ path: 'erro_iframe.png' });

		return {
			error: `Produto ${itemUrl} não foi encontrado, verifique se o produto ainda existe.`
		}
	}
}

export const getItemCoupoun = async (itemUrl: string) => {
	const context = browserContext as BrowserContext
	const page = await context.newPage()

	try {
		const couponsLink = page.getByTestId('action-modal-link')
			.filter({ hasText: 'Ver cupons disponíveis' })
		await couponsLink.waitFor({ state: 'visible', timeout: 8000 })

		couponsLink && await couponsLink.click()
		await page.waitForTimeout(500)

		const couponFrame = page.frameLocator('iframe[title="Ver cupons disponíveis"]');

		const firstCouponItem = couponFrame.locator('div.coupons-list-container > div > div > div > div > div.top-container > div.left-side-container > div.icon-title-container > span').first();

		let coupon: string | null = null;

		await firstCouponItem.waitFor({ state: 'visible', timeout: 8000 });

		coupon = await firstCouponItem.innerText();

		if (coupon.includes('OFF')) {
			[, coupon] = coupon.split('OFF ')
			coupon = coupon?.split(' ').join('')
		}

		return coupon
	} catch (error) {
		await page.screenshot({ path: 'erro_iframe.png' });

		return {
			error: `Produto ${itemUrl} não possui cupom cadastrado no momento.`
		}
	}
}


const getSystemMessagePromptLinkExtractor = (mercadoLivreDomain: string) => `
	Você é um extrator de dados.
	Sua tarefa é identificar e extrair links de produtos do Mercado Livre presentes no texto fornecido.

	Regras para links:
	- Considere apenas links do domínio ${mercadoLivreDomain}
	- Ignore links de outros domínios
	- Se não houver link válido, retorne um array vazio
	- Nunca invente links
	- Extraia a URL exatamente como aparece no texto (QUALQUER ERRO SERÁ CONSIDERADO FALHA CRÍTICA)

	Extraia também um booleano chamado "discountOnTheAd".

	Regras para "discountOnTheAd":
	- Deve ser true SOMENTE se o texto indicar explicitamente que o cupom ou desconto é aplicado no anúncio
	- Exemplos válidos:
	- "cupom no anúncio"
	- "aplique o cupom no anúncio"
	- "desconto no anúncio"
	- Utilize preço ("de X por Y") como critério apenas se não existir NENHUM CUPOM na descrição.
	- NÃO assuma desconto baseado apenas em menção de cupom
	- Se o desconto depender de cupom do Mercado Livre, for ambíguo ou não for mencionado, retorne false
	- Em caso de dúvida, retorne false

	Regras de resposta:
	- Responda exclusivamente em JSON
	- Não inclua explicações, comentários ou texto adicional
	- Sempre retorne todos os campos definidos

	Formato de resposta:
	{
	"links": string[],
	"discountOnTheAd": boolean
	}
`

const getUserMessagePromptLinkExtractor = (messageBody: string) => `
	Extraia o link do produto no texto:
	${messageBody}
`

const getSystemMessagePromptMessageFormatter = () => `
PROMPT PARA FORMATAÇÃO AUTOMÁTICA DE OFERTAS - WHATSAPP
(À PROVA DE ERROS - NÃO ALUCINE, NÃO INVENTE)

FUNÇÃO: Você é um formatador de mensagens para grupos de promoções no WhatsApp. Sua ÚNICA tarefa é reformatar a oferta fornecida pelo usuário seguindo EXATAMENTE as regras abaixo, na ordem especificada. Você NUNCA pode adicionar, remover, deduzir ou inventar qualquer informação que não esteja explicitamente escrita no texto de entrada.

---

### [REGRAS DE DIAMANTE]
0. Não invente informações
	· ANÁLISE: Leia o texto de entrada. Qualquer informação não presente NÃO EXISTE.
	· AÇÃO: Se algo não estiver explícito (preço cheio, cupom, loja oficial), simplesmente OMITA essa parte na saída. Não tente preencher lacunas.

### [ESTRUTURA DA SAÍDA (ORDEM IMUTÁVEL)]
	- Sua resposta final DEVE conter APENAS o texto formatado, seguindo EXATAMENTE esta ordem e estes espaçamentos. A quebra de linha (\\n\\n) é OBRIGATÓRIA:
	LINHAS:
		1ª: Título
		2ª: Vazia (APENAS UMA QUEBRA DE LINHA)
		3ª: Nome do produto
		4ª: Vazia (APENAS UMA QUEBRA DE LINHA)
		5ª: Preço do produto
		6ª: Cupom (Somente se existir)
		7ª: VAZIA (Aplicar esta quebra de linha apenas se existir Cupom)
		8ª: Loja oficial ou instrução complementar (Somente se existir alguma das duas)
		9ª: Link
---

### [FORMATAÇÃO DETALHADA]
	**TÍTULO**
	· O QUE FAZER: Identifique a primeira linha ou frase em destaque da oferta. É a frase que chama a atenção.
	· COMO FORMATAR: Copie EXATAMENTE como foi enviado. Mantenha:
	  · Letras maiúsculas e minúsculas originais.
	  · Todos os emojis e pontuação originais (‼️, 🚨, 🔥).
	  · Negrito (asteriscos *) se já estiver no texto original.
	· EXEMPLO: Entrada 🚨OFERTA RELÂMPAGO‼️ → Saída: 🚨OFERTA RELÂMPAGO‼️
	· NUNCA: Adicione negrito, mude a caixa das letras ou remova emojis do título.

	**NOME DO PRODUTO**
	· O QUE FAZER: Identifique a linha que descreve o produto. Normalmente é a frase após o título.
	· COMO FORMATAR:
	  1. Escreva o texto normalmente.
	  2. REMOVA TODOS OS EMOJIS desta linha específica.
	· EXEMPLO: Entrada Tênis Nike Air Max 👟🔥 → Saída: Tênis Nike Air Max
	· NUNCA: Inclua emojis nesta linha.

	**PREÇO (FORMATO RÍGIDO)**
	· PASSO A PASSO:
	  1. IDENTIFIQUE OS VALORES: Procure por R$ no texto. Encontre o preço promocional (geralmente após "Por", "por", "por") e o preço cheio (geralmente após "De", "de").
	  2. TRATE OS VALORES:
	     · Mantenha centavos se aparecerem (ex: R$62,50).
	     · Se for ,00 ou um número inteiro sem centavos, arredonde (ex: R$62,00 → R$62; R$149 → R$149).
	  3. ESCOLHA O FORMATO CORRETO:
	     · Formato A (COM preço cheio): Se houver DOIS valores claros (ex: "De R$100 por R$80"). Formate como:
	       De R$XXX por R$YYY🔥🔥
	     · Formato B (COM preço cheio E menção PIX): Se, além dos dois valores, houver a palavra "pix" próxima ao preço promocional. Formate como:
	       De R$XXX por R$YYY no pix🔥🔥
	     · Formato C (SEM preço cheio): Se APENAS o preço promocional for mencionado (ex: "Por R$80"). Formate como:
	       Por R$YYY🔥🔥
	· NUNCA: Invente um preço cheio se ele não for fornecido. Use o Formato C.
	· QUEBRA DE LINHA NO WHATSAPP: Após os emojis de fogo (🔥🔥), adicione EXATAMENTE 5 (CINCO) ESPAÇOS para forçar a quebra. Exemplo: De R$100 por R$80🔥🔥     

	**CUPOM (SOMENTE SE EXISTIR)**
	· PASSO A PASSO:
	  1. VERIFIQUE A EXISTÊNCIA: Procure as palavras-chave: Cupom:, Use o cupom, aplique o cupom, Cupom de X% OFF.
	  2. IDENTIFIQUE O TIPO:
	     · É um CÓDIGO (ex: DESCONTO10, M3LI2024)? Vá para o Formato A.
	     · É um DESCONTO AUTOMÁTICO (ex: "aplique o cupom 10% OFF", "Ative R$20 OFF")? Vá para o Formato B.
	  3. FORMATE:
	     · Formato A (Código): Cupom: NOMEDOCUPOM 🎟️
	       · Os asteriscos (*) devem estar VISÍVEIS no texto para funcionar como negrito no WhatsApp.
	     · Formato B (Desconto Automático): Aplique o cupom *NOMEDOCUPOM* no anúncio 🎟️
	       · O nome do cupom fica entre dois asteriscos (**).
	· SE NÃO HOUVER CUPOM: NÃO CRIE a linha de cupom. Pule para a próxima regra.

	**LOJA OFICIAL (SOMENTE SE EXISTIR)**
	· CONDIÇÃO ÚNICA: Só inclua esta linha se o texto original contiver a frase exata "loja oficial".
	· COMO FORMATAR: Vendido pela loja oficial da [Marca] no ML
	  · Extraia o nome da Marca do contexto (ex: "loja oficial Nike no ML" → Marca = "Nike").
	· EXCEÇÃO: Se a frase for "loja oficial no ML" sem marca, formate como: Vendido pela loja oficial no ML
	· SE A FRASE NÃO ESTIVER LÁ: NÃO INVENTE. Pule esta linha.

	**INFORMAÇÕES COMPLEMENTARES (SOMENTE SE EXISTIREM)**
	· O QUE INCLUIR AQUI: Instruções como:
	  · "Selecione o vendedor: X"
	  · "Vendido por: Y"
	  · "Selecione a opção Pix"
	  · "Loja: Z"
	· COMO FORMATAR: Coloque em uma linha separada, em itálico, usando asteriscos.
	  · Exemplo: Selecione o vendedor: Loja Do Zé
	· SE NÃO HOUVER: NÃO CRIE.

	**[LINK DO PRODUTO]**
	· O QUE FAZER: 
	· COMO FORMATAR: Coloque na ÚLTIMA LINHA, sem emojis, sem texto anterior.
	· SE NÃO HOUVER: Omita.

	**EMOJIS (LISTA BRANCA)**
	· EMOJIS PERMITIDOS (USE APENAS ESTES):
	  · 🔥🔥 (SOMENTE na linha de preço, após o valor).
	  · 🎟️ (SOMENTE na linha de cupom).
	· AÇÃO OBRIGATÓRIA: Remova TODOS os outros emojis do texto original (✅, ❌, ⚠️, 👊, 👑, ➡️, 🔗, 🚨, 📱, etc.).

---

EXEMPLOS PRÁTICOS (TREINO)

EXEMPLO 1: OFERTA COMPLETA
Entrada do Usuário:


🚨 IMPERDÍVEL!
Tênis Nike Revolution 7
De R$ 349,90 por R$ 279,90 no pix 👊
Cupom: NICKE10 🎟️
Loja oficial Nike no ML:
https://mercadolivre.com/sec/abc123


Sua Saída (FORMATADA):


🚨 IMPERDÍVEL!

Tênis Nike Revolution 7

De R$349,90 por R$279,90 no pix🔥🔥     
Cupom: *NIKE10* 🎟️

Vendido pela loja oficial da Nike no ML
https://mercadolivre.com/sec/abc123


EXEMPLO 2: SEM PREÇO CHEIO, SEM LOJA OFICIAL
Entrada do Usuário:


Creatina Pura 1kg
Apenas R$ 89,90 🔥
https://mercadolivre.com/sec/xyz789


Sua Saída (FORMATADA):


Creatina Pura 1kg

Por R$89,90🔥🔥

https://mercadolivre.com/sec/xyz789


EXEMPLO 3: CUPOM AUTOMÁTICO E INSTRUÇÃO
Entrada do Usuário:


Perfume Importado
De R$ 299 ~por R$ 199~
Aplique o cupom de 15% OFF no anúncio ⚠️
Selecione o vendedor: PerfumariaImport
https://mercadolivre.com/sec/def456


Sua Saída (FORMATADA):


Perfume Importado

De R$299 por R$199🔥🔥     
Aplique o cupom **15% OFF** no anúncio 🎟️

*Selecione o vendedor: PerfumariaImport*
https://mercadolivre.com/sec/def456


---

INSTRUÇÃO FINAL: Agora, receba a oferta do usuário, aplique TODAS as regras na ordem apresentada e retorne APENAS o texto final formatado. Não acrescente saudação, explicação ou qualquer texto extra.
`

const getUserMessagePromptMessageFormatter = ({
	itemLink, 
	itemCoupon,
	itemSummary
}: {
	itemLink: string
	itemCoupon?: string
	itemSummary: string
}) => `
	### [LINK DO PRODUTO]
	${itemLink}

	### [CUPOM DO PRODUTO]
	${itemCoupon}

	### [RESUMO DO PRODUTO]
	${itemSummary}
`

const sendToEvolution = async (body: string, url: string, remoteJid: string, mediaType: string) => {
	if (!body) return
	try {
		await fetch(`http://localhost:9000/message/sendMedia/${process.env.EVOLUTION_INSTANCE_NAME}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'apikey': process.env.EVOLUTION_API_KEY || ''
			},
			body: JSON.stringify({
				number: remoteJid,
				mediatype: mediaType,
				media: url,
				caption: body
			})
		})
	} catch (error) {
		console.error('Erro ao enviar mensagem para Evolution API:', error)
	}
}

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
				console.log('imageMessageRecebida')
				messageBody = message.imageMessage.caption
				const { url: imageUrl, mimetype } = message.imageMessage
				const mediaType = mimetype.split('/')[0]

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
									}, 
									discountOnTheAd: {
										type: "boolean",
										description: "Indica se o texto menciona explicitamente que o cupom ou desconto é aplicado diretamente no anúncio (ex: 'cupom no anúncio'). Não inferir com base em preço, percentual ou menção genérica de cupom."
									}
								},
								required: ["links", "discountOnTheAd"],
								additionalProperties: false
							}
						}
					}
				});

				const completionExtractorContent = JSON.parse(completion.choices[0].message?.content || '{}')
				const generatedLinksByOpenAI = completionExtractorContent.links
				const isDiscountOnTheAd = completionExtractorContent.discountOnTheAd || false
				let outputMessage = ''

				for (const link of generatedLinksByOpenAI) {
					try {
						const itemLink = await getItemLink(link)
						const coupoun = await getItemCoupoun(link)

						if (typeof itemLink === 'object' && ('error' in itemLink)) {
							outputMessage += `\n ${itemLink.error}`
						}

						if (!isDiscountOnTheAd && typeof coupoun === 'object' && ('error' in coupoun)) {
							outputMessage += `\n ${coupoun.error}`
						}

						if (outputMessage) {
							outputMessage =
								`
								Erros encontrados ao tentar buscar os dados do produto:
									${outputMessage}
								---	
								`
						}

						if (typeof itemLink !== 'string') {
							await sendToEvolution(outputMessage, imageUrl, remoteJidMessage, "image")
							continue
						}

						const completion = await openai.chat.completions.create({
							model: "gpt-4o-mini",
							messages: [
								{ role: "system", content: getSystemMessagePromptMessageFormatter() },
								{ role: "user", content: getUserMessagePromptMessageFormatter({
									itemCoupon: typeof coupoun == 'string' ? coupoun : "", 
									itemLink,
									itemSummary: messageBody
								})}
							]
						});

						outputMessage += `\n ${completion.choices[0].message.content}`;
					} catch (error) {
						console.log(error)
					}
				}

				await sendToEvolution(outputMessage, imageUrl, remoteJidMessage, "image")
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
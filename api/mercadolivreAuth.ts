import { Page, BrowserContext } from "playwright";
import fs from 'fs';
import { getRandomDelay } from './utils';

export const loginMercadoLivre = async (page: Page, browserContext: BrowserContext) => {
	// 3. Carregar sessão do Mercado Livre
	if (fs.existsSync('ml-auth.json')) {
		const storageState = JSON.parse(fs.readFileSync('ml-auth.json', 'utf-8'));
		if (storageState.cookies) {
			await browserContext.addCookies(storageState.cookies);
		}
		console.log('🔄 Sessão ML carregada de ml-auth.json');
	}

	// 4. Verificar/Realizar Login no Mercado Livre
	await page.goto('https://www.mercadolivre.com/jms/mlb/lgz/msl/login/', {
		waitUntil: 'domcontentloaded',
	});

	if (!page.url().includes('/login') && !page.url().includes('/registration')) {
		console.log('✅ Já logado no Mercado Livre');
	} else {
		console.log('🔄 Realizando login no Mercado Livre via Google...');

		// 1️⃣ Acha o iframe do Google
		const googleIframe = page.frameLocator(
			'iframe[src^="https://accounts.google.com/gsi/button"]'
		);
		const button = googleIframe.locator('div[role="button"]');
		
		await button.waitFor({ state: 'visible', timeout: 15000 });

		// 1️⃣ Escuta o popup
		const [popup] = await Promise.all([
			page.waitForEvent('popup'),
			
			// 2️⃣ Ação que dispara o popup
			button.click({ delay: getRandomDelay(50, 150) }),
		]);
		
		// 3️⃣ Agora VOCÊ CONTROLA o popup
		await popup.waitForLoadState('domcontentloaded');	
		await popup.waitForTimeout(getRandomDelay(500, 1000));

		await popup
  			.locator(`div[data-email="${process.env.ML_EMAIL}"]`)
  			.click({ timeout: 15000, delay: getRandomDelay(50, 100) });

		// Aguarda redirecionamento e login
		try {
			await page.waitForURL((url) => !url.toString().includes('/login') && !url.toString().includes('/registration'), {
				timeout: 60000
			});
			console.log('✅ Login no Mercado Livre realizado com sucesso');
			
			// Salvar sessão do Mercado Livre
			await browserContext.storageState({ path: 'ml-auth.json' });
			console.log('✅ Sessão ML salva em ml-auth.json');
		} catch (error) {
			console.error('❌ Erro ao aguardar login no Mercado Livre:', error);
		}
	}
}
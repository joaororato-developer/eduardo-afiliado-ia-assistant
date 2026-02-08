import { Page, BrowserContext } from "playwright";
import fs from 'fs';
import { getRandomDelay } from './utils';

export const loginGoogle = async (page: Page, browserContext: BrowserContext) => {
	// 1. Carregar sessão do Google
	if (fs.existsSync('google-auth.json')) {
		const storageState = JSON.parse(fs.readFileSync('google-auth.json', 'utf-8'));
		if (storageState.cookies) {
			await browserContext.addCookies(storageState.cookies);
		}
		console.log('🔄 Sessão Google carregada de google-auth.json');
	}

	// 2. Verificar/Realizar Login no Google
	await page.goto('https://accounts.google.com/', {
		waitUntil: 'domcontentloaded',
	});

	if (page.url().includes('myaccount.google.com') || (await page.locator('input[type="email"]').count() === 0)) {
		console.log('✅ Já logado no Google');
	} else {
		// Email
		const googleEmail = page.locator('input[type="email"]');
		await googleEmail.waitFor({ timeout: 15000 });
		
		await googleEmail.type(process.env.ML_EMAIL as string, {
			delay: getRandomDelay(80, 120), // 👈 digitação humana
		});
		
		await page.waitForTimeout(getRandomDelay(500, 800));
		await page.keyboard.press('Enter');
		
		// Senha
		const googlePassword = page.locator('input[name="Passwd"]');
		await googlePassword.waitFor({ timeout: 15000 });
		
		await googlePassword.type(process.env.ML_PASSWORD as string, {
			delay: getRandomDelay(90, 130), // 👈 ligeiramente diferente do email
		});
		
		await page.waitForTimeout(getRandomDelay(600, 1000));
		await page.keyboard.press('Enter');
		
		// Aguarda login completar
		await page.waitForURL(/myaccount\.google\.com|mail\.google\.com/, {
			timeout: 30000,
		});
		
		console.log('✅ Login no Google realizado');
		
		// Salvar sessão do Google
		await browserContext.storageState({ path: 'google-auth.json' });
		console.log('✅ Sessão Google salva em google-auth.json');
	}
}
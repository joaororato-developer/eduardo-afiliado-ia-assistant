import { Browser, BrowserContext, chromium } from "playwright"
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
		.pressSequentially('admpromoestilo1@gmail.com', { delay: 100 })
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



waitLogin().then(async () => console.log(await getItemLinkCoupon('https://mercadolivre.com/sec/2t1RMEU')))


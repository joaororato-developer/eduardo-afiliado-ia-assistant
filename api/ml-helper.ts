import { Page } from "playwright"

export const getItemLink = async (itemUrl: string, page: Page) => {
	try {
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

export const getItemPrice = async (itemUrl: string, page: Page) => {
	try {
		const priceElement = page.locator('.ui-pdp-price__second-line .andes-money-amount__fraction').first()
		await priceElement.waitFor({ state: 'visible', timeout: 8000 })

		let price = await priceElement.innerText()
		
		const centsElement = page.locator('.ui-pdp-price__second-line .andes-money-amount__cents').first()
		if (await centsElement.isVisible({ timeout: 1000 })) {
			const cents = await centsElement.innerText()
			price = `${price},${cents}`
		}

		return price
	} catch (error) {
		await page.screenshot()
		return {
			error: `Produto ${itemUrl} não possui preço cadastrado no momento.`
		}
	}
}

export const getItemCoupoun = async (itemUrl: string, page: Page) => {
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

		const inputCodeCoupon = couponFrame.locator('.input-code-coupon-container .input-code-coupon').filter({ hasText: coupon });
		const isInputCodeVisible = await inputCodeCoupon.isVisible({ timeout: 2000 });

		return { coupon, isDiscountOnTheAd: !isInputCodeVisible }
	} catch (error) {
		return {
			error: `Produto ${itemUrl} não possui cupom cadastrado no momento.`
		}
	}
}

export const getItemDiscountText = async (itemUrl: string, page: Page) => {
	try {
		const discountLabel = page.locator('label.ui-vpp-coupons-awareness__checkbox-label').first()
		if (await discountLabel.isVisible({ timeout: 2000 })) {
			return await discountLabel.innerText()
		}
		return null
	} catch (error) {
		return null
	}
}
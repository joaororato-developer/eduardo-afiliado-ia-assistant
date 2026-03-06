import { Page } from "playwright"

export const getItemLink = async (itemUrl: string, page: Page) => {
	try {
		const actionLink = page.locator(
			'.poly-component__link.poly-component__link--action-link',
		)
		await actionLink.waitFor({ state: 'visible', timeout: 60000 })
		await actionLink.click()
	
		// Pegar link
		let itemLink: string | null;
	
		const shareLinkButton = page.getByTestId('generate_link_button').filter({ hasText: 'Compartilhar' })
		await shareLinkButton.waitFor({ state: 'visible', timeout: 60000 })
		await shareLinkButton.click()
		const linkInput = page.getByTestId('text-field__label_link')
		await linkInput.waitFor({ state: 'visible', timeout: 60000 })
	
		itemLink = await linkInput.inputValue()
	
		await page.keyboard.press('Escape')

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
		await priceElement.waitFor({ state: 'visible', timeout: 10000 })

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

export const getItemOldPrice = async (itemUrl: string, page: Page) => {
	try {
		const priceElement = page.locator('.ui-pdp-price__original-value .andes-money-amount__fraction').first()
		if (await priceElement.isVisible({ timeout: 2000 })) {
			let price = await priceElement.innerText()
			const centsElement = page.locator('.ui-pdp-price__original-value .andes-money-amount__cents').first()
			if (await centsElement.isVisible({ timeout: 1000 })) {
				const cents = await centsElement.innerText()
				price = `${price},${cents}`
			}
			return price
		}
		return null
	} catch (error) {
		return null
	}
}

export const getItemCoupoun = async (itemUrl: string, page: Page) => {
	try {
		const couponsLink = page.getByTestId('action-modal-link')
			.filter({ hasText: 'Ver cupons disponíveis' })
		await couponsLink.waitFor({ state: 'visible', timeout: 10000 })

		couponsLink && await couponsLink.click()
		await page.waitForTimeout(500)

		const couponFrame = page.frameLocator('iframe[title="Ver cupons disponíveis"]');

		const firstCouponItem = couponFrame.locator('div.coupons-list-container > div > div > div > div > div.top-container > div.left-side-container > div.icon-title-container > span').first();

		let coupon: string | null = null;

		await firstCouponItem.waitFor({ state: 'visible', timeout: 10000 });

		coupon = await firstCouponItem.innerText();

		if (coupon.includes('OFF ')) {
			coupon = coupon
				?.replace(/^.*OFF \s*/i, '')     // remove tudo antes de OFF
				?.match(/[A-ZÀ-Ú0-9_]/g)         // letras maiúsculas + números
				?.join('') || coupon;
		}

	
		let inputCodeCoupon = couponFrame.locator('.input-code-coupon-container .input-code-coupon').filter({ hasText: coupon });
		const isInputCodeVisible = await inputCodeCoupon.isVisible({ timeout: 4000 });

		return { coupon, isDiscountOnTheAd: !isInputCodeVisible }
	} catch (error) {
		return { 
			error: `Produto ${itemUrl} não possui cupom cadastrado no momento.`
		}
	}
}

export const getItemDiscountText = async (itemUrl: string, page: Page) => {
	try {
		let discountText: string | null = null
		let minCartValueText: string | null = null

		const discountLabel = page.locator('label.ui-vpp-coupons-awareness__checkbox-label').first()
		if (await discountLabel.isVisible({ timeout: 2000 })) {
			discountText = await discountLabel.innerText()
		}

		const minCartValueLabel = page.locator('p.ui-vpp-coupons__text').first()
		if (await minCartValueLabel.isVisible({ timeout: 1000 })) {
			minCartValueText = await minCartValueLabel.innerText()
		}

		return { discountText, minCartValueText }
	} catch (error) {
		return { discountText: null, minCartValueText: null }
	}
}

export const getItemPaymentMethod = async (itemUrl: string, page: Page) => {
	try {
		const paymentMethodElement = page.locator('.ui-pdp-price__second-line__label .ui-pdp-price__second-line__text').first()
		if (await paymentMethodElement.isVisible({ timeout: 2000 })) {
			return await paymentMethodElement.innerText()
		}
		return null
	} catch (error) {
		return null
	}
}

export const getItemTitle = async (itemUrl: string, page: Page) => {
	try {
		const titleElement = page.locator('.ui-pdp-title').first()
		if (await titleElement.isVisible({ timeout: 2000 })) {
			return await titleElement.innerText()
		}
		return null
	} catch (error) {
		return null
	}
}

export const getFreeShippingFull = async (itemUrl: string, page: Page) => {
	try {
		const polyShipping = page.locator('.poly-component__shipping').first()
		if (await polyShipping.isVisible({ timeout: 1000 })) {
			const hasFreeShipping = await polyShipping.filter({ hasText: 'Frete grátis' }).isVisible()
			const hasFull = await polyShipping.locator('.poly-shipping__promise-icon--full').isVisible()
			return hasFreeShipping && hasFull
		}

		const freeShipping = page.locator('.ui-pdp-media__title').filter({ hasText: 'Frete grátis' }).first()
		const fullIcon = page.locator('.ui-pdp-icon--full-filled').first()
		
		const hasFreeShipping = await freeShipping.isVisible({ timeout: 2000 })
		const hasFull = await fullIcon.isVisible({ timeout: 2000 })

		return { hasFreeShipping, hasFull }
	} catch (error) {
		return false
	}
}

export const getStoreVerified = async (itemUrl: string, page: Page) => {
	try {
		const officialStoreLabel = page.locator('.ui-pdp-seller__label-sold').filter({ hasText: 'Loja oficial' }).first()
		if (await officialStoreLabel.isVisible({ timeout: 1000 })) return true

		const cockadeIcon = page.locator('.ui-pdp-cockade-icon').first()
		if (await cockadeIcon.isVisible({ timeout: 1000 })) return true

		const cockadeImg = page.locator('img[src*="cockade.svg"]').first()
		if (await cockadeImg.isVisible({ timeout: 1000 })) return true

		const verifiedIcon = page.locator('.ui-pdp-icon--official-store').first()
		return await verifiedIcon.isVisible({ timeout: 1000 })
	} catch (error) {
		return false
	}
}
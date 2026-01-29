import { Browser, BrowserContext, chromium } from "playwright"
const browserInstance = chromium.launch({ headless: false }) // Abre o navegador visível

export let browserContext: BrowserContext | null = null



waitLogin().then(async () => console.log(await getItemLinkCoupon('https://mercadolivre.com/sec/2t1RMEU')))


export const getSystemMessagePromptDiscountExtractor = () => `
	Você é um assistente especializado em extrair informações de textos de descontos do Mercado Livre.
	Sua tarefa é identificar se existe um valor limite de desconto no texto fornecido.

	Regras:
	- Se houver um valor limite (ex: "Limite de R$ 20"), extraia apenas o valor numérico (ex: 20).
	- Se não houver limite, retorne null.
	- O retorno deve ser um JSON estrito.

	Formato de resposta JSON:
	{
		"limit": number | null
	}
`

export const getUserMessagePromptDiscountExtractor = (text: string) => `
	Analise o seguinte texto e extraia o limite de desconto:
	"${text}"
`
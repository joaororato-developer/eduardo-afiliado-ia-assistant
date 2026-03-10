import * as axios from 'axios'

const sendflowApiAxios = axios.create({
  baseURL: process.env.SENDFLOW_API_URL,
  headers: {
    Authorization: `Bearer ${process.env.SENDFLOW_API_KEY}`,
    userId: process.env.SENDFLOW_MAIN_USER_ID,
    'Content-Type': 'application/json',
  },
});

export interface ReleaseGroupsResponse {
	gid: string
	id: string
	inviteCode: string
	jid: string
	name: string
}

interface SendToReleaseRequest {
	accountId: string | string [] | undefined
	caption: string
	url: string // url da imagem
	groupIds: string[]
}

class SendFlowApi {

	public async getTestReleaseGroup(): Promise<ReleaseGroupsResponse[]> {
		const response = await sendflowApiAxios.get(`/releases/${process.env.SENDFLOW_TEST_RELEASE_ID}/groups`)
		const { data } = response

		return data as ReleaseGroupsResponse[]

	}
	
	public async getMainReleaseGroup(): Promise<ReleaseGroupsResponse[]> {
		const response = await sendflowApiAxios.get(`/releases/${process.env.SENDFLOW_MAIN_RELEASE_ID}/groups`)
		const { data } = response
		
		return data as ReleaseGroupsResponse[]
	}

	public async getMain2ReleaseGroup(): Promise<ReleaseGroupsResponse[]> {
		const response = await sendflowApiAxios.get(`/releases/${process.env.SENDFLOW_MAIN_2_RELEASE_ID}/groups`)
		const { data } = response
		
		return data as ReleaseGroupsResponse[]
	}

	public async getPerfumeReleaseGroup(): Promise<ReleaseGroupsResponse[]> {
		const response = await sendflowApiAxios.get(`/releases/${process.env.SENDFLOW_PERFUME_RELEASE_ID}/groups`)
		const { data } = response
		
		return data as ReleaseGroupsResponse[]
	}

	public async sendToTestRelease(data: SendToReleaseRequest): Promise<void> {
		if (!data.accountId) return

		await sendflowApiAxios.post(`/actions/send-image-message`, {
			...data, 
			releaseId: process.env.SENDFLOW_TEST_RELEASE_ID,
			accountId: data.accountId, 
			chooseSpecificGroups: true, 
		})
	}
	
	public async sendToMainRelease(data: SendToReleaseRequest): Promise<void> {
		if (!data.accountId) return

		await sendflowApiAxios.post(`/actions/send-image-message`, {
			...data, 
			releaseId: process.env.SENDFLOW_MAIN_RELEASE_ID,
			accountId: data.accountId, 
			chooseSpecificGroups: true, 
		})
	}

	public async sendToMain2Release(data: SendToReleaseRequest): Promise<void> {
		if (!data.accountId) return

		await sendflowApiAxios.post(`/actions/send-image-message`, {
			...data, 
			releaseId: process.env.SENDFLOW_MAIN_2_RELEASE_ID,
			accountId: data.accountId, 
			chooseSpecificGroups: true, 
		})
	}

	public async sendToPerfumeRelease(data: SendToReleaseRequest): Promise<void> {
		if (!data.accountId) return

		await sendflowApiAxios.post(`/actions/send-image-message`, {
			...data, 
			releaseId: process.env.SENDFLOW_PERFUME_RELEASE_ID,
			accountId: data.accountId, 
			chooseSpecificGroups: true, 
		})
	}

	public async getAccountIdsFromRelease(releaseId: string): Promise<string[]> {
		const response = await sendflowApiAxios.get(`/releases/${releaseId}`)
		const { data } = response as { data: { accountIds: string[] } }

		if (data?.accountIds) return data.accountIds
		
		return []
	}
}


export const sendFlowApi = new SendFlowApi()




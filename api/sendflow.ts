import * as axios from 'axios'

const sendflowApiAxios = axios.create({
  baseURL: process.env.SENDFLOW_API_URL,
  headers: {
    Authorization: `Bearer ${process.env.SENDFLOW_API_KEY}`,
    userId: process.env.SENDFLOW_MAIN_USER_ID,
    'Content-Type': 'application/json',
  },
});

interface ReleaseGroupsResponse {
	gid: string
	id: string
	inviteCode: string
	jid: string
	name: string
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
}


export const sendFlowApi = new SendFlowApi()




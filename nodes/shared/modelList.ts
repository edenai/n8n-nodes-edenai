import type { ILoadOptionsFunctions } from 'n8n-workflow';

type ModelGroup = { id: string; endpoints?: Array<{ id: string }> };

// Aliases (~) repeat their target's endpoints and policies have none.
export function endpointIds(groups: ModelGroup[]): string[] {
	const ids = groups
		.filter((g) => !g.id.startsWith('~') && !g.id.startsWith('policy/'))
		.flatMap((g) => (g.endpoints ?? []).map((e) => e.id));
	return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export async function loadEndpointIds(this: ILoadOptionsFunctions, url: string): Promise<string[]> {
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'edenAiApi', {
		method: 'GET',
		url,
		// Asked for by name so a switch of the API's default view changes nothing here.
		qs: { view: 'models' },
		json: true,
	})) as { data?: ModelGroup[] };

	return endpointIds(response.data ?? []);
}

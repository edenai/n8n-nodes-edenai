import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class EdenAiApi implements ICredentialType {
	name = 'edenAiApi';

	displayName = 'Eden AI API';

	documentationUrl = 'https://edenai.co/docs';

	properties: INodeProperties[] = [
		{
			displayName:
				'Get your API key from the <a href="https://app.edenai.run/settings/api-keys" target="_blank">Eden AI API keys panel</a>.',
			name: 'apiKeyNotice',
			type: 'notice',
			default: '',
		},
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Your Eden AI API key. Create or copy one from the <a href="https://app.edenai.run/settings/api-keys" target="_blank">API keys panel</a> of your Eden AI account.',
		},
		{
			displayName: 'Base URL',
			name: 'url',
			type: 'hidden',
			default: 'https://api.edenai.run/v3',	
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{ $credentials.url }}',
			url: '/models',
		},
	};
}

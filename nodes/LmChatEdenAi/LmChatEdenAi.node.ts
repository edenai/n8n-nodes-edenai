import { supplyModel } from '@n8n/ai-node-sdk';
import {
	NodeConnectionTypes,
	NodeOperationError,
	type ILoadOptionsFunctions,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

const GLOBAL_BASE_URL = 'https://api.edenai.run/v3';
const EU_BASE_URL = 'https://api.eu.edenai.run/v3';

// Providers known to be absent from Eden AI's smart-routing registry. Selecting
// any of these as a router_candidate returns a 400 from the upstream router.
// Remove entries here once Eden AI exposes a capability flag in /v3/models.
const SMART_ROUTING_INCOMPATIBLE_PREFIXES = ['amazon/', 'ovhcloud/'];

export class LmChatEdenAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Eden AI Chat Model',
		name: 'lmChatEdenAi',
		icon: 'file:edenai.svg',
		group: ['transform'],
		version: [1],
		description: 'Use Eden AI to access 300+ models from 50+ providers through a single European AI gateway',
		defaults: {
			name: 'Eden AI Chat Model',
		},
		codex: {
			resources: {
				primaryDocumentation: [
					{
						url: 'https://edenai.co/docs/v3/llms/chat-completions',
					},
				],
			},
		},
		// This is an AI sub-node (language model), not a regular data-processing node.
		// The base linter assumes ['main'] connections; AI nodes correctly use empty
		// inputs and an AiLanguageModel output.
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'edenAiApi',
				required: true,
			},
		],
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL: '={{ $credentials?.url }}',
		},
		properties: [
			{
				displayName:
					'If using JSON response format, you must include the word "json" in the prompt. Also, make sure to select models released after November 2023.',
				name: 'notice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						'/options.responseFormat': ['json_object'],
					},
				},
			},
			{
				displayName: 'EU Only',
				name: 'euOnly',
				type: 'boolean',
				default: false,
				description:
					'Whether to route requests through Eden AI\'s EU endpoint (api.eu.edenai.run). When enabled, only EU-eligible models are listed and non-EU providers are rejected before the request leaves the region. Useful for GDPR or data-residency requirements.',
			},
			{
				// Kept as "Model" (not "Model Name or ID") to mirror the Eden AI playground UI.
				// eslint-disable-next-line n8n-nodes-base/node-param-display-name-wrong-for-dynamic-options
				displayName: 'Model',
				name: 'model',
				type: 'options',
				// Custom description is more informative than the generic dynamic-options boilerplate.
				// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-options
				description:
					'The model to use in provider/model format (e.g. openai/gpt-4o, anthropic/claude-sonnet-4-5). Pick <strong>Smart Routing (@edenai)</strong> at the top of the list to let Eden AI auto-select. <a href="https://edenai.co/docs/v3/llms/listing-models">Browse all models</a>.',
				typeOptions: {
					loadOptionsDependsOn: ['euOnly'],
					loadOptionsMethod: 'getModels',
				},
				default: 'openai/gpt-4o-mini',
			},
			{
				displayName: 'Restrict Routing Pool',
				name: 'restrictRoutingPool',
				type: 'boolean',
				default: false,
				description:
					'Whether to limit Smart Routing to a specific subset of models. When off, all eligible models are considered.',
				displayOptions: {
					show: {
						model: ['@edenai'],
					},
				},
			},
			{
				// Kept as "Router Candidates" to mirror the Eden AI playground terminology.
				// eslint-disable-next-line n8n-nodes-base/node-param-display-name-wrong-for-dynamic-multi-options
				displayName: 'Router Candidates',
				name: 'routerCandidates',
				type: 'multiOptions',
				default: [],
				// Custom description carries provider-compatibility warnings the generic boilerplate can't.
				// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-multi-options
				description:
					'Models the smart router may choose from. Bedrock and OVHcloud models are excluded automatically because the upstream router doesn\'t support them yet. Newer Mistral versions (mistral-large-2411 and above) may also fail with a 400. <a href="https://edenai.co/docs/v3/llms/smart-routing">Learn more</a>.',
				displayOptions: {
					show: {
						model: ['@edenai'],
						restrictRoutingPool: [true],
					},
				},
				typeOptions: {
					loadOptionsDependsOn: ['euOnly'],
					loadOptionsMethod: 'getRouterCandidates',
				},
			},
			{
				displayName: 'Reasoning Effort',
				name: 'reasoningEffortEnabled',
				type: 'boolean',
				default: false,
				description:
					'Whether to control how much the model reasons before answering. Only effective on reasoning-capable models.',
			},
			{
				displayName: 'Level',
				name: 'reasoningEffort',
				type: 'options',
				default: 'medium',
				description: 'Controls the depth of reasoning for this model',
				displayOptions: {
					show: {
						reasoningEffortEnabled: [true],
					},
				},
				// Ordered as a deliberate effort gradient (Minimal → Max), not alphabetically.
				// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
				options: [
					{ name: 'Minimal', value: 'minimal' },
					{ name: 'Low', value: 'low' },
					{ name: 'Medium', value: 'medium' },
					{ name: 'High', value: 'high' },
					{ name: 'Max', value: 'max' },
					{ name: 'Extra High', value: 'xhigh' },
					{ name: 'Disable', value: 'disable' },
				],
			},
			{
				displayName: 'Web Search',
				name: 'webSearch',
				type: 'boolean',
				default: false,
				description:
					'Whether to let the model search the web for real-time information. Not supported by all models.',
			},
			{
				displayName: 'Depth',
				name: 'webSearchContextSize',
				type: 'options',
				default: 'medium',
				description: 'Amount of web context retrieved. Higher means more complete but slower and costlier.',
				displayOptions: {
					show: {
						webSearch: [true],
					},
				},
				options: [
					{ name: 'Low', value: 'low', description: 'Minimal web context' },
					{ name: 'Medium', value: 'medium', description: 'Balanced web context' },
					{ name: 'High', value: 'high', description: 'Maximum web context' },
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Fallback Models',
						name: 'fallbacks',
						type: 'string',
						default: '',
						placeholder: 'openai/gpt-4o,anthropic/claude-haiku-4-5',
						description:
							'Comma-separated list of fallback models. If the primary model fails, Eden AI retries with each fallback in order.',
					},
					{
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						type: 'number',
						default: 0,
						typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
						description:
							"Penalizes new tokens based on their existing frequency, decreasing the model's likelihood to repeat the same line verbatim",
					},
					{
						displayName: 'JSON Schema',
						name: 'jsonSchema',
						type: 'json',
						default:
							'{\n  "name": "response",\n  "strict": true,\n  "schema": {\n    "type": "object",\n    "properties": {},\n    "required": [],\n    "additionalProperties": false\n  }\n}',
						description:
							'JSON Schema the response must conform to. Used only when Response Format is set to JSON Schema. Must include "name" and "schema"; "strict": true is recommended. <a href="https://edenai.co/docs/v3/llms/structured-output">See examples</a>.',
						displayOptions: {
							show: {
								responseFormat: ['json_schema'],
							},
						},
					},
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						type: 'number',
						default: 2,
						description: 'Maximum number of retries on failure',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						type: 'number',
						default: -1,
						description:
							'The maximum number of tokens to generate. Use -1 for the model maximum.',
						typeOptions: {
							maxValue: 32768,
						},
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						type: 'number',
						default: 0,
						typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
						description:
							"Penalizes new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics",
					},
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						type: 'options',
						default: 'text',
						options: [
							{
								name: 'Text',
								value: 'text',
								description: 'Regular text response',
							},
							{
								name: 'JSON',
								value: 'json_object',
								description: 'Forces the model to return valid JSON',
							},
							{
								name: 'JSON Schema',
								value: 'json_schema',
								description: 'Force valid JSON conforming to the schema you provide (strict mode)',
							},
						],
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						type: 'number',
						default: 0.7,
						typeOptions: { maxValue: 2, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness. Lower values produce more deterministic outputs.',
					},
					{
						displayName: 'Seed',
						name: 'seed',
						type: 'number',
						default: -1,
						description:
							'Integer seed for deterministic sampling on supporting providers. Use -1 to disable.',
					},
					{
						displayName: 'Stop Sequences',
						name: 'stop',
						type: 'string',
						default: '',
						placeholder: 'END,---',
						description:
							'Comma-separated list of strings. The model stops generating when any of these appears. Up to 4 sequences.',
					},
					{
						displayName: 'Timeout',
						name: 'timeout',
						type: 'number',
						default: 360000,
						description: 'Maximum request duration in milliseconds',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						type: 'number',
						default: 1,
						typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
						description:
							'Controls diversity via nucleus sampling. We recommend altering this or temperature but not both.',
					},
					{
						displayName: 'User Identifier',
						name: 'user',
						type: 'string',
						default: '',
						description:
							'Stable identifier representing your end user. Forwarded to providers for abuse monitoring and analytics.',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const euOnly = (this.getCurrentNodeParameter('euOnly') as boolean) ?? false;
				const baseUrl = euOnly ? EU_BASE_URL : GLOBAL_BASE_URL;

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'edenAiApi',
					{
						method: 'GET',
						url: `${baseUrl}/models`,
						json: true,
					},
				)) as { data?: Array<{ id: string }> };

				const models: INodePropertyOptions[] = (response.data ?? [])
					.map((m) => ({ name: m.id, value: m.id }))
					.sort((a, b) => a.name.localeCompare(b.name));

				return [
					{
						// "@edenai" is a literal API token and must stay lowercase.
						// eslint-disable-next-line n8n-nodes-base/node-param-display-name-miscased
						name: 'Smart Routing (@edenai)',
						value: '@edenai',
						description:
							'Let Eden AI auto-select the best model. Optionally narrow the pool with Router Candidates.',
					},
					...models,
				];
			},

			async getRouterCandidates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const euOnly = (this.getCurrentNodeParameter('euOnly') as boolean) ?? false;
				const baseUrl = euOnly ? EU_BASE_URL : GLOBAL_BASE_URL;

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'edenAiApi',
					{
						method: 'GET',
						url: `${baseUrl}/models`,
						json: true,
					},
				)) as { data?: Array<{ id: string }> };

				return (response.data ?? [])
					.filter(
						(m) =>
							!SMART_ROUTING_INCOMPATIBLE_PREFIXES.some((p) => m.id.startsWith(p)),
					)
					.map((m) => ({ name: m.id, value: m.id }))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('edenAiApi');

		const euOnly = this.getNodeParameter('euOnly', itemIndex, false) as boolean;
		const model = this.getNodeParameter('model', itemIndex, '') as string;
		const smartRouting = model === '@edenai';
		const routerCandidates = this.getNodeParameter('routerCandidates', itemIndex, []) as string[];
		const reasoningEffortEnabled = this.getNodeParameter(
			'reasoningEffortEnabled',
			itemIndex,
			false,
		) as boolean;
		const reasoningEffort = reasoningEffortEnabled
			? (this.getNodeParameter('reasoningEffort', itemIndex, 'medium') as
					| 'minimal'
					| 'low'
					| 'medium'
					| 'high'
					| 'max'
					| 'xhigh'
					| 'disable')
			: '';
		const webSearch = this.getNodeParameter('webSearch', itemIndex, false) as boolean;
		const webSearchContextSize = webSearch
			? (this.getNodeParameter('webSearchContextSize', itemIndex, 'medium') as
					| 'low'
					| 'medium'
					| 'high')
			: 'medium';
		const options = this.getNodeParameter('options', itemIndex, {}) as {
			fallbacks?: string;
			frequencyPenalty?: number;
			jsonSchema?: string;
			maxTokens?: number;
			maxRetries?: number;
			timeout?: number;
			presencePenalty?: number;
			temperature?: number;
			seed?: number;
			stop?: string;
			topP?: number;
			user?: string;
			responseFormat?: 'text' | 'json_object' | 'json_schema';
		};

		// Build Eden AI V3-specific extra params
		const additionalParams: Record<string, unknown> = {};

		if (smartRouting && routerCandidates.length > 0) {
			additionalParams.router_candidates = routerCandidates;
		}

		if (options.responseFormat === 'json_object') {
			additionalParams.response_format = { type: 'json_object' };
		} else if (options.responseFormat === 'json_schema' && options.jsonSchema) {
			try {
				const schema = JSON.parse(options.jsonSchema);
				additionalParams.response_format = { type: 'json_schema', json_schema: schema };
			} catch (err) {
				throw new NodeOperationError(
					this.getNode(),
					`Invalid JSON Schema: ${(err as Error).message}`,
					{ itemIndex },
				);
			}
		}

		if (options.fallbacks) {
			const fallbackList = options.fallbacks
				.split(',')
				.map((f) => f.trim())
				.filter((f) => f.length > 0);
			if (fallbackList.length > 0) {
				additionalParams.fallbacks = fallbackList;
			}
		}

		if (reasoningEffort) {
			additionalParams.reasoning_effort = reasoningEffort;
		}

		if (typeof options.seed === 'number' && options.seed >= 0) {
			additionalParams.seed = options.seed;
		}

		if (options.stop) {
			const stopList = options.stop
				.split(',')
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			if (stopList.length > 0) {
				additionalParams.stop = stopList;
			}
		}

		if (options.user) {
			additionalParams.user = options.user;
		}

		if (webSearch) {
			additionalParams.web_search_options = {
				search_context_size: webSearchContextSize,
			};
		}

		return supplyModel(this, {
			type: 'openai',
			baseUrl: euOnly ? EU_BASE_URL : (credentials.url as string),
			apiKey: credentials.apiKey as string,
			model,
			temperature: options.temperature,
			maxTokens: options.maxTokens && options.maxTokens > 0 ? options.maxTokens : undefined,
			topP: options.topP,
			frequencyPenalty: options.frequencyPenalty,
			presencePenalty: options.presencePenalty,
			maxRetries: options.maxRetries ?? 2,
			timeout: options.timeout,
			additionalParams: Object.keys(additionalParams).length > 0 ? additionalParams : undefined,
		});
	}
}

import { supplyModel } from '@n8n/ai-node-sdk';
import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

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
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.edenai.run/v3/llms/chat-completions',
					},
				],
			},
		},
		inputs: [],
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
				displayName: 'Model',
				name: 'model',
				type: 'options',
				description:
					'The model to use in provider/model format (e.g. openai/gpt-4o, anthropic/claude-sonnet-4-5). <a href="https://docs.edenai.run/v3/llms/listing-models">Browse all models</a>.',
				typeOptions: {
					loadOptions: {
						routing: {
							request: {
								method: 'GET',
								url: '/models',
							},
							output: {
								postReceive: [
									{
										type: 'rootProperty',
										properties: {
											property: 'data',
										},
									},
									{
										type: 'setKeyValue',
										properties: {
											name: '={{$responseItem.id}}',
											value: '={{$responseItem.id}}',
										},
									},
									{
										type: 'sort',
										properties: {
											key: 'name',
										},
									},
								],
							},
						},
					},
				},
				default: 'openai/gpt-4o-mini',
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
						displayName: 'Max Retries',
						name: 'maxRetries',
						type: 'number',
						default: 2,
						description: 'Maximum number of retries on failure',
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
						displayName: 'Web Search',
						name: 'webSearch',
						type: 'boolean',
						default: false,
						description:
							'Whether to allow the model to access real-time information from the web. Not supported by all models.',
					},
					{
						displayName: 'Web Search Context Size',
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
							{
								name: 'Low',
								value: 'low',
								description: 'Minimal web context',
							},
							{
								name: 'Medium',
								value: 'medium',
								description: 'Balanced web context',
							},
							{
								name: 'High',
								value: 'high',
								description: 'Maximum web context',
							},
						],
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('edenAiApi');

		const model = this.getNodeParameter('model', itemIndex) as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as {
			fallbacks?: string;
			frequencyPenalty?: number;
			maxTokens?: number;
			maxRetries?: number;
			timeout?: number;
			presencePenalty?: number;
			temperature?: number;
			topP?: number;
			responseFormat?: 'text' | 'json_object';
			webSearch?: boolean;
			webSearchContextSize?: 'low' | 'medium' | 'high';
		};

		// Build Eden AI V3-specific extra params
		const additionalParams: Record<string, unknown> = {};

		if (options.responseFormat && options.responseFormat !== 'text') {
			additionalParams.response_format = { type: options.responseFormat };
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

		if (options.webSearch) {
			additionalParams.web_search_options = {
				search_context_size: options.webSearchContextSize ?? 'medium',
			};
		}

		return supplyModel(this, {
			type: 'openai',
			baseUrl: credentials.url as string,
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

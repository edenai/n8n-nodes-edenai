import { OpenAIEmbeddings } from '@langchain/openai';
import {
	type ILoadOptionsFunctions,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

const GLOBAL_BASE_URL = 'https://api.edenai.run/v3';
const EU_BASE_URL = 'https://api.eu.edenai.run/v3';

export class EmbeddingsEdenAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Eden AI Embeddings',
		name: 'embeddingsEdenAi',
		icon: 'file:edenai.svg',
		group: ['transform'],
		version: [1],
		description:
			'Use Eden AI to generate text embeddings from 50+ providers through a single European AI gateway',
		defaults: {
			name: 'Eden AI Embeddings',
		},
		codex: {
			resources: {
				primaryDocumentation: [
					{
						url: 'https://edenai.co/docs/v3/llms/embeddings',
					},
				],
			},
		},
		// This is an AI sub-node (embeddings), not a regular data-processing node.
		// The base linter assumes ['main'] connections; AI nodes correctly use empty
		// inputs and an AiEmbedding output.
		// eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
		inputs: [],
		// eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
		outputs: ['ai_embedding'],
		outputNames: ['Embeddings'],
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
					'The embeddings model to use in provider/model format (e.g. openai/text-embedding-3-small). <a href="https://edenai.co/docs/v3/llms/embeddings">Browse all models</a>.',
				typeOptions: {
					loadOptionsDependsOn: ['euOnly'],
					loadOptionsMethod: 'getEmbeddingModels',
				},
				default: 'openai/text-embedding-3-small',
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
						displayName: 'Batch Size',
						name: 'batchSize',
						type: 'number',
						default: 512,
						description: 'Maximum number of documents to send in each request',
					},
					{
						displayName: 'Dimensions',
						name: 'dimensions',
						type: 'number',
						default: -1,
						description:
							'Number of dimensions the output embeddings should have. Only supported by some models (e.g. text-embedding-3-*). Use -1 for the model default.',
					},
					{
						displayName: 'Strip New Lines',
						name: 'stripNewLines',
						type: 'boolean',
						default: true,
						description: 'Whether to strip new lines from the input text before embedding',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getEmbeddingModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const euOnly = (this.getCurrentNodeParameter('euOnly') as boolean) ?? false;
				const baseUrl = euOnly ? EU_BASE_URL : GLOBAL_BASE_URL;

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'edenAiApi',
					{
						method: 'GET',
						url: `${baseUrl}/embeddings/models`,
						json: true,
					},
				)) as { data?: Array<{ id: string }> };

				return (response.data ?? [])
					.map((m) => ({ name: m.id, value: m.id }))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const credentials = await this.getCredentials('edenAiApi');

		const euOnly = this.getNodeParameter('euOnly', itemIndex, false) as boolean;
		const model = this.getNodeParameter('model', itemIndex, '') as string;
		const options = this.getNodeParameter('options', itemIndex, {}) as {
			batchSize?: number;
			dimensions?: number;
			stripNewLines?: boolean;
		};

		const baseUrl = euOnly ? EU_BASE_URL : (credentials.url as string);

		const embeddings = new OpenAIEmbeddings({
			apiKey: credentials.apiKey as string,
			model,
			dimensions:
				options.dimensions && options.dimensions > 0 ? options.dimensions : undefined,
			batchSize: options.batchSize,
			stripNewLines: options.stripNewLines,
			configuration: {
				baseURL: baseUrl,
			},
		});

		return {
			response: embeddings,
		};
	}
}

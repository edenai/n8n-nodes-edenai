import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodePropertyOptions,
	type INodeType,
	type INodeTypeDescription,
	type IRequestOptions,
	type JsonObject,
} from 'n8n-workflow';

const GLOBAL_BASE_URL = 'https://api.edenai.run/v3';
const EU_BASE_URL = 'https://api.eu.edenai.run/v3';

interface SubfeatureInfo {
	name: string;
	fullname?: string;
	mode?: 'sync' | 'async';
}

interface FeatureInfo {
	name: string;
	fullname?: string;
	subfeatures?: SubfeatureInfo[];
}

interface UniversalAiResponse {
	status?: string;
	output?: {
		image_resource_url?: string;
		audio_resource_url?: string;
		document_resource_url?: string;
		[key: string]: unknown;
	};
	error?: { message?: string; provider_status_code?: number | null } | null;
	[key: string]: unknown;
}

export class ExpertModelsEdenAi implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Eden AI Expert Models',
		name: 'expertModelsEdenAi',
		icon: 'file:edenai.svg',
		group: ['transform'],
		version: [1],
		description:
			'Run Eden AI expert models (OCR, text analysis, image, audio, translation) through the Universal AI endpoint',
		defaults: {
			name: 'Eden AI Expert Models',
		},
		codex: {
			resources: {
				primaryDocumentation: [
					{
						url: 'https://edenai.co/docs/v3/expert-models/listing-models',
					},
				],
			},
		},
		inputs: ['main'],
		outputs: ['main'],
		usableAsTool: true,
		credentials: [
			{
				name: 'edenAiApi',
				required: true,
			},
		],
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
				displayName: 'Feature Name or ID',
				name: 'feature',
				type: 'options',
				// Custom description is more informative than the generic dynamic-options boilerplate.
				// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-options
				description:
					'The expert-model category to use (e.g. text, ocr, image, translation, audio). Loaded live from Eden AI. <a href="https://edenai.co/docs/v3/expert-models/listing-models">Browse all features</a>.',
				typeOptions: {
					loadOptionsDependsOn: ['euOnly'],
					loadOptionsMethod: 'getFeatures',
				},
				default: '',
			},
			{
				displayName: 'Subfeature Name or ID',
				name: 'subfeature',
				type: 'options',
				// Custom description carries the sync-only caveat the generic boilerplate can't.
				// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-options
				description:
					'The specific capability within the feature. Asynchronous subfeatures (speech-to-text, multi-page OCR, video generation) are marked "(async)" and are polled to completion by default.',
				typeOptions: {
					loadOptionsDependsOn: ['euOnly', 'feature'],
					loadOptionsMethod: 'getSubfeatures',
				},
				default: '',
			},
			{
				displayName: 'Provider Name or ID',
				name: 'providerModel',
				type: 'options',
				// Custom description explains that the value is the full model path posted to the API.
				// eslint-disable-next-line n8n-nodes-base/node-param-description-wrong-for-dynamic-options
				description:
					'The provider (and optional model) handling the request. The selected value is the full feature/subfeature/provider[/model] string sent to Eden AI.',
				typeOptions: {
					loadOptionsDependsOn: ['euOnly', 'feature', 'subfeature'],
					loadOptionsMethod: 'getProviderModels',
				},
				default: '',
			},
			{
				displayName: 'Input Type',
				name: 'inputType',
				type: 'options',
				default: 'text',
				description: 'Whether this subfeature takes text or a file as its main input',
				options: [
					{
						name: 'File',
						value: 'file',
						description: 'For OCR, image analysis, and document translation',
					},
					{
						name: 'Text',
						value: 'text',
						description: 'For text analysis, prompts, translation, and text-to-speech',
					},
				],
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				default: '',
				description:
					'The text input (text to analyze or translate, the prompt for image generation, the text to synthesize, etc.)',
				displayOptions: {
					show: {
						inputType: ['text'],
					},
				},
			},
			{
				displayName: 'File Source',
				name: 'fileSource',
				type: 'options',
				default: 'url',
				description: 'How to provide the file for this request',
				displayOptions: {
					show: {
						inputType: ['file'],
					},
				},
				options: [
					{
						name: 'Binary Property',
						value: 'binary',
						description: 'Upload binary data from a previous node (uploaded to Eden AI automatically)',
					},
					{
						name: 'File ID',
						value: 'fileId',
						description: 'A file ID returned by a previous Eden AI upload',
					},
					{
						name: 'File URL',
						value: 'url',
						description: 'A publicly accessible http(s) URL',
					},
				],
			},
			{
				displayName: 'File URL',
				name: 'fileUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/document.pdf',
				description: 'Publicly accessible URL of the file to process',
				displayOptions: {
					show: {
						inputType: ['file'],
						fileSource: ['url'],
					},
				},
			},
			{
				displayName: 'File ID',
				name: 'fileId',
				type: 'string',
				default: '',
				description: 'The file_id (UUID) returned by a previous Eden AI file upload',
				displayOptions: {
					show: {
						inputType: ['file'],
						fileSource: ['fileId'],
					},
				},
			},
			{
				displayName: 'Input Binary Field',
				name: 'binaryProperty',
				type: 'string',
				default: 'data',
				hint: 'The name of the input binary field containing the file to upload',
				description:
					'Name of the binary property holding the file. It is uploaded to Eden AI and referenced by the resulting file ID.',
				displayOptions: {
					show: {
						inputType: ['file'],
						fileSource: ['binary'],
					},
				},
			},
			{
				displayName: 'Additional Input Fields',
				name: 'additionalInput',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				placeholder: 'Add Field',
				description:
					'Extra subfeature-specific input fields merged into the request (e.g. language, target_language, source_language, document_type, voice, resolution). Values that look like JSON (numbers, booleans, arrays, objects) are parsed; everything else is sent as a string.',
				options: [
					{
						name: 'field',
						displayName: 'Field',
						values: [
							{
								displayName: 'Name',
								name: 'key',
								type: 'string',
								default: '',
								placeholder: 'target_language',
								description: 'Name of the input field',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								placeholder: 'fr',
								description: 'Value of the input field',
							},
						],
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Download File Output',
						name: 'downloadFileOutput',
						type: 'boolean',
						default: false,
						description:
							'Whether to download the generated file for features that return one (image generation, text-to-speech, document translation) and attach it as binary data',
					},
					{
						displayName: 'Fallback Models',
						name: 'fallbacks',
						type: 'string',
						default: '',
						placeholder: 'google,microsoft',
						description:
							'Comma-separated list of fallback providers (up to 3). Each is "provider[/model]" or a full "feature/subfeature/provider[/model]" path matching the primary. If the primary fails, Eden AI retries with each in order.',
					},
					{
						displayName: 'Max Wait Time (Ms)',
						name: 'maxWaitTime',
						type: 'number',
						default: 300000,
						description:
							'Async subfeatures only: how long to poll for the job result before timing out',
					},
					{
						displayName: 'Output Binary Field',
						name: 'outputBinaryProperty',
						type: 'string',
						default: 'data',
						description:
							'Name of the binary property to store the downloaded file under. Only used when Download File Output is enabled.',
					},
					{
						displayName: 'Poll Interval (Ms)',
						name: 'pollInterval',
						type: 'number',
						default: 4000,
						description: 'Async subfeatures only: delay between job status checks',
					},
					{
						displayName: 'Provider Params',
						name: 'providerParams',
						type: 'json',
						default: '{}',
						description:
							'Provider-specific parameters sent as provider_params. Takes precedence over the normalized input fields above.',
					},
					{
						displayName: 'Show Original Response',
						name: 'showOriginalResponse',
						type: 'boolean',
						default: false,
						description:
							'Whether to include the raw, unmodified provider response under original_response',
					},
					{
						displayName: 'Simplify Response',
						name: 'simplifyResponse',
						type: 'boolean',
						default: false,
						description:
							'Whether to return only the feature output instead of the full envelope (status, cost, provider, output)',
					},
					{
						displayName: 'Wait for Completion',
						name: 'waitForCompletion',
						type: 'boolean',
						default: true,
						description:
							'Whether to poll until an asynchronous job finishes and return its result (async subfeatures only). When off, the job handle (with public_id) is returned immediately so you can poll it yourself or receive a webhook.',
					},
					{
						displayName: 'Webhook URL',
						name: 'webhookUrl',
						type: 'string',
						default: '',
						placeholder: 'https://your-app.com/webhook',
						description:
							'Async subfeatures only: a URL Eden AI calls when the job completes. Sent as webhook_receiver.',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getFeatures(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const euOnly = (this.getCurrentNodeParameter('euOnly') as boolean) ?? false;
				const baseUrl = euOnly ? EU_BASE_URL : GLOBAL_BASE_URL;

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'edenAiApi',
					{
						method: 'GET',
						url: `${baseUrl}/info`,
						json: true,
					},
				)) as { features?: FeatureInfo[] };

				return (response.features ?? [])
					.map((f) => ({ name: f.fullname ?? f.name, value: f.name }))
					.sort((a, b) => a.name.localeCompare(b.name));
			},

			async getSubfeatures(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const euOnly = (this.getCurrentNodeParameter('euOnly') as boolean) ?? false;
				const feature = (this.getCurrentNodeParameter('feature') as string) ?? '';
				if (!feature) return [];

				const baseUrl = euOnly ? EU_BASE_URL : GLOBAL_BASE_URL;

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'edenAiApi',
					{
						method: 'GET',
						url: `${baseUrl}/info/${feature}`,
						json: true,
					},
				)) as FeatureInfo;

				return (response.subfeatures ?? [])
					.map((sf) => {
						const label = sf.fullname ?? sf.name;
						const isAsync = (sf.mode ?? 'sync') === 'async';
						return { name: isAsync ? `${label} (async)` : label, value: sf.name };
					})
					.sort((a, b) => a.name.localeCompare(b.name));
			},

			async getProviderModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const euOnly = (this.getCurrentNodeParameter('euOnly') as boolean) ?? false;
				const feature = (this.getCurrentNodeParameter('feature') as string) ?? '';
				const subfeature = (this.getCurrentNodeParameter('subfeature') as string) ?? '';
				if (!feature || !subfeature) return [];

				const baseUrl = euOnly ? EU_BASE_URL : GLOBAL_BASE_URL;

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'edenAiApi',
					{
						method: 'GET',
						url: `${baseUrl}/info/${feature}/${subfeature}`,
						json: true,
					},
				)) as { models?: Array<{ model: string }> };

				return (response.models ?? [])
					.map((m) => ({ name: m.model, value: m.model }))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('edenAiApi');

		for (let i = 0; i < items.length; i++) {
			try {
				const euOnly = this.getNodeParameter('euOnly', i, false) as boolean;
				const baseUrl = euOnly ? EU_BASE_URL : (credentials.url as string);
				const model = this.getNodeParameter('providerModel', i, '') as string;

				if (!model) {
					throw new NodeOperationError(
						this.getNode(),
						'No model selected. Pick a feature, subfeature and provider.',
						{ itemIndex: i },
					);
				}

				const inputType = this.getNodeParameter('inputType', i, 'text') as string;
				const input: Record<string, unknown> = {};

				if (inputType === 'text') {
					const text = this.getNodeParameter('text', i, '') as string;
					if (text) input.text = text;
				} else {
					const fileSource = this.getNodeParameter('fileSource', i, 'url') as string;

					if (fileSource === 'url') {
						const fileUrl = this.getNodeParameter('fileUrl', i, '') as string;
						if (fileUrl) input.file = fileUrl;
					} else if (fileSource === 'fileId') {
						const fileId = this.getNodeParameter('fileId', i, '') as string;
						if (fileId) input.file = fileId;
					} else {
						const binaryProperty = this.getNodeParameter('binaryProperty', i, 'data') as string;
						const binaryData = this.helpers.assertBinaryData(i, binaryProperty);
						const buffer = await this.helpers.getBinaryDataBuffer(i, binaryProperty);

						const uploadOptions: IRequestOptions = {
							method: 'POST',
							url: `${baseUrl}/upload`,
							formData: {
								file: {
									value: buffer,
									options: {
										filename: binaryData.fileName ?? 'file',
										contentType: binaryData.mimeType,
									},
								},
							},
							json: true,
						};

						const uploadResponse = (await this.helpers.requestWithAuthentication.call(
							this,
							'edenAiApi',
							uploadOptions,
						)) as { file_id?: string };

						if (!uploadResponse?.file_id) {
							throw new NodeOperationError(
								this.getNode(),
								'File upload did not return a file_id.',
								{ itemIndex: i },
							);
						}
						input.file = uploadResponse.file_id;
					}
				}

				const additionalFields = this.getNodeParameter(
					'additionalInput.field',
					i,
					[],
				) as Array<{ key: string; value: string }>;
				for (const field of additionalFields) {
					if (!field.key) continue;
					let value: unknown = field.value;
					try {
						value = JSON.parse(field.value);
					} catch {
						// Not valid JSON — keep the raw string.
					}
					input[field.key] = value;
				}

				const options = this.getNodeParameter('options', i, {}) as {
					fallbacks?: string;
					providerParams?: string;
					showOriginalResponse?: boolean;
					simplifyResponse?: boolean;
					downloadFileOutput?: boolean;
					outputBinaryProperty?: string;
					waitForCompletion?: boolean;
					pollInterval?: number;
					maxWaitTime?: number;
					webhookUrl?: string;
				};

				const body: IDataObject = { model, input: input as IDataObject };

				if (options.fallbacks) {
					const fallbackList = options.fallbacks
						.split(',')
						.map((f) => f.trim())
						.filter((f) => f.length > 0)
						.slice(0, 3);
					if (fallbackList.length > 0) {
						body.fallbacks = fallbackList;
					}
				}

				if (options.providerParams) {
					try {
						body.provider_params = JSON.parse(options.providerParams);
					} catch (err) {
						throw new NodeOperationError(
							this.getNode(),
							`Invalid Provider Params JSON: ${(err as Error).message}`,
							{ itemIndex: i },
						);
					}
				}

				if (options.showOriginalResponse) {
					body.show_original_response = true;
				}

				// Async subfeatures (the path's 2nd segment ends with "_async") use the
				// /universal-ai/async endpoint: the launch returns a public_id, then we poll.
				const isAsync = (model.split('/')[1] ?? '').endsWith('_async');

				let response: UniversalAiResponse;
				// True when an async job is launched but NOT awaited (waitForCompletion=false):
				// the launch handle (with public_id) must be returned as-is, never simplified away.
				let returnedImmediately = false;

				if (isAsync) {
					// TODO: confirm the exact webhook field name ("webhook_receiver") with Eden AI
					// before release — set defensively for now.
					if (options.webhookUrl) {
						body.webhook_receiver = options.webhookUrl;
					}

					const launch = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'edenAiApi',
						{ method: 'POST', url: `${baseUrl}/universal-ai/async`, body, json: true },
					)) as UniversalAiResponse & { public_id?: string };

					const jobId = launch.public_id;
					if (!jobId) {
						throw new NodeApiError(this.getNode(), launch as unknown as JsonObject, {
							message: 'Async job launch did not return a public_id.',
							itemIndex: i,
						});
					}

					if (options.waitForCompletion === false) {
						// Return the job handle immediately; caller polls it or uses the webhook.
						response = launch;
						returnedImmediately = true;
					} else {
						const pollInterval = options.pollInterval ?? 4000;
						const maxWaitTime = options.maxWaitTime ?? 300000;
						const deadline = Date.now() + maxWaitTime;
						let polled = launch as UniversalAiResponse;
						while ((polled.status ?? 'processing') === 'processing') {
							if (Date.now() > deadline) {
								throw new NodeOperationError(
									this.getNode(),
									`Async job ${jobId} did not finish within ${maxWaitTime} ms.`,
									{ itemIndex: i },
								);
							}
							await new Promise((resolve) => setTimeout(resolve, pollInterval));
							polled = (await this.helpers.httpRequestWithAuthentication.call(
								this,
								'edenAiApi',
								{ method: 'GET', url: `${baseUrl}/universal-ai/async/${jobId}`, json: true },
							)) as UniversalAiResponse;
						}
						response = polled;
					}
				} else {
					response = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'edenAiApi',
						{ method: 'POST', url: `${baseUrl}/universal-ai`, body, json: true },
					)) as UniversalAiResponse;
				}

				// Universal AI returns HTTP 200 with status:"fail" for feature-level failures.
				if (response.status === 'fail' || (response.error && response.status !== 'processing')) {
					const message = response.error?.message ?? 'Eden AI returned status "fail".';
					throw new NodeApiError(this.getNode(), response as unknown as JsonObject, {
						message,
						itemIndex: i,
					});
				}

				const json: IDataObject =
					options.simplifyResponse && !returnedImmediately
						? ((response.output as IDataObject) ?? {})
						: (response as unknown as IDataObject);

				const newItem: INodeExecutionData = { json, pairedItem: { item: i } };

				if (options.downloadFileOutput && !returnedImmediately) {
					const output = response.output ?? {};
					const resourceUrl =
						output.image_resource_url ??
						output.audio_resource_url ??
						output.document_resource_url;

					if (resourceUrl) {
						const fileBuffer = (await this.helpers.httpRequest({
							method: 'GET',
							url: resourceUrl,
							encoding: 'arraybuffer',
						})) as Buffer;
						const propertyName = options.outputBinaryProperty ?? 'data';
						newItem.binary = {};
						if (items[i].binary) {
							Object.assign(newItem.binary, items[i].binary);
						}
						newItem.binary[propertyName] = await this.helpers.prepareBinaryData(
							Buffer.from(fileBuffer),
						);
					}
				}

				returnData.push(newItem);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				if (error instanceof NodeApiError || error instanceof NodeOperationError) {
					throw error;
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

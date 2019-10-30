const logger = require('@financial-times/lambda-logger');
const fetch = require('node-fetch');
const httpError = require('http-errors');

const { BIZ_OPS_API_URL, BIZ_OPS_API_KEY } = process.env;

const extractErrorMessageFromJson = json => {
	let errorMessage;

	try {
		errorMessage = json.errors
			? json.errors.map(error => error.message).join('\n')
			: json.error;
	} catch (err) {
		errorMessage = json.statusText;
	}
	return errorMessage;
};

const extractErrorMessageFromResponse = async response =>
	extractErrorMessageFromJson(await response.json());

const logAndThrowError = async (status, message, props) => {
	const error = httpError(status, message);
	logger.error(
		{
			error,
			event: 'BIZ_OPS_API_FAILURE',
		},
		props,
		`Biz Ops api call failed with status ${status}`,
	);
	throw error;
};

const graphql = (query, variables = {}) =>
	fetch(`${BIZ_OPS_API_URL}/graphql`, {
		method: 'POST',
		headers: {
			'x-api-key': BIZ_OPS_API_KEY,
			'client-id': 'biz-ops-runbook-md',
			'content-type': 'application/json',
		},
		body: JSON.stringify({ query, variables }),
	}).then(async response => {
		if (!response.ok) {
			await logAndThrowError(response, {
				method: 'graphql',
			});
		}
		const json = await response.json();
		if (json.errors) {
			logAndThrowError(999, extractErrorMessageFromJson(json), { query });
		}
		return json;
	});

const updateSystemRepository = async (systemCode, gitRepositoryName) => {
	const options = {
		method: 'PATCH',
		headers: {
			'x-api-key': BIZ_OPS_API_KEY,
			'client-id': 'biz-ops-runbook-md',
			'content-type': 'application/json',
		},
		body: JSON.stringify({
			repositories: [`github:${gitRepositoryName}`],
		}),
	};
	const response = await fetch(
		`${BIZ_OPS_API_URL}/v2/node/System/${encodeURIComponent(
			systemCode,
		)}?relationshipAction=merge`,
		options,
	);
	if (!response.ok) {
		logAndThrowError(
			response.status,
			await extractErrorMessageFromResponse(response),
			{
				systemCode,
				method: `updateRelationships`,
			},
		);
	}

	return response.json();
};

const systemHeadRequest = async code => {
	const options = {
		method: 'HEAD',
		headers: {
			'x-api-key': BIZ_OPS_API_KEY,
			'client-id': 'biz-ops-runbook-md',
			'content-type': 'application/json',
		},
	};
	const response = await fetch(
		`${BIZ_OPS_API_URL}/v2/node/System/${encodeURIComponent(code)}`,
		options,
	);
	if (!response.ok) {
		logAndThrowError(response.status, response.headers.get('debug-error'), {
			code,
			method: 'head',
		});
	}
};

module.exports = {
	graphql,
	systemHeadRequest,
	updateSystemRepository,
};

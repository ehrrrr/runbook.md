const logger = require('@financial-times/lambda-logger');
const fetch = require('node-fetch');
const httpError = require('http-errors');

const { BIZ_OPS_API_URL, BIZ_OPS_API_KEY } = process.env;

const extractErrorMessage = async response => {
	if (response.json) {
		response = await response.json();
	}
	let errorMessage;
	try {
		errorMessage = response.errors
			? response.errors.map(error => error.message).join('\n')
			: response.error;
	} catch (err) {
		errorMessage = response.statusText;
	}
	return httpError(response.status, errorMessage);
};

const logAndThrowError = async (response, props) => {
	const error = await extractErrorMessage(response);
	logger.error(
		{
			error,
			event: 'BIZ_OPS_API_FAILURE',
		},
		props,
		`Biz Ops api call failed with status ${response.status}`,
	);
	throw error;
};

const graphql = (query, variables = {}) =>
	fetch(`${BIZ_OPS_API_URL}/graphql`, {
		method: 'GET',
		headers: {
			'x-api-key': BIZ_OPS_API_KEY,
			'client-id': 'biz-ops-runbook-md',
			'content-type': 'application/json',
		},
		body: JSON.stringify({ query, variables }),
	}).then(async response => {
		if (!response.ok) {
			await logAndThrowError(response, {
				code,
				method: 'read',
			});
		}
		const json = await response.json();
		if (json.errors) {
			logAndThrowError(json);
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
		await logAndThrowError(response, {
			systemCode,
			method: `updateRelationships`,
		});
	}

	return response.json();
};

module.exports = {
	readSystem,
	updateSystemRepository,
};

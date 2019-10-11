const logger = require('@financial-times/lambda-logger');
const fetch = require('node-fetch');
const httpError = require('http-errors');

const { BIZ_OPS_API_URL, BIZ_OPS_API_KEY } = process.env;

const extractErrorMessage = async response => {
	let errorMessage;
	try {
		const errors = await response.json();
		errorMessage = errors.errors
			? errors.errors.map(error => error.message).join('\n')
			: errors.error;
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

const readSystem = async code => {
	const options = {
		method: 'GET',
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
		await logAndThrowError(response, {
			code,
			method: 'read',
		});
	}

	return response.json();
};

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

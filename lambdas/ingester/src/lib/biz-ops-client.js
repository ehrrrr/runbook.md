const https = require('https');
const logger = require('@financial-times/lambda-logger');
const fetch = require('node-fetch');
const httpError = require('http-errors');

const agent = new https.Agent({ keepAlive: true });

const { BIZ_OPS_API_URL, BIZ_OPS_API_KEY } = process.env;

const headers = {
	'x-api-key': BIZ_OPS_API_KEY,
	'client-id': 'biz-ops-runbook-md',
	'content-type': 'application/json',
};

const getSystemPath = systemCode =>
	`${BIZ_OPS_API_URL}/v2/node/System/${encodeURIComponent(systemCode)}`;

const extractErrorMessageFromJson = ({ errors, error, statusText }) => {
	try {
		return errors ? errors.map(e => e.message).join('\n') : error;
	} catch (err) {
		return statusText;
	}
};

const extractErrorMessageFromResponse = async response =>
	extractErrorMessageFromJson(await response.json());

const logAndThrowError = async (status, message, props, log) => {
	const error = httpError(status, message);
	log.error(
		{
			error,
			event: 'BIZ_OPS_API_FAILURE',
			...props,
		},
		`Biz Ops api call failed with status ${status}`,
	);
	throw error;
};

const wrappedFetch = async ({
	name,
	method,
	url,
	payload,
	expectedStatusCodes = [200],
}) => {
	const options = {
		method,
		body: JSON.stringify(payload),
		headers,
		agent,
		timeout: 2000,
	};
	const logger = logger.child({ method, url });
	try {
		const response = await fetch(url, options);
		if (!response.ok) {
			await logAndThrowError(response, {
				method: 'graphql',
			});
		}
		const { status, statusText } = fetchResponse;
		if (!expectedStatusCodes.includes(status)) {
			logger.error({ status }, `Failed with ${status}: ${statusText}`);
			throw httpError(
				status,
				`${name} ${method} to ${url} failed with ${statusText}`,
			);
		}
		logger.info({ status }, `Responded with ${status}: ${statusText}`);
		return { status, json: await fetchResponse.json() };
	} catch (error) {
		logger.error({ error, status: 500 });
		throw httpError(500, `BadRequest: ${name} ${method} to ${url}`);
	}
};

const graphql = (query, variables = {}) =>
	fetch(`${BIZ_OPS_API_URL}/graphql`, {
		method: 'POST',
		headers,
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
		headers,
		body: JSON.stringify({
			repositories: [`github:${gitRepositoryName}`],
		}),
	};
	const response = await fetch(
		`${getSystemPath(systemCode)}?relationshipAction=merge`,
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

const systemHeadRequest = async systemCode => {
	const options = {
		method: 'HEAD',
	};
	const response = await fetch(getSystemPath(systemCode), options);
	if (!response.ok) {
		logAndThrowError(response.status, response.headers.get('debug-error'), {
			systemCode,
			method: 'head',
		});
	}
};

module.exports = {
	graphql,
	systemHeadRequest,
	updateSystemRepository,
};

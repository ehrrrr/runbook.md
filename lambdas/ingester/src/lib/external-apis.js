const logger = require('@financial-times/lambda-logger');
const httpError = require('http-errors');
const nodeFetch = require('isomorphic-fetch');
const https = require('https');

const keepAliveAgent = new https.Agent({ keepAlive: true });

const API_KEY_HEADER_NAME = 'x-api-key';

const callExternalApi = async ({
	name,
	method,
	url,
	payload,
	headers,
	expectedStatuses = [200],
}) => {
	const options = {
		method,
		body: JSON.stringify(payload),
		headers,
	};
	const fetchResponse = await nodeFetch(url, {
		...options,
		agent: keepAliveAgent,
	});
	if (!expectedStatuses.includes(fetchResponse.status)) {
		logger.error(
			{ event: `Attempt to ${method} to ${url}`, options },
			`Failed with ${fetchResponse.status}:${fetchResponse}`,
		);
		throw httpError(
			fetchResponse.status,
			`Attempt to access ${name} ${url} failed with ${fetchResponse.statusText}`,
		);
	}
	// must not log confidential runbook data and PII...
	delete options.body;
	if (options.headers) {
		delete options.headers[API_KEY_HEADER_NAME];
	}
	logger.info(
		{ event: `${method} request to ${url}`, options },
		`Waiting for ${name} response`,
	);
	return { status: fetchResponse.status, json: await fetchResponse.json() };
};

const validate = async request =>
	callExternalApi({
		name: 'SOS validate',
		method: 'POST',
		url: `${process.env.SOS_URL}/api/v1/validate`,
		payload: request,
	}).then(({ status, json }) => {
		// Remove any errors which are not directly attributable to the System properties
		Object.entries(json.errorProperties).forEach(
			([name, errorProperties]) => {
				if (
					errorProperties.filter(
						({ key }) => key.slice(0, 7) === 'System/',
					).length === 0
				) {
					delete json.errorMessages[name];
				}
			},
		);
		return { status, json };
	});

const updateBizOps = async (username, apiKey, systemCode, content) => {
	const queryString = `?relationshipAction=replace&lockFields=${Object.keys(
		content,
	)
		.map(name => name)
		.join(',')}`;
	return callExternalApi({
		name: 'Biz Ops Update',
		method: 'PATCH',
		url: `${process.env.BIZ_OPS_API_URL}/v2/node/System/${systemCode}${queryString}`,
		payload: content,
		headers: {
			[API_KEY_HEADER_NAME]: apiKey,
			'client-id': 'biz-ops-runbook-md',
			'content-type': 'application/json',
			'client-user-id': username,
		},
		expectedStatuses: [200, 400, 403],
	});
};

const queryBizOps = async (username, apiKey, query) => {
	return callExternalApi({
		name: 'Biz Ops GraphQL',
		method: 'POST',
		url: `${process.env.BIZ_OPS_API_URL}/graphql`,
		payload: { query },
		headers: {
			[API_KEY_HEADER_NAME]: apiKey,
			'client-id': 'biz-ops-runbook-md',
			'content-type': 'application/json',
			'client-user-id': username,
		},
		expectedStatuses: [200, 404],
	});
};

module.exports = {
	validate,
	queryBizOps,
	updateBizOps,
};

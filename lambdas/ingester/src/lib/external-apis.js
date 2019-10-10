const https = require('https');
const lambdaLogger = require('@financial-times/lambda-logger');
const httpError = require('http-errors');
const nodeFetch = require('isomorphic-fetch');

const keepAliveAgent = new https.Agent({ keepAlive: true });

const { BIZ_OPS_API_URL, SOS_URL } = process.env;

const callExternalApi = async ({
	name,
	method,
	url,
	payload,
	headers,
	expectedStatusCodes = [200],
}) => {
	const options = {
		method,
		body: JSON.stringify(payload),
		headers,
		agent: keepAliveAgent,
		timeout: 2000,
	};
	const event = `${name}_${method}`;
	const logger = lambdaLogger.child({ event, url });
	try {
		const fetchResponse = await nodeFetch(url, options);
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

const validate = payload =>
	callExternalApi({
		name: 'SOS_VALIDATE',
		method: 'POST',
		url: `${SOS_URL}/api/v1/validate`,
		payload,
	}).then(({ status, json }) => {
		// Remove any errors which are not directly attributable to the System properties
		Object.entries(json.errorProperties).forEach(([name, properties]) => {
			if (!properties.some(({ key }) => /^System\//.test(key))) {
				delete json.errorMessages[name];
			}
		});
		return { status, json };
	});

const getBizOpsHeaders = apiKey => {
	const headers = {
		'x-api-key': apiKey,
		'client-id': 'biz-ops-runbook-md',
		'content-type': 'application/json',
	};
	return headers;
};

const updateBizOps = (apiKey, systemCode, payload) =>
	callExternalApi({
		name: 'BIZ_OPS_REST',
		method: 'PATCH',
		url: `${BIZ_OPS_API_URL}/v2/node/System/${systemCode}?relationshipAction=replace&lockFields=${Object.keys(
			payload,
		).join(',')}`,
		payload,
		headers: getBizOpsHeaders(apiKey),
		expectedStatusCodes: [200, 400, 403],
	});

const queryBizOps = (apiKey, query) =>
	callExternalApi({
		name: 'BIZ_OPS_GRAPHQL',
		method: 'POST',
		url: `${BIZ_OPS_API_URL}/graphql`,
		payload: { query },
		headers: getBizOpsHeaders(apiKey),
		expectedStatusCodes: [200, 404],
	});

module.exports = {
	validate,
	queryBizOps,
	updateBizOps,
};

const logger = require('@financial-times/lambda-logger');
const querystring = require('qs');

const { renderPage } = require('./lib/response');
const { createLambda } = require('./lib/lambda');
const { generate } = require('./lib/generate-from-biz-ops');
const { ingest } = require('./commands/ingest');

const template = require('./templates/form-input-page');
const { default: placeholder } = require('../../../docs/example-runbook.md');

const formHandler = async event => {
	logger.info({ event: 'RUNBOOK_INGEST_FORM_REQUEST' });
	const { systemCode } = event.queryStringParameters || {};
	let content;
	let systemCodeExists = false;
	try {
		content = await generate(systemCode);
		systemCodeExists = true;
	} catch (error) {
		// system code does not exist in Biz-Ops
		content = null;
	}
	return renderPage(
		template,
		{
			layout: 'docs',
			placeholder,
			systemCode,
			systemCodeExists,
			content,
		},
		event,
	);
};

const formOutputHandler = async event => {
	logger.info({ event: 'RUNBOOK_INGEST_FORM_RESPONSE' });

	const formData = event.body;
	const jsonFormData = querystring.parse(formData);
	const responseProperties = { status: 200 };

	try {
		logger.info({ event: 'MANUAL_RUNBOOK_CHECK_START' });
		const ingestJson = await ingest(jsonFormData);
		logger.info({
			event: 'MANUAL_RUNBOOK_CHECK_SUCCESFUL',
			response: ingestJson,
		});
		Object.assign(responseProperties, ingestJson);
	} catch (error) {
		Object.assign(responseProperties, { status: 400, ...error });
		logger.error({
			event: 'MANUAL_RUNBOOK_CHECK_FAILED',
			error,
		});
	}

	return renderPage(
		template,
		{
			layout: 'docs',
			status: responseProperties.status,
			message: responseProperties.message,
			readOnly: true,
			...jsonFormData,
			...responseProperties.details,
		},
		event,
	);
};

const handler = async event =>
	event.httpMethod === 'POST' ? formOutputHandler(event) : formHandler(event);

exports.handler = createLambda(handler);

const logger = require('@financial-times/lambda-logger');
const render = require('./render');

const CONTENT_TYPE = 'Content-Type';

const errorResponse = responseHandler => (error, event, context) => {
	const statusCode = error.statusCode || 500;
	logger.error(
		{ error, path: event.path, awsRequestId: context.awsRequestId },
		'Unhandled error',
	);
	return responseHandler(statusCode, error.message);
};

const json = (statusCode = 200, body) => ({
	statusCode,
	body: JSON.stringify(body),
	headers: {
		[CONTENT_TYPE]: 'application/json',
	},
});

const errorHtml = errorResponse(json);
const errorJson = errorResponse(json);

const renderPage = (template, data, event, statusCode = 200) => {
	const user = event && event.isSignedIn && event.s3oUsername;
	return {
		statusCode,
		body: render(template, Object.assign(data, { user })),
		headers: {
			'Content-Type': 'text/html',
			'Cache-Control':
				'private, no-cache, no-store, must-revalidate, max-age=0',
		},
	};
};

const responseHeaders = {
	'Content-Type': 'application/json',
	'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0',
};

const htmlResponse = ({ status, message, details }) => ({
	statusCode: status,
	body: JSON.stringify({ message, ...details }),
	headers: responseHeaders,
});

module.exports = {
	htmlResponse,
	errorHtml,
	errorJson,
	json,
	renderPage,
};

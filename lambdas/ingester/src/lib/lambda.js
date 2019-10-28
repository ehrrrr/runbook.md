const { omit } = require('lodash');
const logger = require('@financial-times/lambda-logger');
const s3o = require('@financial-times/s3o-lambda');
const httpError = require('http-errors');
const schema = require('./get-configured-schema');
const responseHelper = require('./response');
const config = require('./config');

const s3oHandler = (loggerInstance, event, callback) =>
	s3o(event, callback, {
		protocol: config.get('IS_LAMBDA') ? 'https' : 'http',
		getHost: config.get('BASE_HOST'),
	}).catch(error => {
		loggerInstance.error({ error }, 'S3o error');
		throw error;
	});

const formatEventForLogs = event => ({
	region: process.env.AWS_REGION || 'unknown',
	...omit(event, [
		'requestContext',
		'headers',
		'stageVariables',
		'isOffline',
		'Records',
	]),
});

const createLambda = (
	handler,
	{ requireS3o = true, errorHandler = responseHelper.errorHtml } = {},
) => async (event, context = {}) => {
	context.callbackWaitsForEmptyEventLoop = false;
	if ('warmUp' in event) {
		return Promise.resolve({
			statusCode: 200,
			body: { message: 'warm up call' },
		});
	}

	await schema.refresh();
	// Decode path parameters parameters as this isn't done by API Gateway (Though it does do query params)
	// See https://github.com/dherault/serverless-offline/issues/265 for discusison
	if (event.pathParameters) {
		Object.keys(event.pathParameters).forEach(key => {
			event.pathParameters[key] = decodeURIComponent(
				event.pathParameters[key],
			);
		});
	}
	let s3oRedirectResponse;

	const invocationMetaData = formatEventForLogs(event);
	const loggerWithMetadata = logger.child(invocationMetaData);
	loggerWithMetadata.info('Inbound λ request');

	return Promise.resolve()
		.then(() => {
			const bypassS3o = process.env.BYPASS_S3O;

			if (requireS3o && !bypassS3o) {
				return s3oHandler(loggerWithMetadata, event, (...args) => {
					s3oRedirectResponse = [...args];
				});
			}
			return bypassS3o ? { isSignedIn: true } : { isSignedIn: undefined };
		})
		.then(result => {
			if (s3oRedirectResponse) {
				const [error, response] = s3oRedirectResponse;
				if (error) {
					loggerWithMetadata.info({ error }, 's3o errored');
					throw error;
				}
				loggerWithMetadata.info('s3o redirected');
				return response;
			}

			if (!result || result.isSignedIn === false) {
				throw httpError(401, 'Not signed in. Try deleting s3o cookies');
			}

			const { isSignedIn, username } = result;

			return handler(
				{ ...event, isSignedIn, s3oUsername: username },
				context,
			);
		})
		.catch(error => {
			loggerWithMetadata.error({ error }, 'Handler failed');
			if (error.status) {
				return errorHandler(error, event, context);
			}
			const errorWrapper = new Error('Internal server error');
			errorWrapper.cause = error;
			return errorHandler(errorWrapper, event, context);
		})
		.catch(error => {
			loggerWithMetadata.error({ error }, 'Error handler failed');
			throw error;
		});
};

module.exports = {
	createLambda,
};

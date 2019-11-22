const { generate } = require('./lib/generate-from-biz-ops');
const { createLambda } = require('./lib/lambda');

const handler = async event => {
	const { systemCode } = event.queryStringParameters;
	try {
		const body = await generate(systemCode);
		return {
			statusCode: 200,
			body,
		};
	} catch (error) {
		const { message, status = 500, code } = error;
		return {
			statusCode: status,
			body:
				code === 'parse-ok-system-code-not-found'
					? 'Please enter a valid system code. The system must exist in Biz-Ops.'
					: message,
		};
	}
};

exports.handler = createLambda(handler);

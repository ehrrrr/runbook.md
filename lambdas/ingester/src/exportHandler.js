const { generate } = require('./lib/generate-from-biz-ops');
const { createLambda } = require('./lib/lambda');

const handler = async event => {
	const { systemCode } = event.queryStringParameters;

	return {
		statusCode: 200,
		body: await generate(systemCode),
	};
};

exports.handler = createLambda(handler);

const { systemHeadRequest } = require('../../lib/biz-ops-client');
const { ingestError } = require('./errors');

const checkSystemCodeExists = async (systemCode, details) => {
	try {
		await systemHeadRequest(systemCode);
	} catch (error) {
		const code =
			error.status === 404
				? 'parse-ok-system-code-not-found'
				: 'parse-ok-biz-ops-api-error';
		throw ingestError(code, { details, error });
	}
};

module.exports = {
	checkSystemCodeExists,
};

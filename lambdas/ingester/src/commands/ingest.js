const stripHtmlComments = require('strip-html-comments');
const runbookMd = require('../lib/parser');
const { validate, updateBizOps } = require('../lib/external-apis');
const {
	updateSystemRepository,
	systemHeadRequest,
} = require('../lib/biz-ops-client');
const { transformCodesIntoNestedData } = require('../lib/code-validation');
const setActualLineNumber = require('../lib/set-actual-line-number');

const transformIngestedDetails = (
	parseResult,
	validationResult,
	writeResult,
	updateSystemRepositoryResult,
) => ({
	...(parseResult && {
		parseErrors: parseResult.errors,
		parseData: parseResult.data,
	}),
	...(validationResult && {
		validationErrors: validationResult.errorMessages,
		validationData: validationResult.percentages,
		weightedScore: Number(validationResult.weightedScore).toFixed(1),
	}),
	...(writeResult && { updatedFields: writeResult }),
	...(updateSystemRepositoryResult && {
		updadatedRepository: updateSystemRepositoryResult,
	}),
});

const decorateError = props => {
	const error = new Error();
	Object.assign(error, { ...props });
	return error;
};

const checkSystemCodeExists = async (systemCode, details) => {
	try {
		await systemHeadRequest(systemCode);
	} catch (e) {
		let message;
		let code;
		if (e.status === 404) {
			message = 'Biz-Ops update skipped: system code not found.';
			code = 'parse-ok-system-code-not-found';
		} else {
			message = `Parse & validation complete. Biz-Ops update skipped. Error from Biz-Ops: ${e.message}.`;
			code = 'parse-ok-biz-ops-api-error';
		}
		throw decorateError({ message, code, details });
	}
};

const ingest = async payload => {
	const {
		content: rawRunbook,
		shouldWriteToBizOps,
		bizOpsApiKey,
		repository,
	} = payload;

	if (!rawRunbook) {
		throw decorateError({
			message: 'Runbook contents not supplied.',
			code: 'no-content',
		});
	}

	const content = stripHtmlComments(rawRunbook);
	// parse RUNBOOK.MD to JSON to return {data, errors}
	const parseResult = await runbookMd.parseRunbookString(content);
	if (parseResult && parseResult.errors) {
		setActualLineNumber(rawRunbook, content, parseResult.errors);
	}
	// validate codes in JSON against the Biz Ops to return {expandedData, errors}
	const expandedResult = await transformCodesIntoNestedData(parseResult.data);

	parseResult.errors.push(...expandedResult.errors);
	if (parseResult.errors.length) {
		throw decorateError({
			message: 'Failed to parse runbook.',
			code: 'parse-error',
			details: transformIngestedDetails(parseResult),
		});
	}

	// validate against SOS ruleset
	const { json: validationResult } = await validate(
		expandedResult.expandedData,
	);

	const details = transformIngestedDetails(parseResult, validationResult);

	const systemCode =
		(details.parseData && details.parseData.code) || payload.systemCode;

	if (!shouldWriteToBizOps || shouldWriteToBizOps === 'no') {
		return {
			message: 'Parse & validation complete. Biz-Ops update skipped.',
			code: 'parse-ok-update-skipped',
			details,
		};
	}

	// we don't need systemCode until this point
	if (!systemCode) {
		throw decorateError({
			message:
				'Parse & validation complete. Biz-Ops update skipped (no system code supplied).',
			code: 'parse-ok-systemCode-missing',
			details,
		});
	}

	if (!bizOpsApiKey) {
		throw decorateError({
			message:
				'Parse & validation complete. Biz-Ops update skipped (no API key supplied).',
			code: 'parse-ok-apiKey-missing',
			details,
		});
	}

	// avoid to create non-existing system in BizOps
	await checkSystemCodeExists(systemCode, details);

	const { status, json: response } = await updateBizOps(
		bizOpsApiKey,
		systemCode,
		parseResult.data,
	);
	if (status !== 200) {
		throw decorateError({
			status,
			message: `Parse & validation complete. Biz-Ops update failed (status ${status}).`,
			code: 'parse-ok-update-error',
			response,
			details,
		});
	}

	let updateSystemRepositoryResult;
	try {
		updateSystemRepositoryResult = await updateSystemRepository(
			systemCode,
			repository,
		);
	} catch (error) {
		throw decorateError({
			message: `Parse & validation complete. Biz-Ops update repository failed`,
			code: 'parse-ok-update-repository-error',
			updateSystemRepositoryResult,
			details,
		});
	}

	return {
		status,
		message: `Parse & validation complete. Biz-Ops update successful.`,
		code: 'parse-ok-update-ok',
		details: transformIngestedDetails(
			parseResult,
			validationResult,
			response,
			updateSystemRepositoryResult,
		),
	};
};

module.exports = {
	ingest,
};

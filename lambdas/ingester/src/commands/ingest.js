const stripHtmlComments = require('strip-html-comments');
const runbookMd = require('../lib/parser');
const { validate, updateBizOps } = require('../lib/external-apis');
const { transformCodesIntoNestedData } = require('../lib/code-validation');

const transformIngestedDetails = (
	parseResult,
	validationResult,
	writeResult,
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
});

const decorateError = props => {
	const error = new Error();
	Object.assign(error, { ...props });
	return error;
};

const ingest = async payload => {
	const {
		content: rawRunbook,
		shouldWriteToBizOps,
		systemCode,
		bizOpsApiKey,
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

	return {
		status,
		message: `Parse & validation complete. Biz-Ops update successful.`,
		code: 'parse-ok-update-ok',
		details: transformIngestedDetails(
			parseResult,
			validationResult,
			response,
		),
	};
};

module.exports = {
	ingest,
};

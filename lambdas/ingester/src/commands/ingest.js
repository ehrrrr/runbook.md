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

const ingest = async (username, payload) => {
	const { content, writeToBizOps, systemCode, bizOpsApiKey } = payload;
	if (!content) {
		throw decorateError({ message: 'Please supply RUNBOOK.md content' });
	}
	// parse RUNBOOK.MD to JSON to return {data, errors}
	const parseResult = await runbookMd.parseRunbookString(content);
	// validate codes in JSON against the Biz Ops to return {expandedData, errors}
	const expandedResult = await transformCodesIntoNestedData(
		username,
		parseResult.data,
	);

	parseResult.errors.push(...expandedResult.errors);
	if (parseResult.errors.length) {
		throw decorateError({
			message: 'Parse Failures. Please correct and resubmit',
			details: transformIngestedDetails(parseResult),
		});
	}

	// validate against SOS ruleset
	const { json: validationResult } = await validate(
		expandedResult.expandedData,
	);

	const details = transformIngestedDetails(parseResult, validationResult);

	if (!writeToBizOps || writeToBizOps === 'no') {
		return {
			message:
				'Parse & Validation Complete. Biz Ops Was NOT Updated as you did not enable the writeToBizOps flag.',
			details,
		};
	}

	// we don't need systemCode until this point
	if (!systemCode) {
		throw decorateError({
			message: 'Please supply a systemCode',
			details,
		});
	}

	if (!bizOpsApiKey) {
		throw decorateError({
			message: 'Please supply a Biz-Ops API key',
			details,
		});
	}

	const { status, json: response } = await updateBizOps(
		username,
		bizOpsApiKey,
		systemCode,
		parseResult.data,
	);

	if (status !== 200) {
		return decorateError({
			status,
			message: `Biz Ops update failed (status ${status})`,
			response,
			details,
		});
	}

	return {
		status,
		message: `Biz Ops has been updated.`,
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

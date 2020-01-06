const stripHtmlComments = require('strip-html-comments');
const RunbookMd = require('../lib/parser');
const { validate, updateBizOps } = require('../lib/external-apis');
const { updateSystemRepository } = require('../lib/biz-ops-client');
const { setActualLineNumber } = require('./ingest/set-actual-line-number');
const { transformCodesIntoNestedData } = require('./ingest/code-validation');
const { transformSOSResult } = require('./ingest/details');
const { ingestError, errorMessages } = require('./ingest/errors');
const { checkSystemCodeExists } = require('./ingest/system-code-check');

const parseAndValidate = async rawRunbook => {
	if (!rawRunbook) {
		throw ingestError('no-content');
	}

	// 1. parse RUNBOOK.MD to JSON
	// the parser doesn't support comments
	const content = stripHtmlComments(rawRunbook);
	// returns { data, errors }
	const {
		data: parseData,
		errors: parseErrors,
	} = await RunbookMd.parseMarkdownString(content);
	// comments are stripped, so adjust the line count
	if (parseErrors) {
		setActualLineNumber(rawRunbook, content, parseErrors);
	}

	// 2. validate codes in JSON against the Biz Ops schema
	// returns { expandedData, errors }
	const {
		expandedData,
		errors: structuralErrors,
	} = await transformCodesIntoNestedData(parseData);

	parseErrors.push(...structuralErrors);

	const details = { parseData, parseErrors };
	if (parseErrors.length) {
		throw ingestError('parse-error', { details });
	}

	// 3. validate against SOS rules
	const { json: sosResponse } = await validate(expandedData);
	Object.assign(details, transformSOSResult(sosResponse));
	return details;
};

const ingest = async payload => {
	const {
		shouldWriteToBizOps,
		bizOpsApiKey,
		repository,
		details = await parseAndValidate(payload.content),
	} = payload;

	const { parseData = {} } = details;

	// 1. check if the runbook specifies a system code
	const systemCode = parseData.code || payload.systemCode;
	const commonResponseProperties = { systemCode, details };

	// 2. if we don't need to update Biz Ops, we are done
	if (!shouldWriteToBizOps || shouldWriteToBizOps === 'no') {
		return {
			message: 'Parse & validation complete. Biz Ops update skipped.',
			code: 'parse-ok-update-skipped',
			...commonResponseProperties,
		};
	}

	// from this point on, we'll need a system code
	if (!systemCode) {
		throw ingestError(
			'parse-ok-systemCode-missing',
			commonResponseProperties,
		);
	}
	// and a valid API key for Biz Ops
	if (!bizOpsApiKey) {
		throw ingestError('parse-ok-apiKey-missing', commonResponseProperties);
	}

	// 3. check if the system code exists in Biz Ops
	// to avoid creating new systems
	await checkSystemCodeExists(systemCode, details);

	// 4. update Biz Ops
	const { status, json: writeResult } = await updateBizOps(
		bizOpsApiKey,
		systemCode,
		details.parseData,
	);
	if (status !== 200) {
		throw ingestError('parse-ok-update-error', {
			writeResult,
			status,
			...commonResponseProperties,
		});
	}

	// 5. update the system's repository in Biz Ops
	// this shouldn't fail the ingest
	let updateSystemRepositoryResult;
	try {
		updateSystemRepositoryResult = await updateSystemRepository(
			systemCode,
			repository,
		);
	} catch (error) {
		// don't throw, just assign the error to a response property
		const code = 'parse-ok-update-repository-error';
		updateSystemRepositoryResult = {
			code,
			message: errorMessages[code],
			error,
		};
	}

	Object.assign(details, { writeResult, updateSystemRepositoryResult });

	return {
		status,
		systemCode,
		message: `Parse & validation complete. Biz Ops update successful.`,
		code: 'parse-ok-update-ok',
		details,
	};
};

module.exports = { ingest };

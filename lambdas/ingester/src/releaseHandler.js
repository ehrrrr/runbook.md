/* eslint-disable no-await-in-loop */
const logger = require('@financial-times/lambda-logger');
const { chunk } = require('lodash');
const { sleep } = require('./lib/sleep');
const { get: getStoredResult, batchGet } = require('./lib/dynamodb-client');
const { createLambda } = require('./lib/lambda');
const { json } = require('./lib/response');
const { parseKinesisRecord } = require('./lib/kinesis-util');
const { ingest } = require('./commands/ingest');
const { filterValidRecord } = require('./commands/release/kinesis-filter');
const { postIssue } = require('./commands/release/post-issue');
const {
	parseRepositoryName,
} = require('./commands/release/parse-repository-name');

const {
	BIZ_OPS_API_KEY,
	DYNAMODB_CONCURRENCY = 5,
	THROTTLE_MILLISECONDS = 20,
} = process.env;

const fetchRunbooksByCommit = async (
	{
		commit,
		systemCode: recordSystemCode,
		gitRepositoryName,
		githubData: { htmlUrl: gitRefUrl } = {},
		user: { githubName } = {},
		eventID,
		loggerContext: { traceId } = {},
	},
	log,
) => {
	const childLogger = log.child({
		commit,
		systemCode: recordSystemCode,
		githubName,
		gitRefUrl,
		eventID,
		traceId,
	});

	childLogger.info({
		event: 'BEGIN_PROCESSING_RELEASE',
	});

	try {
		// 1. make sure we have a repository; format owner/repositoryName
		const repository = parseRepositoryName(gitRepositoryName, gitRefUrl);
		// 2. make sure we have some runbooks saved in DynamoDb
		const { runbookHashes } = await getStoredResult(repository, commit);

		if (!runbookHashes) {
			throw new Error(
				`Bailing: No runbooks saved against commit ${commit}`,
			);
		}

		// 3. retrieve ingest details
		const runbooks = [];
		for (const slice of chunk(runbookHashes, DYNAMODB_CONCURRENCY)) {
			try {
				const validRunbooks = (
					await batchGet(repository, slice)
				).filter(({ state }) => state === 'success');
				runbooks.push(...validRunbooks);
				await sleep(THROTTLE_MILLISECONDS);
			} catch (error) {
				// post issue if we couldn't retrieve runbook ingest details from DynamoDb
				await postIssue({
					commit,
					repository,
					githubName,
					errorCause: error.message,
					recordSystemCode,
					traceId,
				});
				throw error;
			}
		}

		return runbooks.map(({ details, systemCode }) => ({
			commit,
			repository,
			githubName,
			details,
			systemCode: systemCode || recordSystemCode,
			childLogger,
			traceId,
		}));
	} catch (error) {
		childLogger.warn({
			event: 'BAIL_NO_RUNBOOKS',
			error,
		});

		return [];
	}
};

const fetchAllRunbooks = async (parsedRecords, childLogger) => {
	const runbooksFetched = await Promise.all(
		parsedRecords.map(record => fetchRunbooksByCommit(record, childLogger)),
	);
	// Flatten found runbooks
	return [].concat(...runbooksFetched);
};

const ingestRunbook = async ({
	commit,
	systemCode,
	repository,
	githubName,
	details,
	childLogger,
	traceId,
}) => {
	try {
		const result = await ingest({
			shouldWriteToBizOps: true,
			bizOpsApiKey: BIZ_OPS_API_KEY,
			repository,
			systemCode,
			details,
		});

		const { status, message } = result;

		childLogger.info({
			event: 'RUNBOOK_INGEST_SUCCESSFUL',
			status,
			message,
		});

		return result;
	} catch (error) {
		childLogger.error({
			event: 'RUNBOOK_INGEST_FAILED',
			error,
		});

		await postIssue({
			commit,
			repository,
			githubName,
			errorCause: error.message,
			systemCode,
			traceId,
		});

		return null;
	}
};

const ingestRunbooks = async runbookInstances => {
	const runbooksIngested = await Promise.all(
		runbookInstances.map(runbook => ingestRunbook(runbook)),
	);

	return runbooksIngested.filter(runbook => !!runbook);
};

const processRunbookMd = async (parsedRecords, log) => {
	const eventIDs = parsedRecords.map(({ eventID }) => eventID);
	const childLogger = log.child({ eventIDs });

	try {
		// this does not reject or throw, instead it will return an empty array
		// if no fetches were successful
		// this will not post github issues on error
		const runbookInstances = await fetchAllRunbooks(
			parsedRecords,
			childLogger,
		);
		if (!runbookInstances.length) {
			return json(200, {
				message: 'No runbooks to ingest.',
				eventIDs,
			});
		}

		// this also does not reject or throw, instead it will return an empty array
		// if no ingests were successful
		// all errors are handled within, including posting of github issues
		const ingestedRunbooks = await ingestRunbooks(runbookInstances);

		if (!ingestedRunbooks.length) {
			throw new Error('Bailing, could not ingest any runbooks.');
		}

		return json(200, {
			message: 'Ingesting changed runbook.md files was successful.',
			eventIDs,
		});
	} catch (error) {
		childLogger.error({
			event: 'RELEASE_PROCESSING_UNEXPECTED_FAILURE',
			eventIDs,
			error,
		});

		return json(400, {
			message: 'Something went wrong during ingesting runbook.md files.',
			eventIDs,
		});
	}
};

const handler = ({ Records }, { awsRequestId }) => {
	const childLogger = logger.child({ awsRequestId });

	const parsedRecords = Records.map(
		parseKinesisRecord(childLogger, 'RECEIVED_CHANGE_API_EVENT'),
	).filter(filterValidRecord(childLogger));

	if (!parsedRecords.length) {
		childLogger.info(
			{
				event: 'SKIPPING_RECORD_SET',
			},
			'Nothing to ingest, skipping record set',
		);
		return json(200, {
			message: 'Nothing to ingest',
		});
	}

	childLogger.info({
		event: 'FOUND_PRODUCTION_RELEASE',
		parsedRecords,
	});

	return processRunbookMd(parsedRecords, childLogger);
};

module.exports = {
	handler: createLambda(handler, { requireS3o: false }),
};

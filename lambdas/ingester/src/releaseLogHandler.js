const logger = require('@financial-times/lambda-logger');
const fetch = require('isomorphic-fetch');
const { createLambda } = require('./lib/lambda');
const { ingest } = require('./commands/ingest');
const { json } = require('./lib/response');

const parseRecord = childLogger => record => {
	const RECEIVED_CHANGE_API_RECORD = 'RECEIVED_CHANGE_API_RECORD';
	const eventSource = record.eventSource || record.EventSource;

	const parseRecordLogger = childLogger.child({ eventId: record.eventID });

	if (eventSource !== 'aws:kinesis') {
		parseRecordLogger.info(
			{
				event: 'UNRECOGNISED_EVENT_SOURCE',
				record,
			},
			'Event source was not kinesis',
		);
		return;
	}

	// Kinesis data is base64 encoded so decode here
	let payload;
	try {
		payload = JSON.parse(
			Buffer.from(record.kinesis.data, 'base64').toString('utf8'),
		);

		parseRecordLogger.debug(
			{
				event: RECEIVED_CHANGE_API_RECORD,
				payload,
			},
			'Received kinesis record',
		);
	} catch (error) {
		parseRecordLogger.error(
			{
				event: RECEIVED_CHANGE_API_RECORD,
				...error,
			},
			'Record parsing has failed',
		);
		return;
	}

	const { commit } = payload;

	if (!commit) {
		parseRecordLogger.error(
			{ event: 'INSUFFICIENT_DATA', model: payload },
			'Event did not contain commit',
		);
		return;
	}

	return {
		...payload,
		eventId: record.eventID,
	};
};

const githubFetch = async (url, option = {}) => {
	return fetch(url, {
		...option,
		headers: {
			Authorization: `token ${process.env.GITHUB_AUTH_TOKEN}`,
			...option.headers,
		},
	});
};

const getContentUrlFromModifiedFiles = response => {
	const { contents_url: contentsUrl } =
		response.find(file =>
			file.filename.toLowerCase().includes('runbook.md'),
		) || {};

	return contentsUrl;
};

const getRunbookIfModified = async (prNumber, gitRepositoryName) => {
	const url = `https://api.github.com/repos/${gitRepositoryName}/pulls/${prNumber}/files`;
	const rawResponse = await githubFetch(url);

	const modifiedFiles = await rawResponse.json();
	return getContentUrlFromModifiedFiles(modifiedFiles);
};

const getRunbookContent = async contentUrl => {
	const rawResponse = await githubFetch(contentUrl, {
		headers: {
			Accept: 'application/vnd.github.VERSION.raw',
		},
	});

	return rawResponse.text();
};

const getRunbookFromPR = async (commit, gitRepositoryName) => {
	const url = `https://api.github.com/repos/${gitRepositoryName}/commits/${commit}/pulls`;

	const rawResponse = await fetch(url, {
		headers: {
			Authorization: `token ${process.env.GITHUB_AUTH_TOKEN}`,
			Accept: 'application/vnd.github.groot-preview+json',
		},
	});

	const response = await rawResponse.json();

	const { number: prNumber } = response[0] || {};
	const runbookContentUrl =
		prNumber && (await getRunbookIfModified(prNumber, gitRepositoryName));
	const runbookMDContent =
		runbookContentUrl && (await getRunbookContent(runbookContentUrl));
	return runbookMDContent;
};

const getRunbookFromCommit = async (commit, gitRepositoryName) => {
	const url = `https://api.github.com/repos/${gitRepositoryName}/commits/${commit}`;
	const rawResponse = await githubFetch(url);
	const modifiedFiles = await rawResponse.json();

	const runbookContentUrl = getContentUrlFromModifiedFiles(
		modifiedFiles.files,
	);

	return runbookContentUrl && getRunbookContent(runbookContentUrl);
};

const ingestRunbookMDs = async (runbookMDs, childLogger) => {
	const EVENT = 'INGEST_RUNBOOK_MD';

	return Promise.all(
		runbookMDs
			.filter(runbookMD => runbookMD.content)
			.map(async body => {
				const user = body.user.split('@')[0];
				try {
					return ingest(user, {
						systemCode: body.systemCode,
						content: body.content,
						writeToBizOps: true,
						bizOpsApiKey: process.env.BIZ_OPS_API_KEY,
					});
				} catch (error) {
					childLogger.error(
						{
							event: EVENT,
							error,
							body,
						},
						`Ingesting runbook has failed for ${body.systemCode}.`,
					);
					throw error;
				}
			}),
	);
};

const fetchRunbookMds = async (parsedRecords, childLogger) => {
	const resolved = await Promise.all(
		parsedRecords.map(
			async ({ commit, systemCode, githubData, user, eventId }) => {
				const fetchRunbookLogger = childLogger.child({ eventId });
				try {
					const gitRepositoryName = githubData.htmlUrl
						.replace('https://github.com/', '')
						.match(/[\w-]+\/[\w-]+/)[0];
					let runbookContent;

					runbookContent = await getRunbookFromCommit(
						commit,
						gitRepositoryName,
					);

					if (!runbookContent) {
						runbookContent = await getRunbookFromPR(
							commit,
							gitRepositoryName,
						);
					}

					return {
						systemCode,
						content: runbookContent,
						user: user.email,
					};
				} catch (error) {
					const event = 'GET_RUNBOOK_CONTENT_FAILED';
					fetchRunbookLogger.error(
						{
							event,
							error,
						},
						'Retrieving runbook.md from GithubApi has failed',
					);
				}
			},
		),
	);

	return resolved;
};

const productionChanges = (payload = {}) => payload.isProdEnv;

const processRunbookMd = async (parsedRecords, childLogger) => {
	const runbookMDs = await fetchRunbookMds(parsedRecords, childLogger);

	try {
		const ingestedRunbooks = await ingestRunbookMDs(
			runbookMDs,
			childLogger,
		);

		ingestedRunbooks.forEach(response => {
			if (response.status >= 400) {
				childLogger.error(response);
			}
		});

		return json(200, {
			message: 'Ingesting changed runbook.md files was successful.',
		});
	} catch (error) {
		return json(400, {
			message: 'Something went wrong during ingesting runbook.md files.',
		});
	}
};

const handler = async (event, context) => {
	const childLogger = logger.child({ awsRequestId: context.awsRequestId });
	childLogger.info({
		event: 'RELEASE_TRIGGERED',
		value: event,
	});

	const parsedRecords = event.Records.map(parseRecord(childLogger))
		.filter(productionChanges)
		.filter(Boolean);

	await processRunbookMd(parsedRecords, childLogger);
};

module.exports = {
	handler: createLambda(handler, { requireS3o: false }),
};

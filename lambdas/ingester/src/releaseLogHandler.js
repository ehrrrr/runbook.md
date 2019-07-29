const logger = require('@financial-times/lambda-logger');
const fetch = require('isomorphic-fetch');
const { createLambda } = require('./lib/lambda');
const { ingest } = require('./commands/ingest');
const { json } = require('./lib/response');

const githubApiUrl = `https://api.github.com`;
const bizOpsApiKey = process.env.BIZ_OPS_API_KEY;

const decodeBase64 = string => Buffer.from(string, 'base64').toString('utf8');

const parseRecord = childLogger => record => {
	const RECEIVED_CHANGE_API_RECORD = 'RECEIVED_CHANGE_API_RECORD';
	const { eventSource, eventId, kinesis: { data } = {} } = record;

	const parseRecordLogger = childLogger.child({
		eventId,
	});

	if (eventSource !== 'aws:kinesis') {
		parseRecordLogger.info(
			{
				event: 'UNRECOGNISED_EVENT_SOURCE',
				record,
			},
			'Event source was not Kinesis',
		);
		return;
	}

	let payload;
	try {
		payload = JSON.parse(decodeBase64(data));

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
			{ event: 'INSUFFICIENT_DATA' },
			'Event did not contain commit',
		);
		return;
	}

	return {
		...payload,
		eventId: record.eventID,
	};
};

const githubAPI = (path, { previewMode, ...options } = {}) => {
	const url = `${githubApiUrl}${path.replace(githubApiUrl, '')}`;
	// The associated PRs endpoint on Commit API is currently in developer preview,
	// so we must provide a custom media type in the Accept header:
	const additionalHeaders = previewMode
		? { Accept: 'application/vnd.github.groot-preview+json' }
		: {};
	return fetch(url, {
		...options,
		headers: {
			Authorization: `token ${process.env.GITHUB_AUTH_TOKEN}`,
			...additionalHeaders,
		},
	});
};

const getRunbookUrlFromModifiedFiles = files => {
	const firstRunbookFound = files.find(({ filename }) =>
		/runbook\.md$/i.test(filename),
	);
	const { contents_url: runbookUrl } = firstRunbookFound || {};
	return runbookUrl;
};

const getRunbookIfModified = async (prNumber, gitRepositoryName) => {
	const path = `/repos/${gitRepositoryName}/pulls/${prNumber}/files`;
	const rawResponse = await githubAPI(path);
	const modifiedFiles = await rawResponse.json();
	return getRunbookUrlFromModifiedFiles(modifiedFiles);
};

const getRunbookContent = async contentUrl => {
	const response = await githubAPI(contentUrl);
	const { content } = await response.json();
	return decodeBase64(content);
};

const getRunbookFromUrl = url => url && getRunbookContent(url);

const getRunbookFromPR = async (commit, gitRepositoryName, prNumber) => {
	if (!prNumber) {
		const path = `/repos/${gitRepositoryName}/commits/${commit}/pulls`;
		const response = await githubAPI(path, {
			// Listing branches or pull requests for a commit in the Commits API
			// is currently in developer preview
			// 'https://developer.github.com/v3/repos/commits/#list-pull-requests-associated-with-commit'
			previewMode: true,
		});
		const [prData = {}] = await response.json();
		prNumber = prData.number;
	}
	const runbookContentUrl =
		prNumber && (await getRunbookIfModified(prNumber, gitRepositoryName));
	return getRunbookFromUrl(runbookContentUrl);
};

const getRunbookFromCommit = async (commit, gitRepositoryName) => {
	const path = `/repos/${gitRepositoryName}/commits/${commit}`;
	const response = await githubAPI(path);
	const { files } = await response.json();
	const runbookContentUrl = files && getRunbookUrlFromModifiedFiles(files);
	return getRunbookFromUrl(runbookContentUrl);
};

const ingestRunbookMDs = (runbookMDs, childLogger) =>
	Promise.all(
		runbookMDs
			.filter(({ content }) => !!content)
			.map(async ({ user, systemCode, content }) => {
				const userName = user.split('@')[0];
				try {
					return await ingest(userName, {
						systemCode,
						content,
						writeToBizOps: true,
						bizOpsApiKey,
					});
				} catch (error) {
					childLogger.error(
						{
							event: 'INGEST_RUNBOOK_MD_FAILED',
							error,
							user,
							systemCode,
						},
						`Ingesting runbook has failed for ${systemCode}.`,
					);
					throw error;
				}
			}),
	);

const fetchRunbookMds = (parsedRecords, childLogger) =>
	Promise.all(
		parsedRecords.map(
			async ({
				commit,
				systemCode,
				githubData: { htmlUrl: gitRefUrl },
				user,
				eventId,
			}) => {
				const fetchRunbookLogger = childLogger.child({ eventId });
				let repository = 'UNKNOWN';
				try {
					if (!gitRefUrl) {
						throw new Error(
							'No github data associated with the ChangeAPI event',
						);
					}

					const [gitRepositoryName] =
						gitRefUrl
							.replace('https://github.com/', '')
							.match(/[\w-]+\/[\w-]+/) || [];

					if (!gitRepositoryName) {
						throw new Error(
							`Github data (htmlUrl) associated with the event is invalid: ${gitRefUrl}`,
						);
					}

					repository = gitRepositoryName;

					// the gitRefUrl can tell us whether we have a PR on our hands...
					// https://github.com/Financial-Times/next-api/pull/474
					const [, prNumber] =
						gitRefUrl.match(/\/pull\/(\d+)$/) || [];

					let runbookContent;

					if (!prNumber) {
						runbookContent = await getRunbookFromCommit(
							commit,
							gitRepositoryName,
						);
					}

					if (!runbookContent) {
						runbookContent = await getRunbookFromPR(
							commit,
							gitRepositoryName,
							prNumber,
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
							repository,
						},
						'Retrieving runbook.md from GithubApi has failed',
					);
				}
			},
		),
	);

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

	const parsedRecords = event.Records.map(parseRecord(childLogger)).filter(
		payload => payload && !!payload.isProdEnv,
	);

	await processRunbookMd(parsedRecords, childLogger);
};

module.exports = {
	handler: createLambda(handler, { requireS3o: false }),
};

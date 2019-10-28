const logger = require('@financial-times/lambda-logger');
const fetch = require('isomorphic-fetch');
const https = require('https');
const yaml = require('js-yaml');
const { createLambda } = require('./lib/lambda');
const { ingest } = require('./commands/ingest');
const { json } = require('./lib/response');
const { decodeBase64 } = require('./lib/type-helpers');
const { parseKinesisRecord } = require('./lib/kinesis-util');
const { detectSystemCode, runbookRx } = require('./lib/system-code');

const githubApiUrl = `https://api.github.com`;
const bizOpsApiKey = process.env.BIZ_OPS_API_KEY;
const runbooksConfigurationCaches = {};

const filterValidKinesisRecord = childLogger => (record = {}) => {
	const { commit, eventID } = record;
	const log = childLogger.child({
		eventID,
	});

	if (!commit) {
		log.error(
			{ event: 'INSUFFICIENT_DATA', record },
			'Record did not contain commit',
		);
		return false;
	}

	return !!record.isProdEnv;
};

const createGithubAPIClient = (log = logger) => async (
	path,
	{ previewMode, ...options } = {},
) => {
	const url = `${githubApiUrl}${path.replace(githubApiUrl, '')}`;
	const requestOptions = {
		...options,
		headers: {
			Authorization: `token ${process.env.GITHUB_AUTH_TOKEN}`,
			// The associated PRs endpoint on Commit API is currently in developer preview,
			// so we must provide a custom media type in the Accept header:
			...(previewMode
				? { Accept: 'application/vnd.github.groot-preview+json' }
				: {}),
		},
	};
	const response = await fetch(url, {
		...requestOptions,
		agent: new https.Agent({ keepAlive: true }),
	});

	if (!response.ok) {
		requestOptions.headers.Authorization = `token: <redacted>`;
		log.error({
			event: 'GITHUB_API_FAILURE',
			url,
			requestOptions,
			statusCode: response.status,
		});
		throw new Error(
			`Github API call returned status code ${response.status}`,
		);
	}

	return response.json();
};

class RunbookSource {
	constructor({ logger: log = logger, githubAPI } = {}) {
		this.logger = log;
		this.githubAPI = githubAPI;
	}

	postRunbookIssue(gitRepositoryName, githubName, errorCause, systemCode) {
		const path = `/repos/${gitRepositoryName}/issues`;
		// TODO: change the debugging info, it's misleading
		// The Change API logs are not helpful here and the splunk query is wrong
		const requestOptions = {
			method: 'POST',
			body: JSON.stringify({
				title: 'runbook.md automated runbook ingestion failure',
				body: `@${githubName}, there was an error synchronising runbook data with Biz-Ops: ${errorCause}.
				This automated operation was triggered by a recent release.
				Logged in [Change API](https://financialtimes.splunkcloud.com/en-GB/app/search/search?q=search%20index%3D%22aws_cloudwatch%22%20source%3D%22%2Faws%2Flambda%2Fchange-request*).
				You can find further details about what went wrong on [Splunk](https://financialtimes.splunkcloud.com/en-US/app/search/search?q=search%20index%3Daws_cloudwatch%20source%3D${systemCode})
				Need help? [Slack us](https://financialtimes.slack.com/messages/CFR0GPCAH)
				Issue posted automatically by [runbook.md](https://runbooks.in.ft.com/)`,
			}),
		};
		return this.githubAPI(path, requestOptions);
	}

	// Fetch configured runbooks.yml under .github/runbooks.yml
	async getSystemCodeFromRepositoryConfig(gitRepositoryName) {
		// Use cached map if exists because no longer we don't want to fetch each time
		if (gitRepositoryName in runbooksConfigurationCaches) {
			return runbooksConfigurationCaches[gitRepositoryName];
		}
		const path = `/repos/${gitRepositoryName}/contents/.github/runbooks.yml`;
		let systemCodeMap;

		try {
			const { content } = await this.githubAPI(path);
			const { runbooks = {} } =
				yaml.safeLoad(decodeBase64(content)) || {};
			systemCodeMap = runbooks.systemCodes;
		} catch (e) {
			systemCodeMap = {};
		}
		runbooksConfigurationCaches[gitRepositoryName] = systemCodeMap;
		return systemCodeMap;
	}

	getRunbookUrlFromModifiedFiles(files) {
		return files
			.filter(({ filename }) => runbookRx.test(filename))
			.map(({ contents_url: runbookContentUrl, filename }) => ({
				runbookContentUrl,
				filename,
			}));
	}

	async getRunbookIfModified(prNumber, gitRepositoryName) {
		const path = `/repos/${gitRepositoryName}/pulls/${prNumber}/files`;
		const modifiedFiles = await this.githubAPI(path);
		return this.getRunbookUrlFromModifiedFiles(modifiedFiles);
	}

	async getRunbookFromUrl(contentUrl) {
		if (!contentUrl) {
			return '';
		}
		const { content } = await this.githubAPI(contentUrl);
		return decodeBase64(content);
	}

	async getRunbooksFromPR(commit, gitRepositoryName, prNumber) {
		if (!prNumber) {
			const path = `/repos/${gitRepositoryName}/commits/${commit}/pulls`;
			const [prData = {}] = await this.githubAPI(path, {
				// Listing branches or pull requests for a commit in the Commits API
				// is currently in developer preview
				// 'https://developer.github.com/v3/repos/commits/#list-pull-requests-associated-with-commit'
				previewMode: true,
			});
			prNumber = prData.number;
		}
		const runbookFiles =
			prNumber &&
			(await this.getRunbookIfModified(prNumber, gitRepositoryName));

		return Promise.all(
			runbookFiles.map(async ({ runbookContentUrl, filename }) => ({
				content: await this.getRunbookFromUrl(runbookContentUrl),
				filename,
			})),
		);
	}

	async getRunbooksFromCommit(commit, gitRepositoryName) {
		const path = `/repos/${gitRepositoryName}/commits/${commit}`;
		const { files } = await this.githubAPI(path);

		const runbookFiles =
			files && this.getRunbookUrlFromModifiedFiles(files);

		return Promise.all(
			runbookFiles.map(async ({ runbookContentUrl, filename }) => ({
				content: await this.getRunbookFromUrl(runbookContentUrl),
				filename,
			})),
		);
	}
}

const fetchRunbook = async (
	{
		commit,
		systemCode,
		githubData: { htmlUrl: gitRefUrl },
		user: { githubName },
		eventID,
	},
	loggerInstance,
) => {
	const childLogger = loggerInstance.child({
		commit,
		systemCode,
		githubName,
		gitRefUrl,
		eventID,
	});

	childLogger.info({
		event: 'GET_RUNBOOK_CONTENT',
	});

	const runbookSource = new RunbookSource({
		logger: childLogger,
		githubAPI: createGithubAPIClient(childLogger),
	});

	let repository;

	try {
		if (!gitRefUrl) {
			throw new Error('Invalid github reference URL');
		}

		const [repoName] =
			gitRefUrl
				.replace('https://github.com/', '')
				.match(/[a-z0-9_.-]+\/[a-z0-9_.-]+/i) || [];

		if (!repoName) {
			throw new Error(
				'Could not parse repository name from github reference URL',
			);
		}

		repository = repoName;

		// the gitRefUrl can tell us whether we have a PR on our hands...
		// https://github.com/Financial-Times/next-api/pull/474
		const [, prNumber] = gitRefUrl.match(/\/pull\/(\d+)$/) || [];

		let runbookChanges;

		if (!prNumber) {
			childLogger.info({
				event: 'GETTING_RUNBOOK_FROM_COMMIT',
			});
			runbookChanges = await runbookSource.getRunbooksFromCommit(
				commit,
				repository,
			);
		} else {
			childLogger.info({
				event: 'GETTING_RUNBOOK_FROM_PR',
				prNumber,
			});
			runbookChanges = await runbookSource.getRunbooksFromPR(
				commit,
				repository,
				prNumber,
			);
		}

		if (!runbookChanges.length) {
			throw new Error('Bailing: No runbook found in commit tree');
		}

		childLogger.info({
			event: 'GOT_RUNBOOK_CONTENT',
		});

		const configuredSystemCodes = await runbookSource.getSystemCodeFromRepositoryConfig(
			repository,
		);

		return runbookChanges.map(({ content, filename }) => ({
			content,
			repository,
			githubName,
			runbookSource,
			childLogger,
			systemCode: detectSystemCode(
				configuredSystemCodes,
				filename,
				systemCode,
			),
		}));
	} catch (error) {
		childLogger.error({
			event: 'GETTING_RUNBOOK_FAILED',
			error,
		});

		return null;
	}
};

const fetchRunbooks = async (parsedRecords, childLogger) => {
	const runbooksFetched = await Promise.all(
		parsedRecords.map(record => fetchRunbook(record, childLogger)),
	);

	// Flatten found runbooks
	return runbooksFetched.reduce(
		(runbooks, next = []) => [...runbooks, ...next],
		[],
	);
};

const ingestRunbook = async ({
	systemCode,
	content,
	repository,
	githubName,
	childLogger,
	runbookSource,
}) => {
	try {
		const result = await ingest({
			systemCode,
			content,
			shouldWriteToBizOps: true,
			bizOpsApiKey,
			repository,
		});

		const { status, message } = result;

		childLogger.info({
			event: 'RUNBOOK_INGEST_SUCCESSFUL',
			status,
			message,
		});

		return { ...result };
	} catch (error) {
		childLogger.error({
			event: 'RUNBOOK_INGEST_FAILED',
			error,
		});

		if (repository && githubName) {
			await runbookSource.postRunbookIssue(
				repository,
				githubName,
				error.message,
				systemCode,
			);
		}

		return null;
	}
};

const ingestRunbooks = async runbookInstances => {
	const runbooksIngested = await Promise.all(
		runbookInstances.map(runbook => ingestRunbook(runbook)),
	);

	return runbooksIngested.filter(runbook => !!runbook);
};

const getRecordIDs = records => records.map(({ eventID }) => eventID);

const processRunbookMd = async parsedRecords => {
	const eventIDs = getRecordIDs(parsedRecords);
	const childLogger = logger.child({ eventIDs });

	try {
		// this does not reject or throw, instead it will return an empty array
		// if no fetches were successful
		// all errors are handled within, including posting of github issues
		const runbookInstances = await fetchRunbooks(
			parsedRecords,
			childLogger,
		);

		if (!runbookInstances.length) {
			throw new Error('Bailing, could not fetch any runbooks.');
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
	const eventIDs = getRecordIDs(Records);
	const childLogger = logger.child({ awsRequestId, eventIDs });

	childLogger.info({
		event: 'RELEASE_TRIGGERED',
	});

	const parsedRecords = Records.map(
		parseKinesisRecord(childLogger, 'RECEIVED_CHANGE_API_EVENT'),
	).filter(filterValidKinesisRecord(childLogger));

	if (!parsedRecords.length) {
		childLogger.info(
			{
				event: 'SKIPPING_RECORD_SET',
			},
			'Nothing to ingest, skipping record set',
		);
		return json(200, {
			message: 'Nothing to ingest',
			eventIDs,
		});
	}

	return processRunbookMd(parsedRecords);
};

module.exports = {
	handler: createLambda(handler, { requireS3o: false }),

	// export for testing
	fetchRunbook,
};

const logger = require('@financial-times/lambda-logger');
const fetch = require('isomorphic-fetch');
const https = require('https');
const yaml = require('js-yaml');
const querystring = require('querystring');
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
	const {
		commit,
		eventID,
		loggerContext: { traceId } = {},
		isProdEnv,
	} = record;
	const log = childLogger.child({
		eventID,
		traceId,
	});

	if (!commit) {
		log.info(
			{ event: 'BAIL_INSUFFICIENT_DATA' },
			'Record did not contain commit',
		);
		return false;
	}

	return !!isProdEnv;
};

const createGithubAPIClient = (log = logger) => async (
	path,
	{ previewMode, ...options } = {},
	silentMode = false,
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
		if (!silentMode) {
			log.error({
				event: 'GITHUB_API_FAILURE',
				url,
				requestOptions,
				statusCode: response.status,
			});
		}
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

	postRunbookIssue({
		commit,
		repository,
		githubName,
		errorCause,
		systemCode,
		awsRequestId,
	}) {
		const author = githubName ? ` (FYI, @${githubName})` : '';
		const commitUrl = `[#${commit.slice(
			0,
			7,
		)}](https://github.com/${repository}/commit/${commit})`;
		const splunkQuery = `index=aws_cloudwatch source="/aws/lambda/biz-ops-runbook-md-prod-releaseLog" awsRequestId="${awsRequestId}"`;
		const path = `/repos/${repository}/issues`;
		// TODO: change the debugging info, it's misleading
		// The Change API logs are not helpful here and the splunk query is wrong
		const requestOptions = {
			method: 'POST',
			body: JSON.stringify({
				title: 'runbook.md automated runbook ingestion failure',
				body: `There was an error synchronising runbook data with Biz-Ops: 

				\`\`\`
				${errorCause}
				\`\`\`

				This automated operation was triggered by a recent release - commit ${commitUrl}${author}.
				You can find further details about what went wrong on [Splunk](https://financialtimes.splunkcloud.com/en-GB/app/search/search?q=search%20${querystring.escape(
					splunkQuery,
				)}).
				
				Need help? Slack us in [#reliability-eng](https://financialtimes.slack.com/archives/C07B3043U)

				Please check [your most recent production runbook](https://runbooks.in.ft.com/${systemCode}) and alert Operations if any critical details are missing.

				Issue posted automatically by [runbook.md](https://github.com/Financial-Times/runbook.md).`,
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
			const { content } = await this.githubAPI(path, {}, true);
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

	async getRelatedPRFromCommit(commit, gitRepositoryName) {
		const path = `/repos/${gitRepositoryName}/commits/${commit}/pulls`;
		const [prData = {}] = await this.githubAPI(path, {
			// Listing branches or pull requests for a commit in the Commits API
			// is currently in developer preview
			// 'https://developer.github.com/v3/repos/commits/#list-pull-requests-associated-with-commit'
			previewMode: true,
		});
		return prData.number;
	}

	getPRfromGitRefUrl(gitRefUrl) {
		const [, prNumber] = gitRefUrl
			? gitRefUrl.match(/\/pull\/(\d+)$/) || []
			: [];
		return prNumber;
	}

	async getRunbooksFromPR(gitRepositoryName, prNumber) {
		const runbookFiles = await this.getRunbookIfModified(
			prNumber,
			gitRepositoryName,
		);

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
		gitRepositoryName,
		githubData: { htmlUrl: gitRefUrl } = {},
		user: { githubName } = {},
		eventID,
		loggerContext: { traceId } = {},
	},
	loggerInstance,
) => {
	const childLogger = loggerInstance.child({
		commit,
		systemCode,
		githubName,
		gitRefUrl,
		eventID,
		traceId,
	});

	childLogger.info({
		event: 'GET_RUNBOOK_CONTENT',
	});

	const runbookSource = new RunbookSource({
		logger: childLogger,
		githubAPI: createGithubAPIClient(childLogger),
	});

	let repository = gitRepositoryName;

	try {
		if (!repository) {
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
		}

		if (!/financial-times\//i.test(repository)) {
			repository = `Financial-Times/${repository}`;
		}

		let prNumber;

		// if provided, gitRefUrl can tell us whether we should
		// check for files in the PR rather than in the commit
		if (gitRefUrl) {
			prNumber = runbookSource.getPRfromGitRefUrl(gitRefUrl);
		}

		// if there is no gitRefUrl, or gitRefUrl does not reference a PR,
		// try using the github API to get the PR related to the commit
		if (!prNumber) {
			prNumber = await runbookSource.getRelatedPRFromCommit(
				commit,
				repository,
			);
		}

		let runbookChanges;

		if (!prNumber) {
			childLogger.info({
				event: 'GETTING_RUNBOOKS_FROM_COMMIT',
			});
			runbookChanges = await runbookSource.getRunbooksFromCommit(
				commit,
				repository,
			);
		} else {
			childLogger.info({
				event: 'GETTING_RUNBOOKS_FROM_PR',
				prNumber,
			});
			runbookChanges = await runbookSource.getRunbooksFromPR(
				repository,
				prNumber,
			);
		}

		if (!runbookChanges.length) {
			throw new Error('Bailing: No runbooks found in commit tree');
		}

		childLogger.info({
			event: 'GOT_RUNBOOKS_CONTENT',
			runbooks: runbookChanges.map(({ filename }) => filename),
		});

		const configuredSystemCodes = await runbookSource.getSystemCodeFromRepositoryConfig(
			repository,
		);

		return runbookChanges.map(({ content, filename }) => ({
			commit,
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
		childLogger.warn({
			event: 'BAIL_NO_RUNBOOKS',
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

const ingestRunbook = async (
	{
		commit,
		systemCode,
		content,
		repository,
		githubName,
		childLogger,
		runbookSource,
	},
	awsRequestId,
) => {
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

		return result;
	} catch (error) {
		childLogger.error({
			event: 'RUNBOOK_INGEST_FAILED',
			error,
		});

		if (repository) {
			await runbookSource.postRunbookIssue({
				commit,
				repository,
				githubName,
				errorCause: error.message,
				systemCode,
				awsRequestId,
			});
		}

		return null;
	}
};

const ingestRunbooks = async (runbookInstances, awsRequestId) => {
	const runbooksIngested = await Promise.all(
		runbookInstances.map(runbook => ingestRunbook(runbook, awsRequestId)),
	);

	return runbooksIngested.filter(runbook => !!runbook);
};

const processRunbookMd = async (parsedRecords, parentLogger, awsRequestId) => {
	const eventIDs = parsedRecords.map(({ eventID }) => eventID);
	const childLogger = parentLogger.child({ eventIDs });

	try {
		// this does not reject or throw, instead it will return an empty array
		// if no fetches were successful
		// this will not post github issues on error
		const runbookInstances = await fetchRunbooks(
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
		const ingestedRunbooks = await ingestRunbooks(
			runbookInstances,
			awsRequestId,
		);

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
		});
	}

	return processRunbookMd(parsedRecords, childLogger, awsRequestId);
};

module.exports = {
	handler: createLambda(handler, { requireS3o: false }),

	// export for testing
	fetchRunbook,
};

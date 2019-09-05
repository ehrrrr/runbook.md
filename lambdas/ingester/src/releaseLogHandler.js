const logger = require('@financial-times/lambda-logger');
const fetch = require('isomorphic-fetch');
const https = require('https');
const { createLambda } = require('./lib/lambda');
const { ingest } = require('./commands/ingest');
const { json } = require('./lib/response');
const { decodeBase64 } = require('./lib/type-helpers');
const { parseKinesisRecord } = require('./lib/kinesis-util');

const githubApiUrl = `https://api.github.com`;
const bizOpsApiKey = process.env.BIZ_OPS_API_KEY;

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

	async postRunbookIssue(
		gitRepositoryName,
		githubName,
		errorCause,
		systemCode,
	) {
		try {
			const path = `/repos/${gitRepositoryName}/issues`;
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
			const postIssue = await this.githubAPI(path, requestOptions);

			if (!postIssue.ok) {
				const err = new Error(
					`github responded with ${postIssue.status}`,
				);
				err.response = postIssue;
				throw err;
			}

			return postIssue;
		} catch (error) {
			logger.info({
				event: 'GITHUB_POST_FAILED',
				error,
				gitRepositoryName,
			});
		}
	}

	getRunbookUrlFromModifiedFiles(files) {
		const firstRunbookFound = files.find(({ filename }) =>
			/runbook\.md$/i.test(filename),
		);
		const { contents_url: runbookUrl } = firstRunbookFound || {};
		return runbookUrl;
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

	async getRunbookFromPR(commit, gitRepositoryName, prNumber) {
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
		const runbookContentUrl =
			prNumber &&
			(await this.getRunbookIfModified(prNumber, gitRepositoryName));
		return this.getRunbookFromUrl(runbookContentUrl);
	}

	async getRunbookFromCommit(commit, gitRepositoryName) {
		const path = `/repos/${gitRepositoryName}/commits/${commit}`;
		const { files } = await this.githubAPI(path);
		const runbookContentUrl =
			files && this.getRunbookUrlFromModifiedFiles(files);
		return this.getRunbookFromUrl(runbookContentUrl);
	}
}

const ingestRunbookMDs = (runbookMDs, childLogger) =>
	Promise.all(
		runbookMDs
			.filter(({ content, eventID }) => {
				if (content) {
					return true;
				}
				childLogger.info({
					event: 'NO_RUNBOOK_CONTENT_FOUND',
					eventID,
				});
				return false;
			})
			.map(async ({ systemCode, content, eventID }) => {
				const fetchRunbookLogger = childLogger.child({ eventID });

				try {
					fetchRunbookLogger.info({
						event: 'INGEST_RUNBOOK_MD_START',
					});

					const result = await ingest({
						systemCode,
						content,
						shouldWriteToBizOps: true,
						bizOpsApiKey,
					});

					fetchRunbookLogger.info({
						event: 'INGEST_RUNBOOK_MD_COMPLETE',
						ingestStatus: result.status,
						ingestMessage: result.message,
					});
					return { ...result, eventID };
				} catch (error) {
					fetchRunbookLogger.error(
						{
							event: 'INGEST_RUNBOOK_MD_FAILED',
							error,
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
		parsedRecords.map(async record => {
			const {
				commit,
				systemCode,
				githubData: { htmlUrl: gitRefUrl },
				eventID,
			} = record;

			const fetchRunbookLogger = childLogger.child({ eventID });

			fetchRunbookLogger.info({
				event: 'GET_RUNBOOK_CONTENT_START',
			});

			const runbookSource = new RunbookSource({
				logger: fetchRunbookLogger,
				githubAPI: createGithubAPIClient(fetchRunbookLogger),
			});

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
						.match(/[a-z0-9_.-]+\/[a-z0-9_.-]+/i) || [];

				if (!gitRepositoryName) {
					throw new Error(
						`Github data (htmlUrl) associated with the event is invalid: ${gitRefUrl}`,
					);
				}

				repository = gitRepositoryName;

				// the gitRefUrl can tell us whether we have a PR on our hands...
				// https://github.com/Financial-Times/next-api/pull/474
				const [, prNumber] = gitRefUrl.match(/\/pull\/(\d+)$/) || [];

				let runbookContent;

				if (!prNumber) {
					runbookContent = await runbookSource.getRunbookFromCommit(
						commit,
						gitRepositoryName,
					);
				}

				if (!runbookContent) {
					runbookContent = await runbookSource.getRunbookFromPR(
						commit,
						gitRepositoryName,
						prNumber,
					);
				}

				if (runbookContent) {
					fetchRunbookLogger.info({
						event: 'GET_RUNBOOK_CONTENT_SUCCESS',
					});
				} else {
					fetchRunbookLogger.info({
						event: 'GET_RUNBOOK_CONTENT_SUCCESS_NO_CONTENT',
					});
				}

				return {
					systemCode,
					content: runbookContent,
					repository: gitRepositoryName,
					eventID,
				};
			} catch (error) {
				const errorMessage =
					'Retrieving runbook.md from Github API has failed';
				fetchRunbookLogger.error(
					{
						event: 'GET_RUNBOOK_CONTENT_FAILED',
						error,
						record,
						repository,
					},
					errorMessage,
				);
				throw Object.assign(new Error(errorMessage), {
					cause: error,
					record,
					repository,
				});
			}
		}),
	);

const getRecordIDs = records => records.map(({ eventID }) => eventID);

const processRunbookMd = async (parsedRecords, childLogger) => {
	const eventIDs = getRecordIDs(parsedRecords);
	const runbookSource = new RunbookSource({
		githubAPI: createGithubAPIClient(),
	});
	try {
		// first point of failure: if this errors, we go into the catch block
		// this can only error once – Promise.all bails as soon as one its promises rejects

		const runbookMDs = await fetchRunbookMds(parsedRecords, childLogger);
		// second point of failure: same as above

		const ingestedRunbooks = await ingestRunbookMDs(
			runbookMDs,
			childLogger,
		);

		const errors = ingestedRunbooks.filter(result => result.status >= 400);
		if (errors.length) {
			childLogger.info({
				event: 'RELEASE_PROCESSING_SUCCESS',
				eventIDs,
			});
		}

		return json(200, {
			message: 'Ingesting changed runbook.md files was successful.',
		});
	} catch (error) {
		childLogger.info({
			event: 'RELEASE_PROCESSING_FAILURE',
			eventIDs,
			error,
		});

		// handle any of the 2 points of failure above
		// by creating an issue on the github repo
		if (error.repository) {
			const {
				repository,
				record: {
					systemCode,
					user: { githubName },
				},
				message,
			} = error;

			await runbookSource.postRunbookIssue(
				repository,
				githubName,
				message,
				systemCode,
			);
		}

		return json(400, {
			message: 'Something went wrong during ingesting runbook.md files.',
		});
	}
};

const handler = async (event, context) => {
	const childLogger = logger.child({ awsRequestId: context.awsRequestId });
	childLogger.info({
		event: 'RELEASE_TRIGGERED',
		eventIDs: getRecordIDs(event.Records),
	});

	const parsedRecords = event.Records.map(
		parseKinesisRecord(childLogger, 'RECEIVED_CHANGE_API_EVENT'),
	).filter(filterValidKinesisRecord(childLogger));

	if (parsedRecords.length === 0) {
		childLogger.info(
			{
				event: 'SKIPPING_INGEST',
			},
			'Nothing to ingest, skipping event',
		);
		return json(200, {
			message: 'Nothing to ingest, skipping',
		});
	}

	parsedRecords.forEach(({ commit, systemCode, eventID }) => {
		childLogger.info(
			{
				event: 'BEGIN_PROCESSING_RELEASE_RECORD',
				record: {
					commit,
					systemCode,
					eventID,
				},
			},
			'Began processing record',
		);
	});

	return processRunbookMd(parsedRecords, childLogger);
};

module.exports = {
	handler: createLambda(handler, { requireS3o: false }),
};

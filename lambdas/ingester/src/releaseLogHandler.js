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
			{ event: 'INSUFFICIENT_DATA', payload },
			'Event did not contain commit',
		);
		return;
	}

	return {
		...payload,
		eventId: record.eventID,
	};
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
	const response = await fetch(url, requestOptions);

	if (!response.ok) {
		const contentType = response.headers.get('content-type');
		const body = await (contentType &&
		contentType.includes('application/json')
			? response.json()
			: response.text());

		requestOptions.headers.Authorization = `token: <redacted>`;
		log.error({
			event: 'GITHUB_API_FAILURE',
			url,
			requestOptions,
			body,
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
		parsedRecords.map(async record => {
			const {
				commit,
				systemCode,
				githubData: { htmlUrl: gitRefUrl },
				user,
				eventId,
			} = record;

			const fetchRunbookLogger = childLogger.child({ eventId });
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
						record,
						repository,
					},
					'Retrieving runbook.md from GithubApi has failed',
				);
			}
		}),
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

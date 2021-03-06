const lambdaLogger = require('@financial-times/lambda-logger');
const { get: getStoredResult } = require('./lib/dynamodb-client');
const { json, renderPage } = require('./lib/response');
const { createLambda } = require('./lib/lambda');

const template = require('./templates/status-page');

const statusPageHandler = async event => {
	const { owner, repo, hash } = event.pathParameters;
	const { commitSha } = event.queryStringParameters;
	const repository = `${owner}/${repo}`;

	const logger = lambdaLogger.child({
		reporter: 'STATUS_PAGE',
		repository,
		runbookSha: hash,
		commitSha,
	});

	try {
		const [storedResult, { checkRunUrl }] = await Promise.all([
			getStoredResult(repository, hash),
			getStoredResult(repository, commitSha).catch(error => {
				logger.error({
					event: 'NO_CHECK_RUN_URL',
					error,
				});
				return {};
			}),
		]);

		logger.info({
			event: 'RETRIEVED_STORED_RESULT',
		});

		const {
			details: { validationErrors = [] } = {},
			commitSha: originalCommitSha,
		} = storedResult;

		const commitUrl = `https://github.com/${owner}/${repo}/commit/${originalCommitSha}`;

		const alertState =
			storedResult.state === 'success' &&
			Object.keys(validationErrors).length
				? 'neutral'
				: storedResult.state;

		return renderPage(
			template,
			{
				layout: 'docs',
				...storedResult,
				alertState,
				owner,
				repo,
				commitUrl,
				checkRunUrl,
			},
			event,
		);
	} catch (error) {
		logger.error({
			event: 'FAILED_FETCH_STORED_RESULT',
			error,
		});
		return json(404, {
			message:
				'Failed to fetch stored validation result. This is probably our fault. Please make a fresh commit to force regeneration. If the problem persists, let us know in the #reliability-eng slack channel.',
		});
	}
};

exports.handler = createLambda(statusPageHandler);

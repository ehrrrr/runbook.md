const lambdaLogger = require('@financial-times/lambda-logger');
const { get: getStoredResult } = require('./lib/dynamodb-client');
const { json, renderPage } = require('./lib/response');
const { createLambda } = require('./lib/lambda');
const { ingest } = require('./commands/ingest');
const template = require('./templates/reingest-page');

const { BIZ_OPS_API_KEY } = process.env;

const reingestHandler = async event => {
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

		if (storedResult.state !== 'success') {
			logger.error({ event: 'RUNBOOK_INVALID' });
			return json(403, {
				message: 'Only valid runbooks can be reingested.',
			});
		}

		const {
			details,
			systemCode,
			commitSha: originalCommitSha,
		} = storedResult;

		try {
			const { status, message } = await ingest({
				shouldWriteToBizOps: true,
				bizOpsApiKey: BIZ_OPS_API_KEY,
				repository,
				systemCode,
				details,
			});
			Object.assign(storedResult, { status, message });
			logger.info({
				event: 'RUNBOOK_REINGEST_SUCCESSFUL',
			});
		} catch (error) {
			const { status, message } = error;
			Object.assign(storedResult, { status, message });
			logger.error({
				event: 'RUNBOOK_REINGEST_FAILED',
				error,
			});
		}

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
				'Failed to fetch stored validation result. Please make a fresh commit.',
		});
	}
};

exports.handler = createLambda(reingestHandler);

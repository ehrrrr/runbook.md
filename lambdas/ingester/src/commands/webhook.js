const logger = require('@financial-times/lambda-logger');
const { ingest } = require('./ingest');
const { put: storeResult } = require('../lib/dynamodb-client');

const clientUserId = process.env.BIZ_OPS_CLIENT_USER_ID;
const bizOpsUrl = process.env.BIZ_OPS_URL;

const base64Decode = data => {
	const buff = Buffer.from(data, 'base64');
	return buff.toString('utf8');
};

// 1. Listen to push events
// 2. Ingest RUNBOOK.MD at that point in time
// 3. Store results
// 4. Post commit status
const command = async context => {
	const {
		head_commit: headCommit,
		repository: {
			name: repo,
			owner: { name: owner },
		},
	} = context.payload;

	const repository = `${owner}/${repo}`;

	logger.info({
		event: 'WEBHOOK_PUSH_RECEIVED',
		repository,
		hasHeadCommit: !!headCommit,
	});

	// if is isn't the head commit, bail
	if (!headCommit) {
		const reason = 'No head commit';
		logger.info({
			event: 'WEBHOOK_PUSH_BAIL',
			reason,
			repository,
		});
		throw new Error(reason);
	}

	const { tree_id: treeId, id: commitSha } = headCommit;

	// context.github is an authenticated octokit/rest instance
	// https://octokit.github.io/rest.js

	// get the git tree of the head commit
	// https://octokit.github.io/rest.js/#octokit-routes-git-get-tree

	const {
		data: { tree },
	} = await context.github.git.getTree({
		owner,
		repo,
		tree_sha: treeId,
		recursive: 1,
	});

	// get the runbook sha from the tree
	// if it exists
	const { sha: runbookSha } =
		tree.find(
			({ path, type }) => type === 'blob' && /runbook\.md$/i.test(path),
		) || {};

	// if there's no runbook in the repo, bail
	if (!runbookSha) {
		const reason = 'No runbook in tree';
		logger.info({
			event: 'WEBHOOK_PUSH_BAIL',
			reason,
			repository,
			commitSha,
		});
		throw new Error(reason);
	}

	// get the runbook blob
	// https://octokit.github.io/rest.js/#octokit-routes-git-get-blob
	const {
		data: { content: base64EncodedRunbook, url: runbookUrl },
	} = await context.github.git.getBlob({
		owner,
		repo,
		file_sha: runbookSha,
	});

	logger.info({
		event: 'WEBHOOK_RUNBOOK_RETRIEVED',
		repository,
		commitSha,
		runbookSha,
	});

	const content = base64Decode(base64EncodedRunbook);

	// post commit status for head commit
	// degrade gracefully
	// https://octokit.github.io/rest.js/#octokit-routes-repos-create-status
	const postStatus = async (state, details = {}) => {
		try {
			await context.github.repos.createStatus({
				context: 'runbook.md',
				description: 'Biz-Ops Runbook validation',
				owner,
				repo,
				sha: commitSha,
				state,
				...details,
			});
			logger.info({
				event: 'WEBHOOK_POST_STATUS_SUCCESS',
				repository,
				commitSha,
				runbookSha,
				state,
			});
		} catch (error) {
			logger.error({
				event: 'WEBHOOK_POST_STATUS_FAIL',
				repository,
				commitSha,
				runbookSha,
				error: { ...error },
			});
		}
	};

	const ingestResult = { status: 'success', content, runbookUrl };

	try {
		logger.info({
			event: 'WEBHOOK_INGEST_CALLED',
			repository,
			commitSha,
			runbookSha,
		});
		const [, response] = await Promise.all([
			postStatus('pending'),
			ingest(clientUserId, { content }),
		]);
		logger.info({
			event: 'WEBHOOK_INGEST_SUCCESS',
			repository,
			commitSha,
			runbookSha,
			response,
		});
		Object.assign(ingestResult, response);
	} catch (error) {
		logger.error({
			event: 'WEBHOOK_INGEST_FAILED',
			repository,
			commitSha,
			runbookSha,
			error: { ...error },
		});
		Object.assign(ingestResult, { ...error, status: 'failure' });
	}

	const storeIngestResult = async () => {
		try {
			logger.info({ event: 'WEBHOOK_STORE_RESULT', commitSha });
			await storeResult(repository, commitSha, ingestResult);
			logger.info({
				event: 'WEBHOOK_STORE_RESULT_SUCCESS',
				commitSha,
				repository,
			});
		} catch (error) {
			logger.error({
				event: 'WEBHOOK_STORE_RESULT_FAILED',
				commitSha,
				repository,
				error: { ...error },
			});
		}
	};

	const statusDetails = {
		target_url: `${bizOpsUrl}/runbook.md/status/${owner}/${repo}/${commitSha}`,
		...{
			success: {
				description: ingestResult.details
					? `Runbook score: ${Number(
							ingestResult.details.weightedScore,
					  ).toFixed(1)}%`
					: 'Runbook is valid',
			},
			failure: {
				description: 'Runbook parse failed',
			},
		}[ingestResult.status],
	};

	await Promise.all([
		postStatus(ingestResult.status, statusDetails),
		storeIngestResult(),
	]);
};

exports.command = command;

// respond to github webhooks
// uses probot's application class
// https://probot.github.io/docs/
exports.webhookListener = app => {
	app.on('push', context => exports.command(context));
};

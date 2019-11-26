const lambdaLogger = require('@financial-times/lambda-logger');
const { AppConfig } = require('./app-config');
const { isStringNotEmpty } = require('../../lib/type-helpers');

class WebhookResponder extends AppConfig {
	constructor(context, config = {}) {
		super(config);

		this.eventRecevied = context.name;

		const { owner, repo } = context.repo();
		this.repository = `${owner}/${repo}`;

		this.processPayload(context);

		this.logger = lambdaLogger.child({
			reporter: 'GITHUB_WEBHOOK',
			received: this.eventRecevied,
			repository: this.repository,
			commitSha: this.sha,
			branch: this.branch,
		});

		if (this.disabled) {
			return this.bail('runbook.md disabled');
		}

		if (!isStringNotEmpty(this.sha) || !isStringNotEmpty(this.branch)) {
			return this.bail('Head commit data missing');
		}
	}

	bail(reason, event = 'BAILED') {
		this.logger.info({ event, reason });
		throw new Error(reason);
	}

	abort(error, event = 'UNEXPECTED_ERROR') {
		this.logger.error({ event, error });
		throw error;
	}

	processPayload(context) {
		if (context.payload.check_suite) {
			return this.processCheckSuitePayload(context);
		}
		if (context.payload.check_run) {
			return this.processCheckRunPayload(context);
		}
	}

	processCheckSuitePayload(context) {
		const {
			head_sha: sha,
			head_branch: branch,
			head_commit: { tree_id: treeId } = {},
		} = context.payload.check_suite;

		Object.assign(this, { sha, branch, treeId });
	}

	processCheckRunPayload(context) {
		const {
			head_sha: sha,
			check_suite: { head_branch: branch } = {},
		} = context.payload.check_run;

		Object.assign(this, { sha, branch });
	}
}

exports.WebhookResponder = WebhookResponder;

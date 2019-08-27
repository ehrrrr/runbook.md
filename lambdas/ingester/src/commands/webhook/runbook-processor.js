const { basename } = require('path');
const { ingest } = require('../ingest');
const { RunbookSourcer } = require('./runbook-sourcer');
const { put: storeResult } = require('../../lib/dynamodb-client');
const { isStringNotEmpty, decodeBase64 } = require('../../lib/type-helpers');

const bizOpsApiKey = process.env.BIZ_OPS_API_KEY;

class RunbookProcessor extends RunbookSourcer {
	async processRunbook(context, { sha, path, url, content, systemCode }) {
		const runbook = {
			sha,
			path,
			url: url || this.buildGitHubUrl(path),
			content: content || (await this.getRunbookContents(context, sha)),
		};
		// bail early if the file is zero-length
		// or if we couldn't read the contents
		if (!runbook.content) {
			return null;
		}
		// infer runbook system code from config
		// then from file name
		systemCode =
			systemCode ||
			this.getMappedSystemCode(path) ||
			this.parseSystemCode(path);
		if (isStringNotEmpty(systemCode)) {
			runbook.systemCode = systemCode;
		} else {
			delete runbook.systemCode;
		}

		return this.ingestRunbook(runbook);
	}

	async getRunbookContents(context, sha) {
		const childLogger = this.logger.child({ runbook: { sha } });
		try {
			// get the runbook blob
			// https://octokit.github.io/rest.js/#octokit-routes-git-get-blob
			const {
				data: { content: base64EncodedRunbook },
			} = await context.github.git.getBlob(
				context.repo({
					file_sha: sha,
				}),
			);
			const content = decodeBase64(base64EncodedRunbook);
			if (isStringNotEmpty(content)) {
				return content;
			}
			childLogger.info({ event: 'CONTENT_EMPTY' });
			return null;
		} catch (error) {
			childLogger.error({
				event: 'CONTENT_RETRIEVE_FAILED',
				error,
			});
			return null;
		}
	}

	async ingestRunbook(runbook) {
		const shouldWriteToBizOps = runbook.systemCode
			? this.isWriteToBizOpsEnabled(this.branch, runbook.path)
			: false;

		const childLogger = this.logger.child({
			shouldWriteToBizOps,
			runbook: {
				sha: runbook.sha,
				path: runbook.path,
				url: runbook.url,
				systemCode: runbook.systemCode,
			},
		});

		const payload = { bizOpsApiKey, shouldWriteToBizOps, ...runbook };
		const result = {
			state: 'success',
			...runbook,
		};

		try {
			const response = await ingest(payload);
			childLogger.info({
				event: 'INGEST_SUCCESS',
			});
			Object.assign(result, response);
		} catch (error) {
			childLogger.error({
				event: 'INGEST_FAILED',
				error,
			});
			const { message, details } = error;
			// we're only interested in decorated errors thrown by ingest
			// return null for any unexpected errors
			if (!details) {
				return null;
			}
			Object.assign(result, {
				state: 'failure',
				message,
				details,
			});
		}

		return result;
	}

	async storeIngestResult(runbook) {
		try {
			await storeResult(
				this.repository,
				runbook.sha,
				Object.assign({ commitSha: this.sha }, runbook),
			);
			this.logger.info({
				event: 'STORE_RESULT_SUCCESS',
			});
			return true;
		} catch (error) {
			this.logger.error({
				event: 'STORE_RESULT_FAILED',
				error,
			});
			return false;
		}
	}

	parseSystemCode(path) {
		return basename(path).replace(this.runbookRx, '');
	}
}

exports.RunbookProcessor = RunbookProcessor;

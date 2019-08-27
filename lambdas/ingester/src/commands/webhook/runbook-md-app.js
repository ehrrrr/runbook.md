const { IngestSummariser } = require('./ingest-summariser');
const { put: storeResult } = require('../../lib/dynamodb-client');

const bizOpsUrl = process.env.BIZ_OPS_URL;

// CLASS HIERARCHY
//
// AppConfig - read app config from repository .github/runbook.yml or use fallbacks
// 	|> WebhookResponder - payload destructuring, validation and logger instantiation
// 		|> RunbookSourcer - crawl commit tree for runbooks
// 			|> RunbookProcessor - get extra details about & ingest a runbook
// 				|> RunbookGatherer - process each runbook and sanitise result set
// 					|> IngestSummariser - summarise overall results (digest!)
// 						|> RunbookMdApp - create a GitHub check run with the results

class RunbookMdApp extends IngestSummariser {
	async createCheck(context) {
		if (!this.results) {
			this.summariseResults();
		}
		const { conclusion, title, summary, text } = this.results;

		const childLogger = this.logger.child({
			conclusion,
			checkResult: title,
		});

		try {
			// create a check run
			// https://octokit.github.io/rest.js/#octokit-routes-checks-create
			const {
				data: { html_url: checkRunUrl },
			} = await context.github.checks.create(
				context.repo({
					name: 'Runbook Validator',
					head_sha: this.sha,
					details_url: `${bizOpsUrl}/runbook.md/about`,
					status: 'completed',
					conclusion,
					completed_at: new Date(),
					output: { title, summary, text },
				}),
			);

			childLogger.info({
				event: 'CREATE_CHECK_SUCCESS',
				checkRunUrl,
			});
			// store the check run url
			// for status page navigation
			// and total / passed / failed / average score for tracking diff to master (TODO)
			const { total, passCount, failed, avgScore } = this.results;
			await storeResult(this.repository, this.sha, {
				checkRunUrl,
				avgScore,
				passCount,
				failed,
				total,
			});
		} catch (error) {
			childLogger.error({
				event: 'CREATE_CHECK_FAILED',
				error,
			});
		}
	}
}

exports.RunbookMdApp = RunbookMdApp;

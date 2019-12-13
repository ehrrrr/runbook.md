const { RunbookGatherer } = require('./runbook-gatherer');
const {
	makePlural,
	numericValue,
	isStringNotEmpty,
} = require('../../lib/type-helpers');
const { checkSystemCodeExists } = require('../ingest/system-code-check');

const bizOpsUrl = process.env.BIZ_OPS_URL;

class IngestSummariser extends RunbookGatherer {
	async summariseResults() {
		if (this.results) {
			return this.results;
		}

		const total = this.runbooks.length;
		const details = [];
		const scores = [];
		let failed = 0;

		// summarise results for each runbook
		await Promise.all(
			this.runbooks.map(async runbook => {
				const { state, details: { weightedScore } = {} } = runbook;
				// count overall errors
				if (state === 'failure') {
					failed++;
				}
				// validate weighted score value
				const score = numericValue(weightedScore);

				if (score) {
					scores.push(score);
					runbook.details.weightedScore = score;
				} else if (runbook.details && runbook.details.weightedScore) {
					delete runbook.details.weightedScore;
				}
				// summarise everything else in a Markdown (gfm) string
				details.push(await this.summariseIngestResult(runbook));
			}),
		);

		const passCount = total - failed;
		const avgScore =
			scores.reduce((sum, score) => sum + score, 0) /
			(scores.length || 1); // || 1 to avoid division by 0
		const text = details.join('   \n***  \n');
		const conclusion =
			(this.failOn === 'any' && failed) ||
			(this.failOn === 'all' && !passCount)
				? 'failure'
				: 'success';
		const { emoji, status } = this.getStateDescriptors(conclusion);
		const summary = [
			`${emoji} **QUALITY CONTROL ${status}**:`,
			`Evaluated ${makePlural(total)}.  \n`,
		];

		this.results = {
			total,
			passCount,
			failed,
			conclusion,
			text,
			title: passCount
				? `${
						total > 1 ? `${passCount}/${total}` : makePlural(total)
				  } passed`
				: `${makePlural(total)} failed`,
		};

		if (total > 1) {
			summary.push(
				passCount && `**${passCount}** passed.`,
				failed && `**${failed}** failed.`,
				avgScore &&
					`Average operability score **${avgScore}%** (based on ${makePlural(
						scores.length,
						'score',
					)}).`,
			);
		}

		if (avgScore) {
			this.results.avgScore = avgScore;
			this.results.title += `, ${total > 1 ? 'μ' : ''}${avgScore}%`;
		}

		this.results.summary = summary.filter(detail => !!detail).join(' ');
		return this.results;
	}

	async summariseIngestResult({
		sha,
		path,
		systemCode,
		url,
		state,
		message,
		details: {
			weightedScore: score,
			parseErrors = [],
			parseData = {},
			validationErrors = {},
			updatedFields = {},
		} = {},
	}) {
		const count = {
			errors: parseErrors.length,
			parsed: Object.keys(parseData).length,
			invalid: Object.keys(validationErrors).length,
			updated: Object.keys(updatedFields).length,
		};
		systemCode = parseData.systemCode || systemCode;

		const { emoji, status } = this.getStateDescriptors(state);
		const statusUrl = this.runbookMdUrl(sha);

		const getReingestCopy = async () => {
			let reingestCopy = `**Ingest trigger disabled** – Runbooks which specify a **code** field can be manually reingested into Biz Ops via a button on this page.`;
			if (isStringNotEmpty(systemCode)) {
				try {
					await checkSystemCodeExists(systemCode);
					const reingestUrl = this.runbookMdUrl(sha, 'reingest');
					reingestCopy = `[**Trigger ingest »**](${reingestUrl}) – :warning: this will update the system **${systemCode}** in Biz Ops`;
				} catch (error) {
					reingestCopy = `**Ingest trigger disabled** – Runbook specifies an invalid system code in its **code** field. Check **${systemCode}** exists in Biz Ops.`;
					this.logger.warn({
						event: 'SYSTEM_CODE_NOT_FOUND',
						sha,
						path,
						systemCode,
						error,
					});
				}
			}
			return reingestCopy;
		};

		const rerunCopy = `If you think something went wrong with this validation run of your runbook, you can recommit to the branch (can be an empty commit) to trigger another run.`;

		return [
			`## ${path}  \n`,
			`${emoji} **${status}** | [Go to file](${url}) | [**View report »**](${statusUrl})`,
			// ingest message
			message && `> ${message}  \n`,
			// weighted score
			score && `* Runbook score: **${score.toFixed(1)}%**`,
			// parse errors
			count.errors && `* **${count.errors}** parse errors`,
			// facets parsed sucessfully
			count.parsed && `* **${count.parsed}** facets parsed successfully`,
			// validation errors
			count.invalid && `* **${count.invalid}** invalid facets`,
			// fields updated in Biz Ops
			count.updated && `* **${count.updated}** fields updated in Biz Ops`,
			'\n -------------- \n',
			// fields updated in Biz Ops
			state === 'success' && (await getReingestCopy()),
			`\n`,
			rerunCopy,
		]
			.filter(line => !!line)
			.join('  \n');
	}

	buildGitHubUrl(path) {
		return `https://github.com/${this.repository}/blob/${this.sha}/${path}`;
	}

	runbookMdUrl(runbookSha, path = 'status') {
		const url = `${bizOpsUrl}/runbook.md/${path}`;
		return `${url}/${this.repository}/${runbookSha}?commitSha=${this.sha}`;
	}

	getStateDescriptors(state) {
		return {
			emoji: state === 'success' ? ':tada:' : ':rotating_light:',
			status: state === 'success' ? 'PASSED' : 'FAILED',
		};
	}
}

exports.IngestSummariser = IngestSummariser;

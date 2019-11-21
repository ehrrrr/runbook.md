const { RunbookProcessor } = require('./runbook-processor');
const { isArrayNotEmpty, makePlural } = require('../../lib/type-helpers');

class RunbookGatherer extends RunbookProcessor {
	async gatherRunbooks(context) {
		if (!isArrayNotEmpty(this.runbooks)) {
			this.runbooks = await this.collectRunbooksFromTree(context);
		}
		// process each runbook in the tree
		// filtering out zero-length files
		// and ingest errors
		const runbooks = (
			await Promise.all(
				this.runbooks.map(runbook =>
					this.processRunbook(context, runbook),
				),
			)
		).filter(runbook => !!runbook);

		// bail if we have nothing to work with
		if (!isArrayNotEmpty(runbooks)) {
			return this.bail(`0/${makePlural(this.runbooks.length)} ingested`);
		}

		this.runbooks = runbooks;
		return this.runbooks;
	}

	// TODO: batch writes for performance
	// https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/dynamodb-example-table-read-write-batch.html
	async storeResults() {
		const errors = (
			await Promise.all(
				this.runbooks.map(runbook => this.storeIngestResult(runbook)),
			)
		).filter(savedSuccessfully => !savedSuccessfully);

		if (errors.length === this.runbooks.length) {
			return this.bail('Failed to store ingest results');
		}
	}
}

exports.RunbookGatherer = RunbookGatherer;

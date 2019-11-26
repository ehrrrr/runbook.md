/* eslint-disable no-await-in-loop */
const { chunk } = require('lodash');
const { RunbookProcessor } = require('./runbook-processor');
const { isArrayNotEmpty, makePlural } = require('../../lib/type-helpers');
const { sleep } = require('../../lib/sleep');

const {
	BIZ_OPS_CONCURRENCY = 10,
	DYNAMODB_CONCURRENCY = 5,
	THROTTLE_MILLISECONDS = 20,
} = process.env;

class RunbookGatherer extends RunbookProcessor {
	async processRunbooks(context, runbooks) {
		// process each runbook
		// filtering out zero-length files
		// and ingest errors
		const results = await Promise.all(
			runbooks.map(runbook => this.processRunbook(context, runbook)),
		);
		return results.filter(runbook => !!runbook);
	}

	async gatherRunbooks(context) {
		if (!isArrayNotEmpty(this.runbooks)) {
			this.runbooks = await this.collectRunbooksFromTree(context);
		}
		// process each runbook in the tree
		// throttling & limiting concurrency
		const runbooks = [];
		for (const slice of chunk(this.runbooks, BIZ_OPS_CONCURRENCY)) {
			const results = await this.processRunbooks(context, slice);
			runbooks.push(...results);
			await sleep(THROTTLE_MILLISECONDS);
		}
		// bail if we have nothing to work with
		if (!isArrayNotEmpty(runbooks)) {
			return this.bail(`0/${makePlural(this.runbooks.length)} ingested`);
		}
		this.runbooks = runbooks;
		return this.runbooks;
	}

	async storeIngestResults(runbooks) {
		// process each runbook
		// filtering out zero-length files
		// and ingest errors
		const results = await Promise.all(
			runbooks.map(runbook => this.storeIngestResult(runbook)),
		);
		return results.filter(savedSuccessfully => !savedSuccessfully);
	}

	async storeResults() {
		const errors = [];
		// store each result in DynamoDB
		// throttling & limiting concurrency
		// investigated using dynamoDb.batchWriteItem here,
		// added complexity is not worth it (e.g. batching doesn't support updates)
		for (const slice of chunk(this.runbooks, DYNAMODB_CONCURRENCY)) {
			const results = await this.storeIngestResults(slice);
			errors.push(...results);
			await sleep(THROTTLE_MILLISECONDS);
		}
		if (errors.length === this.runbooks.length) {
			return this.bail('Failed to store ingest results');
		}
	}
}

exports.RunbookGatherer = RunbookGatherer;

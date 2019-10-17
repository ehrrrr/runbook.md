const { WebhookResponder } = require('./webhook-responder');
const { isStringNotEmpty, isArrayNotEmpty } = require('../../lib/type-helpers');
const { runbookRx } = require('../../lib/system-code');

class RunbookSourcer extends WebhookResponder {
	constructor(context, config) {
		super(context, config);
		this.runbookRx = runbookRx;
	}

	async getTreeIdFromCommit(context) {
		if (!isStringNotEmpty(this.treeId)) {
			try {
				// get the commit details
				// https://octokit.github.io/rest.js/#octokit-routes-git-get-commit
				const {
					data: {
						tree: { sha: treeId },
					},
				} = await context.github.git.getCommit(
					context.repo({
						commit_sha: this.sha,
					}),
				);
				this.treeId = treeId;
			} catch (error) {
				this.abort(error);
			}
		}

		return this.treeId;
	}

	async collectRunbooksFromTree(context) {
		if (!this.treeId) {
			await this.getTreeIdFromCommit(context);
		}
		if (!this.runbooks) {
			try {
				// get the commit tree
				// https://octokit.github.io/rest.js/#octokit-routes-git-get-tree
				const {
					data: { tree },
				} = await context.github.git.getTree(
					context.repo({
						tree_sha: this.treeId,
						recursive: 1,
					}),
				);
				// get any runbooks from the tree
				// unless excluded by config
				this.runbooks = tree.filter(
					({ type, path }) =>
						type === 'blob' &&
						this.runbookRx.test(path) &&
						!this.isPathExcluded(path),
				);
			} catch (error) {
				this.abort(error);
			}
		}
		// if there are no runbooks in the repo, bail
		if (!isArrayNotEmpty(this.runbooks)) {
			return this.bail('No runbooks found in tree');
		}

		return this.runbooks;
	}
}

exports.RunbookSourcer = RunbookSourcer;

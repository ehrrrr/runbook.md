jest.mock('../../src/commands/ingest');
jest.mock('../../src/lib/dynamodb-client');

const EventEmitter = require('events');
const { encodeBase64 } = require('../../src/lib/type-helpers');
const webhook = require('../../src/commands/webhook');
const dynamoDb = require('../../src/lib/dynamodb-client');
const ingester = require('../../src/commands/ingest');

const {
	runbook,
	webhook: { checkRunRerequested, checkSuiteRequested },
} = require('../fixtures');

const base64EncodedRunbook = encodeBase64(runbook);

const {
	check_suite: { head_sha: hash },
	repository: {
		name: repo,
		owner: { login: owner },
	},
} = checkSuiteRequested;

// const repository = `${owner}/${repo}`;
const events = [
	{
		event: 'check_suite.requested',
		eventPayload: JSON.stringify(checkSuiteRequested),
	},
	{
		event: 'check_run.rerequested',
		eventPayload: JSON.stringify(checkRunRerequested),
	},
];

const tree = [
	{
		path: 'runbook.md',
		type: 'blob',
		sha: hash,
	},
	{
		path: 'system-code_runbook.md',
		type: 'blob',
		sha: hash,
	},
];

describe('webhook', () => {
	events.forEach(({ event, eventPayload }) => {
		describe(event, () => {
			const ctx = {};
			const spies = {};

			beforeEach(() => {
				ctx.payload = JSON.parse(eventPayload);
				ctx.repo = args => Object.assign({ owner, repo }, args || {});
				ctx.config = jest.fn().mockReturnValue({});
				ctx.github = {
					git: {
						getCommit: jest.fn(),
						getTree: jest.fn(),
						getBlob: jest.fn(),
					},
					repos: { createStatus: jest.fn() },
				};
				spies.dynamo = jest.spyOn(dynamoDb, 'put');
				spies.ingest = jest.spyOn(ingester, 'ingest');
				ctx.github.git.getCommit.mockResolvedValue({
					data: {
						tree: { sha: hash },
					},
				});
				ctx.github.git.getTree.mockResolvedValue({ data: { tree } });
				ctx.github.git.getBlob.mockResolvedValue({
					data: {
						content: base64EncodedRunbook,
					},
				});
			});

			afterEach(() => {
				jest.resetAllMocks();
			});

			// afterAll(() => {
			// 	jest.restoreAllMocks();
			// });

			describe('listener', () => {
				it(`responds to ${event}`, async () => {
					const commandSpy = jest.spyOn(webhook, 'command');
					const app = new EventEmitter();
					webhook.webhookListener(app);
					await app.emit(event, ctx);
					expect(commandSpy).toBeCalled();
				});
			});

			// describe.skip('command', () => {
			// 	describe('skipping events', () => {
			// 		const missingDataMsg = 'Head commit data missing';
			// 		it('bails if there is no head sha', () => {
			// 			delete ctx.payload.check_suite.head_sha;
			// 			return expect(webhook.command(ctx)).rejects.toThrow(
			// 				missingDataMsg,
			// 			);
			// 		});

			// 		it('bails if there is no head branch', () => {
			// 			delete ctx.payload.check_suite.head_branch;
			// 			return expect(webhook.command(ctx)).rejects.toThrow(
			// 				missingDataMsg,
			// 			);
			// 		});

			// 		it.skip('bails if there is no head commit tree id', () => {
			// 			delete ctx.payload.check_suite.head_commit.tree_id;
			// 			return expect(webhook.command(ctx)).rejects.toThrow(
			// 				missingDataMsg,
			// 			);
			// 		});

			// 		it('bails if there are no runbooks in the commit tree', () => {
			// 			ctx.github.git.getTree.mockResolvedValue({
			// 				data: {
			// 					tree: [
			// 						{
			// 							path: 'runbook.md.this.is.not',
			// 							type: 'blob',
			// 						},
			// 					],
			// 				},
			// 			});
			// 			return expect(webhook.command(ctx)).rejects.toThrow(
			// 				'No runbooks found in tree',
			// 			);
			// 		});

			// 		it('bails if cannot find a single non-empty runbook in the commit tree', () => {
			// 			ctx.github.git.getBlob.mockResolvedValue({
			// 				data: {
			// 					content: '',
			// 				},
			// 			});
			// 			return expect(webhook.command(ctx)).rejects.toThrow(
			// 				`0/${tree.length} runbooks ingested`,
			// 			);
			// 		});
			// 	});

			// 	describe.skip('processing events', () => {
			// 		it.skip('decodes the runbook content for all runbooks', async () => {
			// 			await webhook.command(ctx);
			// 			expect(spies.ingest).toHaveBeenCalledTimes(2);
			// 			expect(spies.ingest).toHaveBeenCalledWith(
			// 				expect.objectContaining({
			// 					content: runbook,
			// 				}),
			// 			);
			// 		});

			// 		it('posts a pending commit status', async () => {
			// 			await webhook.command(ctx);
			// 			expect(
			// 				ctx.github.repos.createStatus,
			// 			).toHaveBeenCalledWith(
			// 				expect.objectContaining({ state: 'pending' }),
			// 			);
			// 		});

			// 		describe('when all runbooks contain errors', () => {
			// 			const ingestResult = {
			// 				bad: 'runbook has validation errors',
			// 			};

			// 			beforeEach(() => {
			// 				spies.ingest.mockRejectedValue(ingestResult);
			// 			});

			// 			it('posts a failure commit status', async () => {
			// 				await webhook.command(ctx);
			// 				expect(
			// 					ctx.github.repos.createStatus,
			// 				).toHaveBeenCalledWith(
			// 					expect.objectContaining({ state: 'failure' }),
			// 				);
			// 			});

			// 			it('persists the result in the data store', async () => {
			// 				await webhook.command(ctx);
			// 				expect(spies.dynamo).toHaveBeenCalledWith(
			// 					repository,
			// 					hash,
			// 					expect.objectContaining({
			// 						status: 'failure',

			// 						...ingestResult,
			// 					}),
			// 				);
			// 			});
			// 		});

			// 		describe.skip('when some runbooks contain errors', () => {
			// 			const ingestResult = {
			// 				bad: 'runbook has validation errors',
			// 			};

			// 			beforeEach(() => {
			// 				spies.ingest.mockRejectedValue(ingestResult);
			// 			});

			// 			it('posts a failure commit status', async () => {
			// 				await webhook.command(ctx);
			// 				expect(
			// 					ctx.github.repos.createStatus,
			// 				).toHaveBeenCalledWith(
			// 					expect.objectContaining({ state: 'failure' }),
			// 				);
			// 			});

			// 			it('persists the result in the data store', async () => {
			// 				await webhook.command(ctx);
			// 				expect(spies.dynamo).toHaveBeenCalledWith(
			// 					repository,
			// 					hash,
			// 					expect.objectContaining({
			// 						status: 'failure',
			// 						...ingestResult,
			// 					}),
			// 				);
			// 			});
			// 		});

			// 		describe.skip('when the runbook passes validation', () => {
			// 			const ingestResult = {
			// 				good: 'runbook passed validation',
			// 			};

			// 			beforeEach(() => {
			// 				spies.ingest.mockResolvedValue(ingestResult);
			// 			});

			// 			it('posts a success commit status', async () => {
			// 				await webhook.command(ctx);
			// 				expect(
			// 					ctx.github.repos.createStatus,
			// 				).toHaveBeenCalledWith(
			// 					expect.objectContaining({ state: 'success' }),
			// 				);
			// 			});

			// 			it('persists the result in the data store', async () => {
			// 				await webhook.command(ctx);
			// 				expect(spies.dynamo).toHaveBeenCalledWith(
			// 					repository,
			// 					hash,
			// 					expect.objectContaining({
			// 						status: 'success',
			// 						...ingestResult,
			// 					}),
			// 				);
			// 			});
			// 		});
			// 	});
			// });
		});
	});
});

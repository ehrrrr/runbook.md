jest.mock('@financial-times/lambda-logger');
jest.mock('../src/commands/ingest');
jest.mock('../src/lib/dynamodb-client');

const { readFileSync } = require('fs');
const { resolve } = require('path');

const EventEmitter = require('events');
const webhook = require('../src/commands/webhook');
const dynamoDb = require('../src/lib/dynamodb-client');
const ingester = require('../src/commands/ingest');

const pushEvent = require('./fixtures/githubPushEvent.json');

const runbook = readFileSync(
	resolve(__dirname, './../../../docs/example.md'),
	'utf8',
);
const base64EncodedRunbook = Buffer.from(runbook, 'utf8').toString('base64');

const {
	head_commit: { id: hash },
	repository: {
		name: repo,
		owner: { name: owner },
	},
} = pushEvent;

const repository = `${owner}/${repo}`;

describe('webhook', () => {
	const ctx = {};
	const spies = {};

	beforeEach(() => {
		ctx.payload = Object.assign({}, pushEvent);
		ctx.github = {
			git: { getTree: jest.fn(), getBlob: jest.fn() },
			repos: { createStatus: jest.fn() },
		};
		spies.dynamo = jest.spyOn(dynamoDb, 'put');
		spies.ingest = jest.spyOn(ingester, 'ingest');
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('listener', () => {
		it('responds to push events', () => {
			const commandSpy = jest.spyOn(webhook, 'command');
			const app = new EventEmitter();
			webhook.webhookListener(app);
			app.emit('push', ctx);
			expect(commandSpy).toHaveBeenCalled();
		});
	});

	describe('command', () => {
		describe('skipping events', () => {
			it('bails if there is no head commit', () => {
				delete ctx.payload.head_commit;
				expect(webhook.command(ctx)).rejects.toThrow('No head commit');
			});

			it('bails if there is no runbook in the head commit tree', () => {
				ctx.github.git.getTree.mockResolvedValue({
					data: {
						tree: [
							{ path: 'runbook.md.this.is.not', type: 'blob' },
						],
					},
				});
				expect(webhook.command(ctx)).rejects.toThrow(
					'No runbook in tree',
				);
			});
		});

		describe('processing events', () => {
			beforeEach(() => {
				ctx.github.git.getTree.mockResolvedValue({
					data: {
						tree: [{ path: 'runbook.md', type: 'blob', sha: hash }],
					},
				});
				ctx.github.git.getBlob.mockResolvedValue({
					data: {
						content: base64EncodedRunbook,
					},
				});
			});

			it('decodes the runbook content', async () => {
				await webhook.command(ctx);
				expect(spies.ingest).toHaveBeenCalledWith(
					process.env.BIZ_OPS_CLIENT_USER_ID,
					{
						content: runbook,
					},
				);
			});

			it('posts a pending commit status', async () => {
				await webhook.command(ctx);
				expect(ctx.github.repos.createStatus).toHaveBeenCalledWith(
					expect.objectContaining({ state: 'pending' }),
				);
			});

			describe('when the runbook contains errors', () => {
				const ingestResult = {
					bad: 'runbook has validation errors',
				};

				beforeEach(() => {
					spies.ingest.mockRejectedValue(ingestResult);
				});

				it('posts a failure commit status', async () => {
					await webhook.command(ctx);
					expect(ctx.github.repos.createStatus).toHaveBeenCalledWith(
						expect.objectContaining({ state: 'failure' }),
					);
				});

				it('persists the result in the data store', async () => {
					await webhook.command(ctx);
					expect(spies.dynamo).toHaveBeenCalledWith(
						repository,
						hash,
						expect.objectContaining({
							status: 'failure',
							...ingestResult,
						}),
					);
				});
			});

			describe('when the runbook passes validation', () => {
				const ingestResult = {
					good: 'runbook passed validation',
				};

				beforeEach(() => {
					spies.ingest.mockResolvedValue(ingestResult);
				});

				it('posts a success commit status', async () => {
					await webhook.command(ctx);
					expect(ctx.github.repos.createStatus).toHaveBeenCalledWith(
						expect.objectContaining({ state: 'success' }),
					);
				});

				it('persists the result in the data store', async () => {
					await webhook.command(ctx);
					expect(spies.dynamo).toHaveBeenCalledWith(
						repository,
						hash,
						expect.objectContaining({
							status: 'success',
							...ingestResult,
						}),
					);
				});
			});
		});
	});
});

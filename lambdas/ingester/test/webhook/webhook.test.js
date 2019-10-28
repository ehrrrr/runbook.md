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

const repository = `${owner}/${repo}`;

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
		path: 'main_runbook.md',
		parsedSystemCode: 'main',
		type: 'blob',
		sha: hash,
	},
	{
		path: 'foo/bar/system-code_runbook.md',
		parsedSystemCode: 'system-code',
		type: 'blob',
		sha: hash,
	},
];

describe('webhook', () => {
	const ctx = {};
	const spies = {};
	const unexpectedError = new Error('unexpected');

	const app = new EventEmitter();
	webhook.webhookListener(app);

	beforeEach(() => {
		Object.assign(ctx, {
			repo: args => ({ owner, repo, ...(args || {}) }),
			config: jest.fn(),
			github: {
				git: {
					getCommit: jest.fn(),
					getTree: jest.fn(),
					getBlob: jest.fn(),
				},
				checks: { create: jest.fn() },
			},
		});

		Object.assign(spies, {
			dynamo: jest.spyOn(dynamoDb, 'put'),
			ingest: jest.spyOn(ingester, 'ingest'),
		});

		spies.ingest.mockResolvedValue();
		spies.dynamo.mockResolvedValue();
		ctx.config.mockReturnValue({});
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
		ctx.github.checks.create.mockResolvedValue({
			data: {
				html_url: 'testCheckUrl',
			},
		});
	});

	afterEach(() => {
		jest.resetAllMocks();
	});

	events.forEach(({ event, eventPayload }) => {
		describe(event, () => {
			beforeEach(() => {
				ctx.payload = JSON.parse(eventPayload);
			});

			describe('listener', () => {
				it(`responds to ${event}`, done => {
					const commandSpy = jest
						.spyOn(webhook, 'command')
						.mockImplementationOnce(() => {});
					app.emit(event);
					// the listener for this eventEmitter is an async fn
					// so we need to wait for the next loop to be sure it has executed
					return setImmediate(() => {
						expect(commandSpy).toHaveBeenCalled();
						commandSpy.mockRestore();
						done();
					});
				});
			});

			describe('command', () => {
				describe('skipping events (bail)', () => {
					const validateBailAssertions = async errorMessage => {
						try {
							await webhook.command(ctx);
							throw new Error('fail assertion');
						} catch (e) {
							expect(e.message).toBe(errorMessage);
						}
						expect(spies.ingest).not.toBeCalled();
						expect(spies.dynamo).not.toBeCalled();
					};

					it('app disabled', async () => {
						ctx.config.mockReturnValue({
							runbooks: { disabled: true },
						});
						await validateBailAssertions('runbook.md disabled');
					});

					const missingDataMsg = 'Head commit data missing';
					const noRunbooksMsg = 'No runbooks found in tree';

					it('no head sha', async () => {
						delete (
							ctx.payload.check_suite || ctx.payload.check_run
						).head_sha;
						await validateBailAssertions(missingDataMsg);
					});

					it('no head branch', async () => {
						delete (
							ctx.payload.check_suite ||
							ctx.payload.check_run.check_suite
						).head_branch;
						await validateBailAssertions(missingDataMsg);
					});

					it('no runbooks in the commit tree', async () => {
						ctx.github.git.getTree = jest.fn().mockResolvedValue({
							data: {
								tree: [
									{
										path: 'runbook.md.this.is.not',
										type: 'blob',
									},
								],
							},
						});
						await validateBailAssertions(noRunbooksMsg);
					});

					it('all runbooks excluded through config', async () => {
						ctx.config.mockReturnValue({
							runbooks: { exclude: ['rx:runbook.md'] },
						});
						await validateBailAssertions(noRunbooksMsg);
					});

					it('no non-empty runbooks in the commit tree', async () => {
						ctx.github.git.getBlob = jest.fn().mockResolvedValue({
							data: {
								content: '',
							},
						});
						await validateBailAssertions(
							`0/${tree.length} runbooks ingested`,
						);
					});

					it('no runbooks ingested', async () => {
						spies.ingest.mockRejectedValue(unexpectedError);
						try {
							await webhook.command(ctx);
							throw new Error('fail assertion');
						} catch (e) {
							expect(e.message).toBe(
								`0/${tree.length} runbooks ingested`,
							);
						}
						expect(spies.ingest).toBeCalled();
						expect(spies.dynamo).not.toBeCalled();
					});

					it('no ingest results stored in the persistence layer', async () => {
						spies.dynamo.mockRejectedValue(unexpectedError);
						try {
							await webhook.command(ctx);
							throw new Error('fail assertion');
						} catch (e) {
							expect(e.message).toBe(
								`Failed to store ingest results`,
							);
						}
						expect(spies.ingest).toBeCalled();
						expect(spies.dynamo).toBeCalled();
					});
				});

				describe('handling critical errors (abort)', () => {
					const validateAbortAssertions = async () => {
						try {
							await webhook.command(ctx);
							throw new Error('fail assertion');
						} catch (e) {
							expect(e).toBe(unexpectedError);
						}
						expect(spies.ingest).not.toBeCalled();
						expect(spies.dynamo).not.toBeCalled();
					};

					if (event === 'check_run.rerequested') {
						it('abort on github getCommit error', async () => {
							ctx.github.git.getCommit = jest
								.fn()
								.mockRejectedValue(unexpectedError);
							await validateAbortAssertions();
						});
					}

					it('abort on github getTree error', async () => {
						ctx.github.git.getTree = jest
							.fn()
							.mockRejectedValue(unexpectedError);
						await validateAbortAssertions();
					});
				});

				describe('processing events', () => {
					const excludePath = tree[0].path;

					it('decodes and ingests content for all runbooks', async () => {
						await webhook.command(ctx);
						expect(spies.ingest).toHaveBeenCalledTimes(tree.length);
						expect(spies.ingest).toHaveBeenCalledWith(
							expect.objectContaining({
								content: runbook,
							}),
						);
					});

					it('skips runbooks excluded through config', async () => {
						ctx.config.mockReturnValue({
							runbooks: {
								exclude: [excludePath],
							},
						});
						await webhook.command(ctx);
						expect(spies.ingest).not.toHaveBeenCalledWith(
							expect.objectContaining({
								path: excludePath,
							}),
						);
					});

					it('stores ingest results', async () => {
						await webhook.command(ctx);
						// individual results for runbooks + outcome for commit
						expect(spies.dynamo).toHaveBeenCalledTimes(
							tree.length + 1,
						);
						tree.forEach(({ sha }) => {
							expect(spies.dynamo).toHaveBeenCalledWith(
								repository,
								sha,
								expect.objectContaining({
									content: runbook,
								}),
							);
						});
						// store outcome for commit
						expect(spies.dynamo).toHaveBeenLastCalledWith(
							repository,
							hash,
							expect.objectContaining({
								checkRunUrl: 'testCheckUrl',
							}),
						);
					});

					it('disregards unexpected ingest failures', async () => {
						spies.ingest.mockRejectedValueOnce(unexpectedError);
						await webhook.command(ctx);
						expect(spies.dynamo).toHaveBeenLastCalledWith(
							repository,
							hash,
							expect.objectContaining({
								passCount: tree.length - 1,
								failed: 0,
								total: tree.length - 1,
							}),
						);
					});

					it('reports ingest failures', async () => {
						// ingest (validation & parse) failures = rejections with a details property
						spies.ingest.mockRejectedValueOnce({
							message: 'ingest failed',
							details: 'how to fix it',
						});
						await webhook.command(ctx);
						expect(spies.dynamo).toHaveBeenLastCalledWith(
							repository,
							hash,
							expect.objectContaining({
								passCount: tree.length - 1,
								failed: 1,
								total: tree.length,
							}),
						);
					});

					it('averages weighted scores', async () => {
						tree.forEach((_, index) => {
							spies.ingest.mockResolvedValueOnce({
								details: { weightedScore: index + 1 },
							});
						});
						const avgScore = (tree.length + 1) / 2;
						await webhook.command(ctx);
						expect(spies.dynamo).toHaveBeenLastCalledWith(
							repository,
							hash,
							expect.objectContaining({ avgScore }),
						);
					});

					describe('reporting check results to github', () => {
						const expectConclusion = conclusion =>
							expect(
								ctx.github.checks.create,
							).toHaveBeenCalledWith(
								expect.objectContaining({
									conclusion,
								}),
							);
						describe('success', () => {
							it('no ingest errors', async () => {
								await webhook.command(ctx);
								expectConclusion('success');
							});

							it('failOn: none', async () => {
								ctx.config.mockReturnValue({
									runbooks: { failOn: 'none' },
								});
								spies.ingest.mockRejectedValue({
									message: 'ingest failed',
									details: 'parse errors',
								});
								await webhook.command(ctx);
								expectConclusion('success');
							});

							it('failOn: all', async () => {
								ctx.config.mockReturnValue({
									runbooks: { failOn: 'all' },
								});
								spies.ingest.mockRejectedValueOnce({
									message: 'ingest failed',
									details: 'parse errors',
								});
								await webhook.command(ctx);
								expectConclusion('success');
							});
						});

						describe('failure', () => {
							it('failOn: all', async () => {
								ctx.config.mockReturnValue({
									runbooks: { failOn: 'all' },
								});
								spies.ingest.mockRejectedValue({
									message: 'ingest failed',
									details: 'parse errors',
								});
								await webhook.command(ctx);
								expectConclusion('failure');
							});

							it('failOn: any', async () => {
								ctx.config.mockReturnValue({
									runbooks: { failOn: 'any' },
								});
								spies.ingest.mockRejectedValueOnce({
									message: 'ingest failed',
									details: 'parse errors',
								});
								await webhook.command(ctx);
								expectConclusion('failure');
							});
						});
					});

					describe('inferring system codes', () => {
						it('from config mapping', async () => {
							const systemCodes = {};
							tree.forEach(({ path }, index) => {
								systemCodes[
									`some-code-mapping-${index}`
								] = path;
							});
							ctx.config.mockReturnValue({
								runbooks: {
									systemCodes,
								},
							});
							await webhook.command(ctx);
							Object.keys(systemCodes).forEach(systemCode =>
								expect(spies.ingest).toHaveBeenCalledWith(
									expect.objectContaining({
										systemCode,
									}),
								),
							);
						});

						it('falling back on file names', async () => {
							await webhook.command(ctx);
							tree.forEach(({ parsedSystemCode }) =>
								expect(spies.ingest).toHaveBeenCalledWith(
									expect.objectContaining({
										systemCode: parsedSystemCode,
									}),
								),
							);
						});

						it('discards invalid system codes', async () => {
							ctx.github.git.getTree.mockResolvedValue({
								data: {
									tree: [
										{
											path: 'runbook.md',
											type: 'blob',
											sha: hash,
										},
									],
								},
							});
							await webhook.command(ctx);

							expect(spies.ingest).toHaveBeenCalledWith(
								expect.not.objectContaining({
									systemCode: expect.anything(),
								}),
							);
						});
					});

					describe('writing to biz-ops', () => {
						it('disabled by default', async () => {
							await webhook.command(ctx);
							expect(spies.ingest).not.toHaveBeenCalledWith(
								expect.objectContaining({
									shouldWriteToBizOps: true,
								}),
							);
						});

						describe('when enabled through config', () => {
							const config = {};
							beforeEach(() => {
								config.runbooks = {
									updateOnMerge: true,
									updateBranch: (
										ctx.payload.check_suite ||
										ctx.payload.check_run.check_suite
									).head_branch,
								};
								ctx.config.mockReturnValue(config);
							});

							it('defaults to updating on merge to master', async () => {
								delete config.runbooks.updateBranch;
								await webhook.command(ctx);
								expect(spies.ingest).toHaveBeenCalledWith(
									expect.objectContaining({
										shouldWriteToBizOps: false,
									}),
								);
							});

							it('overrides update branch from config', async () => {
								await webhook.command(ctx);
								expect(spies.ingest).toHaveBeenCalledWith(
									expect.objectContaining({
										shouldWriteToBizOps: true,
									}),
								);
							});

							it('skips runbooks excluded through config', async () => {
								config.runbooks.excludeFromUpdate = [
									excludePath,
								];
								await webhook.command(ctx);
								expect(spies.ingest).toHaveBeenCalledWith(
									expect.objectContaining({
										path: excludePath,
										shouldWriteToBizOps: false,
									}),
								);
							});
						});
					});
				});
			});
		});
	});
});

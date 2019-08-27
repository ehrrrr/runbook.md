const nock = require('nock');
const { handler } = require('../src/releaseLogHandler');

const { runbook: runbookFixture, sos: sosFixture } = require('./fixtures');
const kinesisFixture = require('./fixtures/kinesis');

describe('Release log handler', () => {
	beforeAll(() => {
		nock.disableNetConnect();
		nock.enableNetConnect('127.0.0.1');
	});

	afterEach(() => {
		nock.cleanAll();
	});

	afterAll(() => {
		nock.enableNetConnect();
		jest.restoreAllMocks();
	});

	const addGithubPullRequestInterceptor = ({
		repositoryName,
		pullRequestNumber,
		modifiedRunbookSha,
	}) =>
		nock('https://api.github.com')
			.defaultReplyHeaders({
				'Content-Type': 'application/json',
			})
			.replyContentLength()
			.replyDate()
			.get(
				`/repos/Financial-Times/${repositoryName}/pulls/${pullRequestNumber}/files`,
			)
			.reply(200, [
				{
					additions: 89,
					blob_url: `https://github.com/Financial-Times/${repositoryName}/blob/${modifiedRunbookSha}/runbook.md`,
					changes: 141,
					contents_url: `https://api.github.com/repos/Financial-Times/${repositoryName}/contents/runbook.md?ref=${modifiedRunbookSha}`,
					deletions: 52,
					filename: 'runbook.md',
					patch: '@@ -66,69 +66,100 @@ <redacted for test brevity>',
					raw_url: `https://github.com/Financial-Times/${repositoryName}/raw/${modifiedRunbookSha}/runbook.md`,
					sha: '9b5db0cd490977ed98277718f4912395828a41d2',
					status: 'modified',
				},
			]);

	const addGithubFileInterceptor = ({ repositoryName, modifiedRunbookSha }) =>
		nock('https://api.github.com')
			.defaultReplyHeaders({
				'Content-Type': 'application/json',
			})
			.replyContentLength()
			.replyDate()
			.get(`/repos/Financial-Times/${repositoryName}/contents/runbook.md`)
			.query({
				ref: modifiedRunbookSha,
			})
			.reply(200, {
				_links: {
					git: `https://api.github.com/repos/Financial-Times/${repositoryName}/git/blobs/97d153f4ad7ee7405400c30f0f5916ee62e4a440'`,
					html: `https://github.com/Financial-Times/${repositoryName}/blob/${modifiedRunbookSha}/runbook'`,
					self: `https://api.github.com/repos/Financial-Times/${repositoryName}/contents/runbook?ref=${modifiedRunbookSha}'`,
				},
				content: runbookFixture,
				download_url: `https://raw.githubusercontent.com/Financial-Times/${repositoryName}/${modifiedRunbookSha}/runbook?token=AAYNBTMPMQRZEG26EKGCKYC5H4LAQ'`,
				encoding: 'base64',
				git_url: `https://api.github.com/repos/Financial-Times/${repositoryName}/git/blobs/97d153f4ad7ee7405400c30f0f5916ee62e4a440'`,
				html_url: `https://github.com/Financial-Times/${repositoryName}/blob/${modifiedRunbookSha}/runbook'`,
				name: 'runbook',
				path: 'runbook',
				sha: '97d153f4ad7ee7405400c30f0f5916ee62e4a440',
				size: 5853,
				type: 'file',
				url: `https://api.github.com/repos/Financial-Times/${repositoryName}/contents/runbook?ref=${modifiedRunbookSha}'`,
			});

	const getBizOpsApiBaseUrl = () => {
		const url = new URL(process.env.BIZ_OPS_API_URL);
		url.pathname = '';
		return url.toString();
	};

	// reply with info based on system codes in runbook fixture
	const addBizOpsGraphQlInterceptor = () =>
		nock(getBizOpsApiBaseUrl())
			.defaultReplyHeaders({
				'Content-Type': 'application/json',
			})
			.replyContentLength()
			.post(`/biz-ops/graphql`)
			.reply(200, {
				data: {
					Team_reliability_engineering: {
						code: 'reliability-engineering',
						name: 'Reliability Engineering',
						email: 'reliability.engineering@ft.com',
						slack: 'reliability-eng',
						phone: 'n/a',
						supportRota: 'rota',
						contactPref: 'Slack #reliability-eng',
						isActive: true,
						productOwners: [
							{
								code: 'sarah.wells',
								name: 'Sarah Wells',
								email: 'sarah.wells@ft.com',
								phone: null,
								isActive: true,
							},
						],
						techLeads: [
							{
								code: 'luke.blaney',
								name: 'Luke Blaney',
								email: 'luke.blaney@ft.com',
								phone: null,
								isActive: true,
							},
						],
						group: {
							code: 'operationsreliability',
							name: 'Operations & Reliability',
							isActive: true,
						},
					},
					System_pingdom: {
						code: 'pingdom',
						name: 'Pingdom',
						serviceTier: 'Silver',
						lifecycleStage: 'Production',
					},
				},
			});

	const addSosValidationInterceptor = () =>
		nock(process.env.SOS_URL)
			.defaultReplyHeaders({
				'Content-Type': 'application/json',
			})
			.replyContentLength()
			.post('/api/v1/validate')
			.reply(200, sosFixture);

	const addBizOpsAPIPatchInterceptor = ({ systemCode }) =>
		nock(getBizOpsApiBaseUrl())
			.defaultReplyHeaders({
				'Content-Type': 'application/json',
			})
			.replyContentLength()
			.patch(`/biz-ops/v2/node/System/${systemCode}`)
			.query(
				query =>
					query.relationshipAction === 'replace' &&
					query.lockFields.split(',').length > 0,
			)
			.reply(200, {});

	it(`should handle a single record correctly when the record contains
		a change to a runbook made via a Github pull-request`, async () => {
		const givenSystemCode = 'biz-ops-runbook-md';
		const givenRepositoryName = 'ft-repo.com';
		const givenPullRequestNumber = '89';
		const givenAwsRequestId = '66b24830-4764-4b98-9a22-7c7696ad1dda';
		const givenModifiedRunbookSha =
			'bf8ddcc3b47ef8947fbfcbd84f0e231e4eade4cb';

		const givenEvent = kinesisFixture.get({
			user: {
				githubName: 'Captain Planet',
				email: 'captain.planet@ft.com',
			},
			systemCode: givenSystemCode,
			environment: 'prod',
			notifications: { slackChannels: ['rel-eng-changes'] },
			gitRepositoryName: `Financial-Times/${givenRepositoryName}`,
			changeMadeBySystem: 'circleci',
			commit: '4e2cf33719588ae2575ecb18a7beaa78bfb0c676',
			extraProperties: {},
			timestamp: '2019-07-29T13:07:16.216Z',
			loggerContext: {
				traceId: '8faf58eb-8049-4299-8d1e-5c7488e49403',
				clientSystemCode: givenSystemCode,
			},
			isProdEnv: true,
			salesforceSystemId: 'a224G000002WwlGQAS',
			systemData: {
				name: 'Biz Ops RUNBOOK.MD Importer',
				SF_ID: 'a224G000002WwlGQAS',
				serviceTier: 'Bronze',
				dataOwner: null,
				supportedBy: { email: 'reliability.engineering@ft.com' },
				deliveredBy: {
					productOwners: [{ email: 'sarah.wells@ft.com' }],
					group: {
						code: 'operationsreliability',
						name: 'Operations & Reliability',
					},
				},
			},
			githubData: {
				title: 'Log github API call failures',
				htmlUrl: `https://github.com/Financial-Times/${givenRepositoryName}/pull/${givenPullRequestNumber}`,
			},
			eventId:
				'shardId-000000000000:49597846710684593105580396104934657996711168234355687426',
		});

		addGithubPullRequestInterceptor({
			repositoryName: givenRepositoryName,
			pullRequestNumber: givenPullRequestNumber,
			modifiedRunbookSha: givenModifiedRunbookSha,
		});
		addGithubFileInterceptor({
			repositoryName: givenRepositoryName,
			modifiedRunbookSha: givenModifiedRunbookSha,
		});

		addBizOpsGraphQlInterceptor();
		addSosValidationInterceptor();
		addBizOpsAPIPatchInterceptor({ systemCode: givenSystemCode });

		const result = await handler(givenEvent, {
			awsRequestID: givenAwsRequestId,
		});

		expect(result).toEqual({
			statusCode: 200,
			body: JSON.stringify({
				message: 'Ingesting changed runbook.md files was successful.',
			}),
			headers: {
				'Content-Type': 'application/json',
			},
		});
		expect(nock.isDone()).toEqual(true);
	});
});

const nock = require('nock');
const logger = require('@financial-times/lambda-logger');
const { handler, fetchRunbook } = require('../src/releaseLogHandler');

const {
	runbook: runbookFixture,
	sos: sosFixture,
	runbooksConfig: runbooksYamlFixture,
} = require('./fixtures');
const { encodeBase64, decodeBase64 } = require('../src/lib/type-helpers');
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

	const addGithubConfigYamlInterceptor = ({
		repositoryName,
		commit,
		fixtureContent,
	}) =>
		nock('https://api.github.com')
			.defaultReplyHeaders({
				'Content-Type': 'application/json',
			})
			.replyContentLength()
			.replyDate()
			.get(
				`/repos/Financial-Times/${repositoryName}/contents/.github/runbooks.yml`,
			)
			.reply(200, {
				_links: {
					git: `https://api.github.com/repos/Financial-Times/${repositoryName}/git/blobs/97d153f4ad7ee7405400c30f0f5916ee62e4a440`,
					html: `https://github.com/Financial-Times/${repositoryName}/blob/${commit}/.github/runbooks.yml`,
					self: `https://api.github.com/repos/Financial-Times/${repositoryName}/contents/.github/runbooks.yml?ref=${commit}`,
				},
				content: encodeBase64(fixtureContent),
				download_url: `https://raw.githubusercontent.com/Financial-Times/${repositoryName}/${commit}/.github/runbooks.yml?token=AAYNBTMPMQRZEG26EKGCKYC5H4LAQ`,
				encoding: 'base64',
				git_url: `https://api.github.com/repos/Financial-Times/${repositoryName}/git/blobs/97d153f4ad7ee7405400c30f0f5916ee62e4a440`,
				html_url: `https://github.com/Financial-Times/${repositoryName}/blob/${commit}/.github/runbooks.yml`,
				name: 'runbooks.yml',
				path: '.github/runbooks.yml',
				sha: '97d153f4ad7ee7405400c30f0f5916ee62e4a440',
				size: 5853,
				type: 'file',
				url: `https://api.github.com/repos/Financial-Times/${repositoryName}/contents/.github/runbooks.yml?ref=${commit}`,
			});

	const addGithubPullRequestInterceptor = ({
		repositoryName,
		pullRequestNumber,
		modifiedRunbookSha,
		filename = 'runbook.md',
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
					blob_url: `https://github.com/Financial-Times/${repositoryName}/blob/${modifiedRunbookSha}/${filename}`,
					changes: 141,
					contents_url: `https://api.github.com/repos/Financial-Times/${repositoryName}/contents/${filename}?ref=${modifiedRunbookSha}`,
					deletions: 52,
					filename,
					patch: '@@ -66,69 +66,100 @@ <redacted for test brevity>',
					raw_url: `https://github.com/Financial-Times/${repositoryName}/raw/${modifiedRunbookSha}/${filename}`,
					sha: '9b5db0cd490977ed98277718f4912395828a41d2',
					status: 'modified',
				},
			]);

	const addGithubFileInterceptor = ({
		repositoryName,
		modifiedRunbookSha,
		runbookFilename = 'runbook.md',
	}) =>
		nock('https://api.github.com')
			.defaultReplyHeaders({
				'Content-Type': 'application/json',
			})
			.replyContentLength()
			.replyDate()
			.get(
				`/repos/Financial-Times/${repositoryName}/contents/${runbookFilename}`,
			)
			.query({
				ref: modifiedRunbookSha,
			})
			.reply(200, {
				_links: {
					git: `https://api.github.com/repos/Financial-Times/${repositoryName}/git/blobs/97d153f4ad7ee7405400c30f0f5916ee62e4a440`,
					html: `https://github.com/Financial-Times/${repositoryName}/blob/${modifiedRunbookSha}/${runbookFilename}`,
					self: `https://api.github.com/repos/Financial-Times/${repositoryName}/contents/${runbookFilename}?ref=${modifiedRunbookSha}`,
				},
				content: encodeBase64(runbookFixture),
				download_url: `https://raw.githubusercontent.com/Financial-Times/${repositoryName}/${modifiedRunbookSha}/${runbookFilename}?token=AAYNBTMPMQRZEG26EKGCKYC5H4LAQ`,
				encoding: 'base64',
				git_url: `https://api.github.com/repos/Financial-Times/${repositoryName}/git/blobs/97d153f4ad7ee7405400c30f0f5916ee62e4a440`,
				html_url: `https://github.com/Financial-Times/${repositoryName}/blob/${modifiedRunbookSha}/${runbookFilename}`,
				name: runbookFilename,
				path: runbookFilename,
				sha: '97d153f4ad7ee7405400c30f0f5916ee62e4a440',
				size: 5853,
				type: 'file',
				url: `https://api.github.com/repos/Financial-Times/${repositoryName}/contents/${runbookFilename}?ref=${modifiedRunbookSha}`,
			});

	const addPostGithubIssue = () =>
		nock('https://api.github.com')
			.defaultReplyHeaders({
				'Content-Type': 'application/json',
			})
			.replyContentLength()
			.replyDate()
			.post('/repos/Financial-Times/ft-repo.com/issues')
			.query(true)
			.reply(201, {
				title: 'Runbook Error',
				body:
					'There was an error with your runbook.md. You can find details on what went wrong on splunk',
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

	// check whether givenSystemCode matches an existing Biz Ops systemCode
	const addBizOpsAPIClientInterceptor = ({ systemCode }) =>
		nock(getBizOpsApiBaseUrl())
			.get(`/biz-ops/v2/node/System/${systemCode}`)
			.reply(200, {});

	const addBizOpsAPIRelationshipInterceptor = ({ systemCode }) =>
		nock(getBizOpsApiBaseUrl())
			.defaultReplyHeaders({
				'Content-Type': 'application/json',
			})
			.replyContentLength()
			.patch(`/biz-ops/v2/node/System/${systemCode}`)
			.query({
				relationshipAction: 'merge',
			})
			.reply(200, {});

	it(`should handle a single record correctly when the record contains
		a change to a runbook made via a Github pull-request`, async () => {
		const givenSystemCode = 'biz-ops-runbook-md';
		const givenRepositoryName = 'ft-repo.com';
		const givenPullRequestNumber = '89';
		const givenAwsRequestId = '66b24830-4764-4b98-9a22-7c7696ad1dda';
		const givenModifiedRunbookSha =
			'bf8ddcc3b47ef8947fbfcbd84f0e231e4eade4cb';

		const givenEvent = kinesisFixture.make(
			givenSystemCode,
			givenRepositoryName,
			givenModifiedRunbookSha,
			givenPullRequestNumber,
		);

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
		addBizOpsAPIPatchInterceptor({
			systemCode: givenSystemCode,
		});
		addBizOpsAPIClientInterceptor({
			systemCode: givenSystemCode,
		});
		addBizOpsAPIRelationshipInterceptor({
			systemCode: givenSystemCode,
		});

		const result = await handler(givenEvent, {
			awsRequestID: givenAwsRequestId,
		});
		expect(result).toEqual({
			statusCode: 200,
			body: expect.stringContaining(
				'Ingesting changed runbook.md files was successful.',
			),
			headers: {
				'Content-Type': 'application/json',
			},
		});
		// expect(nock.isDone()).toEqual(true);
	});

	it(`should raise an issue when ingest returns 400`, async () => {
		const givenSystemCode = 'biz-ops-runbook-md';
		const givenRepositoryName = 'ft-repo.com';
		const givenPullRequestNumber = '89';
		const givenAwsRequestId = '66b24830-4764-4b98-9a22-7c7696ad1dda';
		const givenModifiedRunbookSha =
			'bf8ddcc3b47ef8947fbfcbd84f0e231e4eade4cb';

		const givenEvent = kinesisFixture.make(
			givenSystemCode,
			givenRepositoryName,
			givenModifiedRunbookSha,
			givenPullRequestNumber,
		);

		addGithubPullRequestInterceptor({
			repositoryName: givenRepositoryName,
			pullRequestNumber: givenPullRequestNumber,
			modifiedRunbookSha: givenModifiedRunbookSha,
		});
		addGithubFileInterceptor({
			repositoryName: givenRepositoryName,
			modifiedRunbookSha: givenModifiedRunbookSha,
		});
		addPostGithubIssue();
		addBizOpsAPIClientInterceptor({
			systemCode: givenSystemCode,
		});

		const result = await handler(givenEvent, {
			awsRequestID: givenAwsRequestId,
		});

		expect(result).toMatchObject({
			statusCode: 400,
			body: expect.stringContaining(
				'Something went wrong during ingesting runbook.md files.',
			),
			headers: {
				'Content-Type': 'application/json',
			},
		});
		// expect(nock.isDone()).toEqual(true);
	});

	it('should use configured system code at .github/runbooks.yml', async () => {
		const givenSystemCode = 'biz-ops-runbook-md-from-change-api';
		const givenRepositoryName = 'ft-repo.com.1';
		const givenPullRequestNumber = '89';
		const givenModifiedRunbookSha =
			'bf8ddcc3b47ef8947fbfcbd84f0e231e4eade4cb';

		const givenEvent = kinesisFixture.make(
			givenSystemCode,
			givenRepositoryName,
			givenModifiedRunbookSha,
			givenPullRequestNumber,
		);

		addGithubConfigYamlInterceptor({
			repositoryName: givenRepositoryName,
			commit: givenModifiedRunbookSha,
			fixtureContent: runbooksYamlFixture,
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

		const {
			Records: [
				{
					kinesis: { data },
				},
			],
		} = givenEvent;
		const payload = JSON.parse(decodeBase64(data));
		const result = await fetchRunbook(payload, logger);
		const [firstFound] = result;
		expect(firstFound).toMatchObject({
			systemCode: 'biz-ops-runbook-md',
		});
	});

	it(`should use Change API message system code
		when .github/runbooks.yml does not exist`, async () => {
		const givenSystemCode = 'biz-ops-runbook-md-from-change-api';
		const givenRepositoryName = 'ft-repo.com.2';
		const givenPullRequestNumber = '89';
		const givenModifiedRunbookSha =
			'bf8ddcc3b47ef8947fbfcbd84f0e231e4eade4cb';

		const givenEvent = kinesisFixture.make(
			givenSystemCode,
			givenRepositoryName,
			givenModifiedRunbookSha,
			givenPullRequestNumber,
		);

		addGithubPullRequestInterceptor({
			repositoryName: givenRepositoryName,
			pullRequestNumber: givenPullRequestNumber,
			modifiedRunbookSha: givenModifiedRunbookSha,
		});
		addGithubFileInterceptor({
			repositoryName: givenRepositoryName,
			modifiedRunbookSha: givenModifiedRunbookSha,
		});

		const {
			Records: [
				{
					kinesis: { data },
				},
			],
		} = givenEvent;
		const payload = JSON.parse(decodeBase64(data));
		const result = await fetchRunbook(payload, logger);
		const [firstFound] = result;
		expect(firstFound).toMatchObject({
			systemCode: 'biz-ops-runbook-md-from-change-api',
		});
	});

	it(`should use system code based on file name`, async () => {
		const givenSystemCode = 'biz-ops-runbook-md-from-change-api';
		const givenRunbookFilename = 'file-based-system-code_runbook.md';
		const givenRepositoryName = 'ft-repo.com.3';
		const givenPullRequestNumber = '89';
		const givenModifiedRunbookSha =
			'bf8ddcc3b47ef8947fbfcbd84f0e231e4eade4cb';

		const givenEvent = kinesisFixture.make(
			givenSystemCode,
			givenRepositoryName,
			givenModifiedRunbookSha,
			givenPullRequestNumber,
		);

		addGithubPullRequestInterceptor({
			repositoryName: givenRepositoryName,
			pullRequestNumber: givenPullRequestNumber,
			modifiedRunbookSha: givenModifiedRunbookSha,
			filename: givenRunbookFilename,
		});
		addGithubFileInterceptor({
			repositoryName: givenRepositoryName,
			modifiedRunbookSha: givenModifiedRunbookSha,
			runbookFilename: givenRunbookFilename,
		});

		const {
			Records: [
				{
					kinesis: { data },
				},
			],
		} = givenEvent;
		const payload = JSON.parse(decodeBase64(data));
		const result = await fetchRunbook(payload, logger);
		const [firstFound] = result;
		expect(firstFound).toMatchObject({
			systemCode: 'file-based-system-code',
		});
	});
});

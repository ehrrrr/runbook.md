jest.mock('../src/lib/external-apis');
jest.mock('../src/lib/code-validation');

const runbookMd = require('../src/lib/parser');
const externalApis = require('../src/lib/external-apis');
const bizOpsValidation = require('../src/lib/code-validation');

const { ingest } = require('../src/commands/ingest');

const s3oUsername = 'dummyUser';
const payload = {
	systemCode: 'system-code',
	writeToBizOps: false,
	bizOpsApiKey: 'dummyKey',
	content: '# this is a name\ndescription\n## service tier\nbronze',
};

describe('ingest command', () => {
	const runIngest = async (payloadOverrides = {}) => {
		const testPayload = { ...payload, ...payloadOverrides };
		let result;
		try {
			result = await ingest(s3oUsername, testPayload);
		} catch (error) {
			result = error;
			result.rejected = true;
		}
		const { data } = await runbookMd.parseRunbookString(payload.content);
		return { result, parseData: data };
	};

	const spies = {};

	beforeEach(() => {
		spies.validate = jest
			.spyOn(externalApis, 'validate')
			.mockResolvedValue({});
		spies.updateBizOps = jest
			.spyOn(externalApis, 'updateBizOps')
			.mockResolvedValue({ status: 200 });
		spies.transformCodesIntoNestedData = jest
			.spyOn(bizOpsValidation, 'transformCodesIntoNestedData')
			.mockResolvedValue({ expandedData: {}, errors: [] });
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	describe('when all parameters are provided', () => {
		test('parses, validates and imports to biz-ops', async () => {
			const { result, parseData } = await runIngest({
				writeToBizOps: true,
			});
			expect(spies.transformCodesIntoNestedData).toHaveBeenCalled();
			expect(spies.validate).toHaveBeenCalled();
			expect(spies.updateBizOps).toHaveBeenCalled();
			expect(result).toMatchObject({
				message: expect.stringMatching('Biz Ops has been updated'),
				details: {
					parseData,
				},
			});
		});
	});

	describe('when runbook content is omitted', () => {
		test('fail', async () => {
			const { result } = await runIngest({
				content: undefined,
			});
			expect(result).toMatchObject({
				rejected: true,
				message: expect.stringMatching(
					'Please supply RUNBOOK.md content',
				),
			});
		});
	});

	describe('when systemCode is omitted', () => {
		test('and writing to biz-ops is disabled, succeed', async () => {
			const { result, parseData } = await runIngest({
				systemCode: undefined,
			});
			expect(result).toMatchObject({
				message: expect.stringMatching('Parse & Validation Complete'),
				details: {
					parseData,
				},
			});
		});

		test('and writing to biz-ops is enabled, fail', async () => {
			const { result, parseData } = await runIngest({
				systemCode: undefined,
				writeToBizOps: true,
			});
			expect(result).toMatchObject({
				rejected: true,
				message: expect.stringMatching('Please supply a systemCode'),
				details: {
					parseData,
				},
			});
		});
	});

	describe('when bizOpsApiKey is omitted', () => {
		test('and writing to biz-ops is disabled, succeed', async () => {
			const { result, parseData } = await runIngest({
				bizOpsApiKey: undefined,
			});
			expect(result).toMatchObject({
				message: expect.stringMatching('Parse & Validation Complete'),
				details: {
					parseData,
				},
			});
		});

		test('and writing to biz-ops is enabled, fail', async () => {
			const { result, parseData } = await runIngest({
				bizOpsApiKey: undefined,
				writeToBizOps: true,
			});
			expect(result).toMatchObject({
				rejected: true,
				message: expect.stringMatching(
					'Please supply a Biz-Ops API key',
				),
				details: {
					parseData,
				},
			});
		});
	});
});

jest.mock('../src/lib/external-apis');
jest.mock('../src/lib/code-validation');

const runbookMd = require('../src/lib/parser');
const externalApis = require('../src/lib/external-apis');
const bizOpsValidation = require('../src/lib/code-validation');

const { ingest } = require('../src/commands/ingest');

const payload = {
	systemCode: 'system-code',
	shouldWriteToBizOps: false,
	bizOpsApiKey: 'dummyKey',
	content: '# this is a name\ndescription\n## service tier\nbronze',
};

describe('ingest command', () => {
	const runIngest = async (payloadOverrides = {}) => {
		const testPayload = { ...payload, ...payloadOverrides };
		let result;
		try {
			result = await ingest(testPayload);
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
				shouldWriteToBizOps: true,
			});
			expect(spies.transformCodesIntoNestedData).toHaveBeenCalled();
			expect(spies.validate).toHaveBeenCalled();
			expect(spies.updateBizOps).toHaveBeenCalled();
			expect(result).toMatchObject({
				code: expect.stringMatching('parse-ok-update-ok'),
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
				code: expect.stringMatching('no-content'),
			});
		});
	});

	describe('when systemCode is omitted', () => {
		test('and writing to biz-ops is disabled, succeed', async () => {
			const { result, parseData } = await runIngest({
				systemCode: undefined,
			});
			expect(result).toMatchObject({
				code: expect.stringMatching('parse-ok-update-skipped'),
				details: {
					parseData,
				},
			});
		});

		test('and writing to biz-ops is enabled, fail', async () => {
			const { result, parseData } = await runIngest({
				systemCode: undefined,
				shouldWriteToBizOps: true,
			});
			expect(result).toMatchObject({
				rejected: true,
				code: expect.stringMatching('parse-ok-systemCode-missing'),
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
				code: expect.stringMatching('parse-ok-update-skipped'),
				details: {
					parseData,
				},
			});
		});

		test('and writing to biz-ops is enabled, fail', async () => {
			const { result, parseData } = await runIngest({
				bizOpsApiKey: undefined,
				shouldWriteToBizOps: true,
			});
			expect(result).toMatchObject({
				rejected: true,
				code: expect.stringMatching('parse-ok-apiKey-missing'),
				details: {
					parseData,
				},
			});
		});
	});
});

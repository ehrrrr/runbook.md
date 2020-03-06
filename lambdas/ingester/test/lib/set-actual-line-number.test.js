const stripHtmlComments = require('strip-html-comments');
const schema = require('../../src/lib/get-configured-schema');
const {
	setActualLineNumber,
} = require('../../src/commands/ingest/set-actual-line-number');
const runbookMd = require('../../src/lib/parser');
const { runbookWithComments } = require('../fixtures');

const errorMessages = {
	EXPECTED_LIST: expect.stringContaining('expected a list'),
	INVALID_ENUM_VALUE: expect.stringContaining('Must provide a value'),
};

describe('setActualLineNumber', () => {
	it('should set actualLine prop in parse result errors', async () => {
		await schema.ready();
		const runbookWithoutComments = stripHtmlComments(runbookWithComments);
		const parseResult = await runbookMd.parseMarkdownString(
			runbookWithoutComments,
		);
		setActualLineNumber(
			runbookWithComments,
			runbookWithoutComments,
			parseResult.errors,
		);

		expect(parseResult.errors).toEqual([
			{
				actualLine: 9,
				line: 7,
				message: errorMessages.EXPECTED_LIST,
			},
			{
				actualLine: 20,
				line: 15,
				message: errorMessages.INVALID_ENUM_VALUE,
			},
			{
				actualLine: 27,
				line: 19,
				message: errorMessages.EXPECTED_LIST,
			},
		]);
	});
});

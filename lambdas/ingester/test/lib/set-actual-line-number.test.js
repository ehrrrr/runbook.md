const stripHtmlComments = require('strip-html-comments');
const {
	setActualLineNumber,
} = require('../../src/commands/ingest/set-actual-line-number');
const runbookMd = require('../../src/lib/parser');
const { runbookWithComments } = require('../fixtures');

describe('setActualLineNumber', () => {
	it('should set actualLine prop in parse result errors', async () => {
		const runbookWithoutComments = stripHtmlComments(runbookWithComments);
		const parseResult = await runbookMd.parseRunbookString(
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
				message: 'property "replaces" has no value',
			},
			{
				actualLine: 20,
				line: 15,
				message: 'property "dataRecoveryProcessType" has no value',
			},
			{
				actualLine: 27,
				line: 19,
				message: 'property "healthchecks" has no value',
			},
		]);
	});
});

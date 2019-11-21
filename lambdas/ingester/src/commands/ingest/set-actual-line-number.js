// line prop in parseResult.errors is counted with a runbook which is removed all comments.
// actualLine prop is the actual line number which includes comment lines

const setActualLineNumber = (content, contentWithoutComments, parseErrors) => {
	const contentLines = content.split('\n');
	const contentLinesWithoutComments = contentWithoutComments.split('\n');

	parseErrors.forEach(({ line }, index) => {
		if (line) {
			const targetHeading = contentLinesWithoutComments[line - 1];
			const actualLineIndex = contentLines.findIndex(
				contentLine => contentLine === targetHeading,
			);

			parseErrors[index].actualLine = actualLineIndex + 1;
		}
	});
};

module.exports = { setActualLineNumber };

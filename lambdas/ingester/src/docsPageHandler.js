const fs = require('fs').promises;
const path = require('path');
const showdown = require('showdown');
const { createLambda } = require('./lib/lambda');
const response = require('./lib/response');
const template = require('./templates/docs-page');

showdown.setFlavor('github');
const markdownParser = new showdown.Converter({
	simplifiedAutoLink: true,
});

const index = async event => {
	const { page } = event.pathParameters;
	console.log(page, path.join(process.cwd(), `docs/${page}.md`));
	const content = await fs.readFile(
		path.join(process.cwd(), `docs/${page}.md`),
		'utf8',
	);

	console.log(page, content);

	return response.renderPage(
		template,
		{
			title: `Changes documentation - ${page}`,
			pageTitle: `Changes documentation - ${page}`,
			layout: 'docs',
			data: { content: markdownParser.makeHtml(content) },
		},
		event,
	);
};

exports.handler = createLambda(index);

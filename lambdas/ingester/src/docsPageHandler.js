const showdown = require('showdown');
const { createLambda } = require('./lib/lambda');
const response = require('./lib/response');
const template = require('./templates/docs-page');

/* eslint-disable global-require */
const pages = {
	quickstart: require('../../../docs/quickstart.md'),
	'dependency-details': require('../../../docs/dependency-details.md'),
};
/* eslint-enable global-require */

showdown.setFlavor('github');
const markdownParser = new showdown.Converter({
	simplifiedAutoLink: true,
});

const index = async event => {
	const { page } = event.pathParameters;
	const content = pages[page].default;

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

const { createLambda } = require('./lib/lambda');
const { renderPage } = require('./lib/response');
const template = require('./templates/about-page');

const handler = async event => {
	return renderPage(template, { layout: 'docs' }, event);
};

exports.handler = createLambda(handler);

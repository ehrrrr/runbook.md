const schema = require('@financial-times/biz-ops-schema');
const { createLambda } = require('./lib/lambda');
const { readSystem } = require('./lib/biz-ops-client');
const runbookMd = require('../../../libraries/parser');

const uncamelCase = str =>
	str
		.replace(/([a-z])([A-Z])/, '$1 $2')
		.replace(/^[a-z]/, $0 => $0.toUpperCase());

const handler = async event => {
	const { excludedProperties } = runbookMd(schema);
	const { systemCode } = event.queryStringParameters;

	const data = await readSystem(systemCode);
	excludedProperties.forEach(prop => {
		if (prop in data) {
			delete data[prop];
		}
	});
	const preamble = `<!--
    Written in the format prescribed by https://github.com/Financial-Times/runbook.md.
    Any future edits should abide by this format.
-->
# ${data.name}

${data.description}
`;
	delete data.name;
	delete data.description;

	const systemSchema = schema.getType('System', { groupProperties: true });

	const fields = []
		.concat(
			...Object.values(systemSchema.fieldsets).map(({ properties }) =>
				Object.keys(properties),
			),
		)
		.filter(prop => prop in data);

	const md = `${preamble}

${fields
	.map(
		prop => `
## ${uncamelCase(prop)}

${data[prop]}
`,
	)
	.join('\n')}
`;

	return {
		statusCode: 200,
		body: md,
	};
};

exports.handler = createLambda(handler);

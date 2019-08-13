const schema = require('@financial-times/biz-ops-schema');
const { createLambda } = require('./lib/lambda');
const { readSystem } = require('./lib/biz-ops-client');
const runbookMd = require('../../../libraries/parser');

const desirableFields = [
	'primaryURL',
	'replaces',
	'hostPlatform',
	'containsPersonalData',
	'containsSensitiveData',
	'deliveredBy',
	'supportedBy',
	'knownAboutBy',
	'dependencies',
	'healthchecks',
	'failoverArchitectureType',
	'failoverProcessType',
	'failbackProcessType',
	'failoverDetails',
	'dataRecoveryProcessType',
	'dataRecoveryDetails',
	'releaseProcessType',
	'releaseDetails',
	'rollbackProcessType',
	'keyManagementProcessType',
	'keyManagementDetails',
];

const uncamelCase = str =>
	str
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/^[a-z]/, $0 => $0.toUpperCase());

const handler = async event => {
	const { excludedProperties } = runbookMd(schema);
	const { systemCode } = event.queryStringParameters;

	const data = await readSystem(systemCode);
	const preamble = `<!--
    Written in the format prescribed by https://github.com/Financial-Times/runbook.md.
    Any future edits should abide by this format.
-->
# ${data.name || '<!-- Enter a name  -->'}

${data.description || '<!-- Enter a description  -->'}
`;
	delete data.name;
	delete data.description;

	const systemSchema = schema.getType('System', { groupProperties: true });

	const enums = schema.getEnums();

	const fields = []
		.concat(
			...Object.values(systemSchema.fieldsets).map(({ properties }) =>
				Object.entries(properties).map(
					([name, { isRelationship, hasMany, type }]) => ({
						name,
						isRelationship,
						hasMany,
						type,
					}),
				),
			),
		)
		.filter(({ name }) => name in data || desirableFields.includes(name))
		.filter(({ name }) => !excludedProperties.includes(name));

	const outputValue = ({ name, isRelationship, hasMany, type }) => {
		if (name in data) {
			return isRelationship && hasMany
				? data[name].map(code => `- ${code}`).join('\n')
				: data[name];
		}

		if (isRelationship) {
			return `<!--
${
	hasMany
		? `Enter a markdown list of valid ${type} codes`
		: `Enter a valid ${type} code`
}
-->`;
		}

		if (type in enums) {
			return `<!--
Choose from ${Object.keys(enums[type]).join(', ')}
-->`;
		}

		if (type === 'Boolean') {
			return `<!--
Choose Yes or No
-->`;
		}
		return `<!--
Enter descriptive text, or delete this comment and the heading above
-->`;
	};

	const md = `${preamble}

${fields
	.map(
		field => `
## ${uncamelCase(field.name)}

${outputValue(field)}
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
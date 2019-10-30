const schema = require('@financial-times/biz-ops-schema');
const { graphql } = require('./biz-ops-client');
const runbookMd = require('../../../../libraries/parser');

const isForbiddenType = type => ['DateTime', 'Date', 'Time'].includes(type);

const desirableFields = [
	'primaryURL',
	'replaces',
	'hostPlatform',
	'architecture',
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
	'firstLineTroubleshooting',
	'secondLineTroubleshooting',
];

const uncamelCase = str =>
	str
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.replace(/^[a-z]/, $0 => $0.toUpperCase());

exports.generate = async systemCode => {
	const { excludedProperties } = runbookMd(schema);

	const systemSchema = schema.getType('System', { groupProperties: true });

	const enums = schema.getEnums();

	// eslint-disable-next-line unicorn/prefer-flat-map
	const fields = []
		.concat(
			...Object.values(systemSchema.fieldsets).map(({ properties }) =>
				Object.entries(properties).map(([name, def]) => ({
					name,
					...def,
				})),
			),
		)
		.filter(({ type }) => !isForbiddenType(type))
		.filter(({ name }) => desirableFields.includes(name))
		.filter(
			({ name, deprecationReason }) =>
				!deprecationReason && !excludedProperties.includes(name),
		);

	const {
		data: { System: data },
	} = await graphql(
		`query getSystem($systemCode: String!) {
	   System (code: $systemCode) {code ${fields
			.map(
				({ name, isRelationship }) =>
					`${name} ${isRelationship ? ' {code}' : ''}`,
			)
			.join(' ')}}
	}`,
		{ systemCode },
	);

	const preamble = `<!--
    Written in the format prescribed by https://github.com/Financial-Times/runbook.md.
    Any future edits should abide by this format.
-->
# ${data.name || '<!-- Enter a name  -->'}

${data.description || '<!-- Enter a description  -->'}`;
	delete data.name;
	delete data.description;

	const outputValue = ({
		name,
		isRelationship,
		hasMany,
		type,
		description,
	}) => {
		if (data[name] !== null) {
			if (type === 'Boolean') {
				return data[name] ? 'Yes' : 'No';
			}

			if (isRelationship && hasMany) {
				return data[name].map(({ code }) => `- ${code}`).join('\n');
			}

			if (isRelationship) {
				return data[name].code;
			}

			return data[name];
		}

		if (isRelationship) {
			return `<!--
${
	hasMany
		? `Enter a markdown list of valid ${type} codes, or delete
this comment and the heading above if not applicable to this system.`
		: `Enter a valid ${type} code, or delete this comment and the
heading above if not applicable to this system.`
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
Enter descriptive text satisfying the following:
${description}
...or delete this comment and the heading above if not applicable
-->`;
	};

	const md = `${preamble}
${fields
	.map(
		field => `
## ${uncamelCase(field.name)}
${outputValue(field)}`,
	)
	.join('\n')}`;

	return md;
};

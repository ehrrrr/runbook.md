const remarkParse = require('remark-parse');
const createStream = require('unified-stream');
const unified = require('unified');
const createBizopsNameNode = require('./tree-mutators/create-bizops-name-node');
const createBizopsDescriptionNode = require('./tree-mutators/create-bizops-description-node');
const createBizopsPropertyNodes = require('./tree-mutators/create-bizops-property-nodes');
const setBizopsPropertyNames = require('./tree-mutators/set-bizops-property-names');
const coerceBizopsPropertiesToType = require('./tree-mutators/coerce-bizops-properties-to-type');
const validateBizopsProperties = require('./tree-mutators/validate-bizops-properties');
const stringifyBoast = require('./unist-stringifiers/stringify-boast');

/* @param schema: bizOpsSchema singleton */
const unifiedProcessor = function(schema) {
	return async () => {
		await schema.refresh();

		const types = schema.getTypes();

		const system = schema.getTypes().find(type => type.name === 'System');

		const typeNames = new Set(types.map(type => type.name));

		const validateProperty = (key, value) => {
			return schema.validators.validateProperty('System', key, value);
		};

		return unified()
			.use(remarkParse)
			.use(createBizopsNameNode)
			.use(createBizopsPropertyNodes)
			.use(createBizopsDescriptionNode)
			.use(setBizopsPropertyNames, {
				systemProperties: system.properties,
			})
			.use(coerceBizopsPropertiesToType, {
				systemProperties: system.properties,
				typeNames,
				primitiveTypesMap: schema.primitiveTypesMap,
				enums: schema.getEnums(),
			})
			.use(validateBizopsProperties, {
				validateProperty,
			})
			.use(stringifyBoast);
	};
};

module.exports = schema => {
	const runbookMd = unifiedProcessor(schema);

	runbookMd.createStream = async function() {
		return createStream(await this());
	};

	runbookMd.parseRunbookString = async function(runbook) {
		const processor = await this();
		const vfile = await processor.process(runbook);
		try {
			return JSON.parse(vfile.contents);
		} catch (error) {
			throw new Error(
				'failed when trying to JSON parse the stringified output from `runbookmd`',
			);
		}
	};

	runbookMd.excludedProperties = validateBizopsProperties.excludedProperties;

	return runbookMd;
};

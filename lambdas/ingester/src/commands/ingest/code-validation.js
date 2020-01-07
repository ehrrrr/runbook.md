const schema = require('../../lib/get-configured-schema');
const { queryBizOps } = require('../../lib/external-apis');

const relatedBizOpsFields = {
	Group: ['name', 'isActive'].join(),
	Healthcheck: ['url', 'isLive'].join(),
	Package: ['name'],
	Person: ['name', 'email', 'phone', 'isActive'].join(),
	Repository: ['url', 'isArchived'].join(),
	System: ['name', 'serviceTier', 'lifecycleStage'].join(),
	Team: [
		'name',
		'email',
		'slack',
		'phone',
		'supportRota',
		'contactPref',
		'isActive',
		`productOwners{${[
			'code',
			'name',
			'email',
			'phone',
			'isActive',
		].join()}}`,
		`techLeads{${['code', 'name', 'email', 'phone', 'isActive'].join()}}`,
		`group{${['code', 'name', 'isActive'].join()}}`,
	].join(),
};

const pushUnique = (accumulator, valuesToAdd) => {
	valuesToAdd.forEach(valueToAdd => {
		if (
			!accumulator.find(
				existing =>
					valueToAdd.type === existing.type &&
					valueToAdd.code === existing.code,
			)
		)
			accumulator.push(valueToAdd);
	});
};

function generateListOfNodes(type, value) {
	if (Array.isArray(value)) {
		return value.flatMap(element => generateListOfNodes(type, element));
	}
	return [{ type, code: value.code || value }];
}

const getTypesAndCodesFromRelationships = (systemSchema, data) =>
	Object.entries(data).reduce((accumulator, [property, value]) => {
		const { type, isRelationship } = systemSchema.properties[property];
		if (isRelationship && value) {
			pushUnique(accumulator, generateListOfNodes(type, value));
		}
		return accumulator;
	}, []);

const sanitisedKey = (type, code) =>
	`${type}_${code.replace(/[-,]/g, '_').replace(/\W/g, '')}`;

const buildGraphQLQuery = bizOpsCodes => {
	const propertyMappings = {};
	const query = `query getStuff {
		${bizOpsCodes
			.map(({ type, code }) => {
				propertyMappings[sanitisedKey(type, code)] = { type, code };
				return `${sanitisedKey(
					type,
					code,
				)}:${type} (code:"${code}") {code ${relatedBizOpsFields[type] ||
					''}}`;
			})
			.join('\n')}
		}`;
	return { query, propertyMappings };
};

const formatBizOpsResponse = (bizOpsResponse, propertyMappings) => {
	const bizOpsData = {};
	const errors = [];
	Object.entries(bizOpsResponse.data).forEach(([key, value]) => {
		const { type, code } = propertyMappings[key];
		if (value === null) {
			errors.push({
				message: `There is no ${type} with a code of ${code} stored within Biz Ops`,
			});
		} else {
			bizOpsData[key] = value;
		}
	});
	return { bizOpsData, errors };
};

function matchBizOpsData(bizOpsData, type, value) {
	if (Array.isArray(value)) {
		return value.map(element => matchBizOpsData(bizOpsData, type, element));
	}
	return bizOpsData[sanitisedKey(type, value.code || value)];
}

const replaceCodesWithData = (systemSchema, data, bizOpsData) => {
	const expandedData = {};
	Object.entries(data).forEach(([property, value]) => {
		expandedData[property] = value;
		const { type, isRelationship } = systemSchema.properties[property];
		if (isRelationship && value) {
			expandedData[property] = matchBizOpsData(bizOpsData, type, value);
		}
	});
	return expandedData;
};

const transformCodesIntoNestedData = async data => {
	const systemSchema = schema.getTypes().find(type => type.name === 'System');
	const uniqueBizOpsCodes = getTypesAndCodesFromRelationships(
		systemSchema,
		data,
	);
	if (!uniqueBizOpsCodes.length) {
		return { expandedData: {}, errors: [] };
	}
	const { query, propertyMappings } = buildGraphQLQuery(uniqueBizOpsCodes);
	const { json: bizOpsResponse } = await queryBizOps(
		process.env.BIZ_OPS_API_KEY,
		query,
	);
	const { bizOpsData, errors } = formatBizOpsResponse(
		bizOpsResponse,
		propertyMappings,
	);
	if (errors.length) {
		return { expandedData: {}, errors };
	}
	return {
		expandedData: replaceCodesWithData(systemSchema, data, bizOpsData),
		errors: [],
	};
};

module.exports = {
	transformCodesIntoNestedData,
};

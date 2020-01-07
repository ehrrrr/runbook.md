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

const getTypesAndCodesFromRelationships = (systemSchema, data) => {
	console.log("DEBUG",data);
	return Object.entries(data).reduce((accumulator, [property, value]) => {
		const { type, isRelationship } = systemSchema.properties[property];
		if (isRelationship) {
			if (typeof value === 'string') {
				pushUnique(accumulator, [{ type, code: value }]);
			} else {
				pushUnique(
					accumulator,
					value.map(code => ({ type, code })),
				);
			}
		}
		return accumulator;
	}, []);
};

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

const replaceCodesWithData = (systemSchema, data, bizOpsData) => {
	const expandedData = {};
	Object.entries(data).forEach(([property, value]) => {
		const { type, isRelationship } = systemSchema.properties[property];
		if (isRelationship) {
			if (typeof value === 'string') {
				expandedData[property] = bizOpsData[sanitisedKey(type, value)];
			} else {
				expandedData[property] = value.map(
					code => bizOpsData[sanitisedKey(type, code)],
				);
			}
		} else {
			expandedData[property] = value;
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

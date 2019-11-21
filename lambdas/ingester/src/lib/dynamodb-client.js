const AWS = require('aws-sdk');

const dynamodb = new AWS.DynamoDB({
	apiVersion: '2012-08-10',
	region: 'eu-west-1',
});

const TABLE_NAME = 'biz-ops-runbook-md.results';

const recordPayload = (repository, commitSha, result) => ({
	CommitHash: {
		S: commitSha,
	},
	Repository: {
		S: repository,
	},
	...(result
		? {
				ResultJson: {
					S: JSON.stringify(result),
				},
		  }
		: {}),
});

const put = (repository, commitSha, result) =>
	dynamodb
		.putItem({
			Item: recordPayload(repository, commitSha, result),
			TableName: TABLE_NAME,
		})
		.promise();

const get = (repository, commitSha) =>
	dynamodb
		.getItem({
			Key: recordPayload(repository, commitSha),
			TableName: TABLE_NAME,
			ProjectionExpression: 'ResultJson',
		})
		.promise()
		.then(({ Item: { ResultJson: { S: result } = {} } = {} }) =>
			JSON.parse(result),
		);

const batchGet = (repository, hashArray) =>
	dynamodb
		.batchGetItem({
			RequestItems: {
				[TABLE_NAME]: {
					Keys: hashArray.map(hash => ({
						Repository: {
							S: repository,
						},
						CommitHash: {
							S: hash,
						},
					})),
					ProjectionExpression: 'ResultJson',
				},
			},
		})
		.promise()
		.then(({ Responses: { [TABLE_NAME]: items } = {} }) =>
			items.map(({ ResultJson: { S: result } }) => JSON.parse(result)),
		);

module.exports = {
	put,
	get,
	batchGet,
};

const mapToKinesisDataFormat = data =>
	Buffer.from(JSON.stringify(data).toString('base64'));

const createKinesisMessage = (records = []) => ({
	Records: records.map(mapToKinesisDataFormat).map(data => ({
		eventID:
			'shardId-000000000000:49545115243490985018280067714973144582180062593244200961',
		eventVersion: '1.0',
		kinesis: {
			approximateArrivalTimestamp: 1428537600,
			partitionKey: 'partitionKey-3',
			data,
			kinesisSchemaVersion: '1.0',
			sequenceNumber:
				'49545115243490985018280067714973144582180062593244200961',
		},
		invokeIdentityArn: 'arn:aws:iam::EXAMPLE',
		eventName: 'aws:kinesis:record',
		eventSourceARN: 'arn:aws:kinesis:EXAMPLE',
		eventSource: 'aws:kinesis',
		awsRegion: 'eu-west-1',
	})),
});

const get = recordsData => {
	const recordsDataArray = Array.isArray(recordsData)
		? recordsData
		: [recordsData];
	return createKinesisMessage(recordsDataArray);
};

const make = (
	systemCode = 'biz-ops-runbook-md',
	repositoryName = 'Financial-Times/runbook.md',
	runbookSha = 'bf8ddcc3b47ef8947fbfcbd84f0e231e4eade4cb',
	pullRequestNumber = '1',
) =>
	get({
		user: {
			githubName: 'Captain Planet',
			email: 'captain.planet@ft.com',
		},
		systemCode,
		environment: 'prod',
		notifications: { slackChannels: ['rel-eng-changes'] },
		gitRepositoryName: `Financial-Times/${repositoryName}`,
		changeMadeBySystem: 'circleci',
		commit: runbookSha,
		extraProperties: {},
		timestamp: '2019-07-29T13:07:16.216Z',
		loggerContext: {
			traceId: '8faf58eb-8049-4299-8d1e-5c7488e49403',
			clientSystemCode: systemCode,
		},
		isProdEnv: true,
		salesforceSystemId: 'a224G000002WwlGQAS',
		systemData: {
			name: 'Biz Ops RUNBOOK.MD Importer',
			SF_ID: 'a224G000002WwlGQAS',
			serviceTier: 'Bronze',
			dataOwner: null,
			supportedBy: { email: 'reliability.engineering@ft.com' },
			deliveredBy: {
				productOwners: [{ email: 'sarah.wells@ft.com' }],
				group: {
					code: 'operationsreliability',
					name: 'Operations & Reliability',
				},
			},
		},
		githubData: {
			title: 'Log github API call failures',
			htmlUrl: `https://github.com/Financial-Times/${repositoryName}/pull/${pullRequestNumber}`,
		},
		eventId:
			'shardId-000000000000:49597846710684593105580396104934657996711168234355687426',
	});

module.exports = {
	get,
	make,
};

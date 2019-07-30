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

module.exports = {
	get,
};

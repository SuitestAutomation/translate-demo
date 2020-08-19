import fetch from 'node-fetch';

const fetchAll = async <T extends any>(url: string, headers: {[key: string]: string}) => {
	let next: string = url;
	const values: T[] = [];

	while (next) {
		const res = await fetch(next, {headers});

		if (!res.ok) {
			throw new Error(`Failed to fetch the result: ${res.status} - ${res.statusText}`);
		}

		const data = await res.json();

		next = typeof data.next === 'string' ? data.next : '';
		values.push(...(data.values ?? []));
	}

	return values;
};

/**
 * Load necessary data using Suitest Network API
 */
export const getData = async (
	tokenId: string,
	tokenPassword: string,
	testPackRunId: string,
	testResultId: string,
	appId: string,
	versionId: string,
) => {
	// Suitest Network API base URL
	const base = 'https://the.suite.st/api/public/v3/';
	// Authentication headers
	const headers = {
		'X-TokenId': tokenId,
		'X-TokenPassword': tokenPassword,
		'accept': 'application/json',
	};
	// Load both test pack run and specific test result
	const requests = await Promise.all([
		fetch(`${base}test-pack-runs/${testPackRunId}?detailed=true`, {headers}),
		fetch(`${base}results/${testResultId}`, {headers}),
	]);

	const failed = requests.find(req => !req.ok);
	if (failed) {
		throw new Error(`Failed to fetch the result: ${failed.status} - ${failed.statusText}`);
	}

	const [testPackRun, testResult] = await Promise.all(requests.map(req => req.json()));

	// Find device name
	const runResult = testPackRun.list.find((run: {resultId: string}) => run.resultId === testResultId);

	if (!runResult) {
		throw new Error('Seems test pack run ID and test result ID do not match');
	}

	const {deviceId, testId} = runResult;

	// Fetch current device
	const devices = await fetchAll<{
		deviceId: string,
		customName: string,
		manufacturer: string,
		model: string,
	}>(`${base}devices`, headers);
	const device = devices.find((dev: any) => dev.deviceId === deviceId);
	const deviceName = device ?
		(device.customName
			? device.customName
			: (device.manufacturer + device.model))
			: `Unknown device (${deviceId})`;

	// Fetch current test
	const tests = await fetchAll<{
		testId: string,
		title: string,
	}>(`${base}apps/${appId}/versions/${versionId}/tests`, headers);
	const test = tests.find((test: any) => test.testId === testId);
	const testName = test?.title ?? `Unknown test (${testId})`;

	// Create snippet names array
	const snippetNames = Object.fromEntries(tests.map((test: any) => ([test.testId, {name: test.title}])));

	// Return all the data, that is needed to render test result
	return {
		testDefinition: testResult.detailed.def,
		snippetDefinitions: testResult.detailed.snippets,
		elementNames: testResult.detailed.elements,
		testResults: testResult.detailed.results,
		appConfig: testPackRun.effectiveAppConfig,
		snippetNames,
		deviceName,
		testName,
	};
};
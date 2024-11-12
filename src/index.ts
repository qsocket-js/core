import { createEngineIOLatest, createEngineIOClientLatest } from '@qsocket/transport';
import QSocketServer from './interfaces/QSocketServer';
import QSocketClient from './interfaces/QSocketClient';

import http from 'http';
const httpServerLatest = http.createServer().listen(3000);

const serverTransportLatest = createEngineIOLatest(httpServerLatest);

const serverLatest = new QSocketServer(serverTransportLatest, { on: true, prefix: 'SERVER' });

const serverNamespaceLatest = serverLatest.createNamespace('test-0');
serverLatest.createNamespace('test-1');
serverLatest.createNamespace('test-2');
serverLatest.createNamespace('test-3');
serverLatest.createNamespace('test-4');

serverNamespaceLatest.on('connection', () => {
	console.log('КОНЕКШН');
});

new Array(5)
	.fill(createEngineIOClientLatest('http://localhost:3000'))
	.map((transport) => new QSocketClient(transport, { on: true, prefix: 'CLIENT' }))
	.map((client, i) => client.createNamespace(`test-${i}`))
	.forEach((namespace, index) => {
		namespace.on('connection', (connection) => {
			const event = `test-${Math.floor(index / 10)}`;
			connection.on(event, (data) => {
				console.log(event, data);
				return void 0;
			});
		});
	});

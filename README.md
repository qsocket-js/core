# @qsocket/core

![npm version](https://img.shields.io/npm/v/@qsocket/core) ![npm downloads](https://img.shields.io/npm/dm/@qsocket/core) ![GitHub license](https://img.shields.io/github/license/qsocket/qsocket)

`@qsocket/core` is a powerful and versatile library for inter-process communication, enabling seamless data exchange both in the browser and in Node.js environments. Leveraging the `@qsocket/protocol` package to convert data into a byte-stream (buffer) format, `@qsocket/core` allows for diverse data types to be transmitted within a single message, preserving the integrity and structure of information. With built-in automatic packet compression, it minimizes network load and improves performance when handling large volumes of data.

The core strength of `@qsocket/core` lies in its flexibility and readiness to work with a wide range of transport options: WebSocket, LongPolling, TCP sockets, file sockets, Unix sockets, and Windows Pipes. Currently, the library supports `engine.io` for data transmission, but future updates will expand support for additional transport options.

Stay updated on the latest developments in the [`@qsocket/transport`](https://www.npmjs.com/package/@qsocket/transport) package—an essential tool for working with `@qsocket/core`. This package provides standardized, tested, and wrapped transports that easily integrate with `@qsocket/core`. This approach allows you to flexibly manage the transport layer without altering your core application code. `@qsocket/transport` guarantees stability, scalability, and growth potential for your application, allowing `@qsocket/core` to remain the reliable, trusted backbone of your communication layer.

With `@qsocket/core`, you gain reliability, scalability, and peak efficiency—everything you need for stable and fast inter-process communication, essential for applications where inter-process interaction is mission-critical.

## Key Features

- **Multi-Transport Support**: Currently supports `engine.io`; future releases will add TCP sockets, file sockets, Unix sockets, and Windows Pipes.
- **Buffer-Based Data Transfer**: All data is transmitted as buffers, enabling efficient handling of binary data.
- **Flexible Interface**: The library interacts with transports via a unified interface, making it easy to add support for new transport protocols.
- **Namespace and Event Handling**: Support for namespaces and events makes it easy to organize and manage data exchange logic between client and server.
- **Configurable Data Compression**: Option to enable data compression (GZIP and DEFLATE) with customizable thresholds and algorithms.

## Installation

To install `QSocket` and the necessary transport package, use the following command:

\`\`\`bash
npm install @qsocket/core @qsocket/transport
\`\`\`

## Usage

### Server

Create a `QSocket` server with `engine.io` as the transport:

\`\`\`typescript
import { QSocketServer } from '@qsocket/core';
import { createEngineIOLatest } from '@qsocket/transport';
import { createServer } from 'http';

const httpServer = createServer();
httpServer.listen(3000);

const transport = createEngineIOLatest(httpServer);
const server = new QSocketServer(transport, {
compressor: {
on: true,
compressionFromSize: 1024 \* 100, // Enable compression for messages larger than 100 KB
},
debugConfig: {
on: true,
prefix: '[QSocket Server]',
},
});

// Create a namespace
const namespace = server.createNamespace('chat');

// Handle an event within the namespace
namespace.on('connection', (connection) => {
connection.on('event', (data) => {
console.log('Message received:', data);
return void 0; // must return a value
});
connection.emit('event', 'Hello, Client');
});
\`\`\`

### Client

Set up a `QSocket` client using `engine.io`:

\`\`\`typescript
import { QSocketClient } from '@qsocket/core';
import { createEngineIOClientLatest } from '@qsocket/transport';

const transport = createEngineIOClientLatest('http://example.com');
const client = new QSocketClient(transport, {
compressor: {
on: true,
},
debugConfig: {
on: true,
prefix: '[QSocket Client]',
},
});

// Connect to a namespace
client.createNamespace('chat');
\`\`\`

## API

### `QSocketServer`

Creates a `QSocket` server instance with the ability to manage namespaces and events.

**Constructor**

\`\`\`typescript
new QSocketServer(transport: TQSocketServer, protocolConfig: IQSocketProtocolConfig, debugConfig?: IQSocketDebugConfig);
\`\`\`

### `QSocketClient`

Creates a `QSocket` client instance for connecting to a server and exchanging data.

**Constructor**

\`\`\`typescript
new QSocketClient(socket: TQSocketClientSocket, protocolConfig?: IQSocketProtocolConfig, debugConfig?: IQSocketDebugConfig);
\`\`\`

## Configuration

### Protocol Options

#### `IQSocketProtocolConfig`

- `compressor`: Data compression settings.
  - `on`: Enable or disable compression.
  - `compressionFromSize`: Threshold for enabling compression (in bytes).
  - `compressor`: Custom compressor instance (optional).

#### `IQSocketDebugConfig`

Debug configuration:

- `on`: Enable or disable debug mode.
- `prefix`: Prefix for debug messages.
- `logger`: Custom logger.

## Example Integration with Other Transports

`QSocket` initially supports `engine.io`, but its architecture allows integration with other transport types, such as TCP or file sockets, in the future. Any transport simply needs to implement interfaces similar to those in `engine.io`.

## License

This project is licensed under the MIT License.

## Contributing

If you have suggestions or ideas for improvement, please open an issue or submit a pull request in the project's GitHub repository.

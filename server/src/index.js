(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD. Register as an anonymous module. Also return global
    define(['websocket-stream', 'filereader-stream'],
    function(websocket, fileReaderStream) {
      return (root.reverserver = factory(websocket, fileReaderStream));
    });
  } else if (typeof module === 'object' && module.exports) {
    // Node. Does not work with strict CommonJS, but
    // only CommonJS-like environments that support module.exports,
    // like Node.
    module.exports = factory(
      require('websocket-stream'),
      require('filereader-stream'));
  } else {
    // Browser globals (root is window)
    root.reverserver = factory(websocket, fileReaderStream);
  }
}(typeof self !== 'undefined' ? self : this,

function (wsStreamMaker, fileReaderStream) {


  class StreamPool {
    constructor({ host, port }) {
      this._idleStreams = [];
      this._wsStreamString = `ws://${host}:${port}`;
      this._nextId = 0;
    }

    getStream() {

      if (this._idleStreams.length === 0) {
        this._addStream();
      }
      
      return this._idleStreams.pop();
    }

    releaseStream(stream) {
      this._idleStreams.push(stream);
    }

    createStream() {
      const wsStream = wsStreamMaker(this._wsStreamString, {
        perMessageDeflate: false,
        // 10MB unless my math is wrong
        browserBufferSize: 10 * 1024 * 1024,
      });

      wsStream._id = this._nextId;
      this._nextId += 1;

      console.log(wsStream);
      return wsStream;
    }

    _addStream() {
      this._idleStreams.push(this.createStream());
    }
  }

  class Server {

    constructor({ host, port }) {
      const wsString = `ws://${host}:${port}`;
      const ws = new WebSocket(wsString);
      ws.addEventListener('open', (e) => {
        console.log(`WebSocket connection opened to ${wsString}`);
      });

      ws.addEventListener('message', (message) => {
        this.onMessage(JSON.parse(message.data));
      });

      this._ws = ws;
      this._files = {};

      const streamPort = port + 1;
      this._streamPool = new StreamPool({ host, port: streamPort });
    }

    onMessage(message) {

      switch(message.type) {
        case 'GET':
          if (message.type === 'GET') {
            if (this._files[message.url] !== undefined) {

              const fullFile = this._files[message.url];

              let file = fullFile;

              console.log(`read file: ${message.url}`);

              if (message.range) {
                console.log(message.range, file.size);
                if (message.range.end !== '') {
                  file = file.slice(message.range.start, message.range.end);
                }
                else {
                  file = file.slice(message.range.start);
                }
              }

              console.log(message.range, file.size);

              const fileStream = fileReaderStream(file);
              const stream = this._streamPool.createStream();
              stream.write(JSON.stringify({
                id: message.requestId,
                size: fullFile.size,
                range: message.range,
              }));
              fileStream.pipe(stream);
            }
            else {
              console.log(`File ${message.url} not found`);
              this.sendCommand({
                type: 'error',
                code: 404,
                message: "File not found",
                requestId: message.requestId,
              });
            }
          }
          break;
        default:
          throw "Invalid message type: " + message.type;
          break;
      }
    }

    sendCommand(command) {
      this.send(JSON.stringify(command));
    }

    send(message) {
      //this._ws.send(JSON.stringify(message));
      this._ws.send(message);
    }

    hostFile(url, file) {
      this._files[url] = file;
    }
  }

  
  return {
    Server,
  };
}));



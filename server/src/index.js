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
      this.chunkSizeBytes = 1000000;

      const streamPort = port + 1;
      this._streamPool = new StreamPool({ host, port: streamPort });
      //const s1 = this._streamPool.createStream();
      //const s2 = this._streamPool.createStream();

      const file = new File(["Hi there"], "og.txt", {
        type: "text/plain",
      });

      this._requests = {};
    }

    onMessage(message) {

      switch(message.type) {
        case 'command':
          switch(message.command) {
            case 'interrupt-stream':
              console.log("stream interrupted");
              this._requests[message.requestId].interrupt = true;
              break;
            default:
              throw "Invalid command: " + message.command;
              break;
          }
          break;
        case 'GET':
          if (message.type === 'GET') {
            if (this._files[message.url] !== undefined) {

              this._requests[message.requestId] = {
                interrupt: false,
              };

              //reader.readAsText(this._files[message.url]);
              let file = this._files[message.url];

              if (message.range) {
                if (message.range.end !== '') {
                  file = file.slice(message.range.start, message.range.end);
                }
                else {
                  file = file.slice(message.range.start);
                }
              }
              console.log(`read file: ${message.url}`, message.range);

              console.log(file.size);

              const fileStream = fileReaderStream(file);
              const stream = this._streamPool.createStream();
              stream.write(String(message.requestId));
              fileStream.pipe(stream);

              //if (file.size <= this.chunkSizeBytes) {
              //  const reader = new FileReader();
              //  reader.onload = (e) => {
              //    console.log("done reading");
              //    const contents = e.target.result;
              //    this.sendData(message.requestId, contents);
              //  };
              //  reader.readAsArrayBuffer(file);
              //}
              //else {
              //  this.sendChunkedFile(message.requestId, file);
              //}
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

    sendChunkedFile(requestId, file) {
      const size = file.size;

      this.sendCommand({
        type: 'start-stream',
        requestId,
      });

      const sendChunks = (sendIndex) => {

        if (this._requests[requestId].interrupt === true) {
          this._requests[requestId].interrupt = false;

          this.sendCommand({
            type: 'end-stream',
            requestId,
          });
          return;
        }

        //console.log(sendIndex);

        if (sendIndex < size) {

          const chunkStart = sendIndex;
          const chunkEnd = sendIndex + this.chunkSizeBytes;
          const slice = file.slice(chunkStart, chunkEnd);

          const reader = new FileReader();
          reader.onload = (e) => {
            //console.log("send for " + url);
            const contents = e.target.result;
            this.sendData(requestId, contents);

            sendChunks(sendIndex + slice.size);
          };
          reader.readAsArrayBuffer(slice);
        }
        else {
          this.sendCommand({
            type: 'end-stream',
            requestId,
          });
        }
      };

      sendChunks(0);
    }

    sendCommand(command) {
      this.send(JSON.stringify(command));
    }

    sendData(requestId, data) {
      if (this._channel !== requestId) {
        this._channel = requestId;
        this.sendCommand({
          type: 'change-channel',
          requestId,
        });
      }

      this.send(data);
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



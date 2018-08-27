class ReverserverServer {

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
    this.chunkSize = 1000000;

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
              file = file.slice(message.range.start, message.range.end);
            }
            console.log(`read file: ${message.url}`);

            console.log(file.size);

            if (file.size <= this.chunkSize) {
              const reader = new FileReader();
              reader.onload = (e) => {
                console.log("done reading");
                const contents = e.target.result;
                this.sendData(message.requestId, contents);
              };
              reader.readAsArrayBuffer(file);
            }
            else {
              this.sendChunkedFile(message.requestId, file);
            }
          }
          else {
            console.log(`File ${message.url} not found`);
            this.sendCommand({
              type: 'not-found',
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
        const chunkEnd = sendIndex + this.chunkSize;
        const slice = file.slice(chunkStart, chunkEnd);

        const reader = new FileReader();
        reader.onload = (e) => {
          //console.log("done reading");
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

const rsServer = new ReverserverServer({ host: 'localhost', port: 8081 });

const file = new File(["Hi there wc"], "og.txt", {
  type: "text/plain",
});

rsServer.hostFile('/', file);

const uploadButton = document.getElementById('file_button');
uploadButton.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) {
    return;
  }

  const url = '/' + file.name;
  rsServer.hostFile(url, file);
});

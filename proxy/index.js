const http = require('http');
const WebSocket = require('ws');
const wsStream = require('websocket-stream');


class ReverserverClient {
  constructor() {

    const wss = new WebSocket.Server({ port: 8081 });
    wss.on('connection', (ws) => {
      console.log("New ws connection");
      //if (this._ws === undefined) {
      ws.on('message', (message) => {
        try {
          const parsed = JSON.parse(message);
          this.onCommand(parsed);
        }
        catch(e) {
          console.log(e);
        }
      });

      this._ws = ws;
    });

    this._nextRequestId = 0;

    this._requests = {};

    const handler = (stream) => {

      // first message should just be a number indicating the requestId to
      // attach this stream to.
      const setIdHandler = (data) => {
        const id = Number(String(data));
        console.log("set id: " + id);
        stream.removeListener('data', setIdHandler);
        const res = this._requests[id];

        res.on('close', () => {
          stream.socket.close();
        });

        stream.pipe(res);
      };

      stream.on('data', setIdHandler);
    };

    const httpServer = http.createServer().listen(8082);
    const wsStreamServer = new wsStream.createServer({
      server: httpServer,
      perMessageDeflate: false,
    }, handler);
  }

  getRequestId() {
    const requestId = this._nextRequestId;
    this._nextRequestId++;
    return requestId;
  }

  send(message) {
    this._ws.send(JSON.stringify(message));
  }

  onCommand(command) {

    switch(command.type) {
      case 'error':
        const res = this._requests[command.requestId];
        const e = command;
        console.log("Error:", e);
        res.writeHead(e.code, e.message, {'Content-type':'text/plain'});
        res.end();
        break;
      default:
        throw "Invalid command type: " + command.type
        break;
    }
  }
}


const closed = {};

const httpServer = http.createServer(httpHandler).listen(7000);
const rsClient = new ReverserverClient();

function httpHandler(req, res){
  console.log(req.method, req.url, req.headers);
  if (req.method === 'GET') {

    const options = {};

    if (req.headers.range) {
      const right = req.headers.range.split('=')[1];
      const range = right.split('-');
      options.range = {
        start: range[0],
        end: range[1],
      };
    }

    res.writeHead(200, {'Content-type':'application/octet-stream'});

    const requestId = rsClient.getRequestId();

    rsClient.send({
      type: 'GET',
      url: req.url,
      range: options.range,
      requestId,
    });

    rsClient._requests[requestId] = res;
  }
  else {
    res.writeHead(405, {'Content-type':'text/plain'});
    res.write("Method not allowed");
    res.end();
  }
}

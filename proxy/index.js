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
        if (typeof message === 'string') {
          try {
            const parsed = JSON.parse(message);
            this.onCommand(parsed);
          }
          catch(e) {
            console.log(e);
          }
        }
        else {
          this.onMessage(message);
        }
      });

      this._ws = ws;
      //}
    });

    //this._resolve = null;
    //this._onData = null;
    //this._onEnd = null;
    this._nextRequestId = 0;

    this._requests = {};

    const handler = (stream) => {

      //const oldMessageHandler = stream.socket.onmessage;
      //stream.socket.onmessage = function(message) {
      //  if (typeof message === 'string') {
      //    console.log("there");
      //    try {
      //      const parsed = JSON.parse(message);
      //      console.log(parsed);
      //    }
      //    catch(e) {
      //      console.log(e);
      //    }
      //  }
      //  else {
      //    console.log("here");
      //    oldMessageHandler(message);
      //  }
      //}
      //stream.pipe(process.stdout);

      // first message should just be a number indicating the requestId to
      // attach this stream to.
      const setIdHandler = (data) => {
        const id = Number(String(data));
        console.log("set id: " + id);
        stream.removeListener('data', setIdHandler);
        const res = this._requests[id];

        res.on('close', () => {
          //stream.unpipe();
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

  createGetRequest() {
    const id = this.getRequestId();
    const get = new GetRequest(id);

    get.setCloseHandler(() => {
      this.send({
        type: 'command',
        command: 'interrupt-stream',
        requestId: id,
      });
    });

    get.setFinishHandler(() => {
      delete this._requests[get.getId()];
    });

    return get;
  }

  get(url, options) {

    const getRequest = this.createGetRequest();

    this.send({
      type: 'GET',
      url,
      range: options.range,
      requestId: getRequest.getId(),
    });

    this._requests[getRequest.getId()] = getRequest;

    return getRequest;

    //return {
    //  onData: (callback) => {
    //    this._onData = callback;
    //  },
    //  onEnd: (callback) => {
    //    this._onEnd = callback;
    //  },
    //};

    //return new Promise((resolve, reject) => {
    //  this._resolve = resolve;
    //});
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

    //if (command.type === 'change-channel') {
    //  this.requestId = command.requestId;
    //}
    //else {
    //  this._requests[command.requestId].onCommand(command);
    //  // TODO: remove if command is end-stream
    //  //delete this._requests[command.requestId];
    //}
  }

  onMessage(message) {
    //console.log(this._ws._socket.bytesRead);
    //console.log(this._requests);
    //console.log(message);
    this._requests[this.requestId].onMessage(message);
    // TODO: remove if done
  }
}

class GetRequest {
  constructor(id) {
    this._id = id;
    this._onData = null;
    this._onEnd = null;
    this.state = 'receiving';
  }

  getId() {
    return this._id;
  }

  onData(data, callback) {
    this._onData(data, callback);
  }

  onEnd() {
    this._onEnd();
  }

  onError(message) {
    this._onError(message);
  }

  onFinish() {
    this._onFinish();
  }

  setDataHandler(callback) {
    this._onData = callback;
  }

  setEndHandler(callback) {
    this._onEnd = callback;
  }

  setErrorHandler(callback) {
    this._onError = callback;
  }

  setCloseHandler(callback) {
    this._onClose = callback;
  }

  setFinishHandler(callback) {
    this._onFinish = callback;
  }

  onCommand(command) {
    switch(command.type) {
      case 'start-stream':
        this.state = 'streaming';
        break;
      case 'end-stream':
        if (this.state === 'streaming') {
          this.onEnd();
          this.onFinish();
        }
        else {
          throw "Unexpected end-stream";
        }
        break;
      case 'error':
        this.onError(command);
        this.onFinish();
        break;
      default:
        throw "Invalid command type : " + command.type;
        break;
    }
  }

  onMessage(message) {
    switch(this.state) {
      case 'streaming':
        this.onData(message);
        break;
      case 'receiving':
        this.onData(message, () => {
          this.onEnd();
          this.onFinish();
        });
        break;
      default:
        throw "Invalid state: " + this.state;
        break;
    }
  }

  close() {
    switch(this.state) {
      case 'streaming':
        this._onClose();
        break;
      case 'receiving':
        console.log("Closing while receiving");
        break;
      default:
        throw "close invalid state: " + this.state;
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

    //const get = rsClient.get(req.url, options);
    //console.log("id: " + get.getId());

    //get.setDataHandler((data, callback) => {
    //  if (!closed[get.getId()]) {
    //    //console.log("send data for " + get.getId());
    //    res.write(data, null, callback);
    //  }
    //});

    //get.setEndHandler(() => {
    //  if (!closed[get.getId()]) {
    //    console.log("end data: " + get.getId());
    //    res.end();
    //  }
    //});

    //get.setErrorHandler((e) => {
    //  console.log("Error:", e);
    //  res.writeHead(e.code, e.message, {'Content-type':'text/plain'});
    //  res.end();
    //});

    ////get.onData((data) => {
    ////  res.write(data);
    ////});

    ////get.onEnd(() => {
    ////  res.end();
    ////});

    //res.on('close', (e) => {
    //  console.log("close " + get.getId());
    //  closed[get.getId()] = true;
    //  get.close();
    //});
  }
  else {
    res.writeHead(405, {'Content-type':'text/plain'});
    res.write("Method not allowed");
    res.end();
  }
}

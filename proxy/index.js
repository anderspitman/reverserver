const WebSocket = require('ws');
const http = require('http');


class ReverserverClient {
  constructor() {
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

    if (command.type === 'change-channel') {
      this.requestId = command.requestId;
    }
    else {
      this._requests[command.requestId].onCommand(command);
      // TODO: remove if command is end-stream
      //delete this._requests[command.requestId];
    }
  }

  onMessage(message) {
    console.log(this._ws._socket.bytesRead);
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


const wss = new WebSocket.Server({ port: 8081 });
const rsClient = new ReverserverClient();

const closed = {};

http.createServer(function(req, res){
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

    const get = rsClient.get(req.url, options);
    console.log("id: " + get.getId());
    
    res.writeHead(200, {'Content-type':'application/octet-stream'});

    get.setDataHandler((data, callback) => {
      if (!closed[get.getId()]) {
        //console.log("send data for " + get.getId());
        res.write(data, null, callback);
      }
    });

    get.setEndHandler(() => {
      if (!closed[get.getId()]) {
        console.log("end data: " + get.getId());
        res.end();
      }
    });

    get.setErrorHandler((e) => {
      console.log("Error:", e);
      res.writeHead(e.code, e.message, {'Content-type':'text/plain'});
      res.end();
    });

    //get.onData((data) => {
    //  res.write(data);
    //});

    //get.onEnd(() => {
    //  res.end();
    //});

    res.on('close', (e) => {
      console.log("close " + get.getId());
      closed[get.getId()] = true;
      get.close();
    });
  }
  else {
    res.writeHead(405, {'Content-type':'text/plain'});
    res.write("Method not allowed");
    res.end();
  }
}).listen(7000);

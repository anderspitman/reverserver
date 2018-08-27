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

    this.state = 'idle';
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
    return new GetRequest(id);
  }

  get(url, options) {

    this.state = 'receiving';

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
    console.log(command, this.state);
    switch(command.type) {
      case 'start-stream':
        this.state = 'streaming';
        break;
      case 'end-stream':
        if (this.state === 'streaming') {
          this.state = 'idle';
          //this._onEnd();
          this._requests[command.requestId].onEnd();
          //this._onData = null;
          delete this._requests[command.requestId];
          //this._onEnd = null;
        }
        else {
          throw "Unexpected end-stream";
        }
        break;
      case 'change-channel':
        this.channel = command.channel;
        break;
      default:
        throw "Invalid command type : " + command.type;
        break;
    }
  }

  onMessage(message) {
    //console.log(message);
    switch(this.state) {
      case 'idle':
        break;
      case 'streaming':
        console.log(this.channel);
        //this._onData(message);
        this._requests[this.channel].onData(message);
        break;
      case 'receiving':
        console.log(this.channel);
        //this._onData(message);
        this._requests[this.channel].onData(message, () => {
          this._requests[this.channel].onEnd();
          delete this._requests[this.channel];
        });
        //this._onEnd();
        //this._onData = null;
        //this._onEnd = null;
        break;
      default:
        throw "Invalid state: " + this.state;
        break;
    }
  }

  handleClose(requestId) {
    switch(this.state) {
      case 'streaming':
        this.send({
          type: 'command',
          command: 'interrupt-stream',
          requestId,
        });
        break;
      case 'idle':
        console.log("Closing while idle");
        break;
      default:
        throw "handleClose invalid state: " + this.state;
        break;
    }
  }
}

class GetRequest {
  constructor(id) {
    this._id = id;
    this._onData = null;
    this._onEnd = null;
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

  setDataHandler(callback) {
    this._onData = callback;
  }

  setEndHandler(callback) {
    this._onEnd = callback;
  }
}


const wss = new WebSocket.Server({ port: 8081 });
const rsClient = new ReverserverClient();

http.createServer(function(req, res){
  console.log(req.method);
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
    
    res.writeHead(200, {'Content-type':'application/octet-stream'});

    get.setDataHandler((data, callback) => {
      console.log("write data");
      res.write(data, null, callback);
    });

    get.setEndHandler(() => {
      console.log("end data");
      res.end();
    });

    //get.onData((data) => {
    //  res.write(data);
    //});

    //get.onEnd(() => {
    //  res.end();
    //});

    res.on('close', (e) => {
      rsClient.handleClose(get.getId());
    });
  }
  else {
    res.writeHead(405, {'Content-type':'text/plain'});
    res.write("Method not allowed");
    res.end();
  }
}).listen(7000);

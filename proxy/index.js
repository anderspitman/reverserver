const WebSocket = require('ws');
const http = require('http');


class ReverserverClient {
  constructor() {
    wss.on('connection', (ws) => {
      console.log("New ws connection");
      //if (this._ws === undefined) {
      ws.on('message', (message) => {
        //this.onMessage(JSON.parse(message));
        this.onMessage(message);
      });

      this._ws = ws;
      //}
    });

    this.state = 'idle';
    this._resolve = null;
  }

  get(url, options) {
    this.state = 'waiting';
    this.send({
      type: 'GET',
      url,
      range: options.range,
    });

    return new Promise((resolve, reject) => {
      this._resolve = resolve;
    });
  }

  send(message) {
    this._ws.send(JSON.stringify(message));
  }

  onMessage(message) {
    console.log(message);
    switch(this.state) {
      case 'idle':
        break;
      case 'waiting':
        this._resolve(message);
        this._resolve = null;
        this.state = 'idle';
        break;
      default:
        throw "Invalid state: " + this.state;
        break;
    }
  }
}


const wss = new WebSocket.Server({ port: 8081 });
const rsClient = new ReverserverClient();

http.createServer(function(req, res){
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

    rsClient.get(req.url, options).then((data) => {
      res.writeHead(200, {'Content-type':'application/octet-stream'});
      res.write(data);
      res.end();
    })
  }
  else {
    res.writeHead(405, {'Content-type':'text/plain'});
    res.write("Method not allowed");
    res.end();
  }
}).listen(7000);

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
  }

  onMessage(message) {
    console.log(message);
    if (message.type === 'GET') {
      this.send(this._files[message.url]);
    }
  }

  send(message) {
    this._ws.send(JSON.stringify(message));
  }

  hostFile(url, file) {
    this._files[url] = file;
  }
}

const rsServer = new ReverserverServer({ host: 'localhost', port: 8081 });

rsServer.hostFile('/', "root");
rsServer.hostFile('/oldgregg', "HI there");
rsServer.hostFile('/oldgregg/wc', "I do watercolors");

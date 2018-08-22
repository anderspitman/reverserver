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
      const reader = new FileReader();
      reader.onload = (e) => {
        const contents = e.target.result;
        this.send(contents);
      };
      reader.readAsText(this._files[message.url]);
    }
  }

  send(message) {
    this._ws.send(JSON.stringify(message));
  }

  hostFile(url, file) {
    this._files[url] = file;
  }
}

const uploadButton = document.getElementById('file_button');
uploadButton.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) {
    return;
  }

  const url = '/' + file.name;
  rsServer.hostFile(url, file);
});

const rsServer = new ReverserverServer({ host: 'localhost', port: 8081 });

const file = new File(["Hi there wc"], "og.txt", {
  type: "text/plain",
});

rsServer.hostFile('/', file);

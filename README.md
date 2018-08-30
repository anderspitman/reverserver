The point of this is to allow your browser to "host" files which can be
streamed over HTTP. This requires a proxy server to handle the HTTP requests
and forward them to the browser over websockets.

Why would this be useful? If the user has a very large file (genomic data files
can easily be in the 20GB-200GB range), and you want to make
[ranged requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)
to that file (ie only download specific chunks) as though it were hosted on a
normal server, this will allow that.

NOTE: This is a very early work in progress and not intended to be used for
anything production ready at the moment.

# Example usage

First start up the proxy server. We'll assume it's publicly available at
example.com. It's currently hard-coded to listen for HTTP on port 7000 and
websocket connections on 8081.

```bash
node proxy/index.js
```

Create a "server" object in the browser:

```javascript
const host = "example.com";
const rsServer = new reverserver.Server({ host, port: 8081 });
```

"Host" a couple files in the browser. See `server/dist/index.html` for an
example where the user selects a file from their computer.

```javascript
const file1 = new File(["Hi there"], "file1.txt", {
  type: "text/plain",
});

const file2 = new File(["I'm Old Gregg"], "file2.txt", {
  type: "text/plain",
});

rsServer.hostFile('/file1', file1);
rsServer.hostFile('/file2', file2);
```

Retrieve the files using any http client:
```bash
curl example.com:7000/file1
Hi there
curl example.com:7000/file2
I'm Old Gregg
```

Ranged requests work too:
```bash
curl -H "Range: bytes=0-2" example.com:7000/file1
Hi
```

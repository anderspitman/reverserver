The point of this is to allow your browser to "host" files which can be
streamed over HTTP. This requires a proxy server to handle the HTTP requests
and forward them to the browser over websockets.

Why would this be useful? If the user has a very large file, and you have a
backend service that want to make ranged requests to that file as though it
was served on a normal server, this will allow that.

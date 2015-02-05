var express = require('express');
var http = require('http');
var https = require('https');

var sysPath = require('path');
var slashes = require('connect-slashes');

var startServer = function(options, callback) {
  // Specify default options.
  if (typeof options === 'function') {
    callback = options;
    options = null;
  }
  if (options == null) options = {};
  if (options.path == null) options.path = '.';
  if (options.port == null) options.port = 8000;
  if (options.base == null) options.base = '';
  if (options.indexPath == null) options.indexPath = sysPath.join(options.path, 'index.html')
  if (options.noCors == null) options.noCors = false;
  if (options.stripSlashes == null) options.stripSlashes = false;
  if (options.noPushState == null) options.noPushState = false;
  if (options.noLog == null) options.noLog = false;
  if (options.proxy == null) options.proxy = [];

  // options.proxy.push({
  //   path: '/api',
  //   url: 'https://test.myapi.com'
  // });

  if (callback == null) callback = Function.prototype;

  var app = express();

  // Send cross-origin resource sharing enabling header.
  if (!options.noCors) {
    app.use(function(request, response, next) {
      response.header('Cache-Control', 'no-cache');
      response.header('Access-Control-Allow-Origin', '*');
      next();
    });
  }

  // Route all static files to http paths.
  app.use(options.base, express.static(sysPath.resolve(options.path)));

  // Redirect requests that include a trailing slash.
  if (options.stripSlashes) {
    app.use(slashes(false));
  }


  options.proxy.forEach(function (proxy) {
    var cache = {};
    app.use(proxy.path, function(req, res) {
      var url = proxy.url + req.url;
      var protocol = url.indexOf('https') === 0 ? https : http;

      var options = require('url').parse( url );
      options.rejectUnauthorized = false;
      options.headers = req.headers;
      options.method = req.method;

      // keeping the host messes up some targets (like apiary)
      delete options.headers.host;

      // console.log('proxy options', options);

      console.log(url, "request..", options.pathname);

      var requestKey = options.pathname;
      var cached = cache[requestKey];
      if (proxy.cache && cached) {
        for (var key in cached.headers) {
          res.setHeader(key, cached.headers[key]);
        }
        res.status(cached.statusCode);
        res.send(cached.data);

        console.log(url, "cached statusCode", cached.statusCode);

        return;
      }


      var proxyRequest = protocol.request( options, function ( proxyResponse ) {
        var statusCode = proxyResponse.statusCode;
        console.log(url, "statusCode:", statusCode);
        // console.log("proxyResponse headers:", proxyResponse.headers);

        for (var key in proxyResponse.headers) {
          res.setHeader(key, proxyResponse.headers[key]);
        }
        if (proxy.cache && statusCode >= 200 && statusCode < 300) {
          var data = '';
          proxyResponse.on('data', function(chunk) {
            data += chunk;
          });
          proxyResponse.on('end', function() {
            var item = {
              headers    : proxyResponse.headers,
              statusCode : statusCode,
              data       : data,
            };
            cache[requestKey] = item;
          });
        }

        res.status(statusCode)
        proxyResponse.pipe(res);
      }).on( 'error',function ( e ) {
        console.error('error:', e);
        res.send(500, 'Proxying failed!');
      });

      req.pipe(proxyRequest);
      req.on('end', function() {
        proxyRequest.end();
      });

    });
  });

  // Route all non-existent files to `index.html`
  if (!options.noPushState) {
    app.all('' + options.base + '/*', function(request, response) {
      response.sendfile(options.indexPath);
    });
  }

  // Wrap express app with node.js server in order to have stuff like server.stop() etc.
  var server = http.createServer(app);
  server.timeout = 2000;
  server.listen(options.port, function(error) {
    if (!options.noLog) {
      console.log('Application started on http://localhost:' + options.port);
    }
    callback(error, options);
  });
  return server;
};

module.exports = startServer;

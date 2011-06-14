
//////////////////////////////////////////////////////////////////////////////////////////
//                              PubSubHubbub                                            //
//////////////////////////////////////////////////////////////////////////////////////////


//
// Main PubSubHubub method. Peforms the subscription and unsubscriptions
// It uses the credentials defined earlier.
var subscribe = function(feed, mode, hub, callback, errback) {
  log("Called subscribe");
  var params = {
    "hub.mode"      : mode,
    "hub.verify"    : config.pubsubhubbub.verify_mode,
    "hub.callback"  : feed.callback_url,
    "hub.topic"     : feed.url
  };
  
  var hub_url = hub || config.pubsubhubbub.hub;
  
  var body = querystring.stringify(params)
      hub = url.parse(hub_url),
      contentLength = body.length,
      headers = {
        "Accept": '*/*',
//        "Authorization": "Basic "+ base64.encode(config.pubsubhubbub.username + ":" + config.pubsubhubbub.password),
        "Content-Length": contentLength,
        "Content-Type": "application/x-www-form-urlencoded",
        "Host": hub.hostname,
        "User-Agent": "Socket-Sub for Node.js",
        "Connection": "close"
      };
  log("request body: " + body);
  var client  = http.createClient(hub.port || 80, hub.hostname );
  var request = client.request("POST", hub.pathname + (hub.search || ""), headers);
  log("hub.pathname: " + hub.pathname)
  request.write(body, 'utf8');

  request.addListener("response", function(response) {
    log("in request.addListener response");
    var body = "";
    response.addListener("data", function(chunk) {
        body += chunk;
        log("in request.addListener data");
        log("body: " + body);
    });
    response.addListener('end', function() {
      log("in request.addListener end");
      if(response.statusCode == (202 || 204)) {
        log("response.statusCode: " + response.statusCode);
        callback();
      }
      else {
        errback(body);
      }
    });
  });
  request.end(); // Actually Perform the request
}


var fs = require("fs"),
    //express = require("express"),
    sys = require("sys"),
    http = require("http")
    querystring = require("querystring"),
    url = require("url");
    //base64 = require("./deps/base64");
var config = JSON.parse(fs.readFileSync("./config.json", "utf8") ) || JSON.parse(fs.readFileSync("./default_config.json", "utf8") );
var log = function(message) {
  if(config.debug) {
    sys.puts(message);
  }
};
//////////////////////////////////////////////////////////////////////////////////////////
//                              PubSubHubbub                                            //
//////////////////////////////////////////////////////////////////////////////////////////

//
// Main PubSubHubub method. Peforms the subscription and unsubscriptions
// It uses the credentials defined earlier.
var subscribe = function(hub_url, mode, verify, callback_url, topic, foaf, callback, errback) {
  var params = {
    "hub.mode"      : mode,
    "hub.verify"    : verify,
    "hub.callback"  : callback_url,
    "hub.topic"     : topic,
    "hub.foaf"      : foaf
  };
  
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
  var client  = http.createClient(hub.port || 80, hub.hostname );
  var request = client.request("POST", hub.pathname + (hub.search || ""), headers);
//  var request = client.request("POST","/subscribe", headers);
  request.write(body, 'utf8');

  request.addListener("response", function(response) {
    var body = "";
    response.addListener("data", function(chunk) {
        body += chunk;
    });
    response.addListener('end', function() {
      if(response.statusCode == (202 || 204)) {
        callback();
      }
      else {
        errback(body);
        log(body);
      }
    });
  });
  request.end(); // Actually Perform the request
}

exports.subscribe = subscribe;

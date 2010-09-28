var fs = require("fs"),
    express = require("express"),
    sys = require("sys"),
    http = require("http"),
    querystring = require("querystring"),
    url = require("url"),
    base64 = require("./deps/base64"),
    ws = require('./deps/node-websocket-server/lib/ws');


var config = JSON.parse(fs.readFileSync("./config.json", "utf8") ) || JSON.parse(fs.readFileSync("./default_config.json", "utf8") );

var log = function(message) {
  if(config.debug) {
    sys.puts(message);
  }
};

//////////////////////////////////////////////////////////////////////////////////////////
//                              Object Definitions                                      //
//////////////////////////////////////////////////////////////////////////////////////////

//
// Feed object
var Feed = function(url) {
  this.url = url;
  this.id = base64.encode(url);
  this.callback_url = config.pubsubhubbub.callback_url_root + config.pubsubhubbub.callback_url_path + this.id;
}

//
// Subscription object
var Subscription = function(socket_id, feed ) {
  this.socket_id = socket_id;
  this.feed = feed; 
};

//
// Subscription store. We may want to persist it later, but right now, it's in memory.
// Which means that the server will probably eat a lot of memory when there are a lot of client connected and/or a lot of feeds susbcribed
var SubscriptionStore = function() {
  this.feeds = {};
  
  //
  // Delete the subscription for this socket id and feed id. If all susbcriptions have been deleted for this socket id, delete the it too.
  this.delete_subscription = function(feed_id, socket_id) {
    var feed = this.feeds[feed_id];
    if(feed) {
      subscription = feed.subscriptions[socket_id];
      if(subscription) {
        delete feed.subscriptions[socket_id];
        if(feed.subscriptions.length == 0) {
          delete this.feeds[feed_id];
        }
        return true
      }
      else {
        if(feed.subscriptions.length == 0) {
          delete this.feeds[feed_id];
        }
        return false
      }
    }
    else {
      return false;
    }
  }

  // 
  // Creates (or just returns) a new subscription for this socket id and this feed url
  this.subscribe = function(socket_id, url) {
    var feed = new Feed(url)
    if(!this.feeds[feed.id]) {
      // The feed doesn't exist yet
      this.feeds[feed.id] = {
        subscriptions : {},
        feed: feed
      }
    }
    if(!this.feeds[feed.id].subscriptions[socket_id]) {
      var subscription = new Subscription(socket_id, feed);
      this.feeds[feed.id].subscriptions[socket_id] = subscription;
      return subscription;
    }
    else {
      return this.feeds[feed.id].subscriptions[socket_id];
    }
  }
  
  //
  // Returns the subscription for this socket id and feed id
  this.subscription = function(socket_id, feed_id) {
    var feed = this.feeds[feed_id];
    if(feed) {
      return feed.subscriptions[socket_id];
    }
    else {
      return false;
    }
  }
  
};


//////////////////////////////////////////////////////////////////////////////////////////
//                              PubSubHubbub                                            //
//////////////////////////////////////////////////////////////////////////////////////////


//
// Main PubSubHubub method. Peforms the subscription and unsubscriptions
// It uses the credentials defined earlier.
var subscribe = function(feed, mode, hub, callback, errback) {
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
        "Authorization": "Basic "+ base64.encode(config.pubsubhubbub.username + ":" + config.pubsubhubbub.password),
        "Content-Length": contentLength,
        "Content-Type": "application/x-www-form-urlencoded",
        "Host": hub.hostname,
        "User-Agent": "Socket-Sub for Node.js",
        "Connection": "close"
      };

  var client  = http.createClient(hub.port || 80, hub.hostname );
  var request = client.request("POST", hub.pathname + (hub.search || ""), headers);

  request.write(body, 'utf8');

  request.addListener("response", function(response) {
    var body = "";
    response.addListener("data", function(chunk) {
        body += chunk;
    });
    response.addListener('end', function() {
      if(response.statusCode == 204) {
        callback();
      }
      else {
        errback(body);
      }
    });
  });
  request.end(); // Actually Perform the request
}


//////////////////////////////////////////////////////////////////////////////////////////
//                              Let's get started                                       //
//////////////////////////////////////////////////////////////////////////////////////////

// Web Socket Server ---- (server <-> browser) --------------------------------------
var ws_server = ws.createServer({ debug: config.debug });

ws_server.addListener("listening", function() {
  var hostInfo = config.websocket.listen.host + ":" + config.websocket.listen.port.toString();
  log("Listening to WebSocket connections on ws://" + hostInfo);
});

// Handle Web Sockets when they connect
ws_server.addListener("connection", function(socket ) {
  // When connected
  ws_server.send(socket.id, "Awaiting feed subscription request");
  socket.addListener("message", function(subscription) {
    // When asked to subscribe to a feed_url
    ws_server.send(socket.id, "Subscribing to " + subscription.feed_url);
    var subscription = subscriptions_store.subscribe(socket.id, subscription.feed_url);
    subscribe(subscription.feed, "subscribe", subscription.hub_url, function() {
      log("Subscribed to " + subscription.feed_url + " for " + socket.id);
      ws_server.send(socket.id, "Subscribed to " + subscription.feed_url);
    }, function(error) {
      log("Failed subscription to " + subscription.feed_url + " for " + socket.id);
      ws_server.send(socket.id, "Couldn't subscribe to " + subscription.feed_url + " : "+ error.trim() );
    });
  });
});

// Handle Web Sockets when they disconnect. 
ws_server.addListener("close", function(socket ) {
  // Not much to do.
});

// Web Server -------- (server <-> hub) --------------------------------------------
var web_server = express.createServer();

// PubSubHubbub verification of intent
web_server.get(config.pubsubhubbub.callback_url_path + ':feed_id', function(req, res) {
    var feed = subscriptions_store.feeds[req.params.feed_id];
    if (feed && req.query.hub.mode == "subscribe") {
      log("Confirmed " + req.query.hub.mode + " to " + feed.feed.url )
      res.send(req.query.hub.challenge, 200);
    }
    else if (feed && req.query.hub.mode == "unsubscribe") {
      // We need to check all the susbcribers. To make sure they're all offline
      var sockets = 0;
      for(subscription_id in feed.subscriptions) {
        subscription = feed_subs.subscriptions[subscription_id];
        ws_server.send(subscription.socket_id, "", function(socket) {
          if(socket) {
            sockets += 1;
          } 
        });
      }
      if(sockets == 0) {
        // We haven't found any socket to send the updates too
        // Let's delete the feed
        log("Confirmed " + req.query.hub.mode + " to " + feed.feed.url)
        res.send(req.query.hub.challenge, 200);
      }
      else {
        log("Couldn't confirm " + req.query.hub.mode + " to " + feed.feed.url)
        res.send(404);
      }
    }
    else {
      log("Couldn't confirm " + req.query.hub.mode + " to " + req.params.feed_id)
      res.send(404);
    }
});

//
// Incoming POST notifications.
// Sends the data to the right Socket, based on the subscription. Unsubscibes unused subscriptions.
web_server.post(config.pubsubhubbub.callback_url_path + ':feed_id', function(req, res) {
  var feed_subs = subscriptions_store.feeds[req.params.feed_id];
  if (feed_subs) {
    req.on('data', function(data) {
      var sockets = 0;
      for(subscription_id in feed_subs.subscriptions) {
        subscription = feed_subs.subscriptions[subscription_id];
        ws_server.send(subscription.socket_id, data, function(socket) {
          if(socket) {
            sockets += 1;
            log("Sent notification for " + subscription.socket_id + " for " + subscription.feed.url)
          } 
          else {
            log("Looks like " + subscription.socket_id + " is offline! Removing " + subscription.feed.url + " from it");
            subscriptions_store.delete_subscription(subscription.feed.id, subscription.socket_id);
          }
        });
      }
      if(sockets == 0) {
        // We haven't found any socket to send the updates too
        // Let's delete the feed
        log("Nobody subscribed to feed " + feed_subs.feed.url)
        subscribe(feed_subs.feed, "unsubscribe", function() {
          log("Unsubscribed from " + feed_subs.feed.url);
          delete subscriptions_store.feeds[req.params.feed_id];
        }, function(error) {
          log("Couldn't unsubscribe from " + feed_subs.feed.url + "(" + error.trim() + ")");
        }) 
        res.send(404);
      }
      else {
        res.send("Thanks", 200);
      }
    });
  }
  else {
    log("Couldn't find feed " + req.params.feed_id)
    res.send(404);
  }
});

web_server.addListener("listening", function() {
  var hostInfo = config.pubsubhubbub.listen.host + ":" + config.pubsubhubbub.listen.port.toString();
  log("Listening to HTTP connections on http://" + hostInfo);
});

web_server.get("/", function(req, res) {
  res.send("<a href='http://github.com/julien51/socket-sub'>Socket Sub</a>", 200);
});

var subscriptions_store = new SubscriptionStore(); 
ws_server.listen(config.websocket.listen.port, config.websocket.listen.host);
web_server.listen(config.pubsubhubbub.listen.port, config.pubsubhubbub.listen.host);


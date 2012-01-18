var fs = require("fs"),
    express = require("express"),
    sys = require("sys"),
    http = require("http"),
    querystring = require("querystring"),
    url = require("url"),
    base64 = require("./deps/base64"),
    //ws = require('./deps/node-websocket-server/lib/ws'),
    //uuid = require('uuid-pure').newId,
    Crypto = require('crypto'),
    io = require('socket.io'),
    //qs = require('qs'),
    hub = require('./hub-subscribe'),
    MemoryStore = express.session.MemoryStore,
    sessionStore = new MemoryStore(),
    SocketsStore= require('./subscriptions-memory').SocketsStore,
    sockets_store = new SocketsStore(),
    SubscriptionsStore= require('./subscriptions-mongodb').SubscriptionsStore,
    subscriptionsStore= new SubscriptionsStore('localhost', 27017),
    webid_check = require("./webid_check.js"),
    app = express.createServer();

var config = JSON.parse(fs.readFileSync("./config.json", "utf8") ) || 
  JSON.parse(fs.readFileSync("./default_config.json", "utf8") );
var callback_url = config.pubsubhubbub.callback_url_root + 
  config.pubsubhubbub.callback_url_path;
var hub_url = config.pubsubhubbub.hub;
var foaf_uri = config.pubsubhubbub.hub;

var log = function(message) {
  if(config.debug) {
    sys.puts(message);
  }
};



///////////////////////////////////////////////////////////////////////////////
//                              Socket server - client communication         //
///////////////////////////////////////////////////////////////////////////////

app.configure(function () {
    app.use(express.cookieParser());
    app.use(express.session({store: sessionStore
        , secret: 'secret'
        , key: 'express.sid'}));
    app.use(function (req, res) {
        res.end('<h2>Hello, your session id is ' + req.sessionID + '</h2>');
    });
});

app.listen(config.websocket.listen.port, function () {
  var addr = app.address();
  log('SOCKET SERVER listening on http://' + addr.address + ':' + addr.port);
});

var ws_server = io.listen(app);


// SOCKET STABLISHED
ws_server.sockets.on("connection", function(client) {
  log("SOCKET STABLISHED");
  log("Client.sessionid: "+client.id);
  log("client.handshake "+sys.inspect(client.handshake));
  log("client.handshake.address "+client.handshake.headers.origin);
  log("client.handshake.address "+client.handshake.address.address);
  
  client.on("init", function(data){
    log("domain ");
    ws_server.sockets.sockets[client.id].json.send(data);
    client.set('domain', data.domain, function () {
      log(data.domain);
    });
  });


  // SOCKET RECEIVED MESSAGE
  client.on("subscribe", function(from, json) {
    log("from " + from);
    log("Message received: "+sys.inspect(json));
    log(json["hub.callback"]);
    // HTTP POST REQUEST TO hub_url {"hub.mode":"subscribe",
    //  "hub.verify":"async","hub.callback":callback_url",
    // "hub.topic": json["hub.topic"]}
    hub.subscribe(hub_url, "subscribe", "sync", callback_url+json["hub.callback"], 
      json["hub.topic"], 
      foaf_uri + json["hub.foaf"], 
      function() {
      // SOCKET SEND subscription was requested
      ws_server.sockets.sockets[client.id].json.send(
        "Asked subscription to " + json["hub.topic"]);
        //client.send("Asked subscription to " + json["hub.topic"]);
        log("Asked subscription for socket " + client.id +
        " with cookie "+client.id+" to " + json["hub.topic"]);
      }, function(error) {
        log("Something wrong in the subscription")
    });
  });



  // SOCKET DISCONNECT
  client.on("disconnect", function( ) {
    log("SOCKET DISCONNECT");
  });

});



///////////////////////////////////////////////////////////////////////////////
//                              Web server - Hubbub communication            //
///////////////////////////////////////////////////////////////////////////////
var web_server = express.createServer(
  express.bodyParser()
);


// HTTP GET REQUEST TO callback_url
// (subscription verification)

//web_server.get(
//  config.pubsubhubbub.callback_url_path + ':feed_id', 
//log("callback url: "+config.pubsubhubbub.callback_url_path + ':feed_id');
web_server.get(
  "/callback/:domain", 
  function(req, res) {
    log("HTTP GET REQUEST TO callback_url");
    
    params = req.body || req.query || req.params;
    log(sys.inspect(params));
    var topic_url = params['hub.topic'] || null;
    var mode = params['hub.mode'] || null;
    var challenge = params['hub.challenge'] || null;
    //var foaf = params['hub.foaf'] || null;
    
    // PERSISTENT STORE: get which subsribers asked to subscribe to that 
    // publisher 
    
    // a different way to procced would be to send to the PubSubHubbub server
    // the socket identifier when asking subscription, get it back and confirm
    // challenge for that socket.
    subscriptionsStore.findByPublisherURInotconfirmed(topic_url, 
      function(error, subscribers) {
      log("subscribers that asked to subscribe to topic_url " + topic_url);
      log(sys.inspect(subscribers));
      if (subscribers && (mode == "subscribe" || mode == "unsubscribe")) {
        for (var i in subscribers) {
          var subscriber = subscribers[i];
          log("subcriber with pending subscriptions: "+sys.inspect(subscriber));
          // TODO: if socket not online, not confirm
          var socket = ws_server.clientsIndex[
            sockets_store.get_socketclient_from_clientId(subscriber.ClientId)];
          //ws_server.sockets.sockets[client.id].json.send(
          log("socket with pending subscriptions" + sys.inspect(socket));
          if (socket) {
            
            // here we could send the challenge to the socket and receive the 
            // challenge back, but not doing it as socket will be confirmed with
            // the WebID.
            // TODO: should the PubSubHubbub server be modified to perform 
            // confirmation also with WebID?
            
            // HTTP RESPONSE TO hub_url with challenge
            res.send(challenge, 200);
            log("Sent: " + challenge);
            
            // PERSISTENT STORE: set confirm: true
            subscriptionsStore.confirmBySubscription(subscriber, 
              function(error, subscriber) {
              log("Confirmed subscriptions: "+sys.inspect(subscriber));
            });
            // SOCKET SEND CONFIRMATION TO SUBSCRIBER
            socket.send("Confirmed subscription");
          } else {
            
            // HTTP RESPONSE TO hub_url
            log("Couldn't confirm " + mode + " to " + topic_url + 
            "the subscriber is not online");
            res.send(404);
          }       
        } // end for
      } else {   
      
        // HTTP RESPONSE TO hub_url
        log("Couldn't confirm " + mode + " to " + topic_url + "there are not " +
        "subscribers for the publisher");
        res.send(404);
      }
    });
});


// WEB SERVER POST REQUESTS
// (incoming post notifications)

web_server.post(
  "/callback", 
  function(req, res) {
    log("WEB SERVER POST REQUEST");
    // TODO: check that request comes from the PubSubHubbub server to which
    // subscriber is subscribed
//    log("req.headers['user-agent']"+req.headers['user-agent']);
//    log("req.headers['server']"+req.headers['server']);
    
    //when content-type: application/x-www-form-urlencoded;
    if (req.headers['content-type'] == "application/x-www-form-urlencoded") {
      params = req.body;
    } else {
      params = req.query;
    }
    log(sys.inspect(params));
    var topic_url = params['hub.topic'] || null;
    var mode = params['hub.mode'] || null;
    
    // PERSISTENT STORE: get subscriber sid subscribed to that publisher
    subscriptionsStore.findByPublisherURI(topic_url, 
      function(error, subscribers) {
      if (subscribers && (mode == "publish")) {
        req.on('data', function(data) {
          log("in data");
          
          for (subscriber in subscribers) {
            var socket = ws_server.clientsIndex[
              get_socketclient_from_clientId(subscriber.ClientId)]
            if(socket) {
              // SOCKET SEND NOTIFICATION TO SUBSCRIBER 
              socket.send(data); 
              log("Sent notification to socket " + socket.sessionId + " for " + 
                subscription.feed.url);
              // TODO: mark the notification?
              
              // HTTP RESPONSE TO hub_url 200
              res.send("Thanks", 200);
            } else {
              // subscribers should be notified later and store the notification
              // this is actually the hub functionality!!
              
              // HTTP RESPONSE TO hub_url 404
              log("Couldn't find online socket for feed " + topic_url);
              res.send(404);
            }
          } // end for
        });
      }
      else {
        // HTTP RESPONSE TO hub_url 404
        log("Couldn't confirm " + mode + " to " + topic_url + "there are not " +
        "subscribers for that topic");
        res.send(404);
      }
    });
});

// WEB SERVER FOAF POST REQUEST
web_server.post("/foaf/:clientId",
  function(req, res) {
    log("WEB SERVER FOAF POST REQUEST");
    //when content-type: application/x-www-form-urlencoded;
    if (req.headers['content-type'] == "application/x-www-form-urlencoded") {
      params = req.body;
    } else {
      params = req.query;
    }
    var cert_uri = params['cert_uri'] || null;
    var webid_uri = params['webid_uri'] || null;
    
    // verify the PubSubHubbub server WebID
    //r = webid_check.validate_webid(cert_uri);
    //log("result of webid validation: " + r);
    
    //ask subscriber/publisher for the private FOAF presenting socket server 
    // certificate
    
    //send FOAF back to PubSubHubbub server
});

web_server.addListener("listening", function() {
  var hostInfo = config.pubsubhubbub.listen.host + ":" + 
  config.pubsubhubbub.listen.port.toString();
  log("Listening to HTTP connections on http://" + hostInfo);
});

// HTTP GET REQUEST TO /
web_server.get("/", function(req, res) {
    log("web server GET request");
    log("req.url"+req.url);
    log("req.params"+req.params);
  res.send("<a href='http://github.com/smob/'> SMOB </a> PubSubHubbub socket " +
    "proxy version of <a href='http://github.com/julien51/socket-sub'> " +
    "Socket Sub </a>", 200);
});

web_server.listen(config.pubsubhubbub.listen.port, 
  config.pubsubhubbub.listen.host);


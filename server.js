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
//log("SOCKET SERVER listening");


// SOCKET STABLISHED
ws_server.on("connection", function(client) {
  log("SOCKET STABLISHED");
  log("Client.sessionid: "+client.sessionId);
  
  // For now, processing cookies like socket messages...
  
  // SOCKET RECEIVED FIRST MESSAGE
  client.once("message", function(data) {
    log("SOCKET RECEIVED FIRST MESSAGE: " + sys.inspect(data));
    
    // COOKIE RECEIVED
    if (data.ClientId) {
      log("COOKIE RECEIVED: "+data.ClientId);     
      // PERSISTENT STORE: find cookie
      subscriptionsStore.findByClientId(data.ClientId, 
        function(error, subscription){
        log("found cookie in store:"+sys.inspect(subscription));
        // MEMORY STORE: map socket to cookie
        var socket_clientid = sockets_store.add_socketclient(
          client.sessionId,subscription.ClientId);
        log("mapped in memory socket id to cookie: " +
          sys.inspect(socket_clientid));
      });
    
    // NO COOKIE RECEIVED
    } else {
      log("NO COOKIE RECEIVED");     
      // SOCKET SEND COOKIE
      client.send(JSON.stringify({"ClientId": client.sessionId}) );
      log("SOCKET SEND COOKIE");
      // PERSISTENT STORE: save cookie
      subscriptionsStore.save({ClientId: client.sessionId}, 
        function(error, subscription){
        log("found cookie in store:"+sys.inspect(subscription));
        // MEMORY STORE: map socket to cookie
        var socket_clientid = sockets_store.add_socketclient(
          client.sessionId,subscription.ClientId);
        log("mapped in memory socket id to cookie: " +
          sys.inspect(socket_clientid));
      });
    }
  });


  // SOCKET RECEIVED MESSAGE
  client.on("message", function(data) {
    log("Message received: "+sys.inspect(data));
    
    try {
      // if json
      var json = JSON.parse(data);
      if (json["hub.topic"]) {
        // SUBSCRIPTION REQUEST 
        var socketsid = sockets_store.get_socketclient(client.sessionId);

        log("Subscribing socket " + socketsid.socketId + " with cookie " +
          socketsid.clientId + " to " + json["hub.topic"]);
        
        // HTTP POST REQUEST TO hub_url {"hub.mode":"subscribe",
        //  "hub.verify":"async","hub.callback":callback_url",
        // "hub.topic": json["hub.topic"]}     
        // FIXME: hub.foaf should be the socket server foaf?, 
        // store the client foaf too
        hub.subscribe(hub_url, "subscribe", "sync", callback_url, 
          json["hub.topic"], json["hub.foaf"],function() {
          // SOCKET SEND subscription was requested
          client.send("Asked subscription to " + json["hub.topic"]);
          log("Asked subscription for socket " + socketsid.socketId +
            " with cookie "+socketsid.clientId+" to " + json["hub.topic"]);

          // PERSISTENT STORE: if subscription succesful
          subscriptionsStore.addPublisherToSubscriber(socketsid.clientId, 
            {URI: json["hub.topic"], confirmed:false}, 
              function(error, subscription) {
            log("subscription: "+sys.inspect(subscription));
          });
        }, function(error) {    
//          // SOCKET SEND subscription could not be requested
//          client.send("Could not ask subscription to " + json["hub.topic"]);
//          log("Could not ask subscription for socket " + socketsid.socketId +
//              " with cookie " + socketsid.clientId+" to " + 
//              json["hub.topic"] +"with error: " + error);
        });

      } else if (json.GET) {
        if (json.GET == "followings") {
          var socketsid = sockets_store.get_socketclient(client.sessionId);
          
          log("Get followings for socket "+ socketsid.socketId + 
            " with cookie " + socketsid.clientId);
          subscriptionsStore.findByClientId(socketsid.clientId, 
            function(error, subscription) {
            log("subscription: "+sys.inspect(subscription));
            client.send(JSON.stringify(subscription.publishers) || "");
          });

        }
      }
    } catch(err) {
      log("no json, : " + err);
    }
  });
  
  // SOCKET DISCONNECT
  client.on("disconnect", function( ) {
    log("SOCKET DISCONNECT");
    //TODO: delete the socket id from memory
    //TODO: delete sockets_store.delete_socketclient(client.sessionId);
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
  "/callback", 
  function(req, res) {
    log("HTTP GET REQUEST TO callback_url");
    log("req.headers['user-agent']"+req.headers['user-agent']);
    log("req.headers['server']"+req.headers['server']);
    
    //when content-type: application/x-www-form-urlencoded;
//    if (req.headers['content-type'] == "application/x-www-form-urlencoded") {
//      log("www-form-urlencoded");
//      params = req.body;
//    } else {
//      log("no www-form-urlencoded");
//      params = req.query;
//    }
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
            sockets_store.get_socketclient_from_clientId(subscriber.ClientId)]
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
        log("Couldn't confirm " + mode + " to " + topic_url + "there are not \
        subscribers for the publisher");
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
        log("Couldn't confirm " + mode + " to " + topic_url + "there are not \
        subscribers for that topic");
        res.send(404);
      }
    });
});

// WEB SERVER FOAF POST REQUEST
web_server.post("/foaf",
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
    r = webid_check.validate_webid(cert_uri);
    log("result of webid validation: " + r);
    
    //ask subscriber/publisher for the private FOAF presenting socket server 
    // certificate
    
    //send FOAF back to PubSubHubbub server
}

web_server.addListener("listening", function() {
  var hostInfo = config.pubsubhubbub.listen.host + ":" + 
  `config.pubsubhubbub.listen.port.toString();
  log("Listening to HTTP connections on http://" + hostInfo);
});

// HTTP GET REQUEST TO /
web_server.get("/", function(req, res) {
    log("web server GET request");
    log("req.url"+req.url);
    log("req.params"+req.params);
  res.send("<a href='http://github.com/smob/'> SMOB </a> PubSubHubbub socket \
    proxy version of <a href='http://github.com/julien51/socket-sub'>Socket Sub\
    </a>", 200);
});

web_server.listen(config.pubsubhubbub.listen.port, 
  config.pubsubhubbub.listen.host);


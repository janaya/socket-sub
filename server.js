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
    app = express.createServer();

var config = JSON.parse(fs.readFileSync("./config.json", "utf8") ) || JSON.parse(fs.readFileSync("./default_config.json", "utf8") );
var callback_url = config.pubsubhubbub.callback_url_root + config.pubsubhubbub.callback_url_path;
var hub_url = config.pubsubhubbub.hub;

var log = function(message) {
  if(config.debug) {
    sys.puts(message);
  }
};



///////////////////////////////////////////////////////////////////////////////
//                              Socket server - client communication         //
///////////////////////////////////////////////////////////////////////////////

//var app = express.createServer(
//  express.bodyParser(),
//  express.cookieParser(),
//  //express.session({ secret: "keyboard cat", store: new RedisStore })
//  express.session({ secret: "keyboard cat", store: session_store })
//);
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
  // TODO: Theoretically client.headers.cookie point to the last logged in user, but not attached to the client object
  // so, could not be used thinks like?
//  log("server socket id origin: "+ws_server.clientsIndex[client.sessionId].request.headers.origin);
//  log("socket origin: "+client.request.headers.origin);
//  log("server socket id cookie: "+ws_server.clientsIndex[client.sessionId].request.headers.cookie);
//  log("socket cookie: "+client.request.headers.cookie);
//  log("server viewHelpers: "+client.listener.server.viewHelpers);
//  log("socket session?: "+sys.inspect(client.session));
  
  // To make client setup the cookie, is not possible to modify response headers?
  //res.header('Set-Cookie', 'cookiekey=cookievalue'); 
  //res.cookie(key, value);
  
  // should the cookie be stored in the session_store?
  //session_store.set(data.cookie, session);  
  
  // getting the cookie from the session later would work?
  //session_store.get(cookieid, function (error, session) {
  
  // For now, processing cookies like socket messages...
  
  // SOCKET RECEIVED FIRST MESSAGE
  client.once("message", function(data) {
    log("SOCKET RECEIVED FIRST MESSAGE: " + sys.inspect(data));
    
    // COOKIE RECEIVED
    if (data.ClientId) {
      log("COOKIE RECEIVED: "+data.ClientId);     
      // PERSISTENT STORE: find cookie
      subscriptionsStore.findByClientId(data.ClientId, function(error, subscription){
        log("found cookie in store:"+sys.inspect(subscription));
        // MEMORY STORE: map socket to cookie
        var socket_clientid = sockets_store.add_socketclient(client.sessionId,subscription.ClientId);
        log("mapped in memory socket id to cookie: "+sys.inspect(socket_clientid));
        //client.set(client.sessionId, subscription.ClientId, function () {
        //  socket.emit('ready');
        //});
        //session_store.set(client.sessionId, subscription.ClientId);
      });
    
    // NO COOKIE RECEIVED
    } else {
      log("NO COOKIE RECEIVED");     
      // SOCKET SEND COOKIE
      client.send(JSON.stringify({"ClientId": client.sessionId}) );
      log("SOCKET SEND COOKIE");
      // PERSISTENT STORE: save cookie
      subscriptionsStore.save({ClientId: client.sessionId}, function(error, subscription){
        log("found cookie in store:"+sys.inspect(subscription));
        // MEMORY STORE: map socket to cookie
        var socket_clientid = sockets_store.add_socketclient(client.sessionId,subscription.ClientId);
        log("mapped in memory socket id to cookie: "+sys.inspect(socket_clientid));
        //client.set(client.sessionId, subscription.ClientId, function () {
        //  socket.emit('ready');
        //});
        //session_store.set(client.sessionId, subscription.ClientId);
        log("cookie stored in mem" + sys.inspect(session_store));
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
        //client.get(client.sessionId, function (err, socketsid) {
        //  log('Chat message by ', socketid);
        //});
        //session_store.get(client.sessionId, function(error, socketsid){


        log("Subscribing socket "+socketsid.socketId+" with cookie "+socketsid.clientId+" to " + json["hub.topic"]);
        // TODO: get publisher clientId to create callback_url and store also the clientId
        
        // HTTP POST REQUEST TO hub_url {"hub.mode":"subscribe","hub.verify":"async","hub.callback":callback_url","hub.topic": json["hub.topic"]}     
        hub.subscribe(hub_url, "subscribe", "sync", callback_url, json["hub.topic"], function() {
          // SOCKET SEND subscription was requested
          client.send("Asked subscription to " + json["hub.topic"]);
          log("Asked subscription for socket "+socketsid.socketId+" with cookie "+socketsid.clientId+" to " + json["hub.topic"]);
  
          // PERSISTENT STORE: if subscription succesful
          subscriptionsStore.addPublisherToSubscriber(socketsid.clientId, {URI: json["hub.topic"], confirmed:false}, function(error, subscription) {
            log("subscription: "+sys.inspect(subscription));
          });
        }, function(error) {    
//          // SOCKET SEND subscription could not be requested
//          client.send("Could not ask subscription to " + json["hub.topic"]);
//          log("Could not ask subscription for socket "+socketsid.socketId+" with cookie "+socketsid.clientId+" to " + json["hub.topic"] +"with error: " + error);
        });          
        
        
        //});
        
      }
      else if (json.GET) {
        if (json.GET == "followings") {
          var socketsid = sockets_store.get_socketclient(client.sessionId);
          //client.get(client.sessionId, function (err, socketsid) {
          //  log('Chat message by ', socketid);
          //});
          //session_store.get(client.sessionId, function(error, socketsid){
          
          
          log("Get followings for socket "+socketsid.socketId+" with cookie "+socketsid.clientId);
          subscriptionsStore.findByClientId(socketsid.clientId, function(error, subscription) {
            log("subscription: "+sys.inspect(subscription));
            client.send(JSON.stringify(subscription.publishers) || "");
          });            
          
          
          //});
          
        }
      }
    } catch(err) {
      log("no json, : " + err);
    }
  });
  
  // SOCKET DISCONNECT
  client.on("disconnect", function( ) {
    log("SOCKET DISCONNECT");
    //delete the socket id from memory
    //delete sockets_store.delete_socketclient(client.sessionId);
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
    if (req.headers['content-type'] == "application/x-www-form-urlencoded") {
      log("www-form-urlencoded");
      //params = req.body;
    } else {
      log("no www-form-urlencoded");
      //params = req.query;
    }
    params = req.body || req.query || req.params;
    log(sys.inspect(req.body));
    log(sys.inspect(req.query));
    log(sys.inspect(req.params));
    log(sys.inspect(params));
    var topic_url = params['hub.topic'] || null;
    var mode = params['hub.mode'] || null;
    var challenge = params['hub.challenge'] || null;
    
    // get publisher socket id by topic_url
    
    // PERSISTENT STORE: get which subsribers asked to subscribe to that publisher 
    subscriptionsStore.findByPublisherURInotconfirmed(topic_url, function(error, subscribers) {
      if (subscribers && (mode == "subscribe" || mode == "unsubscribe")) {
        for (subscriber in subscribers) {
          log("subcriber with pending subscriptions: "+sys.inspect(subscriber));
          // TODO: if socket not online, not confirm
          var socket = ws_server.clientsIndex[get_socketclient_from_clientId(subscriber.ClientId)]
          if (socket) {
            // set confirm: true
            subscriptionsStore.confirmByPublisherURI(topic_url, function(error, subscribers) {
              log("Confirmed subscriptions: "+sys.inspect(subscribers));
            });
            // SOCKET SEND CONFIRMATION TO SUBSCRIBER
            socket.send("Confirmed subscription");
            
            // HTTP RESPONSE TO hub_url with challenge
            res.send(challenge, 200);
            log("Sent: " + challenge);
          } else {
            // Socket is offline, couldn't confirm
            
            // HTTP RESPONSE TO hub_url
            log("Couldn't confirm " + mode + " to " + topic_url);
            res.send(404);
          }       
        } // end for
      // there are not subscribers for that publisher
      } else {   
        // (no subscribers to that topic)
        
        // HTTP RESPONSE TO hub_url
        log("Couldn't confirm " + mode + " to " + topic_url);
        res.send(404);
      }
    });
});


// WEB SERVER POST REQUESTS
// (incoming post notifications)

//web_server.post(
//  config.pubsubhubbub.callback_url_path + ':feed_id', 
web_server.post(
  "/callback", 
  function(req, res) {
    log("WEB SERVER POST REQUEST");
    log("req.headers['user-agent']"+req.headers['user-agent']);
    log("req.headers['server']"+req.headers['server']);
    
    //when content-type: application/x-www-form-urlencoded;
    if (req.headers['content-type'] == "application/x-www-form-urlencoded") {
      params = req.body;
    } else {
      params = req.query;
    }
    log(sys.inspect(req.body));
    log(sys.inspect(req.query));
    log(sys.inspect(req.params));
    log(sys.inspect(params));
    var topic_url = params['hub.topic'] || null;
    var mode = params['hub.mode'] || null;
    
    // PERSISTENT STORE: get subscriber sid subscribed to that publisher
    subscriptionsStore.findByPublisherURI(topic_url, function(error, subscribers) {
      if (subscribers && (mode == "publish")) {
        req.on('data', function(data) {
          log("in data");
          
          for (subscriber in subscribers) {
            var socket = ws_server.clientsIndex[get_socketclient_from_clientId(subscriber.ClientId)]
            if(socket) {
              // SOCKET SEND NOTIFICATION TO SUBSCRIBER 
              socket.send(data); //, function(socket) {
              log("Sent notification to socket " + socket.sessionId + " for " + subscription.feed.url);
              // TODO: mark the notification?
              
              // HTTP RESPONSE TO hub_url 200
              res.send("Thanks", 200);
            } else {
              // subscribers should be notified later
              // this is actually the hub functionality!!
              
              // HTTP RESPONSE TO hub_url 404
              log("Couldn't find online socket for feed " + topic_url);
              res.send(404);
            }
          } // end for
        });
      }
      else {
        // (no subscribers to that topic)
        log("Couldn't confirm " + mode + " to " + topic_url);
        res.send(404);
      }
    });
});

web_server.addListener("listening", function() {
  var hostInfo = config.pubsubhubbub.listen.host + ":" + config.pubsubhubbub.listen.port.toString();
  log("Listening to HTTP connections on http://" + hostInfo);
});

// HTTP GET REQUEST TO /
web_server.get("/", function(req, res) {
    log("web server GET request");
    log("req.url"+req.url);
    log("req.params"+req.params);
  res.send("<a href='http://github.com/julien51/socket-sub'>Socket Sub</a>", 200);
});

//var subscriptionsStore = new SubscriptionsStore(); 
//ws_server.listen(config.websocket.listen.port, config.websocket.listen.host);
web_server.listen(config.pubsubhubbub.listen.port, config.pubsubhubbub.listen.host);


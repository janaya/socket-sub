var fs = require("fs"),
    express = require("express"),
    sys = require("sys"),
    http = require("http"),
    querystring = require("querystring"),
    url = require("url"),
    base64 = require("./deps/base64"),
    //ws = require('./deps/node-websocket-server/lib/ws'),
    http = require('http'), 
    //uuid = require('uuid-pure').newId,
    Crypto = require('crypto'),
    io = require('socket.io');

var MemoryStore = require('connect').session.MemoryStore
var session_store = new MemoryStore();

var SubscriptionsStore= require('./subscriptions-mongodb').SubscriptionsStore;
// TODO: store subscriptions in peristant storage
//var RedisStore = require('connect-redis');
//var session_store = new RedisStore;
//({ reapInterval: 60000 * 10 });
//var Store = require('connect').session.Store,
//    redis = require('./redis');

var config = JSON.parse(fs.readFileSync("./config.json", "utf8") ) || JSON.parse(fs.readFileSync("./default_config.json", "utf8") );

var log = function(message) {
  if(config.debug) {
    sys.puts(message);
  }
};

var hub_subscribe = require('./subscriptions-mongodb');
///////////////////////////////////////////////////////////////////////////////
//                              Socket server - client communication         //
///////////////////////////////////////////////////////////////////////////////

//var app = express.createServer(function(){ 
//});

// TODO: store subscriptions in peristant storage
//app.configure(function () {});
////app.use(express.session({ store: session_store }));
//app.use(express.bodyParser());
//app.use(express.cookieParser());
////app.use(express.session({ secret: "keyboard cat", store: new RedisStore }));\

var app = express.createServer(
  express.bodyParser(),
  express.cookieParser(),
  //express.session({ secret: "keyboard cat", store: new RedisStore })
  express.session({ secret: "keyboard cat", store: session_store })
);

var subscriptionsStore= new SubscriptionsStore('localhost', 27017);

//app.listen(config.websocket.listen.port);
app.listen(config.websocket.listen.port, function () {
  var addr = app.address();
  log('app listening on http://' + addr.address + ':' + addr.port);
});

var ws_server = io.listen(app);
log("socket server listening");

// ON SOCKET STABLISHED
ws_server.on("connection", function(client) {
  log("On connection");
  log("Client.sessionid: ");
  log(client.sessionId); 
  // TODO: how to get the cookie header sent in the first request together with the upgrade header?
  // TODO: check that headers.cookie only stores the first client cookie
  log(client.request.headers.cookie);
  
  // if using express server (req, res), session-cookies management could be: 
  //req.session.regenerate...
  //res.header('Set-Cookie', 'cookiekey=cookievalue'); 
  //res.cookie(key, value);
  //req.session = {user:name);
  //if (req.session.user){
  
  // However client.request... or client.listener... is not directly attached to the client object and always point to the last logged in user!
  //var cookie_string = client.request.headers.cookie;
  //var parsed_cookies = express.utils.parseCookie(cookie_string);
  //var connect_sid = parsed_cookies['express.sid'];
  //if (connect_sid) {
  //  session_store.get(connect_sid, function (error, session) {
  //    //HOORAY NOW YOU'VE GOT THE SESSION OBJECT!!!!
  //  });
  //}
  //var session = client.listener.server.viewHelpers; 
  
  // ON FIRST MESSAGE RECEIVED
  client.once("message", function(data) {
    log("Message received: ");
    log(data);
    
    // COOKIE RECEIVED
    if (data.SID) {
      log("cookie received: ");
      log(data.SID);
      
      // TODO: use persistent storage
      //session_store.get(data.SID, function(error, session){
      subscriptionsStore.findBySID(data.SID, function(error, subscription){
        // save more data in session
        // session.pings = session.pings + 1 || 1;
        // log("You have made " + session.pings + " pings.");
        //session_store.set(data.cookie, session);  
        
        // where is the data stored in session?
//        log("stored in session: ...");
//        log(session);
//        for (property in session) {
//          log(property + ': ' + session[property]+'; ');
//        }
        log("found cookie in store");
        log(subscription);
      });
    
    // NO COOKIE RECEIVED
    } else {
      log("no cookie received");     
      // SENT COOKIE
      client.send(JSON.stringify({"SID": client.sessionId}) );
      log("sent cookie");
      subscriptionsStore.save({"SID": client.sessionId}, function(error, subscription){
        log("cookie saved");
        log(subscription);
      });
      
    }
    

    // ON FIRST MESSAGE RECEIVED
    client.on("message", function(data) {
      log("Message received: ");
      log(data);
    });
    
  });
  
  // DISCONNECT
  client.on("disconnet", function( ) {
    log("Disconnected");
    // Not much to do.
    //unsubscribe !!
  });

});



///////////////////////////////////////////////////////////////////////////////
//                              Web server - Hubbub communication            //
///////////////////////////////////////////////////////////////////////////////
var web_server = express.createServer();

// WEB SERVER GET REQUESTS
// (SUBSCRIPTION VERIFICATION)
web_server.get(
  config.pubsubhubbub.callback_url_path + ':feed_id', 
  function(req, res) {
    log("web server GET request");
    log("req.url"+req.url);
    var challenge = req.url.split("hub.challenge=")[1].split("&")[0];
    log("challenge received:"+challenge);
    var mode = req.url.split("hub.mode=")[1].split("&")[0];
    log("mode: "+mode);
    log("req.method"+req.method);
    log("req.headers.accept"+req.headers.accept);
    log("req.headers.server"+req.headers.server);
    
    var feed_id =req.params.feed_id;
    log("feed_id:"+ feed_id);
    
    // check subscription was requested?
    var feed = subscriptions_store.feeds[feed_id];
    
    // MODE SUBSCRIBE
    if (feed && mode == "subscribe") {
      log("Confirmed " + mode + " to " + feed.feed.url )
      // response hub server with the challenge
      res.send(challenge, 200);
      log("Sent: " + challenge);
      
      //TODO: notify the publisher about the follower!!??
    }
    // MODE UNSUBSCRIBE
    else if (feed && mode == "unsubscribe") {
      // We need to check all the susbcribers. To make sure they're all offline
      var sockets = 0;
      for(subscription_id in feed.subscriptions) {
        subscription = feed_subs.subscriptions[subscription_id];
        
        //??
        ws_server.send(subscription.socket_id, "", function(socket) {
          if(socket) {
            sockets += 1;
          } 
        });
      }
      if(sockets == 0) {
        // We haven't found any socket to send the updates too
        // Let's delete the feed
        log("Confirmed " + mode + " to " + feed.feed.url)
        // response hub server with the challenge
        res.send(challenge, 200);
      }
      else {
        log("Couldn't confirm " + mode + " to " + feed.feed.url)
        res.send(404);
      }
    }
    else {
      log("Couldn't confirm " + mode + " to " + req.params.feed_id)
      res.send(404);
    }
});


// WEB SERVER POST REQUESTS
// (INCOMING POST NOTIFICATIONS)
// Sends the data to the right Socket, based on the subscription. 
// Unsubscribes unused subscriptions.
web_server.post(
  config.pubsubhubbub.callback_url_path + ':feed_id', 
  function(req, res) {
    log("web server POST request");
    
    // check subscription socket id????
    var feed_subs = subscriptions_store.feeds[req.params.feed_id];
    log("req.params.feed_id " + req.params.feed_id);
    if (feed_subs) {
      req.on('data', function(data) {
        log("in data");
        var sockets = 0;
        
        // subscriptions in store????
        for(subscription_id in feed_subs.subscriptions) {
          subscription = feed_subs.subscriptions[subscription_id];
          
          // SEND NOTIFICATION TO SUBSCRIBER
          ws_server.send(subscription.socket_id, data, function(socket) {
          //ws_server.clientsIndex[SID].send //?
            if(socket) {
              sockets += 1;
              log("Sent notification for " + subscription.socket_id + " for " + subscription.feed.url);


            } 
            else {
              log("Looks like " + subscription.socket_id + " is offline! Removing " + subscription.feed.url + " from it");
              //have to subscribe each time socket is not connected! :(
              
              // it should be stored to send later
              subscriptions_store.delete_subscription(subscription.feed.id, subscription.socket_id);
            }
          });
        }
        
        // DELETE PUBLISHERS WITHOUT SUBSCRIBERS
        if(sockets == 0) {
          // We haven't found any socket to send the updates too
          // Let's delete the feed
          log("Nobody subscribed to feed " + feed_subs.feed.url)
          
          // delete store
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
    
    // NO SUBSCRIPTION WITH THAT PUBLISHER
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
//var cookies_store = new cookieStore();
ws_server.listen(config.websocket.listen.port, config.websocket.listen.host);
web_server.listen(config.pubsubhubbub.listen.port, config.pubsubhubbub.listen.host);


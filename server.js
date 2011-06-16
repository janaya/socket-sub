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

var qs = require('qs');
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
  //log(client.request.headers.cookie);
  
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
      
      // TODO: use persistent storage        // save more data in session
      // session.pings = session.pings + 1 || 1;
      // log("You have made " + session.pings + " pings.");
      //session_store.set(data.cookie, session);  
      
      // where is the data stored in session?
//        log("stored in session: ...");
//        log(session);
//        for (property in session) {
//          log(property + ': ' + session[property]+'; ');
//        }
      //session_store.get(data.SID, function(error, session){
      subscriptionsStore.findBySID(data.SID, function(error, subscription){
        log("found cookie in store");
        for (property in subscription) {
          log(property + ': ' + subscription[property]+'; ');
        }
        client.SID = subscription.SID;
        log("client.SID"+client.SID);
      });
    
    // NO COOKIE RECEIVED
    } else {
      log("no cookie received");     
      // SENT COOKIE
      client.send(JSON.stringify({"SID": client.sessionId}) );
      log("sent cookie");
      subscriptionsStore.save({SID: client.sessionId}, function(error, subscription){
        log("cookie saved ");
        for (property in subscription) {
          log(property + ': ' + subscription[property]+'; ');
        }
      });
      
    }
    

    // ON MESSAGE RECEIVED
    client.on("message", function(data) {
      log("Message received: ");
      log(data);
      
      try {
        subs = JSON.parse(data);
        // When asked to subscribe to a feed_url
        log("Subscribing to " + subs["hub.topic"]);
        subscriptionsStore.addPublisherToSubscriber(client.sessionId, {URI: subs["hub.topic"]}, function(error, subscription) {
          log("subscription: ");
          log(subscription);        
        });
  //      var subscription = subscriptionsStore.subscribe(socket.id, subs["hub.topic"]);
  //      subscribe(subscription.feed, "subscribe", subs.hub_url, function() {
  //        ws_server.send("Subscribed to " + subs["hub.topic"]);
  //        log("Subscribed to " + subscription.feed.url + subs["hub.topic"] + " for " + socket.id);
  //      }, function(error) {
  //        ws_server.send("Couldn't subscribe to " + subs["hub.topic"] + " : "+ error.trim() );
  //        log("Failed subscription to " + subs["hub.topic"] + " for " + socket.id);
  //      });
      } catch(err) {
        log("error trying to parse message received: " + err);
      }
    });
    
  });
  
  // DISCONNECT
  client.on("disconnet", function( ) {
    log("Disconnected");
    //unsubscribe !!
  });

});



///////////////////////////////////////////////////////////////////////////////
//                              Web server - Hubbub communication            //
///////////////////////////////////////////////////////////////////////////////
var web_server = express.createServer(
  express.bodyParser()
);


// WEB SERVER GET REQUESTS
// (SUBSCRIPTION VERIFICATION)
//web_server.get(
//  config.pubsubhubbub.callback_url_path + ':feed_id', 
log("callback url: "+config.pubsubhubbub.callback_url_path + ':feed_id');
web_server.get(
  "/callback", 
  function(req, res) {
    log("web server GET request");
    log("req.headers['user-agent']"+req.headers['user-agent']);
    log("req.headers['server']"+req.headers['server']);
    
    //when content-type: application/x-www-form-urlencoded;
    if (req.headers['content-type'] == "application/x-www-form-urlencoded") {
      params = req.body;
    } else {
      params = req.query;
    }
    var topic_url = params['hub.topic'] || null;
    var mode = params['hub.mode'] || null;
    var challenge = params['hub.challenge'] || null;
    res.send("ok",200);
    
    
    // check subscription was requested?
//    var feed = subscriptionsStore.feeds[feed_id];
    
    // MODE SUBSCRIBE
//    if (feed && mode == "subscribe") {
//      log("Confirmed " + mode + " to " + feed.feed.url )
//      // response hub server with the challenge
//      res.send(challenge, 200);
//      log("Sent: " + challenge);
//      
//      //TODO: notify the publisher about the follower!!??
//    }
//    // MODE UNSUBSCRIBE
//    else if (feed && mode == "unsubscribe") {
//      // We need to check all the susbcribers. To make sure they're all offline
//      var sockets = 0;
//      for(subscription_id in feed.subscriptions) {
//        subscription = feed_subs.subscriptions[subscription_id];
//        
//        //??
//        //ws_server.send(subscription.socket_id, "", function(socket) {
//        //  if(socket) {
//            sockets += 1;
//          } 
//        });
//      }
//      if(sockets == 0) {
//        // We haven't found any socket to send the updates too
//        // Let's delete the feed
//        log("Confirmed " + mode + " to " + feed.feed.url)
//        // response hub server with the challenge
//        res.send(challenge, 200);
//      }
//      else {
//        log("Couldn't confirm " + mode + " to " + feed.feed.url)
//        res.send(404);
//      }
//    }
//    else {
//      log("Couldn't confirm " + mode + " to " + req.params.feed_id)
//      res.send(404);
//    }
});


// WEB SERVER POST REQUESTS
// (INCOMING POST NOTIFICATIONS)
// Sends the data to the right Socket, based on the subscription. 
// Unsubscribes unused subscriptions.
//web_server.post(
//  config.pubsubhubbub.callback_url_path + ':feed_id', 
web_server.post(
  "/callback", 
  function(req, res) {
    log("web server POST request");
    log("req.headers['user-agent']"+req.headers['user-agent']);
    log("req.headers['server']"+req.headers['server']);
    
    //when content-type: application/x-www-form-urlencoded;
    if (req.headers['content-type'] == "application/x-www-form-urlencoded") {
      params = req.body;
    } else {
      params = req.query;
    }
    var topic_url = params['hub.topic'] || null;
    var mode = params['hub.mode'] || null;
    
    // GET SUBSCRIBER SID FROM STORE
    subscribers = subscriptionsStore.findByPublisherURI(topic_url);
    if (subscribers) {
      req.on('data', function(data) {
        log("in data");
        var sockets = 0;
        
        for (subscriber in subscribers) {
          // SEND NOTIFICATION TO SUBSCRIBER
          ws_server.clientsIndex[subscriber.SID].send(data, function(socket) {
            if(socket) {
              sockets += 1;
              log("Sent notification for " + subscriber.SID + " for " + subscription.feed.url);
            } else {
              // subscribers should be notified later
              // this is actually the hub functionality!!
            }
          });
        }
      });
    }
    
    // just for debugging
    res.send("ok",200);
    //ws_server.clientsIndex[SID].send //?
    
    
//    // check subscription socket id????
//    var feed_subs = subscriptionsStore.feeds[req.params.feed_id];
//    log("req.params.feed_id " + req.params.feed_id);
//    if (feed_subs) {
//      req.on('data', function(data) {
//        log("in data");
//        var sockets = 0;
//        
//        // subscriptions in store????
//        for(subscription_id in feed_subs.subscriptions) {
//          subscription = feed_subs.subscriptions[subscription_id];
//          
//          // SEND NOTIFICATION TO SUBSCRIBER
//          ws_server.send(subscription.socket_id, data, function(socket) {
//            if(socket) {
//              sockets += 1;
//              log("Sent notification for " + subscription.socket_id + " for " + subscription.feed.url);


//            } 
//            else {
//              log("Looks like " + subscription.socket_id + " is offline! Removing " + subscription.feed.url + " from it");
//              //have to subscribe each time socket is not connected! :(
//              
//              // it should be stored to send later
//              subscriptionsStore.delete_subscription(subscription.feed.id, subscription.socket_id);
//            }
//          });
//        }
//        
//        // DELETE PUBLISHERS WITHOUT SUBSCRIBERS
//        if(sockets == 0) {
//          // We haven't found any socket to send the updates too
//          // Let's delete the feed
//          log("Nobody subscribed to feed " + feed_subs.feed.url)
//          
//          // delete store
//          subscribe(feed_subs.feed, "unsubscribe", function() {
//            log("Unsubscribed from " + feed_subs.feed.url);
//            delete subscriptionsStore.feeds[req.params.feed_id];
//          }, function(error) {
//            log("Couldn't unsubscribe from " + feed_subs.feed.url + "(" + error.trim() + ")");
//          }) 
//          res.send(404);
//        }
//        else {
//          res.send("Thanks", 200);
//        }
//      });
//    }
//    
//    // NO SUBSCRIPTION WITH THAT PUBLISHER
//    else {
//      log("Couldn't find feed " + req.params.feed_id)
//      res.send(404);
//    }
});

web_server.addListener("listening", function() {
  var hostInfo = config.pubsubhubbub.listen.host + ":" + config.pubsubhubbub.listen.port.toString();
  log("Listening to HTTP connections on http://" + hostInfo);
});

web_server.get("/", function(req, res) {
    log("web server GET request");
    log("req.url"+req.url);
    log("req.params"+req.params);
  res.send("<a href='http://github.com/julien51/socket-sub'>Socket Sub</a>", 200);
});

//var subscriptionsStore = new SubscriptionsStore(); 
//ws_server.listen(config.websocket.listen.port, config.websocket.listen.host);
web_server.listen(config.pubsubhubbub.listen.port, config.pubsubhubbub.listen.host);


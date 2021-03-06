/**
 * author: Julia Anaya
 *
 * Based on nodejs-ws-webid.js
 * Forge WebID WebSocket Demo Server
 *
 * @author Dave Longley
 *
 * Copyright (c) 2011 Digital Bazaar, Inc. All rights reserved.
 */
var forge = require('./deps/websocket/forge/forge');
var fs = require('fs');
var http = require('http');
//var rdf = require('./deps/websocket/rdflib');
var sys = require('sys');
var urllib = require('url');
//var ws = require('./deps/websocket/ws');
var rdfparser = require("./deps/parser.js");

// remove xmlns from input
var normalizeNs = function(input, ns)
{
   var rval = null;
   
   // primitive
   if(input.constructor === String ||
      input.constructor === Number ||
      input.constructor === Boolean)
   {
      rval = input;
   }
   // array
   else if(input.constructor === Array)
   {
      rval = [];
      for(var i = 0; i < input.length; ++i)
      {
         rval.push(normalizeNs(input[i], ns));
      }
   }
   // object
   else
   {
      if('@' in input)
      {
         // copy namespace map
         var newNs = {};
         for(var key in ns)
         {
            newNs[key] = ns[key];
         }
         ns = newNs;
         
         // update namespace map
         for(var key in input['@'])
         {
            if(key.indexOf('xmlns:') === 0)
            {
               ns[key.substr(6)] = input['@'][key];
            }
         }
      }
      
      rval = {};
      for(var key in input)
      {
         if(key.indexOf('xmlns:') !== 0)
         {
            var value = input[key];
            var colon = key.indexOf(':');
            if(colon !== -1)
            {
               var prefix = key.substr(0, colon);
               if(prefix in ns)
               {
                  key = ns[prefix] + key.substr(colon + 1);
               }
            }
            rval[key] = normalizeNs(value, ns);
         }
      }
   }
   
   return rval;
};

var getPublicKeyParser = function(data, uri, callback) {
  var rsaNS="http://www.w3.org/ns/auth/rsa#"
  var myRDF=new RDF();
  myRDF = rdfParser.getRDFURL(uri, function() {
    var keys=[];
    key = myRDF.Match(null,null,rsaNS+"modulus",null);
    
     keys.push(
     {
        modulus: graph[props[modulus]][hex],
        exponent: graph[props[exponent]][decimal]
     });
    callback(keys);
  });
}

// gets public key from WebID rdf
var getPublicKey = function(data, uri, callback) {
   sys.log("FOAF uri " + uri);
   // FIXME: use RDF library to simplify code below
   //var kb = new rdf.RDFParser(rdf.IndexedFormula(), uri).loadBuf(data);
   //var CERT = rdf.Namespace('http://www.w3.org/ns/auth/cert#');
   //var RSA  = rdf.Namespace('http://www.w3.org/ns/auth/rsa#');
   var RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
   var CERT = 'http://www.w3.org/ns/auth/cert#';
   var RSA  = 'http://www.w3.org/ns/auth/rsa#';
   var desc = RDF + 'Description';
   var about = RDF + 'about';
   var type = RDF + 'type';
   var resource = RDF + 'resource';
   var publicKey = RSA + 'RSAPublicKey';
   var modulus = RSA + 'modulus';
   var exponent = RSA + 'public_exponent';
   var identity = CERT + 'identity';
   var hex = CERT + 'hex';
   var decimal = CERT + 'decimal';
   
   // gets a resource identifer from a node
   var getResource = function(node, key)
   {
      var rval = null;
      
      // special case 'about'
      if(key === about)
      {
         if('@' in node &&
            about in node['@'])
         {
            rval = node['@'][about];
         }
      }
      // any other resource
      else if(
         key in node &&
         node[key].constructor === Object &&
         '@' in node[key] &&
         resource in node[key]['@'])
      {
         rval = node[key]['@'][resource];
         if ('#' in node[key] && resource2 in node[key]['#']){
           rval[resource] = resource2;
         }
      }
      //FIXME: hackish
//      else {
//        rval = node[key]['#'];
//      }
      return rval;
   };
   
   // parse XML
   uri = urllib.parse(uri);
   var xml2js = require('./deps/websocket/xml2js');
   var parser = new xml2js.Parser();
   parser.addListener('end', function(result)
   {
      sys.log("parser result" + sys.inspect(result));
      // normalize namespaces
      result = normalizeNs(result, {});
      
      // find grab all public keys whose identity matches hash from uri
      var keys = [];
      if(desc in result)
      {
         sys.log("desc in result");
         // normalize RDF descriptions to array
         if(result[desc].constructor !== Array)
         {
            desc = [result[desc]];
         }
         else
         {
            desc = result[desc];
         }
         sys.log("descriptions" + sys.inspect(desc));
         // collect properties for all resources 
         var graph = {};
         for(var i = 0; i < desc.length; ++i)
         {
            var node = desc[i];
            sys.log("node " + sys.log(node));
            var res = {};
            for(var key in node)
            {
               sys.log("key " + sys.inspect(key));
               var obj = getResource(node, key);
               sys.log("obj " + sys.inspect(obj));
               res[key] = (obj === null) ? node[key] : obj;
            }
            sys.log("res " + sys.inspect(res));
            graph[getResource(node, about) || ''] = res;
         }
         sys.log("graph " + sys.inspect(graph));
         // for every public key w/identity that matches the uri hash
         // save the public key modulus and exponent
         for(var r in graph)
         {
            var props = graph[r];
            if(identity in props &&
               type in props &&
               props[type] === publicKey &&
               props[identity] === uri.hash &&
               modulus in props &&
               exponent in props &&
               props[modulus] in graph &&
               props[exponent] in graph &&
               hex in graph[props[modulus]] &&
               decimal in graph[props[exponent]])
            {
               keys.push(
               {
                  modulus: graph[props[modulus]][hex],
                  exponent: graph[props[exponent]][decimal]
               });
            }
         }
      }
      
      sys.log('Public keys from RDF: ' + JSON.stringify(keys))
      callback(keys);
   });
   parser.parseString(data);
};

// compares two public keys for equality
var comparePublicKeys = function(key1, key2) {
   return key1.modulus === key2.modulus && key1.exponent === key2.exponent;
};

// gets the RDF data from a URL
var fetchUrl = function(url, callback, redirects) {
   // allow 3 redirects by default
   if(typeof(redirects) === 'undefined')
   {
      redirects = 3;
   }
   
   sys.log('Fetching URL: \"' + url + '\"');
   
   // parse URL
   //FIXME: hardcoding url to match certificate
   url = forge.util.parseUrl("http://localhost:8002/me");
   var client = http.createClient(
      url.port, url.host);//, url.scheme === 'https');
   var request = client.request('GET', url.path,
   {
      'Host': url.host,
      'Accept': 'application/rdf+xml'
   });
   request.addListener('response', function(response)
   {
      var body = '';
      
      // error, return empty body
      if(response.statusCode >= 400)
      {
         callback(body);
      }
      // follow redirect
      else if(response.statusCode === 302)
      {
         if(redirects > 0)
         {
            // follow redirect
            fetchUrl(response.headers.location, callback, --redirects);
         }
         else
         {
            // return empty body
            callback(body);
         }
      }
      // handle data
      else
      {
         response.setEncoding('utf8');
         response.addListener('data', function(chunk)
         {
            body += chunk;
         });
         response.addListener('end', function()
         {
            callback(body);
         });
      }
    });
    request.end();
};

// does WebID authentication
var authenticateWebId = function(cert, state) {
   var auth = false;
   
   // get client-certificate
   //var cert = c.peerCertificate;
   
   // get public key from certificate
   var publicKey =
   {
      modulus: cert.publicKey.n.toString(16).toLowerCase(),
      exponent: cert.publicKey.e.toString(10)
   };
   
   sys.log(
      'Server verifying certificate w/CN: \"' +
      cert.subject.getField('CN').value + '\"\n' +
      'Public Key: ' + JSON.stringify(publicKey));
   
   // build queue of subject alternative names to authenticate with
   var altNames = [];
   var ext = cert.getExtension({name: 'subjectAltName'});
   if(ext !== null && ext.altNames)
   {
      for(var i = 0; i < ext.altNames.length; ++i)
      {
         var altName = ext.altNames[i];
         if(altName.type === 6)
         {
            altNames.push(altName.value);
         }
      }
   }
   
   // create authentication processor
   var authNext = function()
   {
      if(!auth)
      {
         // no more alt names, auth failed
         if(altNames.length === 0)
         {
            sys.log('WebID authentication FAILED.');
              return false;
//            c.prepare(JSON.stringify(
//            {
//               success: false,
//               error: 'Not Authenticated'
//            }));
//            c.close();
         }
         // try next alt name
         else
         {
            // fetch URL
            var url = altNames.shift();
            fetchUrl(url, function(body)
            {
               sys.log("FOAF fetched: " + body);
               // get public key
               getPublicKey(body, url, function(keys)
               {
                  sys.log("keys found " + sys.inspect(keys));
                  // compare public keys from RDF until one matches
                  for(var i = 0; !auth && i < keys.length; ++i)
                  {
                     auth = comparePublicKeys(keys[i], publicKey);
                  }
                  if(auth)
                  {
                     // send authenticated notice to client
                     sys.log('WebID authentication PASSED.');
                     state.authenticated = true;
                     return true;
//                     c.prepare(JSON.stringify(
//                     {
//                        success: true,
//                        cert:
//                        {
//                           subject: cert.subject
//                        },//certforge.pki.certificateToPem(cert),
//                        webID: url,
//                        rdf: forge.util.encode64(body)
//                     }));
                  }
                  else
                  {
                     // try next alt name
                     authNext();
                  }
               });
            });
         }
      }
   };
   
   // do auth
   authNext();
};


var fetchCert = function(cert_url, callback) {
  // parse URL
  var url = forge.util.parseUrl(cert_url);
  sys.log("" + url.port + url.fullHost + url.path + url.host);
  var client = http.createClient(
    url.port, url.host);
  var request = client.request('GET', url.path, {
    'Host': url.host,
    //'Accept': 'application/rdf+xml'
  });
  request.addListener('response', function(response) {
    var body = '';
    
    // error, return empty body
    if(response.statusCode >= 400)
    {
       callback(body);
    }
    // handle data
    else
    {
       response.setEncoding('utf8');
       response.addListener('data', function(chunk)
       {
          body += chunk;
       });
       response.addListener('end', function()
       {
          callback(body);
       });
    }
  });
  request.end();
};

var validate_webid = function(cert_url) {
  sys.log("validating webid for cert url " + cert_url);
  fetchCert(cert_url, function(body) {
    sys.log("cert: " + body);
    //var x509 = new X509();
    //x509.readCertPEM(_PEM_X509CERT_STRING_);
    var cert = forge.pki.certificateFromPem(body, true);
    try {
          authenticateWebId(cert, false);
          return true;
    } catch(ex) {
          return false
    }
  });
};

exports.validate_webid = validate_webid;


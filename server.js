var path = require('path'); //http://nodejs.org/api/path.html
var fs = require('node-fs'); // Recursive directory creation. https://github.com/bpedro/node-fs
var os = require('os'); // http://nodejs.org/api/os.html
var _ = require('lodash'); // Utilities. http://underscorejs.org/
var child_process = require('child_process'); // http://nodejs.org/api/child_process.html

var ConsoleState = require('./model/consoleState.js').ConsoleState;
var BaseModel = require('./model/baseModel.js').BaseModel;
var Network = require('./model/network.js').Network;
var ContentUpdater = require('./model/contentUpdater.js').ContentUpdater;
var AppUpdater = require('./model/appUpdater.js').AppUpdater;
var Persistence = require('./model/persistence.js').Persistence;
var ServerState = require('./model/serverState.js').ServerState;
var Logging = require('./model/logging.js').Logging;

// Set the current working directory to the location of server.js so it's always consistent.
process.chdir(path.dirname(process.mainModule.filename));

global.$$config = {};

// args will be ['node', 'server.js', 'config.json', 'dev.i14']
var configPath = '';
var configPaths = process.argv[2] ? process.argv[2].split(',') : [];
var configScheme = process.argv[3] ? process.argv[3] : '';

// A persistent state object, saved to state.json.
global.$$serverState = new ServerState();

// load from server state if config is stored
if (global.$$serverState.get('config')) {
    configPath = $$serverState.get('config');
} else if (process.argv.length > 2) {
    configPath = configPaths[0];
}
console.log(configPath);
if (configPath && fs.existsSync(configPath)) {
    var config = fs.readFileSync(configPath, {
        encoding: 'UTF8'
    });

    // replace environment variables in the config file with their contents
    process.env['CD'] = process.cwd(); // jshint ignore:line
    config = config.replace(/%([^%]+)%/g, function(_, n) {
        // also escape slashes
        return (process.env[n] + '').replace(/[\\"']/g, '\\$&').replace(/[\\"']/g, '\\$&');
    });
    config = JSON.parse(config);

    if (!config['default']) {
        // There are no schemes in the config, just ingest it whole.
        console.log('Using single configuration.');
        _.merge($$config, config);
    } else {
        // Merge the default config.
        console.log('Merging config: default');
        _.merge($$config, config['default']);
        var schemes = configScheme.split('.');
        var currentScheme = '';

        // Merge the schemes passed on the command line.
        // "dev.foo" would merge "dev" then "dev.foo" then "dev.foo".
        for (var i = 0; i < schemes.length; i++) {
            currentScheme += schemes[i];
            console.log('Merging config: ' + currentScheme);
            _.merge($$config, config[currentScheme]);
            currentScheme += '.';
        }

        // Merge machine-specific schemes.
        // "I14" would merge "I14", then "I14.dev", then "I14.dev.foo".
        var machine = os.hostname();
        console.log('Merging config: ' + machine);
        _.merge($$config, config[machine]);

        currentScheme = '';
        for (var i = 0; i < schemes.length; i++) {
            currentScheme += schemes[i];
            console.log('Merging config: ' + machine + '.' + currentScheme);
            _.merge($$config, config[machine + '.' + currentScheme]);
            currentScheme += '.';
        }
    }
}

console.log('Server starting up.');

// Load the shared state plugin file.
global.$$sharedState = null;
if ($$config.sharedState && fs.existsSync($$config.sharedState)) {
    var SharedState = require($$config.sharedState).SharedState;
    global.$$sharedState = new SharedState();
}

// A container for all the network transports, generally accessed via $$network.transports.
global.$$network = new Network({
    config: $$config.network
});

// The updater which downloads content referenced by an XML file or local/network file path.
global.$$contentUpdater = new ContentUpdater({
    name: 'content',
    config: $$config.contentUpdater
});

// The updater which downloads a zip file and decompresses it.
global.$$appUpdater = new AppUpdater({
    name: 'app',
    config: $$config.appUpdater
});

// The manager of the application process, controlling restarts and heartbeats.
global.$$persistence = new Persistence({
    config: $$config.persistence
});

// The logging manager.
global.$$logging = new Logging({
    config: $$config.logging
});

// The back-end for the web console.
global.$$consoleState = new ConsoleState({
    configs: configPaths
});

// Start up components which depend on other components.
$$persistence.boot();
if ($$sharedState) {
    $$sharedState.boot();
}

logger.info('Server started.');
console.log('Console is at: http://' + os.hostname() + ':' + $$network.get('socketToConsolePort'));
console.log(JSON.stringify($$config, null, 2));

var express = require('express');
var http = require('http');
var path = require('path');
var done=false;
var filename;

var app = express();
var server  = require('http').createServer(app);
var WebSocketServer = require("ws").Server;
var wss = new WebSocketServer({server: server});
var WebSocket = require('ws');
var sockets = []
console.log("websocket server created");

app.set('port', (process.env.PORT || 5000));

// Close the socket properly and remove it from the list
var forgetSocket = function(socket) {
  console.log('closing socket');
  socket.on('error', function() {
    console.log('error closing socket, terminating ...')
    socket.terminate()
  })
  socket.close()
  socket.removeAllListeners()
  sockets = _.reject(sockets, function(other) {
    return socket === other
  })
}

server.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
wss.on("connection", function(ws) {
  console.log('New connection, total : ' + sockets.length)
  ws.on('close', function() {
    forgetSocket(ws)
    console.log('WebSocketServer: Socket disconnected, left : ' + sockets.length)
  })

  ws.on('error', function() {
    console.log('WebSocketServer: error closing socket ...')
    forgetSocket(ws)
  })
    try {
        console.log('connected to touchdesigner');
      var host = 'ws://artwall.herokuapp.com';
      var wsremote = new WebSocket(host);
      //heartbeat to keep server connection alive
      var serverCheckInterval = setInterval(function timeout() {
       console.log('send server ping ' + Date.now().toString());
         if(wsremote != undefined){
            wsremote.send(Date.now().toString(), {mask: true}, function ack(error) {
              // if error is not defined, the send has been completed,
              // otherwise the error object will indicate what failed.
              if(error != undefined){
                clearInterval(serverCheckInterval);
                clearInterval(TDCheckInterval);
                 console.log('socket send heroku server cb timeout error:',error);
              forgetSocket(ws);
                  global.$$persistence.restartServer();
              }
               
            })
        }
        else {
            clearInterval(serverCheckInterval);
            clearInterval(TDCheckInterval);
            console.log('not connected to heroku web socket. restart server');
        forgetSocket(ws);
            global.$$persistence.restartServer();
        }
      }, 30000);
      //heartbeat to check if TD websocket is connected
      var TDCheckInterval = setInterval(function timeout() {
       console.log('send ping TD ' + Date.now().toString());
         if(ws != undefined){
            ws.send(Date.now().toString(), function ack(error) {
              // if error is not defined, the send has been completed,
              // otherwise the error object will indicate what failed.
              if(error != undefined){
                clearInterval(serverCheckInterval);
                clearInterval(TDCheckInterval);
              forgetSocket(ws);
                 console.log('socket send client cb timeout error:',error);
                  global.$$persistence.restartApp();
              }
               
            })
        }
        else {
            clearInterval(serverCheckInterval);
                clearInterval(TDCheckInterval);
        forgetSocket(ws);
            console.log('not connected to TD web socket. restart app');
            global.$$persistence.restartApp();
        }
      }, 60000);
      wsremote.onmessage = function (event) {
        console.log('send data to touch client '+event.data);
         ws.send(event.data, function ack(error) {
          // if error is not defined, the send has been completed,
          // otherwise the error object will indicate what failed.
          if(error != undefined){
            console.log('socket send client cb error:',error);
          forgetSocket(ws);
                global.$$persistence.restartApp();
            }
        });
      };
    }
    catch(err) {
    console.log("on connection error: " +err.message);
    }

})

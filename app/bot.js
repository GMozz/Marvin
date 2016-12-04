// app/bot.js

/*
 * External libraries
 */
var config = require('getconfig');
var TelegramBot = require('node-telegram-bot-api');
var hue = require('node-hue-api');
var MongoClient = require('mongodb').MongoClient;

/*
 * Own classes
 */
var OnBoarding = require('./onBoarding');

// Setup polling way
var bot = new TelegramBot(config.telegramBotToken, {polling: true});

var url = "mongodb://" + config.mongoDbHostName + ":" + config.mongoDbPort + "\/" + config.mongoDbDatabaseName;
var db;
// Use connect method to connect to the Server
MongoClient.connect(url, function(err, mongoDb) {
  if (err) {
    console.log("err = " + err);
  } else {
    db = mongoDb;

    //Prepare necessary collections
    db.createCollection("greetings", {capped:true, size:10000, max:1000, w:1}, function(err, collection) {
      if (err) {
        console.log("Error while creating collection greetings: " + err);
      }
    });

    /*
     * Based on the Telegram user - https://core.telegram.org/bots/api#user
     * id - Integer
     * first_name - String
     * last_name - String
     * username - String
     */
    db.createCollection("users", {capped:true, size:10000, max:1000, w:1}, function(err, collection) {
      if (err) {
        console.log("Error while creating collection users: " + err);
      }
    });
  }
});

// Matches /echo [whatever]
bot.onText(/\/echo (.+)/, function (msg, match) {
  var fromId = msg.from.id;
  isUserAuthorized(fromId, function(err, isAuthenticated) {
    if (isAuthenticated) {
      var resp = match[1];
      bot.sendMessage(fromId, resp);
    }
  });
});

// Any kind of message
// bot.on('message', function (msg) {
//   var chatId = msg.chat.id;
//   // photo can be: a file path, a stream or a Telegram file_id
//   var photo = 'res/cats.jpg';
//   bot.sendPhoto(chatId, photo, {caption: 'Lovely kittens'});
// });

bot.on('message', function(msg) {
  var fromId = msg.from.id;
  isUserAuthorized(fromId, function(err, isAuthenticated) {
    if (!isAuthenticated) {
      // bot.sendMessage(fromId, msg.from.first_name + ", communication is not permitted, proceeding is futile!");
      var json = JSON.stringify(msg, null, 2);
      console.log("Unauthorized user:\n" + JSON.stringify(msg, null, 2));
      bot.sendMessage(config.telegramUserId, msg.from.first_name + " " + msg.from.last_name + " tried to contact me with username: " + msg.from.username + "\n" +
        "message: " + json);
    }
  });
});

function hexToRgb(hex) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function(m, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

function isUserAuthorized(id, cb) {
  var users = db.collection('users');

  users.count(function(err, count) {
    if (err) {
      var errorMessage = "Error while counting authenticated users: " + err;
      console.log(errorMessage);
      cb(errorMessage, false);
    } else if (count > 0) {
      users.find({"id":id}, function(err, item) {
        if (err) {
          var errorMessage = "Error while finding authenticated users: " + err;
          console.log(errorMessage);
          cb(errorMessage, false);
        } else if (item) {
          cb(null, true);
        } else {
          cb(null, false);
        }
      });
    } else {
      //Fallback to using the user id of the config file
      if (id == config.telegramUserId) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    }
  });
}

/*
 * Hue configuration
 */
function getHueApi() {
  var HueApi = hue.HueApi;
  return new HueApi(config.hueHostName, config.hueToken);
}

function getCallbackToSendJson(fromId) {
  return function(err, result) {
    if (err) {
      bot.sendMessage(fromId, err.toString());
      return;
    }
    var jsonString = JSON.stringify(result, null, 2);
    console.log(jsonString);
    if (jsonString.length > 4096) {
      jsonString = jsonString.slice(0, 4095);
    }

    bot.sendMessage(fromId, jsonString);
  };
}

bot.onText(/\/start/, function(msg, match) {
  var fromId = msg.from.id;
  isUserAuthorized(fromId, function(err, isAuthenticated) {
    if (isAuthenticated) {
      bot.sendMessage(fromId, "authorized");
    } else {
    bot.sendMessage(fromId, "not authorized");
    }
  });
});

bot.onText(/\/foo/, function (msg, match) {
  var fromId = msg.from.id;

  isUserAuthorized(fromId, function(err, isAuthenticated) {
    if (isAuthenticated) {
      // var jsonMsg = JSON.stringify(msg, null, 2);
      // bot.sendMessage(fromId, "msg: " + jsonMsg);
      // var jsonMatch = JSON.stringify(match, null, 2);
      // bot.sendMessage(fromId, "match: " + jsonMatch);

      var collection = db.collection('greetings');
      // Find some documents
      collection.find({}).toArray(function(err, docs) {
        var json = JSON.stringify(docs, null, 2);
        console.log(docs);
        bot.sendMessage(fromId, "docs: " + json);
      });
    }
  });

});

bot.onText(/\/addGreeting (.+)/, function (msg, match) {
  var fromId = msg.from.id;

  isUserAuthorized(fromId, function(err, isAuthenticated) {
    if (isAuthenticated) {
      if (match.length <= 1) {
        //No message given
        return;
      }

      var greeting = match[1];
      var greetings = db.collection('greetings');
      greetings.insertOne({message:greeting}, function(err, r) {
        if (err) {
          bot.sendMessage(fromId, err);
        } else if (r.insertedCount === 1) {
          bot.sendMessage(fromId, "Added greeting: " + greeting);
        }
      });
    }
  });
});

bot.onText(/\/hi/, function(msg, match) {
  var fromId = msg.from.id;

  isUserAuthorized(fromId, function(err, isAuthenticated) {
    if (isAuthenticated) {
      var onBoarding = new OnBoarding(db, bot, fromId);
      onBoarding.sendGreeting();
    }
  });
});

bot.onText(/\/hue (.+)/, function (msg, match) {
  var fromId = msg.from.id;

  isUserAuthorized(fromId, function(err, isAuthenticated) {
    if (isAuthenticated) {
      var respArray = match[1].split(" ");
      var resp = respArray[0];
      // console.log("msg = " + JSON.stringify(msg, null, 2));
      console.log("match = " + match);
      console.log("resp = " + resp);

      switch(resp) {
        case "search":
          hue.nupnpSearch(function(err, result) {
              if (err) throw err;
              var bridges = JSON.stringify(result);
              bot.sendMessage(fromId, bridges);
          });
          break;

        case "register":
          var HueApi = hue.HueApi;
          var api = new HueApi();

          api.registerUser(config.hueHostName, config.botName,
            getCallbackToSendJson(fromId));
          break;

        case "version":
          var api = getHueApi();
          api.getVersion(getCallbackToSendJson(fromId));
          break;

        case "config":
          var api = getHueApi();
          api.getConfig(getCallbackToSendJson(fromId));
          break;

        case "lights":
          var api = getHueApi();
          api.getLights(getCallbackToSendJson(fromId));
          break;

        case "lightStatus":
          var api = getHueApi();

          var lightId = respArray[1];
          console.log("lightId = " + lightId);
          api.getLightStatusWithRGB(lightId, getCallbackToSendJson(fromId));
          break;

        case "light":
          var api = getHueApi();
          var lightState = hue.lightState.create();

          var lightId = respArray[1];
          var newState = respArray[2];
          console.log("lightId = " + lightId + ", newState = " + newState);
          switch(newState) {
            case "on":
              newState = lightState.on();
              break;

            case "reset":
            case "normal":
              newState = lightState.on().xy(0.5015, 0.4153).bri(144).hue(13548).sat(200).ct(443);
              break;

            case "color":
              var newColor = respArray[3];
              if (!newColor.startsWith('#')) {
                var toHex = require('colornames');
                newColor = toHex(newColor);
              }
              var hexToHsl = require('hex-to-hsl');
              var hslColor = hexToHsl(newColor);
              newState = lightState.on().hsl(hslColor[0], hslColor[1], hslColor[2]);
              break;

            default:
              newState = lightState.off();
          }

          api.setLightState(lightId, newState, function(err, result) {
            console.log("err = " + err + ", result = " + result);
            if (err) {
              bot.sendMessage(fromId, err.toString());
              return;
            }

            var response;
            if (result) {
              response = "Light adjusted to your preferences";
            } else {
              response = "Sorry, could not comply";
            }
            bot.sendMessage(fromId, response);
          });
          break;

        case "groups":
          var api = getHueApi();
          api.getGroups(getCallbackToSendJson(fromId));
          break;

        case "group":
          var api = getHueApi();
          var lightState = hue.lightState.create();

          var groupId = respArray[1];
          var newState = respArray[2];
          console.log("groupId = " + groupId + ", newState = " + newState);
          switch(newState) {
            case "on":
              newState = lightState.on();
              break;

            case "reset":
            case "normal":
              newState = lightState.on().xy(0.5015, 0.4153).bri(144).hue(13548).sat(200).ct(443);
              break;

            case "color":
              var newColor = respArray[3];
              if (!newColor.startsWith('#')) {
                var toHex = require('colornames');
                newColor = toHex(newColor);
              }
              var hexToHsl = require('hex-to-hsl');
              var hslColor = hexToHsl(newColor);
              newState = lightState.on().hsl(hslColor[0], hslColor[1], hslColor[2]);
              break;

            default:
              newState = lightState.off();
          }

          api.setGroupLightState(groupId, newState, function(err, result) {
            console.log("err = " + err + ", result = " + result);
            if (err) {
              bot.sendMessage(fromId, err.toString());
              return;
            }

            var response;
            if (result) {
              response = "Group adjusted to your preferences";
            } else {
              response = "Sorry, could not comply";
            }
            bot.sendMessage(fromId, response);
          });
          break;

        case "foo":
          bot.sendMessage(fromId, "bar");
          break;
        default:
          bot.sendMessage(fromId, "Sorry, command nog recognized");
          break;
      }
    }
  });
});

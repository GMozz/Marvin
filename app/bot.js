//app/bot.js

/*
 * External libraries
 */
var TelegramBot = require('node-telegram-bot-api');
var hue = require('node-hue-api');

/*
 * Own classes
 */
var OnBoarding = require('./onBoarding');

var db;
var config;
var bot;

/**
 * Expose Bot
 */
module.exports = Bot;

/**
 * @param {Db} db
 * @constructor
 */
function Bot(mongoDb, getConfig) {
  db = mongoDb;
  config = getConfig;
  // Setup polling way
  bot = new TelegramBot(config.telegramBotToken, {polling: true});
  initBotListeners();
}

/**
 * Convenience method to easily convert hex String to RGB String
 */
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

/**
 * Check authorization of the user
 */
function isUserAuthorized(id, cb) {
  var users = db.collection('users');

  users.count(function(err, count) {
    if (err) {
      var errorMessage = "Error while counting authenticated users: " + err;
      console.log(errorMessage);
      cb(errorMessage, false);
    } else if (count > 0) {
      users.findOne({"id":id}, function(err, item) {
        if (err) {
          var errorMessage = "Error while finding authenticated users: " + err;
          console.log(errorMessage);
          cb(errorMessage, false);
        } else if (item && (item.authLevel === 1 || item.authLevel === 2)) {
          //0 = not yet processed, 1 = owner, 2 = allowed user, 3 = blocked user
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

/**
 * Get callback for the telegram bot which automatically
 * formats the result in a human readable JSON String.
 */
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

function initBotListeners() {

  /**
   * Will listen to all messages and log any unauthorized users
   */
  bot.on('message', function(msg) {
    var fromId = msg.from.id;
    isUserAuthorized(fromId, function(err, isAuthenticated) {
      if (!isAuthenticated) {
        // bot.sendMessage(fromId, msg.from.first_name + ", communication is not permitted, proceeding is futile!");
        var json = JSON.stringify(msg, null, 2);
        console.log("Unauthorized user:\n" + JSON.stringify(msg, null, 2));
        // bot.sendMessage(config.telegramUserId, msg.from.first_name + " " + msg.from.last_name + " tried to contact me with username: " + msg.from.username + "\n" +
        //   "message: " + json);

        var onBoarding = new OnBoarding(db, bot, msg.from);
        onBoarding.processUnauthorizedMessage(msg);
      }
    });
  });

  /**
   * Listening for callback queries that can be sent in the OnBoarding class
   */
  bot.on('callback_query', function(msg) {
    var fromId = msg.from.id;
    isUserAuthorized(fromId, function(err, isAuthenticated) {
      if (isAuthenticated) {
        var json = JSON.stringify(msg, null, 2);
        console.log("callback_query:\n" + JSON.stringify(msg, null, 2));
        /*
         * Expecting data in the format '123456 2' or '123456 3'
         * where the first int is de telegram user id and
         * the second int means 2 = allowed user, 3 = blocked user
         */
        var dataArray = msg.data.split(' ');
        if (dataArray.length !== 2) {
          //Weird... it should be 2, let's bail out...
          return;
        }

        var users = db.collection('users');
        var userId = parseInt(dataArray[0]);
        var authLevel = parseInt(dataArray[1]);

        users.findOne({'id':userId}, function(err, user) {
          if (err) {
            bot.answerCallbackQuery(msg.id, 'An error occured while trying to find user with id: ' + userId);
            return;
          }

          if (!user) {
            bot.answerCallbackQuery(msg.id, 'Couldn\'t find user with id: ' + userId);
            return;
          }

          //This shouldn't be possible, but just to be sure that the owner can not lose it's privileges
          if (user.authLevel === 1) {
            bot.answerCallbackQuery(msg.id, 'Making changes to the owner isn\'t allowed!');
            return;
          }

          //Only update the 'authLevel'
          users.updateOne({'id':userId}, {$set:{'authLevel':authLevel}}, function(err, result) {

              var json = JSON.stringify(result, null, 2);
              console.log('updateOne: ' + json)
              console.log('result = ' + result);
              console.log('result.ok = ' + result.result.ok);
            var callbackText;
            if (err) {
              callbackText = 'Error while updating user with id ' + user.first_name;
            } else if (result && result.result && result.result.ok === 1) {
              if (result.result.nModified === 0) {
                callbackText = 'No changes occured to ' + user.first_name;
              } else if (result.result.nModified === 1) {
                callbackText = 'Changed authentication level of ' + user.first_name + ' to ';
                if (authLevel === 2) {
                  callbackText += 'allowed';
                } else if (authLevel === 3) {
                  callbackText += 'blocked';
                } else {
                  callbackText += 'level ' + authLevel;
                }
              } else {
                callbackText = 'It shouldn\'t be possible but multiple users were updated, including ' + user.first_name;
              }
            } else {
              callbackText = 'No error while updating ' + user.first_name +
                ', but not ok either, weird...';
            }

            bot.answerCallbackQuery(msg.id, callbackText);
          });
        });
      } else {
        bot.answerCallbackQuery(msg.id, 'You\'re not authorized to perform this action');
      }
    });

  });

  bot.onText(/\/start/, function(msg, match) {
    var fromId = msg.from.id;
    isUserAuthorized(fromId, function(err, isAuthenticated) {
      if (isAuthenticated) {
        var onBoarding = new OnBoarding(db, bot, msg.from);
        onBoarding.start();
      }
    });
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
        var onBoarding = new OnBoarding(db, bot, msg.from);
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
}

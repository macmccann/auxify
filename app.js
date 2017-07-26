var express = require('express'); // Express web server framework
var request = require('request'); // "Request" library
var dotenv = require('dotenv');
dotenv.load();
var querystring = require('querystring');
var cookieParser = require('cookie-parser');

var client_id = process.env.CLIENT_ID;
var client_secret = process.env.CLIENT_SECRET;
var redirect_uri = 'http://localhost:8888/callback'; // Your redirect uri
var display_name = null;
var access_token = null;
var refresh_token = null;
var userID = null;
var sessionIDs = [];
var sessions = {};
var ip_to_last_queued_timestamp = {};

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
var generateRandomString = function(length) {
  var text = '';
  var possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (var i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

var randomSessionID = function() {
    var text = '';
    var possible = '0123456789';

    for (var i = 0; i < 6; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }

    return text;
}

var stateKey = 'spotify_auth_state';

var app = express();

app.use(express.static(__dirname + '/public'))
   .use(cookieParser());

app.get('/login', function(req, res) {

  var state = generateRandomString(16);
  res.cookie(stateKey, state);

  // authorization
  var scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private streaming user-read-playback-state';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/join', function(req, res) {
    res.redirect('/join.html');
});

app.get('/callback', function(req, res) {

  // your application requests refresh and access tokens
  // after checking the state parameter

  var code = req.query.code || null;
  var state = req.query.state || null;
  var storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {



    res.clearCookie(stateKey);



    var authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (new Buffer(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };




    request.post(authOptions, function(error, response, body) {
      if (!error && response.statusCode === 200) {

        access_token = body.access_token,
        refresh_token = body.refresh_token;

        var options = {
          url: 'https://api.spotify.com/v1/me',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        // use the access token to access the Spotify Web API
        request.get(options, function(error, response, body) {
          display_name = body.display_name;
          userID = body.id;
          var sessionID = randomSessionID();
          while(sessionIDs.indexOf(sessionID) !== -1){
              sessionID = randomSessionID();
          }
          console.log('sessionID: ' + sessionID);

          // call to make the new auxify playlist

          var playlistPost = {
              url: 'https://api.spotify.com/v1/users/' + userID + '/playlists',
              headers: {
                  'Authorization': 'Bearer ' + access_token,
                  'Content-Type': "application/json"
              },
              body: JSON.stringify({
                  "name" : "auxify-" + sessionID,
                  "public" : false
              })
          };

          request.post(playlistPost, function(error, response, body) {

              playlistID = JSON.parse(body).id;
              playlistURI = JSON.parse(body).uri;


              var addSongPost = {
                  url: 'https://api.spotify.com/v1/users/' + userID + '/playlists/' + playlistID + '/tracks',
                  headers: {
                      'Authorization': 'Bearer ' + access_token,
                      'Content-Type': "application/json"
                  },
                  body: JSON.stringify({
                      "uris": ["spotify:track:26IHSipiiSMN7zmwY9CJZS", "spotify:track:0lWMRefeETEn4G2zt6E5VM", "spotify:track:3mNOyp1fn4crPoUBxv2bHr"]
                  })
              };
              request.post(addSongPost, function(error, response, body) {
                  if(error){
                      console.log(error);
                  }


                  // now, we need to wait for the user to start playing the playlist
                  function waitFunc() {
                      var contextGet = {
                          url: 'https://api.spotify.com/v1/me/player',
                          headers: {
                              'Authorization': 'Bearer ' + access_token,
                              'Content-Type': "application/json"
                          },
                          body: JSON.stringify({})
                      }

                      request.get(contextGet, function(error, response, body) {
                          if(JSON.parse(body).context && JSON.parse(body).context.uri === playlistURI){
                              console.log('success!');
                              var session = {
                                  access_token,
                                  refresh_token,
                                  display_name,
                                  userID,
                                  sessionID,
                                  playlistID,
                                  playlistURI,
                                  lastQueuedPosition: -1,
                                  queuedTracks: [],
                                  guests: [],
                                  playlistTrackURIs: ["spotify:track:26IHSipiiSMN7zmwY9CJZS",
                                  "spotify:track:0lWMRefeETEn4G2zt6E5VM",
                                  "spotify:track:3mNOyp1fn4crPoUBxv2bHr"]
                              }
                              sessions[sessionID] = session;
                              sessionIDs.push(sessionID);
                              res.redirect('/#' +
                                querystring.stringify({
                                  displayname: display_name,
                                  userid: userID,
                                  sessionid: sessionID,
                                }));
                          } else {
                              setTimeout(waitFunc, 1000);
                          }
                      })
                  }

                  waitFunc();
              });
          });
        });


      } else {
        res.redirect('/#' +
          querystring.stringify({
            error: 'invalid_token'
          }));
      }
    });


  }
});

//queues songs into the playlist
// app.post('/queue/sessionID/:sID/songURI/:URI', function (req, res) {
//     var requestIP = req.ip;
//     var lrTime = ip_to_last_queued_timestamp[requestIP];
//     var canQueue = false;
//     if(!lrTime){
//         canQueue = true;
//     } else if((Date.now() - lrTime) > (1 * 2 * 1000)) { // greater than two seconds
//         canQueue = true;
//     }
//
//
//     if(canQueue){
//         var songURI = req.params.URI;
//         var songQueuePost = {
//             url: 'https://api.spotify.com/v1/users/' + userID +
//                 '/playlists/' + playlistID + '/tracks',
//             headers: { 'Authorization': 'Bearer ' + access_token },
//             body: JSON.stringify({
//                 "uris": [songURI]
//             }),
//             json: true
//         }
//
//         request.post(songQueuePost, function(error, response, body){
//         });
//         ip_to_last_queued_timestamp[requestIP] = Date.now();
//     } else {
//         console.log('wait');
//     }
// });

app.get('/join/sessionID/:sID', function(req, res){
    if(sessionIDs.indexOf(req.params.sID) !== -1){

        res.send({redirect: 'guest.html#' +
          querystring.stringify({
            sessionid: req.params.sID,
        })});
    } else {
        res.send({redirect: '/joinerror'});
    }
});

app.get('/joinerror', function(req, res) {
    res.redirect('/joinerror.html');
});

// app.get('/gettracknumbertest/sessionID/:sID', function(req, res){
//     if(sessions[req.params.sID]){
//         var trackNum = getTrackNumber(req.params.sID);
//         console.log('TRACKNUM: ' + trackNum);
//         res.redirect('/joinerror.html#' + trackNum);
//     } else {
//         console.log("ERROR: That session ID does not exist!");
//         res.redirect('/joinerror.html');
//     }
// });

    // Queues a song in the session of sID
    // invariant: there are no repeats in the playlist of the session
app.post('/queue/sessionid/:sID/songuri/:suri', function (req, res) {
    //console.log('THIS0');
    var sessionID = req.params.sID;
    var songURI = req.params.suri;
    var requestIP = req.ip;


    //start get track number
    var session = sessions[sessionID];
    var access_token = session.access_token;
    var user_id = session.userID;
    var playlist_id = session.playlistID;
    var playlist_track_uris = session.playlistTrackURIs;
    var returnPlayURI = null;
    var returnNum = -1;

    var currentPlayGet = {
        url: 'https://api.spotify.com/v1/me/player/currently-playing',
        headers: {
            'Authorization': 'Bearer ' + access_token,
            'Content-Type': "application/json"
        },
        body: JSON.stringify({})
    }

    var playlistTrackGet = {
        url: 'https://api.spotify.com/v1/users/' + user_id + '/playlists/' + playlist_id + '/tracks',
        headers: {
            'Authorization': 'Bearer ' + access_token,
            'Content-Type': "application/json"
        },
        body: JSON.stringify({})
    }

    request.get(currentPlayGet, function(error, response, body) {
        if(error){
            console.log("ERROR: " + error);
        } else {
            if(JSON.parse(body).item.uri){
                var currentPlayURI = JSON.parse(body).item.uri;
                //console.log("CURRENTPLAYURI: " + currentPlayURI);
                for(var i = 0; i < playlist_track_uris.length; i++){
                    //console.log("I: " + i);
                    if(playlist_track_uris[i] === currentPlayURI){
                        //console.log("SUCCESS");
                        //console.log("I: " + i);
                        returnPlayURI = currentPlayURI;
                        returnNum = i;
                    }
                }

                var playNum = returnNum;
                var playURI = returnPlayURI;
                var thisSess = sessions[sessionID];
                var lastQueuedNum = thisSess.lastQueuedPosition;
                var repeatQueuedFlag = false;
                var repeatPlaylistFlag = false;
                var IPCanQueue = true;
                var tempSwap = -1;

                // We need to check if the song being queued is the same as the current
                // song being played
                if (playURI === songURI) {
                    //console.log('THIS1');
                    res.send({error: 'You can\'t queue the currently playing song!'});
                } else {
                    //console.log('THIS2');
                    // We need to check if this song URI has been queued before
                    for (var i = 0; i < thisSess.queuedTracks.length; i += 1) {
                        if (thisSess.queuedTracks[i].uri === songURI) {
                            console.log('queuedTracks uri: ' + thisSess.queuedTracks[i].uri);
                            console.log('songURI: ' + songURI);
                            repeatQueuedFlag = true;
                        }

                        if (thisSess.queuedTracks[i].ip === requestIP && thisSess.queuedTracks[i].playlistPosition >= playNum) {
                            console.log('thisSess.queuedTracks[i].playlistPosition: ' + thisSess.queuedTracks[i].playlistPosition);
                            console.log('playNum: ' + playNum);
                            IPCanQueue = false;
                        }
                    }
                    //console.log('repeatQueuedFlag: ' + repeatQueuedFlag);
                    if (repeatQueuedFlag) {
                        console.log('error: You can\'t queue a song that has already been queued!');
                        res.send({error: 'You can\'t queue a song that has already been queued!'});
                    } else if (!IPCanQueue) {
                        console.log('error: User must wait');
                        res.send({error: 'You can\'t queue a song until your last queued song has already played!'});
                    } else {
                        //console.log('THIS4');
                        for (var i = 0; i < thisSess.playlistTrackURIs.length; i += 1) {
                            if (thisSess.playlistTrackURIs[i] === songURI) {
                                repeatPlaylistFlag = true;
                                tempSwap = i;
                            }
                        }

                        if (repeatPlaylistFlag) {
                            //console.log('THIS5');
                            if (playNum > lastQueuedNum) {
                                //console.log('THIS6');
                                var playlistTrackSwap = {
                                    url: 'https://api.spotify.com/v1/users/' + thisSess.userID + '/playlists/' + playlistID + '/tracks',
                                    headers: {
                                        'Authorization': 'Bearer ' + access_token,
                                        'Content-Type': "application/json"
                                    },
                                    body: JSON.stringify({
                                        range_start: tempSwap,
                                        range_length: 1,
                                        insert_before: playNum + 1
                                    })
                                }

                                request.put(playlistTrackSwap, function(error, response, body){
                                    if (error) {
                                        console.log('ERROR: ' + error);
                                    } else {
                                        //console.log('THIS6');
                                        thisSess.playlistTrackURIs.splice(tempSwap, 1);
                                        thisSess.playlistTrackURIs.splice(playNum + 1, 0, songURI);
                                        thisSess.queuedTracks.push({
                                            uri : songURI,
                                            playlistPosition : playNum + 1,
                                            ip : requestIP
                                        });
                                        thisSess.lastQueuedPosition = playNum + 1;
                                    }
                                });


                            } else {
                                //console.log('THIS7');
                                var playlistTrackSwap = {
                                    url: 'https://api.spotify.com/v1/users/' + thisSess.userID + '/playlists/' + playlistID + '/tracks',
                                    headers: {
                                        'Authorization': 'Bearer ' + access_token,
                                        'Content-Type': "application/json"
                                    },
                                    body: JSON.stringify({
                                        range_start: tempSwap,
                                        range_length: 1,
                                        insert_before: lastQueuedNum + 1
                                    })
                                }

                                request.put(playlistTrackSwap, function(error, response, body){
                                    if (error) {
                                        console.log('ERROR: ' + error);
                                    } else {
                                        //console.log('THIS8');
                                        thisSess.playlistTracks.splice(tempSwap, 1);
                                        thisSess.playlistTrackURIs.splice(lastQueuedNum + 1, 0, songURI);
                                        thisSess.queuedTracks.push({
                                            uri : songURI,
                                            playlistPosition : lastQueuedNum + 1,
                                            ip : requestIP
                                        });
                                        thisSess.lastQueuedPosition = lastQueuedNum + 1;
                                    }
                                });
                            }
                        } else {
                            //console.log('THIS9');
                            if (playNum > lastQueuedNum) {
                                //console.log('THIS10');
                                var playlistTrackAdd = {
                                    url: 'https://api.spotify.com/v1/users/' + thisSess.userID + '/playlists/' + playlistID + '/tracks',
                                    headers: {
                                        'Authorization': 'Bearer ' + access_token,
                                        'Content-Type': "application/json"
                                    },
                                    body: JSON.stringify({
                                        uris: [songURI],
                                        position: playNum + 1
                                    })
                                }

                                request.post(playlistTrackAdd, function(error, response, body) {
                                    if (error) {
                                        console.log('ERROR: ' + error);
                                    } else {
                                        //console.log('THIS11');
                                        thisSess.playlistTrackURIs.splice(playNum + 1, 0, songURI);
                                        thisSess.queuedTracks.push({
                                            uri : songURI,
                                            playlistPosition : playNum + 1,
                                            ip : requestIP
                                        });
                                        thisSess.lastQueuedPosition = playNum + 1;
                                    }
                                });

                            } else {
                                //console.log('THIS12');
                                var playlistTrackAdd = {
                                    url: 'https://api.spotify.com/v1/users/' + thisSess.userID + '/playlists/' + playlistID + '/tracks',
                                    headers: {
                                        'Authorization': 'Bearer ' + access_token,
                                        'Content-Type': "application/json"
                                    },
                                    body: JSON.stringify({
                                        uris: [songURI],
                                        position: lastQueuedNum + 1
                                    })
                                }

                                request.post(playlistTrackAdd, function(error, response, body) {
                                    if (error) {
                                        console.log('ERROR: ' + error);
                                    } else {
                                        //console.log('THIS13');
                                        thisSess.playlistTrackURIs.splice(lastQueuedNum + 1, 0, songURI);
                                        thisSess.queuedTracks.push({
                                            uri : songURI,
                                            playlistPosition : lastQueuedNum + 1,
                                            ip : requestIP
                                        });
                                        thisSess.lastQueuedPosition = lastQueuedNum + 1;
                                    }
                                });
                            }
                        }
                    }
                }
                //console.log("ERROR: Playlist track URIs did not match up with current playing URI!");
            } else {
                console.log("ERROR: No item URI!");
            }
        }
    });
    // end get track num



});

console.log('Listening on 8888');
app.listen(8888);

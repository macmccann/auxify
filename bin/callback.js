'use strict';

const request = require('request'); // "Request" library
const querystring = require('querystring');
const Promise = require('bluebird');

const randomSessionID = function randomSessionID() {
  let text = '';
  const possible = '0123456789';

  for (let i = 0; i < 6; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
};

function authInit(body, code, req, res, stateKey, spotifyApi, sessions) {
  spotifyApi.setAccessToken(body.access_token);

  let persistentSessionID = '';

  // get the user's data
  const sessionPromise = spotifyApi.getMe()
    .then((data) => {
      // create a session ID for the session
      let sessionID = randomSessionID();
      while (Object.keys(sessions).indexOf(sessionID) !== -1) {
        sessionID = randomSessionID();
      }

      // find the display name and user ID of the session
      const displayName = data.body.display_name;
      const userID = data.body.id;

      // create the session in sessions and attach a reference to it
      sessions[sessionID] = {
        sessionID,
        displayName,
        userID,
        playlistTracks: [],
        queuedTracks: [],
        guests: {},
        hostIP: req.ip,
        lastQueuedPosition: -1,
        accessToken: body.access_token,
        refresh_token: body.refresh_token,
      };
      const thisSession = sessions[sessionID];
      persistentSessionID = sessionID;

      // return the current session so that future promises can use it
      return thisSession;
    })
    .catch((err) => {
      console.error(err);
    });

  const getAllPlaylistsPromise = sessionPromise
    .then((session) => {
      return spotifyApi.getUserPlaylists(session.userID);
    })
    .catch(err => console.log('error: ' + err));

  getAllPlaylistsPromise
    .then((playlists) => {
      const sanitizedPlaylists = playlists.body.items.map(
        playlist => ({ name: playlist.name, uri: playlist.uri }));
      const queryPlaylists = {};
      for (let i = 0; i < 10; i += 1) {
        queryPlaylists['playlist_' + i + '_name'] = sanitizedPlaylists[i].name;
        queryPlaylists['playlist_' + i + '_uri'] = sanitizedPlaylists[i].uri;
      }
      queryPlaylists.session_id = persistentSessionID;
      res.redirect(
        '/playlist.html#' + querystring.stringify(queryPlaylists));
    })
    .catch(err => console.log(err));


}

function initializeAuxify(code, req, res, stateKey, spotifyApi, sessions, connectionConfig) {
  const clientId = connectionConfig.clientId;
  const clientSecret = connectionConfig.clientSecret;
  const redirectUri = connectionConfig.redirectUri;
  // here we go
  res.clearCookie(stateKey);

  const authOptions = {
    url: 'https://accounts.spotify.com/api/token',
    form: {
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    },
    headers: {
      Authorization: 'Basic ' + (new Buffer(clientId + ':' + clientSecret).toString('base64')),
    },
    json: true,
  };

  request.post(authOptions, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      authInit(body, code, req, res, stateKey, spotifyApi, sessions);
    } else {
      res.redirect(`/#${
        querystring.stringify({
          error,
        })}`);
    }
  });
}

module.exports = function callback(req, res, stateKey, spotifyApi, sessions, connectionConfig) {
  // the application requests refresh and access tokens
  // after checking the state parameter

  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect(`/#${
      querystring.stringify({
        error: 'state_mismatch',
      })}`);
  } else {
    initializeAuxify(code, req, res, stateKey, spotifyApi, sessions, connectionConfig);
  }
};

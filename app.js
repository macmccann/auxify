'use strict';

const express = require('express'); // Express web server framework
const dotenv = require('dotenv');

dotenv.load();
const querystring = require('querystring');
const cookieParser = require('cookie-parser');
const queue = require('./bin/queue.js');
const callback = require('./bin/callback.js');
const endSession = require('./bin/endSession.js');
const choosePlaylist = require('./bin/choosePlaylist.js');
const wait = require('./bin/wait.js');
const SpotifyWebApi = require('spotify-web-api-node');

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const redirectUri = 'http://localhost:8888/callback'; // The redirect URI
const spotifyApi = new SpotifyWebApi({
  clientId,
  clientSecret,
  redirectUri,
});
const stateKey = 'spotify_auth_state';

/**
@typedef {object} queuedTrack
  @property {string} uri - the Spotify URI of the track
  @property {int} playlistPosition - the position of the track in its session
  @property {string} queuerIP - the IP address of the person who queued the song
 */

/**
 * @typedef {object} playlistTrack
 * @property {string} name - the name of the track
 * @property {string} artist - the name of the first artist listed on the track
 * @property {string} uri - the Spotify URI of the track
 * @property {boolean} isQueued - a boolean representing whether the track is a queued track
 *  or not
 */

/**
@typedef {object} Guest
  @property {string} ip - the IP address of the guest
  @property {string} lastQueuedPosition - the playlist position of the last track that the
    guest queued
 */

/**
@typedef {object} Session
  @property {string} sessionID - the ID associated with the session
  @property {string} displayName - the display name of the session host
  @property {string} userID - the user ID of the session host
  @property {string} playlistID - the playlist ID of the session
  @property {string} playlistURI - the playlist URI of the session
  @property {string} hostIP - the IP address of the host of the session
  @property {string} accessToken - the access token of the host's Spotify account
  @property {int} lastQueuedPosition - the position that the last track was queued from
  @property {Array.<queuedTrack>} queuedTracks - an array of Track objects representing
    the queued tracks in the session
  @property {Array.<playlistTrack>} playlistTracks - an array of playlistTrack objects
    representing all of the tracks in the session
  @property {object} guests - a dictionary from ips to Guest objects
  representing the guests of the session
 */

/**
@type {object} - a dictionary from session IDs to Sessions
 */
const sessions = {}; // sessions are identified by the session ID of the session.

/**
 * Generates a random string containing numbers and letters
 * @param  {number} length The length of the string
 * @return {string} The generated string
 */
const generateRandomString = function generateRandomString(length) {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
};

function login(req, res) {
  const state = generateRandomString(16);
  res.cookie(stateKey, state);

  // authorization
  const scope = 'user-read-private user-read-email playlist-modify-public playlist-modify-private streaming user-read-playback-state';
  res.redirect(`https://accounts.spotify.com/authorize?${
    querystring.stringify({
      response_type: 'code',
      client_id: clientId,
      client_secret: clientSecret,
      scope,
      redirect_uri: redirectUri,
      state,
    })}`);
}

function join(req, res) {
  if (Object.keys(sessions).indexOf(req.params.sID) !== -1) {
    res.send({ redirect: 'guest.html#' +
      querystring.stringify({
        sessionid: req.params.sID,
      }) });
  } else {
    res.send({ redirect: '/joinerror.html' });
  }
}

function getQuery(req, res) {
  if (Object.keys(sessions).indexOf(req.params.sid) !== -1) {
    spotifyApi.setAccessToken(sessions[req.params.sid].accessToken);
    spotifyApi.searchTracks(req.params.query)
      .then((data) => {
        res.send(data);
      }, (err) => {
        res.send({ error: err });
      });
  } else {
    res.send({ error: 'Session did not exist.' });
  }
}

const app = express();

app.use(express.static(`${__dirname}/public`))
  .use(cookieParser());

app.get('/login', (req, res) => {
  login(req, res);
});

app.get('/join', (req, res) => {
  res.redirect('/join.html');
});

app.get('/join/sessionID/:sID', (req, res) => {
  join(req, res);
});

app.get('/wait/sessionid/:sid', (req, res) => {
  wait(req, res, sessions, spotifyApi);
});

app.get('/callback', (req, res) => {
  callback(req, res, stateKey, spotifyApi, sessions,
    { clientId, clientSecret, redirectUri });
});

app.post('/chooseplaylist/sessionid/:sid/playlisturi/:puri', (req, res) => {
  choosePlaylist(req, res, sessions, spotifyApi);
});

app.post('/queue/sessionid/:sID/songuri/:suri', (req, res) => {
  queue(req, res, sessions, spotifyApi);
});

app.post('/endsession/sessionid/:sID', (req, res) => {
  endSession(req, res, sessions, spotifyApi);
});

app.get('/playlist/sessionid/:sID', (req, res) => {
  const sessionID = req.params.sID;
  if (sessions[sessionID]) {
    res.send({ playlistTracks: sessions[sessionID].playlistTracks });
  } else {
    res.status(500).send({ error: 'session does not exist' });
  }
});

app.get('/search/sessionid/:sid/q/:query', (req, res) => {
  getQuery(req, res);
});

console.log('Listening on 8888');
app.listen(8888);

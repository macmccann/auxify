'use strict';

const querystring = require('querystring');
const Promise = require('bluebird');

function playlistURIToID(uri) {
  return uri.substring(35, uri.length);
}

function trackPromiseFunction(session, playlistData, paramPlaylistData, spotifyApi) {
  // get the playlist data from the promise
  session.playlistID = playlistData.body.id;
  session.playlistURI = playlistData.body.uri;

  paramPlaylistData.body.items.forEach((item) => {
    const playlistTrack = {
      name: item.track.name,
      artist: item.track.artists[0].name,
      uri: item.track.uri,
      isQueued: false,
    };
    session.playlistTracks.push(playlistTrack);
  });

  // add tracks from playlistData to the playlist
  return spotifyApi.addTracksToPlaylist(session.userID, session.playlistID,
    paramPlaylistData.body.items.map(item => item.track.uri));


}

module.exports = function choosePlaylist(req, res, sessions, spotifyApi) {
  const sessionID = req.params.sid;
  const paramPlaylistURI = req.params.puri;
  const session = sessions[sessionID];
  spotifyApi.setAccessToken(session.accessToken);

  // create a new Spotify playlist with the tracks from paramPlaylistURI

  const playlistPromise =
    // return the data of a created playlist with the name 'auxify-<sessionID>'
    spotifyApi.createPlaylist(session.userID, `auxify-${session.sessionID}`, { public: false });

  const paramPlaylistTracksPromise =
    spotifyApi.getPlaylistTracks(session.userID, playlistURIToID(paramPlaylistURI));

  const trackPromise = Promise.all([playlistPromise, paramPlaylistTracksPromise]).spread(
    (playlistData, paramPlaylistData) => {
      trackPromiseFunction(session, playlistData, paramPlaylistData, spotifyApi);
    });

  trackPromise
    .then(() => {
      res.send({ redirect: 'wait.html#' +
        querystring.stringify({
          session_id: sessionID,
        }) });
    });

};

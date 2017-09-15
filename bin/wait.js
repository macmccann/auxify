'use strict';

const querystring = require('querystring');

// wait for the user to start playing the playlist,
// and if they are playing the playlist, send a response
// to the client. Otherwise, recur with a delay.
function waitFunc(req, res, session, spotifyApi) {
  // get the current playback state
  spotifyApi.getMyCurrentPlaybackState()
    .then((data) => {
      // compare the playback uri to the playlist URI
      if (data.body.context.uri === session.playlistURI) {
        // we made it
        // redirect the response with params in the URL
        res.send({ redirect: '/host.html#' + querystring.stringify({
          displayname: session.displayName,
          userid: session.userID,
          sessionid: session.sessionID,
        }) });
      } else {
        // wait for 1 second before calling waitFunc again
        setTimeout(() => {
          waitFunc(req, res, session, spotifyApi);
        }, 1000);
      }
    });
}

module.exports = function wait(req, res, sessions, spotifyApi) {
  const sessionID = req.params.sid;
  const thisSess = sessions[sessionID];
  const accessToken = thisSess.accessToken;
  spotifyApi.setAccessToken(accessToken);
  waitFunc(req, res, thisSess, spotifyApi);
};

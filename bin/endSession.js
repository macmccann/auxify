'use strict';

const rp = require('request-promise');

module.exports = function endSession(req, res, sessions, spotifyApi) {
  const sessionID = req.params.sID;
  const session = sessions[sessionID];
  if (session.hostIP === req.ip) {
    spotifyApi.setAccessToken(session.accessToken);
    const options = {
      method: 'PUT',
      uri: 'https://api.spotify.com/v1/me/player/pause',
      headers: {
        Authorization: 'Bearer ' + session.accessToken,
      },
    };
    rp(options)
      .then(() => {
        spotifyApi.unfollowPlaylist(session.userID, session.playlistID)
      })
      .then(() => {
        sessions[sessionID] = undefined;
        res.send({ success: true });
      })
      .catch((err) => { console.error(err); });
  } else {
    res.send({ error: 'You are not the host of this session!' });
  }
};

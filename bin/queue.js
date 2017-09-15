'use strict';

const Promise = require('bluebird');

function trackURIToID(uri) {
  return uri.substring(14, uri.length);
}

/**
 * Finds the number of the currently played song in the given playlist
 * @param session the session to find the currently played song in
 * @param currentPlaybackURIPromise 
 */
function getCurrentlyPlayedSong(session, currentPlaybackURIPromise, spotifyApi) {
  return new Promise((resolve, reject) => {
    const sessionPlaylistTracksPromise =
      spotifyApi.getPlaylistTracks(session.userID, session.playlistID);

    const sessionPlaylistURIsPromise = sessionPlaylistTracksPromise
      .then(data => data.body.items.map(item => item.track.uri))
      .catch(err => console.log(err));

    Promise.all([currentPlaybackURIPromise, sessionPlaylistURIsPromise]).spread(
      (uri, allSessionURIs) => {
        for (let i = 0; i < allSessionURIs.length; i += 1) {
          if (allSessionURIs[i] === uri) {
            resolve(i);
          }
        }
        reject(Error('Currently played song not found in session playlist'));
      });
  });
}

function validatedQueue(req, res, session, playNum, spotifyApi) {
  /*
  queue the track based on whether or not the
  lastQueuedPosition of the session is before or after the current
  play number and whether or not the requested song is in the
  session's playlistTracks
  */

  const parSongURI = req.params.suri;
  const requestIP = req.ip;
  const lastQueuedPosition = session.lastQueuedPosition;
  let repeatPlaylistFlag = false;
  let tempSwap = -1;

  for (let i = 0; i < session.playlistTracks.length; i += 1) {
    if (session.playlistTracks[i].uri === parSongURI) {
      repeatPlaylistFlag = true;
      tempSwap = i;
    }
  }

  if (repeatPlaylistFlag) {
    if (playNum > lastQueuedPosition) {
      spotifyApi.reorderTracksInPlaylist(session.userID, session.playlistID,
        tempSwap, playNum + 1, { range_length: 1 })
        .then(() => spotifyApi.getTrack(trackURIToID(parSongURI)))
        .then((playlistTrackData) => {
          // splice the track in the playlist up to the track
          // number of playNum + 1
          session.playlistTracks.splice(tempSwap, 1);
          session.playlistTracks.splice(playNum + 1, 0, {
            uri: parSongURI,
            isQueued: true,
            artist: playlistTrackData.body.artists[0].name,
            name: playlistTrackData.body.name,
          });
          session.queuedTracks.push({
            uri: parSongURI,
            playlistPosition: playNum + 1,
            queuerIP: requestIP,
          });

          if (!session.guests[requestIP]) {
            session.guests[requestIP] = {
              ip: requestIP,
              lastQueuedPosition: playNum + 1,
            };
          } else {
            session.guests[requestIP].lastQueuedPosition = playNum + 1;
          }
          session.lastQueuedPosition = playNum + 1;
          res.send({ success: true });
        })
        .catch(err => console.error(err));
    } else {
      // splice the track in the playlist up to the track
      // number of lastQueuedPosition + 1
      spotifyApi.reorderTracksInPlaylist(session.userID, session.playlistID,
        tempSwap, lastQueuedPosition + 1, { range_length: 1 })
        .then(() => spotifyApi.getTrack(trackURIToID(parSongURI)))
        .then((playlistTrackData) => {
          // splice the track in the playlist up to the track
          // number of playNum + 1
          session.playlistTracks.splice(tempSwap, 1);
          session.playlistTracks.splice(lastQueuedPosition + 1, 0, {
            uri: parSongURI,
            isQueued: true,
            artist: playlistTrackData.body.artists[0].name,
            name: playlistTrackData.body.name,
          });
          session.queuedTracks.push({
            uri: parSongURI,
            playlistPosition: lastQueuedPosition + 1,
            queuerIP: requestIP,
          });

          if (!session.guests[requestIP]) {
            session.guests[requestIP] = {
              ip: requestIP,
              lastQueuedPosition: lastQueuedPosition + 1,
            };
          } else {
            session.guests[requestIP].lastQueuedPosition = lastQueuedPosition + 1;
          }
          session.lastQueuedPosition += 1;
          res.send({ success: true });
        })
        .catch(err => console.error(err));
    }
  } else if (playNum > lastQueuedPosition) {
    // queue the track at position playNum + 1
    spotifyApi.addTracksToPlaylist(session.userID, session.playlistID, [parSongURI],
      { position: playNum + 1 })
      .then(() => spotifyApi.getTrack(trackURIToID(parSongURI)))
      .then((playlistTrackData) => {
        // add the track to playlistTracks at position playNum + 1
        session.playlistTracks.splice(playNum + 1, 0, {
          uri: parSongURI,
          isQueued: true,
          artist: playlistTrackData.body.artists[0].name,
          name: playlistTrackData.body.name,
        });
        session.queuedTracks.push({
          uri: parSongURI,
          playlistPosition: playNum + 1,
          queuerIP: requestIP,
        });

        if (!session.guests[requestIP]) {
          session.guests[requestIP] = {
            ip: requestIP,
            lastQueuedPosition: playNum + 1,
          };
        } else {
          session.guests[requestIP].lastQueuedPosition = playNum + 1;
        }
        session.lastQueuedPosition = playNum + 1;
        res.send({ success: true });
      })
      .catch(err => console.error(err));
  } else {
    spotifyApi.addTracksToPlaylist(session.userID, session.playlistID, [parSongURI],
      { position: lastQueuedPosition + 1 })
      .then(() => spotifyApi.getTrack(trackURIToID(parSongURI)))
      .then((playlistTrackData) => {
        // splice the track in the playlist up to the track
        // number of playNum + 1
        session.playlistTracks.splice(lastQueuedPosition + 1, 0, {
          uri: parSongURI,
          isQueued: true,
          artist: playlistTrackData.body.artists[0].name,
          name: playlistTrackData.body.name,
        });
        session.queuedTracks.push({
          uri: parSongURI,
          playlistPosition: lastQueuedPosition + 1,
          queuerIP: requestIP,
        });

        if (!session.guests[requestIP]) {
          session.guests[requestIP] = {
            ip: requestIP,
            lastQueuedPosition: lastQueuedPosition + 1,
          };
        } else {
          session.guests[requestIP].lastQueuedPosition = lastQueuedPosition + 1;
        }
        session.lastQueuedPosition += 1;
        res.send({ success: true });
      })
      .catch(err => console.error(err));
  }
}

/** 
Queues a the song represented by songuri in the session represented 
by sessionID
@param sessionid the sessionID of the session to queue the song in
@param songuri the URI of the song to queue
 */
module.exports = function queueTrack(req, res, sessions, spotifyApi) {
  /**
  1. Find the number of the currently played track
  2. If the requester's lastQueuedPosition is higher than that,
    exit with error 'you still have a track in the queue!'
  3. Otherwise, check if the requested track is in the list of
    queued tracks
  4. If it is, exit with error 'that track has already been queued'
  5. Otherwise, queue the track based on whether or not the
    lastQueuedPosition of the session is before or after the current
    play number and whether or not the requested song is in the
    session's playlistTracks
   */

  const parSessionID = req.params.sID;
  const parSongURI = req.params.suri;

  // check if the session exists
  if (Object.keys(sessions).indexOf(parSessionID) === -1) {
    res.status(500).send({ error: 'session does not exist' });
    return;
  }

  // initialize variables from the session
  const session = sessions[parSessionID];
  const accessToken = session.accessToken;
  spotifyApi.setAccessToken(accessToken);

  // 1. Find the number of the currently played track
  const currentPlaybackStatePromise = spotifyApi.getMyCurrentPlaybackState();

  const currentPlaybackURIPromise = currentPlaybackStatePromise.then((data) => {
    if (data.error) {
      console.log('error: ' + data.error);
    } else {
      return data.body.item.uri;
    }
    return data.error;
  });

  let hasBeenQueuedFlag = false;
  const queuedURIs = session.queuedTracks.map(track => track.uri);
  queuedURIs.forEach((uri) => {
    if (uri === parSongURI) {
      hasBeenQueuedFlag = true;
    }
  });

  const currentPlayNumPromise = getCurrentlyPlayedSong(session,
    currentPlaybackURIPromise, spotifyApi);
  Promise.all([currentPlaybackURIPromise, currentPlayNumPromise]).spread(
    (uri, playNum) => {
      if (session.guests[req.ip] && playNum <= session.guests[req.ip].lastQueuedPosition) {
        res.send({ error: 'You can\'t queue a song until after your song has played!' });
      } else if (hasBeenQueuedFlag) {
        res.send({ error: 'You can\'t queue a song that has already been queued!' });
      } else if (uri === parSongURI) {
        res.send({ error: 'You can\'t queue the current song!' });
      } else {
        validatedQueue(req, res, session, playNum, spotifyApi);
      }
    });
};

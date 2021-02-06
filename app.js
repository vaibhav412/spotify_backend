const express = require('express');
const trackRoute = express.Router();
const multer = require('multer');
const mongoose = require("mongoose");
const bodyParser = require("body-parser");

const mongodb = require('mongodb');
const MongoClient = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

const { Readable } = require('stream');
const { RSA_NO_PADDING } = require('constants');
const { runInNewContext } = require('vm');
const app = express();

app.use(bodyParser.json());
app.use('/tracks', trackRoute);

const dbname = "trackdb1";

let db;
MongoClient.connect('mongodb+srv://admin-vasu:test123@cluster0.ha653.mongodb.net', (err, client) => {
  if (err) {
    console.log('MongoDB Connection Error. Please make sure that MongoDB is running.');
    process.exit(1);
  }
  console.log("connected")
  db = client.db(dbname);
});

const mongoURI = "mongodb+srv://admin-vasu:test123@cluster0.ha653.mongodb.net/trackdb1";

const options = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  useCreateIndex: true,
  useFindAndModify: false,
  autoIndex: false, // Don't build indexes
  poolSize: 10, // Maintain up to 10 socket connections
  serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  family: 4 // Use IPv4, skip trying IPv6
};

mongoose.connect(mongoURI, options);
const trackSchema = new mongoose.Schema({
  name : String,
  artist_name: String,
  track: String,
});

const Track = new mongoose.model("Track", trackSchema);

const userSchema = new mongoose.Schema({
  _id: String,
  first_name: String,
  last_name: String,
  username: String,
  password: String,
  role: Number,
  playlists: Array,
});

const User = new mongoose.model("User", userSchema);

const playlistSchema = new mongoose.Schema({
  playlist_name: String,
  tracks: Array,
});

const Playlist = new mongoose.model("Playlist", playlistSchema);

trackRoute.get('/:trackID', (req, res) => {
    try {
      var trackID = new ObjectID(req.params.trackID);
    } catch(err) {
      return res.status(400).json({ message: "Invalid trackID in URL parameter. Must be a single String of 12 bytes or a string of 24 hex characters" }); 
    }
    res.set('content-type', 'audio/mp3');
    res.set('accept-ranges', 'bytes');
  
    let bucket = new mongodb.GridFSBucket(db, {
      bucketName: 'tracks'
    });
  
    let downloadStream = bucket.openDownloadStream(trackID);
  
    downloadStream.on('data', (chunk) => {
      res.write(chunk);
    });
  
    downloadStream.on('error', () => {
      res.sendStatus(404);
    });
  
    downloadStream.on('end', () => {
      res.end();
    });
  });


  trackRoute.get('/all/tracks', (req, res) => {
    Track.find({}, function (err, tracks) {
      res.json(tracks);
    });
  });

  

trackRoute.post('/', (req, res) => {
  const storage = multer.memoryStorage()
  const upload = multer({ storage: storage});
  upload.single('track')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: "Upload Request Validation Failed" });
    } else if(!req.body.name) {
      return res.status(400).json({ message: "No track name in request body" });
    }
    
    let trackName = req.body.name;
    
    // Covert buffer to Readable Stream
    const readableTrackStream = new Readable();
    readableTrackStream.push(req.file.buffer);
    readableTrackStream.push(null);

    let bucket = new mongodb.GridFSBucket(db, {
      bucketName: 'tracks'
    });

    let uploadStream = bucket.openUploadStream(trackName);
    let id = uploadStream.id;
    readableTrackStream.pipe(uploadStream);

    uploadStream.on('error`', () => {
      return res.status(500).json({ message: "Error uploading file" });
    });

    uploadStream.on('finish', () => {
      return res.status(201).json({ message: "File uploaded successfully, stored under Mongo ObjectID: " + id });
    });

    var track = new Track({ 
      name: req.body.name,
      artist_name: req.body.artist_name,
      track: id
    });
  
    track.save(function(err, track) {
      if (err) return console.error(err);
      console.log("Track inserted successfully!");
    });
  });
});

trackRoute.post('/user', (req, res) => {

  var user = new User({
    first_name: req.body.first_name,
    _id: req.body._id
    });
    console.log(user);
    user.save(function(err, user) {
      if (err) return console.error(err);
      console.log("Document inserted successfully!");
    });
  res.send("Document inserted succussfully!");
});

trackRoute.post('/playlist/create/:userID', (req, res) => {

  var userID = req.params.userID;
  var playlist = new Playlist({ playlist_name: req.body.playlist_name});

  playlist.save(function(err, playlist) {
    if (err) return console.error(err);
    console.log("Document inserted successfully!");
  });

  User.findByIdAndUpdate({_id: userID},
    {$push: {playlists: playlist._id}},
    {safe: true, upsert: true},
    function(err, doc) {
        if(err){
        console.log(err);
        }else{
        console.log(doc);
        }
    }
  );
  res.send("Document inserted succussfully!");
});

 
trackRoute.get('/myplaylist/:userID', (req, res) => {

  try {
    var userID = req.params.userID
  } catch(err) {
    return res.status(400).json({ message: "Invalid userID in URL parameter. Must be a single String of 12 bytes or a string of 24 hex characters" }); 
  }

  User.findOne({_id: userID}, function (err, user){
    if(err){
          return res.status.json({
            error: "Could Not Found Any User",
          })
    }

    var playlists = user.playlists;
    var myplaylist = [];
    if(playlists.length == 0){
      res.send("no data found");
    }
    for (let i = 0; i < playlists.length; i++) {

        Playlist.findOne({_id: playlists[i]}, function (err, playlist) {
        myplaylist.push(playlist);
        if (Object.keys(myplaylist).length === playlists.length) res.json(myplaylist);
        });
    }
  });
});

trackRoute.get('/myplaylist/tracks/:playlistID', (req, res) => {

  try {
    var playlistID = req.params.playlistID;
  } catch(err) {
    return res.status(400).json({ message: "Invalid userID in URL parameter. Must be a single String of 12 bytes or a string of 24 hex characters" }); 
  }

  Playlist.findOne({_id: playlistID}, function (err, playlist){
    if(err){
          return res.status.json({
            error: "Could Not Found Any User",
          })
    }

    var tracks = playlist.tracks;
    var mytracks = [];
    if(tracks.length == 0){
      res.send("no data found");
    }
    for (let i = 0; i < tracks.length; i++) {

        Track.findOne({_id: tracks[i]}, function (err, track) {
        mytracks.push(track);
        if (Object.keys(mytracks).length === tracks.length) res.json(mytracks);
        });
    }
  });
});

trackRoute.get('/playlists/all', (req, res) => {
    Playlist.find().exec((err,playlist) => {
      if(err){
        // return res.status(400).json({
        //   error: "No Found"
        // })
      }
      res.json(playlist)
    })
});

trackRoute.post('/addsongtoplaylist', (req, res) => {
  
  Track.findOne({_id: req.body.trackID}, function (err, track) {

    Playlist.findByIdAndUpdate(req.body.playlistID,
      {$push: {tracks: track._id}},
      {safe: true, upsert: true},
      function(err, doc) {
          if(err){
          console.log(err);
          }else{
          console.log(doc);
          }
      }
    );
  })

  res.send("Track added in playlist successfully!");
});

app.listen(process.env.PORT || 3005, () => {
  console.log("App listening on port 3005!");
});